'use client'

import { useCallback, useEffect, useState } from 'react'
import { useT } from '@/components/CopyProvider'
import {
  getTelegramLink,
  setTelegramNews,
  telegramStartUrl,
  type TelegramLink,
} from '@/lib/api'

/**
 * «أول ما خروجة تنزل، تعرف» — ربط الحساب ببوت الأعضاء على تليجرام (0128).
 *
 * بيختفي لو البوت مش متظبط (مفيش `TELEGRAM_MEMBER_BOT_TOKEN`) أو لو زائر.
 * اللينك بيتجهّز **قبل** ما يدوس — لو اتعمل بعد الضغطة، المتصفح على
 * الموبايل بيعتبر الفتح popup وبيمنعه.
 */
export function TelegramCard() {
  const t = useT()
  const [state, setState] = useState<TelegramLink | null>(null)
  const [url, setUrl] = useState<string | null>(null)
  const [waiting, setWaiting] = useState(false)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(false)

  const load = useCallback(async () => {
    const s = await getTelegramLink()
    setState(s)
    if (s?.bot && !s.linked) {
      const u = await telegramStartUrl(s.bot)
      setUrl(u)
      setErr(!u)
    }
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  // رجع من تليجرام — نشوف اتربط ولا لسه
  useEffect(() => {
    if (!waiting) return
    const again = () => {
      if (document.visibilityState === 'visible') void load()
    }
    document.addEventListener('visibilitychange', again)
    window.addEventListener('focus', again)
    return () => {
      document.removeEventListener('visibilitychange', again)
      window.removeEventListener('focus', again)
    }
  }, [waiting, load])

  if (!state?.bot) return null

  const toggle = async (on: boolean) => {
    setBusy(true)
    const ok = await setTelegramNews(on)
    setBusy(false)
    if (ok) setState({ ...state, news: on })
  }

  return (
    <div
      className="mt-5 flex flex-col gap-3 rounded-20 p-5"
      style={{ background: '#2B4CFF', color: '#FBF7EF' }}
    >
      <span className="font-display text-20 font-black">{t('tg.card.title')}</span>

      {state.linked ? (
        <>
          <span className="font-body text-15">
            {state.news ? t('tg.card.on') : t('tg.card.paused')}
          </span>
          <div>
            <button
              type="button"
              disabled={busy}
              onClick={() => void toggle(!state.news)}
              className="cursor-pointer rounded-14 px-4 py-2 font-display text-14 font-black"
              style={{ background: 'transparent', color: '#FBF7EF', border: '2px solid #FBF7EF' }}
            >
              {state.news ? t('tg.card.stop') : t('tg.card.resume')}
            </button>
          </div>
        </>
      ) : (
        <>
          <span className="font-body text-15">{t('tg.card.body')}</span>
          <div className="flex flex-wrap items-center gap-3">
            {url ? (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setWaiting(true)}
                className="rounded-14 px-4 py-3 font-display text-16 font-black"
                style={{ background: '#FBF7EF', color: '#14161A', border: '2px solid #14161A' }}
              >
                {t('tg.card.cta')}
              </a>
            ) : err ? (
              <span className="font-body text-14">{t('tg.card.err')}</span>
            ) : null}
          </div>
          {waiting && <span className="font-body text-14">{t('tg.card.after')}</span>}
        </>
      )}
    </div>
  )
}
