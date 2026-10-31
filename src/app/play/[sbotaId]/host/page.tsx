'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { InnerHeader } from '@/components/Header'
import { useT } from '@/components/CopyProvider'
import { FeatureGate } from '@/components/FlagsProvider'
import {
  buildCase,
  finishCase,
  getCaseCode,
  getCasePlayers,
  getCaseState,
  nextCaseAct,
  openCase,
  setCaseGames,
  setCaseLosers,
  type CasePlayer,
  type CaseState,
} from '@/lib/cases'

/**
 * لوحة اللي ماسك القضية.
 *
 * ⚠ **هو بيلعب زي أي حد — مش شايف المتهم.** الصفحة دي فيها أزرار التنقل
 *   بس: الكود · توزيع الأدوار · «ابدأ الفصل الجاي» · «مين كسب الجيم؟» ·
 *   الختام. ومفيش ولا نداء هنا بيرجّع الأدوار — `fn_case_my_role` بترجّع
 *   دوره هو بس زي أي لاعب، وهو في الصفحة التانية.
 *
 * ⚠ الكود بيتقال **بصوته**. `fn_case_code` بترجّع null لأي حد غيره، فلو
 *   حد فتح الصفحة دي بالرابط مش هيشوف حاجة.
 *
 * ⚠ «مين صاحب الخروجة؟» مش محسوبة هنا — `fn_case_host` في القاعدة
 *   (الكابتن، وإلا صاحب الخروجة، وإلا أقدم حجز مدفوع). الصفحة بتسأل
 *   `i_am_host` وبس.
 */
function HostInner() {
  const t = useT()
  const params = useParams<{ sbotaId: string }>()
  const sbotaId = params.sbotaId

  const [st, setSt] = useState<CaseState | null>(null)
  const [code, setCode] = useState<string | null>(null)
  const [players, setPlayers] = useState<CasePlayer[]>([])
  const [games, setGames] = useState('')
  const [losers, setLosers] = useState<string[]>([])
  const [msg, setMsg] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    const s = await getCaseState(sbotaId)
    setSt(s)
    if (s) {
      setCode(await getCaseCode(sbotaId))
      if (s.started) setPlayers(await getCasePlayers(sbotaId))
    }
    setLoading(false)
  }, [sbotaId])

  useEffect(() => {
    load()
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
        <InnerHeader back={t('shared.back')} href={`/play/${sbotaId}`} padded={false} />
      </main>
    )
  }

  // مش صاحب الخروجة، أو مفيش قضية — مفيش حاجة تتعرض
  if (!st || !st.iAmHost) {
    return (
      <main className="mx-auto w-full max-w-page px-5">
        <InnerHeader back={t('shared.back')} href={`/play/${sbotaId}`} padded={false} />
        <p className="mt-6 text-[15px] opacity-70">{t('case.notyet')}</p>
      </main>
    )
  }

  const btn = 'mt-3 w-full rounded-full px-5 py-3 text-[16px] font-bold disabled:opacity-50'

  return (
    <main className="mx-auto w-full max-w-page px-5 pb-20">
      <InnerHeader back={t('shared.back')} href={`/play/${sbotaId}`} padded={false} />

      <h1 className="mt-4 text-[26px] font-bold leading-tight">{t('case.host.title')}</h1>
      <p className="mt-1 text-[15px] opacity-80">{t('case.host.body')}</p>

      {/* ===== الكود ===== */}
      {code ? (
        <section className="mt-5 rounded-20 p-5" style={{ background: '#14161A', color: '#FBF7EF' }}>
          <div className="text-[28px] font-bold tracking-[0.3em]">
            {t('case.host.code').replace('{{1}}', code)}
          </div>
          <p className="mt-2 text-[13px] opacity-70">{t('case.host.say')}</p>
          <p className="mt-2 text-[14px] opacity-90">
            {t('case.host.wait').replace('{{1}}', String(Math.max(st.players - st.joined, 0)))}
          </p>
        </section>
      ) : (
        <button
          type="button"
          disabled={busy}
          onClick={() => act(() => openCase(sbotaId))}
          className={btn}
          style={{ background: '#F4632A', color: '#FBF7EF' }}
        >
          {t('case.host.open')}
        </button>
      )}

      {/* ===== توزيع الأدوار ===== */}
      {code && !st.started ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => act(() => buildCase(sbotaId, st.shape))}
          className={btn}
          style={{ background: '#2B4CFF', color: '#FBF7EF' }}
        >
          {t('case.host.start')}
        </button>
      ) : null}

      {/* ===== نقل الفصل ===== */}
      {st.started && st.act !== 'done' ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => act(() => nextCaseAct(sbotaId))}
          className={btn}
          style={{ background: '#F4632A', color: '#FBF7EF' }}
        >
          {t('case.host.next')}
        </button>
      ) : null}

      {/* ===== نتيجة النشاط ===== */}
      {st.started && st.act !== 'done' ? (
        <section className="mt-6">
          <h2 className="text-[17px] font-bold">{t('case.host.games')}</h2>
          <p className="mt-1 text-[14px] opacity-80">{t('case.host.games.n')}</p>
          <div className="mt-2 flex gap-2">
            <input
              inputMode="numeric"
              value={games}
              onChange={(e) => setGames(e.target.value.replace(/[^0-9]/g, '').slice(0, 2))}
              className="w-20 rounded-12 px-3 py-2 text-center text-[18px] font-bold"
              style={{ background: '#EFE3CF', color: '#14161A' }}
            />
            <button
              type="button"
              disabled={busy || games === ''}
              onClick={() => act(() => setCaseGames(sbotaId, Number(games)))}
              className="rounded-full px-5 py-2 text-[15px] font-bold disabled:opacity-50"
              style={{ background: '#2B4CFF', color: '#FBF7EF' }}
            >
              {t('case.host.save')}
            </button>
          </div>

          {st.shape !== 'vault' && players.length ? (
            <>
              <h3 className="mt-5 text-[16px] font-bold">{t('case.host.losers')}</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {players.map((p) => {
                  const on = losers.includes(p.profileId)
                  return (
                    <button
                      key={p.profileId}
                      type="button"
                      onClick={() =>
                        setLosers((old) =>
                          on ? old.filter((x) => x !== p.profileId) : [...old, p.profileId],
                        )
                      }
                      className="rounded-full px-4 py-2 text-[15px]"
                      style={{
                        background: on ? '#2B4CFF' : '#EFE3CF',
                        color: on ? '#FBF7EF' : '#14161A',
                      }}
                    >
                      {p.codename ? `${p.codename} · ${p.name}` : p.name}
                    </button>
                  )
                })}
              </div>
              <button
                type="button"
                disabled={busy || !losers.length}
                onClick={() => act(() => setCaseLosers(sbotaId, losers))}
                className={btn}
                style={{ background: '#EFE3CF', color: '#14161A' }}
              >
                {t('case.host.save')}
              </button>
            </>
          ) : null}
        </section>
      ) : null}

      {/* ===== الختام ===== */}
      {st.started && st.act === 'final' ? (
        <button
          type="button"
          disabled={busy}
          onClick={() => act(() => finishCase(sbotaId, st.shape))}
          className={btn}
          style={{ background: '#14161A', color: '#FBF7EF' }}
        >
          {t('case.host.finish')}
        </button>
      ) : null}

      {st.act === 'done' ? <p className="mt-6 text-[16px] font-bold">{t('case.over')}</p> : null}
      {msg ? <p className="mt-3 text-[14px]" style={{ color: '#F4632A' }}>{msg}</p> : null}

      <Link href={`/play/${sbotaId}`} className="mt-8 inline-block text-[14px] underline opacity-70">
        {t('case.join.title')}
      </Link>
    </main>
  )
}

export default function HostPage() {
  return (
    <FeatureGate flag="cases">
      <HostInner />
    </FeatureGate>
  )
}
