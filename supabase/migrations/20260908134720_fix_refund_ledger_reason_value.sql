-- تكملة: نصلّح السبب اللي بيتكتب في المحفظة وقت الاسترداد.
-- (اتفصلت عن الهجرة اللي فاتت لأن القيمة الجديدة في enum ما تنفعش تتستعمل
--  في نفس المعاملة اللي ضافتها.)

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

  select coalesce(sum(amount), 0) into v_refunded
  from refunds where payment_id = p_payment_id and status <> 'failed';

  if v_refunded + p_amount > v_payment.amount then
    raise exception 'المبلغ ده أكبر من الباقي في الدفعة (المدفوع %، اترجّع %)',
      v_payment.amount, v_refunded;
  end if;

  insert into refunds (payment_id, amount, kind, reason, status)
  values (p_payment_id, p_amount, p_kind, btrim(p_reason), 'succeeded')
  returning id into v_refund_id;

  if p_kind = 'wallet_credit' then
    select b.profile_id into v_profile
    from bookings b where b.id = v_payment.booking_id;

    if v_profile is not null then
      -- السبب الصح في ledger_reason_t هو refund_credit
      insert into wallet_ledger (profile_id, delta, reason, ref_id, note)
      values (v_profile, p_amount, 'refund_credit', v_refund_id, btrim(p_reason));
    end if;
  end if;

  insert into audit_log (action, entity, entity_id, after)
  values ('refund.issue', 'refunds', v_refund_id,
          jsonb_build_object('payment_id', p_payment_id, 'amount', p_amount,
                             'kind', p_kind, 'reason', btrim(p_reason)));

  return v_refund_id;
end;
$$;

revoke execute on function public.fn_issue_refund(uuid, integer, refund_type_t, text) from public, anon;
grant execute on function public.fn_issue_refund(uuid, integer, refund_type_t, text) to authenticated;;
