-- 1) تثبيت search_path على دوال المحفّزات (كانت قابلة للحقن)
alter function set_updated_at()      set search_path = public;
alter function fn_sbota_timings()    set search_path = public;
alter function fn_capacity_guard()   set search_path = public;
alter function fn_wallet_balance()   set search_path = public;
alter function fn_mutual_affinity()  set search_path = public;
alter function fn_ratings_rollup()   set search_path = public;

-- 2) إصلاح ثغرة تصعيد صلاحية في fn_cancel_booking
--    كانت بتصدّق p_by الجاي من العميل، يعني أي حد يبعت p_by='us'
--    وياخد استرداد كامل + رصيد اعتذار. دلوقتي مصدر p_by هو الخادم/الإدارة بس.
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
  v_by         text;
begin
  -- «إحنا لغينا» مسموحة للإدارة أو لمفتاح الخدمة بس
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

  if v_by = 'us' then
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
  set status = case when v_by = 'us' then 'cancelled_by_us' else 'cancelled_by_user' end,
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
          jsonb_build_object('refund', refund_amt, 'kind', r_kind, 'by', v_by));

  return jsonb_build_object('ok', true, 'refund', refund_amt, 'kind', r_kind);
end;
$$;
comment on function fn_cancel_booking(uuid, text, text) is 'سياسة الإلغاء من settings. «إحنا لغينا» للإدارة/الخادم بس — العميل دايمًا user.';

-- 3) نسخ آمنة للعميل: بتستخدم auth.uid() بدل ما تاخد معرّف من بره
create or replace function fn_can_i_book(s_id uuid)
returns text language sql stable security definer set search_path = public as $$
  select fn_can_book(auth.uid(), s_id);
$$;
comment on function fn_can_i_book(uuid) is 'نسخة العميل — بتشتغل على المستخدم الحالي بس.';

create or replace function fn_can_i_book_mystery()
returns boolean language sql stable security definer set search_path = public as $$
  select fn_can_book_mystery(auth.uid());
$$;
comment on function fn_can_i_book_mystery() is 'نسخة العميل — الغامضة للمستخدم الحالي.';

create or replace function fn_is_my_profile_complete()
returns boolean language sql stable security definer set search_path = public as $$
  select fn_profile_is_complete(auth.uid());
$$;
comment on function fn_is_my_profile_complete() is 'نسخة العميل — اكتمال ملفي أنا.';

-- 4) قفل التنفيذ: الافتراضي ممنوع، والمسموح بس هو المذكور تحت
revoke execute on all functions in schema public from anon, authenticated;

-- دوال العميل الآمنة (كلها بتشتغل على auth.uid() أو بترجّع مجمّعات بدون هوية)
grant execute on function fn_who_booked(uuid)        to anon, authenticated;
grant execute on function fn_is_mutual(uuid)         to authenticated;
grant execute on function fn_open_one_on_one(uuid)   to authenticated;
grant execute on function fn_sbota_address(uuid)     to authenticated;
grant execute on function fn_soft_delete_profile()   to authenticated;
grant execute on function fn_cancel_booking(uuid, text, text) to authenticated;
grant execute on function fn_can_i_book(uuid)        to authenticated;
grant execute on function fn_can_i_book_mystery()    to authenticated;
grant execute on function fn_is_my_profile_complete() to authenticated;
grant execute on function fn_is_admin()              to authenticated;
grant execute on function fn_my_captain_id()         to authenticated;
grant execute on function fn_is_my_sbota_revealed(uuid) to authenticated;

-- 5) otp_codes: مفيش سياسة عن قصد + منع الوصول صراحة
revoke all on otp_codes from anon, authenticated;
comment on table otp_codes is 'رموز التحقق — مخزنة كهاش. مفيش سياسة RLS عن قصد: الوصول من الخادم بمفتاح الخدمة بس.';;
