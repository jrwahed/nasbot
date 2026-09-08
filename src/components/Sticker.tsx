import type { ReactNode } from 'react'

export type StickerColor = 'orange' | 'ink' | 'cobalt' | 'amber' | 'cream' | 'success'
export type StickerSize = 'xs' | 'sm' | 'md' | 'lg' | 'step'

/**
 * الستيكر — كبسولة Rubik 900 مايلة، بدون ظلال.
 * الألوان والحشو والأحجام كلها مرصودة من design/نسبوط.dc.html.
 */

const COLORS: Record<StickerColor, { bg: string; fg: string; border?: string }> = {
  orange: { bg: '#F4632A', fg: '#14161A' },
  ink: { bg: '#14161A', fg: '#FBF7EF' },
  cobalt: { bg: '#2B4CFF', fg: '#FBF7EF' },
  amber: { bg: '#D9A441', fg: '#14161A' },
  cream: { bg: '#EFE3CF', fg: '#14161A' },
  success: { bg: '#3E5C43', fg: '#FBF7EF' },
}

/** الحشو وحجم الخط لكل مقاس — من الملف */
const SIZES: Record<StickerSize, { padding: string; fontSize: number }> = {
  xs: { padding: '2px 10px', fontSize: 12 }, // ستيكر النوع في الكشف
  sm: { padding: '6px 14px', fontSize: 13 }, // قواعد الكشف
  md: { padding: '5px 14px', fontSize: 15 }, // الشارات فوق الصور
  lg: { padding: '6px 16px', fontSize: 18 }, // فاضل X من 8
  step: { padding: '2px 14px', fontSize: 16 }, // رقم الخطوة في النموذج
}

export function Sticker({
  children,
  color = 'orange',
  rotate = 0,
  size = 'md',
  fontSize,
  padding,
  bg,
  fg,
  className = '',
}: {
  children: ReactNode
  color?: StickerColor
  /** من -6 لـ 6 درجات */
  rotate?: number
  size?: StickerSize
  fontSize?: number
  padding?: string
  /** تجاوز اللون مباشرة — للأنواع اللي ألوانها جاية من البيانات */
  bg?: string
  fg?: string
  className?: string
}) {
  const c = COLORS[color]
  const s = SIZES[size]
  return (
    <span
      className={`inline-block whitespace-nowrap rounded-pill font-display font-black ${className}`}
      style={{
        background: bg ?? c.bg,
        color: fg ?? c.fg,
        padding: padding ?? s.padding,
        fontSize: fontSize ?? s.fontSize,
        lineHeight: 1.4,
        transform: rotate ? `rotate(${rotate}deg)` : undefined,
      }}
    >
      {children}
    </span>
  )
}
