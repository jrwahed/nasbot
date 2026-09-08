'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { AdminShell } from '@/components/AdminShell'
import {
  Btn,
  Card,
  Empty,
  Loading,
  NumberField,
  SelectField,
  Table,
  Tabs,
  Tag,
  TextField,
  Toggle,
  useFlash,
  when,
} from '@/components/admin-ui'
import { supabase } from '@/lib/supabase'
import { revalidateSite, loadBannedWords, bannedIn } from '@/lib/admin'

/**
 * محرّر حقول التسجيل.
 *
 * الأربع جداول اللي هنا هما اللي بيبنوا فورم التسجيل نفسه:
 * profile_fields (الحقول وخطواتها وشروطها) و field_options (اختيارات كل حقل)
 * و skill_activities (نشاطات المهارة) و consents (الموافقات).
 *
 * أي تعديل بيبان للناس الجداد على طول بعد الـ revalidate.
 */

interface FieldRow {
  key: string
  label_ar: string
  help_ar: string | null
  error_ar: string | null
  is_required: boolean
  is_active: boolean
  step: number
  order: number
  validation: Record<string, unknown>
  updated_at: string
}

interface OptionRow {
  id: string
  field_key: string
  value: string
  label_ar: string
  order: number
  is_active: boolean
}

interface SkillRow {
  key: string
  label_ar: string
  order: number
  is_active: boolean
}

interface ConsentRow {
  key: string
  text_ar: string
  version: number
  requires_reconsent: boolean
  published_at: string | null
}

const TABS = [
  { id: 'fields', label: 'الحقول' },
  { id: 'options', label: 'الاختيارات' },
  { id: 'skills', label: 'المهارات' },
  { id: 'consents', label: 'الموافقات' },
] as const
type TabId = (typeof TABS)[number]['id']

/** أسماء الخطوات زي ما بتظهر في التسجيل */
const STEP_LABELS: Record<number, string> = {
  1: 'الخطوة ١ — الرقم',
  2: 'الخطوة ٢ — إنت مين',
  3: 'الخطوة ٣ — بتحب إيه',
  4: 'الخطوة ٤ — اللمسة الأخيرة',
}
const stepLabel = (n: number) => STEP_LABELS[n] ?? `الخطوة ${n}`

const CONSENT_LABELS: Record<string, string> = {
  rules: 'قواعد نسبوط',
  privacy: 'استخدام البيانات',
}

export default function AdminProfileFieldsPage() {
  return (
    <AdminShell title="حقول التسجيل" needs="fields.edit">
      {() => <FieldsEditor />}
    </AdminShell>
  )
}

function FieldsEditor() {
  const [tab, setTab] = useState<TabId>('fields')
  const [fields, setFields] = useState<FieldRow[]>([])
  const [options, setOptions] = useState<OptionRow[]>([])
  const [skills, setSkills] = useState<SkillRow[]>([])
  const [consents, setConsents] = useState<ConsentRow[]>([])
  const [banned, setBanned] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const { flash, node: flashNode } = useFlash()

  const reload = useCallback(async () => {
    const db = supabase()
    const [f, o, s, c] = await Promise.all([
      db.from('profile_fields').select('*').order('step').order('order'),
      db.from('field_options').select('*').order('order'),
      db.from('skill_activities').select('*').order('order'),
      db.from('consents').select('*').order('key'),
    ])
    setFields((f.data ?? []) as FieldRow[])
    setOptions((o.data ?? []) as OptionRow[])
    setSkills((s.data ?? []) as SkillRow[])
    setConsents((c.data ?? []) as ConsentRow[])
    setLoading(false)
  }, [])

  useEffect(() => {
    reload()
    loadBannedWords().then(setBanned)
  }, [reload])

  /** بعد أي حفظ: نعيد التحميل ونخلي الموقع يقرا الجديد */
  const afterWrite = useCallback(
    async (msg = 'اتحفظ ✓') => {
      await reload()
      const ok = await revalidateSite()
      flash(ok ? `${msg} وبان في التسجيل` : `${msg} — هيبان خلال أقل من دقيقة`)
    },
    [reload, flash]
  )

  /** بترجّع true لو النص نضيف */
  const guard = useCallback(
    (text: string) => {
      const bad = bannedIn(text, banned)
      if (bad.length) {
        flash(`النص فيه كلمة ممنوعة: ${bad.join('، ')}`)
        return false
      }
      return true
    },
    [banned, flash]
  )

  if (loading) return <Loading />

  const shared = { flash, afterWrite, guard }

  return (
    <div>
      <div className="mt-5">
        <Card title="الحقول دي هي فورم التسجيل نفسه">
          <p className="mt-2 mb-0 font-body text-14" style={{ color: 'var(--muted)' }}>
            كل حقل هنا بيظهر للي بيسجّل جديد. لو قفلت حقل أو شلت منه «إجباري»، الناس الجديدة مش
            هتتسأل عنه تاني — واللي مسجّلين خلاص بياناتهم بتفضل زي ما هي. غيّر وإنت واخد بالك.
          </p>
        </Card>
      </div>

      <Tabs tabs={[...TABS]} value={tab} onChange={setTab} />

      {flashNode}

      {tab === 'fields' && <FieldsTab fields={fields} options={options} {...shared} />}
      {tab === 'options' && <OptionsTab fields={fields} options={options} {...shared} />}
      {tab === 'skills' && <SkillsTab skills={skills} {...shared} />}
      {tab === 'consents' && <ConsentsTab consents={consents} {...shared} />}
    </div>
  )
}

interface Shared {
  flash: (m: string) => void
  afterWrite: (msg?: string) => Promise<void>
  guard: (text: string) => boolean
}

/* ============================================================ الحقول */

type VKey = 'min' | 'max' | 'pattern'
const V_KEYS: VKey[] = ['min', 'max', 'pattern']

/** الوحدة اللي الرقم بيتقاس بيها — بتفرق حسب الحقل */
function unitOf(fieldKey: string, hasOptions: boolean) {
  if (hasOptions) return 'اختيارات'
  if (fieldKey.includes('year') || fieldKey.includes('birth')) return 'سنة'
  return 'حروف'
}

function vLabel(k: VKey, unit: string) {
  if (k === 'pattern') return 'شكل الإجابة (تقني)'
  if (unit === 'سنة') return k === 'min' ? 'أصغر سنة ميلاد' : 'أكبر سنة ميلاد'
  if (unit === 'اختيارات') return k === 'min' ? 'أقل عدد اختيارات' : 'أكتر عدد اختيارات'
  return k === 'min' ? 'أقل عدد حروف' : 'أكتر عدد حروف'
}

function FieldsTab({
  fields,
  options,
  flash,
  afterWrite,
  guard,
}: Shared & { fields: FieldRow[]; options: OptionRow[] }) {
  const [dragKey, setDragKey] = useState<string | null>(null)

  const steps = useMemo(() => {
    const set = new Set<number>([1, 2, 3, 4])
    for (const f of fields) set.add(f.step)
    return Array.from(set).sort((a, b) => a - b)
  }, [fields])

  const inStep = useCallback(
    (step: number) => fields.filter((f) => f.step === step).sort((a, b) => a.order - b.order),
    [fields]
  )

  async function patch(key: string, p: Partial<FieldRow>, msg?: string) {
    const { error } = await supabase().from('profile_fields').update(p).eq('key', key)
    if (error) return flash(`مقدرناش نحفظ: ${error.message}`)
    await afterWrite(msg)
  }

  /** بيرقّم حقول الخطوة من واحد */
  async function renumber(list: FieldRow[]) {
    const db = supabase()
    for (let i = 0; i < list.length; i++) {
      if (list[i].order === i + 1) continue
      const { error } = await db
        .from('profile_fields')
        .update({ order: i + 1 })
        .eq('key', list[i].key)
      if (error) {
        flash(`مقدرناش نرتّب: ${error.message}`)
        return false
      }
    }
    return true
  }

  /** بيحط الحقل المسحوب مكان اللي وقع عليه — جوه نفس الخطوة */
  async function move(fromKey: string, toKey: string) {
    if (fromKey === toKey) return
    const from = fields.find((f) => f.key === fromKey)
    const to = fields.find((f) => f.key === toKey)
    if (!from || !to) return
    if (from.step !== to.step) {
      flash('السحب جوه الخطوة الواحدة بس — لو عايز تنقله لخطوة تانية غيّر «الخطوة» من فوق.')
      return
    }
    const list = inStep(from.step)
    const i = list.findIndex((f) => f.key === fromKey)
    const j = list.findIndex((f) => f.key === toKey)
    if (i < 0 || j < 0) return
    const [moved] = list.splice(i, 1)
    list.splice(j, 0, moved)
    if (await renumber(list)) await afterWrite('الترتيب اتغيّر ✓')
  }

  async function nudge(key: string, dir: -1 | 1) {
    const f = fields.find((x) => x.key === key)
    if (!f) return
    const list = inStep(f.step)
    const i = list.findIndex((x) => x.key === key)
    const j = i + dir
    if (i < 0 || j < 0 || j >= list.length) return
    await move(key, list[j].key)
  }

  /** نقل الحقل لخطوة تانية — بيروح آخر الخطوة الجديدة */
  async function moveToStep(f: FieldRow, step: number) {
    if (step === f.step) return
    const target = inStep(step)
    const db = supabase()
    const { error } = await db
      .from('profile_fields')
      .update({ step, order: target.length + 1 })
      .eq('key', f.key)
    if (error) return flash(`مقدرناش ننقله: ${error.message}`)
    const rest = inStep(f.step).filter((x) => x.key !== f.key)
    await renumber(rest)
    await afterWrite(`الحقل راح ${stepLabel(step)} ✓`)
  }

  async function setValidation(f: FieldRow, next: Record<string, unknown>) {
    const { error } = await supabase()
      .from('profile_fields')
      .update({ validation: next })
      .eq('key', f.key)
    if (error) return flash(`مقدرناش نحفظ الشرط: ${error.message}`)
    await afterWrite('الشرط اتحفظ ✓')
  }

  return (
    <div className="mt-5 flex flex-col gap-8">
      <p className="m-0 font-body text-14" style={{ color: 'var(--muted)' }}>
        اسحب الحقل من ⠿ علشان ترتّبه جوه خطوته، أو استعمل الأسهم. علشان تنقله لخطوة تانية غيّر
        «الخطوة».
      </p>

      {steps.map((step) => {
        const list = inStep(step)
        return (
          <section key={step}>
            <h2 className="m-0 font-display text-22 font-black">{stepLabel(step)}</h2>
            {list.length === 0 && <Empty>الخطوة دي فاضية — انقل ليها حقل من فوق أو تحت.</Empty>}

            <div className="mt-3 flex flex-col gap-4">
              {list.map((f, i) => {
                const hasOptions = options.some((o) => o.field_key === f.key)
                const v = (f.validation ?? {}) as Record<string, unknown>
                const present = V_KEYS.filter((k) => v[k] !== undefined && v[k] !== null)
                const missing = V_KEYS.filter((k) => !present.includes(k))
                const unit = unitOf(f.key, hasOptions)

                return (
                  <div
                    key={f.key}
                    draggable
                    onDragStart={() => setDragKey(f.key)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragKey) move(dragKey, f.key)
                      setDragKey(null)
                    }}
                    className="rounded-20 p-4"
                    style={{
                      background: 'var(--surface)',
                      opacity: f.is_active ? 1 : 0.6,
                      border: `2px solid ${dragKey === f.key ? '#F4632A' : 'transparent'}`,
                    }}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="cursor-grab font-display text-20" title="اسحب علشان ترتّب">
                        ⠿
                      </span>
                      <code className="font-body text-13" style={{ color: 'var(--muted)' }}>
                        {f.key}
                      </code>
                      {hasOptions && <Tag>ليه اختيارات</Tag>}
                      {!f.is_active && <Tag>مقفول</Tag>}

                      <button
                        type="button"
                        onClick={() => nudge(f.key, -1)}
                        disabled={i === 0}
                        aria-label="فوق"
                        className="cursor-pointer rounded-pill px-2 py-[2px] disabled:opacity-30"
                        style={{ background: 'var(--bg)', color: 'var(--fg)', border: 0 }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => nudge(f.key, 1)}
                        disabled={i === list.length - 1}
                        aria-label="تحت"
                        className="cursor-pointer rounded-pill px-2 py-[2px] disabled:opacity-30"
                        style={{ background: 'var(--bg)', color: 'var(--fg)', border: 0 }}
                      >
                        ↓
                      </button>

                      <span
                        className="ms-auto font-body text-12"
                        style={{ color: 'var(--muted)' }}
                      >
                        آخر تعديل: {when(f.updated_at)}
                      </span>
                    </div>

                    <div className="mt-3 grid gap-3 md:grid-cols-2">
                      <TextField
                        label="السؤال اللي بيشوفه العضو"
                        value={f.label_ar}
                        onSave={(val) => guard(val) && patch(f.key, { label_ar: val })}
                      />
                      <TextField
                        label="السطر الصغير تحت السؤال"
                        value={f.help_ar ?? ''}
                        hint="سيبه فاضي لو مش محتاجه"
                        onSave={(val) =>
                          guard(val) && patch(f.key, { help_ar: val.trim() ? val : null })
                        }
                      />
                      <TextField
                        label="رسالة الغلط"
                        value={f.error_ar ?? ''}
                        hint="بتظهر لما الإجابة مش مظبوطة"
                        onSave={(val) =>
                          guard(val) && patch(f.key, { error_ar: val.trim() ? val : null })
                        }
                      />
                      <SelectField
                        label="الخطوة"
                        value={String(f.step)}
                        options={steps.map((s) => ({ value: String(s), label: stepLabel(s) }))}
                        onChange={(val) => moveToStep(f, Number(val))}
                      />
                    </div>

                    <div className="mt-3 flex flex-wrap gap-6">
                      <Toggle
                        label="إجباري"
                        value={f.is_required}
                        hint="لو شيلته، العضو يقدر يعدّيه من غير ما يجاوب"
                        onChange={(val) => patch(f.key, { is_required: val })}
                      />
                      <Toggle
                        label="شغّال"
                        value={f.is_active}
                        hint="لو قفلته، الحقل هيختفي من التسجيل خالص"
                        onChange={(val) => patch(f.key, { is_active: val })}
                      />
                    </div>

                    {/* الشروط — بنعرضها كخانات، مش JSON */}
                    <div
                      className="mt-4 rounded-16 p-3"
                      style={{ background: 'var(--bg)', border: '2px solid var(--line)' }}
                    >
                      <div className="font-display text-16 font-black">شروط الإجابة</div>
                      {present.length === 0 && (
                        <div className="mt-1 font-body text-13" style={{ color: 'var(--muted)' }}>
                          مفيش شروط — أي إجابة هتعدّي.
                        </div>
                      )}

                      <div className="mt-3 flex flex-col gap-3">
                        {present.map((k) => (
                          <div key={k} className="flex flex-wrap items-end gap-2">
                            {k === 'pattern' ? (
                              <div className="grow">
                                <TextField
                                  label={vLabel(k, unit)}
                                  value={String(v.pattern ?? '')}
                                  hint="⚠️ خانة تقنية (Regex) — لو مش فاهمها سيبها زي ما هي، غلطة فيها ممكن تمنع كل الناس من التسجيل."
                                  onSave={(val) => {
                                    if (!val.trim()) {
                                      const next = { ...v }
                                      delete next.pattern
                                      setValidation(f, next)
                                      return
                                    }
                                    try {
                                      new RegExp(val)
                                    } catch {
                                      flash('الشكل ده مش تعبير سليم — راجعه.')
                                      return
                                    }
                                    setValidation(f, { ...v, pattern: val })
                                  }}
                                />
                              </div>
                            ) : (
                              <NumberField
                                label={vLabel(k, unit)}
                                value={Number(v[k] ?? 0)}
                                suffix={unit === 'سنة' ? '' : unit}
                                onSave={(n) => setValidation(f, { ...v, [k]: n })}
                              />
                            )}
                            <Btn
                              kind="danger"
                              onClick={() => {
                                const next = { ...v }
                                delete next[k]
                                setValidation(f, next)
                              }}
                            >
                              شيل الشرط
                            </Btn>
                          </div>
                        ))}
                      </div>

                      {missing.length > 0 && (
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
                            زوّد شرط:
                          </span>
                          {missing.map((k) => (
                            <Btn
                              key={k}
                              onClick={() =>
                                setValidation(f, {
                                  ...v,
                                  [k]: k === 'pattern' ? '' : k === 'min' ? 1 : 10,
                                })
                              }
                            >
                              {vLabel(k, unit)}
                            </Btn>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          </section>
        )
      })}
    </div>
  )
}

/* ============================================================ الاختيارات */

function OptionsTab({
  fields,
  options,
  flash,
  afterWrite,
  guard,
}: Shared & { fields: FieldRow[]; options: OptionRow[] }) {
  const [dragId, setDragId] = useState<string | null>(null)

  /** الحقول اللي ليها اختيارات فعلًا */
  const withOptions = useMemo(() => {
    const keys = new Set(options.map((o) => o.field_key))
    return fields.filter((f) => keys.has(f.key))
  }, [fields, options])

  async function patch(id: string, p: Partial<OptionRow>) {
    const { error } = await supabase().from('field_options').update(p).eq('id', id)
    if (error) return flash(`مقدرناش نحفظ: ${error.message}`)
    await afterWrite()
  }

  async function renumber(list: OptionRow[]) {
    const db = supabase()
    for (let i = 0; i < list.length; i++) {
      if (list[i].order === i + 1) continue
      const { error } = await db
        .from('field_options')
        .update({ order: i + 1 })
        .eq('id', list[i].id)
      if (error) {
        flash(`مقدرناش نرتّب: ${error.message}`)
        return false
      }
    }
    return true
  }

  const listOf = useCallback(
    (fieldKey: string) =>
      options.filter((o) => o.field_key === fieldKey).sort((a, b) => a.order - b.order),
    [options]
  )

  async function move(fromId: string, toId: string) {
    if (fromId === toId) return
    const from = options.find((o) => o.id === fromId)
    const to = options.find((o) => o.id === toId)
    if (!from || !to || from.field_key !== to.field_key) return
    const list = listOf(from.field_key)
    const i = list.findIndex((o) => o.id === fromId)
    const j = list.findIndex((o) => o.id === toId)
    if (i < 0 || j < 0) return
    const [moved] = list.splice(i, 1)
    list.splice(j, 0, moved)
    if (await renumber(list)) await afterWrite('الترتيب اتغيّر ✓')
  }

  async function nudge(fieldKey: string, id: string, dir: -1 | 1) {
    const list = listOf(fieldKey)
    const i = list.findIndex((o) => o.id === id)
    const j = i + dir
    if (i < 0 || j < 0 || j >= list.length) return
    await move(id, list[j].id)
  }

  async function add(fieldKey: string) {
    const list = listOf(fieldKey)
    const { error } = await supabase()
      .from('field_options')
      .insert({
        field_key: fieldKey,
        label_ar: 'اختيار جديد',
        value: `option_${Date.now().toString(36)}`,
        order: list.length + 1,
        is_active: true,
      })
    if (error) return flash(`مقدرناش نزوّد: ${error.message}`)
    await afterWrite('اتزاد اختيار ✓')
  }

  async function remove(o: OptionRow) {
    if (
      !confirm(
        `هنمسح «${o.label_ar}» خالص. لو في أعضاء مختارينه قبل كده، اختيارهم هيبقى معلّق ومش هيبان.\n\nالأأمن إنك تقفله (تشيل علامة «شغّال») بدل ما تمسحه.\n\nأمسح برضه؟`
      )
    )
      return
    const { error } = await supabase().from('field_options').delete().eq('id', o.id)
    if (error) return flash(`مقدرناش نمسح: ${error.message}`)
    await renumber(listOf(o.field_key).filter((x) => x.id !== o.id))
    await afterWrite('الاختيار اتمسح ✓')
  }

  if (withOptions.length === 0) return <Empty>مفيش حقول ليها اختيارات لسه.</Empty>

  return (
    <div className="mt-5 flex flex-col gap-6">
      <p className="m-0 font-body text-14" style={{ color: 'var(--muted)' }}>
        قفل الاختيار أأمن من إنك تمسحه: القفل بيخفيه عن اللي بيسجّل جديد ومش بيلخبط اللي اختاروه
        قبل كده.
      </p>

      {withOptions.map((f) => {
        const list = listOf(f.key)
        return (
          <Card key={f.key} title={f.label_ar} hint={`${f.key} · ${stepLabel(f.step)}`}>
            <div className="mt-3">
              <Table head={['', 'اللي العضو بيشوفه', 'القيمة المخزّنة', 'شغّال', '']}>
                {list.map((o, i) => (
                  <tr
                    key={o.id}
                    draggable
                    onDragStart={() => setDragId(o.id)}
                    onDragOver={(e) => e.preventDefault()}
                    onDrop={() => {
                      if (dragId) move(dragId, o.id)
                      setDragId(null)
                    }}
                    style={{
                      opacity: o.is_active ? 1 : 0.5,
                      outline: dragId === o.id ? '2px solid #F4632A' : 'none',
                    }}
                  >
                    <td className="p-2 whitespace-nowrap">
                      <span className="cursor-grab font-display text-18" title="اسحب علشان ترتّب">
                        ⠿
                      </span>
                      <button
                        type="button"
                        onClick={() => nudge(f.key, o.id, -1)}
                        disabled={i === 0}
                        aria-label="فوق"
                        className="ms-1 cursor-pointer rounded-pill px-2 py-[2px] disabled:opacity-30"
                        style={{ background: 'var(--bg)', color: 'var(--fg)', border: 0 }}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        onClick={() => nudge(f.key, o.id, 1)}
                        disabled={i === list.length - 1}
                        aria-label="تحت"
                        className="ms-1 cursor-pointer rounded-pill px-2 py-[2px] disabled:opacity-30"
                        style={{ background: 'var(--bg)', color: 'var(--fg)', border: 0 }}
                      >
                        ↓
                      </button>
                    </td>
                    <td className="p-2">
                      <input
                        defaultValue={o.label_ar}
                        onBlur={(e) => {
                          const val = e.target.value
                          if (val === o.label_ar) return
                          if (!guard(val)) return
                          patch(o.id, { label_ar: val })
                        }}
                        className="w-full min-w-[180px] rounded-12 px-2 py-1 font-body text-15"
                        style={{
                          background: 'var(--bg)',
                          color: 'var(--fg)',
                          border: '2px solid var(--line)',
                        }}
                      />
                    </td>
                    <td className="p-2">
                      <input
                        defaultValue={o.value}
                        title="خانة تقنية — دي اللي بتتخزن في ملف العضو"
                        onBlur={(e) => {
                          const val = e.target.value.trim()
                          if (val === o.value) return
                          if (!val) {
                            flash('القيمة المخزّنة ما تنفعش تبقى فاضية.')
                            return
                          }
                          if (
                            !confirm(
                              'القيمة دي بتتخزن في ملفات الأعضاء. لو غيّرتها، اللي اختاروا القديمة هيبقى اختيارهم مش مربوط بحاجة. تمام؟'
                            )
                          )
                            return
                          patch(o.id, { value: val })
                        }}
                        className="w-[150px] rounded-12 px-2 py-1 font-body text-13"
                        style={{
                          background: 'var(--bg)',
                          color: 'var(--muted)',
                          border: '2px solid var(--line)',
                        }}
                      />
                    </td>
                    <td className="p-2 text-center">
                      <input
                        type="checkbox"
                        aria-label="شغّال"
                        checked={o.is_active}
                        onChange={(e) => patch(o.id, { is_active: e.target.checked })}
                      />
                    </td>
                    <td className="p-2 text-center">
                      <button
                        type="button"
                        onClick={() => remove(o)}
                        aria-label="امسح الاختيار"
                        className="cursor-pointer bg-transparent font-display text-16"
                        style={{ color: 'var(--err-text)', border: 0 }}
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </Table>

              <div className="mt-3">
                <Btn onClick={() => add(f.key)}>زوّد اختيار</Btn>
              </div>
            </div>
          </Card>
        )
      })}
    </div>
  )
}

/* ============================================================ المهارات */

function SkillsTab({ skills, flash, afterWrite, guard }: Shared & { skills: SkillRow[] }) {
  const [dragKey, setDragKey] = useState<string | null>(null)
  const [newKey, setNewKey] = useState('')
  const [newLabel, setNewLabel] = useState('')

  const list = useMemo(() => [...skills].sort((a, b) => a.order - b.order), [skills])

  async function patch(key: string, p: Partial<SkillRow>) {
    const { error } = await supabase().from('skill_activities').update(p).eq('key', key)
    if (error) return flash(`مقدرناش نحفظ: ${error.message}`)
    await afterWrite()
  }

  async function renumber(rows: SkillRow[]) {
    const db = supabase()
    for (let i = 0; i < rows.length; i++) {
      if (rows[i].order === i + 1) continue
      const { error } = await db
        .from('skill_activities')
        .update({ order: i + 1 })
        .eq('key', rows[i].key)
      if (error) {
        flash(`مقدرناش نرتّب: ${error.message}`)
        return false
      }
    }
    return true
  }

  async function move(fromKey: string, toKey: string) {
    if (fromKey === toKey) return
    const rows = [...list]
    const i = rows.findIndex((s) => s.key === fromKey)
    const j = rows.findIndex((s) => s.key === toKey)
    if (i < 0 || j < 0) return
    const [moved] = rows.splice(i, 1)
    rows.splice(j, 0, moved)
    if (await renumber(rows)) await afterWrite('الترتيب اتغيّر ✓')
  }

  async function nudge(key: string, dir: -1 | 1) {
    const i = list.findIndex((s) => s.key === key)
    const j = i + dir
    if (i < 0 || j < 0 || j >= list.length) return
    await move(key, list[j].key)
  }

  async function add() {
    const key = newKey.trim().toLowerCase()
    const label = newLabel.trim()
    if (!/^[a-z0-9_]{2,}$/.test(key)) {
      flash('المفتاح لازم يكون إنجليزي صغير وأرقام و_ بس (زي padel).')
      return
    }
    if (!label) {
      flash('اكتب اسم النشاط بالعربي.')
      return
    }
    if (list.some((s) => s.key === key)) {
      flash('المفتاح ده موجود قبل كده.')
      return
    }
    if (!guard(label)) return

    const { error } = await supabase()
      .from('skill_activities')
      .insert({ key, label_ar: label, order: list.length + 1, is_active: true })
    if (error) return flash(`مقدرناش نزوّد: ${error.message}`)
    setNewKey('')
    setNewLabel('')
    await afterWrite('اتزاد نشاط ✓')
  }

  async function remove(s: SkillRow) {
    if (
      !confirm(
        `هنمسح «${s.label_ar}» خالص. لو في أعضاء كاتبين مستواهم فيه، الكلام ده هيبقى بلا معنى.\n\nالأأمن إنك تقفله بدل ما تمسحه.\n\nأمسح برضه؟`
      )
    )
      return
    const { error } = await supabase().from('skill_activities').delete().eq('key', s.key)
    if (error) return flash(`مقدرناش نمسح: ${error.message}`)
    await renumber(list.filter((x) => x.key !== s.key))
    await afterWrite('النشاط اتمسح ✓')
  }

  return (
    <div className="mt-5">
      <p className="m-0 font-body text-14" style={{ color: 'var(--muted)' }}>
        دي النشاطات اللي العضو بيقول مستواه فيها. اسحب من ⠿ علشان ترتّبها.
      </p>

      <div className="mt-4">
        <Table head={['', 'النشاط', 'المفتاح', 'شغّال', '']}>
          {list.map((s, i) => (
            <tr
              key={s.key}
              draggable
              onDragStart={() => setDragKey(s.key)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragKey) move(dragKey, s.key)
                setDragKey(null)
              }}
              style={{
                opacity: s.is_active ? 1 : 0.5,
                outline: dragKey === s.key ? '2px solid #F4632A' : 'none',
              }}
            >
              <td className="p-2 whitespace-nowrap">
                <span className="cursor-grab font-display text-18" title="اسحب علشان ترتّب">
                  ⠿
                </span>
                <button
                  type="button"
                  onClick={() => nudge(s.key, -1)}
                  disabled={i === 0}
                  aria-label="فوق"
                  className="ms-1 cursor-pointer rounded-pill px-2 py-[2px] disabled:opacity-30"
                  style={{ background: 'var(--bg)', color: 'var(--fg)', border: 0 }}
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => nudge(s.key, 1)}
                  disabled={i === list.length - 1}
                  aria-label="تحت"
                  className="ms-1 cursor-pointer rounded-pill px-2 py-[2px] disabled:opacity-30"
                  style={{ background: 'var(--bg)', color: 'var(--fg)', border: 0 }}
                >
                  ↓
                </button>
              </td>
              <td className="p-2">
                <input
                  defaultValue={s.label_ar}
                  onBlur={(e) => {
                    const val = e.target.value
                    if (val === s.label_ar) return
                    if (!guard(val)) return
                    patch(s.key, { label_ar: val })
                  }}
                  className="w-full min-w-[180px] rounded-12 px-2 py-1 font-body text-15"
                  style={{
                    background: 'var(--bg)',
                    color: 'var(--fg)',
                    border: '2px solid var(--line)',
                  }}
                />
              </td>
              <td className="p-2">
                <code className="font-body text-13" style={{ color: 'var(--muted)' }}>
                  {s.key}
                </code>
              </td>
              <td className="p-2 text-center">
                <input
                  type="checkbox"
                  aria-label="شغّال"
                  checked={s.is_active}
                  onChange={(e) => patch(s.key, { is_active: e.target.checked })}
                />
              </td>
              <td className="p-2 text-center">
                <button
                  type="button"
                  onClick={() => remove(s)}
                  aria-label="امسح النشاط"
                  className="cursor-pointer bg-transparent font-display text-16"
                  style={{ color: 'var(--err-text)', border: 0 }}
                >
                  ✕
                </button>
              </td>
            </tr>
          ))}
        </Table>
        {list.length === 0 && <Empty>مفيش نشاطات لسه.</Empty>}
      </div>

      <Card title="زوّد نشاط">
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1">
            <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
              الاسم بالعربي
            </span>
            <input
              value={newLabel}
              onChange={(e) => setNewLabel(e.target.value)}
              placeholder="مثلًا: تنس"
              className="rounded-14 px-3 py-2 font-body text-16"
              style={{
                background: 'var(--bg)',
                color: 'var(--fg)',
                border: '2px solid var(--line)',
              }}
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
              المفتاح (إنجليزي، تقني)
            </span>
            <input
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder="tennis"
              className="rounded-14 px-3 py-2 font-body text-16"
              style={{
                background: 'var(--bg)',
                color: 'var(--fg)',
                border: '2px solid var(--line)',
              }}
            />
          </label>
          <Btn kind="primary" onClick={add}>
            زوّد
          </Btn>
        </div>
      </Card>
    </div>
  )
}

/* ============================================================ الموافقات */

function ConsentsTab({ consents, flash, afterWrite, guard }: Shared & { consents: ConsentRow[] }) {
  async function saveText(c: ConsentRow, text: string) {
    if (!text.trim()) return flash('نص الموافقة ما ينفعش يبقى فاضي.')
    if (!guard(text)) return
    const { error } = await supabase()
      .from('consents')
      .update({ text_ar: text })
      .eq('key', c.key)
    if (error) return flash(`مقدرناش نحفظ: ${error.message}`)
    await afterWrite('النص اتحفظ ✓ — من غير نسخة جديدة')
  }

  async function publish(c: ConsentRow) {
    const name = CONSENT_LABELS[c.key] ?? c.key
    if (
      !confirm(
        `هتنشر نسخة ${c.version + 1} من «${name}».\n\nمعنى كده إن كل الأعضاء — القدام والجداد — هيتطلب منهم يوافقوا تاني على النص ده قبل ما يكملوا استخدام نسبوط.\n\nمتأكد؟`
      )
    )
      return
    const { error } = await supabase()
      .from('consents')
      .update({
        version: c.version + 1,
        published_at: new Date().toISOString(),
        requires_reconsent: true,
      })
      .eq('key', c.key)
    if (error) return flash(`مقدرناش ننشر: ${error.message}`)
    await afterWrite(`اتنشرت نسخة ${c.version + 1} ✓ — الناس هتوافق من تاني`)
  }

  async function stopReconsent(c: ConsentRow) {
    if (!confirm('هنبطّل طلب الموافقة من تاني. اللي ما وافقش على النسخة دي مش هيتسأل. تمام؟'))
      return
    const { error } = await supabase()
      .from('consents')
      .update({ requires_reconsent: false })
      .eq('key', c.key)
    if (error) return flash(`مقدرناش: ${error.message}`)
    await afterWrite('اتوقف طلب الموافقة ✓')
  }

  if (consents.length === 0) return <Empty>مفيش موافقات مسجّلة.</Empty>

  return (
    <div className="mt-5 flex flex-col gap-4">
      <p className="m-0 font-body text-14" style={{ color: 'var(--muted)' }}>
        تصليح غلطة إملائية؟ عدّل النص وخلاص. غيّرت المعنى؟ ساعتها بس انشر نسخة جديدة — وده بيخلي
        كل الأعضاء يوافقوا من أول وجديد.
      </p>

      {consents.map((c) => (
        <Card
          key={c.key}
          title={CONSENT_LABELS[c.key] ?? c.key}
          hint={`${c.key} · نسخة ${c.version} · اتنشرت: ${when(c.published_at)}`}
        >
          <div className="mt-3">
            <TextField
              label="نص الموافقة"
              value={c.text_ar}
              multiline
              hint="ده اللي العضو بيقراه جنب المربع اللي بيعلّم عليه."
              onSave={(val) => saveText(c, val)}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center gap-3">
            {c.requires_reconsent ? (
              <Tag color="#F4632A">مطلوب موافقة من تاني</Tag>
            ) : (
              <Tag>الناس موافقة على النسخة دي</Tag>
            )}
            <Btn kind="primary" onClick={() => publish(c)}>
              انشر نسخة جديدة
            </Btn>
            {c.requires_reconsent && (
              <Btn kind="danger" onClick={() => stopReconsent(c)}>
                بطّل طلب الموافقة
              </Btn>
            )}
          </div>

          <div className="mt-2 font-body text-12" style={{ color: 'var(--err-text)' }}>
            النشر بيرفع رقم النسخة ويطلب من كل عضو يوافق تاني — مش خطوة بتترجع فيها.
          </div>
        </Card>
      ))}
    </div>
  )
}
