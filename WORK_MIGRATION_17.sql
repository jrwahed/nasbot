-- ============================================================================
-- WORK_MIGRATION_17.sql — نص زرار قايمة الموبايل
-- بعده: select * from test_menu_copy();
-- ============================================================================

-- ############################################################################
-- # 20260913100000_0096_menu_copy.sql
-- ############################################################################

-- ============================================================================
-- 0096 — نص زرار قايمة الموبايل
--
-- الـnav في الهيدر `lg:flex` — يعني كمبيوتر بس. فضلت كده شهور، ونتيجتها إن
-- اللي على الموبايل ما كانش يقدر يوصل للخريطة ولا القواعد ولا الكباتن ولا
-- اللعبة: مفيش ولا رابط. دلوقتي فيه زرار قايمة، ومحتاج اسم.
-- ============================================================================
insert into copy_strings (key, value_ar, screen, context_ar) values
  ('shared.menu', 'القايمة', 'مشترك',
   'اسم زرار القايمة على الموبايل — بيتقرا لقارئ الشاشة')
on conflict (key) do nothing;

create or replace function test_menu_copy()
returns table (test text, result text)
language plpgsql security definer set search_path = public
as $body$
begin
  test := '0096 · نص زرار القايمة موجود';
  if exists (select 1 from copy_strings where key = 'shared.menu')
    then result := 'نجح';
    else result := 'فشل — الزرار هيطلع من غير اسم لقارئ الشاشة'; end if;
  return next;
end $body$;

revoke execute on function test_menu_copy() from public, anon, authenticated;
