-- قوالب الرسايل وطابور الإرسال مكانش عليهم سياسة كتابة للإدارة،
-- فتعديل نص قالب أو إعادة محاولة رسالة فاشلة كانت بتعدّي على صفر صفوف.

create policy ntemplates_admin_write on notification_templates
  for all using (fn_has_permission('notifications.edit'));

-- الأدمن يقدر يعيد محاولة رسالة فاشلة؛ العضو يفضل يشوف بتاعه بس
create policy notifications_admin_update on notifications
  for update using (fn_has_permission('notifications.edit'));;
