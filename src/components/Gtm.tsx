import { GTM_ID } from '@/lib/gtm'

/**
 * Google Tag Manager — كود جوجل الرسمي بالحرف، جوه <head> ومعاه <noscript>
 * أول حاجة في <body>، زي ما لوحة GTM بتطلب.
 *
 * ⚠ **لازم يبقى في الـHTML نفسه** (سكريبت عادي من الخادم) — مش `next/script`.
 *   أول نسخة كانت `next/script` بـ`afterInteractive`، فالكود بيتحط بعد ما
 *   الصفحة تشتغل، وزرار «Test» في لوحة GTM (بيقرا الـHTML الخام) قال
 *   «Your Google tag wasn't detected» (٢٠٢٦-٠٩-٣٠).
 *
 * ⚠ **مش بيشتغل في `/admin`.** GTM بيشغّل أي وسم يتضاف من لوحة جوجل،
 *   وصفحات اللوحة فيها تليفونات وتحويلات فلوس وجلسة أدمن (§٣.٣). الشرط
 *   على `location.pathname` جوه السكريبت نفسه علشان الـlayout يفضل static.
 *
 * ⚠ الـCSP في `next.config.mjs` فاتح GTM وGA4 بس — وسم لخدمة تانية من لوحة
 *   GTM (Meta · TikTok) محتاج نطاقه يتضاف هناك وإلا بيتمنع بالصمت.
 */
const snippet = (id: string) =>
  `if(location.pathname.indexOf('/admin')!==0){` +
  `(function(w,d,s,l,i){w[l]=w[l]||[];w[l].push({'gtm.start':
new Date().getTime(),event:'gtm.js'});var f=d.getElementsByTagName(s)[0],
j=d.createElement(s),dl=l!='dataLayer'?'&l='+l:'';j.async=true;j.src=
'https://www.googletagmanager.com/gtm.js?id='+i+dl;f.parentNode.insertBefore(j,f);
})(window,document,'script','dataLayer','${id}');}`

/** جوه <head> — أعلى حاجة ممكنة */
export function GtmHead() {
  if (!GTM_ID) return null
  return <script dangerouslySetInnerHTML={{ __html: snippet(GTM_ID) }} />
}

/** أول حاجة بعد <body> */
export function GtmBody() {
  if (!GTM_ID) return null
  return (
    <noscript>
      <iframe
        src={`https://www.googletagmanager.com/ns.html?id=${GTM_ID}`}
        height="0"
        width="0"
        style={{ display: 'none', visibility: 'hidden' }}
      />
    </noscript>
  )
}
