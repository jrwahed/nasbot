/**
 * مناطق خريطة القاهرة — كتل مرسومة SVG بأسلوب بسيط.
 * الإحداثيات في مساحة viewBox 400×520.
 * أسلوب الكتل والزوايا مأخوذ من الخريطة المصغرة في design/نسبوط.dc.html
 * (مستطيلات بزوايا 24–30 بلون واحد + تسمية).
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

export const mapAreas: MapArea[] = [
  { id: 'tagamo3', label: 'التجمع', x: 236, y: 60, w: 132, h: 96, r: 30, lx: 302, ly: 112 },
  {
    id: 'heliopolis',
    label: 'مصر الجديدة ومدينة نصر',
    x: 214,
    y: 176,
    w: 148,
    h: 84,
    r: 28,
    lx: 288,
    ly: 222,
  },
  {
    id: 'downtown',
    label: 'الزمالك ووسط البلد',
    x: 112,
    y: 196,
    w: 92,
    h: 78,
    r: 26,
    lx: 158,
    ly: 238,
  },
  { id: 'maadi', label: 'المعادي', x: 176, y: 292, w: 118, h: 84, r: 28, lx: 235, ly: 338 },
  {
    id: 'wadi',
    label: 'وادي دجلة',
    x: 250,
    y: 392,
    w: 118,
    h: 74,
    r: 26,
    lx: 309,
    ly: 452,
  },
  {
    id: 'zayed',
    label: 'زايد وأكتوبر',
    x: 36,
    y: 92,
    w: 116,
    h: 104,
    r: 30,
    lx: 94,
    ly: 148,
  },
  {
    id: 'fayoum',
    label: 'الفيوم',
    x: 20,
    y: 408,
    w: 100,
    h: 68,
    r: 24,
    lx: 70,
    ly: 446,
    far: true,
    note: 'ساعتين',
  },
]

/** نقط السبوطات على الخريطة — مربوطة بالـ slug */
export interface MapPin {
  slug: string
  areaId: string
  x: number
  y: number
}

export const mapPins: MapPin[] = [
  { slug: 'ehna-el-rabe3', areaId: 'tagamo3', x: 276, y: 92 },
  { slug: 'el-mal3ab-lina', areaId: 'tagamo3', x: 330, y: 128 },
  { slug: 'tarabeza-setta', areaId: 'tagamo3', x: 258, y: 132 },
  { slug: 'work-cafe-tagamo3', areaId: 'tagamo3', x: 340, y: 84 },
  { slug: 'fetar-3al-nil', areaId: 'maadi', x: 214, y: 322 },
  { slug: 'ba3d-ma-el-shams-teghib', areaId: 'wadi', x: 288, y: 414 },
  { slug: 'shoro2-men-el-gabal', areaId: 'wadi', x: 336, y: 416 },
]

/** موقع نقطة السبوطة الغامضة — كوبالت كبيرة بعلامة استفهام */
export const mysteryPin = { x: 96, y: 320 }

/** فلاتر الخريطة — البرومبت §4.15 */
export const mapFilters = ['الكل', 'نهاري', 'ليلي', 'بنات بس'] as const

/** المناطق اللي المستخدم راحها (من الحجوزات) — الباقي باهت ومكتوب عليه «لسه» */
export const visitedAreaIds = ['tagamo3', 'maadi']

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
