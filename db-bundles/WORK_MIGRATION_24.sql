-- ============================================================================
-- WORK_MIGRATION_24.sql — أسئلة التقييم
--
-- ⚠ الدرجات كانت بتتحفظ بمفتاح هو **النص العربي** للسؤال، والأسئلة مكتوبة
--    في ملف بيانات عرض. أول ما حد يغيّر كلمة، كل الدرجات تتحفظ `null`
--    والتقييم يتبعت وشكله اتسجّل. بقى مفتاح ثابت والنص في `copy_strings`.
--
-- ومعاه: «الكابتن» اتشال من المنتج وفضل سؤال في التقييم — بقى «صاحب الخروجة».
--
-- بعده شغّل: select * from test_review_keys();  — التلاتة «نجح».
-- ============================================================================

-- ############################################################################
-- # 20260920180000_0103_review_keys.sql
-- ############################################################################

-- ============================================================================
-- 0103 — أسئلة التقييم: نص من القاعدة، ومفتاح ثابت للتخزين
--
-- ⚠ **الدرجات كانت بتتحفظ بمفتاح هو النص العربي.** `submitReview` كانت
--    بتعمل `r['السبوطة']` و`r['الكابتن']`، والأسئلة نفسها مكتوبة في
--    `src/data/bookings.ts` — ملف بيانات عرض. يعني أول ما حد يغيّر كلمة في
--    السؤال، كل الدرجات بتتحفظ **`null`** والتقييم بيتبعت وشكله اتسجّل.
--    نفس الباج الصامت اللي كان في الخريطة: مطابقة على نص معروض.
--
-- وكمان: «الكابتن» اتشال من المنتج في ٢٠٢٦-٠٩-١٢، وفضل سؤال في التقييم.
-- في خروجة عضو مفيش كابتن أصلًا — بقى «صاحب الخروجة».
--
-- العمود `score_captain` سايبينه زي ما هو: تغيير اسم عمود فيه بيانات مش
-- مستاهل، والمفتاح والنص بقوا مستقلين عنه.
-- ============================================================================

insert into copy_strings (key, value_ar) values
  ('review.q.sbota','السبوطة'),
  ('review.q.host','صاحب الخروجة'),
  ('review.q.venue','المكان'),
  ('review.q.group','المجموعة'),
  ('review.q.again','هتحجز تاني خلال شهر؟')
on conflict (key) do update set value_ar = excluded.value_ar;

-- ===== دالة الاختبار =====
create or replace function test_review_keys()
returns table (test text, result text)
language plpgsql security definer set search_path = public
as $body$
declare n int;
begin
  test := '0103 · نصوص أسئلة التقييم الخمسة في القاعدة';
  select count(*) into n from copy_strings where key like 'review.q.%';
  if n >= 5 then result := 'نجح';
  else result := format('فشل — %s من ٥ · الناقص هيظهر مفتاحه للعضو', n); end if;
  return next;

  test := '0103 · «الكابتن» اتشال من أسئلة التقييم';
  if exists (select 1 from copy_strings where key like 'review.q.%' and value_ar like '%كابتن%')
    then result := 'فشل — الكابتن اتشال من المنتج وفضل في التقييم';
    else result := 'نجح'; end if;
  return next;

  test := '0103 · أعمدة الدرجات لسه موجودة';
  select count(*) into n from information_schema.columns
   where table_name='reviews'
     and column_name in ('score_sbota','score_captain','score_venue','score_group','will_rebook');
  if n = 5 then result := 'نجح';
  else result := format('فشل — %s عمود من ٥', n); end if;
  return next;
end $body$;

revoke execute on function test_review_keys() from public, anon, authenticated;
