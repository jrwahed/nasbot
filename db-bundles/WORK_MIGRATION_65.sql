-- ==========================================================================
-- WORK_MIGRATION_65.sql — «يلا»: الويك اند + الكلام
--
-- طلب المالك (٢٠٢٦-١١-١٥) بعد ما شاف نافذة الاختيار وفيها ٢١ ميعاد و١٦
-- منطقة: «مش عاوز الاقتراحات دي كلها. عاوز الويك اند، وهو يكتب الميعاد
-- أو الأوقات اللي فاضي فيها والمكان من غير اقتراحات. وتفاعل زي السوشيال
-- ميديا — كومنتات ولايكات، بس من غير ما تبيّن: اسم بس، ومحدش يعرف يدوس
-- عليهم يفتحهم».
--
-- واتسألت عن نطاق الرؤية واخترت الأضيق في التلاتة:
--   · الاسم الأول وبس — **مفيش ولا صورة**.
--   · **الأعضاء المسجّلين بس** يشوفوا الكلام.
--   · «جايين: ٤» يفضل **رقم مش أسامي** — الدوسة مجهولة، واللي بيكتب هو
--     اللي بيختار يبان.
--
-- ملف واحد، مستقل، وآمن يتكرر (اتجرّب تلات لزقات + بـ\r\n).
-- ⚠ محتاج WORK_MIGRATION_59–62 («يلا») و_64 (البوست) قبله.
--
-- ⚠ **بيعيد تعريف `fn_yalla_post`** اللي جاية من `_64`. فلو لزقت `_64` تاني
--    بعده، **الزق ده تاني وراه** — وإلا الاقتراحات الـ٢١ بترجع.
--    (`test_yalla_social()` بيقولك: صف «ميعاد واحد ومنطقة واحدة» بيبقى أحمر.)
--
-- بعده شغّل:
--
--   select * from test_yalla_social();   -- ٢٠ صف، كلهم «نجح»
--
-- (مش محتاج بذرة — بيستعمل حساب اللوحة وأي عضو مش أدمن.)
-- ==========================================================================

-- ########################################################################
-- # 20261115180000_0147_yalla_social.sql
-- ########################################################################

-- ============================================================================
-- 0147 · «يلا» بوست: الويك اند + كومنتات ولايكات
--
-- طلب المالك (٢٠٢٦-١١-١٥) بعد ما شاف نافذة الاختيار: «مش عاوز الاقتراحات
-- دي كلها. عاوز **الويك اند**، وهو يكتب الميعاد أو الأوقات اللي فاضي فيها
-- والمكان **من غير اقتراحات**. وتفاعل زي السوشيال ميديا — كومنتات ولايكات».
--
-- 🔴 **ده بيلغي تلات قرارات من المالك نفسه**، واتقال له صريح واتاخد القرار
--    بعد تلات أسئلة عن **نطاق الرؤية** (نفس ما حصل في ألبوم الصور، §٨):
--      · «مفيش لايكات ولا كومنتات» في «يلا» — كان في أول برومبت.
--      · «مش عايزه خالص: كومنتات · نص حر ظاهر للعامة · بروفايلات».
--      · §٣.٧ «مش تطبيق تعارف — مفيش صور قبل الكشف، والاختيار سري».
--
--    **والنطاق اللي اختاره هو الأضيق في التلاتة:**
--      1. **الاسم الأول بس — مفيش ولا صورة.** فقاعدة «مفيش صور قبل الكشف»
--         ما اتكسرتش، ونسبوط ما بقاش شكله تطبيق تعارف.
--      2. **الأعضاء المسجّلين بس** يشوفوا الكلام. الزائر يشوف البوست
--         والأعداد وخلاص.
--      3. **«جايين: ٤» يفضل رقم — مش أسامي.** يعني:
--         🔑 **الدوسة لوحدها مجهولة، والكومنت هو اللي العضو بيختار يبان فيه.**
--         ودي اللي بتخلي «الاختيار سري» لسه صح: اللي عايز يفضل مستخبي يدوس
--         وبس، واللي بيكتب بيكشف نفسه **بإرادته**.
--
-- ⚠ **ليه الاختيار بقى واحد جوّه بدل ما يتشال خالص؟** `fn_yalla_lock`
--   والقعدة ونص ولاد ونص بنات وقايمة الانتظار والأولوية والإشعارات — كلهم
--   شغالين على (ميعاد × منطقة) كسبانين. لو شلنا الاختيار كنا هنكتب نسخة
--   تانية من كل ده (الدرس الستاشر). فالنداء من بوست بيتعمل بـ**ميعاد واحد
--   ومنطقة واحدة** مخفيين تمامًا عن الواجهة — سباكة بس — وكل اللي بيدوس
--   «أنا جاي» بيختارهم. فالقفل التلقائي لما العدد يكمل **لسه شغّال**،
--   والمالك بيعدّل الميعاد والمكان الحقيقيين وقت القفل.
--
-- آمنة تتكرر.
-- ============================================================================

-- ===== 1) نوع النداء =====
-- ⚠ `post` هو الافتراضي لأن كل نداء جديد بيتعمل من `fn_yalla_post`.
--   والنداء القديم اللي المالك عمله بالفورم القديم بيفضل `choice`.
do $$
begin
  if not exists (select 1 from pg_type where typname = 'yalla_kind_t') then
    create type yalla_kind_t as enum ('choice', 'post');
  end if;
end $$;

alter table yalla_calls add column if not exists kind yalla_kind_t not null default 'post';

comment on column yalla_calls.kind is
  '0147 — post: بوست بالويك اند وكومنتات (الافتراضي). choice: النداء القديم اللي الناس بتختار فيه من مواعيد ومناطق.';

-- 🔴 **النداءات القديمة بتتعلّم بالشكل مش بالوقت.** أول نسخة كانت بتقول
--   `created_at < '2026-11-15 14:00:00+00'` — واتضح على الإنتاج إن المالك
--   نزّل **تلات نداءات الساعة ٦ مساءً** بفورم `0146`، يعني بعد الحد ده.
--   فكانوا هياخدوا `post`، والواجهة كانت هتعرضلهم «أنا جاي» بدوسة واحدة،
--   و`fn_yalla_im_in` كانت هتحجز العضو على **أول ميعاد في الـ٢١** — ميعاد
--   عشوائي محدش اختاره.
--
--   الشكل بيقول الحقيقة: البوست **ميعاد واحد ومنطقة واحدة**، والقديم أكتر.
--   (نفس الدرسين العاشر والتمانية وعشرين: اتفحص على الثابت الحقيقي مش على
--   تخمين بيتغيّر مع البيئة.)
update yalla_calls c set kind = 'choice'
 where c.kind = 'post'
   and ((select count(*) from yalla_slots s      where s.call_id = c.id) > 1
     or (select count(*) from yalla_call_areas a where a.call_id = c.id) > 1);


-- ===== 2) الكومنتات =====
create table if not exists yalla_comments (
  id         uuid primary key default extensions.gen_random_uuid(),
  call_id    uuid not null references yalla_calls (id) on delete cascade,
  profile_id uuid not null references profiles (id)    on delete cascade,
  body_ar    text not null,
  created_at timestamptz not null default now()
);

create index if not exists yalla_comments_call on yalla_comments (call_id, created_at);

alter table yalla_comments enable row level security;

-- 🔴 **مفيش ولا سياسة — ولا لصاحب الصف** (نفس قاعدة §٥.٥ بتاعة «قضية
--    الليلة» و«يلا»). القراية من `fn_yalla_comments` بس، والكتابة من
--    `fn_yalla_say` بس. السبب هنا مش سر اللعبة — ده إن الجدول فيه
--    `profile_id`، ولو الواجهة قدرت تقراه مباشرة كان أي حد يربط الكلام
--    بالحساب ويعمل منه بروفايل. الدالة بترجّع **الاسم الأول بس**.
comment on table yalla_comments is
  '0147 — كلام الأعضاء تحت نداء «يلا». مفيش سياسات خالص: القراية من fn_yalla_comments والكتابة من fn_yalla_say.';


-- ===== 3) الكتابة =====
create or replace function fn_yalla_say(p_call uuid, p_body text)
returns uuid
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_uid  uuid := auth.uid();
  v_body text := btrim(coalesce(p_body, ''));
  v_bad  text;
  v_id   uuid;
  v_n    int;
begin
  -- 🔴 المقارنة مش حارس — الفحص الصريح هو الحارس (الدرس الخمسة وعشرين).
  if v_uid is null then
    raise exception 'لازم تسجّل الأول' using errcode = '42501';
  end if;
  if v_body = '' then
    raise exception 'اكتب حاجة' using errcode = '22023';
  end if;
  if length(v_body) > 400 then
    raise exception 'الكلام طويل أوي — ٤٠٠ حرف كحد أقصى' using errcode = '22023';
  end if;

  if not exists (select 1 from yalla_calls c
                  where c.id = p_call and c.status = 'open') then
    raise exception 'النداء مقفول' using errcode = '22023';
  end if;

  -- ⚠ نفس مصدر الكلمات الممنوعة بتاع `fn_guard_sbota_text` — مش نسخة.
  select string_agg(w.word, '، ') into v_bad
    from banned_words w
   where v_body ilike '%' || w.word || '%';
  if v_bad is not null then
    raise exception 'في كلمات مش بنستعملها: %', v_bad using errcode = '22023';
  end if;

  -- ⚠ حد بسيط يمنع السيل: `settings.yalla_max_comments` لكل نداء لكل عضو.
  select count(*) into v_n from yalla_comments
   where call_id = p_call and profile_id = v_uid;
  if v_n >= (select coalesce(yalla_max_comments, 5) from settings limit 1) then
    raise exception 'كتبت كتير في النداء ده' using errcode = '22023';
  end if;

  insert into yalla_comments (call_id, profile_id, body_ar)
  values (p_call, v_uid, v_body)
  returning id into v_id;

  return v_id;
end $body$;

comment on function fn_yalla_say(uuid, text) is
  '0147 — العضو يكتب تحت النداء. الطريق الوحيد للكتابة (مفيش سياسة insert).';
revoke execute on function fn_yalla_say(uuid, text) from public, anon;
grant execute on function fn_yalla_say(uuid, text) to authenticated;


-- ===== 4) القراية =====
create or replace function fn_yalla_comments(p_call uuid)
returns table (
  id         uuid,
  first_name text,
  body_ar    text,
  created_at timestamptz,
  mine       boolean
)
language sql
stable
security definer
set search_path = public
as $$
  -- 🔴 **للأعضاء المسجّلين بس** (قرار المالك). المجهول بياخد **ولا صف**،
  --    مش استثناء — عشان الصفحة تفضل تفتح للزائر والقسم يختفي بس.
  -- 🔴 **ومفيش `profile_id` في اللي بيرجع** — الاسم الأول وبس. من غير كده
  --    الواجهة تقدر تجمّع كلام العضو من كل النداءات وتعمل منه بروفايل.
  select c.id,
         coalesce(nullif(btrim(p.first_name), ''), 'عضو'),
         c.body_ar,
         c.created_at,
         c.profile_id = auth.uid()
    from yalla_comments c
    join profiles p on p.id = c.profile_id
   where c.call_id = p_call
     and auth.uid() is not null
     and p.deleted_at is null
   order by c.created_at;
$$;

comment on function fn_yalla_comments(uuid) is
  '0147 — كلام نداء «يلا»: الاسم الأول والنص بس، وللأعضاء المسجّلين بس. مفيش profile_id ولا صورة.';
revoke execute on function fn_yalla_comments(uuid) from public, anon;
grant execute on function fn_yalla_comments(uuid) to authenticated;


-- ===== 5) امسح كلامك =====
create or replace function fn_yalla_unsay(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_uid uuid := auth.uid();
  v_n   int;
begin
  if v_uid is null then
    raise exception 'لازم تسجّل الأول' using errcode = '42501';
  end if;
  -- صاحب الكلام أو اللوحة. ⚠ `fn_has_permission` مش `fn_is_admin` (§٥.٢).
  update yalla_comments
     set body_ar = body_ar
   where id = p_id
     and (profile_id = v_uid or fn_has_permission('sbotat.edit'));
  get diagnostics v_n = row_count;
  if v_n = 0 then return false; end if;

  delete from yalla_comments
   where id = p_id
     and (profile_id = v_uid or fn_has_permission('sbotat.edit'));
  return true;
end $body$;

comment on function fn_yalla_unsay(uuid) is
  '0147 — امسح كلامك (أو اللوحة بصلاحية sbotat.edit).';
revoke execute on function fn_yalla_unsay(uuid) from public, anon;
grant execute on function fn_yalla_unsay(uuid) to authenticated;


-- ===== 6) رقم الحد =====
alter table settings add column if not exists yalla_max_comments int not null default 5;
comment on column settings.yalla_max_comments is 'أكتر كام كومنت للعضو الواحد في النداء الواحد';


-- ===== 7) النداء بقى «الويك اند» =====
-- ⚠ **منسوخة من `0146` وفيها تعديل واحد**: المواعيد بقت **ميعاد واحد
--   مخفي** بدل ٢١ معروضين، والمنطقة **واحدة مخفية** بدل ١٦.
--   الاتنين سباكة لـ`fn_yalla_lock` بس — الواجهة ما بتعرضهمش خالص،
--   والمالك بيكتب الحقيقيين وقت القفل (`fn_yalla_lock_post`).
create or replace function fn_yalla_post(p_line text)
returns uuid
language plpgsql
security definer
set search_path = public
as $body$
declare
  s          settings;
  v_template uuid;
  v_area     text;
  v_friday   timestamptz;
  v_id       uuid;
  v_today    date;
  v_dow      int;
  v_add      int;
begin
  if fn_caller_is_browser() and not fn_has_permission('sbotat.edit') then
    raise exception 'محتاج صلاحية sbotat.edit' using errcode = '42501';
  end if;
  if coalesce(btrim(p_line), '') = '' then
    raise exception 'اكتب سطر النداء' using errcode = '22023';
  end if;

  select * into s from settings limit 1;

  select id into v_template from sbota_templates where slug = 'nedaa-yalla';
  if v_template is null then
    raise exception 'القالب العام nedaa-yalla مش موجود — الزق 0146' using errcode = '22023';
  end if;

  -- ===== الويك اند الجاي =====
  -- ⚠ `dow`: الأحد ٠ … الجمعة ٥. بناخد **الجمعة الجاية**، ولو النهاردة
  --   جمعة بناخد اللي بعدها (نداء ميعاده النهاردة مالوش معنى — نفس سبب
  --   «بنبدأ من بكرة» في `0146`).
  v_today := (now() at time zone 'Africa/Cairo')::date;
  v_dow   := extract(dow from v_today)::int;
  v_add   := ((5 - v_dow) + 7) % 7;
  if v_add = 0 then v_add := 7; end if;
  v_friday := ((v_today + v_add)::text || ' ' ||
               lpad(coalesce(s.yalla_hour_eve, 20)::text, 2, '0') || ':00:00')
              ::timestamp at time zone 'Africa/Cairo';

  -- ⚠ منطقة واحدة سباكة — **مش بتتعرض لحد**. المالك بيكتب الحقيقية وقت القفل.
  select key into v_area from map_areas where is_active order by sort limit 1;
  if v_area is null then
    raise exception 'مفيش ولا كتلة خريطة نشطة' using errcode = '22023';
  end if;

  v_id := fn_yalla_create(
    p_template   => v_template,
    p_line       => p_line,
    p_group_size => coalesce(s.yalla_group_size, 6),
    p_min_group  => coalesce(s.yalla_min_group, 4),
    p_deadline   => now() + make_interval(hours => greatest(coalesce(s.yalla_lock_hours, 48), 1)),
    p_slots      => array[v_friday],
    p_areas      => array[v_area]);

  update yalla_calls set kind = 'post' where id = v_id;
  return v_id;
end $body$;

comment on function fn_yalla_post(text) is
  '0147 — نزّل نداء «يلا» بسطر واحد: ميعاده الويك اند الجاي، والمواعيد والمناطق مخفية (سباكة للقفل بس).';
revoke execute on function fn_yalla_post(text) from public, anon;
grant execute on function fn_yalla_post(text) to authenticated;


-- ===== 8) نوع كل نداء =====
-- الواجهة محتاجة تعرف البوست من النداء القديم: البوست كارت بدوسة واحدة،
-- والقديم بنافذة اختيار. والنوع في `yalla_calls.kind`.
--
-- ⚠ **ليه دالة لوحدها مش عمود في `fn_yalla_feed`؟** `fn_yalla_feed` متفحوصة
--   بـ٤٤ صف، و`create or replace` **ما بتقدرش تغيّر عدد الأعمدة الراجعة**
--   (مصيدة `fn_sbota_album`) — يعني كان لازم `drop` الأول، وساعتها إعادة
--   لزق `0143` بتقع بصوت عالي أو ترجّع النسخة من غير النوع (الدرس التالت).
--   فالنوع بيجي في نداء تاني صغير، والفيد ما اتلمسش.
--
-- ⚠ ومفيش فيها غير (رقم النداء · النوع) — مفيش هوية ولا عدد كلام، فمفتوحة
--   للمجهول زي الفيد بالظبط وبتحترم نفس المفتاح.
create or replace function fn_yalla_kinds()
returns table (call_id uuid, kind text)
language sql
stable
security definer
set search_path = public
as $$
  select c.id, c.kind::text
    from yalla_calls c
   where coalesce((select f.is_on from feature_flags f where f.key = 'yalla'), false)
$$;

comment on function fn_yalla_kinds() is
  '0147 — نوع كل نداء (post / choice) علشان الواجهة تعرف تعرض البوست بدوسة واحدة. أعمدة: رقم النداء والنوع بس.';
revoke execute on function fn_yalla_kinds() from public;
grant execute on function fn_yalla_kinds() to anon, authenticated;


-- ===== 9) «أنا جاي» بدوسة واحدة =====
-- غلاف على `fn_yalla_choose` بياخد الميعاد والمنطقة المخفيين لوحده،
-- فالعضو **ما بيختارش حاجة** — بيدوس وبس.
create or replace function fn_yalla_im_in(p_call uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_slot uuid;
  v_area text;
begin
  select id into v_slot from yalla_slots where call_id = p_call order by sort limit 1;
  select area_key into v_area from yalla_call_areas where call_id = p_call order by sort limit 1;
  if v_slot is null or v_area is null then
    raise exception 'النداء ده مش بوست' using errcode = '22023';
  end if;
  -- الحارس والتحقّق كلهم جوه `fn_yalla_choose` — مش منسوخين (الدرس الستاشر).
  return fn_yalla_choose(p_call, array[v_slot], v_area, null);
end $body$;

comment on function fn_yalla_im_in(uuid) is
  '0147 — «أنا جاي» بدوسة واحدة: بياخد الميعاد والمنطقة المخفيين وبينادي fn_yalla_choose.';
revoke execute on function fn_yalla_im_in(uuid) from public, anon;
grant execute on function fn_yalla_im_in(uuid) to authenticated;


-- ===== 10) القفل: انت بتكتب الميعاد والمكان =====
create or replace function fn_yalla_lock_post(p_call uuid, p_when timestamptz, p_area text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_slot uuid;
begin
  if not fn_has_permission('sbotat.edit') then
    raise exception 'محتاج صلاحية sbotat.edit' using errcode = '42501';
  end if;
  if p_when is null or p_when <= now() then
    raise exception 'الميعاد لازم يكون في المستقبل' using errcode = '22023';
  end if;
  if not exists (select 1 from map_areas where key = p_area and is_active) then
    raise exception 'المنطقة دي مش موجودة' using errcode = '22023';
  end if;

  -- ⚠ بنعدّل **نفس** الميعاد والمنطقة المخفيين بدل ما نعمل جداد — علشان
  --   اختيارات الناس (`yalla_choice_slots`) تفضل مربوطة بيهم، و`fn_yalla_top`
  --   ترجّعهم كسبانين بعدد كل اللي داسوا «أنا جاي».
  select id into v_slot from yalla_slots where call_id = p_call order by sort limit 1;
  if v_slot is null then
    raise exception 'النداء ده مش بوست' using errcode = '22023';
  end if;

  update yalla_slots      set starts_at = p_when where id = v_slot;
  update yalla_call_areas set area_key  = p_area where call_id = p_call;
  update yalla_choices    set area_key  = p_area where call_id = p_call;

  -- وبعدين القفل **الأصلي** — القعدة ونص ولاد ونص بنات وقايمة الانتظار
  -- والأولوية والإشعارات كلهم زي ما هم، ولا سطر اتنسخ.
  return fn_yalla_lock(p_call, 'manual');
end $body$;

comment on function fn_yalla_lock_post(uuid, timestamptz, text) is
  '0147 — اقفل نداء البوست على الميعاد والمكان اللي المالك كتبهم، وبعدين fn_yalla_lock الأصلية.';
revoke execute on function fn_yalla_lock_post(uuid, timestamptz, text) from public, anon;
grant execute on function fn_yalla_lock_post(uuid, timestamptz, text) to authenticated;


-- ===== 11) النصوص =====
-- ⚠ §٣.١ — مفيش نص عربي في أي مكوّن. والاحتياطي في
--   `src/data/copy-fallback.ts` (الدرس الخامس: الاحتياطي بيملا المفتاح
--   الناقص، مش الجدول الناقص).
insert into copy_strings (key, value_ar, screen, context_ar) values
  ('yalla.weekend',       'الويك اند الجاي',                                      'yalla', 'سطر الميعاد في بوست «يلا» — الويك اند افتراضي'),
  ('yalla.post.cta',      'أنا جاي',                                              'yalla', 'زرار الدوسة الواحدة في البوست'),
  ('yalla.post.mine',     'قلت إنك جاي ✓',                                        'yalla', 'الزرار بعد ما يدوس'),
  ('yalla.post.n',        '{{n}} قالوا جايين',                                    'yalla', 'عدد اللي قالوا جايين — رقم مش أسامي'),
  ('yalla.post.none',     'لسه محدش قال. قول انت الأول.',                         'yalla', 'لما يكون العدد صفر'),
  ('yalla.post.hint',     'اكتب في الكلام إمتى فاضي وفين.', 'yalla', 'سطر بيشرح إن الميعاد والمكان بيتكتبوا في الكلام'),
  ('yalla.talk.title',    'الكلام',                                               'yalla', 'عنوان قسم الكومنتات'),
  ('yalla.talk.n',        'الكلام ({{n}})',                                       'yalla', 'عنوان قسم الكومنتات ومعاه العدد'),
  ('yalla.talk.none',     'لسه محدش كتب. اكتب انت الأول — إمتى فاضي وفين؟',        'yalla', 'الحالة الفاضية'),
  ('yalla.talk.ph',       'إمتى فاضي؟ وفين؟',                                     'yalla', 'نص الخانة الفاضية'),
  ('yalla.talk.send',     'اكتب',                                                 'yalla', 'زرار الإرسال'),
  ('yalla.talk.mine',     'إنت',                                                  'yalla', 'وسم جنب كلامي'),
  ('yalla.talk.del',      'امسح',                                                 'yalla', 'زرار مسح كلامي'),
  ('yalla.talk.err',      'مقدرناش نكتب كلامك. جرب تاني.',                        'yalla', 'فشل الكتابة'),
  ('yalla.talk.errWords', 'فيه كلمة مش ماشية معانا. غيّرها وجرب تاني.',            'yalla', 'الكلمات الممنوعة'),
  ('yalla.talk.errMax',   'كتبت كتير في النداء ده. سيب فرصة لغيرك.',               'yalla', 'الحد اليومي للكومنتات'),
  ('yalla.talk.join',     'سجّل الأول وتكلّم مع اللي جايين.',                       'yalla', 'للزائر — الكلام للأعضاء بس'),
  ('yalla.talk.joinCta',  'سجّل',                                                 'yalla', 'زرار التسجيل تحت قسم الكلام'),
  ('yalla.talk.private',  'الكلام ده للأعضاء بس — مش ظاهر لحد بره.',               'yalla', 'سطر بيوضّح نطاق الرؤية')
on conflict (key) do nothing;


-- ===== 12) الاختبار =====
create or replace function test_yalla_social()
returns table (test text, result text)
language plpgsql
set search_path = public
as $body$
declare
  v_admin  uuid;
  v_member uuid;
  v_call   uuid;
  v_cid    uuid;
  n        int;
  v_txt    text;
begin
  select profile_id into v_admin from admin_users where is_active limit 1;
  select id into v_member from profiles
   where deleted_at is null
     and not exists (select 1 from admin_users a where a.profile_id = profiles.id)
   order by created_at limit 1;

  test := '0147 · جدول الكومنتات موجود و RLS شغّالة';
  select count(*) into n from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and c.relname = 'yalla_comments' and c.relrowsecurity;
  result := case when n = 1 then 'نجح' else 'فشل — الجدول مش موجود أو RLS مقفولة' end;
  return next;

  -- 🔴 نفس قاعدة §٥.٥: مفيش ولا سياسة — ولا لصاحب الصف.
  test := '0147 · 🔴 مفيش ولا سياسة قراية على الكومنتات';
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'yalla_comments';
  result := case when n = 0 then 'نجح'
                 else format('فشل — 🔴 %s سياسة على الجدول، فالواجهة تقدر تقرا profile_id', n) end;
  return next;

  -- 🔴 الحاجة اللي الهوية كلها متعلّقة بيها.
  test := '0147 · 🔴 fn_yalla_comments مش بترجّع profile_id ولا صورة';
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    cross join lateral unnest(coalesce(p.proargnames, '{}')) as col
   where ns.nspname = 'public' and p.proname = 'fn_yalla_comments'
     and col in ('profile_id', 'avatar', 'photo', 'avatar_url', 'phone');
  result := case when n = 0 then 'نجح'
                 else format('فشل — 🔴 %s عمود بيعرّف صاحب الكلام', n) end;
  return next;

  test := '0147 · الأرقام والنوع في مكانهم';
  select count(*) into n from information_schema.columns
   where table_schema = 'public'
     and ((table_name = 'settings'    and column_name = 'yalla_max_comments')
       or (table_name = 'yalla_calls' and column_name = 'kind'));
  result := case when n = 2 then 'نجح' else format('فشل — %s من ٢', n) end;
  return next;

  if v_admin is null or v_member is null then
    test := '0147 · باقي الفحص';
    result := 'معلومة — محتاج حساب لوحة وعضو عادي';
    return next;
    return;
  end if;

  begin
    -- ⚠ المفتاح لازم يبقى مفتوح علشان `fn_yalla_kinds` ترجّع حاجة — هي
    --   بتحترمه زي الفيد. والبلوك بيرجع، فالمفتاح بيرجع لحالته (نمط `0144`).
    update feature_flags set is_on = true where key = 'yalla';

    -- ===== نداء بوست =====
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    v_call := fn_yalla_post('[اختبار] يلا نتمشى؟');
    reset role;
    perform set_config('request.jwt.claims', '', true);

    test := '0147 · النداء بقى نوعه post';
    select count(*) into n from yalla_calls where id = v_call and kind = 'post';
    result := case when n = 1 then 'نجح' else 'فشل — نوعه مش post' end;
    return next;

    -- 🔴 ده بالظبط اللي المالك طلبه: مفيش اقتراحات.
    test := '0147 · 🔴 ميعاد واحد ومنطقة واحدة (مفيش اقتراحات)';
    select (select count(*) from yalla_slots      where call_id = v_call)
         + (select count(*) from yalla_call_areas where call_id = v_call) * 10
      into n;
    result := case when n = 11 then 'نجح'
                   else format('فشل — المواعيد/المناطق لسه كتير (%s)', n) end;
    return next;

    test := '0147 · الميعاد المخفي = الجمعة الجاية';
    select count(*) into n from yalla_slots
     where call_id = v_call
       and extract(dow from (starts_at at time zone 'Africa/Cairo')) = 5
       and starts_at > now();
    result := case when n = 1 then 'نجح' else 'فشل — مش يوم جمعة جاي' end;
    return next;

    -- ===== «أنا جاي» بدوسة واحدة =====
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
    perform fn_yalla_im_in(v_call);
    reset role;
    perform set_config('request.jwt.claims', '', true);

    test := '0147 · «أنا جاي» بدوسة واحدة من غير اختيار';
    select count(*) into n from yalla_choices where call_id = v_call and profile_id = v_member;
    result := case when n = 1 then 'نجح' else 'فشل — ما اتسجّلش' end;
    return next;

    -- ===== الكلام =====
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
    v_cid := fn_yalla_say(v_call, 'أنا فاضي الجمعة بالليل، والتجمع يناسبني');
    reset role;
    perform set_config('request.jwt.claims', '', true);

    test := '0147 · العضو كتب كومنت';
    select count(*) into n from yalla_comments where id = v_cid;
    result := case when n = 1 then 'نجح' else 'فشل — ما اتكتبش' end;
    return next;

    -- 🔴 الدرس الأربعة وعشرين: صف للممنوع وصف للمسموح.
    test := '0147 · 🔴 المجهول ما بيشوفش الكلام';
    begin
      set local role anon;
      perform set_config('request.jwt.claims', '{"role":"anon"}', true);
      select count(*) into n from fn_yalla_comments(v_call);
      reset role;
      result := case when n = 0 then 'نجح (ولا صف)'
                     else format('فشل — 🔴 المجهول شاف %s كومنت', n) end;
    exception when others then
      reset role;
      result := 'نجح (اترفض)';
    end;
    perform set_config('request.jwt.claims', '', true);
    return next;

    test := '0147 · العضو المسجّل بيشوف الكلام';
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
    select count(*) into n from fn_yalla_comments(v_call);
    select first_name into v_txt from fn_yalla_comments(v_call) limit 1;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    result := case when n = 1 and coalesce(v_txt, '') <> '' then 'نجح'
                   else format('فشل — شاف %s', n) end;
    return next;

    test := '0147 · الكلمات الممنوعة بترفض';
    begin
      set local role authenticated;
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
      perform fn_yalla_say(v_call, 'عايز أعمل تعارف');
      reset role;
      result := 'فشل — عدّت كلمة ممنوعة';
    exception when others then
      reset role;
      result := 'نجح';
    end;
    perform set_config('request.jwt.claims', '', true);
    return next;

    test := '0147 · المجهول ما بيكتبش';
    begin
      set local role anon;
      perform set_config('request.jwt.claims', '{"role":"anon"}', true);
      perform fn_yalla_say(v_call, 'أنا زائر');
      reset role;
      result := 'فشل — 🔴 المجهول كتب';
    exception when others then
      reset role;
      result := 'نجح';
    end;
    perform set_config('request.jwt.claims', '', true);
    return next;

    test := '0147 · العضو بيمسح كلامه';
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_member, 'role', 'authenticated')::text, true);
    perform fn_yalla_unsay(v_cid);
    reset role;
    perform set_config('request.jwt.claims', '', true);
    select count(*) into n from yalla_comments where id = v_cid;
    result := case when n = 0 then 'نجح' else 'فشل — الكلام لسه موجود' end;
    return next;

    -- ⚠ الدرس التلاتة وتلاتين: الدالة اللي الواجهة بتناديها من غير منح
    --   بترجّع فاضي بالصمت. فالصف ده سلوكي بهوية المجهول، و**جوه البلوك**
    --   اللي بيرجع علشان النداء يبقى لسه موجود (الدرس الستة وعشرين).
    test := '0147 · المجهول بيقرا نوع النداء';
    begin
      set local role anon;
      perform set_config('request.jwt.claims', '{"role":"anon"}', true);
      select count(*) into n from fn_yalla_kinds() where call_id = v_call;
      reset role;
      perform set_config('request.jwt.claims', '', true);
      result := case when n = 1 then 'نجح'
                     else 'فشل — المجهول شاف صفر، الكارت مش هيعرف شكله' end;
    exception when others then
      reset role;
      perform set_config('request.jwt.claims', '', true);
      result := 'فشل — المجهول اترفض: ' || sqlerrm;
    end;
    return next;

    raise exception 'نضيف';
  exception when others then
    reset role;
    perform set_config('request.jwt.claims', '', true);
    if sqlerrm <> 'نضيف' then
      test := '0147 · استثناء غير متوقّع';
      result := 'فشل — ' || sqlerrm;
      return next;
    end if;
  end;

  -- ⚠ الدرس التلاتين: النص اللي مش في القاعدة ولا في الاحتياطي بيطلّع
  --   **اسم المفتاح** على الشاشة للزائر.
  -- 🔴 الصف ده اتكتب بعد ما شُفت الإنتاج: المالك نزّل ٣ نداءات بفورم
  --   `0146` **بعد** الحد الزمني اللي كان مكتوب هنا، فكانوا هياخدوا
  --   `post` وهم فيهم ٢١ ميعاد — والدوسة الواحدة كانت هتحجز على أول
  --   ميعاد فيهم. دلوقتي الشكل هو اللي بيحكم، والصف ده بيحرسه.
  test := '0147 · 🔴 مفيش نداء «بوست» وفيه أكتر من ميعاد أو منطقة';
  select count(*) into n
    from yalla_calls c
   where c.kind = 'post'
     and ((select count(*) from yalla_slots s      where s.call_id = c.id) > 1
       or (select count(*) from yalla_call_areas a where a.call_id = c.id) > 1);
  result := case when n = 0 then 'نجح'
                 else format('فشل — 🔴 %s نداء هيعرض «أنا جاي» وهو فيه اختيارات، والدوسة هتحجز على ميعاد عشوائي', n) end;
  return next;

  test := '0147 · النصوص الـ١٩ موجودة';
  select count(*) into n from copy_strings
   where key like 'yalla.talk.%' or key like 'yalla.post.%' or key = 'yalla.weekend';
  result := case when n >= 19 then format('نجح (%s نص)', n)
                 else format('فشل — %s من ١٩', n) end;
  return next;

  test := '0147 · 🔴 fn_yalla_kinds مفيهاش غير النداء والنوع';
  select count(*) into n
    from information_schema.routines ro
    join information_schema.parameters pa
      on pa.specific_name = ro.specific_name
   where ro.routine_schema = 'public' and ro.routine_name = 'fn_yalla_kinds'
     and pa.parameter_mode = 'OUT'
     and pa.parameter_name not in ('call_id', 'kind');
  result := case when n = 0 then 'نجح'
                 else format('فشل — 🔴 %s عمود زيادة في دالة مفتوحة للمجهول', n) end;
  return next;

  test := '0147 · الاختبار ما سابش ولا صف';
  select count(*) into n from yalla_calls where line_ar like '[اختبار]%';
  result := case when n = 0 then 'نجح' else format('فشل — %s نداء اتحفظ', n) end;
  return next;
end $body$;

comment on function test_yalla_social() is
  '0147 — نداء البوست من غير اقتراحات، والكلام للأعضاء بس بالاسم الأول من غير profile_id ولا صورة.';
revoke execute on function test_yalla_social() from public, anon, authenticated;
