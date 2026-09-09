'use client'

import { useCallback, useEffect, useState } from 'react'
import { AdminShell } from '@/components/AdminShell'
import { supabase } from '@/lib/supabase'
import { loadBannedWords, bannedIn } from '@/lib/admin'
import {
  ADMIN_PAGE_SIZE,
  ADMIN_SCAN_MAX,
  Card,
  Tabs,
  Btn,
  Pager,
  SelectField,
  Table,
  Empty,
  Loading,
  Tag,
  Stat,
  cairoDayStart,
  todayCairo,
  useFlash,
  when,
} from '@/components/admin-ui'
import type { AdminMe } from '@/lib/admin'

/**
 * الرسايل: القوالب، الطابور، والإرسال الجماعي.
 *
 * القوالب فيها متغيرات زي {{1}} بيتملوا وقت الإرسال. لو حد شال متغير
 * كان موجود، الرسالة بتوصل للعضو ناقصة — علشان كده الصفحة بتقف قدامه
 * وتقوله بالظبط إيه اللي ضاع قبل ما يحفظ.
 *
 * الإرسال الجماعي: مفيش لحد دلوقتي أي دالة في القاعدة بتبعت فعلًا،
 * فإحنا بنسجّل الحملة في broadcasts بحالة draft وبنقول للي بيبعت
 * إنها مسجّلة ولسه ما اتبعتتش — أحسن ما نكدب عليه.
 *
 * الترقيم من القاعدة: الطابور بيتفلتر بالحالة على الخادم وبيتجاب صفحة صفحة،
 * وعدد الشريحة في الإرسال الجماعي بقى **عدّ** من القاعدة مش تحميل ٥٠٠٠ ملف
 * و٢٠ ألف حجز وعدّهم في المتصفح.
 */

interface TemplateRow {
  key: string
  channel: string
  body_ar: string
  provider_template_id: string | null
  is_active: boolean
}

interface QueueRow {
  id: string
  profile_id: string | null
  phone: string | null
  channel: string
  template_key: string | null
  status: string
  error: string | null
  attempts: number
  scheduled_for: string
  sent_at: string | null
  created_at: string
}

interface BroadcastRow {
  id: string
  segment: Record<string, unknown>
  template_key: string | null
  recipients_count: number
  sent_count: number
  status: string
  created_by: string | null
  created_at: string
}

interface PersonRow {
  id: string
  first_name: string | null
  phone: string
  area: string | null
  banned_at: string | null
  deleted_at: string | null
}

const AREAS: { value: string; label: string }[] = [
  { value: 'all', label: 'كل المناطق' },
  { value: 'tagamoa', label: 'التجمع' },
  { value: 'maadi', label: 'المعادي' },
  { value: 'zayed_october', label: 'زايد-أكتوبر' },
  { value: 'heliopolis_nasr', label: 'مصر الجديدة-مدينة نصر' },
  { value: 'downtown_zamalek', label: 'وسط-زمالك' },
  { value: 'other', label: 'غير كده' },
  { value: 'none', label: 'مش كاتب منطقته' },
]

const BOOKED = [
  { value: 'any', label: 'أي حد' },
  { value: 'yes', label: 'اللي حجز قبل كده' },
  { value: 'no', label: 'اللي لسه ماحجزش' },
]

const CHANNELS: Record<string, string> = {
  whatsapp: 'واتساب',
  sms: 'رسالة نصية',
  email: 'إيميل',
  inapp: 'جوّه الموقع',
}

const QSTATUS: Record<string, { label: string; color?: string }> = {
  queued: { label: 'في الطابور' },
  sent: { label: 'اتبعتت' },
  failed: { label: 'وقعت', color: '#F4632A' },
  read: { label: 'اتقرت' },
}

const TABS = [
  { id: 'templates' as const, label: 'القوالب' },
  { id: 'queue' as const, label: 'الطابور' },
  { id: 'broadcast' as const, label: 'إرسال جماعي' },
]
type TabId = (typeof TABS)[number]['id']

/** المتغيرات اللي جوه القالب زي {{1}} */
function varsIn(body: string): string[] {
  const out: string[] = []
  const re = /\{\{\s*([^}]+?)\s*\}\}/g
  let m: RegExpExecArray | null
  while ((m = re.exec(body)) !== null) if (!out.includes(m[1])) out.push(m[1])
  return out
}

/** أقصى عدد أسامي بنعرضها كعيّنة من الشريحة قبل الإرسال */
const PREVIEW_MAX = 20

const QUEUE_COLS =
  'id, profile_id, phone, channel, template_key, status, error, attempts, scheduled_for, sent_at, created_at'

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

export default function AdminNotificationsPage() {
  return (
    <AdminShell title="الرسايل" needs="notifications.view">
      {(me) => <Messages me={me} />}
    </AdminShell>
  )
}

function Messages({ me }: { me: AdminMe }) {
  const [tab, setTab] = useState<TabId>('templates')
  const [templates, setTemplates] = useState<TemplateRow[] | null>(null)
  const { flash, node: flashNode } = useFlash()

  const reloadTemplates = useCallback(async () => {
    // جدول تعريفي صغير (مفتاح لكل نوع رسالة) — السقف حزام أمان بس
    const { data } = await supabase()
      .from('notification_templates')
      .select('key, channel, body_ar, provider_template_id, is_active')
      .order('key')
      .range(0, ADMIN_SCAN_MAX - 1)
    setTemplates((data ?? []) as TemplateRow[])
  }, [])

  useEffect(() => {
    reloadTemplates()
  }, [reloadTemplates])

  return (
    <div>
      <Tabs tabs={TABS} value={tab} onChange={setTab} />
      {flashNode}

      {tab === 'templates' && (
        <Templates
          rows={templates}
          canEdit={me.permissions.has('notifications.edit')}
          reload={reloadTemplates}
          flash={flash}
        />
      )}
      {tab === 'queue' && <Queue flash={flash} />}
      {tab === 'broadcast' && (
        <Broadcast
          templates={(templates ?? []).filter((t) => t.is_active)}
          canSend={me.permissions.has('notifications.broadcast')}
          flash={flash}
        />
      )}
    </div>
  )
}

/* ============================================================ القوالب */

function Templates({
  rows,
  canEdit,
  reload,
  flash,
}: {
  rows: TemplateRow[] | null
  canEdit: boolean
  reload: () => Promise<void>
  flash: (m: string) => void
}) {
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [banned, setBanned] = useState<string[]>([])
  const [saving, setSaving] = useState<string | null>(null)

  useEffect(() => {
    loadBannedWords().then(setBanned)
  }, [])

  async function save(t: TemplateRow, body: string) {
    const bad = bannedIn(body, banned)
    if (bad.length) {
      flash(`النص فيه كلمة ممنوعة: ${bad.join('، ')}`)
      return
    }
    const before = varsIn(t.body_ar)
    const after = varsIn(body)
    const dropped = before.filter((v) => !after.includes(v))

    if (dropped.length) {
      const ok = confirm(
        `انتبه: القالب ده كان فيه ${dropped.map((d) => `{{${d}}}`).join('، ')} وأنت شيلتهم.\n\n` +
          'المتغيرات دي بتتملي وقت الإرسال (اسم العضو، الميعاد، اللينك…). ' +
          'لو مشيت كده، الرسالة هتوصل للعضو ناقصة.\n\nتحفظ برضه؟'
      )
      if (!ok) return
    }
    if (!body.trim()) {
      flash('القالب ما ينفعش يبقى فاضي.')
      return
    }

    setSaving(t.key)
    const { data, error } = await supabase()
      .from('notification_templates')
      .update({ body_ar: body })
      .eq('key', t.key)
      .select('key')
    setSaving(null)

    if (error) return flash(`مقدرناش نحفظ: ${error.message}`)
    if (!data || (data as unknown[]).length === 0)
      return flash(
        'القاعدة ما قبلتش التعديل — محتاج صلاحية notifications.edit.'
      )

    setDrafts((d) => {
      const n = { ...d }
      delete n[t.key]
      return n
    })
    await reload()
    flash('اتحفظ ✓')
  }

  async function toggle(t: TemplateRow, active: boolean) {
    const { data, error } = await supabase()
      .from('notification_templates')
      .update({ is_active: active })
      .eq('key', t.key)
      .select('key')
    if (error) return flash(`مقدرناش: ${error.message}`)
    if (!data || (data as unknown[]).length === 0)
      return flash('القاعدة ما قبلتش التعديل — محتاج صلاحية notifications.edit.')
    await reload()
    flash(active ? 'القالب اتشغّل ✓' : 'القالب اتقفل ✓')
  }

  if (rows === null) return <Loading />
  if (rows.length === 0) return <Empty>مفيش قوالب في القاعدة.</Empty>

  return (
    <div className="mt-5 flex flex-col gap-3">
      <p className="m-0 font-body text-14" style={{ color: 'var(--muted)' }}>
        اللي بين {'{{ }}'} بيتملي لوحده وقت الإرسال — سيبه زي ما هو. لو شيلته، اللي هيوصل للعضو
        هيبقى ناقص.
        {!canEdit && ' — وأنت بتتفرّج بس، التعديل محتاج صلاحية notifications.edit.'}
      </p>

      {rows.map((t) => {
        const draft = drafts[t.key]
        const body = draft ?? t.body_ar
        const dirty = draft !== undefined && draft !== t.body_ar
        const before = varsIn(t.body_ar)
        const after = varsIn(body)
        const dropped = before.filter((v) => !after.includes(v))
        const added = after.filter((v) => !before.includes(v))
        const bad = bannedIn(body, banned)

        return (
          <section
            key={t.key}
            className="rounded-20 p-4"
            style={{
              background: 'var(--surface)',
              opacity: t.is_active ? 1 : 0.65,
              border: `3px solid ${dropped.length || bad.length ? 'var(--err-text)' : 'transparent'}`,
            }}
          >
            <div className="flex flex-wrap items-center gap-2">
              <code className="font-body text-13" style={{ color: 'var(--muted)' }}>
                {t.key}
              </code>
              <Tag>{CHANNELS[t.channel] ?? t.channel}</Tag>
              {t.provider_template_id && (
                <span className="font-body text-12" style={{ color: 'var(--muted)' }}>
                  عند مزوّد الخدمة: {t.provider_template_id}
                </span>
              )}
              <label className="ms-auto flex items-center gap-2 font-body text-14">
                <input
                  type="checkbox"
                  checked={t.is_active}
                  disabled={!canEdit}
                  onChange={(e) => toggle(t, e.target.checked)}
                />
                شغّال
              </label>
            </div>

            <textarea
              rows={3}
              value={body}
              disabled={!canEdit}
              onChange={(e) => setDrafts((d) => ({ ...d, [t.key]: e.target.value }))}
              className="mt-3 w-full rounded-14 px-3 py-2 font-body text-16"
              style={{ background: 'var(--bg)', color: 'var(--fg)', border: '2px solid var(--line)' }}
            />

            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
                المتغيرات في القالب ده:
              </span>
              {before.length === 0 && (
                <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
                  مفيش — نص ثابت.
                </span>
              )}
              {before.map((v) => (
                <span
                  key={v}
                  className="rounded-pill px-2 py-[2px] font-body text-12"
                  style={{
                    background: after.includes(v) ? 'var(--bg)' : 'var(--err-text)',
                    color: after.includes(v) ? 'var(--muted)' : '#14161A',
                  }}
                >
                  {`{{${v}}}`}
                </span>
              ))}
            </div>

            {dropped.length > 0 && (
              <div
                className="mt-2 rounded-14 px-3 py-2 font-display text-16 font-black"
                style={{ background: 'var(--err-text)', color: '#14161A' }}
              >
                خد بالك: شيلت {dropped.map((d) => `{{${d}}}`).join('، ')} — الرسالة هتوصل للعضو
                ناقصة الجزء ده.
              </div>
            )}
            {added.length > 0 && (
              <div className="mt-2 font-body text-13" style={{ color: 'var(--muted)' }}>
                زوّدت متغير جديد: {added.map((a) => `{{${a}}}`).join('، ')} — اتأكد إن اللي بيبعت
                بيملاه.
              </div>
            )}
            {bad.length > 0 && (
              <div className="mt-2 font-body text-13" style={{ color: 'var(--err-text)' }}>
                فيه كلمة ممنوعة: {bad.join('، ')}
              </div>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              <Btn
                kind="primary"
                disabled={!canEdit || !dirty || saving === t.key || bad.length > 0}
                onClick={() => save(t, body)}
              >
                {saving === t.key ? 'ثانية واحدة…' : 'احفظ'}
              </Btn>
              {dirty && (
                <Btn
                  onClick={() =>
                    setDrafts((d) => {
                      const n = { ...d }
                      delete n[t.key]
                      return n
                    })
                  }
                >
                  ارجع زي ما كان
                </Btn>
              )}
            </div>
          </section>
        )
      })}
    </div>
  )
}

/* ============================================================ الطابور */

function Queue({ flash }: { flash: (m: string) => void }) {
  const [rows, setRows] = useState<QueueRow[] | null>(null)
  const [total, setTotal] = useState<number | null>(null)
  const [page, setPage] = useState(0)
  const [counts, setCounts] = useState<Record<string, number>>({})
  const [people, setPeople] = useState<Record<string, PersonRow>>({})
  const [status, setStatus] = useState('all')
  const [openErr, setOpenErr] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /** صفحة الطابور — فلتر الحالة بيروح للقاعدة */
  const reload = useCallback(async () => {
    setBusy(true)
    const db = supabase()
    let q = db.from('notifications').select(QUEUE_COLS, { count: 'exact' })
    if (status !== 'all') q = q.eq('status', status)
    const { data, count, error } = await q
      .order('created_at', { ascending: false })
      .range(page * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE + ADMIN_PAGE_SIZE - 1)
    setBusy(false)
    if (error) {
      flash(`مقدرناش نجيب الطابور: ${error.message}`)
      setRows([])
      setTotal(0)
      return
    }
    const list = (data ?? []) as QueueRow[]
    setRows(list)
    setTotal(count ?? null)

    // أسامي المستقبلين — اللي في الصفحة دي بس، مش جدول الناس كله
    const ids = Array.from(
      new Set(list.map((r) => r.profile_id).filter((x): x is string => Boolean(x)))
    )
    const map: Record<string, PersonRow> = {}
    for (const part of chunk(ids, 100)) {
      const { data: ps } = await db
        .from('profiles')
        .select('id, first_name, phone, area, banned_at, deleted_at')
        .in('id', part)
      for (const person of (ps ?? []) as PersonRow[]) map[person.id] = person
    }
    setPeople((old) => ({ ...old, ...map }))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, page])

  /** الأرقام اللي فوق — عدّ من القاعدة لكل حالة */
  const loadCounts = useCallback(async () => {
    const db = supabase()
    const kinds = ['queued', 'sent', 'failed', 'read']
    const res = await Promise.all(
      kinds.map((k) =>
        db.from('notifications').select('id', { count: 'exact', head: true }).eq('status', k)
      )
    )
    const out: Record<string, number> = {}
    kinds.forEach((k, i) => {
      out[k] = res[i].count ?? 0
    })
    setCounts(out)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    loadCounts()
  }, [loadCounts])

  async function retry(r: QueueRow) {
    if (!confirm('هنرجّع الرسالة دي للطابور علشان تتبعت تاني. تمام؟')) return
    const { data, error } = await supabase()
      .from('notifications')
      .update({ status: 'queued', error: null, scheduled_for: new Date().toISOString() })
      .eq('id', r.id)
      .select('id')
    if (error) return flash(`مقدرناش: ${error.message}`)
    if (!data || (data as unknown[]).length === 0)
      return flash(
        'القاعدة ما قبلتش التعديل — محتاج صلاحية notifications.edit.'
      )
    await Promise.all([reload(), loadCounts()])
    flash('رجعت للطابور ✓')
  }

  if (rows === null) return <Loading />

  return (
    <div className="mt-5">
      <div className="flex flex-wrap gap-3">
        <Stat label="في الطابور" value={String(counts.queued ?? 0)} />
        <Stat label="اتبعتت" value={String(counts.sent ?? 0)} />
        <Stat label="وقعت" value={String(counts.failed ?? 0)} hint="دي اللي محتاجة تتراجع" />
        <Stat label="اتقرت" value={String(counts.read ?? 0)} />
      </div>

      <div className="mt-4 flex flex-wrap items-end gap-3">
        <SelectField
          label="الحالة"
          value={status}
          options={[
            { value: 'all', label: 'كلها' },
            { value: 'queued', label: 'في الطابور' },
            { value: 'failed', label: 'وقعت' },
            { value: 'sent', label: 'اتبعتت' },
            { value: 'read', label: 'اتقرت' },
          ]}
          onChange={(v) => {
            setPage(0)
            setStatus(v)
          }}
        />
        <div className="ms-auto">
          <Btn onClick={() => reload()}>حدّث</Btn>
        </div>
      </div>

      <div className="mt-4">
        {rows.length === 0 ? (
          <Empty>مفيش رسايل بالفلتر ده.</Empty>
        ) : (
          <Table head={['الحالة', 'لمين', 'القالب', 'القناة', 'محاولات', 'موعدها', 'الغلطة', '']}>
            {rows.map((r) => {
              const st = QSTATUS[r.status] ?? { label: r.status }
              const p = r.profile_id ? people[r.profile_id] : null
              return (
                <tr key={r.id} style={{ borderTop: '1px solid var(--line)' }}>
                  <td className="p-2">
                    <Tag color={st.color}>{st.label}</Tag>
                  </td>
                  <td className="p-2">{p?.first_name?.trim() || r.phone || p?.phone || '—'}</td>
                  <td className="p-2">
                    <code className="text-13">{r.template_key ?? '—'}</code>
                  </td>
                  <td className="p-2">{CHANNELS[r.channel] ?? r.channel}</td>
                  <td className="p-2">{r.attempts}</td>
                  <td className="p-2 whitespace-nowrap">
                    {r.sent_at ? when(r.sent_at) : when(r.scheduled_for)}
                  </td>
                  <td className="p-2">
                    {r.error ? (
                      <button
                        type="button"
                        onClick={() => setOpenErr(openErr === r.id ? null : r.id)}
                        className="cursor-pointer bg-transparent p-0 text-start font-body text-13 underline"
                        style={{ color: 'var(--err-text)', border: 0 }}
                      >
                        {openErr === r.id ? r.error : `${r.error.slice(0, 40)}…`}
                      </button>
                    ) : (
                      <span style={{ color: 'var(--muted)' }}>—</span>
                    )}
                  </td>
                  <td className="p-2">
                    {r.status === 'failed' && <Btn onClick={() => retry(r)}>جرّب تاني</Btn>}
                  </td>
                </tr>
              )
            })}
          </Table>
        )}

        <Pager page={page} shown={rows.length} total={total} onPage={setPage} busy={busy} />
      </div>
    </div>
  )
}

/* ============================================================ إرسال جماعي */

function Broadcast({
  templates,
  canSend,
  flash,
}: {
  templates: TemplateRow[]
  canSend: boolean
  flash: (m: string) => void
}) {
  const [allPeople, setAllPeople] = useState<number | null>(null)
  const [recipients, setRecipients] = useState<number | null>(null)
  const [preview, setPreview] = useState<PersonRow[]>([])
  const [bookingsErr, setBookingsErr] = useState<string | null>(null)
  const [past, setPast] = useState<BroadcastRow[]>([])
  const [pastTotal, setPastTotal] = useState<number | null>(null)
  const [page, setPage] = useState(0)
  const [sentToday, setSentToday] = useState(0)
  const [limit, setLimit] = useState(1)
  const [meId, setMeId] = useState<string | null>(null)

  const [area, setArea] = useState('all')
  const [booked, setBooked] = useState('any')
  const [templateKey, setTemplateKey] = useState('')
  const [busy, setBusy] = useState(false)

  /** الحملات اللي فاتت — صفحة صفحة */
  const loadPast = useCallback(async () => {
    const { data, count } = await supabase()
      .from('broadcasts')
      .select(
        'id, segment, template_key, recipients_count, sent_count, status, created_by, created_at',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(page * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE + ADMIN_PAGE_SIZE - 1)
    setPast((data ?? []) as BroadcastRow[])
    setPastTotal(count ?? null)
  }, [page])

  /** الحدود والأرقام الثابتة — مرة واحدة */
  const loadMeta = useCallback(async () => {
    const db = supabase()
    const [all, s, u, mine, probe] = await Promise.all([
      db.from('profiles').select('id', { count: 'exact', head: true }),
      db.from('settings').select('daily_broadcast_limit').limit(1),
      db.auth.getUser(),
      // حملات النهاردة — عدّ بحدود يوم القاهرة، مش فلترة لآخر ٥٠ حملة
      db
        .from('broadcasts')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', cairoDayStart(todayCairo())),
      // بنتأكد إن عندنا قراية على الحجوزات قبل ما نعتمد على فلتر «حجز قبل كده»
      db.from('bookings').select('id', { count: 'exact', head: true }),
    ])
    setAllPeople(all.count ?? null)
    const lim = (s.data ?? []) as { daily_broadcast_limit: number }[]
    if (lim[0]) setLimit(lim[0].daily_broadcast_limit)
    setMeId(u.data.user?.id ?? null)
    setSentToday(mine.count ?? 0)
    setBookingsErr(probe.error ? probe.error.message : null)
  }, [])

  /**
   * الشريحة: عدّها من القاعدة، وهات ٢٠ اسم عيّنة بس.
   * فلتر «حجز قبل كده» بيتعمل على العلاقة نفسها — `bookings.status=in.(…)`
   * مع `bookings=not.is.null` (حجز) أو `bookings=is.null` (ما حجزش).
   */
  const loadSegment = useCallback(async () => {
    const withBookings = booked !== 'any'
    const cols = withBookings
      ? 'id, first_name, phone, area, banned_at, deleted_at, bookings(id)'
      : 'id, first_name, phone, area, banned_at, deleted_at'

    const build = (select: string, opts: { count?: 'exact'; head?: boolean }) => {
      let q = supabase().from('profiles').select(select, opts)
      q = q.is('deleted_at', null).is('banned_at', null).not('phone', 'is', null)
      if (area === 'none') q = q.is('area', null)
      else if (area !== 'all') q = q.eq('area', area)
      if (withBookings) {
        q = q.in('bookings.status', ['paid', 'attended'])
        q = booked === 'yes' ? q.not('bookings', 'is', null) : q.is('bookings', null)
      }
      return q
    }

    const [count, sample] = await Promise.all([
      build(withBookings ? 'id, bookings(id)' : 'id', { count: 'exact', head: true }),
      build(cols, {}).order('created_at', { ascending: false }).range(0, PREVIEW_MAX - 1),
    ])
    setRecipients(count.count ?? 0)
    setPreview((sample.data ?? []) as unknown as PersonRow[])
  }, [area, booked])

  useEffect(() => {
    loadMeta()
  }, [loadMeta])

  useEffect(() => {
    loadPast()
  }, [loadPast])

  useEffect(() => {
    loadSegment()
  }, [loadSegment])

  const reload = useCallback(async () => {
    await Promise.all([loadMeta(), loadPast(), loadSegment()])
  }, [loadMeta, loadPast, loadSegment])

  const overLimit = sentToday >= limit
  const template = templates.find((t) => t.key === templateKey) ?? null

  async function send() {
    if (!canSend) return
    if (!template) return flash('اختار قالب الأول.')
    const n = recipients ?? 0
    if (n === 0) return flash('مفيش حد في الشريحة دي.')
    if (overLimit)
      return flash(
        `خلصت حد النهاردة (${sentToday} من ${limit}). الحد بيتغيّر من الإعدادات — daily_broadcast_limit.`
      )

    const areaLabel = AREAS.find((a) => a.value === area)?.label ?? area
    const bookedLabel = BOOKED.find((b) => b.value === booked)?.label ?? booked
    const ok = confirm(
      `هتتسجّل حملة لـ ${n} عضو بالظبط.\n\n` +
        `الشريحة: ${areaLabel} · ${bookedLabel}\n` +
        `القالب: ${template.key}\n\n` +
        `النص: ${template.body_ar}\n\n` +
        'تمام؟'
    )
    if (!ok) return

    setBusy(true)
    const { error } = await supabase()
      .from('broadcasts')
      .insert({
        segment: { area, booked, exclude_banned: true },
        template_key: template.key,
        recipients_count: n,
        sent_count: 0,
        status: 'draft',
        created_by: meId,
      })
      .select('id')
    setBusy(false)

    if (error) return flash(`مقدرناش نسجّل الحملة: ${error.message}`)
    await reload()
    flash(
      `الحملة اتسجّلت لـ ${n} عضو بحالة «مسودة» — لسه ما اتبعتتش لحد. لازم اللي بيبعت يشغّلها.`
    )
  }

  if (recipients === null) return <Loading />

  return (
    <div className="mt-5 flex flex-col gap-4">
      <div
        className="rounded-16 px-4 py-3 font-body text-14"
        style={{ background: 'var(--surface)' }}
      >
        <b className="font-display text-16">اقرا ده قبل ما تبعت.</b>
        <div className="mt-1" style={{ color: 'var(--muted)' }}>
          مفيش لحد دلوقتي دالة في القاعدة بتبعت الحملة فعلًا. اللي بيحصل هنا إن الحملة بتتسجّل
          بحالة «مسودة» بالشريحة والعدد، واللي بيشغّل الواتساب هو اللي بيبعتها. يعني الضغط على الزرار
          <b> ما بيوصلش رسايل </b>
          للأعضاء — بيحجز الحملة بس.
        </div>
      </div>

      {!canSend && (
        <div className="rounded-16 px-4 py-3 font-body text-14" style={{ background: 'var(--surface)' }}>
          أنت بتتفرّج بس. الإرسال الجماعي محتاج صلاحية notifications.broadcast.
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Stat label="حملات النهاردة" value={`${sentToday} من ${limit}`} hint="الحد من الإعدادات" />
        <Stat label="هيوصلوا" value={String(recipients)} hint="بعد ما شيلنا المحظورين" />
        <Stat label="كل الأعضاء" value={allPeople === null ? '…' : String(allPeople)} />
      </div>

      <Card title="اختار مين" hint="العد بيتحسب في القاعدة ومع كل تغيير.">
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <SelectField label="المنطقة" value={area} options={AREAS} onChange={setArea} />
          <SelectField label="حجز قبل كده؟" value={booked} options={BOOKED} onChange={setBooked} />
          <SelectField
            label="القالب"
            value={templateKey}
            options={[
              { value: '', label: '— اختار قالب —' },
              ...templates.map((t) => ({ value: t.key, label: t.key })),
            ]}
            onChange={setTemplateKey}
          />
        </div>

        {bookingsErr && (
          <div className="mt-2 font-body text-13" style={{ color: 'var(--err-text)' }}>
            مقدرناش نقرا الحجوزات ({bookingsErr}) — فلتر «حجز قبل كده» مش هيبقى مظبوط. محتاج صلاحية
            bookings.view.
          </div>
        )}

        {template && (
          <div className="mt-3 rounded-14 px-3 py-2 font-body text-15" style={{ background: 'var(--bg)' }}>
            {template.body_ar}
            <div className="mt-1 font-body text-12" style={{ color: 'var(--muted)' }}>
              فيه {varsIn(template.body_ar).length} متغير بيتملي وقت الإرسال.
            </div>
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <Btn
            kind="primary"
            disabled={!canSend || busy || !template || recipients === 0 || overLimit}
            onClick={send}
          >
            {busy ? 'ثانية واحدة…' : `سجّل الحملة لـ ${recipients} عضو`}
          </Btn>
          {overLimit && (
            <span className="font-body text-13" style={{ color: 'var(--err-text)' }}>
              خلصت حد النهاردة ({limit} في اليوم). استنى بكرة أو غيّر الحد من الإعدادات.
            </span>
          )}
        </div>

        {preview.length > 0 && (
          <details className="mt-3">
            <summary className="cursor-pointer font-body text-14" style={{ color: 'var(--accent-text)' }}>
              شوف أول {PREVIEW_MAX} واحد في الشريحة
            </summary>
            <div className="mt-2 flex flex-wrap gap-2">
              {preview.map((p) => (
                <Tag key={p.id}>{p.first_name?.trim() || p.phone}</Tag>
              ))}
              {recipients > preview.length && <Tag>+{recipients - preview.length} كمان</Tag>}
            </div>
          </details>
        )}
      </Card>

      <Card title="الحملات اللي فاتت">
        <div className="mt-3">
          {past.length === 0 ? (
            <Empty>لسه محدش سجّل حملة.</Empty>
          ) : (
            <Table head={['الحالة', 'القالب', 'الشريحة', 'العدد', 'اتبعت لكام', 'امتى']}>
              {past.map((b) => {
                const seg = b.segment as { area?: string; booked?: string }
                return (
                  <tr key={b.id} style={{ borderTop: '1px solid var(--line)' }}>
                    <td className="p-2">
                      <Tag color={b.status === 'draft' ? '#FFD166' : undefined}>
                        {b.status === 'draft' ? 'مسودة — ما اتبعتتش' : b.status}
                      </Tag>
                    </td>
                    <td className="p-2">
                      <code className="text-13">{b.template_key ?? '—'}</code>
                    </td>
                    <td className="p-2">
                      {AREAS.find((a) => a.value === seg.area)?.label ?? seg.area ?? '—'} ·{' '}
                      {BOOKED.find((x) => x.value === seg.booked)?.label ?? seg.booked ?? '—'}
                    </td>
                    <td className="p-2">{b.recipients_count}</td>
                    <td className="p-2">{b.sent_count}</td>
                    <td className="p-2 whitespace-nowrap">{when(b.created_at)}</td>
                  </tr>
                )
              })}
            </Table>
          )}

          <Pager page={page} shown={past.length} total={pastTotal} onPage={setPage} />
        </div>
      </Card>
    </div>
  )
}
