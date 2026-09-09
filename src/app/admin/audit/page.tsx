'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AdminShell } from '@/components/AdminShell'
import { supabase } from '@/lib/supabase'
import {
  ADMIN_PAGE_SIZE,
  ADMIN_SCAN_MAX,
  Card,
  Btn,
  Pager,
  SelectField,
  Table,
  Empty,
  Loading,
  Tag,
  Stat,
  cairoDayStart,
  dayAdd,
  todayCairo,
  useFlash,
  when,
} from '@/components/admin-ui'

/**
 * السجل: كل حاجة اتعملت من اللوحة.
 *
 * الصفحة دي بتقرا بس — مفيش أي تعديل هنا، ولا المفروض يكون.
 * الجدول نفسه مقفول على القراءة للإدارة في RLS، ومفيش سياسة كتابة من المتصفح.
 *
 * الترقيم من القاعدة: كل فلتر (مين · العملية · الجدول · من يوم · لحد يوم)
 * بيتحوّل لشرط على الخادم، والصفوف بتتجاب صفحة صفحة بـ range —
 * السجل بيكبر كل يوم ومكانش ينفع نجيبه كله للمتصفح.
 *
 * قوايم الفلاتر (مين/العملية/الجدول) مبنية من مسح لآخر ADMIN_SCAN_MAX سطر،
 * لأن postgrest مفيهوش distinct. فلو عملية قديمة جدًا مش في القايمة، دي السبب.
 *
 * التنزيل CSV بينزّل كل الصفوف اللي بالفلتر ده (مش الصفحة اللي قدامك بس)
 * لحد سقف ADMIN_SCAN_MAX — وبيقولك لو الفلتر أكبر من السقف.
 * وده سجل تصرفات الفريق، مش بيانات أعضاء.
 */

interface LogRow {
  id: string
  actor_id: string | null
  action: string
  entity: string
  entity_id: string | null
  before: unknown
  after: unknown
  ip: string | null
  at: string
}

interface PersonRow {
  id: string
  first_name: string | null
  phone: string
}

const LOG_COLS = 'id, actor_id, action, entity, entity_id, before, after, ip, at'

const pretty = (v: unknown) => {
  if (v === null || v === undefined) return '—'
  try {
    return JSON.stringify(v, null, 2)
  } catch {
    return String(v)
  }
}

const flat = (v: unknown) => {
  if (v === null || v === undefined) return ''
  try {
    return JSON.stringify(v)
  } catch {
    return String(v)
  }
}

/** خانة CSV آمنة */
const cell = (s: string) => `"${String(s).split('"').join('""')}"`

/** شرط فلتر واحد: العملية · العمود · القيمة */
type Cond = ['eq' | 'gte' | 'lt', string, string] | ['is', string, null]

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = []
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size))
  return out
}

export default function AdminAuditPage() {
  return (
    <AdminShell title="السجل" needs="audit.view">
      {() => <AuditLog />}
    </AdminShell>
  )
}

function AuditLog() {
  const [rows, setRows] = useState<LogRow[] | null>(null)
  const [total, setTotal] = useState<number | null>(null)
  const [all, setAll] = useState<number | null>(null)
  const [latest, setLatest] = useState<LogRow | null>(null)
  const [people, setPeople] = useState<Record<string, PersonRow>>({})
  const [options, setOptions] = useState<{ actors: string[]; actions: string[]; entities: string[] }>(
    { actors: [], actions: [], entities: [] }
  )
  const [capped, setCapped] = useState(false)

  const [actor, setActor] = useState('all')
  const [action, setAction] = useState('all')
  const [entity, setEntity] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [page, setPage] = useState(0)

  const [open, setOpen] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const { flash, node: flashNode } = useFlash()

  /**
   * الفلاتر كبيانات — مصدر واحد بيتحط بنفسه على استعلام العرض واستعلام التنزيل،
   * علشان اللي بتشوفه واللي بينزل يفضلوا نفس الحاجة بالظبط.
   */
  const conds = useMemo<Cond[]>(() => {
    const out: Cond[] = []
    if (actor === 'system') out.push(['is', 'actor_id', null])
    else if (actor !== 'all') out.push(['eq', 'actor_id', actor])
    if (action !== 'all') out.push(['eq', 'action', action])
    if (entity !== 'all') out.push(['eq', 'entity', entity])
    if (from) out.push(['gte', 'at', cairoDayStart(from)])
    if (to) out.push(['lt', 'at', cairoDayStart(dayAdd(to, 1))])
    return out
  }, [actor, action, entity, from, to])

  /** أسامي أصحاب الأفعال — بنجيب اللي ظهروا بس، مش جدول الناس كله */
  const loadPeople = useCallback(async (ids: string[]) => {
    const want = Array.from(new Set(ids)).filter(Boolean)
    if (want.length === 0) return
    const db = supabase()
    const map: Record<string, PersonRow> = {}
    for (const part of chunk(want, 100)) {
      const { data } = await db.from('profiles').select('id, first_name, phone').in('id', part)
      for (const p of (data ?? []) as PersonRow[]) map[p.id] = p
    }
    setPeople((old) => ({ ...old, ...map }))
  }, [])

  /** الصفحة اللي قدامك + عدد اللي بالفلتر ده */
  const reload = useCallback(async () => {
    setBusy(true)
    let q = supabase().from('audit_log').select(LOG_COLS, { count: 'exact' })
    for (const [op, col, val] of conds) {
      if (op === 'is') q = q.is(col, val)
      else if (op === 'eq') q = q.eq(col, val)
      else if (op === 'gte') q = q.gte(col, val)
      else q = q.lt(col, val)
    }
    const { data, count, error } = await q
      .order('at', { ascending: false })
      .range(page * ADMIN_PAGE_SIZE, page * ADMIN_PAGE_SIZE + ADMIN_PAGE_SIZE - 1)
    setBusy(false)
    if (error) {
      flash(`مقدرناش نجيب السجل: ${error.message}`)
      setRows([])
      setTotal(0)
      return
    }
    const list = (data ?? []) as unknown as LogRow[]
    setRows(list)
    setTotal(count ?? null)
    loadPeople(list.map((r) => r.actor_id).filter((x): x is string => Boolean(x)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conds, page, loadPeople])

  /** الأرقام اللي فوق + قوايم الفلاتر — مسح واحد محدود بدل ما نجيب الجدول كله */
  const loadMeta = useCallback(async () => {
    const db = supabase()
    const [head, last, scan] = await Promise.all([
      db.from('audit_log').select('id', { count: 'exact', head: true }),
      db.from('audit_log').select(LOG_COLS).order('at', { ascending: false }).limit(1),
      db
        .from('audit_log')
        .select('actor_id, action, entity')
        .order('at', { ascending: false })
        .range(0, ADMIN_SCAN_MAX - 1),
    ])
    setAll(head.count ?? null)
    setLatest((((last.data ?? []) as unknown as LogRow[])[0] ?? null) as LogRow | null)

    const seen = (scan.data ?? []) as { actor_id: string | null; action: string; entity: string }[]
    setCapped(seen.length >= ADMIN_SCAN_MAX)
    setOptions({
      actors: Array.from(new Set(seen.map((r) => r.actor_id ?? 'system'))),
      actions: Array.from(new Set(seen.map((r) => r.action))).sort(),
      entities: Array.from(new Set(seen.map((r) => r.entity))).sort(),
    })
    loadPeople(seen.map((r) => r.actor_id).filter((x): x is string => Boolean(x)))
  }, [loadPeople])

  useEffect(() => {
    reload()
  }, [reload])

  useEffect(() => {
    loadMeta()
  }, [loadMeta])

  const nameOf = useCallback(
    (id: string | null) => {
      if (!id) return 'النظام'
      const p = people[id]
      if (!p) return id.slice(0, 8)
      return p.first_name?.trim() || p.phone
    },
    [people]
  )

  const actors = useMemo(
    () => [
      { value: 'all', label: 'أي حد' },
      ...options.actors.map((id) => ({
        value: id,
        label: id === 'system' ? 'النظام' : nameOf(id),
      })),
    ],
    [options.actors, nameOf]
  )

  const actions = useMemo(
    () => [
      { value: 'all', label: 'أي حاجة' },
      ...options.actions.map((a) => ({ value: a, label: a })),
    ],
    [options.actions]
  )

  const entities = useMemo(
    () => [
      { value: 'all', label: 'أي جدول' },
      ...options.entities.map((e) => ({ value: e, label: e })),
    ],
    [options.entities]
  )

  /** أي تغيير في الفلتر بيرجّعنا لأول صفحة — غير كده تلاقي نفسك في صفحة فاضية */
  const setFilter = (set: (v: string) => void) => (v: string) => {
    setPage(0)
    set(v)
  }

  function reset() {
    setPage(0)
    setActor('all')
    setAction('all')
    setEntity('all')
    setFrom('')
    setTo('')
  }

  /** بينزّل كل اللي بالفلتر ده — مش الصفحة اللي قدامك بس */
  async function exportCsv() {
    if ((total ?? 0) === 0) {
      flash('مفيش صفوف تتنزّل بالفلتر ده.')
      return
    }
    setBusy(true)
    let q = supabase().from('audit_log').select(LOG_COLS)
    for (const [op, col, val] of conds) {
      if (op === 'is') q = q.is(col, val)
      else if (op === 'eq') q = q.eq(col, val)
      else if (op === 'gte') q = q.gte(col, val)
      else q = q.lt(col, val)
    }
    const { data, error } = await q.order('at', { ascending: false }).range(0, ADMIN_SCAN_MAX - 1)
    setBusy(false)
    if (error) {
      flash(`مقدرناش نجهّز الملف: ${error.message}`)
      return
    }
    const list = (data ?? []) as unknown as LogRow[]
    if (list.length === 0) {
      flash('مفيش صفوف تتنزّل بالفلتر ده.')
      return
    }

    const head = ['الوقت', 'مين', 'رقم الحساب', 'العملية', 'الجدول', 'رقم الصف', 'IP', 'قبل', 'بعد']
    const lines = [head.map(cell).join(',')]
    for (const r of list) {
      lines.push(
        [
          when(r.at),
          nameOf(r.actor_id),
          r.actor_id ?? '',
          r.action,
          r.entity,
          r.entity_id ?? '',
          r.ip ?? '',
          flat(r.before),
          flat(r.after),
        ]
          .map(cell)
          .join(',')
      )
    }
    // ﻿ علشان إكسل يقرا العربي صح
    const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `nasbot-audit-${todayCairo()}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
    flash(
      (total ?? 0) > list.length
        ? `نزّلنا ${list.length} سطر — الفلتر فيه ${total} سطر، ضيّقه بالتواريخ علشان تاخدهم كلهم.`
        : `نزّلنا ${list.length} سطر ✓`
    )
  }

  if (rows === null) return <Loading />

  return (
    <div className="mt-6 flex flex-col gap-5">
      <div className="flex flex-wrap gap-3">
        <Stat label="كل اللي مسجّل" value={all === null ? '…' : String(all)} hint="السجل كله" />
        <Stat label="اللي بالفلتر ده" value={total === null ? '…' : String(total)} />
        <Stat
          label="آخر حاجة اتعملت"
          value={latest ? when(latest.at) : '—'}
          hint={latest ? `${nameOf(latest.actor_id)} · ${latest.action}` : undefined}
        />
      </div>

      <Card title="فلتر" hint="الفلتر بيتنفّذ في القاعدة، والتنزيل بيطلّع كل اللي بالفلتر ده.">
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <SelectField label="مين" value={actor} options={actors} onChange={setFilter(setActor)} />
          <SelectField
            label="العملية"
            value={action}
            options={actions}
            onChange={setFilter(setAction)}
          />
          <SelectField
            label="الجدول"
            value={entity}
            options={entities}
            onChange={setFilter(setEntity)}
          />

          <label className="flex flex-col gap-1">
            <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
              من يوم
            </span>
            <input
              type="date"
              value={from}
              onChange={(e) => {
                setPage(0)
                setFrom(e.target.value)
              }}
              className="rounded-14 px-3 py-2 font-body text-15"
              style={{ background: 'var(--bg)', color: 'var(--fg)', border: '2px solid var(--line)' }}
            />
          </label>

          <label className="flex flex-col gap-1">
            <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
              لحد يوم
            </span>
            <input
              type="date"
              value={to}
              onChange={(e) => {
                setPage(0)
                setTo(e.target.value)
              }}
              className="rounded-14 px-3 py-2 font-body text-15"
              style={{ background: 'var(--bg)', color: 'var(--fg)', border: '2px solid var(--line)' }}
            />
          </label>

          <Btn onClick={reset}>شيل الفلتر</Btn>
          <Btn onClick={() => reload()}>حدّث</Btn>
          <div className="ms-auto">
            <Btn kind="primary" onClick={exportCsv} disabled={busy}>
              نزّل CSV ({total ?? 0})
            </Btn>
          </div>
        </div>

        <div className="mt-2 font-body text-12" style={{ color: 'var(--muted)' }}>
          الملف ده سجل تصرفات الفريق على اللوحة — مش بيانات أعضاء. برضه ما تسيبهوش على أي جهاز مش
          بتاعك.
          {capped &&
            ' — قوايم «مين/العملية/الجدول» مبنية من آخر الصفوف بس، فلو حاجة قديمة مش في القايمة استعمل التواريخ.'}
        </div>
      </Card>

      {flashNode}

      <Card title="اللي اتعمل">
        <div className="mt-3">
          {rows.length === 0 ? (
            <Empty>
              {all === 0
                ? 'السجل لسه فاضي. أول ما حد من الفريق يعدّل حاجة هتلاقيها هنا.'
                : 'مفيش سطر بالفلتر ده.'}
            </Empty>
          ) : (
            <Table head={['امتى', 'مين', 'العملية', 'الجدول', 'الصف', 'IP', 'قبل وبعد']}>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--line)' }}>
                  <td className="p-2 whitespace-nowrap">{when(r.at)}</td>
                  <td className="p-2">{nameOf(r.actor_id)}</td>
                  <td className="p-2">
                    <Tag>{r.action}</Tag>
                  </td>
                  <td className="p-2">
                    <code className="text-13">{r.entity}</code>
                  </td>
                  <td className="p-2">
                    <code className="text-12" style={{ color: 'var(--muted)' }}>
                      {r.entity_id ? r.entity_id.slice(0, 8) : '—'}
                    </code>
                  </td>
                  <td className="p-2">
                    <code className="text-12" style={{ color: 'var(--muted)' }}>
                      {r.ip ?? '—'}
                    </code>
                  </td>
                  <td className="p-2">
                    <button
                      type="button"
                      onClick={() => setOpen(open === r.id ? null : r.id)}
                      className="cursor-pointer bg-transparent p-0 font-body text-14 underline"
                      style={{ color: 'var(--accent-text)', border: 0 }}
                    >
                      {open === r.id ? 'اقفل' : 'افتح'}
                    </button>
                    {open === r.id && (
                      <div className="mt-2 grid gap-2 md:grid-cols-2">
                        <div className="rounded-14 p-2" style={{ background: 'var(--bg)' }}>
                          <div className="font-display text-14 font-black">قبل</div>
                          <pre
                            className="m-0 mt-1 overflow-x-auto font-body text-12"
                            style={{ color: 'var(--muted)', whiteSpace: 'pre-wrap', direction: 'ltr', textAlign: 'left' }}
                          >
                            {pretty(r.before)}
                          </pre>
                        </div>
                        <div className="rounded-14 p-2" style={{ background: 'var(--bg)' }}>
                          <div className="font-display text-14 font-black">بعد</div>
                          <pre
                            className="m-0 mt-1 overflow-x-auto font-body text-12"
                            style={{ color: 'var(--muted)', whiteSpace: 'pre-wrap', direction: 'ltr', textAlign: 'left' }}
                          >
                            {pretty(r.after)}
                          </pre>
                        </div>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          )}
        </div>

        <Pager page={page} shown={rows.length} total={total} onPage={setPage} busy={busy} />
      </Card>
    </div>
  )
}
