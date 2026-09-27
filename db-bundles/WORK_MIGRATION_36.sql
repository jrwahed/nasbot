-- ============================================================================
-- WORK_MIGRATION_36.sql — كروت «قريب» + «قولّي لما تفتح»
--
-- **طلبك:** الرئيسية ما تبقاش سبوطة واحدة بس. تحت السبوطات المفتوحة
-- يبان كروت لخروجات «جاية قريب» — صورة واسم وبس، من غير ميعاد ولا سعر.
--
-- إيه اللي بيتغيّر:
--   · في `/admin/templates` كل قالب بقى ليه زرار **«قريب»**. علّم عليه
--     والكارت يبان في الرئيسية.
--   · الكارت فيه زرار **«قولّي لما تفتح»**. العضو يدوس، واسمه يتسجّل.
--   · وتشوف في نفس الصفحة **كام واحد مستني** كل خروجة — تعرف تفتح إيه الأول.
--   · أول ما تفتح سبوطة من القالب ده (الحالة «مفتوحة»)، كل اللي داسوا
--     يوصلهم **إيميل مرة واحدة** فيه الميعاد ولينك الحجز.
--   · والقالب اللي عنده سبوطة مفتوحة بيختفي من «قريب» لوحده — علشان نفس
--     الخروجة ما تبانش مرتين.
--
-- ⚠ آمن يتلزق أكتر من مرة.
--
-- بعده شغّل (بالترتيب):
--   select fn_test_seed_up();
--   select * from test_coming_soon();    -- ٨ صفوف «نجح»
--   select fn_test_seed_down();
-- ============================================================================

-- ##########################################################################
-- # 20260927120000_0117_coming_soon.sql
-- ##########################################################################

-- ============================================================================
-- 0117 · كروت «قريب» + «قولّي لما تفتح»
--
-- المالك عايز الرئيسية ما تبقاش سبوطة واحدة بس. فأي قالب يتعلّم «قريب» من
-- `/admin/templates` بيبان تحت السبوطات المفتوحة: صورة واسم وبس — من غير
-- ميعاد ولا سعر ولا زرار حجز. وفيه زرار واحد «قولّي لما تفتح».
--
-- ولما سبوطة من القالب ده تتفتح (status يبقى 'open')، كل اللي داسوا يوصلهم
-- إيميل `soon_opened` مرة واحدة (`notified_at`).
--
-- ⚠ الكتابة على `template_interest` **بدالة بس** (`fn_want_soon`) — مفيش
--   سياسة insert. نفس نمط `fn_pair_want` (CLAUDE.md §٥ قاعدة ٤): العضو
--   ما يقدرش يسجّل اهتمام باسم حد تاني، ولا على قالب مش «قريب».
-- ⚠ القالب اللي عنده سبوطة مفتوحة دلوقتي **ما بيبانش** «قريب» — وإلا نفس
--   الخروجة تبان مرتين: مرة بزرار حجز ومرة «قريب».
-- ============================================================================

alter table sbota_templates add column if not exists coming_soon       boolean not null default false;
alter table sbota_templates add column if not exists coming_soon_order int     not null default 0;

comment on column sbota_templates.coming_soon is
  'بيبان كارت «قريب» في الرئيسية — صورة واسم وزرار «قولّي لما تفتح». بيتعلّم من /admin/templates.';
comment on column sbota_templates.coming_soon_order is
  'ترتيب كروت «قريب» — الأصغر الأول.';

create table if not exists template_interest (
  template_id uuid        not null references sbota_templates(id) on delete cascade,
  profile_id  uuid        not null references profiles(id) on delete cascade,
  created_at  timestamptz not null default now(),
  notified_at timestamptz,
  primary key (template_id, profile_id)
);
comment on table template_interest is
  'مين داس «قولّي لما تفتح» على كارت «قريب». الكتابة من fn_want_soon بس. notified_at = اتبعتله إيميل الفتح.';

create index if not exists template_interest_waiting
  on template_interest (template_id) where notified_at is null;

alter table template_interest enable row level security;

-- القراية للإدارة بس (العدّ في /admin/templates). العضو بيعرف حالته من fn_coming_soon.
drop policy if exists template_interest_admin_read on template_interest;
create policy template_interest_admin_read on template_interest
  for select using (fn_is_admin());

revoke all on template_interest from public, anon;
grant select on template_interest to authenticated;


-- ===== الكروت نفسها =====
--
-- مفتوحة للزائر المجهول عن قصد: الكارت بيبان لأي حد. `i_want` بتبقى false
-- للمجهول (auth.uid() = null) — ومفيش عدد اهتمام بيطلع للعامة.
create or replace function fn_coming_soon()
returns table (
  template_id  uuid,
  slug         text,
  name_ar      text,
  mood_ar      text,
  photo        text,
  photo_alt_ar text,
  i_want       boolean
)
language sql
stable
security definer
set search_path = public
as $$
  select t.id, t.slug, t.name_ar, t.mood_ar,
         t.hero_photos[1], t.photo_alt_ar,
         exists (select 1 from template_interest i
                  where i.template_id = t.id
                    and i.profile_id = auth.uid()
                    and i.notified_at is null)
    from sbota_templates t
   where t.coming_soon
     and not exists (select 1 from sbotat s
                      where s.template_id = t.id
                        and s.status in ('open', 'full'))
   order by t.coming_soon_order, t.name_ar;
$$;

revoke execute on function fn_coming_soon() from public;
grant execute on function fn_coming_soon() to anon, authenticated;


-- ===== «قولّي لما تفتح» =====
--
-- p_on = true  → سجّلني (ولو كنت اتبلّغت قبل كده، بيرجع يستنى من الأول).
-- p_on = false → شيلني.
create or replace function fn_want_soon(p_template uuid, p_on boolean default true)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare me uuid := auth.uid();
begin
  if me is null then
    raise exception 'لازم تسجّل دخول الأول' using errcode = '42501';
  end if;

  if p_on then
    if not exists (select 1 from sbota_templates where id = p_template and coming_soon) then
      raise exception 'الخروجة دي مش في «قريب»' using errcode = '22023';
    end if;
    insert into template_interest (template_id, profile_id)
    values (p_template, me)
    on conflict (template_id, profile_id)
      do update set notified_at = null, created_at = now();
    return true;
  end if;

  delete from template_interest where template_id = p_template and profile_id = me;
  return false;
end $$;

revoke execute on function fn_want_soon(uuid, boolean) from public, anon;
grant execute on function fn_want_soon(uuid, boolean) to authenticated;


-- ===== لما السبوطة تتفتح: بلّغ اللي مستنيين =====
create or replace function fn_notify_soon_opened()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.status <> 'open' then return new; end if;
  if tg_op = 'UPDATE' and old.status = 'open' then return new; end if;

  insert into notifications (profile_id, channel, template_key, payload)
  select i.profile_id, 'email', 'soon_opened',
         jsonb_build_object('sbota_id', new.id, 'template_id', new.template_id)
    from template_interest i
    join profiles p on p.id = i.profile_id and p.deleted_at is null
   where i.template_id = new.template_id
     and i.notified_at is null;

  update template_interest
     set notified_at = now()
   where template_id = new.template_id
     and notified_at is null;

  return new;
end $$;

revoke execute on function fn_notify_soon_opened() from public, anon, authenticated;

drop trigger if exists t_notify_soon_opened on sbotat;
create trigger t_notify_soon_opened
  after insert or update of status on sbotat
  for each row execute function fn_notify_soon_opened();


-- ===== قالب الإيميل =====
insert into notification_templates (key, channel, body_ar, provider_template_id, is_active)
values ('soon_opened', 'email',
'يا {{1}}، «{{2}}» اتفتحت.
الميعاد: {{3}}
الأماكن قليلة، احجز مكانك من هنا: {{4}}',
 null, true)
on conflict (key) do nothing;


-- ===== النصوص =====
insert into copy_strings (key, value_ar, screen, context_ar) values
  ('soon.title',  'جاية قريب',            'الرئيسية',
   'عنوان قسم كروت «قريب» تحت السبوطات المفتوحة'),
  ('soon.sub',    'لسه ما اتحددش ميعادها. دوس وهنقولك أول ما تفتح.', 'الرئيسية',
   'سطر تحت عنوان «جاية قريب»'),
  ('soon.badge',  'قريب',                 'الرئيسية',
   'الستيكر اللي على صورة كارت «قريب»'),
  ('soon.want',   'قولّي لما تفتح',       'الرئيسية',
   'زرار كارت «قريب» — قبل ما يدوس'),
  ('soon.wanted', 'هنقولك ✓',             'الرئيسية',
   'زرار كارت «قريب» — بعد ما داس (دوسة تانية بتشيله)'),
  ('soon.error',  'مقدرناش نسجّلك، جرّب تاني.', 'الرئيسية',
   'لو الدوسة على «قولّي لما تفتح» فشلت')
on conflict (key) do nothing;


-- ===== دالة الاختبار =====
--
-- سلوكية: كل اللي بتعمله جوه بلوك بيترمي في الآخر، فمفيش ولا صف بيفضل.
-- محتاجة `fn_test_seed_up()` قبلها (القالب 66666666…04 والعضو 33333333…01).
create or replace function test_coming_soon()
returns table (test text, result text)
language plpgsql
set search_path = public
as $body$
declare
  me   text := current_user;
  tpl  uuid := '66666666-0000-0000-0000-000000000004';
  sb   uuid := '77777777-0000-0000-0000-000000000004';
  mem  uuid := '33333333-0000-0000-0000-000000000001';
  n    int;
  ok   boolean;
  r    text[] := '{}';
  msg  text;
begin
  if not exists (select 1 from sbota_templates where id = tpl) then
    test := '0117 · كروت «قريب»';
    result := 'معلومة — محتاج البذرة المؤقتة (fn_test_seed_up)';
    return next;
    return;
  end if;

  begin
    -- القالب «قريب» والسبوطتين بتوعه مش مفتوحين
    update sbota_templates set coming_soon = true where id = tpl;
    update sbotat set status = 'draft' where template_id = tpl;

    -- (١) الزائر المجهول شايف الكارت
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    execute 'set local role anon';
    select count(*) into n from fn_coming_soon() c where c.template_id = tpl;
    r := r || case when n = 1 then 'نجح' else format('فشل — المجهول شايف %s كارت', n) end;

    -- (٢) الزائر المجهول ما يقدرش يسجّل
    begin
      perform fn_want_soon(tpl, true);
      r := r || 'فشل — 🔴 المجهول سجّل اهتمام'::text;
    exception when insufficient_privilege then
      r := r || 'نجح'::text;
    end;
    execute format('set local role %I', me);

    -- (٣) العضو يسجّل، والكارت يقوله «هنقولك»
    perform set_config('request.jwt.claims',
      json_build_object('sub', mem, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    perform fn_want_soon(tpl, true);
    select c.i_want into ok from fn_coming_soon() c where c.template_id = tpl;
    r := r || case when ok then 'نجح' else 'فشل — سجّل والكارت لسه بيقول «قولّي»' end;

    -- (٤) العضو ما يقدرش يكتب في الجدول مباشرة
    begin
      insert into template_interest (template_id, profile_id)
      values (tpl, '33333333-0000-0000-0000-000000000003');
      r := r || 'فشل — 🔴 العضو كتب اهتمام باسم حد تاني'::text;
    exception when insufficient_privilege then
      r := r || 'نجح'::text;
    end;
    execute format('set local role %I', me);

    -- (٥) القالب مش «قريب» → مرفوض
    update sbota_templates set coming_soon = false where id = tpl;
    perform set_config('request.jwt.claims',
      json_build_object('sub', mem, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform fn_want_soon(tpl, true);
      r := r || 'فشل — سجّل على قالب مش «قريب»'::text;
    exception when others then
      r := r || 'نجح'::text;
    end;
    execute format('set local role %I', me);
    update sbota_templates set coming_soon = true where id = tpl;
    perform set_config('request.jwt.claims', '', true);

    -- (٦) فتح السبوطة بيبعت إيميل للي مستني
    update sbotat set status = 'open' where id = sb;
    select count(*) into n from notifications
     where template_key = 'soon_opened' and profile_id = mem
       and payload ->> 'sbota_id' = sb::text;
    r := r || case when n = 1 then 'نجح' else format('فشل — اتحط %s إيميل بدل ١', n) end;

    -- (٧) ومرة واحدة بس — فتح تاني ما يبعتش تاني
    update sbotat set status = 'draft' where id = sb;
    update sbotat set status = 'open'  where id = sb;
    select count(*) into n from notifications
     where template_key = 'soon_opened' and profile_id = mem;
    r := r || case when n = 1 then 'نجح' else format('فشل — اتبعت %s مرة', n) end;

    -- (٨) والقالب اللي عنده سبوطة مفتوحة ما بيبانش «قريب»
    select count(*) into n from fn_coming_soon() c where c.template_id = tpl;
    r := r || case when n = 0 then 'نجح' else 'فشل — الخروجة باينة مفتوحة و«قريب» في نفس الوقت' end;

    raise exception 'test_coming_soon_rollback';
  exception when others then
    get stacked diagnostics msg = message_text;
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);
    if msg <> 'test_coming_soon_rollback' then
      test := '0117 · كروت «قريب»';
      result := 'فشل — الاختبار وقع: ' || msg;
      return next;
      return;
    end if;
  end;

  test := 'سلوكي · الزائر المجهول شايف كارت «قريب»';                 result := r[1]; return next;
  test := 'سلوكي · الزائر المجهول ما يقدرش يدوس «قولّي»';            result := r[2]; return next;
  test := 'سلوكي · العضو يدوس والكارت يقوله «هنقولك»';               result := r[3]; return next;
  test := 'سلوكي · مفيش كتابة مباشرة على template_interest';          result := r[4]; return next;
  test := 'سلوكي · مفيش «قولّي» على قالب مش «قريب»';                 result := r[5]; return next;
  test := 'سلوكي · فتح السبوطة بيحط إيميل للي مستني';                result := r[6]; return next;
  test := 'سلوكي · الإيميل بيتبعت مرة واحدة بس';                      result := r[7]; return next;
  test := 'سلوكي · الخروجة المفتوحة ما بتبانش «قريب» كمان';           result := r[8]; return next;
end $body$;

revoke execute on function test_coming_soon() from public, anon, authenticated;
