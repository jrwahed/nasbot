-- ============================================================================
-- WORK_MIGRATION_25.sql — الأمان: صفحة «إزاي بنأمّنك» + رابط الاطمئنان
--
-- الوجع اللي الملف ده بيمسكه: «رايحة فين ومع مين؟» — السؤال اللي بيقف
-- قدام نص الجمهور، والسؤال اللي أم أي بنت بتسأله.
--
-- فيه حاجتين:
--
-- (0104) صفحة `/aman` — بتقول اللي إحنا **عاملينه فعلًا**: التحويل بيتراجع
--        بالإيد · العنوان للي دفع بس · الكشف قبل الخروجة · الأرقام مخفية ·
--        الشات بيتقفل · البلاغ في كل رسالة · السن. كلها شغّالة في القاعدة
--        من زمان ومكانش حد قايلها. الصفحة في `content_pages` زي `/rules`،
--        فتقدر تعدّلها من /admin/content ← صفحات الموقع.
--        ومعاها: السن بقى بيتقرا من `settings` — كان مكتوب في الكود.
--
-- (0105) «معايا حد يعرف» — العضو بيعمل رابط من صفحة حجزه ويبعته لأمه أو
--        لصاحبته. اللي معاه الرابط بيشوف: الاسم الأول · الخروجة · الميعاد ·
--        المكان · ووصل ولا لسه. **وبس.** والرابط بيقفل لوحده بعد الخروجة،
--        والعضو يقدر يقفله في أي وقت.
--
-- ⚠ الترتيب: 0104 الأول (بيعمل الصفحة) وبعدين 0105 (بيزوّد فقرة فيها).
--    الملف ده مرتّب صح، الزقه كله مرة واحدة.
--
-- بعده شغّل الاتنين دول — المفروض كلهم «نجح»:
--   select * from test_safety_page();
--   select * from test_safety_link();
--
-- وبعد اللزق من اللوحة:
--   · /admin/settings ← الساعات والمواعيد ← «رابط الاطمئنان بيقفل بعد
--     الخروجة بـ» (افتراضي ١٢ ساعة)
--   · /admin/settings ← الأعضاء والتسجيل ← «أقل سن للتسجيل» بقى موصّل فعلًا
--   · /admin/content ← صفحات الموقع ← «الأمان» لو عايز تظبط الكلام
-- ============================================================================

-- ##########################################################################
-- # 20260920200000_0104_safety_page.sql
-- ##########################################################################

-- ============================================================================
-- 0104 — صفحة الأمان `/aman` + السن من الإعدادات
--
-- الوجع: «رايحة فين ومع مين؟» — ده السؤال اللي بيقف قدام نص الجمهور.
-- وإحنا **عاملين** الحاجات اللي بترد عليه فعلًا (التحويل بيتراجع بالإيد ·
-- العنوان للي دفع بس · الكشف قبل الخروجة · الأرقام مخفية · الشات بيتقفل ·
-- البلاغ من أي رسالة · السن)، بس **مش قايلينها في أي مكان**. الميزة اللي
-- محدش عارف إنها موجودة = ميزة مش موجودة.
--
-- الحل: صفحة محتوى جديدة زي `/rules` بالظبط — جوه `content_pages` و
-- `content_blocks`، يعني المالك بيعدّلها من `/admin/content` من غير نشر.
-- **مفيش جدول جديد ومفيش كود قاعدة جديد** للصفحة نفسها.
--
-- وجاي معاها تصليح كان لازم يتعمل مع الصفحة دي بالذات: الصفحة بتقول
-- «الحجز من السن ده»، والرقم ده كان **مكتوب في جسم `fn_can_book`** مش
-- بيتقرا من `settings` — يعني المالك يغيّره من اللوحة ومحدش بيسمعه،
-- والصفحة تبقى بتوعد بحاجة القاعدة مش بتنفّذها. (قاعدة المشروع: كل رقم
-- في `settings`، مش في الكود.)
--
-- آمنة تتكرر: `if not exists` / `create or replace` / `on conflict`.
-- ============================================================================


-- ===== 1) الصفحة وفقراتها =====
--
-- ⚠ الكتلة كلها جوه `if not exists (aman)` علشان تبقى **آمنة تتكرر فعلًا**:
--   لو المالك عدّل فقرة أو مسح واحدة، اللزق تاني ما يرجّعش القديم. وبرضه
--   ترتيب الصفحات التانية ما بيتزحلقش مرتين.
do $$
begin
  if not exists (select 1 from content_pages where slug = 'aman') then

    -- الأمان يقعد بعد القواعد على طول في الذيل
    update content_pages set sort = sort + 1 where sort >= 2;

    insert into content_pages (slug, title_ar, intro_ar, footer_label_ar, sort, is_active)
    values ('aman', 'إزاي بنأمّنك',
            'إنك تخرج مع ناس ما تعرفهمش محتاج ثقة. دي اللي إحنا عاملينه علشان تيجي وانت مرتاح — مش كلام، ده اللي شغّال في الموقع دلوقتي.',
            'الأمان', 2, true);

    insert into content_blocks (page_slug, kind, heading_ar, body_ar, tone, ref, sort) values
      ('aman', 'numbered', 'محدش بيدخل المجموعة من غير ما يدفع',
       'الحجز ما بيتأكدش لوحده. إحنا بنشوف كل تحويل بعينينا وبنأكّده بإيدينا. يعني اللي قاعد معاك عدّى من قدامنا، مش دوس زرار وخلاص.',
       null, null, 1),

      ('aman', 'numbered', 'العنوان ما بيوصلش غير للي دفع',
       'قبل ما تحجز بتشوف المنطقة بس. العنوان بالظبط بيوصل للي أكّد حجزه — مش معروض على الموقع ولا بيتبعت لحد تاني.',
       null, null, 2),

      ('aman', 'numbered', 'بتعرف مين جاي معاك قبل ما تروح',
       'المجموعة بتتكشف قبل الخروجة. وقبل الكشف بتشوف الأرقام: كام واحد حاجز، وكام بنت وكام ولد، والسن. يعني عمرك ما بتروح وانت مش عارف رايح على إيه.',
       null, null, 3),

      ('aman', 'numbered', 'رقمك مش بيروح لحد',
       'الأرقام كلها مخفية والكلام جوه الموقع. والشات بينك وبين حد لوحده ما بيتفتحش غير لو الاتنين اختاروا بعض بعد الخروجة — من طرف واحد ما بيحصلش.',
       null, null, 4),

      ('aman', 'numbered', 'الشات بيتقفل بعد الخروجة',
       'شات المجموعة بيتقفل لوحده بعد ما الخروجة تخلص. مفيش جروب فاضل مفتوح على طول وانت مش عايزه.',
       null, null, 5),

      ('aman', 'numbered', 'فيه بلاغ في كل رسالة',
       'أي رسالة تضايقك تقدر تبلّغ عنها من مكانها. البلاغ بيوصلنا، وبنقدر نشيل اللي عمل كده من المجموعة أو نقفل حسابه خالص.',
       null, null, 6),

      ('aman', 'numbered', 'فيه سن أدنى، والقاعدة هي اللي بتمنع',
       'الحجز من سن معيّن، والرحلات اللي فيها مبيت من سن أكبر. ده مش شرط مكتوب في صفحة — ده شرط في قلب الموقع، اللي ما ينطبقش عليه الحجز بيترفض قدامه.',
       null, null, 7),

      ('aman', 'callout', 'خروجات بنات بس',
       'فيه خروجات للبنات بس. تقدري تفلتريها من الرئيسية من كبسولة «بنات بس»، وتقدري تفتحي واحدة بنفسك من «افتح خروجة».',
       'cobalt', null, 8);

  end if;
end $$;


-- ===== 2) السن من الإعدادات مش من الكود =====
--
-- ⚠ الفرق الوحيد عن نسخة `0101` هو الحتة دي: الرقمين بقوا بيتقروا من
--   `settings`. الباقي منقول بالحرف — **متعدّلش حاجة تانية هنا**، البوابة
--   والصيانة والغامضة وكل حارس تاني زي ما هو.
create or replace function fn_can_book(p_id uuid, s_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p profiles;
  s sbotat;
  t sbota_templates;
  age int;
  gate text;
  v_min       int;
  v_min_night int;
begin
  if fn_maintenance_on() and not fn_is_admin() then
    return 'الموقع مقفول دلوقتي لشوية صيانة. ارجعلنا بعد شوية.';
  end if;

  select * into p from profiles where id = p_id;
  if not found or p.deleted_at is not null then return 'الحساب مش موجود'; end if;
  if p.banned_at is not null then return 'الحساب موقوف'; end if;

  -- ===== بوابة الدخول (0101) =====
  gate := fn_gate_state(p_id);
  if gate is not null then return gate; end if;

  select * into s from sbotat where id = s_id;
  if not found then return 'السبوطة دي مش موجودة'; end if;
  if s.status not in ('open', 'draft') then return 'السبوطة مش مفتوحة للحجز'; end if;
  if s.booking_closes_at is not null and now() > s.booking_closes_at then
    return 'الحجز اتقفل';
  end if;

  select * into t from sbota_templates where id = s.template_id;

  -- ⚠ الرقمين من `settings` مش من هنا. كانوا مكتوبين في الكود، والمالك
  --   بيغيّرهم من `/admin/settings` ومحدش بيقراهم. `coalesce` مرتين:
  --   مرة لو العمود فاضي، ومرة لو جدول الإعدادات نفسه لسه فاضي.
  select coalesce(min_age, 18), coalesce(min_age_overnight, 21)
    into v_min, v_min_night
    from settings limit 1;
  v_min       := coalesce(v_min, 18);
  v_min_night := coalesce(v_min_night, 21);

  age := extract(year from now())::int - coalesce(p.birth_year, 0);
  if age < v_min then
    return 'لازم تكون ' || v_min || ' سنة على الأقل';
  end if;
  if t.overnight and age < v_min_night then
    return 'الرحلات بمبيت من ' || v_min_night || ' سنة';
  end if;

  if s.girls_only and p.gender <> 'female' then return 'السبوطة دي بنات بس'; end if;
  if s.is_mystery and not fn_can_book_mystery(p_id) then return 'روح سبوطتين الأول'; end if;

  if exists (select 1 from bookings b
             where b.sbota_id = s_id and b.profile_id = p_id
               and b.status in ('pending_payment','paid','attended')) then
    return 'أنت حاجز السبوطة دي بالفعل';
  end if;

  return null;
end $$;

comment on function fn_can_book(uuid, uuid) is
  'هل العضو ده يقدر يحجز السبوطة دي؟ بترجّع السبب بالعربي أو null. السن بيتقرا من settings (0104).';

-- نفس صلاحيات النسخة اللي قبلها بالظبط — الدالة بتتنادى من مسار الدفع
-- بمفتاح الخدمة، والمتصفح عمره ما بيناديها.
revoke execute on function fn_can_book(uuid, uuid) from public, anon, authenticated;


-- ===== 3) نصوص الرابط =====
insert into copy_strings (key, value_ar, screen, context_ar) values
  ('aman.link', 'إزاي بنأمّنك؟', 'الأمان',
   'رابط صفحة الأمان — تحت صندوق الضمان في صفحة السبوطة وصفحة الدفع')
on conflict (key) do update
  set value_ar   = excluded.value_ar,
      screen     = excluded.screen,
      context_ar = coalesce(excluded.context_ar, copy_strings.context_ar);


-- ===== 4) دالة الاختبار =====
--
-- ⚠ سلوكية مش شكلية: إن العمود `min_age` «موجود في settings» ما يعنيش إن
--   `fn_can_book` بتقراه. فبنغيّر الرقم فعلًا وبنتأكد إن الحجز اتمنع بيه،
--   وبنرجّعه في الحالتين (نجاح أو استثناء).
create or replace function test_safety_page()
returns table (test text, result text)
language plpgsql
set search_path = public
as $body$
declare
  n   int;
  lbl text;
  msg text;
  v_old_min   int;
  v_old_night int;
  v_old_year  int;
  v_old_gate  gate_status_t;
  pid uuid;
  vid uuid := 'bb000104-0000-0000-0000-000000000002';
  tid uuid := 'bb000104-0000-0000-0000-000000000003';
  sid uuid := 'bb000104-0000-0000-0000-000000000004';
begin
  test := '0104 · صفحة الأمان موجودة';
  if exists (select 1 from content_pages where slug = 'aman') then result := 'نجح';
  else result := 'فشل — /aman مش في content_pages'; end if;
  return next;

  -- ⚠ صفحة موجودة وفاضية = «بنكتب الصفحة دي دلوقتي» على الموقع الحقيقي.
  --   ده حصل فعلًا مع /about و/faq (الدرس الخامس).
  test := '0104 · الصفحة مش فاضية';
  select count(*) into n from content_blocks where page_slug = 'aman';
  if n >= 1 then result := 'نجح (' || n || ' فقرة)';
  else result := 'فشل — الصفحة موجودة ومفيهاش ولا فقرة'; end if;
  return next;

  -- ⚠ صفحة من غير مدخل = صفحة مش موجودة (القاعدة ٩.٨).
  test := '0104 · ليها رابط في الذيل';
  select coalesce(btrim(footer_label_ar), '') into lbl from content_pages where slug = 'aman';
  if lbl <> '' then result := 'نجح';
  else result := 'فشل — مفيش اسم رابط، الصفحة مبنية ومحدش يقدر يوصلها'; end if;
  return next;

  -- ===== السلوكي =====
  if not exists (select 1 from settings) then
    test := '0104 · السن من الإعدادات';
    result := 'معلومة — مفيش صف في settings، الاختبار السلوكي اتخطّى';
    return next;
    return;
  end if;

  if fn_maintenance_on() then
    test := '0104 · السن من الإعدادات';
    result := 'معلومة — الموقع في وضع صيانة، الاختبار السلوكي اتخطّى';
    return next;
    return;
  end if;

  -- ⚠ مش بنعمل عضو جديد: `profiles.id` عليه مفتاح أجنبي على `auth.users`،
  --   وعمل حساب دخول وهمي جوه فاحص حاجة ما نعملهاش. بناخد عضو موجود،
  --   بنصوّر قيمه، وبنرجّعها في الطريقين.
  select p.id, p.birth_year, p.gate_status
    into pid, v_old_year, v_old_gate
    from profiles p
   where p.deleted_at is null and p.banned_at is null
     and not exists (select 1 from admin_users a where a.profile_id = p.id)
   order by p.created_at, p.id
   limit 1;

  if pid is null then
    test := '0104 · السن من الإعدادات';
    result := 'معلومة — مفيش ولا عضو في القاعدة، الاختبار السلوكي اتخطّى';
    return next;
    return;
  end if;

  select min_age, min_age_overnight into v_old_min, v_old_night from settings limit 1;

  begin
    insert into venues (id, name, kind, area, address, is_active)
    values (vid, '[اختبار 0104] مكان', 'cafe', 'maadi', '[اختبار]', false)
    on conflict (id) do nothing;

    insert into sbota_templates
      (id, slug, name_ar, story_ar, kind, default_price, org_fee,
       duration_min, min_group, max_group, overnight)
    values (tid, 'test-0104', '[اختبار 0104] قالب', '[اختبار]', 'food',
            10000, 2000, 120, 4, 6, false)
    on conflict (id) do nothing;

    insert into sbotat
      (id, template_id, venue_id, starts_at, ends_at, price, org_fee,
       capacity, status, girls_only, is_day, is_mystery)
    values (sid, tid, vid, now() + interval '7 days', now() + interval '7 days 2 hours',
            10000, 2000, 6, 'open', false, false, false)
    on conflict (id) do nothing;

    -- ⚠ `gate_status = 'approved'` علشان بوابة الدخول ما تردّش قبل حارس
    --   السن وتخلّي الاختبار يقول «نجح» لسبب غلط.
    update profiles
       set birth_year  = extract(year from now())::int - 20,
           gate_status = 'approved'
     where id = pid;

    update settings set min_age = 25;
    msg := fn_can_book(pid, sid);
    test := '0104 · السن الأدنى بيتقرا من الإعدادات';
    if msg is not null and msg like '%25%' then result := 'نجح';
    else result := 'فشل — 🔴 رفعنا السن في الإعدادات لـ25 وعضو سنه 20 عدّى (رجّعت: '
                   || coalesce(msg, 'null') || ')'; end if;
    return next;

    update settings set min_age = 18;
    msg := fn_can_book(pid, sid);
    test := '0104 · وبرجوع الرقم الحجز بيعدّي';
    if msg is null then result := 'نجح';
    else result := 'فشل — الحجز لسه مرفوض بعد ما رجّعنا الرقم (' || msg || ')'; end if;
    return next;

    update sbota_templates set overnight = true where id = tid;
    update settings set min_age_overnight = 30;
    msg := fn_can_book(pid, sid);
    test := '0104 · سن المبيت كمان من الإعدادات';
    if msg is not null and msg like '%30%' then result := 'نجح';
    else result := 'فشل — 🔴 سن المبيت لسه مكتوب في الكود (رجّعت: '
                   || coalesce(msg, 'null') || ')'; end if;
    return next;

  exception when others then
    update settings set min_age = v_old_min, min_age_overnight = v_old_night;
    update profiles set birth_year = v_old_year, gate_status = v_old_gate where id = pid;
    test := '0104 · الاختبار السلوكي';
    result := 'فشل — استثناء: ' || sqlerrm;
    return next;
  end;

  -- ⚠ الترجيع في الطريقين — من غيره الإعدادات بتفضل على قيمة الاختبار
  --   والموقع كله بيقفل على الناس.
  update settings set min_age = v_old_min, min_age_overnight = v_old_night;
  update profiles set birth_year = v_old_year, gate_status = v_old_gate where id = pid;

  -- ⚠ بالأرقام اللي أنشأناها بالظبط مش بالبادئة (الدرس السابع). والعضو
  --   **ما بيتمسحش** — هو عضو حقيقي، إحنا رجّعنا قيمه بس.
  delete from sbotat          where id = sid;
  delete from sbota_templates where id = tid;
  delete from venues          where id = vid;
end $body$;

comment on function test_safety_page() is
  '0104 — صفحة /aman موجودة وفيها فقرات وليها مدخل، والسن بيتقرا من settings فعلًا.';

-- ##########################################################################
-- # 20260920210000_0105_safety_link.sql
-- ##########################################################################

-- ============================================================================
-- 0105 — «معايا حد يعرف»: رابط اطمئنان لحد تثق فيه
--
-- الوجع: «رايحة فين ومع مين؟» — السؤال اللي أم أي بنت بتسأله، والبنت نفسها
-- بتسأله لنفسها. صفحة `/aman` (0104) بتقول إحنا بنعمل إيه، بس مفيش حاجة
-- بتوصل **للناس اللي براها**.
--
-- الحل: العضو بيعمل رابط من صفحة حجزه ويبعته لأمه أو صاحبته. اللي معاه
-- الرابط بيشوف: اسمه الأول · اسم الخروجة · الميعاد · المنطقة (والعنوان لو
-- هو نفسه بقى من حقه يشوفه) · ووصل ولا لسه. **وبس.** مفيش أسامي حد تاني،
-- مفيش أرقام، مفيش أي حاجة عن المجموعة.
--
-- ⚠ الأمان — الرابط ده **بيدي معلومة لحد مش مسجّل**، فده أخطر حاجة في
--    الملف. القرارات:
--    · التوكن ١٦ بايت عشوائي (٣٢ حرف hex) — مش رقم متسلسل ولا رقم الحجز.
--    · بينتهي لوحده بعد الخروجة بساعات من `settings.safety_link_hours`.
--    · العضو يقدر يقفله في أي وقت (`fn_safety_revoke`).
--    · العنوان ما بيبانش غير لو **العضو نفسه** بقى من حقه يشوفه — بنفس
--      الشرط بالحرف، مش نسخة تانية منه (شوف `fn_can_see_place` تحت).
--    · «وصلت بالسلامة» بيتدوس من **العضو** بس، مش من اللي فاتح الرابط.
--      يعني اللي معاه التوكن قارئ فقط، ما بيكتبش حاجة في القاعدة.
--    · الجدول مقفول: مفيش ولا سياسة كتابة، والقراية للإدارة بس. كل حاجة
--      بتمر على دوال — نفس نمط `fn_pair_want` بالظبط (قاعدة §٥.٤).
--
-- ⚠ وفيه تصليح جذري جوه: `fn_sbota_address` كانت بتلم **الحارس والبيانات**
--    في دالة واحدة. أول ما احتجنا نفس البيانات من مكان تاني (الرابط ده)،
--    كان لازم نكتب نسخة تانية من نفس المنطق — ودي بالظبط اللي بتولّد الدرس
--    التلتاشر (العمود اتنقل والدالة ما مشيتش وراه). فاتقسمت لتلاتة:
--      `fn_sbota_place`    → البيانات، من غير أي حارس (مقفولة خالص)
--      `fn_can_see_place`  → الحارس لوحده، بيترد عليه من مكانين
--      `fn_sbota_address`  → زي ما هي بالظبط، بقت بتنادي التنتين
--    الحارس بقى في مكان واحد، فمستحيل ينساه حد.
--
-- آمنة تتكرر: `if not exists` / `create or replace` / `on conflict` /
-- `drop policy if exists` بنفس الاسم الجديد.
-- ============================================================================


-- ===== 1) الرقم في الإعدادات =====
alter table settings
  add column if not exists safety_link_hours int not null default 12;

comment on column settings.safety_link_hours is
  'الرابط بيفضل شغّال كام ساعة بعد ما الخروجة تخلص. بعدها بيموت لوحده.';


-- ===== 2) البيانات والحارس — كل واحد لوحده =====

-- مكان السبوطة من غير أي حارس. **مقفولة على الكل** — دي مش دالة تتنادى
-- من بره، دي المصدر اللي الدوال التانية بتقرا منه.
create or replace function fn_sbota_place(s_id uuid)
returns table (address text, map_lat numeric, map_lng numeric, venue_name text)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_s sbotat;
  v_v venues;
begin
  select * into v_s from sbotat where id = s_id;
  if not found then return; end if;

  -- ⚠ `venue_id` بقى null في سبوطات نسبوط كمان (المالك بيكتب المكان بإيده)،
  --    فاللي مكتوب على السبوطة هو الأصل وصف `venues` احتياطي. خروجة العضو
  --    مالهاش صف أصلًا فبترجّع إحداثيات فاضية — وده صح.
  if v_s.venue_id is not null then
    select * into v_v from venues where id = v_s.venue_id;
  end if;

  return query select
    coalesce(nullif(btrim(v_s.address_ar),    ''), v_v.address),
    v_v.map_lat,
    v_v.map_lng,
    coalesce(nullif(btrim(v_s.venue_name_ar), ''), v_v.name);
end $$;

comment on function fn_sbota_place(uuid) is
  'مكان السبوطة من غير حارس — مصدر واحد لـfn_sbota_address وfn_safety_view. مقفولة على الكل.';

revoke execute on function fn_sbota_place(uuid) from public, anon, authenticated;


-- الحارس لوحده: هل الشخص ده من حقه يشوف العنوان؟
--
-- ⚠ `p_id is null` بترجّع false صريح. مش معتمدين على إن الزائر المجهول
--    «مش هيلاقي حجز» — ده بالظبط نمط `auth.uid() is not null` اللي فتح
--    `fn_reveal` للنت كله في 0062. الرفض صريح.
create or replace function fn_can_see_place(s_id uuid, p_id uuid)
returns boolean
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_s sbotat;
begin
  if p_id is null then return false; end if;
  select * into v_s from sbotat where id = s_id;
  if not found then return false; end if;

  -- خروجة عضو: حجز نشط **و** بعد الكشف. مش أول ما يحجز — علشان حد
  -- ما يحجزش ويلغي ويفضل عارف المكان.
  if v_s.origin = 'member' and (v_s.reveal_at is null or now() < v_s.reveal_at) then
    return false;
  end if;

  return exists (
    select 1 from bookings b
     where b.sbota_id = s_id and b.profile_id = p_id
       and b.status in ('paid','attended')
  );
end $$;

comment on function fn_can_see_place(uuid, uuid) is
  'هل الشخص ده من حقه يشوف عنوان السبوطة؟ حجز مدفوع، وبعد الكشف لو خروجة عضو.';

revoke execute on function fn_can_see_place(uuid, uuid) from public, anon, authenticated;


-- وبقت دي غلاف رفيع على التنتين — الحارس زي ما هو بالحرف.
create or replace function fn_sbota_address(s_id uuid)
returns table (address text, map_lat numeric, map_lng numeric, venue_name text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not fn_can_see_place(s_id, auth.uid()) then return; end if;
  return query select p.address, p.map_lat, p.map_lng, p.venue_name
                 from fn_sbota_place(s_id) p;
end $$;

comment on function fn_sbota_address(uuid) is
  'عنوان السبوطة لصاحب حجز مدفوع. الحارس في fn_can_see_place والبيانات في fn_sbota_place (0105).';

revoke execute on function fn_sbota_address(uuid) from public, anon;
grant execute on function fn_sbota_address(uuid) to authenticated;


-- ===== 3) الجدول =====
create table if not exists safety_links (
  id         uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  token      text not null unique,
  expires_at timestamptz not null,
  arrived_at timestamptz,
  done_at    timestamptz,
  created_at timestamptz not null default now()
);

comment on table safety_links is
  'روابط الاطمئنان — العضو بيعمل واحد ويبعته لحد يثق فيه. التوكن عشوائي وبينتهي لوحده.';
comment on column safety_links.token is '٣٢ حرف hex من gen_random_bytes(16) — مش مشتق من أي رقم في القاعدة.';
comment on column safety_links.arrived_at is 'العضو نفسه دوس «وصلت بالسلامة». اللي فاتح الرابط ما بيكتبش حاجة.';

create index if not exists safety_links_booking_idx on safety_links (booking_id);
create index if not exists safety_links_live_idx    on safety_links (token, expires_at);

alter table safety_links enable row level security;

-- ⚠ **مفيش ولا سياسة كتابة** — الكتابة كلها من دوال definer، زي جداول
--    التبادل بالظبط. القراية للإدارة بس (بلاغ أو متابعة).
drop policy if exists safety_links_read on safety_links;
create policy safety_links_read on safety_links for select
  using (fn_is_admin());

grant select on safety_links to authenticated;


-- ===== 4) الدوال =====

-- العضو بيعمل الرابط (أو بياخد اللي شغّال أصلًا)
create or replace function fn_safety_link(p_booking_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  v_b     bookings;
  v_s     sbotat;
  v_hours int;
  v_tok   text;
begin
  if v_uid is null then raise exception 'لازم تكون داخل بحسابك'; end if;

  select * into v_b from bookings where id = p_booking_id;
  if not found or v_b.profile_id <> v_uid then
    raise exception 'الحجز ده مش بتاعك';
  end if;
  if v_b.status not in ('pending_payment','paid','attended') then
    raise exception 'الحجز ده مش شغّال';
  end if;

  select * into v_s from sbotat where id = v_b.sbota_id;

  select coalesce(safety_link_hours, 12) into v_hours from settings limit 1;
  v_hours := coalesce(v_hours, 12);

  -- فيه رابط شغّال؟ رجّعه زي ما هو — مش بنولّد واحد جديد كل مرة يفتح
  -- الصفحة، علشان اللي بعته لأمه ما يبطّلش.
  select l.token into v_tok
    from safety_links l
   where l.booking_id = p_booking_id and l.expires_at > now()
   order by l.created_at desc
   limit 1;
  if v_tok is not null then return v_tok; end if;

  v_tok := encode(gen_random_bytes(16), 'hex');
  insert into safety_links (booking_id, token, expires_at)
  values (p_booking_id, v_tok,
          coalesce(v_s.ends_at, v_s.starts_at, now()) + make_interval(hours => v_hours));
  return v_tok;
end $$;

comment on function fn_safety_link(uuid) is 'بترجّع توكن رابط الاطمئنان لحجز العضو نفسه — بتعمل واحد لو مفيش.';
revoke execute on function fn_safety_link(uuid) from public, anon;
grant execute on function fn_safety_link(uuid) to authenticated;


-- الرابط الشغّال بتاع حجزي — **من غير ما تعمل واحد جديد**
--
-- ⚠ ليه دالة لوحدها ومش بننادي `fn_safety_link`؟ لأن دي بتعمل رابط لو
--    مفيش. لو صفحة الحجز نادتها وهي بتحمّل، كل واحد يفتح حجزه كان
--    هيتعملّه رابط اطمئنان ما طلبهوش — ويقعد شغّال لحد ما الخروجة تعدّي.
--    الرابط لازم يتعمل بقرار، مش بزيارة صفحة.
create or replace function fn_safety_my(p_booking_id uuid)
returns table (token text, arrived_at timestamptz, done_at timestamptz)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then return; end if;
  if not exists (select 1 from bookings b
                  where b.id = p_booking_id and b.profile_id = v_uid) then
    return;
  end if;
  return query
    select l.token, l.arrived_at, l.done_at
      from safety_links l
     where l.booking_id = p_booking_id and l.expires_at > now()
     order by l.created_at desc
     limit 1;
end $$;

comment on function fn_safety_my(uuid) is 'الرابط الشغّال بتاع حجز العضو نفسه — بترجّع ولا صف لو مفيش، ومش بتعمل واحد.';
revoke execute on function fn_safety_my(uuid) from public, anon;
grant execute on function fn_safety_my(uuid) to authenticated;


-- «وصلت بالسلامة» / «رجعت» — من العضو نفسه
create or replace function fn_safety_mark(p_booking_id uuid, p_kind text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'لازم تكون داخل بحسابك'; end if;
  if p_kind not in ('arrived','done') then raise exception 'نوع غلط'; end if;

  if not exists (select 1 from bookings b
                  where b.id = p_booking_id and b.profile_id = v_uid) then
    raise exception 'الحجز ده مش بتاعك';
  end if;

  update safety_links l
     set arrived_at = case when p_kind = 'arrived' then coalesce(l.arrived_at, now()) else l.arrived_at end,
         done_at    = case when p_kind = 'done'    then coalesce(l.done_at,    now()) else l.done_at    end
   where l.booking_id = p_booking_id and l.expires_at > now();
end $$;

comment on function fn_safety_mark(uuid, text) is 'العضو بيقول «وصلت» أو «رجعت» — بيبان للي معاه الرابط.';
revoke execute on function fn_safety_mark(uuid, text) from public, anon;
grant execute on function fn_safety_mark(uuid, text) to authenticated;


-- اقفل الرابط دلوقتي
create or replace function fn_safety_revoke(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'لازم تكون داخل بحسابك'; end if;
  if not exists (select 1 from bookings b
                  where b.id = p_booking_id and b.profile_id = v_uid) then
    raise exception 'الحجز ده مش بتاعك';
  end if;
  update safety_links set expires_at = now() where booking_id = p_booking_id;
end $$;

comment on function fn_safety_revoke(uuid) is 'العضو بيقفل رابط الاطمئنان بتاعه في أي وقت.';
revoke execute on function fn_safety_revoke(uuid) from public, anon;
grant execute on function fn_safety_revoke(uuid) to authenticated;


-- القراية بالتوكن — دي **الوحيدة** المفتوحة للزائر المجهول
--
-- ⚠ بترجّع صف واحد دايمًا، و`state` بيقول: ok · expired · none. من غير
--    كده الصفحة مش هتعرف تفرّق بين «الرابط غلط» و«الرابط خلص»، وهتقول
--    للأم كلام مش مظبوط في أسوأ وقت.
create or replace function fn_safety_view(p_token text)
returns table (
  state      text,
  first_name text,
  sbota_name text,
  starts_at  timestamptz,
  ends_at    timestamptz,
  area_code  text,
  area_label text,
  venue_name text,
  address    text,
  arrived_at timestamptz,
  done_at    timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  l       safety_links;
  v_b     bookings;
  v_s     sbotat;
  v_t     sbota_templates;
  v_name  text;
  -- ⚠ متغيّرين عاديين مش `record`: الـrecord اللي ما اتحطّش فيه حاجة
  --   بيرمي استثناء أول ما تقراه، فلو الحارس رفض كانت الدالة بتقع بدل
  --   ما ترجّع «مفيش عنوان». ده وقع فعلًا في أول تشغيل للفاحص.
  v_addr  text;
  v_vname text;
begin
  if p_token is null or length(btrim(p_token)) < 16 then
    return query select 'none'::text, null::text, null::text, null::timestamptz,
                        null::timestamptz, null::text, null::text, null::text,
                        null::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  select * into l from safety_links where token = btrim(p_token);
  if not found then
    return query select 'none'::text, null::text, null::text, null::timestamptz,
                        null::timestamptz, null::text, null::text, null::text,
                        null::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  if l.expires_at <= now() then
    return query select 'expired'::text, null::text, null::text, null::timestamptz,
                        null::timestamptz, null::text, null::text, null::text,
                        null::text, null::timestamptz, null::timestamptz;
    return;
  end if;

  select * into v_b from bookings where id = l.booking_id;
  select * into v_s from sbotat   where id = v_b.sbota_id;
  select * into v_t from sbota_templates where id = v_s.template_id;
  select p.first_name into v_name from profiles p where p.id = v_b.profile_id;

  -- ⚠ العنوان بنفس حارس العضو بالظبط — لو هو لسه مش شايفه، اللي بيطمن
  --    عليه مش هيشوفه كمان. `fn_can_see_place` هي نفسها اللي بترد على
  --    `fn_sbota_address`، فمستحيل الاتنين يختلفوا.
  if fn_can_see_place(v_s.id, v_b.profile_id) then
    select pl.address, pl.venue_name into v_addr, v_vname from fn_sbota_place(v_s.id) pl;
  end if;

  return query select
    'ok'::text,
    v_name,
    coalesce(nullif(btrim(v_s.title_ar), ''), v_t.name_ar),
    v_s.starts_at,
    v_s.ends_at,
    v_s.area::text,
    nullif(btrim(v_s.area_label_ar), ''),
    v_vname,
    v_addr,
    l.arrived_at,
    l.done_at;
end $$;

comment on function fn_safety_view(text) is
  'اللي معاه الرابط بيشوف: الاسم الأول · الخروجة · الميعاد · المنطقة · العنوان (لو العضو من حقه) · وصل ولا لسه. وبس.';

revoke execute on function fn_safety_view(text) from public;
grant execute on function fn_safety_view(text) to anon, authenticated;


-- ===== 5) النصوص =====
insert into copy_strings (key, value_ar, screen, context_ar) values
  ('safety.card.title',   'معايا حد يعرف', 'حجزي', 'عنوان كرت رابط الاطمئنان'),
  ('safety.card.body',    'ابعت الرابط ده لحد تثق فيه. هيشوف رايح فين وامتى، وهيعرف أول ما توصل. مش هيشوف أي حاجة تانية — لا أسامي اللي معاك ولا أرقام حد.', 'حجزي', 'شرح الكرت'),
  ('safety.card.make',    'اعمل الرابط', 'حجزي', 'زرار توليد الرابط'),
  ('safety.card.making',  'ثانية واحدة…', 'حجزي', 'وهو بيتعمل'),
  ('safety.card.copy',    'انسخ الرابط', 'حجزي', 'زرار النسخ'),
  ('safety.card.copied',  'اتنسخ ✓', 'حجزي', 'بعد النسخ'),
  ('safety.card.wa',      'ابعته على واتساب', 'حجزي', 'زرار الواتساب'),
  ('safety.card.waMsg',   'أنا رايح {{sbota}}. تقدر تطمن عليّ من اللينك ده: {{link}}', 'حجزي', 'الرسالة الجاهزة — {{sbota}} اسم الخروجة و{{link}} الرابط'),
  ('safety.card.arrived', 'وصلت بالسلامة', 'حجزي', 'زرار العضو بيدوسه لما يوصل'),
  ('safety.card.arrivedOn','قلنالهم إنك وصلت ✓', 'حجزي', 'بعد ما يدوس'),
  ('safety.card.done',    'خلصت ورجعت', 'حجزي', 'زرار الرجوع'),
  ('safety.card.doneOn',  'قلنالهم إنك رجعت ✓', 'حجزي', 'بعد ما يدوس'),
  ('safety.card.revoke',  'اقفل الرابط', 'حجزي', 'زرار إلغاء الرابط'),
  ('safety.card.revoked', 'الرابط اتقفل. تقدر تعمل واحد جديد.', 'حجزي', 'بعد القفل'),
  ('safety.card.expires', 'الرابط بيقفل لوحده بعد الخروجة.', 'حجزي', 'سطر تحت الزراير'),
  ('safety.card.err',     'مقدرناش نعمل الرابط دلوقتي. جرّب تاني.', 'حجزي', 'لما الدالة ترفض'),

  ('safety.page.title',   '{{name}} في خروجة', 'صفحة الاطمئنان', 'عنوان الصفحة اللي بيفتحها اللي واثق فيه'),
  ('safety.page.sub',     'الصفحة دي بتتحدّث لوحدها. مفيش فيها أي معلومة عن حد تاني.', 'صفحة الاطمئنان', 'سطر تحت العنوان'),
  ('safety.page.when',    'الميعاد', 'صفحة الاطمئنان', 'عنوان قسم الوقت'),
  ('safety.page.where',   'المكان', 'صفحة الاطمئنان', 'عنوان قسم المكان'),
  ('safety.page.hidden',  'العنوان بالظبط بيبان هنا قبل الخروجة بشوية.', 'صفحة الاطمئنان', 'لما العنوان لسه مش متاح'),
  ('safety.page.map',     'افتح على الخريطة', 'صفحة الاطمئنان', 'زرار خرايط جوجل'),
  ('safety.page.waiting', 'لسه ما وصلش', 'صفحة الاطمئنان', 'حالة قبل ما يدوس وصلت'),
  ('safety.page.arrived', 'وصل الساعة {{time}}', 'صفحة الاطمئنان', 'بعد ما يدوس وصلت'),
  ('safety.page.done',    'خلص ورجع الساعة {{time}}', 'صفحة الاطمئنان', 'بعد ما يدوس رجعت'),
  ('safety.page.expired', 'الرابط ده خلص — الخروجة عدّت.', 'صفحة الاطمئنان', 'رابط منتهي'),
  ('safety.page.none',    'الرابط ده مش شغّال.', 'صفحة الاطمئنان', 'رابط غلط أو اتقفل'),
  ('safety.page.back',    'نسبوط', 'صفحة الاطمئنان', 'رابط الرجوع للرئيسية')
on conflict (key) do update
  set value_ar   = excluded.value_ar,
      screen     = excluded.screen,
      context_ar = coalesce(excluded.context_ar, copy_strings.context_ar);


-- ===== 6) فقرة في صفحة الأمان =====
-- ⚠ الهوية هنا `ref = 'tamenny'` مش العنوان — علشان لو المالك غيّر الكلام
--    اللزق تاني ما يزوّدش نسخة تانية (الدرس العاشر: الفحص على المفتاح
--    الثابت مش على اللي بيتعرض).
do $$
begin
  if exists (select 1 from content_pages where slug = 'aman')
     and not exists (select 1 from content_blocks where ref = 'tamenny') then
    insert into content_blocks (page_slug, kind, heading_ar, body_ar, tone, ref, sort)
    values ('aman', 'callout', 'وتقدر تخلّي حد مطمن عليك',
            'من صفحة حجزك بتعمل رابط وتبعته لأمك أو لصاحبك. هو هيشوف رايح فين وامتى، وهيعرف أول ما توصل — ومش هيشوف أي حاجة تانية. والرابط بيقفل لوحده بعد الخروجة، وتقدر تقفله في أي وقت.',
            'sand', 'tamenny', 9);
  end if;
end $$;


-- ===== 7) دالة الاختبار =====
--
-- ⚠ سلوكية: إن الدالة «موجودة» ما يعنيش إنها بتمنع. بنلبس هوية العضو،
--    وهوية عضو تاني، وهوية الزائر المجهول، وبنشوف كل واحد بياخد إيه بالظبط.
create or replace function test_safety_link()
returns table (test text, result text)
language plpgsql
security definer
set search_path = public, auth
as $body$
declare
  v_me   uuid := '44444444-0000-0000-0000-000000000105';
  v_they uuid := '44444444-0000-0000-0000-000000000106';
  v_tpl  uuid := '66666666-0000-0000-0000-000000000105';
  v_sb   uuid := '77777777-0000-0000-0000-000000000105';
  v_bk   uuid := 'aaaaaaaa-0000-0000-0000-000000000105';
  v_tok  text;
  v_tok2 text;
  v_row  record;
  n int;
begin
  test := '0105 · مفيش سياسة كتابة على safety_links';
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'safety_links' and cmd <> 'SELECT';
  if n = 0 then result := 'نجح';
  else result := format('فشل — 🔴 فيه %s سياسة كتابة، يعني فيه باب مباشر على الجدول', n); end if;
  return next;

  test := '0105 · الزائر المجهول ما يقدرش يعمل رابط';
  if not has_function_privilege('anon', 'fn_safety_link(uuid)', 'execute')
    then result := 'نجح';
    else result := 'فشل — 🔴 أي حد على النت يقدر يولّد روابط اطمئنان'; end if;
  return next;

  test := '0105 · اللي معاه الرابط يقدر يقراه من غير حساب';
  if has_function_privilege('anon', 'fn_safety_view(text)', 'execute')
    then result := 'نجح';
    else result := 'فشل — الأم لازم تعمل حساب علشان تطمن، والميزة كده ملهاش لازمة'; end if;
  return next;

  -- ===== بذرة مؤقتة =====
  insert into auth.users (instance_id, id, aud, role, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data, is_sso_user)
  values ('00000000-0000-0000-0000-000000000000', v_me,   'authenticated','authenticated',
          now(), now(), '{}'::jsonb, '{}'::jsonb, false),
         ('00000000-0000-0000-0000-000000000000', v_they, 'authenticated','authenticated',
          now(), now(), '{}'::jsonb, '{}'::jsonb, false)
  on conflict (id) do nothing;

  insert into profiles (id, first_name, gender, area, role) values
    (v_me,   '[اختبار] نسمة', 'female', 'maadi',   'member'),
    (v_they, '[اختبار] غريب', 'male',   'tagamoa', 'member')
  on conflict (id) do nothing;

  insert into sbota_templates
    (id, slug, name_ar, story_ar, kind, default_price, org_fee, duration_min, min_group, max_group)
  values (v_tpl, 'test-safety-0105', '[اختبار] قالب الاطمئنان', '[اختبار]', 'food',
          15000, 4000, 120, 4, 6)
  on conflict (id) do nothing;

  -- ⚠ `venue_id = null` عن قصد — الحالة اللي `fn_sbota_place` اتعملت علشانها
  insert into sbotat
    (id, template_id, venue_id, starts_at, ends_at, price, org_fee, capacity,
     status, girls_only, is_day, is_mystery, origin, venue_name_ar, address_ar)
  values (v_sb, v_tpl, null, now() + interval '2 days', now() + interval '2 days 3 hours',
          15000, 4000, 6, 'open', false, false, false, 'nasbot',
          '[اختبار] اسم المكان', '[اختبار] العنوان بالتفصيل')
  on conflict (id) do nothing;

  insert into bookings (id, sbota_id, profile_id, status, price_paid)
  values (v_bk, v_sb, v_me, 'pending_payment', 15000)
  on conflict (id) do nothing;

  -- ===== (١) صاحب الحجز بيعمل رابط، وبياخد نفس التوكن تاني =====
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', v_me), true);
  v_tok  := fn_safety_link(v_bk);
  v_tok2 := fn_safety_link(v_bk);

  test := '0105 · الرابط بيتعمل مرة واحدة ومش بيتغيّر';
  if v_tok is not null and length(v_tok) = 32 and v_tok = v_tok2 then result := 'نجح';
  else result := format('فشل — 🔴 التوكن بيتغيّر كل مرة (%s ثم %s)، فاللي بعته لأمه بيبطّل',
                        coalesce(v_tok,'null'), coalesce(v_tok2,'null')); end if;
  return next;

  test := '0105 · fn_safety_my بترجّع الرابط من غير ما تعمل واحد';
  select count(*) into n from safety_links where booking_id = v_bk;
  if (select t.token from fn_safety_my(v_bk) t) = v_tok and n = 1 then result := 'نجح';
  else result := format('فشل — رجّعت رابط غلط أو عملت واحد زيادة (%s صف)', n); end if;
  return next;

  -- ===== (٢) حد تاني ما يقدرش يعمل رابط لحجز مش بتاعه =====
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', v_they), true);
  test := '0105 · حد تاني ما يقدرش يعمل رابط لحجزك';
  begin
    perform fn_safety_link(v_bk);
    result := 'فشل — 🔴 أي عضو يقدر يولّد رابط على حجز حد تاني ويعرف مكانه';
  exception when others then
    result := 'نجح';
  end;
  return next;

  test := '0105 · حد تاني ما يشوفش رابط حجزك';
  if not exists (select 1 from fn_safety_my(v_bk)) then result := 'نجح';
  else result := 'فشل — 🔴 أي عضو يقدر ياخد توكن حجز حد تاني'; end if;
  return next;

  -- ===== (٣) الزائر المجهول بالتوكن بيشوف، ومن غيره لأ =====
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);

  select * into v_row from fn_safety_view(v_tok);
  test := '0105 · اللي معاه الرابط بيشوف الاسم والميعاد';
  if v_row.state = 'ok' and v_row.first_name = '[اختبار] نسمة' and v_row.starts_at is not null
    then result := 'نجح';
    else result := format('فشل — رجّع state=%s واسم=%s',
                          coalesce(v_row.state,'null'), coalesce(v_row.first_name,'null')); end if;
  return next;

  select * into v_row from fn_safety_view('00000000000000000000000000000000');
  test := '0105 · توكن غلط ما بيطلّعش حاجة';
  if v_row.state = 'none' and v_row.first_name is null then result := 'نجح';
  else result := format('فشل — 🔴 توكن مخترع رجّع state=%s', coalesce(v_row.state,'null')); end if;
  return next;

  -- ===== (٤) العنوان بنفس حارس العضو بالظبط =====
  select * into v_row from fn_safety_view(v_tok);
  test := '0105 · لسه مستني الدفع = مفيش عنوان في الرابط';
  if v_row.address is null and v_row.venue_name is null then result := 'نجح';
  else result := format('فشل — 🔴 العنوان طلع من غير دفع: %s', coalesce(v_row.address,'')); end if;
  return next;

  perform set_config('request.jwt.claims', '', true);
  update bookings set status = 'paid' where id = v_bk;
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);

  select * into v_row from fn_safety_view(v_tok);
  test := '0105 · وبعد الدفع العنوان بيوصل';
  if v_row.address = '[اختبار] العنوان بالتفصيل'
     and v_row.venue_name = '[اختبار] اسم المكان' then result := 'نجح';
  else result := format('فشل — 🔴 الدافع مطمّنش حد: العنوان رجع %s',
                        coalesce(v_row.address,'(فاضي)')); end if;
  return next;

  -- ===== (٥) «وصلت» بيتدوس من العضو بس =====
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', v_they), true);
  test := '0105 · حد تاني ما يقدرش يقول إنك وصلت';
  begin
    perform fn_safety_mark(v_bk, 'arrived');
    result := 'فشل — 🔴 أي عضو يقدر يكدب على اللي مطمن عليك';
  exception when others then
    result := 'نجح';
  end;
  return next;

  perform set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', v_me), true);
  perform fn_safety_mark(v_bk, 'arrived');
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select * into v_row from fn_safety_view(v_tok);
  test := '0105 · «وصلت» بتبان للي معاه الرابط';
  if v_row.arrived_at is not null then result := 'نجح';
  else result := 'فشل — 🔴 دوس «وصلت» وما وصلش حاجة'; end if;
  return next;

  -- ===== (٦) القفل بيقفل فعلًا =====
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', v_me), true);
  perform fn_safety_revoke(v_bk);
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select * into v_row from fn_safety_view(v_tok);
  test := '0105 · «اقفل الرابط» بيقفله فعلًا';
  if v_row.state = 'expired' and v_row.first_name is null then result := 'نجح';
  else result := format('فشل — 🔴 الرابط لسه شغّال بعد القفل (state=%s)',
                        coalesce(v_row.state,'null')); end if;
  return next;

  perform set_config('request.jwt.claims', '', true);

  -- ===== تنضيف — بالأرقام اللي أنشأناها بالظبط (الدرس السابع) =====
  delete from safety_links   where booking_id = v_bk;
  delete from bookings       where id = v_bk;
  delete from sbotat         where id = v_sb;
  delete from sbota_templates where id = v_tpl;
  delete from profiles p     where p.id in (v_me, v_they)
    and not exists (select 1 from admin_users a where a.profile_id = p.id);
  delete from auth.users u   where u.id in (v_me, v_they)
    and not exists (select 1 from profiles p where p.id = u.id);

exception when others then
  -- ⚠ الترجيع في الطريقين — من غيره بيفضل عضو وهمي و«سبوطة اختبار» في
  --   قاعدة الإنتاج لو الاختبار وقع في نصّه.
  perform set_config('request.jwt.claims', '', true);
  delete from safety_links   where booking_id = v_bk;
  delete from bookings       where id = v_bk;
  delete from sbotat         where id = v_sb;
  delete from sbota_templates where id = v_tpl;
  delete from profiles p     where p.id in (v_me, v_they)
    and not exists (select 1 from admin_users a where a.profile_id = p.id);
  delete from auth.users u   where u.id in (v_me, v_they)
    and not exists (select 1 from profiles p where p.id = u.id);
  test := '0105 · الاختبار السلوكي';
  result := 'فشل — استثناء: ' || sqlerrm;
  return next;
end $body$;

comment on function test_safety_link() is
  '0105 — الجدول مقفول، الرابط بيتعمل من صاحبه بس، اللي معاه التوكن بيشوف الميعاد والعنوان (بنفس حارس العضو) وبس، والقفل بيقفل.';

revoke execute on function test_safety_link() from public, anon, authenticated;
