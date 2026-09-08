import type { TrackEvent } from '@/types'

/**
 * التحليلات — دلوقتي بتطبع في الـ console بس.
 * لما نوصّل خدمة تحليلات حقيقية، الدالة دي هي اللي هتتغير.
 */
export function track(event: TrackEvent, props: Record<string, unknown> = {}) {
  if (typeof window === 'undefined') return
  // eslint-disable-next-line no-console
  console.log('[nasbot]', event, props)
}
