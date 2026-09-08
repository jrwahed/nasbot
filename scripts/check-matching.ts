/**
 * فحص خوارزمية المطابقة (fn_build_matching) على القاعدة الحقيقية.
 *
 * بنشتغل بمفتاح الخدمة، وبنعمل سبوطات مؤقتة بحجوزات من البروفايلات الموجودة،
 * نشغّل الدالة عليها، ونتأكد من القواعد الصارمة:
 *   · كل حاجز مؤهل اتحط مرة واحدة بالظبط — لا حد ضاع ولا حد اتكرر
 *   · حجم كل مجموعة جوه حدود التمبليت
 *   · سبوطة البنات بتطلع مجموعات بنات بس، وبترفض أي حجز مش لبنت
 *   · صف matching_runs اتكتب، والـ jsonb بتاعه بنفس الشكل اللي fn_reveal بتقراه
 *   · التشغيل مرتين ما بيكررش حد
 * وفي الآخر بنمسح كل حاجة عملناها.
 *
 * التشغيل: npx tsx scripts/check-matching.ts
 */
import { readFileSync } from 'node:fs'
import { createClient } from '@supabase/supabase-js'

// بنقرا .env.local بإيدنا علشان ما نضيفش تبعية جديدة
for (const line of readFileSync('.env.local', 'utf8').split(/\r?\n/)) {
  const m = line.match(/^([A-Z0-9_]+)=(.*)$/)
  if (m) process.env[m[1]] = m[2].replace(/^"|"$/g, '')
}

const URL_ = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SRV = process.env.SUPABASE_SERVICE_ROLE_KEY!

const db = createClient(URL_, SRV, { auth: { persistSession: false } })

let pass = 0
let fail = 0
const ok = (name: string, good: boolean, extra = '') => {
  console.log(`${good ? '✓' : '✗'} ${name}${extra ? ` — ${extra}` : ''}`)
  if (good) pass++
  else fail++
}
/** حاجة مقدرناش نجرّبها — بنقولها بصوت عالي بدل ما نعدّيها كأنها نجحت */
const gap = (msg: string) => console.log(`… ${msg}`)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface Person {
  id: string
  gender: string | null
  birth_year: number | null
  social_energy: string | null
  type: string | null
  no_show_count: number
}
interface Tpl {
  id: string
  name_ar: string
  min_group: number
  max_group: number
}
interface Flag {
  code?: string
  ar?: string
}
interface PGroup {
  members?: unknown
  why?: unknown
  size?: number
  stats?: Record<string, number | null>
  flags?: Flag[]
}
interface Proposal {
  groups?: PGroup[]
  notes?: Flag[]
  head_count?: number
  group_count?: number
  girls_only?: boolean
  settings?: Record<string, number>
  size_bounds?: { min: number; max: number }
}
interface RunRow {
  id: string
  sbota_id: string
  ran_by: string
  algorithm_version: string
  approved_at: string | null
  proposal: Proposal | null
}

/** الحاجات المؤقتة اللي عملناها — بتتمسح في الآخر مهما حصل */
const madeSbotat: string[] = []
const madeRuns: string[] = []
const madePairs: { a: string; b: string }[] = []

async function seedSbota(tpl: Tpl, girlsOnly: boolean, people: string[]) {
  const starts = new Date(Date.now() + 12 * 24 * 3600 * 1000)
  const ends = new Date(starts.getTime() + 3 * 3600 * 1000)
  const { data, error } = await db
    .from('sbotat')
    .insert({
      template_id: tpl.id,
      starts_at: starts.toISOString(),
      ends_at: ends.toISOString(),
      price: 20000,
      capacity: 40,
      status: 'open',
      girls_only: girlsOnly,
    })
    .select('id')
    .single()
  if (error || !data) throw new Error(`مقدرناش نعمل سبوطة مؤقتة: ${error?.message}`)
  const id = (data as { id: string }).id
  madeSbotat.push(id)

  const { error: bErr } = await db.from('bookings').insert(
    people.map((pid) => ({ sbota_id: id, profile_id: pid, status: 'paid', price_paid: 20000 }))
  )
  if (bErr) throw new Error(`مقدرناش نحجز في السبوطة المؤقتة: ${bErr.message}`)
  return id
}

async function build(sbotaId: string) {
  const { data, error } = await db.rpc('fn_build_matching', { p_sbota: sbotaId })
  if (error) return { runId: null as string | null, error: error.message }
  const runId = String(data)
  madeRuns.push(runId)
  return { runId, error: '' }
}

async function fetchRun(runId: string) {
  const { data, error } = await db
    .from('matching_runs')
    .select('id, sbota_id, ran_by, algorithm_version, approved_at, proposal')
    .eq('id', runId)
    .single()
  if (error) throw new Error(`مقدرناش نجيب صف التشغيلة: ${error.message}`)
  return data as unknown as RunRow
}

/** الحاجزين المؤهلين زي ما الدالة بتشوفهم بالظبط */
async function eligibleOf(sbotaId: string) {
  const { data, error } = await db
    .from('bookings')
    .select('profile_id')
    .eq('sbota_id', sbotaId)
    .in('status', ['paid', 'attended'])
  if (error) throw new Error(`مقدرناش نجيب الحاجزين: ${error.message}`)
  return (data as unknown as { profile_id: string }[]).map((b) => b.profile_id)
}

/**
 * الشكل اللي fn_reveal بتقراه بالظبط:
 *   proposal -> 'groups'            مصفوفة
 *   group    -> 'members'           مصفوفة نصوص uuid  (member #>> '{}')::uuid
 *   group    ->> 'why'              نص بيتحط في sbota_groups.why_ar
 * أي مفاتيح زيادة fn_reveal ما بتلمسهاش.
 */
function readsLikeReveal(p: Proposal | null): { good: boolean; why: string } {
  if (!p || !Array.isArray(p.groups)) return { good: false, why: 'مفيش مفتاح groups مصفوفة' }
  if (p.groups.length === 0) return { good: false, why: 'مفيش ولا مجموعة' }
  for (const [i, g] of p.groups.entries()) {
    if (!Array.isArray(g.members)) return { good: false, why: `المجموعة ${i + 1} members مش مصفوفة` }
    for (const m of g.members) {
      if (typeof m !== 'string' || !UUID.test(m))
        return { good: false, why: `المجموعة ${i + 1} فيها عضو مش نص uuid` }
    }
    if (typeof g.why !== 'string' || g.why.trim() === '')
      return { good: false, why: `المجموعة ${i + 1} من غير why — why_ar هيطلع فاضي` }
  }
  return { good: true, why: '' }
}

function showGroups(p: Proposal | null) {
  for (const [i, g] of (p?.groups ?? []).entries()) {
    const s = g.stats ?? {}
    const flags = (g.flags ?? []).map((f) => f.ar).join(' · ')
    console.log(
      `    مجموعة ${i + 1}: ${(g.members as string[]).length} ناس · بنات ${s.girls ?? 0}` +
        ` (${s.girls_pct ?? 0}%) · بيبدأوا الكلام ${s.starters ?? 0} · فرق السن ${s.age_gap ?? 0}` +
        (flags ? ` · ⚠ ${flags}` : '')
    )
  }
  for (const n of p?.notes ?? []) console.log(`    ⚠ ${n.ar}`)
}

/** القواعد الصارمة على أي اقتراح */
async function assertSound(
  label: string,
  run: RunRow,
  eligible: string[],
  tpl: Tpl,
  girlsOnly: boolean,
  females: Set<string>
) {
  const p = run.proposal
  const all = (p?.groups ?? []).flatMap((g) => (g.members as string[]) ?? [])

  ok(`${label}: كل حاجز اتحط مرة واحدة بالظبط`, (() => {
    const seen = new Set(all)
    return (
      all.length === eligible.length &&
      seen.size === all.length &&
      eligible.every((e) => seen.has(e))
    )
  })(), `حاجزين ${eligible.length} · اتوزّعوا ${all.length} · مختلفين ${new Set(all).size}`)

  const sizes = (p?.groups ?? []).map((g) => ((g.members as string[]) ?? []).length)
  const sizeOk = sizes.every((n) => n >= tpl.min_group && n <= tpl.max_group)
  ok(
    `${label}: أحجام المجموعات جوه حدود التمبليت (${tpl.min_group}–${tpl.max_group})`,
    sizeOk,
    `الأحجام ${sizes.join('،')}`
  )

  const shape = readsLikeReveal(p)
  ok(`${label}: الـ jsonb بالشكل اللي fn_reveal بتقراه`, shape.good, shape.why)

  if (girlsOnly) {
    const boys = all.filter((id) => !females.has(id))
    ok(`${label}: كل اللي في المجموعات بنات`, boys.length === 0, `مش بنات: ${boys.length}`)
  }

  ok(
    `${label}: التشغيلة اتسجّلت بنسخة الخوارزمية ولسه ما اتعتمدتش`,
    /^v\d+$/.test(run.algorithm_version) && run.approved_at === null && !!p?.settings,
    `النسخة ${run.algorithm_version} · شغّلها ${run.ran_by}`
  )
}

async function main() {
  // ===== المعطيات اللي هنشتغل عليها =====
  const { data: pRows, error: pErr } = await db
    .from('profiles')
    .select('id, gender, birth_year, social_energy, type, no_show_count')
    .is('deleted_at', null)
  if (pErr) throw new Error(`مقدرناش نجيب البروفايلات: ${pErr.message}`)
  const people = (pRows ?? []) as unknown as Person[]
  const females = new Set(people.filter((p) => p.gender === 'female').map((p) => p.id))

  const { data: tRows, error: tErr } = await db
    .from('sbota_templates')
    .select('id, name_ar, min_group, max_group')
  if (tErr) throw new Error(`مقدرناش نجيب التمبليتات: ${tErr.message}`)
  const tpls = (tRows ?? []) as unknown as Tpl[]
  if (!tpls.length) throw new Error('مفيش تمبليتات في القاعدة')

  // تمبليت مجموعاته صغيّرة علشان الناس تتقسم على أكتر من مجموعة
  const small = [...tpls].sort((a, b) => a.max_group - b.max_group || a.id.localeCompare(b.id))[0]
  const wide = [...tpls].sort((a, b) => b.max_group - a.max_group || a.id.localeCompare(b.id))[0]

  console.log(`عندنا ${people.length} بروفايل (${females.size} بنت) · ${tpls.length} تمبليت\n`)
  if (people.length < small.min_group * 2) {
    gap(
      `البروفايلات في القاعدة ${people.length} بس — التقسيم على أكتر من مجموعة مش هيتجرّب بجد.`
    )
  }
  if (females.size < 2) gap('البنات في القاعدة أقل من اتنين — فحص سبوطة البنات هيبقى ضعيف.')

  try {
    // ===== ١) سبوطة مختلطة بكل الناس =====
    const mixedId = await seedSbota(small, false, people.map((p) => p.id))
    const r1 = await build(mixedId)
    ok('المختلطة: الدالة اشتغلت ورجّعت رقم تشغيلة', !!r1.runId && UUID.test(r1.runId), r1.error)
    if (r1.runId) {
      const run = await fetchRun(r1.runId)
      const el = await eligibleOf(mixedId)
      console.log(`  «${small.name_ar}» ${el.length} حاجز → ${run.proposal?.group_count} مجموعة`)
      showGroups(run.proposal)
      await assertSound('المختلطة', run, el, small, false, females)

      // ===== ٢) نشغّلها تاني: صف جديد، ومحدش بيتكرر =====
      const r2 = await build(mixedId)
      ok('التشغيل تاني: طلع صف تشغيلة جديد', !!r2.runId && r2.runId !== r1.runId, r2.error)
      if (r2.runId) {
        const run2 = await fetchRun(r2.runId)
        await assertSound('التشغيلة التانية', run2, el, small, false, females)
        const { count } = await db
          .from('matching_runs')
          .select('id', { count: 'exact', head: true })
          .eq('sbota_id', mixedId)
        ok('التشغيلتين اتسجّلوا صفّين مش أكتر', count === 2, `عدد الصفوف ${count}`)
      }

      // ===== ٢.٥) اللي اختاروا بعض المفروض يتجمّعوا =====
      // بناخد واحد من أول مجموعة وواحد من آخر مجموعة، نسجّل بينهم تاريخ حلو،
      // ونشغّل تاني — لازم يبقوا مع بعض. ده اللي بيثبت إن match_mutual_weight
      // بتتقرا فعلاً مش مكتوبة على الورق.
      const g0 = (run.proposal?.groups ?? [])[0]
      const gLast = (run.proposal?.groups ?? []).at(-1)
      if (g0 && gLast && (run.proposal?.groups ?? []).length > 1) {
        const a = (g0.members as string[])[0]
        const b = (gLast.members as string[])[0]
        const [lo, hi] = a < b ? [a, b] : [b, a] // الجدول بيطلب a_id < b_id
        const { error: aErr } = await db.from('pair_affinity').insert({
          a_id: lo,
          b_id: hi,
          a_wants_b: true,
          b_wants_a: true,
          weight: 50,
          mutual_at: new Date().toISOString(),
        })
        if (aErr) {
          gap(`مقدرناش نسجّل تاريخ حلو بين اتنين: ${aErr.message}`)
        } else {
          madePairs.push({ a: lo, b: hi })
          const r25 = await build(mixedId)
          if (r25.runId) {
            const run25 = await fetchRun(r25.runId)
            const idxOf = (id: string) =>
              (run25.proposal?.groups ?? []).findIndex((g) =>
                ((g.members as string[]) ?? []).includes(id)
              )
            ok(
              'اللي اختاروا بعض قعدوا في نفس المجموعة',
              idxOf(a) >= 0 && idxOf(a) === idxOf(b),
              `مجموعة ${idxOf(a) + 1} و ${idxOf(b) + 1}`
            )
            await assertSound('تشغيلة التاريخ الحلو', run25, el, small, false, females)
          } else {
            ok('اللي اختاروا بعض قعدوا في نفس المجموعة', false, r25.error)
          }
        }
      } else {
        gap('التوزيع طلع مجموعة واحدة — ما جرّبناش قاعدة «اختاروا بعض».')
      }
    }

    // ===== ٣) سبوطة بنات بس =====
    if (females.size >= 1) {
      const girlsId = await seedSbota(wide, true, [...females])
      const r3 = await build(girlsId)
      ok('البنات: الدالة اشتغلت', !!r3.runId, r3.error)
      if (r3.runId) {
        const run = await fetchRun(r3.runId)
        const el = await eligibleOf(girlsId)
        console.log(`  «${wide.name_ar}» بنات بس · ${el.length} حاجزة`)
        showGroups(run.proposal)
        await assertSound('البنات', run, el, wide, true, females)
      }

      // ولد في سبوطة بنات = قيد صارم مكسور، لازم ترفض
      const boy = people.find((p) => p.gender !== 'female')
      if (boy) {
        await db
          .from('bookings')
          .insert({ sbota_id: girlsId, profile_id: boy.id, status: 'paid', price_paid: 20000 })
        const r4 = await db.rpc('fn_build_matching', { p_sbota: girlsId })
        ok(
          'البنات: بترفض حجز مش لبنت بدل ما تسيبه برّه',
          !!r4.error && r4.error.message.includes('بنات بس'),
          r4.error?.message ?? 'عدّت من غير رفض!'
        )
        await db.from('bookings').delete().eq('sbota_id', girlsId).eq('profile_id', boy.id)
      } else {
        gap('مفيش ولد في القاعدة — ما جرّبناش رفض الحجز الغلط في سبوطة البنات.')
      }
    } else {
      gap('مفيش بنات في القاعدة خالص — فحص سبوطة البنات ما اتعملش.')
    }

    // ===== ٤) ناس أقل من الحد الأدنى: لازم تقول مش لازم تسكت =====
    const few = people.slice(0, Math.max(1, wide.min_group - 1))
    if (few.length < wide.min_group) {
      const tinyId = await seedSbota(wide, false, few.map((p) => p.id))
      const r5 = await build(tinyId)
      if (r5.runId) {
        const run = await fetchRun(r5.runId)
        const codes = (run.proposal?.groups ?? []).flatMap((g) =>
          (g.flags ?? []).map((f) => f.code)
        )
        const notes = (run.proposal?.notes ?? []).map((n) => n.code)
        ok(
          `الناقصين (${few.length} ناس والحد الأدنى ${wide.min_group}): بتتعلّم مش بتتخبّى`,
          codes.includes('size_below_min') && notes.includes('too_few_people'),
          [...codes, ...notes].join('،')
        )
      } else {
        ok('الناقصين: الدالة اشتغلت', false, r5.error)
      }
    }

    // ===== ٥) سبوطات حقيقية =====
    const { data: realRows } = await db
      .from('sbotat')
      .select('id, girls_only, sbota_templates(name_ar, min_group, max_group)')
      .not('id', 'in', `(${madeSbotat.join(',')})`)
    const real = (realRows ?? []) as unknown as {
      id: string
      girls_only: boolean
      sbota_templates: Tpl | Tpl[] | null
    }[]
    let tried = 0
    for (const s of real) {
      const el = await eligibleOf(s.id)
      if (!el.length) continue
      const { count: gCount } = await db
        .from('sbota_groups')
        .select('id', { count: 'exact', head: true })
        .eq('sbota_id', s.id)
      if (gCount) {
        gap(`سبوطة حقيقية فيها ${el.length} حاجز بس مجموعاتها اتكشفت خلاص — الدالة بترفضها بحق.`)
        const r = await db.rpc('fn_build_matching', { p_sbota: s.id })
        ok(
          'السبوطة المكشوفة: الدالة بترفض تعيد المطابقة عليها',
          !!r.error && r.error.message.includes('اتكشفت'),
          r.error?.message ?? 'عدّت من غير رفض!'
        )
        continue
      }
      const t = Array.isArray(s.sbota_templates) ? s.sbota_templates[0] : s.sbota_templates
      if (!t) continue
      const r = await build(s.id)
      ok(`سبوطة حقيقية (${el.length} حاجز): الدالة اشتغلت`, !!r.runId, r.error)
      if (r.runId) {
        const run = await fetchRun(r.runId)
        showGroups(run.proposal)
        await assertSound('السبوطة الحقيقية', run, el, { ...t, id: '' }, s.girls_only, females)
      }
      tried++
    }
    if (tried === 0) {
      gap(
        'مفيش في القاعدة سبوطة حقيقية فيها حاجزين ولسه ما اتكشفتش — كل الفحص اتعمل على سبوطات مؤقتة.'
      )
    }

    // ===== ٦) الصلاحية: الزائر مالوش دعوة =====
    const guest = createClient(URL_, ANON, { auth: { persistSession: false } })
    const gr = await guest.rpc('fn_build_matching', { p_sbota: mixedId })
    ok('الزائر مش بيقدر يشغّل المطابقة', !!gr.error, gr.error?.message)
  } finally {
    // ===== التنضيف: كل حاجة عملناها بتتمسح =====
    if (madeRuns.length) await db.from('audit_log').delete().in('entity_id', madeRuns)
    for (const p of madePairs) {
      await db.from('pair_affinity').delete().eq('a_id', p.a).eq('b_id', p.b)
    }
    if (madeSbotat.length) {
      const { error } = await db.from('sbotat').delete().in('id', madeSbotat)
      if (error) console.error(`✗ مقدرناش نمسح السبوطات المؤقتة: ${error.message}`)
      else console.log(`\nنضّفنا ${madeSbotat.length} سبوطة مؤقتة وحجوزاتها.`)
    }
  }

  console.log(`\n${pass} تمام · ${fail} فشل`)
  process.exit(fail ? 1 : 0)
}

main().catch((e: unknown) => {
  console.error(`✗ الفحص وقع: ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
})
