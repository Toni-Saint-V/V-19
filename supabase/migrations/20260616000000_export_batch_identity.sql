alter table public.export_batches
  add column if not exists idempotency_key text,
  add column if not exists file_name text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'export_batches_idempotency_key_not_blank'
  ) then
    alter table public.export_batches
      add constraint export_batches_idempotency_key_not_blank
      check (idempotency_key is null or btrim(idempotency_key) <> '');
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'export_batches_file_name_safe'
  ) then
    alter table public.export_batches
      add constraint export_batches_file_name_safe
      check (
        file_name is null
        or (
          btrim(file_name) <> ''
          and file_name = replace(replace(file_name, '/', ''), chr(92), '')
        )
      );
  end if;
end
$$;

create unique index if not exists export_batches_idempotency_key_uidx
on public.export_batches (idempotency_key)
where idempotency_key is not null;

create or replace function app_private.enforce_export_batch_actor()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  if auth.uid() is null then
    raise exception 'Authenticated user required to write export batches'
      using errcode = '28000';
  end if;

  if tg_op = 'INSERT' then
    new.created_by := auth.uid();
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;

  return new;
end;
$$;

drop trigger if exists export_batches_actor_guard on public.export_batches;

create trigger export_batches_actor_guard
before insert or update on public.export_batches
for each row
execute function app_private.enforce_export_batch_actor();
