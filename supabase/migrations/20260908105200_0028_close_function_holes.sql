-- ⚠ ثغرة حقيقية: الدوال اللي اتعملت في الهجرات الأخيرة رجعت تاخد
-- EXECUTE لـ PUBLIC افتراضيًا. يعني أي زائر يقدر ينادي:
--   job_purge()      → يمسح بيانات
--   fn_reveal(id)    → يكشف المجموعات قبل ميعادها
--   seed_person(...) → يعمل مستخدمين
-- بنقفلهم كلهم دلوقتي.

revoke execute on all functions in schema public from public, anon, authenticated;
grant  execute on all functions in schema public to service_role;

-- المسموح للزائر: مجمّعات بدون هوية بس
grant execute on function fn_who_booked(uuid)           to anon, authenticated;

-- دوال بتستعملها سياسات RLS نفسها — لازم تفضل قابلة للتنفيذ للدورين
grant execute on function fn_is_mutual(uuid)            to anon, authenticated;
grant execute on function fn_is_admin()                 to anon, authenticated;
grant execute on function fn_my_captain_id()            to anon, authenticated;
grant execute on function fn_is_my_sbota_revealed(uuid) to anon, authenticated;
grant execute on function fn_is_room_member(uuid)       to anon, authenticated;

-- المسموح للمسجّل: كلها بتشتغل على auth.uid()
grant execute on function fn_open_one_on_one(uuid)      to authenticated;
grant execute on function fn_sbota_address(uuid)        to authenticated;
grant execute on function fn_soft_delete_profile()      to authenticated;
grant execute on function fn_cancel_booking(uuid, text, text) to authenticated;
grant execute on function fn_can_i_book(uuid)           to authenticated;
grant execute on function fn_can_i_book_mystery()       to authenticated;
grant execute on function fn_is_my_profile_complete()   to authenticated;
grant execute on function fn_group_members(uuid)        to authenticated;
grant execute on function fn_met_before()               to authenticated;

-- أدوات البذور مالهاش لزمة بعد كده
drop function if exists seed_person(uuid, text, text, int, gender_t, area_t, role_t, text, persona_t, social_energy_t);

-- الأرقام الأسبوعية للإدارة بس (بتتقرا من الخادم أو بدور admin)
revoke all on weekly_metrics from anon, authenticated;;
