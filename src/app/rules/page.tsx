'use client'

import { InnerHeader } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { Sticker } from '@/components/Sticker'
import { GuaranteeBox } from '@/components/WhoBooked'
import { fiveRules, guaranteeText, emergencyPhone } from '@/data/lists'
import { useT } from '@/components/CopyProvider'

/** القواعد والضمان — «الثقة قبل الفسحة» */
export default function RulesPage() {
  const t = useT()
  return (
    <main className="mx-auto w-full max-w-page">
      <div className="px-5">
        <InnerHeader back={t('rules.label.1')} padded={false} />

        <h1 className="mb-0 mt-[10px] font-display text-40 font-black leading-[1.1]">{t('rules.text.9')}</h1>
        <p className="mb-0 mt-2 text-17">{t('rules.text.8')}</p>

        {/* ===== القواعد الخمس ===== */}
        <div className="mt-8 flex flex-col gap-4">
          {fiveRules.map((r) => (
            <div
              key={r.n}
              className="flex gap-4 rounded-20 p-5"
              style={{ background: '#EFE3CF', color: '#14161A' }}
            >
              <span className="font-display text-40 font-black leading-none">
                {r.n}
              </span>
              <div className="min-w-0">
                <div className="font-display text-20 font-black">{r.title}</div>
                <div className="mt-1 font-body text-15">{r.body}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ===== الضمان ===== */}
        <h2 className="mt-10 font-display text-26 font-black">{t('rules.text.7')}</h2>
        <div className="mt-3">
          <GuaranteeBox text={guaranteeText} />
        </div>

        {/* ===== بنات بس ===== */}
        <div
          className="mt-6 rounded-20 p-5"
          style={{ background: '#2B4CFF', color: '#FBF7EF' }}
        >
          <Sticker color="cream" rotate={-3} size="sm">{t('rules.text.6')}</Sticker>
          <div className="mt-3 font-body text-16">{t('rules.text.5')}</div>
        </div>

        {/* ===== الطوارئ ===== */}
        <h2 className="mt-10 font-display text-26 font-black">{t('rules.text.4')}</h2>
        <div className="mt-1 font-body text-16" style={{ color: 'var(--muted)' }}>{t('rules.text.3')}</div>
        <a
          href={`tel:${emergencyPhone}`}
          className="mt-4 grid w-full place-items-center rounded-16 font-display text-20 font-black"
          style={{ background: '#8E2F1F', color: '#FBF7EF', minHeight: 58 }}
        >{t('rules.text.2')}</a>

        <div
          className="mt-8 rounded-16 p-4 text-center font-body text-15 font-semibold"
          style={{ background: 'var(--surface)' }}
        >{t('rules.text.1')}</div>
      </div>

      <Footer />
    </main>
  )
}
