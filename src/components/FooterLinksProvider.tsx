'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { contentFallback } from '@/data/content-fallback'
import type { ContentPage } from '@/types'

/**
 * محتوى الصفحات — بيتحمّل مرة واحدة على الخادم في `layout.tsx` وبيتمرر هنا،
 * **نفس نمط `CopyProvider` و`FlagsProvider`** بالحرف.
 *
 * ليه مزوّد بدل ما كل صفحة تقرا بنفسها؟ لأن الذيل وصندوق الضمان بيتستعملوا
 * جوه صفحات عميل (`/me` · `/s/[slug]/pay` · `/shoghl/*`)، فما ينفعش يعملوا
 * قراية غير متزامنة. وكمان علشان **نفس النص** يطلع في كل مكان: القواعد
 * الخمسة وصندوق الضمان بيظهروا في صفحة الحجز وصفحة الدفع كمان مش في
 * `/rules` بس — لو كل واحد قرا من مصدر تاني، المالك يعدّل من اللوحة
 * ويلاقي نص قديم لسه واقف في نص الموقع.
 *
 * الاحتياطي من `content-fallback.ts` — القاعدة وقعت = النص القديم، مش فراغ.
 */

export interface FooterLink {
  href: string
  label: string
}

type ContentMap = Record<string, ContentPage>

const Ctx = createContext<ContentMap>(contentFallback)

export function FooterLinksProvider({
  value,
  children,
}: {
  value: ContentMap
  children: ReactNode
}) {
  return (
    <Ctx.Provider value={Object.keys(value).length ? value : contentFallback}>
      {children}
    </Ctx.Provider>
  )
}

/** صفحة محتوى كاملة بالـslug */
export function useContentPage(slug: string): ContentPage | null {
  const map = useContext(Ctx)
  return map[slug] ?? contentFallback[slug] ?? null
}

/** روابط الذيل — الصفحات النشطة اللي ليها اسم */
export function useFooterLinks(): FooterLink[] {
  const map = useContext(Ctx)
  const links = Object.values(map)
    .filter((p) => p.footerLabel)
    .map((p) => ({ href: `/${p.slug}`, label: p.footerLabel }))
  if (links.length) return links
  return Object.values(contentFallback)
    .filter((p) => p.footerLabel)
    .map((p) => ({ href: `/${p.slug}`, label: p.footerLabel }))
}

/**
 * فقرة بمرجعها الثابت — `useContentRef('guarantee')` بترجّع نص الضمان.
 * ده اللي بيخلّي صندوق الضمان واحد في كل الموقع.
 */
export function useContentRef(ref: string): string {
  const map = useContext(Ctx)
  for (const page of Object.values(map)) {
    const hit = page.blocks.find((b) => b.ref === ref)
    if (hit) return hit.body
  }
  for (const page of Object.values(contentFallback)) {
    const hit = page.blocks.find((b) => b.ref === ref)
    if (hit) return hit.body
  }
  return ''
}

/** القواعد المرقّمة — بتظهر في /rules وفي صفحة السبوطة وسبوطة الشغل */
export function useNumberedRules(): Array<{ n: number; title: string; body: string }> {
  const page = useContentPage('rules')
  const src = page ?? contentFallback.rules
  return src.blocks
    .filter((b) => b.kind === 'numbered')
    .map((b, i) => ({ n: i + 1, title: b.heading, body: b.body }))
}
