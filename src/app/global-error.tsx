'use client'

import './globals.css'
import { themeInitScript } from '@/lib/theme'
import { ErrorView } from '@/components/ErrorView'

/**
 * حدّ الخطأ الأخير — بيشتغل لما الليَاوت الجذري نفسه يقع، فلازم يرسم
 * `<html>` و`<body>` بنفسه (Next بيستبدل الشجرة كلها هنا).
 *
 * مفيش `CopyProvider` ولا خطوط `next/font` — الاتنين في الليَاوت اللي وقع.
 * `useT` جوه `ErrorView` بترجع للنص الاحتياطي لوحدها، والخطوط بترجع لبدائل
 * النظام من `globals.css`. سكريبت الوضع متكرر هنا علشان مايبقاش فيه وميض
 * أبيض على الوضع الليلي.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="ar" dir="rtl" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <ErrorView error={error} reset={reset} standalone />
      </body>
    </html>
  )
}
