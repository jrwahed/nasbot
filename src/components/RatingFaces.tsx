'use client'

import { useT } from '@/components/CopyProvider'

/**
 * وشوش التقييم — 5 وشوش SVG مرسومة بخط واحد، من الزعلان للمبسوط.
 * المختار بيتلوّن برتقالي.
 */

const MOUTHS = [
  'M8.5 16c1.6-2 5.4-2 7 0', // زعلان
  'M8.5 15.4c1.6-1 5.4-1 7 0',
  'M8.5 15h7', // عادي
  'M8.5 14.2c1.6 1 5.4 1 7 0',
  'M8.5 13.6c1.6 2 5.4 2 7 0', // مبسوط
]


function Face({ i, on, size = 44 }: { i: number; on: boolean; size?: number }) {
  const color = on ? '#F4632A' : 'var(--muted)'
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={on ? 2.4 : 2}
      strokeLinecap="round"
      aria-hidden="true"
    >
      <circle cx="12" cy="12" r="9" />
      <circle cx="9" cy="9.6" r=".9" fill={color} stroke="none" />
      <circle cx="15" cy="9.6" r=".9" fill={color} stroke="none" />
      <path d={MOUTHS[i]} />
    </svg>
  )
}

export function RatingFaces({
  question,
  value,
  onChange,
}: {
  question: string
  value?: number
  onChange: (v: number) => void
}) {
  const t = useT()
  // جوه المكوّن علشان الأسماء تيجي من قاعدة البيانات
  const LABELS = [
    t('shared.rating.1'),
    t('shared.rating.2'),
    t('shared.rating.3'),
    t('shared.rating.4'),
    t('shared.rating.5'),
  ]

  return (
    <fieldset className="m-0 border-0 p-0">
      <legend className="mb-2 font-display text-18 font-black">{question}</legend>
      <div className="flex items-center gap-2" role="radiogroup" aria-label={question}>
        {MOUTHS.map((_, i) => (
          <button
            key={i}
            type="button"
            role="radio"
            aria-checked={value === i + 1}
            aria-label={LABELS[i]}
            onClick={() => onChange(i + 1)}
            className="grid h-[52px] w-[52px] cursor-pointer place-items-center rounded-pill border-0 bg-transparent"
          >
            <Face i={i} on={value === i + 1} />
          </button>
        ))}
      </div>
    </fieldset>
  )
}
