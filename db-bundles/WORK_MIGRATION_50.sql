-- ==========================================================================
-- WORK_MIGRATION_50.sql — «قضية الليلة» — الجلسة والأدوار والإجابات
--
-- 🔴 أهم ملف في النظام: **هوية المتهم ماتوصلش لأي متصفح غير متصفحه هو.**
-- جدول اللاعبين **مفيهوش ولا سياسة قراية** — ولا لصاحب الصف. الدور بيوصل
-- من `fn_case_my_role` بس، وبترجّع صف واحد: بتاعك.
--
-- ⚠ محتاج WORK_MIGRATION_48 و49 قبله.
--
-- بعده شغّل (لزقة واحدة):
--   do $$ begin perform fn_test_seed_up(); end $$;
--   create temp table _r as select * from test_case_roles();
--   do $$ begin perform fn_case_fixture_down(); perform fn_test_seed_down(); end $$;
--   select * from _r;                       -- ١٩ صف «نجح»
-- ==========================================================================

-- ########################################################################
-- # 20261031140000_0132_cases_session.sql
-- ########################################################################

-- ============================================================================
-- 0132 · «قضية الليلة» — الجلسة والأدوار والإجابات
--
-- أهم حاجة في البناء كله (برومبت المالك، ٢٠٢٦-١٠-٣١):
--   **هوية المتهم ماتوصلش لأي متصفح غير متصفحه هو.**
--
-- لو الموقع بعت الأدوار كلها وخبّى اللي مش بتاعك، أي حد يفتح أدوات المطور
-- هيعرف المتهم في ثانية. فـ:
--   · `case_players` **مفيهاش ولا سياسة قراية** — ولا لصاحب الصف نفسه.
--   · الدور بيوصل من `fn_case_my_role` بس، وبترجّع **صف واحد: بتاعك**.
--   · `case_sessions.entry_code` بيوصل من `fn_case_code` لصاحب الخروجة بس.
-- ده نفس نمط `fn_pair_want` (§٥ قاعدة ٤): العضو بيعمل حاجة جديدة بدالة،
-- مش بسياسة `insert`.
--
-- ⚠ والحارس اللي بيقول «ده فعلًا من المجموعة» هو **`fn_can_see_place`** —
--   نفس الحارس اللي بينادوه `fn_sbota_address` و`fn_sbota_arrival`
--   و`fn_safety_view` و`fn_group_members`. مش نسخة منه (الدرس الستاشر).
--
-- ⚠ `set search_path = public, extensions` في أي دالة بتستعمل pgcrypto —
--   سوبابيس بيركّب الامتدادات في `extensions` مش `public` (الدرس التمنتاشر).
--
-- ⚠ محتاج `0130` و`0131`. آمن يتكرر. مفيهوش `drop` ولا `delete`.
-- ============================================================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'case_role_t') then
    create type case_role_t as enum ('detective', 'suspect', 'watcher');
  end if;
end $$;
comment on type case_role_t is
  'watcher = «هتفرّج» — بيفضل مع المجموعة عادي وماياخدش دور، وماحدش بيسأله ليه.';


-- ===== الجلسة =====
create table if not exists case_sessions (
  id             uuid primary key default gen_random_uuid(),
  sbota_id       uuid not null unique references sbotat(id) on delete cascade,
  case_id        uuid not null references cases(id) on delete restrict,
  -- ٤ أرقام. صاحب الخروجة بيقوله **بصوته**، فما بيتعرضش لحد غيره.
  entry_code     text not null,
  act            case_act_t not null default 'setup',
  act_started_at timestamptz,
  -- وقت اختيار المتهم وحساب التلميحات (0133). بعده الإجابات بتتقفل.
  built_at       timestamptz,
  -- caught = الفريق قفش المتهم · escaped = هرب (بيتحدّد في 0134)
  outcome        text,
  ended_at       timestamptz,
  -- «الخزنة» (0135) — ٤ أرقام ألغازها عن المجموعة
  vault_code     text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint case_sessions_code_four check (entry_code ~ '^[0-9]{4}$'),
  constraint case_sessions_outcome_known check (outcome is null or outcome in ('caught','escaped','vault_open','vault_shut'))
);
comment on table case_sessions is
  'جلسة القضية لخروجة واحدة. ⚠ entry_code ما بيتقراش من المتصفح — fn_case_code لصاحب الخروجة بس.';
comment on column case_sessions.built_at is
  'بعد ما المتهم يتختار والتلميحات تتحسب، الإجابات بتتقفل — وإلا المتهم يغيّر إجابته ويبطّل التلميحات.';


-- ===== اللاعبين =====
create table if not exists case_players (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references case_sessions(id) on delete cascade,
  profile_id   uuid not null references profiles(id) on delete cascade,
  role         case_role_t not null default 'detective',
  codename_ar  text,
  mission_id   uuid references case_missions(id) on delete set null,
  mission_done boolean,
  joined_at    timestamptz not null default now(),
  -- ترتيب الوصول — الموقع عارف مين كتب الكود الأول، ودي ماينفعش تتكدب
  arrive_order int,
  unique (session_id, profile_id)
);
comment on table case_players is
  '⚠ **مفيهاش ولا سياسة قراية — ولا لصاحب الصف.** الدور بيوصل من fn_case_my_role بس. صف واحد مقروء = المتهم مكشوف.';
comment on column case_players.arrive_order is
  'ترتيب كتابة كود الدخول. الموقع عارفه لوحده فماينفعش يتكدب فيه — التلميح التالت بيتبنى منه (0133).';

create index if not exists case_players_session_idx on case_players (session_id);
create index if not exists case_players_profile_idx on case_players (profile_id);


-- ===== إجابات يوم الكشف =====
create table if not exists case_answers (
  id          uuid primary key default gen_random_uuid(),
  sbota_id    uuid not null references sbotat(id) on delete cascade,
  profile_id  uuid not null references profiles(id) on delete cascade,
  question_id uuid not null references case_questions(id) on delete cascade,
  option_id   uuid not null references case_options(id) on delete cascade,
  answered_at timestamptz not null default now(),
  unique (sbota_id, profile_id, question_id)
);
comment on table case_answers is
  'إجابات الأعضاء عن نفسهم. بتتمسح بعد الختام بـsettings.case_answers_keep_hours ومابتظهرش في أي مكان تاني في الموقع.';

create index if not exists case_answers_sbota_idx on case_answers (sbota_id);


-- ===== مين «صاحب الخروجة» في القضية؟ =====
-- نفس منطق `fn_sbota_arrival` بالظبط: الكابتن لو موجود، وإلا صاحب الخروجة،
-- وإلا **أقدم حجز مدفوع**. سبوطات نسبوط دلوقتي من غير كابتن، فالعملي هو
-- التالت — ودي سابقة موجودة في الموقع مش اختراع جديد.
create or replace function fn_case_host(s_id uuid)
returns uuid
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_s sbotat;
  v   uuid;
begin
  select * into v_s from sbotat where id = s_id;
  if not found then return null; end if;
  if v_s.captain_id is not null then return v_s.captain_id; end if;
  if v_s.host_id    is not null then return v_s.host_id;    end if;

  select b.profile_id into v
    from bookings b
   where b.sbota_id = s_id and b.status in ('paid','attended')
   order by b.created_at asc, b.id asc
   limit 1;
  return v;
end $$;
comment on function fn_case_host(uuid) is
  'مين ماسك القضية: الكابتن، وإلا صاحب الخروجة، وإلا أقدم حجز مدفوع — نفس منطق fn_sbota_arrival.';
revoke execute on function fn_case_host(uuid) from public, anon;
grant  execute on function fn_case_host(uuid) to authenticated;


-- ===== الحارس المركّب: هل أنا فعلًا في القضية دي؟ =====
-- ⚠ **مركّب، مش منسوخ.** `fn_case_can_host` (0130) + `fn_can_see_place`
--   (0105). أي تغيير في أي واحد منهم بيوصل هنا لوحده.
create or replace function fn_case_player_ok(s_id uuid, p_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_id is not null
     and fn_case_can_host(s_id)
     and fn_can_see_place(s_id, p_id);
$$;
comment on function fn_case_player_ok(uuid, uuid) is
  'هل الشخص ده من حقه يلعب القضية؟ = fn_case_can_host + fn_can_see_place. مركّب مش منسوخ (الدرس الستاشر).';
revoke execute on function fn_case_player_ok(uuid, uuid) from public, anon;
grant  execute on function fn_case_player_ok(uuid, uuid) to authenticated;


-- ===== بنك أسئلة الخروجة دي =====
-- ⚠ **مفيش `clue_ar` في الإخراج.** نص التلميح يوصل المتصفح = اللعبة مكشوفة.
--   والاختيار ثابت لكل سبوطة (`md5(sbota || question)`) علشان كل المجموعة
--   تجاوب نفس الأسئلة، ومن غير عمود جديد يتخزّن.
create or replace function fn_case_questions(s_id uuid)
returns table (question_id uuid, question_ar text, option_id uuid, option_value text, option_label_ar text, my_choice boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_n   int;
begin
  if not fn_case_player_ok(s_id, v_uid) then return; end if;
  select case_questions_count into v_n from settings limit 1;

  return query
    with picked as (
      select q.id, q.question_ar, q.sort
        from case_questions q
       where q.is_active and q.kind = 'answer'
       order by md5(s_id::text || q.id::text)
       limit coalesce(v_n, 12)
    )
    select p.id, p.question_ar, o.id, o.value, o.label_ar,
           exists (select 1 from case_answers a
                    where a.sbota_id = s_id and a.profile_id = v_uid and a.option_id = o.id)
      from picked p
      join case_options o on o.question_id = p.id
     order by p.sort, o.sort;
end $$;
comment on function fn_case_questions(uuid) is
  'الـ١٢ سؤال بتاع الخروجة دي + اختياراتي. ⚠ من غير clue_ar — نص التلميح عمره ما يوصل المتصفح.';
revoke execute on function fn_case_questions(uuid) from public, anon;
grant  execute on function fn_case_questions(uuid) to authenticated;


-- ===== أجاوب =====
create or replace function fn_case_answer(s_id uuid, p_option_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_q   uuid;
  v_n   int;
  v_built timestamptz;
begin
  if not fn_case_player_ok(s_id, v_uid) then
    raise exception 'مش من حقك تجاوب أسئلة الخروجة دي';
  end if;

  -- بعد ما المتهم يتختار، الإجابات بتتقفل — وإلا المتهم يغيّر إجابته
  -- ويبطّل التلميحات اللي اتحسبت منها.
  select cs.built_at into v_built from case_sessions cs where cs.sbota_id = s_id;
  if v_built is not null then
    raise exception 'القضية بدأت خلاص — الإجابات اتقفلت';
  end if;

  select o.question_id into v_q
    from case_options o
    join case_questions q on q.id = o.question_id
   where o.id = p_option_id and q.is_active and q.kind = 'answer';
  if v_q is null then
    raise exception 'الاختيار ده مش موجود';
  end if;

  -- ⚠ لازم السؤال يكون من **الـ١٢ بتوع الخروجة دي** — مش أي سؤال في البنك.
  --   من غير الشرط ده حد يجاوب أسئلة مش مسحوبة والتلميحات تتبنى من حاجة
  --   مالهاش لازمة.
  select case_questions_count into v_n from settings limit 1;
  if not exists (
    select 1 from (
      select q.id from case_questions q
       where q.is_active and q.kind = 'answer'
       order by md5(s_id::text || q.id::text)
       limit coalesce(v_n, 12)
    ) p where p.id = v_q
  ) then
    raise exception 'السؤال ده مش من أسئلة الخروجة دي';
  end if;

  insert into case_answers (sbota_id, profile_id, question_id, option_id)
  values (s_id, v_uid, v_q, p_option_id)
  on conflict (sbota_id, profile_id, question_id)
    do update set option_id = excluded.option_id, answered_at = now();
  return true;
end $$;
comment on function fn_case_answer(uuid, uuid) is
  'العضو بيجاوب سؤال عن نفسه. بترفض بعد ما القضية تبدأ، وبترفض أي سؤال مش من الـ١٢ بتوع الخروجة.';
revoke execute on function fn_case_answer(uuid, uuid) from public, anon;
grant  execute on function fn_case_answer(uuid, uuid) to authenticated;


-- ===== كم واحد جاوب (للشاشة: «٤ من ٦ جاوبوا») =====
create or replace function fn_case_answered_count(s_id uuid)
returns table (answered int, players int, mine int)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_n   int;
begin
  if not fn_case_player_ok(s_id, v_uid) then return; end if;
  select case_questions_count into v_n from settings limit 1;
  return query
    select (select count(distinct a.profile_id)::int from case_answers a
             where a.sbota_id = s_id
               and (select count(*) from case_answers x
                     where x.sbota_id = s_id and x.profile_id = a.profile_id) >= coalesce(v_n, 12)),
           (select count(*)::int from bookings b
             where b.sbota_id = s_id and b.status in ('paid','attended')),
           (select count(*)::int from case_answers a
             where a.sbota_id = s_id and a.profile_id = v_uid);
end $$;
comment on function fn_case_answered_count(uuid) is
  'كام واحد خلّص الأسئلة، وكام في المجموعة، وأنا جاوبت كام. أرقام بس — مفيش أسامي ولا إجابات.';
revoke execute on function fn_case_answered_count(uuid) from public, anon;
grant  execute on function fn_case_answered_count(uuid) to authenticated;


-- ===== إنشاء الجلسة (صاحب الخروجة أو اللوحة) =====
create or replace function fn_case_open(s_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_s   sbotat;
  v_id  uuid;
  v_code text;
begin
  -- 🔴 **`auth.uid()` فاضية مش «مرفوض» لوحدها.** `v_uid = fn_case_host(...)`
  -- بترجّع `null` مش `false`، و`if not (null)` ما بيتنفّذش — فالحارس بيعدّي
  -- بالصمت. نفس الغلطة اللي فتحت `fn_reveal` للنت كله في `0062` (§٥.٣).
  if v_uid is null then raise exception 'مش مسجّل'; end if;

  if not fn_case_can_host(s_id) then
    raise exception 'الخروجة دي مفيهاش قضية';
  end if;
  -- صاحب الخروجة، أو حساب لوحة عنده cases.edit
  if not (v_uid = fn_case_host(s_id) or fn_has_permission('cases.edit')) then
    raise exception 'صاحب الخروجة بس هو اللي يفتح القضية';
  end if;

  select * into v_s from sbotat where id = s_id;

  select id into v_id from case_sessions where sbota_id = s_id;
  if v_id is not null then return v_id; end if;

  -- ⚠ `gen_random_bytes` من pgcrypto، واسكيماها `extensions` على سوبابيس
  --   (الدرس التمنتاشر) — والـsearch_path فوق شايلها.
  v_code := lpad(((get_byte(gen_random_bytes(2), 0) * 256
                 + get_byte(gen_random_bytes(2), 1)) % 10000)::text, 4, '0');

  insert into case_sessions (sbota_id, case_id, entry_code, act)
  values (s_id, v_s.case_id, v_code, 'arrive')
  returning id into v_id;
  return v_id;
end $$;
comment on function fn_case_open(uuid) is
  'بيفتح جلسة القضية ويولّد كود الدخول (٤ أرقام). صاحب الخروجة أو cases.edit بس.';
revoke execute on function fn_case_open(uuid) from public, anon;
grant  execute on function fn_case_open(uuid) to authenticated;


-- ===== كود الدخول — لصاحب الخروجة بس =====
create or replace function fn_case_code(s_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return null; end if;
  if not (v_uid = fn_case_host(s_id) or fn_has_permission('cases.edit')) then return null; end if;
  return (select entry_code from case_sessions where sbota_id = s_id);
end $$;
comment on function fn_case_code(uuid) is
  'كود الدخول. صاحب الخروجة بس — هو اللي بيقوله بصوته. أي حد تاني بياخد null.';
revoke execute on function fn_case_code(uuid) from public, anon;
grant  execute on function fn_case_code(uuid) to authenticated;


-- ===== الدخول بالكود =====
create or replace function fn_case_join(s_id uuid, p_code text)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid := auth.uid();
  v_cs   case_sessions;
  v_lim  int;
  v_ord  int;
begin
  if not fn_case_player_ok(s_id, v_uid) then
    raise exception 'مش من حقك تدخل القضية دي';
  end if;

  select case_code_attempts into v_lim from settings limit 1;
  -- ⚠ محدود بعدد محاولات — من غير كده الكود ٤ أرقام يتخمّن في ثواني.
  --   `fn_rate_hit` موجودة من `0070`، فما بنكتبش عدّاد تاني (الدرس الستاشر).
  if not fn_rate_hit('case_join:' || s_id::text || ':' || v_uid::text,
                     coalesce(v_lim, 10), 600) then
    raise exception 'جرّبت كتير. استنى شوية وحاول تاني';
  end if;

  select * into v_cs from case_sessions where sbota_id = s_id;
  if not found then raise exception 'القضية مش مفتوحة لسه'; end if;

  if v_cs.entry_code <> btrim(coalesce(p_code, '')) then
    raise exception 'الكود غلط';
  end if;

  select coalesce(max(arrive_order), 0) + 1 into v_ord
    from case_players where session_id = v_cs.id;

  insert into case_players (session_id, profile_id, role, arrive_order)
  values (v_cs.id, v_uid, 'detective', v_ord)
  on conflict (session_id, profile_id) do nothing;
  return true;
end $$;
comment on function fn_case_join(uuid, text) is
  'الدخول بكود صاحب الخروجة. بيسجّل ترتيب الوصول (ودي ماينفعش تتكدب فيها). محدود بعدد محاولات.';
revoke execute on function fn_case_join(uuid, text) from public, anon;
grant  execute on function fn_case_join(uuid, text) to authenticated;


-- ===== «هتفرّج» =====
create or replace function fn_case_watch(s_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sid uuid;
begin
  if not fn_case_player_ok(s_id, v_uid) then
    raise exception 'مش من حقك';
  end if;
  select id into v_sid from case_sessions where sbota_id = s_id;
  if v_sid is null then raise exception 'القضية مش مفتوحة لسه'; end if;

  -- بعد ما الأدوار تتوزّع ماينفعش يتحوّل متفرّج — المتهم كان هيهرب بكده.
  if exists (select 1 from case_sessions where id = v_sid and built_at is not null) then
    raise exception 'القضية بدأت خلاص';
  end if;

  insert into case_players (session_id, profile_id, role)
  values (v_sid, v_uid, 'watcher')
  on conflict (session_id, profile_id) do update set role = 'watcher';
  return true;
end $$;
comment on function fn_case_watch(uuid) is
  'اللي مش عايز يلعب بيفضل مع المجموعة وماياخدش دور. وماحدش بيسأله ليه. بترفض بعد ما الأدوار تتوزّع.';
revoke execute on function fn_case_watch(uuid) from public, anon;
grant  execute on function fn_case_watch(uuid) to authenticated;


-- ===== حالة الجلسة (للكل) — من غير أي سر =====
create or replace function fn_case_state(s_id uuid)
returns table (
  session_id uuid, act case_act_t, act_started_at timestamptz, started boolean,
  world_slug text, world_name_ar text, theme text, codenames boolean,
  detective_name_ar text, suspect_name_ar text, has_act2_event boolean,
  case_slug text, case_title_ar text, shape case_shape_t, intro_ar text,
  joined int, players int, i_am_in boolean, i_am_host boolean, outcome text,
  card_seconds int, hint_after_min int, talk_min int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if not fn_case_player_ok(s_id, v_uid) then return; end if;
  return query
    select cs.id, cs.act, cs.act_started_at, cs.built_at is not null,
           w.slug, w.name_ar, w.theme, w.codenames,
           w.detective_name_ar, w.suspect_name_ar, w.has_act2_event,
           c.slug, c.title_ar, c.shape, c.intro_ar,
           (select count(*)::int from case_players pl where pl.session_id = cs.id),
           (select count(*)::int from bookings b
             where b.sbota_id = s_id and b.status in ('paid','attended')),
           exists (select 1 from case_players pl where pl.session_id = cs.id and pl.profile_id = v_uid),
           v_uid = fn_case_host(s_id),
           cs.outcome,
           st.case_card_seconds, st.case_hint_after_min, st.case_talk_min
      from case_sessions cs
      join cases c       on c.id = cs.case_id
      join case_worlds w on w.slug = c.world_slug
     cross join (select * from settings limit 1) st
     where cs.sbota_id = s_id;
end $$;
comment on function fn_case_state(uuid) is
  'حالة القضية للاعب: الفصل والعالم والمقدمة والأعداد. ⚠ مفيهاش الكود ولا الأدوار ولا التلميحات.';
revoke execute on function fn_case_state(uuid) from public, anon;
grant  execute on function fn_case_state(uuid) to authenticated;


-- ===== 🔴 دورك إنت — وبس =====
-- ⚠ **دي الدالة اللي اللعبة كلها متعلّقة بيها.** بترجّع **صف واحد**: بتاعك.
--   مفيش parameter لشخص تاني، ومفيش جدول أدوار مقروء من المتصفح.
create or replace function fn_case_my_role(s_id uuid)
returns table (role case_role_t, card_ar text, codename_ar text,
               mission_ar text, mission_done boolean, arrive_order int, partner_codename_ar text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_cs  case_sessions;
  v_pl  case_players;
begin
  if not fn_case_player_ok(s_id, v_uid) then return; end if;

  select * into v_cs from case_sessions where sbota_id = s_id;
  if not found then return; end if;
  -- قبل ما الأدوار تتوزّع مفيش دور يتقال
  if v_cs.built_at is null then return; end if;

  select * into v_pl from case_players where session_id = v_cs.id and profile_id = v_uid;
  if not found then return; end if;

  return query
    select v_pl.role,
           case v_pl.role
             when 'suspect'   then c.suspect_card_ar
             when 'detective' then c.detective_card_ar
             else null
           end,
           v_pl.codename_ar,
           -- المهمة السرية للمتهم بس
           case when v_pl.role = 'suspect' then ms.text_ar else null end,
           case when v_pl.role = 'suspect' then v_pl.mission_done else null end,
           v_pl.arrive_order,
           -- «العميلين»: المتهم بيعرف شريكه بالاسم الحركي بس (0135)
           case when v_pl.role = 'suspect' and c.shape = 'double'
                then (select p2.codename_ar from case_players p2
                       where p2.session_id = v_cs.id and p2.role = 'suspect'
                         and p2.profile_id <> v_uid limit 1)
                else null
           end
      from cases c
      left join case_missions ms on ms.id = v_pl.mission_id
     where c.id = v_cs.case_id;
end $$;
comment on function fn_case_my_role(uuid) is
  '🔴 دورك إنت بس وكارتك. مفيش parameter لشخص تاني. هوية المتهم عمرها ما توصل متصفح غير بتاعه.';
revoke execute on function fn_case_my_role(uuid) from public, anon;
grant  execute on function fn_case_my_role(uuid) to authenticated;


-- ===== RLS — مفيش ولا سياسة قراية للعضو =====
alter table case_sessions enable row level security;
alter table case_players  enable row level security;
alter table case_answers  enable row level security;

do $$ begin
  -- القراية للوحة بس. العضو بياخد كل حاجة من الدوال فوق.
  if not exists (select 1 from pg_policies where tablename='case_sessions' and policyname='case_sessions_admin_read') then
    create policy case_sessions_admin_read on case_sessions for select using (fn_has_permission('cases.view'));
  end if;
  if not exists (select 1 from pg_policies where tablename='case_sessions' and policyname='case_sessions_admin_write') then
    create policy case_sessions_admin_write on case_sessions for all
      using (fn_has_permission('cases.edit')) with check (fn_has_permission('cases.edit'));
  end if;

  -- ⚠ `case_players` قراية للوحة بـ`cases.view` بس — **ومفيش سياسة
  --   للعضو ولا لصاحب الصف**. صف واحد مقروء من المتصفح = المتهم مكشوف.
  if not exists (select 1 from pg_policies where tablename='case_players' and policyname='case_players_admin_read') then
    create policy case_players_admin_read on case_players for select using (fn_has_permission('cases.view'));
  end if;

  -- `case_answers`: اللوحة تقرا، والكتابة من `fn_case_answer` بس.
  if not exists (select 1 from pg_policies where tablename='case_answers' and policyname='case_answers_admin_read') then
    create policy case_answers_admin_read on case_answers for select using (fn_has_permission('cases.view'));
  end if;
end $$;

create or replace trigger t_case_sessions_updated before update on case_sessions
  for each row execute function set_updated_at();


-- ===== الاختبار =====
-- ⚠ صف للممنوع **وصف للمسموح** بنفس الهوية الحقيقية (الدرس أربعة وعشرين).
create or replace function test_case_roles()
returns table (test text, result text)
language plpgsql
set search_path = public
as $body$
declare
  names text[] := array[
    '0132 · 🔴 زائر مجهول ما بيقراش اللاعبين',
    '0132 · 🔴 عضو ما بيقراش جدول اللاعبين (ولا صفه)',
    '0132 · 🔴 عضو ما بيقراش الجلسات (الكود جواها)',
    '0132 · 🔴 عضو ما بيكتبش في اللاعبين مباشرة',
    '0132 · عضو من المجموعة بياخد الـ١٢ سؤال',
    '0132 · 🔴 الأسئلة بترجع من غير نص التلميح',
    '0132 · عضو من المجموعة بيجاوب فعلًا',
    '0132 · 🔴 اللي مش حاجز ما بيجاوبش',
    '0132 · 🔴 سؤال مش من أسئلة الخروجة بيترفض',
    '0132 · 🔴 الإجابات بتتقفل بعد ما القضية تبدأ',
    '0132 · صاحب الخروجة بياخد الكود',
    '0132 · 🔴 حد تاني بياخد null مكان الكود',
    '0132 · 🔴 كود غلط بيترفض',
    '0132 · كود صح بيدخّل ويسجّل ترتيب الوصول',
    '0132 · 🔴 المحقق بياخد كارت المحقق مش المتهم',
    '0132 · 🔴 المتهم هو الوحيد اللي بياخد كارت المتهم',
    '0132 · 🔴 fn_case_my_role مفيهاش parameter لشخص تاني',
    '0132 · 🔴 مفيش سياسة قراية للعضو على جداول اللعبة',
    '0132 · 🔴 المجهول ما بيفتحش جلسة قضية (auth.uid() فاضية)'];
  r        text[] := '{}';
  n        int;
  v_s      uuid := '77777777-0000-0000-0000-000000000001';  -- سبوطة البذرة بـ٣ حجوزات مدفوعة
  m1       uuid := '33333333-0000-0000-0000-000000000001';
  m3       uuid := '33333333-0000-0000-0000-000000000003';
  outsider uuid := '44444444-0000-0000-0000-000000000001';
  v_case   uuid;
  v_sess   uuid;
  v_opt    uuid;
  v_other  uuid;
  m5       uuid := '33333333-0000-0000-0000-000000000005';
  v_role   case_role_t;
  v_card   text;
  v_code   text;
  v_dcard  text;
  v_scard  text;
  i        int;
begin
  if not exists (select 1 from profiles where id = m3) then
    test := '0132 · الأدوار'; result := 'معلومة — محتاج البذرة المؤقتة (fn_test_seed_up)';
    return next; return;
  end if;

  begin
    -- تجهيز: المفتاح مفتوح · قضية على سبوطة نسبوط · الكشف عدّى
    update feature_flags set is_on = true where key = 'cases';
    select id into v_case from cases where slug = 'meen-kal-elmahshi';
    update sbotat set case_id = v_case, origin = 'nasbot', status = 'open',
                      reveal_at = now() - interval '1 hour'
     where id = v_s;

    -- ⚠ **القيم المتوقّعة بتتقرا هنا، بهوية postgres.** لو قريناها وإحنا
    --   لابسين دور العضو، RLS بتمنع الجدول فترجع null والمقارنة تطلع
    --   «فشل» على دالة سليمة — نفس درس CHECK_DB («رجّع الدور بين كل خطوة»).
    select detective_card_ar, suspect_card_ar into v_dcard, v_scard
      from cases where id = v_case;

    -- الجلسة (بنعملها بإيدنا هنا — fn_case_open بتتجرّب في اللوحة)
    insert into case_sessions (sbota_id, case_id, entry_code, act)
    values (v_s, v_case, '1234', 'arrive')
    on conflict (sbota_id) do update set entry_code = '1234', act = 'arrive', built_at = null
    returning id into v_sess;

    -- (١) الزائر المجهول
    set local role anon;
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    select count(*) into n from case_players;
    r := r || case when n = 0 then 'نجح'::text else format('فشل — 🔴 المجهول شاف %s لاعب', n) end;
    reset role; perform set_config('request.jwt.claims', '', true);

    -- (٢)(٣)(٤) عضو من المجموعة نفسها
    -- ⚠ **لازم يكون له صف هو كمان.** أول نسخة كانت بتدخّل m1 بس، فالعضو
    --   اللي بنفحص بيه (m3) مكانش له صف — وسياسة «اقرا صفك» بترجّع صفر
    --   وتعدّي من الفاحص. الفخ ده ما اتمسكش فعلًا وقت الكتابة.
    insert into case_players (session_id, profile_id, role) values
      (v_sess, m1, 'suspect'), (v_sess, m3, 'detective')
    on conflict (session_id, profile_id) do update set role = excluded.role;

    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', m3), true);
    select count(*) into n from case_players;
    r := r || case when n = 0 then 'نجح'::text else format('فشل — 🔴 عضو شاف %s لاعب', n) end;
    select count(*) into n from case_sessions;
    r := r || case when n = 0 then 'نجح'::text else format('فشل — 🔴 عضو شاف %s جلسة', n) end;
    begin
      insert into case_players (session_id, profile_id, role) values (v_sess, m5, 'detective');
      r := r || 'فشل — 🔴 عضو كتب في اللاعبين'::text;
    exception when others then r := r || 'نجح'::text;
    end;

    -- (٥)(٦) الأسئلة
    select count(distinct question_id) into n from fn_case_questions(v_s);
    r := r || case when n = 12 then 'نجح'::text else format('فشل — %s سؤال بدل 12', n) end;
    reset role; perform set_config('request.jwt.claims', '', true);

    select count(*) into n from information_schema.routines rt
      join information_schema.parameters pr
        on pr.specific_name = rt.specific_name
     where rt.routine_name = 'fn_case_questions' and pr.parameter_name ilike '%clue%';
    r := r || case when n = 0 then 'نجح'::text else 'فشل — 🔴 clue_ar في إخراج الأسئلة' end;

    -- (٧) عضو بيجاوب **فعلًا** (الدرس أربعة وعشرين)
    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', m3), true);
    select option_id into v_opt from fn_case_questions(v_s) limit 1;
    begin
      perform fn_case_answer(v_s, v_opt);
      -- ⚠ العدّ **بعد** ما نرجّع الدور: الجدول مقفول على العضو بـRLS
      reset role; perform set_config('request.jwt.claims', '', true);
      select count(*) into n from case_answers where sbota_id = v_s and profile_id = m3;
      r := r || case when n = 1 then 'نجح'::text else format('فشل — %s إجابة', n) end;
    exception when others then
      reset role; perform set_config('request.jwt.claims', '', true);
      r := r || ('فشل — 🔴 عضو مقدرش يجاوب: ' || sqlerrm);
    end;

    -- (٨) اللي مش حاجز
    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', outsider), true);
    begin
      perform fn_case_answer(v_s, v_opt);
      r := r || 'فشل — 🔴 اللي مش حاجز جاوب'::text;
    exception when others then r := r || 'نجح'::text;
    end;
    reset role; perform set_config('request.jwt.claims', '', true);

    -- (٩) سؤال بره الـ١٢
    -- ⚠ `fn_case_questions` بترجّع فاضي لـpostgres (`auth.uid()` = null)،
    --   فلو اعتمدنا عليها هنا الاستثناء كان بيبقى فاضي وأي سؤال «بره».
    --   بنحسب نفس الـ١٢ بنفس ترتيب الـmd5 بالظبط.
    select o.id into v_other from case_options o
      join case_questions q on q.id = o.question_id
     where q.is_active and q.kind = 'answer'
       and q.id not in (
         select d.id from (
           select q2.id from case_questions q2
            where q2.is_active and q2.kind = 'answer'
            order by md5(v_s::text || q2.id::text)
            limit (select coalesce(case_questions_count, 12) from settings limit 1)
         ) d)
     limit 1;
    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', m3), true);
    if v_other is null then
      r := r || 'معلومة — كل الأسئلة مسحوبة فمفيش سؤال بره'::text;
    else
      begin
        perform fn_case_answer(v_s, v_other);
        r := r || 'فشل — 🔴 سؤال من بره الخروجة اتقبل'::text;
      exception when others then r := r || 'نجح'::text;
      end;
    end if;
    reset role; perform set_config('request.jwt.claims', '', true);

    -- (١٠) الإجابات بتتقفل بعد البداية
    update case_sessions set built_at = now() where id = v_sess;
    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', m3), true);
    begin
      perform fn_case_answer(v_s, v_opt);
      r := r || 'فشل — 🔴 جاوب بعد ما القضية بدأت'::text;
    exception when others then r := r || 'نجح'::text;
    end;
    reset role; perform set_config('request.jwt.claims', '', true);

    -- (١١)(١٢) الكود — صاحب الخروجة = أقدم حجز مدفوع
    set local role authenticated;
    perform set_config('request.jwt.claims',
      format('{"sub":"%s","role":"authenticated"}', fn_case_host(v_s)), true);
    v_code := fn_case_code(v_s);
    r := r || case when v_code = '1234' then 'نجح'::text else format('فشل — رجّع %s', coalesce(v_code,'null')) end;
    reset role; perform set_config('request.jwt.claims', '', true);

    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}',
      (select b.profile_id from bookings b where b.sbota_id = v_s
        and b.status in ('paid','attended') and b.profile_id <> fn_case_host(v_s) limit 1)), true);
    v_code := fn_case_code(v_s);
    r := r || case when v_code is null then 'نجح'::text else format('فشل — 🔴 حد تاني شاف الكود %s', v_code) end;
    reset role; perform set_config('request.jwt.claims', '', true);

    -- (١٣)(١٤) الدخول
    update case_sessions set built_at = null where id = v_sess;
    delete from case_players where session_id = v_sess and profile_id = m3;
    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', m3), true);
    begin
      perform fn_case_join(v_s, '9999');
      r := r || 'فشل — 🔴 كود غلط عدّى'::text;
    exception when others then
      r := r || case when sqlerrm like '%الكود غلط%' then 'نجح'::text
                     else ('فشل — رفض بسبب تاني: ' || sqlerrm) end;
    end;
    begin
      perform fn_case_join(v_s, '1234');
      reset role; perform set_config('request.jwt.claims', '', true);
      select arrive_order into n from case_players where session_id = v_sess and profile_id = m3;
      r := r || case when n is not null then 'نجح'::text else 'فشل — دخل من غير ترتيب وصول' end;
    exception when others then
      reset role; perform set_config('request.jwt.claims', '', true);
      r := r || ('فشل — 🔴 كود صح اترفض: ' || sqlerrm);
    end;

    -- (١٥)(١٦) الكروت — المحقق مش بياخد كارت المتهم
    update case_sessions set built_at = now() where id = v_sess;
    update case_players set role = 'detective' where session_id = v_sess and profile_id = m3;
    update case_players set role = 'suspect'   where session_id = v_sess and profile_id = m1;

    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', m3), true);
    select role, card_ar into v_role, v_card from fn_case_my_role(v_s);
    r := r || case when v_role = 'detective'
                    and v_card = v_dcard
                   then 'نجح'::text
                   else format('فشل — 🔴 المحقق شاف %s', coalesce(v_role::text,'null')) end;
    -- والأهم: عدد الصفوف الراجعة = ١ (بتاعي)
    select count(*) into n from fn_case_my_role(v_s);
    reset role; perform set_config('request.jwt.claims', '', true);

    set local role authenticated;
    perform set_config('request.jwt.claims', format('{"sub":"%s","role":"authenticated"}', m1), true);
    select role, card_ar into v_role, v_card from fn_case_my_role(v_s);
    r := r || case when v_role = 'suspect' and n = 1
                    and v_card = v_scard
                   then 'نجح'::text
                   else format('فشل — 🔴 المتهم شاف %s · والمحقق رجّعله %s صف', coalesce(v_role::text,'null'), n) end;
    reset role; perform set_config('request.jwt.claims', '', true);

    -- (١٧) الشكل: الدالة ماخدش غير sbota_id — مفيش parameter لشخص تاني
    select count(*) into n from information_schema.parameters
     where specific_name = (select specific_name from information_schema.routines
                             where routine_name = 'fn_case_my_role' limit 1)
       and parameter_mode = 'IN';
    r := r || case when n = 1 then 'نجح'::text else format('فشل — 🔴 %s مدخل بدل 1', n) end;

    -- (١٨) الشكل: أي سياسة قراية على جداول اللعبة لازم تكون على `cases.view`
    --      بس. سياسة بتشاور على `auth.uid()` = باب للمتصفح، وده اللي
    --      الدالة معمولة علشان تقفله.
    select count(*) into n from pg_policies
     where tablename in ('case_players','case_sessions','case_answers')
       and cmd in ('SELECT','ALL')
       and (coalesce(qual,'') ilike '%auth.uid()%' or coalesce(qual,'') in ('true','TRUE'));
    r := r || case when n = 0 then 'نجح'::text
                   else format('فشل — 🔴 %s سياسة قراية للعضو', n) end;

    -- (١٩) 🔴 المجهول ما بيفتحش جلسة — الحارس كان بيعدّيه لأن
    --      `null = host` بترجّع null مش false.
    set local role anon;
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    begin
      perform fn_case_open(v_s);
      r := r || 'فشل — 🔴 المجهول فتح جلسة'::text;
    exception when others then r := r || 'نجح'::text;
    end;
    reset role; perform set_config('request.jwt.claims', '', true);

    raise exception 'test_case_roles_rollback';
  exception when others then
    reset role;
    perform set_config('request.jwt.claims', '', true);
    if sqlerrm <> 'test_case_roles_rollback' then
      r := r || ('فشل — استثناء: ' || sqlerrm);
    end if;
  end;

  for i in 1 .. array_length(r, 1) loop
    test := coalesce(names[i], '0132 · الاختبار');
    result := r[i];
    return next;
  end loop;
end $body$;

comment on function test_case_roles() is
  '0132 — الأدوار والكروت والكود والإجابات: الممنوع بيترفض **والمسموح بينجح**، وهوية المتهم ما بتوصلش متصفح تاني.';
revoke execute on function test_case_roles() from public, anon, authenticated;
