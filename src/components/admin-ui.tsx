'use client'

import { useState, type ReactNode } from 'react'

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
 * ⚠ الرقم ده مكانه الصح `settings` مش الكود (القاعدة الحاكمة رقم ٢ في CLAUDE.md).
 * إضافة عمود في `settings` محتاجة هجرة، والهجرات مش من شغل الجزء ده —
 * فالرقم مؤقتًا هنا، **في مكان واحد بالظبط** علشان نقله بعدين يبقى سطر واحد.
 * أول ما يتضاف `settings.admin_page_size`: اقراه، مرّره لـ Pager كـ pageSize،
 * وامسح الثابت ده.
 */
export const ADMIN_PAGE_SIZE = 50

/**
 * أقصى عدد صفوف بنمسحه لما نحتاج نبص على أكتر من صفحة —
 * قوايم الفلاتر، الأرقام اللي فوق الجدول، وتنزيل CSV.
 * مشتق من حجم الصفحة علشان يفضل رقم واحد بس في المشروع، ونفس الملاحظة فوق:
 * مكانه الصح `settings`.
 */
export const ADMIN_SCAN_MAX = ADMIN_PAGE_SIZE * 20

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
