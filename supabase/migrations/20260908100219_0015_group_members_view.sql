-- أعضاء المجموعة للعرض: الاسم والحرف الأول والنوع والسطر — من غير صورة.
-- ده اللي بيخلي كشف المجموعة يشتغل من غير ما نفتح profiles للأعضاء على بعض.
create or replace function fn_group_members(p_booking_id uuid)
returns table (
  profile_id uuid,
  first_name text,
  initial    text,
  persona    persona_t,
  times_before int,
  line_ar    text
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select b.group_id, b.sbota_id
    from bookings b
    where b.id = p_booking_id and b.profile_id = auth.uid()
  ),
  revealed as (
    select s.reveal_at <= now() as ok
    from sbotat s join me on me.sbota_id = s.id
  )
  select
    p.id,
    p.first_name,
    left(p.first_name, 1),
    p.type,
    p.sbota_count,
    case p.sbota_count
      when 0 then 'أول مرة'
      when 1 then 'المرة التانية'
      when 2 then 'المرة التالتة'
      else 'المرة ' || (p.sbota_count + 1)::text
    end
  from bookings b
  join profiles p on p.id = b.profile_id
  join me on b.group_id = me.group_id
  where b.status in ('paid','attended')
    and b.profile_id <> auth.uid()
    and (select ok from revealed)
    and p.deleted_at is null;
$$;
comment on function fn_group_members(uuid) is 'أعضاء مجموعتي بعد الكشف — من غير avatar_path نهائيًا. الصور بتظهر للكابتن بس.';

grant execute on function fn_group_members(uuid) to authenticated;

-- «رايحين معاك» — دول بس اللي صورهم بتظهر، وبعد التبادل
create or replace function fn_met_before()
returns table (profile_id uuid, first_name text, persona persona_t, avatar_path text)
language sql
stable
security definer
set search_path = public
as $$
  select p.id, p.first_name, p.type, p.avatar_path
  from pair_affinity pa
  join profiles p on p.id = case when pa.a_id = auth.uid() then pa.b_id else pa.a_id end
  where pa.mutual_at is not null
    and (pa.a_id = auth.uid() or pa.b_id = auth.uid())
    and p.deleted_at is null;
$$;
comment on function fn_met_before() is 'اللي حصل بينك وبينهم اختيار متبادل — دول بس اللي بتشوف صورهم.';

grant execute on function fn_met_before() to authenticated;;
