'use client'

import { useT } from '@/components/CopyProvider'
import type { CaseAward, CaseLie, CaseResult } from '@/lib/cases'

/**
 * شاشة الختام — **مقاس ستوري**.
 *
 * دي اللقطة اللي الناس هتصوّرها وتنزّلها، فترتيبها مقصود:
 *   ١ الكشف (مين كان المتهم وهل اتقفش)
 *   ٢ المهمة السرية (كانت إيه وهل عملها)
 *   ٣ الكدبات — كل إجابة كدب فيها مقابل الصح. أكتر حتة بتضحّك.
 *   ٤ الألقاب — لقب لكل واحد، عشان محدش يروح وهو حاسس إنه خسر
 *   ٥ «أشوفهم تاني؟» — الاختيار السري الموجود أصلًا في الموقع
 *
 * ⚠ **الاسم الأول وبس** (قرار المالك ٢٠٢٦-٠٩-٢١) — مفيش صورة بروفايل
 *   ولا منطقة ولا نوع شخصية. والقاعدة نفسها مش بترجّع غير `first_name`.
 */
export function EndingCard({
  result,
  lies,
  awards,
  children,
}: {
  result: CaseResult
  lies: CaseLie[]
  awards: CaseAward[]
  children?: React.ReactNode
}) {
  const t = useT()
  const caught = result.outcome === 'caught'

  return (
    <section
      className="mt-4 rounded-20 px-5 py-6"
      style={{
        background: caught ? '#14161A' : '#F4632A',
        color: '#FBF7EF',
        aspectRatio: '9 / 16',
        minHeight: 520,
      }}
    >
      <div className="text-[13px] opacity-70">{result.caseTitle}</div>
      <h1 className="mt-1 text-[34px] font-bold leading-none">
        {caught ? t('case.end.caught') : t('case.end.escaped')}
      </h1>

      <p className="mt-3 text-[18px] font-bold">
        {result.suspectIsMe
          ? t('case.end.wasme')
          : t('case.end.who').replace(
              '{{1}}',
              result.suspectCodename
                ? `${result.suspectCodename} · ${result.suspectName}`
                : result.suspectName,
            )}
      </p>

      <p className="mt-2 text-[15px] leading-snug opacity-90">{result.ending}</p>
      {result.twist ? (
        <p className="mt-2 text-[15px] font-bold leading-snug">{result.twist}</p>
      ) : null}

      {result.mission ? (
        <div className="mt-4 rounded-16 p-4" style={{ background: 'rgba(0,0,0,.25)' }}>
          <div className="text-[12px] opacity-70">{t('case.end.mission')}</div>
          <p className="mt-1 text-[15px] font-bold">{result.mission}</p>
          <p className="mt-1 text-[13px] opacity-80">
            {result.missionDone ? t('case.end.mission.y') : t('case.end.mission.n')}
          </p>
        </div>
      ) : null}

      {lies.length ? (
        <div className="mt-4">
          <div className="text-[13px] font-bold opacity-80">{t('case.end.lies')}</div>
          <ul className="mt-1 space-y-1">
            {lies.map((l, i) => (
              <li key={i} className="text-[14px] leading-snug">
                <span className="opacity-70">{l.question} </span>
                <span className="font-bold">
                  {t('case.end.lies.said')} «{l.said}»
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {awards.length ? (
        <div className="mt-4">
          <div className="text-[13px] font-bold opacity-80">{t('case.end.titles')}</div>
          <ul className="mt-1 space-y-1">
            {awards.map((a, i) => (
              <li key={i} className="text-[14px]">
                <span className="font-bold">{a.title}</span>
                <span className="opacity-80"> — {a.name}</span>
                {a.isMe ? <span className="opacity-60"> ✓</span> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 text-[12px] opacity-60">{t('case.end.share')}</div>
      {children}
    </section>
  )
}
