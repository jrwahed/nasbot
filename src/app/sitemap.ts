import type { MetadataRoute } from 'next'

/**
 * أصل الموقع. الترتيب: متغير صريح ← دومين الإنتاج من Vercel ← التطوير.
 * من غير سلاش في الآخر.
 */
export function siteUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.APP_URL ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL
      ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
      : '') ||
    'http://localhost:3000'
  return raw.replace(/\/+$/, '')
}

/**
 * الصفحات العامة الثابتة بس.
 *
 * مستبعد عن قصد:
 *  - /admin/*            لوحة التحكم
 *  - /api/*              مسارات خادم
 *  - /me و /my/*         صفحات العضو الخاصة
 *  - /game/result        نتيجة شخصية، مالهاش معنى من غير جلسة
 *  - /not-found          مسار للقطات والاختبارات
 *  - /s/[slug] و /captain/[sbotaId]  ديناميكية من القاعدة — مش بنستدعي
 *    سوبابيس وقت البناء علشان البناء ما يفشلش من غير مفاتيح. لو حبينا
 *    نضيفهم بعدين، ده المكان.
 */
const routes: Array<{
  path: string
  changeFrequency: MetadataRoute.Sitemap[number]['changeFrequency']
  priority: number
}> = [
  { path: '/', changeFrequency: 'daily', priority: 1 },
  { path: '/one', changeFrequency: 'daily', priority: 0.9 },
  { path: '/map', changeFrequency: 'daily', priority: 0.8 },
  { path: '/game', changeFrequency: 'monthly', priority: 0.8 },
  { path: '/s/mystery', changeFrequency: 'weekly', priority: 0.7 },
  { path: '/captains', changeFrequency: 'weekly', priority: 0.6 },
  { path: '/join', changeFrequency: 'monthly', priority: 0.6 },
  { path: '/rules', changeFrequency: 'yearly', priority: 0.4 },
]

export default function sitemap(): MetadataRoute.Sitemap {
  const base = siteUrl()
  const lastModified = new Date()

  return routes.map((r) => ({
    url: `${base}${r.path}`,
    lastModified,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }))
}
