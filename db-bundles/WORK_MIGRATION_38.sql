-- ============================================================================
-- WORK_MIGRATION_38.sql — نص المجموعة ولاد ونصها بنات، والحجز بيقفل لوحده
--
-- سبوطة الـ٦ = ٣ ولاد + ٣ بنات · الـ٨ = ٤ + ٤. لما نوع يكمل نصّه، محدش من
-- نفس النوع يقدر يحجز. ولما العدد كله يكمل، السبوطة بتبقى «كامل» لوحدها
-- (وده بقى شغّال على خروجات الأعضاء المجانية كمان — قبل كده ما كانتش بتقفل).
--
-- مش بيتطبّق على «بنات بس» ولا سبوطات الشغل. وبيتقفل من
-- /admin/settings ← «توازن المجموعة».
--
-- بعده شغّل:
--   select fn_test_seed_up();
--   select * from test_gender_balance();   -- ٨ صفوف «نجح»
--   select fn_test_seed_down();
-- ============================================================================

-- ##########################################################################
-- # 20260930120000_0119_gender_balance.sql
-- ##########################################################################

-- ============================================================================
-- 0119 · نص المجموعة ولاد ونصها بنات — والحجز بيقفل لوحده لما يكمل
--
-- طلب المالك (٢٠٢٦-٠٩-٣٠): سبوطة الـ٦ = ٣ ولاد + ٣ بنات، والـ٨ = ٤ + ٤.
-- لما نوع يكمل نصّه، مفيش حد من نفس النوع يحجز تاني. ولما العدد كله يكمل،
-- السبوطة تبقى «كامل» لوحدها.
--
-- اللي كان موجود قبل كده:
--   · `fn_capacity_guard` بيمنع تعدّي **العدد الكلي** بس.
--   · `fn_booking_paid` بيقلب السبوطة `full` — بس محفّزه `after update`،
--     فحجز خروجة العضو المجانية (`fn_book_free` بيعمل `insert` بـ`paid` على
--     طول) **عمره ما قفل خروجة**. ده اتصلّح هنا كمان.
--
-- القواعد:
--   · نصيب كل نوع = `ceil(capacity / 2)`. ٦ → ٣ · ٨ → ٤ · ٧ → ٤ (والعدد
--     الكلي ٧ بيقفلها).
--   · مش بيتطبّق على: «بنات بس» (`girls_only`) · سبوطات الشغل (`is_work`) ·
--     وعضو نوعه مش متسجّل (بيتعدّ في العدد الكلي بس).
--   · بيتقفل ويتفتح من اللوحة: `settings.gender_balance` (مفتوح افتراضيًا).
--
-- ⚠ الحارس الحقيقي في المحفّز (`fn_capacity_guard`) — بيشتغل مهما كان
--   الطريق (تحويل · كارت · ببلاش · اللوحة). و`fn_gender_block` رسالة بدري
--   بس في `/api/pay/create`، علشان حد ما يحوّل فلوس على مكان مش هيتأكد.
--   وهي بتعدّ الحجوزات المستنية الدفع كمان (اللي لسه مهلتها ما خلصتش).
--
-- ⚠ مش بنلمس `fn_can_book` ولا `fn_book_free` عن قصد: الاتنين متعرّفين في
--   هجرات قديمة، وإعادة لزق أي واحدة منهم كانت هترجّع النسخة اللي من غير
--   الحارس (الدرس التالت). المحفّز متعرّف في `0004` بس، ومش في أي حزمة.
--
-- آمن يتكرر.
-- ============================================================================

-- ===== 1) المفتاح =====
alter table settings add column if not exists gender_balance boolean not null default true;
comment on column settings.gender_balance is
  'نص المجموعة ولاد ونصها بنات (ceil(capacity/2) لكل نوع). مش بيتطبّق على «بنات بس» ولا سبوطات الشغل. (0119)';


-- ===== 2) نصيب كل نوع — مصدر واحد للحارس والرسالة =====
-- بترجّع null لو التوازن مش مطبّق على السبوطة دي.
create or replace function fn_gender_cap(s_id uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select case
           when coalesce((select gender_balance from settings limit 1), true)
            and not s.girls_only
            and not s.is_work
           then ceil(s.capacity / 2.0)::int
         end
    from sbotat s
   where s.id = s_id
$$;
revoke execute on function fn_gender_cap(uuid) from public, anon, authenticated;


-- ===== 3) الحارس: نفس حارس السعة + حد النوع =====
create or replace function fn_capacity_guard()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cap   int;
  used  int;
  v_g   gender_t;
  g_cap int;
  g_used int;
begin
  if new.status <> 'paid' then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status = 'paid' then
    return new;
  end if;

  -- القفل على صف السبوطة قبل أي عدّ — تحت التزامن ما ينفعش اتنين يعدّوا سوا
  select capacity into cap from sbotat where id = new.sbota_id for update;

  select count(*) into used
  from bookings
  where sbota_id = new.sbota_id
    and status in ('paid', 'attended')
    and id <> new.id;

  if used >= cap then
    raise exception 'السبوطة كملت' using errcode = 'check_violation';
  end if;

  g_cap := fn_gender_cap(new.sbota_id);
  if g_cap is not null then
    select gender into v_g from profiles where id = new.profile_id;
    if v_g is not null then
      select count(*) into g_used
      from bookings b
      join profiles p on p.id = b.profile_id
      where b.sbota_id = new.sbota_id
        and b.status in ('paid', 'attended')
        and b.id <> new.id
        and p.gender = v_g;

      if g_used >= g_cap then
        raise exception '%', case v_g when 'female' then 'مكان البنات كمل في السبوطة دي'
                                      else 'مكان الولاد كمل في السبوطة دي' end
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  return new;
end;
$$;
comment on function fn_capacity_guard() is
  'بيمنع تجاوز السعة الكلية ونصيب كل نوع (0119) تحت التزامن بقفل صف السبوطة.';
revoke execute on function fn_capacity_guard() from public, anon, authenticated;


-- ===== 4) الرسالة بدري — قبل ما حد يحوّل =====
create or replace function fn_gender_block(p_id uuid, s_id uuid)
returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  g_cap  int := fn_gender_cap(s_id);
  v_g    gender_t;
  g_used int;
begin
  if g_cap is null then return null; end if;

  select gender into v_g from profiles where id = p_id;
  if v_g is null then return null; end if;

  select count(*) into g_used
  from bookings b
  join profiles p on p.id = b.profile_id
  where b.sbota_id = s_id
    and b.profile_id <> p_id
    and p.gender = v_g
    and (b.status in ('paid', 'attended')
         or (b.status = 'pending_payment'
             and (b.expires_at is null or b.expires_at > now())));

  if g_used >= g_cap then
    return case v_g when 'female' then 'مكان البنات كمل في السبوطة دي'
                    else 'مكان الولاد كمل في السبوطة دي' end;
  end if;
  return null;
end;
$$;
comment on function fn_gender_block(uuid, uuid) is
  'رسالة بدري لو نصيب نوع العضو كمل (بيعدّ المستني الدفع كمان). الحارس الحقيقي fn_capacity_guard. (0119)';
revoke execute on function fn_gender_block(uuid, uuid) from public, anon, authenticated;
grant execute on function fn_gender_block(uuid, uuid) to service_role;


-- ===== 5) القفل التلقائي — على الإدراج كمان =====
-- `fn_booking_paid` بيقفل على `update` بس. الحجز المجاني بيدخل `paid` على طول.
create or replace function fn_close_when_full()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  cap  int;
  used int;
begin
  select capacity into cap from sbotat where id = new.sbota_id;
  select count(*) into used from bookings
   where sbota_id = new.sbota_id and status in ('paid', 'attended');
  if used >= cap then
    update sbotat set status = 'full' where id = new.sbota_id and status = 'open';
  end if;
  return null;
end;
$$;
revoke execute on function fn_close_when_full() from public, anon, authenticated;

drop trigger if exists t_close_when_full on bookings;
create trigger t_close_when_full after insert on bookings
  for each row when (new.status = 'paid')
  execute function fn_close_when_full();


-- ===== 6) الاختبار =====
-- ⚠ محتاج `fn_test_seed_up()` قبله (الأعضاء: ٣ بنات + ولد).
-- ⚠ كل الكتابة جوه بلوك بيترمي في الآخر باستثناء متعمّد — فكل حاجة بترجع
--   زي ما كانت (المفتاح · السبوطات · الحجوزات)، حتى لو حاجة وقعت في النص.
create or replace function test_gender_balance()
returns table (test text, result text)
language plpgsql
set search_path = public
as $body$
declare
  tpl uuid := '66666666-0000-0000-0000-000000000004';
  ven uuid := '55555555-0000-0000-0000-000000000004';
  s4  uuid := '77777777-0000-0000-0000-000000000119';
  s2  uuid := '77777777-0000-0000-0000-000000000219';
  f1  uuid := '33333333-0000-0000-0000-000000000001';
  f3  uuid := '33333333-0000-0000-0000-000000000003';
  f5  uuid := '33333333-0000-0000-0000-000000000005';
  m1  uuid := '44444444-0000-0000-0000-000000000001';
  names text[] := array[
    '0119 · البنت التالتة في سبوطة الـ٤ اترفضت',
    '0119 · الولد عدّى في نفس السبوطة',
    '0119 · الرسالة بدري بتقول «مكان البنات كمل»',
    '0119 · الرسالة بتعدّ المستني الدفع',
    '0119 · اللي مستنيها الدفع مش بتتعدّ على نفسها',
    '0119 · السبوطة قفلت لوحدها لما كملت (حجز ببلاش)',
    '0119 · «بنات بس» مش بتتقسم',
    '0119 · المفتاح مقفول = مفيش تقسيم'];
  r   text[] := '{}';
  st  sbota_status_t;
  msg text;
  i   int;
begin
  if not exists (select 1 from profiles where id = m1)
     or not exists (select 1 from sbota_templates where id = tpl) then
    test := '0119 · نص ولاد ونص بنات';
    result := 'معلومة — محتاج البذرة المؤقتة (fn_test_seed_up)';
    return next;
    return;
  end if;

  begin
    update settings set gender_balance = true;

    insert into sbotat (id, template_id, venue_id, starts_at, ends_at, price, org_fee,
                        capacity, status, girls_only, is_day, is_mystery)
    values (s4, tpl, ven, now() + interval '6 days', now() + interval '6 days 2 hours',
            0, 0, 4, 'open', false, false, false),
           (s2, tpl, ven, now() + interval '6 days', now() + interval '6 days 2 hours',
            0, 0, 2, 'open', false, false, false);

    -- سبوطة الـ٤: نصيب كل نوع ٢
    insert into bookings (sbota_id, profile_id, status, price_paid) values (s4, f1, 'paid', 0);
    insert into bookings (sbota_id, profile_id, status, price_paid) values (s4, f3, 'paid', 0);

    -- (١) التالتة
    begin
      insert into bookings (sbota_id, profile_id, status, price_paid) values (s4, f5, 'paid', 0);
      r := r || 'فشل — 🔴 ٣ بنات دخلوا سبوطة الـ٤'::text;
    exception when check_violation then
      r := r || case when sqlerrm like '%البنات%' then 'نجح'
                     else 'فشل — اترفضت بس بسبب تاني: ' || sqlerrm end;
    end;

    -- (٢) الولد
    begin
      insert into bookings (sbota_id, profile_id, status, price_paid) values (s4, m1, 'paid', 0);
      r := r || 'نجح'::text;
    exception when others then
      r := r || ('فشل — الولد اترفض: ' || sqlerrm);
    end;

    -- (٣) الرسالة بدري
    msg := fn_gender_block(f5, s4);
    r := r || case when msg like '%البنات%' then 'نجح'
                   else 'فشل — رجّعت: ' || coalesce(msg, 'null') end;

    -- (٤) و(٥) المستني الدفع: نشيل حجز مدفوع ونحط مكانه مستني
    delete from bookings where sbota_id = s4 and profile_id = f3;
    insert into bookings (sbota_id, profile_id, status, price_paid, expires_at)
    values (s4, f3, 'pending_payment', 0, now() + interval '1 hour');
    msg := fn_gender_block(f5, s4);
    r := r || case when msg like '%البنات%' then 'نجح'
                   else 'فشل — حجز مستني الدفع ما اتعدّش (رجّعت: ' || coalesce(msg, 'null') || ')' end;
    msg := fn_gender_block(f3, s4);
    r := r || case when msg is null then 'نجح'
                   else 'فشل — العضوة مستنية الدفع ومتقفلة بحجزها هي: ' || msg end;

    -- (٦) سبوطة الـ٢: بنت + ولد ببلاش = كامل
    insert into bookings (sbota_id, profile_id, status, price_paid) values (s2, f1, 'paid', 0);
    insert into bookings (sbota_id, profile_id, status, price_paid) values (s2, m1, 'paid', 0);
    select status into st from sbotat where id = s2;
    r := r || case when st = 'full' then 'نجح'
                   else 'فشل — العدد كمل والحالة لسه ' || st end;

    -- (٧) «بنات بس»
    delete from bookings where sbota_id = s4;
    update sbotat set girls_only = true where id = s4;
    begin
      insert into bookings (sbota_id, profile_id, status, price_paid) values (s4, f1, 'paid', 0);
      insert into bookings (sbota_id, profile_id, status, price_paid) values (s4, f3, 'paid', 0);
      insert into bookings (sbota_id, profile_id, status, price_paid) values (s4, f5, 'paid', 0);
      r := r || 'نجح'::text;
    exception when others then
      r := r || ('فشل — سبوطة بنات بس رفضت بنت: ' || sqlerrm);
    end;

    -- (٨) المفتاح مقفول
    delete from bookings where sbota_id = s4;
    update sbotat set girls_only = false where id = s4;
    update settings set gender_balance = false;
    begin
      insert into bookings (sbota_id, profile_id, status, price_paid) values (s4, f1, 'paid', 0);
      insert into bookings (sbota_id, profile_id, status, price_paid) values (s4, f3, 'paid', 0);
      insert into bookings (sbota_id, profile_id, status, price_paid) values (s4, f5, 'paid', 0);
      r := r || 'نجح'::text;
    exception when others then
      r := r || ('فشل — المفتاح مقفول والتقسيم لسه شغّال: ' || sqlerrm);
    end;

    raise exception 'test_gender_balance_rollback';
  exception when others then
    if sqlerrm <> 'test_gender_balance_rollback' then
      r := r || ('فشل — استثناء: ' || sqlerrm);
    end if;
  end;

  for i in 1 .. array_length(r, 1) loop
    test := coalesce(names[i], '0119 · الاختبار');
    result := r[i];
    return next;
  end loop;
end $body$;

comment on function test_gender_balance() is
  '0119 — نص ولاد ونص بنات بيتمنع فعلًا في المحفّز، والرسالة بدري بتعدّ المستني، والحجز المجاني بيقفل السبوطة.';

revoke execute on function test_gender_balance() from public, anon, authenticated;
