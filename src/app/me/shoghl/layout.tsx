import type { ReactNode } from 'react'
import { FeatureGate } from '@/components/FlagsProvider'

/**
 * «شغلي» ورا نفس مفتاح `/shoghl` بالظبط.
 *
 * ⚠ الصفحة دي **بره** فولدر `/shoghl`، فالـlayout بتاعه مش بيغطيها. لو
 *   المالك قفل طبقة الشغل، كانت بتفضل مفتوحة — الكارت والتعاون واليوم
 *   الثابت كلهم بيقروا من جداول قسم مقفول، وكل روابطها بتودّي على شاشة
 *   «مقفول». الـlayout ده بيخلّي القفل واحد.
 */
export default function MyWorkLayout({ children }: { children: ReactNode }) {
  return <FeatureGate flag="work_sbota">{children}</FeatureGate>
}
