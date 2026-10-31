-- ============================================================================
-- 0133 · «قضية الليلة» — التلميحات والفصول
--
-- التلات تلميحات بيضيّقوا الدايرة واحدة ورا التانية، ومع بعض بيشاوروا على
-- شخص واحد بس. الموقع بيحسبهم لوحده من إجابات المجموعة:
--
--   التلميح الأول  → بينطبق على ٣ أو ٤ (في مجموعة ٦) — إجابة من إجابات المتهم
--   التلميح التاني → بينطبق على ٢ أو ٣ — إجابة تانية من إجاباته
--   التلميح التالت → مع الاتنين اللي قبله = **واحد بس** — حاجة بتتشاف بالعين
--
-- 🔴 **المتهم بيكدب، فالموقع بيداري.** المتهم يقدر يكدب في أي إجابة عن
--    نفسه. عشان كده آخر تلميح دايمًا حاجة **ماينفعش يتكدب فيها**: ترتيب
--    الوصول (الموقع عارف مين كتب الكود الأول) · اللي لابسه (الكل شايفه) ·
--    نتيجة النشاط (صاحب الخروجة بيدخّلها).
--
-- ⚠ **التلميح التالت بيتحسب في الفصل الأخير مش وقت توزيع الأدوار** — لأن
--   نتيجة النشاط لسه ما حصلتش. بس `fn_case_build` بتتأكد إن **فيه تلميح
--   تالت ممكن** قبل ما تثبّت المتهم، وإلا بتختار متهم تاني. من غير الفحص
--   ده اللعبة ممكن تبدأ وهي مش قابلة للحل.
--
-- ⚠ محتاج `0130`–`0132`. آمن يتكرر. مفيهوش `drop` ولا `delete`.
-- ============================================================================

-- ===== نصوص التلميحات اللي الموقع بيولّدها =====
-- ⚠ النص في القاعدة مش في الكود (§٣.١/§٣.٢) — بيتعدّل من /admin/cases.
create table if not exists case_clue_templates (
  key        text primary key,
  text_ar    text not null,
  note_ar    text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table case_clue_templates is
  'نصوص التلميحات اللي الموقع بيبنيها لوحده (ترتيب الوصول · نتيجة النشاط). {{n}} = رقم.';

insert into case_clue_templates (key, text_ar, note_ar) values
  ('arrive_first',  'المتهم كان من أول اللي وصلوا',        'لما المتهم أقدم واحد في الدايرة الضيقة'),
  ('arrive_last',   'المتهم ماكانش من أول {{n}} وصلوا',    '{{n}} = عدد اللي وصلوا قبله في الدايرة'),
  ('activity_lost', 'المتهم كان في الفريق اللي خسر الجيم الأول', 'صاحب الخروجة بيدخّل النتيجة بدوسة واحدة'),
  ('activity_won',  'المتهم كان في الفريق اللي كسب الجيم الأول', 'الناحية التانية من نفس النتيجة')
on conflict (key) do nothing;

alter table case_clue_templates enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='case_clue_templates' and policyname='cct_admin_read') then
    create policy cct_admin_read on case_clue_templates for select using (fn_has_permission('cases.view'));
  end if;
  if not exists (select 1 from pg_policies where tablename='case_clue_templates' and policyname='cct_admin_write') then
    create policy cct_admin_write on case_clue_templates for all
      using (fn_has_permission('cases.edit')) with check (fn_has_permission('cases.edit'));
  end if;
end $$;
create or replace trigger t_cct_updated before update on case_clue_templates
  for each row execute function set_updated_at();


-- ===== التلميحات المحسوبة =====
create table if not exists case_clues (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references case_sessions(id) on delete cascade,
  act         int  not null,
  -- ⚠ «العميلين» (`0135`) فيها **متهمين**، وكل واحد له تلميحه في كل فصل.
  --   فالمفتاح (الجلسة · الفصل · الخانة) من الأول — علشان `0135` ما تحتاجش
  --   تعمل `drop constraint` على جدول شغّال.
  slot        int  not null default 1,
  for_suspect uuid references profiles(id) on delete cascade,
  text_ar     text not null,
  applies_to  int  not null,
  source      text not null,
  created_at  timestamptz not null default now(),
  unique (session_id, act, slot),
  constraint case_clues_act_range check (act between 1 and 3),
  constraint case_clues_slot_range check (slot between 1 and 2)
);
comment on table case_clues is
  '⚠ مفيهاش سياسة قراية للعضو. التلميح بيوصل من fn_case_clues وبيتفتح **فصل فصل** — تلميح الفصل التالت في المتصفح من الأول = اللعبة خلصت.';
comment on column case_clues.applies_to is
  'بينطبق على كام واحد في المجموعة — ده اللي بيتأكد إن التلات تلميحات بيضيّقوا الدايرة فعلًا.';

create index if not exists case_clues_session_idx on case_clues (session_id, act);

alter table case_clues enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='case_clues' and policyname='case_clues_admin_read') then
    create policy case_clues_admin_read on case_clues for select using (fn_has_permission('cases.view'));
  end if;
end $$;

-- نتيجة النشاط — صاحب الخروجة بيدخّلها بدوسة واحدة
alter table case_sessions add column if not exists losers uuid[] not null default '{}';
comment on column case_sessions.losers is
  'الفريق اللي خسر الجيم الأول. مصدر محتمل للتلميح التالت — وماينفعش يتكدب فيه.';


-- ===== سؤال اللبس (اللي ما يتكدبش فيه) =====
-- بيتسأل في **أول اللعبة** مش يوم الكشف، فله دالة لوحده: `fn_case_answer`
-- بترفض `kind='observed'` عن قصد.
create or replace function fn_case_observe(s_id uuid, p_option_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_q   uuid;
  v_act case_act_t;
begin
  if not fn_case_player_ok(s_id, v_uid) then
    raise exception 'مش من حقك';
  end if;

  select act into v_act from case_sessions where sbota_id = s_id;
  if v_act is null then raise exception 'القضية مش مفتوحة لسه'; end if;
  -- بعد الفصل الأول اللبس اتغيّر يمكن، والتلميح اتحسب — فمقفول
  if v_act not in ('setup', 'arrive') then
    raise exception 'الوقت ده عدّى';
  end if;

  select o.question_id into v_q
    from case_options o
    join case_questions q on q.id = o.question_id
   where o.id = p_option_id and q.is_active and q.kind = 'observed';
  if v_q is null then raise exception 'الاختيار ده مش موجود'; end if;

  insert into case_answers (sbota_id, profile_id, question_id, option_id)
  values (s_id, v_uid, v_q, p_option_id)
  on conflict (sbota_id, profile_id, question_id)
    do update set option_id = excluded.option_id, answered_at = now();
  return true;
end $$;
comment on function fn_case_observe(uuid, uuid) is
  'سؤال اللبس في أول اللعبة. باللون بس — مفيش حجاب ولا نوع هدوم ولا أي حاجة تكشف حاجة شخصية.';
revoke execute on function fn_case_observe(uuid, uuid) from public, anon;
grant  execute on function fn_case_observe(uuid, uuid) to authenticated;

create or replace function fn_case_observe_q(s_id uuid)
returns table (question_id uuid, question_ar text, option_id uuid, option_label_ar text, my_choice boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if not fn_case_player_ok(s_id, v_uid) then return; end if;
  return query
    select q.id, q.question_ar, o.id, o.label_ar,
           exists (select 1 from case_answers a
                    where a.sbota_id = s_id and a.profile_id = v_uid and a.option_id = o.id)
      from case_questions q
      join case_options o on o.question_id = q.id
     where q.is_active and q.kind = 'observed'
     order by q.sort, o.sort;
end $$;
comment on function fn_case_observe_q(uuid) is 'سؤال اللبس واختياراته — من غير نص التلميح.';
revoke execute on function fn_case_observe_q(uuid) from public, anon;
grant  execute on function fn_case_observe_q(uuid) to authenticated;


-- ===== هل فيه تلميح تالت ممكن للمتهم ده؟ =====
-- بيرجّع `source` و`applies_to` و`n` لو فيه، وإلا ولا صف. الدالة دي
-- بتتنادى **مرتين**: وقت التثبيت (فحص إن اللعبة قابلة للحل) ووقت الفصل
-- الأخير (التوليد الفعلي) — فمستحيل الاتنين يفترقوا (الدرس الستاشر).
create or replace function fn_case_clue3_for(sess uuid, cand uuid)
returns table (src text, txt text, n_applies int)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_s      uuid;
  v_narrow uuid[];   -- الدايرة الضيقة بعد التلميحين الأولين
  v_lost   uuid[];
  v_n      int;
  v_ord    int;
  v_opt    uuid;
  v_cnt    int;
  v_tpl    text;
begin
  select cs.sbota_id into v_s from case_sessions cs where cs.id = sess;
  if v_s is null then return; end if;

  -- الدايرة الضيقة = اللاعبين اللي بيطابقوا كل التلميحات المخزّنة (١ و٢).
  -- لو لسه مفيش تلميحات، الدايرة = اللاعبين كلهم.
  select array_agg(p.profile_id) into v_narrow
    from case_players p
   where p.session_id = sess and p.role <> 'watcher'
     and not exists (
       select 1 from case_clues cl
        where cl.session_id = sess and cl.act in (1,2)
          -- ⚠ في «العميلين» كل متهم له تلميحاته — الدايرة بتتحسب من
          --   تلميحاته هو بس، مش من تلميحات التنين مع بعض.
          and (cl.for_suspect is null or cl.for_suspect = cand)
          and not exists (
            select 1 from case_answers a
             where a.sbota_id = v_s and a.profile_id = p.profile_id
               and a.option_id::text = split_part(cl.source, ':', 2)
          )
     );
  if v_narrow is null or not (cand = any(v_narrow)) then return; end if;
  v_n := array_length(v_narrow, 1);

  -- (أ) اللبس — الكل شايفه
  select a.option_id into v_opt
    from case_answers a
    join case_questions q on q.id = a.question_id
   where a.sbota_id = v_s and a.profile_id = cand and q.kind = 'observed'
   limit 1;
  if v_opt is not null then
    select count(*) into v_cnt
      from case_answers a
     where a.sbota_id = v_s and a.option_id = v_opt
       and a.profile_id = any(v_narrow);
    if v_cnt = 1 then
      return query select ('outfit:' || v_opt::text)::text, o.clue_ar, 1
                     from case_options o where o.id = v_opt;
      return;
    end if;
  end if;

  -- (ب) ترتيب الوصول — الموقع عارفه لوحده
  select p.arrive_order into v_ord
    from case_players p where p.session_id = sess and p.profile_id = cand;
  if v_ord is not null then
    -- أقدم واحد في الدايرة الضيقة؟
    select count(*) into v_cnt
      from case_players p
     where p.session_id = sess and p.profile_id = any(v_narrow)
       and p.arrive_order is not null and p.arrive_order <= v_ord;
    if v_cnt = 1 then
      select t.text_ar into v_tpl from case_clue_templates t where t.key = 'arrive_first';
      return query select 'arrive_first'::text,
             coalesce(v_tpl, 'المتهم كان من أول اللي وصلوا')::text, 1;
      return;
    end if;
    -- آخر واحد في الدايرة الضيقة؟
    select count(*) into v_cnt
      from case_players p
     where p.session_id = sess and p.profile_id = any(v_narrow)
       and p.arrive_order is not null and p.arrive_order >= v_ord;
    if v_cnt = 1 then
      select t.text_ar into v_tpl from case_clue_templates t where t.key = 'arrive_last';
      return query select 'arrive_last'::text,
             replace(coalesce(v_tpl, 'المتهم ماكانش من أول {{n}} وصلوا'),
                     '{{n}}', greatest(v_n - 1, 1)::text)::text, 1;
      return;
    end if;
  end if;

  -- (ج) نتيجة النشاط — لو صاحب الخروجة دخّلها
  -- ⚠ الشرط **جوه الدايرة الضيقة**، مش على المجموعة كلها. أول نسخة كانت
  --   بتستبدل الدايرة بقايمة الخاسرين وتنسى التلميحين اللي قبله — فالتلميح
  --   كان ممكن يطلع «بيوصل لواحد» وهو مش بيضيّق حاجة.
  select cs.losers into v_lost from case_sessions cs where cs.id = sess;
  if v_lost is not null and array_length(v_lost, 1) > 0 then
    select count(*) into v_cnt
      from case_players p
     where p.session_id = sess and p.role <> 'watcher'
       and p.profile_id = any(v_narrow)
       and p.profile_id = any(v_lost);
    if v_cnt = 1 and cand = any(v_lost) then
      select t.text_ar into v_tpl from case_clue_templates t where t.key = 'activity_lost';
      return query select 'activity_lost'::text,
             coalesce(v_tpl, 'المتهم كان في الفريق اللي خسر الجيم الأول')::text, 1;
      return;
    end if;
    -- والناحية التانية: هو الوحيد اللي **مش** في الخاسرين
    select count(*) into v_cnt
      from case_players p
     where p.session_id = sess and p.role <> 'watcher'
       and p.profile_id = any(v_narrow)
       and not (p.profile_id = any(v_lost));
    if v_cnt = 1 and not (cand = any(v_lost)) then
      select t.text_ar into v_tpl from case_clue_templates t where t.key = 'activity_won';
      return query select 'activity_won'::text,
             coalesce(v_tpl, 'المتهم كان في الفريق اللي كسب الجيم الأول')::text, 1;
      return;
    end if;
  end if;

  return;
end $$;
comment on function fn_case_clue3_for(uuid, uuid) is
  'التلميح التالت الممكن للمتهم ده (حاجة ماينفعش يتكدب فيها)، **جوه الدايرة الضيقة**. ولا صف = اللعبة مش قابلة للحل بالمتهم ده.';
revoke execute on function fn_case_clue3_for(uuid, uuid) from public, anon, authenticated;


-- ===== تنضيف بذرة القضايا =====
-- ⚠ **بالأرقام اللي أنشأناها بالظبط، مش بالبادئة** (الدرس السابع: المسح
--   بالبادئة بيمسح اللي ما عملتهوش — `fn_test_seed_down` مسحت حساب لوحة
--   فعلًا على الإنتاج بسبب كده). والحارس الصريح على أي صف عليه حساب لوحة
--   موجود برضه، مهما حصل.
--
-- ⚠ الاختبارات بتلف نفسها في معاملة بترجع، فدي **شبكة أمان** مش الطريق
--   الأساسي: لو اختبار وقع بشكل خلّى الكتابة تتحفظ، دي بتنضّف وراه.
--   `CHECK_DB` بيناديها بعد `fn_test_seed_down()`.
create or replace function fn_case_fixture_down()
returns void
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  v_people uuid[] := '{}';
  v_sbotat uuid[] := '{}';
  v_books  uuid[] := '{}';
  np int; i int;
begin
  for i in 1 .. 12 loop
    v_people := v_people || ('cccccccc-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid;
  end loop;
  for np in 3 .. 12 loop
    v_sbotat := v_sbotat || ('cccccccc-9999-0000-' || lpad(np::text, 4, '0') || '-000000000001')::uuid;
    for i in 1 .. 12 loop
      v_books := v_books || ('cccccccc-1111-0000-' || lpad(np::text, 4, '0') || '-' || lpad(i::text, 12, '0'))::uuid;
    end loop;
  end loop;

  -- جداول اللعبة بتتمسح لوحدها بالـcascade من الجلسة والسبوطة
  delete from case_sessions where sbota_id = any(v_sbotat);
  delete from case_answers  where sbota_id = any(v_sbotat);
  delete from bookings      where id = any(v_books);
  delete from sbotat        where id = any(v_sbotat);

  delete from case_points cp where cp.profile_id = any(v_people)
     and not exists (select 1 from admin_users a where a.profile_id = cp.profile_id);
  delete from profiles p where p.id = any(v_people)
     and not exists (select 1 from admin_users a where a.profile_id = p.id);
  delete from auth.users u where u.id = any(v_people)
     and not exists (select 1 from admin_users a where a.profile_id = u.id)
     and not exists (select 1 from profiles pp where pp.id = u.id);
end $$;

comment on function fn_case_fixture_down() is
  'تنضيف بذرة القضايا بالأرقام بالظبط، وبحارس على أي صف عليه حساب لوحة. شبكة أمان — الاختبارات بترجع لوحدها.';
revoke execute on function fn_case_fixture_down() from public, anon, authenticated;


-- ===== بحث التلميحين الأولين — المصدر الواحد =====
-- ⚠ **دالة واحدة بينادوها `fn_case_build` و`fn_case_build_double`.** أول
--   نسخة من «العميلين» كتبت نفس الاستعلام تاني بإيدها، وفيه غلطة
--   (`source::uuid` وهي `answer:<uuid>`) — نسختين من نفس المنطق وواحدة
--   منهم غلط، الدرس الستاشر بالحرف.
create or replace function fn_case_pair_for(sess uuid, cand uuid,
                                            lo1 int, hi1 int, lo2 int, hi2 int)
returns table (a1 uuid, a2 uuid, c1 int, c2 int)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_s uuid;
begin
  select cs.sbota_id into v_s from case_sessions cs where cs.id = sess;
  if v_s is null then return; end if;

  return query
    select x1.option_id, x2.option_id, x1.c, xc.cc
      from (
        select a.question_id, a.option_id,
               (select count(*)::int from case_answers y
                 join case_players py on py.session_id = sess
                                     and py.profile_id = y.profile_id
                                     and py.role <> 'watcher'
                where y.sbota_id = v_s and y.option_id = a.option_id) c
          from case_answers a
          join case_questions q on q.id = a.question_id
         where a.sbota_id = v_s and a.profile_id = cand and q.kind = 'answer'
      ) x1
      join (
        select a.question_id, a.option_id
          from case_answers a
          join case_questions q on q.id = a.question_id
         where a.sbota_id = v_s and a.profile_id = cand and q.kind = 'answer'
      ) x2 on x2.question_id <> x1.question_id
      join lateral (
        select count(*)::int cc
          from case_players p
         where p.session_id = sess and p.role <> 'watcher'
           and exists (select 1 from case_answers a where a.sbota_id = v_s
                        and a.profile_id = p.profile_id and a.option_id = x1.option_id)
           and exists (select 1 from case_answers a where a.sbota_id = v_s
                        and a.profile_id = p.profile_id and a.option_id = x2.option_id)
      ) xc on true
     where x1.c between lo1 and hi1
       and xc.cc between lo2 and hi2
       and xc.cc < x1.c
     order by x1.c desc, xc.cc asc
     limit 1;
end $$;
comment on function fn_case_pair_for(uuid, uuid, int, int, int, int) is
  'إجابتين من إجابات المرشّح: الأولى بينطبق عليها lo1..hi1 والتقاطع lo2..hi2 وأضيق. المصدر الواحد للتلميحين.';
revoke execute on function fn_case_pair_for(uuid, uuid, int, int, int, int) from public, anon, authenticated;


-- ===== 🔴 توزيع الأدوار وحساب التلميحات =====
create or replace function fn_case_build(s_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_cs    case_sessions;
  v_case  cases;
  v_w     case_worlds;
  v_n     int;
  v_minp  int;
  v_qn    int;
  lo1 int; hi1 int; lo2 int; hi2 int;
  v_cand  uuid;
  v_found boolean := false;
  v_a1o   uuid; v_a2o uuid; v_c1 int; v_c2 int;
  v_names text[] := array['النسر','الصقر','الثعلب','الذيب','الباشق','الكوبرا','النمر','الغزال','العقاب','الضبع','الفهد','البومة'];
  v_i     int := 0;
  v_rec   record;
begin
  -- 🔴 **`auth.uid()` فاضية مش «مرفوض» لوحدها.** `v_uid = fn_case_host(...)`
  -- بترجّع `null` مش `false` لما `v_uid` فاضية، و`if not (null)` ما بيتنفّذش —
  -- فالحارس بيعدّي بالصمت. نفس الغلطة اللي فتحت `fn_reveal` للنت كله في
  -- `0062` (CLAUDE.md §٥.٣). فالفحص صريح وقبل أي حاجة.
  if v_uid is null then raise exception 'مش مسجّل'; end if;
  if not fn_case_can_host(s_id) then raise exception 'الخروجة دي مفيهاش قضية'; end if;
  if not (v_uid = fn_case_host(s_id) or fn_has_permission('cases.edit')) then
    raise exception 'صاحب الخروجة بس';
  end if;

  select * into v_cs from case_sessions where sbota_id = s_id;
  if not found then raise exception 'القضية مش مفتوحة لسه'; end if;
  if v_cs.built_at is not null then return true; end if;

  select * into v_case from cases       where id   = v_cs.case_id;
  select * into v_w    from case_worlds where slug = v_case.world_slug;
  select case_min_players, case_questions_count into v_minp, v_qn from settings limit 1;

  select count(*) into v_n from case_players
   where session_id = v_cs.id and role <> 'watcher';

  -- ⚠ «الخزنة» مفيهاش متهم — بتتبني في `0135`. هنا بنوقفها صريح علشان
  --   ما تبدأش بمتهم غلط.
  if v_case.shape = 'vault' then
    raise exception 'الخزنة بتتفتح من fn_case_build_vault';
  end if;

  if v_n < greatest(coalesce(v_minp, 5), v_case.min_players) then
    raise exception 'المجموعة أقل من اللازم للقضية دي — جرّبوا «الخزنة»';
  end if;

  -- النطاقات: في مجموعة ٦ → الأول ٣ أو ٤، والتاني ٢ أو ٣
  lo1 := greatest(2, ceil(v_n / 2.0)::int);
  hi1 := ceil(v_n / 2.0)::int + 1;
  lo2 := 2;
  hi2 := greatest(2, ceil(v_n / 3.0)::int + 1);

  -- ⚠ المرشّحين = **اللي جاوبوا كل الأسئلة بس**. اللي ماجاوبش ماينفعش
  --   يبقى هو المتهم (برومبت المالك) — من غير إجاباته مفيش تلميحات.
  for v_cand in
    select p.profile_id
      from case_players p
     where p.session_id = v_cs.id and p.role <> 'watcher'
       and (select count(*) from case_answers a
             join case_questions q on q.id = a.question_id
            where a.sbota_id = s_id and a.profile_id = p.profile_id
              and q.kind = 'answer') >= coalesce(v_qn, 12)
     order by md5(v_cs.id::text || p.profile_id::text)
  loop
    -- التلميحين الأولين من إجابتين مختلفتين للمرشّح ده — من المصدر الواحد
    select p.a1, p.a2, p.c1, p.c2 into v_a1o, v_a2o, v_c1, v_c2
      from fn_case_pair_for(v_cs.id, v_cand, lo1, hi1, lo2, hi2) p;

    if v_a1o is null then continue; end if;

    -- نثبّت التلميحين مؤقتًا علشان `fn_case_clue3_for` تحسب الدايرة الضيقة
    insert into case_clues (session_id, act, slot, for_suspect, text_ar, applies_to, source)
    select v_cs.id, 1, 1, v_cand, o.clue_ar, v_c1, 'answer:' || v_a1o::text
      from case_options o where o.id = v_a1o
    on conflict (session_id, act, slot) do update
      set text_ar = excluded.text_ar, applies_to = excluded.applies_to,
          source = excluded.source, for_suspect = excluded.for_suspect;

    insert into case_clues (session_id, act, slot, for_suspect, text_ar, applies_to, source)
    select v_cs.id, 2, 1, v_cand, o.clue_ar, v_c2, 'answer:' || v_a2o::text
      from case_options o where o.id = v_a2o
    on conflict (session_id, act, slot) do update
      set text_ar = excluded.text_ar, applies_to = excluded.applies_to,
          source = excluded.source, for_suspect = excluded.for_suspect;

    -- 🔴 **فيه تلميح تالت ممكن؟** لو لأ، نجرّب متهم تاني.
    select * into v_rec from fn_case_clue3_for(v_cs.id, v_cand) limit 1;
    if v_rec.src is not null then
      v_found := true;
      exit;
    end if;
    v_a1o := null; v_a2o := null;
  end loop;

  if not v_found then
    delete from case_clues where session_id = v_cs.id;
    raise exception 'مفيش تلميحات بتفرّق حد عن الباقي — جاوبوا الأسئلة الأول أو جرّبوا «الخزنة»';
  end if;

  update case_players set role = 'detective'
   where session_id = v_cs.id and role <> 'watcher';
  update case_players set role = 'suspect'
   where session_id = v_cs.id and profile_id = v_cand;

  -- المهمة السرية — من عالم القضية أو من المشترك
  update case_players set mission_id = (
    select ms.id from case_missions ms
     where ms.is_active and (ms.world_slug is null or ms.world_slug = v_case.world_slug)
     order by md5(v_cs.id::text || ms.id::text)
     limit 1)
   where session_id = v_cs.id and profile_id = v_cand;

  -- الأسماء الحركية — عالم «المهمة» بس
  if v_w.codenames then
    for v_rec in
      select profile_id from case_players
       where session_id = v_cs.id and role <> 'watcher'
       order by md5(v_cs.id::text || profile_id::text)
    loop
      v_i := v_i + 1;
      update case_players set codename_ar = v_names[((v_i - 1) % array_length(v_names,1)) + 1]
       where session_id = v_cs.id and profile_id = v_rec.profile_id;
    end loop;
  end if;

  update case_sessions
     set built_at = now(), act = 'act1', act_started_at = now()
   where id = v_cs.id;
  return true;
end $$;
comment on function fn_case_build(uuid) is
  '🔴 بيختار المتهم **جوه القاعدة** ويحسب التلميحين الأولين، وبيتأكد إن فيه تلميح تالت ممكن — وإلا بيختار متهم تاني. صاحب الخروجة أو cases.edit بس.';
revoke execute on function fn_case_build(uuid) from public, anon;
grant  execute on function fn_case_build(uuid) to authenticated;


-- ===== نقل الفصول =====
create or replace function fn_case_next_act(s_id uuid)
returns case_act_t
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_cs   case_sessions;
  v_w    case_worlds;
  v_next case_act_t;
  v_sus  uuid;
  v_rec  record;
begin
  -- 🔴 **`auth.uid()` فاضية مش «مرفوض» لوحدها.** `v_uid = fn_case_host(...)`
  -- بترجّع `null` مش `false` لما `v_uid` فاضية، و`if not (null)` ما بيتنفّذش —
  -- فالحارس بيعدّي بالصمت. نفس الغلطة اللي فتحت `fn_reveal` للنت كله في
  -- `0062` (CLAUDE.md §٥.٣). فالفحص صريح وقبل أي حاجة.
  if v_uid is null then raise exception 'مش مسجّل'; end if;
  if not (v_uid = fn_case_host(s_id) or fn_has_permission('cases.edit')) then
    raise exception 'صاحب الخروجة بس هو اللي بينقل الفصل';
  end if;

  select * into v_cs from case_sessions where sbota_id = s_id;
  if not found then raise exception 'القضية مش مفتوحة لسه'; end if;

  select w.* into v_w from cases c join case_worlds w on w.slug = c.world_slug where c.id = v_cs.case_id;

  v_next := case v_cs.act
              when 'setup'  then 'arrive'
              when 'arrive' then 'act1'
              when 'act1'   then 'break1'
              when 'break1' then (case when v_w.has_act2_event then 'act2'::case_act_t else 'final'::case_act_t end)
              when 'act2'   then 'break2'
              when 'break2' then 'final'
              when 'final'  then 'done'
              else 'done'
            end;

  -- 🔴 التلميح التالت بيتحسب **لما نوصل للفصل الأخير** — ساعتها بس نتيجة
  --    النشاط بتبقى موجودة. وبنفس الدالة اللي `fn_case_build` اتأكدت بيها.
  if v_next = 'final' then
    select profile_id into v_sus from case_players
     where session_id = v_cs.id and role = 'suspect' limit 1;
    if v_sus is not null then
      select * into v_rec from fn_case_clue3_for(v_cs.id, v_sus) limit 1;
      if v_rec.src is not null then
        insert into case_clues (session_id, act, slot, for_suspect, text_ar, applies_to, source)
        values (v_cs.id, 3, 1, v_sus, v_rec.txt, v_rec.n_applies, v_rec.src)
        on conflict (session_id, act, slot) do update
          set text_ar = excluded.text_ar, applies_to = excluded.applies_to,
              source = excluded.source, for_suspect = excluded.for_suspect;
      end if;
    end if;
  end if;

  update case_sessions set act = v_next, act_started_at = now() where id = v_cs.id;
  return v_next;
end $$;
comment on function fn_case_next_act(uuid) is
  'صاحب الخروجة بينقل الفصل. «مين عملها؟» بيعدّي الفصل التاني (مفيهوش حدث). والتلميح التالت بيتحسب عند الفصل الأخير.';
revoke execute on function fn_case_next_act(uuid) from public, anon;
grant  execute on function fn_case_next_act(uuid) to authenticated;


-- ===== نتيجة النشاط =====
create or replace function fn_case_set_losers(s_id uuid, p_losers uuid[])
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sid uuid;
begin
  -- 🔴 **`auth.uid()` فاضية مش «مرفوض» لوحدها.** `v_uid = fn_case_host(...)`
  -- بترجّع `null` مش `false` لما `v_uid` فاضية، و`if not (null)` ما بيتنفّذش —
  -- فالحارس بيعدّي بالصمت. نفس الغلطة اللي فتحت `fn_reveal` للنت كله في
  -- `0062` (CLAUDE.md §٥.٣). فالفحص صريح وقبل أي حاجة.
  if v_uid is null then raise exception 'مش مسجّل'; end if;
  if not (v_uid = fn_case_host(s_id) or fn_has_permission('cases.edit')) then
    raise exception 'صاحب الخروجة بس';
  end if;
  select id into v_sid from case_sessions where sbota_id = s_id;
  if v_sid is null then raise exception 'القضية مش مفتوحة لسه'; end if;

  -- بس اللي فعلًا لاعبين في الجلسة دي
  update case_sessions set losers = coalesce((
    select array_agg(p.profile_id) from case_players p
     where p.session_id = v_sid and p.role <> 'watcher'
       and p.profile_id = any(coalesce(p_losers, '{}'::uuid[]))), '{}'::uuid[])
   where id = v_sid;
  return true;
end $$;
comment on function fn_case_set_losers(uuid, uuid[]) is
  'مين كسب الجيم؟ — صاحب الخروجة بدوسة واحدة. بيتجاهل أي حد مش لاعب في الجلسة.';
revoke execute on function fn_case_set_losers(uuid, uuid[]) from public, anon;
grant  execute on function fn_case_set_losers(uuid, uuid[]) to authenticated;


-- ===== 🔴 التلميحات المفتوحة بس =====
create or replace function fn_case_clues(s_id uuid)
returns table (act int, slot int, text_ar text, applies_to int)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cs  case_sessions;
  v_max int;
begin
  if not fn_case_player_ok(s_id, v_uid) then return; end if;
  select * into v_cs from case_sessions where sbota_id = s_id;
  if not found or v_cs.built_at is null then return; end if;

  -- 🔴 كل فصل بيفتح تلميحه **وبس**. التلميح التالت في المتصفح وإحنا في
  --    الفصل الأول = اللعبة خلصت قبل ما تبدأ.
  v_max := case v_cs.act
             when 'act1'   then 1 when 'break1' then 1
             when 'act2'   then 2 when 'break2' then 2
             when 'final'  then 3 when 'done'   then 3
             else 0
           end;
  if v_max = 0 then return; end if;

  return query
    select cl.act, cl.slot, cl.text_ar, cl.applies_to
      from case_clues cl
     where cl.session_id = v_cs.id and cl.act <= v_max
     order by cl.act, cl.slot;
end $$;
comment on function fn_case_clues(uuid) is
  '🔴 التلميحات المفتوحة لحد الفصل الحالي بس. مفيش سياسة قراية على الجدول — ده الباب الوحيد.';
revoke execute on function fn_case_clues(uuid) from public, anon;
grant  execute on function fn_case_clues(uuid) to authenticated;


-- ============================================================================
-- الاختبار
--
-- ⚠ محتاج مجموعة حقيقية من ٦ بإجابات علشان الحسبة تتفحص فعلًا. البذرة
--   العامة فيها ٣ حجوزات بس، فالاختبار بيعمل مجموعته بنفسه — كلها باسم
--   `[اختبار] …` علشان ما تبعتش للمالك على تليجرام (0122)، وكل الكتابة
--   بترجع باستثناء متعمّد في الآخر.
--
-- ⚠ والأهم: الاختبار بيتأكد إن **التلميحات بتنطبق على المتهم** — مش إنها
--   اتخزّنت. تلميح محفوظ وغلط أسوأ من تلميح ناقص.
-- ============================================================================
-- ============================================================================
-- بذرة اختبار القضايا — مجموعة من ٦ بإجابات مظبوطة
--
-- ⚠ **دالة واحدة بينادوها كل اختبارات القضايا** (`0133` و`0134` و`0135`).
--   البذرة العامة (`0090`) فيها ٣ حجوزات بس، والحسبة محتاجة ٦. ولو كل
--   اختبار عمل بذرته بإيده، النسخ بتفترق أول ما حاجة تتغيّر — الدرس الستاشر.
--
-- ⚠ كل الأسامي `[اختبار] …` علشان الإشعارات ما تبعتش للمالك (`0122`
--   `fn_alert_is_fixture`)، والمنادي لازم يلفها في معاملة بترجع.
--
-- الإجابات مظبوطة علشان الحسبة يكون لها حل في مجموعة ٦:
--   السؤال ١: ١-٣ اختيار أ · ٤-٦ اختيار ب     → بينطبق على ٣
--   السؤال ٢: ١،٢،٤ اختيار أ · ٣،٥،٦ اختيار ب → التقاطع {١،٢} = ٢
--   الباقي: الكل نفس الإجابة (٦) — بره النطاق فما بيتختارش تلميح
--   اللبس: اللاعب ١ غامق والباقي فاتح → التلميح التالت بيوصل لواحد
-- ============================================================================
create or replace function fn_case_fixture_up(p_case_slug text default 'meen-kal-elmahshi',
                                             p_players int default 6)
returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
declare
  -- ⚠ **سبوطة لكل حجم مجموعة.** أول نسخة كانت بتعيد استعمال نفس السبوطة،
  --   فالنوع اللي اتحدّد في أول نداء بيفضل، والنداء الأكبر بيزوّد نوع
  --   واحد لحد ما حارس التوازن (`0119`) يرفض. وكمان كان بيسيب حجوزات
  --   النداء الأكبر في النداء الأصغر، فـ«مجموعة ٤» تطلع ٨.
  v_s    uuid;
  v_tpl  uuid := '66666666-0000-0000-0000-000000000004';
  v_ven  uuid := '55555555-0000-0000-0000-000000000004';
  v_case uuid;
  v_sess uuid;
  v_q    uuid[];
  pid    uuid;
  v_np   int := greatest(coalesce(p_players, 6), 3);
  i int; k int;
begin
  if not exists (select 1 from sbota_templates where id = v_tpl) then
    return null;   -- محتاج fn_test_seed_up()
  end if;
  v_s := ('cccccccc-9999-0000-' || lpad(v_np::text, 4, '0') || '-000000000001')::uuid;

  update feature_flags set is_on = true where key = 'cases';
  select id into v_case from cases where slug = p_case_slug;
  if v_case is null then return null; end if;

  -- نص ولاد ونص بنات (حارس التوازن `0119` نصيبه ceil(السعة/2) لكل نوع)
  -- ⚠ `profiles.id` مربوط بـ`auth.users`، فالمستخدم لازم يتعمل الأول —
  --   نفس شكل `seed_person` في `0013` بالظبط.
  for i in 1 .. v_np loop
    pid := ('cccccccc-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid;
    insert into auth.users (
      instance_id, id, aud, role, phone, phone_confirmed_at,
      encrypted_password, created_at, updated_at,
      raw_app_meta_data, raw_user_meta_data, is_sso_user
    ) values (
      '00000000-0000-0000-0000-000000000000', pid, 'authenticated', 'authenticated',
      '+201000009' || lpad(i::text, 2, '0'), now(), '', now(), now(),
      '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb, false
    ) on conflict (id) do nothing;

    insert into profiles (id, first_name, gender, area, role)
    values (pid, '[اختبار] لاعب ' || i,
            -- ⚠ بالتبادل مش «النص الأول ولاد»: كده أي عدد لاعبين يطلع
            --   متوازن، والنوع بيفضل ثابت لنفس اللاعب في كل الأحجام.
            (case when i % 2 = 1 then 'male' else 'female' end)::gender_t, 'maadi', 'member')
    on conflict (id) do nothing;
  end loop;

  insert into sbotat (id, template_id, venue_id, starts_at, ends_at, price, org_fee,
                      capacity, status, origin, reveal_at, case_id)
  values (v_s, v_tpl, v_ven, now() + interval '2 hours', now() + interval '5 hours',
          15000, 4000, greatest(v_np, 8), 'open', 'nasbot', now() - interval '1 hour', v_case)
  on conflict (id) do update
     set case_id = v_case, reveal_at = now() - interval '1 hour', origin = 'nasbot',
         status = 'open', capacity = greatest(v_np, 8);

  for i in 1 .. v_np loop
    insert into bookings (id, sbota_id, profile_id, status, price_paid)
    values (('cccccccc-1111-0000-' || lpad(v_np::text, 4, '0') || '-' || lpad(i::text, 12, '0'))::uuid, v_s,
            ('cccccccc-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid, 'paid', 15000)
    on conflict (id) do nothing;
  end loop;

  insert into case_sessions (sbota_id, case_id, entry_code, act)
  values (v_s, v_case, '4321', 'arrive')
  on conflict (sbota_id) do update
     set case_id = v_case, act = 'arrive', built_at = null, ended_at = null, outcome = null
  returning id into v_sess;
  if v_sess is null then select id into v_sess from case_sessions where sbota_id = v_s; end if;

  delete from case_clues where session_id = v_sess;
  for i in 1 .. v_np loop
    insert into case_players (session_id, profile_id, role, arrive_order)
    values (v_sess, ('cccccccc-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid, 'detective', i)
    on conflict (session_id, profile_id) do update
       set arrive_order = excluded.arrive_order, role = 'detective',
           mission_id = null, codename_ar = null, mission_done = null;
  end loop;

  -- الـ١٢ سؤال بتوع الخروجة دي، بنفس ترتيب الـmd5 اللي الدوال بتستعمله
  select array_agg(d.id order by d.ord) into v_q from (
    select q.id, row_number() over (order by md5(v_s::text || q.id::text)) ord
      from case_questions q where q.is_active and q.kind = 'answer'
      order by md5(v_s::text || q.id::text)
      limit (select coalesce(case_questions_count, 12) from settings limit 1)) d;

  -- ⚠ **تلات أسئلة = تلات بتّات**، فكل لاعب كود مميّز لوحده. من غير كده
  --   «العميلين» (٨ لاعبين) ممكن ما تلاقيش اتنين تلميحاتهم بتفرّقهم،
  --   والاختبار يبقى بيقع مرة ويعدّي مرة. البتّات:
  --     السؤال ١: النص الأول اختيار أ          → بينطبق على نص المجموعة
  --     السؤال ٢: كل اتنين بالتبادل            → التقاطع بيضيّق
  --     السؤال ٣: الفردي/الزوجي                → بيكمّل الكود المميّز
  --   والباقي: الكل نفس الإجابة (بره النطاق فما بيتختارش تلميح).
  for i in 1 .. v_np loop
    pid := ('cccccccc-0000-0000-0000-0000000000' || lpad(i::text, 2, '0'))::uuid;
    for k in 1 .. array_length(v_q, 1) loop
      insert into case_answers (sbota_id, profile_id, question_id, option_id)
      select v_s, pid, v_q[k], o.id from case_options o
       where o.question_id = v_q[k]
       order by o.sort
       offset (case
                 when k = 1 then (case when i <= ceil(v_np / 2.0) then 0 else 1 end)
                 when k = 2 then (case when ((i - 1) % 4) < 2 then 0 else 1 end)
                 when k = 3 then (i % 2)
                 else 0
               end)
       limit 1
      on conflict (sbota_id, profile_id, question_id) do update set option_id = excluded.option_id;
    end loop;
    -- اللبس: اللاعب ١ غامق واللاعب ٢ ملوّن والباقي فاتح — فالتلميح التالت
    -- بيوصل لواحد للاتنين دول على الأقل، والباقي بترتيب الوصول.
    insert into case_answers (sbota_id, profile_id, question_id, option_id)
    select v_s, pid, q.id, o.id
      from case_questions q join case_options o on o.question_id = q.id
     where q.slug = 'outfit'
       and o.value = (case i when 1 then 'dark' when 2 then 'colorful' else 'light' end)
    on conflict (sbota_id, profile_id, question_id) do update set option_id = excluded.option_id;
  end loop;

  return v_s;
end $$;

comment on function fn_case_fixture_up(text, int) is
  'بذرة اختبار القضايا: ٦ لاعبين بإجابات مظبوطة على سبوطة نسبوط. المنادي لازم يلفها في معاملة بترجع. المصدر الواحد لكل اختبارات القضايا.';
revoke execute on function fn_case_fixture_up(text, int) from public, anon, authenticated;


create or replace function test_case_clues()
returns table (test text, result text)
language plpgsql
set search_path = public, auth
as $body$
declare
  -- ⚠ النتايج في **متغيّرات بأسامي**، مش مصفوفة بالترتيب. أول نسخة كانت
  --   بتعمل `r := r || …` بالترتيب، وأول ما اتزحلق فحص واحد مكانه، كل
  --   الصفوف اللي بعده طلعت بأسامي غلط — «فشل» على فحص سليم والعكس.
  t_roles text; t_c1 text; t_c2 text; t_apply text; t_hidden text;
  t_c3 text; t_c3src text; t_c3one text; t_watch text;
  t_nobuild text; t_nonext text; t_noans text; t_unans text; t_skip text; t_noanon text;
  v_s    uuid;
  v_sess uuid;
  v_tpl  uuid := '66666666-0000-0000-0000-000000000004';
  pid    uuid;
  v_sus  uuid;
  v_p1   uuid := 'cccccccc-0000-0000-0000-000000000001';  -- lpad(1) = '01' → ...0001
  v_q    uuid[];
  v_n    int;
  v_c1   int; v_c2 int; v_c3 int;
  v_src  text;
  v_host uuid;
  v_other uuid;
  v_act  case_act_t;
  i      int; k int;
begin
  if not exists (select 1 from sbota_templates where id = v_tpl) then
    test := '0133 · التلميحات'; result := 'معلومة — محتاج البذرة المؤقتة (fn_test_seed_up)';
    return next; return;
  end if;

  begin
    -- البذرة من المصدر الواحد — «مين كل المحشي؟» من عالم «مين عملها؟»
    -- (مفيهوش حدث فصل تاني، فبيتفحص الفصل المعدّي كمان)
    v_s := fn_case_fixture_up('meen-kal-elmahshi');
    if v_s is null then
      test := '0133 · التلميحات'; result := 'معلومة — محتاج البذرة المؤقتة (fn_test_seed_up)';
      return next; return;
    end if;
    select id into v_sess from case_sessions where sbota_id = v_s;
    select array_agg(d.id order by d.ord) into v_q from (
      select q.id, row_number() over (order by md5(v_s::text || q.id::text)) ord
        from case_questions q where q.is_active and q.kind = 'answer'
        order by md5(v_s::text || q.id::text)
        limit (select coalesce(case_questions_count, 12) from settings limit 1)) d;

    v_host := fn_case_host(v_s);

    -- ===== (١٢) مجموعة من غير إجابات: الأدوار لازم **ترفض** =====
    -- 🔴 من غير الفحص ده اللعبة ممكن تبدأ وهي مش قابلة للحل.
    delete from case_answers where sbota_id = v_s;
    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_host), true);
    begin
      perform fn_case_build(v_s);
      t_noans := 'فشل — 🔴 الأدوار اتوزّعت ومفيش ولا إجابة';
    exception when others then t_noans := 'نجح';
    end;
    reset role; perform set_config('request.jwt.claims', '', true);

    -- ===== نرجّع الإجابات =====
    perform fn_case_fixture_up('meen-kal-elmahshi');

    -- إجابات مظبوطة علشان الحسبة يكون لها حل:
    --   السؤال ١: ١-٣ اختيار أ · ٤-٦ اختيار ب   → بينطبق على ٣
    --   السؤال ٢: ١،٢،٤ اختيار أ · ٣،٥،٦ اختيار ب → التقاطع {١،٢} = ٢
    --   الباقي: الكل نفس الإجابة (٦) — بره النطاق فما بيتختارش تلميح
    --   اللبس: اللاعب ١ غامق والباقي فاتح → التلميح التالت بيوصل لواحد
    for i in 1 .. 6 loop
      pid := ('cccccccc-0000-0000-0000-00000000000' || i)::uuid;
      for k in 1 .. array_length(v_q, 1) loop
        insert into case_answers (sbota_id, profile_id, question_id, option_id)
        select v_s, pid, v_q[k], o.id from case_options o
         where o.question_id = v_q[k]
         order by o.sort
         offset (case
                   when k = 1 then (case when i <= 3 then 0 else 1 end)
                   when k = 2 then (case when i in (1,2,4) then 0 else 1 end)
                   else 0
                 end)
         limit 1
        on conflict (sbota_id, profile_id, question_id) do update set option_id = excluded.option_id;
      end loop;
      insert into case_answers (sbota_id, profile_id, question_id, option_id)
      select v_s, pid, q.id, o.id
        from case_questions q join case_options o on o.question_id = q.id
       where q.slug = 'outfit' and o.value = (case when i = 1 then 'dark' else 'light' end)
      on conflict (sbota_id, profile_id, question_id) do update set option_id = excluded.option_id;
    end loop;

    -- ===== (١٠) حد مش صاحب الخروجة ما بيوزّعش =====
    -- ⚠ بنجيب اللاعب التاني **قبل** ما نلبس الدور: `case_players` مقفولة
    --   بـRLS، فلو قريناها كـ`authenticated` بترجّع فاضي والـclaims تتكتب
    --   بـ`sub` فاضية — واللي كشف إن الحارس نفسه كان بيعدّي المجهول.
    select p.profile_id into v_other
      from case_players p
     where p.session_id = v_sess and p.profile_id <> v_host
     limit 1;

    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_other), true);
    begin
      perform fn_case_build(v_s);
      t_nobuild := 'فشل — 🔴 حد تاني وزّع الأدوار';
    exception when others then t_nobuild := 'نجح';
    end;
    reset role; perform set_config('request.jwt.claims', '', true);

    -- ===== (١٥) 🔴 المجهول ما بيوزّعش الأدوار =====
    set local role anon;
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    begin
      perform fn_case_build(v_s);
      t_noanon := 'فشل — 🔴 المجهول وزّع الأدوار';
    exception when others then t_noanon := 'نجح';
    end;
    reset role; perform set_config('request.jwt.claims', '', true);

    -- ===== (١٣) اللي ماجاوبش ماينفعش يبقى هو المتهم =====
    delete from case_answers a using case_questions q
     where a.question_id = q.id and q.kind = 'answer'
       and a.sbota_id = v_s and a.profile_id = v_p1;
    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_host), true);
    begin
      perform fn_case_build(v_s);
      reset role; perform set_config('request.jwt.claims', '', true);
      select profile_id into v_sus from case_players where session_id = v_sess and role = 'suspect' limit 1;
      t_unans := case when v_sus is not null and v_sus <> v_p1 then 'نجح'
                      else 'فشل — 🔴 اللي ماجاوبش بقى هو المتهم' end;
    exception when others then
      reset role; perform set_config('request.jwt.claims', '', true);
      -- مرفوض برضه مقبول: المهم إنه ما يبقاش هو المتهم
      t_unans := 'نجح';
    end;

    -- نرجّع إجاباته ونصفّر الجلسة علشان السيناريو الأساسي
    update case_sessions set built_at = null, act = 'arrive' where id = v_sess;
    delete from case_clues where session_id = v_sess;
    update case_players set role = 'detective', mission_id = null, codename_ar = null
     where session_id = v_sess;
    for k in 1 .. array_length(v_q, 1) loop
      insert into case_answers (sbota_id, profile_id, question_id, option_id)
      select v_s, v_p1, v_q[k], o.id from case_options o
       where o.question_id = v_q[k] order by o.sort limit 1
      on conflict (sbota_id, profile_id, question_id) do update set option_id = excluded.option_id;
    end loop;

    -- ===== (١) التوزيع بهوية صاحب الخروجة =====
    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_host), true);
    perform fn_case_build(v_s);
    reset role; perform set_config('request.jwt.claims', '', true);

    select count(*) into v_n from case_players where session_id = v_sess and role = 'suspect';
    select profile_id into v_sus from case_players where session_id = v_sess and role = 'suspect' limit 1;
    t_roles := case when v_n = 1 then 'نجح' else format('فشل — %s متهم بدل 1', v_n) end;

    -- ===== (٢)(٣) النطاقات =====
    select applies_to into v_c1 from case_clues where session_id = v_sess and act = 1;
    select applies_to into v_c2 from case_clues where session_id = v_sess and act = 2;
    t_c1 := case when v_c1 between 3 and 4 then 'نجح'
                 else format('فشل — التلميح الأول بينطبق على %s', coalesce(v_c1::text,'null')) end;
    t_c2 := case when v_c2 between 2 and 3 and v_c2 < v_c1 then 'نجح'
                 else format('فشل — التاني %s والأول %s', coalesce(v_c2::text,'null'), coalesce(v_c1::text,'null')) end;

    -- ===== (٤) 🔴 التلميحين بينطبقوا على المتهم فعلًا =====
    select count(*) into v_n from case_clues cl
     where cl.session_id = v_sess and cl.act in (1,2)
       and exists (select 1 from case_answers a
                    where a.sbota_id = v_s and a.profile_id = v_sus
                      and a.option_id::text = split_part(cl.source, ':', 2));
    t_apply := case when v_n = 2 then 'نجح'
                    else format('فشل — 🔴 %s من 2 تلميح بينطبق على المتهم', v_n) end;

    -- ===== (٥) تلميح الفصل التالت مش ظاهر — بهوية لاعب =====
    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_sus), true);
    select count(*) into v_n from fn_case_clues(v_s);
    reset role; perform set_config('request.jwt.claims', '', true);
    t_hidden := case when v_n = 1 then 'نجح'
                     else format('فشل — 🔴 %s تلميح ظاهر في الفصل الأول', v_n) end;

    -- ===== (١١) نقل الفصل من حد تاني =====
    -- ⚠ **لاعب مضمون إنه مش صاحب الخروجة** — مش «المتهم». المتهم بيتختار
    --   من الإجابات، وممكن يطلع هو نفسه صاحب الخروجة (أقدم حجز مدفوع) —
    --   وساعتها الحارس بيعدّيه بحق والفاحص يقول «فشل» على كود سليم. ده
    --   حصل فعلًا أول ما الإجابات اتغيّرت (الدرس العشرين).
    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_other), true);
    begin
      perform fn_case_next_act(v_s);
      t_nonext := 'فشل — 🔴 لاعب عادي نقل الفصل';
    exception when others then t_nonext := 'نجح';
    end;
    reset role; perform set_config('request.jwt.claims', '', true);

    -- ===== (١٤) «مين عملها؟» بيعدّي الفصل التاني =====
    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_host), true);
    v_act := fn_case_next_act(v_s);   -- act1 → break1
    v_act := fn_case_next_act(v_s);   -- break1 → final (مفيش act2)
    reset role; perform set_config('request.jwt.claims', '', true);
    t_skip := case when v_act = 'final' then 'نجح'
                   else format('فشل — رجّع %s بدل final', coalesce(v_act::text,'null')) end;

    -- ===== (٦)(٧)(٨) التلميح التالت =====
    select cl.source, cl.applies_to into v_src, v_c3
      from case_clues cl where cl.session_id = v_sess and cl.act = 3;
    t_c3 := case when v_src is not null then 'نجح' else 'فشل — مفيش تلميح تالت في الفصل الأخير' end;
    t_c3src := case when v_src like 'outfit:%' or v_src like 'arrive_%' or v_src like 'activity_%'
                    then 'نجح' else format('فشل — 🔴 مصدره %s (ينفع يتكدب فيه)', coalesce(v_src,'null')) end;
    t_c3one := case when v_c3 = 1 then 'نجح'
                    else format('فشل — 🔴 بيوصل لـ%s مش واحد', coalesce(v_c3::text,'null')) end;

    -- ===== (٩) المتفرّج =====
    t_watch := case when (select count(*) from case_players
                           where session_id = v_sess and role = 'watcher' and mission_id is not null) = 0
                    then 'نجح' else 'فشل — متفرّج ماخد مهمة' end;

    raise exception 'test_case_clues_rollback';
  exception when others then
    reset role;
    perform set_config('request.jwt.claims', '', true);
    if sqlerrm <> 'test_case_clues_rollback' then
      test := '0133 · التلميحات'; result := 'فشل — استثناء: ' || sqlerrm;
      return next; return;
    end if;
  end;

  return query
    select * from (values
      ('0133 · توزيع الأدوار نجح ومتهم واحد بالظبط',                 t_roles),
      ('0133 · 🔴 التلميح الأول بينطبق على نص المجموعة (٣–٤ في ٦)',  t_c1),
      ('0133 · 🔴 التلميح التاني بيضيّق (٢–٣ وأقل من الأول)',         t_c2),
      ('0133 · 🔴 التلميحين بينطبقوا على المتهم فعلًا',               t_apply),
      ('0133 · 🔴 تلميح الفصل التالت مش ظاهر في الفصل الأول',        t_hidden),
      ('0133 · التلميح التالت بيظهر في الفصل الأخير',                t_c3),
      ('0133 · 🔴 التلميح التالت من حاجة ما تتكدبش فيها',            t_c3src),
      ('0133 · 🔴 التلميح التالت بيوصل لواحد بس',                    t_c3one),
      ('0133 · المتفرّج ماخدش دور',                                   t_watch),
      ('0133 · 🔴 حد مش صاحب الخروجة ما بيوزّعش الأدوار',             t_nobuild),
      ('0133 · 🔴 حد مش صاحب الخروجة ما بينقلش الفصل',               t_nonext),
      ('0133 · 🔴 مجموعة من غير إجابات: الأدوار بترفض',              t_noans),
      ('0133 · 🔴 اللي ماجاوبش ماينفعش يبقى هو المتهم',              t_unans),
      ('0133 · «مين عملها؟» بيعدّي الفصل التاني (مفيهوش حدث)',       t_skip),
      ('0133 · 🔴 المجهول ما بيوزّعش الأدوار (auth.uid() فاضية)',      t_noanon)
    ) as v(a, b);
end $body$;

comment on function test_case_clues() is
  '0133 — التلميحات بتضيّق الدايرة وبتنطبق على المتهم فعلًا، والتالت ما يتكدبش فيه وبيوصل لواحد، وكل فصل بيفتح تلميحه بس.';
revoke execute on function test_case_clues() from public, anon, authenticated;
