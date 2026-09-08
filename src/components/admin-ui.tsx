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
