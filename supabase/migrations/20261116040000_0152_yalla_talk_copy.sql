-- ============================================================================
-- 0152 · نصوص النقاش والتصويت
--
-- §٣.١ — مفيش نص عربي في أي مكوّن. النصوص دي للواجهة بتاعة `0150` و`0151`.
-- والاحتياطي في `src/data/copy-fallback.ts` (الدرس الخامس).
--
-- آمنة تتكرر.
-- ============================================================================

insert into copy_strings (key, value_ar, screen, context_ar) values
  -- ===== الردود =====
  ('yalla.talk.reply',     'رد',                                        'yalla', 'زرار الرد على كلام'),
  ('yalla.talk.replyTo',   'بترد على {{name}}',                         'yalla', 'سطر فوق خانة الرد'),
  ('yalla.talk.cancel',    'بطّل',                                      'yalla', 'إلغاء الرد'),
  ('yalla.talk.replyPh',   'اكتب ردك…',                                 'yalla', 'نص خانة الرد الفاضية'),
  ('yalla.talk.replies',   '{{n}} رد',                                  'yalla', 'عدد الردود تحت الكلام'),
  ('yalla.talk.brand',     'نسبوط',                                     'yalla', 'الاسم اللي بيظهر على رد الموقع'),
  -- ===== الصورة =====
  ('yalla.talk.photo',     'صورة',                                      'yalla', 'زرار رفع صورة مع الكلام'),
  ('yalla.talk.photoAdd',  'ضيف صورة',                                  'yalla', 'نص زرار الرفع'),
  ('yalla.talk.photoDrop', 'شيل الصورة',                                'yalla', 'إلغاء الصورة قبل الإرسال'),
  ('yalla.talk.photoBig',  'الصورة كبيرة أوي — ٥ ميجا كحد أقصى.',       'yalla', 'الصورة أكبر من الحد'),
  ('yalla.talk.photoBad',  'الصور بس — مش أي ملف.',                     'yalla', 'الملف مش صورة'),
  ('yalla.talk.photoErr',  'الصورة مرفعتش. جرب تاني.',                  'yalla', 'فشل رفع الصورة'),
  -- ===== التصويت =====
  ('yalla.poll.title',     'نصوّت؟',                                    'yalla', 'عنوان قسم التصويت'),
  ('yalla.poll.hint',      'اختار اللي يناسبك. صوتك معناه إنك جاي.',    'yalla', 'سطر تحت عنوان التصويت'),
  ('yalla.poll.votes',     '{{n}}',                                     'yalla', 'عدد الأصوات على الاختيار'),
  ('yalla.poll.mine',      'صوتك ✓',                                    'yalla', 'وسم على الاختيار اللي صوّتله'),
  ('yalla.poll.err',       'مقدرناش نسجّل صوتك. جرب تاني.',             'yalla', 'فشل التصويت'),
  ('yalla.poll.change',    'تقدر تغيّر صوتك لحد ما النداء يقفل.',       'yalla', 'سطر تحت الاختيارات'),
  ('yalla.poll.none',      'لسه مفيش اختيارات. اكتب في الكلام إمتى فاضي وإحنا نحطها.', 'yalla', 'الحالة الفاضية للتصويت')
on conflict (key) do nothing;


-- ===== الاختبار =====
create or replace function test_yalla_talk_copy()
returns table (test text, result text)
language plpgsql
set search_path = public
as $body$
declare n int;
begin
  test := '0152 · نصوص النقاش والتصويت موجودة';
  select count(*) into n from copy_strings
   where key like 'yalla.talk.%' or key like 'yalla.poll.%';
  result := case when n >= 32 then format('نجح (%s نص)', n)
                 else format('فشل — %s نص بس', n) end;
  return next;

  -- ⚠ الدرس التلاتين: القيمة اللي شكلها مفتاح معناها السكريبت بوّظ البيانات.
  test := '0152 · 🔴 مفيش قيمة شكلها مفتاح';
  select count(*) into n from copy_strings
   where (key like 'yalla.%')
     and value_ar ~ '^yalla\.[a-z0-9._]+$';
  result := case when n = 0 then 'نجح'
                 else format('فشل — 🔴 %s نص قيمته اسم مفتاح، والزائر هيشوفه', n) end;
  return next;
end $body$;

comment on function test_yalla_talk_copy() is
  '0152 — نصوص النقاش والتصويت موجودة، ومفيش قيمة شكلها اسم مفتاح.';
revoke execute on function test_yalla_talk_copy() from public, anon, authenticated;
