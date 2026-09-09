'use client'

import { Suspense } from 'react'
import { useParams, useSearchParams } from 'next/navigation'
import { WorkPayFlow } from '@/components/work/WorkPayFlow'

/**
 * دفع سبوطة الشغل — ?payWith=single|first_time.
 * أي قيمة تانية (أو مفيش) = يوم واحد. الخادم بيتحقق من «أول مرة» بنفسه.
 */
function WorkPayInner() {
  const params = useParams<{ slug: string }>()
  const search = useSearchParams()
  const payWith = search.get('payWith') === 'first_time' ? 'first_time' : 'single'
  return <WorkPayFlow slug={params.slug} payWith={payWith} />
}

export default function WorkPayPage() {
  return (
    <Suspense fallback={null}>
      <WorkPayInner />
    </Suspense>
  )
}
