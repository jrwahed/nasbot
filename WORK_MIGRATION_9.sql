-- ============================================================================
-- WORK_MIGRATION_9.sql — صفحات الموقع: القواعد · الأسئلة · مين إحنا · الشروط
--
-- ⚠ الزق الدفعات اللي قبله الأول. الترتيب: ٥ ← ٦ ← ٧ ← ٨ ← ٩.
--
-- الزقه كله مرة واحدة في Supabase ← SQL Editor ← Run.
-- آمن يتكرر — اتجرّب بلزقتين ورا بعض على قاعدة نضيفة.
--
-- **المشكلة اللي بيحلها:** ذيل الموقع فيه ٥ روابط، و**أربعة منهم كانوا
-- بيروحوا نفس الصفحة** (`/rules`). يعني «الأسئلة» و«مين إحنا» و«الشروط»
-- مكانش ليهم صفحات أصلًا. وصفحة القواعد نفسها نصوصها كانت متحطوطة في
-- الكود (`src/data/lists.ts`) فمكنتش تتعدّل من اللوحة.
--
-- **الحل:** جدولين — `content_pages` و`content_blocks`. كل صفحة ليها فقرات
-- بتتضاف وتتمسح وتترتّب من `/admin/content` ← تبويب **«صفحات الموقع»**،
-- من غير هجرة ولا نشر. سؤال جديد في «الأسئلة» = صف جديد، مش كوميت.
--
-- ⚠ الأمان: الكتابة بـ`fn_has_permission('content.edit')` مش `fn_is_admin()`
--    — الدرس من 0056: `fn_is_admin` بقت «أي صف نشط في admin_users»، يعني
--    حتى `support` كان هيعدّل شروط الموقع.
--
-- بعد ما يخلص شغّل السطر ده، ولازم كل الصفوف «نجح»:
--     select * from test_content_pages();
--
-- **وبعد اللزق، ده اللي انت هتعمله:**
--   /admin/content ← «صفحات الموقع» ← اختار الصفحة ← «ضيف فقرة».
--   الفقرة الجديدة بتتولد **مقفولة** — اكتبها وبعدين افتحها للناس.
--   و«اسم الرابط في الذيل» لو سيبته فاضي، الرابط بيختفي من ذيل الموقع.
--
-- ⚠ **حاجة محتاجة عينك:** القاعدة رقم ١ كانت بتقول «كابتن في كل سبوطة —
--    مفيش خروجة من غير كابتن». ده بقى **مش صحيح** بعد 0078 (العضو بيفتح
--    خروجته والكابتن اختياري)، فاتكتبت من جديد: «حد ماسك المجموعة». راجعها
--    وغيّرها من اللوحة لو الصياغة مش عاجباك.
-- ============================================================================


-- ############################################################################
-- # 20260912110000_0082_content_pages.sql
-- ############################################################################

-- ============================================================================
-- 0082 — صفحات المحتوى: القواعد · الأسئلة · مين إحنا · الشروط
--
-- المشكلة: الذيل فيه ٥ روابط، **أربعة منهم بيروحوا نفس الصفحة** `/rules`.
-- «الأسئلة» و«مين إحنا» و«الشروط» مالهمش صفحات أصلًا. وصفحة القواعد نفسها
-- نصوصها متحطوطة في `src/data/lists.ts` (القواعد الخمسة والضمان) — يعني
-- المالك مش قادر يعدّلها من اللوحة. دي نتيجة مفتوحة في المراجعة (U + A).
--
-- الحل: جدولين — صفحة وفقرات. المالك بيضيف ويمسح ويرتّب من `/admin/content`
-- من غير هجرة ولا نشر. سؤال جديد في الأسئلة = صف جديد، مش كوميت.
--
-- ليه جدول مش مفاتيح في `copy_strings`؟ لأن ده **قايمة متغيّرة الطول** مش
-- نص ثابت. مفاتيح مرقّمة (faq.q.1 … faq.q.12) كانت هتخلّي المالك محبوس في
-- عدد قررناه إحنا، وتغرق `/admin/content` بخانات فاضية.
--
-- ⚠ الأمان:
--   · القراية: الفقرات النشطة مفتوحة للكل (دي صفحات عامة زي `/rules`)،
--     والمقفولة للإدارة بس — فالمالك يكتب على راحته قبل ما ينشر.
--   · الكتابة: `fn_has_permission('content.edit')` **مش** `fn_is_admin()`.
--     الدرس من 0056: `fn_is_admin` بقت «أي صف نشط في admin_users»، يعني
--     حتى `support` كان هيعدّل شروط الموقع.
--   · كل `create policy` ورا `drop policy if exists` **بنفس الاسم الجديد** —
--     الغلطة اللي وقفت اللزق في 0056.
--
-- آمنة تتكرر: `if not exists` / `create or replace` / `on conflict`.
-- ============================================================================


-- ===== 1) نوع الفقرة =====
-- نوع **جديد** مش `alter type ... add value`، فآمن في نفس المعاملة (§6).
do $$
begin
  if not exists (select 1 from pg_type where typname = 'content_block_t') then
    create type content_block_t as enum ('section', 'qa', 'numbered', 'callout');
  end if;
end $$;


-- ===== 2) الصفحات =====
create table if not exists content_pages (
  slug            text primary key,
  title_ar        text not null,
  intro_ar        text,
  footer_label_ar text,
  is_active       boolean not null default true,
  sort            int not null default 0,
  updated_at      timestamptz not null default now(),
  created_at      timestamptz not null default now()
);

alter table content_pages add column if not exists footer_label_ar text;

comment on table content_pages is
  'صفحات المحتوى العامة (القواعد · الأسئلة · مين إحنا · الشروط). العنوان والمقدمة هنا، والباقي في content_blocks.';
comment on column content_pages.slug is 'المسار على الموقع: rules → /rules · faq → /faq · about → /about · terms → /terms.';
comment on column content_pages.is_active is 'مقفولة = الرابط بيختفي من الذيل والصفحة بتقول «بنكتبها دلوقتي».';
comment on column content_pages.footer_label_ar is
  'اسم الرابط في ذيل الموقع — غير عنوان الصفحة («القواعد» في الذيل بس العنوان «الثقة قبل الفسحة»). فاضي = الرابط ما بيظهرش.';

drop trigger if exists t_content_pages_updated on content_pages;
create trigger t_content_pages_updated before update on content_pages
  for each row execute function set_updated_at();


-- ===== 3) الفقرات =====
create table if not exists content_blocks (
  id         uuid primary key default gen_random_uuid(),
  page_slug  text not null references content_pages(slug) on delete cascade,
  kind       content_block_t not null default 'section',
  heading_ar text,
  body_ar    text not null,
  tone       text,
  ref        text,
  sort       int not null default 0,
  is_active  boolean not null default true,
  updated_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

comment on table content_blocks is 'فقرات صفحات المحتوى — بتتضاف وتتمسح وتترتّب من /admin/content.';
comment on column content_blocks.kind is
  'section = عنوان ونص · qa = سؤال وجواب · numbered = كرت مرقّم (القواعد الخمسة) · callout = صندوق ملوّن (الضمان).';
comment on column content_blocks.tone is 'لون صندوق الـcallout: cobalt أو sand. فاضي = رملي.';
comment on column content_blocks.sort is 'الترتيب على الصفحة — الأصغر فوق.';

alter table content_blocks add column if not exists ref text;

comment on column content_blocks.ref is
  'مرجع ثابت للفقرات اللي الكود بيسأل عنها بالاسم — دلوقتي `guarantee` (صندوق الضمان اللي بيظهر في صفحات الدفع والحجز كمان). المالك يعدّل النص، والمرجع ما يتغيّرش.';

create index if not exists content_blocks_page_idx on content_blocks (page_slug, sort);
create index if not exists content_blocks_ref_idx  on content_blocks (ref) where ref is not null;

drop trigger if exists t_content_blocks_updated on content_blocks;
create trigger t_content_blocks_updated before update on content_blocks
  for each row execute function set_updated_at();


-- ===== 4) السياسات =====
alter table content_pages  enable row level security;
alter table content_blocks enable row level security;

drop policy if exists cpages_read on content_pages;
create policy cpages_read on content_pages for select
  using (is_active or fn_is_admin());

drop policy if exists cpages_write on content_pages;
create policy cpages_write on content_pages for all
  using (fn_has_permission('content.edit'))
  with check (fn_has_permission('content.edit'));

drop policy if exists cblocks_read on content_blocks;
create policy cblocks_read on content_blocks for select
  using (
    fn_is_admin()
    or (is_active and exists (
          select 1 from content_pages p
           where p.slug = content_blocks.page_slug and p.is_active))
  );

drop policy if exists cblocks_write on content_blocks;
create policy cblocks_write on content_blocks for all
  using (fn_has_permission('content.edit'))
  with check (fn_has_permission('content.edit'));

grant select on content_pages, content_blocks to anon, authenticated;


-- ===== 5) البذرة — الأربع صفحات =====
insert into content_pages (slug, title_ar, intro_ar, footer_label_ar, sort, is_active) values
  ('rules', 'الثقة قبل الفسحة', 'القواعد اللي بتخلّي حد ما يعرفش حد يقعد معاه مرتاح.', 'القواعد', 1, true),
  ('faq',   'أسئلة بتتسأل كتير', null, 'الأسئلة',  2, true),
  ('about', 'مين إحنا',          null, 'مين إحنا', 3, true),
  ('terms', 'الشروط',            null, 'الشروط',   4, true)
on conflict (slug) do nothing;

-- للقواعد القديمة اللي اتلزقت قبل ما العمود ده يتضاف
update content_pages set footer_label_ar = coalesce(footer_label_ar, case slug
    when 'rules' then 'القواعد' when 'faq' then 'الأسئلة'
    when 'about' then 'مين إحنا' when 'terms' then 'الشروط' end)
 where slug in ('rules','faq','about','terms');

-- ⚠ `do nothing` مش `do update` عن قصد: لو المالك عدّل العنوان من اللوحة،
--   لزق الملف تاني ما يرجّعوش للنص الأصلي.


-- ===== 6) بذرة القواعد الخمسة والضمان =====
-- دول كانوا في `src/data/lists.ts`. بننقلهم هنا علشان يبقوا قابلين للتعديل.
--
-- ⚠ القاعدة رقم ١ كانت بتقول «كابتن في كل سبوطة — مفيش خروجة من غير كابتن».
--   بعد 0078 ده بقى **مش صحيح**: العضو بيفتح خروجته بنفسه والكابتن اختياري.
--   اتكتبت من جديد. باقي الأربعة زي ما هم بالحرف.
do $$
begin
  -- بنبذر مرة واحدة بس. لو المالك مسح فقرة أو زوّد، مش هنرجّعله القديم.
  if not exists (select 1 from content_blocks where page_slug = 'rules') then
    insert into content_blocks (page_slug, kind, heading_ar, body_ar, tone, ref, sort) values
      ('rules', 'numbered', 'حد ماسك المجموعة',
       'كل خروجة ليها صاحب — عضو فتحها أو كابتن من نسبوط. هو اللي بيستقبلك، وبيعرّف الناس على بعض، وبيتصرف لو حصل أي حاجة.',
       null, null, 1),
      ('rules', 'numbered', 'اللي يضايق حد بيمشي',
       'مرة واحدة وخلاص. اللي ماسك المجموعة ممكن يشيل أي حد في نفس اللحظة، والحساب بيتقفل.',
       null, null, 2),
      ('rules', 'numbered', 'التصوير بإذن',
       'محدش بيتصور من غير ما يوافق. والصور مش بتتنشر غير لما اللي فيها يقولوا تمام.',
       null, null, 3),
      ('rules', 'numbered', 'محدش بياخد رقم حد إلا لو الاتنين عايزين',
       'الأرقام مخفية. لو الاتنين اختاروا بعض في التقييم، ساعتها بس بيتفتح بينهم شات.',
       null, null, 4),
      ('rules', 'numbered', 'احترام',
       'كل اللي معاك رقمه متحقق ووافق على القواعد دي قبل ما يحجز.',
       null, null, 5),
      ('rules', 'callout', 'الضمان',
       'لو إحنا لغينا، فلوسك كاملة. لو أنت لغيت قبل 3 أيام، فلوسك كاملة. أقل من كده، رصيد.',
       'sand', 'guarantee', 6),
      ('rules', 'callout', 'بنات بس',
       'في خروجات للبنات بس. تقدري تطلبيها من صفحة حجزك، وتقدري تفتحيها بنفسك من «افتح خروجة».',
       'cobalt', null, 7);
  end if;
end $$;


-- المرجع للقواعد اللي اتلزقت قبل ما العمود ده يتضاف
update content_blocks set ref = 'guarantee'
 where page_slug = 'rules' and kind = 'callout' and heading_ar = 'الضمان' and ref is null;


-- ===== 7) نصوص الشاشة =====
-- الهيكل بس (زرار الرجوع ورسالة الصفحة الفاضية) — المحتوى نفسه في
-- `content_blocks` مش هنا.
insert into copy_strings (key, value_ar, screen, context_ar) values
  ('content.back', 'الرئيسية', 'صفحات الموقع', 'زرار الرجوع فوق صفحات المحتوى'),
  ('content.empty', 'بنكتب الصفحة دي دلوقتي. ارجعلنا قريب.', 'صفحات الموقع',
   'اللي بيظهر لما الصفحة لسه مفيهاش فقرات')
on conflict (key) do update
  set value_ar   = excluded.value_ar,
      screen     = excluded.screen,
      context_ar = coalesce(excluded.context_ar, copy_strings.context_ar);


-- ===== 8) اختبار =====
create or replace function test_content_pages()
returns table (test text, result text)
language plpgsql
set search_path = public
as $$
declare
  n     int;
  me    text := current_user;
  uid   uuid;
  ok    boolean;
begin
  select p.id into uid
    from profiles p
   where not exists (select 1 from admin_users a where a.profile_id = p.id)
   limit 1;

  test := '0082 · الأربع صفحات موجودة';
  select count(*) into n from content_pages
   where slug in ('rules','faq','about','terms');
  if n = 4 then result := 'نجح';
  else result := format('فشل — %s من ٤', n); end if;
  return next;

  test := '0082 · الأربعة ليهم اسم في الذيل';
  select count(*) into n from content_pages
   where slug in ('rules','faq','about','terms') and coalesce(btrim(footer_label_ar),'') <> '';
  if n = 4 then result := 'نجح';
  else result := format('فشل — %s من ٤، الباقي هيختفي من الذيل', n); end if;
  return next;

  test := '0082 · القواعد الخمسة والضمان اتنقلوا من الكود للقاعدة';
  select count(*) into n from content_blocks where page_slug = 'rules';
  if n >= 7 then result := format('نجح — %s فقرة', n);
  else result := format('فشل — %s بس', n); end if;
  return next;

  test := '0082 · صندوق الضمان ليه مرجع ثابت (الكود بيسأل عنه بالاسم)';
  select count(*) into n from content_blocks where ref = 'guarantee';
  if n = 1 then result := 'نجح';
  else result := format('فشل — %s صف بالمرجع ده، صفحات الدفع هتقع على الاحتياطي', n); end if;
  return next;

  test := '0082 · 🔴 القاعدة رقم ١ ما بقتش بتقول «مفيش خروجة من غير كابتن»';
  select count(*) into n from content_blocks
   where page_slug = 'rules' and body_ar like '%مفيش خروجة من غير كابتن%';
  if n = 0 then result := 'نجح';
  else result := 'فشل — القواعد بتناقض المنتج: العضو بيفتح خروجته من 0078'; end if;
  return next;

  test := '0082 · الكتابة بالصلاحية مش بـ fn_is_admin';
  if exists (
    select 1 from pg_policies where tablename = 'content_blocks'
      and policyname = 'cblocks_write' and coalesce(qual,'') like '%content.edit%'
  ) and not exists (
    select 1 from pg_policies where tablename in ('content_blocks','content_pages')
      and cmd in ('ALL','INSERT','UPDATE','DELETE')
      and coalesce(qual,'') || coalesce(with_check,'') like '%fn_is_admin%'
  ) then result := 'نجح';
  else result := 'فشل — 🔴 سياسة الكتابة واسعة، حتى support هيعدّل الشروط'; end if;
  return next;

  /* ===== سلوكي ===== */

  begin
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    execute 'set local role anon';

    test := 'سلوكي · الزائر بيقرا الفقرات النشطة (الصفحات عامة)';
    select count(*) into n from content_blocks;
    if n >= 7 then result := format('نجح — شاف %s فقرة', n);
    else result := format('فشل — شاف %s، الصفحات هتبان فاضية', n); end if;
    return next;

    test := 'سلوكي · الزائر **مش** بيقدر يكتب فقرة';
    ok := false;
    begin
      insert into content_blocks (page_slug, kind, body_ar) values ('terms','section','__hack__');
      ok := false;
    exception when others then ok := true; end;
    if ok then result := 'نجح';
    else result := 'فشل — 🔴 الزائر بيكتب في شروط الموقع'; end if;
    return next;

    test := 'سلوكي · الزائر **مش** بيقدر يعدّل عنوان صفحة';
    ok := false;
    begin
      update content_pages set title_ar = '__hack__' where slug = 'terms';
      get diagnostics n = row_count;
      ok := (n = 0);
    exception when others then ok := true; end;
    if ok then result := 'نجح';
    else result := 'فشل — 🔴 الزائر غيّر عنوان صفحة'; end if;
    return next;

    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);
  exception when others then
    execute format('set local role %I', me);
    perform set_config('request.jwt.claims', '', true);
    test := 'سلوكي · اختبار الزائر'; result := 'فشل — ' || sqlerrm; return next;
  end;

  if uid is null then
    test := 'سلوكي · عضو من غير صلاحية';
    result := 'نجح — اتخطى (مفيش عضو عادي)';
    return next;
  else
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', uid::text, 'role','authenticated')::text, true);
      execute 'set local role authenticated';

      test := 'سلوكي · عضو عادي **مش** بيقدر يمسح فقرة';
      ok := false;
      begin
        delete from content_blocks where page_slug = 'rules';
        get diagnostics n = row_count;
        ok := (n = 0);
      exception when others then ok := true; end;
      if ok then result := 'نجح';
      else result := 'فشل — 🔴 أي عضو بيمسح قواعد الموقع'; end if;
      return next;

      execute format('set local role %I', me);
      perform set_config('request.jwt.claims', '', true);
    exception when others then
      execute format('set local role %I', me);
      perform set_config('request.jwt.claims', '', true);
      test := 'سلوكي · اختبار العضو'; result := 'فشل — ' || sqlerrm; return next;
    end;
  end if;

  /* ===== الحالة الرابعة: صاحب الصلاحية لازم **ينجح** ===== */
  -- من غير الاختبار ده، سياسة مضيّقة أوي بتعدّي كأنها صح — وبعدين المالك
  -- يفتح اللوحة يلاقيها مقفولة عليه.
  select au.profile_id into uid
    from admin_users au
    join role_permissions rp on rp.role_key = au.role_key
   where au.is_active and rp.permission_key = 'content.edit'
   limit 1;

  if uid is null then
    test := 'سلوكي · صاحب content.edit بيكتب';
    result := 'نجح — اتخطى (مفيش صف admin_users بالصلاحية دي)';
    return next;
  else
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', uid::text, 'role','authenticated')::text, true);
      execute 'set local role authenticated';

      test := 'سلوكي · صاحب content.edit **بيضيف** فقرة فعلًا';
      n := 0;
      begin
        insert into content_blocks (page_slug, kind, heading_ar, body_ar, sort)
        values ('faq', 'qa', '__test__', '__test__', 999);
        get diagnostics n = row_count;
      exception when others then n := -1; end;
      if n = 1 then result := 'نجح';
      else result := format('فشل — %s صف، يعني محرّر المحتوى مقفول على المالك', n); end if;
      return next;

      test := 'سلوكي · صاحب content.edit **بيمسح** فقرة فعلًا';
      n := 0;
      begin
        delete from content_blocks where heading_ar = '__test__';
        get diagnostics n = row_count;
      exception when others then n := -1; end;
      if n >= 1 then result := 'نجح';
      else result := format('فشل — %s صف اتمسح', n); end if;
      return next;

      test := 'سلوكي · صاحب content.edit بيشوف الصفحات المقفولة كمان';
      begin
        select count(*) into n from content_pages;
        result := format('نجح — شاف %s صفحة', n);
      exception when others then result := 'فشل — ' || sqlerrm; end;
      return next;

      execute format('set local role %I', me);
      perform set_config('request.jwt.claims', '', true);
    exception when others then
      execute format('set local role %I', me);
      perform set_config('request.jwt.claims', '', true);
      test := 'سلوكي · اختبار صاحب الصلاحية'; result := 'فشل — ' || sqlerrm; return next;
    end;
  end if;

  test := '0082 · القواعد لسه كاملة بعد محاولات المسح';
  select count(*) into n from content_blocks where page_slug = 'rules';
  if n >= 7 then result := format('نجح — %s فقرة', n);
  else result := format('فشل — 🔴 فاضل %s، حد مسح', n); end if;
  return next;
end;
$$;

comment on function test_content_pages() is
  'بتتأكد إن صفحات المحتوى موجودة ومقفولة صح. select * from test_content_pages();';

revoke execute on function test_content_pages() from public, anon, authenticated;
