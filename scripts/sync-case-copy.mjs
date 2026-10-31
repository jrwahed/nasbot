/**
 * بيولّد مفاتيح `case.*` في `src/data/copy-fallback.ts` من هجرة `0136`.
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
const re = /\(\s*'(case\.[a-z0-9._]+)'\s*,\s*'((?:[^']|'')*)'/g
const found = new Map()
let m
while ((m = re.exec(sql))) found.set(m[1], m[2].replace(/''/g, "'"))

if (!found.size) {
  console.error('✗ مفيش مفاتيح case.* في الهجرة')
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
