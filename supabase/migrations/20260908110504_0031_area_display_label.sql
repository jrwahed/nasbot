-- المنطقة المعدودة (area_t) فيها 6 قيم بس لأنها بتخدم تفضيل المستخدم في النموذج.
-- بس العرض محتاج أسماء أدق: «وادي دجلة» مش «المعادي».
-- فبنضيف تسمية عرض حرة جنب القيمة المعدودة.
alter table venues add column if not exists area_label_ar text;
alter table sbotat add column if not exists area_label_ar text;

comment on column venues.area_label_ar is 'اسم المنطقة المعروض — أدق من area_t المعدودة.';
comment on column sbotat.area_label_ar is 'منسوخ من المكان علشان العرض العام.';

update venues set area_label_ar = case
  when name like '%وادي دجلة%' then 'وادي دجلة'
  when area = 'tagamoa'            then 'التجمع'
  when area = 'maadi'              then 'المعادي'
  when area = 'zayed_october'      then 'زايد وأكتوبر'
  when area = 'heliopolis_nasr'    then 'مصر الجديدة ومدينة نصر'
  when area = 'downtown_zamalek'   then 'الزمالك ووسط البلد'
  else 'القاهرة' end
where area_label_ar is null;

update sbotat s set area_label_ar = v.area_label_ar
from venues v where v.id = s.venue_id;

-- تفضل متزامنة
create or replace function fn_sync_sbota_area()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.venue_id is not null then
    select v.area, v.area_label_ar into new.area, new.area_label_ar
    from venues v where v.id = new.venue_id;
  end if;
  return new;
end;
$$;

revoke execute on function fn_sync_sbota_area() from public, anon, authenticated;

drop view if exists sbotat_public;
create view sbotat_public
with (security_invoker = true)
as
select
  s.id, s.template_id, s.venue_id, s.captain_id,
  s.starts_at, s.ends_at, s.price, s.org_fee, s.capacity,
  s.status, s.girls_only, s.is_day, s.is_mystery,
  s.booking_closes_at, s.reveal_at,
  s.area, s.area_label_ar,
  t.slug, t.name_ar, t.story_ar, t.kind, t.mood_ar,
  t.meta_prefix_ar, t.level_ar,
  t.includes_ar, t.excludes_ar, t.duration_min, t.hero_photos, t.overnight
from sbotat s
join sbota_templates t on t.id = s.template_id
where s.status in ('open', 'full', 'locked', 'running');

comment on view sbotat_public is
  'السبوطات المعروضة للكل. security_invoker — بيحترم RLS. مفيش عنوان ولا إحداثيات هنا خالص؛ مصدرهم الوحيد fn_sbota_address وهي بتتحقق إن اللي بيسأل حاجز ودافع.';

grant select on sbotat_public to anon, authenticated;

select t.name_ar, s.area_label_ar from sbotat s join sbota_templates t on t.id=s.template_id order by s.starts_at;;
