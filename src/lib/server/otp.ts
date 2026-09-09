import 'server-only'
import { createHash } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import { mailConfigured, sendAuthCodeEmail } from '@/lib/server/mailer'
import { sendAuthCode as sendWhatsApp } from '@/lib/server/whatsapp'
import { clientIp } from '@/lib/server/admin-auth'

/**
 * رمز الدخول — المنطق المشترك بين /api/otp/send و /api/otp/verify.
 *
 * الهوية لسه **رقم الموبايل** (profiles.phone). اللي اتغيّر هو قناة التوصيل:
 * الرمز بيروح على **الإيميل** المرتبط بالرقم، وواتساب بديل لو متظبط.
 *
 * ربط الإيميل بالرقم:
 *   - رقم له ملف بإيميل  → الرمز يروح على الإيميل المتخزّن **بس**. أي إيميل
 *     جاي من العميل بيتجاهَل — وإلا أي حد يطلب رمز لرقم غيره على إيميله هو.
 *   - رقم جديد          → لازم إيميل مع الطلب، وبيبقى إيميل الحساب.
 *
 * الإيميل بيدخل في هاش الرمز، فطلب الإرسال والتحقق لازم يتفقوا على نفس
 * الإيميل وإلا الهاش ما يطابقش.
 */

export const OTP_TTL_MS = 10 * 60_000

/** الإيميل الاصطناعي القديم (`+20…@phone.nasbot.app`) مش إيميل حقيقي */
export const isSyntheticEmail = (e: string | null | undefined) =>
  !e || e.endsWith('@phone.nasbot.app')

export function normalizeEmail(raw: unknown): string | null {
  const e = String(raw ?? '').trim().toLowerCase()
  // فحص مبسّط عن قصد — المزوّد هو اللي بيرفض العناوين الغلط فعلًا
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(e) || e.length > 254) return null
  return e
}

export function codeHash(code: string, phone: string, email: string): string {
  return createHash('sha256')
    .update(`${code}:${phone}:${email}:${process.env.CRON_SECRET ?? 'nasbot'}`)
    .digest('hex')
}

export type Resolved =
  | { ok: true; email: string; existing: boolean; profileId: string | null }
  | { ok: false; status: number; error: string }

/**
 * بيحدد الإيميل اللي الرمز هيروح عليه للرقم ده.
 * بيتنادى بنفس الشكل من الإرسال والتحقق علشان يطلع نفس الجواب.
 */
export async function resolveEmail(
  db: SupabaseClient,
  phone: string,
  submitted: unknown
): Promise<Resolved> {
  const { data } = await db
    .from('profiles')
    .select('id, email')
    .eq('phone', phone)
    .maybeSingle()
  const prof = data as { id: string; email: string | null } | null

  if (prof && !isSyntheticEmail(prof.email)) {
    return { ok: true, email: prof.email!.toLowerCase(), existing: true, profileId: prof.id }
  }

  // رقم جديد، أو ملف قديم من غير إيميل حقيقي — الإيميل لازم يجي مع الطلب
  const email = normalizeEmail(submitted)
  if (!email) {
    return {
      ok: false,
      status: 400,
      error: prof
        ? 'الحساب ده ما عليهوش إيميل. سجّل من صفحة الانضمام بنفس الرقم وحط إيميلك.'
        : 'اكتب إيميلك علشان نبعتلك الرمز عليه',
    }
  }
  return { ok: true, email, existing: Boolean(prof), profileId: prof?.id ?? null }
}

export interface Delivery {
  ok: boolean
  channel: 'email' | 'whatsapp' | 'simulated'
  error?: string
}

/**
 * توصيل الرمز: الإيميل أولًا، وواتساب لو متظبط، والمحاكاة في التطوير بس.
 * في الإنتاج من غير أي قناة بنرجّع فشل صريح — الصفحة ما تقولش «بعتنالك» وهي ما بعتت.
 */
export async function deliverCode(phone: string, email: string, code: string): Promise<Delivery> {
  if (mailConfigured()) {
    const r = await sendAuthCodeEmail(email, code)
    if (r.ok) return { ok: true, channel: 'email' }
    // eslint-disable-next-line no-console
    console.error(`[إيميل] فشل الإرسال لـ ${email}: ${r.error}`)
  }

  const wa = await sendWhatsApp(phone, code)
  if (wa.ok && !wa.simulated) return { ok: true, channel: 'whatsapp' }

  if (process.env.NODE_ENV !== 'production') {
    // eslint-disable-next-line no-console
    console.log(`[رمز — محاكاة] ${code} → ${email} / ${phone}`)
    return { ok: true, channel: 'simulated' }
  }

  return { ok: false, channel: 'simulated', error: 'الإرسال مش متفعّل على السيرفر — كلّم الإدارة' }
}

/* ==================================================== حدود المعدل (S7) */

/**
 * مفتاح مهشوش للجهاز. بنخزّن الهاش مش الـIP الخام — إحنا مش محتاجينه،
 * ومحدش يقدر يرجّعه من جدول العدّادات.
 */
export function ipKey(prefix: string, req: Request): string | null {
  const ip = clientIp(req)
  if (!ip) return null
  const h = createHash('sha256')
    .update(`${ip}:${process.env.CRON_SECRET ?? 'nasbot'}`)
    .digest('hex')
    .slice(0, 32)
  return `${prefix}:${h}`
}

/** الحدود من settings — لو القراية وقعت بنرجع للافتراضي بتاع الهجرة */
export interface OtpLimits {
  maxAttempts: number
  sendsPerHour: number
  ipSendsPerHour: number
  ipVerifiesPerHour: number
}

export async function otpLimits(db: SupabaseClient): Promise<OtpLimits> {
  const d = { maxAttempts: 5, sendsPerHour: 3, ipSendsPerHour: 20, ipVerifiesPerHour: 40 }
  const { data } = await db
    .from('settings')
    .select('otp_max_attempts, otp_sends_per_hour, otp_ip_sends_per_hour, otp_ip_verifies_per_hour')
    .maybeSingle()
  const r = data as Record<string, number | null> | null
  if (!r) return d
  return {
    maxAttempts: r.otp_max_attempts ?? d.maxAttempts,
    sendsPerHour: r.otp_sends_per_hour ?? d.sendsPerHour,
    ipSendsPerHour: r.otp_ip_sends_per_hour ?? d.ipSendsPerHour,
    ipVerifiesPerHour: r.otp_ip_verifies_per_hour ?? d.ipVerifiesPerHour,
  }
}

/**
 * عدّاد نافذة ذرّي عبر fn_rate_hit. بيرجّع true لو لسه تحت الحد.
 *
 * ⚠ fail-open عن قصد: لو الهجرة 0070 لسه ما اتلزقتش، أو القاعدة ردّت بغلط،
 * بنسيب الطلب يعدّي. القفل على الكل بسبب حاجة عندنا أسوأ من غياب حد مؤقت —
 * وحد المحاولات على الرمز نفسه لسه شغّال في الحالتين.
 */
export async function rateOk(
  db: SupabaseClient,
  bucket: string | null,
  limit: number,
  windowSecs = 3600
): Promise<boolean> {
  if (!bucket || limit <= 0) return true
  const { data, error } = await db.rpc('fn_rate_hit', {
    p_bucket: bucket,
    p_limit: limit,
    p_window_secs: windowSecs,
  })
  if (error) return true
  return data !== false
}
