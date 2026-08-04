-- The access-request Edge Function uses a server-only service-role client.
-- RLS bypass does not replace table ACLs, so grant only the DML required by
-- public request submission and the service-only review RPCs.
begin;

grant select, insert, update
on table public.access_requests, public.profiles
to service_role;

do $migration$
begin
  if not (
    has_table_privilege('service_role', 'public.access_requests', 'select')
    and has_table_privilege('service_role', 'public.access_requests', 'insert')
    and has_table_privilege('service_role', 'public.access_requests', 'update')
    and has_table_privilege('service_role', 'public.profiles', 'select')
    and has_table_privilege('service_role', 'public.profiles', 'insert')
    and has_table_privilege('service_role', 'public.profiles', 'update')
  ) then
    raise exception 'service_role access-request DML grants are incomplete';
  end if;
end;
$migration$;

commit;
