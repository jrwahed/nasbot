'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { getSafetyView, type SafetyView } from '@/lib/api'
import { areaFromDb } from '@/lib/map-db'
import { useT } from '@/components/CopyProvider'

/**
 * صفحة الاطمئنان — اللي العضو بيبعتها لحد يثق فيه.
 *
 * ⚠ **دي الصفحة الوحيدة في الموقع اللي بتدّي معلومة لحد مش مسجّل.** فكل
 *   حرف فيها مقصود: الاسم الأول · اسم الخروجة · الميعاد · المنطقة ·
 *   والعنوان **لو** العضو نفسه بقى من حقه يشوفه. مفيش أسامي اللي معاه،
 *   مفيش أرقام، مفيش صور، ومفيش أي لينك بيودّي جوه الموقع.
 *
 * والحارس كله في القاعدة (`fn_safety_view` — هجرة 0105). الصفحة دي
 * بتعرض اللي الدالة رجّعته وخلاص، ما بتقررش حاجة بنفسها.
 */
export default function TamennyPage() {
  const t = useT()
  const params = useParams<{ token: string }>()
  const [view, setView] = useState<SafetyView | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let alive = true
    const load = () =>
      getSafetyView(params.token).then((v) => {
        if (!alive) return
        setView(v)
        setLoading(false)
      })
    load()
    // بتتحدّث لوحدها — اللي بيطمن مش هيقعد يعمل تحديث بإيده
    const id = window.setInterval(load, 60_000)
    return () => {
      alive = false
      window.clearInterval(id)
    }
  }, [params.token])

  const shell = (children: ReactNode) => (
    <main className="mx-auto w-full max-w-page px-5 pb-10 pt-8">
      {children}
      <div className="mt-10 text-center">
        <Link
          href="/"
          className="font-body text-15 font-semibold underline"
          style={{ color: 'var(--muted)' }}
        >
          {t('safety.page.back')}
        </Link>
      </div>
    </main>
  )

  if (loading) return shell(null)

  if (!view || view.state === 'none')
    return shell(
      <div
        className="rounded-20 p-6 text-center font-body text-16"
        style={{ background: 'var(--surface)' }}
      >
        {t('safety.page.none')}
      </div>
    )

  if (view.state === 'expired')
    return shell(
      <div
        className="rounded-20 p-6 text-center font-body text-16"
        style={{ background: 'var(--surface)' }}
      >
        {t('safety.page.expired')}
      </div>
    )

  const when = view.startsAt ? new Date(view.startsAt) : null
  const ends = view.endsAt ? new Date(view.endsAt) : null
  const fmtDay = (d: Date) =>
    d.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })
  const fmtTime = (d: Date) => d.toLocaleTimeString('ar-EG', { hour: 'numeric', minute: '2-digit' })

  const place = view.venueName || view.areaLabel || areaFromDb(view.areaCode) || ''
  const arrived = view.arrivedAt ? new Date(view.arrivedAt) : null
  const done = view.doneAt ? new Date(view.doneAt) : null

  return shell(
    <>
      <h1 className="mb-0 font-display text-32 font-black leading-[1.15]">
        {t('safety.page.title', { name: view.firstName })}
      </h1>
      <p className="mb-0 mt-2 font-body text-15" style={{ color: 'var(--muted)' }}>
        {t('safety.page.sub')}
      </p>

      {/* ===== الحالة — أهم حاجة في الصفحة، فوق خالص ===== */}
      <div
        className="mt-6 rounded-20 p-5 text-center"
        style={
          done || arrived
            ? { background: '#2B4CFF', color: '#FBF7EF' }
            : { background: '#EFE3CF', color: '#14161A' }
        }
      >
        <div className="font-display text-24 font-black leading-[1.2]">
          {done
            ? t('safety.page.done', { time: fmtTime(done) })
            : arrived
              ? t('safety.page.arrived', { time: fmtTime(arrived) })
              : t('safety.page.waiting')}
        </div>
      </div>

      {/* ===== الميعاد ===== */}
      <div className="mt-6 font-display text-20 font-black">{t('safety.page.when')}</div>
      <div className="mt-1 font-body text-16">
        {view.sbotaName}
        {when && (
          <>
            <br />
            {fmtDay(when)} · {fmtTime(when)}
            {ends && ` — ${fmtTime(ends)}`}
          </>
        )}
      </div>

      {/* ===== المكان ===== */}
      <div className="mt-6 font-display text-20 font-black">{t('safety.page.where')}</div>
      <div className="mt-1 font-body text-16">
        {place && <b>{place}</b>}
        {place && <br />}
        <span style={{ color: 'var(--muted)' }}>
          {view.address || t('safety.page.hidden')}
        </span>
      </div>
      {view.address && (
        <a
          href={`https://maps.google.com/?q=${encodeURIComponent(view.address)}`}
          target="_blank"
          rel="noreferrer"
          className="mt-3 grid w-full place-items-center rounded-14 font-display text-16 font-black"
          style={{ background: 'var(--fg)', color: 'var(--bg)', minHeight: 50 }}
        >
          {t('safety.page.map')}
        </a>
      )}
    </>
  )
}
