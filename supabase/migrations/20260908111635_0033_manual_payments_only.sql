-- أرقام التحويل في الإعدادات علشان تتغير من لوحة الإدارة من غير نشر
alter table settings add column if not exists vodafone_number text not null default '010 0000 0000';
alter table settings add column if not exists instapay_handle text not null default 'nasbot@instapay';
alter table settings add column if not exists manual_review_hours int not null default 2;

comment on column settings.vodafone_number is 'رقم فودافون كاش اللي بيتحوّل عليه.';
comment on column settings.instapay_handle is 'معرّف إنستا باي.';
comment on column settings.manual_review_hours is 'الوعد المعروض للمستخدم: بنراجع التحويل خلال كام ساعة.';

-- مفيش بوابة دلوقتي
update settings set payment_provider = 'instapay';

comment on column settings.payment_provider is
  'يدوي بس دلوقتي (instapay/vodafone_cash). البوابات (paymob/kashier) لسه مش مفعّلة.';

-- ===== تأكيد التحويل من الإدارة =====
-- بيأكد الدفعة وبيخلي الحجز paid في خطوة واحدة، وبيتسجل في audit_log.
create or replace function fn_approve_transfer(p_payment_id uuid, p_ok boolean, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pay payments;
  bk  bookings;
begin
  if not fn_is_admin() then
    raise exception 'ده للإدارة بس';
  end if;

  select * into pay from payments where id = p_payment_id;
  if not found then raise exception 'الدفعة مش موجودة'; end if;
  if pay.status = 'succeeded' then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

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
  'الإدارة بتأكد أو ترفض تحويل يدوي — وبتحرّك الحجز معاه في نفس العملية.';

revoke execute on function fn_approve_transfer(uuid, boolean, text) from public, anon;
grant  execute on function fn_approve_transfer(uuid, boolean, text) to authenticated;

-- قوالب رسائل التحويل اليدوي
insert into notification_templates (key, channel, body_ar, provider_template_id) values
  ('transfer_received','whatsapp','وصلنا تحويلك لـ {{1}}. بنراجعه وهنأكدلك خلال ساعتين.','nasbot_transfer_received'),
  ('transfer_rejected','whatsapp','للأسف التحويل مظبطش. مفيش حاجة اتخصمت منك — كلمنا ونظبطها.','nasbot_transfer_rejected')
on conflict (key) do nothing;;
