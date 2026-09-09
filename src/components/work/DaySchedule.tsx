'use client'

import type { DaySchedule as Schedule } from '@/types'
import { hourLabel } from '@/lib/map-db'
import { useT } from '@/components/CopyProvider'

/**
 * جدول اليوم — من sbota_templates.work_config (أو الافتراضي 10 / 1 / 2:30 / 3).
 * خط زمني بسيط: نقطة برتقالي وخط رملي، الساعة Rubik والوصف Plex.
 */
export function DaySchedule({ schedule, className = '' }: { schedule: Schedule; className?: string }) {
  const t = useT()

  type Row = { at: string; label: string; time: string }
  const rows: Row[] = [
    { at: schedule.start, time: hourLabel(schedule.start), label: t('shoghl.schedule.start') },
    ...schedule.focusBlocks.map((b) => {
      const [from, to] = b.split('–')
      return {
        at: from ?? b,
        time: to ? `${hourLabel(from)} – ${hourLabel(to)}` : hourLabel(b),
        label: t('shoghl.schedule.focus'),
      }
    }),
    { at: schedule.lunchAt, time: hourLabel(schedule.lunchAt), label: t('shoghl.schedule.lunch') },
    {
      at: schedule.complaintAt,
      time: hourLabel(schedule.complaintAt),
      label: t('shoghl.schedule.complaint'),
    },
    { at: schedule.end, time: hourLabel(schedule.end), label: t('shoghl.schedule.end') },
  ]
  // ترتيب بالساعة — «HH:MM» بيترتب نصيًا صح. الترتيب ثابت فالبداية بتفضل قبل التركيز.
  const sorted = rows.map((r, i) => ({ r, i })).sort((a, b) => a.r.at.localeCompare(b.r.at) || a.i - b.i)

  return (
    <div
      className={`rounded-20 p-[18px] ${className}`}
      style={{ background: '#EFE3CF', color: '#14161A' }}
    >
      <div className="font-display text-20 font-black">{t('shoghl.schedule.title')}</div>
      <ol className="m-0 mt-3 flex list-none flex-col p-0">
        {sorted.map(({ r }, i) => (
          <li key={`${r.at}-${i}`} className="flex gap-3">
            <div className="flex flex-col items-center">
              <span
                className="mt-[6px] block shrink-0"
                style={{ width: 12, height: 12, borderRadius: '50%', background: '#F4632A' }}
              />
              {i < sorted.length - 1 && (
                <span className="block w-[2px] flex-1" style={{ background: '#D9CBAF', minHeight: 18 }} />
              )}
            </div>
            <div className="pb-3">
              <div className="font-display text-17 font-black">{r.time}</div>
              <div className="font-body text-15">{r.label}</div>
            </div>
          </li>
        ))}
      </ol>
      {schedule.deskType && (
        <div
          className="mt-1 pt-3 font-body text-14"
          style={{ color: '#55575C', borderTop: '1px solid #D9CBAF' }}
        >
          {t('shoghl.schedule.desk', { type: schedule.deskType })}
        </div>
      )}
    </div>
  )
}
