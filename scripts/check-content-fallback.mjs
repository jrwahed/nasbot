/**
 * حارس الاحتياطي: مفيش صفحة محتوى بتطلع فاضية.
 *
 * الغلطة اللي الحارس ده اتكتب بسببها:
 *   `content.ts` كان بيستعمل الاحتياطي لو **الصفحة نفسها** مش في القاعدة
 *   بس. وهجرة صفحات المحتوى بتعمل الصفحات الأربعة **من غير فقرات** —
 *   فالصفحة موجودة وفاضية، والاحتياطي عمره ما اشتغل. النتيجة إن `/about`
 *   و`/faq` كانوا بيقولوا «بنكتب الصفحة دي دلوقتي» على الموقع الحقيقي
 *   والمحتوى موجود في الكود قدامنا.
 *
 * بيتأكد من تلات حاجات — كلها بتتقرا من الملفات نفسها مش من القاعدة:
 *   ١) كل صفحة في الاحتياطي (ما عدا المسوّدات) ليها فقرات فعلًا.
 *   ٢) `content.ts` بيملا الفقرات الناقصة، مش الصفحة الناقصة بس.
 *   ٣) الصفحة المسوّدة مالهاش اسم رابط في الذيل — مسوّدة فيها أقواس
 *      `[...]` ما تظهرش للناس.
 */
import { readFileSync } from 'node:fs'

const FB = 'src/data/content-fallback.ts'
const CT = 'src/lib/content.ts'

const fb = readFileSync(FB, 'utf8')
const ct = readFileSync(CT, 'utf8')

const errors = []

/* ١) كل صفحة ليها فقرات */

const staged = new Set(
  [...(fb.match(/stagedPages\s*=\s*new Set\(\[([^\]]*)\]\)/)?.[1] ?? '').matchAll(/'([^']+)'/g)].map(
    (m) => m[1]
  )
)

// بنقسّم على تعريف كل صفحة: `  slug: {`
const pages = [...fb.matchAll(/^\s{2}([a-z]+):\s*\{$/gm)]
if (pages.length === 0) errors.push('مقدرتش أقرا الصفحات من ' + FB)

for (let i = 0; i < pages.length; i++) {
  const slug = pages[i][1]
  const from = pages[i].index
  const to = i + 1 < pages.length ? pages[i + 1].index : fb.length
  const body = fb.slice(from, to)
  const blocks = (body.match(/kind:\s*'/g) ?? []).length
  const label = body.match(/footerLabel:\s*'([^']*)'/)?.[1] ?? ''

  if (blocks === 0 && !staged.has(slug)) {
    errors.push(`${slug}: مفيش ولا فقرة في الاحتياطي — الصفحة هتطلع فاضية لو القاعدة ناقصة.`)
  }
  if (staged.has(slug) && label !== '') {
    errors.push(`${slug}: صفحة مسوّدة وليها اسم رابط «${label}» — هتبان في الذيل وهي لسه مش جاهزة.`)
  }
  // مسوّدة = مسموح فيها أقواس. المنشورة لأ.
  if (!staged.has(slug) && /\[[^\]]*من صاحب الموقع[^\]]*\]/.test(body)) {
    errors.push(`${slug}: فيه خانة [..من صاحب الموقع..] في صفحة منشورة.`)
  }
}

/* ٢) الاحتياطي بيملا الفقرات الناقصة */

if (!/page\.blocks\.length === 0/.test(ct)) {
  errors.push(
    'content.ts: مفيش فحص على `page.blocks.length === 0` — يعني صفحة موجودة وفاضية ' +
      'مش هتاخد الاحتياطي، وهتطلع «بنكتبها دلوقتي» على الموقع.'
  )
}

/* ٣) المسوّدة مقفولة في الذيل */

if (!/stagedPages/.test(ct)) {
  errors.push('content.ts: مش بيحترم stagedPages — المسوّدة ممكن تتنشر بأقواسها.')
}

if (errors.length) {
  console.error(`✗ ${errors.length} مشكلة في احتياطي صفحات المحتوى:\n`)
  for (const e of errors) console.error('   ' + e)
  process.exit(1)
}

console.log(`✓ احتياطي ${pages.length} صفحة محتوى سليم (${staged.size} مسوّدة).`)
