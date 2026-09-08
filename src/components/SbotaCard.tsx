'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import type { Sbota } from '@/types'
import { PhotoPlaceholder } from '@/components/PhotoPlaceholder'
import { Sticker } from '@/components/Sticker'
import { PrimaryButton, WaitButton } from '@/components/Buttons'
import { track } from '@/lib/track'
import { isLoggedIn } from '@/lib/session'
import { useT } from '@/components/CopyProvider'

/**
 * بطاقة السبوطة — منقولة بالحرف من design/نسبوط.dc.html:
 * خلفية رملي، زوايا 20، صورة 4/3 بخلفية #E2D2B4،
 * ستيكر «فاضل X من 8» فوق اليمين، شارة «بنات بس» فوق الشمال،
 * الاسم Rubik 900 26، الميتا 600، المزاج #55575C،
 * السعر Rubik 900 28 والزر جنبه.
 */
export function SbotaCard({
  sbota,
  index = 0,
  href,
}: {
  sbota: Sbota
  /** بيحدد اتجاه ميل الستيكر زي الملف: i%2 ? 3 : -4 */
  index?: number
  href?: string
}) {
  const t = useT()
  const router = useRouter()
  const link = href ?? `/s/${sbota.slug}`
  const rotate = sbota.full ? 3 : index % 2 ? 3 : -4

  const onGo = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    track('click_ana_gai', { slug: sbota.slug })
    if (sbota.full) {
      router.push(`${link}?wait=1`)
      return
    }
    router.push(isLoggedIn() ? `${link}/pay` : `/join?next=/s/${sbota.slug}/pay`)
  }

  return (
    <article
      className="w-full max-w-full overflow-hidden rounded-20"
      style={{ background: '#EFE3CF', color: '#14161A' }}
    >
      <Link
        href={link}
        onClick={() => track('open_card', { slug: sbota.slug })}
        className="block"
      >
        <div className="relative" style={{ aspectRatio: '4 / 3' }}>
          <PhotoPlaceholder
            label={sbota.img}
            variant="sandDeep"
            className="h-full w-full"
          />
          <span className="absolute end-[14px] top-[14px]">
            <Sticker
              color={sbota.full ? 'ink' : 'orange'}
              rotate={rotate}
              fontSize={16}
              padding="5px 14px"
            >
              {sbota.left}
            </Sticker>
          </span>
          {sbota.girls && (
            <span className="absolute start-[14px] top-[14px]">
              <Sticker color="cobalt" rotate={4} fontSize={15} padding="5px 14px">{t('shared.text.29')}</Sticker>
            </span>
          )}
        </div>
      </Link>

      <div className="flex flex-col gap-[6px] px-[18px] pb-[18px] pt-4">
        <Link href={link} onClick={() => track('open_card', { slug: sbota.slug })}>
          <h3 className="m-0 font-display text-26 font-black leading-[1.15]">
            {sbota.name}
          </h3>
        </Link>
        <div className="font-body text-16 font-semibold">{sbota.meta}</div>
        <div className="font-body text-16" style={{ color: '#55575C' }}>
          {sbota.mood}
        </div>
        <div className="mt-2 flex items-center justify-between gap-3">
          <div className="font-display text-28 font-black leading-none">
            {sbota.price}{' '}
            {sbota.priceNote && (
              <span className="font-body text-14 font-semibold">{sbota.priceNote}</span>
            )}
          </div>
          {sbota.full ? (
            <WaitButton onClick={onGo}>{t('shared.text.28')}</WaitButton>
          ) : (
            <PrimaryButton className="shrink-0" onClick={onGo}>{t('shared.text.27')}</PrimaryButton>
          )}
        </div>
      </div>
    </article>
  )
}
