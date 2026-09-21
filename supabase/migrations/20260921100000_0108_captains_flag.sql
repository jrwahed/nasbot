-- ============================================================================
-- 0108 — مفتاح ميزة للكباتن + قفل الأقسام الفاضية
--
-- المشكلة: `/shoghl` و`/s/mystery` و`/captains` مبنيين بالكامل و**صفر
-- بيانات**. الزائر الأول بيفتح الموقع ويلاقي صفحات فاضية، فالمشروع باين
-- متوقف. والحل مش إننا نملا الصفحات بكلام — الحل إن القسم الفاضي **يتقفل
-- ويختفي من القايمة والذيل**، ويرجع لما يبقى فيه بيانات.
--
-- `work_sbota` و`mystery` مفاتيحهم موجودة من `0036`. **`captains` مالوش
-- مفتاح خالص** — ده الناقص الوحيد هنا.
--
-- ⚠ الملف ده **ما بيقفلش حاجة**. بيدّي المالك الزرار بس. القفل قرار من
--    `/admin/settings` ← مفاتيح المزايا، زي أي رقم تاني في المشروع.
--
-- آمنة تتكرر: `on conflict do nothing` — لو المالك قفل المفتاح، اللزق تاني
-- ما يفتحوش تاني.
-- ============================================================================

-- ⚠ `name_ar` عمود **إجباري** في الجدول (هو اللي بيتعرض في اللوحة).
--    أول نسخة نسيته واللزق وقع بـnot-null — الشيم الحقيقي هو المرجع، مش
--    الذاكرة.
insert into feature_flags (key, name_ar, is_on, off_message_ar)
values ('captains', 'صفحة الكباتن', true,
        'صفحة الكباتن مقفولة دلوقتي. الخروجات بيفتحها الأعضاء بنفسهم — جرّب «افتح خروجة».')
on conflict (key) do nothing;

comment on table feature_flags is
  'مفاتيح المزايا — القفل بيخفي الصفحة **والرابط اللي بيوديها** من القايمة والذيل (0108).';


-- ===== دالة الاختبار =====
--
-- ⚠ سلوكية: إن المفتاح «موجود» ما يعنيش إن القفل بيشتغل. بنقفله فعلًا
--    وبنتأكد إن القراية بترجّع مقفول، وبنرجّعه في الطريقين.
create or replace function test_section_flags()
returns table (test text, result text)
language plpgsql
set search_path = public
as $body$
declare
  n int;
  v_was boolean;
  v_on  boolean;
begin
  -- ⚠ الفاحص بيتأكد إن **اللي حطيناه لسه موجود**، مش إنه الوحيد (الدرس
  --   العاشر: صف زيادة مش عطل، ده المالك بيشتغل).
  test := '0108 · مفاتيح الأقسام التلاتة موجودة';
  select count(*) into n from feature_flags
   where key in ('work_sbota', 'mystery', 'captains');
  if n = 3 then result := 'نجح';
  else result := format('فشل — %s من ٣، فيه قسم فاضي مالوش زرار قفل', n); end if;
  return next;

  test := '0108 · كل مفتاح ليه اسم ورسالة «مقفول»';
  select count(*) into n from feature_flags
   where key in ('work_sbota', 'mystery', 'captains')
     and (coalesce(btrim(off_message_ar), '') = '' or coalesce(btrim(name_ar), '') = '');
  if n = 0 then result := 'نجح';
  else result := format('فشل — %s مفتاح ناقصه اسم أو سبب قفل', n); end if;
  return next;

  -- ===== سلوكي =====
  select is_on into v_was from feature_flags where key = 'captains';
  if v_was is null then
    test := '0108 · القفل بيشتغل';
    result := 'معلومة — مفتاح captains مش موجود، الاختبار السلوكي اتخطّى';
    return next;
    return;
  end if;

  begin
    update feature_flags set is_on = false where key = 'captains';
    select is_on into v_on from feature_flags where key = 'captains';
    test := '0108 · القفل بيتحفظ فعلًا';
    if v_on = false then result := 'نجح';
    else result := 'فشل — 🔴 قفلنا المفتاح والقاعدة لسه بتقول مفتوح'; end if;
    return next;
  exception when others then
    update feature_flags set is_on = v_was where key = 'captains';
    test := '0108 · القفل بيتحفظ فعلًا';
    result := 'فشل — استثناء: ' || sqlerrm;
    return next;
  end;

  -- ⚠ الترجيع في الطريقين — من غيره الفاحص بيقفل قسم على المالك
  update feature_flags set is_on = v_was where key = 'captains';
end $body$;

comment on function test_section_flags() is
  '0108 — الأقسام اللي ممكن تبقى فاضية ليها مفاتيح ورسايل، والقفل بيتحفظ فعلًا.';
