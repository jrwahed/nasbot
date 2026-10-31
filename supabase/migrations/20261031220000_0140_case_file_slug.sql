-- ============================================================================
-- 0140 — الـslug في ملف القضية (علشان الرسمة)
-- ============================================================================
--
-- طلب المالك (٢٠٢٦-١٠-٣١): «حط رسومات وصور كده من القضية».
-- الرسومات SVG مرسومة في `src/components/case/CaseArt.tsx`، وبتتاخد
-- بالـ**slug** — مفتاح ثابت، مش بالعنوان اللي المالك بيغيّره من اللوحة
-- (الدرس العاشر).
--
-- صفحة `/qadeya` عندها الـslug أصلًا من `fn_cases_public`. اللي ناقص هو
-- **شاشة اللعب وملف المعاينة**: `fn_case_file` و`fn_case_preview` بيرجّعوا
-- اسم العالم العربي بس، من غير أي مفتاح — فالرسمة مكانش ليها طريق توصلها.
--
-- 🔴 **ده مش تسريب:** الـslug مجرد اسم تقني للقضية (`aqd-elhanem`)، وهو
--    معروض أصلًا للمجهول في الصفحة العامة. مفيش فيه كارت متهم ولا نهاية
--    ولا تلميح — الحراس زي ما هما بالحرف، والاختبار بيثبت ده.
--
-- ⚠ `create or replace` **ما بتقدرش تغيّر عدد الأعمدة الراجعة** — فلازم
--    `drop` بالتوقيع بالظبط الأول (نفس مصيدة `fn_create_sbota`
--    و`fn_sbota_album`). وده آمن يتكرر لأن `if exists`.
-- ============================================================================

drop function if exists fn_case_file(uuid);

create function fn_case_file(s_id uuid)
returns table (
  file_no           text,
  case_slug         text,
  case_title_ar     text,
  world_slug        text,
  world_name_ar     text,
  theme             text,
  report_ar         text,
  scene_ar          text,
  goal_ar           text,
  intro_ar          text,
  shape             case_shape_t,
  act               case_act_t,
  started           boolean,
  ended             boolean,
  detective_name_ar text,
  suspect_name_ar   text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cs  case_sessions;
begin
  -- الحارس زي ما هو بالحرف: نفس `fn_case_player_ok` المركّبة، مش نسخة
  -- منها (الدرس الستاشر).
  if not fn_case_player_ok(s_id, v_uid) then return; end if;
  select * into v_cs from case_sessions where sbota_id = s_id;
  if not found then return; end if;

  return query
    select upper(substr(replace(v_cs.id::text, '-', ''), 1, 6)),
           c.slug, c.title_ar, w.slug, w.name_ar, w.theme,
           c.report_ar, c.scene_ar, c.goal_ar, c.intro_ar,
           c.shape, v_cs.act, v_cs.built_at is not null, v_cs.ended_at is not null,
           w.detective_name_ar, w.suspect_name_ar
      from cases c
      join case_worlds w on w.slug = c.world_slug
     where c.id = v_cs.case_id;
end
$$;

revoke execute on function fn_case_file(uuid) from public, anon;
grant  execute on function fn_case_file(uuid) to authenticated;

comment on function fn_case_file(uuid) is
  '0140 — دوسيه اللاعب: البلاغ ومسرح الواقعة والمطلوب + الـslug للرسمة. مفيش كارت متهم ولا نهايات.';

-- ---------------------------------------------------------------------------
-- نفس الحاجة لمعاينة اللوحة
-- ---------------------------------------------------------------------------

drop function if exists fn_case_preview(text);

create function fn_case_preview(p_slug text)
returns table (
  case_slug         text,
  case_title_ar     text,
  world_slug        text,
  world_name_ar     text,
  theme             text,
  report_ar         text,
  scene_ar          text,
  goal_ar           text,
  intro_ar          text,
  detective_card_ar text,
  suspect_card_ar   text,
  act2_event_ar     text,
  win_ending_ar     text,
  escape_ending_ar  text,
  twist_ar          text,
  shape             case_shape_t,
  min_players       integer,
  detective_name_ar text,
  suspect_name_ar   text,
  has_act2_event    boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  -- 🔴 دي بتطلّع كارت المتهم والنهايتين — فالحارس صلاحية لوحة، مش عضو.
  --
  -- ⚠ **الحارس بيرجّع فاضي، مش بيرمي** — زي `0137` بالحرف. كتبته أول مرة
  --   `raise exception` من الذاكرة، فـ`test_case_file` (`0137`) وقع صفّين
  --   أحمر على الإنتاج: اختباره بيعدّ الصفوف الراجعة للعضو (`= 0`)،
  --   والاستثناء كان بينط للـhandler بتاعه ويحط «فشل» في كل متغيّراته.
  --   الدرس السادس: التعديل اللي بيغيّر سلوك موجود لازم ينسخ الأصل
  --   بالحرف ويضيف عليه، مش يعيد كتابته.
  if not fn_has_permission('cases.view') then return; end if;

  return query
    select c.slug, c.title_ar, w.slug, w.name_ar, w.theme,
           c.report_ar, c.scene_ar, c.goal_ar, c.intro_ar,
           c.detective_card_ar, c.suspect_card_ar, c.act2_event_ar,
           c.win_ending_ar, c.escape_ending_ar, c.twist_ar,
           c.shape, c.min_players, w.detective_name_ar, w.suspect_name_ar,
           w.has_act2_event
      from cases c
      join case_worlds w on w.slug = c.world_slug
     where c.slug = p_slug;
end
$$;

revoke execute on function fn_case_preview(text) from public, anon;
grant  execute on function fn_case_preview(text) to authenticated;

comment on function fn_case_preview(text) is
  '0140 — معاينة اللوحة: الملف كامل بكارت المتهم والنهايتين. بصلاحية cases.view.';

-- ============================================================================
-- الاختبار
-- ============================================================================

create or replace function test_case_file_slug()
returns table (test text, result text)
language plpgsql
set search_path = public
as $body$
-- ⚠ **مش `security definer` عن قصد** — الدالة بتلبس أدوار، وبوستجرس
--    بيرفض `reset role` جوه definer («cannot set parameter "role" within
--    security-definer function»). نفس نمط `test_cases_public`.
declare
  t_cols text; t_leak text; t_prev text; t_run text; t_anon text;
  v_cols text[]; v_slug text; v_admin uuid;
begin
  -- ---- أعمدة ملف اللاعب
  select array_agg(a.nm::text) into v_cols
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral unnest(p.proargnames) as a(nm)
   where n.nspname = 'public' and p.proname = 'fn_case_file';

  t_cols := case when v_cols @> array['case_slug','world_slug'] then 'نجح'
                 else 'فشل — ناقص case_slug/world_slug' end;

  -- 🔴 وبرضه مفيهوش كارت المتهم ولا النهايات (نفس حارس 0137)
  t_leak := case
    when v_cols && array['suspect_card_ar','win_ending_ar','escape_ending_ar','twist_ar']
    then 'فشل — 🔴 ملف اللاعب بيسرّب الحل'
    else 'نجح' end;

  -- ---- أعمدة المعاينة
  select array_agg(a.nm::text) into v_cols
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    cross join lateral unnest(p.proargnames) as a(nm)
   where n.nspname = 'public' and p.proname = 'fn_case_preview';

  t_prev := case when v_cols @> array['case_slug','world_slug'] then 'نجح'
                 else 'فشل — ناقص case_slug/world_slug' end;

  -- ---- والمعاينة لسه شغّالة فعلًا بصلاحية لوحة (الدرس ٢٤: جرّب المسموح كمان)
  --      ⚠ الهوية تتقرا **قبل** أي تلبيس دور (الدرس ٢٧).
  -- ⚠ الحساب لازم يكون **عنده `cases.view`** فعلًا، مش أي حساب لوحة نشط —
  --    `support` مثلًا ماعندوش الصلاحية، فالاختبار كان هيقول «فشل» على
  --    حارس سليم (الدرس العشرين: اختار صف مضمون، مش أول صف).
  select au.profile_id into v_admin
    from admin_users au
    join role_permissions rp on rp.role_key = au.role_key
   where au.is_active and rp.permission_key = 'cases.view'
   limit 1;

  if v_admin is null then
    t_run := 'معلومة — مفيش حساب لوحة بصلاحية cases.view';
  else
    begin
      set local role authenticated;
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_admin::text, 'role', 'authenticated')::text, true);
      select p.case_slug into v_slug from fn_case_preview('aqd-elhanem') p;
      reset role; perform set_config('request.jwt.claims', '', true);
      t_run := case when v_slug = 'aqd-elhanem' then 'نجح'
                    else 'فشل — رجّعت ' || coalesce(v_slug, 'ولا صف') end;
    exception when others then
      reset role; perform set_config('request.jwt.claims', '', true);
      t_run := 'فشل — استثناء: ' || sqlerrm;
    end;
  end if;

  -- ---- 🔴 والمجهول لسه مرفوض
  -- ⚠ الحارس بيرجّع **فاضي** مش بيرمي، فالفحص على عدد الصفوف — ولو رمى
  --    (منع على مستوى الـgrant) ده برضه رفض، فالاتنين «نجح».
  declare v_rows int;
  begin
    set local role anon;
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    select count(*) into v_rows from fn_case_preview('aqd-elhanem');
    reset role; perform set_config('request.jwt.claims', '', true);
    t_anon := case when v_rows = 0 then 'نجح'
                   else 'فشل — 🔴 المجهول قرا ملف المعاينة' end;
  exception when others then
    reset role; perform set_config('request.jwt.claims', '', true);
    t_anon := 'نجح';
  end;

  return query values
    ('0140 · ملف اللاعب فيه case_slug و world_slug'::text, t_cols),
    ('0140 · 🔴 ملف اللاعب لسه مفيهوش كارت المتهم ولا النهايات'::text, t_leak),
    ('0140 · معاينة اللوحة فيها case_slug و world_slug'::text, t_prev),
    ('0140 · المعاينة لسه بترجّع الملف بصلاحية لوحة'::text, t_run),
    ('0140 · 🔴 المجهول مش بيقرا المعاينة'::text, t_anon);
end;
$body$;

revoke execute on function test_case_file_slug() from public, anon;
grant  execute on function test_case_file_slug() to service_role;

comment on function test_case_file_slug() is
  '0140 — بيتأكد إن الـslug وصل الملف والمعاينة، والحل لسه مش بيتسرّب.';
