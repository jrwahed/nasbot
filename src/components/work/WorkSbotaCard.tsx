'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { WorkSbota } from '@/types'
import { PhotoPlaceholder } from '@/components/PhotoPlaceholder'
import { Sticker } from '@/components/Sticker'
import { PrimaryButton, WaitButton } from '@/components/Buttons'
import { PinIcon } from '@/components/Icons'
import { track } from '@/lib/track'
import { useT } from '@/components/CopyProvider'

/**
 * بطاقة سبوطة الشغل — نفس بطاقة السبوطة (رملي، زوايا 20، صورة 4/3)
 * وزيادة: اسم المكان، والنت، والبريز، والصوت في كبسولات كريمي.
 * الزر بيروح لصفحة السبوطة نفسها — الاختيار بين «أنا جاي» و«أول مرة» هناك.
 */
export function WorkSbotaCard({
  sbota,
  index = 0,
  priceLabel,
}: {
  sbota: WorkSbota
  /** بيحدد اتجاه ميل الستيكر زي الملف: i%2 ? 3 : -4 */
  index?: number
  /** سعر اليوم الواحد من settings — لو مااتبعتش بياخد سعر السبوطة */
  priceLabel?: string
}) {
  const t = useT()
  const router = useRouter()
  const link = `/shoghl/${sbota.slug}`
  const rotate = sbota.full ? 3 : index % 2 ? 3 : -4
  const v = sbota.venue

  const specs: string[] = []
  if (v?.wifiMbps) specs.push(t('shoghl.card.wifi', { n: v.wifiMbps }))
  if (v?.outlets) specs.push(t(`shoghl.outlets.${v.outlets}`))
  if (v?.noise) specs.push(t(`shoghl.noise.${v.noise}`))

  const open = () => track('open_card', { slug: sbota.slug, work: true })
  const go = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    track('click_ana_gai', { slug: sbota.slug, work: true })
    router.push(link)
  }

  return (
    <article
      className="w-full max-w-full overflow-hidden rounded-20"
      style={{ background: '#EFE3CF', color: '#14161A' }}
    >
      <Link href={link} onClick={open} className="block">
        <div className="relative" style={{ aspectRatio: '4 / 3' }}>
          <PhotoPlaceholder label={sbota.img} src={sbota.imgSrc} variant="sandDeep" className="h-full w-full" />
          <span className="absolute end-[14px] top-[14px]">
            <Sticker
              color={sbota.full ? 'ink' : 'orange'}
              rotate={rotate}
              fontSize={16}
              padding="5px 14px"
            >
              {sbota.full
                ? t('shoghl.card.full')
                : t('shoghl.card.left', { n: sbota.spotsLeft, total: sbota.spotsTotal })}
            </Sticker>
          </span>
          {sbota.girls && (
            <span className="absolute start-[14px] top-[14px]">
              <Sticker color="cobalt" rotate={4} fontSize={15} padding="5px 14px">
                {t('shared.text.29')}
              </Sticker>
            </span>
          )}
        </div>
      </Link>

      <div className="flex flex-col gap-[6px] px-[18px] pb-[18px] pt-4">
        <Link href={link} onClick={open}>
          <h3 className="m-0 font-display text-26 font-black leading-[1.15]">{sbota.name}</h3>
        </Link>
        <div className="font-body text-16 font-semibold">{sbota.meta}</div>
        {v?.name && (
          <div className="flex items-center gap-2 font-body text-16" style={{ color: '#55575C' }}>
            <PinIcon size={18} />
            <span>
              {v.name}
              {v.area ? ` · ${v.area}` : ''}
            </span>
          </div>
        )}
        {specs.length > 0 && (
          <div className="mt-1 flex flex-wrap gap-2">
            {specs.map((s, i) => (
              <Sticker key={s} color="cream" size="sm" rotate={i % 2 ? 2 : -2} bg="#FBF7EF">
                {s}
              </Sticker>
            ))}
          </div>
        )}
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="font-display text-28 font-black leading-none">
            {priceLabel ?? sbota.price}
          </div>
          {sbota.full ? (
            <WaitButton type="button" onClick={go}>
              {t('shoghl.cta.wait')}
            </WaitButton>
          ) : (
            <PrimaryButton type="button" className="shrink-0" onClick={go}>
              {t('shoghl.card.cta')}
            </PrimaryButton>
          )}
        </div>
      </div>
    </article>
  )
}
