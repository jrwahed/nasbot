/**
 * رسالة الواتساب اللي اللوحة بتفتح بيها المحادثة مع الحاجز.
 *
 * الواتساب التلقائي **مش** متفعّل، والمالك بيبعت بإيده. فالفكرة بسيطة:
 * اللوحة بتبني الرسالة من قالب في `notification_templates` (مفتاح
 * `whatsapp_booking`، بيتعدّل من `/admin/notifications`) وبتفتح واتساب
 * بالرسالة جاهزة. المالك بيقراها ويبعتها.
 *
 * ⚠ **ليه الترتيب مكتوب هنا؟** درس رابع في CLAUDE.md: القالب في القاعدة
 *    والكود اللي بيملاه في مكان تاني، ولو اتخالفوا **مفيش حاجة بتفشل** —
 *    المتغيّر الناقص بيوصل فراغ والرسالة تروح للعضو ناقصة. فالترتيب
 *    متعرّف هنا مرة واحدة، والحارس `scripts/check-notify-vars.mjs` بيقراه
 *    من الملف ده ويقارنه بنص القالب في الهجرة.
 */

/** مفتاح القالب في `notification_templates` */
export const WA_BOOKING_KEY = 'whatsapp_booking'

/**
 * ترتيب `{{1}}…{{n}}` في قالب `whatsapp_booking`.
 * الحارس بيعدّهم — فأي زيادة أو نقصان هنا لازم يتبعها تعديل في القالب.
 */
export const WA_BOOKING_VARS = [
  'اسم الحاجز',
  'اسم السبوطة',
  'اليوم والساعة',
  'المكان والعنوان',
  'رابط الحجز',
] as const

/** بيبدّل {{1}}… بالقيم بالترتيب. الناقص بيبقى «—» مش فراغ صامت. */
export function fillWaMessage(body: string, values: readonly string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (_m, n) => {
    const v = values[Number(n) - 1]
    return v && v.trim() ? v.trim() : '—'
  })
}

/**
 * نفس قاعدة الخادم: 01001234567 · +201001234567 · 00201001234567 → 201001234567
 * (واتساب عايز الرقم من غير + ولا صفر).
 */
export function waPhone(raw: string | null | undefined): string | null {
  let d = (raw ?? '').replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('20')) d = d.slice(2)
  if (d.startsWith('0')) d = d.slice(1)
  if (!/^1[0125][0-9]{8}$/.test(d)) return null
  return `20${d}`
}

/** لينك واتساب جاهز، أو null لو الرقم مش مصري صالح */
export function waHref(phone: string | null | undefined, text: string): string | null {
  const n = waPhone(phone)
  if (!n) return null
  return `https://wa.me/${n}?text=${encodeURIComponent(text)}`
}
