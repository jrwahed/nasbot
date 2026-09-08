import type { CSSProperties, ReactNode } from 'react'

/**
 * مكان الصورة — مربع رملي مكتوب في نصه وصف الصورة الحقيقية بين قوسين مربعين.
 * ممنوع أي صورة مخزون في المرحلة دي.
 *
 * الألوان من الملف: الخلفية #EFE3CF (أو #E2D2B4 جوه بطاقة السبوطة)
 * والنص #6B6455 بحجم 13 (أو 11 في الدواير الصغيرة).
 */
export function PhotoPlaceholder({
  label,
  variant = 'sand',
  circle = false,
  size,
  className = '',
  style,
  children,
  fontSize,
}: {
  /** وصف الصورة الحقيقية المطلوبة، بين قوسين مربعين */
  label: string
  variant?: 'sand' | 'sandDeep'
  circle?: boolean
  /** للدوايرة: الضلع بالبكسل */
  size?: number
  className?: string
  style?: CSSProperties
  children?: ReactNode
  fontSize?: number
}) {
  const bg = variant === 'sandDeep' ? '#E2D2B4' : '#EFE3CF'
  const fs = fontSize ?? (circle ? 11 : 13)

  return (
    <div
      role="img"
      aria-label={label}
      className={`grid place-items-center text-center ${className}`}
      style={{
        background: bg,
        color: '#6B6455',
        fontSize: fs,
        lineHeight: 1.5,
        padding: circle ? 4 : 16,
        borderRadius: circle ? '50%' : undefined,
        width: size,
        height: size,
        flex: size ? `0 0 ${size}px` : undefined,
        ...style,
      }}
    >
      <span aria-hidden="true">{label}</span>
      {children}
    </div>
  )
}
