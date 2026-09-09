-- ============================================================================
-- 0052 — إصلاح «التبادل المزيّف» (S1 / S2)
--
-- المشكلة: سياسات الإدراج/التعديل القديمة على pair_affinity و work_affinity
-- كانت بتقبل أي صف طول ما جهة واحدة = أنا، من غير ما تلزم الجهة التانية تبقى
-- false. فالعضو كان يقدر يعمل في سطر واحد:
--   insert into pair_affinity (a_id,b_id,a_wants_b,b_wants_a) values (.., true, true)
-- والمحفّز fn_mutual_affinity بيشوف الجهتين true فبيحط mutual_at على طول →
-- تبادل مزيّف مع أي عضو من غير علمه (وبيفتح الشات الخاص وكشف الصورة).
--
-- الحل (الأنضف زي ما المراجعة اقترحت): نسحب سياستَي الإدراج والتعديل المباشرتين
-- خالص، ونخلّي الطريق الوحيد للكتابة هو fn_pair_want (0047) و fn_work_want (0042)
-- — الاتنين security definer وبيكتبوا جهة اللي بينادي بس، والجهة التانية بتفضل
-- زي ما هي. القراية للإدارة بس فضلت زي ما هي (pair_admin_read / work_pair_admin_read).
-- ============================================================================

-- ===== pair_affinity: اسحب الكتابة المباشرة =====
drop policy if exists pair_insert_own on pair_affinity;
drop policy if exists pair_update_own on pair_affinity;
-- دفاع في العمق: مفيش داعي لأي منحة كتابة مباشرة (الدالة definer مش محتاجاها)
revoke insert, update, delete on pair_affinity from anon, authenticated;

-- ===== work_affinity: نفس الحكاية بالحرف =====
drop policy if exists work_pair_insert_own on work_affinity;
drop policy if exists work_pair_update_own on work_affinity;
revoke insert, update, delete on work_affinity from anon, authenticated;

-- ملاحظة: fn_pair_want / fn_work_want لسه ممنوحين لـ authenticated (0047 / 0042)
-- وهما definer فبيشتغلوا من غير ما يحتاجوا منحة على الجدول.
