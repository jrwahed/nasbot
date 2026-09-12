/**
 * حارس متغيّرات قوالب الإشعارات.
 *
 * القوالب بتتخزّن في `notification_templates` وبتتعدّل من اللوحة، والكود
 * بيمرّر قيمها من `CORE` في `src/lib/server/notify.ts`. الاتنين لازم
 * يتفقوا — ولو مش متفقين، **مفيش حاجة بتفشل**: الإيميل بيوصل وفيه فراغ
 * مكان المتغيّر الناقص.
 *
 * ده حصل فعلًا: `transfer_received` كان فيه `{{1}}` وهو مش في `CORE` خالص،
 * فالإيميل كان بيوصل «وصلنا تحويلك لـ .» — من غير ما حد ياخد باله.
 *
 * الحارس ده بيقرا الاتنين من مصدرهم ويقارن:
 *   · كل `{{n}}` في القالب لازم يكون `n ≤ عدد` القيم اللي `CORE` بيبعتها.
 *   · أي قالب فيه `{{n}}` ومش في `CORE` = غلط (القيم هتوصل فاضية).
 *   · كل `{اسم}` لازم يكون اسم معروف بيتحط في `named`.
 *
 * المصدر: بذرة الهجرات (اللي بتتلزق على القاعدة). لو المالك عدّل قالب من
 * اللوحة وحط متغيّر زيادة، الحارس ده مش هيشوفه — فالفحص ده بيمسك غلطات
 * الكود، مش غلطات اللوحة.
 */
import { readFileSync, readdirSync } from 'node:fs'
import path from 'node:path'

const NOTIFY = 'src/lib/server/notify.ts'
const MIGRATIONS = 'supabase/migrations'

/** الأسماء اللي `named` بيحطها دايمًا أو من الـpayload */
const NAMED_OK = new Set([
  'name', 'link', 'day', 'days', 'venue', 'n', 'other', 'code', 'amount', 'price',
])

const src = readFileSync(NOTIFY, 'utf8')

/* ---------------------------------------- عدد القيم اللي CORE بيبعتها */

const coreBlock = src.slice(src.indexOf('const CORE'))
const coreEnd = coreBlock.indexOf('\n}\n')
const core = coreBlock.slice(0, coreEnd)

/** key: عدد القيم في args: (c) => [...] */
const argCount = new Map()
for (const m of core.matchAll(/^\s{2}([a-z_]+):\s*\{/gm)) {
  const key = m[1]
  const rest = core.slice(m.index)
  const args = rest.match(/args:\s*\(c\)\s*=>\s*\[([^\]]*)\]/)
  if (!args) continue
  const inner = args[1].trim()
  argCount.set(key, inner === '' ? 0 : inner.split(',').filter((s) => s.trim()).length)
}

if (argCount.size === 0) {
  console.error('✗ مقدرتش أقرا CORE من ' + NOTIFY + ' — الحارس ده لازم يتظبط.')
  process.exit(1)
}

/** القوالب اللي بتتبعت من مسار تاني ومش بتمر على المصرف */
const skip = new Set(
  [...(src.match(/SKIP_TEMPLATES\s*=\s*new Set\(\[([^\]]*)\]\)/)?.[1] ?? '')
    .matchAll(/'([^']+)'/g)].map((m) => m[1])
)

/* ---------------------------------------- القوالب من بذرة الهجرات */

const templates = new Map()
for (const f of readdirSync(MIGRATIONS).sort()) {
  if (!f.endsWith('.sql')) continue
  const sql = readFileSync(path.join(MIGRATIONS, f), 'utf8')
  if (!sql.includes('notification_templates')) continue
  // البذرة: ('key','channel','body', …) — الصف كله في سطر واحد
  for (const m of sql.matchAll(/\(\s*'([a-z_]+)'\s*,\s*'[a-z]+'\s*,\s*'((?:[^']|'')*)'/g)) {
    templates.set(m[1], m[2].replace(/''/g, "'"))
  }
  // التعديل: update … set body_ar = '…' where key = '…'
  // لازم نقراه كمان، وإلا الحارس بيحكم على نص قديم اتغيّر بعدين.
  for (const m of sql.matchAll(
    /update\s+notification_templates\s+set\s+body_ar\s*=\s*'((?:[^']|'')*)'\s*where\s+key\s*=\s*'([a-z_]+)'/gi
  )) {
    templates.set(m[2], m[1].replace(/''/g, "'"))
  }
}

if (templates.size === 0) {
  console.error('✗ مقدرتش ألاقي قوالب في الهجرات — الحارس ده لازم يتظبط.')
  process.exit(1)
}

/* ---------------------------------------- المقارنة */

const errors = []

for (const [key, body] of templates) {
  if (skip.has(key)) continue

  const positional = [...body.matchAll(/\{\{(\d+)\}\}/g)].map((m) => Number(m[1]))
  const named = [...body.matchAll(/\{([a-z_]+)\}/gi)].map((m) => m[1])

  if (positional.length) {
    if (!argCount.has(key)) {
      errors.push(
        `${key}: فيه ${positional.length} متغيّر مرقّم بس القالب مش في CORE — ` +
          `هيوصل فاضي. استعمل {name} و{link} بدالهم، أو ضيفه لـCORE.`
      )
    } else {
      const have = argCount.get(key)
      const max = Math.max(...positional)
      if (max > have) {
        errors.push(
          `${key}: القالب بيستعمل {{${max}}} وCORE بيبعت ${have} قيمة بس — ` +
            `{{${max}}} هيوصل فاضي.`
        )
      }
      const used = new Set(positional)
      for (let i = 1; i <= have; i++) {
        if (!used.has(i)) {
          errors.push(`${key}: CORE بيبعت ${have} قيمة والقالب مش مستعمل {{${i}}} — قيمة ضايعة.`)
        }
      }
    }
  } else if (argCount.has(key) && argCount.get(key) > 0) {
    errors.push(
      `${key}: CORE بيبعت ${argCount.get(key)} قيمة والقالب مش مستعمل ولا واحدة.`
    )
  }

  for (const n of named) {
    if (!NAMED_OK.has(n)) {
      errors.push(`${key}: {${n}} اسم مش معروف — هيوصل فاضي. المعروف: ${[...NAMED_OK].join(' · ')}`)
    }
  }
}

if (errors.length) {
  console.error(`✗ ${errors.length} مشكلة في متغيّرات قوالب الإشعارات:\n`)
  for (const e of errors) console.error('   ' + e)
  console.error('\n  الإيميل بيتبعت عادي والمتغيّر الناقص بيوصل فراغ — عشان كده الفحص ده موجود.')
  process.exit(1)
}

console.log(`✓ متغيّرات ${templates.size} قالب إشعار سليمة.`)
