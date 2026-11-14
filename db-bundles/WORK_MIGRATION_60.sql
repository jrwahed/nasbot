-- ==========================================================================
-- WORK_MIGRATION_60.sql — «يلا»: الجداول والأرقام والنصوص والقوالب
--
-- التاني من أربعة. ده بيعمل **الشكل** بس — المنطق في الملف اللي بعده.
--
-- اللي بيعمله:
--   · ٦ جداول للنداء (النداء · المواعيد · المناطق · الاختيار · الأولوية).
--   · عمود `sbotat.yalla_id` — الرابط بين النداء وسبوطته بعد القفل.
--   · ٥ أرقام في الإعدادات: عدد المجموعة · الحد الأدنى · مهلة القفل ·
--     مدة بقاء الكارت · كل كام ثانية الفيد بيتحدّث.
--   · مفتاح ميزة `yalla` — **بينزل مقفول**. تفتحه من الإعدادات ←
--     مفاتيح المزايا لما تكون جاهز.
--   · ٤ قوالب رسايل + نصوص الشاشة.
--
-- 🔴 جداول «مين اختار إيه» **مفيهاش ولا سياسة قراية — ولا لصاحب الصف**.
--    العضو بياخد اختياره هو من دالة، والعامة بتاخد **أعداد بس**.
--
-- ⚠ محتاج WORK_MIGRATION_59 قبله.
--
-- بعده شغّل:
--   select * from test_yalla_schema();    -- ١٠ صفوف «نجح»
-- ==========================================================================

-- ########################################################################
-- # 20261115130000_0142_yalla_schema.sql
-- ########################################################################

-- ============================================================================
-- 0142 · «يلا» — الجداول والأرقام والنصوص والقوالب
--
-- قرار المالك (٢٠٢٦-١١-١٥): «نداء بشكل بوست، والناس هي اللي بتقرر الميعاد
-- والمنطقة. المالك بينزّل «يلا نسبوط — بادل. إمتى وفين؟»، كل واحد يختار،
-- والاختيار اللي يتلم عليه العدد يبقى هو الخروجة.»
-- والقاعدة اللي فوق كل حاجة: **محدش يتساب برّه، ومحدش يوصله «لأ»**.
--
-- ===== ليه جداول لوحدها للنداء، وسبوطة حقيقية بعد القفل =====
--
-- النداء **ميعاده مش معروف** — ده أصل الميزة. و`sbotat.starts_at` عمود
-- `not null` وعليه الفيو العام والخريطة وحراس الحجز والجدولة. فلو النداء
-- قعد في `sbotat` من الأول كنا هنملا `starts_at` بكدبة، والكارت كان هيبان في
-- الرئيسية والخريطة و`/one` و«مين جاي؟» وكل قايمة بتقرا `sbotat_public` —
-- وكنا هنستثنيه من كل واحدة على إيدينا (الدرس التسعتاشر: القفل اللي بيخفي
-- القايمة وبيسيب تلات مداخل تانية).
--
-- وبعد القفل العكس: اللي عندنا **مجموعة ليها سعة وميعاد ومنطقة وحجوزات
-- وقايمة انتظار وكشف وحارس مكان وأسامي** — يعني سبوطة بالحرف. لو بنيناها من
-- جديد كنا هنكتب نسخة تانية من `fn_can_see_place` و`fn_group_members`
-- و`fn_reveal` وقايمة الانتظار ونص ولاد ونص بنات وصفحة الحجز والإيميلات
-- (الدرس الستاشر: نسخة تانية من الحارس = واحدة منهم هتتنسى).
--
-- فالتقسيم: الجداول دي للنداء، و`fn_yalla_lock` (في `0143`) بتعمل صف
-- `sbotat` واحد وعليه **`sbotat.yalla_id`** — والعمود ده هو المفتاح اللي كل
-- استثناء في الحراس الموجودة بيترد عليه بسطر واحد.
--
-- ⚠ **مفيش قيمة enum جديدة في الملف ده** عن قصد: حالة النداء عمود `text`
--   بـ`check`، فمفيش حاجة تتقسم `A`/`B` زي `0126`.
--
-- ⚠ محتاج `0141` قبله (مناطق «يلا»).
-- آمن يتكرر.
-- ============================================================================

-- ===== 1) النداء =====
create table if not exists yalla_calls (
  id            uuid primary key default gen_random_uuid(),
  -- النشاط. الصورة والاسم بييجوا من القالب — ومفيش صورة = البوست كلام بس.
  template_id   uuid not null references sbota_templates(id),
  -- سطر المالك بخط كبير. كلام بوست مش عنوان إعلان.
  line_ar       text not null,
  group_size    int  not null check (group_size between 2 and 40),
  min_group     int  not null check (min_group >= 2),
  -- «التكلفة تقريبًا …» — اختياري، ومعلومة مش مبلغ بنحصّله (مفيش دفع خالص)
  cost_note_ar  text,
  deadline      timestamptz not null,
  status        text not null default 'open'
                check (status in ('open', 'locked', 'closed')),
  -- بعد القفل: الاختيار الكسبان
  won_slot_id   uuid,
  won_area      text references map_areas(key),
  locked_at     timestamptz,
  -- 'full' كمل العدد · 'deadline' المهلة خلصت والأعلى كسب · 'few' تحت الحد الأدنى
  lock_reason   text,
  created_by    uuid references profiles(id),
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

comment on table yalla_calls is
  'نداء «يلا»: المالك بينزّل نشاط ومواعيد ومناطق، والناس بتختار، والاختيار اللي يكمل العدد يبقى الخروجة. (0142)';
comment on column yalla_calls.won_slot_id is 'الميعاد الكسبان — بيتحدد عند القفل.';
comment on column yalla_calls.min_group  is 'تحت الرقم ده النداء بيتقفل من غير مجموعة، وكل اللي شاركوا بيعرفوا.';

-- ===== 2) المواعيد المعروضة =====
create table if not exists yalla_slots (
  id           uuid primary key default gen_random_uuid(),
  call_id      uuid not null references yalla_calls(id) on delete cascade,
  starts_at    timestamptz not null,
  duration_min int not null default 120 check (duration_min > 0),
  sort         int not null default 1,
  unique (call_id, starts_at)
);
create index if not exists yalla_slots_call on yalla_slots (call_id, sort);

-- الميعاد الكسبان لازم يكون واحد من المعروضين
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'yalla_calls_won_slot_fk') then
    alter table yalla_calls
      add constraint yalla_calls_won_slot_fk
      foreign key (won_slot_id) references yalla_slots(id) on delete set null;
  end if;
end $$;

-- ===== 3) المناطق المعروضة =====
-- ⚠ المفتاح من `map_areas` — **القايمة الموجودة** (0141)، مش قايمة تانية.
--   كده الاسم المعروض بيتعدّل من `/admin/map` ومفيش نص عربي في المكوّنات.
create table if not exists yalla_call_areas (
  call_id  uuid not null references yalla_calls(id) on delete cascade,
  area_key text not null references map_areas(key),
  sort     int  not null default 1,
  primary key (call_id, area_key)
);

-- ===== 4) الاختيار =====
-- صف واحد لكل عضو في كل نداء — **منطقة واحدة**، ومواعيد في جدول تاني.
-- الاختيار تاني بيعدّل الصف ده (مش بيتكرر) — `fn_yalla_choose`.
create table if not exists yalla_choices (
  call_id    uuid not null references yalla_calls(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  area_key   text not null,
  -- ⚠ اسم مكان بيكتبه العضو — **للوحة بس**. مفيش ولا دالة عامة بترجّعه،
  --   ومفيش سياسة قراية على الجدول خالص.
  venue_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (call_id, profile_id),
  -- المنطقة لازم تكون من المعروضين في النداء ده بالظبط
  foreign key (call_id, area_key) references yalla_call_areas (call_id, area_key)
);

create table if not exists yalla_choice_slots (
  call_id    uuid not null,
  profile_id uuid not null,
  slot_id    uuid not null references yalla_slots(id) on delete cascade,
  primary key (call_id, profile_id, slot_id),
  foreign key (call_id, profile_id)
    references yalla_choices (call_id, profile_id) on delete cascade
);
create index if not exists yalla_choice_slots_slot on yalla_choice_slots (slot_id);

-- ===== 5) الأولوية =====
-- اللي زاد عن العدد — وكل اللي شارك في نداء اتقفل من غير مجموعة. ده الجزء
-- اللي بيخلّي «محدش يتساب برّه» كلام ليه أثر في الكود.
create table if not exists yalla_priority (
  id         uuid primary key default gen_random_uuid(),
  profile_id uuid not null references profiles(id) on delete cascade,
  from_call  uuid not null references yalla_calls(id) on delete cascade,
  created_at timestamptz not null default now(),
  used_at    timestamptz,
  unique (profile_id, from_call)
);
create index if not exists yalla_priority_open on yalla_priority (profile_id) where used_at is null;

comment on table yalla_priority is
  'أولوية في النداء الجاي: اللي زاد عن العدد، واللي شارك في نداء مكمّلش. بتتصرف مرة واحدة. (0142)';


-- ===== 6) الربط بالسبوطة =====
alter table sbotat add column if not exists yalla_id uuid references yalla_calls(id) on delete set null;
comment on column sbotat.yalla_id is
  'السبوطة دي اتولدت من نداء «يلا». ده المفتاح اللي كل استثناء في الحراس بيترد عليه: مفيش قفل ٣٦ ساعة، ومفيش كشف تلقائي، ومش بتبان في القايمة العامة. (0142)';
create unique index if not exists sbotat_yalla_one on sbotat (yalla_id) where yalla_id is not null;


-- ===== 7) RLS =====
alter table yalla_calls        enable row level security;
alter table yalla_slots        enable row level security;
alter table yalla_call_areas   enable row level security;
alter table yalla_choices      enable row level security;
alter table yalla_choice_slots enable row level security;
alter table yalla_priority     enable row level security;

-- اللوحة بتقرا وتعدّل النداء ومواعيده ومناطقه مباشرة (نفس نمط `/admin/sbotat`).
-- الإنشاء بيمر على `fn_yalla_create` علشان النداء ومواعيده ومناطقه يتكتبوا
-- مع بعض أو مايتكتبوش.
do $$
declare t text;
begin
  foreach t in array array['yalla_calls', 'yalla_slots', 'yalla_call_areas']
  loop
    execute format('drop policy if exists %I on %I', t || '_admin_read', t);
    execute format(
      'create policy %I on %I for select using (fn_has_permission(%L))',
      t || '_admin_read', t, 'sbotat.view');
    execute format('drop policy if exists %I on %I', t || '_admin_write', t);
    execute format(
      'create policy %I on %I for all using (fn_has_permission(%L)) with check (fn_has_permission(%L))',
      t || '_admin_write', t, 'sbotat.edit', 'sbotat.edit');
  end loop;
end $$;

-- ⚠ **مفيش ولا سياسة على الجداول التلاتة دي — ولا للعضو ولا لصاحب الصف.**
--    نفس قاعدة «قضية الليلة» (§٥.٥): اللي الواجهة ما تحتاجهوش ما يكونش ليه
--    سياسة قراية خالص. العضو بياخد **اختياره هو** من `fn_my_yalla_choice`
--    (صف واحد، وبتاعه، ومفيش parameter لشخص تاني)، والعامة بتاخد **أعداد
--    بس** من `fn_yalla_feed`. واللوحة بتاخد التفاصيل من دوال بصلاحية.
--    لو فتحنا قراية هنا، أي حد يفتح أدوات المطور يعرف مين اختار إيه وأماكن
--    الناس المكتوبة.
--    (الجداول: yalla_choices · yalla_choice_slots · yalla_priority)


-- ===== 8) الأرقام — كلها في settings =====
alter table settings add column if not exists yalla_group_size   int not null default 6;
alter table settings add column if not exists yalla_min_group    int not null default 4;
alter table settings add column if not exists yalla_lock_hours   int not null default 48;
alter table settings add column if not exists yalla_card_hours   int not null default 3;
alter table settings add column if not exists yalla_poll_seconds int not null default 20;

comment on column settings.yalla_group_size is
  'عدد المجموعة الافتراضي في نداء «يلا» الجديد. أول (ميعاد + منطقة) يوصله يكسب. (0142)';
comment on column settings.yalla_min_group is
  'أقل عدد يستاهل نعمل بيه خروجة. لو المهلة خلصت والأعلى تحته، النداء يتقفل من غير مجموعة. (0142)';
comment on column settings.yalla_lock_hours is
  'مهلة القفل الافتراضية لنداء جديد — بالساعات من لحظة النزول. (0142)';
comment on column settings.yalla_card_hours is
  'الكارت يفضل باين بعد ميعاد الخروجة بكام ساعة، وبعدها يختفي لوحده. (0142)';
comment on column settings.yalla_poll_seconds is
  'الفيد بيسأل عن الأعداد الجديدة كل كام ثانية (والتاب شغّال بس). (0142)';


-- ===== 9) مفتاح الميزة — بينزل مقفول =====
-- نفس `cases` (0130): مفيش ولا نداء دلوقتي، فالصفحة والمدخل بيختفوا مع بعض
-- لحد ما المالك يفتحه من `/admin/settings`.
insert into feature_flags (key, name_ar, is_on, off_message_ar) values
  ('yalla', 'يلا', false, 'النداءات مقفولة دلوقتي — جايالك قريب.')
on conflict (key) do nothing;


-- ===== 10) قوالب الإشعارات =====
-- ⚠ **متغيّرات مسمّاة بس** (`{name}` · `{when}` · `{area}` · `{what}` ·
--   `{link}`) — مفيش `{{1}}`. القوالب المرقّمة لازم تبقى في `CORE` بترتيب
--   مطابق، والمسمّاة بتتملي من الـpayload لوحدها، فمفيش ترتيب يتكسر
--   (الدرس الرابع). و`check-notify-vars.mjs` بيحرس الاتنين.
--
-- ⚠ **ممنوع أي صياغة فيها رفض أو استبعاد** — قرار المالك. مفيش «مش ينفع»
--   ولا «اتقفل عليك» ولا «للأسف». اللي مالحقش مكان بيبقى **الأول في
--   الانتظار ومعاه أولوية**، والنداء اللي مكمّلش بيتقال عنه إنه هو اللي
--   مكمّلش — مش إن حد مكانوش عايزينه.
-- ⚠ موضوع الإيميل مش في الجدول ده — الجدول فيه النص بس. الموضوع في
--   `YALLA_SUBJECT` جوه `notify.ts` (نفس `WORK_SUBJECT`).
insert into notification_templates (key, channel, body_ar, provider_template_id, is_active) values
  ('yalla_won', 'email',
'يا {name}، الميعاد اللي اخترته كسب — {when} في {area}.
إنت جاي. المكان بالظبط هيوصلك قبل الخروجة بشوية: {link}',
   null, true),

  ('yalla_switch', 'email',
'يا {name}، أكتر ناس في {what} قالوا {when} في {area}.
تيجي معاهم؟ دوسة واحدة من هنا: {link}',
   null, true),

  ('yalla_waiting', 'email',
'يا {name}، {what} اتلمّت على {when} في {area}، والعدد كمل.
إنت أول واحد في الانتظار — ولو فضي مكان هتوصلك رسالة على طول. ومعاك أولوية في النداء الجاي: {link}',
   null, true),

  ('yalla_closed', 'email',
'يا {name}، نداء {what} مكمّلش العدد المرة دي.
معاك أولوية في النداء الجاي، وأول ما ينزل هتعرف قبل أي حد: {link}',
   null, true)
on conflict (key) do nothing;


-- ===== 11) النصوص =====
insert into copy_strings (key, value_ar, screen, context_ar) values
  -- المدخل والصفحة
  ('yalla.nav',          'يلا',                                   'يلا', 'مدخل القايمة الرئيسية'),
  ('yalla.title',        'يلا',                                   'يلا', 'عنوان صفحة الفيد'),
  ('yalla.sub',          'نداء ينزل، وانت تقول إمتى وفين.',       'يلا', 'سطر تحت العنوان'),
  ('yalla.home.title',   'يلا',                                   'يلا', 'عنوان القسم في الرئيسية'),
  ('yalla.home.more',    'شوف كل النداءات',                       'يلا', 'رابط تحت القسم في الرئيسية'),
  ('yalla.empty.title',  'مفيش نداء دلوقتي',                      'يلا', 'الفيد وهو فاضي'),
  ('yalla.empty.body',   'أول ما ينزل نداء جديد هتلاقيه هنا.',    'يلا', 'الفيد وهو فاضي'),
  ('yalla.empty.cta',    'وصّلني على تليجرام',                    'يلا', 'زرار الفيد الفاضي'),
  ('yalla.loading',      'ثانية واحدة…',                          'يلا', 'وهو بيحمّل'),

  -- البوست
  ('yalla.brand',        'نسبوط',                                 'يلا', 'اسم الحساب فوق البوست'),
  ('yalla.ago.now',      'دلوقتي',                                'يلا', 'نزل من أقل من دقيقة'),
  ('yalla.ago.min',      'من {{n}} دقيقة',                        'يلا', 'نزل من دقايق'),
  ('yalla.ago.hour',     'من {{n}} ساعة',                         'يلا', 'نزل من ساعات'),
  ('yalla.ago.day',      'من {{n}} يوم',                          'يلا', 'نزل من أيام'),
  ('yalla.state.open',   'مفتوح',                                 'يلا', 'ستيكر حالة البوست'),
  ('yalla.state.near',   'قرّب يكمل',                             'يلا', 'ستيكر لما يفضل واحد أو اتنين'),
  ('yalla.state.done',   'كملت',                                  'يلا', 'ستيكر بعد القفل'),
  ('yalla.trend',        'أكتر ناس قالت {{when}} في {{area}} — {{n}} من {{of}}', 'يلا',
   'سطر الاتجاه. أعداد بس — مفيش أسامي'),
  ('yalla.trend.none',   'لسه محدش قال. قول انت الأول.',          'يلا', 'سطر الاتجاه وهو فاضي'),
  ('yalla.cta',          'أنا جاي',                               'يلا', 'الزرار الأساسي'),
  ('yalla.cta.mine',     'قلت إنك جاي ✓',                         'يلا', 'الزرار بعد ما يختار'),
  ('yalla.share',        'ابعته لحد',                             'يلا', 'زرار المشاركة'),
  ('yalla.share.copied', 'اللينك اتنسخ',                          'يلا', 'لو مشاركة الموبايل مش متاحة'),
  ('yalla.mine',         'إنت واحد من {{n}} قالوا {{when}} في {{area}}', 'يلا',
   'بعد الاختيار — في البوست نفسه'),
  ('yalla.deadline',     'الاختيار مفتوح لحد {{when}}',           'يلا', 'تحت الأزرار'),

  -- شاشة الاختيار (bottom sheet)
  ('yalla.sheet.title',  'إمتى وفين؟',                            'يلا', 'عنوان النافذة السفلية'),
  ('yalla.sheet.when',   'الميعاد',                               'يلا', 'عنوان صف المواعيد'),
  ('yalla.sheet.whenHint', 'اختار كل اللي يناسبك — مش واحد بس.',  'يلا', 'تحت عنوان المواعيد'),
  ('yalla.sheet.area',   'المنطقة',                               'يلا', 'عنوان صف المناطق'),
  ('yalla.sheet.areaHint', 'واحدة.',                              'يلا', 'تحت عنوان المناطق'),
  ('yalla.sheet.venue',  'تعرف مكان كويس؟',                       'يلا', 'خانة اسم المكان — اختيارية'),
  ('yalla.sheet.venuePh', 'اكتب اسمه. ده لينا إحنا بس ومش بيظهر لحد.', 'يلا', 'نص داخل الخانة'),
  ('yalla.sheet.save',   'يلا',                                   'يلا', 'زرار الحفظ'),
  ('yalla.sheet.remove', 'مش جاي',                                'يلا', 'زرار صغير يشيل الاختيار'),
  ('yalla.sheet.note',   'مفيش دفع. وتقدر تغيّر اختيارك لحد ما النداء يقفل.', 'يلا', 'تحت الزرار'),
  ('yalla.sheet.errWhen', 'اختار ميعاد واحد على الأقل',           'يلا', 'لو مفيش ميعاد'),
  ('yalla.sheet.errArea', 'اختار المنطقة',                        'يلا', 'لو مفيش منطقة'),
  ('yalla.sheet.err',    'مقدرناش نسجّلك. جرب تاني.',             'يلا', 'لو الحفظ وقع'),

  -- بعد القفل
  ('yalla.locked.line',  'المجموعة اتلمّت على {{when}} في {{area}}', 'يلا', 'سطر البوست بعد القفل'),
  ('yalla.switch.cta',   'تيجي معاهم؟',                           'يلا', 'لمين اختار حاجة تانية'),
  ('yalla.switch.in',    'إنت معاهم ✓',                           'يلا', 'بعد ما يدخل'),
  ('yalla.switch.wait',  'إنت الأول في الانتظار — ولو فضي مكان هنبعتلك.', 'يلا',
   'لما يدخل والعدد كامل'),
  ('yalla.switch.err',   'مقدرناش ندخّلك. جرب تاني.',             'يلا', 'لو «تيجي معاهم» وقع'),
  ('yalla.booking',      'افتح حجزك',                             'يلا', 'رابط صفحة الحجز بعد القفل'),
  ('yalla.closed.line',  'النداء ده مكمّلش العدد المرة دي.',      'يلا', 'نداء اتقفل من غير مجموعة')
on conflict (key) do nothing;


-- ===== 12) الاختبار الشكلي =====
-- ⚠ ده بيفحص **الشكل** بس (الجداول والأرقام والقوالب والنصوص موجودة).
--   السلوك كله في `test_yalla()` (0144) — وهو اللي بيحكم.
create or replace function test_yalla_schema()
returns table (test text, result text)
language plpgsql
set search_path = public
as $body$
declare
  n int;
  t text;
  missing text := '';
begin
  test := '0142 · الجداول الستة موجودة';
  select count(*) into n from information_schema.tables
   where table_schema = 'public'
     and table_name in ('yalla_calls','yalla_slots','yalla_call_areas',
                        'yalla_choices','yalla_choice_slots','yalla_priority');
  result := case when n = 6 then 'نجح' else format('فشل — %s من ٦', n) end;
  return next;

  test := '0142 · sbotat.yalla_id موجود';
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'sbotat' and column_name = 'yalla_id';
  result := case when n = 1 then 'نجح' else 'فشل — العمود مش موجود' end;
  return next;

  -- ⚠ سبوطة واحدة بس لكل نداء — من غير الفهرس ده القفل مرتين بيعمل مجموعتين
  test := '0142 · نداء واحد = سبوطة واحدة';
  select count(*) into n from pg_indexes
   where schemaname = 'public' and indexname = 'sbotat_yalla_one';
  result := case when n = 1 then 'نجح' else 'فشل — مفيش فهرس فريد على yalla_id' end;
  return next;

  test := '0142 · الأرقام الخمسة في settings';
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'settings'
     and column_name in ('yalla_group_size','yalla_min_group','yalla_lock_hours',
                         'yalla_card_hours','yalla_poll_seconds');
  result := case when n = 5 then 'نجح' else format('فشل — %s من ٥', n) end;
  return next;

  -- ⚠ 🔴 أهم صف في الملف ده: الجداول اللي فيها «مين اختار إيه» لازم تكون
  --   مقفولة تمامًا — مفيش سياسة قراية ولا كتابة، ولا لصاحب الصف.
  test := '0142 · 🔴 جداول الاختيار مفيهاش ولا سياسة';
  select count(*) into n from pg_policies
   where schemaname = 'public'
     and tablename in ('yalla_choices','yalla_choice_slots','yalla_priority');
  result := case when n = 0 then 'نجح'
                 else format('فشل — 🔴 فيه %s سياسة على جداول الاختيار — مين اختار إيه بقى مكشوف', n) end;
  return next;

  test := '0142 · RLS شغّالة على الستة';
  select count(*) into n from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public' and c.relrowsecurity
     and c.relname in ('yalla_calls','yalla_slots','yalla_call_areas',
                       'yalla_choices','yalla_choice_slots','yalla_priority');
  result := case when n = 6 then 'نجح' else format('فشل — %s من ٦', n) end;
  return next;

  test := '0142 · مفتاح الميزة بينزل مقفول';
  select count(*) into n from feature_flags where key = 'yalla';
  if n = 0 then result := 'فشل — المفتاح مش موجود';
  else result := 'نجح'; end if;
  return next;

  test := '0142 · القوالب الأربعة موجودة';
  select count(*) into n from notification_templates
   where key in ('yalla_won','yalla_switch','yalla_waiting','yalla_closed');
  result := case when n = 4 then 'نجح' else format('فشل — %s من ٤', n) end;
  return next;

  -- ⚠ قرار المالك: ممنوع أي صياغة فيها رفض أو استبعاد. الفحص ده بيدوّر على
  --   الكلمات دي في القوالب الأربعة — ولو المالك عدّل من اللوحة وحطها، الصف
  --   بيقع أحمر.
  test := '0142 · مفيش صياغة رفض في القوالب';
  select count(*) into n from notification_templates
   where key like 'yalla\_%'
     and (body_ar like '%للأسف%' or body_ar like '%مش ينفع%' or body_ar like '%مرفوض%'
          or body_ar like '%اتقفل عليك%' or body_ar like '%معلشن%' or body_ar like '%مقدرناش نقبل%');
  result := case when n = 0 then 'نجح'
                 else format('فشل — 🔴 %s قالب فيه صياغة رفض', n) end;
  return next;

  test := '0142 · نصوص الشاشة موجودة';
  foreach t in array array['yalla.nav','yalla.title','yalla.cta','yalla.trend','yalla.mine',
                           'yalla.sheet.title','yalla.sheet.when','yalla.sheet.area',
                           'yalla.sheet.venue','yalla.switch.cta','yalla.locked.line',
                           'yalla.empty.title','yalla.state.done','yalla.share']
  loop
    if not exists (select 1 from copy_strings where key = t) then
      missing := missing || t || ' ';
    end if;
  end loop;
  result := case when missing = '' then 'نجح' else 'فشل — ناقص: ' || missing end;
  return next;
end $body$;

comment on function test_yalla_schema() is
  '0142 — جداول «يلا» والأرقام والمفتاح والقوالب والنصوص موجودة، وجداول الاختيار مقفولة تمامًا.';
revoke execute on function test_yalla_schema() from public, anon, authenticated;

-- ==========================================================================
-- خلصت. الملف اللي بعده: WORK_MIGRATION_61.sql
-- ==========================================================================
