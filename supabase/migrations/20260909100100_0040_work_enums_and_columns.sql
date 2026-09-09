-- طبقة «الشغل» — 1: الأنواع المعدودة الجديدة + أعمدة على الجداول الموجودة.
-- كل حاجة هنا null-able أو بقيمة افتراضية — ما بتكسرش أي صف قديم،
-- وكلها «if not exists» علشان الملف يتشغّل أكتر من مرة بأمان.

-- ===== الأنواع (WORK_PLAN §1.1) =====
-- create type مش بتقبل if not exists، فبنلفّها في do/exception.
do $$ begin
  create type work_status_t as enum ('freelancer', 'remote_employee', 'business_owner', 'student', 'employee', 'other');
exception when duplicate_object then null; end $$;

do $$ begin
  create type work_style_t as enum ('silent', 'chatty', 'depends');
exception when duplicate_object then null; end $$;

do $$ begin
  create type experience_t as enum ('under_1', 'one_to_three', 'three_to_five', 'five_plus');
exception when duplicate_object then null; end $$;

do $$ begin
  create type outlets_t as enum ('few', 'enough', 'plenty');
exception when duplicate_object then null; end $$;

do $$ begin
  create type noise_t as enum ('quiet', 'medium', 'lively');
exception when duplicate_object then null; end $$;

do $$ begin
  create type pass_kind_t as enum ('four', 'eight');
exception when duplicate_object then null; end $$;

-- pending بسبب الدفع اليدوي (§0 #2). cancelled زيادة عن الخطة: التحويل اترفض
-- قبل ما الكارت يتفعّل — مفيش فلوس اتدفعت فمش «refunded» ومش «expired».
do $$ begin
  create type pass_status_t as enum ('pending', 'active', 'used_up', 'expired', 'refunded', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type recurring_status_t as enum ('active', 'paused', 'cancelled');
exception when duplicate_object then null; end $$;

do $$ begin
  create type lead_status_t as enum ('new', 'contacted', 'converted', 'dropped');
exception when duplicate_object then null; end $$;

-- ===== profiles (§1.2) =====
-- المفاتيح الخارجية على professions بتتضاف في 0041 بعد ما الجدول يتعمل.
alter table profiles add column if not exists work_status             work_status_t;
alter table profiles add column if not exists profession_id           uuid;
alter table profiles add column if not exists secondary_profession_id uuid;
alter table profiles add column if not exists work_style              work_style_t;
alter table profiles add column if not exists open_to_collab          boolean not null default true;
alter table profiles add column if not exists years_experience        experience_t;
alter table profiles add column if not exists work_days_pref          text[] not null default '{}';
alter table profiles add column if not exists work_area_pref          area_t;
alter table profiles add column if not exists work_no_show_count      int not null default 0;

comment on column profiles.work_status       is 'بيشتغل إيه؟ — بيتسأل اختياريًا في الانضمام واللعبة.';
comment on column profiles.profession_id     is 'المجال الأساسي → professions. بيظهر لمجموعة سبوطة الشغل بعد الكشف بس.';
comment on column profiles.work_style        is 'أسلوب الشغل: صامت / بيتكلم / حسب — بيدخل في مطابقة work_v1.';
comment on column profiles.work_days_pref    is 'أيام الشغل المفضلة — نفس أكواد free_slots (sat…fri).';
comment on column profiles.work_no_show_count is 'غياب سبوطات الشغل بس — منفصل عن no_show_count العام (§3 قاعدة 6).';

-- ===== sbota_templates =====
alter table sbota_templates add column if not exists is_work     boolean not null default false;
alter table sbota_templates add column if not exists work_config jsonb;

comment on column sbota_templates.is_work     is 'قالب سبوطة شغل — بيتنسخ على sbotat.is_work عند الإدراج.';
comment on column sbota_templates.work_config is '{start,end,lunch_hour_at,complaint_hour_at,focus_blocks[],desk_type,profession_mix_max} — جدول اليوم في صفحة السبوطة.';

-- ===== sbotat =====
alter table sbotat add column if not exists is_work boolean not null default false;
comment on column sbotat.is_work is 'منسوخة من القالب بمحفّز t_sbotat_is_work — علشان الفلاتر والمطابقة ما تحتاجش join.';

create or replace function fn_sbota_is_work()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select coalesce(t.is_work, false) into new.is_work
  from sbota_templates t where t.id = new.template_id;
  return new;
end;
$$;
comment on function fn_sbota_is_work() is 'بينسخ is_work من القالب عند إدراج السبوطة أو تغيير قالبها.';
revoke execute on function fn_sbota_is_work() from public, anon, authenticated;

drop trigger if exists t_sbotat_is_work on sbotat;
create trigger t_sbotat_is_work before insert or update of template_id on sbotat
  for each row execute function fn_sbota_is_work();

create index if not exists sbotat_is_work_idx on sbotat (is_work) where is_work;

-- ===== payments =====
-- تحويل لكارت مش لحجز: booking_id بيبقى null و pass_id متملي.
-- المفتاح الخارجي على work_passes بيتضاف في 0041.
alter table payments add column if not exists pass_id uuid;
alter table payments alter column booking_id drop not null;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'payments_target_ck') then
    alter table payments add constraint payments_target_ck
      check (booking_id is not null or pass_id is not null);
  end if;
end $$;

comment on column payments.pass_id is 'لو التحويل لشراء كارت شغل مش لحجز. واحد من الاتنين لازم يبقى متملي.';

-- ===== bookings =====
alter table bookings add column if not exists paid_with_pass boolean not null default false;
comment on column bookings.paid_with_pass is 'اتدفع بجلسة من كارت الشغل — الإلغاء بيرجّع جلسة مش فلوس (fn_revert_pass).';

-- ===== settings (§1.2) — بالقروش زي باقي الأسعار =====
alter table settings add column if not exists work_pass4_price           int  not null default 40000;
alter table settings add column if not exists work_pass4_weeks           int  not null default 6;
alter table settings add column if not exists work_pass8_price           int  not null default 72000;
alter table settings add column if not exists work_pass8_weeks           int  not null default 10;
alter table settings add column if not exists work_single_price          int  not null default 12000;
alter table settings add column if not exists work_first_time_price      int  not null default 6000;
alter table settings add column if not exists work_profession_mix_max    int  not null default 2;
alter table settings add column if not exists work_lunch_at              time not null default '13:00';
alter table settings add column if not exists work_complaint_at          time not null default '14:30';
alter table settings add column if not exists work_recurring_lead_days   int  not null default 7;
alter table settings add column if not exists work_pass_refund_days      int  not null default 3;
alter table settings add column if not exists work_conversion_target_pct int  not null default 25;

comment on column settings.work_pass4_price        is 'كارت 4 أيام — بالقروش (40000 = 400 جنيه).';
comment on column settings.work_pass4_weeks        is 'صلاحية كارت الـ4 بالأسابيع من يوم الاعتماد.';
comment on column settings.work_pass8_price        is 'كارت 8 أيام — بالقروش.';
comment on column settings.work_pass8_weeks        is 'صلاحية كارت الـ8 بالأسابيع.';
comment on column settings.work_single_price       is 'سعر الجلسة المفردة «أنا جاي» — بالقروش.';
comment on column settings.work_first_time_price   is 'سعر أول مرة — بالقروش.';
comment on column settings.work_profession_mix_max is 'أقصى عدد من نفس المجال في المجموعة الواحدة (مطابقة work_v1).';
comment on column settings.work_recurring_lead_days is 'اليوم الثابت بيتولّد قبلها بكام يوم.';
comment on column settings.work_pass_refund_days   is 'الإلغاء قبلها بكام يوم بيرجّع الجلسة للكارت.';
comment on column settings.work_conversion_target_pct is 'المستهدف لمؤشر التحوّل شغل→ترفيه خلال 30 يوم.';

-- ===== العرض العام: نضيف is_work و work_config في الآخر =====
-- create or replace بيسمح بإضافة أعمدة في الآخر بس — نفس الترتيب القديم بالحرف.
create or replace view sbotat_public
with (security_invoker = true)
as
select
  s.id, s.template_id, s.venue_id, s.captain_id,
  s.starts_at, s.ends_at, s.price, s.org_fee, s.capacity,
  s.status, s.girls_only, s.is_day, s.is_mystery,
  s.booking_closes_at, s.reveal_at,
  s.area, s.area_label_ar,
  t.slug, t.name_ar, t.story_ar, t.kind, t.mood_ar,
  t.meta_prefix_ar, t.level_ar,
  t.includes_ar, t.excludes_ar, t.duration_min, t.hero_photos, t.overnight,
  s.is_work,
  t.work_config
from sbotat s
join sbota_templates t on t.id = s.template_id
where s.status in ('open', 'full', 'locked', 'running');

grant select on sbotat_public to anon, authenticated;
