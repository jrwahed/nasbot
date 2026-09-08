'use client'

import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { useT } from '@/components/CopyProvider'

/**
 * الأزرار.
 * الزر الرئيسي برتقالي Rubik 900 بارتفاع 48 على الأقل — واحد بس في كل شاشة.
 * القيم من design/نسبوط.dc.html.
 */

type Base = ButtonHTMLAttributes<HTMLButtonElement>

export function PrimaryButton({
  children,
  loading = false,
  disabled,
  className = '',
  size = 'md',
  ...rest
}: Base & {
  children: ReactNode
  loading?: boolean
  /** md = زر البطاقة (48/18) · lg = الزر اللاصق (58/22) */
  size?: 'md' | 'lg'
}) {
  const t = useT()
  const isOff = disabled || loading
  const dims =
    size === 'lg'
      ? 'min-h-[58px] rounded-16 text-[22px] px-5'
      : 'min-h-[48px] rounded-14 text-18 px-5'

  return (
    <button
      {...rest}
      disabled={isOff}
      aria-busy={loading || undefined}
      className={`font-display font-black leading-none transition-opacity ${dims} ${
        isOff ? 'cursor-not-allowed opacity-50' : 'cursor-pointer'
      } ${className}`}
      style={{ background: '#F4632A', color: '#14161A', border: 0 }}
    >
      {loading ? t('shared.wait') : children}
    </button>
  )
}

/** الزر الثانوي — شفاف بحد 2px، بيتبع لون الوضع */
export function SecondaryButton({
  children,
  className = '',
  tone = 'fg',
  ...rest
}: Base & { children: ReactNode; tone?: 'fg' | 'cobalt' | 'ink' }) {
  const color =
    tone === 'cobalt' ? '#2B4CFF' : tone === 'ink' ? '#14161A' : 'var(--fg)'
  const text = tone === 'ink' ? '#14161A' : 'var(--fg)'
  return (
    <button
      {...rest}
      className={`min-h-[44px] cursor-pointer rounded-pill px-[18px] font-display text-15 font-black leading-none ${className}`}
      style={{ background: 'transparent', color: text, border: `2px solid ${color}` }}
    >
      {children}
    </button>
  )
}

/** زر «سجلني في الانتظار» — من الملف: حد أسود 2px، 48px، 15px */
export function WaitButton({
  children,
  className = '',
  ...rest
}: Base & { children: ReactNode }) {
  return (
    <button
      {...rest}
      className={`min-h-[48px] shrink-0 cursor-pointer rounded-14 px-[14px] font-display text-15 font-black leading-none ${className}`}
      style={{ background: 'transparent', color: '#14161A', border: '2px solid #14161A' }}
    >
      {children}
    </button>
  )
}

/** زر نصي — «اقرأ القواعد» · «لأ، وريني غيرها» */
export function TextButton({
  children,
  className = '',
  underline = true,
  ...rest
}: Base & { children: ReactNode; underline?: boolean }) {
  return (
    <button
      {...rest}
      className={`min-h-[44px] cursor-pointer border-0 bg-transparent p-0 font-body text-16 font-semibold ${
        underline ? 'underline' : ''
      } ${className}`}
      style={{ color: 'var(--accent-text)' }}
    >
      {children}
    </button>
  )
}

/** زر داكن ممتلي — «ابعتلي الرمز على واتساب» */
export function InkButton({
  children,
  className = '',
  ...rest
}: Base & { children: ReactNode }) {
  return (
    <button
      {...rest}
      className={`min-h-[50px] w-full cursor-pointer rounded-14 font-display text-16 font-black leading-none ${className}`}
      style={{ background: '#14161A', color: '#FBF7EF', border: 0 }}
    >
      {children}
    </button>
  )
}
