'use client'

import Link from 'next/link'
import {
  miniMapBlocks,
  miniMapDots,
  miniMapLabels,
  miniMapMystery,
} from '@/data/areas'
import { useT } from '@/components/CopyProvider'

/**
 * الخريطة المصغرة في الرئيسية — منقولة بالإحداثيات بالظبط من
 * design/نسبوط.dc.html: ارتفاع 260، خلفية #1E2128، حد 2px #2A2E36،
 * كتل #2A2E36، نقط برتقالي 14px بتنبض بتأخير 0/.4/.8/1.2،
 * علامة استفهام كوبالت 30px، وزر «افتح الخريطة» تحت الشمال.
 */
export function MiniMap({ height = 260 }: { height?: number }) {
  const t = useT()
  return (
    <div
      className="relative w-full overflow-hidden rounded-20"
      style={{ height, background: '#1E2128', border: '2px solid #2A2E36' }}
      role="img"
      aria-label={t('shared.label.37')}
    >
      {miniMapBlocks.map((b, i) => (
        <div
          key={i}
          className="absolute"
          style={{
            insetInlineEnd: b.right,
            insetInlineStart: b.left,
            top: b.top,
            bottom: b.bottom,
            width: b.w,
            height: b.h,
            borderRadius: b.r,
            background: '#2A2E36',
          }}
        />
      ))}

      {miniMapLabels.map((l) => (
        <span
          key={l.label}
          className="absolute font-body text-12 font-semibold"
          style={{
            insetInlineEnd: l.right,
            insetInlineStart: l.left,
            top: l.top,
            bottom: l.bottom,
            color: '#9A9CA3',
          }}
        >
          {l.label}
        </span>
      ))}

      {miniMapDots.map((d, i) => (
        <span
          key={i}
          className="nb-pulse-dot absolute"
          style={{
            insetInlineEnd: d.right,
            insetInlineStart: d.left,
            top: d.top,
            bottom: d.bottom,
            width: 14,
            height: 14,
            borderRadius: '50%',
            background: '#F4632A',
            animation: `nb-pulse 1.6s ${d.delay}s ease-out infinite`,
          }}
        />
      ))}

      <span
        className="absolute grid place-items-center font-display text-18 font-black"
        style={{
          insetInlineStart: miniMapMystery.left,
          top: miniMapMystery.top,
          width: 30,
          height: 30,
          borderRadius: '50%',
          background: '#2B4CFF',
          color: '#FBF7EF',
          transform: 'skewX(-6deg)',
        }}
      >{t('shared.text.22')}</span>

      <Link
        href="/map"
        className="absolute bottom-[14px] grid min-h-[44px] place-items-center rounded-pill px-[18px] font-display text-15 font-black"
        style={{ insetInlineStart: 14, background: '#FBF7EF', color: '#14161A' }}
      >{t('shared.text.21')}</Link>
    </div>
  )
}

/**
 * خريطة المكان في كشف المجموعة — ارتفاع 140، كتلتين ونقطة واحدة.
 * من الملف.
 */
export function PlaceMap() {
  const t = useT()
  return (
    <div className="relative" style={{ height: 140 }} role="img" aria-label={t('shared.label.36')}>
      <div
        className="absolute"
        style={{
          insetInlineEnd: 30,
          top: 20,
          width: 140,
          height: 70,
          borderRadius: 24,
          background: '#2A2E36',
        }}
      />
      <div
        className="absolute"
        style={{
          insetInlineStart: 30,
          bottom: 16,
          width: 120,
          height: 60,
          borderRadius: 24,
          background: '#2A2E36',
        }}
      />
      <span
        className="nb-pulse-dot absolute"
        style={{
          insetInlineEnd: 90,
          top: 50,
          width: 16,
          height: 16,
          borderRadius: '50%',
          background: '#F4632A',
          animation: 'nb-pulse 1.6s ease-out infinite',
        }}
      />
    </div>
  )
}
