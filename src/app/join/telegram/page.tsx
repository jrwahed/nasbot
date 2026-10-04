'use client'

import { Suspense, useCallback, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { InnerHeader } from '@/components/Header'
import { Sticker } from '@/components/Sticker'
import { TextButton } from '@/components/Buttons'
import { useT } from '@/components/CopyProvider'
import { getTelegramLink, telegramStartUrl } from '@/lib/api'

/**
 * الخطوة التانية بعد التسجيل على طول (0129): «خليك أول واحد يعرف».
 *
 * `/join` بيودّي هنا بعد ما الحساب يتعمل (مش في وضع التعديل)، ومعاه `next`.
 * - البوت مش متظبط (مفيش `TELEGRAM_MEMBER_BOT_TOKEN`) أو العضو متوصّل أصلًا
 *   ← بنعدّي لـ`next` على طول، فالتسجيل ما يتعطّلش أبدًا بسبب تليجرام.
 * - «مش دلوقتي» ← `next`. والكرت لسه موجود في `/me` لو حب يوصّل بعدين.
 * - أول ما يرجع من تليجرام بنعيد السؤال، ولما يتوصّل يبان «اتوصّلت ✓».
 *   ولما يتربط بتوصل للمالك رسالة على بوت اللوحة (محفّز في القاعدة).
 */

/** `next` جوه الموقع بس — من غير كده ده باب تحويل لأي دومين */
function safeNext(raw: string | null): string {
  return raw && raw.startsWith('/') && !raw.startsWith('//') ? raw : '/me'
}

function TelegramStep() {
  const t = useT()
  const router = useRouter()
  const next = safeNext(useSearchParams().get('next'))
  const [url, setUrl] = useState<string | null>(null)
  const [linked, setLinked] = useState(false)
  const [opened, setOpened] = useState(false)
  const [ready, setReady] = useState(false)

  const check = useCallback(async () => {
    const s = await getTelegramLink()
    if (!s?.bot) {
      router.replace(next)
      return
    }
    if (s.linked) {
      // كان متوصّل قبل ما يفتح الصفحة = مالوش لازمة يشوفها
      if (!opened) {
        router.replace(next)
        return
      }
      setLinked(true)
    } else if (!url) {
      const u = await telegramStartUrl(s.bot)
      if (!u) {
        router.replace(next)
        return
      }
      setUrl(u)
    }
    setReady(true)
  }, [next, opened, router, url])

  useEffect(() => {
    void check()
    // مرة واحدة أول ما الصفحة تفتح — الباقي من الرجوع لتليجرام تحت
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (!opened || linked) return
    const again = () => {
      if (document.visibilityState === 'visible') void check()
    }
    document.addEventListener('visibilitychange', again)
    window.addEventListener('focus', again)
    const timer = window.setInterval(again, 4000)
    return () => {
      document.removeEventListener('visibilitychange', again)
      window.removeEventListener('focus', again)
      window.clearInterval(timer)
    }
  }, [opened, linked, check])

  if (!ready) {
    return <main className="mx-auto w-full max-w-page px-5" />
  }

  return (
    <main className="mx-auto w-full max-w-page px-5 pb-10">
      <InnerHeader back={t('me.label.7')} padded={false} />

      <div className="mt-6">
        <Sticker bg="#2B4CFF" fg="#FBF7EF" rotate={-3} size="sm">
          {t('tg.step.kicker')}
        </Sticker>
      </div>

      <h1 className="mt-4 font-display text-32 font-black leading-tight">{t('tg.step.title')}</h1>
      <p className="mt-3 font-body text-16" style={{ color: 'var(--muted)' }}>
        {t('tg.step.body')}
      </p>

      <div
        className="mt-6 flex flex-col gap-4 rounded-20 p-5"
        style={{ background: '#2B4CFF', color: '#FBF7EF' }}
      >
        {linked ? (
          <>
            <span className="font-display text-20 font-black">{t('tg.step.done')}</span>
            <button
              type="button"
              onClick={() => router.replace(next)}
              className="min-h-[52px] cursor-pointer rounded-14 font-display text-18 font-black"
              style={{ background: '#F4632A', color: '#14161A', border: 0 }}
            >
              {t('tg.step.next')}
            </button>
          </>
        ) : (
          <>
            <a
              href={url ?? '#'}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() => setOpened(true)}
              className="flex min-h-[56px] items-center justify-center rounded-14 font-display text-18 font-black"
              style={{ background: '#FBF7EF', color: '#14161A', border: '2px solid #14161A' }}
            >
              {t('tg.card.cta')}
            </a>
            <span className="font-body text-14">{t('tg.step.how')}</span>
          </>
        )}
      </div>

      {!linked && (
        <div className="mt-6 flex flex-col items-center gap-1 text-center">
          <TextButton onClick={() => router.replace(next)}>{t('tg.step.skip')}</TextButton>
          <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
            {t('tg.step.later')}
          </span>
        </div>
      )}
    </main>
  )
}

export default function JoinTelegramPage() {
  return (
    <Suspense fallback={null}>
      <TelegramStep />
    </Suspense>
  )
}
