-- ============================================================================
-- 0122 · إشعارات اللوحة على تليجرام
--
-- طلب المالك (٢٠٢٦-٠٩-٣٠): «أي حاجة تحصل تجيلي على التليجرام بدل ما كل
-- شوية أدخل صفحة الأدمن».
--
-- الطريق:
--   ١. محفّزات على الجداول بتنادي `fn_admin_alert(kind, body, path)`.
--   ٢. الدالة بتكتب سطر في `admin_alerts` (الطابور) وبتنده الموقع على طول
--      (`net.http_post` ← `/api/cron/admin-alerts`) — غير متزامنة، وبتتبعت
--      بعد ما المعاملة تخلص بس.
--   ٣. الموقع بيسحب الطابور ويبعت لتليجرام بـ`TELEGRAM_BOT_TOKEN` (ڤيرسل).
--      ولو النداء الفوري وقع، مهمة الإيميلات (كل ٥ دقايق) بتسحبه كمان.
--
-- ⚠ **الإشعار عمره ما يوقف الحاجة الأصلية.** كل محفّز ملفوف في
--   `exception when others` — لو تليجرام أو pg_net أو أي حاجة وقعت، الحجز
--   بيكمل عادي والإشعار بس اللي بيضيع.
-- ⚠ بيانات الاختبار (`fn_test_seed_up` · قالب `test-fixture`) ما بتبعتش —
--   وإلا كل تشغيل لـ`CHECK_DB` هيبعت للمالك «حجز جديد». الاختبار نفسه بيفتح
--   الباب بعلم `nasbot.alerts_test`.
-- ⚠ الطابور للخادم بس: مفيش ولا سياسة، و`revoke` صريح.
--
-- آمن يتكرر.
-- ============================================================================

-- ===== 1) المفتاح ورقم المحادثة =====
alter table settings add column if not exists telegram_alerts  boolean not null default true;
alter table settings add column if not exists telegram_chat_id text;
comment on column settings.telegram_alerts is
  'إشعارات اللوحة على تليجرام شغّالة ولا لأ. (0122)';
comment on column settings.telegram_chat_id is
  'محادثة تليجرام اللي الإشعارات بتروحلها. بيتملى لوحده أول ما المالك يبعت /start للبوت. امسحه (null) علشان تربط محادثة تانية. (0122)';


-- ===== 2) الطابور =====
create table if not exists admin_alerts (
  id          bigserial primary key,
  kind        text not null,
  body        text not null,
  path        text,
  created_at  timestamptz not null default now(),
  claimed_at  timestamptz,
  sent_at     timestamptz,
  tries       int not null default 0,
  last_error  text
);
create index if not exists admin_alerts_unsent on admin_alerts (id) where sent_at is null;
alter table admin_alerts enable row level security;
revoke all on admin_alerts from public, anon, authenticated;
revoke all on sequence admin_alerts_id_seq from public, anon, authenticated;


-- ===== 3) بيانات الاختبار ما بتبعتش =====
-- ⚠ مش بذرة `fn_test_seed_up` بس: اختبارات كتير بتعمل أعضاء وقوالب بتوعها
--   وبتسيبهم (بتمسحهم في الآخر، والطابور بيفضل). أول تشغيل لـ`CHECK_DB` على
--   الإنتاج حط ٢١ رسالة «[اختبار] حاجز» في الطابور. فالعلامة المتّفق عليها
--   في كل بيانات الاختبار — `[اختبار]` في أول الاسم — بتتشال كمان، ومعاها
--   العنوان الثابت «خروجة اختبار» بتاع `0086`/`0094` (التشغيل التاني لقاه).
create or replace function fn_alert_is_fixture(p_profile uuid, p_sbota uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(current_setting('nasbot.alerts_test', true), '') <> 'on'
     and (
       p_profile in ('33333333-0000-0000-0000-000000000001',
                     '33333333-0000-0000-0000-000000000003',
                     '33333333-0000-0000-0000-000000000005',
                     '44444444-0000-0000-0000-000000000001')
       or exists (select 1 from sbotat s join sbota_templates t on t.id = s.template_id
                   where s.id = p_sbota
                     and (t.slug = 'test-fixture'
                          or t.name_ar like '[اختبار]%'
                          or coalesce(s.title_ar, '') like '[اختبار]%'
                          -- اختبارات `0086` و`0094` بتفتح خروجة بالعنوان ده بالظبط
                          -- بحساب حقيقي — ظهرت في الطابور على الإنتاج
                          or s.title_ar = 'خروجة اختبار'))
       or exists (select 1 from profiles p
                   where p.id = p_profile and coalesce(p.first_name, '') like '[اختبار]%')
     )
$$;
revoke execute on function fn_alert_is_fixture(uuid, uuid) from public, anon, authenticated;


-- ===== 4) الكتابة في الطابور + النداء الفوري =====
create or replace function fn_admin_alert(p_kind text, p_body text, p_path text default '/admin')
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not coalesce((select telegram_alerts from settings limit 1), true) then return; end if;

  insert into admin_alerts (kind, body, path) values (p_kind, p_body, p_path);

  -- نداء فوري للموقع. لو pg_net أو السر مش موجودين (محليًا مثلًا) بنكمّل —
  -- مهمة الإيميلات بتسحب الطابور كل ٥ دقايق.
  begin
    perform net.http_post(
      url     := 'https://nasbot.vercel.app/api/cron/admin-alerts',
      headers := jsonb_build_object(
                   'content-type',    'application/json',
                   'x-nasbot-secret', (select decrypted_secret from vault.decrypted_secrets
                                        where name = 'nasbot_cron_secret')),
      body    := '{}'::jsonb,
      timeout_milliseconds := 10000
    );
  exception when others then null;
  end;
end;
$$;
revoke execute on function fn_admin_alert(text, text, text) from public, anon, authenticated;


-- ===== 5) الموقع بياخد دفعة من الطابور (مرة واحدة لكل سطر) =====
create or replace function fn_claim_admin_alerts(p_limit int default 30)
returns setof admin_alerts
language sql
security definer
set search_path = public
as $$
  update admin_alerts a
     set claimed_at = now(), tries = a.tries + 1
   where a.id in (
     select id from admin_alerts
      where sent_at is null and tries < 5
        and (claimed_at is null or claimed_at < now() - interval '2 minutes')
      order by id
      limit p_limit
      for update skip locked)
  returning a.*
$$;
revoke execute on function fn_claim_admin_alerts(int) from public, anon, authenticated;
grant  execute on function fn_claim_admin_alerts(int) to service_role;


-- ===== 6) أسماء قصيرة للرسايل =====
create or replace function fn_alert_who(p_profile uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(btrim(first_name), ''), 'عضو من غير اسم')
    from profiles where id = p_profile
$$;
revoke execute on function fn_alert_who(uuid) from public, anon, authenticated;

-- «بادل · السبت 03/10 8:00م · 3/6»
create or replace function fn_alert_sbota(p_sbota uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(btrim(s.title_ar), ''), t.name_ar)
         || ' · ' || to_char(s.starts_at at time zone 'Africa/Cairo', 'DD/MM HH24:MI')
         || ' · ' || (select count(*) from bookings b
                       where b.sbota_id = s.id and b.status in ('paid', 'attended'))
         || '/' || s.capacity
    from sbotat s join sbota_templates t on t.id = s.template_id
   where s.id = p_sbota
$$;
revoke execute on function fn_alert_sbota(uuid) from public, anon, authenticated;


-- ===== 7) المحفّزات =====

-- (أ) التحويل وصل ومستني تأكيدك — أهم واحد
create or replace function fn_alert_payment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare b bookings;
begin
  begin
    if new.status = 'pending_review'
       and (tg_op = 'INSERT' or old.status is distinct from 'pending_review') then
      select * into b from bookings where id = new.booking_id;
      if fn_alert_is_fixture(b.profile_id, b.sbota_id) then return null; end if;
      perform fn_admin_alert('transfer',
        '💸 تحويل مستني تأكيدك' || chr(10)
        || fn_alert_who(b.profile_id) || ' · ' || (new.amount / 100) || ' ج' || chr(10)
        || fn_alert_sbota(b.sbota_id),
        '/admin/payments');
    end if;
  exception when others then null;
  end;
  return null;
end;
$$;
revoke execute on function fn_alert_payment() from public, anon, authenticated;
drop trigger if exists t_alert_payment on payments;
create trigger t_alert_payment after insert or update of status on payments
  for each row execute function fn_alert_payment();

-- (ب) حجز اتأكد · إلغاء
create or replace function fn_alert_booking()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if fn_alert_is_fixture(new.profile_id, new.sbota_id) then return null; end if;
    if new.status = 'paid' and (tg_op = 'INSERT' or old.status is distinct from 'paid') then
      perform fn_admin_alert('booking',
        '✅ حجز اتأكد' || chr(10)
        || fn_alert_who(new.profile_id) || chr(10) || fn_alert_sbota(new.sbota_id),
        '/admin/bookings');
    elsif tg_op = 'UPDATE' and new.status::text like 'cancelled%'
          and old.status::text not like 'cancelled%' and old.status = 'paid' then
      perform fn_admin_alert('cancel',
        '❌ إلغاء حجز' || case when new.status = 'cancelled_by_us' then ' (من عندنا)' else '' end
        || chr(10) || fn_alert_who(new.profile_id) || chr(10) || fn_alert_sbota(new.sbota_id),
        '/admin/bookings');
    end if;
  exception when others then null;
  end;
  return null;
end;
$$;
revoke execute on function fn_alert_booking() from public, anon, authenticated;
drop trigger if exists t_alert_booking on bookings;
create trigger t_alert_booking after insert or update of status on bookings
  for each row execute function fn_alert_booking();

-- (ج) قايمة الانتظار
create or replace function fn_alert_waitlist()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if fn_alert_is_fixture(new.profile_id, new.sbota_id) then return null; end if;
    perform fn_admin_alert('waitlist',
      '⏳ دخل قايمة الانتظار' || chr(10)
      || fn_alert_who(new.profile_id) || ' · رقم '
      || (select count(*) from waitlist where sbota_id = new.sbota_id) || chr(10)
      || fn_alert_sbota(new.sbota_id),
      '/admin/bookings');
  exception when others then null;
  end;
  return null;
end;
$$;
revoke execute on function fn_alert_waitlist() from public, anon, authenticated;
drop trigger if exists t_alert_waitlist on waitlist;
create trigger t_alert_waitlist after insert on waitlist
  for each row execute function fn_alert_waitlist();

-- (د) عضو جديد — لما الاسم يتكتب أول مرة (الحساب بيتعمل قبل ما يكمّل /join)
create or replace function fn_alert_member()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if fn_alert_is_fixture(new.id, null) then return null; end if;
    if nullif(btrim(new.first_name), '') is not null
       and (tg_op = 'INSERT' or nullif(btrim(old.first_name), '') is null) then
      perform fn_admin_alert('member',
        '👋 عضو جديد سجّل: ' || btrim(new.first_name)
        || case when new.gate_status = 'pending' then chr(10) || 'مستني موافقتك على الدخول' else '' end,
        case when new.gate_status = 'pending' then '/admin/people' else '/admin/people' end);
    end if;
  exception when others then null;
  end;
  return null;
end;
$$;
revoke execute on function fn_alert_member() from public, anon, authenticated;
drop trigger if exists t_alert_member on profiles;
create trigger t_alert_member after insert or update of first_name on profiles
  for each row execute function fn_alert_member();

-- (هـ) عضو فتح خروجة
create or replace function fn_alert_member_sbota()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if new.origin is distinct from 'member' then return null; end if;
    if fn_alert_is_fixture(new.host_id, new.id) then return null; end if;
    perform fn_admin_alert('member_sbota',
      '🆕 عضو فتح خروجة' || case when new.status = 'draft' then ' — مستنية اعتمادك' else '' end
      || chr(10) || coalesce(new.host_name_ar, fn_alert_who(new.host_id)) || chr(10)
      || fn_alert_sbota(new.id),
      '/admin/sbotat');
  exception when others then null;
  end;
  return null;
end;
$$;
revoke execute on function fn_alert_member_sbota() from public, anon, authenticated;
drop trigger if exists t_alert_member_sbota on sbotat;
create trigger t_alert_member_sbota after insert on sbotat
  for each row execute function fn_alert_member_sbota();

-- (و) صورة مستنية الموافقة
create or replace function fn_alert_photo()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if new.published_to_members_at is not null then return null; end if;
    if fn_alert_is_fixture(new.uploaded_by, new.sbota_id) then return null; end if;
    perform fn_admin_alert('photo',
      '📷 صورة مستنية موافقتك' || chr(10)
      || fn_alert_who(new.uploaded_by) || chr(10) || fn_alert_sbota(new.sbota_id),
      '/admin/photos');
  exception when others then null;
  end;
  return null;
end;
$$;
revoke execute on function fn_alert_photo() from public, anon, authenticated;
drop trigger if exists t_alert_photo on sbota_photos;
create trigger t_alert_photo after insert on sbota_photos
  for each row execute function fn_alert_photo();

-- (ز) بلاغ
create or replace function fn_alert_report()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  begin
    if fn_alert_is_fixture(new.reporter_id, null) then return null; end if;
    perform fn_admin_alert('report',
      '🚩 بلاغ جديد (' || new.reason::text || ')' || chr(10)
      || 'من ' || fn_alert_who(new.reporter_id)
      || coalesce(' على ' || fn_alert_who(new.target_profile_id), '')
      || coalesce(chr(10) || left(nullif(btrim(new.note), ''), 200), ''),
      '/admin/reports');
  exception when others then null;
  end;
  return null;
end;
$$;
revoke execute on function fn_alert_report() from public, anon, authenticated;
drop trigger if exists t_alert_report on reports;
create trigger t_alert_report after insert on reports
  for each row execute function fn_alert_report();


-- ===== 8) الاختبار =====
-- ⚠ محتاج `fn_test_seed_up()` قبله. كل الكتابة بترجع باستثناء متعمّد.
create or replace function test_admin_alerts()
returns table (test text, result text)
language plpgsql
set search_path = public
as $body$
declare
  me  text := current_user;
  tpl uuid := '66666666-0000-0000-0000-000000000004';
  ven uuid := '55555555-0000-0000-0000-000000000004';
  s1  uuid := '77777777-0000-0000-0000-000000000122';
  f1  uuid := '33333333-0000-0000-0000-000000000001';
  f3  uuid := '33333333-0000-0000-0000-000000000003';
  m1  uuid := '44444444-0000-0000-0000-000000000001';
  names text[] := array[
    '0122 · بيانات الاختبار ما بتبعتش للمالك',
    '0122 · 💸 التحويل المستني بيبعت',
    '0122 · ✅ الحجز المتأكد بيبعت',
    '0122 · ❌ الإلغاء بيبعت',
    '0122 · ⏳ قايمة الانتظار بتبعت',
    '0122 · 🆕 خروجة العضو بتبعت',
    '0122 · 📷 الصورة المستنية بتبعت',
    '0122 · 🚩 البلاغ بيبعت',
    '0122 · 👋 العضو الجديد بيبعت',
    '0122 · المفتاح مقفول = مفيش ولا رسالة',
    '0122 · الإشعار لو وقع ما بيوقفش الحجز',
    '0122 · 🔴 الزائر والعضو ما يقروش الطابور',
    '0122 · اسم «[اختبار]» ما بيبعتش (اختبارات تانية)',
    '0122 · وسبوطة عادية لسه بتبعت (الفلتر مش «أيوه» على طول)'];
  r   text[] := '{}';
  n   int;
  i   int;
  bid uuid;
begin
  if not exists (select 1 from profiles where id = m1)
     or not exists (select 1 from sbota_templates where id = tpl) then
    test := '0122 · إشعارات تليجرام';
    result := 'معلومة — محتاج البذرة المؤقتة (fn_test_seed_up)';
    return next;
    return;
  end if;

  begin
    update settings set telegram_alerts = true, gender_balance = false;
    delete from admin_alerts;

    -- (١) من غير العلم: قالب الاختبار ما يبعتش
    insert into sbotat (id, template_id, venue_id, starts_at, ends_at, price, org_fee,
                        capacity, status, girls_only, is_day, is_mystery)
    values (s1, tpl, ven, now() + interval '6 days', now() + interval '6 days 2 hours',
            15000, 0, 6, 'open', false, false, false);
    insert into bookings (sbota_id, profile_id, status, price_paid) values (s1, f1, 'paid', 0);
    select count(*) into n from admin_alerts;
    r := r || case when n = 0 then 'نجح' else format('فشل — بيانات الاختبار بعتت %s رسالة', n) end;

    perform set_config('nasbot.alerts_test', 'on', true);

    -- (٢) تحويل مستني
    insert into bookings (sbota_id, profile_id, status, price_paid)
    values (s1, f3, 'pending_payment', 15000) returning id into bid;
    insert into payments (booking_id, provider, amount, status, idempotency_key)
    values (bid, 'instapay', 15000, 'initiated', 'test-0122-' || bid);
    update payments set status = 'pending_review' where booking_id = bid;
    r := r || case when exists (select 1 from admin_alerts where kind = 'transfer' and body like '%150 ج%')
                   then 'نجح' else 'فشل — مفيش رسالة تحويل' end;

    -- (٣) اتأكد
    update bookings set status = 'paid' where id = bid;
    r := r || case when exists (select 1 from admin_alerts where kind = 'booking' and body like '%/6%')
                   then 'نجح' else 'فشل — مفيش رسالة حجز' end;

    -- (٤) إلغاء
    update bookings set status = 'cancelled_by_user' where id = bid;
    r := r || case when exists (select 1 from admin_alerts where kind = 'cancel')
                   then 'نجح' else 'فشل — مفيش رسالة إلغاء' end;

    -- (٥) انتظار
    insert into waitlist (sbota_id, profile_id, position) values (s1, m1, 1);
    r := r || case when exists (select 1 from admin_alerts where kind = 'waitlist')
                   then 'نجح' else 'فشل — مفيش رسالة انتظار' end;

    -- (٦) خروجة عضو
    insert into sbotat (template_id, venue_id, starts_at, ends_at, price, org_fee,
                        capacity, status, girls_only, is_day, is_mystery, origin, host_id, title_ar)
    values (tpl, null, now() + interval '8 days', now() + interval '8 days 2 hours',
            0, 0, 6, 'draft', false, false, false, 'member', m1, '[اختبار] تمشية');
    r := r || case when exists (select 1 from admin_alerts where kind = 'member_sbota' and body like '%اعتمادك%')
                   then 'نجح' else 'فشل — مفيش رسالة خروجة عضو' end;

    -- (٧) صورة
    insert into sbota_photos (sbota_id, path, uploaded_by) values (s1, 'test/0122.jpg', f1);
    r := r || case when exists (select 1 from admin_alerts where kind = 'photo')
                   then 'نجح' else 'فشل — مفيش رسالة صورة' end;

    -- (٨) بلاغ
    insert into reports (reporter_id, target_profile_id, reason, note)
    values (f1, m1, (select enum_range(null::report_reason_t))[1], 'اختبار');
    r := r || case when exists (select 1 from admin_alerts where kind = 'report')
                   then 'نجح' else 'فشل — مفيش رسالة بلاغ' end;

    -- (٩) عضو جديد
    -- (الحساب لازم يبقى في auth.users، فبنستعمل عضو البذرة: الاسم يتمسح ويتكتب)
    update profiles set first_name = null where id = m1;
    update profiles set first_name = 'تجربة' where id = m1;
    r := r || case when exists (select 1 from admin_alerts where kind = 'member' and body like '%تجربة%')
                   then 'نجح' else 'فشل — مفيش رسالة عضو جديد' end;

    -- (١٠) المفتاح مقفول
    update settings set telegram_alerts = false;
    select count(*) into n from admin_alerts;
    insert into waitlist (sbota_id, profile_id, position) values (s1, f3, 2);
    r := r || case when (select count(*) from admin_alerts) = n
                   then 'نجح' else 'فشل — المفتاح مقفول وبرضه بعت' end;
    update settings set telegram_alerts = true;

    -- (١١) الإشعار يقع والحجز يكمل: نكسر الطابور مؤقتًا
    alter table admin_alerts add constraint t0122_block check (false) not valid;
    begin
      insert into bookings (sbota_id, profile_id, status, price_paid) values (s1, m1, 'paid', 0);
      r := r || 'نجح'::text;
    exception when others then
      r := r || ('فشل — 🔴 الإشعار وقّع الحجز: ' || sqlerrm);
    end;
    alter table admin_alerts drop constraint t0122_block;

    -- (١٢) الطابور مقفول على المتصفح
    perform set_config('request.jwt.claims',
      json_build_object('sub', f1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform count(*) from admin_alerts;
      r := r || 'فشل — 🔴 عضو قرا طابور اللوحة'::text;
    exception when insufficient_privilege then
      begin
        perform fn_admin_alert('x', 'x', '/');
        r := r || 'فشل — 🔴 عضو كتب في الطابور'::text;
      exception when insufficient_privilege then
        r := r || 'نجح'::text;
      end;
    end;
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);

    -- (١٣) و(١٤) من غير العلم: قالب عادي، والعنوان بس هو اللي فيه العلامة
    perform set_config('nasbot.alerts_test', '', true);
    insert into sbota_templates (id, slug, name_ar, story_ar, kind, default_price, org_fee,
                                 duration_min, min_group, max_group)
    values ('66666666-0000-0000-0000-000000000122', 'alerts-0122', 'تمشية عادية', '-', 'food',
            0, 0, 120, 4, 6);
    insert into sbotat (id, template_id, venue_id, starts_at, ends_at, price, org_fee, capacity,
                        status, girls_only, is_day, is_mystery, title_ar)
    values ('77777777-0000-0000-0000-000000000222', '66666666-0000-0000-0000-000000000122', null,
            now() + interval '9 days', now() + interval '9 days 2 hours', 0, 0, 6, 'open',
            false, false, false, '[اختبار] تمشية'),
           ('77777777-0000-0000-0000-000000000322', '66666666-0000-0000-0000-000000000122', null,
            now() + interval '9 days', now() + interval '9 days 2 hours', 0, 0, 6, 'open',
            false, false, false, 'تمشية الجمعة');
    r := r || case when fn_alert_is_fixture(gen_random_uuid(), '77777777-0000-0000-0000-000000000222')
                   then 'نجح' else 'فشل — سبوطة «[اختبار]» هتبعت للمالك' end;
    r := r || case when not fn_alert_is_fixture(gen_random_uuid(), '77777777-0000-0000-0000-000000000322')
                   then 'نجح' else 'فشل — 🔴 سبوطة عادية اتحسبت اختبار — المالك مش هيوصله حاجة' end;

    raise exception 'test_admin_alerts_rollback';
  exception when others then
    if sqlerrm <> 'test_admin_alerts_rollback' then
      r := r || ('فشل — استثناء: ' || sqlerrm);
    end if;
  end;
  execute format('set local role %I', me);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('nasbot.alerts_test', '', true);

  for i in 1 .. array_length(r, 1) loop
    test := coalesce(names[i], '0122 · الاختبار');
    result := r[i];
    return next;
  end loop;
end $body$;

comment on function test_admin_alerts() is
  '0122 — إشعارات تليجرام: كل حدث بيكتب في الطابور، بيانات الاختبار لأ، والإشعار عمره ما يوقف الحاجة الأصلية.';
revoke execute on function test_admin_alerts() from public, anon, authenticated;
