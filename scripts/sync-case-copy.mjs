/**
 * بيولّد مفاتيح `case.*` في `src/data/copy-fallback.ts` من هجرة `0136`.
 *
 * ليه سكريبت مش تعديل بالإيد: الدرس الخامس — الاحتياطي لازم يملا الناقص،
 * والمصدر الوحيد للنص هو ملف الهجرة. لو زوّدت مفتاح في الهجرة، شغّل:
 *   node scripts/sync-case-copy.mjs
 */
import { readFileSync, writeFileSync } from 'node:fs'

const MIG = 'supabase/migrations/20261031180000_0136_cases_copy.sql'
const FB = 'src/data/copy-fallback.ts'

const sql = readFileSync(MIG, 'utf8')
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
