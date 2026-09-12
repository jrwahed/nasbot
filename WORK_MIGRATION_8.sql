-- ============================================================================
-- WORK_MIGRATION_8.sql — الناس هي اللي تظبّط الخروجة
--
-- ⚠ الزق WORK_MIGRATION_5 و6 و7 الأول لو لسه ما عملتهمش. الترتيب: ٥ ← ٦ ← ٧ ← ٨.
--
-- الزقه كله مرة واحدة في Supabase ← SQL Editor ← Run.
-- آمن يتكرر — اتجرّب بلزقتين ورا بعض على قاعدة نضيفة.
--
-- ⚠ فيه `create type` جديد (`sbota_origin_t`)، بس ده **نوع جديد** مش
--    `alter type ... add value` على نوع موجود — فمفيش مشكلة معاملة، ومفيش
--    داعي يتقسم لملفين زي ما حصل في WORK_MIGRATION الأصلي.
--
-- بيعمل إيه:
--   0078  نقلة المنتج: العضو العادي يقدر يفتح خروجة بنفسه، وسبوطات نسبوط
--         وسبوطات الأعضاء يقعدوا في **نفس القايمة** ويفرّق بينهم `origin`.
--         الكابتن بقى اختياري و«صاحب الخروجة» (`host_id`) هو اللي بيمسك
--         المجموعة. و`org_fee` بقى **رسوم الموقع** بس مش «رسوم التنظيم
--         والكابتن». وكل حدود خروجة العضو بقت أعمدة في `settings`.
--   0079  دالة اختبار سلوكية للكلام ده.
--
-- ⚠ الأمان: مفيش سياسة insert للعضو على `sbotat` خالص — الطريق الوحيد
--    `fn_create_sbota`، والسعر ورسوم الموقع بيتحسبوا **جوه الدالة** من
--    القالب و`settings`، فالعضو عمره ما بيبعتهم. نفس نمط `fn_pair_want`.
--    والسرية ما اتكسرتش: صاحب الخروجة بيشوف مجموعته بعد `reveal_at` بس.
--
-- بعد ما يخلص شغّل السطر ده، ولازم كل الصفوف «نجح»:
--     select * from test_member_sbotat();
--
-- وبعد اللزق من اللوحة: /admin/settings ← «خروجات الأعضاء» علشان تظبط
-- الحدود (العدد · المهلة · كام خروجة للعضو · رسوم الموقع)، و«مفاتيح المزايا»
-- ← `member_sbota` لو عايز تقفل الباب مؤقتًا.
-- ============================================================================



-- ############################################################################
-- # 20260912100000_0078_member_sbotat.sql
-- ############################################################################

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

-- ############################################################################
-- # 20260912100100_0079_test_member_sbotat.sql
-- ############################################################################

-- ============================================================================
-- 0079 — اختبار «الناس هي اللي تظبّط الخروجة» (0078)
--
--   select * from test_member_sbotat();
--
-- كل الصفوف لازم تقول «نجح». أي «فشل» ابعتلي السطر بالحرف.
--
-- الاختبار **سلوكي**: بيلبس دور الزائر المجهول ودور عضو عادي، وبيجرّب يفتح
-- خروجة ويزوّر سعر ويلغي خروجة حد تاني — فعلًا، مش بيتفرّج على السياسات.
-- «الدالة موجودة» ما يعنيش «بتمنع».
--
-- ⚠ security invoker عن قصد (زي test_last_review_items): بوستجرس بيرفض
-- `set role` جوه دالة definer. التنفيذ مسحوب من public/anon/authenticated
-- تحت — بتتشغّل من محرر SQL بس.
--
-- بينضّف ورا نفسه: أي سبوطة اختبار بتتمسح في الآخر بعلامة `__test__`.
-- ============================================================================

create or replace function test_member_sbotat()
returns table (test text, result text)
language plpgsql
set search_path = public
as $$
declare
  n        int;
  me       text := current_user;
  male_id  uuid;
  other_id uuid;
  tpl_id   uuid;
  ven_id   uuid;
  new_id   uuid;
  other_sb uuid;
  ok       boolean;
  v_price  int;
  v_fee    int;
  v_set    settings%rowtype;
begin
  select * into v_set from settings where id;

  -- عضو راجل عادي (مش إدارة) — علشان نختبر حارس «بنات بس» كمان
  select p.id into male_id
    from profiles p
   where p.gender = 'male' and p.banned_at is null
     and not exists (select 1 from admin_users a where a.profile_id = p.id)
   limit 1;

  -- وعضو تاني خالص — علشان نجرّب نلغي خروجة مش بتاعتنا
  select p.id into other_id
    from profiles p
   where p.banned_at is null and p.id is distinct from male_id
   limit 1;

  select id into tpl_id from sbota_templates
   where kind not in ('work','mystery') order by created_at limit 1;
  select id into ven_id from venues where is_active limit 1;

  /* ===================== ١ · الشكل — الأعمدة والأرقام ================== */

  test := '0078 · نوع sbota_origin_t موجود بقيمتين';
  select count(*) into n from pg_enum e join pg_type t on t.oid = e.enumtypid
   where t.typname = 'sbota_origin_t';
  if n = 2 then result := 'نجح';
  else result := format('فشل — %s قيمة', n); end if;
  return next;

  test := '0078 · أعمدة صاحب الخروجة على sbotat';
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'sbotat'
     and column_name in ('origin','host_id','host_name_ar','host_note_ar');
  if n = 4 then result := 'نجح — ٤ أعمدة';
  else result := format('فشل — %s من ٤', n); end if;
  return next;

  test := '0078 · حدود خروجة العضو كلها في settings مش في الكود';
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'settings'
     and column_name in ('site_fee','member_sbota_min_capacity','member_sbota_max_capacity',
                         'member_sbota_max_open','member_sbota_min_lead_hours',
                         'member_sbota_max_days_ahead','member_sbota_auto_open');
  if n = 7 then result := 'نجح — ٧ أعمدة';
  else result := format('فشل — %s من ٧، يعني في رقم لسه في الكود', n); end if;
  return next;

  test := '0078 · مفتاح ميزة member_sbota موجود';
  if exists (select 1 from feature_flags where key = 'member_sbota') then
    result := 'نجح';
  else result := 'فشل — اللوحة مش هتقدر تقفل الباب'; end if;
  return next;

  test := '0078 · 🔴 مفيش سياسة insert للعضو على sbotat';
  select count(*) into n from pg_policies
   where tablename = 'sbotat' and cmd in ('INSERT','ALL')
     and coalesce(with_check,'') not like '%fn_is_admin%'
     and coalesce(with_check,'') not like '%fn_has_permission%';
  if n = 0 then result := 'نجح — الطريق الوحيد fn_create_sbota';
  else result := format('فشل — 🔴 %s سياسة بتسمح بكتابة مباشرة، يعني تزوير سعر ومصدر', n); end if;
  return next;

  test := '0078 · الدوال الجديدة مسحوبة من anon';
  select count(*) into n from pg_proc p
   where p.proname in ('fn_create_sbota','fn_update_own_sbota','fn_cancel_own_sbota','fn_my_hosted_sbotat')
     and has_function_privilege('anon', p.oid, 'execute');
  if n = 0 then result := 'نجح — الأربعة مقفولين على المجهول';
  else result := format('فشل — 🔴 %s دالة مفتوحة للزائر', n); end if;
  return next;

  test := '0078 · fn_create_sbota مفيهاش parameter للسعر';
  if (select count(*) from pg_proc where proname = 'fn_create_sbota'
       and pg_get_function_identity_arguments(oid) like '%price%') = 0 then
    result := 'نجح — السعر بيتحسب جوه من القالب';
  else result := 'فشل — 🔴 العضو بيبعت السعر، يعني حجز ببلاش'; end if;
  return next;

  test := '0078 · صاحب الخروجة داخل فحص الكشف (مش باب جنبي)';
  if (select prosrc from pg_proc where proname = 'fn_is_my_sbota_revealed') like '%host_id%'
     and (select prosrc from pg_proc where proname = 'fn_is_my_sbota_revealed') like '%reveal_at%' then
    result := 'نجح — نفس شرط الكابتن، بعد الكشف بس';
  else result := 'فشل — السرية اتكسرت'; end if;
  return next;

  /* ===================== ٢ · سلوكي — الزائر المجهول ==================== */

  begin
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    execute 'set local role anon';

    test := 'سلوكي · الزائر **مش** بيقدر ينادي fn_create_sbota';
    ok := false;
    begin
      perform fn_create_sbota(tpl_id, ven_id, now() + interval '10 days', 6, false, '__test__');
    exception when others then
      ok := true;
    end;
    if ok then result := 'نجح — permission denied';
    else result := 'فشل — 🔴 الزائر المجهول فتح خروجة'; end if;
    return next;

    test := 'سلوكي · الزائر **مش** بيقدر يكتب على sbotat مباشرة';
    ok := false;
    begin
      insert into sbotat (template_id, venue_id, starts_at, ends_at, price, capacity, status, origin)
      values (tpl_id, ven_id, now() + interval '10 days', now() + interval '10 days 2 hours',
              0, 6, 'open', 'nasbot');
      ok := false;
    exception when others then
      ok := true;
    end;
    if ok then result := 'نجح';
    else result := 'فشل — 🔴 الزائر كتب سبوطة بسعر صفر'; end if;
    return next;

    test := 'سلوكي · الزائر بيقرا السبوطات المفتوحة (القايمة العامة شغّالة)';
    begin
      select count(*) into n from sbotat_public;
      result := format('نجح — شاف %s سبوطة', n);
    exception when others then
      result := 'فشل — القايمة العامة اتكسرت: ' || sqlerrm;
    end;
    return next;

    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);
  exception when others then
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);
    test := 'سلوكي · اختبار الزائر';
    result := 'فشل — ' || sqlerrm;
    return next;
  end;

  /* ===================== ٣ · سلوكي — عضو عادي ========================== */

  if male_id is null or tpl_id is null or ven_id is null then
    test := 'سلوكي · عضو بيفتح خروجة';
    result := format('نجح — اتخطى (عضو=%s قالب=%s مكان=%s)',
                     coalesce(male_id::text,'مفيش'), coalesce(tpl_id::text,'مفيش'),
                     coalesce(ven_id::text,'مفيش'));
    return next;
  else
    -- خروجة على اسم حد تاني، بدور الإدارة، علشان نجرّب نلغيها بعدين
    if other_id is not null then
      insert into sbotat (template_id, venue_id, starts_at, ends_at, price, capacity,
                          status, origin, host_id, host_note_ar)
      values (tpl_id, ven_id, now() + interval '12 days', now() + interval '12 days 2 hours',
              30000, 6, 'open', 'member', other_id, '__test__')
      returning id into other_sb;
    end if;

    begin
      perform set_config(
        'request.jwt.claims',
        json_build_object('sub', male_id::text, 'role', 'authenticated')::text,
        true
      );
      execute 'set local role authenticated';

      test := 'سلوكي · العضو **مش** بيقدر يكتب على sbotat مباشرة';
      ok := false;
      begin
        insert into sbotat (template_id, venue_id, starts_at, ends_at, price, capacity, status, origin)
        values (tpl_id, ven_id, now() + interval '10 days', now() + interval '10 days 2 hours',
                0, 6, 'open', 'nasbot');
        ok := false;
      exception when others then
        ok := true;
      end;
      if ok then result := 'نجح — الباب المباشر مقفول';
      else result := 'فشل — 🔴 العضو كتب سبوطة بسعر صفر وباسم نسبوط'; end if;
      return next;

      test := 'سلوكي · العضو **بيفتح** خروجة فعلًا (متكسرش الميزة)';
      new_id := null;
      begin
        new_id := fn_create_sbota(tpl_id, ven_id, now() + interval '10 days', 6, false, '__test__');
      exception when others then
        result := 'فشل — ' || sqlerrm;
      end;
      if new_id is not null then result := 'نجح';
      elsif result is null then result := 'فشل — رجعت null'; end if;
      return next;

      if new_id is not null then
        test := 'سلوكي · الخروجة اتسجّلت origin=member وصاحبها أنا';
        select count(*) into n from sbotat
         where id = new_id and origin = 'member' and host_id = male_id;
        if n = 1 then result := 'نجح';
        else result := 'فشل — المصدر أو الصاحب غلط'; end if;
        return next;

        test := 'سلوكي · 🔴 السعر من القالب ورسوم الموقع من settings';
        select price, org_fee into v_price, v_fee from sbotat where id = new_id;
        if v_price = (select default_price from sbota_templates where id = tpl_id)
           and v_fee = v_set.site_fee then
          result := format('نجح — السعر %s والرسوم %s', v_price, v_fee);
        else result := format('فشل — 🔴 السعر %s والرسوم %s، العضو أثّر فيهم', v_price, v_fee); end if;
        return next;

        test := 'سلوكي · صاحب الخروجة **ما يشوفش** المجموعة قبل الكشف';
        if fn_is_my_sbota_revealed(new_id) then
          result := 'فشل — 🔴 السرية اتكسرت، شاف المجموعة بدري';
        else result := 'نجح'; end if;
        return next;

        test := 'سلوكي · صاحب الخروجة بيعدّل سطره';
        ok := false;
        begin
          ok := fn_update_own_sbota(new_id, '__test__ هنتقابل عند البوابة');
        exception when others then
          ok := false;
        end;
        if ok then result := 'نجح';
        else result := 'فشل — صاحب الخروجة مش قادر يعدّل سطره'; end if;
        return next;
      end if;

      test := 'سلوكي · العدد برّه الحد بيترفض';
      ok := false;
      begin
        perform fn_create_sbota(tpl_id, ven_id, now() + interval '10 days',
                                v_set.member_sbota_max_capacity + 1, false, '__test__');
      exception when others then
        ok := true;
      end;
      if ok then result := 'نجح';
      else result := 'فشل — 🔴 عضو فتح خروجة بعدد برّه الحد'; end if;
      return next;

      test := 'سلوكي · ميعاد قريب أوي بيترفض';
      ok := false;
      begin
        perform fn_create_sbota(tpl_id, ven_id, now() + interval '1 hour', 6, false, '__test__');
      exception when others then
        ok := true;
      end;
      if ok then result := 'نجح';
      else result := 'فشل — 🔴 خروجة بعد ساعة، محدش هيلحق يحجز'; end if;
      return next;

      test := 'سلوكي · ميعاد بعيد أوي بيترفض';
      ok := false;
      begin
        perform fn_create_sbota(tpl_id, ven_id,
                                now() + make_interval(days => v_set.member_sbota_max_days_ahead + 5),
                                6, false, '__test__');
      exception when others then
        ok := true;
      end;
      if ok then result := 'نجح';
      else result := 'فشل — 🔴 حجز مكان لسنة جاية'; end if;
      return next;

      test := 'سلوكي · 🔴 «بنات بس» من راجل بتترفض';
      ok := false;
      begin
        perform fn_create_sbota(tpl_id, ven_id, now() + interval '11 days', 6, true, '__test__');
      exception when others then
        ok := true;
      end;
      if ok then result := 'نجح';
      else result := 'فشل — 🔴 راجل فتح خروجة بنات، ده خطر شخصي مش باج'; end if;
      return next;

      test := 'سلوكي · حد الخروجات المفتوحة بيقف';
      ok := false;
      begin
        -- بنجرّب نفتح أكتر من الحد بواحدة زيادة
        for n in 1 .. (v_set.member_sbota_max_open + 1) loop
          perform fn_create_sbota(tpl_id, ven_id,
                                  now() + make_interval(days => 13 + n), 6, false, '__test__');
        end loop;
      exception when others then
        ok := true;
      end;
      if ok then result := format('نجح — وقف عند %s', v_set.member_sbota_max_open);
      else result := 'فشل — 🔴 عضو واحد يقدر يغرق القايمة'; end if;
      return next;

      test := 'سلوكي · 🔴 العضو مش بيلغي خروجة حد تاني';
      if other_sb is null then
        result := 'نجح — اتخطى (مفيش عضو تاني)';
      else
        ok := false;
        begin
          perform fn_cancel_own_sbota(other_sb, '__test__');
        exception when others then
          ok := true;
        end;
        if ok then result := 'نجح';
        else result := 'فشل — 🔴 أي عضو بيلغي خروجة أي حد'; end if;
      end if;
      return next;

      test := 'سلوكي · العضو بيلغي خروجته هو';
      if new_id is null then
        result := 'نجح — اتخطى';
      else
        ok := false;
        begin
          ok := fn_cancel_own_sbota(new_id, '__test__');
        exception when others then
          ok := false;
        end;
        if ok then result := 'نجح';
        else result := 'فشل — صاحب الخروجة محبوس فيها'; end if;
      end if;
      return next;

      test := 'سلوكي · fn_my_hosted_sbotat بترجّع خروجاتي أنا بس';
      select count(*) into n from fn_my_hosted_sbotat() f
       where f.id = coalesce(other_sb, '00000000-0000-0000-0000-000000000000'::uuid);
      if n = 0 then result := 'نجح';
      else result := 'فشل — 🔴 شايف خروجات حد تاني'; end if;
      return next;

      execute format('set local role %I', me);
      perform set_config('request.jwt.claims', '', true);
    exception when others then
      execute format('set local role %I', me);
      perform set_config('request.jwt.claims', '', true);
      test := 'سلوكي · اختبار العضو';
      result := 'فشل — ' || sqlerrm;
      return next;
    end;
  end if;

  /* ===================== ٤ · التنضيف ==================================== */

  delete from sbotat where host_note_ar like '__test__%';
  test := 'تنضيف · سبوطات الاختبار اتمسحت';
  select count(*) into n from sbotat where host_note_ar like '__test__%';
  if n = 0 then result := 'نجح';
  else result := format('فشل — فاضل %s صف اختبار', n); end if;
  return next;
end;
$$;

comment on function test_member_sbotat() is
  'بتتأكد إن خروجات الأعضاء (0078) شغّالة ومقفولة صح: العضو بيفتح، والزائر لأ، والسعر من القالب، والسرية واقفة. select * from test_member_sbotat();';

revoke execute on function test_member_sbotat() from public, anon, authenticated;
