-- بذور حقول التسجيل — مأخوذة من نموذج /join الحالي علشان اللوحة
-- تفتح على محتوى حقيقي مش جداول فاضية.

insert into profile_fields (key, label_ar, help_ar, error_ar, is_required, step, "order", validation) values
  ('phone',       'رقم الموبايل',        'هنبعتلك رمز على واتساب', 'الرقم ده ناقص رقم',        true,  1, 1, '{"pattern":"^01[0125][0-9]{8}$"}'),
  ('first_name',  'اسمك الأول',          'اللي أصحابك بينادوك بيه', 'اكتب اسمك',                true,  2, 1, '{"min":2,"max":20}'),
  ('gender',      'إنت',                 null,                      'اختار واحد',               true,  2, 2, '{}'),
  ('birth_year',  'سنة الميلاد',         'علشان نقرّب الأعمار',     'لازم تكون 18 سنة أو أكتر', true,  2, 3, '{"min":1960,"max":2008}'),
  ('area',        'ساكن فين',            'بنحاول نقرّب المسافة',    'اختار منطقة',              true,  3, 1, '{}'),
  ('interests',   'بتحب تعمل إيه',       'اختار لحد 5',             'اختار حاجة على الأقل',     true,  3, 2, '{"max":5}'),
  ('budget',      'الميزانية المريحة',   null,                      'اختار ميزانية',            true,  3, 3, '{}'),
  ('free_slots',  'بتفضى إمتى',          'اختار كل اللي يناسبك',    'اختار وقت واحد على الأقل', true,  3, 4, '{}'),
  ('girls_only',  'سبوطات البنات بس',    'للبنات — تحبي نرشحهالك؟', null,                       false, 3, 5, '{}'),
  ('photo',       'صورتك',               'اختيارية — بتساعد المجموعة تعرفك', null,              false, 4, 1, '{}')
on conflict (key) do nothing;

insert into field_options (field_key, value, label_ar, "order")
select 'gender', v, v, o from (values ('بنت',1),('شاب',2)) as t(v,o)
on conflict (field_key, value) do nothing;

-- المناطق من السبوطات والأماكن الموجودة
insert into field_options (field_key, value, label_ar, "order")
select 'area', a.label_ar, a.label_ar, row_number() over (order by a.label_ar)
from (
  select distinct area_label_ar as label_ar from sbotat where area_label_ar is not null
  union
  select distinct area_label_ar from venues where area_label_ar is not null
) a
on conflict (field_key, value) do nothing;

insert into field_options (field_key, value, label_ar, "order")
select 'interests', i.label_ar, i.label_ar, row_number() over (order by i.sort, i.label_ar)
from interests i
on conflict (field_key, value) do nothing;

insert into field_options (field_key, value, label_ar, "order")
select 'budget', v, v, o
from (values ('لحد 250',1),('لحد 500',2),('لحد 1000',3),('مفيش مشكلة',4)) as t(v,o)
on conflict (field_key, value) do nothing;

insert into field_options (field_key, value, label_ar, "order")
select 'free_slots', v, v, o
from (values ('خميس بالليل',1),('جمعة الصبح',2),('جمعة بالليل',3),('وسط الأسبوع',4)) as t(v,o)
on conflict (field_key, value) do nothing;

insert into field_options (field_key, value, label_ar, "order")
select 'girls_only', v, v, o
from (values ('أيوه',1),('أحيانًا',2),('لأ',3)) as t(v,o)
on conflict (field_key, value) do nothing;

insert into skill_activities (key, label_ar, "order") values
  ('padel','بادل',1), ('running','جري',2), ('swimming','سباحة',3), ('cycling','عجل',4)
on conflict (key) do nothing;

insert into consents (key, text_ar, version, published_at) values
  ('rules',   'قرأت القواعد وموافق عليها.',                         1, now()),
  ('privacy', 'موافق إن نسبوط يستخدم بياناتي علشان يرشحلي مجموعات.', 1, now())
on conflict (key) do nothing;;
