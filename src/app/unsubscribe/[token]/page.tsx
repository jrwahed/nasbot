'use client'

import { useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { unsubscribeNews, resubscribeNews } from '@/lib/api'
import { useT } from '@/components/CopyProvider'
import { SecondaryButton } from '@/components/Buttons'

/**
 * إلغاء الاشتراك في الإيميلات الجماعية (0125) — اللينك اللي في آخر كل
 * إيميل جماعي. بيشتغل من غير دخول: التوكن هو المفتاح (`profiles.unsub_token`).
 *
 * ⚠ بيوقف **الأخبار** بس. إيميلات الحجز (التأكيد · الكشف · التذكير) خدمة
 *   مش تسويق، وبتفضل توصل.
 * ⚠ ما بيعرضش أي بيانات غير الاسم الأول — حد ممكن يكون فاتح إيميل حد تاني.
 */
export default function UnsubscribePage() {
  const t = useT()
  const params = useParams<{ token: string }>()
  const [state, setState] = useState<'loading' | 'done' | 'bad' | 'back'>('loading')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let alive = true
    unsubscribeNews(params.token).then((name) => {
      if (alive) setState(name === null ? 'bad' : 'done')
    })
    return () => {
      alive = false
    }
  }, [params.token])

  async function undo() {
    setBusy(true)
    const ok = await resubscribeNews(params.token)
    setBusy(false)
    if (ok) setState('back')
  }

  return (
    <main className="mx-auto w-full max-w-page px-5 pb-10 pt-12 text-center">
      {state === 'done' && (
        <>
          <h1 className="font-display text-30 font-black">{t('unsub.title')}</h1>
          <p className="mt-3 font-body text-16" style={{ color: 'var(--muted)' }}>
            {t('unsub.body')}
          </p>
          <div className="mt-6">
            <SecondaryButton onClick={undo} disabled={busy}>
              {t('unsub.undo')}
            </SecondaryButton>
          </div>
        </>
      )}
      {state === 'back' && (
        <p className="font-display text-22 font-black">{t('unsub.back')}</p>
      )}
      {state === 'bad' && (
        <p className="font-body text-16" style={{ color: 'var(--muted)' }}>
          {t('unsub.bad')}
        </p>
      )}
      <div className="mt-10">
        <Link href="/" className="font-body text-15 font-semibold underline" style={{ color: 'var(--muted)' }}>
          {t('unsub.home')}
        </Link>
      </div>
    </main>
  )
}
