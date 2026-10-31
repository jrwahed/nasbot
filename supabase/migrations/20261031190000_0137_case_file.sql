-- ============================================================================
-- 0137 · «ملف القضية» — البلاغ ومسرح الواقعة والمطلوب
--
-- طلب المالك (٢٠٢٦-١٠-٣١): «مش ظاهر إن فيه صفحة بتحكي القضية وإزاي تتحل،
-- وقصة القضية إيه من البداية وإزاي حصلت، والمطلوب إيه عشان نحل القضية.
-- اعمله زي تحقيق المباحث — وإزاي المحامي لما يقرا الورق مع الظباط يحلّوا
-- القضية.»
--
-- اللي كان موجود: `intro_ar` سطرين بس. مش ملف — دي ترويسة.
-- اللي بقى: **دوسيه** بأربع حتت لكل قضية:
--   · `report_ar` — **البلاغ**: الحكاية من أولها، مين ومتى وإيه اللي حصل
--   · `scene_ar`  — **مسرح الواقعة**: اللي قدامك لما تبص حواليك
--   · `goal_ar`   — **المطلوب**: إيه اللي لازم تطلعوا بيه
--   · والطريقة (**إزاي تتحل**) مش في القضية — دي واحدة لكل اللعبة،
--     فمكانها `copy_strings` (`case.how.*`)، وإلا هتتكتب ٩ مرات وتفترق.
--
-- ⚠ **ليه مش صفحة محتوى زي `/rules`؟** لأن الملف **بيتغيّر مع الفصل**:
--   الأدلة بتتفتح واحد واحد، والحكم بيبان في الآخر. صفحة محتوى ثابتة
--   ماتعرفش تعمل كده. الثابت (الطريقة) في `copy_strings`، والمتغيّر
--   (البلاغ والأدلة والحكم) من `fn_case_file`.
--
-- ⚠ ومعاها `fn_case_preview` — **المالك يقرا أي ملف من اللوحة من غير
--   خروجة ولا حجز ولا جلسة.** من غيرها مكانش يقدر يشوف اللي كتبه أصلًا،
--   وده اللي خلّاه يفتح الموقع ويلاقي مفيش حاجة.
--
-- ⚠ محتاج `0130`–`0136`. آمن يتكرر. مفيهوش `drop` ولا `delete`.
-- ============================================================================

alter table cases add column if not exists report_ar text;
alter table cases add column if not exists scene_ar  text;
alter table cases add column if not exists goal_ar   text;

comment on column cases.report_ar is
  'البلاغ — الحكاية من أولها: مين ومتى وإيه اللي حصل. ده أول حاجة المجموعة بتقراها.';
comment on column cases.scene_ar is
  'مسرح الواقعة — اللي قدامهم لما يبصّوا حواليهم. بيدّي المجموعة حاجة يتكلموا عنها.';
comment on column cases.goal_ar is
  'المطلوب — إيه اللي لازم يطلعوا بيه آخر الليلة.';


-- ===== محتوى الـ٩ قضايا =====
-- ⚠ `coalesce` على الموجود: لو المالك عدّل من اللوحة، الهجرة ما بتكتبش
--   فوقه (الدرس التالت). بتملا الفاضي بس.
update cases set
  report_ar = coalesce(cases.report_ar, v.report_ar),
  scene_ar  = coalesce(cases.scene_ar,  v.scene_ar),
  goal_ar   = coalesce(cases.goal_ar,   v.goal_ar)
from (values
  ('aqd-elhanem',
   'الساعة عشرة ونص بالليل. نازلي هانم عاملة سهرة في الفيلا زي كل خميس، والصالون فيه ستة ضيوف — انتوا. العقد اللؤلؤ اللي ورثته عن أمها كان في رقبتها، والكل شافه.
في عشرة ونص وتلت قطع النور. دقيقة واحدة بالظبط، والجرسون نزل تحت يجيب الشمعدان.
لما النور رجع، نازلي هانم حطّت إيدها على رقبتها ولقتها فاضية.
الباب الخارجي كان مقفول من جوه. يعني اللي خد العقد **لسه في الصالون**.',
   'الصالون: كنبة كبيرة وأربع كراسي، ترابيزة في النص عليها صينية شاي، وشمعدان على الكونسول. النور لسه راجع لسه، وريحة الشمع في الأوضة. والستة قاعدين مكانهم ما حدش قام.',
   'تطلعوا باسم واحد. اللي معاه العقد قاعد معاكم وبيشرب شاي — والدقيقة اللي النور فيها قطع كانت كفاية.'),

  ('elgawab-elmaghool',
   'المعلم حنفي فتح قهوة النجاح الساعة ستة الصبح زي كل يوم من تلاتين سنة.
لقى جواب متزنق تحت الباب. فتحه ولقى سطر واحد: «القهوة دي هتتقفل يوم الخميس.»
مفيش إمضا ومفيش اسم. بس الخط… المعلم حنفي بيقول إنه شافه قبل كده.
والقهوة مش فاضية: انتوا قاعدين فيها من بدري، وكلكم بتكتبوا قدامه كل يوم.',
   'القهوة: ترابيزات رخام وكراسي خيزران، والجواب محطوط على الكونتر جنب الراديو. المعلم حنفي واقف وراه حاطط إيده على خده، وشايف كل حاجة من مكانه.',
   'تعرفوا مين كتب الجواب. وأهم من كده — تعرفوا ليه، لأن الحكاية مش زي ما باينة.'),

  ('waraqet-elyanaseeb',
   'عم رمضان بواب العمارة من خمستاشر سنة، وعمره ما كسب حاجة.
امبارح كسب اليانصيب. ملوش أهل في القاهرة، فعلّق الورقة على حيطة الغرفة عشان كل اللي داخل وخارج يشوفها، وقعد يقول لكل حد: «بص بص».
النهارده الصبح نزل يجيب حلاوة يوزّعها. غاب عشر دقايق بالكتير.
رجع لقى الحيطة فاضية والدبوس لسه مكانه.
والعشر دقايق دول — انتوا كنتوا في العمارة.',
   'غرفة البواب: سرير وترمس شاي وراديو صغير. الحيطة قدامك فيها دبوس من غير ورقة، وتحتها كيس حلاوة لسه مفتوحش. وباب العمارة من غير جرس.',
   'ترجّعوا الورقة لعم رمضان. اللي خدها واقف معاكم دلوقتي وعارف إنكم بتدوّروا.'),

  ('elshafra',
   'الوحدة بعتت ستة عملاء عشان يستلموا شفرة من نقطة تسليم في وسط البلد.
الشفرة وصلت، بس قبلها بساعة وصلتنا برقية من مصدر بنثق فيه: **واحد من الستة شغال لحساب الناحية التانية**، ومهمته إن الشفرة ما تتفتحش.
الوحدة قررت: الشفرة تفضل مقفولة لحد ما تعرفوا هو مين.
ومن ساعتها وانتوا الستة في نفس المكان، ومحدش يقدر يخرج.',
   'النقطة: أوضة من غير شبابيك، ترابيزة معدن في النص وعليها الظرف المختوم. وعلى الحيطة ساعة بتعدّ. والتليفونات مقفولة من الوحدة.',
   'تطلعوا باسم العميل المزدوج. لو غلطتوا، الشفرة بتتفتح قدامه هو كمان.'),

  ('el3ameleen',
   'نفس النقطة ونفس الشفرة. بس البرقية المرة دي بتقول **اتنين**.
والأخطر: الاتنين عارفين بعض، ومتفقين. يعني هيغطّوا على بعض، وكل واحد فيهم هيشهد للتاني.
الوحدة بعتت تمن عملاء المرة دي — عدد أكبر معناه مساحة أكبر يختبوا فيها.',
   'نفس الأوضة، بس الترابيزة أكبر والعدد أكتر. والظرف المختوم في النص، وجنبه ظرف تاني فاضي — ده اللي هيتبعت للناحية التانية لو فشلتوا.',
   'تطلعوا بـ**اسمين**. واحد صح وواحد غلط = الصفقة تمشي زي ما هما عايزين.'),

  ('elkhazna',
   'مفيش خاين المرة دي. الوحدة بعتتلكم خزنة.
الخزنة مقفولة بأربع أرقام، وكل رقم الوحدة كتبته من **ملفاتكم انتوا**: عادات وتفاصيل صغيرة عن الستة اللي في الأوضة.
يعني الكود مش مكتوب في أي حتة — هو جواكم، موزّع على ناس ما تعرفوش بعض كويس.
والعداد شغال.',
   'الخزنة على الترابيزة، أربع خانات فاضية وشاشة صغيرة. وجنبها ورقة فيها الأربع ألغاز. ومفيش حاجة تانية في الأوضة.',
   'تفتحوا الخزنة. الطريقة الوحيدة إنكم تسألوا بعض وتعدّوا بصوت عالي.'),

  ('meen-kal-elmahshi',
   'ماما لفّت المحشي من إمبارح بالليل للعزومة النهارده. حلة كبيرة، وحطتها تبرد على البوتاجاز وغطتها.
الصبح الساعة تمانية فتحت الغطا لقت الحلة ناقصة نصها.
الباب كان مقفول، ومفيش حد دخل من بره. يعني اللي كل المحشي **من البيت**، وقاعد على السفرة دلوقتي بيفطر معاكم.',
   'المطبخ: الحلة على البوتاجاز نصها فاضي، والغطا مرمي جنبها. وفي الزبالة ورقة مناديل. وريحة المحشي لسه في البيت.',
   'تعرفوا مين. ماما مش هتزعل — بس عايزة تعرف.'),

  ('elremote',
   'الماتش بيبدأ بعد خمس دقايق. العيلة كلها قدام التلفزيون من نص ساعة.
الريموت كان على الترابيزة الساعة ستة، شافه أكتر من واحد.
الساعة ستة وعشرين اختفى.
دوّرتوا تحت الكنبة، وفي التلاجة (عادي، بيحصل)، وفي الحمام. مفيش.
والباب مقفول من الصبح. يعني هو مع واحد فيكم.',
   'الصالة: كنبة وتلات كراسي، ترابيزة فيها ريموت التكييف بس. التلفزيون شغال على القناة الغلط، والصوت واطي. وفيه حد مش قلقان خالص.',
   'تطلعوا بالريموت قبل ما الماتش يبدأ. اللي مخبيه عارف انتوا فين بالظبط من الحل.'),

  ('meen-sab-elgroup',
   'جروب العيلة اتعمل من تمن سنين وفيه تلاتة وعشرين واحد.
إمبارح بالليل كان تلاتة وعشرين. النهارده الصبح بقى اتنين وعشرين.
واتساب مابيقولش مين خرج لوحده — بيقول «فلان خرج» وبس، والرسالة اتمسحت.
وخالتك شافت الرسالة قبل ما تتمسح، بس مش فاكرة الاسم.
واللي خرج قاعد معاكم دلوقتي، وبيقول «أنا؟ لأ طبعًا».',
   'القعدة: الكل ماسك موبايله. وخالتك قاعدة في النص وعينها على الكل. وفيه حد مش بيفتح الجروب خالص.',
   'تعرفوا مين خرج. خالتك مش هتسيب الموضوع، والعشا مش هيتقدّم قبل كده.')
) as v(slug, report_ar, scene_ar, goal_ar)
where cases.slug = v.slug;


-- ===== «إزاي تتحل» — طريقة واحدة لكل اللعبة =====
-- ⚠ دي **مش** في القضية: لو اتكتبت ٩ مرات، أول تعديل هيخلّيهم يفترقوا
--   (الدرس الستاشر). مكانها `copy_strings` والمالك بيعدّلها مرة.
insert into copy_strings (key, value_ar, screen, context_ar) values
  ('case.file.title',    'ملف القضية',                  'القضية', 'عنوان الدوسيه'),
  ('case.file.no',       'قضية رقم {{1}}',              'القضية', 'رقم الملف — أول ٦ حروف من رقم الجلسة'),
  ('case.file.report',   'البلاغ',                      'القضية', 'عنوان حتة الحكاية'),
  ('case.file.scene',    'مسرح الواقعة',                'القضية', 'عنوان حتة المكان'),
  ('case.file.goal',     'المطلوب',                     'القضية', 'عنوان حتة الهدف'),
  ('case.file.how',      'إزاي تتحل',                   'القضية', 'عنوان حتة الطريقة'),
  ('case.file.evidence', 'الأدلة',                      'القضية', 'عنوان حتة التلميحات'),
  ('case.file.people',   'اللي في الأوضة',              'القضية', 'عنوان قايمة المجموعة'),
  ('case.file.verdict',  'الحكم',                       'القضية', 'عنوان الختام في الملف'),
  ('case.file.sealed',   'لسه مقفول',                   'القضية', 'ختم على الدليل اللي ما اتفتحش'),
  ('case.file.open',     'اتفتح',                       'القضية', 'ختم على الدليل المفتوح'),
  ('case.file.waiting',  'الدليل ده بيتفتح في الفصل الجاي.', 'القضية', 'تحت الدليل المقفول'),
  ('case.file.preview',  'معاينة — دي الملف زي ما المجموعة هتقراه.', 'القضية', 'شريط فوق المعاينة في اللوحة'),

  -- الطريقة — الحتة اللي المالك سأل عنها بالظبط
  ('case.how.1',  'الموقع شايل الإجابات، وانتوا شايلين الأسئلة. كل واحد جاوب على نفسه إمبارح، والموقع بنى من إجاباته التلميحات. يعني الطريقة الوحيدة للحل إنك تسأل اللي قدامك.', 'القضية', 'الطريقة — ١'),
  ('case.how.2',  'بيجيلكم تلات أدلة، واحد كل فصل. الأول بينطبق على نص المجموعة تقريبًا، والتاني بيضيّق، والتالت مع اللي قبله بيشاور على **واحد بس**.', 'القضية', 'الطريقة — ٢'),
  ('case.how.3',  'المتهم بس هو المسموحله يكدب. انتوا بتقولوا الصدق عن نفسكم — وده اللي بيخلّي كدبته تبان: لو الدليل بيقول «تلاتة» وانتوا عدّيتوا لقيتوا اتنين، يبقى فيه حد قال غلط.', 'القضية', 'الطريقة — ٣'),
  ('case.how.4',  'آخر دليل دايمًا حاجة **ماينفعش يتكدب فيها** — حاجة الكل شايفها أو الموقع عارفها لوحده. فمهما كدب في الأول، التالت بيقفشه لو ركّزتوا.', 'القضية', 'الطريقة — ٤'),
  ('case.how.5',  'في الآخر كل واحد بيصوّت من موبايله. النتيجة بتظهر عند الكل في نفس اللحظة — ومحدش بيعرف صوت مين على مين قبلها.', 'القضية', 'الطريقة — ٥'),
  ('case.how.team','المحققين فريق واحد. مفيش فايز وخسران بينكم: يا تقفشوه كلكم، يا يهرب.', 'القضية', 'الطريقة — تحتها'),
  ('case.how.vault','مفيش متهم في «الخزنة». الكل فريق واحد ومحدش بيكدب — الأربع أرقام جواكم، وبتطلعوها بالسؤال والعدّ بصوت عالي.', 'القضية', 'الطريقة في الخزنة')
on conflict (key) do nothing;


-- ===== 🔴 الملف للاعب =====
-- بيرجّع الدوسيه كامل، **والأدلة بتتفتح فصل فصل زي ما هي** — الدالة دي
-- مش بتزوّد ولا بتنقص على `fn_case_clues`، بتلمّ الحتت مع بعض بس.
create or replace function fn_case_file(s_id uuid)
returns table (
  file_no text, case_title_ar text, world_name_ar text, theme text,
  report_ar text, scene_ar text, goal_ar text, intro_ar text,
  shape case_shape_t, act case_act_t, started boolean, ended boolean,
  detective_name_ar text, suspect_name_ar text
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
  if not fn_case_player_ok(s_id, v_uid) then return; end if;
  select * into v_cs from case_sessions where sbota_id = s_id;
  if not found then return; end if;

  return query
    select upper(substr(replace(v_cs.id::text, '-', ''), 1, 6)),
           c.title_ar, w.name_ar, w.theme,
           c.report_ar, c.scene_ar, c.goal_ar, c.intro_ar,
           c.shape, v_cs.act, v_cs.built_at is not null, v_cs.ended_at is not null,
           w.detective_name_ar, w.suspect_name_ar
      from cases c
      join case_worlds w on w.slug = c.world_slug
     where c.id = v_cs.case_id;
end $$;
comment on function fn_case_file(uuid) is
  'ملف القضية للاعب: البلاغ ومسرح الواقعة والمطلوب. الأدلة بتيجي من fn_case_clues (فصل فصل) مش من هنا.';
revoke execute on function fn_case_file(uuid) from public, anon;
grant  execute on function fn_case_file(uuid) to authenticated;


-- ===== معاينة الملف من اللوحة =====
-- ⚠ **من غير خروجة ولا حجز ولا جلسة.** ودي اللي كانت ناقصة: المالك كتب
--   ٩ قضايا وما كانش يقدر يقرا ولا واحدة من غير ما يعمل سبوطة ويحجز
--   فيها ويفتح جلسة. ميزة تتكتب وما تتشافش = ميزة مش موجودة (الدرس التامن).
--
-- ⚠ مقفولة على `cases.view` — مش `fn_is_admin()` (الدرس من `0056`)،
--   ومش للعضو خالص: الملف فيه كارت المتهم.
create or replace function fn_case_preview(p_slug text)
returns table (
  case_title_ar text, world_name_ar text, theme text,
  report_ar text, scene_ar text, goal_ar text, intro_ar text,
  detective_card_ar text, suspect_card_ar text, act2_event_ar text,
  win_ending_ar text, escape_ending_ar text, twist_ar text,
  shape case_shape_t, min_players int,
  detective_name_ar text, suspect_name_ar text, has_act2_event boolean
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not fn_has_permission('cases.view') then return; end if;
  return query
    select c.title_ar, w.name_ar, w.theme,
           c.report_ar, c.scene_ar, c.goal_ar, c.intro_ar,
           c.detective_card_ar, c.suspect_card_ar, c.act2_event_ar,
           c.win_ending_ar, c.escape_ending_ar, c.twist_ar,
           c.shape, c.min_players,
           w.detective_name_ar, w.suspect_name_ar, w.has_act2_event
      from cases c
      join case_worlds w on w.slug = c.world_slug
     where c.slug = p_slug;
end $$;
comment on function fn_case_preview(text) is
  'الملف كامل للوحة (فيه كارت المتهم والنهايتين) — cases.view بس. علشان المالك يقرا اللي كتبه من غير خروجة.';
revoke execute on function fn_case_preview(text) from public, anon;
grant  execute on function fn_case_preview(text) to authenticated;


-- ===== الاختبار =====
create or replace function test_case_file()
returns table (test text, result text)
language plpgsql
set search_path = public
as $body$
declare
  t_content text; t_file text; t_prev text; t_prev_guard text;
  t_how text; t_leak text; t_anon text;
  v_s uuid; v_host uuid; v_n int; v_admin uuid;
begin
  -- (١) كل قضية ليها بلاغ ومسرح ومطلوب — القضية الناقصة = ملف فاضي للمجموعة
  select count(*) into v_n from cases
   where btrim(coalesce(report_ar,'')) = ''
      or btrim(coalesce(scene_ar,'')) = ''
      or btrim(coalesce(goal_ar,'')) = '';
  t_content := case when v_n = 0 then 'نجح'
                    else format('فشل — 🔴 %s قضية ملفها ناقص', v_n) end;

  -- (٢) نصوص الطريقة موجودة
  select count(*) into v_n from copy_strings
   where key in ('case.how.1','case.how.2','case.how.3','case.how.4','case.how.5',
                 'case.file.report','case.file.scene','case.file.goal','case.file.how');
  t_how := case when v_n = 9 then 'نجح' else format('فشل — %s من 9 نص', v_n) end;

  -- (٣) 🔴 الملف **مفيهوش** كارت المتهم ولا النهايات — ده للوحة بس
  select count(*) into v_n from information_schema.parameters
   where specific_name = (select specific_name from information_schema.routines
                           where routine_name = 'fn_case_file' limit 1)
     and parameter_name in ('suspect_card_ar','win_ending_ar','escape_ending_ar','twist_ar');
  t_leak := case when v_n = 0 then 'نجح'
                 else format('فشل — 🔴 %s عمود بيكشف الحل في ملف اللاعب', v_n) end;

  begin
    v_s := fn_case_fixture_up('aqd-elhanem');
    if v_s is null then
      t_file := 'معلومة — محتاج البذرة المؤقتة'; t_prev := t_file;
      t_prev_guard := t_file; t_anon := t_file;
      raise exception 'test_case_file_rollback';
    end if;
    v_host := fn_case_host(v_s);

    -- (٤) لاعب من المجموعة بياخد الملف
    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_host), true);
    select count(*) into v_n from fn_case_file(v_s)
     where btrim(coalesce(report_ar,'')) <> '' and btrim(coalesce(goal_ar,'')) <> '';
    t_file := case when v_n = 1 then 'نجح' else format('فشل — %s صف في الملف', v_n) end;
    reset role; perform set_config('request.jwt.claims', '', true);

    -- (٥) 🔴 المجهول ماياخدش الملف
    set local role anon;
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    begin
      select count(*) into v_n from fn_case_file(v_s);
      t_anon := case when v_n = 0 then 'نجح' else format('فشل — 🔴 المجهول شاف الملف', v_n) end;
    exception when others then t_anon := 'نجح';
    end;
    reset role; perform set_config('request.jwt.claims', '', true);

    -- (٦) 🔴 المعاينة مقفولة على اللي مالوش cases.view
    set local role authenticated;
    perform set_config('request.jwt.claims',
      format('{"sub":"%s","role":"authenticated"}', v_host), true);
    select count(*) into v_n from fn_case_preview('aqd-elhanem');
    t_prev_guard := case when v_n = 0 then 'نجح'
                         else 'فشل — 🔴 عضو عادي قرا الملف الكامل (فيه كارت المتهم)' end;
    reset role; perform set_config('request.jwt.claims', '', true);

    -- (٧) المعاينة بتشتغل لحساب اللوحة — لازم **تنجح** (الدرس ٢٤)
    select au.profile_id into v_admin
      from admin_users au
      join role_permissions rp on rp.role_key = au.role_key
     where au.is_active and rp.permission_key = 'cases.view'
     limit 1;
    if v_admin is null then
      v_admin := '44444444-0000-0000-0000-000000000001';
      insert into admin_users (profile_id, role_key, is_active)
      values (v_admin, 'ops', true)
      on conflict (profile_id) do update set role_key = 'ops', is_active = true;
    end if;
    set local role authenticated;
    perform set_config('request.jwt.claims',
      format('{"sub":"%s","role":"authenticated"}', v_admin), true);
    select count(*) into v_n from fn_case_preview('aqd-elhanem')
     where btrim(coalesce(suspect_card_ar,'')) <> '';
    t_prev := case when v_n = 1 then 'نجح' else format('فشل — اللوحة مقدرتش تقرا الملف (%s صف)', v_n) end;
    reset role; perform set_config('request.jwt.claims', '', true);

    raise exception 'test_case_file_rollback';
  exception when others then
    reset role; perform set_config('request.jwt.claims', '', true);
    if sqlerrm <> 'test_case_file_rollback' then
      t_file := coalesce(t_file, 'فشل — استثناء: ' || sqlerrm);
      t_prev := coalesce(t_prev, 'فشل — استثناء: ' || sqlerrm);
      t_prev_guard := coalesce(t_prev_guard, 'فشل — استثناء: ' || sqlerrm);
      t_anon := coalesce(t_anon, 'فشل — استثناء: ' || sqlerrm);
    end if;
  end;

  return query
    select * from (values
      ('0137 · 🔴 كل قضية ليها بلاغ ومسرح واقعة ومطلوب',       t_content),
      ('0137 · نصوص «إزاي تتحل» موجودة',                       t_how),
      ('0137 · 🔴 ملف اللاعب مفيهوش كارت المتهم ولا النهايات', t_leak),
      ('0137 · لاعب من المجموعة بياخد الملف',                  t_file),
      ('0137 · 🔴 المجهول ماياخدش الملف',                      t_anon),
      ('0137 · 🔴 المعاينة الكاملة مقفولة على العضو',          t_prev_guard),
      ('0137 · اللوحة بتقرا الملف الكامل',                     t_prev)
    ) as v(a, b);
end $body$;

comment on function test_case_file() is
  '0137 — ملف القضية كامل لكل قضية، وملف اللاعب مفيهوش الحل، والمعاينة للوحة بس.';
revoke execute on function test_case_file() from public, anon, authenticated;
