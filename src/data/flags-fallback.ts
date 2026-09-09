/**
 * مفاتيح المزايا — الاحتياطي.
 *
 * المصدر الحقيقي جدول `feature_flags` في القاعدة (بيتعدّل من /admin/settings
 * ← «مفاتيح المزايا»). الملف ده نفس دور `copy-fallback.ts` بالظبط: لما
 * القاعدة مش متاحة، الموقع يفضل شغّال بدل ما يقفل نفسه بالغلط.
 *
 * ⚠ القاعدة: الاحتياطي **مفتوح** دايمًا. مفتاح مقفول قرار صريح من اللوحة،
 * ومش صح إن غلطة شبكة تقفل قسم على الناس.
 *
 * المفاتيح السبعة دي هي اللي في بذرة الهجرة 0036، وكل واحد فيهم بيقفل مسار
 * موجود فعلًا على الموقع:
 *   booking     → /s/[slug]/pay  ← زرار الحجز في صفحة السبوطة
 *   game        → /game و /game/result
 *   map         → /map
 *   mystery     → /s/mystery
 *   chat        → /my/[bookingId]/chat و /me/chat/[name]
 *   referral    → كرت كود الدعوة في /me
 *   work_sbota  → /shoghl/* كله
 */

export interface FeatureFlag {
  /** مقفول ولا مفتوح */
  on: boolean
  /** الرسالة اللي بتظهر للعضو وهو مقفول — من اللوحة */
  off: string
}

export type FlagKey =
  | 'booking'
  | 'game'
  | 'map'
  | 'mystery'
  | 'chat'
  | 'referral'
  | 'work_sbota'

export type FlagMap = Record<string, FeatureFlag>

export const flagsFallback: FlagMap = {
  booking: { on: true, off: 'الحجز مقفول دلوقتي. ارجعلنا كمان شوية.' },
  game: { on: true, off: 'اللعبة مقفولة دلوقتي. جرب تاني بعدين.' },
  map: { on: true, off: 'الخريطة مقفولة دلوقتي.' },
  mystery: { on: true, off: 'الغامضة راجعة قريب.' },
  chat: { on: true, off: 'الشات مقفول دلوقتي.' },
  referral: { on: true, off: 'الإحالة موقوفة مؤقتًا.' },
  work_sbota: { on: true, off: 'سبوطات الشغل راجعة قريب.' },
}
