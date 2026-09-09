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
  Stat,
  Table,
  Tabs,
  Tag,
  TextField,
  Toggle,
  day,
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
  reports: 6,
  metrics: 6,
  leads: 6,
}

/** حالات الكارت زي ما هي في pass_status_t (الهجرة 0040) */
const PASS_STATUS: { value: string; label: string }[] = [
  { value: 'pending', label: 'مستني الاعتماد' },
  { value: 'active', label: 'شغال' },
  { value: 'used_up', label: 'خلص' },
  { value: 'expired', label: 'انتهت مدته' },
  { value: 'refunded', label: 'اترد' },
  { value: 'cancelled', label: 'اتلغى' },
]

const passStatusLabel = (s: string) => PASS_STATUS.find((x) => x.value === s)?.label ?? s

const PASS_STATUS_COLOR: Record<string, string | undefined> = {
  pending: '#F2C94C',
  active: '#6FCF97',
  used_up: undefined,
  expired: undefined,
  refunded: '#F2994A',
  cancelled: '#EB5757',
}

const PASS_KIND: { value: string; label: string }[] = [
  { value: 'four', label: 'كارت ٤ أيام' },
  { value: 'eight', label: 'كارت ٨ أيام' },
]

const passKindLabel = (k: string) => PASS_KIND.find((x) => x.value === k)?.label ?? k

/**
 * `recurring_bookings.weekday` بنمط بوستجرس: 0 = الحد … 6 = السبت.
 * الترتيب ده **مش** ترتيب شرايط الموقع (بتبدأ بالسبت) — الجدول ده الترجمة.
 */
const DOW_AR: Record<number, string> = {
  0: 'الحد',
  1: 'الاتنين',
  2: 'التلات',
  3: 'الأربع',
  4: 'الخميس',
  5: 'الجمعة',
  6: 'السبت',
}

const RECURRING_STATUS: Record<string, string> = {
  active: 'شغال',
  paused: 'موقوف',
  cancelled: 'ملغي',
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
  const canPasses = me.permissions.has('payments.review')
  const canBookings = me.permissions.has('bookings.edit')

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
        {tab === 'passes' && <PassesTab canEdit={canPasses} say={say} />}
        {tab === 'recurring' && <RecurringTab canEdit={canBookings} say={say} />}
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

/* ================================================== ٤ · الكروت */

interface PassAdminRow {
  id: string
  profile_id: string
  kind: string
  sessions_total: number
  sessions_used: number
  price_paid: number
  status: string
  starts_at: string | null
  expires_at: string | null
  note: string | null
  created_at: string
  profiles: { first_name: string | null; phone: string | null } | null
}

/** الشكل اللي بييجي من PostgREST — الواحد-لواحد ساعات بيرجع مصفوفة */
interface PassAdminRaw extends Omit<PassAdminRow, 'profiles'> {
  profiles: { first_name: string | null; phone: string | null }[] | { first_name: string | null; phone: string | null } | null
}

interface PassPayRow {
  id: string
  pass_id: string
  status: string
  amount: number
  provider: string
  receipt_path: string | null
}

const PASS_COLS_ADMIN =
  'id, profile_id, kind, sessions_total, sessions_used, price_paid, status, starts_at, ' +
  'expires_at, note, created_at, profiles(first_name, phone)'

/** 01001234567 → +201001234567 (نفس منطق normalizePhone على الخادم) */
function toE164(raw: string): string | null {
  let d = raw.replace(/\D/g, '')
  if (d.startsWith('00')) d = d.slice(2)
  if (d.startsWith('20')) d = d.slice(2)
  if (d.startsWith('0')) d = d.slice(1)
  if (!/^1[0125][0-9]{8}$/.test(d)) return null
  return `+20${d}`
}

/** «٢٠٢٦-٠٩» من تاريخ ISO بتوقيت القاهرة */
const monthKey = (iso: string) => {
  const d = new Date(iso)
  const y = d.toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo', year: 'numeric' })
  const m = d.toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo', month: '2-digit' })
  return `${y}-${m}`
}

function PassesTab({ canEdit, say }: { canEdit: boolean; say: (m: string) => void }) {
  const [rows, setRows] = useState<PassAdminRow[]>([])
  const [pays, setPays] = useState<Record<string, PassPayRow>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filter, setFilter] = useState('pending')
  const [busy, setBusy] = useState<Record<string, boolean>>({})

  // «ضيف كارت يدوي»
  const [phone, setPhone] = useState('')
  const [kind, setKind] = useState('four')
  const [note, setNote] = useState('')
  const [adding, setAdding] = useState(false)

  const reload = useCallback(async () => {
    const { data, error } = await supabase()
      .from('work_passes')
      .select(PASS_COLS_ADMIN)
      .order('created_at', { ascending: false })
      .limit(400)
    setLoading(false)
    if (error) {
      setLoadError(error.message)
      return
    }
    setLoadError(null)
    const list = ((data ?? []) as unknown as PassAdminRaw[]).map((r) => ({
      ...r,
      profiles: Array.isArray(r.profiles) ? (r.profiles[0] ?? null) : r.profiles,
    }))
    setRows(list)

    // الدفعات بتلزمنا للاعتماد بس — فبنجيب دفعات الكروت المعلّقة لوحدها
    // بدل ما نحشر 400 معرّف في رابط GET واحد.
    const ids = list.filter((r) => r.status === 'pending').map((r) => r.id)
    if (ids.length) {
      const { data: pd } = await supabase()
        .from('payments')
        .select('id, pass_id, status, amount, provider, receipt_path')
        .in('pass_id', ids)
      const map: Record<string, PassPayRow> = {}
      for (const p of (pd ?? []) as PassPayRow[]) map[p.pass_id] = p
      setPays(map)
    } else {
      setPays({})
    }
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const shown = useMemo(
    () => (filter === 'all' ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter]
  )

  /** مبيعات الشهر — الكروت اللي اتدفعت فعلًا بس (المعلّق مش مبيعة) */
  const sales = useMemo(() => {
    const out = new Map<string, { n: number; total: number }>()
    for (const r of rows) {
      if (!['active', 'used_up', 'expired', 'refunded'].includes(r.status)) continue
      if (r.price_paid <= 0) continue
      const k = monthKey(r.starts_at ?? r.created_at)
      const cur = out.get(k) ?? { n: 0, total: 0 }
      out.set(k, { n: cur.n + 1, total: cur.total + r.price_paid })
    }
    return Array.from(out.entries()).sort((a, b) => b[0].localeCompare(a[0])).slice(0, 6)
  }, [rows])

  /** الاعتماد بيمشي من fn_approve_transfer بس — هي اللي بتنادي fn_activate_pass */
  async function review(r: PassAdminRow, ok: boolean) {
    if (!canEdit) return say('الاعتماد محتاج صلاحية payments.review.')
    const pay = pays[r.id]
    if (!pay) return say('مفيش دفعة مربوطة بالكارت ده — مينفعش يتعتمد من هنا.')
    const who = r.profiles?.first_name?.trim() || 'من غير اسم'
    const reason = ok ? '' : (note.trim() || '')
    if (!ok && reason.length < 4) {
      return say('اكتب سبب الرفض في خانة «السبب» تحت الأول — العضو هيوصله الكلام ده.')
    }
    const q = ok
      ? `هتأكد تحويل ${money(r.price_paid)} من ${who} وتفعّل الكارت؟`
      : `هترفض تحويل ${who} وتلغي الكارت؟\n\nالسبب: ${reason}`
    if (!confirm(q)) return

    setBusy((b) => ({ ...b, [r.id]: true }))
    const { error } = await supabase().rpc('fn_approve_transfer', {
      p_payment_id: pay.id,
      p_ok: ok,
      p_note: reason || null,
    })
    setBusy((b) => ({ ...b, [r.id]: false }))
    if (error) return say(`مقدرناش: ${error.message}`)
    await reload()
    say(ok ? `الكارت اتفعّل لـ ${who} ✓` : `الكارت اترفض — و${who} هيوصله السبب`)
  }

  /** كارت هدية/تعويض: بيتعمل active على طول بصفر جنيه ومدته من settings */
  async function addManual() {
    if (!canEdit) return say('إضافة كارت محتاجة صلاحية payments.review.')
    const e164 = toE164(phone)
    if (!e164) return say('الرقم مش مظبوط — اكتبه زي 01001234567.')
    if (note.trim().length < 4) return say('اكتب سبب الكارت (تعويض، هدية، …) — بيتسجّل مع الكارت.')

    setAdding(true)
    const { data: prof, error: pErr } = await supabase()
      .from('profiles')
      .select('id, first_name')
      .eq('phone', e164)
      .maybeSingle()
    if (pErr || !prof) {
      setAdding(false)
      return say('مفيش عضو بالرقم ده.')
    }
    const person = prof as { id: string; first_name: string | null }

    const { data: cfg } = await supabase()
      .from('settings')
      .select('work_pass4_weeks, work_pass8_weeks')
      .single()
    const weeks =
      kind === 'eight'
        ? Number((cfg as { work_pass8_weeks?: number } | null)?.work_pass8_weeks ?? 10)
        : Number((cfg as { work_pass4_weeks?: number } | null)?.work_pass4_weeks ?? 6)

    const now = new Date()
    const end = new Date(now.getTime() + weeks * 7 * 24 * 3600_000)

    const { data, error } = await supabase()
      .from('work_passes')
      .insert({
        profile_id: person.id,
        kind,
        sessions_total: kind === 'eight' ? 8 : 4,
        sessions_used: 0,
        price_paid: 0,
        status: 'active',
        starts_at: now.toISOString(),
        expires_at: end.toISOString(),
        note: note.trim(),
      })
      .select('id')
    setAdding(false)
    if (error) return say(`مقدرناش نضيف: ${error.message}`)
    if (rejected(data)) return say('مااتضافش — القاعدة رفضت، محتاج صلاحية payments.review')
    setPhone('')
    setNote('')
    await reload()
    say(`الكارت اتضاف لـ ${person.first_name?.trim() || e164} ✓`)
  }

  if (loading) return <Loading />

  if (loadError)
    return (
      <Card title="مقدرناش نجيب الكروت">
        <Empty>{loadError}</Empty>
      </Card>
    )

  return (
    <div className="flex flex-col gap-4">
      <Card title="مبيعات الكروت بالشهر" hint="الكروت المعتمدة بس — المعلّق مش محسوب.">
        {sales.length === 0 ? (
          <Empty>لسه مفيش كارت اتباع.</Empty>
        ) : (
          <div className="mt-3 flex flex-wrap gap-3">
            {sales.map(([m, v]) => (
              <Stat key={m} label={m} value={money(v.total)} hint={`${v.n} كارت`} />
            ))}
          </div>
        )}
      </Card>

      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <SelectField
            label="الحالة"
            value={filter}
            options={[{ value: 'all', label: 'الكل' }, ...PASS_STATUS]}
            onChange={setFilter}
          />
          <div className="font-body text-14" style={{ color: 'var(--muted)' }}>
            {shown.length} كارت
          </div>
        </div>

        <div className="mt-4">
          {shown.length === 0 ? (
            <Empty>مفيش كروت في الحالة دي.</Empty>
          ) : (
            <Table head={['العضو', 'النوع', 'الاستهلاك', 'الحالة', 'بينتهي', 'السعر', '']}>
              {shown.map((r) => {
                const pay = pays[r.id]
                return (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--line)' }}>
                    <td className="p-2">
                      <div className="font-display text-15 font-black">
                        {r.profiles?.first_name?.trim() || 'من غير اسم'}
                      </div>
                      <div dir="ltr" className="font-body text-13" style={{ color: 'var(--muted)' }}>
                        {r.profiles?.phone ?? '—'}
                      </div>
                      {r.note && (
                        <div className="font-body text-12" style={{ color: 'var(--muted)' }}>
                          {r.note}
                        </div>
                      )}
                    </td>
                    <td className="p-2">{passKindLabel(r.kind)}</td>
                    <td className="p-2" dir="ltr">
                      {r.sessions_used} / {r.sessions_total}
                    </td>
                    <td className="p-2">
                      <Tag color={PASS_STATUS_COLOR[r.status]}>{passStatusLabel(r.status)}</Tag>
                    </td>
                    <td className="p-2">{day(r.expires_at)}</td>
                    <td className="p-2">{money(r.price_paid)}</td>
                    <td className="p-2">
                      {r.status === 'pending' && (
                        <div className="flex flex-wrap gap-2">
                          <Btn
                            kind="primary"
                            disabled={!canEdit || busy[r.id] || !pay}
                            onClick={() => review(r, true)}
                          >
                            اعتمد
                          </Btn>
                          <Btn
                            kind="danger"
                            disabled={!canEdit || busy[r.id] || !pay}
                            onClick={() => review(r, false)}
                          >
                            ارفض
                          </Btn>
                          {!pay && (
                            <span className="font-body text-12" style={{ color: 'var(--muted)' }}>
                              مفيش دفعة
                            </span>
                          )}
                          {pay && pay.status !== 'pending_review' && (
                            <span className="font-body text-12" style={{ color: 'var(--muted)' }}>
                              لسه مرفعش صورة
                            </span>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                )
              })}
            </Table>
          )}
        </div>
      </Card>

      <Card
        title="ضيف كارت يدوي"
        hint="للتعويض أو الهدية — بيتعمل شغّال على طول بصفر جنيه، ومدته من الإعدادات."
      >
        <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="رقم العضو" value={phone} onChange={setPhone} placeholder="01001234567" />
          <SelectField label="النوع" value={kind} options={PASS_KIND} onChange={setKind} />
          <Field
            label="السبب"
            value={note}
            onChange={setNote}
            hint="بيتسجّل مع الكارت — وبيستعمل كسبب الرفض كمان."
          />
          <div className="flex items-end">
            <Btn kind="primary" disabled={!canEdit || adding} onClick={addManual}>
              ضيف الكارت
            </Btn>
          </div>
        </div>
        {!canEdit && (
          <Note>إنت شايف بس — الاعتماد وإضافة الكروت محتاجين صلاحية payments.review.</Note>
        )}
      </Card>

      <Note>
        الاعتماد بيمشي من <code>fn_approve_transfer</code> بس، وهي اللي بتنادي{' '}
        <code>fn_activate_pass</code> — الكارت بيبقى شغّال من لحظة الاعتماد ومدته بتتحسب من
        الإعدادات. متعدلش الحالة بإيدك من القاعدة، هتفصل الكارت عن الدفعة.
      </Note>
    </div>
  )
}

/* ================================================== ٥ · الأيام الثابتة */

interface RecurringAdminRow {
  id: string
  profile_id: string
  weekday: number
  time_of_day: string | null
  auto_book: boolean
  pause_until: string | null
  status: string
  last_generated_for: string | null
  venue_id: string | null
  profiles: { first_name: string | null; phone: string | null } | null
  sbota_templates: { name_ar: string | null } | null
}

interface RecurringAdminRaw
  extends Omit<RecurringAdminRow, 'profiles' | 'sbota_templates'> {
  profiles:
    | { first_name: string | null; phone: string | null }[]
    | { first_name: string | null; phone: string | null }
    | null
  sbota_templates: { name_ar: string | null }[] | { name_ar: string | null } | null
}

const RECURRING_COLS_ADMIN =
  'id, profile_id, weekday, time_of_day, auto_book, pause_until, status, ' +
  'last_generated_for, venue_id, profiles(first_name, phone), sbota_templates(name_ar)'

const one = <T,>(v: T[] | T | null): T | null => (Array.isArray(v) ? (v[0] ?? null) : v)

function RecurringTab({ canEdit, say }: { canEdit: boolean; say: (m: string) => void }) {
  const [rows, setRows] = useState<RecurringAdminRow[]>([])
  const [venueNames, setVenueNames] = useState<Record<string, string>>({})
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [filter, setFilter] = useState('active')
  const [busy, setBusy] = useState<Record<string, boolean>>({})

  const reload = useCallback(async () => {
    const [{ data, error }, { data: vs }] = await Promise.all([
      supabase()
        .from('recurring_bookings')
        .select(RECURRING_COLS_ADMIN)
        .order('weekday')
        .limit(400),
      supabase().from('venues').select('id, name'),
    ])
    setLoading(false)
    if (error) {
      setLoadError(error.message)
      return
    }
    setLoadError(null)
    setRows(
      ((data ?? []) as unknown as RecurringAdminRaw[]).map((r) => ({
        ...r,
        profiles: one(r.profiles),
        sbota_templates: one(r.sbota_templates),
      }))
    )
    const map: Record<string, string> = {}
    for (const v of (vs ?? []) as { id: string; name: string }[]) map[v.id] = v.name
    setVenueNames(map)
  }, [])

  useEffect(() => {
    reload()
  }, [reload])

  const shown = useMemo(
    () => (filter === 'all' ? rows : rows.filter((r) => r.status === filter)),
    [rows, filter]
  )

  async function patch(r: RecurringAdminRow, p: Record<string, unknown>, msg: string) {
    if (!canEdit) return say('التعديل هنا محتاج صلاحية bookings.edit.')
    setBusy((b) => ({ ...b, [r.id]: true }))
    const { data, error } = await supabase()
      .from('recurring_bookings')
      .update(p)
      .eq('id', r.id)
      .select('id')
    setBusy((b) => ({ ...b, [r.id]: false }))
    if (error) return say(`مقدرناش: ${error.message}`)
    if (rejected(data)) return say('مااتحفظش — القاعدة رفضت، محتاج صلاحية bookings.edit')
    await reload()
    say(msg)
  }

  const pauseTwoWeeks = (r: RecurringAdminRow) => {
    const until = new Date()
    until.setDate(until.getDate() + 14)
    patch(r, { pause_until: until.toISOString().slice(0, 10), status: 'active' }, 'اتوقف أسبوعين ✓')
  }

  if (loading) return <Loading />

  if (loadError)
    return (
      <Card title="مقدرناش نجيب الأيام الثابتة">
        <Empty>{loadError}</Empty>
      </Card>
    )

  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <div className="flex flex-wrap items-end gap-3">
          <SelectField
            label="الحالة"
            value={filter}
            options={[
              { value: 'all', label: 'الكل' },
              { value: 'active', label: 'شغال' },
              { value: 'paused', label: 'موقوف' },
              { value: 'cancelled', label: 'ملغي' },
            ]}
            onChange={setFilter}
          />
          <div className="font-body text-14" style={{ color: 'var(--muted)' }}>
            {shown.length} يوم ثابت
          </div>
        </div>

        <div className="mt-4">
          {shown.length === 0 ? (
            <Empty>مفيش حد عنده يوم ثابت في الحالة دي.</Empty>
          ) : (
            <Table
              head={['العضو', 'اليوم', 'المكان', 'القالب', 'حجز تلقائي', 'الحالة', 'آخر توليد', '']}
            >
              {shown.map((r) => {
                const paused = Boolean(r.pause_until && r.pause_until >= today)
                return (
                  <tr key={r.id} style={{ borderTop: '1px solid var(--line)' }}>
                    <td className="p-2">
                      <div className="font-display text-15 font-black">
                        {r.profiles?.first_name?.trim() || 'من غير اسم'}
                      </div>
                      <div dir="ltr" className="font-body text-13" style={{ color: 'var(--muted)' }}>
                        {r.profiles?.phone ?? '—'}
                      </div>
                    </td>
                    <td className="p-2">
                      {DOW_AR[r.weekday] ?? r.weekday}
                      {r.time_of_day && (
                        <span dir="ltr" className="ms-1" style={{ color: 'var(--muted)' }}>
                          {hhmm(r.time_of_day)}
                        </span>
                      )}
                    </td>
                    <td className="p-2">{r.venue_id ? (venueNames[r.venue_id] ?? '—') : 'أي مكان'}</td>
                    <td className="p-2">{r.sbota_templates?.name_ar ?? '—'}</td>
                    <td className="p-2">{r.auto_book ? 'أيوه' : 'لأ'}</td>
                    <td className="p-2">
                      <Tag color={paused ? '#F2C94C' : r.status === 'active' ? '#6FCF97' : undefined}>
                        {paused ? `موقوف لحد ${day(r.pause_until)}` : (RECURRING_STATUS[r.status] ?? r.status)}
                      </Tag>
                    </td>
                    <td className="p-2">{day(r.last_generated_for)}</td>
                    <td className="p-2">
                      <div className="flex flex-wrap gap-2">
                        {r.status !== 'cancelled' &&
                          (paused ? (
                            <Btn
                              disabled={!canEdit || busy[r.id]}
                              onClick={() => patch(r, { pause_until: null, status: 'active' }, 'رجع شغال ✓')}
                            >
                              رجّعه
                            </Btn>
                          ) : (
                            <Btn disabled={!canEdit || busy[r.id]} onClick={() => pauseTwoWeeks(r)}>
                              أوقف أسبوعين
                            </Btn>
                          ))}
                        {r.status !== 'cancelled' && (
                          <Btn
                            kind="danger"
                            disabled={!canEdit || busy[r.id]}
                            onClick={() => {
                              if (!confirm('تلغي اليوم الثابت ده؟')) return
                              patch(r, { status: 'cancelled' }, 'اتلغى ✓')
                            }}
                          >
                            ألغِ
                          </Btn>
                        )}
                        <Btn
                          disabled={!canEdit || busy[r.id] || r.status === 'cancelled'}
                          onClick={() =>
                            patch(r, { auto_book: !r.auto_book }, r.auto_book ? 'اتقفل التلقائي ✓' : 'اتفتح التلقائي ✓')
                          }
                        >
                          {r.auto_book ? 'اقفل التلقائي' : 'افتح التلقائي'}
                        </Btn>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </Table>
          )}
        </div>
      </Card>

      <Note>
        التوليد بيحصل لوحده كل يوم ٩ الصبح بتوقيت القاهرة من مهمة{' '}
        <code>nasbot-work-recurring</code> على pg_cron، قبل الموعد بـ{' '}
        <code>settings.work_recurring_lead_days</code> يوم. مفيش زر «ولّد دلوقتي» هنا لأن{' '}
        <code>job_work_recurring()</code> ممنوحة لـ <code>service_role</code> بس (الهجرة 0045)،
        فنداءها من اللوحة كان هيرجع «permission denied» دايمًا. لو عايزها بزر، لازم هجرة تعمل
        غلاف <code>security definer</code> بيتأكد من <code>fn_has_permission(&apos;bookings.edit&apos;)</code>{' '}
        وتمنحه لـ <code>authenticated</code>. لحد ساعتها شغّلها من SQL Editor:{' '}
        <code>select job_work_recurring();</code>
      </Note>
    </div>
  )
}
