-- ============================================================================
-- 0055 — إخفاء payout_method عن العالم (S5)
--
-- المشكلة: captains_read كانت using (is_active or fn_is_admin()) — الجدول كله
-- مفتوح لأي زائر، وفيه payout_method jsonb (طريقة استلام فلوس الكابتن) و
-- profile_id. يعني:
--   curl ".../rest/v1/captains?select=payout_method,profile_id" -H "apikey: $ANON"
-- بيرجّع بيانات الدفع لكل الكباتن. تسريب مالي لطرف تالت.
--
-- الحل: عرض captains_public بالأعمدة الآمنة بس (زي sbotat_public)، وترفع القراية
-- عن الجدول نفسه لـ fn_is_admin().
--   • العرض **مش** security_invoker — بيتنفّذ بصلاحية صاحبه (postgres) فبيتخطّى
--     RLS المشدود على الجدول، بس بيطلّع الأعمدة الآمنة بس ولـ is_active بس.
--   • payout_method و profile_id **مش موجودين** في العرض خالص.
--
-- ⚠️ تغيير كود مطلوب من مالك src (مش من هجرتي): getCaptains / getCaptain في
--    src/lib/api.ts (سطر ~211 و ~220) بيقروا من .from('captains'). لازم يتغيّروا
--    لـ .from('captains_public'). الأعمدة اللي بيختاروها
--    (id, bio_line, activities, display_name, craft_ar, photo_path) كلها موجودة
--    في العرض بنفس الأسماء، فتغيير اسم الجدول بس كفاية.
-- ============================================================================

-- ===== العرض العام — أعمدة آمنة بس، والنشطين بس =====
drop view if exists captains_public;
create view captains_public as
select
  c.id,
  c.display_name,
  c.craft_ar,
  c.bio_line,
  c.photo_path,
  c.activities,
  c.rating_avg,
  c.sbota_count
from captains c
where c.is_active;

comment on view captains_public is
  'كارت الكابتن العام — من غير payout_method ولا profile_id. النشطين بس. مصدر القراية العامة (getCaptains/getCaptain) المفروض ياخد منه.';

grant select on captains_public to anon, authenticated;

-- ===== شدّ قراية الجدول نفسه على الإدارة =====
drop policy if exists captains_read on captains;
create policy captains_read on captains for select
  using (fn_is_admin());
