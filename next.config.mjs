/** @type {import("next").NextConfig} */

// نطاق التخزين في سوبابيس — بيتقرا من نفس المتغير اللي الكود بيستخدمه
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
const supabaseHost = (() => {
  try {
    return new URL(supabaseUrl).hostname
  } catch {
    return ''
  }
})()

const isDev = process.env.NODE_ENV === 'development'

/**
 * سياسة المحتوى (CSP).
 *
 * كل توجيه هنا مبني على استخدام حقيقي في الكود — مش نسخ من مثال:
 *
 * - script-src: 'unsafe-inline' لازم لأن `src/app/layout.tsx` بيحقن سكريبت
 *   الوضع (themeInitScript) جوه <head> قبل أول رسم، وكمان لأن Next بتحط
 *   حمولة RSC في وسوم <script> مضمّنة. من غير nonce (وده محتاج middleware
 *   مش من ملفاتي) الـ 'unsafe-inline' مفيش منه فكاك.
 *   'unsafe-eval' في التطوير بس — react-refresh بيحتاجه، والإنتاج لأ.
 * - style-src: 'unsafe-inline' لأن Tailwind/Next بيحقنوا ستايل مضمّن،
 *   و framer-motion بتكتب style مباشرة على العناصر.
 * - font-src 'self' data: — الخطوط (Rubik و IBM Plex Sans Arabic) بتتحمّل
 *   بـ next/font/google، يعني بتتنزّل وقت البناء وبتتقدّم من نفس النطاق تحت
 *   /_next/static/media. مفيش أي طلب لـ fonts.googleapis.com أو
 *   fonts.gstatic.com وقت التشغيل — فمش هنفتحهم.
 * - img-src: التخزين في سوبابيس + data: (html-to-image بيولّد data URI
 *   لكارت النتيجة) + blob:.
 * - connect-src: سوبابيس على https، و wss: للريل-تايم (اشتراك الشات في
 *   src/lib/api.ts عبر postgres_changes) — من غير wss الشات بيموت في سكات.
 *   data: و blob: لأن صفحة النتيجة بتعمل fetch على data URL.
 *   في التطوير بنفتح ws://localhost علشان HMR.
 * - frame-ancestors 'none' + frame-src 'none' — الموقع مفيهوش iframes ولا
 *   المفروض حد يحطه في iframe.
 */
const csp = [
  "default-src 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "frame-src 'none'",
  "form-action 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.supabase.co",
  "font-src 'self' data:",
  "media-src 'self' data: blob: https://*.supabase.co",
  "worker-src 'self' blob:",
  "manifest-src 'self'",
  [
    "connect-src 'self' data: blob:",
    'https://*.supabase.co',
    'wss://*.supabase.co',
    isDev ? 'ws://localhost:* http://localhost:*' : '',
  ]
    .filter(Boolean)
    .join(' '),
  ...(isDev ? [] : ['upgrade-insecure-requests']),
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: csp },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-DNS-Prefetch-Control', value: 'on' },
  {
    key: 'Permissions-Policy',
    // مفيش كاميرا ولا ميكروفون ولا موقع في الموقع — نقفلهم كلهم
    value: [
      'accelerometer=()',
      'autoplay=()',
      'camera=()',
      'display-capture=()',
      'encrypted-media=()',
      'fullscreen=(self)',
      'geolocation=()',
      'gyroscope=()',
      'magnetometer=()',
      'microphone=()',
      'midi=()',
      'payment=()',
      'usb=()',
    ].join(', '),
  },
]

const nextConfig = {
  reactStrictMode: true,
  // البناء بيستخدم مجلد تاني علشان ما يضربش سيرفر التطوير وهو شغال
  distDir: process.env.NEXT_DIST_DIR || '.next',

  images: {
    remotePatterns: [
      // نطاق المشروع الحالي لو المتغير موجود، وإلا أي مشروع سوبابيس
      {
        protocol: 'https',
        hostname: supabaseHost || '*.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
      {
        protocol: 'https',
        hostname: '*.supabase.co',
        pathname: '/storage/v1/object/sign/**',
      },
    ],
  },

  async headers() {
    return [
      {
        source: '/:path*',
        headers: securityHeaders,
      },
      {
        // اللوحة ممنوعة على محركات البحث — من غير ما نلمس ملفات /admin نفسها
        source: '/admin/:path*',
        headers: [
          { key: 'X-Robots-Tag', value: 'noindex, nofollow, noarchive, nosnippet' },
        ],
      },
      {
        // صفحات العضو الخاصة كمان مش المفروض تتفهرس
        source: '/me/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
      {
        source: '/my/:path*',
        headers: [{ key: 'X-Robots-Tag', value: 'noindex, nofollow' }],
      },
    ]
  },
}

export default nextConfig
