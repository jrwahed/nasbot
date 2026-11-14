'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { useT } from '@/components/CopyProvider'
import { FeatureGate } from '@/components/FlagsProvider'
import { YallaPost } from '@/components/yalla/YallaPost'
import { getYallaFeed, getYallaPollSeconds, type YallaPost as Post } from '@/lib/api'
import { isLoggedIn } from '@/lib/session'
import { track } from '@/lib/track'

/**
 * «يلا» — فيد النداءات.
 *
 * قرار المالك (٢٠٢٦-١١-١٥): «نداء بشكل بوست، والناس هي اللي بتقرر الميعاد
 * والمنطقة.» والشكل من السوشيال ميديا: فيد بيتسكرول لتحت، موبايل الأول،
 * الأحدث فوق.
 *
 * ⚠ **الفيد بيتحدّث لوحده** كل `settings.yalla_poll_seconds` — بس والتاب
 *   شغّال. من غير شرط الظهور الصفحة المفتوحة في تاب منسي بتسأل القاعدة
 *   للأبد.
 *
 * ⚠ **والفيد وهو فاضي بيقول كده صريح** ومعاه زرار تليجرام — مفيش بوستات
 *   تجريبية ولا وهمية (قرار المالك ٢٠٢٦-٠٩-٢٧).
 *
 * ⚠ الصفحة ورا مفتاح `yalla`، ومدخلها في القايمة ورا نفس المفتاح —
 *   `scripts/check-nav-flags.mjs` بيفشل البناء لو اتخالف.
 */
export default function YallaFeedPage() {
  return (
    <FeatureGate flag="yalla">
      <Feed />
    </FeatureGate>
  )
}


function Feed() {
  const t = useT()
  const [list, setList] = useState<Post[] | null>(null)
  const alive = useRef(true)

  const load = useCallback(async () => {
    const l = await getYallaFeed(20)
    if (alive.current) setList(l)
  }, [])

  useEffect(() => {
    track('view_yalla', {})
  }, [])

  // ⚠ الرقم من `settings.yalla_poll_seconds` مش من الكود (§٣.٢)
  const [pollMs, setPollMs] = useState(20_000)
  useEffect(() => {
    getYallaPollSeconds().then((s) => setPollMs(s * 1000))
  }, [])

  useEffect(() => {
    alive.current = true
    load()
    const tick = () => {
      if (document.visibilityState === 'visible') load()
    }
    const id = window.setInterval(tick, pollMs)
    document.addEventListener('visibilitychange', tick)
    return () => {
      alive.current = false
      window.clearInterval(id)
      document.removeEventListener('visibilitychange', tick)
    }
  }, [load, pollMs])

  /**
   * بوست واحد بيتحدّث في مكانه.
   *
   * ⚠ **مش `load()`**: لو حدّثنا الفيد كله بعد كل اختيار، البوست بيقفز
   *   ويرجع يترسم والشاشة بتهتز تحت إيد اللي لسه بيدوس.
   */
  const patch = (next: Post) =>
    setList((prev) => (prev ?? []).map((p) => (p.callId === next.callId ? next : p)))

  return (
    <main className="mx-auto w-full max-w-[720px]">
      <Header />

      <div className="px-5 pt-6">
        <h1 className="m-0 font-display text-30 font-black leading-[1.15]">{t('yalla.title')}</h1>
        <div className="mt-1 font-body text-16" style={{ color: 'var(--sbt-sub)' }}>
          {t('yalla.sub')}
        </div>
      </div>

      {list === null ? (
        <div className="px-5 pt-8 font-body text-16" style={{ color: 'var(--muted)' }}>
          {t('yalla.loading')}
        </div>
      ) : list.length === 0 ? (
        <YallaEmpty />
      ) : (
        <div className="flex flex-col gap-5 px-5 pb-10 pt-6">
          {list.map((p) => (
            <YallaPost key={p.callId} post={p} onChanged={patch} />
          ))}
        </div>
      )}

      <Footer />
    </main>
  )
}

/**
 * الفيد وهو فاضي.
 *
 * ⚠ رسالة صريحة + طريق واحد: وصّل تليجرام وأول نداء يوصلك. الزرار بيودّي
 *   على `/join/telegram` للي مسجّل و`/join` للي لأ — نفس خطوة التسجيل
 *   الموجودة (`0129`)، مش شاشة جديدة.
 */
function YallaEmpty() {
  const t = useT()
  const [href, setHref] = useState('/join')
  useEffect(() => {
    setHref(isLoggedIn() ? '/join/telegram?next=/yalla' : '/join?next=/yalla')
  }, [])

  return (
    <div className="px-5 pb-10 pt-8">
      <div
        className="rounded-20 p-6"
        style={{ background: 'var(--surface)', color: 'var(--fg)' }}
      >
        <h2 className="m-0 font-display text-24 font-black">{t('yalla.empty.title')}</h2>
        <p className="mt-2 font-body text-16 leading-[1.7]" style={{ color: 'var(--muted)' }}>
          {t('yalla.empty.body')}
        </p>
        <Link
          href={href}
          className="mt-5 inline-grid min-h-[52px] place-items-center rounded-14 px-5 font-display text-18 font-black"
          style={{ background: '#F4632A', color: '#14161A' }}
        >
          {t('yalla.empty.cta')}
        </Link>
      </div>
    </div>
  )
}
