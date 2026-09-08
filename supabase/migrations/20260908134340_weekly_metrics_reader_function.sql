-- weekly_metrics عرض مادي (materialized view)، والعروض دي ما بتقبلش RLS،
-- وصلاحياتها كانت لـ postgres و service_role بس. يعني اللوحة كانت بتقراه
-- وترجع فاضية على طول — الأرقام الثمانية دي عمرها ما ظهرت لحد.
--
-- بدل ما نفتح العرض لأي عضو مسجّل، بنقراه من دالة بتتأكد من الصلاحية الأول.

create or replace function public.fn_weekly_metrics(p_weeks integer default 12)
returns table (
  week         date,
  signups      integer,
  payers       integer,
  attended     integer,
  satisfaction numeric,
  repeat_30d   integer,
  referrals    integer,
  girls_pct    numeric,
  spend        integer
)
language sql
stable
security definer
set search_path to 'public'
as $$
  select m.week, m.signups, m.payers, m.attended, m.satisfaction,
         m.repeat_30d, m.referrals, m.girls_pct, m.spend
  from weekly_metrics m
  where fn_has_permission('settings.view')
  order by m.week desc
  limit greatest(1, least(coalesce(p_weeks, 12), 104))
$$;

revoke execute on function public.fn_weekly_metrics(integer) from public, anon;
grant execute on function public.fn_weekly_metrics(integer) to authenticated;;
