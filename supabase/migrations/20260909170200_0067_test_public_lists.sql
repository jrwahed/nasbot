-- ============================================================================
-- 0067 — دالة اختبار قوايم التسجيل والخريطة (0065 · 0066)
--
--   select * from test_public_lists();
--
-- كل الصفوف لازم تقول «نجح». أي «فشل» ابعتلي السطر بالحرف.
--
-- الاختبار هنا **سلوكي مش شكلي**: بيلبس دور الزائر المجهول (anon) فعلًا
-- ويجرّب يقرا — لأن «السياسة موجودة» ما يعنيش «الزائر بيشوف». وبيتأكد كمان
-- إن الزائر **مش** شايف venues (مكان الخروجة لازم يفضل مخفي لحد الحجز).
--
-- ⚠ الدالة دي **security invoker** عن قصد، مش definer زي test_review_fixes:
-- بوستجرس بيرفض `set role` جوه دالة definer («cannot set parameter role
-- within security-definer function»)، ومن غير `set role` مفيش اختبار سلوكي
-- أصلًا. التنفيذ مسحوب من public/anon/authenticated تحت، فبتتشغّل من محرر
-- SQL (دور postgres) بس.
-- ============================================================================

create or replace function test_public_lists()
returns table (test text, result text)
language plpgsql
set search_path = public
as $$
declare
  n  int;
  me text := current_user;
begin
  -- ===== 0065 — قوايم التسجيل =====
  test := '0065 · مناطق التسجيل الستة كلها موجودة ونشطة';
  select count(*) into n from field_options
   where field_key = 'area' and is_active
     and value in ('التجمع','المعادي','زايد-أكتوبر',
                   'مصر الجديدة-مدينة نصر','وسط-زمالك','غير كده');
  if n = 6 then result := 'نجح — ٦ مناطق';
  else result := format('فشل — %s منطقة من ٦ بس', n); end if;
  return next;

  test := '0065 · مفيش خيار منطقة بره جدول الترجمة (map-db.ts)';
  select count(*) into n from field_options
   where field_key = 'area' and is_active
     and value not in ('التجمع','المعادي','زايد-أكتوبر',
                       'مصر الجديدة-مدينة نصر','وسط-زمالك','غير كده');
  if n = 0 then result := 'نجح';
  else result := format('فشل — %s خيار هيتحفظ غلط', n); end if;
  return next;

  test := '0065 · تفضيل «بنات بس» = دايمًا/أحيانًا/مش مهم';
  select count(*) into n from field_options
   where field_key = 'girls_only' and is_active
     and value in ('دايمًا','أحيانًا','مش مهم');
  if n = 3 and not exists (
    select 1 from field_options
     where field_key = 'girls_only' and is_active
       and value not in ('دايمًا','أحيانًا','مش مهم')
  ) then result := 'نجح';
  else result := format('فشل — %s من ٣، أو لسه فيه خيار قديم نشط', n); end if;
  return next;

  test := '0065 · أيام الأسبوع السبعة نشطة';
  select count(*) into n from field_options
   where field_key = 'free_slots' and is_active
     and value in ('سبت','حد','اتنين','تلات','أربع','خميس','جمعة');
  if n = 7 then result := 'نجح — ٧ أيام';
  else result := format('فشل — %s يوم من ٧ بس', n); end if;
  return next;

  test := '0065 · درجات المستوى الأربعة موجودة';
  select count(*) into n from field_options
   where field_key = 'skill_level' and is_active
     and value in ('أول مرة','مبتدئ','متوسط','كويس');
  if n = 4 then result := 'نجح — ٤ درجات';
  else result := format('فشل — %s درجة من ٤ بس', n); end if;
  return next;

  test := '0065 · نشاطات المهارة كلها في activityToDb';
  select count(*) into n from skill_activities
   where is_active and key not in ('padel','running','swimming');
  if n = 0 then result := 'نجح';
  else result := format('فشل — %s نشاط هيتحفظ سباحة بالغلط', n); end if;
  return next;

  test := '0065 · حد الاهتمامات مكتوب في validation';
  if (select validation ->> 'max' from profile_fields where key = 'interests') is not null then
    result := 'نجح';
  else result := 'فشل — الحد لسه في الكود بس'; end if;
  return next;

  -- ===== 0066 — الخريطة =====
  test := '0066 · جدول map_areas موجود و RLS مفعّل';
  if exists (select 1 from pg_class where relname = 'map_areas' and relrowsecurity) then
    result := 'نجح';
  else result := 'فشل — الجدول ناقص أو RLS مقفول'; end if;
  return next;

  test := '0066 · كتل الخريطة السبعة + نقطة الغامضة';
  select count(*) into n from map_areas where is_active;
  if n >= 8 and exists (select 1 from map_areas where is_mystery) then
    result := format('نجح — %s صف', n);
  else result := format('فشل — %s صف بس', n); end if;
  return next;

  test := '0066 · كتابة map_areas على fn_has_permission مش fn_is_admin';
  select count(*) into n from pg_policies
   where tablename = 'map_areas' and cmd in ('ALL','INSERT','UPDATE','DELETE')
     and coalesce(qual,'') || coalesce(with_check,'') like '%fn_is_admin%';
  if n = 0 and exists (
    select 1 from pg_policies
     where tablename = 'map_areas' and policyname = 'map_areas_write'
       and coalesce(qual,'') like '%map.edit%'
  ) then result := 'نجح';
  else result := format('فشل — %s سياسة كتابة غلط', n); end if;
  return next;

  -- ===== سلوكي — الزائر المجهول =====
  begin
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    execute 'set local role anon';

    test := 'سلوكي · الزائر بيقرا كتل الخريطة';
    select count(*) into n from map_areas;
    if n >= 8 then result := format('نجح — شاف %s صف', n);
    else result := format('فشل — شاف %s بس', n); end if;
    return next;

    test := 'سلوكي · الزائر بيقرا حقول التسجيل وقوايمها';
    select (select count(*) from profile_fields)
         + (select count(*) from field_options)
         + (select count(*) from skill_activities)
         + (select count(*) from consents)
      into n;
    if n > 0 then result := format('نجح — %s صف', n);
    else result := 'فشل — الزائر مش شايف حاجة، /join هتقع على الاحتياطي'; end if;
    return next;

    test := 'سلوكي · الزائر **مش** شايف venues (مكان الخروجة مخفي)';
    select count(*) into n from venues;
    if n = 0 then result := 'نجح';
    else result := format('فشل — تسريب %s مكان بإحداثياته', n); end if;
    return next;

    execute format('set local role %I', me);
  exception when others then
    execute format('set local role %I', me);
    test := 'سلوكي · اختبار الزائر';
    result := 'فشل — ' || sqlerrm;
    return next;
  end;
end;
$$;

comment on function test_public_lists() is
  'بتتأكد إن قوايم التسجيل والخريطة اتظبطت (0065·0066) وإن الزائر بيقراها فعلًا. select * from test_public_lists();';

revoke execute on function test_public_lists() from public, anon, authenticated;
