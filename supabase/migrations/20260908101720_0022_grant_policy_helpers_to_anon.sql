-- سياسات RLS بتتنفذ بصلاحية الدور اللي بيستعلم. الدوال المساعدة اللي جوه
-- السياسات لازم تبقى قابلة للتنفيذ من anon كمان، وإلا الزائر غير المسجل
-- هيقع بخطأ صلاحية وهو بيفتح الصفحة الرئيسية.
-- كلها آمنة: بترجّع false/null للزائر.
grant execute on function fn_is_admin()                 to anon;
grant execute on function fn_my_captain_id()            to anon;
grant execute on function fn_is_my_sbota_revealed(uuid) to anon;
grant execute on function fn_is_room_member(uuid)       to anon;
grant execute on function fn_is_mutual(uuid)            to anon;;
