'use client'

import { useEffect, useRef, useState } from 'react'
import { Em } from '@/components/case/Em'
import { useT } from '@/components/CopyProvider'
import type { CaseMyRole } from '@/lib/cases'

/**
 * الكارت المقلوب — دورك إنت.
 *
 * 🔴 **الموبايل كارت مقلوب** (قاعدة اللعبة): بتبص فيه ثواني تشوف دورك،
 *    وبيرجع يتقفل **لوحده**. ممنوع توري شاشتك لحد.
 *
 * ⚠ العدّاد من `settings.case_card_seconds` مش رقم في الكود (§٣.٢).
 *
 * ⚠ والكارت ده بياخد `role` جاهز من `fn_case_my_role` — **مش** بيفلتر
 *   قايمة أدوار. مفيش أدوار غيرك في المتصفح أصلًا.
 */
export function CaseCard({
  role,
  seconds,
  suspectName,
  detectiveName,
  onMissionDone,
}: {
  role: CaseMyRole
  seconds: number
  suspectName: string
  detectiveName: string
  onMissionDone?: (done: boolean) => void
}) {
  const t = useT()
  const [open, setOpen] = useState(false)
  const [left, setLeft] = useState(seconds)
  const timer = useRef<ReturnType<typeof setInterval> | null>(null)

  useEffect(() => {
    if (!open) return
    setLeft(seconds)
    timer.current = setInterval(() => {
      setLeft((v) => {
        if (v <= 1) {
          setOpen(false)
          return seconds
        }
        return v - 1
      })
    }, 1000)
    return () => {
      if (timer.current) clearInterval(timer.current)
    }
  }, [open, seconds])

  const isSuspect = role.role === 'suspect'
  const label = isSuspect ? suspectName : detectiveName

  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mt-4 w-full rounded-20 px-5 py-8 text-center"
        style={{ background: '#14161A', color: '#FBF7EF' }}
      >
        <div className="text-[15px] opacity-70">{t('case.card.tap')}</div>
        <div className="mt-2 text-[22px] font-bold">🂠</div>
        <div className="mt-3 text-[13px] opacity-60">{t('case.card.hint')}</div>
      </button>
    )
  }

  return (
    <section
      className="mt-4 rounded-20 px-5 py-6"
      style={{
        background: isSuspect ? '#F4632A' : '#14161A',
        color: '#FBF7EF',
      }}
    >
      <div className="text-[13px] uppercase tracking-wide opacity-70">{label}</div>
      {role.codename ? (
        <div className="mt-1 text-[15px] opacity-90">
          {t('case.card.codename').replace('{{1}}', role.codename)}
        </div>
      ) : null}

      <p className="mt-3 text-[19px] font-bold leading-snug">
        <Em text={role.card} />
      </p>

      {role.partnerCodename ? (
        <p className="mt-3 text-[15px] opacity-90">
          {t('case.card.partner').replace('{{1}}', role.partnerCodename)}
        </p>
      ) : null}

      {role.mission ? (
        <div className="mt-4 rounded-16 p-4" style={{ background: 'rgba(0,0,0,.25)' }}>
          <div className="text-[13px] opacity-70">{t('case.card.mission')}</div>
          <p className="mt-1 text-[16px] font-bold">
            <Em text={role.mission} />
          </p>
          {onMissionDone ? (
            <button
              type="button"
              onClick={() => onMissionDone(!role.missionDone)}
              className="mt-3 rounded-full px-4 py-2 text-[14px]"
              style={{
                background: role.missionDone ? '#2B4CFF' : 'transparent',
                color: '#FBF7EF',
                border: '1px solid rgba(251,247,239,.4)',
              }}
            >
              {role.missionDone ? `${t('case.card.done')} ✓` : t('case.card.done')}
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 text-[13px] opacity-60">
        {t('case.card.closing').replace('{{1}}', String(left))}
      </div>
    </section>
  )
}
