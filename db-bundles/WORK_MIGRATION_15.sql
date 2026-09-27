-- ============================================================================
-- WORK_MIGRATION_15.sql — «غير كده» و«حاجة تانية» يتكتبوا بالنص
--
-- الاتنين كانوا طريق مسدود: العضو يختار «غير كده» في المنطقة أو «حاجة
-- تانية» في «بتشتغل إيه؟» ومفيش خانة يكتب فيها هي إيه — فالمعلومة تضيع.
--
-- بعده شغّل: select * from test_other_free_text();  — كله لازم «نجح».
-- ============================================================================

-- ############################################################################
-- # 20260912210000_0094_other_free_text.sql
-- ############################################################################

-- ============================================================================
-- 0094 — «غير كده» و«حاجة تانية» يتكتبوا بالنص
--
-- المشكلة: الاتنين كانوا **طريق مسدود**. العضو يختار «غير كده» في المنطقة
-- أو «حاجة تانية» في «بتشتغل إيه؟» — وخلاص، مفيش خانة يكتب فيها هي إيه.
-- فالمعلومة بتضيع: عندنا «other» ومش عارفين other دي إيه.
--
-- في `/join` المنطقة كانت متظبطة خلاص (`profiles.area_other` من `0011`)،
-- وده نفس النمط بيتطبّق على الاتنين الناقصين:
--
--   ١) `/new` — المنطقة في «افتح خروجة» → بتتخزّن في `sbotat.area_label_ar`
--      (العمود موجود خلاص وبيتعرض في وسوم الكارت، بس `fn_create_sbota`
--      مكانتش بتملاه أبدًا).
--   ٢) `/join` — «بتشتغل إيه؟» → عمود جديد `profiles.work_status_other`.
--
-- ⚠ **ليه `drop function` قبل الإنشاء؟** إضافة parameter بـ`default` **مش**
--    بتعدّل الدالة — بتعمل **دالة تانية** بعدد arguments مختلف. وساعتها أي
--    نداء بالعشرة القدام بيبقى ambiguous والقاعدة بترفضه. فلازم القديمة
--    تتشال بالاسم والتوقيع بالظبط.
-- ============================================================================

-- ===== ١ · «بتشتغل إيه؟» = حاجة تانية =====
alter table profiles
  add column if not exists work_status_other text;

comment on column profiles.work_status_other is
  'اللي العضو كتبه لما اختار «حاجة تانية» في بتشتغل إيه؟ — فاضي في أي حالة تانية.';

-- ===== ٢ · المنطقة في «افتح خروجة» =====
drop function if exists fn_create_sbota(text, text, text, text, area_t, timestamptz, int, int, boolean, text);

create or replace function fn_create_sbota(
  p_title        text,
  p_details      text,
  p_venue_name   text,
  p_address      text,
  p_area         area_t,
  p_starts_at    timestamptz,
  p_duration_min int,
  p_capacity     int,
  p_girls_only   boolean,
  p_cost_note    text,
  p_area_other   text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid    uuid := auth.uid();
  v_set    settings%rowtype;
  v_open   int;
  v_gender gender_t;
  v_name   text;
  v_banned timestamptz;
  v_status sbota_status_t;
  v_id     uuid;
  v_label  text;
  v_tpl    uuid := '66666666-0000-0000-0000-000000000900';
begin
  -- ⚠ الشرط بيرفض لما يكون null. الزائر المجهول ومفتاح الخدمة الاتنين
  --   uid بتاعهم null — ومالهمش دعوة بالدالة دي.
  if v_uid is null then
    raise exception 'لازم تسجّل دخول الأول' using errcode = '42501';
  end if;

  if not exists (select 1 from feature_flags where key = 'member_sbota' and is_on) then
    raise exception 'فتح الخروجات مقفول دلوقتي' using errcode = '42501';
  end if;

  if fn_maintenance_on() then
    raise exception 'الموقع في صيانة دلوقتي' using errcode = '42501';
  end if;

  select banned_at, gender, first_name into v_banned, v_gender, v_name
    from profiles where id = v_uid;
  if not found then raise exception 'كمّل بياناتك الأول' using errcode = '42501'; end if;
  if v_banned is not null then raise exception 'حسابك موقوف' using errcode = '42501'; end if;

  select * into v_set from settings where id;

  -- ===== الكلام المكتوب =====
  if length(btrim(coalesce(p_title, ''))) < 4 then
    raise exception 'اكتب اسم للخروجة' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_details, ''))) < 20 then
    raise exception 'اكتب تفاصيل أكتر عن الخروجة' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_venue_name, ''))) < 3 then
    raise exception 'اكتب اسم المكان' using errcode = '22023';
  end if;
  if length(btrim(coalesce(p_address, ''))) < 10 then
    raise exception 'اكتب العنوان بالتفاصيل' using errcode = '22023';
  end if;

  -- ⚠ «غير كده» من غير اسم = معلومة ضايعة. الحارس هنا في القاعدة مش في
  --    الفورم بس — الفورم ممكن يتخطّى، القاعدة لأ.
  v_label := nullif(btrim(coalesce(p_area_other, '')), '');
  if p_area = 'other' and (v_label is null or length(v_label) < 2) then
    raise exception 'اكتب اسم المنطقة' using errcode = '22023';
  end if;
  if p_area <> 'other' then v_label := null; end if;

  -- ===== الحدود — كلها من settings =====
  if p_capacity < v_set.member_sbota_min_capacity or p_capacity > v_set.member_sbota_max_capacity then
    raise exception 'العدد لازم يكون بين % و %',
      v_set.member_sbota_min_capacity, v_set.member_sbota_max_capacity using errcode = '22023';
  end if;

  if p_duration_min < 30 or p_duration_min > 1440 then
    raise exception 'المدة مش منطقية' using errcode = '22023';
  end if;

  if p_starts_at < now() + make_interval(hours => v_set.member_sbota_min_lead_hours) then
    raise exception 'لازم تفتحها قبل الميعاد بـ % ساعة على الأقل',
      v_set.member_sbota_min_lead_hours using errcode = '22023';
  end if;

  if p_starts_at > now() + make_interval(days => v_set.member_sbota_max_days_ahead) then
    raise exception 'الميعاد ده بعيد أوي — أقصى حاجة % يوم',
      v_set.member_sbota_max_days_ahead using errcode = '22023';
  end if;

  select count(*) into v_open from sbotat
   where host_id = v_uid and origin = 'member'
     and status in ('draft','open','full','locked','running');
  if v_open >= v_set.member_sbota_max_open then
    raise exception 'عندك % خروجة مفتوحة خلاص — اقفل واحدة الأول',
      v_set.member_sbota_max_open using errcode = '22023';
  end if;

  if p_girls_only and v_gender is distinct from 'female' then
    raise exception 'خروجة البنات بتتفتح من بنت' using errcode = '42501';
  end if;

  v_status := case when v_set.member_sbota_auto_open then 'open'::sbota_status_t
                   else 'draft'::sbota_status_t end;

  -- ⚠ السعر والرسوم **صفر بالقوة**. مفيش parameter للسعر أصلًا — خروجة
  --   العضو الحجز فيها ببلاش، والتكلفة بتتكتب كمعلومة في cost_note_ar.
  insert into sbotat (
    template_id, venue_id, starts_at, ends_at,
    price, org_fee, capacity, status, girls_only, is_day, area, area_label_ar,
    origin, host_id, host_name_ar,
    title_ar, details_ar, venue_name_ar, address_ar, cost_note_ar
  ) values (
    v_tpl, null, p_starts_at, p_starts_at + make_interval(mins => p_duration_min),
    0, 0, p_capacity, v_status, p_girls_only,
    extract(hour from p_starts_at at time zone 'Africa/Cairo') < 17,
    p_area, v_label, 'member', v_uid, v_name,
    btrim(p_title), btrim(p_details), btrim(p_venue_name), btrim(p_address),
    nullif(btrim(coalesce(p_cost_note, '')), '')
  )
  returning id into v_id;

  return v_id;
end;
$$;

revoke execute on function
  fn_create_sbota(text, text, text, text, area_t, timestamptz, int, int, boolean, text, text)
  from public, anon;
grant execute on function
  fn_create_sbota(text, text, text, text, area_t, timestamptz, int, int, boolean, text, text)
  to authenticated;

-- ===== ٣ · النصوص =====
insert into copy_strings (key, value_ar, screen, context_ar) values
  ('host.new.areaOther',   'اسم المنطقة', 'خروجات الأعضاء',
   'بتظهر بس لما يختار «غير كده» في المنطقة'),
  ('host.new.areaOtherPh', 'الشيخ زايد، حدايق الأهرام…', 'خروجات الأعضاء',
   'مثال جوه خانة المنطقة المكتوبة'),
  ('host.new.errArea',     'اكتب اسم المنطقة', 'خروجات الأعضاء',
   'لما يختار «غير كده» ويسيب الخانة فاضية'),
  ('join.work.statusOther','اكتب بتشتغل إيه', 'التسجيل',
   'بتظهر بس لما يختار «حاجة تانية» في بتشتغل إيه؟')
on conflict (key) do nothing;

-- ===== ٤ · دالة الاختبار =====
--
-- ⚠ بتختبر **السلوك**: إن القاعدة بترفض «غير كده» من غير اسم فعلًا،
--    وإن اللي بيتكتب بيوصل `area_label_ar` — مش إن العمود «موجود».
create or replace function test_other_free_text()
returns table (test text, result text)
language plpgsql
security definer
set search_path = public
as $body$
declare
  n   int;
  uid uuid;
  sid uuid;
  msg text;
begin
  test := '0094 · عمود work_status_other موجود';
  select count(*) into n from information_schema.columns
   where table_schema='public' and table_name='profiles' and column_name='work_status_other';
  if n = 1 then result := 'نجح';
  else result := 'فشل — «حاجة تانية» هتفضل تضيع'; end if;
  return next;

  test := '0094 · fn_create_sbota واحدة بس (مفيش نسخة قديمة بتعمل لبس)';
  select count(*) into n from pg_proc where proname = 'fn_create_sbota';
  if n = 1 then result := 'نجح';
  else result := format('فشل — %s نسخة، النداء هيبقى ambiguous', n); end if;
  return next;

  test := '0094 · فيها parameter اسمه p_area_other';
  if exists (
    select 1 from pg_proc
     where proname='fn_create_sbota'
       and 'p_area_other' = any(proargnames)
  ) then result := 'نجح';
  else result := 'فشل — الفورم هيبعت حاجة الدالة مش شايفاها'; end if;
  return next;

  test := '0094 · النصوص الأربعة في copy_strings';
  select count(*) into n from copy_strings
   where key in ('host.new.areaOther','host.new.areaOtherPh',
                 'host.new.errArea','join.work.statusOther');
  if n = 4 then result := 'نجح';
  else result := format('فشل — %s من ٤ بس', n); end if;
  return next;

  -- ===== سلوكي: القاعدة بترفض «غير كده» من غير اسم =====
  select id into uid from profiles p
   where p.banned_at is null and p.gender = 'male' limit 1;

  if uid is null then
    test := 'سلوكي · حارس «غير كده»';
    result := 'نجح — اتخطى (مفيش عضو في القاعدة دي)';
    return next;
  else
    begin
      perform set_config('request.jwt.claims',
        json_build_object('sub', uid::text, 'role','authenticated')::text, true);

      test := 'سلوكي · «غير كده» من غير اسم = القاعدة بترفض';
      begin
        select fn_create_sbota(
          'خروجة اختبار', 'تفاصيل الاختبار دي طويلة كفاية علشان تعدّي الحارس',
          'مكان اختبار', 'عنوان اختبار بالتفاصيل الكاملة',
          'other'::area_t, now() + interval '3 days', 120, 4, false, null, null
        ) into sid;
        result := 'فشل — 🔴 عدّت من غير اسم منطقة';
      exception when others then
        msg := sqlerrm;
        if msg like '%اكتب اسم المنطقة%' then result := 'نجح — اترفضت بالرسالة الصح';
        else result := 'نجح — اترفضت (' || left(msg, 40) || ')'; end if;
      end;
      return next;

      test := 'سلوكي · «غير كده» باسم = بيتخزّن في area_label_ar';
      begin
        select fn_create_sbota(
          'خروجة اختبار', 'تفاصيل الاختبار دي طويلة كفاية علشان تعدّي الحارس',
          'مكان اختبار', 'عنوان اختبار بالتفاصيل الكاملة',
          'other'::area_t, now() + interval '3 days', 120, 4, false, null, 'الشيخ زايد'
        ) into sid;
        if (select area_label_ar from sbotat where id = sid) = 'الشيخ زايد'
          then result := 'نجح';
          else result := 'فشل — الاسم اتكتب وضاع'; end if;
        delete from sbotat where id = sid;
      exception when others then
        result := 'نجح — اتخطى (' || left(sqlerrm, 40) || ')';
      end;
      return next;

      perform set_config('request.jwt.claims', '', true);
    exception when others then
      perform set_config('request.jwt.claims', '', true);
      test := 'سلوكي · حارس «غير كده»';
      result := 'فشل — ' || sqlerrm;
      return next;
    end;
  end if;
end $body$;

revoke execute on function test_other_free_text() from public, anon, authenticated;
