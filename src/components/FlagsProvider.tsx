'use client'

import { createContext, useContext, type ReactNode } from 'react'
import Link from 'next/link'
import { Logo } from '@/components/Logo'
import { flagsFallback, type FeatureFlag, type FlagMap } from '@/data/flags-fallback'
import { useT } from '@/components/CopyProvider'

/**
 * مفاتيح المزايا في الواجهة — نفس نمط `CopyProvider` بالظبط.
 *
 * `src/app/layout.tsx` بيقرا `feature_flags` على الخادم مرة واحدة (كاش موسوم
 * في `src/lib/flags.ts`) وبيمررها هنا، فأي مكوّن عميل بيسأل `useFlag('map')`
 * من الذاكرة على طول — من غير أي نداء شبكة.
 *
 * الاحتياطي مفتوح: مفتاح مش موجود = الميزة شغّالة.
 */

const FlagsContext = createContext<FlagMap>(flagsFallback)

export function FlagsProvider({ value, children }: { value: FlagMap; children: ReactNode }) {
  return <FlagsContext.Provider value={value}>{children}</FlagsContext.Provider>
}

/** `useFlag('booking').on` — استعملها لما عايز تخفي زرار جوه صفحة شغالة. */
export function useFlag(key: string): FeatureFlag {
  const map = useContext(FlagsContext)
  return map[key] ?? flagsFallback[key] ?? { on: true, off: '' }
}

/**
 * شاشة «مقفول» — علامة الاستفهام ورسالة اللوحة وزرار رجوع.
 * الرسالة نفسها جاية من `feature_flags.off_message_ar` (أو الاحتياطي)،
 * فمفيش نص عربي مكتوب هنا — الباقي كله من `copy_strings` عبر `t()`.
 */
export function ClosedScreen({ message }: { message: string }) {
  const t = useT()

  return (
    <main className="mx-auto w-full max-w-page px-5 pb-16">
      <div className="flex items-center justify-between gap-4 pb-2 pt-[14px]">
        <Link
          href="/"
          className="grid min-h-[44px] place-items-center font-body text-16 font-semibold"
          style={{ color: 'var(--fg)' }}
        >
          {t('shared.text.25')}
        </Link>
        <Logo size={22} />
      </div>

      <div className="grid place-items-center pt-10">
        <span
          role="img"
          aria-label={t('flags.closed.mark')}
          className="grid place-items-center font-display font-black leading-none"
          style={{
            width: 96,
            height: 96,
            borderRadius: 24,
            background: '#F4632A',
            color: '#14161A',
            fontSize: 62,
            transform: 'skewX(-6deg) rotate(-18deg)',
          }}
        >
          {t('shared.text.24')}
        </span>
      </div>

      <h1 className="mt-8 text-center font-display text-30 font-black leading-[1.15]">
        {t('flags.closed.title')}
      </h1>

      <p
        className="mx-auto mt-4 max-w-[420px] text-center font-body text-17 leading-[1.7]"
        style={{ color: 'var(--muted)' }}
      >
        {message || t('flags.closed.body')}
      </p>
    </main>
  )
}

/**
 * غلاف الصفحة: لو المفتاح مقفول بتظهر شاشة «مقفول» بدل المحتوى.
 * الحماية دي واجهة بس — القاعدة هي اللي بتمنع الكتابة فعلًا (RLS).
 */
export function FeatureGate({ flag, children }: { flag: string; children: ReactNode }) {
  const f = useFlag(flag)
  if (f.on) return <>{children}</>
  return <ClosedScreen message={f.off} />
}
