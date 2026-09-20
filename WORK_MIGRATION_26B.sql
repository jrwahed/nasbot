-- ============================================================================
-- WORK_MIGRATION_26B.sql — «أول ربع ساعة»
--
-- ⚠ **الزق 26A الأول.**
--
-- الوجع: «هدفع وأروح ألاقي نفسي قاعد ساكت». مش الفلوس ولا المكان — أول ربع
-- ساعة. ودي اللي بتفرق بين «جربت مرة» و«بقيت أخرج».
--
-- كرت بيفتح مع الكشف فيه تلاتة وبس: العلامة اللي تعرفهم بيها · اسم واحد
-- بالظبط تسأل عليه (أقدم حجز في مجموعتك) · وتلات أسئلة لو الكلام وقف.
--
-- بعده شغّل:  select * from test_arrival();   — المفروض ١١ صف «نجح».
--
-- وبعد اللزق:
--   · /admin/sbotat ← أي سبوطة ← خانة «العلامة (هيعرفوا بعض إزاي)»
--   · العضو صاحب الخروجة بيكتب علامته من /me/sbotati
-- ============================================================================

-- ##########################################################################
-- # 20260920230000_0107_first_quarter_hour.sql
-- ##########################################################################

-- ============================================================================
-- 0107 — «أول ربع ساعة»
--
-- الوجع: «هدفع وأروح ألاقي نفسي قاعد ساكت». مش الفلوس ولا المكان — **أول
-- ربع ساعة**. أوصل، ألاقي ٧ ناس واقفين، وأعمل إيه؟ ودي اللي بتفرق بين
-- «جربت مرة» و«بقيت أخرج»: اللي بيجرب ويتكسف عمره ما بيرجع، ومش هيقولك
-- ليه — هيقولك «مشغول».
--
-- واللي عندنا دلوقتي بين الحجز والخروجة: الكشف بيطلّع أسامي، وخلاص.
--
-- تلات حاجات بتفتح مع الكشف في صفحة الحجز:
--   · **العلامة** — «الترابيزة اللي عليها ورقة برتقالي». سطر صاحب الخروجة
--     بيكتبه (`sign_ar`).
--   · **مين يستقبل** — اسم واحد بالظبط تسأل عليه. مش وظيفة ومش كابتن:
--     **أقدم حجز مدفوع في مجموعتك**، بالدور، محسوب مش متخزّن.
--   · **تلات أسئلة** لو الكلام وقف — في `copy_strings`، المالك بيغيّرها.
--
-- ⚠ السرية: الكرت ده بيفتح بنفس حارس المجموعة بالظبط — حجز مدفوع + بعد
--    الكشف + **نفس المجموعة**. لو لسه مفيش مجموعة (المطابقة ما اتعملتش)
--    بنرجّع العلامة بس ومفيش أي اسم. ما ينفعش الكرت يطلّع اسم حد مش في
--    مجموعتك.
--
-- ⚠ وحارس الكلام مشى ورا العمود الجديد: `fn_guard_sbota_text` كان بيفحص
--    ٦ أعمدة، وأي عمود نص جديد **لازم** يتزوّد عليها — وإلا الكلمات
--    الممنوعة تعدّي من الباب الجديد. ده الدرس التلتاشر في أبسط صوره.
--
-- ⚠ وفي الطريق: `fn_my_hosted_sbotat` كانت بتعرض `t.name_ar` — **اسم
--    القالب**. وخروجة العضو كلها بتقعد على قالب عام واحد، فصفحة «خروجاتي»
--    كانت بتقول للعضو اسم القالب العام بدل العنوان اللي هو كتبه بإيده.
--    بقت `coalesce(s.title_ar, t.name_ar)` زي `sbotat_public` بالظبط.
--
-- آمنة تتكرر: `add column if not exists` / `drop ... if exists` + `create`.
-- ============================================================================


-- ===== 1) العلامة =====
alter table sbotat add column if not exists sign_ar text;

comment on column sbotat.sign_ar is
  'العلامة اللي المجموعة تعرف بعضها بيها في المكان — «الترابيزة اللي عليها ورقة برتقالي». بتبان مع الكشف بس.';


-- ===== 2) حارس الكلام يمشي ورا العمود الجديد =====
--
-- ⚠ الجسم منقول بالحرف من النسخة اللي قبلها، الفرق `new.sign_ar` بس.
create or replace function fn_guard_sbota_text()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  hit  text;
  blob text;
begin
  -- الإدارة والكرون بيعدّوا — ده حارس على كتابة العضو
  if not fn_caller_is_browser() then return new; end if;

  blob := lower(concat_ws(' ', new.title_ar, new.details_ar, new.venue_name_ar,
                               new.address_ar, new.cost_note_ar, new.host_note_ar,
                               new.sign_ar));
  if btrim(blob) = '' then return new; end if;

  select w.word into hit from banned_words w
   where blob like '%' || lower(w.word) || '%'
   limit 1;

  if hit is not null then
    raise exception 'الكلمة «%» مش من كلامنا — غيّرها وجرّب تاني', hit
      using errcode = '22023';
  end if;
  return new;
end $$;


-- ===== 3) صاحب الخروجة بيكتب العلامة =====
--
-- ⚠ دالة لوحدها مش parameter جديد في `fn_update_own_sbota`: إضافة
--    parameter بـ`default` بتعمل دالة **تانية** والنداء بيبقى ambiguous،
--    ولازم `drop` بالتوقيع القديم بالظبط. دالة جديدة أنضف وأأمن.
create or replace function fn_set_sbota_sign(p_id uuid, p_sign text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not fn_is_my_sbota_host(p_id) then
    raise exception 'الخروجة دي مش بتاعتك';
  end if;
  update sbotat
     set sign_ar = nullif(btrim(left(coalesce(p_sign, ''), 200)), '')
   where id = p_id;
end $$;

comment on function fn_set_sbota_sign(uuid, text) is
  'صاحب الخروجة بيكتب العلامة اللي المجموعة تعرفه بيها. حارس الكلمات الممنوعة بيشتغل عليها زي باقي كلامه.';

revoke execute on function fn_set_sbota_sign(uuid, text) from public, anon;
grant execute on function fn_set_sbota_sign(uuid, text) to authenticated;


-- ===== 4) «خروجاتي» — العلامة والعنوان الصح =====
drop function if exists fn_my_hosted_sbotat();

create function fn_my_hosted_sbotat()
returns table (
  id uuid, slug text, name_ar text, starts_at timestamptz,
  capacity integer, booked integer, status sbota_status_t,
  note_ar text, sign_ar text
)
language sql
stable
security definer
set search_path = public
as $$
  select s.id, t.slug,
         -- ⚠ كانت `t.name_ar` — اسم القالب العام، مش اللي العضو كتبه
         coalesce(nullif(btrim(s.title_ar), ''), t.name_ar),
         s.starts_at, s.capacity,
         (select count(*)::int from bookings b
           where b.sbota_id = s.id and b.status in ('paid','attended','pending_payment')),
         s.status, s.host_note_ar, s.sign_ar
    from sbotat s
    join sbota_templates t on t.id = s.template_id
   where auth.uid() is not null
     and s.host_id = auth.uid()
   order by s.starts_at desc;
$$;

comment on function fn_my_hosted_sbotat() is
  'الخروجات اللي أنا فاتحها — الأعداد بس ومفيش أسامي، ومعاها السطر والعلامة (0107).';

revoke execute on function fn_my_hosted_sbotat() from public, anon;
grant execute on function fn_my_hosted_sbotat() to authenticated;


-- ===== 5) كرت الوصول =====
create or replace function fn_sbota_arrival(p_booking_id uuid)
returns table (sign_ar text, greeter_name text, greeter_is_me boolean)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_b   bookings;
  v_s   sbotat;
  v_g   uuid;
begin
  if v_uid is null then return; end if;

  select * into v_b from bookings where id = p_booking_id and profile_id = v_uid;
  if not found then return; end if;

  select * into v_s from sbotat where id = v_b.sbota_id;
  if not found then return; end if;

  -- نفس حارس المكان (حجز مدفوع) + الكشف. الكرت بيفتح مع المجموعة.
  if not fn_can_see_place(v_s.id, v_uid) then return; end if;
  if v_s.reveal_at is null or now() < v_s.reveal_at then return; end if;

  -- ⚠ **نفس المجموعة بس.** لو `group_id` فاضي الاستعلام بيرجّع ولا صف،
  --    فالاسم بيطلع null والكرت بيعرض العلامة بس. ما ينفعش نطلّع اسم حد
  --    مش في مجموعتك علشان نملا خانة.
  select b.profile_id into v_g
    from bookings b
    join profiles p on p.id = b.profile_id
   where b.sbota_id = v_s.id
     and b.group_id = v_b.group_id
     and b.status in ('paid','attended')
     and p.deleted_at is null
   order by b.created_at, b.id
   limit 1;

  return query select
    nullif(btrim(v_s.sign_ar), ''),
    (select p.first_name from profiles p where p.id = v_g),
    v_g is not distinct from v_uid;
end $$;

comment on function fn_sbota_arrival(uuid) is
  'العلامة + مين بيستقبل (أقدم حجز مدفوع في نفس المجموعة) — بنفس حارس الكشف بالظبط.';

revoke execute on function fn_sbota_arrival(uuid) from public, anon;
grant execute on function fn_sbota_arrival(uuid) to authenticated;


-- ===== 6) النصوص =====
insert into copy_strings (key, value_ar, screen, context_ar) values
  ('arrive.title',     'أول ربع ساعة', 'حجزي', 'عنوان كرت الوصول — بيفتح مع الكشف'),
  ('arrive.signLabel', 'هتعرفهم إزاي', 'حجزي', 'عنوان سطر العلامة'),
  ('arrive.greeter',   'أول ما توصل اسأل على {{name}}.', 'حجزي', 'مين بيستقبل'),
  ('arrive.greeterMe', 'انت أول واحد حجز — يبقى انت اللي هتستقبلهم. قول لكل واحد اسمك.', 'حجزي',
   'لما اللي بيستقبل هو أنا'),
  ('arrive.qTitle',    'لو الكلام وقف', 'حجزي', 'عنوان الأسئلة التلاتة'),
  ('arrive.q.1',       'إيه آخر حاجة عملتها لأول مرة؟', 'حجزي', 'سؤال كسر جليد'),
  ('arrive.q.2',       'لو بكرة يوم فاضي بالكامل، هتعمل فيه إيه؟', 'حجزي', 'سؤال كسر جليد'),
  ('arrive.q.3',       'إيه أحلى حتة في القاهرة ومحدش بيروحها؟', 'حجزي', 'سؤال كسر جليد'),

  -- ⚠ الشاشة **«خروجات الأعضاء»** زي باقي مفاتيح `host.%` بالظبط.
  --   `test_host_copy()` (من 0081) بيفشل لو المفاتيح اتفرقت على أكتر من
  --   شاشة، علشان المالك يلاقيهم كلهم مع بعض في /admin/copy. أول نسخة
  --   هنا كتبت «خروجاتي» والفاحص الشامل مسكها.
  ('host.mine.sign',      'العلامة اللي هيعرفوك بيها', 'خروجات الأعضاء', 'خانة العلامة لصاحب الخروجة'),
  ('host.mine.signPh',    'هقعد على الترابيزة اللي جنب الشباك، وهيكون معايا كتاب أصفر', 'خروجات الأعضاء',
   'مثال في الخانة'),
  ('host.mine.signHint',  'بتوصلهم مع كشف المجموعة — قبل الخروجة بيوم. سطر واحد يخلّيهم يلاقوك من غير ما يلفوا.', 'خروجات الأعضاء',
   'شرح تحت الخانة'),
  ('host.mine.signSave',  'احفظ العلامة', 'خروجات الأعضاء', 'زرار الحفظ'),
  ('host.mine.signSaved', 'اتحفظت ✓', 'خروجات الأعضاء', 'بعد الحفظ')
on conflict (key) do update
  set value_ar   = excluded.value_ar,
      screen     = excluded.screen,
      context_ar = coalesce(excluded.context_ar, copy_strings.context_ar);


-- ===== 7) دالة الاختبار =====
create or replace function test_arrival()
returns table (test text, result text)
language plpgsql
security definer
set search_path = public, auth
as $body$
declare
  v_host  uuid := '44444444-0000-0000-0000-000000000110';
  v_first uuid := '44444444-0000-0000-0000-000000000111';
  v_late  uuid := '44444444-0000-0000-0000-000000000112';
  v_out   uuid := '44444444-0000-0000-0000-000000000113';
  v_tpl   uuid := '66666666-0000-0000-0000-000000000107';
  v_sb    uuid := '77777777-0000-0000-0000-000000000107';
  v_grp   uuid := '88888888-0000-0000-0000-000000000107';
  v_bk    uuid := 'aaaaaaaa-0000-0000-0000-000000000110';
  v_row   record;
  v_txt   text;
  n int;
begin
  test := '0107 · العمود sign_ar موجود';
  select count(*) into n from information_schema.columns
   where table_schema = 'public' and table_name = 'sbotat' and column_name = 'sign_ar';
  if n = 1 then result := 'نجح'; else result := 'فشل — مفيش عمود للعلامة'; end if;
  return next;

  -- ⚠ شكلي عن قصد وبالاسم الكامل: العمود لازم يبقى **جوه** الـblob بتاع
  --   الحارس، مش مجرد إن كلمة sign_ar موجودة في أي مكان في الدالة.
  test := '0107 · حارس الكلام بيفحص العلامة كمان';
  select prosrc into v_txt from pg_proc where proname = 'fn_guard_sbota_text';
  if v_txt like '%new.sign_ar%' then result := 'نجح';
  else result := 'فشل — 🔴 الكلمات الممنوعة هتعدّي من الخانة الجديدة'; end if;
  return next;

  -- ===== بذرة =====
  insert into auth.users (instance_id, id, aud, role, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data, is_sso_user)
  values ('00000000-0000-0000-0000-000000000000', v_host,  'authenticated','authenticated',
          now(), now(), '{}'::jsonb, '{}'::jsonb, false),
         ('00000000-0000-0000-0000-000000000000', v_first, 'authenticated','authenticated',
          now(), now(), '{}'::jsonb, '{}'::jsonb, false),
         ('00000000-0000-0000-0000-000000000000', v_late,  'authenticated','authenticated',
          now(), now(), '{}'::jsonb, '{}'::jsonb, false),
         ('00000000-0000-0000-0000-000000000000', v_out,   'authenticated','authenticated',
          now(), now(), '{}'::jsonb, '{}'::jsonb, false)
  on conflict (id) do nothing;

  insert into profiles (id, first_name, gender, area, role) values
    (v_host,  '[اختبار] صاحبها', 'female', 'maadi', 'member'),
    (v_first, '[اختبار] أول',    'male',   'maadi', 'member'),
    (v_late,  '[اختبار] تاني',   'male',   'maadi', 'member'),
    (v_out,   '[اختبار] بره',    'male',   'maadi', 'member')
  on conflict (id) do nothing;

  insert into sbota_templates
    (id, slug, name_ar, story_ar, kind, default_price, org_fee, duration_min, min_group, max_group)
  values (v_tpl, 'test-arrival-0107', '[اختبار] القالب العام', '[اختبار]', 'food',
          0, 0, 120, 4, 6)
  on conflict (id) do nothing;

  insert into sbotat
    (id, template_id, venue_id, starts_at, ends_at, price, org_fee, capacity,
     status, girls_only, is_day, is_mystery, reveal_at, origin, host_id,
     title_ar, venue_name_ar, address_ar)
  values (v_sb, v_tpl, null, now() + interval '3 days', now() + interval '3 days 3 hours',
          0, 0, 6, 'open', false, false, false, now() + interval '2 days',
          'member', v_host, '[اختبار] قعدة على النيل', '[اختبار] مكان', '[اختبار] عنوان')
  on conflict (id) do update set reveal_at = excluded.reveal_at, sign_ar = null;

  insert into sbota_groups (id, sbota_id, index, why_ar)
  values (v_grp, v_sb, 1, '[اختبار]') on conflict (id) do nothing;

  -- ⚠ الترتيب مهم: «أول» بيحجز قبل «تاني» بساعة، فهو اللي المفروض يستقبل
  insert into bookings (id, sbota_id, profile_id, group_id, status, price_paid, created_at) values
    ('aaaaaaaa-0000-0000-0000-000000000111', v_sb, v_first, v_grp, 'paid', 0, now() - interval '2 hours'),
    (v_bk,                                   v_sb, v_late,  v_grp, 'paid', 0, now() - interval '1 hour')
  on conflict (id) do nothing;

  -- ===== (١) صاحب الخروجة بيكتب العلامة =====
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', v_host), true);
  perform fn_set_sbota_sign(v_sb, '  الترابيزة اللي عليها ورقة برتقالي  ');
  select s.sign_ar into v_txt from sbotat s where s.id = v_sb;
  test := '0107 · صاحب الخروجة بيكتب العلامة';
  if v_txt = 'الترابيزة اللي عليها ورقة برتقالي' then result := 'نجح';
  else result := format('فشل — اتحفظت «%s»', coalesce(v_txt,'null')); end if;
  return next;

  -- ===== (٢) الكلمات الممنوعة بتترفض من الخانة الجديدة =====
  test := '0107 · كلمة ممنوعة في العلامة بتترفض';
  begin
    perform fn_set_sbota_sign(v_sb, 'هنعمل فعالية جنب الباب');
    result := 'فشل — 🔴 الكلمات الممنوعة عدّت من خانة العلامة';
  exception when others then
    result := 'نجح';
  end;
  return next;

  -- ===== (٣) حد تاني ما يكتبش على خروجتك =====
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', v_late), true);
  test := '0107 · حد تاني ما يكتبش علامة على خروجتك';
  begin
    perform fn_set_sbota_sign(v_sb, 'علامة مزوّرة');
    result := 'فشل — 🔴 أي عضو يقدر يغيّر علامة خروجة مش بتاعته';
  exception when others then
    result := 'نجح';
  end;
  return next;

  -- ===== (٤) قبل الكشف الكرت مقفول =====
  select count(*) into n from fn_sbota_arrival(v_bk);
  test := '0107 · قبل الكشف الكرت مقفول';
  if n = 0 then result := 'نجح';
  else result := 'فشل — 🔴 العلامة واسم اللي بيستقبل بانوا قبل الكشف'; end if;
  return next;

  -- ===== (٥) بعد الكشف: العلامة + أقدم حجز =====
  perform set_config('request.jwt.claims', '', true);
  update sbotat set reveal_at = now() - interval '1 hour' where id = v_sb;
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', v_late), true);

  select * into v_row from fn_sbota_arrival(v_bk);
  test := '0107 · بعد الكشف: العلامة واسم اللي بيستقبل';
  if v_row.sign_ar = 'الترابيزة اللي عليها ورقة برتقالي'
     and v_row.greeter_name = '[اختبار] أول'
     and v_row.greeter_is_me = false
    then result := 'نجح';
    else result := format('فشل — علامة=%s · بيستقبل=%s · أنا=%s',
                          coalesce(v_row.sign_ar,'null'),
                          coalesce(v_row.greeter_name,'null'),
                          coalesce(v_row.greeter_is_me::text,'null')); end if;
  return next;

  -- ===== (٦) وأقدم واحد بيتقاله إنه هو =====
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', v_first), true);
  select * into v_row from fn_sbota_arrival('aaaaaaaa-0000-0000-0000-000000000111');
  test := '0107 · أقدم واحد بيتقاله إنه هو اللي هيستقبل';
  if v_row.greeter_is_me then result := 'نجح';
  else result := 'فشل — أول واحد حجز مش عارف إنه المفروض يستقبل'; end if;
  return next;

  -- ===== (٧) حد مش حاجز ما بياخدش حاجة =====
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', v_out), true);
  select count(*) into n from fn_sbota_arrival(v_bk);
  test := '0107 · حد مش حاجز ما بياخدش الكرت';
  if n = 0 then result := 'نجح';
  else result := 'فشل — 🔴 حد بره الحجز شاف العلامة واسم اللي بيستقبل'; end if;
  return next;

  -- ===== (٨) «خروجاتي» بتقول العنوان اللي العضو كتبه =====
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', v_host), true);
  select h.name_ar into v_txt from fn_my_hosted_sbotat() h where h.id = v_sb;
  test := '0107 · «خروجاتي» بتقول عنوان العضو مش اسم القالب';
  if v_txt = '[اختبار] قعدة على النيل' then result := 'نجح';
  else result := format('فشل — رجّعت «%s» (ده اسم القالب)', coalesce(v_txt,'null')); end if;
  return next;

  select h.sign_ar into v_txt from fn_my_hosted_sbotat() h where h.id = v_sb;
  test := '0107 · و«خروجاتي» بتجيب العلامة علشان الخانة تتملا';
  if v_txt = 'الترابيزة اللي عليها ورقة برتقالي' then result := 'نجح';
  else result := format('فشل — العلامة رجعت «%s»، فالخانة هتبان فاضية كل مرة',
                        coalesce(v_txt,'null')); end if;
  return next;

  perform set_config('request.jwt.claims', '', true);

  -- ===== تنضيف — بالأرقام بالظبط (الدرس السابع) =====
  delete from bookings where id in (v_bk, 'aaaaaaaa-0000-0000-0000-000000000111');
  delete from sbota_groups    where id = v_grp;
  delete from sbotat          where id = v_sb;
  delete from sbota_templates where id = v_tpl;
  delete from profiles p      where p.id in (v_host, v_first, v_late, v_out)
    and not exists (select 1 from admin_users a where a.profile_id = p.id);
  delete from auth.users u    where u.id in (v_host, v_first, v_late, v_out)
    and not exists (select 1 from profiles p where p.id = u.id);

exception when others then
  perform set_config('request.jwt.claims', '', true);
  delete from bookings where id in (v_bk, 'aaaaaaaa-0000-0000-0000-000000000111');
  delete from sbota_groups    where id = v_grp;
  delete from sbotat          where id = v_sb;
  delete from sbota_templates where id = v_tpl;
  delete from profiles p      where p.id in (v_host, v_first, v_late, v_out)
    and not exists (select 1 from admin_users a where a.profile_id = p.id);
  delete from auth.users u    where u.id in (v_host, v_first, v_late, v_out)
    and not exists (select 1 from profiles p where p.id = u.id);
  test := '0107 · الاختبار السلوكي';
  result := 'فشل — استثناء: ' || sqlerrm;
  return next;
end $body$;

comment on function test_arrival() is
  '0107 — العلامة بتتكتب من صاحبها بس وبتعدّي على حارس الكلام، والكرت بيفتح مع الكشف وبيدّي أقدم حجز في نفس المجموعة.';

revoke execute on function test_arrival() from public, anon, authenticated;
