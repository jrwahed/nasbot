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
-- activityToDb في map-db.ts كان بيرجّع 'swimming' لأي حاجة غير بادل وجري،
-- فـ«عجل» كانت هتتحفظ سباحة. قفلناها لحد ما map-db يعرفها.
--
-- ⚠ **الحل المؤقت ده بطل مع 0075** — `activityToDb` بقى بحث حقيقي، و0075
--    بترجّع «عجل» نشطة. والسطر ده كان بيحصل بينه وبين 0075 صراع: لو حد
--    لزق الدفعة ٦ **بعد** الدفعة ٧ (أو كرّرها بعدها)، القفل ده بيكسب
--    والفتح بيضيع بالصمت. وده حصل فعلًا على قاعدة الإنتاج.
--
--    دلوقتي بنتأكد الأول: لو حارس 0075 موجود يبقى 0075 اتلزقت خلاص —
--    فما نرجعش نقفلها. يعني الترتيب بقى مش مهم.
do $$
begin
  if to_regproc('fn_skill_activity_guard') is null then
    update skill_activities set is_active = false where key = 'cycling';
  else
    raise notice '0065: «عجل» سايبينها نشطة — 0075 اتلزقت خلاص';
  end if;
end $$;

-- ===== ٦ · حد الاهتمامات — الرقم من اللوحة مش من الكود =====
update profile_fields
   set validation = coalesce(validation, '{}'::jsonb) || jsonb_build_object('max', 5)
 where key = 'interests'
   and (validation ->> 'max') is null;

comment on column field_options.value is
  'القيمة الأساسية اللي طبقة البيانات بتفهمها (map-db.ts) — متتغيّرش. المعروض هو label_ar.';
