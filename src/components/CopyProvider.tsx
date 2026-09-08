'use client'

import { createContext, useContext, type ReactNode } from 'react'
import { copyFallback } from '@/data/copy-fallback'

/**
 * نصوص الموقع بتتحمّل مرة واحدة على الخادم وبتتمرر هنا،
 * فـ t() في أي مكوّن عميل بتقرا من الذاكرة على طول — من غير أي نداء شبكة.
 */

type CopyMap = Record<string, string>

const CopyContext = createContext<CopyMap>(copyFallback)

export function CopyProvider({
  value,
  children,
}: {
  value: CopyMap
  children: ReactNode
}) {
  return <CopyContext.Provider value={value}>{children}</CopyContext.Provider>
}

/**
 * t('join.heading.1') → النص.
 * لو المفتاح ناقص بترجّع النص الاحتياطي، وبعده المفتاح نفسه —
 * يعني نص ناقص ما بيكسرش الصفحة.
 *
 * المتغيرات: t('done.title', { name: 'أحمد' }) بتستبدل {{name}}.
 */
export function useT() {
  const map = useContext(CopyContext)

  return function t(key: string, vars?: Record<string, string | number>): string {
    let s = map[key] ?? copyFallback[key] ?? key

    if (vars) {
      for (const [k, v] of Object.entries(vars)) {
        s = s.split(`{{${k}}}`).join(String(v))
      }
    }
    return s
  }
}

/** نسخة للاستعمال بره React (نادرة) */
export function tStatic(map: CopyMap, key: string) {
  return map[key] ?? copyFallback[key] ?? key
}
