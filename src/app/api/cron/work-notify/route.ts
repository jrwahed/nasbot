/**
 * اسم قديم — بيوجّه لنفس المصرف العام في `/api/cron/notify`.
 *
 * سيبناه شغّال علشان مهمة pg_cron القديمة (WORK_CRON.sql) اللي بتنده
 * `/api/cron/work-notify` تفضل تشتغل. المصرف بقى بيسحب **كل** الإشعارات مش الشغل
 * بس (REVIEW_DB D5)، فالاسم القديم بيعمل نفس الشغل الجديد.
 *
 * الجدولة الجديدة المفضّلة: `/api/cron/notify`.
 */
// ملحوظة: Next ما بيعرفش يقرا `runtime`/`maxDuration` لو اتعملهم re-export من
// ملف تاني — لازم يتكتبوا هنا حرفيًا، وإلا بيرجع للافتراضي (١٠ ثواني) والإيميلات
// بتتقطع. المعالجات بس هي اللي بتتعاد تصديرها.
export const runtime = 'nodejs'
export const maxDuration = 30

export { GET, POST } from '../notify/route'
