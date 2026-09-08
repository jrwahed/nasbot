-- بوستجرس بيدي EXECUTE لـ PUBLIC افتراضيًا على أي دالة جديدة،
-- فالسحب من anon/authenticated لوحده ما بيعملش حاجة. لازم السحب من PUBLIC.
revoke execute on all functions in schema public from public, anon, authenticated;

-- وكمان نمنع المنح التلقائي لأي دالة تتعمل بعدين
alter default privileges in schema public revoke execute on functions from public;

-- الخادم بياخد كل حاجة
grant execute on all functions in schema public to service_role;

-- ===== المسموح للعميل بس =====
-- كلها بتشتغل على auth.uid() أو بترجّع مجمّعات من غير أي هوية
grant execute on function fn_who_booked(uuid)                 to anon, authenticated;
grant execute on function fn_is_mutual(uuid)                  to authenticated;
grant execute on function fn_open_one_on_one(uuid)            to authenticated;
grant execute on function fn_sbota_address(uuid)              to authenticated;
grant execute on function fn_soft_delete_profile()            to authenticated;
grant execute on function fn_cancel_booking(uuid, text, text) to authenticated;
grant execute on function fn_can_i_book(uuid)                 to authenticated;
grant execute on function fn_can_i_book_mystery()             to authenticated;
grant execute on function fn_is_my_profile_complete()         to authenticated;

-- دوال مساعدة بتستعملها سياسات RLS نفسها — لازم تفضل قابلة للتنفيذ
grant execute on function fn_is_admin()                       to authenticated;
grant execute on function fn_my_captain_id()                  to authenticated;
grant execute on function fn_is_my_sbota_revealed(uuid)       to authenticated;;
