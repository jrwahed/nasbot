create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ===== الكشف: بينشئ المجموعات والغرف وبيبعت الرسالة =====
create or replace function fn_reveal(p_sbota uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  s        sbotat;
  run      matching_runs;
  grp      jsonb;
  gid      uuid;
  rid      uuid;
  member   jsonb;
  idx      int := 0;
  made     int := 0;
begin
  select * into s from sbotat where id = p_sbota;
  if not found then return 0; end if;

  -- اتكشفت قبل كده؟
  if exists (select 1 from sbota_groups where sbota_id = p_sbota) then
    return 0;
  end if;

  select * into run from matching_runs
  where sbota_id = p_sbota order by ran_at desc limit 1;

  -- مفيش اقتراح مطابقة: مجموعة واحدة بكل الحاجزين
  if not found then
    insert into sbota_groups (sbota_id, index, captain_id, why_ar)
    values (p_sbota, 1, s.captain_id, 'كلكم حاجزين نفس السبوطة — وده أول لقا.')
    returning id into gid;

    insert into chat_rooms (kind, sbota_id, group_id, opens_at, closes_at)
    values ('sbota_group', p_sbota, gid, s.reveal_at, s.chat_closes_at)
    returning id into rid;

    update sbota_groups set chat_room_id = rid where id = gid;

    update bookings set group_id = gid
    where sbota_id = p_sbota and status = 'paid';

    insert into chat_members (room_id, profile_id, role)
    select rid, b.profile_id, 'member' from bookings b
    where b.sbota_id = p_sbota and b.status = 'paid'
    on conflict do nothing;

    if s.captain_id is not null then
      insert into chat_members (room_id, profile_id, role)
      select rid, c.profile_id, 'captain' from captains c where c.id = s.captain_id
      on conflict do nothing;
    end if;

    made := 1;
  else
    -- تنفيذ الاقتراح
    for grp in select * from jsonb_array_elements(run.proposal -> 'groups') loop
      idx := idx + 1;
      insert into sbota_groups (sbota_id, index, captain_id, why_ar)
      values (p_sbota, idx, s.captain_id, grp ->> 'why')
      returning id into gid;

      insert into chat_rooms (kind, sbota_id, group_id, opens_at, closes_at)
      values ('sbota_group', p_sbota, gid, s.reveal_at, s.chat_closes_at)
      returning id into rid;

      update sbota_groups set chat_room_id = rid where id = gid;

      for member in select * from jsonb_array_elements(grp -> 'members') loop
        update bookings set group_id = gid
        where sbota_id = p_sbota and profile_id = (member #>> '{}')::uuid;

        insert into chat_members (room_id, profile_id, role)
        values (rid, (member #>> '{}')::uuid, 'member')
        on conflict do nothing;
      end loop;

      if s.captain_id is not null then
        insert into chat_members (room_id, profile_id, role)
        select rid, c.profile_id, 'captain' from captains c where c.id = s.captain_id
        on conflict do nothing;
      end if;

      made := made + 1;
    end loop;

    update matching_runs set approved_at = coalesce(approved_at, now()) where id = run.id;
  end if;

  -- رسالة الكشف لكل حاجز
  insert into notifications (profile_id, channel, template_key, payload)
  select b.profile_id, 'whatsapp', 'group_reveal',
         jsonb_build_object('booking_id', b.id, 'sbota_id', p_sbota)
  from bookings b where b.sbota_id = p_sbota and b.status = 'paid';

  update sbotat set status = 'locked' where id = p_sbota and status in ('open','full');

  insert into audit_log (action, entity, entity_id, after)
  values ('reveal', 'sbotat', p_sbota, jsonb_build_object('groups', made));

  return made;
end;
$$;
comment on function fn_reveal(uuid) is 'بينشئ المجموعات والغرف وبيبعت رسالة الكشف. بيشتغل مرة واحدة لكل سبوطة.';

-- ===== المهمة الدورية: كل سبوطة وصلت reveal_at =====
create or replace function job_reveal_due()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int := 0; r record;
begin
  for r in
    select id from sbotat
    where status in ('open','full')
      and reveal_at is not null and now() >= reveal_at
      and not exists (select 1 from sbota_groups g where g.sbota_id = sbotat.id)
  loop
    perform fn_reveal(r.id);
    n := n + 1;
  end loop;
  return n;
end;
$$;

-- ===== قفل الشات =====
create or replace function job_close_chats()
returns int
language sql
security definer
set search_path = public
as $$
  with done as (
    update chat_rooms set is_closed = true
    where is_closed = false and closes_at is not null and now() >= closes_at
    returning 1
  ) select count(*)::int from done;
$$;

-- ===== الحجوزات اللي مدفعتش في المهلة =====
create or replace function job_expire_bookings()
returns int
language sql
security definer
set search_path = public
as $$
  with done as (
    update bookings set status = 'cancelled_by_us', cancel_reason = 'مهلة الدفع خلصت'
    where status = 'pending_payment' and expires_at is not null and now() > expires_at
    returning 1
  ) select count(*)::int from done;
$$;

-- ===== التذكيرات =====
create or replace function job_reminders()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int := 0;
begin
  -- قبل 24 ساعة
  insert into notifications (profile_id, channel, template_key, payload)
  select b.profile_id, 'whatsapp', 'reminder_24h',
         jsonb_build_object('sbota_id', s.id, 'booking_id', b.id)
  from bookings b join sbotat s on s.id = b.sbota_id
  where b.status = 'paid'
    and s.starts_at between now() + interval '23 hours' and now() + interval '24 hours'
    and not exists (
      select 1 from notifications n
      where n.profile_id = b.profile_id and n.template_key = 'reminder_24h'
        and n.payload ->> 'booking_id' = b.id::text
    );
  get diagnostics n = row_count;

  -- قبل 3 ساعات
  insert into notifications (profile_id, channel, template_key, payload)
  select b.profile_id, 'whatsapp', 'reminder_3h',
         jsonb_build_object('sbota_id', s.id, 'booking_id', b.id)
  from bookings b join sbotat s on s.id = b.sbota_id
  where b.status = 'paid'
    and s.starts_at between now() + interval '2 hours 45 minutes' and now() + interval '3 hours'
    and not exists (
      select 1 from notifications n
      where n.profile_id = b.profile_id and n.template_key = 'reminder_3h'
        and n.payload ->> 'booking_id' = b.id::text
    );
  return n;
end;
$$;

-- ===== بعد السبوطة: التقييم بعد ساعتين، والصور بعد يوم =====
create or replace function job_after_sbota()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int := 0;
begin
  update sbotat set status = 'done'
  where status in ('locked','running') and now() > ends_at;

  -- الحاجزين اللي ما اتسجلش عليهم حضور بيتحسبوا attended افتراضيًا بعد ساعتين
  update bookings b set status = 'attended'
  from sbotat s
  where s.id = b.sbota_id and b.status = 'paid' and now() > s.ends_at + interval '2 hours';

  insert into notifications (profile_id, channel, template_key, payload)
  select b.profile_id, 'whatsapp', 'review_request',
         jsonb_build_object('booking_id', b.id, 'sbota_id', s.id)
  from bookings b join sbotat s on s.id = b.sbota_id
  where b.status = 'attended'
    and now() between s.ends_at + interval '2 hours' and s.ends_at + interval '4 hours'
    and not exists (select 1 from reviews r where r.booking_id = b.id)
    and not exists (
      select 1 from notifications n
      where n.template_key = 'review_request' and n.payload ->> 'booking_id' = b.id::text
    );
  get diagnostics n = row_count;

  -- نشر الصور بعد 24 ساعة + كوبون
  update sbota_photos sp set published_to_members_at = now()
  from sbotat s
  where s.id = sp.sbota_id and sp.published_to_members_at is null
    and sp.signed_by_captain and now() > s.ends_at + interval '24 hours';

  return n;
end;
$$;

-- ===== «الناس سألت عليك» — من غاب 45 يوم =====
create or replace function job_win_back()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int := 0;
begin
  insert into notifications (profile_id, channel, template_key, payload)
  select p.id, 'whatsapp', 'win_back', jsonb_build_object('profile_id', p.id)
  from profiles p
  where p.deleted_at is null and p.banned_at is null and p.sbota_count > 0
    and not exists (
      select 1 from bookings b join sbotat s on s.id = b.sbota_id
      where b.profile_id = p.id and s.starts_at > now() - interval '45 days'
    )
    and not exists (
      select 1 from notifications n
      where n.profile_id = p.id and n.template_key = 'win_back'
        and n.created_at > now() - interval '60 days'
    );
  get diagnostics n = row_count;
  return n;
end;
$$;

-- ===== المسح النهائي بعد 30 يوم =====
create or replace function job_purge()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare n int := 0;
begin
  delete from otp_codes where created_at < now() - interval '1 day';

  -- البيانات الشخصية بتتمسح، وسجلات الدفع بتفضل للضريبة من غير هوية
  update profiles
  set phone = 'deleted-' || id::text,
      email = null, first_name = null, avatar_path = null,
      wish_text = null, type_scores = null, referral_code = 'DEL' || left(id::text, 3)
  where deleted_at is not null and deleted_at < now() - interval '30 days'
    and phone not like 'deleted-%';
  get diagnostics n = row_count;
  return n;
end;
$$;

comment on function job_purge() is 'بيمسح رموز التحقق القديمة، وبيجهّل بيانات المحذوفين بعد 30 يوم مع الاحتفاظ بسجلات الدفع.';;
