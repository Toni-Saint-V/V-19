-- Keep media review state server-owned and bind every media row to the
-- applicant that belongs to its submission.  This closes both the handoff RPC
-- payload gap and direct authenticated media writes without changing the
-- existing submission-save contract.

create or replace function app_private.enforce_media_asset_review_boundary()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, app_private
as $$
declare
  actor_role public.profile_role := app_private.current_profile_role();
  content_changed boolean := false;
begin
  if not exists (
    select 1
    from public.applicants applicant
    where applicant.id = new.applicant_id
      and applicant.submission_id = new.submission_id
  ) then
    raise exception 'Media asset applicant does not belong to submission'
      using errcode = '23503';
  end if;

  if tg_op = 'UPDATE' then
    content_changed :=
      new.applicant_id is distinct from old.applicant_id
      or new.submission_id is distinct from old.submission_id
      or new.type is distinct from old.type
      or new.original_file_name is distinct from old.original_file_name
      or new.generated_file_name is distinct from old.generated_file_name
      or new.storage_bucket is distinct from old.storage_bucket
      or new.storage_path is distinct from old.storage_path
      or new.mime_type is distinct from old.mime_type
      or new.size_bytes is distinct from old.size_bytes
      or new.upload_status is distinct from old.upload_status;
  end if;

  if actor_role = 'agent' then
    if tg_op = 'INSERT' then
      if new.review_status is distinct from 'not_reviewed'::public.media_review_status
        or new.reviewed_at is not null
        or new.reviewed_by is not null
      then
        raise exception 'Agents cannot set media review state'
          using errcode = '42501';
      end if;
    elsif content_changed then
      if new.review_status is distinct from 'not_reviewed'::public.media_review_status
        or new.reviewed_at is not null
        or new.reviewed_by is not null
      then
        raise exception 'Agents cannot preserve or set media review state while changing media'
          using errcode = '42501';
      end if;
    elsif new.review_status is distinct from old.review_status
      or new.reviewed_at is distinct from old.reviewed_at
      or new.reviewed_by is distinct from old.reviewed_by
    then
      raise exception 'Agents cannot change media review state'
        using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function app_private.enforce_media_asset_review_boundary() from public;

drop trigger if exists media_assets_enforce_review_boundary on public.media_assets;
create trigger media_assets_enforce_review_boundary
before insert or update on public.media_assets
for each row execute function app_private.enforce_media_asset_review_boundary();

create unique index if not exists applicants_id_submission_id_uidx
  on public.applicants (id, submission_id);

create index if not exists media_assets_applicant_submission_idx
  on public.media_assets (applicant_id, submission_id);

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.media_assets'::regclass
      and conname = 'media_assets_applicant_submission_fkey'
  ) then
    alter table public.media_assets
      add constraint media_assets_applicant_submission_fkey
      foreign key (applicant_id, submission_id)
      references public.applicants (id, submission_id)
      on delete cascade
      not valid;
  end if;
end;
$$;

alter table public.media_assets
  validate constraint media_assets_applicant_submission_fkey;

comment on constraint media_assets_applicant_submission_fkey
  on public.media_assets is
  'Media rows must bind applicant_id to the same submission_id.';
