'use client'

import { useT } from '@/components/CopyProvider'
import type { CaseClue } from '@/lib/cases'

/**
 * التلميحات المفتوحة.
 *
 * 🔴 الصندوق ده بيعرض **اللي القاعدة بعتته وبس**. `fn_case_clues` بترجّع
 *    التلميحات لحد الفصل الحالي — فمفيش «نخبّي التلميح التالت في الواجهة».
 *    الدرس اتناشر: الحارس في القاعدة مش بيغني عن حارس في الواجهة، **بس
 *    العكس أسوأ**: واجهة بتخبّي وقاعدة بتبعت = اللعبة مكشوفة لأي حد
 *    بيفتح أدوات المطور.
 */
export function ClueBox({ clues }: { clues: CaseClue[] }) {
  const t = useT()
  if (!clues.length) return null

  return (
    <section className="mt-5">
      <h2 className="text-[15px] font-bold">{t('case.clue.title')}</h2>
      <ul className="mt-2 space-y-2">
        {clues.map((c) => (
          <li
            key={`${c.act}-${c.slot}`}
            className="rounded-16 p-4"
            style={{ background: '#EFE3CF', color: '#14161A' }}
          >
            <div className="text-[12px] opacity-60">
              {t('case.clue.n').replace('{{1}}', String(c.act))}
            </div>
            <p className="mt-1 text-[17px] font-bold leading-snug">{c.text}</p>
            <div className="mt-1 text-[13px] opacity-70">
              {t('case.clue.applies').replace('{{1}}', String(c.appliesTo))}
            </div>
          </li>
        ))}
      </ul>
      <p className="mt-2 text-[13px] opacity-70">{t('case.clue.ask')}</p>
    </section>
  )
}
