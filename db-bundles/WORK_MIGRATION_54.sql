-- ==========================================================================
-- WORK_MIGRATION_54.sql — «قضية الليلة» — قايمة اللاعبين للتصويت + نصوص الشاشات
--
-- شاشة التصويت محتاجة أسامي المجموعة، وما ينفعش الواجهة تقرا جدول اللاعبين
-- (مفيهوش سياسة قراية — WORK_MIGRATION_50). فدالة واحدة بنفس الحارس، والأسامي
-- بتوصل **بعد توزيع الأدوار بس**، والاسم الأول وبس، ومفيش الدور فيها خالص.
--
-- ومعاها ٨٨ نص لكل شاشات اللعبة في `copy_strings`.
--
-- ⚠ محتاج WORK_MIGRATION_48 لحد 53 قبله.
--
-- بعده شغّل (لزقة واحدة):
--   do $$ begin perform fn_test_seed_up(); end $$;
--   create temp table _r as select * from test_case_copy();
--   do $$ begin perform fn_case_fixture_down(); perform fn_test_seed_down(); end $$;
--   select * from _r;                       -- ٥ صفوف «نجح»
-- ==========================================================================

-- ########################################################################
-- # 20261031180000_0136_cases_copy.sql
-- ########################################################################

-- ============================================================================
-- 0136 · «قضية الليلة» — قايمة اللاعبين للتصويت + كل نصوص الشاشات
--
-- شاشة التصويت محتاجة **أسامي المجموعة**، و`fn_case_state` مش بتطلّعها.
-- وما ينفعش الواجهة تقرا `case_players` (مفيهاش سياسة قراية — `0132`).
-- فدالة واحدة بنفس الحارس بالظبط.
--
-- ⚠ الأسامي بتوصل **بعد ما الأدوار تتوزّع بس** (`built_at`)، والاسم الأول
--   وبس (قرار المالك ٢٠٢٦-٠٩-٢١). والدور **مش** في الإخراج — عمره.
--
-- وكل نص في الشاشات في `copy_strings` (§٣.١) — مفيش نص عربي في المكوّنات.
--
-- ⚠ محتاج `0130`–`0135`. آمن يتكرر. مفيهوش `drop` ولا `delete`.
-- ============================================================================

create or replace function fn_case_players_list(s_id uuid)
returns table (profile_id uuid, name text, codename_ar text, arrive_order int, is_me boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cs  case_sessions;
begin
  if not fn_case_player_ok(s_id, v_uid) then return; end if;
  select * into v_cs from case_sessions where sbota_id = s_id;
  if not found or v_cs.built_at is null then return; end if;

  return query
    select pl.profile_id, pr.first_name, pl.codename_ar, pl.arrive_order,
           pl.profile_id = v_uid
      from case_players pl
      join profiles pr on pr.id = pl.profile_id
     where pl.session_id = v_cs.id and pl.role <> 'watcher'
     order by pl.arrive_order nulls last, pr.first_name;
end $$;
comment on function fn_case_players_list(uuid) is
  'أسامي اللاعبين لشاشة التصويت — بعد توزيع الأدوار بس، والاسم الأول وبس. ⚠ الدور مش في الإخراج.';
revoke execute on function fn_case_players_list(uuid) from public, anon;
grant  execute on function fn_case_players_list(uuid) to authenticated;


-- ===== النصوص =====
insert into copy_strings (key, value_ar, screen, context_ar) values
  -- مدخل «جاوب قبل بكرة» في صفحة الحجز
  ('case.pre.kicker',    'بكرة فيه قضية 🔍',            'القضية', 'ستيكر فوق كرت الأسئلة في صفحة الحجز'),
  ('case.pre.title',     'جاوب قبل بكرة',               'القضية', 'عنوان كرت الأسئلة'),
  ('case.pre.body',      'اثنتاشر سؤال في دقيقتين. مفيش إجابة غلط — الموقع بيبني منها القضية.', 'القضية', 'نص الكرت'),
  ('case.pre.cta',       'جاوب',                        'القضية', 'زرار الكرت'),
  ('case.pre.done',      'جاوبت ✓',                     'القضية', 'الكرت بعد ما يخلّص'),
  ('case.pre.count',     '{{1}} من {{2}} جاوبوا',       'القضية', 'عداد اللي خلّصوا'),
  ('case.pre.change',    'تقدر تغيّر إجاباتك لحد ما القضية تبدأ.', 'القضية', 'تحت الأسئلة'),
  ('case.pre.lie',       'قول الصدق. اللي هيكدب بكرة هو واحد بس — والموقع هو اللي بيختاره.', 'القضية', 'تحت الأسئلة'),

  -- الدخول
  ('case.join.title',    'القضية',                      'القضية', 'عنوان شاشة الدخول'),
  ('case.join.body',     'صاحب الخروجة هيقول الكود. اكتبه هنا.', 'القضية', 'نص شاشة الدخول'),
  ('case.join.code',     'كود الدخول',                  'القضية', 'خانة الكود'),
  ('case.join.cta',      'يلا',                         'القضية', 'زرار الدخول'),
  ('case.join.wrong',    'الكود غلط. اسأل تاني.',       'القضية', 'لما الكود يكون غلط'),
  ('case.join.waiting',  'مستنيين الباقي… {{1}} من {{2}}', 'القضية', 'بعد الدخول'),
  ('case.join.watch',    'هتفرّج',                       'القضية', 'زرار اللي مش عايز يلعب'),
  ('case.join.watching', 'إنت متفرّج. اقعد معانا عادي.', 'القضية', 'بعد ما يدوس هتفرّج'),
  ('case.join.in',       'دخلت ✓',                      'القضية', 'بعد الدخول بالكود'),

  -- اللبس
  ('case.outfit.title',  'سؤال سريع',                   'القضية', 'عنوان سؤال اللبس'),
  ('case.outfit.body',   'ده بيتسأل مرة واحدة، والكل شايف الإجابة — فماينفعش حد يكدب فيها.', 'القضية', 'نص سؤال اللبس'),

  -- الكارت
  ('case.card.tap',      'المس الكارت',                 'القضية', 'الكارت وهو مقفول'),
  ('case.card.hint',     'بص فيه ثواني، وارفع راسك. ممنوع توري شاشتك لحد.', 'القضية', 'تحت الكارت'),
  ('case.card.closing',  'بيتقفل بعد {{1}}…',           'القضية', 'العداد على الكارت'),
  ('case.card.again',    'شوف كارتك تاني',              'القضية', 'زرار فتح الكارت'),
  ('case.card.codename', 'اسمك الحركي: {{1}}',          'القضية', 'الاسم الحركي على الكارت'),
  ('case.card.mission',  'مهمتك السرية',                'القضية', 'عنوان المهمة على كارت المتهم'),
  ('case.card.partner',  'فيه واحد تاني زيك: {{1}}',    'القضية', 'في «العميلين» — شريك المتهم'),
  ('case.card.done',     'خلّصت مهمتي',                 'القضية', 'زرار المهمة'),
  ('case.card.lie',      'كدبت في دي',                  'القضية', 'المتهم بيعلّم إجابة كدب فيها'),

  -- الفصول والتلميحات
  ('case.act.1',         'الفصل الأول',                 'القضية', 'اسم الفصل'),
  ('case.act.2',         'الفصل التاني',                'القضية', 'اسم الفصل'),
  ('case.act.3',         'الاتهام',                     'القضية', 'اسم الفصل الأخير'),
  ('case.act.break',     'الموبايلات في الجيب',         'القضية', 'وقت النشاط'),
  ('case.act.break.body','اللعبة بتلف حوالين النشاط مش جواه. ارجعوا بعد النشاط.', 'القضية', 'نص وقت النشاط'),
  ('case.clue.title',    'التلميح',                     'القضية', 'عنوان التلميح'),
  ('case.clue.n',        'تلميح {{1}}',                 'القضية', 'ترقيم التلميح'),
  ('case.clue.applies',  'بينطبق على {{1}} منكم',       'القضية', 'تحت التلميح'),
  ('case.clue.ask',      'الطريقة الوحيدة للحل إنك تسأل اللي قدامك.', 'القضية', 'تحت التلميح'),
  ('case.event.title',   'حصل حاجة',                    'القضية', 'عنوان حدث الفصل التاني'),

  -- التصويت
  ('case.vote.title',    'مين؟',                        'القضية', 'عنوان شاشة التصويت'),
  ('case.vote.early',    'ده تصويت مبدئي — نتيجته ماتبانش.', 'القضية', 'في الفصل التاني'),
  ('case.vote.final',    'آخر كلمة. اختار واحد.',       'القضية', 'في الاتهام'),
  ('case.vote.cta',      'صوّتي عليه',                   'القضية', 'زرار التصويت'),
  ('case.vote.mine',     'صوّتت ✓',                      'القضية', 'جنب اللي صوّتت له'),
  ('case.vote.change',   'تقدر تغيّر لحد ما الكل يصوّت.', 'القضية', 'تحت القايمة'),
  ('case.vote.waiting',  'مستنيين الباقي… {{1}} من {{2}}', 'القضية', 'بعد التصويت'),
  ('case.vote.all',      'الكل صوّت',                    'القضية', 'لما يخلصوا'),

  -- الختام
  ('case.end.caught',    'اتقفش',                       'القضية', 'عنوان الختام لو الفريق كسب'),
  ('case.end.escaped',   'هرب',                         'القضية', 'عنوان الختام لو المتهم هرب'),
  ('case.end.who',       'المتهم كان {{1}}',            'القضية', 'كشف المتهم'),
  ('case.end.wasme',     'المتهم كان إنت',              'القضية', 'لو أنا المتهم'),
  ('case.end.mission',   'مهمته السرية كانت',           'القضية', 'عنوان المهمة في الختام'),
  ('case.end.mission.y', 'وعملها 😶',                   'القضية', 'لو خلّص مهمته'),
  ('case.end.mission.n', 'وماعملهاش',                   'القضية', 'لو ماخلّصهاش'),
  ('case.end.lies',      'الكدبات',                     'القضية', 'عنوان قسم الكدبات'),
  ('case.end.lies.said', 'قال',                         'القضية', 'اللي قاله المتهم'),
  ('case.end.titles',    'الألقاب',                     'القضية', 'عنوان قسم الألقاب'),
  ('case.end.again',     'أشوفهم تاني؟',                'القضية', 'الاختيار السري في الختام'),
  ('case.end.share',     'صوّر الشاشة',                  'القضية', 'تحت شاشة الختام'),

  -- الخزنة
  ('case.vault.title',   'الخزنة',                      'القضية', 'عنوان الخزنة'),
  ('case.vault.body',    'مفيش حد بيكدب المرة دي. الأربع أرقام جوّاكم.', 'القضية', 'نص الخزنة'),
  ('case.vault.cta',     'افتح',                        'القضية', 'زرار الخزنة'),
  ('case.vault.wrong',   'مش كده. فكّروا تاني.',        'القضية', 'محاولة غلط'),
  ('case.vault.open',    'اتفتحت 🎉',                   'القضية', 'الخزنة اتفتحت'),
  ('case.vault.shut',    'العداد خلص والخزنة لسه مقفولة. قربتوا أوي.', 'القضية', 'الخزنة ما اتفتحتش'),
  ('case.vault.hint',    'هنت',                         'القضية', 'عنوان الهنت'),
  ('case.vault.tries',   'جرّبتوا {{1}} مرة',           'القضية', 'عداد المحاولات'),

  -- صاحب الخروجة
  ('case.host.title',    'إنت ماسك القضية',             'القضية', 'عنوان شاشة صاحب الخروجة'),
  ('case.host.body',     'إنت بتلعب زي أي حد — مش شايف المتهم.', 'القضية', 'نص شاشة صاحب الخروجة'),
  ('case.host.code',     'كود الدخول: {{1}}',           'القضية', 'الكود لصاحب الخروجة'),
  ('case.host.say',      'قوله بصوتك. متكتبهوش في الشات.', 'القضية', 'تحت الكود'),
  ('case.host.open',     'افتح القضية',                 'القضية', 'زرار فتح الجلسة'),
  ('case.host.start',    'وزّع الأدوار وابدأ',           'القضية', 'زرار بدء اللعبة'),
  ('case.host.next',     'ابدأ الفصل الجاي',            'القضية', 'زرار نقل الفصل'),
  ('case.host.games',    'مين كسب الجيم؟',              'القضية', 'عنوان إدخال نتيجة النشاط'),
  ('case.host.games.n',  'الفريق الكسبان كسب كام جيم؟', 'القضية', 'سؤال عدد الجيمات'),
  ('case.host.losers',   'مين كان في الفريق الخسران؟',  'القضية', 'اختيار الخاسرين'),
  ('case.host.finish',   'اقفل القضية واكشف',           'القضية', 'زرار الختام'),
  ('case.host.wait',     'مستنيين {{1}} يدخلوا',        'القضية', 'قبل ما الكل يدخل'),
  ('case.host.save',     'احفظ',                        'القضية', 'زرار حفظ نتيجة النشاط'),

  -- مشترك
  ('case.small',         'المجموعة صغيرة على القضية دي — جرّبوا «الخزنة».', 'القضية', 'لما العدد أقل من اللازم'),
  ('case.notyet',        'القضية مابدأتش لسه.',         'القضية', 'قبل ما صاحب الخروجة يفتح'),
  ('case.over',          'القضية خلصت.',                'القضية', 'بعد الختام'),
  ('case.secret',        'الموبايل كارت مقلوب. ممنوع توري شاشتك لحد.', 'القضية', 'تحت كل شاشة لعب'),
  ('case.myteam',        'المحققين فريق واحد — يا تقفشوه كلكم يا يهرب.', 'القضية', 'تحت شاشة الفصل'),
  ('case.points',        'نقطي: {{1}}',                 'القضية', 'في صفحتي'),
  ('case.points.title',  'أوسمتي',                      'القضية', 'عنوان كرت الأوسمة في /me'),
  ('case.points.none',   'لسه مفيش. أول قضية وهتبدأ تجمع.', 'القضية', 'كرت الأوسمة وهو فاضي')
on conflict (key) do nothing;


-- ===== الاختبار =====
create or replace function test_case_copy()
returns table (test text, result text)
language plpgsql
set search_path = public
as $body$
declare
  t_keys text; t_vars text; t_guard text; t_role text; t_before text;
  v_s    uuid;
  v_sess uuid;
  v_host uuid;
  v_n    int;
  v_need text[] := array[
    'case.pre.title','case.join.code','case.outfit.title','case.card.tap',
    'case.clue.title','case.vote.title','case.end.caught','case.vault.title',
    'case.host.code','case.secret','case.points.title'];
begin
  -- (١) المفاتيح موجودة
  select count(*) into v_n from copy_strings where key = any(v_need);
  t_keys := case when v_n = array_length(v_need, 1) then 'نجح'
                 else format('فشل — %s من %s مفتاح', v_n, array_length(v_need, 1)) end;

  -- (٢) 🔴 أي نص فيه {{n}} لازم يكون متغيّره معروف — النص اللي متغيّره
  --     ما بيتملاش بيوصل للعضو ناقص (نفس باج «وصلنا تحويلك لـ .»)
  select count(*) into v_n from copy_strings
   where key like 'case.%' and value_ar ~ '\{\{[^0-9]' ;
  t_vars := case when v_n = 0 then 'نجح'
                 else format('فشل — 🔴 %s نص فيه متغيّر مش برقم', v_n) end;

  begin
    v_s := fn_case_fixture_up('aqd-elhanem');
    if v_s is null then
      t_guard := 'معلومة — محتاج البذرة المؤقتة'; t_role := t_guard; t_before := t_guard;
      raise exception 'test_case_copy_rollback';
    end if;
    select id into v_sess from case_sessions where sbota_id = v_s;
    v_host := fn_case_host(v_s);

    -- (٣) 🔴 القايمة مش بتطلع قبل توزيع الأدوار
    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_host), true);
    select count(*) into v_n from fn_case_players_list(v_s);
    t_before := case when v_n = 0 then 'نجح'
                     else format('فشل — 🔴 %s اسم ظهر قبل توزيع الأدوار', v_n) end;
    reset role; perform set_config('request.jwt.claims', '', true);

    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_host), true);
    perform fn_case_build(v_s);
    select count(*) into v_n from fn_case_players_list(v_s);
    t_guard := case when v_n = 6 then 'نجح' else format('فشل — %s اسم بدل 6', v_n) end;
    reset role; perform set_config('request.jwt.claims', '', true);

    -- (٤) 🔴 الدور مش في الإخراج خالص
    select count(*) into v_n from information_schema.parameters
     where specific_name = (select specific_name from information_schema.routines
                             where routine_name = 'fn_case_players_list' limit 1)
       and parameter_name in ('role', 'is_suspect', 'mission_ar', 'card_ar');
    t_role := case when v_n = 0 then 'نجح'
                   else format('فشل — 🔴 %s عمود بيكشف الدور في القايمة', v_n) end;

    raise exception 'test_case_copy_rollback';
  exception when others then
    reset role; perform set_config('request.jwt.claims', '', true);
    if sqlerrm <> 'test_case_copy_rollback' then
      t_guard := 'فشل — استثناء: ' || sqlerrm;
      t_role := coalesce(t_role, t_guard); t_before := coalesce(t_before, t_guard);
    end if;
  end;

  return query
    select * from (values
      ('0136 · نصوص الشاشات موجودة في copy_strings',            t_keys),
      ('0136 · 🔴 مفيش نص فيه متغيّر مش برقم',                   t_vars),
      ('0136 · 🔴 قايمة الأسامي مش بتطلع قبل توزيع الأدوار',     t_before),
      ('0136 · قايمة الأسامي بتوصل اللاعب بعد التوزيع',          t_guard),
      ('0136 · 🔴 القايمة مفيهاش ولا عمود بيكشف الدور',          t_role)
    ) as v(a, b);
end $body$;

comment on function test_case_copy() is
  '0136 — نصوص الشاشات موجودة، وقايمة الأسامي بعد التوزيع بس ومفيهاش الدور.';
revoke execute on function test_case_copy() from public, anon, authenticated;
