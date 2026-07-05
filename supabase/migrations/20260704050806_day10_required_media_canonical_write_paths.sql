create or replace function app_private.enforce_required_media_canonical_storage_path()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  if new.type in ('passport_scan', 'selfie', 'selfie_2') then
    if new.storage_bucket <> 'submission-media'
      or nullif(btrim(coalesce(new.storage_path, '')), '') is null
      or nullif(btrim(coalesce(new.generated_file_name, '')), '') is null
      or new.storage_path ~ '(^/|//|\.\.)'
      or split_part(new.storage_path, '/', 1) <> 'submissions'
      or split_part(new.storage_path, '/', 2) <> new.submission_id
      or split_part(new.storage_path, '/', 3) <> 'applicants'
      or split_part(new.storage_path, '/', 4) <> new.applicant_id
      or split_part(new.storage_path, '/', 5) <> new.type::text
      or split_part(new.storage_path, '/', 6) <> new.generated_file_name
      or split_part(new.storage_path, '/', 7) <> ''
    then
      raise exception 'Required media must use canonical submission-media storage identity'
        using errcode = '23514';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists media_assets_required_media_canonical_storage_path
on public.media_assets;

create trigger media_assets_required_media_canonical_storage_path
before insert or update of
  submission_id,
  applicant_id,
  type,
  generated_file_name,
  storage_bucket,
  storage_path,
  upload_status
on public.media_assets
for each row
execute function app_private.enforce_required_media_canonical_storage_path();
