-- ============================================================================
-- 0149 · 🔴 «قالوا جايين» في اللوحة كانت بتعرض ناس من نداءات تانية
--
-- اتكشف (٢٠٢٦-١١-١٦) لما المالك طلب يشوف **أسامي** اللي قالوا جايين بدل
-- الرقم. قبل ما أعرضهم رحت أقرا البيانات الحقيقية، فلقيت:
--
--   · إجمالي الاختيارات على كل النداءات المفتوحة = **٢ صف لشخص واحد**
--     (كريم اختار نداءين مختلفين، واحد في كل واحد).
--   · و`fn_yalla_admin` بترجّع **الاتنين على كل نداء من الخمسة**.
--
-- السبب في `fn_yalla_admin` (`0143`): الـparameter `p_call` بيتستعمل في
-- سطر واحد بس — `select id into v_sbota from sbotat where yalla_id = p_call`
-- — و**الاستعلام الأساسي مفيهوش `where c.call_id = p_call` خالص**:
--
--     from yalla_choices c
--     join profiles p on p.id = c.profile_id
--     left join bookings b on …
--
-- يعني بتلف على **الجدول كله**.
--
-- 🔴 **ليه ده خطر مش بس وحش:** اللوحة بتقرا منها «قالوا جايين: N»، والمالك
--    بيقرر من الرقم ده إمتى يقفل. فكان بيشوف ٢ على نداء مفيهوش ولا واحد.
--    ومع الوقت كان هيسوء: كل اللي اختاروا أي نداء قديم بيبانوا على كل نداء
--    جديد للأبد.
--
-- ⚠ **ليه ما اتمسكش قبل كده؟** `test_yalla` (٤٤ صف) بيفحص **نداء واحد**
--    في القاعدة وقت التشغيل — والبذرة بتعمل نداء واحد، فالفلتر الناقص
--    ما بيغيّرش النتيجة. الفاحص اللي بيشتغل على صف واحد عمره ما هيمسك
--    فلتر ناقص. الصف الجديد تحت بيعمل **نداءين** عن قصد.
--
-- ⚠ **منسوخة من الأصل بالحرف** (الدرس السادس) — الفرق **سطر واحد**:
--    `where c.call_id = p_call`. والحارس والترتيب وكل عمود زي ما هم.
--
-- 🔴 **وإعادة لزق `0143`/`WORK_MIGRATION_61` بترجّع الباج** — و
--    `test_yalla_admin_call()` بيقع أحمر. فيه صف صريح على ده.
--
-- آمنة تتكرر.
-- ============================================================================

create or replace function fn_yalla_admin(p_call uuid)
returns table (
  profile_id  uuid,
  first_name  text,
  -- ⚠ `gender_t` مش `text` — `create or replace` ما بتقدرش تغيّر نوع عمود
  --   راجع، وكتابته `text` بتطلّع «cannot change return type». اتقرا من
  --   `pg_get_function_result` مش من الذاكرة (الدرس السادس).
  gender      gender_t,
  state       text,
  booking_id  uuid,
  waitlist_id uuid,
  area_label  text,
  slot_count  int,
  venue_note  text,
  chose_at    timestamptz
)
language plpgsql
security definer
set search_path = public
as $body$
declare v_sbota uuid;
begin
  if not fn_has_permission('sbotat.view') then
    raise exception 'محتاج صلاحية sbotat.view' using errcode = '42501';
  end if;
  select id into v_sbota from sbotat where yalla_id = p_call;

  return query
  select p.id, p.first_name, p.gender,
         case when b.id is not null then 'in'
              when w.id is not null then 'wait'
              else 'other' end,
         b.id, w.id,
         fn_yalla_area_label(c.area_key),
         (select count(*)::int from yalla_choice_slots cs
           where cs.call_id = c.call_id and cs.profile_id = c.profile_id),
         c.venue_note, c.created_at
    from yalla_choices c
    join profiles p on p.id = c.profile_id
    left join bookings b on b.sbota_id = v_sbota and b.profile_id = c.profile_id
                        and b.status in ('paid', 'attended')
    left join waitlist w on w.sbota_id = v_sbota and w.profile_id = c.profile_id
   -- 🔴 السطر ده هو كل التصليح. من غيره الدالة بترجّع الجدول كله.
   where c.call_id = p_call
   order by case when b.id is not null then 0 when w.id is not null then 1 else 2 end,
            w.position nulls last, c.created_at;
end;
$body$;

comment on function fn_yalla_admin(uuid) is
  'تفاصيل اللي اختاروا نداء «يلا» للوحة بصلاحية sbotat.view — **للنداء ده بس** (الفلتر اتنسي في 0143 واتصلّح في 0149).';
revoke execute on function fn_yalla_admin(uuid) from public, anon;
grant execute on function fn_yalla_admin(uuid) to authenticated;


-- ===== الاختبار =====
create or replace function test_yalla_admin_call()
returns table (test text, result text)
language plpgsql
set search_path = public
as $body$
declare
  v_admin uuid;
  v_mem   uuid;
  v_tpl   uuid;
  v_a     uuid;
  v_b     uuid;
  n_a     int;
  n_b     int;
begin
  select profile_id into v_admin from admin_users where is_active limit 1;
  select id into v_mem from profiles
   where deleted_at is null
     and not exists (select 1 from admin_users a where a.profile_id = profiles.id)
   order by created_at limit 1;
  select id into v_tpl from sbota_templates where slug = 'nedaa-yalla';

  test := '0149 · 🔴 الفلتر موجود في الدالة';
  if exists (select 1 from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
              where ns.nspname = 'public' and p.proname = 'fn_yalla_admin'
                and p.prosrc like '%c.call_id = p_call%') then
    result := 'نجح';
  else
    result := 'فشل — 🔴 النسخة القديمة رجعت: اللوحة هتعرض ناس من نداءات تانية';
  end if;
  return next;

  if v_admin is null or v_mem is null or v_tpl is null then
    test := '0149 · باقي الفحص';
    result := 'معلومة — محتاج حساب لوحة وعضو والقالب العام';
    return next;
    return;
  end if;

  -- ⚠ كل الكتابة جوه بلوك بيرجع (الدرس الستة وعشرين).
  begin
    update feature_flags set is_on = true where key = 'yalla';

    -- 🔴 **نداءين** عن قصد — ده اللي الاختبار القديم ما كانش بيعمله،
    --    وعلشان كده الفلتر الناقص عدّى منه ٤٤ صف.
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    v_a := fn_yalla_post('[اختبار] نداء أ');
    v_b := fn_yalla_post('[اختبار] نداء ب');
    reset role;
    perform set_config('request.jwt.claims', '', true);

    -- العضو بيختار **نداء أ بس**
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_mem, 'role', 'authenticated')::text, true);
    perform fn_yalla_im_in(v_a);
    reset role;
    perform set_config('request.jwt.claims', '', true);

    -- والقراية بهوية اللوحة (الدرس السبعة وعشرين: القراية بعد reset role)
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    select count(*) into n_a from fn_yalla_admin(v_a);
    select count(*) into n_b from fn_yalla_admin(v_b);
    reset role;
    perform set_config('request.jwt.claims', '', true);

    test := '0149 · اللي اختار نداء أ بيبان في أ';
    result := case when n_a = 1 then 'نجح'
                   else format('فشل — نداء أ رجّع %s والمتوقّع ١', n_a) end;
    return next;

    test := '0149 · 🔴 وما بيبانش في نداء ب';
    result := case when n_b = 0 then 'نجح'
                   else format('فشل — 🔴 نداء ب رجّع %s وهو مفيهوش حد', n_b) end;
    return next;

    raise exception 'نضيف';
  exception when others then
    reset role;
    perform set_config('request.jwt.claims', '', true);
    if sqlerrm <> 'نضيف' then
      test := '0149 · استثناء غير متوقّع';
      result := 'فشل — ' || sqlerrm;
      return next;
    end if;
  end;

  test := '0149 · الاختبار ما سابش ولا صف';
  select count(*) into n_a from yalla_calls where line_ar like '[اختبار]%';
  result := case when n_a = 0 then 'نجح' else format('فشل — %s نداء اتحفظ', n_a) end;
  return next;
end $body$;

comment on function test_yalla_admin_call() is
  '0149 — fn_yalla_admin بترجّع اللي اختاروا النداء ده بس، مش كل الجدول. بيعمل نداءين عن قصد.';
revoke execute on function test_yalla_admin_call() from public, anon, authenticated;
