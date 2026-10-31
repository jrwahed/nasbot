'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useT } from '@/components/CopyProvider'
import { useFlag } from '@/components/FlagsProvider'
import { getCaseAnswered, getCaseQuestions, getCaseState } from '@/lib/cases'

/**
 * مدخل القضية في صفحة الحجز.
 *
 * ⚠ **الدرس التامن:** `/game` فضلت شهور مبنية ومترجمة وليها مفتاح ميزة
 *   ومفيش ولا لينك ليها — الميزة اللي محدش يقدر يوصلها = ميزة مش موجودة.
 *   فالمكوّن ده هو مدخل «جاوب قبل بكرة» **و** شاشة اللعب.
 *
 * ⚠ **الدرس تسعتاشر:** المدخل ورا نفس مفتاح الصفحة (`cases`)، وإلا القفل
 *   بيخفي الصفحة ويسيب الزرار في نص صفحة الحجز.
 *   الحارس `scripts/check-nav-flags.mjs` بيفشل البناء لو اتخالف.
 *
 * ⚠ وبيختفي خالص لو مفيش قضية في الخروجة دي — مفيش كرت فاضي.
 */
export function CaseStrip({ bookingId, sbotaId }: { bookingId: string; sbotaId: string }) {
  const t = useT()
  const flag = useFlag('cases')
  const [has, setHas] = useState(false)
  const [started, setStarted] = useState(false)
  const [mine, setMine] = useState(0)
  const [total, setTotal] = useState(0)

  useEffect(() => {
    if (!flag.on) return
    let alive = true
    ;(async () => {
      const st = await getCaseState(sbotaId)
      if (!alive || !st) return
      setHas(true)
      setStarted(st.started)
      const [qs, c] = await Promise.all([getCaseQuestions(sbotaId), getCaseAnswered(sbotaId)])
      if (!alive) return
      setTotal(qs.length)
      setMine(c?.mine ?? 0)
    })()
    return () => {
      alive = false
    }
  }, [sbotaId, flag.on])

  if (!flag.on || !has) return null

  const done = total > 0 && mine >= total

  return (
    <section className="mt-[22px] rounded-20 p-5" style={{ background: '#14161A', color: '#FBF7EF' }}>
      <div className="text-[13px]" style={{ color: '#F4632A' }}>
        {t('case.pre.kicker')}
      </div>
      <h2 className="mt-1 text-[20px] font-bold">{t('case.pre.title')}</h2>
      <p className="mt-1 text-[14px] opacity-80">{t('case.pre.body')}</p>

      <div className="mt-4 flex flex-wrap gap-2">
        {!started ? (
          <Link
            href={`/my/${bookingId}/answers`}
            className="rounded-full px-5 py-2 text-[15px] font-bold"
            style={{ background: done ? 'rgba(251,247,239,.18)' : '#F4632A', color: '#FBF7EF' }}
          >
            {done ? t('case.pre.done') : t('case.pre.cta')}
          </Link>
        ) : null}
        <Link
          href={`/play/${sbotaId}`}
          className="rounded-full px-5 py-2 text-[15px] font-bold"
          style={{ background: started ? '#F4632A' : 'rgba(251,247,239,.18)', color: '#FBF7EF' }}
        >
          {t('case.join.title')}
        </Link>
      </div>
    </section>
  )
}
