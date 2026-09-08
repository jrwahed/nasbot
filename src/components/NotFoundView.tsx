'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { SbotaCard } from '@/components/SbotaCard'
import { getRandomSbota } from '@/lib/api'
import { timeOfDayNow } from '@/lib/theme'
import type { Sbota } from '@/types'
import { useT } from '@/components/CopyProvider'

/**
 * صفحة غير موجودة — «السبوطة دي مش موجودة… بس دي موجودة»
 * وبطاقة سبوطة عشوائية، وعلامة الاستفهام بتبص لفوق.
 */
export function NotFoundView() {
  const t = useT()
  const [sbota, setSbota] = useState<Sbota | null>(null)

  useEffect(() => {
    getRandomSbota(timeOfDayNow()).then(setSbota)
  }, [])

  return (
    <main className="mx-auto w-full max-w-page px-5 pb-16">
      <div className="flex items-center justify-between gap-4 pb-2 pt-[14px]">
        <Link
          href="/"
          className="grid min-h-[44px] place-items-center font-body text-16 font-semibold"
          style={{ color: 'var(--fg)' }}
        >{t('shared.text.25')}</Link>
        <Logo size={22} />
      </div>

      {/* علامة استفهام بتبص لفوق */}
      <div className="grid place-items-center pt-10">
        <span
          role="img"
          aria-label={t('shared.label.38')}
          className="grid place-items-center font-display font-black leading-none"
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
      </div>

      <h1 className="mt-8 text-center font-display text-30 font-black leading-[1.15]">{t('shared.text.23')}</h1>

      {sbota && (
        <div className="mt-8">
          <SbotaCard sbota={sbota} />
        </div>
      )}
    </main>
  )
}
