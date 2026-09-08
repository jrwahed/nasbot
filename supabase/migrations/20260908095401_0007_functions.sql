create or replace function fn_sbota_count()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update profiles
  set sbota_count = (
    select count(*) from bookings
    where profile_id = new.profile_id and status = 'attended'
  )
  where id = new.profile_id;

  if new.status = 'no_show' then
    update profiles set no_show_count = no_show_count + 1 where id = new.profile_id;
  end if;
  return null;
end;
$$;
comment on function fn_sbota_count() is 'بيحدّث sbota_count و no_show_count بعد تغيير حالة الحجز.';

create trigger t_sbota_count after update of status on bookings
  for each row when (new.status in ('attended', 'no_show'))
  execute function fn_sbota_count();

create or replace function fn_profile_is_complete(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p.first_name is not null
     and p.birth_year is not null
     and p.gender is not null
     and p.area is not null
     and p.rules_accepted_at is not null
     and p.data_consent_at is not null
     and (select count(*) from profile_interests pi where pi.profile_id = p.id) = 5
  from profiles p where p.id = p_id;
$$;
comment on function fn_profile_is_complete(uuid) is 'الملف مكتمل = بياناته + 5 اهتمامات بالظبط + الموافقتين.';

create or replace function fn_can_book_mystery(p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select sbota_count from profiles where id = p_id), 0)
       >= (select mystery_min_sbotat from settings where id);
$$;
comment on function fn_can_book_mystery(uuid) is 'الغامضة مفتوحة للي راح سبوطتين على الأقل.';

create or replace function fn_can_book(p_id uuid, s_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p profiles;
  s sbotat;
  t sbota_templates;
  age int;
begin
  select * into p from profiles where id = p_id;
  if not found or p.deleted_at is not null then return 'الحساب مش موجود'; end if;
  if p.banned_at is not null then return 'الحساب موقوف'; end if;

  select * into s from sbotat where id = s_id;
  if not found then return 'السبوطة دي مش موجودة'; end if;
  if s.status not in ('open', 'draft') then return 'السبوطة مش مفتوحة للحجز'; end if;
  if s.booking_closes_at is not null and now() > s.booking_closes_at then
    return 'الحجز اتقفل';
  end if;

  select * into t from sbota_templates where id = s.template_id;

  age := extract(year from now())::int - coalesce(p.birth_year, 0);
  if age < 18 then return 'لازم تكون 18 سنة على الأقل'; end if;
  if t.overnight and age < 21 then return 'الرحلات بمبيت من 21 سنة'; end if;

  if s.girls_only and p.gender <> 'female' then return 'السبوطة دي بنات بس'; end if;
  if s.is_mystery and not fn_can_book_mystery(p_id) then return 'روح سبوطتين الأول'; end if;

  if exists (select 1 from bookings b
             where b.sbota_id = s_id and b.profile_id = p_id
               and b.status in ('pending_payment','paid','attended')) then
    return 'أنت حاجز السبوطة دي بالفعل';
  end if;

  return null;
end;
$$;
comment on function fn_can_book(uuid, uuid) is 'بيرجّع سبب المنع بالعامية أو null لو ينفع يحجز.';

create or replace function fn_who_booked(s_id uuid)
returns table (booked int, total int, girls int, boys int, age_min int, age_max int, first_timers int, returning_count int)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*)::int,
    (select capacity from sbotat where id = s_id)::int,
    count(*) filter (where p.gender = 'female')::int,
    count(*) filter (where p.gender = 'male')::int,
    min(extract(year from now())::int - p.birth_year)::int,
    max(extract(year from now())::int - p.birth_year)::int,
    count(*) filter (where p.sbota_count = 0)::int,
    count(*) filter (where p.sbota_count > 0)::int
  from bookings b join profiles p on p.id = b.profile_id
  where b.sbota_id = s_id and b.status in ('paid', 'attended');
$$;
comment on function fn_who_booked(uuid) is 'أرقام «مين حاجز لحد دلوقتي» — بدون أي اسم أو معرّف.';

create or replace function fn_is_mutual(other_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from pair_affinity
    where mutual_at is not null
      and ((a_id = auth.uid() and b_id = other_id)
        or (b_id = auth.uid() and a_id = other_id))
  );
$$;
comment on function fn_is_mutual(uuid) is 'هل في اختيار متبادل بيني وبين الشخص ده؟ ده الوصول الوحيد لـ pair_affinity.';

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
  if not fn_is_mutual(other_id) then
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
comment on function fn_open_one_on_one(uuid) is 'بيفتح غرفة خاصة بين اتنين اختاروا بعض — وبيرفض غير كده.';

create or replace function fn_soft_delete_profile()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if me is null then raise exception 'لازم تسجل دخول'; end if;
  update profiles
  set deleted_at = now(),
      first_name = null, email = null, avatar_path = null,
      wish_text = null, type_scores = null
  where id = me;
  insert into audit_log (actor_id, action, entity, entity_id)
  values (me, 'soft_delete', 'profiles', me);
end;
$$;
comment on function fn_soft_delete_profile() is 'إخفاء فوري للبيانات الشخصية، والمسح النهائي بعد 30 يوم عبر مهمة purge.';

create view sbotat_public
with (security_invoker = true)
as
select
  s.id, s.template_id, s.venue_id, s.captain_id,
  s.starts_at, s.ends_at, s.price, s.org_fee, s.capacity,
  s.status, s.girls_only, s.is_day, s.is_mystery,
  s.booking_closes_at, s.reveal_at,
  t.slug, t.name_ar, t.story_ar, t.kind, t.mood_ar,
  t.includes_ar, t.excludes_ar, t.duration_min, t.hero_photos, t.overnight,
  v.area,
  case when s.address_hidden then null else v.address end as address,
  case when s.address_hidden then null else v.map_lat end as map_lat,
  case when s.address_hidden then null else v.map_lng end as map_lng,
  v.name as venue_name
from sbotat s
join sbota_templates t on t.id = s.template_id
left join venues v on v.id = s.venue_id
where s.status in ('open', 'full', 'locked', 'running');

comment on view sbotat_public is 'السبوطات المعروضة للكل — من غير العنوان ولا الإحداثيات لو address_hidden.';

create or replace function fn_sbota_address(s_id uuid)
returns table (address text, map_lat numeric, map_lng numeric, venue_name text)
language sql
stable
security definer
set search_path = public
as $$
  select v.address, v.map_lat, v.map_lng, v.name
  from sbotat s join venues v on v.id = s.venue_id
  where s.id = s_id
    and exists (
      select 1 from bookings b
      where b.sbota_id = s_id and b.profile_id = auth.uid()
        and b.status in ('paid', 'attended')
    );
$$;
comment on function fn_sbota_address(uuid) is 'العنوان الكامل — بيرجّع صف فاضي لو المستخدم مش حاجز ودافع.';;
