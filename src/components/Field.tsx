'use client'

import type {
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
  TextareaHTMLAttributes,
} from 'react'
import { useId } from 'react'

/**
 * الحقل — حد 2px أسود، زوايا 14، ارتفاع 52، خلفية كريمي.
 * القيم من design/نسبوط.dc.html (شاشة 8).
 * رسالة الخطأ بالعامية تحت الحقل.
 */

const boxStyle = {
  border: '2px solid #14161A',
  borderRadius: 14,
  background: '#FBF7EF',
  color: '#14161A',
  boxSizing: 'border-box' as const,
}

export function Field({
  label,
  error,
  hint,
  className = '',
  containerClassName = '',
  big = false,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & {
  label?: string
  error?: string
  hint?: string
  /** حقل الرمز — Rubik 22 بتباعد حروف */
  big?: boolean
  containerClassName?: string
}) {
  const id = useId()
  return (
    <div className={`flex w-full min-w-0 flex-col gap-1 ${containerClassName}`}>
      {label && (
        <label htmlFor={id} className="font-body text-14 font-semibold">
          {label}
        </label>
      )}
      <input
        {...rest}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        className={`min-h-[52px] w-full min-w-0 px-[14px] font-body text-16 font-semibold outline-none placeholder:text-[#8B8578] ${
          big ? 'font-display text-22 tracking-[.4em]' : ''
        } ${className}`}
        style={{ ...boxStyle, borderColor: error ? '#8E2F1F' : '#14161A' }}
      />
      {hint && !error && (
        <span className="font-body text-13" style={{ color: '#55575C' }}>
          {hint}
        </span>
      )}
      {error && (
        <span
          id={`${id}-err`}
          role="alert"
          className="font-body text-13 font-semibold"
          style={{ color: 'var(--err-text)' }}
        >
          {error}
        </span>
      )}
    </div>
  )
}

/**
 * قائمة اختيار بنفس شكل الحقل — للسنة وأمثالها.
 * أول عنصر (placeholder) بيتعطّل بعد الاختيار علشان ما يرجعش فاضي.
 */
export function Select({
  label,
  error,
  placeholder,
  options,
  className = '',
  containerClassName = '',
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & {
  label?: string
  error?: string
  placeholder?: string
  options: Array<{ value: string; label: string }>
  containerClassName?: string
}) {
  const id = useId()
  const empty = rest.value === '' || rest.value === undefined
  return (
    <div className={`flex w-full min-w-0 flex-col gap-1 ${containerClassName}`}>
      {label && (
        <label htmlFor={id} className="font-body text-14 font-semibold">
          {label}
        </label>
      )}
      <select
        {...rest}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-err` : undefined}
        className={`min-h-[52px] w-full min-w-0 appearance-none px-[14px] font-body text-16 font-semibold outline-none ${className}`}
        style={{
          ...boxStyle,
          borderColor: error ? '#8E2F1F' : '#14161A',
          color: empty ? '#8B8578' : '#14161A',
          // سهم صغير على الشمال (الصفحة RTL)
          backgroundImage:
            "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 16 16'><path d='M3 6l5 5 5-5' fill='none' stroke='%2314161A' stroke-width='2.2' stroke-linecap='round' stroke-linejoin='round'/></svg>\")",
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'left 14px center',
          paddingLeft: 40,
        }}
      >
        {placeholder !== undefined && (
          <option value="" disabled={!empty}>
            {placeholder}
          </option>
        )}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {error && (
        <span
          id={`${id}-err`}
          role="alert"
          className="font-body text-13 font-semibold"
          style={{ color: 'var(--err-text)' }}
        >
          {error}
        </span>
      )}
    </div>
  )
}

export function TextArea({
  label,
  error,
  className = '',
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string; error?: string }) {
  const id = useId()
  return (
    <div className="flex w-full flex-col gap-1">
      {label && (
        <label htmlFor={id} className="font-body text-14 font-semibold">
          {label}
        </label>
      )}
      <textarea
        {...rest}
        id={id}
        className={`min-h-[96px] w-full resize-y p-[14px] font-body text-16 outline-none ${className}`}
        style={{ ...boxStyle, borderColor: error ? '#8E2F1F' : '#14161A' }}
      />
      {error && (
        <span role="alert" className="font-body text-13 font-semibold" style={{ color: 'var(--err-text)' }}>
          {error}
        </span>
      )}
    </div>
  )
}

/**
 * اختيار كبسولي — «بنت/شاب» · المنطقة · المستوى · الميزانية.
 * المختار أسود ممتلي، والباقي حد أسود شفاف (من الملف).
 */
export function ChoicePill({
  children,
  selected,
  onClick,
  radius = 999,
  fontSize = 14,
  padding = '8px 14px',
  className = '',
  as = 'button',
}: {
  children: ReactNode
  selected: boolean
  onClick?: () => void
  radius?: number
  fontSize?: number
  padding?: string
  className?: string
  as?: 'button' | 'span'
}) {
  /**
   * الملف بيستخدم #14161A للحد والنص و#FBF7EF للنص المختار —
   * دي قيم الوضع النهاري بالظبط. بنستخدم var(--fg)/var(--bg)
   * علشان نفس الشكل يشتغل في الليلي كمان بدل ما يبقى أسود على أسود.
   */
  const style = {
    border: '2px solid var(--fg)',
    borderRadius: radius,
    background: selected ? 'var(--fg)' : 'transparent',
    color: selected ? 'var(--bg)' : 'var(--fg)',
    padding,
    fontSize,
  }
  if (as === 'span') {
    return (
      <span
        className={`inline-block text-center font-display font-black leading-none ${className}`}
        style={style}
      >
        {children}
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`min-h-[44px] cursor-pointer text-center font-display font-black leading-none ${className}`}
      style={style}
    >
      {children}
    </button>
  )
}

/** مربع الموافقة — 26px بزوايا 8، من الملف */
export function Checkbox({
  checked,
  onChange,
  children,
  error,
}: {
  checked: boolean
  onChange: (v: boolean) => void
  children: ReactNode
  error?: boolean
}) {
  return (
    <label className="flex min-h-[44px] cursor-pointer items-start gap-3">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="sr-only"
      />
      <span
        aria-hidden="true"
        className="mt-1 grid h-[26px] w-[26px] shrink-0 place-items-center font-display text-16 font-black"
        style={{
          border: `2px solid ${error ? '#8E2F1F' : 'var(--fg)'}`,
          borderRadius: 8,
          background: checked ? 'var(--fg)' : 'transparent',
          color: 'var(--bg)',
        }}
      >
        {checked ? '✓' : ''}
      </span>
      <span className="font-body text-16">{children}</span>
    </label>
  )
}
