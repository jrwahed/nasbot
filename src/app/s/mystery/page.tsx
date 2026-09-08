'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { Logo } from '@/components/Logo'
import { ClueGrid } from '@/components/ClueGrid'
import { GuaranteeBox } from '@/components/WhoBooked'
import { getClues, getCompletedCount } from '@/lib/api'
import { guaranteeText } from '@/data/lists'
import { track } from '@/lib/track'
import { isLoggedIn } from '@/lib/session'
import type { Clue } from '@/types'
import { useT } from '@/components/CopyProvider'

/**
 * السبوطة الغامضة — خلفية كوبالت وعلامة استفهام ضخمة بدل الصور.
 * الزر معطّل لو المستخدم راح أقل من سبوطتين.
 */
export default function MysteryPage() {
  const t = useT()
  const router = useRouter()
  const [clues, setClues] = useState<Clue[]>([])
  const [count, setCount] = useState<number | null>(null)

  useEffect(() => {
    getClues().then(setClues)
    getCompletedCount().then(setCount)
  }, [])

  const locked = count !== null && count < 2

  return (
    <main
      className="min-h-screen w-full"
      style={{ background: '#2B4CFF', color: '#FBF7EF' }}
    >
      <div className="mx-auto w-full max-w-page px-5 pb-8">
        <div className="flex items-center justify-between gap-4 pb-2 pt-[14px]">
          <button
            type="button"
            onClick={() => router.push('/')}
            className="min-h-[44px] cursor-pointer border-0 bg-transparent p-0 font-body text-16 font-semibold"
            style={{ color: '#FBF7EF' }}
          >{t('mystery.text.11')}</button>
          <Logo size={22} variant="onOrange" />
        </div>

        {/* علامة الاستفهام الضخمة بدل الصور */}
        <div className="grid place-items-center py-8">
          <span
            role="img"
            aria-label={t('mystery.label.1')}
            className="font-display font-black leading-none"
            style={{ fontSize: 180, color: '#FBF7EF', transform: 'skewX(-6deg)' }}
          >{t('mystery.text.10')}</span>
        </div>

        <h1 className="m-0 font-display text-40 font-black leading-[1.1]">{t('mystery.text.9')}</h1>
        <p className="mb-0 mt-2 text-17">{t('mystery.text.8')}</p>

        <div className="mt-5 font-display text-20 font-black">{t('mystery.text.7')}</div>

        {/* ===== الأدلة ===== */}
        <h2 className="mt-8 font-display text-26 font-black">{t('mystery.text.6')}</h2>
        <div className="mt-1 font-body text-15" style={{ opacity: 0.85 }}>{t('mystery.text.5')}</div>
        <div className="mt-4">
          <ClueGrid clues={clues} />
        </div>

        <div className="mt-8">
          <GuaranteeBox text={guaranteeText} />
        </div>

        <div className="mt-6">
          <div
            className="nb-safe-bottom sticky bottom-0 z-30 -mx-5 px-5 pt-3 lg:static lg:mx-0 lg:px-0 lg:pb-0"
            style={{ background: '#2B4CFF', borderTop: '2px solid rgba(251,247,239,.25)' }}
          >
            {locked ? (
              <>
                <button
                  type="button"
                  disabled
                  className="w-full cursor-not-allowed rounded-16 border-0 font-display text-22 font-black opacity-50"
                  style={{ background: '#F4632A', color: '#14161A', minHeight: 58 }}
                >{t('mystery.text.4')}</button>
                <div className="mt-[6px] text-center font-body text-15 font-semibold">{t('mystery.text.3')}</div>
              </>
            ) : (
              <>
                <button
                  type="button"
                  onClick={() => {
                    track('click_ana_gai', { slug: 'mystery' })
                    router.push(
                      isLoggedIn() ? '/s/mystery/pay' : '/login?next=/s/mystery/pay'
                    )
                  }}
                  className="w-full cursor-pointer rounded-16 border-0 font-display text-22 font-black"
                  style={{ background: '#F4632A', color: '#14161A', minHeight: 58 }}
                >{t('mystery.text.2')}</button>
                <div className="mt-[6px] text-center font-body text-13" style={{ opacity: 0.85 }}>{t('mystery.text.1')}</div>
              </>
            )}
          </div>
        </div>
      </div>
    </main>
  )
}
