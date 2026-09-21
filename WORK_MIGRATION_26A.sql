-- ============================================================================
-- WORK_MIGRATION_26A.sql — «جايين منين»
--
-- ⚠ ده **الجزء الأول من اتنين**. الزقه لوحده، وبعد ما ينجح الزق 26B.
--
-- الوجع: **«هوصل إزاي؟»** — أكتر سبب في مصر إن حد يبص على خروجة ويقفل.
-- دلوقتي: «منهم ٣ من ناحيتك» في بطاقة «مين حاجز» قبل الدفع، وبعد الكشف كل
-- واحد جنبه منطقته واللي من ناحيتك متعلّم. المعلومة كانت في القاعدة من أول
-- يوم (`profiles.area`) ومحدش بيستعملها.
--
-- ⚠ فيه `drop function` في `fn_who_booked` و`fn_group_members` لأن **عدد
--    الأعمدة اتغيّر** — `create or replace` بترفض تغيير شكل الرجوع. ده
--    مقصود وآمن يتكرر. والسرية ما اتلمستش: حارس `fn_group_members` منقول
--    بالحرف، إحنا زوّدنا أعمدة على نفس الصفوف اللي كانت بترجع.
--
-- بعده شغّل:  select * from test_ride_areas();   — المفروض ٩ صفوف «نجح».
-- ============================================================================

-- ##########################################################################
-- # 20260920220000_0106_ride_areas.sql
-- ##########################################################################

-- ============================================================================
-- 0106 — «جايين منين»: المنطقة قبل الحجز وبعد الكشف
--
-- الوجع: **الوصول**. ده أكتر سبب في مصر إن حد يبص على خروجة ويقفل — واحد
-- في مدينة نصر شايف خروجة في زايد الساعة ١٠ الصبح، الخروجة ساعتين والطريق
-- أربعة. واللي أوجع: بيحجز، وييجي اليوم، ويعتذر — فالخروجة اللي كانت ٨
-- تبقى ٤.
--
-- والمعلومة اللي بترد على ده **موجودة في القاعدة من أول يوم** (`profiles.area`
-- و`sbotat.area`) ومحدش بيستعملها في حاجة.
--
-- الحل حاجتين صغيرين، مفيش جدول ولا جدولة:
--   (١) قبل الدفع: رقم في بطاقة «مين حاجز» — «٣ من ناحيتك». رقم واحد،
--       من غير أي اسم، بيرد على الاعتراض قبل ما يقفل الصفحة.
--   (٢) بعد الكشف: كل واحد في «اللي رايحين معاك» جنبه منطقته، واللي من
--       ناحيتك متعلّم. يتفقوا هما.
--
-- ⚠ السرية ما اتلمستش. حارس `fn_group_members` زي ما هو بالحرف (نفس
--    المجموعة · بعد الكشف · حجز نشط)، إحنا زوّدنا **عمودين** على نفس
--    الصفوف اللي كانت بترجع أصلًا. مفيش صف جديد بيبان لحد.
--
-- ⚠ «غير كده» بترجّع **null** مش بتتحسب. اللي منطقته `other` ممكن يكون
--    في حدايق الأهرام واللي قصاده في الشروق — لو عددناهم مع بعض هنقول
--    «واحد من ناحيتك» وهو مش من ناحيته، وده أسوأ من ما نقولش حاجة.
--
-- ⚠ `drop function` قبل `create` لأن **عدد الأعمدة اتغيّر**. `create or
--    replace` بترفض تغيير شكل الرجوع، وبتقع بـ«cannot change return type».
--
-- آمنة تتكرر: `drop ... if exists` + `create` + `on conflict`.
-- ============================================================================


-- ===== 1) «مين حاجز» + «كام منهم من ناحيتك» =====
drop function if exists fn_who_booked(uuid);

create function fn_who_booked(s_id uuid)
returns table (
  booked int, total int, girls int, boys int,
  age_min int, age_max int, first_timers int, returning_count int,
  same_area int
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    -- ⚠ `other` بتتعامل زي مفيش منطقة خالص — شوف الترويسة
    select case when p.area = 'other' then null else p.area end as area
      from profiles p where p.id = auth.uid()
  )
  select
    count(*)::int,
    (select capacity from sbotat where id = s_id)::int,
    count(*) filter (where p.gender = 'female')::int,
    count(*) filter (where p.gender = 'male')::int,
    min(extract(year from now())::int - p.birth_year)::int,
    max(extract(year from now())::int - p.birth_year)::int,
    count(*) filter (where p.sbota_count = 0)::int,
    count(*) filter (where p.sbota_count > 0)::int,
    -- الزائر المجهول أو اللي مالوش منطقة = null صريح، مش صفر.
    -- صفر معناه «مفيش حد من ناحيتك» وده كلام تاني خالص.
    case when (select area from me) is null then null
         else count(*) filter (
                where p.area = (select area from me)
                  and p.id is distinct from auth.uid()
              )::int
    end
  from bookings b join profiles p on p.id = b.profile_id
  where b.sbota_id = s_id and b.status in ('paid', 'attended');
$$;

comment on function fn_who_booked(uuid) is
  'أرقام «مين حاجز لحد دلوقتي» — بدون أي اسم أو معرّف. same_area = كام منهم من ناحية اللي بيسأل (null للزائر ولـ«غير كده»).';

revoke execute on function fn_who_booked(uuid) from public;
grant execute on function fn_who_booked(uuid) to anon, authenticated;


-- ===== 2) المجموعة بعد الكشف + منطقة كل واحد =====
--
-- ⚠ الحارس منقول **بالحرف** من النسخة اللي قبلها: نفس الـCTEs، نفس الشروط،
--    نفس الترتيب. الجديد عمودين في `select` بس. لو غيّرت حاجة في الحارس
--    هنا، انت بتفتح الكشف — مش بتزوّد ميزة.
drop function if exists fn_group_members(uuid);

create function fn_group_members(p_booking_id uuid)
returns table (
  profile_id uuid, first_name text, initial text, persona persona_t,
  times_before integer, line_ar text,
  area_code text, area_label text, same_area boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select b.group_id, b.sbota_id,
           (select p.area from profiles p where p.id = auth.uid()) as my_area
    from bookings b
    where b.id = p_booking_id and b.profile_id = auth.uid()
  ),
  revealed as (
    select s.reveal_at <= now() as ok
    from sbotat s join me on me.sbota_id = s.id
  )
  select
    p.id,
    p.first_name,
    left(p.first_name, 1),
    p.type,
    p.sbota_count,
    case p.sbota_count
      when 0 then 'أول مرة'
      when 1 then 'المرة التانية'
      when 2 then 'المرة التالتة'
      else 'المرة ' || (p.sbota_count + 1)::text
    end,
    p.area::text,
    -- اللي كاتب منطقته بإيده بيبان كلامه هو، واللي مختار من القايمة
    -- بيتترجم في الواجهة من نفس القايمة اللي في /join
    case when p.area = 'other' then nullif(btrim(p.area_other), '') end,
    -- ⚠ المقارنة هنا مش في الواجهة: كده الصفحة مش محتاجة تعرف منطقتي
    --   أصلًا، و«غير كده» ما بتتطابقش مع حد (نفس قاعدة `same_area` فوق).
    coalesce(p.area <> 'other' and p.area = (select m.my_area from me m), false)
  from bookings b
  join profiles p on p.id = b.profile_id
  join me on b.group_id = me.group_id
  where b.status in ('paid','attended')
    and b.profile_id <> auth.uid()
    and (select ok from revealed)
    and p.deleted_at is null;
$$;

comment on function fn_group_members(uuid) is
  'أعضاء مجموعتك بعد الكشف — ومعاهم المنطقة (0106) علشان اللي من ناحية بعض يتفقوا يروحوا سوا.';

revoke execute on function fn_group_members(uuid) from public, anon;
grant execute on function fn_group_members(uuid) to authenticated;


-- ===== 3) النصوص =====
insert into copy_strings (key, value_ar, screen, context_ar) values
  ('shared.sameArea',   'منهم {{n}} من ناحيتك', 'السبوطة',
   'سطر تحت «مين حاجز» — بيظهر للمسجّل بس ولما يكون فيه حد من نفس منطقته'),
  ('group.ride.title',  'جايين منين', 'حجزي', 'عنوان قسم المناطق بعد الكشف'),
  ('group.ride.note',   'اللي من ناحيتك متعلّم. اتفقوا تروحوا سوا لو عايزين.', 'حجزي',
   'سطر تحت عنوان «جايين منين»'),
  ('group.ride.mine',   'من ناحيتك', 'حجزي', 'وسم جنب اسم اللي من نفس منطقتك'),
  ('group.ride.none',   'مفيش حد من ناحيتك في المجموعة دي.', 'حجزي',
   'لما محدش من نفس منطقته')
on conflict (key) do update
  set value_ar   = excluded.value_ar,
      screen     = excluded.screen,
      context_ar = coalesce(excluded.context_ar, copy_strings.context_ar);


-- ===== 4) دالة الاختبار =====
--
-- ⚠ سلوكية: العمود «موجود» ما يعنيش إنه بيعدّ صح، ولا إن الحارس القديم
--    لسه واقف. بنلبس تلات هويات وبنشوف كل واحد بياخد إيه.
create or replace function test_ride_areas()
returns table (test text, result text)
language plpgsql
security definer
set search_path = public, auth
as $body$
declare
  v_me   uuid := '44444444-0000-0000-0000-000000000106';
  v_near uuid := '44444444-0000-0000-0000-000000000107';
  v_far  uuid := '44444444-0000-0000-0000-000000000108';
  v_tpl  uuid := '66666666-0000-0000-0000-000000000106';
  v_sb   uuid := '77777777-0000-0000-0000-000000000106';
  v_grp  uuid := '88888888-0000-0000-0000-000000000106';
  v_bk   uuid := 'aaaaaaaa-0000-0000-0000-000000000106';
  n int;
  v_same int;
  v_area text;
begin
  test := '0106 · fn_who_booked فيها عمود same_area';
  -- ⚠ الدوال مش في `information_schema.columns` — بنسأل الكتالوج
  select count(*) into n from pg_proc
   where proname = 'fn_who_booked' and 'same_area' = any (proargnames);
  if n = 1 then result := 'نجح';
  else result := 'فشل — العمود مش موجود، البطاقة مش هتعرف تقول «من ناحيتك»'; end if;
  return next;

  -- ===== بذرة =====
  insert into auth.users (instance_id, id, aud, role, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data, is_sso_user)
  values ('00000000-0000-0000-0000-000000000000', v_me,   'authenticated','authenticated',
          now(), now(), '{}'::jsonb, '{}'::jsonb, false),
         ('00000000-0000-0000-0000-000000000000', v_near, 'authenticated','authenticated',
          now(), now(), '{}'::jsonb, '{}'::jsonb, false),
         ('00000000-0000-0000-0000-000000000000', v_far,  'authenticated','authenticated',
          now(), now(), '{}'::jsonb, '{}'::jsonb, false)
  on conflict (id) do nothing;

  insert into profiles (id, first_name, gender, area, role, birth_year) values
    (v_me,   '[اختبار] أنا',   'female', 'maadi',   'member', 1996),
    (v_near, '[اختبار] جاري',  'male',   'maadi',   'member', 1995),
    (v_far,  '[اختبار] بعيد',  'male',   'tagamoa', 'member', 1994)
  on conflict (id) do update set area = excluded.area;

  insert into sbota_templates
    (id, slug, name_ar, story_ar, kind, default_price, org_fee, duration_min, min_group, max_group)
  values (v_tpl, 'test-ride-0106', '[اختبار] قالب المناطق', '[اختبار]', 'food',
          15000, 4000, 120, 4, 6)
  on conflict (id) do nothing;

  -- ⚠ الكشف في المستقبل الأول — علشان نتأكد إن الحارس القديم لسه بيمنع
  insert into sbotat
    (id, template_id, venue_id, starts_at, ends_at, price, org_fee, capacity,
     status, girls_only, is_day, is_mystery, reveal_at)
  values (v_sb, v_tpl, null, now() + interval '3 days', now() + interval '3 days 3 hours',
          15000, 4000, 6, 'open', false, false, false, now() + interval '2 days')
  on conflict (id) do update set reveal_at = excluded.reveal_at;

  insert into sbota_groups (id, sbota_id, index, why_ar)
  values (v_grp, v_sb, 1, '[اختبار]') on conflict (id) do nothing;

  insert into bookings (id, sbota_id, profile_id, group_id, status, price_paid) values
    (v_bk,                                    v_sb, v_me,   v_grp, 'paid', 15000),
    ('aaaaaaaa-0000-0000-0000-000000000107',  v_sb, v_near, v_grp, 'paid', 15000),
    ('aaaaaaaa-0000-0000-0000-000000000108',  v_sb, v_far,  v_grp, 'paid', 15000)
  on conflict (id) do nothing;

  -- ===== (١) العدّ من ناحيتي =====
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', v_me), true);
  select w.same_area into v_same from fn_who_booked(v_sb) w;
  test := '0106 · «من ناحيتك» بيعدّ صح ومن غير ما يعدّني أنا';
  if v_same = 1 then result := 'نجح';
  else result := format('فشل — المفروض ١ (جاري بس) ورجّع %s', coalesce(v_same::text,'null')); end if;
  return next;

  -- ===== (٢) الزائر المجهول =====
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select w.same_area into v_same from fn_who_booked(v_sb) w;
  test := '0106 · الزائر المجهول ما بياخدش «من ناحيتك»';
  if v_same is null then result := 'نجح';
  else result := format('فشل — 🔴 رجّع %s لحد مش مسجّل', v_same); end if;
  return next;

  -- ===== (٣) «غير كده» ما بتتعدّش =====
  perform set_config('request.jwt.claims', '', true);
  update profiles set area = 'other' where id = v_me;
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', v_me), true);
  select w.same_area into v_same from fn_who_booked(v_sb) w;
  test := '0106 · «غير كده» بترجّع null مش رقم';
  if v_same is null then result := 'نجح';
  else result := format('فشل — قال «%s من ناحيتك» وهو مش عارف ناحيته فين أصلًا', v_same); end if;
  return next;

  perform set_config('request.jwt.claims', '', true);
  update profiles set area = 'maadi' where id = v_me;

  -- ===== (٤) الحارس القديم لسه واقف: قبل الكشف مفيش حد =====
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', v_me), true);
  select count(*) into n from fn_group_members(v_bk);
  test := '0106 · قبل الكشف المجموعة لسه مقفولة';
  if n = 0 then result := 'نجح';
  else result := format('فشل — 🔴 %s اسم بانوا قبل الكشف، السرية اتكسرت', n); end if;
  return next;

  -- ===== (٥) وبعد الكشف الأسامي والمناطق =====
  perform set_config('request.jwt.claims', '', true);
  update sbotat set reveal_at = now() - interval '1 hour' where id = v_sb;
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', v_me), true);

  select count(*) into n from fn_group_members(v_bk);
  test := '0106 · بعد الكشف الاتنين بيبانوا';
  if n = 2 then result := 'نجح';
  else result := format('فشل — رجّع %s بدل ٢', n); end if;
  return next;

  select g.area_code into v_area from fn_group_members(v_bk) g where g.profile_id = v_near;
  test := '0106 · ومعاهم المنطقة';
  if v_area = 'maadi' then result := 'نجح';
  else result := format('فشل — منطقة الجار رجعت «%s»', coalesce(v_area,'null')); end if;
  return next;

  test := '0106 · «من ناحيتك» بيتحسب في القاعدة مش في الواجهة';
  select count(*) into n from fn_group_members(v_bk) g where g.same_area;
  if n = 1 and (select g.same_area from fn_group_members(v_bk) g where g.profile_id = v_near)
    then result := 'نجح';
    else result := format('فشل — %s متعلّمين بدل واحد', n); end if;
  return next;

  -- ===== (٦) حد بره المجموعة ما بياخدش حاجة =====
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', v_far), true);
  select count(*) into n from fn_group_members(v_bk);
  test := '0106 · حجز حد تاني ما بيفتحش مجموعته';
  if n = 0 then result := 'نجح';
  else result := format('فشل — 🔴 عضو تاني شاف %s من مجموعة مش بتاعته', n); end if;
  return next;

  perform set_config('request.jwt.claims', '', true);

  -- ===== تنضيف — بالأرقام بالظبط (الدرس السابع) =====
  delete from bookings where id in (
    v_bk, 'aaaaaaaa-0000-0000-0000-000000000107', 'aaaaaaaa-0000-0000-0000-000000000108');
  delete from sbota_groups   where id = v_grp;
  delete from sbotat         where id = v_sb;
  delete from sbota_templates where id = v_tpl;
  delete from profiles p     where p.id in (v_me, v_near, v_far)
    and not exists (select 1 from admin_users a where a.profile_id = p.id);
  delete from auth.users u   where u.id in (v_me, v_near, v_far)
    and not exists (select 1 from profiles p where p.id = u.id);

exception when others then
  perform set_config('request.jwt.claims', '', true);
  delete from bookings where id in (
    v_bk, 'aaaaaaaa-0000-0000-0000-000000000107', 'aaaaaaaa-0000-0000-0000-000000000108');
  delete from sbota_groups   where id = v_grp;
  delete from sbotat         where id = v_sb;
  delete from sbota_templates where id = v_tpl;
  delete from profiles p     where p.id in (v_me, v_near, v_far)
    and not exists (select 1 from admin_users a where a.profile_id = p.id);
  delete from auth.users u   where u.id in (v_me, v_near, v_far)
    and not exists (select 1 from profiles p where p.id = u.id);
  test := '0106 · الاختبار السلوكي';
  result := 'فشل — استثناء: ' || sqlerrm;
  return next;
end $body$;

comment on function test_ride_areas() is
  '0106 — «من ناحيتك» بيعدّ صح ومش بيعدّني، والمجهول و«غير كده» بياخدوا null، وحارس الكشف زي ما هو.';

revoke execute on function test_ride_areas() from public, anon, authenticated;
