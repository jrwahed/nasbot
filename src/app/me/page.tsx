'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { InnerHeader } from '@/components/Header'
import { PhotoPlaceholder } from '@/components/PhotoPlaceholder'
import { Sticker } from '@/components/Sticker'
import { Footer } from '@/components/Footer'
import { getMe, getBookings, getMetBefore, signOut, deleteMyAccount } from '@/lib/api'
import { useTheme } from '@/lib/use-theme'
import type { Booking, Me, Person } from '@/types'
import { useT } from '@/components/CopyProvider'

const BADGES = [3, 10, 25]

export default function MePage() {
  const t = useT()
  const router = useRouter()
  const [theme, setTheme] = useTheme()
  const [me, setMe] = useState<Me | null>(null)
  const [bookings, setBookings] = useState<Booking[]>([])
  const [met, setMet] = useState<Person[]>([])
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming')
  const [copied, setCopied] = useState(false)
  const [deleting, setDeleting] = useState(false)

  useEffect(() => {
    getMe().then(setMe)
    getBookings().then(setBookings)
    getMetBefore().then(setMet)
  }, [])

  const copy = async () => {
    if (!me) return
    try {
      await navigator.clipboard.writeText(me.referralCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      /* الحافظة مقفولة — الكود ظاهر على الشاشة */
    }
  }

  if (!me) {
    return (
      <main className="mx-auto w-full max-w-page px-5">
        <InnerHeader back={t('me.label.7')} padded={false} />
        <div className="pt-8" style={{ color: 'var(--muted)' }}>{t('me.text.17')}</div>
      </main>
    )
  }

  const shown = bookings.filter((b) =>
    tab === 'upcoming' ? b.status === 'upcoming' : b.status === 'past'
  )

  return (
    <main className="mx-auto w-full max-w-page">
      <div className="px-5">
        <InnerHeader back={t('me.label.7')} padded={false} />

        {/* ===== الرأس ===== */}
        <div className="mt-4 flex items-center gap-4">
          <PhotoPlaceholder label={me.photo} src={me.photoUrl} circle size={84} />
          <div className="min-w-0">
            <div className="font-display text-26 font-black">{me.firstName}</div>
            <div className="mt-1">
              <Sticker
                bg={me.persona.colors.bg}
                fg={me.persona.colors.fg}
                rotate={-3}
                size="sm"
              >
                {me.persona.name}
              </Sticker>
            </div>
            <div className="mt-1 font-body text-14" style={{ color: 'var(--muted)' }}>
              {t('me.sbotCount', { n: me.count })}
            </div>
          </div>
        </div>

        {/* ===== الشارات ===== */}
        <div className="mt-5 flex gap-3">
          {BADGES.map((n) => {
            const on = me.count >= n
            return (
              <div
                key={n}
                className="flex flex-1 flex-col items-center gap-1 rounded-16 p-3 text-center"
                style={{
                  background: 'var(--surface)',
                  opacity: on ? 1 : 0.4,
                }}
              >
                <span className="font-display text-24 font-black">{n}</span>
                <span className="font-body text-12">
                  {on ? t('me.opened') : t('me.label.6')}
                </span>
              </div>
            )
          })}
        </div>

        {/* ===== الرصيد والكود ===== */}
        <div
          className="mt-5 rounded-20 p-5"
          style={{ background: '#EFE3CF', color: '#14161A' }}
        >
          <div className="flex items-baseline justify-between">
            <span className="font-display text-20 font-black">{t('me.text.16')}</span>
            <span className="font-display text-28 font-black">{t('shared.egp', { n: me.credit })}</span>
          </div>
          <div className="mt-4 font-display text-20 font-black">{t('me.text.15')}</div>
          <div className="mt-2 flex items-center gap-2">
            <span
              className="flex-1 rounded-14 px-4 py-3 font-display text-20 font-black"
              style={{ background: '#FBF7EF', border: '2px solid #14161A' }}
              dir="ltr"
            >
              {me.referralCode}
            </span>
            <button
              type="button"
              onClick={copy}
              className="shrink-0 cursor-pointer rounded-14 px-4 font-display text-15 font-black"
              style={{ minHeight: 52, background: '#14161A', color: '#FBF7EF', border: 0 }}
            >
              {copied ? t('shared.copied') : t('me.label.5')}
            </button>
          </div>
          <div className="mt-2 font-body text-14" style={{ color: '#55575C' }}>{t('me.text.14')}</div>
        </div>

        {/* ===== رايحين معاك ===== */}
        <h2 className="mt-8 font-display text-24 font-black">{t('me.text.13')}</h2>
        <div className="mt-1 font-body text-14" style={{ color: 'var(--muted)' }}>{t('me.text.12')}</div>
        <div className="mt-4 flex flex-col gap-3">
          {met.map((p) => (
            <div
              key={p.name}
              className="flex items-center gap-3 rounded-20 p-3"
              style={{ background: 'var(--surface)' }}
            >
              <PhotoPlaceholder label={p.photo} circle size={56} />
              <div className="min-w-0 flex-1">
                <div className="font-display text-17 font-black">{p.name}</div>
                <div className="font-body text-13" style={{ color: 'var(--muted)' }}>
                  {p.tag}
                </div>
              </div>
              <div className="flex shrink-0 gap-2">
                <Link
                  href={`/me/chat/${encodeURIComponent(p.name)}`}
                  className="grid min-h-[44px] place-items-center rounded-pill px-4 font-display text-14 font-black"
                  style={{ background: '#F4632A', color: '#14161A' }}
                >{t('me.text.11')}</Link>
                <Link
                  href="/"
                  className="grid min-h-[44px] place-items-center rounded-pill px-4 font-display text-14 font-black"
                  style={{
                    background: 'transparent',
                    color: 'var(--fg)',
                    border: '2px solid var(--fg)',
                  }}
                >{t('me.text.10')}</Link>
              </div>
            </div>
          ))}
        </div>

        {/* ===== سبوطاتي ===== */}
        <h2 className="mt-8 font-display text-24 font-black">{t('me.text.9')}</h2>
        <div className="mt-3 flex gap-2">
          {(
            [
              { id: 'upcoming', l: t('me.label.4') },
              { id: 'past', l: t('me.label.3') },
            ] as const
          ).map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setTab(t.id)}
              aria-pressed={tab === t.id}
              className="min-h-[44px] flex-1 cursor-pointer rounded-pill font-display text-15 font-black"
              style={{
                border: '2px solid var(--fg)',
                background: tab === t.id ? 'var(--fg)' : 'transparent',
                color: tab === t.id ? 'var(--bg)' : 'var(--fg)',
              }}
            >
              {t.l}
            </button>
          ))}
        </div>
        <div className="mt-4 flex flex-col gap-3">
          {shown.length === 0 ? (
            <div className="font-body text-16" style={{ color: 'var(--muted)' }}>{t('me.text.8')}</div>
          ) : (
            shown.map((b) => (
              <Link
                key={b.id}
                href={`/my/${b.id}`}
                className="flex items-center justify-between gap-3 rounded-20 p-4"
                style={{ background: 'var(--surface)' }}
              >
                <div className="min-w-0">
                  <div className="font-display text-18 font-black">{b.sbotaName}</div>
                  <div className="font-body text-14" style={{ color: 'var(--muted)' }}>
                    {b.when} · {b.area}
                  </div>
                </div>
                {b.status === 'past' && !b.reviewed && (
                  <Sticker color="orange" rotate={-3} size="sm">{t('me.text.7')}</Sticker>
                )}
              </Link>
            ))
          )}
        </div>

        {/* ===== شاتاتي ===== */}
        <h2 className="mt-8 font-display text-24 font-black">{t('me.text.6')}</h2>
        <div className="mt-3 flex flex-col gap-3">
          {bookings.map((b) => {
            const closed = Date.now() >= new Date(b.chatClosesAt).getTime()
            return (
              <Link
                key={b.id}
                href={`/my/${b.id}/chat`}
                className="flex items-center justify-between gap-3 rounded-20 p-4"
                style={{ background: 'var(--surface)', opacity: closed ? 0.6 : 1 }}
              >
                <span className="font-display text-17 font-black">
                  {t('me.chatWith', { name: b.sbotaName })}
                </span>
                <span className="font-body text-13" style={{ color: 'var(--muted)' }}>
                  {closed ? t('me.chatClosed') : t('me.label.2')}
                </span>
              </Link>
            )
          })}
        </div>

        {/* ===== الإعدادات ===== */}
        <h2 className="mt-8 font-display text-24 font-black">{t('me.text.5')}</h2>
        <div className="mt-3 flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setTheme(theme === 'day' ? 'night' : 'day')}
            className="flex min-h-[52px] cursor-pointer items-center justify-between rounded-16 px-4 font-body text-16 font-semibold"
            style={{ background: 'var(--surface)', color: 'var(--fg)', border: 0 }}
          >
            <span>{t('me.text.4')}</span>
            <span style={{ color: 'var(--muted)' }}>
              {theme === 'day' ? t('shared.themeDay') : t('me.label.1')}
            </span>
          </button>
          <Link
            href="/join"
            className="flex min-h-[52px] items-center rounded-16 px-4 font-body text-16 font-semibold"
            style={{ background: 'var(--surface)' }}
          >{t('me.text.3')}</Link>
          <Link
            href="/me/shoghl"
            className="flex min-h-[52px] items-center rounded-16 px-4 font-body text-16 font-semibold"
            style={{ background: 'var(--surface)' }}
          >{t('shoghl.me.link')}</Link>
          <button
            type="button"
            onClick={async () => {
              await signOut()
              router.push('/')
            }}
            className="flex min-h-[52px] cursor-pointer items-center rounded-16 px-4 text-start font-body text-16 font-semibold"
            style={{ background: 'var(--surface)', color: 'var(--fg)', border: 0 }}
          >{t('me.text.2')}</button>
          <button
            type="button"
            disabled={deleting}
            onClick={async () => {
              if (deleting) return
              if (!window.confirm(t('me.delete.confirm'))) return
              setDeleting(true)
              const ok = await deleteMyAccount()
              if (ok) {
                router.push('/')
              } else {
                setDeleting(false)
                window.alert(t('me.delete.failed'))
              }
            }}
            className="flex min-h-[52px] cursor-pointer items-center rounded-16 px-4 text-start font-body text-16 font-semibold disabled:opacity-60"
            style={{ background: 'transparent', color: '#8E2F1F', border: '2px solid #8E2F1F' }}
          >{deleting ? t('me.delete.progress') : t('me.text.1')}</button>
        </div>
      </div>

      <Footer />
    </main>
  )
}
