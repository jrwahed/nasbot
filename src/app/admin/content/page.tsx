'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AdminShell } from '@/components/AdminShell'
import { supabase } from '@/lib/supabase'
import { revalidateSite, loadBannedWords, bannedIn, rejected } from '@/lib/admin'
import { Tabs } from '@/components/admin-ui'
import { PagesEditor } from '@/app/admin/content/pages-editor'

/**
 * محرّر نصوص الموقع.
 *
 * كل نص معروض في نسبوط موجود هنا. التعديل بيتحفظ في copy_strings،
 * وبينعمله revalidate على طول فيبان في الموقع خلال ثواني من غير نشر.
 * الجدول عليه trigger بيسجّل كل نسخة قديمة في copy_history، فالرجوع ممكن دايمًا.
 */

interface Row {
  key: string
  value_ar: string
  screen: string
  context_ar: string | null
  updated_at: string
}

interface HistoryRow {
  id: string
  value_ar: string
  changed_at: string
}

const fmt = (iso: string) =>
  new Date(iso).toLocaleString('ar-EG', {
    timeZone: 'Africa/Cairo',
    dateStyle: 'short',
    timeStyle: 'short',
  })

/**
 * تبويبين: «النصوص» (مفاتيح `copy_strings`) و«صفحات الموقع»
 * (`content_pages` + `content_blocks` — القواعد والأسئلة ومين إحنا والشروط).
 *
 * الفرق: النصوص مفاتيح ثابتة العدد، والصفحات قوايم متغيّرة الطول —
 * المالك بيضيف سؤال جديد من غير ما يحتاج هجرة.
 */
const CONTENT_TABS = [
  { id: 'strings' as const, label: 'النصوص' },
  { id: 'pages' as const, label: 'صفحات الموقع' },
]

export default function AdminContentPage() {
  return (
    <AdminShell title="نصوص الموقع" needs="content.edit">
      {() => <ContentTabs />}
    </AdminShell>
  )
}

function ContentTabs() {
  const [tab, setTab] = useState<'strings' | 'pages'>('strings')
  return (
    <>
      <Tabs tabs={CONTENT_TABS} value={tab} onChange={setTab} />
      {tab === 'strings' ? <Editor /> : <PagesEditor />}
    </>
  )
}

function Editor() {
  const [rows, setRows] = useState<Row[]>([])
  const [banned, setBanned] = useState<string[]>([])
  const [q, setQ] = useState('')
  const [screen, setScreen] = useState('الكل')
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [msg, setMsg] = useState('')
  const [openHistory, setOpenHistory] = useState<string | null>(null)
  const [history, setHistory] = useState<HistoryRow[]>([])
  const [replaceFrom, setReplaceFrom] = useState('')
  const [replaceTo, setReplaceTo] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    const { data } = await supabase()
      .from('copy_strings')
      .select('key, value_ar, screen, context_ar, updated_at')
      .order('screen')
      .order('key')
    setRows((data ?? []) as Row[])
  }, [])

  useEffect(() => {
    reload()
    loadBannedWords().then(setBanned)
  }, [reload])

  const screens = useMemo(
    () => ['الكل', ...Array.from(new Set(rows.map((r) => r.screen)))],
    [rows]
  )

  const shown = useMemo(() => {
    const needle = q.trim().toLowerCase()
    return rows.filter((r) => {
      if (screen !== 'الكل' && r.screen !== screen) return false
      if (!needle) return true
      return (
        r.key.toLowerCase().includes(needle) ||
        r.value_ar.toLowerCase().includes(needle) ||
        (r.context_ar ?? '').toLowerCase().includes(needle)
      )
    })
  }, [rows, q, screen])

  const flash = (m: string) => {
    setMsg(m)
    setTimeout(() => setMsg(''), 3500)
  }

  async function save(key: string, value: string) {
    const bad = bannedIn(value, banned)
    if (bad.length) {
      flash(`النص فيه كلمة ممنوعة: ${bad.join('، ')}`)
      return
    }
    setSaving((s) => ({ ...s, [key]: true }))
    const { data, error } = await supabase()
      .from('copy_strings')
      .update({ value_ar: value })
      .eq('key', key)
      .select('key')
    setSaving((s) => ({ ...s, [key]: false }))

    if (error) {
      flash(`مقدرناش نحفظ: ${error.message}`)
      return
    }
    if (rejected(data)) {
      flash('مااتحفظش — القاعدة رفضت الكتابة، محتاج صلاحية copy.edit')
      return
    }
    setRows((rs) => rs.map((r) => (r.key === key ? { ...r, value_ar: value } : r)))
    setDrafts((d) => {
      const n = { ...d }
      delete n[key]
      return n
    })
    const ok = await revalidateSite()
    flash(ok ? 'اتحفظ ✓ وبان في الموقع' : 'اتحفظ ✓ — هيبان خلال أقل من دقيقة')
  }

  async function showHistory(key: string) {
    if (openHistory === key) {
      setOpenHistory(null)
      return
    }
    const { data } = await supabase()
      .from('copy_history')
      .select('id, value_ar, changed_at')
      .eq('copy_key', key)
      .order('changed_at', { ascending: false })
      .limit(20)
    setHistory((data ?? []) as HistoryRow[])
    setOpenHistory(key)
  }

  /** استبدال جماعي — بيعدّل النصوص المعروضة بس، مش كل الجدول */
  async function bulkReplace() {
    if (!replaceFrom) return
    const hits = shown.filter((r) => r.value_ar.includes(replaceFrom))
    if (!hits.length) {
      flash('مفيش نص فيه الكلمة دي في اللي معروض')
      return
    }
    const preview = hits.map((r) => r.value_ar.split(replaceFrom).join(replaceTo))
    const bad = preview.flatMap((v) => bannedIn(v, banned))
    if (bad.length) {
      flash(`الاستبدال هيدخل كلمة ممنوعة: ${Array.from(new Set(bad)).join('، ')}`)
      return
    }
    if (!confirm(`هنغيّر ${hits.length} نص. تمام؟`)) return

    setBusy(true)
    const db = supabase()
    let done = 0
    for (let i = 0; i < hits.length; i++) {
      const { data, error } = await db
        .from('copy_strings')
        .update({ value_ar: preview[i] })
        .eq('key', hits[i].key)
        .select('key')
      if (!error && !rejected(data)) done++
    }
    setBusy(false)
    await reload()
    await revalidateSite()
    if (done === 0) flash(`مااتغيّرش ولا نص — القاعدة رفضت الكتابة، محتاج صلاحية copy.edit`)
    else flash(`اتغيّر ${done} من ${hits.length}`)
  }

  function exportJson() {
    const map: Record<string, string> = {}
    for (const r of rows) map[r.key] = r.value_ar
    const blob = new Blob([JSON.stringify(map, null, 2)], {
      type: 'application/json',
    })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = 'nasbot-copy.json'
    a.click()
    URL.revokeObjectURL(a.href)
  }

  async function importJson(file: File) {
    let map: Record<string, string>
    try {
      map = JSON.parse(await file.text())
    } catch {
      flash('الملف مش JSON سليم')
      return
    }
    const known = new Set(rows.map((r) => r.key))
    const changes = Object.entries(map).filter(
      ([k, v]) =>
        known.has(k) && typeof v === 'string' && v !== rows.find((r) => r.key === k)?.value_ar
    )
    if (!changes.length) {
      flash('مفيش أي اختلاف في الملف')
      return
    }
    const bad = changes.flatMap(([, v]) => bannedIn(v, banned))
    if (bad.length) {
      flash(`الملف فيه كلمات ممنوعة: ${Array.from(new Set(bad)).join('، ')}`)
      return
    }
    if (!confirm(`هنغيّر ${changes.length} نص من الملف. تمام؟`)) return

    setBusy(true)
    const db = supabase()
    let done = 0
    for (const [k, v] of changes) {
      const { data, error } = await db
        .from('copy_strings')
        .update({ value_ar: v })
        .eq('key', k)
        .select('key')
      if (!error && !rejected(data)) done++
    }
    setBusy(false)
    await reload()
    await revalidateSite()
    if (done === 0) flash(`مااتغيّرش ولا نص — القاعدة رفضت الكتابة، محتاج صلاحية copy.edit`)
    else flash(`اتغيّر ${done} من ${changes.length}`)
  }

  return (
    <div className="mt-6">
      {/* أدوات فوق */}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
            دوّر في المفاتيح والنصوص
          </span>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="مثلًا: أنا جاي"
            className="min-w-[240px] rounded-14 px-4 py-2 font-body text-16"
            style={{
              background: 'var(--surface)',
              color: 'var(--fg)',
              border: '2px solid var(--line)',
            }}
          />
        </label>

        <label className="flex flex-col gap-1">
          <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
            الشاشة
          </span>
          <select
            value={screen}
            onChange={(e) => setScreen(e.target.value)}
            className="rounded-14 px-4 py-2 font-body text-16"
            style={{
              background: 'var(--surface)',
              color: 'var(--fg)',
              border: '2px solid var(--line)',
            }}
          >
            {screens.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        <div className="font-body text-14" style={{ color: 'var(--muted)' }}>
          {shown.length} من {rows.length}
        </div>

        <div className="ms-auto flex gap-2">
          <button
            type="button"
            onClick={exportJson}
            className="cursor-pointer rounded-pill px-4 py-2 font-display text-15 font-black"
            style={{
              background: 'transparent',
              color: 'var(--fg)',
              border: '2px solid var(--chip-idle-border)',
            }}
          >
            نزّل نسخة
          </button>
          <label
            className="cursor-pointer rounded-pill px-4 py-2 font-display text-15 font-black"
            style={{
              background: 'transparent',
              color: 'var(--fg)',
              border: '2px solid var(--chip-idle-border)',
            }}
          >
            ارفع نسخة
            <input
              type="file"
              accept="application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0]
                if (f) importJson(f)
                e.target.value = ''
              }}
            />
          </label>
        </div>
      </div>

      {/* استبدال جماعي */}
      <div
        className="mt-4 flex flex-wrap items-end gap-3 rounded-16 p-4"
        style={{ background: 'var(--surface)' }}
      >
        <span className="font-display text-16 font-black">استبدال جماعي</span>
        <input
          value={replaceFrom}
          onChange={(e) => setReplaceFrom(e.target.value)}
          placeholder="الكلمة القديمة"
          className="rounded-14 px-3 py-2 font-body text-15"
          style={{ background: 'var(--bg)', color: 'var(--fg)', border: '2px solid var(--line)' }}
        />
        <input
          value={replaceTo}
          onChange={(e) => setReplaceTo(e.target.value)}
          placeholder="الكلمة الجديدة"
          className="rounded-14 px-3 py-2 font-body text-15"
          style={{ background: 'var(--bg)', color: 'var(--fg)', border: '2px solid var(--line)' }}
        />
        <button
          type="button"
          disabled={busy || !replaceFrom}
          onClick={bulkReplace}
          className="cursor-pointer rounded-pill px-4 py-2 font-display text-15 font-black disabled:opacity-50"
          style={{ background: '#F4632A', color: '#14161A', border: 0 }}
        >
          غيّر في المعروض
        </button>
        <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
          بيشتغل على النصوص المعروضة تحت بس — فلتر الأول وشوف.
        </span>
      </div>

      {msg && (
        <div
          className="mt-4 rounded-14 px-4 py-3 font-display text-16 font-black"
          style={{ background: 'var(--surface)' }}
        >
          {msg}
        </div>
      )}

      {/* النصوص */}
      <div className="mt-4 flex flex-col gap-3">
        {shown.map((r) => {
          const draft = drafts[r.key]
          const value = draft ?? r.value_ar
          const dirty = draft !== undefined && draft !== r.value_ar
          const bad = bannedIn(value, banned)
          const long = value.length > 60

          return (
            <div
              key={r.key}
              className="rounded-16 p-4"
              style={{
                background: 'var(--surface)',
                border: `2px solid ${bad.length ? 'var(--err-text)' : 'transparent'}`,
              }}
            >
              <div className="flex flex-wrap items-baseline gap-2">
                <code className="font-body text-13" style={{ color: 'var(--muted)' }}>
                  {r.key}
                </code>
                <span
                  className="rounded-pill px-2 py-[2px] font-body text-12"
                  style={{ background: 'var(--bg)', color: 'var(--muted)' }}
                >
                  {r.screen}
                </span>
                {r.context_ar && (
                  <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
                    — {r.context_ar}
                  </span>
                )}
                <span
                  className="ms-auto font-body text-12"
                  style={{ color: 'var(--muted)' }}
                >
                  آخر تعديل {fmt(r.updated_at)}
                </span>
              </div>

              {long ? (
                <textarea
                  value={value}
                  rows={3}
                  onChange={(e) => setDrafts((d) => ({ ...d, [r.key]: e.target.value }))}
                  className="mt-2 w-full rounded-14 px-3 py-2 font-body text-16"
                  style={{
                    background: 'var(--bg)',
                    color: 'var(--fg)',
                    border: '2px solid var(--line)',
                  }}
                />
              ) : (
                <input
                  value={value}
                  onChange={(e) => setDrafts((d) => ({ ...d, [r.key]: e.target.value }))}
                  className="mt-2 w-full rounded-14 px-3 py-2 font-body text-16"
                  style={{
                    background: 'var(--bg)',
                    color: 'var(--fg)',
                    border: '2px solid var(--line)',
                  }}
                />
              )}

              {bad.length > 0 && (
                <div className="mt-1 font-body text-13" style={{ color: 'var(--err-text)' }}>
                  فيه كلمة ممنوعة: {bad.join('، ')}
                </div>
              )}

              {value.includes('{{') && (
                <div className="mt-1 font-body text-13" style={{ color: 'var(--muted)' }}>
                  اللي بين {'{{ }}'} بيتملي لوحده — سيبه زي ما هو.
                </div>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  disabled={!dirty || Boolean(saving[r.key]) || bad.length > 0}
                  onClick={() => save(r.key, value)}
                  className="cursor-pointer rounded-pill px-4 py-[6px] font-display text-15 font-black disabled:opacity-40"
                  style={{ background: '#F4632A', color: '#14161A', border: 0 }}
                >
                  {saving[r.key] ? 'ثانية واحدة…' : 'احفظ'}
                </button>

                {dirty && (
                  <button
                    type="button"
                    onClick={() =>
                      setDrafts((d) => {
                        const n = { ...d }
                        delete n[r.key]
                        return n
                      })
                    }
                    className="cursor-pointer rounded-pill px-4 py-[6px] font-display text-15 font-black"
                    style={{
                      background: 'transparent',
                      color: 'var(--fg)',
                      border: '2px solid var(--chip-idle-border)',
                    }}
                  >
                    ارجع زي ما كان
                  </button>
                )}

                <button
                  type="button"
                  onClick={() => showHistory(r.key)}
                  className="cursor-pointer bg-transparent p-0 font-body text-14 underline"
                  style={{ color: 'var(--accent-text)', border: 0 }}
                >
                  {openHistory === r.key ? 'اقفل النسخ القديمة' : 'النسخ القديمة'}
                </button>
              </div>

              {openHistory === r.key && (
                <div className="mt-3 flex flex-col gap-2">
                  {history.length === 0 && (
                    <span className="font-body text-14" style={{ color: 'var(--muted)' }}>
                      مفيش نسخ قديمة للنص ده.
                    </span>
                  )}
                  {history.map((h) => (
                    <div
                      key={h.id}
                      className="flex flex-wrap items-center gap-2 rounded-14 px-3 py-2"
                      style={{ background: 'var(--bg)' }}
                    >
                      <span className="font-body text-15">{h.value_ar}</span>
                      <span
                        className="font-body text-12"
                        style={{ color: 'var(--muted)' }}
                      >
                        {fmt(h.changed_at)}
                      </span>
                      <button
                        type="button"
                        onClick={() => save(r.key, h.value_ar)}
                        className="ms-auto cursor-pointer rounded-pill px-3 py-[4px] font-display text-14 font-black"
                        style={{
                          background: 'transparent',
                          color: 'var(--fg)',
                          border: '2px solid var(--chip-idle-border)',
                        }}
                      >
                        رجّع دي
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        })}

        {shown.length === 0 && (
          <div className="font-body text-16" style={{ color: 'var(--muted)' }}>
            مفيش نص بالفلتر ده.
          </div>
        )}
      </div>
    </div>
  )
}
