-- ============================================================================
-- فحص شامل لقاعدة نسبوط
--
-- بيشغّل **كل** دوال الاختبار الموجودة ويطلّع اللي فشل بس.
-- الزقه كله مرة واحدة في Supabase ← SQL Editor ← Run.
--
-- · بيلاقي الدوال لوحده — مش هيقع لو واحدة ناقصة، وبياخد أي واحدة جديدة.
-- · بيرجّع الدور والهوية لأصلهم بين كل دالة والتانية. الاختبارات السلوكية
--   بتلبس أدوار (`anon` · `authenticated`)، ومن غير الترجيع ده الدالة
--   اللي بعدها بتشتغل بهوية غلط وتقول «فشل» وهي سليمة.
-- · «فشل» بس هي اللي بتتحسب. فيه صفوف معلوماتية (زي «الموقع شغّال»)
--   مش نجاح ولا فشل.
--
-- ⚠ بعض الاختبارات بتكتب صفوف اختبار وبتمسحها ورا نفسها — ده مقصود.
-- ============================================================================
create temp table if not exists _fails (دالة text, بند text, النتيجة text);
truncate _fails;

do $$
declare f record;
begin
  for f in
    select p.proname
      from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public'
       and p.proname like 'test\_%'
       and p.pronargs = 0
       and pg_get_function_result(p.oid) ilike 'TABLE(test text, result text)%'
     order by p.proname
  loop
    -- هوية نضيفة قبل كل دالة
    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);

    begin
      execute format(
        'insert into _fails select %L, test, result from %I() where result like %L',
        f.proname, f.proname, 'فشل%'
      );
    exception when others then
      insert into _fails values (f.proname, '⚠ الدالة نفسها وقعت', sqlerrm);
    end;

    execute 'reset role';
    perform set_config('request.jwt.claims', '', true);
  end loop;
end $$;

select
  coalesce(
    (select string_agg(دالة || '  →  ' || بند || E'\n      ' || النتيجة, E'\n\n'
                       order by دالة, بند) from _fails),
    '✅ مفيش ولا فشل — القاعدة كلها تمام'
  ) as النتيجة,
  (select count(*) from _fails) as عدد_الفشل;
