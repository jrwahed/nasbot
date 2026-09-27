-- ============================================================================
-- 0118 · «8 بس» تحت «سبوطات الأسبوع ده» ما بقتش صح
--
-- النص كان بيقول إن كل مجموعة ٨ — وأول سبوطة حقيقية (بادل) ٦. بقى من غير
-- رقم علشان يمشي مع أي عدد.
--
-- ⚠ بيغيّر **بس لو النص لسه القديم بالحرف** — لو المالك كتب حاجة من اللوحة
--   (/admin/copy) ما بنلمسهاش. آمن يتكرر.
-- ============================================================================

update copy_strings
   set value_ar = 'المجموعة صغيرة. لما تكمل تكمل.'
 where key = 'home.text.2'
   and value_ar = '8 بس. لما تكمل تكمل.';

create or replace function test_home_group_size_copy()
returns table (test text, result text)
language plpgsql
set search_path = public
as $body$
declare v text;
begin
  test := '0118 · «سبوطات الأسبوع ده» مش بتقول عدد ثابت';
  select value_ar into v from copy_strings where key = 'home.text.2';
  if v is null then
    result := 'معلومة — المفتاح مش في القاعدة، الاحتياطي هو اللي بيبان';
  elsif v = '8 بس. لما تكمل تكمل.' then
    result := 'فشل — لسه بيقول «8 بس» والمجموعات مش كلها ٨';
  else
    result := 'نجح';
  end if;
  return next;
end $body$;

revoke execute on function test_home_group_size_copy() from public, anon, authenticated;
