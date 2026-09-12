-- ============================================================================
-- 0090 — بذرة مؤقتة لاختبارات الأمان
--
-- ⚠ **ليه الملف ده موجود أصلًا:**
--    أربع دوال اختبار — `test_rls` · `test_work_rls` · `test_pair_want` ·
--    `test_work_admin_rpcs` — مكتوبة على **بيانات العرض المبذورة** (مريم ونور
--    وسلمى وسبوطة وحجز بأرقام ثابتة). ودي أهم أربع دوال عندنا: هما اللي
--    بيثبتوا إن RLS بيمنع فعلًا.
--
--    `0089` مسح بيانات العرض. فمن غير الملف ده، الأربعة يبقوا **أحمر دايمًا**
--    على الإنتاج — وفاحص أمان أحمر دايمًا بيتجاهل، يعني أمان مش متفحوص خالص.
--
--    الحل: البذرة تتعمل **وقت الفحص بس** وتتشال بعده. `CHECK_DB.sql` بينادي
--    `fn_test_seed_up()` قبل السلسلة و`fn_test_seed_down()` بعدها، فالقاعدة
--    الحقيقية تفضل نضيفة ومفيش «مريم» وهمية في `/admin/people`.
--
-- ⚠ كل الأرقام هنا **محجوزة للاختبار** وبتبدأ ببادئات ثابتة. `fn_test_seed_down`
--    بتمسح بالبادئة، فما بتلمسش ولا صف حقيقي.
-- ============================================================================

create or replace function fn_test_seed_up()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- الأعضاء الأربعة اللي الاختبارات بتشتغل بيهم
  insert into profiles (id, first_name, gender, area, role)
  values
    ('33333333-0000-0000-0000-000000000001','مريم','female','tagamoa','member'),
    ('33333333-0000-0000-0000-000000000003','نور','female','maadi','member'),
    ('33333333-0000-0000-0000-000000000005','سلمى','female','maadi','member'),
    ('44444444-0000-0000-0000-000000000001','فاحص','male','tagamoa','member')
  on conflict (id) do nothing;

  -- مكان وقالب وسبوطة — الحد الأدنى اللي الحجز محتاجه
  insert into venues (id, name, kind, area, address, is_active)
  values ('55555555-0000-0000-0000-000000000004','[اختبار] مكان','cafe','maadi','[اختبار]',false)
  on conflict (id) do nothing;

  insert into sbota_templates
    (id, slug, name_ar, story_ar, kind, default_price, org_fee,
     duration_min, min_group, max_group)
  values ('66666666-0000-0000-0000-000000000004','test-fixture','[اختبار] قالب',
          '[اختبار]','food', 15000, 4000, 120, 4, 6)
  on conflict (id) do nothing;

  insert into sbotat
    (id, template_id, venue_id, starts_at, ends_at, price, org_fee,
     capacity, status, girls_only, is_day, is_mystery)
  values ('77777777-0000-0000-0000-000000000004','66666666-0000-0000-0000-000000000004',
          '55555555-0000-0000-0000-000000000004',
          now() + interval '6 days', now() + interval '6 days 3 hours',
          15000, 4000, 6, 'open', false, false, false)
  on conflict (id) do nothing;

  -- سبوطة تانية + مجموعة + حجز — `fn_group_members` بتتنادى بالحجز ده بالاسم
  insert into sbotat
    (id, template_id, venue_id, starts_at, ends_at, price, org_fee,
     capacity, status, girls_only, is_day, is_mystery)
  values ('77777777-0000-0000-0000-000000000001','66666666-0000-0000-0000-000000000004',
          '55555555-0000-0000-0000-000000000004',
          now() + interval '22 hours', now() + interval '24 hours',
          30000, 4000, 8, 'open', false, false, false)
  on conflict (id) do nothing;

  insert into sbota_groups (id, sbota_id, index, why_ar)
  values ('88888888-0000-0000-0000-000000000001','77777777-0000-0000-0000-000000000001',1,'[اختبار]')
  on conflict (id) do nothing;

  insert into bookings (id, sbota_id, profile_id, group_id, status, price_paid)
  values
    ('aaaaaaaa-0000-0000-0000-000000000001','77777777-0000-0000-0000-000000000001',
     '33333333-0000-0000-0000-000000000001','88888888-0000-0000-0000-000000000001','paid',30000),
    ('aaaaaaaa-0000-0000-0000-000000000003','77777777-0000-0000-0000-000000000001',
     '33333333-0000-0000-0000-000000000003','88888888-0000-0000-0000-000000000001','paid',30000),
    ('aaaaaaaa-0000-0000-0000-000000000005','77777777-0000-0000-0000-000000000001',
     '33333333-0000-0000-0000-000000000005','88888888-0000-0000-0000-000000000001','paid',30000)
  on conflict (id) do nothing;
end $$;

create or replace function fn_test_seed_down()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  -- ⚠ **بالأرقام بالظبط، مش بالبادئة.** ده اتغيّر بعد ما الغلطة وقعت فعلًا:
  --    النسخة الأولى كانت بتمسح `profiles where id like '33333333-...%'`،
  --    وافترضنا إن البادئة دي «محجوزة للاختبار». هي مش محجوزة — دي بادئة
  --    بذرة الأعضاء الأصلية (`0013`)، وفيها صف كان عليه **حساب أدمن نشط**
  --    (`...0099`). فالدالة مسحت حساب لوحة، رغم إن `0089` حاطة شرط صريح
  --    إنها ما تمسحش أي صف عليه `admin_users`.
  --
  --    المسح بالبادئة بيمسح اللي ما عملتهوش. امسح اللي أنشأته بالظبط،
  --    وحط حارس على اللي ممنوع يتمسح مهما حصل.
  delete from bookings where id in (
    'aaaaaaaa-0000-0000-0000-000000000001',
    'aaaaaaaa-0000-0000-0000-000000000003',
    'aaaaaaaa-0000-0000-0000-000000000005');
  delete from sbota_groups    where id = '88888888-0000-0000-0000-000000000001';
  delete from sbotat where id in (
    '77777777-0000-0000-0000-000000000001',
    '77777777-0000-0000-0000-000000000004');
  delete from sbota_templates where id = '66666666-0000-0000-0000-000000000004';
  delete from venues          where id = '55555555-0000-0000-0000-000000000004';

  -- الحارس: أي صف عليه حساب لوحة ما بيتمسحش، حتى لو رقمه في القايمة
  delete from profiles p
   where p.id in ('33333333-0000-0000-0000-000000000001',
                  '33333333-0000-0000-0000-000000000003',
                  '33333333-0000-0000-0000-000000000005',
                  '44444444-0000-0000-0000-000000000001')
     and not exists (select 1 from admin_users a where a.profile_id = p.id);
end $$;

revoke execute on function fn_test_seed_up()   from public, anon, authenticated;
revoke execute on function fn_test_seed_down() from public, anon, authenticated;

comment on function fn_test_seed_up() is
  'بذرة مؤقتة لاختبارات الأمان. CHECK_DB بيناديها قبل السلسلة وfn_test_seed_down بعدها.';

-- ===== دالة الاختبار =====
-- ⚠ بتختبر إن الحارس **بيمنع فعلًا** مش إنه «موجود».
create or replace function test_seed_down_safe()
returns table (test text, result text)
language plpgsql security definer set search_path = public
as $body$
declare n int;
begin
  -- ⚠ بندوّر على **شكل الكود** (`id::text like`) مش على الكلام. أول نسخة من
  --    البند ده كانت بتدوّر على «like '33333333» وخبطت في التعليق اللي فوق
  --    جوه الدالة نفسها، وقالت «فشل» على دالة سليمة. `prosrc` فيها
  --    التعليقات كمان — فأي فحص عليها لازم يبقى محدد كفاية إنه ما يمسكش كلام.
  test := '0090 · fn_test_seed_down مش بتمسح بالبادئة';
  if (select prosrc from pg_proc where proname='fn_test_seed_down')
       like '%id::text like ''33333333%'
    then result := 'فشل — 🔴 لسه بتمسح بالبادئة، ممكن تمسح حساب لوحة';
    else result := 'نجح'; end if;
  return next;

  test := '0090 · فيها حارس admin_users';
  if (select prosrc from pg_proc where proname='fn_test_seed_down') like '%admin_users%'
    then result := 'نجح';
    else result := 'فشل — مفيش حارس على حسابات اللوحة'; end if;
  return next;

  test := '0090 · مفيش حساب لوحة اتمسح (لسه فيه واحد على الأقل)';
  select count(*) into n from admin_users where is_active;
  if n > 0 then result := format('نجح — %s حساب', n);
  else result := 'فشل — 🔴 اللوحة مقفولة'; end if;
  return next;
end $body$;

revoke execute on function test_seed_down_safe() from public, anon, authenticated;
