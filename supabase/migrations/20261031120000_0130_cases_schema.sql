-- ============================================================================
-- 0130 · «قضية الليلة» — الجداول والحراس ومفتاح الميزة
--
-- طلب المالك (٢٠٢٦-١٠-٣١): كل سبوطة فيها **قضية** — واحد من المجموعة سرّي
-- هو المتهم، والباقيين فريق بيكشفه. والتلميحات عن المتهم متبنية من إجاباته
-- هو عن نفسه، يعني ما تعرفوش المتهم غير لما تعرفوا بعض كلكم.
--
-- الملف ده **البنية بس** — المحتوى (العوالم والقضايا والأسئلة) في `0131`،
-- والجلسة والأدوار في `0132`، والتلميحات في `0133`، والتصويت في `0134`.
--
-- ⚠ **ليه `case_*` مش `game_*`؟** فيه `game_questions` و`game_options`
--   و`game_sessions` و`game_option_scores` موجودين من `0036` — دي لعبة
--   «مين جاي؟» (الشخصية)، حاجة تانية خالص. البادئة `case_` بتمنع التعارض،
--   وكمان مطابقة لاسم القسم في اللوحة («القضايا»).
--
-- ⚠ **كل جداول المحتوى مقفولة على اللوحة** (`cases.view`/`cases.edit`)،
--   والعضو بياخد اللي يحتاجه من دوال `security definer` في `0132`+.
--   السبب: `case_options.clue_ar` فيه نص التلميح («المتهم بيصحى بدري»)،
--   و`cases.suspect_card_ar` فيه كارت المتهم. سياسة قراية عامة على
--   الجداول دي = أي حد يفتح أدوات المطور يقرا اللعبة كلها قبل ما تبدأ.
--   ده نفس نوع الغلطة اللي كشفت اسم المكان قبل الدفع (الدرس حداشر).
--
-- ⚠ اللعبة في **سبوطات نسبوط بس** في الأول (قرار المالك ٢٠٢٦-١٠-٣١) —
--   `fn_case_can_host` هي المصدر الواحد للقاعدة دي، وكل دالة بتناديها
--   ما تنسخهاش (الدرس الستاشر).
--
-- آمنة تتكرر. مفيهاش `drop` ولا `delete` (أداة Supabase MCP بتعلّق عليهم).
-- ============================================================================

-- ===== أنواع =====
-- `create type` جديد في نفس المعاملة آمن — المصيدة هي `alter type … add value`
-- (القيمة الجديدة ما تنفعش تتستعمل في نفس المعاملة). مفيش `alter type` هنا.
do $$ begin
  if not exists (select 1 from pg_type where typname = 'case_shape_t') then
    create type case_shape_t as enum ('single', 'double', 'vault');
  end if;
  if not exists (select 1 from pg_type where typname = 'case_act_t') then
    create type case_act_t as enum ('setup', 'arrive', 'act1', 'break1', 'act2', 'break2', 'final', 'done');
  end if;
end $$;

comment on type case_shape_t is
  'شكل القضية: single = متهم واحد · double = عميلين عارفين بعض (٨+) · vault = الخزنة من غير متهم.';
comment on type case_act_t is
  'فصول القضية بالترتيب. `break1`/`break2` = النشاط نفسه (الموبايلات في الجيب).';


-- ===== العوالم =====
create table if not exists case_worlds (
  slug              text primary key,
  name_ar           text not null,
  -- أسامي الفريقين في العالم ده: «المفتشين»/«المتهم» · «العملاء»/«العميل المزدوج»
  detective_name_ar text not null,
  suspect_name_ar   text not null,
  mood_ar           text,
  -- الثيم البصري: mono (أبيض وأسود) · dark (غامق وختم سري) · warm (كريمي وملوّن)
  theme             text not null default 'mono',
  -- أسماء حركية لكل واحد (عالم «المهمة» بس) — بتكسر حرج الأسامي اللي محدش فاكرها
  codenames         boolean not null default false,
  -- «مين عملها؟» مفيهوش حدث في الفصل التاني — التلميح بيجي على لسان فرد من العيلة
  has_act2_event    boolean not null default true,
  sort              int not null default 0,
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint case_worlds_theme_known check (theme in ('mono', 'dark', 'warm'))
);
comment on table case_worlds is
  'عوالم القضايا — الجو والأسامي والثيم. المحتوى بيتعدّل من /admin/cases.';
comment on column case_worlds.codenames is
  'كل واحد بياخد اسم حركي في أول اللعبة (النسر · الصقر · الثعلب) وبينادوا بيه طول الليلة.';


-- ===== القضايا =====
create table if not exists cases (
  id                 uuid primary key default gen_random_uuid(),
  world_slug         text not null references case_worlds(slug) on delete restrict,
  slug               text not null unique,
  title_ar           text not null,
  shape              case_shape_t not null default 'single',
  intro_ar           text not null,
  detective_card_ar  text not null,
  suspect_card_ar    text not null,
  act2_event_ar      text,
  win_ending_ar      text not null,
  escape_ending_ar   text not null,
  twist_ar           text,
  min_players        int not null default 5,
  max_players        int,
  sort               int not null default 0,
  is_active          boolean not null default true,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now(),
  constraint cases_players_sane check (max_players is null or max_players >= min_players),
  -- «الخزنة» مفيهاش متهم فالكروت مش مطلوبة منطقيًا، بس الأعمدة `not null`
  -- فبتتملا بنص الخزنة نفسه. الشرط هنا على العدد: «العميلين» ٨+ بالملف.
  constraint cases_double_needs_eight check (shape <> 'double' or min_players >= 8)
);
comment on table cases is
  'القضايا — المقدمة والكروت والحدث والنهايتين. أي قضية جديدة ٢٠ دقيقة كتابة.';
comment on column cases.twist_ar is
  'النهاية المفاجئة لو اتقفش (الجواب المجهول: كان عايز يعمله حفلة عيد ميلاد).';
comment on column cases.suspect_card_ar is
  '⚠ ده كارت المتهم. ممنوع يتعرض لأي حد غير اللي دوره متهم فعلًا — عبر fn_case_my_role بس.';

create index if not exists cases_world_idx  on cases (world_slug);
create index if not exists cases_active_idx on cases (is_active) where is_active;


-- ===== بنك أسئلة يوم الكشف =====
-- الإجابة **باختيار مش بكتابة حرة** — علشان الموقع يعرف يبني منها تلميح
-- ويعدّ الناس اللي بينطبق عليهم.
create table if not exists case_questions (
  id          uuid primary key default gen_random_uuid(),
  slug        text not null unique,
  question_ar text not null,
  -- answer   = العضو بيجاوبها يوم الكشف، والمتهم يقدر يكدب فيها
  -- observed = الموقع أو الكل شايفها، فماينفعش تتكدب (اللبس · ترتيب الوصول)
  kind        text not null default 'answer',
  sort        int not null default 0,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint case_questions_kind_known check (kind in ('answer', 'observed'))
);
comment on table case_questions is
  'أسئلة يوح الكشف — الشرط الوحيد في أي سؤال جديد: لو الإجابة اتقالت قدام ٥ غرباء، محدش هيتكسف منها.';
comment on column case_questions.kind is
  'observed = حاجة ماينفعش يتكدب فيها (الكل شايفها) — دي اللي التلميح التالت بيتبنى منها.';

create table if not exists case_options (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references case_questions(id) on delete cascade,
  value       text not null,
  label_ar    text not null,
  -- نص التلميح لما المتهم يكون مختار ده: «المتهم مبيشربش قهوة»
  clue_ar     text not null,
  sort        int not null default 0,
  created_at  timestamptz not null default now(),
  unique (question_id, value)
);
comment on table case_options is
  'اختيارات كل سؤال ونص التلميح بتاع كل اختيار. ⚠ clue_ar ممنوع يوصل أي متصفح قبل فصله.';
comment on column case_options.clue_ar is
  'التلميح بيوصف الموقف مش الشخص. «بينسى يرد على الرسايل» ماشي؛ «مابيهتمش بحد» ممنوع، ومفيش تلميح عن الشكل أو الجسم.';

create index if not exists case_options_q_idx on case_options (question_id, sort);


-- ===== المهمات السرية =====
-- المتهم بياخد واحدة عشوائي. لو خلّصها من غير ما حد ياخد باله بيكسب نص
-- النقط حتى لو اتقفش — عشان يبقى ليه دور يلعبه مش بس يستخبى.
create table if not exists case_missions (
  id         uuid primary key default gen_random_uuid(),
  slug       text not null unique,
  text_ar    text not null,
  fits_ar    text,
  -- null = مناسبة لأي عالم
  world_slug text references case_worlds(slug) on delete set null,
  sort       int not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table case_missions is
  'المهمات السرية للمتهم. أي مهمة جديدة لازم تعدّي من تلات شروط: مفيهاش لمس، ومفيهاش إحراج لحد، ومفيهاش سؤال عن حاجة شخصية.';


-- ===== الألقاب =====
-- كل واحد بيمشي بلقب، عشان محدش يروح وهو حاسس إنه خسر.
create table if not exists case_titles (
  key        text primary key,
  name_ar    text not null,
  rule_ar    text not null,
  sort       int not null default 0,
  is_active  boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table case_titles is
  'ألقاب الختام — الموقع بيحسبها من اللي حصل في اللعبة. مفيش لوحة ترتيب عامة (قرار المالك).';


-- ===== ربط القالب بعالم · والقضية بالخروجة =====
alter table sbota_templates add column if not exists case_world text references case_worlds(slug) on delete set null;
comment on column sbota_templates.case_world is
  'العالم الافتراضي لأي خروجة من القالب ده. null = مفيش قضية. صاحب الخروجة يقدر يغيّره.';

alter table sbotat add column if not exists case_id uuid references cases(id) on delete set null;
comment on column sbotat.case_id is
  'القضية المختارة للخروجة دي. null = مفيش قضية. المسبوط اللي رجع ماياخدش نفس القضية مرتين (0133).';

create index if not exists sbotat_case_idx on sbotat (case_id) where case_id is not null;


-- ===== الأرقام — في `settings` مش في الكود (§٣.٢) =====
-- الأوقات دي لسبوطة من ٣ ساعات، وتتظبط من اللوحة.
alter table settings add column if not exists case_arrive_min        int not null default 10;
alter table settings add column if not exists case_act1_min          int not null default 15;
alter table settings add column if not exists case_act2_min          int not null default 10;
alter table settings add column if not exists case_final_min         int not null default 20;
alter table settings add column if not exists case_talk_min          int not null default 5;
alter table settings add column if not exists case_hint_after_min    int not null default 10;
alter table settings add column if not exists case_card_seconds      int not null default 5;
alter table settings add column if not exists case_answers_keep_hours int not null default 2;
alter table settings add column if not exists case_min_players       int not null default 5;
alter table settings add column if not exists case_code_attempts     int not null default 10;
alter table settings add column if not exists case_questions_count   int not null default 12;

comment on column settings.case_min_players is
  'أقل من كده بتلعب «الخزنة» بس — في أربعة المتهم بيبان من أول تلميح.';
comment on column settings.case_answers_keep_hours is
  'الإجابات بتتمسح بعد السبوطة. بتفضل الساعات دي بس بعد الختام ومابتظهرش في أي مكان تاني.';
comment on column settings.case_card_seconds is
  'الكارت بيرجع يتقفل لوحده بعد كام ثانية — الموبايل كارت مقلوب.';

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'settings_case_times_sane') then
    alter table settings add constraint settings_case_times_sane check (
      case_arrive_min between 1 and 60
      and case_act1_min between 1 and 120
      and case_act2_min between 1 and 120
      and case_final_min between 1 and 120
      and case_talk_min between 1 and 60
      and case_hint_after_min between 1 and 60
      and case_card_seconds between 2 and 60
      and case_answers_keep_hours between 1 and 72
      and case_min_players between 3 and 20
      and case_code_attempts between 3 and 50
      and case_questions_count between 4 and 30
    );
  end if;
end $$;


-- ===== مفتاح الميزة =====
-- ⚠ الاحتياطي في `src/data/flags-fallback.ts` **مفتوح** زي كل المفاتيح،
--   بس المفتاح نفسه بينزل **مقفول** هنا: مفيش ولا قضية محتوى لسه (`0131`)،
--   ومفيش شاشات. المالك يفتحه من /admin/settings لما يكون جاهز.
insert into feature_flags (key, name_ar, is_on, off_message_ar) values
  ('cases', 'قضية الليلة', false, 'القضية مقفولة دلوقتي — جايالك قريب.')
on conflict (key) do nothing;


-- ===== الصلاحيات =====
insert into admin_permissions (key, name_ar, group_ar) values
  ('cases.view', 'يشوف القضايا والعوالم', 'القضايا'),
  ('cases.edit', 'يكتب ويعدّل القضايا والأسئلة والمهمات', 'القضايا')
on conflict (key) do nothing;

-- `ops` بيشغّل اللعبة، و`support` لأ (نفس منطق الأسعار في `0056`)
insert into role_permissions (role_key, permission_key) values
  ('owner', 'cases.view'), ('owner', 'cases.edit'),
  ('admin', 'cases.view'), ('admin', 'cases.edit'),
  ('ops',   'cases.view'), ('ops',   'cases.edit')
on conflict do nothing;


-- ===== RLS =====
-- ⚠ **مفيش ولا سياسة قراية عامة على أي جدول من دول.** العضو بياخد اللي
--   يحتاجه من دوال `security definer` في `0132`+ (بنك الأسئلة من غير
--   `clue_ar`، وكارت دوره هو بس). القراية هنا للوحة والكتابة بـ`cases.edit`.
alter table case_worlds    enable row level security;
alter table cases          enable row level security;
alter table case_questions enable row level security;
alter table case_options   enable row level security;
alter table case_missions  enable row level security;
alter table case_titles    enable row level security;

do $$
declare
  t text;
begin
  foreach t in array array['case_worlds','cases','case_questions','case_options','case_missions','case_titles']
  loop
    -- القراية: أي حساب لوحة عنده cases.view (القراية للإدارة على fn_is_admin
    -- في جداول تانية عن قصد — هنا أضيق لأن الجداول دي فيها حل اللعبة)
    if not exists (select 1 from pg_policies where tablename = t and policyname = t || '_admin_read') then
      execute format(
        'create policy %I on %I for select using (fn_has_permission(%L))',
        t || '_admin_read', t, 'cases.view');
    end if;
    -- الكتابة: cases.edit — مش fn_is_admin() (الدرس من `0056`: support كان بيغيّر الأسعار)
    if not exists (select 1 from pg_policies where tablename = t and policyname = t || '_admin_write') then
      execute format(
        'create policy %I on %I for all using (fn_has_permission(%L)) with check (fn_has_permission(%L))',
        t || '_admin_write', t, 'cases.edit', 'cases.edit');
    end if;
  end loop;
end $$;

create or replace trigger t_case_worlds_updated    before update on case_worlds    for each row execute function set_updated_at();
create or replace trigger t_cases_updated          before update on cases          for each row execute function set_updated_at();
create or replace trigger t_case_questions_updated before update on case_questions for each row execute function set_updated_at();
create or replace trigger t_case_missions_updated  before update on case_missions  for each row execute function set_updated_at();


-- ===== الحارس الواحد: مين من حقه تبقى فيه قضية؟ =====
-- ⚠ **قرار المالك (٢٠٢٦-١٠-٣١): سبوطات نسبوط بس في الأول.** خروجات
--   الأعضاء مجانية ومن غير إشراف، واللعبة فيها معناها إن الموقع بيدير
--   قضية في خروجة مش شايفها.
--
-- ⚠ ودي **دالة واحدة بينادوها الكل** — مش شرط مكتوب في كل دالة. الدرس
--   الستاشر: أول ما تنسخ حارس علشان تخدم سياق تاني، النسختين بيفترقوا.
create or replace function fn_case_can_host(s_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_s sbotat;
  v_on boolean;
begin
  select is_on into v_on from feature_flags where key = 'cases';
  if not coalesce(v_on, false) then return false; end if;

  select * into v_s from sbotat where id = s_id;
  if not found then return false; end if;

  -- سبوطات نسبوط بس · مش الشغل · مش ملغية · وليها قضية
  if v_s.origin <> 'nasbot' then return false; end if;
  if v_s.is_work then return false; end if;
  if v_s.status in ('cancelled', 'draft', 'proposed') then return false; end if;
  if v_s.case_id is null then return false; end if;

  return exists (select 1 from cases c where c.id = v_s.case_id and c.is_active);
end $$;

comment on function fn_case_can_host(uuid) is
  'هل السبوطة دي فيها قضية شغّالة؟ المفتاح مفتوح · origin=nasbot · مش شغل · مش ملغية · وقضية نشطة. المصدر الواحد — متنسخهاش.';

revoke execute on function fn_case_can_host(uuid) from public, anon;
grant  execute on function fn_case_can_host(uuid) to authenticated;


-- ===== الاختبار =====
-- ⚠ **صف للممنوع وصف للمسموح** بنفس الهوية اللي هتستعمل في الحقيقة
--   (الدرس أربعة وعشرين: الاختبار اللي بيجرّب الرفض بس ما بيقولش إن الباب بيفتح).
create or replace function test_cases_schema()
returns table (test text, result text)
language plpgsql
set search_path = public
as $body$
declare
  names text[] := array[
    '0130 · 🔴 زائر مجهول ما بيقراش القضايا',
    '0130 · 🔴 زائر مجهول ما بيقراش نص التلميحات',
    '0130 · 🔴 عضو عادي ما بيقراش القضايا',
    '0130 · 🔴 عضو عادي ما بيكتبش قضية',
    '0130 · مالك عنده cases.view بيقرا',
    '0130 · 🔴 مفيش سياسة قراية عامة على أي جدول قضايا',
    '0130 · مفتاح الميزة cases موجود',
    '0130 · أرقام اللعبة في settings مش في الكود',
    '0130 · 🔴 القضية ما بتشتغلش وهي مقفولة من المفتاح',
    '0130 · 🔴 خروجة عضو مفيهاش قضية (قرار المالك)',
    '0130 · سبوطة نسبوط بقضية نشطة ← شغّالة'];
  r         text[] := '{}';
  n         int;
  v_admin   uuid;
  v_member  uuid := '33333333-0000-0000-0000-000000000003';
  v_world   text := 'test-world-0130';
  v_case    uuid;
  v_sbota   uuid := '77777777-0000-0000-0000-000000000004';
  v_q       uuid;
  i         int;
begin
  if not exists (select 1 from profiles where id = v_member) then
    test := '0130 · البنية'; result := 'معلومة — محتاج البذرة المؤقتة (fn_test_seed_up)';
    return next; return;
  end if;

  begin
    -- بيانات القضية المؤقتة، باسم `[اختبار]` علشان ما تبعتش للمالك على تليجرام
    insert into case_worlds (slug, name_ar, detective_name_ar, suspect_name_ar, theme)
    values (v_world, '[اختبار] عالم', 'المفتشين', 'المتهم', 'mono')
    on conflict (slug) do nothing;

    insert into cases (world_slug, slug, title_ar, intro_ar, detective_card_ar,
                       suspect_card_ar, win_ending_ar, escape_ending_ar)
    values (v_world, 'test-case-0130', '[اختبار] قضية', '[اختبار] مقدمة',
            '[اختبار] إنت بريء', '[اختبار] العقد معاك', '[اختبار] كسبوا', '[اختبار] هرب')
    on conflict (slug) do update set is_active = true
    returning id into v_case;
    if v_case is null then select id into v_case from cases where slug = 'test-case-0130'; end if;

    insert into case_questions (slug, question_ar) values ('test-q-0130', '[اختبار] سؤال')
    on conflict (slug) do nothing;
    select id into v_q from case_questions where slug = 'test-q-0130';
    insert into case_options (question_id, value, label_ar, clue_ar)
    values (v_q, 'yes', 'آه', '[اختبار] المتهم قال آه')
    on conflict (question_id, value) do nothing;

    -- (١)(٢) الزائر المجهول
    set local role anon;
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    select count(*) into n from cases;
    r := r || case when n = 0 then 'نجح'::text else format('فشل — 🔴 المجهول شاف %s قضية', n) end;
    select count(*) into n from case_options;
    r := r || case when n = 0 then 'نجح'::text else format('فشل — 🔴 المجهول شاف %s تلميح', n) end;
    reset role; perform set_config('request.jwt.claims', '', true);

    -- (٣)(٤) عضو عادي مسجّل ومش في اللوحة
    set local role authenticated;
    perform set_config('request.jwt.claims',
      format('{"sub":"%s","role":"authenticated"}', v_member), true);
    select count(*) into n from cases;
    r := r || case when n = 0 then 'نجح'::text else format('فشل — 🔴 عضو شاف %s قضية', n) end;
    begin
      insert into cases (world_slug, slug, title_ar, intro_ar, detective_card_ar,
                         suspect_card_ar, win_ending_ar, escape_ending_ar)
      values (v_world, 'test-hack-0130', 'x', 'x', 'x', 'x', 'x', 'x');
      r := r || 'فشل — 🔴 عضو كتب قضية'::text;
    exception when others then r := r || 'نجح'::text;
    end;
    reset role; perform set_config('request.jwt.claims', '', true);

    -- (٥) مالك عنده الصلاحية — لازم **ينجح**، متكسرش اللوحة
    -- ⚠ الدرس العشرين: الاختبار اللي بيختار صفوفه من بيانات حقيقية بيختار
    --   حاجة مختلفة في كل بيئة. محليًا مفيش ولا حساب لوحة، فالصف كان
    --   بيتخطّى نفسه — وفاحص أمان بيتخطّى أسوأ من فاحص أحمر. فلو مفيش
    --   حساب حقيقي، بنعمل واحد مؤقت من البذرة (وكله بيترجع في الآخر).
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
    if v_admin is null then
      r := r || 'فشل — مقدرناش نعمل حساب لوحة للاختبار'::text;
    else
      set local role authenticated;
      perform set_config('request.jwt.claims',
        format('{"sub":"%s","role":"authenticated"}', v_admin), true);
      select count(*) into n from cases;
      r := r || case when n > 0 then 'نجح'::text else 'فشل — 🔴 اللوحة مش شايفة القضايا' end;
      reset role; perform set_config('request.jwt.claims', '', true);
    end if;

    -- (٦) الشكل: مفيش سياسة `using (true)` على جداول القضايا
    select count(*) into n from pg_policies
     where tablename in ('case_worlds','cases','case_questions','case_options','case_missions','case_titles')
       and cmd in ('SELECT','ALL')
       and coalesce(qual, '') in ('true', 'TRUE');
    r := r || case when n = 0 then 'نجح'::text else format('فشل — 🔴 %s سياسة قراية عامة', n) end;

    -- (٧) المفتاح
    r := r || case when exists (select 1 from feature_flags where key = 'cases')
                   then 'نجح'::text else 'فشل — مفتاح cases مش موجود' end;

    -- (٨) الأرقام
    select count(*) into n from information_schema.columns
     where table_name = 'settings'
       and column_name in ('case_arrive_min','case_act1_min','case_act2_min','case_final_min',
                           'case_talk_min','case_hint_after_min','case_card_seconds',
                           'case_answers_keep_hours','case_min_players','case_code_attempts',
                           'case_questions_count');
    r := r || case when n = 11 then 'نجح'::text else format('فشل — %s عمود من 11', n) end;

    -- (٩) الحارس: المفتاح مقفول
    update feature_flags set is_on = false where key = 'cases';
    update sbotat set case_id = v_case, origin = 'nasbot', status = 'open' where id = v_sbota;
    r := r || case when fn_case_can_host(v_sbota) = false
                   then 'نجح'::text else 'فشل — 🔴 القضية شغّالة والمفتاح مقفول' end;

    -- (١٠) خروجة عضو
    update feature_flags set is_on = true where key = 'cases';
    update sbotat set origin = 'member' where id = v_sbota;
    r := r || case when fn_case_can_host(v_sbota) = false
                   then 'نجح'::text else 'فشل — 🔴 قضية في خروجة عضو' end;

    -- (١١) سبوطة نسبوط — لازم **تنجح**
    update sbotat set origin = 'nasbot' where id = v_sbota;
    r := r || case when fn_case_can_host(v_sbota) = true
                   then 'نجح'::text else 'فشل — 🔴 سبوطة نسبوط بقضية نشطة مش شغّالة' end;

    raise exception 'test_cases_schema_rollback';
  exception when others then
    reset role;
    perform set_config('request.jwt.claims', '', true);
    if sqlerrm <> 'test_cases_schema_rollback' then
      r := r || ('فشل — استثناء: ' || sqlerrm);
    end if;
  end;

  for i in 1 .. array_length(r, 1) loop
    test := coalesce(names[i], '0130 · الاختبار');
    result := r[i];
    return next;
  end loop;
end $body$;

comment on function test_cases_schema() is
  '0130 — جداول القضايا مقفولة على اللوحة، والأرقام في settings، والقضية في سبوطات نسبوط بس.';
revoke execute on function test_cases_schema() from public, anon, authenticated;
