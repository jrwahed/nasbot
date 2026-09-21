'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Logo } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'
import { isLoggedIn } from '@/lib/session'
import { useTheme } from '@/lib/use-theme'
import { useT } from '@/components/CopyProvider'
import { useFlags } from '@/components/FlagsProvider'
import type { FlagKey } from '@/data/flags-fallback'

/**
 * رأس الرئيسية — من design/نسبوط.dc.html:
 * الشعار 34 يمين، «دخول» شمال، حشو 18px 20px 8px.
 *
 * ⚠ **الـnav دي `lg:flex` يعني كمبيوتر بس.** فضلت كده شهور، ونتيجتها إن
 *   اللي على الموبايل ما كانش يقدر يوصل للخريطة ولا القواعد ولا الكباتن
 *   ولا اللعبة — مفيش ولا رابط. دلوقتي فيه زرار قايمة بيفتح **نفس**
 *   الروابط.
 *
 * ⚠ **والروابط دي مصدر واحد (`NAV`) للنسختين.** قبل كده كانت مكتوبة
 *   مرتين — مرة في الـnav ومرة في `MOBILE_LINKS` — وكل مفتاح ميزة متعلّم
 *   بفلتر يدوي منفصل. يعني أي رابط جديد لازم يتضاف في مكانين وأي قفل
 *   يتكتب مرتين، وأول واحدة تتنسى بتسيب رابط شغّال لصفحة مقفولة.
 */

/**
 * روابط الهيدر — **المصدر الوحيد**، والنسختين بيلفّوا عليه.
 *
 * `flag` = مفتاح الميزة اللي الصفحة وراه. لو المفتاح مقفول **الرابط
 * ما بيتعرضش أصلًا** — مش بيودّي على شاشة «مقفول». والحارس
 * `scripts/check-nav-flags.mjs` بيفشل البناء لو صفحة ورا `FeatureGate`
 * وراها رابط هنا من غير نفس المفتاح.
 */
const NAV: ReadonlyArray<{
  href: string
  key: string
  flag?: FlagKey
  /** رابط الشغل نهاري بس — الشغل منتج الصبح */
  dayOnly?: boolean
  accent?: boolean
}> = [
  { href: '/', key: 'shared.text.18' },
  { href: '/shoghl', key: 'shoghl.nav', flag: 'work_sbota', dayOnly: true, accent: true },
  { href: '/feed', key: 'feed.nav', flag: 'feed' },
  { href: '/map', key: 'shared.text.17', flag: 'map' },
  { href: '/rules', key: 'shared.text.16' },
  { href: '/captains', key: 'shared.text.15', flag: 'captains' },
  { href: '/game', key: 'game.nav', flag: 'game' },
]

export function Header({
  hideToggle = false,
}: {
  /** مسار /shoghl/* — الوضع النهاري مقفول فمفيش زر تبديل */
  hideToggle?: boolean
}) {
  const t = useT()
  const [theme] = useTheme()
  const [loggedIn, setLoggedIn] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => setLoggedIn(isLoggedIn()), [])
  const flags = useFlags()

  /**
   * الروابط اللي هتتعرض فعلًا — نفس القايمة للنسختين.
   * مفتاح مقفول = الرابط يختفي خالص، مش يودّي على شاشة «مقفول».
   */
  const links = NAV.filter(
    (l) =>
      (!l.flag || (flags[l.flag]?.on ?? true)) &&
      (!l.dayOnly || theme === 'day')
  )

  return (
    <header className="relative flex items-center justify-between gap-4 px-5 pb-2 pt-[18px]">
      <Link href="/" aria-label={t('shared.label.11')}>
        <Logo size={34} />
      </Link>

      <nav className="hidden items-center gap-5 font-body text-16 font-semibold lg:flex">
        {links.map((l) => (
          <Link
            key={l.href}
            href={l.href}
            style={l.accent ? { color: 'var(--accent-text)' } : undefined}
          >
            {t(l.key)}
          </Link>
        ))}
      </nav>

      <div className="flex items-center gap-1">
        {!hideToggle && <ThemeToggle />}
        <Link
          href={loggedIn ? '/me' : '/login'}
          className="grid min-h-[44px] place-items-center px-2 font-body text-16 font-semibold"
          style={{ color: 'var(--fg)' }}
        >
          {loggedIn ? t('shared.myProfile') : t('shared.label.12')}
        </Link>

        {/* زرار القايمة — موبايل وتابلت بس */}
        <button
          type="button"
          onClick={() => setMenuOpen((v) => !v)}
          aria-expanded={menuOpen}
          aria-label={t('shared.menu')}
          className="grid min-h-[44px] min-w-[44px] place-items-center lg:hidden"
          style={{ color: 'var(--fg)' }}
        >
          <span aria-hidden="true" className="flex flex-col gap-[5px]">
            <span style={{ width: 20, height: 2, background: 'currentColor' }} />
            <span style={{ width: 20, height: 2, background: 'currentColor' }} />
            <span style={{ width: 20, height: 2, background: 'currentColor' }} />
          </span>
        </button>
      </div>

      {menuOpen && (
        <nav
          className="absolute inset-x-0 top-full z-30 flex flex-col px-5 pb-4 pt-1 lg:hidden"
          style={{ background: 'var(--bg)', borderBottom: '2px solid var(--line)' }}
          aria-label={t('shared.menu')}
        >
          {links.map((l) => (
            <Link
              key={l.href}
              href={l.href}
              onClick={() => setMenuOpen(false)}
              className="flex min-h-[48px] items-center font-body text-18 font-semibold"
              style={{ color: l.accent ? 'var(--accent-text)' : 'var(--fg)' }}
            >
              {t(l.key)}
            </Link>
          ))}
        </nav>
      )}
    </header>
  )
}

/**
 * رأس الصفحات الداخلية — من الملف:
 * «← رجوع» شمال والشعار 22 يمين، حشو 14px 20px 8px.
 */
export function InnerHeader({
  back,
  href = '/',
  padded = true,
  onBack,
  hideToggle = false,
}: {
  /** لو مااتبعتش بياخد «رجوع» من النصوص */
  back?: string
  href?: string
  /** الصفحات اللي فيها حشو أفقي أصلًا (زي 8 و11) مش محتاجة حشو زيادة */
  padded?: boolean
  /** لو موجودة بتشتغل بدل الرابط — زي الرجوع لسؤال قبله في اللعبة */
  onBack?: () => void
  /** مسار /shoghl/* — الوضع النهاري مقفول فمفيش زر تبديل */
  hideToggle?: boolean
}) {
  const t = useT()
  const backClass =
    'grid min-h-[44px] place-items-center font-body text-16 font-semibold'
  return (
    <div
      className={`flex items-center justify-between gap-4 pb-2 pt-[14px] ${
        padded ? 'px-5' : ''
      }`}
    >
      {onBack ? (
        <button
          type="button"
          onClick={onBack}
          className={`${backClass} cursor-pointer border-0 bg-transparent p-0`}
          style={{ color: 'var(--fg)' }}
        >
          ← {back ?? t('shared.back')}
        </button>
      ) : (
        <Link href={href} className={backClass} style={{ color: 'var(--fg)' }}>
          ← {back ?? t('shared.back')}
        </Link>
      )}
      <div className="flex items-center gap-1">
        {!hideToggle && <ThemeToggle />}
        <Link href="/" aria-label={t('shared.label.11')}>
          <Logo size={22} />
        </Link>
      </div>
    </div>
  )
}
