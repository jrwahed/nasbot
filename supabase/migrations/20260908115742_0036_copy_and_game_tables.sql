-- ===== النصوص =====
create table copy_strings (
  key         text primary key,
  value_ar    text not null,
  context_ar  text,
  screen      text not null default 'عام',
  max_length  int,
  is_html     boolean not null default false,
  updated_by  uuid references profiles(id),
  updated_at  timestamptz not null default now(),
  created_at  timestamptz not null default now()
);
comment on table copy_strings is 'كل نص معروض في الموقع. المفتاح: screen.section.element';
create index on copy_strings (screen);

create table copy_history (
  id         uuid primary key default gen_random_uuid(),
  copy_key   text not null,
  value_ar   text not null,
  changed_by uuid references profiles(id),
  changed_at timestamptz not null default now()
);
comment on table copy_history is 'كل نسخة قديمة — للرجوع بضغطة.';
create index on copy_history (copy_key, changed_at desc);

-- بيحفظ النسخة القديمة قبل أي تعديل
create or replace function fn_copy_history()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.value_ar is distinct from new.value_ar then
    insert into copy_history (copy_key, value_ar, changed_by)
    values (old.key, old.value_ar, old.updated_by);
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger t_copy_history before update on copy_strings
  for each row execute function fn_copy_history();

create table banned_words (
  word     text primary key,
  added_by uuid references profiles(id),
  added_at timestamptz not null default now()
);
comment on table banned_words is 'كلمات ممنوعة في نصوص الموقع — تحذير أحمر، و owner بس اللي يقدر يتجاوز.';

insert into banned_words (word) values
  ('تعارف'),('شريك'),('إعجاب'),('فعالية'),('تذكرة'),('باقة'),('منصة'),('مستخدم'),('اكتشف');

-- ===== اللعبة =====
create table game_questions (
  id             uuid primary key default gen_random_uuid(),
  "order"        int  not null,
  question_ar    text not null,
  kind           text not null default 'single' check (kind in ('single','multi','text')),
  is_active      boolean not null default true,
  required       boolean not null default true,
  help_ar        text,
  progress_label_ar text,
  placeholder_ar text,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now()
);
comment on table game_questions is 'أسئلة «مين جاي؟» — الترتيب والتفعيل من اللوحة.';
create trigger t_gq_updated before update on game_questions
  for each row execute function set_updated_at();

create table game_options (
  id          uuid primary key default gen_random_uuid(),
  question_id uuid not null references game_questions(id) on delete cascade,
  "order"     int  not null,
  label_ar    text not null,
  icon_key    text,
  value       text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now()
);
comment on table game_options is 'اختيارات كل سؤال. icon_key من مكتبة الأيقونات في الكود.';
create index on game_options (question_id, "order");

create table personality_types (
  key                      text primary key,
  name_ar                  text not null,
  name_ar_f                text not null,
  line_ar                  text not null,
  sticker_bg               text not null default '#F4632A',
  sticker_fg               text not null default '#14161A',
  recommended_template_ids uuid[] not null default '{}',
  is_active                boolean not null default true,
  "order"                  int not null default 0
);
comment on table personality_types is 'الأنواع الستة. name_ar_f = صيغة المؤنث (بتظهر في كشف المجموعة).';

create table game_option_scores (
  option_id uuid not null references game_options(id) on delete cascade,
  type_key  text not null references personality_types(key) on delete cascade,
  points    int  not null default 0,
  primary key (option_id, type_key)
);
comment on table game_option_scores is 'شبكة النقاط: كل اختيار بيدي نقاط لأنواع مختلفة. الأعلى مجموعًا هو النتيجة.';

create table game_sessions (
  id                   uuid primary key default gen_random_uuid(),
  profile_id           uuid references profiles(id) on delete set null,
  answers              jsonb not null default '{}',
  result_type          text references personality_types(key),
  scores               jsonb,
  completed_at         timestamptz,
  abandoned_at_question int,
  shared_at            timestamptz,
  created_at           timestamptz not null default now()
);
comment on table game_sessions is 'تحليلات اللعبة — نسبة الإكمال وأي سؤال بيتساب عنده الناس.';
create index on game_sessions (created_at desc);

-- ===== مفاتيح المزايا والصيانة =====
create table feature_flags (
  key            text primary key,
  name_ar        text not null,
  is_on          boolean not null default true,
  off_message_ar text,
  updated_by     uuid references profiles(id),
  updated_at     timestamptz not null default now()
);
comment on table feature_flags is 'قفل وفتح أقسام الموقع من غير نشر.';

insert into feature_flags (key, name_ar, off_message_ar) values
  ('game','لعبة «مين جاي؟»','اللعبة مقفولة دلوقتي. جرب تاني بعدين.'),
  ('map','الخريطة','الخريطة مقفولة دلوقتي.'),
  ('mystery','السبوطة الغامضة','الغامضة راجعة قريب.'),
  ('work_sbota','سبوطة الشغل','سبوطات الشغل راجعة قريب.'),
  ('chat','الشات','الشات مقفول دلوقتي.'),
  ('referral','الإحالة','الإحالة موقوفة مؤقتًا.'),
  ('booking','الحجز','الحجز مقفول دلوقتي. ارجعلنا كمان شوية.');

create table maintenance (
  id            boolean primary key default true check (id),
  is_on         boolean not null default false,
  message_ar    text not null default 'بنظبط حاجات صغيرة. ارجعلنا بعد شوية.',
  updated_by    uuid references profiles(id),
  updated_at    timestamptz not null default now()
);
insert into maintenance (id) values (true);
comment on table maintenance is 'وضع الصيانة — بيوقف الحجز الجديد فورًا. owner بس.';

-- ===== السياسات =====
alter table copy_strings       enable row level security;
alter table copy_history       enable row level security;
alter table banned_words       enable row level security;
alter table game_questions     enable row level security;
alter table game_options       enable row level security;
alter table personality_types  enable row level security;
alter table game_option_scores enable row level security;
alter table game_sessions      enable row level security;
alter table feature_flags      enable row level security;
alter table maintenance        enable row level security;

-- القراءة للكل: دي محتوى الموقع
create policy copy_read   on copy_strings      for select using (true);
create policy gq_read     on game_questions    for select using (is_active or fn_has_permission('game.view'));
create policy go_read     on game_options      for select using (is_active or fn_has_permission('game.view'));
create policy pt_read     on personality_types for select using (true);
create policy gos_read    on game_option_scores for select using (true);
create policy ff_read     on feature_flags     for select using (true);
create policy mt_read     on maintenance       for select using (true);
create policy bw_read     on banned_words      for select using (fn_has_permission('content.view'));

-- الكتابة بالصلاحية
create policy copy_write  on copy_strings      for all using (fn_has_permission('content.edit')) with check (fn_has_permission('content.edit'));
create policy ch_read     on copy_history      for select using (fn_has_permission('content.view'));
create policy bw_write    on banned_words      for all using (fn_has_permission('settings.edit')) with check (fn_has_permission('settings.edit'));
create policy gq_write    on game_questions    for all using (fn_has_permission('game.edit')) with check (fn_has_permission('game.edit'));
create policy go_write    on game_options      for all using (fn_has_permission('game.edit')) with check (fn_has_permission('game.edit'));
create policy pt_write    on personality_types for all using (fn_has_permission('game.edit')) with check (fn_has_permission('game.edit'));
create policy gos_write   on game_option_scores for all using (fn_has_permission('game.edit')) with check (fn_has_permission('game.edit'));
create policy ff_write    on feature_flags     for all using (fn_has_permission('settings.edit')) with check (fn_has_permission('settings.edit'));
create policy mt_write    on maintenance       for all using (fn_has_permission('settings.danger')) with check (fn_has_permission('settings.danger'));

-- جلسات اللعبة: كل واحد بيكتب بتاعته، والإدارة بتقرا الكل
create policy gs_insert on game_sessions for insert with check (true);
create policy gs_own    on game_sessions for select using (profile_id = auth.uid() or fn_has_permission('game.view'));
create policy gs_update on game_sessions for update using (profile_id = auth.uid() or profile_id is null);;
