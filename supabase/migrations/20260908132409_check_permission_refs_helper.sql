-- حارس: أي سياسة بتنادي fn_has_permission بمفتاح مش موجود في admin_permissions
-- بتبقى مقفولة على الكل من غير ما حد ياخد باله — لأن الدالة بترجّع false
-- لأي مفتاح مش معروف. الغلطة دي حصلت فعلًا مع notifications.send.
--
-- الدالة دي بترجّع المفاتيح المكسورة، وscripts/check-admin.ts بيفشل لو رجّعت أي حاجة.
-- مفتاح الخدمة بس هو اللي بيناديها.

create or replace function public.check_permission_refs()
returns table (key text, problem text)
language sql
stable
security definer
set search_path to 'public'
as $$
  with refs as (
    select distinct (regexp_matches(
        coalesce(qual, '') || ' ' || coalesce(with_check, ''),
        'fn_has_permission\(''([a-z_.]+)''', 'g'))[1] as key
    from pg_policies where schemaname = 'public'
  )
  select r.key,
         case
           when not exists (select 1 from admin_permissions p where p.key = r.key)
             then 'مفتاح مش موجود في admin_permissions'
           else 'مفتاح مش متربط بأي دور في role_permissions'
         end
  from refs r
  where not exists (select 1 from admin_permissions p where p.key = r.key)
     or not exists (select 1 from role_permissions rp where rp.permission_key = r.key)
$$;

revoke execute on function public.check_permission_refs() from public, anon, authenticated;;
