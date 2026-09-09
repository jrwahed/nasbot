'use client'

import { ErrorView } from '@/components/ErrorView'

/**
 * حدّ الخطأ للصفحات — من غيره Next بيعرض «Application error: a client-side
 * exception has occurred» بالإنجليزي للعضو (U2).
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return <ErrorView error={error} reset={reset} />
}
