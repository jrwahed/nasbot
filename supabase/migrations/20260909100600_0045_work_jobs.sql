-- طبقة «الشغل» — 6: المهام المجدولة على pg_cron (WORK_PLAN §1.5 و§0 #1).
-- نفس نمط job_* في 0026/0027. كلها بترجّع عدد اللي اتعمل.

-- ===== job_work_recurring — «يومك الثابت» =====
-- لكل صف نشط مش موقوف: أقرب موعد لليوم ده جوه نافذة work_recurring_lead_days
-- وما اتولّدش قبل كده → ندوّر على سبوطة شغل معلنة (قالب + مكان + يوم):
--   · auto_book وفيه رصيد كارت → حجز paid بالكارت + fn_redeem_pass + work_recurring_booked
--   · مفيش رصيد → work_no_pass_balance من غير حجز
--   · مفيش سبوطة معلنة → تنبيه للإدارة في provider_alerts (نمط اللوحة الموجود)
create or replace function job_work_recurring()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  cfg      settings;
  r        record;
  sb       sbotat;
  today    date;
  target   date;
  bal      int;
  bid      uuid;
  old_bid  uuid;
  old_st   booking_status_t;
  n        int := 0;
  day_ar   text;
begin
  select * into cfg from settings where id;
  today := (now() at time zone 'Africa/Cairo')::date;

  for r in
    select rb.* from recurring_bookings rb
    where rb.status = 'active'
      and (rb.pause_until is null or rb.pause_until < today)
      and (rb.active_until is null or rb.active_until >= today)
  loop
    -- أقرب تاريخ بنفس اليوم من النهارده (0=الحد … 6=السبت)
    target := today + ((r.weekday - extract(dow from today)::int + 7) % 7);

    if target > today + cfg.work_recurring_lead_days then continue; end if;
    if r.last_generated_for is not null and r.last_generated_for >= target then continue; end if;
    if r.active_from > target then continue; end if;
    if r.active_until is not null and r.active_until < target then continue; end if;

    -- السبوطة المطابقة: قالب + مكان (لو محدد) + نفس اليوم — الأقرب لوقته المفضل
    select s.* into sb from sbotat s
    where s.is_work and s.status = 'open'
      and s.template_id = r.template_id
      and (r.venue_id is null or s.venue_id = r.venue_id)
      and (s.starts_at at time zone 'Africa/Cairo')::date = target
      and (s.booking_closes_at is null or now() < s.booking_closes_at)
    order by abs(extract(epoch from (
              (s.starts_at at time zone 'Africa/Cairo')::time - coalesce(r.time_of_day, '10:00'::time))))
    limit 1;

    if not found then
      -- تنبيه للإدارة مرة واحدة لكل (مكان، تاريخ)
      insert into provider_alerts (venue_id, reason, note)
      select r.venue_id, 'work_recurring_no_sbota',
             'مفيش سبوطة شغل معلنة يوم ' || target::text || ' لليوم الثابت ' || r.id::text
      where not exists (
        select 1 from provider_alerts pa
        where pa.reason = 'work_recurring_no_sbota' and pa.resolved_at is null
          and pa.venue_id is not distinct from r.venue_id
          and pa.note like '%' || target::text || '%'
      );
      continue;
    end if;

    -- مش عايز حجز تلقائي: نعلّم إننا عدّينا على الموعد ده وخلاص
    if not r.auto_book then
      update recurring_bookings set last_generated_for = target where id = r.id;
      continue;
    end if;

    -- حاجز خلاص؟
    select b.id, b.status into old_bid, old_st from bookings b
    where b.sbota_id = sb.id and b.profile_id = r.profile_id;
    if old_bid is not null and old_st in ('pending_payment', 'paid', 'attended') then
      update recurring_bookings set last_generated_for = target where id = r.id;
      continue;
    end if;

    bal := fn_pass_balance(r.profile_id);
    if bal <= 0 then
      insert into notifications (profile_id, channel, template_key, payload)
      values (r.profile_id, 'whatsapp', 'work_no_pass_balance',
              jsonb_build_object('sbota_id', sb.id, 'recurring_id', r.id, 'day', target));
      update recurring_bookings set last_generated_for = target where id = r.id;
      continue;
    end if;

    begin
      if old_bid is not null then
        -- كان ملغي على نفس السبوطة — نرجّعه بدل ما نكسر قيد (sbota_id, profile_id)
        update bookings
        set status = 'paid', paid_with_pass = true, price_paid = 0,
            cancelled_at = null, cancel_reason = null, refund_kind = null, expires_at = null
        where id = old_bid;
        bid := old_bid;
      else
        insert into bookings (sbota_id, profile_id, status, price_paid, paid_with_pass)
        values (sb.id, r.profile_id, 'paid', 0, true)
        returning id into bid;
      end if;

      perform fn_redeem_pass(bid);

      select v.name into day_ar from venues v where v.id = sb.venue_id;
      insert into notifications (profile_id, channel, template_key, payload)
      values (r.profile_id, 'whatsapp', 'work_recurring_booked',
              jsonb_build_object('booking_id', bid, 'sbota_id', sb.id, 'recurring_id', r.id,
                                 'day', target, 'venue', day_ar));

      update recurring_bookings set last_generated_for = target where id = r.id;
      n := n + 1;
    exception when others then
      -- السعة كملت أو الرصيد اتسحب في نفس اللحظة — نسيبها للإدارة
      insert into provider_alerts (venue_id, reason, note)
      values (sb.venue_id, 'work_recurring_failed',
              left(sqlerrm, 200) || ' — اليوم الثابت ' || r.id::text || ' يوم ' || target::text);
    end;
  end loop;

  return n;
end;
$$;
comment on function job_work_recurring() is 'بتولّد حجوزات اليوم الثابت قبلها بـ settings.work_recurring_lead_days — بالكارت لو فيه رصيد، وإلا إشعار.';
revoke execute on function job_work_recurring() from public, anon, authenticated;
grant  execute on function job_work_recurring() to service_role;

-- ===== job_work_pass_reminders — الكارت قرّب يخلص / ينتهي =====
create or replace function job_work_pass_reminders()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int := 0; m int := 0;
begin
  -- اللي انتهت صلاحيته
  update work_passes set status = 'expired'
  where status = 'active' and expires_at is not null and expires_at < now();

  -- فاضل يوم واحد
  insert into notifications (profile_id, channel, template_key, payload)
  select wp.profile_id, 'whatsapp', 'work_pass_low',
         jsonb_build_object('pass_id', wp.id)
  from work_passes wp
  where wp.status = 'active'
    and wp.sessions_total - wp.sessions_used = 1
    and not exists (
      select 1 from notifications nt
      where nt.template_key = 'work_pass_low' and nt.payload ->> 'pass_id' = wp.id::text
    );
  get diagnostics n = row_count;

  -- بينتهي خلال أسبوع وفيه رصيد
  insert into notifications (profile_id, channel, template_key, payload)
  select wp.profile_id, 'whatsapp', 'work_pass_expiring',
         jsonb_build_object('pass_id', wp.id,
                            'days', ceil(extract(epoch from (wp.expires_at - now())) / 86400.0)::int,
                            'n', wp.sessions_total - wp.sessions_used)
  from work_passes wp
  where wp.status = 'active'
    and wp.expires_at is not null
    and wp.expires_at between now() and now() + interval '7 days'
    and wp.sessions_total - wp.sessions_used > 0
    and not exists (
      select 1 from notifications nt
      where nt.template_key = 'work_pass_expiring' and nt.payload ->> 'pass_id' = wp.id::text
    );
  get diagnostics m = row_count;

  return n + m;
end;
$$;
comment on function job_work_pass_reminders() is 'بيعلّم الكروت المنتهية expired وبيبعت work_pass_low و work_pass_expiring مرة واحدة لكل كارت.';
revoke execute on function job_work_pass_reminders() from public, anon, authenticated;
grant  execute on function job_work_pass_reminders() to service_role;

-- ===== job_work_venue_reports — كل اتنين: حساب الأسبوع اللي فات =====
create or replace function job_work_venue_reports()
returns int
language sql
security definer
set search_path = public
as $$
  select fn_venue_report(
    (date_trunc('week', ((now() at time zone 'Africa/Cairo')::date - 7)::timestamp))::date
  );
$$;
comment on function job_work_venue_reports() is 'بتبني venue_reports للأسبوع اللي فات (من الاتنين) لكل مكان شغل.';
revoke execute on function job_work_venue_reports() from public, anon, authenticated;
grant  execute on function job_work_venue_reports() to service_role;

-- ===== job_work_metrics — تجديد العرض المادي =====
create or replace function job_work_metrics()
returns void
language sql
security definer
set search_path = public
as $$
  refresh materialized view concurrently work_metrics;
$$;
comment on function job_work_metrics() is 'بتجدّد work_metrics — بعد job_metrics بربع ساعة.';
revoke execute on function job_work_metrics() from public, anon, authenticated;
grant  execute on function job_work_metrics() to service_role;

-- ===== الجدولة (UTC — 7 = 9 القاهرة) =====
-- cron.schedule بالاسم بتحدّث الموجود، بس بنحرسها علشان الملف يتشغّل أكتر من مرة من غير ضجيج.
select cron.schedule('nasbot-work-recurring', '0 7 * * *',  $$select job_work_recurring()$$)
where not exists (select 1 from cron.job where jobname = 'nasbot-work-recurring');

select cron.schedule('nasbot-work-passes',    '0 8 * * *',  $$select job_work_pass_reminders()$$)
where not exists (select 1 from cron.job where jobname = 'nasbot-work-passes');

select cron.schedule('nasbot-work-venues',    '0 6 * * 1',  $$select job_work_venue_reports()$$)
where not exists (select 1 from cron.job where jobname = 'nasbot-work-venues');

select cron.schedule('nasbot-work-metrics',   '15 3 * * *', $$select job_work_metrics()$$)
where not exists (select 1 from cron.job where jobname = 'nasbot-work-metrics');
