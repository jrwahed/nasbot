'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { AdminShell } from '@/components/AdminShell'
import { supabase } from '@/lib/supabase'
import { rejected } from '@/lib/admin'
import type { AdminMe } from '@/lib/admin'
import {
  Btn,
  Card,
  Empty,
  Loading,
  SelectField,
  Stat,
  Table,
  Tabs,
  Tag,
  day,
  money,
  useFlash,
  when,
} from '@/components/admin-ui'

/**
 * الحجوزات.
 *
 * ثلاث شاشات: كل الحجوزات، قايمة الانتظار، والحضور عند نقطة اللقا.
 *
 * الإلغاء بيتنادى بـ fn_cancel_booking في القاعدة — هي اللي بتحسب الاسترداد
 * وبتفتح المكان وبتبلّغ أول واحد في الانتظار. ممنوع نعدّل الصفوف بإيدينا
 * علشان الفلوس ما تروحش في السكة.
 *
 * شاشة الحضور بتتفتح على الموبايل عند البوابة، فخلّيناها عمود واحد
 * وأزرار كبيرة، وبتكتب checked_in_at و checked_in_by بس — الحالة نفسها
 * بيظبطها job_after_sbota بعد ما السبوطة تخلص.
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
  price: number
  girls_only: boolean
  sbota_templates: TplRef | TplRef[] | null
}

interface PersonRef {
  id: string
  first_name: string | null
  phone: string | null
  no_show_count: number
  sbota_count: number
}

interface BookingRow {
  id: string
  sbota_id: string
  profile_id: string
  status: string
  price_paid: number
  discount: number
  wallet_used: number
  checked_in_at: string | null
  cancel_reason: string | null
  refund_kind: string | null
  created_at: string
  profiles: PersonRef | PersonRef[] | null
}

interface WaitRow {
  id: string
  sbota_id: string
  profile_id: string
  position: number
  notified_at: string | null
  created_at: string
  profiles: PersonRef | PersonRef[] | null
}

interface PayRow {
  booking_id: string
  status: string
  provider: string
  amount: number
}

/* ---------------------------------------------------------- كلام */

const STATUS_OPTIONS = [
  { value: 'all', label: 'كل الحالات' },
  { value: 'pending_payment', label: 'مستني الدفع' },
  { value: 'paid', label: 'دافع' },
  { value: 'waitlist', label: 'في الانتظار' },
  { value: 'attended', label: 'حضر' },
  { value: 'no_show', label: 'مجاش' },
  { value: 'cancelled_by_user', label: 'لغاها بنفسه' },
  { value: 'cancelled_by_us', label: 'لغيناها إحنا' },
  { value: 'refunded', label: 'رجعت فلوسه' },
]

const STATUS_LABEL: Record<string, string> = Object.fromEntries(
  STATUS_OPTIONS.slice(1).map((s) => [s.value, s.label])
)

const STATUS_COLOR: Record<string, string | undefined> = {
  paid: '#9BE39B',
  attended: '#9BE39B',
  pending_payment: '#F6C64A',
  waitlist: '#F6C64A',
  no_show: '#F0907E',
  cancelled_by_user: undefined,
  cancelled_by_us: undefined,
  refunded: undefined,
}

const REFUND_LABEL: Record<string, string> = {
  full: 'استرداد كامل',
  half: 'نص المبلغ',
  credit: 'رصيد في المحفظة',
  none: 'من غير استرداد',
}

const PAY_LABEL: Record<string, string> = {
  initiated: 'الدفع بدأ',
  pending_review: 'مستني المراجعة',
  succeeded: 'الدفع تم',
  failed: 'الدفع فشل',
  refunded: 'اترد',
  partially_refunded: 'اترد جزء',
}

/** الحالات اللي لسه ماخدة مكان في السبوطة */
const LIVE = ['pending_payment', 'paid', 'attended']

/* ---------------------------------------------------------- مساعدات */

/** الـ embed أحيانًا بيرجع صف وأحيانًا مصفوفة — بنطلّع الصف على طول */
function one<T>(v: T | T[] | null | undefined): T | null {
  if (!v) return null
  return Array.isArray(v) ? (v[0] ?? null) : v
}

const tplName = (s: SbotaRow | null) => one(s?.sbota_templates ?? null)?.name_ar ?? 'سبوطة'

const sbotaLabel = (s: SbotaRow) => `${tplName(s)} · ${day(s.starts_at)}`

const personName = (p: PersonRef | null) => p?.first_name?.trim() || 'من غير اسم'

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

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

const BOOKING_COLS =
  'id, sbota_id, profile_id, status, price_paid, discount, wallet_used, checked_in_at, cancel_reason, refund_kind, created_at, profiles!bookings_profile_id_fkey(id, first_name, phone, no_show_count, sbota_count)'

const TABS = [
  { id: 'list', label: 'الحجوزات' },
  { id: 'waitlist', label: 'قايمة الانتظار' },
  { id: 'checkin', label: 'الحضور' },
] as const
type TabId = (typeof TABS)[number]['id']

/* ---------------------------------------------------------- الصفحة */

export default function AdminBookingsPage() {
  return (
    <AdminShell title="الحجوزات" needs="bookings.view">
      {(me) => <BookingsEditor me={me} />}
    </AdminShell>
  )
}

function BookingsEditor({ me }: { me: AdminMe }) {
  const canEdit = me.permissions.has('bookings.edit')
  const [tab, setTab] = useState<TabId>('list')
  const [sbotat, setSbotat] = useState<SbotaRow[]>([])
  const [myId, setMyId] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [err, setErr] = useState('')
  const { flash, node } = useFlash()

  useEffect(() => {
    ;(async () => {
      const db = supabase()
      const { data: auth } = await db.auth.getUser()
      setMyId(auth.user?.id ?? null)

      const { data, error } = await db
        .from('sbotat')
        .select('id, starts_at, capacity, status, price, girls_only, sbota_templates(name_ar)')
        .order('starts_at', { ascending: false })
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
            جرّب تعمل تحديث للصفحة، ولو فضلت كده كلّم اللي شغّال على القاعدة.
          </div>
        </Card>
      </div>
    )
  }

  return (
    <div>
      <Tabs tabs={TABS.map((t) => ({ id: t.id, label: t.label }))} value={tab} onChange={setTab} />

      {!canEdit && (
        <div className="mt-4 font-body text-14" style={{ color: 'var(--muted)' }}>
          أنت بتتفرّج بس — التعديل محتاج صلاحية bookings.edit.
        </div>
      )}

      {node}

      {tab === 'list' && <BookingsTab sbotat={sbotat} canEdit={canEdit} flash={flash} />}
      {tab === 'waitlist' && <WaitlistTab sbotat={sbotat} canEdit={canEdit} flash={flash} />}
      {tab === 'checkin' && (
        <CheckinTab sbotat={sbotat} canEdit={canEdit} myId={myId} flash={flash} />
      )}
    </div>
  )
}

/* ============================================================ الحجوزات */

function BookingsTab({
  sbotat,
  canEdit,
  flash: rawFlash,
}: {
  sbotat: SbotaRow[]
  canEdit: boolean
  flash: (m: string) => void
}) {
  const flash = useSay(rawFlash)
  const [sbotaId, setSbotaId] = useState('all')
  const [status, setStatus] = useState('all')
  const [q, setQ] = useState('')
  const [rows, setRows] = useState<BookingRow[] | null>(null)
  const [pays, setPays] = useState<Record<string, PayRow>>({})
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    setRows(null)
    const db = supabase()
    let query = db.from('bookings').select(BOOKING_COLS).order('created_at', { ascending: false })
    if (sbotaId !== 'all') query = query.eq('sbota_id', sbotaId)
    if (status !== 'all') query = query.eq('status', status)
    const { data, error } = await query.limit(500)
    if (error) {
      flash(`مقدرناش نجيب الحجوزات: ${error.message}`)
      setRows([])
      return
    }
    const list = (data ?? []) as unknown as BookingRow[]
    setRows(list)

    // الدفعات بتتجاب على دفعات صغيرة علشان الرابط ما يطولش
    const map: Record<string, PayRow> = {}
    for (const ids of chunk(list.map((b) => b.id), 100)) {
      const { data: p } = await db
        .from('payments')
        .select('booking_id, status, provider, amount')
        .in('booking_id', ids)
      for (const row of (p ?? []) as unknown as PayRow[]) map[row.booking_id] = row
    }
    setPays(map)
  }, [sbotaId, status, flash])

  useEffect(() => {
    reload()
  }, [reload])

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    if (!needle || !rows) return rows ?? []
    return rows.filter((b) => {
      const p = one(b.profiles)
      return (
        (p?.first_name ?? '').toLowerCase().includes(needle) ||
        (p?.phone ?? '').includes(needle)
      )
    })
  }, [rows, q])

  const byId = useMemo(() => new Map(sbotat.map((s) => [s.id, s])), [sbotat])

  async function cancelBooking(b: BookingRow, by: 'user' | 'us') {
    const name = personName(one(b.profiles))
    const warn =
      by === 'us'
        ? 'الإلغاء ده من عندنا: العضو هيرجعله كل اللي دفعه + رصيد اعتذار زيادة.'
        : 'الإلغاء ده محسوب على العضو: الاسترداد على حسب قواعد المواعيد، وممكن ما يرجعش حاجة ويتسجّل عليه إلغاء متأخر.'
    const reason = prompt(`سبب الإلغاء لحجز ${name}؟\n\n${warn}`, '')
    if (reason === null) return
    if (!confirm(`متأكد إننا نلغي حجز ${name}؟\n\n${warn}\nمفيش رجوع في الخطوة دي.`)) return

    setBusy(true)
    const { data, error } = await supabase().rpc('fn_cancel_booking', {
      p_booking_id: b.id,
      p_by: by,
      p_reason: reason.trim() || null,
    })
    setBusy(false)
    if (error) {
      flash(`مقدرناش نلغي: ${error.message}`)
      return
    }
    const res = (data ?? null) as { refund?: number; kind?: string } | null
    const kind = REFUND_LABEL[res?.kind ?? 'none'] ?? 'من غير استرداد'
    flash(`اتلغى ✓ — ${kind}${res?.refund ? ` بمبلغ ${money(res.refund)}` : ''}`)
    await reload()
  }

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-end gap-3">
        <SelectField
          label="السبوطة"
          value={sbotaId}
          onChange={setSbotaId}
          options={[
            { value: 'all', label: 'كل السبوطات' },
            ...sbotat.map((s) => ({ value: s.id, label: sbotaLabel(s) })),
          ]}
        />
        <SelectField label="الحالة" value={status} onChange={setStatus} options={STATUS_OPTIONS} />
        <label className="flex flex-col gap-1">
          <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
            دوّر باسم العضو أو رقمه
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="مثلًا: منى"
            className="min-w-[200px] rounded-14 px-3 py-2 font-body text-16"
            style={{
              background: 'var(--bg)',
              color: 'var(--fg)',
              border: '2px solid var(--line)',
            }}
          />
        </label>
        <div className="font-body text-14" style={{ color: 'var(--muted)' }}>
          {shown.length} حجز
        </div>
        <div className="ms-auto">
          <Btn onClick={() => reload()}>حدّث</Btn>
        </div>
      </div>

      <div className="mt-4">
        {rows === null ? (
          <Loading />
        ) : shown.length === 0 ? (
          <Empty>مفيش حجوزات بالفلتر ده.</Empty>
        ) : (
          <Table
            head={[
              'العضو',
              'السبوطة',
              'اتحجز إمتى',
              'دفع',
              'الحالة',
              'وصل؟',
              ...(canEdit ? ['إلغاء'] : []),
            ]}
          >
            {shown.map((b) => {
              const p = one(b.profiles)
              const s = byId.get(b.sbota_id) ?? null
              const pay = pays[b.id]
              const canCancel = b.status === 'paid' || b.status === 'pending_payment'
              return (
                <tr key={b.id} style={{ borderTop: '1px solid var(--line)' }}>
                  <td className="p-2">
                    <div className="font-display text-15 font-black">{personName(p)}</div>
                    <div className="font-body text-12" style={{ color: 'var(--muted)' }}>
                      {p?.phone ?? '—'} · قبل كده {p?.sbota_count ?? 0} مرة
                      {(p?.no_show_count ?? 0) > 0 ? ` · مجاش ${p?.no_show_count} مرة` : ''}
                    </div>
                  </td>
                  <td className="p-2">
                    {s ? (
                      <>
                        <div>{tplName(s)}</div>
                        <div className="font-body text-12" style={{ color: 'var(--muted)' }}>
                          {when(s.starts_at)}
                        </div>
                      </>
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className="p-2">{when(b.created_at)}</td>
                  <td className="p-2">
                    <div>{money(b.price_paid)}</div>
                    {b.wallet_used > 0 && (
                      <div className="font-body text-12" style={{ color: 'var(--muted)' }}>
                        منهم {money(b.wallet_used)} من المحفظة
                      </div>
                    )}
                    {pay && (
                      <div className="font-body text-12" style={{ color: 'var(--muted)' }}>
                        {PAY_LABEL[pay.status] ?? pay.status} · {pay.provider}
                      </div>
                    )}
                  </td>
                  <td className="p-2">
                    <Tag color={STATUS_COLOR[b.status]}>{STATUS_LABEL[b.status] ?? b.status}</Tag>
                    {b.refund_kind && (
                      <div className="mt-1 font-body text-12" style={{ color: 'var(--muted)' }}>
                        {REFUND_LABEL[b.refund_kind] ?? b.refund_kind}
                      </div>
                    )}
                    {b.cancel_reason && (
                      <div className="mt-1 font-body text-12" style={{ color: 'var(--muted)' }}>
                        {b.cancel_reason}
                      </div>
                    )}
                  </td>
                  <td className="p-2">
                    {b.checked_in_at ? (
                      <>
                        <Tag color="#9BE39B">وصل</Tag>
                        <div className="mt-1 font-body text-12" style={{ color: 'var(--muted)' }}>
                          {when(b.checked_in_at)}
                        </div>
                      </>
                    ) : (
                      <span style={{ color: 'var(--muted)' }}>—</span>
                    )}
                  </td>
                  {canEdit && (
                    <td className="p-2">
                      {canCancel ? (
                        <div className="flex flex-wrap gap-2">
                          <Btn
                            kind="danger"
                            disabled={busy}
                            onClick={() => cancelBooking(b, 'user')}
                          >
                            لغى بنفسه
                          </Btn>
                          <Btn kind="danger" disabled={busy} onClick={() => cancelBooking(b, 'us')}>
                            إلغاء من عندنا
                          </Btn>
                        </div>
                      ) : (
                        <span style={{ color: 'var(--muted)' }}>—</span>
                      )}
                    </td>
                  )}
                </tr>
              )
            })}
          </Table>
        )}
      </div>

      {canEdit && (
        <div className="mt-4 font-body text-13" style={{ color: 'var(--muted)' }}>
          «لغى بنفسه» بيحسب الاسترداد بقواعد المواعيد. «إلغاء من عندنا» بيرجّع كل المبلغ ويزوّد
          رصيد اعتذار. في الحالتين القاعدة هي اللي بتفتح المكان وتبلّغ أول واحد في الانتظار.
        </div>
      )}
    </div>
  )
}

/* ============================================================ الانتظار */

function WaitlistTab({
  sbotat,
  canEdit,
  flash: rawFlash,
}: {
  sbotat: SbotaRow[]
  canEdit: boolean
  flash: (m: string) => void
}) {
  const flash = useSay(rawFlash)
  const [sbotaId, setSbotaId] = useState(sbotat[0]?.id ?? '')
  const [rows, setRows] = useState<WaitRow[] | null>(null)
  const [taken, setTaken] = useState(0)
  const [busy, setBusy] = useState(false)

  const sbota = useMemo(() => sbotat.find((s) => s.id === sbotaId) ?? null, [sbotat, sbotaId])

  const reload = useCallback(async () => {
    if (!sbotaId) {
      setRows([])
      return
    }
    setRows(null)
    const db = supabase()
    const [w, b] = await Promise.all([
      db
        .from('waitlist')
        .select(
          'id, sbota_id, profile_id, position, notified_at, created_at, profiles(id, first_name, phone, no_show_count, sbota_count)'
        )
        .eq('sbota_id', sbotaId)
        .order('position'),
      db.from('bookings').select('id, status').eq('sbota_id', sbotaId).in('status', LIVE),
    ])
    if (w.error) {
      flash(`مقدرناش نجيب قايمة الانتظار: ${w.error.message}`)
      setRows([])
      return
    }
    setRows((w.data ?? []) as unknown as WaitRow[])
    setTaken(((b.data ?? []) as unknown[]).length)
  }, [sbotaId, flash])

  useEffect(() => {
    reload()
  }, [reload])

  const free = sbota ? Math.max(0, sbota.capacity - taken) : 0

  async function promote(w: WaitRow) {
    if (!sbota) return
    const name = personName(one(w.profiles))
    if (free <= 0) {
      flash('مفيش مكان فاضي في السبوطة دي دلوقتي.')
      return
    }
    if (
      !confirm(
        `هنعمل حجز لـ ${name} في المكان الفاضي ونشيله من قايمة الانتظار.\n\n` +
          `الحجز هيتسجّل «مستني الدفع» ومعاه مهلة ٢٤ ساعة — الفلوس بتتحصّل منه زي أي حجز عادي، ` +
          `ولو ما دفعش في المهلة بيتلغي لوحده.\n\nتمام؟`
      )
    )
      return

    setBusy(true)
    const db = supabase()

    // القاعدة مش بتسمح بأكتر من حجز لنفس الشخص في نفس السبوطة — حتى لو الحجز القديم متلغي
    const { data: old } = await db
      .from('bookings')
      .select('id, status')
      .eq('sbota_id', w.sbota_id)
      .eq('profile_id', w.profile_id)
      .maybeSingle()
    if (old) {
      setBusy(false)
      const st = (old as { status: string }).status
      flash(
        `${name} عنده حجز في السبوطة دي خلاص (${STATUS_LABEL[st] ?? st}) — شوفه في تبويب الحجوزات بدل ما نعمل حجز تاني.`
      )
      return
    }

    const { data: ins, error } = await db
      .from('bookings')
      .insert({
        sbota_id: w.sbota_id,
        profile_id: w.profile_id,
        status: 'pending_payment',
        price_paid: 0,
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      })
      .select('id')
    if (error) {
      setBusy(false)
      flash(`مقدرناش نعمل الحجز: ${error.message}`)
      return
    }
    if (rejected(ins)) {
      setBusy(false)
      flash('مااتعملش — القاعدة رفضت الكتابة، محتاج صلاحية bookings.edit')
      return
    }
    const { error: delErr } = await db.from('waitlist').delete().eq('id', w.id)
    setBusy(false)
    if (delErr) {
      flash(`الحجز اتعمل بس فضل في قايمة الانتظار: ${delErr.message}`)
    } else {
      flash(`${name} دخل السبوطة ✓ — فاضل يدفع.`)
    }
    await reload()
  }

  async function drop(w: WaitRow) {
    const name = personName(one(w.profiles))
    if (!confirm(`هنشيل ${name} من قايمة الانتظار خالص. تمام؟`)) return
    setBusy(true)
    const { data: del, error } = await supabase()
      .from('waitlist')
      .delete()
      .eq('id', w.id)
      .select('id')
    setBusy(false)
    if (error) {
      flash(`مقدرناش نشيله: ${error.message}`)
      return
    }
    if (rejected(del)) {
      flash('مااتشالش — القاعدة رفضت الكتابة، محتاج صلاحية bookings.edit')
      return
    }
    flash('اتشال من القايمة ✓')
    await reload()
  }

  return (
    <div className="mt-5">
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
        <div className="ms-auto">
          <Btn onClick={() => reload()}>حدّث</Btn>
        </div>
      </div>

      {sbota && (
        <div className="mt-4 flex flex-wrap gap-3">
          <Stat label="سعة السبوطة" value={String(sbota.capacity)} />
          <Stat label="واخدين مكان" value={String(taken)} hint="دافعين + مستنيين الدفع + حضروا" />
          <Stat label="أماكن فاضية" value={String(free)} />
          <Stat label="في الانتظار" value={String(rows?.length ?? 0)} />
        </div>
      )}

      <div className="mt-4">
        {rows === null ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty>مفيش حد في قايمة انتظار السبوطة دي.</Empty>
        ) : (
          <Table
            head={['الدور', 'العضو', 'دخل القايمة', 'اتبلّغ؟', ...(canEdit ? ['إجراء'] : [])]}
          >
            {rows.map((w) => {
              const p = one(w.profiles)
              return (
                <tr key={w.id} style={{ borderTop: '1px solid var(--line)' }}>
                  <td className="p-2 font-display text-18 font-black">{w.position}</td>
                  <td className="p-2">
                    <div className="font-display text-15 font-black">{personName(p)}</div>
                    <div className="font-body text-12" style={{ color: 'var(--muted)' }}>
                      {p?.phone ?? '—'}
                    </div>
                  </td>
                  <td className="p-2">{when(w.created_at)}</td>
                  <td className="p-2">
                    {w.notified_at ? (
                      <Tag color="#9BE39B">اتبلّغ {when(w.notified_at)}</Tag>
                    ) : (
                      <span style={{ color: 'var(--muted)' }}>لسه</span>
                    )}
                  </td>
                  {canEdit && (
                    <td className="p-2">
                      <div className="flex flex-wrap gap-2">
                        <Btn kind="primary" disabled={busy || free <= 0} onClick={() => promote(w)}>
                          دخّله السبوطة
                        </Btn>
                        <Btn kind="danger" disabled={busy} onClick={() => drop(w)}>
                          شيله
                        </Btn>
                      </div>
                    </td>
                  )}
                </tr>
              )
            })}
          </Table>
        )}
      </div>

      {canEdit && free <= 0 && (rows?.length ?? 0) > 0 && (
        <div className="mt-3 font-body text-13" style={{ color: 'var(--muted)' }}>
          مفيش مكان فاضي دلوقتي، فزرار «دخّله السبوطة» مقفول. أول ما حد يلغي المكان بيفضى.
        </div>
      )}
    </div>
  )
}

/* ============================================================ الحضور */

function CheckinTab({
  sbotat,
  canEdit,
  myId,
  flash: rawFlash,
}: {
  sbotat: SbotaRow[]
  canEdit: boolean
  myId: string | null
  flash: (m: string) => void
}) {
  const flash = useSay(rawFlash)
  const [sbotaId, setSbotaId] = useState(sbotat[0]?.id ?? '')
  const [rows, setRows] = useState<BookingRow[] | null>(null)
  const [busy, setBusy] = useState<Record<string, boolean>>({})

  const sbota = useMemo(() => sbotat.find((s) => s.id === sbotaId) ?? null, [sbotat, sbotaId])

  const reload = useCallback(async () => {
    if (!sbotaId) {
      setRows([])
      return
    }
    setRows(null)
    const { data, error } = await supabase()
      .from('bookings')
      .select(BOOKING_COLS)
      .eq('sbota_id', sbotaId)
      .in('status', ['paid', 'attended', 'no_show'])
    if (error) {
      flash(`مقدرناش نجيب الكشف: ${error.message}`)
      setRows([])
      return
    }
    const list = (data ?? []) as unknown as BookingRow[]
    list.sort((a, b) =>
      personName(one(a.profiles)).localeCompare(personName(one(b.profiles)), 'ar')
    )
    setRows(list)
  }, [sbotaId, flash])

  useEffect(() => {
    reload()
  }, [reload])

  const arrived = (rows ?? []).filter((b) => b.checked_in_at).length
  const total = rows?.length ?? 0

  async function toggle(b: BookingRow) {
    const on = !b.checked_in_at
    if (!on && !confirm(`هنشيل علامة الوصول عن ${personName(one(b.profiles))}. تمام؟`)) return

    setBusy((s) => ({ ...s, [b.id]: true }))
    const { data: ci, error } = await supabase()
      .from('bookings')
      .update({
        checked_in_at: on ? new Date().toISOString() : null,
        checked_in_by: on ? myId : null,
      })
      .eq('id', b.id)
      .select('id')
    setBusy((s) => ({ ...s, [b.id]: false }))

    if (error) {
      flash(`مقدرناش نسجّل: ${error.message}`)
      return
    }
    if (rejected(ci)) {
      flash('مااتسجّلش — القاعدة رفضت الكتابة، محتاج صلاحية bookings.edit')
      return
    }
    setRows((rs) =>
      (rs ?? []).map((r) =>
        r.id === b.id ? { ...r, checked_in_at: on ? new Date().toISOString() : null } : r
      )
    )
  }

  return (
    <div className="mt-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end">
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
        <div className="md:ms-auto">
          <Btn onClick={() => reload()}>حدّث الكشف</Btn>
        </div>
      </div>

      <div
        className="sticky top-0 z-10 mt-4 rounded-20 px-4 py-3"
        style={{ background: 'var(--surface)' }}
      >
        <div className="font-display text-28 font-black">
          وصل {arrived} من {total}
        </div>
        <div className="mt-2 h-[10px] w-full overflow-hidden rounded-pill" style={{ background: 'var(--bg)' }}>
          <div
            className="h-full rounded-pill"
            style={{ width: `${total ? (arrived / total) * 100 : 0}%`, background: '#F4632A' }}
          />
        </div>
        {sbota && (
          <div className="mt-2 font-body text-13" style={{ color: 'var(--muted)' }}>
            {tplName(sbota)} · {when(sbota.starts_at)}
          </div>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-3">
        {rows === null ? (
          <Loading />
        ) : rows.length === 0 ? (
          <Empty>مفيش حد دافع في السبوطة دي لحد دلوقتي.</Empty>
        ) : (
          rows.map((b) => {
            const p = one(b.profiles)
            const on = Boolean(b.checked_in_at)
            return (
              <button
                key={b.id}
                type="button"
                disabled={!canEdit || Boolean(busy[b.id])}
                onClick={() => toggle(b)}
                className="flex w-full cursor-pointer items-center gap-3 rounded-20 p-4 text-start disabled:cursor-not-allowed disabled:opacity-60"
                style={{
                  background: on ? '#9BE39B' : 'var(--surface)',
                  color: on ? '#14161A' : 'var(--fg)',
                  border: `2px solid ${on ? '#9BE39B' : 'var(--chip-idle-border)'}`,
                  minHeight: 76,
                }}
              >
                <span className="font-display text-28 font-black">{on ? '✓' : '○'}</span>
                <span className="flex flex-1 flex-col">
                  <span className="font-display text-20 font-black">{personName(p)}</span>
                  <span
                    className="font-body text-13"
                    style={{ color: on ? '#14161A' : 'var(--muted)' }}
                  >
                    {p?.phone ?? '—'} ·{' '}
                    {(p?.sbota_count ?? 0) === 0 ? 'أول مرة معانا' : `المرة ${(p?.sbota_count ?? 0) + 1}`}
                    {b.status === 'no_show' ? ' · متسجّل إنه مجاش' : ''}
                  </span>
                </span>
                <span className="font-display text-15 font-black">
                  {busy[b.id] ? 'ثانية…' : on ? 'وصل' : 'دوس لما يوصل'}
                </span>
              </button>
            )
          })
        )}
      </div>

      <div className="mt-4 font-body text-13" style={{ color: 'var(--muted)' }}>
        الدوسة بتسجّل ساعة الوصول واسمك كإنك أنت اللي استلمته. الحالة النهائية (حضر/مجاش) بتتظبط
        لوحدها بعد ما السبوطة تخلص.
      </div>
    </div>
  )
}
