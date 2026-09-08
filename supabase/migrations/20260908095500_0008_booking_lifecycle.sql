-- لما الحجز يتدفع: يقفل السبوطة لو كملت، يخصم الرصيد، يسجل الإحالة، ويجدول التأكيد
create or replace function fn_booking_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cap       int;
  used      int;
  s         sbotat;
  ref_owner uuid;
begin
  select * into s from sbotat where id = new.sbota_id;
  cap := s.capacity;

  select count(*) into used from bookings
  where sbota_id = new.sbota_id and status in ('paid', 'attended');

  if used >= cap then
    update sbotat set status = 'full' where id = new.sbota_id and status = 'open';
  end if;

  -- خصم الرصيد المستخدم
  if new.wallet_used > 0 then
    insert into wallet_ledger (profile_id, delta, reason, ref_id, note)
    values (new.profile_id, -new.wallet_used, 'spend', new.id, 'خصم من الرصيد على حجز');
  end if;

  -- تسجيل الإحالة (المكافأة بتتصرف بعد الحضور مش دلوقتي)
  if new.referral_code_used is not null then
    select id into ref_owner from profiles
    where referral_code = new.referral_code_used and id <> new.profile_id;

    if ref_owner is not null then
      insert into referrals (referrer_id, referred_id, booking_id)
      values (ref_owner, new.profile_id, new.id)
      on conflict (referred_id) do nothing;
    end if;
  end if;

  -- إشعار التأكيد
  insert into notifications (profile_id, channel, template_key, payload)
  values (new.profile_id, 'whatsapp', 'booking_confirmed',
          jsonb_build_object('booking_id', new.id, 'sbota_id', new.sbota_id));

  return null;
end;
$$;
comment on function fn_booking_paid() is 'بعد الدفع: يقفل السبوطة لو كملت · يخصم الرصيد · يسجل الإحالة · يجدول رسالة التأكيد.';

create trigger t_booking_paid after update of status on bookings
  for each row when (new.status = 'paid' and old.status is distinct from 'paid')
  execute function fn_booking_paid();

-- مكافأة الإحالة بعد الحضور فعلًا
create or replace function fn_referral_reward()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  r referrals;
  amt int;
begin
  select * into r from referrals
  where referred_id = new.profile_id and reward_paid_at is null;
  if not found then return null; end if;

  select referral_reward into amt from settings where id;

  insert into wallet_ledger (profile_id, delta, reason, ref_id, note)
  values (r.referrer_id, amt, 'referral_reward', r.id, 'مكافأة إحالة بعد الحضور');

  update referrals set reward_paid_at = now() where id = r.id;
  return null;
end;
$$;
comment on function fn_referral_reward() is 'المُحيل بياخد رصيده بعد ما المُحال يحضر فعلًا — مش عند الحجز.';

create trigger t_referral_reward after update of status on bookings
  for each row when (new.status = 'attended' and old.status is distinct from 'attended')
  execute function fn_referral_reward();

-- الإلغاء: بيطبق النسب من settings
create or replace function fn_cancel_booking(p_booking_id uuid, p_by text default 'user', p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b            bookings;
  s            sbotat;
  cfg          settings;
  hours_left   numeric;
  refund_amt   int := 0;
  r_kind       refund_kind_t := 'none';
  r_type       refund_type_t := 'gateway';
  pay          payments;
  next_wait    waitlist;
  is_first     boolean;
begin
  select * into b from bookings where id = p_booking_id;
  if not found then raise exception 'الحجز مش موجود'; end if;

  if p_by = 'user' and b.profile_id <> auth.uid() then
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

  if p_by = 'us' then
    -- إحنا لغينا: كامل + رصيد اعتذار
    refund_amt := b.price_paid;
    r_kind := 'full';
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
  set status = case when p_by = 'us' then 'cancelled_by_us' else 'cancelled_by_user' end,
      cancelled_at = now(), cancel_reason = p_reason, refund_kind = r_kind
  where id = b.id;

  if refund_amt > 0 then
    select * into pay from payments where booking_id = b.id and status = 'succeeded' limit 1;
    if found then
      insert into refunds (payment_id, amount, kind, reason, status)
      values (pay.id, refund_amt, r_type, p_reason,
              case when r_type = 'wallet_credit' then 'succeeded' else 'initiated' end);
    end if;
    if r_type = 'wallet_credit' then
      insert into wallet_ledger (profile_id, delta, reason, ref_id, note)
      values (b.profile_id, refund_amt, 'refund_credit', b.id, 'رصيد بدل استرداد');
    end if;
  end if;

  -- المكان فضي: نرجّع السبوطة مفتوحة ونرقّي أول واحد في الانتظار
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
          jsonb_build_object('refund', refund_amt, 'kind', r_kind, 'by', p_by));

  return jsonb_build_object('ok', true, 'refund', refund_amt, 'kind', r_kind);
end;
$$;
comment on function fn_cancel_booking(uuid, text, text) is 'سياسة الإلغاء بالنسب اللي في settings + ترقية قائمة الانتظار.';;
