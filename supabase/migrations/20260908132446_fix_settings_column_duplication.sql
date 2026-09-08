-- تنضيف أعمدة الإعدادات:
--
-- 1) reveal_hour كان تكرار — العمود الأصلي اسمه reveal_hour_cairo وموجود من الأول.
--    زوّدته بالغلط في هجرة admin_remaining_tables. بنشيله وبنسيب الأصلي.
-- 2) first_time_work_discount كان اسمه ملخبط: كل نِسَب الخصم في الجدول
--    بتنتهي بـ _pct، فسبناه من غيرها بيخلي حد يفهمه فلوس. بنوضّحه.
-- 3) maintenance.allow_roles ناقص — ADMIN_PLAN §2.5 بيطلبه علشان
--    الصيانة تفضل مفتوحة لأدوار معيّنة.

alter table settings drop column if exists reveal_hour;

alter table settings rename column first_time_work_discount to first_time_work_discount_pct;

alter table maintenance
  add column if not exists allow_roles text[] not null default array['owner']::text[];;
