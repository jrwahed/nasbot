import type { Metadata } from 'next'
import { getContentPage } from '@/lib/content'
import { ContentPageView } from '@/components/ContentPageView'
import { EmergencyBlock } from '@/components/EmergencyBlock'
import { contentFallback } from '@/data/content-fallback'

/** عنوان التبويب من القاعدة زي باقي الصفحة — مفيش نص عربي في الملف */
export async function generateMetadata(): Promise<Metadata> {
  const page = (await getContentPage('aman')) ?? contentFallback.aman
  return { title: page.title }
}

/**
 * «إزاي بنأمّنك» — الرد على «رايحة فين ومع مين؟».
 *
 * كل فقرة فيها بتوصف حاجة **شغّالة في القاعدة فعلًا**: التحويل بيتراجع
 * بالإيد (`fn_approve_transfer`) · العنوان للي دفع بس (`fn_sbota_address`)
 * · الكشف (`fn_reveal`) · الشات الخاص بالتبادل (`fn_pair_want`) · قفل
 * الشات بالكرون · البلاغ (`reports`) · السن (`fn_can_book` من `settings`).
 *
 * ⚠ ما تكتبش هنا وعد الموقع مش منفّذه. لو اتغيّر حارس في القاعدة، الفقرة
 *   اللي بتتكلم عنه تتغيّر معاه من `/admin/content`.
 *
 * ومعاها زرار الطوارئ — نفس المكوّن اللي في `/rules`، وبيخفي نفسه لو
 * الرقم في `settings` لسه وهمي.
 */
export default async function AmanPage() {
  const page = (await getContentPage('aman')) ?? contentFallback.aman
  return (
    <ContentPageView page={page}>
      <EmergencyBlock />
    </ContentPageView>
  )
}
