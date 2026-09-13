-- ============================================================================
-- 0098 — العنوان يرجع للي المالك كتبه · ورسالة واتساب جاهزة للحاجز
--
-- ⚠ **تراجع تاني من نفس الشجرة.** `0097` صلّح تسريب اسم المكان، بس فضل نص
--    المشكلة مفتوح من الناحية التانية: لما اتشالت قايمة الأماكن من
--    `/admin/sbotat` بقى المالك بيكتب المكان والعنوان في `sbotat.venue_name_ar`
--    و`sbotat.address_ar`، و**`venue_id` بقى null** في كل سبوطات نسبوط.
--
--    و`fn_sbota_address` للسبوطة اللي مش من عضو بتقرا من `venues` بالـ
--    `venue_id` بس. يعني العضو يدفع، والدالة تلف على جدول الأماكن، ما تلاقيش
--    صف، وترجّع **ولا صف**. النتيجة: حد دافع فعلًا ومش شايف العنوان خالص.
--
--    ده مش خطأ في الفيو ولا في RLS — ده عمود اتنقل مكانه والدالة ما اتنقلتش
--    معاه. (CLAUDE.md §٩.٣: أي تغيير يتبع في **كل** الطبقات.)
--
-- التصليح: نفس الحارس بالحرف (حجز مدفوع)، بس المصدر بقى:
--    اللي المالك كتبه على السبوطة نفسها الأول، وجدول `venues` احتياطي.
--    الإحداثيات بتفضل من `venues` — العنوان المكتوب مش نقطة على خريطة.
--
-- وكمان في الملف ده:
--    · `booking_confirmed` بقى فيه **رابط الحجز** ({{4}}). كان بيوصل من غير
--      ولا رابط، وزرار الإيميل كان رايح `/sbota/<slug>` — **مسار مش موجود
--      في الموقع أصلًا** (المسارات `/s/<slug>` و`/my/<رقم الحجز>`). يعني
--      الحاجز يتأكد ويدوس الزرار ويقع على 404.
--    · قالب جديد `whatsapp_booking` — الرسالة اللي اللوحة بتفتح بيها واتساب
--      للحاجز بعد ما المالك يعتمد تحويله. بتتعدّل من `/admin/notifications`،
--      ومتغيّراتها الخمسة مربوطة بالكود في `src/lib/wa-message.ts` وفيه حارس
--      في `npm run verify` بيقارنهم (درس رابع).
-- ============================================================================

-- ===== ١ · العنوان =====

create or replace function fn_sbota_address(s_id uuid)
returns table (address text, map_lat numeric, map_lng numeric, venue_name text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_s   sbotat;
  v_v   venues;
begin
  if v_uid is null then return; end if;
  select * into v_s from sbotat where id = s_id;
  if not found then return; end if;

  if v_s.origin = 'member' then
    -- خروجة عضو: حجز نشط **و** بعد الكشف. مش أول ما يحجز — علشان حد
    -- ما يحجزش ويلغي ويفضل عارف المكان.
    if v_s.reveal_at is null or now() < v_s.reveal_at then return; end if;
    if not exists (
      select 1 from bookings b
       where b.sbota_id = s_id and b.profile_id = v_uid
         and b.status in ('paid','attended')
    ) then return; end if;

    -- مفيش إحداثيات لخروجة العضو — هو كتب عنوان مش نقطة على الخريطة
    return query select v_s.address_ar, null::numeric, null::numeric, v_s.venue_name_ar;
  else
    -- سبوطة نسبوط: صاحب حجز مدفوع — الحارس زي ما هو.
    if not exists (
      select 1 from bookings b
       where b.sbota_id = s_id and b.profile_id = v_uid
         and b.status in ('paid','attended')
    ) then return; end if;

    -- ⚠ `venue_id` ممكن يبقى null دلوقتي (المالك بيكتب المكان بإيده).
    --    فبناخد اللي مكتوب على السبوطة الأول، والصف القديم احتياطي.
    if v_s.venue_id is not null then
      select * into v_v from venues where id = v_s.venue_id;
    end if;

    return query select
      coalesce(nullif(btrim(v_s.address_ar), ''),     v_v.address),
      v_v.map_lat,
      v_v.map_lng,
      coalesce(nullif(btrim(v_s.venue_name_ar), ''),  v_v.name);
  end if;
end $$;

revoke execute on function fn_sbota_address(uuid) from public, anon;
grant  execute on function fn_sbota_address(uuid) to authenticated;

-- ===== ٢ · رابط الحجز في إيميل التأكيد =====

update notification_templates set body_ar =
'تمام يا {{1}}، مكانك محجوز.
{{2}} — {{3}}.
تفاصيل حجزك والمكان هنا: {{4}}
هتعرف مجموعتك قبلها بيوم الساعة 8 بالليل.
لو حصل أي تغيير من ناحيتنا، فلوسك بترجع كاملة.'
where key = 'booking_confirmed';

-- ===== ٣ · رسالة الواتساب =====
--
-- ⚠ مش بتتبعت من المصرف. دي بتتفتح من اللوحة في واتساب علشان المالك يبعتها
--    بإيده — الواتساب التلقائي مش متفعّل. عشان كده مفيش صف في `notifications`
--    ليها، وعشان كده كمان الكود اللي بيملاها هو `src/lib/wa-message.ts`.
insert into notification_templates (key, channel, body_ar, provider_template_id, is_active)
values ('whatsapp_booking','whatsapp',
'أهلاً يا {{1}}، معاك نسبوط.
تحويلك وصل ومكانك اتأكد في «{{2}}».
الميعاد: {{3}}
المكان: {{4}}
تفاصيل حجزك كلها هنا: {{5}}
مجموعتك هتبان لك قبل الخروجة بيوم. لو محتاج أي حاجة، رد على الرسالة دي.',
 null, true)
on conflict (key) do nothing;

-- ===== دالة الاختبار =====
--
-- ⚠ سلوكية: بتعمل سبوطة نسبوط **من غير `venue_id`** زي اللي على الإنتاج
--    بالظبط، وتلبس دور الحاجز، وتتأكد إن العنوان بيوصل — وإنه **ما بيوصلش**
--    لو الحجز لسه مستني الدفع ولا للزائر المجهول. إن الدالة «فيها
--    address_ar» ما يعنيش إنها بتشتغل.
create or replace function test_address_back()
returns table (test text, result text)
language plpgsql security definer set search_path = public, auth
as $body$
declare
  v_tpl  uuid := '66666666-0000-0000-0000-000000000098';
  v_sb   uuid := '77777777-0000-0000-0000-000000000098';
  v_who  uuid := '44444444-0000-0000-0000-000000000098';
  v_bk   uuid := 'aaaaaaaa-0000-0000-0000-000000000098';
  v_addr text;
  v_name text;
  n int;
begin
  -- بذرة مؤقتة
  -- ⚠ `profiles.id` مربوط بـ`auth.users`، فلازم المستخدم يتعمل الأول.
  --    الاتنين بيتمسحوا في الآخر وفي الـexception كمان.
  insert into auth.users (instance_id, id, aud, role, created_at, updated_at,
                          raw_app_meta_data, raw_user_meta_data, is_sso_user)
  values ('00000000-0000-0000-0000-000000000000', v_who, 'authenticated','authenticated',
          now(), now(), '{}'::jsonb, '{}'::jsonb, false)
  on conflict (id) do nothing;

  insert into profiles (id, first_name, gender, area, role)
  values (v_who,'[اختبار] حاجز','male','tagamoa','member') on conflict (id) do nothing;

  insert into sbota_templates
    (id, slug, name_ar, story_ar, kind, default_price, org_fee, duration_min, min_group, max_group)
  values (v_tpl,'test-address-0098','[اختبار] قالب العنوان','[اختبار]','food',15000,4000,120,4,6)
  on conflict (id) do nothing;

  -- ⚠ venue_id = null عن قصد — دي الحالة اللي كانت بتكسر الدالة
  insert into sbotat
    (id, template_id, venue_id, starts_at, ends_at, price, org_fee, capacity,
     status, girls_only, is_day, is_mystery, origin, venue_name_ar, address_ar)
  values (v_sb, v_tpl, null, now() + interval '6 days', now() + interval '6 days 3 hours',
          15000, 4000, 6, 'open', false, false, false, 'nasbot',
          '[اختبار] اسم المكان','[اختبار] العنوان بالتفصيل')
  on conflict (id) do nothing;

  insert into bookings (id, sbota_id, profile_id, status, price_paid)
  values (v_bk, v_sb, v_who, 'paid', 15000) on conflict (id) do nothing;

  -- (١) الحاجز الدافع بياخد العنوان اللي المالك كتبه
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', v_who), true);
  select a.address, a.venue_name into v_addr, v_name from fn_sbota_address(v_sb) a;

  test := '0098 · الدافع بياخد العنوان المكتوب (venue_id فاضي)';
  if v_addr = '[اختبار] العنوان بالتفصيل' and v_name = '[اختبار] اسم المكان'
    then result := 'نجح';
    else result := coalesce('فشل — 🔴 رجع: ' || coalesce(v_addr,'(ولا صف)'),
                            'فشل — 🔴 مرجّعش حاجة'); end if;
  return next;

  -- (٢) لسه مستني الدفع = مفيش عنوان
  -- ⚠ الحارس على `bookings` بيرفض تغيير الحالة من المتصفح، وإحنا لابسين دور
  --    العضو دلوقتي. فبنقلع الـclaims الأول (يبقى زي الكرون) ونلبسها تاني.
  perform set_config('request.jwt.claims', '', true);
  update bookings set status = 'pending_payment' where id = v_bk;
  perform set_config('request.jwt.claims',
    format('{"sub":"%s","role":"authenticated"}', v_who), true);

  select count(*) into n from fn_sbota_address(v_sb);
  test := '0098 · اللي لسه مستني الدفع ما بياخدش العنوان';
  if n = 0 then result := 'نجح';
  else result := 'فشل — 🔴 العنوان بيوصل من غير دفع'; end if;
  return next;

  perform set_config('request.jwt.claims', '', true);
  update bookings set status = 'paid' where id = v_bk;

  -- (٣) الزائر المجهول = مفيش عنوان
  perform set_config('request.jwt.claims', '{"role":"anon"}', true);
  select count(*) into n from fn_sbota_address(v_sb);
  test := '0098 · الزائر المجهول ما بياخدش العنوان';
  if n = 0 then result := 'نجح';
  else result := 'فشل — 🔴 العنوان مفتوح للنت'; end if;
  return next;

  perform set_config('request.jwt.claims', '', true);

  -- (٤) قالب التأكيد فيه الرابط
  test := '0098 · booking_confirmed فيه رابط الحجز {{4}}';
  if (select body_ar from notification_templates where key='booking_confirmed') like '%{{4}}%'
    then result := 'نجح';
    else result := 'فشل — الحاجز مش هيعرف يلاقي حجزه فين'; end if;
  return next;

  -- (٥) قالب الواتساب موجود وبمتغيّراته الخمسة
  test := '0098 · قالب whatsapp_booking فيه ٥ متغيّرات';
  select count(distinct m[1]) into n
    from notification_templates t,
         lateral regexp_matches(t.body_ar, '\{\{(\d+)\}\}', 'g') m
   where t.key = 'whatsapp_booking';
  if n = 5 then result := 'نجح';
  else result := format('فشل — لقينا %s متغيّر مش ٥ · الكود بيبعت ٥', n); end if;
  return next;

  -- تنضيف — بالأرقام بالظبط، وحارس على حسابات اللوحة (درس سابع)
  delete from bookings        where id = v_bk;
  delete from sbotat          where id = v_sb;
  delete from sbota_templates where id = v_tpl;
  delete from profiles p where p.id = v_who
    and not exists (select 1 from admin_users a where a.profile_id = p.id);
  delete from auth.users u where u.id = v_who
    and not exists (select 1 from profiles p where p.id = u.id);

exception when others then
  perform set_config('request.jwt.claims', '', true);
  delete from bookings        where id = 'aaaaaaaa-0000-0000-0000-000000000098';
  delete from sbotat          where id = '77777777-0000-0000-0000-000000000098';
  delete from sbota_templates where id = '66666666-0000-0000-0000-000000000098';
  delete from profiles p where p.id = '44444444-0000-0000-0000-000000000098'
    and not exists (select 1 from admin_users a where a.profile_id = p.id);
  delete from auth.users u where u.id = '44444444-0000-0000-0000-000000000098'
    and not exists (select 1 from profiles p where p.id = u.id);
  test := '0098 · اختبار العنوان';
  result := 'فشل — ' || sqlerrm;
  return next;
end $body$;

revoke execute on function test_address_back() from public, anon, authenticated;
