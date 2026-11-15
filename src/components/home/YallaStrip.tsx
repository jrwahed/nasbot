'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useT } from '@/components/CopyProvider'
import { useFlag } from '@/components/FlagsProvider'
import { YallaPost } from '@/components/yalla/YallaPost'
import { getYallaFeed, getYallaPollSeconds, type YallaPost as Post } from '@/lib/api'

/**
 * «يلا» في الرئيسية — **أول حاجة في الصفحة** (قرار المالك ٢٠٢٦-١١-١٥:
 * «خلي صفحة يلا الافتراضية»).
 *
 * 🔴 **ليه مش `/` بتحوّل على `/yalla`؟** لأن مفتاح `yalla` ممكن يكون مقفول —
 *    وساعتها اللي يفتح `nasbot.net` كان هيلاقي شاشة «مقفول»، يعني **الموقع
 *    كله ميت**. بالشكل ده: المفتاح مفتوح → النداءات أول حاجة يشوفها الزائر.
 *    المفتاح مقفول أو مفيش ولا نداء → الرئيسية زي ما هي بالحرف، ومفيش ولا
 *    حالة الموقع فيها بيقع.
 *
 * ⚠ **بيقرا `useFlag('yalla')` بنفسه.** الدرس التسعتاشر: قفلنا المفاتيح
 *   وصوّرنا، فالرابط اختفى من القايمة والذيل و**الرئيسية فضلت فيها تلات
 *   مداخل** لأقسام مقفولة. و`scripts/check-nav-flags.mjs` بيفشل البناء لو
 *   أي ملف فيه رابط لـ`/yalla` وهو مش بيقرا نفس المفتاح.
 *
 * ⚠ وبيختفي خالص لو مفيش ولا نداء — مش عنوان فوق فراغ (زي `ComingSoon`).
 *
 * ⚠ وبيتحدّث لوحده زي صفحة `/yalla` بالظبط (`settings.yalla_poll_seconds`،
 *   والتاب شغّال بس) — لأنه بقى **الواجهة**، مش شريط جنبي.
 */
export function YallaStrip({ className = '' }: { className?: string }) {
  const t = useT()
  const flag = useFlag('yalla')
  const [list, setList] = useState<Post[]>([])
  const [pollMs, setPollMs] = useState(20_000)
  const alive = useRef(true)

  const load = useCallback(async () => {
    const l = await getYallaFeed(5)
    if (alive.current) setList(l)
  }, [])

  useEffect(() => {
    if (!flag.on) return
    getYallaPollSeconds().then((s) => setPollMs(s * 1000))
  }, [flag.on])

  useEffect(() => {
    if (!flag.on) return
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
  }, [flag.on, load, pollMs])

  if (!flag.on || list.length === 0) return null

  /** البوست بيتحدّث في مكانه — مش بإعادة تحميل الفيد كله (الصفحة ما تهتزش) */
  const patch = (next: Post) =>
    setList((prev) => prev.map((p) => (p.callId === next.callId ? next : p)))

  return (
    <section className={className}>
      <h2 className="m-0 font-display text-30 font-black leading-[1.15]">
        {t('yalla.home.title')}
      </h2>
      <div className="mt-1 font-body text-16" style={{ color: 'var(--sbt-sub)' }}>
        {t('yalla.sub')}
      </div>

      <div className="flex flex-col gap-5 pt-5">
        {list.map((p) => (
          <YallaPost key={p.callId} post={p} onChanged={patch} />
        ))}
      </div>

      <Link
        href="/yalla"
        className="mt-5 inline-block font-body text-16 font-semibold underline"
        style={{ color: 'var(--accent-text)' }}
      >
        {t('yalla.home.more')}
      </Link>
    </section>
  )
}
