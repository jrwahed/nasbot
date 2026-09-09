'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { AdminShell } from '@/components/AdminShell'
import { supabase } from '@/lib/supabase'
import { revalidateSite } from '@/lib/admin'
import type { AdminMe } from '@/lib/admin'
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
  money,
  useFlash,
} from '@/components/admin-ui'

/**
 * الشغل — طبقة الفريلانسرز (WORK_PLAN.md §5).
 *
 * صفحة واحدة بتبويبات زي /admin/payments. في المرحلة 1 الشغّال منها:
 *   المجالات      → جدول professions (قاموس المجالات اللي بيختار منها العضو)
 *   أماكن الشغل   → venues (kind = cafe_work | coworking) + مواصفاتها في work_venues
 *   الإعدادات     → أعمدة settings.work_* (صف واحد، id = true)
 *
 * الباقي (الكروت، الأيام الثابتة، تقارير الأماكن، المؤشرات، الشركات) تبويبات
 * فاضية لحد ما مراحلها تيجي — علشان القايمة تبقى ثابتة من دلوقتي.
 *
 * الفلوس كلها قروش في القاعدة. أي سعر بيتعرض بـ money() وبيتدخّل بالجنيه.
 * أي حفظ بيعدّي على .select() بعد التعديل علشان لو RLS رفض نعرف —
 * من غير كده بيرجع «تمام» وهو ما عملش حاجة.
 */

/* ============================================================ ثوابت */

type TabId =
  | 'fields'
  | 'venues'
  | 'settings'
  | 'passes'
  | 'recurring'
  | 'reports'
  | 'metrics'
  | 'leads'

const TABS: { id: TabId; label: string }[] = [
  { id: 'fields', label: 'المجالات' },
  { id: 'venues', label: 'أماكن الشغل' },
  { id: 'settings', label: 'الإعدادات' },
  { id: 'passes', label: 'الكروت' },
  { id: 'recurring', label: 'الأيام الثابتة' },
  { id: 'reports', label: 'تقارير الأماكن' },
  { id: 'metrics', label: 'المؤشرات' },
  { id: 'leads', label: 'الشركات' },
]

/** التبويبات اللي لسه ما اتبنتش — والمرحلة اللي هتيجي فيها */
const PLACEHOLDER_PHASE: Partial<Record<TabId, number>> = {
  passes: 3,
  recurring: 4,
  reports: 6,
  metrics: 6,
  leads: 6,
}

const AREAS: { value: string; label: string }[] = [
  { value: 'tagamoa', label: 'التجمع' },
  { value: 'maadi', label: 'المعادي' },
  { value: 'zayed_october', label: 'زايد-أكتوبر' },
  { value: 'heliopolis_nasr', label: 'مصر الجديدة-مدينة نصر' },
  { value: 'downtown_zamalek', label: 'وسط-زمالك' },
  { value: 'other', label: 'غير كده' },
]

const areaLabel = (a: string) => AREAS.find((x) => x.value === a)?.label ?? a

const WORK_KINDS: { value: string; label: string }[] = [
  { value: 'cafe_work', label: 'كافيه شغل' },
  { value: 'coworking', label: 'مساحة عمل' },
]

const kindLabel = (k: string) => WORK_KINDS.find((x) => x.value === k)?.label ?? k

const OUTLETS: { value: string; label: string }[] = [
  { value: '', label: 'مش محدد' },
  { value: 'few', label: 'قليل' },
  { value: 'enough', label: 'كفاية' },
  { value: 'plenty', label: 'كتير' },
]

const NOISE: { value: string; label: string }[] = [
  { value: '', label: 'مش محدد' },
  { value: 'quiet', label: 'هادي' },
  { value: 'medium', label: 'متوسط' },
  { value: 'lively', label: 'صاخب' },
]

/** نفس أكواد free_slots في profiles */
const DAYS: { code: string; label: string }[] = [
  { code: 'sat', label: 'سبت' },
  { code: 'sun', label: 'حد' },
  { code: 'mon', label: 'اتنين' },
  { code: 'tue', label: 'تلات' },
  { code: 'wed', label: 'أربع' },
  { code: 'thu', label: 'خميس' },
  { code: 'fri', label: 'جمعة' },
]

/** تحت كده التقييم بيتعلّم أحمر */
const RATING_ALERT = 4

const INPUT_CLS = 'w-full rounded-14 px-3 py-2 font-body text-16'
const INPUT_ST = {
  background: 'var(--bg)',
  color: 'var(--fg)',
  border: '2px solid var(--line)',
}

/* ============================================================ أنواع */

interface ProfessionRow {
  id: string
  key: string
  name_ar: string
  icon_key: string | null
  color: string | null
  sort_order: number
  is_active: boolean
}

interface WorkVenueRow {
  venue_id: string
  desks_count: number | null
  wifi_mbps: number | null
  wifi_note_ar: string | null
  power_outlets: string | null
  noise_level: string | null
  has_meeting_room: boolean | null
  has_parking: boolean | null
  has_ac: boolean | null
  min_consumption: number | null
  open_from: string | null
  open_to: string | null
  best_days: string[] | null
  photos: string[] | null
  wholesale_seat_price: number | null
  notes_ar: string | null
}

interface VenueRow {
  id: string
  name: string
  area: string
  kind: string
  address: string
  is_active: boolean
  rating_avg: number | null
  /** PostgREST بيرجّع الواحد-لواحد كائن، بس بنطبّع الاتنين للأمان */
  work_venues: WorkVenueRow | null
}

/** شكل الصف زي ما بييجي من القاعدة قبل التطبيع */
interface VenueRaw extends Omit<VenueRow, 'work_venues' | 'rating_avg'> {
  rating_avg: number | string | null
  work_venues: WorkVenueRow | WorkVenueRow[] | null
}

interface WorkSettings {
  work_pass4_price: number
  work_pass4_weeks: number
  work_pass8_price: number
  work_pass8_weeks: number
  work_single_price: number
  work_first_time_price: number
  work_profession_mix_max: number
  work_lunch_at: string | null
  work_complaint_at: string | null
  work_recurring_lead_days: number
  work_pass_refund_days: number
  work_conversion_target_pct: number
}

const WORK_SETTING_COLS: (keyof WorkSettings)[] = [
  'work_pass4_price',
  'work_pass4_weeks',
  'work_pass8_price',
  'work_pass8_weeks',
  'work_single_price',
  'work_first_time_price',
  'work_profession_mix_max',
  'work_lunch_at',
  'work_complaint_at',
  'work_recurring_lead_days',
  'work_pass_refund_days',
  'work_conversion_target_pct',
]

/* ============================================================ مساعدات */

/** جنيه → قروش */
const toPiastres = (pounds: number) => Math.round(pounds * 100)

/** قروش → جنيه لخانة الإدخال */
const toPounds = (piastres: number | null | undefined) => Math.round((piastres ?? 0) / 100)

/** عمود time بييجي "13:00:00" — بنعرض "13:00" بس */
const hhmm = (t: string | null | undefined) => (t ? t.slice(0, 5) : '')

const HEX_RE = /^#?([0-9a-f]{6})$/i

/** بيرجّع اللون بصيغة #RRGGBB أو null لو مش لون */
const normalizeHex = (v: string): string | null => {
  const m = HEX_RE.exec(v.trim())
  return m ? `#${m[1].toUpperCase()}` : null
}

/** سطور المربع → مصفوفة نضيفة */
const toList = (text: string) =>
  text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)

/** حروف عربي → لاتيني بسيط علشان مفتاح المجال يطلع snake_case */
const AR_TO_LATIN: Record<string, string> = {
  ا: 'a', أ: 'a', إ: 'e', آ: 'a', ب: 'b', ت: 't', ث: 'th', ج: 'g', ح: 'h', خ: 'kh',
  د: 'd', ذ: 'z', ر: 'r', ز: 'z', س: 's', ش: 'sh', ص: 's', ض: 'd', ط: 't', ظ: 'z',
  ع: 'a', غ: 'gh', ف: 'f', ق: 'q', ك: 'k', ل: 'l', م: 'm', ن: 'n', ه: 'h', و: 'w',
  ي: 'y', ى: 'a', ة: 'a', ء: '', ئ: 'y', ؤ: 'w', ' ': '_',
}

/** «كتابة محتوى» → "ktaba_mhtwa" — مفتاح لاتيني ينفع يتعدّل بالإيد */
function slugKey(name: string): string {
  const out: string[] = []
  for (const ch of name.trim().normalize('NFD')) {
    if (/[ً-ْـ]/.test(ch)) continue // تشكيل وتطويل
    if (/[a-z0-9_]/i.test(ch)) out.push(ch.toLowerCase())
    else if (ch in AR_TO_LATIN) out.push(AR_TO_LATIN[ch])
    else if (/\s|-/.test(ch)) out.push('_')
  }
  return out
    .join('')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 40)
}

/** لو الـ select رجّع فاضي بعد التعديل، يبقى RLS رفض بصمت */
const rejected = (data: unknown) => !data || (data as unknown[]).length === 0

/** خانة محكومة للفورمات (الحقول المشتركة بتحفظ عند الخروج، ودي بتتحكم في state) */
function Field({
  label,
  value,
  onChange,
  hint,
  type = 'text',
  placeholder,
  multiline,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  hint?: string
  type?: string
  placeholder?: string
  multiline?: boolean
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
        {label}
      </span>
      {multiline ? (
        <textarea
          rows={2}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={INPUT_CLS}
          style={INPUT_ST}
        />
      ) : (
        <input
          type={type}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className={INPUT_CLS}
          style={INPUT_ST}
        />
      )}
      {hint && (
        <span className="font-body text-12" style={{ color: 'var(--muted)' }}>
          {hint}
        </span>
      )}
    </label>
  )
}

/** خانة صغيرة جوه جدول — بتحفظ لما تسيبها، من غير عنوان */
function Cell({
  value,
  onSave,
  placeholder,
  width = 160,
  disabled,
}: {
  value: string
  onSave: (v: string) => void
  placeholder?: string
  width?: number
  disabled?: boolean
}) {
  return (
    <input
      key={value}
      defaultValue={value}
      placeholder={placeholder}
      disabled={disabled}
      className="rounded-14 px-2 py-1 font-body text-15 disabled:opacity-60"
      style={{ ...INPUT_ST, width }}
      onBlur={(e) => {
        if (e.target.value !== value) onSave(e.target.value)
      }}
    />
  )
}

/** خانة وقت HH:MM — بتحفظ لما تسيبها */
function TimeField({
  label,
  value,
  onSave,
  hint,
}: {
  label: string
  value: string
  onSave: (v: string) => void
  hint?: string
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
        {label}
      </span>
      <input
        key={value}
        type="time"
        defaultValue={value}
        className="w-[140px] rounded-14 px-3 py-2 font-body text-16"
        style={INPUT_ST}
        onBlur={(e) => {
          if (e.target.value !== value) onSave(e.target.value)
        }}
      />
      {hint && (
        <span className="font-body text-12" style={{ color: 'var(--muted)' }}>
          {hint}
        </span>
      )}
    </label>
  )
}

/** عرض للقراءة بس */
function ReadOnly({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
        {label}
      </span>
      <span className="font-display text-18 font-black">{value}</span>
      {hint && (
        <span className="font-body text-12" style={{ color: 'var(--muted)' }}>
          {hint}
        </span>
      )}
    </div>
  )
}

function Note({ children }: { children: ReactNode }) {
  return (
    <div
      className="mt-3 rounded-14 px-3 py-2 font-body text-13"
      style={{ background: 'var(--bg)', color: 'var(--muted)' }}
    >
      {children}
    </div>
  )
}

/** مربع لون صغير جنب خانة الهيكس */
function Swatch({ color }: { color: string | null }) {
  const ok = color ? normalizeHex(color) : null
  return (
    <span
      aria-hidden
      className="inline-block h-6 w-6 shrink-0 rounded-full"
      style={{
        background: ok ?? 'transparent',
        border: `2px solid ${ok ? ok : 'var(--chip-idle-border)'}`,
      }}
    />
  )
}

/* ============================================================ الصفحة */

export default function AdminShoghlPage() {
  return (
    <AdminShell title="الشغل" needs="sbotat.view">
      {(me) => <ShoghlEditor me={me} />}
    </AdminShell>
  )
}

function ShoghlEditor({ me }: { me: AdminMe }) {
  const canFields = me.permissions.has('fields.edit')
  const canVenues = me.permissions.has('sbotat.edit')
  const canSettings = me.permissions.has('settings.edit')

  const [tab, setTab] = useState<TabId>('fields')
  const { flash, node: flashNode } = useFlash()

  /** flash بيتعمل من أول بكل render — بنثبّته علشان الـ reload ما يلفّش على نفسه */
  const flashRef = useRef(flash)
  flashRef.current = flash
  const say = useCallback((m: string) => flashRef.current(m, 4000), [])

  const phase = PLACEHOLDER_PHASE[tab]

  return (
    <div className="mt-2">
      <Tabs tabs={TABS} value={tab} onChange={setTab} />

      {flashNode}

      <div className="mt-4">
        {tab === 'fields' && <ProfessionsTab canEdit={canFields} say={say} />}
        {tab === 'venues' && <VenuesTab canEdit={canVenues} say={say} />}
        {tab === 'settings' && <WorkSettingsTab canEdit={canSettings} say={say} />}
        {phase !== undefined && (
          <Card>
            <Empty>بيتبني في المرحلة {phase}</Empty>
          </Card>
        )}
      </div>
    </div>
  )
}

/* ================================================== ١ · المجالات */

function ProfessionsTab({ canEdit, say }: { canEdit: boolean; say: (m: string) => void }) {
  const [rows, setRows] = useState<ProfessionRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [name, setName] = useState('')
  const [key, setKey] = useState('')
  const [keyTouched, setKeyTouched] = useState(false)
  const [icon, setIcon] = useState('')
  const [color, setColor] = useState('')
  const [busy, setBusy] = useState(false)

  const reload = useCallback(async () => {
    const { data, error } = await supabase()
      .from('professions')
      .select('id,key,name_ar,icon_key,color,sort_order,is_active')
      .order('sort_order')
      .order('name_ar')
    setLoading(false)
    if (error) {
      setLoadError(error.message)
      return
    }
    setLoadError(null)
    setRows((data ?? []) as ProfessionRow[])
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  /** بعد أي تغيير: نجيب الجديد ونخلي الموقع يقراه */
  async function done(msg: string) {
    await reload()
    const ok = await revalidateSite()
    say(ok ? `${msg} ✓ وبان في الموقع` : `${msg} ✓ — هيبان خلال أقل من دقيقة`)
  }

  async function patch(r: ProfessionRow, p: Partial<ProfessionRow>) {
    if (!canEdit) return say('التعديل هنا محتاج صلاحية fields.edit.')
    const { data, error } = await supabase()
      .from('professions')
      .update(p)
      .eq('id', r.id)
      .select('id')
    if (error) return say(`مقدرناش نحفظ: ${error.message}`)
    if (rejected(data)) return say('مااتحفظش — القاعدة رفضت الكتابة، محتاج صلاحية fields.edit')
    await done(`«${r.name_ar}» اتحفظ`)
  }

  function saveColor(r: ProfessionRow, v: string) {
    const clean = v.trim()
    if (!clean) return patch(r, { color: null })
    const hex = normalizeHex(clean)
    if (!hex) return say('اللون لازم يبقى هيكس زي #F4632A')
    patch(r, { color: hex })
  }

  /** تبديل مكان صفين متجاورين، وبعدها نرقّم الكل من أول وجديد علشان الترتيب يفضل نضيف */
  async function move(index: number, dir: -1 | 1) {
    if (!canEdit) return say('الترتيب محتاج صلاحية fields.edit.')
    const target = index + dir
    if (target < 0 || target >= rows.length) return
    const next = [...rows]
    ;[next[index], next[target]] = [next[target], next[index]]
    const changes = next
      .map((r, i) => ({ id: r.id, sort_order: i + 1, was: r.sort_order }))
      .filter((c) => c.sort_order !== c.was)
    const results = await Promise.all(
      changes.map((c) =>
        supabase()
          .from('professions')
          .update({ sort_order: c.sort_order })
          .eq('id', c.id)
          .select('id')
      )
    )
    const failed = results.find((res) => res.error || rejected(res.data))
    if (failed) {
      say(`الترتيب مااتحفظش: ${failed.error?.message ?? 'القاعدة رفضت الكتابة'}`)
      await reload()
      return
    }
    await done('الترتيب اتحفظ')
  }

  async function add() {
    if (!canEdit) return
    const n = name.trim()
    const k = (key.trim() || slugKey(n)).toLowerCase()
    if (!n) return say('اكتب اسم المجال الأول.')
    if (!/^[a-z][a-z0-9_]{1,39}$/.test(k))
      return say('المفتاح لازم حروف لاتينية صغيرة وأرقام وشرطة سفلية، ويبدأ بحرف.')
    if (rows.some((r) => r.key === k)) return say(`المفتاح «${k}» موجود قبل كده.`)
    const hex = color.trim() ? normalizeHex(color) : null
    if (color.trim() && !hex) return say('اللون لازم يبقى هيكس زي #F4632A')

    setBusy(true)
    const { data, error } = await supabase()
      .from('professions')
      .insert({
        key: k,
        name_ar: n,
        icon_key: icon.trim() || null,
        color: hex,
        sort_order: rows.reduce((m, r) => Math.max(m, r.sort_order), 0) + 1,
        is_active: true,
      })
      .select('id')
    setBusy(false)
    if (error) return say(`مقدرناش نضيف المجال: ${error.message}`)
    if (rejected(data)) return say('مااتضافش — القاعدة رفضت الكتابة، محتاج صلاحية fields.edit')
    setName('')
    setKey('')
    setKeyTouched(false)
    setIcon('')
    setColor('')
    setAdding(false)
    await done(`«${n}» اتضاف`)
  }

  if (loading) return <Loading />

  if (loadError)
    return (
      <Card title="مقدرناش نجيب المجالات">
        <Note>
          {loadError}
          <br />
          لو الرسالة بتقول إن الجدول مش موجود، يبقى WORK_MIGRATION.sql لسه ما اتشغّلش على
          القاعدة.
        </Note>
      </Card>
    )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display text-18 font-black">{rows.length} مجال</span>
        <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
          {rows.filter((r) => r.is_active).length} شغّال
        </span>
        {!canEdit && (
          <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
            تقدر تتفرّج بس — التعديل محتاج صلاحية fields.edit.
          </span>
        )}
        <div className="ms-auto flex gap-2">
          <Btn onClick={reload}>حدّث</Btn>
          {canEdit && (
            <Btn kind="primary" onClick={() => setAdding((v) => !v)}>
              {adding ? 'اقفل' : 'مجال جديد'}
            </Btn>
          )}
        </div>
      </div>

      {adding && (
        <Card title="مجال جديد" hint="الاسم اللي العضو بيشوفه، والمفتاح بيتعمل لوحده وينفع تغيّره.">
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <Field
              label="الاسم"
              value={name}
              onChange={(v) => {
                setName(v)
                if (!keyTouched) setKey(slugKey(v))
              }}
              placeholder="مثلًا: تصميم"
            />
            <Field
              label="المفتاح (key)"
              value={key}
              onChange={(v) => {
                setKeyTouched(true)
                setKey(v)
              }}
              hint="لاتيني snake_case — بيتعمل من الاسم. ما يتغيّرش بعد كده."
              placeholder="design"
            />
            <Field
              label="الأيقونة (icon_key)"
              value={icon}
              onChange={setIcon}
              hint="اسم الأيقونة في الكود — سيبه فاضي لو مش عارف."
              placeholder="palette"
            />
            <label className="flex flex-col gap-1">
              <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
                اللون (هيكس)
              </span>
              <span className="flex items-center gap-2">
                <input
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="#F4632A"
                  className={INPUT_CLS}
                  style={INPUT_ST}
                />
                <Swatch color={color} />
              </span>
            </label>
          </div>
          <div className="mt-3">
            <Btn kind="primary" onClick={add} disabled={busy}>
              {busy ? 'ثانية واحدة…' : 'ضيف المجال'}
            </Btn>
          </div>
        </Card>
      )}

      <Card hint="كل خانة بتتحفظ لوحدها أول ما تسيبها. الترتيب هو اللي بيظهر بيه للعضو.">
        {rows.length === 0 ? (
          <Empty>مفيش مجالات لسه. البذرة فيها 15 — لو فاضي يبقى الهجرة ما اتشغّلتش.</Empty>
        ) : (
          <div className="mt-3">
            <Table head={['#', 'المجال', 'المفتاح', 'الأيقونة', 'اللون', 'شغّال', 'الترتيب']}>
              {rows.map((r, i) => (
                <tr
                  key={r.id}
                  style={{ borderTop: '1px solid var(--line)', opacity: r.is_active ? 1 : 0.55 }}
                >
                  <td className="p-2 align-middle font-body text-13" style={{ color: 'var(--muted)' }}>
                    {i + 1}
                  </td>
                  <td className="p-2 align-middle">
                    <Cell
                      value={r.name_ar}
                      disabled={!canEdit}
                      onSave={(v) => {
                        const n = v.trim()
                        if (!n) return say('الاسم ما ينفعش يبقى فاضي.')
                        patch(r, { name_ar: n })
                      }}
                    />
                  </td>
                  <td className="p-2 align-middle">
                    <code className="font-body text-13" style={{ color: 'var(--muted)' }}>
                      {r.key}
                    </code>
                  </td>
                  <td className="p-2 align-middle">
                    <Cell
                      value={r.icon_key ?? ''}
                      width={120}
                      placeholder="—"
                      disabled={!canEdit}
                      onSave={(v) => patch(r, { icon_key: v.trim() || null })}
                    />
                  </td>
                  <td className="p-2 align-middle">
                    <span className="flex items-center gap-2">
                      <Swatch color={r.color} />
                      <Cell
                        value={r.color ?? ''}
                        width={110}
                        placeholder="#F4632A"
                        disabled={!canEdit}
                        onSave={(v) => saveColor(r, v)}
                      />
                    </span>
                  </td>
                  <td className="p-2 align-middle">
                    <input
                      type="checkbox"
                      checked={r.is_active}
                      disabled={!canEdit}
                      aria-label={`${r.name_ar} شغّال`}
                      onChange={(e) => patch(r, { is_active: e.target.checked })}
                    />
                  </td>
                  <td className="p-2 align-middle">
                    <span className="flex gap-1">
                      <button
                        type="button"
                        disabled={!canEdit || i === 0}
                        onClick={() => move(i, -1)}
                        aria-label="فوق"
                        className="cursor-pointer rounded-pill px-2 py-1 font-body text-14 disabled:cursor-not-allowed disabled:opacity-30"
                        style={{ background: 'var(--bg)', color: 'var(--fg)', border: 0 }}
                      >
                        ▲
                      </button>
                      <button
                        type="button"
                        disabled={!canEdit || i === rows.length - 1}
                        onClick={() => move(i, 1)}
                        aria-label="تحت"
                        className="cursor-pointer rounded-pill px-2 py-1 font-body text-14 disabled:cursor-not-allowed disabled:opacity-30"
                        style={{ background: 'var(--bg)', color: 'var(--fg)', border: 0 }}
                      >
                        ▼
                      </button>
                    </span>
                  </td>
                </tr>
              ))}
            </Table>
          </div>
        )}
        <Note>
          المفتاح (key) ثابت بعد الإضافة لأن الكود والملفات بيشاوروا عليه. المجال اللي مش
          شغّال بيختفي من الاختيارات بس بيفضل على الأعضاء اللي اختاروه قبل كده.
        </Note>
      </Card>
    </div>
  )
}

/* ============================================== ٢ · أماكن الشغل */

const VENUE_SELECT = 'id,name,area,kind,address,is_active,rating_avg,work_venues(*)'

/** بيطبّع صف القاعدة: التقييم رقم، ومواصفات الشغل كائن واحد أو null */
function normalizeVenue(v: VenueRaw): VenueRow {
  const wv = Array.isArray(v.work_venues) ? (v.work_venues[0] ?? null) : v.work_venues
  const rating = v.rating_avg === null || v.rating_avg === undefined ? null : Number(v.rating_avg)
  return { ...v, rating_avg: Number.isFinite(rating as number) ? rating : null, work_venues: wv }
}

function RatingTag({ value }: { value: number | null }) {
  if (value === null) return <Tag>لسه ماتقيّمش</Tag>
  const low = value < RATING_ALERT
  return (
    <Tag color={low ? '#E39A8E' : undefined}>
      {low ? `التقييم نزل · ${value.toFixed(1)}` : value.toFixed(1)}
    </Tag>
  )
}

function VenuesTab({ canEdit, say }: { canEdit: boolean; say: (m: string) => void }) {
  const [rows, setRows] = useState<VenueRow[]>([])
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [openId, setOpenId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)

  const reload = useCallback(async () => {
    const { data, error } = await supabase()
      .from('venues')
      .select(VENUE_SELECT)
      .in('kind', ['cafe_work', 'coworking'])
      .order('name')
    setLoading(false)
    if (error) {
      setLoadError(error.message)
      return
    }
    setLoadError(null)
    setRows(((data ?? []) as unknown as VenueRaw[]).map(normalizeVenue))
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const open = useMemo(() => rows.find((r) => r.id === openId) ?? null, [rows, openId])

  async function done(msg: string) {
    await reload()
    const ok = await revalidateSite()
    say(ok ? `${msg} ✓ وبان في الموقع` : `${msg} ✓ — هيبان خلال أقل من دقيقة`)
  }

  /** تعديل على صف venues نفسه (الاسم، المنطقة، العنوان…) */
  async function patchVenue(v: VenueRow, p: Partial<Omit<VenueRow, 'work_venues' | 'id'>>) {
    if (!canEdit) return say('التعديل هنا محتاج صلاحية sbotat.edit.')
    const { data, error } = await supabase().from('venues').update(p).eq('id', v.id).select('id')
    if (error) return say(`مقدرناش نحفظ: ${error.message}`)
    if (rejected(data)) return say('مااتحفظش — القاعدة رفضت الكتابة، محتاج صلاحية sbotat.edit')
    await done(`«${v.name}» اتحفظ`)
  }

  /**
   * تعديل على مواصفات الشغل. لو الصف موجود بنعدّله، ولو لسه مفيش (مكان اتحوّل لشغل
   * من الخريطة مثلًا) بنعمله بـ upsert على venue_id من غير ما نبعت أعمدة فاضية —
   * علشان القيم الافتراضية في القاعدة تشتغل.
   */
  async function patchWork(v: VenueRow, p: Partial<Omit<WorkVenueRow, 'venue_id'>>) {
    if (!canEdit) return say('التعديل هنا محتاج صلاحية sbotat.edit.')
    const q = v.work_venues
      ? supabase().from('work_venues').update(p).eq('venue_id', v.id).select('venue_id')
      : supabase()
          .from('work_venues')
          .upsert({ venue_id: v.id, ...p }, { onConflict: 'venue_id' })
          .select('venue_id')
    const { data, error } = await q
    if (error) return say(`مقدرناش نحفظ: ${error.message}`)
    if (rejected(data)) return say('مااتحفظش — القاعدة رفضت الكتابة، محتاج صلاحية sbotat.edit')
    await done(`مواصفات «${v.name}» اتحفظت`)
  }

  if (loading) return <Loading />

  if (loadError)
    return (
      <Card title="مقدرناش نجيب أماكن الشغل">
        <Note>
          {loadError}
          <br />
          لو الرسالة بتقول إن work_venues مش موجود أو cafe_work مش قيمة معروفة، يبقى
          WORK_MIGRATION.sql لسه ما اتشغّلش على القاعدة.
        </Note>
      </Card>
    )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-display text-18 font-black">{rows.length} مكان</span>
        <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
          {rows.filter((r) => r.is_active).length} شغّال ·{' '}
          {rows.filter((r) => r.rating_avg !== null && r.rating_avg < RATING_ALERT).length} تقييمه
          نازل
        </span>
        {!canEdit && (
          <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
            تقدر تتفرّج بس — التعديل محتاج صلاحية sbotat.edit.
          </span>
        )}
        <div className="ms-auto flex gap-2">
          <Btn onClick={reload}>حدّث</Btn>
          {canEdit && (
            <Btn kind="primary" onClick={() => setAdding((v) => !v)}>
              {adding ? 'اقفل' : 'ضيف مكان'}
            </Btn>
          )}
        </div>
      </div>

      {adding && (
        <NewVenue
          say={say}
          onDone={async (id) => {
            setAdding(false)
            setOpenId(id)
            await done('المكان اتضاف — كمّل مواصفاته تحت')
          }}
        />
      )}

      <Card hint="دوس على اسم المكان علشان تفتح مواصفاته. التقييم بييجي من تقييمات الأعضاء بعد كل سبوطة.">
        {rows.length === 0 ? (
          <Empty>مفيش أماكن شغل لسه. «ضيف مكان» وابدأ.</Empty>
        ) : (
          <div className="mt-3">
            <Table head={['المكان', 'المنطقة', 'النوع', 'الحالة', 'التقييم', 'المواصفات']}>
              {rows.map((r) => (
                <tr key={r.id} style={{ borderTop: '1px solid var(--line)' }}>
                  <td className="p-2 align-top">
                    <button
                      type="button"
                      onClick={() => setOpenId(openId === r.id ? null : r.id)}
                      className="cursor-pointer bg-transparent p-0 text-start font-display text-15 font-black"
                      style={{ color: 'var(--fg)', border: 0 }}
                    >
                      {openId === r.id ? '▾' : '▸'} {r.name}
                    </button>
                    <div className="font-body text-12" style={{ color: 'var(--muted)' }}>
                      {r.address}
                    </div>
                  </td>
                  <td className="p-2 align-top">{areaLabel(r.area)}</td>
                  <td className="p-2 align-top">
                    <Tag>{kindLabel(r.kind)}</Tag>
                  </td>
                  <td className="p-2 align-top">
                    {r.is_active ? <Tag color="#9CC5A1">شغّال</Tag> : <Tag>واقف</Tag>}
                  </td>
                  <td className="p-2 align-top">
                    <RatingTag value={r.rating_avg} />
                  </td>
                  <td className="p-2 align-top">
                    {r.work_venues ? (
                      <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
                        {r.work_venues.desks_count ?? '؟'} مكتب ·{' '}
                        {r.work_venues.wifi_mbps ? `${r.work_venues.wifi_mbps} ميجا` : 'نت ؟'}
                      </span>
                    ) : (
                      <Tag color="#F0C36D">لسه مفيش مواصفات</Tag>
                    )}
                  </td>
                </tr>
              ))}
            </Table>
          </div>
        )}
      </Card>

      {open && (
        <VenueEditor
          key={open.id}
          v={open}
          canEdit={canEdit}
          say={say}
          onVenue={(p) => patchVenue(open, p)}
          onWork={(p) => patchWork(open, p)}
          onClose={() => setOpenId(null)}
        />
      )}
    </div>
  )
}

function VenueEditor({
  v,
  canEdit,
  say,
  onVenue,
  onWork,
  onClose,
}: {
  v: VenueRow
  canEdit: boolean
  say: (m: string) => void
  onVenue: (p: Partial<Omit<VenueRow, 'work_venues' | 'id'>>) => void
  onWork: (p: Partial<Omit<WorkVenueRow, 'venue_id'>>) => void
  onClose: () => void
}) {
  const w = v.work_venues
  const days = w?.best_days ?? []

  function toggleDay(code: string) {
    const next = days.includes(code) ? days.filter((d) => d !== code) : [...days, code]
    // نحفظها بترتيب الأسبوع مش بترتيب الضغط
    onWork({ best_days: DAYS.map((d) => d.code).filter((c) => next.includes(c)) })
  }

  return (
    <Card title={v.name} hint="كل خانة بتتحفظ لوحدها أول ما تسيبها.">
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <Tag>{kindLabel(v.kind)}</Tag>
        <Tag>{areaLabel(v.area)}</Tag>
        <RatingTag value={v.rating_avg} />
        <div className="ms-auto">
          <Btn onClick={onClose}>اقفل</Btn>
        </div>
      </div>

      {v.rating_avg !== null && v.rating_avg < RATING_ALERT && (
        <Note>
          التقييم نزل تحت {RATING_ALERT}. شوف تقييمات آخر سبوطات في الحجوزات، وكلّم المكان قبل ما
          تعلن عليه سبوطة جديدة.
        </Note>
      )}

      {/* ---------------- المكان نفسه */}
      <div className="mt-4 font-display text-16 font-black">المكان</div>
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <TextField
          label="الاسم"
          value={v.name}
          onSave={(x) => {
            const n = x.trim()
            if (!n) return say('الاسم ما ينفعش يبقى فاضي.')
            onVenue({ name: n })
          }}
        />
        <TextField
          label="العنوان"
          value={v.address}
          hint="بيظهر للعضو بعد الحجز بس."
          onSave={(x) => {
            const n = x.trim()
            if (!n) return say('العنوان ما ينفعش يبقى فاضي.')
            onVenue({ address: n })
          }}
        />
        <SelectField
          label="المنطقة"
          value={v.area}
          options={AREAS}
          onChange={(x) => {
            if (x !== v.area) onVenue({ area: x })
          }}
        />
        <SelectField
          label="النوع"
          value={v.kind}
          options={WORK_KINDS}
          onChange={(x) => {
            if (x !== v.kind) onVenue({ kind: x })
          }}
        />
      </div>
      <div className="mt-3">
        <Toggle
          label={v.is_active ? 'شغّال — بيظهر في الموقع' : 'واقف — مخفي من الموقع'}
          value={v.is_active}
          hint="وقّفه لو المكان قفل أو التقييم نزل ومش عايز تعلن عليه."
          onChange={(x) => onVenue({ is_active: x })}
        />
      </div>

      {/* ---------------- المواصفات */}
      <div className="mt-5 font-display text-16 font-black">مواصفات الشغل</div>
      {!w && (
        <Note>
          لسه مفيش صف مواصفات للمكان ده — أول خانة تحفظها هتعمله. من غير مواصفات المكان
          مش هيظهر في صفحة الأماكن.
        </Note>
      )}
      <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <NumberField
          label="عدد المكاتب"
          value={w?.desks_count ?? 0}
          min={0}
          suffix="مكتب"
          hint="الكراسي اللي ينفع تتحجز لسبوطة شغل."
          onSave={(x) => onWork({ desks_count: Math.max(0, Math.round(x)) })}
        />
        <NumberField
          label="سرعة النت"
          value={w?.wifi_mbps ?? 0}
          min={0}
          suffix="ميجا"
          hint="قيسها بنفسك مرة قبل ما تكتبها."
          onSave={(x) => onWork({ wifi_mbps: Math.max(0, Math.round(x)) })}
        />
        <TextField
          label="ملاحظة على النت"
          value={w?.wifi_note_ar ?? ''}
          placeholder="ثابت الصبح، بيتقل بعد الضهر"
          onSave={(x) => onWork({ wifi_note_ar: x.trim() || null })}
        />
        <SelectField
          label="البريز"
          value={w?.power_outlets ?? ''}
          options={OUTLETS}
          onChange={(x) => {
            if (x !== (w?.power_outlets ?? '')) onWork({ power_outlets: x || null })
          }}
        />
        <SelectField
          label="الصوت"
          value={w?.noise_level ?? ''}
          options={NOISE}
          onChange={(x) => {
            if (x !== (w?.noise_level ?? '')) onWork({ noise_level: x || null })
          }}
        />
        <NumberField
          label="الحد الأدنى للطلب"
          value={toPounds(w?.min_consumption)}
          min={0}
          suffix="جنيه"
          hint={`اللي المكان بيطلبه من كل واحد. دلوقتي ${money(w?.min_consumption)}`}
          onSave={(x) => onWork({ min_consumption: toPiastres(Math.max(0, x)) })}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-6">
        <Toggle
          label="فيه أوضة اجتماعات"
          value={Boolean(w?.has_meeting_room)}
          onChange={(x) => onWork({ has_meeting_room: x })}
        />
        <Toggle
          label="فيه باركنج"
          value={Boolean(w?.has_parking)}
          onChange={(x) => onWork({ has_parking: x })}
        />
        <Toggle
          label="فيه تكييف"
          value={Boolean(w?.has_ac)}
          onChange={(x) => onWork({ has_ac: x })}
        />
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <TimeField
          label="بيفتح الساعة"
          value={hhmm(w?.open_from)}
          onSave={(x) => onWork({ open_from: x || null })}
        />
        <TimeField
          label="بيقفل الساعة"
          value={hhmm(w?.open_to)}
          onSave={(x) => onWork({ open_to: x || null })}
        />
      </div>

      <div className="mt-4">
        <div className="font-body text-13" style={{ color: 'var(--muted)' }}>
          أحسن أيام للشغل هناك
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {DAYS.map((d) => {
            const on = days.includes(d.code)
            return (
              <button
                key={d.code}
                type="button"
                disabled={!canEdit}
                aria-pressed={on}
                onClick={() => toggleDay(d.code)}
                className="cursor-pointer rounded-pill px-3 py-1 font-display text-14 font-black disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  background: on ? 'var(--fg)' : 'transparent',
                  color: on ? 'var(--bg)' : 'var(--fg)',
                  border: `2px solid ${on ? 'var(--fg)' : 'var(--chip-idle-border)'}`,
                }}
              >
                {d.label}
              </button>
            )
          })}
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2">
        <TextField
          label="الصور"
          value={(w?.photos ?? []).join('\n')}
          multiline
          hint="مسار الصورة في التخزين، صورة في كل سطر. الرفع من هنا جاي في مرحلة بعدين."
          placeholder="work-venues/cafe-1/1.jpg"
          onSave={(x) => onWork({ photos: toList(x) })}
        />
        <TextField
          label="ملاحظات داخلية"
          value={w?.notes_ar ?? ''}
          multiline
          hint="للفريق بس — العضو ما بيشوفهاش."
          onSave={(x) => onWork({ notes_ar: x.trim() || null })}
        />
      </div>

      <div className="mt-4 flex flex-wrap gap-4">
        <NumberField
          label="سعر الكرسي بالجملة"
          value={toPounds(w?.wholesale_seat_price)}
          min={0}
          suffix="جنيه"
          hint={`اللي بندفعه للمكان عن كل كرسي. داخلي. دلوقتي ${money(w?.wholesale_seat_price)}`}
          onSave={(x) => onWork({ wholesale_seat_price: toPiastres(Math.max(0, x)) })}
        />
      </div>

      <Note>
        سعر الجملة والملاحظات الداخلية ما بيطلعوش للأعضاء — الموقع بيقرا من عرض
        work_venues_public اللي من غيرهم. باقي المواصفات بتظهر في صفحة الأماكن.
      </Note>
    </Card>
  )
}

/** ضيف مكان: صف في venues بنوع cafe_work + صف مواصفات فاضي في work_venues */
function NewVenue({
  say,
  onDone,
}: {
  say: (m: string) => void
  onDone: (id: string) => Promise<void>
}) {
  const [name, setName] = useState('')
  const [address, setAddress] = useState('')
  const [area, setArea] = useState('tagamoa')
  const [kind, setKind] = useState('cafe_work')
  const [active, setActive] = useState(false)
  const [busy, setBusy] = useState(false)

  async function create() {
    const n = name.trim()
    const a = address.trim()
    if (!n) return say('اكتب اسم المكان الأول.')
    if (!a) return say('اكتب العنوان — القاعدة مش بتقبل مكان من غيره.')

    setBusy(true)
    const db = supabase()
    const { data, error } = await db
      .from('venues')
      .insert({ name: n, address: a, area, kind, is_active: active })
      .select('id')
      .maybeSingle()
    if (error) {
      setBusy(false)
      return say(`مقدرناش نضيف المكان: ${error.message}`)
    }
    const id = (data as { id: string } | null)?.id
    if (!id) {
      setBusy(false)
      return say('مااتضافش — القاعدة رفضت الكتابة، محتاج صلاحية sbotat.edit')
    }
    const wv = await db
      .from('work_venues')
      .upsert({ venue_id: id }, { onConflict: 'venue_id' })
      .select('venue_id')
    setBusy(false)
    if (wv.error || rejected(wv.data)) {
      say(
        `المكان اتضاف بس صف المواصفات لأ: ${wv.error?.message ?? 'القاعدة رفضت الكتابة'} — افتحه واحفظ أي خانة وهيتعمل.`
      )
    }
    setName('')
    setAddress('')
    await onDone(id)
  }

  return (
    <Card title="مكان شغل جديد" hint="الأساسي دلوقتي، والمواصفات تكمّلها بعد ما يتعمل.">
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <Field label="الاسم" value={name} onChange={setName} placeholder="مثلًا: كافيه الصبح" />
        <Field
          label="العنوان"
          value={address}
          onChange={setAddress}
          placeholder="شارع … — بيظهر للعضو بعد الحجز"
        />
        <SelectField label="المنطقة" value={area} options={AREAS} onChange={setArea} />
        <SelectField label="النوع" value={kind} options={WORK_KINDS} onChange={setKind} />
      </div>
      <div className="mt-3">
        <Toggle
          label="شغّال من دلوقتي"
          value={active}
          hint="سيبه واقف لحد ما تكمّل المواصفات وتتأكد من المكان."
          onChange={setActive}
        />
      </div>
      <div className="mt-3">
        <Btn kind="primary" onClick={create} disabled={busy}>
          {busy ? 'ثانية واحدة…' : 'ضيف المكان'}
        </Btn>
      </div>
    </Card>
  )
}

/* ================================================ ٣ · الإعدادات */

interface WorkNumSpec {
  col: keyof WorkSettings
  label: string
  hint: string
  suffix?: string
  /** متخزّن قروش — بنعرض جنيه ونحفظ قروش */
  money?: boolean
  min?: number
  max?: number
}

interface WorkTimeSpec {
  col: keyof WorkSettings
  label: string
  hint: string
}

const WORK_GROUPS: { title: string; nums?: WorkNumSpec[]; times?: WorkTimeSpec[] }[] = [
  {
    title: 'الكروت',
    nums: [
      {
        col: 'work_pass4_price',
        label: 'كارت ٤ أيام',
        suffix: 'جنيه',
        money: true,
        hint: 'سعر الكارت الصغير. متخزّن قروش في القاعدة.',
        min: 0,
      },
      {
        col: 'work_pass4_weeks',
        label: 'كارت ٤ أيام صالح',
        suffix: 'أسبوع',
        hint: 'من يوم ما نعتمد التحويل.',
        min: 1,
      },
      {
        col: 'work_pass8_price',
        label: 'كارت ٨ أيام',
        suffix: 'جنيه',
        money: true,
        hint: 'سعر الكارت الكبير.',
        min: 0,
      },
      {
        col: 'work_pass8_weeks',
        label: 'كارت ٨ أيام صالح',
        suffix: 'أسبوع',
        hint: 'من يوم ما نعتمد التحويل.',
        min: 1,
      },
      {
        col: 'work_pass_refund_days',
        label: 'رجوع الجلسة لو ألغى قبل',
        suffix: 'يوم',
        hint: 'الإلغاء قبل السبوطة بالمدة دي بيرجّع الجلسة للكارت. بعدها بتتحسب.',
        min: 0,
      },
    ],
  },
  {
    title: 'الجلسة المفردة',
    nums: [
      {
        col: 'work_single_price',
        label: 'جلسة واحدة',
        suffix: 'جنيه',
        money: true,
        hint: 'اللي بيدفعه اللي جاي من غير كارت.',
        min: 0,
      },
      {
        col: 'work_first_time_price',
        label: 'أول مرة',
        suffix: 'جنيه',
        money: true,
        hint: 'سعر أول سبوطة شغل للعضو — بيظهر بس لو ما حجزش شغل قبل كده.',
        min: 0,
      },
    ],
  },
  {
    title: 'المجموعة واليوم',
    nums: [
      {
        col: 'work_profession_mix_max',
        label: 'أقصى عدد من نفس المجال',
        suffix: 'شخص',
        hint: 'المطابقة مش هتحط في المجموعة أكتر من كده من مجال واحد.',
        min: 1,
      },
      {
        col: 'work_recurring_lead_days',
        label: 'اليوم الثابت بيتحجز قبلها بـ',
        suffix: 'يوم',
        hint: 'المهمة اليومية بتولّد حجز اليوم الثابت قبل موعده بالمدة دي.',
        min: 1,
      },
    ],
    times: [
      {
        col: 'work_lunch_at',
        label: 'ساعة الغدا',
        hint: 'بتظهر في جدول يوم الشغل.',
      },
      {
        col: 'work_complaint_at',
        label: 'ساعة الشكوى',
        hint: 'الوقفة اللي كل واحد بيقول فيها إيه اللي معطّله — بتظهر في الجدول.',
      },
    ],
  },
  {
    title: 'المؤشرات',
    nums: [
      {
        col: 'work_conversion_target_pct',
        label: 'مستهدف التحوّل شغل → ترفيه',
        suffix: '%',
        hint: 'نسبة اللي حضروا شغل وحجزوا سبوطة ترفيه خلال ٣٠ يوم. تبويب المؤشرات بيلوّن على أساسها.',
        min: 0,
        max: 100,
      },
    ],
  },
]

function WorkSettingsTab({ canEdit, say }: { canEdit: boolean; say: (m: string) => void }) {
  const [row, setRow] = useState<WorkSettings | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)

  const reload = useCallback(async () => {
    const { data, error } = await supabase()
      .from('settings')
      .select(WORK_SETTING_COLS.join(','))
      .eq('id', true)
      .maybeSingle()
    setLoading(false)
    if (error) {
      setLoadError(error.message)
      return
    }
    setLoadError(null)
    setRow((data ?? null) as unknown as WorkSettings | null)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  async function save(col: keyof WorkSettings, value: number | string | null, label: string) {
    if (!canEdit) return say('التعديل هنا محتاج صلاحية settings.edit.')
    const { data, error } = await supabase()
      .from('settings')
      .update({ [col]: value })
      .eq('id', true)
      .select('id')
    if (error) return say(`«${label}» مااتحفظش: ${error.message}`)
    if (rejected(data)) return say(`«${label}» مااتحفظش — القاعدة رفضت الكتابة`)
    setRow((s) => (s ? { ...s, [col]: value } : s))
    const ok = await revalidateSite()
    say(ok ? `«${label}» اتحفظ ✓ وبان في الموقع` : `«${label}» اتحفظ ✓ — هيبان خلال أقل من دقيقة`)
  }

  if (loading) return <Loading />

  if (loadError)
    return (
      <Card title="مقدرناش نجيب إعدادات الشغل">
        <Note>
          {loadError}
          <br />
          لو الرسالة بتقول إن عمود work_ مش موجود، يبقى WORK_MIGRATION.sql لسه ما اتشغّلش على
          القاعدة.
        </Note>
      </Card>
    )

  if (!row) return <Empty>مفيش صف إعدادات في القاعدة. ده لازم يتظبط من هجرة، مش من هنا.</Empty>

  return (
    <div className="flex flex-col gap-4">
      <div className="font-body text-14" style={{ color: 'var(--muted)' }}>
        كل رقم هنا بيتحفظ لما تسيب الخانة، وبيأثر على صفحات الشغل على طول.
        {!canEdit && ' إنت شايف بس — التعديل محتاج settings.edit.'}
      </div>

      {WORK_GROUPS.map((g) => (
        <Card key={g.title} title={g.title}>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {(g.nums ?? []).map((f) => {
              const raw = Number(row[f.col] ?? 0)
              const shown = f.money ? Math.round(raw / 100) : raw
              if (!canEdit)
                return (
                  <ReadOnly
                    key={f.col}
                    label={f.label}
                    value={`${shown.toLocaleString('ar-EG')}${f.suffix ? ` ${f.suffix}` : ''}`}
                    hint={f.hint}
                  />
                )
              return (
                <NumberField
                  key={`${f.col}-${raw}`}
                  label={f.label}
                  value={shown}
                  min={f.min}
                  max={f.max}
                  suffix={f.suffix}
                  hint={f.money ? `${f.hint} دلوقتي ${money(raw)}` : f.hint}
                  onSave={(v) => {
                    if (f.min !== undefined && v < f.min) return say(`«${f.label}» أقل من ${f.min}.`)
                    if (f.max !== undefined && v > f.max) return say(`«${f.label}» أكبر من ${f.max}.`)
                    save(f.col, f.money ? toPiastres(v) : Math.round(v), f.label)
                  }}
                />
              )
            })}

            {(g.times ?? []).map((t) => {
              const val = hhmm(row[t.col] as string | null)
              if (!canEdit) return <ReadOnly key={t.col} label={t.label} value={val || '—'} hint={t.hint} />
              return (
                <TimeField
                  key={t.col}
                  label={t.label}
                  value={val}
                  hint={t.hint}
                  onSave={(v) => {
                    if (!v) return say(`«${t.label}» لازم يبقى وقت.`)
                    save(t.col, v, t.label)
                  }}
                />
              )
            })}
          </div>
        </Card>
      ))}

      <Note>
        الأسعار متخزّنة قروش في القاعدة زي باقي الموقع — إنت بتكتب بالجنيه وإحنا بنضرب في ١٠٠.
        الأوقات بتوقيت القاهرة.
      </Note>
    </div>
  )
}
