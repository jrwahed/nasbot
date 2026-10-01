-- ============================================================================
-- WORK_MIGRATION_43.sql — «مكتملة» من اللوحة = مكتملة في قايمة الانتظار كمان
--
-- لما المالك يقلب الخروجة «مكتملة» بإيده، زرار «سجلني في الانتظار» كان بيقع
-- («فيه مكان — احجز على طول») لأن الدالة كانت بتعدّ الحجوزات الحقيقية بس.
--
-- ⚠ محتاج WORK_MIGRATION_39 قبله.
--
-- بعده شغّل (لزقة واحدة):
--   do $$ begin perform fn_test_seed_up(); end $$;
--   create temp table _r as select * from test_full_means_full();
--   do $$ begin perform fn_test_seed_down(); end $$;
--   select * from _r;                       -- ٣ صفوف «نجح»
-- ============================================================================

-- ##########################################################################
-- # 20261001120000_0124_full_means_full.sql
-- ##########################################################################

-- ============================================================================
-- 0124 · «مكتملة» من اللوحة = مكتملة في قايمة الانتظار كمان
--
-- طلب المالك (٢٠٢٦-١٠-٠١): لما يقلب الخروجة «مكتملة» بإيده، الصفحة تقول
-- «6 من 6» (ده في الكود — `map-db.ts`). وده كشف باج في نفس الطريق:
-- `fn_seat_for` (`0120`) كانت بتعدّ الحجوزات الحقيقية بس، فخروجة مقلوبة
-- `full` وفيها صفر حجوزات كانت بتقول «فيه مكان» — و`fn_join_waitlist`
-- ترفض («فيه مكان — احجز على طول») و`fn_can_book` كمان ترفض (مش مفتوحة).
-- يعني زرار «سجلني في الانتظار» يقع، وزرار الحجز مقفول. طريق مسدود.
--
-- التصليح: الحالة `full` لوحدها = مفيش مكان. ولما حد يلغي، `fn_cancel_booking`
-- بتقلبها `open` **قبل** ما تنادي `fn_waitlist_notify` — فالإشعار شغّال زي ما هو.
--
-- ⚠ نفس دالة `0120` بالحرف + سطر واحد. إعادة لزق `0120` بترجّع القديمة —
--   `test_full_means_full()` بيمسكها.
--
-- آمن يتكرر.
-- ============================================================================

create or replace function fn_seat_for(p_id uuid, s_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s    sbotat;
  used int;
begin
  select * into s from sbotat where id = s_id;
  if not found then return 'السبوطة دي مش موجودة'; end if;
  if s.status not in ('open', 'full') then return 'السبوطة مش مفتوحة للحجز'; end if;

  -- (0124) المالك قلبها «مكتملة» من اللوحة — مكتملة، مهما كان العدد الحقيقي
  if s.status = 'full' then return 'full'; end if;

  select count(*) into used from bookings
   where sbota_id = s_id and status in ('paid', 'attended');
  if used >= s.capacity then return 'full'; end if;

  if fn_gender_block(p_id, s_id) is not null then return 'full'; end if;
  return null;
end;
$$;
revoke execute on function fn_seat_for(uuid, uuid) from public, anon, authenticated;


-- ===== الاختبار =====
-- ⚠ محتاج `fn_test_seed_up()` قبله. كل الكتابة بترجع باستثناء متعمّد.
create or replace function test_full_means_full()
returns table (test text, result text)
language plpgsql
set search_path = public
as $body$
declare
  me  text := current_user;
  tpl uuid := '66666666-0000-0000-0000-000000000004';
  ven uuid := '55555555-0000-0000-0000-000000000004';
  s1  uuid := '77777777-0000-0000-0000-000000000124';
  f3  uuid := '33333333-0000-0000-0000-000000000003';
  names text[] := array[
    '0124 · خروجة «مكتملة» من اللوحة = مفيش مكان (حتى لو صفر حجوزات)',
    '0124 · العضو يقدر يدخل قايمة انتظارها',
    '0124 · ولو رجعت «مفتوحة» فيه مكان تاني'];
  r text[] := '{}';
  n int;
  i int;
begin
  if not exists (select 1 from profiles where id = f3)
     or not exists (select 1 from sbota_templates where id = tpl) then
    test := '0124 · مكتملة = مكتملة';
    result := 'معلومة — محتاج البذرة المؤقتة (fn_test_seed_up)';
    return next;
    return;
  end if;

  begin
    update profiles set gate_status = 'approved', birth_year = extract(year from now())::int - 25,
                        deleted_at = null, banned_at = null
     where id = f3;
    insert into sbotat (id, template_id, venue_id, starts_at, ends_at, price, org_fee,
                        capacity, status, girls_only, is_day, is_mystery)
    values (s1, tpl, ven, now() + interval '6 days', now() + interval '6 days 2 hours',
            15000, 0, 6, 'full', false, false, false);

    r := r || case when fn_seat_for(f3, s1) = 'full' then 'نجح'
                   else 'فشل — بتقول فيه مكان والخروجة مقفولة' end;

    perform set_config('request.jwt.claims',
      json_build_object('sub', f3, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      n := fn_join_waitlist(s1);
      r := r || case when n = 1 then 'نجح' else format('فشل — رقمه %s', n) end;
    exception when others then
      r := r || ('فشل — زرار «سجلني في الانتظار» وقع: ' || sqlerrm);
    end;
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);

    update sbotat set status = 'open' where id = s1;
    r := r || case when fn_seat_for(f3, s1) is null then 'نجح'
                   else 'فشل — مفتوحة وفاضية وبتقول مفيش مكان' end;

    raise exception 'test_full_means_full_rollback';
  exception when others then
    if sqlerrm <> 'test_full_means_full_rollback' then
      r := r || ('فشل — استثناء: ' || sqlerrm);
    end if;
  end;
  execute format('set local role %I', me);
  perform set_config('request.jwt.claims', '', true);

  for i in 1 .. array_length(r, 1) loop
    test := coalesce(names[i], '0124 · الاختبار');
    result := r[i];
    return next;
  end loop;
end $body$;

comment on function test_full_means_full() is
  '0124 — الخروجة اللي اتقلبت «مكتملة» من اللوحة مفيهاش مكان، وقايمة انتظارها شغّالة.';
revoke execute on function test_full_means_full() from public, anon, authenticated;
