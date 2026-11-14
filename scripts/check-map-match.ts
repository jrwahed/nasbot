/**
 * حارس مطابقة الخريطة.
 *
 * ⚠ **ليه الملف ده موجود:** السبوطة بتوصل لكتلتها على الخريطة بمطابقة **نص**
 *    بين المنطقة اللي المالك كتبها و`map_areas.match_labels`. ولما المطابقة
 *    بتفشل **مفيش حاجة بتحصل**: السبوطة بتختفي من الخريطة من غير خطأ ولا لوج.
 *    ده وقع فعلًا — التلات سبوطات المفتوحة على الإنتاج كانوا كلهم مش بيبانوا،
 *    والخريطة كانت فاضية، وإحنا بنتكلم عن ألوانها.
 *
 * الحارس بيقرا **الأسماء المرادفة من ملف الهجرة** (اللي بيتلزق على الإنتاج)
 * ويشغّل عليها `blockKeyFor` من الكود — يعني بيفحص الاتنين مع بعض زي
 * `check-notify-vars`. لو المالك ضاف اسم في الهجرة والكود مش عارف يوصّله،
 * أو العكس، البناء بيفشل.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { blockKeyFor, type MapBlock } from '../src/lib/fields'

/**
 * ⚠ **بيقرا كل ملفات الهجرة بالترتيب، مش ملف واحد.**
 *
 *   كان مربوط بـ`0099` بالاسم. وأول ما `0141` ضافت «الشروق» و«العاشر من
 *   رمضان» (٢٠٢٦-١١-١٥)، الحارس فضل بيحكم على قايمة `0099` بس: يعني
 *   الإنتاج بيوصّل «الشروق» لكتلتها الجديدة والحارس بيقول «لأ، للعبور»
 *   و**بيعدّي** — حارس بيحكم على نص قديم (نفس الدرس التلاتين في
 *   `sync-case-copy`).
 *
 *   الترتيب مهم: الصف اللي بيتلزق **آخر** هو اللي بيكسب (`on conflict do
 *   update`)، فبناخد آخر نسخة لكل مفتاح — وده بالظبط اللي القاعدة بتعمله.
 *   والترتيب النهائي بـ`sort` زي `getMapData` (`order('sort')`).
 */
const MIG_DIR = 'supabase/migrations'

const sql = readdirSync(MIG_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(MIG_DIR, f), 'utf8'))
  .join('\n')

const byKey = new Map<string, MapBlock & { sort: number }>()
const blocks: MapBlock[] = []
const re =
  /\(\s*'([a-z0-9_]+)'\s*,\s*'([^']*)'\s*,\s*(null|'[a-z_]+')\s*,\s*\n?\s*array\[([^\]]*)\][^,]*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*,\s*(true|false)\s*,\s*(null|'[^']*')\s*,\s*(true|false)\s*,\s*(\d+)/g

for (const m of sql.matchAll(re)) {
  byKey.set(m[1], {
    key: m[1],
    label: m[2],
    area: m[3] === 'null' ? null : m[3].slice(1, -1),
    matchLabels: [...m[4].matchAll(/'([^']*)'/g)].map((x) => x[1]).filter(Boolean),
    x: +m[5],
    y: +m[6],
    w: +m[7],
    h: +m[8],
    r: +m[9],
    lx: +m[10],
    ly: +m[11],
    far: m[12] === 'true',
    note: null,
    sort: +m[15],
  })
}

// ⚠ الترتيب بـ`sort` — `blockKeyFor` بياخد **أول** كتلة بتطابق، و`getMapData`
//   بتقرا `order('sort')`. لو رتّبنا غلط هنا، الحارس بيفحص ترتيب مش الحقيقي.
blocks.push(...[...byKey.values()].sort((a, b) => a.sort - b.sort))

if (blocks.length < 8) {
  console.error(`✗ مقدرتش أقرا كتل الخريطة من ${MIG_DIR} (لقيت ${blocks.length}) — الحارس لازم يتظبط.`)
  process.exit(1)
}

/** الحالات اللي لازم تشتغل — كلها كتابة حقيقية ممكن المالك يكتبها */
const CASES: [input: string, expect: string][] = [
  ['العبور', 'obour'],
  // ⚠ «الشروق» بقت كتلة لوحدها في `0141` — كانت مرادف جوه «العبور»
  ['الشروق', 'shorouk'],
  ['مدينة الشروق', 'shorouk'],
  ['العاشر من رمضان', '3asher'],
  ['العاشر', '3asher'],
  ['بادل في العاشر من رمضان', '3asher'],
  ['الشيخ زايد', 'zayed'],
  ['٦ أكتوبر', 'zayed'],
  ['6 اكتوبر', 'zayed'],
  ['مصر الجديده', 'heliopolis'],
  ['مدينة نصر', 'heliopolis'],
  ['وادي دجلة', 'wadi'],
  ['محمية وادي دجله', 'wadi'],
  ['المعادي', 'maadi'],
  ['الزمالك', 'downtown'],
  ['الدقي', 'mohandessin'],
  ['المقطم', 'mokattam'],
  ['التجمع الخامس', 'tagamo3'],
  ['القاهرة الجديدة', 'tagamo3'],
  ['الفيوم', 'fayoum'],
  ['قرية تونس', 'fayoum'],
  ['العين السخنة', 'sokhna'],
  // كتابة حرة جوّاها اسم منطقة
  ['كارتنج مغطى في العبور', 'obour'],
  // اللي ما نعرفهوش لازم يقع في كتلة المطابقة الأخيرة — **مش** يختفي
  ['بورسعيد', 'other'],
  ['', 'other'],
]

const errors: string[] = []

for (const [input, expect] of CASES) {
  const got = blockKeyFor(blocks, { area: input })
  if (got !== expect) {
    errors.push(`«${input || '(فاضي)'}» راحت «${got ?? 'ولا حتة'}» والمفروض «${expect}»`)
  }
}

// ⚠ الشرط الأهم: **مفيش** إدخال بيرجّع null. السبوطة ممكن تقع في الكتلة
//    الغلط وده بايظ، بس إنها تختفي خالص ده اللي كان بيحصل فعلًا.
for (const input of ['', 'حاجة غريبة خالص', '؟؟؟', 'مصر']) {
  if (blockKeyFor(blocks, { area: input }) === null) {
    errors.push(`«${input || '(فاضي)'}» رجّعت null — السبوطة هتختفي من الخريطة`)
  }
}

if (errors.length) {
  console.error(`✗ ${errors.length} مشكلة في مطابقة مناطق الخريطة:\n`)
  for (const e of errors) console.error('   ' + e)
  console.error('\n  السبوطة اللي مش بتلاقي كتلة بتختفي من الخريطة من غير أي خطأ.')
  process.exit(1)
}

console.log(`✓ ${CASES.length} حالة مطابقة على ${blocks.length} كتلة — كلها وصلت مكانها.`)
