-- ============================================================================
-- WORK_MIGRATION_26.sql — الوصول وأول ربع ساعة
--
-- وجعين بيقفوا قدام الواحد قبل ما يحجز وبعد ما يوصل:
--
-- (0106) **«هوصل إزاي؟»** — أكتر سبب في مصر إن حد يبص على خروجة ويقفل.
--        دلوقتي: «منهم ٣ من ناحيتك» في بطاقة «مين حاجز» قبل الدفع، وبعد
--        الكشف كل واحد جنبه منطقته واللي من ناحيتك متعلّم. المعلومة كانت
--        في القاعدة من أول يوم (`profiles.area`) ومحدش بيستعملها.
--
-- (0107) **«هروح ألاقي نفسي قاعد ساكت»** — أول ربع ساعة. كرت بيفتح مع
--        الكشف فيه: العلامة اللي تعرفهم بيها · اسم واحد بالظبط تسأل عليه
--        (أقدم حجز في مجموعتك) · وتلات أسئلة لو الكلام وقف.
--
-- ⚠ السرية ما اتلمستش في الاتنين. حارس `fn_group_members` منقول بالحرف،
--    وكرت الوصول بنفس حارس الكشف بالظبط + نفس المجموعة.
--
-- ⚠ فيه `drop function` في التلاتة (`fn_who_booked` · `fn_group_members` ·
--    `fn_my_hosted_sbotat`) لأن **عدد الأعمدة اتغيّر** — `create or replace`
--    بترفض تغيير شكل الرجوع. ده مقصود وآمن يتكرر.
--
-- ⚠ الترتيب: 0106 الأول. الملف مرتّب صح، الزقه كله مرة واحدة.
--
-- بعده شغّل الاتنين دول — المفروض كلهم «نجح»:
--   select * from test_ride_areas();
--   select * from test_arrival();
--
-- وبعد اللزق:
--   · /admin/sbotat ← أي سبوطة ← خانة «العلامة (هيعرفوا بعض إزاي)»
--   · العضو صاحب الخروجة بيكتب علامته من /me/sbotati
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

-- ##########################################################################
-- # 20260920230000_0107_first_quarter_hour.sql
-- ##########################################################################

-- ============================================================================
-- 0107 — «أول ربع ساعة»
--
-- الوجع: «هدفع وأروح ألاقي نفسي قاعد ساكت». مش الفلوس ولا المكان — **أول
-- ربع ساعة**. أوصل، ألاقي ٧ ناس واقفين، وأعمل إيه؟ ودي اللي بتفرق بين
-- «جربت مرة» و«بقيت أخرج»: اللي بيجرب ويتكسف عمره ما بيرجع، ومش هيقولك
-- ليه — هيقولك «مشغول».
--
-- واللي عندنا دلوقتي بين الحجز والخروجة: الكشف بيطلّع أسامي، وخلاص.
--
-- تلات حاجات بتفتح مع الكشف في صفحة الحجز:
--   · **العلامة** — «الترابيزة اللي عليها ورقة برتقالي». سطر صاحب الخروجة
--     بيكتبه (`sign_ar`).
--   · **مين يستقبل** — اسم واحد بالظبط تسأل عليه. مش وظيفة ومش كابتن:
--     **أقدم حجز مدفوع في مجموعتك**، بالدور، محسوب مش متخزّن.
--   · **تلات أسئلة** لو الكلام وقف — في `copy_strings`، المالك بيغيّرها.
--
-- ⚠ السرية: الكرت ده بيفتح بنفس حارس المجموعة بالظبط — حجز مدفوع + بعد
--    الكشف + **نفس المجموعة**. لو لسه مفيش مجموعة (المطابقة ما اتعملتش)
--    بنرجّع العلامة بس ومفيش أي اسم. ما ينفعش الكرت يطلّع اسم حد مش في
--    مجموعتك.
--
-- ⚠ وحارس الكلام مشى ورا العمود الجديد: `fn_guard_sbota_text` كان بيفحص
--    ٦ أعمدة، وأي عمود نص جديد **لازم** يتزوّد عليها — وإلا الكلمات
--    الممنوعة تعدّي من الباب الجديد. ده الدرس التلتاشر في أبسط صوره.
--
-- ⚠ وفي الطريق: `fn_my_hosted_sbotat` كانت بتعرض `t.name_ar` — **اسم
--    القالب**. وخروجة العضو كلها بتقعد على قالب عام واحد، فصفحة «خروجاتي»
--    كانت بتقول للعضو اسم القالب العام بدل العنوان اللي هو كتبه بإيده.
--    بقت `coalesce(s.title_ar, t.name_ar)` زي `sbotat_public` بالظبط.
--
-- آمنة تتكرر: `add column if not exists` / `drop ... if exists` + `create`.
-- ============================================================================


-- ===== 1) العلامة =====
alter table sbotat add column if not exists sign_ar text;

comment on column sbotat.sign_ar is
  'العلامة اللي المجموعة تعرف بعضها بيها في المكان — «الترابيزة اللي عليها ورقة برتقالي». بتبان مع الكشف بس.';


-- ===== 2) حارس الكلام يمشي ورا العمود الجديد =====
--
-- ⚠ الجسم منقول بالحرف من النسخة اللي قبلها، الفرق `new.sign_ar` بس.
create or replace function fn_guard_sbota_text()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  hit  text;
  blob text;
begin
  -- الإدارة والكرون بيعدّوا — ده حارس على كتابة العضو
  if not fn_caller_is_browser() then return new; end if;

  blob := lower(concat_ws(' ', new.title_ar, new.details_ar, new.venue_name_ar,
                               new.address_ar, new.cost_note_ar, new.host_note_ar,
                               new.sign_ar));
  if btrim(blob) = '' then return new; end if;

  select w.word into hit from banned_words w
   where blob like '%' || lower(w.word) || '%'
   limit 1;

  if hit is not null then
    raise exception 'الكلمة «%» مش من كلامنا — غيّرها وجرّب تاني', hit
      using errcode = '22023';
  end if;
  return new;
end $$;


-- ===== 3) صاحب الخروجة بيكتب العلامة =====
--
-- ⚠ دالة لوحدها مش parameter جديد في `fn_update_own_sbota`: إضافة
--    parameter بـ`default` بتعمل دالة **تانية** والنداء بيبقى ambiguous،
--    ولازم `drop` بالتوقيع القديم بالظبط. دالة جديدة أنضف وأأمن.
create or replace function fn_set_sbota_sign(p_id uuid, p_sign text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not fn_is_my_sbota_host(p_id) then
    raise exception 'الخروجة دي مش بتاعتك';
  end if;
  update sbotat
     set sign_ar = nullif(btrim(left(coalesce(p_sign, ''), 200)), '')
   where id = p_id;
end $$;

comment on function fn_set_sbota_sign(uuid, text) is
  'صاحب الخروجة بيكتب العلامة اللي المجموعة تعرفه بيها. حارس الكلمات الممنوعة بيشتغل عليها زي باقي كلامه.';

revoke execute on function fn_set_sbota_sign(uuid, text) from public, anon;
grant execute on function fn_set_sbota_sign(uuid, text) to authenticated;


-- ===== 4) «خروجاتي» — العلامة والعنوان الصح =====
drop function if exists fn_my_hosted_sbotat();

create function fn_my_hosted_sbotat()
returns table (
  id uuid, slug text, name_ar text, starts_at timestamptz,
  capacity integer, booked integer, status sbota_status_t,
  note_ar text, sign_ar text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, t.slug,
         -- ⚠ كانت `t.name_ar` — اسم القالب العام، مش اللي العضو كتبه
         coalesce(nullif(btrim(s.title_ar), ''), t.name_ar),
         s.starts_at, s.capacity,
         (select count(*)::int from bookings b
           where b.sbota_id = s.id and b.status in ('paid','attended','pending_payment')),
         s.status, s.host_note_ar, s.sign_ar
    from sbotat s
    join sbota_templates t on t.id = s.template_id
   where auth.uid() is not null
     and s.host_id = auth.uid()
   order by s.starts_at desc;
$$;

comment on function fn_my_hosted_sbotat() is
  'الخروجات اللي أنا فاتحها — الأعداد بس ومفيش أسامي، ومعاها السطر والعلامة (0107).';

revoke execute on function fn_my_hosted_sbotat() from public, anon;
grant execute on function fn_my_hosted_sbotat() to authenticated;


-- ===== 5) كرت الوصول =====
create or replace function fn_sbota_arrival(p_booking_id uuid)
returns table (sign_ar text, greeter_name text, greeter_is_me boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_b   bookings;
  v_s   sbotat;
  v_g   uuid;
begin
  if v_uid is null then return; end if;

  select * into v_b from bookings where id = p_booking_id and profile_id = v_uid;
  if not found then return; end if;

  select * into v_s from sbotat where id = v_b.sbota_id;
  if not found then return; end if;

  -- نفس حارس المكان (حجز مدفوع) + الكشف. الكرت بيفتح مع المجموعة.
  if not fn_can_see_place(v_s.id, v_uid) then return; end if;
  if v_s.reveal_at is null or now() < v_s.reveal_at then return; end if;

  -- ⚠ **نفس المجموعة بس.** لو `group_id` فاضي الاستعلام بيرجّع ولا صف،
  --    فالاسم بيطلع null والكرت بيعرض العلامة بس. ما ينفعش نطلّع اسم حد
  --    مش في مجموعتك علشان نملا خانة.
  select b.profile_id into v_g
    from bookings b
    join profiles p on p.id = b.profile_id
   where b.sbota_id = v_s.id
     and b.group_id = v_b.group_id
     and b.status in ('paid','attended')
     and p.deleted_at is null
   order by b.created_at, b.id
   limit 1;

  return query select
    nullif(btrim(v_s.sign_ar), ''),
    (select p.first_name from profiles p where p.id = v_g),
    v_g is not distinct from v_uid;
end $$;

comment on function fn_sbota_arrival(uuid) is
  'العلامة + مين بيستقبل (أقدم حجز مدفوع في نفس المجموعة) — بنفس حارس الكشف بالظبط.';

revoke execute on function fn_sbota_arrival(uuid) from public, anon;
grant execute on function fn_sbota_arrival(uuid) to authenticated;


-- ===== 6) النصوص =====
insert into copy_strings (key, value_ar, screen, context_ar) values
  ('arrive.title',     'أول ربع ساعة', 'حجزي', 'عنوان كرت الوصول — بيفتح مع الكشف'),
  ('arrive.signLabel', 'هتعرفهم إزاي', 'حجزي', 'عنوان سطر العلامة'),
  ('arrive.greeter',   'أول ما توصل اسأل على {{name}}.', 'حجزي', 'مين بيستقبل'),
  ('arrive.greeterMe', 'انت أول واحد حجز — يبقى انت اللي هتستقبلهم. قول لكل واحد اسمك.', 'حجزي',
   'لما اللي بيستقبل هو أنا'),
  ('arrive.qTitle',    'لو الكلام وقف', 'حجزي', 'عنوان الأسئلة التلاتة'),
  ('arrive.q.1',       'إيه آخر حاجة عملتها لأول مرة؟', 'حجزي', 'سؤال كسر جليد'),
  ('arrive.q.2',       'لو بكرة يوم فاضي بالكامل، هتعمل فيه إيه؟', 'حجزي', 'سؤال كسر جليد'),
  ('arrive.q.3',       'إيه أحلى حتة في القاهرة ومحدش بيروحها؟', 'حجزي', 'سؤال كسر جليد'),

  -- ⚠ الشاشة **«خروجات الأعضاء»** زي باقي مفاتيح `host.%` بالظبط.
  --   `test_host_copy()` (من 0081) بيفشل لو المفاتيح اتفرقت على أكتر من
  --   شاشة، علشان المالك يلاقيهم كلهم مع بعض في /admin/copy. أول نسخة
  --   هنا كتبت «خروجاتي» والفاحص الشامل مسكها.
  ('host.mine.sign',      'العلامة اللي هيعرفوك بيها', 'خروجات الأعضاء', 'خانة العلامة لصاحب الخروجة'),
  ('host.mine.signPh',    'هقعد على الترابيزة اللي جنب الشباك، وهيكون معايا كتاب أصفر', 'خروجات الأعضاء',
   'مثال في الخانة'),
  ('host.mine.signHint',  'بتوصلهم مع كشف المجموعة — قبل الخروجة بيوم. سطر واحد يخلّيهم يلاقوك من غير ما يلفوا.', 'خروجات الأعضاء',
   'شرح تحت الخانة'),
  ('host.mine.signSave',  'احفظ العلامة', 'خروجات الأعضاء', 'زرار الحفظ'),
  ('host.mine.signSaved', 'اتحفظت ✓', 'خروجات الأعضاء', 'بعد الحفظ')
on conflict (key) do update
  set value_ar   = excluded.value_ar,
      screen     = excluded.screen,
      context_ar = coalesce(excluded.context_ar, copy_strings.context_ar);


-- ===== 7) دالة الاختبار =====
create or replace function test_arrival()
returns table (test text, result text)
language plpgsql
security definer
set search_path = public, auth
as $body$
declare
  v_host  uuid := '44444444-0000-0000-0000-000000000110';
  v_first uuid := '44444444-0000-0000-0000-000000000111';
  v_late  uuid := '44444444-0000-0000-0000-000000000112';
  v_out   uuid := '44444444-0000-0000-0000-000000000113';
  v_tpl   uuid := '66666666-0000-0000-0000-000000000107';
  v_sb    uuid := '77777777-0000-0000-0000-000000000107';
  v_grp   uuid := '88888888-0000-0000-0000-000000000107';
  v_bk    uuid := 'aaaaaaaa-0000-0000-0000-000000000110';
  v_row   record;
  v_txt   text;
  n int;
begin
  test := '0107 · العمود sign_ar موجود';
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'sbotat' and column_name = 'sign_ar';
  if n = 1 then result := 'نجح'; else result := 'فشل — مفيش عمود للعلامة'; end if;
  return next;

  -- ⚠ شكلي عن قصد وبالاسم الكامل: العمود لازم يبقى **جوه** الـblob بتاع
  --   الحارس، مش مجرد إن كلمة sign_ar موجودة في أي مكان في الدالة.
  test := '0107 · حارس الكلام بيفحص العلامة كمان';
  select prosrc into v_txt from pg_proc where proname = 'fn_guard_sbota_text';
  if v_txt like '%new.sign_ar%' then result := 'نجح';
  else result := 'فشل — 🔴 الكلمات الممنوعة هتعدّي من الخانة الجديدة'; end if;
  return next;

  -- ===== بذرة =====
  insert into auth.users (instance_id, id, aud, role, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data, is_sso_user)
  values ('00000000-0000-0000-0000-000000000000', v_host,  'authenticated','authenticated',
          now(), now(), '{}'::jsonb, '{}'::jsonb, false),
         ('00000000-0000-0000-0000-000000000000', v_first, 'authenticated','authenticated',
          now(), now(), '{}'::jsonb, '{}'::jsonb, false),
         ('00000000-0000-0000-0000-000000000000', v_late,  'authenticated','authenticated',
          now(), now(), '{}'::jsonb, '{}'::jsonb, false),
         ('00000000-0000-0000-0000-000000000000', v_out,   'authenticated','authenticated',
          now(), now(), '{}'::jsonb, '{}'::jsonb, false)
  on conflict (id) do nothing;

  insert into profiles (id, first_name, gender, area, role) values
    (v_host,  '[اختبار] صاحبها', 'female', 'maadi', 'member'),
    (v_first, '[اختبار] أول',    'male',   'maadi', 'member'),
    (v_late,  '[اختبار] تاني',   'male',   'maadi', 'member'),
    (v_out,   '[اختبار] بره',    'male',   'maadi', 'member')
  on conflict (id) do nothing;

  insert into sbota_templates
    (id, slug, name_ar, story_ar, kind, default_price, org_fee, duration_min, min_group, max_group)
  values (v_tpl, 'test-arrival-0107', '[اختبار] القالب العام', '[اختبار]', 'food',
          0, 0, 120, 4, 6)
  on conflict (id) do nothing;

  insert into sbotat
    (id, template_id, venue_id, starts_at, ends_at, price, org_fee, capacity,
     status, girls_only, is_day, is_mystery, reveal_at, origin, host_id,
     title_ar, venue_name_ar, address_ar)
  values (v_sb, v_tpl, null, now() + interval '3 days', now() + interval '3 days 3 hours',
          0, 0, 6, 'open', false, false, false, now() + interval '2 days',
          'member', v_host, '[اختبار] قعدة على النيل', '[اختبار] مكان', '[اختبار] عنوان')
  on conflict (id) do update set reveal_at = excluded.reveal_at, sign_ar = null;

  insert into sbota_groups (id, sbota_id, index, why_ar)
  values (v_grp, v_sb, 1, '[اختبار]') on conflict (id) do nothing;

  -- ⚠ الترتيب مهم: «أول» بيحجز قبل «تاني» بساعة، فهو اللي المفروض يستقبل
  insert into bookings (id, sbota_id, profile_id, group_id, status, price_paid, created_at) values
    ('aaaaaaaa-0000-0000-0000-000000000111', v_sb, v_first, v_grp, 'paid', 0, now() - interval '2 hours'),
    (v_bk,                                   v_sb, v_late,  v_grp, 'paid', 0, now() - interval '1 hour')
  on conflict (id) do nothing;

  -- ===== (١) صاحب الخروجة بيكتب العلامة =====
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', v_host), true);
  perform fn_set_sbota_sign(v_sb, '  الترابيزة اللي عليها ورقة برتقالي  ');
  select s.sign_ar into v_txt from sbotat s where s.id = v_sb;
  test := '0107 · صاحب الخروجة بيكتب العلامة';
  if v_txt = 'الترابيزة اللي عليها ورقة برتقالي' then result := 'نجح';
  else result := format('فشل — اتحفظت «%s»', coalesce(v_txt,'null')); end if;
  return next;

  -- ===== (٢) الكلمات الممنوعة بتترفض من الخانة الجديدة =====
  test := '0107 · كلمة ممنوعة في العلامة بتترفض';
  begin
    perform fn_set_sbota_sign(v_sb, 'هنعمل فعالية جنب الباب');
    result := 'فشل — 🔴 الكلمات الممنوعة عدّت من خانة العلامة';
  exception when others then
    result := 'نجح';
  end;
  return next;

  -- ===== (٣) حد تاني ما يكتبش على خروجتك =====
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', v_late), true);
  test := '0107 · حد تاني ما يكتبش علامة على خروجتك';
  begin
    perform fn_set_sbota_sign(v_sb, 'علامة مزوّرة');
    result := 'فشل — 🔴 أي عضو يقدر يغيّر علامة خروجة مش بتاعته';
  exception when others then
    result := 'نجح';
  end;
  return next;

  -- ===== (٤) قبل الكشف الكرت مقفول =====
  select count(*) into n from fn_sbota_arrival(v_bk);
  test := '0107 · قبل الكشف الكرت مقفول';
  if n = 0 then result := 'نجح';
  else result := 'فشل — 🔴 العلامة واسم اللي بيستقبل بانوا قبل الكشف'; end if;
  return next;

  -- ===== (٥) بعد الكشف: العلامة + أقدم حجز =====
  perform set_config('request.jwt.claims', '', true);
  update sbotat set reveal_at = now() - interval '1 hour' where id = v_sb;
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', v_late), true);

  select * into v_row from fn_sbota_arrival(v_bk);
  test := '0107 · بعد الكشف: العلامة واسم اللي بيستقبل';
  if v_row.sign_ar = 'الترابيزة اللي عليها ورقة برتقالي'
     and v_row.greeter_name = '[اختبار] أول'
     and v_row.greeter_is_me = false
    then result := 'نجح';
    else result := format('فشل — علامة=%s · بيستقبل=%s · أنا=%s',
                          coalesce(v_row.sign_ar,'null'),
                          coalesce(v_row.greeter_name,'null'),
                          coalesce(v_row.greeter_is_me::text,'null')); end if;
  return next;

  -- ===== (٦) وأقدم واحد بيتقاله إنه هو =====
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', v_first), true);
  select * into v_row from fn_sbota_arrival('aaaaaaaa-0000-0000-0000-000000000111');
  test := '0107 · أقدم واحد بيتقاله إنه هو اللي هيستقبل';
  if v_row.greeter_is_me then result := 'نجح';
  else result := 'فشل — أول واحد حجز مش عارف إنه المفروض يستقبل'; end if;
  return next;

  -- ===== (٧) حد مش حاجز ما بياخدش حاجة =====
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', v_out), true);
  select count(*) into n from fn_sbota_arrival(v_bk);
  test := '0107 · حد مش حاجز ما بياخدش الكرت';
  if n = 0 then result := 'نجح';
  else result := 'فشل — 🔴 حد بره الحجز شاف العلامة واسم اللي بيستقبل'; end if;
  return next;

  -- ===== (٨) «خروجاتي» بتقول العنوان اللي العضو كتبه =====
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', v_host), true);
  select h.name_ar into v_txt from fn_my_hosted_sbotat() h where h.id = v_sb;
  test := '0107 · «خروجاتي» بتقول عنوان العضو مش اسم القالب';
  if v_txt = '[اختبار] قعدة على النيل' then result := 'نجح';
  else result := format('فشل — رجّعت «%s» (ده اسم القالب)', coalesce(v_txt,'null')); end if;
  return next;

  select h.sign_ar into v_txt from fn_my_hosted_sbotat() h where h.id = v_sb;
  test := '0107 · و«خروجاتي» بتجيب العلامة علشان الخانة تتملا';
  if v_txt = 'الترابيزة اللي عليها ورقة برتقالي' then result := 'نجح';
  else result := format('فشل — العلامة رجعت «%s»، فالخانة هتبان فاضية كل مرة',
                        coalesce(v_txt,'null')); end if;
  return next;

  perform set_config('request.jwt.claims', '', true);

  -- ===== تنضيف — بالأرقام بالظبط (الدرس السابع) =====
  delete from bookings where id in (v_bk, 'aaaaaaaa-0000-0000-0000-000000000111');
  delete from sbota_groups    where id = v_grp;
  delete from sbotat          where id = v_sb;
  delete from sbota_templates where id = v_tpl;
  delete from profiles p      where p.id in (v_host, v_first, v_late, v_out)
    and not exists (select 1 from admin_users a where a.profile_id = p.id);
  delete from auth.users u    where u.id in (v_host, v_first, v_late, v_out)
    and not exists (select 1 from profiles p where p.id = u.id);

exception when others then
  perform set_config('request.jwt.claims', '', true);
  delete from bookings where id in (v_bk, 'aaaaaaaa-0000-0000-0000-000000000111');
  delete from sbota_groups    where id = v_grp;
  delete from sbotat          where id = v_sb;
  delete from sbota_templates where id = v_tpl;
  delete from profiles p      where p.id in (v_host, v_first, v_late, v_out)
    and not exists (select 1 from admin_users a where a.profile_id = p.id);
  delete from auth.users u    where u.id in (v_host, v_first, v_late, v_out)
    and not exists (select 1 from profiles p where p.id = u.id);
  test := '0107 · الاختبار السلوكي';
  result := 'فشل — استثناء: ' || sqlerrm;
  return next;
end $body$;

comment on function test_arrival() is
  '0107 — العلامة بتتكتب من صاحبها بس وبتعدّي على حارس الكلام، والكرت بيفتح مع الكشف وبيدّي أقدم حجز في نفس المجموعة.';

revoke execute on function test_arrival() from public, anon, authenticated;
