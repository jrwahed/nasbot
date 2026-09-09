'use client'

import { useCallback, useEffect, useState } from 'react'
import { AdminShell } from '@/components/AdminShell'
import { supabase } from '@/lib/supabase'
import {
  ADMIN_PAGE_SIZE,
  ADMIN_SCAN_MAX,
  Btn,
  Pager,
  SelectField,
  Empty,
  Loading,
  Tag,
  Stat,
  useFlash,
  when,
} from '@/components/admin-ui'
import type { AdminMe } from '@/lib/admin'

/**
 * طابور البلاغات.
 *
 * ده مش قسم عادي: نسبوط بتخلي ناس ما تعرفش بعض تقابل بعض على الأرض،
 * فأي بلاغ مستني معناه إن حد مستني ردنا. علشان كده «المستنية» فوق دايمًا
 * وبلونها، والصفحة ما بتخلّيكش تقفل بلاغ من غير ما تكتب سبب.
 *
 * كل قرار بيتسجّل في مكانين:
 *  - reports.handled_by و handled_at → مين وامتى (القاعدة نفسها).
 *  - سطر مكتوب في reports.note تحت علامة «قرار الإدارة» → ليه.
 * ولما نتخذ إجراء بنزوّد كمان علامة سلوك على العضو في behavior_flags.
 *
 * ملاحظة: «حظر» هنا بتسجّل القرار وتزوّد علامة — الحظر الفعلي للحساب
 * بيتعمل من قسم «الناس» (صلاحية people.ban).
 *
 * الترقيم من القاعدة: الفلتر بيروح كـ `eq`/`in` على الحالة، والصفوف بتيجي
 * صفحة صفحة. «اللي لسه مستنية» بيترتّب بـ status الأول (open قبل reviewing
 * أبجديًا) وبعدين بالأحدث — نفس ترتيب الطابور القديم بالظبط.
 * أسامي الناس وعلامات السلوك بتتجاب للي في الصفحة دي بس.
 */

interface ReportRow {
  id: string
  reporter_id: string
  target_profile_id: string | null
  message_id: string | null
  booking_id: string | null
  reason: string
  note: string | null
  status: string
  handled_by: string | null
  handled_at: string | null
  action: string
  created_at: string
}

interface PersonRow {
  id: string
  first_name: string | null
  phone: string
  banned_at: string | null
  no_show_count: number
}

interface FlagRow {
  id: string
  profile_id: string
  kind: string
  note: string | null
  weight: number
  created_at: string
}

const REASONS: Record<string, string> = {
  harassment: 'تحرش أو مضايقة',
  spam: 'إعلانات وسبام',
  unsafe: 'حاجة مش أمان',
  other: 'حاجة تانية',
}

const STATUSES: Record<string, { label: string; color?: string }> = {
  open: { label: 'مستنية', color: '#F4632A' },
  reviewing: { label: 'بنراجعها', color: '#FFD166' },
  actioned: { label: 'اتعمل فيها إجراء' },
  dismissed: { label: 'اتقفلت' },
}

/** الحالات اللي لسه مستنية ردّنا */
const PENDING = ['open', 'reviewing']

const REPORT_COLS =
  'id, reporter_id, target_profile_id, message_id, booking_id, reason, note, status, handled_by, handled_at, action, created_at'

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

const ACTIONS = [
  { value: 'warn', label: 'نبّهناه' },
  { value: 'remove_from_room', label: 'شيلناه من الشات' },
  { value: 'ban', label: 'قررنا الحظر' },
]

const FLAG_KINDS = [
  { value: 'report_received', label: 'جاله بلاغ' },
  { value: 'low_conduct', label: 'سلوك وحش' },
]

const FILTERS = [
  { value: 'pending', label: 'اللي لسه مستنية' },
  { value: 'all', label: 'كلها' },
  { value: 'open', label: 'مستنية' },
  { value: 'reviewing', label: 'بنراجعها' },
  { value: 'actioned', label: 'اتعمل فيها إجراء' },
  { value: 'dismissed', label: 'اتقفلت' },
]

/** العلامة اللي بنفصل بيها كلام صاحب البلاغ عن قرارات الإدارة */
const MARK = '— قرار الإدارة'

const splitNote = (note: string | null) => {
  const parts = (note ?? '').split(MARK)
  return { reporter: parts[0].trim(), decisions: parts.slice(1).map((p) => p.trim()) }
}

const stampNote = (note: string | null, decision: string, adminNote: string) =>
  `${note ?? ''}\n\n${MARK} (${decision} — ${when(new Date().toISOString())}): ${adminNote}`.trim()

export default function AdminReportsPage() {
  return (
    <AdminShell title="البلاغات والأمان" needs="reports.view">
      {(me) => <ReportsQueue me={me} />}
    </AdminShell>
  )
}

function ReportsQueue({ me }: { me: AdminMe }) {
  const canAct = me.permissions.has('reports.action')

  const [rows, setRows] = useState<ReportRow[] | null>(null)
  const [total, setTotal] = useState<number | null>(null)
  const [page, setPage] = useState(0)
  const [people, setPeople] = useState<Record<string, PersonRow>>({})
  const [flags, setFlags] = useState<FlagRow[]>([])
  /** كام بلاغ على كل عضو من اللي في الصفحة دي */
  const [reportsOn, setReportsOn] = useState<Record<string, number>>({})
  const [counts, setCounts] = useState({ open: 0, reviewing: 0, actioned: 0, dismissed: 0 })
  const [oldestOpen, setOldestOpen] = useState<ReportRow | null>(null)
  const [filter, setFilter] = useState('pending')
  const [meId, setMeId] = useState<string | null>(null)
  const [busy, setBusy] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)
  const { flash, node: flashNode } = useFlash()

  useEffect(() => {
    supabase()
      .auth.getUser()
      .then((res: { data: { user: { id: string } | null } }) => setMeId(res.data.user?.id ?? null))
      .catch(() => setMeId(null))
  }, [])

  /** صفحة الطابور — الفلتر والترتيب في القاعدة */
  const reload = useCallback(async () => {
    setLoading(true)
    const db = supabase()
    let q = db.from('reports').select(REPORT_COLS, { count: 'exact' })
    if (filter === 'pending') q = q.in('status', PENDING)
    else if (filter !== 'all') q = q.eq('status', filter)

    // 'open' قبل 'reviewing' أبجديًا — نفس ترتيب الطابور القديم
    if (filter === 'pending') q = q.order('status', { ascending: true })
    const { data, count, error } = await q
      .order('created_at', { ascending: false })
      .range(page * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE + ADMIN_PAGE_SIZE - 1)

    setLoading(false)
    if (error) {
      flash(`مقدرناش نجيب البلاغات: ${error.message}`)
      setRows([])
      setTotal(0)
      return
    }
    const list = (data ?? []) as ReportRow[]
    setRows(list)
    setTotal(count ?? null)

    // الناس والعلامات وعدد البلاغات — للي في الصفحة دي بس
    const targets = Array.from(
      new Set(list.map((r) => r.target_profile_id).filter((x): x is string => Boolean(x)))
    )
    const ids = Array.from(
      new Set(
        [
          ...list.map((r) => r.reporter_id),
          ...list.map((r) => r.target_profile_id),
          ...list.map((r) => r.handled_by),
        ].filter((x): x is string => Boolean(x))
      )
    )

    const map: Record<string, PersonRow> = {}
    for (const part of chunk(ids, 100)) {
      const { data: ps } = await db
        .from('profiles')
        .select('id, first_name, phone, banned_at, no_show_count')
        .in('id', part)
      for (const person of (ps ?? []) as PersonRow[]) map[person.id] = person
    }
    setPeople((old) => ({ ...old, ...map }))

    const gathered: FlagRow[] = []
    const seen: Record<string, number> = {}
    for (const part of chunk(targets, 100)) {
      const [fl, rp] = await Promise.all([
        db
          .from('behavior_flags')
          .select('id, profile_id, kind, note, weight, created_at')
          .in('profile_id', part)
          .order('created_at', { ascending: false })
          .range(0, ADMIN_SCAN_MAX - 1),
        db
          .from('reports')
          .select('target_profile_id')
          .in('target_profile_id', part)
          .range(0, ADMIN_SCAN_MAX - 1),
      ])
      gathered.push(...((fl.data ?? []) as FlagRow[]))
      for (const r of (rp.data ?? []) as { target_profile_id: string }[]) {
        seen[r.target_profile_id] = (seen[r.target_profile_id] ?? 0) + 1
      }
    }
    setFlags(gathered)
    setReportsOn(seen)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, page])

  /** الأرقام اللي فوق + أقدم بلاغ مستني — عدّ من القاعدة */
  const loadCounts = useCallback(async () => {
    const db = supabase()
    const kinds = ['open', 'reviewing', 'actioned', 'dismissed'] as const
    const [res, oldest] = await Promise.all([
      Promise.all(
        kinds.map((k) =>
          db.from('reports').select('id', { count: 'exact', head: true }).eq('status', k)
        )
      ),
      db
        .from('reports')
        .select(REPORT_COLS)
        .eq('status', 'open')
        .order('created_at', { ascending: true })
        .limit(1),
    ])
    const out = { open: 0, reviewing: 0, actioned: 0, dismissed: 0 }
    kinds.forEach((k, i) => {
      out[k] = res[i].count ?? 0
    })
    setCounts(out)
    setOldestOpen((((oldest.data ?? []) as ReportRow[])[0] ?? null) as ReportRow | null)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    loadCounts()
  }, [loadCounts])

  const refresh = useCallback(async () => {
    await Promise.all([reload(), loadCounts()])
  }, [reload, loadCounts])

  const nameOf = (id: string | null) => {
    if (!id) return '—'
    const p = people[id]
    if (!p) return 'عضو مش معروف'
    return p.first_name?.trim() || p.phone
  }

  /** بيحفظ القرار وبيتأكد إن القاعدة قبلته فعلًا (مش صف اتعدّل = مفيش صلاحية) */
  async function patchReport(id: string, patch: Record<string, unknown>): Promise<string | null> {
    const { data, error } = await supabase().from('reports').update(patch).eq('id', id).select('id')
    if (error) return error.message
    if (!data || (data as unknown[]).length === 0)
      return 'القاعدة ما قبلتش التعديل — يظهر إن صلاحيتك ما بتسمحش بالتصرف في البلاغات.'
    return null
  }

  async function markReviewing(r: ReportRow, note: string) {
    setBusy(r.id)
    const err = await patchReport(r.id, {
      status: 'reviewing',
      handled_by: meId,
      handled_at: new Date().toISOString(),
      note: stampNote(r.note, 'بنراجعها', note),
    })
    setBusy(null)
    if (err) return flash(`مقدرناش: ${err}`)
    await refresh()
    flash('اتسجّلت إنها تحت المراجعة ✓')
  }

  async function dismiss(r: ReportRow, note: string) {
    if (!confirm(`هنقفل البلاغ ده من غير إجراء على ${nameOf(r.target_profile_id)}. متأكد؟`)) return
    setBusy(r.id)
    const err = await patchReport(r.id, {
      status: 'dismissed',
      action: 'none',
      handled_by: meId,
      handled_at: new Date().toISOString(),
      note: stampNote(r.note, 'اتقفل من غير إجراء', note),
    })
    setBusy(null)
    if (err) return flash(`مقدرناش: ${err}`)
    await refresh()
    flash('البلاغ اتقفل والسبب اتسجّل ✓')
  }

  async function act(r: ReportRow, note: string, action: string, kind: string, weight: number) {
    if (!r.target_profile_id) {
      flash('البلاغ ده مش على عضو معيّن، فمش هينفع نزوّد عليه علامة سلوك.')
      return
    }
    const target = nameOf(r.target_profile_id)
    const label = ACTIONS.find((a) => a.value === action)?.label ?? action
    if (!confirm(`هنسجّل «${label}» على ${target} ونزوّدله علامة سلوك. متأكد؟`)) return

    setBusy(r.id)
    const db = supabase()
    const { data: flagged, error: flagErr } = await db
      .from('behavior_flags')
      .insert({
        profile_id: r.target_profile_id,
        kind,
        booking_id: r.booking_id,
        note: `${label}: ${note}`,
        weight,
      })
      .select('id')

    if (flagErr || !flagged || (flagged as unknown[]).length === 0) {
      setBusy(null)
      return flash(`مقدرناش نزوّد العلامة: ${flagErr?.message ?? 'القاعدة رفضت الإضافة'}`)
    }

    const err = await patchReport(r.id, {
      status: 'actioned',
      action,
      handled_by: meId,
      handled_at: new Date().toISOString(),
      note: stampNote(r.note, label, note),
    })
    setBusy(null)
    if (err) return flash(`العلامة اتزودت بس البلاغ ما اتقفلش: ${err}`)
    await refresh()
    flash(
      action === 'ban'
        ? 'اتسجّل ✓ — فاكر إن الحظر الفعلي للحساب بيتعمل من قسم «الناس».'
        : 'اتسجّل الإجراء والعلامة ✓'
    )
  }

  if (rows === null) return <Loading />

  return (
    <div className="mt-6">
      <div className="flex flex-wrap gap-3">
        <Stat
          label="مستنية"
          value={String(counts.open)}
          hint={
            oldestOpen ? `أقدم واحدة من ${when(oldestOpen.created_at)}` : 'مفيش حاجة مستنية — تمام'
          }
        />
        <Stat label="بنراجعها" value={String(counts.reviewing)} />
        <Stat label="اتعمل فيها إجراء" value={String(counts.actioned)} />
        <Stat label="اتقفلت" value={String(counts.dismissed)} />
      </div>

      {counts.open > 0 && (
        <div
          className="mt-4 rounded-16 px-4 py-3 font-display text-18 font-black"
          style={{ background: '#F4632A', color: '#14161A' }}
        >
          في {counts.open} بلاغ مستني ردّك. ما تسيبهوش.
        </div>
      )}

      {!canAct && (
        <div className="mt-4 rounded-16 px-4 py-3 font-body text-14" style={{ background: 'var(--surface)' }}>
          أنت بتتفرّج بس. التصرف في البلاغات محتاج صلاحية reports.action.
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <SelectField
          label="اعرض"
          value={filter}
          options={FILTERS}
          onChange={(v) => {
            setPage(0)
            setFilter(v)
          }}
        />
        <div className="font-body text-14" style={{ color: 'var(--muted)' }}>
          {total ?? 0} بلاغ بالفلتر ده
        </div>
        <div className="ms-auto">
          <Btn onClick={() => refresh()}>حدّث</Btn>
        </div>
      </div>

      {flashNode}

      <div className="mt-4 flex flex-col gap-3">
        {rows.length === 0 && (
          <Empty>
            {counts.open + counts.reviewing + counts.actioned + counts.dismissed === 0
              ? 'مفيش بلاغات لحد دلوقتي. أول ما حد يبلّغ هتلاقيه هنا فورًا.'
              : 'مفيش بلاغ بالفلتر ده.'}
          </Empty>
        )}

        {rows.map((r) => (
          <ReportCard
            key={r.id}
            r={r}
            canAct={canAct}
            busy={busy === r.id}
            reporter={nameOf(r.reporter_id)}
            target={nameOf(r.target_profile_id)}
            targetBanned={Boolean(r.target_profile_id && people[r.target_profile_id]?.banned_at)}
            handler={r.handled_by ? nameOf(r.handled_by) : null}
            targetFlags={flags.filter((f) => f.profile_id === r.target_profile_id)}
            openCount={r.target_profile_id ? (reportsOn[r.target_profile_id] ?? 0) : 0}
            onReview={(note) => markReviewing(r, note)}
            onDismiss={(note) => dismiss(r, note)}
            onAct={(note, action, kind, weight) => act(r, note, action, kind, weight)}
          />
        ))}

        <Pager page={page} shown={rows.length} total={total} onPage={setPage} busy={loading} />
      </div>
    </div>
  )
}

/* ============================================================ كارت البلاغ */

function ReportCard({
  r,
  canAct,
  busy,
  reporter,
  target,
  targetBanned,
  handler,
  targetFlags,
  openCount,
  onReview,
  onDismiss,
  onAct,
}: {
  r: ReportRow
  canAct: boolean
  busy: boolean
  reporter: string
  target: string
  targetBanned: boolean
  handler: string | null
  targetFlags: FlagRow[]
  openCount: number
  onReview: (note: string) => void
  onDismiss: (note: string) => void
  onAct: (note: string, action: string, kind: string, weight: number) => void
}) {
  const [note, setNote] = useState('')
  const [action, setAction] = useState('warn')
  const [kind, setKind] = useState('report_received')
  const [weight, setWeight] = useState(1)
  const [openPanel, setOpenPanel] = useState(false)

  const st = STATUSES[r.status] ?? { label: r.status }
  const urgent = r.status === 'open'
  const { reporter: reporterNote, decisions } = splitNote(r.note)
  const ready = note.trim().length >= 3

  const need = () => {
    if (!ready) {
      alert('اكتب سبب القرار الأول — سطر واحد يكفي، بس لازم يتسجّل.')
      return false
    }
    return true
  }

  return (
    <section
      className="rounded-20 p-4"
      style={{
        background: 'var(--surface)',
        border: `3px solid ${urgent ? '#F4632A' : 'transparent'}`,
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Tag color={st.color}>{st.label}</Tag>
        <span className="font-display text-18 font-black">{REASONS[r.reason] ?? r.reason}</span>
        {r.reason === 'unsafe' && <Tag color="#F4632A">أمان</Tag>}
        {targetBanned && <Tag>محظور أصلًا</Tag>}
        <span className="ms-auto font-body text-12" style={{ color: 'var(--muted)' }}>
          البلاغ اتبعت {when(r.created_at)}
        </span>
      </div>

      <div className="mt-2 font-body text-16">
        <b>{reporter}</b> بلّغ على <b>{target}</b>
        {!r.target_profile_id && ' (بلاغ على رسالة مش على عضو)'}
      </div>

      <div className="mt-1 flex flex-wrap gap-3 font-body text-13" style={{ color: 'var(--muted)' }}>
        {openCount > 1 && <span>العضو ده عليه {openCount} بلاغ</span>}
        {targetFlags.length > 0 && <span>وعنده {targetFlags.length} علامة سلوك</span>}
        {r.booking_id && <span>مرتبط بحجز</span>}
        {r.message_id && <span>مرتبط برسالة في الشات</span>}
      </div>

      {reporterNote && (
        <div className="mt-3 rounded-14 px-3 py-2 font-body text-15" style={{ background: 'var(--bg)' }}>
          {reporterNote}
        </div>
      )}
      {!reporterNote && (
        <div className="mt-3 font-body text-14" style={{ color: 'var(--muted)' }}>
          ما كتبش تفاصيل مع البلاغ.
        </div>
      )}

      {decisions.length > 0 && (
        <div className="mt-3 flex flex-col gap-1">
          <span className="font-display text-15 font-black">اللي اتعمل</span>
          {decisions.map((d, i) => (
            <div key={i} className="font-body text-13" style={{ color: 'var(--muted)' }}>
              {d}
            </div>
          ))}
        </div>
      )}

      {r.handled_at && (
        <div className="mt-2 font-body text-12" style={{ color: 'var(--muted)' }}>
          آخر قرار من {handler ?? 'حد من الفريق'} يوم {when(r.handled_at)}
        </div>
      )}

      {targetFlags.length > 0 && (
        <details className="mt-3">
          <summary className="cursor-pointer font-body text-14" style={{ color: 'var(--accent-text)' }}>
            علامات السلوك على {target}
          </summary>
          <div className="mt-2 flex flex-col gap-1">
            {targetFlags.map((f) => (
              <div key={f.id} className="font-body text-13" style={{ color: 'var(--muted)' }}>
                {FLAG_KINDS.find((k) => k.value === f.kind)?.label ?? f.kind} · وزن {f.weight} ·{' '}
                {when(f.created_at)} — {f.note ?? 'من غير ملاحظة'}
              </div>
            ))}
          </div>
        </details>
      )}

      {canAct && r.status !== 'actioned' && r.status !== 'dismissed' && !openPanel && (
        <div className="mt-3">
          <Btn kind="primary" onClick={() => setOpenPanel(true)}>
            اتصرّف في البلاغ ده
          </Btn>
        </div>
      )}

      {canAct && openPanel && (
        <div className="mt-4 rounded-16 p-3" style={{ background: 'var(--bg)' }}>
          <label className="flex flex-col gap-1">
            <span className="font-display text-15 font-black">اكتب سببك — إجباري</span>
            <textarea
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="مثلًا: كلّمنا الاتنين، الكلام كان فيه مضايقة واضحة."
              className="w-full rounded-14 px-3 py-2 font-body text-15"
              style={{ background: 'var(--surface)', color: 'var(--fg)', border: '2px solid var(--line)' }}
            />
            <span className="font-body text-12" style={{ color: 'var(--muted)' }}>
              اللي هتكتبه بيتسجّل مع اسمك في البلاغ، ومحدش بيقدر يمسحه.
            </span>
          </label>

          <div className="mt-3 flex flex-wrap items-end gap-3">
            <SelectField label="الإجراء" value={action} options={ACTIONS} onChange={setAction} />
            <SelectField label="نوع العلامة" value={kind} options={FLAG_KINDS} onChange={setKind} />
            <label className="flex flex-col gap-1">
              <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
                وزن العلامة
              </span>
              <input
                type="number"
                min={1}
                max={5}
                value={weight}
                onChange={(e) => setWeight(Math.max(1, Number(e.target.value) || 1))}
                className="w-[80px] rounded-14 px-3 py-2 font-body text-16"
                style={{ background: 'var(--surface)', color: 'var(--fg)', border: '2px solid var(--line)' }}
              />
            </label>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <Btn
              kind="primary"
              disabled={busy || !r.target_profile_id}
              onClick={() => need() && onAct(note.trim(), action, kind, weight)}
            >
              {busy ? 'ثانية واحدة…' : 'سجّل الإجراء'}
            </Btn>
            <Btn disabled={busy} onClick={() => need() && onReview(note.trim())}>
              خليها تحت المراجعة
            </Btn>
            <Btn kind="danger" disabled={busy} onClick={() => need() && onDismiss(note.trim())}>
              اقفلها من غير إجراء
            </Btn>
            <Btn disabled={busy} onClick={() => setOpenPanel(false)}>
              سيبها
            </Btn>
          </div>

          {!r.target_profile_id && (
            <div className="mt-2 font-body text-13" style={{ color: 'var(--muted)' }}>
              البلاغ ده مش على عضو معيّن، فمفيش علامة سلوك تتزوّد — تقدر تراجعها أو تقفلها بس.
            </div>
          )}
          {action === 'ban' && (
            <div className="mt-2 font-body text-13" style={{ color: 'var(--err-text)' }}>
              ده بيسجّل قرار الحظر ويزوّد العلامة. الحظر الفعلي للحساب من قسم «الناس».
            </div>
          )}
        </div>
      )}
    </section>
  )
}
