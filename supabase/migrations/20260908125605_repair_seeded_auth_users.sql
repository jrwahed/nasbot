-- إصلاح حسابات البيانات التجريبية.
--
-- الحسابات دي اتحطت في auth.users بـ insert مباشر، فطلعت ناقصة حاجتين
-- بيعتمد عليهما GoTrue: أعمدة التوكن كانت NULL (المفروض نص فاضي)،
-- ومكانش ليها صف في auth.identities. النتيجة: أي عملية على الحساب
-- بترجّع "Database error loading user" — يعني الحساب ده عمره ما هيعرف يدخل.
--
-- التصليح إضافي بالكامل: بنبدّل NULL بنص فاضي وبنزوّد الهوية الناقصة بس.

update auth.users set
  confirmation_token          = coalesce(confirmation_token, ''),
  email_change                = coalesce(email_change, ''),
  email_change_token_new      = coalesce(email_change_token_new, ''),
  email_change_token_current  = coalesce(email_change_token_current, ''),
  recovery_token              = coalesce(recovery_token, ''),
  phone_change                = coalesce(phone_change, ''),
  phone_change_token          = coalesce(phone_change_token, ''),
  reauthentication_token      = coalesce(reauthentication_token, '')
where confirmation_token is null or email_change is null
   or email_change_token_new is null or email_change_token_current is null
   or recovery_token is null or phone_change is null
   or phone_change_token is null or reauthentication_token is null;

-- هوية بالموبايل للحسابات اللي مالهاش هوية
insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
select u.phone, u.id,
       jsonb_build_object('sub', u.id::text, 'phone', u.phone),
       'phone', now(), now()
from auth.users u
where u.phone is not null
  and not exists (select 1 from auth.identities i where i.user_id = u.id);

-- وهوية بالإيميل للباقي
insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at)
select u.email, u.id,
       jsonb_build_object('sub', u.id::text, 'email', u.email, 'email_verified', true),
       'email', now(), now()
from auth.users u
where u.email is not null
  and not exists (select 1 from auth.identities i where i.user_id = u.id);;
