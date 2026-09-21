-- ============================================================================
-- WORK_MIGRATION_25A.sql — صفحة الأمان «إزاي بنأمّنك»
--
-- ⚠ ده **الجزء الأول من اتنين**. الزقه لوحده، وبعد ما ينجح الزق 25B.
--    (الملف اتقسم لأن اللصق في محرر SQL بيتقص لما يكون كبير — شوف الدرس
--     السبعتاشر في CLAUDE.md.)
--
-- الوجع: «رايحة فين ومع مين؟» — السؤال اللي بيقف قدام نص الجمهور.
--
-- صفحة `/aman` بتقول اللي إحنا **عاملينه فعلًا**: التحويل بيتراجع بالإيد ·
-- العنوان للي دفع بس · الكشف قبل الخروجة · الأرقام مخفية · الشات بيتقفل ·
-- البلاغ في كل رسالة · السن. كلها شغّالة في القاعدة من زمان ومكانش حد
-- قايلها. الصفحة في `content_pages` زي `/rules`، فتقدر تعدّلها من
-- /admin/content ← صفحات الموقع.
--
-- ومعاها: السن بقى بيتقرا من `settings` — كان مكتوب في الكود.
--
-- بعده شغّل:  select * from test_safety_page();   — المفروض ٦ صفوف «نجح».
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
