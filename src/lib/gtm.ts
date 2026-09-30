/**
 * Google Tag Manager — حاوية `nasbot.net` (طلب المالك ٢٠٢٦-٠٩-٣٠).
 *
 * ⚠ ده مش رقم تشغيل (§٣.٢) — ده معرّف الحاوية، وأي تغيير فيه تغيير مكان
 *   التحليلات كله. `NEXT_PUBLIC_GTM_ID` على ڤيرسل بيغلبه لو اتحط، وفاضي
 *   (`NEXT_PUBLIC_GTM_ID=off`) بيقفل GTM خالص.
 */
const env = process.env.NEXT_PUBLIC_GTM_ID?.trim()
export const GTM_ID = env === 'off' ? '' : env || 'GTM-K6JBGMBV'
