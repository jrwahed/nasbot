'use client'

import type { GroupProfession } from '@/types'
import { Sticker } from '@/components/Sticker'
import { useT } from '@/components/CopyProvider'

/**
 * «مين حاجز لحد دلوقتي» — بالمجال، من غير أسامي ولا أعمار.
 * أقل من 3 مجالات معروفة → «لسه بدري». الدالة نفسها ما بترجّعش مجالات قبل الكشف.
 */
export function ProfessionChips({
  booked,
  total,
  professions,
  revealLine,
}: {
  booked: number
  total: number
  professions: GroupProfession[]
  revealLine: string
}) {
  const t = useT()
  const known = professions.reduce((n, p) => n + Math.max(1, p.count), 0)
  const early = known < 3

  return (
    <div className="rounded-20 p-[18px]" style={{ background: '#EFE3CF', color: '#14161A' }}>
      <div className="font-display text-20 font-black">{t('shoghl.who.title')}</div>
      <div className="mt-[6px] font-display text-34 font-black leading-[1.1]">
        {t('shared.ofTotal', { n: booked, total })}
      </div>

      {early ? (
        <div className="mt-[6px] font-body text-16">{t('shoghl.who.early')}</div>
      ) : (
        <div className="mt-3 flex flex-wrap gap-x-[10px] gap-y-3">
          {professions.map((p, i) => (
            <Sticker key={p.name} color="cream" bg="#FBF7EF" rotate={i % 2 ? 2 : -2} fontSize={14} padding="6px 14px">
              {p.count > 1 ? `${p.name} ×${p.count}` : p.name}
            </Sticker>
          ))}
        </div>
      )}

      <div
        className="mt-[10px] pt-[10px] font-body text-14"
        style={{ color: '#55575C', borderTop: '1px solid #D9CBAF' }}
      >
        {t('shoghl.who.mix')} {revealLine}
      </div>
    </div>
  )
}
