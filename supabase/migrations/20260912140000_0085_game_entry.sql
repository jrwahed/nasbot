-- ============================================================================
-- 0085 — مدخل اللعبة
--
-- المشكلة: `/game` مبنية وشغّالة، نصوصها في `copy_strings`، وليها مفتاح
-- ميزة مفتوح — و**مفيش ولا لينك واحد ليها في الموقع كله**. دوّرنا في
-- الهيدر والرئيسية والذيل و`/me`: صفر. الطريق الوحيد إنك تكتب الـURL.
--
-- الكود دلوقتي فيه مدخلين: شريط في الرئيسية (`GameStrip`) ورابط في الهيدر،
-- والاتنين ورا مفتاح `game` — لو المالك قفل اللعبة، المدخل يختفي بدل ما
-- يودّي الناس على شاشة «مقفول».
--
-- الملف ده بيحط نصوص المدخلين علشان تتعدّل من /admin/content.
-- الموقع شغّال بيهم من غير اللزق (الاحتياطي في copy-fallback.ts).
--
-- آمن يتكرر.
-- ============================================================================

insert into copy_strings (key, value_ar, screen, context_ar) values
  ('game.nav', 'اللعبة', 'اللعبة', 'رابط اللعبة في الهيدر — Header.tsx'),
  ('game.strip.title', 'مين جاي معاك؟', 'اللعبة', 'عنوان شريط اللعبة في الرئيسية'),
  ('game.strip.sub', 'جاوب كام سؤال، ونقولك أنهي خروجة تناسبك.', 'اللعبة', 'سطر تحت العنوان'),
  ('game.strip.cta', 'العب', 'اللعبة', 'زرار الشريط')
on conflict (key) do update
  set value_ar   = excluded.value_ar,
      screen     = excluded.screen,
      context_ar = coalesce(excluded.context_ar, copy_strings.context_ar);


-- ===== اختبار =====
create or replace function test_game_entry()
returns table (test text, result text)
language plpgsql
security definer
set search_path = public
as $$
declare n int;
begin
  test := '0085 · نصوص مدخل اللعبة الأربعة في القاعدة';
  select count(*) into n from copy_strings
   where key in ('game.nav','game.strip.title','game.strip.sub','game.strip.cta');
  if n = 4 then result := 'نجح'; else result := format('فشل — %s من ٤', n); end if;
  return next;

  test := '0085 · مفتاح ميزة game موجود (المدخل بيختفي لو اتقفل)';
  if exists (select 1 from feature_flags where key = 'game') then
    result := 'نجح';
  else result := 'فشل — المدخل مش هيقدر يتقفل من اللوحة'; end if;
  return next;
end;
$$;

comment on function test_game_entry() is
  'بتتأكد إن نصوص مدخل اللعبة وصلت. select * from test_game_entry();';

revoke execute on function test_game_entry() from public, anon, authenticated;
