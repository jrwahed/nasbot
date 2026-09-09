-- ============================================================================
-- 0075 — نشاطات المهارة بقت بحث حقيقي، و«عجل» رجعت
--
-- المشكلة (من REVIEW · بند activityToDb):
--   `src/lib/map-db.ts` كان بيترجم النشاط كده:
--       a === 'بادل' ? 'padel' : a === 'جري' ? 'running' : 'swimming'
--   يعني **أي** نشاط تاني بيتحفظ «سباحة» بالصمت. عشان كده الهجرة 0065
--   اضطرت تقفل صف `cycling` كحل مؤقت (`is_active = false`) وكتبت بالحرف:
--   «نقفلها لحد ما map-db يعرفها».
--
-- الكود اتصلّح دلوقتي: `activityToDb` بقى بحث في جدول بيتبني من
-- `skill_activities` (key ↔ label_ar)، والمجهول بيرجّع `null` وطبقة البيانات
-- بتتخطاه بدل ما تكتب حاجة غلط. فالحل المؤقت خلاص.
--
-- الملف ده بيعمل تلات حاجات:
--   ١) بيرجّع `cycling` نشطة.
--   ٢) بيحط حارس في القاعدة: مفيش نشاط **نشط** مفتاحه بره `activity_t`.
--      ليه؟ لأن `skill_levels.activity` عمودها `activity_t`، فمفتاح جديد
--      من اللوحة من غير قيمة enum مقابلة معناه إن الحفظ هيقع على العضو.
--      الحارس بيخلّي اللوحة تقول السبب بدل ما الحفظ يفشل عند العضو.
--   ٣) بيصلّح صف واحد في `test_public_lists()` (من 0067) كان بيقارن بقايمة
--      تلات مفاتيح مكتوبة بالإيد — بقى بيقارن بالـ enum نفسه.
--
-- ⚠ الترتيب: الزق `WORK_MIGRATION_6.sql` (0065·0066·0067·0070) **قبل** الملف
--    ده، لأن الملف ده بيعمل `create or replace` لدالة اتعرّفت هناك.
--
-- كله `if not exists` / `create or replace` / `drop … if exists` — آمن يتكرر.
-- ============================================================================

-- ===== ١ · «عجل» ترجع =====
update skill_activities set is_active = true where key = 'cycling';

-- ===== ٢ · حارس: نشاط نشط لازم يبقى قيمة معروفة في activity_t =====
create or replace function fn_skill_activity_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.is_active and not exists (
    select 1
      from pg_enum e
      join pg_type t on t.oid = e.enumtypid
     where t.typname = 'activity_t'
       and e.enumlabel = new.key
  ) then
    raise exception
      'النشاط «%» مفتاحه مش في نوع activity_t — ضيف القيمة للـ enum في هجرة الأول، وإلا مستوى العضو مش هيتحفظ.',
      new.key
      using errcode = '23514';
  end if;
  return new;
end;
$$;

comment on function fn_skill_activity_guard() is
  'بيمنع تفعيل نشاط مهارة مفتاحه مش في enum activity_t — لأن skill_levels.activity من النوع ده.';

drop trigger if exists t_skill_activities_guard on skill_activities;
create trigger t_skill_activities_guard
  before insert or update on skill_activities
  for each row execute function fn_skill_activity_guard();

-- ===== ٣ · تصليح صف الاختبار في test_public_lists (0067) =====
-- الأصل كان: key not in ('padel','running','swimming') — قايمة مكتوبة بالإيد
-- بتبوّظ أول ما نشاط جديد يتفعّل. المقارنة الصح مع activity_t نفسه.
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

  -- ⬇ الصف ده هو اللي 0075 غيّره: المقارنة مع activity_t مش مع قايمة ثابتة
  test := '0075 · كل نشاط مهارة نشط ليه قيمة في activity_t';
  select count(*) into n from skill_activities sa
   where sa.is_active
     and not exists (
       select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
        where t.typname = 'activity_t' and e.enumlabel = sa.key
     );
  if n = 0 then result := 'نجح';
  else result := format('فشل — %s نشاط مفتاحه مش في الـ enum', n); end if;
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
  'بتتأكد إن قوايم التسجيل والخريطة اتظبطت (0065·0066·0075) وإن الزائر بيقراها فعلًا. select * from test_public_lists();';

revoke execute on function test_public_lists() from public, anon, authenticated;
revoke execute on function fn_skill_activity_guard() from public, anon;
