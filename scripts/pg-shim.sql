-- شيم بوستجرس المحلي — بيحاكي بيئة سوبابيس علشان نعيد تشغيل الهجرات ونختبرها
-- محليًا قبل ما المالك يلزقها. للاختبار بس — عمره ما بيتشغّل على القاعدة الحقيقية.
-- طريقة الاستخدام في CLAUDE.md §6.

-- محاكاة بيئة سوبابيس المحلية للاختبار بس
do $$ begin
  if not exists (select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;

create schema if not exists auth;
grant usage on schema auth to anon, authenticated, service_role;
create table if not exists auth.users (
  instance_id uuid, id uuid primary key, aud text, role text, email text, phone text,
  phone_confirmed_at timestamptz, encrypted_password text, created_at timestamptz, updated_at timestamptz,
  raw_app_meta_data jsonb, raw_user_meta_data jsonb, is_sso_user boolean
);
create or replace function auth.uid() returns uuid language sql stable as $$
  select nullif(coalesce(nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub', ''), '')::uuid;
$$;
grant execute on function auth.uid() to anon, authenticated, service_role, public;

create schema if not exists cron;
create table if not exists cron.job (jobid serial primary key, jobname text unique, schedule text, command text);
create or replace function cron.schedule(p_name text, p_schedule text, p_command text) returns bigint language plpgsql as $$
begin
  insert into cron.job (jobname, schedule, command) values (p_name, p_schedule, p_command)
  on conflict (jobname) do update set schedule = excluded.schedule, command = excluded.command;
  return (select jobid from cron.job where jobname = p_name);
end $$;

create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (version text primary key, name text, statements text[]);
