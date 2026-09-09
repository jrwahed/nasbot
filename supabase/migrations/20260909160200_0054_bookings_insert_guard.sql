-- ============================================================================
-- 0054 — منع «الحجز المجاني المؤكد» (S4)
--
-- المشكلة: bookings_own_insert كانت بتتحقق من profile_id بس — مفيش شرط على
-- status ولا price_paid. فالعضو كان يقدر:
--   insert into bookings (sbota_id, profile_id, status, price_paid)
--   values ('<سبوطة مفتوحة>', auth.uid(), 'paid', 0)
-- = حجز مجاني مؤكد من غير ما يعدّي على /api/pay/create خالص (اللي بيشتغل
-- بمفتاح الخدمة ويحسب السعر على الخادم).
--
-- الحل (نفس نمط fn_guard_pass_columns على work_passes — 0042):
--   1) نضيّق سياسة الإدراج للعضو: profile_id = أنا و status = 'pending_payment'
--      و price_paid/discount/wallet_used = 0.
--   2) محفّز fn_guard_booking_columns before insert or update: لو اللي بينادي
--      anon/authenticated ومحاول يحط/يغيّر status أو أعمدة الفلوس أو الحضور
--      لحاجة غير الافتراضي، لازم يكون معاه bookings.edit — غير كده استثناء.
--
-- المسارات المشروعة ما بتتأثرش: /api/pay/create و fn_redeem_pass و
-- fn_approve_transfer و fn_booking_paid و job_work_recurring كلها بتشتغل
-- بمفتاح الخدمة أو security definer (current_user = postgres/service_role)
-- فالمحفّز بيعديها. وترقية قايمة الانتظار من اللوحة (status='pending_payment',
-- price_paid=0) بتعدّي كمان لأنها القيم الافتراضية — بس محتاجة سياسة الإدارة
-- (bookings.edit) علشان الصف لطرف تاني (بتتظبط في 0056).
-- ============================================================================

-- ===== 1) تضييق سياسة الإدراج للعضو =====
drop policy if exists bookings_own_insert on bookings;
create policy bookings_own_insert on bookings for insert
  with check (
    profile_id = auth.uid()
    and status = 'pending_payment'
    and price_paid = 0
    and discount = 0
    and wallet_used = 0
    and paid_with_pass = false
  );

-- ===== 2) محفّز حارس الأعمدة (نمط fn_guard_pass_columns) =====
create or replace function fn_guard_booking_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- بيتطبّق بس لو اللي بينادي عضو من المتصفح (anon/authenticated).
  -- الدوال definer والمسارات بمفتاح الخدمة current_user بتاعها postgres/service_role.
  if current_user in ('anon', 'authenticated') then
    if tg_op = 'INSERT' then
      -- إدراج بأي حاجة غير حجز مبدئي مجاني محتاج صلاحية bookings.edit
      if (new.status is distinct from 'pending_payment'::booking_status_t
       or new.price_paid  <> 0
       or new.discount    <> 0
       or new.wallet_used <> 0
       or new.paid_with_pass is distinct from false
       or new.checked_in_at is not null
       or new.cancelled_at  is not null
       or new.refund_kind   is not null
       or new.payment_id    is not null)
      and not fn_has_permission('bookings.edit') then
        raise exception 'العضو بيعمل حجز pending_payment مجاني بس — تأكيد الحجز والفلوس عبر مسارات الدفع';
      end if;
    elsif tg_op = 'UPDATE' then
      if (new.status      is distinct from old.status
       or new.price_paid  is distinct from old.price_paid
       or new.discount    is distinct from old.discount
       or new.wallet_used is distinct from old.wallet_used
       or new.paid_with_pass is distinct from old.paid_with_pass
       or new.checked_in_at is distinct from old.checked_in_at
       or new.cancelled_at  is distinct from old.cancelled_at
       or new.refund_kind   is distinct from old.refund_kind
       or new.payment_id    is distinct from old.payment_id)
      and not fn_has_permission('bookings.edit') then
        raise exception 'تعديل حالة الحجز أو فلوسه عبر الدوال/الإدارة بس';
      end if;
    end if;
  end if;
  return new;
end;
$$;
comment on function fn_guard_booking_columns() is
  'بيمنع العضو من المتصفح إنه يحط/يغيّر status أو الفلوس أو الحضور على الحجز مباشرة — الدوال ومسارات الدفع بس.';
revoke execute on function fn_guard_booking_columns() from public, anon, authenticated;

drop trigger if exists t_guard_booking_columns on bookings;
create trigger t_guard_booking_columns before insert or update on bookings
  for each row execute function fn_guard_booking_columns();
