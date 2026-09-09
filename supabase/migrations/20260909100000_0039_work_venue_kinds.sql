-- طبقة «الشغل» — الخطوة 0: قيمتين جداد في venue_kind_t.
--
-- الملف ده لوحده عن قصد: ALTER TYPE ... ADD VALUE ما ينفعش القيمة الجديدة
-- تتستخدم في نفس المعاملة اللي ضافتها (نفس اللي عملناه في 0032 مع vodafone_cash).
-- لو بتلزق WORK_MIGRATION.sql كله مرة واحدة وطلع خطأ «unsafe use of new value»
-- شغّل الملف ده لوحده الأول، وبعدين الباقي.
--
-- template_kind_t فيها 'work' من الأول — مش محتاجة إضافة.
alter type venue_kind_t add value if not exists 'cafe_work';
alter type venue_kind_t add value if not exists 'coworking';
