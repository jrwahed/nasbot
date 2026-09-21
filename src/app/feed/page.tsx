'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { InnerHeader } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { PhotoPlaceholder } from '@/components/PhotoPlaceholder'
import { FeatureGate } from '@/components/FlagsProvider'
import { useT } from '@/components/CopyProvider'
import { getFeed, type FeedItem } from '@/lib/api'

/**
 * «اللي بيحصل» — الفيد.
 *
 * الوجع: العضو بيخرج مرة وبيختفي، ومفيش حاجة بتوريه إن النادي **حي**.
 *
 * 🔴 **مقفول على اللي خرج معانا مرة على الأقل** (`fn_is_alumni`). الزائر،
 *    والعضو اللي عامل حساب وبس، بياخدوا فيد فاضي من القاعدة — والصفحة
 *    بتقول ليه بدل ما تسيبه في شاشة بيضا.
 *
 * 🔴 **وطبقتين:** خروجاتك انت بصورها وبرابطها · وباقي الخروجات كرت
 *    **من غير صور ولا أسامي**. دي مش فلترة في الواجهة — `fn_feed` نفسها
 *    مش بترجّع الصور للي مكانش في الخروجة. لو حد حط الأسامي هنا يبقى كسر
 *    القرار، و`test_feed()` بيمسكها.
 */
function FeedBody() {
  const t = useT()
  const [items, setItems] = useState<FeedItem[] | null>(null)

  useEffect(() => {
    let alive = true
    getFeed().then((rows) => alive && setItems(rows))
    return () => {
      alive = false
    }
  }, [])

  return (
    <main className="mx-auto w-full max-w-page px-5 pb-10">
      <InnerHeader back={t('shared.text.18')} href="/" padded={false} />

      <h1 className="mb-0 mt-[10px] font-display text-32 font-black leading-[1.15]">
        {t('feed.title')}
      </h1>
      <div className="mt-1 font-body text-14" style={{ color: 'var(--muted)' }}>
        {t('feed.note')}
      </div>

      {items === null ? null : items.length === 0 ? (
        <div className="mt-8 rounded-20 p-5" style={{ background: 'var(--surface)' }}>
          <div className="font-body text-16">{t('feed.locked')}</div>
          <Link
            href="/"
            className="mt-4 grid min-h-[48px] w-full place-items-center rounded-14 font-display text-16 font-black"
            style={{ background: '#F4632A', color: '#14161A' }}
          >
            {t('feed.cta')}
          </Link>
        </div>
      ) : (
        <div className="mt-5 flex flex-col gap-4">
          {items.map((it) => (
            <article
              key={it.sbotaId}
              className="overflow-hidden rounded-20"
              style={{
                background: it.mine ? '#EFE3CF' : 'var(--surface)',
                color: it.mine ? '#14161A' : 'var(--fg)',
              }}
            >
              {/* الصورة بتبان في خروجاتي بس */}
              {it.mine && it.photos > 0 && (
                <div style={{ background: '#D9CBAF' }}>
                  {it.photoSrc ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={it.photoSrc} alt={it.title} className="block h-auto w-full" loading="lazy" />
                  ) : (
                    <PhotoPlaceholder label={it.title} variant="sandDeep" />
                  )}
                </div>
              )}

              <div className="p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-display text-18 font-black">{it.title}</span>
                  {it.mine && (
                    <span
                      className="rounded-pill px-2 py-[2px] font-display text-12 font-black"
                      style={{ background: '#F4632A', color: '#14161A' }}
                    >
                      {t('feed.mine')}
                    </span>
                  )}
                </div>

                {/* أرقام بس — مفيش ولا اسم لحد مكنتش معاه */}
                <div
                  className="mt-1 font-body text-14"
                  style={{ color: it.mine ? '#55575C' : 'var(--muted)' }}
                >
                  {it.when} · {t('feed.people', { n: it.people })}
                  {it.mine && it.photos > 0 && <> · {t('feed.photos', { n: it.photos })}</>}
                </div>

                {it.mine && it.bookingId && (
                  <Link
                    href={`/my/${it.bookingId}`}
                    className="mt-3 inline-grid min-h-[44px] place-items-center rounded-14 px-5 font-display text-15 font-black"
                    style={{ background: '#F4632A', color: '#14161A' }}
                  >
                    {t('feed.open')}
                  </Link>
                )}
              </div>
            </article>
          ))}
        </div>
      )}

      <Footer />
    </main>
  )
}

export default function FeedPage() {
  return (
    <FeatureGate flag="feed">
      <FeedBody />
    </FeatureGate>
  )
}
