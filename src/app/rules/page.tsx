import type { Metadata } from 'next'
import { getContentPage } from '@/lib/content'
import { ContentPageView } from '@/components/ContentPageView'
import { EmergencyBlock } from '@/components/EmergencyBlock'
import { contentFallback } from '@/data/content-fallback'

/** عنوان التبويب من القاعدة — مفيش نص عربي في الملف */
export async function generateMetadata(): Promise<Metadata> {
  const page = (await getContentPage('rules')) ?? contentFallback.rules
  return { title: page.title }
}

/**
 * القواعد والضمان — «الثقة قبل الفسحة».
 *
 * القواعد الخمسة والضمان كانوا متحطوطين في `src/data/lists.ts`، يعني
 * المالك مش قادر يعدّلهم من اللوحة (نتيجة مفتوحة في المراجعة). بقوا
 * فقرات في `content_blocks` زي باقي صفحات المحتوى.
 */
export default async function RulesPage() {
  const page = (await getContentPage('rules')) ?? contentFallback.rules
  return (
    <ContentPageView page={page}>
      <EmergencyBlock />
    </ContentPageView>
  )
}
