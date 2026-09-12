'use client'

import { Fragment, useCallback, useEffect, useState } from 'react'
import { AdminShell } from '@/components/AdminShell'
import { supabase } from '@/lib/supabase'
import { revalidateSite } from '@/lib/admin'
import type { AdminMe } from '@/lib/admin'
import {
  ADMIN_PAGE_SIZE,
  ADMIN_SCAN_MAX,
  Card,
  Section,
  Tabs,
  Btn,
  Pager,
  Toggle,
  SelectField,
  Table,
  Empty,
  Loading,
  Tag,
  Stat,
  cairoDay,
  cairoDayStart,
  cairoParts,
  cairoToIso,
  dayAdd,
  todayCairo,
  useFlash,
  money,
  when,
  day,
} from '@/components/admin-ui'

/**
 * المواعيد — كل سبوطة مجدولة.
 *
 * القالب (في /admin/templates) هو الكلام الثابت. هنا بنحدّد الموعد نفسه:
 * إمتى وفين ومين الكابتن وبكام والعدد. السعر والعدد بيتملوا من القالب
 * أول ما تختاره، وبعد كده تقدر تغيّرهم في الموعد ده لوحده.
 *
 * المواعيد الفرعية (قفل الحجز، الكشف، فتح الشات) القاعدة بتحسبها لوحدها
 * من trigger اسمه fn_sbota_timings — فبنعرضها للقراءة بس.
 * والمنطقة بتيجي من المكان لوحدها (fn_sync_sbota_area).
 *
 * الإلغاء بيمرّ على fn_cancel_booking لكل حجز شغّال بـ p_by='us' —
 * ده اللي بيرجّع الفلوس كاملة وبيزوّد رصيد الاعتذار وبيبلّغ اللي في الانتظار.
 * ممنوع نغيّر الحالة على طول من غير ما نعدّي على الدالة دي.
 *
 * الترقيم من القاعدة: فلاتر الحالة والمنطقة والوقت بتتحوّل لشروط على الخادم
 * (`eq` و `gte`/`lt` على starts_at بحدود يوم القاهرة)، والصفوف بتيجي صفحة
 * صفحة بـ range. عدد المحجوز مابيتجابش لكل الحجوزات — بس للسبوطات اللي
 * قدامك دلوقتي (`in('sbota_id', …)`).
 */

/* ---------------------------------------------------------- أنواع */

interface Sbota {
  id: string
  template_id: string
  venue_id: string | null
  captain_id: string | null
  origin: string | null
  host_id: string | null
  host_name_ar: string | null
  host_note_ar: string | null
  title_ar: string | null
  details_ar: string | null
  venue_name_ar: string | null
  address_ar: string | null
  cost_note_ar: string | null
  starts_at: string
  ends_at: string
  price: number
  org_fee: number
  capacity: number
  min_to_run: number
  status: string
  girls_only: boolean
  is_day: boolean
  is_mystery: boolean
  mystery_reveal_at: string | null
  address_hidden: boolean
  booking_closes_at: string | null
  reveal_at: string | null
  chat_opens_at: string | null
  chat_closes_at: string | null
  cancel_reason: string | null
  area: string | null
  area_label_ar: string | null
}

interface Template {
  id: string
  name_ar: string
  default_price: number
  org_fee: number
  duration_min: number
  min_group: number
  max_group: number
  is_day: boolean
  girls_only: boolean
}

interface Venue {
  id: string
  name: string
  area: string
  area_label_ar: string | null
  is_active: boolean
}

interface Captain {
  id: string
  display_name: string | null
  bio_line: string
  is_active: boolean
}

/* ---------------------------------------------------------- أسامي */

const STATUSES = [
  { value: 'draft', label: 'مسودة' },
  { value: 'open', label: 'مفتوحة' },
  { value: 'full', label: 'كمّلت' },
  { value: 'locked', label: 'مقفولة' },
  { value: 'running', label: 'شغالة دلوقتي' },
  { value: 'done', label: 'خلصت' },
  { value: 'cancelled', label: 'متلغية' },
]
const statusLabel = (s: string) => STATUSES.find((x) => x.value === s)?.label ?? s
const STATUS_COLOR: Record<string, string | undefined> = {
  open: '#9BE38B',
  full: '#F4632A',
  cancelled: '#F2A0A0',
  running: '#F4D06A',
}

const AREAS = [
  { value: 'tagamoa', label: 'التجمع' },
  { value: 'maadi', label: 'المعادي' },
  { value: 'zayed_october', label: 'زايد وأكتوبر' },
  { value: 'heliopolis_nasr', label: 'مصر الجديدة ومدينة نصر' },
  { value: 'downtown_zamalek', label: 'وسط البلد والزمالك' },
  { value: 'other', label: 'مكان تاني' },
]
const areaLabel = (a: string | null) =>
  a ? (AREAS.find((x) => x.value === a)?.label ?? a) : '—'

/** الأسبوع عندنا بيبدأ سبت */
const DAY_NAMES = ['السبت', 'الحد', 'الاتنين', 'التلات', 'الأربع', 'الخميس', 'الجمعة']
/** ترتيب أيام الأسبوع بأرقام JS (الأحد = 0) بدايةً من السبت */
const DAY_JS = [6, 0, 1, 2, 3, 4, 5]

const SEAT_TAKEN = ['paid', 'pending_payment', 'attended']

/* ---------------------------------------------------------- وقت القاهرة */

/* حساب أيام القاهرة نفسه في admin-ui — هنا اللي يخص الأسابيع بس */

const cairoTime = (iso: string) => cairoParts(iso).time

const weekdayOf = (ymd: string) => new Date(`${ymd}T12:00:00Z`).getUTCDay()
/** أول يوم في أسبوع اليوم ده (السبت) */
const weekStart = (ymd: string) => dayAdd(ymd, -((weekdayOf(ymd) + 1) % 7))

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

/**
 * عدد المحجوز لكل سبوطة من السبوطات اللي اتطلبت بس.
 * الأصل كان بيجيب كل الحجوزات (20 ألف صف) ويعدّهم في المتصفح.
 */
async function countBooked(ids: string[]): Promise<Record<string, number>> {
  const map: Record<string, number> = {}
  if (ids.length === 0) return map
  const db = supabase()
  for (const part of chunk(ids, 100)) {
    for (const id of part) map[id] = 0
    const { data } = await db
      .from('bookings')
      .select('sbota_id')
      .in('sbota_id', part)
      .in('status', SEAT_TAKEN)
    for (const r of (data ?? []) as { sbota_id: string }[]) {
      map[r.sbota_id] = (map[r.sbota_id] ?? 0) + 1
    }
  }
  return map
}

/* ---------------------------------------------------------- حقول صغيرة */

function Inp({
  label,
  type = 'text',
  value,
  onChange,
  hint,
  className,
}: {
  label?: string
  type?: string
  value: string
  onChange: (v: string) => void
  hint?: string
  className?: string
}) {
  return (
    <label className="flex flex-col gap-1">
      {label && (
        <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
          {label}
        </span>
      )}
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`rounded-14 px-3 py-2 font-body text-16 ${className ?? ''}`}
        style={{ background: 'var(--bg)', color: 'var(--fg)', border: '2px solid var(--line)' }}
      />
      {hint && (
        <span className="font-body text-12" style={{ color: 'var(--muted)' }}>
          {hint}
        </span>
      )}
    </label>
  )
}

/* ---------------------------------------------------------- الصفحة */

export default function AdminSbotatPage() {
  return (
    <AdminShell title="المواعيد" needs="sbotat.view">
      {(me: AdminMe) => (
        <SbotatEditor
          canEdit={me.permissions.has('sbotat.edit')}
          canCancel={me.permissions.has('sbotat.cancel')}
        />
      )}
    </AdminShell>
  )
}

type TabId = 'table' | 'cal'
type PanelMode = 'edit' | 'repeat' | 'cancel'

function SbotatEditor({ canEdit, canCancel }: { canEdit: boolean; canCancel: boolean }) {
  const [rows, setRows] = useState<Sbota[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [calRows, setCalRows] = useState<Sbota[]>([])
  const [templates, setTemplates] = useState<Template[]>([])
  const [venues, setVenues] = useState<Venue[]>([])
  const [captains, setCaptains] = useState<Captain[]>([])
  const [booked, setBooked] = useState<Record<string, number>>({})
  const [stats, setStats] = useState<{ soon: number; open: number; risky: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)

  const [tab, setTab] = useState<TabId>('table')
  const [fStatus, setFStatus] = useState('الكل')
  const [fOrigin, setFOrigin] = useState('الكل')
  const [fArea, setFArea] = useState('الكل')
  const [fWeek, setFWeek] = useState('next')
  const [page, setPage] = useState(0)
  const [weekOff, setWeekOff] = useState(0)
  const [adding, setAdding] = useState(false)
  const [panel, setPanel] = useState<{ id: string; mode: PanelMode } | null>(null)

  const { flash, node: flashNode } = useFlash()

  /** القوايم الصغيرة (قوالب · أماكن · كباتن) — جداول تعريفية، بتتجاب مرة واحدة */
  const loadLists = useCallback(async () => {
    const db = supabase()
    const [t, v, c] = await Promise.all([
      db
        .from('sbota_templates')
        .select(
          'id, name_ar, default_price, org_fee, duration_min, min_group, max_group, is_day, girls_only'
        )
        .order('name_ar')
        .range(0, ADMIN_SCAN_MAX - 1),
      db
        .from('venues')
        .select('id, name, area, area_label_ar, is_active')
        .order('name')
        .range(0, ADMIN_SCAN_MAX - 1),
      db
        .from('captains')
        .select('id, display_name, bio_line, is_active')
        .range(0, ADMIN_SCAN_MAX - 1),
    ])
    setTemplates((t.data ?? []) as Template[])
    setVenues((v.data ?? []) as Venue[])
    setCaptains((c.data ?? []) as Captain[])
  }, [])

  /** صفحة الجدول — كل الفلاتر بتتنفّذ في القاعدة */
  const loadTable = useCallback(async () => {
    setBusy(true)
    const today = todayCairo()
    const ws = weekStart(today)

    let q = supabase().from('sbotat').select('*', { count: 'exact' })
    if (fStatus !== 'الكل') q = q.eq('status', fStatus)
    if (fOrigin !== 'الكل') q = q.eq('origin', fOrigin)
    if (fArea !== 'الكل') q = q.eq('area', fArea)
    if (fWeek === 'this') {
      q = q.gte('starts_at', cairoDayStart(ws)).lt('starts_at', cairoDayStart(dayAdd(ws, 7)))
    } else if (fWeek === 'nextweek') {
      q = q
        .gte('starts_at', cairoDayStart(dayAdd(ws, 7)))
        .lt('starts_at', cairoDayStart(dayAdd(ws, 14)))
    } else if (fWeek === 'next') {
      q = q.gte('starts_at', cairoDayStart(today))
    } else if (fWeek === 'past') {
      q = q.lt('starts_at', cairoDayStart(today))
    }

    const { data, count, error } = await q
      // اللي فات بيتعرض من الأحدث للأقدم، غير كده الأقرب الأول
      .order('starts_at', { ascending: fWeek !== 'past' })
      .range(page * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE + ADMIN_PAGE_SIZE - 1)

    setLoading(false)
    setBusy(false)
    if (error) {
      flash(`مقدرناش نجيب السبوطات: ${error.message}`)
      setRows([])
      setTotal(0)
      return
    }
    const list = (data ?? []) as Sbota[]
    setRows(list)
    setTotal(count ?? null)
    const map = await countBooked(list.map((r) => r.id))
    setBooked((old) => ({ ...old, ...map }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fStatus, fOrigin, fArea, fWeek, page])

  /** أسبوع التقويم بس — مش الجدول كله */
  const calStart = dayAdd(weekStart(todayCairo()), weekOff * 7)

  const loadCal = useCallback(async () => {
    const { data, error } = await supabase()
      .from('sbotat')
      .select('*')
      .gte('starts_at', cairoDayStart(calStart))
      .lt('starts_at', cairoDayStart(dayAdd(calStart, 7)))
      .order('starts_at')
      .range(0, ADMIN_SCAN_MAX - 1)
    if (error) {
      flash(`مقدرناش نجيب أسبوع التقويم: ${error.message}`)
      return
    }
    const list = (data ?? []) as Sbota[]
    setCalRows(list)
    const map = await countBooked(list.map((r) => r.id))
    setBooked((old) => ({ ...old, ...map }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [calStart])

  /** الأرقام اللي فوق — عدّ من القاعدة، والخطر بيتحسب من الجاي بس */
  const loadStats = useCallback(async () => {
    const db = supabase()
    const todayIso = cairoDayStart(todayCairo())
    const [soon, open, upcoming] = await Promise.all([
      db
        .from('sbotat')
        .select('id', { count: 'exact', head: true })
        .gte('starts_at', todayIso)
        .neq('status', 'cancelled'),
      db
        .from('sbotat')
        .select('id', { count: 'exact', head: true })
        .gte('starts_at', todayIso)
        .eq('status', 'open'),
      db
        .from('sbotat')
        .select('id, min_to_run')
        .gte('starts_at', todayIso)
        .neq('status', 'cancelled')
        .neq('status', 'draft')
        .order('starts_at')
        .range(0, ADMIN_SCAN_MAX - 1),
    ])
    const list = (upcoming.data ?? []) as { id: string; min_to_run: number }[]
    const map = await countBooked(list.map((r) => r.id))
    setBooked((old) => ({ ...old, ...map }))
    setStats({
      soon: soon.count ?? 0,
      open: open.count ?? 0,
      risky: list.filter((r) => (map[r.id] ?? 0) < r.min_to_run).length,
    })
  }, [])

  const reload = useCallback(async () => {
    await Promise.all([loadTable(), tab === 'cal' ? loadCal() : Promise.resolve(), loadStats()])
  }, [loadTable, loadCal, loadStats, tab])

  useEffect(() => {
    loadLists()
  }, [loadLists])

  useEffect(() => {
    loadTable()
  }, [loadTable])

  useEffect(() => {
    if (tab === 'cal') loadCal()
  }, [tab, loadCal])

  useEffect(() => {
    loadStats()
  }, [loadStats])

  /** أي تغيير في الفلتر بيرجّعنا لأول صفحة */
  const setFilter = (set: (v: string) => void) => (v: string) => {
    setPage(0)
    set(v)
  }

  const tplOf = useCallback(
    (id: string) => templates.find((t) => t.id === id),
    [templates]
  )
  const venueOf = useCallback((id: string | null) => venues.find((v) => v.id === id), [venues])
  const captainOf = useCallback(
    (id: string | null) => captains.find((c) => c.id === id),
    [captains]
  )
  const captainName = useCallback(
    (id: string | null) => {
      const c = captainOf(id)
      return c ? (c.display_name ?? c.bio_line) : '—'
    },
    [captainOf]
  )

  /* ------------------------------------------------ حسابات */

  const under = useCallback(
    (r: Sbota) => (booked[r.id] ?? 0) < r.min_to_run,
    [booked]
  )

  /* ------------------------------------------------ التعديلات */

  async function patch(id: string, p: Record<string, unknown>, note = 'اتحفظ ✓') {
    // .select() علشان نتأكد إن الصف اتغيّر فعلًا — RLS بترجّع صفر صفوف من غير خطأ
    const { data, error } = await supabase()
      .from('sbotat')
      .update(p)
      .eq('id', id)
      .select('id')
    if (error) {
      flash(`مقدرناش نحفظ: ${error.message}`)
      return false
    }
    if (!data || (data as unknown[]).length === 0) {
      flash('مااتحفظش — مالكش صلاحية الكتابة على السبوطة دي')
      return false
    }
    await reload()
    await revalidateSite()
    flash(note)
    return true
  }

  /** نسخة من نفس السبوطة بعد أسبوع — مسودة علشان تراجعها الأول */
  async function duplicate(r: Sbota) {
    const parts = cairoParts(r.starts_at)
    const newDate = dayAdd(parts.date, 7)
    const startsAt = cairoToIso(newDate, parts.time)
    const lenMs = new Date(r.ends_at).getTime() - new Date(r.starts_at).getTime()
    const endsAt = new Date(new Date(startsAt).getTime() + lenMs).toISOString()

    const { error } = await supabase().from('sbotat').insert({
      template_id: r.template_id,
      venue_id: r.venue_id,
      captain_id: r.captain_id,
      starts_at: startsAt,
      ends_at: endsAt,
      price: r.price,
      org_fee: r.org_fee,
      capacity: r.capacity,
      min_to_run: r.min_to_run,
      status: 'draft',
      girls_only: r.girls_only,
      is_day: r.is_day,
      is_mystery: r.is_mystery,
      address_hidden: r.address_hidden,
    })
    if (error) {
      flash(`مقدرناش ننسخ: ${error.message}`)
      return
    }
    await reload()
    flash(`اتنسخت لـ ${day(startsAt)} — لسه مسودة، افتحها وغيّر الوقت لو محتاج`)
  }

  if (loading) return <Loading />

  const tplName = (id: string) => tplOf(id)?.name_ar ?? '—'

  /** بيفتح لوحة تحت الصف، أو بيقفلها لو هي مفتوحة أصلًا */
  const toggle = (id: string, mode: PanelMode) =>
    setPanel(panel?.id === id && panel?.mode === mode ? null : { id, mode })

  /* ------------------------------------------------ التقويم */

  const calDays = Array.from({ length: 7 }, (_, i) => dayAdd(calStart, i))

  return (
    <div>
      <div className="mt-6 flex flex-wrap gap-3">
        <Stat label="سبوطات جاية" value={stats ? String(stats.soon) : '…'} />
        <Stat label="مفتوحة للحجز" value={stats ? String(stats.open) : '…'} />
        <Stat
          label="تحت الحد الأدنى"
          value={stats ? String(stats.risky) : '…'}
          hint="محتاجة ناس تكمّل قبل ما تمشي"
        />
      </div>

      <Tabs<TabId>
        tabs={[
          { id: 'table', label: 'جدول' },
          { id: 'cal', label: 'تقويم' },
        ]}
        value={tab}
        onChange={setTab}
        extra={
          canEdit ? (
            <Btn kind="primary" onClick={() => setAdding((v) => !v)}>
              {adding ? 'اقفل' : 'سبوطة جديدة'}
            </Btn>
          ) : null
        }
      />

      {flashNode}

      {adding && canEdit && (
        <div className="mt-4">
          <NewSbota
            templates={templates}
            venues={venues}
            captains={captains}
            flash={flash}
            onDone={async () => {
              setAdding(false)
              await reload()
              await revalidateSite()
            }}
          />
        </div>
      )}

      {tab === 'table' && (
        <>
          <div className="mt-5 flex flex-wrap items-end gap-3">
            <SelectField
              label="الحالة"
              value={fStatus}
              onChange={setFilter(setFStatus)}
              options={[{ value: 'الكل', label: 'كل الحالات' }, ...STATUSES]}
            />
            <SelectField
              label="مين فاتحها"
              value={fOrigin}
              onChange={setFilter(setFOrigin)}
              options={[
                { value: 'الكل', label: 'الكل' },
                { value: 'nasbot', label: 'نسبوط' },
                { value: 'member', label: 'أعضاء' },
              ]}
            />
            <SelectField
              label="المنطقة"
              value={fArea}
              onChange={setFilter(setFArea)}
              options={[{ value: 'الكل', label: 'كل المناطق' }, ...AREAS]}
            />
            <SelectField
              label="الوقت"
              value={fWeek}
              onChange={setFilter(setFWeek)}
              options={[
                { value: 'next', label: 'من النهارده ورايح' },
                { value: 'this', label: 'الأسبوع ده' },
                { value: 'nextweek', label: 'الأسبوع الجاي' },
                { value: 'past', label: 'اللي فات' },
                { value: 'الكل', label: 'الكل' },
              ]}
            />
            <div className="ms-auto">
              <Btn onClick={() => reload()}>حدّث</Btn>
            </div>
          </div>

          <div className="mt-4">
            {rows.length === 0 ? (
              <Empty>مفيش سبوطة بالفلتر ده.</Empty>
            ) : (
              <Table
                head={[
                  'السبوطة',
                  'إمتى',
                  'المكان',
                  'الكابتن',
                  'السعر',
                  'الحجز',
                  'الحالة',
                  '',
                ]}
              >
                {rows.map((r) => {
                  const n = booked[r.id] ?? 0
                  return (
                    <Fragment key={r.id}>
                      <SbotaRow
                        row={r}
                        name={r.title_ar || tplName(r.template_id)}
                        venueName={
                          r.origin === 'member'
                            ? r.venue_name_ar || '—'
                            : (venueOf(r.venue_id)?.name ?? '—')
                        }
                        areaText={r.area_label_ar ?? areaLabel(r.area)}
                        captain={
                          r.origin === 'member'
                            ? r.host_name_ar || '—'
                            : captainName(r.captain_id)
                        }
                        booked={n}
                        low={under(r) && r.status !== 'cancelled' && r.status !== 'done'}
                        canEdit={canEdit}
                        canCancel={canCancel}
                        onEdit={() => toggle(r.id, 'edit')}
                        onDuplicate={() => duplicate(r)}
                        onRepeat={() => toggle(r.id, 'repeat')}
                        onCancel={() => toggle(r.id, 'cancel')}
                        onApprove={() => patch(r.id, { status: 'open' }, 'الخروجة اتعتمدت ✓')}
                      />

                      {/* ⚠ كلام العضو كامل — المالك لازم يقراه قبل «اعتمد».
                          العنوان بيتعرض هنا للإدارة بس؛ العضو العادي
                          ما بيشوفهوش غير بعد الحجز والكشف. */}
                      {r.origin === 'member' && (
                        <tr>
                          <td colSpan={8} className="p-2">
                            <div
                              className="rounded-16 p-3 text-13"
                              style={{ background: 'var(--bg)', border: '2px solid var(--line)' }}
                            >
                              <div className="font-display text-15 font-black">
                                {r.title_ar || '—'}
                              </div>
                              <div className="mt-1 whitespace-pre-line">{r.details_ar}</div>
                              <div className="mt-2" style={{ color: 'var(--muted)' }}>
                                المكان: {r.venue_name_ar || '—'}
                                {' · '}العنوان: {r.address_ar || '—'}
                                {r.cost_note_ar ? ` · التكلفة: ${r.cost_note_ar}` : ''}
                              </div>
                            </div>
                          </td>
                        </tr>
                      )}

                      {panel?.id === r.id && (
                        <tr>
                          <td colSpan={8} className="p-2">
                            {panel.mode === 'edit' && (
                              <EditPanel
                                row={r}
                                venues={venues}
                                captains={captains}
                                onClose={() => setPanel(null)}
                                onSave={(p) => patch(r.id, p, 'التعديل اتحفظ ✓')}
                              />
                            )}
                            {panel.mode === 'repeat' && (
                              <RepeatPanel
                                row={r}
                                flash={flash}
                                onDone={async () => {
                                  setPanel(null)
                                  await reload()
                                }}
                              />
                            )}
                            {panel.mode === 'cancel' && (
                              <CancelPanel
                                row={r}
                                name={tplName(r.template_id)}
                                booked={n}
                                flash={flash}
                                onDone={async () => {
                                  setPanel(null)
                                  await reload()
                                  await revalidateSite()
                                }}
                              />
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  )
                })}
              </Table>
            )}

            <Pager page={page} shown={rows.length} total={total} onPage={setPage} busy={busy} />
          </div>
        </>
      )}

      {tab === 'cal' && (
        <Section title={`أسبوع ${day(`${calStart}T12:00:00Z`)}`}>
          <div className="flex flex-wrap items-center gap-2">
            <Btn onClick={() => setWeekOff((w) => w - 1)}>الأسبوع اللي فات</Btn>
            <Btn onClick={() => setWeekOff(0)}>الأسبوع ده</Btn>
            <Btn onClick={() => setWeekOff((w) => w + 1)}>الأسبوع الجاي</Btn>
          </div>

          <div className="mt-4 grid grid-cols-2 gap-2 md:grid-cols-4 lg:grid-cols-7">
            {calDays.map((d, i) => {
              const dayRows = calRows
                .filter((r) => cairoDay(r.starts_at) === d)
                .sort((a, b) => a.starts_at.localeCompare(b.starts_at))
              const isToday = d === todayCairo()
              return (
                <div
                  key={d}
                  className="rounded-16 p-2"
                  style={{
                    background: 'var(--surface)',
                    border: `2px solid ${isToday ? '#F4632A' : 'transparent'}`,
                  }}
                >
                  <div className="font-display text-15 font-black">{DAY_NAMES[i]}</div>
                  <div className="font-body text-12" style={{ color: 'var(--muted)' }}>
                    {d.slice(8)}/{d.slice(5, 7)}
                  </div>

                  <div className="mt-2 flex flex-col gap-2">
                    {dayRows.length === 0 && (
                      <span className="font-body text-12" style={{ color: 'var(--muted)' }}>
                        فاضي
                      </span>
                    )}
                    {dayRows.map((r) => {
                      const n = booked[r.id] ?? 0
                      const low = under(r) && r.status !== 'cancelled' && r.status !== 'done'
                      return (
                        <div
                          key={r.id}
                          className="rounded-12 p-2"
                          style={{
                            background: 'var(--bg)',
                            opacity: r.status === 'cancelled' ? 0.5 : 1,
                            border: `2px solid ${low ? '#F2A0A0' : 'transparent'}`,
                          }}
                        >
                          <div className="font-display text-14 font-black">
                            {cairoTime(r.starts_at)} · {tplName(r.template_id)}
                          </div>
                          <div className="font-body text-12" style={{ color: 'var(--muted)' }}>
                            {venueOf(r.venue_id)?.name ?? 'من غير مكان'}
                          </div>
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            <Tag color={STATUS_COLOR[r.status]}>{statusLabel(r.status)}</Tag>
                            <span className="font-body text-12">
                              {n}/{r.capacity}
                            </span>
                          </div>
                        </div>
                      )
                    })}
                  </div>
                </div>
              )
            })}
          </div>

          <p className="mt-3 font-body text-13" style={{ color: 'var(--muted)' }}>
            الإطار الأحمر معناه إن الحجز لسه تحت الحد الأدنى للتشغيل.
          </p>
        </Section>
      )}
    </div>
  )
}

/* ============================================================ صف في الجدول */

function SbotaRow({
  row,
  name,
  venueName,
  areaText,
  captain,
  booked,
  low,
  canEdit,
  canCancel,
  onEdit,
  onDuplicate,
  onRepeat,
  onCancel,
  onApprove,
}: {
  row: Sbota
  name: string
  venueName: string
  areaText: string
  captain: string
  booked: number
  low: boolean
  canEdit: boolean
  canCancel: boolean
  onEdit: () => void
  onDuplicate: () => void
  onRepeat: () => void
  onCancel: () => void
  onApprove: () => void
}) {
  // خروجة عضو لسه مسوّدة = مستنية موافقتك (لما «تظهر بعد موافقتك» شغّالة
  // في الإعدادات). زرار واحد بيحوّلها لـ open وبس.
  const needsApproval = row.origin === 'member' && row.status === 'draft'
  return (
    <tr style={{ opacity: row.status === 'cancelled' ? 0.55 : 1 }}>
      <td className="p-2">
        <div className="font-display text-15 font-black">{name}</div>
        <div className="flex flex-wrap gap-1 pt-1">
          {row.origin === 'member' && <Tag color="#EFE3CF">من عضو</Tag>}
          {row.girls_only && <Tag color="#F4B4C8">بنات بس</Tag>}
          {row.is_mystery && <Tag color="#C9B6F2">غامضة</Tag>}
          {row.is_day && <Tag>نهاري</Tag>}
        </div>
      </td>
      <td className="whitespace-nowrap p-2">{when(row.starts_at)}</td>
      <td className="p-2">
        <div>{venueName}</div>
        <div className="text-12" style={{ color: 'var(--muted)' }}>
          {areaText}
        </div>
      </td>
      <td className="p-2">
        <div>{captain}</div>
        {row.origin === 'member' && row.host_note_ar && (
          <div className="text-12" style={{ color: 'var(--muted)' }}>
            {row.host_note_ar}
          </div>
        )}
      </td>
      <td className="whitespace-nowrap p-2">{money(row.price)}</td>
      <td className="whitespace-nowrap p-2">
        <span className="font-display text-16 font-black">
          {booked}/{row.capacity}
        </span>
        {low && (
          <div className="pt-1">
            <Tag color="#F2A0A0">ناقصة {Math.max(0, row.min_to_run - booked)} عن الحد</Tag>
          </div>
        )}
      </td>
      <td className="p-2">
        <Tag color={STATUS_COLOR[row.status]}>{statusLabel(row.status)}</Tag>
        {row.cancel_reason && (
          <div className="pt-1 text-12" style={{ color: 'var(--muted)' }}>
            {row.cancel_reason}
          </div>
        )}
      </td>
      <td className="p-2">
        <div className="flex flex-wrap justify-end gap-1">
          {canEdit && needsApproval && <Btn onClick={onApprove}>اعتمد</Btn>}
          {canEdit && <Btn onClick={onEdit}>عدّل</Btn>}
          {canEdit && <Btn onClick={onDuplicate}>نسخ</Btn>}
          {canEdit && <Btn onClick={onRepeat}>متكرر</Btn>}
          {canCancel && row.status !== 'cancelled' && (
            <Btn kind="danger" onClick={onCancel}>
              إلغاء
            </Btn>
          )}
        </div>
      </td>
    </tr>
  )
}

/* ============================================================ سبوطة جديدة */

function NewSbota({
  templates,
  venues,
  captains,
  flash,
  onDone,
}: {
  templates: Template[]
  venues: Venue[]
  captains: Captain[]
  flash: (m: string) => void
  onDone: () => Promise<void>
}) {
  const [templateId, setTemplateId] = useState('')
  const [venueId, setVenueId] = useState('')
  const [captainId, setCaptainId] = useState('')
  const [date, setDate] = useState(dayAdd(todayCairo(), 7))
  const [time, setTime] = useState('18:00')
  const [price, setPrice] = useState('')
  const [capacity, setCapacity] = useState('')
  const [minToRun, setMinToRun] = useState('4')
  const [duration, setDuration] = useState('120')
  const [girlsOnly, setGirlsOnly] = useState(false)
  const [isDay, setIsDay] = useState(false)
  const [isMystery, setIsMystery] = useState(false)
  const [busy, setBusy] = useState(false)

  /** أول ما تختار قالب بنملّي منه السعر والعدد والمدة — وتقدر تغيّرهم */
  function pickTemplate(id: string) {
    setTemplateId(id)
    const t = templates.find((x) => x.id === id)
    if (!t) return
    setPrice(String(Math.round(t.default_price / 100)))
    setCapacity(String(t.max_group))
    setMinToRun(String(t.min_group))
    setDuration(String(t.duration_min))
    setGirlsOnly(t.girls_only)
    setIsDay(t.is_day)
  }

  async function create() {
    const t = templates.find((x) => x.id === templateId)
    if (!t) return flash('اختار القالب الأول')
    if (!date || !time) return flash('حدّد التاريخ والساعة')

    const cap = Math.round(Number(capacity) || 0)
    const min = Math.round(Number(minToRun) || 0)
    const dur = Math.round(Number(duration) || 0)
    if (cap < 2 || cap > 40) return flash('العدد لازم يكون من 2 لـ 40')
    if (min > cap) return flash('الحد الأدنى مينفعش يكون أكبر من العدد')
    if (dur < 1) return flash('المدة لازم تكون أكتر من صفر')

    const startsAt = cairoToIso(date, time)
    const endsAt = new Date(new Date(startsAt).getTime() + dur * 60000).toISOString()

    setBusy(true)
    const { error } = await supabase()
      .from('sbotat')
      .insert({
        template_id: t.id,
        venue_id: venueId || null,
        captain_id: captainId || null,
        starts_at: startsAt,
        ends_at: endsAt,
        price: Math.round(Number(price) || 0) * 100,
        org_fee: t.org_fee,
        capacity: cap,
        min_to_run: min,
        status: 'draft',
        girls_only: girlsOnly,
        is_day: isDay,
        is_mystery: isMystery,
      })
    setBusy(false)

    if (error) return flash(`مقدرناش نعمل السبوطة: ${error.message}`)
    flash('السبوطة اتعملت ✓ — لسه مسودة، افتحها وخليها «مفتوحة» لما تجهز')
    await onDone()
  }

  return (
    <Card
      title="سبوطة جديدة"
      hint="اختار القالب الأول — السعر والعدد بييجوا منه، وبعد كده غيّرهم زي ما تحب."
    >
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <SelectField
          label="القالب"
          value={templateId}
          onChange={pickTemplate}
          options={[
            { value: '', label: '— اختار قالب —' },
            ...templates.map((t) => ({ value: t.id, label: t.name_ar })),
          ]}
        />
        <SelectField
          label="المكان"
          value={venueId}
          onChange={setVenueId}
          options={[
            { value: '', label: '— من غير مكان لسه —' },
            ...venues
              .filter((v) => v.is_active)
              .map((v) => ({ value: v.id, label: `${v.name} — ${areaLabel(v.area)}` })),
          ]}
        />
        <SelectField
          label="الكابتن"
          value={captainId}
          onChange={setCaptainId}
          options={[
            { value: '', label: '— من غير كابتن لسه —' },
            ...captains
              .filter((c) => c.is_active)
              .map((c) => ({ value: c.id, label: c.display_name ?? c.bio_line })),
          ]}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <Inp label="التاريخ" type="date" value={date} onChange={setDate} />
        <Inp label="الساعة (بتوقيت القاهرة)" type="time" value={time} onChange={setTime} />
        <Inp
          label="المدة (دقيقة)"
          type="number"
          value={duration}
          onChange={setDuration}
          className="w-[110px]"
        />
        <Inp
          label="السعر (جنيه)"
          type="number"
          value={price}
          onChange={setPrice}
          className="w-[120px]"
        />
        <Inp
          label="العدد"
          type="number"
          value={capacity}
          onChange={setCapacity}
          className="w-[100px]"
        />
        <Inp
          label="أقل عدد تمشي بيه"
          type="number"
          value={minToRun}
          onChange={setMinToRun}
          className="w-[110px]"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-6">
        <Toggle label="بنات بس" value={girlsOnly} onChange={setGirlsOnly} />
        <Toggle label="نهاري" value={isDay} onChange={setIsDay} />
        <Toggle
          label="غامضة"
          value={isMystery}
          onChange={setIsMystery}
          hint="المكان ما بيبانش غير قبلها بشوية."
        />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <Btn kind="primary" onClick={create} disabled={busy}>
          {busy ? 'ثانية واحدة…' : 'اعمل السبوطة'}
        </Btn>
        <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
          مواعيد قفل الحجز والكشف وفتح الشات القاعدة بتحسبها لوحدها.
        </span>
      </div>
    </Card>
  )
}

/* ============================================================ تعديل */

function EditPanel({
  row,
  venues,
  captains,
  onClose,
  onSave,
}: {
  row: Sbota
  venues: Venue[]
  captains: Captain[]
  onClose: () => void
  onSave: (p: Record<string, unknown>) => Promise<boolean>
}) {
  const parts = cairoParts(row.starts_at)
  const lenMin = Math.max(
    1,
    Math.round((new Date(row.ends_at).getTime() - new Date(row.starts_at).getTime()) / 60000)
  )

  const [date, setDate] = useState(parts.date)
  const [time, setTime] = useState(parts.time)
  const [duration, setDuration] = useState(String(lenMin))
  const [venueId, setVenueId] = useState(row.venue_id ?? '')
  const [captainId, setCaptainId] = useState(row.captain_id ?? '')
  const [price, setPrice] = useState(String(Math.round(row.price / 100)))
  const [orgFee, setOrgFee] = useState(String(Math.round(row.org_fee / 100)))
  const [capacity, setCapacity] = useState(String(row.capacity))
  const [minToRun, setMinToRun] = useState(String(row.min_to_run))
  const [status, setStatus] = useState(row.status)
  const [girlsOnly, setGirlsOnly] = useState(row.girls_only)
  const [isDay, setIsDay] = useState(row.is_day)
  const [isMystery, setIsMystery] = useState(row.is_mystery)
  const [addressHidden, setAddressHidden] = useState(row.address_hidden)
  const [areaLabelAr, setAreaLabelAr] = useState(row.area_label_ar ?? '')
  const [busy, setBusy] = useState(false)

  async function save() {
    const cap = Math.round(Number(capacity) || 0)
    if (cap < 2 || cap > 40) {
      alert('العدد لازم يكون من 2 لـ 40')
      return
    }
    const startsAt = cairoToIso(date, time)
    const dur = Math.max(1, Math.round(Number(duration) || lenMin))
    setBusy(true)
    const ok = await onSave({
      starts_at: startsAt,
      ends_at: new Date(new Date(startsAt).getTime() + dur * 60000).toISOString(),
      venue_id: venueId || null,
      captain_id: captainId || null,
      price: Math.round(Number(price) || 0) * 100,
      org_fee: Math.round(Number(orgFee) || 0) * 100,
      capacity: cap,
      min_to_run: Math.max(0, Math.round(Number(minToRun) || 0)),
      status,
      girls_only: girlsOnly,
      is_day: isDay,
      is_mystery: isMystery,
      address_hidden: addressHidden,
      area_label_ar: areaLabelAr || null,
    })
    setBusy(false)
    if (ok) onClose()
  }

  return (
    <Card title="تعديل الموعد">
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <Inp label="التاريخ" type="date" value={date} onChange={setDate} />
        <Inp label="الساعة (القاهرة)" type="time" value={time} onChange={setTime} />
        <Inp
          label="المدة (دقيقة)"
          type="number"
          value={duration}
          onChange={setDuration}
          className="w-[110px]"
        />
        <SelectField
          label="الحالة"
          value={status}
          onChange={setStatus}
          options={STATUSES.filter((s) => s.value !== 'cancelled')}
        />
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <SelectField
          label="المكان"
          value={venueId}
          onChange={setVenueId}
          options={[
            { value: '', label: '— من غير مكان —' },
            ...venues.map((v) => ({ value: v.id, label: `${v.name} — ${areaLabel(v.area)}` })),
          ]}
        />
        <SelectField
          label="الكابتن"
          value={captainId}
          onChange={setCaptainId}
          options={[
            { value: '', label: '— من غير كابتن —' },
            ...captains.map((c) => ({ value: c.id, label: c.display_name ?? c.bio_line })),
          ]}
        />
        <Inp
          label="اسم المنطقة اللي بيبان"
          value={areaLabelAr}
          onChange={setAreaLabelAr}
          hint="بييجي من المكان لوحده — غيّره بس لو محتاج."
        />
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <Inp
          label="السعر (جنيه)"
          type="number"
          value={price}
          onChange={setPrice}
          className="w-[120px]"
        />
        <Inp
          label="عمولتنا (جنيه)"
          type="number"
          value={orgFee}
          onChange={setOrgFee}
          className="w-[120px]"
        />
        <Inp
          label="العدد"
          type="number"
          value={capacity}
          onChange={setCapacity}
          className="w-[100px]"
        />
        <Inp
          label="أقل عدد تمشي بيه"
          type="number"
          value={minToRun}
          onChange={setMinToRun}
          className="w-[110px]"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-6">
        <Toggle label="بنات بس" value={girlsOnly} onChange={setGirlsOnly} />
        <Toggle label="نهاري" value={isDay} onChange={setIsDay} />
        <Toggle label="غامضة" value={isMystery} onChange={setIsMystery} />
        <Toggle
          label="العنوان مخفي"
          value={addressHidden}
          onChange={setAddressHidden}
          hint="ما يبانش غير للي حجزوا بعد الكشف."
        />
      </div>

      <div
        className="mt-4 rounded-14 p-3 font-body text-13"
        style={{ background: 'var(--bg)', color: 'var(--muted)' }}
      >
        القاعدة بتحسب دول لوحدها من ميعاد البداية — للقراءة بس:
        <div className="mt-1">قفل الحجز: {when(row.booking_closes_at)}</div>
        <div>الكشف: {when(row.reveal_at)}</div>
        <div>
          الشات: من {when(row.chat_opens_at)} لـ {when(row.chat_closes_at)}
        </div>
        {row.is_mystery && <div>كشف الغموض: {when(row.mystery_reveal_at)}</div>}
      </div>

      <div className="mt-4 flex flex-wrap gap-2">
        <Btn kind="primary" onClick={save} disabled={busy}>
          {busy ? 'ثانية واحدة…' : 'احفظ التعديل'}
        </Btn>
        <Btn onClick={onClose}>سيبها</Btn>
      </div>
    </Card>
  )
}

/* ============================================================ متكرر */

function RepeatPanel({
  row,
  flash,
  onDone,
}: {
  row: Sbota
  flash: (m: string) => void
  onDone: () => Promise<void>
}) {
  const parts = cairoParts(row.starts_at)
  const [weekday, setWeekday] = useState(String(weekdayOf(parts.date)))
  const [time, setTime] = useState(parts.time)
  const [count, setCount] = useState('4')
  const [busy, setBusy] = useState(false)

  const lenMs = Math.max(
    60000,
    new Date(row.ends_at).getTime() - new Date(row.starts_at).getTime()
  )

  /** أول يوم بعد تاريخ السبوطة دي بيقع في اليوم اللي اخترته */
  function firstDate(): string {
    const want = Number(weekday)
    let d = dayAdd(parts.date, 1)
    for (let i = 0; i < 7; i++) {
      if (weekdayOf(d) === want) return d
      d = dayAdd(d, 1)
    }
    return d
  }

  async function run() {
    const n = Math.round(Number(count) || 0)
    if (n < 1 || n > 26) return flash('العدد من 1 لـ 26 أسبوع')

    const start = firstDate()
    const dates = Array.from({ length: n }, (_, i) => dayAdd(start, i * 7))
    if (!confirm(`هنعمل ${n} سبوطة، أولهم ${day(`${start}T12:00:00Z`)}. تمام؟`)) return

    setBusy(true)
    const payload = dates.map((d) => {
      const startsAt = cairoToIso(d, time)
      return {
        template_id: row.template_id,
        venue_id: row.venue_id,
        captain_id: row.captain_id,
        starts_at: startsAt,
        ends_at: new Date(new Date(startsAt).getTime() + lenMs).toISOString(),
        price: row.price,
        org_fee: row.org_fee,
        capacity: row.capacity,
        min_to_run: row.min_to_run,
        status: 'draft',
        girls_only: row.girls_only,
        is_day: row.is_day,
        is_mystery: row.is_mystery,
        address_hidden: row.address_hidden,
      }
    })
    const { error } = await supabase().from('sbotat').insert(payload)
    setBusy(false)

    if (error) return flash(`مقدرناش نكرّرها: ${error.message}`)
    flash(`اتعملوا ${n} سبوطة كمسودات — راجعهم وافتحهم واحدة واحدة`)
    await onDone()
  }

  return (
    <Card
      title="كرّرها كل أسبوع"
      hint="نفس المكان والكابتن والسعر والعدد — بيتعملوا مسودات علشان تراجعهم."
    >
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <SelectField
          label="يوم الأسبوع"
          value={weekday}
          onChange={setWeekday}
          options={DAY_JS.map((js, i) => ({ value: String(js), label: DAY_NAMES[i] }))}
        />
        <Inp label="الساعة (القاهرة)" type="time" value={time} onChange={setTime} />
        <Inp
          label="كام أسبوع"
          type="number"
          value={count}
          onChange={setCount}
          className="w-[100px]"
        />
        <Btn kind="primary" onClick={run} disabled={busy}>
          {busy ? 'ثانية واحدة…' : 'اعملهم'}
        </Btn>
      </div>
      <p className="mt-2 font-body text-13" style={{ color: 'var(--muted)' }}>
        بنبدأ من أول {DAY_NAMES[DAY_JS.indexOf(Number(weekday))] ?? ''} بعد{' '}
        {day(row.starts_at)}.
      </p>
    </Card>
  )
}

/* ============================================================ إلغاء */

function CancelPanel({
  row,
  name,
  booked,
  flash,
  onDone,
}: {
  row: Sbota
  name: string
  booked: number
  flash: (m: string) => void
  onDone: () => Promise<void>
}) {
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)

  /**
   * الإلغاء بيمشي على fn_cancel_booking لكل حجز شغّال بـ p_by='us':
   * استرداد كامل + رصيد اعتذار + إبلاغ اللي في قايمة الانتظار + تسجيل في السجل.
   * وبعدها بس بنقفل السبوطة نفسها.
   */
  async function run() {
    const why = reason.trim()
    if (!why) return flash('اكتب سبب الإلغاء الأول — بيتسجل وبيروح للناس')
    if (
      !confirm(
        `هنلغي «${name}» بتاعة ${when(row.starts_at)} ونرجّع فلوس ${booked} حجز كاملة. مفيش رجوع في ده. تمام؟`
      )
    )
      return

    setBusy(true)
    const db = supabase()

    const { data: bks, error: e1 } = await db
      .from('bookings')
      .select('id')
      .eq('sbota_id', row.id)
      .in('status', ['paid', 'pending_payment'])

    if (e1) {
      setBusy(false)
      return flash(`مقدرناش نجيب الحجوزات: ${e1.message}`)
    }

    let done = 0
    let firstErr = ''
    for (const b of (bks ?? []) as { id: string }[]) {
      const { error } = await db.rpc('fn_cancel_booking', {
        p_booking_id: b.id,
        p_by: 'us',
        p_reason: why,
      })
      if (error) {
        if (!firstErr) firstErr = error.message
      } else {
        done++
      }
    }

    const { error: e2 } = await db
      .from('sbotat')
      .update({ status: 'cancelled', cancel_reason: why })
      .eq('id', row.id)
    setBusy(false)

    if (e2) {
      return flash(`رجّعنا ${done} حجز بس الحالة مااتغيرتش: ${e2.message}`)
    }

    flash(
      firstErr
        ? `اتلغت ✓ — رجّعنا ${done} حجز، وفي حجز مقدرناش: ${firstErr}`
        : `اتلغت ✓ — رجّعنا فلوس ${done} حجز`
    )
    await onDone()
  }

  return (
    <Card title="إلغاء السبوطة" hint="كل حجز مدفوع هيرجع كامل ومعاه رصيد اعتذار. الخطوة دي مفيهاش رجوع.">
      <div className="mt-3 flex flex-col gap-2">
        <label className="flex flex-col gap-1">
          <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
            السبب (إجباري)
          </span>
          <textarea
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="مثلًا: الجو مش مناسب والمكان قفل"
            className="w-full rounded-14 px-3 py-2 font-body text-16"
            style={{ background: 'var(--bg)', color: 'var(--fg)', border: '2px solid var(--line)' }}
          />
        </label>

        <div className="flex flex-wrap items-center gap-3">
          <Btn kind="danger" onClick={run} disabled={busy || !reason.trim()}>
            {busy ? 'بنرجّع الفلوس…' : `ألغي وارجّع فلوس ${booked} حجز`}
          </Btn>
          <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
            اللي في قايمة الانتظار هيتبلّغوا لوحدهم.
          </span>
        </div>
      </div>
    </Card>
  )
}
