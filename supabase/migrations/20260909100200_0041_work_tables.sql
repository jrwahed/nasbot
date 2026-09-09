-- طبقة «الشغل» — 2: الجداول الجديدة (WORK_PLAN §1.3) + العرضين العامّين + العرض المادي.

-- ===== professions — قاموس المجالات =====
create table if not exists professions (
  id         uuid primary key default gen_random_uuid(),
  key        text not null unique,
  name_ar    text not null,
  icon_key   text,
  color      text,
  sort_order int  not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table professions is 'قاموس المجالات (تصميم · برمجة · …) — يتعدّل من اللوحة. icon_key من مكتبة الأيقونات في الكود.';

drop trigger if exists t_professions_updated on professions;
create trigger t_professions_updated before update on professions
  for each row execute function set_updated_at();

-- المفاتيح الخارجية اللي اتأجّلت من 0040
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'profiles_profession_fk') then
    alter table profiles add constraint profiles_profession_fk
      foreign key (profession_id) references professions(id) on delete set null;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'profiles_secondary_profession_fk') then
    alter table profiles add constraint profiles_secondary_profession_fk
      foreign key (secondary_profession_id) references professions(id) on delete set null;
  end if;
end $$;

create index if not exists profiles_profession_idx on profiles (profession_id) where profession_id is not null;

-- ===== work_venues — مواصفات مكان الشغل (واحد-لواحد مع venues) =====
create table if not exists work_venues (
  id                   uuid primary key default gen_random_uuid(),
  venue_id             uuid not null unique references venues(id) on delete cascade,
  desks_count          int,
  wifi_mbps            int,
  wifi_note_ar         text,
  power_outlets        outlets_t,
  noise_level          noise_t,
  has_meeting_room     boolean not null default false,
  has_parking          boolean not null default false,
  has_ac               boolean not null default true,
  min_consumption      int,
  open_from            time,
  open_to              time,
  best_days            text[] not null default '{}',
  photos               text[] not null default '{}',
  wholesale_seat_price int,
  notes_ar             text,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);
comment on table work_venues is 'مواصفات أماكن الشغل (كافيه/مساحة مشتركة). سعر الجملة للكرسي هنا مش في venues.wholesale_price. العرض العام work_venues_public من غير السعر والملاحظات.';
comment on column work_venues.min_consumption      is 'الحد الأدنى للطلب في الكافيه — بالقروش.';
comment on column work_venues.wholesale_seat_price is 'اللي بندفعه للمكان عن الكرسي الواحد — بالقروش. مش بيظهر للأعضاء.';
comment on column work_venues.best_days            is 'أكواد الأيام (sat…fri) اللي المكان أهدى فيها.';

drop trigger if exists t_work_venues_updated on work_venues;
create trigger t_work_venues_updated before update on work_venues
  for each row execute function set_updated_at();

-- ===== work_passes — كارت 4 / 8 أيام =====
create table if not exists work_passes (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references profiles(id) on delete cascade,
  kind            pass_kind_t not null,
  sessions_total  int not null check (sessions_total > 0),
  sessions_used   int not null default 0 check (sessions_used >= 0),
  price_paid      int not null default 0,
  payment_id      uuid references payments(id) on delete set null,
  starts_at       timestamptz,
  expires_at      timestamptz,
  status          pass_status_t not null default 'pending',
  refunded_amount int not null default 0,
  note            text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint work_passes_sessions_ck check (sessions_used <= sessions_total)
);
comment on table work_passes is 'كروت الشغل. pending لحد ما الإدارة تعتمد التحويل (fn_activate_pass) — وقتها بيتحدد starts_at/expires_at. الخصم والرجوع عبر fn_redeem_pass/fn_revert_pass بس.';
comment on column work_passes.price_paid is 'بالقروش.';
comment on column work_passes.note       is 'سبب الكارت لو اتضاف يدوي من اللوحة (تعويض مثلًا).';

create index if not exists work_passes_profile_idx on work_passes (profile_id, status);

drop trigger if exists t_work_passes_updated on work_passes;
create trigger t_work_passes_updated before update on work_passes
  for each row execute function set_updated_at();

-- المفتاح الخارجي اللي اتأجّل من 0040: payments.pass_id → work_passes
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'payments_pass_fk') then
    alter table payments add constraint payments_pass_fk
      foreign key (pass_id) references work_passes(id) on delete set null;
  end if;
end $$;
create index if not exists payments_pass_idx on payments (pass_id) where pass_id is not null;

-- ===== pass_redemptions — سجل كل خصم ورجوع =====
create table if not exists pass_redemptions (
  id          uuid primary key default gen_random_uuid(),
  pass_id     uuid not null references work_passes(id) on delete cascade,
  booking_id  uuid not null unique references bookings(id) on delete cascade,
  redeemed_at timestamptz not null default now(),
  reverted_at timestamptz
);
comment on table pass_redemptions is 'كل جلسة اتخصمت من كارت ولأي حجز. reverted_at = اترجّعت بسبب إلغاء مبكر.';
create index if not exists pass_redemptions_pass_idx on pass_redemptions (pass_id);

-- ===== recurring_bookings — «يومك الثابت» =====
create table if not exists recurring_bookings (
  id                 uuid primary key default gen_random_uuid(),
  profile_id         uuid not null references profiles(id) on delete cascade,
  template_id        uuid not null references sbota_templates(id) on delete restrict,
  venue_id           uuid references venues(id) on delete set null,
  weekday            int  not null check (weekday between 0 and 6),
  time_of_day        time,
  active_from        date not null default current_date,
  active_until       date,
  auto_book          boolean not null default true,
  pause_until        date,
  status             recurring_status_t not null default 'active',
  last_generated_for date,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);
comment on table recurring_bookings is 'اليوم الثابت. weekday بنمط بوستجرس (0=الحد … 6=السبت). job_work_recurring بتولّد الحجز قبلها بـ settings.work_recurring_lead_days.';
comment on column recurring_bookings.last_generated_for is 'آخر تاريخ اتعمل له حجز/إشعار — علشان ما نكرّرش.';

-- صف واحد شغّال لكل (عضو، يوم) — الملغي ما بيتحسبش
create unique index if not exists recurring_one_per_weekday
  on recurring_bookings (profile_id, weekday) where status <> 'cancelled';
create index if not exists recurring_status_idx on recurring_bookings (status) where status = 'active';

drop trigger if exists t_recurring_updated on recurring_bookings;
create trigger t_recurring_updated before update on recurring_bookings
  for each row execute function set_updated_at();

-- ===== work_affinity — «عايز تشتغل مع مين؟» (نسخة طبق الأصل من pair_affinity) =====
create table if not exists work_affinity (
  id                uuid primary key default gen_random_uuid(),
  a_id              uuid not null references profiles(id) on delete cascade,
  b_id              uuid not null references profiles(id) on delete cascade,
  a_wants_b         boolean not null default false,
  b_wants_a         boolean not null default false,
  met_in_booking_id uuid references bookings(id) on delete set null,
  mutual_at         timestamptz,
  weight            int not null default 1,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint work_affinity_ordered check (a_id < b_id),
  unique (a_id, b_id)
);
comment on table work_affinity is 'رسم «عايز تشتغل مع مين». منفصل تمامًا عن pair_affinity. محدش بيقرأه — الوصول عبر fn_work_collab_state بس.';
comment on column work_affinity.mutual_at is 'بيتملى بمحفّز fn_mutual_work_affinity لما الاتنين يختاروا بعض.';

drop trigger if exists t_work_affinity_updated on work_affinity;
create trigger t_work_affinity_updated before update on work_affinity
  for each row execute function set_updated_at();

-- ===== venue_reports — حساب الأسبوع لكل مكان =====
create table if not exists venue_reports (
  id              uuid primary key default gen_random_uuid(),
  venue_id        uuid not null references venues(id) on delete cascade,
  week_start      date not null,
  sessions_count  int not null default 0,
  attendees_count int not null default 0,
  no_shows        int not null default 0,
  avg_rating      numeric(3,2),
  amount_due      int not null default 0,
  paid_at         timestamptz,
  paid_by         uuid references profiles(id),
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  unique (venue_id, week_start)
);
comment on table venue_reports is 'تقرير أسبوعي لكل مكان شغل — بيتبني من fn_venue_report كل اتنين. amount_due = الحضور × wholesale_seat_price بالقروش. الصف المدفوع (paid_at) ما بيتلمسش.';

drop trigger if exists t_venue_reports_updated on venue_reports;
create trigger t_venue_reports_updated before update on venue_reports
  for each row execute function set_updated_at();

-- ===== leads — نموذج الشركات =====
create table if not exists leads (
  id              uuid primary key default gen_random_uuid(),
  company         text not null,
  contact_name    text not null,
  phone           text not null,
  people_count    int,
  times_per_month int,
  note            text,
  status          lead_status_t not null default 'new',
  handled_by      uuid references profiles(id),
  admin_note      text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table leads is 'طلبات الشركات من صفحة /shoghl. الإدراج عبر fn_submit_lead بس (حد 3 في اليوم لكل رقم) — والقراءة للإدارة.';
create index if not exists leads_phone_day_idx on leads (phone, created_at desc);

drop trigger if exists t_leads_updated on leads;
create trigger t_leads_updated before update on leads
  for each row execute function set_updated_at();

-- ===== العرض العام لأماكن الشغل =====
-- الجدول نفسه للإدارة بس (RLS في 0043). الأعضاء والزوار بيقروا من العرض ده،
-- وهو بيقرا عبر دالة security definer بتطلّع الأعمدة الآمنة بس —
-- من غير wholesale_seat_price ولا notes_ar ولا أي عمود تعاقدي من venues.
-- العنوان والإحداثيات بيظهروا بس لو فيه سبوطة شغل معلنة في المكان ومش مخفية العنوان.
create or replace function fn_work_venues_public()
returns table (
  venue_id         uuid,
  name             text,
  kind             text,
  area             area_t,
  area_label_ar    text,
  address          text,
  map_lat          numeric,
  map_lng          numeric,
  rating_avg       numeric,
  is_active        boolean,
  desks_count      int,
  wifi_mbps        int,
  wifi_note_ar     text,
  power_outlets    outlets_t,
  noise_level      noise_t,
  has_meeting_room boolean,
  has_parking      boolean,
  has_ac           boolean,
  min_consumption  int,
  open_from        time,
  open_to          time,
  best_days        text[],
  photos           text[],
  has_open_sbota   boolean,
  next_sbota_at    timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    wv.venue_id,
    v.name,
    v.kind::text,
    v.area,
    v.area_label_ar,
    case when x.show_address then v.address else null end,
    case when x.show_address then v.map_lat else null end,
    case when x.show_address then v.map_lng else null end,
    v.rating_avg,
    v.is_active,
    wv.desks_count, wv.wifi_mbps, wv.wifi_note_ar, wv.power_outlets, wv.noise_level,
    wv.has_meeting_room, wv.has_parking, wv.has_ac, wv.min_consumption,
    wv.open_from, wv.open_to, wv.best_days, wv.photos,
    x.has_open,
    x.next_at
  from work_venues wv
  join venues v on v.id = wv.venue_id
  cross join lateral (
    select
      exists (select 1 from sbotat s
              where s.venue_id = v.id and s.is_work
                and s.status in ('open','full') and s.starts_at > now()) as has_open,
      exists (select 1 from sbotat s
              where s.venue_id = v.id and s.is_work
                and s.status in ('open','full') and s.starts_at > now()
                and not s.address_hidden) as show_address,
      (select min(s.starts_at) from sbotat s
       where s.venue_id = v.id and s.is_work
         and s.status in ('open','full') and s.starts_at > now()) as next_at
  ) x
  where v.kind::text in ('cafe_work', 'coworking')
    and (v.is_active or fn_is_admin());
$$;
comment on function fn_work_venues_public() is 'أماكن الشغل للعرض العام — من غير سعر الجملة ولا الملاحظات. العنوان بيظهر بس لو فيه سبوطة شغل معلنة مش مخفية العنوان.';
revoke execute on function fn_work_venues_public() from public;
grant  execute on function fn_work_venues_public() to anon, authenticated, service_role;

drop view if exists work_venues_public;
create view work_venues_public
with (security_invoker = true)
as select * from fn_work_venues_public();
comment on view work_venues_public is 'أماكن الشغل للأعضاء والزوار. security_invoker فوق دالة بتحدد الأعمدة — مفيش wholesale_seat_price ولا notes_ar هنا خالص.';
grant select on work_venues_public to anon, authenticated;

-- ===== أعضاء مجموعة سبوطة الشغل — المجال والأسلوب بعد الكشف بس =====
-- نفس فكرة fn_group_members في 0015: مفيش سياسة على profiles تفتح الصف كله
-- لزمايل المجموعة (ده كان هيكشف التليفون والإيميل). الدالة بتطلّع الأعمدة
-- الأربعة دول بس، ولو الكشف ما جاش بترجّع فاضي حتى لنفس المجموعة.
create or replace function fn_work_group_members()
returns table (
  sbota_id         uuid,
  group_id         uuid,
  profile_id       uuid,
  first_name       text,
  profession_key   text,
  profession_ar    text,
  profession_icon  text,
  profession_color text,
  work_style       work_style_t,
  years_experience experience_t
)
language sql
stable
security definer
set search_path = public
as $$
  select
    b.sbota_id,
    b.group_id,
    p.id,
    p.first_name,
    pr.key,
    pr.name_ar,
    pr.icon_key,
    pr.color,
    p.work_style,
    p.years_experience
  from bookings me
  join sbotat s on s.id = me.sbota_id
  join bookings b on b.sbota_id = me.sbota_id
                 and (me.group_id is null or b.group_id = me.group_id)
  join profiles p on p.id = b.profile_id
  left join professions pr on pr.id = p.profession_id
  where me.profile_id = auth.uid()
    and me.status in ('paid', 'attended')
    and b.status in ('paid', 'attended')
    and b.profile_id <> auth.uid()
    and s.is_work
    and s.reveal_at is not null and now() >= s.reveal_at
    and p.deleted_at is null;
$$;
comment on function fn_work_group_members() is 'زمايلي في سبوطات الشغل بعد الكشف: الاسم الأول والمجال والأسلوب والخبرة بس. قبل الكشف فاضي.';
revoke execute on function fn_work_group_members() from public, anon;
grant  execute on function fn_work_group_members() to authenticated, service_role;

drop view if exists work_group_members;
create view work_group_members
with (security_invoker = true)
as select * from fn_work_group_members();
comment on view work_group_members is 'زمايل مجموعتي في سبوطات الشغل بعد الكشف — المجال والأسلوب والخبرة بس. security_invoker فوق fn_work_group_members.';
revoke select on work_group_members from anon;
grant  select on work_group_members to authenticated;

-- ===== work_metrics — العرض المادي الأسبوعي =====
-- المؤشر الأساسي: نسبة اللي أول حجز شغل ليهم اتبعه حجز ترفيهي مدفوع خلال 30 يوم.
create materialized view if not exists work_metrics as
with weeks as (
  select date_trunc('week', d)::date as week
  from generate_series(date_trunc('week', now() - interval '12 weeks'), now(), interval '1 week') d
),
wb as (
  select b.id, b.profile_id, b.status, b.created_at, b.paid_with_pass, s.starts_at
  from bookings b join sbotat s on s.id = b.sbota_id
  where s.is_work
),
first_work as (
  select profile_id, min(created_at) as first_at
  from wb where status in ('paid', 'attended', 'no_show')
  group by profile_id
),
conv as (
  select fw.profile_id, fw.first_at,
    exists (
      select 1 from bookings b2 join sbotat s2 on s2.id = b2.sbota_id
      where b2.profile_id = fw.profile_id
        and not s2.is_work
        and b2.status in ('paid', 'attended')
        and b2.created_at >  fw.first_at
        and b2.created_at <= fw.first_at + interval '30 days'
    ) as converted
  from first_work fw
)
select
  w.week,
  (select count(*) from sbotat s
     where s.is_work and s.status <> 'cancelled'
       and date_trunc('week', s.starts_at)::date = w.week)::int as work_sbotat,
  (select count(*) from wb
     where status in ('paid', 'attended', 'no_show')
       and date_trunc('week', starts_at)::date = w.week)::int as work_bookings,
  (select count(*) from wb
     where status = 'attended'
       and date_trunc('week', starts_at)::date = w.week)::int as attended,
  (select round(100.0 * count(*) filter (where status = 'no_show')
                / nullif(count(*) filter (where status in ('attended', 'no_show')), 0), 1)
     from wb where date_trunc('week', starts_at)::date = w.week) as no_show_pct,
  (select count(*) from wb
     where paid_with_pass and status in ('paid', 'attended', 'no_show')
       and date_trunc('week', starts_at)::date = w.week)::int as pass_bookings,
  (select count(*) from work_passes wp
     where wp.status in ('active', 'used_up', 'expired')
       and date_trunc('week', coalesce(wp.starts_at, wp.created_at))::date = w.week)::int as passes_sold,
  (select coalesce(sum(wp.price_paid), 0) from work_passes wp
     where wp.status in ('active', 'used_up', 'expired')
       and date_trunc('week', coalesce(wp.starts_at, wp.created_at))::date = w.week)::int as passes_revenue,
  (select count(*) from pass_redemptions pr
     where pr.reverted_at is null
       and date_trunc('week', pr.redeemed_at)::date = w.week)::int as sessions_redeemed,
  (select count(*) from conv c
     where date_trunc('week', c.first_at)::date = w.week)::int as work_first_timers,
  (select count(*) from conv c
     where date_trunc('week', c.first_at)::date = w.week and c.converted)::int as converted_30d,
  (select round(100.0 * count(*) filter (where c.converted) / nullif(count(*), 0), 1)
     from conv c where date_trunc('week', c.first_at)::date = w.week) as conversion_30d_pct,
  (select round(100.0 * count(*) filter (where wa.mutual_at is not null) / nullif(count(*), 0), 1)
     from work_affinity wa where date_trunc('week', wa.created_at)::date = w.week) as collab_mutual_pct
from weeks w
order by w.week desc;

-- refresh concurrently محتاج فهرس فريد
create unique index if not exists work_metrics_week_idx on work_metrics (week);
comment on materialized view work_metrics is 'مؤشرات الشغل الأسبوعية — بتتجدد يوميًا من job_work_metrics. القراءة عبر fn_work_metrics (settings.view).';
revoke all on work_metrics from anon, authenticated;
