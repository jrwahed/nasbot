/**
 * رابط السبوطة — **مصدر واحد** للمتصفح والخادم.
 *
 * ⚠ `sbotat_public.slug` هو slug **القالب** مش السبوطة. فلما يبقى فيه سبوطتين
 *   مفتوحتين من نفس القالب («بادل» السبت و«بادل» السبت اللي بعده) الاتنين
 *   كان ليهم نفس الرابط، و`getSbota` بتفتح الأقرب — يعني كارت التانية بيفتح
 *   الأولى، والحاجز بيدفع على الخروجة الغلط. ظهرت فعلًا ٢٠٢٦-٠٩-٢٧.
 *
 * دلوقتي الرابط = slug القالب + أول ٨ حروف من رقم السبوطة:
 *   `/s/padel-9b1799bc`
 * والرابط القديم (`/s/padel`) لسه شغّال — بيفتح أقرب واحدة مفتوحة، علشان
 * أي لينك اتوزّع قبل كده ما يقعش.
 *
 * ⚠ سبوطات الشغل **ما بتاخدش** اللاحقة عن قصد: `/shoghl/<slug>` معناه «يوم
 *   الشغل الجاي في المكان ده»، مش يوم بعينه.
 */

const SUFFIX = /^(.+)-([0-9a-f]{8})$/

/** أول ٨ حروف من رقم السبوطة من غير الشرط */
const idHead = (id: string) => id.replace(/-/g, '').slice(0, 8).toLowerCase()

/** رابط سبوطة بعينها. من غير رقم بيرجّع slug القالب زي ما هو. */
export function sbotaLink(slug: string, id: string | null | undefined): string {
  if (!slug || !id) return slug
  return `${slug}-${idHead(id)}`
}

export interface LinkRow {
  id: string
  status?: string | null
  starts_at?: string | null
}

/**
 * بيلاقي السبوطة من الرابط. `bySlug` بتجيب كل سبوطات قالب واحد مرتّبة
 * بالميعاد (من `sbotat_public`) — المتصفح بعميله والخادم بعميل الخدمة.
 */
export async function resolveSbotaLink<T extends LinkRow>(
  link: string,
  bySlug: (slug: string) => Promise<T[]>
): Promise<T | null> {
  const m = SUFFIX.exec(link)
  if (m) {
    const rows = await bySlug(m[1])
    const hit = rows.find((r) => idHead(r.id) === m[2])
    if (hit) return hit
    // رابط سبوطة بعينها ومش لاقيينها في قالبها (اتلغت أو خلصت) — مش بنفتح
    // سبوطة تانية مكانها. إلا لو ده أصلًا slug قالب بيخلص بشكل شبه اللاحقة.
    if (rows.length) return null
  }
  // الرابط القديم: أقرب واحدة مفتوحة للحجز، وإلا أقرب واحدة وخلاص
  const rows = await bySlug(link)
  return rows.find((r) => r.status === 'open' || r.status === 'full') ?? rows[0] ?? null
}
