-- ============================================================================
-- 0114 — الفيد: حاجة بتحصل، لناس بتحصلهم
--
-- الوجع: العضو بيخرج مرة وبيختفي. مفيش حاجة بتوريه إن النادي **حي** —
-- إن فيه خروجات بتحصل كل أسبوع وناس بترجع.
--
-- 🔴 **قرارين من صاحب المشروع (٢٠٢٦-٠٩-٢١):**
--    1. الفيد مقفول على **اللي حضر خروجة واحدة على الأقل**. الزائر، والعضو
--       اللي عامل حساب وبس — مايشوفوش حاجة.
--    2. صور خروجة معيّنة **لأهلها بس**. حد حضر «بادل» ما يشوفش صور
--       «الكاياك» ولا أسامي ناسها.
--
-- ومن القرارين دول الفيد بيطلع **طبقتين**:
--
--   · **خروجاتك انت** — بصورها وبرابط صفحتها. الناس دي اتكشفت لك خلاص.
--   · **الخروجات التانية** — كرت من غير صور ولا أسامي: «٦ راحوا ورشة
--     فخار السبت». ده بيدّي إحساس إن المكان حي من غير ما يكشف ولا اسم.
--
-- ⚠ الطبقة التانية دي هي اللي بتمنع الصفحة تبقى «بروفايلات عامة». لو حد
--   جه بعدين وحط فيها الأسامي أو الصور، يبقى كسر القرار — وفيه صف في
--   `test_feed()` بيمسك ده بالظبط.
--
-- آمنة تتكرر: `create or replace` + `on conflict`.
-- ============================================================================

-- ===== 1) الحارس: كان في خروجة خلصت؟ =====
--
-- ⚠ نفس تعريف `fn_was_in_sbota` بالظبط، بس من غير تحديد خروجة — والاتنين
--   بيقروا من نفس الشرط علشان ما يفترقوش.
create or replace function fn_is_alumni(p_profile uuid default auth.uid())
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
     where b.profile_id = p_profile
       and p_profile is not null
       and b.status in ('paid', 'attended')
       and s.ends_at < now()
  );
$$;

comment on function fn_is_alumni(uuid) is
  'خرج معانا مرة على الأقل — مفتاح الفيد (0114).';

revoke execute on function fn_is_alumni(uuid) from public, anon;
grant  execute on function fn_is_alumni(uuid) to authenticated;


-- ===== 2) الفيد =====
--
-- 🔴 `photo_path` و`booking_id` بيرجعوا **null** في كرت الخروجة اللي
--    مكنتش فيها. مش بنعتمد على الواجهة إنها تخبّيهم — الدالة نفسها مش
--    بتطلّعهم.
create or replace function fn_feed(p_limit int default 30)
returns table (
  sbota_id    uuid,
  kind        text,          -- 'mine' | 'other'
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
         -- الصور لأهل الخروجة بس
         case when mine.booking_id is not null then
           (select ph.path from sbota_photos ph
             where ph.sbota_id = s.id order by ph.created_at desc limit 1)
         end,
         case when mine.booking_id is not null then
           (select count(*)::int from sbota_photos ph where ph.sbota_id = s.id)
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
  'الفيد: خروجاتك بصورها، وباقي الخروجات كرت من غير صور ولا أسامي (0114).';

revoke execute on function fn_feed(int) from public, anon;
grant  execute on function fn_feed(int) to authenticated;


-- ===== 3) مفتاح الميزة + النصوص =====

insert into feature_flags (key, name_ar, is_on, off_message_ar)
values ('feed', 'الفيد', true,
        'الفيد مقفول دلوقتي — هيرجع قريب.')
on conflict (key) do nothing;

insert into copy_strings (key, value_ar, screen, context_ar) values
  ('feed.title',      'اللي بيحصل', 'الفيد', 'عنوان الصفحة'),
  ('feed.nav',        'اللي بيحصل', 'الفيد', 'الرابط في القايمة'),
  ('feed.note',       'صور كل خروجة بتبان لناسها بس.', 'الفيد', 'سطر الخصوصية تحت العنوان'),
  ('feed.locked',     'الفيد بيتفتح بعد أول خروجة ليك. احجز واحدة وتعالى.', 'الفيد',
   'للي لسه ما خرجش معانا'),
  ('feed.empty',      'لسه مفيش خروجات عدّت.', 'الفيد', 'لما مفيش ولا خروجة خلصت'),
  ('feed.mine',       'كنت فيها', 'الفيد', 'وسم على خروجاتي'),
  ('feed.people',     '{{n}} راحوا', 'الفيد', 'عدد اللي راحوا — رقم بس، من غير أسامي'),
  ('feed.photos',     '{{n}} صورة', 'الفيد', 'عدد صور خروجتي'),
  ('feed.open',       'افتح', 'الفيد', 'زرار على خروجتي بيودّي لصفحتها'),
  ('feed.cta',        'شوف الخروجات الجاية', 'الفيد', 'زرار تحت بيودّي للرئيسية')
on conflict (key) do nothing;


-- ===== دالة الاختبار =====
create or replace function test_feed()
returns table (test text, result text)
language plpgsql
set search_path = public
as $body$
declare
  v_tpl uuid := '0114aaaa-0000-4000-8000-000000000001';
  v_a   uuid := '0114aaaa-0000-4000-8000-000000000002';  -- خروجتي
  v_b   uuid := '0114aaaa-0000-4000-8000-000000000003';  -- خروجة غيري
  v_in  uuid;
  v_out uuid;
  n int;
  v_photo text;
  v_kind  text;
begin
  if exists (select 1 from profiles where id = '33333333-0000-0000-0000-000000000001'
               and deleted_at is null)
     and exists (select 1 from profiles where id = '33333333-0000-0000-0000-000000000003'
                   and deleted_at is null) then
    v_in  := '33333333-0000-0000-0000-000000000001';
    v_out := '33333333-0000-0000-0000-000000000003';
  else
    test := '0114 · الفيد';
    result := 'معلومة — محتاج البذرة المؤقتة (fn_test_seed_up)';
    return next;
    return;
  end if;

  insert into sbota_templates (id, slug, name_ar, story_ar, kind, default_price,
                               org_fee, duration_min, min_group, max_group)
  values (v_tpl, 'test-feed', '[اختبار] فيد', '[اختبار]', 'food', 0, 0, 120, 4, 8)
  on conflict (id) do nothing;

  insert into sbotat (id, template_id, starts_at, ends_at, price, capacity, status, title_ar)
  values (v_a, v_tpl, now() - interval '3 days', now() - interval '3 days' + interval '2 hours',
          0, 8, 'done', '[اختبار] خروجتي'),
         (v_b, v_tpl, now() - interval '4 days', now() - interval '4 days' + interval '2 hours',
          0, 8, 'done', '[اختبار] خروجة غيري')
  on conflict (id) do nothing;

  insert into bookings (id, sbota_id, profile_id, status, price_paid)
  values ('0114aaaa-0000-4000-8000-000000000004', v_a, v_in,  'paid', 0),
         ('0114aaaa-0000-4000-8000-000000000005', v_b, v_out, 'paid', 0)
  on conflict (id) do nothing;

  insert into sbota_photos (id, sbota_id, path, uploaded_by)
  values ('0114aaaa-0000-4000-8000-000000000006', v_a, v_a::text || '/a.jpg', v_in),
         ('0114aaaa-0000-4000-8000-000000000007', v_b, v_b::text || '/b.jpg', v_out)
  on conflict (id) do nothing;

  set local role authenticated;

  -- (1) اللي خرج معانا بيشوف الاتنين
  perform set_config('request.jwt.claims',
                     json_build_object('sub', v_in, 'role', 'authenticated')::text, true);
  select count(*) into n from fn_feed(100) f
   where f.sbota_id in (v_a, v_b);
  test := '0114 · اللي خرج معانا بيشوف الخروجات كلها';
  result := case when n = 2 then 'نجح' else format('فشل — شاف %s من 2', n) end;
  return next;

  -- (2) 🔴 خروجة مكانش فيها = كرت من غير صور
  select f.kind, f.photo_path into v_kind, v_photo from fn_feed(100) f where f.sbota_id = v_b;
  test := '0114 · خروجة مكانش فيها → مفيش صور ولا رابط';
  if v_kind = 'other' and v_photo is null then result := 'نجح';
  else result := format('فشل — 🔴 رجّعت kind=%s وصورة=%s', coalesce(v_kind,'?'),
                        coalesce(v_photo, 'null')); end if;
  return next;

  -- (3) وخروجتي أنا بصورها
  select f.kind, f.photo_path into v_kind, v_photo from fn_feed(100) f where f.sbota_id = v_a;
  test := '0114 · خروجتي أنا بصورها';
  if v_kind = 'mine' and v_photo is not null then result := 'نجح';
  else result := 'فشل — خروجتي رجعت من غير صور'; end if;
  return next;

  -- (4) 🔴 اللي ما خرجش معانا خالص → فيد فاضي
  --     (بنستعمل عضو مالوش أي حجز خلص)
  perform set_config('request.jwt.claims',
                     json_build_object('sub', '33333333-0000-0000-0000-000000000005',
                                       'role', 'authenticated')::text, true);
  if exists (select 1 from profiles where id = '33333333-0000-0000-0000-000000000005') then
    select count(*) into n from fn_feed(100);
    test := '0114 · اللي ما خرجش معانا → فيد فاضي';
    result := case when n = 0 then 'نجح'
                   else format('فشل — 🔴 شاف %s كرت وهو ما خرجش معانا', n) end;
  else
    test := '0114 · اللي ما خرجش معانا → فيد فاضي';
    result := 'معلومة — سلمى مش في البذرة';
  end if;
  return next;

  -- (5) الزائر المجهول
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin
    select count(*) into n from fn_feed(100);
    test := '0114 · الزائر المجهول';
    result := case when n = 0 then 'نجح (رجّعت فاضي)'
                   else format('فشل — 🔴 المجهول شاف %s كرت', n) end;
  exception when insufficient_privilege then
    test := '0114 · الزائر المجهول';
    result := 'نجح (permission denied)';
  end;
  return next;

  -- ⚠ الترجيع
  reset role;
  perform set_config('request.jwt.claims', null, true);
  delete from sbota_photos where sbota_id in (v_a, v_b);
  delete from bookings where id in ('0114aaaa-0000-4000-8000-000000000004',
                                    '0114aaaa-0000-4000-8000-000000000005');
  delete from sbotat where id in (v_a, v_b);
  delete from sbota_templates where id = v_tpl;
end $body$;

comment on function test_feed() is
  '0114 — الفيد لخريجي الخروجات بس، وصور كل خروجة لأهلها بس.';
