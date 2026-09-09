-- طبقة «الشغل» — 4: سياسات الصفوف (WORK_PLAN §1.6) + fn_submit_lead.
-- الافتراضي زي باقي المشروع: RLS مفعّل، ومفيش سياسة = مفيش وصول.
-- كل السياسات drop if exists + create علشان الملف يتشغّل أكتر من مرة.

alter table professions        enable row level security;
alter table work_venues        enable row level security;
alter table work_passes        enable row level security;
alter table pass_redemptions   enable row level security;
alter table recurring_bookings enable row level security;
alter table work_affinity      enable row level security;
alter table venue_reports      enable row level security;
alter table leads              enable row level security;

-- ===== professions: القراءة للكل، الكتابة fields.edit =====
drop policy if exists professions_read  on professions;
drop policy if exists professions_write on professions;
create policy professions_read  on professions for select using (true);
create policy professions_write on professions for all
  using (fn_has_permission('fields.edit')) with check (fn_has_permission('fields.edit'));

-- ===== work_venues: الجدول للإدارة بس — الأعضاء عبر work_venues_public =====
drop policy if exists work_venues_admin_read  on work_venues;
drop policy if exists work_venues_admin_write on work_venues;
create policy work_venues_admin_read  on work_venues for select using (fn_is_admin());
create policy work_venues_admin_write on work_venues for all
  using (fn_has_permission('sbotat.edit')) with check (fn_has_permission('sbotat.edit'));

-- ===== work_passes: صاحبها يقرا ويطلب (pending بس) — الإدارة كل حاجة =====
-- مفيش سياسة تعديل للعضو أصلًا: sessions_used بيتغير من الدوال بس،
-- والتفعيل من fn_activate_pass. (والحارس t_guard_pass_columns فوقها كمان.)
drop policy if exists work_passes_own_read   on work_passes;
drop policy if exists work_passes_own_insert on work_passes;
drop policy if exists work_passes_admin      on work_passes;
create policy work_passes_own_read on work_passes for select
  using (profile_id = auth.uid() or fn_is_admin());
create policy work_passes_own_insert on work_passes for insert
  with check (profile_id = auth.uid() and status = 'pending' and sessions_used = 0);
create policy work_passes_admin on work_passes for all
  using (fn_has_permission('payments.review')) with check (fn_has_permission('payments.review'));

-- ===== pass_redemptions: قراءة لصاحب الكارت والإدارة — الكتابة من الدوال بس =====
drop policy if exists pass_redemptions_own_read on pass_redemptions;
create policy pass_redemptions_own_read on pass_redemptions for select
  using (fn_is_admin() or exists (
    select 1 from work_passes wp where wp.id = pass_redemptions.pass_id and wp.profile_id = auth.uid()));

-- ===== recurring_bookings: صاحبها كامل على بتاعه — الإدارة bookings.edit =====
drop policy if exists recurring_own   on recurring_bookings;
drop policy if exists recurring_admin on recurring_bookings;
create policy recurring_own on recurring_bookings for all
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());
create policy recurring_admin on recurring_bookings for all
  using (fn_has_permission('bookings.edit') or fn_is_admin())
  with check (fn_has_permission('bookings.edit'));

-- ===== work_affinity: نفس pair_affinity بالحرف — الكتابة لصاحب الرغبة، القراءة لمحدش =====
drop policy if exists work_pair_insert_own on work_affinity;
drop policy if exists work_pair_update_own on work_affinity;
drop policy if exists work_pair_admin_read on work_affinity;
create policy work_pair_insert_own on work_affinity for insert
  with check (a_id = auth.uid() or b_id = auth.uid());
create policy work_pair_update_own on work_affinity for update
  using (a_id = auth.uid() or b_id = auth.uid())
  with check (a_id = auth.uid() or b_id = auth.uid());
create policy work_pair_admin_read on work_affinity for select using (fn_is_admin());

-- ===== venue_reports: قراءة payments.view — كتابة payments.review =====
-- («owner» في الخطة = صاحب المكان — مفيش حساب مستخدم للمكان في المشروع، فاتشالت)
drop policy if exists venue_reports_read  on venue_reports;
drop policy if exists venue_reports_write on venue_reports;
create policy venue_reports_read  on venue_reports for select using (fn_has_permission('payments.view'));
create policy venue_reports_write on venue_reports for all
  using (fn_has_permission('payments.review')) with check (fn_has_permission('payments.review'));

-- ===== leads: القراءة والتعديل للإدارة — الإدراج عبر fn_submit_lead بس =====
-- مفيش سياسة insert عن قصد: الإدراج المباشر من المتصفح مرفوض،
-- والدالة تحت security definer فبتعدّي RLS بعد ما تتحقق من الحد.
drop policy if exists leads_read  on leads;
drop policy if exists leads_write on leads;
create policy leads_read  on leads for select using (fn_has_permission('people.view'));
create policy leads_write on leads for update
  using (fn_has_permission('people.view')) with check (fn_has_permission('people.view'));

create or replace function fn_submit_lead(
  p_company         text,
  p_contact_name    text,
  p_phone           text,
  p_people_count    int  default null,
  p_times_per_month int  default null,
  p_note            text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_phone text;
  v_today int;
  v_id    uuid;
begin
  if coalesce(btrim(p_company), '') = '' or coalesce(btrim(p_contact_name), '') = '' then
    raise exception 'اسم الشركة واسم اللي بنكلمه لازم يتكتبوا';
  end if;

  -- نسيب الرقم أرقام بس — من غير مسافات ولا شرط
  v_phone := regexp_replace(coalesce(p_phone, ''), '[^0-9+]', '', 'g');
  if length(regexp_replace(v_phone, '\D', '', 'g')) not between 8 and 15 then
    raise exception 'الرقم مش مظبوط';
  end if;

  -- حد المعدل: 3 طلبات في اليوم لنفس الرقم
  select count(*) into v_today from leads
  where phone = v_phone and created_at > now() - interval '1 day';
  if v_today >= 3 then
    raise exception 'وصلنا طلبك قبل كده — هنكلمك قريب';
  end if;

  insert into leads (company, contact_name, phone, people_count, times_per_month, note)
  values (left(btrim(p_company), 120), left(btrim(p_contact_name), 80), v_phone,
          p_people_count, p_times_per_month, left(p_note, 1000))
  returning id into v_id;

  return v_id;
end;
$$;
comment on function fn_submit_lead(text, text, text, int, int, text) is 'نموذج الشركات — الطريق الوحيد للإدراج في leads. 3 طلبات في اليوم لكل رقم كحد أقصى.';
revoke execute on function fn_submit_lead(text, text, text, int, int, text) from public;
grant  execute on function fn_submit_lead(text, text, text, int, int, text) to anon, authenticated, service_role;

-- ===== payments: صاحب الكارت يشوف دفعة كارته (السياسة القديمة بتمر على bookings بس) =====
drop policy if exists payments_pass_own_read on payments;
create policy payments_pass_own_read on payments for select
  using (exists (
    select 1 from work_passes wp where wp.id = payments.pass_id and wp.profile_id = auth.uid()));

-- ===== profiles: أعمدة الشغل =====
-- الخطة طلبت سياسة profiles_work_peer_read لزمايل نفس السبوطة بعد الكشف.
-- RLS على مستوى الصف — أي سياسة كده هتفتح الصف كله (التليفون والإيميل وسنة الميلاد)
-- لزمايل المجموعة، وده بيكسر الاختبار 1 في test_rls وسياسة الخصوصية كلها.
-- فالأعمدة الأربعة (المجال · الأسلوب · الخبرة · الاسم الأول) بتتقرا من
-- work_group_members / fn_work_group_members بس (0041) — نفس نمط fn_group_members.
-- صاحب الملف بيعدّلها بسياسة profiles_self_update الموجودة.
