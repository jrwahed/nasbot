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
 * المفاتيح دي هي اللي في بذرة الهجرة 0036، وكل واحد فيهم بيقفل مسار
 * موجود فعلًا على الموقع:
 *   booking     → /s/[slug]/pay  ← زرار الحجز في صفحة السبوطة
 *   game        → /game و /game/result
 *   map         → /map
 *   mystery     → /s/mystery
 *   chat        → /my/[bookingId]/chat و /me/chat/[id]
 *   referral    → كرت كود الدعوة في /me
 *   work_sbota  → /shoghl/* كله
 *   member_sbota → /new (العضو بيفتح خروجته) و/me/sbotati
 *   captains    → /captains (0108)
 *   feed        → /feed «اللي بيحصل» (0114)
 *
 * ⚠ القفل بيخفي **الصفحة والرابط اللي بيوديها** مع بعض. الرابط المقفول
 *   ما بيتعرضش أصلًا — مش بيودّي على شاشة «مقفول». الحارس
 *   `scripts/check-nav-flags.mjs` بيفشل البناء لو رابط في القايمة أو
 *   الذيل بيودّي لصفحة ورا مفتاح وهو نفسه مش ورا نفس المفتاح.
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
  | 'member_sbota'
  | 'captains'
  | 'feed'

export type FlagMap = Record<string, FeatureFlag>

export const flagsFallback: FlagMap = {
  booking: { on: true, off: 'الحجز مقفول دلوقتي — بنجهّز خروجات الأسبوع الجاي، ارجعلنا قريب.' },
  game: { on: true, off: 'اللعبة مقفولة دلوقتي — هترجع تشتغل قريب.' },
  map: { on: true, off: 'الخريطة مقفولة دلوقتي — بنحدّثها وترجع قريب.' },
  mystery: { on: true, off: 'الغامضة مقفولة دلوقتي — استنانا، جايالك حاجة حلوة قريب.' },
  chat: { on: true, off: 'الشات مقفول دلوقتي — هيرجع يشتغل قريب.' },
  referral: { on: true, off: 'دعوة أصحابك موقوفة دلوقتي — هترجع قريب.' },
  work_sbota: { on: true, off: 'سبوطات الشغل مقفولة دلوقتي — راجعة قريب.' },
  member_sbota: { on: true, off: 'فتح الخروجات مقفول دلوقتي — هيفتح تاني قريب.' },
  captains: { on: true, off: 'صفحة الكباتن مقفولة دلوقتي. الخروجات بيفتحها الأعضاء بنفسهم — جرّب «افتح خروجة».' },
  feed: { on: true, off: 'الفيد مقفول دلوقتي — هيرجع قريب.' },
}
