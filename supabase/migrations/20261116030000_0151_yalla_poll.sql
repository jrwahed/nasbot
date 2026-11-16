-- ============================================================================
-- 0151 · التصويت — واللي الناس تختاره يقفل عليه
--
-- طلب المالك (٢٠٢٦-١١-١٦): «ونعمل ڤوت واللي الناس تختاره يقفل عليه».
--
-- 🔑 **الفكرة:** النقاش بيطلّع اقتراحات («الجمعة في مصر الجديدة»)، والمالك
--    بيحوّلها **اختيارات تصويت**، والناس تصوّت، واللي يكسب **بيتقفل عليه**.
--
-- ⚠ **الاختيار مُركّب (ميعاد + منطقة) مش نص حر — وده مش تفصيلة شكلية.**
--    القفل (`fn_yalla_lock_post`) محتاج `timestamptz` و`area_key` حقيقيين
--    علشان يعمل سبوطة ليها ميعاد ومكان. لو الاختيار نص حر، «اللي الناس
--    تختاره يقفل عليه» **مستحيل** — حد هيقرا النص ويترجمه بإيده، وساعتها
--    ده مش تصويت ده استطلاع. فالمالك بيقرا الكلام الحر من النقاش،
--    وبيحوّله لاختيار **قابل للقفل**.
--
-- ⚠ **مين بيضيف الاختيارات؟ اللوحة بس** (`sbotat.edit`). لو أي عضو ضاف،
--    التصويت بيتملا اختيارات متشابهة («الجمعة ٨» · «الجمعه ٨م» · «جمعة»)
--    والأصوات بتتوزّع على حاجة واحدة مكتوبة بتلات طرق — فالنتيجة بتبقى
--    بلا معنى. المالك بيلخّص النقاش في ٢-٤ اختيارات واضحة.
--
-- 🔴 **صوت واحد لكل عضو** (`unique (call_id, profile_id)`) — بيغيّره براحته
--    لحد القفل. من غير القيد دي الكسبان بيبقى اللي بيدوس أكتر.
--
-- 🔴 **والجدولين مفيهمش ولا سياسة قراية** (نفس قاعدة §٥.٥ بتاعة
--    `yalla_choices`): العدد العام من `fn_yalla_poll` (أعداد بس، مفيش
--    أسامي)، واللوحة بتشوف التفاصيل بصلاحية. **مين صوّت لإيه سر** — زي
--    «الاختيار سري» بالظبط، وإلا الناس بتصوّت على مزاج بعض.
--
-- آمنة تتكرر.
-- ============================================================================

-- ===== 1) الجدولين =====
create table if not exists yalla_poll_options (
  id         uuid primary key default extensions.gen_random_uuid(),
  call_id    uuid not null references yalla_calls (id) on delete cascade,
  starts_at  timestamptz not null,
  area_key   text not null,
  note_ar    text,
  sort       int not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists yalla_poll_options_call on yalla_poll_options (call_id, sort);

create table if not exists yalla_poll_votes (
  call_id    uuid not null references yalla_calls (id)        on delete cascade,
  profile_id uuid not null references profiles (id)           on delete cascade,
  option_id  uuid not null references yalla_poll_options (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (call_id, profile_id)
);

create index if not exists yalla_poll_votes_option on yalla_poll_votes (option_id);

alter table yalla_poll_options enable row level security;
alter table yalla_poll_votes   enable row level security;

-- 🔴 مفيش ولا سياسة — ولا لصاحب الصف. شوف الترويسة.
comment on table yalla_poll_options is
  '0151 — اختيارات التصويت (ميعاد + منطقة). بتتضاف من اللوحة بس. مفيش سياسات: القراية من fn_yalla_poll.';
comment on table yalla_poll_votes is
  '0151 — صوت واحد لكل عضو في النداء. مفيش سياسات خالص — مين صوّت لإيه سر.';


-- ===== 2) اللوحة بتضيف اختيار =====
create or replace function fn_yalla_poll_add(
  p_call uuid, p_when timestamptz, p_area text, p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $body$
declare v_id uuid;
begin
  if not fn_has_permission('sbotat.edit') then
    raise exception 'إضافة اختيارات التصويت للوحة بس' using errcode = '42501';
  end if;
  if not exists (select 1 from yalla_calls where id = p_call and status = 'open') then
    raise exception 'النداء مقفول' using errcode = '22023';
  end if;
  if p_when is null or p_when <= now() then
    raise exception 'الميعاد لازم يكون في المستقبل' using errcode = '22023';
  end if;
  if not exists (select 1 from map_areas where key = p_area and is_active) then
    raise exception 'المنطقة دي مش موجودة' using errcode = '22023';
  end if;

  insert into yalla_poll_options (call_id, starts_at, area_key, note_ar, sort)
  values (p_call, p_when, p_area, nullif(btrim(coalesce(p_note, '')), ''),
          coalesce((select max(sort) + 1 from yalla_poll_options where call_id = p_call), 0))
  returning id into v_id;
  return v_id;
end $body$;

comment on function fn_yalla_poll_add(uuid, timestamptz, text, text) is
  '0151 — اللوحة بتضيف اختيار تصويت (ميعاد + منطقة) من اللي اتقال في النقاش.';
revoke execute on function fn_yalla_poll_add(uuid, timestamptz, text, text) from public, anon;
grant execute on function fn_yalla_poll_add(uuid, timestamptz, text, text) to authenticated;


create or replace function fn_yalla_poll_remove(p_option uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $body$
declare v_n int;
begin
  if not fn_has_permission('sbotat.edit') then
    raise exception 'للوحة بس' using errcode = '42501';
  end if;
  -- ⚠ الأصوات بتروح معاه (`on delete cascade`) — ده مقصود: الاختيار اللي
  --   اتشال ما ينفعش يفضل له أصوات معلّقة.
  delete from yalla_poll_options where id = p_option;
  get diagnostics v_n = row_count;
  return v_n > 0;
end $body$;

comment on function fn_yalla_poll_remove(uuid) is
  '0151 — اللوحة بتشيل اختيار تصويت (وأصواته معاه).';
revoke execute on function fn_yalla_poll_remove(uuid) from public, anon;
grant execute on function fn_yalla_poll_remove(uuid) to authenticated;


-- ===== 3) العضو بيصوّت =====
create or replace function fn_yalla_vote(p_option uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $body$
declare
  v_uid  uuid := auth.uid();
  v_call uuid;
  v_n    int;
begin
  -- 🔴 المقارنة مش حارس — الفحص الصريح هو الحارس (الدرس الخمسة وعشرين).
  if v_uid is null then
    raise exception 'لازم تسجّل الأول' using errcode = '42501';
  end if;

  select call_id into v_call from yalla_poll_options where id = p_option;
  if v_call is null then
    raise exception 'الاختيار ده مش موجود' using errcode = '22023';
  end if;
  if not exists (select 1 from yalla_calls where id = v_call and status = 'open') then
    raise exception 'النداء مقفول' using errcode = '22023';
  end if;

  -- صوت واحد بس، وبيتغيّر براحته.
  insert into yalla_poll_votes (call_id, profile_id, option_id)
  values (v_call, v_uid, p_option)
  on conflict (call_id, profile_id)
    do update set option_id = excluded.option_id, created_at = now();

  -- 🔴 **الصوت معناه «أنا جاي»** — واللي قبل كده كان بيخلّي الميزة ميتة:
  --    الناس تصوّت، والمالك يدوس «اقفل على الكسبان»، والقفل يرجّع
  --    `{"locked": false, "reason": "few"}` لأن **مفيش ولا حد في المجموعة**.
  --    اتكشف في الاختبار أول مرة اتشغّل.
  --
  --    وهو كمان الصح منطقيًا: اللي بيختار ميعاد بيقول إنه فاضي فيه. ولو
  --    سبناهم اتنين منفصلين، كنا هنقفل على ميعاد كسب بصوت ١٠ ناس
  --    والمجموعة فيها ٢. والواجهة بتقول ده صريح تحت الزرار.
  --
  -- ⚠ ومش بننسخ `fn_yalla_choose` — بننادي `fn_yalla_im_in` اللي بتاخد
  --   الميعاد والمنطقة المخفيين لوحدها (الدرس الستاشر). ولو العضو قال
  --   «أنا جاي» قبل كده، ما بنعملش حاجة.
  if not exists (select 1 from yalla_choices
                  where call_id = v_call and profile_id = v_uid) then
    perform fn_yalla_im_in(v_call);
  end if;

  select count(*) into v_n from yalla_poll_votes where option_id = p_option;
  return jsonb_build_object('n', v_n);
end $body$;

comment on function fn_yalla_vote(uuid) is
  '0151 — العضو يصوّت لاختيار. صوت واحد في النداء، بيتغيّر لحد القفل.';
revoke execute on function fn_yalla_vote(uuid) from public, anon;
grant execute on function fn_yalla_vote(uuid) to authenticated;


-- ===== 4) القراية =====
create or replace function fn_yalla_poll(p_call uuid)
returns table (
  option_id uuid,
  starts_at timestamptz,
  area_key  text,
  area_label text,
  note_ar   text,
  votes     int,
  mine      boolean
)
language sql
stable
security definer
set search_path = public
as $$
  -- ⚠ **أعداد بس — مفيش ولا اسم.** `mine` بتقول «أنا صوّت لده؟» وبس،
  --   ومفيش أي parameter لشخص تاني. نفس قاعدة `fn_yalla_feed`.
  -- ⚠ وللأعضاء المسجّلين — الزائر بياخد ولا صف فالقسم بيختفي عنده.
  select o.id, o.starts_at, o.area_key,
         fn_yalla_area_label(o.area_key),
         o.note_ar,
         (select count(*)::int from yalla_poll_votes v where v.option_id = o.id),
         exists (select 1 from yalla_poll_votes v
                  where v.option_id = o.id and v.profile_id = auth.uid())
    from yalla_poll_options o
   where o.call_id = p_call
     and auth.uid() is not null
   order by o.sort, o.starts_at;
$$;

comment on function fn_yalla_poll(uuid) is
  '0151 — اختيارات التصويت وأعدادها. أعداد بس، مفيش أسامي. للأعضاء المسجّلين.';
revoke execute on function fn_yalla_poll(uuid) from public, anon;
grant execute on function fn_yalla_poll(uuid) to authenticated;


-- ===== 5) اقفل على اللي كسب =====
create or replace function fn_yalla_lock_winner(p_call uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $body$
declare
  o yalla_poll_options;
  v_n int;
begin
  if not fn_has_permission('sbotat.edit') then
    raise exception 'محتاج صلاحية sbotat.edit' using errcode = '42501';
  end if;

  -- اللي عليه أكتر أصوات، والأقدم بيكسب لو اتعادلوا (مش عشوائي).
  select o2.* into o
    from yalla_poll_options o2
   where o2.call_id = p_call
   order by (select count(*) from yalla_poll_votes v where v.option_id = o2.id) desc,
            o2.sort, o2.created_at
   limit 1;

  if o.id is null then
    raise exception 'مفيش اختيارات تصويت في النداء ده' using errcode = '22023';
  end if;

  select count(*) into v_n from yalla_poll_votes where option_id = o.id;
  if v_n = 0 then
    raise exception 'مفيش ولا صوت لسه — متقفلش على اختيار محدش اختاره'
      using errcode = '22023';
  end if;

  -- ⚠ القفل نفسه من `fn_yalla_lock_post` (`0147`) — **مش منسوخ**
  --   (الدرس الستاشر). هي اللي بتعدّل الميعاد والمنطقة المخفيين وبتنادي
  --   `fn_yalla_lock` الأصلية بكل القعدة والتوازن والانتظار والإشعارات.
  return fn_yalla_lock_post(p_call, o.starts_at, o.area_key)
         || jsonb_build_object('votes', v_n);
end $body$;

comment on function fn_yalla_lock_winner(uuid) is
  '0151 — اقفل النداء على اختيار التصويت الكسبان. بتنادي fn_yalla_lock_post مش بتنسخها.';
revoke execute on function fn_yalla_lock_winner(uuid) from public, anon;
grant execute on function fn_yalla_lock_winner(uuid) to authenticated;


-- ===== 6) اللوحة بتشوف مين صوّت لإيه =====
create or replace function fn_yalla_poll_admin(p_call uuid)
returns table (
  option_id  uuid,
  starts_at  timestamptz,
  area_label text,
  first_name text,
  gender     gender_t,
  voted_at   timestamptz
)
language sql
stable
security definer
set search_path = public
as $$
  select o.id, o.starts_at, fn_yalla_area_label(o.area_key),
         p.first_name, p.gender, v.created_at
    from yalla_poll_votes v
    join yalla_poll_options o on o.id = v.option_id
    join profiles p on p.id = v.profile_id
   where v.call_id = p_call
     and fn_has_permission('sbotat.view')
   order by o.sort, v.created_at;
$$;

comment on function fn_yalla_poll_admin(uuid) is
  '0151 — مين صوّت لإيه، للوحة بصلاحية sbotat.view. مش معروض لأي عضو.';
revoke execute on function fn_yalla_poll_admin(uuid) from public, anon;
grant execute on function fn_yalla_poll_admin(uuid) to authenticated;


-- ===== 7) الاختبار =====
create or replace function test_yalla_poll()
returns table (test text, result text)
language plpgsql
set search_path = public
as $body$
declare
  v_admin uuid;
  v_mem   uuid;
  v_call  uuid;
  v_o1    uuid;
  v_o2    uuid;
  v_area  text;
  n       int;
  v_res   jsonb;
begin
  select profile_id into v_admin from admin_users where is_active limit 1;
  select id into v_mem from profiles
   where deleted_at is null
     and not exists (select 1 from admin_users a where a.profile_id = profiles.id)
   order by created_at limit 1;
  select key into v_area from map_areas where is_active order by sort limit 1;

  test := '0151 · الجدولين موجودين و RLS شغّالة';
  select count(*) into n from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public'
     and c.relname in ('yalla_poll_options', 'yalla_poll_votes')
     and c.relrowsecurity;
  result := case when n = 2 then 'نجح' else format('فشل — %s من ٢', n) end;
  return next;

  -- 🔴 نفس قاعدة §٥.٥.
  test := '0151 · 🔴 مفيش ولا سياسة على جدولين التصويت';
  select count(*) into n from pg_policies
   where schemaname = 'public'
     and tablename in ('yalla_poll_options', 'yalla_poll_votes');
  result := case when n = 0 then 'نجح'
                 else format('فشل — 🔴 %s سياسة، يعني مين صوّت لإيه مكشوف', n) end;
  return next;

  test := '0151 · 🔴 fn_yalla_poll مش بترجّع أسامي';
  select count(*) into n
    from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
    cross join lateral unnest(coalesce(p.proargnames, '{}')) as col
   where ns.nspname = 'public' and p.proname = 'fn_yalla_poll'
     and col in ('first_name', 'profile_id', 'name');
  result := case when n = 0 then 'نجح'
                 else format('فشل — 🔴 %s عمود بيكشف مين صوّت', n) end;
  return next;

  if v_admin is null or v_mem is null or v_area is null then
    test := '0151 · باقي الفحص';
    result := 'معلومة — محتاج حساب لوحة وعضو ومنطقة نشطة';
    return next;
    return;
  end if;

  -- ⚠ كل الكتابة جوه بلوك بيرجع (الدرس الستة وعشرين).
  begin
    update feature_flags set is_on = true where key = 'yalla';

    -- ⚠ **الحد الأدنى بينزل ٢ جوه الاختبار بس** (والبلوك بيرجع فبيرجع
    --   لقيمته). من غير كده القفل بيرفض **بحق** — المجموعة فيها واحد
    --   والحد ٤، فالراجع `{"locked": false, "reason": "few"}`.
    --   الصف اللي تحت بيفحص **إن القفل بيقع على الاختيار الكسبان**،
    --   مش بيفحص الحد الأدنى — وده متفحوص أصلًا في `test_yalla`.
    --   ⚠ و**٢ مش ١**: على `settings` قيد بيرفض أقل من اتنين، فالاتنين
    --   اللي بيصوّتوا تحت هم العضو والأدمن.
    update settings set yalla_min_group = 2;

    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    v_call := fn_yalla_post('[اختبار] تصويت');
    v_o1 := fn_yalla_poll_add(v_call, now() + interval '3 days', v_area, 'الجمعة');
    v_o2 := fn_yalla_poll_add(v_call, now() + interval '4 days', v_area, 'السبت');
    reset role;
    perform set_config('request.jwt.claims', '', true);

    test := '0151 · اللوحة ضافت اختيارين';
    select count(*) into n from yalla_poll_options where call_id = v_call;
    result := case when n = 2 then 'نجح' else format('فشل — %s اختيار', n) end;
    return next;

    -- 🔴 الدرس الأربعة وعشرين: صف للممنوع وصف للمسموح.
    test := '0151 · 🔴 العضو مش بيضيف اختيارات';
    begin
      set local role authenticated;
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_mem, 'role', 'authenticated')::text, true);
      perform fn_yalla_poll_add(v_call, now() + interval '5 days', v_area, 'مش من حقي');
      reset role;
      result := 'فشل — 🔴 أي عضو يقدر يملا التصويت اختيارات';
    exception when others then
      reset role;
      result := 'نجح';
    end;
    perform set_config('request.jwt.claims', '', true);
    return next;

    test := '0151 · العضو صوّت';
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_mem, 'role', 'authenticated')::text, true);
    perform fn_yalla_vote(v_o1);
    reset role;
    perform set_config('request.jwt.claims', '', true);
    select count(*) into n from yalla_poll_votes where call_id = v_call;
    result := case when n = 1 then 'نجح' else format('فشل — %s صوت', n) end;
    return next;

    -- 🔴 القيد اللي بيمنع «اللي يدوس أكتر يكسب».
    -- 🔴 الصف ده اتكتب بعد ما الاختبار وقع أول مرة: القفل رجّع
    --    `{"locked": false, "reason": "few"}` لأن اللي صوّت ما كانش في
    --    المجموعة. من غير القاعدة دي التصويت بيبقى ديكور.
    test := '0151 · 🔴 الصوت معناه «أنا جاي»';
    select count(*) into n from yalla_choices
     where call_id = v_call and profile_id = v_mem;
    result := case when n = 1 then 'نجح'
                   else 'فشل — 🔴 صوّت وهو مش في المجموعة، فالقفل هيقول «قليلين»' end;
    return next;

    test := '0151 · 🔴 صوت واحد بس — التاني بيغيّر مش بيزوّد';
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_mem, 'role', 'authenticated')::text, true);
    perform fn_yalla_vote(v_o2);
    reset role;
    perform set_config('request.jwt.claims', '', true);
    select count(*) into n from yalla_poll_votes where call_id = v_call;
    if n = 1 and exists (select 1 from yalla_poll_votes
                          where call_id = v_call and option_id = v_o2) then
      result := 'نجح';
    else
      result := format('فشل — 🔴 %s صوت لنفس الشخص', n);
    end if;
    return next;

    test := '0151 · 🔴 المجهول مش بيصوّت';
    begin
      set local role anon;
      perform set_config('request.jwt.claims', '{"role":"anon"}', true);
      perform fn_yalla_vote(v_o1);
      reset role;
      result := 'فشل — 🔴 المجهول صوّت';
    exception when others then
      reset role;
      result := 'نجح';
    end;
    perform set_config('request.jwt.claims', '', true);
    return next;

    test := '0151 · 🔴 متقفلش على اختيار محدش اختاره';
    begin
      set local role authenticated;
      perform set_config('request.jwt.claims',
        json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
      -- كل الأصوات على v_o2، فـ v_o1 عليه صفر — بس الكسبان هو v_o2،
      -- فالحالة دي بنجرّبها على نداء تاني مفيهوش ولا صوت.
      perform fn_yalla_lock_winner(
        (select id from yalla_calls where id <> v_call and status = 'open' limit 1));
      reset role;
      result := 'معلومة — مفيش نداء تاني مفتوح للتجربة';
    exception when others then
      reset role;
      result := 'نجح';
    end;
    perform set_config('request.jwt.claims', '', true);
    return next;

    -- ⚠ الأدمن بيصوّت لنفس اختيار العضو علشان يكملوا الحد الأدنى (٢).
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    perform fn_yalla_vote(v_o2);
    reset role;
    perform set_config('request.jwt.claims', '', true);

    -- القفل على الكسبان
    test := '0151 · اتقفل على اللي كسب';
    set local role authenticated;
    perform set_config('request.jwt.claims',
      json_build_object('sub', v_admin, 'role', 'authenticated')::text, true);
    v_res := fn_yalla_lock_winner(v_call);
    reset role;
    perform set_config('request.jwt.claims', '', true);
    select count(*) into n from yalla_calls where id = v_call and status = 'locked';
    result := case when n = 1 then format('نجح (%s صوت)', v_res->>'votes')
                   else 'فشل — النداء ما اتقفلش' end;
    return next;

    -- 🔴 الميعاد اللي اتقفل عليه = ميعاد الاختيار الكسبان بالظبط.
    test := '0151 · 🔴 اتقفل على ميعاد الاختيار الكسبان';
    select count(*) into n
      from yalla_calls c
      join yalla_slots s on s.id = c.won_slot_id
      join yalla_poll_options o on o.id = v_o2
     where c.id = v_call and s.starts_at = o.starts_at;
    result := case when n = 1 then 'نجح'
                   else 'فشل — 🔴 اتقفل على ميعاد تاني غير اللي الناس اختارته' end;
    return next;

    raise exception 'نضيف';
  exception when others then
    reset role;
    perform set_config('request.jwt.claims', '', true);
    if sqlerrm <> 'نضيف' then
      test := '0151 · استثناء غير متوقّع';
      result := 'فشل — ' || sqlerrm;
      return next;
    end if;
  end;

  test := '0151 · الاختبار ما سابش ولا صف';
  select count(*) into n from yalla_calls where line_ar like '[اختبار]%';
  result := case when n = 0 then 'نجح' else format('فشل — %s نداء اتحفظ', n) end;
  return next;
end $body$;

comment on function test_yalla_poll() is
  '0151 — التصويت: اللوحة بتضيف، العضو بيصوّت صوت واحد، والقفل بيقع على ميعاد الكسبان بالظبط.';
revoke execute on function test_yalla_poll() from public, anon, authenticated;
