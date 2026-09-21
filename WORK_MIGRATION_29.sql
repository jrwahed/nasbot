-- ============================================================================
-- WORK_MIGRATION_29.sql — الأسامي ما بتطلعش لحجز لسه مش مدفوع
--
-- 🔴 **ثغرة حقيقية اتقفلت.** `fn_group_members` (اللي صفحة «حجزي» بتجيب
--    بيها أسامي المجموعة) كانت بتتأكد من حاجتين بس: إن الحجز بتاعك، وإن
--    ميعاد الكشف عدّى. ومكانتش بتسأل خالص: **هو الحجز ده اتدفع ولا لأ؟**
--
--    يعني: حد يحجز → يرفع أي صورة على إنها تحويل (الحجز بيفضل مستني
--    اعتمادك) → يستنى ميعاد الكشف → ويشوف أسامي المجموعة كلها وأنواعهم
--    ومناطقهم. من غير ما يدفع جنيه.
--
--    الصفحة نفسها كانت بتخبّي القايمة (اتصلّح قبل كده)، بس ده إخفاء زرار
--    مش حارس — نداء مباشر للدالة كان بيعدّي.
--
-- التصليح سطر واحد: الدالة بقت تنادي **نفس الحارس** اللي بينادوه
-- `fn_sbota_address` و`fn_sbota_arrival` و«معايا حد يعرف»
-- (`fn_can_see_place`) — مش نسخة تانية منه، علشان لو اتغيّر يوم يتغيّر
-- عند الأربعة مع بعض.
--
-- والملف كمان فيه **٩ نصوص** لحالات الحجز في صفحة «حجزي»: مستني التأكيد ·
-- في الانتظار · اتلغى. قبل كده الحالات التلاتة دي كانوا بيشوفوا نفس
-- الشاشة: «هتعرف مجموعتك…» وعدّاد تنازلي — يعني الموقع بيعد تنازلي لحجز
-- اتلغى.
--
-- بعده شغّل (بالترتيب):
--   select fn_test_seed_up();
--   select * from test_group_guard();     -- ٥ صفوف، كلهم «نجح»
--   select fn_test_seed_down();
-- ============================================================================

-- ##########################################################################
-- # 20260921120000_0110_group_guard.sql
-- ##########################################################################

-- ============================================================================
-- 0110 — الأسامي ما بتطلعش لحجز لسه مش مدفوع
--
-- 🔴 **الثغرة:** `fn_group_members` كانت بتتأكد من حاجتين بس: إن الحجز
--    **بتاعي أنا**، وإن ميعاد الكشف عدّى. ومكانتش بتسأل خالص عن **حالة
--    حجزي أنا**. يعني:
--
--      حد يحجز → يرفع أي صورة على إنها تحويل (الحجز بيفضل
--      `pending_payment` لحد ما اللوحة تعتمد) → يستنى ميعاد الكشف →
--      ينادي الدالة → **الأسامي والأنواع والمناطق كلها بترجعله**.
--
--    والدالة `security definer`، يعني RLS مش بتنقذنا — الحارس الوحيد هو
--    اللي جوه الدالة.
--
-- ⚠ الواجهة كانت بتغطّي عليها: `getGroup` بتحسب `revealed` بـ
--    `booking.paid && …` (اتصلّحت في الدرس التناشر). بس ده حارس واجهة —
--    نداء مباشر للـRPC بيعدّيه. والقاعدة الحاكمة عندنا:
--    **الأمان من القاعدة مش من إخفاء الأزرار.**
--
-- التصليح على قاعدة الدرس الستاشر: **منناخش نسخة تانية من الحارس** —
-- بننادي `fn_can_see_place` نفسها اللي بيناديها `fn_sbota_address`
-- و`fn_sbota_arrival` و`fn_safety_view`. فلو الحارس اتغيّر يوم،
-- بيتغيّر عند الأربعة مع بعض.
--
-- والباقي **منقول بالحرف** من `0106`: نفس الأعمدة ونفس الشروط ونفس
-- الترتيب. السطر الجديد واحد بس.
--
-- آمنة تتكرر: `drop function if exists` + `create` + منح صريح بعدها.
-- ============================================================================

drop function if exists fn_group_members(uuid);

create function fn_group_members(p_booking_id uuid)
returns table (
  profile_id uuid, first_name text, initial text, persona persona_t,
  times_before integer, line_ar text,
  area_code text, area_label text, same_area boolean
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (
    select b.group_id, b.sbota_id,
           (select p.area from profiles p where p.id = auth.uid()) as my_area
    from bookings b
    where b.id = p_booking_id
      and b.profile_id = auth.uid()
      -- 🔴 السطر ده هو التصليح: حجزي أنا لازم يكون مدفوع.
      --    نفس الحارس بتاع المكان بالحرف — مش نسخة منه.
      and fn_can_see_place(b.sbota_id, auth.uid())
  ),
  revealed as (
    select s.reveal_at <= now() as ok
    from sbotat s join me on me.sbota_id = s.id
  )
  select
    p.id,
    p.first_name,
    left(p.first_name, 1),
    p.type,
    p.sbota_count,
    case p.sbota_count
      when 0 then 'أول مرة'
      when 1 then 'المرة التانية'
      when 2 then 'المرة التالتة'
      else 'المرة ' || (p.sbota_count + 1)::text
    end,
    p.area::text,
    case when p.area = 'other' then nullif(btrim(p.area_other), '') end,
    coalesce(p.area <> 'other' and p.area = (select m.my_area from me m), false)
  from bookings b
  join profiles p on p.id = b.profile_id
  join me on b.group_id = me.group_id
  where b.status in ('paid','attended')
    and b.profile_id <> auth.uid()
    and (select ok from revealed)
    and p.deleted_at is null;
$$;

comment on function fn_group_members(uuid) is
  'أعضاء مجموعتك بعد الكشف ومعاهم المنطقة — والحارس `fn_can_see_place` يعني حجزك انت كمان لازم يكون مدفوع (0110).';

revoke execute on function fn_group_members(uuid) from public, anon;
grant execute on function fn_group_members(uuid) to authenticated;


-- ===== دالة الاختبار =====
--
-- ⚠ `security invoker` وبتلبس الأدوار — زي `test_rls` بالظبط، لأن
--    `set role` ما ينفعش جوه `security definer`.
--
-- ⚠ وبتشتغل على البذرة المؤقتة (`fn_test_seed_up`). لو البذرة مش موجودة
--    بترجّع صف معلومة بدل ما تقول «فشل» على حاجة سليمة.
drop function if exists test_group_guard();

create function test_group_guard()
returns table (test text, result text)
language plpgsql
set search_path = public
as $body$
declare
  v_me    uuid := '33333333-0000-0000-0000-000000000001';  -- مريم
  v_out   uuid := '44444444-0000-0000-0000-000000000001';  -- فاحص، مش في المجموعة
  v_bk    uuid := 'aaaaaaaa-0000-0000-0000-000000000001';  -- حجز مريم
  v_sb    uuid := '77777777-0000-0000-0000-000000000001';
  v_start timestamptz;
  n int;
begin
  if not exists (select 1 from bookings where id = v_bk) then
    test := '0110 · حارس المجموعة';
    result := 'معلومة — البذرة المؤقتة مش موجودة، شغّل fn_test_seed_up() الأول';
    return next;
    return;
  end if;

  select starts_at into v_start from sbotat where id = v_sb;

  set local role authenticated;

  -- (1) الوضع الطبيعي: مدفوع وبعد الكشف → الأسامي بترجع
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_me, 'role', 'authenticated')::text, true);
  select count(*) into n from fn_group_members(v_bk);
  test := '0110 · مدفوع وبعد الكشف → الأسامي بترجع';
  result := case when n = 2 then 'نجح' else format('فشل — رجّعت %s بدل 2', n) end;
  return next;

  -- (2) 🔴 نفس الحجز بالظبط وهو `pending_payment` → لازم ولا اسم
  --
  -- ⚠ `reset role` لوحده **مش كفاية**: محفّز `fn_guard_booking_columns`
  --   بيقرا الدور من `request.jwt.claims` مش من `current_user` (القاعدة
  --   التالتة في §5). فلو سبنا الـclaims شغّالة، المحفّز بيعتبرنا متصفح
  --   ويرفض تعديل الحالة. لازم نشيل الاتنين.
  reset role;
  perform set_config('request.jwt.claims', null, true);
  update bookings set status = 'pending_payment' where id = v_bk;
  set local role authenticated;
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_me, 'role', 'authenticated')::text, true);
  select count(*) into n from fn_group_members(v_bk);
  test := '0110 · حجز لسه مش مدفوع → مفيش ولا اسم';
  result := case when n = 0 then 'نجح'
                 else format('فشل — 🔴 شاف %s اسم وهو لسه مدفعش', n) end;
  return next;

  reset role;
  perform set_config('request.jwt.claims', null, true);
  update bookings set status = 'paid' where id = v_bk;

  -- (3) مدفوع بس **قبل** الكشف → برضه ولا اسم
  update sbotat set starts_at = now() + interval '10 days',
                    ends_at   = now() + interval '10 days 3 hours'
   where id = v_sb;
  set local role authenticated;
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_me, 'role', 'authenticated')::text, true);
  select count(*) into n from fn_group_members(v_bk);
  test := '0110 · مدفوع وقبل الكشف → مفيش ولا اسم';
  result := case when n = 0 then 'نجح' else format('فشل — الكشف اتقدّم، شاف %s', n) end;
  return next;

  reset role;
  perform set_config('request.jwt.claims', null, true);
  update sbotat set starts_at = v_start, ends_at = v_start + interval '2 hours'
   where id = v_sb;

  -- (4) عضو من بره المجموعة بيسأل بحجز مش بتاعه
  set local role authenticated;
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_out, 'role', 'authenticated')::text, true);
  select count(*) into n from fn_group_members(v_bk);
  test := '0110 · حجز مش بتاعي → مفيش ولا اسم';
  result := case when n = 0 then 'نجح' else format('فشل — 🔴 قرا مجموعة غيره (%s)', n) end;
  return next;

  -- (5) الزائر المجهول
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin
    select count(*) into n from fn_group_members(v_bk);
    test := '0110 · الزائر المجهول';
    result := case when n = 0 then 'نجح (رجّعت فاضي)'
                   else format('فشل — 🔴 المجهول شاف %s اسم', n) end;
  exception when insufficient_privilege then
    test := '0110 · الزائر المجهول';
    result := 'نجح (permission denied)';
  end;
  return next;

  -- ⚠ الترجيع: الدور والهوية والبيانات — من غيره الدالة اللي بعدها
  --   بتشتغل بهوية غلط (الدرس الأول في CHECK_DB).
  reset role;
  perform set_config('request.jwt.claims', null, true);
  update bookings set status = 'paid' where id = v_bk;
  update sbotat set starts_at = v_start, ends_at = v_start + interval '2 hours'
   where id = v_sb;
end $body$;

comment on function test_group_guard() is
  '0110 — أسامي المجموعة ما بتطلعش قبل الكشف ولا لحجز مش مدفوع ولا لحد مش صاحب الحجز.';


-- ===== نصوص حالات الحجز التلاتة =====
--
-- ⚠ صفحة `/my/[id]` كانت بتعرف حالتين بس: «اتكشف» و«لسه». فاللي حجز
--   ودفع ومستني اعتماد اللوحة، واللي في قايمة الانتظار، واللي حجزه
--   **اتلغى** — تلاتتهم كانوا بيشوفوا نفس الشاشة: «هتعرف مجموعتك…» وعدّاد
--   تنازلي. يعني الموقع بيطمّن حد مكانه مش مضمون، أو بيعد لحجز مش موجود.
insert into copy_strings (key, value_ar, screen, context_ar) values
  ('group.stage.pendingTitle',   'مكانك لسه مش مأكد', 'كشف المجموعة',
   'عنوان لما الحجز لسه pending_payment'),
  ('group.stage.pendingNote',    'بعتّ التحويل؟ بنراجعه ونأكّدلك في أقرب وقت. لو لسه، ابعته دلوقتي وابعتلنا صورته.',
   'كشف المجموعة', 'شرح حالة الانتظار'),
  ('group.stage.pendingCta',     'كمّل الدفع', 'كشف المجموعة', 'زرار بيرجّعه لصفحة الدفع'),
  ('group.stage.confirmedTitle', 'مكانك مأكد', 'كشف المجموعة',
   'عنوان لما الحجز اتأكد وقبل الكشف'),
  ('group.stage.waitlistTitle',  'انت في الانتظار', 'كشف المجموعة',
   'عنوان لما الحجز waitlist'),
  ('group.stage.waitlistNote',   'السبوطة كملت. لو حد سحب، مكانه ليك وهنبعتلك على طول.',
   'كشف المجموعة', 'شرح قايمة الانتظار'),
  ('group.stage.cancelledTitle', 'الحجز ده اتلغى', 'كشف المجموعة',
   'عنوان لما الحجز اتلغى أو اترجّع'),
  ('group.stage.cancelledNote',  'لو ده مش مقصود، كلمنا وهنشوفلك مكان تاني.',
   'كشف المجموعة', 'شرح الإلغاء'),
  ('group.stage.browse',         'شوف سبوطات تانية', 'كشف المجموعة',
   'زرار بيرجّعه للرئيسية من شاشة الإلغاء')
on conflict (key) do nothing;
