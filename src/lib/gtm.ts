/**
 * Google Tag Manager — حاوية `nasbot.net` (طلب المالك ٢٠٢٦-٠٩-٣٠).
 *
 * ⚠ ده مش رقم تشغيل (§٣.٢) — ده معرّف الحاوية، وأي تغيير فيه تغيير مكان
 *   التحليلات كله. `NEXT_PUBLIC_GTM_ID` على ڤيرسل بيغلبه لو اتحط، وفاضي
 *   (`NEXT_PUBLIC_GTM_ID=off`) بيقفل GTM خالص.
 */
const env = process.env.NEXT_PUBLIC_GTM_ID?.trim()
export const GTM_ID = env === 'off' ? '' : env || 'GTM-K6JBGMBV'

/**
 * Google Analytics 4 — `G-4PSBZZKRK4` (property «نسبوط»، ٢٠٢٦-٠٩-٣٠).
 *
 * ⚠ متركّب **مباشرة** (gtag.js) مش من جوه GTM، علشان المالك ما يحتاجش
 *   يظبط وسم في لوحة GTM. **متضيفش وسم «Google Tag» بنفس الرقم في GTM** —
 *   كل زيارة هتتعدّ مرتين. `NEXT_PUBLIC_GA_ID=off` بيقفله.
 */
const gaEnv = process.env.NEXT_PUBLIC_GA_ID?.trim()
export const GA_ID = gaEnv === 'off' ? '' : gaEnv || 'G-4PSBZZKRK4'
