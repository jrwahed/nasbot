-- ============================================================================
-- 0064 — حد قِدَم الإشعار قبل ما يتبعت (صمام أمان قبل نشر تصليح D5)
--
-- الخلفية: المصرف كان بيسحب `template_key like 'work%'` بس، فكل الإشعارات
-- التانية (booking_confirmed · group_reveal · التذكيرات · mutual_match) قاعدة
-- في الطابور بحالة `queued` من يوم ما الموقع اشتغل. تصليح D5 خلّى المصرف
-- يسحب **كل** الصفوف — يعني أول ما التصليح ينزل، الطابور المتراكم كله هيتبعت
-- دفعة واحدة: تذكيرات بسبوطات عدّت من أسابيع، وكشف مجموعات خلصت.
--
-- ده مش تصليح، ده إحراج. فالمصرف بقى بيتخطّى أي صف ميعاده عدّى بأكتر من
-- `notify_max_stale_hours` ساعة، وبيقفله `failed` بسبب واضح بدل ما يبعته.
--
-- الرقم في settings مش في الكود (قاعدة المشروع). الافتراضي 24 ساعة: إشعار
-- فات عليه أكتر من يوم مبقاش له معنى للعضو.
-- صفر = مفيش حد (ابعت كل حاجة) — للطوارئ بس.
-- ============================================================================

alter table settings
  add column if not exists notify_max_stale_hours int not null default 24;

comment on column settings.notify_max_stale_hours is
  'إشعار ميعاده عدّى بأكتر من كده بالساعات بيتقفل failed من غير إرسال. صفر = ابعت كل حاجة مهما قدمت.';

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'settings_notify_stale_sane'
  ) then
    alter table settings add constraint settings_notify_stale_sane
      check (notify_max_stale_hours >= 0 and notify_max_stale_hours <= 8760);
  end if;
end $$;

create or replace function test_notify_stale()
returns table (test text, result text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v int;
begin
  test := '0064 · عمود notify_max_stale_hours موجود وبقيمة معقولة';
  select notify_max_stale_hours into v from settings limit 1;
  if v is null then
    result := 'فشل — العمود مش موجود أو فاضي';
  elsif v between 0 and 8760 then
    result := format('نجح — %s ساعة', v);
  else
    result := format('فشل — قيمة غريبة: %s', v);
  end if;
  return next;
end;
$$;

revoke execute on function test_notify_stale() from public, anon, authenticated;
