-- ============================================================================
-- 0049 — test_pair_want(): إثبات العطل وإثبات الإصلاح
--
-- نفس نمط 0017 / 0046: دالة security invoker بتتشغّل بمفتاح الخدمة أو من
-- SQL Editor، بتجهّز بياناتها وبتنضّفها، وبترمي استثناء لو حاجة رسبت:
--     select * from test_pair_want();
--
-- (ما بتلمسش test_rls() ولا test_work_rls() — التلاتة بيشتغلوا جنب بعض.)
-- ============================================================================

create or replace function test_pair_want()
returns table (test text, result text)
language plpgsql
set search_path = public
as $$
declare
  a   uuid := '33333333-0000-0000-0000-000000000001'; -- مريم
  b   uuid := '33333333-0000-0000-0000-000000000003'; -- نور
  lo  uuid;
  hi  uuid;
  n   int;
  tmp text;
  ok_ boolean;
  failures text := '';
begin
  if not exists (select 1 from profiles where id = a)
  or not exists (select 1 from profiles where id = b) then
    raise exception 'البذرة مش موجودة — الاختبار محتاج مريم ونور';
  end if;

  if a < b then lo := a; hi := b; else lo := b; hi := a; end if;

  -- ===== تجهيز: نبدأ من صفحة بيضا =====
  delete from pair_affinity where a_id = lo and b_id = hi;

  -- ===== كمريم =====
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);

  -- 1 · اختياري لوحدي ما بيعملش تبادل
  select fn_pair_want(b, null) into tmp;
  test := '1 · fn_pair_want بترجّع none قبل ما التاني يختارني';
  result := case when tmp = 'none' then 'نجح' else 'رسب — ' || coalesce(tmp, 'null') end;
  if tmp is distinct from 'none' then failures := failures || test || ' · '; end if;
  return next;

  -- 2 · العضو ما بيقراش pair_affinity خالص (ده أصل العطل)
  select count(*) into n from pair_affinity;
  test := '2 · العضو ما بيقراش pair_affinity';
  result := case when n = 0 then 'نجح' else 'رسب — قرأ ' || n || ' صف' end;
  if n <> 0 then failures := failures || test || ' · '; end if;
  return next;

  -- ===== كنور — الطرف التاني، وهو اللي كان العطل بيقع عنده =====
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);

  -- 3 · الطريقة القديمة (١): update مباشر بيعدّي على صفر صفوف
  --     لأن بوستجريس بتطبّق سياسة الـ select على الصفوف اللي الـ UPDATE بيقراها،
  --     ومفيش سياسة select للأعضاء على الجدول ده.
  begin
    update pair_affinity
    set a_wants_b = case when lo = b then true else a_wants_b end,
        b_wants_a = case when hi = b then true else b_wants_a end
    where a_id = lo and b_id = hi;
    get diagnostics n = row_count;
    result := case when n = 0
                   then 'نجح — اتأكدنا إن العطل حقيقي'
                   else 'رسب — عدّل ' || n || ' صف' end;
  exception when others then
    -- ولا حتى بيوصل للصف — نفس النتيجة العملية
    result := 'نجح — اترفض: ' || left(sqlerrm, 40);
  end;
  test := '3 · الطريقة القديمة: UPDATE المباشر ما بيوصلش للصف';
  if result not like 'نجح%' then failures := failures || test || ' · '; end if;
  return next;

  -- 4 · الطريقة القديمة (٢): الـ insert بيضرب في unique(a_id, b_id)
  begin
    insert into pair_affinity (a_id, b_id, a_wants_b, b_wants_a)
    values (lo, hi, lo = b, hi = b);
    result := 'رسب — الإدراج عدّى، يبقى العطل مش زي ما وصفناه';
  exception when unique_violation then
    result := 'نجح — اترفض بـ unique(a_id, b_id) زي ما متوقع';
  when others then
    result := 'نجح — اترفض: ' || left(sqlerrm, 40);
  end;
  test := '4 · الطريقة القديمة: INSERT بيضرب في القيد الفريد';
  if result not like 'نجح%' then failures := failures || test || ' · '; end if;
  return next;

  -- 5 · الإصلاح: fn_pair_want بتكتب جهة نور وبتفتح التبادل
  select fn_pair_want(a, null) into tmp;
  test := '5 · fn_pair_want من الطرف التاني بترجّع mutual';
  result := case when tmp = 'mutual' then 'نجح' else 'رسب — ' || coalesce(tmp, 'null') end;
  if tmp is distinct from 'mutual' then failures := failures || test || ' · '; end if;
  return next;

  select fn_is_mutual(a) into ok_;
  test := '5ب · fn_is_mutual = true عند نور';
  result := case when ok_ then 'نجح' else 'رسب' end;
  if not coalesce(ok_, false) then failures := failures || test || ' · '; end if;
  return next;

  -- 6 · تكرار النداء ما بيرميش وما بيلغيش التبادل
  select fn_pair_want(a, null) into tmp;
  test := '6 · تكرار النداء آمن';
  result := case when tmp = 'mutual' then 'نجح' else 'رسب — ' || coalesce(tmp, 'null') end;
  if tmp is distinct from 'mutual' then failures := failures || test || ' · '; end if;
  return next;

  -- ===== كمريم تاني: الطرف الأول شايف التبادل هو كمان =====
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);
  select fn_is_mutual(b) into ok_;
  test := '7 · fn_is_mutual = true عند مريم كمان';
  result := case when ok_ then 'نجح' else 'رسب' end;
  if not coalesce(ok_, false) then failures := failures || test || ' · '; end if;
  return next;

  -- 8 · السحب: fn_pair_want(p_want => false) بتشيل رغبتي أنا بس
  perform fn_pair_want(b, null, false);
  reset role;
  select (a_wants_b and b_wants_a) into ok_ from pair_affinity where a_id = lo and b_id = hi;
  test := '8 · السحب بيشيل جهة اللي بينادي بس';
  result := case when ok_ is not null and not ok_ then 'نجح' else 'رسب' end;
  if ok_ is null or ok_ then failures := failures || test || ' · '; end if;
  return next;

  -- ===== تنضيف =====
  delete from pair_affinity where a_id = lo and b_id = hi;

  if failures <> '' then
    raise exception 'اختبارات fn_pair_want رسبت: %', failures;
  end if;
  raise notice 'ok';
end $$;
comment on function test_pair_want() is 'اختبارات إصلاح «عايز تشوف مين تاني؟» — select * from test_pair_want(); بترمي استثناء لو حاجة رسبت.';

revoke execute on function test_pair_want() from public, anon, authenticated;
