'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { InnerHeader } from '@/components/Header'
import { EmergencyCall } from '@/components/EmergencyBlock'
import { useT } from '@/components/CopyProvider'
import { FeatureGate } from '@/components/FlagsProvider'
import { CaseCard } from '@/components/case/CaseCard'
import { CaseFile } from '@/components/case/CaseFile'
import { VotePanel } from '@/components/case/VotePanel'
import { EndingCard } from '@/components/case/EndingCard'
import { VaultBox } from '@/components/case/VaultBox'
import {
  getCaseAwards,
  getCaseClues,
  getCaseFile,
  getCaseLies,
  getCaseObserveQ,
  getCasePlayers,
  getCaseResult,
  getCaseState,
  getCaseVault,
  getCaseVoteState,
  getMyCaseRole,
  joinCase,
  observeCase,
  setCaseMissionDone,
  tryCaseVault,
  voteCase,
  watchCase,
  type CaseAward,
  type CaseClue,
  type CaseFileDoc,
  type CaseLie,
  type CaseMyRole,
  type CasePlayer,
  type CaseQuestion,
  type CaseResult,
  type CaseState,
  type CaseVaultRiddle,
  type CaseVoteState,
} from '@/lib/cases'

/**
 * شاشة اللعب — القضية من الدخول للختام.
 *
 * صفحة واحدة بتتنقل مع الفصل، مش سبع صفحات: الفصل بيتحدّد في القاعدة
 * (`case_sessions.act`) وصاحب الخروجة بينقله، فأي توجيه بين صفحات كان
 * هيبقى نسخة تانية من نفس المنطق (الدرس الستاشر).
 *
 * 🔴 كل حاجة حساسة بتيجي من دالة بترجّع **اللي من حقي بس**:
 *    دوري من `fn_case_my_role` · التلميحات المفتوحة من `fn_case_clues` ·
 *    أرقام التصويت من `fn_case_vote_state` · الختام من `fn_case_result`
 *    (وبترجّع ولا صف قبل الختام). الصفحة **ما بتخبّيش حاجة** — هي أصلًا
 *    ما بتاخدش اللي مش من حقها.
 *
 * ⚠ رقم الطوارئ فوق كل شاشة لعب (قاعدة الأمان في برومبت المالك)، وبيقرا
 *   من `settings` وبيخفي نفسه لو الرقم وهمي (`EmergencyCall`).
 */
function PlayInner() {
  const t = useT()
  const params = useParams<{ sbotaId: string }>()
  const sbotaId = params.sbotaId

  const [st, setSt] = useState<CaseState | null>(null)
  const [role, setRole] = useState<CaseMyRole | null>(null)
  const [clues, setClues] = useState<CaseClue[]>([])
  const [players, setPlayers] = useState<CasePlayer[]>([])
  const [vote, setVote] = useState<CaseVoteState | null>(null)
  const [vault, setVault] = useState<CaseVaultRiddle[]>([])
  const [result, setResult] = useState<CaseResult | null>(null)
  const [lies, setLies] = useState<CaseLie[]>([])
  const [awards, setAwards] = useState<CaseAward[]>([])
  const [outfit, setOutfit] = useState<CaseQuestion | null>(null)
  const [doc, setDoc] = useState<CaseFileDoc | null>(null)

  const [code, setCode] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const s = await getCaseState(sbotaId)
    setSt(s)
    if (!s) {
      setLoading(false)
      return
    }

    // ⚠ الملف بيتحمّل **دايمًا** — قبل ما الأدوار تتوزّع كمان. ده المقصود:
    //   المجموعة بتقرا البلاغ والمطلوب وإزاي تتحل وهي لسه بتستنى، مش بعد
    //   ما تبدأ. من غير كده الشاشة بتبقى «مستنيين الباقي» وبس.
    setDoc(await getCaseFile(sbotaId))

    if (!s.started) {
      setOutfit(await getCaseObserveQ(sbotaId))
      setLoading(false)
      return
    }

    const [r, c, p] = await Promise.all([
      getMyCaseRole(sbotaId),
      getCaseClues(sbotaId),
      getCasePlayers(sbotaId),
    ])
    setRole(r)
    setClues(c)
    setPlayers(p)

    if (s.shape === 'vault') setVault(await getCaseVault(sbotaId))
    else setVote(await getCaseVoteState(sbotaId))

    if (s.act === 'done') {
      const [res, l, a] = await Promise.all([
        getCaseResult(sbotaId),
        getCaseLies(sbotaId),
        getCaseAwards(sbotaId),
      ])
      setResult(res)
      setLies(l)
      setAwards(a)
    }
    setLoading(false)
  }, [sbotaId])

  useEffect(() => {
    let alive = true
    load()
    // الفصل بيتنقل من صاحب الخروجة، فالصفحة بتسأل كل ١٠ ثواني.
    const id = setInterval(() => alive && load(), 10000)
    return () => {
      alive = false
      clearInterval(id)
    }
  }, [load])

  const act = async (fn: () => Promise<string | null>) => {
    setBusy(true)
    setMsg(null)
    const e = await fn()
    if (e) setMsg(e)
    await load()
    setBusy(false)
  }

  if (loading) {
    return (
      <main className="mx-auto w-full max-w-page px-5">
        <InnerHeader back={t('shared.back')} href="/me" padded={false} />
      </main>
    )
  }

  // مفيش قضية، أو مش من حقي — الصفحة ما بتعرضش حاجة (مفيش شاشة فاضية)
  if (!st) {
    return (
      <main className="mx-auto w-full max-w-page px-5">
        <InnerHeader back={t('shared.back')} href="/me" padded={false} />
        <p className="mt-6 text-[15px] opacity-70">{t('case.notyet')}</p>
      </main>
    )
  }

  const dark = st.theme === 'dark' || st.theme === 'mono'

  return (
    <main
      className="mx-auto w-full max-w-page px-5 pb-20"
      style={dark ? undefined : { background: '#FBF7EF' }}
    >
      <InnerHeader back={t('shared.back')} href="/me" padded={false} />

      {/* ⚠ **رقم الطوارئ فوق كل شاشة لعب** (قاعدة الأمان في برومبت
          المالك). بيقرا من `settings` وبيخفي نفسه لو الرقم لسه وهمي —
          نفس المكوّن اللي في صفحة الحجز ولوحة الكابتن، مش نسخة منه. */}
      <EmergencyCall
        label={t('group.text.3')}
        className="mt-3 text-16"
        style={{ background: '#3A3D44', minHeight: 44, borderRadius: 14 }}
      />

      <div className="mt-3 text-[13px]" style={{ color: '#F4632A' }}>
        {st.worldName}
      </div>
      <h1 className="mt-1 text-[26px] font-bold leading-tight">{st.caseTitle}</h1>

      {/* ===== الدخول بالكود ===== */}
      {!st.iAmIn ? (
        <section className="mt-5">
          <p className="text-[15px] opacity-80">{t('case.join.body')}</p>
          <div className="mt-3 flex gap-2">
            <input
              inputMode="numeric"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, '').slice(0, 4))}
              placeholder={t('case.join.code')}
              className="w-28 rounded-12 px-3 py-3 text-center text-[20px] font-bold tracking-widest"
              style={{ background: '#EFE3CF', color: '#14161A' }}
            />
            <button
              type="button"
              disabled={busy || code.length < 4}
              onClick={() => act(() => joinCase(sbotaId, code))}
              className="rounded-full px-6 py-3 text-[16px] font-bold disabled:opacity-50"
              style={{ background: '#F4632A', color: '#FBF7EF' }}
            >
              {t('case.join.cta')}
            </button>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => act(() => watchCase(sbotaId))}
            className="mt-3 text-[14px] underline opacity-70"
          >
            {t('case.join.watch')}
          </button>
          {msg ? <p className="mt-2 text-[14px]" style={{ color: '#F4632A' }}>{msg}</p> : null}
        </section>
      ) : null}

      {/* ===== المقدمة + سؤال اللبس (قبل توزيع الأدوار) ===== */}
      {st.iAmIn && !st.started ? (
        <>
          <p className="mt-3 text-[14px] opacity-70">
            {t('case.join.waiting')
              .replace('{{1}}', String(st.joined))
              .replace('{{2}}', String(st.players))}
          </p>

          {outfit ? (
            <section className="mt-5">
              <h2 className="text-[17px] font-bold">{t('case.outfit.title')}</h2>
              <p className="mt-1 text-[14px] opacity-80">{t('case.outfit.body')}</p>
              <div className="mt-1 text-[16px] font-bold">{outfit.question}</div>
              <div className="mt-2 flex flex-wrap gap-2">
                {outfit.options.map((o) => (
                  <button
                    key={o.optionId}
                    type="button"
                    disabled={busy}
                    onClick={() => act(() => observeCase(sbotaId, o.optionId))}
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
            </section>
          ) : null}
        </>
      ) : null}

      {/* ===== 🔴 ملف القضية =====
          البلاغ ومسرح الواقعة والمطلوب وإزاي تتحل والأدلة — كله في ورقة
          واحدة زي دوسيه التحقيق. والأدلة المقفولة بتبان كخانة فاضية
          بختم، علشان المجموعة تعرف إن فاضل كام من غير ما تاخد حرف. */}
      {st.iAmIn && doc ? (
        <CaseFile doc={doc} clues={clues} players={players} />
      ) : null}

      {/* ===== كارتك ===== */}
      {role ? (
        <CaseCard
          role={role}
          seconds={st.cardSeconds}
          suspectName={st.suspectName}
          detectiveName={st.detectiveName}
          onMissionDone={
            role.role === 'suspect'
              ? (done) => act(() => setCaseMissionDone(sbotaId, done))
              : undefined
          }
        />
      ) : null}

      {/* ===== وقت النشاط ===== */}
      {st.act === 'break1' || st.act === 'break2' ? (
        <section className="mt-5 rounded-20 p-5" style={{ background: '#EFE3CF', color: '#14161A' }}>
          <h2 className="text-[19px] font-bold">{t('case.act.break')}</h2>
          <p className="mt-1 text-[15px]">{t('case.act.break.body')}</p>
        </section>
      ) : null}

      {/* ===== الخزنة ===== */}
      {st.shape === 'vault' && st.started ? (
        <VaultBox
          riddles={vault}
          busy={busy}
          message={msg}
          onTry={async (digits) => {
            setBusy(true)
            setMsg(null)
            const r = await tryCaseVault(sbotaId, digits)
            if (r.error) setMsg(r.error)
            else if (!r.ok) setMsg(t('case.vault.wrong'))
            await load()
            setBusy(false)
          }}
        />
      ) : null}

      {/* ===== التصويت ===== */}
      {st.shape !== 'vault' && vote && vote.open && role && role.role !== 'watcher' ? (
        <VotePanel
          players={players}
          state={vote}
          busy={busy}
          onVote={(id) => act(() => voteCase(sbotaId, id))}
        />
      ) : null}

      {/* ===== الختام ===== */}
      {result ? (
        <EndingCard result={result} lies={lies} awards={awards}>
          <Link
            href="/me"
            className="mt-4 inline-block rounded-full px-5 py-2 text-[14px]"
            style={{ background: 'rgba(0,0,0,.25)', color: '#FBF7EF' }}
          >
            {t('case.end.again')}
          </Link>
        </EndingCard>
      ) : null}

      {st.act === 'done' && st.shape === 'vault' && !vault.some((v) => v.solved) ? (
        <p className="mt-5 text-[16px] font-bold">{t('case.vault.shut')}</p>
      ) : null}

      {/* ===== زرار صاحب الخروجة ===== */}
      {st.iAmHost ? (
        <Link
          href={`/play/${sbotaId}/host`}
          className="mt-6 inline-block rounded-full px-5 py-3 text-[15px] font-bold"
          style={{ background: '#2B4CFF', color: '#FBF7EF' }}
        >
          {t('case.host.title')}
        </Link>
      ) : null}

      {role?.role === 'watcher' ? (
        <p className="mt-5 text-[15px] opacity-80">{t('case.join.watching')}</p>
      ) : null}

      <p className="mt-6 text-[13px] opacity-60">{t('case.secret')}</p>
      {st.shape !== 'vault' ? (
        <p className="text-[13px] opacity-60">{t('case.myteam')}</p>
      ) : null}
    </main>
  )
}

export default function PlayPage() {
  return (
    <FeatureGate flag="cases">
      <PlayInner />
    </FeatureGate>
  )
}
