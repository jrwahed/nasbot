'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { InnerHeader } from '@/components/Header'
import { PhotoPlaceholder } from '@/components/PhotoPlaceholder'
import { publicMediaUrl } from '@/lib/supabase'
import { Sticker } from '@/components/Sticker'
import { CaptainCard } from '@/components/CaptainCard'
import { GuaranteeBox } from '@/components/WhoBooked'
import { StickyCTA } from '@/components/StickyCTA'
import { BottomSheet } from '@/components/BottomSheet'
import { PrimaryButton, SecondaryButton } from '@/components/Buttons'
import { ClockIcon, ArrowIcon, PinIcon, LevelIcon } from '@/components/Icons'
import { VenueSpecs } from '@/components/work/VenueSpecs'
import { DaySchedule } from '@/components/work/DaySchedule'
import { ProfessionChips } from '@/components/work/ProfessionChips'
import { PassRedeemButton } from '@/components/work/PassRedeemButton'
import {
  getCaptain,
  getGroupProfessions,
  getMyActivePass,
  getSbota,
  getWorkSbota,
  getWorkSettings,
  hasPriorWorkBooking,
} from '@/lib/api'
import { fiveRules, guaranteeText } from '@/data/lists'
import { track } from '@/lib/track'
import { isLoggedIn } from '@/lib/session'
import type { Captain, GroupProfession, WorkPass, WorkPayWith, WorkSbota, WorkSettings } from '@/types'
import { useT } from '@/components/CopyProvider'

/**
 * صفحة سبوطة الشغل — نفس مسار بيانات /s/[slug] (sbotat_public + fn_who_booked)
 * وزيادة: بطاقة المكان من work_venues_public، جدول اليوم من work_config،
 * و«مين حاجز» بالمجال من fn_group_professions.
 * الحجز بـ 3 اختيارات: أنا جاي (يوم) · كارتي (المرحلة 3) · أول مرة (لأول حجز شغل).
 */
export default function WorkSbotaPage() {
  const t = useT()
  const params = useParams<{ slug: string }>()
  const router = useRouter()

  const [sbota, setSbota] = useState<WorkSbota | null>(null)
  const [captain, setCaptain] = useState<Captain | null>(null)
  const [settings, setSettings] = useState<WorkSettings | null>(null)
  const [professions, setProfessions] = useState<GroupProfession[]>([])
  const [pass, setPass] = useState<WorkPass | null>(null)
  const [firstTime, setFirstTime] = useState(false)
  const [loggedIn, setLoggedIn] = useState(false)
  const [rulesOpen, setRulesOpen] = useState(false)
  const [waiting, setWaiting] = useState(false)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    const logged = isLoggedIn()
    setLoggedIn(logged)

    getWorkSbota(params.slug).then(async (s) => {
      if (!alive) return
      if (!s) {
        // مش سبوطة شغل؟ لو موجودة كسبوطة عادية نوديه لصفحتها، غير كده مش موجودة
        const plain = await getSbota(params.slug)
        router.replace(plain ? `/s/${params.slug}` : '/not-found')
        return
      }
      setSbota(s)
      track('open_card', { slug: s.slug, work: true })

      const [cap, cfg, profs, myPass, prior] = await Promise.all([
        getCaptain(s.captainId),
        getWorkSettings(),
        getGroupProfessions(s.sbotaId),
        logged ? getMyActivePass() : Promise.resolve(null),
        logged ? hasPriorWorkBooking() : Promise.resolve(false),
      ])
      if (!alive) return
      setCaptain(cap)
      setSettings(cfg)
      setProfessions(profs)
      setPass(myPass)
      // «أول مرة» بيظهر بس للي داخل ومحجزش شغل قبل كده
      setFirstTime(logged && !prior)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [params.slug, router])

  const go = (payWith: WorkPayWith) => {
    if (!sbota) return
    track('click_ana_gai', { slug: sbota.slug, work: true, payWith })
    if (!loggedIn) {
      router.push(`/login?next=${encodeURIComponent(`/shoghl/${sbota.slug}`)}`)
      return
    }
    router.push(`/shoghl/${sbota.slug}/pay?payWith=${payWith}`)
  }

  if (loading || !sbota || !captain || !settings) {
    return (
      <main className="mx-auto w-full max-w-page px-5 pb-24">
        <InnerHeader back={t('shoghl.back')} href="/shoghl" padded={false} hideToggle />
        <div className="pt-8 font-body text-16" style={{ color: 'var(--muted)' }}>
          {t('shoghl.loading')}
        </div>
      </main>
    )
  }

  const single = settings.singlePrice
  const first = settings.firstTimePrice
  const venue = sbota.venue

  return (
    <main className="mx-auto w-full max-w-page pb-6">
      <div className="px-5">
        <InnerHeader back={t('shoghl.back')} href="/shoghl" padded={false} hideToggle />
      </div>

      {/* ===== المعرض + ستيكر «فاضل X من 6» ===== */}
      <div className="relative">
        <div className="nb-scroll-x gap-[10px] px-5 pt-[6px]">
          {(sbota.gallery.length ? sbota.gallery : [sbota.img]).map((g, gi) => (
            <PhotoPlaceholder
              key={`${g}-${gi}`}
              label={g}
              src={publicMediaUrl(g)}
              className="shrink-0"
              style={{ width: 300, borderRadius: 20, padding: 20 }}
            />
          ))}
        </div>
        <span className="absolute" style={{ top: 20, insetInlineEnd: 34 }}>
          <Sticker color={sbota.full ? 'ink' : 'orange'} rotate={-4} fontSize={18} padding="6px 16px">
            {sbota.full
              ? t('shoghl.card.full')
              : t('shoghl.card.left', { n: sbota.spotsLeft, total: sbota.spotsTotal })}
          </Sticker>
        </span>
        {firstTime && (
          <span className="absolute" style={{ top: 20, insetInlineStart: 34 }}>
            <Sticker color="cobalt" rotate={4} fontSize={15} padding="5px 14px">
              {t('shoghl.cta.first', { price: first })}
            </Sticker>
          </span>
        )}
      </div>

      {/* ===== الاسم والحكاية ===== */}
      <div className="px-5 pt-[22px]">
        <h1 className="m-0 font-display text-40 font-black leading-[1.1]">{sbota.name}</h1>
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
            {venue?.name || sbota.area}{' '}
            <span className="font-body text-13 font-normal" style={{ color: 'var(--muted)' }}>
              {venue?.name ? sbota.area : sbota.addressHint}
            </span>
          </span>
        </div>
        <div className="flex items-center gap-[10px]">
          <LevelIcon />
          <span className="font-semibold">{sbota.level || t('shoghl.levelAny')}</span>
        </div>
      </div>

      {/* ===== المكان ===== */}
      {venue && (
        <div className="px-5 pt-6">
          <VenueSpecs venue={venue} />
        </div>
      )}

      {/* ===== جدول اليوم ===== */}
      <div className="px-5 pt-4">
        <DaySchedule schedule={sbota.schedule} />
      </div>

      {/* ===== مين حاجز — بالمجال ===== */}
      <div className="px-5 pt-4">
        <ProfessionChips
          booked={sbota.whoBooked.booked}
          total={sbota.whoBooked.total}
          professions={professions}
          revealLine={sbota.whoBooked.revealLine}
        />
      </div>

      {/* ===== الكابتن ===== */}
      <div className="px-5 pt-4">
        <CaptainCard captain={captain} />
      </div>

      {/* ===== شامله / مش شامله ===== */}
      {(sbota.includes.length > 0 || sbota.excludes.length > 0) && (
        <div className="grid grid-cols-2 gap-3 px-5 pt-6">
          <div>
            <div className="font-display text-18 font-black" style={{ color: 'var(--accent-text)' }}>
              {t('sbota.text.3')}
            </div>
            <ul className="mb-0 mt-[6px] list-disc ps-[18px] text-15">
              {sbota.includes.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
          <div>
            <div className="font-display text-18 font-black" style={{ color: 'var(--muted)' }}>
              {t('sbota.text.2')}
            </div>
            <ul className="mb-0 mt-[6px] list-disc ps-[18px] text-15">
              {sbota.excludes.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {/* ===== السعر ===== */}
      <div className="px-5 pt-6">
        <div className="font-display text-34 font-black leading-[1.1]">{t('shared.egp', { n: single })}</div>
        <div className="font-body text-14" style={{ color: 'var(--muted)' }}>
          {t('shoghl.price.day')} {sbota.priceBreakdown}
        </div>
        {firstTime && (
          <div className="mt-2 font-body text-15 font-semibold">
            {t('shoghl.cta.firstNote', { price: first, single })}
          </div>
        )}
        <Link
          href="/shoghl/pass"
          className="mt-1 inline-flex min-h-[44px] items-center font-body text-15 font-semibold underline"
          style={{ color: 'var(--accent-text)' }}
        >
          {t('shoghl.price.passLink', { n: settings.pass4Price })}
        </Link>
      </div>

      {/* ===== الضمان ===== */}
      <div className="px-5 pt-4">
        <GuaranteeBox text={guaranteeText} />
      </div>

      <div className="px-5 pt-[14px]">
        <SecondaryButton onClick={() => setRulesOpen(true)}>{t('sbota.label.1')}</SecondaryButton>
      </div>

      {/* ===== الزر اللاصق — 3 اختيارات ===== */}
      <div className="mt-6 px-5">
        <StickyCTA>
          {sbota.full ? (
            <SecondaryButton onClick={() => setWaiting(true)} className="w-full">
              {t('shoghl.cta.wait')}
            </SecondaryButton>
          ) : (
            <div className="flex flex-col gap-2">
              {firstTime ? (
                <>
                  <PrimaryButton size="lg" onClick={() => go('first_time')} className="w-full">
                    {t('shoghl.cta.first', { price: first })}
                  </PrimaryButton>
                  <SecondaryButton onClick={() => go('single')} className="w-full">
                    {t('shoghl.cta.single', { price: single })}
                  </SecondaryButton>
                </>
              ) : (
                <PrimaryButton size="lg" onClick={() => go('single')} className="w-full">
                  {t('shoghl.cta.single', { price: single })}
                </PrimaryButton>
              )}
              {pass && pass.sessionsLeft > 0 && (
                <PassRedeemButton slug={sbota.slug} sessionsLeft={pass.sessionsLeft} />
              )}
            </div>
          )}
          <div className="mt-[6px] text-center font-body text-13" style={{ color: 'var(--muted)' }}>
            {waiting ? t('shoghl.cta.waitNote') : t('shoghl.cta.note')}
          </div>
        </StickyCTA>
      </div>

      <BottomSheet open={rulesOpen} onClose={() => setRulesOpen(false)} title={t('sbota.label.1')}>
        <ol className="m-0 flex list-none flex-col gap-4 p-0">
          {fiveRules.map((r) => (
            <li key={r.n} className="flex gap-3">
              <span className="font-display text-26 font-black leading-none" style={{ color: 'var(--accent-text)' }}>
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
