-- ============================================================================
-- WORK_MIGRATION_40.sql — الحجز في الخروجات المجانية بقى شغّال · و«دخّله» صح
--
-- 🔴 قبله: أي عضو يدوس «احجز» في خروجة عضو مجانية كان بياخد خطأ — حارس
-- قديم بيمنع أي حجز يدخل «مؤكد» من المتصفح، والحجز المجاني بيدخل مؤكد.
-- محدش شافها لأن مفيش ولا خروجة عضو اتحجزت لحد النهارده.
--
-- ومعاها:
--   · اللي لغى حجزه المجاني ورجع يحجز — كان هيقع برضه. بقى يعدّي.
--   · الحجز المجاني بقى يبعت إيميل «مكانك محجوز» (ما كانش بيبعت خالص).
--   · «دخّله» في قايمة الانتظار بقى بيسأل عن نص الولاد والبنات، وفي الخروجة
--     المجانية بيأكّد الحجز على طول بدل «مستني الدفع». ومهلة الدفع في
--     المدفوعة بقت من الإعدادات («مهلة الدفع للي اتدخّل من الانتظار»).
--
-- ⚠ محتاج WORK_MIGRATION_39 يكون اتلزق قبله.
--
-- بعده شغّل (لزقة واحدة):
--   do $$ begin perform fn_test_seed_up(); end $$;
--   create temp table _r as select * from test_free_booking();
--   do $$ begin perform fn_test_seed_down(); end $$;
--   select * from _r;                       -- ١٢ صف «نجح»
-- ============================================================================

-- ##########################################################################
-- # 20260930160000_0121_free_booking_and_waitlist_admit.sql
-- ##########################################################################

-- ============================================================================
-- 0121 · الحجز المجاني بقى شغّال فعلًا · و«دخّله» من قايمة الانتظار بقى دالة
--
-- 🔴 الحجز في خروجات الأعضاء المجانية كان **بيقع عند كل عضو** من يوم ما
--   اتعمل (`0086`). `fn_book_free` بتعمل `insert … status = 'paid'`، والمحفّز
--   `fn_guard_booking_columns` (`0054`، وبقى على `fn_caller_is_browser()` من
--   `0063`) بيقرا الـclaims — والـclaims جوه الدالة لسه `authenticated` —
--   فبيرفض: «العضو بيعمل حجز pending_payment مجاني بس». ومحدش شافها لأن
--   **مفيش ولا خروجة عضو اتحجزت على الإنتاج** (٢٠٢٦-٠٩-٣٠: صفر).
--   اختبار `0086` كان بيجرّب الرفض بس (سبوطة مدفوعة)، ما جرّبش إن الحجز
--   الصح بيعدّي.
--
-- وتلات حاجات من نفس الطريق:
--   · اللي لغى حجزه المجاني ورجع يحجز كان هيقع على `unique (sbota_id,
--     profile_id)` — الدالة كانت بتعمل `insert` بس. دلوقتي بتعيد استعمال
--     الصف المتلغي (زي `/api/pay/create`).
--   · الحجز المجاني ما كانش بيبعت «مكانك محجوز» خالص: الإيميل من
--     `t_booking_paid` وده `after update` بس، والحجز كان `insert`.
--   · «دخّله» في اللوحة كان `insert` مباشر من المتصفح: ما بيسألش عن نصيب
--     الولاد والبنات (0119)، وفي الخروجة المجانية كان بيعمل حجز «مستني الدفع»
--     لخروجة **مفيهاش دفع** — فالعضو يتقفل بره حجزه لحد ما المهلة تخلص.
--     والمهلة (٢٤ ساعة) كانت مكتوبة في الكود (§٣.٢).
--
-- الحل:
--   · `fn_guard_booking_columns`: نفس الحارس بالحرف + استثناء واحد: علم
--     معاملة `nasbot.trusted_booking` بتحطه الدوال الموثوقة بس، قبل الكتابة
--     على طول، وبتشيله بعدها. `set_config` مش مكشوفة عبر الـAPI، فالمتصفح
--     ما يقدرش يحطه.
--   · `fn_book_free`: بتعيد استعمال الصف المتلغي · بتحط العلم · وبتقلب الحجز
--     لـ`paid` بـ`update` علشان كل محفّزات الدفع تشتغل (الحارس · الإيميل ·
--     القفل لما تكمل · الخروج من قايمة الانتظار).
--   · `fn_admit_waitlist(waitlist_id)`: «دخّله» — بصلاحية `bookings.edit`،
--     بتسأل نفس سؤال الحجز (العدد + نصيب النوع + شروط العضو)، وفي الخروجة
--     المجانية بتأكّد الحجز على طول، وفي المدفوعة بتعمل حجز مستني الدفع
--     بمهلة من `settings.waitlist_hold_hours`.
--
-- ⚠ `fn_book_free` متعرّفة في `0086` كمان، و`fn_guard_booking_columns` في
--   `0054`. إعادة لزق أي واحدة منهم بترجّع النسخة القديمة (الدرس التالت) —
--   `test_free_booking()` بيمسك الاتنين بصف أحمر.
--
-- آمن يتكرر.
-- ============================================================================

-- ===== 1) مهلة الدفع لحد اتدخّل من قايمة الانتظار =====
alter table settings add column if not exists waitlist_hold_hours int not null default 24;
comment on column settings.waitlist_hold_hours is
  'لما اللوحة «تدخّل» حد من قايمة الانتظار في سبوطة مدفوعة: قدامه كام ساعة يدفع قبل ما الحجز يتلغي لوحده. (0121)';


-- ===== 2) حارس الأعمدة — نفس 0054 بالحرف + علم الدوال الموثوقة =====
create or replace function fn_guard_booking_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- بيتطبّق بس لو اللي بينادي عضو من المتصفح (anon/authenticated).
  -- ⚠ الاستثناء الوحيد (0121): دالة موثوقة (`fn_book_free` · `fn_admit_waitlist`)
  --   حاطة علم المعاملة قبل الكتابة على طول. المتصفح ما يقدرش يحطه.
  if fn_caller_is_browser()
     and coalesce(current_setting('nasbot.trusted_booking', true), '') <> 'on' then
    if tg_op = 'INSERT' then
      -- إدراج بأي حاجة غير حجز مبدئي مجاني محتاج صلاحية bookings.edit
      if (new.status is distinct from 'pending_payment'::booking_status_t
       or new.price_paid  <> 0
       or new.discount    <> 0
       or new.wallet_used <> 0
       or new.paid_with_pass is distinct from false
       or new.checked_in_at is not null
       or new.cancelled_at  is not null
       or new.refund_kind   is not null
       or new.payment_id    is not null)
      and not fn_has_permission('bookings.edit') then
        raise exception 'العضو بيعمل حجز pending_payment مجاني بس — تأكيد الحجز والفلوس عبر مسارات الدفع';
      end if;
    elsif tg_op = 'UPDATE' then
      if (new.status      is distinct from old.status
       or new.price_paid  is distinct from old.price_paid
       or new.discount    is distinct from old.discount
       or new.wallet_used is distinct from old.wallet_used
       or new.paid_with_pass is distinct from old.paid_with_pass
       or new.checked_in_at is distinct from old.checked_in_at
       or new.cancelled_at  is distinct from old.cancelled_at
       or new.refund_kind   is distinct from old.refund_kind
       or new.payment_id    is distinct from old.payment_id)
      and not fn_has_permission('bookings.edit') then
        raise exception 'تعديل حالة الحجز أو فلوسه عبر الدوال/الإدارة بس';
      end if;
    end if;
  end if;
  return new;
end;
$$;
comment on function fn_guard_booking_columns() is
  'بيمنع العضو من المتصفح إنه يحط/يغيّر status أو الفلوس أو الحضور على الحجز مباشرة — الدوال ومسارات الدفع بس. الدوال الموثوقة بتعدّي بعلم nasbot.trusted_booking (0121).';
revoke execute on function fn_guard_booking_columns() from public, anon, authenticated;


-- ===== 3) مكان الحجز — صف جديد أو الصف المتلغي القديم =====
-- ⚠ داخلية: بتفترض إن اللي بيناديها اتأكد من كل الشروط، وإن العلم متحط.
create or replace function fn_booking_slot(p_id uuid, s_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  select id into v_id from bookings
   where sbota_id = s_id and profile_id = p_id
   for update;

  if found then
    -- صف قديم متلغي/منتهي: نرجّعه نضيف — مفيش فلوس ولا حضور من المرة اللي فاتت
    update bookings set
      status = 'pending_payment', price_paid = 0, discount = 0, wallet_used = 0,
      referral_code_used = null, paid_with_pass = false, payment_id = null,
      cancelled_at = null, cancel_reason = null, refund_kind = null,
      checked_in_at = null, checked_in_by = null, group_id = null,
      expires_at = null
     where id = v_id;
  else
    insert into bookings (sbota_id, profile_id, status, price_paid, discount, wallet_used)
    values (s_id, p_id, 'pending_payment', 0, 0, 0)
    returning id into v_id;
  end if;
  return v_id;
end;
$$;
revoke execute on function fn_booking_slot(uuid, uuid) from public, anon, authenticated;


-- ===== 4) الحجز المجاني =====
create or replace function fn_book_free(p_sbota_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_s   sbotat;
  v_why text;
  v_id  uuid;
begin
  if v_uid is null then
    raise exception 'لازم تسجّل دخول الأول' using errcode = '42501';
  end if;

  select * into v_s from sbotat where id = p_sbota_id;
  if not found then raise exception 'الخروجة دي مش موجودة' using errcode = '22023'; end if;

  -- ⚠ الحارس الأهم: الطريق ده لخروجات الأعضاء المجانية **بس**. من غيره
  --   كان بيبقى باب حجز ببلاش في سبوطات نسبوط المدفوعة.
  if v_s.origin is distinct from 'member' or v_s.price <> 0 then
    raise exception 'الخروجة دي بتتحجز بالدفع' using errcode = '42501';
  end if;

  v_why := fn_can_book(v_uid, p_sbota_id);
  if v_why is not null then raise exception '%', v_why using errcode = '22023'; end if;

  -- العلم للكتابتين دول بس (0121)
  perform set_config('nasbot.trusted_booking', 'on', true);
  v_id := fn_booking_slot(v_uid, p_sbota_id);
  -- `update` مش `insert`: كده الحارس (العدد + النوع) والإيميل والقفل لما
  -- تكمل والخروج من قايمة الانتظار كلهم بيشتغلوا من محفّزاتهم.
  update bookings set status = 'paid', expires_at = null where id = v_id;
  perform set_config('nasbot.trusted_booking', '', true);

  return v_id;
end;
$$;
comment on function fn_book_free(uuid) is
  'حجز في خروجة عضو مجانية. بيرفض أي سبوطة سعرها مش صفر أو مش من عضو. بيعيد استعمال الصف المتلغي، وبيأكّد بـupdate علشان محفّزات الدفع تشتغل (0121).';
revoke execute on function fn_book_free(uuid) from public, anon;
grant  execute on function fn_book_free(uuid) to authenticated;


-- ===== 5) «دخّله» من قايمة الانتظار =====
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
  -- القاعدة §٥.٢: صلاحية بعينها مش «أي حد في اللوحة». ومفتاح الخدمة بيعدّي.
  if fn_caller_is_browser() and not fn_has_permission('bookings.edit') then
    raise exception 'محتاج صلاحية bookings.edit' using errcode = '42501';
  end if;

  select * into w from waitlist where id = p_waitlist_id;
  if not found then raise exception 'الشخص ده مش في قايمة الانتظار' using errcode = '22023'; end if;

  -- القفل على السبوطة قبل العدّ — اتنين من اللوحة ما يدخّلوش على نفس المكان
  select * into s from sbotat where id = w.sbota_id for update;
  if not found then raise exception 'السبوطة دي مش موجودة' using errcode = '22023'; end if;

  -- العدد: المدفوع + المستني الدفع اللي مهلته ما خلصتش
  select count(*) into v_used from bookings b
   where b.sbota_id = s.id and b.profile_id <> w.profile_id
     and (b.status in ('paid', 'attended')
          or (b.status = 'pending_payment'
              and (b.expires_at is null or b.expires_at > now())));
  if v_used >= s.capacity then
    raise exception 'مفيش مكان فاضي في السبوطة دي دلوقتي' using errcode = '22023';
  end if;

  -- نصيب النوع (0119) — اللوحة تشوف السبب، العضو لأ
  v_why := fn_gender_block(w.profile_id, s.id);
  if v_why is not null then raise exception '%', v_why using errcode = '22023'; end if;

  -- باقي شروط الحجز (السن · بنات بس · البوابة · الحظر · حاجز بالفعل).
  -- «مش مفتوحة» بتتقبل لو السبوطة `full` بس — ده بالظبط سبب القايمة.
  v_why := fn_can_book(w.profile_id, s.id);
  if v_why is not null
     and not (v_why = 'السبوطة مش مفتوحة للحجز' and s.status = 'full') then
    raise exception '%', v_why using errcode = '22023';
  end if;

  v_free := s.origin = 'member' and s.price = 0;

  perform set_config('nasbot.trusted_booking', 'on', true);
  v_id := fn_booking_slot(w.profile_id, s.id);
  if v_free then
    -- خروجة مجانية: مفيش دفع يستناه — الحجز بيتأكد على طول وإيميله بيتبعت
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
  '«دخّله» من قايمة الانتظار: بيسأل عن المكان ونصيب النوع وشروط العضو. المجانية بتتأكد على طول، والمدفوعة حجز مستني الدفع بمهلة settings.waitlist_hold_hours. (0121)';
revoke execute on function fn_admit_waitlist(uuid) from public, anon;
grant  execute on function fn_admit_waitlist(uuid) to authenticated, service_role;


-- ===== 6) الاختبار =====
-- ⚠ محتاج `fn_test_seed_up()` قبله (٣ بنات + ولد). وكل الكتابة بترجع
--   باستثناء متعمّد في الآخر.
create or replace function test_free_booking()
returns table (test text, result text)
language plpgsql
set search_path = public
as $body$
declare
  me  text := current_user;
  tpl uuid := '66666666-0000-0000-0000-000000000004';
  ven uuid := '55555555-0000-0000-0000-000000000004';
  sf  uuid := '77777777-0000-0000-0000-000000000121';  -- خروجة عضو مجانية (٢)
  sp  uuid := '77777777-0000-0000-0000-000000000221';  -- سبوطة نسبوط مدفوعة (٢)
  f1  uuid := '33333333-0000-0000-0000-000000000001';
  f3  uuid := '33333333-0000-0000-0000-000000000003';
  f5  uuid := '33333333-0000-0000-0000-000000000005';
  m1  uuid := '44444444-0000-0000-0000-000000000001';
  names text[] := array[
    '0121 · 🔴 العضو بيحجز خروجة مجانية فعلًا',
    '0121 · الحجز المجاني بيبعت «مكانك محجوز»',
    '0121 · لغى ورجع حجز نفس الخروجة المجانية',
    '0121 · fn_book_free لسه بترفض السبوطة المدفوعة',
    '0121 · العضو لسه ما يقدرش يكتب حجز مدفوع مباشرة',
    '0121 · «دخّله» من عضو من غير صلاحية = مرفوض',
    '0121 · «دخّله» والبنات نصّهم كامل = مرفوض',
    '0121 · «دخّله» في الخروجة المجانية = حجز متأكد',
    '0121 · «دخّله» في المدفوعة = مستني الدفع بمهلة الإعدادات',
    '0121 · اللي اتدخّل طلع من القايمة',
    '0121 · fn_book_free ما رجعتش لنسخة 0086',
    '0121 · حارس الأعمدة ما رجعش لنسخة 0054'];
  r   text[] := '{}';
  n   int;
  i   int;
  bid uuid;
  wid uuid;
  st  text;
  ex  timestamptz;
begin
  if not exists (select 1 from profiles where id = m1)
     or not exists (select 1 from sbota_templates where id = tpl) then
    test := '0121 · الحجز المجاني وقايمة الانتظار';
    result := 'معلومة — محتاج البذرة المؤقتة (fn_test_seed_up)';
    return next;
    return;
  end if;

  begin
    update settings set gender_balance = true, waitlist_hold_hours = 7;
    update profiles set gate_status = 'approved', birth_year = extract(year from now())::int - 25,
                        deleted_at = null, banned_at = null
     where id in (f1, f3, f5, m1);

    insert into sbotat (id, template_id, venue_id, starts_at, ends_at, price, org_fee,
                        capacity, status, girls_only, is_day, is_mystery, origin, host_id)
    values (sf, tpl, null, now() + interval '6 days', now() + interval '6 days 2 hours',
            0, 0, 2, 'open', false, false, false, 'member', m1),
           (sp, tpl, ven, now() + interval '6 days', now() + interval '6 days 2 hours',
            15000, 0, 2, 'open', false, false, false, 'nasbot', null);

    -- (١) و(٢) بنت بتحجز المجانية من المتصفح
    perform set_config('request.jwt.claims',
      json_build_object('sub', f1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      bid := fn_book_free(sf);
      r := r || 'نجح'::text;
    exception when others then
      r := r || ('فشل — 🔴 الحجز المجاني وقع: ' || sqlerrm);
    end;
    execute format('set local role %I', me);
    r := r || case when exists (select 1 from notifications
                                 where profile_id = f1 and template_key = 'booking_confirmed'
                                   and payload ->> 'sbota_id' = sf::text)
                   then 'نجح' else 'فشل — مفيش إيميل تأكيد للحجز المجاني' end;

    -- (٣) لغت ورجعت حجزت
    perform set_config('request.jwt.claims', '', true);
    update bookings set status = 'cancelled_by_user', cancelled_at = now()
     where sbota_id = sf and profile_id = f1;
    perform set_config('request.jwt.claims',
      json_build_object('sub', f1, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform fn_book_free(sf);
      execute format('set local role %I', me);
      select status::text into st from bookings where sbota_id = sf and profile_id = f1;
      r := r || case when st = 'paid' then 'نجح' else 'فشل — الحجز التاني حالته ' || st end;
    exception when others then
      execute format('set local role %I', me);
      r := r || ('فشل — الحجز بعد الإلغاء وقع: ' || sqlerrm);
    end;

    -- (٤) المدفوعة بترفض
    execute 'set local role authenticated';
    begin
      perform fn_book_free(sp);
      r := r || 'فشل — 🔴 حجز ببلاش في سبوطة مدفوعة'::text;
    exception when others then
      r := r || case when sqlerrm like '%بتتحجز بالدفع%' then 'نجح'
                     else 'فشل — اترفضت بسبب تاني: ' || sqlerrm end;
    end;

    -- (٥) العلم ما بيتسابش مفتوح بعد الدالة، والكتابة المباشرة لسه مقفولة
    begin
      insert into bookings (sbota_id, profile_id, status, price_paid) values (sp, f1, 'paid', 0);
      r := r || 'فشل — 🔴 العضو كتب حجز مدفوع مباشرة'::text;
    exception when others then
      r := r || 'نجح'::text;
    end;

    -- (٦) عضو من غير صلاحية بيدخّل
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);
    -- المجانية: البنت (f1) جوه · ولد يكمّلها · بنتين في القايمة
    insert into bookings (sbota_id, profile_id, status, price_paid) values (sf, m1, 'paid', 0);
    insert into waitlist (sbota_id, profile_id, position) values (sf, f3, 1) returning id into wid;
    insert into waitlist (sbota_id, profile_id, position) values (sp, f5, 1);
    perform set_config('request.jwt.claims',
      json_build_object('sub', f3, 'role', 'authenticated')::text, true);
    execute 'set local role authenticated';
    begin
      perform fn_admit_waitlist(wid);
      r := r || 'فشل — 🔴 عضو دخّل نفسه من القايمة'::text;
    exception when others then
      r := r || case when sqlerrm like '%bookings.edit%' then 'نجح'
                     else 'فشل — اترفض بسبب تاني: ' || sqlerrm end;
    end;
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);

    -- (٧) الولد لغى — مكان فاضي بس نصيب البنات (١ من ٢) كامل
    update bookings set status = 'cancelled_by_user' where sbota_id = sf and profile_id = m1;
    begin
      perform fn_admit_waitlist(wid);
      r := r || 'فشل — دخّلت بنت والبنات نصّهم كامل'::text;
    exception when others then
      r := r || case when sqlerrm like '%مكان البنات كمل%' then 'نجح'
                     else 'فشل — اترفض بسبب تاني: ' || sqlerrm end;
    end;

    -- (٨) البنت (f1) لغت — دلوقتي f3 تدخل وحجزها يتأكد على طول
    update bookings set status = 'cancelled_by_user' where sbota_id = sf and profile_id = f1;
    begin
      perform fn_admit_waitlist(wid);
      select status::text into st from bookings where sbota_id = sf and profile_id = f3;
      r := r || case when st = 'paid' then 'نجح' else 'فشل — الحجز حالته ' || coalesce(st, 'مفيش') end;
    exception when others then
      r := r || ('فشل — ' || sqlerrm);
    end;

    -- (٩) المدفوعة: مستني الدفع بمهلة ٧ ساعات (من الإعدادات)
    begin
      perform fn_admit_waitlist((select id from waitlist where sbota_id = sp and profile_id = f5));
      select status::text, expires_at into st, ex from bookings where sbota_id = sp and profile_id = f5;
      r := r || case when st = 'pending_payment'
                          and ex between now() + interval '6 hours 59 minutes'
                                     and now() + interval '7 hours 1 minute'
                     then 'نجح'
                     else format('فشل — الحالة %s والمهلة %s', st, ex) end;
    exception when others then
      r := r || ('فشل — ' || sqlerrm);
    end;

    -- (١٠)
    select count(*) into n from waitlist where sbota_id in (sf, sp);
    r := r || case when n = 0 then 'نجح' else format('فشل — لسه %s في القايمة', n) end;

    -- (١١) و(١٢) إعادة لزق القديم
    r := r || case when (select prosrc from pg_proc where proname = 'fn_book_free')
                        like '%fn_booking_slot(%'
                   then 'نجح'
                   else 'فشل — fn_book_free رجعت لنسخة 0086 (اتلزقت بعد 0121؟) — الزق WORK_MIGRATION_40 تاني' end;
    r := r || case when (select prosrc from pg_proc where proname = 'fn_guard_booking_columns')
                        like '%nasbot.trusted_booking%'
                   then 'نجح'
                   else 'فشل — حارس الأعمدة رجع لنسخة 0054 والحجز المجاني وقع تاني — الزق WORK_MIGRATION_40 تاني' end;

    raise exception 'test_free_booking_rollback';
  exception when others then
    if sqlerrm <> 'test_free_booking_rollback' then
      r := r || ('فشل — استثناء: ' || sqlerrm);
    end if;
  end;
  execute format('set local role %I', me);
  perform set_config('request.jwt.claims', '', true);
  perform set_config('nasbot.trusted_booking', '', true);

  for i in 1 .. array_length(r, 1) loop
    test := coalesce(names[i], '0121 · الاختبار');
    result := r[i];
    return next;
  end loop;
end $body$;

comment on function test_free_booking() is
  '0121 — الحجز المجاني بيعدّي فعلًا (وبعد الإلغاء)، و«دخّله» من قايمة الانتظار بيحترم المكان ونصيب النوع والصلاحية.';
revoke execute on function test_free_booking() from public, anon, authenticated;
