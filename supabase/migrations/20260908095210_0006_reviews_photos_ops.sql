create table reviews (
  id            uuid primary key default gen_random_uuid(),
  booking_id    uuid not null unique references bookings(id) on delete cascade,
  profile_id    uuid not null references profiles(id) on delete cascade,
  sbota_id      uuid not null references sbotat(id) on delete cascade,
  score_sbota   int check (score_sbota between 1 and 5),
  score_captain int check (score_captain between 1 and 5),
  score_venue   int check (score_venue between 1 and 5),
  score_group   int check (score_group between 1 and 5),
  will_rebook   boolean,
  photo_consent boolean not null default false,
  free_text     text,
  created_at    timestamptz not null default now()
);
comment on table reviews is 'التقييم — صف واحد لكل حجز. اختيار «عايز أشوف مين» بيتكتب في pair_affinity مش هنا.';
create index on reviews (sbota_id);

create or replace function fn_ratings_rollup()
returns trigger
language plpgsql
as $$
declare
  v_captain uuid;
  v_venue   uuid;
begin
  select s.captain_id, s.venue_id into v_captain, v_venue
  from sbotat s where s.id = new.sbota_id;

  if v_captain is not null then
    update captains set rating_avg = (
      select round(avg(r.score_captain)::numeric, 2)
      from reviews r join sbotat s2 on s2.id = r.sbota_id
      where s2.captain_id = v_captain and r.score_captain is not null
    ) where id = v_captain;
  end if;

  if v_venue is not null then
    update venues set rating_avg = (
      select round(avg(r.score_venue)::numeric, 2)
      from reviews r join sbotat s3 on s3.id = r.sbota_id
      where s3.venue_id = v_venue and r.score_venue is not null
    ) where id = v_venue;
  end if;

  return null;
end;
$$;
comment on function fn_ratings_rollup() is 'بيحدّث متوسط تقييم الكابتن والمكان بعد كل تقييم.';

create trigger t_ratings_rollup after insert or update on reviews
  for each row execute function fn_ratings_rollup();

create table sbota_photos (
  id                      uuid primary key default gen_random_uuid(),
  sbota_id                uuid not null references sbotat(id) on delete cascade,
  group_id                uuid references sbota_groups(id) on delete set null,
  path                    text not null,
  uploaded_by             uuid references profiles(id) on delete set null,
  signed_by_captain       boolean not null default false,
  published_to_members_at timestamptz,
  marketing_ok            boolean not null default false,
  created_at              timestamptz not null default now()
);
comment on table sbota_photos is 'صور المجموعة. marketing_ok مايبقاش true غير لما كل اللي في الصورة يوافقوا (photo_consent).';
create index on sbota_photos (sbota_id);

create table captain_reports (
  id              uuid primary key default gen_random_uuid(),
  sbota_id        uuid not null references sbotat(id) on delete cascade,
  captain_id      uuid not null references captains(id) on delete cascade,
  attendance_json jsonb not null default '{}',
  what_worked     text,
  what_didnt      text,
  incident        text,
  suggestion      text,
  created_at      timestamptz not null default now(),
  unique (sbota_id, captain_id)
);
comment on table captain_reports is 'تقرير الكابتن بعد السبوطة.';

create table notification_templates (
  key                  text primary key,
  channel              notify_channel_t not null,
  body_ar              text not null,
  provider_template_id text,
  is_active            boolean not null default true
);
comment on table notification_templates is 'قوالب الرسائل بنفس اللهجة من COPY.md. provider_template_id = اسم قالب واتساب المعتمد.';

create table notifications (
  id             uuid primary key default gen_random_uuid(),
  profile_id     uuid references profiles(id) on delete cascade,
  phone          text,
  channel        notify_channel_t not null,
  template_key   text references notification_templates(key),
  payload        jsonb not null default '{}',
  status         notify_status_t not null default 'queued',
  provider_ref   text,
  error          text,
  attempts       int not null default 0,
  scheduled_for  timestamptz not null default now(),
  sent_at        timestamptz,
  created_at     timestamptz not null default now()
);
comment on table notifications is 'طابور الإشعارات — دالة notify بتعالجه كل دقيقة بإعادة محاولة.';
create index on notifications (status, scheduled_for);
create index on notifications (profile_id);

create table otp_codes (
  id          uuid primary key default gen_random_uuid(),
  phone       text not null,
  code_hash   text not null,
  expires_at  timestamptz not null,
  attempts    int not null default 0,
  consumed_at timestamptz,
  created_at  timestamptz not null default now()
);
comment on table otp_codes is 'رموز التحقق — مخزنة كهاش. 5 محاولات و3 إرسالات في الساعة كحد أقصى.';
create index on otp_codes (phone, created_at desc);

create table audit_log (
  id        uuid primary key default gen_random_uuid(),
  actor_id  uuid references profiles(id) on delete set null,
  action    text not null,
  entity    text not null,
  entity_id uuid,
  before    jsonb,
  after     jsonb,
  ip        inet,
  at        timestamptz not null default now()
);
comment on table audit_log is 'سجل التدقيق — كل فعل إداري حساس.';
create index on audit_log (entity, entity_id);
create index on audit_log (at desc);

create table settings (
  id                     boolean primary key default true check (id),
  refund_full_days       int  not null default 3,
  refund_half_days       int  not null default 0,
  refund_credit_hours    int  not null default 48,
  our_cancel_bonus_pct   int  not null default 10,
  referral_discount_pct  int  not null default 15,
  referral_reward        int  not null default 10000,
  review_coupon_pct      int  not null default 10,
  commission_pct         int  not null default 20,
  gateway_fee_pct        numeric(4,2) not null default 2.75,
  emergency_phone        text not null default '+201000000000',
  payment_provider       payment_provider_t not null default 'paymob',
  reveal_hour_cairo      int  not null default 20,
  mystery_min_sbotat     int  not null default 2,
  updated_at             timestamptz not null default now()
);
comment on table settings is 'صف واحد. سياسة الاسترداد هنا مش في الكود — تتغير من لوحة الإدارة.';
comment on column settings.refund_full_days is 'الاسترداد الكامل قبل كام يوم. الافتراضي 3 = نص الضمان المنشور دلوقتي.';
comment on column settings.refund_half_days is 'استرداد 50% قبل كام يوم. 0 = متعطّل (السياسة الحالية).';

insert into settings (id) values (true);
create trigger t_settings_updated before update on settings for each row execute function set_updated_at();

create table events (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  props      jsonb not null default '{}',
  profile_id uuid references profiles(id) on delete set null,
  at         timestamptz not null default now()
);
comment on table events is 'أحداث التحليلات — بدون IP ولا user-agent ولا أي بيانات شخصية زيادة.';
create index on events (name, at desc);

create table marketing_spend (
  id       uuid primary key default gen_random_uuid(),
  week     date not null unique,
  amount   int not null,
  channel  text,
  note     text
);
comment on table marketing_spend is 'مصروف التسويق الأسبوعي — بيدخل في حساب تكلفة الاكتساب.';;
