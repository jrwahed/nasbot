-- ============================================================================
-- WORK_MIGRATION_28.sql — ساعة الكشف وساعات الشات بقت من اللوحة
--
-- المشكلة: في `/admin/settings` ← «الساعات والمواعيد» فيه تلات أرقام كانت
-- **ديكور**: «ساعة كشف المجموعة» · «الشات بيفتح قبل السبوطة بـ» · «الشات
-- بيقفل بعد السبوطة بـ». كنت بتغيّرهم، الصفحة تقول «اتحفظ ✓»، والقاعدة
-- بتفضل تحسب بالأرقام المكتوبة في جسم الدالة من أول يوم.
--
-- نفس باج السن بالظبط اللي اتصلّح في `0104`.
--
-- بعد الملف ده الأرقام التلاتة بقى ليها معنى، ووسم «مش موصّل» اتشال من
-- جنبهم في اللوحة.
--
-- 🔴 **قاعدة واحدة مش بتتكسر:** الشات ما بيفتحش قبل الكشف مهما حطيت في
--    «الشات بيفتح قبل السبوطة بـ». لو الرقم كبير (48 ساعة زي دلوقتي)
--    الشات بيفتح **مع الكشف** بالظبط زي ما هو حاصل؛ ولو حطيت رقم صغير
--    (٦ ساعات مثلًا) الشات بيتأخّر لبعد الكشف. يعني الرقم بيأخّر بس —
--    عشان الشات ده شات المجموعة، وفتحه بدري = كشف الأسامي بدري.
--
-- والملف كمان بيعيد حساب مواعيد **السبوطات الجاية بس** بالأرقام الجديدة
-- (اللي فاتت تفضل زي ما هي).
--
-- بعده شغّل:  select * from test_reveal_hour();   — ٦ صفوف، كلهم «نجح».
-- ============================================================================

-- ##########################################################################
-- # 20260921110000_0109_reveal_hour_from_settings.sql
-- ##########################################################################

-- ============================================================================
-- 0109 — ساعة الكشف وساعات الشات من `settings` مش من جسم الدالة
--
-- المشكلة: `/admin/settings` ← «الساعات والمواعيد» فيه تلات أرقام وعليهم
-- وسم `unwired` في الكود: «ساعة كشف المجموعة» · «الشات بيفتح قبل السبوطة
-- بـ» · «الشات بيقفل بعد السبوطة بـ». المالك بيغيّرهم، الصفحة بتقول
-- «اتحفظ ✓»، و`fn_sbota_timings` بتفضل بتحسب بـ`interval '20 hours'`
-- و`interval '48 hours'` **مكتوبين في جسمها** من `0003`.
--
-- ده نفس باج السن بالظبط (`0104`): رقم في اللوحة، ورقم تاني بيشتغل.
--
-- 🔴 **الشات ما ينفعش يفتح قبل الكشف.** لو وصّلنا `chat_open_hours` حرفيًا
--    (48 ساعة) الشات كان هيفتح **قبل** الكشف بيوم — والشات ده شات
--    المجموعة، يعني الأسامي تتكشف قبل معادها. فالقاعدة هنا:
--
--      chat_opens_at = greatest(reveal_at, starts_at - chat_open_hours)
--
--    يعني الرقم بيقدر **يأخّر** فتح الشات ومستحيل يقدّمه قبل الكشف.
--    بالقيمة الافتراضية (48) النتيجة = `reveal_at` بالظبط زي دلوقتي.
--
-- الباقي على حاله: `booking_closes_at` لسه `starts_at - 36 ساعة` و«الكشف
-- قبلها بيوم» لسه 24 ساعة — الرقمين دول **مالهمش خانة في اللوحة أصلًا**،
-- فمحدش بيغيّرهم ومحدش بيتكدب عليه. لو المالك عايزهم من اللوحة، دي خانة
-- جديدة في `settings` وقرار لوحده.
--
-- آمنة تتكرر: `create or replace` + `update ... where` + `on conflict`.
-- ============================================================================

create or replace function fn_sbota_timings()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  -- ⚠ متغيّرات مفردة مش `record`: لو جدول الإعدادات رجّع **ولا صف**، الـ
  --   record بيبقى null والوصول لحقوله بيرمي استثناء جوه محفّز — يعني
  --   الجدول كله يقف. المفردات بتفضل null و`coalesce` بترجّع القديم.
  v_hour         int;
  v_chat_open_h  int;
  v_chat_close_h int;
  prev_day_cut   timestamptz;
begin
  -- صف الإعدادات صف واحد. لو (لأي سبب) مش موجود، بنرجع للأرقام القديمة
  -- بالظبط — الافتراضي **ما يكسرش** الجدولة.
  select reveal_hour_cairo, chat_open_hours, chat_close_hours
    into v_hour, v_chat_open_h, v_chat_close_h
    from settings
   limit 1;

  v_hour         := coalesce(v_hour, 20);
  v_chat_open_h  := coalesce(v_chat_open_h, 48);
  v_chat_close_h := coalesce(v_chat_close_h, 48);

  new.booking_closes_at := new.starts_at - interval '36 hours';

  -- الكشف: قبلها بيوم، وبحد أقصى الساعة اللي المالك حاططها في اللوحة
  -- بتوقيت القاهرة في نفس اليوم.
  prev_day_cut := ((new.starts_at at time zone 'Africa/Cairo')::date
                   - interval '1 day'
                   + make_interval(hours => v_hour))
                  at time zone 'Africa/Cairo';
  new.reveal_at := least(new.starts_at - interval '24 hours', prev_day_cut);

  -- 🔴 الشات عمره ما يفتح قبل الكشف — الرقم بيأخّر بس.
  new.chat_opens_at  := greatest(
                          new.reveal_at,
                          new.starts_at - make_interval(hours => v_chat_open_h)
                        );
  new.chat_closes_at := new.ends_at + make_interval(hours => v_chat_close_h);
  return new;
end;
$$;

comment on function fn_sbota_timings() is
  'بيحسب booking_closes_at و reveal_at و chat_opens_at و chat_closes_at بتوقيت القاهرة — الساعات من settings (0109)، والشات مستحيل يفتح قبل الكشف.';

-- إعادة حساب السبوطات الجاية بس — اللي فاتت تفضل بتوقيتاتها الأصلية.
-- ⚠ المحفّز `t_sbota_timings` على `update of starts_at, ends_at`، فالسطر ده
--   بيشغّله من غير ما يغيّر أي قيمة.
update sbotat set starts_at = starts_at where starts_at > now();


-- ===== النصوص: سطر الكشف بقى مفتاح ومتغيّر =====
--
-- ⚠ كان **مكتوب في الكود** (`src/lib/map-db.ts`): «هتعرف مجموعتك قبلها
--   بيوم الساعة 8 بالليل.» — رقم ونص مع بعض. والأسوأ: صفحة `/my/[id]`
--   كانت بتشيل آخره بـ`.replace(t('group.label.2'), '')` (يعني بتقص كلمة
--   «بالليل.») علشان تعمل منه عنوان. أول ما المالك يغيّر الساعة للصبح،
--   الجملة تكدب والقص يطلّع كلام ناقص.
insert into copy_strings (key, value_ar, screen, context_ar) values
  ('group.reveal.line',  'هتعرف مجموعتك قبلها بيوم الساعة {{hour}}.', 'كشف المجموعة',
   'سطر «امتى هتعرف مجموعتك» — {{hour}} بتتحط من ساعة الكشف في الإعدادات'),
  ('group.reveal.short', 'الكشف قبلها بيوم الساعة {{hour}}', 'كشف المجموعة',
   'نفس السطر من غير «هتعرف مجموعتك» — عنوان في صفحة حجزي'),
  ('shared.hour.morning',   'الصبح',  'مشترك', 'وصف الساعة قبل 12'),
  ('shared.hour.noon',      'الضهر',  'مشترك', 'وصف الساعة من 12 لـ3'),
  ('shared.hour.afternoon', 'العصر',  'مشترك', 'وصف الساعة من 4 لـ5'),
  ('shared.hour.night',     'بالليل', 'مشترك', 'وصف الساعة من 6 مساءً')
on conflict (key) do nothing;


-- ===== دالة الاختبار =====
--
-- ⚠ سلوكية: بنغيّر الرقم في `settings` فعلًا وبنشوف الجدولة بتتغيّر معاه،
--   وبنرجّع كل حاجة في الآخر (وفي حالة الاستثناء كمان).
create or replace function test_reveal_hour()
returns table (test text, result text)
language plpgsql
set search_path = public
as $body$
declare
  v_id        uuid := '0109aaaa-0000-4000-8000-000000000001';
  v_tmpl      uuid;
  v_was_hour  int;
  v_was_open  int;
  v_was_close int;
  v_reveal    timestamptz;
  v_chat_open timestamptz;
  v_chat_shut timestamptz;
  v_ends      timestamptz;
  v_starts    timestamptz;
  n           int;
begin
  -- ===== شكلي: الرقم اتشال من جسم الدالة =====
  -- ⚠ الدرس التامن: `prosrc` فيها التعليقات كمان، فبندوّر على **الصياغة**
  --   اللي كانت بتحسب (`interval '20 hours'`) مش على الرقم 20.
  test := '0109 · ساعة الكشف مش مكتوبة في جسم الدالة';
  select count(*) into n from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'fn_sbota_timings'
     and p.prosrc like '%interval ''20 hours''%';
  if n = 0 then result := 'نجح';
  else result := 'فشل — 🔴 لسه فيه interval ''20 hours'' في fn_sbota_timings'; end if;
  return next;

  test := '0109 · الدالة بتقرا من settings';
  select count(*) into n from pg_proc p
    join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.proname = 'fn_sbota_timings'
     and p.prosrc like '%from settings%';
  if n = 1 then result := 'نجح';
  else result := 'فشل — الدالة مش بتقرا settings خالص'; end if;
  return next;

  -- ===== سلوكي =====
  select id into v_tmpl from sbota_templates order by created_at limit 1;
  if v_tmpl is null then
    test := '0109 · السلوك';
    result := 'معلومة — مفيش قوالب، الاختبار السلوكي اتخطّى';
    return next;
    return;
  end if;

  select reveal_hour_cairo, chat_open_hours, chat_close_hours
    into v_was_hour, v_was_open, v_was_close from settings limit 1;

  begin
    update settings set reveal_hour_cairo = 22, chat_open_hours = 48, chat_close_hours = 6;

    -- سبوطة اختبار الساعة 11 بالليل، فالسقف (10 بالليل امبارح) هو اللي بيحكم
    v_starts := (date_trunc('day', now() at time zone 'Africa/Cairo')
                 + interval '10 days' + interval '23 hours') at time zone 'Africa/Cairo';
    v_ends   := v_starts + interval '3 hours';

    delete from sbotat where id = v_id;
    insert into sbotat (id, template_id, starts_at, ends_at, capacity, price, status)
    values (v_id, v_tmpl, v_starts, v_ends, 8, 0, 'draft');

    select reveal_at, chat_opens_at, chat_closes_at
      into v_reveal, v_chat_open, v_chat_shut from sbotat where id = v_id;

    test := '0109 · ساعة الكشف بتيجي من الإعدادات';
    if extract(hour from (v_reveal at time zone 'Africa/Cairo')) = 22 then result := 'نجح';
    else result := format('فشل — حطينا 22 والكشف طلع الساعة %s',
                          extract(hour from (v_reveal at time zone 'Africa/Cairo'))); end if;
    return next;

    -- 🔴 أهم صف في الملف
    test := '0109 · الشات مستحيل يفتح قبل الكشف';
    if v_chat_open >= v_reveal then result := 'نجح';
    else result := 'فشل — 🔴 الشات بيفتح قبل الكشف، يعني المجموعة بتتكشف بدري'; end if;
    return next;

    test := '0109 · قفل الشات بيتحسب من الإعدادات';
    if v_chat_shut = v_ends + interval '6 hours' then result := 'نجح';
    else result := format('فشل — حطينا 6 ساعات والقفل طلع %s', v_chat_shut - v_ends); end if;
    return next;

    -- والرقم الصغير بيأخّر الشات فعلًا (مش بيتجاهله)
    update settings set chat_open_hours = 2;
    update sbotat set starts_at = starts_at where id = v_id;
    select reveal_at, chat_opens_at into v_reveal, v_chat_open from sbotat where id = v_id;

    test := '0109 · الرقم الأصغر بيأخّر فتح الشات';
    if v_chat_open = v_starts - interval '2 hours' and v_chat_open > v_reveal then result := 'نجح';
    else result := 'فشل — حطينا ساعتين والشات مفتحش بعد الكشف'; end if;
    return next;

  exception when others then
    test := '0109 · السلوك';
    result := 'فشل — استثناء: ' || sqlerrm;
    return next;
  end;

  -- ⚠ الترجيع في الطريقين — ومسح **بالرقم اللي أنشأناه بالظبط**
  --   مش بالبادئة (الدرس السابع).
  delete from sbotat where id = v_id;
  update settings set reveal_hour_cairo = v_was_hour,
                      chat_open_hours   = v_was_open,
                      chat_close_hours  = v_was_close;
end $body$;

comment on function test_reveal_hour() is
  '0109 — ساعة الكشف وساعات الشات بتيجي من settings، والشات مستحيل يفتح قبل الكشف.';
