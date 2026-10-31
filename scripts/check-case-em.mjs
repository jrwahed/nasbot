#!/usr/bin/env node
/**
 * حارس: نص القضية ما يتعرضش من غير <Em>.
 *
 * ليه: محتوى «قضية الليلة» في القاعدة مكتوب بـ`**تشديد**` (ماركداون) على
 * الكلمة المهمة — «تطلعوا بـ**اسمين**». أي مكان بيعرض النص مباشرة
 * (`{doc.goal}`) بيوري النجوم للعضو حرفيًا. اتكشف على الإنتاج ٢٠٢٦-١٠-٣١
 * بعد ما المالك فتح `/qadeya` ولقى `**اسمين**` باينة.
 *
 * الحارس بيدوّر على أي تعبير JSX مباشر `{شيء.حقل}` لحقول القصة، ويفشل لو
 * مش ملفوف في `<Em text={…} />`. مفيش فاحص تاني بيمسك ده: المفتاح موجود،
 * والنص موجود، و`tsc` والبناء بيعدّوا.
 *
 * ⚠ `/admin/**` مستثنى عن قصد — المالك بيعدّل النص الخام هناك، فالمفروض
 *   يشوف التشديد زي ما هو.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const ROOTS = ['src/components/case', 'src/app/qadeya', 'src/app/play', 'src/app/my']

// حقول القصة اللي ممكن تيجي من القاعدة بتشديد
const FIELDS = [
  'report', 'scene', 'goal', 'intro', 'card', 'mission', 'ending', 'twist',
  'riddle', 'hint', 'detectiveCard', 'suspectCard', 'act2Event', 'winEnding', 'escapeEnding',
]

function walk(dir, out = []) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return out
  }
  for (const e of entries) {
    const p = join(dir, e)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.tsx?$/.test(p)) out.push(p)
  }
  return out
}

const files = ROOTS.flatMap((r) => walk(r))
const bad = []

for (const f of files) {
  const src = readFileSync(f, 'utf8')
  const lines = src.split('\n')
  lines.forEach((line, i) => {
    for (const field of FIELDS) {
      // {x.field} أو {x.field ?? '…'} — تعبير مباشر مش جوه <Em text={…}>
      const re = new RegExp(`\\{\\s*[A-Za-z_$][\\w$]*\\.${field}\\b[^}]*\\}`, 'g')
      for (const m of line.matchAll(re)) {
        const before = line.slice(0, m.index)
        if (/<Em\s+text=$/.test(before)) continue // ده هو الصح
        if (/^\s*(\/\/|\*)/.test(line)) continue // تعليق
        bad.push(`${f}:${i + 1}  ${m[0]}`)
      }
    }
  })
}

if (bad.length) {
  console.error('✗ نص قضية بيتعرض من غير <Em> — التشديد (**) هيبان للعضو حرفيًا:\n')
  for (const b of bad) console.error('   ' + b)
  console.error('\n   الصح: <Em text={doc.goal} />  (src/components/case/Em.tsx)')
  process.exit(1)
}

console.log(`✓ نص القضايا كله ماشي على <Em> — ${files.length} ملف متفحوص.`)
