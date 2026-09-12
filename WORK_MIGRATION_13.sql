-- ============================================================================
-- WORK_MIGRATION_13.sql — العضو بيكتب خروجته بنفسه
--
-- ⚠ الزق الدفعات اللي قبله الأول (لحد ١٢). آمن يتكرر.
--
-- **المشكلة:** فورم «افتح خروجة» كان قايمتين اختيار — قوالب («إحنا
-- الرابع») وأماكن («كافيه التجمع») وكلهم **بيانات عرض مبذورة**. يعني
-- عضو يفتح خروجة حقيقية في مكان انت مالكش اتفاق معاه، بسعر مخترع،
-- والناس تحجز وتدفع.
--
-- **الشكل الجديد:** العضو **بيكتب** — اسم الخروجة · إيه اللي هتعملوه ·
-- المكان · العنوان بالتفاصيل · التكلفة التقريبية. والاختيارات بقت في
-- الحاجات الأساسية بس (المنطقة · الميعاد · المدة · العدد · بنات بس).
--
-- **تلات قرارات اتاخدت:**
--   ١) **الحجز في خروجة العضو ببلاش.** نسبوط ما بيمسكش فلوس نيابة عن حد.
--      «التكلفة التقريبية» اللي العضو بيكتبها **معلومة** بس، وكل واحد
--      بيدفع لنفسه في المكان.
--   ٢) **العنوان بيبان مع كشف المجموعة** (قبلها بيوم) ولصاحب حجز بس —
--      مش أول ما يحجز، علشان حد ما يحجزش ويلغي ويفضل عارف المكان.
--   ٣) **كل خروجة عضو مسوّدة لحد ما تعتمدها** من /admin/sbotat. وكلام
--      العضو كامل (بالعنوان) بيتعرضلك تحت الصف علشان تقراه قبل «اعتمد».
--      وفيه فلتر كلمات ممنوعة بيرفض **في القاعدة** قبل ما يوصلك أصلًا.
--
-- ⚠ الإعداد `member_sbota_auto_open` اتحط **false** — لو كنت غيّرته،
--    الملف ده هيرجّعه. تقدر تفتحه تاني من /admin/settings ← الأرقام.
--
-- ⚠ العضو لسه **ما بيبعتش سعر**. الدالة مفيهاش parameter للسعر خالص،
--    وخروجة العضو سعرها ورسومها صفر بالقوة من جوه القاعدة.
--
-- بعد ما يخلص:
--     select * from test_member_writes();
-- أو الزق `CHECK_DB.sql` — المفروض «مفيش ولا فشل».
-- ============================================================================



-- ############################################################################
-- # 20260912150000_0086_member_writes_sbota.sql
-- ############################################################################

-- ============================================================================
-- 0086 — العضو بيكتب خروجته بنفسه، مش بيختار من قايمة
--
-- **المشكلة:** فورم «افتح خروجة» كان بيخلّي العضو يختار من قايمة قوالب
-- وقايمة أماكن — وكلهم **بيانات عرض مبذورة** («إحنا الرابع» · «كافيه
-- التجمع»). يعني عضو يفتح خروجة حقيقية في مكان نسبوط مالوش اتفاق معاه،
-- بسعر مخترع، والناس تحجز وتدفع.
--
-- **الشكل الجديد:** العضو **بيكتب** — اسم الخروجة · إيه اللي هتعملوه ·
-- المكان · العنوان بالتفاصيل · التكلفة التقريبية. والاختيارات بقت في
-- الحاجات الأساسية بس (المنطقة · الميعاد · المدة · العدد · بنات بس).
--
-- **تلات قرارات حاكمة (من صاحب المشروع):**
--   ١) **الحجز في خروجة العضو ببلاش.** نسبوط ما بيمسكش فلوس نيابة عن حد.
--      العضو بيكتب التكلفة **كمعلومة** («حوالي 150 في المكان») وكل واحد
--      بيدفع لنفسه هناك. الطريق: `fn_book_free`.
--   ٢) **العنوان بيبان مع كشف المجموعة** (قبلها بيوم)، لصاحب حجز بس.
--      مش أول ما يحجز — علشان حد ما يحجزش ويلغي ويفضل عارف المكان.
--   ٣) **كل خروجة عضو مسوّدة لحد ما اللوحة تعتمدها**، وفيه فلتر كلمات
--      ممنوعة بيرفض على مستوى القاعدة قبل ما توصل اللوحة أصلًا.
--
-- ⚠ **ليه قالب عام بدل ما نخلي `template_id` يقبل null؟**
--    العمود ده `not null` وبيتعمل عليه join في `sbotat_public` وبيتقرا في
--    `fn_can_book` (بتستعمل `t.overnight`). تخليته nullable كان هيمشي في
--    الفيو وأربع دوال ومسارات الحجز كلها. القالب العام بيخلّي كل ده
--    **ما يتلمسش**، والبيانات المكتوبة بتغطي عليه في العرض. أقل مساحة كسر.
--
-- ⚠ الأمان: العضو لسه **ما بيبعتش سعر**. `fn_create_sbota` مفيهاش سعر
--    خالص — خروجة العضو سعرها صفر ورسومها صفر، بالقوة من جوه الدالة.
--
-- آمن يتكرر.
-- ============================================================================


-- ===== 1) القالب العام =====
-- بيانات محايدة. كل اللي بيظهر للناس بييجي من أعمدة السبوطة نفسها.
insert into sbota_templates (
  id, slug, name_ar, story_ar, kind, default_price, org_fee, duration_min,
  min_group, max_group, mood_ar, includes_ar, excludes_ar, is_day, girls_only, overnight
) values (
  '66666666-0000-0000-0000-000000000900',
  'khroga-men-3odw', 'خروجة من عضو',
  'خروجة عضو من نسبوط فتحها وكتب تفاصيلها بنفسه.',
  'games', 0, 0, 120, 2, 40, '', '{}', '{}', false, false, false
)
on conflict (id) do nothing;


-- ===== 2) أعمدة العضو =====
alter table sbotat add column if not exists title_ar      text;
alter table sbotat add column if not exists details_ar    text;
alter table sbotat add column if not exists venue_name_ar text;
alter table sbotat add column if not exists address_ar    text;
alter table sbotat add column if not exists cost_note_ar  text;

comment on column sbotat.title_ar      is 'اسم الخروجة بكلام صاحبها. بيغطّي على اسم القالب في العرض.';
comment on column sbotat.details_ar    is 'إيه اللي هتعملوه — بكلام صاحب الخروجة.';
comment on column sbotat.venue_name_ar is 'اسم المكان بكلام صاحب الخروجة (مش من جدول venues).';
comment on column sbotat.address_ar    is 'العنوان بالتفاصيل. ⚠ ما بيظهرش غير لصاحب حجز وبعد الكشف — شوف fn_sbota_address.';
comment on column sbotat.cost_note_ar  is
  'التكلفة التقريبية **كمعلومة بس**: «حوالي 150 في المكان». مش سعر ومش بيتحصّل — خروجة العضو الحجز فيها ببلاش على نسبوط.';


-- ===== 3) فلتر الكلمات الممنوعة =====
-- ⚠ على مستوى القاعدة مش الواجهة: الواجهة ممكن تتخطّى، والكتابة الحرة
--   بتوصل صفحة عامة. الحارس ده بيرفض قبل ما الصف يتكتب أصلًا.
create or replace function fn_guard_sbota_text()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  hit text;
  blob text;
begin
  -- الإدارة والكرون بيعدّوا — ده حارس على كتابة العضو
  if not fn_caller_is_browser() then return new; end if;

  blob := lower(concat_ws(' ', new.title_ar, new.details_ar, new.venue_name_ar,
                               new.address_ar, new.cost_note_ar, new.host_note_ar));
  if btrim(blob) = '' then return new; end if;

  select w.word into hit from banned_words w
   where blob like '%' || lower(w.word) || '%'
   limit 1;

  if hit is not null then
    raise exception 'الكلمة «%» مش من كلامنا — غيّرها وجرّب تاني', hit
      using errcode = '22023';
  end if;
  return new;
end;
$$;

comment on function fn_guard_sbota_text() is
  'بيرفض الكلمات الممنوعة في نصوص خروجة العضو. على مستوى القاعدة عشان الواجهة ممكن تتخطّى.';

drop trigger if exists t_guard_sbota_text on sbotat;
create trigger t_guard_sbota_text before insert or update on sbotat
  for each row execute function fn_guard_sbota_text();

revoke execute on function fn_guard_sbota_text() from public, anon, authenticated;


-- ===== 4) فتح خروجة — التوقيع الجديد =====
-- التوقيع القديم (قالب + مكان) مالهوش لازمة، وسيبانه معناه إن حد يقدر
-- يفتح خروجة عضو **بسعر** من برّه الفورم. بنشيله.
drop function if exists fn_create_sbota(uuid, uuid, timestamptz, int, boolean, text);

create or replace function fn_create_sbota(
  p_title        text,
  p_details      text,
  p_venue_name   text,
  p_address      text,
  p_area         area_t,
  p_starts_at    timestamptz,
  p_duration_min int,
  p_capacity     int,
  p_girls_only   boolean default false,
  p_cost_note    text    default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_set    settings%rowtype;
  v_open   int;
  v_gender gender_t;
  v_name   text;
  v_banned timestamptz;
  v_status sbota_status_t;
  v_id     uuid;
  v_tpl    uuid := '66666666-0000-0000-0000-000000000900';
begin
  -- ⚠ الشرط بيرفض لما يكون null. الزائر المجهول ومفتاح الخدمة الاتنين
  --   uid بتاعهم null — ومالهمش دعوة بالدالة دي.
  if v_uid is null then
    raise exception 'لازم تسجّل دخول الأول' using errcode = '42501';
  end if;

  if not exists (select 1 from feature_flags where key = 'member_sbota' and is_on) then
    raise exception 'فتح الخروجات مقفول دلوقتي' using errcode = '42501';
  end if;

  if fn_maintenance_on() then
    raise exception 'الموقع في صيانة دلوقتي' using errcode = '42501';
  end if;

  select banned_at, gender, first_name into v_banned, v_gender, v_name
    from profiles where id = v_uid;
  if not found then raise exception 'كمّل بياناتك الأول' using errcode = '42501'; end if;
  if v_banned is not null then raise exception 'حسابك موقوف' using errcode = '42501'; end if;

  select * into v_set from settings where id;

  -- ===== الكلام المكتوب =====
  if length(btrim(coalesce(p_title, ''))) < 4 then
    raise exception 'اكتب اسم للخروجة' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_details, ''))) < 20 then
    raise exception 'اكتب تفاصيل أكتر عن الخروجة' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_venue_name, ''))) < 3 then
    raise exception 'اكتب اسم المكان' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_address, ''))) < 10 then
    raise exception 'اكتب العنوان بالتفاصيل' using errcode = '22023';
  end if;

  -- ===== الحدود — كلها من settings =====
  if p_capacity < v_set.member_sbota_min_capacity or p_capacity > v_set.member_sbota_max_capacity then
    raise exception 'العدد لازم يكون بين % و %',
      v_set.member_sbota_min_capacity, v_set.member_sbota_max_capacity using errcode = '22023';
  end if;

  if p_duration_min < 30 or p_duration_min > 1440 then
    raise exception 'المدة مش منطقية' using errcode = '22023';
  end if;

  if p_starts_at < now() + make_interval(hours => v_set.member_sbota_min_lead_hours) then
    raise exception 'لازم تفتحها قبل الميعاد بـ % ساعة على الأقل',
      v_set.member_sbota_min_lead_hours using errcode = '22023';
  end if;

  if p_starts_at > now() + make_interval(days => v_set.member_sbota_max_days_ahead) then
    raise exception 'الميعاد ده بعيد أوي — أقصى حاجة % يوم',
      v_set.member_sbota_max_days_ahead using errcode = '22023';
  end if;

  select count(*) into v_open from sbotat
   where host_id = v_uid and origin = 'member'
     and status in ('draft','open','full','locked','running');
  if v_open >= v_set.member_sbota_max_open then
    raise exception 'عندك % خروجة مفتوحة خلاص — اقفل واحدة الأول',
      v_set.member_sbota_max_open using errcode = '22023';
  end if;

  if p_girls_only and v_gender is distinct from 'female' then
    raise exception 'خروجة البنات بتتفتح من بنت' using errcode = '42501';
  end if;

  v_status := case when v_set.member_sbota_auto_open then 'open'::sbota_status_t
                   else 'draft'::sbota_status_t end;

  -- ⚠ السعر والرسوم **صفر بالقوة**. مفيش parameter للسعر أصلًا — خروجة
  --   العضو الحجز فيها ببلاش، والتكلفة بتتكتب كمعلومة في cost_note_ar.
  insert into sbotat (
    template_id, venue_id, starts_at, ends_at,
    price, org_fee, capacity, status, girls_only, is_day, area,
    origin, host_id, host_name_ar,
    title_ar, details_ar, venue_name_ar, address_ar, cost_note_ar
  ) values (
    v_tpl, null, p_starts_at, p_starts_at + make_interval(mins => p_duration_min),
    0, 0, p_capacity, v_status, p_girls_only,
    extract(hour from p_starts_at at time zone 'Africa/Cairo') < 17,
    p_area, 'member', v_uid, v_name,
    btrim(p_title), btrim(p_details), btrim(p_venue_name), btrim(p_address),
    nullif(btrim(coalesce(p_cost_note, '')), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

comment on function fn_create_sbota(text, text, text, text, area_t, timestamptz, int, int, boolean, text) is
  'الطريق الوحيد لعضو يفتح خروجة. العضو بيكتب كل حاجة، والسعر صفر بالقوة — مفيش parameter للسعر.';

revoke execute on function fn_create_sbota(text, text, text, text, area_t, timestamptz, int, int, boolean, text) from public, anon;
grant  execute on function fn_create_sbota(text, text, text, text, area_t, timestamptz, int, int, boolean, text) to authenticated;


-- ===== 5) حجز ببلاش =====
-- سياسة `bookings_own_insert` (0054) بتسمح للعضو بـ`pending_payment` وصفر
-- فلوس بس — وده صح ومش هنضعّفه. الدالة دي هي الطريق المشروع للتأكيد.
create or replace function fn_book_free(p_sbota_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_s   sbotat;
  v_why text;
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'لازم تسجّل دخول الأول' using errcode = '42501';
  end if;

  select * into v_s from sbotat where id = p_sbota_id;
  if not found then raise exception 'الخروجة دي مش موجودة' using errcode = '22023'; end if;

  -- ⚠ الحارس الأهم: الطريق ده لخروجات الأعضاء المجانية **بس**. من غيره
  --   كان بيبقى باب حجز ببلاش في سبوطات نسبوط المدفوعة.
  if v_s.origin is distinct from 'member' or v_s.price <> 0 then
    raise exception 'الخروجة دي بتتحجز بالدفع' using errcode = '42501';
  end if;

  v_why := fn_can_book(v_uid, p_sbota_id);
  if v_why is not null then raise exception '%', v_why using errcode = '22023'; end if;

  insert into bookings (sbota_id, profile_id, status, price_paid, discount, wallet_used)
  values (p_sbota_id, v_uid, 'paid', 0, 0, 0)
  returning id into v_id;

  return v_id;
end;
$$;

comment on function fn_book_free(uuid) is
  'حجز في خروجة عضو مجانية. بيرفض أي سبوطة سعرها مش صفر أو مش من عضو.';

revoke execute on function fn_book_free(uuid) from public, anon;
grant  execute on function fn_book_free(uuid) to authenticated;


-- ===== 6) العنوان: مع الكشف، لصاحب حجز بس =====
-- ⚠ التوقيع القديم بيرجّع الإحداثيات كمان، وPostgres ما بيسمحش تغيّر نوع
--   الرجوع بـ`create or replace`. بندروبه الأول وبنحافظ على نفس الأعمدة
--   الأربعة علشان ما نكسرش أي نداء قايم.
drop function if exists fn_sbota_address(uuid);

create or replace function fn_sbota_address(s_id uuid)
returns table (address text, map_lat numeric, map_lng numeric, venue_name text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_s   sbotat;
begin
  if v_uid is null then return; end if;
  select * into v_s from sbotat where id = s_id;
  if not found then return; end if;

  if v_s.origin = 'member' then
    -- خروجة عضو: حجز نشط **و** بعد الكشف. مش أول ما يحجز — علشان حد
    -- ما يحجزش ويلغي ويفضل عارف المكان.
    if v_s.reveal_at is null or now() < v_s.reveal_at then return; end if;
    if not exists (
      select 1 from bookings b
       where b.sbota_id = s_id and b.profile_id = v_uid
         and b.status in ('paid','attended')
    ) then return; end if;

    -- مفيش إحداثيات لخروجة العضو — هو كتب عنوان مش نقطة على الخريطة
    return query select v_s.address_ar, null::numeric, null::numeric, v_s.venue_name_ar;
  else
    -- سبوطة نسبوط: زي ما هي — صاحب حجز مدفوع.
    if not exists (
      select 1 from bookings b
       where b.sbota_id = s_id and b.profile_id = v_uid
         and b.status in ('paid','attended')
    ) then return; end if;

    return query select v.address, v.map_lat, v.map_lng, v.name
                   from venues v where v.id = v_s.venue_id;
  end if;
end;
$$;

comment on function fn_sbota_address(uuid) is
  'العنوان لصاحب حجز بس. سبوطة نسبوط: بعد الدفع. خروجة عضو: بعد الكشف كمان.';

revoke execute on function fn_sbota_address(uuid) from public, anon;
grant  execute on function fn_sbota_address(uuid) to authenticated;


-- ===== 7) الفيو: كلام العضو بيغطّي على القالب =====
create or replace view sbotat_public
with (security_invoker = true)
as
select
  s.id, s.template_id, s.venue_id, s.captain_id,
  s.starts_at, s.ends_at, s.price, s.org_fee, s.capacity,
  s.status, s.girls_only, s.is_day, s.is_mystery,
  s.booking_closes_at, s.reveal_at,
  s.area, s.area_label_ar,
  t.slug,
  coalesce(nullif(btrim(s.title_ar), ''),   t.name_ar)  as name_ar,
  coalesce(nullif(btrim(s.details_ar), ''), t.story_ar) as story_ar,
  t.kind, t.mood_ar,
  t.meta_prefix_ar, t.level_ar,
  t.includes_ar, t.excludes_ar,
  -- المدة الحقيقية من الميعادين — العضو بيختارها، والقالب العام مالوش دخل
  greatest(1, (extract(epoch from (s.ends_at - s.starts_at)) / 60)::int) as duration_min,
  t.hero_photos, t.overnight,
  s.is_work,
  t.work_config,
  s.origin,
  s.host_id,
  s.host_name_ar,
  s.host_note_ar,
  -- ⚠ اسم المكان بس. `address_ar` **مش** هنا عن قصد — مصدره الوحيد
  --   `fn_sbota_address` وهي بتتحقق من الحجز والكشف.
  s.venue_name_ar,
  s.cost_note_ar
from sbotat s
join sbota_templates t on t.id = s.template_id
where s.status in ('open', 'full', 'locked', 'running');

comment on view sbotat_public is
  'السبوطات المعروضة للكل. security_invoker — بيحترم RLS. مفيش عنوان ولا إحداثيات هنا خالص؛ مصدرهم الوحيد fn_sbota_address.';

grant select on sbotat_public to anon, authenticated;


-- ===== 8) خروجة العضو تستنى الموافقة =====
update settings set member_sbota_auto_open = false where id;


-- ===== 10) الاختبار القديم اتظبط =====
-- ⚠ `test_member_sbotat()` (من 0079) بتنادي التوقيع القديم اللي شيلناه
--    فوق، فبقت بتقول «فشل» وهي سليمة. الدرس المكتوب في CLAUDE.md §٨:
--    لو هجرة جديدة بتلغي أثر هجرة قديمة، **ارجع للقديمة وظبّطها** بدل ما
--    تسيب اختبار أحمر بيدرّب الناس إنها تتجاهل الأحمر.
--
--    الفحوصات البنيوية اللي لسه صح فضلت هنا، والسلوك بقى في
--    `test_member_writes()`.
create or replace function test_member_sbotat()
returns table (test text, result text)
language plpgsql
set search_path = public
as $$
declare n int;
begin
  test := '0078 · نوع sbota_origin_t موجود بقيمتين';
  select count(*) into n from pg_enum e join pg_type t on t.oid = e.enumtypid
   where t.typname = 'sbota_origin_t';
  if n = 2 then result := 'نجح'; else result := format('فشل — %s قيمة', n); end if;
  return next;

  test := '0078 · أعمدة صاحب الخروجة على sbotat';
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'sbotat'
     and column_name in ('origin','host_id','host_name_ar','host_note_ar');
  if n = 4 then result := 'نجح — ٤ أعمدة'; else result := format('فشل — %s من ٤', n); end if;
  return next;

  test := '0078 · 🔴 مفيش سياسة insert للعضو على sbotat';
  select count(*) into n from pg_policies
   where tablename = 'sbotat' and cmd in ('INSERT','ALL')
     and coalesce(with_check,'') not like '%fn_is_admin%'
     and coalesce(with_check,'') not like '%fn_has_permission%';
  if n = 0 then result := 'نجح — الطريق الوحيد fn_create_sbota';
  else result := format('فشل — 🔴 %s سياسة بتسمح بكتابة مباشرة', n); end if;
  return next;

  test := '0078 · الدوال مسحوبة من anon';
  select count(*) into n from pg_proc p
   where p.proname in ('fn_create_sbota','fn_update_own_sbota','fn_cancel_own_sbota',
                       'fn_my_hosted_sbotat','fn_book_free')
     and has_function_privilege('anon', p.oid, 'execute');
  if n = 0 then result := 'نجح — كلهم مقفولين على المجهول';
  else result := format('فشل — 🔴 %s دالة مفتوحة للزائر', n); end if;
  return next;

  test := '0078 · صاحب الخروجة داخل فحص الكشف (مش باب جنبي)';
  if (select prosrc from pg_proc where proname = 'fn_is_my_sbota_revealed') like '%host_id%'
     and (select prosrc from pg_proc where proname = 'fn_is_my_sbota_revealed') like '%reveal_at%' then
    result := 'نجح — نفس شرط الكابتن، بعد الكشف بس';
  else result := 'فشل — السرية اتكسرت'; end if;
  return next;

  test := '0078 · السلوك بقى في test_member_writes (0086)';
  if to_regprocedure('test_member_writes()') is not null then
    result := 'نجح';
  else result := 'فشل — الاختبار السلوكي مش موجود'; end if;
  return next;
end;
$$;

revoke execute on function test_member_sbotat() from public, anon, authenticated;


-- ===== 9) اختبار =====
create or replace function test_member_writes()
returns table (test text, result text)
language plpgsql
set search_path = public
as $$
declare
  n    int;
  me   text := current_user;
  uid  uuid;
  sid  uuid;
  ok   boolean;
begin
  test := '0086 · أعمدة كلام العضو الخمسة';
  select count(*) into n from information_schema.columns
   where table_schema='public' and table_name='sbotat'
     and column_name in ('title_ar','details_ar','venue_name_ar','address_ar','cost_note_ar');
  if n = 5 then result := 'نجح'; else result := format('فشل — %s من ٥', n); end if;
  return next;

  test := '0086 · 🔴 fn_create_sbota مفيهاش قالب ولا مكان ولا سعر';
  if (select pg_get_function_identity_arguments(oid) from pg_proc where proname='fn_create_sbota')
       not like '%uuid%' then
    result := 'نجح — العضو بيكتب، مش بيختار';
  else result := 'فشل — لسه بياخد معرّفات'; end if;
  return next;

  test := '0086 · 🔴 العنوان مش في الفيو العام';
  if not exists (
    select 1 from information_schema.columns
     where table_schema='public' and table_name='sbotat_public' and column_name='address_ar'
  ) then result := 'نجح'; else result := 'فشل — 🔴 العنوان مكشوف للزائر'; end if;
  return next;

  test := '0086 · خروجة العضو مسوّدة لحد ما تعتمدها';
  if exists (select 1 from settings where id and not member_sbota_auto_open) then
    result := 'نجح';
  else result := 'فشل — بتتنشر من غير مراجعة'; end if;
  return next;

  test := '0086 · حارس الكلمات الممنوعة موجود';
  if exists (select 1 from pg_trigger where tgname = 't_guard_sbota_text') then
    result := 'نجح';
  else result := 'فشل'; end if;
  return next;

  /* ===== سلوكي ===== */
  select p.id into uid from profiles p
   where p.gender='male' and p.banned_at is null
     and not exists (select 1 from admin_users a where a.profile_id=p.id and a.is_active)
   limit 1;

  if uid is null then
    test := 'سلوكي · العضو بيكتب خروجته';
    result := 'نجح — اتخطى (مفيش عضو عادي)';
    return next;
    return;
  end if;

  begin
    perform set_config('request.jwt.claims',
      json_build_object('sub', uid::text, 'role','authenticated')::text, true);
    execute 'set local role authenticated';

    test := 'سلوكي · العضو **بيفتح** خروجة بكلامه (متكسرش الميزة)';
    sid := null;
    begin
      sid := fn_create_sbota('خروجة اختبار', 'هنقعد نتكلم ونشرب قهوة ونلعب طاولة مع بعض.',
                             'كافيه الاختبار', 'شارع الاختبار، الدور التاني، فوق الصيدلية',
                             'maadi', now() + interval '10 days', 120, 6, false, '__test__ حوالي 100');
    exception when others then result := 'فشل — ' || sqlerrm; end;
    if sid is not null then result := 'نجح';
    elsif result is null then result := 'فشل — رجعت null'; end if;
    return next;

    if sid is not null then
      test := 'سلوكي · 🔴 السعر والرسوم صفر بالقوة';
      select count(*) into n from sbotat where id = sid and price = 0 and org_fee = 0;
      if n = 1 then result := 'نجح'; else result := 'فشل — 🔴 فيه فلوس على خروجة عضو'; end if;
      return next;

      test := 'سلوكي · الخروجة اتفتحت مسوّدة';
      select count(*) into n from sbotat where id = sid and status = 'draft';
      if n = 1 then result := 'نجح — مستنية الاعتماد';
      else result := 'فشل — اتنشرت من غير مراجعة'; end if;
      return next;

      test := 'سلوكي · العنوان **ما بيظهرش** قبل الكشف';
      select count(*) into n from fn_sbota_address(sid);
      if n = 0 then result := 'نجح';
      else result := 'فشل — 🔴 العنوان باين بدري'; end if;
      return next;
    end if;

    test := 'سلوكي · 🔴 كلمة ممنوعة بتترفض';
    ok := false;
    begin
      perform fn_create_sbota('خروجة تعارف', 'هنقعد نتكلم ونشرب قهوة ونلعب طاولة مع بعض.',
                              'كافيه', 'شارع الاختبار الدور التاني',
                              'maadi', now() + interval '11 days', 120, 6, false, '__test__');
    exception when others then ok := true; end;
    if ok then result := 'نجح';
    else result := 'فشل — 🔴 كلمة ممنوعة اتنشرت'; end if;
    return next;

    test := 'سلوكي · تفاصيل قصيرة بتترفض';
    ok := false;
    begin
      perform fn_create_sbota('خروجة', 'قهوة', 'كافيه', 'شارع الاختبار الدور التاني',
                              'maadi', now() + interval '12 days', 120, 6, false, '__test__');
    exception when others then ok := true; end;
    if ok then result := 'نجح'; else result := 'فشل — خروجة من غير تفاصيل'; end if;
    return next;

    test := 'سلوكي · 🔴 fn_book_free بترفض سبوطة مدفوعة';
    ok := false;
    begin
      perform fn_book_free((select id from sbotat where price > 0 and status='open' limit 1));
    exception when others then ok := true; end;
    if ok then result := 'نجح';
    else result := 'فشل — 🔴 حجز ببلاش في سبوطة مدفوعة'; end if;
    return next;

    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);
  exception when others then
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);
    test := 'سلوكي · اختبار العضو'; result := 'فشل — ' || sqlerrm; return next;
  end;

  delete from sbotat where cost_note_ar like '__test__%' or details_ar like '%نلعب طاولة مع بعض%';
  test := 'تنضيف · خروجات الاختبار اتمسحت';
  result := 'نجح';
  return next;
end;
$$;

comment on function test_member_writes() is
  'بتتأكد إن العضو بيكتب خروجته والسعر صفر والعنوان مستخبي والكلمات الممنوعة مرفوضة. select * from test_member_writes();';

revoke execute on function test_member_writes() from public, anon, authenticated;

-- ############################################################################
-- # 20260912150100_0087_new_form_copy.sql
-- ############################################################################

-- ============================================================================
-- 0087 — نصوص فورم «اكتب خروجتك»
--
-- الفورم بقى كتابة بدل اختيار (0086)، فالخانات اتغيّرت. الملف ده بيحط
-- نصوص الخانات الجديدة وبيشيل نصوص القوايم اللي بطّل لها لزمة.
--
-- آمن يتكرر.
-- ============================================================================

insert into copy_strings (key, value_ar, screen, context_ar) values
  ('host.new.name', 'اسم الخروجة', 'خروجات الأعضاء', 'عنوان خانة الاسم — العضو بيكتبه بنفسه'),
  ('host.new.namePh', 'قهوة وطاولة في المعادي', 'خروجات الأعضاء', 'مثال جوه الخانة'),
  ('host.new.details', 'إيه اللي هتعملوه؟', 'خروجات الأعضاء', 'عنوان خانة التفاصيل'),
  ('host.new.detailsPh', 'هنقعد نشرب قهوة ونلعب طاولة. الجو هادي والكلام كتير. مفيش حاجة رسمية — تعالى بس.', 'خروجات الأعضاء', 'مثال جوه الخانة'),
  ('host.new.venuePh', 'كافيه البوسطة', 'خروجات الأعضاء', 'مثال جوه خانة المكان'),
  ('host.new.address', 'العنوان بالتفاصيل', 'خروجات الأعضاء', 'عنوان خانة العنوان'),
  ('host.new.addressPh', 'شارع 9، المعادي — جنب محطة المترو، الدور الأول فوق الصيدلية', 'خروجات الأعضاء', 'مثال جوه الخانة'),
  ('host.new.addressHint', 'العنوان ده ما بيظهرش لحد غير اللي حاجز، ووقت كشف المجموعة بس. اكتبه كامل عشان محدش يتوه.', 'خروجات الأعضاء', 'سطر تحت خانة العنوان — بيطمّن صاحب الخروجة'),
  ('host.new.area', 'المنطقة', 'خروجات الأعضاء', 'عنوان خانة المنطقة'),
  ('host.new.pickArea', 'اختار المنطقة', 'خروجات الأعضاء', 'الخانة وهي فاضية'),
  ('host.new.duration', 'هتقعدوا قد إيه؟', 'خروجات الأعضاء', 'عنوان خانة المدة'),
  ('host.new.durationValue', '{{h}} ساعة', 'خروجات الأعضاء', 'شكل كل اختيار في قايمة المدة'),
  ('host.new.cost', 'التكلفة التقريبية', 'خروجات الأعضاء', 'عنوان خانة التكلفة'),
  ('host.new.costPh', 'حوالي 120 جنيه في المكان', 'خروجات الأعضاء', 'مثال جوه الخانة'),
  ('host.new.costHint', 'معلومة للناس بس — نسبوط مش بياخد منهم فلوس. كل واحد بيدفع لنفسه في المكان.', 'خروجات الأعضاء', 'سطر تحت خانة التكلفة'),
  ('host.new.reviewNote', 'خروجتك بتتراجع من نسبوط الأول، وبعدين تظهر للناس. مش بتاخد وقت.', 'خروجات الأعضاء', 'سطر بيوضّح إن فيه مراجعة'),
  ('host.sbota.free', 'ببلاش', 'خروجات الأعضاء', 'بدل السعر في صفحة خروجة العضو'),
  ('host.sbota.costLine', '{{cost}} — بتدفعها في المكان، نسبوط مش بياخد منك حاجة.', 'خروجات الأعضاء', 'سطر التكلفة اللي صاحب الخروجة كتبها'),
  ('host.sbota.freeNote', 'الحجز ببلاش. لو في تكلفة في المكان، بتدفعها هناك.', 'خروجات الأعضاء', 'لو صاحب الخروجة ما كتبش تكلفة'),
  ('host.sbota.bookCta', 'أنا جاي', 'خروجات الأعضاء', 'زرار الحجز في خروجة العضو'),
  ('host.sbota.booking', 'بنحجزلك…', 'خروجات الأعضاء', 'الزرار وهو شغّال'),
  ('host.sbota.bookErr', 'مقدرناش نحجزلك. جرّب تاني.', 'خروجات الأعضاء', 'خطأ عام — القاعدة بترجّع سبب أوضح')
on conflict (key) do update
  set value_ar   = excluded.value_ar,
      screen     = excluded.screen,
      context_ar = coalesce(excluded.context_ar, copy_strings.context_ar);

-- نصوص القوايم القديمة — الفورم مابقاش فيه اختيار قالب ولا مكان
delete from copy_strings where key in ('host.new.type', 'host.new.pickType', 'host.new.pickVenue', 'host.new.priceNote', 'host.new.priceFrom', 'host.new.notePlaceholder');


-- ===== اختبار =====
create or replace function test_new_form_copy()
returns table (test text, result text)
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  test := '0087 · كل خانات فورم الكتابة وصفحة الخروجة ليها نص';
  -- بنعد بالبادئة مش بقايمة مكتوبة بالإيد — القايمة اليدوية بتتأخر عن
  -- الملف أول ما حد يضيف مفتاح، والاختبار يقول «فشل» وهو سليم.
  select count(*) into n from copy_strings
   where key like 'host.new.%' or key like 'host.sbota.%';
  if n >= 30 then result := format('نجح — %s نص', n);
  else result := format('فشل — %s بس، في خانة هتطلع بمفتاحها', n); end if;
  return next;

  test := '0087 · نصوص القوايم القديمة اتشالت';
  select count(*) into n from copy_strings where key in ('host.new.type', 'host.new.pickType', 'host.new.pickVenue', 'host.new.priceNote', 'host.new.priceFrom', 'host.new.notePlaceholder');
  if n = 0 then result := 'نجح'; else result := format('فشل — %s لسه موجود', n); end if;
  return next;
end;
$$;

revoke execute on function test_new_form_copy() from public, anon, authenticated;
