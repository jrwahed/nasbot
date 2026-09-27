-- ============================================================================
-- WORK_MIGRATION_32.sql — ألبوم الخروجة
--
-- بعد الخروجة، الصور بتفضل في تليفون كل واحد لوحده وبعد يومين الذكرى
-- بتتبخّر. الملف ده بيفتح **ألبوم للخروجة**: أي حد كان فيها يرفع صوره،
-- وكل اللي كانوا فيها يشوفوها.
--
-- 🔴 **الصور لأهل الخروجة دي بس** — مش لكل الأعضاء ولا للزوار. وبيبان
--    **الاسم الأول وبس** مع كل صورة: مفيش صورة بروفايل ولا منطقة ولا نوع
--    شخصية. وفيه فحص في `test_album()` بيفشل لو حد زوّد عمود.
--
-- ⚠ **قبل الملف ده، محدش كان يقدر يرفع صورة أصلًا.** كل سياسات الرفع
--    معلّقة على «كابتن»، وكل السبوطات دلوقتي من غير كابتن. الميزة كانت
--    مبنية وميتة من غير ما حد ياخد باله.
--
-- ⚠ «مين كان في الخروجة» = **حجز مدفوع + الخروجة خلصت** — مش تسجيل حضور
--    باليد. لو اعتمدنا على تسجيل الحضور، أول مرة تنسى، الألبوم يتقفل على
--    الكل ومحدش يعرف ليه.
--
-- بعده شغّل (بالترتيب):
--   select fn_test_seed_up();
--   select * from test_album();      -- ٦ صفوف، كلهم «نجح»
--   select fn_test_seed_down();
-- ============================================================================

-- ##########################################################################
-- # 20260921150000_0113_group_album.sql
-- ##########################################################################

-- ============================================================================
-- 0113 — ألبوم الخروجة: أي حاضر يرفع، وأهل الخروجة بس هم اللي يشوفوا
--
-- الوجع: الخروجة بتخلص، والصور بتفضل في تليفون كل واحد لوحده. وبعد ٤٨
-- ساعة الذكرى بتتبخّر ومفيش خيط شادّ للسبوطة اللي بعدها.
--
-- 🔴 **قرار المالك (٢٠٢٦-٠٩-٢١):** صور خروجة معيّنة تبان **للي كانوا
--    فيها بس** — زي الشات بالظبط. مش لكل الأعضاء ولا للزوار.
--
-- ⚠ **الحالة قبل الملف ده: محدش كان يقدر يرفع صورة أصلًا.**
--    سياسات الرفع (في `sbota_photos` وفي `storage.objects`) كلها معلّقة
--    على `captain_id`، و**كل السبوطات دلوقتي من غير كابتن** (العضو بيفتح
--    خروجته بنفسه من `0078`). يعني الميزة كانت مبنية وميتة.
--    ده نفس الدرس التلتاشر: عمود اتشال من الواجهة، والسياسات ما مشيتش وراه.
--
-- ⚠ **مين «حاضر»؟** بنقول: **حجز مدفوع + الخروجة خلصت** —
--    مش `status = 'attended'`. ليه؟ لأن `attended` بتتحط بإيد المالك وقت
--    تسجيل الحضور، ولو نسي مرة الألبوم يبقى **مقفول على الكل** ومحدش
--    يعرف ليه. الشرط اللي اخترناه ما بيعتمدش على خطوة يدوية.
--    والفرق الوحيد: حد دفع وما جاش يشوف صور مجموعته. مقبول.
--
-- آمنة تتكرر: `add column if not exists` + `drop policy if exists` قبل كل
-- `create policy` **بنفس الاسم الجديد** (الغلطة اللي وقعت في `0056`).
-- ============================================================================

-- ===== 1) الكلام اللي مع الصورة =====

alter table sbota_photos add column if not exists caption_ar text;

comment on column sbota_photos.caption_ar is
  'كلمتين مع الصورة — اختيارية. عليها نفس حارس الكلمات الممنوعة (0113).';


-- ===== 2) حارس الكلمات الممنوعة على كلام الصورة =====
--
-- ⚠ نسخة من `fn_guard_sbota_text` بنفس المنطق بالحرف — مش استدعاء ليها،
--   لأنها محفّز على جدول تاني بأعمدة مختلفة. لو غيّرت القاعدة هناك،
--   غيّرها هنا.
create or replace function fn_guard_photo_text()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  hit  text;
  blob text;
begin
  if not fn_caller_is_browser() then return new; end if;

  blob := lower(coalesce(new.caption_ar, ''));
  if btrim(blob) = '' then return new; end if;

  select w.word into hit from banned_words w
   where blob like '%' || lower(w.word) || '%'
   limit 1;

  if hit is not null then
    raise exception 'الكلمة «%» مش من كلامنا — غيّرها وجرّب تاني', hit
      using errcode = '22023';
  end if;
  return new;
end $$;

drop trigger if exists t_photo_text on sbota_photos;
create trigger t_photo_text
  before insert or update of caption_ar on sbota_photos
  for each row execute function fn_guard_photo_text();


-- ===== 3) مين من أهل الخروجة =====
--
-- حارس واحد بينادوه الجدول والتخزين والدالة — الدرس الستاشر: مفيش نسختين
-- من نفس الحارس.
create or replace function fn_was_in_sbota(p_sbota_id uuid, p_profile uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
      from bookings b
      join sbotat  s on s.id = b.sbota_id
     where b.sbota_id  = p_sbota_id
       and b.profile_id = p_profile
       and p_profile is not null
       and b.status in ('paid', 'attended')
       and s.ends_at < now()
  );
$$;

comment on function fn_was_in_sbota(uuid, uuid) is
  'كان في الخروجة دي فعلًا: حجز مدفوع + الخروجة خلصت. الحارس الوحيد للألبوم (0113).';

revoke execute on function fn_was_in_sbota(uuid, uuid) from public, anon;
grant  execute on function fn_was_in_sbota(uuid, uuid) to authenticated;


-- ===== 4) سياسات الجدول =====

alter table sbota_photos enable row level security;

drop policy if exists photos_read          on sbota_photos;
drop policy if exists photos_captain_write on sbota_photos;
drop policy if exists photos_member_write  on sbota_photos;
drop policy if exists photos_owner_delete  on sbota_photos;

-- القراية: الأدمن · اللي رافع · وأهل الخروجة
--
-- ⚠ الشرط القديم كان `status in ('paid','attended')` **من غير** ما يتأكد
--   إن الخروجة خلصت، ومن غير `published_to_members_at`. يعني حد دفع
--   لخروجة **لسه ما حصلتش** كان يشوف أي صورة تترفع عليها.
create policy photos_read on sbota_photos
  for select using (
    fn_is_admin()
    or uploaded_by = auth.uid()
    or fn_was_in_sbota(sbota_id)
  );

-- الرفع: أهل الخروجة بس، وكل واحد باسمه هو
--
-- ⚠ `uploaded_by = auth.uid()` **شرط**، مش تزويق: من غيره العضو يرفع
--   صورة وينسبها لحد تاني.
-- ⚠ الشرط التالت (`published_to_members_at is null`) جاي من `0116`
--   (الصورة ما تنزلش غير بموافقة اللوحة) — **ومتكتوب هنا كمان بنفس
--   الحرف عن قصد**. لو سبناه في `0116` بس، أي إعادة لزق للملف ده كانت
--   بترجّع السياسة المفتوحة والعضو يقدر ينشر لنفسه. الدرس التالت:
--   الهجرة القديمة هي اللي تتحصّن.
create policy photos_member_write on sbota_photos
  for insert with check (
    fn_was_in_sbota(sbota_id)
    and uploaded_by = auth.uid()
    and published_to_members_at is null
  );

-- المسح: اللي رفع بس (والأدمن من سياسته)
create policy photos_owner_delete on sbota_photos
  for delete using (uploaded_by = auth.uid() or fn_is_admin());


-- ===== 5) سياسات التخزين =====
--
-- المسار: `<sbota_id>/<اسم الملف>` — فأول مجلد هو رقم السبوطة.

-- ⚠ **مشروط بوجود اسكيما `storage`.** البوستجرس المحلي مفيهوش `storage`
--   (زي `0025` بالظبط)، ومن غير الشرط ده الملف ما ينفعش يتجرّب محليًا
--   خالص — يعني كنا هنلزق على الإنتاج من غير ما نكون شغّلناه ولا مرة.
do $storage$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'مفيش اسكيما storage — سياسات التخزين اتخطّت (بوستجرس محلي)';
    return;
  end if;

  execute 'drop policy if exists photos_captain_read  on storage.objects';
  execute 'drop policy if exists photos_captain_write on storage.objects';
  execute 'drop policy if exists photos_member_read   on storage.objects';
  execute 'drop policy if exists photos_member_write  on storage.objects';
  execute 'drop policy if exists photos_member_delete on storage.objects';

  execute $p$
    create policy photos_member_read on storage.objects
      for select using (
        bucket_id = 'sbota-photos'
        and (fn_is_admin() or fn_was_in_sbota(((storage.foldername(name))[1])::uuid))
      )
  $p$;

  execute $p$
    create policy photos_member_write on storage.objects
      for insert with check (
        bucket_id = 'sbota-photos'
        and fn_was_in_sbota(((storage.foldername(name))[1])::uuid)
      )
  $p$;

  execute $p$
    create policy photos_member_delete on storage.objects
      for delete using (
        bucket_id = 'sbota-photos'
        and (fn_is_admin() or owner = auth.uid())
      )
  $p$;
end $storage$;

-- ===== 6) الألبوم — البيانات =====
--
-- 🔴 **الاسم الأول وبس.** مفيش صورة بروفايل ولا منطقة ولا نوع شخصية ولا
--    عدد خروجات. ده قرار المالك صريح، وهو كمان اللي بيمنع الصفحة دي
--    إنها تتحوّل لبروفايلات.
-- ⚠ **مشروط: بيتعمل بس لو مش موجود.**
--    `0116` بيدي الدالة دي عمود زيادة (`is_pending` — موافقة اللوحة).
--    ولو الملف ده اتلزق تاني بعده، `create or replace` بالتوقيع القديم
--    كانت هتقع بـ«cannot change return type»، أو الأسوأ: ترجّع الدالة
--    للنسخة اللي من غير موافقة. ده الدرس التالت بالحرف — الهجرة القديمة
--    هي اللي بتتحصّن، مش الجديدة اللي بتكتب فوقها.
do $wrap$
begin
  if to_regprocedure('fn_sbota_album(uuid)') is not null then
    raise notice 'fn_sbota_album موجودة — اتخطّت (0116 بيغلب)';
    return;
  end if;
  execute $create$
    create function fn_sbota_album(p_sbota_id uuid)
    returns table (
      photo_id   uuid,
      path       text,
      caption_ar text,
      by_name    text,
      is_mine    boolean,
      created_at timestamptz
    )
    language sql
    stable
    security definer
    set search_path = public
    as $inner$
      select ph.id,
             ph.path,
             nullif(btrim(coalesce(ph.caption_ar, '')), ''),
             p.first_name,
             ph.uploaded_by = auth.uid(),
             ph.created_at
        from sbota_photos ph
        left join profiles p on p.id = ph.uploaded_by
       where ph.sbota_id = p_sbota_id
         and fn_was_in_sbota(p_sbota_id)
         and (p.id is null or p.deleted_at is null)
       order by ph.created_at desc;
    $inner$;

    comment on function fn_sbota_album(uuid) is
      'صور الخروجة لأهلها بس — والاسم الأول وبس، مفيش أي بيانات تانية (0113).';
  $create$;
end $wrap$;

revoke execute on function fn_sbota_album(uuid) from public, anon;
grant  execute on function fn_sbota_album(uuid) to authenticated;


-- ===== دالة الاختبار =====
--
-- ⚠ بتعمل خروجة **خلصت** ببياناتها بنفسها، لأن بذرة الاختبار الموجودة
--   (`fn_test_seed_up`) سبوطاتها كلها في المستقبل — يعني `fn_was_in_sbota`
--   بترجّع false للكل عليها، والاختبار كان هيعدّي وهو مش فاحص حاجة.
--
-- ⚠ والمسح بالأرقام اللي أنشأناها بالظبط، مش ببادئة (الدرس السابع).
create or replace function test_album()
returns table (test text, result text)
language plpgsql
set search_path = public
as $body$
declare
  v_tpl   uuid := '0113aaaa-0000-4000-8000-000000000001';
  v_sb    uuid := '0113aaaa-0000-4000-8000-000000000002';  -- خروجة خلصت
  v_sb2   uuid := '0113aaaa-0000-4000-8000-000000000003';  -- خروجة لسه جاية
  v_in    uuid;   -- كان فيها
  v_out   uuid;   -- مكانش فيها
  v_ph    uuid := '0113aaaa-0000-4000-8000-000000000004';
  n int;
  cols text;
begin
  -- بنستعير بروفايلين موجودين بدل ما نعمل جداد (المفاتيح الأجنبية على auth)
  --
  -- ⚠ **ومش أي بروفايلين — لازم يكونوا مش أدمن.** أول نسخة كانت بتاخد
  --   أقدم صفين، وأقدم صف على الإنتاج هو **حساب المالك** وعليه أدمن نشط.
  --   فسياسة `photos_admin` (`for all using fn_is_admin()`) كانت بتسمح
  --   بالكتابة، والاختبار قال «🔴 حد يقدر ينسب صورة لغيره» — وهو **سليم**،
  --   الأدمن فعلًا من حقه.
  --   ومحليًا مكانش فيه ولا حساب أدمن، فالصف عدّى. يعني المحلي قال «تمام»
  --   والإنتاج قال «فشل» **والاتنين مش بيختبروا نفس الحاجة**. الدرس
  --   التمنتاشر بشكل جديد: الفرق مش في الامتدادات بس — في **البيانات** كمان.
  -- الأول: بذرة الاختبار المؤقتة (مريم ونور) — دول مضمونين مش أدمن،
  -- و`CHECK_DB.sql` بيزرعهم قبل السلسلة. ولو مش موجودين، بنستعير أي
  -- بروفايلين حقيقيين مش أدمن.
  --
  -- ⚠ على الإنتاج فيه **بروفايل واحد بس** مش أدمن ومش متمسوح، فمن غير
  --   البذرة الاختبار كان بيتخطّى بالكامل ويقول «معلومة» — يعني فاحص
  --   أمان مش بيشتغل، وده أسوأ من فاحص أحمر.
  if exists (select 1 from profiles where id = '33333333-0000-0000-0000-000000000001'
               and deleted_at is null)
     and exists (select 1 from profiles where id = '33333333-0000-0000-0000-000000000003'
                   and deleted_at is null) then
    v_in  := '33333333-0000-0000-0000-000000000001';
    v_out := '33333333-0000-0000-0000-000000000003';
  else
    select id into v_in from profiles p
     where p.deleted_at is null
       and not exists (select 1 from admin_users a where a.profile_id = p.id)
     order by p.created_at limit 1;
    select id into v_out from profiles p
     where p.deleted_at is null and p.id <> v_in
       and not exists (select 1 from admin_users a where a.profile_id = p.id)
     order by p.created_at limit 1;
  end if;
  if v_in is null or v_out is null then
    test := '0113 · الألبوم';
    result := 'معلومة — محتاج البذرة المؤقتة (fn_test_seed_up) أو بروفايلين مش أدمن';
    return next;
    return;
  end if;

  -- ===== شكلي: الأعمدة =====
  -- 🔴 الفحص ده هو اللي بيمنع الصفحة تتحوّل لبروفايلات: أي عمود يتزوّد
  --    على الدالة (صورة · منطقة · نوع · عدد خروجات) بيخلّيه أحمر.
  --    **الأعمدة الراجعة بس** — `parameter_mode = 'OUT'`. أول نسخة كانت
  --    بتعدّ الـparameter الداخل كمان وقالت «فشل» على دالة سليمة.
  test := '0113 · الألبوم بيرجّع الاسم الأول وبس';
  select string_agg(pr.parameter_name, ',' order by pr.ordinal_position) into cols
    from information_schema.parameters pr
    join information_schema.routines r
      on r.specific_name = pr.specific_name and r.specific_schema = pr.specific_schema
   where r.routine_schema = 'public' and r.routine_name = 'fn_sbota_album'
     and pr.parameter_mode = 'OUT';
  -- ⚠ `is_pending` اتزوّد في `0116` (موافقة اللوحة). الحارس ده وقف الشغل
  --   لحد ما اتسأل السؤال: العمود ده بيانات شخصية؟ لأ — فاتحدّث بقصد.
  if cols = 'photo_id,path,caption_ar,by_name,is_mine,is_pending,created_at' then result := 'نجح';
  else result := 'فشل — الأعمدة اتغيّرت: ' || coalesce(cols, '(مش لاقيها)'); end if;
  return next;

  -- ===== بيانات مؤقتة =====
  insert into sbota_templates (id, slug, name_ar, story_ar, kind, default_price,
                               org_fee, duration_min, min_group, max_group)
  values (v_tpl, 'test-album', '[اختبار] ألبوم', '[اختبار]', 'food', 0, 0, 120, 4, 8)
  on conflict (id) do nothing;

  insert into sbotat (id, template_id, starts_at, ends_at, price, capacity, status)
  values (v_sb,  v_tpl, now() - interval '2 days', now() - interval '2 days' + interval '3 hours', 0, 8, 'done'),
         (v_sb2, v_tpl, now() + interval '9 days', now() + interval '9 days 3 hours',            0, 8, 'open')
  on conflict (id) do nothing;

  insert into bookings (id, sbota_id, profile_id, status, price_paid)
  values ('0113aaaa-0000-4000-8000-000000000005', v_sb,  v_in,  'paid', 0),
         ('0113aaaa-0000-4000-8000-000000000006', v_sb2, v_out, 'paid', 0)
  on conflict (id) do nothing;

  -- ⚠ **صورتين**: واحدة على الخروجة اللي خلصت، وواحدة على اللي لسه جاية.
  --   من غير التانية، صف «خروجة لسه ما حصلتش» كان بيعدّ صفر **لأن مفيش
  --   صور أصلًا** — يعني بيقول «نجح» وهو مش فاحص حاجة. مسكناها بفخ.
  -- ⚠ **منشورة** (`published_to_members_at`) من `0116`. من غيرها الصف
  --   «اللي كان في الخروجة يشوف الألبوم» كان بيعدّي بالصدفة — لأن
  --   صاحب الصورة بيشوف بتاعته حتى وهي مستنية، فالاختبار كان بيفحص
  --   حاجة تانية غير اللي مكتوب فيه.
  insert into sbota_photos (id, sbota_id, path, uploaded_by, caption_ar, published_to_members_at)
  values (v_ph, v_sb, v_sb::text || '/t.jpg', v_in, 'يوم حلو', now()),
         ('0113aaaa-0000-4000-8000-000000000007', v_sb2, v_sb2::text || '/t.jpg', v_out, null, now())
  on conflict (id) do nothing;

  -- ===== سلوكي =====
  set local role authenticated;

  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_in, 'role', 'authenticated')::text, true);
  select count(*) into n from fn_sbota_album(v_sb);
  test := '0113 · اللي كان في الخروجة يشوف الألبوم';
  result := case when n = 1 then 'نجح' else format('فشل — شاف %s صورة بدل 1', n) end;
  return next;

  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_out, 'role', 'authenticated')::text, true);
  select count(*) into n from fn_sbota_album(v_sb);
  test := '0113 · اللي مكانش فيها ما يشوفش';
  result := case when n = 0 then 'نجح'
                 else format('فشل — 🔴 شاف %s صورة من خروجة مكانش فيها', n) end;
  return next;

  -- 🔴 خروجة **لسه ما حصلتش**: حتى صاحب الحجز فيها ما يشوفش صورتها
  --   (v_out هو صاحب الحجز في v_sb2، وهو اللي لابس دلوقتي)
  select count(*) into n from fn_sbota_album(v_sb2);
  test := '0113 · خروجة لسه ما حصلتش → مفيش ألبوم';
  result := case when n = 0 then 'نجح' else 'فشل — 🔴 الألبوم فتح قبل الخروجة' end;
  return next;

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin
    select count(*) into n from fn_sbota_album(v_sb);
    test := '0113 · الزائر المجهول';
    result := case when n = 0 then 'نجح (رجّعت فاضي)'
                   else format('فشل — 🔴 المجهول شاف %s صورة', n) end;
  exception when insufficient_privilege then
    test := '0113 · الزائر المجهول';
    result := 'نجح (permission denied)';
  end;
  return next;

  -- الرفع باسم حد تاني
  set local role authenticated;
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_in, 'role', 'authenticated')::text, true);
  begin
    insert into sbota_photos (sbota_id, path, uploaded_by)
    values (v_sb, v_sb::text || '/fake.jpg', v_out);
    test := '0113 · رفع صورة باسم حد تاني';
    result := 'فشل — 🔴 عدّت، يعني حد يقدر ينسب صورة لغيره';
    delete from sbota_photos where path = v_sb::text || '/fake.jpg';
  exception when insufficient_privilege or check_violation then
    test := '0113 · رفع صورة باسم حد تاني';
    result := 'نجح (اترفض)';
  when others then
    test := '0113 · رفع صورة باسم حد تاني';
    result := 'نجح (اترفض: ' || left(sqlerrm, 30) || ')';
  end;
  return next;

  -- ⚠ الترجيع: الدور والهوية والبيانات
  reset role;
  perform set_config('request.jwt.claims', null, true);
  delete from sbota_photos where id = v_ph or sbota_id in (v_sb, v_sb2);
  delete from bookings where id in ('0113aaaa-0000-4000-8000-000000000005',
                                    '0113aaaa-0000-4000-8000-000000000006');
  delete from sbotat  where id in (v_sb, v_sb2);
  delete from sbota_templates where id = v_tpl;
end $body$;

comment on function test_album() is
  '0113 — الألبوم لأهل الخروجة بس، وبعد ما تخلص، وبالاسم الأول وبس.';


-- ===== نصوص الألبوم =====
insert into copy_strings (key, value_ar, screen, context_ar) values
  ('album.title',    'صور الخروجة', 'ألبوم الخروجة', 'عنوان القسم'),
  ('album.note',     'الصور دي بتبان لناس الخروجة دي بس.', 'ألبوم الخروجة',
   'سطر بيطمّن الناس على الخصوصية — تحت العنوان'),
  ('album.empty',    'لسه مفيش صور. ابدأ انت.', 'ألبوم الخروجة', 'لما الألبوم فاضي'),
  ('album.add',      'ارفع صورة', 'ألبوم الخروجة', 'زرار الرفع'),
  ('album.uploading','بيترفع…', 'ألبوم الخروجة', 'وقت الرفع'),
  ('album.caption',  'كلمتين عن الصورة (اختياري)', 'ألبوم الخروجة', 'خانة الكلام'),
  ('album.by',       'رفعها {{name}}', 'ألبوم الخروجة', 'مين رفع الصورة — الاسم الأول وبس'),
  ('album.mine',     'صورتك', 'ألبوم الخروجة', 'وسم على صورتي أنا'),
  ('album.remove',   'امسحها', 'ألبوم الخروجة', 'زرار مسح — على صوري أنا بس'),
  ('album.failed',   'الصورة مرفعتش. جرّب تاني.', 'ألبوم الخروجة', 'لما الرفع يقع')
on conflict (key) do nothing;
