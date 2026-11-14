'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useT } from '@/components/CopyProvider'
import { useFlag } from '@/components/FlagsProvider'
import { YallaPost } from '@/components/yalla/YallaPost'
import { getYallaFeed, type YallaPost as Post } from '@/lib/api'

/**
 * قسم «يلا» في الرئيسية — فوق السبوطات.
 *
 * ⚠ **بيقرا `useFlag('yalla')` بنفسه.** الدرس التسعتاشر: قفلنا المفاتيح
 *   وصوّرنا، فالرابط اختفى من القايمة والذيل و**الرئيسية فضلت فيها تلات
 *   مداخل** لأقسام مقفولة. و`scripts/check-nav-flags.mjs` بيفشل البناء لو
 *   أي ملف فيه رابط لـ`/yalla` وهو مش بيقرا نفس المفتاح.
 *
 * ⚠ وبيختفي خالص لو مفيش ولا نداء — مش عنوان فوق فراغ (زي `ComingSoon`).
 *
 * ⚠ **بوست واحد بس هنا** (الأحدث) + رابط للفيد. الرئيسية فيها السبوطات
 *   والخريطة وأقسام تانية، ونداءين أو تلاتة فوق بعض كانوا هيزقّوا كل حاجة
 *   تحت الشاشة.
 */
export function YallaStrip({ className = '' }: { className?: string }) {
  const t = useT()
  const flag = useFlag('yalla')
  const [list, setList] = useState<Post[]>([])

  useEffect(() => {
    if (!flag.on) return
    let alive = true
    getYallaFeed(3).then((l) => {
      if (alive) setList(l)
    })
    return () => {
      alive = false
    }
  }, [flag.on])

  if (!flag.on || list.length === 0) return null
  const first = list[0]

  return (
    <section className={className}>
      <h2 className="m-0 font-display text-26 font-black leading-[1.15]">
        {t('yalla.home.title')}
      </h2>
      <div className="mt-1 font-body text-16" style={{ color: 'var(--sbt-sub)' }}>
        {t('yalla.sub')}
      </div>
      <div className="pt-4">
        <YallaPost
          post={first}
          onChanged={(next) =>
            setList((prev) => prev.map((p) => (p.callId === next.callId ? next : p)))
          }
        />
      </div>
      {list.length > 1 && (
        <Link
          href="/yalla"
          className="mt-4 inline-block font-body text-16 font-semibold underline"
          style={{ color: 'var(--accent-text)' }}
        >
          {t('yalla.home.more')}
        </Link>
      )}
    </section>
  )
}
