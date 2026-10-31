'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { useT } from '@/components/CopyProvider'
import { FeatureGate } from '@/components/FlagsProvider'
import { Em } from '@/components/case/Em'
import { getPublicCases, type PublicCase } from '@/lib/cases'

/**
 * «قضية الليلة» — الصفحة العامة.
 *
 * طلب المالك (٢٠٢٦-١٠-٣١): «عاوز يبقى ليها صفحة في القايمة، وتقول عشان
 * تشترك في حل القضية اشترك في سبوطة. بس القضية وتفاصيلها كلها مكتوبة.»
 *
 * 🔴 **«كل التفاصيل» = القصة كاملة، مش الحل.** `fn_cases_public` بترجّع
 *    البلاغ ومسرح الواقعة والمطلوب وبس — مفيش كارت متهم ولا نهايات ولا
 *    تلميحات. والقصة آمنة تتنشر لأن **المتهم مش مكتوب في القضية**: بيتختار
 *    وقت اللعب من إجابات المجموعة نفسها. فاللي قرا «العقد اختفى» ما عرفش
 *    حاجة تنفعه.
 *
 * ⚠ الصفحة ورا مفتاح `cases` زي كل حاجة في اللعبة، ومدخلها في القايمة
 *   ورا نفس المفتاح (`check-nav-flags.mjs` بيفشل البناء لو اتخالف).
 *
 * ⚠ ولو مفيش ولا قضية نشطة (أو المفتاح اتقفل من القاعدة)، القايمة بتبقى
 *   فاضية والصفحة بتقول كده — مفيش بيانات عرض.
 */
function QadeyaInner() {
  const t = useT()
  const [cases, setCases] = useState<PublicCase[] | null>(null)

  useEffect(() => {
    let alive = true
    getPublicCases().then((r) => alive && setCases(r))
    return () => {
      alive = false
    }
  }, [])

  // العوالم بالترتيب اللي جه من القاعدة، وكل عالم وتحته قضاياه
  const worlds: { slug: string; name: string; mood: string; list: PublicCase[] }[] = []
  for (const c of cases ?? []) {
    let w = worlds.find((x) => x.slug === c.worldSlug)
    if (!w) {
      w = { slug: c.worldSlug, name: c.worldName, mood: c.worldMood, list: [] }
      worlds.push(w)
    }
    w.list.push(c)
  }

  const cta = (
    <section
      className="mt-8 rounded-20 px-5 py-6 text-center"
      style={{ background: '#F4632A', color: '#FBF7EF' }}
    >
      <h2 className="text-[24px] font-bold">{t('qadeya.cta.title')}</h2>
      <p className="mt-2 text-[16px] leading-relaxed">{t('qadeya.cta.body')}</p>
      <Link
        href="/"
        className="mt-4 inline-block rounded-full px-6 py-3 text-[16px] font-bold"
        style={{ background: '#14161A', color: '#FBF7EF' }}
      >
        {t('qadeya.cta.btn')}
      </Link>
    </section>
  )

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-page px-5 pb-16">
        <div className="mt-6 text-[13px]" style={{ color: '#F4632A' }}>
          {t('qadeya.kicker')}
        </div>
        <h1 className="mt-1 text-[34px] font-bold leading-tight">{t('qadeya.title')}</h1>
        <p className="mt-3 text-[17px] leading-relaxed">{t('qadeya.lede')}</p>

        {/* ===== إزاي تتحل — نفس النصوص اللي في الدوسيه بالظبط ===== */}
        <h2 className="mt-8 text-[20px] font-bold">{t('qadeya.how.title')}</h2>
        <ol className="mt-3 space-y-3">
          {['case.how.1', 'case.how.2', 'case.how.3', 'case.how.4', 'case.how.5'].map((k, i) => (
            <li key={k} className="flex gap-3 text-[16px] leading-relaxed">
              <span
                className="grid size-7 shrink-0 place-items-center rounded-full text-[14px] font-bold"
                style={{ background: '#EFE3CF', color: '#14161A' }}
              >
                {i + 1}
              </span>
              <span><Em text={t(k)} /></span>
            </li>
          ))}
        </ol>
        <p className="mt-3 text-[15px] font-bold" style={{ color: '#2B4CFF' }}>
          {t('case.how.team')}
        </p>

        {/* ===== وبعدين؟ — خطوات المشاركة ===== */}
        <h2 className="mt-8 text-[20px] font-bold">{t('qadeya.steps')}</h2>
        <ol className="mt-3 space-y-2">
          {['qadeya.step.1', 'qadeya.step.2', 'qadeya.step.3', 'qadeya.step.4', 'qadeya.step.5'].map(
            (k, i) => (
              <li key={k} className="text-[16px] leading-relaxed">
                <span className="font-bold" style={{ color: '#F4632A' }}>
                  {i + 1}.{' '}
                </span>
                {t(k)}
              </li>
            ),
          )}
        </ol>

        {cta}

        {/* ===== القضايا ===== */}
        <h2 className="mt-10 text-[20px] font-bold">{t('qadeya.list')}</h2>
        <p className="mt-1 text-[14px] opacity-70">{t('qadeya.list.note')}</p>

        {cases === null ? null : cases.length === 0 ? (
          <p className="mt-4 text-[15px] opacity-70">{t('qadeya.empty')}</p>
        ) : (
          worlds.map((w) => (
            <section key={w.slug} className="mt-7">
              <h3 className="text-[18px] font-bold">{w.name}</h3>
              {w.mood ? (
                <p className="mt-1 text-[14px] leading-relaxed opacity-75">{w.mood}</p>
              ) : null}

              <div className="mt-3 space-y-3">
                {w.list.map((c) => (
                  <article
                    key={c.slug}
                    className="rounded-20 p-5"
                    style={{ background: '#EFE3CF', color: '#14161A' }}
                  >
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <h4 className="text-[20px] font-bold">{c.title}</h4>
                      <span className="text-[13px] opacity-70">
                        {t('qadeya.players').replace('{{1}}', String(c.minPlayers))}
                      </span>
                    </div>

                    <div className="mt-3 text-[12px] tracking-[0.18em] opacity-60">
                      {t('qadeya.report')}
                    </div>
                    <div className="mt-1 space-y-2 text-[16px] leading-relaxed">
                      {c.report
                        .split('\n')
                        .filter(Boolean)
                        .map((line, i) => (
                          <p key={i}><Em text={line} /></p>
                        ))}
                    </div>

                    {c.scene ? (
                      <>
                        <div className="mt-3 text-[12px] tracking-[0.18em] opacity-60">
                          {t('qadeya.scene')}
                        </div>
                        <p className="mt-1 text-[15px] leading-relaxed opacity-90">
                          <Em text={c.scene} />
                        </p>
                      </>
                    ) : null}

                    {c.goal ? (
                      <>
                        <div className="mt-3 text-[12px] tracking-[0.18em] opacity-60">
                          {t('qadeya.goal')}
                        </div>
                        <p
                          className="mt-1 rounded-16 p-3 text-[16px] font-bold leading-relaxed"
                          style={{ background: '#FBF7EF' }}
                        >
                          <Em text={c.goal} />
                        </p>
                      </>
                    ) : null}
                  </article>
                ))}
              </div>
            </section>
          ))
        )}

        {cases && cases.length > 0 ? (
          <p className="mt-5 text-[14px] leading-relaxed opacity-70">{t('qadeya.spoiler')}</p>
        ) : null}

        {cta}
      </main>
      <Footer />
    </>
  )
}

export default function QadeyaPage() {
  return (
    <FeatureGate flag="cases">
      <QadeyaInner />
    </FeatureGate>
  )
}
