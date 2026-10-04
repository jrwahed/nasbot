-- ============================================================================
-- 0128 · بوت تليجرام للأعضاء — «أول ما خروجة تنزل، تعرف»
--
-- طلب المالك (٢٠٢٦-١٠-٠٤): «لما حد جديد يسجّل، يبقى فيه بوت تليجرام تاني
-- يجيله فيه إشعار لو فيه خروجة جديدة اتفتحت».
--
-- بوت **منفصل** عن بوت المالك (`0122`) — التوكن في ڤيرسل
-- `TELEGRAM_MEMBER_BOT_TOKEN`. بوت المالك بيوصّل بيانات الناس والفلوس،
-- فمستحيل يبقى هو نفسه اللي الأعضاء بيكلّموه.
--
-- إزاي العضو بيتوصّل:
--   ١. في `/me` بيدوس «وصّلني على تليجرام» ← `fn_tg_link_token()` بتدّيله
--      توكن عشوائي (ليه هو بس) ← بيتفتح `t.me/<البوت>?start=<التوكن>`.
--   ٢. بيدوس Start ← تليجرام بيبعت للموقع (webhook) ← الموقع بمفتاح الخدمة
--      بينادي `fn_tg_member_link` ← المحادثة بتتربط بحسابه.
--   ⚠ التوكن هو الإثبات الوحيد إن المحادثة دي بتاعة الحساب ده. مفيش طريق
--     تاني للربط: الدالة مقفولة على `service_role`، ومفيش سياسة كتابة.
--
-- الإعلان:
--   محفّز على `sbotat` — أول ما خروجة تبقى `proposed` أو `open` بيحط سطر في
--   `member_tg_outbox` (مرة واحدة لكل خروجة ولكل حالة — `unique`) وبينده
--   `/api/cron/member-telegram` على طول. مهمة الإيميلات (كل ٥ دقايق) احتياطي.
--   ⚠ مش بيعلن: الغامضة · الشغل · بيانات الاختبار (`fn_alert_is_fixture`) ·
--     ولو `settings.telegram_members` مقفول.
--
-- العضو بيوقّف الرسايل من `/me` أو بـ`/stop` للبوت.
-- آمن يتكرر.
-- ============================================================================

-- ===== 1) المفتاح =====
alter table settings add column if not exists telegram_members boolean not null default true;
comment on column settings.telegram_members is
  'بوت الأعضاء (0128): رسالة تليجرام لكل عضو متوصّل أول ما خروجة جديدة تنزل.';


-- ===== 2) مين متوصّل =====
create table if not exists member_telegram (
  profile_id  uuid primary key references profiles(id) on delete cascade,
  link_token  text not null unique,
  chat_id     bigint unique,
  tg_username text,
  news        boolean not null default true,
  linked_at   timestamptz,
  stopped_at  timestamptz,
  created_at  timestamptz not null default now()
);
alter table member_telegram enable row level security;
revoke all on member_telegram from public, anon, authenticated;
grant select on member_telegram to authenticated;
-- ⚠ مفيش سياسة كتابة — الربط من `fn_tg_member_link` (مفتاح الخدمة) بس،
--   والتوكن من `fn_tg_link_token`، والإيقاف من `fn_tg_set_news`.
drop policy if exists member_telegram_own on member_telegram;
create policy member_telegram_own on member_telegram for select
  using (profile_id = auth.uid() or fn_has_permission('people.view'));


-- ===== 3) العضو: توكن الربط =====
create or replace function fn_tg_link_token()
returns text
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_uid uuid := auth.uid();
  v_tok text;
begin
  if v_uid is null then
    raise exception 'لازم تسجّل دخول' using errcode = '42501';
  end if;
  if not exists (select 1 from profiles where id = v_uid and deleted_at is null and banned_at is null) then
    raise exception 'الحساب مش موجود' using errcode = '42501';
  end if;

  select link_token into v_tok from member_telegram where profile_id = v_uid;
  if v_tok is null then
    v_tok := encode(gen_random_bytes(12), 'hex');
    insert into member_telegram (profile_id, link_token) values (v_uid, v_tok)
    on conflict (profile_id) do nothing;
    select link_token into v_tok from member_telegram where profile_id = v_uid;
  end if;
  return v_tok;
end;
$$;
revoke execute on function fn_tg_link_token() from public, anon;
grant  execute on function fn_tg_link_token() to authenticated;

-- العضو بيوقّف/يرجّع الرسايل من `/me`
create or replace function fn_tg_set_news(p_on boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'لازم تسجّل دخول' using errcode = '42501';
  end if;
  update member_telegram
     set news = p_on, stopped_at = case when p_on then null else now() end
   where profile_id = auth.uid();
  return found;
end;
$$;
revoke execute on function fn_tg_set_news(boolean) from public, anon;
grant  execute on function fn_tg_set_news(boolean) to authenticated;


-- ===== 4) الموقع (مفتاح الخدمة): الربط والإيقاف من البوت =====
-- بترجّع الاسم الأول لو التوكن صح، وnull لو لأ.
create or replace function fn_tg_member_link(p_token text, p_chat bigint, p_username text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid  uuid;
  v_name text;
begin
  if fn_caller_is_browser() then
    raise exception 'مش مسموح' using errcode = '42501';
  end if;
  select m.profile_id, p.first_name into v_uid, v_name
    from member_telegram m
    join profiles p on p.id = m.profile_id and p.deleted_at is null and p.banned_at is null
   where m.link_token = p_token;
  if v_uid is null then return null; end if;

  -- محادثة واحدة = حساب واحد: لو المحادثة دي كانت على حساب تاني بتتنقل
  update member_telegram set chat_id = null where chat_id = p_chat and profile_id <> v_uid;
  update member_telegram
     set chat_id = p_chat, tg_username = nullif(btrim(coalesce(p_username, '')), ''),
         news = true, linked_at = now(), stopped_at = null
   where profile_id = v_uid;
  return coalesce(nullif(btrim(v_name), ''), '');
end;
$$;
revoke execute on function fn_tg_member_link(text, bigint, text) from public, anon, authenticated;
grant  execute on function fn_tg_member_link(text, bigint, text) to service_role;

-- /stop و/start من غير توكن. بترجّع true لو المحادثة دي متوصّلة بحساب.
create or replace function fn_tg_member_news(p_chat bigint, p_on boolean)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  if fn_caller_is_browser() then
    raise exception 'مش مسموح' using errcode = '42501';
  end if;
  update member_telegram
     set news = p_on, stopped_at = case when p_on then null else now() end
   where chat_id = p_chat;
  return found;
end;
$$;
revoke execute on function fn_tg_member_news(bigint, boolean) from public, anon, authenticated;
grant  execute on function fn_tg_member_news(bigint, boolean) to service_role;


-- ===== 5) طابور الإعلانات =====
create table if not exists member_tg_outbox (
  id         bigserial primary key,
  sbota_id   uuid not null references sbotat(id) on delete cascade,
  kind       text not null check (kind in ('proposed', 'open')),
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  tries      int not null default 0,
  sent_at    timestamptz,
  sent_count int,
  last_error text,
  unique (sbota_id, kind)
);
create index if not exists member_tg_outbox_unsent on member_tg_outbox (id) where sent_at is null;
alter table member_tg_outbox enable row level security;
revoke all on member_tg_outbox from public, anon, authenticated;
revoke all on sequence member_tg_outbox_id_seq from public, anon, authenticated;

create or replace function fn_claim_member_tg(p_limit int default 5)
returns setof member_tg_outbox
language sql
security definer
set search_path = public
as $$
  update member_tg_outbox o
     set claimed_at = now(), tries = o.tries + 1
   where o.id in (
     select id from member_tg_outbox
      where sent_at is null and tries < 5
        and (claimed_at is null or claimed_at < now() - interval '5 minutes')
      order by id
      limit p_limit
      for update skip locked)
  returning o.*
$$;
revoke execute on function fn_claim_member_tg(int) from public, anon, authenticated;
grant  execute on function fn_claim_member_tg(int) to service_role;


-- ===== 6) المحفّز: خروجة نزلت =====
create or replace function fn_member_tg_announce()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_kind text;
begin
  begin
    if new.status::text not in ('proposed', 'open') then return null; end if;
    if tg_op = 'UPDATE' and old.status is not distinct from new.status then return null; end if;
    -- رجعت «مفتوحة» بعد ما كانت كاملة/مقفولة = مش خبر جديد
    if tg_op = 'UPDATE' and new.status = 'open'
       and old.status::text in ('full', 'locked', 'running', 'done') then
      return null;
    end if;
    if not coalesce((select telegram_members from settings limit 1), true) then return null; end if;
    if new.is_mystery or new.is_work then return null; end if;
    if new.starts_at <= now() then return null; end if;
    if fn_alert_is_fixture(null, new.id) then return null; end if;

    v_kind := new.status::text;
    insert into member_tg_outbox (sbota_id, kind) values (new.id, v_kind)
    on conflict (sbota_id, kind) do nothing;
    if not found then return null; end if;

    -- نداء فوري. pg_net بيبعت **بعد** ما المعاملة تتحفظ — ولو اترجعت ما بيبعتش.
    begin
      perform net.http_post(
        url     := 'https://nasbot.vercel.app/api/cron/member-telegram',
        headers := jsonb_build_object(
                     'content-type',    'application/json',
                     'x-nasbot-secret', (select decrypted_secret from vault.decrypted_secrets
                                          where name = 'nasbot_cron_secret')),
        body    := '{}'::jsonb,
        timeout_milliseconds := 10000
      );
    exception when others then null;
    end;
  exception when others then null;   -- الإعلان عمره ما يوقف حفظ خروجة
  end;
  return null;
end;
$$;
revoke execute on function fn_member_tg_announce() from public, anon, authenticated;
drop trigger if exists t_member_tg_announce on sbotat;
create trigger t_member_tg_announce after insert or update of status on sbotat
  for each row execute function fn_member_tg_announce();


-- ===== 7) نصوص =====
insert into copy_strings (key, value_ar, screen, context_ar) values
  ('tg.card.title',  'أول ما خروجة تنزل، تعرف', 'حسابي', 'كرت بوت تليجرام في /me'),
  ('tg.card.body',   'وصّل حسابك ببوت نسبوط على تليجرام، وهتوصلك رسالة أول ما خروجة جديدة تنزل — قبل ما الأماكن تخلص.', 'حسابي', 'نص الكرت'),
  ('tg.card.cta',    'وصّلني على تليجرام', 'حسابي', 'زرار الكرت'),
  ('tg.card.after',  'دوس «Start» في تليجرام وارجع هنا.', 'حسابي', 'بعد ما يدوس الزرار'),
  ('tg.card.on',     'متوصّل على تليجرام ✓ — هتوصلك رسالة أول ما خروجة تنزل.', 'حسابي', 'لما يكون متوصّل'),
  ('tg.card.paused', 'وقّفت رسايل تليجرام.', 'حسابي', 'لما يكون موقّف الرسايل'),
  ('tg.card.stop',   'وقّف الرسايل', 'حسابي', 'زرار صغير'),
  ('tg.card.resume', 'رجّع الرسايل', 'حسابي', 'زرار صغير'),
  ('tg.card.err',    'مقدرناش نجهّز اللينك. جرب تاني.', 'حسابي', 'لو التوكن وقع'),
  ('tgbot.linked',   'أهلًا يا {{name}} 👋
تمام — أول ما خروجة جديدة تنزل على نسبوط هتوصلك هنا.
لو عايز توقف الرسايل ابعت /stop.', 'بوت تليجرام', 'رد البوت بعد الربط. {{name}} = الاسم الأول'),
  ('tgbot.unknown',  'أهلًا 👋 علشان نوصّل حسابك، افتح صفحتك على نسبوط ودوس «وصّلني على تليجرام»:
{{link}}', 'بوت تليجرام', 'لو بعت /start من غير ما يجي من الموقع. {{link}} = لينك /me'),
  ('tgbot.stopped',  'وقفنا الرسايل. لو عايز ترجّعها ابعت /start.', 'بوت تليجرام', 'رد /stop'),
  ('tgbot.resumed',  'رجّعنا الرسايل ✓', 'بوت تليجرام', 'رد /start وهو متوصّل'),
  ('tgbot.help',     'ابعت /stop توقف الرسايل، و/start ترجّعها.', 'بوت تليجرام', 'رد أي كلام تاني'),
  ('tgbot.new.proposed', '🙋 خروجة جديدة على نسبوط: {{name}}
{{when}}{{area}}
لسه بنجمع الناس — لو حابب تيجي دوس «أنا جاي لو اتعملت»، من غير دفع.', 'بوت تليجرام', 'إعلان خروجة مقترحة. {{name}} {{when}} {{area}}'),
  ('tgbot.new.open', '🟠 الحجز اتفتح: {{name}}
{{when}}{{area}}
المجموعة صغيرة والأماكن قليلة.', 'بوت تليجرام', 'إعلان خروجة مفتوحة. {{name}} {{when}} {{area}}'),
  ('tgbot.btn',      'افتح الخروجة', 'بوت تليجرام', 'الزرار تحت الإعلان')
on conflict (key) do nothing;


-- ===== 8) الاختبار =====
-- ⚠ محتاج `fn_test_seed_up()` قبله. كل الكتابة بترجع باستثناء متعمّد.
create or replace function test_member_telegram()
returns table (test text, result text)
language plpgsql
set search_path = public
as $body$
declare
  me  text := current_user;
  tpl uuid := '66666666-0000-0000-0000-000000000004';
  ven uuid := '55555555-0000-0000-0000-000000000004';
  s1  uuid := '77777777-0000-0000-0000-000000000128';
  s2  uuid := '77777777-0000-0000-0000-000000000228';
  s3  uuid := '77777777-0000-0000-0000-000000000328';
  f1  uuid := '33333333-0000-0000-0000-000000000001';
  f3  uuid := '33333333-0000-0000-0000-000000000003';
  names text[] := array[
    '0128 · 🔴 المجهول ما ياخدش توكن ربط',
    '0128 · العضو بياخد توكن — ونفس التوكن كل مرة',
    '0128 · 🔴 العضو ما يقدرش يربط محادثة بنفسه',
    '0128 · مفتاح الخدمة بيربط بالتوكن الصح بس',
    '0128 · 🔴 العضو ما يشوفش ربط حد تاني',
    '0128 · 🔴 مفيش كتابة مباشرة على الربط',
    '0128 · /stop بيوقّف و«وقّف الرسايل» من /me كمان',
    '0128 · خروجة مقترحة ← إعلان واحد · ولما تتفتح ← إعلان تاني',
    '0128 · رجعت مفتوحة بعد ما كملت ← مفيش إعلان تاني',
    '0128 · الغامضة والمسودة ما بيتعلنوش',
    '0128 · 🔴 بيانات الاختبار ما بتتعلنش'];
  r   text[] := '{}';
  n   int;
  i   int;
  tok text;
  tok2 text;
  nm  text;
begin
  if not exists (select 1 from profiles where id = f3)
     or not exists (select 1 from sbota_templates where id = tpl) then
    test := '0128 · بوت الأعضاء';
    result := 'معلومة — محتاج البذرة المؤقتة (fn_test_seed_up)';
    return next;
    return;
  end if;

  begin
    update settings set telegram_members = true;
    update profiles set deleted_at = null, banned_at = null where id in (f1, f3);

    -- (١) المجهول
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    execute 'set local role anon';
    begin
      perform fn_tg_link_token();
      r := r || 'فشل — 🔴 المجهول خد توكن'::text;
    exception when insufficient_privilege then
      r := r || 'نجح'::text;
    end;
    execute format('set local role %I', me);

    -- (٢) العضو
    perform set_config('request.jwt.claims',
      json_build_object('sub', f3, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    tok := fn_tg_link_token();
    tok2 := fn_tg_link_token();
    r := r || case when tok ~ '^[0-9a-f]{24}$' and tok = tok2 then 'نجح'
                   else format('فشل — التوكن «%s» / «%s»', tok, tok2) end;

    -- (٣) العضو بيحاول يربط بنفسه
    begin
      perform fn_tg_member_link(tok, 999000111, null);
      r := r || 'فشل — 🔴 العضو ربط محادثة من المتصفح'::text;
    exception when insufficient_privilege then
      r := r || 'نجح'::text;
    end;
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);

    -- (٤) مفتاح الخدمة
    perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
    nm := fn_tg_member_link('ffffffffffffffffffffffff', 999000111, null);
    if nm is null then
      nm := fn_tg_member_link(tok, 999000111, 'tester');
      r := r || case when nm is not null
                       and (select chat_id from member_telegram where profile_id = f3) = 999000111
                     then 'نجح' else 'فشل — التوكن الصح ما ربطش' end;
    else
      r := r || 'فشل — 🔴 توكن غلط ربط محادثة'::text;
    end if;
    perform set_config('request.jwt.claims', '', true);

    -- (٥) عضو تاني
    perform set_config('request.jwt.claims',
      json_build_object('sub', f1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    select count(*) into n from member_telegram where profile_id = f3;
    r := r || case when n = 0 then 'نجح' else 'فشل — 🔴 شاف ربط حد تاني' end;

    -- (٦) كتابة مباشرة
    begin
      insert into member_telegram (profile_id, link_token, chat_id) values (f1, 'x', 1);
      r := r || 'فشل — 🔴 العضو كتب ربط بنفسه'::text;
    exception when insufficient_privilege then
      r := r || 'نجح'::text;
    end;
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);

    -- (٧) /stop من البوت ثم «رجّع» و«وقّف» من /me
    perform set_config('request.jwt.claims', '{"role":"service_role"}', true);
    perform fn_tg_member_news(999000111, false);
    perform set_config('request.jwt.claims', '', true);
    n := case when not (select news from member_telegram where profile_id = f3) then 1 else 0 end;
    perform set_config('request.jwt.claims',
      json_build_object('sub', f3, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform fn_tg_set_news(true);
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);
    r := r || case when n = 1 and (select news from member_telegram where profile_id = f3)
                   then 'نجح' else 'فشل — الإيقاف أو الرجوع ما اشتغلش' end;

    -- (٨) الإعلانات — بنفتح بيانات الاختبار للحظة (زي test_admin_alerts)
    perform set_config('nasbot.alerts_test', 'on', true);
    insert into sbotat (id, template_id, venue_id, starts_at, ends_at, price, org_fee,
                        capacity, status, girls_only, is_day, is_mystery)
    values (s1, tpl, ven, now() + interval '9 days', now() + interval '9 days 2 hours',
            15000, 0, 6, 'proposed', false, false, false);
    update sbotat set status = 'open' where id = s1;
    select count(*) into n from member_tg_outbox where sbota_id = s1;
    r := r || case when n = 2
                     and exists (select 1 from member_tg_outbox where sbota_id = s1 and kind = 'proposed')
                     and exists (select 1 from member_tg_outbox where sbota_id = s1 and kind = 'open')
                   then 'نجح' else format('فشل — %s إعلان بدل 2', n) end;

    -- (٩) كملت ورجعت مفتوحة
    -- (الاتنين اتبعتوا خلاص — المطلوب إن مفيش حاجة ترجع للطابور)
    update member_tg_outbox set sent_at = now() where sbota_id = s1;
    update sbotat set status = 'full' where id = s1;
    update sbotat set status = 'open' where id = s1;
    select count(*) into n from member_tg_outbox where sbota_id = s1 and sent_at is null;
    r := r || case when n = 0 and (select count(*) from member_tg_outbox where sbota_id = s1) = 2
                   then 'نجح' else format('فشل — %s إعلان رجع للطابور', n) end;

    -- (١٠) غامضة + مسودة
    insert into sbotat (id, template_id, venue_id, starts_at, ends_at, price, org_fee,
                        capacity, status, girls_only, is_day, is_mystery)
    values (s2, tpl, ven, now() + interval '9 days', now() + interval '9 days 2 hours',
            15000, 0, 6, 'open', false, false, true),
           (s3, tpl, ven, now() + interval '9 days', now() + interval '9 days 2 hours',
            15000, 0, 6, 'draft', false, false, false);
    select count(*) into n from member_tg_outbox where sbota_id in (s2, s3);
    r := r || case when n = 0 then 'نجح' else format('فشل — %s إعلان لغامضة/مسودة', n) end;

    -- (١١) من غير علم الاختبار: القالب `test-fixture` ما يتعلنش
    perform set_config('nasbot.alerts_test', '', true);
    update sbotat set status = 'open' where id = s3;
    select count(*) into n from member_tg_outbox where sbota_id = s3;
    r := r || case when n = 0 then 'نجح' else 'فشل — 🔴 خروجة اختبار اتعلنت للأعضاء' end;

    raise exception 'test_member_telegram_rollback';
  exception when others then
    if sqlerrm <> 'test_member_telegram_rollback' then
      r := r || ('فشل — استثناء: ' || sqlerrm);
    end if;
  end;
  execute format('set local role %I', me);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('nasbot.alerts_test', '', true);

  for i in 1 .. array_length(r, 1) loop
    test := coalesce(names[i], '0128 · الاختبار');
    result := r[i];
    return next;
  end loop;
end $body$;

comment on function test_member_telegram() is
  '0128 — بوت الأعضاء: التوكن للعضو بس · الربط بمفتاح الخدمة بس · إعلان واحد لكل خروجة ولكل حالة · مفيش إعلان للاختبار والغامضة.';
revoke execute on function test_member_telegram() from public, anon, authenticated;
