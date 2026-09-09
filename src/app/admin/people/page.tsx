'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AdminShell } from '@/components/AdminShell'
import { supabase } from '@/lib/supabase'
import type { AdminMe } from '@/lib/admin'
import {
  ADMIN_PAGE_SIZE,
  Btn,
  Card,
  Empty,
  Loading,
  NumberField,
  Pager,
  SelectField,
  Stat,
  Table,
  Tag,
  TextField,
  day,
  money,
  useFlash,
  when,
} from '@/components/admin-ui'

/**
 * الناس.
 *
 * القايمة على الشمال والتفاصيل على اليمين — كله في نفس الصفحة،
 * مفيش راوت جديد، علشان تفضل ماسك الفلتر وأنت بتتنقل بين الناس.
 *
 * خصوصية: التليفون بيتعرض مقنّع (010••••299) وبيتفتح بضغطة لما تحتاجه
 * فعلًا — مثلًا تكلّم حد على حجز. ومفيش تنزيل جماعي لبيانات الناس هنا،
 * ولا أي ترتيب أو تقييم للأعضاء غير اللي النادي بيعمله أصلًا للمطابقة.
 *
 * الصلاحيات: الدخول people.view · التعديل people.edit · الحظر people.ban.
 * ده إخفاء واجهة بس — المنع الحقيقي في RLS.
 *
 * الترقيم من القاعدة: البحث بالاسم `ilike`، والمنطقة والنوع `eq`،
 * وفلتر «فيه ملاحظات / من غيرها» بيتعمل على العلاقة نفسها
 * (`behavior_flags=is.null` و `not.is.null`) — مش بجلب جدول الملاحظات كله.
 * وملاحظات كل شخص بتيجي مدمجة مع صفّه، فاختفى الاستعلام اللي كان بيجيب
 * ٥٠٠٠ ملاحظة مرة واحدة.
 */

/* ---------------------------------------------------------- الأنواع */

interface PRow {
  id: string
  first_name: string | null
  phone: string
  area: string | null
  area_other: string | null
  gender: string | null
  birth_year: number | null
  girls_only_pref: string | null
  social_energy: string | null
  group_pref: string | null
  budget_max: number | null
  wish_text: string | null
  type: string | null
  role: string
  sbota_count: number
  no_show_count: number
  wallet_balance: number
  avatar_path: string | null
  banned_at: string | null
  ban_reason: string | null
  deleted_at: string | null
  created_at: string
  /** ملاحظات السلوك بتيجي مدمجة مع الصف — مش استعلام تاني */
  behavior_flags: FlagRow[] | null
}

interface FlagRow {
  id: string
  kind: string
  note: string | null
  weight: number
  created_at: string
}

interface BookingRow {
  id: string
  status: string
  price_paid: number
  created_at: string
  checked_in_at: string | null
  cancel_reason: string | null
  sbotat: {
    starts_at: string
    sbota_templates: { name_ar: string } | null
  } | null
}

interface ReviewRow {
  id: string
  score_sbota: number | null
  score_captain: number | null
  score_venue: number | null
  score_group: number | null
  will_rebook: boolean | null
  free_text: string | null
  created_at: string
  sbotat: { starts_at: string; sbota_templates: { name_ar: string } | null } | null
}

interface LedgerRow {
  id: string
  delta: number
  reason: string
  note: string | null
  created_at: string
}

interface InterestRow {
  interest_id: string
  interests: { label_ar: string } | null
}

interface SkillRow {
  activity: string
  level: string
}

/* ---------------------------------------------------------- قواميس */

const AREAS = [
  { value: 'tagamoa', label: 'التجمع' },
  { value: 'maadi', label: 'المعادي' },
  { value: 'zayed_october', label: 'زايد-أكتوبر' },
  { value: 'heliopolis_nasr', label: 'مصر الجديدة-مدينة نصر' },
  { value: 'downtown_zamalek', label: 'وسط-زمالك' },
  { value: 'other', label: 'غير كده' },
]
const areaLabel = (a: string | null, other?: string | null) =>
  a === 'other' && other ? other : (AREAS.find((x) => x.value === a)?.label ?? '—')

const GENDERS = [
  { value: 'female', label: 'بنت' },
  { value: 'male', label: 'شاب' },
]
const genderLabel = (g: string | null) => GENDERS.find((x) => x.value === g)?.label ?? '—'

const GIRLS_PREF = [
  { value: 'always', label: 'دايمًا' },
  { value: 'sometimes', label: 'أحيانًا' },
  { value: 'no', label: 'مش مهم' },
]

const ENERGY = [
  { value: 'starter', label: 'بيبدأ الكلام' },
  { value: 'responder', label: 'بيرد ويشارك' },
  { value: 'listener', label: 'بيسمع أكتر' },
  { value: 'one_on_one', label: 'واحد لواحد' },
]

const GROUP_PREF = [
  { value: 'calm', label: 'جروب هادي' },
  { value: 'lively', label: 'جروب مولّع' },
  { value: 'depends', label: 'على حسب' },
]

const FLAG_KINDS = [
  { value: 'no_show', label: 'مجاش' },
  { value: 'late_cancel', label: 'لغى متأخر' },
  { value: 'low_conduct', label: 'سلوك مش مظبوط' },
  { value: 'report_received', label: 'جاله بلاغ' },
  { value: 'verified_id', label: 'اتأكدنا من هويته' },
]
const flagLabel = (k: string) => FLAG_KINDS.find((x) => x.value === k)?.label ?? k

const BOOKING_STATUS: Record<string, string> = {
  pending_payment: 'مستني الدفع',
  paid: 'دافع',
  waitlist: 'في الانتظار',
  cancelled_by_user: 'لغاها بنفسه',
  cancelled_by_us: 'إحنا لغيناها',
  no_show: 'مجاش',
  attended: 'حضر',
  refunded: 'رجعنا فلوسه',
}

const LEDGER_REASON: Record<string, string> = {
  referral_reward: 'مكافأة دعوة',
  refund_credit: 'رصيد استرجاع',
  cancel_credit: 'رصيد إلغاء',
  coupon: 'كوبون',
  spend: 'صرف',
  captain_free_sbota: 'سبوطة كابتن ببلاش',
}

const SKILL_LEVEL: Record<string, string> = {
  first_time: 'أول مرة',
  beginner: 'مبتدئ',
  intermediate: 'متوسط',
  good: 'كويس',
}

const SKILL_ACTIVITY: Record<string, string> = {
  padel: 'بادل',
  running: 'جري',
  swimming: 'سباحة',
  cycling: 'عجل',
}

/** 01012345299 → 010••••299 — الرقم مايتعرضش كامل غير لما تطلبه */
function maskPhone(p: string | null | undefined) {
  const s = (p ?? '').replace(/\s+/g, '')
  if (s.length < 7) return '••••'
  return `${s.slice(0, 3)}••••${s.slice(-3)}`
}

/** بنستنى ثانية تلت بعد آخر حرف قبل ما نروح للقاعدة */
const SEARCH_DELAY_MS = 300

/** بننضّف اللي المستخدم كتبه من الرموز اللي بتكسر فلتر postgrest */
const safeLike = (s: string) => s.replace(/[,()*%".:\\]/g, ' ').trim()

const FLAG_EMBED = 'behavior_flags(id, kind, note, weight, created_at)'

const PROFILE_COLS =
  'id, first_name, phone, area, area_other, gender, birth_year, girls_only_pref, social_energy, group_pref, budget_max, wish_text, type, role, sbota_count, no_show_count, wallet_balance, avatar_path, banned_at, ban_reason, deleted_at, created_at'

/* ---------------------------------------------------------- الصفحة */

export default function AdminPeoplePage() {
  return (
    <AdminShell title="الناس" needs="people.view">
      {(me) => <People me={me} />}
    </AdminShell>
  )
}

function People({ me }: { me: AdminMe }) {
  const canEdit = me.permissions.has('people.edit')
  const canBan = me.permissions.has('people.ban')
  const canSeePhone = me.permissions.has('people.view')

  const [rows, setRows] = useState<PRow[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [page, setPage] = useState(0)
  const [sums, setSums] = useState<{ all: number; flagged: number; banned: number } | null>(null)
  const [typeNames, setTypeNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [shown, setShown] = useState<Record<string, boolean>>({})

  const [q, setQ] = useState('')
  /** اللي راح للقاعدة فعلًا — بيتأخر شوية عن اللي بتكتبه */
  const [needle, setNeedle] = useState('')
  const [area, setArea] = useState('all')
  const [gender, setGender] = useState('all')
  const [flagged, setFlagged] = useState('all')

  const { flash, node } = useFlash()

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(0)
      setNeedle(safeLike(q))
    }, SEARCH_DELAY_MS)
    return () => clearTimeout(t)
  }, [q])

  /** صفحة القايمة — كل الفلاتر بتتنفّذ في القاعدة */
  const reload = useCallback(async () => {
    setBusy(true)
    let p = supabase()
      .from('profiles')
      .select(`${PROFILE_COLS}, ${FLAG_EMBED}`, { count: 'exact' })
    if (area !== 'all') p = p.eq('area', area)
    if (gender !== 'all') p = p.eq('gender', gender)
    if (flagged === 'yes') p = p.not('behavior_flags', 'is', null)
    if (flagged === 'no') p = p.is('behavior_flags', null)
    if (needle) p = p.ilike('first_name', `%${needle}%`)

    const { data, count, error } = await p
      .order('created_at', { ascending: false })
      .order('created_at', { referencedTable: 'behavior_flags', ascending: false })
      .range(page * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE + ADMIN_PAGE_SIZE - 1)

    setLoading(false)
    setBusy(false)
    if (error) {
      flash(`مقدرناش نجيب الناس: ${error.message}`)
      setRows([])
      setTotal(0)
      return
    }
    setRows((data ?? []) as unknown as PRow[])
    setTotal(count ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [area, gender, flagged, needle, page])

  /** الأرقام اللي فوق — عدّ من القاعدة مش من صفوف محمّلة */
  const loadSums = useCallback(async () => {
    const db = supabase()
    const [all, withFlags, banned] = await Promise.all([
      db.from('profiles').select('id', { count: 'exact', head: true }),
      db
        .from('profiles')
        .select(`id, ${FLAG_EMBED}`, { count: 'exact', head: true })
        .not('behavior_flags', 'is', null),
      db
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .not('banned_at', 'is', null),
    ])
    setSums({
      all: all.count ?? 0,
      flagged: withFlags.count ?? 0,
      banned: banned.count ?? 0,
    })
  }, [])

  const loadTypes = useCallback(async () => {
    const { data } = await supabase().from('personality_types').select('key, name_ar')
    const map: Record<string, string> = {}
    for (const r of (data ?? []) as { key: string; name_ar: string }[]) map[r.key] = r.name_ar
    setTypeNames(map)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    loadSums()
  }, [loadSums])

  useEffect(() => {
    loadTypes()
  }, [loadTypes])

  const flagsOf = useCallback((r: PRow) => r.behavior_flags ?? [], [])

  const person = useMemo(() => rows.find((r) => r.id === selected) ?? null, [rows, selected])

  /** أي تغيير في الفلتر بيرجّعنا لأول صفحة */
  const setFilter = (set: (v: string) => void) => (v: string) => {
    setPage(0)
    set(v)
  }

  if (loading) return <Loading />

  return (
    <div className="mt-6">
      {/* أرقام سريعة */}
      <div className="flex flex-wrap gap-3">
        <Stat label="كل الناس" value={sums ? String(sums.all) : '…'} />
        <Stat label="اللي بالفلتر ده" value={total === null ? '…' : String(total)} />
        <Stat label="عليهم ملاحظات" value={sums ? String(sums.flagged) : '…'} />
        <Stat label="محظورين" value={sums ? String(sums.banned) : '…'} />
      </div>

      {/* الفلاتر */}
      <div className="mt-5 flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
            دوّر بالاسم
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="مثلًا: نور"
            className="min-w-[220px] rounded-14 px-4 py-2 font-body text-16"
            style={{
              background: 'var(--surface)',
              color: 'var(--fg)',
              border: '2px solid var(--line)',
            }}
          />
        </label>

        <SelectField
          label="المنطقة"
          value={area}
          onChange={setFilter(setArea)}
          options={[{ value: 'all', label: 'كل المناطق' }, ...AREAS]}
        />
        <SelectField
          label="بنت ولا شاب"
          value={gender}
          onChange={setFilter(setGender)}
          options={[{ value: 'all', label: 'الكل' }, ...GENDERS]}
        />
        <SelectField
          label="الملاحظات"
          value={flagged}
          onChange={setFilter(setFlagged)}
          options={[
            { value: 'all', label: 'الكل' },
            { value: 'yes', label: 'فيه ملاحظات' },
            { value: 'no', label: 'من غير ملاحظات' },
          ]}
        />

        {(q || area !== 'all' || gender !== 'all' || flagged !== 'all') && (
          <Btn
            onClick={() => {
              setPage(0)
              setQ('')
              setArea('all')
              setGender('all')
              setFlagged('all')
            }}
          >
            شيل الفلاتر
          </Btn>
        )}
      </div>

      {node}

      <div className="mt-5 grid gap-5 xl:grid-cols-[1fr_480px]">
        {/* القايمة */}
        <Card hint="اضغط على أي حد علشان تفتح صفحته على جنب.">
          {rows.length === 0 ? (
            <Empty>مفيش حد بالفلتر ده.</Empty>
          ) : (
            <Table head={['الاسم', 'المنطقة', 'التليفون', 'سبوطات', 'من إمتى', 'ملاحظات']}>
              {rows.map((r) => {
                const mine = flagsOf(r)
                const on = r.id === selected
                return (
                  <tr
                    key={r.id}
                    onClick={() => setSelected(on ? null : r.id)}
                    className="cursor-pointer"
                    style={{
                      background: on ? 'var(--bg)' : 'transparent',
                      opacity: r.deleted_at ? 0.5 : 1,
                    }}
                  >
                    <td className="p-2">
                      <div className="font-display text-15 font-black">
                        {r.first_name || 'من غير اسم'}
                      </div>
                      <div className="flex flex-wrap gap-1 pt-1">
                        {r.banned_at && <Tag color="#F4632A">محظور</Tag>}
                        {r.deleted_at && <Tag>مسح حسابه</Tag>}
                        {r.role === 'captain' && <Tag>كابتن</Tag>}
                        {r.type && <Tag>{typeNames[r.type] ?? r.type}</Tag>}
                      </div>
                    </td>
                    <td className="p-2">{areaLabel(r.area, r.area_other)}</td>
                    <td className="p-2" onClick={(e) => e.stopPropagation()}>
                      {canSeePhone ? (
                        <button
                          type="button"
                          onClick={() => setShown((s) => ({ ...s, [r.id]: !s[r.id] }))}
                          title={shown[r.id] ? 'اخفي الرقم' : 'اظهر الرقم'}
                          className="cursor-pointer bg-transparent p-0 font-body text-14 underline"
                          style={{ color: 'var(--accent-text)', border: 0 }}
                        >
                          {shown[r.id] ? r.phone : maskPhone(r.phone)}
                        </button>
                      ) : (
                        <span style={{ color: 'var(--muted)' }}>{maskPhone(r.phone)}</span>
                      )}
                    </td>
                    <td className="p-2">{r.sbota_count}</td>
                    <td className="p-2">{day(r.created_at)}</td>
                    <td className="p-2">
                      {mine.length === 0 ? (
                        <span style={{ color: 'var(--muted)' }}>—</span>
                      ) : (
                        <span className="flex flex-wrap gap-1">
                          {mine.slice(0, 3).map((f) => (
                            <Tag key={f.id}>{flagLabel(f.kind)}</Tag>
                          ))}
                          {mine.length > 3 && <Tag>+{mine.length - 3}</Tag>}
                        </span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </Table>
          )}

          <Pager page={page} shown={rows.length} total={total} onPage={setPage} busy={busy} />
        </Card>

        {/* صفحة الشخص */}
        <div className="xl:sticky xl:top-4 xl:max-h-[85vh] xl:overflow-y-auto">
          {person ? (
            <Detail
              key={person.id}
              person={person}
              flags={flagsOf(person)}
              typeName={person.type ? (typeNames[person.type] ?? person.type) : null}
              canEdit={canEdit}
              canBan={canBan}
              canSeePhone={canSeePhone}
              reload={reload}
              flash={flash}
              close={() => setSelected(null)}
            />
          ) : (
            <Card title="مفيش حد مفتوح">
              <div className="mt-2 font-body text-15" style={{ color: 'var(--muted)' }}>
                اختار حد من القايمة علشان تشوف ملفه وحجوزاته وتقييماته ورصيده.
              </div>
            </Card>
          )}
        </div>
      </div>
    </div>
  )
}

/* ---------------------------------------------------------- صفحة الشخص */

function Detail({
  person,
  flags,
  typeName,
  canEdit,
  canBan,
  canSeePhone,
  reload,
  flash,
  close,
}: {
  person: PRow
  flags: FlagRow[]
  typeName: string | null
  canEdit: boolean
  canBan: boolean
  canSeePhone: boolean
  reload: () => Promise<void>
  flash: (m: string) => void
  close: () => void
}) {
  const [bookings, setBookings] = useState<BookingRow[] | null>(null)
  const [reviews, setReviews] = useState<ReviewRow[] | null>(null)
  const [ledger, setLedger] = useState<LedgerRow[] | null>(null)
  const [interests, setInterests] = useState<InterestRow[] | null>(null)
  const [skills, setSkills] = useState<SkillRow[] | null>(null)
  const [showPhone, setShowPhone] = useState(false)
  const [flagKind, setFlagKind] = useState('no_show')
  const [flagNote, setFlagNote] = useState('')
  const [busy, setBusy] = useState(false)

  const id = person.id

  useEffect(() => {
    let alive = true
    const db = supabase()
    Promise.all([
      db
        .from('bookings')
        .select(
          'id, status, price_paid, created_at, checked_in_at, cancel_reason, sbotat(starts_at, sbota_templates(name_ar))'
        )
        .eq('profile_id', id)
        .order('created_at', { ascending: false })
        .limit(100),
      db
        .from('reviews')
        .select(
          'id, score_sbota, score_captain, score_venue, score_group, will_rebook, free_text, created_at, sbotat(starts_at, sbota_templates(name_ar))'
        )
        .eq('profile_id', id)
        .order('created_at', { ascending: false })
        .limit(100),
      db
        .from('wallet_ledger')
        .select('id, delta, reason, note, created_at')
        .eq('profile_id', id)
        .order('created_at', { ascending: false })
        .limit(100),
      db.from('profile_interests').select('interest_id, interests(label_ar)').eq('profile_id', id),
      db.from('skill_levels').select('activity, level').eq('profile_id', id),
    ]).then(([b, r, w, pi, sl]) => {
      if (!alive) return
      setBookings((b.data ?? []) as BookingRow[])
      setReviews((r.data ?? []) as ReviewRow[])
      setLedger((w.data ?? []) as LedgerRow[])
      setInterests((pi.data ?? []) as InterestRow[])
      setSkills((sl.data ?? []) as SkillRow[])
    })
    return () => {
      alive = false
    }
  }, [id])

  /** أي تعديل على الملف — بنتأكد إن القاعدة فعلًا عدّلت صف، مش بس مردّتش خطأ */
  async function patch(p: Record<string, unknown>) {
    if (!canEdit) return flash('التعديل مش من صلاحيتك.')
    setBusy(true)
    const { data, error } = await supabase().from('profiles').update(p).eq('id', id).select('id')
    setBusy(false)
    if (error) return flash(`مقدرناش نحفظ: ${error.message}`)
    if (((data ?? []) as unknown[]).length === 0) {
      return flash('مقدرناش نحفظ: القاعدة رفضت التعديل — محتاج صلاحية people.edit.')
    }
    await reload()
    flash('اتحفظ ✓')
  }

  async function addFlag() {
    const note = flagNote.trim()
    if (!note) return flash('اكتب الملاحظة الأول — لازم نعرف حصل إيه.')
    setBusy(true)
    const { error } = await supabase()
      .from('behavior_flags')
      .insert({ profile_id: id, kind: flagKind, note, weight: 1 })
    setBusy(false)
    if (error) return flash(`مقدرناش نزوّد الملاحظة: ${error.message}`)
    setFlagNote('')
    await reload()
    flash('الملاحظة اتزادت ✓')
  }

  async function removeFlag(flagId: string) {
    if (!confirm('هنشيل الملاحظة دي خالص. تمام؟')) return
    setBusy(true)
    const { error } = await supabase().from('behavior_flags').delete().eq('id', flagId)
    setBusy(false)
    if (error) return flash(`مقدرناش نشيلها: ${error.message}`)
    await reload()
    flash('الملاحظة اتشالت ✓')
  }

  async function ban() {
    if (!canBan) return flash('الحظر مش من صلاحيتك.')
    const reason = prompt('اكتب سبب الحظر — هيتسجل على الحساب:')?.trim()
    if (!reason) return flash('لازم سبب مكتوب علشان نحظر.')
    if (!confirm(`هنحظر ${person.first_name || 'الحساب ده'} ومش هيقدر يحجز تاني.\nالسبب: ${reason}\nتمام؟`))
      return
    setBusy(true)
    const { data, error } = await supabase()
      .from('profiles')
      .update({ banned_at: new Date().toISOString(), ban_reason: reason })
      .eq('id', id)
      .select('id')
    setBusy(false)
    if (error) return flash(`مقدرناش نحظر: ${error.message}`)
    if (((data ?? []) as unknown[]).length === 0) {
      return flash('مقدرناش نحظر: القاعدة رفضت التعديل — الحظر محتاج صلاحية people.ban.')
    }
    await reload()
    flash('اتحظر ✓')
  }

  async function unban() {
    if (!canBan) return flash('فك الحظر مش من صلاحيتك.')
    if (!confirm('هنفك الحظر ويرجع يحجز عادي. تمام؟')) return
    setBusy(true)
    const { data, error } = await supabase()
      .from('profiles')
      .update({ banned_at: null, ban_reason: null })
      .eq('id', id)
      .select('id')
    setBusy(false)
    if (error) return flash(`مقدرناش نفك الحظر: ${error.message}`)
    if (((data ?? []) as unknown[]).length === 0) {
      return flash('مقدرناش نفك الحظر: القاعدة رفضت التعديل — محتاج صلاحية people.ban.')
    }
    await reload()
    flash('الحظر اتفك ✓')
  }

  const age = person.birth_year ? new Date().getFullYear() - person.birth_year : null

  return (
    <div className="flex flex-col gap-4">
      {/* الرأس */}
      <Card>
        <div className="flex flex-wrap items-start gap-2">
          <div>
            <div className="font-display text-22 font-black">
              {person.first_name || 'من غير اسم'}
            </div>
            <div className="mt-1 font-body text-13" style={{ color: 'var(--muted)' }}>
              معانا من {day(person.created_at)} · {areaLabel(person.area)} ·{' '}
              {genderLabel(person.gender)}
              {age ? ` · ${age} سنة` : ''}
            </div>
          </div>
          <div className="ms-auto">
            <Btn onClick={close}>اقفل</Btn>
          </div>
        </div>

        <div className="mt-3 flex flex-wrap gap-1">
          {person.banned_at && <Tag color="#F4632A">محظور</Tag>}
          {person.deleted_at && <Tag>مسح حسابه {day(person.deleted_at)}</Tag>}
          {person.role === 'captain' && <Tag>كابتن</Tag>}
          {typeName && <Tag>{typeName}</Tag>}
          {person.avatar_path && <Tag>عنده صورة</Tag>}
        </div>

        {person.banned_at && (
          <div className="mt-3 rounded-14 px-3 py-2 font-body text-14" style={{ background: 'var(--bg)' }}>
            اتحظر {when(person.banned_at)} — السبب: {person.ban_reason || 'مكتبش سبب'}
          </div>
        )}

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <span className="font-body text-14" style={{ color: 'var(--muted)' }}>
            التليفون
          </span>
          {canSeePhone ? (
            <button
              type="button"
              onClick={() => setShowPhone((v) => !v)}
              className="cursor-pointer bg-transparent p-0 font-body text-16 underline"
              style={{ color: 'var(--accent-text)', border: 0 }}
            >
              {showPhone ? person.phone : maskPhone(person.phone)}
            </button>
          ) : (
            <span className="font-body text-16">{maskPhone(person.phone)}</span>
          )}
          <span className="font-body text-12" style={{ color: 'var(--muted)' }}>
            افتحه بس لما تحتاج تكلّمه على حجز.
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <Stat label="سبوطات" value={String(person.sbota_count)} />
          <Stat label="مجاش" value={String(person.no_show_count)} />
          <Stat label="المحفظة" value={money(person.wallet_balance)} />
          <Stat label="ملاحظات" value={String(flags.length)} />
        </div>
      </Card>

      {/* البيانات */}
      <Card title="البيانات" hint={canEdit ? 'التعديل بيتحفظ أول ما تسيب الخانة.' : 'مالكش صلاحية تعديل — للقراءة بس.'}>
        {canEdit ? (
          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <TextField
              label="الاسم"
              value={person.first_name ?? ''}
              onSave={(v) => patch({ first_name: v.trim() || null })}
            />
            <SelectField
              label="المنطقة"
              value={person.area ?? ''}
              onChange={(v) => patch({ area: v || null })}
              options={[{ value: '', label: '—' }, ...AREAS]}
            />
            <SelectField
              label="بنت ولا شاب"
              value={person.gender ?? ''}
              onChange={(v) => patch({ gender: v || null })}
              options={[{ value: '', label: '—' }, ...GENDERS]}
            />
            <NumberField
              label="سنة الميلاد"
              value={person.birth_year ?? 0}
              min={1940}
              max={new Date().getFullYear()}
              onSave={(v) => patch({ birth_year: v || null })}
            />
            <SelectField
              label="سبوطات البنات"
              value={person.girls_only_pref ?? ''}
              onChange={(v) => patch({ girls_only_pref: v || null })}
              options={[{ value: '', label: '—' }, ...GIRLS_PREF]}
            />
            <SelectField
              label="طاقته وسط الناس"
              value={person.social_energy ?? ''}
              onChange={(v) => patch({ social_energy: v || null })}
              options={[{ value: '', label: '—' }, ...ENERGY]}
            />
            <SelectField
              label="بيحب أنهي جروب"
              value={person.group_pref ?? ''}
              onChange={(v) => patch({ group_pref: v || null })}
              options={[{ value: '', label: '—' }, ...GROUP_PREF]}
            />
            <NumberField
              label="أقصى ميزانية"
              value={person.budget_max ?? 0}
              min={0}
              suffix="جنيه"
              onSave={(v) => patch({ budget_max: v || null })}
            />
            <div className="md:col-span-2">
              <TextField
                label="نفسه في إيه"
                value={person.wish_text ?? ''}
                multiline
                onSave={(v) => patch({ wish_text: v.trim() || null })}
              />
            </div>
          </div>
        ) : (
          <div className="mt-3 font-body text-15">
            {areaLabel(person.area)} · {genderLabel(person.gender)}
            {age ? ` · ${age} سنة` : ''}
            {person.wish_text && (
              <div className="mt-2" style={{ color: 'var(--muted)' }}>
                «{person.wish_text}»
              </div>
            )}
          </div>
        )}
        {busy && (
          <div className="mt-2 font-body text-13" style={{ color: 'var(--muted)' }}>
            ثانية واحدة…
          </div>
        )}
      </Card>

      {/* الاهتمامات والمستويات */}
      <Card title="بيحب إيه وبيلعب إزاي">
        {interests === null || skills === null ? (
          <Loading />
        ) : (
          <>
            <div className="mt-2 font-body text-13" style={{ color: 'var(--muted)' }}>
              الاهتمامات
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {interests.length === 0 ? (
                <span className="font-body text-15" style={{ color: 'var(--muted)' }}>
                  مختارش حاجة.
                </span>
              ) : (
                interests.map((i) => (
                  <Tag key={i.interest_id}>{i.interests?.label_ar ?? '—'}</Tag>
                ))
              )}
            </div>

            <div className="mt-4 font-body text-13" style={{ color: 'var(--muted)' }}>
              المستويات
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {skills.length === 0 ? (
                <span className="font-body text-15" style={{ color: 'var(--muted)' }}>
                  محددش مستواه في حاجة.
                </span>
              ) : (
                skills.map((s) => (
                  <Tag key={s.activity}>
                    {(SKILL_ACTIVITY[s.activity] ?? s.activity)}: {SKILL_LEVEL[s.level] ?? s.level}
                  </Tag>
                ))
              )}
            </div>
          </>
        )}
      </Card>

      {/* الملاحظات */}
      <Card title="ملاحظات السلوك" hint="اللي بنكتبه هنا بيبان لفريق الإدارة بس.">
        <div className="mt-3 flex flex-col gap-2">
          {flags.length === 0 && (
            <span className="font-body text-15" style={{ color: 'var(--muted)' }}>
              مفيش ولا ملاحظة — تمام.
            </span>
          )}
          {flags.map((f) => (
            <div
              key={f.id}
              className="flex flex-wrap items-center gap-2 rounded-14 px-3 py-2"
              style={{ background: 'var(--bg)' }}
            >
              <Tag>{flagLabel(f.kind)}</Tag>
              <span className="font-body text-15">{f.note || '—'}</span>
              <span className="font-body text-12" style={{ color: 'var(--muted)' }}>
                {when(f.created_at)}
              </span>
              <span className="ms-auto">
                <Btn kind="danger" onClick={() => removeFlag(f.id)} disabled={busy}>
                  شيلها
                </Btn>
              </span>
            </div>
          ))}
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <SelectField
            label="نوع الملاحظة"
            value={flagKind}
            onChange={setFlagKind}
            options={FLAG_KINDS}
          />
          <label className="flex flex-1 flex-col gap-1">
            <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
              حصل إيه بالظبط
            </span>
            <input
              value={flagNote}
              onChange={(e) => setFlagNote(e.target.value)}
              placeholder="مثلًا: حجز وماجاش وماعتذرش"
              className="w-full min-w-[180px] rounded-14 px-3 py-2 font-body text-16"
              style={{
                background: 'var(--bg)',
                color: 'var(--fg)',
                border: '2px solid var(--line)',
              }}
            />
          </label>
          <Btn kind="primary" onClick={addFlag} disabled={busy || !flagNote.trim()}>
            زوّد ملاحظة
          </Btn>
        </div>
      </Card>

      {/* الحجوزات */}
      <Card title="حجوزاته">
        {bookings === null ? (
          <Loading />
        ) : bookings.length === 0 ? (
          <Empty>لسه ماحجزش ولا مرة.</Empty>
        ) : (
          <Table head={['السبوطة', 'ميعادها', 'الحالة', 'دفع', 'حضر']}>
            {bookings.map((b) => (
              <tr key={b.id}>
                <td className="p-2">{b.sbotat?.sbota_templates?.name_ar ?? '—'}</td>
                <td className="p-2">{day(b.sbotat?.starts_at)}</td>
                <td className="p-2">
                  <Tag
                    color={
                      b.status === 'attended'
                        ? '#8ED081'
                        : b.status === 'no_show'
                          ? '#F4632A'
                          : undefined
                    }
                  >
                    {BOOKING_STATUS[b.status] ?? b.status}
                  </Tag>
                  {b.cancel_reason && (
                    <div className="pt-1 font-body text-12" style={{ color: 'var(--muted)' }}>
                      {b.cancel_reason}
                    </div>
                  )}
                </td>
                <td className="p-2">{money(b.price_paid)}</td>
                <td className="p-2">{b.checked_in_at ? 'أيوة' : '—'}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {/* التقييمات */}
      <Card title="تقييماته">
        {reviews === null ? (
          <Loading />
        ) : reviews.length === 0 ? (
          <Empty>ماقيّمش حاجة لسه.</Empty>
        ) : (
          <div className="mt-2 flex flex-col gap-2">
            {reviews.map((r) => (
              <div key={r.id} className="rounded-14 px-3 py-2" style={{ background: 'var(--bg)' }}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-15 font-black">
                    {r.sbotat?.sbota_templates?.name_ar ?? '—'}
                  </span>
                  <span className="font-body text-12" style={{ color: 'var(--muted)' }}>
                    {day(r.created_at)}
                  </span>
                  {r.will_rebook === true && <Tag>هيكرر</Tag>}
                  {r.will_rebook === false && <Tag color="#F4632A">مش هيكرر</Tag>}
                </div>
                <div className="mt-1 font-body text-13" style={{ color: 'var(--muted)' }}>
                  السبوطة {r.score_sbota ?? '—'} · الكابتن {r.score_captain ?? '—'} · المكان{' '}
                  {r.score_venue ?? '—'} · الجروب {r.score_group ?? '—'}
                </div>
                {r.free_text && <div className="mt-1 font-body text-15">«{r.free_text}»</div>}
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* المحفظة */}
      <Card title="المحفظة" hint={`الرصيد دلوقتي ${money(person.wallet_balance)}`}>
        {ledger === null ? (
          <Loading />
        ) : ledger.length === 0 ? (
          <Empty>مفيش حركة على المحفظة.</Empty>
        ) : (
          <Table head={['الحركة', 'السبب', 'الملاحظة', 'إمتى']}>
            {ledger.map((l) => (
              <tr key={l.id}>
                <td className="p-2" style={{ color: l.delta < 0 ? 'var(--err-text)' : undefined }}>
                  {l.delta < 0 ? '−' : '+'}
                  {money(Math.abs(l.delta))}
                </td>
                <td className="p-2">{LEDGER_REASON[l.reason] ?? l.reason}</td>
                <td className="p-2">{l.note || '—'}</td>
                <td className="p-2">{when(l.created_at)}</td>
              </tr>
            ))}
          </Table>
        )}
      </Card>

      {/* الحظر */}
      <Card title="الحظر" hint="الحظر بيمنعه يحجز — استعمله لما يبقى فيه سبب مكتوب.">
        <div className="mt-3 flex flex-wrap items-center gap-2">
          {person.banned_at ? (
            <Btn onClick={unban} disabled={!canBan || busy}>
              فك الحظر
            </Btn>
          ) : (
            <Btn kind="danger" onClick={ban} disabled={!canBan || busy}>
              احظر الحساب
            </Btn>
          )}
          {!canBan && (
            <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
              محتاج صلاحية people.ban.
            </span>
          )}
        </div>
      </Card>
    </div>
  )
}
