'use client'

import { useEffect, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { InnerHeader } from '@/components/Header'
import { PrimaryButton } from '@/components/Buttons'
import { StickyCTA } from '@/components/StickyCTA'
import { GuaranteeBox } from '@/components/WhoBooked'
import { PhotoPlaceholder } from '@/components/PhotoPlaceholder'
import { Sticker } from '@/components/Sticker'
import { getWorkSbota, getWorkSettings, startBooking, submitTransfer, hasPriorWorkBooking } from '@/lib/api'
import { guaranteeText } from '@/data/lists'
import { track } from '@/lib/track'
import { qJump } from '@/lib/liveq'
import type { WorkPayWith, WorkSbota, WorkSettings } from '@/types'
import { useT } from '@/components/CopyProvider'

/**
 * دفع سبوطة الشغل — نفس مسار /s/[slug]/pay بالحرف (تحويل يدوي: فودافون كاش أو
 * إنستا باي → صورة التحويل → مراجعة الإدارة) بس السعر من settings.work_* حسب
 * الاختيار (`single` أو `first_time`)، والخادم بيتحقق من «أول مرة» بنفسه.
 * كود الإحالة مش هنا — أسعار الشغل مخصومة أصلًا.
 */

type Method = 'vodafone_cash' | 'instapay'

export function WorkPayFlow({ slug, payWith }: { slug: string; payWith: WorkPayWith }) {
  const t = useT()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const METHODS: { id: Method; label: string; note: string }[] = [
    { id: 'vodafone_cash', label: t('pay.method.vodafone'), note: t('pay.method.vodafone_note') },
    { id: 'instapay', label: t('pay.method.instapay'), note: t('pay.method.instapay_note') },
  ]

  const [sbota, setSbota] = useState<WorkSbota | null>(null)
  const [settings, setSettings] = useState<WorkSettings | null>(null)
  const [mode, setMode] = useState<WorkPayWith>(payWith)
  const [method, setMethod] = useState<Method>('vodafone_cash')
  const [started, setStarted] = useState<{
    bookingId: string
    payTo: string
    amount: number
    reviewHours: number
  } | null>(null)
  const [receipt, setReceipt] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let alive = true
    Promise.all([getWorkSbota(slug), getWorkSettings(), hasPriorWorkBooking()]).then(
      ([s, cfg, prior]) => {
        if (!alive) return
        if (!s) {
          router.replace(`/s/${slug}/pay`)
          return
        }
        setSbota(s)
        setSettings(cfg)
        // «أول مرة» لأول حجز شغل بس — لو حجز قبل كده بنرجع لسعر اليوم
        if (prior) setMode('single')
        track('reach_payment', { slug: s.slug, work: true, payWith })
      }
    )
    return () => {
      alive = false
    }
  }, [slug, router, payWith])

  const back = `/shoghl/${slug}`

  if (!sbota || !settings) {
    return (
      <main className="mx-auto w-full max-w-page px-5">
        <InnerHeader back={t('pay.label.6')} href={back} padded={false} hideToggle />
        <div className="pt-8" style={{ color: 'var(--muted)' }}>{t('pay.text.13')}</div>
      </main>
    )
  }

  const total = mode === 'first_time' ? settings.firstTimePrice : settings.singlePrice

  const onStart = async () => {
    setError('')
    setBusy(true)
    const res = await startBooking({ slug: sbota.slug, method, payWith: mode })
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    if (res.paid) {
      qJump()
      router.push(`/s/${sbota.slug}/done`)
      return
    }
    setStarted({
      bookingId: res.bookingId,
      payTo: res.payTo ?? '',
      amount: res.amount ?? total,
      reviewHours: res.reviewHours ?? settings.reviewHours,
    })
  }

  const onSubmitReceipt = async () => {
    if (!started) return
    if (!receipt) {
      setError(t('pay.label.8'))
      return
    }
    setError('')
    setBusy(true)
    const res = await submitTransfer(started.bookingId, receipt)
    setBusy(false)
    if (!res.ok) {
      setError(res.error ?? t('pay.label.7'))
      return
    }
    qJump()
    router.push(`/s/${sbota.slug}/done?pending=1`)
  }

  return (
    <main className="mx-auto w-full max-w-page px-5 pb-6">
      <InnerHeader back={t('pay.label.6')} href={back} padded={false} hideToggle />

      <h1 className="mb-0 mt-[10px] font-display text-30 font-black leading-[1.15]">{t('pay.text.12')}</h1>

      {/* ملخص السبوطة */}
      <div
        className="mt-4 flex items-center gap-3 rounded-20 p-4"
        style={{ background: '#EFE3CF', color: '#14161A' }}
      >
        <PhotoPlaceholder
          label={sbota.img}
          variant="sandDeep"
          className="shrink-0"
          style={{ width: 72, height: 72, borderRadius: 16, fontSize: 10, padding: 6 }}
        />
        <div className="min-w-0">
          <div className="font-display text-20 font-black">{sbota.name}</div>
          <div className="font-body text-14">{sbota.meta}</div>
          {sbota.venue?.name && (
            <div className="font-body text-14" style={{ color: '#55575C' }}>
              {sbota.venue.name}
            </div>
          )}
        </div>
      </div>

      {/* الاختيار: يوم واحد / أول مرة */}
      <div className="mt-4">
        <Sticker color={mode === 'first_time' ? 'cobalt' : 'cream'} rotate={-2} size="sm">
          {mode === 'first_time' ? t('shoghl.pay.firstTime') : t('shoghl.pay.singleLabel')}
        </Sticker>
      </div>

      {!started ? (
        <>
          <div className="mt-6 font-display text-20 font-black">{t('pay.text.10')}</div>
          <div className="mt-3 flex flex-col gap-3">
            {METHODS.map((m) => {
              const on = method === m.id
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMethod(m.id)}
                  aria-pressed={on}
                  className="cursor-pointer rounded-20 p-4 text-start"
                  style={{
                    background: on ? '#F4632A' : 'var(--surface)',
                    color: on ? '#14161A' : 'var(--fg)',
                    border: `2px solid ${on ? '#F4632A' : 'var(--line)'}`,
                    minHeight: 72,
                  }}
                >
                  <div className="font-display text-20 font-black">{m.label}</div>
                  <div className="font-body text-14" style={{ color: on ? '#14161A' : 'var(--muted)' }}>
                    {m.note}
                  </div>
                </button>
              )
            })}
          </div>
          <div className="mt-4 rounded-16 p-4 font-body text-15" style={{ background: 'var(--surface)' }}>
            {t('pay.text.9')}
          </div>
        </>
      ) : (
        <>
          <div className="mt-6 font-display text-20 font-black">
            {t('pay.transferAmount', { n: started.amount })}
          </div>
          <div className="mt-3 rounded-20 p-5 text-center" style={{ background: '#EFE3CF', color: '#14161A' }}>
            <div className="font-body text-14" style={{ color: '#55575C' }}>
              {method === 'vodafone_cash' ? t('pay.method.vodafone') : t('pay.method.instapay')}
            </div>
            <div className="mt-2 font-display text-28 font-black" dir="ltr">
              {started.payTo}
            </div>
            <button
              type="button"
              onClick={() => navigator.clipboard?.writeText(started.payTo)}
              className="mt-3 min-h-[44px] cursor-pointer rounded-pill px-5 font-display text-15 font-black"
              style={{ background: '#14161A', color: '#FBF7EF', border: 0 }}
            >
              {t('pay.text.8')}
            </button>
          </div>

          <div className="mt-6 font-display text-20 font-black">{t('pay.text.7')}</div>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            aria-label={t('pay.label.2')}
            onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
            className="sr-only"
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="mt-3 w-full cursor-pointer rounded-16 font-display text-16 font-black"
            style={{ minHeight: 58, background: 'transparent', color: 'var(--fg)', border: '2px dashed var(--fg)' }}
          >
            {receipt ? `${receipt.name} ✓` : t('pay.label.1')}
          </button>
          <div className="mt-4 text-center">
            <Sticker color="cream" rotate={-2} size="sm">
              {t('pay.reviewWithin', { n: started.reviewHours })}
            </Sticker>
          </div>
        </>
      )}

      {/* الحساب */}
      <div className="mt-6 flex flex-col gap-1">
        <div className="flex justify-between">
          <span>{t('pay.text.6')}</span>
          <span className="font-semibold">{t('shared.egp', { n: settings.singlePrice })}</span>
        </div>
        {mode === 'first_time' && (
          <div className="flex justify-between" style={{ color: 'var(--ok-text)' }}>
            <span>{t('shoghl.pay.firstTime')}</span>
            <span className="font-semibold">
              {t('shared.egpMinus', { n: settings.singlePrice - settings.firstTimePrice })}
            </span>
          </div>
        )}
        <div className="mt-1 flex items-baseline justify-between">
          <span className="font-display text-20 font-black">{t('pay.text.4')}</span>
          <span className="font-display text-34 font-black leading-none">
            {t('shared.egp', { n: started?.amount ?? total })}
          </span>
        </div>
        <div className="font-body text-14" style={{ color: 'var(--muted)' }}>
          {sbota.priceBreakdown}
        </div>
      </div>

      <div className="mt-4">
        <GuaranteeBox text={guaranteeText} />
      </div>

      {error && (
        <div role="alert" className="mt-4 rounded-16 p-4 font-body text-15 font-semibold" style={{ background: '#8E2F1F', color: '#FBF7EF' }}>
          {error}
        </div>
      )}

      <div className="mt-6">
        <StickyCTA>
          {!started ? (
            <PrimaryButton size="lg" className="w-full" onClick={onStart} loading={busy}>
              {t('pay.text.3')}
            </PrimaryButton>
          ) : (
            <PrimaryButton size="lg" className="w-full" onClick={onSubmitReceipt} loading={busy}>
              {t('pay.text.2')}
            </PrimaryButton>
          )}
          <div className="mt-[6px] text-center font-body text-13" style={{ color: 'var(--muted)' }}>
            {t('pay.text.1')}
          </div>
        </StickyCTA>
      </div>
    </main>
  )
}
