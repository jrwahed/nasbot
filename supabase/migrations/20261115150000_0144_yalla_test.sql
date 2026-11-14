-- ============================================================================
-- 0144 · اختبار «يلا» — سلوكي بالكامل
--
-- ⚠ **كل حاجة جوه بلوك واحد بيترجع باستثناء متعمّد في الآخر** — والبذرة
--   **جوه البلوك** كمان (الدرس الستة وعشرين: البذرة اللي بره البلوك بتتحفظ،
--   وكل تشغيل كان بيسيب لاعبين وجلسات في القاعدة والاختبار بيقول «نجح»).
--
-- ⚠ **سلوكي مش شكلي**: كل حارس بيتجرّب بالأدوار الحقيقية
--   (`set role` + `request.jwt.claims`)، ولكل حارس **صف للممنوع وصف
--   للمسموح** (الدرس الأربعة وعشرين: الاختبار اللي بيجرّب الرفض بس ما
--   بيقولش إن الباب بيفتح).
--
-- ⚠ **الدور والهوية بيترجعوا بين كل خطوة والتانية**، والقيم المتوقّعة
--   بتتقرا **قبل** أي تلبيس دور (الدرس السبعة وعشرين: الاختبار اللي بيلبس
--   دور العضو وبعدين بيقرا جدول عليه RLS بيقول «فشل» على كود سليم).
--
-- ⚠ كل البيانات اسمها `[اختبار] …` علشان ما توصلش تليجرام المالك (0122).
--
-- محتاج `fn_test_seed_up()` قبله (القالب والمكان).
-- آمن يتكرر.
-- ============================================================================

-- ===== بذرة «يلا»: ٨ أعضاء بالتبادل ولد/بنت =====
-- ⚠ `profiles.id` مربوط بـ`auth.users`، فالمستخدم لازم يتعمل الأول — نفس
--   شكل `fn_case_fixture_up` بالظبط.
create or replace function fn_yalla_fixture_up()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  pid uuid;
  i   int;
begin
  for i in 1 .. 8 loop
    pid := ('dddddddd-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid;
    insert into auth.users (
      instance_id, id, aud, role, phone, phone_confirmed_at,
      encrypted_password, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_sso_user
    ) values (
      '00000000-0000-0000-0000-000000000000', pid, 'authenticated', 'authenticated',
      '+201000008' || lpad(i::text, 2, '0'), now(), '', now(), now(),
      '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb, false
    ) on conflict (id) do nothing;

    insert into profiles (id, first_name, gender, area, role, birth_year, gate_status)
    values (pid, '[اختبار] يلا ' || i,
            (case when i % 2 = 1 then 'male' else 'female' end)::gender_t,
            'maadi', 'member', extract(year from now())::int - 25, 'approved')
    on conflict (id) do update
       set gate_status = 'approved', deleted_at = null, banned_at = null,
           birth_year = extract(year from now())::int - 25;
  end loop;
end $$;
revoke execute on function fn_yalla_fixture_up() from public, anon, authenticated;

-- شبكة أمان لو اختبار وقع بشكل خلّى الكتابة تتحفظ.
-- ⚠ بالأرقام بالظبط مش بالبادئة، وبحارس على أي صف عليه حساب لوحة (الدرس السابع).
create or replace function fn_yalla_fixture_down()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_people uuid[] := '{}';
  v_calls  uuid[] := '{}';
  i int;
begin
  for i in 1 .. 8 loop
    v_people := v_people || ('dddddddd-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid;
  end loop;
  for i in 1 .. 9 loop
    v_calls := v_calls || ('dddddddd-1111-0000-0000-00000000000' || i::text)::uuid;
  end loop;

  delete from bookings b where b.sbota_id in (select id from sbotat where yalla_id = any(v_calls));
  delete from waitlist w where w.sbota_id in (select id from sbotat where yalla_id = any(v_calls));
  delete from sbotat where yalla_id = any(v_calls);
  delete from notifications      where profile_id = any(v_people);
  delete from template_interest  where profile_id = any(v_people);
  delete from yalla_priority     where profile_id = any(v_people);
  delete from member_tg_queue where profile_id = any(v_people);
  delete from yalla_calls     where id = any(v_calls);
  delete from admin_users a   where a.profile_id = any(v_people);
  delete from profiles p where p.id = any(v_people)
     and not exists (select 1 from admin_users a where a.profile_id = p.id);
  delete from auth.users u where u.id = any(v_people)
     and not exists (select 1 from profiles pp where pp.id = u.id);
end $$;
revoke execute on function fn_yalla_fixture_down() from public, anon, authenticated;


-- ============================================================================
create or replace function test_yalla()
returns table (test text, result text)
language plpgsql
set search_path = public, auth
as $body$
declare
  me   text := current_user;
  tpl  uuid := '66666666-0000-0000-0000-000000000004';
  ven  uuid := '55555555-0000-0000-0000-000000000004';
  -- النداءات
  cA   uuid := 'dddddddd-1111-0000-0000-000000000001';  -- العدد بيكمل (٦)
  cD   uuid := 'dddddddd-1111-0000-0000-000000000004';  -- كله بنات → زيادة وانتظار
  cE   uuid := 'dddddddd-1111-0000-0000-000000000005';  -- المهلة خلصت والأعلى كسب
  cF   uuid := 'dddddddd-1111-0000-0000-000000000006';  -- تحت الحد الأدنى
  -- الأعضاء
  m1 uuid := 'dddddddd-0000-0000-0000-000000000001';  -- ولد
  m2 uuid := 'dddddddd-0000-0000-0000-000000000002';  -- بنت
  m3 uuid := 'dddddddd-0000-0000-0000-000000000003';  -- ولد
  m4 uuid := 'dddddddd-0000-0000-0000-000000000004';  -- بنت
  m5 uuid := 'dddddddd-0000-0000-0000-000000000005';  -- ولد
  m6 uuid := 'dddddddd-0000-0000-0000-000000000006';  -- بنت
  m7 uuid := 'dddddddd-0000-0000-0000-000000000007';  -- ولد
  m8 uuid := 'dddddddd-0000-0000-0000-000000000008';  -- بنت
  adm uuid;   -- حساب اللوحة في الاختبار
  p   uuid;   -- متغيّر اللفّ على الأعضاء
  -- مواعيد
  sA1 uuid; sA2 uuid; sD1 uuid; sE1 uuid; sE2 uuid; sF1 uuid;
  sbA uuid; sbD uuid; sbE uuid;
  bkA uuid; bkD uuid; wlD uuid;
  norm uuid := 'dddddddd-2222-0000-0000-000000000001';  -- سبوطة عادية للمقارنة
  n    int;
  n2   int;
  v_ok boolean;
  v_txt text;
  v_j  jsonb;
  msg  text;
  r    text[] := '{}';
  i    int;
  names text[] := array[
    /* 1*/ '0144 · المجهول بيشوف النداء في الفيد',
    /* 2*/ '0144 · 🔴 المجهول ما يقدرش يختار',
    /* 3*/ '0144 · العضو بيختار فعلًا',
    /* 4*/ '0144 · 🔴 الاختيار مرتين ما بيتكررش',
    /* 5*/ '0144 · التغيير بيتحسب صح (الاختيار القديم بيتشال)',
    /* 6*/ '0144 · 🔴 مفيش كتابة مباشرة على جدول الاختيار',
    /* 7*/ '0144 · تليجرام المالك مع كل اختيار',
    /* 9*/ '0144 · 🔴 الكسبان بيتحدد لما العدد يكمل',
    /*10*/ '0144 · والسبوطة بتتعمل على الاختيار الكسبان',
    /*11*/ '0144 · والمجموعة ٦ حجوزات مؤكدة ببلاش',
    /*12*/ '0144 · 🔴 سبوطة «يلا» مش بتبان في القايمة العامة',
    /*13*/ '0144 · 🔴 مفيش قفل حجز ٣٦ ساعة ومفيش كشف تلقائي',
    /*14*/ '0144 · سبوطة عادية لسه بتقفل ٣٦ ساعة قبلها',
    /*15*/ '0144 · مفيش إيميل «مكانك محجوز» (رسالة «يلا» بدالها)',
    /*16*/ '0144 · مفيش إيميل «الخروجة اتفتحت»',
    /*17*/ '0144 · مفيش إعلان «خروجة جديدة» لكل الأعضاء',
    /*18*/ '0144 · اللي كسب وصلته «الميعاد اللي اخترته كسب»',
    /*19*/ '0144 · واللي اختار حاجة تانية وصلته «تيجي معاهم؟»',
    /*20*/ '0144 · 🔴 المكان ما بيبانش قبل «اكشف»',
    /*21*/ '0144 · 🔴 والأسامي كمان ما بتبانش قبل «اكشف»',
    /*22*/ '0144 · «اكشف» من غير مكان مرفوض',
    /*23*/ '0144 · بعد «اكشف»: المجموعة شافت المكان',
    /*24*/ '0144 · وشافت أسامي بعضها',
    /*25*/ '0144 · 🔴 واللي مش في المجموعة ما شافش المكان',
    /*26*/ '0144 · 🔴 اسم المكان المكتوب ما بيتقراش من غير صلاحية',
    /*27*/ '0144 · واللوحة بتقراه',
    /*28*/ '0144 · 🔴 الزيادة بتروح قايمة الانتظار (نص ولاد ونص بنات)',
    /*29*/ '0144 · ومعاها أولوية في النداء الجاي',
    /*30*/ '0144 · «بدّل» بينقل من المجموعة للانتظار',
    /*31*/ '0144 · و«دخّله» بيأكّد الحجز على طول (مفيش دفع يستناه)',
    /*32*/ '0144 · المهلة خلصت → الأعلى كسب',
    /*33*/ '0144 · «تيجي معاهم؟» دخّلت واحد فيه مكان',
    /*34*/ '0144 · و«تيجي معاهم؟» حوّلت للانتظار لما مفيش مكان',
    /*35*/ '0144 · 🔴 تحت الحد الأدنى: النداء بيتقفل من غير مجموعة',
    /*36*/ '0144 · وكل اللي شاركوا عرفوا، ومعاهم أولوية',
    /*37*/ '0144 · 🔴 مفيش صياغة رفض في أي رسالة اتبعتت',
    /*38*/ '0144 · 🔴 مفيش باب حجز خلفي (fn_book_free بترفض «يلا»)',
    /*39*/ '0144 · 🔴 المجهول ما يقدرش يقفل ولا يكشف ولا ينزّل نداء',
    /*40*/ '0144 · وعضو من غير صلاحية ما يقدرش ينزّل نداء',
    /*41*/ '0144 · والمالك بصلاحيته بينزّل نداء',
    /*42*/ '0144 · 🔴 اللي مشاركش في النداء ما ينضمش للمجموعة',
    /*43*/ '0144 · 🔴 الفيد العام مفيهوش ولا عمود بيكشف هوية',
    /*44*/ '0144 · 🔴 مفيش حد بيقرا جدول الاختيار — ولا صاحب الصف',
    /*45*/ '0144 · 🔴 الأعداد التفصيلية للوحة بس'];
begin
  if not exists (select 1 from sbota_templates where id = tpl) then
    test := '0144 · «يلا»';
    result := 'معلومة — محتاج البذرة المؤقتة (fn_test_seed_up)';
    return next;
    return;
  end if;

  begin
    -- ================================================== البذرة (جوه البلوك)
    perform fn_yalla_fixture_up();
    update settings set gender_balance = true, telegram_alerts = true,
                        yalla_card_hours = 3;
    update feature_flags set is_on = true where key = 'yalla';
    perform set_config('nasbot.alerts_test', 'on', true);

    -- حساب لوحة على عضو الاختبار التمانية — علشان نجرّب **المسموح** كمان
    -- (الدرس الأربعة وعشرين)، مش الممنوع بس.
    adm := m8;
    insert into admin_users (profile_id, role_key, is_active)
    values (adm, 'owner', true)
    on conflict (profile_id) do update set role_key = 'owner', is_active = true;

    -- ⚠ عضو مستني القالب ده («قولّي لما تفتح» — 0117). وجوده هو اللي
    --   بيخلّي صف «مفيش إيميل اتفتحت» **يشوف حاجة**: من غيره القالب القديم
    --   والجديد الاتنين بيطلّعوا صفر إيميل، والفخ ما بيتمسكش.
    insert into template_interest (template_id, profile_id) values (tpl, m8)
    on conflict do nothing;

    -- النداء A: مجموعة ٦، ميعادين، منطقتين
    insert into yalla_calls (id, template_id, line_ar, group_size, min_group, deadline)
    values (cA, tpl, '[اختبار] يلا نسبوط — بادل. إمتى وفين؟', 6, 4, now() + interval '2 days');
    insert into yalla_slots (call_id, starts_at, duration_min, sort) values
      (cA, now() + interval '5 days', 120, 1),
      (cA, now() + interval '6 days', 120, 2);
    insert into yalla_call_areas (call_id, area_key, sort) values
      (cA, 'tagamo3', 1), (cA, '3asher', 2);
    select id into sA1 from yalla_slots where call_id = cA order by sort limit 1;
    select id into sA2 from yalla_slots where call_id = cA order by sort desc limit 1;

    -- ================================================== (1–3) المجهول
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    execute 'set local role anon';

    select count(*) into n from fn_yalla_feed(20, cA);
    r := r || case when n = 1 then 'نجح' else format('فشل — المجهول شاف %s صف', n) end;

    begin
      perform fn_yalla_choose(cA, array[sA1], 'tagamo3', null);
      r := r || 'فشل — 🔴 المجهول اختار'::text;
    exception when insufficient_privilege then
      r := r || 'نجح'::text;
    end;
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);

    -- ================================================== (4–8) العضو بيختار
    -- العضو ٧ بيختار الميعاد التاني (علشان يبقى «اختار حاجة تانية» بعدين)
    perform set_config('request.jwt.claims',
      json_build_object('sub', m7, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform fn_yalla_choose(cA, array[sA2], '3asher', null);
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);

    -- العضو ١: اختيار، وبعدين تغيير
    perform set_config('request.jwt.claims',
      json_build_object('sub', m1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform fn_yalla_choose(cA, array[sA2], '3asher', '[اختبار] نادي بادل');
    select count(*) into n from fn_my_yalla_choice(cA);
    r := r || case when n = 1 then 'نجح' else 'فشل — اختار ومفيش صف' end;

    -- 🔴 الاختيار تاني بيعدّل مش بيكرر
    perform fn_yalla_choose(cA, array[sA1], 'tagamo3', null);
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);

    select count(*) into n from yalla_choices where call_id = cA and profile_id = m1;
    r := r || case when n = 1 then 'نجح' else format('فشل — 🔴 %s صف للعضو الواحد', n) end;

    -- التغيير بيتحسب صح: مفيش ولا واحد لسه على (الميعاد التاني + العاشر)
    -- غير العضو ٧، والعضو ١ بقى على (الأول + التجمع)
    -- ⚠ **ومعاها عدّ مواعيد العضو نفسه.** جرّبنا بفخ: شيلنا `delete` بتاعة
    --   المواعيد القديمة، فالعضو فضل على الميعادين — والأعداد بالزوج فضلت
    --   صح، فالصف عدّى. يعني الاختيار القديم كان بيفضل متعلّق والعضو
    --   يتعدّ مرتين في القفل. الفحص لازم يسأل عن **عدد مواعيده** كمان.
    select count(*) into i from yalla_choice_slots
     where call_id = cA and profile_id = m1;
    select coalesce(t.n, 0) into n from fn_yalla_top(cA) t
     where t.slot_id = sA1 and t.area_key = 'tagamo3';
    select coalesce(t.n, 0) into n2 from fn_yalla_top(cA) t
     where t.slot_id = sA2 and t.area_key = '3asher';
    r := r || case when n = 1 and n2 = 1 and i = 1 then 'نجح'
                   else format('فشل — الجديد %s والقديم %s ومواعيده %s (المفروض ١ و١ و١)',
                               n, n2, i) end;

    -- 🔴 مفيش كتابة مباشرة
    perform set_config('request.jwt.claims',
      json_build_object('sub', m2, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      insert into yalla_choices (call_id, profile_id, area_key) values (cA, m3, 'tagamo3');
      r := r || 'فشل — 🔴 العضو كتب اختيار باسم حد تاني'::text;
    exception when insufficient_privilege then
      r := r || 'نجح'::text;
    end;
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);

    select count(*) into n from admin_alerts where kind = 'yalla_want';
    r := r || case when n >= 1 then 'نجح' else 'فشل — مفيش رسالة تليجرام مع الاختيار' end;

    -- ================================================== (9–11) العدد بيكمل
    -- الأعضاء ٢..٦ على نفس الاختيار → السادس بيقفل النداء
    foreach p in array array[m2, m3, m4, m5, m6] loop
      perform set_config('request.jwt.claims',
        json_build_object('sub', p, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      perform fn_yalla_choose(cA, array[sA1], 'tagamo3', null);
      execute format('set local role %I', me);
      perform set_config('request.jwt.claims', '', true);
    end loop;

    select status into v_txt from yalla_calls where id = cA;
    r := r || case when v_txt = 'locked' then 'نجح'
                   else format('فشل — 🔴 ٦ اختاروا نفس الحاجة والنداء لسه «%s»', v_txt) end;

    select id into sbA from sbotat where yalla_id = cA;
    select count(*) into n from yalla_calls
     where id = cA and won_slot_id = sA1 and won_area = 'tagamo3';
    r := r || case when sbA is not null and n = 1 then 'نجح'
                   else 'فشل — السبوطة أو الاختيار الكسبان غلط' end;

    select count(*) into n from bookings
     where sbota_id = sbA and status = 'paid' and price_paid = 0;
    r := r || case when n = 6 then 'نجح' else format('فشل — %s حجز من ٦', n) end;

    -- ================================================== (12–14) الفيو والمواعيد
    select count(*) into n from sbotat_public where id = sbA;
    r := r || case when n = 0 then 'نجح'
                   else 'فشل — 🔴 سبوطة «يلا» باينة في القايمة العامة، وأي حد يقدر يحجز فيها' end;

    select count(*) into n from sbotat
     where id = sbA and booking_closes_at is null and reveal_at is null;
    r := r || case when n = 1 then 'نجح'
                   else 'فشل — 🔴 القفل ٣٦ ساعة أو الكشف التلقائي لسه بيتطبق على «يلا»' end;

    -- وسبوطة عادية لازم تفضل زي ما هي بالحرف
    insert into sbotat (id, template_id, venue_id, starts_at, ends_at, price, org_fee,
                        capacity, status, girls_only, is_day, is_mystery)
    values (norm, tpl, ven, now() + interval '10 days', now() + interval '10 days 2 hours',
            15000, 4000, 6, 'draft', false, false, false);
    select count(*) into n from sbotat
     where id = norm
       and booking_closes_at = starts_at - interval '36 hours'
       and reveal_at is not null;
    r := r || case when n = 1 then 'نجح'
                   else 'فشل — 🔴 السبوطة العادية بقت من غير قفل حجز أو من غير كشف' end;

    -- ================================================== (15–19) الرسايل
    select count(*) into n from notifications
     where template_key = 'booking_confirmed' and payload ->> 'sbota_id' = sbA::text;
    r := r || case when n = 0 then 'نجح' else format('فشل — %s إيميل «مكانك محجوز»', n) end;

    select count(*) into n from notifications
     where template_key = 'soon_opened' and payload ->> 'sbota_id' = sbA::text;
    r := r || case when n = 0 then 'نجح' else format('فشل — %s إيميل «اتفتحت»', n) end;

    select count(*) into n from member_tg_outbox where sbota_id = sbA;
    r := r || case when n = 0 then 'نجح' else format('فشل — %s إعلان لكل الأعضاء', n) end;

    select count(*) into n from notifications
     where template_key = 'yalla_won' and payload ->> 'yalla' = cA::text;
    r := r || case when n = 6 then 'نجح' else format('فشل — %s رسالة «كسب» من ٦', n) end;

    select count(*) into n from notifications
     where template_key = 'yalla_switch' and profile_id = m7;
    r := r || case when n = 1 then 'نجح' else format('فشل — %s رسالة «تيجي معاهم؟»', n) end;

    -- ================================================== (20–25) المكان والأسامي
    select id into bkA from bookings where sbota_id = sbA and profile_id = m1;

    r := r || case when fn_can_see_place(sbA, m1) = false then 'نجح'
                   else 'فشل — 🔴 الحارس بيدّي المكان قبل «اكشف»' end;

    perform set_config('request.jwt.claims',
      json_build_object('sub', m1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from fn_group_members(bkA);
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);
    r := r || case when n = 0 then 'نجح'
                   else format('فشل — 🔴 شاف %s اسم قبل «اكشف»', n) end;

    -- «اكشف» من غير مكان
    begin
      perform fn_yalla_reveal(cA);
      r := r || 'فشل — 🔴 اتكشفت من غير مكان مكتوب'::text;
    exception when others then
      r := r || case when sqlerrm like '%المكان بالظبط%' then 'نجح'
                     else 'فشل — ' || sqlerrm end;
    end;

    update sbotat set venue_name_ar = '[اختبار] نادي العاشر',
                      address_ar    = '[اختبار] شارع ١، العاشر من رمضان'
     where id = sbA;
    perform fn_yalla_reveal(cA);

    perform set_config('request.jwt.claims',
      json_build_object('sub', m1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select a.venue_name into v_txt from fn_sbota_address(sbA) a;
    select count(*) into n from fn_group_members(bkA);
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);

    r := r || case when v_txt like '[اختبار] نادي%' then 'نجح'
                   else 'فشل — المجموعة مش شايفة المكان بعد الكشف (' || coalesce(v_txt, 'فاضي') || ')' end;
    r := r || case when n = 5 then 'نجح' else format('فشل — شاف %s اسم من ٥', n) end;

    -- 🔴 اللي مش في المجموعة (العضو ٧ اختار حاجة تانية ومعندوش حجز)
    r := r || case when fn_can_see_place(sbA, m7) = false then 'نجح'
                   else 'فشل — 🔴 حد مش في المجموعة شاف المكان' end;

    -- ================================================== (26–27) اسم المكان المكتوب
    perform set_config('request.jwt.claims',
      json_build_object('sub', m1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      select count(*) into n from fn_yalla_admin(cA);
      r := r || format('فشل — 🔴 عضو عادي قرا %s صف من بيانات اللوحة', n);
    exception when others then
      r := r || case when sqlerrm like '%sbotat.view%' then 'نجح'
                     else 'فشل — ' || sqlerrm end;
    end;
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);

    -- واللوحة بتقراه (نفس الهوية بس عليها حساب لوحة)
    perform set_config('request.jwt.claims',
      json_build_object('sub', adm, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from fn_yalla_admin(cA) a where a.venue_note is not null;
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);
    r := r || case when n = 1 then 'نجح'
                   else format('فشل — اللوحة شافت %s اسم مكان مكتوب من ١', n) end;

    -- ================================================== (28–31) الزيادة والانتظار و«بدّل»
    -- النداء D: مجموعة ٤ وكله بنات → نصيب البنات ٢، فاتنين بيقعدوا واتنين انتظار
    insert into yalla_calls (id, template_id, line_ar, group_size, min_group, deadline)
    values (cD, tpl, '[اختبار] يلا — كله بنات', 4, 2, now() + interval '2 days');
    insert into yalla_slots (call_id, starts_at, duration_min, sort)
    values (cD, now() + interval '7 days', 120, 1);
    insert into yalla_call_areas (call_id, area_key, sort) values (cD, 'tagamo3', 1);
    select id into sD1 from yalla_slots where call_id = cD;

    foreach p in array array[m2, m4, m6, m8] loop
      perform set_config('request.jwt.claims',
        json_build_object('sub', p, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      perform fn_yalla_choose(cD, array[sD1], 'tagamo3', null);
      execute format('set local role %I', me);
      perform set_config('request.jwt.claims', '', true);
    end loop;

    select id into sbD from sbotat where yalla_id = cD;
    select count(*) into n  from bookings where sbota_id = sbD and status = 'paid';
    select count(*) into n2 from waitlist where sbota_id = sbD;
    r := r || case when n = 2 and n2 = 2 then 'نجح'
                   else format('فشل — قعدوا %s واستنوا %s (المفروض ٢ و٢)', n, n2) end;

    select count(*) into n from yalla_priority
     where from_call = cD and used_at is null;
    r := r || case when n = 2 then 'نجح'
                   else format('فشل — %s أولوية من ٢', n) end;

    -- «بدّل»: واحدة من المجموعة تروح أول الانتظار
    select id into bkD from bookings where sbota_id = sbD and status = 'paid' limit 1;
    perform fn_yalla_bench(bkD);
    select count(*) into n  from bookings where sbota_id = sbD and status = 'paid';
    select count(*) into n2 from waitlist where sbota_id = sbD;
    r := r || case when n = 1 and n2 = 3 then 'نجح'
                   else format('فشل — بعد «بدّل»: %s في المجموعة و%s في الانتظار', n, n2) end;

    -- و«دخّله» بتأكّد على طول لأن مفيش دفع
    select w.id into wlD from waitlist w
     where w.sbota_id = sbD
       and w.profile_id <> (select b.profile_id from bookings b where b.id = bkD)
     order by w.position limit 1;
    v_j := fn_admit_waitlist(wlD);
    r := r || case when (v_j ->> 'paid')::boolean then 'نجح'
                   else 'فشل — 🔴 «دخّله» عملت حجز مستني الدفع في خروجة مفيهاش دفع' end;

    -- ================================================== (32–34) المهلة و«تيجي معاهم؟»
    -- النداء E: مجموعة ٤، اتنين على الميعاد الأول وواحد على التاني
    insert into yalla_calls (id, template_id, line_ar, group_size, min_group, deadline)
    values (cE, tpl, '[اختبار] يلا — المهلة', 4, 2, now() + interval '2 days');
    insert into yalla_slots (call_id, starts_at, duration_min, sort) values
      (cE, now() + interval '8 days', 120, 1),
      (cE, now() + interval '9 days', 120, 2);
    insert into yalla_call_areas (call_id, area_key, sort) values (cE, 'tagamo3', 1);
    select id into sE1 from yalla_slots where call_id = cE order by sort limit 1;
    select id into sE2 from yalla_slots where call_id = cE order by sort desc limit 1;

    foreach p in array array[m1, m2] loop
      perform set_config('request.jwt.claims',
        json_build_object('sub', p, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      perform fn_yalla_choose(cE, array[sE1], 'tagamo3', null);
      execute format('set local role %I', me);
      perform set_config('request.jwt.claims', '', true);
    end loop;
    perform set_config('request.jwt.claims',
      json_build_object('sub', m3, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform fn_yalla_choose(cE, array[sE2], 'tagamo3', null);
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);

    -- المهلة خلصت
    update yalla_calls set deadline = now() - interval '1 minute' where id = cE;
    perform job_yalla_due();
    select count(*) into n from yalla_calls
     where id = cE and status = 'locked' and won_slot_id = sE1;
    r := r || case when n = 1 then 'نجح'
                   else 'فشل — 🔴 المهلة خلصت والأعلى مكسبش' end;

    -- «تيجي معاهم؟» والعدد لسه فيه مكان (٢ من ٤، وولد واحد من نصيب ٢)
    select id into sbE from sbotat where yalla_id = cE;
    perform set_config('request.jwt.claims',
      json_build_object('sub', m3, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    v_j := fn_yalla_join_winner(cE);
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);
    r := r || case when (v_j ->> 'seated')::boolean then 'نجح'
                   else 'فشل — فيه مكان ومدخلوش (' || coalesce(v_j::text, 'فاضي') || ')' end;

    -- وفي النداء A العدد كامل → العضو ٧ يروح الانتظار
    perform set_config('request.jwt.claims',
      json_build_object('sub', m7, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    v_j := fn_yalla_join_winner(cA);
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);
    r := r || case when coalesce((v_j ->> 'waiting')::boolean, false)
                    and exists (select 1 from waitlist where sbota_id = sbA and profile_id = m7)
                   then 'نجح'
                   else 'فشل — مفيش مكان والمفروض يروح الانتظار (' || coalesce(v_j::text, 'فاضي') || ')' end;

    -- ================================================== (35–37) تحت الحد الأدنى
    insert into yalla_calls (id, template_id, line_ar, group_size, min_group, deadline)
    values (cF, tpl, '[اختبار] يلا — مكمّلش', 6, 4, now() + interval '2 days');
    insert into yalla_slots (call_id, starts_at, duration_min, sort)
    values (cF, now() + interval '11 days', 120, 1);
    insert into yalla_call_areas (call_id, area_key, sort) values (cF, 'shorouk', 1);
    select id into sF1 from yalla_slots where call_id = cF;

    foreach p in array array[m1, m2] loop
      perform set_config('request.jwt.claims',
        json_build_object('sub', p, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';
      perform fn_yalla_choose(cF, array[sF1], 'shorouk', null);
      execute format('set local role %I', me);
      perform set_config('request.jwt.claims', '', true);
    end loop;

    update yalla_calls set deadline = now() - interval '1 minute' where id = cF;
    perform job_yalla_due();
    select count(*) into n from yalla_calls
     where id = cF and status = 'closed' and lock_reason = 'few';
    select count(*) into n2 from sbotat where yalla_id = cF;
    r := r || case when n = 1 and n2 = 0 then 'نجح'
                   else format('فشل — الحالة مش «مقفول» (%s) أو اتعملت سبوطة (%s)', n, n2) end;

    select count(*) into n from notifications
     where template_key = 'yalla_closed' and payload ->> 'yalla' = cF::text;
    select count(*) into n2 from yalla_priority where from_call = cF;
    r := r || case when n = 2 and n2 = 2 then 'نجح'
                   else format('فشل — %s رسالة و%s أولوية (المفروض ٢ و٢)', n, n2) end;

    -- 🔴 قرار المالك: ممنوع أي صياغة فيها رفض أو استبعاد
    select count(*) into n from notifications nt
      join notification_templates t on t.key = nt.template_key
     where nt.template_key like 'yalla\_%'
       and (t.body_ar like '%للأسف%' or t.body_ar like '%مش ينفع%'
            or t.body_ar like '%مرفوض%' or t.body_ar like '%اتقفل عليك%');
    r := r || case when n = 0 then 'نجح' else 'فشل — 🔴 فيه رسالة فيها رفض' end;

    -- ================================================== (38) الباب الخلفي
    perform set_config('request.jwt.claims',
      json_build_object('sub', m8, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform fn_book_free(sbA);
      r := r || 'فشل — 🔴 حد دخل مجموعة «يلا» من غير ما يختار'::text;
    exception when others then
      r := r || 'نجح'::text;
    end;
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);

    -- ================================================== (39–41) الصلاحيات
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    execute 'set local role anon';
    n := 0;
    begin perform fn_yalla_lock_now(cA);   exception when others then n := n + 1; end;
    begin perform fn_yalla_reveal(cA);     exception when others then n := n + 1; end;
    begin perform fn_yalla_create(tpl, 'x', 6, 4, now() + interval '1 day',
                                  array[now() + interval '3 days'], array['tagamo3']);
      exception when others then n := n + 1; end;
    execute format('set local role %I', me);
    r := r || case when n = 3 then 'نجح' else format('فشل — 🔴 %s من ٣ بس اترفضوا', n) end;

    perform set_config('request.jwt.claims',
      json_build_object('sub', m1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform fn_yalla_create(tpl, '[اختبار] من عضو', 6, 4, now() + interval '1 day',
                             array[now() + interval '3 days'], array['tagamo3']);
      r := r || 'فشل — 🔴 عضو عادي نزّل نداء'::text;
    exception when others then
      r := r || case when sqlerrm like '%sbotat.edit%' then 'نجح'
                     else 'فشل — ' || sqlerrm end;
    end;
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);

    -- والمالك بصلاحيته
    perform set_config('request.jwt.claims',
      json_build_object('sub', adm, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform fn_yalla_create(tpl, '[اختبار] من المالك', 6, 4, now() + interval '1 day',
                             array[now() + interval '3 days', now() + interval '4 days'],
                             array['tagamo3', '3asher'], '[اختبار] حوالي ١٥٠ جنيه');
      r := r || 'نجح'::text;
    exception when others then
      r := r || ('فشل — 🔴 المالك مقدرش ينزّل نداء: ' || sqlerrm);
    end;
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);

    -- ================================================== (42) مفيش انضمام من بره
    -- العضو ٨ ماختارش في النداء A خالص (اختار في D بس) — ومعاه حساب لوحة،
    -- يعني ده كمان بيثبت إن الصلاحية مش بديل عن المشاركة.
    perform set_config('request.jwt.claims',
      json_build_object('sub', m8, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      v_j := fn_yalla_join_winner(cA);
      r := r || 'فشل — 🔴 حد مشاركش في النداء انضم للمجموعة'::text;
    exception when others then
      r := r || case when sqlerrm like '%مشاركش%' then 'نجح' else 'فشل — ' || sqlerrm end;
    end;
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);

    -- ================================================== (43) شكل الفيد العام
    -- ⚠ الصف ده **بنيوي**: لو حد زوّد عمود في `fn_yalla_feed` بيكشف هوية
    --   (مين اختار إيه · اسم المكان اللي العضو كتبه)، البناء مش هيفشل
    --   والصفحة مش هتقع — الصف ده هو اللي هيقع.
    select count(*) into n
      from information_schema.parameters pa
      join information_schema.routines ro
        on ro.specific_name = pa.specific_name and ro.specific_schema = pa.specific_schema
     where ro.routine_schema = 'public' and ro.routine_name = 'fn_yalla_feed'
       and pa.parameter_mode = 'TABLE'
       and pa.parameter_name in ('venue_note','profile_id','first_name','profile_ids',
                                 'who','chose_by','names','members','venue_notes');
    r := r || case when n = 0 then 'نجح'
                   else format('فشل — 🔴 الفيد العام فيه %s عمود بيكشف هوية', n) end;

    -- ================================================== (44) الجدول مقفول وفيه بيانات
    -- ⚠ **الفحص ده لازم يبقى والجدول فيه صفوف فعلًا، والعضو له صف جواه.**
    --   أول نسخة كانت بتسأل قبل ما حد يختار — فالجدول كان فاضي، والرد كان
    --   «صفر» في كل الحالات، والفخ ما اتمسكش. دي نفس غلطة `test_case_roles`
    --   بالحرف (§٥.٥): «فحص الحارس لازم يبقى سلوكي والعضو له صف فعلًا».
    select count(*) into n2 from yalla_choices where call_id = cA;   -- بهوية المالك
    n := 0;

    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    execute 'set local role anon';
    begin
      select count(*) into i from yalla_choices;
      if i > 0 then n := n + 1; end if;
    exception when insufficient_privilege then null;
    end;
    execute format('set local role %I', me);

    -- وصاحب الصف نفسه كمان — الدور بيوصل من `fn_my_yalla_choice` بس
    perform set_config('request.jwt.claims',
      json_build_object('sub', m1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      select count(*) into i from yalla_choices;
      if i > 0 then n := n + 1; end if;
    exception when insufficient_privilege then null;
    end;
    begin
      select count(*) into i from yalla_choice_slots;
      if i > 0 then n := n + 1; end if;
    exception when insufficient_privilege then null;
    end;
    begin
      select count(*) into i from yalla_priority;
      if i > 0 then n := n + 1; end if;
    exception when insufficient_privilege then null;
    end;
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);

    r := r || case when n2 >= 7 and n = 0 then 'نجح'
                   when n2 < 7 then format('فشل — الاختبار نفسه فاضي (%s صف بس)، فالفحص ما بيشوفش حاجة', n2)
                   else format('فشل — 🔴 %s جدول من الأربعة اتقرا من بره', n) end;

    -- ================================================== (45) الأعداد التفصيلية
    -- ⚠ صفحة اللوحة بتنادي `fn_yalla_counts` — مرفوضة للعضو العادي.
    --   (`fn_yalla_top` نفسها مقفولة على الكل، ودي غلاف بصلاحية.)
    n := 0;
    perform set_config('request.jwt.claims',
      json_build_object('sub', m1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform count(*) from fn_yalla_counts(cA);
    exception when others then n := n + 1;
    end;
    execute format('set local role %I', me);

    perform set_config('request.jwt.claims',
      json_build_object('sub', adm, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      select count(*) into n2 from fn_yalla_counts(cA);
    exception when others then n2 := -1;
    end;
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);

    r := r || case when n = 1 and n2 >= 1 then 'نجح'
                   when n = 0 then 'فشل — 🔴 عضو عادي قرا الأعداد التفصيلية'
                   else format('فشل — اللوحة قرت %s صف', n2) end;

    raise exception 'test_yalla_rollback';
  exception when others then
    get stacked diagnostics msg = message_text;
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);
    perform set_config('nasbot.alerts_test', '', true);
    perform set_config('nasbot.trusted_booking', '', true);
    if msg <> 'test_yalla_rollback' then
      r := r || ('فشل — استثناء: ' || msg);
    end if;
  end;

  for i in 1 .. array_length(r, 1) loop
    test := coalesce(names[i], '0144 · «يلا» — صف زيادة');
    result := r[i];
    return next;
  end loop;
end $body$;

comment on function test_yalla() is
  '0144 — «يلا» سلوكي: المجهول أعداد بس · الاختيار ما بيتكررش · الكسبان بالعدد وبالمهلة · تحت الحد الأدنى · الزيادة انتظار بأولوية · «تيجي معاهم؟» · المكان والأسامي بعد «اكشف» بس · والتمانية تعديلات ما كسروش السبوطة العادية.';
revoke execute on function test_yalla() from public, anon, authenticated;
