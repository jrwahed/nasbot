-- العرض كان SECURITY DEFINER علشان يقدر يقرأ venues (المنطقة).
-- ده بيخلي العرض يتخطى RLS بالكامل — والمدقق بيعتبره خطأ، وهو محق.
--
-- الحل الأنضف: المنطقة صفة عرض، فبنحطها على sbotat نفسها،
-- والعرض يرجع security_invoker من غير ما يلمس venues خالص.
-- العنوان الحقيقي كان بيرجع null في العرض ده على أي حال —
-- مصدره الوحيد fn_sbota_address للحاجزين.

alter table sbotat add column if not exists area area_t;
comment on column sbotat.area is 'المنطقة المعروضة — منسوخة من المكان علشان العرض العام ما يحتاجش يقرأ venues.';

update sbotat s set area = v.area from venues v where v.id = s.venue_id and s.area is null;

-- تفضل متزامنة مع المكان
create or replace function fn_sync_sbota_area()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.venue_id is not null then
    select v.area into new.area from venues v where v.id = new.venue_id;
  end if;
  return new;
end;
$$;

create trigger t_sbota_area before insert or update of venue_id on sbotat
  for each row execute function fn_sync_sbota_area();

drop view if exists sbotat_public;

create view sbotat_public
with (security_invoker = true)
as
select
  s.id, s.template_id, s.venue_id, s.captain_id,
  s.starts_at, s.ends_at, s.price, s.org_fee, s.capacity,
  s.status, s.girls_only, s.is_day, s.is_mystery,
  s.booking_closes_at, s.reveal_at,
  s.area,
  t.slug, t.name_ar, t.story_ar, t.kind, t.mood_ar,
  t.meta_prefix_ar, t.level_ar,
  t.includes_ar, t.excludes_ar, t.duration_min, t.hero_photos, t.overnight
from sbotat s
join sbota_templates t on t.id = s.template_id
where s.status in ('open', 'full', 'locked', 'running');

comment on view sbotat_public is
  'السبوطات المعروضة للكل. security_invoker — بيحترم RLS. مفيش عنوان ولا إحداثيات هنا خالص؛ مصدرهم الوحيد fn_sbota_address وهي بتتحقق إن اللي بيسأل حاجز ودافع.';

grant select on sbotat_public to anon, authenticated;

revoke execute on function fn_sync_sbota_area() from public, anon, authenticated;;
