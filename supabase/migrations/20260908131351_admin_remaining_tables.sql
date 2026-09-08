-- الجداول الناقصة من ADMIN_PLAN.md §2.4 و§2.7

-- ===== حقول الحساب والقوائم =====
create table if not exists profile_fields (
  key          text primary key,
  label_ar     text not null,
  help_ar      text,
  error_ar     text,
  is_required  boolean not null default true,
  is_active    boolean not null default true,
  step         integer not null default 1,
  "order"      integer not null default 1,
  validation   jsonb not null default '{}'::jsonb,
  updated_at   timestamptz not null default now()
);

create table if not exists field_options (
  id         uuid primary key default gen_random_uuid(),
  field_key  text not null references profile_fields(key) on delete cascade,
  value      text not null,
  label_ar   text not null,
  "order"    integer not null default 1,
  is_active  boolean not null default true,
  unique (field_key, value)
);

create table if not exists skill_activities (
  key       text primary key,
  label_ar  text not null,
  "order"   integer not null default 1,
  is_active boolean not null default true
);

create table if not exists consents (
  key                 text primary key,
  text_ar             text not null,
  version             integer not null default 1,
  requires_reconsent  boolean not null default false,
  published_at        timestamptz
);

create table if not exists consent_accepts (
  profile_id   uuid not null references profiles(id) on delete cascade,
  consent_key  text not null references consents(key) on delete cascade,
  version      integer not null,
  accepted_at  timestamptz not null default now(),
  primary key (profile_id, consent_key, version)
);

-- ===== التشغيل =====
create table if not exists broadcasts (
  id               uuid primary key default gen_random_uuid(),
  segment          jsonb not null default '{}'::jsonb,
  template_key     text,
  recipients_count integer not null default 0,
  sent_count       integer not null default 0,
  status           text not null default 'draft',
  created_by       uuid references profiles(id) on delete set null,
  created_at       timestamptz not null default now(),
  constraint broadcasts_status_ck check (status in ('draft','sending','sent','failed','cancelled'))
);

create table if not exists provider_alerts (
  id          uuid primary key default gen_random_uuid(),
  venue_id    uuid references venues(id) on delete cascade,
  reason      text not null,
  note        text,
  created_at  timestamptz not null default now(),
  resolved_at timestamptz
);

-- ===== توسعة الإعدادات (§2.6) =====
alter table settings
  add column if not exists reveal_hour              integer  not null default 20,
  add column if not exists chat_open_hours          integer  not null default 48,
  add column if not exists chat_close_hours         integer  not null default 24,
  add column if not exists weather_rules            jsonb    not null default '{}'::jsonb,
  add column if not exists first_time_work_discount integer  not null default 0,
  add column if not exists max_interests            integer  not null default 5,
  add column if not exists min_age                  integer  not null default 18,
  add column if not exists min_age_overnight        integer  not null default 21,
  add column if not exists metric_thresholds        jsonb    not null default '{}'::jsonb,
  add column if not exists day_mode_start_hour      integer  not null default 6,
  add column if not exists day_mode_end_hour        integer  not null default 18,
  add column if not exists match_max_age_gap        integer  not null default 8,
  add column if not exists match_min_starters       integer  not null default 2,
  add column if not exists match_girls_ratio_min    integer  not null default 30,
  add column if not exists match_girls_ratio_max    integer  not null default 70,
  add column if not exists match_mutual_weight      integer  not null default 3,
  add column if not exists match_no_show_limit      integer  not null default 2,
  add column if not exists algorithm_version        integer  not null default 1,
  add column if not exists daily_broadcast_limit    integer  not null default 1;

-- ===== RLS =====
alter table profile_fields   enable row level security;
alter table field_options    enable row level security;
alter table skill_activities enable row level security;
alter table consents         enable row level security;
alter table consent_accepts  enable row level security;
alter table broadcasts       enable row level security;
alter table provider_alerts  enable row level security;

-- الحقول والقوائم والموافقات: أي حد يقراها (بيبني بيها نموذج التسجيل)،
-- والتعديل لصاحب صلاحية المحتوى بس
create policy pf_read  on profile_fields   for select using (is_active or fn_has_permission('content.edit'));
create policy pf_write on profile_fields   for all    using (fn_has_permission('content.edit'));
create policy fo_read  on field_options    for select using (is_active or fn_has_permission('content.edit'));
create policy fo_write on field_options    for all    using (fn_has_permission('content.edit'));
create policy sa_read  on skill_activities for select using (is_active or fn_has_permission('content.edit'));
create policy sa_write on skill_activities for all    using (fn_has_permission('content.edit'));
create policy co_read  on consents         for select using (published_at is not null or fn_has_permission('content.edit'));
create policy co_write on consents         for all    using (fn_has_permission('content.edit'));

-- الموافقات: كل واحد يشوف بتاعه، والإدارة تشوف الكل
create policy ca_read_own on consent_accepts for select using (profile_id = auth.uid() or fn_has_permission('people.view'));
create policy ca_ins_own  on consent_accepts for insert with check (profile_id = auth.uid());

-- التشغيل: للإدارة بس
create policy br_all on broadcasts      for all using (fn_has_permission('notifications.send'));
create policy pa_all on provider_alerts for all using (fn_has_permission('sbotat.edit'));;
