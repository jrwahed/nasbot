-- ============================================================================
-- الجزء ٤ — طبقة «الشغل»: أغلفة صلاحيات اللوحة، وقايمة «شغالين معاك»، والشات
--
-- الزقه مرة واحدة. مفيش قيم enum جديدة فمفيش تقسيم.
-- شرط: الأجزاء ١ و٢ و٣ اتطبّقوا قبله.
-- آمن يتكرر.
--
-- فيه حاجة أمنية مهمة: fn_venue_report كانت مصرّحة لأي عضو مسجّل من غير أي
-- فحص صلاحية — يعني أي حد داخل يقدر يكتب صفوف في تقارير الأماكن. الجزء ده
-- بيسحب التصريح ويخلي الوصول عبر غلاف بصلاحية payments.review بس.
--
-- بعد ما يخلص شغّل التلاتة دول — لازم كلهم «نجح»:
--     select * from test_work_admin_rpcs();
--     select * from test_work_collabs();
--     select * from test_pair_want();
-- ============================================================================

-- ############################################################################
-- # 0050 — أغلفة صلاحيات اللوحة
-- ############################################################################

-- ============================================================================
-- 0050 — أغلفة اللوحة لمهام «الشغل» (WORK_PLAN §5 — المرحلة 6)
--
-- المشكلة اللي الملف ده بيحلها:
--   المهام في 0045 (`job_work_recurring`, `job_work_metrics`) ممنوحة لـ
--   `service_role` بس، عشان pg_cron هو اللي بيشغّلها. يعني أي زرار في اللوحة
--   بينادي عليها من المتصفح بيرجع «permission denied» — فتبويب «الأيام الثابتة»
--   طلع من غير زر «ولّد دلوقتي»، وتبويب «المؤشرات» ماكانش يقدر يجدّد الأرقام.
--
--   وعلى الناحية التانية `fn_venue_report(date)` في 0042 اتمنحت لـ
--   `authenticated` **من غير أي فحص صلاحية** وهي `security definer` — يعني أي
--   عضو مسجّل يقدر ينادي عليها ويكتب صفوف في `venue_reports`. مش تسريب بيانات
--   (الدالة بتكتب بس)، بس ده باب مفتوح من غير سبب. الملف ده بيقفله.
--
-- اللي فيه:
--   1. `fn_admin_run_work_recurring()`    → غلاف على `job_work_recurring()`
--                                            مقفول على `bookings.edit`
--   2. `fn_admin_build_venue_report(date)`→ غلاف على `fn_venue_report()`
--                                            مقفول على `payments.review`
--   3. `fn_admin_refresh_work_metrics()`  → غلاف على `job_work_metrics()`
--                                            مقفول على `settings.view`
--   4. سحب `execute` على `fn_venue_report(date)` من `authenticated`
--   5. `test_work_admin_rpcs()` — اختبارات الأغلفة (نمط 0046)
--
-- كل غلاف: `revoke execute from public, anon;` + `grant execute to authenticated;`
-- وفحص صلاحية صريح بيرمي استثناء بالعربي.
--
-- آمن يتكرر: كله `create or replace`، ومفيش ولا صف بيتمسح.
-- ============================================================================


-- ===== 1 · «ولّد دلوقتي» للأيام الثابتة — bookings.edit =====
-- بتنادي نفس المهمة اللي على pg_cron بالحرف، فالنتيجة واحدة سواء اتشغّلت
-- في ميعادها أو من اللوحة. بترجّع عدد الصفوف اللي اتعامل معاها.
create or replace function fn_admin_run_work_recurring()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  if not fn_has_permission('bookings.edit') then
    raise exception 'التوليد اليدوي محتاج صلاحية bookings.edit';
  end if;
  select job_work_recurring() into n;
  return coalesce(n, 0);
end;
$$;
comment on function fn_admin_run_work_recurring() is
  'زر «ولّد دلوقتي» في /admin/shoghl — غلاف على job_work_recurring() مقفول على bookings.edit.';
revoke execute on function fn_admin_run_work_recurring() from public, anon;
grant  execute on function fn_admin_run_work_recurring() to authenticated;


-- ===== 2 · «ابنِ تقرير الأسبوع» — payments.review =====
-- p_week_start فاضية = الأسبوع اللي فات (الاتنين بتوقيت القاهرة) — نفس اللي
-- بتحسبه job_work_venue_reports بالظبط. وأي تاريخ بيتظبّط على الاتنين بتاعه
-- علشان مايبقاش فيه أسبوعين نص في venue_reports.
create or replace function fn_admin_build_venue_report(p_week_start date default null)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_week date;
  n int;
begin
  if not fn_has_permission('payments.review') then
    raise exception 'بناء تقرير الأسبوع محتاج صلاحية payments.review';
  end if;

  v_week := date_trunc(
    'week',
    coalesce(p_week_start, ((now() at time zone 'Africa/Cairo')::date - 7))::timestamp
  )::date;

  if v_week > (now() at time zone 'Africa/Cairo')::date then
    raise exception 'مينفعش تبني تقرير لأسبوع لسه ماجاش';
  end if;

  select fn_venue_report(v_week) into n;
  return coalesce(n, 0);
end;
$$;
comment on function fn_admin_build_venue_report(date) is
  'زر «ابنِ تقرير الأسبوع» في /admin/shoghl — غلاف على fn_venue_report() مقفول على payments.review. الأسبوع بيتظبّط على الاتنين.';
revoke execute on function fn_admin_build_venue_report(date) from public, anon;
grant  execute on function fn_admin_build_venue_report(date) to authenticated;


-- ===== 3 · «حدّث الأرقام» للمؤشرات — settings.view =====
-- نفس صلاحية قراءة المؤشرات (fn_work_metrics) — اللي بيقرا الأرقام بيقدر
-- يجدّدها. بترجّع وقت التجديد علشان اللوحة تقول «اتحدّثت الساعة كذا».
create or replace function fn_admin_refresh_work_metrics()
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
begin
  if not fn_has_permission('settings.view') then
    raise exception 'تحديث المؤشرات محتاج صلاحية settings.view';
  end if;
  perform job_work_metrics();
  return now();
end;
$$;
comment on function fn_admin_refresh_work_metrics() is
  'زر «حدّث الأرقام» في /admin/shoghl — غلاف على job_work_metrics() مقفول على settings.view.';
revoke execute on function fn_admin_refresh_work_metrics() from public, anon;
grant  execute on function fn_admin_refresh_work_metrics() to authenticated;


-- ===== 4 · قفل fn_venue_report على الخادم والغلاف بس =====
-- كانت ممنوحة لـ authenticated في 0042 من غير فحص صلاحية. المهمة المجدولة
-- (job_work_venue_reports) و الغلاف فوق الاتنين security definer ومملوكين
-- لصاحب الهجرة، فبينادوا عليها بصلاحيته — السحب ده ما بيكسرش ولا واحد فيهم.
revoke execute on function fn_venue_report(date) from authenticated;


-- ============================================================================
-- 5 · الاختبارات — نمط 0046 بالحرف
--     select * from test_work_admin_rpcs();
-- بتجهّز بياناتها وبتنضّف وراها، وبترمي استثناء لو حاجة رسبت.
-- ما بتشغّلش job_work_recurring ولا التجديد بجد: دول بيعملوا حجوزات وإشعارات
-- حقيقية، فالاختبار بيتأكد من **بوابة الصلاحية والمنح** بس — وده اللي الملف
-- ده مسؤول عنه. المسار السعيد لبناء التقرير بيتجرّب على أسبوع قديم فاضي.
-- ============================================================================
create or replace function test_work_admin_rpcs()
returns table (test text, result text)
language plpgsql
set search_path = public
as $$
declare
  member_id uuid := '33333333-0000-0000-0000-000000000001'; -- عضوة عادية
  admin_id  uuid := '33333333-0000-0000-0000-000000000005'; -- بنخليها owner مؤقتًا
  old_role  text;
  old_live  boolean;
  had_admin boolean := false;
  test_week date := date '2019-01-07';  -- اتنين قديم — مفيش سبوطات فيه
  n int;
  ok_ boolean;
  failures text := '';
begin
  if not exists (select 1 from profiles where id = member_id)
     or not exists (select 1 from profiles where id = admin_id) then
    raise exception 'البذرة مش موجودة — شغّل بذرة الحسابات الأول';
  end if;

  -- ===== المنح: مين ليه ينادي أصلًا =====
  ok_ := has_function_privilege('authenticated', 'fn_admin_run_work_recurring()', 'execute');
  test := '1 · authenticated ليها execute على fn_admin_run_work_recurring';
  result := case when ok_ then 'نجح' else 'رسب — المنح ناقص' end;
  if not ok_ then failures := failures || test || ' · '; end if;
  return next;

  ok_ := has_function_privilege('anon', 'fn_admin_run_work_recurring()', 'execute');
  test := '1ب · anon ماعندهاش execute على fn_admin_run_work_recurring';
  result := case when not ok_ then 'نجح' else 'رسب — anon تقدر تنادي' end;
  if ok_ then failures := failures || test || ' · '; end if;
  return next;

  ok_ := has_function_privilege('anon', 'fn_admin_build_venue_report(date)', 'execute')
      or has_function_privilege('anon', 'fn_admin_refresh_work_metrics()', 'execute');
  test := '1ج · anon ماعندهاش execute على غلافي التقارير والمؤشرات';
  result := case when not ok_ then 'نجح' else 'رسب — anon تقدر تنادي' end;
  if ok_ then failures := failures || test || ' · '; end if;
  return next;

  -- fn_venue_report اتقفلت على authenticated (البند 4)
  ok_ := has_function_privilege('authenticated', 'fn_venue_report(date)', 'execute');
  test := '2 · fn_venue_report مابقتش مفتوحة لأي عضو مسجّل';
  result := case when not ok_ then 'نجح' else 'رسب — لسه ممنوحة لـ authenticated' end;
  if ok_ then failures := failures || test || ' · '; end if;
  return next;

  -- ===== كعضوة من غير أي صلاحية لوحة =====
  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', member_id, 'role', 'authenticated')::text, true);

  begin
    perform fn_admin_run_work_recurring();
    result := 'رسب — التوليد عدّى من غير صلاحية';
  exception when others then
    result := 'نجح — اترفض: ' || left(sqlerrm, 40);
  end;
  test := '3 · عضوة عادية ما تولّدش الأيام الثابتة';
  if result not like 'نجح%' then failures := failures || test || ' · '; end if;
  return next;

  begin
    perform fn_admin_build_venue_report(test_week);
    result := 'رسب — بناء التقرير عدّى من غير صلاحية';
  exception when others then
    result := 'نجح — اترفض: ' || left(sqlerrm, 40);
  end;
  test := '4 · عضوة عادية ما تبنيش تقرير الأماكن';
  if result not like 'نجح%' then failures := failures || test || ' · '; end if;
  return next;

  begin
    perform fn_admin_refresh_work_metrics();
    result := 'رسب — التجديد عدّى من غير صلاحية';
  exception when others then
    result := 'نجح — اترفض: ' || left(sqlerrm, 40);
  end;
  test := '5 · عضوة عادية ما تحدّثش المؤشرات';
  if result not like 'نجح%' then failures := failures || test || ' · '; end if;
  return next;

  begin
    perform fn_venue_report(test_week);
    result := 'رسب — النداء المباشر عدّى';
  exception when others then
    result := 'نجح — اترفض: ' || left(sqlerrm, 40);
  end;
  test := '6 · عضوة عادية ما تناديش fn_venue_report مباشرة';
  if result not like 'نجح%' then failures := failures || test || ' · '; end if;
  return next;

  reset role;

  -- ===== نفس الحسابة وهي في اللوحة بدور owner =====
  -- لو الحساب ده أصلًا في اللوحة بدور تاني، بنرجّعه زي ما كان في التنضيف تحت.
  select role_key, is_active into old_role, old_live
    from admin_users where profile_id = admin_id;
  had_admin := old_role is not null;
  if had_admin then
    update admin_users set role_key = 'owner', is_active = true where profile_id = admin_id;
  else
    insert into admin_users (profile_id, role_key, is_active) values (admin_id, 'owner', true);
  end if;

  set local role authenticated;
  perform set_config('request.jwt.claims',
    json_build_object('sub', admin_id, 'role', 'authenticated')::text, true);

  begin
    select fn_admin_build_venue_report(test_week) into n;
    result := case when n is not null then 'نجح — رجّع ' || n else 'رسب — رجّع null' end;
  exception when others then
    result := 'رسب — ' || left(sqlerrm, 60);
  end;
  test := '7 · صاحب payments.review يبني تقرير الأسبوع';
  if result not like 'نجح%' then failures := failures || test || ' · '; end if;
  return next;

  -- الأسبوع بيتظبّط على الاتنين حتى لو التاريخ نص الأسبوع
  begin
    perform fn_admin_build_venue_report(test_week + 3);  -- خميس
    select count(*) into n from venue_reports where week_start = test_week + 3;
    result := case when n = 0 then 'نجح' else 'رسب — اتكتب أسبوع مش اتنين' end;
  exception when others then
    n := -1;
    result := 'رسب — ' || left(sqlerrm, 60);
  end;
  test := '8 · أي تاريخ بيتظبّط على اتنين الأسبوع';
  if result not like 'نجح%' then failures := failures || test || ' · '; end if;
  return next;

  -- أسبوع لسه ماجاش بيترفض
  begin
    perform fn_admin_build_venue_report(((now() at time zone 'Africa/Cairo')::date + 30));
    result := 'رسب — بنى تقرير لأسبوع جاي';
  exception when others then
    result := 'نجح — اترفض: ' || left(sqlerrm, 40);
  end;
  test := '9 · أسبوع في المستقبل بيترفض';
  if result not like 'نجح%' then failures := failures || test || ' · '; end if;
  return next;

  ok_ := fn_has_permission('bookings.edit');
  test := '10 · بوابة fn_admin_run_work_recurring بتعدّي صاحب bookings.edit';
  result := case when ok_ then 'نجح' else 'رسب — الصلاحية مش موجودة للدور' end;
  if not ok_ then failures := failures || test || ' · '; end if;
  return next;

  reset role;

  -- ===== تنضيف =====
  delete from venue_reports where week_start = test_week;
  if had_admin then
    update admin_users set role_key = old_role, is_active = old_live
     where profile_id = admin_id;
  else
    delete from admin_users where profile_id = admin_id;
  end if;

  if failures <> '' then
    raise exception 'اختبارات أغلفة اللوحة رسبت: %', failures;
  end if;
  raise notice 'ok';
end $$;
comment on function test_work_admin_rpcs() is
  'اختبارات أغلفة اللوحة (0050) — select * from test_work_admin_rpcs(); بترمي استثناء لو حاجة رسبت.';

revoke execute on function test_work_admin_rpcs() from public, anon, authenticated;


-- ############################################################################
-- # 0051 — قايمة التبادل وفتح الشات
-- ############################################################################

-- طبقة «الشغل» — 6: قايمة «شغالين معاك»، وفتح الشات لتبادل الشغل.
--
-- حاجتين طلعوا وإحنا بنوصّل الواجهة:
--
--  1. مفيش دالة بترجّع «مين بيني وبينهم تبادل شغل». الواجهة كانت بتبنيها من
--     حجوزاتي ← work_group_members ← نداء fn_work_collab_state لكل واحد
--     (٥ استعلامات + ١٨ نداء). وكمان ما كانتش بتعرف تسمّي السبوطة اللي
--     اتقابلوا فيها، لأن sbotat_public بتعرض المفتوح بس والتبادل بييجي من
--     سبوطة **خلصت**.
--
--  2. زرار «ابعتله» كان بيرفض. fn_open_one_on_one بتتحقق بـ fn_is_mutual
--     اللي بتقرا pair_affinity بس — فاتنين اختاروا بعض في سؤال **الشغل**
--     كان الشات بيتقفل في وشهم بالرغم إن التبادل حصل فعلًا.
--
-- الاتنين اتحلوا هنا. السرية زي ما هي: مفيش صف بيرجع إلا لو mutual_at
-- متحطوط، يعني الاختيار من طرف واحد عمره ما يبان.

/* ==================================================== 1) قايمة التبادل */

create or replace function fn_my_work_collabs()
returns table (
  profile_id       uuid,
  first_name       text,
  profession_ar    text,
  profession_icon  text,
  profession_color text,
  sbota_id         uuid,
  sbota_name_ar    text,
  venue_name       text,
  mutual_at        timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id, o.first_name, pr.name_ar, pr.icon_key, pr.color,
    s.id, t.name_ar, v.name, wa.mutual_at
  from work_affinity wa
  join profiles o
    on o.id = case when wa.a_id = auth.uid() then wa.b_id else wa.a_id end
  left join professions      pr on pr.id = o.profession_id
  left join bookings         b  on b.id  = wa.met_in_booking_id
  left join sbotat           s  on s.id  = b.sbota_id and s.is_work
  left join sbota_templates  t  on t.id  = s.template_id
  left join venues           v  on v.id  = s.venue_id
  where wa.mutual_at is not null
    and (wa.a_id = auth.uid() or wa.b_id = auth.uid())
    and o.deleted_at is null
  order by wa.mutual_at desc
  limit 50;
$$;
comment on function fn_my_work_collabs() is
  'اللي بيني وبينهم تبادل شغل — التبادل بس، مفيش أي اختيار من طرف واحد. تاني وصول مسموح لـ work_affinity بعد fn_work_collab_state.';
revoke execute on function fn_my_work_collabs() from public, anon;
grant  execute on function fn_my_work_collabs() to authenticated, service_role;

/* ============================== 2) الشات يفتح لتبادل الشغل كمان */

create or replace function fn_open_one_on_one(other_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  rid uuid;
  me  uuid := auth.uid();
begin
  if me is null then raise exception 'لازم تسجل دخول'; end if;

  -- التبادل في سؤال «تشوف مين تاني» (pair_affinity) **أو** في سؤال
  -- «تشتغل مع مين» (work_affinity). الاتنين تبادل حقيقي بموافقة الطرفين.
  if not (fn_is_mutual(other_id) or fn_work_collab_state(other_id) = 'mutual') then
    raise exception 'الشات ده بيتفتح بس لما تكونوا اخترتوا بعض';
  end if;

  select r.id into rid
  from chat_rooms r
  where r.kind = 'one_on_one'
    and (select count(*) from chat_members m
         where m.room_id = r.id and m.profile_id in (me, other_id)) = 2
  limit 1;

  if rid is not null then return rid; end if;

  insert into chat_rooms (kind, opens_at) values ('one_on_one', now()) returning id into rid;
  insert into chat_members (room_id, profile_id) values (rid, me), (rid, other_id);
  return rid;
end;
$$;
comment on function fn_open_one_on_one(uuid) is
  'بيفتح غرفة خاصة بين اتنين اختاروا بعض — في التقييم العادي أو في سؤال الشغل — وبيرفض غير كده.';
revoke execute on function fn_open_one_on_one(uuid) from public, anon;
grant  execute on function fn_open_one_on_one(uuid) to authenticated;

/* ==================================================== 3) تأكيد سريع */

create or replace function test_work_collabs()
returns table (test text, result text)
language plpgsql
security definer
set search_path = public
as $$
begin
  test := '1 · fn_my_work_collabs موجودة ومقفولة على anon';
  if not exists (select 1 from pg_proc where proname = 'fn_my_work_collabs') then
    result := 'فشل — الدالة مش موجودة';
  elsif has_function_privilege('anon', 'fn_my_work_collabs()', 'execute') then
    result := 'فشل — anon يقدر ينفّذها';
  else
    result := 'نجح';
  end if;
  return next;

  test := '2 · fn_open_one_on_one بقت بتقبل تبادل الشغل';
  if (select prosrc from pg_proc where proname = 'fn_open_one_on_one') like '%fn_work_collab_state%' then
    result := 'نجح';
  else
    result := 'فشل — لسه بتتحقق من pair_affinity بس';
  end if;
  return next;
end;
$$;
comment on function test_work_collabs() is 'تأكيد سريع للهجرة 0051 — شغّلها مرة بعد اللزق.';
revoke execute on function test_work_collabs() from public, anon;
grant  execute on function test_work_collabs() to authenticated, service_role;
