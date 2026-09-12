-- ============================================================================
-- 0080 — العضو لازم يشوف الأماكن علشان يختار مكان خروجته
--
-- المشكلة: سياسة `venues_read` قراية للإدارة بس (`fn_is_admin()`). فبعد
-- 0078، العضو يقدر يفتح خروجة بس مش شايف مكان يختاره — الميزة نصّها ناقص.
--
-- ⚠ والباب ده لازم يبقى **ضيّق أوي**، مش توسيع لسياسة `venues`:
--   `venues` فيها `wholesale_price` (سعر الجملة) و`contact_phone`
--   و`contract_notes` و`address` والإحداثيات. المراجعة الأمنية اتتبّعت سعر
--   الجملة وثبتت إنه **مش قابل للوصول من أي مسار عضو** — ولو وسّعنا سياسة
--   القراية هنا كنا هنكسر ده بإيدينا. وكمان `address` عمره ما بيظهر قبل
--   الحجز المدفوع (`sbotat.address_hidden` + `fn_sbota_address`).
--
-- الحل: دالة بترجّع **أربع أعمدة بس** — المعرّف والاسم والنوع والمنطقة.
-- مفيش عنوان ولا إحداثيات ولا تليفون ولا سعر جملة.
--
-- آمنة تتكرر: `create or replace` + `revoke` صريح.
-- ============================================================================

create or replace function fn_venue_options()
returns table (
  id   uuid,
  name text,
  kind venue_kind_t,
  area area_t
)
language sql
stable
security definer
set search_path = public
as $$
  select v.id, v.name, v.kind, v.area
    from venues v
   where v.is_active
     and auth.uid() is not null
   order by v.area, v.name;
$$;

comment on function fn_venue_options() is
  'أماكن الخروجة للعضو وهو بيفتح خروجة — الاسم والنوع والمنطقة بس. عن قصد مفيش عنوان ولا إحداثيات ولا تليفون ولا سعر جملة: توسيع سياسة venues بدل الدالة دي كان هيكسر إن سعر الجملة مش قابل للوصول من أي مسار عضو.';

revoke execute on function fn_venue_options() from public, anon;
grant  execute on function fn_venue_options() to authenticated;


-- ===== اختبار =====
-- ⚠ **الحارس ده اتضاف بعد ما `0086` و`0089` غيّروا الأرض من تحت الدالة دي.**
--    `0091` بتعيد تعريفها من غير بند «العضو بيشوف الأماكن» — البند بقى بيختبر
--    فورم مش موجود (العضو بقى بيكتب مكانه)، وبيقول «فشل» على قاعدة سليمة.
--    فلو الدفعة ٨ اتلزقت **بعد** دفعة ٩١ — أو اتكررت بعدها — الملف ده كان
--    هيرجّع النسخة القديمة **بالصمت**.
--
--    القاعدة (CLAUDE.md §٨ · الدرس التالت والسادس): لو هجرة جديدة بتلغي أثر
--    هجرة قديمة، ارجع للقديمة وخلّيها **مشروطة** — ووصّل التحصين للحزمة كمان.
do $guard0080$
begin
  if to_regprocedure('fn_test_seed_up()') is not null then
    raise notice '0080: سايبين test_venue_options زي ما هي — 0091 اتلزقت خلاص';
    return;
  end if;
  execute $fn0080$
create or replace function test_venue_options()
returns table (test text, result text)
language plpgsql
set search_path = public
as $$
declare
  n       int;
  me      text := current_user;
  uid     uuid;
  cols    text;
begin
  -- ⚠ لازم عضو **مش** إدارة: `venues_read` بتسمح للإدارة عن قصد، فلو وقع
  --   الاختيار على صف في admin_users الاختبار بيقول «فشل» غلط.
  select p.id into uid
    from profiles p
   where p.banned_at is null
     and not exists (select 1 from admin_users a where a.profile_id = p.id and a.is_active)
   limit 1;

  test := '0080 · fn_venue_options بترجّع ٤ أعمدة بس';
  select string_agg(a.attname, ',' order by a.attnum) into cols
    from pg_proc p
    join unnest(p.proargnames) with ordinality as u(nm, ord) on true
    join lateral (select u.nm as attname, u.ord as attnum) a on true
   where p.proname = 'fn_venue_options';
  if cols = 'id,name,kind,area' then
    result := 'نجح — ' || cols;
  else
    result := format('فشل — 🔴 بترجّع: %s', coalesce(cols, 'مش معروف'));
  end if;
  return next;

  test := '0080 · 🔴 مفيش سعر جملة ولا عنوان ولا تليفون في الدالة';
  if (select prosrc from pg_proc where proname = 'fn_venue_options')
       !~ '(wholesale_price|address|contact_phone|contract_notes|map_lat|map_lng)' then
    result := 'نجح';
  else
    result := 'فشل — 🔴 الدالة بتسرّب بيانات المكان الحساسة';
  end if;
  return next;

  test := '0080 · سياسة venues لسه مضيّقة (ما اتوسّعتش)';
  if exists (
    select 1 from pg_policies
     where tablename = 'venues' and policyname = 'venues_read'
       and coalesce(qual,'') like '%fn_is_admin%'
  ) then result := 'نجح — الجدول نفسه لسه للإدارة بس';
  else result := 'فشل — 🔴 سياسة venues اتوسّعت، سعر الجملة بقى مكشوف'; end if;
  return next;

  test := '0080 · الدالة مسحوبة من anon';
  if not has_function_privilege('anon', 'fn_venue_options()', 'execute') then
    result := 'نجح';
  else result := 'فشل — 🔴 الزائر بيعدّ أماكننا'; end if;
  return next;

  -- سلوكي: الزائر مش بيشوف، والعضو بيشوف
  begin
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    execute 'set local role anon';

    test := 'سلوكي · الزائر **مش** بيقدر ينادي fn_venue_options';
    n := -1;
    begin
      select count(*) into n from fn_venue_options();
    exception when others then
      n := -1;
    end;
    if n = -1 then result := 'نجح — permission denied';
    else result := format('فشل — 🔴 الزائر شاف %s مكان', n); end if;
    return next;

    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);
  exception when others then
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);
    test := 'سلوكي · اختبار الزائر';
    result := 'فشل — ' || sqlerrm;
    return next;
  end;

  if uid is null then
    test := 'سلوكي · العضو بيشوف الأماكن';
    result := 'نجح — اتخطى (مفيش عضو في القاعدة دي)';
    return next;
  else
    begin
      perform set_config(
        'request.jwt.claims',
        json_build_object('sub', uid::text, 'role', 'authenticated')::text, true);
      execute 'set local role authenticated';

      test := 'سلوكي · العضو **بيشوف** الأماكن النشطة (متكسرش الفورم)';
      n := -1;
      begin
        select count(*) into n from fn_venue_options();
      exception when others then
        n := -1;
      end;
      if n > 0 then result := format('نجح — شاف %s مكان', n);
      else result := format('فشل — شاف %s، فورم فتح الخروجة هيبقى فاضي', n); end if;
      return next;

      test := 'سلوكي · العضو لسه **مش** بيقرا جدول venues نفسه';
      -- (اللي فوق ضمن إن uid مش إدارة، فالقراية هنا لازم تبقى صفر)
      n := -1;
      begin
        select count(*) into n from venues;
      exception when others then
        n := -1;
      end;
      if n <= 0 then result := 'نجح — الجدول لسه مقفول';
      else result := format('فشل — 🔴 العضو قرا %s صف من venues بسعر الجملة', n); end if;
      return next;

      execute format('set local role %I', me);
      perform set_config('request.jwt.claims', '', true);
    exception when others then
      execute format('set local role %I', me);
      perform set_config('request.jwt.claims', '', true);
      test := 'سلوكي · اختبار العضو';
      result := 'فشل — ' || sqlerrm;
      return next;
    end;
  end if;
end;
$$;

comment on function test_venue_options() is
  'بتتأكد إن العضو بيشوف أماكن الخروجة من غير ما جدول venues يتفتح. select * from test_venue_options();';

$fn0080$;
end $guard0080$;

revoke execute on function test_venue_options() from public, anon, authenticated;
