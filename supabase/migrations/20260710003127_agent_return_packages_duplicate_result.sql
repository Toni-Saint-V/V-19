-- Keep the idempotent publish response shape identical to the first publish.
create or replace function public.publish_agent_return_package(payload jsonb)
returns jsonb
language plpgsql
security invoker
set search_path = pg_catalog, public, app_private
as $$
declare
  actor_role public.profile_role := app_private.current_profile_role();
  target_package_id uuid;
  package_record public.agent_return_packages%rowtype;
  expected_count integer := 0;
begin
  if auth.uid() is null then
    raise exception 'Authenticated user required to publish a return package'
      using errcode = '28000';
  end if;

  if actor_role <> 'admin' then
    raise exception 'Only admins can publish return packages'
      using errcode = '42501';
  end if;

  begin
    target_package_id := (payload ->> 'returnPackageId')::uuid;
  exception when invalid_text_representation then
    raise exception 'Return package id is invalid';
  end;

  select *
  into package_record
  from public.agent_return_packages
  where id = target_package_id
  for update;

  if package_record.id is null then
    raise exception 'Return package was not found';
  end if;

  select count(*)
  into expected_count
  from public.export_batch_members
  where export_batch_id = package_record.export_batch_id
    and source_agent_id = package_record.agent_id;

  if package_record.status = 'published' then
    return jsonb_build_object(
      'id', package_record.id,
      'status', package_record.status,
      'artifactCount', expected_count + 1,
      'duplicate', true
    );
  end if;

  update public.agent_return_packages
  set
    status = 'published',
    published_by = auth.uid(),
    published_at = now()
  where id = package_record.id
  returning * into package_record;

  return jsonb_build_object(
    'id', package_record.id,
    'status', package_record.status,
    'artifactCount', expected_count + 1,
    'duplicate', false
  );
end;
$$;

revoke all on function public.publish_agent_return_package(jsonb) from public, anon;
grant execute on function public.publish_agent_return_package(jsonb) to authenticated;
