'use client'

import { useEffect, useState } from 'react'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { Marquee } from '@/components/Marquee'
import { FilterChips } from '@/components/FilterChips'
import { SbotaCard } from '@/components/SbotaCard'
import { MiniMap } from '@/components/MiniMap'
import { CairoMap } from '@/components/CairoMap'
import { OneButton } from '@/components/home/OneButton'
import {
  Captains,
  LastFriday,
  RulesStrip,
  ScheduleBox,
} from '@/components/home/Sections'
import { filters, marqueeText } from '@/data/lists'
import { getSbotat } from '@/lib/api'
import { track } from '@/lib/track'
import { useTheme } from '@/lib/use-theme'
import type { Sbota } from '@/types'
import { useT } from '@/components/CopyProvider'

/**
 * الرئيسية — الترتيب والقيم منقولة بالحرف من شاشة 1
 * في design/نسبوط.dc.html.
 *
 * موبايل: عمود واحد.
 * تابلت: البطاقات في عمودين.
 * كمبيوتر: الخريطة يمين 60% ثابتة مع التمرير، والبطاقات شمال في عمودين،
 *          وزر «نديها واحدة؟» ثابت فوق الخريطة.
 */
export default function Home() {
  const t = useT()
  const [theme] = useTheme()
  const [active, setActive] = useState('الكل')
  const [list, setList] = useState<Sbota[]>([])

  useEffect(() => {
    track('view_schedule', { theme })
  }, [theme])

  useEffect(() => {
    let alive = true
    getSbotat({ filter: active, timeOfDay: theme }).then((l) => {
      if (alive) setList(l)
    })
    return () => {
      alive = false
    }
  }, [active, theme])

  return (
    <main className="mx-auto w-full lg:max-w-[1600px]">
      <Header />

      {/* الزر الكبير — على الكمبيوتر بيروح فوق الخريطة */}
      <div className="px-5 pt-2 lg:hidden">
        <OneButton />
      </div>

      <Marquee text={marqueeText} />

      <div className="lg:flex lg:items-start lg:gap-8 lg:px-5">
        {/* ===== العمود الشمال: البطاقات ===== */}
        <div className="min-w-0 lg:w-[40%] lg:order-2">
          <div className="px-5 pt-7 lg:px-0">
            <h2 className="m-0 font-display text-30 font-black leading-[1.15]">{t('home.text.3')}</h2>
            <div className="mt-1" style={{ color: 'var(--sbt-sub)' }}>{t('home.text.2')}</div>
          </div>

          <FilterChips
            items={filters}
            active={active}
            onPick={setActive}
            className="px-5 pb-1 pt-4 lg:px-0"
          />

          {list.length === 0 ? (
            <div
              className="px-5 pt-6 font-body text-16 lg:px-0"
              style={{ color: 'var(--muted)' }}
            >{t('home.text.1')}</div>
          ) : (
            <div className="grid grid-cols-1 gap-4 px-5 pt-4 md:grid-cols-2 lg:grid-cols-1 lg:px-0 xl:grid-cols-2">
              {list.map((s, i) => (
                <SbotaCard key={s.slug} sbota={s} index={i} />
              ))}
            </div>
          )}
        </div>

        {/* ===== العمود اليمين على الكمبيوتر: الخريطة الثابتة ===== */}
        <div className="hidden lg:sticky lg:top-4 lg:order-1 lg:block lg:w-[60%]">
          <div className="pt-7">
            <OneButton />
          </div>
          <CairoMap sbotat={list} className="mt-4" />
        </div>
      </div>

      {/* الخريطة المصغرة — موبايل وتابلت بس */}
      <div className="px-5 pt-8 lg:hidden">
        <MiniMap />
      </div>

      {/* الأقسام دي بتتوسّط على الكمبيوتر بدل ما تتمدد على 1440 كلها */}
      <div className="mx-auto w-full lg:max-w-[1100px]">
        <LastFriday />
        <Captains />
        <RulesStrip />
        <ScheduleBox />
        <Footer />
      </div>
    </main>
  )
}
