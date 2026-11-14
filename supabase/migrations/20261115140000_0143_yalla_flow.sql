-- ============================================================================
-- 0143 · «يلا» — الاختيار والقفل والتبديل والكشف
--
-- ده الملف اللي فيه المنطق كله. الفكرة في سطر: النداء بيتحوّل لسبوطة حقيقية
-- عند القفل، وكل اللي بعد كده هو الماكينة الموجودة (الحجز · قايمة الانتظار ·
-- الكشف · حارس المكان · الأسامي · الإيميلات) من غير نسخة تانية من أي حارس.
--
-- ===== القاعدة اللي فوق كل حاجة: محدش يوصله «لأ» =====
-- `fn_yalla_lock` **عمرها ما ترمي استثناء على عضو**. اللي مش لاقي مكان — لأي
-- سبب: العدد كمل · نصيب نوعه كمل (0119) · الموقع في صيانة · أي رسالة من
-- `fn_can_book` — بيروح **قايمة الانتظار** ومعاه **أولوية** في النداء الجاي،
-- وبيوصله إن المجموعة اتلمّت وإنه الأول في الانتظار. مفيش ولا كلمة رفض.
--
-- ===== التعديلات على حاجات موجودة — تمانية، كل واحد سطر مشروط بـyalla_id =====
--   1) `sbotat_public`          · سبوطة «يلا» مش بتبان في القايمة العامة
--   2) `fn_sbota_timings`       · مفيش قفل ٣٦ ساعة ومفيش كشف تلقائي (قرار المالك)
--   3) `fn_can_see_place`       · المكان والأسامي بعد «اكشف» بس
--   4) `fn_admit_waitlist`      · «بدّل» في سبوطة «يلا» = حجز مؤكد على طول
--   5) `fn_notify_soon_opened`  · مفيش إيميل «الخروجة اتفتحت»
--   6) `fn_member_tg_announce`  · مفيش إعلان «خروجة جديدة» لكل الأعضاء
--   7) `fn_booking_paid`        · مفيش «مكانك محجوز» (رسالة «يلا» بتقوم بالدور)
--   8) `fn_book_free`           · **ما اتلمستش** — وده مقصود، شوف تحت
--
-- ⚠ التمانية دول متعرّفين في هجرات قديمة (`0097` · `0109` · `0105` · `0121` ·
--   `0117` · `0128` · `0008`). **إعادة لزق أي واحدة منهم بترجّع النسخة
--   القديمة** (الدرس التالت) — و`test_yalla()` (0144) بيمسك كل واحد منهم بصف
--   أحمر لوحده. اتجرّبوا بفخ متعمّد الواحد بعد التاني.
--
-- ⚠ **`fn_book_free` ما اتلمستش عن قصد.** حارسها
--   (`origin is distinct from 'member'`) بيرفض سبوطة «يلا» أصلًا لأن
--   `origin = 'nasbot'` — وده **مطلوب**: من غيره أي حد عنده رقم السبوطة كان
--   يقدر ينادي `fn_book_free` ويدخل المجموعة **من غير ما يختار حاجة**.
--   القعدة في «يلا» من `fn_yalla_seat` الداخلية بس.
--
-- ⚠ محتاج `0141` و`0142` قبله.
-- آمن يتكرر.
-- ============================================================================

-- ===== 1) حارس كلام النداء =====
-- ⚠ **نفس جدول `banned_words`** اللي `fn_guard_sbota_text` بيقرا منه — مش
--   قايمة تانية (الدرس الستاشر). `/admin/settings` ← «الكلمات الممنوعة»
--   بيعدّل الاتنين مع بعض.
create or replace function fn_guard_yalla_text()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  hit  text;
  blob text;
begin
  blob := lower(concat_ws(' ', new.line_ar, new.cost_note_ar));
  if btrim(blob) = '' then return new; end if;

  select w.word into hit from banned_words w
   where blob like '%' || lower(w.word) || '%'
   limit 1;

  if hit is not null then
    raise exception 'الكلمة «%» مش من كلامنا — غيّرها وجرّب تاني', hit
      using errcode = '22023';
  end if;
  return new;
end;
$$;
revoke execute on function fn_guard_yalla_text() from public, anon, authenticated;

drop trigger if exists t_guard_yalla_text on yalla_calls;
create trigger t_guard_yalla_text before insert or update of line_ar, cost_note_ar on yalla_calls
  for each row execute function fn_guard_yalla_text();


-- ===== 2) طابور بوت الأعضاء الموجّه =====
-- ⚠ جدول لوحده مش توسيع لـ`member_tg_outbox`: الطابور القديم **إعلان لكل
--   المتوصّلين** (`unique (sbota_id, kind)`)، وده **رسالة لشخص بعينه**. لو
--   وسّعنا القديم كنا هنغيّر قيد `unique` وقيد `check` ودالة السحب على جدول
--   شغّال على الإنتاج — تلات حاجات مقابل جدول جديد مفيهوش ولا خطر.
create table if not exists member_tg_queue (
  id         bigserial primary key,
  profile_id uuid not null references profiles(id) on delete cascade,
  copy_key   text not null,
  vars       jsonb not null default '{}'::jsonb,
  link_url   text,
  created_at timestamptz not null default now(),
  claimed_at timestamptz,
  tries      int not null default 0,
  sent_at    timestamptz,
  last_error text
);
create index if not exists member_tg_queue_unsent on member_tg_queue (id) where sent_at is null;
alter table member_tg_queue enable row level security;
-- ⚠ مفيش ولا سياسة — مفتاح الخدمة بس (زي `member_tg_outbox` بالظبط).
revoke all on member_tg_queue from public, anon, authenticated;

comment on table member_tg_queue is
  'رسايل بوت الأعضاء الموجّهة لشخص بعينه (مش إعلان عام) — نص من copy_strings ومتغيّراته. (0143)';

create or replace function fn_claim_member_tg_queue(p_limit int default 20)
returns setof member_tg_queue
language sql
security definer
set search_path = public
as $$
  update member_tg_queue q
     set claimed_at = now(), tries = q.tries + 1
   where q.id in (
     select id from member_tg_queue
      where sent_at is null and tries < 5
        and (claimed_at is null or claimed_at < now() - interval '5 minutes')
      order by id
      limit p_limit
      for update skip locked)
  returning q.*
$$;
revoke execute on function fn_claim_member_tg_queue(int) from public, anon, authenticated;
grant  execute on function fn_claim_member_tg_queue(int) to service_role;


-- ===== 3) حاجات صغيرة بيترد عليها من كل حتة =====

/* اسم المنطقة المعروض — من `map_areas` علشان يتعدّل من اللوحة */
create or replace function fn_yalla_area_label(p_key text)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(btrim(label_ar), ''), p_key) from map_areas where key = p_key
$$;
revoke execute on function fn_yalla_area_label(text) from public, anon, authenticated;

/*
 * الاختيار اللي عليه أكتر ناس.
 *
 * ⚠ الترتيب **محدد عن قصد** علشان نفس المدخلات تدّي نفس النتيجة دايمًا:
 *   العدد تنازلي → الميعاد الأقرب → ترتيب المنطقة على الخريطة. من غير ده
 *   التعادل كان بيكسبه صف عشوائي، والقفل مرتين كان ممكن يدّي نتيجتين.
 */
create or replace function fn_yalla_top(p_call uuid)
returns table (slot_id uuid, area_key text, n int)
language sql
stable
security definer
set search_path = public
as $$
  select cs.slot_id, c.area_key, count(*)::int as n
    from yalla_choices c
    join yalla_choice_slots cs
      on cs.call_id = c.call_id and cs.profile_id = c.profile_id
    join yalla_slots s on s.id = cs.slot_id
    join map_areas  a on a.key = c.area_key
   where c.call_id = p_call
   group by cs.slot_id, c.area_key, s.starts_at, a.sort
   order by count(*) desc, s.starts_at, a.sort
$$;
revoke execute on function fn_yalla_top(uuid) from public, anon, authenticated;

/* رسالة للعضو: إيميل + بوت الأعضاء لو موصّل */
create or replace function fn_yalla_tell(
  p_profile uuid, p_key text, p_call uuid, p_sbota uuid,
  p_when timestamptz, p_area text, p_what text, p_link text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into notifications (profile_id, channel, template_key, payload)
  values (p_profile, 'email', p_key,
          jsonb_strip_nulls(jsonb_build_object(
            'sbota_id',   p_sbota,
            'yalla',      p_call,
            'yalla_link', p_link,
            -- ⚠ `when` بيوصل ISO و`notify.ts` هو اللي بينسّقه عربي (نفس
            --   `day` بالظبط) — مفيش تنسيق تواريخ عربي في SQL.
            'when',       to_char(p_when at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SSOF'),
            'area',       p_area,
            'what',       p_what)));

  -- بوت الأعضاء — لو موصّل ومش موقّف الرسايل
  if exists (select 1 from member_telegram m
              where m.profile_id = p_profile and m.chat_id is not null and m.news) then
    insert into member_tg_queue (profile_id, copy_key, vars, link_url)
    values (p_profile, 'tgbot.' || replace(p_key, '_', '.'),
            jsonb_build_object('area', coalesce(p_area, ''), 'what', coalesce(p_what, ''),
                               'when', to_char(p_when at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SSOF')),
            p_link);
  end if;
end;
$$;
revoke execute on function fn_yalla_tell(uuid, text, uuid, uuid, timestamptz, text, text, text)
  from public, anon, authenticated;


-- ===== 4) القعدة والانتظار =====

/*
 * بتقعّد عضو في سبوطة «يلا». بترجّع رقم الحجز، أو **null** لو مفيش مكان —
 * وعمرها ما ترمي استثناء.
 *
 * ⚠ بتنادي `fn_can_book` (مش نسخة منها) وبتتسامح مع **رسالتين بس**:
 *   «السبوطة مش مفتوحة للحجز» (لو اتقلبت `full` في نص القفل) و«الموقع
 *   مقفول…» (الصيانة). الاتنين عن **حالة الموقع أو السبوطة** مش عن الشخص —
 *   ومش منطقي إن وضع الصيانة يحوّل مجموعة كاملة لقايمة انتظار.
 *   أي رسالة تانية (السن · بنات بس · البوابة · الحظر) = مش بيتقعّد.
 *
 * ⚠ العلم `nasbot.trusted_booking` (0121) لازم — `fn_guard_booking_columns`
 *   بيرفض أي حجز مدفوع جاي من نداء المتصفح من غيره.
 */
create or replace function fn_yalla_seat(p_profile uuid, p_sbota uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  s     sbotat;
  v_why text;
  used  int;
  v_id  uuid;
begin
  select * into s from sbotat where id = p_sbota;
  if not found then return null; end if;

  -- حاجز بالفعل؟ رجّع حجزه زي ما هو — القفل مرتين ما يعملش حجزين
  select id into v_id from bookings
   where sbota_id = p_sbota and profile_id = p_profile
     and status in ('paid', 'attended');
  if v_id is not null then return v_id; end if;

  select count(*) into used from bookings
   where sbota_id = p_sbota and status in ('paid', 'attended');
  if used >= s.capacity then return null; end if;

  -- نصيب النوع (0119) — نص ولاد ونص بنات، والزيادة تروح الانتظار والمالك يبدّل
  if fn_gender_block(p_profile, p_sbota) is not null then return null; end if;

  v_why := fn_can_book(p_profile, p_sbota);
  if v_why is not null
     and v_why <> 'السبوطة مش مفتوحة للحجز'
     and v_why not like 'الموقع مقفول%'
     and v_why <> 'أنت حاجز السبوطة دي بالفعل' then
    return null;
  end if;

  perform set_config('nasbot.trusted_booking', 'on', true);
  v_id := fn_booking_slot(p_profile, p_sbota);
  update bookings set status = 'paid', expires_at = null where id = v_id;
  perform set_config('nasbot.trusted_booking', '', true);
  return v_id;
exception when others then
  -- 🔴 القفل عمره ما يقع على عضو. لو حصل أي حاجة، بيروح الانتظار.
  perform set_config('nasbot.trusted_booking', '', true);
  return null;
end;
$$;
revoke execute on function fn_yalla_seat(uuid, uuid) from public, anon, authenticated;

/* قايمة الانتظار + الأولوية في النداء الجاي */
create or replace function fn_yalla_wait(p_profile uuid, p_sbota uuid, p_call uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_sbota is not null then
    insert into waitlist (sbota_id, profile_id, position)
    values (p_sbota, p_profile,
            coalesce((select max(position) from waitlist where sbota_id = p_sbota), 0) + 1)
    on conflict (sbota_id, profile_id) do nothing;
  end if;

  insert into yalla_priority (profile_id, from_call) values (p_profile, p_call)
  on conflict (profile_id, from_call) do nothing;
end;
$$;
revoke execute on function fn_yalla_wait(uuid, uuid, uuid) from public, anon, authenticated;


-- ===== 5) القفل =====
/*
 * بتقفل النداء على الاختيار الكسبان وتعمل السبوطة وتقعّد الناس.
 *
 * `p_reason`: 'full' (العدد كمل) · 'deadline' (المهلة خلصت) · 'manual' (اللوحة).
 *
 * ⚠ **داخلية ومقفولة على الكل** — `fn_yalla_choose` بتناديها لما العدد يكمل
 *   (نداء عضو، فمستحيل تحط فيها فحص صلاحية)، و`job_yalla_due` من الكرون،
 *   و`fn_yalla_lock_now` هي الغلاف اللي عليه الصلاحية للوحة.
 *
 * ⚠ `for update` على صف النداء — اتنين بيختاروا في نفس اللحظة ما يقفلوش
 *   مرتين. ومعاه الفهرس الفريد `sbotat_yalla_one` كشبكة أمان في القاعدة.
 */
create or replace function fn_yalla_lock(p_call uuid, p_reason text default 'manual')
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  c        yalla_calls;
  top      record;
  v_sbota  uuid;
  v_slot   yalla_slots;
  v_area   text;
  v_what   text;
  v_link   text;
  v_slug   text;
  v_seated int := 0;
  v_wait   int := 0;
  v_switch int := 0;
  r        record;
begin
  select * into c from yalla_calls where id = p_call for update;
  if not found then raise exception 'النداء مش موجود' using errcode = '22023'; end if;
  if c.status <> 'open' then
    return jsonb_build_object('ok', false, 'why', 'النداء مقفول خلاص');
  end if;

  select * into top from fn_yalla_top(p_call) limit 1;

  -- ===== مفيش حد، أو تحت الحد الأدنى والمهلة خلصت =====
  if top is null or (p_reason <> 'full' and top.n < c.min_group) then
    update yalla_calls
       set status = 'closed', lock_reason = 'few', locked_at = now(), updated_at = now()
     where id = p_call;

    select coalesce(nullif(btrim(t.name_ar), ''), 'الخروجة'), t.slug
      into v_what, v_slug
      from sbota_templates t where t.id = c.template_id;
    v_link := v_slug || '-' || left(replace(p_call::text, '-', ''), 8);

    -- 🔴 كل اللي شاركوا يعرفوا، **ومعاهم أولوية**. مفيش صياغة رفض.
    for r in select distinct profile_id from yalla_choices where call_id = p_call loop
      perform fn_yalla_wait(r.profile_id, null, p_call);
      perform fn_yalla_tell(r.profile_id, 'yalla_closed', p_call, null,
                            now(), null, v_what, v_link);
    end loop;

    begin
      perform fn_admin_alert('yalla_closed',
        '🫧 نداء «' || v_what || '» اتقفل من غير مجموعة — أعلى اختيار ' ||
        coalesce(top.n, 0) || ' والحد الأدنى ' || c.min_group,
        '/admin/yalla');
    exception when others then null;
    end;

    insert into audit_log (actor_id, action, entity, entity_id, after)
    values (auth.uid(), 'yalla_close', 'yalla_calls', p_call,
            jsonb_build_object('top', coalesce(top.n, 0), 'min', c.min_group));

    return jsonb_build_object('ok', true, 'locked', false, 'reason', 'few',
                              'top', coalesce(top.n, 0));
  end if;

  -- ===== الكسبان =====
  select * into v_slot from yalla_slots where id = top.slot_id;
  v_area := fn_yalla_area_label(top.area_key);
  select coalesce(nullif(btrim(t.name_ar), ''), 'الخروجة'), t.slug
    into v_what, v_slug
    from sbota_templates t where t.id = c.template_id;
  v_link := v_slug || '-' || left(replace(p_call::text, '-', ''), 8);

  -- السبوطة. `price = 0` — مفيش دفع في «يلا» خالص.
  -- ⚠ `area` **null** و`area_label_ar` هو الاسم: `blockKeyFor` خطوته الأولى
  --   المطابقة بكود الـenum، و`other` محجوزة لكتلة الفيوم (الدرس حداشر).
  insert into sbotat (template_id, venue_id, starts_at, ends_at, price, org_fee,
                      capacity, status, girls_only, is_day, is_mystery,
                      origin, area, area_label_ar, yalla_id)
  values (c.template_id, null, v_slot.starts_at,
          v_slot.starts_at + make_interval(mins => v_slot.duration_min),
          0, 0, c.group_size, 'open', false,
          extract(hour from v_slot.starts_at at time zone 'Africa/Cairo') between 5 and 16,
          false, 'nasbot', null, v_area, p_call)
  returning id into v_sbota;

  update yalla_calls
     set status = 'locked', won_slot_id = top.slot_id, won_area = top.area_key,
         locked_at = now(), lock_reason = p_reason, updated_at = now()
   where id = p_call;

  -- ===== القعدة: الأولوية الأول، وبعدها اللي اختار الأول =====
  for r in
    select c2.profile_id,
           exists (select 1 from yalla_priority yp
                    where yp.profile_id = c2.profile_id and yp.used_at is null) as vip
      from yalla_choices c2
      join yalla_choice_slots cs
        on cs.call_id = c2.call_id and cs.profile_id = c2.profile_id
     where c2.call_id = p_call
       and cs.slot_id = top.slot_id
       and c2.area_key = top.area_key
     order by vip desc, c2.created_at, c2.profile_id
  loop
    if fn_yalla_seat(r.profile_id, v_sbota) is not null then
      v_seated := v_seated + 1;
      update yalla_priority set used_at = now()
       where profile_id = r.profile_id and used_at is null;
      perform fn_yalla_tell(r.profile_id, 'yalla_won', p_call, v_sbota,
                            v_slot.starts_at, v_area, v_what, v_link);
    else
      -- 🔴 مفيش مكان (العدد · نصيب النوع · أي سبب) → انتظار وأولوية، مش رفض
      v_wait := v_wait + 1;
      perform fn_yalla_wait(r.profile_id, v_sbota, p_call);
      perform fn_yalla_tell(r.profile_id, 'yalla_waiting', p_call, v_sbota,
                            v_slot.starts_at, v_area, v_what, v_link);
    end if;
  end loop;

  -- ===== اللي اختار حاجة تانية: «تيجي معاهم؟» بدوسة واحدة =====
  for r in
    select c2.profile_id from yalla_choices c2
     where c2.call_id = p_call
       and not exists (
         select 1 from yalla_choice_slots cs
          where cs.call_id = c2.call_id and cs.profile_id = c2.profile_id
            and cs.slot_id = top.slot_id and c2.area_key = top.area_key)
  loop
    v_switch := v_switch + 1;
    perform fn_yalla_tell(r.profile_id, 'yalla_switch', p_call, v_sbota,
                          v_slot.starts_at, v_area, v_what, v_link);
  end loop;

  begin
    perform fn_admin_alert('yalla_locked',
      '🎯 «' || v_what || '» اتلمّت — ' || v_area || chr(10)
      || 'قعدوا: ' || v_seated || ' · انتظار: ' || v_wait || ' · «تيجي معاهم؟»: ' || v_switch || chr(10)
      || 'فاضل: تكتب المكان بالظبط وتدوس «اكشف»',
      '/admin/yalla');
  exception when others then null;
  end;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'yalla_lock', 'yalla_calls', p_call,
          jsonb_build_object('sbota', v_sbota, 'reason', p_reason, 'n', top.n,
                             'seated', v_seated, 'wait', v_wait, 'switch', v_switch));

  return jsonb_build_object('ok', true, 'locked', true, 'sbota', v_sbota,
                            'seated', v_seated, 'wait', v_wait, 'switch', v_switch);
end;
$$;
comment on function fn_yalla_lock(uuid, text) is
  'بتقفل نداء «يلا» على الاختيار الكسبان، وتعمل السبوطة، وتقعّد الناس — والزيادة انتظار بأولوية. عمرها ما ترمي استثناء على عضو. (0143)';
revoke execute on function fn_yalla_lock(uuid, text) from public, anon, authenticated;

/* الغلاف اللي عليه الصلاحية — ده اللي اللوحة بتناديه */
create or replace function fn_yalla_lock_now(p_call uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
begin
  if fn_caller_is_browser() and not fn_has_permission('sbotat.edit') then
    raise exception 'محتاج صلاحية sbotat.edit' using errcode = '42501';
  end if;
  return fn_yalla_lock(p_call, 'manual');
end;
$$;
revoke execute on function fn_yalla_lock_now(uuid) from public, anon;
grant  execute on function fn_yalla_lock_now(uuid) to authenticated, service_role;

/* المهلة خلصت — pg_cron كل ٥ دقايق (WORK_CRON.sql) */
create or replace function job_yalla_due()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  n int := 0;
begin
  for r in select id from yalla_calls
            where status = 'open' and deadline <= now()
            order by deadline
  loop
    begin
      perform fn_yalla_lock(r.id, 'deadline');
      n := n + 1;
    exception when others then null;   -- نداء واحد بايظ ما يوقفش الباقي
    end;
  end loop;
  return n;
end;
$$;
comment on function job_yalla_due() is
  'بتقفل نداءات «يلا» اللي مهلتها خلصت — الأعلى يكسب لو وصل الحد الأدنى، وإلا النداء يتقفل وكل اللي شاركوا يعرفوا. (0143)';
revoke execute on function job_yalla_due() from public, anon, authenticated;


-- ===== 6) المالك بينزّل النداء =====
create or replace function fn_yalla_create(
  p_template   uuid,
  p_line       text,
  p_group_size int,
  p_min_group  int,
  p_deadline   timestamptz,
  p_slots      timestamptz[],
  p_areas      text[],
  p_cost_note  text default null,
  p_duration   int default 120)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
  i    int;
begin
  if fn_caller_is_browser() and not fn_has_permission('sbotat.edit') then
    raise exception 'محتاج صلاحية sbotat.edit' using errcode = '42501';
  end if;

  if not exists (select 1 from sbota_templates where id = p_template) then
    raise exception 'النشاط ده مش موجود' using errcode = '22023';
  end if;
  if coalesce(btrim(p_line), '') = '' then
    raise exception 'اكتب سطر النداء' using errcode = '22023';
  end if;
  if p_group_size < 2 then
    raise exception 'عدد المجموعة لازم يكون اتنين على الأقل' using errcode = '22023';
  end if;
  if p_min_group < 2 or p_min_group > p_group_size then
    raise exception 'الحد الأدنى لازم يكون بين اتنين وعدد المجموعة' using errcode = '22023';
  end if;
  if p_deadline <= now() then
    raise exception 'مهلة القفل لازم تكون في المستقبل' using errcode = '22023';
  end if;
  if p_slots is null or array_length(p_slots, 1) is null then
    raise exception 'حط ميعاد واحد على الأقل' using errcode = '22023';
  end if;
  if p_areas is null or array_length(p_areas, 1) is null then
    raise exception 'حط منطقة واحدة على الأقل' using errcode = '22023';
  end if;

  insert into yalla_calls (template_id, line_ar, group_size, min_group,
                           cost_note_ar, deadline, created_by)
  values (p_template, btrim(p_line), p_group_size, p_min_group,
          nullif(btrim(p_cost_note), ''), p_deadline, auth.uid())
  returning id into v_id;

  for i in 1 .. array_length(p_slots, 1) loop
    -- ⚠ ميعاد عدّى مالوش معنى في نداء جديد
    if p_slots[i] > now() then
      insert into yalla_slots (call_id, starts_at, duration_min, sort)
      values (v_id, p_slots[i], greatest(p_duration, 30), i)
      on conflict (call_id, starts_at) do nothing;
    end if;
  end loop;
  if not exists (select 1 from yalla_slots where call_id = v_id) then
    raise exception 'كل المواعيد اللي حطيتها عدّت' using errcode = '22023';
  end if;

  for i in 1 .. array_length(p_areas, 1) loop
    -- ⚠ المنطقة لازم تكون من `map_areas` النشطة — القايمة الموجودة (0141)
    if exists (select 1 from map_areas where key = p_areas[i] and is_active) then
      insert into yalla_call_areas (call_id, area_key, sort)
      values (v_id, p_areas[i], i)
      on conflict do nothing;
    end if;
  end loop;
  if not exists (select 1 from yalla_call_areas where call_id = v_id) then
    raise exception 'مفيش ولا منطقة معروفة في اللي حطيته' using errcode = '22023';
  end if;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'yalla_create', 'yalla_calls', v_id,
          jsonb_build_object('group_size', p_group_size, 'min', p_min_group));

  return v_id;
end;
$$;
comment on function fn_yalla_create(uuid, text, int, int, timestamptz, timestamptz[], text[], text, int) is
  'نداء «يلا» جديد — النداء ومواعيده ومناطقه بيتكتبوا مع بعض أو مايتكتبوش. بصلاحية sbotat.edit. (0143)';
revoke execute on function
  fn_yalla_create(uuid, text, int, int, timestamptz, timestamptz[], text[], text, int)
  from public, anon;
grant execute on function
  fn_yalla_create(uuid, text, int, int, timestamptz, timestamptz[], text[], text, int)
  to authenticated;


-- ===== 7) العضو بيختار =====
/*
 * ⚠ **الاختيار تاني بيعدّل مش بيكرر.** الصف مفتاحه `(call_id, profile_id)`،
 *   والمواعيد بتتمسح وتتكتب من جديد — فالتغيير بيتحسب صح والعدد ما بيتضاعفش.
 */
create or replace function fn_yalla_choose(
  p_call uuid, p_slots uuid[], p_area text, p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  c     yalla_calls;
  n     int;
  i     int;
  v_lock jsonb := null;
  v_my  record;
begin
  -- 🔴 الدرس الخمسة وعشرين: الفحص الصريح هو الحارس، والمقارنة لأ.
  if v_uid is null then
    raise exception 'لازم تسجّل دخول الأول' using errcode = '42501';
  end if;
  if not exists (select 1 from profiles
                  where id = v_uid and deleted_at is null and banned_at is null) then
    raise exception 'الحساب مش موجود' using errcode = '42501';
  end if;

  select * into c from yalla_calls where id = p_call for update;
  if not found then raise exception 'النداء مش موجود' using errcode = '22023'; end if;
  if c.status <> 'open' then
    raise exception 'النداء ده اتقفل خلاص' using errcode = '22023';
  end if;
  if now() > c.deadline then
    raise exception 'النداء ده اتقفل خلاص' using errcode = '22023';
  end if;
  if not exists (select 1 from yalla_call_areas
                  where call_id = p_call and area_key = p_area) then
    raise exception 'المنطقة دي مش من المعروضة' using errcode = '22023';
  end if;
  if p_slots is null or array_length(p_slots, 1) is null then
    raise exception 'اختار ميعاد واحد على الأقل' using errcode = '22023';
  end if;

  insert into yalla_choices (call_id, profile_id, area_key, venue_note)
  values (p_call, v_uid, p_area, nullif(btrim(p_note), ''))
  on conflict (call_id, profile_id) do update
    set area_key   = excluded.area_key,
        venue_note = coalesce(excluded.venue_note, yalla_choices.venue_note),
        updated_at = now();

  delete from yalla_choice_slots where call_id = p_call and profile_id = v_uid;
  for i in 1 .. array_length(p_slots, 1) loop
    -- الميعاد لازم يكون من مواعيد النداء ده بالظبط
    if exists (select 1 from yalla_slots where id = p_slots[i] and call_id = p_call) then
      insert into yalla_choice_slots (call_id, profile_id, slot_id)
      values (p_call, v_uid, p_slots[i])
      on conflict do nothing;
    end if;
  end loop;
  if not exists (select 1 from yalla_choice_slots
                  where call_id = p_call and profile_id = v_uid) then
    raise exception 'اختار ميعاد واحد على الأقل' using errcode = '22023';
  end if;

  -- أحسن اختيار من اللي اخترته — ده اللي بيتعرض «إنت واحد من X»
  select t.n, s.starts_at, fn_yalla_area_label(t.area_key) as area
    into v_my
    from fn_yalla_top(p_call) t
    join yalla_slots s on s.id = t.slot_id
   where t.area_key = (select area_key from yalla_choices
                        where call_id = p_call and profile_id = v_uid)
     and exists (select 1 from yalla_choice_slots cs
                  where cs.call_id = p_call and cs.profile_id = v_uid
                    and cs.slot_id = t.slot_id)
   order by t.n desc, s.starts_at
   limit 1;

  -- 🔴 أول (ميعاد + منطقة) يوصل عدد المجموعة يكسب والنداء يقفل عليه
  select max(t.n) into n from fn_yalla_top(p_call) t;
  if n >= c.group_size then
    v_lock := fn_yalla_lock(p_call, 'full');
  end if;

  return jsonb_build_object(
    'ok', true,
    'n', coalesce(v_my.n, 1),
    'when', v_my.starts_at,
    'area', v_my.area,
    'locked', coalesce((v_lock -> 'locked')::boolean, false));
end;
$$;
comment on function fn_yalla_choose(uuid, uuid[], text, text) is
  'العضو بيختار مواعيد ومنطقة في نداء «يلا». الاختيار تاني بيعدّل مش بيكرر، ولو العدد كمل النداء بيقفل. (0143)';
revoke execute on function fn_yalla_choose(uuid, uuid[], text, text) from public, anon;
grant  execute on function fn_yalla_choose(uuid, uuid[], text, text) to authenticated;

/* «مش جاي» — بيشيل الاختيار */
create or replace function fn_yalla_unchoose(p_call uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'لازم تسجّل دخول الأول' using errcode = '42501';
  end if;
  if exists (select 1 from yalla_calls where id = p_call and status <> 'open') then
    raise exception 'النداء ده اتقفل خلاص' using errcode = '22023';
  end if;
  delete from yalla_choices where call_id = p_call and profile_id = v_uid;
  return true;
end;
$$;
revoke execute on function fn_yalla_unchoose(uuid) from public, anon;
grant  execute on function fn_yalla_unchoose(uuid) to authenticated;

/*
 * اختياري أنا.
 *
 * ⚠ **صف واحد، وبتاعي، ومفيش parameter لشخص تاني** — نفس قاعدة
 *   `fn_case_my_role` (§٥.٥). الجداول نفسها مفيهاش ولا سياسة قراية.
 */
create or replace function fn_my_yalla_choice(p_call uuid)
returns table (area_key text, slot_ids uuid[], venue_note text)
language sql
stable
security definer
set search_path = public
as $$
  select c.area_key,
         coalesce((select array_agg(cs.slot_id) from yalla_choice_slots cs
                    where cs.call_id = c.call_id and cs.profile_id = c.profile_id),
                  '{}'::uuid[]),
         c.venue_note
    from yalla_choices c
   where c.call_id = p_call and c.profile_id = auth.uid()
     and auth.uid() is not null
$$;
revoke execute on function fn_my_yalla_choice(uuid) from public, anon;
grant  execute on function fn_my_yalla_choice(uuid) to authenticated;


-- ===== 8) الفيد — أعداد بس =====
/*
 * 🔴 **الدالة الوحيدة في «يلا» المفتوحة للمجهول.** وبترجّع:
 *   سطر المالك · النشاط وصورته · الحالة · عدد المجموعة · **أعداد** الاتجاه ·
 *   المواعيد والمناطق المعروضة · واختياري أنا لو داخل.
 *
 * ⚠ **مفيش فيها مين اختار إيه**، ومفيش `venue_note` (اللي العضو كتبه) —
 *   ده للوحة بس من `fn_yalla_admin`. ولو زاد عمود هنا يسرّب هوية، الصف
 *   الأحمر في `test_yalla()` بيقع.
 *
 * ⚠ بتحترم مفتاح الميزة: مقفول = **ولا صف**، فالصفحة والمدخل بيختفوا مع بعض.
 */
create or replace function fn_yalla_feed(p_limit int default 20, p_call uuid default null)
returns table (
  call_id      uuid,
  slug         text,
  created_at   timestamptz,
  status       text,
  line_ar      text,
  what_ar      text,
  photo        text,
  photo_alt_ar text,
  cost_note_ar text,
  group_size   int,
  deadline     timestamptz,
  total_n      int,
  top_n        int,
  top_when     timestamptz,
  top_area     text,
  won_when     timestamptz,
  won_area     text,
  slots        jsonb,
  areas        jsonb,
  my_slots     uuid[],
  my_area      text,
  my_n         int,
  my_when      timestamptz,
  my_area_label text,
  my_booking   uuid,
  my_waiting   boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with cfg as (
    select coalesce((select yalla_card_hours from settings limit 1), 3) as card_hours
  ),
  live as (
    select c.*,
           (select s.starts_at from yalla_slots s where s.id = c.won_slot_id) as won_at,
           (select sb.id from sbotat sb where sb.yalla_id = c.id)             as sbota_id
      from yalla_calls c
     where coalesce((select f.is_on from feature_flags f where f.key = 'yalla'), false)
       and (p_call is not null and c.id = p_call
            or p_call is null and (
              -- مفتوح: لحد المهلة ومعاها فترة سماح
              c.status = 'open' and now() < c.deadline + make_interval(hours => (select card_hours from cfg))
              -- كمل: لحد ميعاد الخروجة ومعاه نفس الفترة، وبعدها بيختفي لوحده
              or c.status = 'locked'
                 and now() < (select s.starts_at from yalla_slots s where s.id = c.won_slot_id)
                             + make_interval(hours => (select card_hours from cfg))))
  ),
  top as (
    select l.id as cid, t.slot_id, t.area_key, t.n
      from live l
      cross join lateral (select * from fn_yalla_top(l.id) limit 1) t
  ),
  mine as (
    select l.id as cid, t.n, s.starts_at, t.area_key
      from live l
      join yalla_choices mc on mc.call_id = l.id and mc.profile_id = auth.uid()
      cross join lateral (
        select t2.* from fn_yalla_top(l.id) t2
         where t2.area_key = mc.area_key
           and exists (select 1 from yalla_choice_slots cs
                        where cs.call_id = l.id and cs.profile_id = mc.profile_id
                          and cs.slot_id = t2.slot_id)
         order by t2.n desc
         limit 1) t
      join yalla_slots s on s.id = t.slot_id
     where auth.uid() is not null
  )
  select
    l.id, tp.slug, l.created_at, l.status, l.line_ar,
    coalesce(nullif(btrim(tp.name_ar), ''), 'الخروجة'),
    case when tp.hero_photos is not null and array_length(tp.hero_photos, 1) > 0
         then tp.hero_photos[1] end,
    tp.photo_alt_ar,
    l.cost_note_ar, l.group_size, l.deadline,
    (select count(distinct profile_id)::int from yalla_choices where call_id = l.id),
    (select n from top where top.cid = l.id),
    (select s.starts_at from yalla_slots s join top on top.slot_id = s.id where top.cid = l.id),
    (select fn_yalla_area_label(top.area_key) from top where top.cid = l.id),
    l.won_at,
    case when l.won_area is not null then fn_yalla_area_label(l.won_area) end,
    (select coalesce(jsonb_agg(jsonb_build_object('id', s.id, 'at', s.starts_at)
                               order by s.sort, s.starts_at), '[]'::jsonb)
       from yalla_slots s where s.call_id = l.id),
    (select coalesce(jsonb_agg(jsonb_build_object('key', a.area_key,
                                                  'label', fn_yalla_area_label(a.area_key))
                               order by a.sort), '[]'::jsonb)
       from yalla_call_areas a where a.call_id = l.id),
    (select coalesce(array_agg(cs.slot_id), '{}'::uuid[]) from yalla_choice_slots cs
      where cs.call_id = l.id and cs.profile_id = auth.uid() and auth.uid() is not null),
    (select mc.area_key from yalla_choices mc
      where mc.call_id = l.id and mc.profile_id = auth.uid() and auth.uid() is not null),
    (select n from mine where mine.cid = l.id),
    (select starts_at from mine where mine.cid = l.id),
    (select fn_yalla_area_label(area_key) from mine where mine.cid = l.id),
    (select b.id from bookings b
      where b.sbota_id = l.sbota_id and b.profile_id = auth.uid()
        and b.status in ('paid', 'attended') and auth.uid() is not null),
    exists (select 1 from waitlist w
             where w.sbota_id = l.sbota_id and w.profile_id = auth.uid()
               and auth.uid() is not null)
  from live l
  join sbota_templates tp on tp.id = l.template_id
  order by l.created_at desc
  limit greatest(p_limit, 1)
$$;
comment on function fn_yalla_feed(int, uuid) is
  'فيد «يلا» للعامة — أعداد بس. مفيش مين اختار إيه، ومفيش اسم المكان اللي العضو كتبه. بتحترم مفتاح yalla. (0143)';
grant execute on function fn_yalla_feed(int, uuid) to anon, authenticated;


-- ===== 9) «تيجي معاهم؟» =====
create or replace function fn_yalla_join_winner(p_call uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid   uuid := auth.uid();
  c       yalla_calls;
  v_sbota uuid;
  v_id    uuid;
  v_slot  timestamptz;
  v_area  text;
  v_what  text;
  v_link  text;
  v_slug  text;
begin
  if v_uid is null then
    raise exception 'لازم تسجّل دخول الأول' using errcode = '42501';
  end if;

  select * into c from yalla_calls where id = p_call;
  if not found or c.status <> 'locked' then
    raise exception 'النداء ده مش مقفول على ميعاد' using errcode = '22023';
  end if;

  -- ⚠ لازم يكون شارك في النداء — من غير الشرط ده أي حد عنده اللينك يدخل
  --   المجموعة من غير ما يختار حاجة.
  if not exists (select 1 from yalla_choices where call_id = p_call and profile_id = v_uid) then
    raise exception 'ده نداء انت مشاركش فيه' using errcode = '42501';
  end if;

  select id into v_sbota from sbotat where yalla_id = p_call;
  if v_sbota is null then
    raise exception 'المجموعة مش موجودة' using errcode = '22023';
  end if;

  select s.starts_at into v_slot from yalla_slots s where s.id = c.won_slot_id;
  v_area := fn_yalla_area_label(c.won_area);
  select coalesce(nullif(btrim(t.name_ar), ''), 'الخروجة'), t.slug
    into v_what, v_slug from sbota_templates t where t.id = c.template_id;
  v_link := v_slug || '-' || left(replace(p_call::text, '-', ''), 8);

  v_id := fn_yalla_seat(v_uid, v_sbota);
  if v_id is not null then
    update yalla_priority set used_at = now() where profile_id = v_uid and used_at is null;
    perform fn_yalla_tell(v_uid, 'yalla_won', p_call, v_sbota, v_slot, v_area, v_what, v_link);
    return jsonb_build_object('ok', true, 'seated', true, 'booking', v_id);
  end if;

  -- 🔴 مفيش مكان = انتظار وأولوية، مش «لأ»
  perform fn_yalla_wait(v_uid, v_sbota, p_call);
  return jsonb_build_object('ok', true, 'seated', false, 'waiting', true);
end;
$$;
comment on function fn_yalla_join_winner(uuid) is
  '«تيجي معاهم؟» — بدوسة واحدة: مكان لو فيه، وإلا قايمة الانتظار وأولوية. للي شارك في النداء بس. (0143)';
revoke execute on function fn_yalla_join_winner(uuid) from public, anon;
grant  execute on function fn_yalla_join_winner(uuid) to authenticated;


-- ===== 10) اللوحة =====
/* المجموعة وقايمة الانتظار واللي قال حاجة تانية — وأسامي الأماكن المكتوبة */
create or replace function fn_yalla_admin(p_call uuid)
returns table (
  profile_id uuid, first_name text, gender gender_t,
  state text,          -- 'in' المجموعة · 'wait' الانتظار · 'other' اختار حاجة تانية
  booking_id uuid, waitlist_id uuid,
  area_label text, slot_count int, venue_note text, chose_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare v_sbota uuid;
begin
  if not fn_has_permission('sbotat.view') then
    raise exception 'محتاج صلاحية sbotat.view' using errcode = '42501';
  end if;
  select id into v_sbota from sbotat where yalla_id = p_call;

  return query
  select p.id, p.first_name, p.gender,
         case when b.id is not null then 'in'
              when w.id is not null then 'wait'
              else 'other' end,
         b.id, w.id,
         fn_yalla_area_label(c.area_key),
         (select count(*)::int from yalla_choice_slots cs
           where cs.call_id = c.call_id and cs.profile_id = c.profile_id),
         c.venue_note, c.created_at
    from yalla_choices c
    join profiles p on p.id = c.profile_id
    left join bookings b on b.sbota_id = v_sbota and b.profile_id = c.profile_id
                        and b.status in ('paid', 'attended')
    left join waitlist w on w.sbota_id = v_sbota and w.profile_id = c.profile_id
   order by case when b.id is not null then 0 when w.id is not null then 1 else 2 end,
            w.position nulls last, c.created_at;
end;
$$;
comment on function fn_yalla_admin(uuid) is
  'للوحة: مين في المجموعة ومين في الانتظار ومين اختار حاجة تانية، ومعاهم أسامي الأماكن اللي الناس كتبتها. بصلاحية sbotat.view. (0143)';
revoke execute on function fn_yalla_admin(uuid) from public, anon;
grant  execute on function fn_yalla_admin(uuid) to authenticated;

/*
 * الأعداد لكل (ميعاد × منطقة) — **للوحة**.
 *
 * ⚠ غلاف على `fn_yalla_top` الداخلية، مش نسخة منها (الدرس الستاشر).
 *   `fn_yalla_top` مقفولة على الكل عن قصد، والعامة بتشوف **الأعلى بس** من
 *   `fn_yalla_feed`.
 *
 * ⚠ وده كان باج حقيقي: صفحة اللوحة كانت بتنادي `fn_yalla_top` على طول وهي
 *   مرفوضة لـ`authenticated` — يعني «الأعداد» كانت هتطلع فاضية أول مرة
 *   المالك يفتح الصفحة، **من غير ولا رسالة خطأ**. اتكشف بمراجعة صلاحيات كل
 *   دالة الواجهة بتناديها قبل التسليم، مش بالتشغيل.
 */
create or replace function fn_yalla_counts(p_call uuid)
returns table (slot_id uuid, starts_at timestamptz, area_key text, area_label text, n int)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not fn_has_permission('sbotat.view') then
    raise exception 'محتاج صلاحية sbotat.view' using errcode = '42501';
  end if;
  return query
    select t.slot_id, s.starts_at, t.area_key, fn_yalla_area_label(t.area_key), t.n
      from fn_yalla_top(p_call) t
      join yalla_slots s on s.id = t.slot_id;
end;
$$;
comment on function fn_yalla_counts(uuid) is
  'الأعداد لكل (ميعاد × منطقة) للوحة — غلاف على fn_yalla_top بصلاحية sbotat.view. (0143)';
revoke execute on function fn_yalla_counts(uuid) from public, anon;
grant  execute on function fn_yalla_counts(uuid) to authenticated;


/*
 * «بدّل»: من المجموعة لقايمة الانتظار — علشان المالك يظبّط نص ولاد ونص بنات.
 * الطريق التاني (انتظار ← مجموعة) هو `fn_admit_waitlist` الموجودة.
 *
 * ⚠ مش بتنادي `fn_cancel_booking`: دي بتحسب استرداد وتبعت لأول واحد في
 *   القايمة — واحنا سعرنا صفر والمالك بيظبّط بإيده دلوقتي، فإشعار «فضي
 *   مكان» في نص التظبيط بيلغبط الناس.
 * ⚠ وبيروح **أول القايمة** (`position = 0`) — كان في المجموعة فعلًا.
 */
create or replace function fn_yalla_bench(p_booking uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b bookings;
  s sbotat;
  c uuid;
begin
  if fn_caller_is_browser() and not fn_has_permission('bookings.edit') then
    raise exception 'محتاج صلاحية bookings.edit' using errcode = '42501';
  end if;

  select * into b from bookings where id = p_booking;
  if not found then raise exception 'الحجز مش موجود' using errcode = '22023'; end if;
  select * into s from sbotat where id = b.sbota_id;
  if s.yalla_id is null then
    raise exception 'ده مش حجز في نداء «يلا»' using errcode = '22023';
  end if;
  if b.status <> 'paid' then
    raise exception 'الحجز ده مش في المجموعة' using errcode = '22023';
  end if;
  c := s.yalla_id;

  perform set_config('nasbot.trusted_booking', 'on', true);
  update bookings
     set status = 'cancelled_by_us', cancelled_at = now(),
         cancel_reason = 'تظبيط المجموعة من اللوحة', refund_kind = 'none'
   where id = p_booking;
  perform set_config('nasbot.trusted_booking', '', true);

  insert into waitlist (sbota_id, profile_id, position)
  values (s.id, b.profile_id, 0)
  on conflict (sbota_id, profile_id) do update set position = 0, notified_at = null;

  insert into yalla_priority (profile_id, from_call) values (b.profile_id, c)
  on conflict (profile_id, from_call) do nothing;

  update sbotat set status = 'open' where id = s.id and status = 'full';

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'yalla_bench', 'bookings', p_booking,
          jsonb_build_object('profile_id', b.profile_id, 'sbota', s.id));

  return jsonb_build_object('ok', true);
end;
$$;
comment on function fn_yalla_bench(uuid) is
  '«بدّل»: بينقل حد من مجموعة «يلا» لأول قايمة الانتظار (ومعاه أولوية) علشان المالك يظبّط نص ولاد ونص بنات. (0143)';
revoke execute on function fn_yalla_bench(uuid) from public, anon;
grant  execute on function fn_yalla_bench(uuid) to authenticated;

/*
 * «اكشف».
 *
 * ⚠ المكان بالظبط **إجباري** — قرار المالك (مكان عام). الدالة بترفض من
 *   غيره، فمستحيل مجموعة تتكشف وهي ما تعرفش هي رايحة فين.
 * ⚠ وبتنادي `fn_reveal` الموجودة: هي اللي بتعمل المجموعة والشات وبتبعت
 *   «مجموعتك ظهرت». مش نسخة تانية منها (الدرس الستاشر).
 */
create or replace function fn_yalla_reveal(p_call uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  s     sbotat;
  v_n   int;
  r     record;
  v_what text;
begin
  if fn_caller_is_browser() and not fn_has_permission('matching.approve') then
    raise exception 'الكشف محتاج صلاحية matching.approve' using errcode = '42501';
  end if;

  select * into s from sbotat where yalla_id = p_call;
  if not found then raise exception 'المجموعة مش موجودة' using errcode = '22023'; end if;
  if coalesce(btrim(s.venue_name_ar), '') = '' or coalesce(btrim(s.address_ar), '') = '' then
    raise exception 'اكتب المكان بالظبط (الاسم والعنوان) قبل الكشف' using errcode = '22023';
  end if;
  if s.reveal_at is not null then
    return jsonb_build_object('ok', false, 'why', 'المجموعة اتكشفت خلاص');
  end if;

  update sbotat set reveal_at = now(), chat_opens_at = now() where id = s.id;
  v_n := fn_reveal(s.id);

  -- بوت الأعضاء: المجموعة بس (الإيميل بيتبعت من `fn_reveal`)
  select coalesce(nullif(btrim(t.name_ar), ''), 'الخروجة') into v_what
    from sbota_templates t where t.id = s.template_id;
  for r in select b.profile_id from bookings b
            where b.sbota_id = s.id and b.status in ('paid', 'attended') loop
    if exists (select 1 from member_telegram m
                where m.profile_id = r.profile_id and m.chat_id is not null and m.news) then
      insert into member_tg_queue (profile_id, copy_key, vars, link_url)
      select r.profile_id, 'tgbot.yalla.reveal',
             jsonb_build_object('what', v_what,
                                'when', to_char(s.starts_at at time zone 'UTC',
                                                'YYYY-MM-DD"T"HH24:MI:SSOF'),
                                'venue', coalesce(s.venue_name_ar, '')),
             'booking:' || b.id
        from bookings b
       where b.sbota_id = s.id and b.profile_id = r.profile_id
         and b.status in ('paid', 'attended');
    end if;
  end loop;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'yalla_reveal', 'sbotat', s.id, jsonb_build_object('groups', v_n));

  return jsonb_build_object('ok', true, 'groups', v_n, 'sbota', s.id);
end;
$$;
comment on function fn_yalla_reveal(uuid) is
  '«اكشف» نداء «يلا»: بترفض لو المكان بالظبط مش مكتوب، وبعدين بتنادي fn_reveal الموجودة. (0143)';
revoke execute on function fn_yalla_reveal(uuid) from public, anon;
grant  execute on function fn_yalla_reveal(uuid) to authenticated;


-- ===== 11) تليجرام المالك مع كل اختيار =====
create or replace function fn_alert_yalla_choice()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  c    yalla_calls;
  n    int;
  what text;
begin
  begin
    select * into c from yalla_calls where id = new.call_id;
    -- بيانات الاختبار ما بتوصلش المالك (0122) — والنداء اللي سطره `[اختبار]`
    --
    -- ⚠ شرط النداء لازم يحترم علم `nasbot.alerts_test` زي
    --   `fn_alert_is_fixture` بالظبط. أول نسخة كانت بتمنع `[اختبار]` مهما
    --   كان، فالاختبار اللي بيثبت إن الإشعار بيشتغل كان **بيقع أحمر على كود
    --   سليم** — الفلتر كان بيخفي نفسه.
    if fn_alert_is_fixture(new.profile_id, null)
       or (coalesce(current_setting('nasbot.alerts_test', true), '') <> 'on'
           and c.line_ar like '[اختبار]%') then
      return null;
    end if;
    select count(distinct profile_id) into n from yalla_choices where call_id = new.call_id;
    select coalesce(nullif(btrim(t.name_ar), ''), 'الخروجة') into what
      from sbota_templates t where t.id = c.template_id;
    perform fn_admin_alert('yalla_want',
      '🙋 ' || fn_alert_who(new.profile_id) || ' قال جاي في «' || what || '»' || chr(10)
      || 'اختار ' || fn_yalla_area_label(new.area_key)
      || ' · إجمالي اللي قالوا: ' || n || ' من ' || c.group_size,
      '/admin/yalla');
  exception when others then null;   -- الإشعار عمره ما يوقف اختيار
  end;
  return null;
end;
$$;
revoke execute on function fn_alert_yalla_choice() from public, anon, authenticated;

drop trigger if exists t_alert_yalla_choice on yalla_choices;
create trigger t_alert_yalla_choice after insert or update of area_key on yalla_choices
  for each row execute function fn_alert_yalla_choice();


-- ============================================================================
-- التعديلات التمانية على الحاجات الموجودة
-- ⚠ كل واحد منهم سطر مشروط بـ`yalla_id`، والسبوطات العادية والمقترحة
--   ما بيتلمسوش. وكل واحد وراه صف في `test_yalla()` بيقع أحمر لو هجرته
--   القديمة اتلزقت تاني (الدرس التالت).
-- ============================================================================

-- ===== (1) الفيو العام — سبوطة «يلا» مش بتبان في القايمة =====
-- ⚠ من غير السطر ده الكارت بيبان في الرئيسية والخريطة و`/one` و«مين جاي؟»،
--   **وأي حد يقدر يحجز فيه من غير ما يختار** — والمجموعة بتبقى ناس غير اللي
--   قالوا جايين. ده أهم سطر في الملف.
-- ⚠ منقول بالحرف من `0127` + شرط واحد. إعادة لزق `0127` أو `0097` بترجّع
--   النسخة اللي من غيره.
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
where s.status = any (array['proposed','open','full','locked','running']::sbota_status_t[])
  and s.yalla_id is null;   -- (0143)

grant select on sbotat_public to anon, authenticated;


-- ===== (2) المواعيد — مفيش قفل ٣٦ ساعة ومفيش كشف تلقائي =====
-- قرار المالك (٢٠٢٦-١١-١٥): التنتين **ما بيتطبقوش على «يلا»**. الحجز في
-- «يلا» مفتوح لحد ميعاد الخروجة، والكشف بإيد المالك لما يثبّت المكان.
-- ⚠ منقول بالحرف من `0109` + بلوك واحد في الأول.
create or replace function fn_sbota_timings()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  v_hour         int;
  v_chat_open_h  int;
  v_chat_close_h int;
  prev_day_cut   timestamptz;
begin
  select reveal_hour_cairo, chat_open_hours, chat_close_hours
    into v_hour, v_chat_open_h, v_chat_close_h
    from settings
   limit 1;

  v_hour         := coalesce(v_hour, 20);
  v_chat_open_h  := coalesce(v_chat_open_h, 48);
  v_chat_close_h := coalesce(v_chat_close_h, 48);

  -- (0143) «يلا»: الحجز مش بيتقفل قبلها بـ٣٦ ساعة، والكشف مش تلقائي —
  -- `fn_yalla_reveal` هي اللي بتحط `reveal_at` لما المالك يثبّت المكان.
  -- و`job_reveal_due` بتشتغل على `reveal_at <= now()` فمش هتلمسها وهي null.
  if new.yalla_id is not null then
    new.booking_closes_at := null;
    new.reveal_at         := null;
    new.chat_opens_at     := null;
    new.chat_closes_at    := new.ends_at + make_interval(hours => v_chat_close_h);
    return new;
  end if;

  new.booking_closes_at := new.starts_at - interval '36 hours';

  prev_day_cut := ((new.starts_at at time zone 'Africa/Cairo')::date
                   - interval '1 day'
                   + make_interval(hours => v_hour))
                  at time zone 'Africa/Cairo';
  new.reveal_at := least(new.starts_at - interval '24 hours', prev_day_cut);

  new.chat_opens_at  := greatest(
                          new.reveal_at,
                          new.starts_at - make_interval(hours => v_chat_open_h)
                        );
  new.chat_closes_at := new.ends_at + make_interval(hours => v_chat_close_h);
  return new;
end;
$$;
comment on function fn_sbota_timings() is
  'بيحسب booking_closes_at و reveal_at و chat_opens_at و chat_closes_at — الساعات من settings (0109)، والشات مستحيل يفتح قبل الكشف. وسبوطة «يلا» مفيهاش قفل حجز ولا كشف تلقائي (0143).';


-- ===== (3) حارس المكان — «يلا» زي خروجة العضو بالظبط =====
-- ⚠ منقول بالحرف من `0105` + `or v_s.yalla_id is not null` في شرط واحد.
--   الحارس ده بينادوه `fn_sbota_address` و`fn_sbota_arrival` و`fn_safety_view`
--   و`fn_group_members` — فالمكان **والأسامي** بيتقفلوا مع بعض من سطر واحد.
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

  -- خروجة عضو، أو نداء «يلا» (0143): حجز نشط **و** بعد الكشف. مش أول ما
  -- يحجز — علشان حد ما يحجزش ويلغي ويفضل عارف المكان. وفي «يلا» الكشف
  -- بإيد المالك بعد ما يثبّت المكان، فقبل كده `reveal_at` null ومحدش بيشوف.
  if (v_s.origin = 'member' or v_s.yalla_id is not null)
     and (v_s.reveal_at is null or now() < v_s.reveal_at) then
    return false;
  end if;

  return exists (
    select 1 from bookings b
     where b.sbota_id = s_id and b.profile_id = p_id
       and b.status in ('paid','attended')
  );
end $$;
comment on function fn_can_see_place(uuid, uuid) is
  'هل الشخص ده من حقه يشوف عنوان السبوطة؟ حجز مدفوع، وبعد الكشف لو خروجة عضو أو نداء «يلا» (0143).';
revoke execute on function fn_can_see_place(uuid, uuid) from public, anon, authenticated;


-- ===== (4) «دخّله» من قايمة الانتظار — «يلا» مجانية فتتأكد على طول =====
-- ⚠ منقول بالحرف من `0121` + `or s.yalla_id is not null` في سطر `v_free`.
--   من غيره «بدّل» كان بيعمل حجز «مستني الدفع» لحاجة **مفيهاش دفع** —
--   نفس باج `0086` اللي `0121` اتعمل علشانه.
create or replace function fn_admit_waitlist(p_waitlist_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  w      waitlist;
  s      sbotat;
  v_why  text;
  v_used int;
  v_hold int;
  v_free boolean;
  v_id   uuid;
begin
  if fn_caller_is_browser() and not fn_has_permission('bookings.edit') then
    raise exception 'محتاج صلاحية bookings.edit' using errcode = '42501';
  end if;

  select * into w from waitlist where id = p_waitlist_id;
  if not found then raise exception 'الشخص ده مش في قايمة الانتظار' using errcode = '22023'; end if;

  select * into s from sbotat where id = w.sbota_id for update;
  if not found then raise exception 'السبوطة دي مش موجودة' using errcode = '22023'; end if;

  select count(*) into v_used from bookings b
   where b.sbota_id = s.id and b.profile_id <> w.profile_id
     and (b.status in ('paid', 'attended')
          or (b.status = 'pending_payment'
              and (b.expires_at is null or b.expires_at > now())));
  if v_used >= s.capacity then
    raise exception 'مفيش مكان فاضي في السبوطة دي دلوقتي' using errcode = '22023';
  end if;

  v_why := fn_gender_block(w.profile_id, s.id);
  if v_why is not null then raise exception '%', v_why using errcode = '22023'; end if;

  v_why := fn_can_book(w.profile_id, s.id);
  if v_why is not null
     and not (v_why = 'السبوطة مش مفتوحة للحجز' and s.status = 'full') then
    raise exception '%', v_why using errcode = '22023';
  end if;

  -- (0143) نداء «يلا» مجاني زي خروجة العضو — الحجز بيتأكد على طول
  v_free := (s.origin = 'member' or s.yalla_id is not null) and s.price = 0;

  perform set_config('nasbot.trusted_booking', 'on', true);
  v_id := fn_booking_slot(w.profile_id, s.id);
  if v_free then
    update bookings set status = 'paid', expires_at = null where id = v_id;
  else
    select coalesce(waitlist_hold_hours, 24) into v_hold from settings limit 1;
    v_hold := coalesce(v_hold, 24);
    update bookings set expires_at = now() + make_interval(hours => v_hold) where id = v_id;
  end if;
  perform set_config('nasbot.trusted_booking', '', true);

  delete from waitlist where id = w.id;

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'admit_waitlist', 'bookings', v_id,
          jsonb_build_object('profile_id', w.profile_id, 'sbota_id', s.id,
                             'paid', v_free, 'hold_hours', v_hold));

  return jsonb_build_object('booking_id', v_id, 'paid', v_free, 'hold_hours', v_hold);
end;
$$;
comment on function fn_admit_waitlist(uuid) is
  '«دخّله» من قايمة الانتظار: بيسأل عن المكان ونصيب النوع وشروط العضو. المجانية (خروجة عضو أو «يلا») بتتأكد على طول، والمدفوعة حجز مستني الدفع بمهلة settings.waitlist_hold_hours. (0121 + 0143)';
revoke execute on function fn_admit_waitlist(uuid) from public, anon;
grant  execute on function fn_admit_waitlist(uuid) to authenticated, service_role;


-- ===== (5) مفيش إيميل «الخروجة اتفتحت» لسبوطة «يلا» =====
-- ⚠ منقول بالحرف من `0127` + شرط واحد. من غيره القفل كان بيبعت «الخروجة
--   اللي كنت مستنيها اتفتحت» لكل اللي داس «قولّي لما تفتح» على القالب —
--   وهي مجموعة مقفولة على ناس بعينها.
create or replace function fn_notify_proposal_opened()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.yalla_id is not null then return null; end if;   -- (0143)
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

-- ونفس الحاجة في محفّز `0117` (اللي بيبلّغ اللي مستني القالب)
-- ⚠ منقول بالحرف من `0117` + شرط واحد.
create or replace function fn_notify_soon_opened()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.yalla_id is not null then return new; end if;   -- (0143)
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


-- ===== (6) بوت الأعضاء — مفيش إعلان «خروجة جديدة» لسبوطة «يلا» =====
-- ⚠ منقول بالحرف من `0128` + شرط واحد. من غيره كل عضو متوصّل كان بيوصله
--   «خروجة جديدة نزلت» على مجموعة **مقفولة** هو مش فيها.
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
    if new.yalla_id is not null then return null; end if;   -- (0143)
    if new.status::text not in ('proposed', 'open') then return null; end if;
    if tg_op = 'UPDATE' and old.status is not distinct from new.status then return null; end if;
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
  exception when others then null;
  end;
  return null;
end;
$$;
revoke execute on function fn_member_tg_announce() from public, anon, authenticated;


-- ===== (7) مفيش «مكانك محجوز» في «يلا» =====
-- ⚠ منقول بالحرف من `0008` + شرط واحد على الإشعار. رسايل «يلا» (`yalla_won`
--   و`yalla_waiting`) بتقول نفس الحاجة وأدق منها — وإيميلين عن نفس الحاجة ضجة.
--   باقي شغل المحفّز (القفل لما تكمل · الرصيد · الإحالة) زي ما هو بالظبط.
create or replace function fn_booking_paid()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cap       int;
  used      int;
  s         sbotat;
  ref_owner uuid;
begin
  select * into s from sbotat where id = new.sbota_id;
  cap := s.capacity;

  select count(*) into used from bookings
  where sbota_id = new.sbota_id and status in ('paid', 'attended');

  if used >= cap then
    update sbotat set status = 'full' where id = new.sbota_id and status = 'open';
  end if;

  if new.wallet_used > 0 then
    insert into wallet_ledger (profile_id, delta, reason, ref_id, note)
    values (new.profile_id, -new.wallet_used, 'spend', new.id, 'خصم من الرصيد على حجز');
  end if;

  if new.referral_code_used is not null then
    select id into ref_owner from profiles
    where referral_code = new.referral_code_used and id <> new.profile_id;

    if ref_owner is not null then
      insert into referrals (referrer_id, referred_id, booking_id)
      values (ref_owner, new.profile_id, new.id)
      on conflict (referred_id) do nothing;
    end if;
  end if;

  -- إشعار التأكيد — إلا في «يلا» (0143)
  if s.yalla_id is null then
    insert into notifications (profile_id, channel, template_key, payload)
    values (new.profile_id, 'whatsapp', 'booking_confirmed',
            jsonb_build_object('booking_id', new.id, 'sbota_id', new.sbota_id));
  end if;

  return null;
end;
$$;
comment on function fn_booking_paid() is 'بعد الدفع: يقفل السبوطة لو كملت · يخصم الرصيد · يسجل الإحالة · يجدول رسالة التأكيد (ما عدا «يلا» — 0143).';


-- ===== نصوص بوت الأعضاء =====
insert into copy_strings (key, value_ar, screen, context_ar) values
  ('tgbot.yalla.won',
   'الميعاد اللي اخترته كسب — {{when}} في {{area}}. إنت جاي 🎉',
   'بوت الأعضاء', 'نداء «يلا» اتقفل والعضو في المجموعة'),
  ('tgbot.yalla.switch',
   'أكتر ناس في {{what}} قالوا {{when}} في {{area}}. تيجي معاهم؟',
   'بوت الأعضاء', 'العضو اختار حاجة تانية'),
  ('tgbot.yalla.waiting',
   '{{what}} اتلمّت على {{when}} في {{area}} والعدد كمل. إنت أول واحد في الانتظار، ومعاك أولوية في النداء الجاي.',
   'بوت الأعضاء', 'العضو زاد عن العدد'),
  ('tgbot.yalla.closed',
   'نداء {{what}} مكمّلش العدد المرة دي. معاك أولوية في النداء الجاي.',
   'بوت الأعضاء', 'النداء اتقفل من غير مجموعة'),
  ('tgbot.yalla.reveal',
   'مجموعتك ظهرت — {{what}} {{when}} في {{venue}}. افتح حجزك وشوف مين معاك.',
   'بوت الأعضاء', 'بعد «اكشف»'),
  ('tgbot.btn.yalla', 'افتح النداء', 'بوت الأعضاء', 'زرار الرسالة')
on conflict (key) do nothing;
