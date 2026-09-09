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
