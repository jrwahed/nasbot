/**
 * مناطق خريطة القاهرة — كتل مرسومة SVG بأسلوب بسيط.
 * الإحداثيات في مساحة viewBox 400×520.
 * أسلوب الكتل والزوايا مأخوذ من الخريطة المصغرة في design/نسبوط.dc.html
 * (مستطيلات بزوايا 24–30 بلون واحد + تسمية).
 *
 * ⚠ من مراجعة A5: `mapAreas` و`mysteryPin` بقوا **احتياطي بس** — المصدر
 * الحقيقي جدول `map_areas` في القاعدة، والقراية من `src/lib/fields.ts`
 * (نفس نمط `src/data/copy-fallback.ts` مع `src/lib/copy.ts`). أي تعديل هنا
 * لازم يتعمل في هجرة كمان، وإلا هيبان بس لما القاعدة تكون مش متاحة.
 *
 * و`mapPins` اتشالت خالص: كانت قايمة يدوية بـ٧ slugs، يعني أي سبوطة جديدة
 * عمرها ما كانت تبان على الخريطة. دلوقتي النقط بتتحسب من السبوطات نفسها في
 * `placePins` جوه `src/lib/fields.ts`.
 */

export interface MapArea {
  id: string
  label: string
  x: number
  y: number
  w: number
  h: number
  r: number
  /** موقع التسمية */
  lx: number
  ly: number
  /** بعيدة عن القاهرة — بتتعرض على طرف الخريطة */
  far?: boolean
  note?: string
}

/**
 * ⚠ **اترسمت من أول وجديد (٢٠٢٦-٠٩-١٥).** النسخة القديمة كانت ٧ كتل عايمة
 *    بمسافات كبيرة بينها ونص الصندوق فاضي — محدش كان هيبص ويقول «دي القاهرة».
 *
 * القاعدة في الرسم الجديد:
 *   · النيل بيفصل غرب عن شرق، وهو **شكل** مش شريط مايل.
 *   · الكتل متلاصقة (فاصل ٦px) — المدينة متصلة مش جزر.
 *   · المناطق اللي بعيدة عن القاهرة (`far`) **مش** كتل جوّه الخريطة —
 *     بتتعرض شرايط تحتها. الفيوم مش حتة في القاهرة.
 *   · التسمية على الخريطة قصيرة، والأسماء الطويلة بتروح `match_labels`
 *     في القاعدة — «التجمع» على الكتلة و«القاهرة الجديدة» في المطابقة.
 */
export const mapAreas: MapArea[] = [
  /* ===== غرب النيل ===== */
  { id: 'zayed',      label: 'زايد وأكتوبر', x: 8,   y: 14,  w: 128, h: 118, r: 28, lx: 72,  ly: 78 },
  { id: 'mohandessin', label: 'المهندسين',   x: 8,   y: 138, w: 128, h: 86,  r: 26, lx: 72,  ly: 186 },
  { id: 'haram',      label: 'الهرم',        x: 8,   y: 230, w: 128, h: 96,  r: 26, lx: 72,  ly: 283 },

  /* ===== شرق النيل — العمود القريب ===== */
  { id: 'heliopolis', label: 'مصر الجديدة',  x: 190, y: 56,  w: 102, h: 104, r: 28, lx: 241, ly: 112 },
  { id: 'downtown',   label: 'وسط البلد',    x: 190, y: 166, w: 102, h: 82,  r: 26, lx: 241, ly: 212 },
  { id: 'maadi',      label: 'المعادي',      x: 190, y: 254, w: 102, h: 98,  r: 28, lx: 241, ly: 308 },

  /* ===== شرق النيل — العمود البعيد ===== */
  { id: 'obour',      label: 'العبور',       x: 298, y: 14,  w: 94,  h: 76,  r: 26, lx: 345, ly: 57 },
  { id: 'tagamo3',    label: 'التجمع',       x: 298, y: 96,  w: 94,  h: 104, r: 28, lx: 345, ly: 152 },
  { id: 'mokattam',   label: 'المقطم',       x: 298, y: 206, w: 94,  h: 70,  r: 24, lx: 345, ly: 246 },
  { id: 'wadi',       label: 'وادي دجلة',    x: 298, y: 282, w: 94,  h: 84,  r: 26, lx: 345, ly: 329 },

  /* ===== بره القاهرة — بتتعرض شرايط تحت الخريطة مش كتل جوّاها ===== */
  { id: 'fayoum', label: 'الفيوم', x: 0, y: 0, w: 0, h: 0, r: 0, lx: 0, ly: 0, far: true, note: 'ساعتين' },
  { id: 'sokhna', label: 'السخنة', x: 0, y: 0, w: 0, h: 0, r: 0, lx: 0, ly: 0, far: true, note: 'ساعتين' },
  /* كتلة المطابقة الأخيرة — أي منطقة ما عرفناهاش بتقع هنا بدل ما تختفي */
  { id: 'other', label: 'مناطق تانية', x: 0, y: 0, w: 0, h: 0, r: 0, lx: 0, ly: 0 },
]

/** موقع نقطة السبوطة الغامضة — كوبالت كبيرة بعلامة استفهام (احتياطي) */
export const mysteryPin = { x: 72, y: 392 }

/**
 * فلاتر الخريطة — البرومبت §4.15.
 * لكل فلتر `id` ثابت: الصفحة بتقارن بالـ id مش بالنص المعروض. قبل كده كانت
 * بتقارن `filter === t('map.label.3')` — يعني أي تعديل للنص من اللوحة كان
 * بيوقّف الفلترة بصمت.
 */
export const mapFilterOptions = [
  { id: 'all', label: 'الكل' },
  { id: 'day', label: 'نهاري' },
  { id: 'night', label: 'ليلي' },
  { id: 'girls', label: 'بنات بس' },
] as const

export type MapFilterId = (typeof mapFilterOptions)[number]['id']

export const mapFilters: readonly string[] = mapFilterOptions.map((o) => o.label)

/**
 * كتل الخريطة المصغرة في الرئيسية — منقولة بالإحداثيات بالظبط من الملف.
 * مساحة 350×260 (عرض الشاشة 390 ناقص حشو 20 على الجنبين).
 */
/** موضع عنصر على الخريطة المصغرة — الجوانب كلها اختيارية */
export interface MiniPos {
  left?: number
  right?: number
  top?: number
  bottom?: number
}

export const miniMapBlocks: (MiniPos & { w: number; h: number; r: number })[] = [
  { right: 18, top: 26, w: 120, h: 80, r: 26 },
  { right: 150, top: 110, w: 90, h: 70, r: 26 },
  { left: 20, top: 40, w: 110, h: 90, r: 30 },
  { right: 60, bottom: 30, w: 100, h: 60, r: 24 },
]

export const miniMapLabels: (MiniPos & { label: string })[] = [
  { label: 'التجمع', right: 60, top: 56 },
  { label: 'المعادي', right: 168, top: 132 },
  { label: 'زايد', left: 52, top: 74 },
  { label: 'وادي دجلة', right: 82, bottom: 46 },
]

export const miniMapDots: (MiniPos & { delay: number })[] = [
  { right: 40, top: 40, delay: 0 },
  { right: 110, top: 70, delay: 0.4 },
  { right: 190, top: 150, delay: 0.8 },
  { right: 120, bottom: 50, delay: 1.2 },
]

export const miniMapMystery = { left: 70, top: 60 }
