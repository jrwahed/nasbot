import type { TrackEvent } from '@/types'

/**
 * التحليلات — بتروح لـ`dataLayer` بتاع Google Tag Manager (`Gtm.tsx`).
 * في GTM كل واحدة بتبان كـ«Custom Event» باسمها (`open_card` · `click_ana_gai` …)
 * والخصائص جنبها كمتغيّرات. لو GTM مش متحمّل (اللوحة · مانع إعلانات) بتتحط
 * في المصفوفة وخلاص — مفيش حاجة بتقع.
 *
 * ⚠ متبعتش هنا اسم ولا تليفون ولا إيميل — GTM بيبعت لجوجل كل اللي فيها.
 */
export function track(event: TrackEvent, props: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return
  const w = window as unknown as { dataLayer?: Record<string, unknown>[] }
  w.dataLayer = w.dataLayer || []
  w.dataLayer.push({ event, ...props })
  if (process.env.NODE_ENV === 'development') {
    // eslint-disable-next-line no-console
    console.log('[nasbot]', event, props)
  }
}
