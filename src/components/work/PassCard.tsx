'use client'

import type { PassKind } from '@/types'
import { Sticker } from '@/components/Sticker'
import { useT } from '@/components/CopyProvider'

/**
 * بطاقة الكارت — رملي، زوايا 20، السعر Rubik 34، وستيكر «وفّر X».
 * التوفير بيتحسب من سعر اليوم الواحد في settings — مش رقم ثابت.
 */
export function PassCard({
  kind,
  price,
  weeks,
  singlePrice,
  selected,
  onSelect,
  rotate = -3,
}: {
  kind: PassKind
  /** بالجنيه */
  price: number
  weeks: number
  singlePrice: number
  selected?: boolean
  onSelect?: () => void
  rotate?: number
}) {
  const t = useT()
  const days = kind === 'four' ? 4 : 8
  const save = Math.max(0, days * singlePrice - price)
  const perDay = Math.round(price / days)
  const interactive = Boolean(onSelect)

  const body = (
    <>
      <div className="flex items-start justify-between gap-3">
        <div className="font-display text-22 font-black leading-[1.15]">
          {kind === 'four' ? t('shoghl.pass.four') : t('shoghl.pass.eight')}
        </div>
        {save > 0 && (
          <Sticker color="orange" rotate={rotate} size="md">
            {t('shoghl.pass.save', { n: save })}
          </Sticker>
        )}
      </div>
      <div className="mt-2 font-display text-34 font-black leading-[1.1]">
        {t('shared.egp', { n: price })}
      </div>
      <div className="mt-1 font-body text-15 font-semibold">{t('shoghl.pass.perDay', { n: perDay })}</div>
      <div className="font-body text-14" style={{ color: '#55575C' }}>
        {t('shoghl.pass.weeks', { n: weeks })} · {t('shoghl.pass.single', { n: singlePrice })}
      </div>
    </>
  )

  const style = {
    background: '#EFE3CF',
    color: '#14161A',
    border: `2px solid ${selected ? '#14161A' : '#EFE3CF'}`,
  }

  if (!interactive) {
    return (
      <div className="rounded-20 p-[18px]" style={style}>
        {body}
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className="w-full cursor-pointer rounded-20 p-[18px] text-start"
      style={style}
    >
      {body}
    </button>
  )
}
