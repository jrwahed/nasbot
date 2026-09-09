'use client'

import { useEffect } from 'react'
import { useT } from '@/components/CopyProvider'

/**
 * صفحة «حصل غلط» — بديل رسالة Next الإنجليزية «Application error: a
 * client-side exception has occurred» اللي كانت بتظهر للعضو (U2).
 *
 * بتتعرض في حالتين:
 *   · `src/app/error.tsx`        — غلط جوه صفحة، الهيدر والفوتر بيفضلوا
 *   · `src/app/global-error.tsx` — غلط في الليَاوت نفسه، فالصفحة دي بتقوم
 *                                   مكان الموقع كله
 *
 * ⚠ ما بتعتمدش على `CopyProvider` — في حالة global-error الليَاوت نفسه وقع
 * فالمزوّد مش موجود. `useT` بترجع للنص الاحتياطي في `copy-fallback` لوحدها
 * (القيمة الافتراضية للـ context)، فالنص بيفضل عربي صح في الحالتين.
 */
export function ErrorView({
  error,
  reset,
  standalone = false,
}: {
  error: Error & { digest?: string }
  reset: () => void
  standalone?: boolean
}) {
  const t = useT()

  useEffect(() => {
    // سجل للمطوّر بس — بالإنجليزي علشان حارس النصوص (وهو مش نص معروض)
    // eslint-disable-next-line no-console
    console.error('[nasbot] UI error:', error)
  }, [error])

  return (
    <main
      className="mx-auto grid w-full max-w-page place-items-center px-5 py-16"
      style={standalone ? { minHeight: '100vh', background: 'var(--bg)', color: 'var(--fg)' } : undefined}
    >
      <div className="w-full max-w-[440px] text-center">
        <span
          role="img"
          aria-label={t('error.mark')}
          className="mx-auto grid place-items-center font-display font-black leading-none"
          style={{
            width: 96,
            height: 96,
            borderRadius: 24,
            background: '#F4632A',
            color: '#14161A',
            fontSize: 62,
            transform: 'skewX(-6deg) rotate(-18deg)',
          }}
        >{t('shared.text.24')}</span>

        <h1 className="mt-8 font-display text-30 font-black leading-[1.15]">{t('error.title')}</h1>

        <p className="mt-3 font-body text-16 leading-[1.7]" style={{ color: 'var(--muted)' }}>
          {t('error.body')}
        </p>

        <div className="mt-8 flex flex-col gap-3">
          <button
            type="button"
            onClick={reset}
            className="min-h-[52px] cursor-pointer rounded-16 px-5 font-body text-16 font-black"
            style={{ background: '#F4632A', color: '#14161A', border: '2px solid #14161A' }}
          >{t('error.retry')}</button>

          {/* `<a>` مقصودة مش `<Link>`: المكوّن ده بيتعرض كمان في
              global-error بعد ما شجرة التطبيق تقع، والتنقّل بالراوتر ساعتها
              ممكن يكون هو نفسه مكسور. تحميل كامل للصفحة أضمن للخروج من الغلط. */}
          {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
          <a
            href="/"
            className="grid min-h-[52px] place-items-center rounded-16 px-5 font-body text-16 font-semibold"
            style={{ background: 'transparent', color: 'var(--fg)', border: '2px solid var(--line)' }}
          >{t('shared.text.25')}</a>
        </div>

        {error.digest && (
          <div className="mt-6 font-body text-13" dir="ltr" style={{ color: 'var(--muted)' }}>
            {error.digest}
          </div>
        )}
      </div>
    </main>
  )
}
