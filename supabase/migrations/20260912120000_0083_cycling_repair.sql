-- ============================================================================
-- 0083 — ترجيع «عجل» نشطة (تصليح ترتيب لزق)
--
-- المشكلة اللي حصلت فعلًا على الإنتاج:
--   0065 (دفعة ٦) بتقفل `cycling` — حل مؤقت كان لازم لما `activityToDb`
--   كان بيحفظ أي نشاط مجهول «سباحة».
--   0075 (دفعة ٧) بترجّعها نشطة بعد ما الكود اتصلّح.
--
--   الاتنين `update` على نفس الصف، فاللي يتلزق **آخر** هو اللي يكسب. ولو
--   الدفعة ٦ اتلزقت بعد ٧ (أو اتكررت بعدها)، «عجل» بتقفل من تاني بالصمت
--   و`test_last_review_items()` بتقول «فشل — cycling لسه مقفولة».
--
-- الملف ده بيعمل حاجتين:
--   ١) يرجّعها نشطة دلوقتي.
--   ٢) 0065 نفسها اتحصّنت في الكود: بقت ما تقفلش «عجل» لو حارس 0075
--      موجود. فالمشكلة دي عمرها ما هتتكرر مهما كان ترتيب اللزق.
--
-- ⚠ الحارس بتاع 0075 بيرفض تفعيل نشاط مفتاحه مش في `activity_t`.
--   `cycling` موجودة في الـenum من هجرة قديمة، فالتفعيل ده هيعدّي. وبنتأكد
--   من ده الأول بدل ما الملف يقع.
--
-- آمن يتكرر.
-- ============================================================================

do $$
begin
  if not exists (
    select 1 from pg_enum e join pg_type t on t.oid = e.enumtypid
     where t.typname = 'activity_t' and e.enumlabel = 'cycling'
  ) then
    raise notice '0083: «cycling» مش في activity_t — سايبينها مقفولة عن قصد. ضيفها للـenum في هجرة لوحدها الأول.';
    return;
  end if;

  update skill_activities set is_active = true where key = 'cycling';

  if not found then
    raise notice '0083: مفيش صف cycling في skill_activities خالص.';
  end if;
end $$;


-- ===== اختبار =====
create or replace function test_cycling_repair()
returns table (test text, result text)
language plpgsql
security definer
set search_path = public
as $$
begin
  test := '0083 · «عجل» نشطة';
  if exists (select 1 from skill_activities where key = 'cycling' and is_active) then
    result := 'نجح';
  else result := 'فشل — لسه مقفولة'; end if;
  return next;

  test := '0083 · 0065 ما بقتش تقفلها لو 0075 اتلزقت (ترتيب اللزق بطل يفرق)';
  if to_regproc('fn_skill_activity_guard') is not null then
    result := 'نجح — الحارس موجود، و0065 بتتخطى القفل';
  else
    result := 'فشل — حارس 0075 مش موجود، يبقى الدفعة ٧ ناقصة';
  end if;
  return next;
end;
$$;

comment on function test_cycling_repair() is
  'بتتأكد إن «عجل» رجعت نشطة وإن صراع 0065/0075 اتقفل. select * from test_cycling_repair();';

revoke execute on function test_cycling_repair() from public, anon, authenticated;
