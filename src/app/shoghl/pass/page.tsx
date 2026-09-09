'use client'

import { useEffect, useState } from 'react'
import { InnerHeader } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { Sticker } from '@/components/Sticker'
import { PrimaryButton } from '@/components/Buttons'
import { PassCard } from '@/components/work/PassCard'
import { getMyActivePass, getWorkSettings } from '@/lib/api'
import { workFaq } from '@/data/lists'
import { isLoggedIn } from '@/lib/session'
import type { PassKind, WorkPass, WorkSettings } from '@/types'
import { useT } from '@/components/CopyProvider'

/**
 * /shoghl/pass — الشرح، الكارتين، 3 أسئلة، وزر «اشتري الكارت».
 * المرحلة 2: الشراء بيعرض تعليمات التحويل اليدوي (نفس الرقمين من settings)
 * بس رفع صورة التحويل لكارت بيتفعّل في المرحلة 3 — الزر معطّل ومكتوب عليه «قريبًا».
 * مفيش وعد كاذب: النص بيقول إن الكارت بيتفعّل بعد ما نتأكد من التحويل.
 */
export default function PassPage() {
  const t = useT()
  const [settings, setSettings] = useState<WorkSettings | null>(null)
  const [pass, setPass] = useState<WorkPass | null>(null)
  const [kind, setKind] = useState<PassKind | null>(null)
  const [buying, setBuying] = useState(false)
  const [pickHint, setPickHint] = useState(false)

  useEffect(() => {
    let alive = true
    Promise.all([getWorkSettings(), isLoggedIn() ? getMyActivePass() : Promise.resolve(null)]).then(
      ([s, p]) => {
        if (!alive) return
        setSettings(s)
        setPass(p)
      }
    )
    return () => {
      alive = false
    }
  }, [])

  if (!settings) {
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
  const onBuy = () => {
    if (!kind) {
      setPickHint(true)
      return
    }
    setPickHint(false)
    setBuying(true)
  }

  return (
    <main className="mx-auto w-full max-w-page pb-6">
      <div className="px-5">
        <InnerHeader back={t('shoghl.back')} href="/shoghl" padded={false} hideToggle />
      </div>

      <div className="px-5 pt-[10px]">
        <h1 className="m-0 font-display text-30 font-black leading-[1.15]">{t('shoghl.pass.page.title')}</h1>
        <div className="mt-1 font-body text-16" style={{ color: 'var(--muted)' }}>
          {t('shoghl.pass.page.sub')}
        </div>
      </div>

      {pass && (
        <div className="px-5 pt-4">
          <div className="rounded-16 p-4 font-body text-15 font-semibold" style={{ background: '#EFE3CF', color: '#14161A' }}>
            {t('shoghl.pass.mine', { n: pass.sessionsLeft })}
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
          onSelect={() => setKind('four')}
          rotate={-3}
        />
        <PassCard
          kind="eight"
          price={settings.pass8Price}
          weeks={settings.pass8Weeks}
          singlePrice={settings.singlePrice}
          selected={kind === 'eight'}
          onSelect={() => setKind('eight')}
          rotate={3}
        />
      </div>

      {/* ===== بيشتغل إزاي ===== */}
      <section className="px-5 pt-8">
        <h2 className="m-0 font-display text-24 font-black leading-[1.15]">{t('shoghl.pass.how.title')}</h2>
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
        <h2 className="m-0 font-display text-24 font-black leading-[1.15]">{t('shoghl.pass.faq.title')}</h2>
        <div className="mt-3 flex flex-col gap-3">
          {workFaq.map((f) => (
            <div key={f.q} className="rounded-20 p-[18px]" style={{ background: '#EFE3CF', color: '#14161A' }}>
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

      {/* ===== الشراء — تحويل يدوي ===== */}
      <section className="px-5 pt-8">
        {!buying ? (
          <>
            <PrimaryButton size="lg" className="w-full" onClick={onBuy}>
              {kind ? t('shoghl.pass.buyWith', { n: price }) : t('shoghl.pass.buy')}
            </PrimaryButton>
            {pickHint && (
              <div role="alert" className="mt-2 text-center font-body text-13 font-semibold" style={{ color: 'var(--err-text)' }}>
                {t('shoghl.pass.pick')}
              </div>
            )}
          </>
        ) : (
          <div className="rounded-20 p-5" style={{ background: '#EFE3CF', color: '#14161A' }}>
            <div className="font-display text-20 font-black">{t('shoghl.pass.transfer.title', { n: price })}</div>
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="rounded-16 p-4 text-center" style={{ background: '#FBF7EF' }}>
                <div className="font-body text-14" style={{ color: '#55575C' }}>{t('pay.method.vodafone')}</div>
                <div className="mt-1 font-display text-24 font-black" dir="ltr">{settings.vodafoneNumber}</div>
              </div>
              <div className="rounded-16 p-4 text-center" style={{ background: '#FBF7EF' }}>
                <div className="font-body text-14" style={{ color: '#55575C' }}>{t('pay.method.instapay')}</div>
                <div className="mt-1 font-display text-24 font-black" dir="ltr">{settings.instapayHandle}</div>
              </div>
            </div>
            <p className="mb-0 mt-4 font-body text-15 font-semibold">{t('shoghl.pass.transfer.note')}</p>
            <div className="mt-4 flex items-center gap-3">
              <button
                type="button"
                disabled
                aria-disabled
                className="min-h-[50px] flex-1 cursor-not-allowed rounded-14 border-0 font-display text-16 font-black opacity-50"
                style={{ background: '#14161A', color: '#FBF7EF' }}
              >
                {t('shoghl.pass.transfer.upload')}
              </button>
              <Sticker color="cobalt" rotate={-3} size="sm">
                {t('shoghl.cta.soon')}
              </Sticker>
            </div>
            <div className="mt-3 font-body text-14" style={{ color: '#55575C' }}>
              {t('shoghl.pass.transfer.soon', { single: settings.singlePrice })}
            </div>
          </div>
        )}
      </section>

      <Footer />
    </main>
  )
}
