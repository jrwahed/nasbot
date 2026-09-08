'use client'

import { useEffect, useRef, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { InnerHeader } from '@/components/Header'
import { Field } from '@/components/Field'
import { PrimaryButton } from '@/components/Buttons'
import { StickyCTA } from '@/components/StickyCTA'
import { GuaranteeBox } from '@/components/WhoBooked'
import { PhotoPlaceholder } from '@/components/PhotoPlaceholder'
import { Sticker } from '@/components/Sticker'
import { getSbota, startBooking, submitTransfer, redeemReferral } from '@/lib/api'
import { guaranteeText } from '@/data/lists'
import { track } from '@/lib/track'
import { qJump } from '@/lib/liveq'
import type { Sbota } from '@/types'
import { useT } from '@/components/CopyProvider'

/**
 * الدفع — **تحويل يدوي بس**.
 * فودافون كاش أو إنستا باي: بنوريه الرقم، بيحوّل، بيرفع صورة التحويل،
 * والإدارة بتأكد. مفيش بوابة ومفيش رقم بطاقة بيعدي علينا خالص.
 */

type Method = 'vodafone_cash' | 'instapay'

export default function PayPage() {
  const t = useT()
  // جوه المكوّن علشان النصوص تيجي من قاعدة البيانات
  const METHODS: { id: Method; label: string; note: string }[] = [
    { id: 'vodafone_cash', label: t('pay.method.vodafone'), note: t('pay.method.vodafone_note') },
    { id: 'instapay', label: t('pay.method.instapay'), note: t('pay.method.instapay_note') },
  ]
  const params = useParams<{ slug: string }>()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [sbota, setSbota] = useState<Sbota | null>(null)
  const [method, setMethod] = useState<Method>('vodafone_cash')
  const [ref, setRef] = useState('')
  const [discount, setDiscount] = useState(0)
  const [refMsg, setRefMsg] = useState('')

  // بعد ما نبدأ الحجز بيرجعلنا الرقم اللي نحوّل عليه
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
    getSbota(params.slug).then((s) => {
      if (!s) {
        router.replace('/not-found')
        return
      }
      setSbota(s)
      track('reach_payment', { slug: s.slug })
    })
  }, [params.slug, router])

  if (!sbota) {
    return (
      <main className="mx-auto w-full max-w-page px-5">
        <InnerHeader back={t('pay.label.6')} href={`/s/${params.slug}`} padded={false} />
        <div className="pt-8" style={{ color: 'var(--muted)' }}>{t('pay.text.13')}</div>
      </main>
    )
  }

  const total = Math.round(sbota.priceValue * (1 - discount))

  const applyRef = async () => {
    const r = await redeemReferral(ref)
    if (r.ok) {
      setDiscount(r.discount)
      setRefMsg(t('pay.refApplied', { pct: Math.round(r.discount * 100) }))
      track('use_referral', { code: ref })
    } else {
      setDiscount(0)
      setRefMsg(r.error)
    }
  }

  /** الخطوة 1: حجز مبدئي ونجيب الرقم */
  const onStart = async () => {
    setError('')
    setBusy(true)
    const res = await startBooking({
      slug: sbota.slug,
      method,
      referralCode: ref || undefined,
    })
    setBusy(false)

    if (!res.ok) {
      setError(res.error)
      return
    }
    if (res.paid) {
      // الرصيد غطّى الحجز كله
      qJump()
      router.push(`/s/${sbota.slug}/done`)
      return
    }
    setStarted({
      bookingId: res.bookingId,
      payTo: res.payTo ?? '',
      amount: res.amount ?? total,
      reviewHours: res.reviewHours ?? 2,
    })
  }

  /** الخطوة 2: رفع صورة التحويل */
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
      <InnerHeader back={t('pay.label.6')} href={`/s/${params.slug}`} padded={false} />

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
        </div>
      </div>

      {!started ? (
        <>
          {/* ===== كود الإحالة ===== */}
          <div className="mt-6 font-display text-20 font-black">{t('pay.label.4')}</div>
          <div className="mt-2 flex items-start gap-2">
            <Field
              value={ref}
              onChange={(e) => setRef(e.target.value)}
              placeholder={t('pay.label.5')}
              aria-label={t('pay.label.4')}
              containerClassName="flex-1"
            />
            <button
              type="button"
              onClick={applyRef}
              className="shrink-0 cursor-pointer rounded-14 px-4 font-display text-15 font-black"
              style={{
                minHeight: 52,
                background: 'transparent',
                color: 'var(--fg)',
                border: '2px solid var(--fg)',
              }}
            >{t('pay.text.11')}</button>
          </div>
          {refMsg && (
            <div
              role="status"
              className="mt-1 font-body text-13 font-semibold"
              style={{ color: discount ? 'var(--ok-text)' : 'var(--err-text)' }}
            >
              {refMsg}
            </div>
          )}

          {/* ===== طريقة التحويل ===== */}
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
                  <div
                    className="font-body text-14"
                    style={{ color: on ? '#14161A' : 'var(--muted)' }}
                  >
                    {m.note}
                  </div>
                </button>
              )
            })}
          </div>

          <div
            className="mt-4 rounded-16 p-4 font-body text-15"
            style={{ background: 'var(--surface)' }}
          >{t('pay.text.9')}</div>
        </>
      ) : (
        /* ===== بعد ما بدأنا: الرقم ورفع الإيصال ===== */
        <>
          <div className="mt-6 font-display text-20 font-black">
            {t('pay.transferAmount', { n: started.amount })}
          </div>

          <div
            className="mt-3 rounded-20 p-5 text-center"
            style={{ background: '#EFE3CF', color: '#14161A' }}
          >
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
            >{t('pay.text.8')}</button>
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
            style={{
              minHeight: 58,
              background: 'transparent',
              color: 'var(--fg)',
              border: '2px dashed var(--fg)',
            }}
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

      {/* ===== الحساب ===== */}
      <div className="mt-6 flex flex-col gap-1">
        <div className="flex justify-between">
          <span>{t('pay.text.6')}</span>
          <span className="font-semibold">{t('shared.egp', { n: sbota.priceValue })}</span>
        </div>
        {discount > 0 && (
          <div className="flex justify-between" style={{ color: 'var(--ok-text)' }}>
            <span>{t('pay.text.5')}</span>
            <span className="font-semibold">{t('shared.egpMinus', { n: sbota.priceValue - total })}</span>
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
        <div
          role="alert"
          className="mt-4 rounded-16 p-4 font-body text-15 font-semibold"
          style={{ background: '#8E2F1F', color: '#FBF7EF' }}
        >
          {error}
        </div>
      )}

      <div className="mt-6">
        <StickyCTA>
          {!started ? (
            <PrimaryButton size="lg" className="w-full" onClick={onStart} loading={busy}>{t('pay.text.3')}</PrimaryButton>
          ) : (
            <PrimaryButton
              size="lg"
              className="w-full"
              onClick={onSubmitReceipt}
              loading={busy}
            >{t('pay.text.2')}</PrimaryButton>
          )}
          <div
            className="mt-[6px] text-center font-body text-13"
            style={{ color: 'var(--muted)' }}
          >{t('pay.text.1')}</div>
        </StickyCTA>
      </div>
    </main>
  )
}
