/**
 * رابط نداء «يلا» — **مصدر واحد** للمتصفح والخادم، زي `sbota-link.ts` بالظبط.
 *
 * الشكل: slug القالب + أول ٨ حروف من رقم النداء → `/yalla/padel-9b1799bc`.
 *
 * ⚠ ليه نفس النمط مش حاجة جديدة: `/s/<slug>` لوحده كان بيفتح الخروجة الغلط
 *   لما يبقى فيه اتنين من نفس القالب (٢٠٢٦-٠٩-٣٠). ونفس المشكلة بالحرف
 *   هتحصل في «يلا» أول ما ينزل نداءين «بادل» — فبناخد نفس الحل من أول يوم،
 *   **وبنفس الدالة الشكل** علشان الاتنين ما يفترقوش.
 *
 * ⚠ والقاعدة بتبني نفس اللينك جوه `fn_yalla_tell` علشان يحطه في الإيميل
 *   (`left(replace(id::text,'-',''), 8)`). لو غيّرت الشكل هنا، غيّره هناك.
 */

const SUFFIX = /^(.+)-([0-9a-f]{8})$/

/** أول ٨ حروف من رقم النداء من غير الشرط */
const idHead = (id: string) => id.replace(/-/g, '').slice(0, 8).toLowerCase()

/** رابط نداء بعينه. من غير رقم بيرجّع slug القالب زي ما هو. */
export function yallaLink(slug: string, id: string | null | undefined): string {
  if (!slug || !id) return slug
  return `${slug}-${idHead(id)}`
}

/** الرقم من الرابط — null لو الرابط مش على الشكل ده */
export function yallaIdHead(link: string): string | null {
  return SUFFIX.exec(link)?.[2] ?? null
}

/**
 * بيلاقي النداء من الرابط جوه قايمة جاهزة.
 *
 * ⚠ النداء مش ليه فيو عام زي `sbotat_public`، والفيد بيرجّع كل النداءات
 *   الشغّالة مرة واحدة — فالمطابقة بتحصل في المتصفح من غير طلب تاني.
 *   ومفيش «أقرب نداء» احتياطي: لينك نداء خلص بيقول «مش موجود» بدل ما يفتح
 *   نداء تاني مكانه (زي `resolveSbotaLink` بالظبط).
 */
export function findByLink<T extends { callId: string; slug: string }>(
  link: string,
  list: T[]
): T | null {
  const head = yallaIdHead(link)
  if (head) return list.find((x) => idHead(x.callId) === head) ?? null
  // لينك قديم من غير لاحقة: أقرب نداء من نفس القالب
  return list.find((x) => x.slug === link) ?? null
}
