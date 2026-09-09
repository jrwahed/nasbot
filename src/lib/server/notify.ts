import 'server-only'
import nodemailer from 'nodemailer'
import type { Transporter } from 'nodemailer'
import { admin } from '@/lib/server/supabase-admin'

/**
 * ============================================================
 *  إشعارات الشغل بالإيميل — المصرف المؤقت لطابور notifications
 *
 *  المهام والمحفّزات في القاعدة بتكتب صفوف في `notifications` بقناة
 *  `whatsapp` وحالة `queued`. واتساب لسه مش متفعّل (مفيش مفاتيح Meta)،
 *  فالصفوف دي بتفضل واقفة للأبد. الإيميل شغّال (SMTP جيميل)، فالملف ده
 *  بياخد صفوف `work_*` بس، يركّب نص القالب العربي بالـ payload، ويبعته
 *  إيميل، ويقفل الصف.
 *
 *  ليه مش في mailer.ts؟ الملف ده ملك وكيل تاني وما ينفعش نعدّله دلوقتي —
 *  فبنعمل نفس اتصال SMTP هنا بنفس متغيّرات البيئة ونفس معالجة كلمة مرور
 *  جيميل (بتيجي بمسافات). لو mailer.ts اتفتح للتعديل بعدين، الحتة دي
 *  المفروض تتنقل هناك (شوف التقرير).
 *
 *  ما بيلمسش إشعارات غير الشغل: أي `template_key` مش مبدوء بـ `work_`
 *  بيفضل مكانه لحد ما قناة واتساب تشتغل.
 * ============================================================
 */

/** أقصى عدد صفوف في النداء الواحد — المسار بيتنادى كل ساعة */
const BATCH = 20
/** بعد كده الصف بيتقفل failed وما بيتحاولش تاني */
const MAX_ATTEMPTS = 3
/** مهلة النداء كله — maxDuration على المسار 30 ثانية */
const DEADLINE_MS = 22_000

/* ============================================================ الإيميل */

/** بيشيل المسافات وعلامات التنصيص اللي بتيجي من النسخ واللزق — نفس clean في mailer.ts */
function clean(v: string | undefined): string | undefined {
  const t = v?.trim().replace(/^["']|["']$/g, '')
  return t || undefined
}

const RESEND_KEY = clean(process.env.RESEND_API_KEY)
const SMTP_HOST = clean(process.env.SMTP_HOST)
const SMTP_USER = clean(process.env.SMTP_USER)
// جوجل بتعرض كلمة مرور التطبيق بمسافات (abcd efgh ijkl mnop) والناس بتنسخها كده،
// وSMTP بيرفضها بالمسافات. نفس معالجة mailer.ts بالحرف.
const SMTP_PASS = (() => {
  const raw = clean(process.env.SMTP_PASS)
  return raw && /gmail|google/i.test(SMTP_HOST ?? '') ? raw.replace(/\s+/g, '') : raw
})()

function from(): string {
  return (
    clean(process.env.MAIL_FROM) ||
    (SMTP_USER ? `نسبوط <${SMTP_USER}>` : 'نسبوط <onboarding@resend.dev>')
  )
}

export function notifyMailConfigured(): boolean {
  return Boolean(RESEND_KEY || (SMTP_HOST && SMTP_USER && SMTP_PASS))
}

/** ترانسبورت واحد لكل الرسايل في النداء — 20 اتصال SMTP منفصل كان هيتعدّى المهلة */
function smtpTransport(): Transporter {
  const port = Number(process.env.SMTP_PORT ?? 465)
  return nodemailer.createTransport({
    host: SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: SMTP_USER as string, pass: SMTP_PASS as string },
    pool: true,
    maxConnections: 2,
    connectionTimeout: 8_000,
    greetingTimeout: 8_000,
    socketTimeout: 12_000,
  })
}

interface SendOut {
  ok: boolean
  ref?: string
  error?: string
}

/**
 * إرسال رسالة عامة — نفس ترتيب mailer.ts: Resend الأول لو مظبوط، وإلا SMTP.
 * (mailer.ts فيه sendAuthCodeEmail بس، ونصها مثبّت على رمز الدخول.)
 */
async function sendMail(
  tx: Transporter | null,
  to: string,
  subject: string,
  text: string,
  html: string
): Promise<SendOut> {
  if (RESEND_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${RESEND_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from: from(), to, subject, text, html }),
      })
      const json = (await res.json().catch(() => ({}))) as { id?: string; message?: string }
      return res.ok ? { ok: true, ref: json.id } : { ok: false, error: json.message ?? 'فشل الإرسال' }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }

  if (tx) {
    try {
      const info = await tx.sendMail({ from: from(), to, subject, text, html })
      return { ok: true, ref: info.messageId }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }

  return { ok: false, error: 'مفيش مزوّد إيميل متظبط' }
}

function shell(bodyText: string, link: string | null): string {
  const cta = link
    ? `<div style="margin-top:20px"><a href="${link}" style="display:inline-block;background:#F4632A;color:#14161A;font-weight:900;text-decoration:none;padding:12px 22px;border-radius:999px">افتح نسبوط</a></div>`
    : ''
  return `<!doctype html>
<html lang="ar" dir="rtl">
  <body style="margin:0;padding:24px;background:#f6f4ef;font-family:'Segoe UI',Tahoma,system-ui,sans-serif;color:#1a1a1a">
    <div style="max-width:460px;margin:0 auto;background:#fff;border-radius:16px;padding:28px 24px;text-align:right">
      <div style="font-size:22px;font-weight:900;color:#f26b1d;margin-bottom:16px">نسبوط</div>
      <div style="font-size:17px;line-height:1.9">${escapeHtml(bodyText)}</div>
      ${cta}
      <div style="font-size:13px;color:#666;margin-top:22px;line-height:1.7">
        وصلتك الرسالة دي لأنك مشترك في سبوطات الشغل. لو مش عايز، رد علينا وهنوقفها.
      </div>
    </div>
  </body>
</html>`
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/* ============================================================ تركيب النص */

const SITE = (
  clean(process.env.NEXT_PUBLIC_SITE_URL) ?? 'https://nasbot.app'
).replace(/\/+$/, '')

/** لو الـ payload مفيهوش link، كل قالب ليه صفحته المنطقية */
const DEFAULT_PATH: Record<string, string> = {
  work_recurring_booked: '/me/shoghl',
  work_no_pass_balance: '/me/shoghl',
  work_pass_low: '/shoghl/pass',
  work_pass_expiring: '/shoghl/pass',
  work_pass_activated: '/shoghl',
  work_collab_match: '/me/shoghl',
  work_venue_changed: '/me/shoghl',
  work_first_time_offer: '/shoghl',
}

/** عناوين الرسايل — النص العربي نفسه جوه القالب في القاعدة */
const SUBJECT: Record<string, string> = {
  work_recurring_booked: 'حجزنا يومك الثابت',
  work_no_pass_balance: 'معادك جه وكارتك خلص',
  work_pass_low: 'فاضل في كارتك يوم واحد',
  work_pass_expiring: 'كارتك قرب ينتهي',
  work_pass_activated: 'كارتك اتفعّل',
  work_collab_match: 'في حد عايز يشتغل معاك',
  work_venue_changed: 'مكان سبوطة الشغل اتغيّر',
  work_first_time_offer: 'سبوطة شغل — أول مرة بـ 60',
}

const DAYS_AR = ['الحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت']

/**
 * التواريخ في الـ payload بتيجي YYYY-MM-DD (تاريخ يوم، مش لحظة) — بنعرضها
 * «الاتنين 15 سبتمبر». بنحسبها على UTC عن قصد علشان اليوم ما يزحفش.
 */
function arabicDay(v: string): string {
  const [y, m, d] = v.split('-').map(Number)
  const at = new Date(Date.UTC(y, m - 1, d))
  if (Number.isNaN(at.getTime())) return v
  const rest = at.toLocaleDateString('ar-EG', {
    timeZone: 'UTC',
    day: 'numeric',
    month: 'long',
  })
  return `${DAYS_AR[at.getUTCDay()]} ${rest}`
}

/**
 * القوالب في 0044 بتستعمل أقواس مفردة: {day} · {venue} · {link} · {n} · {days} · {name}.
 * أي مفتاح ما لقيناش قيمته بيتشال من النص بدل ما العضو يشوف «{link}»،
 * وبنلمّ ورا نفسنا الشرطة أو المسافة اللي بتفضل مكانه.
 */
export function renderTemplate(
  body: string,
  vars: Record<string, string>
): { text: string; missing: string[] } {
  const missing: string[] = []
  const text = body
    .replace(/\{([a-z_]+)\}/gi, (_m, k: string) => {
      const v = vars[k]
      if (v === undefined || v === '') {
        missing.push(k)
        return ''
      }
      return v
    })
    .replace(/\s*—\s*(?=[،.؟!])/g, '')
    .replace(/\s*—\s*$/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([،.؟!])/g, '$1')
    .trim()
  return { text, missing }
}

/* ============================================================ الطابور */

interface Row {
  id: string
  profile_id: string | null
  template_key: string | null
  payload: Record<string, unknown> | null
  attempts: number
}

export interface WorkNotifyResult {
  /** الصفوف اللي اتسحبت من الطابور */
  picked: number
  sent: number
  failed: number
  /** اتسابت لنداء تاني (المهلة خلصت) */
  left: number
  errors: string[]
}

/**
 * بتاخد لحد 20 إشعار شغل واقف في الطابور وتبعتهم إيميل.
 * بترجّع ملخّص — والمسار بيرجّعه زي ما هو علشان يتقرا من السجل.
 */
export async function runWorkNotify(limit = BATCH): Promise<WorkNotifyResult> {
  const out: WorkNotifyResult = { picked: 0, sent: 0, failed: 0, left: 0, errors: [] }
  const db = admin()

  const { data, error } = await db
    .from('notifications')
    .select('id, profile_id, template_key, payload, attempts')
    .eq('status', 'queued')
    // بنسحب بـ work% (من غير escape للـ underscore علشان ما نعتمدش على
    // طريقة PostgREST في تمرير \_) وبنصفّي بدقة تحت على work_
    .like('template_key', 'work%')
    .lt('attempts', MAX_ATTEMPTS)
    .lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(Math.max(1, Math.min(limit, BATCH)))

  if (error) {
    out.errors.push(`قراءة الطابور وقعت: ${error.message}`)
    return out
  }

  const rows = (data ?? []) as Row[]
  out.picked = rows.length
  if (!rows.length) return out

  // القوالب والإيميلات — نداءين بس مهما كان عدد الصفوف
  const keys = [...new Set(rows.map((r) => r.template_key).filter((k): k is string => !!k))]
  const ids = new Set<string>()
  for (const r of rows) {
    if (r.profile_id) ids.add(r.profile_id)
    const other = r.payload?.other_id
    if (typeof other === 'string') ids.add(other)
  }

  const [tplRes, pplRes] = await Promise.all([
    db.from('notification_templates').select('key, body_ar, is_active').in('key', keys),
    db.from('profiles').select('id, email, first_name, deleted_at').in('id', [...ids]),
  ])

  const templates = new Map<string, { body: string; active: boolean }>()
  for (const t of (tplRes.data ?? []) as {
    key: string
    body_ar: string
    is_active: boolean
  }[]) {
    templates.set(t.key, { body: t.body_ar, active: t.is_active })
  }

  const people = new Map<string, { email: string | null; firstName: string; deleted: boolean }>()
  for (const p of (pplRes.data ?? []) as {
    id: string
    email: string | null
    first_name: string | null
    deleted_at: string | null
  }[]) {
    people.set(p.id, {
      email: p.email,
      firstName: (p.first_name ?? '').trim(),
      deleted: Boolean(p.deleted_at),
    })
  }

  const tx = !RESEND_KEY && SMTP_HOST && SMTP_USER && SMTP_PASS ? smtpTransport() : null
  const started = Date.now()

  for (const row of rows) {
    if (Date.now() - started > DEADLINE_MS) {
      out.left += 1
      continue
    }

    const key = row.template_key ?? ''
    if (!key.startsWith('work_')) continue // مش بتاعنا — نسيبه للقناة بتاعته
    const tpl = templates.get(key)
    const me = row.profile_id ? people.get(row.profile_id) : undefined
    const email = me?.email ?? null

    // أسباب ما بتتصلّحش بإعادة المحاولة — بنقفل الصف على طول
    const dead =
      !tpl ? `مفيش قالب باسم ${key}`
      : !tpl.active ? 'القالب متوقف'
      : !me ? 'مفيش ملف للعضو'
      : me.deleted ? 'الملف اتمسح'
      : !email ? 'مفيش إيميل على الملف'
      : email.endsWith('@phone.nasbot.app') ? 'الإيميل اصطناعي — مفيش إيميل حقيقي'
      : null

    if (dead !== null || !tpl || !email) {
      const why = dead ?? 'بيانات ناقصة'
      await close(db, row, false, why)
      out.failed += 1
      out.errors.push(`${row.id}: ${why}`)
      continue
    }

    const payload = row.payload ?? {}
    const vars: Record<string, string> = {}
    for (const [k, v] of Object.entries(payload)) {
      if (v === null || v === undefined) continue
      vars[k] = typeof v === 'object' ? JSON.stringify(v) : String(v)
    }
    if (vars.day && /^\d{4}-\d{2}-\d{2}$/.test(vars.day)) vars.day = arabicDay(vars.day)
    if (!vars.name && typeof payload.other_id === 'string') {
      vars.name = people.get(payload.other_id)?.firstName || 'حد'
    }
    const link = vars.link || `${SITE}${DEFAULT_PATH[key] ?? '/me/shoghl'}`
    vars.link = link

    const { text: bodyText, missing } = renderTemplate(tpl.body, vars)
    if (missing.length) out.errors.push(`${row.id}: نقص في الـ payload (${missing.join('، ')})`)
    const subject = SUBJECT[key] ?? 'نسبوط'
    const res = await sendMail(tx, email, subject, bodyText, shell(bodyText, link))

    if (res.ok) {
      await close(db, row, true, null, res.ref)
      out.sent += 1
    } else {
      const last = row.attempts + 1 >= MAX_ATTEMPTS
      await close(db, row, false, res.error ?? 'فشل الإرسال', undefined, !last)
      out.failed += 1
      out.errors.push(`${row.id}: ${res.error ?? 'فشل الإرسال'}`)
    }
  }

  tx?.close()
  return out
}

/**
 * قفل الصف.
 *   نجح            → status = sent · sent_at = دلوقتي · provider_ref
 *   فشل ولسه فاضل  → يفضل queued بمحاولة زيادة (المسار بيرجع تاني بعد ساعة)
 *   فشل خلاص       → status = failed — مفيش لف لا نهائي
 */
async function close(
  db: ReturnType<typeof admin>,
  row: Row,
  ok: boolean,
  reason: string | null,
  ref?: string,
  retry = false
): Promise<void> {
  const patch: Record<string, unknown> = { attempts: row.attempts + 1 }
  if (ok) {
    patch.status = 'sent'
    patch.sent_at = new Date().toISOString()
    patch.error = null
    if (ref) patch.provider_ref = ref
  } else {
    patch.status = retry ? 'queued' : 'failed'
    patch.error = (reason ?? 'فشل الإرسال').slice(0, 300)
  }
  await db.from('notifications').update(patch).eq('id', row.id)
}
