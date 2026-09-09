import type { Metadata, Viewport } from 'next'
import { Rubik, IBM_Plex_Sans_Arabic } from 'next/font/google'
import './globals.css'
import { themeInitScript } from '@/lib/theme'
import { LiveQ } from '@/components/LiveQ'
import { CopyProvider } from '@/components/CopyProvider'
import { FlagsProvider } from '@/components/FlagsProvider'
import { getCopy } from '@/lib/copy'
import { getFlags } from '@/lib/flags'

const rubik = Rubik({
  subsets: ['arabic', 'latin'],
  weight: ['700', '900'],
  variable: '--font-rubik',
  display: 'swap',
  adjustFontFallback: false,
  fallback: ['Segoe UI', 'Tahoma', 'system-ui', 'sans-serif'],
})

const plex = IBM_Plex_Sans_Arabic({
  subsets: ['arabic', 'latin'],
  weight: ['400', '600'],
  variable: '--font-plex',
  display: 'swap',
  adjustFontFallback: false,
  fallback: ['Segoe UI', 'Tahoma', 'system-ui', 'sans-serif'],
})

export const metadata: Metadata = {
  title: 'نسبوط — نادي خروجات في القاهرة',
  description: 'نادي خروجات في القاهرة. مفيش عضوية. 8 بس. لما تكمل تكمل.',
  manifest: '/manifest.webmanifest',
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // النصوص ومفاتيح المزايا بيتحمّلوا مرة واحدة على الخادم بكاش موسوم،
  // وبيتمرروا للعميل — نفس النمط للاتنين (مراجعة A2)
  const [copy, flags] = await Promise.all([getCopy(), getFlags()])

  return (
    // data-theme بيتحط بسكريبت قبل الترطيب — الفرق ده مقصود
    <html
      lang="ar"
      dir="rtl"
      className={`${rubik.variable} ${plex.variable}`}
      suppressHydrationWarning
    >
      <head>
        {/* الوضع بيتظبط قبل أول رسم — من غير وميض */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        <CopyProvider value={copy}>
          <FlagsProvider value={flags}>
            {children}
            <LiveQ />
          </FlagsProvider>
        </CopyProvider>
      </body>
    </html>
  )
}
