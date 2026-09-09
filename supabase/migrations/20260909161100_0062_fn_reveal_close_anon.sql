-- ============================================================================
-- 0062 — سدّ ثغرة فتحها 0057 في fn_reveal
--
-- المشكلة: 0057 منح fn_reveal لـ authenticated بس ما سحبهاش من public، وفي
-- بوستجرس أي دالة جديدة بتبقى منفّذة لـ PUBLIC افتراضيًا — يعني anon كمان.
-- وأسوأ من كده، الحارس جوّه الدالة كان:
--
--     if auth.uid() is not null and not fn_has_permission('matching.approve')
--
-- والزائر المجهول (anon من غير جلسة) auth.uid() بتاعه **null** — فالشرط بيبقى
-- false والحارس بيعدّيه. النتيجة: أي حد على النت يقدر ينده
-- fn_reveal('<أي سبوطة>') ويكشف المجموعة قبل ميعادها لكل الناس.
--
-- (الاختبار test_review_fixes() هو اللي مسك دي — السطر «0057 · fn_reveal
-- موجودة ومقفولة على anon» كان بيقول «فشل — anon يقدر ينفّذها».)
--
-- الحل، طبقتين:
--   1) نسحب التنفيذ من public و anon — الطبقة اللي المفروض كانت من الأول.
--   2) نصلّح الحارس نفسه يبقى على `current_user` زي fn_guard_booking_columns
--      (0054) بدل auth.uid(): أي نداء جاي من المتصفح (anon/authenticated)
--      لازم معاه matching.approve. النداء الداخلي (الكرون job_reveal_due وهو
--      definer مملوك لـ postgres، ومسارات مفتاح الخدمة) current_user بتاعه
--      postgres/service_role فبيعدّي زي ما هو.
-- ============================================================================

-- ===== 1) سحب التنفيذ من الزائر المجهول =====
revoke execute on function fn_reveal(uuid) from public;
revoke execute on function fn_reveal(uuid) from anon;
grant  execute on function fn_reveal(uuid) to authenticated;

-- ===== 2) تصليح الحارس جوّه الدالة =====
-- بنعدّل أول سطرين الحارس بس؛ باقي جسم الدالة زي ما 0057 سابه بالحرف.
do $$
declare
  src  text;
  new_src text;
begin
  select prosrc into src from pg_proc
   where proname = 'fn_reveal' and pronamespace = 'public'::regnamespace;

  if src is null then
    raise exception 'fn_reveal مش موجودة — طبّق 0057 الأول';
  end if;

  new_src := replace(
    src,
    'if auth.uid() is not null and not fn_has_permission(''matching.approve'') then',
    'if current_user in (''anon'', ''authenticated'') and not fn_has_permission(''matching.approve'') then'
  );

  if new_src = src then
    -- إما الملف اتشغّل قبل كده (الحالة الطبيعية لو بتعيده)، وإما الحارس
    -- اتكتب بشكل تاني — في الحالتين منعملش حاجة على العمياني.
    if src like '%current_user in (''anon'', ''authenticated'')%' then
      raise notice '0062: حارس fn_reveal متصلّح أصلًا — عدّينا';
    else
      raise notice '0062: ⚠ حارس fn_reveal مش على الشكل المتوقع — اتأكد منه بإيدك';
    end if;
  else
    execute format(
      'create or replace function fn_reveal(p_sbota uuid) returns int language plpgsql security definer set search_path = public as %L',
      new_src
    );
    -- create or replace بيحافظ على الصلاحيات، بس نأكد تاني للاطمئنان
    revoke execute on function fn_reveal(uuid) from public, anon;
    grant  execute on function fn_reveal(uuid) to authenticated;
  end if;
end $$;

comment on function fn_reveal(uuid) is
  'بينشئ المجموعات والغرف وبيبعت رسالة الكشف. مرة واحدة لكل سبوطة. النداء من المتصفح محتاج matching.approve، والزائر المجهول ممنوع خالص.';

-- ===== 3) نفس المراجعة على باقي دوال الكشف/المطابقة =====
-- أي دالة حساسة تانية اتعملت في الدفعة دي من غير revoke — نقفلها هنا كمان.
do $$
declare
  f record;
begin
  for f in
    select p.oid::regprocedure as sig
      from pg_proc p
     where p.pronamespace = 'public'::regnamespace
       and p.proname in ('fn_build_matching', 'fn_build_work_matching')
       and has_function_privilege('anon', p.oid, 'execute')
  loop
    execute format('revoke execute on function %s from public, anon', f.sig);
    raise notice '0062: اتقفلت على anon — %', f.sig;
  end loop;
end $$;
