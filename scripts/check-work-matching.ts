/**
 * فحص مطابقة الشغل (fn_build_work_matching · work_v1 · WORK_PLAN §3).
 *
 * ⚠ فرق مقصود عن scripts/check-matching.ts:
 *   بتاعة المطابقة العادية **محتاجة قاعدة** — بتقرا .env.local، بتشتغل بمفتاح
 *   الخدمة، وبتعمل سبوطات مؤقتة بحجوزات حقيقية. الملف ده **مش محتاج قاعدة
 *   خالص**، وده عن قصد: مطابقة الشغل لسه ما اتطبّقتش على الإنتاج (الهجرة 0048
 *   في WORK_MIGRATION_3.sql لسه مستنية تتلزق في SQL Editor)، فما ينفعش الفحص
 *   يعتمد على وجودها. بدل كده بيعمل حاجتين:
 *     ١) محاكاة TypeScript **بنفس منطق الدالة بالحرف** — نفس الترتيب ونفس
 *        النقاط ونفس جولة الإصلاح — وبيتأكد من القواعد الصارمة على النتيجة.
 *     ٢) بيطبع **خطة اختبار SQL** جاهزة للّزق في SQL Editor بعد ما تشغّل
 *        الهجرة، علشان تتأكد إن الدالة الحقيقية بتطلع نفس النتيجة.
 *   لو حبيت النسخة اللي بتضرب على القاعدة زي check-matching، هي خطة الـ SQL
 *   دي بالظبط — الفرق إنها بتتشغّل بإيدك مرة واحدة بعد الهجرة.
 *
 * التشغيل: npx tsx scripts/check-work-matching.ts
 */

import { readFileSync } from 'node:fs'

let pass = 0
let fail = 0
const ok = (name: string, good: boolean, extra = '') => {
  console.log(`${good ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`)
  if (good) pass++
  else fail++
}

/* ============================================================ الأنواع */

type Style = 'silent' | 'chatty' | null
type Exp = 'under_1' | 'one_to_three' | 'three_to_five' | 'five_plus' | null

interface Person {
  id: string
  gender: 'female' | 'male' | null
  professionId: string | null
  /** depends والفاضي الاتنين حياد — الدالة بتحوّلهم null بنفس الطريقة */
  style: Style
  exp: Exp
  workNoShow: number
  paidWithPass: boolean
}

interface Rules {
  min: number
  max: number
  /** settings.work_profession_mix_max */
  mix: number
  girlsOnly: boolean
  /** settings.match_mutual_weight */
  mutualWeight: number
  /** أزواج «عايز أشتغل معاه» المتبادلة */
  affinity: [string, string][]
}

interface Deferred {
  id: string
  code: 'work_no_show' | 'profession_cap' | 'style_alone'
}

interface Group {
  members: Person[]
  why: string
  stats: {
    professions: number
    silent: number
    chatty: number
    depends: number
    expLevels: number
    girls: number
  }
}

interface Proposal {
  groups: Group[]
  deferred: Deferred[]
  headCount: number
  groupCount: number
}

const BLOCK_AT = 2 // قاعدة 6 — نفس الثابت اللي في الدالة

/* ============================================================ المحاكاة */

const styleOf = (p: Person): Style => p.style
const opposite = (s: Style): Style => (s === 'silent' ? 'chatty' : s === 'chatty' ? 'silent' : null)
const countStyle = (g: Person[], s: Style) => (s === null ? 0 : g.filter((p) => p.style === s).length)
const minority = (g: Person[]) => Math.min(countStyle(g, 'silent'), countStyle(g, 'chatty'))
const profCount = (g: Person[], prof: string | null) =>
  prof === null ? 0 : g.filter((p) => p.professionId === prof).length

/** «ليه المجموعة دي؟» — نفس بناء v_why في الدالة بالحرف */
function whyFor(g: Person[]): string {
  const profs = new Set(g.map((p) => p.professionId).filter((x): x is string => !!x)).size
  const sil = countStyle(g, 'silent')
  const cha = countStyle(g, 'chatty')
  const expLevels = new Set(g.map((p) => p.exp).filter((x): x is Exclude<Exp, null> => !!x)).size

  const head =
    profs === 0
      ? `${g.length} على ترابيزة واحدة`
      : profs === 1
        ? 'كلكم في نفس المجال'
        : profs === 2
          ? 'مجالين مختلفين'
          : `${profs} مجالات مختلفة`

  const tail =
    sil > 0 && cha === 0
      ? 'وكلكم قلتوا إنكم بتحبوا تشتغلوا في هدوء الصبح.'
      : cha > 0 && sil === 0
        ? 'وكلكم قلتوا إن الشغل عندكم بيمشي مع الكلام.'
        : sil > 0 && cha > 0
          ? 'وفيكم اللي بيحب الهدوء وفيكم اللي بيحب الكلام — الترابيزة واسعة للاتنين.'
          : 'وكلكم قلتوا إن الجو عندكم بيفرق من يوم للتاني.'

  return `${head}، ${tail}` + (expLevels >= 2 ? ' وخبراتكم مش واحدة، وده بيخلي الكلام أنفع.' : '')
}

function buildWorkMatching(all: Person[], rules: Rules): Proposal {
  // قاعدة 4 — فلتر صارم زي fn_build_matching بالحرف
  if (rules.girlsOnly && all.some((p) => p.gender !== 'female')) {
    throw new Error('السبوطة دي بنات بس، وفيه حجز مش لبنت')
  }

  // قاعدة 6 — الغياب بيمنع المقعد إلا لو الحجز بكارت
  const deferred: Deferred[] = all
    .filter((p) => p.workNoShow >= BLOCK_AT && !p.paidWithPass)
    .map((p) => ({ id: p.id, code: 'work_no_show' as const }))
  const blocked = new Set(deferred.map((d) => d.id))
  const eligible = all.filter((p) => !blocked.has(p.id))
  if (!eligible.length) throw new Error('كل الحاجزين متوقّفين بسبب الغياب')

  // عدد المجموعات — نفس حساب fn_build_matching
  const n = eligible.length
  let k = Math.ceil(n / rules.max)
  while (k > 1 && n < k * rules.min && Math.ceil(n / (k - 1)) <= rules.max) k--
  const target: number[] = []
  for (let i = 0; i < k; i++) target.push(Math.floor(n / k) + (i < n % k ? 1 : 0))

  const groups: Person[][] = Array.from({ length: k }, () => [])

  // الترتيب: الأسلوب الأندر الأول، وبعديه المجال الأكتر تكرارًا، وبعدين الـ id.
  // **مفيش سن في الترتيب ولا في النقاط — قاعدة 3.**
  const styleN = new Map<string, number>()
  const profN = new Map<string, number>()
  for (const p of eligible) {
    if (p.style) styleN.set(p.style, (styleN.get(p.style) ?? 0) + 1)
    if (p.professionId) profN.set(p.professionId, (profN.get(p.professionId) ?? 0) + 1)
  }
  const order = [...eligible].sort((a, b) => {
    const an = a.style === null ? 1 : 0
    const bn = b.style === null ? 1 : 0
    if (an !== bn) return an - bn
    const as = a.style ? (styleN.get(a.style) ?? 0) : 0
    const bs = b.style ? (styleN.get(b.style) ?? 0) : 0
    if (as !== bs) return as - bs
    if ((a.style ?? '') !== (b.style ?? '')) return (a.style ?? '') < (b.style ?? '') ? -1 : 1
    const ap = a.professionId ? (profN.get(a.professionId) ?? 0) : 0
    const bp = b.professionId ? (profN.get(b.professionId) ?? 0) : 0
    if (ap !== bp) return bp - ap
    return a.id < b.id ? -1 : 1
  })

  const affinityOf = (id: string, g: Person[]) =>
    rules.affinity.filter(
      ([x, y]) =>
        (x === id && g.some((m) => m.id === y)) || (y === id && g.some((m) => m.id === x))
    ).length

  for (const c of order) {
    let best: number | null = null
    let bestScore = -Infinity
    for (let phase = 1; phase <= 2 && best === null; phase++) {
      for (let i = 0; i < k; i++) {
        const g = groups[i]
        if (phase === 1 ? g.length >= target[i] : g.length >= rules.max) continue
        // قاعدة 1 (صارمة)
        const pn = profCount(g, c.professionId)
        if (c.professionId && pn >= rules.mix) continue

        const same = countStyle(g, styleOf(c))
        const opp = countStyle(g, opposite(styleOf(c)))
        let score = 5 * same - 8 * opp - 3 * pn
        // قاعدة 5 — مكافأة تنويع خفيفة بس
        if (c.exp && !g.some((m) => m.exp === c.exp)) score += 2
        score += rules.mutualWeight * affinityOf(c.id, g)
        score += target[i] - g.length
        if (score > bestScore) {
          bestScore = score
          best = i
        }
      }
    }
    if (best === null) {
      deferred.push({ id: c.id, code: 'profession_cap' })
      continue
    }
    groups[best].push(c)
  }

  // قاعدة 2 — جولة الإصلاح: الأقلية لازم تبقى صفر أو 2 فأكتر
  for (let round = 0; round <= k; round++) {
    const bad = groups.findIndex((g) => minority(g) === 1)
    if (bad < 0) break
    const g = groups[bad]
    const sil = countStyle(g, 'silent')
    const cha = countStyle(g, 'chatty')
    const minStyle: Style = sil <= cha ? 'silent' : 'chatty'

    // كل التبديلات الممكنة، وبناخد اللي بيخلّي المجموعتين مظبوطين
    interface Swap {
      x: Person
      y: Person
      j: number
      iMin: number
      jMin: number
    }
    const swaps: Swap[] = []
    for (const x of g) {
      for (let j = 0; j < k; j++) {
        if (j === bad) continue
        for (const y of groups[j]) {
          const ni = [...g.filter((m) => m.id !== x.id), y]
          const nj = [...groups[j].filter((m) => m.id !== y.id), x]
          if (minority(ni) === 1 || minority(nj) === 1) continue
          if (y.professionId && profCount(g.filter((m) => m.id !== x.id), y.professionId) >= rules.mix)
            continue
          if (
            x.professionId &&
            profCount(groups[j].filter((m) => m.id !== y.id), x.professionId) >= rules.mix
          )
            continue
          swaps.push({ x, y, j, iMin: minority(ni), jMin: minority(nj) })
        }
      }
    }
    swaps.sort(
      (a, b) =>
        a.iMin - b.iMin ||
        a.jMin - b.jMin ||
        a.j - b.j ||
        (a.x.id < b.x.id ? -1 : a.x.id > b.x.id ? 1 : 0) ||
        (a.y.id < b.y.id ? -1 : 1)
    )
    const s = swaps[0]
    if (s) {
      groups[bad] = [...g.filter((m) => m.id !== s.x.id), s.y]
      groups[s.j] = [...groups[s.j].filter((m) => m.id !== s.y.id), s.x]
    } else {
      const lone = [...g].filter((m) => m.style === minStyle).sort((a, b) => (a.id < b.id ? -1 : 1))[0]
      groups[bad] = g.filter((m) => m.id !== lone.id)
      deferred.push({ id: lone.id, code: 'style_alone' })
    }
  }

  return {
    groups: groups
      .filter((g) => g.length > 0)
      .map((g) => ({
        members: g,
        why: whyFor(g),
        stats: {
          professions: new Set(g.map((p) => p.professionId).filter(Boolean)).size,
          silent: countStyle(g, 'silent'),
          chatty: countStyle(g, 'chatty'),
          depends: g.filter((p) => p.style === null).length,
          expLevels: new Set(g.map((p) => p.exp).filter(Boolean)).size,
          girls: g.filter((p) => p.gender === 'female').length,
        },
      })),
    deferred,
    headCount: n,
    groupCount: k,
  }
}

/* ============================================================ القواعد الصارمة */

function assertSound(label: string, p: Proposal, input: Person[], rules: Rules) {
  const placed = p.groups.flatMap((g) => g.members.map((m) => m.id))
  const seen = new Set(placed)
  ok(
    `${label}: محدش اتكرر ومحدش ضاع`,
    seen.size === placed.length &&
      placed.length + p.deferred.length === input.length &&
      new Set([...placed, ...p.deferred.map((d) => d.id)]).size === input.length,
    `اتوزّعوا ${placed.length} · اتأجّلوا ${p.deferred.length} · الكل ${input.length}`
  )

  ok(
    `${label}: قاعدة 1 — مفيش أكتر من ${rules.mix} من نفس المجال في مجموعة`,
    p.groups.every((g) => {
      const c = new Map<string, number>()
      for (const m of g.members) if (m.professionId) c.set(m.professionId, (c.get(m.professionId) ?? 0) + 1)
      return [...c.values()].every((v) => v <= rules.mix)
    }),
    p.groups.map((g) => `[${g.stats.professions} مجال]`).join(' ')
  )

  ok(
    `${label}: قاعدة 2 — الأقلية في كل مجموعة صفر أو 2 فأكتر (مفيش 5+1)`,
    p.groups.every((g) => minority(g.members) !== 1),
    p.groups.map((g) => `${g.stats.silent}هادي/${g.stats.chatty}كلامي`).join(' · ')
  )

  ok(
    `${label}: أحجام المجموعات ما بتعديش الحد الأقصى (${rules.max})`,
    p.groups.every((g) => g.members.length <= rules.max),
    p.groups.map((g) => g.members.length).join('،')
  )

  if (rules.girlsOnly) {
    ok(
      `${label}: قاعدة 4 — كلهم بنات`,
      p.groups.every((g) => g.members.every((m) => m.gender === 'female'))
    )
  }

  ok(
    `${label}: كل مجموعة ليها «ليه المجموعة دي؟» بلغة الشغل`,
    p.groups.every((g) => g.why.trim().length > 0 && !/سن|عمر/.test(g.why)),
    p.groups[0]?.why ?? ''
  )
}

/* ============================================================ الحالات */

const P = (
  id: string,
  professionId: string | null,
  style: Style,
  exp: Exp = null,
  extra: Partial<Person> = {}
): Person => ({
  id,
  gender: 'female',
  professionId,
  style,
  exp,
  workNoShow: 0,
  paidWithPass: false,
  ...extra,
})

const RULES: Rules = { min: 4, max: 6, mix: 2, girlsOnly: false, mutualWeight: 3, affinity: [] }

function main() {
  console.log('مطابقة الشغل — محاكاة work_v1 من غير قاعدة (اقرا الترويسة)\n')

  // ===== ١) 6 ناس · 3 مجالات (2+2+2) · 4 هادي + 2 كلامي =====
  console.log('١) 6 ناس · 3 مجالات (2+2+2) · 4 هادي + 2 كلامي')
  const caseA: Person[] = [
    P('a1', 'design', 'silent', 'under_1'),
    P('a2', 'design', 'silent', 'one_to_three'),
    P('a3', 'code', 'silent', 'three_to_five'),
    P('a4', 'code', 'silent', 'five_plus'),
    P('a5', 'write', 'chatty', 'under_1'),
    P('a6', 'write', 'chatty', 'one_to_three'),
  ]
  const a = buildWorkMatching(caseA, RULES)
  for (const g of a.groups) console.log(`    ${g.members.length} ناس · ${g.why}`)
  ok('١: طلعت مجموعة واحدة', a.groups.length === 1, `عدد المجموعات ${a.groups.length}`)
  ok('١: محدش اتأجّل', a.deferred.length === 0, JSON.stringify(a.deferred))
  ok(
    '١: كل مجال قعد فيها 2 بالظبط',
    a.groups[0].stats.professions === 3 && a.groups[0].members.length === 6
  )
  ok(
    '١: الأقلية 2 مش 1 — القاعدة 2 محترمة',
    minority(a.groups[0].members) === 2,
    `${a.groups[0].stats.silent} هادي · ${a.groups[0].stats.chatty} كلامي`
  )
  ok(
    '١: الجملة بلغة الشغل وفيها عدد المجالات',
    a.groups[0].why.startsWith('3 مجالات مختلفة، '),
    a.groups[0].why
  )
  assertSound('١', a, caseA, RULES)

  // ===== ٢) 3 من مجال واحد → واحد يتأخر =====
  console.log('\n٢) 3 ناس كلهم من مجال واحد · الحد 2 من نفس المجال')
  const caseB: Person[] = [
    P('b1', 'design', 'silent'),
    P('b2', 'design', 'silent'),
    P('b3', 'design', 'silent'),
  ]
  const rulesB: Rules = { ...RULES, min: 2 }
  const b = buildWorkMatching(caseB, rulesB)
  for (const g of b.groups) console.log(`    ${g.members.length} ناس · ${g.why}`)
  console.log(`    اتأجّل: ${b.deferred.map((d) => `${d.id} (${d.code})`).join('، ') || 'محدش'}`)
  ok('٢: واحد بس اتأجّل', b.deferred.length === 1, JSON.stringify(b.deferred))
  ok('٢: سبب التأجيل هو سقف المجال', b.deferred[0]?.code === 'profession_cap')
  ok('٢: اللي فضلوا 2 في مجموعة واحدة', b.groups.length === 1 && b.groups[0].members.length === 2)
  assertSound('٢', b, caseB, rulesB)

  // ===== ٣) قاعدة 6: الغياب بيمنع المقعد إلا بكارت =====
  console.log('\n٣) الغياب: واحد غيابه 2 من غير كارت · وواحد غيابه 3 بكارت')
  const caseC: Person[] = [
    P('c1', 'design', 'silent'),
    P('c2', 'code', 'silent'),
    P('c3', 'write', 'silent'),
    P('c4', 'market', 'silent'),
    P('c5', 'design', 'silent', null, { workNoShow: 2 }),
    P('c6', 'code', 'silent', null, { workNoShow: 3, paidWithPass: true }),
  ]
  const c = buildWorkMatching(caseC, RULES)
  ok(
    '٣: اللي غيابه 2 من غير كارت ما خدش مقعد',
    c.deferred.some((d) => d.id === 'c5' && d.code === 'work_no_show')
  )
  ok(
    '٣: اللي غيابه 3 بكارت خد مقعد',
    c.groups.some((g) => g.members.some((m) => m.id === 'c6'))
  )
  assertSound('٣', c, caseC, RULES)

  // ===== ٤) قاعدة 2 الصعبة: 7 هادي · 3 كلامي · 2 حياد على مجموعتين =====
  console.log('\n٤) 12 واحد · 7 هادي · 3 كلامي · 2 «حسب اليوم» · مجموعتين 6+6')
  const profs = ['design', 'code', 'write', 'market']
  const caseD: Person[] = Array.from({ length: 12 }, (_, i) =>
    P(
      `d${String(i + 1).padStart(2, '0')}`,
      profs[i % 4],
      i < 7 ? 'silent' : i < 10 ? 'chatty' : null
    )
  )
  const rulesD: Rules = { ...RULES, min: 6, max: 6 }
  const d = buildWorkMatching(caseD, rulesD)
  for (const g of d.groups)
    console.log(`    ${g.members.length} ناس · ${g.stats.silent} هادي · ${g.stats.chatty} كلامي`)
  ok('٤: مفيش مجموعة فيها واحد بس مختلف', d.groups.every((g) => minority(g.members) !== 1))
  ok('٤: محدش اتأجّل — التبديل صلّحها', d.deferred.length === 0, JSON.stringify(d.deferred))
  assertSound('٤', d, caseD, rulesD)

  // ===== ٥) الحالة اللي مفيش لها حل: كلامي واحد وسط 11 هادي =====
  console.log('\n٥) كلامي واحد وسط 11 هادي — مفيش تبديل بيصلّحها')
  const caseE: Person[] = Array.from({ length: 12 }, (_, i) =>
    P(`e${String(i + 1).padStart(2, '0')}`, profs[i % 4], i === 0 ? 'chatty' : 'silent')
  )
  const e = buildWorkMatching(caseE, rulesD)
  ok('٥: الكلامي الوحيد اتأجّل بدل ما يقعد لوحده', e.deferred.some((x) => x.code === 'style_alone'))
  ok('٥: باقي المجموعات مظبوطة', e.groups.every((g) => minority(g.members) !== 1))
  assertSound('٥', e, caseE, rulesD)

  // ===== ٦) قاعدة 3: السن مش داخل الحسبة أصلًا =====
  console.log('\n٦) السن مش معيار')
  ok(
    '٦: مفيش birth_year ولا age في مدخلات المحاكاة ولا في الدالة',
    !/birth_year|\bage\b/.test(
      readFileSync('supabase/migrations/20260909120100_0048_work_matching.sql', 'utf8')
    ),
    'الدالة ما بتقراش عمود السن خالص'
  )

  printSqlPlan()

  console.log(`\n${pass} تمام · ${fail} فشل`)
  process.exit(fail ? 1 : 0)
}

/* ============================================================ خطة SQL */

function printSqlPlan() {
  console.log(`
────────────────────────────────────────────────────────────────────────
خطة اختبار SQL — بعد ما تلزق WORK_MIGRATION_3.sql في SQL Editor

  -- 1) الإصلاح بتاع «عايز تشوف مين تاني؟» — لازم كله «نجح»
  select * from test_pair_want();

  -- 2) الحالة الأولى: 6 ناس · 3 مجالات (2+2+2) · 4 هادي + 2 كلامي
  --    (بدّل الـ uuid دي بسبوطة شغل عندك فيها 6 حجوزات مدفوعة)
  select fn_build_work_matching('<sbota_id>');

  select r.algorithm_version,
         jsonb_array_length(r.proposal -> 'groups')   as groups,
         jsonb_array_length(r.proposal -> 'deferred') as deferred,
         g ->> 'why'   as why,
         g -> 'stats'  as stats
  from matching_runs r,
       jsonb_array_elements(r.proposal -> 'groups') g
  where r.sbota_id = '<sbota_id>'
  order by r.ran_at desc
  limit 5;

  -- المتوقع: algorithm_version = 'work_v1'
  --          مجموعة واحدة فيها 6
  --          stats.professions = 3  و  stats.silent = 4  و  stats.chatty = 2
  --          why بتبدأ بـ «3 مجالات مختلفة، »

  -- 3) الحالة التانية: خلّي 3 من نفس المجال في سبوطة صغيّرة
  update profiles set profession_id = (select id from professions where key = 'design')
   where id in ('<p1>', '<p2>', '<p3>');
  select fn_build_work_matching('<sbota_id_2>');
  -- المتوقع: proposal -> 'deferred' فيها واحد بـ code = 'profession_cap'

  -- 4) قاعدة 6 — الغياب
  update profiles set work_no_show_count = 2 where id = '<p4>';
  select fn_build_work_matching('<sbota_id_2>');
  -- المتوقع: <p4> في deferred بـ code = 'work_no_show'
  --          إلا لو حجزه paid_with_pass = true

  -- 5) الصلاحية: الزائر مالوش دعوة
  --    (شغّلها بمفتاح anon مش بمفتاح الخدمة)
  select fn_build_work_matching('<sbota_id>');   -- لازم ترفض

  -- 6) التنضيف
  delete from matching_runs where sbota_id in ('<sbota_id>', '<sbota_id_2>');
────────────────────────────────────────────────────────────────────────`)
}

main()
