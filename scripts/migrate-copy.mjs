/**
 * ترحيل نصوص الموقع لقاعدة البيانات.
 *
 *   node scripts/migrate-copy.mjs           → عرض بس
 *   node scripts/migrate-copy.mjs --write   → بيولّد الملفات ويستبدل بـ t()
 *
 * بيستبدل في تلات مواضع آمنة بس:
 *   1) نص جوه JSX          <div>نص</div>        →  <div>{t('key')}</div>
 *   2) خاصية JSX           placeholder="نص"     →  placeholder={t('key')}
 *   3) نص جوه جسم المكوّن   const x = 'نص'       →  const x = t('key')
 *
 * وبيتجنّب عن قصد:
 *   · القيم الافتراضية في تعريف الدالة  ({ back = 'رجوع' })  ← الخطّاف مايشتغلش هناك
 *   · الثوابت على مستوى الملف            const M = [{ label: 'نص' }]  ← بره المكوّن
 *   · مفاتيح الكائنات والفهرسة           obj['نص']  ·  { 'نص': x }
 *   · التعليقات · الأنواع · جداول الترجمة · بيانات src/data · لوحة الأدمن
 *
 * المفاتيح بتتولّد لكل شاشة على حدة، فنفس الكلمة في شاشتين ليها مفتاحين —
 * وده مقصود: تقدر تغيّر «رجوع» في شاشة من غير ما تغيّرها في التانية.
 */
import { readFileSync, writeFileSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const WRITE = process.argv.includes('--write')
const AR = /[؀-ۿ]/

const ROOTS = ['src/app', 'src/components']
const SKIP = [
  'src/app/admin',
  'src/app/layout.tsx',
  'src/components/CopyProvider.tsx',
  'src/data',
  'src/types',
  'src/lib/map-db.ts',
]

const SCREENS = [
  ['src/app/page.tsx', 'home', 'الرئيسية'],
  ['src/app/one/', 'one', 'نديها واحدة'],
  ['src/app/game/result/', 'result', 'نتيجة اللعبة'],
  ['src/app/game/', 'game', 'اللعبة'],
  ['src/app/join/', 'join', 'إنشاء الحساب'],
  ['src/app/s/mystery/', 'mystery', 'السبوطة الغامضة'],
  ['src/app/s/[slug]/pay/', 'pay', 'الدفع'],
  ['src/app/s/[slug]/done/', 'done', 'تأكيد الحجز'],
  ['src/app/s/[slug]/', 'sbota', 'صفحة السبوطة'],
  ['src/app/my/[bookingId]/chat/', 'chat', 'الشات'],
  ['src/app/my/[bookingId]/review/', 'review', 'التقييم'],
  ['src/app/my/[bookingId]/', 'group', 'كشف المجموعة'],
  ['src/app/me/chat/', 'dm', 'الشات الخاص'],
  ['src/app/me/', 'me', 'ملفي'],
  ['src/app/map/', 'map', 'الخريطة'],
  ['src/app/rules/', 'rules', 'القواعد'],
  ['src/app/captains/', 'captains', 'الكباتن'],
  ['src/app/captain/', 'captainboard', 'لوحة الكابتن'],
  ['src/app/not-found', 'notfound', 'صفحة غير موجودة'],
  ['src/components/home/', 'home', 'الرئيسية'],
  ['src/components/', 'shared', 'مكونات مشتركة'],
]

/**
 * قيم محمية: نصوص عربية بتشتغل **قيم أنواع** أو مفاتيح بيانات
 * (زي 'أول مرة' في SkillLevel و'بنت' في Gender).
 * ممنوع تتحول لـ t() وهي سترنج عادي — بس مسموح وهي نص معروض جوه JSX،
 * لأن ساعتها هي عرض مش قيمة.
 */
const PROTECTED = new Set(
  JSON.parse(readFileSync('scripts/protected-values.json', 'utf8'))
)

const screenOf = (f) => {
  const p = f.split(path.sep).join('/')
  for (const [pre, key, ar] of SCREENS) if (p.startsWith(pre)) return [key, ar]
  return ['misc', 'متفرقات']
}

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e)
    if (SKIP.some((s) => p.split(path.sep).join('/').startsWith(s))) continue
    if (statSync(p).isDirectory()) walk(p, out)
    else if (p.endsWith('.tsx')) out.push(p)
  }
  return out
}

const blank = (m) => ' '.repeat(m.length)
const stripComments = (s) =>
  s
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, blank)
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/^[ \t]*\/\/.*$/gm, blank)

/**
 * أجسام المكوّنات: من القوس المفتوح للقوس المقابل.
 * أي حاجة بره دي (زي القيم الافتراضية في التعريف) ما بتتلمسش.
 */
function componentBodies(src) {
  const bodies = []
  // دوال المكوّنات بس. forwardRef والأنواع بيتستبعدوا — جسمهم مش دالة مباشرة،
  // ولو حسبناهم بنحط الخطّاف جوه تعريف نوع.
  const re = /function\s+([A-Z]\w*)\s*\(/g
  let m
  while ((m = re.exec(src))) {
    // أول قوس مفتوح بعد التعريف
    let i = src.indexOf('{', m.index)
    if (i < 0) continue
    // لو في قوس دالة قبله، ندوّر على القوس اللي بعد ) الأخيرة
    const paren = src.indexOf('(', m.index)
    if (paren >= 0 && paren < i) {
      let depth = 0
      let j = paren
      for (; j < src.length; j++) {
        if (src[j] === '(') depth++
        else if (src[j] === ')') {
          depth--
          if (depth === 0) break
        }
      }
      i = src.indexOf('{', j)
      if (i < 0) continue
    }
    let depth = 0
    let k = i
    for (; k < src.length; k++) {
      if (src[k] === '{') depth++
      else if (src[k] === '}') {
        depth--
        if (depth === 0) break
      }
    }
    bodies.push([i, k])
  }
  return bodies
}
const inRange = (ranges, i) => ranges.some(([a, b]) => i >= a && i <= b)

const files = ROOTS.flatMap((r) => walk(r))
const entries = []
const perFile = new Map()
const counters = {}
const skipped = []

for (const file of files) {
  const raw = readFileSync(file, 'utf8')
  const clean = stripComments(raw)
  const [screen, screenAr] = screenOf(file)
  const bodies = componentBodies(clean)

  const nextKey = (kind) => {
    const k = `${screen}.${kind}`
    counters[k] = (counters[k] ?? 0) + 1
    return `${k}.${counters[k]}`
  }

  /** النص → المفتاح (لكل ملف — نفس النص في نفس الملف = مفتاح واحد) */
  const keyOf = new Map()
  const hits = []
  let m

  // 1) خاصية JSX:  attr="نص"
  const attrRe = /\b([a-zA-Z-]+)=(["'])([^"'\n]*?)\2/g
  while ((m = attrRe.exec(clean))) {
    const text = m[3].trim()
    if (!text || !AR.test(text)) continue
    hits.push({ start: m.index, end: m.index + m[0].length, text, kind: 'attr', attr: m[1] })
  }

  // 2) نص جوه JSX:  >نص<
  // (?<!=) علشان السهم => ما يتحسبش قوس JSX مفتوح
  const jsxRe = /(?<!=)>([^<>{}]*?)</g
  while ((m = jsxRe.exec(clean))) {
    const inner = m[1]
    const text = inner.replace(/\s+/g, ' ').trim()
    if (!text || !AR.test(text)) continue
    // نص JSX حقيقي بس: من غير أقواس ولا علامات تنصيص ولا مؤثرات.
    // ده بيمنع المطابقة الغلط جوه الأنواع العامة زي useState<string>('نص')
    if (/[()'"`;=<>]/.test(inner)) continue
    hits.push({ start: m.index, end: m.index + m[0].length, text, kind: 'text' })
  }

  // 3) سترنج جوه جسم المكوّن بس
  const strRe = /(.?)(["'])((?:[^"'\\\n]|\\.)*?)\2\s*(.?)/g
  while ((m = strRe.exec(clean))) {
    const [, bef, , body, aft] = m
    const text = body.trim()
    if (!text || !AR.test(text)) continue
    const start = m.index + bef.length
    if (bef === '[' || aft === ':' || aft === ']') continue
    if (/[a-zA-Z-]=$/.test(clean.slice(Math.max(0, start - 30), start))) continue // اتغطت في 1
    if (PROTECTED.has(text)) continue // قيمة نوع مش نص معروض
    if (!inRange(bodies, start)) {
      skipped.push({ file, text })
      continue
    }
    hits.push({ start, end: start + body.length + 2, text, kind: 'label' })
  }

  if (!hits.length) continue

  // شيل المتداخل، واشتغل من الآخر للأول
  hits.sort((a, b) => b.start - a.start)
  let out = raw
  let last = Infinity
  let n = 0
  for (const h of hits) {
    if (h.end > last) continue
    if (!keyOf.has(h.text)) keyOf.set(h.text, nextKey(h.kind === 'attr' ? 'label' : h.kind))
    const key = keyOf.get(h.text)
    const rep =
      h.kind === 'attr'
        ? `${h.attr}={t('${key}')}`
        : h.kind === 'text'
          ? `>{t('${key}')}<`
          : `t('${key}')`
    out = out.slice(0, h.start) + rep + out.slice(h.end)
    last = h.start
    n++
  }

  for (const [text, key] of keyOf) {
    entries.push({
      key,
      value_ar: text,
      screen: screenAr,
      context_ar: `${path.basename(file)}`,
    })
  }

  // زوّد useT
  if (!out.includes('const t = useT()')) {
    if (!out.includes("from '@/components/CopyProvider'")) {
      // بعد آخر جملة import كاملة — الاستيراد ممكن يبقى على أكتر من سطر
      const impRe = /^import [\s\S]*?from\s+'[^']+'[^\n]*\n/gm
      let lastEnd = -1
      let im
      while ((im = impRe.exec(out))) lastEnd = im.index + im[0].length
      if (lastEnd < 0) {
        const uc = out.indexOf("'use client'")
        lastEnd = uc >= 0 ? out.indexOf('\n', uc) + 1 : 0
      }
      out =
        out.slice(0, lastEnd) +
        "import { useT } from '@/components/CopyProvider'\n" +
        out.slice(lastEnd)
    }
    // الخطّاف بيتحط في **كل** مكوّن فيه استبدال — الملف الواحد ممكن يكون
    // فيه كذا مكوّن (زي Icons.tsx فيه 20).
    const bodiesOut = componentBodies(stripComments(out))
    const needing = bodiesOut.filter(([a, b]) => {
      const body = out.slice(a, b)
      return body.includes("t('") && !body.includes('const t = useT()')
    })
    if (!needing.length) {
      console.log(`⚠ ${file}: مالقيتش مكوّن أحط فيه useT`)
    }
    // من الآخر للأول علشان المواضع ما تتزحزحش
    for (const [a] of needing.sort((x, y) => y[0] - x[0])) {
      out = out.slice(0, a + 1) + '\n  const t = useT()' + out.slice(a + 1)
    }
  }

  perFile.set(file, { n, out })
}

console.log(`ملفات: ${perFile.size}  ·  استبدالات: ${[...perFile.values()].reduce((a, b) => a + b.n, 0)}  ·  مفاتيح: ${entries.length}\n`)
for (const [f, v] of [...perFile].sort((a, b) => b[1].n - a[1].n).slice(0, 12)) {
  console.log(`${String(v.n).padStart(3)}  ${f.split(path.sep).join('/')}`)
}

if (skipped.length) {
  const u = [...new Set(skipped.map((s) => `${path.basename(s.file)}: ${s.text}`))]
  console.log(`\n${u.length} نص بره أجسام المكوّنات — محتاج نقل يدوي:`)
  for (const s of u.slice(0, 20)) console.log('   ' + s)
}

if (!WRITE) {
  console.log('\nعرض بس. للتنفيذ: node scripts/migrate-copy.mjs --write')
  process.exit(0)
}

for (const [f, v] of perFile) writeFileSync(f, v.out, 'utf8')

mkdirSync('src/data', { recursive: true })
const head = [
  '/**',
  ' * نصوص احتياطية — متولّدة من scripts/migrate-copy.mjs',
  ' * الموقع بيقرأ من copy_strings في القاعدة، ودي بترجعله لو القاعدة مش متاحة.',
  ' * ما تعدّلش الملف ده بإيدك — عدّل من لوحة التحكم.',
  ' */',
  '',
  'export const copyFallback: Record<string, string> = ',
].join('\n')
writeFileSync(
  'src/data/copy-fallback.ts',
  head + JSON.stringify(Object.fromEntries(entries.map((e) => [e.key, e.value_ar])), null, 2) + '\n',
  'utf8'
)
writeFileSync('scripts/copy-seed.json', JSON.stringify(entries, null, 2), 'utf8')
console.log('\n✓ الملفات اتعدّلت · src/data/copy-fallback.ts · scripts/copy-seed.json')
