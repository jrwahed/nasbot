-- سياسة chat_members كانت بتستعلم من chat_members نفسه → تكرار لا نهائي.
-- الحل: دالة security definer بتتخطى RLS وبتتنادى من السياسة.
create or replace function fn_is_room_member(p_room uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from chat_members
    where room_id = p_room and profile_id = auth.uid() and removed_at is null
  );
$$;
comment on function fn_is_room_member(uuid) is 'هل أنا عضو غير محذوف في الغرفة دي؟ بتتخطى RLS علشان تمنع التكرار في سياسة chat_members.';

grant execute on function fn_is_room_member(uuid) to authenticated;

drop policy if exists members_read on chat_members;
create policy members_read on chat_members for select
  using (profile_id = auth.uid() or fn_is_admin() or fn_is_room_member(room_id));

drop policy if exists rooms_member_read on chat_rooms;
create policy rooms_member_read on chat_rooms for select
  using (fn_is_admin() or fn_is_room_member(chat_rooms.id));

-- الرسائل كمان تستخدم الدالة بدل الاستعلام المباشر
drop policy if exists messages_read on messages;
create policy messages_read on messages for select
  using (
    fn_is_admin() or (
      fn_is_room_member(messages.room_id)
      and exists (select 1 from chat_rooms r
                  where r.id = messages.room_id
                    and (r.opens_at is null or now() >= r.opens_at))
    )
  );

drop policy if exists messages_write on messages;
create policy messages_write on messages for insert
  with check (
    sender_id = auth.uid()
    and fn_is_room_member(messages.room_id)
    and exists (
      select 1 from chat_rooms r
      where r.id = messages.room_id
        and r.is_closed = false
        and (r.opens_at  is null or now() >= r.opens_at)
        and (r.closes_at is null or now() <  r.closes_at)
    )
  );;
