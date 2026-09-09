-- ============================================================================
-- 0066 — كتل الخريطة في القاعدة (A5)
--
-- المشكلة: /admin/map بيكتب على `venues`، والخريطة العامة (src/app/map +
-- src/components/CairoMap) كانت بتقرا كل حاجة من src/data/areas.ts:
-- الكتل وأسماءها ونقط السبوطات (٧ slugs متكتوبين بالإيد!). يعني أي سبوطة
-- جديدة عمرها ما كانت تبان على الخريطة، وأي تعديل من اللوحة ما كانش بيوصل.
--
-- ليه مش عرض عام على venues؟
--   `venues` فيه أعمدة حساسة (contact_phone · contract_notes · wholesale_price
--   · tourism_license_no · verified_by) وقراءته مقفولة على fn_is_admin().
--   كان ممكن نعمل venues_public بالأعمدة الآمنة — بس **الإحداثيات والاسم
--   والعنوان مش آمنين**: `sbotat.address_hidden` قاعدته إن مكان الخروجة ما
--   يظهرش غير لصاحب حجز مدفوع، ونشر map_lat/map_lng للزائر بيكسر القاعدة دي
--   بالظبط. فالخريطة العامة **ما بتلمسش venues خالص**: الكتل من الجدول اللي
--   تحت، والنقط بتتحسب من `sbotat_public` (المنطقة بس، من غير عنوان ولا
--   إحداثيات حقيقية) وبتتحط جوه كتلة منطقتها.
--   إحداثيات venues بتفضل أداة داخلية في /admin/map زي ما هي.
--
-- الجدول ده هندسة عرض (رسم SVG) + الاسم المعروض. الرسم بيتعمل في مساحة
-- viewBox 400×520.
-- ============================================================================

create table if not exists map_areas (
  key           text primary key,
  label_ar      text not null,
  -- المنطقة المعدودة — بتربط الكتلة بـ sbotat.area وبالمناطق اللي المستخدم راحها
  area          area_t,
  -- أسماء المناطق المعروضة اللي بتقع في الكتلة دي (sbotat.area_label_ar)
  match_labels  text[] not null default '{}',
  x             integer not null default 0,
  y             integer not null default 0,
  w             integer not null default 0,
  h             integer not null default 0,
  r             integer not null default 24,
  lx            integer not null default 0,
  ly            integer not null default 0,
  is_far        boolean not null default false,
  note_ar       text,
  -- صف واحد بس بـ true — نقطة السبوطة الغامضة، مكانها في (lx, ly)
  is_mystery    boolean not null default false,
  sort          integer not null default 1,
  is_active     boolean not null default true,
  updated_at    timestamptz not null default now()
);

comment on table map_areas is
  'كتل خريطة القاهرة المرسومة (viewBox 400×520) — الاسم المعروض والهندسة. مصدر /map و CairoMap.';
comment on column map_areas.match_labels is
  'أسماء المناطق المعروضة اللي بتقع في الكتلة — بتقابل sbotat.area_label_ar علشان نحط النقطة.';
comment on column map_areas.is_mystery is
  'الصف ده مش كتلة — دي نقطة السبوطة الغامضة، مكانها (lx, ly).';

do $$ begin
  if not exists (select 1 from pg_trigger where tgname = 't_map_areas_updated') then
    create trigger t_map_areas_updated before update on map_areas
      for each row execute function set_updated_at();
  end if;
end $$;

-- ===== RLS =====
alter table map_areas enable row level security;

-- الزائر بيشوف الكتل النشطة (الخريطة صفحة عامة)، والمالك بيشوف الكل.
drop policy if exists map_areas_read on map_areas;
create policy map_areas_read on map_areas for select
  using (is_active or fn_has_permission('map.edit'));

-- الكتابة على صلاحية الخريطة بالتحديد — مش fn_is_admin (قاعدة CLAUDE.md §٥).
drop policy if exists map_areas_write on map_areas;
create policy map_areas_write on map_areas for all
  using (fn_has_permission('map.edit'))
  with check (fn_has_permission('map.edit'));

grant select on map_areas to anon, authenticated;
grant insert, update, delete on map_areas to authenticated;

-- ===== البذرة — نفس الكتل اللي كانت في src/data/areas.ts بالحرف =====
insert into map_areas (key, label_ar, area, match_labels, x, y, w, h, r, lx, ly, is_far, note_ar, sort) values
  ('tagamo3',    'التجمع',                 'tagamoa',          array['التجمع'],
     236,  60, 132,  96, 30, 302, 112, false, null,     1),
  ('heliopolis', 'مصر الجديدة ومدينة نصر', 'heliopolis_nasr',  array['مصر الجديدة ومدينة نصر','مصر الجديدة-مدينة نصر'],
     214, 176, 148,  84, 28, 288, 222, false, null,     2),
  ('downtown',   'الزمالك ووسط البلد',     'downtown_zamalek', array['الزمالك ووسط البلد','وسط-زمالك'],
     112, 196,  92,  78, 26, 158, 238, false, null,     3),
  ('maadi',      'المعادي',                'maadi',            array['المعادي'],
     176, 292, 118,  84, 28, 235, 338, false, null,     4),
  ('wadi',       'وادي دجلة',              'maadi',            array['وادي دجلة'],
     250, 392, 118,  74, 26, 309, 452, false, null,     5),
  ('zayed',      'زايد وأكتوبر',           'zayed_october',    array['زايد وأكتوبر','زايد-أكتوبر'],
      36,  92, 116, 104, 30,  94, 148, false, null,     6),
  ('fayoum',     'الفيوم',                 'other',            array['الفيوم'],
      20, 408, 100,  68, 24,  70, 446, true,  'ساعتين', 7)
on conflict (key) do nothing;

-- نقطة السبوطة الغامضة — مش كتلة، مكانها بس
insert into map_areas (key, label_ar, area, x, y, w, h, r, lx, ly, is_mystery, sort)
values ('mystery', 'الغامضة', null, 0, 0, 0, 0, 0, 96, 320, true, 99)
on conflict (key) do nothing;
