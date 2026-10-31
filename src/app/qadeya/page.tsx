'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Header } from '@/components/Header'
import { Footer } from '@/components/Footer'
import { useT } from '@/components/CopyProvider'
import { FeatureGate } from '@/components/FlagsProvider'
import { Em } from '@/components/case/Em'
import { CaseArt, WorldMark } from '@/components/case/CaseArt'
import { getPublicCases, type PublicCase } from '@/lib/cases'

/**
 * «قضية الليلة» — الصفحة العامة.
 *
 * طلب المالك (٢٠٢٦-١٠-٣١): «عاوز يبقى ليها صفحة في القايمة، وتقول عشان
 * تشترك في حل القضية اشترك في سبوطة. بس القضية وتفاصيلها كلها مكتوبة.»
 * وبعد ما شافها: «حط رسومات وصور كده من القضية، وروّق الكلام والحروف
 * والخطوط.»
 *
 * 🔴 **«كل التفاصيل» = القصة كاملة، مش الحل.** `fn_cases_public` بترجّع
 *    البلاغ ومسرح الواقعة والمطلوب وبس — مفيش كارت متهم ولا نهايات ولا
 *    تلميحات. والقصة آمنة تتنشر لأن **المتهم مش مكتوب في القضية**: بيتختار
 *    وقت اللعب من إجابات المجموعة نفسها. فاللي قرا «العقد اختفى» ما عرفش
 *    حاجة تنفعه.
 *
 * ⚠ **الرسومات SVG مرسومة بالكود** (`CaseArt`) مش صور — مفيش صور حقيقية
 *   للقضايا، وصورة مخزون = بيانات عرض (§٨). والرسمة بتتاخد بالـ`slug`.
 *
 * ⚠ الصفحة ورا مفتاح `cases` زي كل حاجة في اللعبة، ومدخلها في القايمة
 *   ورا نفس المفتاح (`check-nav-flags.mjs` بيفشل البناء لو اتخالف).
 *
 * ⚠ ولو مفيش ولا قضية نشطة (أو المفتاح اتقفل من القاعدة)، القايمة بتبقى
 *   فاضية والصفحة بتقول كده — مفيش بيانات عرض.
 */

/**
 * ⚠ **الألوان من متغيّرات الثيم** (`globals.css`) مش ثوابت — الموقع له
 *   وضع نهاري وليلي، وأي `#14161A` مكتوب بالإيد بيختفي على الخلفية
 *   الغامقة. اتكشف باللقطة.
 *   الاستثناء: صندوق الـCTA وكارت «المطلوب» — دول **مقلوبين** عن قصد
 *   (برتقالي ثابت ونص كريمي)، فالتباين فيهم واحد في الوضعين.
 */
const FG = 'var(--fg)'
const BG = 'var(--bg)'
const SURFACE = 'var(--surface)'
const LINE = 'var(--line)'
const MUTED = 'var(--muted)'
const HOT = 'var(--accent-text)'
const BLUE = 'var(--logo-stroke)'
/** البرتقالي المصمت — عليه نص كريمي دايمًا، فثابت في الوضعين */
const HOT_SOLID = '#F4632A'
const ON_HOT = '#FBF7EF'

/** عنوان قسم صغير بحروف متباعدة — اللي بيفصل أجزاء الدوسيه */
function Label({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="text-[11px] font-bold tracking-[0.22em]"
      style={{ color: MUTED }}
    >
      {children}
    </div>
  )
}

/** خط فاصل رفيع */
function Rule() {
  return <div className="h-px w-full" style={{ background: LINE }} />
}

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
      className="mt-10 overflow-hidden rounded-20"
      style={{ background: HOT_SOLID, color: ON_HOT }}
    >
      <div className="px-6 py-7 text-center">
        <h2 className="text-[26px] font-bold leading-tight">{t('qadeya.cta.title')}</h2>
        <p className="mx-auto mt-2 max-w-[34ch] text-[16px] leading-relaxed opacity-95">
          {t('qadeya.cta.body')}
        </p>
        <Link
          href="/"
          className="mt-5 inline-block rounded-full px-7 py-3 text-[16px] font-bold"
          style={{ background: '#14161A', color: ON_HOT }}
        >
          {t('qadeya.cta.btn')}
        </Link>
      </div>
    </section>
  )

  return (
    <>
      <Header />
      <main className="mx-auto w-full max-w-page px-5 pb-20">
        {/* ===================== الترويسة ===================== */}
        <header className="mt-7">
          <div className="text-[13px] font-bold tracking-wide" style={{ color: HOT }}>
            {t('qadeya.kicker')}
          </div>
          <h1 className="mt-2 text-[40px] font-bold leading-[1.1]">{t('qadeya.title')}</h1>
          <p className="mt-4 max-w-[46ch] text-[17px] leading-[1.85]" style={{ opacity: 0.88 }}>
            {t('qadeya.lede')}
          </p>
        </header>

        {/* الرسمة الكبيرة تحت الترويسة — العدسة */}
        <div className="mt-6 overflow-hidden rounded-20">
          <CaseArt hero tone="sand" />
        </div>

        {/* ===================== إزاي تتحل ===================== */}
        <section className="mt-12">
          <Label>{t('qadeya.how.title')}</Label>
          <div className="mt-3">
            <Rule />
          </div>
          <ol className="mt-5 space-y-5">
            {['case.how.1', 'case.how.2', 'case.how.3', 'case.how.4', 'case.how.5'].map((k, i) => (
              <li key={k} className="flex gap-4">
                <span
                  className="mt-[3px] grid size-8 shrink-0 place-items-center rounded-full text-[15px] font-bold"
                  style={{ background: HOT_SOLID, color: ON_HOT }}
                >
                  {i + 1}
                </span>
                <span className="text-[16px] leading-[1.9]" style={{ opacity: 0.92 }}>
                  <Em text={t(k)} />
                </span>
              </li>
            ))}
          </ol>
          <p
            className="mt-6 rounded-16 px-4 py-3 text-[15px] font-bold leading-relaxed"
            style={{ background: SURFACE, color: BLUE }}
          >
            {t('case.how.team')}
          </p>
        </section>

        {/* ===================== وبعدين؟ ===================== */}
        <section className="mt-12">
          <Label>{t('qadeya.steps')}</Label>
          <div className="mt-3">
            <Rule />
          </div>
          <ol className="mt-5 space-y-4">
            {['qadeya.step.1', 'qadeya.step.2', 'qadeya.step.3', 'qadeya.step.4', 'qadeya.step.5'].map(
              (k, i) => (
                <li key={k} className="flex items-start gap-3">
                  <span
                    className="mt-[9px] size-2 shrink-0 rounded-full"
                    style={{ background: i === 0 ? HOT_SOLID : MUTED, opacity: i === 0 ? 1 : 0.55 }}
                  />
                  <span className="text-[16px] leading-[1.85]" style={{ opacity: 0.9 }}>
                    {t(k)}
                  </span>
                </li>
              ),
            )}
          </ol>
        </section>

        {cta}

        {/* ===================== القضايا ===================== */}
        <section className="mt-14">
          <Label>{t('qadeya.list')}</Label>
          <div className="mt-3">
            <Rule />
          </div>
          <p className="mt-3 text-[14px] leading-relaxed" style={{ opacity: 0.6 }}>
            {t('qadeya.list.note')}
          </p>

          {cases === null ? null : cases.length === 0 ? (
            <p className="mt-6 text-[15px]" style={{ opacity: 0.6 }}>
              {t('qadeya.empty')}
            </p>
          ) : (
            worlds.map((w) => (
              <section key={w.slug} className="mt-10">
                {/* اسم العالم ووسمه */}
                <div className="flex items-center gap-3">
                  <WorldMark world={w.slug} size={30} />
                  <h3 className="text-[19px] font-bold" style={{ color: BLUE }}>
                    {w.name}
                  </h3>
                </div>
                {w.mood ? (
                  <p
                    className="mt-2 max-w-[48ch] text-[14px] leading-[1.8]"
                    style={{ opacity: 0.7 }}
                  >
                    {w.mood}
                  </p>
                ) : null}

                <div className="mt-5 space-y-6">
                  {w.list.map((c) => (
                    <article
                      key={c.slug}
                      className="overflow-hidden rounded-20"
                      style={{ background: SURFACE, color: FG }}
                    >
                      {/* الرسمة */}
                      <div className="px-5 pt-5">
                        <CaseArt slug={c.slug} world={c.worldSlug} tone="cream" />
                      </div>

                      <div className="px-5 pb-6 pt-5">
                        {/* العنوان ورقم الملف */}
                        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                          <h4 className="text-[23px] font-bold leading-tight">{c.title}</h4>
                          <span
                            className="rounded-full px-3 py-1 text-[12px] font-bold"
                            style={{ background: BG, color: MUTED }}
                          >
                            {t('qadeya.players').replace('{{1}}', String(c.minPlayers))}
                          </span>
                        </div>

                        <div className="mt-4">
                          <Rule />
                        </div>

                        {/* البلاغ */}
                        <div className="mt-4">
                          <Label>{t('qadeya.report')}</Label>
                          <div className="mt-2 space-y-3 text-[16px] leading-[1.9]">
                            {c.report
                              .split('\n')
                              .filter(Boolean)
                              .map((line, i) => (
                                <p key={i}>
                                  <Em text={line} />
                                </p>
                              ))}
                          </div>
                        </div>

                        {/* مسرح الواقعة */}
                        {c.scene ? (
                          <div
                            className="mt-5 rounded-16 border-r-[3px] px-4 py-3"
                            style={{ background: BG, borderColor: HOT_SOLID }}
                          >
                            <Label>{t('qadeya.scene')}</Label>
                            <p
                              className="mt-1.5 text-[15px] leading-[1.85]"
                              style={{ opacity: 0.88 }}
                            >
                              <Em text={c.scene} />
                            </p>
                          </div>
                        ) : null}

                        {/* المطلوب */}
                        {c.goal ? (
                          <div className="mt-4">
                            <Label>{t('qadeya.goal')}</Label>
                            <p
                              className="mt-2 rounded-16 px-4 py-3 text-[16px] font-bold leading-[1.8]"
                              style={{ background: HOT_SOLID, color: ON_HOT }}
                            >
                              <Em text={c.goal} />
                            </p>
                          </div>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            ))
          )}
        </section>

        {cases && cases.length > 0 ? (
          <p
            className="mt-8 rounded-16 px-4 py-3 text-[14px] leading-[1.85]"
            style={{ background: SURFACE, color: MUTED }}
          >
            {t('qadeya.spoiler')}
          </p>
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
