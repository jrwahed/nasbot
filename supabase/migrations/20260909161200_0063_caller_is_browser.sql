-- ============================================================================
-- 0063 — الحراس اللي كانوا بيعتمدوا على current_user ما كانوش بيشتغلوا خالص
--
-- المشكلة (مسكناها بالاختبار السلوكي، مش بالقراية):
--   جوّه أي دالة `security definer`، بوستجرس بيخلّي `current_user` =
--   **صاحب الدالة** (postgres)، مش اللي بينادي. يعني الشرط:
--
--       if current_user in ('anon', 'authenticated') then ... end if;
--
--   عمره ما بيبقى true — فجسم الحارس كله ما بيتنفّذش أبدًا. التلات دوال دي
--   كانوا على النمط ده:
--       · fn_guard_booking_columns  (0054)
--       · fn_guard_pass_columns     (0042)
--       · fn_reveal                 (0062)
--
--   ⚠ مهم للتوضيح: الحماية الحقيقية لسه واقفة — سياسات RLS هي اللي بترفض
--   فعلًا (مفيش سياسة update للعضو على bookings ولا work_passes، وسياسة
--   الإدراج متضيّقة في 0054). الحراس دول كانوا **طبقة تانية** المفروض تمسك
--   لو حد وسّع سياسة بعدين. الطبقة دي كانت ديكور — دلوقتي بقت شغّالة.
--
-- الحل: نعرف اللي بينادي من **ادعاء الدور في التوكن** (request.jwt.claims)
-- مش من current_user:
--   · مفتاح anon    → role = 'anon'
--   · عضو داخل      → role = 'authenticated'
--   · مفتاح الخدمة  → role = 'service_role'   ← بيعدّي
--   · pg_cron داخلي → مفيش claims خالص        ← بيعدّي
-- ============================================================================

create or replace function fn_caller_is_browser()
returns boolean
language sql
stable
set search_path = public
as $$
  select coalesce(
    nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role',
    ''
  ) in ('anon', 'authenticated');
$$;

comment on function fn_caller_is_browser() is
  'true لو النداء جاي من المتصفح (مفتاح anon أو عضو داخل). مفتاح الخدمة والكرون بيرجّعوا false. بديل current_user اللي ما بيشتغلش جوه security definer.';

grant execute on function fn_caller_is_browser() to anon, authenticated, service_role;

-- ===== نبدّل الشرط المكسور في كل دالة عندها =====
do $$
declare
  f       record;
  new_src text;
  fixed   int := 0;
begin
  for f in
    select p.oid,
           p.oid::regprocedure as sig,
           p.proname,
           p.prosrc,
           pg_get_function_identity_arguments(p.oid) as args,
           pg_get_function_result(p.oid)             as ret,
           l.lanname
      from pg_proc p
      join pg_language l on l.oid = p.prolang
     where p.pronamespace = 'public'::regnamespace
       and p.prosecdef
       and p.prosrc like '%current_user in (''anon'', ''authenticated'')%'
  loop
    new_src := replace(
      f.prosrc,
      'current_user in (''anon'', ''authenticated'')',
      'fn_caller_is_browser()'
    );

    execute format(
      'create or replace function public.%I(%s) returns %s language %s security definer set search_path = public as %L',
      f.proname, f.args, f.ret, f.lanname, new_src
    );

    fixed := fixed + 1;
    raise notice '0063: اتصلّح حارس %', f.sig;
  end loop;

  if fixed = 0 then
    raise notice '0063: مفيش حاجة محتاجة تصليح — يا إما اتعمل قبل كده يا إما الدوال اتغيّرت';
  else
    raise notice '0063: إجمالي المتصلّح = %', fixed;
  end if;
end $$;

-- create or replace بيحافظ على الصلاحيات، بس نأكد على الحساس فيهم
revoke execute on function fn_guard_booking_columns() from public, anon, authenticated;
revoke execute on function fn_guard_pass_columns()    from public, anon, authenticated;
revoke execute on function fn_reveal(uuid)            from public, anon;
grant  execute on function fn_reveal(uuid)            to authenticated;

-- ===== اختبار الدفعة دي =====
create or replace function test_caller_guards()
returns table (test text, result text)
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  test := '0063 · مفيش حارس definer لسه بيعتمد على current_user';
  select count(*) into n from pg_proc
   where pronamespace = 'public'::regnamespace and prosecdef
     and prosrc like '%current_user in (''anon'', ''authenticated'')%';
  if n = 0 then
    result := 'نجح';
  else
    result := format('فشل — لسه %s دالة على الشرط المكسور', n);
  end if;
  return next;

  test := '0063 · التلات حراس بقوا على fn_caller_is_browser';
  select count(*) into n from pg_proc
   where pronamespace = 'public'::regnamespace
     and proname in ('fn_guard_booking_columns', 'fn_guard_pass_columns', 'fn_reveal')
     and prosrc like '%fn_caller_is_browser()%';
  if n = 3 then
    result := 'نجح — ٣ من ٣';
  else
    result := format('فشل — %s من ٣ بس', n);
  end if;
  return next;

  test := '0063 · fn_caller_is_browser بترجّع false للكرون (من غير توكن)';
  if fn_caller_is_browser() then
    result := 'فشل — بترجّع true وإحنا منادينها من SQL Editor من غير claims';
  else
    result := 'نجح';
  end if;
  return next;
end;
$$;

comment on function test_caller_guards() is
  'بتتأكد إن حراس definer بقوا بيعرفوا اللي بينادي صح. select * from test_caller_guards();';
revoke execute on function test_caller_guards() from public, anon, authenticated;
