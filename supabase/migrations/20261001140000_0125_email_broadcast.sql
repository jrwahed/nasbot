-- ============================================================================
-- 0125 · الإرسال الجماعي بالإيميل — بقى بيبعت فعلًا
--
-- طلب المالك (٢٠٢٦-١٠-٠١): «عايز أبعت إيميل للناس اللي في قايمة الانتظار
-- أو كل اللي سجلوا — أخبار ونشرة».
--
-- اللي كان موجود: تبويب «إرسال جماعي» في `/admin/notifications` بيسجّل حملة
-- في `broadcasts` بحالة `draft` **وما بيبعتش لحد** (مكتوب في الصفحة نفسها)،
-- ومعمول للواتساب اللي مش متفعّل. ميزة مبنية وميتة.
--
-- الجديد:
--   · `broadcasts` بقى فيها الموضوع والنص والجمهور والرابط.
--   · `fn_broadcast_audience(audience, sbota)` — مين هيوصله، والعدد.
--   · `fn_send_broadcast(...)` — بيحط إيميل لكل واحد في طابور `notifications`
--     (قالب `broadcast`)، ومهمة الإيميلات اللي كل ٥ دقايق بتبعته من Resend.
--   · **إلغاء الاشتراك:** `profiles.email_news` + رابط في آخر كل إيميل جماعي
--     (`/unsubscribe/<token>`) — `fn_unsubscribe` / `fn_resubscribe` بالتوكن بس.
--     قانون حماية البيانات (151/2020) بيطلب ده لأي رسايل تسويقية.
--
-- الجماهير: `all` (كل الأعضاء) · `waitlist` (قايمة انتظار سبوطة، أو كل
-- القوايم) · `booked` (اللي حجزوا سبوطة، أو حجزوا أي حاجة قبل كده) ·
-- `never_booked` (سجلوا وما حجزوش) · `soon` (داسوا «قولّي لما تفتح») ·
-- `me` (تجربة — ليك انت بس).
--
-- ⚠ الإيميلات الجماعية بس اللي بتحترم `email_news`. إيميلات الحجز نفسها
--   («مكانك محجوز» · «مجموعتك ظهرت») بتتبعت دايمًا — دي خدمة مش تسويق.
-- ⚠ الصلاحية `notifications.broadcast` (موجودة من `admin_remaining_tables`).
-- ⚠ الحد اليومي `settings.daily_broadcast_limit` (موجود) — حملات مش إيميلات.
--
-- آمن يتكرر.
-- ============================================================================

-- ===== 1) الأعمدة =====
alter table broadcasts add column if not exists subject_ar text;
alter table broadcasts add column if not exists body_ar    text;
alter table broadcasts add column if not exists link_url   text;
alter table broadcasts add column if not exists audience   text;
alter table broadcasts add column if not exists sbota_id   uuid references sbotat(id) on delete set null;

alter table profiles add column if not exists email_news  boolean not null default true;
alter table profiles add column if not exists unsub_token uuid not null default gen_random_uuid();
create unique index if not exists profiles_unsub_token_key on profiles (unsub_token);
comment on column profiles.email_news is
  'عايز الإيميلات الجماعية (أخبار · خروجات جديدة)؟ إيميلات الحجز نفسها بتتبعت دايمًا. (0125)';

-- القالب موجود علشان مفتاح `notifications.template_key` — النص الحقيقي في `broadcasts`
insert into notification_templates (key, channel, body_ar, is_active)
values ('broadcast', 'email', '(النص من الحملة نفسها — broadcasts.body_ar)', true)
on conflict (key) do nothing;


-- ===== 2) الجمهور =====
create or replace function fn_broadcast_audience(p_audience text, p_sbota uuid default null)
returns table (profile_id uuid, first_name text, email text)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if fn_caller_is_browser() and not fn_has_permission('notifications.broadcast') then
    raise exception 'محتاج صلاحية notifications.broadcast' using errcode = '42501';
  end if;

  return query
  select p.id, p.first_name, p.email
    from profiles p
   where p.deleted_at is null
     and p.banned_at is null
     and p.email is not null
     and p.email not like '%@phone.nasbot.app'
     and p.email_news
     and case p_audience
       when 'all' then true
       when 'me' then p.id = auth.uid()
       when 'waitlist' then exists (
         select 1 from waitlist w
          where w.profile_id = p.id and (p_sbota is null or w.sbota_id = p_sbota))
       when 'booked' then exists (
         select 1 from bookings b
          where b.profile_id = p.id and b.status in ('paid', 'attended')
            and (p_sbota is null or b.sbota_id = p_sbota))
       when 'never_booked' then not exists (
         select 1 from bookings b
          where b.profile_id = p.id and b.status in ('paid', 'attended'))
       when 'soon' then exists (
         select 1 from template_interest ti
          where ti.profile_id = p.id and ti.notified_at is null)
       else false
     end
   order by p.created_at desc;
end;
$$;
revoke execute on function fn_broadcast_audience(text, uuid) from public, anon;
grant  execute on function fn_broadcast_audience(text, uuid) to authenticated;


-- ===== 3) الإرسال =====
create or replace function fn_send_broadcast(
  p_subject  text,
  p_body     text,
  p_audience text,
  p_sbota    uuid default null,
  p_link     text default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id    uuid;
  v_n     int;
  v_limit int;
  v_today int;
begin
  if fn_caller_is_browser() and not fn_has_permission('notifications.broadcast') then
    raise exception 'محتاج صلاحية notifications.broadcast' using errcode = '42501';
  end if;

  if nullif(btrim(coalesce(p_subject, '')), '') is null then
    raise exception 'اكتب عنوان للإيميل' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_body, ''))) < 10 then
    raise exception 'النص قصير قوي' using errcode = '22023';
  end if;
  if p_link is not null and btrim(p_link) <> '' and p_link !~ '^https://' then
    raise exception 'الرابط لازم يبدأ بـ https://' using errcode = '22023';
  end if;

  -- الحد اليومي — التجربة لنفسك مش بتتحسب
  if p_audience <> 'me' then
    select coalesce(daily_broadcast_limit, 1) into v_limit from settings limit 1;
    select count(*) into v_today from broadcasts
     where status in ('sending', 'sent') and coalesce(audience, '') <> 'me'
       and created_at >= date_trunc('day', now() at time zone 'Africa/Cairo') at time zone 'Africa/Cairo';
    if v_today >= coalesce(v_limit, 1) then
      raise exception 'خلصت حملات النهارده (% من %). الحد من الإعدادات.', v_today, v_limit
        using errcode = '22023';
    end if;
  end if;

  insert into broadcasts (segment, template_key, subject_ar, body_ar, link_url, audience,
                          sbota_id, recipients_count, sent_count, status, created_by)
  values (jsonb_build_object('audience', p_audience, 'sbota_id', p_sbota), 'broadcast',
          btrim(p_subject), btrim(p_body), nullif(btrim(coalesce(p_link, '')), ''),
          p_audience, p_sbota, 0, 0, 'sending', auth.uid())
  returning id into v_id;

  insert into notifications (profile_id, channel, template_key, payload)
  select a.profile_id, 'email', 'broadcast', jsonb_build_object('broadcast_id', v_id)
    from fn_broadcast_audience(p_audience, p_sbota) a;
  get diagnostics v_n = row_count;

  update broadcasts
     set recipients_count = v_n,
         status = case when v_n = 0 then 'sent' else 'sending' end
   where id = v_id;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'send_broadcast', 'broadcasts', v_id,
          jsonb_build_object('audience', p_audience, 'sbota_id', p_sbota, 'recipients', v_n));

  return jsonb_build_object('id', v_id, 'recipients', v_n);
end;
$$;
revoke execute on function fn_send_broadcast(text, text, text, uuid, text) from public, anon;
grant  execute on function fn_send_broadcast(text, text, text, uuid, text) to authenticated;


-- ===== 4) إلغاء الاشتراك — بالتوكن بس، من غير دخول =====
-- ⚠ مفتوحة للمجهول عن قصد: اللي داس على الرابط في الإيميل مش لازم يكون داخل.
--   التوكن عشوائي (uuid) ومش بيرجّع أي بيانات غير الاسم الأول.
create or replace function fn_unsubscribe(p_token uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare v_name text;
begin
  update profiles set email_news = false
   where unsub_token = p_token and deleted_at is null
  returning coalesce(nullif(btrim(first_name), ''), '') into v_name;
  return v_name;   -- null = التوكن مش صح
end;
$$;
revoke execute on function fn_unsubscribe(uuid) from public;
grant  execute on function fn_unsubscribe(uuid) to anon, authenticated;

create or replace function fn_resubscribe(p_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
begin
  update profiles set email_news = true
   where unsub_token = p_token and deleted_at is null;
  return found;
end;
$$;
revoke execute on function fn_resubscribe(uuid) from public;
grant  execute on function fn_resubscribe(uuid) to anon, authenticated;


-- ===== 5) نصوص صفحة إلغاء الاشتراك =====
insert into copy_strings (key, value_ar, screen, context_ar) values
  ('unsub.title',  'وقفنا الأخبار',                               'إلغاء الاشتراك', 'عنوان الصفحة بعد ما يدوس الرابط'),
  ('unsub.body',   'مش هيوصلك مننا إيميلات أخبار تاني. إيميلات حجزك (التأكيد والكشف والتذكير) هتفضل توصل.', 'إلغاء الاشتراك', 'تحت العنوان'),
  ('unsub.undo',   'لأ، رجّعني',                                  'إلغاء الاشتراك', 'زرار الرجوع عن الإلغاء'),
  ('unsub.back',   'رجعناك — هتوصلك أخبارنا تاني.',               'إلغاء الاشتراك', 'بعد ما يدوس «رجّعني»'),
  ('unsub.bad',    'الرابط ده مش شغّال. لو عايز توقف الإيميلات، رد على أي إيميل مننا.', 'إلغاء الاشتراك', 'لو التوكن غلط'),
  ('unsub.home',   'الرئيسية',                                    'إلغاء الاشتراك', 'رابط للرئيسية')
on conflict (key) do nothing;


-- ===== 6) الاختبار =====
-- ⚠ محتاج `fn_test_seed_up()` قبله. كل الكتابة بترجع باستثناء متعمّد.
create or replace function test_email_broadcast()
returns table (test text, result text)
language plpgsql
set search_path = public
as $body$
declare
  me  text := current_user;
  tpl uuid := '66666666-0000-0000-0000-000000000004';
  ven uuid := '55555555-0000-0000-0000-000000000004';
  s1  uuid := '77777777-0000-0000-0000-000000000125';
  f1  uuid := '33333333-0000-0000-0000-000000000001';
  f3  uuid := '33333333-0000-0000-0000-000000000003';
  f5  uuid := '33333333-0000-0000-0000-000000000005';
  m1  uuid := '44444444-0000-0000-0000-000000000001';
  names text[] := array[
    '0125 · 🔴 المجهول ما يقدرش يشوف الجمهور',
    '0125 · 🔴 العضو العادي ما يقدرش يبعت حملة',
    '0125 · قايمة انتظار سبوطة = اللي فيها بس',
    '0125 · اللي لغى اشتراكه مش في أي جمهور',
    '0125 · الإرسال بيحط إيميل لكل واحد في الطابور',
    '0125 · الحد اليومي بيوقف الحملة التانية',
    '0125 · «تجربة لنفسي» مش بتتحسب من الحد',
    '0125 · رابط إلغاء الاشتراك شغّال من غير دخول',
    '0125 · توكن غلط = ولا حاجة'];
  r   text[] := '{}';
  n   int;
  i   int;
  res jsonb;
  tok uuid;
begin
  if not exists (select 1 from profiles where id = m1)
     or not exists (select 1 from sbota_templates where id = tpl) then
    test := '0125 · الإرسال الجماعي';
    result := 'معلومة — محتاج البذرة المؤقتة (fn_test_seed_up)';
    return next;
    return;
  end if;

  begin
    update profiles set email = '[اختبار]' || left(id::text, 8) || '@example.com',
                        email_news = true, deleted_at = null, banned_at = null
     where id in (f1, f3, f5, m1);
    insert into sbotat (id, template_id, venue_id, starts_at, ends_at, price, org_fee,
                        capacity, status, girls_only, is_day, is_mystery)
    values (s1, tpl, ven, now() + interval '6 days', now() + interval '6 days 2 hours',
            15000, 0, 6, 'full', false, false, false);
    insert into waitlist (sbota_id, profile_id, position) values (s1, f3, 1), (s1, f5, 2);

    -- (١) المجهول
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    execute 'set local role anon';
    begin
      perform count(*) from fn_broadcast_audience('all', null);
      r := r || 'فشل — 🔴 المجهول شاف إيميلات الأعضاء'::text;
    exception when insufficient_privilege then
      r := r || 'نجح'::text;
    end;
    execute format('set local role %I', me);

    -- (٢) عضو من غير صلاحية
    perform set_config('request.jwt.claims',
      json_build_object('sub', f1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform fn_send_broadcast('عنوان', 'نص طويل كفاية للتجربة', 'all', null, null);
      r := r || 'فشل — 🔴 عضو بعت حملة لكل الناس'::text;
    exception when others then
      r := r || case when sqlerrm like '%notifications.broadcast%' then 'نجح'
                     else 'فشل — اترفض بسبب تاني: ' || sqlerrm end;
    end;
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);

    -- (٣) قايمة الانتظار
    select count(*) into n from fn_broadcast_audience('waitlist', s1);
    r := r || case when n = 2 then 'نجح' else format('فشل — %s بدل 2', n) end;

    -- (٤) إلغاء الاشتراك
    update profiles set email_news = false where id = f5;
    select count(*) into n from fn_broadcast_audience('waitlist', s1);
    r := r || case when n = 1 then 'نجح' else format('فشل — اللي لغى لسه في الجمهور (%s)', n) end;

    -- (٥) الإرسال — الحد مفتوح هنا، لأن ممكن المالك يكون بعت حملة حقيقية النهارده
    update settings set daily_broadcast_limit = 1000;
    res := fn_send_broadcast('[اختبار] حملة', 'نص طويل كفاية للتجربة يا {name}', 'waitlist', s1, null);
    select count(*) into n from notifications
     where template_key = 'broadcast' and payload ->> 'broadcast_id' = res ->> 'id';
    r := r || case when n = 1 and (res ->> 'recipients')::int = 1 then 'نجح'
                   else format('فشل — %s في الطابور و%s في الحملة', n, res ->> 'recipients') end;

    -- (٦) الحد اليومي = اللي اتبعت النهارده بالظبط → الجاية تترفض
    update settings set daily_broadcast_limit = (
      select count(*) from broadcasts
       where status in ('sending', 'sent') and coalesce(audience, '') <> 'me'
         and created_at >= date_trunc('day', now() at time zone 'Africa/Cairo') at time zone 'Africa/Cairo');
    begin
      perform fn_send_broadcast('[اختبار] تانية', 'نص طويل كفاية للتجربة', 'all', null, null);
      r := r || 'فشل — الحملة التانية عدّت والحد ١'::text;
    exception when others then
      r := r || case when sqlerrm like '%خلصت حملات%' then 'نجح'
                     else 'فشل — اترفضت بسبب تاني: ' || sqlerrm end;
    end;

    -- (٧) تجربة لنفسي (من الكرون/الخدمة auth.uid() = null فبتطلع صفر — المهم ما تترفضش)
    begin
      perform fn_send_broadcast('[اختبار] لنفسي', 'نص طويل كفاية للتجربة', 'me', null, null);
      r := r || 'نجح'::text;
    exception when others then
      r := r || ('فشل — التجربة اتمنعت: ' || sqlerrm);
    end;

    -- (٨) و(٩) إلغاء الاشتراك من غير دخول
    update profiles set email_news = true where id = f3;
    select unsub_token into tok from profiles where id = f3;
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    execute 'set local role anon';
    perform fn_unsubscribe(tok);
    n := case when fn_unsubscribe(gen_random_uuid()) is null then 0 else 1 end;
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);
    r := r || case when (select not email_news from profiles where id = f3)
                   then 'نجح' else 'فشل — الرابط ما وقفش الإيميلات' end;
    r := r || case when n = 0 then 'نجح' else 'فشل — توكن عشوائي لقى حد' end;

    raise exception 'test_email_broadcast_rollback';
  exception when others then
    if sqlerrm <> 'test_email_broadcast_rollback' then
      r := r || ('فشل — استثناء: ' || sqlerrm);
    end if;
  end;
  execute format('set local role %I', me);
  perform set_config('request.jwt.claims', '', true);

  for i in 1 .. array_length(r, 1) loop
    test := coalesce(names[i], '0125 · الاختبار');
    result := r[i];
    return next;
  end loop;
end $body$;

comment on function test_email_broadcast() is
  '0125 — الإرسال الجماعي: الصلاحية · الجمهور · إلغاء الاشتراك · الحد اليومي.';
revoke execute on function test_email_broadcast() from public, anon, authenticated;
