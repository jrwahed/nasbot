-- ============================================================================
-- 0073 — صلاحيات رفع صور السبوطات على Storage
--
-- المشكلة: دلو `public-media` (اللي المفروض صور السبوطات تتحط فيه) كان عنده
-- سياستين بس:
--     media_read        select  → للكل (تمام، الصور دي عامة)
--     media_admin_write insert  → fn_is_admin()
--
-- يعني حاجتين ناقصين:
--   ١) مفيش `update` ولا `delete` خالص — فأي محاولة تبدّل صورة أو تشيلها
--      كانت هتترفض من غير رسالة واضحة.
--   ٢) الكتابة على `fn_is_admin()` — ودي بقت «أي صف نشط في admin_users»،
--      يعني حتى `support` يقدر يرفع صور على الموقع العام. القاعدة الحاكمة
--      رقم ٢ في CLAUDE.md بتقول الكتابة الحساسة على fn_has_permission.
--
-- الصلاحية المناسبة: `sbotat.edit` — نفس اللي بيعدّل السبوطة نفسها.
-- ============================================================================

-- القراية للكل — موجودة من 0025، بس بنأكدها هنا علشان الملف يبقى مكتفي
-- بنفسه: من غيرها الصور اللي هترفعها مش هتظهر لأي زائر.
drop policy if exists media_read on storage.objects;
create policy media_read on storage.objects for select
  using (bucket_id = 'public-media');

drop policy if exists media_admin_write on storage.objects;
create policy media_admin_write on storage.objects for insert
  with check (bucket_id = 'public-media' and fn_has_permission('sbotat.edit'));

drop policy if exists media_admin_update on storage.objects;
create policy media_admin_update on storage.objects for update
  using (bucket_id = 'public-media' and fn_has_permission('sbotat.edit'))
  with check (bucket_id = 'public-media' and fn_has_permission('sbotat.edit'));

drop policy if exists media_admin_delete on storage.objects;
create policy media_admin_delete on storage.objects for delete
  using (bucket_id = 'public-media' and fn_has_permission('sbotat.edit'));

-- ===== اختبار =====
create or replace function test_media_policies()
returns table (test text, result text)
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  test := '0073 · التلات سياسات (رفع/تبديل/مسح) موجودة';
  select count(*) into n from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname in ('media_admin_write', 'media_admin_update', 'media_admin_delete');
  if n = 3 then
    result := 'نجح — ٣ من ٣';
  else
    result := format('فشل — %s من ٣ بس', n);
  end if;
  return next;

  test := '0073 · الكتابة على fn_has_permission مش fn_is_admin';
  select count(*) into n from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname like 'media_admin_%'
     and coalesce(qual, '') || coalesce(with_check, '') like '%fn_is_admin%';
  if n = 0 then
    result := 'نجح';
  else
    result := format('فشل — لسه %s سياسة على fn_is_admin', n);
  end if;
  return next;

  test := '0073 · القراية لسه مفتوحة للكل (الصور عامة)';
  if exists (
    select 1 from pg_policies
     where schemaname = 'storage' and tablename = 'objects' and policyname = 'media_read'
  ) then
    result := 'نجح';
  else
    result := 'فشل — الصور مش هتظهر للزوار';
  end if;
  return next;
end;
$$;

revoke execute on function test_media_policies() from public, anon, authenticated;
