/**
 * فحص دخول اللوحة من الآخر للآخر: رقم → رمز واتساب → تفعيل التحقق بخطوتين →
 * كود TOTP → جلسة إدارة صالحة.
 *
 * الفحص بيولّد كود TOTP بنفسه (RFC 6238) علشان يقلّد تطبيق المصادقة.
 * أرقام الاختبار شغالة في التطوير بس — في الإنتاج isTestPhone بترجّع false.
 *
 * التشغيل: npx tsx scripts/check-admin-login.ts
 */
import { readFileSync } from 'node:fs'
import { createHmac } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'

for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const PHONE = (process.env.TEST_PHONE_ALLOWLIST ?? '').split(',')[0].trim()
const SITE = process.env.SITE_URL ?? 'http://localhost:3210'

let pass = 0
let fail = 0
const ok = (name: string, good: boolean, extra = '') => {
  console.log(`${good ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`)
  good ? pass++ : fail++
}

/* ---------------------------------------------------------- TOTP */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/=+$/, '').replace(/\s/g, '')
  let bits = 0
  let value = 0
  const out: number[] = []
  for (const ch of clean) {
    const idx = B32.indexOf(ch)
    if (idx < 0) continue
    value = (value << 5) | idx
    bits += 5
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff)
      bits -= 8
    }
  }
  return Buffer.from(out)
}

/** كود TOTP لـ 6 خانات، خطوة 30 ثانية — نفس اللي التطبيق بيعمله */
function totpCode(secret: string, atMs = Date.now()): string {
  const counter = Math.floor(atMs / 1000 / 30)
  const buf = Buffer.alloc(8)
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0)
  buf.writeUInt32BE(counter >>> 0, 4)
  const hmac = createHmac('sha1', base32Decode(secret)).update(buf).digest()
  const offset = hmac[hmac.length - 1] & 0x0f
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff)
  return String(bin % 1_000_000).padStart(6, '0')
}

/* ---------------------------------------------------------- كوكيز */

/** خزنة كوكيز بسيطة — fetch في node ما بيحتفظش بيها لوحده */
const jar = new Map<string, string>()
const cookieHeader = () =>
  [...jar.entries()].map(([k, v]) => `${k}=${v}`).join('; ')

function absorb(res: Response) {
  const raw = res.headers.getSetCookie?.() ?? []
  for (const c of raw) {
    const [pair] = c.split(';')
    const i = pair.indexOf('=')
    if (i < 0) continue
    const name = pair.slice(0, i).trim()
    const val = pair.slice(i + 1).trim()
    if (!val || /expires=Thu, 01 Jan 1970/i.test(c)) jar.delete(name)
    else jar.set(name, val)
  }
}

async function post(path: string, body: unknown) {
  const res = await fetch(`${SITE}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', cookie: cookieHeader() },
    body: JSON.stringify(body),
  })
  absorb(res)
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return { status: res.status, json }
}

/* ---------------------------------------------------------- الفحص */

async function main() {
  const svc = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })

  // نظّف حد المعدل وأي تفعيل قديم علشان الفحص يبدأ من نقطة معروفة
  await svc.from('otp_codes').delete().eq('phone', PHONE)
  await svc.from('audit_log').delete().eq('entity', 'admin_login')

  const { data: prof } = await svc
    .from('profiles')
    .select('id')
    .eq('phone', PHONE)
    .single()
  const uid = (prof as { id: string }).id

  await svc
    .from('admin_users')
    .update({ totp_secret: null, totp_enabled_at: null })
    .eq('profile_id', uid)

  // ===== 1. اللوحة مقفولة من غير دخول =====
  const guard = await fetch(`${SITE}/admin/settings`, { redirect: 'manual' })
  ok(
    'اللوحة بتحوّل لصفحة الدخول من غير جلسة',
    guard.status === 307 || guard.status === 302,
    String(guard.status)
  )

  const loginPage = await fetch(`${SITE}/admin/login`)
  ok('صفحة الدخول نفسها مفتوحة', loginPage.status === 200)

  // ===== 2. الرقم والرمز =====
  const start = await post('/api/admin/login', { action: 'start', phone: PHONE })
  ok('طلبنا الرمز', start.status === 200, JSON.stringify(start.json).slice(0, 80))

  const otp = await post('/api/admin/login', {
    action: 'otp',
    phone: PHONE,
    code: '1234',
  })
  const tokenHash = otp.json.token_hash as string | undefined
  ok('الرمز اتقبل ورجّع توكن', Boolean(tokenHash))
  if (!tokenHash) return finish()

  // المتصفح بيفتح جلسة سوبابيس بالتوكن ده
  const sb = createClient(URL_, ANON, { auth: { persistSession: false } })
  const { data: sess, error: vErr } = await sb.auth.verifyOtp({
    token_hash: tokenHash,
    type: 'magiclink',
  })
  ok('الجلسة اتفتحت بـ magiclink', !vErr && Boolean(sess.session), vErr?.message)
  if (!sess.session) return finish()

  // نحط كوكي سوبابيس زي ما @supabase/ssr بيعمل علشان الخادم يشوف الجلسة
  const ref = new URL(URL_).hostname.split('.')[0]
  const val = 'base64-' + Buffer.from(JSON.stringify(sess.session)).toString('base64')
  const CH = 3180
  if (val.length <= CH) jar.set(`sb-${ref}-auth-token`, encodeURIComponent(val))
  else {
    for (let i = 0, n = 0; i < val.length; i += CH, n++) {
      jar.set(`sb-${ref}-auth-token.${n}`, encodeURIComponent(val.slice(i, i + CH)))
    }
  }

  // ===== 3. من غير TOTP مفيش دخول =====
  const noTotp = await post('/api/admin/login', { action: 'totp', code: '000000' })
  ok(
    'من غير تفعيل، بيوديني للتفعيل',
    noTotp.json.next === 'enrol',
    JSON.stringify(noTotp.json).slice(0, 80)
  )

  // ===== 4. التفعيل لأول مرة =====
  const begin = await post('/api/admin/totp', { action: 'begin' })
  const secret = begin.json.secret as string | undefined
  ok('التفعيل رجّع سر', Boolean(secret) && String(begin.json.uri ?? '').startsWith('otpauth://'))
  if (!secret) return finish()

  const badConfirm = await post('/api/admin/totp', { action: 'confirm', code: '000000' })
  ok('كود غلط في التفعيل بيترفض', badConfirm.status >= 400 || badConfirm.json.ok !== true)

  const confirm = await post('/api/admin/totp', {
    action: 'confirm',
    code: totpCode(secret),
  })
  ok('التفعيل اتم بكود صح', confirm.json.ok === true, JSON.stringify(confirm.json).slice(0, 80))

  // ===== 5. الدخول بالكود =====
  const wrong = await post('/api/admin/login', { action: 'totp', code: '000000' })
  ok('كود غلط بيترفض', wrong.json.ok !== true)

  // الخطوة اللي فاتت اتسجّلت كمحاولة فاشلة — ننضف علشان حد المعدل
  await svc.from('audit_log').delete().eq('entity', 'admin_login')

  const good = await post('/api/admin/login', { action: 'totp', code: totpCode(secret) })
  ok('الدخول تم بالكود الصح', good.json.ok === true, JSON.stringify(good.json).slice(0, 90))

  const hasAdminCookie = [...jar.keys()].some((k) => k.startsWith('nb_admin'))
  ok('كوكي جلسة الإدارة اتحطت', hasAdminCookie, [...jar.keys()].join(','))

  // ===== 6. اللوحة بقت مفتوحة =====
  const after = await fetch(`${SITE}/admin/settings`, {
    headers: { cookie: cookieHeader() },
    redirect: 'manual',
  })
  ok('اللوحة فتحت بعد الدخول', after.status === 200, String(after.status))

  // ===== 6ب. كل أقسام اللوحة بتفتح =====
  const SECTIONS = [
    '', 'content', 'game', 'profile-fields', 'templates', 'sbotat',
    'bookings', 'matching', 'people', 'captains', 'payments',
    'reports', 'notifications', 'map', 'settings', 'audit',
  ]
  const broken: string[] = []
  for (const s of SECTIONS) {
    const path = s ? `/admin/${s}` : '/admin'
    const res = await fetch(`${SITE}${path}`, {
      headers: { cookie: cookieHeader() },
      redirect: 'manual',
    })
    const html = res.status === 200 ? await res.text() : ''
    // الصفحة اللي بتقع في Next بتطبع الكلام ده في الـ HTML
    const crashed =
      html.includes('Application error') ||
      html.includes('This page could not be found')
    if (res.status !== 200 || crashed) {
      broken.push(`${path}(${crashed ? 'وقعت' : res.status})`)
    }
  }
  ok(`كل أقسام اللوحة (${SECTIONS.length}) بتفتح`, broken.length === 0, broken.join(' · '))

  // ===== 7. الخروج بيقفلها تاني =====
  await post('/api/admin/login', { action: 'logout' })
  const afterOut = await fetch(`${SITE}/admin/settings`, {
    headers: { cookie: cookieHeader() },
    redirect: 'manual',
  })
  ok(
    'بعد الخروج بترجع مقفولة',
    afterOut.status === 307 || afterOut.status === 302,
    String(afterOut.status)
  )

  finish()
}

function finish() {
  console.log(`\n${pass} تمام · ${fail} فشل`)
  process.exit(fail ? 1 : 0)
}

main()
