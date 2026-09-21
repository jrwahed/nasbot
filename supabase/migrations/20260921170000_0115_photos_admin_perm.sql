-- ============================================================================
-- 0115 — مسح صور الأعضاء بصلاحية، مش بأي حساب لوحة
--
-- سياسة `photos_admin` قديمة وشكلها `for all using fn_is_admin()`. ومعنى
-- `fn_is_admin` في المشروع ده هو **«أي صف نشط في `admin_users`»** — يعني
-- حتى دور `support` كان يقدر يمسح صور الأعضاء.
--
-- ده بالظبط اللي القاعدة التانية في §٥ بتقول عليه: **سياسات الكتابة
-- الحساسة لازم `fn_has_permission('<الصلاحية>')` مش `fn_is_admin()`**
-- (نفس الغلطة اللي اتصلّحت في `0056` على الأسعار).
--
-- والقراية سايبينها لأي حساب لوحة عن قصد — علشان صفحة الإشراف الجديدة
-- (`/admin/photos`) يشوفها الكل، والمسح للي من حقه بس.
--
-- ⚠ وبقى فيه حتة تانية مهمة: العضو نفسه لسه بيمسح **صوره هو** من
--   `photos_owner_delete` (`0113`). الملف ده ما بيلمسهاش.
--
-- آمنة تتكرر: `drop policy if exists` بنفس الاسم الجديد قبل كل `create`.
-- ============================================================================

drop policy if exists photos_admin       on sbota_photos;
drop policy if exists photos_admin_read  on sbota_photos;
drop policy if exists photos_admin_write on sbota_photos;

-- القراية: أي حساب لوحة (زي باقي القراية في المشروع)
create policy photos_admin_read on sbota_photos
  for select using (fn_is_admin());

-- التعديل والمسح: بالصلاحية بس
create policy photos_admin_write on sbota_photos
  for update using (fn_has_permission('sbotat.edit'))
           with check (fn_has_permission('sbotat.edit'));

create policy photos_admin_delete on sbota_photos
  for delete using (fn_has_permission('sbotat.edit'));


-- ===== دالة الاختبار =====
--
-- ⚠ **شكلي عن قصد، وده مكتوب علشان ما يتقريش غلط.** الفحص السلوكي هنا
--   محتاج حساب لوحة بدور محدود (`support`) في البذرة المؤقتة — ومفيش
--   واحد. فبدل ما نكتب اختبار بيتخطّى نفسه ويقول «معلومة» (الدرس
--   العشرين)، بنفحص **الشرط نفسه** في السياسة: لازم يبقى فيه
--   `fn_has_permission` ومفيش `fn_is_admin` في سياسات المسح والتعديل.
--
--   ولو حد ضاف حساب `support` للبذرة يومًا، حوّل ده لاختبار سلوكي.
create or replace function test_photo_admin_perm()
returns table (test text, result text)
language plpgsql
set search_path = public
as $body$
declare
  n int;
  q text;
begin
  test := '0115 · سياسة المسح بالصلاحية مش بأي حساب لوحة';
  select count(*) into n from pg_policies
   where tablename = 'sbota_photos' and policyname = 'photos_admin_delete';
  if n = 0 then
    result := 'فشل — سياسة photos_admin_delete مش موجودة';
    return next;
    return;
  end if;

  select qual::text into q from pg_policies
   where tablename = 'sbota_photos' and policyname = 'photos_admin_delete';
  if q like '%fn_has_permission%' and q not like '%fn_is_admin%' then result := 'نجح';
  else result := 'فشل — 🔴 الشرط: ' || left(coalesce(q, '(فاضي)'), 60); end if;
  return next;

  test := '0115 · سياسة `photos_admin` القديمة اتشالت';
  select count(*) into n from pg_policies
   where tablename = 'sbota_photos' and policyname = 'photos_admin';
  if n = 0 then result := 'نجح';
  else result := 'فشل — 🔴 لسه موجودة، و`for all` بتغلب اللي بعدها'; end if;
  return next;

  -- والعضو لسه بيمسح صوره هو
  test := '0115 · العضو لسه بيمسح صوره هو';
  select count(*) into n from pg_policies
   where tablename = 'sbota_photos' and policyname = 'photos_owner_delete';
  if n = 1 then result := 'نجح';
  else result := 'فشل — سياسة العضو اتشالت بالغلط'; end if;
  return next;
end $body$;

comment on function test_photo_admin_perm() is
  '0115 — مسح صور الأعضاء بصلاحية sbotat.edit، والقراية لأي حساب لوحة.';
