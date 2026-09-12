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
  alt,
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
  /**
   * نص الصورة (alt) من «دليل السبوطات» — وصف بصري للي فيها.
   *
   * ⚠ بيتستعمل **لما تبقى فيه صورة حقيقية بس**. من غيره الصورة بتطلع
   * بـ`alt` فاضي، يعني اللي على قارئ شاشة مش شايف حاجة خالص، وجوجل
   * مش فاهم الصورة. و`label` مينفعش يقوم مقامه: ده وصف المكان الفاضي
   * («[صورة]») مش وصف الصورة.
   */
  alt?: string
}) {
  const bg = variant === 'sandDeep' ? '#E2D2B4' : '#EFE3CF'
  const fs = fontSize ?? (circle ? 11 : 13)
  // الصور الشخصية دايرية بمقاس ثابت — النسبة دي للمحتوى بس
  const ratio = circle || size ? undefined : '4 / 3'

  return (
    <div
      // ⚠ لما تبقى فيه صورة حقيقية، `<img>` جوه هي الصورة — فبنشيل
      //    `role="img"` من البرّه. لو سبناه، قارئ الشاشة بيقول الوصف
      //    **مرتين**، وجوجل بياخد `aria-label` بدل `alt`.
      role={src ? undefined : 'img'}
      aria-label={src ? undefined : label}
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
        <img src={src} alt={alt ?? ''} className="h-full w-full object-cover" />
      ) : (
        <span aria-hidden="true">{label}</span>
      )}
      {children}
    </div>
  )
}
