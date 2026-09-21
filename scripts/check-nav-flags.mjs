/**
 * حارس الروابط المقفولة: مفيش رابط في القايمة أو الذيل بيودّي لصفحة مقفولة.
 *
 * الغلطة اللي الحارس ده اتكتب بسببها:
 *   `/game` فضلت شهور مبنية ومترجمة وليها مفتاح ميزة — **ومفيش ولا لينك
 *   ليها**. اتصلّحت، والقاعدة اتكتبت في CLAUDE.md §9.8: «أي صفحة جديدة
 *   لازم يبقى ليها مدخل».
 *
 *   والحارس ده هو **نفس القاعدة بالمقلوب**: أي صفحة ورا مفتاح ميزة، الرابط
 *   اللي بيوديها لازم يبقى ورا **نفس المفتاح**. من غير كده المالك بيقفل
 *   `/shoghl` من اللوحة، والرابط بيفضل في القايمة، والزائر بيدوس عليه
 *   ويقع على شاشة «مقفول» — وده أسوأ من مفيش رابط.
 *
 * ⚠ ليه شكلي مش سلوكي؟ لأن «مقفول ولا لأ» بيانات وقت التشغيل (صف في
 *   `feature_flags`)، فالبناء ما بيعرفهاش. اللي بيتفحص هنا هو **الربط**:
 *   كل رابط ورا نفس مفتاح صفحته. ده الثابت الوحيد اللي ممكن يتمسك قبل
 *   النشر، وهو اللي بيمنع الباج فعلًا.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const APP = 'src/app'
/** الملفات اللي فيها قوايم روابط — كل واحد فيه مصفوفة فيها { href, flag? } */
const NAV_FILES = ['src/components/Header.tsx', 'src/components/Footer.tsx']

const errors = []

/* ١) خريطة المسار → المفتاح، من `<FeatureGate flag="…">` */

const gates = new Map() // route → flag

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      walk(p)
      continue
    }
    if (name !== 'page.tsx' && name !== 'layout.tsx') continue
    const src = readFileSync(p, 'utf8')
    const m = src.match(/<FeatureGate\s+flag="([a-z_]+)"/)
    if (!m) continue
    // `src/app/shoghl/layout.tsx` → `/shoghl` (والـlayout بيغطي كل اللي تحته)
    const route = p.slice(APP.length).replace(/\/(page|layout)\.tsx$/, '') || '/'
    gates.set(route, m[1])
  }
}
walk(APP)

if (gates.size === 0) errors.push('مفيش ولا صفحة ورا FeatureGate — الحارس مش شايف حاجة، يبقى فيه غلط.')

/** المفتاح اللي بيغطي المسار ده (هو نفسه أو أي layout فوقه) */
const flagFor = (href) => {
  for (const [route, flag] of gates) {
    if (href === route || href.startsWith(route + '/')) return flag
  }
  return null
}

/* ٢) كل رابط في القوايم لازم يبقى ورا نفس المفتاح */

for (const file of NAV_FILES) {
  const src = readFileSync(file, 'utf8')

  // `{ href: '/shoghl', key: '…', flag: 'work_sbota', … }`
  const entries = [...src.matchAll(/\{\s*href:\s*'([^']+)'([^}]*)\}/g)]
  if (entries.length === 0) {
    errors.push(`${file}: مفيش مصفوفة روابط بالشكل { href: '…' } — الحارس مش عارف يقراها.`)
    continue
  }

  for (const [, href, rest] of entries) {
    const need = flagFor(href)
    const has = rest.match(/flag:\s*'([a-z_]+)'/)?.[1] ?? null
    if (need && has !== need) {
      errors.push(
        `${file}: الرابط «${href}» بيودّي لصفحة ورا مفتاح «${need}»، ` +
          (has
            ? `والرابط ورا «${has}» — لازم يبقوا نفس المفتاح.`
            : `والرابط **مش ورا أي مفتاح**. لو المالك قفل القسم، الرابط هيفضل شغّال.`)
      )
    }
    if (!need && has) {
      errors.push(
        `${file}: الرابط «${href}» ورا مفتاح «${has}» والصفحة نفسها مش ورا FeatureGate — ` +
          `يعني القفل هيخفي الرابط والصفحة تفضل مفتوحة لأي حد معاه اللينك.`
      )
    }
  }

  /**
   * ⚠ رابط مكتوب بالحرف = بيهرب من الفحص، **حتى لو المسار في المصفوفة كمان**.
   *
   *   أول نسخة من الحارس كانت بتتخطّى أي `href` موجود في المصفوفة، وده
   *   سابه يعدّي: حد يضيف `<Link href="/map">` جنب المصفوفة، فالمصفوفة
   *   بتفلتر نسختها والنسخة المكتوبة بالحرف بتفضل ظاهرة على طول. مسكناه
   *   بفخ متعمّد وقت كتابة الحارس.
   *
   *   في التصميم ده الروابط بتتكتب `href={l.href}` بس، فأي `href="/…"`
   *   لصفحة ورا مفتاح = غلط مهما كان.
   */
  for (const [, href] of src.matchAll(/<Link[^>]*\shref="(\/[^"{]*)"/g)) {
    const need = flagFor(href)
    if (!need) continue
    errors.push(
      `${file}: فيه <Link href="${href}"> مكتوب بالحرف، والصفحة دي ورا مفتاح ` +
        `«${need}» — الروابط بتتكتب من المصفوفة بـhref={l.href}، مش بالحرف.`
    )
  }
}

/* ٣) وأي مدخل تاني في الموقع — مش القايمة والذيل بس
 *
 * ⚠ الفحص ده اتضاف لما جرّبنا القفل بعينينا: قفلنا `work_sbota` و`captains`،
 *   والرابط اختفى من القايمة والذيل فعلًا — و**الرئيسية فضلت فيها**:
 *   شريط «الشغل» بزرار «خد يومك» · دبوس اللابتوب في الخريطة الصغيرة ·
 *   وقسم «الكباتن» كامل. تلات مداخل لقسم مقفول، والحارس كان بيقول «سليم».
 *
 *   يعني القاعدة مش «القايمة والذيل» — القاعدة **أي رابط في الموقع كله**.
 *   الملف اللي فيه رابط لصفحة ورا مفتاح لازم يقرا نفس المفتاح
 *   (`useFlag('…')` أو `<FeatureGate flag="…">`).
 *
 *   الاستثناء الوحيد: صفحة **جوه** القسم المقفول نفسه — `/shoghl/pass`
 *   بتلينك لـ`/shoghl` وده تمام، الـlayout قافل الاتنين مع بعض.
 */

const SKIP = new Set(NAV_FILES)

function walkAll(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) {
      if (p.includes('/admin')) continue // اللوحة مش للزوار
      walkAll(p, out)
    } else if (name.endsWith('.tsx') && !SKIP.has(p)) {
      out.push(p)
    }
  }
  return out
}

for (const file of [...walkAll('src/components'), ...walkAll(APP)]) {
  const src = readFileSync(file, 'utf8')
  // المفتاح اللي الملف ده نفسه واقع وراه (لو صفحة جوه قسم مقفول)
  const ownRoute = file.startsWith(APP)
    ? file.slice(APP.length).replace(/\/[^/]+\.tsx$/, '') || '/'
    : null
  const ownFlag = ownRoute ? flagFor(ownRoute) : null

  for (const [, href] of src.matchAll(/href="(\/[^"{]*)"/g)) {
    const need = flagFor(href)
    if (!need || need === ownFlag) continue
    // ⚠ المشروع مخلوط بين `'` و`"` (CairoMap كلها بـ`"`) — الاتنين يعدّوا.
    const reads =
      new RegExp(`useFlag\\(['"]${need}['"]\\)`).test(src) ||
      new RegExp(`<FeatureGate\\s+flag=["']${need}["']`).test(src)
    if (!reads) {
      errors.push(
        `${file}: فيه رابط لـ«${href}» وهي ورا مفتاح «${need}»، ` +
          `والملف ما بيقراش المفتاح ده خالص — يعني القسم يتقفل والمدخل يفضل ظاهر.`
      )
    }
  }
}

if (errors.length) {
  console.error(`✗ ${errors.length} مدخل بيودّي لصفحة ممكن تكون مقفولة:\n`)
  for (const e of errors) console.error('   ' + e)
  console.error('\n   القاعدة: أي صفحة ورا مفتاح ميزة، الرابط اللي بيوديها ورا نفس المفتاح.')
  process.exit(1)
}

console.log(
  `✓ مداخل الأقسام سليمة — ${gates.size} صفحة ورا مفاتيح، وكل مدخل ليها بيقرا نفس المفتاح.`
)
