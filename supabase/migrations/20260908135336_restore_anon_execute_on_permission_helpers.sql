-- تراجع عن جزء من هجرة lock_down_new_definer_functions.
--
-- سحبت EXECUTE على fn_is_admin و fn_admin_role و fn_has_permission من anon
-- عشان تحذير من المدقّق. بس دي غلطة: سياسات RLS كتير بتنادي الدوال دي،
-- وسياسة الزائر بتتنفّذ **بصلاحيات الزائر نفسه** — فبقى أي قراءة عامة
-- بترجّع «permission denied for function fn_is_admin» بدل النتيجة.
-- كسر ده تصفّح الموقع للزوار بالكامل.
--
-- الدوال دي أصلًا آمنة للزائر: auth.uid() بتبقى null، فبترجّع false.
-- التحذير كان شكلي، والكسر كان حقيقي.

grant execute on function public.fn_is_admin() to anon, authenticated;
grant execute on function public.fn_admin_role() to anon, authenticated;
grant execute on function public.fn_has_permission(text) to anon, authenticated;;
