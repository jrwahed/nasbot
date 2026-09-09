-- ============================================================================
-- 0071 — حجم صفحة اللوحة في settings + مجموع الفلوس الحقيقي
--
-- حاجتين طلعوا من تصليح A17 (الترقيم من الخادم):
--
-- ١) `ADMIN_PAGE_SIZE` اتكتب ثابت في `src/components/admin-ui.tsx` — مخالفة
--    صريحة لقاعدة المشروع رقم ٢ (كل رقم في settings). الوكيل اللي عمل الترقيم
--    مكانش معاه صلاحية يكتب هجرة، فسابه ثابت وسجّله. هنا بنكمّله.
--
-- ٢) صفحة الفلوس كانت بتعرض «مجموع اللي تمّ» محسوب من الصفوف اللي محمّلة.
--    بعد الترقيم بقت بتشوف ٥٠ صف بس، فالمجموع بقى مجموع الصفحة مش المجموع
--    الحقيقي. المالك بيقرا الرقم ده علشان يعرف دخل النادي — رقم ناقص أسوأ من
--    رقم مش موجود. الحل: نحسبه في القاعدة (sum) بدل ما نجمع في المتصفح.
-- ============================================================================

-- ===== ١) حجم الصفحة =====
alter table settings
  add column if not exists admin_page_size int not null default 50;

comment on column settings.admin_page_size is
  'عدد الصفوف في صفحة اللوحة الواحدة. أكبر = تقليب أقل بس تحميل أتقل.';

do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'settings_admin_page_size_sane') then
    alter table settings add constraint settings_admin_page_size_sane
      check (admin_page_size between 10 and 200);
  end if;
end $$;

-- ===== ٢) مجاميع الفلوس الحقيقية =====
/**
 * مجموع وعدد المعاملات لكل حالة — محسوبين في القاعدة على **كل** الصفوف.
 * المبالغ بالقروش زي ما هي متخزّنة؛ الواجهة بتحوّلها لجنيه.
 *
 * الصلاحية: `payments.view` — نفس اللي بيفتح الصفحة. الفحص جوه الدالة لأنها
 * definer (السطر ده هو الحد الأمني، مش إخفاء الزرار).
 */
create or replace function fn_payments_totals()
returns table (status payment_status_t, n bigint, total_piastres bigint)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not fn_has_permission('payments.view') then
    raise exception 'محتاج صلاحية payments.view';
  end if;

  return query
    select p.status, count(*)::bigint, coalesce(sum(p.amount), 0)::bigint
      from payments p
     group by p.status;
end;
$$;

comment on function fn_payments_totals() is
  'مجموع وعدد المعاملات لكل حالة على كل الصفوف — علشان اللوحة ما تجمعش الصفحة اللي قدامها بس.';
revoke execute on function fn_payments_totals() from public, anon;
grant  execute on function fn_payments_totals() to authenticated;

-- ===== اختبار =====
create or replace function test_admin_page_and_totals()
returns table (test text, result text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v int;
begin
  test := '0071 · admin_page_size في settings';
  select admin_page_size into v from settings limit 1;
  if v is null then
    result := 'فشل — العمود مش موجود';
  elsif v between 10 and 200 then
    result := format('نجح — %s صف', v);
  else
    result := format('فشل — قيمة غريبة: %s', v);
  end if;
  return next;

  test := '0071 · fn_payments_totals موجودة ومقفولة على الزائر';
  if not exists (select 1 from pg_proc where proname = 'fn_payments_totals') then
    result := 'فشل — الدالة مش موجودة';
  elsif has_function_privilege('anon', 'fn_payments_totals()', 'execute') then
    result := 'فشل — الزائر يقدر ينفّذها';
  else
    result := 'نجح';
  end if;
  return next;

  test := '0071 · الدالة بتتحقق من الصلاحية جوّاها';
  if (select prosrc from pg_proc where proname = 'fn_payments_totals')
     like '%fn_has_permission(''payments.view'')%' then
    result := 'نجح';
  else
    result := 'فشل — مفيش فحص صلاحية جوه definer';
  end if;
  return next;
end;
$$;

revoke execute on function test_admin_page_and_totals() from public, anon, authenticated;
