-- ============================================================================
-- 0074 — افتراضات التسعير (شاشة /admin/pricing)
--
-- شاشة التسعير بتحسب سيناريوهات الدخل والصافي. الافتراضات اللي المالك بيلعب
-- بيها (سبوطات الأسبوع · متوسط النفوس · نسبة المدفوع · أجر الكابتن · الثابت
-- الشهري …) لازم تفضل محفوظة، وإلا كل مرة يفتح الشاشة يبدأ من الأول.
--
-- عمود jsonb واحد بدل ١٠ أعمدة: دي **افتراضات تخطيط** مش أرقام بيشتغل بيها
-- الموقع. الأرقام اللي الموقع بيشتغل بيها (org_fee · gateway_fee_pct) موجودة
-- في مكانها بالفعل، والشاشة بتقراها منه — مش بتكرّرها هنا.
-- ============================================================================

alter table settings
  add column if not exists pricing_assumptions jsonb not null default '{}'::jsonb;

comment on column settings.pricing_assumptions is
  'افتراضات شاشة التسعير (تخطيط بس، الموقع ما بيشتغلش بيها). المفاتيح: sbotatPerWeek · avgHeads · paidShare · marginPerHead · captainFee · fixedMonthly';

create or replace function test_pricing_assumptions()
returns table (test text, result text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v jsonb;
begin
  test := '0074 · عمود pricing_assumptions موجود';
  select pricing_assumptions into v from settings limit 1;
  if v is null then
    result := 'فشل — العمود مش موجود';
  else
    result := format('نجح — %s مفتاح محفوظ', (select count(*) from jsonb_object_keys(v)));
  end if;
  return next;

  test := '0074 · الأرقام اللي الشاشة بتقراها من مكانها موجودة';
  if exists (
    select 1 from information_schema.columns
     where table_name = 'settings' and column_name = 'gateway_fee_pct'
  ) and exists (
    select 1 from information_schema.columns
     where table_name = 'sbota_templates' and column_name = 'org_fee'
  ) then
    result := 'نجح';
  else
    result := 'فشل — gateway_fee_pct أو org_fee ناقص';
  end if;
  return next;
end;
$$;

revoke execute on function test_pricing_assumptions() from public, anon, authenticated;
