'use client'

import { use, useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { NotFoundView } from '@/components/NotFoundView'
import { useT } from '@/components/CopyProvider'
import { FeatureGate } from '@/components/FlagsProvider'
import { YallaPost } from '@/components/yalla/YallaPost'
import { getYallaPost, getYallaPollSeconds, type YallaPost as Post } from '@/lib/api'
import { track } from '@/lib/track'

/**
 * بوست «يلا» لوحده — ده اللينك اللي بيتوزّع («ابعته لحد»).
 *
 * ⚠ الرابط من `yallaLink()` (`/yalla/<قالب>-<٨ حروف>`) — **مصدر واحد**
 *   للمتصفح والخادم والقاعدة. ولينك نداء خلص بيقول «مش موجود» — **مش**
 *   بيفتح نداء تاني مكانه (نفس قاعدة `resolveSbotaLink`).
 */
export default function YallaPostPage({ params }: { params: Promise<{ link: string }> }) {
  const { link } = use(params)
  return (
    <FeatureGate flag="yalla">
      <One link={link} />
    </FeatureGate>
  )
}


function One({ link }: { link: string }) {
  const t = useT()
  const [post, setPost] = useState<Post | null | 'missing'>(null)
  const alive = useRef(true)

  const load = useCallback(async () => {
    const p = await getYallaPost(link)
    if (alive.current) setPost(p ?? 'missing')
  }, [link])

  useEffect(() => {
    track('view_yalla', { link })
  }, [link])

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

  if (post === 'missing') return <NotFoundView />

  return (
    <main className="mx-auto w-full max-w-[720px]">
      <Header />
      <div className="px-5 pb-10 pt-6">
        {post === null ? (
          <div className="font-body text-16" style={{ color: 'var(--muted)' }}>
            {t('yalla.loading')}
          </div>
        ) : (
          <>
            <YallaPost post={post} onChanged={setPost} />
            <div className="pt-6">
              <Link
                href="/yalla"
                className="font-body text-16 font-semibold underline"
                style={{ color: 'var(--accent-text)' }}
              >
                {t('yalla.home.more')}
              </Link>
            </div>
          </>
        )}
      </div>
      <Footer />
    </main>
  )
}
