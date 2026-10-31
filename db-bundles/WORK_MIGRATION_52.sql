-- ==========================================================================
-- WORK_MIGRATION_52.sql — «قضية الليلة» — التصويت والختام والألقاب والنقط
--
-- 🔴 النتيجة ما بتبانش غير لما الكل يصوّت — ودي في الدالة مش في الواجهة.
--
-- ⚠ **النقط أوسمة بس** (قرارك ٢٠٢٦-١٠-٣١): بتتجمع كرقم على الحساب علشان
--   لو قررت بعدين تتحوّل خصم، البيانات تبقى موجودة — **ومفيش ولا سطر
--   بيكتب في `wallet_ledger`**، وفيه اختبار صريح بيحرس ده.
--
-- ⚠ محتاج 48–51 قبله.
--
-- بعده شغّل (لزقة واحدة):
--   do $$ begin perform fn_test_seed_up(); end $$;
--   create temp table _r as select * from test_case_vote();
--   do $$ begin perform fn_case_fixture_down(); perform fn_test_seed_down(); end $$;
--   select * from _r;                       -- ١٧ صف «نجح»
-- ==========================================================================

-- ########################################################################
-- # 20261031160000_0134_cases_vote.sql
-- ########################################################################

-- ============================================================================
-- 0134 · «قضية الليلة» — التصويت والختام والألقاب والنقط
--
-- 🔴 **النتيجة ما بتبانش غير لما الكل يصوّت.** ده مش تفصيلة واجهة — ده في
--    الدالة. لو الموقع بعت الأصوات وهي بتتجمع، أول واحد بيفتح أدوات
--    المطور بيشوف مين صوّت لمين والنقاش بيخلص قبل ما يبدأ.
--
-- 🔴 **التصويت دالة مش سياسة إدخال** (§٥ قاعدة ٤). صوت واحد لكل واحد في
--    كل دورة، وبيتغيّر طول ما الدورة مفتوحة — والتغيير متعدّد علشان لقب
--    «النازل متأخر».
--
-- ⚠ **النقط أوسمة بس — قرار المالك (٢٠٢٦-١٠-٣١).** بتتجمع كرقم على الحساب
--   علشان لو اتقرر بعدين تتحوّل خصم، البيانات تبقى موجودة. **ومفيش ولا
--   سطر هنا بيكتب في `wallet_ledger`** — ودي محروسة باختبار صريح، لأن
--   أول ما اللعبة تلمس الفلوس تبقى حاجة تانية خالص (حد يلعب علشان الخصم
--   مش علشان يتعرّف على ناس). ومفيش لوحة ترتيب عامة.
--
-- ⚠ محتاج `0130`–`0133`. آمن يتكرر. مفيهوش `drop` ولا `delete`.
-- ============================================================================

-- ===== الأرقام في settings =====
alter table settings add column if not exists case_points_win     int not null default 10;
alter table settings add column if not exists case_points_escape  int not null default 15;
alter table settings add column if not exists case_points_mission int not null default 5;
comment on column settings.case_points_escape is
  'نقط المتهم لو هرب. أعلى من نقط الفريق لأن واحد ضد الكل.';
comment on column settings.case_points_mission is
  'المهمة السرية — المتهم بيكسبها حتى لو اتقفش، عشان يبقى ليه دور يلعبه مش بس يستخبى.';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'settings_case_points_sane') then
    alter table settings add constraint settings_case_points_sane check (
      case_points_win between 0 and 1000
      and case_points_escape between 0 and 1000
      and case_points_mission between 0 and 1000);
  end if;
end $$;


-- ===== الأصوات =====
create table if not exists case_votes (
  id            uuid primary key default gen_random_uuid(),
  session_id    uuid not null references case_sessions(id) on delete cascade,
  voter_id      uuid not null references profiles(id) on delete cascade,
  target_id     uuid not null references profiles(id) on delete cascade,
  -- ٢ = التصويت المبدئي (الفصل التاني، نتيجته ماتبانش) · ٣ = الاتهام
  round         int  not null,
  changed_count int  not null default 0,
  voted_at      timestamptz not null default now(),
  unique (session_id, voter_id, round),
  constraint case_votes_round_known check (round in (2, 3)),
  constraint case_votes_not_self check (voter_id <> target_id)
);
comment on table case_votes is
  '⚠ مفيهاش سياسة قراية للعضو. الأصوات بتوصل من fn_case_votes بعد ما الكل يصوّت بس.';
comment on column case_votes.changed_count is
  'كام مرة غيّر صوته — لقب «النازل متأخر» بيتحسب منه.';

create index if not exists case_votes_session_idx on case_votes (session_id, round);


-- ===== الأوسمة والنقط =====
create table if not exists case_awards (
  id         uuid primary key default gen_random_uuid(),
  session_id uuid not null references case_sessions(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  title_key  text not null references case_titles(key) on delete cascade,
  created_at timestamptz not null default now(),
  unique (session_id, profile_id, title_key)
);
comment on table case_awards is
  'ألقاب الختام. كل واحد بيمشي بلقب، عشان محدش يروح وهو حاسس إنه خسر.';

create table if not exists case_points (
  profile_id uuid primary key references profiles(id) on delete cascade,
  points     int not null default 0,
  updated_at timestamptz not null default now(),
  constraint case_points_not_negative check (points >= 0)
);
comment on table case_points is
  '⚠ نقط اللعبة — **أوسمة بس، مفيش علاقة بالفلوس** (قرار المالك ٢٠٢٦-١٠-٣١). الرقم متخزّن علشان لو اتقرر بعدين يتحوّل خصم. مفيش لوحة ترتيب عامة.';

-- الكدبات — المتهم بيعلّم إجاباته اللي كدب فيها، وبتظهر في الختام
alter table case_answers add column if not exists lied boolean not null default false;
comment on column case_answers.lied is
  'المتهم بس هو اللي بيعلّمها على إجاباته هو. في الختام بتظهر الكدبة مقابل الصح — وأكتر حتة بتضحّك.';


-- ===== التصويت =====
create or replace function fn_case_vote(s_id uuid, p_target uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_cs    case_sessions;
  v_round int;
  v_old   uuid;
begin
  if v_uid is null then raise exception 'مش مسجّل'; end if;
  if not fn_case_player_ok(s_id, v_uid) then raise exception 'مش من حقك تصوّت'; end if;

  select * into v_cs from case_sessions where sbota_id = s_id;
  if not found or v_cs.built_at is null then raise exception 'القضية مابدأتش'; end if;

  -- المتفرّج ماياخدش دور، فماصوّتش
  if not exists (select 1 from case_players
                  where session_id = v_cs.id and profile_id = v_uid and role <> 'watcher') then
    raise exception 'إنت متفرّج — مفيش صوت';
  end if;
  -- ولازم اللي بتصوّت له يكون لاعب كمان
  if not exists (select 1 from case_players
                  where session_id = v_cs.id and profile_id = p_target and role <> 'watcher') then
    raise exception 'ده مش من اللاعبين';
  end if;
  if p_target = v_uid then raise exception 'ماتصوّتش لنفسك'; end if;

  v_round := case v_cs.act
                when 'act2'   then 2
                when 'break2' then 2
                when 'final'  then 3
                else null
              end;
  if v_round is null then raise exception 'التصويت مش مفتوح دلوقتي'; end if;

  select target_id into v_old from case_votes
   where session_id = v_cs.id and voter_id = v_uid and round = v_round;

  insert into case_votes (session_id, voter_id, target_id, round, changed_count)
  values (v_cs.id, v_uid, p_target, v_round, 0)
  on conflict (session_id, voter_id, round) do update
     set target_id     = excluded.target_id,
         changed_count = case_votes.changed_count + (case when case_votes.target_id <> excluded.target_id then 1 else 0 end),
         voted_at      = now();
  return true;
end $$;
comment on function fn_case_vote(uuid, uuid) is
  'صوت واحد لكل واحد في كل دورة، بيتغيّر طول ما الدورة مفتوحة. المتفرّج مابيصوّتش، ومفيش تصويت لنفسك.';
revoke execute on function fn_case_vote(uuid, uuid) from public, anon;
grant  execute on function fn_case_vote(uuid, uuid) to authenticated;


-- ===== 🔴 حالة التصويت — من غير أي أصوات لحد ما الكل يصوّت =====
create or replace function fn_case_vote_state(s_id uuid)
returns table (round int, voted int, players int, everyone_voted boolean,
               my_target uuid, open boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_cs    case_sessions;
  v_round int;
begin
  if not fn_case_player_ok(s_id, v_uid) then return; end if;
  select * into v_cs from case_sessions where sbota_id = s_id;
  if not found or v_cs.built_at is null then return; end if;

  v_round := case v_cs.act
                when 'act2'   then 2 when 'break2' then 2
                when 'final'  then 3 when 'done'   then 3
                else 0
              end;
  if v_round = 0 then return; end if;

  return query
    select v_round,
           (select count(*)::int from case_votes v where v.session_id = v_cs.id and v.round = v_round),
           (select count(*)::int from case_players p where p.session_id = v_cs.id and p.role <> 'watcher'),
           (select count(*) from case_votes v where v.session_id = v_cs.id and v.round = v_round)
             >= (select count(*) from case_players p where p.session_id = v_cs.id and p.role <> 'watcher'),
           (select v.target_id from case_votes v
             where v.session_id = v_cs.id and v.round = v_round and v.voter_id = v_uid),
           v_cs.act in ('act2','break2','final');
end $$;
comment on function fn_case_vote_state(uuid) is
  '🔴 أرقام بس: كام صوّت، وأنا صوّت لمين. مفيش «مين صوّت لمين» — ده بيوصل من fn_case_votes بعد الختام.';
revoke execute on function fn_case_vote_state(uuid) from public, anon;
grant  execute on function fn_case_vote_state(uuid) to authenticated;


-- ===== المتهم بيعلّم كدبته =====
create or replace function fn_case_mark_lie(s_id uuid, p_question uuid, p_lied boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cs  case_sessions;
begin
  if v_uid is null then raise exception 'مش مسجّل'; end if;
  if not fn_case_player_ok(s_id, v_uid) then raise exception 'مش من حقك'; end if;

  select * into v_cs from case_sessions where sbota_id = s_id;
  if not found or v_cs.built_at is null then raise exception 'القضية مابدأتش'; end if;

  -- 🔴 المتهم بس، وعلى إجاباته هو بس
  if not exists (select 1 from case_players
                  where session_id = v_cs.id and profile_id = v_uid and role = 'suspect') then
    raise exception 'مش من حقك';
  end if;

  update case_answers set lied = coalesce(p_lied, false)
   where sbota_id = s_id and profile_id = v_uid and question_id = p_question;
  return true;
end $$;
comment on function fn_case_mark_lie(uuid, uuid, boolean) is
  'المتهم بيعلّم إجابة كدب فيها. على إجاباته هو بس — ومحدش غيره يقدر.';
revoke execute on function fn_case_mark_lie(uuid, uuid, boolean) from public, anon;
grant  execute on function fn_case_mark_lie(uuid, uuid, boolean) to authenticated;


-- ===== المتهم بيقول إنه خلّص مهمته =====
create or replace function fn_case_mission_done(s_id uuid, p_done boolean)
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
  if not fn_case_player_ok(s_id, v_uid) then raise exception 'مش من حقك'; end if;
  select id into v_sid from case_sessions where sbota_id = s_id;
  if v_sid is null then raise exception 'القضية مابدأتش'; end if;

  update case_players set mission_done = coalesce(p_done, false)
   where session_id = v_sid and profile_id = v_uid and role = 'suspect';
  if not found then raise exception 'مش من حقك'; end if;
  return true;
end $$;
comment on function fn_case_mission_done(uuid, boolean) is
  'المتهم بيعلّم إنه خلّص مهمته. المجموعة بتصوّت عليها في الختام («عملها فعلًا؟»).';
revoke execute on function fn_case_mission_done(uuid, boolean) from public, anon;
grant  execute on function fn_case_mission_done(uuid, boolean) to authenticated;


-- ===== 🔴 الختام =====
create or replace function fn_case_finish(s_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_cs    case_sessions;
  v_sus   uuid;
  v_top   uuid;
  v_votes int;
  v_half  int;
  v_out   text;
  v_pwin  int; v_pesc int; v_pmis int;
  v_done  boolean;
  v_rec   record;
begin
  if v_uid is null then raise exception 'مش مسجّل'; end if;
  if not (v_uid = fn_case_host(s_id) or fn_has_permission('cases.edit')) then
    raise exception 'صاحب الخروجة بس';
  end if;

  select * into v_cs from case_sessions where sbota_id = s_id;
  if not found or v_cs.built_at is null then raise exception 'القضية مابدأتش'; end if;
  if v_cs.ended_at is not null then return v_cs.outcome; end if;
  if v_cs.act <> 'final' then raise exception 'لسه مش في الفصل الأخير'; end if;

  select profile_id into v_sus from case_players
   where session_id = v_cs.id and role = 'suspect' limit 1;
  if v_sus is null then raise exception 'مفيش متهم'; end if;

  select case_points_win, case_points_escape, case_points_mission
    into v_pwin, v_pesc, v_pmis from settings limit 1;

  -- مين أخد أكتر أصوات في الاتهام؟
  select v.target_id, count(*)::int into v_top, v_votes
    from case_votes v
   where v.session_id = v_cs.id and v.round = 3
   group by v.target_id
   order by count(*) desc, min(v.voted_at) asc
   limit 1;

  select (count(*) / 2.0)::int into v_half
    from case_players p where p.session_id = v_cs.id and p.role <> 'watcher';

  -- الفريق بيكسب لما **أغلبية** الأصوات تقع على المتهم
  v_out := case when v_top = v_sus and coalesce(v_votes, 0) > coalesce(v_half, 0)
                then 'caught' else 'escaped' end;

  select mission_done into v_done from case_players
   where session_id = v_cs.id and profile_id = v_sus;

  -- ===== الألقاب =====
  -- عين الصقر: أول واحد شك في المتهم الصح في التصويت المبدئي
  insert into case_awards (session_id, profile_id, title_key)
  select v_cs.id, v.voter_id, 'hawk_eye' from case_votes v
   where v.session_id = v_cs.id and v.round = 2 and v.target_id = v_sus
   order by v.voted_at asc limit 1
  on conflict do nothing;

  -- الممثل: المتهم لو هرب
  if v_out = 'escaped' then
    insert into case_awards (session_id, profile_id, title_key)
    values (v_cs.id, v_sus, 'actor') on conflict do nothing;
  end if;

  -- المظلوم: أكتر واحد اتشك فيه وهو بريء
  insert into case_awards (session_id, profile_id, title_key)
  select v_cs.id, v.target_id, 'wronged' from case_votes v
   where v.session_id = v_cs.id and v.target_id <> v_sus
   group by v.target_id
   order by count(*) desc limit 1
  on conflict do nothing;

  -- المحامي: صوّت للمتهم الصح في المبدئي وبعدين غيّر عنه في الاتهام
  insert into case_awards (session_id, profile_id, title_key)
  select v_cs.id, v2.voter_id, 'lawyer' from case_votes v2
   where v2.session_id = v_cs.id and v2.round = 2 and v2.target_id = v_sus
     and exists (select 1 from case_votes v3
                  where v3.session_id = v_cs.id and v3.round = 3
                    and v3.voter_id = v2.voter_id and v3.target_id <> v_sus)
   limit 1
  on conflict do nothing;

  -- الصادق: محدش شك فيه خالص
  insert into case_awards (session_id, profile_id, title_key)
  select v_cs.id, p.profile_id, 'honest' from case_players p
   where p.session_id = v_cs.id and p.role <> 'watcher'
     and not exists (select 1 from case_votes v where v.session_id = v_cs.id and v.target_id = p.profile_id)
   order by md5(v_cs.id::text || p.profile_id::text) limit 1
  on conflict do nothing;

  -- النازل متأخر: آخر واحد غيّر صوته
  insert into case_awards (session_id, profile_id, title_key)
  select v_cs.id, v.voter_id, 'latecomer' from case_votes v
   where v.session_id = v_cs.id and v.round = 3 and v.changed_count > 0
   order by v.voted_at desc limit 1
  on conflict do nothing;

  -- ===== النقط =====
  -- ⚠ **مفيش ولا سطر بيكتب في `wallet_ledger` هنا.** قرار المالك: أوسمة
  --   دلوقتي. الرقم متخزّن علشان لو اتقرر بعدين يتحوّل خصم.
  if v_out = 'caught' then
    for v_rec in
      select p.profile_id from case_players p
       where p.session_id = v_cs.id and p.role = 'detective'
    loop
      insert into case_points (profile_id, points) values (v_rec.profile_id, v_pwin)
      on conflict (profile_id) do update
        set points = case_points.points + v_pwin, updated_at = now();
    end loop;
  else
    insert into case_points (profile_id, points) values (v_sus, v_pesc)
    on conflict (profile_id) do update
      set points = case_points.points + v_pesc, updated_at = now();
  end if;

  if coalesce(v_done, false) then
    insert into case_points (profile_id, points) values (v_sus, v_pmis)
    on conflict (profile_id) do update
      set points = case_points.points + v_pmis, updated_at = now();
  end if;

  update case_sessions
     set outcome = v_out, ended_at = now(), act = 'done', act_started_at = now()
   where id = v_cs.id;
  return v_out;
end $$;
comment on function fn_case_finish(uuid) is
  '🔴 الختام: النتيجة بالأغلبية، والألقاب، والنقط (أوسمة بس — مفيش wallet_ledger). صاحب الخروجة أو cases.edit بس.';
revoke execute on function fn_case_finish(uuid) from public, anon;
grant  execute on function fn_case_finish(uuid) to authenticated;


-- ===== 🔴 شاشة الختام =====
create or replace function fn_case_result(s_id uuid)
returns table (
  outcome text, suspect_name text, suspect_is_me boolean,
  suspect_codename_ar text, ending_ar text, twist_ar text,
  mission_ar text, mission_done boolean,
  world_name_ar text, theme text, case_title_ar text
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
  -- 🔴 الكشف بعد الختام بس. قبله الدالة بترجّع ولا صف.
  if not found or v_cs.ended_at is null then return; end if;

  return query
    select v_cs.outcome,
           pr.first_name, pl.profile_id = v_uid, pl.codename_ar,
           case when v_cs.outcome = 'caught' then c.win_ending_ar else c.escape_ending_ar end,
           case when v_cs.outcome = 'caught' then c.twist_ar else null end,
           ms.text_ar, pl.mission_done,
           w.name_ar, w.theme, c.title_ar
      from case_players pl
      join profiles pr      on pr.id = pl.profile_id
      join cases c          on c.id = v_cs.case_id
      join case_worlds w    on w.slug = c.world_slug
      left join case_missions ms on ms.id = pl.mission_id
     where pl.session_id = v_cs.id and pl.role = 'suspect';
end $$;
comment on function fn_case_result(uuid) is
  '🔴 شاشة الختام — **بعد الختام بس**. الاسم الأول وبس (قرار المالك ٢٠٢٦-٠٩-٢١).';
revoke execute on function fn_case_result(uuid) from public, anon;
grant  execute on function fn_case_result(uuid) to authenticated;


-- ===== الكدبات والأصوات والألقاب — بعد الختام بس =====
create or replace function fn_case_lies(s_id uuid)
returns table (question_ar text, said_ar text, truth_hint_ar text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_cs case_sessions;
begin
  if not fn_case_player_ok(s_id, auth.uid()) then return; end if;
  select * into v_cs from case_sessions where sbota_id = s_id;
  if not found or v_cs.ended_at is null then return; end if;

  return query
    select q.question_ar, o.label_ar, o.clue_ar
      from case_answers a
      join case_players pl on pl.session_id = v_cs.id and pl.profile_id = a.profile_id and pl.role = 'suspect'
      join case_questions q on q.id = a.question_id
      join case_options o   on o.id = a.option_id
     where a.sbota_id = s_id and a.lied
     order by q.sort;
end $$;
comment on function fn_case_lies(uuid) is 'كدبات المتهم مقابل الصح — بعد الختام بس.';
revoke execute on function fn_case_lies(uuid) from public, anon;
grant  execute on function fn_case_lies(uuid) to authenticated;

create or replace function fn_case_awards(s_id uuid)
returns table (name text, title_ar text, rule_ar text, is_me boolean, points int)
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
  if not found or v_cs.ended_at is null then return; end if;

  return query
    select pr.first_name, t.name_ar, t.rule_ar, aw.profile_id = v_uid,
           coalesce(cp.points, 0)
      from case_awards aw
      join profiles pr    on pr.id = aw.profile_id
      join case_titles t  on t.key = aw.title_key
      left join case_points cp on cp.profile_id = aw.profile_id
     where aw.session_id = v_cs.id
     order by t.sort;
end $$;
comment on function fn_case_awards(uuid) is
  'الألقاب — بعد الختام بس. الاسم الأول وبس، ومفيش لوحة ترتيب عامة.';
revoke execute on function fn_case_awards(uuid) from public, anon;
grant  execute on function fn_case_awards(uuid) to authenticated;

create or replace function fn_case_my_points()
returns table (points int, titles jsonb)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;
  return query
    select coalesce((select cp.points from case_points cp where cp.profile_id = v_uid), 0),
           coalesce((select jsonb_agg(jsonb_build_object('key', t.key, 'name_ar', t.name_ar, 'n', x.n)
                                      order by t.sort)
                       from (select aw.title_key, count(*)::int n from case_awards aw
                              where aw.profile_id = v_uid group by aw.title_key) x
                       join case_titles t on t.key = x.title_key), '[]'::jsonb);
end $$;
comment on function fn_case_my_points() is
  'نقطي وأوسمتي في صفحتي. «عندي ١ عين صقر، عايز التانية» — مفيش لوحة ترتيب عامة عن قصد.';
revoke execute on function fn_case_my_points() from public, anon;
grant  execute on function fn_case_my_points() to authenticated;


-- ===== تنضيف الإجابات بعد الخروجة =====
create or replace function job_purge_case_answers()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_h int;
  v_n int;
begin
  select case_answers_keep_hours into v_h from settings limit 1;
  with gone as (
    delete from case_answers a
     using case_sessions cs
     where cs.sbota_id = a.sbota_id
       and cs.ended_at is not null
       and cs.ended_at < now() - make_interval(hours => coalesce(v_h, 2))
    returning 1)
  select count(*)::int into v_n from gone;
  return coalesce(v_n, 0);
end $$;
comment on function job_purge_case_answers() is
  'الإجابات بتتمسح بعد الختام بـsettings.case_answers_keep_hours. يتجدول في pg_cron (RUNBOOK).';
revoke execute on function job_purge_case_answers() from public, anon, authenticated;


-- ===== RLS =====
alter table case_votes  enable row level security;
alter table case_awards enable row level security;
alter table case_points enable row level security;

do $$ begin
  if not exists (select 1 from pg_policies where tablename='case_votes' and policyname='case_votes_admin_read') then
    create policy case_votes_admin_read on case_votes for select using (fn_has_permission('cases.view'));
  end if;
  if not exists (select 1 from pg_policies where tablename='case_awards' and policyname='case_awards_admin_read') then
    create policy case_awards_admin_read on case_awards for select using (fn_has_permission('cases.view'));
  end if;
  if not exists (select 1 from pg_policies where tablename='case_points' and policyname='case_points_admin_read') then
    create policy case_points_admin_read on case_points for select using (fn_has_permission('cases.view'));
  end if;
end $$;


-- ============================================================================
-- الاختبار — بنفس بذرة `0133` (fn_case_fixture_up)
-- ⚠ كل الكتابة بترجع باستثناء متعمّد في الآخر.
-- ============================================================================
create or replace function test_case_vote()
returns table (test text, result text)
language plpgsql
set search_path = public
as $body$
declare
  t_early text; t_self text; t_watch text; t_one text; t_change text;
  t_hidden text; t_shown text; t_caught text; t_escaped text;
  t_titles text; t_points text; t_wallet text; t_result_before text;
  t_lie text; t_lie_other text; t_nofinish text; t_purge text;
  v_s    uuid;
  v_sess uuid;
  v_host uuid;
  v_sus  uuid;
  v_det  uuid[];
  v_n    int;
  v_out  text;
  v_q    uuid;
  v_pts  int;
  v_wal  int;
  v_act  case_act_t;
  i      int;
begin
  -- ⚠ **نداء البذرة جوه البلوك اللي بيرجع.** كان بره، فالصفوف كانت
  --   بتتحفظ في القاعدة بعد الاختبار (١٢ لاعب و٢ جلسة و١٥٦ إجابة سايبين).
  begin
    v_s := fn_case_fixture_up('aqd-elhanem');   -- عالم «أبيض وأسود» — فيه فصل تاني
    if v_s is null then
      raise exception 'test_case_vote_noseed';
    end if;
    select id into v_sess from case_sessions where sbota_id = v_s;
    v_host := fn_case_host(v_s);

    -- ===== (١) التصويت قبل ما القضية تبدأ لازم يترفض =====
    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_host), true);
    begin
      perform fn_case_vote(v_s, 'cccccccc-0000-0000-0000-000000000002');
      t_early := 'فشل — 🔴 صوّت والقضية مابدأتش';
    exception when others then t_early := 'نجح';
    end;
    reset role; perform set_config('request.jwt.claims', '', true);

    -- توزيع الأدوار
    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_host), true);
    perform fn_case_build(v_s);
    reset role; perform set_config('request.jwt.claims', '', true);

    select profile_id into v_sus from case_players where session_id = v_sess and role = 'suspect';
    select array_agg(profile_id order by arrive_order) into v_det
      from case_players where session_id = v_sess and role = 'detective';

    -- نوصل لفصل التصويت المبدئي (act2)
    -- ⚠ قراية `case_sessions` لازم تبقى بهوية postgres — مقفولة بـRLS على
    --   العضو، فلو قريناها جوه الدور بترجّع null والحلقة ما بتوقفش خالص
    --   (ودي اللي خلّت القضية توصل `done` وكل التصويت بعدها يترفض).
    for i in 1 .. 6 loop
      select act into v_act from case_sessions where id = v_sess;
      exit when v_act = 'act2';
      set local role authenticated;
      perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_host), true);
      perform fn_case_next_act(v_s);
      reset role; perform set_config('request.jwt.claims', '', true);
    end loop;

    -- ===== (٢) ماتصوّتش لنفسك =====
    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_det[1]), true);
    begin
      perform fn_case_vote(v_s, v_det[1]);
      t_self := 'فشل — 🔴 صوّت لنفسه';
    exception when others then t_self := 'نجح';
    end;
    reset role; perform set_config('request.jwt.claims', '', true);

    -- ===== (٣) المتفرّج مابيصوّتش =====
    update case_players set role = 'watcher' where session_id = v_sess and profile_id = v_det[5];
    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_det[5]), true);
    begin
      perform fn_case_vote(v_s, v_sus);
      t_watch := 'فشل — 🔴 متفرّج صوّت';
    exception when others then t_watch := 'نجح';
    end;
    reset role; perform set_config('request.jwt.claims', '', true);
    update case_players set role = 'detective' where session_id = v_sess and profile_id = v_det[5];

    -- ===== (٤)(٥) صوت واحد، وبيتغيّر والتغيير بيتعدّ =====
    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_det[1]), true);
    perform fn_case_vote(v_s, v_det[2]);
    perform fn_case_vote(v_s, v_sus);
    perform fn_case_vote(v_s, v_sus);
    reset role; perform set_config('request.jwt.claims', '', true);

    select count(*) into v_n from case_votes
     where session_id = v_sess and voter_id = v_det[1] and round = 2;
    t_one := case when v_n = 1 then 'نجح' else format('فشل — %s صوت لنفس الواحد', v_n) end;

    select changed_count into v_n from case_votes
     where session_id = v_sess and voter_id = v_det[1] and round = 2;
    t_change := case when v_n = 1 then 'نجح'
                     else format('فشل — التغيير اتعدّ %s مرة بدل 1', coalesce(v_n::text,'null')) end;

    -- باقي المحققين يصوّتوا للمتهم في المبدئي (الأول واحد بيدافع عنه بعدين)
    for i in 2 .. array_length(v_det, 1) loop
      set local role authenticated;
      perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_det[i]), true);
      perform fn_case_vote(v_s, v_sus);
      reset role; perform set_config('request.jwt.claims', '', true);
    end loop;

    -- ===== (٦) 🔴 الأصوات مش ظاهرة قبل الختام =====
    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_det[1]), true);
    select count(*) into v_n from case_votes;   -- RLS
    t_hidden := case when v_n = 0 then 'نجح' else format('فشل — 🔴 لاعب شاف %s صوت', v_n) end;
    select count(*) into v_n from fn_case_result(v_s);
    t_result_before := case when v_n = 0 then 'نجح' else 'فشل — 🔴 شاشة الختام ظهرت قبل الختام' end;
    reset role; perform set_config('request.jwt.claims', '', true);

    -- ===== (١٤)(١٥) الكدبة: المتهم بس =====
    select question_id into v_q from case_answers a
      join case_questions q on q.id = a.question_id
     where a.sbota_id = v_s and a.profile_id = v_sus and q.kind = 'answer' limit 1;
    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_sus), true);
    begin
      perform fn_case_mark_lie(v_s, v_q, true);
      perform fn_case_mission_done(v_s, true);
      reset role; perform set_config('request.jwt.claims', '', true);
      select count(*) into v_n from case_answers
       where sbota_id = v_s and profile_id = v_sus and lied;
      t_lie := case when v_n = 1 then 'نجح' else format('فشل — %s كدبة', v_n) end;
    exception when others then
      reset role; perform set_config('request.jwt.claims', '', true);
      t_lie := 'فشل — 🔴 المتهم مقدرش يعلّم كدبته: ' || sqlerrm;
    end;

    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_det[1]), true);
    begin
      perform fn_case_mark_lie(v_s, v_q, true);
      t_lie_other := 'فشل — 🔴 محقق علّم كدبة';
    exception when others then t_lie_other := 'نجح';
    end;
    reset role; perform set_config('request.jwt.claims', '', true);

    -- ===== (١٦) الختام من حد مش صاحب الخروجة =====
    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_det[2]), true);
    begin
      perform fn_case_finish(v_s);
      t_nofinish := 'فشل — 🔴 حد تاني قفل القضية';
    exception when others then t_nofinish := 'نجح';
    end;
    reset role; perform set_config('request.jwt.claims', '', true);

    -- ===== الاتهام: الكل بيصوّت للمتهم ← الفريق بيكسب =====
    -- ⚠ قراية `case_sessions` لازم تبقى بهوية postgres — مقفولة بـRLS على
    --   العضو، فلو قريناها جوه الدور بترجّع null والحلقة ما بتوقفش خالص
    --   (ودي اللي خلّت القضية توصل `done` وكل التصويت بعدها يترفض).
    for i in 1 .. 6 loop
      select act into v_act from case_sessions where id = v_sess;
      exit when v_act = 'final';
      set local role authenticated;
      perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_host), true);
      perform fn_case_next_act(v_s);
      reset role; perform set_config('request.jwt.claims', '', true);
    end loop;

    -- ⚠ ملفوف زي سيناريو الهرب: لو حارس الختام مشيل، الفحص اللي فوق
    --   بيقفل القضية بدري وكل تصويت بعده بيترفض — والاستثناء كان بيطلّع
    --   صف واحد مبهم بدل ما كل صف يقول نتيجته.
    begin
      for i in 1 .. array_length(v_det, 1) loop
        set local role authenticated;
        perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_det[i]), true);
        -- الأول بيدافع عن المتهم (بيغيّر عنه) → لقب «المحامي»
        perform fn_case_vote(v_s, case when i = 1 then v_det[2] else v_sus end);
        reset role; perform set_config('request.jwt.claims', '', true);
      end loop;
      set local role authenticated;
      perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_sus), true);
      perform fn_case_vote(v_s, v_det[2]);
      reset role; perform set_config('request.jwt.claims', '', true);

      select count(*) into v_wal from wallet_ledger;   -- قبل الختام

      set local role authenticated;
      perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_host), true);
      v_out := fn_case_finish(v_s);
      reset role; perform set_config('request.jwt.claims', '', true);

      t_caught := case when v_out = 'caught' then 'نجح'
                       else format('فشل — النتيجة %s والأغلبية صوّتت للمتهم', coalesce(v_out,'null')) end;
    exception when others then
      reset role; perform set_config('request.jwt.claims', '', true);
      t_caught := 'فشل — استثناء في سيناريو القفش: ' || sqlerrm;
      v_wal := coalesce(v_wal, (select count(*) from wallet_ledger));
    end;

    -- ===== (٧) شاشة الختام بتظهر بعد الختام =====
    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_det[1]), true);
    select count(*) into v_n from fn_case_result(v_s);
    t_shown := case when v_n = 1 then 'نجح' else format('فشل — %s صف في شاشة الختام', v_n) end;
    reset role; perform set_config('request.jwt.claims', '', true);

    -- ===== (١٠) الألقاب =====
    select count(*) into v_n from case_awards where session_id = v_sess;
    t_titles := case when v_n >= 3 then 'نجح'
                     else format('فشل — %s لقب بس (المفروض عين الصقر والمحامي والمظلوم)', v_n) end;

    -- ===== (١١) النقط للمحققين =====
    select coalesce(sum(cp.points), 0) into v_pts from case_points cp
     where cp.profile_id = any(v_det);
    t_points := case when v_pts > 0 then 'نجح' else 'فشل — الفريق كسب ومفيش نقط' end;

    -- ===== (١٢) 🔴 ولا سطر في wallet_ledger (قرار المالك) =====
    select count(*) into v_n from wallet_ledger;
    t_wallet := case when v_n = v_wal then 'نجح'
                     else format('فشل — 🔴 اللعبة كتبت %s سطر في wallet_ledger', v_n - v_wal) end;

    -- ===== (٩) المتهم هرب: الأغلبية صوّتت لواحد تاني =====
    perform fn_case_fixture_up('aqd-elhanem');
    select id into v_sess from case_sessions where sbota_id = v_s;
    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_host), true);
    perform fn_case_build(v_s);
    reset role; perform set_config('request.jwt.claims', '', true);
    select profile_id into v_sus from case_players where session_id = v_sess and role = 'suspect';
    select array_agg(profile_id order by arrive_order) into v_det
      from case_players where session_id = v_sess and role = 'detective';
    -- ⚠ قراية `case_sessions` لازم تبقى بهوية postgres — مقفولة بـRLS على
    --   العضو، فلو قريناها جوه الدور بترجّع null والحلقة ما بتوقفش خالص
    --   (ودي اللي خلّت القضية توصل `done` وكل التصويت بعدها يترفض).
    for i in 1 .. 8 loop
      select act into v_act from case_sessions where id = v_sess;
      exit when v_act = 'final';
      set local role authenticated;
      perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_host), true);
      perform fn_case_next_act(v_s);
      reset role; perform set_config('request.jwt.claims', '', true);
    end loop;
    -- ⚠ ملفوف في `begin/exception` علشان لو حاجة قبله خربت الحالة، الصف
    --   ده يقول «فشل» بوضوح بدل ما الاستثناء يطلّع صف واحد مبهم للاختبار كله.
    begin
      for i in 1 .. array_length(v_det, 1) loop
        set local role authenticated;
        perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_det[i]), true);
        perform fn_case_vote(v_s, case when v_det[i] = v_det[1] then v_det[2] else v_det[1] end);
        reset role; perform set_config('request.jwt.claims', '', true);
      end loop;
      set local role authenticated;
      perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', v_host), true);
      v_out := fn_case_finish(v_s);
      reset role; perform set_config('request.jwt.claims', '', true);
      t_escaped := case when v_out = 'escaped' then 'نجح'
                        else format('فشل — النتيجة %s والأغلبية صوّتت لحد تاني', coalesce(v_out,'null')) end;
    exception when others then
      reset role; perform set_config('request.jwt.claims', '', true);
      t_escaped := 'فشل — استثناء في سيناريو الهرب: ' || sqlerrm;
    end;

    -- ===== (١٧) تنضيف الإجابات بعد الخروجة =====
    update case_sessions set ended_at = now() - interval '10 hours' where id = v_sess;
    select job_purge_case_answers() into v_n;
    t_purge := case when v_n > 0 and not exists (select 1 from case_answers where sbota_id = v_s)
                    then 'نجح' else format('فشل — مسح %s صف والإجابات لسه موجودة', v_n) end;

    raise exception 'test_case_vote_rollback';
  exception when others then
    reset role;
    perform set_config('request.jwt.claims', '', true);
    if sqlerrm = 'test_case_vote_noseed' then
      test := '0134 · التصويت'; result := 'معلومة — محتاج البذرة المؤقتة (fn_test_seed_up)';
      return next; return;
    end if;
    if sqlerrm <> 'test_case_vote_rollback' then
      test := '0134 · التصويت'; result := 'فشل — استثناء: ' || sqlerrm;
      return next; return;
    end if;
  end;

  return query
    select * from (values
      ('0134 · 🔴 التصويت قبل ما القضية تبدأ بيترفض',            t_early),
      ('0134 · 🔴 ماتصوّتش لنفسك',                                t_self),
      ('0134 · 🔴 المتفرّج مابيصوّتش',                             t_watch),
      ('0134 · صوت واحد لكل واحد في الدورة',                     t_one),
      ('0134 · تغيير الصوت بيتعدّ (لقب «النازل متأخر»)',          t_change),
      ('0134 · 🔴 الأصوات مش ظاهرة للاعب قبل الختام',            t_hidden),
      ('0134 · 🔴 شاشة الختام مش ظاهرة قبل الختام',              t_result_before),
      ('0134 · شاشة الختام بتظهر بعد الختام',                    t_shown),
      ('0134 · الأغلبية صوّتت للمتهم ← الفريق كسب',               t_caught),
      ('0134 · الأغلبية صوّتت لحد تاني ← المتهم هرب',             t_escaped),
      ('0134 · الألقاب اتوزّعت',                                  t_titles),
      ('0134 · النقط وصلت للفريق الكسبان',                       t_points),
      ('0134 · 🔴 اللعبة ما بتكتبش في wallet_ledger (قرار المالك)', t_wallet),
      ('0134 · المتهم بيعلّم كدبته',                              t_lie),
      ('0134 · 🔴 المحقق ما بيعلّمش كدبة',                        t_lie_other),
      ('0134 · 🔴 حد مش صاحب الخروجة ما بيقفلش القضية',          t_nofinish),
      ('0134 · الإجابات بتتمسح بعد الخروجة',                     t_purge)
    ) as v(a, b);
end $body$;

comment on function test_case_vote() is
  '0134 — التصويت والختام: الأصوات مخفية لحد ما يخلص، والنتيجة بالأغلبية، والألقاب والنقط — ومفيش wallet_ledger.';
revoke execute on function test_case_vote() from public, anon, authenticated;
