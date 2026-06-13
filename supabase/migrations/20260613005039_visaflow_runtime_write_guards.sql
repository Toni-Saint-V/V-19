create or replace function app_private.enforce_submission_review_readiness()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  if new.status not in ('ready_for_review', 'waiting_review') then
    return new;
  end if;

  if new.type = 'single' and (
    select count(*) from public.applicants where submission_id = new.id
  ) <> 1 then
    raise exception 'A single submission must have exactly one applicant before review'
      using errcode = '23514';
  end if;

  if new.type = 'family' and not exists (
    select 1 from public.applicants where submission_id = new.id
  ) then
    raise exception 'A family submission must have applicants before review'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.applicants a
    where a.submission_id = new.id
      and (
        nullif(trim(a.full_name), '') is null
        or nullif(trim(a.role), '') is null
        or nullif(trim(a.passport_number), '') is null
        or trim(a.passport_number) = '-'
        or a.birth_date is null
        or nullif(trim(coalesce(a.citizenship, '')), '') is null
        or nullif(trim(coalesce(a.address, '')), '') is null
        or nullif(trim(coalesce(a.phone, '')), '') is null
        or nullif(trim(coalesce(a.email, '')), '') is null
        or a.passport_issued_at is null
        or a.passport_expires_at is null
        or nullif(trim(a.country), '') is null
        or nullif(trim(a.city), '') is null
        or nullif(trim(a.trip_dates), '') is null
        or nullif(trim(coalesce(a.hotel_name, '')), '') is null
        or nullif(trim(coalesce(a.hotel_address, '')), '') is null
      )
  ) then
    raise exception 'Applicant required fields must be complete before review'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.applicants a
    cross join lateral (
      values
        ('photo_white'::public.media_slot_type),
        ('selfie'::public.media_slot_type),
        ('video'::public.media_slot_type)
    ) as required_media(type)
    where a.submission_id = new.id
      and not exists (
        select 1
        from public.media_assets m
        where m.submission_id = new.id
          and m.applicant_id = a.id
          and m.type = required_media.type
          and m.upload_status = 'uploaded'
          and m.review_status not in ('replace_required', 'poor_quality')
          and nullif(trim(m.storage_path), '') is not null
          and nullif(trim(coalesce(m.generated_file_name, '')), '') is not null
      )
  ) then
    raise exception 'All required media must be uploaded before review'
      using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.corrections c
    where c.submission_id = new.id
      and c.severity = 'blocking'
      and c.status = 'open'
  ) then
    raise exception 'Blocking corrections must be fixed before review'
      using errcode = '23514';
  end if;

  return new;
end;
$$;

drop trigger if exists submissions_review_readiness_guard on public.submissions;

create constraint trigger submissions_review_readiness_guard
after insert or update of status on public.submissions
deferrable initially deferred
for each row
execute function app_private.enforce_submission_review_readiness();

create or replace function app_private.enforce_correction_actor()
returns trigger
language plpgsql
security definer
set search_path = public, app_private
as $$
begin
  if auth.uid() is null then
    raise exception 'Authenticated user required to write corrections'
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

drop trigger if exists corrections_actor_guard on public.corrections;

create trigger corrections_actor_guard
before insert or update on public.corrections
for each row
execute function app_private.enforce_correction_actor();

drop policy if exists "applicants through submission" on public.applicants;
drop policy if exists "media through submission" on public.media_assets;
drop policy if exists "corrections through submission" on public.corrections;
drop policy if exists "media storage owner or admin" on storage.objects;
drop policy if exists "applicants read through submission" on public.applicants;
drop policy if exists "applicants write editable submission" on public.applicants;
drop policy if exists "applicants update editable submission" on public.applicants;
drop policy if exists "media read through submission" on public.media_assets;
drop policy if exists "media write editable submission" on public.media_assets;
drop policy if exists "media update editable submission" on public.media_assets;
drop policy if exists "corrections read through submission" on public.corrections;
drop policy if exists "corrections write editable submission" on public.corrections;
drop policy if exists "corrections update editable submission" on public.corrections;
drop policy if exists "media storage read owner or admin" on storage.objects;
drop policy if exists "media storage write editable owner or admin" on storage.objects;
drop policy if exists "media storage update editable owner or admin" on storage.objects;
drop policy if exists "media storage delete editable owner or admin" on storage.objects;

create policy "applicants read through submission"
on public.applicants for select
using (
  exists (
    select 1
    from public.submissions s
    where s.id = applicants.submission_id
      and (
        s.agent_id = (select auth.uid())
        or (select app_private.current_profile_role()) = 'admin'
      )
  )
);

create policy "applicants write editable submission"
on public.applicants for insert
with check (
  exists (
    select 1
    from public.submissions s
    where s.id = applicants.submission_id
      and (
        (select app_private.current_profile_role()) = 'admin'
        or (
          s.agent_id = (select auth.uid())
          and s.status in ('draft', 'filling', 'returned', 'ready_for_review')
        )
      )
  )
);

create policy "applicants update editable submission"
on public.applicants for update
using (
  exists (
    select 1
    from public.submissions s
    where s.id = applicants.submission_id
      and (
        (select app_private.current_profile_role()) = 'admin'
        or (
          s.agent_id = (select auth.uid())
          and s.status in ('draft', 'filling', 'returned', 'ready_for_review')
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.submissions s
    where s.id = applicants.submission_id
      and (
        (select app_private.current_profile_role()) = 'admin'
        or (
          s.agent_id = (select auth.uid())
          and s.status in ('draft', 'filling', 'returned', 'ready_for_review')
        )
      )
  )
);

create policy "media read through submission"
on public.media_assets for select
using (
  exists (
    select 1
    from public.submissions s
    where s.id = media_assets.submission_id
      and (
        s.agent_id = (select auth.uid())
        or (select app_private.current_profile_role()) = 'admin'
      )
  )
);

create policy "media write editable submission"
on public.media_assets for insert
with check (
  exists (
    select 1
    from public.submissions s
    where s.id = media_assets.submission_id
      and (
        (select app_private.current_profile_role()) = 'admin'
        or (
          s.agent_id = (select auth.uid())
          and s.status in ('draft', 'filling', 'returned', 'ready_for_review')
        )
      )
  )
);

create policy "media update editable submission"
on public.media_assets for update
using (
  exists (
    select 1
    from public.submissions s
    where s.id = media_assets.submission_id
      and (
        (select app_private.current_profile_role()) = 'admin'
        or (
          s.agent_id = (select auth.uid())
          and s.status in ('draft', 'filling', 'returned', 'ready_for_review')
        )
      )
  )
)
with check (
  exists (
    select 1
    from public.submissions s
    where s.id = media_assets.submission_id
      and (
        (select app_private.current_profile_role()) = 'admin'
        or (
          s.agent_id = (select auth.uid())
          and s.status in ('draft', 'filling', 'returned', 'ready_for_review')
        )
      )
  )
);

create policy "corrections read through submission"
on public.corrections for select
using (
  exists (
    select 1
    from public.submissions s
    where s.id = corrections.submission_id
      and (
        s.agent_id = (select auth.uid())
        or (select app_private.current_profile_role()) = 'admin'
      )
  )
  and (
    corrections.applicant_id is null
    or exists (
      select 1
      from public.applicants a
      where a.id = corrections.applicant_id
        and a.submission_id = corrections.submission_id
    )
  )
);

create policy "corrections write editable submission"
on public.corrections for insert
with check (
  exists (
    select 1
    from public.submissions s
    where s.id = corrections.submission_id
      and (
        (select app_private.current_profile_role()) = 'admin'
        or (
          s.agent_id = (select auth.uid())
          and s.status in ('draft', 'filling', 'returned', 'ready_for_review')
        )
      )
  )
  and (
    corrections.applicant_id is null
    or exists (
      select 1
      from public.applicants a
      where a.id = corrections.applicant_id
        and a.submission_id = corrections.submission_id
    )
  )
);

create policy "corrections update editable submission"
on public.corrections for update
using (
  exists (
    select 1
    from public.submissions s
    where s.id = corrections.submission_id
      and (
        (select app_private.current_profile_role()) = 'admin'
        or (
          s.agent_id = (select auth.uid())
          and s.status in ('draft', 'filling', 'returned', 'ready_for_review')
        )
      )
  )
  and (
    corrections.applicant_id is null
    or exists (
      select 1
      from public.applicants a
      where a.id = corrections.applicant_id
        and a.submission_id = corrections.submission_id
    )
  )
)
with check (
  exists (
    select 1
    from public.submissions s
    where s.id = corrections.submission_id
      and (
        (select app_private.current_profile_role()) = 'admin'
        or (
          s.agent_id = (select auth.uid())
          and s.status in ('draft', 'filling', 'returned', 'ready_for_review')
        )
      )
  )
  and (
    corrections.applicant_id is null
    or exists (
      select 1
      from public.applicants a
      where a.id = corrections.applicant_id
        and a.submission_id = corrections.submission_id
    )
  )
);

create policy "media storage read owner or admin"
on storage.objects for select
to authenticated
using (
  bucket_id = 'submission-media'
  and split_part(name, '/', 1) <> ''
  and split_part(name, '/', 2) <> ''
  and split_part(name, '/', 3) in ('photo_white', 'selfie', 'video')
  and split_part(name, '/', 4) <> ''
  and split_part(name, '/', 5) = ''
  and (
    (split_part(name, '/', 3) in ('photo_white', 'selfie') and storage.extension(name) in ('jpg', 'jpeg', 'png'))
    or (split_part(name, '/', 3) = 'video' and storage.extension(name) = 'mp4')
  )
  and exists (
    select 1
    from public.applicants a
    where a.id = split_part(name, '/', 2)
      and a.submission_id = split_part(name, '/', 1)
  )
  and (
    (select app_private.current_profile_role()) = 'admin'
    or split_part(name, '/', 1) in (
      select id from public.submissions where agent_id = (select auth.uid())
    )
  )
);

create policy "media storage write editable owner or admin"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'submission-media'
  and split_part(name, '/', 1) <> ''
  and split_part(name, '/', 2) <> ''
  and split_part(name, '/', 3) in ('photo_white', 'selfie', 'video')
  and split_part(name, '/', 4) <> ''
  and split_part(name, '/', 5) = ''
  and (
    (split_part(name, '/', 3) in ('photo_white', 'selfie') and storage.extension(name) in ('jpg', 'jpeg', 'png'))
    or (split_part(name, '/', 3) = 'video' and storage.extension(name) = 'mp4')
  )
  and exists (
    select 1
    from public.applicants a
    where a.id = split_part(name, '/', 2)
      and a.submission_id = split_part(name, '/', 1)
  )
  and (
    (select app_private.current_profile_role()) = 'admin'
    or split_part(name, '/', 1) in (
      select id
      from public.submissions
      where agent_id = (select auth.uid())
        and status in ('draft', 'filling', 'returned', 'ready_for_review')
    )
  )
);

create policy "media storage update editable owner or admin"
on storage.objects for update
to authenticated
using (
  bucket_id = 'submission-media'
  and (
    (select app_private.current_profile_role()) = 'admin'
    or split_part(name, '/', 1) in (
      select id
      from public.submissions
      where agent_id = (select auth.uid())
        and status in ('draft', 'filling', 'returned', 'ready_for_review')
    )
  )
)
with check (
  bucket_id = 'submission-media'
  and split_part(name, '/', 1) <> ''
  and split_part(name, '/', 2) <> ''
  and split_part(name, '/', 3) in ('photo_white', 'selfie', 'video')
  and split_part(name, '/', 4) <> ''
  and split_part(name, '/', 5) = ''
  and (
    (split_part(name, '/', 3) in ('photo_white', 'selfie') and storage.extension(name) in ('jpg', 'jpeg', 'png'))
    or (split_part(name, '/', 3) = 'video' and storage.extension(name) = 'mp4')
  )
  and exists (
    select 1
    from public.applicants a
    where a.id = split_part(name, '/', 2)
      and a.submission_id = split_part(name, '/', 1)
  )
  and (
    (select app_private.current_profile_role()) = 'admin'
    or split_part(name, '/', 1) in (
      select id
      from public.submissions
      where agent_id = (select auth.uid())
        and status in ('draft', 'filling', 'returned', 'ready_for_review')
    )
  )
);

create policy "media storage delete editable owner or admin"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'submission-media'
  and (
    (select app_private.current_profile_role()) = 'admin'
    or split_part(name, '/', 1) in (
      select id
      from public.submissions
      where agent_id = (select auth.uid())
        and status in ('draft', 'filling', 'returned', 'ready_for_review')
    )
  )
);

revoke all on function app_private.enforce_submission_review_readiness() from public;
revoke all on function app_private.enforce_correction_actor() from public;
