-- ============================================================================
-- 0072 — وضع الصيانة بيوقف الحجز فعلًا (A3)
--
-- تعليق الجدول نفسه من يوم ما اتعمل بيقول:
--     'وضع الصيانة — بيوقف الحجز الجديد فورًا. owner بس.'
-- وده **عمره ما حصل**. مفيش سطر واحد في القاعدة ولا في الكود كان بيقرا
-- `maintenance.is_on` قبل الحجز. الميدل وير (اتصلّح قبل كده) بيقفل الصفحات،
-- بس `/api/*` مستثنى منه — يعني الموقع بيقول «مقفول» و/api/pay/create لسه
-- بياخد فلوس عادي.
--
-- الحل هنا: القاعدة هي اللي تقرر، مش الواجهة.
--   • fn_maintenance_on() — مصدر وحيد للحقيقة.
--   • fn_can_book بترجّع سبب المنع لما الصيانة شغّالة، فكل اللي بينده عليها
--     (الواجهة ومسارات الدفع) بيتوقف من نفس المكان.
--
-- الأدمن مستثنى عن قصد: لازم يقدر يجرّب الحجز وهو قافل الموقع.
-- ============================================================================

create or replace function fn_maintenance_on()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select is_on from maintenance where id), false);
$$;
comment on function fn_maintenance_on() is 'الموقع مقفول للصيانة؟ مصدر وحيد للحقيقة — متقراش الجدول مباشرة.';
grant execute on function fn_maintenance_on() to anon, authenticated, service_role;

/**
 * نفس fn_can_book بالحرف، بفحص الصيانة مضاف في الأول.
 * بنعدّل النص المتخزّن بدل ما نعيد كتابة الجسم كله — علشان أي تعديل نزل على
 * الدالة بعد 0007 ما يضيعش.
 */
do $$
declare
  src     text;
  new_src text;
  guard   text := $g$
  -- ===== الصيانة (0072) =====
  -- الموقع مقفول؟ محدش يحجز — إلا الأدمن، لازم يقدر يجرّب وهو قافل.
  if fn_maintenance_on() and not fn_is_admin() then
    return 'الموقع مقفول دلوقتي لشوية صيانة. ارجعلنا بعد شوية.';
  end if;
$g$;
begin
  select prosrc into src from pg_proc
   where proname = 'fn_can_book' and pronamespace = 'public'::regnamespace;

  if src is null then
    raise exception 'fn_can_book مش موجودة';
  end if;

  if src like '%fn_maintenance_on()%' then
    raise notice '0072: fn_can_book فيها فحص الصيانة أصلًا — عدّينا';
  else
    -- بنحقن الحارس بعد **أول `begin`** — يعني بعد قسم declare، أول سطر في
    -- الجسم. (المحاولة الأولى حقنته قبل declare فوقع بـ syntax error:
    -- `if` ما ينفعش يقف في قسم التعريفات.)
    new_src := regexp_replace(src, '\mbegin\M', 'begin' || guard, '');

    if new_src = src then
      raise exception '0072: مقدرناش نحقن الحارس في fn_can_book — راجعها بإيدك';
    end if;

    execute format(
      'create or replace function fn_can_book(p_id uuid, s_id uuid) returns text language plpgsql stable security definer set search_path = public as %L',
      new_src
    );
    raise notice '0072: اتحقن فحص الصيانة في fn_can_book';
  end if;
end $$;

-- ===== اختبار =====
create or replace function test_maintenance_blocks()
returns table (test text, result text)
language plpgsql
security definer
set search_path = public
as $$
begin
  test := '0072 · fn_maintenance_on موجودة';
  if exists (select 1 from pg_proc where proname = 'fn_maintenance_on') then
    result := 'نجح';
  else
    result := 'فشل — الدالة مش موجودة';
  end if;
  return next;

  test := '0072 · fn_can_book بتفحص الصيانة';
  if (select prosrc from pg_proc where proname = 'fn_can_book') like '%fn_maintenance_on()%' then
    result := 'نجح';
  else
    result := 'فشل — الحارس مش موجود، الحجز هيعدّي والموقع مقفول';
  end if;
  return next;

  test := '0072 · الصيانة مقفولة دلوقتي؟ (للعلم بس)';
  result := case when fn_maintenance_on() then 'الموقع مقفول' else 'الموقع شغّال' end;
  return next;
end;
$$;

revoke execute on function test_maintenance_blocks() from public, anon, authenticated;
