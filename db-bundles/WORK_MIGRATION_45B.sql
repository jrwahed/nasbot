-- ============================================================================
-- WORK_MIGRATION_45B.sql — «أنا جاي لو اتعملت»: نجمع الناس قبل ما الحجز يفتح
--
-- الخروجة تنزل «مقترحة» بميعادها وسعرها · الناس تدوس «أنا جاي» من غير دفع ·
-- تليجرام مع كل واحد و🎯 لما يوصل الحد · المالك يدوس «افتح الحجز» ←
-- اللي قالوا جايين بيوصلهم إيميل «اتفتحت».
--
-- ⚠ محتاج WORK_MIGRATION_45A قبله.
--
-- بعده شغّل (لزقة واحدة):
--   do $$ begin perform fn_test_seed_up(); end $$;
--   create temp table _r as select * from test_proposed();
--   do $$ begin perform fn_test_seed_down(); end $$;
--   select * from _r;                       -- ٩ صفوف «نجح»
-- ============================================================================

-- ##########################################################################
-- # 20261001161000_0127_proposed_sbotat.sql
-- ##########################################################################

-- ============================================================================
-- 0127 · «أنا جاي لو اتعملت» — نجمع الناس قبل ما الحجز يفتح
--
-- طلب المالك (٢٠٢٦-١٠-٠١): «البادل اتفتحت وقبلها بيومين حجز واحد بس،
-- فاضطريت ألغيها. عايز أجمع الناس قبل ما الحجز يشتغل».
--
-- قراره (سؤالين): الخروجة تنزل «مقترحة» بميعادها وسعرها · الناس تدوس «أنا
-- جاي لو اتعملت» من غير دفع · لما العدد يوصل للحد يوصله تليجرام · **وهو اللي
-- بيفتح الحجز بإيده** · ساعتها كل اللي قالوا جايين بيوصلهم إيميل «اتفتحت».
--
-- ⚠ ليه حالة في الـenum مش عمود؟ لأن كل حارس حجز موجود بيرفض أي حالة غير
--   `open`/`draft` (`fn_can_book` · `fn_seat_for` · `fn_join_waitlist`) —
--   فالخروجة المقترحة **مقفولة للحجز في كل الطرق من غير ما نلمس ولا دالة
--   منهم**. عمود جديد كان هيحتاج نعدّل التلاتة (والدرس التالت بيقول ليه لأ).
--
-- اللي اتغيّر:
--   · `sbotat_public` والسياسة `sbotat_read_public` بقوا بيعرضوا `proposed`.
--     ⚠ الاتنين متعرّفين في هجرات قديمة (`0097` · `0078`) — إعادة لزقهم
--     بتخفي المقترحات من الموقع، و`test_proposed()` بيمسكها.
--   · `sbota_interest` + `fn_want_sbota` (الطريق الوحيد للكتابة) +
--     `fn_my_sbota_want`.
--   · تليجرام مع كل «أنا جاي»، ورسالة 🎯 لما العدد يوصل
--     `settings.proposed_min_interest`.
--   · لما المالك يقلبها `open`: إيميل `soon_opened` (موجود) لكل اللي قالوا جايين.
--
-- ⚠ العدد **مش بيتعرض للزوار** — نفس قرار كروت «قريب» (0117). الزائر بيشوف
--   «قلت إنك جاي ✓» بس، والعدد في اللوحة وتليجرام.
--
-- ⚠ محتاج 0126 (WORK_MIGRATION_45A) قبله.
-- آمن يتكرر.
-- ============================================================================

-- ===== 1) الحد =====
alter table settings add column if not exists proposed_min_interest int not null default 4;
comment on column settings.proposed_min_interest is
  'الخروجة المقترحة: لما «أنا جاي» يوصل العدد ده يوصلك تليجرام «افتح الحجز». (0127)';


-- ===== 2) الموقع بيشوف المقترحات =====
drop policy if exists sbotat_read_public on sbotat;
create policy sbotat_read_public on sbotat for select
  using (
    status in ('proposed','open','full','locked','running')
    or fn_is_admin()
    or captain_id = fn_my_captain_id()
    or (auth.uid() is not null and host_id = auth.uid())
  );

create or replace view sbotat_public
with (security_invoker = true) as
select
  s.id, s.template_id, s.venue_id, s.captain_id, s.starts_at, s.ends_at,
  s.price, s.org_fee, s.capacity, s.status, s.girls_only, s.is_day,
  s.is_mystery, s.booking_closes_at, s.reveal_at, s.area, s.area_label_ar,
  t.slug,
  coalesce(nullif(btrim(s.title_ar), ''), t.name_ar)    as name_ar,
  coalesce(nullif(btrim(s.details_ar), ''), t.story_ar) as story_ar,
  t.kind, t.mood_ar, t.meta_prefix_ar, t.level_ar,
  t.includes_ar, t.excludes_ar,
  greatest(1, (extract(epoch from s.ends_at - s.starts_at) / 60::numeric)::integer) as duration_min,
  t.hero_photos,
  t.overnight, s.is_work, t.work_config,
  s.origin, s.host_id, s.host_name_ar, s.host_note_ar,
  case when s.origin = 'member' then s.venue_name_ar end as venue_name_ar,
  s.cost_note_ar,
  t.photo_alt_ar
from sbotat s
join sbota_templates t on t.id = s.template_id
where s.status = any (array['proposed','open','full','locked','running']::sbota_status_t[]);


grant select on sbotat_public to anon, authenticated;


-- ===== 3) «أنا جاي» =====
create table if not exists sbota_interest (
  sbota_id   uuid not null references sbotat(id) on delete cascade,
  profile_id uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (sbota_id, profile_id)
);
alter table sbota_interest enable row level security;
-- ⚠ مفيش سياسة كتابة — الطريق الوحيد `fn_want_sbota` (§٥ قاعدة ٤)
drop policy if exists sbota_interest_read on sbota_interest;
create policy sbota_interest_read on sbota_interest for select
  using (profile_id = auth.uid() or fn_is_admin());

create or replace function fn_want_sbota(s_id uuid, p_on boolean default true)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_st  sbota_status_t;
begin
  if v_uid is null then
    raise exception 'لازم تسجّل دخول الأول' using errcode = '42501';
  end if;
  if not exists (select 1 from profiles where id = v_uid and deleted_at is null and banned_at is null) then
    raise exception 'الحساب مش موجود' using errcode = '42501';
  end if;

  select status into v_st from sbotat where id = s_id;
  if v_st is distinct from 'proposed' then
    raise exception 'الخروجة دي مش مقترحة — احجز على طول' using errcode = '22023';
  end if;

  if p_on then
    insert into sbota_interest (sbota_id, profile_id) values (s_id, v_uid)
    on conflict do nothing;
  else
    delete from sbota_interest where sbota_id = s_id and profile_id = v_uid;
  end if;
  return p_on;
end;
$$;
revoke execute on function fn_want_sbota(uuid, boolean) from public, anon;
grant  execute on function fn_want_sbota(uuid, boolean) to authenticated;

create or replace function fn_my_sbota_want(s_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from sbota_interest where sbota_id = s_id and profile_id = auth.uid())
$$;
revoke execute on function fn_my_sbota_want(uuid) from public, anon;
grant  execute on function fn_my_sbota_want(uuid) to authenticated;


-- ===== 4) تليجرام: كل «أنا جاي» + 🎯 لما يوصل الحد =====
create or replace function fn_alert_sbota_interest()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  n   int;
  lim int;
begin
  begin
    if fn_alert_is_fixture(new.profile_id, new.sbota_id) then return null; end if;
    select count(*) into n from sbota_interest where sbota_id = new.sbota_id;
    select coalesce(proposed_min_interest, 4) into lim from settings limit 1;
    if n = lim then
      perform fn_admin_alert('proposal_ready',
        '🎯 وصلت ' || n || ' قالوا جايين — افتح الحجز' || chr(10)
        || fn_alert_sbota(new.sbota_id),
        '/admin/sbotat');
    else
      perform fn_admin_alert('proposal_want',
        '🙋 ' || fn_alert_who(new.profile_id) || ' قال جاي (' || n || ' من ' || lim || ')' || chr(10)
        || fn_alert_sbota(new.sbota_id),
        '/admin/sbotat');
    end if;
  exception when others then null;
  end;
  return null;
end;
$$;
revoke execute on function fn_alert_sbota_interest() from public, anon, authenticated;
drop trigger if exists t_alert_sbota_interest on sbota_interest;
create trigger t_alert_sbota_interest after insert on sbota_interest
  for each row execute function fn_alert_sbota_interest();


-- ===== 5) لما المالك يفتحها: إيميل «اتفتحت» لكل اللي قالوا جايين =====
-- القالب `soon_opened` نفسه (0117) — «يا فلان، «X» اتفتحت».
-- ⚠ اللي داس كمان «قولّي لما تفتح» على القالب بيتبلّغ من `t_notify_soon_opened`
--   — فبنستثنيه هنا علشان ما يوصلوش إيميلين.
create or replace function fn_notify_proposal_opened()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if not (tg_op = 'UPDATE' and old.status = 'proposed' and new.status = 'open') then
    return null;
  end if;
  insert into notifications (profile_id, channel, template_key, payload)
  select i.profile_id, 'email', 'soon_opened', jsonb_build_object('sbota_id', new.id)
    from sbota_interest i
    join profiles p on p.id = i.profile_id and p.deleted_at is null
   where i.sbota_id = new.id
     and not exists (select 1 from template_interest ti
                      where ti.profile_id = i.profile_id
                        and ti.template_id = new.template_id
                        and ti.notified_at is null);
  return null;
end;
$$;
revoke execute on function fn_notify_proposal_opened() from public, anon, authenticated;
drop trigger if exists t_notify_proposal_opened on sbotat;
create trigger t_notify_proposal_opened after update of status on sbotat
  for each row execute function fn_notify_proposal_opened();


-- ===== 6) نصوص =====
insert into copy_strings (key, value_ar, screen, context_ar) values
  ('proposed.badge', 'مقترحة',                                  'السبوطة', 'ستيكر الكارت بدل «فاضل X من Y»'),
  ('proposed.cta',   'أنا جاي لو اتعملت',                       'السبوطة', 'الزرار بدل «احجز» في الخروجة المقترحة'),
  ('proposed.in',    'قلت إنك جاي ✓',                           'السبوطة', 'بعد ما يدوس «أنا جاي»'),
  ('proposed.out',   'مش جاي',                                  'السبوطة', 'زرار صغير يشيل «أنا جاي»'),
  ('proposed.note',  'مفيش دفع دلوقتي. أول ما نجمع العدد هنفتح الحجز ونبعتلك.', 'السبوطة', 'تحت الزرار'),
  ('proposed.title', 'لسه بنجمع الناس',                         'السبوطة', 'عنوان الكرت بدل «مين حاجز»'),
  ('proposed.body',  'الخروجة دي هتتعمل لو كفاية ناس قالوا جايين. قول إنك جاي، ولما تتفتح هنبعتلك قبل أي حد.', 'السبوطة', 'نص الكرت'),
  ('proposed.err',   'مقدرناش نسجّلك. جرب تاني.',               'السبوطة', 'لو «أنا جاي» وقع')
on conflict (key) do nothing;


-- ===== 7) الاختبار =====
-- ⚠ محتاج `fn_test_seed_up()` قبله. كل الكتابة بترجع باستثناء متعمّد.
create or replace function test_proposed()
returns table (test text, result text)
language plpgsql
set search_path = public
as $body$
declare
  me  text := current_user;
  tpl uuid := '66666666-0000-0000-0000-000000000004';
  ven uuid := '55555555-0000-0000-0000-000000000004';
  s1  uuid := '77777777-0000-0000-0000-000000000127';
  sop uuid := '77777777-0000-0000-0000-000000000227';
  f1  uuid := '33333333-0000-0000-0000-000000000001';
  f3  uuid := '33333333-0000-0000-0000-000000000003';
  names text[] := array[
    '0127 · الزائر بيشوف الخروجة المقترحة',
    '0127 · 🔴 المجهول ما يقدرش يقول «أنا جاي»',
    '0127 · العضو بيقول «أنا جاي»',
    '0127 · 🔴 الخروجة المقترحة مقفولة للحجز',
    '0127 · «أنا جاي» على خروجة مفتوحة = احجز على طول',
    '0127 · 🔴 مفيش كتابة مباشرة على «أنا جاي»',
    '0127 · تليجرام 🎯 لما العدد يوصل للحد',
    '0127 · لما تتفتح: إيميل «اتفتحت» لكل اللي قالوا جايين',
    '0127 · «مش جاي» بيشيله'];
  r  text[] := '{}';
  n  int;
  i  int;
begin
  if not exists (select 1 from profiles where id = f3)
     or not exists (select 1 from sbota_templates where id = tpl) then
    test := '0127 · المقترحة';
    result := 'معلومة — محتاج البذرة المؤقتة (fn_test_seed_up)';
    return next;
    return;
  end if;

  begin
    update settings set proposed_min_interest = 2, telegram_alerts = true;
    update profiles set gate_status = 'approved', birth_year = extract(year from now())::int - 25,
                        deleted_at = null, banned_at = null
     where id in (f1, f3);
    insert into sbotat (id, template_id, venue_id, starts_at, ends_at, price, org_fee,
                        capacity, status, girls_only, is_day, is_mystery)
    values (s1,  tpl, ven, now() + interval '9 days', now() + interval '9 days 2 hours',
            15000, 0, 6, 'proposed', false, false, false),
           (sop, tpl, ven, now() + interval '9 days', now() + interval '9 days 2 hours',
            15000, 0, 6, 'open', false, false, false);

    -- (١) الزائر بيشوفها
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    execute 'set local role anon';
    select count(*) into n from sbotat_public where id = s1;
    r := r || case when n = 1 then 'نجح' else 'فشل — المقترحة مش باينة للزائر' end;

    -- (٢) المجهول
    begin
      perform fn_want_sbota(s1, true);
      r := r || 'فشل — 🔴 المجهول قال جاي'::text;
    exception when insufficient_privilege then
      r := r || 'نجح'::text;
    end;
    execute format('set local role %I', me);

    -- (٣) العضو
    perform set_config('nasbot.alerts_test', 'on', true);
    delete from admin_alerts;
    perform set_config('request.jwt.claims',
      json_build_object('sub', f3, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform fn_want_sbota(s1, true);
      r := r || case when fn_my_sbota_want(s1) then 'نجح' else 'فشل — اتسجّل وما بانش' end;
    exception when others then
      r := r || ('فشل — ' || sqlerrm);
    end;
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);

    -- (٤) الحجز مقفول
    r := r || case when fn_can_book(f3, s1) is not null and fn_seat_for(f3, s1) is not null
                   then 'نجح' else 'فشل — 🔴 المقترحة بتتحجز' end;

    -- (٥) خروجة مفتوحة
    perform set_config('request.jwt.claims',
      json_build_object('sub', f3, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform fn_want_sbota(sop, true);
      r := r || 'فشل — «أنا جاي» على خروجة مفتوحة'::text;
    exception when others then
      r := r || case when sqlerrm like '%احجز على طول%' then 'نجح' else 'فشل — ' || sqlerrm end;
    end;

    -- (٦) كتابة مباشرة
    begin
      insert into sbota_interest (sbota_id, profile_id) values (s1, f1);
      r := r || 'فشل — 🔴 العضو كتب «أنا جاي» باسم حد تاني'::text;
    exception when insufficient_privilege then
      r := r || 'نجح'::text;
    end;
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);

    -- (٧) التاني يوصّل الحد (٢)
    insert into sbota_interest (sbota_id, profile_id) values (s1, f1);
    r := r || case when exists (select 1 from admin_alerts where kind = 'proposal_ready')
                   then 'نجح' else 'فشل — مفيش رسالة 🎯' end;

    -- (٨) المالك يفتحها
    delete from notifications where template_key = 'soon_opened' and payload ->> 'sbota_id' = s1::text;
    update sbotat set status = 'open' where id = s1;
    select count(*) into n from notifications
     where template_key = 'soon_opened' and payload ->> 'sbota_id' = s1::text;
    r := r || case when n = 2 then 'نجح' else format('فشل — %s إيميل بدل 2', n) end;

    -- (٩) «مش جاي»
    update sbotat set status = 'proposed' where id = s1;
    perform set_config('request.jwt.claims',
      json_build_object('sub', f3, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform fn_want_sbota(s1, false);
    r := r || case when not fn_my_sbota_want(s1) then 'نجح' else 'فشل — لسه «جاي»' end;
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);

    raise exception 'test_proposed_rollback';
  exception when others then
    if sqlerrm <> 'test_proposed_rollback' then
      r := r || ('فشل — استثناء: ' || sqlerrm);
    end if;
  end;
  execute format('set local role %I', me);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('nasbot.alerts_test', '', true);

  for i in 1 .. array_length(r, 1) loop
    test := coalesce(names[i], '0127 · الاختبار');
    result := r[i];
    return next;
  end loop;
end $body$;

comment on function test_proposed() is
  '0127 — الخروجة المقترحة: باينة ومقفولة للحجز · «أنا جاي» بالدالة بس · تليجرام عند الحد · إيميل لما تتفتح.';
revoke execute on function test_proposed() from public, anon, authenticated;
