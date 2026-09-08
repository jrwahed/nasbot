-- ثغرات ظهرت وإحنا بنبني صفحات «الناس» و«الكباتن»: الجداول دي مكانش
-- عليها سياسة تعديل للإدارة، فأي تعديل كان بيعدّي على صفر صفوف من غير خطأ.

-- ===== الملفات =====
-- تعديل الملفات لصاحب صلاحية people.edit
create policy profiles_admin_update on profiles
  for update using (fn_has_permission('people.edit'));

-- بس الحظر نفسه محتاج صلاحية أعلى (people.ban).
-- RLS ما بتعرفش تفرّق بين الأعمدة، فبنستعمل تريجر بيقارن القديم بالجديد.
create or replace function fn_guard_ban_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if (new.banned_at is distinct from old.banned_at
      or new.ban_reason is distinct from old.ban_reason)
     and auth.uid() is not null
     and not fn_has_permission('people.ban') then
    raise exception 'الحظر محتاج صلاحية people.ban';
  end if;
  return new;
end;
$$;

drop trigger if exists t_guard_ban on profiles;
create trigger t_guard_ban
  before update on profiles
  for each row execute function fn_guard_ban_columns();

-- ===== طلبات الكباتن =====
alter table captain_applications
  add column if not exists status        text not null default 'pending',
  add column if not exists reject_reason text;

alter table captain_applications
  drop constraint if exists captain_applications_status_ck;
alter table captain_applications
  add constraint captain_applications_status_ck
  check (status in ('pending', 'accepted', 'rejected'));

create policy capp_admin_write on captain_applications
  for update using (fn_has_permission('captains.edit'));

-- ===== تنبيهات الأماكن =====
-- الصفحة اللي بتستعملها هي صفحة الكباتن، فلازم الصلاحيتين ينفعوا
drop policy if exists pa_all on provider_alerts;
create policy pa_all on provider_alerts
  for all using (
    fn_has_permission('sbotat.edit') or fn_has_permission('captains.edit')
  );

-- ===== السجل =====
-- أي أدمن شغّال يقدر يكتب في السجل (القراية محتاجة audit.view)
create policy audit_admin_insert on audit_log
  for insert with check (fn_is_admin());

-- ===== المهارات =====
-- skill_activities فيها «عجل» بس activity_t مافيهاش cycling،
-- يعني مستوى العجل مكانش ينفع يتخزّن أصلًا.
alter type activity_t add value if not exists 'cycling';;
