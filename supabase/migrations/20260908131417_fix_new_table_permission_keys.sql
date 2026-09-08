-- كنت كتبت مفاتيح صلاحيات مش موجودة في admin_permissions:
--   notifications.send  →  الصح notifications.broadcast
--   content.edit        →  لحقول التسجيل الصح fields.edit
-- fn_has_permission بترجّع false لأي مفتاح مش موجود، يعني الجداول دي
-- كانت مقفولة على الكل. ده بيظبطها.

drop policy if exists pf_read  on profile_fields;
drop policy if exists pf_write on profile_fields;
drop policy if exists fo_read  on field_options;
drop policy if exists fo_write on field_options;
drop policy if exists sa_read  on skill_activities;
drop policy if exists sa_write on skill_activities;
drop policy if exists co_read  on consents;
drop policy if exists co_write on consents;
drop policy if exists br_all   on broadcasts;

create policy pf_read  on profile_fields   for select using (is_active or fn_has_permission('fields.edit'));
create policy pf_write on profile_fields   for all    using (fn_has_permission('fields.edit'));
create policy fo_read  on field_options    for select using (is_active or fn_has_permission('fields.edit'));
create policy fo_write on field_options    for all    using (fn_has_permission('fields.edit'));
create policy sa_read  on skill_activities for select using (is_active or fn_has_permission('fields.edit'));
create policy sa_write on skill_activities for all    using (fn_has_permission('fields.edit'));
create policy co_read  on consents         for select using (published_at is not null or fn_has_permission('fields.edit'));
create policy co_write on consents         for all    using (fn_has_permission('fields.edit'));
create policy br_all   on broadcasts       for all    using (fn_has_permission('notifications.broadcast'));;
