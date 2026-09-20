'use client'

import { useCallback, useEffect, useState } from 'react'
import { useT } from '@/components/CopyProvider'
import {
  getMySafetyLink,
  makeSafetyLink,
  markSafety,
  revokeSafetyLink,
  type MySafetyLink,
} from '@/lib/api'

/**
 * «معايا حد يعرف» — كرت رابط الاطمئنان في صفحة الحجز.
 *
 * الفكرة: العضو بيعمل رابط ويبعته لأمه أو لصاحبته. اللي معاه الرابط بيشوف
 * رايح فين وامتى، وبيعرف أول ما يوصل — وبس. مفيش أسامي اللي معاه ولا أرقام.
 *
 * ⚠ الرابط **ما بيتعملش لوحده**. `getMySafetyLink` بتجيب اللي موجود بس،
 *   و`makeSafetyLink` بتتنادى لما العضو يدوس. من غير الفصل ده كل واحد
 *   يفتح صفحة حجزه كان هيتعملّه رابط ما طلبهوش.
 *
 * ⚠ الحالة كلها بتتقرا من **القاعدة** مش من نص الزرار: «وصل» و«رجع»
 *   بيتحددوا من `arrivedAt`/`doneAt`، فلو الكتابة رفضت الزرار ما بيقولش
 *   «تمام» وهو كذب.
 */
export function SafetyCard({ bookingId, sbotaName }: { bookingId: string; sbotaName: string }) {
  const t = useT()
  const [link, setLink] = useState<MySafetyLink | null>(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)
  const [revoked, setRevoked] = useState(false)
  const [err, setErr] = useState(false)

  const refresh = useCallback(async () => {
    const l = await getMySafetyLink(bookingId)
    setLink(l)
  }, [bookingId])

  useEffect(() => {
    let alive = true
    getMySafetyLink(bookingId).then((l) => alive && setLink(l))
    return () => {
      alive = false
    }
  }, [bookingId])

  const url = link ? `${typeof window === 'undefined' ? '' : window.location.origin}/tamenny/${link.token}` : ''

  const make = async () => {
    setBusy(true)
    setErr(false)
    const tok = await makeSafetyLink(bookingId)
    if (!tok) setErr(true)
    else {
      setRevoked(false)
      await refresh()
    }
    setBusy(false)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      setErr(true)
    }
  }

  const mark = async (kind: 'arrived' | 'done') => {
    setBusy(true)
    const ok = await markSafety(bookingId, kind)
    if (!ok) setErr(true)
    else await refresh()
    setBusy(false)
  }

  const kill = async () => {
    setBusy(true)
    const ok = await revokeSafetyLink(bookingId)
    if (ok) {
      setLink(null)
      setRevoked(true)
    } else setErr(true)
    setBusy(false)
  }

  const waHref = `https://wa.me/?text=${encodeURIComponent(
    t('safety.card.waMsg', { sbota: sbotaName, link: url })
  )}`

  return (
    <section className="mt-[22px] rounded-20 p-5" style={{ background: 'var(--surface)' }}>
      <h2 className="m-0 font-display text-20 font-black">{t('safety.card.title')}</h2>
      <p className="mb-0 mt-2 font-body text-15" style={{ color: 'var(--muted)' }}>
        {t('safety.card.body')}
      </p>

      {!link ? (
        <>
          <button
            type="button"
            onClick={make}
            disabled={busy}
            className="mt-4 grid w-full cursor-pointer place-items-center rounded-14 border-0 font-display text-16 font-black disabled:opacity-60"
            style={{ background: '#2B4CFF', color: '#FBF7EF', minHeight: 50 }}
          >
            {busy ? t('safety.card.making') : t('safety.card.make')}
          </button>
          {revoked && (
            <div role="status" className="mt-2 text-center font-body text-14" style={{ color: 'var(--muted)' }}>
              {t('safety.card.revoked')}
            </div>
          )}
        </>
      ) : (
        <>
          <div
            className="mt-4 overflow-hidden text-ellipsis whitespace-nowrap rounded-14 px-4 py-3 font-body text-14"
            style={{ background: 'var(--bg)', border: '2px solid var(--line)', direction: 'ltr' }}
          >
            {url}
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={copy}
              className="min-h-[46px] flex-1 cursor-pointer rounded-pill border-0 px-4 font-display text-15 font-black"
              style={{ background: '#F4632A', color: '#14161A' }}
            >
              {copied ? t('safety.card.copied') : t('safety.card.copy')}
            </button>
            <a
              href={waHref}
              target="_blank"
              rel="noreferrer"
              className="grid min-h-[46px] flex-1 place-items-center rounded-pill px-4 font-display text-15 font-black"
              style={{ background: '#EFE3CF', color: '#14161A' }}
            >
              {t('safety.card.wa')}
            </a>
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <StateButton
              on={Boolean(link.arrivedAt)}
              busy={busy}
              onClick={() => mark('arrived')}
              label={t('safety.card.arrived')}
              doneLabel={t('safety.card.arrivedOn')}
            />
            <StateButton
              on={Boolean(link.doneAt)}
              busy={busy}
              onClick={() => mark('done')}
              label={t('safety.card.done')}
              doneLabel={t('safety.card.doneOn')}
            />
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
              {t('safety.card.expires')}
            </span>
            <button
              type="button"
              onClick={kill}
              disabled={busy}
              className="min-h-[40px] cursor-pointer rounded-pill border-0 bg-transparent px-3 font-body text-14 font-semibold underline disabled:opacity-60"
              style={{ color: 'var(--muted)' }}
            >
              {t('safety.card.revoke')}
            </button>
          </div>
        </>
      )}

      {err && (
        <div role="alert" className="mt-3 font-body text-14 font-semibold" style={{ color: '#8E2F1F' }}>
          {t('safety.card.err')}
        </div>
      )}
    </section>
  )
}

/** زرار بيقلب لسطر حالة لما القاعدة تأكّد — مش لما الزرار يتداس */
function StateButton({
  on,
  busy,
  onClick,
  label,
  doneLabel,
}: {
  on: boolean
  busy: boolean
  onClick: () => void
  label: string
  doneLabel: string
}) {
  if (on) {
    return (
      <div
        role="status"
        className="grid min-h-[46px] flex-1 place-items-center rounded-pill px-3 font-display text-14 font-black"
        style={{ background: 'transparent', color: '#2B4CFF', border: '2px solid #2B4CFF' }}
      >
        {doneLabel}
      </div>
    )
  }
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className="min-h-[46px] flex-1 cursor-pointer rounded-pill px-3 font-display text-14 font-black disabled:opacity-60"
      style={{ background: 'transparent', color: 'var(--fg)', border: '2px solid var(--fg)' }}
    >
      {label}
    </button>
  )
}
