-- بترجّع الهجرات المطبّقة علشان سكريبت التصدير يكتبها ملفات في المستودع
create or replace function dump_migrations()
returns table (version text, name text, sql text)
language sql
stable
security definer
set search_path = public, supabase_migrations
as $$
  select m.version, m.name, array_to_string(m.statements, E';\n\n') || ';'
  from supabase_migrations.schema_migrations m
  order by m.version;
$$;
comment on function dump_migrations() is 'أداة تطوير — بتصدّر الهجرات لملفات المستودع. مفيش وصول للعميل.';

revoke execute on function dump_migrations() from public, anon, authenticated;
grant execute on function dump_migrations() to service_role;;
