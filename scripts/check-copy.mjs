/**
 * حارس النصوص — بيفشل لو لقى نص عربي معروض في أي مكوّن.
 * بيشتغل جوه `npm run verify` وفي الـ CI.
 *
 * اللي بيتشال قبل الفحص (مش نص معروض):
 *   التعليقات        — بسطر لوحدها أو في آخر السطر
 *   القيم المحميّة    — scripts/protected-values.json: قيم أنواع زي 'بنت' و'أول مرة'
 *                      دي جزء من نظام الأنواع ومن جداول الترجمة، مش محتوى بيتقرا
 *
 * الملفات المستثناة:
 *   src/types          قيم أنواع
 *   src/lib/map-db.ts  جداول ترجمة عربي↔إنجليزي — بنية مش محتوى
 *   src/data           نصوص احتياطية، أصلها في القاعدة
 *   src/app/admin      نصوص اللوحة بتفضل في الكود عن قصد — اللوحة أداة داخلية
 *   AdminShell.tsx     نفس السبب: مكوّن للوحة مش للموقع
 *   src/app/layout.tsx الميتاداتا بتتقرا على الخادم مش من hook
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const AR = /[؀-ۿ]/
const ROOTS = ['src/app', 'src/components']
const SKIP = [
  'src/app/admin',
  'src/components/AdminShell.tsx',
  'src/components/admin-ui.tsx',
  'src/app/layout.tsx',
  'src/components/CopyProvider.tsx',
  'src/data',
  'src/types',
  'src/lib/map-db.ts',
]

const PROTECTED = JSON.parse(readFileSync('scripts/protected-values.json', 'utf8'))
  .slice()
  .sort((a, b) => b.length - a.length)

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = path.join(dir, e)
    if (SKIP.some((s) => p.split(path.sep).join('/').startsWith(s))) continue
    if (statSync(p).isDirectory()) walk(p, out)
    else if (p.endsWith('.tsx')) out.push(p)
  }
  return out
}

/** بيفضّي التعليق مسافات بس بيسيب أسطر جديدة مكانها — علشان أرقام السطور تفضل صح */
const blank = (m) => m.replace(/[^\n]/g, ' ')

/** يشيل تعليق آخر السطر — بس لو الـ // مش جوه نص */
function dropTrailingComment(line) {
  let q = null
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) {
      if (c.charCodeAt(0) === 92) i++
      else if (c === q) q = null
    } else if (c === "'" || c === '"' || c === '`') q = c
    else if (c === '/' && line[i + 1] === '/') return line.slice(0, i)
  }
  return line
}

const stripBlocks = (s) =>
  s.replace(/\{\/\*[\s\S]*?\*\/\}/g, blank).replace(/\/\*[\s\S]*?\*\//g, blank)

const bad = []

for (const file of ROOTS.flatMap((r) => walk(r))) {
  const src = stripBlocks(readFileSync(file, 'utf8'))
  src.split('\n').forEach((raw, i) => {
    let line = dropTrailingComment(raw)
    if (!AR.test(line)) return
    // القيم المحميّة مش محتوى — نشيلها ونشوف فاضل عربي ولا لأ
    for (const v of PROTECTED) line = line.split(v).join('')
    if (!AR.test(line)) return
    bad.push(`${file.split(path.sep).join('/')}:${i + 1}  ${raw.trim().slice(0, 88)}`)
  })
}

const MAX = Number(process.env.MAX || 40)

if (bad.length) {
  console.error('\n✗ لقينا ' + bad.length + ' سطر فيه نص عربي في مكوّن.')
  console.error("  كل نص معروض لازم يتنقل لـ copy_strings ويتنادى بـ t('key').\n")
  for (const b of bad.slice(0, MAX)) console.error('   ' + b)
  if (bad.length > MAX) console.error('   … و' + (bad.length - MAX) + ' كمان')
  console.error('')
  process.exit(1)
}

console.log('✓ مفيش نص عربي في المكونات — كله جاي من قاعدة البيانات.')
