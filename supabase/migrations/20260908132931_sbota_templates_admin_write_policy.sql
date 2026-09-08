-- sbota_templates كان عليه سياسة قراءة بس — من غير سياسة كتابة،
-- إضافة قالب بتترفض وتعديله بيعدّي على صفر صفوف من غير أي رسالة خطأ.
-- باقي جداول التشغيل (sbotat · venues · captains) عندها السياسة دي أصلًا.

create policy templates_admin on sbota_templates
  for all using (fn_has_permission('sbotat.edit'));;
