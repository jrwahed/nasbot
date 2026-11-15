-- ============================================================================
-- 0146 · «يلا» بوست — النداء بقى خانة واحدة
--
-- طلب المالك (٢٠٢٦-١١-١٥): «عاوز في النداء أحط زي بوست، مش لازم أختار من
-- القالب ولا الميعاد. أنا بنزّل بوست أو اقتراح، والناس اللي تحدد معايا».
--
-- الفورم كان بيطلب **٧ حاجات** (قالب · سطر · عدد · حد أدنى · مهلة · مواعيد
-- · مناطق). بقى **حاجة واحدة: السطر**. وكل اللي باقي بيتحسب لوحده:
--
--   · **القالب** → القالب العام `nedaa-yalla` (نفس نمط `khroga-men-3odw`
--     في خروجات الأعضاء، §٥). واسم الخروجة بعد القفل بيتاخد من **سطر
--     البوست** مش من اسم القالب — شوف تعديل `fn_yalla_lock` تحت.
--   · **المواعيد** → بتتولّد: أيام `settings.yalla_days_ahead` الجاية ×
--     تلات فترات (الصبح · العصر · بالليل) من `settings`.
--   · **المناطق** → كل كتل الخريطة النشطة.
--   · **العدد والحد الأدنى والمهلة** → `settings` (موجودين من `0142`).
--
-- ⚠ **ليه غلاف مش تعديل في `fn_yalla_create`؟** `fn_yalla_create` متفحوصة
--   بـ٤٤ صف اختبار، وإضافة parameters بـ`default` بتعمل دالة **تانية**
--   والنداء بيبقى ambiguous (§٨ — مصيدة `fn_create_sbota`). فالغلاف
--   `fn_yalla_post` بيحسب وبينادي الأصل — **الحارس والتحقّق مكانهم ما
--   اتغيّرش** (الدرس الستاشر).
--
-- ⚠ **و`fn_yalla_lock` اتعادت هنا** بتلات تعديلات بس (مش إعادة كتابة —
--   الدرس السادس). **إعادة لزق `0143` بترجّع القديمة**، و`test_yalla_post()`
--   بيقع أحمر — فيه صف صريح على ده.
--
-- 🔴 **اتحدّثت في نفس اليوم — `0147` حلّ محل الاقتراحات.** المالك شاف
--   النافذة وفيها ٢١ ميعاد و١٦ منطقة وقال: «مش عاوز الاقتراحات دي كلها،
--   عاوز الويك اند وهو يكتب الميعاد والأوقات اللي فاضي فيها والمكان».
--   فـ`0147` بيعيد `fn_yalla_post` بـ**ميعاد واحد مخفي (الجمعة الجاية)
--   ومنطقة واحدة مخفية** — سباكة للقفل التلقائي، والعضو ما بيختارش حاجة.
--   السطرين بتاعين «المواعيد» و«المناطق» فوق **بيوصفوا النسخة القديمة**.
--   ⚠ وإعادة لزق الملف ده **بترجّع الاقتراحات الـ٢١**، و`test_yalla_social()`
--   (`0147`) بيقع أحمر — فيه صف صريح على ده. لو حصل، الزق `0147` بعده.
--
-- آمنة تتكرر.
-- ============================================================================

-- ===== 1) الأرقام =====
-- ⚠ §٣.٢ — كل رقم في `settings`. دول بيتعدّلوا من «الإعدادات ← يلا».
alter table settings add column if not exists yalla_days_ahead int not null default 7;
alter table settings add column if not exists yalla_hour_am    int not null default 11;
alter table settings add column if not exists yalla_hour_pm    int not null default 16;
alter table settings add column if not exists yalla_hour_eve   int not null default 20;

comment on column settings.yalla_days_ahead is 'النداء من بوست: كام يوم قدام بيتعرضوا للناس تختار منهم';
comment on column settings.yalla_hour_am  is 'ساعة «الصبح» بتوقيت القاهرة';
comment on column settings.yalla_hour_pm  is 'ساعة «العصر» بتوقيت القاهرة';
comment on column settings.yalla_hour_eve is 'ساعة «بالليل» بتوقيت القاهرة';


-- ===== 2) القالب العام =====
-- ⚠ ليه قالب عام بدل `template_id` nullable؟ نفس سبب `khroga-men-3odw`
--   بالظبط (§٥): العمود `not null` وعليه join في `sbotat_public` وبيتقرا
--   في حراس الحجز. القالب العام خلّى كل ده ما يتلمسش.
-- ⚠ و`kind` بتتاخد من القالب العام الموجود بدل ما نخمّن قيمة enum.
-- ⚠ `story_ar` عمود `not null` — فلازم يتملا حتى لو القالب ده عمره ما
--   هيتعرض للزوار (كلام الخروجة بيجي من سطر البوست).
-- ⚠ **الحقول الخمسة دي مش زيادة.** `test_daleel_seed` (`0089`) بيتأكد إن
--   كل قالب مش شغل له `keywords_ar` و`photo_alt_ar` و`meta_prefix_ar`
--   و`story_ar` — وبيستثني `khroga-men-3odw` و`test-fixture` **بالاسم**.
--   ملينا الحقول بدل ما نعدّل `0089` ونضيف اسم تالت للاستثناء: ملف هجرة
--   قديم اتعدّل = حزمته لازم تتجدّد (الدرس السادس)، والملى أرخص وأأمن.
--   ⚠ اتكشف لما شغّلنا **الفحص الشامل** محليًا مش اختباراتنا بس.
insert into sbota_templates (slug, name_ar, story_ar, mood_ar, meta_prefix_ar,
                             keywords_ar, photo_alt_ar, kind,
                             default_price, org_fee, duration_min,
                             min_group, max_group, is_work)
select 'nedaa-yalla', 'نداء',
       'نداء نزل من «يلا» — الناس هي اللي حددت الميعاد والمنطقة.',
       'إحنا اللي نقرر', 'نداء',
       array['نداء','يلا'], 'ناس متجمّعة بتضحك',
       t.kind, 0, 0, 120, 2, 12, false
  from sbota_templates t where t.slug = 'khroga-men-3odw'
on conflict (slug) do nothing;


-- ===== 3) الغلاف: نزّل بوست =====
create or replace function fn_yalla_post(p_line text)
returns uuid
language plpgsql
security definer
set search_path = public
as $body$
declare
  s          settings;
  v_template uuid;
  v_slots    timestamptz[] := '{}';
  v_areas    text[];
  v_day      date;
  v_base     timestamptz;
  i          int;
  h          int;
begin
  -- الحارس **نفسه** اللي في `fn_yalla_create` — مكتوب هنا كمان علشان
  -- الرفض يحصل قبل أي حساب، والأصل بيتأكد تاني (حارسين على نفس الباب).
  if fn_caller_is_browser() and not fn_has_permission('sbotat.edit') then
    raise exception 'محتاج صلاحية sbotat.edit' using errcode = '42501';
  end if;
  if coalesce(btrim(p_line), '') = '' then
    raise exception 'اكتب سطر النداء' using errcode = '22023';
  end if;

  select * into s from settings limit 1;

  select id into v_template from sbota_templates where slug = 'nedaa-yalla';
  if v_template is null then
    raise exception 'القالب العام nedaa-yalla مش موجود — الزق 0146' using errcode = '22023';
  end if;

  -- ===== المواعيد =====
  -- ⚠ بنبدأ من **بكرة** مش النهاردة: مهلة القفل وحدها ساعات، فنداء
  --   ميعاده النهاردة مالوش معنى. و`fn_yalla_create` بترمي أي ميعاد عدّى.
  for i in 1 .. greatest(coalesce(s.yalla_days_ahead, 7), 1) loop
    v_day := (now() at time zone 'Africa/Cairo')::date + i;
    foreach h in array array[coalesce(s.yalla_hour_am, 11),
                             coalesce(s.yalla_hour_pm, 16),
                             coalesce(s.yalla_hour_eve, 20)] loop
      v_base := ((v_day::text || ' ' || lpad(h::text, 2, '0') || ':00:00')
                 ::timestamp at time zone 'Africa/Cairo');
      v_slots := v_slots || v_base;
    end loop;
  end loop;

  -- ===== المناطق =====
  -- كل كتلة نشطة في الخريطة — المالك بيعدّلها من «الخريطة» في اللوحة.
  select array_agg(key order by sort) into v_areas
    from map_areas where is_active;
  if v_areas is null or array_length(v_areas, 1) is null then
    raise exception 'مفيش ولا كتلة خريطة نشطة' using errcode = '22023';
  end if;

  -- ===== والباقي من الإعدادات =====
  return fn_yalla_create(
    p_template   => v_template,
    p_line       => p_line,
    p_group_size => coalesce(s.yalla_group_size, 6),
    p_min_group  => coalesce(s.yalla_min_group, 4),
    p_deadline   => now() + make_interval(hours => greatest(coalesce(s.yalla_lock_hours, 48), 1)),
    p_slots      => v_slots,
    p_areas      => v_areas);
end $body$;

comment on function fn_yalla_post(text) is
  '0146 — نزّل نداء «يلا» بسطر واحد: القالب العام والمواعيد والمناطق والأرقام كلها بتتحسب لوحدها.';
revoke execute on function fn_yalla_post(text) from public, anon;
grant execute on function fn_yalla_post(text) to authenticated;


-- ===== 4) القفل: اسم الخروجة من سطر البوست =====
-- ⚠ **منسوخة من `0143` بالحرف** وفيها **تلات تعديلات بس**، كل واحد مكتوب
--   جنبه. الدرس السادس: التعديل اللي بيلمس دالة موجودة ينسخ الأصل ويضيف
--   عليه، مش يعيد كتابته.
-- 🔴 **إعادة لزق `0143` بترجّع النسخة القديمة** — و`test_yalla_post()`
--   بيقع أحمر (فيه صف صريح على ده).

create or replace function fn_yalla_lock(p_call uuid, p_reason text default 'manual')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c        yalla_calls;
  top      record;
  v_sbota  uuid;
  v_slot   yalla_slots;
  v_area   text;
  v_what   text;
  v_link   text;
  v_slug   text;
  v_seated int := 0;
  v_wait   int := 0;
  v_switch int := 0;
  r        record;
begin
  select * into c from yalla_calls where id = p_call for update;
  if not found then raise exception 'النداء مش موجود' using errcode = '22023'; end if;
  if c.status <> 'open' then
    return jsonb_build_object('ok', false, 'why', 'النداء مقفول خلاص');
  end if;

  select * into top from fn_yalla_top(p_call) limit 1;

  -- ===== مفيش حد، أو تحت الحد الأدنى والمهلة خلصت =====
  if top is null or (p_reason <> 'full' and top.n < c.min_group) then
    update yalla_calls
       set status = 'closed', lock_reason = 'few', locked_at = now(), updated_at = now()
     where id = p_call;

    select coalesce(nullif(btrim(t.name_ar), ''), 'الخروجة'), t.slug
      into v_what, v_slug
      from sbota_templates t where t.id = c.template_id;
    v_link := v_slug || '-' || left(replace(p_call::text, '-', ''), 8);

    -- 🔴 كل اللي شاركوا يعرفوا، **ومعاهم أولوية**. مفيش صياغة رفض.
    for r in select distinct profile_id from yalla_choices where call_id = p_call loop
      perform fn_yalla_wait(r.profile_id, null, p_call);
      perform fn_yalla_tell(r.profile_id, 'yalla_closed', p_call, null,
                            now(), null, v_what, v_link);
    end loop;

    begin
      perform fn_admin_alert('yalla_closed',
        '🫧 نداء «' || v_what || '» اتقفل من غير مجموعة — أعلى اختيار ' ||
        coalesce(top.n, 0) || ' والحد الأدنى ' || c.min_group,
        '/admin/yalla');
    exception when others then null;
    end;

    insert into audit_log (actor_id, action, entity, entity_id, after)
    values (auth.uid(), 'yalla_close', 'yalla_calls', p_call,
            jsonb_build_object('top', coalesce(top.n, 0), 'min', c.min_group));

    return jsonb_build_object('ok', true, 'locked', false, 'reason', 'few',
                              'top', coalesce(top.n, 0));
  end if;

  -- ===== الكسبان =====
  select * into v_slot from yalla_slots where id = top.slot_id;
  v_area := fn_yalla_area_label(top.area_key);
  -- ⚠ **تعديل `0146`:** النداء اللي اتنزل كبوست (من `fn_yalla_post`) مالوش
  --   نشاط مختار — قالبه هو القالب العام `nedaa-yalla`. فاسم الخروجة في
  --   الرسايل وفي صفحة الحجز بيتاخد من **سطر البوست نفسه**، مش من اسم
  --   القالب العام (اللي كان هيقول «نداء» لكل نداء).
  select case when t.slug = 'nedaa-yalla'
              then coalesce(nullif(btrim(c.line_ar), ''), 'الخروجة')
              else coalesce(nullif(btrim(t.name_ar), ''), 'الخروجة') end,
         t.slug
    into v_what, v_slug
    from sbota_templates t where t.id = c.template_id;
  v_link := v_slug || '-' || left(replace(p_call::text, '-', ''), 8);

  -- السبوطة. `price = 0` — مفيش دفع في «يلا» خالص.
  -- ⚠ `area` **null** و`area_label_ar` هو الاسم: `blockKeyFor` خطوته الأولى
  --   المطابقة بكود الـenum، و`other` محجوزة لكتلة الفيوم (الدرس حداشر).
  -- ⚠ `title_ar` (`0146`) — نفس السبب: `sbotat_public` بتعمل
  --   `coalesce(title_ar, name_ar)`، فمن غيره كل نداء من بوست كان هيظهر
  --   في «حجزي» وفي الإيميلات باسم القالب العام.
  insert into sbotat (template_id, venue_id, starts_at, ends_at, price, org_fee,
                      capacity, status, girls_only, is_day, is_mystery,
                      origin, area, area_label_ar, yalla_id, title_ar)
  values (c.template_id, null, v_slot.starts_at,
          v_slot.starts_at + make_interval(mins => v_slot.duration_min),
          0, 0, c.group_size, 'open', false,
          extract(hour from v_slot.starts_at at time zone 'Africa/Cairo') between 5 and 16,
          false, 'nasbot', null, v_area, p_call,
          case when v_slug = 'nedaa-yalla' then btrim(c.line_ar) end)
  returning id into v_sbota;

  update yalla_calls
     set status = 'locked', won_slot_id = top.slot_id, won_area = top.area_key,
         locked_at = now(), lock_reason = p_reason, updated_at = now()
   where id = p_call;

  -- ===== القعدة: الأولوية الأول، وبعدها اللي اختار الأول =====
  for r in
    select c2.profile_id,
           exists (select 1 from yalla_priority yp
                    where yp.profile_id = c2.profile_id and yp.used_at is null) as vip
      from yalla_choices c2
      join yalla_choice_slots cs
        on cs.call_id = c2.call_id and cs.profile_id = c2.profile_id
     where c2.call_id = p_call
       and cs.slot_id = top.slot_id
       and c2.area_key = top.area_key
     order by vip desc, c2.created_at, c2.profile_id
  loop
    if fn_yalla_seat(r.profile_id, v_sbota) is not null then
      v_seated := v_seated + 1;
      update yalla_priority set used_at = now()
       where profile_id = r.profile_id and used_at is null;
      perform fn_yalla_tell(r.profile_id, 'yalla_won', p_call, v_sbota,
                            v_slot.starts_at, v_area, v_what, v_link);
    else
      -- 🔴 مفيش مكان (العدد · نصيب النوع · أي سبب) → انتظار وأولوية، مش رفض
      v_wait := v_wait + 1;
      perform fn_yalla_wait(r.profile_id, v_sbota, p_call);
      perform fn_yalla_tell(r.profile_id, 'yalla_waiting', p_call, v_sbota,
                            v_slot.starts_at, v_area, v_what, v_link);
    end if;
  end loop;

  -- ===== اللي اختار حاجة تانية: «تيجي معاهم؟» بدوسة واحدة =====
  for r in
    select c2.profile_id from yalla_choices c2
     where c2.call_id = p_call
       and not exists (
         select 1 from yalla_choice_slots cs
          where cs.call_id = c2.call_id and cs.profile_id = c2.profile_id
            and cs.slot_id = top.slot_id and c2.area_key = top.area_key)
  loop
    v_switch := v_switch + 1;
    perform fn_yalla_tell(r.profile_id, 'yalla_switch', p_call, v_sbota,
                          v_slot.starts_at, v_area, v_what, v_link);
  end loop;

  begin
    perform fn_admin_alert('yalla_locked',
      '🎯 «' || v_what || '» اتلمّت — ' || v_area || chr(10)
      || 'قعدوا: ' || v_seated || ' · انتظار: ' || v_wait || ' · «تيجي معاهم؟»: ' || v_switch || chr(10)
      || 'فاضل: تكتب المكان بالظبط وتدوس «اكشف»',
      '/admin/yalla');
  exception when others then null;
  end;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'yalla_lock', 'yalla_calls', p_call,
          jsonb_build_object('sbota', v_sbota, 'reason', p_reason, 'n', top.n,
                             'seated', v_seated, 'wait', v_wait, 'switch', v_switch));

  return jsonb_build_object('ok', true, 'locked', true, 'sbota', v_sbota,
                            'seated', v_seated, 'wait', v_wait, 'switch', v_switch);
end;
$$;

comment on function fn_yalla_lock(uuid, text) is
  'بتقفل نداء «يلا» على الاختيار الكسبان، وتعمل السبوطة، وتقعّد الناس — والزيادة انتظار بأولوية. عمرها ما ترمي استثناء على عضو. (0143 · اسم الخروجة من سطر البوست في 0146)';
revoke execute on function fn_yalla_lock(uuid, text) from public, anon, authenticated;


-- ===== 5) الاختبار =====
create or replace function test_yalla_post()
returns table (test text, result text)
language plpgsql
set search_path = public
as $body$
declare
  v_admin uuid;
  v_call  uuid;
  n       int;
  n_areas int;
  v_title text;
  v_err   text;
begin
  select profile_id into v_admin from admin_users where is_active limit 1;

  test := '0146 · الأرقام الأربعة في الإعدادات';
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'settings'
     and column_name in ('yalla_days_ahead','yalla_hour_am','yalla_hour_pm','yalla_hour_eve');
  result := case when n = 4 then 'نجح' else format('فشل — %s من ٤ بس', n) end;
  return next;

  test := '0146 · القالب العام nedaa-yalla موجود';
  select count(*) into n from sbota_templates where slug = 'nedaa-yalla';
  result := case when n = 1 then 'نجح' else 'فشل — القالب العام مش موجود' end;
  return next;

  -- 🔴 الصف اللي بيمسك إعادة لزق `0143`: من غير التعديل، الدالة مش بتعرف
  --    `nedaa-yalla` خالص.
  test := '0146 · 🔴 fn_yalla_lock بتاخد الاسم من سطر البوست';
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'fn_yalla_lock'
     and p.prosrc like '%nedaa-yalla%' and p.prosrc like '%title_ar%';
  result := case when n = 1 then 'نجح'
                 else 'فشل — 🔴 النسخة القديمة من 0143 رجعت، فكل نداء هيظهر باسم «نداء»' end;
  return next;

  if v_admin is null then
    test := '0146 · باقي الفحص';
    result := 'معلومة — مفيش حساب لوحة، فمش هنقدر ننزّل نداء';
    return next;
    return;
  end if;

  -- ⚠ كل الكتابة جوه بلوك بيرجع (الدرس الستة وعشرين).
  begin
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);

    v_call := fn_yalla_post('[اختبار] يلا نعمل حاجة. إمتى وفين؟');

    reset role;
    perform set_config('request.jwt.claims', '', true);

    test := '0146 · النداء اتعمل بسطر واحد بس';
    result := case when v_call is not null then 'نجح' else 'فشل — ما اتعملش' end;
    return next;

    -- ⚠ **العدد نفسه بقى شغل `0147`.** لحد ٢٠٢٦-١١-١٥ الصفّين دول كانوا
    --   بيفحصوا `n = الأيام × ٣` و`n = كل كتل الخريطة` — يعني ٢١ ميعاد و١٦
    --   منطقة. وبعدها المالك قال: «مش عاوز الاقتراحات دي كلها، عاوز الويك
    --   اند وهو يكتب الميعاد والمكان»، فـ`0147` خلّى النداء **ميعاد واحد
    --   مخفي ومنطقة واحدة مخفية** (سباكة للقفل التلقائي، مش اختيار).
    --
    --   فالصفّين اتحوّلوا للـ**ثابت اللي لسه صح في النسختين**: النداء لازم
    --   يبقى ليه ميعاد ومنطقة، والمنطقة لازم تبقى كتلة نشطة. والعدد المظبوط
    --   بيتفحص في `test_yalla_social()` (`0147`) — مصدر واحد، والدرس التالت:
    --   الهجرة القديمة اتعدّلت علشان ما تتعاركش مع الجديدة بدل ما نكتب فوقها.
    test := '0146 · النداء ليه ميعاد (العدد في 0147)';
    select count(*) into n from yalla_slots where call_id = v_call;
    result := case when n >= 1 then format('نجح (%s ميعاد)', n)
                   else 'فشل — نداء من غير ولا ميعاد، القفل التلقائي مش هيلاقي حاجة' end;
    return next;

    test := '0146 · النداء ليه منطقة، وكلها كتل نشطة';
    select count(*) into n from yalla_call_areas where call_id = v_call;
    select count(*) into n_areas
      from yalla_call_areas a
     where a.call_id = v_call
       and not exists (select 1 from map_areas m
                        where m.key = a.area_key and m.is_active);
    result := case when n >= 1 and n_areas = 0 then format('نجح (%s منطقة)', n)
                   when n = 0 then 'فشل — نداء من غير ولا منطقة'
                   else format('فشل — %s منطقة مش كتلة نشطة', n_areas) end;
    return next;

    test := '0146 · 🔴 مفيش ميعاد في الماضي';
    select count(*) into n from yalla_slots
     where call_id = v_call and starts_at <= now();
    result := case when n = 0 then 'نجح'
                   else format('فشل — 🔴 %s ميعاد عدّى بيتعرض للناس', n) end;
    return next;

    test := '0146 · القالب العام هو اللي اتربط';
    select count(*) into n from yalla_calls c join sbota_templates t on t.id = c.template_id
     where c.id = v_call and t.slug = 'nedaa-yalla';
    result := case when n = 1 then 'نجح' else 'فشل — اتربط بقالب تاني' end;
    return next;

    test := '0146 · العدد والمهلة من الإعدادات';
    select count(*) into n from yalla_calls c, settings s
     where c.id = v_call and c.group_size = coalesce(s.yalla_group_size, 6)
       and c.min_group = coalesce(s.yalla_min_group, 4) and c.deadline > now();
    result := case when n = 1 then 'نجح' else 'فشل — الأرقام مش من الإعدادات' end;
    return next;

    -- 🔴 الدرس الأربعة وعشرين: صف للممنوع وصف للمسموح.
    test := '0146 · 🔴 عضو عادي مش بينزّل نداء';
    begin
      set local role authenticated;
      perform set_config('request.jwt.claims',
        json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
      perform fn_yalla_post('[اختبار] نداء من عضو');
      reset role;
      result := 'فشل — 🔴 أي عضو يقدر ينزّل نداء';
    exception when others then
      reset role;
      result := 'نجح';
    end;
    perform set_config('request.jwt.claims', '', true);
    return next;

    test := '0146 · السطر الفاضي بيترفض';
    begin
      perform fn_yalla_post('   ');
      result := 'فشل — قبل سطر فاضي';
    exception when others then
      result := 'نجح';
    end;
    return next;

    raise exception 'نضيف';
  exception when others then
    reset role;
    perform set_config('request.jwt.claims', '', true);
    if sqlerrm <> 'نضيف' then
      test := '0146 · استثناء غير متوقّع';
      result := 'فشل — ' || sqlerrm;
      return next;
    end if;
  end;

  test := '0146 · الاختبار ما سابش ولا صف';
  select count(*) into n from yalla_calls where line_ar like '[اختبار]%';
  result := case when n = 0 then 'نجح'
                 else format('فشل — %s نداء اختبار اتحفظ', n) end;
  return next;
end $body$;

comment on function test_yalla_post() is
  '0146 — النداء بسطر واحد: المواعيد والمناطق والأرقام بتتحسب لوحدها، والحارس شغّال، ومفيش صفوف سايبة.';
revoke execute on function test_yalla_post() from public, anon, authenticated;
