create table venues (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  kind                venue_kind_t not null,
  area                area_t not null,
  address             text not null,
  map_lat             numeric(9,6),
  map_lng             numeric(9,6),
  contact_phone       text,
  contract_notes      text,
  wholesale_price     int,
  verified_at         timestamptz,
  verified_by         uuid references profiles(id),
  last_inspection_at  timestamptz,
  rating_avg          numeric(3,2),
  is_active           boolean not null default true,
  tourism_license_no  text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint venues_tour_license_required
    check (kind <> 'tour_operator' or tourism_license_no is not null)
);
comment on table venues is 'المقدمين والأماكن. رقم الترخيص السياحي إلزامي لمنظمي الرحلات (قانون السياحة).';
comment on constraint venues_tour_license_required on venues is 'ممنوع تسجيل منظم رحلات من غير رقم ترخيص.';

create index on venues (area);
create index on venues (is_active);
create trigger t_venues_updated before update on venues for each row execute function set_updated_at();

create table sbota_templates (
  id            uuid primary key default gen_random_uuid(),
  slug          text not null unique,
  name_ar       text not null,
  story_ar      text not null,
  kind          template_kind_t not null,
  default_price int not null,
  org_fee       int not null default 4000,
  duration_min  int not null,
  min_group     int not null,
  max_group     int not null,
  mood_ar       text,
  includes_ar   text[] not null default '{}',
  excludes_ar   text[] not null default '{}',
  requirements  jsonb  not null default '{}',
  is_day        boolean not null default false,
  girls_only    boolean not null default false,
  overnight     boolean not null default false,
  hero_photos   text[] not null default '{}',
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  constraint sbota_templates_group_range check (min_group between 2 and max_group)
);
comment on table sbota_templates is 'أنواع السبوطات الثابتة — الأسعار بالقروش.';
comment on column sbota_templates.org_fee is 'رسوم التنظيم والكابتن — جوه السعر مش زيادة عليه.';

create trigger t_templates_updated before update on sbota_templates for each row execute function set_updated_at();

create table sbotat (
  id                  uuid primary key default gen_random_uuid(),
  template_id         uuid not null references sbota_templates(id) on delete restrict,
  venue_id            uuid references venues(id) on delete restrict,
  captain_id          uuid references captains(id) on delete set null,
  starts_at           timestamptz not null,
  ends_at             timestamptz not null,
  price               int not null,
  org_fee             int not null default 4000,
  capacity            int not null check (capacity between 2 and 40),
  min_to_run          int not null default 4,
  status              sbota_status_t not null default 'draft',
  girls_only          boolean not null default false,
  is_day              boolean not null default false,
  is_mystery          boolean not null default false,
  mystery_reveal_at   timestamptz,
  address_hidden      boolean not null default true,
  booking_closes_at   timestamptz,
  reveal_at           timestamptz,
  chat_opens_at       timestamptz,
  chat_closes_at      timestamptz,
  weather_cancel_rule jsonb not null default '{}',
  cancel_reason       text,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint sbotat_ends_after_starts check (ends_at > starts_at)
);
comment on table sbotat is 'المواعيد الفعلية. التوقيتات الأربعة محسوبة تلقائيًا بـ fn_sbota_timings.';
comment on column sbotat.address_hidden is 'العنوان الكامل ما يظهرش غير لصاحب حجز مدفوع.';

create index on sbotat (starts_at);
create index on sbotat (status);
create index on sbotat (template_id);
create index on sbotat (reveal_at) where status in ('open','full','locked');

create trigger t_sbotat_updated before update on sbotat for each row execute function set_updated_at();

create or replace function fn_sbota_timings()
returns trigger
language plpgsql
as $$
declare
  same_day_8pm timestamptz;
begin
  new.booking_closes_at := new.starts_at - interval '36 hours';

  -- الكشف: قبلها بيوم، وبحد أقصى الساعة 8 مساءً بتوقيت القاهرة في نفس اليوم
  same_day_8pm := ((new.starts_at at time zone 'Africa/Cairo')::date
                   - interval '1 day' + interval '20 hours')
                  at time zone 'Africa/Cairo';
  new.reveal_at      := least(new.starts_at - interval '24 hours', same_day_8pm);
  new.chat_opens_at  := new.reveal_at;
  new.chat_closes_at := new.ends_at + interval '48 hours';
  return new;
end;
$$;
comment on function fn_sbota_timings() is 'بيحسب booking_closes_at و reveal_at و chat_opens_at و chat_closes_at بتوقيت القاهرة.';

create trigger t_sbota_timings before insert or update of starts_at, ends_at on sbotat
  for each row execute function fn_sbota_timings();

create table sbota_groups (
  id           uuid primary key default gen_random_uuid(),
  sbota_id     uuid not null references sbotat(id) on delete cascade,
  index        int  not null,
  captain_id   uuid references captains(id) on delete set null,
  why_ar       text,
  chat_room_id uuid,
  created_at   timestamptz not null default now(),
  unique (sbota_id, index)
);
comment on table sbota_groups is 'المجموعات جوه الموعد الواحد. why_ar = «ليه المجموعة دي؟».';

create index on sbota_groups (sbota_id);

create table mystery_clues (
  id           uuid primary key default gen_random_uuid(),
  sbota_id     uuid not null references sbotat(id) on delete cascade,
  day_index    int  not null check (day_index between 1 and 7),
  kind         clue_kind_t not null,
  path_or_text text not null,
  unlocks_at   timestamptz not null,
  created_at   timestamptz not null default now(),
  unique (sbota_id, day_index)
);
comment on table mystery_clues is 'أدلة السبوطة الغامضة — واحد بيتفتح كل يوم.';;
