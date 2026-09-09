-- طبقة «الشغل» — 3: الدوال والمحفّزات (WORK_PLAN §1.4).
-- كل دالة security definer عليها search_path ثابت، والتنفيذ مسحوب من public
-- وممنوح بالاسم (نفس نمط 0011 / 0028).

-- ===== رصيد الكارت =====
create or replace function fn_pass_balance(p_profile uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(wp.sessions_total - wp.sessions_used), 0)::int
  from work_passes wp
  where wp.profile_id = p_profile
    and wp.status = 'active'
    and (wp.expires_at is null or wp.expires_at > now());
$$;
comment on function fn_pass_balance(uuid) is 'الجلسات الباقية في كل كروت العضو النشطة وغير المنتهية.';
revoke execute on function fn_pass_balance(uuid) from public, anon, authenticated;
grant  execute on function fn_pass_balance(uuid) to service_role;

create or replace function fn_my_pass_balance()
returns int
language sql
stable
security definer
set search_path = public
as $$
  select fn_pass_balance(auth.uid());
$$;
comment on function fn_my_pass_balance() is 'نسخة العميل — رصيد كارتي أنا.';
revoke execute on function fn_my_pass_balance() from public, anon;
grant  execute on function fn_my_pass_balance() to authenticated, service_role;

-- ===== حارس أعمدة الكارت =====
-- RLS ما بتفرّقش بين الأعمدة. sessions_used/sessions_total بيتغيروا من
-- fn_redeem_pass/fn_revert_pass بس (بتشتغل بصلاحية المالك فـ current_user مش authenticated)،
-- والحالة والتواريخ من الاعتماد (fn_activate_pass) أو من صاحب payments.review.
create or replace function fn_guard_pass_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if current_user in ('anon', 'authenticated') then
    if new.sessions_used  is distinct from old.sessions_used
    or new.sessions_total is distinct from old.sessions_total then
      raise exception 'الخصم والرجوع عبر fn_redeem_pass / fn_revert_pass بس';
    end if;
    if (new.status     is distinct from old.status
     or new.starts_at  is distinct from old.starts_at
     or new.expires_at is distinct from old.expires_at
     or new.price_paid is distinct from old.price_paid
     or new.profile_id is distinct from old.profile_id)
    and not fn_has_permission('payments.review') then
      raise exception 'تفعيل الكارت وتعديله محتاج صلاحية payments.review';
    end if;
  end if;
  return new;
end;
$$;
comment on function fn_guard_pass_columns() is 'بيمنع تعديل رصيد الكارت مباشرة من المتصفح — الدوال بس.';
revoke execute on function fn_guard_pass_columns() from public, anon, authenticated;

drop trigger if exists t_guard_pass_columns on work_passes;
create trigger t_guard_pass_columns before update on work_passes
  for each row execute function fn_guard_pass_columns();

-- ===== fn_redeem_pass — خصم جلسة من أقدم كارت نشط =====
create or replace function fn_redeem_pass(p_booking_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b        bookings;
  s        sbotat;
  wp       work_passes;
  existing pass_redemptions;
  new_used int;
begin
  select * into b from bookings where id = p_booking_id for update;
  if not found then raise exception 'الحجز مش موجود'; end if;

  if auth.uid() is not null and b.profile_id <> auth.uid() and not fn_is_admin() then
    raise exception 'مش حجزك';
  end if;
  if b.status not in ('pending_payment', 'paid') then
    raise exception 'الحجز ده متلغي أو خلص';
  end if;

  select * into s from sbotat where id = b.sbota_id;
  if not s.is_work then raise exception 'الكارت لسبوطات الشغل بس'; end if;

  -- اتخصم قبل كده؟ نرجّع نفس النتيجة من غير خصم تاني
  select * into existing from pass_redemptions
  where booking_id = b.id and reverted_at is null;
  if found then
    return jsonb_build_object('ok', true, 'already', true,
                              'pass_id', existing.pass_id,
                              'remaining', fn_pass_balance(b.profile_id));
  end if;

  -- أقدم كارت نشط فيه رصيد
  select * into wp from work_passes
  where profile_id = b.profile_id
    and status = 'active'
    and sessions_used < sessions_total
    and (expires_at is null or expires_at > now())
  order by starts_at asc nulls last, created_at asc
  limit 1
  for update;
  if not found then raise exception 'مفيش رصيد في كارتك'; end if;

  new_used := wp.sessions_used + 1;
  update work_passes
  set sessions_used = new_used,
      status = case when new_used >= sessions_total then 'used_up'::pass_status_t else status end
  where id = wp.id;

  insert into pass_redemptions (pass_id, booking_id)
  values (wp.id, b.id)
  on conflict (booking_id) do update
    set pass_id = excluded.pass_id, redeemed_at = now(), reverted_at = null;

  -- الحجز بقى مدفوع بالكارت — لو كان مستني تحويل بيبقى paid فورًا (بيشغّل fn_booking_paid)
  update bookings
  set paid_with_pass = true,
      status = case when status = 'pending_payment' then 'paid'::booking_status_t else status end,
      expires_at = null
  where id = b.id;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'redeem_pass', 'work_passes', wp.id,
          jsonb_build_object('booking_id', b.id, 'sessions_used', new_used, 'sessions_total', wp.sessions_total));

  return jsonb_build_object('ok', true, 'pass_id', wp.id,
                            'remaining', wp.sessions_total - new_used);
end;
$$;
comment on function fn_redeem_pass(uuid) is 'بتخصم جلسة من أقدم كارت نشط لصاحب الحجز، بتسجّل في pass_redemptions، وبتعلّم الحجز paid_with_pass (وتخليه paid لو كان مستني دفع).';
revoke execute on function fn_redeem_pass(uuid) from public, anon;
grant  execute on function fn_redeem_pass(uuid) to authenticated, service_role;

-- ===== fn_revert_pass — رجوع الجلسة عند الإلغاء المبكر =====
-- p_force = true لما إحنا اللي لغينا: الجلسة بترجع مهما كان الوقت.
create or replace function fn_revert_pass(p_booking_id uuid, p_force boolean default false)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  red        pass_redemptions;
  b          bookings;
  s          sbotat;
  days       int;
  hours_left numeric;
begin
  select * into red from pass_redemptions
  where booking_id = p_booking_id and reverted_at is null
  for update;
  if not found then
    return jsonb_build_object('ok', true, 'reverted', false, 'reason', 'no_redemption');
  end if;

  select * into b from bookings where id = p_booking_id;
  if auth.uid() is not null and b.profile_id <> auth.uid() and not fn_is_admin() then
    raise exception 'مش حجزك';
  end if;

  select * into s from sbotat where id = b.sbota_id;
  select work_pass_refund_days into days from settings where id;
  hours_left := extract(epoch from (s.starts_at - now())) / 3600.0;

  if not coalesce(p_force, false) and hours_left < days * 24 then
    return jsonb_build_object('ok', true, 'reverted', false, 'reason', 'late',
                              'pass_id', red.pass_id);
  end if;

  update pass_redemptions set reverted_at = now() where id = red.id;

  update work_passes
  set sessions_used = greatest(sessions_used - 1, 0),
      status = case
                 when status = 'used_up' and (expires_at is null or expires_at > now())
                 then 'active'::pass_status_t
                 else status
               end
  where id = red.pass_id;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'revert_pass', 'work_passes', red.pass_id,
          jsonb_build_object('booking_id', p_booking_id, 'forced', coalesce(p_force, false)));

  return jsonb_build_object('ok', true, 'reverted', true, 'pass_id', red.pass_id);
end;
$$;
comment on function fn_revert_pass(uuid, boolean) is 'لو الإلغاء قبل work_pass_refund_days (أو p_force) بترجّع الجلسة للكارت وترجّعه active لو كان used_up. غير كده مفيش رجوع.';
revoke execute on function fn_revert_pass(uuid, boolean) from public, anon, authenticated;
grant  execute on function fn_revert_pass(uuid, boolean) to service_role;

-- ===== fn_activate_pass — عند اعتماد التحويل =====
create or replace function fn_activate_pass(p_payment_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  wp    work_passes;
  weeks int;
begin
  if auth.uid() is not null and not fn_is_admin() then
    raise exception 'ده للإدارة بس';
  end if;

  select * into wp from work_passes
  where payment_id = p_payment_id
     or id = (select pass_id from payments where id = p_payment_id)
  limit 1
  for update;
  if not found then raise exception 'مفيش كارت مربوط بالدفعة دي'; end if;
  if wp.status <> 'pending' then
    return jsonb_build_object('ok', true, 'already', true, 'pass_id', wp.id, 'status', wp.status);
  end if;

  select case wp.kind when 'four' then work_pass4_weeks else work_pass8_weeks end
  into weeks from settings where id;

  update work_passes
  set status = 'active',
      starts_at = now(),
      expires_at = now() + make_interval(weeks => coalesce(weeks, 6)),
      payment_id = coalesce(payment_id, p_payment_id)
  where id = wp.id;

  insert into notifications (profile_id, channel, template_key, payload)
  values (wp.profile_id, 'whatsapp', 'work_pass_activated',
          jsonb_build_object('pass_id', wp.id, 'n', wp.sessions_total));

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'activate_pass', 'work_passes', wp.id,
          jsonb_build_object('payment_id', p_payment_id, 'weeks', weeks));

  return jsonb_build_object('ok', true, 'pass_id', wp.id,
                            'expires_at', now() + make_interval(weeks => coalesce(weeks, 6)));
end;
$$;
comment on function fn_activate_pass(uuid) is 'الكارت يبقى active من دلوقتي لحد now()+الأسابيع من settings — بتتنادى من fn_approve_transfer أو من اللوحة.';
revoke execute on function fn_activate_pass(uuid) from public, anon;
grant  execute on function fn_activate_pass(uuid) to authenticated, service_role;

-- ===== fn_group_professions — «مين حاجز» بالمجال =====
create or replace function fn_group_professions(p_sbota_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s     sbotat;
  n     int;
  profs jsonb;
begin
  select * into s from sbotat where id = p_sbota_id;
  if not found then
    return jsonb_build_object('revealed', false, 'count', 0, 'professions', '[]'::jsonb);
  end if;

  select count(*) into n from bookings b
  where b.sbota_id = p_sbota_id and b.status in ('paid', 'attended');

  -- قبل الكشف: العدد بس
  if s.reveal_at is null or now() < s.reveal_at then
    return jsonb_build_object('revealed', false, 'count', n);
  end if;

  select coalesce(jsonb_agg(
           jsonb_build_object('key', x.key, 'name_ar', x.name_ar,
                              'icon_key', x.icon_key, 'color', x.color, 'n', x.n)
           order by x.n desc, x.sort_order asc), '[]'::jsonb)
  into profs
  from (
    select pr.key, pr.name_ar, pr.icon_key, pr.color, pr.sort_order, count(*)::int as n
    from bookings b
    join profiles p on p.id = b.profile_id
    join professions pr on pr.id = p.profession_id
    where b.sbota_id = p_sbota_id and b.status in ('paid', 'attended')
    group by pr.id, pr.key, pr.name_ar, pr.icon_key, pr.color, pr.sort_order
  ) x;

  return jsonb_build_object('revealed', true, 'count', n, 'professions', profs);
end;
$$;
comment on function fn_group_professions(uuid) is 'المجالات الموجودة في السبوطة من غير أي اسم — بعد reveal_at بس. قبلها {revealed:false,count}.';
revoke execute on function fn_group_professions(uuid) from public;
grant  execute on function fn_group_professions(uuid) to anon, authenticated, service_role;

-- ===== fn_work_collab_state — في تبادل ولا لأ =====
create or replace function fn_work_collab_state(p_other uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select case when exists (
    select 1 from work_affinity wa
    where wa.mutual_at is not null
      and ((wa.a_id = auth.uid() and wa.b_id = p_other)
        or (wa.b_id = auth.uid() and wa.a_id = p_other))
  ) then 'mutual' else 'none' end;
$$;
comment on function fn_work_collab_state(uuid) is 'بترجّع mutual أو none بس — عمرها ما بتكشف اختيار الطرف التاني. ده الوصول الوحيد لـ work_affinity.';
revoke execute on function fn_work_collab_state(uuid) from public, anon;
grant  execute on function fn_work_collab_state(uuid) to authenticated, service_role;

-- ===== fn_work_want — «عايز أشتغل مع فلان» =====
-- الكتابة الآمنة الوحيدة في work_affinity: بتكتب جهة اللي بينادي بس، من غير ما
-- يقرا الصف (مفيش سياسة select للأعضاء عن قصد). لو الصف موجود بتعدّل جهته بس،
-- وبكده محفّز التبادل بيشتغل لما التاني يعمل نفس الحاجة.
-- (upsert/update مباشر من المتصفح ما بيوصلش للصف الموجود لأن RLS بتطبّق سياسة
--  القراءة على الصفوف اللي الـ UPDATE بيدوّر عليها.)
create or replace function fn_work_want(p_other uuid, p_booking_id uuid default null, p_want boolean default true)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me   uuid := auth.uid();
  v_a  uuid; v_b uuid;
  mutual boolean;
begin
  if me is null then raise exception 'لازم تسجل دخول'; end if;
  if p_other is null or p_other = me then raise exception 'اختار حد تاني'; end if;

  if me < p_other then v_a := me; v_b := p_other; else v_a := p_other; v_b := me; end if;

  insert into work_affinity (a_id, b_id, a_wants_b, b_wants_a, met_in_booking_id)
  values (v_a, v_b, (v_a = me and p_want), (v_b = me and p_want), p_booking_id)
  on conflict (a_id, b_id) do update
    set a_wants_b = case when v_a = me then p_want else work_affinity.a_wants_b end,
        b_wants_a = case when v_b = me then p_want else work_affinity.b_wants_a end,
        met_in_booking_id = coalesce(work_affinity.met_in_booking_id, excluded.met_in_booking_id);

  select mutual_at is not null into mutual from work_affinity where a_id = v_a and b_id = v_b;
  return case when mutual then 'mutual' else 'none' end;
end;
$$;
comment on function fn_work_want(uuid, uuid, boolean) is 'بيسجّل رغبتي أنا بس في الشغل مع حد — وبيرجّع mutual/none زي fn_work_collab_state. ما بيكشفش اختيار الطرف التاني.';
revoke execute on function fn_work_want(uuid, uuid, boolean) from public, anon;
grant  execute on function fn_work_want(uuid, uuid, boolean) to authenticated, service_role;

-- ===== fn_mutual_work_affinity — محفّز التبادل =====
create or replace function fn_mutual_work_affinity()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.a_wants_b and new.b_wants_a and new.mutual_at is null then
    new.mutual_at := now();
    insert into notifications (profile_id, channel, template_key, payload) values
      (new.a_id, 'whatsapp', 'work_collab_match',
       jsonb_build_object('other_id', new.b_id, 'affinity_id', new.id)),
      (new.b_id, 'whatsapp', 'work_collab_match',
       jsonb_build_object('other_id', new.a_id, 'affinity_id', new.id));
  end if;
  return new;
end;
$$;
comment on function fn_mutual_work_affinity() is 'بيضبط mutual_at لما الطرفين يختاروا بعض وبيبعت work_collab_match للاتنين.';
revoke execute on function fn_mutual_work_affinity() from public, anon, authenticated;

drop trigger if exists t_mutual_work_affinity on work_affinity;
create trigger t_mutual_work_affinity before insert or update on work_affinity
  for each row execute function fn_mutual_work_affinity();

-- ===== fn_venue_report — حساب أسبوع لكل مكان شغل =====
create or replace function fn_venue_report(p_week_start date)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int := 0;
begin
  insert into venue_reports (venue_id, week_start, sessions_count, attendees_count, no_shows, avg_rating, amount_due)
  select
    v.id,
    p_week_start,
    count(distinct s.id)::int,
    count(b.id) filter (where b.status = 'attended')::int,
    count(b.id) filter (where b.status = 'no_show')::int,
    (select round(avg(r.score_venue)::numeric, 2)
       from reviews r join sbotat s2 on s2.id = r.sbota_id
      where s2.venue_id = v.id and s2.is_work and r.score_venue is not null
        and (s2.starts_at at time zone 'Africa/Cairo')::date >= p_week_start
        and (s2.starts_at at time zone 'Africa/Cairo')::date <  p_week_start + 7),
    (count(b.id) filter (where b.status = 'attended') * coalesce(wv.wholesale_seat_price, 0))::int
  from venues v
  join work_venues wv on wv.venue_id = v.id
  left join sbotat s on s.venue_id = v.id and s.is_work
                    and s.status not in ('draft', 'cancelled')
                    and (s.starts_at at time zone 'Africa/Cairo')::date >= p_week_start
                    and (s.starts_at at time zone 'Africa/Cairo')::date <  p_week_start + 7
  left join bookings b on b.sbota_id = s.id
  group by v.id, wv.wholesale_seat_price
  on conflict (venue_id, week_start) do update
    set sessions_count  = excluded.sessions_count,
        attendees_count = excluded.attendees_count,
        no_shows        = excluded.no_shows,
        avg_rating      = excluded.avg_rating,
        amount_due      = excluded.amount_due
    where venue_reports.paid_at is null;
  get diagnostics n = row_count;
  return n;
end;
$$;
comment on function fn_venue_report(date) is 'بتبني/تحدّث venue_reports لأسبوع (الاتنين→الحد بتوقيت القاهرة) لكل مكان شغل. الصفوف المدفوعة ما بتتلمسش.';
revoke execute on function fn_venue_report(date) from public, anon;
grant  execute on function fn_venue_report(date) to authenticated, service_role;

-- ===== fn_work_metrics — قراءة العرض المادي بالصلاحية (نفس fn_weekly_metrics) =====
create or replace function fn_work_metrics(p_weeks integer default 12)
returns table (
  week               date,
  work_sbotat        integer,
  work_bookings      integer,
  attended           integer,
  no_show_pct        numeric,
  pass_bookings      integer,
  passes_sold        integer,
  passes_revenue     integer,
  sessions_redeemed  integer,
  work_first_timers  integer,
  converted_30d      integer,
  conversion_30d_pct numeric,
  collab_mutual_pct  numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select m.week, m.work_sbotat, m.work_bookings, m.attended, m.no_show_pct,
         m.pass_bookings, m.passes_sold, m.passes_revenue, m.sessions_redeemed,
         m.work_first_timers, m.converted_30d, m.conversion_30d_pct, m.collab_mutual_pct
  from work_metrics m
  where fn_has_permission('settings.view')
  order by m.week desc
  limit greatest(1, least(coalesce(p_weeks, 12), 104));
$$;
comment on function fn_work_metrics(integer) is 'مؤشرات الشغل الأسبوعية لصاحب settings.view — وعلى رأسها conversion_30d_pct مقابل settings.work_conversion_target_pct.';
revoke execute on function fn_work_metrics(integer) from public, anon;
grant  execute on function fn_work_metrics(integer) to authenticated, service_role;

-- ===== fn_cancel_booking — امتداد: الحجز المدفوع بالكارت بيرجّع جلسة مش فلوس =====
-- نفس جسم 0019 بالحرف (بما فيه إصلاح الـ cast وإصلاح تصعيد p_by من 0010)
-- + فرع واحد: if b.paid_with_pass. سلوك الحجوزات العادية ما اتغيّرش.
create or replace function fn_cancel_booking(p_booking_id uuid, p_by text default 'user', p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b bookings; s sbotat; cfg settings;
  hours_left numeric; refund_amt int := 0;
  r_kind refund_kind_t := 'none'; r_type refund_type_t := 'gateway';
  pay payments; next_wait waitlist; is_first boolean; v_by text;
  pass_res jsonb := null;
begin
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

  if b.paid_with_pass then
    -- مدفوع بجلسة من الكارت: مفيش فلوس بترجع — الجلسة هي اللي بترجع (أو لأ)
    pass_res := fn_revert_pass(b.id, v_by = 'us');
    refund_amt := 0;
    if coalesce((pass_res ->> 'reverted')::boolean, false) then
      r_kind := 'full';
    else
      r_kind := 'none';
      if v_by = 'user' then
        insert into behavior_flags (profile_id, kind, booking_id, note)
        values (b.profile_id, 'late_cancel', b.id, 'إلغاء متأخر لسبوطة شغل — الجلسة ما رجعتش');
      end if;
    end if;
  elsif v_by = 'us' then
    refund_amt := b.price_paid; r_kind := 'full';
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
  set status = (case when v_by = 'us' then 'cancelled_by_us' else 'cancelled_by_user' end)::booking_status_t,
      cancelled_at = now(), cancel_reason = p_reason, refund_kind = r_kind
  where id = b.id;

  if refund_amt > 0 then
    select * into pay from payments where booking_id = b.id and status = 'succeeded' limit 1;
    if found then
      insert into refunds (payment_id, amount, kind, reason, status)
      values (pay.id, refund_amt, r_type, p_reason,
              (case when r_type = 'wallet_credit' then 'succeeded' else 'initiated' end)::payment_status_t);
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
          jsonb_build_object('refund', refund_amt, 'kind', r_kind, 'by', v_by,
                             'pass', pass_res));

  return jsonb_build_object('ok', true, 'refund', refund_amt, 'kind', r_kind,
                            'pass_reverted', coalesce((pass_res ->> 'reverted')::boolean, false));
end;
$$;
comment on function fn_cancel_booking(uuid, text, text) is 'سياسة الإلغاء من settings. «إحنا لغينا» للإدارة/الخادم بس. لو الحجز paid_with_pass بترجّع الجلسة للكارت (fn_revert_pass) بدل الفلوس.';
revoke execute on function fn_cancel_booking(uuid, text, text) from public, anon;
grant  execute on function fn_cancel_booking(uuid, text, text) to authenticated, service_role;

-- ===== fn_approve_transfer — امتداد: التحويل ممكن يكون لكارت =====
-- نفس جسم 0033 بالحرف + فرع pass_id في الأول. لو الدفعة لكارت ما بنلمسش bookings خالص.
create or replace function fn_approve_transfer(p_payment_id uuid, p_ok boolean, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  pay payments;
  bk  bookings;
  wp  work_passes;
begin
  if not fn_is_admin() then
    raise exception 'ده للإدارة بس';
  end if;

  select * into pay from payments where id = p_payment_id;
  if not found then raise exception 'الدفعة مش موجودة'; end if;
  if pay.status = 'succeeded' then
    return jsonb_build_object('ok', true, 'already', true);
  end if;

  -- ===== تحويل لكارت شغل =====
  if pay.pass_id is not null then
    update payments
    set status = (case when p_ok then 'succeeded' else 'failed' end)::payment_status_t,
        reviewed_by = auth.uid(),
        reviewed_at = now()
    where id = p_payment_id;

    if p_ok then
      perform fn_activate_pass(p_payment_id);
    else
      update work_passes
      set status = 'cancelled', note = coalesce(p_note, 'التحويل مظبطش')
      where id = pay.pass_id and status = 'pending';

      select * into wp from work_passes where id = pay.pass_id;
      insert into notifications (profile_id, channel, template_key, payload)
      values (wp.profile_id, 'whatsapp', 'transfer_rejected',
              jsonb_build_object('pass_id', wp.id, 'note', p_note));
    end if;

    insert into audit_log (actor_id, action, entity, entity_id, after)
    values (auth.uid(),
            case when p_ok then 'approve_transfer' else 'reject_transfer' end,
            'payments', p_payment_id,
            jsonb_build_object('pass', pay.pass_id, 'note', p_note));

    return jsonb_build_object('ok', true, 'approved', p_ok, 'pass_id', pay.pass_id);
  end if;

  -- ===== تحويل لحجز (نفس السلوك القديم بالحرف) =====
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
  'الإدارة بتأكد أو ترفض تحويل يدوي — لحجز (بيتحرّك معاه) أو لكارت شغل (fn_activate_pass، من غير ما نلمس bookings).';
revoke execute on function fn_approve_transfer(uuid, boolean, text) from public, anon;
grant  execute on function fn_approve_transfer(uuid, boolean, text) to authenticated, service_role;

-- ===== fn_build_work_matching(p_sbota_id) — المرحلة 5 =====
-- مطابقة work_v1 (WORK_PLAN §3): منفصلة عن fn_build_matching، نفس شكل
-- matching_runs.proposal، algorithm_version = 'work_v1'. بتتكتب مع
-- scripts/check-work-matching.ts في المرحلة 5 — مش هنا.
