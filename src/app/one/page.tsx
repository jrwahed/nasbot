'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PhotoPlaceholder } from '@/components/PhotoPlaceholder'
import { Sticker } from '@/components/Sticker'
import { Logo } from '@/components/Logo'
import { getRandomSbota } from '@/lib/api'
import { timeOfDayNow } from '@/lib/theme'
import { track } from '@/lib/track'
import { isLoggedIn } from '@/lib/session'
import type { Sbota } from '@/types'
import { useT } from '@/components/CopyProvider'

/**
 * لحظة «نديها واحدة؟» — صفحة برتقالي بالكامل،
 * علامة استفهام كبيرة بتلف 1.2 ثانية، وبعدين بطاقة سبوطة واحدة.
 * مفيش قايمة — «لأ، وريني غيرها» بتبدّل بنفس الحركة.
 */
export default function OnePage() {
  const t = useT()
  const router = useRouter()
  const [sbota, setSbota] = useState<Sbota | null>(null)
  const [spinning, setSpinning] = useState(true)

  const roll = async (exclude?: string) => {
    setSpinning(true)
    const s = await getRandomSbota(timeOfDayNow(), exclude)
    // اللفة 1.2 ثانية قبل ما البطاقة تظهر
    setTimeout(() => {
      setSbota(s)
      setSpinning(false)
    }, 1200)
  }

  useEffect(() => {
    roll()
  }, [])

  const onBook = () => {
    if (!sbota) return
    track('click_ana_gai', { slug: sbota.slug, from: 'one' })
    router.push(
      isLoggedIn() ? `/s/${sbota.slug}/pay` : `/login?next=/s/${sbota.slug}/pay`
    )
  }

  return (
    <main
      className="flex min-h-screen w-full flex-col items-center px-5 py-8"
      style={{ background: '#F4632A', color: '#14161A' }}
    >
      <div className="flex w-full max-w-page items-center justify-between">
        <button
          type="button"
          onClick={() => router.push('/')}
          className="min-h-[44px] cursor-pointer border-0 bg-transparent p-0 font-body text-16 font-semibold"
          style={{ color: '#14161A' }}
        >{t('one.text.5')}</button>
        <Logo size={22} variant="onOrange" />
      </div>

      {spinning || !sbota ? (
        <div className="flex flex-1 items-center justify-center">
          <span
            className="block font-display font-black leading-none"
            style={{
              fontSize: 140,
              color: '#14161A',
              animation: 'nb-spin-once 1.2s cubic-bezier(.2,.8,.2,1)',
            }}
            aria-label={t('one.label.1')}
            role="img"
          >{t('one.text.4')}</span>
        </div>
      ) : (
        <div className="w-full max-w-page pt-8">
          <h1 className="m-0 text-center font-display text-32 font-black leading-[1.15]">{t('one.text.3')}</h1>

          <article
            className="mt-6 overflow-hidden rounded-20"
            style={{ background: '#EFE3CF', color: '#14161A' }}
          >
            <div className="relative" style={{ aspectRatio: '4 / 3' }}>
              <PhotoPlaceholder
                label={sbota.img}
                variant="sandDeep"
                className="h-full w-full"
              />
              <span className="absolute end-[14px] top-[14px]">
                <Sticker color="ink" rotate={-4} fontSize={16} padding="5px 14px">
                  {sbota.left}
                </Sticker>
              </span>
            </div>
            <div className="flex flex-col gap-[6px] px-[18px] pb-[18px] pt-4">
              <h2 className="m-0 font-display text-26 font-black leading-[1.15]">
                {sbota.name}
              </h2>
              <div className="font-body text-16 font-semibold">{sbota.meta}</div>
              <div className="font-body text-16" style={{ color: '#55575C' }}>
                {sbota.mood}
              </div>
              <div className="mt-2 font-display text-28 font-black leading-none">
                {sbota.price}{' '}
                {sbota.priceNote && (
                  <span className="font-body text-14 font-semibold">
                    {sbota.priceNote}
                  </span>
                )}
              </div>
            </div>
          </article>

          <button
            type="button"
            onClick={onBook}
            className="mt-6 w-full cursor-pointer rounded-16 border-0 font-display text-22 font-black"
            style={{ background: '#14161A', color: '#FBF7EF', minHeight: 58 }}
          >{t('one.text.2')}</button>

          <button
            type="button"
            onClick={() => roll(sbota.slug)}
            className="mt-3 min-h-[44px] w-full cursor-pointer border-0 bg-transparent font-body text-16 font-semibold underline"
            style={{ color: '#14161A' }}
          >{t('one.text.1')}</button>
        </div>
      )}
    </main>
  )
}
