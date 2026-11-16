-- ============================================================================
-- 0150 · النقاش: ردود · رد باسم نسبوط · صورة
--
-- طلب المالك (٢٠٢٦-١١-١٦): «عاوز يبقى فيه رد — أدوس على كلام كريم وأرد
-- باسم نسبوط، ونتناقش والناس تدخل في النقاش، وأرفع صور».
--
-- 🔑 **ثلاث حاجات في جدول واحد**، كلهم أعمدة على `yalla_comments`:
--   · `parent_id`   — الرد على كلام.
--   · `as_nasbot`   — الرد باسم الموقع بدل اسمك (للوحة بس).
--   · `photo_path`  — صورة مع الكلام.
--
-- ⚠ **مستوى واحد بس — رد على كلام، مش رد على رد.** الشجرة المفتوحة
--   بتتحول لخيط مالوش آخر على موبايل، والعرض بيبقى مستحيل. الحارس في
--   القاعدة مش في الواجهة: لو الأب نفسه عنده أب، بترفض.
--
-- 🔴 **`as_nasbot` للوحة بس** (`sbotat.edit`). لو أي عضو قدر يحطها، يقدر
--    ينتحل صفة الموقع ويقول للناس «الخروجة اتلغت» — فالحارس صريح، وفيه
--    صف اختبار سلوكي.
--
-- ⚠ **ليه `drop` قبل `create`؟** `fn_yalla_say` كانت parameterين، والزيادة
--   بـ`default` بتعمل دالة **تانية** والنداء بالاتنين يبقى ambiguous
--   (مصيدة `fn_create_sbota`). و`fn_yalla_comments` بترجّع أعمدة زيادة
--   و`create or replace` ما بتقدرش تغيّر عدد الأعمدة (مصيدة
--   `fn_sbota_album`). فالاتنين `drop` الأول.
--
-- 🔴 **وعلشان كده `0147` اتحصّنت** (الدرس التالت): بقت ما تعرّفش النسختين
--    القديمتين لو الجديدة موجودة. من غير كده إعادة لزق `WORK_MIGRATION_65`
--    كانت بترجّع التوقيع القديم **جنب** الجديد والنداء يبقى ambiguous.
--
-- آمنة تتكرر.
-- ============================================================================

-- ===== 1) الأعمدة =====
alter table yalla_comments add column if not exists parent_id  uuid references yalla_comments (id) on delete cascade;
alter table yalla_comments add column if not exists as_nasbot  boolean not null default false;
alter table yalla_comments add column if not exists photo_path text;

create index if not exists yalla_comments_parent on yalla_comments (parent_id);

comment on column yalla_comments.parent_id is
  '0150 — الرد على كلام. مستوى واحد بس: الأب لازم يكون جذر.';
comment on column yalla_comments.as_nasbot is
  '0150 — الكلام باسم الموقع مش باسم صاحبه. اللوحة بس (sbotat.edit).';
comment on column yalla_comments.photo_path is
  '0150 — مسار الصورة في دلو yalla-photos. الشكل: <call_id>/<uuid>.<ext>';


-- ===== 2) رقم الحد =====
alter table settings add column if not exists yalla_max_replies int not null default 20;

comment on column settings.yalla_max_replies is
  'يلا: أقصى ردود لعضو واحد في النداء الواحد (الردود مش محسوبة في yalla_max_comments)';


-- ===== 3) الكتابة =====
-- ⚠ التوقيع القديم (`uuid, text`) لازم يتشال الأول — شوف الترويسة.
drop function if exists fn_yalla_say(uuid, text);

create or replace function fn_yalla_say(
  p_call      uuid,
  p_body      text,
  p_parent    uuid    default null,
  p_photo     text    default null,
  p_as_nasbot boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_uid     uuid := auth.uid();
  v_body    text := btrim(coalesce(p_body, ''));
  v_bad     text;
  v_id      uuid;
  v_n       int;
  v_root    uuid;
  v_isadmin boolean;
begin
  -- 🔴 المقارنة مش حارس — الفحص الصريح هو الحارس (الدرس الخمسة وعشرين).
  if v_uid is null then
    raise exception 'لازم تسجّل الأول' using errcode = '42501';
  end if;

  v_isadmin := fn_has_permission('sbotat.edit');

  -- 🔴 انتحال صفة الموقع — اللوحة بس.
  if p_as_nasbot and not v_isadmin then
    raise exception 'الرد باسم نسبوط للوحة بس' using errcode = '42501';
  end if;

  -- الصورة لوحدها كلام كامل (مش لازم نص معاها).
  if v_body = '' and coalesce(btrim(p_photo), '') = '' then
    raise exception 'اكتب حاجة' using errcode = '22023';
  end if;
  if length(v_body) > 400 then
    raise exception 'الكلام طويل أوي — ٤٠٠ حرف كحد أقصى' using errcode = '22023';
  end if;

  if not exists (select 1 from yalla_calls c
                  where c.id = p_call and c.status = 'open') then
    raise exception 'النداء مقفول' using errcode = '22023';
  end if;

  -- ⚠ الرد لازم يكون على كلام في **نفس النداء**، و**الأب لازم يكون جذر**.
  if p_parent is not null then
    select parent_id into v_root from yalla_comments
     where id = p_parent and call_id = p_call;
    if not found then
      raise exception 'الكلام ده مش موجود في النداء ده' using errcode = '22023';
    end if;
    if v_root is not null then
      raise exception 'الرد على الرد مش متاح — رد على الكلام الأصلي'
        using errcode = '22023';
    end if;
  end if;

  -- ⚠ نفس مصدر الكلمات الممنوعة بتاع `fn_guard_sbota_text` — مش نسخة.
  select string_agg(w.word, '، ') into v_bad
    from banned_words w
   where v_body ilike '%' || w.word || '%';
  if v_bad is not null then
    raise exception 'في كلمات مش بنستعملها: %', v_bad using errcode = '22023';
  end if;

  -- ⚠ الحد: الجذور والردود ليهم حدّين مختلفين، واللوحة مالهاش حد (بترد
  --   على الناس، ولو اتقفلت الناس تستنى رد مش جاي).
  if not v_isadmin then
    if p_parent is null then
      select count(*) into v_n from yalla_comments
       where call_id = p_call and profile_id = v_uid and parent_id is null;
      if v_n >= (select coalesce(yalla_max_comments, 5) from settings limit 1) then
        raise exception 'كتبت كتير في النداء ده' using errcode = '22023';
      end if;
    else
      select count(*) into v_n from yalla_comments
       where call_id = p_call and profile_id = v_uid and parent_id is not null;
      if v_n >= (select coalesce(yalla_max_replies, 20) from settings limit 1) then
        raise exception 'كتبت كتير في النداء ده' using errcode = '22023';
      end if;
    end if;
  end if;

  insert into yalla_comments (call_id, profile_id, body_ar, parent_id,
                              photo_path, as_nasbot)
  values (p_call, v_uid, v_body, p_parent,
          nullif(btrim(coalesce(p_photo, '')), ''), coalesce(p_as_nasbot, false))
  returning id into v_id;

  return v_id;
end $body$;

comment on function fn_yalla_say(uuid, text, uuid, text, boolean) is
  '0150 — العضو يكتب أو يرد تحت النداء، ومعاه صورة. as_nasbot للوحة بس. الطريق الوحيد للكتابة.';
revoke execute on function fn_yalla_say(uuid, text, uuid, text, boolean) from public, anon;
grant execute on function fn_yalla_say(uuid, text, uuid, text, boolean) to authenticated;


-- ===== 4) القراية =====
-- ⚠ أعمدة زيادة فمحتاجة `drop` الأول — شوف الترويسة.
drop function if exists fn_yalla_comments(uuid);

create or replace function fn_yalla_comments(p_call uuid)
returns table (
  id         uuid,
  parent_id  uuid,
  first_name text,
  as_nasbot  boolean,
  body_ar    text,
  photo_path text,
  created_at timestamptz,
  mine       boolean
)
language sql
stable
security definer
set search_path = public
as $$
  -- 🔴 **للأعضاء المسجّلين بس** (قرار المالك). المجهول بياخد **ولا صف**،
  --    مش استثناء — عشان الصفحة تفضل تفتح للزائر والقسم يختفي بس.
  -- 🔴 **ومفيش `profile_id` في اللي بيرجع** — الاسم الأول وبس. من غير كده
  --    الواجهة تقدر تجمّع كلام العضو من كل النداءات وتعمل منه بروفايل.
  -- ⚠ ولو `as_nasbot` الاسم بيبقى **نسبوط** — صاحبه الحقيقي ما بيطلعش
  --    خالص، حتى لو هو اللي كاتبه.
  select c.id,
         c.parent_id,
         case when c.as_nasbot then 'نسبوط'
              else coalesce(nullif(btrim(p.first_name), ''), 'عضو') end,
         c.as_nasbot,
         c.body_ar,
         c.photo_path,
         c.created_at,
         c.profile_id = auth.uid() and not c.as_nasbot
    from yalla_comments c
    join profiles p on p.id = c.profile_id
   where c.call_id = p_call
     and auth.uid() is not null
     and p.deleted_at is null
   order by coalesce(c.parent_id, c.id), c.parent_id nulls first, c.created_at;
$$;

comment on function fn_yalla_comments(uuid) is
  '0150 — كلام نداء «يلا» بالردود: الاسم الأول والنص والصورة، وللأعضاء المسجّلين بس. مفيش profile_id.';
revoke execute on function fn_yalla_comments(uuid) from public, anon;
grant execute on function fn_yalla_comments(uuid) to authenticated;


-- ===== 5) دلو الصور =====
-- ⚠ على نمط `0113` بالحرف: بيتخطّى نفسه لو مفيش اسكيما `storage`
--   (البوستجرس المحلي)، والسياسات بـ`execute` علشان الملف يعدّي في الحالتين.
do $storage$
begin
  if not exists (select 1 from information_schema.schemata where schema_name = 'storage') then
    raise notice 'مفيش اسكيما storage — دلو الصور اتخطّى (بوستجرس محلي)';
    return;
  end if;

  -- ⚠ **صور بس — مفيش `application/*`.** ملف مفتوح في فيد اجتماعي باب
  --   لملفات تنفيذية وفيروسات، والصورة بتعمل اللي المالك عايزه. قرار
  --   اتاخد صريح ٢٠٢٦-١١-١٦ واتقال للمالك.
  insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
  values ('yalla-photos', 'yalla-photos', false, 5242880,
          array['image/jpeg','image/png','image/webp'])
  on conflict (id) do nothing;

  execute 'drop policy if exists yalla_photo_read   on storage.objects';
  execute 'drop policy if exists yalla_photo_write  on storage.objects';
  execute 'drop policy if exists yalla_photo_delete on storage.objects';

  -- 🔴 القراية **للأعضاء المسجّلين** زي الكلام بالظبط — مش للمجهول.
  execute $p$
    create policy yalla_photo_read on storage.objects
      for select using (
        bucket_id = 'yalla-photos' and auth.uid() is not null
      )
  $p$;

  -- المسار `<call_id>/<...>` — والنداء لازم يكون مفتوح.
  execute $p$
    create policy yalla_photo_write on storage.objects
      for insert with check (
        bucket_id = 'yalla-photos'
        and auth.uid() is not null
        and exists (select 1 from yalla_calls c
                     where c.id = ((storage.foldername(name))[1])::uuid
                       and c.status = 'open')
      )
  $p$;

  -- المسح: صاحبها أو اللوحة بصلاحية (مش أي حساب لوحة — غلطة `0115`).
  execute $p$
    create policy yalla_photo_delete on storage.objects
      for delete using (
        bucket_id = 'yalla-photos'
        and (owner = auth.uid() or fn_has_permission('sbotat.edit'))
      )
  $p$;
end $storage$;


-- ===== 6) الاختبار =====
create or replace function test_yalla_replies()
returns table (test text, result text)
language plpgsql
set search_path = public
as $body$
declare
  v_admin uuid;
  v_mem   uuid;
  v_call  uuid;
  v_root  uuid;
  v_reply uuid;
  n       int;
  v_name  text;
begin
  select profile_id into v_admin from admin_users where is_active limit 1;
  select id into v_mem from profiles
   where deleted_at is null
     and not exists (select 1 from admin_users a where a.profile_id = profiles.id)
   order by created_at limit 1;

  test := '0150 · الأعمدة التلاتة والرقم في مكانهم';
  select count(*) into n from information_schema.columns
   where table_schema = 'public'
     and ((table_name = 'yalla_comments'
           and column_name in ('parent_id', 'as_nasbot', 'photo_path'))
       or (table_name = 'settings' and column_name = 'yalla_max_replies'));
  result := case when n = 4 then 'نجح' else format('فشل — %s من ٤', n) end;
  return next;

  -- 🔴 نفس قاعدة §٥.٥ — الأعمدة الجديدة ما غيّرتش ده.
  test := '0150 · 🔴 لسه مفيش ولا سياسة قراية على الكومنتات';
  select count(*) into n from pg_policies
   where schemaname = 'public' and tablename = 'yalla_comments';
  result := case when n = 0 then 'نجح'
                 else format('فشل — 🔴 %s سياسة، فالواجهة تقدر تقرا profile_id', n) end;
  return next;

  test := '0150 · 🔴 fn_yalla_comments لسه مش بترجّع profile_id';
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    cross join lateral unnest(coalesce(p.proargnames, '{}')) as col
   where ns.nspname = 'public' and p.proname = 'fn_yalla_comments'
     and col in ('profile_id', 'avatar', 'phone');
  result := case when n = 0 then 'نجح'
                 else format('فشل — 🔴 %s عمود بيعرّف صاحب الكلام', n) end;
  return next;

  -- 🔴 التوقيع القديم لازم يكون اتشال، وإلا النداء ambiguous.
  test := '0150 · 🔴 التوقيع القديم لـfn_yalla_say اتشال';
  result := case when to_regprocedure('fn_yalla_say(uuid,text)') is null
                 then 'نجح'
                 else 'فشل — 🔴 النسختين موجودين، والنداء بـparameterين هيبقى ambiguous' end;
  return next;

  if v_admin is null or v_mem is null then
    test := '0150 · باقي الفحص';
    result := 'معلومة — محتاج حساب لوحة وعضو عادي';
    return next;
    return;
  end if;

  -- ⚠ كل الكتابة جوه بلوك بيرجع (الدرس الستة وعشرين).
  begin
    update feature_flags set is_on = true where key = 'yalla';

    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    v_call := fn_yalla_post('[اختبار] نقاش');
    reset role;
    perform set_config('request.jwt.claims', '', true);

    -- العضو بيكتب كلام جذر
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_mem, 'role', 'authenticated')::text, true);
    v_root := fn_yalla_say(v_call, 'أنا فاضي الجمعة');
    reset role;
    perform set_config('request.jwt.claims', '', true);

    test := '0150 · العضو كتب كلام (التوقيع الجديد بـparameterين)';
    result := case when v_root is not null then 'نجح' else 'فشل' end;
    return next;

    -- 🔴 اللوحة بترد باسم نسبوط
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    v_reply := fn_yalla_say(v_call, 'تمام، نشوف المكان', v_root, null, true);
    reset role;
    perform set_config('request.jwt.claims', '', true);

    test := '0150 · اللوحة ردّت باسم نسبوط';
    select count(*) into n from yalla_comments
     where id = v_reply and parent_id = v_root and as_nasbot;
    result := case when n = 1 then 'نجح' else 'فشل — الرد ما اتسجّلش صح' end;
    return next;

    -- 🔴 الدرس الأربعة وعشرين: صف للمسموح وصف للممنوع.
    test := '0150 · 🔴 العضو مش بيرد باسم نسبوط';
    begin
      set local role authenticated;
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_mem, 'role', 'authenticated')::text, true);
      perform fn_yalla_say(v_call, 'أنا نسبوط', v_root, null, true);
      reset role;
      result := 'فشل — 🔴 أي عضو يقدر ينتحل صفة الموقع';
    exception when others then
      reset role;
      result := 'نجح';
    end;
    perform set_config('request.jwt.claims', '', true);
    return next;

    test := '0150 · 🔴 الرد على الرد بيترفض (مستوى واحد)';
    begin
      set local role authenticated;
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_mem, 'role', 'authenticated')::text, true);
      perform fn_yalla_say(v_call, 'رد على الرد', v_reply);
      reset role;
      result := 'فشل — 🔴 الشجرة مفتوحة، الخيط هيبقى مالوش آخر';
    exception when others then
      reset role;
      result := 'نجح';
    end;
    perform set_config('request.jwt.claims', '', true);
    return next;

    test := '0150 · 🔴 الرد على كلام من نداء تاني بيترفض';
    begin
      set local role authenticated;
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_mem, 'role', 'authenticated')::text, true);
      perform fn_yalla_say(v_call, 'رد غلط', extensions.gen_random_uuid());
      reset role;
      result := 'فشل — 🔴 الرد اتقبل على كلام مش في النداء';
    exception when others then
      reset role;
      result := 'نجح';
    end;
    perform set_config('request.jwt.claims', '', true);
    return next;

    -- 🔴 اللي كتبه الموقع ما بيرجعش باسم صاحبه الحقيقي.
    test := '0150 · 🔴 اسم صاحب رد «نسبوط» مش بيتسرّب';
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_mem, 'role', 'authenticated')::text, true);
    select first_name into v_name from fn_yalla_comments(v_call) where id = v_reply;
    reset role;
    perform set_config('request.jwt.claims', '', true);
    result := case when v_name = 'نسبوط' then 'نجح'
                   else format('فشل — 🔴 الاسم طلع «%s»', coalesce(v_name, '—')) end;
    return next;

    test := '0150 · الصورة لوحدها كلام كامل';
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_mem, 'role', 'authenticated')::text, true);
    perform fn_yalla_say(v_call, '', null, v_call::text || '/x.jpg');
    reset role;
    perform set_config('request.jwt.claims', '', true);
    select count(*) into n from yalla_comments
     where call_id = v_call and photo_path is not null;
    result := case when n = 1 then 'نجح' else 'فشل — الصورة من غير نص اترفضت' end;
    return next;

    raise exception 'نضيف';
  exception when others then
    reset role;
    perform set_config('request.jwt.claims', '', true);
    if sqlerrm <> 'نضيف' then
      test := '0150 · استثناء غير متوقّع';
      result := 'فشل — ' || sqlerrm;
      return next;
    end if;
  end;

  test := '0150 · الاختبار ما سابش ولا صف';
  select count(*) into n from yalla_calls where line_ar like '[اختبار]%';
  result := case when n = 0 then 'نجح' else format('فشل — %s نداء اتحفظ', n) end;
  return next;
end $body$;

comment on function test_yalla_replies() is
  '0150 — الردود بمستوى واحد، والرد باسم نسبوط للوحة بس، والصورة، والاسم الحقيقي مش بيتسرّب.';
revoke execute on function test_yalla_replies() from public, anon, authenticated;
