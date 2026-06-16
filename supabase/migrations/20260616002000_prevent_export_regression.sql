create or replace function app_private.prevent_submission_export_regression()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  if old.status = 'exported' and new.status <> 'exported' then
    raise exception 'Exported submissions cannot be downgraded'
      using errcode = '23514';
  end if;

  if old.exported_at is not null
    and (new.exported_at is null or new.exported_at < old.exported_at)
  then
    raise exception 'Exported timestamp cannot move backwards'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists submissions_export_regression_guard on public.submissions;

create trigger submissions_export_regression_guard
before update of status, exported_at on public.submissions
for each row execute function app_private.prevent_submission_export_regression();
