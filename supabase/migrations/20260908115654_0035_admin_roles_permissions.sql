-- ===== الأدوار والصلاحيات =====
create table admin_roles (
  key            text primary key,
  name_ar        text not null,
  description_ar text,
  rank           int  not null default 0
);
comment on table admin_roles is 'أدوار اللوحة. rank أعلى = صلاحية أوسع (للعرض والترتيب بس).';

insert into admin_roles (key, name_ar, description_ar, rank) values
  ('owner',   'المالك',   'كل حاجة — بما فيها الأدوار والإعدادات الخطرة وتصدير القاعدة.', 50),
  ('admin',   'مدير',     'كل حاجة ما عدا الأدوار والإعدادات الخطرة وتصدير القاعدة.',     40),
  ('ops',     'تشغيل',    'السبوطات والحجوزات والمطابقة والحضور والإشعارات.',              30),
  ('finance', 'مالية',    'المدفوعات والاسترداد والمحفظة والمستحقات والتقارير.',           30),
  ('support', 'دعم',      'البلاغات والشكاوى والإلغاء والنقل.',                            20);

create table admin_permissions (
  key      text primary key,
  name_ar  text not null,
  group_ar text not null
);
comment on table admin_permissions is 'كتالوج الصلاحيات — بتتربط بالأدوار في role_permissions.';

insert into admin_permissions (key, name_ar, group_ar) values
  ('content.view','عرض النصوص','المحتوى'),
  ('content.edit','تعديل النصوص','المحتوى'),
  ('game.view','عرض اللعبة','اللعبة'),
  ('game.edit','تعديل اللعبة والنقاط','اللعبة'),
  ('fields.edit','تعديل حقول التسجيل','المحتوى'),
  ('sbotat.view','عرض السبوطات','التشغيل'),
  ('sbotat.edit','إنشاء وتعديل السبوطات','التشغيل'),
  ('sbotat.cancel','إلغاء سبوطة','التشغيل'),
  ('bookings.view','عرض الحجوزات','التشغيل'),
  ('bookings.edit','تعديل ونقل وإلغاء الحجوزات','التشغيل'),
  ('matching.view','عرض المطابقة','التشغيل'),
  ('matching.run','تشغيل المطابقة','التشغيل'),
  ('matching.approve','اعتماد المطابقة والكشف','التشغيل'),
  ('people.view','عرض الناس','الناس'),
  ('people.edit','تعديل بيانات الناس','الناس'),
  ('people.ban','حظر وفك حظر','الناس'),
  ('captains.edit','الكباتن والمقدمين','الناس'),
  ('payments.view','عرض المدفوعات','الفلوس'),
  ('payments.review','مراجعة التحويلات','الفلوس'),
  ('payments.refund','الاسترداد','الفلوس'),
  ('wallet.credit','إضافة رصيد','الفلوس'),
  ('coupons.edit','الكوبونات','الفلوس'),
  ('reports.view','عرض البلاغات','الأمان'),
  ('reports.action','اتخاذ إجراء على بلاغ','الأمان'),
  ('notifications.view','عرض الإشعارات','الرسائل'),
  ('notifications.edit','تعديل القوالب والمواعيد','الرسائل'),
  ('notifications.broadcast','إرسال جماعي','الرسائل'),
  ('map.edit','المناطق والخريطة','المحتوى'),
  ('settings.view','عرض الإعدادات','الإعدادات'),
  ('settings.edit','تعديل الإعدادات','الإعدادات'),
  ('settings.danger','الإعدادات الخطرة ووضع الصيانة','الإعدادات'),
  ('audit.view','سجل الحركة','الإعدادات'),
  ('db.export','تصدير قاعدة البيانات','الإعدادات'),
  ('admins.manage','إدارة مستخدمي اللوحة','الإعدادات');

create table role_permissions (
  role_key       text not null references admin_roles(key) on delete cascade,
  permission_key text not null references admin_permissions(key) on delete cascade,
  primary key (role_key, permission_key)
);
comment on table role_permissions is 'صلاحيات كل دور — تتعدل من اللوحة (owner بس).';

-- owner: كل حاجة
insert into role_permissions (role_key, permission_key)
select 'owner', key from admin_permissions;

-- admin: كل حاجة ما عدا الأدوار والخطر والتصدير
insert into role_permissions (role_key, permission_key)
select 'admin', key from admin_permissions
where key not in ('admins.manage', 'settings.danger', 'db.export');

-- ops: التشغيل — من غير فلوس ولا بلاغات
insert into role_permissions (role_key, permission_key) values
  ('ops','content.view'),('ops','game.view'),
  ('ops','sbotat.view'),('ops','sbotat.edit'),('ops','sbotat.cancel'),
  ('ops','bookings.view'),('ops','bookings.edit'),
  ('ops','matching.view'),('ops','matching.run'),('ops','matching.approve'),
  ('ops','people.view'),('ops','captains.edit'),
  ('ops','notifications.view'),('ops','notifications.edit'),
  ('ops','settings.view');

-- finance: الفلوس بس
insert into role_permissions (role_key, permission_key) values
  ('finance','payments.view'),('finance','payments.review'),('finance','payments.refund'),
  ('finance','wallet.credit'),('finance','coupons.edit'),
  ('finance','bookings.view'),('finance','people.view'),
  ('finance','settings.view'),('finance','audit.view');

-- support: البلاغات والإلغاء
insert into role_permissions (role_key, permission_key) values
  ('support','reports.view'),('support','reports.action'),
  ('support','bookings.view'),('support','bookings.edit'),
  ('support','people.view'),('support','people.ban'),
  ('support','notifications.view'),
  ('support','sbotat.view');

-- ===== مستخدمو اللوحة =====
create table admin_users (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null unique references profiles(id) on delete cascade,
  role_key        text not null references admin_roles(key),
  totp_secret     text,
  totp_enabled_at timestamptz,
  is_active       boolean not null default true,
  last_login_at   timestamptz,
  last_ip         inet,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
comment on table admin_users is 'مين له وصول للوحة وبأي دور. totp_secret إجباري لكل الأدوار.';
create trigger t_admin_users_updated before update on admin_users
  for each row execute function set_updated_at();

create table admin_sessions (
  id            uuid primary key default gen_random_uuid(),
  admin_user_id uuid not null references admin_users(id) on delete cascade,
  token_hash    text not null unique,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  expires_at    timestamptz not null,
  ip            inet,
  ua            text,
  revoked_at    timestamptz
);
comment on table admin_sessions is 'جلسات اللوحة — 4 ساعات وبتتقفل عند خمول 30 دقيقة.';
create index on admin_sessions (admin_user_id);
create index on admin_sessions (expires_at);

-- ===== دوال الصلاحية =====
create or replace function fn_admin_role()
returns text language sql stable security definer set search_path = public as $$
  select au.role_key from admin_users au
  where au.profile_id = auth.uid() and au.is_active;
$$;
comment on function fn_admin_role() is 'دور اللوحة للمستخدم الحالي، أو null.';

create or replace function fn_has_permission(p_key text)
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from admin_users au
    join role_permissions rp on rp.role_key = au.role_key
    where au.profile_id = auth.uid() and au.is_active and rp.permission_key = p_key
  );
$$;
comment on function fn_has_permission(text) is 'هل المستخدم الحالي عنده الصلاحية دي؟ بتتنادى من السياسات ومن الخادم.';

grant execute on function fn_admin_role()          to authenticated;
grant execute on function fn_has_permission(text)  to authenticated;

-- fn_is_admin القديمة تفضل شغالة بس تعتمد على الجدول الجديد كمان
create or replace function fn_is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and role = 'admin')
      or exists (select 1 from admin_users where profile_id = auth.uid() and is_active);
$$;

alter table admin_roles       enable row level security;
alter table admin_permissions enable row level security;
alter table role_permissions  enable row level security;
alter table admin_users       enable row level security;
alter table admin_sessions    enable row level security;

create policy roles_read on admin_roles for select using (fn_admin_role() is not null);
create policy perms_read on admin_permissions for select using (fn_admin_role() is not null);
create policy rp_read on role_permissions for select using (fn_admin_role() is not null);
create policy rp_manage on role_permissions for all
  using (fn_has_permission('admins.manage')) with check (fn_has_permission('admins.manage'));
create policy au_read on admin_users for select
  using (profile_id = auth.uid() or fn_has_permission('admins.manage'));
create policy au_manage on admin_users for all
  using (fn_has_permission('admins.manage')) with check (fn_has_permission('admins.manage'));
-- الجلسات: الخادم بس
;
