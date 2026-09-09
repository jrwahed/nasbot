'use client'

import { useState } from 'react'
import Link from 'next/link'
import type { Sbota } from '@/types'
import { mapAreas, mapPins, mysteryPin, visitedAreaIds } from '@/data/areas'
import { Sticker } from '@/components/Sticker'
import { useT } from '@/components/CopyProvider'

/**
 * خريطة القاهرة — مرسومة SVG بأسلوب الكتل نفسه اللي في الخريطة المصغرة
 * في design/نسبوط.dc.html (مستطيلات بزوايا كبيرة بلون واحد + تسمية).
 *
 * النقط برتقالية بتنبض، والضغط بيفتح بطاقة صغيرة فوق الخريطة.
 * المناطق اللي المستخدم لسه مارحهاش باهتة ومكتوب عليها «لسه».
 */
export function CairoMap({
  sbotat,
  className = '',
}: {
  sbotat: Sbota[]
  className?: string
}) {
  const t = useT()
  const [open, setOpen] = useState<string | null>(null)
  // فلتر «شغل» — أماكن الشغل (cafe_work / coworking) بتظهر بأيقونة لابتوب
  const [workOnly, setWorkOnly] = useState(false)
  const shown = workOnly ? sbotat.filter((s) => s.kind === 'work') : sbotat
  const picked = shown.find((s) => s.slug === open)
  const visible = mapPins.filter((p) => shown.some((s) => s.slug === p.slug))
  const isWorkPin = (slug: string) => shown.find((s) => s.slug === slug)?.kind === 'work'

  return (
    <div
      className={`relative w-full overflow-hidden rounded-20 ${className}`}
      style={{ background: '#1E2128', border: '2px solid #2A2E36' }}
    >
      <svg
        viewBox="0 0 400 520"
        className="block h-auto w-full"
        role="img"
        aria-label={t('shared.label.5')}
      >
        {/* النيل — شريط مايل بلون أغمق شوية */}
        <path
          d="M196 0 L214 0 L188 200 L176 300 L192 420 L206 520 L186 520 L170 420 L156 300 L170 190 Z"
          fill="#232732"
        />

        {mapAreas.map((a) => {
          const visited = visitedAreaIds.includes(a.id)
          return (
            <g key={a.id} opacity={visited ? 1 : 0.45}>
              <rect
                x={a.x}
                y={a.y}
                width={a.w}
                height={a.h}
                rx={a.r}
                fill="#2A2E36"
                stroke={a.far ? '#3A3D44' : 'none'}
                strokeDasharray={a.far ? '6 6' : undefined}
                strokeWidth={a.far ? 2 : 0}
              />
              <text
                x={a.lx}
                y={a.ly}
                textAnchor="middle"
                fill="#9A9CA3"
                style={{ font: '600 13px var(--font-plex), sans-serif' }}
              >
                {a.label}
              </text>
              {!visited && (
                <text
                  x={a.lx}
                  y={a.ly + 18}
                  textAnchor="middle"
                  fill="#6B6E76"
                  style={{ font: '900 12px var(--font-rubik), sans-serif' }}
                >{t('shared.text.6')}</text>
              )}
              {a.far && a.note && (
                <>
                  <path
                    d={`M${a.x + a.w + 6} ${a.y + 12} l26 -14`}
                    stroke="#6B6E76"
                    strokeWidth="2"
                    fill="none"
                  />
                  <text
                    x={a.x + a.w + 38}
                    y={a.y + 2}
                    fill="#9A9CA3"
                    style={{ font: '600 12px var(--font-plex), sans-serif' }}
                  >
                    {a.note}
                  </text>
                </>
              )}
            </g>
          )
        })}

        {/* السبوطة الغامضة — نقطة كوبالت كبيرة بعلامة استفهام */}
        <g
          role="button"
          tabIndex={0}
          aria-label={t('shared.label.4')}
          style={{ cursor: 'pointer' }}
          onClick={() => setOpen(open === 'mystery' ? null : 'mystery')}
        >
          <circle cx={mysteryPin.x} cy={mysteryPin.y} r="19" fill="#2B4CFF" />
          <text
            x={mysteryPin.x}
            y={mysteryPin.y}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#FBF7EF"
            style={{ font: '900 24px var(--font-rubik), sans-serif' }}
          >{t('shared.text.5')}</text>
          <text
            x={mysteryPin.x}
            y={mysteryPin.y + 36}
            textAnchor="middle"
            fill="#9A9CA3"
            style={{ font: '600 11px var(--font-plex), sans-serif' }}
          >{t('shared.text.4')}</text>
        </g>

        {/* نقط السبوطات */}
        {visible.map((p, i) => (
          <g
            key={p.slug}
            role="button"
            tabIndex={0}
            aria-label={shown.find((s) => s.slug === p.slug)?.name ?? t('shared.label.3')}
            style={{ cursor: 'pointer' }}
            onClick={() => setOpen(open === p.slug ? null : p.slug)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') setOpen(open === p.slug ? null : p.slug)
            }}
          >
            <circle cx={p.x} cy={p.y} r="16" fill="transparent" />
            {/* الحلقة النابضة — بديل box-shadow لأن SVG مش بيدعمه */}
            <circle
              cx={p.x}
              cy={p.y}
              r="7"
              fill="#F4632A"
              className="nb-map-ring"
              style={{ animationDelay: `${(i % 4) * 0.4}s` }}
            />
            {isWorkPin(p.slug) ? (
              // لابتوب صغير — مكان شغل (كافيه أو مساحة عمل)
              <g transform={`translate(${p.x - 9} ${p.y - 8})`}>
                <rect x="0" y="0" width="18" height="16" rx="4" fill="#F4632A" />
                <rect x="4" y="3" width="10" height="7" rx="1.5" fill="none" stroke="#14161A" strokeWidth="1.6" />
                <path d="M2.5 12.5h13" stroke="#14161A" strokeWidth="1.6" strokeLinecap="round" />
              </g>
            ) : (
              <circle cx={p.x} cy={p.y} r="7" fill="#F4632A" />
            )}
          </g>
        ))}
      </svg>

      {/* فلتر «شغل» — كبسولة صغيرة فوق الخريطة */}
      <button
        type="button"
        onClick={() => {
          setWorkOnly((v) => !v)
          setOpen(null)
        }}
        aria-pressed={workOnly}
        className="absolute end-3 top-3 min-h-[36px] cursor-pointer rounded-pill px-3 font-display text-13 font-black leading-none"
        style={{
          border: `2px solid ${workOnly ? '#F4632A' : '#9A9CA3'}`,
          background: workOnly ? '#F4632A' : 'transparent',
          color: workOnly ? '#14161A' : '#FBF7EF',
          transform: workOnly ? 'rotate(-3deg)' : undefined,
        }}
      >
        {t('shoghl.map.filter')}
      </button>

      {/* بطاقة صغيرة فوق الخريطة */}
      {picked && (
        <div
          className="absolute inset-x-3 bottom-3 rounded-16 p-4"
          style={{ background: '#EFE3CF', color: '#14161A' }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-display text-20 font-black">{picked.name}</div>
              <div className="font-body text-14">{picked.meta}</div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(null)}
              aria-label={t('shared.label.2')}
              className="min-h-[44px] shrink-0 cursor-pointer border-0 bg-transparent font-display text-20 font-black"
            >
              ×
            </button>
          </div>
          <div className="mt-2 flex items-center justify-between gap-3">
            <Sticker color={picked.full ? 'ink' : 'orange'} rotate={-3} size="sm">
              {picked.left}
            </Sticker>
            <Link
              href={picked.kind === 'work' ? `/shoghl/${picked.slug}` : `/s/${picked.slug}`}
              className="grid min-h-[44px] place-items-center rounded-14 px-5 font-display text-16 font-black"
              style={{ background: '#F4632A', color: '#14161A' }}
            >{t('shared.text.1')}</Link>
          </div>
        </div>
      )}

      {open === 'mystery' && !picked && (
        <div
          className="absolute inset-x-3 bottom-3 rounded-16 p-4"
          style={{ background: '#2B4CFF', color: '#FBF7EF' }}
        >
          <div className="font-display text-20 font-black">{t('shared.text.3')}</div>
          <div className="mt-1 font-body text-14">{t('shared.text.2')}</div>
          <Link
            href="/s/mystery"
            className="mt-3 grid min-h-[44px] w-full place-items-center rounded-14 font-display text-16 font-black"
            style={{ background: '#FBF7EF', color: '#14161A' }}
          >{t('shared.text.1')}</Link>
        </div>
      )}
    </div>
  )
}
