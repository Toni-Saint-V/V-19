create or replace function public.v19_clean_cutover_schema_inventory()
returns jsonb
language sql
security definer
set search_path = ''
stable
as $$
  select jsonb_build_object(
    'publicTables', coalesce((
      select jsonb_agg(c.relname order by c.relname)
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      where n.nspname = 'public'
        and c.relkind in ('r', 'p')
    ), '[]'::jsonb),
    'storageBuckets', coalesce((
      select jsonb_agg(b.id order by b.id)
      from storage.buckets b
    ), '[]'::jsonb)
  );
$$;

revoke all on function public.v19_clean_cutover_schema_inventory() from public;
revoke all on function public.v19_clean_cutover_schema_inventory() from anon;
revoke all on function public.v19_clean_cutover_schema_inventory() from authenticated;
grant execute on function public.v19_clean_cutover_schema_inventory() to service_role;
