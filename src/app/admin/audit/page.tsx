'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AdminShell } from '@/components/AdminShell'
import { supabase } from '@/lib/supabase'
import {
  Card,
  Btn,
  SelectField,
  Table,
  Empty,
  Loading,
  Tag,
  Stat,
  useFlash,
  when,
} from '@/components/admin-ui'

/**
 * السجل: كل حاجة اتعملت من اللوحة.
 *
 * الصفحة دي بتقرا بس — مفيش أي تعديل هنا، ولا المفروض يكون.
 * الجدول نفسه مقفول على القراءة للإدارة في RLS، ومفيش سياسة كتابة من المتصفح.
 *
 * التنزيل CSV بينبني في المتصفح من الصفوف المفلترة اللي قدامك بالظبط —
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

/** تاريخ القاهرة 2026-09-08 — علشان الفلترة تبقى بيوم القاهرة مش يوم المتصفح */
const cairoDay = (iso: string) =>
  new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' })

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

export default function AdminAuditPage() {
  return (
    <AdminShell title="السجل" needs="audit.view">
      {() => <AuditLog />}
    </AdminShell>
  )
}

function AuditLog() {
  const [rows, setRows] = useState<LogRow[] | null>(null)
  const [people, setPeople] = useState<Record<string, PersonRow>>({})
  const [actor, setActor] = useState('all')
  const [action, setAction] = useState('all')
  const [entity, setEntity] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [open, setOpen] = useState<string | null>(null)
  const { flash, node: flashNode } = useFlash()

  const reload = useCallback(async () => {
    const db = supabase()
    const [a, p] = await Promise.all([
      db
        .from('audit_log')
        .select('id, actor_id, action, entity, entity_id, before, after, ip, at')
        .order('at', { ascending: false })
        .limit(2000),
      db.from('profiles').select('id, first_name, phone').limit(2000),
    ])
    setRows((a.data ?? []) as LogRow[])
    const map: Record<string, PersonRow> = {}
    for (const person of (p.data ?? []) as PersonRow[]) map[person.id] = person
    setPeople(map)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const nameOf = useCallback(
    (id: string | null) => {
      if (!id) return 'النظام'
      const p = people[id]
      if (!p) return id.slice(0, 8)
      return p.first_name?.trim() || p.phone
    },
    [people]
  )

  const actors = useMemo(() => {
    const ids = Array.from(new Set((rows ?? []).map((r) => r.actor_id ?? 'system')))
    return [
      { value: 'all', label: 'أي حد' },
      ...ids.map((id) => ({
        value: id,
        label: id === 'system' ? 'النظام' : nameOf(id),
      })),
    ]
  }, [rows, nameOf])

  const actions = useMemo(
    () => [
      { value: 'all', label: 'أي حاجة' },
      ...Array.from(new Set((rows ?? []).map((r) => r.action)))
        .sort()
        .map((a) => ({ value: a, label: a })),
    ],
    [rows]
  )

  const entities = useMemo(
    () => [
      { value: 'all', label: 'أي جدول' },
      ...Array.from(new Set((rows ?? []).map((r) => r.entity)))
        .sort()
        .map((e) => ({ value: e, label: e })),
    ],
    [rows]
  )

  const shown = useMemo(() => {
    return (rows ?? []).filter((r) => {
      if (actor !== 'all' && (r.actor_id ?? 'system') !== actor) return false
      if (action !== 'all' && r.action !== action) return false
      if (entity !== 'all' && r.entity !== entity) return false
      const d = cairoDay(r.at)
      if (from && d < from) return false
      if (to && d > to) return false
      return true
    })
  }, [rows, actor, action, entity, from, to])

  function reset() {
    setActor('all')
    setAction('all')
    setEntity('all')
    setFrom('')
    setTo('')
  }

  /** بينزّل اللي قدامك بالظبط — لا أكتر ولا أقل */
  function exportCsv() {
    if (shown.length === 0) {
      flash('مفيش صفوف تتنزّل بالفلتر ده.')
      return
    }
    const head = ['الوقت', 'مين', 'رقم الحساب', 'العملية', 'الجدول', 'رقم الصف', 'IP', 'قبل', 'بعد']
    const lines = [head.map(cell).join(',')]
    for (const r of shown) {
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
    a.download = `nasbot-audit-${cairoDay(new Date().toISOString())}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
    flash(`نزّلنا ${shown.length} سطر ✓`)
  }

  if (rows === null) return <Loading />

  return (
    <div className="mt-6 flex flex-col gap-5">
      <div className="flex flex-wrap gap-3">
        <Stat label="كل اللي مسجّل" value={String(rows.length)} hint="آخر 2000 سطر" />
        <Stat label="اللي قدامك" value={String(shown.length)} />
        <Stat
          label="آخر حاجة اتعملت"
          value={rows[0] ? when(rows[0].at) : '—'}
          hint={rows[0] ? `${nameOf(rows[0].actor_id)} · ${rows[0].action}` : undefined}
        />
      </div>

      <Card title="فلتر" hint="التنزيل بيطلّع اللي قدامك بالظبط بعد الفلتر.">
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <SelectField label="مين" value={actor} options={actors} onChange={setActor} />
          <SelectField label="العملية" value={action} options={actions} onChange={setAction} />
          <SelectField label="الجدول" value={entity} options={entities} onChange={setEntity} />

          <label className="flex flex-col gap-1">
            <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
              من يوم
            </span>
            <input
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
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
              onChange={(e) => setTo(e.target.value)}
              className="rounded-14 px-3 py-2 font-body text-15"
              style={{ background: 'var(--bg)', color: 'var(--fg)', border: '2px solid var(--line)' }}
            />
          </label>

          <Btn onClick={reset}>شيل الفلتر</Btn>
          <Btn onClick={() => reload()}>حدّث</Btn>
          <div className="ms-auto">
            <Btn kind="primary" onClick={exportCsv}>
              نزّل CSV ({shown.length})
            </Btn>
          </div>
        </div>

        <div className="mt-2 font-body text-12" style={{ color: 'var(--muted)' }}>
          الملف ده سجل تصرفات الفريق على اللوحة — مش بيانات أعضاء. برضه ما تسيبهوش على أي جهاز مش
          بتاعك.
        </div>
      </Card>

      {flashNode}

      <Card title="اللي اتعمل">
        <div className="mt-3">
          {shown.length === 0 ? (
            <Empty>
              {rows.length === 0
                ? 'السجل لسه فاضي. أول ما حد من الفريق يعدّل حاجة هتلاقيها هنا.'
                : 'مفيش سطر بالفلتر ده.'}
            </Empty>
          ) : (
            <Table head={['امتى', 'مين', 'العملية', 'الجدول', 'الصف', 'IP', 'قبل وبعد']}>
              {shown.map((r) => (
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
      </Card>
    </div>
  )
}
