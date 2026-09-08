-- دالة مساعدة للبذور: بتعمل مستخدم في auth.users وملف في profiles
create or replace function seed_person(
  p_uuid uuid, p_phone text, p_name text, p_year int,
  p_gender gender_t, p_area area_t, p_role role_t, p_code text,
  p_type persona_t default null, p_energy social_energy_t default 'responder'
) returns uuid
language plpgsql
security definer
set search_path = public, auth
as $$
begin
  insert into auth.users (
    instance_id, id, aud, role, phone, phone_confirmed_at,
    encrypted_password, created_at, updated_at,
    raw_app_meta_data, raw_user_meta_data, is_sso_user
  ) values (
    '00000000-0000-0000-0000-000000000000', p_uuid, 'authenticated', 'authenticated',
    p_phone, now(), '', now(), now(),
    '{"provider":"phone","providers":["phone"]}'::jsonb, '{}'::jsonb, false
  ) on conflict (id) do nothing;

  insert into profiles (
    id, phone, first_name, birth_year, gender, area, role, referral_code,
    type, social_energy, group_pref, budget_max, free_slots,
    phone_verified_at, rules_accepted_at, data_consent_at, avatar_path
  ) values (
    p_uuid, p_phone, p_name, p_year, p_gender, p_area, p_role, p_code,
    p_type, p_energy, 'calm', 500, array['thu_night','fri_morning'],
    now(), now(), now(), '[صورة]'
  ) on conflict (id) do nothing;

  return p_uuid;
end;
$$;
comment on function seed_person is 'مساعد بذور بس — بيتشال في الإنتاج.';

-- ===== الكباتن الأربعة =====
select seed_person('11111111-1111-1111-1111-111111111101','+201000000101','سارة',1994,'female','maadi','captain','SARA01','explorer','starter');
select seed_person('11111111-1111-1111-1111-111111111102','+201000000102','يوسف',1993,'male','tagamoa','captain','YOUS02','social_captain','starter');
select seed_person('11111111-1111-1111-1111-111111111103','+201000000103','دينا',1992,'female','tagamoa','captain','DINA03','quiet_observer','listener');
select seed_person('11111111-1111-1111-1111-111111111104','+201000000104','عمر',1991,'male','maadi','captain','OMAR04','energy','starter');

insert into captains (id, profile_id, bio_line, activities) values
  ('22222222-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111101','بتصحى قبل الشمس وبتخليك تصحى معاها.', array['kayak']),
  ('22222222-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111102','بيلعب من سنتين وبيعرّف الناس على بعض من أول كورة.', array['padel']),
  ('22222222-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111103','مصممة فريلانس، بتقفل اللابتوبات الساعة 1.', array['work']),
  ('22222222-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111104','عارف كل صخرة في وادي دجلة بالاسم.', array['hike'])
on conflict (profile_id) do nothing;

-- ===== السبعة اللي في كشف المجموعة + العضو التجريبي والإدارة =====
select seed_person('33333333-0000-0000-0000-000000000001','+201000000201','مريم',1997,'female','tagamoa','member','MRYM01','explorer','responder');
select seed_person('33333333-0000-0000-0000-000000000002','+201000000202','يوسف',1998,'male','tagamoa','member','YSF002','social_captain','starter');
select seed_person('33333333-0000-0000-0000-000000000003','+201000000203','نور',1996,'female','maadi','member','NOUR03','quiet_observer','listener');
select seed_person('33333333-0000-0000-0000-000000000004','+201000000204','عمر',1995,'male','tagamoa','member','OMR004','energy','starter');
select seed_person('33333333-0000-0000-0000-000000000005','+201000000205','سلمى',1999,'female','downtown_zamalek','member','SLMA05','storyteller','responder');
select seed_person('33333333-0000-0000-0000-000000000006','+201000000206','كريم',1994,'male','tagamoa','member','KRIM06','first_timer','listener');
select seed_person('33333333-0000-0000-0000-000000000007','+201000000207','هنا',1997,'female','maadi','member','HANA07','explorer','responder');
select seed_person('33333333-0000-0000-0000-000000000099','+201000000299','أحمد',1996,'male','tagamoa','member','NSBT3M','explorer','responder');
select seed_person('44444444-0000-0000-0000-000000000001','+201000000999','الإدارة',1990,'male','tagamoa','admin','ADMIN1');

-- رصيد العضو التجريبي: 150 جنيه
insert into wallet_ledger (profile_id, delta, reason, note)
values ('33333333-0000-0000-0000-000000000099', 15000, 'coupon', 'رصيد ترحيبي للتجربة');

-- ===== الأماكن =====
insert into venues (id, name, kind, area, address, map_lat, map_lng, wholesale_price, verified_at, is_active) values
  ('55555555-0000-0000-0000-000000000001','ملاعب النادي — التجمع الخامس','padel_club','tagamoa','شارع التسعين الشمالي، جنب البنزينة، البوابة 3',30.0131,31.4270,20000,now(),true),
  ('55555555-0000-0000-0000-000000000002','نادي المعادي البحري','kayak','maadi','نادي المعادي البحري، البوابة الرئيسية',29.9602,31.2570,18000,now(),true),
  ('55555555-0000-0000-0000-000000000003','محمية وادي دجلة','wadi','maadi','مدخل محمية وادي دجلة، الموقف الأول',29.9500,31.3300,25000,now(),true),
  ('55555555-0000-0000-0000-000000000004','مطعم الحي الأول','restaurant','tagamoa','الحي الأول، شارع 90 الجنوبي، فوق الكافيه',30.0180,31.4310,9000,now(),true),
  ('55555555-0000-0000-0000-000000000005','كافيه التجمع','cafe','tagamoa','الحي الأول، شارع 90 الشمالي، الدور الأول',30.0190,31.4290,6000,now(),true)
on conflict (id) do nothing;

-- ===== القوالب — الأسعار بالقروش =====
insert into sbota_templates (id, slug, name_ar, story_ar, kind, default_price, org_fee, duration_min, min_group, max_group, mood_ar, includes_ar, excludes_ar, is_day, girls_only, hero_photos) values
  ('66666666-0000-0000-0000-000000000001','ehna-el-rabe3','إحنا الرابع','كل لاعب بادل في القاهرة قال مرة "محتاج رابع". إحنا الرابع.','sport',30000,4000,120,4,8,'نشيط ومزحم',
    array['ملعبين ساعتين','كرات','مياه وعصير','الكابتن'], array['المضرب (في إيجار بـ 50)'], false,false,
    array['[صورة المجموعة الحقيقية — بادل التجمع، الخميس اللي فات]','[صورة — الملعب بالليل بالفلاش]','[صورة — الكابتن يوسف مع المجموعة]']),
  ('66666666-0000-0000-0000-000000000002','fetar-3al-nil','فطار على النيل','تطلع الشمس وأنت في النص. وبعدها فطار على المية.','nile',30000,4000,180,4,8,'هادي وصباحي',
    array['كاياك ساعتين','سترة نجاة','فطار كامل','الكابتن'], array['المواصلات'], true,false,
    array['[صورة المجموعة الحقيقية — كاياك المعادي 7 الصبح]','[صورة — النيل والشمس طالعة]','[صورة — فطار على المركب]']),
  ('66666666-0000-0000-0000-000000000003','ba3d-ma-el-shams-teghib','بعد ما الشمس تغيب','تمشي ساعة في الضلمة، وتقعد على نار جنب الوادي.','nature',50000,6000,240,6,8,'هادي وطالع نَفَس',
    array['دخول المحمية','كشافات','شوي وعشا','الكابتن'], array['المواصلات','الجاكيت'], false,false,
    array['[صورة المجموعة الحقيقية — شوي في وادي دجلة]','[صورة — الوادي والقمر]','[صورة — النار والمجموعة قاعدة]']),
  ('66666666-0000-0000-0000-000000000004','tarabeza-setta','ترابيزة ستة','ستة على ترابيزة واحدة، ومحدش فيهم يعرف التاني. لحد ما الأكل ييجي.','food',15000,4000,150,4,6,'كلام كتير وضحك',
    array['الترابيزة','الكابتن','رسوم التنظيم'], array['الأكل (بتحسبوه بينكم في الآخر)'], false,false,
    array['[صورة المجموعة الحقيقية — ترابيزة عشا]','[صورة — المطعم من جوه]','[صورة — الأكل على الترابيزة]']),
  ('66666666-0000-0000-0000-000000000005','el-mal3ab-lina','الملعب لينا','ملعب كامل، بنات بس، ومحدش هيقولك «شديها أكتر».','sport',30000,4000,120,4,8,'نشيط وودود',
    array['ملعبين ساعتين','كرات','مياه وعصير','الكابتن'], array['المضرب (في إيجار بـ 50)'], false,true,
    array['[صورة المجموعة الحقيقية — ملعب بادل بالليل]','[صورة — الملعب فاضي قبل ما يبدأ]','[صورة — المجموعة بعد الماتش]']),
  ('66666666-0000-0000-0000-000000000006','work-cafe-tagamo3','سبوطة شغل — كافيه في التجمع','ستة بيشتغلوا جنب بعض من غير ما يتكلموا. لحد الساعة 1.','work',12000,2000,300,3,6,'هادي وشغال',
    array['ترابيزة وكرسي','قهوة ومية','واي فاي','الكابتن'], array['الأكل'], true,false,
    array['[صورة المجموعة الحقيقية — شغل في كافيه التجمع]','[صورة — الترابيزة الكبيرة واللابتوبات]','[صورة — الكابتن دينا بتقفل اللابتوبات]']),
  ('66666666-0000-0000-0000-000000000007','shoro2-men-el-gabal','شروق من الجبل','تطلع في الضلمة وتوصل فوق قبل الشمس بربع ساعة بالظبط.','nature',40000,4000,180,6,10,'هادي وصباحي',
    array['دخول المحمية','كشافات','فطار خفيف','الكابتن'], array['المواصلات'], true,false,
    array['[صورة المجموعة الحقيقية — شروق من فوق الجبل]','[صورة — الطلوع في الضلمة]','[صورة — الفطار فوق]']),
  ('66666666-0000-0000-0000-000000000008','mystery','مش هنقولك.','هتعرف المكان قبلها بساعتين. الشرط الوحيد: تكون جيت معانا قبل كده.','mystery',50000,6000,240,6,8,'مش هنقولك',
    array['كل حاجة','الكابتن'], array['المواصلات'], false,false, array['[؟]'])
on conflict (slug) do nothing;;
