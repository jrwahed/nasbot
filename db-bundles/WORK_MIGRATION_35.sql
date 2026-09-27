-- ============================================================================
-- WORK_MIGRATION_35.sql — الصورة ما تنزلش غير لما اللوحة توافق
--
-- 🔴 **قرارك:** أي حاجة بيرفعها عضو لازم حد من الإدارة يوافق عليها **قبل**
--    ما تنزل. الملف ده بيحوّل الإشراف من «شوفها وامسحها» لـ«ما تنزلش غير
--    بموافقتك».
--
-- إيه اللي بيتغيّر:
--   · العضو بيرفع → الصورة تروح **طابور المستنية** في `/admin/photos`.
--   · **هو لوحده** بيشوفها بوسم «مستنية الموافقة» (علشان ما يفتكرش إن
--     الرفع وقع ويرفعها خمس مرات) — والمجموعة ما بتشوفهاش.
--   · انت بتدوس «انشر» → تبان للمجموعة.
--   · والفيد بيعدّ **المنشور بس** (من غير كده الكرت بيقول «٤ صور»
--     والألبوم فيه واحدة).
--
-- ⚠ **العمود موجود من زمان ومكانش بيتستعمل:** `published_to_members_at`.
--    فاضي = مستنية. مضفناش حالة جديدة، رجّعنا العمود لمعناه.
--
-- 🔴 والعضو **ما ينفعش ينشر لنفسه**: السياسة بترفض أي قيمة في العمود ده
--    وقت الرفع. من غير السطر ده الموافقة كانت هتبقى ديكور.
--
-- بعده شغّل (بالترتيب):
--   select fn_test_seed_up();
--   select * from test_photo_approval();    -- ٥ صفوف «نجح»
--   select fn_test_seed_down();
-- ============================================================================

-- ##########################################################################
-- # 20260921180000_0116_photos_approval.sql
-- ##########################################################################

-- ============================================================================
-- 0116 — الصورة ما تنزلش غير لما اللوحة توافق
--
-- 🔴 **قرار المالك (٢٠٢٦-٠٩-٢١):** أي حاجة بيرفعها عضو لازم **حد من
--    الإدارة يوافق عليها قبل ما تنزل**. الإشراف بقى **قبل** النشر مش بعده.
--
-- في `0113` الصورة كانت بتبان لأهل الخروجة **على طول**، والإشراف كان
-- «شوفها وامسحها لو غلط». ده معناه إن الصورة الغلط بتتشاف الأول وتتمسح
-- بعدين — والمجموعة تكون شافتها خلاص.
--
-- ⚠ **العمود موجود من زمان ومكانش بيتستعمل:** `published_to_members_at`.
--    معناه بالظبط «اتنشرت للأعضاء». فبدل ما نضيف عمود حالة جديد، رجّعناه
--    لمعناه: **فاضي = مستنية موافقة**.
--
-- وثلاث قواعد:
--   1. اللي رفع الصورة **بيشوفها هو** وهي مستنية، بوسم «مستنية الموافقة» —
--      علشان ما يفتكرش إن الرفع وقع ويرفعها تاني خمس مرات.
--   2. باقي المجموعة ما بتشوفهاش غير بعد الموافقة.
--   3. الفيد بيعدّ **المنشور بس** — من غير كده الكرت بيقول «٤ صور»
--      والألبوم فيه واحدة.
--
-- آمنة تتكرر: `create or replace` + `drop policy if exists` بنفس الاسم.
-- ============================================================================

-- ===== 1) الألبوم: المنشور + بتاعي أنا =====
--
-- ⚠ العمود `is_pending` جديد في الراجع، و`test_album()` بيقارن قايمة
--   الأعمدة حرف بحرف — فاتحدّثت معاه. الحارس ده مقصود إنه يوقّفك كل مرة
--   تزوّد عمود، علشان تسأل: ده بيانات شخصية ولا لأ؟ (`is_pending` لأ.)
-- ⚠ `create or replace` **ما بتقدرش** تغيّر عدد الأعمدة الراجعة —
--   لازم `drop` بالتوقيع الأول. (نفس مصيدة `fn_create_sbota` في `0094`.)
drop function if exists fn_sbota_album(uuid);

create function fn_sbota_album(p_sbota_id uuid)
returns table (
  photo_id   uuid,
  path       text,
  caption_ar text,
  by_name    text,
  is_mine    boolean,
  is_pending boolean,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select ph.id,
         ph.path,
         nullif(btrim(coalesce(ph.caption_ar, '')), ''),
         p.first_name,
         ph.uploaded_by = auth.uid(),
         ph.published_to_members_at is null,
         ph.created_at
    from sbota_photos ph
    left join profiles p on p.id = ph.uploaded_by
   where ph.sbota_id = p_sbota_id
     and fn_was_in_sbota(p_sbota_id)
     and (p.id is null or p.deleted_at is null)
     -- 🔴 المنشور للكل · واللي لسه مستني لصاحبه هو بس
     and (ph.published_to_members_at is not null or ph.uploaded_by = auth.uid())
   order by ph.created_at desc;
$$;

comment on function fn_sbota_album(uuid) is
  'صور الخروجة لأهلها بس بعد موافقة اللوحة — واللي لسه مستني بيبان لصاحبه هو (0116).';

revoke execute on function fn_sbota_album(uuid) from public, anon;
grant  execute on function fn_sbota_album(uuid) to authenticated;


-- ===== 2) الفيد: المنشور بس =====
create or replace function fn_feed(p_limit int default 30)
returns table (
  sbota_id    uuid,
  kind        text,
  title_ar    text,
  starts_at   timestamptz,
  people      int,
  photo_path  text,
  photos      int,
  booking_id  uuid
)
language sql
stable
security definer
set search_path = public
as $$
  with me as (select auth.uid() as uid),
  ok as (select fn_is_alumni() as pass)
  select s.id,
         case when mine.booking_id is not null then 'mine' else 'other' end,
         coalesce(nullif(btrim(s.title_ar), ''), t.name_ar),
         s.starts_at,
         (select count(*)::int from bookings b
           where b.sbota_id = s.id and b.status in ('paid','attended')),
         case when mine.booking_id is not null then
           (select ph.path from sbota_photos ph
             where ph.sbota_id = s.id
               and ph.published_to_members_at is not null
             order by ph.created_at desc limit 1)
         end,
         case when mine.booking_id is not null then
           (select count(*)::int from sbota_photos ph
             where ph.sbota_id = s.id and ph.published_to_members_at is not null)
         else 0 end,
         mine.booking_id
    from sbotat s
    join sbota_templates t on t.id = s.template_id
    left join lateral (
      select b.id as booking_id
        from bookings b, me
       where b.sbota_id = s.id
         and b.profile_id = me.uid
         and b.status in ('paid','attended')
       limit 1
    ) mine on true
   where (select pass from ok)
     and s.ends_at < now()
     and s.status in ('done', 'running', 'locked')
   order by s.starts_at desc
   limit greatest(1, least(coalesce(p_limit, 30), 100));
$$;

comment on function fn_feed(int) is
  'الفيد: خروجاتك بصورها المنشورة، وباقي الخروجات كرت من غير صور ولا أسامي (0114 · 0116).';

revoke execute on function fn_feed(int) from public, anon;
grant  execute on function fn_feed(int) to authenticated;


-- ===== 3) العضو ما ينشرش لنفسه =====
--
-- 🔴 من غير السطر ده، العضو يرفع الصف بـ`published_to_members_at = now()`
--    ويعدّي على الموافقة كلها. السياسة بتلزم إنه **فاضي** وقت الرفع.
drop policy if exists photos_member_write on sbota_photos;

create policy photos_member_write on sbota_photos
  for insert with check (
    fn_was_in_sbota(sbota_id)
    and uploaded_by = auth.uid()
    and published_to_members_at is null
  );


-- ===== دالة الاختبار =====
create or replace function test_photo_approval()
returns table (test text, result text)
language plpgsql
set search_path = public
as $body$
declare
  v_tpl uuid := '0116aaaa-0000-4000-8000-000000000001';
  v_sb  uuid := '0116aaaa-0000-4000-8000-000000000002';
  v_in  uuid;
  v_oth uuid;
  v_ph  uuid := '0116aaaa-0000-4000-8000-000000000003';
  n int;
begin
  if not exists (select 1 from profiles where id = '33333333-0000-0000-0000-000000000001'
                   and deleted_at is null)
     or not exists (select 1 from profiles where id = '33333333-0000-0000-0000-000000000003'
                      and deleted_at is null) then
    test := '0116 · موافقة الصور';
    result := 'معلومة — محتاج البذرة المؤقتة (fn_test_seed_up)';
    return next;
    return;
  end if;
  v_in  := '33333333-0000-0000-0000-000000000001';
  v_oth := '33333333-0000-0000-0000-000000000003';

  insert into sbota_templates (id, slug, name_ar, story_ar, kind, default_price,
                               org_fee, duration_min, min_group, max_group)
  values (v_tpl, 'test-approve', '[اختبار] موافقة', '[اختبار]', 'food', 0, 0, 120, 4, 8)
  on conflict (id) do nothing;

  insert into sbotat (id, template_id, starts_at, ends_at, price, capacity, status)
  values (v_sb, v_tpl, now() - interval '2 days', now() - interval '2 days' + interval '2 hours',
          0, 8, 'done')
  on conflict (id) do nothing;

  insert into bookings (id, sbota_id, profile_id, status, price_paid)
  values ('0116aaaa-0000-4000-8000-000000000004', v_sb, v_in,  'paid', 0),
         ('0116aaaa-0000-4000-8000-000000000005', v_sb, v_oth, 'paid', 0)
  on conflict (id) do nothing;

  -- صورة **مستنية** (published فاضي)
  insert into sbota_photos (id, sbota_id, path, uploaded_by, published_to_members_at)
  values (v_ph, v_sb, v_sb::text || '/p.jpg', v_in, null)
  on conflict (id) do nothing;

  set local role authenticated;

  -- (1) صاحبها بيشوفها وهي مستنية
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_in, 'role', 'authenticated')::text, true);
  select count(*) into n from fn_sbota_album(v_sb) a where a.is_pending;
  test := '0116 · اللي رفعها بيشوفها وهي مستنية';
  result := case when n = 1 then 'نجح' else format('فشل — شاف %s بدل 1', n) end;
  return next;

  -- (2) 🔴 حد تاني في نفس الخروجة ما يشوفهاش
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_oth, 'role', 'authenticated')::text, true);
  select count(*) into n from fn_sbota_album(v_sb);
  test := '0116 · باقي المجموعة ما يشوفوهاش قبل الموافقة';
  result := case when n = 0 then 'نجح'
                 else format('فشل — 🔴 شاف %s صورة لسه ما اتوافقش عليها', n) end;
  return next;

  -- (3) وبعد الموافقة بيشوفها
  reset role;
  perform set_config('request.jwt.claims', null, true);
  update sbota_photos set published_to_members_at = now() where id = v_ph;
  set local role authenticated;
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_oth, 'role', 'authenticated')::text, true);
  select count(*) into n from fn_sbota_album(v_sb);
  test := '0116 · بعد الموافقة بتبان للمجموعة';
  result := case when n = 1 then 'نجح' else format('فشل — شاف %s بدل 1', n) end;
  return next;

  -- (4) 🔴 العضو ما ينشرش لنفسه
  reset role;
  perform set_config('request.jwt.claims', null, true);
  delete from sbota_photos where id = v_ph;
  set local role authenticated;
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_in, 'role', 'authenticated')::text, true);
  begin
    insert into sbota_photos (sbota_id, path, uploaded_by, published_to_members_at)
    values (v_sb, v_sb::text || '/self.jpg', v_in, now());
    test := '0116 · العضو ينشر لنفسه';
    result := 'فشل — 🔴 عدّت، يعني الموافقة ديكور';
    delete from sbota_photos where path = v_sb::text || '/self.jpg';
  exception when others then
    test := '0116 · العضو ينشر لنفسه';
    result := 'نجح (اترفض)';
  end;
  return next;

  -- (5) والفيد بيعدّ المنشور بس
  reset role;
  perform set_config('request.jwt.claims', null, true);
  insert into sbota_photos (id, sbota_id, path, uploaded_by, published_to_members_at)
  values (v_ph, v_sb, v_sb::text || '/p.jpg', v_in, null)
  on conflict (id) do nothing;
  set local role authenticated;
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_in, 'role', 'authenticated')::text, true);
  select coalesce((select f.photos from fn_feed(100) f where f.sbota_id = v_sb), -1) into n;
  test := '0116 · الفيد بيعدّ المنشور بس';
  result := case when n = 0 then 'نجح'
                 else format('فشل — الفيد قال %s صورة والمنشور صفر', n) end;
  return next;

  -- ⚠ الترجيع
  reset role;
  perform set_config('request.jwt.claims', null, true);
  delete from sbota_photos where sbota_id = v_sb;
  delete from bookings where id in ('0116aaaa-0000-4000-8000-000000000004',
                                    '0116aaaa-0000-4000-8000-000000000005');
  delete from sbotat where id = v_sb;
  delete from sbota_templates where id = v_tpl;
end $body$;

comment on function test_photo_approval() is
  '0116 — الصورة ما تبانش للمجموعة غير بعد موافقة اللوحة، والعضو ما ينشرش لنفسه.';


-- ===== نصوص الموافقة =====
insert into copy_strings (key, value_ar, screen, context_ar) values
  ('album.pending',    'مستنية الموافقة', 'ألبوم الخروجة',
   'وسم على الصورة اللي لسه ما اتوافقش عليها — بيبان لصاحبها هو بس'),
  ('album.reviewNote', 'أي صورة بتترفع بتتراجع من الإدارة قبل ما تبان للمجموعة.',
   'ألبوم الخروجة', 'سطر تحت العنوان بيشرح إن فيه مراجعة')
on conflict (key) do nothing;
