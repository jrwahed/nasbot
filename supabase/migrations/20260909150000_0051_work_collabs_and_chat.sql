-- طبقة «الشغل» — 6: قايمة «شغالين معاك»، وفتح الشات لتبادل الشغل.
--
-- حاجتين طلعوا وإحنا بنوصّل الواجهة:
--
--  1. مفيش دالة بترجّع «مين بيني وبينهم تبادل شغل». الواجهة كانت بتبنيها من
--     حجوزاتي ← work_group_members ← نداء fn_work_collab_state لكل واحد
--     (٥ استعلامات + ١٨ نداء). وكمان ما كانتش بتعرف تسمّي السبوطة اللي
--     اتقابلوا فيها، لأن sbotat_public بتعرض المفتوح بس والتبادل بييجي من
--     سبوطة **خلصت**.
--
--  2. زرار «ابعتله» كان بيرفض. fn_open_one_on_one بتتحقق بـ fn_is_mutual
--     اللي بتقرا pair_affinity بس — فاتنين اختاروا بعض في سؤال **الشغل**
--     كان الشات بيتقفل في وشهم بالرغم إن التبادل حصل فعلًا.
--
-- الاتنين اتحلوا هنا. السرية زي ما هي: مفيش صف بيرجع إلا لو mutual_at
-- متحطوط، يعني الاختيار من طرف واحد عمره ما يبان.

/* ==================================================== 1) قايمة التبادل */

create or replace function fn_my_work_collabs()
returns table (
  profile_id       uuid,
  first_name       text,
  profession_ar    text,
  profession_icon  text,
  profession_color text,
  sbota_id         uuid,
  sbota_name_ar    text,
  venue_name       text,
  mutual_at        timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select
    o.id, o.first_name, pr.name_ar, pr.icon_key, pr.color,
    s.id, t.name_ar, v.name, wa.mutual_at
  from work_affinity wa
  join profiles o
    on o.id = case when wa.a_id = auth.uid() then wa.b_id else wa.a_id end
  left join professions      pr on pr.id = o.profession_id
  left join bookings         b  on b.id  = wa.met_in_booking_id
  left join sbotat           s  on s.id  = b.sbota_id and s.is_work
  left join sbota_templates  t  on t.id  = s.template_id
  left join venues           v  on v.id  = s.venue_id
  where wa.mutual_at is not null
    and (wa.a_id = auth.uid() or wa.b_id = auth.uid())
    and o.deleted_at is null
  order by wa.mutual_at desc
  limit 50;
$$;
comment on function fn_my_work_collabs() is
  'اللي بيني وبينهم تبادل شغل — التبادل بس، مفيش أي اختيار من طرف واحد. تاني وصول مسموح لـ work_affinity بعد fn_work_collab_state.';
revoke execute on function fn_my_work_collabs() from public, anon;
grant  execute on function fn_my_work_collabs() to authenticated, service_role;

/* ============================== 2) الشات يفتح لتبادل الشغل كمان */

create or replace function fn_open_one_on_one(other_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  rid uuid;
  me  uuid := auth.uid();
begin
  if me is null then raise exception 'لازم تسجل دخول'; end if;

  -- التبادل في سؤال «تشوف مين تاني» (pair_affinity) **أو** في سؤال
  -- «تشتغل مع مين» (work_affinity). الاتنين تبادل حقيقي بموافقة الطرفين.
  if not (fn_is_mutual(other_id) or fn_work_collab_state(other_id) = 'mutual') then
    raise exception 'الشات ده بيتفتح بس لما تكونوا اخترتوا بعض';
  end if;

  select r.id into rid
  from chat_rooms r
  where r.kind = 'one_on_one'
    and (select count(*) from chat_members m
         where m.room_id = r.id and m.profile_id in (me, other_id)) = 2
  limit 1;

  if rid is not null then return rid; end if;

  insert into chat_rooms (kind, opens_at) values ('one_on_one', now()) returning id into rid;
  insert into chat_members (room_id, profile_id) values (rid, me), (rid, other_id);
  return rid;
end;
$$;
comment on function fn_open_one_on_one(uuid) is
  'بيفتح غرفة خاصة بين اتنين اختاروا بعض — في التقييم العادي أو في سؤال الشغل — وبيرفض غير كده.';
revoke execute on function fn_open_one_on_one(uuid) from public, anon;
grant  execute on function fn_open_one_on_one(uuid) to authenticated;

/* ==================================================== 3) تأكيد سريع */

create or replace function test_work_collabs()
returns table (test text, result text)
language plpgsql
security definer
set search_path = public
as $$
begin
  test := '1 · fn_my_work_collabs موجودة ومقفولة على anon';
  if not exists (select 1 from pg_proc where proname = 'fn_my_work_collabs') then
    result := 'فشل — الدالة مش موجودة';
  elsif has_function_privilege('anon', 'fn_my_work_collabs()', 'execute') then
    result := 'فشل — anon يقدر ينفّذها';
  else
    result := 'نجح';
  end if;
  return next;

  test := '2 · fn_open_one_on_one بقت بتقبل تبادل الشغل';
  if (select prosrc from pg_proc where proname = 'fn_open_one_on_one') like '%fn_work_collab_state%' then
    result := 'نجح';
  else
    result := 'فشل — لسه بتتحقق من pair_affinity بس';
  end if;
  return next;
end;
$$;
comment on function test_work_collabs() is 'تأكيد سريع للهجرة 0051 — شغّلها مرة بعد اللزق.';
revoke execute on function test_work_collabs() from public, anon;
grant  execute on function test_work_collabs() to authenticated, service_role;
