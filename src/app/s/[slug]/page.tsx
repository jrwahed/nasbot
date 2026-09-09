'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import { InnerHeader } from '@/components/Header'
import { PhotoPlaceholder } from '@/components/PhotoPlaceholder'
import { publicMediaUrl } from '@/lib/supabase'
import { Sticker } from '@/components/Sticker'
import { CaptainCard } from '@/components/CaptainCard'
import { WhoBooked, GuaranteeBox } from '@/components/WhoBooked'
import { StickyCTA } from '@/components/StickyCTA'
import { BottomSheet } from '@/components/BottomSheet'
import { PrimaryButton, SecondaryButton } from '@/components/Buttons'
import { ClockIcon, ArrowIcon, PinIcon, LevelIcon } from '@/components/Icons'
import { getSbota, getCaptain } from '@/lib/api'
import { fiveRules, guaranteeText } from '@/data/lists'
import { track } from '@/lib/track'
import { isLoggedIn } from '@/lib/session'
import { useTheme } from '@/lib/use-theme'
import type { Captain, Sbota } from '@/types'
import { useT } from '@/components/CopyProvider'

/**
 * صفحة السبوطة — منقولة بالحرف من شاشة 7 في design/نسبوط.dc.html.
 * نفس الصفحة بتخدم سبوطة الشغل (kind: 'work') بس بوضع نهاري إجباري
 * و«مين حاجز» بالمجال بدل السن.
 */
export default function SbotaPage() {
  const t = useT()
  const params = useParams<{ slug: string }>()
  const search = useSearchParams()
  const router = useRouter()
  const [, setTheme] = useTheme()
  const [sbota, setSbota] = useState<Sbota | null>(null)
  const [captain, setCaptain] = useState<Captain | null>(null)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const waiting = search.get('wait') === '1'

  useEffect(() => {
    let alive = true
    getSbota(params.slug).then(async (s) => {
      if (!alive) return
      if (!s) {
        router.replace('/not-found')
        return
      }
      setSbota(s)
      setCaptain(await getCaptain(s.captainId))
      setLoading(false)
      track('open_card', { slug: s.slug })
      // سبوطة الشغل نهارية إجباريًا
      if (s.kind === 'work') setTheme('day')
    })
    return () => {
      alive = false
    }
    // setTheme ثابتة — مش محتاجة تدخل في الاعتماديات
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [params.slug, router])

  const onBook = () => {
    if (!sbota) return
    track('click_ana_gai', { slug: sbota.slug })
    router.push(
      isLoggedIn() ? `/s/${sbota.slug}/pay` : `/login?next=/s/${sbota.slug}/pay`
    )
  }

  if (loading || !sbota || !captain) {
    return (
      <main className="mx-auto w-full max-w-page px-5 pb-24">
        <InnerHeader back={t('sbota.label.3')} padded={false} />
        <div className="pt-8 font-body text-16" style={{ color: 'var(--muted)' }}>{t('sbota.text.5')}</div>
      </main>
    )
  }

  const isWork = sbota.kind === 'work'

  return (
    <main className="mx-auto w-full max-w-page pb-6">
      <div className="px-5">
        <InnerHeader back={t('sbota.label.3')} padded={false} />
      </div>

      {/* ===== المعرض + ستيكر «فاضل X من 8» ===== */}
      <div className="relative">
        <div className="nb-scroll-x gap-[10px] px-5 pt-[6px]">
          {sbota.gallery.map((g, i) => (
            <PhotoPlaceholder
              key={`${g}-${i}`}
              label={g}
              src={publicMediaUrl(g)}
              className="shrink-0"
              style={{ width: 300, borderRadius: 20, padding: 20 }}
            />
          ))}
        </div>
        <span className="absolute" style={{ top: 20, insetInlineEnd: 34 }}>
          <Sticker
            color={sbota.full ? 'ink' : 'orange'}
            rotate={-4}
            fontSize={18}
            padding="6px 16px"
          >
            {sbota.left}
          </Sticker>
        </span>
        {sbota.firstTimeOffer && (
          <span className="absolute" style={{ top: 20, insetInlineStart: 34 }}>
            <Sticker color="cobalt" rotate={4} fontSize={15} padding="5px 14px">
              {sbota.firstTimeOffer.label}
            </Sticker>
          </span>
        )}
      </div>

      {/* ===== الاسم والحكاية ===== */}
      <div className="px-5 pt-[22px]">
        <h1 className="m-0 font-display text-40 font-black leading-[1.1]">
          {sbota.name}
        </h1>
        <p className="mb-0 mt-2 text-17">{sbota.story}</p>
      </div>

      {/* ===== صف المعلومات ===== */}
      <div className="grid grid-cols-2 gap-3 px-5 pt-5">
        <div className="flex items-center gap-[10px]">
          <ClockIcon />
          <span className="font-semibold">{sbota.when}</span>
        </div>
        <div className="flex items-center gap-[10px]">
          <ArrowIcon />
          <span className="font-semibold">{sbota.duration}</span>
        </div>
        <div className="flex items-center gap-[10px]">
          <PinIcon />
          <span className="font-semibold">
            {sbota.area}{' '}
            <span
              className="font-body text-13 font-normal"
              style={{ color: 'var(--muted)' }}
            >
              {sbota.addressHint}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-[10px]">
          <LevelIcon />
          <span className="font-semibold">{sbota.level}</span>
        </div>
      </div>

      {/* ===== الكابتن ===== */}
      <div className="px-5 pt-6">
        <CaptainCard captain={captain} />
      </div>

      {/* ===== مين حاجز ===== */}
      <div className="px-5 pt-4">
        <WhoBooked data={sbota.whoBooked} />
      </div>

      {isWork && (
        <div className="px-5 pt-4">
          <div
            className="rounded-16 p-4 font-body text-15 font-semibold"
            style={{ background: '#EFE3CF', color: '#14161A' }}
          >{t('sbota.text.4')}</div>
        </div>
      )}

      {/* ===== شامله / مش شامله ===== */}
      <div className="grid grid-cols-2 gap-3 px-5 pt-6">
        <div>
          <div className="font-display text-18 font-black" style={{ color: 'var(--accent-text)' }}>{t('sbota.text.3')}</div>
          <ul className="mb-0 mt-[6px] list-disc ps-[18px] text-15">
            {sbota.includes.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
        <div>
          <div
            className="font-display text-18 font-black"
            style={{ color: 'var(--muted)' }}
          >{t('sbota.text.2')}</div>
          <ul className="mb-0 mt-[6px] list-disc ps-[18px] text-15">
            {sbota.excludes.map((i) => (
              <li key={i}>{i}</li>
            ))}
          </ul>
        </div>
      </div>

      {/* ===== السعر ===== */}
      <div className="px-5 pt-6">
        <div className="font-display text-34 font-black leading-[1.1]">
          {sbota.price}
        </div>
        <div className="font-body text-14" style={{ color: 'var(--muted)' }}>
          {sbota.priceBreakdown}
        </div>
        {sbota.firstTimeOffer && (
          <div className="mt-2 font-body text-15 font-semibold">
            {t('sbota.firstTimeOffer', { price: sbota.firstTimeOffer.price })}
          </div>
        )}
      </div>

      {/* ===== الضمان ===== */}
      <div className="px-5 pt-4">
        <GuaranteeBox text={guaranteeText} />
      </div>

      <div className="px-5 pt-[14px]">
        <SecondaryButton onClick={() => setRulesOpen(true)}>{t('sbota.label.1')}</SecondaryButton>
      </div>

      {/* ===== الزر اللاصق ===== */}
      <div className="mt-6 px-5">
        <StickyCTA>
          {sbota.full ? (
            <SecondaryButton
              onClick={onBook}
              className="w-full"
              aria-label={t('sbota.text.1')}
            >{t('sbota.text.1')}</SecondaryButton>
          ) : (
            <PrimaryButton size="lg" onClick={onBook} className="w-full">
              {t('sbota.cta', { price: sbota.price })}
            </PrimaryButton>
          )}
          <div
            className="mt-[6px] text-center font-body text-13"
            style={{ color: 'var(--muted)' }}
          >
            {waiting
              ? t('sbota.waitlistNote')
              : t('sbota.label.2')}
          </div>
        </StickyCTA>
      </div>

      <BottomSheet open={rulesOpen} onClose={() => setRulesOpen(false)} title={t('sbota.label.1')}>
        <ol className="m-0 flex list-none flex-col gap-4 p-0">
          {fiveRules.map((r) => (
            <li key={r.n} className="flex gap-3">
              <span
                className="font-display text-26 font-black leading-none"
                style={{ color: 'var(--accent-text)' }}
              >
                {r.n}
              </span>
              <div>
                <div className="font-display text-18 font-black">{r.title}</div>
                <div className="font-body text-15" style={{ color: 'var(--muted)' }}>
                  {r.body}
                </div>
              </div>
            </li>
          ))}
        </ol>
      </BottomSheet>
    </main>
  )
}
