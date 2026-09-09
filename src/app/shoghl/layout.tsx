import type { ReactNode } from 'react'
import { WorkShell } from '@/components/work/WorkShell'
import { FeatureGate } from '@/components/FlagsProvider'

/**
 * مسار /shoghl/* كله جوه غلاف واحد — الوضع النهاري مقفول من غير حفظ،
 * والتنقل بين صفحات الشغل ما بيرجّعش الوضع القديم في النص.
 *
 * وكمان: مفتاح «work_sbota» من /admin/settings بيقفل الطبقة كلها هنا —
 * مكان واحد بدل خمس صفحات (مراجعة A2).
 */
export default function ShoghlLayout({ children }: { children: ReactNode }) {
  return (
    <WorkShell>
      <FeatureGate flag="work_sbota">{children}</FeatureGate>
    </WorkShell>
  )
}
