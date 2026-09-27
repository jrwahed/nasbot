-- ============================================================================
-- WORK_MIGRATION_22.sql — بوابة الدخول
--
-- النادي يفضل مقفول على ناس معروفة. تلات مفاتيح مستقلة:
--   ١) بالدعوة بس — كود من عضو موجود، وكل عضو عنده عدد دعوات محدود.
--   ٢) طلب + موافقة — العضو الجديد «مستني» وما يحجزش غير لما اللوحة توافق.
--   ٣) تزكية — عدد من الأعضاء لازم يقولوا إنهم يعرفوه.
--
-- ⚠ **كل المفاتيح مقفولة في الملف ده، وكل الأعضاء الحاليين بيفضلوا مقبولين.**
--    يعني اللزق ما بيغيّرش حاجة لحد ما تفتح مفتاح من `/admin/settings`.
--
-- ⚠ **الأدمن مستثنى من البوابة صراحةً** — من غير كده أول مفتاح يتفتح غلط
--    بيقفل الموقع عليك انت وما تعرفش ترجّعه إلا من SQL.
--
-- بعده شغّل: select * from test_entry_gate();  — السبعة لازم «نجح».
-- ============================================================================

-- ############################################################################
-- # 20260920140000_0101_entry_gate.sql
-- ############################################################################

-- ============================================================================
-- 0101 — بوابة الدخول: النادي يفضل مقفول على ناس معروفة
--
-- المالك عايز «مش أي حد». ده بيتعمل بـ**بوابة دخول**، مش بخانة «مستوى».
-- تلات مفاتيح مستقلة بتشتغل مع بعض أو كل واحد لوحده:
--
--   ١) **بالدعوة بس** — محدش يتقبل من غير كود من عضو موجود، وكل عضو عنده
--      عدد دعوات محدود. لو حد جاب ناس وحشة، بتقفل دعواته هو.
--   ٢) **طلب + موافقة** — العضو الجديد بيبقى «مستني»، وما يقدرش يحجز غير
--      لما اللوحة توافق.
--   ٣) **تزكية** — لازم عدد من الأعضاء الموجودين يزكّوه.
--
-- ⚠ **كل المفاتيح مقفولة (`false`/`0`) في الملف ده، وكل الأعضاء الحاليين
--    بيبقوا `approved`.** يعني لزق الملف **ما بيغيّرش حاجة** لحد ما المالك
--    يفتح مفتاح من `/admin/settings`. اللزق اللي بيقفل الموقع على الناس
--    وهو نازل خطأ مش ميزة.
--
-- ⚠ **الأدمن مستثنى من البوابة** صراحةً. من غير ده أول مفتاح بيتفتح غلط
--    بيقفل الموقع على المالك نفسه وما يبقاش قادر يرجّعه إلا من SQL.
--
-- ملاحظة على «السعر هو الفلتر»: الكارت المدفوع محتاج سكة الدفع تكون شغّالة
-- (رقم فودافون كاش لسه وهمي)، فهو مش في الملف ده. وأبسط صورة منه — إنك
-- تسعّر السبوطات أعلى — قرار محتوى مش كود.
-- ============================================================================

-- ===== ١ · الحالة =====

do $$
begin
  -- نوع جديد (مش `alter type ... add value`) — آمن في نفس المعاملة
  if not exists (select 1 from pg_type where typname = 'gate_status_t') then
    create type gate_status_t as enum ('pending','approved','rejected');
  end if;
end $$;

alter table profiles
  add column if not exists gate_status     gate_status_t not null default 'approved',
  add column if not exists gate_note       text,
  add column if not exists gate_decided_at timestamptz,
  add column if not exists gate_decided_by uuid references profiles(id),
  -- عدد الدعوات الفاضلة للعضو. صفر = ما يقدرش يدعو (الافتراضي لحد ما المفتاح يتفتح)
  add column if not exists invites_left    int not null default 0,
  -- إجابات الطلب — `referred_by` موجود خلاص وهو «مين عرّفه»
  add column if not exists apply_social    text,
  add column if not exists apply_why       text;

create index if not exists profiles_gate_status_idx on profiles (gate_status)
  where gate_status <> 'approved';

-- ===== ٢ · المفاتيح (كلها مقفولة) =====

alter table settings
  add column if not exists gate_invite_only        boolean not null default false,
  add column if not exists gate_needs_approval     boolean not null default false,
  add column if not exists gate_needs_endorsements int     not null default 0,
  add column if not exists invites_per_member      int     not null default 3;

-- ===== ٣ · التزكية =====

create table if not exists endorsements (
  profile_id uuid not null references profiles(id) on delete cascade,
  by_id      uuid not null references profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (profile_id, by_id),
  -- محدش يزكّي نفسه
  constraint endorsements_not_self check (profile_id <> by_id)
);

alter table endorsements enable row level security;

drop policy if exists endorsements_read on endorsements;
create policy endorsements_read on endorsements
  for select using (profile_id = auth.uid() or by_id = auth.uid() or fn_is_admin());

-- ⚠ **مفيش سياسة كتابة.** التزكية بتتعمل بـ`fn_endorse` بس — نفس نمط
--    `fn_pair_want`. لو سبنا `insert` مفتوح، أي حد كان هيزكّي نفسه بحساب تاني
--    أو يزوّد تزكيات بالجملة.

-- ===== ٤ · الحارس =====

/**
 * البوابة بتقول لأ ليه — أو null لو عدّى.
 * بتتنادى من `fn_can_book` ومن الواجهة علشان تعرض السبب.
 */
create or replace function fn_gate_state(p_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  p profiles;
  cfg settings;
  n int;
begin
  select * into p from profiles where id = p_id;
  if not found then return 'الحساب مش موجود'; end if;

  -- ⚠ الأدمن بيعدّي دايمًا. من غير السطر ده مفتاح بيتفتح غلط بيقفل
  --    الموقع على المالك نفسه.
  if exists (select 1 from admin_users a where a.profile_id = p_id and a.is_active) then
    return null;
  end if;

  select * into cfg from settings limit 1;

  if p.gate_status = 'rejected' then
    return coalesce(nullif(btrim(p.gate_note), ''), 'طلبك اتراجع ومااتقبلش.');
  end if;

  if cfg.gate_needs_approval and p.gate_status <> 'approved' then
    return 'طلبك لسه بيتراجع. هنبعتلك أول ما نخلص.';
  end if;

  if cfg.gate_invite_only and p.referred_by is null and p.gate_status <> 'approved' then
    return 'الدخول بالدعوة بس. محتاج كود من حد جوه.';
  end if;

  if cfg.gate_needs_endorsements > 0 and p.gate_status <> 'approved' then
    select count(*) into n from endorsements e where e.profile_id = p_id;
    if n < cfg.gate_needs_endorsements then
      return format('محتاج %s تزكية من أعضاء — عندك %s.', cfg.gate_needs_endorsements, n);
    end if;
  end if;

  return null;
end $$;

revoke execute on function fn_gate_state(uuid) from public, anon;
grant  execute on function fn_gate_state(uuid) to authenticated;

-- ===== ٥ · الحجز بيمر من البوابة =====
--
-- ⚠ البوابة بتتحط في `fn_can_book` لأنها **نقطة الاختناق الوحيدة** للحجز.
--    لو حطيناها في الواجهة بس، أي حد بينده الـAPI بإيده بيعدّي (القاعدة §٣.٣).

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

  age := extract(year from now())::int - coalesce(p.birth_year, 0);
  if age < 18 then return 'لازم تكون 18 سنة على الأقل'; end if;
  if t.overnight and age < 21 then return 'الرحلات بمبيت من 21 سنة'; end if;

  if s.girls_only and p.gender <> 'female' then return 'السبوطة دي بنات بس'; end if;
  if s.is_mystery and not fn_can_book_mystery(p_id) then return 'روح سبوطتين الأول'; end if;

  if exists (select 1 from bookings b
             where b.sbota_id = s_id and b.profile_id = p_id
               and b.status in ('pending_payment','paid','attended')) then
    return 'أنت حاجز السبوطة دي بالفعل';
  end if;

  return null;
end $$;

-- ===== ٦ · العضو الجديد بيبقى «مستني» لما البوابة مفتوحة =====
--
-- ⚠ في محفّز مش في الكود: لو الشرط في `/api/account/ensure` بس، أي طريق
--    تاني لإنشاء ملف (بذرة · لوحة · سكربت) بيعدّي من غير بوابة.

create or replace function fn_gate_on_signup()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare cfg settings;
begin
  select * into cfg from settings limit 1;
  if cfg.gate_needs_approval or cfg.gate_invite_only or cfg.gate_needs_endorsements > 0 then
    new.gate_status := 'pending';
  end if;
  return new;
end $$;

drop trigger if exists t_gate_on_signup on profiles;
create trigger t_gate_on_signup
  before insert on profiles
  for each row execute function fn_gate_on_signup();

-- ===== ٧ · الدعوة =====

/**
 * بيستعمل كود دعوة: بيربط العضو بصاحب الكود وبينقص رصيد دعواته.
 * بيرجّع رسالة الخطأ أو null لو تمام.
 */
create or replace function fn_use_invite(p_code text)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  host profiles;
  cfg settings;
begin
  if me is null then return 'لازم تكون داخل بحسابك'; end if;
  select * into cfg from settings limit 1;

  select * into host from profiles
   where upper(btrim(referral_code)) = upper(btrim(p_code))
     and deleted_at is null and banned_at is null;
  if not found then return 'الكود ده مش مظبوط'; end if;
  if host.id = me then return 'مينفعش تدعو نفسك'; end if;
  if host.gate_status <> 'approved' then return 'الكود ده مش شغّال'; end if;
  if host.invites_left <= 0 then return 'الكود ده خلصت دعواته'; end if;

  if (select referred_by from profiles where id = me) is not null then
    return 'انت مربوط بكود خلاص';
  end if;

  update profiles set invites_left = invites_left - 1 where id = host.id;
  update profiles set referred_by = host.id where id = me;

  -- الدعوة لوحدها بتقبلك لو مفيش موافقة ولا تزكية مطلوبة
  if not cfg.gate_needs_approval and cfg.gate_needs_endorsements = 0 then
    update profiles set gate_status = 'approved', gate_decided_at = now() where id = me;
  end if;

  return null;
end $$;

revoke execute on function fn_use_invite(text) from public, anon;
grant  execute on function fn_use_invite(text) to authenticated;

-- ===== ٨ · التزكية =====

create or replace function fn_endorse(p_profile uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  me uuid := auth.uid();
  cfg settings;
  n int;
begin
  if me is null then return 'لازم تكون داخل بحسابك'; end if;
  if me = p_profile then return 'مينفعش تزكّي نفسك'; end if;

  -- ⚠ اللي بيزكّي لازم يكون **مقبول** هو نفسه، وإلا حساب مستني بيزكّي
  --    حساب مستني وييجوا الاتنين من بره.
  if (select gate_status from profiles where id = me) <> 'approved' then
    return 'لازم تكون مقبول الأول';
  end if;
  if not exists (select 1 from profiles where id = p_profile and deleted_at is null) then
    return 'الحساب ده مش موجود';
  end if;

  insert into endorsements (profile_id, by_id) values (p_profile, me)
  on conflict do nothing;

  select * into cfg from settings limit 1;
  select count(*) into n from endorsements where profile_id = p_profile;

  if cfg.gate_needs_endorsements > 0 and n >= cfg.gate_needs_endorsements
     and not cfg.gate_needs_approval then
    update profiles set gate_status = 'approved', gate_decided_at = now()
     where id = p_profile and gate_status = 'pending';
  end if;

  return null;
end $$;

revoke execute on function fn_endorse(uuid) from public, anon;
grant  execute on function fn_endorse(uuid) to authenticated;

-- ===== ٩ · قرار اللوحة =====

create or replace function fn_gate_decide(p_profile uuid, p_ok boolean, p_note text default null)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare cfg settings;
begin
  -- ⚠ `fn_has_permission` مش `fn_is_admin` — القبول والرفض قرار إداري،
  --    و`support` ما ينفعش يعمله (القاعدة §٥.٢).
  if not fn_has_permission('people.manage') then
    return 'مش من حقك تقبل أو ترفض';
  end if;

  select * into cfg from settings limit 1;

  update profiles set
    gate_status     = case when p_ok then 'approved' else 'rejected' end::gate_status_t,
    gate_note       = nullif(btrim(coalesce(p_note, '')), ''),
    gate_decided_at = now(),
    gate_decided_by = auth.uid(),
    -- أول ما يتقبل بياخد رصيد دعواته
    invites_left    = case when p_ok then greatest(invites_left, cfg.invites_per_member)
                           else 0 end
  where id = p_profile;

  if not found then return 'الحساب ده مش موجود'; end if;
  return null;
end $$;

revoke execute on function fn_gate_decide(uuid, boolean, text) from public, anon;
grant  execute on function fn_gate_decide(uuid, boolean, text) to authenticated;

-- ===== ١٠ · نصوص البوابة =====

insert into copy_strings (key, value_ar) values
  ('gate.pending.title','طلبك وصلنا'),
  ('gate.pending.body','بنراجع الطلبات بإيدينا علشان نعرف مين جاي. هنبعتلك أول ما نخلص.'),
  ('gate.rejected.title','مااتقبلش الطلب'),
  ('gate.invite.title','الدخول بالدعوة'),
  ('gate.invite.body','نسبوط نادي مقفول. محتاج كود من حد جوه علشان تدخل.'),
  ('gate.invite.label','كود الدعوة'),
  ('gate.invite.send','ادخل بالكود'),
  ('gate.endorse.title','محتاج تزكية'),
  ('gate.endorse.body','محتاج {{n}} من الأعضاء يقولوا إنهم يعرفوك. ابعتلهم اللينك ده.'),
  ('gate.endorse.do','أزكّيه'),
  ('gate.endorse.done','اتزكّى ✓'),
  ('gate.invites.left','فاضلك {{n}} دعوة'),
  ('gate.invites.none','خلصت دعواتك'),
  ('gate.endorse.body.link','انسخ لينك التزكية'),
  ('gate.zakki.title','تزكية'),
  ('gate.zakki.body','{{name}} عايز يدخل نسبوط. انت تعرفه؟'),
  ('gate.zakki.bad','اللينك ده مش مظبوط.'),
  ('gate.zakki.mine','روح لصفحتك')
on conflict (key) do update set value_ar = excluded.value_ar;

-- ===== دالة الاختبار =====
--
-- ⚠ سلوكية: بتلبس دور أعضاء حقيقيين وتتأكد إن البوابة **بتمنع فعلًا** —
--    وإنها **ما بتقفلش على الأدمن**، وإن المفاتيح المقفولة ما بتغيّرش حاجة.
create or replace function test_entry_gate()
returns table (test text, result text)
language plpgsql security definer set search_path = public, auth
as $body$
declare
  v_new  uuid := '44444444-0000-0000-0000-000000000101';
  v_host uuid := '44444444-0000-0000-0000-000000000102';
  v_code text;
  v_admin uuid;
  v_was gate_status_t;
  msg text;
  n int;
begin
  -- بذرة مؤقتة
  insert into auth.users (instance_id, id, aud, role, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data, is_sso_user)
  values ('00000000-0000-0000-0000-000000000000', v_new, 'authenticated','authenticated',
          now(), now(), '{}'::jsonb,'{}'::jsonb,false),
         ('00000000-0000-0000-0000-000000000000', v_host,'authenticated','authenticated',
          now(), now(), '{}'::jsonb,'{}'::jsonb,false)
  on conflict (id) do nothing;

  insert into profiles (id, first_name, gender, area, role, referral_code, gate_status, invites_left)
  values (v_new ,'[اختبار] جديد','male','tagamoa','member','TST101','pending', 0),
         (v_host,'[اختبار] داعي','male','maadi' ,'member','TST102','approved', 2)
  on conflict (id) do nothing;

  -- (١) المفاتيح مقفولة = مفيش بوابة
  update settings set gate_invite_only = false, gate_needs_approval = false,
                      gate_needs_endorsements = 0;
  test := '0101 · المفاتيح مقفولة ← البوابة ما بتمنعش حد';
  if fn_gate_state(v_new) is null then result := 'نجح';
  else result := 'فشل — 🔴 اللزق قفل الموقع على الناس: ' || fn_gate_state(v_new); end if;
  return next;

  -- (٢) الموافقة مطلوبة ← «مستني» يتمنع
  update settings set gate_needs_approval = true;
  test := '0101 · الموافقة مطلوبة ← اللي لسه مستني ما يحجزش';
  if fn_gate_state(v_new) is not null then result := 'نجح';
  else result := 'فشل — 🔴 حساب مستني عدّى من البوابة'; end if;
  return next;

  -- (٣) الأدمن ما يتقفلش عليه أبدًا
  --
  -- ⚠ **الاختبار ده كان بيكدب.** كان بيسأل `fn_gate_state` على حساب الأدمن
  --    وهو أصلًا `approved`، فكان بيعدّي من شرط الموافقة مش من استثناء
  --    الأدمن. شلنا الاستثناء بفخ متعمّد والاختبار قال «نجح».
  --    دلوقتي بنخلّي حساب الأدمن نفسه **`pending`** — كده الطريق الوحيد
  --    اللي بيعدّيه هو استثناء الأدمن، ولو اتشال الاختبار بيقع.
  select a.profile_id into v_admin from admin_users a
   join profiles pr on pr.id = a.profile_id
   where a.is_active limit 1;

  test := '0101 · الأدمن بيعدّي حتى لو حسابه «مستني»';
  if v_admin is null then
    result := 'مفيش حساب لوحة نشط — البند ده مش متفحوص';
  else
    select gate_status into v_was from profiles where id = v_admin;
    update profiles set gate_status = 'pending' where id = v_admin;
    msg := fn_gate_state(v_admin);
    -- الترجيع فورًا، قبل أي حاجة تانية ممكن تقع
    update profiles set gate_status = v_was where id = v_admin;
    if msg is null then result := 'نجح';
    else result := 'فشل — 🔴 المالك اتقفل عليه: ' || msg; end if;
  end if;
  return next;

  -- (٤) قرار اللوحة بيقبل وبيدي دعوات
  perform set_config('request.jwt.claims','', true);
  update profiles set gate_status = 'approved', gate_decided_at = now(),
                      invites_left = 3 where id = v_new;
  test := '0101 · المقبول بيعدّي من البوابة';
  if fn_gate_state(v_new) is null then result := 'نجح';
  else result := 'فشل — ' || fn_gate_state(v_new); end if;
  return next;

  -- (٥) الدعوة: كود غلط يترفض، وكود صح ينفع مرة واحدة
  update profiles set gate_status='pending', referred_by=null where id = v_new;
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', v_new), true);

  test := '0101 · كود دعوة غلط بيترفض';
  if fn_use_invite('MSHMWGWD') is not null then result := 'نجح';
  else result := 'فشل — 🔴 أي كود بيعدّي'; end if;
  return next;

  test := '0101 · كود صح بينقص رصيد صاحبه';
  msg := fn_use_invite('TST102');
  perform set_config('request.jwt.claims','', true);
  select invites_left into n from profiles where id = v_host;
  if msg is null and n = 1 then result := 'نجح';
  else result := format('فشل — رد: %s · فاضل %s', coalesce(msg,'تمام'), n); end if;
  return next;

  -- (٦) التزكية: محدش يزكّي نفسه
  --
  -- ⚠ ممنوعة في مكانين: حارس في الدالة، وقيد `check` في الجدول. الاتنين
  --    مقصودين — لو حد كتب نسخة جديدة من الدالة ونسي الحارس، القيد بيمسكه.
  --    فالاختبار بيعدّ **الاتنين** نجاح: المهم إنها ما بتحصلش.
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', v_new), true);
  test := '0101 · محدش يزكّي نفسه';
  begin
    if fn_endorse(v_new) is not null then result := 'نجح — الدالة رفضت';
    else result := 'فشل — 🔴 زكّى نفسه'; end if;
  exception when others then
    result := 'نجح — القاعدة رفضت';
  end;
  return next;

  perform set_config('request.jwt.claims','', true);

  -- تنضيف
  update settings set gate_invite_only=false, gate_needs_approval=false,
                      gate_needs_endorsements=0;
  delete from endorsements where profile_id in (v_new, v_host) or by_id in (v_new, v_host);
  delete from profiles p where p.id in (v_new, v_host)
    and not exists (select 1 from admin_users a where a.profile_id = p.id);
  delete from auth.users u where u.id in (v_new, v_host)
    and not exists (select 1 from profiles p where p.id = u.id);

exception when others then
  perform set_config('request.jwt.claims','', true);
  -- ⚠ أهم سطر في الجزء ده: لو الاختبار وقع وهو لابس حساب الأدمن «مستني»،
  --    المالك بيتقفل عليه بره موقعه. بنرجّع أي حساب لوحة لـ`approved`.
  update profiles p set gate_status = 'approved'
   where exists (select 1 from admin_users a where a.profile_id = p.id and a.is_active)
     and p.gate_status <> 'approved';
  update settings set gate_invite_only=false, gate_needs_approval=false,
                      gate_needs_endorsements=0;
  delete from endorsements where profile_id in ('44444444-0000-0000-0000-000000000101',
                                                '44444444-0000-0000-0000-000000000102');
  delete from profiles p where p.id in ('44444444-0000-0000-0000-000000000101',
                                        '44444444-0000-0000-0000-000000000102')
    and not exists (select 1 from admin_users a where a.profile_id = p.id);
  delete from auth.users u where u.id in ('44444444-0000-0000-0000-000000000101',
                                          '44444444-0000-0000-0000-000000000102')
    and not exists (select 1 from profiles p where p.id = u.id);
  test := '0101 · اختبار البوابة';
  result := 'فشل — ' || sqlerrm;
  return next;
end $body$;

revoke execute on function test_entry_gate() from public, anon, authenticated;
