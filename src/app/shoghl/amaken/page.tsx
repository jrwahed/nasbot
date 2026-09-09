'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { InnerHeader } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { Sticker } from '@/components/Sticker'
import { PhotoPlaceholder } from '@/components/PhotoPlaceholder'
import { PinIcon } from '@/components/Icons'
import { VenueSpecs } from '@/components/work/VenueSpecs'
import { getWorkVenues } from '@/lib/api'
import type { WorkVenue } from '@/types'
import { useT } from '@/components/CopyProvider'

/**
 * /shoghl/amaken — كل أماكن الشغل النشطة من work_venues_public.
 * بطاقة لكل مكان: صور، المواصفات، أحسن الأيام، و«شوف مواعيدنا هنا».
 * العنوان الكامل بيظهر بس لو فيه سبوطة شغل معلنة في المكان (getWorkVenues بتقرر).
 */
export default function AmakenPage() {
  const t = useT()
  const [venues, setVenues] = useState<WorkVenue[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    getWorkVenues().then((v) => {
      if (!alive) return
      setVenues(v)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [])

  return (
    <main className="mx-auto w-full max-w-page pb-6">
      <div className="px-5">
        <InnerHeader back={t('shoghl.back')} href="/shoghl" padded={false} hideToggle />
      </div>

      <div className="px-5 pt-[10px]">
        <h1 className="m-0 font-display text-30 font-black leading-[1.15]">{t('shoghl.amaken.title')}</h1>
        <div className="mt-1 font-body text-16" style={{ color: 'var(--muted)' }}>
          {t('shoghl.amaken.sub')}
        </div>
      </div>

      {loading ? (
        <div className="px-5 pt-6 font-body text-16" style={{ color: 'var(--muted)' }}>
          {t('shoghl.loading')}
        </div>
      ) : venues.length === 0 ? (
        <div className="px-5 pt-6 font-body text-16" style={{ color: 'var(--muted)' }}>
          {t('shoghl.venuesEmpty')}
        </div>
      ) : (
        <div className="flex flex-col gap-5 px-5 pt-5">
          {venues.map((v, i) => (
            <article
              key={v.venueId}
              className="overflow-hidden rounded-20"
              style={{ background: '#EFE3CF', color: '#14161A' }}
            >
              {/* الصور */}
              <div className="relative">
                <div className="nb-scroll-x gap-[10px] p-3 pb-0">
                  {(v.photos.length ? v.photos : [v.name]).map((p) => (
                    <PhotoPlaceholder
                      key={p}
                      label={p}
                      variant="sandDeep"
                      className="shrink-0"
                      style={{ width: 240, aspectRatio: '4 / 3', borderRadius: 16, padding: 16 }}
                    />
                  ))}
                </div>
                {v.kind !== 'other' && (
                  <span className="absolute end-[22px] top-[22px]">
                    <Sticker color="orange" rotate={i % 2 ? 3 : -4} size="md">
                      {t(`shoghl.kind.${v.kind}`)}
                    </Sticker>
                  </span>
                )}
              </div>

              <div className="p-[18px]">
                <h2 className="m-0 font-display text-26 font-black leading-[1.15]">{v.name}</h2>
                <div className="mt-1 flex items-center gap-2 font-body text-16 font-semibold">
                  <PinIcon size={18} />
                  <span>
                    {v.area}
                    {v.address ? (
                      <span className="font-normal" style={{ color: '#55575C' }}>
                        {' '}
                        — {v.address}
                      </span>
                    ) : null}
                  </span>
                </div>
                {!v.address && (
                  <div className="mt-1 font-body text-13" style={{ color: '#55575C' }}>
                    {t('shoghl.venue.addressHidden')}
                  </div>
                )}

                <VenueSpecs venue={v} showTitle={false} bare className="mt-3" />

                {v.bestDays.length > 0 && (
                  <div className="mt-4">
                    <div className="font-body text-13" style={{ color: '#55575C' }}>
                      {t('shoghl.venue.bestDays')}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-2">
                      {v.bestDays.map((d, j) => (
                        <Sticker key={d} color="cream" bg="#FBF7EF" rotate={j % 2 ? 2 : -2} fontSize={13} padding="6px 14px">
                          {d}
                        </Sticker>
                      ))}
                    </div>
                  </div>
                )}

                <Link
                  href="/shoghl#schedule"
                  className="mt-4 grid min-h-[48px] w-full place-items-center rounded-14 font-display text-18 font-black leading-none"
                  style={{
                    background: v.hasUpcomingSbota ? '#F4632A' : 'transparent',
                    color: '#14161A',
                    border: `2px solid ${v.hasUpcomingSbota ? '#F4632A' : '#14161A'}`,
                  }}
                >
                  {t('shoghl.venue.seeDates')}
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}

      <Footer />
    </main>
  )
}
