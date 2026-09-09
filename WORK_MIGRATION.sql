-- ============================================================================
-- WORK_MIGRATION.sql — طبقة «الشغل» (WORK_PLAN.md المرحلة 1)
-- الزق في SQL Editor مرة واحدة — آمن يتكرر.
--
-- ده تجميع الهجرات 0039 → 0046 من supabase/migrations/ بالترتيب، من غير أي تغيير.
--
-- ⚠ ملاحظة واحدة: أول سطرين (0039) بيضيفوا قيمتين لـ venue_kind_t، وبوستجرس
-- ما بيسمحش باستخدام قيمة جديدة في نفس المعاملة اللي ضافتها. لو الـ SQL Editor
-- شغّل الملف كله كمعاملة واحدة وطلع خطأ:
--     unsafe use of new value "cafe_work" of enum type venue_kind_t
-- شغّل الجزء «0039» لوحده الأول (السطرين)، وبعدين الزق الملف كله تاني —
-- كل حاجة فيه if not exists / create or replace / on conflict فمفيش ضرر من التكرار.
--
-- بعدها: select * from test_work_rls();   ← لازم تطلع «ok» و12 صف كلهم «نجح».
-- ============================================================================


-- ############################################################################

-- ############################################################################
-- # 20260909100000_0039_work_venue_kinds.sql
-- ############################################################################

-- طبقة «الشغل» — الخطوة 0: قيمتين جداد في venue_kind_t.
--
-- الملف ده لوحده عن قصد: ALTER TYPE ... ADD VALUE ما ينفعش القيمة الجديدة
-- تتستخدم في نفس المعاملة اللي ضافتها (نفس اللي عملناه في 0032 مع vodafone_cash).
-- لو بتلزق WORK_MIGRATION.sql كله مرة واحدة وطلع خطأ «unsafe use of new value»
-- شغّل الملف ده لوحده الأول، وبعدين الباقي.
--
-- template_kind_t فيها 'work' من الأول — مش محتاجة إضافة.
alter type venue_kind_t add value if not exists 'cafe_work';
alter type venue_kind_t add value if not exists 'coworking';

-- ############################################################################
-- # 20260909100100_0040_work_enums_and_columns.sql
-- ############################################################################

-- طبقة «الشغل» — 1: الأنواع المعدودة الجديدة + أعمدة على الجداول الموجودة.
-- كل حاجة هنا null-able أو بقيمة افتراضية — ما بتكسرش أي صف قديم،
-- وكلها «if not exists» علشان الملف يتشغّل أكتر من مرة بأمان.

-- ===== الأنواع (WORK_PLAN §1.1) =====
-- create type مش بتقبل if not exists، فبنلفّها في do/exception.
do $$ begin
  create type work_status_t as enum ('freelancer', 'remote_employee', 'business_owner', 'student', 'employee', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type work_style_t as enum ('silent', 'chatty', 'depends');
exception when duplicate_object then null; end $$;

do $$ begin
  create type experience_t as enum ('under_1', 'one_to_three', 'three_to_five', 'five_plus');
exception when duplicate_object then null; end $$;

do $$ begin
  create type outlets_t as enum ('few', 'enough', 'plenty');
exception when duplicate_object then null; end $$;

do $$ begin
  create type noise_t as enum ('quiet', 'medium', 'lively');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pass_kind_t as enum ('four', 'eight');
exception when duplicate_object then null; end $$;

-- pending بسبب الدفع اليدوي (§0 #2). cancelled زيادة عن الخطة: التحويل اترفض
-- قبل ما الكارت يتفعّل — مفيش فلوس اتدفعت فمش «refunded» ومش «expired».
do $$ begin
  create type pass_status_t as enum ('pending', 'active', 'used_up', 'expired', 'refunded', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type recurring_status_t as enum ('active', 'paused', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type lead_status_t as enum ('new', 'contacted', 'converted', 'dropped');
exception when duplicate_object then null; end $$;

-- ===== profiles (§1.2) =====
-- المفاتيح الخارجية على professions بتتضاف في 0041 بعد ما الجدول يتعمل.
alter table profiles add column if not exists work_status             work_status_t;
alter table profiles add column if not exists profession_id           uuid;
alter table profiles add column if not exists secondary_profession_id uuid;
alter table profiles add column if not exists work_style              work_style_t;
alter table profiles add column if not exists open_to_collab          boolean not null default true;
alter table profiles add column if not exists years_experience        experience_t;
alter table profiles add column if not exists work_days_pref          text[] not null default '{}';
alter table profiles add column if not exists work_area_pref          area_t;
alter table profiles add column if not exists work_no_show_count      int not null default 0;

comment on column profiles.work_status       is 'بيشتغل إيه؟ — بيتسأل اختياريًا في الانضمام واللعبة.';
comment on column profiles.profession_id     is 'المجال الأساسي → professions. بيظهر لمجموعة سبوطة الشغل بعد الكشف بس.';
comment on column profiles.work_style        is 'أسلوب الشغل: صامت / بيتكلم / حسب — بيدخل في مطابقة work_v1.';
comment on column profiles.work_days_pref    is 'أيام الشغل المفضلة — نفس أكواد free_slots (sat…fri).';
comment on column profiles.work_no_show_count is 'غياب سبوطات الشغل بس — منفصل عن no_show_count العام (§3 قاعدة 6).';

-- ===== sbota_templates =====
alter table sbota_templates add column if not exists is_work     boolean not null default false;
alter table sbota_templates add column if not exists work_config jsonb;

comment on column sbota_templates.is_work     is 'قالب سبوطة شغل — بيتنسخ على sbotat.is_work عند الإدراج.';
comment on column sbota_templates.work_config is '{start,end,lunch_hour_at,complaint_hour_at,focus_blocks[],desk_type,profession_mix_max} — جدول اليوم في صفحة السبوطة.';

-- ===== sbotat =====
alter table sbotat add column if not exists is_work boolean not null default false;
comment on column sbotat.is_work is 'منسوخة من القالب بمحفّز t_sbotat_is_work — علشان الفلاتر والمطابقة ما تحتاجش join.';

create or replace function fn_sbota_is_work()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select coalesce(t.is_work, false) into new.is_work
  from sbota_templates t where t.id = new.template_id;
  return new;
end;
$$;
comment on function fn_sbota_is_work() is 'بينسخ is_work من القالب عند إدراج السبوطة أو تغيير قالبها.';
revoke execute on function fn_sbota_is_work() from public, anon, authenticated;

drop trigger if exists t_sbotat_is_work on sbotat;
create trigger t_sbotat_is_work before insert or update of template_id on sbotat
  for each row execute function fn_sbota_is_work();

create index if not exists sbotat_is_work_idx on sbotat (is_work) where is_work;

-- ===== payments =====
-- تحويل لكارت مش لحجز: booking_id بيبقى null و pass_id متملي.
-- المفتاح الخارجي على work_passes بيتضاف في 0041.
alter table payments add column if not exists pass_id uuid;
alter table payments alter column booking_id drop not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'payments_target_ck') then
    alter table payments add constraint payments_target_ck
      check (booking_id is not null or pass_id is not null);
  end if;
end $$;

comment on column payments.pass_id is 'لو التحويل لشراء كارت شغل مش لحجز. واحد من الاتنين لازم يبقى متملي.';

-- ===== bookings =====
alter table bookings add column if not exists paid_with_pass boolean not null default false;
comment on column bookings.paid_with_pass is 'اتدفع بجلسة من كارت الشغل — الإلغاء بيرجّع جلسة مش فلوس (fn_revert_pass).';

-- ===== settings (§1.2) — بالقروش زي باقي الأسعار =====
alter table settings add column if not exists work_pass4_price           int  not null default 40000;
alter table settings add column if not exists work_pass4_weeks           int  not null default 6;
alter table settings add column if not exists work_pass8_price           int  not null default 72000;
alter table settings add column if not exists work_pass8_weeks           int  not null default 10;
alter table settings add column if not exists work_single_price          int  not null default 12000;
alter table settings add column if not exists work_first_time_price      int  not null default 6000;
alter table settings add column if not exists work_profession_mix_max    int  not null default 2;
alter table settings add column if not exists work_lunch_at              time not null default '13:00';
alter table settings add column if not exists work_complaint_at          time not null default '14:30';
alter table settings add column if not exists work_recurring_lead_days   int  not null default 7;
alter table settings add column if not exists work_pass_refund_days      int  not null default 3;
alter table settings add column if not exists work_conversion_target_pct int  not null default 25;

comment on column settings.work_pass4_price        is 'كارت 4 أيام — بالقروش (40000 = 400 جنيه).';
comment on column settings.work_pass4_weeks        is 'صلاحية كارت الـ4 بالأسابيع من يوم الاعتماد.';
comment on column settings.work_pass8_price        is 'كارت 8 أيام — بالقروش.';
comment on column settings.work_pass8_weeks        is 'صلاحية كارت الـ8 بالأسابيع.';
comment on column settings.work_single_price       is 'سعر الجلسة المفردة «أنا جاي» — بالقروش.';
comment on column settings.work_first_time_price   is 'سعر أول مرة — بالقروش.';
comment on column settings.work_profession_mix_max is 'أقصى عدد من نفس المجال في المجموعة الواحدة (مطابقة work_v1).';
comment on column settings.work_recurring_lead_days is 'اليوم الثابت بيتولّد قبلها بكام يوم.';
comment on column settings.work_pass_refund_days   is 'الإلغاء قبلها بكام يوم بيرجّع الجلسة للكارت.';
comment on column settings.work_conversion_target_pct is 'المستهدف لمؤشر التحوّل شغل→ترفيه خلال 30 يوم.';

-- ===== العرض العام: نضيف is_work و work_config في الآخر =====
-- create or replace بيسمح بإضافة أعمدة في الآخر بس — نفس الترتيب القديم بالحرف.
create or replace view sbotat_public
with (security_invoker = true)
as
select
  s.id, s.template_id, s.venue_id, s.captain_id,
  s.starts_at, s.ends_at, s.price, s.org_fee, s.capacity,
  s.status, s.girls_only, s.is_day, s.is_mystery,
  s.booking_closes_at, s.reveal_at,
  s.area, s.area_label_ar,
  t.slug, t.name_ar, t.story_ar, t.kind, t.mood_ar,
  t.meta_prefix_ar, t.level_ar,
  t.includes_ar, t.excludes_ar, t.duration_min, t.hero_photos, t.overnight,
  s.is_work,
  t.work_config
from sbotat s
join sbota_templates t on t.id = s.template_id
where s.status in ('open', 'full', 'locked', 'running');

grant select on sbotat_public to anon, authenticated;

-- ############################################################################
-- # 20260909100200_0041_work_tables.sql
-- ############################################################################

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

-- ############################################################################
-- # 20260909100300_0042_work_functions.sql
-- ############################################################################

-- طبقة «الشغل» — 3: الدوال والمحفّزات (WORK_PLAN §1.4).
-- كل دالة security definer عليها search_path ثابت، والتنفيذ مسحوب من public
-- وممنوح بالاسم (نفس نمط 0011 / 0028).

-- ===== رصيد الكارت =====
create or replace function fn_pass_balance(p_profile uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(wp.sessions_total - wp.sessions_used), 0)::int
  from work_passes wp
  where wp.profile_id = p_profile
    and wp.status = 'active'
    and (wp.expires_at is null or wp.expires_at > now());
$$;
comment on function fn_pass_balance(uuid) is 'الجلسات الباقية في كل كروت العضو النشطة وغير المنتهية.';
revoke execute on function fn_pass_balance(uuid) from public, anon, authenticated;
grant  execute on function fn_pass_balance(uuid) to service_role;

create or replace function fn_my_pass_balance()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select fn_pass_balance(auth.uid());
$$;
comment on function fn_my_pass_balance() is 'نسخة العميل — رصيد كارتي أنا.';
revoke execute on function fn_my_pass_balance() from public, anon;
grant  execute on function fn_my_pass_balance() to authenticated, service_role;

-- ===== حارس أعمدة الكارت =====
-- RLS ما بتفرّقش بين الأعمدة. sessions_used/sessions_total بيتغيروا من
-- fn_redeem_pass/fn_revert_pass بس (بتشتغل بصلاحية المالك فـ current_user مش authenticated)،
-- والحالة والتواريخ من الاعتماد (fn_activate_pass) أو من صاحب payments.review.
create or replace function fn_guard_pass_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.sessions_used  is distinct from old.sessions_used
    or new.sessions_total is distinct from old.sessions_total then
      raise exception 'الخصم والرجوع عبر fn_redeem_pass / fn_revert_pass بس';
    end if;
    if (new.status     is distinct from old.status
     or new.starts_at  is distinct from old.starts_at
     or new.expires_at is distinct from old.expires_at
     or new.price_paid is distinct from old.price_paid
     or new.profile_id is distinct from old.profile_id)
    and not fn_has_permission('payments.review') then
      raise exception 'تفعيل الكارت وتعديله محتاج صلاحية payments.review';
    end if;
  end if;
  return new;
end;
$$;
comment on function fn_guard_pass_columns() is 'بيمنع تعديل رصيد الكارت مباشرة من المتصفح — الدوال بس.';
revoke execute on function fn_guard_pass_columns() from public, anon, authenticated;

drop trigger if exists t_guard_pass_columns on work_passes;
create trigger t_guard_pass_columns before update on work_passes
  for each row execute function fn_guard_pass_columns();

-- ===== fn_redeem_pass — خصم جلسة من أقدم كارت نشط =====
create or replace function fn_redeem_pass(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b        bookings;
  s        sbotat;
  wp       work_passes;
  existing pass_redemptions;
  new_used int;
begin
  select * into b from bookings where id = p_booking_id for update;
  if not found then raise exception 'الحجز مش موجود'; end if;

  if auth.uid() is not null and b.profile_id <> auth.uid() and not fn_is_admin() then
    raise exception 'مش حجزك';
  end if;
  if b.status not in ('pending_payment', 'paid') then
    raise exception 'الحجز ده متلغي أو خلص';
  end if;

  select * into s from sbotat where id = b.sbota_id;
  if not s.is_work then raise exception 'الكارت لسبوطات الشغل بس'; end if;

  -- اتخصم قبل كده؟ نرجّع نفس النتيجة من غير خصم تاني
  select * into existing from pass_redemptions
  where booking_id = b.id and reverted_at is null;
  if found then
    return jsonb_build_object('ok', true, 'already', true,
                              'pass_id', existing.pass_id,
                              'remaining', fn_pass_balance(b.profile_id));
  end if;

  -- أقدم كارت نشط فيه رصيد
  select * into wp from work_passes
  where profile_id = b.profile_id
    and status = 'active'
    and sessions_used < sessions_total
    and (expires_at is null or expires_at > now())
  order by starts_at asc nulls last, created_at asc
  limit 1
  for update;
  if not found then raise exception 'مفيش رصيد في كارتك'; end if;

  new_used := wp.sessions_used + 1;
  update work_passes
  set sessions_used = new_used,
      status = case when new_used >= sessions_total then 'used_up'::pass_status_t else status end
  where id = wp.id;

  insert into pass_redemptions (pass_id, booking_id)
  values (wp.id, b.id)
  on conflict (booking_id) do update
    set pass_id = excluded.pass_id, redeemed_at = now(), reverted_at = null;

  -- الحجز بقى مدفوع بالكارت — لو كان مستني تحويل بيبقى paid فورًا (بيشغّل fn_booking_paid)
  update bookings
  set paid_with_pass = true,
      status = case when status = 'pending_payment' then 'paid'::booking_status_t else status end,
      expires_at = null
  where id = b.id;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'redeem_pass', 'work_passes', wp.id,
          jsonb_build_object('booking_id', b.id, 'sessions_used', new_used, 'sessions_total', wp.sessions_total));

  return jsonb_build_object('ok', true, 'pass_id', wp.id,
                            'remaining', wp.sessions_total - new_used);
end;
$$;
comment on function fn_redeem_pass(uuid) is 'بتخصم جلسة من أقدم كارت نشط لصاحب الحجز، بتسجّل في pass_redemptions، وبتعلّم الحجز paid_with_pass (وتخليه paid لو كان مستني دفع).';
revoke execute on function fn_redeem_pass(uuid) from public, anon;
grant  execute on function fn_redeem_pass(uuid) to authenticated, service_role;

-- ===== fn_revert_pass — رجوع الجلسة عند الإلغاء المبكر =====
-- p_force = true لما إحنا اللي لغينا: الجلسة بترجع مهما كان الوقت.
create or replace function fn_revert_pass(p_booking_id uuid, p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  red        pass_redemptions;
  b          bookings;
  s          sbotat;
  days       int;
  hours_left numeric;
begin
  select * into red from pass_redemptions
  where booking_id = p_booking_id and reverted_at is null
  for update;
  if not found then
    return jsonb_build_object('ok', true, 'reverted', false, 'reason', 'no_redemption');
  end if;

  select * into b from bookings where id = p_booking_id;
  if auth.uid() is not null and b.profile_id <> auth.uid() and not fn_is_admin() then
    raise exception 'مش حجزك';
  end if;

  select * into s from sbotat where id = b.sbota_id;
  select work_pass_refund_days into days from settings where id;
  hours_left := extract(epoch from (s.starts_at - now())) / 3600.0;

  if not coalesce(p_force, false) and hours_left < days * 24 then
    return jsonb_build_object('ok', true, 'reverted', false, 'reason', 'late',
                              'pass_id', red.pass_id);
  end if;

  update pass_redemptions set reverted_at = now() where id = red.id;

  update work_passes
  set sessions_used = greatest(sessions_used - 1, 0),
      status = case
                 when status = 'used_up' and (expires_at is null or expires_at > now())
                 then 'active'::pass_status_t
                 else status
               end
  where id = red.pass_id;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'revert_pass', 'work_passes', red.pass_id,
          jsonb_build_object('booking_id', p_booking_id, 'forced', coalesce(p_force, false)));

  return jsonb_build_object('ok', true, 'reverted', true, 'pass_id', red.pass_id);
end;
$$;
comment on function fn_revert_pass(uuid, boolean) is 'لو الإلغاء قبل work_pass_refund_days (أو p_force) بترجّع الجلسة للكارت وترجّعه active لو كان used_up. غير كده مفيش رجوع.';
revoke execute on function fn_revert_pass(uuid, boolean) from public, anon, authenticated;
grant  execute on function fn_revert_pass(uuid, boolean) to service_role;

-- ===== fn_activate_pass — عند اعتماد التحويل =====
create or replace function fn_activate_pass(p_payment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  wp    work_passes;
  weeks int;
begin
  if auth.uid() is not null and not fn_is_admin() then
    raise exception 'ده للإدارة بس';
  end if;

  select * into wp from work_passes
  where payment_id = p_payment_id
     or id = (select pass_id from payments where id = p_payment_id)
  limit 1
  for update;
  if not found then raise exception 'مفيش كارت مربوط بالدفعة دي'; end if;
  if wp.status <> 'pending' then
    return jsonb_build_object('ok', true, 'already', true, 'pass_id', wp.id, 'status', wp.status);
  end if;

  select case wp.kind when 'four' then work_pass4_weeks else work_pass8_weeks end
  into weeks from settings where id;

  update work_passes
  set status = 'active',
      starts_at = now(),
      expires_at = now() + make_interval(weeks => coalesce(weeks, 6)),
      payment_id = coalesce(payment_id, p_payment_id)
  where id = wp.id;

  insert into notifications (profile_id, channel, template_key, payload)
  values (wp.profile_id, 'whatsapp', 'work_pass_activated',
          jsonb_build_object('pass_id', wp.id, 'n', wp.sessions_total));

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'activate_pass', 'work_passes', wp.id,
          jsonb_build_object('payment_id', p_payment_id, 'weeks', weeks));

  return jsonb_build_object('ok', true, 'pass_id', wp.id,
                            'expires_at', now() + make_interval(weeks => coalesce(weeks, 6)));
end;
$$;
comment on function fn_activate_pass(uuid) is 'الكارت يبقى active من دلوقتي لحد now()+الأسابيع من settings — بتتنادى من fn_approve_transfer أو من اللوحة.';
revoke execute on function fn_activate_pass(uuid) from public, anon;
grant  execute on function fn_activate_pass(uuid) to authenticated, service_role;

-- ===== fn_group_professions — «مين حاجز» بالمجال =====
create or replace function fn_group_professions(p_sbota_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s     sbotat;
  n     int;
  profs jsonb;
begin
  select * into s from sbotat where id = p_sbota_id;
  if not found then
    return jsonb_build_object('revealed', false, 'count', 0, 'professions', '[]'::jsonb);
  end if;

  select count(*) into n from bookings b
  where b.sbota_id = p_sbota_id and b.status in ('paid', 'attended');

  -- قبل الكشف: العدد بس
  if s.reveal_at is null or now() < s.reveal_at then
    return jsonb_build_object('revealed', false, 'count', n);
  end if;

  select coalesce(jsonb_agg(
           jsonb_build_object('key', x.key, 'name_ar', x.name_ar,
                              'icon_key', x.icon_key, 'color', x.color, 'n', x.n)
           order by x.n desc, x.sort_order asc), '[]'::jsonb)
  into profs
  from (
    select pr.key, pr.name_ar, pr.icon_key, pr.color, pr.sort_order, count(*)::int as n
    from bookings b
    join profiles p on p.id = b.profile_id
    join professions pr on pr.id = p.profession_id
    where b.sbota_id = p_sbota_id and b.status in ('paid', 'attended')
    group by pr.id, pr.key, pr.name_ar, pr.icon_key, pr.color, pr.sort_order
  ) x;

  return jsonb_build_object('revealed', true, 'count', n, 'professions', profs);
end;
$$;
comment on function fn_group_professions(uuid) is 'المجالات الموجودة في السبوطة من غير أي اسم — بعد reveal_at بس. قبلها {revealed:false,count}.';
revoke execute on function fn_group_professions(uuid) from public;
grant  execute on function fn_group_professions(uuid) to anon, authenticated, service_role;

-- ===== fn_work_collab_state — في تبادل ولا لأ =====
create or replace function fn_work_collab_state(p_other uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when exists (
    select 1 from work_affinity wa
    where wa.mutual_at is not null
      and ((wa.a_id = auth.uid() and wa.b_id = p_other)
        or (wa.b_id = auth.uid() and wa.a_id = p_other))
  ) then 'mutual' else 'none' end;
$$;
comment on function fn_work_collab_state(uuid) is 'بترجّع mutual أو none بس — عمرها ما بتكشف اختيار الطرف التاني. ده الوصول الوحيد لـ work_affinity.';
revoke execute on function fn_work_collab_state(uuid) from public, anon;
grant  execute on function fn_work_collab_state(uuid) to authenticated, service_role;

-- ===== fn_work_want — «عايز أشتغل مع فلان» =====
-- الكتابة الآمنة الوحيدة في work_affinity: بتكتب جهة اللي بينادي بس، من غير ما
-- يقرا الصف (مفيش سياسة select للأعضاء عن قصد). لو الصف موجود بتعدّل جهته بس،
-- وبكده محفّز التبادل بيشتغل لما التاني يعمل نفس الحاجة.
-- (upsert/update مباشر من المتصفح ما بيوصلش للصف الموجود لأن RLS بتطبّق سياسة
--  القراءة على الصفوف اللي الـ UPDATE بيدوّر عليها.)
create or replace function fn_work_want(p_other uuid, p_booking_id uuid default null, p_want boolean default true)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me   uuid := auth.uid();
  v_a  uuid; v_b uuid;
  mutual boolean;
begin
  if me is null then raise exception 'لازم تسجل دخول'; end if;
  if p_other is null or p_other = me then raise exception 'اختار حد تاني'; end if;

  if me < p_other then v_a := me; v_b := p_other; else v_a := p_other; v_b := me; end if;

  insert into work_affinity (a_id, b_id, a_wants_b, b_wants_a, met_in_booking_id)
  values (v_a, v_b, (v_a = me and p_want), (v_b = me and p_want), p_booking_id)
  on conflict (a_id, b_id) do update
    set a_wants_b = case when v_a = me then p_want else work_affinity.a_wants_b end,
        b_wants_a = case when v_b = me then p_want else work_affinity.b_wants_a end,
        met_in_booking_id = coalesce(work_affinity.met_in_booking_id, excluded.met_in_booking_id);

  select mutual_at is not null into mutual from work_affinity where a_id = v_a and b_id = v_b;
  return case when mutual then 'mutual' else 'none' end;
end;
$$;
comment on function fn_work_want(uuid, uuid, boolean) is 'بيسجّل رغبتي أنا بس في الشغل مع حد — وبيرجّع mutual/none زي fn_work_collab_state. ما بيكشفش اختيار الطرف التاني.';
revoke execute on function fn_work_want(uuid, uuid, boolean) from public, anon;
grant  execute on function fn_work_want(uuid, uuid, boolean) to authenticated, service_role;

-- ===== fn_mutual_work_affinity — محفّز التبادل =====
create or replace function fn_mutual_work_affinity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.a_wants_b and new.b_wants_a and new.mutual_at is null then
    new.mutual_at := now();
    insert into notifications (profile_id, channel, template_key, payload) values
      (new.a_id, 'whatsapp', 'work_collab_match',
       jsonb_build_object('other_id', new.b_id, 'affinity_id', new.id)),
      (new.b_id, 'whatsapp', 'work_collab_match',
       jsonb_build_object('other_id', new.a_id, 'affinity_id', new.id));
  end if;
  return new;
end;
$$;
comment on function fn_mutual_work_affinity() is 'بيضبط mutual_at لما الطرفين يختاروا بعض وبيبعت work_collab_match للاتنين.';
revoke execute on function fn_mutual_work_affinity() from public, anon, authenticated;

drop trigger if exists t_mutual_work_affinity on work_affinity;
create trigger t_mutual_work_affinity before insert or update on work_affinity
  for each row execute function fn_mutual_work_affinity();

-- ===== fn_venue_report — حساب أسبوع لكل مكان شغل =====
create or replace function fn_venue_report(p_week_start date)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int := 0;
begin
  insert into venue_reports (venue_id, week_start, sessions_count, attendees_count, no_shows, avg_rating, amount_due)
  select
    v.id,
    p_week_start,
    count(distinct s.id)::int,
    count(b.id) filter (where b.status = 'attended')::int,
    count(b.id) filter (where b.status = 'no_show')::int,
    (select round(avg(r.score_venue)::numeric, 2)
       from reviews r join sbotat s2 on s2.id = r.sbota_id
      where s2.venue_id = v.id and s2.is_work and r.score_venue is not null
        and (s2.starts_at at time zone 'Africa/Cairo')::date >= p_week_start
        and (s2.starts_at at time zone 'Africa/Cairo')::date <  p_week_start + 7),
    (count(b.id) filter (where b.status = 'attended') * coalesce(wv.wholesale_seat_price, 0))::int
  from venues v
  join work_venues wv on wv.venue_id = v.id
  left join sbotat s on s.venue_id = v.id and s.is_work
                    and s.status not in ('draft', 'cancelled')
                    and (s.starts_at at time zone 'Africa/Cairo')::date >= p_week_start
                    and (s.starts_at at time zone 'Africa/Cairo')::date <  p_week_start + 7
  left join bookings b on b.sbota_id = s.id
  group by v.id, wv.wholesale_seat_price
  on conflict (venue_id, week_start) do update
    set sessions_count  = excluded.sessions_count,
        attendees_count = excluded.attendees_count,
        no_shows        = excluded.no_shows,
        avg_rating      = excluded.avg_rating,
        amount_due      = excluded.amount_due
    where venue_reports.paid_at is null;
  get diagnostics n = row_count;
  return n;
end;
$$;
comment on function fn_venue_report(date) is 'بتبني/تحدّث venue_reports لأسبوع (الاتنين→الحد بتوقيت القاهرة) لكل مكان شغل. الصفوف المدفوعة ما بتتلمسش.';
revoke execute on function fn_venue_report(date) from public, anon;
grant  execute on function fn_venue_report(date) to authenticated, service_role;

-- ===== fn_work_metrics — قراءة العرض المادي بالصلاحية (نفس fn_weekly_metrics) =====
create or replace function fn_work_metrics(p_weeks integer default 12)
returns table (
  week               date,
  work_sbotat        integer,
  work_bookings      integer,
  attended           integer,
  no_show_pct        numeric,
  pass_bookings      integer,
  passes_sold        integer,
  passes_revenue     integer,
  sessions_redeemed  integer,
  work_first_timers  integer,
  converted_30d      integer,
  conversion_30d_pct numeric,
  collab_mutual_pct  numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select m.week, m.work_sbotat, m.work_bookings, m.attended, m.no_show_pct,
         m.pass_bookings, m.passes_sold, m.passes_revenue, m.sessions_redeemed,
         m.work_first_timers, m.converted_30d, m.conversion_30d_pct, m.collab_mutual_pct
  from work_metrics m
  where fn_has_permission('settings.view')
  order by m.week desc
  limit greatest(1, least(coalesce(p_weeks, 12), 104));
$$;
comment on function fn_work_metrics(integer) is 'مؤشرات الشغل الأسبوعية لصاحب settings.view — وعلى رأسها conversion_30d_pct مقابل settings.work_conversion_target_pct.';
revoke execute on function fn_work_metrics(integer) from public, anon;
grant  execute on function fn_work_metrics(integer) to authenticated, service_role;

-- ===== fn_cancel_booking — امتداد: الحجز المدفوع بالكارت بيرجّع جلسة مش فلوس =====
-- نفس جسم 0019 بالحرف (بما فيه إصلاح الـ cast وإصلاح تصعيد p_by من 0010)
-- + فرع واحد: if b.paid_with_pass. سلوك الحجوزات العادية ما اتغيّرش.
create or replace function fn_cancel_booking(p_booking_id uuid, p_by text default 'user', p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b bookings; s sbotat; cfg settings;
  hours_left numeric; refund_amt int := 0;
  r_kind refund_kind_t := 'none'; r_type refund_type_t := 'gateway';
  pay payments; next_wait waitlist; is_first boolean; v_by text;
  pass_res jsonb := null;
begin
  if auth.uid() is null or fn_is_admin() then
    v_by := coalesce(p_by, 'user');
  else
    v_by := 'user';
  end if;

  select * into b from bookings where id = p_booking_id;
  if not found then raise exception 'الحجز مش موجود'; end if;

  if v_by = 'user' and auth.uid() is not null and b.profile_id <> auth.uid() then
    raise exception 'مش حجزك';
  end if;
  if b.status not in ('paid', 'pending_payment') then
    raise exception 'الحجز ده متلغي أو خلص';
  end if;

  select * into s from sbotat where id = b.sbota_id;
  select * into cfg from settings where id;
  hours_left := extract(epoch from (s.starts_at - now())) / 3600.0;

  select count(*) = 0 into is_first from bookings
  where profile_id = b.profile_id and status = 'attended';

  if b.paid_with_pass then
    -- مدفوع بجلسة من الكارت: مفيش فلوس بترجع — الجلسة هي اللي بترجع (أو لأ)
    pass_res := fn_revert_pass(b.id, v_by = 'us');
    refund_amt := 0;
    if coalesce((pass_res ->> 'reverted')::boolean, false) then
      r_kind := 'full';
    else
      r_kind := 'none';
      if v_by = 'user' then
        insert into behavior_flags (profile_id, kind, booking_id, note)
        values (b.profile_id, 'late_cancel', b.id, 'إلغاء متأخر لسبوطة شغل — الجلسة ما رجعتش');
      end if;
    end if;
  elsif v_by = 'us' then
    refund_amt := b.price_paid; r_kind := 'full';
    if refund_amt > 0 then
      insert into wallet_ledger (profile_id, delta, reason, ref_id, note)
      values (b.profile_id, (refund_amt * cfg.our_cancel_bonus_pct) / 100,
              'cancel_credit', b.id, 'رصيد اعتذار عن إلغاء من عندنا');
    end if;
  elsif hours_left >= cfg.refund_full_days * 24 then
    refund_amt := b.price_paid; r_kind := 'full';
  elsif cfg.refund_half_days > 0 and hours_left >= cfg.refund_half_days * 24 then
    refund_amt := b.price_paid / 2; r_kind := 'half';
  elsif hours_left >= 0 and is_first then
    refund_amt := b.price_paid; r_kind := 'credit'; r_type := 'wallet_credit';
  else
    refund_amt := 0; r_kind := 'none';
    insert into behavior_flags (profile_id, kind, booking_id, note)
    values (b.profile_id, 'late_cancel', b.id, 'إلغاء متأخر');
  end if;

  update bookings
  set status = (case when v_by = 'us' then 'cancelled_by_us' else 'cancelled_by_user' end)::booking_status_t,
      cancelled_at = now(), cancel_reason = p_reason, refund_kind = r_kind
  where id = b.id;

  if refund_amt > 0 then
    select * into pay from payments where booking_id = b.id and status = 'succeeded' limit 1;
    if found then
      insert into refunds (payment_id, amount, kind, reason, status)
      values (pay.id, refund_amt, r_type, p_reason,
              (case when r_type = 'wallet_credit' then 'succeeded' else 'initiated' end)::payment_status_t);
    end if;
    if r_type = 'wallet_credit' then
      insert into wallet_ledger (profile_id, delta, reason, ref_id, note)
      values (b.profile_id, refund_amt, 'refund_credit', b.id, 'رصيد بدل استرداد');
    end if;
  end if;

  update sbotat set status = 'open' where id = s.id and status = 'full';

  select * into next_wait from waitlist
  where sbota_id = s.id and notified_at is null
  order by position asc limit 1;

  if found then
    update waitlist set notified_at = now() where id = next_wait.id;
    insert into notifications (profile_id, channel, template_key, payload)
    values (next_wait.profile_id, 'whatsapp', 'waitlist_promoted',
            jsonb_build_object('sbota_id', s.id));
  end if;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'cancel_booking', 'bookings', b.id,
          jsonb_build_object('refund', refund_amt, 'kind', r_kind, 'by', v_by,
                             'pass', pass_res));

  return jsonb_build_object('ok', true, 'refund', refund_amt, 'kind', r_kind,
                            'pass_reverted', coalesce((pass_res ->> 'reverted')::boolean, false));
end;
$$;
comment on function fn_cancel_booking(uuid, text, text) is 'سياسة الإلغاء من settings. «إحنا لغينا» للإدارة/الخادم بس. لو الحجز paid_with_pass بترجّع الجلسة للكارت (fn_revert_pass) بدل الفلوس.';
revoke execute on function fn_cancel_booking(uuid, text, text) from public, anon;
grant  execute on function fn_cancel_booking(uuid, text, text) to authenticated, service_role;

-- ===== fn_approve_transfer — امتداد: التحويل ممكن يكون لكارت =====
-- نفس جسم 0033 بالحرف + فرع pass_id في الأول. لو الدفعة لكارت ما بنلمسش bookings خالص.
create or replace function fn_approve_transfer(p_payment_id uuid, p_ok boolean, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pay payments;
  bk  bookings;
  wp  work_passes;
begin
  if not fn_is_admin() then
    raise exception 'ده للإدارة بس';
  end if;

  select * into pay from payments where id = p_payment_id;
  if not found then raise exception 'الدفعة مش موجودة'; end if;
  if pay.status = 'succeeded' then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  -- ===== تحويل لكارت شغل =====
  if pay.pass_id is not null then
    update payments
    set status = (case when p_ok then 'succeeded' else 'failed' end)::payment_status_t,
        reviewed_by = auth.uid(),
        reviewed_at = now()
    where id = p_payment_id;

    if p_ok then
      perform fn_activate_pass(p_payment_id);
    else
      update work_passes
      set status = 'cancelled', note = coalesce(p_note, 'التحويل مظبطش')
      where id = pay.pass_id and status = 'pending';

      select * into wp from work_passes where id = pay.pass_id;
      insert into notifications (profile_id, channel, template_key, payload)
      values (wp.profile_id, 'whatsapp', 'transfer_rejected',
              jsonb_build_object('pass_id', wp.id, 'note', p_note));
    end if;

    insert into audit_log (actor_id, action, entity, entity_id, after)
    values (auth.uid(),
            case when p_ok then 'approve_transfer' else 'reject_transfer' end,
            'payments', p_payment_id,
            jsonb_build_object('pass', pay.pass_id, 'note', p_note));

    return jsonb_build_object('ok', true, 'approved', p_ok, 'pass_id', pay.pass_id);
  end if;

  -- ===== تحويل لحجز (نفس السلوك القديم بالحرف) =====
  select * into bk from bookings where id = pay.booking_id;

  update payments
  set status = (case when p_ok then 'succeeded' else 'failed' end)::payment_status_t,
      reviewed_by = auth.uid(),
      reviewed_at = now()
  where id = p_payment_id;

  if p_ok then
    -- ده بيشغّل fn_booking_paid: يقفل السبوطة · يخصم الرصيد · يسجل الإحالة · يبعت التأكيد
    update bookings set status = 'paid', expires_at = null where id = pay.booking_id;
  else
    update bookings
    set status = 'cancelled_by_us',
        cancel_reason = coalesce(p_note, 'التحويل مظبطش')
    where id = pay.booking_id;

    insert into notifications (profile_id, channel, template_key, payload)
    values (bk.profile_id, 'whatsapp', 'transfer_rejected',
            jsonb_build_object('booking_id', bk.id, 'note', p_note));
  end if;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(),
          case when p_ok then 'approve_transfer' else 'reject_transfer' end,
          'payments', p_payment_id,
          jsonb_build_object('booking', pay.booking_id, 'note', p_note));

  return jsonb_build_object('ok', true, 'approved', p_ok);
end;
$$;
comment on function fn_approve_transfer(uuid, boolean, text) is
  'الإدارة بتأكد أو ترفض تحويل يدوي — لحجز (بيتحرّك معاه) أو لكارت شغل (fn_activate_pass، من غير ما نلمس bookings).';
revoke execute on function fn_approve_transfer(uuid, boolean, text) from public, anon;
grant  execute on function fn_approve_transfer(uuid, boolean, text) to authenticated, service_role;

-- ===== fn_build_work_matching(p_sbota_id) — المرحلة 5 =====
-- مطابقة work_v1 (WORK_PLAN §3): منفصلة عن fn_build_matching، نفس شكل
-- matching_runs.proposal، algorithm_version = 'work_v1'. بتتكتب مع
-- scripts/check-work-matching.ts في المرحلة 5 — مش هنا.

-- ############################################################################
-- # 20260909100400_0043_work_rls.sql
-- ############################################################################

-- طبقة «الشغل» — 4: سياسات الصفوف (WORK_PLAN §1.6) + fn_submit_lead.
-- الافتراضي زي باقي المشروع: RLS مفعّل، ومفيش سياسة = مفيش وصول.
-- كل السياسات drop if exists + create علشان الملف يتشغّل أكتر من مرة.

alter table professions        enable row level security;
alter table work_venues        enable row level security;
alter table work_passes        enable row level security;
alter table pass_redemptions   enable row level security;
alter table recurring_bookings enable row level security;
alter table work_affinity      enable row level security;
alter table venue_reports      enable row level security;
alter table leads              enable row level security;

-- ===== professions: القراءة للكل، الكتابة fields.edit =====
drop policy if exists professions_read  on professions;
drop policy if exists professions_write on professions;
create policy professions_read  on professions for select using (true);
create policy professions_write on professions for all
  using (fn_has_permission('fields.edit')) with check (fn_has_permission('fields.edit'));

-- ===== work_venues: الجدول للإدارة بس — الأعضاء عبر work_venues_public =====
drop policy if exists work_venues_admin_read  on work_venues;
drop policy if exists work_venues_admin_write on work_venues;
create policy work_venues_admin_read  on work_venues for select using (fn_is_admin());
create policy work_venues_admin_write on work_venues for all
  using (fn_has_permission('sbotat.edit')) with check (fn_has_permission('sbotat.edit'));

-- ===== work_passes: صاحبها يقرا ويطلب (pending بس) — الإدارة كل حاجة =====
-- مفيش سياسة تعديل للعضو أصلًا: sessions_used بيتغير من الدوال بس،
-- والتفعيل من fn_activate_pass. (والحارس t_guard_pass_columns فوقها كمان.)
drop policy if exists work_passes_own_read   on work_passes;
drop policy if exists work_passes_own_insert on work_passes;
drop policy if exists work_passes_admin      on work_passes;
create policy work_passes_own_read on work_passes for select
  using (profile_id = auth.uid() or fn_is_admin());
create policy work_passes_own_insert on work_passes for insert
  with check (profile_id = auth.uid() and status = 'pending' and sessions_used = 0);
create policy work_passes_admin on work_passes for all
  using (fn_has_permission('payments.review')) with check (fn_has_permission('payments.review'));

-- ===== pass_redemptions: قراءة لصاحب الكارت والإدارة — الكتابة من الدوال بس =====
drop policy if exists pass_redemptions_own_read on pass_redemptions;
create policy pass_redemptions_own_read on pass_redemptions for select
  using (fn_is_admin() or exists (
    select 1 from work_passes wp where wp.id = pass_redemptions.pass_id and wp.profile_id = auth.uid()));

-- ===== recurring_bookings: صاحبها كامل على بتاعه — الإدارة bookings.edit =====
drop policy if exists recurring_own   on recurring_bookings;
drop policy if exists recurring_admin on recurring_bookings;
create policy recurring_own on recurring_bookings for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy recurring_admin on recurring_bookings for all
  using (fn_has_permission('bookings.edit') or fn_is_admin())
  with check (fn_has_permission('bookings.edit'));

-- ===== work_affinity: نفس pair_affinity بالحرف — الكتابة لصاحب الرغبة، القراءة لمحدش =====
drop policy if exists work_pair_insert_own on work_affinity;
drop policy if exists work_pair_update_own on work_affinity;
drop policy if exists work_pair_admin_read on work_affinity;
create policy work_pair_insert_own on work_affinity for insert
  with check (a_id = auth.uid() or b_id = auth.uid());
create policy work_pair_update_own on work_affinity for update
  using (a_id = auth.uid() or b_id = auth.uid())
  with check (a_id = auth.uid() or b_id = auth.uid());
create policy work_pair_admin_read on work_affinity for select using (fn_is_admin());

-- ===== venue_reports: قراءة payments.view — كتابة payments.review =====
-- («owner» في الخطة = صاحب المكان — مفيش حساب مستخدم للمكان في المشروع، فاتشالت)
drop policy if exists venue_reports_read  on venue_reports;
drop policy if exists venue_reports_write on venue_reports;
create policy venue_reports_read  on venue_reports for select using (fn_has_permission('payments.view'));
create policy venue_reports_write on venue_reports for all
  using (fn_has_permission('payments.review')) with check (fn_has_permission('payments.review'));

-- ===== leads: القراءة والتعديل للإدارة — الإدراج عبر fn_submit_lead بس =====
-- مفيش سياسة insert عن قصد: الإدراج المباشر من المتصفح مرفوض،
-- والدالة تحت security definer فبتعدّي RLS بعد ما تتحقق من الحد.
drop policy if exists leads_read  on leads;
drop policy if exists leads_write on leads;
create policy leads_read  on leads for select using (fn_has_permission('people.view'));
create policy leads_write on leads for update
  using (fn_has_permission('people.view')) with check (fn_has_permission('people.view'));

create or replace function fn_submit_lead(
  p_company         text,
  p_contact_name    text,
  p_phone           text,
  p_people_count    int  default null,
  p_times_per_month int  default null,
  p_note            text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_today int;
  v_id    uuid;
begin
  if coalesce(btrim(p_company), '') = '' or coalesce(btrim(p_contact_name), '') = '' then
    raise exception 'اسم الشركة واسم اللي بنكلمه لازم يتكتبوا';
  end if;

  -- نسيب الرقم أرقام بس — من غير مسافات ولا شرط
  v_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
  if length(regexp_replace(v_phone, '\D', '', 'g')) not between 8 and 15 then
    raise exception 'الرقم مش مظبوط';
  end if;

  -- حد المعدل: 3 طلبات في اليوم لنفس الرقم
  select count(*) into v_today from leads
  where phone = v_phone and created_at > now() - interval '1 day';
  if v_today >= 3 then
    raise exception 'وصلنا طلبك قبل كده — هنكلمك قريب';
  end if;

  insert into leads (company, contact_name, phone, people_count, times_per_month, note)
  values (left(btrim(p_company), 120), left(btrim(p_contact_name), 80), v_phone,
          p_people_count, p_times_per_month, left(p_note, 1000))
  returning id into v_id;

  return v_id;
end;
$$;
comment on function fn_submit_lead(text, text, text, int, int, text) is 'نموذج الشركات — الطريق الوحيد للإدراج في leads. 3 طلبات في اليوم لكل رقم كحد أقصى.';
revoke execute on function fn_submit_lead(text, text, text, int, int, text) from public;
grant  execute on function fn_submit_lead(text, text, text, int, int, text) to anon, authenticated, service_role;

-- ===== payments: صاحب الكارت يشوف دفعة كارته (السياسة القديمة بتمر على bookings بس) =====
drop policy if exists payments_pass_own_read on payments;
create policy payments_pass_own_read on payments for select
  using (exists (
    select 1 from work_passes wp where wp.id = payments.pass_id and wp.profile_id = auth.uid()));

-- ===== profiles: أعمدة الشغل =====
-- الخطة طلبت سياسة profiles_work_peer_read لزمايل نفس السبوطة بعد الكشف.
-- RLS على مستوى الصف — أي سياسة كده هتفتح الصف كله (التليفون والإيميل وسنة الميلاد)
-- لزمايل المجموعة، وده بيكسر الاختبار 1 في test_rls وسياسة الخصوصية كلها.
-- فالأعمدة الأربعة (المجال · الأسلوب · الخبرة · الاسم الأول) بتتقرا من
-- work_group_members / fn_work_group_members بس (0041) — نفس نمط fn_group_members.
-- صاحب الملف بيعدّلها بسياسة profiles_self_update الموجودة.

-- ############################################################################
-- # 20260909100500_0044_work_seed.sql
-- ############################################################################

-- طبقة «الشغل» — 5: البذرة (WORK_PLAN §1.7). كلها on conflict do nothing.

-- ===== 15 مجال =====
insert into professions (key, name_ar, icon_key, color, sort_order) values
  ('design',          'تصميم',          'pen-tool',   '#F4632A', 1),
  ('programming',     'برمجة',          'code',       '#2F80ED', 2),
  ('content_writing', 'كتابة محتوى',    'pencil',     '#9B51E0', 3),
  ('marketing',       'تسويق',          'megaphone',  '#EB5757', 4),
  ('video_editing',   'فيديو ومونتاج',  'film',       '#F2994A', 5),
  ('photography',     'تصوير',          'camera',     '#27AE60', 6),
  ('translation',     'ترجمة',          'languages',  '#2D9CDB', 7),
  ('accounting',      'محاسبة',         'calculator', '#219653', 8),
  ('law',             'قانون',          'scale',      '#4F4F4F', 9),
  ('teaching',        'تدريس',          'book-open',  '#BB6BD9', 10),
  ('consulting',      'استشارات',       'briefcase',  '#56CCF2', 11),
  ('architecture',    'معماري',         'ruler',      '#6FCF97', 12),
  ('audio',           'صوت',            'mic',        '#F2C94C', 13),
  ('data',            'بيانات',         'bar-chart',  '#828282', 14),
  ('other',           'غير كده',        'sparkles',   '#BDBDBD', 15)
on conflict (key) do nothing;

-- ===== 4 أماكن تجريبية (is_active = false لحد ما يتعمل معاهم اتفاق) =====
insert into venues (id, name, kind, area, area_label_ar, address, map_lat, map_lng, is_active) values
  ('55555555-0000-0000-0000-000000000101', '[تجريبي] كافيه شغل — التجمع الخامس', 'cafe_work', 'tagamoa',
   'التجمع', 'شارع التسعين الشمالي، الدور الأول فوق البنك', 30.0210, 31.4390, false),
  ('55555555-0000-0000-0000-000000000102', '[تجريبي] كافيه شغل — المعادي', 'cafe_work', 'maadi',
   'المعادي', 'شارع 9، جنب المترو، الدور الأرضي', 29.9600, 31.2580, false),
  ('55555555-0000-0000-0000-000000000103', '[تجريبي] مساحة عمل مشتركة — الشيخ زايد', 'coworking', 'zayed_october',
   'زايد وأكتوبر', 'محور 26 يوليو، مول أركان، الدور التاني', 30.0390, 30.9950, false),
  ('55555555-0000-0000-0000-000000000104', '[تجريبي] كافيه شغل — مصر الجديدة', 'cafe_work', 'heliopolis_nasr',
   'مصر الجديدة ومدينة نصر', 'شارع بغداد، الكوربة، الدور الأول', 30.0880, 31.3250, false)
on conflict (id) do nothing;

-- ===== مواصفاتهم — الأسعار بالقروش =====
insert into work_venues (venue_id, desks_count, wifi_mbps, wifi_note_ar, power_outlets, noise_level,
                         has_meeting_room, has_parking, has_ac, min_consumption, open_from, open_to,
                         best_days, photos, wholesale_seat_price, notes_ar) values
  ('55555555-0000-0000-0000-000000000101', 12, 80, 'فايبر — ثابت حتى لو الكافيه مليان', 'plenty', 'medium',
   false, true, true, 8000, '09:00', '23:00', array['sat','sun','mon','tue','wed'],
   array['[صورة — الترابيزة الطويلة جنب الشباك]'], 5000, 'ترابيزة الـ12 محجوزة لينا الصبح. الأوردر بيتحاسب كل واحد لوحده.'),
  ('55555555-0000-0000-0000-000000000102', 8, 40, 'كويس الصبح — بيتقل بعد 3 العصر', 'enough', 'quiet',
   false, false, true, 6000, '10:00', '22:00', array['sun','mon','tue','wed','thu'],
   array['[صورة — الركن الهادي في الدور الأرضي]'], 4000, 'المكان صغير — أقصى 8. مفيش باركنج، المترو أقرب.'),
  ('55555555-0000-0000-0000-000000000103', 20, 200, 'خط مخصص + باك أب', 'plenty', 'quiet',
   true, true, true, null, '08:00', '20:00', array['sat','sun','mon','tue','wed','thu'],
   array['[صورة — القاعة الكبيرة]', '[صورة — غرفة الاجتماعات]'], 9000, 'الكرسي باليوم شامل قهوة ومية. غرفة الاجتماعات بحجز قبلها بيوم.'),
  ('55555555-0000-0000-0000-000000000104', 10, 60, 'مستقر', 'enough', 'lively',
   false, false, true, 7000, '09:00', '23:00', array['sat','sun','mon','tue'],
   array['[صورة — الترابيزة الكبيرة جنب الباب]'], 4500, 'صوته عالي بعد 2 — نخلص قبلها.')
on conflict (venue_id) do nothing;

-- ===== قالبين — الأسعار بالقروش =====
insert into sbota_templates (id, slug, name_ar, story_ar, kind, default_price, org_fee, duration_min,
                             min_group, max_group, mood_ar, includes_ar, excludes_ar, is_day, girls_only,
                             hero_photos, meta_prefix_ar, level_ar, is_work, work_config) values
  ('66666666-0000-0000-0000-000000000101', 'sbota-shoghl', 'سبوطة شغل',
   'ستة بيشتغلوا جنب بعض من 10 لـ 3. ساعة غدا واحدة، وربع ساعة شكوى في الآخر. الباقي صمت وشغل.',
   'work', 12000, 2000, 300, 3, 6, 'هادي وشغال',
   array['ترابيزة وكرسي', 'واي فاي', 'الكابتن'], array['الأكل والقهوة (بتحاسب لوحدك)'],
   true, false, array['[صورة — ترابيزة طويلة ولابتوبات]'], 'شغل جنب بعض', 'أي حد', true,
   '{"start":"10:00","end":"15:00","lunch_hour_at":"13:00","complaint_hour_at":"14:30","focus_blocks":[["10:00","11:30"],["11:45","13:00"],["14:00","14:30"]],"desk_type":"shared_table","profession_mix_max":2}'::jsonb),
  ('66666666-0000-0000-0000-000000000102', 'sbota-shoghl-coworking', 'سبوطة شغل — مساحة مشتركة',
   'مكتب لكل واحد، نت مخصوص، وغرفة اجتماعات لو محتاج مكالمة. نفس الجدول: غدا 1، وشكوى 2 ونص.',
   'work', 15000, 2000, 300, 3, 6, 'هادي ومركّز',
   array['مكتب وكرسي', 'نت مخصص', 'قهوة ومية', 'الكابتن'], array['الأكل'],
   true, false, array['[صورة — المكاتب والقاعة]'], 'شغل في مساحة مشتركة', 'أي حد', true,
   '{"start":"10:00","end":"15:00","lunch_hour_at":"13:00","complaint_hour_at":"14:30","focus_blocks":[["10:00","11:30"],["11:45","13:00"],["14:00","14:30"]],"desk_type":"desk","profession_mix_max":2}'::jsonb)
on conflict (slug) do nothing;

-- القالب القديم work-cafe-tagamo3 (kind = work) بقى سبوطة شغل هو كمان،
-- وسبوطاته الموجودة بتاخد is_work (المحفّز بيشتغل على الإدراج بس).
update sbota_templates set is_work = true
where slug = 'work-cafe-tagamo3' and kind = 'work' and not is_work;

update sbotat s set is_work = true
from sbota_templates t
where t.id = s.template_id and t.is_work and not s.is_work;

-- ===== قوالب الإشعارات (§4) — واتساب، نفس اللهجة =====
insert into notification_templates (key, channel, body_ar, provider_template_id, is_active) values
  ('work_recurring_booked',  'whatsapp', 'حجزناك يوم {day} زي كل أسبوع — {venue}، 10 الصبح. لو مش هتعرف، ألغِ من هنا: {link}', 'nasbot_work_recurring_booked', true),
  ('work_no_pass_balance',   'whatsapp', 'معادك {day} جه، بس كارتك خلص. تحب تدفع الجلسة دي لوحدها؟ {link}', 'nasbot_work_no_pass_balance', true),
  ('work_pass_low',          'whatsapp', 'فاضل في كارتك يوم واحد. تحب تجدده؟ {link}', 'nasbot_work_pass_low', true),
  ('work_pass_expiring',     'whatsapp', 'كارتك بينتهي بعد {days} أيام وفاضل فيه {n} — استخدمهم. {link}', 'nasbot_work_pass_expiring', true),
  ('work_collab_match',      'whatsapp', 'أنت و{name} عايزين تشتغلوا سوا. تحبوا تتكلموا؟ {link}', 'nasbot_work_collab_match', true),
  ('work_venue_changed',     'whatsapp', 'مكان سبوطة الشغل يوم {day} اتغيّر لـ {venue}. نفس الوقت.', 'nasbot_work_venue_changed', true),
  ('work_first_time_offer',  'whatsapp', 'عارف إن فيه سبوطة شغل التلات؟ أول مرة بـ 60. {link}', 'nasbot_work_first_time_offer', true),
  -- زيادة عن الخطة: بيتبعت من fn_activate_pass لما الإدارة تعتمد التحويل (نص §2 /shoghl/pass)
  ('work_pass_activated',    'whatsapp', 'كارتك اتفعّل — معاك {n} أيام شغل. أول واحد إمتى؟ {link}', 'nasbot_work_pass_activated', true)
on conflict (key) do nothing;

-- ############################################################################
-- # 20260909100600_0045_work_jobs.sql
-- ############################################################################

-- طبقة «الشغل» — 6: المهام المجدولة على pg_cron (WORK_PLAN §1.5 و§0 #1).
-- نفس نمط job_* في 0026/0027. كلها بترجّع عدد اللي اتعمل.

-- ===== job_work_recurring — «يومك الثابت» =====
-- لكل صف نشط مش موقوف: أقرب موعد لليوم ده جوه نافذة work_recurring_lead_days
-- وما اتولّدش قبل كده → ندوّر على سبوطة شغل معلنة (قالب + مكان + يوم):
--   · auto_book وفيه رصيد كارت → حجز paid بالكارت + fn_redeem_pass + work_recurring_booked
--   · مفيش رصيد → work_no_pass_balance من غير حجز
--   · مفيش سبوطة معلنة → تنبيه للإدارة في provider_alerts (نمط اللوحة الموجود)
create or replace function job_work_recurring()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg      settings;
  r        record;
  sb       sbotat;
  today    date;
  target   date;
  bal      int;
  bid      uuid;
  old_bid  uuid;
  old_st   booking_status_t;
  n        int := 0;
  day_ar   text;
begin
  select * into cfg from settings where id;
  today := (now() at time zone 'Africa/Cairo')::date;

  for r in
    select rb.* from recurring_bookings rb
    where rb.status = 'active'
      and (rb.pause_until is null or rb.pause_until < today)
      and (rb.active_until is null or rb.active_until >= today)
  loop
    -- أقرب تاريخ بنفس اليوم من النهارده (0=الحد … 6=السبت)
    target := today + ((r.weekday - extract(dow from today)::int + 7) % 7);

    if target > today + cfg.work_recurring_lead_days then continue; end if;
    if r.last_generated_for is not null and r.last_generated_for >= target then continue; end if;
    if r.active_from > target then continue; end if;
    if r.active_until is not null and r.active_until < target then continue; end if;

    -- السبوطة المطابقة: قالب + مكان (لو محدد) + نفس اليوم — الأقرب لوقته المفضل
    select s.* into sb from sbotat s
    where s.is_work and s.status = 'open'
      and s.template_id = r.template_id
      and (r.venue_id is null or s.venue_id = r.venue_id)
      and (s.starts_at at time zone 'Africa/Cairo')::date = target
      and (s.booking_closes_at is null or now() < s.booking_closes_at)
    order by abs(extract(epoch from (
              (s.starts_at at time zone 'Africa/Cairo')::time - coalesce(r.time_of_day, '10:00'::time))))
    limit 1;

    if not found then
      -- تنبيه للإدارة مرة واحدة لكل (مكان، تاريخ)
      insert into provider_alerts (venue_id, reason, note)
      select r.venue_id, 'work_recurring_no_sbota',
             'مفيش سبوطة شغل معلنة يوم ' || target::text || ' لليوم الثابت ' || r.id::text
      where not exists (
        select 1 from provider_alerts pa
        where pa.reason = 'work_recurring_no_sbota' and pa.resolved_at is null
          and pa.venue_id is not distinct from r.venue_id
          and pa.note like '%' || target::text || '%'
      );
      continue;
    end if;

    -- مش عايز حجز تلقائي: نعلّم إننا عدّينا على الموعد ده وخلاص
    if not r.auto_book then
      update recurring_bookings set last_generated_for = target where id = r.id;
      continue;
    end if;

    -- حاجز خلاص؟
    select b.id, b.status into old_bid, old_st from bookings b
    where b.sbota_id = sb.id and b.profile_id = r.profile_id;
    if old_bid is not null and old_st in ('pending_payment', 'paid', 'attended') then
      update recurring_bookings set last_generated_for = target where id = r.id;
      continue;
    end if;

    bal := fn_pass_balance(r.profile_id);
    if bal <= 0 then
      insert into notifications (profile_id, channel, template_key, payload)
      values (r.profile_id, 'whatsapp', 'work_no_pass_balance',
              jsonb_build_object('sbota_id', sb.id, 'recurring_id', r.id, 'day', target));
      update recurring_bookings set last_generated_for = target where id = r.id;
      continue;
    end if;

    begin
      if old_bid is not null then
        -- كان ملغي على نفس السبوطة — نرجّعه بدل ما نكسر قيد (sbota_id, profile_id)
        update bookings
        set status = 'paid', paid_with_pass = true, price_paid = 0,
            cancelled_at = null, cancel_reason = null, refund_kind = null, expires_at = null
        where id = old_bid;
        bid := old_bid;
      else
        insert into bookings (sbota_id, profile_id, status, price_paid, paid_with_pass)
        values (sb.id, r.profile_id, 'paid', 0, true)
        returning id into bid;
      end if;

      perform fn_redeem_pass(bid);

      select v.name into day_ar from venues v where v.id = sb.venue_id;
      insert into notifications (profile_id, channel, template_key, payload)
      values (r.profile_id, 'whatsapp', 'work_recurring_booked',
              jsonb_build_object('booking_id', bid, 'sbota_id', sb.id, 'recurring_id', r.id,
                                 'day', target, 'venue', day_ar));

      update recurring_bookings set last_generated_for = target where id = r.id;
      n := n + 1;
    exception when others then
      -- السعة كملت أو الرصيد اتسحب في نفس اللحظة — نسيبها للإدارة
      insert into provider_alerts (venue_id, reason, note)
      values (sb.venue_id, 'work_recurring_failed',
              left(sqlerrm, 200) || ' — اليوم الثابت ' || r.id::text || ' يوم ' || target::text);
    end;
  end loop;

  return n;
end;
$$;
comment on function job_work_recurring() is 'بتولّد حجوزات اليوم الثابت قبلها بـ settings.work_recurring_lead_days — بالكارت لو فيه رصيد، وإلا إشعار.';
revoke execute on function job_work_recurring() from public, anon, authenticated;
grant  execute on function job_work_recurring() to service_role;

-- ===== job_work_pass_reminders — الكارت قرّب يخلص / ينتهي =====
create or replace function job_work_pass_reminders()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int := 0; m int := 0;
begin
  -- اللي انتهت صلاحيته
  update work_passes set status = 'expired'
  where status = 'active' and expires_at is not null and expires_at < now();

  -- فاضل يوم واحد
  insert into notifications (profile_id, channel, template_key, payload)
  select wp.profile_id, 'whatsapp', 'work_pass_low',
         jsonb_build_object('pass_id', wp.id)
  from work_passes wp
  where wp.status = 'active'
    and wp.sessions_total - wp.sessions_used = 1
    and not exists (
      select 1 from notifications nt
      where nt.template_key = 'work_pass_low' and nt.payload ->> 'pass_id' = wp.id::text
    );
  get diagnostics n = row_count;

  -- بينتهي خلال أسبوع وفيه رصيد
  insert into notifications (profile_id, channel, template_key, payload)
  select wp.profile_id, 'whatsapp', 'work_pass_expiring',
         jsonb_build_object('pass_id', wp.id,
                            'days', ceil(extract(epoch from (wp.expires_at - now())) / 86400.0)::int,
                            'n', wp.sessions_total - wp.sessions_used)
  from work_passes wp
  where wp.status = 'active'
    and wp.expires_at is not null
    and wp.expires_at between now() and now() + interval '7 days'
    and wp.sessions_total - wp.sessions_used > 0
    and not exists (
      select 1 from notifications nt
      where nt.template_key = 'work_pass_expiring' and nt.payload ->> 'pass_id' = wp.id::text
    );
  get diagnostics m = row_count;

  return n + m;
end;
$$;
comment on function job_work_pass_reminders() is 'بيعلّم الكروت المنتهية expired وبيبعت work_pass_low و work_pass_expiring مرة واحدة لكل كارت.';
revoke execute on function job_work_pass_reminders() from public, anon, authenticated;
grant  execute on function job_work_pass_reminders() to service_role;

-- ===== job_work_venue_reports — كل اتنين: حساب الأسبوع اللي فات =====
create or replace function job_work_venue_reports()
returns int
language sql
security definer
set search_path = public
as $$
  select fn_venue_report(
    (date_trunc('week', ((now() at time zone 'Africa/Cairo')::date - 7)::timestamp))::date
  );
$$;
comment on function job_work_venue_reports() is 'بتبني venue_reports للأسبوع اللي فات (من الاتنين) لكل مكان شغل.';
revoke execute on function job_work_venue_reports() from public, anon, authenticated;
grant  execute on function job_work_venue_reports() to service_role;

-- ===== job_work_metrics — تجديد العرض المادي =====
create or replace function job_work_metrics()
returns void
language sql
security definer
set search_path = public
as $$
  refresh materialized view concurrently work_metrics;
$$;
comment on function job_work_metrics() is 'بتجدّد work_metrics — بعد job_metrics بربع ساعة.';
revoke execute on function job_work_metrics() from public, anon, authenticated;
grant  execute on function job_work_metrics() to service_role;

-- ===== الجدولة (UTC — 7 = 9 القاهرة) =====
-- cron.schedule بالاسم بتحدّث الموجود، بس بنحرسها علشان الملف يتشغّل أكتر من مرة من غير ضجيج.
select cron.schedule('nasbot-work-recurring', '0 7 * * *',  $$select job_work_recurring()$$)
where not exists (select 1 from cron.job where jobname = 'nasbot-work-recurring');

select cron.schedule('nasbot-work-passes',    '0 8 * * *',  $$select job_work_pass_reminders()$$)
where not exists (select 1 from cron.job where jobname = 'nasbot-work-passes');

select cron.schedule('nasbot-work-venues',    '0 6 * * 1',  $$select job_work_venue_reports()$$)
where not exists (select 1 from cron.job where jobname = 'nasbot-work-venues');

select cron.schedule('nasbot-work-metrics',   '15 3 * * *', $$select job_work_metrics()$$)
where not exists (select 1 from cron.job where jobname = 'nasbot-work-metrics');

-- ############################################################################
-- # 20260909100700_0046_work_rls_tests.sql
-- ############################################################################

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
