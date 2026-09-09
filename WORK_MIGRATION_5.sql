-- ============================================================================
-- WORK_MIGRATION_5.sql — تصليحات المراجعة الأمنية والفلوس (الأحمر)
--
-- الزقه مرة واحدة في Supabase ← SQL Editor ← Run. مفيش قيم enum جديدة فمفيش تقسيم.
-- شرط: الأجزاء 1–4 اتطبّقوا قبله. آمن يتكرر (كله create or replace / drop if exists / if not exists).
--
-- بيصلّح: تزوير التبادل (S1/S2) · تسريب صف profiles كامل (S3) · الحجز المجاني (S4)
--         · captains المكشوف (S5) · صلاحيات الفلوس الواسعة (S8/A10/A11) · الكشف
--         المكسور (A1) · job_purge (D4) · إلغاء الحجز تحت المراجعة (D6) · الفلوس
--         السالبة (D7) · fn_reveal المفتوح للزائر المجهول · وحراس definer اللي
--         كانوا ديكور (0063).
--
-- بعد ما يخلص، شغّل السطرين دول علشان تتأكد بنفسك:
--     select * from test_review_fixes();
--     select * from test_caller_guards();
-- المفروض كل الصفوف تقول «نجح». أي «فشل» ابعتهولي بالحرف.
-- ============================================================================


-- ############################################################################
-- # 20260909160000_0052_forge_mutual_match_fix.sql
-- ############################################################################

-- ============================================================================
-- 0052 — إصلاح «التبادل المزيّف» (S1 / S2)
--
-- المشكلة: سياسات الإدراج/التعديل القديمة على pair_affinity و work_affinity
-- كانت بتقبل أي صف طول ما جهة واحدة = أنا، من غير ما تلزم الجهة التانية تبقى
-- false. فالعضو كان يقدر يعمل في سطر واحد:
--   insert into pair_affinity (a_id,b_id,a_wants_b,b_wants_a) values (.., true, true)
-- والمحفّز fn_mutual_affinity بيشوف الجهتين true فبيحط mutual_at على طول →
-- تبادل مزيّف مع أي عضو من غير علمه (وبيفتح الشات الخاص وكشف الصورة).
--
-- الحل (الأنضف زي ما المراجعة اقترحت): نسحب سياستَي الإدراج والتعديل المباشرتين
-- خالص، ونخلّي الطريق الوحيد للكتابة هو fn_pair_want (0047) و fn_work_want (0042)
-- — الاتنين security definer وبيكتبوا جهة اللي بينادي بس، والجهة التانية بتفضل
-- زي ما هي. القراية للإدارة بس فضلت زي ما هي (pair_admin_read / work_pair_admin_read).
-- ============================================================================

-- ===== pair_affinity: اسحب الكتابة المباشرة =====
drop policy if exists pair_insert_own on pair_affinity;
drop policy if exists pair_update_own on pair_affinity;
-- دفاع في العمق: مفيش داعي لأي منحة كتابة مباشرة (الدالة definer مش محتاجاها)
revoke insert, update, delete on pair_affinity from anon, authenticated;

-- ===== work_affinity: نفس الحكاية بالحرف =====
drop policy if exists work_pair_insert_own on work_affinity;
drop policy if exists work_pair_update_own on work_affinity;
revoke insert, update, delete on work_affinity from anon, authenticated;

-- ملاحظة: fn_pair_want / fn_work_want لسه ممنوحين لـ authenticated (0047 / 0042)
-- وهما definer فبيشتغلوا من غير ما يحتاجوا منحة على الجدول.


-- ############################################################################
-- # 20260909160100_0053_profiles_mutual_read_restrict.sql
-- ############################################################################

-- ============================================================================
-- 0053 — تضييق قراية المتبادلين على profiles (S3)
--
-- المشكلة: سياسة profiles_mutual_read كانت بتفتح **الصف كامل** لأي متبادل —
-- و RLS مالهاش أعمدة، فاللي اتبادل معاك كان بيقرا phone و email و birth_year
-- و wallet_balance و referral_code و no_show_count و banned_at ... إلخ.
-- ده تسريب بالتصميم، والمشروع كله قايم على إن دي مخفية (fn_group_members).
--
-- الحل: نمسح السياسة خالص. المتبادلون بيشوفوا بعض عن طريق fn_met_before()
-- (0015/0028) — دالة security definer بترجّع الأعمدة الآمنة بس:
--   (profile_id, first_name, persona/type, avatar_path)
-- وهي أصلًا اللي getMetBefore بينادي عليها (src/lib/api.ts). قراية الصورة نفسها
-- من التخزين لسه شغالة عن طريق avatars_mutual_read (fn_is_mutual — بقى سليم بعد 0052).
--
-- مفيش أي قراية مباشرة في src للـ profiles بتاعت طرف تاني بتعتمد على السياسة دي
-- (كل قراية إما .eq('id', uid) لنفسك، أو عن طريق دوال definer) فالمسح آمن.
-- ============================================================================

drop policy if exists profiles_mutual_read on profiles;

-- fn_met_before موجودة وممنوحة لـ authenticated من 0028 — مفيش تغيير محتاجينه فيها.


-- ############################################################################
-- # 20260909160200_0054_bookings_insert_guard.sql
-- ############################################################################

-- ============================================================================
-- 0054 — منع «الحجز المجاني المؤكد» (S4)
--
-- المشكلة: bookings_own_insert كانت بتتحقق من profile_id بس — مفيش شرط على
-- status ولا price_paid. فالعضو كان يقدر:
--   insert into bookings (sbota_id, profile_id, status, price_paid)
--   values ('<سبوطة مفتوحة>', auth.uid(), 'paid', 0)
-- = حجز مجاني مؤكد من غير ما يعدّي على /api/pay/create خالص (اللي بيشتغل
-- بمفتاح الخدمة ويحسب السعر على الخادم).
--
-- الحل (نفس نمط fn_guard_pass_columns على work_passes — 0042):
--   1) نضيّق سياسة الإدراج للعضو: profile_id = أنا و status = 'pending_payment'
--      و price_paid/discount/wallet_used = 0.
--   2) محفّز fn_guard_booking_columns before insert or update: لو اللي بينادي
--      anon/authenticated ومحاول يحط/يغيّر status أو أعمدة الفلوس أو الحضور
--      لحاجة غير الافتراضي، لازم يكون معاه bookings.edit — غير كده استثناء.
--
-- المسارات المشروعة ما بتتأثرش: /api/pay/create و fn_redeem_pass و
-- fn_approve_transfer و fn_booking_paid و job_work_recurring كلها بتشتغل
-- بمفتاح الخدمة أو security definer (current_user = postgres/service_role)
-- فالمحفّز بيعديها. وترقية قايمة الانتظار من اللوحة (status='pending_payment',
-- price_paid=0) بتعدّي كمان لأنها القيم الافتراضية — بس محتاجة سياسة الإدارة
-- (bookings.edit) علشان الصف لطرف تاني (بتتظبط في 0056).
-- ============================================================================

-- ===== 1) تضييق سياسة الإدراج للعضو =====
drop policy if exists bookings_own_insert on bookings;
create policy bookings_own_insert on bookings for insert
  with check (
    profile_id = auth.uid()
    and status = 'pending_payment'
    and price_paid = 0
    and discount = 0
    and wallet_used = 0
    and paid_with_pass = false
  );

-- ===== 2) محفّز حارس الأعمدة (نمط fn_guard_pass_columns) =====
create or replace function fn_guard_booking_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- بيتطبّق بس لو اللي بينادي عضو من المتصفح (anon/authenticated).
  -- الدوال definer والمسارات بمفتاح الخدمة current_user بتاعها postgres/service_role.
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      -- إدراج بأي حاجة غير حجز مبدئي مجاني محتاج صلاحية bookings.edit
      if (new.status is distinct from 'pending_payment'::booking_status_t
       or new.price_paid  <> 0
       or new.discount    <> 0
       or new.wallet_used <> 0
       or new.paid_with_pass is distinct from false
       or new.checked_in_at is not null
       or new.cancelled_at  is not null
       or new.refund_kind   is not null
       or new.payment_id    is not null)
      and not fn_has_permission('bookings.edit') then
        raise exception 'العضو بيعمل حجز pending_payment مجاني بس — تأكيد الحجز والفلوس عبر مسارات الدفع';
      end if;
    elsif tg_op = 'UPDATE' then
      if (new.status      is distinct from old.status
       or new.price_paid  is distinct from old.price_paid
       or new.discount    is distinct from old.discount
       or new.wallet_used is distinct from old.wallet_used
       or new.paid_with_pass is distinct from old.paid_with_pass
       or new.checked_in_at is distinct from old.checked_in_at
       or new.cancelled_at  is distinct from old.cancelled_at
       or new.refund_kind   is distinct from old.refund_kind
       or new.payment_id    is distinct from old.payment_id)
      and not fn_has_permission('bookings.edit') then
        raise exception 'تعديل حالة الحجز أو فلوسه عبر الدوال/الإدارة بس';
      end if;
    end if;
  end if;
  return new;
end;
$$;
comment on function fn_guard_booking_columns() is
  'بيمنع العضو من المتصفح إنه يحط/يغيّر status أو الفلوس أو الحضور على الحجز مباشرة — الدوال ومسارات الدفع بس.';
revoke execute on function fn_guard_booking_columns() from public, anon, authenticated;

drop trigger if exists t_guard_booking_columns on bookings;
create trigger t_guard_booking_columns before insert or update on bookings
  for each row execute function fn_guard_booking_columns();


-- ############################################################################
-- # 20260909160300_0055_captains_public_view.sql
-- ############################################################################

-- ============================================================================
-- 0055 — إخفاء payout_method عن العالم (S5)
--
-- المشكلة: captains_read كانت using (is_active or fn_is_admin()) — الجدول كله
-- مفتوح لأي زائر، وفيه payout_method jsonb (طريقة استلام فلوس الكابتن) و
-- profile_id. يعني:
--   curl ".../rest/v1/captains?select=payout_method,profile_id" -H "apikey: $ANON"
-- بيرجّع بيانات الدفع لكل الكباتن. تسريب مالي لطرف تالت.
--
-- الحل: عرض captains_public بالأعمدة الآمنة بس (زي sbotat_public)، وترفع القراية
-- عن الجدول نفسه لـ fn_is_admin().
--   • العرض **مش** security_invoker — بيتنفّذ بصلاحية صاحبه (postgres) فبيتخطّى
--     RLS المشدود على الجدول، بس بيطلّع الأعمدة الآمنة بس ولـ is_active بس.
--   • payout_method و profile_id **مش موجودين** في العرض خالص.
--
-- ⚠️ تغيير كود مطلوب من مالك src (مش من هجرتي): getCaptains / getCaptain في
--    src/lib/api.ts (سطر ~211 و ~220) بيقروا من .from('captains'). لازم يتغيّروا
--    لـ .from('captains_public'). الأعمدة اللي بيختاروها
--    (id, bio_line, activities, display_name, craft_ar, photo_path) كلها موجودة
--    في العرض بنفس الأسماء، فتغيير اسم الجدول بس كفاية.
-- ============================================================================

-- ===== العرض العام — أعمدة آمنة بس، والنشطين بس =====
drop view if exists captains_public;
create view captains_public as
select
  c.id,
  c.display_name,
  c.craft_ar,
  c.bio_line,
  c.photo_path,
  c.activities,
  c.rating_avg,
  c.sbota_count
from captains c
where c.is_active;

comment on view captains_public is
  'كارت الكابتن العام — من غير payout_method ولا profile_id. النشطين بس. مصدر القراية العامة (getCaptains/getCaptain) المفروض ياخد منه.';

grant select on captains_public to anon, authenticated;

-- ===== شدّ قراية الجدول نفسه على الإدارة =====
drop policy if exists captains_read on captains;
create policy captains_read on captains for select
  using (fn_is_admin());


-- ############################################################################
-- # 20260909160400_0056_admin_permission_policies.sql
-- ############################################################################

-- ============================================================================
-- 0056 — سياسات الكتابة بالصلاحية الدقيقة بدل fn_is_admin() (S8 / A10 / A11)
--
-- المشكلة: كل سياسات الكتابة القديمة على الجداول دي كانت
--   for all using (fn_is_admin())
-- و fn_is_admin() بعد 0035 بقت «أي صف نشط في admin_users مهما كان دوره». يعني
-- دور support (اللي مالوش صلاحية إعدادات ولا كوبونات) كان يقدر بنداء API مباشر
-- يغيّر الأسعار، يعمل كوبونات، يعدّل سبوطة، يقفل بلاغ ... إلخ. فصل الأدوار كان
-- واجهة بس. الرسايل في اللوحة «القاعدة رفضت — محتاج صلاحية X» ما كانتش هتظهر أبدًا.
--
-- الحل: نبدّل سياسة الكتابة بـ fn_has_permission('<الصلاحية الصح>') لكل جدول،
-- ونسيب القراية زي ما هي (القراية للإدارة كلها مقبولة). الخريطة:
--   settings→settings.edit · bookings→bookings.edit · sbotat→sbotat.edit ·
--   venues→sbotat.edit · captains→captains.edit · coupons→coupons.edit ·
--   reports→reports.action · matching_runs→matching.approve ·
--   behavior_flags→people.ban · chat_members→reports.action
-- (المفاتيح متأكدين إنها متبذورة في 0035.)
--
-- الجداول اللي كانت for all هي كمان مصدر قراية الإدارة الوحيد (matching_runs،
-- behavior_flags) بنضيف لها سياسة قراية fn_is_admin() صريحة علشان القراية ما تتكسرش.
-- باقي الجداول عندها سياسة قراية أصلًا فيها fn_is_admin() (أو قراية عامة).
-- ============================================================================

-- ===== settings =====
drop policy if exists settings_admin on settings;
create policy settings_write on settings for all
  using (fn_has_permission('settings.edit')) with check (fn_has_permission('settings.edit'));

-- ===== bookings =====
drop policy if exists bookings_admin on bookings;
create policy bookings_write on bookings for all
  using (fn_has_permission('bookings.edit')) with check (fn_has_permission('bookings.edit'));

-- ===== sbotat =====
drop policy if exists sbotat_admin on sbotat;
create policy sbotat_write on sbotat for all
  using (fn_has_permission('sbotat.edit')) with check (fn_has_permission('sbotat.edit'));

-- ===== venues =====
drop policy if exists venues_admin on venues;
create policy venues_write on venues for all
  using (fn_has_permission('sbotat.edit')) with check (fn_has_permission('sbotat.edit'));

-- ===== captains =====
drop policy if exists captains_admin on captains;
create policy captains_write on captains for all
  using (fn_has_permission('captains.edit')) with check (fn_has_permission('captains.edit'));

-- ===== coupons =====
drop policy if exists coupons_admin on coupons;
create policy coupons_write on coupons for all
  using (fn_has_permission('coupons.edit')) with check (fn_has_permission('coupons.edit'));

-- ===== reports =====
drop policy if exists reports_admin on reports;
create policy reports_write on reports for all
  using (fn_has_permission('reports.action')) with check (fn_has_permission('reports.action'));

-- ===== matching_runs (كان for all هو القراية كمان) =====
drop policy if exists matching_admin on matching_runs;
create policy matching_admin_read on matching_runs for select using (fn_is_admin());
create policy matching_write on matching_runs for all
  using (fn_has_permission('matching.approve')) with check (fn_has_permission('matching.approve'));

-- ===== behavior_flags (كان for all هو القراية كمان) =====
drop policy if exists flags_admin on behavior_flags;
create policy flags_admin_read on behavior_flags for select using (fn_is_admin());
create policy flags_write on behavior_flags for all
  using (fn_has_permission('people.ban')) with check (fn_has_permission('people.ban'));

-- ===== chat_members =====
drop policy if exists members_admin on chat_members;
create policy members_write on chat_members for all
  using (fn_has_permission('reports.action')) with check (fn_has_permission('reports.action'));


-- ############################################################################
-- # 20260909160500_0057_fn_reveal_grant_and_guard.sql
-- ############################################################################

-- ============================================================================
-- 0057 — fn_reveal: منح التنفيذ + فحص الصلاحية جوّه (A1)
--
-- المشكلة: زرار «اعتمد التوزيع واكشفه» بينادي fn_reveal — والدالة عمرها ما
-- اتمنحت لـ authenticated (0011 و 0028 بيعملوا revoke ثم whitelist مفيهاش
-- fn_reveal). فالكشف اليدوي مستحيل من اللوحة (permission denied for function
-- fn_reveal)، والكشف بيحصل بس لما job_reveal_due توصل لميعادها.
--
-- الحل: نمنح execute لـ authenticated، ونحط فحص صلاحية جوّه الدالة (زي
-- fn_build_matching / fn_activate_pass): أي نداء من مستخدم مسجّل (auth.uid()
-- مش null) لازم يكون معاه matching.approve — غير كده استثناء. النداء الداخلي من
-- job_reveal_due بيشتغل بمفتاح الخدمة/الكرون (auth.uid() = null) فبيعدّي عادي.
--
-- الجسم زي 0026 بالحرف + بلوك الحارس بعد begin بس.
-- ============================================================================

create or replace function fn_reveal(p_sbota uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  s        sbotat;
  run      matching_runs;
  grp      jsonb;
  gid      uuid;
  rid      uuid;
  member   jsonb;
  idx      int := 0;
  made     int := 0;
begin
  -- ===== حارس الصلاحية (A1) =====
  -- نداء من مستخدم مسجّل لازم يكون معاه matching.approve. النداء الداخلي
  -- (الكرون/مفتاح الخدمة) auth.uid() بتاعه null فبيعدّي.
  if auth.uid() is not null and not fn_has_permission('matching.approve') then
    raise exception 'الكشف واعتماد التوزيع محتاج صلاحية matching.approve';
  end if;

  select * into s from sbotat where id = p_sbota;
  if not found then return 0; end if;

  -- اتكشفت قبل كده؟
  if exists (select 1 from sbota_groups where sbota_id = p_sbota) then
    return 0;
  end if;

  select * into run from matching_runs
  where sbota_id = p_sbota order by ran_at desc limit 1;

  -- مفيش اقتراح مطابقة: مجموعة واحدة بكل الحاجزين
  if not found then
    insert into sbota_groups (sbota_id, index, captain_id, why_ar)
    values (p_sbota, 1, s.captain_id, 'كلكم حاجزين نفس السبوطة — وده أول لقا.')
    returning id into gid;

    insert into chat_rooms (kind, sbota_id, group_id, opens_at, closes_at)
    values ('sbota_group', p_sbota, gid, s.reveal_at, s.chat_closes_at)
    returning id into rid;

    update sbota_groups set chat_room_id = rid where id = gid;

    update bookings set group_id = gid
    where sbota_id = p_sbota and status = 'paid';

    insert into chat_members (room_id, profile_id, role)
    select rid, b.profile_id, 'member' from bookings b
    where b.sbota_id = p_sbota and b.status = 'paid'
    on conflict do nothing;

    if s.captain_id is not null then
      insert into chat_members (room_id, profile_id, role)
      select rid, c.profile_id, 'captain' from captains c where c.id = s.captain_id
      on conflict do nothing;
    end if;

    made := 1;
  else
    -- تنفيذ الاقتراح
    for grp in select * from jsonb_array_elements(run.proposal -> 'groups') loop
      idx := idx + 1;
      insert into sbota_groups (sbota_id, index, captain_id, why_ar)
      values (p_sbota, idx, s.captain_id, grp ->> 'why')
      returning id into gid;

      insert into chat_rooms (kind, sbota_id, group_id, opens_at, closes_at)
      values ('sbota_group', p_sbota, gid, s.reveal_at, s.chat_closes_at)
      returning id into rid;

      update sbota_groups set chat_room_id = rid where id = gid;

      for member in select * from jsonb_array_elements(grp -> 'members') loop
        update bookings set group_id = gid
        where sbota_id = p_sbota and profile_id = (member #>> '{}')::uuid;

        insert into chat_members (room_id, profile_id, role)
        values (rid, (member #>> '{}')::uuid, 'member')
        on conflict do nothing;
      end loop;

      if s.captain_id is not null then
        insert into chat_members (room_id, profile_id, role)
        select rid, c.profile_id, 'captain' from captains c where c.id = s.captain_id
        on conflict do nothing;
      end if;

      made := made + 1;
    end loop;

    update matching_runs set approved_at = coalesce(approved_at, now()) where id = run.id;
  end if;

  -- رسالة الكشف لكل حاجز
  insert into notifications (profile_id, channel, template_key, payload)
  select b.profile_id, 'whatsapp', 'group_reveal',
         jsonb_build_object('booking_id', b.id, 'sbota_id', p_sbota)
  from bookings b where b.sbota_id = p_sbota and b.status = 'paid';

  update sbotat set status = 'locked' where id = p_sbota and status in ('open','full');

  insert into audit_log (action, entity, entity_id, after)
  values ('reveal', 'sbotat', p_sbota, jsonb_build_object('groups', made));

  return made;
end;
$$;
comment on function fn_reveal(uuid) is 'بينشئ المجموعات والغرف وبيبعت رسالة الكشف. بيشتغل مرة واحدة لكل سبوطة. النداء اليدوي محتاج matching.approve.';

-- منح التنفيذ للوحة (الفحص جوّه بيحمي)
grant execute on function fn_reveal(uuid) to authenticated;


-- ############################################################################
-- # 20260909160600_0058_job_purge_fix.sql
-- ############################################################################

-- ============================================================================
-- 0058 — إصلاح job_purge علشان المسح فعلًا يحصل (D4 / D19)
--
-- المشكلة:
--   D4) job_purge كان بيحط phone = 'deleted-' || id::text، وده بيكسر
--       profiles_phone_check (phone ~ '^\+201[0125][0-9]{8}$'). أول حساب مستحق
--       للمسح كان بيرمي check violation ويوقّع الدالة كلها → المسح بعد 30 يوم
--       عمره ما بيحصل، و delete from otp_codes بيترجع معاه.
--   D19) referral_code = 'DEL' || left(id::text,3) — و referral_code فريد.
--        3 حروف hex = 4096 احتمال بس → تصادم شبه مؤكد → duplicate key.
--
-- الحل (زي ما المراجعة اقترحت): نخلّي phone و referral_code يقبلوا null (تعديل
-- آمن — مش بيمسح أي بيانات موجودة)، و job_purge بيحطهم null للمحذوفين. null
-- ما بيكسرش لا فحص الصيغة (CHECK بيعدّي على null) ولا قيد الفرادة (null-distinct).
-- والحارس بيبقى «phone is not null» علشان ما يعيدش معالجة المتمسوحين (idempotent).
-- ============================================================================

-- ===== 1) نخلّي الأعمدة تقبل null (بيانات الأحياء ما بتتلمسش) =====
alter table profiles alter column phone         drop not null;
alter table profiles alter column referral_code drop not null;

-- ===== 2) نعيد كتابة job_purge بصيغة بتعدّي القيود =====
create or replace function job_purge()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int := 0;
begin
  delete from otp_codes where created_at < now() - interval '1 day';

  -- البيانات الشخصية بتتمسح، وسجلات الدفع بتفضل للضريبة من غير هوية.
  -- phone/referral_code بيبقوا null (بيعدّوا الصيغة والفرادة)، والحارس
  -- «phone is not null» بيمنع إعادة المعالجة فالدالة idempotent.
  update profiles
  set phone = null,
      email = null,
      first_name = null,
      avatar_path = null,
      wish_text = null,
      type_scores = null,
      referral_code = null
  where deleted_at is not null
    and deleted_at < now() - interval '30 days'
    and phone is not null;
  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function job_purge() is 'بيمسح رموز التحقق القديمة، وبيجهّل بيانات المحذوفين بعد 30 يوم (phone/referral_code = null) مع الاحتفاظ بسجلات الدفع. idempotent.';


-- ############################################################################
-- # 20260909160700_0059_job_expire_bookings_fix.sql
-- ############################################################################

-- ============================================================================
-- 0059 — job_expire_bookings ما يلغيش حجز صورته تحت المراجعة (D6)
--
-- المشكلة: job_expire_bookings كان بيلغي أي pending_payment عدّى expires_at من
-- غير ما يبص على حالة الدفعة. فحجز العضو اللي حوّل فعلًا (payment = pending_review)
-- ولسه الإدارة ما راجعتوش (إجازة/ويكند) كان بيتلغي cancelled_by_us، وفلوسه واصلة،
-- ومفيش استرداد تلقائي. المكان بيروح لحد تاني.
--
-- الحل: نستثني أي حجز عليه دفعة في pending_review أو succeeded — ده معناه إن
-- العضو رفع تحويل مستني مراجعة (أو اتدفع خلاص). الحجز المهجور فعلًا (مفيش دفعة
-- مستنية) لسه بيتلغي عادي.
-- ============================================================================

create or replace function job_expire_bookings()
returns int
language sql
security definer
set search_path = public
as $$
  with done as (
    update bookings set status = 'cancelled_by_us', cancel_reason = 'مهلة الدفع خلصت'
    where status = 'pending_payment' and expires_at is not null and now() > expires_at
      and not exists (
        select 1 from payments p
        where p.booking_id = bookings.id
          and p.status in ('pending_review', 'succeeded')
      )
    returning 1
  ) select count(*)::int from done;
$$;

comment on function job_expire_bookings() is 'بيلغي الحجوزات اللي فاتت مهلة الدفع — إلا اللي عليها تحويل تحت المراجعة (pending_review) أو دفعة ناجحة.';


-- ############################################################################
-- # 20260909160800_0060_money_check_constraints.sql
-- ############################################################################

-- ============================================================================
-- 0060 — قيود CHECK تمنع الفلوس السالبة (D7)
--
-- المشكلة: مفيش أي قيد يمنع مبلغ سالب. مثبت بـ INSERT: payments.amount=-500000
-- اتقبل، bookings(price_paid=-99999,...) اتقبل، sbotat.price=-100000 اتقبل،
-- coupons.value=-9999 اتقبل. غلطة صفر في اللوحة أو bug حساب بيقلب العلامة من
-- غير ما القاعدة تزعّق.
--
-- الحل: قيود CHECK على كل عمود فلوس. الجداول صغيرة فالقفل مش مشكلة. كل قيد
-- متحوط بـ if not exists علشان الملف يتعاد. (wallet_ledger.delta بيفضل باتجاهين
-- — ده مقصود، مش بنلمسه.)
-- ============================================================================

do $$
begin
  -- payments
  if not exists (select 1 from pg_constraint where conname = 'payments_amount_nonneg') then
    alter table payments add constraint payments_amount_nonneg check (amount >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payments_fee_nonneg') then
    alter table payments add constraint payments_fee_nonneg check (fee_amount >= 0);
  end if;

  -- refunds
  if not exists (select 1 from pg_constraint where conname = 'refunds_amount_nonneg') then
    alter table refunds add constraint refunds_amount_nonneg check (amount >= 0);
  end if;

  -- bookings
  if not exists (select 1 from pg_constraint where conname = 'bookings_money_nonneg') then
    alter table bookings add constraint bookings_money_nonneg
      check (price_paid >= 0 and discount >= 0 and wallet_used >= 0);
  end if;

  -- work_passes
  if not exists (select 1 from pg_constraint where conname = 'work_passes_price_nonneg') then
    alter table work_passes add constraint work_passes_price_nonneg check (price_paid >= 0);
  end if;

  -- sbotat
  if not exists (select 1 from pg_constraint where conname = 'sbotat_money_nonneg') then
    alter table sbotat add constraint sbotat_money_nonneg
      check (price >= 0 and org_fee >= 0);
  end if;

  -- coupons (قيمة الخصم لازم تكون موجبة فعلًا)
  if not exists (select 1 from pg_constraint where conname = 'coupons_value_positive') then
    alter table coupons add constraint coupons_value_positive check (value > 0);
  end if;
end $$;


-- ############################################################################
-- # 20260909161000_0061_test_review_fixes.sql
-- ############################################################################

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


-- ############################################################################
-- # 20260909161100_0062_fn_reveal_close_anon.sql
-- ############################################################################

-- ============================================================================
-- 0062 — سدّ ثغرة فتحها 0057 في fn_reveal
--
-- المشكلة: 0057 منح fn_reveal لـ authenticated بس ما سحبهاش من public، وفي
-- بوستجرس أي دالة جديدة بتبقى منفّذة لـ PUBLIC افتراضيًا — يعني anon كمان.
-- وأسوأ من كده، الحارس جوّه الدالة كان:
--
--     if auth.uid() is not null and not fn_has_permission('matching.approve')
--
-- والزائر المجهول (anon من غير جلسة) auth.uid() بتاعه **null** — فالشرط بيبقى
-- false والحارس بيعدّيه. النتيجة: أي حد على النت يقدر ينده
-- fn_reveal('<أي سبوطة>') ويكشف المجموعة قبل ميعادها لكل الناس.
--
-- (الاختبار test_review_fixes() هو اللي مسك دي — السطر «0057 · fn_reveal
-- موجودة ومقفولة على anon» كان بيقول «فشل — anon يقدر ينفّذها».)
--
-- الحل، طبقتين:
--   1) نسحب التنفيذ من public و anon — الطبقة اللي المفروض كانت من الأول.
--   2) نصلّح الحارس نفسه يبقى على `current_user` زي fn_guard_booking_columns
--      (0054) بدل auth.uid(): أي نداء جاي من المتصفح (anon/authenticated)
--      لازم معاه matching.approve. النداء الداخلي (الكرون job_reveal_due وهو
--      definer مملوك لـ postgres، ومسارات مفتاح الخدمة) current_user بتاعه
--      postgres/service_role فبيعدّي زي ما هو.
-- ============================================================================

-- ===== 1) سحب التنفيذ من الزائر المجهول =====
revoke execute on function fn_reveal(uuid) from public;
revoke execute on function fn_reveal(uuid) from anon;
grant  execute on function fn_reveal(uuid) to authenticated;

-- ===== 2) تصليح الحارس جوّه الدالة =====
-- بنعدّل أول سطرين الحارس بس؛ باقي جسم الدالة زي ما 0057 سابه بالحرف.
do $$
declare
  src  text;
  new_src text;
begin
  select prosrc into src from pg_proc
   where proname = 'fn_reveal' and pronamespace = 'public'::regnamespace;

  if src is null then
    raise exception 'fn_reveal مش موجودة — طبّق 0057 الأول';
  end if;

  new_src := replace(
    src,
    'if auth.uid() is not null and not fn_has_permission(''matching.approve'') then',
    'if current_user in (''anon'', ''authenticated'') and not fn_has_permission(''matching.approve'') then'
  );

  if new_src = src then
    -- إما الملف اتشغّل قبل كده (الحالة الطبيعية لو بتعيده)، وإما الحارس
    -- اتكتب بشكل تاني — في الحالتين منعملش حاجة على العمياني.
    if src like '%current_user in (''anon'', ''authenticated'')%' then
      raise notice '0062: حارس fn_reveal متصلّح أصلًا — عدّينا';
    else
      raise notice '0062: ⚠ حارس fn_reveal مش على الشكل المتوقع — اتأكد منه بإيدك';
    end if;
  else
    execute format(
      'create or replace function fn_reveal(p_sbota uuid) returns int language plpgsql security definer set search_path = public as %L',
      new_src
    );
    -- create or replace بيحافظ على الصلاحيات، بس نأكد تاني للاطمئنان
    revoke execute on function fn_reveal(uuid) from public, anon;
    grant  execute on function fn_reveal(uuid) to authenticated;
  end if;
end $$;

comment on function fn_reveal(uuid) is
  'بينشئ المجموعات والغرف وبيبعت رسالة الكشف. مرة واحدة لكل سبوطة. النداء من المتصفح محتاج matching.approve، والزائر المجهول ممنوع خالص.';

-- ===== 3) نفس المراجعة على باقي دوال الكشف/المطابقة =====
-- أي دالة حساسة تانية اتعملت في الدفعة دي من غير revoke — نقفلها هنا كمان.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('fn_build_matching', 'fn_build_work_matching')
       and has_function_privilege('anon', p.oid, 'execute')
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    raise notice '0062: اتقفلت على anon — %', f.sig;
  end loop;
end $$;


-- ############################################################################
-- # 20260909161200_0063_caller_is_browser.sql
-- ############################################################################

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


-- ============================================================================
-- خلصنا. دلوقتي شغّل السطرين دول (كل واحد لوحده) وابعتلي النتيجة:
--
--   select * from test_review_fixes();
--   select * from test_caller_guards();
--
-- المفروض كل الصفوف تقول «نجح».
-- ============================================================================
