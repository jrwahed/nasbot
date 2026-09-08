-- حركة الفلوس لازم تعدّي من دالة على الخادم، مش insert من المتصفح.
-- كده الشروط (مبلغ الاسترداد ما يزيدش عن المدفوع، والرصيد ما ينزلش تحت الصفر)
-- بتتنفّذ في القاعدة نفسها — مش في الواجهة اللي أي حد يقدر يلفّ حواليها.
--
-- refunds و wallet_ledger عندهم سياسة قراءة بس، ومحدش يقدر يكتب فيهم
-- غير من الدالتين دول.

create or replace function public.fn_issue_refund(
  p_payment_id uuid,
  p_amount     integer,
  p_kind       refund_type_t,
  p_reason     text
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_payment   payments%rowtype;
  v_refunded  integer;
  v_profile   uuid;
  v_refund_id uuid;
begin
  if not fn_has_permission('payments.refund') then
    raise exception 'مش من صلاحيتك ترجّع فلوس';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'المبلغ لازم يكون أكبر من صفر';
  end if;

  if coalesce(btrim(p_reason), '') = '' then
    raise exception 'لازم تكتب سبب الاسترداد';
  end if;

  select * into v_payment from payments where id = p_payment_id;
  if not found then
    raise exception 'الدفعة دي مش موجودة';
  end if;

  if v_payment.status <> 'succeeded' then
    raise exception 'الدفعة دي مش متأكدة أصلًا';
  end if;

  -- اللي اترجّع قبل كده — ما ينفعش نرجّع أكتر من المدفوع
  select coalesce(sum(amount), 0) into v_refunded
  from refunds where payment_id = p_payment_id and status <> 'failed';

  if v_refunded + p_amount > v_payment.amount then
    raise exception 'المبلغ ده أكبر من الباقي في الدفعة (المدفوع %، اترجّع %)',
      v_payment.amount, v_refunded;
  end if;

  insert into refunds (payment_id, amount, kind, reason, status)
  values (p_payment_id, p_amount, p_kind, btrim(p_reason), 'succeeded')
  returning id into v_refund_id;

  -- لو الاسترداد رصيد في المحفظة، بنزوّده على طول
  if p_kind = 'wallet_credit' then
    select b.profile_id into v_profile
    from bookings b where b.id = v_payment.booking_id;

    if v_profile is not null then
      insert into wallet_ledger (profile_id, delta, reason, ref_id, note)
      values (v_profile, p_amount, 'refund', v_refund_id, btrim(p_reason));
    end if;
  end if;

  insert into audit_log (action, entity, entity_id, after)
  values ('refund.issue', 'refunds', v_refund_id,
          jsonb_build_object('payment_id', p_payment_id, 'amount', p_amount,
                             'kind', p_kind, 'reason', btrim(p_reason)));

  return v_refund_id;
end;
$$;

create or replace function public.fn_wallet_adjust(
  p_profile_id uuid,
  p_delta      integer,
  p_reason     ledger_reason_t,
  p_note       text
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_balance integer;
  v_id      uuid;
begin
  if not fn_has_permission('wallet.credit') then
    raise exception 'مش من صلاحيتك تعدّل المحفظة';
  end if;

  if p_delta is null or p_delta = 0 then
    raise exception 'المبلغ لازم يكون موجب أو سالب، مش صفر';
  end if;

  if coalesce(btrim(p_note), '') = '' then
    raise exception 'لازم تكتب سبب التعديل';
  end if;

  select coalesce(sum(delta), 0) into v_balance
  from wallet_ledger where profile_id = p_profile_id;

  if v_balance + p_delta < 0 then
    raise exception 'الرصيد مش هيكفي — الرصيد دلوقتي %', v_balance;
  end if;

  insert into wallet_ledger (profile_id, delta, reason, note)
  values (p_profile_id, p_delta, p_reason, btrim(p_note))
  returning id into v_id;

  insert into audit_log (action, entity, entity_id, after)
  values ('wallet.adjust', 'wallet_ledger', v_id,
          jsonb_build_object('profile_id', p_profile_id, 'delta', p_delta,
                             'reason', p_reason, 'note', btrim(p_note)));

  return v_id;
end;
$$;

revoke execute on function public.fn_issue_refund(uuid, integer, refund_type_t, text) from public, anon;
revoke execute on function public.fn_wallet_adjust(uuid, integer, ledger_reason_t, text) from public, anon;
grant execute on function public.fn_issue_refund(uuid, integer, refund_type_t, text) to authenticated;
grant execute on function public.fn_wallet_adjust(uuid, integer, ledger_reason_t, text) to authenticated;;
