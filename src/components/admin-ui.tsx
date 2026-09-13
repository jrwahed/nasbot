'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { supabase, publicMediaUrl, PUBLIC_MEDIA_BUCKET } from '@/lib/supabase'
import { WA_BOOKING_KEY, fillWaMessage, waHref } from '@/lib/wa-message'

/**
 * قطع الواجهة المشتركة في اللوحة.
 *
 * الملف ده **ثابت** — صفحات اللوحة بتستورد منه وما بتعدّلوش،
 * علشان كل الأقسام تفضل شكلها واحد.
 *
 * ملاحظة: نصوص اللوحة بتفضل في الكود عن قصد (ADMIN_GUIDE.md §1) —
 * اللوحة أداة داخلية مش صفحة بيقراها الأعضاء.
 */

/* ---------------------------------------------------------- تنسيقات */

const INPUT = 'w-full rounded-14 px-3 py-2 font-body text-16'
const inputStyle = {
  background: 'var(--bg)',
  color: 'var(--fg)',
  border: '2px solid var(--line)',
}

/** جنيه من القروش */
export const money = (piastres: number | null | undefined) =>
  `${Math.round((piastres ?? 0) / 100).toLocaleString('ar-EG')} جنيه`

/** وقت بتوقيت القاهرة */
export const when = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleString('ar-EG', {
        timeZone: 'Africa/Cairo',
        dateStyle: 'short',
        timeStyle: 'short',
      })
    : '—'

/** تاريخ بس */
export const day = (iso: string | null | undefined) =>
  iso
    ? new Date(iso).toLocaleDateString('ar-EG', {
        timeZone: 'Africa/Cairo',
        dateStyle: 'medium',
      })
    : '—'

/* ------------------------------------------------------ حساب أيام القاهرة */

/**
 * الفلترة بالتاريخ لازم تروح للقاعدة (`.gte`/`.lt` على عمود timestamptz)،
 * والقاعدة بتخزّن UTC واللوحة بتفكّر بيوم القاهرة. الدوال دي بتترجم بين
 * الاتنين، وموجودة هنا مرة واحدة علشان ما تتكررش في كل صفحة.
 */

/** تاريخ القاهرة على شكل 2026-09-08 */
export const cairoDay = (iso: string | number | Date) =>
  new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Africa/Cairo' })

/** النهارده بتوقيت القاهرة */
export const todayCairo = () => cairoDay(new Date())

/** فرق توقيت القاهرة عن UTC بالملي ثانية في اللحظة دي (بيحسب الصيفي لوحده) */
function cairoOffsetMs(at: Date): number {
  const utc = new Date(at.toLocaleString('en-US', { timeZone: 'UTC' }))
  const cairo = new Date(at.toLocaleString('en-US', { timeZone: 'Africa/Cairo' }))
  return cairo.getTime() - utc.getTime()
}

/** تاريخ وساعة بتوقيت القاهرة → ISO بتوقيت UTC للتخزين والفلترة */
export function cairoToIso(date: string, time: string): string {
  const guess = new Date(`${date}T${(time || '00:00').slice(0, 5)}:00Z`)
  if (Number.isNaN(guess.getTime())) return new Date().toISOString()
  let ms = guess.getTime() - cairoOffsetMs(guess)
  const again = cairoOffsetMs(new Date(ms))
  if (again !== cairoOffsetMs(guess)) ms = guess.getTime() - again
  return new Date(ms).toISOString()
}

/** ISO → { date: 'YYYY-MM-DD', time: 'HH:MM' } بتوقيت القاهرة */
export function cairoParts(iso: string): { date: string; time: string } {
  const d = new Date(iso)
  const date = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Africa/Cairo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(d)
  const time = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Cairo',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(d)
  return { date, time }
}

/** أول لحظة في يوم قاهرة (YYYY-MM-DD) بـ ISO — بداية مدى الفلتر */
export const cairoDayStart = (ymd: string) => cairoToIso(ymd, '00:00')

/** بيزوّد أيام على 'YYYY-MM-DD' من غير ما التوقيت يلعب */
export function dayAdd(ymd: string, days: number): string {
  const d = new Date(`${ymd}T12:00:00Z`)
  if (Number.isNaN(d.getTime())) return ymd
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

/* ---------------------------------------------------------- رسايل */

/** رسالة صغيرة بتظهر وتختفي — كل صفحة بتستعملها لتأكيد الحفظ */
export function useFlash() {
  const [msg, setMsg] = useState('')
  const flash = (m: string, ms = 3000) => {
    setMsg(m)
    setTimeout(() => setMsg(''), ms)
  }
  const node = msg ? (
    <div
      className="mt-4 rounded-14 px-4 py-3 font-display text-16 font-black"
      style={{ background: 'var(--surface)' }}
    >
      {msg}
    </div>
  ) : null
  return { flash, node, msg }
}

/* ---------------------------------------------------------- حاويات */

export function Card({
  title,
  hint,
  children,
  dim,
}: {
  title?: string
  hint?: string
  children: ReactNode
  dim?: boolean
}) {
  return (
    <section
      className="rounded-20 p-4"
      style={{ background: 'var(--surface)', opacity: dim ? 0.6 : 1 }}
    >
      {title && <div className="font-display text-18 font-black">{title}</div>}
      {hint && (
        <div className="mt-1 font-body text-13" style={{ color: 'var(--muted)' }}>
          {hint}
        </div>
      )}
      {children}
    </section>
  )
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mt-6">
      <h2 className="m-0 font-display text-22 font-black">{title}</h2>
      <div className="mt-3">{children}</div>
    </div>
  )
}

export function Tabs<T extends string>({
  tabs,
  value,
  onChange,
  extra,
}: {
  tabs: { id: T; label: string }[]
  value: T
  onChange: (id: T) => void
  extra?: ReactNode
}) {
  return (
    <div className="nb-scroll-x mt-6 gap-2">
      {tabs.map((t) => {
        const on = t.id === value
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => onChange(t.id)}
            aria-pressed={on}
            className="cursor-pointer whitespace-nowrap rounded-pill px-4 py-2 font-display text-15 font-black"
            style={{
              background: on ? 'var(--fg)' : 'transparent',
              color: on ? 'var(--bg)' : 'var(--fg)',
              border: `2px solid ${on ? 'var(--fg)' : 'var(--chip-idle-border)'}`,
            }}
          >
            {t.label}
          </button>
        )
      })}
      {extra && <div className="ms-auto flex items-center gap-2">{extra}</div>}
    </div>
  )
}

/* ---------------------------------------------------------- أزرار */

export function Btn({
  children,
  onClick,
  kind = 'ghost',
  disabled,
  type = 'button',
}: {
  children: ReactNode
  onClick?: () => void
  kind?: 'primary' | 'ghost' | 'danger'
  disabled?: boolean
  type?: 'button' | 'submit'
}) {
  const style =
    kind === 'primary'
      ? { background: '#F4632A', color: '#14161A', border: 0 }
      : kind === 'danger'
        ? { background: 'transparent', color: 'var(--err-text)', border: '2px solid var(--err-text)' }
        : { background: 'transparent', color: 'var(--fg)', border: '2px solid var(--chip-idle-border)' }

  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className="cursor-pointer rounded-pill px-4 py-2 font-display text-15 font-black disabled:cursor-not-allowed disabled:opacity-40"
      style={style}
    >
      {children}
    </button>
  )
}

/* ---------------------------------------------------------- واتساب */

/** أصل الموقع — علشان الروابط اللي بتتبعت للأعضاء تبقى كاملة */
export function useSiteOrigin(): string {
  const [o, setO] = useState('')
  useEffect(() => setO(window.location.origin), [])
  return o
}


/**
 * نص قالب `whatsapp_booking` من القاعدة — مرة واحدة للصفحة.
 *
 * بيرجّع `null` وهو لسه بيجيب، و`''` لو القالب مش موجود (ساعتها الزرار
 * بيتقفل بدل ما يفتح واتساب برسالة فاضية).
 */
export function useWaTemplate(): string | null {
  const [body, setBody] = useState<string | null>(null)
  useEffect(() => {
    let alive = true
    void supabase()
      .from('notification_templates')
      .select('body_ar')
      .eq('key', WA_BOOKING_KEY)
      .maybeSingle()
      .then((res: { data: { body_ar: string } | null }) => {
        if (alive) setBody((res.data?.body_ar ?? '').trim())
      })
    return () => {
      alive = false
    }
  }, [])
  return body
}

/**
 * زرار بيفتح واتساب الحاجز برسالة جاهزة من القالب.
 *
 * ⚠ مش بيبعت حاجة — بيفتح المحادثة والرسالة مكتوبة، والمالك هو اللي بيدوس
 *    «إرسال». الواتساب التلقائي مش متفعّل، ولو اتفعّل يبقى من المصرف مش
 *    من هنا.
 */
export function WaBtn({
  phone,
  values,
  template,
  label = 'واتساب',
}: {
  phone: string | null | undefined
  values: readonly string[]
  template: string | null
  label?: string
}) {
  const href = template ? waHref(phone, fillWaMessage(template, values)) : null

  if (!href) {
    return (
      <span className="font-body text-12" style={{ color: 'var(--muted)' }}>
        {template === null ? '…' : template === '' ? 'مفيش قالب' : 'رقم مش صالح'}
      </span>
    )
  }

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1 rounded-pill px-3 py-1 font-display text-13 font-black no-underline"
      style={{ background: '#25D366', color: '#14161A', border: 0 }}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
        <path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22h.01c5.46 0 9.91-4.45 9.91-9.91S17.5 2 12.04 2Zm0 18.15h-.01a8.2 8.2 0 0 1-4.19-1.15l-.3-.18-3.12.82.83-3.04-.2-.31a8.21 8.21 0 0 1-1.26-4.38c0-4.54 3.7-8.23 8.25-8.23 2.2 0 4.27.86 5.83 2.42a8.19 8.19 0 0 1 2.41 5.82c0 4.54-3.7 8.23-8.24 8.23Zm4.52-6.16c-.25-.12-1.47-.72-1.69-.81-.23-.08-.39-.12-.56.13-.16.24-.64.8-.78.97-.15.16-.29.18-.53.06-.25-.12-1.05-.39-1.99-1.23-.74-.66-1.23-1.470-1.38-1.72-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.43.12-.15.16-.25.25-.41.08-.17.04-.31-.02-.43-.06-.12-.56-1.34-.76-1.84-.2-.48-.4-.42-.56-.43h-.47c-.16 0-.43.06-.65.31-.22.25-.85.83-.85 2.03s.87 2.35.99 2.51c.12.16 1.71 2.61 4.15 3.66.58.25 1.03.4 1.39.51.58.19 1.11.16 1.53.1.47-.07 1.47-.6 1.67-1.18.21-.58.21-1.07.15-1.18-.06-.1-.22-.16-.47-.28Z" />
      </svg>
      {label}
    </a>
  )
}

/* ---------------------------------------------------------- حقول */

/** حقل نص — بيحفظ لما تسيبه، زي باقي اللوحة */
export function TextField({
  label,
  value,
  onSave,
  hint,
  multiline,
  placeholder,
}: {
  label: string
  value: string
  onSave: (v: string) => void
  hint?: string
  multiline?: boolean
  placeholder?: string
}) {
  const common = {
    defaultValue: value,
    placeholder,
    className: INPUT,
    style: inputStyle,
    onBlur: (e: { target: { value: string } }) => {
      if (e.target.value !== value) onSave(e.target.value)
    },
  }
  return (
    <label className="flex flex-col gap-1">
      <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
        {label}
      </span>
      {multiline ? <textarea rows={3} {...common} /> : <input {...common} />}
      {hint && (
        <span className="font-body text-12" style={{ color: 'var(--muted)' }}>
          {hint}
        </span>
      )}
    </label>
  )
}

export function NumberField({
  label,
  value,
  onSave,
  hint,
  min,
  max,
  suffix,
}: {
  label: string
  value: number
  onSave: (v: number) => void
  hint?: string
  min?: number
  max?: number
  suffix?: string
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
        {label}
      </span>
      <span className="flex items-center gap-2">
        <input
          type="number"
          defaultValue={value}
          min={min}
          max={max}
          className="w-[120px] rounded-14 px-3 py-2 font-body text-16"
          style={inputStyle}
          onBlur={(e) => {
            const n = Number(e.target.value)
            if (!Number.isNaN(n) && n !== value) onSave(n)
          }}
        />
        {suffix && <span className="font-body text-14">{suffix}</span>}
      </span>
      {hint && (
        <span className="font-body text-12" style={{ color: 'var(--muted)' }}>
          {hint}
        </span>
      )}
    </label>
  )
}

export function Toggle({
  label,
  value,
  onChange,
  hint,
}: {
  label: string
  value: boolean
  onChange: (v: boolean) => void
  hint?: string
}) {
  return (
    <label className="flex items-start gap-2">
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1"
      />
      <span className="flex flex-col">
        <span className="font-body text-15">{label}</span>
        {hint && (
          <span className="font-body text-12" style={{ color: 'var(--muted)' }}>
            {hint}
          </span>
        )}
      </span>
    </label>
  )
}

export function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label?: string
  value: string
  options: { value: string; label: string }[]
  onChange: (v: string) => void
}) {
  return (
    <label className="flex flex-col gap-1">
      {label && (
        <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
          {label}
        </span>
      )}
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-14 px-3 py-2 font-body text-16"
        style={inputStyle}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  )
}

/* ---------------------------------------------------------- جداول */

export function Table({
  head,
  children,
}: {
  head: string[]
  children: ReactNode
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse font-body text-14">
        <thead>
          <tr>
            {head.map((h, i) => (
              <th key={i} className="p-2 text-start font-display text-15 font-black">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>{children}</tbody>
      </table>
    </div>
  )
}

export function Empty({ children }: { children: ReactNode }) {
  return (
    <div className="py-8 font-body text-16" style={{ color: 'var(--muted)' }}>
      {children}
    </div>
  )
}

/* ---------------------------------------------------------- تقليب الصفحات */

/**
 * حجم الصفحة في جداول اللوحة.
 *
 * القيمة الحقيقية من `settings.admin_page_size` (هجرة 0071) — `AdminShell`
 * بيقراها مرة واحدة وبينده `setAdminPageSize` **قبل** ما يرسم أي صفحة، فكل
 * الاستعلامات بتشوف الرقم الصح. الرقم اللي هنا مجرد قيمة أولية لو القراية
 * فشلت أو الهجرة لسه ما اتلزقتش.
 *
 * `let` مش `const` عن قصد: ESM بتصدّر ربط حي، فكل اللي مستورد الرقم بيشوف
 * التحديث من غير ما نمرّره في props عبر سبع صفحات.
 */
export let ADMIN_PAGE_SIZE = 50

/**
 * أقصى عدد صفوف بنمسحه لما نحتاج نبص على أكتر من صفحة —
 * قوايم الفلاتر، الأرقام اللي فوق الجدول، وتنزيل CSV.
 * مشتق من حجم الصفحة علشان يفضل رقم واحد بس في المشروع، ونفس الملاحظة فوق:
 * مكانه الصح `settings`.
 */
export let ADMIN_SCAN_MAX = ADMIN_PAGE_SIZE * 20

/**
 * بيتنده من AdminShell بعد ما يقرا الإعدادات. بيتجاهل أي قيمة بره المعقول
 * (نفس حدود القيد في القاعدة: 10..200) علشان صف إعدادات بايظ ما يكسرش اللوحة.
 */
export function setAdminPageSize(n: unknown) {
  const v = Number(n)
  if (!Number.isFinite(v) || v < 10 || v > 200) return
  ADMIN_PAGE_SIZE = Math.floor(v)
  ADMIN_SCAN_MAX = ADMIN_PAGE_SIZE * 20
}

/** رقم بالعربي — نفس أسلوب money() */
const arNum = (n: number) => n.toLocaleString('ar-EG')

/** آخر رقم صفحة ممكن (من صفر) — بيتحسب من العدد الكلي */
export const lastPage = (total: number, pageSize = ADMIN_PAGE_SIZE) =>
  Math.max(0, Math.ceil(total / pageSize) - 1)

/**
 * تقليب الصفحات — القطعة الوحيدة اللي كل جداول اللوحة بتستعملها.
 *
 * الصفحة نفسها بتجيب الصفوف بـ `.range(from, to)` من القاعدة،
 * ودي بترسم «من كام لكام» والزراير بس. لو `total` موجود (يعني الصفحة
 * طلبت `{ count: 'exact' }`) بنبيّن العدد الكلي وعدد الصفحات،
 * ولو مش موجود بنعرف إن فيه صفحة جاية من إن الصفحة دي جت كاملة.
 */
export function Pager({
  page,
  shown,
  total,
  pageSize = ADMIN_PAGE_SIZE,
  onPage,
  busy,
  note,
}: {
  /** رقم الصفحة الحالية من صفر */
  page: number
  /** عدد الصفوف اللي رجعت في الصفحة دي */
  shown: number
  /** العدد الكلي بعد الفلتر — سيبه فاضي لو جيبه غالي */
  total?: number | null
  pageSize?: number
  onPage: (page: number) => void
  busy?: boolean
  note?: string
}) {
  const hasTotal = typeof total === 'number'
  const first = shown === 0 ? 0 : page * pageSize + 1
  const last = page * pageSize + shown
  const hasPrev = page > 0
  const hasNext = hasTotal ? last < total : shown === pageSize
  const pages = hasTotal ? lastPage(total, pageSize) + 1 : null

  return (
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <span className="font-body text-14" style={{ color: 'var(--muted)' }}>
        {shown === 0
          ? 'مفيش صفوف'
          : `${arNum(first)}–${arNum(last)}${hasTotal ? ` من ${arNum(total)}` : ''}`}
      </span>

      {(hasPrev || hasNext) && (
        <>
          <Btn onClick={() => onPage(page - 1)} disabled={Boolean(busy) || !hasPrev}>
            اللي قبله
          </Btn>
          <Btn onClick={() => onPage(page + 1)} disabled={Boolean(busy) || !hasNext}>
            اللي بعده
          </Btn>
          <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
            صفحة {arNum(page + 1)}
            {pages ? ` من ${arNum(pages)}` : ''}
          </span>
        </>
      )}

      {note && (
        <span className="font-body text-12" style={{ color: 'var(--muted)' }}>
          {note}
        </span>
      )}
    </div>
  )
}

export function Loading() {
  return (
    <div className="py-8 font-body text-16" style={{ color: 'var(--muted)' }}>
      ثانية واحدة…
    </div>
  )
}

/** شارة حالة صغيرة */
export function Tag({ children, color }: { children: ReactNode; color?: string }) {
  return (
    <span
      className="whitespace-nowrap rounded-pill px-2 py-[2px] font-body text-12"
      style={{ background: color ?? 'var(--bg)', color: color ? '#14161A' : 'var(--muted)' }}
    >
      {children}
    </span>
  )
}

/** رقم كبير مع عنوانه */
export function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-16 px-4 py-3" style={{ background: 'var(--surface)' }}>
      <div className="font-body text-13" style={{ color: 'var(--muted)' }}>
        {label}
      </div>
      <div className="font-display text-28 font-black">{value}</div>
      {hint && (
        <div className="font-body text-12" style={{ color: 'var(--muted)' }}>
          {hint}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------ صور */

/**
 * رفع صور — بيرفع في دلو `public-media` وبيرجّع **المسار** مش الرابط.
 *
 * ليه المسار؟ علشان لو عنوان مشروع سوبابيس اتغيّر، الصور ما تقعش —
 * الرابط بيتبني وقت العرض من `publicMediaUrl`.
 *
 * القيم القديمة في `hero_photos` عبارة عن أوصاف بين قوسين مربعين
 * («[صورة المجموعة الحقيقية — …]») — دي بتفضل زي ما هي وبتتعرض كنص مكان
 * الصورة، لحد ما تتشال أو تتبدّل بصورة حقيقية.
 *
 * الرفع والمسح الاتنين بيمروا من سياسات Storage (هجرة 0073) — محتاج
 * صلاحية `sbotat.edit`. لو القاعدة رفضت بتظهر رسالة، مش «اتحفظ ✓» كدابة.
 */
export function PhotosField({
  label,
  hint,
  value,
  folder,
  onSave,
}: {
  label: string
  hint?: string
  /** المسارات أو الأوصاف المتخزّنة دلوقتي */
  value: string[]
  /** فولدر جوه الدلو — عادة `templates/<id>` */
  folder: string
  onSave: (next: string[]) => void | Promise<void>
}) {
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  async function add(files: FileList | null) {
    if (!files?.length) return
    setBusy(true)
    setErr(null)
    const added: string[] = []
    for (const file of Array.from(files)) {
      const ext = (file.name.split('.').pop() ?? 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '')
      const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error } = await supabase()
        .storage.from(PUBLIC_MEDIA_BUCKET)
        .upload(path, file, { cacheControl: '31536000', upsert: false })
      if (error) {
        setErr(`مرفوعش «${file.name}»: ${error.message}`)
        break
      }
      added.push(path)
    }
    setBusy(false)
    if (added.length) await onSave([...value, ...added])
  }

  async function remove(item: string) {
    if (!confirm('نشيل الصورة دي؟')) return
    setBusy(true)
    setErr(null)
    // الأوصاف النصية مالهاش ملف — بنشيلها من القايمة وخلاص
    if (!item.startsWith('[')) {
      const { error } = await supabase().storage.from(PUBLIC_MEDIA_BUCKET).remove([item])
      if (error) {
        setBusy(false)
        setErr(`مااتشالتش: ${error.message}`)
        return
      }
    }
    setBusy(false)
    await onSave(value.filter((v) => v !== item))
  }

  return (
    <label className="flex flex-col gap-2">
      <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
        {label}
      </span>

      <div className="flex flex-wrap gap-3">
        {value.map((item) => {
          const src = publicMediaUrl(item)
          return (
            <div
              key={item}
              className="relative overflow-hidden rounded-14"
              style={{ width: 118, height: 88, border: '2px solid var(--line)', background: '#E2D2B4' }}
            >
              {src ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={src} alt="" className="h-full w-full object-cover" />
              ) : (
                <span
                  className="grid h-full w-full place-items-center p-2 text-center font-body text-11"
                  style={{ color: '#6B6455' }}
                >
                  {item}
                </span>
              )}
              <button
                type="button"
                onClick={() => remove(item)}
                disabled={busy}
                aria-label="شيل الصورة"
                className="absolute end-1 top-1 grid h-6 w-6 cursor-pointer place-items-center rounded-full font-body text-13 font-black"
                style={{ background: '#8E2F1F', color: '#FBF7EF', border: 'none' }}
              >
                ×
              </button>
            </div>
          )
        })}

        <label
          className="grid cursor-pointer place-items-center rounded-14 text-center font-body text-13"
          style={{
            width: 118,
            height: 88,
            border: '2px dashed var(--line)',
            color: 'var(--muted)',
            opacity: busy ? 0.6 : 1,
          }}
        >
          {busy ? 'بنرفع…' : '+ ضيف صورة'}
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            disabled={busy}
            className="hidden"
            onChange={(e) => {
              add(e.target.files)
              e.target.value = ''
            }}
          />
        </label>
      </div>

      {hint && (
        <span className="font-body text-12" style={{ color: 'var(--muted)' }}>
          {hint}
        </span>
      )}
      {err && (
        <span role="alert" className="font-body text-13 font-semibold" style={{ color: '#8E2F1F' }}>
          {err}
        </span>
      )}
    </label>
  )
}
