create table bookings (
  id                  uuid primary key default gen_random_uuid(),
  sbota_id            uuid not null references sbotat(id) on delete cascade,
  profile_id          uuid not null references profiles(id) on delete cascade,
  group_id            uuid references sbota_groups(id) on delete set null,
  status              booking_status_t not null default 'pending_payment',
  price_paid          int not null default 0,
  discount            int not null default 0,
  referral_code_used  text,
  wallet_used         int not null default 0,
  payment_id          uuid,
  checked_in_at       timestamptz,
  checked_in_by       uuid references profiles(id),
  cancelled_at        timestamptz,
  cancel_reason       text,
  refund_kind         refund_kind_t,
  is_first_booking    boolean not null default false,
  plus_one_booking_id uuid references bookings(id) on delete set null,
  expires_at          timestamptz,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  unique (sbota_id, profile_id)
);
comment on table bookings is 'الحجوزات. مهلة الدفع 15 دقيقة في expires_at، وبعدها الحجز بيتلغي تلقائيًا.';
comment on column bookings.plus_one_booking_id is 'حجز الصاحب — بيضمن إنهم في نفس المجموعة عند المطابقة.';

create index on bookings (sbota_id);
create index on bookings (profile_id);
create index on bookings (status);
create index on bookings (group_id);
create index on bookings (expires_at) where status = 'pending_payment';

create trigger t_bookings_updated before update on bookings for each row execute function set_updated_at();

-- حارس السعة: بيقفل صف السبوطة قبل ما يعدّ، فما ينفعش يتعدى تحت التزامن
create or replace function fn_capacity_guard()
returns trigger
language plpgsql
as $$
declare
  cap  int;
  used int;
begin
  if new.status <> 'paid' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'paid' then
    return new;
  end if;

  select capacity into cap from sbotat where id = new.sbota_id for update;

  select count(*) into used
  from bookings
  where sbota_id = new.sbota_id
    and status in ('paid', 'attended')
    and id <> new.id;

  if used >= cap then
    raise exception 'السبوطة كملت' using errcode = 'check_violation';
  end if;

  return new;
end;
$$;
comment on function fn_capacity_guard() is 'بيمنع تجاوز السعة تحت التزامن بقفل صف السبوطة (select for update).';

create trigger t_capacity_guard before insert or update of status on bookings
  for each row execute function fn_capacity_guard();

create table waitlist (
  id          uuid primary key default gen_random_uuid(),
  sbota_id    uuid not null references sbotat(id) on delete cascade,
  profile_id  uuid not null references profiles(id) on delete cascade,
  position    int  not null,
  notified_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (sbota_id, profile_id)
);
comment on table waitlist is 'قائمة الانتظار — بترقّي أول واحد لما مكان يفضى.';
create index on waitlist (sbota_id, position);

create table payments (
  id              uuid primary key default gen_random_uuid(),
  booking_id      uuid not null references bookings(id) on delete cascade,
  provider        payment_provider_t not null,
  provider_ref    text,
  amount          int not null,
  fee_amount      int not null default 0,
  status          payment_status_t not null default 'initiated',
  receipt_path    text,
  reviewed_by     uuid references profiles(id),
  reviewed_at     timestamptz,
  raw_webhook     jsonb,
  idempotency_key text not null unique,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table payments is 'المدفوعات. idempotency_key فريد — إعادة إرسال الويبهوك ما بتتحسبش مرتين.';
comment on column payments.receipt_path is 'صورة تحويل إنستا باي في دلو receipts.';

create index on payments (booking_id);
create index on payments (status);
create index on payments (provider_ref);

create trigger t_payments_updated before update on payments for each row execute function set_updated_at();

alter table bookings
  add constraint bookings_payment_fk foreign key (payment_id) references payments(id) on delete set null;

create table refunds (
  id           uuid primary key default gen_random_uuid(),
  payment_id   uuid not null references payments(id) on delete cascade,
  amount       int not null,
  kind         refund_type_t not null,
  reason       text,
  status       payment_status_t not null default 'initiated',
  provider_ref text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
comment on table refunds is 'الاستردادات — على البوابة أو كرصيد في المحفظة.';
create index on refunds (payment_id);
create trigger t_refunds_updated before update on refunds for each row execute function set_updated_at();

create table wallet_ledger (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  delta      int  not null,
  reason     ledger_reason_t not null,
  ref_id     uuid,
  note       text,
  created_at timestamptz not null default now()
);
comment on table wallet_ledger is 'دفتر المحفظة — المصدر الوحيد للرصيد. profiles.wallet_balance بيتحدث منه بمحفّز.';
create index on wallet_ledger (profile_id);

create or replace function fn_wallet_balance()
returns trigger
language plpgsql
as $$
begin
  update profiles
  set wallet_balance = (
    select coalesce(sum(delta), 0) from wallet_ledger
    where profile_id = coalesce(new.profile_id, old.profile_id)
  )
  where id = coalesce(new.profile_id, old.profile_id);
  return null;
end;
$$;
comment on function fn_wallet_balance() is 'بيعيد حساب رصيد المحفظة من الدفتر بعد أي حركة.';

create trigger t_wallet_balance after insert or update or delete on wallet_ledger
  for each row execute function fn_wallet_balance();

create table coupons (
  id                 uuid primary key default gen_random_uuid(),
  code               text not null unique,
  kind               coupon_kind_t not null,
  value              int  not null,
  max_uses           int,
  used_count         int  not null default 0,
  expires_at         timestamptz,
  first_booking_only boolean not null default false,
  created_at         timestamptz not null default now()
);
comment on table coupons is 'الكوبونات — percent بيتخزن كنسبة (10 = 10%)، وfixed بالقروش.';

create table referrals (
  id             uuid primary key default gen_random_uuid(),
  referrer_id    uuid not null references profiles(id) on delete cascade,
  referred_id    uuid not null unique references profiles(id) on delete cascade,
  booking_id     uuid references bookings(id) on delete set null,
  reward_paid_at timestamptz,
  created_at     timestamptz not null default now(),
  constraint referrals_no_self check (referrer_id <> referred_id)
);
comment on table referrals is 'الإحالات — المُحال بياخد 15% خصم، والمُحيل 100 جنيه رصيد بعد حضور المُحال فعلًا.';
create index on referrals (referrer_id);;
