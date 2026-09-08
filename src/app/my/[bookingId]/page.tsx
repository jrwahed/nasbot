'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import Link from 'next/link'
import { InnerHeader } from '@/components/Header'
import { PhotoPlaceholder } from '@/components/PhotoPlaceholder'
import { Sticker } from '@/components/Sticker'
import { Countdown, CountdownText } from '@/components/Countdown'
import { PlaceMap } from '@/components/MiniMap'
import { groupRuleStickers } from '@/data/lists'
import { getGroup, requestGirlsOnly, type Group } from '@/lib/api'
import { getSession } from '@/lib/session'
import { useT } from '@/components/CopyProvider'

/**
 * سبوطتك — كشف المجموعة.
 * منقولة بالحرف من شاشة 11 في design/نسبوط.dc.html.
 * قبل الكشف بتعرض عد تنازلي وسطر «هتعرف مجموعتك…» بدل القايمة.
 */
export default function GroupPage() {
  const t = useT()
  const params = useParams<{ bookingId: string }>()
  const router = useRouter()
  const [group, setGroup] = useState<Group | null>(null)
  const [loading, setLoading] = useState(true)
  const [moved, setMoved] = useState(false)
  const [isGirl, setIsGirl] = useState(false)

  useEffect(() => {
    setIsGirl(getSession()?.gender === 'بنت')
    let alive = true
    getGroup(params.bookingId).then((g) => {
      if (!alive) return
      if (!g) {
        router.replace('/not-found')
        return
      }
      setGroup(g)
      setLoading(false)
    })
    return () => {
      alive = false
    }
  }, [params.bookingId, router])

  if (loading || !group) {
    return (
      <main className="mx-auto w-full max-w-page px-5">
        <InnerHeader back={t('group.label.3')} href="/me" padded={false} />
        <div className="pt-8 font-body text-16" style={{ color: 'var(--muted)' }}>{t('group.text.10')}</div>
      </main>
    )
  }

  const { booking, sbota, captain, people, why, revealed } = group

  return (
    <main className="mx-auto w-full max-w-page px-5 pb-6">
      <InnerHeader back={t('group.label.3')} href="/me" padded={false} />

      <h1 className="mb-0 mt-[10px] font-display text-32 font-black leading-[1.15]">
        {t('group.yourGroupOn', { day: booking.when.split(' ')[0] })}
      </h1>

      <div className="mt-2 flex flex-wrap items-center gap-[10px]">
        <Countdown to={booking.startsAt} />
        <span style={{ color: 'var(--muted)' }}>
          {booking.sbotaName} · {booking.area}
        </span>
      </div>

      {/* ===== الكابتن ===== */}
      <div
        className="mt-[22px] flex items-center gap-[14px] rounded-20 p-4"
        style={{ background: '#EFE3CF', color: '#14161A' }}
      >
        <PhotoPlaceholder label={captain.photo} variant="sandDeep" circle size={64} />
        <div className="min-w-0">
          <div className="font-display text-18 font-black">{captain.name}</div>
          <div className="font-body text-14">{captain.gateLine}</div>
        </div>
      </div>

      {/* ===== اللي رايحين معاك ===== */}
      {revealed ? (
        <>
          <div className="mt-[22px] font-display text-20 font-black">
            {t('group.whoIsGoing', { n: people.length })}
          </div>
          <div className="mt-2 flex flex-col">
            {people.map((p, i) => (
              <div
                key={p.name}
                className="flex items-center gap-3 py-3"
                style={{ borderBottom: '1px solid var(--line)' }}
              >
                <div
                  className="grid h-[48px] w-[48px] shrink-0 place-items-center rounded-full font-display text-22 font-black"
                  style={{ background: '#EFE3CF', color: '#14161A' }}
                >
                  {p.initial}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-display text-17 font-black">{p.name}</span>
                    <Sticker
                      bg={p.tagColors.bg}
                      fg={p.tagColors.fg}
                      rotate={i % 2 ? 2 : -2}
                      size="xs"
                    >
                      {p.tag}
                    </Sticker>
                  </div>
                  <div className="font-body text-14" style={{ color: 'var(--muted)' }}>
                    {p.line}
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div
            className="mt-[22px] rounded-20 p-[18px]"
            style={{ background: '#2B4CFF', color: '#FBF7EF' }}
          >
            <div className="font-display text-20 font-black">{t('group.text.9')}</div>
            <div className="mt-1">{why}</div>
          </div>
        </>
      ) : (
        <div
          className="mt-[22px] rounded-20 p-[18px]"
          style={{ background: 'var(--surface)' }}
        >
          <div className="font-display text-20 font-black">
            {sbota.whoBooked.revealLine.replace(t('group.label.2'), '')}
          </div>
          <div className="mt-1" style={{ color: 'var(--muted)' }}>
            <CountdownText to={booking.revealAt} />{t('group.text.8')}</div>
        </div>
      )}

      {/* ===== المكان ===== */}
      <div className="mt-[22px] font-display text-20 font-black">{t('group.text.7')}</div>
      <div
        className="mt-2 overflow-hidden rounded-20"
        style={{ background: '#1E2128', border: '2px solid #2A2E36' }}
      >
        <PlaceMap />
        <div className="flex items-center justify-between gap-3 px-4 py-[14px]">
          <div className="font-body text-14" style={{ color: '#FBF7EF' }}>
            <b>{revealed ? sbota.venueName || sbota.area : sbota.area}</b>
            <br />
            <span style={{ color: '#C9C4B8' }}>
              {revealed ? sbota.address : t('group.label.1')}
            </span>
          </div>
          <a
            href={`https://maps.google.com/?q=${encodeURIComponent(sbota.address)}`}
            target="_blank"
            rel="noreferrer"
            className="grid min-h-[44px] shrink-0 place-items-center rounded-pill px-[14px] font-display text-14 font-black"
            style={{ background: '#FBF7EF', color: '#14161A' }}
          >{t('group.text.6')}</a>
        </div>
      </div>

      {/* ===== القواعد في سطرين ===== */}
      <div className="mt-[22px] flex flex-wrap gap-2">
        {groupRuleStickers.map((s) => (
          <Sticker key={s.label} color={s.color} rotate={s.rotate} size="sm">
            {s.label}
          </Sticker>
        ))}
      </div>

      {/* ===== الشات ===== */}
      <Link
        href={`/my/${booking.id}/chat`}
        className="mt-6 grid w-full place-items-center rounded-16 font-display text-20 font-black"
        style={{ background: '#F4632A', color: '#14161A', minHeight: 56 }}
      >{t('group.text.5')}</Link>
      <div
        className="mt-[6px] text-center font-body text-13"
        style={{ color: 'var(--muted)' }}
      >{t('group.text.4')}</div>

      {/* ===== الأزرار اللاصقة ===== */}
      <div
        className="nb-safe-bottom sticky bottom-0 z-30 -mx-5 mt-6 flex flex-col gap-2 px-5 pt-3"
        style={{ background: 'var(--bg)', borderTop: '2px solid var(--line)' }}
      >
        <a
          href="tel:+201000000000"
          className="grid w-full place-items-center rounded-14 font-display text-16 font-black"
          style={{ background: '#3A3D44', color: '#FBF7EF', minHeight: 50 }}
        >{t('group.text.3')}</a>
        {isGirl &&
          (moved ? (
            <div
              role="status"
              className="grid w-full place-items-center rounded-14 font-display text-15 font-black"
              style={{ background: 'transparent', color: '#2B4CFF', border: '2px solid #2B4CFF', minHeight: 46 }}
            >{t('group.text.2')}</div>
          ) : (
            <button
              type="button"
              onClick={async () => {
                await requestGirlsOnly(booking.id)
                setMoved(true)
              }}
              className="w-full cursor-pointer rounded-14 font-display text-15 font-black"
              style={{
                background: 'transparent',
                color: 'var(--fg)',
                border: '2px solid #2B4CFF',
                minHeight: 46,
              }}
            >{t('group.text.1')}</button>
          ))}
      </div>
    </main>
  )
}
