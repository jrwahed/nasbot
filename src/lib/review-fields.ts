/**
 * أسئلة التقييم — المفتاح الثابت والعمود في القاعدة.
 *
 * ⚠ **كان بيتحفظ بالنص العربي كمفتاح.** `submitReview` كانت بتعمل
 *    `r['السبوطة']` و`r['الكابتن']`، والأسئلة نفسها مكتوبة في
 *    `src/data/bookings.ts` (ملف بيانات عرض). يعني أول ما حد يغيّر كلمة في
 *    السؤال — أو يترجمه، أو يشيل «الكابتن» اللي اتشال من المنتج أصلًا —
 *    كل الدرجات بتتحفظ **`null`** والتقييم بيتبعت وشكله اتسجّل.
 *
 *    نفس الباج الصامت اللي في الخريطة بالظبط: مطابقة على نص معروض بدل
 *    مفتاح ثابت.
 *
 * ⚠ اسم العمود `score_captain` سايبينه زي ما هو عن قصد — تغيير اسم عمود
 *    فيه بيانات مش مستاهل، والمفتاح والنص المعروض بقوا مستقلين عنه.
 */
export interface ReviewField {
  /** المفتاح الثابت — ده اللي بيتخزّن في حالة الصفحة */
  key: string
  /** مفتاح النص في `copy_strings` */
  copy: string
  /** العمود في `reviews` — null يعني بيتحسب (`will_rebook`) */
  col: 'score_sbota' | 'score_captain' | 'score_venue' | 'score_group' | null
}

export const REVIEW_FIELDS: readonly ReviewField[] = [
  { key: 'sbota', copy: 'review.q.sbota', col: 'score_sbota' },
  // «الكابتن» اتشال من المنتج في ٢٠٢٦-٠٩-١٢ — اللي ماسك المجموعة بقى
  // «صاحب الخروجة»، وهو عضو زي أي حد.
  { key: 'host', copy: 'review.q.host', col: 'score_captain' },
  { key: 'venue', copy: 'review.q.venue', col: 'score_venue' },
  { key: 'group', copy: 'review.q.group', col: 'score_group' },
  { key: 'again', copy: 'review.q.again', col: null },
] as const

/** درجة «هتحجز تاني» من كام تتحسب «أيوه» */
export const REBOOK_MIN = 4
