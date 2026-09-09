-- ============================================================================
-- WORK_MIGRATION_7.sql — آخر بنود المراجعة
--
-- ⚠ الزق WORK_MIGRATION_5.sql و WORK_MIGRATION_6.sql الأول لو لسه ما عملتهمش.
--    الملف ده بيعمل `create or replace` لدالة `test_public_lists()` اللي
--    اتعرّفت في 0067 (جوه الدفعة ٦) — فلو لزقت ٦ بعد ٧ هترجّع نسخة قديمة
--    وصف الاختبار بتاع النشاطات هيقول «فشل» غلط. الترتيب: ٥ ← ٦ ← ٧.
--
-- الزقه كله مرة واحدة في Supabase ← SQL Editor ← Run. مفيش قيم enum جديدة.
-- آمن يتكرر — اتجرّب بلزقتين ورا بعض على قاعدة نضيفة (شوف تحت).
--
-- بيصلّح:
--   0075  نشاطات المهارة: «عجل» رجعت، وحارس بيمنع تفعيل نشاط مفتاحه مش في
--         نوع activity_t (لأن skill_levels.activity من النوع ده). وبيصلّح صف
--         الاختبار في test_public_lists اللي كان بيقارن بقايمة ثابتة.
--   0076  دالة اختبار لآخر بنود المراجعة: مفاتيح المزايا (A2) · allow_roles
--         بتاعة الصيانة · محرّر كتل الخريطة · نشاطات المهارة.
--   0077  نصوص شاشة «مقفول» في copy_strings علشان تتعدّل من /admin/content.
--
-- بعد ما تلزقه شغّل التلات دول ولازم كلهم «نجح»:
--   select * from test_last_review_items();
--   select * from test_public_lists();
--   select * from test_review_fixes();
--
-- ملاحظة: باقي شغل الدفعة دي **كله في الكود مش في القاعدة** —
--   • مفاتيح المزايا بقت بتتقرا فعلًا (src/lib/flags.ts + FlagsProvider).
--   • الميدل وير بقى بيحترم maintenance.allow_roles.
--   • /admin/map فيه محرّر لكتل الخريطة (سياسة الكتابة موجودة من 0066).
--   • ترقيم أربع شاشات لوحة.
-- ============================================================================


-- ==================== 0075 ====================
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

-- ==================== 0076 ====================
-- ============================================================================
-- 0076 — اختبار آخر بنود المراجعة (A2 · الصيانة · محرّر الخريطة · النشاطات)
--
--   select * from test_last_review_items();
--
-- كل الصفوف لازم تقول «نجح». أي «فشل» ابعتلي السطر بالحرف.
--
-- الاختبار **سلوكي**: بيلبس دور الزائر المجهول ودور عضو من غير صلاحية ودور
-- المالك، ويجرّب يقرا ويكتب فعلًا. «السياسة موجودة» ما يعنيش «بتشتغل».
--
-- ⚠ security invoker عن قصد (زي test_public_lists): بوستجرس بيرفض `set role`
-- جوه دالة definer، ومن غير `set role` مفيش اختبار سلوكي. التنفيذ مسحوب من
-- public/anon/authenticated تحت — بتتشغّل من محرر SQL بس.
-- ============================================================================

create or replace function test_last_review_items()
returns table (test text, result text)
language plpgsql
set search_path = public
as $$
declare
  n        int;
  me       text := current_user;
  owner_id uuid;
  plain_id uuid;
  ok       boolean;
begin
  -- مين نلبسه: صف admin_users دوره فيه صلاحية map.edit
  select au.profile_id into owner_id
    from admin_users au
    join role_permissions rp on rp.role_key = au.role_key
   where au.is_active and rp.permission_key = 'map.edit'
   limit 1;

  -- وعضو عادي مش في admin_users خالص
  select p.id into plain_id
    from profiles p
   where not exists (select 1 from admin_users a where a.profile_id = p.id)
   limit 1;

  /* ===================== ٤ · نشاطات المهارة (activityToDb) ============== */

  test := '0075 · «عجل» رجعت نشطة';
  if exists (select 1 from skill_activities where key = 'cycling' and is_active) then
    result := 'نجح';
  else result := 'فشل — cycling لسه مقفولة'; end if;
  return next;

  test := '0075 · كل نشاط نشط ليه قيمة في activity_t';
  select count(*) into n from skill_activities sa
   where sa.is_active
     and not exists (
       select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
        where t.typname = 'activity_t' and e.enumlabel = sa.key
     );
  if n = 0 then result := 'نجح';
  else result := format('فشل — %s نشاط هيتحفظ غلط', n); end if;
  return next;

  test := '0075 · الحارس بيرفض تفعيل نشاط مفتاحه مش في الـ enum';
  ok := false;
  begin
    insert into skill_activities (key, label_ar, "order", is_active)
    values ('__test_bogus__', 'اختبار', 999, true);
    -- لو وصلنا هنا يبقى الحارس مش شغّال — ننضّف ورانا
    delete from skill_activities where key = '__test_bogus__';
  exception when others then
    ok := true;
  end;
  if ok then result := 'نجح — الحارس رمى استثناء';
  else result := 'فشل — نشاط بمفتاح مجهول اتفعّل، وده هيكسر حفظ المستوى'; end if;
  return next;

  test := '0075 · الحارس بيسمح بنشاط مقفول مفتاحه مجهول (مسوّدة)';
  ok := false;
  begin
    insert into skill_activities (key, label_ar, "order", is_active)
    values ('__test_draft__', 'اختبار', 998, false);
    ok := true;
    delete from skill_activities where key = '__test_draft__';
  exception when others then
    ok := false;
  end;
  if ok then result := 'نجح';
  else result := 'فشل — الحارس واسع أوي، مش هينفع تجهّز نشاط قبل الـ enum'; end if;
  return next;

  /* ===================== ١ · مفاتيح المزايا (A2) ======================== */

  test := 'A2 · المفاتيح السبعة كلها موجودة';
  select count(*) into n from feature_flags
   where key in ('booking','game','map','mystery','chat','referral','work_sbota');
  if n = 7 then result := 'نجح — ٧ مفاتيح';
  else result := format('فشل — %s مفتاح من ٧ بس، والموقع بيقرا الاحتياطي للباقي', n); end if;
  return next;

  test := 'A2 · مفيش مفتاح من غير رسالة قفل';
  select count(*) into n from feature_flags
   where coalesce(btrim(off_message_ar), '') = '';
  if n = 0 then result := 'نجح';
  else result := format('فشل — %s مفتاح لو اتقفل هيطلع شاشة من غير سبب', n); end if;
  return next;

  /* ===================== ٢ · الصيانة و allow_roles ====================== */

  test := 'الصيانة · صف maintenance موجود وواحد بس';
  select count(*) into n from maintenance;
  if n = 1 then result := 'نجح';
  else result := format('فشل — %s صف', n); end if;
  return next;

  test := 'الصيانة · allow_roles فيه دور واحد على الأقل';
  select coalesce(array_length(allow_roles, 1), 0) into n from maintenance where id;
  if n >= 1 then result := format('نجح — %s دور', n);
  else result := 'فشل — مفيش دور مسموح، يعني الصيانة هتقفل على الفريق كمان'; end if;
  return next;

  test := 'الصيانة · كل دور في allow_roles موجود في admin_roles';
  select count(*) into n
    from maintenance m, unnest(m.allow_roles) as r(role_key)
   where not exists (select 1 from admin_roles ar where ar.key = r.role_key);
  if n = 0 then result := 'نجح';
  else result := format('فشل — %s دور مش موجود، الميدل وير عمره ما هيطابقه', n); end if;
  return next;

  test := 'الصيانة · الكتابة على maintenance بـ settings.danger مش fn_is_admin';
  if exists (
    select 1 from pg_policies
     where tablename = 'maintenance' and policyname = 'mt_write'
       and coalesce(qual,'') like '%settings.danger%'
  ) and not exists (
    select 1 from pg_policies
     where tablename = 'maintenance' and cmd in ('ALL','INSERT','UPDATE','DELETE')
       and coalesce(qual,'') || coalesce(with_check,'') like '%fn_is_admin%'
  ) then result := 'نجح';
  else result := 'فشل — سياسة الكتابة واسعة'; end if;
  return next;

  /* ===================== ٣ · محرّر كتل الخريطة ========================== */

  test := 'A5 · map_areas فيه الكتل + نقطة الغامضة';
  select count(*) into n from map_areas;
  if n >= 8 and exists (select 1 from map_areas where is_mystery) then
    result := format('نجح — %s صف', n);
  else result := format('فشل — %s صف بس', n); end if;
  return next;

  test := 'A5 · الأعمدة اللي المحرّر بيكتبها موجودة';
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'map_areas'
     and column_name in ('label_ar','note_ar','is_far','is_active');
  if n = 4 then result := 'نجح — ٤ أعمدة';
  else result := format('فشل — %s عمود من ٤ بس', n); end if;
  return next;

  /* ===================== سلوكي — مين بيقدر يعمل إيه ===================== */

  -- (أ) الزائر المجهول
  begin
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    execute 'set local role anon';

    test := 'سلوكي · الزائر بيقرا feature_flags (الموقع محتاجها قبل الدخول)';
    select count(*) into n from feature_flags;
    if n >= 7 then result := format('نجح — شاف %s مفتاح', n);
    else result := format('فشل — شاف %s، الموقع هيقع على الاحتياطي', n); end if;
    return next;

    test := 'سلوكي · الزائر بيقرا maintenance (الميدل وير بيقراها بمفتاح anon)';
    select count(*) into n from maintenance;
    if n = 1 then result := 'نجح';
    else result := 'فشل — الميدل وير مش هيعرف الموقع مقفول ولا لأ'; end if;
    return next;

    test := 'سلوكي · الزائر **مش** بيقدر يقفل ميزة';
    ok := false;
    begin
      update feature_flags set is_on = false where key = 'booking';
      get diagnostics n = row_count;
      ok := (n = 0);
    exception when others then
      ok := true;
    end;
    if ok then result := 'نجح — صفر صف اتغيّر';
    else result := 'فشل — 🔴 الزائر قفل الحجز'; end if;
    return next;

    test := 'سلوكي · الزائر **مش** بيقدر يعدّل كتلة خريطة';
    ok := false;
    begin
      update map_areas set label_ar = '__hack__' where key = 'maadi';
      get diagnostics n = row_count;
      ok := (n = 0);
    exception when others then
      ok := true;
    end;
    if ok then result := 'نجح';
    else result := 'فشل — 🔴 الزائر بيكتب على الخريطة'; end if;
    return next;

    test := 'سلوكي · الزائر **مش** بيقدر يقفل الموقع للصيانة';
    ok := false;
    begin
      update maintenance set is_on = true where id;
      get diagnostics n = row_count;
      ok := (n = 0);
    exception when others then
      ok := true;
    end;
    if ok then result := 'نجح';
    else result := 'فشل — 🔴 الزائر قفل الموقع'; end if;
    return next;

    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);
  exception when others then
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);
    test := 'سلوكي · اختبار الزائر';
    result := 'فشل — ' || sqlerrm;
    return next;
  end;

  -- (ب) عضو داخل من غير أي صلاحية إدارة
  if plain_id is null then
    test := 'سلوكي · عضو من غير صلاحية';
    result := 'نجح — اتخطى (مفيش عضو عادي في القاعدة دي)';
    return next;
  else
    begin
      perform set_config(
        'request.jwt.claims',
        json_build_object('sub', plain_id::text, 'role', 'authenticated')::text,
        true
      );
      execute 'set local role authenticated';

      test := 'سلوكي · عضو عادي **مش** بيقدر يعدّل كتلة خريطة';
      ok := false;
      begin
        update map_areas set label_ar = '__hack__' where key = 'maadi';
        get diagnostics n = row_count;
        ok := (n = 0);
      exception when others then
        ok := true;
      end;
      if ok then result := 'نجح';
      else result := 'فشل — 🔴 أي عضو بيكتب على الخريطة'; end if;
      return next;

      test := 'سلوكي · عضو عادي **مش** بيقدر يقفل ميزة';
      ok := false;
      begin
        update feature_flags set is_on = false where key = 'booking';
        get diagnostics n = row_count;
        ok := (n = 0);
      exception when others then
        ok := true;
      end;
      if ok then result := 'نجح';
      else result := 'فشل — 🔴 أي عضو بيقفل الحجز'; end if;
      return next;

      execute format('set local role %I', me);
      perform set_config('request.jwt.claims', '', true);
    exception when others then
      execute format('set local role %I', me);
      perform set_config('request.jwt.claims', '', true);
      test := 'سلوكي · اختبار العضو العادي';
      result := 'فشل — ' || sqlerrm;
      return next;
    end;
  end if;

  -- (ج) صاحب صلاحية map.edit — لازم **ينجح**، متكسرش اللوحة
  if owner_id is null then
    test := 'سلوكي · صاحب map.edit بيعدّل الخريطة';
    result := 'نجح — اتخطى (مفيش صف admin_users بالصلاحية دي)';
    return next;
  else
    begin
      perform set_config(
        'request.jwt.claims',
        json_build_object('sub', owner_id::text, 'role', 'authenticated')::text,
        true
      );
      execute 'set local role authenticated';

      test := 'سلوكي · صاحب map.edit **بيعدّل** كتلة الخريطة';
      n := 0;
      begin
        update map_areas set note_ar = note_ar where key = 'maadi';
        get diagnostics n = row_count;
      exception when others then
        n := -1;
      end;
      if n = 1 then result := 'نجح';
      else result := format('فشل — %s صف اتغيّر، يعني محرّر الخريطة مقفول على المالك', n); end if;
      return next;

      test := 'سلوكي · صاحب map.edit بيشوف الكتل المقفولة كمان';
      select count(*) into n from map_areas;
      if n >= 8 then result := format('نجح — شاف %s', n);
      else result := format('فشل — شاف %s بس', n); end if;
      return next;

      execute format('set local role %I', me);
      perform set_config('request.jwt.claims', '', true);
    exception when others then
      execute format('set local role %I', me);
      perform set_config('request.jwt.claims', '', true);
      test := 'سلوكي · اختبار صاحب الصلاحية';
      result := 'فشل — ' || sqlerrm;
      return next;
    end;
  end if;
end;
$$;

comment on function test_last_review_items() is
  'بتتأكد إن آخر بنود المراجعة (A2 مفاتيح المزايا · allow_roles · محرّر map_areas · نشاطات المهارة) واقعة فعلًا. select * from test_last_review_items();';

revoke execute on function test_last_review_items() from public, anon, authenticated;

-- ==================== 0077 ====================
-- ============================================================================
-- 0077 — نصوص شاشة «مقفول» في copy_strings
--
-- مفاتيح المزايا بقت بتتقرا فعلًا (A2)، وشاشة القفل مكوّن في
-- `src/components/FlagsProvider.tsx`. قاعدة CLAUDE.md §٣: أي نص معروض بيمر
-- بـ `t()` ومفتاحه في `copy_strings` — فالمفاتيح دي لازم تكون في القاعدة
-- علشان المالك يعدّلها من /admin/content زي أي نص تاني.
--
-- (رسالة كل ميزة لوحدها مش هنا — دي `feature_flags.off_message_ar` وبتتعدّل
--  من /admin/settings ← مفاتيح المزايا. اللي هنا العنوان والنص الاحتياطي بس.)
--
-- نفس المفاتيح موجودة في src/data/copy-fallback.ts و scripts/copy-seed.json
-- فالموقع شغّال بيهم من غير الهجرة دي — الهجرة بتخلّيهم **قابلين للتعديل**.
--
-- آمن يتكرر: on conflict do update.
-- ============================================================================

insert into copy_strings (key, value_ar, screen, context_ar) values
  ('flags.closed.title', 'القسم ده مقفول دلوقتي', 'مفاتيح المزايا',
   'عنوان شاشة القفل — FlagsProvider.tsx'),
  ('flags.closed.body', 'بنظبط حاجة صغيرة هنا. ارجعلنا كمان شوية.', 'مفاتيح المزايا',
   'النص الاحتياطي لو رسالة الميزة فاضية'),
  ('flags.closed.mark', 'نسبوط', 'مفاتيح المزايا',
   'وصف علامة الاستفهام لقارئ الشاشة'),
  ('flags.off.note', 'مقفول دلوقتي', 'مفاتيح المزايا',
   'الزرار المعطّل في صفحة السبوطة لما الحجز مقفول')
on conflict (key) do update
  set value_ar   = excluded.value_ar,
      screen     = excluded.screen,
      context_ar = coalesce(excluded.context_ar, copy_strings.context_ar);
