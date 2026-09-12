/**
 * حارس الحزم: ملف `WORK_MIGRATION_N.sql` = ملفات الهجرة اللي جواه بالحرف.
 *
 * الغلطة اللي الحارس ده اتكتب بسببها:
 *   `0065` كانت بتقفل «عجل» و`0075` بترجّعها، فاللي يتلزق آخر يكسب. صلّحنا
 *   المشكلة بإننا حصّنّا **ملف الهجرة** `0065` (بقى ما يقفلش لو حارس 0075
 *   موجود) وكتبنا الدرس في CLAUDE.md وقلنا خلصت.
 *
 *   بس المالك ما بيلزقش ملفات الهجرة — بيلزق `WORK_MIGRATION_6.sql`. والحزمة
 *   دي **ما اتجدّدتش**، فالسطر القديم غير المحصّن فضل فيها. يعني التصليح
 *   كان في الريبو بس، والباج لسه حي على الإنتاج. اكتشفناه بالصدفة وإحنا
 *   بنجرّب حاجة تانية.
 *
 *   الدرس: أي تصليح في ملف هجرة **لازم** يتجدّد في حزمته. مفيش «اتصلّح»
 *   من غير ما يوصل للملف اللي بيتلزق فعلًا.
 *
 * الحزمة مسموح ليها تزوّد حاجة واحدة بس: ترويسة عربية في الأول وخاتمة
 * («شغّل الدوال دي») في الآخر — دول للمالك مش SQL بيغيّر حاجة.
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const HDR = /^-- #{20,}\n-- # (\S+\.sql)\n-- #{20,}\n/gm
const MIG = 'supabase/migrations'

/**
 * حزم قديمة اتلزقت من زمان واتكتبت بالإيد قبل ما يبقى فيه نمط ترويسة —
 * أقسامها مسمّاة بالرقم («0050 — أغلفة صلاحيات اللوحة») مش باسم الملف،
 * فمفيش طريقة نقارنها آليًا. **القايمة دي مقفولة**: أي حزمة جديدة من غير
 * ترويسات بتفشل البناء بدل ما تعدّي بالصمت. متزوّدش فيها.
 */
const LEGACY = new Set(['WORK_MIGRATION_1.sql', 'WORK_MIGRATION_4.sql'])

const bundles = readdirSync('.')
  .filter((f) => /^WORK_MIGRATION_\d+[A-Z]?\.sql$/.test(f))
  .sort((a, b) => a.length - b.length || a.localeCompare(b))

const errors = []
let sections = 0
let legacy = 0

for (const b of bundles) {
  const s = readFileSync(b, 'utf8')
  const ms = [...s.matchAll(HDR)]
  if (ms.length === 0 && LEGACY.has(b)) {
    legacy++
    continue
  }
  if (ms.length === 0) {
    errors.push(`${b}: مفيش ولا قسم بترويسة «-- # <ملف>.sql» — الحارس مش عارف يقراها.`)
    continue
  }
  for (let i = 0; i < ms.length; i++) {
    sections++
    const name = ms[i][1]
    const from = ms[i].index + ms[i][0].length
    const to = i + 1 < ms.length ? ms[i + 1].index : s.length
    let body = s.slice(from, to).replace(/^\n+|\n+$/g, '')

    let src
    try {
      src = readFileSync(join(MIG, name), 'utf8').replace(/^\n+|\n+$/g, '')
    } catch {
      errors.push(`${b}: القسم «${name}» مالوش ملف هجرة في ${MIG}/.`)
      continue
    }

    // الخاتمة للمالك مسموحة في آخر قسم بس، ولازم تبقى تعليقات بالكامل
    if (i + 1 === ms.length && body.startsWith(src) && body.length > src.length) {
      const tail = body.slice(src.length)
      const code = tail
        .split('\n')
        .filter((l) => l.trim() && !l.trimStart().startsWith('--'))
      if (code.length === 0) body = src
      else errors.push(`${b}: فيه SQL بعد «${name}» مش موجود في ملف الهجرة:\n      ${code[0]}`)
    }

    if (body !== src) {
      const bl = body.split('\n')
      const sl = src.split('\n')
      let k = 0
      while (k < bl.length && k < sl.length && bl[k] === sl[k]) k++
      errors.push(
        `${b}: القسم «${name}» مختلف عن ملف الهجرة — أول فرق في سطر ${k + 1}:\n` +
          `      الحزمة: ${JSON.stringify(bl[k] ?? '(انتهى)')}\n` +
          `      الهجرة: ${JSON.stringify(sl[k] ?? '(انتهى)')}`
      )
    }
  }
}

if (errors.length) {
  console.error(`✗ ${errors.length} حزمة/قسم مش متطابق مع ملفات الهجرة:\n`)
  for (const e of errors) console.error('   ' + e)
  console.error(
    '\n   الحزمة هي اللي المالك بيلزقها فعلًا. تصليح في ملف الهجرة لوحده = تصليح مش واصل.'
  )
  process.exit(1)
}

console.log(
  `✓ ${bundles.length - legacy} حزمة (${sections} قسم) مطابقة لملفات الهجرة` +
    (legacy ? ` · ${legacy} حزمة قديمة مستثناة.` : '.')
)
