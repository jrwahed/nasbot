'use client'

import { useState } from 'react'
import Link from 'next/link'
import { PhotoPlaceholder } from '@/components/PhotoPlaceholder'
import { CaptainTile } from '@/components/CaptainCard'
import { Sticker } from '@/components/Sticker'
import { captains } from '@/data/captains'
import { homeRuleStickers, lastFriday, quote } from '@/data/lists'
import { subscribeSchedule } from '@/lib/api'
import { useTheme } from '@/lib/use-theme'
import { LaptopSmallIcon } from '@/components/work/WorkIcons'
import { useT } from '@/components/CopyProvider'

/**
 * شريط «الشغل» في الرئيسية — نهاري بس. سطر واحد وزر «خد يومك» → /shoghl.
 * رملي بزوايا 16 زي صندوق الضمان، والزر برتقالي بنفس مقاس زر البطاقة.
 */
export function WorkStrip({ className = '' }: { className?: string }) {
  const t = useT()
  const [theme] = useTheme()
  if (theme !== 'day') return null
  return (
    <section
      className={`flex items-center justify-between gap-3 rounded-16 p-4 ${className}`}
      style={{ background: '#EFE3CF', color: '#14161A' }}
      aria-label={t('shoghl.nav')}
    >
      <div className="flex min-w-0 items-center gap-3">
        <span
          className="grid shrink-0 place-items-center rounded-12"
          style={{ width: 40, height: 40, background: '#F4632A' }}
        >
          <LaptopSmallIcon size={22} />
        </span>
        <div className="min-w-0">
          <div className="font-display text-18 font-black leading-[1.15]">{t('shoghl.strip.title')}</div>
          <div className="font-body text-14" style={{ color: '#55575C' }}>{t('shoghl.strip.sub')}</div>
        </div>
      </div>
      <Link
        href="/shoghl"
        className="grid min-h-[48px] shrink-0 place-items-center rounded-14 px-5 font-display text-18 font-black leading-none"
        style={{ background: '#F4632A', color: '#14161A' }}
      >
        {t('shoghl.strip.cta')}
      </Link>
    </section>
  )
}

/**
 * «اللي حصل الجمعة اللي فاتت» — من الملف:
 * العنوان بهامش 20 والشريط بيمرّر من الحرف للحرف،
 * كل صورة 240 مربعة بزوايا 18، والتوقيع مايل -6 تحت الشمال.
 */
export function LastFriday() {
  const t = useT()
  return (
    <section className="pt-9">
      <h2 className="mx-5 my-0 font-display text-26 font-black leading-[1.15]">{t('home.text.13')}</h2>
      <div className="nb-scroll-x gap-3 px-5 pt-4">
        {lastFriday.map((f) => (
          <div key={f.sign} className="relative shrink-0" style={{ width: 240 }}>
            <PhotoPlaceholder
              label={f.img}
              className="w-full"
              style={{ borderRadius: 18, padding: 20 }}
            />
            <span
              className="absolute font-body text-15 italic"
              style={{
                bottom: 12,
                left: 14,
                color: '#14161A',
                transform: 'rotate(-6deg)',
              }}
            >
              {f.sign}
            </span>
          </div>
        ))}
      </div>
      <div className="mx-5 mt-[14px] text-17">
        {quote.text}{' '}
        <span className="font-semibold" style={{ color: 'var(--accent-text)' }}>
          {quote.by}
        </span>
      </div>
    </section>
  )
}

/** الكباتن — شبكة عمودين، من الملف */
export function Captains() {
  const t = useT()
  return (
    <section className="px-5 pt-9">
      <h2 className="m-0 font-display text-26 font-black leading-[1.15]">{t('home.text.12')}</h2>
      <div className="mt-4 grid grid-cols-2 gap-4">
        {captains.map((c) => (
          <CaptainTile key={c.id} captain={c} />
        ))}
      </div>
    </section>
  )
}

/** «قواعدنا في سطرين» — 4 ستيكرات بألوانها ودورانها من الملف */
export function RulesStrip() {
  const t = useT()
  return (
    <section className="px-5 pt-9">
      <h2 className="m-0 font-display text-26 font-black leading-[1.15]">{t('home.text.11')}</h2>
      <div className="mt-4 flex flex-wrap gap-x-[10px] gap-y-3">
        {homeRuleStickers.map((s) => (
          <Sticker
            key={s.label}
            color={s.color}
            rotate={s.rotate}
            fontSize={15}
            padding="8px 16px"
          >
            {s.label}
          </Sticker>
        ))}
      </div>
      <Link
        href="/rules"
        className="mt-2 inline-flex min-h-[44px] items-center font-body text-16 font-semibold underline"
        style={{ color: 'var(--accent-text)' }}
      >{t('home.text.10')}</Link>
    </section>
  )
}

/** «مش فاضي الأسبوع ده؟» — صندوق رملي فيه حقل الموبايل وزر واتساب */
export function ScheduleBox() {
  const t = useT()
  const [phone, setPhone] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 11) {
      setError(t('home.label.2'))
      return
    }
    setError('')
    await subscribeSchedule(digits)
    setSent(true)
  }

  return (
    <section
      className="mx-5 mt-9 rounded-20 p-5"
      style={{ background: '#EFE3CF', color: '#14161A' }}
    >
      <h2 className="m-0 font-display text-24 font-black leading-[1.15]">{t('home.text.9')}</h2>
      <div className="mt-1 font-body text-14" style={{ color: '#55575C' }}>{t('home.text.8')}</div>

      {sent ? (
        <div
          role="status"
          className="mt-[14px] rounded-14 p-3 font-body text-15 font-semibold"
          style={{ background: '#FBF7EF', color: '#14161A' }}
        >{t('home.text.7')}</div>
      ) : (
        <form onSubmit={submit}>
          <input
            dir="ltr"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="01x xxxx xxxx"
            aria-label={t('home.label.1')}
            className="mt-[14px] w-full px-[14px] font-body text-18 font-semibold outline-none"
            style={{
              boxSizing: 'border-box',
              border: `2px solid ${error ? '#8E2F1F' : '#14161A'}`,
              borderRadius: 14,
              background: '#FBF7EF',
              minHeight: 50,
              textAlign: 'right',
              color: '#14161A',
            }}
          />
          {error && (
            <div
              role="alert"
              className="mt-1 font-body text-13 font-semibold"
              style={{ color: 'var(--err-text)' }}
            >
              {error}
            </div>
          )}
          <button
            type="submit"
            className="mt-[10px] w-full cursor-pointer rounded-14 border-0 font-display text-16 font-black"
            style={{ background: '#14161A', color: '#FBF7EF', minHeight: 50 }}
          >{t('home.text.6')}</button>
        </form>
      )}
    </section>
  )
}
