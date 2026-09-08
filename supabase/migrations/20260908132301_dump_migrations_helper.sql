-- بترجّع الهجرات المطبّقة علشان scripts/dump-migrations.ts يكتبها ملفات
-- في المستودع، فالكود والقاعدة يفضلوا متطابقين.
--
-- مفتاح الخدمة بس هو اللي بيناديها — الزائر والمسجّل ممنوعين صراحة.

create or replace function public.dump_migrations()
returns table (version text, name text, sql text)
language sql
stable
security definer
set search_path to 'public'
as $$
  select m.version,
         coalesce(nullif(m.name, ''), 'migration') as name,
         array_to_string(m.statements, E';\n\n') || ';' as sql
  from supabase_migrations.schema_migrations m
  order by m.version
$$;

revoke execute on function public.dump_migrations() from public, anon, authenticated;;
