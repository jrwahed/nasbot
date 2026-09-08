import { useT } from '@/components/CopyProvider'
/**
 * الأيقونات — SVG مرسوم بخط واحد، stroke برتقالي 2px.
 * الأربعة الأولى منقولة حرفيًا من صف المعلومات في design/نسبوط.dc.html.
 */

type P = { size?: number; stroke?: string; className?: string }

const base = (size: number, stroke: string, w = 2) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke,
  strokeWidth: w,
})

export function ClockIcon({ size = 24, stroke = '#F4632A', className }: P) {
  const t = useT()
  return (
    <svg {...base(size, stroke)} className={className} role="img" aria-label={t('shared.label.35')}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  )
}

export function ArrowIcon({ size = 24, stroke = '#F4632A', className }: P) {
  const t = useT()
  return (
    <svg {...base(size, stroke)} className={className} role="img" aria-label={t('shared.label.34')}>
      <path d="M4 12h16M14 6l6 6-6 6" />
    </svg>
  )
}

export function PinIcon({ size = 24, stroke = '#F4632A', className }: P) {
  const t = useT()
  return (
    <svg {...base(size, stroke)} className={className} role="img" aria-label={t('shared.label.33')}>
      <circle cx="12" cy="10" r="3" />
      <path d="M12 21s-7-6-7-11a7 7 0 0 1 14 0c0 5-7 11-7 11z" />
    </svg>
  )
}

export function LevelIcon({ size = 24, stroke = '#F4632A', className }: P) {
  const t = useT()
  return (
    <svg {...base(size, stroke)} className={className} role="img" aria-label={t('shared.label.32')}>
      <circle cx="12" cy="8" r="6" />
      <path d="M12 14v7" />
    </svg>
  )
}

/** درع الضمان — من الملف، stroke #3E5C43 بسُمك 2.2 */
export function ShieldIcon({ size = 26, stroke = '#3E5C43', className }: P) {
  const t = useT()
  return (
    <svg
      {...base(size, stroke, 2.2)}
      className={className}
      style={{ flex: `0 0 ${size}px`, marginTop: 4 }}
      role="img"
      aria-label={t('shared.label.31')}
    >
      <path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" />
      <path d="M8.5 12l2.5 2.5 4.5-5" />
    </svg>
  )
}

export function LockIcon({ size = 24, stroke = 'currentColor', className }: P) {
  const t = useT()
  return (
    <svg {...base(size, stroke)} className={className} role="img" aria-label={t('shared.label.30')}>
      <rect x="5" y="11" width="14" height="9" rx="2.5" />
      <path d="M8 11V8a4 4 0 0 1 8 0v3" />
    </svg>
  )
}

/* ===== أيقونات اللعبة — كل واحدة بخط واحد ===== */

export function BedIcon({ size = 40, stroke = 'currentColor' }: P) {
  const t = useT()
  return (
    <svg {...base(size, stroke)} role="img" aria-label={t('shared.label.29')}>
      <path d="M3 18v-7h13a4 4 0 0 1 4 4v3" />
      <path d="M3 18h18M3 11V7" />
      <circle cx="7.5" cy="12.5" r="1.6" />
    </svg>
  )
}

export function RiverIcon({ size = 40, stroke = 'currentColor' }: P) {
  const t = useT()
  return (
    <svg {...base(size, stroke)} role="img" aria-label={t('shared.label.28')}>
      <path d="M3 9c3-2 6 2 9 0s6-2 9 0" />
      <path d="M3 14c3-2 6 2 9 0s6-2 9 0" />
      <path d="M3 19c3-2 6 2 9 0s6-2 9 0" />
    </svg>
  )
}

export function CourtIcon({ size = 40, stroke = 'currentColor' }: P) {
  const t = useT()
  return (
    <svg {...base(size, stroke)} role="img" aria-label={t('shared.label.27')}>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <path d="M12 5v14M3.5 12h17" />
    </svg>
  )
}

export function LaptopIcon({ size = 40, stroke = 'currentColor' }: P) {
  const t = useT()
  return (
    <svg {...base(size, stroke)} role="img" aria-label={t('shared.label.26')}>
      <rect x="4" y="5" width="16" height="11" rx="2" />
      <path d="M2 19h20" />
    </svg>
  )
}

export function TalkIcon({ size = 40, stroke = 'currentColor' }: P) {
  const t = useT()
  return (
    <svg {...base(size, stroke)} role="img" aria-label={t('shared.label.25')}>
      <path d="M4 6h16v9H9l-5 4z" />
    </svg>
  )
}

export function EarIcon({ size = 40, stroke = 'currentColor' }: P) {
  const t = useT()
  return (
    <svg {...base(size, stroke)} role="img" aria-label={t('shared.label.24')}>
      <path d="M8 9a4 4 0 1 1 8 0c0 3-3 3-3 6a2.5 2.5 0 0 1-5 0" />
      <path d="M11 9a1.5 1.5 0 0 1 3 0" />
    </svg>
  )
}

export function CameraIcon({ size = 40, stroke = 'currentColor' }: P) {
  const t = useT()
  return (
    <svg {...base(size, stroke)} role="img" aria-label={t('shared.label.23')}>
      <rect x="3" y="7" width="18" height="13" rx="2.5" />
      <circle cx="12" cy="13.5" r="3.5" />
      <path d="M9 7l1.5-3h3L15 7" />
    </svg>
  )
}

export function FoodIcon({ size = 40, stroke = 'currentColor' }: P) {
  const t = useT()
  return (
    <svg {...base(size, stroke)} role="img" aria-label={t('shared.label.22')}>
      <path d="M7 3v8a2 2 0 0 0 4 0V3M9 11v10" />
      <path d="M17 3c-1.5 1.5-2 3-2 5s.7 3 2 3v10" />
    </svg>
  )
}

export function MapIcon({ size = 40, stroke = 'currentColor' }: P) {
  const t = useT()
  return (
    <svg {...base(size, stroke)} role="img" aria-label={t('shared.label.21')}>
      <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2z" />
      <path d="M9 4v14M15 6v14" />
    </svg>
  )
}

export function CalmIcon({ size = 40, stroke = 'currentColor' }: P) {
  const t = useT()
  return (
    <svg {...base(size, stroke)} role="img" aria-label={t('shared.label.20')}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M8.5 14c2 1.6 5 1.6 7 0" />
    </svg>
  )
}

export function SunsetIcon({ size = 40, stroke = 'currentColor' }: P) {
  const t = useT()
  return (
    <svg {...base(size, stroke)} role="img" aria-label={t('shared.label.19')}>
      <circle cx="12" cy="13" r="4" />
      <path d="M3 19h18M12 4v3M5 8l2 2M19 8l-2 2" />
    </svg>
  )
}

export function GroupIcon({ size = 40, stroke = 'currentColor' }: P) {
  const t = useT()
  return (
    <svg {...base(size, stroke)} role="img" aria-label={t('shared.label.18')}>
      <circle cx="8" cy="9" r="3" />
      <circle cx="16" cy="9" r="3" />
      <path d="M3 19c0-3 2.5-4.5 5-4.5S13 16 13 19M13 19c0-3 2-4.5 4-4.5s4 1.5 4 4.5" />
    </svg>
  )
}

export function CrowdIcon({ size = 40, stroke = 'currentColor' }: P) {
  const t = useT()
  return (
    <svg {...base(size, stroke)} role="img" aria-label={t('shared.label.17')}>
      <circle cx="6" cy="8" r="2.4" />
      <circle cx="12" cy="7" r="2.4" />
      <circle cx="18" cy="8" r="2.4" />
      <path d="M2 19c0-2.5 2-4 4-4s4 1.5 4 4M14 19c0-2.5 2-4 4-4s4 1.5 4 4M8 19c0-3 2-4.5 4-4.5s4 1.5 4 4.5" />
    </svg>
  )
}

export function PairIcon({ size = 40, stroke = 'currentColor' }: P) {
  const t = useT()
  return (
    <svg {...base(size, stroke)} role="img" aria-label={t('shared.label.16')}>
      <circle cx="9" cy="9" r="3" />
      <circle cx="16" cy="10" r="2.5" />
      <path d="M4 19c0-3 2.5-4.5 5-4.5s5 1.5 5 4.5" />
    </svg>
  )
}

export function MoodIcon({ size = 40, stroke = 'currentColor' }: P) {
  const t = useT()
  return (
    <svg {...base(size, stroke)} role="img" aria-label={t('shared.label.15')}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9 10h.01M15 10h.01M8.5 14.5c1.2 1.2 5.8 1.2 7 0" />
    </svg>
  )
}

export function MoneyIcon({ size = 40, stroke = 'currentColor' }: P) {
  const t = useT()
  return (
    <svg {...base(size, stroke)} role="img" aria-label={t('shared.label.14')}>
      <rect x="3" y="6" width="18" height="12" rx="2.5" />
      <circle cx="12" cy="12" r="2.6" />
    </svg>
  )
}

export function CalendarIcon({ size = 40, stroke = 'currentColor' }: P) {
  const t = useT()
  return (
    <svg {...base(size, stroke)} role="img" aria-label={t('shared.label.13')}>
      <rect x="3.5" y="5" width="17" height="15" rx="2.5" />
      <path d="M3.5 10h17M8 3v4M16 3v4" />
    </svg>
  )
}
