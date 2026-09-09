'use client'

import { useEffect, useState, type ReactNode } from 'react'
import Link from 'next/link'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { Sticker } from '@/components/Sticker'
import { PhotoPlaceholder } from '@/components/PhotoPlaceholder'
import { publicMediaUrl } from '@/lib/supabase'
import { CalendarIcon, FoodIcon, LaptopIcon, PairIcon } from '@/components/Icons'
import { WorkSbotaCard } from '@/components/work/WorkSbotaCard'
import { PassCard } from '@/components/work/PassCard'
import { VenueSpecs } from '@/components/work/VenueSpecs'
import { LeadForm } from '@/components/work/LeadForm'
import { getWorkSbotat, getWorkSettings, getWorkVenues } from '@/lib/api'
import { workSteps } from '@/data/lists'
import { track } from '@/lib/track'
import type { WorkSbota, WorkSettings, WorkVenue } from '@/types'
import { useT } from '@/components/CopyProvider'

/**
 * /shoghl — الواجهة العامة لطبقة الشغل (WORK_PLAN §2.1).
 * نهاري مقفول (WorkShell في layout)، نفس لغة الرئيسية وصفحة السبوطة:
 * عناوين Rubik 900، بطاقات رملي بزوايا 20، ستيكرات مايلة، وزر برتقالي واحد في كل قسم.
 */

const STEP_ICONS: Record<(typeof workSteps)[number]['icon'], ReactNode> = {
  calendar: <CalendarIcon size={34} stroke="#F4632A" />,
  laptop: <LaptopIcon size={34} stroke="#F4632A" />,
  food: <FoodIcon size={34} stroke="#F4632A" />,
  pair: <PairIcon size={34} stroke="#F4632A" />,
}

function SectionTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="px-5">
      <h2 className="m-0 font-display text-26 font-black leading-[1.15]">{title}</h2>
      {sub && (
        <div className="mt-1 font-body text-16" style={{ color: 'var(--muted)' }}>
          {sub}
        </div>
      )}
    </div>
  )
}

export default function ShoghlPage() {
  const t = useT()
  const [list, setList] = useState<WorkSbota[]>([])
  const [venues, setVenues] = useState<WorkVenue[]>([])
  const [settings, setSettings] = useState<WorkSettings | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    track('view_schedule', { theme: 'day', work: true })
    Promise.all([getWorkSbotat(), getWorkVenues(), getWorkSettings()]).then(([l, v, s]) => {
      if (!alive) return
      setList(l)
      setVenues(v)
      setSettings(s)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [])

  const single = settings?.singlePrice ?? 0

  return (
    <main className="mx-auto w-full max-w-page pb-6">
      <Header hideToggle />

      {/* ===== العنوان ===== */}
      <section className="px-5 pt-4">
        <Sticker color="orange" rotate={-3} size="md">
          {t('shoghl.nav')}
        </Sticker>
        <h1 className="mb-0 mt-3 font-display text-40 font-black leading-[1.1]">{t('shoghl.title')}</h1>
        <p className="mb-0 mt-2 text-17">{t('shoghl.sub')}</p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Link
            href="#schedule"
            className="grid min-h-[48px] place-items-center rounded-14 px-5 font-display text-18 font-black leading-none"
            style={{ background: '#F4632A', color: '#14161A' }}
          >
            {t('shoghl.hero.cta')}
          </Link>
          <Link
            href="/shoghl/pass"
            className="grid min-h-[48px] place-items-center rounded-pill px-[18px] font-display text-15 font-black leading-none"
            style={{ border: '2px solid var(--fg)', color: 'var(--fg)' }}
          >
            {t('shoghl.hero.pass')}
          </Link>
        </div>
      </section>

      {/* ===== 4 خطوات ===== */}
      <section className="pt-9">
        <SectionTitle title={t('shoghl.stepsTitle')} />
        <div className="mt-4 grid grid-cols-1 gap-3 px-5 sm:grid-cols-2">
          {workSteps.map((s) => (
            <div
              key={s.n}
              className="rounded-20 p-[18px]"
              style={{ background: '#EFE3CF', color: '#14161A' }}
            >
              <div className="flex items-center justify-between">
                {STEP_ICONS[s.icon]}
                <Sticker color="orange" size="step" rotate={s.n % 2 ? -3 : 3}>
                  {s.n}
                </Sticker>
              </div>
              <div className="mt-3 font-display text-20 font-black leading-[1.2]">{t(s.titleKey)}</div>
              <div className="mt-1 font-body text-15" style={{ color: '#55575C' }}>
                {t(s.bodyKey)}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== سبوطات الشغل الأسبوع ده ===== */}
      <section id="schedule" className="scroll-mt-4 pt-9">
        <SectionTitle title={t('shoghl.weekTitle')} sub={t('shoghl.weekSub')} />
        {loading ? (
          <div className="px-5 pt-4 font-body text-16" style={{ color: 'var(--muted)' }}>
            {t('shoghl.loading')}
          </div>
        ) : list.length === 0 ? (
          <div className="px-5 pt-4 font-body text-16" style={{ color: 'var(--muted)' }}>
            {t('shoghl.weekEmpty')}
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4 px-5 pt-4 md:grid-cols-2">
            {list.map((s, i) => (
              <WorkSbotaCard
                key={s.sbotaId}
                sbota={s}
                index={i}
                priceLabel={single ? t('shared.egp', { n: single }) : undefined}
              />
            ))}
          </div>
        )}
      </section>

      {/* ===== الكارتين ===== */}
      <section id="pass" className="scroll-mt-4 pt-9">
        <SectionTitle title={t('shoghl.passTitle')} sub={t('shoghl.passSub')} />
        {settings && (
          <div className="mt-4 grid grid-cols-1 gap-3 px-5 sm:grid-cols-2">
            <PassCard
              kind="four"
              price={settings.pass4Price}
              weeks={settings.pass4Weeks}
              singlePrice={settings.singlePrice}
              rotate={-3}
            />
            <PassCard
              kind="eight"
              price={settings.pass8Price}
              weeks={settings.pass8Weeks}
              singlePrice={settings.singlePrice}
              rotate={3}
            />
          </div>
        )}
        <div className="px-5">
          <Link
            href="/shoghl/pass"
            className="mt-2 inline-flex min-h-[44px] items-center font-body text-16 font-semibold underline"
            style={{ color: 'var(--accent-text)' }}
          >
            {t('shoghl.passLink')}
          </Link>
        </div>
      </section>

      {/* ===== يومك الثابت ===== */}
      <section className="px-5 pt-9">
        <div className="rounded-20 p-5" style={{ background: '#2B4CFF', color: '#FBF7EF' }}>
          <h2 className="m-0 font-display text-24 font-black leading-[1.15]">{t('shoghl.fixed.title')}</h2>
          <p className="mb-0 mt-2 font-body text-16">{t('shoghl.fixed.body')}</p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Link
              href="/shoghl/pass"
              className="grid min-h-[48px] place-items-center rounded-14 px-5 font-display text-18 font-black leading-none"
              style={{ background: '#FBF7EF', color: '#14161A' }}
            >
              {t('shoghl.fixed.cta')}
            </Link>
            <span className="font-body text-14" style={{ color: '#EFE3CF' }}>
              {t('shoghl.fixed.soon')}
            </span>
          </div>
        </div>
      </section>

      {/* ===== الأماكن ===== */}
      <section id="amaken" className="scroll-mt-4 pt-9">
        <SectionTitle title={t('shoghl.venuesTitle')} sub={t('shoghl.venuesSub')} />
        {venues.length === 0 ? (
          <div className="px-5 pt-4 font-body text-16" style={{ color: 'var(--muted)' }}>
            {loading ? t('shoghl.loading') : t('shoghl.venuesEmpty')}
          </div>
        ) : (
          <div className="nb-scroll-x gap-3 px-5 pt-4">
            {venues.map((v) => (
              <Link
                key={v.venueId}
                href="/shoghl/amaken"
                className="block shrink-0 overflow-hidden rounded-20"
                style={{ width: 260, background: '#EFE3CF', color: '#14161A' }}
              >
                <PhotoPlaceholder
                  label={v.photos[0] ?? v.name}
                  src={publicMediaUrl(v.photos[0])}
                  variant="sandDeep"
                  className="w-full"
                />
                <div className="p-4">
                  <div className="font-display text-20 font-black leading-[1.15]">{v.name}</div>
                  <div className="font-body text-14" style={{ color: '#55575C' }}>
                    {v.area}
                    {v.kind !== 'other' ? ` · ${t(`shoghl.kind.${v.kind}`)}` : ''}
                  </div>
                  <VenueSpecs venue={v} compact showTitle={false} bare className="mt-3" />
                </div>
              </Link>
            ))}
          </div>
        )}
        <div className="px-5">
          <Link
            href="/shoghl/amaken"
            className="mt-2 inline-flex min-h-[44px] items-center font-body text-16 font-semibold underline"
            style={{ color: 'var(--accent-text)' }}
          >
            {t('shoghl.venuesAll')}
          </Link>
        </div>
      </section>

      {/* ===== شغالين معاك ===== */}
      <section className="px-5 pt-9">
        <div className="rounded-20 p-5" style={{ background: '#EFE3CF', color: '#14161A' }}>
          <div className="flex items-center justify-between gap-3">
            <h2 className="m-0 font-display text-24 font-black leading-[1.15]">{t('shoghl.collab.title')}</h2>
            <PairIcon size={34} stroke="#F4632A" />
          </div>
          <p className="mb-0 mt-2 font-body text-16">{t('shoghl.collab.body')}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Sticker color="cream" bg="#FBF7EF" rotate={-2} size="sm">
              {t('shoghl.collab.rule1')}
            </Sticker>
            <Sticker color="cream" bg="#FBF7EF" rotate={2} size="sm">
              {t('shoghl.collab.rule2')}
            </Sticker>
          </div>
        </div>
      </section>

      {/* ===== الشركات ===== */}
      <LeadForm className="mx-5 mt-9" />

      <Footer />
    </main>
  )
}
