-- اسم الكابتن بيتعرض للكل على البطاقات وصفحة السبوطة، بس RLS بتمنع
-- الزائر من قراءة profiles (وده صح). فبننسخ الاسم المعروض على captains،
-- زي ما عملنا مع المنطقة — بيانات عرض مش بيانات شخصية.
alter table captains add column if not exists display_name text;
alter table captains add column if not exists craft_ar text;
alter table captains add column if not exists photo_path text;

comment on column captains.display_name is 'الاسم المعروض للكابتن — منسوخ علشان الزائر يشوفه من غير ما نفتح profiles.';
comment on column captains.craft_ar is 'التخصص بالعربي — بادل · كاياك · شغل · هايك.';

update captains c set display_name = p.first_name
from profiles p where p.id = c.profile_id and c.display_name is null;

update captains set craft_ar = case
  when 'padel' = any(activities) then 'بادل'
  when 'kayak' = any(activities) then 'كاياك'
  when 'work'  = any(activities) then 'شغل'
  when 'hike'  = any(activities) then 'هايك'
  else null end
where craft_ar is null;

-- تفضل متزامنة لو الاسم اتغير
create or replace function fn_sync_captain_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update captains set display_name = new.first_name
  where profile_id = new.id and new.first_name is not null;
  return null;
end;
$$;

create trigger t_sync_captain_name after update of first_name on profiles
  for each row execute function fn_sync_captain_name();

revoke execute on function fn_sync_captain_name() from public, anon, authenticated;

select display_name, craft_ar from captains order by display_name;;
