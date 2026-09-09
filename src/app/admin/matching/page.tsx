'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AdminShell } from '@/components/AdminShell'
import { supabase } from '@/lib/supabase'
import { revalidateSite, rejected } from '@/lib/admin'
import type { AdminMe } from '@/lib/admin'
import {
  ADMIN_PAGE_SIZE,
  ADMIN_SCAN_MAX,
  Btn,
  Card,
  Empty,
  Loading,
  NumberField,
  Pager,
  SelectField,
  Stat,
  Table,
  Tabs,
  Tag,
  day,
  useFlash,
  when,
} from '@/components/admin-ui'

/**
 * المطابقة.
 *
 * الخوارزمية اللي بتقسّم الناس على المجموعات **موجودة في الكود** — الصفحة دي
 * ما بتعيدش كتابتها. اللي بيتعدّل هنا حاجتين بس:
 *   ١) الأوزان والقواعد اللي الخوارزمية بتشتغل بيها (أعمدة match_* في settings).
 *   ٢) مراجعة التوزيع المقترح قبل اعتماده، مع إمكانية تنقيل حد من مجموعة للتانية.
 *
 * الاعتماد بيتنادى بـ fn_reveal في القاعدة — هي اللي بتعمل المجموعات وغرف
 * الشات وبتبعت رسايل الكشف. ممنوع نعمل ده بإيدينا.
 *
 * الترقيم من القاعدة (مراجعة A17): جدول «اللي اتشغّل قبل كده» كان بيجيب ٢٠٠
 * تشغيلة و٥٠٠ نتيجة مرة واحدة. دلوقتي بصفحة `.range()` مع `{ count: 'exact' }`
 * وفلتر سبوطة بيتنفّذ في القاعدة، والنتايج بتتجاب **للصفحة دي بس** بفلتر
 * `!inner` على السبوطة. تبويب «المجموعات» بيشتغل على سبوطة واحدة (٨ في
 * المجموعة) فمالوش لازمة ترقيم.
 *
 * قايمة السبوطات في الـ dropdown فهرس — أعمدة قليلة ومسقوفة بـ ADMIN_SCAN_MAX.
 */

/* ---------------------------------------------------------- أنواع */

interface TplRef {
  name_ar: string
}

interface SbotaRow {
  id: string
  starts_at: string
  capacity: number
  status: string
  girls_only: boolean
  /** سبوطة شغل؟ لو أيوه بتتشغّل عليها مطابقة work_v1 مش الأصلية */
  is_work: boolean
  sbota_templates: TplRef | TplRef[] | null
}

interface SettingsRow {
  match_max_age_gap: number
  match_min_starters: number
  match_girls_ratio_min: number
  match_girls_ratio_max: number
  match_mutual_weight: number
  match_no_show_limit: number
  algorithm_version: number
}

interface ProposalGroup {
  members?: string[]
  why?: string
}

interface SbotaRef {
  starts_at: string
  sbota_templates: TplRef | TplRef[] | null
}

interface RunRow {
  id: string
  sbota_id: string
  ran_at: string
  ran_by: string
  algorithm_version: string
  proposal: { groups?: ProposalGroup[] } | null
  approved_at: string | null
  approved_by: string | null
  sbotat: SbotaRef | SbotaRef[] | null
}

interface GroupRow {
  id: string
  sbota_id: string
  index: number
  why_ar: string | null
  chat_room_id: string | null
}

interface OutcomeRow {
  group_id: string
  avg_group_score: number | null
  attendance_rate: number | null
  computed_at: string
  sbota_groups: { sbota_id: string } | { sbota_id: string }[] | null
}

interface PersonRef {
  id: string
  first_name: string | null
  gender: string | null
  birth_year: number | null
  social_energy: string | null
  no_show_count: number
}

interface MemberRow {
  id: string
  profile_id: string
  group_id: string | null
  status: string
  profiles: PersonRef | PersonRef[] | null
}

/* ---------------------------------------------------------- مساعدات */

function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

const tplName = (t: TplRef | TplRef[] | null | undefined) => one(t ?? null)?.name_ar ?? 'سبوطة'

const sbotaLabel = (s: SbotaRow) =>
  `${tplName(s.sbota_templates)} · ${day(s.starts_at)}${s.is_work ? ' · شغل' : ''}`

const personName = (p: PersonRef | null) => p?.first_name?.trim() || 'من غير اسم'

const ageOf = (p: PersonRef | null) =>
  p?.birth_year ? new Date().getFullYear() - p.birth_year : null

/**
 * بيثبّت دالة الرسايل.
 *
 * useFlash بترجّع دالة جديدة مع كل رسم، ولو دخلت في deps بتاعة التحميل
 * كنا هنفضل نعيد التحميل مع كل رسالة — وأي رسالة خطأ كانت هتلف في نفسها.
 */
function useSay(fn: (m: string) => void) {
  const ref = useRef(fn)
  useEffect(() => {
    ref.current = fn
  })
  return useCallback((m: string) => ref.current(m), [])
}

const ENERGY: Record<string, string> = {
  starter: 'بيبدأ الكلام',
  responder: 'بيرد ويشارك',
  listener: 'بيسمع أكتر',
  one_on_one: 'واحد لواحد',
}

/** الأوزان اللي الخوارزمية بتقراها — النص جنب كل واحد بيقول بيغيّر إيه بالظبط */
const KNOBS: {
  key: keyof SettingsRow
  label: string
  hint: string
  min: number
  max: number
  suffix?: string
}[] = [
  {
    key: 'match_max_age_gap',
    label: 'أكبر فرق سن',
    hint: 'أكبر فرق سن مسموح بيه جوه المجموعة الواحدة — لو زوّدته هتلاقي أعمار متباعدة مع بعض.',
    min: 1,
    max: 40,
    suffix: 'سنة',
  },
  {
    key: 'match_min_starters',
    label: 'أقل عدد «بيبدأ الكلام»',
    hint: 'كل مجموعة لازم يكون فيها العدد ده على الأقل من اللي مسجّلين إنهم بيبدأوا الكلام، علشان القعدة ما تسكتش.',
    min: 0,
    max: 8,
    suffix: 'واحد',
  },
  {
    key: 'match_girls_ratio_min',
    label: 'أقل نسبة بنات',
    hint: 'أقل نسبة بنات مقبولة في المجموعة المختلطة — تحتها الخوارزمية بتعيد التوزيع.',
    min: 0,
    max: 100,
    suffix: '%',
  },
  {
    key: 'match_girls_ratio_max',
    label: 'أكبر نسبة بنات',
    hint: 'أكبر نسبة بنات مقبولة في المجموعة المختلطة — فوقها بتعيد التوزيع كمان.',
    min: 0,
    max: 100,
    suffix: '%',
  },
  {
    key: 'match_mutual_weight',
    label: 'وزن «اختاروا بعض»',
    hint: 'لما اتنين يكونوا اتقابلوا قبل كده واختاروا بعض، الرقم ده بيقول للخوارزمية تحاول تجمعهم أد إيه.',
    min: 0,
    max: 10,
  },
  {
    key: 'match_no_show_limit',
    label: 'حد الغياب',
    hint: 'اللي مجاش أكتر من العدد ده بيتشال من التوزيع الأوتوماتيكي ويتحط في المراجعة اليدوي.',
    min: 0,
    max: 10,
    suffix: 'مرة',
  },
  {
    key: 'algorithm_version',
    label: 'نسخة الخوارزمية',
    hint: 'رقم النسخة اللي بتشتغل دلوقتي. ما تلعبش فيه غير لما اللي كاتب الكود يقولك في نسخة جديدة جاهزة.',
    min: 1,
    max: 99,
  },
]

const TABS = [
  { id: 'weights', label: 'الأوزان' },
  { id: 'runs', label: 'التشغيلات' },
  { id: 'groups', label: 'المجموعات' },
] as const
type TabId = (typeof TABS)[number]['id']

const UNASSIGNED = 'none'

/* ---------------------------------------------------------- الصفحة */

export default function AdminMatchingPage() {
  return (
    <AdminShell title="المطابقة" needs="matching.view">
      {(me) => <MatchingEditor me={me} />}
    </AdminShell>
  )
}

function MatchingEditor({ me }: { me: AdminMe }) {
  const canRun = me.permissions.has('matching.run')
  const canApprove = me.permissions.has('matching.approve')
  const canTuneWeights = canRun || me.permissions.has('settings.edit')

  const [tab, setTab] = useState<TabId>('weights')
  const [sbotat, setSbotat] = useState<SbotaRow[]>([])
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const { flash, node } = useFlash()

  useEffect(() => {
    ;(async () => {
      const { data, error } = await supabase()
        .from('sbotat')
        .select('id, starts_at, capacity, status, girls_only, is_work, sbota_templates(name_ar)')
        .order('starts_at', { ascending: false })
        .range(0, ADMIN_SCAN_MAX - 1)
      if (error) setErr(error.message)
      setSbotat((data ?? []) as unknown as SbotaRow[])
      setLoading(false)
    })()
  }, [])

  if (loading) return <Loading />

  if (err) {
    return (
      <div className="mt-6">
        <Card title="مقدرناش نجيب السبوطات" hint={err}>
          <div className="mt-2 font-body text-14" style={{ color: 'var(--muted)' }}>
            اعمل تحديث للصفحة، ولو فضلت كده كلّم اللي شغّال على القاعدة.
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <Tabs tabs={TABS.map((t) => ({ id: t.id, label: t.label }))} value={tab} onChange={setTab} />

      {node}

      {tab === 'weights' && <WeightsTab canEdit={canTuneWeights} flash={flash} />}
      {tab === 'runs' && <RunsTab sbotat={sbotat} canRun={canRun} flash={flash} />}
      {tab === 'groups' && (
        <GroupsTab sbotat={sbotat} canRun={canRun} canApprove={canApprove} flash={flash} />
      )}
    </div>
  )
}

/* ============================================================ الأوزان */

function WeightsTab({
  canEdit,
  flash: rawFlash,
}: {
  canEdit: boolean
  flash: (m: string) => void
}) {
  const flash = useSay(rawFlash)
  const [row, setRow] = useState<SettingsRow | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    ;(async () => {
      const { data, error } = await supabase()
        .from('settings')
        .select(
          'match_max_age_gap, match_min_starters, match_girls_ratio_min, match_girls_ratio_max, match_mutual_weight, match_no_show_limit, algorithm_version'
        )
        .limit(1)
        .maybeSingle()
      if (error) flash(`مقدرناش نجيب الإعدادات: ${error.message}`)
      setRow((data ?? null) as unknown as SettingsRow | null)
      setLoading(false)
    })()
  }, [flash])

  async function save(key: keyof SettingsRow, value: number) {
    const { data, error } = await supabase()
      .from('settings')
      .update({ [key]: value })
      .eq('id', true)
      .select('id')
    if (error) {
      flash(`مقدرناش نحفظ: ${error.message}`)
      return
    }
    if (rejected(data)) {
      flash('مااتحفظش — القاعدة رفضت الكتابة، محتاج صلاحية matching.edit')
      return
    }
    setRow((r) => (r ? { ...r, [key]: value } : r))
    await revalidateSite()
    flash('اتحفظ ✓ — هيشتغل بيه في أول مطابقة جاية')
  }

  if (loading) return <Loading />
  if (!row) return <Empty>مفيش صف إعدادات في القاعدة.</Empty>

  const ratioBad = row.match_girls_ratio_min > row.match_girls_ratio_max

  return (
    <div className="mt-5 flex flex-col gap-4">
      <Card
        title="الخوارزمية نفسها في القاعدة"
        hint="الصفحة دي مش بتقسّم الناس — دي بتظبط الأرقام اللي التقسيم بيمشي عليها."
      >
        <div className="mt-2 font-body text-14" style={{ color: 'var(--muted)' }}>
          اللي بيقرر مين مع مين مكتوب في دالة fn_build_matching في القاعدة ومش بيتعدّل من
          اللوحة. اللي تحت ده هو المفاتيح اللي الدالة بتقراها في كل تشغيلة، فأي رقم بتغيّره هنا
          بيبان في المطابقة الجاية — مش في التوزيعات اللي اتعملت خلاص.
        </div>
      </Card>

      {!canEdit && (
        <div className="font-body text-14" style={{ color: 'var(--muted)' }}>
          أنت بتتفرّج بس — تظبيط الأوزان محتاج صلاحية matching.run.
        </div>
      )}

      {ratioBad && (
        <div className="font-body text-14" style={{ color: 'var(--err-text)' }}>
          أقل نسبة بنات أكبر من أكبر نسبة — بالشكل ده مفيش مجموعة مختلطة هتعدّي. ظبّط الرقمين.
        </div>
      )}

      <Card>
        <div className="mt-2 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {KNOBS.map((k) => (
            <div key={k.key} style={{ opacity: canEdit ? 1 : 0.6 }}>
              <NumberField
                label={k.label}
                value={row[k.key]}
                min={k.min}
                max={k.max}
                suffix={k.suffix}
                hint={k.hint}
                onSave={(v) => {
                  if (!canEdit) return
                  if (v < k.min || v > k.max) {
                    flash(`${k.label} لازم يكون بين ${k.min} و ${k.max}.`)
                    return
                  }
                  save(k.key, v)
                }}
              />
            </div>
          ))}
        </div>
      </Card>
    </div>
  )
}

/* ============================================================ التشغيلات */

function RunsTab({
  sbotat,
  canRun,
  flash: rawFlash,
}: {
  sbotat: SbotaRow[]
  canRun: boolean
  flash: (m: string) => void
}) {
  const flash = useSay(rawFlash)
  const [runs, setRuns] = useState<RunRow[] | null>(null)
  const [outcomes, setOutcomes] = useState<OutcomeRow[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [page, setPage] = useState(0)
  const [busy, setBusy] = useState(false)
  /** فلتر جدول التشغيلات — مستقل عن السبوطة اللي هتتشغّل عليها المطابقة */
  const [only, setOnly] = useState('all')
  const [pick, setPick] = useState(sbotat[0]?.id ?? '')
  const [running, setRunning] = useState(false)

  const reload = useCallback(async () => {
    setRuns(null)
    setBusy(true)
    const db = supabase()
    let query = db
      .from('matching_runs')
      .select(
        'id, sbota_id, ran_at, ran_by, algorithm_version, proposal, approved_at, approved_by, sbotat(starts_at, sbota_templates(name_ar))',
        { count: 'exact' }
      )
      .order('ran_at', { ascending: false })
    if (only !== 'all') query = query.eq('sbota_id', only)

    const r = await query.range(
      page * ADMIN_PAGE_SIZE,
      page * ADMIN_PAGE_SIZE + ADMIN_PAGE_SIZE - 1
    )
    setBusy(false)
    if (r.error) {
      flash(`مقدرناش نجيب التشغيلات: ${r.error.message}`)
      setRuns([])
      setTotal(0)
      return
    }
    const list = (r.data ?? []) as unknown as RunRow[]
    setRuns(list)
    setTotal(r.count ?? null)

    // النتايج بتاعت سبوطات الصفحة دي بس — `!inner` بيخلي الفلتر يتنفّذ في القاعدة
    const ids = Array.from(new Set(list.map((x) => x.sbota_id).filter(Boolean)))
    if (!ids.length) return setOutcomes([])
    const { data: o } = await db
      .from('matching_outcomes')
      .select(
        'group_id, avg_group_score, attendance_rate, computed_at, sbota_groups!inner(sbota_id)'
      )
      .in('sbota_groups.sbota_id', ids)
      .range(0, ADMIN_SCAN_MAX - 1)
    setOutcomes((o ?? []) as unknown as OutcomeRow[])
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flash, only, page])

  useEffect(() => {
    reload()
  }, [reload])

  /** السبوطة المختارة — منها بنعرف نشغّل أنهي خوارزمية */
  const picked = useMemo(() => sbotat.find((s) => s.id === pick) ?? null, [sbotat, pick])
  const isWork = Boolean(picked?.is_work)

  /**
   * التشغيلة نفسها في القاعدة: fn_build_matching — أو fn_build_work_matching
   * لو السبوطة سبوطة شغل.
   *
   * اللوحة مش بتقسّم حد بإيدها — بتنادي الدالة وخلاص. الاتنين بيسجّلوا صف في
   * matching_runs بنفس شكل الاقتراح بالظبط، والفرق إن نسخة الشغل بتكتب
   * algorithm_version = 'work_v1' وقواعدها مختلفة (WORK_PLAN §3): سقف المجال،
   * تجانس أسلوب الشغل، والسن مش معيار خالص. الاقتراح بيتراجع في تبويب
   * «المجموعات» قبل ما يتعتمد بـ fn_reveal — زي ما هو.
   */
  async function run() {
    if (!pick || running) return
    setRunning(true)
    const fn = isWork ? 'fn_build_work_matching' : 'fn_build_matching'
    const { error } = await supabase().rpc(fn, { p_sbota: pick })
    setRunning(false)
    if (error) {
      // بنوري رسالة القاعدة زي ما هي — هي اللي بتقول السبب بالظبط
      flash(`المطابقة مشتغلتش: ${error.message}`)
      return
    }
    flash(
      isWork
        ? 'مطابقة الشغل اتشغّلت ✓ — الاقتراح مستنيك في تبويب «المجموعات»'
        : 'المطابقة اتشغّلت ✓ — الاقتراح مستنيك في تبويب «المجموعات»'
    )
    await reload()
  }

  /** نتايج المجموعات بتتجمّع على مستوى السبوطة علشان نعرف التشغيلة طلعت إيه */
  const outcomeBySbota = useMemo(() => {
    const acc: Record<string, { score: number[]; att: number[] }> = {}
    for (const o of outcomes) {
      const sid = one(o.sbota_groups)?.sbota_id
      if (!sid) continue
      acc[sid] ??= { score: [], att: [] }
      if (o.avg_group_score != null) acc[sid].score.push(Number(o.avg_group_score))
      if (o.attendance_rate != null) acc[sid].att.push(Number(o.attendance_rate))
    }
    const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
    return Object.fromEntries(
      Object.entries(acc).map(([k, v]) => [k, { score: avg(v.score), att: avg(v.att) }])
    ) as Record<string, { score: number | null; att: number | null }>
  }, [outcomes])

  return (
    <div className="mt-5 flex flex-col gap-4">
      <Card
        title="شغّل مطابقة لسبوطة"
        hint="التشغيلة بتطلع اقتراح توزيع، والاقتراح بيتراجع في تبويب «المجموعات» قبل ما يتعتمد."
      >
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <SelectField
            label="السبوطة"
            value={pick}
            onChange={setPick}
            options={
              sbotat.length
                ? sbotat.map((s) => ({ value: s.id, label: sbotaLabel(s) }))
                : [{ value: '', label: 'مفيش سبوطات' }]
            }
          />
          <Btn kind="primary" disabled={!canRun || !pick || running} onClick={run}>
            {running ? 'بتحسب…' : 'شغّل المطابقة'}
          </Btn>
        </div>

        {!canRun && (
          <div className="mt-3 font-body text-14" style={{ color: 'var(--muted)' }}>
            التشغيل محتاج صلاحية matching.run.
          </div>
        )}

        {isWork && (
          <div
            className="mt-3 rounded-16 p-3 font-body text-13"
            style={{ background: 'var(--surface)', color: 'var(--fg)' }}
          >
            <b>دي سبوطة شغل</b> — هنشغّل عليها <code>fn_build_work_matching</code> (نسخة{' '}
            <b>work_v1</b>) مش الخوارزمية العادية. القواعد مختلفة: أقصى{' '}
            <b>work_profession_mix_max</b> من نفس المجال في المجموعة، وأسلوب الشغل لازم يبقى
            متجانس (ممنوع واحد بس مختلف)، و<b>السن مش معيار خالص</b>، وسنين الخبرة مكافأة
            تنويع بس، واللي غيابه في سبوطات الشغل وصل 2 ما بياخدش مقعد إلا لو حجزه بكارت.
            و«ليه المجموعة دي؟» بتطلع بلغة الشغل — مجالات وأسلوب مش أعمار. اللي ما ينفعش
            يتحط بيظهر تحت «من غير مجموعة» في تبويب المجموعات.
          </div>
        )}
        <div className="mt-2 font-body text-13" style={{ color: 'var(--muted)' }}>
          التشغيلة بتسجّل اقتراح جديد بس — مفيش مجموعات ولا غرف شات ولا رسايل بتتعمل غير لما
          تعتمد. وساعة الكشف بتاخد آخر اقتراح موجود للسبوطة وتنفّذه، ولو مفيش أي اقتراح بتحط كل
          الحاجزين في مجموعة واحدة.
        </div>
      </Card>

      <div>
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-display text-22 font-black">اللي اتشغّل قبل كده</span>
          <SelectField
            label="سبوطة معيّنة"
            value={only}
            onChange={(v) => {
              setPage(0)
              setOnly(v)
            }}
            options={[
              { value: 'all', label: 'كل السبوطات' },
              ...sbotat.map((x) => ({ value: x.id, label: sbotaLabel(x) })),
            ]}
          />
          <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
            {total === null ? '…' : total} تشغيلة
          </span>
          <Btn onClick={() => reload()}>حدّث</Btn>
        </div>

        <div className="mt-3">
          {runs === null ? (
            <Loading />
          ) : runs.length === 0 ? (
            <Empty>لسه مفيش أي تشغيلة مطابقة اتسجّلت.</Empty>
          ) : (
            <Table
              head={[
                'اتشغّلت إمتى',
                'السبوطة',
                'مين شغّلها',
                'النسخة',
                'مجموعات',
                'ناس',
                'الاعتماد',
                'طلعت إيه بعدين',
              ]}
            >
              {runs.map((r) => {
                const groups = r.proposal?.groups ?? []
                const people = groups.reduce((n, g) => n + (g.members?.length ?? 0), 0)
                const out = outcomeBySbota[r.sbota_id]
                const s = one(r.sbotat)
                return (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--line)' }}>
                    <td className="p-2">{when(r.ran_at)}</td>
                    <td className="p-2">
                      <div>{tplName(s?.sbota_templates ?? null)}</div>
                      <div className="font-body text-12" style={{ color: 'var(--muted)' }}>
                        {when(s?.starts_at ?? null)}
                      </div>
                    </td>
                    <td className="p-2">{r.ran_by === 'system' ? 'النظام' : r.ran_by}</td>
                    <td className="p-2">{r.algorithm_version}</td>
                    <td className="p-2 font-display text-18 font-black">{groups.length}</td>
                    <td className="p-2">{people}</td>
                    <td className="p-2">
                      {r.approved_at ? (
                        <>
                          <Tag color="#9BE39B">اتعتمد</Tag>
                          <div className="mt-1 font-body text-12" style={{ color: 'var(--muted)' }}>
                            {when(r.approved_at)}
                          </div>
                        </>
                      ) : (
                        <Tag color="#F6C64A">مستني الاعتماد</Tag>
                      )}
                    </td>
                    <td className="p-2">
                      {out ? (
                        <span>
                          {out.score != null ? `تقييم ${out.score.toFixed(1)}` : 'مفيش تقييم'}
                          {out.att != null ? ` · حضور ${Math.round(out.att * 100)}%` : ''}
                        </span>
                      ) : (
                        <span style={{ color: 'var(--muted)' }}>لسه</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </Table>
          )}

          <Pager
            page={page}
            shown={runs?.length ?? 0}
            total={total}
            onPage={setPage}
            busy={busy}
          />
        </div>
      </div>
    </div>
  )
}

/* ============================================================ المجموعات */

interface Slot {
  key: string
  index: number
  why: string | null
  groupId: string | null
  roomId: string | null
  members: string[]
}

function GroupsTab({
  sbotat,
  canRun,
  canApprove,
  flash: rawFlash,
}: {
  sbotat: SbotaRow[]
  canRun: boolean
  canApprove: boolean
  flash: (m: string) => void
}) {
  const flash = useSay(rawFlash)
  const [sbotaId, setSbotaId] = useState(sbotat[0]?.id ?? '')
  const [loading, setLoading] = useState(true)
  const [groups, setGroups] = useState<GroupRow[]>([])
  const [run, setRun] = useState<RunRow | null>(null)
  const [members, setMembers] = useState<MemberRow[]>([])
  const [drag, setDrag] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  const sbota = useMemo(() => sbotat.find((s) => s.id === sbotaId) ?? null, [sbotat, sbotaId])

  const reload = useCallback(async () => {
    if (!sbotaId) {
      setLoading(false)
      return
    }
    setLoading(true)
    const db = supabase()
    const [g, r, b] = await Promise.all([
      db
        .from('sbota_groups')
        .select('id, sbota_id, index, why_ar, chat_room_id')
        .eq('sbota_id', sbotaId)
        .order('index'),
      db
        .from('matching_runs')
        .select(
          'id, sbota_id, ran_at, ran_by, algorithm_version, proposal, approved_at, approved_by, sbotat(starts_at, sbota_templates(name_ar))'
        )
        .eq('sbota_id', sbotaId)
        .order('ran_at', { ascending: false })
        .limit(1)
        .maybeSingle(),
      db
        .from('bookings')
        .select(
          'id, profile_id, group_id, status, profiles!bookings_profile_id_fkey(id, first_name, gender, birth_year, social_energy, no_show_count)'
        )
        .eq('sbota_id', sbotaId)
        .in('status', ['paid', 'attended']),
    ])
    if (g.error) flash(`مقدرناش نجيب المجموعات: ${g.error.message}`)
    if (b.error) flash(`مقدرناش نجيب الحاجزين: ${b.error.message}`)
    setGroups((g.data ?? []) as unknown as GroupRow[])
    setRun((r.data ?? null) as unknown as RunRow | null)
    setMembers((b.data ?? []) as unknown as MemberRow[])
    setLoading(false)
  }, [sbotaId, flash])

  useEffect(() => {
    reload()
  }, [reload])

  const mode: 'actual' | 'proposal' | 'none' =
    groups.length > 0 ? 'actual' : run ? 'proposal' : 'none'

  const byProfile = useMemo(
    () => new Map(members.map((m) => [m.profile_id, m])),
    [members]
  )

  /** التوزيع المعروض: إما المجموعات الحقيقية، وإما الاقتراح اللي لسه ما اتعتمدش */
  const slots: Slot[] = useMemo(() => {
    if (mode === 'actual') {
      return groups.map((g) => ({
        key: g.id,
        index: g.index,
        why: g.why_ar,
        groupId: g.id,
        roomId: g.chat_room_id,
        members: members.filter((m) => m.group_id === g.id).map((m) => m.profile_id),
      }))
    }
    if (mode === 'proposal') {
      return (run?.proposal?.groups ?? []).map((g, i) => ({
        key: `p${i}`,
        index: i + 1,
        why: g.why ?? null,
        groupId: null,
        roomId: null,
        members: (g.members ?? []).map(String),
      }))
    }
    return []
  }, [mode, groups, members, run])

  const placed = useMemo(() => new Set(slots.flatMap((s) => s.members)), [slots])
  const loose = members.filter((m) => !placed.has(m.profile_id))

  async function move(profileId: string, toKey: string) {
    if (busy) return
    const from = slots.find((s) => s.members.includes(profileId))
    if ((from?.key ?? UNASSIGNED) === toKey) return

    setBusy(true)
    const db = supabase()

    if (mode === 'actual') {
      const booking = byProfile.get(profileId)
      if (!booking) {
        setBusy(false)
        flash('الشخص ده مش لاقيين ليه حجز في السبوطة دي.')
        return
      }
      const to = slots.find((s) => s.key === toKey) ?? null
      const { data: mv, error } = await db
        .from('bookings')
        .update({ group_id: to?.groupId ?? null })
        .eq('id', booking.id)
        .select('id')
      if (error) {
        setBusy(false)
        flash(`مقدرناش ننقّله: ${error.message}`)
        return
      }
      if (rejected(mv)) {
        setBusy(false)
        flash('مااتنقلش — القاعدة رفضت الكتابة، محتاج صلاحية matching.edit')
        return
      }
      // غرفة الشات لازم تمشي مع الشخص، وإلا هيفضل بيتكلم مع مجموعته القديمة
      let chatWarn = ''
      if (from?.roomId) {
        const { error: e1 } = await db
          .from('chat_members')
          .delete()
          .eq('room_id', from.roomId)
          .eq('profile_id', profileId)
        if (e1) chatWarn = e1.message
      }
      if (to?.roomId) {
        const { error: e2 } = await db
          .from('chat_members')
          .insert({ room_id: to.roomId, profile_id: profileId, role: 'member' })
        if (e2) chatWarn = e2.message
      }
      setBusy(false)
      flash(chatWarn ? `اتنقل ✓ بس غرفة الشات محتاجة مراجعة: ${chatWarn}` : 'اتنقل ✓')
      await reload()
      return
    }

    if (mode === 'proposal' && run) {
      const next = slots.map((s) => ({
        why: s.why ?? undefined,
        members: s.members.filter((m) => m !== profileId),
      }))
      const target = slots.findIndex((s) => s.key === toKey)
      if (target >= 0) next[target].members = [...next[target].members, profileId]
      const { data: pr, error } = await db
        .from('matching_runs')
        .update({ proposal: { ...(run.proposal ?? {}), groups: next } })
        .eq('id', run.id)
        .select('id')
      setBusy(false)
      if (error) {
        flash(`مقدرناش نعدّل الاقتراح: ${error.message}`)
        return
      }
      if (rejected(pr)) {
        flash('مااتعدّلش — القاعدة رفضت الكتابة، محتاج صلاحية matching.edit')
        return
      }
      flash('الاقتراح اتعدّل ✓ — لسه محتاج اعتماد')
      await reload()
      return
    }

    setBusy(false)
  }

  async function approve() {
    if (!sbota || !run) return
    if (
      !confirm(
        `هنعتمد التوزيع ده ونكشفه للناس.\n\n` +
          `ده بيعمل المجموعات وغرف الشات وبيبعت رسالة لكل حاجز، ومفيش رجوع بضغطة زرار. تمام؟`
      )
    )
      return

    setBusy(true)
    const db = supabase()
    const { data, error } = await db.rpc('fn_reveal', { p_sbota: sbota.id })
    if (error) {
      setBusy(false)
      flash(`مقدرناش نعتمد: ${error.message}`)
      return
    }
    const made = Number(data ?? 0)
    if (made === 0) {
      setBusy(false)
      flash('محصلش حاجة — يعني السبوطة دي مجموعاتها اتعملت قبل كده.')
      await reload()
      return
    }
    const { data: auth } = await db.auth.getUser()
    if (auth.user?.id) {
      await db.from('matching_runs').update({ approved_by: auth.user.id }).eq('id', run.id)
    }
    setBusy(false)
    flash(`اتعتمد ✓ — اتعمل ${made} مجموعة والناس اتبلّغت`)
    await reload()
  }

  const options = [
    ...slots.map((s) => ({ value: s.key, label: `مجموعة ${s.index}` })),
    { value: UNASSIGNED, label: 'برّه التوزيع' },
  ]

  return (
    <div className="mt-5 flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <SelectField
          label="السبوطة"
          value={sbotaId}
          onChange={setSbotaId}
          options={
            sbotat.length
              ? sbotat.map((s) => ({ value: s.id, label: sbotaLabel(s) }))
              : [{ value: '', label: 'مفيش سبوطات' }]
          }
        />
        <div className="ms-auto flex flex-wrap items-center gap-2">
          <Btn onClick={() => reload()}>حدّث</Btn>
          {mode === 'proposal' && (
            <Btn kind="primary" disabled={!canApprove || busy} onClick={approve}>
              اعتمد التوزيع واكشفه
            </Btn>
          )}
        </div>
      </div>

      {loading ? (
        <Loading />
      ) : mode === 'none' ? (
        <Empty>
          السبوطة دي لسه مالهاش لا اقتراح توزيع ولا مجموعات. أول ما تتشغّل مطابقة هتلاقي الاقتراح
          هنا وتقدر تراجعه قبل الكشف.
        </Empty>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3">
            {mode === 'proposal' ? (
              <Tag color="#F6C64A">اقتراح لسه ما اتعتمدش</Tag>
            ) : (
              <Tag color="#9BE39B">توزيع معتمد ومكشوف</Tag>
            )}
            {run && (
              <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
                آخر تشغيلة {when(run.ran_at)} · نسخة {run.algorithm_version}
                {run.approved_at ? ` · اتعتمد ${when(run.approved_at)}` : ''}
              </span>
            )}
            {mode === 'proposal' && !canApprove && (
              <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
                الاعتماد محتاج صلاحية matching.approve.
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-3">
            <Stat label="مجموعات" value={String(slots.length)} />
            <Stat label="متوزعين" value={String(placed.size)} />
            <Stat label="برّه التوزيع" value={String(loose.length)} />
            <Stat label="حاجزين" value={String(members.length)} />
          </div>

          <div className="font-body text-13" style={{ color: 'var(--muted)' }}>
            اسحب اسم أي حد وحطه في مجموعة تانية، أو استعمل القايمة اللي جنبه لو السحب مش مريح.
            {mode === 'actual' && ' التنقيل هنا بيغيّر غرفة الشات كمان.'}
            {!canRun && ' (التنقيل محتاج صلاحية matching.run.)'}
          </div>

          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {slots.map((s) => (
              <GroupCard
                key={s.key}
                slot={s}
                sbota={sbota}
                byProfile={byProfile}
                options={options}
                canEdit={canRun && !busy}
                onDropMember={(pid) => move(pid, s.key)}
                drag={drag}
                setDrag={setDrag}
                onPick={(pid, key) => move(pid, key)}
              />
            ))}

            <div
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (drag) move(drag, UNASSIGNED)
                setDrag(null)
              }}
              className="rounded-20 p-4"
              style={{
                background: 'var(--surface)',
                border: `2px dashed ${drag ? '#F4632A' : 'var(--line)'}`,
              }}
            >
              <div className="font-display text-18 font-black">برّه التوزيع</div>
              <div className="mt-1 font-body text-13" style={{ color: 'var(--muted)' }}>
                حاجزين مش في أي مجموعة لحد دلوقتي.
              </div>
              <div className="mt-3 flex flex-col gap-2">
                {loose.length === 0 && (
                  <span className="font-body text-14" style={{ color: 'var(--muted)' }}>
                    مفيش حد برّه — كله متوزع.
                  </span>
                )}
                {loose.map((m) => (
                  <MemberChip
                    key={m.profile_id}
                    profileId={m.profile_id}
                    person={one(m.profiles)}
                    canEdit={canRun && !busy}
                    current={UNASSIGNED}
                    options={options}
                    setDrag={setDrag}
                    onPick={(key) => move(m.profile_id, key)}
                  />
                ))}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function GroupCard({
  slot,
  sbota,
  byProfile,
  options,
  canEdit,
  onDropMember,
  drag,
  setDrag,
  onPick,
}: {
  slot: Slot
  sbota: SbotaRow | null
  byProfile: Map<string, MemberRow>
  options: { value: string; label: string }[]
  canEdit: boolean
  onDropMember: (profileId: string) => void
  drag: string | null
  setDrag: (v: string | null) => void
  onPick: (profileId: string, key: string) => void
}) {
  const people = slot.members.map((id) => one(byProfile.get(id)?.profiles ?? null))
  const known = people.filter(Boolean) as PersonRef[]
  const girls = known.filter((p) => p.gender === 'female').length
  const ratio = known.length ? Math.round((girls / known.length) * 100) : 0
  const ages = known.map(ageOf).filter((a): a is number => a != null)
  const gap = ages.length ? Math.max(...ages) - Math.min(...ages) : 0
  const starters = known.filter((p) => p.social_energy === 'starter').length
  const mixed = !sbota?.girls_only

  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={() => {
        if (drag) onDropMember(drag)
        setDrag(null)
      }}
      className="rounded-20 p-4"
      style={{
        background: 'var(--surface)',
        border: `2px solid ${drag ? '#F4632A' : 'transparent'}`,
      }}
    >
      <div className="flex flex-wrap items-baseline gap-2">
        <span className="font-display text-18 font-black">مجموعة {slot.index}</span>
        <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
          {slot.members.length} واحد
        </span>
      </div>

      {slot.why && (
        <div className="mt-1 font-body text-13" style={{ color: 'var(--muted)' }}>
          {slot.why}
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-2">
        {mixed && <Tag>بنات {ratio}%</Tag>}
        <Tag>فرق السن {gap} سنة</Tag>
        <Tag>بيبدأوا الكلام {starters}</Tag>
      </div>

      <div className="mt-3 flex flex-col gap-2">
        {slot.members.length === 0 && (
          <span className="font-body text-14" style={{ color: 'var(--muted)' }}>
            المجموعة فاضية — اسحب حد هنا.
          </span>
        )}
        {slot.members.map((id) => (
          <MemberChip
            key={id}
            profileId={id}
            person={one(byProfile.get(id)?.profiles ?? null)}
            canEdit={canEdit}
            current={slot.key}
            options={options}
            setDrag={setDrag}
            onPick={(key) => onPick(id, key)}
          />
        ))}
      </div>
    </div>
  )
}

function MemberChip({
  profileId,
  person,
  canEdit,
  current,
  options,
  setDrag,
  onPick,
}: {
  profileId: string
  person: PersonRef | null
  canEdit: boolean
  current: string
  options: { value: string; label: string }[]
  setDrag: (v: string | null) => void
  onPick: (key: string) => void
}) {
  const age = ageOf(person)
  return (
    <div
      draggable={canEdit}
      onDragStart={() => setDrag(profileId)}
      onDragEnd={() => setDrag(null)}
      className="flex flex-wrap items-center gap-2 rounded-14 px-3 py-2"
      style={{ background: 'var(--bg)', cursor: canEdit ? 'grab' : 'default' }}
    >
      <span className="font-display text-16">⠿</span>
      <span className="flex flex-1 flex-col">
        <span className="font-display text-15 font-black">
          {person ? personName(person) : 'مش لاقيينه في الحاجزين'}
        </span>
        <span className="font-body text-12" style={{ color: 'var(--muted)' }}>
          {person?.gender === 'female' ? 'بنت' : person?.gender === 'male' ? 'ولد' : '—'}
          {age != null ? ` · ${age} سنة` : ''}
          {person?.social_energy ? ` · ${ENERGY[person.social_energy] ?? person.social_energy}` : ''}
          {(person?.no_show_count ?? 0) > 0 ? ` · مجاش ${person?.no_show_count} مرة` : ''}
        </span>
      </span>
      <select
        value={current}
        disabled={!canEdit}
        aria-label="نقّله لمجموعة تانية"
        onChange={(e) => onPick(e.target.value)}
        className="rounded-12 px-2 py-1 font-body text-13"
        style={{
          background: 'var(--surface)',
          color: 'var(--fg)',
          border: '2px solid var(--line)',
        }}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  )
}
