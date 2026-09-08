import type { MetadataRoute } from 'next'
import { siteUrl } from './sitemap'

/**
 * robots.txt — الموقع العام مفتوح، واللوحة والمسارات الخاصة مقفولة.
 * الـ noindex نفسه بيتحط كمان كرأس X-Robots-Tag في next.config.mjs،
 * علشان ما نضطرش نلمس ملفات /admin.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: ['/admin', '/admin/', '/api/', '/me', '/me/', '/my/', '/not-found'],
      },
    ],
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  }
}
