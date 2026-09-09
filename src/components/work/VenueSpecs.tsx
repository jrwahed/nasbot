'use client'

import type { ReactNode } from 'react'
import type { WorkVenue } from '@/types'
import { hourLabel } from '@/lib/map-db'
import {
  CarIcon,
  ClockSmallIcon,
  CoinsIcon,
  DeskIcon,
  MeetingIcon,
  PlugIcon,
  SnowIcon,
  SoundIcon,
  WifiIcon,
} from '@/components/work/WorkIcons'
import { useT } from '@/components/CopyProvider'

/**
 * مواصفات المكان — بطاقة رملي زوايا 20 حشو 18، صفوف أيقونة + تسمية + قيمة.
 * النت رقم صريح بالميجا (مش «كويس»)، والبريز والصوت بدرجاتهم من القاعدة.
 * سعر الجملة مش هنا ولا في أي مكان في الواجهة.
 */
export function VenueSpecs({
  venue,
  compact = false,
  showTitle = true,
  bare = false,
  className = '',
}: {
  venue: WorkVenue
  /** نسخة أقصر لبطاقات الأماكن — 4 صفوف بس */
  compact?: boolean
  showTitle?: boolean
  /** جوه بطاقة رملي أصلًا — من غير خلفية ولا حشو */
  bare?: boolean
  className?: string
}) {
  const t = useT()
  const yn = (b: boolean) => (b ? t('shoghl.yes') : t('shoghl.no'))

  const rows: { icon: ReactNode; label: string; value: string }[] = [
    {
      icon: <WifiIcon />,
      label: t('shoghl.venue.wifi'),
      value: venue.wifiMbps
        ? t('shoghl.venue.wifiValue', { n: venue.wifiMbps })
        : t('shoghl.venue.wifiNa'),
    },
    {
      icon: <PlugIcon />,
      label: t('shoghl.venue.outlets'),
      value: venue.outlets ? t(`shoghl.outlets.${venue.outlets}`) : t('shoghl.venue.wifiNa'),
    },
    {
      icon: <SoundIcon />,
      label: t('shoghl.venue.noise'),
      value: venue.noise ? t(`shoghl.noise.${venue.noise}`) : t('shoghl.venue.wifiNa'),
    },
    {
      icon: <CoinsIcon />,
      label: t('shoghl.venue.min'),
      value:
        venue.minConsumption != null
          ? t('shoghl.venue.minValue', { n: venue.minConsumption })
          : t('shoghl.no'),
    },
  ]
  if (!compact) {
    rows.push(
      { icon: <MeetingIcon />, label: t('shoghl.venue.meeting'), value: yn(venue.hasMeetingRoom) },
      { icon: <CarIcon />, label: t('shoghl.venue.parking'), value: yn(venue.hasParking) },
      { icon: <SnowIcon />, label: t('shoghl.venue.ac'), value: yn(venue.hasAc) }
    )
    if (venue.desksCount) {
      rows.push({ icon: <DeskIcon />, label: t('shoghl.venue.desks'), value: String(venue.desksCount) })
    }
    if (venue.openFrom && venue.openTo) {
      rows.push({
        icon: <ClockSmallIcon />,
        label: t('shoghl.venue.hours'),
        value: t('shoghl.venue.hoursValue', {
          from: hourLabel(venue.openFrom),
          to: hourLabel(venue.openTo),
        }),
      })
    }
  }

  return (
    <div
      className={`${bare ? '' : 'rounded-20 p-[18px]'} ${className}`}
      style={bare ? { color: '#14161A' } : { background: '#EFE3CF', color: '#14161A' }}
    >
      {showTitle && (
        <div className="flex items-baseline justify-between gap-3">
          <div className="font-display text-20 font-black">{t('shoghl.venue.title')}</div>
          <div className="font-body text-14 font-semibold" style={{ color: '#55575C' }}>
            {venue.name}
            {venue.area ? ` · ${venue.area}` : ''}
          </div>
        </div>
      )}
      <div className={`grid grid-cols-2 gap-x-3 gap-y-3 ${showTitle ? 'mt-3' : ''}`}>
        {rows.map((r) => (
          <div key={r.label} className="flex items-start gap-[10px]">
            <span className="mt-[2px] shrink-0">{r.icon}</span>
            <div className="min-w-0">
              <div className="font-body text-13" style={{ color: '#55575C' }}>
                {r.label}
              </div>
              <div className="font-body text-15 font-semibold">{r.value}</div>
            </div>
          </div>
        ))}
      </div>
      {!compact && venue.wifiNote && (
        <div
          className="mt-3 pt-3 font-body text-14"
          style={{ color: '#55575C', borderTop: '1px solid #D9CBAF' }}
        >
          {venue.wifiNote}
        </div>
      )}
    </div>
  )
}
