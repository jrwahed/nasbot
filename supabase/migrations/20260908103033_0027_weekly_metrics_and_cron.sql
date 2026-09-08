-- ===== الأرقام الثمانية =====
create materialized view weekly_metrics as
with weeks as (
  select date_trunc('week', d)::date as week
  from generate_series(now() - interval '12 weeks', now(), interval '1 week') d
)
select
  w.week,
  (select count(*) from profiles p
     where date_trunc('week', p.created_at)::date = w.week and p.deleted_at is null)::int as signups,
  (select count(distinct b.profile_id) from bookings b
     where date_trunc('week', b.created_at)::date = w.week and b.status in ('paid','attended'))::int as payers,
  (select count(*) from bookings b
     where date_trunc('week', b.created_at)::date = w.week and b.status = 'attended')::int as attended,
  (select round(avg(r.score_sbota), 2) from reviews r
     where date_trunc('week', r.created_at)::date = w.week) as satisfaction,
  (select count(*) from bookings b
     where date_trunc('week', b.created_at)::date = w.week
       and b.profile_id in (
         select profile_id from bookings b2
         where b2.status = 'attended' and b2.created_at < w.week
       ))::int as repeat_30d,
  (select count(*) from referrals rf
     where date_trunc('week', rf.created_at)::date = w.week)::int as referrals,
  (select round(
      100.0 * count(*) filter (where p.gender = 'female') / nullif(count(*), 0), 1)
     from bookings b join profiles p on p.id = b.profile_id
     where date_trunc('week', b.created_at)::date = w.week and b.status in ('paid','attended')
   ) as girls_pct,
  (select coalesce(sum(ms.amount), 0) from marketing_spend ms
     where ms.week = w.week)::int as spend
from weeks w
order by w.week desc;

create unique index on weekly_metrics (week);
comment on materialized view weekly_metrics is 'الأرقام الثمانية الأسبوعية — بتتحدث يوميًا 3 صباحًا.';

create or replace function job_metrics()
returns void
language sql
security definer
set search_path = public
as $$
  refresh materialized view concurrently weekly_metrics;
$$;

-- ===== الجدولة =====
select cron.schedule('nasbot-reveal',    '*/10 * * * *', $$select job_reveal_due()$$);
select cron.schedule('nasbot-chats',     '*/10 * * * *', $$select job_close_chats()$$);
select cron.schedule('nasbot-expire',    '*/5  * * * *', $$select job_expire_bookings()$$);
select cron.schedule('nasbot-reminders', '*/15 * * * *', $$select job_reminders()$$);
select cron.schedule('nasbot-after',     '*/30 * * * *', $$select job_after_sbota()$$);
select cron.schedule('nasbot-winback',   '0 18 * * *',   $$select job_win_back()$$);
select cron.schedule('nasbot-metrics',   '0 3  * * *',   $$select job_metrics()$$);
select cron.schedule('nasbot-purge',     '0 4  * * *',   $$select job_purge()$$);

select jobname, schedule from cron.job order by jobname;;
