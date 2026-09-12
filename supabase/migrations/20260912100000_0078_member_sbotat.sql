-- ============================================================================
-- 0078 — الناس هي اللي تظبّط الخروجة
--
-- نقلة في هوية المنتج: نسبوط ما بقاش قايم على «الكابتن والتنظيم». العضو
-- العادي يقدر يفتح خروجة بنفسه، والناس اللي ما تعرفهاش تنضم ليها. سبوطات
-- نسبوط وسبوطات الأعضاء بيقعدوا في **نفس القايمة** وبيفرّق بينهم عمود
-- `origin`.
--
-- اللي بيتغيّر هنا:
--   · `sbotat.origin`    — 'nasbot' (من اللوحة) أو 'member' (من عضو).
--   · `sbotat.host_id`   — صاحب الخروجة. عضو عادي، مش كابتن مدفوع.
--   · `captains` ما اتمسحتش — الكابتن بقى **اختياري** جنب صاحب الخروجة،
--     علشان السبوطات القديمة تفضل شغّالة والمسح يبقى قرار لوحده.
--   · `org_fee` بقى **رسوم الموقع** بس، مش «رسوم التنظيم والكابتن».
--
-- ⚠ الأمان — الدروس المكتوبة في CLAUDE.md §5 متطبّقة هنا بالحرف:
--   1. **مفيش سياسة insert للعضو على `sbotat` خالص.** الطريق الوحيد هو
--      `fn_create_sbota` — نفس نمط `fn_pair_want`. لو سبنا باب مباشر، العضو
--      كان هيقدر يكتب `price = 0` أو `origin = 'nasbot'` وينتحل صفة الموقع.
--   2. **`auth.uid() is null` بيرفض، مش بيعدّي.** الزائر المجهول uid بتاعه
--      null، فالشرط هنا `if v_uid is null then raise` — لو كتبناه بالعكس
--      (`if v_uid is not null and not ...`) كان المجهول هيعدّي، وده بالظبط
--      اللي فتح `fn_reveal` للنت كله في 0062.
--   3. **`revoke execute from public, anon` صريح** ورا كل دالة جديدة.
--   4. **كل رقم في `settings`** — الحدود كلها أعمدة، مفيش رقم في جسم الدالة.
--
-- السرية ما اتكسرتش: صاحب الخروجة بيشوف المجموعة **بعد الكشف بس**، بالظبط
-- زي الكابتن. الطريق ده ماشي على `fn_is_my_sbota_revealed` اللي بتوسّعها
-- الهجرة دي بدل ما تفتح باب جديد.
--
-- آمنة تتكرر: كل حاجة `if not exists` / `create or replace` /
-- `drop policy if exists` بنفس الاسم الجديد.
-- ============================================================================


-- ===== 1) النوع الجديد =====
-- نوع **جديد** مش `alter type ... add value` على نوع موجود، فآمن في نفس
-- المعاملة اللي محرر SQL بيشغّلها (شوف CLAUDE.md §6).
do $$
begin
  if not exists (select 1 from pg_type where typname = 'sbota_origin_t') then
    create type sbota_origin_t as enum ('nasbot', 'member');
  end if;
end $$;


-- ===== 2) أعمدة السبوطة =====
alter table sbotat add column if not exists origin       sbota_origin_t not null default 'nasbot';
alter table sbotat add column if not exists host_id      uuid references profiles(id) on delete set null;
alter table sbotat add column if not exists host_note_ar text;
alter table sbotat add column if not exists host_name_ar text;

comment on column sbotat.origin  is 'مين فتح الخروجة: nasbot = من اللوحة · member = عضو عادي.';
comment on column sbotat.host_id is 'صاحب الخروجة — عضو عادي، مش كابتن مدفوع. null للسبوطات القديمة.';
comment on column sbotat.host_note_ar is 'سطر صاحب الخروجة للناس: «هنتقابل عند البوابة».';
comment on column sbotat.host_name_ar is
  'الاسم الأول لصاحب الخروجة، متخزّن هنا عن قصد. `sbotat_public` فيو security_invoker — لو ربطناه بـ profiles كانت RLS هترجّع null لأي حد تاني، وتوسيع سياسة profiles علشان الاسم كان هيفتح الصف كله (نفس ثغرة S3). الاسم الأول بس، مفيش صورة ولا تليفون.';

create index if not exists sbotat_origin_idx  on sbotat (origin);
create index if not exists sbotat_host_id_idx on sbotat (host_id);

-- السبوطات اللي ليها كابتن: صاحبها هو نفس الشخص. مرة واحدة، وآمنة تتكرر.
update sbotat s
   set host_id = c.profile_id
  from captains c
 where c.id = s.captain_id
   and s.host_id is null;

update sbotat s
   set host_name_ar = p.first_name
  from profiles p
 where p.id = s.host_id
   and s.host_name_ar is distinct from p.first_name;

-- الكابتن بقى اختياري — التعليق بيقول كده صراحة علشان اللي جاي بعدنا.
comment on column sbotat.captain_id is
  'اختياري. الكابتن بقى ميزة جنبية مش أساس المنتج — صاحب الخروجة (host_id) هو اللي بيمسك المجموعة.';

-- رسوم التنظيم بقت رسوم الموقع.
comment on column sbota_templates.org_fee is 'رسوم الموقع — جوه السعر مش زيادة عليه.';
comment on column sbotat.org_fee         is 'رسوم الموقع — جوه السعر مش زيادة عليه.';


-- ===== 3) الأرقام — كلها في settings مفيش واحد في الكود =====
alter table settings add column if not exists site_fee                    int not null default 4000;
alter table settings add column if not exists member_sbota_min_capacity   int not null default 4;
alter table settings add column if not exists member_sbota_max_capacity   int not null default 12;
alter table settings add column if not exists member_sbota_max_open       int not null default 2;
alter table settings add column if not exists member_sbota_min_lead_hours int not null default 24;
alter table settings add column if not exists member_sbota_max_days_ahead int not null default 45;
alter table settings add column if not exists member_sbota_auto_open      boolean not null default true;

comment on column settings.site_fee                    is 'رسوم الموقع بالقروش — جوه سعر السبوطة مش زيادة عليه. ورث مكان «رسوم التنظيم والكابتن».';
comment on column settings.member_sbota_min_capacity   is 'أقل عدد يقدر عضو يفتح بيه خروجة.';
comment on column settings.member_sbota_max_capacity   is 'أكبر عدد يقدر عضو يفتح بيه خروجة.';
comment on column settings.member_sbota_max_open       is 'كام خروجة مفتوحة في نفس الوقت للعضو الواحد.';
comment on column settings.member_sbota_min_lead_hours is 'أقل مهلة بين دلوقتي وميعاد الخروجة — علشان الناس تلحق تحجز.';
comment on column settings.member_sbota_max_days_ahead is 'أبعد ميعاد لقدّام يقدر عضو يحجزه.';
comment on column settings.member_sbota_auto_open      is 'true = خروجة العضو تظهر على طول · false = تستنى موافقة اللوحة (تفضل draft).';

-- مفتاح ميزة علشان اللوحة تقفل الباب من غير نشر.
insert into feature_flags (key, name_ar, off_message_ar)
values ('member_sbota', 'خروجات الأعضاء', 'فتح الخروجات مقفول دلوقتي. جرب تاني بعدين.')
on conflict (key) do nothing;


-- ===== 4) صاحب الخروجة بيشوف مجموعته — بعد الكشف بس =====
-- بنوسّع الدالة الموجودة بدل ما نفتح باب جديد: هي الشوكة اللي بتمر عليها
-- سياسة `bookings_own_read` وسياسة قراية `profiles` المتبادلة وسياسة صور
-- التخزين. توسيعها هنا معناه إن صاحب الخروجة بياخد **نفس** صلاحية الكابتن
-- بالظبط — ولا نقطة زيادة، وبعد `reveal_at` بس.
create or replace function fn_is_my_sbota_revealed(s_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from sbotat s
    where s.id = s_id
      and (s.captain_id = fn_my_captain_id() or (auth.uid() is not null and s.host_id = auth.uid()))
      and s.reveal_at is not null and now() >= s.reveal_at
  );
$$;
comment on function fn_is_my_sbota_revealed(uuid) is
  'الكابتن أو صاحب الخروجة بيشوف مجموعته بعد reveal_at بس. السرية قبل الكشف ما اتكسرتش.';

-- هل أنا صاحب الخروجة دي؟ (من غير شرط الكشف — للقراية والإلغاء)
create or replace function fn_is_my_sbota_host(s_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select auth.uid() is not null
     and exists (select 1 from sbotat s where s.id = s_id and s.host_id = auth.uid());
$$;
comment on function fn_is_my_sbota_host(uuid) is 'هل المستخدم الحالي هو صاحب الخروجة دي؟';

grant execute on function fn_is_my_sbota_host(uuid) to anon, authenticated;


-- ===== 5) صاحب الخروجة يشوف خروجته وهي لسه draft =====
-- نفس الاسم في drop و create — الغلطة اللي وقفت اللزق في 0056.
drop policy if exists sbotat_read_public on sbotat;
create policy sbotat_read_public on sbotat for select
  using (
    status in ('open','full','locked','running')
    or fn_is_admin()
    or captain_id = fn_my_captain_id()
    or (auth.uid() is not null and host_id = auth.uid())
  );

-- ⚠ عن قصد: **مفيش** سياسة insert ولا update للعضو على `sbotat`.
-- الطريق الوحيد `fn_create_sbota` و`fn_update_own_sbota` و`fn_cancel_own_sbota`.
-- لو حد ضاف سياسة insert هنا بعدين، هيكون فتح باب تزوير سعر ومصدر.


-- ===== 6) فتح خروجة — الطريق الوحيد =====
create or replace function fn_create_sbota(
  p_template_id uuid,
  p_venue_id    uuid,
  p_starts_at   timestamptz,
  p_capacity    int,
  p_girls_only  boolean default false,
  p_note        text    default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid      uuid := auth.uid();
  v_set      settings%rowtype;
  v_tpl      sbota_templates%rowtype;
  v_open     int;
  v_gender   gender_t;
  v_first_name text;
  v_banned   timestamptz;
  v_status   sbota_status_t;
  v_id       uuid;
begin
  -- الزائر المجهول uid بتاعه null، ومفتاح الخدمة كمان. الاتنين مالهمش دعوة
  -- بالدالة دي — اللوحة بتكتب على `sbotat` مباشرة بسياسة الإدارة.
  -- ⚠ الشرط بيرفض لما يكون null. العكس (`is not null and not ...`) كان
  --   هيعدّي المجهول — الغلطة اللي حصلت في fn_reveal قبل كده.
  if v_uid is null then
    raise exception 'لازم تسجّل دخول الأول' using errcode = '42501';
  end if;

  if not exists (select 1 from feature_flags where key = 'member_sbota' and is_on) then
    raise exception 'فتح الخروجات مقفول دلوقتي' using errcode = '42501';
  end if;

  if fn_maintenance_on() then
    raise exception 'الموقع في صيانة دلوقتي' using errcode = '42501';
  end if;

  select banned_at, gender, first_name into v_banned, v_gender, v_first_name from profiles where id = v_uid;
  if not found then
    raise exception 'كمّل بياناتك الأول' using errcode = '42501';
  end if;
  if v_banned is not null then
    raise exception 'حسابك موقوف' using errcode = '42501';
  end if;

  select * into v_set from settings where id;

  -- ===== القالب والمكان — من اللوحة، مش من العضو =====
  select * into v_tpl from sbota_templates where id = p_template_id;
  if not found then
    raise exception 'النوع ده مش موجود' using errcode = '22023';
  end if;
  if v_tpl.kind in ('work', 'mystery') then
    raise exception 'النوع ده مش متاح لخروجات الأعضاء' using errcode = '22023';
  end if;

  if not exists (select 1 from venues where id = p_venue_id and is_active) then
    raise exception 'المكان ده مش متاح' using errcode = '22023';
  end if;

  -- ===== الحدود — كلها من settings =====
  if p_capacity < v_set.member_sbota_min_capacity or p_capacity > v_set.member_sbota_max_capacity then
    raise exception 'العدد لازم يكون بين % و %',
      v_set.member_sbota_min_capacity, v_set.member_sbota_max_capacity using errcode = '22023';
  end if;

  if p_starts_at < now() + make_interval(hours => v_set.member_sbota_min_lead_hours) then
    raise exception 'لازم تفتحها قبل الميعاد بـ % ساعة على الأقل',
      v_set.member_sbota_min_lead_hours using errcode = '22023';
  end if;

  if p_starts_at > now() + make_interval(days => v_set.member_sbota_max_days_ahead) then
    raise exception 'الميعاد ده بعيد أوي — أقصى حاجة % يوم',
      v_set.member_sbota_max_days_ahead using errcode = '22023';
  end if;

  select count(*) into v_open
    from sbotat
   where host_id = v_uid
     and origin = 'member'
     and status in ('draft','open','full','locked','running');
  if v_open >= v_set.member_sbota_max_open then
    raise exception 'عندك % خروجة مفتوحة خلاص — اقفل واحدة الأول',
      v_set.member_sbota_max_open using errcode = '22023';
  end if;

  -- «بنات بس» من بنت بس. من غير الشرط ده الخانة دي بتبقى فخ.
  if p_girls_only and v_gender is distinct from 'female' then
    raise exception 'خروجة البنات بتتفتح من بنت' using errcode = '42501';
  end if;

  v_status := case when v_set.member_sbota_auto_open then 'open'::sbota_status_t
                   else 'draft'::sbota_status_t end;

  -- ⚠ السعر ورسوم الموقع **محسوبين هنا** من القالب و`settings`، عمرهم ما
  --   بيجوا من العضو. ده اللي بيمنع «حجز ببلاش» من الباب ده.
  insert into sbotat (
    template_id, venue_id, starts_at, ends_at,
    price, org_fee, capacity, status,
    girls_only, is_day, origin, host_id, host_name_ar, host_note_ar
  ) values (
    p_template_id, p_venue_id, p_starts_at,
    p_starts_at + make_interval(mins => v_tpl.duration_min),
    v_tpl.default_price, v_set.site_fee, p_capacity, v_status,
    p_girls_only, v_tpl.is_day, 'member', v_uid, v_first_name, nullif(btrim(coalesce(p_note,'')), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function fn_create_sbota(uuid, uuid, timestamptz, int, boolean, text) is
  'الطريق الوحيد لعضو يفتح خروجة. السعر ورسوم الموقع محسوبين جوه — العضو ما بيبعتهمش.';

revoke execute on function fn_create_sbota(uuid, uuid, timestamptz, int, boolean, text) from public, anon;
grant  execute on function fn_create_sbota(uuid, uuid, timestamptz, int, boolean, text) to authenticated;


-- ===== 7) تعديل سطر صاحب الخروجة =====
create or replace function fn_update_own_sbota(p_id uuid, p_note text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'لازم تسجّل دخول الأول' using errcode = '42501';
  end if;

  update sbotat
     set host_note_ar = nullif(btrim(coalesce(p_note,'')), '')
   where id = p_id
     and host_id = v_uid
     and origin = 'member'
     and status in ('draft','open','full');

  if not found then
    raise exception 'مش خروجتك أو مش ممكن تتعدّل دلوقتي' using errcode = '42501';
  end if;
  return true;
end;
$$;

comment on function fn_update_own_sbota(uuid, text) is
  'صاحب الخروجة بيعدّل سطره بس. الميعاد والسعر والعدد ما بيتعدّلوش — الناس حجزت عليهم.';

revoke execute on function fn_update_own_sbota(uuid, text) from public, anon;
grant  execute on function fn_update_own_sbota(uuid, text) to authenticated;


-- ===== 8) إلغاء الخروجة من صاحبها =====
create or replace function fn_cancel_own_sbota(p_id uuid, p_reason text default null)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_paid int;
begin
  if v_uid is null then
    raise exception 'لازم تسجّل دخول الأول' using errcode = '42501';
  end if;

  if not exists (
    select 1 from sbotat
     where id = p_id and host_id = v_uid and origin = 'member'
       and status in ('draft','open','full')
  ) then
    raise exception 'مش خروجتك أو مقفولة خلاص' using errcode = '42501';
  end if;

  -- ⚠ حد الفلوس: لو في حد دافع، الإلغاء بقى مسألة استرداد — والاسترداد
  --   شغل اللوحة (`fn_cancel_booking` + الرصيد). صاحب الخروجة ما بيلغيش
  --   حجز حد دفع فيه فلوس.
  select count(*) into v_paid
    from bookings
   where sbota_id = p_id and status in ('paid','attended');

  if v_paid > 0 then
    raise exception 'في % حد دافع — كلّم الدعم علشان الإلغاء والاسترداد', v_paid
      using errcode = '42501';
  end if;

  update sbotat
     set status = 'cancelled',
         cancel_reason = nullif(btrim(coalesce(p_reason,'')), '')
   where id = p_id;

  return true;
end;
$$;

comment on function fn_cancel_own_sbota(uuid, text) is
  'صاحب الخروجة بيلغيها طول ما محدش دفع. بعد أول دفعة، الإلغاء من اللوحة علشان الاسترداد.';

revoke execute on function fn_cancel_own_sbota(uuid, text) from public, anon;
grant  execute on function fn_cancel_own_sbota(uuid, text) to authenticated;


-- ===== 9) خروجاتي أنا =====
create or replace function fn_my_hosted_sbotat()
returns table (
  id         uuid,
  slug       text,
  name_ar    text,
  starts_at  timestamptz,
  capacity   int,
  booked     int,
  status     sbota_status_t,
  note_ar    text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, t.slug, t.name_ar, s.starts_at, s.capacity,
         (select count(*)::int from bookings b
           where b.sbota_id = s.id and b.status in ('paid','attended','pending_payment')),
         s.status, s.host_note_ar
    from sbotat s
    join sbota_templates t on t.id = s.template_id
   where auth.uid() is not null
     and s.host_id = auth.uid()
   order by s.starts_at desc;
$$;

comment on function fn_my_hosted_sbotat() is 'الخروجات اللي أنا فاتحها. الأعداد بس — مفيش أسماء قبل الكشف.';

revoke execute on function fn_my_hosted_sbotat() from public, anon;
grant  execute on function fn_my_hosted_sbotat() to authenticated;


-- ===== 10) الواجهة العامة تشوف المصدر وصاحب الخروجة =====
-- `security_invoker` — بيحترم RLS زي ما هي (0029). بنضيف اسم صاحب الخروجة
-- الأول بس، من غير صورة ولا تليفون: الهوية مش تطبيق تعارف.
create or replace view sbotat_public
with (security_invoker = true)
as
select
  s.id, s.template_id, s.venue_id, s.captain_id,
  s.starts_at, s.ends_at, s.price, s.org_fee, s.capacity,
  s.status, s.girls_only, s.is_day, s.is_mystery,
  s.booking_closes_at, s.reveal_at,
  s.area, s.area_label_ar,
  t.slug, t.name_ar, t.story_ar, t.kind, t.mood_ar,
  t.meta_prefix_ar, t.level_ar,
  t.includes_ar, t.excludes_ar, t.duration_min, t.hero_photos, t.overnight,
  s.is_work,
  t.work_config,
  s.origin,
  s.host_id,
  s.host_name_ar,
  s.host_note_ar
from sbotat s
join sbota_templates t on t.id = s.template_id
where s.status in ('open', 'full', 'locked', 'running');

comment on view sbotat_public is
  'السبوطات المعروضة للكل. security_invoker — بيحترم RLS. مفيش عنوان ولا إحداثيات هنا خالص. اسم صاحب الخروجة الأول بس — مفيش صورة قبل الكشف.';

grant select on sbotat_public to anon, authenticated;
