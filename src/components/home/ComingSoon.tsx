'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { PhotoPlaceholder } from '@/components/PhotoPlaceholder'
import { Sticker } from '@/components/Sticker'
import { WaitButton } from '@/components/Buttons'
import { useT } from '@/components/CopyProvider'
import { getComingSoon, wantSoon, type SoonItem } from '@/lib/api'
import { isLoggedIn } from '@/lib/session'
import { track } from '@/lib/track'

/**
 * «جاية قريب» — تحت السبوطات المفتوحة في الرئيسية (0117).
 *
 * نفس شكل `SbotaCard` بالظبط (رملي · زوايا 20 · صورة 4/3) علشان يبانوا
 * عيلة واحدة — بس **من غير ميعاد ولا سعر ولا زرار حجز**. الزرار الوحيد
 * «قولّي لما تفتح»، ومش برتقالي عن قصد: البرتقالي للحجز بس.
 *
 * ⚠ لو مفيش ولا قالب «قريب»، القسم كله بيختفي — مش عنوان فوق فراغ.
 */
export function ComingSoon({ className = '' }: { className?: string }) {
  const t = useT()
  const [items, setItems] = useState<SoonItem[]>([])

  useEffect(() => {
    let alive = true
    getComingSoon().then((l) => {
      if (alive) setItems(l)
    })
    return () => {
      alive = false
    }
  }, [])

  if (items.length === 0) return null

  return (
    <section className={className}>
      <h2 className="m-0 font-display text-26 font-black leading-[1.15]">{t('soon.title')}</h2>
      <div className="mt-1" style={{ color: 'var(--sbt-sub)' }}>{t('soon.sub')}</div>
      <div className="grid grid-cols-1 gap-4 pt-4 md:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
        {items.map((s, i) => (
          <SoonCard
            key={s.templateId}
            item={s}
            index={i}
            onChange={(on) =>
              setItems((prev) =>
                prev.map((x) => (x.templateId === s.templateId ? { ...x, iWant: on } : x))
              )
            }
          />
        ))}
      </div>
    </section>
  )
}

function SoonCard({
  item,
  index,
  onChange,
}: {
  item: SoonItem
  index: number
  onChange: (on: boolean) => void
}) {
  const t = useT()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)

  const onTap = async () => {
    if (!isLoggedIn()) {
      router.push('/login?next=/')
      return
    }
    const next = !item.iWant
    setBusy(true)
    setErr(false)
    const res = await wantSoon(item.templateId, next)
    setBusy(false)
    if (res === null) {
      setErr(true)
      return
    }
    if (res) track('soon_want', { slug: item.slug })
    onChange(res)
  }

  return (
    <article
      className="w-full max-w-full overflow-hidden rounded-20"
      style={{ background: '#EFE3CF', color: '#14161A' }}
    >
      <div className="relative" style={{ aspectRatio: '4 / 3' }}>
        <PhotoPlaceholder
          label={item.name}
          src={item.imgSrc}
          alt={item.photoAlt ?? item.name}
          variant="sandDeep"
          className="h-full w-full"
        />
        <span className="absolute end-[14px] top-[14px]">
          <Sticker color="ink" rotate={index % 2 ? 3 : -4} fontSize={16} padding="5px 14px">
            {t('soon.badge')}
          </Sticker>
        </span>
      </div>

      <div className="flex flex-col gap-[6px] px-[18px] pb-[18px] pt-4">
        <h3 className="m-0 font-display text-26 font-black leading-[1.15]">{item.name}</h3>
        {item.mood && (
          <div className="font-body text-16" style={{ color: '#55575C' }}>
            {item.mood}
          </div>
        )}
        <div className="mt-2 flex items-center justify-end gap-3">
          {item.iWant ? (
            <button
              type="button"
              onClick={onTap}
              disabled={busy}
              className="min-h-[48px] shrink-0 cursor-pointer rounded-14 px-[14px] font-display text-15 font-black leading-none"
              style={{ background: '#14161A', color: '#FBF7EF', border: 0 }}
            >
              {t('soon.wanted')}
            </button>
          ) : (
            <WaitButton onClick={onTap} disabled={busy}>
              {t('soon.want')}
            </WaitButton>
          )}
        </div>
        {err && (
          <div className="font-body text-14" style={{ color: '#B3261E' }}>
            {t('soon.error')}
          </div>
        )}
      </div>
    </article>
  )
}
