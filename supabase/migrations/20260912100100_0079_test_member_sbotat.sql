-- ============================================================================
-- 0079 — اختبار «الناس هي اللي تظبّط الخروجة» (0078)
--
--   select * from test_member_sbotat();
--
-- كل الصفوف لازم تقول «نجح». أي «فشل» ابعتلي السطر بالحرف.
--
-- الاختبار **سلوكي**: بيلبس دور الزائر المجهول ودور عضو عادي، وبيجرّب يفتح
-- خروجة ويزوّر سعر ويلغي خروجة حد تاني — فعلًا، مش بيتفرّج على السياسات.
-- «الدالة موجودة» ما يعنيش «بتمنع».
--
-- ⚠ security invoker عن قصد (زي test_last_review_items): بوستجرس بيرفض
-- `set role` جوه دالة definer. التنفيذ مسحوب من public/anon/authenticated
-- تحت — بتتشغّل من محرر SQL بس.
--
-- بينضّف ورا نفسه: أي سبوطة اختبار بتتمسح في الآخر بعلامة `__test__`.
-- ============================================================================

create or replace function test_member_sbotat()
returns table (test text, result text)
language plpgsql
set search_path = public
as $$
declare
  n        int;
  me       text := current_user;
  male_id  uuid;
  other_id uuid;
  tpl_id   uuid;
  ven_id   uuid;
  new_id   uuid;
  other_sb uuid;
  ok       boolean;
  v_price  int;
  v_fee    int;
  v_set    settings%rowtype;
begin
  select * into v_set from settings where id;

  -- عضو راجل عادي (مش إدارة) — علشان نختبر حارس «بنات بس» كمان
  select p.id into male_id
    from profiles p
   where p.gender = 'male' and p.banned_at is null
     and not exists (select 1 from admin_users a where a.profile_id = p.id)
   limit 1;

  -- وعضو تاني خالص — علشان نجرّب نلغي خروجة مش بتاعتنا
  select p.id into other_id
    from profiles p
   where p.banned_at is null and p.id is distinct from male_id
   limit 1;

  select id into tpl_id from sbota_templates
   where kind not in ('work','mystery') order by created_at limit 1;
  select id into ven_id from venues where is_active limit 1;

  /* ===================== ١ · الشكل — الأعمدة والأرقام ================== */

  test := '0078 · نوع sbota_origin_t موجود بقيمتين';
  select count(*) into n from pg_enum e join pg_type t on t.oid = e.enumtypid
   where t.typname = 'sbota_origin_t';
  if n = 2 then result := 'نجح';
  else result := format('فشل — %s قيمة', n); end if;
  return next;

  test := '0078 · أعمدة صاحب الخروجة على sbotat';
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'sbotat'
     and column_name in ('origin','host_id','host_name_ar','host_note_ar');
  if n = 4 then result := 'نجح — ٤ أعمدة';
  else result := format('فشل — %s من ٤', n); end if;
  return next;

  test := '0078 · حدود خروجة العضو كلها في settings مش في الكود';
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'settings'
     and column_name in ('site_fee','member_sbota_min_capacity','member_sbota_max_capacity',
                         'member_sbota_max_open','member_sbota_min_lead_hours',
                         'member_sbota_max_days_ahead','member_sbota_auto_open');
  if n = 7 then result := 'نجح — ٧ أعمدة';
  else result := format('فشل — %s من ٧، يعني في رقم لسه في الكود', n); end if;
  return next;

  test := '0078 · مفتاح ميزة member_sbota موجود';
  if exists (select 1 from feature_flags where key = 'member_sbota') then
    result := 'نجح';
  else result := 'فشل — اللوحة مش هتقدر تقفل الباب'; end if;
  return next;

  test := '0078 · 🔴 مفيش سياسة insert للعضو على sbotat';
  select count(*) into n from pg_policies
   where tablename = 'sbotat' and cmd in ('INSERT','ALL')
     and coalesce(with_check,'') not like '%fn_is_admin%'
     and coalesce(with_check,'') not like '%fn_has_permission%';
  if n = 0 then result := 'نجح — الطريق الوحيد fn_create_sbota';
  else result := format('فشل — 🔴 %s سياسة بتسمح بكتابة مباشرة، يعني تزوير سعر ومصدر', n); end if;
  return next;

  test := '0078 · الدوال الجديدة مسحوبة من anon';
  select count(*) into n from pg_proc p
   where p.proname in ('fn_create_sbota','fn_update_own_sbota','fn_cancel_own_sbota','fn_my_hosted_sbotat')
     and has_function_privilege('anon', p.oid, 'execute');
  if n = 0 then result := 'نجح — الأربعة مقفولين على المجهول';
  else result := format('فشل — 🔴 %s دالة مفتوحة للزائر', n); end if;
  return next;

  test := '0078 · fn_create_sbota مفيهاش parameter للسعر';
  if (select count(*) from pg_proc where proname = 'fn_create_sbota'
       and pg_get_function_identity_arguments(oid) like '%price%') = 0 then
    result := 'نجح — السعر بيتحسب جوه من القالب';
  else result := 'فشل — 🔴 العضو بيبعت السعر، يعني حجز ببلاش'; end if;
  return next;

  test := '0078 · صاحب الخروجة داخل فحص الكشف (مش باب جنبي)';
  if (select prosrc from pg_proc where proname = 'fn_is_my_sbota_revealed') like '%host_id%'
     and (select prosrc from pg_proc where proname = 'fn_is_my_sbota_revealed') like '%reveal_at%' then
    result := 'نجح — نفس شرط الكابتن، بعد الكشف بس';
  else result := 'فشل — السرية اتكسرت'; end if;
  return next;

  /* ===================== ٢ · سلوكي — الزائر المجهول ==================== */

  begin
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    execute 'set local role anon';

    test := 'سلوكي · الزائر **مش** بيقدر ينادي fn_create_sbota';
    ok := false;
    begin
      perform fn_create_sbota(tpl_id, ven_id, now() + interval '10 days', 6, false, '__test__');
    exception when others then
      ok := true;
    end;
    if ok then result := 'نجح — permission denied';
    else result := 'فشل — 🔴 الزائر المجهول فتح خروجة'; end if;
    return next;

    test := 'سلوكي · الزائر **مش** بيقدر يكتب على sbotat مباشرة';
    ok := false;
    begin
      insert into sbotat (template_id, venue_id, starts_at, ends_at, price, capacity, status, origin)
      values (tpl_id, ven_id, now() + interval '10 days', now() + interval '10 days 2 hours',
              0, 6, 'open', 'nasbot');
      ok := false;
    exception when others then
      ok := true;
    end;
    if ok then result := 'نجح';
    else result := 'فشل — 🔴 الزائر كتب سبوطة بسعر صفر'; end if;
    return next;

    test := 'سلوكي · الزائر بيقرا السبوطات المفتوحة (القايمة العامة شغّالة)';
    begin
      select count(*) into n from sbotat_public;
      result := format('نجح — شاف %s سبوطة', n);
    exception when others then
      result := 'فشل — القايمة العامة اتكسرت: ' || sqlerrm;
    end;
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

  /* ===================== ٣ · سلوكي — عضو عادي ========================== */

  if male_id is null or tpl_id is null or ven_id is null then
    test := 'سلوكي · عضو بيفتح خروجة';
    result := format('نجح — اتخطى (عضو=%s قالب=%s مكان=%s)',
                     coalesce(male_id::text,'مفيش'), coalesce(tpl_id::text,'مفيش'),
                     coalesce(ven_id::text,'مفيش'));
    return next;
  else
    -- خروجة على اسم حد تاني، بدور الإدارة، علشان نجرّب نلغيها بعدين
    if other_id is not null then
      insert into sbotat (template_id, venue_id, starts_at, ends_at, price, capacity,
                          status, origin, host_id, host_note_ar)
      values (tpl_id, ven_id, now() + interval '12 days', now() + interval '12 days 2 hours',
              30000, 6, 'open', 'member', other_id, '__test__')
      returning id into other_sb;
    end if;

    begin
      perform set_config(
        'request.jwt.claims',
        json_build_object('sub', male_id::text, 'role', 'authenticated')::text,
        true
      );
      execute 'set local role authenticated';

      test := 'سلوكي · العضو **مش** بيقدر يكتب على sbotat مباشرة';
      ok := false;
      begin
        insert into sbotat (template_id, venue_id, starts_at, ends_at, price, capacity, status, origin)
        values (tpl_id, ven_id, now() + interval '10 days', now() + interval '10 days 2 hours',
                0, 6, 'open', 'nasbot');
        ok := false;
      exception when others then
        ok := true;
      end;
      if ok then result := 'نجح — الباب المباشر مقفول';
      else result := 'فشل — 🔴 العضو كتب سبوطة بسعر صفر وباسم نسبوط'; end if;
      return next;

      test := 'سلوكي · العضو **بيفتح** خروجة فعلًا (متكسرش الميزة)';
      new_id := null;
      begin
        new_id := fn_create_sbota(tpl_id, ven_id, now() + interval '10 days', 6, false, '__test__');
      exception when others then
        result := 'فشل — ' || sqlerrm;
      end;
      if new_id is not null then result := 'نجح';
      elsif result is null then result := 'فشل — رجعت null'; end if;
      return next;

      if new_id is not null then
        test := 'سلوكي · الخروجة اتسجّلت origin=member وصاحبها أنا';
        select count(*) into n from sbotat
         where id = new_id and origin = 'member' and host_id = male_id;
        if n = 1 then result := 'نجح';
        else result := 'فشل — المصدر أو الصاحب غلط'; end if;
        return next;

        test := 'سلوكي · 🔴 السعر من القالب ورسوم الموقع من settings';
        select price, org_fee into v_price, v_fee from sbotat where id = new_id;
        if v_price = (select default_price from sbota_templates where id = tpl_id)
           and v_fee = v_set.site_fee then
          result := format('نجح — السعر %s والرسوم %s', v_price, v_fee);
        else result := format('فشل — 🔴 السعر %s والرسوم %s، العضو أثّر فيهم', v_price, v_fee); end if;
        return next;

        test := 'سلوكي · صاحب الخروجة **ما يشوفش** المجموعة قبل الكشف';
        if fn_is_my_sbota_revealed(new_id) then
          result := 'فشل — 🔴 السرية اتكسرت، شاف المجموعة بدري';
        else result := 'نجح'; end if;
        return next;

        test := 'سلوكي · صاحب الخروجة بيعدّل سطره';
        ok := false;
        begin
          ok := fn_update_own_sbota(new_id, '__test__ هنتقابل عند البوابة');
        exception when others then
          ok := false;
        end;
        if ok then result := 'نجح';
        else result := 'فشل — صاحب الخروجة مش قادر يعدّل سطره'; end if;
        return next;
      end if;

      test := 'سلوكي · العدد برّه الحد بيترفض';
      ok := false;
      begin
        perform fn_create_sbota(tpl_id, ven_id, now() + interval '10 days',
                                v_set.member_sbota_max_capacity + 1, false, '__test__');
      exception when others then
        ok := true;
      end;
      if ok then result := 'نجح';
      else result := 'فشل — 🔴 عضو فتح خروجة بعدد برّه الحد'; end if;
      return next;

      test := 'سلوكي · ميعاد قريب أوي بيترفض';
      ok := false;
      begin
        perform fn_create_sbota(tpl_id, ven_id, now() + interval '1 hour', 6, false, '__test__');
      exception when others then
        ok := true;
      end;
      if ok then result := 'نجح';
      else result := 'فشل — 🔴 خروجة بعد ساعة، محدش هيلحق يحجز'; end if;
      return next;

      test := 'سلوكي · ميعاد بعيد أوي بيترفض';
      ok := false;
      begin
        perform fn_create_sbota(tpl_id, ven_id,
                                now() + make_interval(days => v_set.member_sbota_max_days_ahead + 5),
                                6, false, '__test__');
      exception when others then
        ok := true;
      end;
      if ok then result := 'نجح';
      else result := 'فشل — 🔴 حجز مكان لسنة جاية'; end if;
      return next;

      test := 'سلوكي · 🔴 «بنات بس» من راجل بتترفض';
      ok := false;
      begin
        perform fn_create_sbota(tpl_id, ven_id, now() + interval '11 days', 6, true, '__test__');
      exception when others then
        ok := true;
      end;
      if ok then result := 'نجح';
      else result := 'فشل — 🔴 راجل فتح خروجة بنات، ده خطر شخصي مش باج'; end if;
      return next;

      test := 'سلوكي · حد الخروجات المفتوحة بيقف';
      ok := false;
      begin
        -- بنجرّب نفتح أكتر من الحد بواحدة زيادة
        for n in 1 .. (v_set.member_sbota_max_open + 1) loop
          perform fn_create_sbota(tpl_id, ven_id,
                                  now() + make_interval(days => 13 + n), 6, false, '__test__');
        end loop;
      exception when others then
        ok := true;
      end;
      if ok then result := format('نجح — وقف عند %s', v_set.member_sbota_max_open);
      else result := 'فشل — 🔴 عضو واحد يقدر يغرق القايمة'; end if;
      return next;

      test := 'سلوكي · 🔴 العضو مش بيلغي خروجة حد تاني';
      if other_sb is null then
        result := 'نجح — اتخطى (مفيش عضو تاني)';
      else
        ok := false;
        begin
          perform fn_cancel_own_sbota(other_sb, '__test__');
        exception when others then
          ok := true;
        end;
        if ok then result := 'نجح';
        else result := 'فشل — 🔴 أي عضو بيلغي خروجة أي حد'; end if;
      end if;
      return next;

      test := 'سلوكي · العضو بيلغي خروجته هو';
      if new_id is null then
        result := 'نجح — اتخطى';
      else
        ok := false;
        begin
          ok := fn_cancel_own_sbota(new_id, '__test__');
        exception when others then
          ok := false;
        end;
        if ok then result := 'نجح';
        else result := 'فشل — صاحب الخروجة محبوس فيها'; end if;
      end if;
      return next;

      test := 'سلوكي · fn_my_hosted_sbotat بترجّع خروجاتي أنا بس';
      select count(*) into n from fn_my_hosted_sbotat() f
       where f.id = coalesce(other_sb, '00000000-0000-0000-0000-000000000000'::uuid);
      if n = 0 then result := 'نجح';
      else result := 'فشل — 🔴 شايف خروجات حد تاني'; end if;
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

  /* ===================== ٤ · التنضيف ==================================== */

  delete from sbotat where host_note_ar like '__test__%';
  test := 'تنضيف · سبوطات الاختبار اتمسحت';
  select count(*) into n from sbotat where host_note_ar like '__test__%';
  if n = 0 then result := 'نجح';
  else result := format('فشل — فاضل %s صف اختبار', n); end if;
  return next;
end;
$$;

comment on function test_member_sbotat() is
  'بتتأكد إن خروجات الأعضاء (0078) شغّالة ومقفولة صح: العضو بيفتح، والزائر لأ، والسعر من القالب، والسرية واقفة. select * from test_member_sbotat();';

revoke execute on function test_member_sbotat() from public, anon, authenticated;
