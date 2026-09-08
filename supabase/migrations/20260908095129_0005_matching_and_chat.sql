create table matching_runs (
  id                uuid primary key default gen_random_uuid(),
  sbota_id          uuid not null references sbotat(id) on delete cascade,
  ran_at            timestamptz not null default now(),
  ran_by            text not null default 'system',
  algorithm_version text not null default 'v1',
  proposal          jsonb not null,
  approved_at       timestamptz,
  approved_by       uuid references profiles(id)
);
comment on table matching_runs is 'اقتراح المطابقة — الإدارة أو الكابتن بيعتمده، أو بيتعمد تلقائيًا قبل الكشف بساعة.';
create index on matching_runs (sbota_id);

create table matching_outcomes (
  id               uuid primary key default gen_random_uuid(),
  group_id         uuid not null references sbota_groups(id) on delete cascade,
  avg_group_score  numeric(3,2),
  attendance_rate  numeric(3,2),
  computed_at      timestamptz not null default now()
);
comment on table matching_outcomes is 'نتيجة كل مجموعة بعد التقييم — الأصل اللي هيتبني عليه إصدار v2 للخوارزمية.';

create table pair_affinity (
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
  constraint pair_affinity_ordered check (a_id < b_id),
  unique (a_id, b_id)
);
comment on table pair_affinity is 'رسم «عايز أشوف مين تاني». محدش بيقرأ الجدول ده — الوصول عبر fn_is_mutual بس.';
comment on column pair_affinity.mutual_at is 'بيتملى بمحفّز لما الاتنين يختاروا بعض.';

create trigger t_pair_updated before update on pair_affinity for each row execute function set_updated_at();

create or replace function fn_mutual_affinity()
returns trigger
language plpgsql
as $$
begin
  if new.a_wants_b and new.b_wants_a and new.mutual_at is null then
    new.mutual_at := now();
  end if;
  return new;
end;
$$;
comment on function fn_mutual_affinity() is 'بيضبط mutual_at لما الطرفين يختاروا بعض.';

create trigger t_mutual_affinity before insert or update on pair_affinity
  for each row execute function fn_mutual_affinity();

create table behavior_flags (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  kind       flag_kind_t not null,
  booking_id uuid references bookings(id) on delete set null,
  note       text,
  weight     int not null default 1,
  created_at timestamptz not null default now()
);
comment on table behavior_flags is 'إشارات السلوك — بتدخل في المطابقة وفي قرار الحظر.';
create index on behavior_flags (profile_id);

create table chat_rooms (
  id                uuid primary key default gen_random_uuid(),
  kind              room_kind_t not null,
  sbota_id          uuid references sbotat(id) on delete cascade,
  group_id          uuid references sbota_groups(id) on delete cascade,
  opens_at          timestamptz,
  closes_at         timestamptz,
  pinned_message_id uuid,
  is_closed         boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint chat_rooms_group_needs_sbota
    check (kind <> 'sbota_group' or (sbota_id is not null and group_id is not null))
);
comment on table chat_rooms is 'غرف الشات. غرفة المجموعة بتتفتح مع الكشف وبتتقفل بعد السبوطة بيومين.';
create index on chat_rooms (sbota_id);
create unique index chat_rooms_group_uniq on chat_rooms (group_id) where group_id is not null;
create trigger t_rooms_updated before update on chat_rooms for each row execute function set_updated_at();

alter table sbota_groups
  add constraint sbota_groups_room_fk foreign key (chat_room_id) references chat_rooms(id) on delete set null;

create table chat_members (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references chat_rooms(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  role       member_role_t not null default 'member',
  joined_at  timestamptz not null default now(),
  removed_at timestamptz,
  removed_by uuid references profiles(id),
  unique (room_id, profile_id)
);
comment on table chat_members is 'أعضاء الغرفة. removed_at = اتشال من الكابتن.';
create index on chat_members (profile_id);
create index on chat_members (room_id) where removed_at is null;

create table messages (
  id         uuid primary key default gen_random_uuid(),
  room_id    uuid not null references chat_rooms(id) on delete cascade,
  sender_id  uuid references profiles(id) on delete set null,
  body       text not null check (length(body) between 1 and 2000),
  kind       message_kind_t not null default 'text',
  deleted_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table messages is 'الرسائل. القراءة والكتابة لأعضاء الغرفة بس وبين opens_at و closes_at.';
create index on messages (room_id, created_at);

alter table chat_rooms
  add constraint chat_rooms_pinned_fk foreign key (pinned_message_id) references messages(id) on delete set null;

create table reports (
  id                uuid primary key default gen_random_uuid(),
  reporter_id       uuid not null references profiles(id) on delete cascade,
  target_profile_id uuid references profiles(id) on delete set null,
  message_id        uuid references messages(id) on delete set null,
  booking_id        uuid references bookings(id) on delete set null,
  reason            report_reason_t not null,
  note              text,
  status            report_status_t not null default 'open',
  handled_by        uuid references profiles(id),
  handled_at        timestamptz,
  action            report_action_t not null default 'none',
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);
comment on table reports is 'البلاغات — من الشات أو من السبوطة.';
create index on reports (status);
create trigger t_reports_updated before update on reports for each row execute function set_updated_at();;
