-- ==========================================================================
-- WORK_MIGRATION_56.sql — صفحة «قضية الليلة» العامة (/qadeya)
--
-- طلبك: «عاوز يبقى ليها صفحة في القايمة، وتقول عشان تشترك في حل القضية
-- اشترك في سبوطة. بس القضية وتفاصيلها كلها مكتوبة.»
--
-- 🔴 «كل التفاصيل» = **القصة كاملة، مش الحل**: البلاغ ومسرح الواقعة
-- والمطلوب. مفيش كارت متهم ولا نهايات ولا تلميحات — ولو حد زوّدهم،
-- الاختبار بيقع. والقصة آمنة تتنشر لأن المتهم مش مكتوب في القضية:
-- بيتختار وقت اللعب من إجابات المجموعة نفسها.
--
-- ⚠ محتاج WORK_MIGRATION_48 لحد 55 قبله.
--
-- بعده شغّل:
--   select * from test_cases_public();          -- ٥ صفوف «نجح»
-- ==========================================================================

-- ########################################################################
-- # 20261031200000_0138_cases_public.sql
-- ########################################################################

-- ============================================================================
-- 0138 · صفحة «قضية الليلة» العامة — `/qadeya`
--
-- طلب المالك (٢٠٢٦-١٠-٣١): «عاوز يبقى ليها صفحة هنا [في القايمة]، وتقول
-- عشان تشترك في حل القضية اشترك في سبوطة. بس القضية وتفاصيلها كلها مكتوبة.»
--
-- 🔴 **«كل التفاصيل» = القصة كاملة، مش الحل.** الدالة دي بترجّع:
--      ✓ اسم القضية · العالم · البلاغ · مسرح الواقعة · المطلوب · الشكل
--      ✗ كارت المتهم · كارت المحقق · النهايتين · المفاجأة · حدث الفصل
--        التاني · نص أي تلميح · أي مهمة سرية
--
--    ليه القصة آمنة تتنشر؟ لأن المتهم **مش مكتوب في القضية** — بيتختار
--    وقت اللعب من إجابات المجموعة نفسها. فاللي قرا «العقد اختفى» ما
--    عرفش حاجة تنفعه. إنما اللي يقرا كارت المتهم أو النهاية، اللعبة
--    عنده خلصت قبل ما تبدأ.
--
-- ⚠ ودي **الدالة الوحيدة في النظام المفتوحة للمجهول**. كل حاجة تانية
--   ورا `fn_case_player_ok`. فأي عمود يتزوّد هنا = قرار نشر، مش تحسين.
--
-- ⚠ محتاج `0130`–`0137`. آمن يتكرر. مفيهوش `drop` ولا `delete`.
-- ============================================================================

create or replace function fn_cases_public()
returns table (
  case_slug text, case_title_ar text, shape case_shape_t,
  report_ar text, scene_ar text, goal_ar text,
  world_slug text, world_name_ar text, world_mood_ar text, theme text,
  detective_name_ar text, suspect_name_ar text,
  min_players int, world_sort int, case_sort int
)
language sql
stable
security definer
set search_path = public
as $$
  select c.slug, c.title_ar, c.shape,
         c.report_ar, c.scene_ar, c.goal_ar,
         w.slug, w.name_ar, w.mood_ar, w.theme,
         w.detective_name_ar, w.suspect_name_ar,
         c.min_players, w.sort, c.sort
    from cases c
    join case_worlds w on w.slug = c.world_slug
   where c.is_active and w.is_active
     and coalesce((select f.is_on from feature_flags f where f.key = 'cases'), false)
   order by w.sort, c.sort;
$$;

comment on function fn_cases_public() is
  '🔴 القضايا للصفحة العامة — القصة بس. مفيهاش كارت المتهم ولا النهايات ولا التلميحات. الوحيدة المفتوحة للمجهول، وبتحترم مفتاح الميزة.';

revoke execute on function fn_cases_public() from public;
grant  execute on function fn_cases_public() to anon, authenticated;


-- ===== نصوص الصفحة =====
insert into copy_strings (key, value_ar, screen, context_ar) values
  ('qadeya.nav',       'القضية',                      'القضية', 'اسمها في القايمة'),
  ('qadeya.kicker',    'كل سبوطة فيها واحدة 🔍',      'القضية', 'فوق العنوان في الصفحة العامة'),
  ('qadeya.title',     'قضية الليلة',                 'القضية', 'عنوان الصفحة العامة'),
  ('qadeya.lede',      'واحد من المجموعة سرّي هو المتهم، والباقيين فريق لازم يكشفوه. والتلميحات عن المتهم متبنية من إجاباته هو عن نفسه — يعني ما تعرفوش المتهم غير لما تعرفوا بعض كلكم.', 'القضية', 'السطر التحت العنوان'),
  ('qadeya.how.title', 'إزاي تتحل',                   'القضية', 'عنوان حتة الطريقة'),
  ('qadeya.list',      'القضايا',                     'القضية', 'عنوان قايمة القضايا'),
  ('qadeya.list.note', 'القضية بتتحدد مع الخروجة، وما بتتكررش عليك مرتين.', 'القضية', 'تحت عنوان القايمة'),
  ('qadeya.report',    'البلاغ',                      'القضية', 'عنوان الحكاية في الكارت'),
  ('qadeya.scene',     'مسرح الواقعة',                'القضية', 'عنوان المكان في الكارت'),
  ('qadeya.goal',      'المطلوب',                     'القضية', 'عنوان الهدف في الكارت'),
  ('qadeya.players',   'من {{1}} فأكتر',              'القضية', 'أقل عدد للقضية'),
  ('qadeya.spoiler',   'الحل مش مكتوب هنا عن قصد — المتهم بيتختار وقت اللعب من إجاباتكم انتوا، مش من القصة.', 'القضية', 'تحت قايمة القضايا'),
  ('qadeya.cta.title', 'عايز تحل واحدة؟',             'القضية', 'عنوان صندوق الحجز'),
  ('qadeya.cta.body',  'احجز سبوطة. القضية بتيجي معاها — من غير فلوس زيادة ومن غير تحضير.', 'القضية', 'نص صندوق الحجز'),
  ('qadeya.cta.btn',   'شوف السبوطات',                'القضية', 'زرار صندوق الحجز'),
  ('qadeya.steps',     'وبعدين؟',                     'القضية', 'عنوان خطوات المشاركة'),
  ('qadeya.step.1',    'تحجز سبوطة زي أي مرة.',       'القضية', 'خطوة ١'),
  ('qadeya.step.2',    'يوم الكشف بتجاوب اثنتاشر سؤال عن نفسك في دقيقتين.', 'القضية', 'خطوة ٢'),
  ('qadeya.step.3',    'في الخروجة بتدخل بكود، وبتشوف كارتك: محقق ولا متهم.', 'القضية', 'خطوة ٣'),
  ('qadeya.step.4',    'بتلعبوا حوالين النشاط — قبله وفي الاستراحة وبعده.', 'القضية', 'خطوة ٤'),
  ('qadeya.step.5',    'في الآخر بتصوّتوا، والحقيقة بتظهر عند الكل في نفس اللحظة.', 'القضية', 'خطوة ٥'),
  ('qadeya.empty',     'القضايا راجعة قريب.',          'القضية', 'لو مفيش ولا قضية نشطة')
on conflict (key) do nothing;


-- ===== الاختبار =====
create or replace function test_cases_public()
returns table (test text, result text)
language plpgsql
set search_path = public
as $body$
declare
  t_anon text; t_cols text; t_flag text; t_body text; t_keys text;
  v_n int; v_on boolean;
begin
  -- (١) 🔴 الإخراج مفيهوش ولا عمود بيكشف الحل
  select count(*) into v_n from information_schema.parameters
   where specific_name = (select specific_name from information_schema.routines
                           where routine_name = 'fn_cases_public' limit 1)
     and parameter_name in ('suspect_card_ar','detective_card_ar','win_ending_ar',
                            'escape_ending_ar','twist_ar','act2_event_ar','clue_ar');
  t_cols := case when v_n = 0 then 'نجح'
                 else format('فشل — 🔴 %s عمود بيكشف الحل في الصفحة العامة', v_n) end;

  -- (٢) النصوص
  select count(*) into v_n from copy_strings
   where key in ('qadeya.title','qadeya.lede','qadeya.report','qadeya.cta.btn',
                 'qadeya.spoiler','qadeya.step.1','qadeya.nav');
  t_keys := case when v_n = 7 then 'نجح' else format('فشل — %s من 7 نص', v_n) end;

  select is_on into v_on from feature_flags where key = 'cases';

  begin
    -- (٣) المجهول بيقرا القضايا — لازم **ينجح** (الدرس ٢٤)
    update feature_flags set is_on = true where key = 'cases';
    set local role anon;
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    select count(*) into v_n from fn_cases_public();
    t_anon := case when v_n >= 9 then 'نجح'
                   else format('فشل — المجهول شاف %s قضية بدل 9', v_n) end;
    -- والبلاغ والمطلوب موجودين فعلًا (مش أعمدة فاضية)
    select count(*) into v_n from fn_cases_public()
     where btrim(coalesce(report_ar,'')) <> '' and btrim(coalesce(goal_ar,'')) <> '';
    t_body := case when v_n >= 9 then 'نجح'
                   else format('فشل — %s قضية بس فيها بلاغ ومطلوب', v_n) end;
    reset role; perform set_config('request.jwt.claims', '', true);

    -- (٤) 🔴 المفتاح مقفول ← الصفحة فاضية
    update feature_flags set is_on = false where key = 'cases';
    set local role anon;
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    select count(*) into v_n from fn_cases_public();
    t_flag := case when v_n = 0 then 'نجح'
                   else format('فشل — 🔴 %s قضية ظاهرة والمفتاح مقفول', v_n) end;
    reset role; perform set_config('request.jwt.claims', '', true);

    raise exception 'test_cases_public_rollback';
  exception when others then
    reset role; perform set_config('request.jwt.claims', '', true);
    if sqlerrm <> 'test_cases_public_rollback' then
      t_anon := coalesce(t_anon, 'فشل — استثناء: ' || sqlerrm);
      t_body := coalesce(t_body, 'فشل — استثناء: ' || sqlerrm);
      t_flag := coalesce(t_flag, 'فشل — استثناء: ' || sqlerrm);
    end if;
  end;

  return query
    select * from (values
      ('0138 · 🔴 الصفحة العامة مفيهاش ولا عمود بيكشف الحل', t_cols),
      ('0138 · نصوص الصفحة موجودة',                          t_keys),
      ('0138 · المجهول بيقرا القضايا التسعة',                t_anon),
      ('0138 · البلاغ والمطلوب واصلين للصفحة',               t_body),
      ('0138 · 🔴 المفتاح مقفول ← الصفحة فاضية',             t_flag)
    ) as v(a, b);
end $body$;

comment on function test_cases_public() is
  '0138 — الصفحة العامة بتوري القصة بس، وبتحترم مفتاح الميزة، والمجهول بيقراها.';
revoke execute on function test_cases_public() from public, anon, authenticated;
