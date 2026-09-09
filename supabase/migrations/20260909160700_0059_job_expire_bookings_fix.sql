-- ============================================================================
-- 0059 — job_expire_bookings ما يلغيش حجز صورته تحت المراجعة (D6)
--
-- المشكلة: job_expire_bookings كان بيلغي أي pending_payment عدّى expires_at من
-- غير ما يبص على حالة الدفعة. فحجز العضو اللي حوّل فعلًا (payment = pending_review)
-- ولسه الإدارة ما راجعتوش (إجازة/ويكند) كان بيتلغي cancelled_by_us، وفلوسه واصلة،
-- ومفيش استرداد تلقائي. المكان بيروح لحد تاني.
--
-- الحل: نستثني أي حجز عليه دفعة في pending_review أو succeeded — ده معناه إن
-- العضو رفع تحويل مستني مراجعة (أو اتدفع خلاص). الحجز المهجور فعلًا (مفيش دفعة
-- مستنية) لسه بيتلغي عادي.
-- ============================================================================

create or replace function job_expire_bookings()
returns int
language sql
security definer
set search_path = public
as $$
  with done as (
    update bookings set status = 'cancelled_by_us', cancel_reason = 'مهلة الدفع خلصت'
    where status = 'pending_payment' and expires_at is not null and now() > expires_at
      and not exists (
        select 1 from payments p
        where p.booking_id = bookings.id
          and p.status in ('pending_review', 'succeeded')
      )
    returning 1
  ) select count(*)::int from done;
$$;

comment on function job_expire_bookings() is 'بيلغي الحجوزات اللي فاتت مهلة الدفع — إلا اللي عليها تحويل تحت المراجعة (pending_review) أو دفعة ناجحة.';
