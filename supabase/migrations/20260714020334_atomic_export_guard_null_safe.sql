-- `current_setting(..., true)` returns NULL when the transaction-local marker
-- was never set. Coalesce it so direct browser mutations are rejected rather
-- than escaping the boundary through SQL three-valued logic.

create or replace function app_private.enforce_submission_export_completion_boundary()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if (
    (new.status = 'exported' and old.status <> 'exported')
    or new.exported_at is distinct from old.exported_at
  )
    and coalesce(current_setting('app.visaflow_complete_export_package', true), '') <> 'on'
  then
    raise exception 'Exported status can only be set by complete_export_package'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

create or replace function app_private.enforce_export_status_history_boundary()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
begin
  if new.entity_type = 'submission'
    and new.to_status = 'exported'
    and coalesce(current_setting('app.visaflow_complete_export_package', true), '') <> 'on'
  then
    raise exception 'Export status history can only be written by complete_export_package'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_submission_export_completion_boundary() from public;
revoke all on function app_private.enforce_export_status_history_boundary() from public;
