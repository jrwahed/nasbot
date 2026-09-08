import type { CSSProperties } from 'react'
import { useT } from '@/components/CopyProvider'

export type LogoVariant = 'primary' | 'onDark' | 'onOrange' | 'mono' | 'auto'

/**
 * الشعار — نص حقيقي بـ CSS مش صورة، علشان يتلون حسب الخلفية.
 *
 * البنية من design/نسبوط.dc.html: نسخة مفرغة absolute ورا،
 * ونسخة ممتلية relative فوقها، والحاوية كلها skewX(-6deg).
 *
 * الإزاحات والسُمك معايرة على قيم الملف (34px → top 4 / right -5 / stroke 2،
 * و22px → top 3 / right -3 / stroke 1.5) — راجع DESIGN_TOKENS.md §3.
 */

const FILL: Record<Exclude<LogoVariant, 'auto'>, string> = {
  primary: '#F4632A',
  onDark: '#F4632A',
  onOrange: '#14161A',
  mono: '#14161A',
}

const STROKE: Record<Exclude<LogoVariant, 'auto'>, string | null> = {
  primary: '#2B4CFF',
  onDark: '#FBF7EF',
  onOrange: '#FBF7EF',
  mono: null,
}

export function Logo({
  size = 34,
  variant = 'auto',
  className = '',
}: {
  size?: number
  variant?: LogoVariant
  className?: string
}) {
  const t = useT()
  const top = Math.round(size * 0.12)
  const right = -Math.round(size * 0.14)
  const stroke = Math.max(1, Math.round(size * 0.06 * 2) / 2)

  // auto: البرتقالي ثابت، والمفرغة بتتبع الوضع (كريمي ليلي · كوبالت نهاري)
  const fill = variant === 'auto' ? '#F4632A' : FILL[variant]
  const strokeColor = variant === 'auto' ? 'var(--logo-stroke)' : STROKE[variant]

  // ملاحظة: الملف بيستخدم top/right الفيزيائيين (مش المنطقيين) —
  // المفرغة بتنزاح لتحت ولليمين الفيزيائي مهما كان اتجاه الصفحة.
  const strokeStyle: CSSProperties = {
    top,
    right,
    color: 'transparent',
    WebkitTextStrokeWidth: `${stroke}px`,
    WebkitTextStrokeColor: strokeColor ?? 'transparent',
  }

  return (
    <span
      className={`relative inline-block font-display font-black leading-none ${className}`}
      style={{ fontSize: size, transform: 'skewX(-6deg)' }}
      aria-label={t('shared.text.20')}
      role="img"
    >
      {strokeColor && (
        <span className="absolute select-none" style={strokeStyle} aria-hidden="true">{t('shared.text.20')}</span>
      )}
      <span className="relative" style={{ color: fill }}>{t('shared.text.20')}</span>
    </span>
  )
}
