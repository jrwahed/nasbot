-- تفعيل RLS على كل جدول. الافتراضي: مفيش سياسة = مفيش وصول.
alter table profiles              enable row level security;
alter table interests             enable row level security;
alter table profile_interests     enable row level security;
alter table skill_levels          enable row level security;
alter table captains              enable row level security;
alter table captain_applications  enable row level security;
alter table weekly_schedule_subs  enable row level security;
alter table venues                enable row level security;
alter table sbota_templates       enable row level security;
alter table sbotat                enable row level security;
alter table sbota_groups          enable row level security;
alter table mystery_clues         enable row level security;
alter table bookings              enable row level security;
alter table waitlist              enable row level security;
alter table payments              enable row level security;
alter table refunds               enable row level security;
alter table wallet_ledger         enable row level security;
alter table coupons               enable row level security;
alter table referrals             enable row level security;
alter table matching_runs         enable row level security;
alter table matching_outcomes     enable row level security;
alter table pair_affinity         enable row level security;
alter table behavior_flags        enable row level security;
alter table chat_rooms            enable row level security;
alter table chat_members          enable row level security;
alter table messages              enable row level security;
alter table reports               enable row level security;
alter table reviews               enable row level security;
alter table sbota_photos          enable row level security;
alter table captain_reports       enable row level security;
alter table notification_templates enable row level security;
alter table notifications         enable row level security;
alter table otp_codes             enable row level security;
alter table audit_log             enable row level security;
alter table settings              enable row level security;
alter table events                enable row level security;
alter table marketing_spend       enable row level security;

-- ===== مساعدات الأدوار =====
create or replace function fn_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin');
$$;
comment on function fn_is_admin() is 'هل المستخدم الحالي إدارة؟';

create or replace function fn_my_captain_id()
returns uuid language sql stable security definer set search_path = public as $$
  select id from captains where profile_id = auth.uid();
$$;
comment on function fn_my_captain_id() is 'معرّف الكابتن بتاع المستخدم الحالي، أو null.';

-- هل أنا كابتن السبوطة دي وبعد الكشف؟
create or replace function fn_is_my_sbota_revealed(s_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from sbotat s
    where s.id = s_id
      and s.captain_id = fn_my_captain_id()
      and s.reveal_at is not null and now() >= s.reveal_at
  );
$$;
comment on function fn_is_my_sbota_revealed(uuid) is 'الكابتن بيشوف كشفه بعد reveal_at بس.';

-- ===== profiles =====
create policy profiles_self_read on profiles for select
  using (id = auth.uid() or fn_is_admin());
create policy profiles_self_update on profiles for update
  using (id = auth.uid()) with check (id = auth.uid());
create policy profiles_self_insert on profiles for insert
  with check (id = auth.uid());

-- الكابتن بيشوف ملفات مجموعته بعد الكشف · والمتبادلون بيشوفوا بعض
create policy profiles_captain_read on profiles for select
  using (
    exists (
      select 1 from bookings b
      where b.profile_id = profiles.id
        and b.status in ('paid','attended')
        and fn_is_my_sbota_revealed(b.sbota_id)
    )
  );
create policy profiles_mutual_read on profiles for select
  using (fn_is_mutual(profiles.id));

-- ===== قواميس عامة =====
create policy interests_read on interests for select using (true);
create policy templates_read on sbota_templates for select using (true);
create policy settings_read  on settings   for select using (true);
create policy settings_admin on settings   for all using (fn_is_admin()) with check (fn_is_admin());

-- ===== اهتمامات ومستويات =====
create policy pi_own on profile_interests for all
  using (profile_id = auth.uid() or fn_is_admin()) with check (profile_id = auth.uid());
create policy sl_own on skill_levels for all
  using (profile_id = auth.uid() or fn_is_admin()) with check (profile_id = auth.uid());

-- ===== الكباتن والأماكن =====
create policy captains_read on captains for select using (is_active or fn_is_admin());
create policy captains_admin on captains for all using (fn_is_admin()) with check (fn_is_admin());
create policy venues_read on venues for select using (fn_is_admin());
create policy venues_admin on venues for all using (fn_is_admin()) with check (fn_is_admin());
create policy capps_insert on captain_applications for insert with check (true);
create policy capps_admin on captain_applications for select using (fn_is_admin());
create policy wss_insert on weekly_schedule_subs for insert with check (true);
create policy wss_admin on weekly_schedule_subs for select using (fn_is_admin());

-- ===== السبوطات =====
create policy sbotat_read_public on sbotat for select
  using (status in ('open','full','locked','running') or fn_is_admin()
         or captain_id = fn_my_captain_id());
create policy sbotat_admin on sbotat for all using (fn_is_admin()) with check (fn_is_admin());

create policy groups_read on sbota_groups for select
  using (
    fn_is_admin()
    or captain_id = fn_my_captain_id()
    or exists (select 1 from bookings b
               where b.group_id = sbota_groups.id and b.profile_id = auth.uid())
  );
create policy groups_admin on sbota_groups for all using (fn_is_admin()) with check (fn_is_admin());

create policy clues_read on mystery_clues for select using (now() >= unlocks_at or fn_is_admin());
create policy clues_admin on mystery_clues for all using (fn_is_admin()) with check (fn_is_admin());

-- ===== الحجوزات =====
create policy bookings_own_read on bookings for select
  using (profile_id = auth.uid() or fn_is_admin() or fn_is_my_sbota_revealed(sbota_id));
create policy bookings_own_insert on bookings for insert
  with check (profile_id = auth.uid());
create policy bookings_admin on bookings for all using (fn_is_admin()) with check (fn_is_admin());

create policy waitlist_own on waitlist for all
  using (profile_id = auth.uid() or fn_is_admin()) with check (profile_id = auth.uid());

-- ===== الفلوس — قراءة بس، والكتابة من الخادم =====
create policy payments_own_read on payments for select
  using (fn_is_admin() or exists (
    select 1 from bookings b where b.id = payments.booking_id and b.profile_id = auth.uid()));
create policy refunds_own_read on refunds for select
  using (fn_is_admin() or exists (
    select 1 from payments p join bookings b on b.id = p.booking_id
    where p.id = refunds.payment_id and b.profile_id = auth.uid()));
create policy ledger_own_read on wallet_ledger for select
  using (profile_id = auth.uid() or fn_is_admin());
create policy coupons_read on coupons for select using (true);
create policy coupons_admin on coupons for all using (fn_is_admin()) with check (fn_is_admin());
create policy referrals_own_read on referrals for select
  using (referrer_id = auth.uid() or referred_id = auth.uid() or fn_is_admin());

-- ===== المطابقة =====
create policy matching_admin on matching_runs for all using (fn_is_admin()) with check (fn_is_admin());
create policy outcomes_admin on matching_outcomes for all using (fn_is_admin()) with check (fn_is_admin());
create policy flags_admin on behavior_flags for all using (fn_is_admin()) with check (fn_is_admin());

-- pair_affinity: الكتابة لصاحب التقييم بس، والقراءة لمحدش (fn_is_mutual هي المنفذ الوحيد)
create policy pair_insert_own on pair_affinity for insert
  with check (a_id = auth.uid() or b_id = auth.uid());
create policy pair_update_own on pair_affinity for update
  using (a_id = auth.uid() or b_id = auth.uid())
  with check (a_id = auth.uid() or b_id = auth.uid());
create policy pair_admin_read on pair_affinity for select using (fn_is_admin());

-- ===== الشات =====
create policy rooms_member_read on chat_rooms for select
  using (fn_is_admin() or exists (
    select 1 from chat_members m
    where m.room_id = chat_rooms.id and m.profile_id = auth.uid() and m.removed_at is null));

create policy members_read on chat_members for select
  using (fn_is_admin() or exists (
    select 1 from chat_members m2
    where m2.room_id = chat_members.room_id and m2.profile_id = auth.uid() and m2.removed_at is null));
create policy members_admin on chat_members for all using (fn_is_admin()) with check (fn_is_admin());

-- الرسائل: عضو غير محذوف + الغرفة مفتوحة بالوقت
create policy messages_read on messages for select
  using (
    fn_is_admin() or exists (
      select 1 from chat_members m join chat_rooms r on r.id = m.room_id
      where m.room_id = messages.room_id
        and m.profile_id = auth.uid() and m.removed_at is null
        and (r.opens_at is null or now() >= r.opens_at)
    )
  );
create policy messages_write on messages for insert
  with check (
    sender_id = auth.uid() and exists (
      select 1 from chat_members m join chat_rooms r on r.id = m.room_id
      where m.room_id = messages.room_id
        and m.profile_id = auth.uid() and m.removed_at is null
        and r.is_closed = false
        and (r.opens_at  is null or now() >= r.opens_at)
        and (r.closes_at is null or now() <  r.closes_at)
    )
  );

create policy reports_own on reports for insert with check (reporter_id = auth.uid());
create policy reports_read on reports for select using (reporter_id = auth.uid() or fn_is_admin());
create policy reports_admin on reports for all using (fn_is_admin()) with check (fn_is_admin());

-- ===== التقييم والصور =====
create policy reviews_own on reviews for select using (profile_id = auth.uid() or fn_is_admin());
create policy reviews_insert on reviews for insert with check (profile_id = auth.uid());

create policy photos_read on sbota_photos for select
  using (
    fn_is_admin()
    or uploaded_by = auth.uid()
    or (published_to_members_at is not null and exists (
         select 1 from bookings b
         where b.sbota_id = sbota_photos.sbota_id and b.profile_id = auth.uid()
           and b.status in ('paid','attended')))
  );
create policy photos_captain_write on sbota_photos for insert
  with check (exists (select 1 from sbotat s where s.id = sbota_id and s.captain_id = fn_my_captain_id()));
create policy photos_admin on sbota_photos for all using (fn_is_admin()) with check (fn_is_admin());

create policy creports_captain on captain_reports for all
  using (captain_id = fn_my_captain_id() or fn_is_admin())
  with check (captain_id = fn_my_captain_id());

-- ===== التشغيل =====
create policy ntemplates_read on notification_templates for select using (fn_is_admin());
create policy notifications_own on notifications for select using (profile_id = auth.uid() or fn_is_admin());
create policy notifications_read_update on notifications for update
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy audit_admin on audit_log for select using (fn_is_admin());
create policy events_insert on events for insert with check (true);
create policy events_admin on events for select using (fn_is_admin());
create policy spend_admin on marketing_spend for all using (fn_is_admin()) with check (fn_is_admin());
-- otp_codes: مفيش أي سياسة — الوصول من الخادم بمفتاح الخدمة بس;
