'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { InnerHeader } from '@/components/Header'
import { useT } from '@/components/CopyProvider'
import { FeatureGate } from '@/components/FlagsProvider'
import { getGroup, type Group } from '@/lib/api'
import {
  answerCase,
  getCaseAnswered,
  getCaseQuestions,
  type CaseQuestion,
} from '@/lib/cases'

/**
 * «جاوب قبل بكرة» — إجابات يوم الكشف.
 *
 * اثنتاشر سؤال في دقيقتين، وكلهم باختيار مش بكتابة حرة — علشان الموقع
 * يعرف يبني منهم تلميح ويعدّ الناس اللي بينطبق عليهم.
 *
 * ⚠ الشرط الوحيد في أي سؤال: لو الإجابة اتقالت قدام ٥ غرباء، محدش
 *   هيتكسف منها. مفيش سن ولا شغل ولا جواز ولا دين ولا ساكن فين. والأسئلة
 *   نفسها في القاعدة (`case_questions`) — المالك بيزوّد ويشيل من اللوحة.
 *
 * ⚠ الصفحة **بتختفي خالص** لو القاعدة رجّعت ولا سؤال: الخروجة مفيهاش
 *   قضية، أو المفتاح مقفول، أو أنا مش حاجز. مفيش «حالة فاضية» بتتعرض —
 *   الحارس في `fn_case_player_ok` والصفحة بتحترمه.
 */
function AnswersInner() {
  const t = useT()
  const params = useParams<{ bookingId: string }>()
  const [group, setGroup] = useState<Group | null>(null)
  const [qs, setQs] = useState<CaseQuestion[]>([])
  const [count, setCount] = useState<{ answered: number; players: number; mine: number } | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState<string | null>(null)

  const load = useCallback(async (sbotaId: string) => {
    const [list, c] = await Promise.all([getCaseQuestions(sbotaId), getCaseAnswered(sbotaId)])
    setQs(list)
    setCount(c)
  }, [])

  useEffect(() => {
    let alive = true
    getGroup(params.bookingId).then(async (g) => {
      if (!alive || !g) {
        setLoading(false)
        return
      }
      setGroup(g)
      await load(g.sbota.id)
      if (alive) setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [params.bookingId, load])

  const pick = async (optionId: string) => {
    if (!group || busy) return
    setBusy(true)
    setErr(null)
    const e = await answerCase(group.sbota.id, optionId)
    if (e) setErr(e)
    await load(group.sbota.id)
    setBusy(false)
  }

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-page px-5">
        <InnerHeader back={t('shared.back')} href={`/my/${params.bookingId}`} padded={false} />
      </main>
    )
  }

  // مفيش قضية في الخروجة دي، أو مش من حقي — الصفحة ما بتعرضش حاجة
  if (!group || !qs.length) {
    return (
      <main className="mx-auto w-full max-w-page px-5">
        <InnerHeader back={t('shared.back')} href={`/my/${params.bookingId}`} padded={false} />
        <p className="mt-6 text-[15px] opacity-70">{t('case.notyet')}</p>
      </main>
    )
  }

  const done = count ? count.mine >= qs.length : false

  return (
    <main className="mx-auto w-full max-w-page px-5 pb-16">
      <InnerHeader back={t('shared.back')} href={`/my/${params.bookingId}`} padded={false} />

      <div className="mt-4 text-[13px]" style={{ color: '#F4632A' }}>
        {t('case.pre.kicker')}
      </div>
      <h1 className="mt-1 text-[26px] font-bold leading-tight">{t('case.pre.title')}</h1>
      <p className="mt-2 text-[15px] opacity-80">{t('case.pre.body')}</p>
      <p className="mt-1 text-[14px] font-bold" style={{ color: '#2B4CFF' }}>
        {t('case.pre.lie')}
      </p>

      {count ? (
        <p className="mt-3 text-[13px] opacity-70">
          {t('case.pre.count')
            .replace('{{1}}', String(count.answered))
            .replace('{{2}}', String(count.players))}
        </p>
      ) : null}

      <ol className="mt-5 space-y-5">
        {qs.map((q, i) => (
          <li key={q.questionId}>
            <div className="text-[12px] opacity-50">{i + 1}</div>
            <div className="text-[17px] font-bold leading-snug">{q.question}</div>
            <div className="mt-2 flex flex-wrap gap-2">
              {q.options.map((o) => (
                <button
                  key={o.optionId}
                  type="button"
                  disabled={busy}
                  onClick={() => pick(o.optionId)}
                  className="rounded-full px-4 py-2 text-[15px] disabled:opacity-50"
                  style={{
                    background: o.mine ? '#2B4CFF' : '#EFE3CF',
                    color: o.mine ? '#FBF7EF' : '#14161A',
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </li>
        ))}
      </ol>

      {err ? <p className="mt-4 text-[14px]" style={{ color: '#F4632A' }}>{err}</p> : null}
      <p className="mt-6 text-[14px] opacity-80">
        {done ? t('case.pre.done') : t('case.pre.change')}
      </p>
    </main>
  )
}

export default function AnswersPage() {
  // ⚠ ورا نفس مفتاح الميزة اللي بيقفل كل القضايا — والمدخل في صفحة
  //   الحجز ورا نفس المفتاح كمان (حارس `check-nav-flags.mjs`).
  return (
    <FeatureGate flag="cases">
      <AnswersInner />
    </FeatureGate>
  )
}
