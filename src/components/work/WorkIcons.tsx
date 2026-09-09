/**
 * أيقونات مواصفات المكان — خط واحد، stroke برتقالي 2px، زي Icons.tsx.
 * كلها زخرفية (aria-hidden) لأن التسمية النصية جنبها دايمًا.
 */

type P = { size?: number; stroke?: string }

const base = (size: number, stroke: string) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke,
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
})

export function WifiIcon({ size = 22, stroke = '#F4632A' }: P) {
  return (
    <svg {...base(size, stroke)}>
      <path d="M3 9.5a13 13 0 0 1 18 0" />
      <path d="M6.5 13a8 8 0 0 1 11 0" />
      <path d="M10 16.5a3.5 3.5 0 0 1 4 0" />
      <circle cx="12" cy="19.5" r="0.8" fill={stroke} />
    </svg>
  )
}

export function PlugIcon({ size = 22, stroke = '#F4632A' }: P) {
  return (
    <svg {...base(size, stroke)}>
      <path d="M8 3v5M16 3v5" />
      <path d="M5 8h14v3a7 7 0 0 1-14 0z" />
      <path d="M12 18v3" />
    </svg>
  )
}

export function SoundIcon({ size = 22, stroke = '#F4632A' }: P) {
  return (
    <svg {...base(size, stroke)}>
      <path d="M4 10v4h3l4 3.5v-11L7 10z" />
      <path d="M15 9.5a3.5 3.5 0 0 1 0 5M17.5 7a7 7 0 0 1 0 10" />
    </svg>
  )
}

export function MeetingIcon({ size = 22, stroke = '#F4632A' }: P) {
  return (
    <svg {...base(size, stroke)}>
      <rect x="3" y="9" width="18" height="6" rx="2" />
      <path d="M6 15v4M18 15v4M9 9V6h6v3" />
    </svg>
  )
}

export function CarIcon({ size = 22, stroke = '#F4632A' }: P) {
  return (
    <svg {...base(size, stroke)}>
      <path d="M4 15l1.5-5A2 2 0 0 1 7.4 8.5h9.2a2 2 0 0 1 1.9 1.5L20 15v4H4z" />
      <circle cx="8" cy="16" r="1.2" fill={stroke} />
      <circle cx="16" cy="16" r="1.2" fill={stroke} />
    </svg>
  )
}

export function SnowIcon({ size = 22, stroke = '#F4632A' }: P) {
  return (
    <svg {...base(size, stroke)}>
      <path d="M12 3v18M4.2 7.5l15.6 9M4.2 16.5l15.6-9" />
      <path d="M12 3l-2 2M12 3l2 2M12 21l-2-2M12 21l2-2" />
    </svg>
  )
}

export function CoinsIcon({ size = 22, stroke = '#F4632A' }: P) {
  return (
    <svg {...base(size, stroke)}>
      <ellipse cx="12" cy="7" rx="7" ry="3" />
      <path d="M5 7v5c0 1.7 3.1 3 7 3s7-1.3 7-3V7" />
      <path d="M5 12v5c0 1.7 3.1 3 7 3s7-1.3 7-3v-5" />
    </svg>
  )
}

export function DeskIcon({ size = 22, stroke = '#F4632A' }: P) {
  return (
    <svg {...base(size, stroke)}>
      <path d="M3 9h18M5 9v10M19 9v10" />
      <rect x="8" y="12" width="8" height="4" rx="1" />
    </svg>
  )
}

export function ClockSmallIcon({ size = 22, stroke = '#F4632A' }: P) {
  return (
    <svg {...base(size, stroke)}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5v4.5l3 2" />
    </svg>
  )
}

/** لابتوب صغير — للخريطة وللشريط */
export function LaptopSmallIcon({ size = 18, stroke = '#14161A' }: P) {
  return (
    <svg {...base(size, stroke)}>
      <rect x="4" y="5" width="16" height="11" rx="2" />
      <path d="M2 19h20" />
    </svg>
  )
}
