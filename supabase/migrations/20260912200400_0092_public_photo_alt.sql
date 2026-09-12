-- ============================================================================
-- 0092 — نص الصورة يوصل للموقع
--
-- `0088` حطّ `photo_alt_ar` على القوالب و`0089` ملاه من «دليل السبوطات».
-- بس الفيو العام `sbotat_public` مكنش بيطلّعه، يعني الكلام كان بيتخزّن
-- ومحدش بيقراه — وده نص الشغل مش كله: الدليل مكتوب أصلًا علشان الصورة
-- يبقى ليها وصف في خانة `alt`.
--
-- ⚠ `keywords_ar` **مش** بيتطلّع هنا عن قصد. الكلمات المفتاحية للفهرسة
--    من الخادم، ومالهاش لازمة في حمولة الفيو اللي بتتحمّل لكل كارت في
--    الرئيسية. لو احتجناها بعدين، تتقرا من `sbota_templates` مباشرة.
--
-- الفيو `security_invoker` زي ما هو — إحنا بنزوّد عمود نص بس.
-- ============================================================================

create or replace view sbotat_public
with (security_invoker = true) as
select
  s.id, s.template_id, s.venue_id, s.captain_id, s.starts_at, s.ends_at,
  s.price, s.org_fee, s.capacity, s.status, s.girls_only, s.is_day,
  s.is_mystery, s.booking_closes_at, s.reveal_at, s.area, s.area_label_ar,
  t.slug,
  coalesce(nullif(btrim(s.title_ar), ''), t.name_ar)    as name_ar,
  coalesce(nullif(btrim(s.details_ar), ''), t.story_ar) as story_ar,
  t.kind, t.mood_ar, t.meta_prefix_ar, t.level_ar,
  t.includes_ar, t.excludes_ar,
  greatest(1, (extract(epoch from s.ends_at - s.starts_at) / 60::numeric)::integer) as duration_min,
  t.hero_photos,
  t.overnight, s.is_work, t.work_config,
  s.origin, s.host_id, s.host_name_ar, s.host_note_ar,
  s.venue_name_ar, s.cost_note_ar,
  -- ⚠ العمود الجديد بيتحط **في الآخر**: `create or replace view` مش بيسمح
  --    تزوّد عمود في النص (بيقول «cannot change name of view column»).
  t.photo_alt_ar
from sbotat s
join sbota_templates t on t.id = s.template_id
where s.status = any (array['open','full','locked','running']::sbota_status_t[]);

-- ===== دالة الاختبار =====
create or replace function test_public_photo_alt()
returns table (test text, result text)
language plpgsql
set search_path = public
as $body$
declare n int; me text := current_user;
begin
  test := '0092 · sbotat_public بتطلّع photo_alt_ar';
  select count(*) into n from information_schema.columns
   where table_schema='public' and table_name='sbotat_public' and column_name='photo_alt_ar';
  if n = 1 then result := 'نجح';
  else result := 'فشل — نص الصورة بيتخزّن ومحدش بيقراه'; end if;
  return next;

  -- ⚠ الفيو لازم يفضل security_invoker: من غيرها بيتنفّذ بصلاحية صاحبه
  --    وبيتخطّى RLS، يعني السبوطات المقفولة تبان للنت كله.
  test := '0092 · الفيو لسه security_invoker';
  if (select count(*) from pg_class c
       where c.relname='sbotat_public'
         and c.reloptions::text like '%security_invoker=true%') = 1
    then result := 'نجح';
    else result := 'فشل — 🔴 الفيو بيتخطّى RLS'; end if;
  return next;

  test := '0092 · keywords_ar مش في الفيو العام (مش محتاجينها للعميل)';
  select count(*) into n from information_schema.columns
   where table_schema='public' and table_name='sbotat_public' and column_name='keywords_ar';
  if n = 0 then result := 'نجح';
  else result := 'فشل — حمولة زيادة على كل كارت'; end if;
  return next;

  begin
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    execute 'set local role anon';
    test := 'سلوكي · الزائر لسه بيقرا الفيو (متكسرش الرئيسية)';
    begin
      select count(*) into n from sbotat_public;
      result := format('نجح — قرا من غير خطأ (%s صف)', n);
    exception when others then
      result := 'فشل — ' || sqlerrm;
    end;
    return next;
    execute format('set local role %I', me);
  exception when others then
    execute format('set local role %I', me);
    test := 'سلوكي · اختبار الزائر';
    result := 'فشل — ' || sqlerrm;
    return next;
  end;
end $body$;

revoke execute on function test_public_photo_alt() from public, anon, authenticated;
