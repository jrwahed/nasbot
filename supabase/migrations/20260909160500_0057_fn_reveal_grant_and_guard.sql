-- ============================================================================
-- 0057 — fn_reveal: منح التنفيذ + فحص الصلاحية جوّه (A1)
--
-- المشكلة: زرار «اعتمد التوزيع واكشفه» بينادي fn_reveal — والدالة عمرها ما
-- اتمنحت لـ authenticated (0011 و 0028 بيعملوا revoke ثم whitelist مفيهاش
-- fn_reveal). فالكشف اليدوي مستحيل من اللوحة (permission denied for function
-- fn_reveal)، والكشف بيحصل بس لما job_reveal_due توصل لميعادها.
--
-- الحل: نمنح execute لـ authenticated، ونحط فحص صلاحية جوّه الدالة (زي
-- fn_build_matching / fn_activate_pass): أي نداء من مستخدم مسجّل (auth.uid()
-- مش null) لازم يكون معاه matching.approve — غير كده استثناء. النداء الداخلي من
-- job_reveal_due بيشتغل بمفتاح الخدمة/الكرون (auth.uid() = null) فبيعدّي عادي.
--
-- الجسم زي 0026 بالحرف + بلوك الحارس بعد begin بس.
-- ============================================================================

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
  -- ===== حارس الصلاحية (A1) =====
  -- نداء من مستخدم مسجّل لازم يكون معاه matching.approve. النداء الداخلي
  -- (الكرون/مفتاح الخدمة) auth.uid() بتاعه null فبيعدّي.
  if auth.uid() is not null and not fn_has_permission('matching.approve') then
    raise exception 'الكشف واعتماد التوزيع محتاج صلاحية matching.approve';
  end if;

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
comment on function fn_reveal(uuid) is 'بينشئ المجموعات والغرف وبيبعت رسالة الكشف. بيشتغل مرة واحدة لكل سبوطة. النداء اليدوي محتاج matching.approve.';

-- منح التنفيذ للوحة (الفحص جوّه بيحمي)
grant execute on function fn_reveal(uuid) to authenticated;
