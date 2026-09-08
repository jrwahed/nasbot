'use client'

import { Suspense, useEffect, useState } from 'react'
import { useParams, useRouter, useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { QIcon } from '@/components/QIcon'
import { Sticker } from '@/components/Sticker'
import { getSbota, getMe } from '@/lib/api'
import { getSession } from '@/lib/session'
import { buildIcs, downloadIcs } from '@/lib/ics'
import { BOOKING_ID } from '@/data/bookings'
import type { Sbota } from '@/types'
import { useT } from '@/components/CopyProvider'

/**
 * تأكيد الحجز — شاشة سودا كاملة، علامة الاستفهام بتنط،
 * «تمام يا [الاسم]، مكانك محجوز.»
 */
function DoneView() {
  const t = useT()
  const params = useParams<{ slug: string }>()
  const router = useRouter()
  const search = useSearchParams()
  // التحويل اتبعت بس لسه مااتراجعش — الحجز مش مؤكد
  const pending = search.get('pending') === '1'
  const [sbota, setSbota] = useState<Sbota | null>(null)
  const [name, setName] = useState('')
  const [code, setCode] = useState('')
  const [showCode, setShowCode] = useState(false)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    getSbota(params.slug).then((s) => {
      if (!s) {
        router.replace('/not-found')
        return
      }
      setSbota(s)
    })
    setName(getSession()?.firstName ?? '')
    getMe().then((m) => {
      setCode(m.referralCode)
      if (!getSession()?.firstName) setName(m.firstName)
    })
  }, [params.slug, router])

  const addToCalendar = () => {
    if (!sbota) return
    downloadIcs(
      `${sbota.name}.ics`,
      buildIcs({
        title: t('done.shareTitle', { name: sbota.name }),
        start: new Date(Date.now() + 22 * 3600_000).toISOString(),
        durationHours: 2,
        location: sbota.area,
        description: sbota.story,
      })
    )
  }

  const share = async () => {
    setShowCode(true)
    const text = t('done.shareText', { name: sbota?.name ?? '', code })
    if (navigator.share) {
      try {
        await navigator.share({ text })
        return
      } catch {
        /* المستخدم قفل المشاركة — بنكمل بالنسخ */
      }
    }
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2500)
    } catch {
      /* الحافظة مقفولة — الكود ظاهر على الشاشة برضه */
    }
  }

  if (!sbota) return null

  return (
    <main
      className="flex min-h-screen w-full flex-col items-center justify-center px-5 py-12"
      style={{ background: '#14161A', color: '#FBF7EF' }}
    >
      <div className="w-full max-w-page">
        <div className="flex justify-center">
          <span style={{ animation: 'nb-q-jump .7s ease-out' }}>
            <QIcon size={88} rotate={-8} />
          </span>
        </div>

        <h1 className="mt-8 text-center font-display text-32 font-black leading-[1.15]">
          {pending
            ? t('done.pendingHi', { name: name || t('done.label.2') })
            : t('done.okHi', { name: name || t('done.label.2') })}
        </h1>

        {pending && (
          <p className="mt-3 text-center font-body text-17" style={{ color: '#C9C4B8' }}>{t('done.text.4')}</p>
        )}

        <div
          className="mt-6 rounded-20 p-5"
          style={{ background: '#1E2128' }}
        >
          <div className="font-display text-24 font-black">{sbota.name}</div>
          <div className="mt-1 font-body text-16">{sbota.when}</div>
          <div className="font-body text-16" style={{ color: '#C9C4B8' }}>
            {sbota.area} {sbota.addressHint}
          </div>
        </div>

        {!pending && (
          <div className="mt-4 text-center font-body text-16">
            {sbota.whoBooked.revealLine}
          </div>
        )}

        <div className="mt-8 flex flex-col gap-3">
          <button
            type="button"
            onClick={addToCalendar}
            hidden={pending}
            className="w-full cursor-pointer rounded-16 border-0 font-display text-20 font-black"
            style={{ background: '#F4632A', color: '#14161A', minHeight: 58 }}
          >{t('done.text.3')}</button>
          <button
            type="button"
            onClick={share}
            hidden={pending}
            className="w-full cursor-pointer rounded-16 font-display text-18 font-black"
            style={{
              background: 'transparent',
              color: '#FBF7EF',
              border: '2px solid #FBF7EF',
              minHeight: 52,
            }}
          >{t('done.text.2')}</button>
        </div>

        {showCode && (
          <div className="mt-4 flex flex-col items-center gap-2">
            <Sticker color="cream" rotate={-3} fontSize={20} padding="8px 18px">
              {code}
            </Sticker>
            <span className="font-body text-13" style={{ color: '#C9C4B8' }}>
              {copied ? t('done.copiedDot') : t('done.label.1')}
            </span>
          </div>
        )}

        <div className="mt-10 flex flex-col items-center gap-4">
          <Link
            href={`/my/${BOOKING_ID}`}
            className="font-body text-16 font-semibold underline"
            style={{ color: '#F4632A' }}
          >{t('done.text.1')}</Link>
          <Logo size={26} variant="onDark" />
        </div>
      </div>
    </main>
  )
}

export default function DonePage() {
  return (
    <Suspense fallback={null}>
      <DoneView />
    </Suspense>
  )
}
