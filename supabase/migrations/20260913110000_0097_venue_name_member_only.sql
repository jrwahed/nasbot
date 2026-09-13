-- ============================================================================
-- 0097 — اسم المكان في الفيو العام لخروجات الأعضاء بس
--
-- ⚠ **ده تراجع أنا سببته.** `venue_name_ar` اتعمل في `0086` **لخروجة العضو**:
--    العضو بيكتب اسم المكان وهو معلومة عامة عن قصد (الحجز عنده ببلاش،
--    والعنوان بس هو اللي بيستنى الكشف).
--
--    وبعدين اتشالت قايمة الأماكن من `/admin/sbotat` وبقى المالك بيكتب اسم
--    المكان في **نفس العمود** لسبوطات نسبوط كمان. والفيو بيطلّع العمود ده
--    للكل — فاسم مكان سبوطة نسبوط بقى مكشوف لأي زائر، وهو قبل كده كان
--    مخفي لحد ما العضو يدفع (كان جاي من `venues` عبر `fn_sbota_address`).
--
--    وده بيخالف الهوية (CLAUDE.md §٣.٧): **المجموعة هي المنتج، مش المكان.**
--    ولو المكان باين من بره، الواحد يروح لوحده ويوفّر الفلوس.
--
-- الحل: الفيو بيطلّع `venue_name_ar` لما `origin = 'member'` بس. سبوطة
-- نسبوط بترجّع null، والاسم بيوصل من `fn_sbota_address` بعد الدفع زي الأول.
--
-- ⚠ العمود بيتحط **في الآخر** — `create or replace view` مش بيسمح بتغيير
--    ترتيب ولا أسماء الأعمدة الموجودة.
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
  case when s.origin = 'member' then s.venue_name_ar end as venue_name_ar,
  s.cost_note_ar,
  t.photo_alt_ar
from sbotat s
join sbota_templates t on t.id = s.template_id
where s.status = any (array['open','full','locked','running']::sbota_status_t[]);

-- ===== دالة الاختبار =====
--
-- ⚠ سلوكية: بتلبس دور الزائر المجهول وتتأكد إنه **مش** شايف اسم مكان
--    سبوطة نسبوط، وإنه **شايف** بتاع خروجة العضو (دي مقصودة).
create or replace function test_venue_name_privacy()
returns table (test text, result text)
language plpgsql
set search_path = public
as $body$
declare n int; me text := current_user;
begin
  test := '0097 · الفيو لسه security_invoker';
  if (select count(*) from pg_class c
       where c.relname='sbotat_public'
         and c.reloptions::text like '%security_invoker=true%') = 1
    then result := 'نجح';
    else result := 'فشل — 🔴 الفيو بيتخطّى RLS'; end if;
  return next;

  begin
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    execute 'set local role anon';

    test := 'سلوكي · الزائر **مش** شايف اسم مكان سبوطة نسبوط';
    select count(*) into n from sbotat_public
     where origin <> 'member' and coalesce(btrim(venue_name_ar),'') <> '';
    if n = 0 then result := 'نجح';
    else result := format('فشل — 🔴 %s سبوطة مكانها مكشوف من غير حجز', n); end if;
    return next;

    test := 'سلوكي · وشايف بتاع خروجة العضو (دي مقصودة)';
    select count(*) into n from sbotat_public where origin = 'member';
    result := format('%s خروجة عضو مفتوحة — الرقم ده مش شرط', n);
    return next;

    execute format('set local role %I', me);
  exception when others then
    execute format('set local role %I', me);
    test := 'سلوكي · اختبار الزائر';
    result := 'فشل — ' || sqlerrm;
    return next;
  end;
end $body$;

revoke execute on function test_venue_name_privacy() from public, anon, authenticated;
