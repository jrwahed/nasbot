/**
 * بيولّد مفاتيح `case.*` و`qadeya.*` في `src/data/copy-fallback.ts` من هجرة `0136`.
 *
 * ليه سكريبت مش تعديل بالإيد: الدرس الخامس — الاحتياطي لازم يملا الناقص،
 * والمصدر الوحيد للنص هو ملف الهجرة. لو زوّدت مفتاح في الهجرة، شغّل:
 *   node scripts/sync-case-copy.mjs
 */
import { readFileSync, readdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/**
 * ⚠ بيقرا من **كل** ملفات الهجرة مش من ملف واحد. أول نسخة كانت مربوطة
 *   بـ`0136` بالاسم، فأول ما `0137` زوّدت مفاتيح `case.file.*` السكريبت
 *   قال «كله موجود» وهو مش شايفها أصلًا — فاحص بيقول «تمام» على غلط.
 */
const MIG_DIR = 'supabase/migrations'
const FB = 'src/data/copy-fallback.ts'

const sql = readdirSync(MIG_DIR)
  .filter((f) => f.endsWith('.sql'))
  .sort()
  .map((f) => readFileSync(join(MIG_DIR, f), 'utf8'))
  .join('\n')
/**
 * ⚠ **بنقرا من كتل `insert into copy_strings` بس.**
 *
 * أول نسخة كانت بتعمل regex على الملف كله، فكانت بتمسك كمان قوايم
 * المفاتيح اللي جوه دوال الاختبار:
 *
 *     where key in ('case.how.1','case.how.2', …)
 *
 * الشكل ده بيطابق «مفتاح ثم نص»، والاختبار بيجي **بعد** الإدراج في
 * الملف، فكان بيكتب فوق القيمة الصح: `case.how.1` قيمتها بقت
 * «case.how.2» حرفيًا. وظهرت على الصفحة كده بالظبط.
 *
 * ومحصلش فشل في أي فاحص — البناء عدّى و`tsc` عدّى. اتكشفت لما اتفتحت
 * الصفحة بالعين (الدرس الخمستاشر: «الكود اتكتب» مش «الصفحة بتشتغل»).
 */
const BLOCK = /insert\s+into\s+copy_strings[\s\S]*?on\s+conflict/gi
const PAIR = /\(\s*'((?:case|qadeya)\.[a-z0-9._]+)'\s*,\s*'((?:[^']|'')*)'/g

const found = new Map()
for (const block of sql.match(BLOCK) ?? []) {
  let m
  PAIR.lastIndex = 0
  while ((m = PAIR.exec(block))) found.set(m[1], m[2].replace(/''/g, "'"))
}

/**
 * حارس: أي قيمة شكلها مفتاح معناها إننا مسكنا الحاجة الغلط تاني.
 * أرخص من فاحص، وبيقع بدل ما يعدّي بالصمت.
 */
for (const [k, v] of found) {
  if (/^(case|qadeya)\.[a-z0-9._]+$/.test(v)) {
    console.error(`✗ ${k} قيمتها مفتاح تاني (${v}) — الregex مسك حاجة مش إدراج`)
    process.exit(1)
  }
}

if (!found.size) {
  console.error('✗ مفيش مفاتيح case.*/qadeya.* في الهجرات')
  process.exit(1)
}

let fb = readFileSync(FB, 'utf8')
const already = [...found.keys()].filter((k) => fb.includes(`"${k}"`))
if (already.length === found.size) {
  console.log(`✓ الاحتياطي فيه الـ${found.size} مفتاح كلهم`)
  process.exit(0)
}

const lines = [...found.entries()]
  .filter(([k]) => !fb.includes(`"${k}"`))
  .map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v)},`)

const at = fb.lastIndexOf('}')
fb = fb.slice(0, at) + lines.join('\n') + '\n' + fb.slice(at)
writeFileSync(FB, fb)
console.log(`✓ اتضاف ${lines.length} مفتاح للاحتياطي (الموجود قبلهم ${already.length})`)
