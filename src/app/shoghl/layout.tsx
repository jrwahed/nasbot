import type { ReactNode } from 'react'
import { WorkShell } from '@/components/work/WorkShell'

/**
 * مسار /shoghl/* كله جوه غلاف واحد — الوضع النهاري مقفول من غير حفظ،
 * والتنقل بين صفحات الشغل ما بيرجّعش الوضع القديم في النص.
 */
export default function ShoghlLayout({ children }: { children: ReactNode }) {
  return <WorkShell>{children}</WorkShell>
}
