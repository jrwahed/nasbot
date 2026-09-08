-- العرض كان security_invoker، فالربط بجدول venues كان بيترفض للزائر
-- (سياسة venues للإدارة بس) والنتيجة إن المنطقة كانت بترجع فاضية.
--
-- الصح: العرض نفسه هو حدّ الأمان — بيقرأ venues بصلاحية المالك،
-- وبيطلّع الأعمدة الآمنة بس، والعنوان والإحداثيات بيتصفّروا لو address_hidden.
drop view if exists sbotat_public;

create view sbotat_public
with (security_invoker = false)
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
  v.name as venue_name,
  -- العنوان والإحداثيات: بيظهروا بس لو السبوطة نفسها مش مخفية العنوان
  case when s.address_hidden then null else v.address end as address,
  case when s.address_hidden then null else v.map_lat end as map_lat,
  case when s.address_hidden then null else v.map_lng end as map_lng
from sbotat s
join sbota_templates t on t.id = s.template_id
left join venues v on v.id = s.venue_id
where s.status in ('open', 'full', 'locked', 'running');

comment on view sbotat_public is
  'السبوطات المعروضة للكل. العرض هو حدّ الأمان: بيقرأ venues بصلاحية المالك وبيطلّع الأعمدة الآمنة بس، والعنوان بيتصفّر لو address_hidden. العنوان الكامل عبر fn_sbota_address للحاجزين.';

grant select on sbotat_public to anon, authenticated;;
