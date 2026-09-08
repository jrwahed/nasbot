-- سطر الميتا في البطاقة بيبدأ بوصف النشاط والمستوى:
-- «بادل مبتدئين · الخميس 8 بالليل · التجمع» — الجزء الأول ده لازم يتخزن.
alter table sbota_templates add column if not exists meta_prefix_ar text;
alter table sbota_templates add column if not exists level_ar text;

comment on column sbota_templates.meta_prefix_ar is 'أول جزء في سطر الميتا — «بادل مبتدئين» · «كاياك + فطار».';
comment on column sbota_templates.level_ar is 'المستوى المعروض في صف المعلومات — «مبتدئين ومتوسطين».';

update sbota_templates set meta_prefix_ar = 'بادل مبتدئين',        level_ar = 'مبتدئين ومتوسطين'   where slug = 'ehna-el-rabe3';
update sbota_templates set meta_prefix_ar = 'كاياك + فطار',        level_ar = 'مبتدئين'            where slug = 'fetar-3al-nil';
update sbota_templates set meta_prefix_ar = 'هايك ليلي + شوي',     level_ar = 'مبتدئين ومتوسطين'   where slug = 'ba3d-ma-el-shams-teghib';
update sbota_templates set meta_prefix_ar = 'عشا مع 5 غرباء',      level_ar = 'أي حد'              where slug = 'tarabeza-setta';
update sbota_templates set meta_prefix_ar = 'بادل بنات بس',        level_ar = 'مبتدئات ومتوسطات'   where slug = 'el-mal3ab-lina';
update sbota_templates set meta_prefix_ar = 'شغل جنب بعض',         level_ar = 'أي حد'              where slug = 'work-cafe-tagamo3';
update sbota_templates set meta_prefix_ar = 'هايك صباحي',          level_ar = 'مبتدئين ومتوسطين'   where slug = 'shoro2-men-el-gabal';
update sbota_templates set meta_prefix_ar = 'مش هنقولك',           level_ar = 'أي حد راح سبوطتين'  where slug = 'mystery';

-- نضيفهم للعرض العام
drop view if exists sbotat_public;
create view sbotat_public
with (security_invoker = true)
as
select
  s.id, s.template_id, s.venue_id, s.captain_id,
  s.starts_at, s.ends_at, s.price, s.org_fee, s.capacity,
  s.status, s.girls_only, s.is_day, s.is_mystery,
  s.booking_closes_at, s.reveal_at,
  t.slug, t.name_ar, t.story_ar, t.kind, t.mood_ar,
  t.meta_prefix_ar, t.level_ar,
  t.includes_ar, t.excludes_ar, t.duration_min, t.hero_photos, t.overnight,
  v.area,
  case when s.address_hidden then null else v.address end as address,
  case when s.address_hidden then null else v.map_lat end as map_lat,
  case when s.address_hidden then null else v.map_lng end as map_lng,
  v.name as venue_name
from sbotat s
join sbota_templates t on t.id = s.template_id
left join venues v on v.id = s.venue_id
where s.status in ('open', 'full', 'locked', 'running');

comment on view sbotat_public is 'السبوطات المعروضة للكل — من غير العنوان ولا الإحداثيات لو address_hidden.';;
