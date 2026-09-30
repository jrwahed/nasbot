-- ============================================================================
-- WORK_MIGRATION_39.sql — قايمة الانتظار بقت شغّالة
--
-- قبله: زرار «سجلني في الانتظار» كان بيودّي على صفحة الدفع والقاعدة ترفض —
-- محدش كان يقدر يدخل القايمة أصلًا (الجدول على الإنتاج: صفر صفوف).
--
-- دلوقتي: اللي ما لقاش مكان بيدخل القايمة من صفحة السبوطة، وبيشوف رقمه.
-- ولما حد يلغي، بنبعت لأول واحد في القايمة **يقدر ياخد المكان فعلًا**
-- (لو ولد لغى، البنت اللي نصّها كامل ما يتبعتلهاش). واللي حجز بيطلع لوحده.
-- ورسالة «فضي مكان» ما بقتش تقول «محجوزلك» — مكانش فيه حاجة بتحجزه.
--
-- ⚠ محتاج WORK_MIGRATION_38 يكون اتلزق قبله (بيستعمل fn_gender_block).
--
-- بعده شغّل (لزقة واحدة):
--   do $$ begin perform fn_test_seed_up(); end $$;
--   create temp table _r as select * from test_waitlist();
--   do $$ begin perform fn_test_seed_down(); end $$;
--   select * from _r;                       -- ٩ صفوف «نجح»
-- ============================================================================

-- ##########################################################################
-- # 20260930140000_0120_waitlist.sql
-- ##########################################################################

-- ============================================================================
-- 0120 · قايمة الانتظار — بقت شغّالة فعلًا
--
-- طلب المالك (٢٠٢٦-٠٩-٣٠): اللي ما لحقش يحجز يدخل قايمة انتظار السبوطة،
-- ولما مكان يفضى نبعتله.
--
-- اللي كان موجود من `0004`: جدول `waitlist` · زرار «سجلني في الانتظار» ·
-- و`fn_cancel_booking` بتبعت لأول واحد في القايمة. بس **محدش كان يقدر
-- يدخل القايمة أصلًا**: الزرار كان بيودّي على صفحة الدفع، و`fn_can_book`
-- بترفض هناك («السبوطة مش مفتوحة للحجز»). والجدول على الإنتاج: صفر صفوف.
--
-- الجديد:
--   · `fn_join_waitlist` / `fn_leave_waitlist` / `fn_my_waitlist` — الطريق
--     الوحيد (§٥ قاعدة ٤). سياسة الكتابة المباشرة اتشالت: كانت بتسمح للعضو
--     يكتب `position = 0` ويقفز القايمة كلها.
--   · بيتقبل بس لما مفيش مكان ليه: السبوطة كاملة، **أو** نصيب نوعه كمل
--     (0119). والرسالة واحدة في الحالتين — القفل ساكت (قرار المالك).
--   · `fn_waitlist_notify`: لما مكان يفضى، بتبعت لأول واحد في القايمة
--     **يقدر ياخده فعلًا** — مش أول واحد وخلاص. ولد لغى؟ البنات اللي في
--     القايمة ما بيتبعتلهمش لو نصّهم كامل.
--   · اللي حجز بيطلع من القايمة لوحده (`t_waitlist_clear`).
--   · قالب «فضي مكان» كان بيقول «المكان محجوزلك لفترة قصيرة» — **ومفيش حاجة
--     بتحجزه**. بقى بيقول الحقيقة: أول واحد يحجز ياخده.
--
-- ⚠ `fn_cancel_booking` اتعادت كتابتها هنا بالحرف من نسخة الإنتاج (0042)،
--   والتغيير الوحيد: بلوك القايمة بقى `perform fn_waitlist_notify(s.id)`.
--   إعادة لزق `0042` بترجّع الاختيار القديم (أول واحد من غير ما نسأل يقدر
--   ولا لأ) — `test_waitlist()` بيمسك ده بصف أحمر.
--
-- آمن يتكرر.
-- ============================================================================

-- ===== 1) مين يقدر ياخد مكان دلوقتي؟ — مصدر واحد للإشعار والصفحة =====
-- null = يقدر يحجز. غير كده = السبب.
create or replace function fn_seat_for(p_id uuid, s_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  s    sbotat;
  used int;
begin
  select * into s from sbotat where id = s_id;
  if not found then return 'السبوطة دي مش موجودة'; end if;
  if s.status not in ('open', 'full') then return 'السبوطة مش مفتوحة للحجز'; end if;

  select count(*) into used from bookings
   where sbota_id = s_id and status in ('paid', 'attended');
  if used >= s.capacity then return 'full'; end if;

  if fn_gender_block(p_id, s_id) is not null then return 'full'; end if;
  return null;
end;
$$;
revoke execute on function fn_seat_for(uuid, uuid) from public, anon, authenticated;


-- ===== 2) الدخول والخروج والحالة =====
create or replace function fn_join_waitlist(s_id uuid)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  s     sbotat;
  v_why text;
  v_pos int;
begin
  if v_uid is null then
    raise exception 'لازم تسجّل دخول الأول' using errcode = '42501';
  end if;

  -- القفل على السبوطة علشان رقمين ما يطلعوش نفس الترتيب
  select * into s from sbotat where id = s_id for update;
  if not found then raise exception 'السبوطة دي مش موجودة' using errcode = '22023'; end if;
  if s.status not in ('open', 'full')
     or (s.booking_closes_at is not null and now() > s.booking_closes_at) then
    raise exception 'الحجز في السبوطة دي اتقفل' using errcode = '22023';
  end if;

  if exists (select 1 from bookings b
              where b.sbota_id = s_id and b.profile_id = v_uid
                and b.status in ('pending_payment', 'paid', 'attended')) then
    raise exception 'أنت حاجز السبوطة دي بالفعل' using errcode = '22023';
  end if;

  if fn_seat_for(v_uid, s_id) is null then
    raise exception 'فيه مكان — احجز على طول' using errcode = '22023';
  end if;

  -- باقي شروط الحجز (السن · بنات بس · البوابة · الحظر) — نفس `fn_can_book`.
  -- ⚠ «مش مفتوحة للحجز» هي رسالة السبوطة الكاملة، ودي بالظبط اللي بندخل
  --   القايمة علشانها، فمش سبب رفض هنا.
  v_why := fn_can_book(v_uid, s_id);
  if v_why is not null and v_why <> 'السبوطة مش مفتوحة للحجز' then
    raise exception '%', v_why using errcode = '22023';
  end if;

  insert into waitlist (sbota_id, profile_id, position)
  values (s_id, v_uid,
          coalesce((select max(position) from waitlist where sbota_id = s_id), 0) + 1)
  on conflict (sbota_id, profile_id) do nothing;

  select count(*) into v_pos from waitlist w
   where w.sbota_id = s_id
     and w.position <= (select position from waitlist where sbota_id = s_id and profile_id = v_uid);
  return v_pos;
end;
$$;
revoke execute on function fn_join_waitlist(uuid) from public, anon;
grant execute on function fn_join_waitlist(uuid) to authenticated;

create or replace function fn_leave_waitlist(s_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'لازم تسجّل دخول الأول' using errcode = '42501';
  end if;
  delete from waitlist where sbota_id = s_id and profile_id = auth.uid();
end;
$$;
revoke execute on function fn_leave_waitlist(uuid) from public, anon;
grant execute on function fn_leave_waitlist(uuid) to authenticated;

-- الصفحة بتسأل: أنا في القايمة؟ رقمي كام؟ وأقدر أحجز أصلًا؟
-- ⚠ `can_book = false` مش بتقول ليه (كاملة ولا نصيب النوع) — القفل ساكت.
create or replace function fn_my_waitlist(s_id uuid)
returns table (on_list boolean, rank int, can_book boolean)
language sql
stable
security definer
set search_path = public
as $$
  select
    exists (select 1 from waitlist where sbota_id = s_id and profile_id = auth.uid()),
    (select count(*)::int from waitlist w
      where w.sbota_id = s_id
        and w.position <= (select position from waitlist
                            where sbota_id = s_id and profile_id = auth.uid())),
    fn_seat_for(auth.uid(), s_id) is null
  where auth.uid() is not null
$$;
revoke execute on function fn_my_waitlist(uuid) from public, anon;
grant execute on function fn_my_waitlist(uuid) to authenticated;


-- ===== 3) الإشعار: أول واحد يقدر ياخد المكان =====
create or replace function fn_waitlist_notify(s_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  w waitlist;
begin
  for w in
    select * from waitlist
     where sbota_id = s_id and notified_at is null
     order by position
  loop
    if fn_seat_for(w.profile_id, s_id) is null then
      update waitlist set notified_at = now() where id = w.id;
      insert into notifications (profile_id, channel, template_key, payload)
      values (w.profile_id, 'whatsapp', 'waitlist_promoted',
              jsonb_build_object('sbota_id', s_id));
      return w.profile_id;
    end if;
  end loop;
  return null;
end;
$$;
revoke execute on function fn_waitlist_notify(uuid) from public, anon, authenticated;


-- ===== 4) اللي حجز يطلع من القايمة =====
create or replace function fn_waitlist_clear()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  delete from waitlist where sbota_id = new.sbota_id and profile_id = new.profile_id;
  return null;
end;
$$;
revoke execute on function fn_waitlist_clear() from public, anon, authenticated;

drop trigger if exists t_waitlist_clear on bookings;
create trigger t_waitlist_clear after insert or update of status on bookings
  for each row when (new.status = 'paid')
  execute function fn_waitlist_clear();


-- ===== 5) الكتابة المباشرة على الجدول اتقفلت =====
drop policy if exists waitlist_own       on waitlist;
drop policy if exists waitlist_own_read  on waitlist;
drop policy if exists waitlist_admin     on waitlist;

create policy waitlist_own_read on waitlist for select
  using (profile_id = auth.uid() or fn_is_admin());
-- اللوحة: «دخّله» و«شيله» من تبويب قايمة الانتظار في الحجوزات
create policy waitlist_admin on waitlist for all
  using (fn_has_permission('bookings.edit'))
  with check (fn_has_permission('bookings.edit'));


-- ===== 6) fn_cancel_booking — نسخة الإنتاج بالحرف + الإشعار الجديد =====
create or replace function fn_cancel_booking(p_booking_id uuid, p_by text default 'user', p_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  b bookings; s sbotat; cfg settings;
  hours_left numeric; refund_amt int := 0;
  r_kind refund_kind_t := 'none'; r_type refund_type_t := 'gateway';
  pay payments; is_first boolean; v_by text;
  pass_res jsonb := null;
begin
  if auth.uid() is null or fn_is_admin() then
    v_by := coalesce(p_by, 'user');
  else
    v_by := 'user';
  end if;

  select * into b from bookings where id = p_booking_id;
  if not found then raise exception 'الحجز مش موجود'; end if;

  if v_by = 'user' and auth.uid() is not null and b.profile_id <> auth.uid() then
    raise exception 'مش حجزك';
  end if;
  if b.status not in ('paid', 'pending_payment') then
    raise exception 'الحجز ده متلغي أو خلص';
  end if;

  select * into s from sbotat where id = b.sbota_id;
  select * into cfg from settings where id;
  hours_left := extract(epoch from (s.starts_at - now())) / 3600.0;

  select count(*) = 0 into is_first from bookings
  where profile_id = b.profile_id and status = 'attended';

  if b.paid_with_pass then
    -- مدفوع بجلسة من الكارت: مفيش فلوس بترجع — الجلسة هي اللي بترجع (أو لأ)
    pass_res := fn_revert_pass(b.id, v_by = 'us');
    refund_amt := 0;
    if coalesce((pass_res ->> 'reverted')::boolean, false) then
      r_kind := 'full';
    else
      r_kind := 'none';
      if v_by = 'user' then
        insert into behavior_flags (profile_id, kind, booking_id, note)
        values (b.profile_id, 'late_cancel', b.id, 'إلغاء متأخر لسبوطة شغل — الجلسة ما رجعتش');
      end if;
    end if;
  elsif v_by = 'us' then
    refund_amt := b.price_paid; r_kind := 'full';
    if refund_amt > 0 then
      insert into wallet_ledger (profile_id, delta, reason, ref_id, note)
      values (b.profile_id, (refund_amt * cfg.our_cancel_bonus_pct) / 100,
              'cancel_credit', b.id, 'رصيد اعتذار عن إلغاء من عندنا');
    end if;
  elsif hours_left >= cfg.refund_full_days * 24 then
    refund_amt := b.price_paid; r_kind := 'full';
  elsif cfg.refund_half_days > 0 and hours_left >= cfg.refund_half_days * 24 then
    refund_amt := b.price_paid / 2; r_kind := 'half';
  elsif hours_left >= 0 and is_first then
    refund_amt := b.price_paid; r_kind := 'credit'; r_type := 'wallet_credit';
  else
    refund_amt := 0; r_kind := 'none';
    insert into behavior_flags (profile_id, kind, booking_id, note)
    values (b.profile_id, 'late_cancel', b.id, 'إلغاء متأخر');
  end if;

  update bookings
  set status = (case when v_by = 'us' then 'cancelled_by_us' else 'cancelled_by_user' end)::booking_status_t,
      cancelled_at = now(), cancel_reason = p_reason, refund_kind = r_kind
  where id = b.id;

  if refund_amt > 0 then
    select * into pay from payments where booking_id = b.id and status = 'succeeded' limit 1;
    if found then
      insert into refunds (payment_id, amount, kind, reason, status)
      values (pay.id, refund_amt, r_type, p_reason,
              (case when r_type = 'wallet_credit' then 'succeeded' else 'initiated' end)::payment_status_t);
    end if;
    if r_type = 'wallet_credit' then
      insert into wallet_ledger (profile_id, delta, reason, ref_id, note)
      values (b.profile_id, refund_amt, 'refund_credit', b.id, 'رصيد بدل استرداد');
    end if;
  end if;

  update sbotat set status = 'open' where id = s.id and status = 'full';

  -- قايمة الانتظار (0120): أول واحد **يقدر ياخد المكان** — مش أول واحد وخلاص
  perform fn_waitlist_notify(s.id);

  insert into audit_log (actor_id, action, entity, entity_id, after)
  values (auth.uid(), 'cancel_booking', 'bookings', b.id,
          jsonb_build_object('refund', refund_amt, 'kind', r_kind, 'by', v_by,
                             'pass', pass_res));

  return jsonb_build_object('ok', true, 'refund', refund_amt, 'kind', r_kind,
                            'pass_reverted', coalesce((pass_res ->> 'reverted')::boolean, false));
end;
$$;
comment on function fn_cancel_booking(uuid, text, text) is 'سياسة الإلغاء من settings. «إحنا لغينا» للإدارة/الخادم بس. لو الحجز paid_with_pass بترجّع الجلسة للكارت (fn_revert_pass) بدل الفلوس. قايمة الانتظار من fn_waitlist_notify (0120).';
revoke execute on function fn_cancel_booking(uuid, text, text) from public, anon;
grant  execute on function fn_cancel_booking(uuid, text, text) to authenticated, service_role;


-- ===== 7) رسالة «فضي مكان» تقول الحقيقة =====
-- ⚠ بتتغيّر بس لو لسه النص القديم بالحرف — لو المالك عدّلها من اللوحة ما بنلمسهاش.
update notification_templates
   set body_ar = 'خبر حلو — فضي مكان في {{1}}.
أول واحد يحجز ياخده، فلو لسه عايز تيجي احجز دلوقتي: {{2}}'
 where key = 'waitlist_promoted'
   and body_ar = 'خبر حلو — بقى فيه مكان في {{1}}.
المكان محجوزلك لفترة قصيرة، احجز قبل ما يروح لحد تاني: {{2}}';


-- ===== 8) نصوص الصفحة =====
insert into copy_strings (key, value_ar, screen, context_ar) values
  ('sbota.wait.in',    'انت رقم {{n}} في قايمة الانتظار', 'السبوطة',
   'بدل زرار الحجز لما العضو في قايمة الانتظار'),
  ('sbota.wait.leave', 'اطلع من القايمة', 'السبوطة',
   'زرار صغير تحت «انت رقم …»'),
  ('sbota.wait.err',   'مقدرناش نسجّلك. جرب تاني.', 'السبوطة',
   'لو الدخول في القايمة وقع من غير رسالة من القاعدة')
on conflict (key) do nothing;


-- ===== 9) الاختبار =====
-- ⚠ محتاج `fn_test_seed_up()` قبله (٣ بنات + ولد). وكل الكتابة بترجع
--   باستثناء متعمّد في الآخر.
create or replace function test_waitlist()
returns table (test text, result text)
language plpgsql
set search_path = public
as $body$
declare
  me  text := current_user;
  tpl uuid := '66666666-0000-0000-0000-000000000004';
  ven uuid := '55555555-0000-0000-0000-000000000004';
  s2  uuid := '77777777-0000-0000-0000-000000000120';
  s4  uuid := '77777777-0000-0000-0000-000000000220';
  f1  uuid := '33333333-0000-0000-0000-000000000001';
  f3  uuid := '33333333-0000-0000-0000-000000000003';
  f5  uuid := '33333333-0000-0000-0000-000000000005';
  m1  uuid := '44444444-0000-0000-0000-000000000001';
  bf1 uuid; bm1 uuid;
  names text[] := array[
    '0120 · الزائر المجهول ما يدخلش القايمة',
    '0120 · العضو بيدخل القايمة لما السبوطة كاملة',
    '0120 · اللي فيه مكان ليه ما يدخلش القايمة',
    '0120 · الكتابة المباشرة على الجدول مقفولة',
    '0120 · ولد لغى والبنات نصّهم كامل = محدش اتبعتله',
    '0120 · بنت لغت = أول بنت في القايمة اتبعتلها',
    '0120 · والتانية ما اتبعتلهاش',
    '0120 · اللي حجز طلع من القايمة لوحده',
    '0120 · fn_cancel_booking بتنادي fn_waitlist_notify'];
  r   text[] := '{}';
  n   int;
  i   int;
begin
  if not exists (select 1 from profiles where id = m1)
     or not exists (select 1 from sbota_templates where id = tpl) then
    test := '0120 · قايمة الانتظار';
    result := 'معلومة — محتاج البذرة المؤقتة (fn_test_seed_up)';
    return next;
    return;
  end if;

  begin
    update settings set gender_balance = true;
    update profiles set gate_status = 'approved', birth_year = extract(year from now())::int - 25
     where id in (f1, f3, f5, m1);

    -- سبوطة الـ٢ (بنت + ولد) كاملة · وسبوطة الـ٤ فاضية
    insert into sbotat (id, template_id, venue_id, starts_at, ends_at, price, org_fee,
                        capacity, status, girls_only, is_day, is_mystery)
    values (s2, tpl, ven, now() + interval '6 days', now() + interval '6 days 2 hours',
            0, 0, 2, 'open', false, false, false),
           (s4, tpl, ven, now() + interval '6 days', now() + interval '6 days 2 hours',
            0, 0, 4, 'open', false, false, false);
    insert into bookings (sbota_id, profile_id, status, price_paid) values (s2, f1, 'paid', 0)
      returning id into bf1;
    insert into bookings (sbota_id, profile_id, status, price_paid) values (s2, m1, 'paid', 0)
      returning id into bm1;

    -- (١) المجهول
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    execute 'set local role anon';
    begin
      perform fn_join_waitlist(s2);
      r := r || 'فشل — 🔴 المجهول دخل القايمة'::text;
    exception when insufficient_privilege then
      r := r || 'نجح'::text;
    end;
    execute format('set local role %I', me);

    -- (٢) بنتين يدخلوا (السبوطة كاملة)
    perform set_config('request.jwt.claims',
      json_build_object('sub', f3, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    n := fn_join_waitlist(s2);
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims',
      json_build_object('sub', f5, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    n := fn_join_waitlist(s2);
    r := r || case when n = 2 then 'نجح' else format('فشل — التانية طلعت رقم %s مش 2', n) end;

    -- (٣) سبوطة فيها مكان
    begin
      perform fn_join_waitlist(s4);
      r := r || 'فشل — دخلت قايمة سبوطة فيها مكان'::text;
    exception when others then
      r := r || case when sqlerrm like '%احجز على طول%' then 'نجح'
                     else 'فشل — اترفضت بسبب تاني: ' || sqlerrm end;
    end;

    -- (٤) الكتابة المباشرة
    begin
      insert into waitlist (sbota_id, profile_id, position) values (s4, f5, 0);
      r := r || 'فشل — 🔴 العضو كتب في القايمة مباشرة'::text;
    exception when insufficient_privilege then
      r := r || 'نجح'::text;
    end;
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);

    -- (٥) الولد لغى — نصيب البنات (١) لسه كامل
    perform fn_cancel_booking(bm1);
    select count(*) into n from waitlist where sbota_id = s2 and notified_at is not null;
    r := r || case when n = 0 then 'نجح'
                   else format('فشل — %s بنت اتبعتلها ومكانها مش هيقبل', n) end;

    -- (٦) و(٧) البنت لغت
    perform fn_cancel_booking(bf1);
    r := r || case when (select notified_at is not null from waitlist where sbota_id = s2 and profile_id = f3)
                   then 'نجح' else 'فشل — أول بنت في القايمة ما اتبعتلهاش' end;
    r := r || case when (select notified_at is null from waitlist where sbota_id = s2 and profile_id = f5)
                   then 'نجح' else 'فشل — التانية اتبعتلها على نفس المكان' end;

    -- (٨) الأولى حجزت
    insert into bookings (sbota_id, profile_id, status, price_paid) values (s2, f3, 'paid', 0);
    r := r || case when not exists (select 1 from waitlist where sbota_id = s2 and profile_id = f3)
                   then 'نجح' else 'فشل — حجزت وفضلت في القايمة' end;

    -- (٩) إعادة لزق 0042 القديمة بتشيل ده
    r := r || case when (select prosrc from pg_proc where proname = 'fn_cancel_booking')
                        like '%perform fn_waitlist_notify(%'
                   then 'نجح'
                   else 'فشل — fn_cancel_booking رجعت للنسخة القديمة (اتلزقت 0042 بعد 0120؟) — الزق WORK_MIGRATION_39 تاني' end;

    raise exception 'test_waitlist_rollback';
  exception when others then
    if sqlerrm <> 'test_waitlist_rollback' then
      r := r || ('فشل — استثناء: ' || sqlerrm);
    end if;
  end;
  execute format('set local role %I', me);
  perform set_config('request.jwt.claims', '', true);

  for i in 1 .. array_length(r, 1) loop
    test := coalesce(names[i], '0120 · الاختبار');
    result := r[i];
    return next;
  end loop;
end $body$;

comment on function test_waitlist() is
  '0120 — قايمة الانتظار: الدخول بالدالة بس ولما مفيش مكان، والإشعار لأول واحد يقدر ياخد المكان فعلًا.';
revoke execute on function test_waitlist() from public, anon, authenticated;
