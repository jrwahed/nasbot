'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { Logo } from '@/components/Logo'
import { ThemeToggle } from '@/components/ThemeToggle'
import { isLoggedIn } from '@/lib/session'
import { useT } from '@/components/CopyProvider'

/**
 * رأس الرئيسية — من design/نسبوط.dc.html:
 * الشعار 34 يمين، «دخول» شمال، حشو 18px 20px 8px.
 * على الكمبيوتر بتظهر الروابط: الجدول · الخريطة · القواعد · الكباتن.
 */
export function Header() {
  const t = useT()
  const [loggedIn, setLoggedIn] = useState(false)
  useEffect(() => setLoggedIn(isLoggedIn()), [])

  return (
    <header className="flex items-center justify-between gap-4 px-5 pb-2 pt-[18px]">
      <Link href="/" aria-label={t('shared.label.11')}>
        <Logo size={34} />
      </Link>

      <nav className="hidden items-center gap-5 font-body text-16 font-semibold lg:flex">
        <Link href="/">{t('shared.text.18')}</Link>
        <Link href="/map">{t('shared.text.17')}</Link>
        <Link href="/rules">{t('shared.text.16')}</Link>
        <Link href="/captains">{t('shared.text.15')}</Link>
      </nav>

      <div className="flex items-center gap-1">
        <ThemeToggle />
        <Link
          href={loggedIn ? '/me' : '/login'}
          className="grid min-h-[44px] place-items-center px-2 font-body text-16 font-semibold"
          style={{ color: 'var(--fg)' }}
        >
          {loggedIn ? t('shared.myProfile') : t('shared.label.12')}
        </Link>
      </div>
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
}: {
  /** لو مااتبعتش بياخد «رجوع» من النصوص */
  back?: string
  href?: string
  /** الصفحات اللي فيها حشو أفقي أصلًا (زي 8 و11) مش محتاجة حشو زيادة */
  padded?: boolean
  /** لو موجودة بتشتغل بدل الرابط — زي الرجوع لسؤال قبله في اللعبة */
  onBack?: () => void
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
        <ThemeToggle />
        <Link href="/" aria-label={t('shared.label.11')}>
          <Logo size={22} />
        </Link>
      </div>
    </div>
  )
}
