'use client'

import { useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import type { Sbota } from '@/types'
import { getMapData, mapFallback, groupByArea, type MapData } from '@/lib/fields'
import { Sticker } from '@/components/Sticker'
import { useT } from '@/components/CopyProvider'

/**
 * خريطة القاهرة — مرسومة SVG بأسلوب الكتل نفسه اللي في الخريطة المصغرة
 * في design/نسبوط.dc.html (مستطيلات بزوايا كبيرة بلون واحد + تسمية).
 *
 * النقط برتقالية بتنبض، والضغط بيفتح بطاقة صغيرة فوق الخريطة.
 * المناطق اللي المستخدم لسه مارحهاش باهتة ومكتوب عليها «لسه».
 *
 * الكتل بتيجي من `map_areas` في القاعدة (مراجعة A5) — الحالة الابتدائية هي
 * الاحتياطي من الكود، فالخريطة بترسم من أول لحظة حتى لو القاعدة واقعة، وما
 * فيش لحظة تحميل فاضية ولا لفة مستمرة.
 *
 * والنقط بقت محسوبة من السبوطات نفسها — قبل كده كانت قايمة يدوية بـ٧ slugs،
 * يعني أي سبوطة جديدة عمرها ما كانت تبان.
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
  const [map, setMap] = useState<MapData>(mapFallback)

  useEffect(() => {
    let alive = true
    getMapData().then((d) => {
      if (alive) setMap(d)
    })
    return () => {
      alive = false
    }
  }, [])

  // المنطقة المفتوحة لما يكون فيها أكتر من سبوطة — بنعرض قايمة نختار منها
  const [openArea, setOpenArea] = useState<string | null>(null)

  const shown = workOnly ? sbotat.filter((s) => s.kind === 'work') : sbotat
  const picked = shown.find((s) => s.slug === open)
  const groups = useMemo(() => groupByArea(map.blocks, shown), [map.blocks, shown])
  const busy = useMemo(() => new Map(groups.map((g) => [g.block.key, g.slugs])), [groups])
  const areaList = openArea ? (busy.get(openArea) ?? []) : []
  const allWork = (slugs: string[]) =>
    slugs.length > 0 && slugs.every((sl) => shown.find((s) => s.slug === sl)?.kind === 'work')

  /** دوسة على منطقة: سبوطة واحدة تفتح على طول، وأكتر بتفتح قايمة */
  function tapArea(key: string) {
    const slugs = busy.get(key) ?? []
    if (slugs.length === 0) return
    setOpenArea(null)
    if (slugs.length === 1) {
      setOpen(open === slugs[0] ? null : slugs[0])
      return
    }
    setOpen(null)
    setOpenArea(openArea === key ? null : key)
  }

  return (
    <div
      className={`relative w-full overflow-hidden rounded-20 ${className}`}
      style={{ background: '#191C22', border: '2px solid #333845' }}
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
          fill="#2B3A52"
        />

        {map.blocks.map((a) => {
          const visited = !!a.area && map.visitedAreas.includes(a.area)
          const slugs = busy.get(a.key) ?? []
          const hot = slugs.length > 0
          /**
           * مواضع التسميات في البيانات متظبطة بالإيد، وبعضها قريب أوي من حد
           * الكتلة (وادي دجلة: التسمية على بعد 14px من تحت). لما بنضيف سطر
           * العدد تحتها بيقع برّه الكتلة. فبنحصر الاتنين جوّه الكتلة —
           * للمناطق اللي فيها سبوطات بس، عشان الباقي يفضل زي ما اتصمّم.
           */
          const labelY = hot
            ? Math.min(Math.max(a.ly, a.y + 22), a.y + a.h - 26)
            : a.ly
          const countY = labelY + 19
          /**
           * «لسه» والبهتان معناهم «المنطقة دي انت لسه مارحتهاش» — وده مالوش
           * معنى غير لما يكون فيه مناطق **راحها** نقارن بيها. للزائر الجديد
           * كل الكتل كانت بتبقى باهتة ومكتوب عليها «لسه»، فالخريطة كلها كانت
           * شكلها مقفولة ومكررة. دلوقتي المقارنة بتظهر بس لما يكون ليها معنى.
           */
          const compare = map.visitedAreas.length > 0
          const dim = compare && !visited && !hot
          return (
            <g
              key={a.key}
              opacity={dim ? 0.6 : 1}
              role={hot ? 'button' : undefined}
              tabIndex={hot ? 0 : undefined}
              aria-label={hot ? `${a.label} — ${slugs.length}` : undefined}
              style={hot ? { cursor: 'pointer' } : undefined}
              onClick={hot ? () => tapArea(a.key) : undefined}
              onKeyDown={
                hot
                  ? (e) => {
                      if (e.key === 'Enter' || e.key === ' ') tapArea(a.key)
                    }
                  : undefined
              }
            >
              <rect
                x={a.x}
                y={a.y}
                width={a.w}
                height={a.h}
                rx={a.r}
                // المنطقة اللي فيها سبوطات بتاخد لون دافي وحد برتقالي — العين
                // لازم تروحلها من غير ما تقرا. الفاضية بتفضل ساكتة.
                fill={hot ? '#3A2B24' : '#333845'}
                stroke={hot ? '#F4632A' : a.far ? '#4A4E58' : 'none'}
                strokeDasharray={!hot && a.far ? '6 6' : undefined}
                strokeWidth={hot ? 2.5 : a.far ? 2 : 0}
              />
              <text
                x={a.lx}
                y={labelY}
                textAnchor="middle"
                fill={hot ? '#FBF7EF' : '#B9BCC4'}
                style={{ font: `${hot ? 800 : 600} 14px var(--font-plex), sans-serif` }}
              >
                {a.label}
              </text>
              {/* منطقة كل سبوطاتها شغل — لابتوب صغير في ركن الكتلة.
                  كان على النقطة قبل ما نشيلها، والعلامة دي بتحافظ عليه. */}
              {hot && allWork(slugs) && (
                <g transform={`translate(${a.x + 12} ${a.y + 12})`} aria-hidden="true">
                  <rect x="0" y="0" width="18" height="16" rx="4" fill="#F4632A" />
                  <rect x="4" y="3" width="10" height="7" rx="1.5" fill="none" stroke="#14161A" strokeWidth="1.6" />
                  <path d="M2.5 12.5h13" stroke="#14161A" strokeWidth="1.6" strokeLinecap="round" />
                </g>
              )}
              {hot && (
                <text
                  x={a.lx}
                  y={countY}
                  textAnchor="middle"
                  fill="#F4632A"
                  style={{ font: '900 14px var(--font-rubik), sans-serif' }}
                >
                  {slugs.length === 1
                    ? t('map.area.one')
                    : t('map.area.many', { n: slugs.length })}
                </text>
              )}
              {dim && (
                <text
                  x={a.lx}
                  y={a.ly + 20}
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
          <circle cx={map.mystery.x} cy={map.mystery.y} r="19" fill="#2B4CFF" />
          <text
            x={map.mystery.x}
            y={map.mystery.y}
            textAnchor="middle"
            dominantBaseline="central"
            fill="#FBF7EF"
            style={{ font: '900 24px var(--font-rubik), sans-serif' }}
          >{t('shared.text.5')}</text>
          <text
            x={map.mystery.x}
            y={map.mystery.y + 36}
            textAnchor="middle"
            fill="#9A9CA3"
            style={{ font: '600 11px var(--font-plex), sans-serif' }}
          >{t('shared.text.4')}</text>
        </g>

        {/* مفيش نقط صمّاء — المنطقة نفسها هي الزرار، وعليها العدد.
            النقطة القديمة كانت بتقول «فيه حاجة هنا» وخلاص، والمستخدم يدوس
            على كل واحدة عشان يعرف. العدد بيقول المعلومة من غير دوسة. */}
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

      {/* منطقة فيها كذا سبوطة — قايمة نختار منها */}
      {openArea && areaList.length > 1 && (
        <div
          className="absolute inset-x-3 bottom-3 rounded-16 p-4"
          style={{ background: '#EFE3CF', color: '#14161A' }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="font-display text-18 font-black">{t('map.area.pick')}</div>
            <button
              type="button"
              onClick={() => setOpenArea(null)}
              aria-label={t('shared.label.2')}
              className="min-h-[44px] shrink-0 cursor-pointer border-0 bg-transparent font-display text-20 font-black"
            >
              ×
            </button>
          </div>
          <div className="mt-2 flex flex-col gap-2">
            {areaList.map((sl) => {
              const s2 = shown.find((x) => x.slug === sl)
              if (!s2) return null
              return (
                <button
                  key={sl}
                  type="button"
                  onClick={() => {
                    setOpenArea(null)
                    setOpen(sl)
                  }}
                  className="flex min-h-[44px] cursor-pointer items-center justify-between gap-3 rounded-14 px-3 text-start"
                  style={{ background: '#E2D2B4', border: '2px solid #14161A' }}
                >
                  <span className="min-w-0">
                    <span className="block truncate font-display text-16 font-black">{s2.name}</span>
                    <span className="block truncate font-body text-13">{s2.meta}</span>
                  </span>
                  <span className="shrink-0 font-body text-13 font-semibold">{s2.left}</span>
                </button>
              )
            })}
          </div>
        </div>
      )}

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
