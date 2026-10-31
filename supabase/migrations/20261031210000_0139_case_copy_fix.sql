-- ============================================================================
-- 0139 — تصليح نص: تكرار «لسه» في مسرح واقعة «عقد الهانم»
-- ============================================================================
--
-- اكتشفه المالك وهو بيقرا `/qadeya` على الإنتاج (٢٠٢٦-١٠-٣١):
--   «النور لسه راجع لسه، وريحة الشمع في الأوضة.»
--
-- التحديث **مشروط** — بيتنفّذ بس لو النص لسه فيه التكرار (الدرس التلاتة
-- وعشرين: الشرط سطر واحد بـ`like` مش مقارنة بنص متعدد الأسطر، علشان
-- `\r\n` الجاية من اللزق ما تمنعش المطابقة). فلو المالك عدّل الفقرة من
-- `/admin/cases` بإيده، الهجرة ما بتلمسهاش.
--
-- وآمنة تتكرر: التشغيل التاني ما بيلاقي التكرار فما بيعملش حاجة.
-- ============================================================================

update cases
   set scene_ar = replace(scene_ar, 'النور لسه راجع لسه', 'النور لسه راجع')
 where slug = 'aqd-elhanem'
   and scene_ar like '%النور لسه راجع لسه%';

-- ============================================================================
-- الاختبار
-- ============================================================================

create or replace function test_case_copy_fix()
returns table (test text, result text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_scene text;
begin
  select scene_ar into v_scene from cases where slug = 'aqd-elhanem';

  -- ⚠ الفحص بالنتيجة مش بإن الـupdate اتنفّذ (الدرس التلاتة وعشرين)
  return query select
    '0139 · تكرار «لسه» اتشال من مسرح واقعة عقد الهانم'::text,
    case when v_scene is null then 'معلومة: القضية مش موجودة'
         when v_scene like '%النور لسه راجع لسه%' then 'فشل: النص لسه فيه التكرار'
         else 'نجح' end::text;

  -- والجملة نفسها لازم تفضل موجودة — مش يبقى الـreplace شال السطر كله
  return query select
    '0139 · الجملة لسه مكتوبة صح'::text,
    case when v_scene is null then 'معلومة: القضية مش موجودة'
         when v_scene like '%النور لسه راجع،%' then 'نجح'
         else 'معلومة: المالك عدّل الفقرة من اللوحة' end::text;
end;
$$;

revoke execute on function test_case_copy_fix() from public, anon;
grant  execute on function test_case_copy_fix() to service_role;

comment on function test_case_copy_fix() is
  '0139 — بيتأكد إن تكرار «لسه» في مسرح واقعة عقد الهانم اتشال.';
