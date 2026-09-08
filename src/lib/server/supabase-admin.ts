import 'server-only'
import { createClient } from '@supabase/supabase-js'

/**
 * عميل الخادم بمفتاح الخدمة — بيتخطى RLS.
 * `server-only` بتمنع أي ملف واجهة إنه يستورده بالغلط:
 * لو حد عمل import من مكوّن عميل، البناء نفسه بيقع.
 */
export function admin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY
  if (!url || !key) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY مش متظبط — راجع .env.local')
  }
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}

/** الإيميل الاصطناعي المربوط بالرقم — الدخول بالموبايل بس، والإيميل ده داخلي */
export const phoneEmail = (e164: string) =>
  `${e164.replace('+', '')}@phone.nasbot.app`

/**
 * توحيد شكل الرقم المصري لـ E.164.
 * بيقبل: 01001234567 · 1001234567 · +201001234567 · 00201001234567 · 201001234567
 * وبيرجّع: +201001234567
 */
export function normalizePhone(raw: string): string | null {
  let d = raw.replace(/\D/g, '')

  // 00 الدولية
  if (d.startsWith('00')) d = d.slice(2)
  // كود مصر
  if (d.startsWith('20')) d = d.slice(2)
  // الصفر المحلي — ده اللي الناس بتكتبه فعلًا
  if (d.startsWith('0')) d = d.slice(1)

  // 1 + شبكة (0 فودافون · 1 اتصالات · 2 أورانج · 5 وي) + 8 أرقام
  if (!/^1[0125][0-9]{8}$/.test(d)) return null
  return `+20${d}`
}
