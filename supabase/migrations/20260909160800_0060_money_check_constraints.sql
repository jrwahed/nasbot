-- ============================================================================
-- 0060 — قيود CHECK تمنع الفلوس السالبة (D7)
--
-- المشكلة: مفيش أي قيد يمنع مبلغ سالب. مثبت بـ INSERT: payments.amount=-500000
-- اتقبل، bookings(price_paid=-99999,...) اتقبل، sbotat.price=-100000 اتقبل،
-- coupons.value=-9999 اتقبل. غلطة صفر في اللوحة أو bug حساب بيقلب العلامة من
-- غير ما القاعدة تزعّق.
--
-- الحل: قيود CHECK على كل عمود فلوس. الجداول صغيرة فالقفل مش مشكلة. كل قيد
-- متحوط بـ if not exists علشان الملف يتعاد. (wallet_ledger.delta بيفضل باتجاهين
-- — ده مقصود، مش بنلمسه.)
-- ============================================================================

do $$
begin
  -- payments
  if not exists (select 1 from pg_constraint where conname = 'payments_amount_nonneg') then
    alter table payments add constraint payments_amount_nonneg check (amount >= 0);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'payments_fee_nonneg') then
    alter table payments add constraint payments_fee_nonneg check (fee_amount >= 0);
  end if;

  -- refunds
  if not exists (select 1 from pg_constraint where conname = 'refunds_amount_nonneg') then
    alter table refunds add constraint refunds_amount_nonneg check (amount >= 0);
  end if;

  -- bookings
  if not exists (select 1 from pg_constraint where conname = 'bookings_money_nonneg') then
    alter table bookings add constraint bookings_money_nonneg
      check (price_paid >= 0 and discount >= 0 and wallet_used >= 0);
  end if;

  -- work_passes
  if not exists (select 1 from pg_constraint where conname = 'work_passes_price_nonneg') then
    alter table work_passes add constraint work_passes_price_nonneg check (price_paid >= 0);
  end if;

  -- sbotat
  if not exists (select 1 from pg_constraint where conname = 'sbotat_money_nonneg') then
    alter table sbotat add constraint sbotat_money_nonneg
      check (price >= 0 and org_fee >= 0);
  end if;

  -- coupons (قيمة الخصم لازم تكون موجبة فعلًا)
  if not exists (select 1 from pg_constraint where conname = 'coupons_value_positive') then
    alter table coupons add constraint coupons_value_positive check (value > 0);
  end if;
end $$;
