'use client'

import Script from 'next/script'
import { usePathname } from 'next/navigation'
import { GTM_ID } from '@/lib/gtm'

/**
 * سكريبت Google Tag Manager — الكود الرسمي بتاع جوجل بالحرف.
 *
 * ⚠ **مش بيتحمّل في `/admin`.** GTM بيشغّل أي وسم يتضاف من لوحة جوجل،
 *   وصفحات اللوحة فيها أرقام تليفونات وتحويلات فلوس وجلسة أدمن. سكريبت
 *   طرف تالت هناك = باب مفتوح (§٣.٣).
 * ⚠ الـCSP في `next.config.mjs` فاتح نطاقات GTM وGA4 بس — لو اتضاف من لوحة
 *   جوجل وسم لخدمة تانية (Meta · TikTok) لازم نطاقه يتضاف هناك وإلا بيتمنع.
 */
export function Gtm() {
  const path = usePathname() ?? ''
  if (!GTM_ID || path.startsWith('/admin')) return null
  return (
    <>
      <Script id="gtm" strategy="afterInteractive">
        {`(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${GTM_ID}');`}
      </Script>
      <noscript>
        <iframe
          src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
          height="0"
          width="0"
          style={{ display: 'none', visibility: 'hidden' }}
        />
      </noscript>
    </>
  )
}
