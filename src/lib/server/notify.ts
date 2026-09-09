import 'server-only'
import nodemailer from 'nodemailer'
import { admin } from '@/lib/server/supabase-admin'

/**
 * مصرف الإشعارات — بيسحب صفوف `notifications` اللي حالتها `queued` وبيبعتها بالإيميل.
 *
 * قديمًا كان بيسحب `template_key like 'work%'` بس، فكل الإشعارات التانية
 * (`booking_confirmed` · `group_reveal` · التذكيرات · `mutual_match` …) كانت
 * بتفضل في الطابور للأبد (REVIEW_DB D5 / D31). دلوقتي بيسحب **كل** الصفوف اللي
 * قالبها موجود ونشط، وبيرندر الشكلين: الأسماء `{key}` (قوالب الشغل) والمواضع
 * `{{1}}` (القوالب الأساسية بصيغة قوالب واتساب).
 *
 * القناة الوحيدة المنفّذة هنا هي الإيميل (زي ما كان). القالب ممكن يكون معلّم
 * `whatsapp` بس بنبعته إيميل — ده سلوك موروث ومقصود لحد ما إرسال واتساب يتوصّل.
 */

/* ==========================================================================
 *  مزوّد الإيميل — نفس منطق mailer.ts بالظبط بس مكتفي بذاته
 *  (mailer.ts مش من ملكيتنا فما بنعدّلوش — والمصرف لازم يبعت أي موضوع مش رمز بس)
 * ========================================================================== */

function clean(v: string | undefined): string | undefined {
  const t = v?.trim().replace(/^["']|["']$/g, '')
  return t || undefined
}

const RESEND_KEY = clean(process.env.RESEND_API_KEY)
const SMTP_HOST = clean(process.env.SMTP_HOST)
const SMTP_USER = clean(process.env.SMTP_USER)
const SMTP_PASS = (() => {
  const raw = clean(process.env.SMTP_PASS)
  return raw && /gmail|google/i.test(SMTP_HOST ?? '') ? raw.replace(/\s+/g, '') : raw
})()

/** أي مزوّد إيميل متظبط؟ — المسار بيرجّع 503 لو لأ */
export function notifyMailConfigured(): boolean {
  return Boolean(RESEND_KEY || (SMTP_HOST && SMTP_USER && SMTP_PASS))
}

function mailFrom(): string {
  return (
    clean(process.env.MAIL_FROM) ||
    (SMTP_USER ? `نسبوط <${SMTP_USER}>` : 'نسبوط <onboarding@resend.dev>')
  )
}

interface Transport {
  sendMail(o: {
    from: string
    to: string
    subject: string
    text: string
    html: string
  }): Promise<{ messageId?: string }>
}

async function sendEmail(
  smtp: Transport | null,
  to: string,
  subject: string,
  text: string,
  html: string
): Promise<{ ok: boolean; ref?: string; error?: string }> {
  if (RESEND_KEY) {
    try {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { authorization: `Bearer ${RESEND_KEY}`, 'content-type': 'application/json' },
        body: JSON.stringify({ from: mailFrom(), to, subject, text, html }),
      })
      const j = await res.json().catch(() => ({}) as { id?: string; message?: string })
      return res.ok ? { ok: true, ref: j.id } : { ok: false, error: j.message ?? 'فشل الإرسال' }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }
  if (smtp) {
    try {
      const info = await smtp.sendMail({ from: mailFrom(), to, subject, text, html })
      return { ok: true, ref: info.messageId }
    } catch (e) {
      return { ok: false, error: (e as Error).message }
    }
  }
  return { ok: false, error: 'مفيش مزوّد إيميل متظبط' }
}

function htmlShell(body: string, link?: string): string {
  const cta = link
    ? `<div style="margin-top:20px"><a href="${link}" style="display:inline-block;background:#F4632A;color:#14161A;font-weight:900;text-decoration:none;padding:12px 22px;border-radius:999px">افتح نسبوط</a></div>`
    : ''
  const safe = body
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
  return `<!doctype html>
<html lang="ar" dir="rtl">
  <body style="margin:0;padding:24px;background:#f6f4ef;font-family:'Segoe UI',Tahoma,system-ui,sans-serif;color:#1a1a1a">
    <div style="max-width:460px;margin:0 auto;background:#fff;border-radius:16px;padding:28px 24px;text-align:right">
      <div style="font-size:22px;font-weight:900;color:#f26b1d;margin-bottom:16px">نسبوط</div>
      <div style="font-size:17px;line-height:1.9">${safe}</div>
      ${cta}
      <div style="font-size:13px;color:#666;margin-top:22px;line-height:1.7">
        وصلتك الرسالة دي من نسبوط. لو مش عايز، رد علينا وهنوقفها.
      </div>
    </div>
  </body>
</html>`
}

/* ==========================================================================
 *  إعدادات الرندر لكل قالب
 * ========================================================================== */

const SITE = (clean(process.env.NEXT_PUBLIC_SITE_URL) ?? 'https://nasbot.app').replace(/\/+$/, '')

const DAYS_AR = ['الحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة', 'السبت']

/** YYYY-MM-DD → «الاتنين ١٥ سبتمبر» */
function formatDay(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  if (Number.isNaN(dt.getTime())) return iso
  const md = dt.toLocaleDateString('ar-EG', { timeZone: 'UTC', day: 'numeric', month: 'long' })
  return `${DAYS_AR[dt.getUTCDay()]} ${md}`
}

/** timestamptz → «الاتنين ١٥ سبتمبر، ٧ م» بتوقيت القاهرة */
function formatWhen(iso: string): string {
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return ''
  const opts: Intl.DateTimeFormatOptions = {
    timeZone: 'Africa/Cairo',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    hour: 'numeric',
    minute: '2-digit',
  }
  return dt.toLocaleString('ar-EG', opts)
}

/** الجزء اليوم/التاريخ من starts_at (من غير ساعة) بتوقيت القاهرة */
function formatDate(iso: string): string {
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return ''
  return dt.toLocaleDateString('ar-EG', {
    timeZone: 'Africa/Cairo',
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  })
}

/** الساعة بس بتوقيت القاهرة */
function formatTime(iso: string): string {
  const dt = new Date(iso)
  if (Number.isNaN(dt.getTime())) return ''
  return dt.toLocaleTimeString('ar-EG', {
    timeZone: 'Africa/Cairo',
    hour: 'numeric',
    minute: '2-digit',
  })
}

interface RowCtx {
  name: string
  sbotaName: string
  when: string
  whenDay: string
  whenTime: string
  venue: string
  captain: string
  link: string
}

/** موضوع الإيميل + مسار الرابط الافتراضي + مواضع {{n}} لكل قالب أساسي */
const CORE: Record<
  string,
  { subject: string; path: string; args: (c: RowCtx) => string[] }
> = {
  booking_confirmed: {
    subject: 'مكانك محجوز',
    path: '/me',
    args: (c) => [c.name, c.sbotaName, c.when],
  },
  group_reveal: {
    subject: 'مجموعتك جاهزة',
    path: '/me',
    args: (c) => [c.name, c.sbotaName, c.whenDay, c.link],
  },
  reminder_24h: {
    subject: 'فاضل يوم على سبوطتك',
    path: '/me',
    args: (c) => [c.sbotaName, c.whenTime, c.venue],
  },
  reminder_3h: {
    subject: 'فاضل ٣ ساعات',
    path: '/me',
    args: (c) => [c.captain, c.venue],
  },
  cancelled_by_us: {
    subject: 'اعتذار عن الإلغاء',
    path: '/me',
    args: (c) => [c.sbotaName],
  },
  waitlist_promoted: {
    subject: 'فضي مكان في سبوطتك',
    path: '/me',
    args: (c) => [c.sbotaName, c.link],
  },
  review_request: {
    subject: 'رأيك يهمنا',
    path: '/me',
    args: (c) => [c.sbotaName, c.link],
  },
  photos_ready: {
    subject: 'الصور جاهزة',
    path: '/me',
    args: (c) => [c.link],
  },
  win_back: {
    subject: 'وحشتنا',
    path: '/',
    args: (c) => [c.captain, c.sbotaName],
  },
  mutual_match: {
    subject: 'اخترتوا بعض',
    path: '/me',
    args: (c) => [c.name, c.link],
  },
  weekly_schedule: {
    subject: 'جدول الأسبوع الجاي',
    path: '/',
    args: (c) => [c.link],
  },
}

/** روابط ومواضيع قوالب الشغل (أسماء {key}) */
const WORK_PATH: Record<string, string> = {
  work_recurring_booked: '/me/shoghl',
  work_no_pass_balance: '/me/shoghl',
  work_pass_low: '/shoghl/pass',
  work_pass_expiring: '/shoghl/pass',
  work_pass_activated: '/shoghl',
  work_collab_match: '/me/shoghl',
  work_venue_changed: '/me/shoghl',
  work_first_time_offer: '/shoghl',
}
const WORK_SUBJECT: Record<string, string> = {
  work_recurring_booked: 'حجزنا يومك الثابت',
  work_no_pass_balance: 'معادك جه وكارتك خلص',
  work_pass_low: 'فاضل في كارتك يوم واحد',
  work_pass_expiring: 'كارتك قرب ينتهي',
  work_pass_activated: 'كارتك اتفعّل',
  work_collab_match: 'في حد عايز يشتغل معاك',
  work_venue_changed: 'مكان سبوطة الشغل اتغيّر',
  work_first_time_offer: 'سبوطة شغل — أول مرة بـ 60',
}

/** القوالب اللي بتتبعت بمسار تاني — مش من المصرف (رمز الدخول) */
const SKIP_TEMPLATES = new Set(['auth_code'])

/** بيبدّل {{1}} من المصفوفة و{key} من السياق، وبينضّف الشرط الناقص */
function render(
  body: string,
  positional: string[],
  named: Record<string, string>
): { text: string; missing: string[] } {
  const missing: string[] = []
  let text = body.replace(/\{\{(\d+)\}\}/g, (_m, n) => {
    const v = positional[Number(n) - 1]
    if (v === undefined || v === '') {
      missing.push(`#${n}`)
      return ''
    }
    return v
  })
  text = text.replace(/\{([a-z_]+)\}/gi, (_m, k) => {
    const v = named[k]
    if (v === undefined || v === '') {
      missing.push(k)
      return ''
    }
    return v
  })
  text = text
    .replace(/\s*—\s*(?=[،.؟!])/g, '')
    .replace(/\s*—\s*$/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\s+([،.؟!])/g, '$1')
    .trim()
  return { text, missing }
}

type Db = ReturnType<typeof admin>

/** يعلّم الصف مبعوت/فاشل/يتعاد — دايمًا بيزوّد attempts (علاج D31) */
async function mark(
  db: Db,
  row: { id: string; attempts: number },
  ok: boolean,
  err: string | null,
  ref?: string,
  keepQueued = false
) {
  const patch: Record<string, unknown> = { attempts: row.attempts + 1 }
  if (ok) {
    patch.status = 'sent'
    patch.sent_at = new Date().toISOString()
    patch.error = null
    if (ref) patch.provider_ref = ref
  } else {
    patch.status = keepQueued ? 'queued' : 'failed'
    patch.error = (err ?? 'فشل الإرسال').slice(0, 300)
  }
  await db.from('notifications').update(patch).eq('id', row.id)
}

const MAX_ATTEMPTS = 3
const BATCH = 20

interface NotifyResult {
  picked: number
  sent: number
  failed: number
  left: number
  errors: string[]
}

/**
 * بيعالج دفعة من الطابور (٢٠ صف كحد أقصى). بيسحب **كل** القوالب النشطة، مش الشغل بس.
 */
export async function runNotify(limit = BATCH): Promise<NotifyResult> {
  const out: NotifyResult = { picked: 0, sent: 0, failed: 0, left: 0, errors: [] }
  const db = admin()

  // حد القِدَم من settings (0064). لولا الحد ده، أول نشر بعد تصليح D5 كان
  // هيبعت الطابور المتراكم كله دفعة واحدة — تذكيرات بسبوطات عدّت من أسابيع.
  const { data: cfg } = await db.from('settings').select('notify_max_stale_hours').single()
  const staleHours = Number((cfg as { notify_max_stale_hours?: number } | null)?.notify_max_stale_hours ?? 24)

  const { data: rows, error } = await db
    .from('notifications')
    .select('id, profile_id, template_key, payload, attempts, scheduled_for')
    .eq('status', 'queued')
    .lt('attempts', MAX_ATTEMPTS)
    .lte('scheduled_for', new Date().toISOString())
    .order('scheduled_for', { ascending: true })
    .limit(Math.max(1, Math.min(limit, BATCH)))

  if (error) {
    out.errors.push(`قراءة الطابور وقعت: ${error.message}`)
    return out
  }

  type Row = {
    id: string
    profile_id: string | null
    template_key: string | null
    payload: Record<string, unknown> | null
    attempts: number
    scheduled_for: string | null
  }
  const list = (rows ?? []) as Row[]
  out.picked = list.length
  if (!list.length) return out

  // نجمع القوالب والأشخاص والسبوطات المطلوبة مرة واحدة
  const keys = [...new Set(list.map((r) => r.template_key).filter((k): k is string => !!k))]
  const profileIds = new Set<string>()
  const sbotaIds = new Set<string>()
  for (const r of list) {
    if (r.profile_id) profileIds.add(r.profile_id)
    const other = r.payload?.other_id
    if (typeof other === 'string') profileIds.add(other)
    const sb = r.payload?.sbota_id
    if (typeof sb === 'string') sbotaIds.add(sb)
  }

  const [tpls, profs, sbs] = await Promise.all([
    db.from('notification_templates').select('key, body_ar, is_active').in('key', keys),
    db
      .from('profiles')
      .select('id, email, first_name, deleted_at')
      .in('id', [...profileIds]),
    sbotaIds.size
      ? db
          .from('sbotat')
          .select(
            'id, starts_at, venues(name), captains(display_name), sbota_templates(name_ar, slug)'
          )
          .in('id', [...sbotaIds])
      : Promise.resolve({ data: [] as unknown[] }),
  ])

  const tplMap = new Map<string, { body: string; active: boolean }>()
  for (const t of (tpls.data ?? []) as { key: string; body_ar: string; is_active: boolean }[]) {
    tplMap.set(t.key, { body: t.body_ar, active: t.is_active })
  }
  const profMap = new Map<string, { email: string | null; firstName: string; deleted: boolean }>()
  for (const p of (profs.data ?? []) as {
    id: string
    email: string | null
    first_name: string | null
    deleted_at: string | null
  }[]) {
    profMap.set(p.id, {
      email: p.email,
      firstName: (p.first_name ?? '').trim(),
      deleted: !!p.deleted_at,
    })
  }
  type SbRow = {
    id: string
    starts_at: string
    venues: { name: string } | { name: string }[] | null
    captains: { display_name: string | null } | { display_name: string | null }[] | null
    sbota_templates: { name_ar: string; slug: string } | { name_ar: string; slug: string }[] | null
  }
  const one = <T>(v: T | T[] | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)
  const sbMap = new Map<string, { name: string; slug: string; startsAt: string; venue: string; captain: string }>()
  for (const s of (sbs.data ?? []) as SbRow[]) {
    const tpl = one(s.sbota_templates)
    const ven = one(s.venues)
    const cap = one(s.captains)
    sbMap.set(s.id, {
      name: tpl?.name_ar ?? '',
      slug: tpl?.slug ?? '',
      startsAt: s.starts_at,
      venue: ven?.name ?? '',
      captain: cap?.display_name ?? '',
    })
  }

  const smtp: Transport | null =
    !RESEND_KEY && SMTP_HOST && SMTP_USER && SMTP_PASS
      ? (nodemailer.createTransport({
          host: SMTP_HOST,
          port: Number(process.env.SMTP_PORT ?? 465),
          secure: Number(process.env.SMTP_PORT ?? 465) === 465,
          auth: { user: SMTP_USER, pass: SMTP_PASS },
          pool: true,
          maxConnections: 2,
          connectionTimeout: 8000,
          greetingTimeout: 8000,
          socketTimeout: 12000,
        }) as unknown as Transport)
      : null

  const startedAt = Date.now()

  for (const row of list) {
    // Vercel Hobby بيقفل بعد شوية — بنسيب الباقي في الطابور من غير ما نلمسه
    if (Date.now() - startedAt > 22_000) {
      out.left += 1
      continue
    }

    const key = row.template_key ?? ''

    // إشعار فات ميعاده بكتير مبقاش له معنى — تذكير بسبوطة عدّت، أو كشف
    // مجموعة خلصت. بنقفله بدل ما نبعته (الحد من settings — 0064).
    if (staleHours > 0 && row.scheduled_for) {
      const lateHours = (Date.now() - new Date(row.scheduled_for).getTime()) / 3_600_000
      if (lateHours > staleHours) {
        await mark(db, row, false, `فات ميعاده بـ${Math.round(lateHours)} ساعة — مبعتناهوش`)
        out.failed += 1
        continue
      }
    }

    // رمز الدخول بيتبعت من مسار OTP مباشرة — بنطلّعه من الطابور
    if (SKIP_TEMPLATES.has(key)) {
      await mark(db, row, false, 'القالب ده بيتبعت من مسار تاني')
      out.failed += 1
      continue
    }

    const tpl = tplMap.get(key)
    const recipient = row.profile_id ? profMap.get(row.profile_id) : undefined
    const email = recipient?.email ?? null

    // أسباب الرفض النهائي (attempts بيتزوّد فيعدّي MAX_ATTEMPTS ويخرج)
    const reason = !tpl
      ? `مفيش قالب باسم ${key}`
      : !tpl.active
        ? 'القالب متوقف'
        : !recipient
          ? 'مفيش ملف للعضو'
          : recipient.deleted
            ? 'الملف اتمسح'
            : !email
              ? 'مفيش إيميل على الملف'
              : email.endsWith('@phone.nasbot.app')
                ? 'الإيميل اصطناعي — مفيش إيميل حقيقي'
                : null

    if (reason !== null || !tpl || !email || !recipient) {
      await mark(db, row, false, reason ?? 'بيانات ناقصة')
      out.failed += 1
      out.errors.push(`${row.id}: ${reason ?? 'بيانات ناقصة'}`)
      continue
    }

    // ===== السياق =====
    const payload = row.payload ?? {}
    const sb = typeof payload.sbota_id === 'string' ? sbMap.get(payload.sbota_id) : undefined
    const otherName =
      typeof payload.other_id === 'string' ? (profMap.get(payload.other_id)?.firstName || 'حد') : 'حد'

    const ctx: RowCtx = {
      name:
        key === 'mutual_match'
          ? otherName
          : recipient.firstName || 'يا صاحبي',
      sbotaName: sb?.name ?? '',
      when: sb ? formatWhen(sb.startsAt) : '',
      whenDay: sb ? formatDate(sb.startsAt) : '',
      whenTime: sb ? formatTime(sb.startsAt) : '',
      venue: sb?.venue ?? '',
      captain: sb?.captain ?? '',
      link: '',
    }

    // القيم المسماة {key} — للقوالب اللي بتستخدمها (الشغل)
    const named: Record<string, string> = {}
    for (const [k, v] of Object.entries(payload)) {
      if (v !== null && v !== undefined) {
        named[k] = typeof v === 'object' ? JSON.stringify(v) : String(v)
      }
    }
    if (named.day && /^\d{4}-\d{2}-\d{2}$/.test(named.day)) named.day = formatDay(named.day)
    if (!named.name && key !== 'mutual_match') named.name = ctx.name
    if (key === 'work_collab_match') named.name = otherName

    // الرابط: من الـ payload، وإلا من خريطة المسار (+ slug للسبوطة)
    const corePath = CORE[key]?.path
    const workPath = WORK_PATH[key]
    let path = corePath ?? workPath ?? '/me'
    if (path === '/me' && sb?.slug && (key === 'waitlist_promoted' || key === 'booking_confirmed')) {
      path = `/sbota/${sb.slug}`
    }
    const link = typeof payload.link === 'string' && payload.link ? payload.link : `${SITE}${path}`
    ctx.link = link
    named.link = link

    // ===== الرندر =====
    const positional = CORE[key] ? CORE[key].args(ctx) : []
    const { text, missing } = render(tpl.body, positional, named)
    if (missing.length) out.errors.push(`${row.id}: نقص (${missing.join('، ')})`)

    const subject = CORE[key]?.subject ?? WORK_SUBJECT[key] ?? 'نسبوط'
    const res = await sendEmail(smtp, email, subject, text, htmlShell(text, link))

    if (res.ok) {
      await mark(db, row, true, null, res.ref)
      out.sent += 1
    } else {
      const giveUp = row.attempts + 1 >= MAX_ATTEMPTS
      await mark(db, row, false, res.error ?? 'فشل الإرسال', undefined, !giveUp)
      out.failed += 1
      out.errors.push(`${row.id}: ${res.error ?? 'فشل الإرسال'}`)
    }
  }

  if (smtp && typeof (smtp as unknown as { close?: () => void }).close === 'function') {
    ;(smtp as unknown as { close: () => void }).close()
  }
  return out
}

/** اسم موروث — بيشغّل نفس المصرف العام (بيسحب الشغل وغيره) */
export const runWorkNotify = runNotify
