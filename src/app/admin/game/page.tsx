'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AdminShell } from '@/components/AdminShell'
import { GAME_ICON_LABELS, iconFor } from '@/components/game-icons'
import { supabase } from '@/lib/supabase'
import { scoreAnswers, type GameConfig } from '@/lib/game-config'
import { getGameConfig } from '@/lib/api'
import type { GameAnswers } from '@/types'

/**
 * محرّر لعبة «مين جاي؟».
 *
 * الأسئلة والاختيارات والنقاط والأنواع كلها بتتعدّل من هنا وبتبان في اللعبة
 * على طول — اللعبة بتقرا من القاعدة في كل مرة تتفتح.
 *
 * المنطق نفسه (إزاي بنجمع النقاط وإزاي بنكسر التعادل) موجود في الكود
 * في src/lib/game-config.ts — الأوزان بس هي اللي بتتعدّل من هنا.
 */

interface QRow {
  id: string
  order: number
  question_ar: string
  kind: string
  required: boolean
  is_active: boolean
  progress_label_ar: string | null
  placeholder_ar: string | null
}

interface ORow {
  id: string
  question_id: string
  order: number
  label_ar: string
  icon_key: string | null
  value: string
  is_active: boolean
}

interface TRow {
  key: string
  name_ar: string
  name_ar_f: string
  line_ar: string
  sticker_bg: string
  sticker_fg: string
  order: number
  is_active: boolean
}

type ScoreMap = Record<string, Record<string, number>> // option_id → type_key → points

const KINDS = [
  { id: 'single', label: 'اختيار واحد' },
  { id: 'multi', label: 'أكتر من اختيار' },
  { id: 'text', label: 'كتابة حرة' },
]

const TABS = [
  { id: 'questions', label: 'الأسئلة والنقاط' },
  { id: 'types', label: 'الأنواع' },
  { id: 'sim', label: 'جرّب واتفرّج على الحساب' },
  { id: 'stats', label: 'الأرقام' },
] as const
type TabId = (typeof TABS)[number]['id']

export default function AdminGamePage() {
  return (
    <AdminShell title="اللعبة" needs="game.edit">
      {() => <GameEditor />}
    </AdminShell>
  )
}

function GameEditor() {
  const [tab, setTab] = useState<TabId>('questions')
  const [questions, setQuestions] = useState<QRow[]>([])
  const [options, setOptions] = useState<ORow[]>([])
  const [types, setTypes] = useState<TRow[]>([])
  const [scores, setScores] = useState<ScoreMap>({})
  const [msg, setMsg] = useState('')
  const [loading, setLoading] = useState(true)

  const flash = (m: string) => {
    setMsg(m)
    setTimeout(() => setMsg(''), 3000)
  }

  const reload = useCallback(async () => {
    const db = supabase()
    const [q, o, t, s] = await Promise.all([
      db.from('game_questions').select('*').order('order'),
      db.from('game_options').select('*').order('order'),
      db.from('personality_types').select('*').order('order'),
      db.from('game_option_scores').select('option_id, type_key, points'),
    ])
    setQuestions((q.data ?? []) as QRow[])
    setOptions((o.data ?? []) as ORow[])
    setTypes((t.data ?? []) as TRow[])

    const map: ScoreMap = {}
    for (const row of (s.data ?? []) as { option_id: string; type_key: string; points: number }[]) {
      map[row.option_id] ??= {}
      map[row.option_id][row.type_key] = row.points
    }
    setScores(map)
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  if (loading) {
    return (
      <div className="mt-8 font-body text-16" style={{ color: 'var(--muted)' }}>
        ثانية واحدة…
      </div>
    )
  }

  return (
    <div className="mt-6">
      <div className="nb-scroll-x gap-2">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            aria-pressed={tab === t.id}
            className="cursor-pointer whitespace-nowrap rounded-pill px-4 py-2 font-display text-15 font-black"
            style={{
              background: tab === t.id ? 'var(--fg)' : 'transparent',
              color: tab === t.id ? 'var(--bg)' : 'var(--fg)',
              border: `2px solid ${tab === t.id ? 'var(--fg)' : 'var(--chip-idle-border)'}`,
            }}
          >
            {t.label}
          </button>
        ))}
        <Link
          href="/game"
          target="_blank"
          className="ms-auto whitespace-nowrap rounded-pill px-4 py-2 font-display text-15 font-black no-underline"
          style={{ background: '#F4632A', color: '#14161A' }}
        >
          افتح اللعبة ↗
        </Link>
      </div>

      {msg && (
        <div
          className="mt-4 rounded-14 px-4 py-3 font-display text-16 font-black"
          style={{ background: 'var(--surface)' }}
        >
          {msg}
        </div>
      )}

      {tab === 'questions' && (
        <Questions
          questions={questions}
          options={options}
          types={types}
          scores={scores}
          reload={reload}
          flash={flash}
        />
      )}
      {tab === 'types' && <Types types={types} reload={reload} flash={flash} />}
      {tab === 'sim' && <Simulator />}
      {tab === 'stats' && <Stats types={types} />}
    </div>
  )
}

/* ============================================================ الأسئلة */

function Questions({
  questions,
  options,
  types,
  scores,
  reload,
  flash,
}: {
  questions: QRow[]
  options: ORow[]
  types: TRow[]
  scores: ScoreMap
  reload: () => Promise<void>
  flash: (m: string) => void
}) {
  const [dragId, setDragId] = useState<string | null>(null)

  const activeTypes = types.filter((t) => t.is_active)

  async function patchQuestion(id: string, patch: Partial<QRow>) {
    const { error } = await supabase().from('game_questions').update(patch).eq('id', id)
    if (error) return flash(`مقدرناش: ${error.message}`)
    await reload()
  }

  async function patchOption(id: string, patch: Partial<ORow>) {
    const { error } = await supabase().from('game_options').update(patch).eq('id', id)
    if (error) return flash(`مقدرناش: ${error.message}`)
    await reload()
  }

  /** بيحط السؤال المسحوب مكان اللي وقع عليه، وبيرقّم الكل من أول واحد */
  async function moveQuestion(fromId: string, toId: string) {
    if (fromId === toId) return
    const list = [...questions]
    const from = list.findIndex((q) => q.id === fromId)
    const to = list.findIndex((q) => q.id === toId)
    if (from < 0 || to < 0) return
    const [moved] = list.splice(from, 1)
    list.splice(to, 0, moved)

    const db = supabase()
    for (let i = 0; i < list.length; i++) {
      if (list[i].order === i + 1) continue
      await db.from('game_questions').update({ order: i + 1 }).eq('id', list[i].id)
    }
    await reload()
    flash('الترتيب اتغيّر ✓')
  }

  async function nudge(id: string, dir: -1 | 1) {
    const i = questions.findIndex((q) => q.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= questions.length) return
    await moveQuestion(id, questions[j].id)
  }

  async function addQuestion() {
    const { error } = await supabase()
      .from('game_questions')
      .insert({
        order: questions.length + 1,
        question_ar: 'سؤال جديد',
        kind: 'single',
        required: true,
        is_active: false,
        progress_label_ar: 'خلاص تقريبًا',
      })
    if (error) return flash(`مقدرناش: ${error.message}`)
    await reload()
    flash('اتزاد سؤال — مقفول لحد ما تكمّله')
  }

  async function addOption(questionId: string) {
    const count = options.filter((o) => o.question_id === questionId).length
    const { error } = await supabase().from('game_options').insert({
      question_id: questionId,
      order: count + 1,
      label_ar: 'اختيار جديد',
      value: `اختيار ${count + 1}`,
      icon_key: 'mood',
      is_active: true,
    })
    if (error) return flash(`مقدرناش: ${error.message}`)
    await reload()
  }

  async function removeOption(id: string) {
    if (!confirm('هنمسح الاختيار ده ونقطه. تمام؟')) return
    const db = supabase()
    await db.from('game_option_scores').delete().eq('option_id', id)
    const { error } = await db.from('game_options').delete().eq('id', id)
    if (error) return flash(`مقدرناش: ${error.message}`)
    await reload()
  }

  async function setScore(optionId: string, typeKey: string, points: number | null) {
    const db = supabase()
    if (points === null) {
      await db
        .from('game_option_scores')
        .delete()
        .eq('option_id', optionId)
        .eq('type_key', typeKey)
    } else {
      await db
        .from('game_option_scores')
        .upsert({ option_id: optionId, type_key: typeKey, points }, { onConflict: 'option_id,type_key' })
    }
    await reload()
  }

  return (
    <div className="mt-5">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={addQuestion}
          className="cursor-pointer rounded-pill px-4 py-2 font-display text-15 font-black"
          style={{ background: '#F4632A', color: '#14161A', border: 0 }}
        >
          زوّد سؤال
        </button>
        <span className="font-body text-14" style={{ color: 'var(--muted)' }}>
          اسحب السؤال من ⠿ علشان ترتّبه، أو استعمل الأسهم.
        </span>
      </div>

      <div className="mt-4 flex flex-col gap-4">
        {questions.map((q, i) => {
          const opts = options
            .filter((o) => o.question_id === q.id)
            .sort((a, b) => a.order - b.order)

          return (
            <section
              key={q.id}
              draggable
              onDragStart={() => setDragId(q.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragId) moveQuestion(dragId, q.id)
                setDragId(null)
              }}
              className="rounded-20 p-4"
              style={{
                background: 'var(--surface)',
                opacity: q.is_active ? 1 : 0.6,
                border: `2px solid ${dragId === q.id ? '#F4632A' : 'transparent'}`,
              }}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="cursor-grab font-display text-20" title="اسحب علشان ترتّب">
                  ⠿
                </span>
                <span className="font-display text-18 font-black">س{i + 1}</span>

                <button
                  type="button"
                  onClick={() => nudge(q.id, -1)}
                  disabled={i === 0}
                  aria-label="فوق"
                  className="cursor-pointer rounded-pill px-2 py-[2px] disabled:opacity-30"
                  style={{ background: 'var(--bg)', color: 'var(--fg)', border: 0 }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => nudge(q.id, 1)}
                  disabled={i === questions.length - 1}
                  aria-label="تحت"
                  className="cursor-pointer rounded-pill px-2 py-[2px] disabled:opacity-30"
                  style={{ background: 'var(--bg)', color: 'var(--fg)', border: 0 }}
                >
                  ↓
                </button>

                <label className="ms-auto flex items-center gap-2 font-body text-14">
                  <input
                    type="checkbox"
                    checked={q.is_active}
                    onChange={(e) => patchQuestion(q.id, { is_active: e.target.checked })}
                  />
                  شغّال
                </label>
                <label className="flex items-center gap-2 font-body text-14">
                  <input
                    type="checkbox"
                    checked={q.required}
                    onChange={(e) => patchQuestion(q.id, { required: e.target.checked })}
                  />
                  إجباري
                </label>
              </div>

              <input
                defaultValue={q.question_ar}
                onBlur={(e) =>
                  e.target.value !== q.question_ar &&
                  patchQuestion(q.id, { question_ar: e.target.value })
                }
                className="mt-3 w-full rounded-14 px-3 py-2 font-display text-18 font-black"
                style={{
                  background: 'var(--bg)',
                  color: 'var(--fg)',
                  border: '2px solid var(--line)',
                }}
              />

              <div className="mt-2 flex flex-wrap gap-3">
                <label className="flex flex-col gap-1">
                  <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
                    نوع السؤال
                  </span>
                  <select
                    value={q.kind}
                    onChange={(e) => patchQuestion(q.id, { kind: e.target.value })}
                    className="rounded-14 px-3 py-2 font-body text-15"
                    style={{
                      background: 'var(--bg)',
                      color: 'var(--fg)',
                      border: '2px solid var(--line)',
                    }}
                  >
                    {KINDS.map((k) => (
                      <option key={k.id} value={k.id}>
                        {k.label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="flex flex-col gap-1">
                  <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
                    سطر التقدم
                  </span>
                  <input
                    defaultValue={q.progress_label_ar ?? ''}
                    onBlur={(e) =>
                      patchQuestion(q.id, { progress_label_ar: e.target.value })
                    }
                    className="rounded-14 px-3 py-2 font-body text-15"
                    style={{
                      background: 'var(--bg)',
                      color: 'var(--fg)',
                      border: '2px solid var(--line)',
                    }}
                  />
                </label>

                {q.kind === 'text' && (
                  <label className="flex flex-col gap-1">
                    <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
                      النص الباهت في الخانة
                    </span>
                    <input
                      defaultValue={q.placeholder_ar ?? ''}
                      onBlur={(e) => patchQuestion(q.id, { placeholder_ar: e.target.value })}
                      className="rounded-14 px-3 py-2 font-body text-15"
                      style={{
                        background: 'var(--bg)',
                        color: 'var(--fg)',
                        border: '2px solid var(--line)',
                      }}
                    />
                  </label>
                )}
              </div>

              {/* شبكة النقاط */}
              {q.kind !== 'text' && (
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full border-collapse font-body text-14">
                    <thead>
                      <tr>
                        <th className="p-2 text-start font-display text-15">الاختيار</th>
                        <th className="p-2 text-start font-display text-15">الأيقونة</th>
                        {activeTypes.map((t) => (
                          <th key={t.key} className="p-2 text-center font-display text-14">
                            {t.name_ar}
                          </th>
                        ))}
                        <th className="p-2"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {opts.map((o) => {
                        const Icon = iconFor(o.icon_key ?? 'mood')
                        return (
                          <tr key={o.id} style={{ opacity: o.is_active ? 1 : 0.5 }}>
                            <td className="p-2">
                              <input
                                defaultValue={o.label_ar}
                                onBlur={(e) => {
                                  const v = e.target.value
                                  if (v === o.label_ar) return
                                  // القيمة المخزّنة بتتبع النص علشان الإجابات القديمة تفضل مفهومة
                                  patchOption(o.id, { label_ar: v, value: v })
                                }}
                                className="w-full min-w-[150px] rounded-12 px-2 py-1 font-body text-15"
                                style={{
                                  background: 'var(--bg)',
                                  color: 'var(--fg)',
                                  border: '2px solid var(--line)',
                                }}
                              />
                            </td>
                            <td className="p-2">
                              <div className="flex items-center gap-2">
                                <Icon size={22} stroke="currentColor" />
                                <select
                                  value={o.icon_key ?? 'mood'}
                                  onChange={(e) => patchOption(o.id, { icon_key: e.target.value })}
                                  className="rounded-12 px-2 py-1 font-body text-14"
                                  style={{
                                    background: 'var(--bg)',
                                    color: 'var(--fg)',
                                    border: '2px solid var(--line)',
                                  }}
                                >
                                  {Object.entries(GAME_ICON_LABELS).map(([k, label]) => (
                                    <option key={k} value={k}>
                                      {label}
                                    </option>
                                  ))}
                                </select>
                              </div>
                            </td>
                            {activeTypes.map((t) => {
                              const v = scores[o.id]?.[t.key]
                              return (
                                <td key={t.key} className="p-2 text-center">
                                  <input
                                    type="number"
                                    min={0}
                                    max={9}
                                    value={v ?? ''}
                                    placeholder="—"
                                    onChange={(e) => {
                                      const raw = e.target.value
                                      setScore(o.id, t.key, raw === '' ? null : Number(raw))
                                    }}
                                    className="w-[52px] rounded-12 px-2 py-1 text-center font-body text-15"
                                    style={{
                                      background: 'var(--bg)',
                                      color: 'var(--fg)',
                                      border: '2px solid var(--line)',
                                    }}
                                  />
                                </td>
                              )
                            })}
                            <td className="p-2 text-center">
                              <button
                                type="button"
                                onClick={() => removeOption(o.id)}
                                aria-label="امسح الاختيار"
                                className="cursor-pointer bg-transparent font-display text-16"
                                style={{ color: 'var(--err-text)', border: 0 }}
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                  </table>

                  <div className="mt-2 flex flex-wrap items-center gap-3">
                    <button
                      type="button"
                      onClick={() => addOption(q.id)}
                      className="cursor-pointer rounded-pill px-3 py-[6px] font-display text-14 font-black"
                      style={{
                        background: 'transparent',
                        color: 'var(--fg)',
                        border: '2px solid var(--chip-idle-border)',
                      }}
                    >
                      زوّد اختيار
                    </button>
                    <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
                      فاضي = ما بيأثرش · صفر = بيرجّح النوع عند التعادل بس · 1 وفوق = نقط فعلية
                    </span>
                  </div>
                </div>
              )}
            </section>
          )
        })}
      </div>
    </div>
  )
}

/* ============================================================ الأنواع */

function Types({
  types,
  reload,
  flash,
}: {
  types: TRow[]
  reload: () => Promise<void>
  flash: (m: string) => void
}) {
  async function patch(key: string, p: Partial<TRow>) {
    const { error } = await supabase().from('personality_types').update(p).eq('key', key)
    if (error) return flash(`مقدرناش: ${error.message}`)
    await reload()
  }

  return (
    <div className="mt-5 flex flex-col gap-4">
      <p className="m-0 font-body text-14" style={{ color: 'var(--muted)' }}>
        الترتيب هنا مهم: لو نوعين تعادلوا ومفيش ترجيح، الأول في القايمة هو اللي بيكسب.
      </p>

      {types.map((t) => (
        <div
          key={t.key}
          className="rounded-20 p-4"
          style={{ background: 'var(--surface)', opacity: t.is_active ? 1 : 0.6 }}
        >
          <div className="flex flex-wrap items-center gap-3">
            <span
              className="rounded-pill px-3 py-1 font-display text-15 font-black"
              style={{ background: t.sticker_bg, color: t.sticker_fg }}
            >
              {t.name_ar}
            </span>
            <code className="font-body text-13" style={{ color: 'var(--muted)' }}>
              {t.key}
            </code>
            <label className="ms-auto flex items-center gap-2 font-body text-14">
              <input
                type="checkbox"
                checked={t.is_active}
                onChange={(e) => patch(t.key, { is_active: e.target.checked })}
              />
              شغّال
            </label>
            <label className="flex items-center gap-2 font-body text-14">
              الترتيب
              <input
                type="number"
                min={1}
                defaultValue={t.order}
                onBlur={(e) => patch(t.key, { order: Number(e.target.value) })}
                className="w-[60px] rounded-12 px-2 py-1 text-center font-body text-15"
                style={{
                  background: 'var(--bg)',
                  color: 'var(--fg)',
                  border: '2px solid var(--line)',
                }}
              />
            </label>
          </div>

          <div className="mt-3 grid gap-3 md:grid-cols-2">
            <Field
              label="الاسم (مذكر)"
              value={t.name_ar}
              onSave={(v) => patch(t.key, { name_ar: v })}
            />
            <Field
              label="الاسم (مؤنث)"
              value={t.name_ar_f}
              onSave={(v) => patch(t.key, { name_ar_f: v })}
            />
          </div>

          <Field
            label="الجملة اللي بتظهر تحت الاسم"
            value={t.line_ar}
            onSave={(v) => patch(t.key, { line_ar: v })}
          />

          <div className="mt-3 flex flex-wrap gap-4">
            <label className="flex items-center gap-2 font-body text-14">
              لون الخلفية
              <input
                type="color"
                defaultValue={t.sticker_bg}
                onBlur={(e) => patch(t.key, { sticker_bg: e.target.value })}
                className="h-8 w-12 cursor-pointer rounded-12"
                style={{ border: '2px solid var(--line)' }}
              />
            </label>
            <label className="flex items-center gap-2 font-body text-14">
              لون الكلام
              <input
                type="color"
                defaultValue={t.sticker_fg}
                onBlur={(e) => patch(t.key, { sticker_fg: e.target.value })}
                className="h-8 w-12 cursor-pointer rounded-12"
                style={{ border: '2px solid var(--line)' }}
              />
            </label>
          </div>
        </div>
      ))}
    </div>
  )
}

function Field({
  label,
  value,
  onSave,
}: {
  label: string
  value: string
  onSave: (v: string) => void
}) {
  return (
    <label className="mt-3 flex flex-col gap-1">
      <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
        {label}
      </span>
      <input
        defaultValue={value}
        onBlur={(e) => e.target.value !== value && onSave(e.target.value)}
        className="w-full rounded-14 px-3 py-2 font-body text-16"
        style={{ background: 'var(--bg)', color: 'var(--fg)', border: '2px solid var(--line)' }}
      />
    </label>
  )
}

/* ============================================================ المحاكي */

function Simulator() {
  const [cfg, setCfg] = useState<GameConfig | null>(null)
  const [answers, setAnswers] = useState<GameAnswers>({})

  useEffect(() => {
    getGameConfig().then(setCfg)
  }, [])

  const result = useMemo(() => (cfg ? scoreAnswers(cfg, answers) : null), [cfg, answers])

  if (!cfg) {
    return (
      <div className="mt-6 font-body text-16" style={{ color: 'var(--muted)' }}>
        ثانية واحدة…
      </div>
    )
  }

  const pick = (slot: string, value: string, multi: boolean) => {
    setAnswers((a) => {
      const cur = (a as Record<string, unknown>)[slot]
      if (!multi) return { ...a, [slot]: cur === value ? undefined : value }
      const list = Array.isArray(cur) ? (cur as string[]) : []
      return {
        ...a,
        [slot]: list.includes(value) ? list.filter((x) => x !== value) : [...list, value],
      }
    })
  }

  return (
    <div className="mt-5 grid gap-6 lg:grid-cols-[1fr_360px]">
      <div className="flex flex-col gap-4">
        {cfg.questions
          .filter((q) => q.kind !== 'text')
          .map((q) => {
            const cur = (answers as Record<string, unknown>)[q.slot]
            return (
              <div key={q.id} className="rounded-16 p-4" style={{ background: 'var(--surface)' }}>
                <div className="font-display text-16 font-black">{q.text}</div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {q.options.map((o) => {
                    const on = Array.isArray(cur)
                      ? (cur as string[]).includes(o.value)
                      : cur === o.value
                    const pts = Object.entries(o.scores)
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => pick(q.slot, o.value, q.kind === 'multi')}
                        className="cursor-pointer rounded-14 px-3 py-2 text-start font-body text-14"
                        style={{
                          background: on ? '#F4632A' : 'var(--bg)',
                          color: on ? '#14161A' : 'var(--fg)',
                          border: `2px solid ${on ? '#F4632A' : 'var(--line)'}`,
                        }}
                      >
                        <div className="font-display text-15 font-black">{o.label}</div>
                        <div className="text-12" style={{ opacity: 0.75 }}>
                          {pts.length
                            ? pts.map(([k, v]) => `${k} ${v === 0 ? '(ترجيح)' : `+${v}`}`).join(' · ')
                            : 'ما بيأثرش'}
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>
            )
          })}
      </div>

      {/* الحساب خطوة بخطوة */}
      <aside
        className="h-fit rounded-20 p-4 lg:sticky lg:top-4"
        style={{ background: 'var(--surface)' }}
      >
        <div className="font-display text-20 font-black">الحساب</div>

        <table className="mt-3 w-full border-collapse font-body text-15">
          <tbody>
            {cfg.types.map((t) => {
              const v = result?.totals[t.key] ?? 0
              const win = result?.type.key === t.key
              const tied = result?.tied.includes(t.key)
              return (
                <tr key={t.key}>
                  <td className="py-1">
                    <span
                      className="rounded-pill px-2 py-[2px] font-display text-14 font-black"
                      style={{ background: t.bg, color: t.fg }}
                    >
                      {t.name}
                    </span>
                  </td>
                  <td className="py-1 text-end font-display text-18 font-black">
                    {v}
                    {win && ' ★'}
                    {tied && !win && ' ='}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        <div className="mt-3 border-t pt-3 font-body text-14" style={{ borderColor: 'var(--line)' }}>
          {result && (
            <>
              <div>
                النتيجة: <b>{result.type.name}</b>
              </div>
              {result.tied.length > 0 && (
                <div className="mt-1" style={{ color: 'var(--muted)' }}>
                  كان في تعادل ({result.tied.join('، ')}) —{' '}
                  {result.brokeBy === 'bias'
                    ? 'وكسره الترجيح (نقطة صفر).'
                    : 'وكسره ترتيب الأنواع.'}
                </div>
              )}
              {result.tied.length === 0 && (
                <div className="mt-1" style={{ color: 'var(--muted)' }}>
                  مفيش تعادل.
                </div>
              )}
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setAnswers({})}
          className="mt-4 w-full cursor-pointer rounded-pill px-4 py-2 font-display text-15 font-black"
          style={{
            background: 'transparent',
            color: 'var(--fg)',
            border: '2px solid var(--chip-idle-border)',
          }}
        >
          امسح واعيد
        </button>
      </aside>
    </div>
  )
}

/* ============================================================ الأرقام */

interface SessionRow {
  result_type: string | null
  completed_at: string | null
  abandoned_at_question: number | null
  shared_at: string | null
}

function Stats({ types }: { types: TRow[] }) {
  const [rows, setRows] = useState<SessionRow[] | null>(null)

  useEffect(() => {
    supabase()
      .from('game_sessions')
      .select('result_type, completed_at, abandoned_at_question, shared_at')
      .limit(5000)
      .then((res: { data: unknown }) => setRows((res.data ?? []) as SessionRow[]))
  }, [])

  if (!rows) {
    return (
      <div className="mt-6 font-body text-16" style={{ color: 'var(--muted)' }}>
        ثانية واحدة…
      </div>
    )
  }

  const total = rows.length
  const done = rows.filter((r) => r.completed_at).length
  const shared = rows.filter((r) => r.shared_at).length
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0)

  const dropAt: Record<number, number> = {}
  for (const r of rows) {
    if (r.completed_at || r.abandoned_at_question == null) continue
    dropAt[r.abandoned_at_question] = (dropAt[r.abandoned_at_question] ?? 0) + 1
  }

  const byType: Record<string, number> = {}
  for (const r of rows) {
    if (!r.result_type) continue
    byType[r.result_type] = (byType[r.result_type] ?? 0) + 1
  }
  const maxType = Math.max(1, ...Object.values(byType))

  if (total === 0) {
    return (
      <div className="mt-6 font-body text-16" style={{ color: 'var(--muted)' }}>
        لسه محدش لعب. أول ما الناس تبدأ هتلاقي هنا كام واحد خلّص، وفين بيقفوا، وكل نوع طلع كام مرة.
      </div>
    )
  }

  return (
    <div className="mt-5 flex flex-col gap-6">
      <div className="flex flex-wrap gap-3">
        <Stat label="بدأوا" value={String(total)} />
        <Stat label="خلّصوا" value={`${done} (${pct(done)}%)`} />
        <Stat label="سابوها" value={`${total - done} (${pct(total - done)}%)`} />
        <Stat label="شاركوا البطاقة" value={`${shared} (${pct(shared)}%)`} />
      </div>

      <div>
        <div className="font-display text-20 font-black">بيقفوا عند أنهي سؤال</div>
        <div className="mt-2 flex flex-col gap-1">
          {Object.keys(dropAt).length === 0 && (
            <span className="font-body text-15" style={{ color: 'var(--muted)' }}>
              محدش ساب اللعبة في النص.
            </span>
          )}
          {Object.entries(dropAt)
            .sort((a, b) => Number(a[0]) - Number(b[0]))
            .map(([q, n]) => (
              <Bar key={q} label={`س${q}`} n={n} max={Math.max(...Object.values(dropAt))} />
            ))}
        </div>
      </div>

      <div>
        <div className="font-display text-20 font-black">كل نوع طلع كام مرة</div>
        <div className="mt-2 flex flex-col gap-1">
          {types.map((t) => (
            <Bar
              key={t.key}
              label={t.name_ar}
              n={byType[t.key] ?? 0}
              max={maxType}
              color={t.sticker_bg}
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-16 px-4 py-3" style={{ background: 'var(--surface)' }}>
      <div className="font-body text-13" style={{ color: 'var(--muted)' }}>
        {label}
      </div>
      <div className="font-display text-28 font-black">{value}</div>
    </div>
  )
}

function Bar({
  label,
  n,
  max,
  color = '#F4632A',
}: {
  label: string
  n: number
  max: number
  color?: string
}) {
  return (
    <div className="flex items-center gap-3">
      <span className="w-[150px] shrink-0 font-body text-15">{label}</span>
      <div
        className="h-[18px] flex-1 overflow-hidden rounded-pill"
        style={{ background: 'var(--surface)' }}
      >
        <div
          className="h-full rounded-pill"
          style={{ width: `${max ? (n / max) * 100 : 0}%`, background: color }}
        />
      </div>
      <span className="w-[46px] shrink-0 text-end font-display text-16 font-black">{n}</span>
    </div>
  )
}
