-- ============================================================================
-- 0061 — دالة اختبار تصليحات المراجعة (0052..0060)
--
-- كل هجرة في الدفعة دي معاها سطر هنا بيتأكد إن التصليح فعلًا واقع في القاعدة،
-- مش إن الملف اتشغّل وخلاص. شغّلها بعد ما تلزق WORK_MIGRATION_5.sql:
--
--   select * from test_review_fixes();
--
-- المفروض كل الصفوف تقول «نجح». أي «فشل» معناه إن الهجرة دي ما وصلتش —
-- ابعتلي السطر بالحرف.
--
-- ملحوظة: الفحص هنا على **شكل** القاعدة (السياسات · المنح · المحفّزات ·
-- القيود)، مش على سلوك الأعضاء — علشان يشتغل من غير ما نعمل حسابات وهمية
-- ولا نلمس بيانات حقيقية. الاختبار السلوكي بيتعمل من الموقع نفسه.
-- ============================================================================

create or replace function test_review_fixes()
returns table (test text, result text)
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  -- ===== 0052 — التبادل المزيّف (S1/S2) =====
  test := '0052 · مفيش كتابة مباشرة على pair_affinity';
  select count(*) into n from pg_policies
   where tablename = 'pair_affinity' and cmd in ('INSERT', 'UPDATE', 'ALL');
  if n > 0 then
    result := format('فشل — لسه فيه %s سياسة كتابة', n);
  elsif has_table_privilege('authenticated', 'pair_affinity', 'insert')
     or has_table_privilege('authenticated', 'pair_affinity', 'update') then
    result := 'فشل — منحة الكتابة لسه موجودة لـ authenticated';
  else
    result := 'نجح';
  end if;
  return next;

  test := '0052 · مفيش كتابة مباشرة على work_affinity';
  select count(*) into n from pg_policies
   where tablename = 'work_affinity' and cmd in ('INSERT', 'UPDATE', 'ALL');
  if n > 0 then
    result := format('فشل — لسه فيه %s سياسة كتابة', n);
  elsif has_table_privilege('authenticated', 'work_affinity', 'insert')
     or has_table_privilege('authenticated', 'work_affinity', 'update') then
    result := 'فشل — منحة الكتابة لسه موجودة لـ authenticated';
  else
    result := 'نجح';
  end if;
  return next;

  test := '0052 · الطريق الصح (fn_pair_want / fn_work_want) لسه مفتوح للعضو';
  if has_function_privilege('authenticated', 'fn_pair_want(uuid, uuid, boolean)', 'execute')
 and has_function_privilege('authenticated', 'fn_work_want(uuid, uuid, boolean)', 'execute') then
    result := 'نجح';
  else
    result := 'فشل — العضو مش هيعرف يختار حد خالص';
  end if;
  return next;

  -- ===== 0053 — قراية profiles =====
  test := '0053 · سياسة profiles_mutual_read اتشالت';
  if exists (
    select 1 from pg_policies
     where tablename = 'profiles' and policyname = 'profiles_mutual_read'
  ) then
    result := 'فشل — السياسة لسه موجودة';
  else
    result := 'نجح';
  end if;
  return next;

  -- ===== 0054 — الحجز المجاني المؤكد (S4) =====
  test := '0054 · سياسة إدراج الحجز بتلزم pending_payment بفلوس صفر';
  if (select with_check from pg_policies
       where tablename = 'bookings' and policyname = 'bookings_own_insert')
     like '%pending_payment%' then
    result := 'نجح';
  else
    result := 'فشل — السياسة لسه بتتحقق من profile_id بس';
  end if;
  return next;

  test := '0054 · محفّز حارس أعمدة الحجز شغّال';
  if exists (
    select 1 from pg_trigger
     where tgname = 't_guard_booking_columns' and not tgisinternal
  ) then
    result := 'نجح';
  else
    result := 'فشل — المحفّز مش متركّب';
  end if;
  return next;

  -- ===== 0055 — الكباتن =====
  test := '0055 · عرض الكباتن العام موجود';
  if exists (select 1 from pg_views where viewname = 'captains_public') then
    result := 'نجح';
  else
    result := 'فشل — العرض مش موجود';
  end if;
  return next;

  -- ===== 0056 — سياسات الكتابة الحساسة =====
  -- القراية للإدارة سايبينها على fn_is_admin عن قصد (أي أدمن يشوف)، الكتابة بس
  -- هي اللي لازم تبقى على الصلاحية المحددة.
  test := '0056 · كتابة الإعدادات والفلوس بقت على fn_has_permission';
  select count(*) into n from pg_policies
   where tablename in ('settings', 'bookings', 'sbotat', 'venues',
                       'captains', 'coupons', 'reports')
     and cmd in ('ALL', 'INSERT', 'UPDATE', 'DELETE')
     and coalesce(qual, '') || coalesce(with_check, '') like '%fn_is_admin%';
  if n = 0 then
    result := 'نجح';
  else
    result := format('فشل — لسه %s سياسة كتابة بتستخدم fn_is_admin', n);
  end if;
  return next;

  -- ===== 0057 — fn_reveal =====
  test := '0057 · fn_reveal موجودة ومقفولة على anon';
  if not exists (select 1 from pg_proc where proname = 'fn_reveal') then
    result := 'فشل — الدالة مش موجودة';
  elsif has_function_privilege('anon', 'fn_reveal(uuid)', 'execute') then
    result := 'فشل — anon يقدر ينفّذها';
  else
    result := 'نجح';
  end if;
  return next;

  -- ===== 0058 / 0059 — المهام المجدولة =====
  test := '0058 · job_purge موجودة';
  if exists (select 1 from pg_proc where proname = 'job_purge') then
    result := 'نجح';
  else
    result := 'فشل — الدالة مش موجودة';
  end if;
  return next;

  test := '0059 · job_expire_bookings موجودة';
  if exists (select 1 from pg_proc where proname = 'job_expire_bookings') then
    result := 'نجح';
  else
    result := 'فشل — الدالة مش موجودة';
  end if;
  return next;

  -- ===== 0060 — قيود الفلوس =====
  test := '0060 · قيود check على أعمدة الفلوس';
  select count(*) into n from pg_constraint
   where contype = 'c'
     and conname in ('payments_amount_nonneg', 'payments_fee_nonneg',
                     'refunds_amount_nonneg', 'bookings_money_nonneg',
                     'work_passes_price_nonneg', 'sbotat_money_nonneg',
                     'coupons_value_positive');
  if n = 7 then
    result := 'نجح — ٧ قيود';
  else
    result := format('فشل — %s قيد من ٧ بس', n);
  end if;
  return next;
end;
$$;

comment on function test_review_fixes() is
  'بتتأكد إن تصليحات المراجعة (0052..0060) واقعة فعلًا في القاعدة. select * from test_review_fixes();';

revoke execute on function test_review_fixes() from public, anon, authenticated;
