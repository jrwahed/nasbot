import type { Metadata } from 'next'
import { getContentPage } from '@/lib/content'
import { ContentPageView } from '@/components/ContentPageView'
import { contentFallback } from '@/data/content-fallback'

/**
 * عنوان التبويب من القاعدة زي باقي الصفحة — مفيش نص عربي في الملف.
 * المالك يغيّر العنوان من /admin/content ويتغيّر في التبويب كمان.
 */
export async function generateMetadata(): Promise<Metadata> {
  const page = (await getContentPage('terms')) ?? contentFallback.terms
  return { title: page.title }
}

/** المحتوى كله من `content_blocks`، بيتعدّل من /admin/content */
export default async function TermsPage() {
  const page = (await getContentPage('terms')) ?? contentFallback.terms
  return <ContentPageView page={page} />
}
