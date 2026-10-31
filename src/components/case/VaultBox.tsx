'use client'

import { useState } from 'react'
import { Em } from '@/components/case/Em'
import { useT } from '@/components/CopyProvider'
import type { CaseVaultRiddle } from '@/lib/cases'

/**
 * «الخزنة» — من غير متهم.
 *
 * كل رقم لغز عن المجموعة نفسها، يعني مش هتفتحوها غير لما تعرفوا بعض.
 * دي للسبوطات الهادية وللناس اللي أول مرة يجوا، **وللمجموعات أقل من ٥**
 * (في أربعة المتهم بيبان من أول تلميح).
 *
 * 🔴 الهنت بيتفتح **بالوقت** من القاعدة (`settings.case_hint_after_min`) —
 *    `fn_case_vault` بترجّع `hint_ar` فاضية لحد ما الوقت يعدّي. لو الواجهة
 *    هي اللي بتخبّي، الهنت يبقى في المتصفح من أول دقيقة.
 */
export function VaultBox({
  riddles,
  onTry,
  busy,
  message,
}: {
  riddles: CaseVaultRiddle[]
  onTry: (digits: number[]) => void
  busy: boolean
  message: string | null
}) {
  const t = useT()
  const [vals, setVals] = useState<string[]>(() => riddles.map(() => ''))

  if (!riddles.length) return null
  const solved = riddles[0]?.solved

  return (
    <section className="mt-4 rounded-20 px-5 py-6" style={{ background: '#14161A', color: '#FBF7EF' }}>
      <h2 className="text-[22px] font-bold">{t('case.vault.title')}</h2>
      <p className="mt-1 text-[14px] opacity-80">{t('case.vault.body')}</p>

      {solved ? (
        <p className="mt-4 text-[20px] font-bold">{t('case.vault.open')}</p>
      ) : (
        <>
          <ul className="mt-4 space-y-3">
            {riddles.map((r, i) => (
              <li key={r.slot}>
                <label className="block text-[14px] leading-snug">
                  <Em text={r.riddle} />
                </label>
                <input
                  inputMode="numeric"
                  value={vals[i] ?? ''}
                  onChange={(e) => {
                    const v = e.target.value.replace(/[^0-9]/g, '').slice(0, 2)
                    setVals((old) => old.map((x, j) => (j === i ? v : x)))
                  }}
                  className="mt-1 w-20 rounded-12 px-3 py-2 text-center text-[18px] font-bold"
                  style={{ background: '#FBF7EF', color: '#14161A' }}
                />
                {r.hintOpen && r.hint ? (
                  <div className="mt-1 text-[13px]" style={{ color: '#F4632A' }}>
                    {t('case.vault.hint')}: <Em text={r.hint} />
                  </div>
                ) : null}
              </li>
            ))}
          </ul>

          <button
            type="button"
            disabled={busy || vals.some((v) => v === '')}
            onClick={() => onTry(vals.map((v) => Number(v)))}
            className="mt-4 w-full rounded-full px-5 py-3 text-[16px] font-bold disabled:opacity-50"
            style={{ background: '#F4632A', color: '#FBF7EF' }}
          >
            {t('case.vault.cta')}
          </button>

          {message ? <p className="mt-2 text-[14px] opacity-90">{message}</p> : null}
          {riddles[0] && riddles[0].tries > 0 ? (
            <p className="mt-1 text-[13px] opacity-60">
              {t('case.vault.tries').replace('{{1}}', String(riddles[0].tries))}
            </p>
          ) : null}
        </>
      )}
    </section>
  )
}
