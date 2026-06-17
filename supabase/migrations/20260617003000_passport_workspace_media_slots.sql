alter type public.media_slot_type add value if not exists 'selfie_2';
alter type public.media_slot_type add value if not exists 'passport_scan';

drop policy if exists "media storage read owner or admin" on storage.objects;
drop policy if exists "media storage write editable owner or admin" on storage.objects;
drop policy if exists "media storage update editable owner or admin" on storage.objects;
drop policy if exists "media storage delete editable owner or admin" on storage.objects;

create policy "media storage read owner or admin"
on storage.objects for select
to authenticated
using (
  bucket_id = 'submission-media'
  and split_part(name, '/', 1) <> ''
  and split_part(name, '/', 2) <> ''
  and split_part(name, '/', 3) in ('photo_white', 'selfie', 'selfie_2', 'passport_scan', 'video')
  and split_part(name, '/', 4) <> ''
  and split_part(name, '/', 5) = ''
  and (
    (split_part(name, '/', 3) in ('photo_white', 'selfie', 'selfie_2') and storage.extension(name) in ('jpg', 'jpeg', 'png'))
    or (split_part(name, '/', 3) = 'passport_scan' and storage.extension(name) in ('jpg', 'jpeg', 'png', 'pdf'))
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
  and split_part(name, '/', 3) in ('photo_white', 'selfie', 'selfie_2', 'passport_scan', 'video')
  and split_part(name, '/', 4) <> ''
  and split_part(name, '/', 5) = ''
  and (
    (split_part(name, '/', 3) in ('photo_white', 'selfie', 'selfie_2') and storage.extension(name) in ('jpg', 'jpeg', 'png'))
    or (split_part(name, '/', 3) = 'passport_scan' and storage.extension(name) in ('jpg', 'jpeg', 'png', 'pdf'))
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
  and split_part(name, '/', 3) in ('photo_white', 'selfie', 'selfie_2', 'passport_scan', 'video')
  and split_part(name, '/', 4) <> ''
  and split_part(name, '/', 5) = ''
  and (
    (split_part(name, '/', 3) in ('photo_white', 'selfie', 'selfie_2') and storage.extension(name) in ('jpg', 'jpeg', 'png'))
    or (split_part(name, '/', 3) = 'passport_scan' and storage.extension(name) in ('jpg', 'jpeg', 'png', 'pdf'))
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
