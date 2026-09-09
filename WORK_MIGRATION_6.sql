-- ============================================================================
-- WORK_MIGRATION_6.sql — الدفعة التانية من تصليح المراجعة
--
-- ⚠ الزق WORK_MIGRATION_5.sql الأول لو لسه ما عملتهوش.
--
-- الزقه كله مرة واحدة في Supabase ← SQL Editor ← Run. مفيش قيم enum جديدة.
-- آمن يتكرر — اتجرّب بلزقتين ورا بعض على قاعدة نضيفة.
--
-- بيصلّح:
--   0065  قوايم التسجيل: القيم المتخزّنة ما كانتش بتطابق لغة الكود، فاختيار
--         العضو كان هيتحفظ غلط أو يتبلع (وادي دجلة · أيوه/لأ · عجل).
--   0066  كتل الخريطة في جدول map_areas بدل ما تكون مثبّتة في الكود.
--   0067  اختبار 0065 و 0066.
--   0070  تخمين رمز الدخول بالتوازي (S7) — وده كمان طريق دخول اللوحة.
--   0071  حجم صفحة اللوحة في settings + مجموع الفلوس الحقيقي من القاعدة.
--   0072  وضع الصيانة بيوقف الحجز فعلًا (كان تعليق الجدول بيقول كده من زمان
--         وعمره ما حصل).
--   0073  صلاحيات رفع صور السبوطات — الرفع كان بيشتغل والتبديل والمسح لأ.
--
-- بعد ما يخلص شغّل الأربع سطور دول، كل واحد لوحده:
--     select * from test_public_lists();
--     select * from test_otp_hardening();
--     select * from test_admin_page_and_totals();
--     select * from test_maintenance_blocks();
--     select * from test_media_policies();
-- المفروض كل الصفوف تقول «نجح» (آخر صف في اختبار الصيانة بيقول حالة الموقع
-- بس — «الموقع شغّال» ده تمام). أي «فشل» ابعتهولي بالحرف.
-- ============================================================================


-- ############################################################################
-- # 20260909170000_0065_registration_lists_align.sql
-- ############################################################################

-- ============================================================================
-- 0065 — تظبيط قوايم التسجيل علشان /join تقراها من القاعدة (A4)
--
-- المشكلة: /admin/profile-fields بيعدّل profile_fields و field_options و
-- skill_activities و consents — و/join كانت بتقرا القوايم من src/data/lists.ts.
-- يعني المالك بيعدّل ومفيش حاجة بتتغيّر على الموقع.
--
-- الجداول دي **مقروءة أصلًا للزائر** (pf_read / fo_read / sa_read / co_read
-- كلها `using (is_active or fn_has_permission('fields.edit'))`) — فمفيش سياسة
-- قراية ناقصة، ومش محتاجين عرض عام لأن مفيش عمود حساس فيها.
--
-- اللي كان ناقص فعلًا: **قيم البذور ما كانتش بتطابق لغة طبقة البيانات**.
-- `src/lib/map-db.ts` بيترجم العربي → أكواد القاعدة بجداول ثابتة:
--   AREA_TO_DB   : ٦ مناطق بس · girlsPrefToDb : دايمًا/أحيانًا/مش مهم
--   SLOT_TO_DB   : ٤ فترات + ٧ أيام · SKILL_TO_DB : ٤ درجات
--   activityToDb : بادل / جري / سباحة بس
-- والبذرة كانت حاطة قيم بره الجداول دي (وادي دجلة كمنطقة تسجيل · أيوه/لأ
-- كتفضيل بنات · عجل كنشاط). لو الواجهة قرت منها زي ما هي، الاختيار كان
-- هيتحفظ غلط أو يتبلع بصمت.
--
-- الاتفاق من دلوقتي:
--   • `value`    = القيمة الأساسية اللي طبقة البيانات بتفهمها — متلمسهاش.
--   • `label_ar` = النص المعروض — المالك يغيّره من اللوحة براحته والموقع يتغيّر.
--
-- ملحوظة عن التعطيل (is_active=false): ده **ثابت** — تشغيل الملف تاني بيسيبه
-- زي ما هو. لو المالك رجّع خيار منهم من اللوحة، لازم الأول يتضاف لجداول
-- الترجمة في map-db.ts وإلا هيتبلع.
-- ============================================================================

-- ===== ١ · المناطق — ٦ بس، نفس AREA_TO_DB =====
insert into field_options (field_key, value, label_ar, "order")
select 'area', v, v, o from (values
  ('التجمع', 1),
  ('المعادي', 2),
  ('زايد-أكتوبر', 3),
  ('مصر الجديدة-مدينة نصر', 4),
  ('وسط-زمالك', 5),
  ('غير كده', 6)
) as t(v, o)
on conflict (field_key, value) do nothing;

-- «وادي دجلة» مكان مش منطقة تسجيل — AREA_TO_DB ما بيعرفهاش فبتتحفظ 'other'
update field_options set is_active = false
 where field_key = 'area' and value = 'وادي دجلة';

-- ===== ٢ · تفضيل «بنات بس» — نفس girlsPrefToDb =====
insert into field_options (field_key, value, label_ar, "order")
select 'girls_only', v, v, o from (values
  ('دايمًا', 1), ('أحيانًا', 2), ('مش مهم', 3)
) as t(v, o)
on conflict (field_key, value) do nothing;

update field_options set is_active = false
 where field_key = 'girls_only' and value in ('أيوه', 'لأ');

-- ===== ٣ · الأيام الفاضية — صف الأيام في /join =====
-- SLOT_TO_DB بيعرف الاتنين (الفترات والأيام)، بس النموذج صف أيام أسبوع،
-- والفترات الأربعة القديمة عمرها ما ظهرت في أي شاشة.
insert into field_options (field_key, value, label_ar, "order")
select 'free_slots', v, v, o from (values
  ('سبت', 1), ('حد', 2), ('اتنين', 3), ('تلات', 4),
  ('أربع', 5), ('خميس', 6), ('جمعة', 7)
) as t(v, o)
on conflict (field_key, value) do nothing;

update field_options set is_active = false
 where field_key = 'free_slots'
   and value in ('خميس بالليل', 'جمعة الصبح', 'جمعة بالليل', 'وسط الأسبوع');

-- ===== ٤ · درجات المستوى — حقل جديد، نفس SKILL_TO_DB =====
insert into profile_fields (key, label_ar, help_ar, error_ar, is_required, step, "order", validation)
values ('skill_level', 'مستواك في اللعبة', 'اختار الأقرب — مفيش غلط', null, false, 3, 3, '{}'::jsonb)
on conflict (key) do nothing;

insert into field_options (field_key, value, label_ar, "order")
select 'skill_level', v, v, o from (values
  ('أول مرة', 1), ('مبتدئ', 2), ('متوسط', 3), ('كويس', 4)
) as t(v, o)
on conflict (field_key, value) do nothing;

-- ===== ٥ · نشاطات المهارة — بادل/جري/سباحة بس =====
-- activityToDb في map-db.ts بيرجّع 'swimming' لأي حاجة غير بادل وجري،
-- فـ«عجل» كانت هتتحفظ سباحة. نقفلها لحد ما map-db يعرفها.
update skill_activities set is_active = false where key = 'cycling';

-- ===== ٦ · حد الاهتمامات — الرقم من اللوحة مش من الكود =====
update profile_fields
   set validation = coalesce(validation, '{}'::jsonb) || jsonb_build_object('max', 5)
 where key = 'interests'
   and (validation ->> 'max') is null;

comment on column field_options.value is
  'القيمة الأساسية اللي طبقة البيانات بتفهمها (map-db.ts) — متتغيّرش. المعروض هو label_ar.';


-- ############################################################################
-- # 20260909170100_0066_map_areas.sql
-- ############################################################################

-- ============================================================================
-- 0066 — كتل الخريطة في القاعدة (A5)
--
-- المشكلة: /admin/map بيكتب على `venues`، والخريطة العامة (src/app/map +
-- src/components/CairoMap) كانت بتقرا كل حاجة من src/data/areas.ts:
-- الكتل وأسماءها ونقط السبوطات (٧ slugs متكتوبين بالإيد!). يعني أي سبوطة
-- جديدة عمرها ما كانت تبان على الخريطة، وأي تعديل من اللوحة ما كانش بيوصل.
--
-- ليه مش عرض عام على venues؟
--   `venues` فيه أعمدة حساسة (contact_phone · contract_notes · wholesale_price
--   · tourism_license_no · verified_by) وقراءته مقفولة على fn_is_admin().
--   كان ممكن نعمل venues_public بالأعمدة الآمنة — بس **الإحداثيات والاسم
--   والعنوان مش آمنين**: `sbotat.address_hidden` قاعدته إن مكان الخروجة ما
--   يظهرش غير لصاحب حجز مدفوع، ونشر map_lat/map_lng للزائر بيكسر القاعدة دي
--   بالظبط. فالخريطة العامة **ما بتلمسش venues خالص**: الكتل من الجدول اللي
--   تحت، والنقط بتتحسب من `sbotat_public` (المنطقة بس، من غير عنوان ولا
--   إحداثيات حقيقية) وبتتحط جوه كتلة منطقتها.
--   إحداثيات venues بتفضل أداة داخلية في /admin/map زي ما هي.
--
-- الجدول ده هندسة عرض (رسم SVG) + الاسم المعروض. الرسم بيتعمل في مساحة
-- viewBox 400×520.
-- ============================================================================

create table if not exists map_areas (
  key           text primary key,
  label_ar      text not null,
  -- المنطقة المعدودة — بتربط الكتلة بـ sbotat.area وبالمناطق اللي المستخدم راحها
  area          area_t,
  -- أسماء المناطق المعروضة اللي بتقع في الكتلة دي (sbotat.area_label_ar)
  match_labels  text[] not null default '{}',
  x             integer not null default 0,
  y             integer not null default 0,
  w             integer not null default 0,
  h             integer not null default 0,
  r             integer not null default 24,
  lx            integer not null default 0,
  ly            integer not null default 0,
  is_far        boolean not null default false,
  note_ar       text,
  -- صف واحد بس بـ true — نقطة السبوطة الغامضة، مكانها في (lx, ly)
  is_mystery    boolean not null default false,
  sort          integer not null default 1,
  is_active     boolean not null default true,
  updated_at    timestamptz not null default now()
);

comment on table map_areas is
  'كتل خريطة القاهرة المرسومة (viewBox 400×520) — الاسم المعروض والهندسة. مصدر /map و CairoMap.';
comment on column map_areas.match_labels is
  'أسماء المناطق المعروضة اللي بتقع في الكتلة — بتقابل sbotat.area_label_ar علشان نحط النقطة.';
comment on column map_areas.is_mystery is
  'الصف ده مش كتلة — دي نقطة السبوطة الغامضة، مكانها (lx, ly).';

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 't_map_areas_updated') then
    create trigger t_map_areas_updated before update on map_areas
      for each row execute function set_updated_at();
  end if;
end $$;

-- ===== RLS =====
alter table map_areas enable row level security;

-- الزائر بيشوف الكتل النشطة (الخريطة صفحة عامة)، والمالك بيشوف الكل.
drop policy if exists map_areas_read on map_areas;
create policy map_areas_read on map_areas for select
  using (is_active or fn_has_permission('map.edit'));

-- الكتابة على صلاحية الخريطة بالتحديد — مش fn_is_admin (قاعدة CLAUDE.md §٥).
drop policy if exists map_areas_write on map_areas;
create policy map_areas_write on map_areas for all
  using (fn_has_permission('map.edit'))
  with check (fn_has_permission('map.edit'));

grant select on map_areas to anon, authenticated;
grant insert, update, delete on map_areas to authenticated;

-- ===== البذرة — نفس الكتل اللي كانت في src/data/areas.ts بالحرف =====
insert into map_areas (key, label_ar, area, match_labels, x, y, w, h, r, lx, ly, is_far, note_ar, sort) values
  ('tagamo3',    'التجمع',                 'tagamoa',          array['التجمع'],
     236,  60, 132,  96, 30, 302, 112, false, null,     1),
  ('heliopolis', 'مصر الجديدة ومدينة نصر', 'heliopolis_nasr',  array['مصر الجديدة ومدينة نصر','مصر الجديدة-مدينة نصر'],
     214, 176, 148,  84, 28, 288, 222, false, null,     2),
  ('downtown',   'الزمالك ووسط البلد',     'downtown_zamalek', array['الزمالك ووسط البلد','وسط-زمالك'],
     112, 196,  92,  78, 26, 158, 238, false, null,     3),
  ('maadi',      'المعادي',                'maadi',            array['المعادي'],
     176, 292, 118,  84, 28, 235, 338, false, null,     4),
  ('wadi',       'وادي دجلة',              'maadi',            array['وادي دجلة'],
     250, 392, 118,  74, 26, 309, 452, false, null,     5),
  ('zayed',      'زايد وأكتوبر',           'zayed_october',    array['زايد وأكتوبر','زايد-أكتوبر'],
      36,  92, 116, 104, 30,  94, 148, false, null,     6),
  ('fayoum',     'الفيوم',                 'other',            array['الفيوم'],
      20, 408, 100,  68, 24,  70, 446, true,  'ساعتين', 7)
on conflict (key) do nothing;

-- نقطة السبوطة الغامضة — مش كتلة، مكانها بس
insert into map_areas (key, label_ar, area, x, y, w, h, r, lx, ly, is_mystery, sort)
values ('mystery', 'الغامضة', null, 0, 0, 0, 0, 0, 96, 320, true, 99)
on conflict (key) do nothing;


-- ############################################################################
-- # 20260909170200_0067_test_public_lists.sql
-- ############################################################################

-- ============================================================================
-- 0067 — دالة اختبار قوايم التسجيل والخريطة (0065 · 0066)
--
--   select * from test_public_lists();
--
-- كل الصفوف لازم تقول «نجح». أي «فشل» ابعتلي السطر بالحرف.
--
-- الاختبار هنا **سلوكي مش شكلي**: بيلبس دور الزائر المجهول (anon) فعلًا
-- ويجرّب يقرا — لأن «السياسة موجودة» ما يعنيش «الزائر بيشوف». وبيتأكد كمان
-- إن الزائر **مش** شايف venues (مكان الخروجة لازم يفضل مخفي لحد الحجز).
--
-- ⚠ الدالة دي **security invoker** عن قصد، مش definer زي test_review_fixes:
-- بوستجرس بيرفض `set role` جوه دالة definer («cannot set parameter role
-- within security-definer function»)، ومن غير `set role` مفيش اختبار سلوكي
-- أصلًا. التنفيذ مسحوب من public/anon/authenticated تحت، فبتتشغّل من محرر
-- SQL (دور postgres) بس.
-- ============================================================================

create or replace function test_public_lists()
returns table (test text, result text)
language plpgsql
set search_path = public
as $$
declare
  n  int;
  me text := current_user;
begin
  -- ===== 0065 — قوايم التسجيل =====
  test := '0065 · مناطق التسجيل الستة كلها موجودة ونشطة';
  select count(*) into n from field_options
   where field_key = 'area' and is_active
     and value in ('التجمع','المعادي','زايد-أكتوبر',
                   'مصر الجديدة-مدينة نصر','وسط-زمالك','غير كده');
  if n = 6 then result := 'نجح — ٦ مناطق';
  else result := format('فشل — %s منطقة من ٦ بس', n); end if;
  return next;

  test := '0065 · مفيش خيار منطقة بره جدول الترجمة (map-db.ts)';
  select count(*) into n from field_options
   where field_key = 'area' and is_active
     and value not in ('التجمع','المعادي','زايد-أكتوبر',
                       'مصر الجديدة-مدينة نصر','وسط-زمالك','غير كده');
  if n = 0 then result := 'نجح';
  else result := format('فشل — %s خيار هيتحفظ غلط', n); end if;
  return next;

  test := '0065 · تفضيل «بنات بس» = دايمًا/أحيانًا/مش مهم';
  select count(*) into n from field_options
   where field_key = 'girls_only' and is_active
     and value in ('دايمًا','أحيانًا','مش مهم');
  if n = 3 and not exists (
    select 1 from field_options
     where field_key = 'girls_only' and is_active
       and value not in ('دايمًا','أحيانًا','مش مهم')
  ) then result := 'نجح';
  else result := format('فشل — %s من ٣، أو لسه فيه خيار قديم نشط', n); end if;
  return next;

  test := '0065 · أيام الأسبوع السبعة نشطة';
  select count(*) into n from field_options
   where field_key = 'free_slots' and is_active
     and value in ('سبت','حد','اتنين','تلات','أربع','خميس','جمعة');
  if n = 7 then result := 'نجح — ٧ أيام';
  else result := format('فشل — %s يوم من ٧ بس', n); end if;
  return next;

  test := '0065 · درجات المستوى الأربعة موجودة';
  select count(*) into n from field_options
   where field_key = 'skill_level' and is_active
     and value in ('أول مرة','مبتدئ','متوسط','كويس');
  if n = 4 then result := 'نجح — ٤ درجات';
  else result := format('فشل — %s درجة من ٤ بس', n); end if;
  return next;

  test := '0065 · نشاطات المهارة كلها في activityToDb';
  select count(*) into n from skill_activities
   where is_active and key not in ('padel','running','swimming');
  if n = 0 then result := 'نجح';
  else result := format('فشل — %s نشاط هيتحفظ سباحة بالغلط', n); end if;
  return next;

  test := '0065 · حد الاهتمامات مكتوب في validation';
  if (select validation ->> 'max' from profile_fields where key = 'interests') is not null then
    result := 'نجح';
  else result := 'فشل — الحد لسه في الكود بس'; end if;
  return next;

  -- ===== 0066 — الخريطة =====
  test := '0066 · جدول map_areas موجود و RLS مفعّل';
  if exists (select 1 from pg_class where relname = 'map_areas' and relrowsecurity) then
    result := 'نجح';
  else result := 'فشل — الجدول ناقص أو RLS مقفول'; end if;
  return next;

  test := '0066 · كتل الخريطة السبعة + نقطة الغامضة';
  select count(*) into n from map_areas where is_active;
  if n >= 8 and exists (select 1 from map_areas where is_mystery) then
    result := format('نجح — %s صف', n);
  else result := format('فشل — %s صف بس', n); end if;
  return next;

  test := '0066 · كتابة map_areas على fn_has_permission مش fn_is_admin';
  select count(*) into n from pg_policies
   where tablename = 'map_areas' and cmd in ('ALL','INSERT','UPDATE','DELETE')
     and coalesce(qual,'') || coalesce(with_check,'') like '%fn_is_admin%';
  if n = 0 and exists (
    select 1 from pg_policies
     where tablename = 'map_areas' and policyname = 'map_areas_write'
       and coalesce(qual,'') like '%map.edit%'
  ) then result := 'نجح';
  else result := format('فشل — %s سياسة كتابة غلط', n); end if;
  return next;

  -- ===== سلوكي — الزائر المجهول =====
  begin
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    execute 'set local role anon';

    test := 'سلوكي · الزائر بيقرا كتل الخريطة';
    select count(*) into n from map_areas;
    if n >= 8 then result := format('نجح — شاف %s صف', n);
    else result := format('فشل — شاف %s بس', n); end if;
    return next;

    test := 'سلوكي · الزائر بيقرا حقول التسجيل وقوايمها';
    select (select count(*) from profile_fields)
         + (select count(*) from field_options)
         + (select count(*) from skill_activities)
         + (select count(*) from consents)
      into n;
    if n > 0 then result := format('نجح — %s صف', n);
    else result := 'فشل — الزائر مش شايف حاجة، /join هتقع على الاحتياطي'; end if;
    return next;

    test := 'سلوكي · الزائر **مش** شايف venues (مكان الخروجة مخفي)';
    select count(*) into n from venues;
    if n = 0 then result := 'نجح';
    else result := format('فشل — تسريب %s مكان بإحداثياته', n); end if;
    return next;

    execute format('set local role %I', me);
  exception when others then
    execute format('set local role %I', me);
    test := 'سلوكي · اختبار الزائر';
    result := 'فشل — ' || sqlerrm;
    return next;
  end;
end;
$$;

comment on function test_public_lists() is
  'بتتأكد إن قوايم التسجيل والخريطة اتظبطت (0065·0066) وإن الزائر بيقراها فعلًا. select * from test_public_lists();';

revoke execute on function test_public_lists() from public, anon, authenticated;


-- ############################################################################
-- # 20260909170200_0070_otp_atomic_and_ip_limit.sql
-- ############################################################################

-- ============================================================================
-- 0070 — تخمين رمز الدخول بالتوازي (S7)
--
-- المشكلة: /api/otp/verify كان بيقرا العدّاد وبعدين يكتبه في خطوتين:
--
--     const { data: row } = await db.from('otp_codes').select('attempts')…
--     if (r.attempts >= 5) → ارفض
--     await db.from('otp_codes').update({ attempts: r.attempts + 1 })
--
-- ٥٠ طلب متوازي بيقروا كلهم `attempts = 0`، فحد الـ٥ عمره ما بيمسك، وكلهم
-- بيكتبوا `1`. يعني تخمين رمز من ٦ أرقام من غير أي سقف حقيقي.
--
-- ⚠ خطورته أعلى من اللي المراجعة قدّرته: /api/admin/login بينده نفس المسار،
-- فده طريق دخول **اللوحة** مش تسجيل الأعضاء بس.
--
-- وكمان مفيش أي حد على الـIP — رقم واحد محدود بـ٣ إرسالات في الساعة، بس
-- مهاجم معاه ألف رقم عنده ٣٠٠٠ إرسالة من نفس الجهاز.
--
-- الحل:
--   1) fn_otp_try — التحقق كله (الصلاحية · السقف · المطابقة · الزيادة ·
--      الاستهلاك) جوه دالة واحدة بـ `for update` على الصف، فالطلبات المتوازية
--      بتتصف ورا بعض بدل ما تتسابق.
--   2) fn_rate_hit — عدّاد نوافذ ذرّي (upsert واحد) لأي مفتاح، بنستخدمه
--      للـIP في الإرسال والتحقق.
--   3) الأرقام كلها في settings مش في الكود.
--
-- الـIP بيتخزّن **مهشوش** مش خام — مش محتاجينه، ومحدش يقدر يرجّعه.
-- ============================================================================

-- ===== 1) الأرقام في settings =====
alter table settings
  add column if not exists otp_max_attempts        int not null default 5,
  add column if not exists otp_sends_per_hour      int not null default 3,
  add column if not exists otp_ip_sends_per_hour   int not null default 20,
  add column if not exists otp_ip_verifies_per_hour int not null default 40;

comment on column settings.otp_max_attempts is 'أقصى محاولات غلط على الرمز الواحد قبل ما يتقفل.';
comment on column settings.otp_sends_per_hour is 'أقصى إرسالات رمز في الساعة للرقم الواحد.';
comment on column settings.otp_ip_sends_per_hour is 'أقصى إرسالات رمز في الساعة من نفس الجهاز (IP) — مهما اتغيّرت الأرقام.';
comment on column settings.otp_ip_verifies_per_hour is 'أقصى محاولات تحقق في الساعة من نفس الجهاز (IP).';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'settings_otp_limits_sane') then
    alter table settings add constraint settings_otp_limits_sane check (
      otp_max_attempts between 1 and 20
      and otp_sends_per_hour between 1 and 100
      and otp_ip_sends_per_hour between 1 and 1000
      and otp_ip_verifies_per_hour between 1 and 1000
    );
  end if;
end $$;

-- ===== 2) عدّاد نوافذ ذرّي عام =====
create table if not exists rate_hits (
  bucket       text primary key,
  window_start timestamptz not null default now(),
  hits         int not null default 0
);
comment on table rate_hits is 'عدّادات حد المعدل بنوافذ زمنية. المفتاح مهشوش (مثلاً otp_send:<هاش الـIP>) — مفيش IP خام هنا.';

alter table rate_hits enable row level security;
-- مفيش سياسة خالص: الوصول بمفتاح الخدمة والدوال definer بس
revoke all on rate_hits from anon, authenticated;

/**
 * بيسجّل ضربة على `p_bucket` ويرجّع true لو لسه تحت الحد.
 * upsert واحد = ذرّي، فالطلبات المتوازية ما بتتسابقش.
 */
create or replace function fn_rate_hit(p_bucket text, p_limit int, p_window_secs int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  cur rate_hits;
begin
  insert into rate_hits (bucket, window_start, hits)
       values (p_bucket, now(), 1)
  on conflict (bucket) do update
     set hits = case
                  when rate_hits.window_start < now() - make_interval(secs => p_window_secs)
                  then 1
                  else rate_hits.hits + 1
                end,
         window_start = case
                  when rate_hits.window_start < now() - make_interval(secs => p_window_secs)
                  then now()
                  else rate_hits.window_start
                end
  returning * into cur;

  return cur.hits <= p_limit;
end;
$$;
comment on function fn_rate_hit(text, int, int) is 'عدّاد نافذة ذرّي — بيرجّع true لو لسه تحت الحد. مفتاح الخدمة بس.';
revoke execute on function fn_rate_hit(text, int, int) from public, anon, authenticated;

/** تنضيف العدّادات القديمة — يتجدول يوميًا (RUNBOOK) */
create or replace function job_purge_rate_hits()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  delete from rate_hits where window_start < now() - interval '2 days';
  get diagnostics n = row_count;
  return n;
end;
$$;
revoke execute on function job_purge_rate_hits() from public, anon, authenticated;

-- ===== 3) التحقق الذرّي من الرمز =====
/**
 * بيرجّع سبب واحد من: ok · none · expired · locked · wrong
 *
 * `for update` بيقفل الصف، فطلبين متوازيين على نفس الرمز بيتصفّوا ورا بعض
 * وكل واحد بيشوف العدّاد بعد اللي قبله. ده بيت القصيد في S7.
 *
 * الهاش بيتحسب على الخادم (codeHash في src/lib/server/otp.ts) وبيتبعت هنا
 * جاهز — القاعدة عمرها ما بتشوف الرمز نفسه.
 */
create or replace function fn_otp_try(p_phone text, p_hash text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  r         otp_codes;
  max_tries int;
begin
  select coalesce(otp_max_attempts, 5) into max_tries from settings limit 1;
  max_tries := coalesce(max_tries, 5);

  select * into r
    from otp_codes
   where phone = p_phone and consumed_at is null
   order by created_at desc
   limit 1
     for update;

  if not found        then return 'none';    end if;
  if r.expires_at < now() then return 'expired'; end if;
  if r.attempts >= max_tries then return 'locked'; end if;

  if r.code_hash = p_hash then
    update otp_codes set consumed_at = now() where id = r.id;
    return 'ok';
  end if;

  update otp_codes set attempts = attempts + 1 where id = r.id;
  return 'wrong';
end;
$$;
comment on function fn_otp_try(text, text) is 'تحقق ذرّي من رمز الدخول — بيقفل الصف فالمحاولات المتوازية ما بتتخطاش السقف (S7). مفتاح الخدمة بس.';
revoke execute on function fn_otp_try(text, text) from public, anon, authenticated;

-- ===== اختبار =====
create or replace function test_otp_hardening()
returns table (test text, result text)
language plpgsql
security definer
set search_path = public
as $$
declare
  ok1 boolean;
  ok2 boolean;
  n   int;
  b   text := 'test:' || gen_random_uuid()::text;
begin
  test := '0070 · fn_otp_try موجودة ومقفولة على العضو';
  if not exists (select 1 from pg_proc where proname = 'fn_otp_try') then
    result := 'فشل — الدالة مش موجودة';
  elsif has_function_privilege('authenticated', 'fn_otp_try(text, text)', 'execute')
     or has_function_privilege('anon', 'fn_otp_try(text, text)', 'execute') then
    result := 'فشل — العضو يقدر ينفّذها';
  else
    result := 'نجح';
  end if;
  return next;

  test := '0070 · fn_otp_try بتقفل الصف (for update)';
  if (select prosrc from pg_proc where proname = 'fn_otp_try') like '%for update%' then
    result := 'نجح';
  else
    result := 'فشل — من غير قفل، المتوازي هيعدّي';
  end if;
  return next;

  test := '0070 · fn_rate_hit بتعدّ وبتوقف عند الحد';
  select fn_rate_hit(b, 2, 3600) into ok1;   -- 1 من 2
  perform fn_rate_hit(b, 2, 3600);            -- 2 من 2
  select fn_rate_hit(b, 2, 3600) into ok2;   -- 3 → المفروض false
  if ok1 and not ok2 then
    result := 'نجح';
  else
    result := format('فشل — الأولى=%s والتالتة=%s', ok1, ok2);
  end if;
  delete from rate_hits where bucket = b;
  return next;

  test := '0070 · حدود الـOTP في settings';
  select otp_max_attempts into n from settings limit 1;
  if n is null then
    result := 'فشل — الأعمدة مش موجودة';
  else
    result := format('نجح — %s محاولات', n);
  end if;
  return next;

  test := '0070 · rate_hits مقفول على العضو';
  if has_table_privilege('anon', 'rate_hits', 'select')
  or has_table_privilege('authenticated', 'rate_hits', 'select') then
    result := 'فشل — العضو يقدر يقراه';
  else
    result := 'نجح';
  end if;
  return next;
end;
$$;

comment on function test_otp_hardening() is 'بتتأكد إن تخمين الرمز بالتوازي اتقفل. select * from test_otp_hardening();';
revoke execute on function test_otp_hardening() from public, anon, authenticated;


-- ############################################################################
-- # 20260909180000_0071_admin_page_size_and_totals.sql
-- ############################################################################

-- ============================================================================
-- 0071 — حجم صفحة اللوحة في settings + مجموع الفلوس الحقيقي
--
-- حاجتين طلعوا من تصليح A17 (الترقيم من الخادم):
--
-- ١) `ADMIN_PAGE_SIZE` اتكتب ثابت في `src/components/admin-ui.tsx` — مخالفة
--    صريحة لقاعدة المشروع رقم ٢ (كل رقم في settings). الوكيل اللي عمل الترقيم
--    مكانش معاه صلاحية يكتب هجرة، فسابه ثابت وسجّله. هنا بنكمّله.
--
-- ٢) صفحة الفلوس كانت بتعرض «مجموع اللي تمّ» محسوب من الصفوف اللي محمّلة.
--    بعد الترقيم بقت بتشوف ٥٠ صف بس، فالمجموع بقى مجموع الصفحة مش المجموع
--    الحقيقي. المالك بيقرا الرقم ده علشان يعرف دخل النادي — رقم ناقص أسوأ من
--    رقم مش موجود. الحل: نحسبه في القاعدة (sum) بدل ما نجمع في المتصفح.
-- ============================================================================

-- ===== ١) حجم الصفحة =====
alter table settings
  add column if not exists admin_page_size int not null default 50;

comment on column settings.admin_page_size is
  'عدد الصفوف في صفحة اللوحة الواحدة. أكبر = تقليب أقل بس تحميل أتقل.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'settings_admin_page_size_sane') then
    alter table settings add constraint settings_admin_page_size_sane
      check (admin_page_size between 10 and 200);
  end if;
end $$;

-- ===== ٢) مجاميع الفلوس الحقيقية =====
/**
 * مجموع وعدد المعاملات لكل حالة — محسوبين في القاعدة على **كل** الصفوف.
 * المبالغ بالقروش زي ما هي متخزّنة؛ الواجهة بتحوّلها لجنيه.
 *
 * الصلاحية: `payments.view` — نفس اللي بيفتح الصفحة. الفحص جوه الدالة لأنها
 * definer (السطر ده هو الحد الأمني، مش إخفاء الزرار).
 */
create or replace function fn_payments_totals()
returns table (status payment_status_t, n bigint, total_piastres bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not fn_has_permission('payments.view') then
    raise exception 'محتاج صلاحية payments.view';
  end if;

  return query
    select p.status, count(*)::bigint, coalesce(sum(p.amount), 0)::bigint
      from payments p
     group by p.status;
end;
$$;

comment on function fn_payments_totals() is
  'مجموع وعدد المعاملات لكل حالة على كل الصفوف — علشان اللوحة ما تجمعش الصفحة اللي قدامها بس.';
revoke execute on function fn_payments_totals() from public, anon;
grant  execute on function fn_payments_totals() to authenticated;

-- ===== اختبار =====
create or replace function test_admin_page_and_totals()
returns table (test text, result text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v int;
begin
  test := '0071 · admin_page_size في settings';
  select admin_page_size into v from settings limit 1;
  if v is null then
    result := 'فشل — العمود مش موجود';
  elsif v between 10 and 200 then
    result := format('نجح — %s صف', v);
  else
    result := format('فشل — قيمة غريبة: %s', v);
  end if;
  return next;

  test := '0071 · fn_payments_totals موجودة ومقفولة على الزائر';
  if not exists (select 1 from pg_proc where proname = 'fn_payments_totals') then
    result := 'فشل — الدالة مش موجودة';
  elsif has_function_privilege('anon', 'fn_payments_totals()', 'execute') then
    result := 'فشل — الزائر يقدر ينفّذها';
  else
    result := 'نجح';
  end if;
  return next;

  test := '0071 · الدالة بتتحقق من الصلاحية جوّاها';
  if (select prosrc from pg_proc where proname = 'fn_payments_totals')
     like '%fn_has_permission(''payments.view'')%' then
    result := 'نجح';
  else
    result := 'فشل — مفيش فحص صلاحية جوه definer';
  end if;
  return next;
end;
$$;

revoke execute on function test_admin_page_and_totals() from public, anon, authenticated;


-- ############################################################################
-- # 20260909180100_0072_maintenance_blocks_booking.sql
-- ############################################################################

-- ============================================================================
-- 0072 — وضع الصيانة بيوقف الحجز فعلًا (A3)
--
-- تعليق الجدول نفسه من يوم ما اتعمل بيقول:
--     'وضع الصيانة — بيوقف الحجز الجديد فورًا. owner بس.'
-- وده **عمره ما حصل**. مفيش سطر واحد في القاعدة ولا في الكود كان بيقرا
-- `maintenance.is_on` قبل الحجز. الميدل وير (اتصلّح قبل كده) بيقفل الصفحات،
-- بس `/api/*` مستثنى منه — يعني الموقع بيقول «مقفول» و/api/pay/create لسه
-- بياخد فلوس عادي.
--
-- الحل هنا: القاعدة هي اللي تقرر، مش الواجهة.
--   • fn_maintenance_on() — مصدر وحيد للحقيقة.
--   • fn_can_book بترجّع سبب المنع لما الصيانة شغّالة، فكل اللي بينده عليها
--     (الواجهة ومسارات الدفع) بيتوقف من نفس المكان.
--
-- الأدمن مستثنى عن قصد: لازم يقدر يجرّب الحجز وهو قافل الموقع.
-- ============================================================================

create or replace function fn_maintenance_on()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_on from maintenance where id), false);
$$;
comment on function fn_maintenance_on() is 'الموقع مقفول للصيانة؟ مصدر وحيد للحقيقة — متقراش الجدول مباشرة.';
grant execute on function fn_maintenance_on() to anon, authenticated, service_role;

/**
 * نفس fn_can_book بالحرف، بفحص الصيانة مضاف في الأول.
 * بنعدّل النص المتخزّن بدل ما نعيد كتابة الجسم كله — علشان أي تعديل نزل على
 * الدالة بعد 0007 ما يضيعش.
 */
do $$
declare
  src     text;
  new_src text;
  guard   text := $g$
  -- ===== الصيانة (0072) =====
  -- الموقع مقفول؟ محدش يحجز — إلا الأدمن، لازم يقدر يجرّب وهو قافل.
  if fn_maintenance_on() and not fn_is_admin() then
    return 'الموقع مقفول دلوقتي لشوية صيانة. ارجعلنا بعد شوية.';
  end if;
$g$;
begin
  select prosrc into src from pg_proc
   where proname = 'fn_can_book' and pronamespace = 'public'::regnamespace;

  if src is null then
    raise exception 'fn_can_book مش موجودة';
  end if;

  if src like '%fn_maintenance_on()%' then
    raise notice '0072: fn_can_book فيها فحص الصيانة أصلًا — عدّينا';
  else
    -- بنحقن الحارس بعد **أول `begin`** — يعني بعد قسم declare، أول سطر في
    -- الجسم. (المحاولة الأولى حقنته قبل declare فوقع بـ syntax error:
    -- `if` ما ينفعش يقف في قسم التعريفات.)
    new_src := regexp_replace(src, '\mbegin\M', 'begin' || guard, '');

    if new_src = src then
      raise exception '0072: مقدرناش نحقن الحارس في fn_can_book — راجعها بإيدك';
    end if;

    execute format(
      'create or replace function fn_can_book(p_id uuid, s_id uuid) returns text language plpgsql stable security definer set search_path = public as %L',
      new_src
    );
    raise notice '0072: اتحقن فحص الصيانة في fn_can_book';
  end if;
end $$;

-- ===== اختبار =====
create or replace function test_maintenance_blocks()
returns table (test text, result text)
language plpgsql
security definer
set search_path = public
as $$
begin
  test := '0072 · fn_maintenance_on موجودة';
  if exists (select 1 from pg_proc where proname = 'fn_maintenance_on') then
    result := 'نجح';
  else
    result := 'فشل — الدالة مش موجودة';
  end if;
  return next;

  test := '0072 · fn_can_book بتفحص الصيانة';
  if (select prosrc from pg_proc where proname = 'fn_can_book') like '%fn_maintenance_on()%' then
    result := 'نجح';
  else
    result := 'فشل — الحارس مش موجود، الحجز هيعدّي والموقع مقفول';
  end if;
  return next;

  test := '0072 · الصيانة مقفولة دلوقتي؟ (للعلم بس)';
  result := case when fn_maintenance_on() then 'الموقع مقفول' else 'الموقع شغّال' end;
  return next;
end;
$$;

revoke execute on function test_maintenance_blocks() from public, anon, authenticated;


-- ############################################################################
-- # 20260909190000_0073_media_write_policies.sql
-- ############################################################################

-- ============================================================================
-- 0073 — صلاحيات رفع صور السبوطات على Storage
--
-- المشكلة: دلو `public-media` (اللي المفروض صور السبوطات تتحط فيه) كان عنده
-- سياستين بس:
--     media_read        select  → للكل (تمام، الصور دي عامة)
--     media_admin_write insert  → fn_is_admin()
--
-- يعني حاجتين ناقصين:
--   ١) مفيش `update` ولا `delete` خالص — فأي محاولة تبدّل صورة أو تشيلها
--      كانت هتترفض من غير رسالة واضحة.
--   ٢) الكتابة على `fn_is_admin()` — ودي بقت «أي صف نشط في admin_users»،
--      يعني حتى `support` يقدر يرفع صور على الموقع العام. القاعدة الحاكمة
--      رقم ٢ في CLAUDE.md بتقول الكتابة الحساسة على fn_has_permission.
--
-- الصلاحية المناسبة: `sbotat.edit` — نفس اللي بيعدّل السبوطة نفسها.
-- ============================================================================

-- القراية للكل — موجودة من 0025، بس بنأكدها هنا علشان الملف يبقى مكتفي
-- بنفسه: من غيرها الصور اللي هترفعها مش هتظهر لأي زائر.
drop policy if exists media_read on storage.objects;
create policy media_read on storage.objects for select
  using (bucket_id = 'public-media');

drop policy if exists media_admin_write on storage.objects;
create policy media_admin_write on storage.objects for insert
  with check (bucket_id = 'public-media' and fn_has_permission('sbotat.edit'));

drop policy if exists media_admin_update on storage.objects;
create policy media_admin_update on storage.objects for update
  using (bucket_id = 'public-media' and fn_has_permission('sbotat.edit'))
  with check (bucket_id = 'public-media' and fn_has_permission('sbotat.edit'));

drop policy if exists media_admin_delete on storage.objects;
create policy media_admin_delete on storage.objects for delete
  using (bucket_id = 'public-media' and fn_has_permission('sbotat.edit'));

-- ===== اختبار =====
create or replace function test_media_policies()
returns table (test text, result text)
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  test := '0073 · التلات سياسات (رفع/تبديل/مسح) موجودة';
  select count(*) into n from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname in ('media_admin_write', 'media_admin_update', 'media_admin_delete');
  if n = 3 then
    result := 'نجح — ٣ من ٣';
  else
    result := format('فشل — %s من ٣ بس', n);
  end if;
  return next;

  test := '0073 · الكتابة على fn_has_permission مش fn_is_admin';
  select count(*) into n from pg_policies
   where schemaname = 'storage' and tablename = 'objects'
     and policyname like 'media_admin_%'
     and coalesce(qual, '') || coalesce(with_check, '') like '%fn_is_admin%';
  if n = 0 then
    result := 'نجح';
  else
    result := format('فشل — لسه %s سياسة على fn_is_admin', n);
  end if;
  return next;

  test := '0073 · القراية لسه مفتوحة للكل (الصور عامة)';
  if exists (
    select 1 from pg_policies
     where schemaname = 'storage' and tablename = 'objects' and policyname = 'media_read'
  ) then
    result := 'نجح';
  else
    result := 'فشل — الصور مش هتظهر للزوار';
  end if;
  return next;
end;
$$;

revoke execute on function test_media_policies() from public, anon, authenticated;

-- ============================================================================
-- خلصنا. شغّل دول كل واحد لوحده وابعتلي النتيجة:
--
--   select * from test_public_lists();
--   select * from test_otp_hardening();
--   select * from test_admin_page_and_totals();
--   select * from test_maintenance_blocks();
--   select * from test_media_policies();
-- ============================================================================
