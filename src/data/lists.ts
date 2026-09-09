/**
 * القوايم الثابتة — كلها حرفيًا من design/نسبوط.dc.html
 * (ما عدا اللي مكتوب جنبه إنه من البرومبت)
 *
 * ⚠ من مراجعة A4: قوايم نموذج التسجيل (`interests` · `areas` · `budgets` ·
 * `days` · `girlsOnlyOptions` · `skillLevels` · `sports` · `MAX_INTERESTS`)
 * بقت **احتياطي بس**. المصدر الحقيقي `profile_fields` و`field_options` و
 * `skill_activities` و`consents` في القاعدة — واللي بيقرا منها
 * `src/lib/fields.ts` (نفس نمط `copy-fallback.ts` مع `copy.ts`).
 * القيم هنا هي نفسها اللي `src/lib/map-db.ts` بيعرف يترجمها، فلو غيّرتها
 * لازم تغيّر جدول الترجمة والهجرة معاها.
 */

/** الفلاتر العشرة — [ملف] */
export const filters = [
  'الكل',
  'التجمع',
  'المعادي',
  'زايد',
  'بنات بس',
  'رياضة',
  'نيل',
  'طبيعة',
  'أكل',
  'شغل',
] as const

/** الاهتمامات العشرين — [ملف] · يختار 5 بالظبط */
export const interests = [
  'تصوير',
  'أكل',
  'بادل',
  'جري',
  'بحر',
  'طبيعة',
  'سفر',
  'سينما',
  'موسيقى',
  'قراءة',
  'ألعاب',
  'طبخ',
  'فن',
  'تاريخ',
  'تكنولوجيا',
  'حيوانات',
  'أنيمي',
  'كرة',
  'أعمال',
  'يوجا',
] as const

/** الاختيار الافتراضي في الملف */
export const defaultInterests = ['بادل', 'تصوير', 'أكل', 'طبيعة', 'سفر']

export const MAX_INTERESTS = 5

/** المناطق في نموذج الحساب — [ملف] */
export const areas = [
  'التجمع',
  'المعادي',
  'زايد-أكتوبر',
  'مصر الجديدة-مدينة نصر',
  'وسط-زمالك',
  'غير كده',
] as const

/** درجات المستوى — [ملف] */
export const skillLevels = ['أول مرة', 'مبتدئ', 'متوسط', 'كويس'] as const

/** الرياضات في النموذج — [ملف] */
export const sports = ['بادل', 'جري', 'سباحة'] as const

/** الميزانية — [ملف] */
export const budgets = ['لحد 250', 'لحد 500', 'لحد 1000', 'مفيش مشكلة'] as const

/** الأيام الفاضية — [ملف] */
export const days = ['سبت', 'حد', 'اتنين', 'تلات', 'أربع', 'خميس', 'جمعة'] as const

/** الأيام المختارة افتراضيًا في الملف */
export const defaultDays = ['تلات', 'خميس', 'جمعة']

/** تفضيل «بنات بس» — [ملف] */
export const girlsOnlyOptions = ['دايمًا', 'أحيانًا', 'مش مهم'] as const

/** ستيكرات «قواعدنا في سطرين» في الرئيسية — [ملف] بالألوان والدوران */
export const homeRuleStickers = [
  { label: 'كابتن في كل سبوطة', color: 'cream' as const, rotate: -2 },
  { label: 'بنات بس كل تلات', color: 'cobalt' as const, rotate: 3 },
  { label: 'فلوسك بترجع لو إحنا لغينا', color: 'orange' as const, rotate: -3 },
  { label: 'اللي يضايق حد بيمشي', color: 'cream' as const, rotate: 2 },
]

/** ستيكرات القواعد في كشف المجموعة — [ملف] */
export const groupRuleStickers = [
  { label: 'احترام', color: 'cream' as const, rotate: -2 },
  { label: 'التصوير بإذن', color: 'cream' as const, rotate: 2 },
  {
    label: 'محدش بياخد رقم حد إلا لو الاتنين عايزين',
    color: 'cream' as const,
    rotate: -3,
  },
  { label: 'اللي يضايق حد بيمشي', color: 'orange' as const, rotate: 3 },
]

/** القواعد الخمس في /rules — مبنية على ستيكرات الملف */
export const fiveRules = [
  {
    n: 1,
    title: 'كابتن في كل سبوطة',
    body: 'مفيش خروجة من غير كابتن. هو اللي بيستقبلك، وبيعرّف الناس على بعض، وبيتصرف لو حصل أي حاجة.',
  },
  {
    n: 2,
    title: 'اللي يضايق حد بيمشي',
    body: 'مرة واحدة وخلاص. الكابتن ممكن يشيل أي حد من المجموعة في نفس اللحظة، والحساب بيتقفل.',
  },
  {
    n: 3,
    title: 'التصوير بإذن',
    body: 'محدش بيتصور من غير ما يوافق. والصور مش بتتنشر غير لما اللي فيها يقولوا تمام.',
  },
  {
    n: 4,
    title: 'محدش بياخد رقم حد إلا لو الاتنين عايزين',
    body: 'الأرقام مخفية. لو الاتنين اختاروا بعض في التقييم، ساعتها بس بيتفتح بينهم شات.',
  },
  {
    n: 5,
    title: 'احترام',
    body: 'كل اللي معاك رقمه متحقق ووافق على القواعد دي قبل ما يحجز.',
  },
]

/** نص الضمان — [ملف] حرفيًا */
export const guaranteeText =
  'لو إحنا لغينا، فلوسك كاملة. لو أنت لغيت قبل 3 أيام، فلوسك كاملة. أقل من كده، رصيد.'

/** روابط الذيل — [ملف] */
export const footerLinks = ['القواعد', 'الأسئلة', 'بقى كابتن', 'مين إحنا', 'الشروط']

/** سطر الذيل — [ملف] */
export const footerLine = 'نسبوط — نادي خروجات في القاهرة. مفيش عضوية.'

/** الشريط المتحرك — [ملف] حرفيًا */
export const marqueeText =
  'الخميس · إحنا الرابع · بادل التجمع · فاضل 3 ▸ الجمعة · فطار على النيل · كاياك المعادي · فاضل 5 ▸ الجمعة · بعد ما الشمس تغيب · وادي دجلة · كامل ▸ '

/** صور «اللي حصل الجمعة اللي فاتت» — [ملف] */
export const lastFriday = [
  {
    img: '[صورة المجموعة الحقيقية — كاياك المعادي 7 الصبح]',
    sign: '~ الكابتن سارة',
  },
  { img: '[صورة المجموعة الحقيقية — ملعب بادل بالفلاش]', sign: '~ الكابتن يوسف' },
  { img: '[صورة المجموعة الحقيقية — شوي في وادي دجلة]', sign: '~ الكابتن دينا' },
]

/** الاقتباس — [ملف] */
export const quote = { text: '«رحت لوحدي ومحستش إني لوحدي.»', by: '— نور' }

/** رقم الطوارئ */
export const emergencyPhone = '+201000000000'

/** رقم إنستا باي للتحويل */
export const instapayHandle = 'nasbot@instapay'

/* ============================================================ الشغل */

/**
 * الأرقام الافتراضية للشغل — نفس قيم WORK_PLAN §1.2 بالجنيه.
 * بتتستخدم لو القاعدة مش متاحة أو الأعمدة لسه ما اتضافتش.
 */
export const workSettingsDefaults = {
  pass4Price: 400,
  pass4Weeks: 6,
  pass8Price: 720,
  pass8Weeks: 10,
  singlePrice: 120,
  firstTimePrice: 60,
  vodafoneNumber: '010 0000 0000',
  instapayHandle: 'nasbot@instapay',
  reviewHours: 2,
} as const

/** جدول اليوم الافتراضي لو work_config فاضي */
export const workScheduleDefaults = {
  start: '10:00',
  lunchAt: '13:00',
  complaintAt: '14:30',
  end: '15:00',
} as const

/** الخطوات الأربعة في /shoghl — النصوص في copy_strings بالمفاتيح دي */
export const workSteps = [
  { n: 1, icon: 'calendar', titleKey: 'shoghl.step1.title', bodyKey: 'shoghl.step1.body' },
  { n: 2, icon: 'laptop', titleKey: 'shoghl.step2.title', bodyKey: 'shoghl.step2.body' },
  { n: 3, icon: 'food', titleKey: 'shoghl.step3.title', bodyKey: 'shoghl.step3.body' },
  { n: 4, icon: 'pair', titleKey: 'shoghl.step4.title', bodyKey: 'shoghl.step4.body' },
] as const

/** أسئلة صفحة الكارت — 3 بس */
export const workFaq = [
  { q: 'shoghl.pass.faq.q1', a: 'shoghl.pass.faq.a1' },
  { q: 'shoghl.pass.faq.q2', a: 'shoghl.pass.faq.a2' },
  { q: 'shoghl.pass.faq.q3', a: 'shoghl.pass.faq.a3' },
] as const

/** نموذج الشركات — كام مرة في الشهر (المفتاح للنص) */
export const leadTimesOptions = [
  { value: 1, key: 'shoghl.lead.times.1' },
  { value: 2, key: 'shoghl.lead.times.2' },
  { value: 4, key: 'shoghl.lead.times.4' },
  { value: 8, key: 'shoghl.lead.times.8' },
] as const

/** السبوطات اللي بتظهر في «سبوطات الشغل الأسبوع ده» — 14 يوم قدام */
export const WORK_WINDOW_DAYS = 14
