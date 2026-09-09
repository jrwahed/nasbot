'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { InnerHeader } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { Sticker } from '@/components/Sticker'
import { PrimaryButton } from '@/components/Buttons'
import { PassCard } from '@/components/work/PassCard'
import { getWorkSettings } from '@/lib/api'
import {
  EMPTY_PASS_STATE,
  getMyPassState,
  getPassPayment,
  startPassPurchase,
  submitPassReceipt,
  type MyPassState,
  type PassKindCode,
  type PassPayment,
  type PayMethod,
} from '@/lib/work'
import { workFaq } from '@/data/lists'
import { isLoggedIn } from '@/lib/session'
import type { WorkSettings } from '@/types'
import { useT } from '@/components/CopyProvider'

/**
 * /shoghl/pass — الشرح، الكارتين، الأسئلة، والشراء **كامل**.
 *
 * الدفع تحويل يدوي زي باقي الموقع: بيختار كارت وطريقة تحويل → الخادم
 * بيعمل الكارت `pending` والدفعة `initiated` وبيرجّع الرقم → بيرفع صورة
 * التحويل → الدفعة `pending_review` → الإدارة تعتمد فالكارت يبقى `active`.
 * مفيش وعد كاذب في أي شاشة: الكارت مش بيشتغل قبل المراجعة.
 *
 * لو معاه كارت شغال بنعرض الرصيد والانتهاء بدل الشراء.
 * لو معاه طلب مستني بنكمّل من عند صورة التحويل مش من الأول.
 */

const METHOD_IDS: PayMethod[] = ['vodafone_cash', 'instapay']

export default function PassPage() {
  const t = useT()
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)

  const [settings, setSettings] = useState<WorkSettings | null>(null)
  const [passes, setPasses] = useState<MyPassState>(EMPTY_PASS_STATE)
  const [payment, setPayment] = useState<PassPayment | null>(null)
  const [logged, setLogged] = useState(false)
  const [ready, setReady] = useState(false)

  const [kind, setKind] = useState<PassKindCode | null>(null)
  const [method, setMethod] = useState<PayMethod>('vodafone_cash')
  const [pickHint, setPickHint] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [receipt, setReceipt] = useState<File | null>(null)
  const [sent, setSent] = useState(false)

  const load = useCallback(async () => {
    const inSession = isLoggedIn()
    setLogged(inSession)
    const [cfg, state] = await Promise.all([
      getWorkSettings(),
      inSession ? getMyPassState() : Promise.resolve(EMPTY_PASS_STATE),
    ])
    setSettings(cfg)
    setPasses(state)
    setPayment(state.pending ? await getPassPayment(state.pending.id) : null)
    setReady(true)
  }, [])

  useEffect(() => {
    let alive = true
    load().catch(() => {
      // safeWork بيبلع أي وقوع ويرجّع بديل — الفرع ده للأمان بس
      if (alive) setReady(true)
    })
    return () => {
      alive = false
    }
  }, [load])

  if (!settings || !ready) {
    return (
      <main className="mx-auto w-full max-w-page px-5 pb-8">
        <InnerHeader back={t('shoghl.back')} href="/shoghl" padded={false} hideToggle />
        <div className="pt-8 font-body text-16" style={{ color: 'var(--muted)' }}>
          {t('shoghl.loading')}
        </div>
      </main>
    )
  }

  const price = kind === 'eight' ? settings.pass8Price : settings.pass4Price
  const active = passes.active
  const pending = passes.pending
  const waitingForReview = sent || Boolean(payment?.receiptPath)

  const fmtDate = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleDateString('ar-EG', {
          timeZone: 'Africa/Cairo',
          day: 'numeric',
          month: 'long',
        })
      : ''

  const onBuy = async () => {
    if (!logged) {
      router.push(`/login?next=${encodeURIComponent('/shoghl/pass')}`)
      return
    }
    if (!kind) {
      setPickHint(true)
      return
    }
    setPickHint(false)
    setError('')
    setBusy(true)
    const res = await startPassPurchase({ kind, method })
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    // الرقم اللي جاي من الخادم بالقروش — والعرض بالجنيه
    setPayment({
      passId: res.passId,
      amount: res.amount ? Math.round(res.amount / 100) : price,
      method: res.method,
      receiptPath: null,
      status: 'initiated',
    })
    // وبنعيد التحميل علشان الكارت المستني يبان في الحالة كمان
    await load()
  }

  const onSendReceipt = async () => {
    const passId = pending?.id ?? payment?.passId
    if (!passId) return
    if (!receipt) {
      setError(t('shoghl.pass.receipt.need'))
      return
    }
    setError('')
    setBusy(true)
    const res = await submitPassReceipt(passId, receipt)
    setBusy(false)
    if (!res.ok) {
      setError(res.error)
      return
    }
    setSent(true)
  }

  const payTo =
    (payment?.method ?? method) === 'vodafone_cash'
      ? settings.vodafoneNumber
      : settings.instapayHandle

  return (
    <main className="mx-auto w-full max-w-page pb-6">
      <div className="px-5">
        <InnerHeader back={t('shoghl.back')} href="/shoghl" padded={false} hideToggle />
      </div>

      <div className="px-5 pt-[10px]">
        <h1 className="m-0 font-display text-30 font-black leading-[1.15]">
          {t('shoghl.pass.page.title')}
        </h1>
        <div className="mt-1 font-body text-16" style={{ color: 'var(--muted)' }}>
          {t('shoghl.pass.page.sub')}
        </div>
      </div>

      {/* ===== معاه كارت شغال: الرصيد والانتهاء بدل الشراء ===== */}
      {active && (
        <div className="px-5 pt-4">
          <div className="rounded-20 p-5" style={{ background: '#EFE3CF', color: '#14161A' }}>
            <div className="font-display text-20 font-black">{t('shoghl.pass.active.title')}</div>
            <div className="mt-2 font-display text-34 font-black leading-none">
              {t('shoghl.pass.active.left', {
                n: active.sessionsLeft,
                total: active.sessionsTotal,
              })}
            </div>
            {active.expiresAt && (
              <div className="mt-1 font-body text-15" style={{ color: '#55575C' }}>
                {t('shoghl.pass.active.until', { date: fmtDate(active.expiresAt) })}
              </div>
            )}
            <div className="mt-4 flex flex-wrap gap-2">
              <Link
                href="/shoghl"
                className="grid min-h-[46px] place-items-center rounded-pill px-5 font-display text-15 font-black"
                style={{ background: '#14161A', color: '#FBF7EF' }}
              >
                {t('shoghl.pass.active.book')}
              </Link>
              <Link
                href="/me/shoghl"
                className="grid min-h-[46px] place-items-center rounded-pill px-5 font-display text-15 font-black"
                style={{ background: 'transparent', color: '#14161A', border: '2px solid #14161A' }}
              >
                {t('shoghl.me.link')}
              </Link>
            </div>
          </div>
        </div>
      )}

      {/* ===== الكارتين ===== */}
      <div className="mt-5 grid grid-cols-1 gap-3 px-5 sm:grid-cols-2">
        <PassCard
          kind="four"
          price={settings.pass4Price}
          weeks={settings.pass4Weeks}
          singlePrice={settings.singlePrice}
          selected={kind === 'four'}
          onSelect={pending || active ? undefined : () => setKind('four')}
          rotate={-3}
        />
        <PassCard
          kind="eight"
          price={settings.pass8Price}
          weeks={settings.pass8Weeks}
          singlePrice={settings.singlePrice}
          selected={kind === 'eight'}
          onSelect={pending || active ? undefined : () => setKind('eight')}
          rotate={3}
        />
      </div>

      {/* ===== بيشتغل إزاي ===== */}
      <section className="px-5 pt-8">
        <h2 className="m-0 font-display text-24 font-black leading-[1.15]">
          {t('shoghl.pass.how.title')}
        </h2>
        <ol className="m-0 mt-3 flex list-none flex-col gap-3 p-0">
          {[1, 2, 3].map((n) => (
            <li key={n} className="flex items-start gap-3">
              <Sticker color="orange" size="step" rotate={n % 2 ? -3 : 3}>
                {n}
              </Sticker>
              <span className="font-body text-16">{t(`shoghl.pass.how.${n}`)}</span>
            </li>
          ))}
        </ol>
      </section>

      {/* ===== الأسئلة ===== */}
      <section className="px-5 pt-8">
        <h2 className="m-0 font-display text-24 font-black leading-[1.15]">
          {t('shoghl.pass.faq.title')}
        </h2>
        <div className="mt-3 flex flex-col gap-3">
          {workFaq.map((f) => (
            <div
              key={f.q}
              className="rounded-20 p-[18px]"
              style={{ background: '#EFE3CF', color: '#14161A' }}
            >
              <div className="font-display text-18 font-black">{t(f.q)}</div>
              <div className="mt-1 font-body text-15">
                {t(f.a, {
                  single: settings.singlePrice,
                  w4: settings.pass4Weeks,
                  w8: settings.pass8Weeks,
                })}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ===== الشراء ===== */}
      <section className="px-5 pt-8">
        {waitingForReview ? (
          <div className="rounded-20 p-5" style={{ background: '#EFE3CF', color: '#14161A' }}>
            <div className="font-display text-20 font-black">{t('shoghl.pass.done.title')}</div>
            <p className="mb-0 mt-2 font-body text-15">{t('shoghl.pass.done.body')}</p>
            <div className="mt-3">
              <Sticker color="cream" rotate={-2} size="sm">
                {t('pay.reviewWithin', { n: settings.reviewHours })}
              </Sticker>
            </div>
          </div>
        ) : pending || payment ? (
          <div className="rounded-20 p-5" style={{ background: '#EFE3CF', color: '#14161A' }}>
            <div className="font-display text-20 font-black">
              {t('shoghl.pass.transfer.title', { n: payment?.amount ?? price })}
            </div>
            <div className="mt-3 rounded-16 p-4 text-center" style={{ background: '#FBF7EF' }}>
              <div className="font-body text-14" style={{ color: '#55575C' }}>
                {(payment?.method ?? method) === 'vodafone_cash'
                  ? t('pay.method.vodafone')
                  : t('pay.method.instapay')}
              </div>
              <div className="mt-1 font-display text-28 font-black" dir="ltr">
                {payTo}
              </div>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(payTo)}
                className="mt-3 min-h-[44px] cursor-pointer rounded-pill px-5 font-display text-15 font-black"
                style={{ background: '#14161A', color: '#FBF7EF', border: 0 }}
              >
                {t('pay.text.8')}
              </button>
            </div>

            <p className="mb-0 mt-4 font-body text-15 font-semibold">
              {t('shoghl.pass.transfer.note')}
            </p>

            <div className="mt-4 font-display text-18 font-black">
              {t('shoghl.pass.receipt.title')}
            </div>
            <input
              ref={fileRef}
              type="file"
              accept="image/*,application/pdf"
              aria-label={t('pay.label.2')}
              onChange={(e) => setReceipt(e.target.files?.[0] ?? null)}
              className="sr-only"
            />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="mt-2 w-full cursor-pointer rounded-16 font-display text-16 font-black"
              style={{
                minHeight: 58,
                background: 'transparent',
                color: '#14161A',
                border: '2px dashed #14161A',
              }}
            >
              {receipt ? `${receipt.name} ✓` : t('pay.label.1')}
            </button>
            <div className="mt-4">
              <PrimaryButton size="lg" className="w-full" onClick={onSendReceipt} loading={busy}>
                {t('shoghl.pass.receipt.send')}
              </PrimaryButton>
            </div>
          </div>
        ) : active ? null : (
          <>
            <div className="font-display text-20 font-black">{t('shoghl.pass.method.title')}</div>
            <div className="mt-3 flex flex-col gap-3">
              {METHOD_IDS.map((m) => {
                const on = method === m
                return (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethod(m)}
                    aria-pressed={on}
                    className="cursor-pointer rounded-20 p-4 text-start"
                    style={{
                      background: on ? '#F4632A' : 'var(--surface)',
                      color: on ? '#14161A' : 'var(--fg)',
                      border: `2px solid ${on ? '#F4632A' : 'var(--line)'}`,
                      minHeight: 72,
                    }}
                  >
                    <div className="font-display text-20 font-black">
                      {m === 'vodafone_cash' ? t('pay.method.vodafone') : t('pay.method.instapay')}
                    </div>
                    <div
                      className="font-body text-14"
                      style={{ color: on ? '#14161A' : 'var(--muted)' }}
                    >
                      {m === 'vodafone_cash'
                        ? t('pay.method.vodafone_note')
                        : t('pay.method.instapay_note')}
                    </div>
                  </button>
                )
              })}
            </div>

            <div className="mt-4">
              <PrimaryButton size="lg" className="w-full" onClick={onBuy} loading={busy}>
                {kind ? t('shoghl.pass.buyWith', { n: price }) : t('shoghl.pass.buy')}
              </PrimaryButton>
            </div>
            {pickHint && (
              <div
                role="alert"
                className="mt-2 text-center font-body text-13 font-semibold"
                style={{ color: 'var(--err-text)' }}
              >
                {t('shoghl.pass.pick')}
              </div>
            )}
            <div className="mt-2 text-center font-body text-13" style={{ color: 'var(--muted)' }}>
              {t('shoghl.pass.transfer.note')}
            </div>
          </>
        )}

        {error && (
          <div
            role="alert"
            className="mt-4 rounded-16 p-4 font-body text-15 font-semibold"
            style={{ background: '#8E2F1F', color: '#FBF7EF' }}
          >
            {error}
          </div>
        )}
      </section>

      <Footer />
    </main>
  )
}
