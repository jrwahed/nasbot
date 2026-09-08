'use client'

/**
 * الأيقونة — علامة الاستفهام العربية «؟» بنفس ميل الشعار
 * في مربع بزوايا مستديرة، نصف القطر = ربع الضلع.
 * القيم من الملف: 44px مربع، خط 28px، radius 11 (= 44 ÷ 4).
 */
import { useT } from '@/components/CopyProvider'

export function QIcon({
  size = 44,
  color = '#14161A',
  bg = '#F4632A',
  rotate = 0,
  circle = false,
  className = '',
  title,
}: {
  size?: number
  color?: string
  bg?: string
  rotate?: number
  circle?: boolean
  className?: string
  /** لو مااتبعتش بياخد اسم الموقع من النصوص */
  title?: string
}) {
  const t = useT()
  return (
    <span
      role="img"
      aria-label={title ?? t('shared.brand')}
      className={`grid place-items-center font-display font-black ${className}`}
      style={{
        width: size,
        height: size,
        borderRadius: circle ? '50%' : size / 4,
        background: bg,
        color,
        fontSize: Math.round(size * 0.636), // 44 → 28 زي الملف
        transform: `skewX(-6deg)${rotate ? ` rotate(${rotate}deg)` : ''}`,
      }}
    >{t('shared.text.26')}</span>
  )
}
