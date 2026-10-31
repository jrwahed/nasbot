-- ============================================================================
-- 0135 · «قضية الليلة» — «الخزنة» و«العميلين»
--
-- شكلين تانيين للقضية من برومبت المالك (٢٠٢٦-١٠-٣١):
--
-- **«الخزنة» (`vault`)** — من غير متهم خالص. الكل فريق واحد ومفيش حد
--   بيكدب. على الموقع خزنة بأربع أرقام وعداد، وكل رقم لغز عن المجموعة
--   نفسها — يعني مش هتفتحوها غير لما تعرفوا بعض. دي للسبوطات الهادية،
--   وللناس اللي أول مرة يجوا، **وللمجموعات أقل من ٥** (في أربعة المتهم
--   بيبان من أول تلميح).
--
-- **«العميلين» (`double`)** — لمجموعة ٨ أو أكتر. متهمين **عارفين بعض**
--   وممكن يغطّوا على بعض. الموقع بيبعت تلميحين في كل فصل، واحد لكل عميل.
--   والعملاء لازم يقفشوا **الاتنين** عشان يكسبوا.
--
-- ⚠ محتاج `0130`–`0134`. آمن يتكرر. مفيهوش `drop` ولا `delete`.
-- ============================================================================

-- ===== ألغاز الخزنة =====
-- ⚠ الألغاز في القاعدة مش في الكود — بتتعدّل من /admin/cases. كل لغز
--   بيتحسب من **إجابات المجموعة** (أو من إدخال صاحب الخروجة).
create table if not exists case_vault_riddles (
  key           text primary key,
  slot          int  not null,
  riddle_ar     text not null,
  -- أي سؤال من بنك الأسئلة، وأنهي اختيارات بتتعدّ. null = صاحب الخروجة بيدخّله
  question_slug text,
  option_values text[] not null default '{}',
  hint_ar       text,
  sort          int  not null default 0,
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now(),
  unique (slot),
  constraint cvr_slot_range check (slot between 1 and 6)
);
comment on table case_vault_riddles is
  'ألغاز الخزنة — كل رقم بيتحسب من إجابات المجموعة. اللي `question_slug` بتاعه فاضي، صاحب الخروجة بيدخّله.';

insert into case_vault_riddles (key, slot, riddle_ar, question_slug, option_values, hint_ar, sort) values
  ('early',  1, 'الرقم الأول = عدد اللي فيكم بيصحوا بدري',            'early-late', array['early'],          'الرقم الأول أكبر من صفر', 1),
  ('sing',   2, 'التاني = عدد اللي بيغنّوا في العربية',                'sing-car',   array['loud','secret'],  'الرقم التاني أكبر من ١',  2),
  ('games',  3, 'التالت = عدد الجيمات اللي الفريق الكسبان كسبها',      null,         '{}',                     'بصّوا على نتيجة الجيم',   3),
  ('first',  4, 'الرابع = عدد اللي أول مرة يعملوا النشاط ده',          'played',     array['no'],             'فيكم حد أول مرة؟',        4)
on conflict (key) do nothing;

alter table case_vault_riddles enable row level security;
do $$ begin
  if not exists (select 1 from pg_policies where tablename='case_vault_riddles' and policyname='cvr_admin_read') then
    create policy cvr_admin_read on case_vault_riddles for select using (fn_has_permission('cases.view'));
  end if;
  if not exists (select 1 from pg_policies where tablename='case_vault_riddles' and policyname='cvr_admin_write') then
    create policy cvr_admin_write on case_vault_riddles for all
      using (fn_has_permission('cases.edit')) with check (fn_has_permission('cases.edit'));
  end if;
end $$;
create or replace trigger t_cvr_updated before update on case_vault_riddles
  for each row execute function set_updated_at();

-- عدد الجيمات اللي الفريق الكسبان كسبها — صاحب الخروجة بيدخّله
alter table case_sessions add column if not exists games_won int;
comment on column case_sessions.games_won is
  'عدد الجيمات اللي الفريق الكسبان كسبها — لغز الخزنة التالت، وصاحب الخروجة بيدخّله.';

-- ⚠ `vault_code` بقى **أرقام مفصولة بفاصلة** مش ٤ خانات، لأن أي لغز ممكن
--   يطلّع رقم من خانتين في مجموعة كبيرة. ٤ خانات كانت هتخلّي اللغز يكدب.
comment on column case_sessions.vault_code is
  'حل الخزنة — أرقام مفصولة بفاصلة (مثلًا 3,4,2,1). مش ٤ خانات: اللغز ممكن يطلّع رقم من خانتين.';


-- ===== حساب حل الخزنة =====
create or replace function fn_case_vault_solution(sess uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_s   uuid;
  v_g   int;
  v_out text := '';
  v_n   int;
  v_r   record;
begin
  select cs.sbota_id, cs.games_won into v_s, v_g from case_sessions cs where cs.id = sess;
  if v_s is null then return null; end if;

  for v_r in
    select * from case_vault_riddles where is_active order by slot
  loop
    if v_r.question_slug is null then
      v_n := coalesce(v_g, 0);
    else
      select count(*)::int into v_n
        from case_answers a
        join case_questions q on q.id = a.question_id
        join case_options  o on o.id = a.option_id
        join case_players  p on p.session_id = sess and p.profile_id = a.profile_id and p.role <> 'watcher'
       where a.sbota_id = v_s
         and q.slug = v_r.question_slug
         and o.value = any(v_r.option_values);
    end if;
    v_out := v_out || case when v_out = '' then '' else ',' end || v_n::text;
  end loop;
  return nullif(v_out, '');
end $$;
comment on function fn_case_vault_solution(uuid) is
  'حل الخزنة من إجابات المجموعة. المتفرّج مش بيتعدّ — هو مش في اللعبة.';
revoke execute on function fn_case_vault_solution(uuid) from public, anon, authenticated;


create or replace function fn_case_build_vault(s_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cs  case_sessions;
  v_sh  case_shape_t;
begin
  if v_uid is null then raise exception 'مش مسجّل'; end if;
  if not fn_case_can_host(s_id) then raise exception 'الخروجة دي مفيهاش قضية'; end if;
  if not (v_uid = fn_case_host(s_id) or fn_has_permission('cases.edit')) then
    raise exception 'صاحب الخروجة بس';
  end if;

  select * into v_cs from case_sessions where sbota_id = s_id;
  if not found then raise exception 'القضية مش مفتوحة لسه'; end if;
  if v_cs.built_at is not null then return true; end if;

  select c.shape into v_sh from cases c where c.id = v_cs.case_id;
  if v_sh <> 'vault' then raise exception 'القضية دي فيها متهم — استعمل fn_case_build'; end if;

  -- 🔴 مفيش متهم. الكل فريق واحد ومفيش حد بيكدب.
  update case_players set role = 'detective', mission_id = null
   where session_id = v_cs.id and role <> 'watcher';

  update case_sessions
     set vault_code = fn_case_vault_solution(v_cs.id),
         built_at = now(), act = 'act1', act_started_at = now()
   where id = v_cs.id;
  return true;
end $$;
comment on function fn_case_build_vault(uuid) is
  '«الخزنة» — بتفتح الجلسة من غير متهم وبتحسب الحل من إجابات المجموعة. صاحب الخروجة أو cases.edit بس.';
revoke execute on function fn_case_build_vault(uuid) from public, anon;
grant  execute on function fn_case_build_vault(uuid) to authenticated;


create or replace function fn_case_set_games(s_id uuid, p_n int)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sid uuid;
begin
  if v_uid is null then raise exception 'مش مسجّل'; end if;
  if not (v_uid = fn_case_host(s_id) or fn_has_permission('cases.edit')) then
    raise exception 'صاحب الخروجة بس';
  end if;
  if coalesce(p_n, -1) < 0 or p_n > 99 then raise exception 'رقم مش منطقي'; end if;

  select id into v_sid from case_sessions where sbota_id = s_id;
  if v_sid is null then raise exception 'القضية مش مفتوحة لسه'; end if;

  update case_sessions set games_won = p_n where id = v_sid;
  -- الحل بيتحسب تاني — اللغز التالت بيعتمد على الرقم ده
  update case_sessions set vault_code = fn_case_vault_solution(v_sid)
   where id = v_sid and built_at is not null;
  return true;
end $$;
comment on function fn_case_set_games(uuid, int) is
  'مين كسب الجيم؟ — صاحب الخروجة بدوسة واحدة. بيعيد حساب حل الخزنة لو اللعبة بدأت.';
revoke execute on function fn_case_set_games(uuid, int) from public, anon;
grant  execute on function fn_case_set_games(uuid, int) to authenticated;


-- ===== 🔴 الخزنة للاعب — الألغاز من غير الحل =====
create or replace function fn_case_vault(s_id uuid)
returns table (slot int, riddle_ar text, hint_ar text, hint_open boolean, solved boolean, tries int)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cs  case_sessions;
  v_min int;
begin
  if not fn_case_player_ok(s_id, v_uid) then return; end if;
  select * into v_cs from case_sessions where sbota_id = s_id;
  if not found or v_cs.built_at is null then return; end if;

  select case_hint_after_min into v_min from settings limit 1;

  return query
    select rd.slot, rd.riddle_ar,
           -- 🔴 الهنت بيتفتح بالوقت بس. لو بعتناه من الأول، مفيش لغز.
           case when now() >= v_cs.act_started_at + make_interval(mins => coalesce(v_min, 10))
                then rd.hint_ar else null end,
           now() >= v_cs.act_started_at + make_interval(mins => coalesce(v_min, 10)),
           v_cs.outcome = 'vault_open',
           coalesce((select rh.hits from rate_hits rh
                      where rh.bucket = 'case_vault:' || v_cs.id::text), 0)
      from case_vault_riddles rd
     where rd.is_active
     order by rd.slot;
end $$;
comment on function fn_case_vault(uuid) is
  '🔴 ألغاز الخزنة — **من غير الحل**. والهنت بيتفتح بعد settings.case_hint_after_min بس.';
revoke execute on function fn_case_vault(uuid) from public, anon;
grant  execute on function fn_case_vault(uuid) to authenticated;


create or replace function fn_case_vault_try(s_id uuid, p_digits int[])
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cs  case_sessions;
  v_try text;
  v_lim int;
begin
  if v_uid is null then raise exception 'مش مسجّل'; end if;
  if not fn_case_player_ok(s_id, v_uid) then raise exception 'مش من حقك'; end if;

  select * into v_cs from case_sessions where sbota_id = s_id;
  if not found or v_cs.built_at is null then raise exception 'الخزنة مابدأتش'; end if;
  if v_cs.ended_at is not null then raise exception 'القضية خلصت'; end if;

  -- محدود بعدد محاولات — بنفس عدّاد `0070` (الدرس الستاشر: ما نكتبش عدّاد تاني)
  select case_code_attempts into v_lim from settings limit 1;
  if not fn_rate_hit('case_vault:' || v_cs.id::text, coalesce(v_lim, 10) * 3, 3600) then
    raise exception 'جرّبتوا كتير. استنوا شوية';
  end if;

  select string_agg(d::text, ',' order by ord) into v_try
    from unnest(coalesce(p_digits, '{}'::int[])) with ordinality as t(d, ord);

  if v_try is not distinct from v_cs.vault_code then
    update case_sessions set outcome = 'vault_open', ended_at = now(),
                             act = 'done', act_started_at = now()
     where id = v_cs.id;
    return true;
  end if;
  return false;
end $$;
comment on function fn_case_vault_try(uuid, int[]) is
  'محاولة فتح الخزنة. بترجّع true/false — ومش بتقول أنهي رقم غلط (ده هو اللغز).';
revoke execute on function fn_case_vault_try(uuid, int[]) from public, anon;
grant  execute on function fn_case_vault_try(uuid, int[]) to authenticated;


create or replace function fn_case_vault_close(s_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cs  case_sessions;
begin
  if v_uid is null then raise exception 'مش مسجّل'; end if;
  if not (v_uid = fn_case_host(s_id) or fn_has_permission('cases.edit')) then
    raise exception 'صاحب الخروجة بس';
  end if;
  select * into v_cs from case_sessions where sbota_id = s_id;
  if not found then raise exception 'القضية مش مفتوحة لسه'; end if;
  if v_cs.ended_at is not null then return v_cs.outcome; end if;

  update case_sessions set outcome = 'vault_shut', ended_at = now(),
                           act = 'done', act_started_at = now()
   where id = v_cs.id;
  return 'vault_shut';
end $$;
comment on function fn_case_vault_close(uuid) is
  'العداد خلص والخزنة لسه مقفولة. صاحب الخروجة بس.';
revoke execute on function fn_case_vault_close(uuid) from public, anon;
grant  execute on function fn_case_vault_close(uuid) to authenticated;


-- ============================================================================
-- «العميلين» — متهمين عارفين بعض
-- ============================================================================
create or replace function fn_case_build_double(s_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_cs   case_sessions;
  v_case cases;
  v_w    case_worlds;
  v_n    int;
  v_qn   int;
  v_slot int := 0;
  v_cand uuid;
  v_a1o  uuid; v_a2o uuid; v_c1 int; v_c2 int;
  v_ok   int := 0;
  v_rec  record;
  v_names text[] := array['النسر','الصقر','الثعلب','الذيب','الباشق','الكوبرا','النمر','الغزال','العقاب','الضبع','الفهد','البومة'];
  v_i    int := 0;
begin
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
  if v_case.shape <> 'double' then raise exception 'القضية دي مش «العميلين»'; end if;

  select count(*) into v_n from case_players where session_id = v_cs.id and role <> 'watcher';
  if v_n < v_case.min_players then
    raise exception 'المجموعة أقل من % — «العميلين» لمجموعة ٨ أو أكتر', v_case.min_players;
  end if;

  select case_questions_count into v_qn from settings limit 1;

  -- عميلين، كل واحد له خانة تلميحات لوحده. بنمشي على المرشّحين ونختار
  -- أول اتنين ليهم تلميحات بتفرّقهم — بنفس حسبة `fn_case_build` بالظبط
  -- عن طريق إننا ننادي نفس المنطق لكل واحد على خانته.
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
    exit when v_ok >= 2;
    v_slot := v_ok + 1;

    -- التلميحين الأولين للعميل ده — **نفس دالة `fn_case_build`** بالظبط
    -- (`fn_case_pair_for` في `0133`). النطاقات أوسع شوية لأن الدايرة
    -- بتتقسم على عميلين.
    select p.a1, p.a2, p.c1, p.c2 into v_a1o, v_a2o, v_c1, v_c2
      from fn_case_pair_for(v_cs.id, v_cand,
                            greatest(2, (v_n / 2)), v_n - 1,
                            2, greatest(2, (v_n / 2))) p;

    if v_a1o is null then continue; end if;

    insert into case_clues (session_id, act, slot, for_suspect, text_ar, applies_to, source)
    select v_cs.id, 1, v_slot, v_cand, o.clue_ar, v_c1, 'answer:' || v_a1o::text
      from case_options o where o.id = v_a1o
    on conflict (session_id, act, slot) do update
      set text_ar = excluded.text_ar, applies_to = excluded.applies_to,
          source = excluded.source, for_suspect = excluded.for_suspect;

    insert into case_clues (session_id, act, slot, for_suspect, text_ar, applies_to, source)
    select v_cs.id, 2, v_slot, v_cand, o.clue_ar, v_c2, 'answer:' || v_a2o::text
      from case_options o where o.id = v_a2o
    on conflict (session_id, act, slot) do update
      set text_ar = excluded.text_ar, applies_to = excluded.applies_to,
          source = excluded.source, for_suspect = excluded.for_suspect;

    -- فيه تلميح تالت ممكن؟ لو لأ، نجرّب حد تاني في نفس الخانة.
    select * into v_rec from fn_case_clue3_for(v_cs.id, v_cand) limit 1;
    if v_rec.src is not null then
      update case_players set role = 'suspect' where session_id = v_cs.id and profile_id = v_cand;
      update case_players set mission_id = (
        select ms.id from case_missions ms
         where ms.is_active and (ms.world_slug is null or ms.world_slug = v_case.world_slug)
         order by md5(v_cs.id::text || v_cand::text || ms.id::text)
         limit 1)
       where session_id = v_cs.id and profile_id = v_cand;
      v_ok := v_ok + 1;
    else
      delete from case_clues where session_id = v_cs.id and slot = v_slot;
    end if;
  end loop;

  if v_ok < 2 then
    delete from case_clues where session_id = v_cs.id;
    update case_players set role = 'detective' where session_id = v_cs.id and role = 'suspect';
    raise exception 'مفيش تلميحات بتفرّق عميلين — جاوبوا الأسئلة الأول';
  end if;

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

  update case_sessions set built_at = now(), act = 'act1', act_started_at = now()
   where id = v_cs.id;
  return true;
end $$;
comment on function fn_case_build_double(uuid) is
  '«العميلين» — متهمين، كل واحد له خانة تلميحات. والعملاء لازم يقفشوا الاتنين (fn_case_finish_double).';
revoke execute on function fn_case_build_double(uuid) from public, anon;
grant  execute on function fn_case_build_double(uuid) to authenticated;


-- ===== الختام في «العميلين»: لازم الاتنين يتقفشوا =====
create or replace function fn_case_finish_double(s_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cs  case_sessions;
  v_sus uuid[];
  v_hit uuid[];
  v_pl  int;
  v_out text;
  v_esc int;
  v_rec record;
begin
  if v_uid is null then raise exception 'مش مسجّل'; end if;
  if not (v_uid = fn_case_host(s_id) or fn_has_permission('cases.edit')) then
    raise exception 'صاحب الخروجة بس';
  end if;

  select * into v_cs from case_sessions where sbota_id = s_id;
  if not found or v_cs.built_at is null then raise exception 'القضية مابدأتش'; end if;
  if v_cs.ended_at is not null then return v_cs.outcome; end if;
  if v_cs.act <> 'final' then raise exception 'لسه مش في الفصل الأخير'; end if;

  select array_agg(profile_id) into v_sus from case_players
   where session_id = v_cs.id and role = 'suspect';
  if v_sus is null or array_length(v_sus, 1) < 2 then
    raise exception 'دي مش «العميلين» — استعمل fn_case_finish';
  end if;

  select count(*) into v_pl from case_players
   where session_id = v_cs.id and role <> 'watcher';

  -- مين أخد أصوات تكفي؟ في «العميلين» العتبة أقل — صوتين على كل عميل
  -- بيكفوا، لأن الأصوات بتتوزّع على اتنين.
  select array_agg(t.target_id) into v_hit from (
    select v.target_id, count(*) c
      from case_votes v
     where v.session_id = v_cs.id and v.round = 3
     group by v.target_id
    having count(*) >= greatest(2, (v_pl / 4))) t;

  -- 🔴 لازم **الاتنين** يبقوا في اللي اتقفشوا
  if v_hit is not null and v_sus <@ v_hit then
    v_out := 'caught';
  else
    v_out := 'escaped';
  end if;

  -- الممثل لكل عميل هرب
  if v_out = 'escaped' then
    foreach v_esc in array array[1, 2] loop
      if v_hit is null or not (v_sus[v_esc] = any(v_hit)) then
        insert into case_awards (session_id, profile_id, title_key)
        values (v_cs.id, v_sus[v_esc], 'actor') on conflict do nothing;
      end if;
    end loop;
  end if;

  -- عين الصقر: أول واحد شك في عميل صح في المبدئي
  insert into case_awards (session_id, profile_id, title_key)
  select v_cs.id, v.voter_id, 'hawk_eye' from case_votes v
   where v.session_id = v_cs.id and v.round = 2 and v.target_id = any(v_sus)
   order by v.voted_at asc limit 1
  on conflict do nothing;

  -- المظلوم: أكتر واحد اتشك فيه وهو بريء
  insert into case_awards (session_id, profile_id, title_key)
  select v_cs.id, v.target_id, 'wronged' from case_votes v
   where v.session_id = v_cs.id and not (v.target_id = any(v_sus))
   group by v.target_id order by count(*) desc limit 1
  on conflict do nothing;

  -- النقط — ⚠ أوسمة بس، مفيش wallet_ledger (قرار المالك)
  if v_out = 'caught' then
    for v_rec in
      select p.profile_id from case_players p
       where p.session_id = v_cs.id and p.role = 'detective'
    loop
      insert into case_points (profile_id, points)
      select v_rec.profile_id, st.case_points_win from settings st limit 1
      on conflict (profile_id) do update
        set points = case_points.points + (select case_points_win from settings limit 1),
            updated_at = now();
    end loop;
  else
    foreach v_esc in array array[1, 2] loop
      insert into case_points (profile_id, points)
      select v_sus[v_esc], st.case_points_escape from settings st limit 1
      on conflict (profile_id) do update
        set points = case_points.points + (select case_points_escape from settings limit 1),
            updated_at = now();
    end loop;
  end if;

  update case_sessions set outcome = v_out, ended_at = now(),
                           act = 'done', act_started_at = now()
   where id = v_cs.id;
  return v_out;
end $$;
comment on function fn_case_finish_double(uuid) is
  '«العميلين» — الفريق بيكسب لما **الاتنين** يتقفشوا. واحد يهرب = خسارة.';
revoke execute on function fn_case_finish_double(uuid) from public, anon;
grant  execute on function fn_case_finish_double(uuid) to authenticated;


-- ===== أنهي شكل للخروجة دي؟ =====
-- ⚠ المجموعات اللي أقل من `settings.case_min_players` بتلعب «الخزنة» بس —
--   في أربعة المتهم بيبان من أول تلميح. الدالة دي اللي الواجهة واللوحة
--   بيسألوها، فالقاعدة مكتوبة **مرة واحدة**.
create or replace function fn_case_shape_for(s_id uuid)
returns table (shape case_shape_t, players int, min_players int, ok boolean, why_ar text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_cs  case_sessions;
  v_sh  case_shape_t;
  v_n   int;
  v_min int;
  v_cmin int;
begin
  if not fn_case_player_ok(s_id, auth.uid()) and not fn_has_permission('cases.view') then return; end if;
  select * into v_cs from case_sessions where sbota_id = s_id;
  if not found then return; end if;

  select c.shape, c.min_players into v_sh, v_cmin from cases c where c.id = v_cs.case_id;
  select case_min_players into v_min from settings limit 1;
  select count(*)::int into v_n from case_players
   where session_id = v_cs.id and role <> 'watcher';

  return query select v_sh, v_n, greatest(coalesce(v_min, 5), v_cmin),
    case when v_sh = 'vault' then true
         else v_n >= greatest(coalesce(v_min, 5), v_cmin) end,
    case when v_sh = 'vault' then null
         when v_n < greatest(coalesce(v_min, 5), v_cmin)
           then 'المجموعة صغيرة على القضية دي — جرّبوا «الخزنة»'
         else null end;
end $$;
comment on function fn_case_shape_for(uuid) is
  'شكل القضية والعدد والحد الأدنى. المصدر الواحد اللي الواجهة واللوحة بيسألوه.';
revoke execute on function fn_case_shape_for(uuid) from public, anon;
grant  execute on function fn_case_shape_for(uuid) to authenticated;


-- ============================================================================
-- الاختبار — بنفس بذرة `0133` (fn_case_fixture_up)
-- ============================================================================
create or replace function test_case_variants()
returns table (test text, result text)
language plpgsql
set search_path = public
as $body$
declare
  t_vbuild text; t_vnosus text; t_vsol text; t_vhide text; t_vhint text;
  t_vwrong text; t_vright text; t_vwrongshape text; t_games text; t_vleak text;
  t_dbuild text; t_dslots text; t_dpartner text; t_dcaught text; t_desc text;
  t_small text; t_dmin text;
  v_s    uuid;
  v_sess uuid;
  v_host uuid;
  v_sus  uuid[];
  v_det  uuid[];
  v_code text;
  v_n    int;
  v_ok   boolean;
  v_out  text;
  v_act  case_act_t;
  v_s6   uuid;
  v_step text := 'البداية';
  i      int;
begin
  -- ⚠ **نداء البذرة جوه البلوك اللي بيرجع** — كان بره وكان بيسيب صفوف.
  begin
    -- ===================== «الخزنة» =====================
    v_s := fn_case_fixture_up('elkhazna', 6);
    if v_s is null then
      raise exception 'test_case_variants_noseed';
    end if;
    select id into v_sess from case_sessions where sbota_id = v_s;
    v_host := fn_case_host(v_s);

    v_step := 'الخزنة — الشكل الغلط';
    -- (١) 🔴 «الخزنة» ماتفتحش من fn_case_build (مفيهاش متهم)
    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_host), true);
    begin
      perform fn_case_build(v_s);
      t_vwrongshape := 'فشل — 🔴 الخزنة اتفتحت بمتهم';
    exception when others then t_vwrongshape := 'نجح';
    end;
    reset role; perform set_config('request.jwt.claims', '', true);

    v_step := 'الخزنة — الفتح';
    -- (٢) صاحب الخروجة بيدخّل نتيجة الجيم، وبعدين يفتح الخزنة
    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_host), true);
    perform fn_case_set_games(v_s, 2);
    perform fn_case_build_vault(v_s);
    reset role; perform set_config('request.jwt.claims', '', true);

    select built_at is not null, vault_code into v_ok, v_code
      from case_sessions where id = v_sess;
    t_vbuild := case when v_ok then 'نجح' else 'فشل — الخزنة مافتحتش' end;

    -- (٣) 🔴 مفيش متهم خالص
    select count(*) into v_n from case_players where session_id = v_sess and role = 'suspect';
    t_vnosus := case when v_n = 0 then 'نجح' else format('فشل — 🔴 %s متهم في الخزنة', v_n) end;

    -- (٤) الحل اتحسب من إجابات المجموعة (٤ أرقام، والتالت = نتيجة الجيم)
    t_vsol := case when v_code ~ '^[0-9]+(,[0-9]+){3}$' and split_part(v_code, ',', 3) = '2'
                   then 'نجح'
                   else format('فشل — الحل %s', coalesce(v_code, 'null')) end;

    -- (٥) 🔴 اللاعب بيشوف الألغاز من غير الحل
    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_host), true);
    select count(*) into v_n from fn_case_vault(v_s);
    t_vhide := case when v_n = 4 then 'نجح' else format('فشل — %s لغز بدل 4', v_n) end;
    -- والهنت مقفول لأن الفصل لسه بادئ
    select count(*) into v_n from fn_case_vault(v_s) where hint_ar is not null;
    t_vhint := case when v_n = 0 then 'نجح' else format('فشل — 🔴 %s هنت مفتوح من أول دقيقة', v_n) end;

    -- 🔴 والحل نفسه مش في أي نص راجع. الفحص ده صريح علشان لو حد حط
    --    الحل في نص اللغز أو الهنت، الفاحص يمسكه بالمقصود منه مش بالعرض.
    select count(*) into v_n from fn_case_vault(v_s) vv
     where strpos(coalesce(vv.riddle_ar, ''), v_code) > 0
        or strpos(coalesce(vv.hint_ar, ''), v_code) > 0
        or strpos(coalesce(vv.riddle_ar, ''), replace(v_code, ',', '')) > 0;
    t_vleak := case when v_n = 0 then 'نجح'
                    else format('فشل — 🔴 الحل ظاهر في %s لغز', v_n) end;
    reset role; perform set_config('request.jwt.claims', '', true);

    v_step := 'الخزنة — كود غلط';
    -- (٦) كود غلط
    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_host), true);
    t_vwrong := case when fn_case_vault_try(v_s, array[9,9,9,9]) = false then 'نجح'
                     else 'فشل — 🔴 كود غلط فتح الخزنة' end;
    reset role; perform set_config('request.jwt.claims', '', true);

    v_step := 'الخزنة — كود صح';
    -- (٧) كود صح
    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_host), true);
    v_ok := fn_case_vault_try(v_s, (select array_agg(x::int order by ord)
                                      from unnest(string_to_array(v_code, ',')) with ordinality as t(x, ord)));
    reset role; perform set_config('request.jwt.claims', '', true);
    select outcome into v_out from case_sessions where id = v_sess;
    t_vright := case when v_ok and v_out = 'vault_open' then 'نجح'
                     else format('فشل — رجّع %s والنتيجة %s', v_ok, coalesce(v_out,'null')) end;

    -- (٨) نتيجة الجيم من حد مش صاحب الخروجة
    select array_agg(profile_id order by arrive_order) into v_det
      from case_players where session_id = v_sess and role <> 'watcher';
    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}',
      (select d from unnest(v_det) d where d <> v_host limit 1)), true);
    begin
      perform fn_case_set_games(v_s, 7);
      t_games := 'فشل — 🔴 حد تاني دخّل نتيجة الجيم';
    exception when others then t_games := 'نجح';
    end;
    reset role; perform set_config('request.jwt.claims', '', true);

    v_step := 'مجموعة ٤';
    -- (٩) 🔴 مجموعة صغيرة: القضية بمتهم بترفض، والخزنة بتعدّي
    v_s := fn_case_fixture_up('aqd-elhanem', 4);
    select id into v_sess from case_sessions where sbota_id = v_s;
    v_host := fn_case_host(v_s);
    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_host), true);
    begin
      perform fn_case_build(v_s);
      t_small := 'فشل — 🔴 قضية بمتهم في مجموعة ٤';
    exception when others then t_small := 'نجح';
    end;
    reset role; perform set_config('request.jwt.claims', '', true);

    -- ===================== «العميلين» =====================
    v_s := fn_case_fixture_up('el3ameleen', 8);
    select id into v_sess from case_sessions where sbota_id = v_s;
    v_host := fn_case_host(v_s);

    -- (١٠) 🔴 مجموعة أقل من ٨ بترفض
    -- ⚠ **على سبوطة الـ٦ وصاحبها**، مش سبوطة الـ٨. أول نسخة كانت بتعمل
    --   بذرة ٦ وتنادي على سبوطة الـ٨ — فالفحص كان بيوزّع عميلين فعلًا
    --   ويقول «فشل» على حاجة سليمة.
    v_step := 'العميلين — مجموعة ٦';
    v_s6 := fn_case_fixture_up('el3ameleen', 6);
    set local role authenticated;
    perform set_config('request.jwt.claims',
      format('{"sub":"%s","role":"authenticated"}', fn_case_host(v_s6)), true);
    begin
      perform fn_case_build_double(v_s6);
      t_dmin := 'فشل — 🔴 «العميلين» اتفتحت لـ٦';
    exception when others then t_dmin := 'نجح';
    end;
    reset role; perform set_config('request.jwt.claims', '', true);

    v_step := 'العميلين — التوزيع';
    -- (١١) ٨ لاعبين: عميلين بالظبط
    v_s := fn_case_fixture_up('el3ameleen', 8);
    select id into v_sess from case_sessions where sbota_id = v_s;
    v_host := fn_case_host(v_s);
    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_host), true);
    begin
      perform fn_case_build_double(v_s);
      reset role; perform set_config('request.jwt.claims', '', true);
      select count(*) into v_n from case_players where session_id = v_sess and role = 'suspect';
      t_dbuild := case when v_n = 2 then 'نجح' else format('فشل — %s عميل بدل 2', v_n) end;
    exception when others then
      reset role; perform set_config('request.jwt.claims', '', true);
      t_dbuild := 'فشل — 🔴 «العميلين» مافتحتش: ' || sqlerrm;
    end;

    select array_agg(profile_id order by arrive_order) into v_sus
      from case_players where session_id = v_sess and role = 'suspect';
    select array_agg(profile_id order by arrive_order) into v_det
      from case_players where session_id = v_sess and role = 'detective';

    -- (١٢) 🔴 كل عميل له خانة تلميحات لوحده، وتلميحاته بتنطبق عليه
    select count(*) into v_n from case_clues
     where session_id = v_sess and act = 1 and slot in (1,2);
    t_dslots := case when v_n = 2
                      and (select count(*) from case_clues cl
                            where cl.session_id = v_sess and cl.act in (1,2)
                              and cl.for_suspect is not null
                              and exists (select 1 from case_answers a
                                           where a.sbota_id = v_s and a.profile_id = cl.for_suspect
                                             and a.option_id::text = split_part(cl.source, ':', 2))) = 4
                     then 'نجح'
                     else format('فشل — %s تلميح في الفصل الأول، والتلميحات مش منطبقة', v_n) end;

    -- (١٣) العميل بيعرف شريكه بالاسم الحركي (عالم «المهمة» فيه أسماء حركية)
    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_sus[1]), true);
    select count(*) into v_n from fn_case_my_role(v_s) where partner_codename_ar is not null;
    t_dpartner := case when v_n = 1 then 'نجح' else 'فشل — العميل مش شايف شريكه' end;
    reset role; perform set_config('request.jwt.claims', '', true);

    v_step := 'العميلين — الاتنين اتقفشوا';
    -- (١٤) 🔴 الاتنين اتقفشوا ← الفريق كسب
    for i in 1 .. 8 loop
      select act into v_act from case_sessions where id = v_sess;
      exit when v_act = 'final';
      set local role authenticated;
      perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_host), true);
      perform fn_case_next_act(v_s);
      reset role; perform set_config('request.jwt.claims', '', true);
    end loop;

    for i in 1 .. array_length(v_det, 1) loop
      set local role authenticated;
      perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_det[i]), true);
      perform fn_case_vote(v_s, v_sus[(i % 2) + 1]);
      reset role; perform set_config('request.jwt.claims', '', true);
    end loop;
    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_host), true);
    v_out := fn_case_finish_double(v_s);
    reset role; perform set_config('request.jwt.claims', '', true);
    t_dcaught := case when v_out = 'caught' then 'نجح'
                      else format('فشل — الاتنين اتقفشوا والنتيجة %s', coalesce(v_out,'null')) end;

    v_step := 'العميلين — واحد هرب';
    -- (١٥) 🔴 واحد بس اتقفش ← خسارة
    v_s := fn_case_fixture_up('el3ameleen', 8);
    select id into v_sess from case_sessions where sbota_id = v_s;
    v_host := fn_case_host(v_s);
    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_host), true);
    perform fn_case_build_double(v_s);
    reset role; perform set_config('request.jwt.claims', '', true);
    select array_agg(profile_id order by arrive_order) into v_sus
      from case_players where session_id = v_sess and role = 'suspect';
    select array_agg(profile_id order by arrive_order) into v_det
      from case_players where session_id = v_sess and role = 'detective';
    for i in 1 .. 8 loop
      select act into v_act from case_sessions where id = v_sess;
      exit when v_act = 'final';
      set local role authenticated;
      perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_host), true);
      perform fn_case_next_act(v_s);
      reset role; perform set_config('request.jwt.claims', '', true);
    end loop;
    -- الكل بيصوّت على العميل الأول بس
    for i in 1 .. array_length(v_det, 1) loop
      set local role authenticated;
      perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_det[i]), true);
      perform fn_case_vote(v_s, v_sus[1]);
      reset role; perform set_config('request.jwt.claims', '', true);
    end loop;
    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_host), true);
    v_out := fn_case_finish_double(v_s);
    reset role; perform set_config('request.jwt.claims', '', true);
    t_desc := case when v_out = 'escaped' then 'نجح'
                   else format('فشل — 🔴 واحد هرب والنتيجة %s', coalesce(v_out,'null')) end;

    raise exception 'test_case_variants_rollback';
  exception when others then
    reset role;
    perform set_config('request.jwt.claims', '', true);
    if sqlerrm = 'test_case_variants_noseed' then
      test := '0135 · الأشكال'; result := 'معلومة — محتاج البذرة المؤقتة (fn_test_seed_up)';
      return next; return;
    end if;
    if sqlerrm <> 'test_case_variants_rollback' then
      test := '0135 · الأشكال (' || v_step || ')';
      result := 'فشل — استثناء: ' || sqlerrm;
      return next; return;
    end if;
  end;

  return query
    select * from (values
      ('0135 · «الخزنة» بتفتح من غير متهم',                      t_vbuild),
      ('0135 · 🔴 مفيش متهم في «الخزنة» خالص',                   t_vnosus),
      ('0135 · حل الخزنة اتحسب من إجابات المجموعة',              t_vsol),
      ('0135 · 🔴 اللاعب بيشوف الألغاز من غير الحل',             t_vhide),
      ('0135 · 🔴 الهنت مقفول لحد ما الوقت يعدّي',               t_vhint),
      ('0135 · 🔴 حل الخزنة مش ظاهر في نص أي لغز ولا هنت',       t_vleak),
      ('0135 · 🔴 كود غلط ما بيفتحش الخزنة',                     t_vwrong),
      ('0135 · كود صح بيفتح الخزنة',                             t_vright),
      ('0135 · 🔴 «الخزنة» ما بتفتحش من fn_case_build',          t_vwrongshape),
      ('0135 · 🔴 حد مش صاحب الخروجة ما بيدخّلش نتيجة الجيم',    t_games),
      ('0135 · 🔴 قضية بمتهم في مجموعة ٤ بترفض',                 t_small),
      ('0135 · «العميلين» بتوزّع عميلين بالظبط',                  t_dbuild),
      ('0135 · 🔴 «العميلين» بترفض مجموعة أقل من ٨',             t_dmin),
      ('0135 · 🔴 كل عميل له تلميحاته وبتنطبق عليه',             t_dslots),
      ('0135 · العميل بيعرف شريكه بالاسم الحركي بس',             t_dpartner),
      ('0135 · الاتنين اتقفشوا ← الفريق كسب',                    t_dcaught),
      ('0135 · 🔴 واحد هرب ← الفريق خسر',                        t_desc)
    ) as v(a, b);
end $body$;

comment on function test_case_variants() is
  '0135 — «الخزنة» من غير متهم وحلها من إجابات المجموعة، و«العميلين» لازم الاتنين يتقفشوا.';
revoke execute on function test_case_variants() from public, anon, authenticated;
