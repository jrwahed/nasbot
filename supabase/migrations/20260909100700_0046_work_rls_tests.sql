-- طبقة «الشغل» — 7: اختبارات السياسات (WORK_PLAN §1.6 «اختبارات السياسات»).
-- نفس نمط 0017/0018: دالة security invoker بتتشغّل بمفتاح الخدمة/SQL Editor:
--   select * from test_work_rls();
-- بتجهّز بياناتها بنفسها وبتنضّفها في الآخر، فآمنة تتكرر.
-- لو اختبار رسب بترمي استثناء (وبيرجّع كل حاجة زي ما كانت)،
-- ولو كله نجح بتطلّع notice «ok» وبترجّع جدول النتايج.
-- (مش بتلمس test_rls() القديمة — الاتنين بيشتغلوا جنب بعض.)
create or replace function test_work_rls()
returns table (test text, result text)
language plpgsql
set search_path = public
as $$
declare
  a     uuid := '33333333-0000-0000-0000-000000000001'; -- مريم
  b     uuid := '33333333-0000-0000-0000-000000000003'; -- نور
  salma uuid := '33333333-0000-0000-0000-000000000005';
  tpl   uuid := '66666666-0000-0000-0000-000000000101'; -- sbota-shoghl
  ven   uuid := '55555555-0000-0000-0000-000000000101';
  s_before uuid := 'dddddddd-0000-0000-0000-000000000001'; -- الكشف لسه
  s_after  uuid := 'dddddddd-0000-0000-0000-000000000002'; -- اتكشفت
  v_pass   uuid := 'eeeeeeee-0000-0000-0000-000000000001';
  lead_phone text := '+201000000555';
  g_before uuid; g_after uuid;
  prof_id  uuid; old_prof uuid;
  n int; tmp text; lead_id uuid;
  failures text := '';
begin
  -- ===== تجهيز (بصلاحية اللي بينادي — مفتاح الخدمة) =====
  select id into prof_id from professions where key = 'design';
  if prof_id is null then raise exception 'البذرة مش موجودة — شغّل 0044 الأول'; end if;
  select profession_id into old_prof from profiles where id = b;
  update profiles set profession_id = prof_id where id = b;

  -- سبوطتين شغل: واحدة بعد 3 أيام (قبل الكشف) وواحدة بعد 6 ساعات (اتكشفت)
  insert into sbotat (id, template_id, venue_id, starts_at, ends_at, price, org_fee, capacity, status, is_day)
  values (s_before, tpl, ven, now() + interval '3 days', now() + interval '3 days 5 hours', 12000, 2000, 6, 'open', true)
  on conflict (id) do update set starts_at = excluded.starts_at, ends_at = excluded.ends_at, status = 'open';

  insert into sbotat (id, template_id, venue_id, starts_at, ends_at, price, org_fee, capacity, status, is_day)
  values (s_after, tpl, ven, now() + interval '6 hours', now() + interval '11 hours', 12000, 2000, 6, 'open', true)
  on conflict (id) do update set starts_at = excluded.starts_at, ends_at = excluded.ends_at, status = 'open';

  insert into sbota_groups (sbota_id, index) values (s_before, 1) on conflict (sbota_id, index) do nothing;
  insert into sbota_groups (sbota_id, index) values (s_after, 1)  on conflict (sbota_id, index) do nothing;
  select id into g_before from sbota_groups where sbota_id = s_before and index = 1;
  select id into g_after  from sbota_groups where sbota_id = s_after  and index = 1;

  insert into bookings (sbota_id, profile_id, group_id, status, price_paid)
  values (s_before, a, g_before, 'paid', 12000), (s_before, b, g_before, 'paid', 12000),
         (s_after,  a, g_after,  'paid', 12000), (s_after,  b, g_after,  'paid', 12000)
  on conflict (sbota_id, profile_id) do update set status = 'paid', group_id = excluded.group_id;

  -- رغبة تعاون بين نور وسلمى — مريم مالهاش دعوة بيها
  insert into work_affinity (a_id, b_id, a_wants_b) values (b, salma, true)
  on conflict (a_id, b_id) do nothing;

  -- كارت نشط لمريم
  insert into work_passes (id, profile_id, kind, sessions_total, sessions_used, status, starts_at, expires_at)
  values (v_pass, a, 'four', 4, 0, 'active', now(), now() + interval '6 weeks')
  on conflict (id) do update set sessions_used = 0, status = 'active';

  delete from leads where phone = lead_phone;

  -- ===== كعضو (مريم) =====
  set local role authenticated;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);

  -- 1 · قبل الكشف: مجال نور مخفي حتى عن نفس المجموعة
  select count(*) into n from work_group_members m where m.sbota_id = s_before and m.profile_id = b;
  test := '1 · عضو ما يقراش مجال عضو في مجموعته قبل الكشف';
  result := case when n = 0 then 'نجح' else 'رسب — شاف ' || n end;
  if n <> 0 then failures := failures || test || ' · '; end if;
  return next;

  -- 1ب · بعد الكشف: بيشوف المجال
  select count(*) into n from work_group_members m
  where m.sbota_id = s_after and m.profile_id = b and m.profession_ar = 'تصميم';
  test := '1ب · عضو يقرا مجال عضو في مجموعته بعد الكشف';
  result := case when n = 1 then 'نجح' else 'رسب — رجّع ' || n end;
  if n <> 1 then failures := failures || test || ' · '; end if;
  return next;

  -- 1ج · ولا مرة بيشوف الصف كله في profiles
  select count(*) into n from profiles p where p.id = b;
  test := '1ج · الكشف ما فتحش ملف نور كله';
  result := case when n = 0 then 'نجح' else 'رسب — شاف الصف' end;
  if n <> 0 then failures := failures || test || ' · '; end if;
  return next;

  -- 2 · work_affinity مقفولة
  select count(*) into n from work_affinity;
  test := '2 · لا يقرأ صف work_affinity لغيره';
  result := case when n = 0 then 'نجح' else 'رسب — قرأ ' || n || ' صف' end;
  if n <> 0 then failures := failures || test || ' · '; end if;
  return next;

  select fn_work_collab_state(b) into tmp;
  test := '2ب · fn_work_collab_state = none قبل التبادل';
  result := case when tmp = 'none' then 'نجح' else 'رسب — ' || coalesce(tmp, 'null') end;
  if tmp is distinct from 'none' then failures := failures || test || ' · '; end if;
  return next;

  -- 2ج · fn_work_want بتكتب جهتي بس — ولسه none لحد ما التاني يختارني
  perform fn_work_want(b, null);
  select fn_work_collab_state(b) into tmp;
  test := '2ج · اختياري لوحده ما بيعملش تبادل';
  result := case when tmp = 'none' then 'نجح' else 'رسب — ' || coalesce(tmp, 'null') end;
  if tmp is distinct from 'none' then failures := failures || test || ' · '; end if;
  return next;

  -- 2د · لما نور تختارني: mutual + إشعار للاتنين
  perform set_config('request.jwt.claims', json_build_object('sub', b, 'role', 'authenticated')::text, true);
  select fn_work_want(a, null) into tmp;
  select count(*) into n from notifications nt
  where nt.profile_id = b and nt.template_key = 'work_collab_match' and nt.payload ->> 'other_id' = a::text;
  test := '2د · التبادل بيفتح mutual وبيبعت work_collab_match';
  result := case when tmp = 'mutual' and n >= 1 then 'نجح' else 'رسب — ' || coalesce(tmp, 'null') || ' / إشعارات ' || n end;
  if tmp is distinct from 'mutual' or n < 1 then failures := failures || test || ' · '; end if;
  return next;
  perform set_config('request.jwt.claims', json_build_object('sub', a, 'role', 'authenticated')::text, true);

  -- 3 · سعر الجملة مش شايفه: الجدول فاضي والعرض مفيهوش العمود
  select count(*) into n from work_venues;
  test := '3 · لا يشوف wholesale_seat_price (الجدول)';
  result := case when n = 0 then 'نجح' else 'رسب — قرأ ' || n || ' صف من work_venues' end;
  if n <> 0 then failures := failures || test || ' · '; end if;
  return next;

  select count(*) into n from information_schema.columns c
  where c.table_schema = 'public' and c.table_name = 'work_venues_public'
    and c.column_name in ('wholesale_seat_price', 'notes_ar');
  test := '3ب · work_venues_public من غير wholesale_seat_price / notes_ar';
  result := case when n = 0 then 'نجح' else 'رسب — العمود موجود في العرض' end;
  if n <> 0 then failures := failures || test || ' · '; end if;
  return next;

  -- 4 · تعديل sessions_used مباشرة: يا إمّا يترفض يا إمّا يعدّي على صفر صفوف
  begin
    update work_passes set sessions_used = 3 where id = v_pass;
  exception when others then null;
  end;
  select sessions_used::text into tmp from work_passes where id = v_pass;
  test := '4 · لا يعدّل sessions_used مباشرة';
  result := case when tmp = '0' then 'نجح' else 'رسب — بقت ' || coalesce(tmp, '?') end;
  if tmp is distinct from '0' then failures := failures || test || ' · '; end if;
  return next;

  -- ===== كزائر (anon) =====
  set local role anon;
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);

  begin
    select fn_submit_lead('شركة تجريبية', 'اختبار', lead_phone, 5, 2, 'من test_work_rls') into lead_id;
    result := case when lead_id is not null then 'نجح' else 'رسب — رجّعت null' end;
  exception when others then
    result := 'رسب — ' || left(sqlerrm, 60);
  end;
  test := '5 · anon يدرج في leads عبر fn_submit_lead';
  if result not like 'نجح%' then failures := failures || test || ' · '; end if;
  return next;

  begin
    select count(*) into n from leads;
  exception when others then n := 0;
  end;
  test := '5ب · anon ما يقراش leads';
  result := case when n = 0 then 'نجح' else 'رسب — قرأ ' || n end;
  if n <> 0 then failures := failures || test || ' · '; end if;
  return next;

  begin
    insert into leads (company, contact_name, phone) values ('مباشر', 'اختبار', lead_phone);
    result := 'رسب — الإدراج المباشر عدّى';
  exception when others then
    result := 'نجح — اترفض: ' || left(sqlerrm, 40);
  end;
  test := '5ج · anon ما يدرجش في leads مباشرة';
  if result not like 'نجح%' then failures := failures || test || ' · '; end if;
  return next;

  -- حد المعدل: التالت بيعدّي والرابع بيترفض
  begin
    perform fn_submit_lead('شركة تجريبية', 'اختبار', lead_phone, 5, 2, '2');
    perform fn_submit_lead('شركة تجريبية', 'اختبار', lead_phone, 5, 2, '3');
    perform fn_submit_lead('شركة تجريبية', 'اختبار', lead_phone, 5, 2, '4');
    result := 'رسب — الرابع عدّى';
  exception when others then
    result := 'نجح — اترفض: ' || left(sqlerrm, 40);
  end;
  test := '5د · حد المعدل 3 في اليوم لكل رقم';
  if result not like 'نجح%' then failures := failures || test || ' · '; end if;
  return next;

  reset role;

  -- ===== تنضيف =====
  delete from leads where phone = lead_phone;
  delete from work_affinity where (a_id = b and b_id = salma) or (a_id = a and b_id = b);
  delete from notifications where template_key = 'work_collab_match' and profile_id in (a, b);
  delete from pass_redemptions where pass_id = v_pass;
  delete from work_passes where id = v_pass;
  delete from sbotat where id in (s_before, s_after); -- بيمسح الحجوزات والمجموعات معاها
  update profiles set profession_id = old_prof where id = b;

  if failures <> '' then
    raise exception 'اختبارات الشغل رسبت: %', failures;
  end if;
  raise notice 'ok';
end $$;
comment on function test_work_rls() is 'اختبارات سياسات طبقة الشغل — select * from test_work_rls(); بترمي استثناء لو حاجة رسبت.';

revoke execute on function test_work_rls() from public, anon, authenticated;
