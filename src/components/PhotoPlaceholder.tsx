import type { CSSProperties, ReactNode } from 'react'

/**
 * مكان الصورة — مربع رملي مكتوب في نصه وصف الصورة الحقيقية بين قوسين مربعين،
 * أو الصورة الحقيقية نفسها لو `src` موجود.
 *
 * ⚠ **كل صور المحتوى في الموقع 4:3.** النسبة دي متطبّقة هنا افتراضيًا بدل ما
 * تتكرر في كل مكان — كده أي استعمال جديد بيبقى مظبوط لوحده. اللي عايز نسبة
 * تانية يبعتها في `style` (بتغلب) أو يستعمل `circle`/`size` للصور الشخصية.
 * قبل كده كانت الكروت 4:3 والمعارض 1:1 — نفس الصورة كانت بتتقص شكلين.
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
  src,
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
  /** صورة حقيقية (رابط موقّع) — لو موجودة بتحل مكان النص */
  src?: string | null
}) {
  const bg = variant === 'sandDeep' ? '#E2D2B4' : '#EFE3CF'
  const fs = fontSize ?? (circle ? 11 : 13)
  // الصور الشخصية دايرية بمقاس ثابت — النسبة دي للمحتوى بس
  const ratio = circle || size ? undefined : '4 / 3'

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
        padding: src ? 0 : circle ? 4 : 16,
        overflow: 'hidden',
        borderRadius: circle ? '50%' : undefined,
        aspectRatio: ratio,
        width: size,
        height: size,
        flex: size ? `0 0 ${size}px` : undefined,
        ...style,
      }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={src} alt="" className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden="true">{label}</span>
      )}
      {children}
    </div>
  )
}
