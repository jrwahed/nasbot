create table profiles (
  id               uuid primary key references auth.users(id) on delete cascade,
  phone            text not null unique check (phone ~ '^\+201[0125][0-9]{8}$'),
  email            text,
  first_name       text,
  birth_year       int check (birth_year between 1940 and extract(year from now())::int - 18),
  gender           gender_t,
  area             area_t,
  girls_only_pref  girls_pref_t,
  avatar_path      text,
  social_energy    social_energy_t,
  group_pref       group_pref_t,
  budget_max       int check (budget_max in (250, 500, 1000)),
  free_slots       text[] not null default '{}',
  type             persona_t,
  type_scores      jsonb,
  wish_text        text,
  role             role_t not null default 'member',
  phone_verified_at timestamptz,
  rules_accepted_at timestamptz,
  data_consent_at   timestamptz,
  referral_code    text not null unique,
  referred_by      uuid references profiles(id) on delete set null,
  wallet_balance   int not null default 0,
  sbota_count      int not null default 0,
  no_show_count    int not null default 0,
  banned_at        timestamptz,
  ban_reason       text,
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

comment on table profiles is 'ملف العضو — بيمتد من auth.users. العمر ≥ 18 بقيد، وشرط الـ21 للرحلات بمبيت بيتحقق في fn_can_book.';
comment on column profiles.wallet_balance is 'محسوب من wallet_ledger بمحفّز — ممنوع التعديل المباشر.';
comment on column profiles.deleted_at is 'حذف ناعم — المسح النهائي بعد 30 يوم عبر مهمة purge.';

create index on profiles (phone);
create index on profiles (role);
create index on profiles (referred_by);
create index on profiles (deleted_at) where deleted_at is null;

create trigger t_profiles_updated before update on profiles
  for each row execute function set_updated_at();

create table interests (
  id        uuid primary key default gen_random_uuid(),
  slug      text not null unique,
  label_ar  text not null,
  sort      int  not null default 0
);
comment on table interests is 'قاموس الـ20 اهتمام — نفس القايمة اللي في ملف التصميم.';

create table profile_interests (
  profile_id  uuid not null references profiles(id) on delete cascade,
  interest_id uuid not null references interests(id) on delete cascade,
  created_at  timestamptz not null default now(),
  primary key (profile_id, interest_id)
);
comment on table profile_interests is 'اهتمامات العضو — 5 بالظبط عند اكتمال الملف (بيتحقق في fn_profile_is_complete).';

create index on profile_interests (profile_id);

create table skill_levels (
  profile_id uuid not null references profiles(id) on delete cascade,
  activity   activity_t not null,
  level      skill_t    not null,
  primary key (profile_id, activity)
);
comment on table skill_levels is 'مستوى العضو في بادل/جري/سباحة.';

create table captains (
  id            uuid primary key default gen_random_uuid(),
  profile_id    uuid not null unique references profiles(id) on delete cascade,
  bio_line      text not null,
  activities    text[] not null default '{}',
  is_active     boolean not null default true,
  payout_method jsonb,
  rating_avg    numeric(3,2),
  sbota_count   int not null default 0,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table captains is 'الكباتن — الجملة والتخصصات وطريقة الاستلام.';
comment on column captains.rating_avg is 'محسوب من reviews.score_captain بمحفّز.';

create index on captains (is_active);

create trigger t_captains_updated before update on captains
  for each row execute function set_updated_at();

create table captain_applications (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  phone      text not null,
  job        text,
  why        text,
  handled_at timestamptz,
  handled_by uuid references profiles(id),
  created_at timestamptz not null default now()
);
comment on table captain_applications is 'نموذج «بقى كابتن» من صفحة الكباتن.';

create table weekly_schedule_subs (
  id            uuid primary key default gen_random_uuid(),
  phone         text not null unique check (phone ~ '^\+201[0125][0-9]{8}$'),
  profile_id    uuid references profiles(id) on delete set null,
  unsubscribed_at timestamptz,
  created_at    timestamptz not null default now()
);
comment on table weekly_schedule_subs is 'اللي سجلوا رقمهم في «ابعتلي الجدول على واتساب».';;
