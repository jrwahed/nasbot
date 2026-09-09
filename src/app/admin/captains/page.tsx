'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AdminShell } from '@/components/AdminShell'
import { supabase } from '@/lib/supabase'
import { revalidateSite, loadBannedWords, bannedIn, rejected } from '@/lib/admin'
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
  TextField,
  Toggle,
  day,
  money,
  useFlash,
  when,
} from '@/components/admin-ui'

/**
 * الكباتن والأماكن.
 *
 * أربع تبويبات: الكباتن نفسهم، طلبات اللي عايزين يبقوا كباتن،
 * التقارير اللي بيبعتوها بعد كل سبوطة، والأماكن اللي بنشتغل معاها.
 *
 * كلام الكابتن (الاسم والحرفة والسطر) بيبان في الموقع للناس،
 * فبنعدّي عليه الكلمات الممنوعة وبنعمل revalidate بعد الحفظ.
 *
 * تليفونات الكباتن وأصحاب الأماكن مقنّعة وبتتفتح بضغطة لما تحتاج تكلّمهم.
 *
 * الترقيم من القاعدة (مراجعة A17): الصفحة كانت بتجيب ٦ جداول كاملة مرة واحدة
 * (كباتن + ٥٠٠ طلب + ٥٠٠ تقرير + كل الأماكن + ٥٠٠ بلاغ + ١٠٠٠ سبوطة) وتفلتر
 * في المتصفح. دلوقتي **كل تبويب بيجيب صفحته لوحده** بـ `.range()` و
 * `{ count: 'exact' }`، والفلاتر بتتنفّذ في القاعدة — نفس نمط /admin/people.
 *
 * الاستثناء الوحيد: القوايم اللي بتملا الـ dropdown وبتترجم id → اسم
 * (فهرس الكباتن وفهرس الأماكن). دي أعمدة قليلة ومسقوفة بـ ADMIN_SCAN_MAX،
 * وده بالظبط اللي الثابت ده موجود له.
 */

/* ---------------------------------------------------------- الأنواع */

interface CaptainRow {
  id: string
  profile_id: string
  display_name: string | null
  craft_ar: string | null
  bio_line: string
  activities: string[]
  is_active: boolean
  rating_avg: number | null
  sbota_count: number
  created_at: string
  profiles: { first_name: string | null; phone: string } | null
}

interface AppRow {
  id: string
  name: string
  phone: string
  job: string | null
  why: string | null
  handled_at: string | null
  handled_by: string | null
  created_at: string
}

interface ReportRow {
  id: string
  sbota_id: string
  captain_id: string
  attendance_json: Record<string, unknown> | null
  what_worked: string | null
  what_didnt: string | null
  incident: string | null
  suggestion: string | null
  created_at: string
  sbotat: { starts_at: string; sbota_templates: { name_ar: string } | null } | null
}

interface VenueRow {
  id: string
  name: string
  kind: string
  area: string
  address: string
  contact_phone: string | null
  contract_notes: string | null
  wholesale_price: number | null
  verified_at: string | null
  is_active: boolean
  rating_avg: number | null
  created_at: string
}

interface AlertRow {
  id: string
  venue_id: string | null
  reason: string
  note: string | null
  created_at: string
  resolved_at: string | null
}

/** فهرس خفيف — الاسم بس، للـ dropdown وترجمة id → اسم */
interface CaptainName {
  id: string
  display_name: string | null
  profiles: { first_name: string | null } | null
}

interface VenueName {
  id: string
  name: string
}

interface SbotaRow {
  id: string
  captain_id: string | null
  starts_at: string
  status: string
  sbota_templates: { name_ar: string } | null
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
const areaLabel = (a: string | null) => AREAS.find((x) => x.value === a)?.label ?? '—'

const VENUE_KINDS = [
  { value: 'padel_club', label: 'نادي بادل' },
  { value: 'kayak', label: 'كايك' },
  { value: 'cafe', label: 'كافيه' },
  { value: 'restaurant', label: 'مطعم' },
  { value: 'board_games', label: 'ألعاب طاولة' },
  { value: 'wadi', label: 'وادي' },
  { value: 'escape_room', label: 'غرفة هروب' },
  { value: 'paintball', label: 'بينت بول' },
  { value: 'workshop', label: 'ورشة' },
  { value: 'tour_operator', label: 'شركة رحلات' },
]
const kindLabel = (k: string) => VENUE_KINDS.find((x) => x.value === k)?.label ?? k

const SBOTA_STATUS: Record<string, string> = {
  draft: 'مسودة',
  open: 'مفتوحة',
  full: 'كاملة',
  locked: 'مقفولة',
  running: 'شغالة',
  done: 'خلصت',
  cancelled: 'اتلغت',
}

const TABS = [
  { id: 'captains' as const, label: 'الكباتن' },
  { id: 'apps' as const, label: 'الطلبات' },
  { id: 'reports' as const, label: 'التقارير' },
  { id: 'venues' as const, label: 'الأماكن' },
]
type TabId = (typeof TABS)[number]['id']

/** بنستنى ثانية تلت بعد آخر حرف قبل ما نروح للقاعدة */
const SEARCH_DELAY_MS = 300

/** بننضّف اللي المستخدم كتبه من الرموز اللي بتكسر فلتر postgrest */
const safeLike = (s: string) => s.replace(/[,()*%".:\\]/g, ' ').trim()

/** 01012345299 → 010••••299 */
function maskPhone(p: string | null | undefined) {
  const s = (p ?? '').replace(/\s+/g, '')
  if (s.length < 7) return '••••'
  return `${s.slice(0, 3)}••••${s.slice(-3)}`
}

/** رقم بيتفتح بضغطة — مش بنرش التليفونات على الشاشة من غير داعي */
function Phone({ value }: { value: string | null }) {
  const [open, setOpen] = useState(false)
  if (!value) return <span style={{ color: 'var(--muted)' }}>—</span>
  return (
    <button
      type="button"
      onClick={() => setOpen((v) => !v)}
      title={open ? 'اخفي الرقم' : 'اظهر الرقم'}
      className="cursor-pointer bg-transparent p-0 font-body text-14 underline"
      style={{ color: 'var(--accent-text)', border: 0 }}
    >
      {open ? value : maskPhone(value)}
    </button>
  )
}

/* ---------------------------------------------------------- الصفحة */

export default function AdminCaptainsPage() {
  return <AdminShell title="الكباتن" needs="captains.edit">{() => <Captains />}</AdminShell>
}

function Captains() {
  const [tab, setTab] = useState<TabId>('captains')
  const [banned, setBanned] = useState<string[]>([])
  const [myId, setMyId] = useState<string | null>(null)
  /** فهرس أسماء الكباتن — للـ dropdown في التقارير وترجمة id → اسم */
  const [captainIndex, setCaptainIndex] = useState<CaptainName[]>([])
  /** فهرس الأماكن — للـ dropdown في البلاغات وترجمة id → اسم */
  const [venueIndex, setVenueIndex] = useState<VenueName[]>([])
  /** عدّادات شارات التبويبات — عدّ من القاعدة مش من صفوف محمّلة */
  const [badges, setBadges] = useState<{ pending: number; alerts: number } | null>(null)
  const [loading, setLoading] = useState(true)

  const { flash, node } = useFlash()

  /** الفهارس والعدّادات بس — الصفوف نفسها كل تبويب بيجيبها لوحده */
  const loadShared = useCallback(async () => {
    const db = supabase()
    const [ci, vi, pend, alr] = await Promise.all([
      db
        .from('captains')
        .select('id, display_name, profiles(first_name)')
        .order('display_name')
        .range(0, ADMIN_SCAN_MAX - 1),
      db.from('venues').select('id, name').order('name').range(0, ADMIN_SCAN_MAX - 1),
      db
        .from('captain_applications')
        .select('id', { count: 'exact', head: true })
        .is('handled_at', null),
      db
        .from('provider_alerts')
        .select('id', { count: 'exact', head: true })
        .is('resolved_at', null),
    ])
    setCaptainIndex((ci.data ?? []) as unknown as CaptainName[])
    setVenueIndex((vi.data ?? []) as VenueName[])
    setBadges({ pending: pend.count ?? 0, alerts: alr.count ?? 0 })
    setLoading(false)
  }, [])

  useEffect(() => {
    loadShared()
    loadBannedWords().then(setBanned)
    supabase()
      .auth.getUser()
      .then((res: { data: { user: { id: string } | null } }) =>
        setMyId(res.data.user?.id ?? null)
      )
  }, [loadShared])

  if (loading) return <Loading />

  const pending = badges?.pending ?? 0
  const openAlerts = badges?.alerts ?? 0

  return (
    <div>
      <Tabs
        tabs={TABS.map((t) => ({
          id: t.id,
          label:
            t.id === 'apps' && pending
              ? `${t.label} (${pending})`
              : t.id === 'venues' && openAlerts
                ? `${t.label} (${openAlerts} مشكلة)`
                : t.label,
        }))}
        value={tab}
        onChange={setTab}
      />

      {node}

      {tab === 'captains' && <CaptainsTab banned={banned} flash={flash} />}
      {tab === 'apps' && (
        <AppsTab myId={myId} onChanged={loadShared} flash={flash} />
      )}
      {tab === 'reports' && <ReportsTab captains={captainIndex} />}
      {tab === 'venues' && (
        <VenuesTab
          venueIndex={venueIndex}
          myId={myId}
          onChanged={loadShared}
          flash={flash}
        />
      )}
    </div>
  )
}

/* ============================================================ الكباتن */

function CaptainsTab({ banned, flash }: { banned: string[]; flash: (m: string) => void }) {
  const [rows, setRows] = useState<CaptainRow[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [sums, setSums] = useState<{ all: number; active: number } | null>(null)
  const [page, setPage] = useState(0)
  const [active, setActive] = useState('all')
  const [q, setQ] = useState('')
  const [needle, setNeedle] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  /** سبوطات الكباتن اللي على الشاشة بس — مش ألف صف */
  const [byCaptain, setByCaptain] = useState<Record<string, SbotaRow[]>>({})

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(0)
      setNeedle(safeLike(q))
    }, SEARCH_DELAY_MS)
    return () => clearTimeout(t)
  }, [q])

  const reload = useCallback(async () => {
    setBusy(true)
    const db = supabase()
    let query = db
      .from('captains')
      .select(
        'id, profile_id, display_name, craft_ar, bio_line, activities, is_active, rating_avg, sbota_count, created_at, profiles(first_name, phone)',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
    if (active !== 'all') query = query.eq('is_active', active === 'yes')
    if (needle) query = query.ilike('display_name', `%${needle}%`)

    const { data, count, error } = await query.range(
      page * ADMIN_PAGE_SIZE,
      page * ADMIN_PAGE_SIZE + ADMIN_PAGE_SIZE - 1
    )
    setLoading(false)
    setBusy(false)
    if (error) {
      flash(`مقدرناش نجيب الكباتن: ${error.message}`)
      setRows([])
      setTotal(0)
      return
    }
    const list = (data ?? []) as unknown as CaptainRow[]
    setRows(list)
    setTotal(count ?? null)

    // سبوطات الصفحة دي بس
    const ids = list.map((c) => c.id)
    if (!ids.length) return setByCaptain({})
    const { data: sb } = await db
      .from('sbotat')
      .select('id, captain_id, starts_at, status, sbota_templates(name_ar)')
      .in('captain_id', ids)
      .order('starts_at', { ascending: false })
      .range(0, ADMIN_SCAN_MAX - 1)
    const m: Record<string, SbotaRow[]> = {}
    for (const row of (sb ?? []) as unknown as SbotaRow[]) {
      if (row.captain_id) (m[row.captain_id] ??= []).push(row)
    }
    setByCaptain(m)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active, needle, page])

  const loadSums = useCallback(async () => {
    const db = supabase()
    const [all, on] = await Promise.all([
      db.from('captains').select('id', { count: 'exact', head: true }),
      db.from('captains').select('id', { count: 'exact', head: true }).eq('is_active', true),
    ])
    setSums({ all: all.count ?? 0, active: on.count ?? 0 })
  }, [])

  useEffect(() => {
    reload()
  }, [reload])
  useEffect(() => {
    loadSums()
  }, [loadSums])

  /** أي تعديل — والكلام اللي بيبان للناس بيتفحص الأول وبيتعمله revalidate بعدين */
  async function patch(id: string, p: Record<string, unknown>, isPublic: boolean) {
    if (isPublic) {
      const text = Object.values(p)
        .filter((v): v is string => typeof v === 'string')
        .join(' ')
      const bad = bannedIn(text, banned)
      if (bad.length) return flash(`الكلام فيه كلمة ممنوعة: ${bad.join('، ')}`)
    }
    setBusy(true)
    const { data, error } = await supabase()
      .from('captains')
      .update(p)
      .eq('id', id)
      .select('id')
    setBusy(false)
    if (error) return flash(`مقدرناش نحفظ: ${error.message}`)
    if (rejected(data)) return flash('مااتحفظش — القاعدة رفضت، محتاج صلاحية captains.edit')
    await Promise.all([reload(), loadSums()])
    if (isPublic) {
      const ok = await revalidateSite()
      flash(ok ? 'اتحفظ ✓ وبان في الموقع' : 'اتحفظ ✓ — هيبان خلال أقل من دقيقة')
    } else {
      flash('اتحفظ ✓')
    }
  }

  if (loading) return <Loading />

  return (
    <div className="mt-5">
      <div className="flex flex-wrap gap-3">
        <Stat label="كل الكباتن" value={sums ? String(sums.all) : '…'} />
        <Stat label="شغّالين" value={sums ? String(sums.active) : '…'} />
        <Stat label="بالفلتر ده" value={total === null ? '…' : String(total)} />
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
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
          label="الحالة"
          value={active}
          onChange={(v) => {
            setPage(0)
            setActive(v)
          }}
          options={[
            { value: 'all', label: 'الكل' },
            { value: 'yes', label: 'شغّالين' },
            { value: 'no', label: 'مقفولين' },
          ]}
        />
      </div>

      {rows.length === 0 ? (
        <div className="mt-4">
          <Empty>مفيش كباتن بالفلتر ده. الطلبات في التبويب اللي جنبه.</Empty>
        </div>
      ) : (
        <div className="mt-4 flex flex-col gap-4">
          {rows.map((c) => {
            const mine = byCaptain[c.id] ?? []
            const isOpen = open === c.id
            return (
              <Card key={c.id} dim={!c.is_active}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-18 font-black">
                    {c.display_name || c.profiles?.first_name || 'كابتن من غير اسم'}
                  </span>
                  {c.craft_ar && <Tag>{c.craft_ar}</Tag>}
                  {!c.is_active && <Tag color="#F4632A">مقفول</Tag>}
                  <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
                    {c.sbota_count} سبوطة
                    {c.rating_avg != null ? ` · تقييمه ${Number(c.rating_avg).toFixed(1)}` : ''}
                  </span>
                  <span className="ms-auto flex items-center gap-2">
                    <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
                      تليفونه
                    </span>
                    <Phone value={c.profiles?.phone ?? null} />
                  </span>
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <TextField
                    label="الاسم اللي بيبان للناس"
                    value={c.display_name ?? ''}
                    onSave={(v) => patch(c.id, { display_name: v.trim() || null }, true)}
                  />
                  <TextField
                    label="الحرفة"
                    value={c.craft_ar ?? ''}
                    placeholder="مثلًا: مدرب بادل"
                    onSave={(v) => patch(c.id, { craft_ar: v.trim() || null }, true)}
                  />
                </div>

                <div className="mt-3">
                  <TextField
                    label="سطر التعريف"
                    value={c.bio_line}
                    multiline
                    hint="ده بيبان في صفحة السبوطة — اكتبه بلغة الناس."
                    onSave={(v) => {
                      if (!v.trim()) return flash('سطر التعريف مايصحش يفضل فاضي.')
                      patch(c.id, { bio_line: v.trim() }, true)
                    }}
                  />
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <TextField
                    label="بيقود إيه"
                    value={(c.activities ?? []).join('، ')}
                    hint="اكتبهم ورا بعض بفاصلة — مثلًا: بادل، كايك"
                    onSave={(v) =>
                      patch(
                        c.id,
                        {
                          activities: v
                            .split(/[,،]/)
                            .map((x) => x.trim())
                            .filter(Boolean),
                        },
                        false
                      )
                    }
                  />
                  <div className="flex items-end">
                    <Toggle
                      label="شغّال"
                      value={c.is_active}
                      hint="لو قفلته مش هيبان في الموقع ولا هيتحط على سبوطات جديدة."
                      onChange={(v) => patch(c.id, { is_active: v }, true)}
                    />
                  </div>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-3">
                  <Btn onClick={() => setOpen(isOpen ? null : c.id)}>
                    {isOpen ? 'اقفل السبوطات' : `سبوطاته (${mine.length})`}
                  </Btn>
                  {busy && (
                    <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
                      ثانية واحدة…
                    </span>
                  )}
                </div>

                {isOpen && (
                  <div className="mt-3">
                    {mine.length === 0 ? (
                      <Empty>لسه ماخدش سبوطة.</Empty>
                    ) : (
                      <Table head={['السبوطة', 'ميعادها', 'الحالة']}>
                        {mine.map((s) => (
                          <tr key={s.id}>
                            <td className="p-2">{s.sbota_templates?.name_ar ?? '—'}</td>
                            <td className="p-2">{when(s.starts_at)}</td>
                            <td className="p-2">
                              <Tag>{SBOTA_STATUS[s.status] ?? s.status}</Tag>
                            </td>
                          </tr>
                        ))}
                      </Table>
                    )}
                  </div>
                )}
              </Card>
            )
          })}
        </div>
      )}

      <Pager page={page} shown={rows.length} total={total} onPage={setPage} busy={busy} />
    </div>
  )
}

/* ============================================================ الطلبات */

function AppsTab({
  myId,
  onChanged,
  flash,
}: {
  myId: string | null
  /** بينده الأب علشان شارة التبويب تتحدّث */
  onChanged: () => Promise<void>
  flash: (m: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [rows, setRows] = useState<AppRow[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [page, setPage] = useState(0)
  const [loading, setLoading] = useState(true)
  /** التبويب بقى قايمة واحدة بفلتر حالة بدل كارتين بيحمّلوا كل الطلبات */
  const [state, setState] = useState<'pending' | 'handled'>('pending')

  const reload = useCallback(async () => {
    setBusy(true)
    let query = supabase()
      .from('captain_applications')
      .select('id, name, phone, job, why, handled_at, handled_by, created_at', {
        count: 'exact',
      })
      .order('created_at', { ascending: false })
    query =
      state === 'pending'
        ? query.is('handled_at', null)
        : query.not('handled_at', 'is', null)

    const { data, count, error } = await query.range(
      page * ADMIN_PAGE_SIZE,
      page * ADMIN_PAGE_SIZE + ADMIN_PAGE_SIZE - 1
    )
    setLoading(false)
    setBusy(false)
    if (error) {
      flash(`مقدرناش نجيب الطلبات: ${error.message}`)
      setRows([])
      setTotal(0)
      return
    }
    setRows((data ?? []) as AppRow[])
    setTotal(count ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, page])

  useEffect(() => {
    reload()
  }, [reload])

  /** بعد أي قبول/رفض: الصفحة والشارة مع بعض */
  const refresh = async () => {
    await Promise.all([reload(), onChanged()])
  }

  /** بنعلّم الطلب إنه اتعامل معاه — الجدول مفيهوش عمود حالة، فده اللي موجود */
  async function markHandled(id: string) {
    const { data, error } = await supabase()
      .from('captain_applications')
      .update({ handled_at: new Date().toISOString(), handled_by: myId })
      .eq('id', id)
      .select('id')
    if (error) return `مقدرناش نقفل الطلب: ${error.message}`
    if (((data ?? []) as unknown[]).length === 0) {
      return 'مقدرناش نقفل الطلب: القاعدة رفضت التعديل — صلاحيتك مش كفاية.'
    }
    return null
  }

  async function accept(a: AppRow) {
    if (!confirm(`هنقبل ${a.name} ككابتن. تمام؟`)) return
    setBusy(true)
    const db = supabase()

    // الطلب فيه رقم بس — لازم نلاقي حسابه علشان نربط الكابتن بيه
    const { data: prof, error: pErr } = await db
      .from('profiles')
      .select('id, first_name')
      .eq('phone', a.phone)
      .maybeSingle()
    if (pErr) {
      setBusy(false)
      return flash(`مقدرناش ندوّر على حسابه: ${pErr.message}`)
    }
    const profile = prof as { id: string; first_name: string | null } | null
    if (!profile) {
      setBusy(false)
      return flash('مفيش حساب بالرقم ده — قوله يسجّل في نسبوط الأول وبعدين اقبله.')
    }

    // بندوّر على الكابتن في القاعدة — قبل كده كان بيدوّر في مصفوفة محمّلة كلها
    const { data: exRow } = await db
      .from('captains')
      .select('id')
      .eq('profile_id', profile.id)
      .maybeSingle()
    const existing = exRow as { id: string } | null
    if (existing) {
      const { error } = await db
        .from('captains')
        .update({ is_active: true })
        .eq('id', existing.id)
      if (error) {
        setBusy(false)
        return flash(`مقدرناش نفتح الكابتن: ${error.message}`)
      }
    } else {
      const { error } = await db.from('captains').insert({
        profile_id: profile.id,
        display_name: a.name,
        craft_ar: a.job,
        bio_line: a.why?.trim() || `${a.name} — كابتن جديد معانا.`,
        activities: [],
        is_active: true,
      })
      if (error) {
        setBusy(false)
        return flash(`مقدرناش نعمل الكابتن: ${error.message}`)
      }
    }

    const problem = await markHandled(a.id)
    setBusy(false)
    await refresh()
    await revalidateSite()
    flash(problem ? `الكابتن اتعمل ✓ بس ${problem}` : 'اتقبل وبقى كابتن شغّال ✓')
  }

  async function reject(a: AppRow) {
    const reason = prompt('سبب الرفض (للتأكيد بس — القاعدة مفيهاش عمود يتخزن فيه):')?.trim()
    if (!reason) return flash('لازم سبب مكتوب قبل الرفض.')
    if (!confirm(`هنرفض طلب ${a.name}.\nالسبب: ${reason}\nتمام؟`)) return
    setBusy(true)
    const problem = await markHandled(a.id)
    setBusy(false)
    if (problem) return flash(problem)
    await refresh()
    flash('الطلب اتقفل ✓')
  }

  if (loading) return <Loading />

  return (
    <div className="mt-5 flex flex-col gap-4">
      <div className="flex flex-wrap items-end gap-3">
        <SelectField
          label="الحالة"
          value={state}
          onChange={(v) => {
            setPage(0)
            setState(v as 'pending' | 'handled')
          }}
          options={[
            { value: 'pending', label: 'مستنية' },
            { value: 'handled', label: 'اتعامل معاها' },
          ]}
        />
        <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
          {total === null ? '…' : total} طلب
        </span>
      </div>

      <Card
        title={state === 'pending' ? 'طلبات مستنية' : 'طلبات اتعامل معاها'}
        hint="القبول بيدوّر على حساب بنفس الرقم وبيعمله كابتن شغّال."
      >
        {rows.length === 0 ? (
          <Empty>{state === 'pending' ? 'مفيش طلبات مستنية.' : 'لسه مفيش.'}</Empty>
        ) : state === 'pending' ? (
          <div className="mt-3 flex flex-col gap-3">
            {rows.map((a) => (
              <div key={a.id} className="rounded-16 p-3" style={{ background: 'var(--bg)' }}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-16 font-black">{a.name}</span>
                  {a.job && <Tag>{a.job}</Tag>}
                  <span className="font-body text-12" style={{ color: 'var(--muted)' }}>
                    قدّم {when(a.created_at)}
                  </span>
                  <span className="ms-auto flex items-center gap-2">
                    <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
                      تليفونه
                    </span>
                    <Phone value={a.phone} />
                  </span>
                </div>
                {a.why && <div className="mt-2 font-body text-15">«{a.why}»</div>}
                <div className="mt-3 flex flex-wrap gap-2">
                  <Btn kind="primary" onClick={() => accept(a)} disabled={busy}>
                    اقبله
                  </Btn>
                  <Btn kind="danger" onClick={() => reject(a)} disabled={busy}>
                    ارفضه
                  </Btn>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <Table head={['الاسم', 'الشغلانة', 'التليفون', 'قدّم', 'اتقفل']}>
            {rows.map((a) => (
              <tr key={a.id}>
                <td className="p-2">{a.name}</td>
                <td className="p-2">{a.job || '—'}</td>
                <td className="p-2">
                  <Phone value={a.phone} />
                </td>
                <td className="p-2">{day(a.created_at)}</td>
                <td className="p-2">{when(a.handled_at)}</td>
              </tr>
            ))}
          </Table>
        )}

        <Pager page={page} shown={rows.length} total={total} onPage={setPage} busy={busy} />
      </Card>
    </div>
  )
}

/* ============================================================ التقارير */

function ReportsTab({ captains }: { captains: CaptainName[] }) {
  const [who, setWho] = useState('all')
  const [rows, setRows] = useState<ReportRow[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [page, setPage] = useState(0)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState<string | null>(null)

  const nameOf = (id: string) => {
    const c = captains.find((x) => x.id === id)
    return c?.display_name || c?.profiles?.first_name || 'كابتن'
  }

  const reload = useCallback(async () => {
    setBusy(true)
    let query = supabase()
      .from('captain_reports')
      .select(
        'id, sbota_id, captain_id, attendance_json, what_worked, what_didnt, incident, suggestion, created_at, sbotat(starts_at, sbota_templates(name_ar))',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
    if (who !== 'all') query = query.eq('captain_id', who)

    const { data, count, error } = await query.range(
      page * ADMIN_PAGE_SIZE,
      page * ADMIN_PAGE_SIZE + ADMIN_PAGE_SIZE - 1
    )
    setLoading(false)
    setBusy(false)
    if (error) {
      setErr(error.message)
      setRows([])
      setTotal(0)
      return
    }
    setErr(null)
    setRows((data ?? []) as unknown as ReportRow[])
    setTotal(count ?? null)
  }, [who, page])

  useEffect(() => {
    reload()
  }, [reload])

  if (loading) return <Loading />

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-end gap-3">
        <SelectField
          label="مين كتبه"
          value={who}
          onChange={(v) => {
            setPage(0)
            setWho(v)
          }}
          options={[
            { value: 'all', label: 'كل الكباتن' },
            ...captains.map((c) => ({ value: c.id, label: nameOf(c.id) })),
          ]}
        />
        <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
          {total === null ? '…' : total} تقرير
        </span>
      </div>

      {err && (
        <div className="mt-3 font-body text-14" style={{ color: 'var(--err-text)' }}>
          مقدرناش نجيب التقارير: {err}
        </div>
      )}

      {rows.length === 0 ? (
        <Empty>مفيش تقارير لسه — الكباتن بيكتبوها بعد ما السبوطة تخلص.</Empty>
      ) : (
        <div className="mt-4 flex flex-col gap-3">
          {rows.map((r) => {
            const att = r.attendance_json ?? {}
            const count = Object.keys(att).length
            return (
              <Card key={r.id}>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-16 font-black">
                    {r.sbotat?.sbota_templates?.name_ar ?? 'سبوطة'}
                  </span>
                  <Tag>{nameOf(r.captain_id)}</Tag>
                  <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
                    السبوطة {day(r.sbotat?.starts_at)} · التقرير {when(r.created_at)}
                  </span>
                  {count > 0 && (
                    <span className="ms-auto">
                      <Tag>غطى حضور {count}</Tag>
                    </span>
                  )}
                </div>

                <div className="mt-3 grid gap-3 md:grid-cols-2">
                  <Line label="اللي مشي حلو" text={r.what_worked} />
                  <Line label="اللي مامشيش" text={r.what_didnt} />
                  <Line label="حصل مشكلة؟" text={r.incident} danger />
                  <Line label="اقتراحه" text={r.suggestion} />
                </div>
              </Card>
            )
          })}
        </div>
      )}

      <Pager page={page} shown={rows.length} total={total} onPage={setPage} busy={busy} />
    </div>
  )
}

function Line({ label, text, danger }: { label: string; text: string | null; danger?: boolean }) {
  return (
    <div className="rounded-14 px-3 py-2" style={{ background: 'var(--bg)' }}>
      <div
        className="font-body text-13"
        style={{ color: danger && text ? 'var(--err-text)' : 'var(--muted)' }}
      >
        {label}
      </div>
      <div className="mt-1 font-body text-15">{text || '—'}</div>
    </div>
  )
}

/* ============================================================ الأماكن */

function VenuesTab({
  venueIndex,
  myId,
  onChanged,
  flash,
}: {
  /** فهرس الأسماء للـ dropdown وترجمة id → اسم (مسقوف بـ ADMIN_SCAN_MAX) */
  venueIndex: VenueName[]
  myId: string | null
  onChanged: () => Promise<void>
  flash: (m: string) => void
}) {
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [nName, setNName] = useState('')
  const [nKind, setNKind] = useState('cafe')
  const [nArea, setNArea] = useState('tagamoa')
  const [nAddress, setNAddress] = useState('')

  const [alertVenue, setAlertVenue] = useState('')
  const [alertReason, setAlertReason] = useState('')
  const [alertNote, setAlertNote] = useState('')

  const [venues, setVenues] = useState<VenueRow[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [sums, setSums] = useState<{ all: number; active: number; verified: number } | null>(
    null
  )
  const [page, setPage] = useState(0)
  const [areaFilter, setAreaFilter] = useState('all')
  const [q, setQ] = useState('')
  const [needle, setNeedle] = useState('')
  const [loading, setLoading] = useState(true)

  /** البلاغات المفتوحة قايمة شغل قصيرة — بتتجاب كاملة بسقف، والمقفولة بصفحة */
  const [open, setOpen] = useState<AlertRow[]>([])
  const [done, setDone] = useState<AlertRow[]>([])
  const [donePage, setDonePage] = useState(0)
  const [doneTotal, setDoneTotal] = useState<number | null>(null)

  useEffect(() => {
    const t = setTimeout(() => {
      setPage(0)
      setNeedle(safeLike(q))
    }, SEARCH_DELAY_MS)
    return () => clearTimeout(t)
  }, [q])

  const reload = useCallback(async () => {
    setBusy(true)
    let query = supabase()
      .from('venues')
      .select(
        'id, name, kind, area, address, contact_phone, contract_notes, wholesale_price, verified_at, is_active, rating_avg, created_at',
        { count: 'exact' }
      )
      .order('name')
    if (areaFilter !== 'all') query = query.eq('area', areaFilter)
    if (needle) query = query.ilike('name', `%${needle}%`)

    const { data, count, error } = await query.range(
      page * ADMIN_PAGE_SIZE,
      page * ADMIN_PAGE_SIZE + ADMIN_PAGE_SIZE - 1
    )
    setLoading(false)
    setBusy(false)
    if (error) {
      flash(`مقدرناش نجيب الأماكن: ${error.message}`)
      setVenues([])
      setTotal(0)
      return
    }
    setVenues((data ?? []) as VenueRow[])
    setTotal(count ?? null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [areaFilter, needle, page])

  const loadSums = useCallback(async () => {
    const db = supabase()
    const [all, on, ver] = await Promise.all([
      db.from('venues').select('id', { count: 'exact', head: true }),
      db.from('venues').select('id', { count: 'exact', head: true }).eq('is_active', true),
      db
        .from('venues')
        .select('id', { count: 'exact', head: true })
        .not('verified_at', 'is', null),
    ])
    setSums({ all: all.count ?? 0, active: on.count ?? 0, verified: ver.count ?? 0 })
  }, [])

  const loadAlerts = useCallback(async () => {
    const db = supabase()
    const [o, d] = await Promise.all([
      db
        .from('provider_alerts')
        .select('id, venue_id, reason, note, created_at, resolved_at')
        .is('resolved_at', null)
        .order('created_at', { ascending: false })
        .range(0, ADMIN_SCAN_MAX - 1),
      db
        .from('provider_alerts')
        .select('id, venue_id, reason, note, created_at, resolved_at', { count: 'exact' })
        .not('resolved_at', 'is', null)
        .order('resolved_at', { ascending: false })
        .range(
          donePage * ADMIN_PAGE_SIZE,
          donePage * ADMIN_PAGE_SIZE + ADMIN_PAGE_SIZE - 1
        ),
    ])
    setOpen((o.data ?? []) as AlertRow[])
    setDone((d.data ?? []) as AlertRow[])
    setDoneTotal(d.count ?? null)
  }, [donePage])

  useEffect(() => {
    reload()
  }, [reload])
  useEffect(() => {
    loadSums()
  }, [loadSums])
  useEffect(() => {
    loadAlerts()
  }, [loadAlerts])

  const venueName = (id: string | null) =>
    venueIndex.find((v) => v.id === id)?.name ??
    venues.find((v) => v.id === id)?.name ??
    'مكان اتشال'

  const alertsByVenue = useMemo(() => {
    const m: Record<string, number> = {}
    for (const a of open) if (a.venue_id) m[a.venue_id] = (m[a.venue_id] ?? 0) + 1
    return m
  }, [open])

  /** بعد أي كتابة: الصفحة والعدّادات والفهرس فوق */
  const refresh = async () => {
    await Promise.all([reload(), loadSums(), loadAlerts(), onChanged()])
  }

  async function patch(id: string, p: Record<string, unknown>) {
    setBusy(true)
    const { data, error } = await supabase().from('venues').update(p).eq('id', id).select('id')
    setBusy(false)
    if (error) return flash(`مقدرناش نحفظ: ${error.message}`)
    if (rejected(data)) return flash('مااتحفظش — القاعدة رفضت، صلاحيتك مش كفاية.')
    await refresh()
    flash('اتحفظ ✓')
  }

  async function addVenue() {
    if (!nName.trim() || !nAddress.trim()) return flash('لازم اسم وعنوان.')
    setBusy(true)
    const { error } = await supabase().from('venues').insert({
      name: nName.trim(),
      kind: nKind,
      area: nArea,
      address: nAddress.trim(),
      is_active: true,
    })
    setBusy(false)
    if (error) return flash(`مقدرناش نزوّده: ${error.message}`)
    setNName('')
    setNAddress('')
    setAdding(false)
    await refresh()
    flash('المكان اتزاد ✓')
  }

  async function removeVenue(v: VenueRow) {
    if (!confirm(`هنمسح «${v.name}» خالص. لو ليه سبوطات قديمة المسح هيفشل — الأحسن تقفله.\nتمام؟`))
      return
    setBusy(true)
    const { error } = await supabase().from('venues').delete().eq('id', v.id)
    setBusy(false)
    if (error) return flash(`مقدرناش نمسحه: ${error.message}`)
    await refresh()
    flash('المكان اتمسح ✓')
  }

  async function addAlert() {
    if (!alertVenue) return flash('اختار المكان.')
    if (!alertReason.trim()) return flash('اكتب المشكلة.')
    setBusy(true)
    const { error } = await supabase().from('provider_alerts').insert({
      venue_id: alertVenue,
      reason: alertReason.trim(),
      note: alertNote.trim() || null,
    })
    setBusy(false)
    if (error) return flash(`مقدرناش نسجّل المشكلة: ${error.message}`)
    setAlertReason('')
    setAlertNote('')
    await refresh()
    flash('المشكلة اتسجّلت ✓')
  }

  async function resolveAlert(id: string) {
    if (!confirm('هنقفل المشكلة دي على إنها اتحلّت. تمام؟')) return
    setBusy(true)
    const { error } = await supabase()
      .from('provider_alerts')
      .update({ resolved_at: new Date().toISOString() })
      .eq('id', id)
    setBusy(false)
    if (error) return flash(`مقدرناش نقفلها: ${error.message}`)
    await refresh()
    flash('اتقفلت ✓')
  }

  if (loading) return <Loading />

  return (
    <div className="mt-5 flex flex-col gap-5">
      <div className="flex flex-wrap gap-3">
        <Stat label="الأماكن" value={sums ? String(sums.all) : '…'} />
        <Stat label="شغّالة" value={sums ? String(sums.active) : '…'} />
        <Stat label="متأكدين منها" value={sums ? String(sums.verified) : '…'} />
        <Stat label="مشاكل مفتوحة" value={String(open.length)} />
      </div>

      {/* مكان جديد */}
      <Card title="مكان جديد">
        {adding ? (
          <>
            <div className="mt-3 grid gap-3 md:grid-cols-2">
              <label className="flex flex-col gap-1">
                <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
                  الاسم
                </span>
                <input
                  value={nName}
                  onChange={(e) => setNName(e.target.value)}
                  className="w-full rounded-14 px-3 py-2 font-body text-16"
                  style={{
                    background: 'var(--bg)',
                    color: 'var(--fg)',
                    border: '2px solid var(--line)',
                  }}
                />
              </label>
              <SelectField label="نوعه" value={nKind} onChange={setNKind} options={VENUE_KINDS} />
              <SelectField label="المنطقة" value={nArea} onChange={setNArea} options={AREAS} />
              <label className="flex flex-col gap-1">
                <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
                  العنوان
                </span>
                <input
                  value={nAddress}
                  onChange={(e) => setNAddress(e.target.value)}
                  className="w-full rounded-14 px-3 py-2 font-body text-16"
                  style={{
                    background: 'var(--bg)',
                    color: 'var(--fg)',
                    border: '2px solid var(--line)',
                  }}
                />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Btn kind="primary" onClick={addVenue} disabled={busy}>
                زوّده
              </Btn>
              <Btn onClick={() => setAdding(false)}>سيبك</Btn>
            </div>
          </>
        ) : (
          <div className="mt-3">
            <Btn kind="primary" onClick={() => setAdding(true)}>
              زوّد مكان
            </Btn>
          </div>
        )}
      </Card>

      {/* الأماكن */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
            دوّر بالاسم
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="مثلًا: كافيه"
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
          value={areaFilter}
          onChange={(v) => {
            setPage(0)
            setAreaFilter(v)
          }}
          options={[{ value: 'all', label: 'كل المناطق' }, ...AREAS]}
        />
        <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
          {total === null ? '…' : total} بالفلتر ده
        </span>
      </div>

      {venues.length === 0 ? (
        <Empty>مفيش أماكن بالفلتر ده.</Empty>
      ) : (
        <div className="flex flex-col gap-4">
          {venues.map((v) => (
            <Card key={v.id} dim={!v.is_active}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-display text-18 font-black">{v.name}</span>
                <Tag>{kindLabel(v.kind)}</Tag>
                <Tag>{areaLabel(v.area)}</Tag>
                {v.verified_at && <Tag color="#8ED081">متأكدين منه</Tag>}
                {!v.is_active && <Tag color="#F4632A">مقفول</Tag>}
                {alertsByVenue[v.id] && (
                  <Tag color="#F4632A">{alertsByVenue[v.id]} مشكلة مفتوحة</Tag>
                )}
                {v.rating_avg != null && (
                  <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
                    تقييمه {Number(v.rating_avg).toFixed(1)}
                  </span>
                )}
                <span className="ms-auto flex items-center gap-2">
                  <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
                    تليفون المكان
                  </span>
                  <Phone value={v.contact_phone} />
                </span>
              </div>

              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <TextField label="الاسم" value={v.name} onSave={(x) => patch(v.id, { name: x.trim() })} />
                <SelectField
                  label="نوعه"
                  value={v.kind}
                  onChange={(x) => patch(v.id, { kind: x })}
                  options={VENUE_KINDS}
                />
                <SelectField
                  label="المنطقة"
                  value={v.area}
                  onChange={(x) => patch(v.id, { area: x })}
                  options={AREAS}
                />
                <TextField
                  label="التليفون"
                  value={v.contact_phone ?? ''}
                  onSave={(x) => patch(v.id, { contact_phone: x.trim() || null })}
                />
                <div className="md:col-span-2">
                  <TextField
                    label="العنوان"
                    value={v.address}
                    onSave={(x) => patch(v.id, { address: x.trim() })}
                  />
                </div>
                <NumberField
                  label="سعر الجملة"
                  value={v.wholesale_price ?? 0}
                  min={0}
                  suffix="قرش"
                  hint={`يعني ${money(v.wholesale_price)} — اكتبه بالقرش (100 قرش = جنيه).`}
                  onSave={(x) => patch(v.id, { wholesale_price: x || null })}
                />
                <div className="flex flex-col justify-end gap-2">
                  <Toggle
                    label="شغّال"
                    value={v.is_active}
                    onChange={(x) => patch(v.id, { is_active: x })}
                  />
                  <Toggle
                    label="متأكدين منه"
                    value={Boolean(v.verified_at)}
                    hint="يعني حد مننا راح وشافه بنفسه."
                    onChange={(x) =>
                      patch(v.id, {
                        verified_at: x ? new Date().toISOString() : null,
                        verified_by: x ? myId : null,
                      })
                    }
                  />
                </div>
                <div className="md:col-span-2">
                  <TextField
                    label="ملاحظات الاتفاق"
                    value={v.contract_notes ?? ''}
                    multiline
                    onSave={(x) => patch(v.id, { contract_notes: x.trim() || null })}
                  />
                </div>
              </div>

              <div className="mt-3">
                <Btn kind="danger" onClick={() => removeVenue(v)} disabled={busy}>
                  امسح المكان
                </Btn>
              </div>
            </Card>
          ))}
        </div>
      )}

      <Pager page={page} shown={venues.length} total={total} onPage={setPage} busy={busy} />

      {/* مشاكل الأماكن */}
      <Card title="مشاكل الأماكن" hint="سجّل المشكلة هنا علشان محدش يحجز في مكان فيه مشكلة وإحنا ناسيين.">
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <SelectField
            label="المكان"
            value={alertVenue}
            onChange={setAlertVenue}
            options={[
              { value: '', label: 'اختار مكان' },
              ...venueIndex.map((v) => ({ value: v.id, label: v.name })),
            ]}
          />
          <label className="flex flex-col gap-1">
            <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
              المشكلة
            </span>
            <input
              value={alertReason}
              onChange={(e) => setAlertReason(e.target.value)}
              placeholder="مثلًا: رفعوا السعر فجأة"
              className="min-w-[200px] rounded-14 px-3 py-2 font-body text-16"
              style={{
                background: 'var(--bg)',
                color: 'var(--fg)',
                border: '2px solid var(--line)',
              }}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
              تفاصيل زيادة
            </span>
            <input
              value={alertNote}
              onChange={(e) => setAlertNote(e.target.value)}
              className="min-w-[200px] rounded-14 px-3 py-2 font-body text-16"
              style={{
                background: 'var(--bg)',
                color: 'var(--fg)',
                border: '2px solid var(--line)',
              }}
            />
          </label>
          <Btn kind="primary" onClick={addAlert} disabled={busy}>
            سجّل المشكلة
          </Btn>
        </div>

        <div className="mt-4 font-body text-13" style={{ color: 'var(--muted)' }}>
          مفتوحة ({open.length})
        </div>
        {open.length === 0 ? (
          <Empty>مفيش مشاكل مفتوحة — تمام.</Empty>
        ) : (
          <div className="mt-2 flex flex-col gap-2">
            {open.map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap items-center gap-2 rounded-14 px-3 py-2"
                style={{ background: 'var(--bg)' }}
              >
                <span className="font-display text-15 font-black">{venueName(a.venue_id)}</span>
                <span className="font-body text-15">{a.reason}</span>
                {a.note && (
                  <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
                    — {a.note}
                  </span>
                )}
                <span className="font-body text-12" style={{ color: 'var(--muted)' }}>
                  {when(a.created_at)}
                </span>
                <span className="ms-auto">
                  <Btn onClick={() => resolveAlert(a.id)} disabled={busy}>
                    اتحلّت
                  </Btn>
                </span>
              </div>
            ))}
          </div>
        )}

        {(done.length > 0 || donePage > 0) && (
          <>
            <div className="mt-4 font-body text-13" style={{ color: 'var(--muted)' }}>
              اتحلّت ({doneTotal === null ? '…' : doneTotal})
            </div>
            <Table head={['المكان', 'المشكلة', 'اتسجّلت', 'اتحلّت']}>
              {done.map((a) => (
                <tr key={a.id}>
                  <td className="p-2">{venueName(a.venue_id)}</td>
                  <td className="p-2">{a.reason}</td>
                  <td className="p-2">{day(a.created_at)}</td>
                  <td className="p-2">{when(a.resolved_at)}</td>
                </tr>
              ))}
            </Table>
            <Pager
              page={donePage}
              shown={done.length}
              total={doneTotal}
              onPage={setDonePage}
              busy={busy}
            />
          </>
        )}
      </Card>
    </div>
  )
}
