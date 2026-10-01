-- ============================================================================
-- WORK_MIGRATION_42.sql — اللوحة تشوف صور الأعضاء
--
-- دلو الصور كان مقفول على صاحب الصورة بس، فاللوحة كانت بتكتب «عنده صورة»
-- ومش قادرة تعرضها. دلوقتي اللي عنده صلاحية people.view يشوفها (قراية بس).
--
-- بعده شغّل:
--   select * from test_avatars_admin_read();    -- ٤ صفوف «نجح»
-- ============================================================================

-- ##########################################################################
-- # 20260930200000_0123_avatars_admin_read.sql
-- ##########################################################################

-- ============================================================================
-- 0123 · اللوحة تشوف صور الأعضاء
--
-- طلب المالك (٢٠٢٦-١٠-٠١): «إزاي أشوف صور الناس اللي سجلت؟ مش ظاهرة».
--
-- دلو `avatars` من `0025` مقفول: كل عضو بيقرا صورته هو بس
-- (`avatars_own_read`)، ومفيش ولا سياسة قراية للإدارة — فاللوحة كانت بتكتب
-- «عنده صورة» ومش قادرة تعرضها. (دلو التحويلات `receipts` ليه
-- `receipts_admin_read` من الأول، وده اللي ناقص هنا.)
--
-- ⚠ الصلاحية `people.view` مش `fn_is_admin()`: دي صورة وش حد، والهوية
--   (§٣.٧) قايمة على إنها ما تتعرضش قبل الكشف. اللي بيشوف بيانات الناس في
--   اللوحة هو بس اللي يشوف صورهم — مش أي حساب لوحة.
-- ⚠ ده بيفتح **القراية بس**. الرفع والتعديل والمسح لسه لصاحب الصورة بس.
--
-- ⚠ محليًا مفيش اسكيما `storage` (الشيم مش بيعملها — `0025` نفسها بتفشل
--   محليًا وده متوقّع)، فالهجرة بتتخطّى نفسها هناك والاختبار بيقول «معلومة».
--
-- آمن يتكرر.
-- ============================================================================

do $$
begin
  if to_regclass('storage.objects') is null then
    raise notice '0123: مفيش storage.objects (قاعدة محلية؟) — اتخطّينا';
    return;
  end if;

  execute 'drop policy if exists avatars_admin_read on storage.objects';
  execute $p$
    create policy avatars_admin_read on storage.objects for select
      using (bucket_id = 'avatars' and public.fn_has_permission('people.view'))
  $p$;
end $$;


-- ===== الاختبار =====
create or replace function test_avatars_admin_read()
returns table (test text, result text)
language plpgsql
set search_path = public
as $body$
declare
  me     text := current_user;
  v_adm  uuid;
  v_mem  uuid;
  n      int;
  total  int;
begin
  if to_regclass('storage.objects') is null then
    test := '0123 · صور الأعضاء للوحة';
    result := 'معلومة — مفيش storage (قاعدة محلية)';
    return next;
    return;
  end if;

  test := '0123 · سياسة القراية موجودة وعلى people.view';
  result := case when exists (
      select 1 from pg_policies
       where schemaname = 'storage' and tablename = 'objects'
         and policyname = 'avatars_admin_read'
         and qual like '%people.view%')
    then 'نجح' else 'فشل — السياسة مش موجودة أو مش على people.view' end;
  return next;

  select count(*) into total from storage.objects where bucket_id = 'avatars';

  -- أدمن نشط عنده people.view · وعضو عنده صورة ومش أدمن خالص
  select au.profile_id into v_adm
    from admin_users au join role_permissions rp on rp.role_key = au.role_key
   where au.is_active and rp.permission_key = 'people.view'
   limit 1;
  select p.id into v_mem
    from profiles p
   where p.avatar_path is not null and p.deleted_at is null
     and not exists (select 1 from admin_users au where au.profile_id = p.id)
   limit 1;

  -- الزائر المجهول
  test := '0123 · 🔴 الزائر المجهول ما بيشوفش ولا صورة';
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  execute 'set local role anon';
  begin
    select count(*) into n from storage.objects where bucket_id = 'avatars';
    result := case when n = 0 then 'نجح' else format('فشل — شاف %s صورة', n) end;
  exception when insufficient_privilege then
    result := 'نجح';
  end;
  execute format('set local role %I', me);
  perform set_config('request.jwt.claims', '', true);
  return next;

  -- العضو العادي: صورته هو بس
  test := '0123 · 🔴 العضو بيشوف صورته هو بس';
  if v_mem is null then
    result := 'معلومة — مفيش عضو (مش أدمن) عنده صورة';
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_mem, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from storage.objects
     where bucket_id = 'avatars' and (storage.foldername(name))[1] <> v_mem::text;
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);
    result := case when n = 0 then 'نجح' else format('فشل — شاف %s صورة لناس تانيين', n) end;
  end if;
  return next;

  -- الأدمن: كلهم
  test := '0123 · الأدمن (people.view) بيشوف كل الصور';
  if v_adm is null or total = 0 then
    result := 'معلومة — مفيش أدمن عنده people.view أو مفيش صور';
  else
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_adm, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from storage.objects where bucket_id = 'avatars';
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);
    result := case when n = total then 'نجح'
                   else format('فشل — شاف %s من %s', n, total) end;
  end if;
  return next;
end $body$;

comment on function test_avatars_admin_read() is
  '0123 — صور الأعضاء: الأدمن بـ people.view بيشوفهم كلهم، والعضو صورته بس، والمجهول ولا حاجة.';
revoke execute on function test_avatars_admin_read() from public, anon, authenticated;
