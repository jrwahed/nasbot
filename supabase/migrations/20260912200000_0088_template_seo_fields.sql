-- ============================================================================
-- 0088 — تصنيفات «دليل السبوطات» + الكلمات المفتاحية ونص الصورة
--
-- «دليل السبوطات والكلمات المفتاحية» بيدي لكل سبوطة أربع حاجات:
--   العنوان · الوصف · الكلمات المفتاحية · نص الصورة (alt)
--
-- الأولين ليهم أعمدة خلاص (`name_ar` · `story_ar`)، والتانيين مالهمش. وكانوا
-- هيضيعوا لو اتحطوا في `story_ar` مع الوصف.
--
--   · `keywords_ar`  — الكلمات اللي بتساعد جوجل يلاقي الصفحة.
--   · `photo_alt_ar` — وصف الصورة، بيروح في خانة alt.
--
-- ⚠ الاتنين **للبحث مش للعرض** — نص الصورة مش عنوان فرعي يتكتب تحت الصورة.
--    ده وصف للي مش شايف الصورة (قارئ الشاشة) وللي بيفهرسها (جوجل).
--
-- وبيضيف كمان **تصنيفات الدليل الـ٨** لـ`template_kind_t`. التصنيفات القديمة
-- (sport · food · games …) اتسابت زي ما هي — مفيش صف بيتحرّك منها هنا.
--
-- ⚠⚠ **الملف ده لازم يتشغّل لوحده وينتهي قبل `0089`.** بوستجرس ما بيسمحش
--    تستخدم قيمة enum جديدة في نفس المعاملة اللي أضافتها، ومحرر SQL بيشغّل
--    الملف كله كمعاملة واحدة. يعني لو لزقت ٨٨ و٨٩ مع بعض، ٨٩ هتقع بـ
--    «invalid input value for enum template_kind_t». (نفس السبب اللي خلّى
--    `WORK_MIGRATION` اتقسم لـ١ و٢ — شوف CLAUDE.md §٦.)
--
-- السياسات مش محتاجة تتغيّر: الكتابة على `sbota_templates` ماشية على
-- `fn_has_permission('templates.edit')` من `0056`، وهي على الجدول كله.
-- ============================================================================

-- ===== تصنيفات الدليل الـ٨ =====
-- `if not exists` علشان الملف يفضل آمن يتكرر
alter type template_kind_t add value if not exists 'adventure';
alter type template_kind_t add value if not exists 'water_sun';
alter type template_kind_t add value if not exists 'music';
alter type template_kind_t add value if not exists 'curious';
alter type template_kind_t add value if not exists 'handmade';
alter type template_kind_t add value if not exists 'culture';
-- (`nile` و`nature` موجودين خلاص من البذرة الأصلية)

alter table sbota_templates
  add column if not exists keywords_ar  text[] not null default '{}'::text[],
  add column if not exists photo_alt_ar text;

comment on column sbota_templates.keywords_ar is
  'كلمات مفتاحية للبحث (SEO) — من «دليل السبوطات». مش بتتعرض للناس.';
comment on column sbota_templates.photo_alt_ar is
  'نص الصورة (alt) — وصف بصري للي مش شايف الصورة وللي بيفهرسها.';

-- ===== دالة الاختبار =====
create or replace function test_template_seo()
returns table (test text, result text)
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  test := '0088 · تصنيفات الدليل الـ٨ في template_kind_t';
  select count(*) into n from pg_enum e join pg_type t on t.oid=e.enumtypid
   where t.typname='template_kind_t'
     and e.enumlabel in ('adventure','nile','water_sun','nature',
                         'music','curious','handmade','culture');
  if n = 8 then result := 'نجح — ٨ تصنيفات';
  else result := format('فشل — %s من ٨ بس، و0089 هتقع', n); end if;
  return next;

  test := '0088 · العمودين موجودين';
  select count(*) into n from information_schema.columns
   where table_schema='public' and table_name='sbota_templates'
     and column_name in ('keywords_ar','photo_alt_ar');
  if n = 2 then result := 'نجح';
  else result := format('فشل — %s عمود من ٢', n); end if;
  return next;

  test := '0088 · keywords_ar مصفوفة not null بافتراضي فاضي';
  select count(*) into n from information_schema.columns
   where table_schema='public' and table_name='sbota_templates'
     and column_name='keywords_ar' and is_nullable='NO' and data_type='ARRAY';
  if n = 1 then result := 'نجح';
  else result := 'فشل — لو nullable، القوالب القديمة هترجّع null بدل مصفوفة فاضية'; end if;
  return next;

  -- الكتابة لازم تفضل على الصلاحية مش على «أي أدمن» (القاعدة الحاكمة ٥.٢)
  test := '0088 · كتابة القوالب لسه على fn_has_permission مش fn_is_admin';
  select count(*) into n from pg_policies
   where tablename='sbota_templates' and cmd in ('ALL','INSERT','UPDATE','DELETE')
     and coalesce(qual,'') || coalesce(with_check,'') like '%fn_is_admin%';
  if n = 0 then result := 'نجح';
  else result := format('فشل — %s سياسة كتابة على fn_is_admin', n); end if;
  return next;
end $$;

revoke execute on function test_template_seo() from public, anon, authenticated;
