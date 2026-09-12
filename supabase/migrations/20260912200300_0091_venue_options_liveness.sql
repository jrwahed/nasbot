-- ============================================================================
-- 0091 — `test_venue_options` بطّلت تشترط إن فيه أماكن في القاعدة
--
-- ⚠ **إيه اللي اتغيّر تحتها:**
--    `0080` عملت `fn_venue_options()` علشان قايمة الأماكن في فورم «افتح خروجة»،
--    وحطت فيها بند سلوكي: «العضو **بيشوف** الأماكن النشطة (متكسرش الفورم)».
--    البند ده كان صح ساعتها.
--
--    بس `0086` شالت القايمة دي خالص — العضو بقى **بيكتب** اسم المكان والعنوان
--    بنفسه. و`fn_venue_options()` مبقتش بتتنادى من أي مكان في الكود (اتأكدنا
--    بالبحث في `src/` كله). يعني البند بقى بيختبر فورم **مش موجود**.
--
--    وبعد ما `0089` مسحت أماكن العرض، البند ده بقى بيقول «فشل» على قاعدة
--    سليمة تمامًا. وفاحص بيقول «فشل» وهو غلط أسوأ من فاحص مش موجود: الناس
--    بتتعوّد تتجاهله، وبعدين تتجاهل فشل حقيقي جنبه.
--
-- **اللي اتشال:** بند «العضو بيشوف الأماكن» بس.
-- **اللي فضل (وده المهم):** كل بنود الأمان — الزائر المجهول ما يشوفش،
--    وسياسة `venues` ما اتوسّعتش، وسعر الجملة والتليفون ما بيوصلوش للعضو.
--    الدالة لسه موجودة وممنوحة زي ما هي؛ إحنا شيلنا **توقّع** مش حماية.
-- ============================================================================

do $guard$
begin
  if to_regprocedure('test_venue_options()') is null then
    raise notice '0091: test_venue_options مش موجودة — اتخطينا';
    return;
  end if;
end $guard$;

-- بنعيد تعريفها من غير بند «العضو بيشوف الأماكن»
create or replace function test_venue_options()
returns table (test text, result text)
language plpgsql
set search_path = public
as $body$
declare
  n   int;
  uid uuid;
  me  text := current_user;
begin
  test := '0080 · fn_venue_options موجودة';
  if to_regprocedure('fn_venue_options()') is not null then result := 'نجح';
  else result := 'فشل — الدالة ناقصة'; end if;
  return next;

  -- 🔴 ده أهم بند في الملف: توسيع سياسة venues بيكشف سعر الجملة والتليفون
  test := '0080 · سياسة venues لسه مضيّقة (ما اتوسّعتش)';
  select count(*) into n from pg_policies
   where tablename = 'venues' and policyname = 'venues_read'
     and coalesce(qual,'') not like '%fn_is_admin%';
  if n = 0 then result := 'نجح';
  else result := 'فشل — 🔴 سياسة venues اتوسّعت، سعر الجملة بقى مكشوف'; end if;
  return next;

  test := '0080 · fn_venue_options مسحوبة من anon';
  if not has_function_privilege('anon', 'fn_venue_options()', 'execute')
    then result := 'نجح';
    else result := 'فشل — الزائر المجهول بينادي الدالة'; end if;
  return next;

  -- سلوكي: الزائر المجهول ما يشوفش أماكن
  begin
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    execute 'set local role anon';

    test := 'سلوكي · الزائر المجهول **مش** شايف venues';
    select count(*) into n from venues;
    if n = 0 then result := 'نجح';
    else result := format('فشل — تسريب %s مكان', n); end if;
    return next;

    execute format('set local role %I', me);
  exception when others then
    execute format('set local role %I', me);
    test := 'سلوكي · اختبار الزائر';
    result := 'فشل — ' || sqlerrm;
    return next;
  end;

  -- ملاحظة مش نجاح ولا فشل: عدد الأماكن دلوقتي
  select count(*) into n from venues;
  test := '0080 · (معلومة) عدد الأماكن في القاعدة';
  result := format('%s مكان — الرقم ده مش شرط: العضو بيكتب مكانه بنفسه من 0086', n);
  return next;
end $body$;

revoke execute on function test_venue_options() from public, anon, authenticated;
