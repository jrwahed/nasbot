-- ============================================================================
-- WORK_MIGRATION_21.sql — الشات يبقى لحظي فعلًا
--
-- ⚠ الاشتراك اللحظي الحقيقي (`subscribeChat`) كان **كود ميت محدش بينادي عليه**،
--    والغرفة كانت مشتركة في محاكاة localStorage. يعني رسايل الناس التانية
--    عمرها ما كانت توصل غير بإعادة تحميل الصفحة.
--
-- الكود اتصلّح. والملف ده بيعمل الناقص في القاعدة: Realtime في Supabase
-- ما بيبعتش تغييرات جدول غير لو الجدول مضاف لنشرة `supabase_realtime`.
-- ومعاه ١٥ نص لشاشات الشات — الشاشات دي مكانتش موجودة خالص، وعشان كده
-- الصفحة كانت بتفضل بتحمّل من غير ولا كلمة.
--
-- بعده شغّل: select * from test_chat_realtime();  — الأربعة لازم «نجح».
-- ============================================================================

-- ############################################################################
-- # 20260920100000_0100_chat_realtime.sql
-- ############################################################################

-- ============================================================================
-- 0100 — الشات يبقى لحظي فعلًا
--
-- ⚠ **`subscribeChat` كانت كود ميت من يوم ما اتكتبت.** الاشتراك اللحظي
--    الحقيقي (Supabase Realtime على جدول `messages`) موجود في
--    `src/lib/api.ts` — و**محدش بينادي عليه**. غرفة الشات كانت بتستعمل
--    `subscribe` من `src/lib/chat-store.ts`، وده **محاكاة بـlocalStorage**
--    بتشتغل في نفس التبويب بس، وأصلًا الغرفة ما بتكتبش فيه.
--
--    النتيجة: رسايل الناس التانية **عمرها ما بتوصل** غير لما تقفل الصفحة
--    وتفتحها من أول. شات مش بيوصل رسايل مش شات.
--
-- الجزء بتاع الكود اتصلّح. والملف ده بيعمل الناقص في القاعدة: Realtime في
-- Supabase ما بيبعتش تغييرات جدول غير لو الجدول **مضاف للنشرة**
-- `supabase_realtime`. من غير السطر ده الاشتراك بينجح شكلًا وما بيوصلش حاجة.
--
-- ⚠ الأمان: Realtime بيحترم RLS — العضو بيستلم صفوف `messages` اللي سياسة
--    القراية بتسمحله بيها بس، يعني غرف هو عضو فيها. مش بنفتح حاجة جديدة هنا،
--    إحنا بس بنخلي التغييرات توصل.
-- ============================================================================

do $$
begin
  -- النشرة دي موجودة افتراضيًا في Supabase. لو المشروع محلي ومفيهاش، نعملها.
  if not exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    create publication supabase_realtime;
  end if;

  if not exists (
    select 1 from pg_publication_tables
     where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
end $$;

-- ⚠ Realtime محتاج يعرف الصف القديم كمان علشان الفلتر `room_id=eq.<id>`
--    يشتغل على التعديل والمسح مش الإضافة بس.
alter table public.messages replica identity full;

-- ===== نصوص شاشات الشات =====
--
-- الشاشات دي **مكانتش موجودة خالص**: لما الغرفة مش جاهزة الصفحة كانت بتفضل
-- بتحمّل من غير ولا كلمة. دلوقتي بتقول للحاجز هو مستني إيه.
insert into copy_strings (key, value_ar) values
  ('chat.wait.title','مجموعتك لسه ما بانتش'),
  ('chat.wait.body','الشات بيفتح مع الكشف — قبل الخروجة بيوم الساعة ٨ بالليل. ساعتها هتعرف مين معاك وتتكلموا.'),
  ('chat.wait.when','الكشف يوم {{when}}'),
  ('chat.unpaid.title','حجزك لسه مستني التأكيد'),
  ('chat.unpaid.body','أول ما نتأكد من تحويلك، مكانك بيتثبت والشات بيفتح مع الكشف.'),
  ('chat.missing.title','مفيش حجز هنا'),
  ('chat.missing.body','الحجز ده مش موجود أو مش بتاعك. شوف حجوزاتك من «حجوزاتي».'),
  ('chat.empty','لسه مفيش كلام. ابدأ انت — قول لهم انت جاي منين.'),
  ('chat.today','النهارده'),
  ('chat.yesterday','إمبارح'),
  ('chat.sending','بيتبعت…'),
  ('chat.failed','ما اتبعتتش — دوس تبعت تاني'),
  ('chat.retry','ابعت تاني'),
  ('chat.offline','الاتصال وقع — بنحاول نرجّع'),
  ('chat.newMessages','فيه كلام جديد تحت ↓')
on conflict (key) do update set value_ar = excluded.value_ar;

-- ===== دالة الاختبار =====
create or replace function test_chat_realtime()
returns table (test text, result text)
language plpgsql security definer set search_path = public
as $body$
declare n int;
begin
  test := '0100 · جدول الرسايل في نشرة Realtime';
  if exists (
    select 1 from pg_publication_tables
     where pubname='supabase_realtime' and schemaname='public' and tablename='messages'
  ) then result := 'نجح';
  else result := 'فشل — 🔴 الاشتراك هينجح شكلًا وما هيوصلش ولا رسالة'; end if;
  return next;

  test := '0100 · replica identity full على الرسايل';
  if (select relreplident from pg_class where oid='public.messages'::regclass) = 'f'
    then result := 'نجح';
    else result := 'فشل — الفلتر على room_id مش هيشتغل غير على الإضافة'; end if;
  return next;

  test := '0100 · سياسة قراية الرسايل لسه موجودة';
  select count(*) into n from pg_policy
   where polrelid='public.messages'::regclass and polcmd in ('r','*');
  if n > 0 then result := 'نجح';
  else result := 'فشل — 🔴 مفيش سياسة قراية، يبقى Realtime بيبعت للكل'; end if;
  return next;

  test := '0100 · نصوص شاشات الشات موجودة';
  select count(*) into n from copy_strings
   where key in ('chat.wait.title','chat.unpaid.title','chat.missing.title','chat.empty');
  if n = 4 then result := 'نجح';
  else result := format('فشل — %s نص من ٤', n); end if;
  return next;
end $body$;

revoke execute on function test_chat_realtime() from public, anon, authenticated;
