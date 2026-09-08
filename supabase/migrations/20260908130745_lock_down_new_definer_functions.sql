-- بوستجرس بيدي EXECUTE لـ PUBLIC لوحده على أي دالة جديدة،
-- فالدوال اللي اتعملت بعد التقفيلة الأولى رجعت مفتوحة تاني.

-- دالة التريجر — مالهاش أي لزمة تتنادى من الويب أصلًا
revoke execute on function public.fn_copy_history() from public, anon, authenticated;

-- دوال الصلاحيات: بترجّع false للزائر على أي حال، بس مفيش سبب يقدر يناديها
revoke execute on function public.fn_admin_role() from public, anon;
revoke execute on function public.fn_is_admin() from public, anon;
revoke execute on function public.fn_has_permission(text) from public, anon;

-- المسجّلين محتاجينها علشان اللوحة تعرف تعرض الأقسام الصح
grant execute on function public.fn_admin_role() to authenticated;
grant execute on function public.fn_is_admin() to authenticated;
grant execute on function public.fn_has_permission(text) to authenticated;;
