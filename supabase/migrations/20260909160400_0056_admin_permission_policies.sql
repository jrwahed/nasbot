-- ============================================================================
-- 0056 — سياسات الكتابة بالصلاحية الدقيقة بدل fn_is_admin() (S8 / A10 / A11)
--
-- المشكلة: كل سياسات الكتابة القديمة على الجداول دي كانت
--   for all using (fn_is_admin())
-- و fn_is_admin() بعد 0035 بقت «أي صف نشط في admin_users مهما كان دوره». يعني
-- دور support (اللي مالوش صلاحية إعدادات ولا كوبونات) كان يقدر بنداء API مباشر
-- يغيّر الأسعار، يعمل كوبونات، يعدّل سبوطة، يقفل بلاغ ... إلخ. فصل الأدوار كان
-- واجهة بس. الرسايل في اللوحة «القاعدة رفضت — محتاج صلاحية X» ما كانتش هتظهر أبدًا.
--
-- الحل: نبدّل سياسة الكتابة بـ fn_has_permission('<الصلاحية الصح>') لكل جدول،
-- ونسيب القراية زي ما هي (القراية للإدارة كلها مقبولة). الخريطة:
--   settings→settings.edit · bookings→bookings.edit · sbotat→sbotat.edit ·
--   venues→sbotat.edit · captains→captains.edit · coupons→coupons.edit ·
--   reports→reports.action · matching_runs→matching.approve ·
--   behavior_flags→people.ban · chat_members→reports.action
-- (المفاتيح متأكدين إنها متبذورة في 0035.)
--
-- الجداول اللي كانت for all هي كمان مصدر قراية الإدارة الوحيد (matching_runs،
-- behavior_flags) بنضيف لها سياسة قراية fn_is_admin() صريحة علشان القراية ما تتكسرش.
-- باقي الجداول عندها سياسة قراية أصلًا فيها fn_is_admin() (أو قراية عامة).
-- ============================================================================

-- ===== settings =====
drop policy if exists settings_admin on settings;
drop policy if exists settings_write on settings;
create policy settings_write on settings for all
  using (fn_has_permission('settings.edit')) with check (fn_has_permission('settings.edit'));

-- ===== bookings =====
drop policy if exists bookings_admin on bookings;
drop policy if exists bookings_write on bookings;
create policy bookings_write on bookings for all
  using (fn_has_permission('bookings.edit')) with check (fn_has_permission('bookings.edit'));

-- ===== sbotat =====
drop policy if exists sbotat_admin on sbotat;
drop policy if exists sbotat_write on sbotat;
create policy sbotat_write on sbotat for all
  using (fn_has_permission('sbotat.edit')) with check (fn_has_permission('sbotat.edit'));

-- ===== venues =====
drop policy if exists venues_admin on venues;
drop policy if exists venues_write on venues;
create policy venues_write on venues for all
  using (fn_has_permission('sbotat.edit')) with check (fn_has_permission('sbotat.edit'));

-- ===== captains =====
drop policy if exists captains_admin on captains;
drop policy if exists captains_write on captains;
create policy captains_write on captains for all
  using (fn_has_permission('captains.edit')) with check (fn_has_permission('captains.edit'));

-- ===== coupons =====
drop policy if exists coupons_admin on coupons;
drop policy if exists coupons_write on coupons;
create policy coupons_write on coupons for all
  using (fn_has_permission('coupons.edit')) with check (fn_has_permission('coupons.edit'));

-- ===== reports =====
drop policy if exists reports_admin on reports;
drop policy if exists reports_write on reports;
create policy reports_write on reports for all
  using (fn_has_permission('reports.action')) with check (fn_has_permission('reports.action'));

-- ===== matching_runs (كان for all هو القراية كمان) =====
drop policy if exists matching_admin on matching_runs;
drop policy if exists matching_admin_read on matching_runs;
create policy matching_admin_read on matching_runs for select using (fn_is_admin());
drop policy if exists matching_write on matching_runs;
create policy matching_write on matching_runs for all
  using (fn_has_permission('matching.approve')) with check (fn_has_permission('matching.approve'));

-- ===== behavior_flags (كان for all هو القراية كمان) =====
drop policy if exists flags_admin on behavior_flags;
drop policy if exists flags_admin_read on behavior_flags;
create policy flags_admin_read on behavior_flags for select using (fn_is_admin());
drop policy if exists flags_write on behavior_flags;
create policy flags_write on behavior_flags for all
  using (fn_has_permission('people.ban')) with check (fn_has_permission('people.ban'));

-- ===== chat_members =====
drop policy if exists members_admin on chat_members;
drop policy if exists members_write on chat_members;
create policy members_write on chat_members for all
  using (fn_has_permission('reports.action')) with check (fn_has_permission('reports.action'));
