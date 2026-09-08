/**
 * فحص صلاحيات اللوحة من غير متصفح.
 *
 * بيدخل برقم الاختبار المعلن في .env.local، وبيعمل نفس العمليات
 * اللي صفحات اللوحة بتعملها — علشان نتأكد إن RLS بتسمح للأدمن
 * وبتمنع الزائر. الفحص بيرجّع كل حاجة زي ما كانت في الآخر.
 */
import { readFileSync } from 'node:fs'
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

async function main() {
  // بننضّف أكواد رقم الاختبار الأول — حد المعدل 3 إرسالات في الساعة،
  // ولو فحص تاني اشتغل قبلنا هنقع على 429 من غير سبب حقيقي.
  const svcPre = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
  await svcPre.from('otp_codes').delete().eq('phone', PHONE)

  // ===== الزائر: المفروض يقرا ومايكتبش =====
  const guest = createClient(URL_, ANON, { auth: { persistSession: false } })

  const gRead = await guest.from('copy_strings').select('key').limit(1)
  ok('الزائر بيقرا النصوص', !gRead.error && (gRead.data?.length ?? 0) > 0)

  const gWrite = await guest
    .from('copy_strings')
    .update({ value_ar: 'اختراق' })
    .eq('key', 'home.text.3')
    .select()
  ok('الزائر مش بيقدر يكتب نص', (gWrite.data?.length ?? 0) === 0)

  const gGame = await guest
    .from('game_questions')
    .update({ question_ar: 'اختراق' })
    .eq('order', 1)
    .select()
  ok('الزائر مش بيقدر يعدّل اللعبة', (gGame.data?.length ?? 0) === 0)

  const gAdmins = await guest.from('admin_users').select('profile_id')
  ok('الزائر مش بيشوف حسابات الإدارة', (gAdmins.data?.length ?? 0) === 0)

  // ===== الدخول برقم الاختبار =====
  const send = await fetch(`${SITE}/api/otp/send`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: PHONE }),
  })
  if (!send.ok) {
    console.error(`✗ مقدرناش نبعت الرمز (${send.status}) — الفحص وقف`)
    process.exit(1)
  }

  const verify = await fetch(`${SITE}/api/otp/verify`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ phone: PHONE, code: '1234' }),
  })
  const vj = (await verify.json()) as { token_hash?: string; error?: string }
  if (!vj.token_hash) {
    console.error(`✗ الدخول فشل: ${vj.error ?? verify.status} — الفحص وقف`)
    process.exit(1)
  }

  const as = createClient(URL_, ANON, { auth: { persistSession: false } })
  const { error: sErr } = await as.auth.verifyOtp({
    token_hash: vj.token_hash,
    type: 'magiclink',
  })
  ok('دخلنا برقم الاختبار', !sErr, sErr?.message)
  if (sErr) process.exit(1)

  // ===== الأدمن: الصلاحيات =====
  const perms = await as.rpc('fn_has_permission', { p_key: 'content.edit' })
  ok('عنده صلاحية تعديل النصوص', perms.data === true)

  const gamePerm = await as.rpc('fn_has_permission', { p_key: 'game.edit' })
  ok('عنده صلاحية تعديل اللعبة', gamePerm.data === true)

  const me = await as.from('admin_users').select('role_key').maybeSingle()
  ok('بيشوف دوره', (me.data as { role_key?: string } | null)?.role_key === 'owner')

  // ===== تعديل نص ورجوعه =====
  const before = await as
    .from('copy_strings')
    .select('value_ar')
    .eq('key', 'home.text.3')
    .single()
  const original = (before.data as { value_ar: string }).value_ar

  const upd = await as
    .from('copy_strings')
    .update({ value_ar: original + ' (فحص)' })
    .eq('key', 'home.text.3')
    .select()
  ok('الأدمن بيعدّل النص', (upd.data?.length ?? 0) === 1, upd.error?.message)

  const hist = await as
    .from('copy_history')
    .select('value_ar')
    .eq('copy_key', 'home.text.3')
    .order('changed_at', { ascending: false })
    .limit(1)
  ok(
    'النسخة القديمة اتسجّلت لوحدها',
    (hist.data as { value_ar: string }[] | null)?.[0]?.value_ar === original
  )

  await as.from('copy_strings').update({ value_ar: original }).eq('key', 'home.text.3')
  const after = await as
    .from('copy_strings')
    .select('value_ar')
    .eq('key', 'home.text.3')
    .single()
  ok('رجّعنا النص زي ما كان', (after.data as { value_ar: string }).value_ar === original)

  // ===== تعديل اللعبة ورجوعها =====
  // ملاحظة: ما ينفعش نفلتر بـ eq('order', 1) — «order» اسم محجوز في PostgREST
  // وبيتفهم على إنه ترتيب مش فلتر. بنرتّب وناخد الأول.
  const q1 = await as
    .from('game_questions')
    .select('id, question_ar')
    .order('order')
    .limit(1)
    .single()
  const qRow = q1.data as { id: string; question_ar: string }

  const qUpd = await as
    .from('game_questions')
    .update({ question_ar: qRow.question_ar + ' (فحص)' })
    .eq('id', qRow.id)
    .select()
  ok('الأدمن بيعدّل سؤال', (qUpd.data?.length ?? 0) === 1, qUpd.error?.message)

  await as.from('game_questions').update({ question_ar: qRow.question_ar }).eq('id', qRow.id)

  // نقطة في شبكة الحساب
  const opt = await as
    .from('game_options')
    .select('id')
    .eq('question_id', qRow.id)
    .order('order')
    .limit(1)
    .single()
  const optId = (opt.data as { id: string }).id

  const sc = await as
    .from('game_option_scores')
    .upsert({ option_id: optId, type_key: 'energy', points: 1 }, { onConflict: 'option_id,type_key' })
    .select()
  ok('الأدمن بيغيّر نقطة في الشبكة', (sc.data?.length ?? 0) === 1, sc.error?.message)

  await as.from('game_option_scores').delete().eq('option_id', optId).eq('type_key', 'energy')

  // ===== تبطيل الكاش من اللوحة =====
  const { data: sess } = await as.auth.getSession()
  const rev = await fetch(`${SITE}/api/admin/revalidate`, {
    method: 'POST',
    headers: { authorization: `Bearer ${sess.session?.access_token}` },
  })
  ok('اللوحة بتقدر تبطّل الكاش', rev.ok, String(rev.status))

  const revNoAuth = await fetch(`${SITE}/api/admin/revalidate`, { method: 'POST' })
  ok('التبطيل مقفول من غير توكن', revNoAuth.status === 401)

  const { data: meUser } = await as.auth.getUser()
  const adminProfileId = meUser.user!.id

  // ===== دوال الفلوس =====
  // بنتأكد إن الصلاحية عدّت وإن التحقق من المدخلات شغّال — من غير ما نحرّك فلوس.
  const badRefund = await as.rpc('fn_issue_refund', {
    p_payment_id: '00000000-0000-0000-0000-000000000000',
    p_amount: 100,
    p_kind: 'gateway',
    p_reason: 'فحص',
  })
  ok(
    'الاسترداد بيرفض دفعة مش موجودة',
    (badRefund.error?.message ?? '').includes('مش موجودة'),
    badRefund.error?.message
  )

  const zeroRefund = await as.rpc('fn_issue_refund', {
    p_payment_id: '00000000-0000-0000-0000-000000000000',
    p_amount: 0,
    p_kind: 'gateway',
    p_reason: 'فحص',
  })
  ok(
    'الاسترداد بيرفض مبلغ صفر',
    (zeroRefund.error?.message ?? '').includes('أكبر من صفر'),
    zeroRefund.error?.message
  )

  const negWallet = await as.rpc('fn_wallet_adjust', {
    p_profile_id: adminProfileId,
    p_delta: -999999999,
    p_reason: 'admin_adjust',
    p_note: 'فحص',
  })
  ok(
    'المحفظة بترفض تنزل تحت الصفر',
    (negWallet.error?.message ?? '').includes('مش هيكفي'),
    negWallet.error?.message
  )

  // ===== الأدوار: اللي مش من حقه لازم يترفض على الخادم =====
  // بنغيّر دور حساب الاختبار مؤقتًا لـ support (أقل دور) ونتأكد إن القاعدة
  // بترفض الأفعال اللي مش من حقه — مش إخفاء الزرار بس. وبعدين بنرجّعه owner.
  const svcRole = createClient(URL_, process.env.SUPABASE_SERVICE_ROLE_KEY!, {
    auth: { persistSession: false },
  })
  const { data: roleRow } = await svcRole
    .from('admin_users')
    .select('role_key')
    .eq('profile_id', adminProfileId)
    .single()
  const originalRole = (roleRow as unknown as { role_key: string } | null)?.role_key ?? 'owner'

  await svcRole.from('admin_users').update({ role_key: 'support' }).eq('profile_id', adminProfileId)

  try {
    const canContent = await as.rpc('fn_has_permission', { p_key: 'content.edit' })
    ok('support مالوش صلاحية تعديل النصوص', canContent.data === false)

    const denied = await as
      .from('copy_strings')
      .update({ value_ar: 'المفروض ده يترفض' })
      .eq('key', 'home.text.3')
      .select()
    ok('support مش بيقدر يعدّل نص فعليًا', (denied.data?.length ?? 0) === 0)

    const deniedGame = await as
      .from('personality_types')
      .update({ line_ar: 'المفروض ده يترفض' })
      .eq('key', 'explorer')
      .select()
    ok('support مش بيقدر يعدّل اللعبة', (deniedGame.data?.length ?? 0) === 0)

    const deniedFields = await as
      .from('profile_fields')
      .update({ label_ar: 'المفروض ده يترفض' })
      .eq('key', 'first_name')
      .select()
    ok('support مش بيقدر يعدّل حقول التسجيل', (deniedFields.data?.length ?? 0) === 0)
  } finally {
    // مهم: نرجّع الدور مهما حصل، وإلا حساب الاختبار يفضل ناقص صلاحيات
    await svcRole
      .from('admin_users')
      .update({ role_key: originalRole })
      .eq('profile_id', adminProfileId)
  }

  const backAgain = await as.rpc('fn_has_permission', { p_key: 'content.edit' })
  ok('الدور رجع زي ما كان', backAgain.data === true)

  // ===== مفاتيح الصلاحيات في السياسات =====
  // سياسة بتنادي مفتاح مش موجود بتقفل الجدول على الكل من غير ما حد ياخد باله.
  const refs = await svcRole.rpc('check_permission_refs')
  const broken = (refs.data ?? []) as { key: string; problem: string }[]
  ok(
    'كل مفاتيح الصلاحيات في السياسات سليمة',
    !refs.error && broken.length === 0,
    broken.map((b) => `${b.key}: ${b.problem}`).join(' · ') || refs.error?.message
  )

  console.log(`\n${pass} تمام · ${fail} فشل`)
  process.exit(fail ? 1 : 0)
}

main()
