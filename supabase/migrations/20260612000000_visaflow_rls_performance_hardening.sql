create index if not exists submissions_agent_id_idx on public.submissions (agent_id);
create index if not exists submissions_updated_at_idx on public.submissions (updated_at desc);
create index if not exists applicants_submission_id_idx on public.applicants (submission_id);
create index if not exists media_assets_submission_id_idx on public.media_assets (submission_id);
create index if not exists media_assets_reviewed_by_idx on public.media_assets (reviewed_by);
create index if not exists corrections_submission_id_idx on public.corrections (submission_id);
create index if not exists corrections_applicant_id_idx on public.corrections (applicant_id);
create index if not exists corrections_created_by_idx on public.corrections (created_by);
create index if not exists export_batches_created_by_idx on public.export_batches (created_by);
create index if not exists appointments_submission_id_idx on public.appointments (submission_id);
create index if not exists appointments_updated_by_idx on public.appointments (updated_by);
create index if not exists status_history_changed_by_idx on public.status_history (changed_by);
create index if not exists status_history_entity_id_idx on public.status_history (entity_id);

drop policy if exists "profiles read own or admin" on public.profiles;
drop policy if exists "profiles insert own agent" on public.profiles;
drop policy if exists "profiles update own identity" on public.profiles;
drop policy if exists "submissions agent own admin all" on public.submissions;
drop policy if exists "applicants through submission" on public.applicants;
drop policy if exists "media through submission" on public.media_assets;
drop policy if exists "corrections through submission" on public.corrections;
drop policy if exists "export batches admin only" on public.export_batches;
drop policy if exists "appointments admin only" on public.appointments;
drop policy if exists "status history read visible" on public.status_history;
drop policy if exists "status history insert owned" on public.status_history;
drop policy if exists "media storage owner or admin" on storage.objects;

create policy "profiles read own or admin"
on public.profiles for select
using (id = (select auth.uid()) or (select app_private.current_profile_role()) = 'admin');

create policy "profiles insert own agent"
on public.profiles for insert
with check (id = (select auth.uid()) and role = 'agent');

create policy "profiles update own identity"
on public.profiles for update
using (id = (select auth.uid()))
with check (id = (select auth.uid()) and role = (select app_private.current_profile_role()));

create policy "submissions agent own admin all"
on public.submissions for all
using (agent_id = (select auth.uid()) or (select app_private.current_profile_role()) = 'admin')
with check (agent_id = (select auth.uid()) or (select app_private.current_profile_role()) = 'admin');

create policy "applicants through submission"
on public.applicants for all
using (
  exists (
    select 1 from public.submissions s
    where s.id = applicants.submission_id
    and (s.agent_id = (select auth.uid()) or (select app_private.current_profile_role()) = 'admin')
  )
)
with check (
  exists (
    select 1 from public.submissions s
    where s.id = applicants.submission_id
    and (s.agent_id = (select auth.uid()) or (select app_private.current_profile_role()) = 'admin')
  )
);

create policy "media through submission"
on public.media_assets for all
using (
  exists (
    select 1 from public.submissions s
    where s.id = media_assets.submission_id
    and (s.agent_id = (select auth.uid()) or (select app_private.current_profile_role()) = 'admin')
  )
)
with check (
  exists (
    select 1 from public.submissions s
    where s.id = media_assets.submission_id
    and (s.agent_id = (select auth.uid()) or (select app_private.current_profile_role()) = 'admin')
  )
);

create policy "corrections through submission"
on public.corrections for all
using (
  exists (
    select 1 from public.submissions s
    where s.id = corrections.submission_id
    and (s.agent_id = (select auth.uid()) or (select app_private.current_profile_role()) = 'admin')
  )
  and (
    corrections.applicant_id is null
    or exists (
      select 1 from public.applicants a
      where a.id = corrections.applicant_id
      and a.submission_id = corrections.submission_id
    )
  )
)
with check (
  exists (
    select 1 from public.submissions s
    where s.id = corrections.submission_id
    and (s.agent_id = (select auth.uid()) or (select app_private.current_profile_role()) = 'admin')
  )
  and (
    corrections.applicant_id is null
    or exists (
      select 1 from public.applicants a
      where a.id = corrections.applicant_id
      and a.submission_id = corrections.submission_id
    )
  )
);

create policy "export batches admin only"
on public.export_batches for all
using ((select app_private.current_profile_role()) = 'admin')
with check ((select app_private.current_profile_role()) = 'admin');

create policy "appointments admin only"
on public.appointments for all
using ((select app_private.current_profile_role()) = 'admin')
with check ((select app_private.current_profile_role()) = 'admin');

create policy "status history read visible"
on public.status_history for select
using (
  (select app_private.current_profile_role()) = 'admin'
  or entity_id in (
    select id from public.submissions where agent_id = (select auth.uid())
  )
  or entity_id in (
    select a.id
    from public.applicants a
    join public.submissions s on s.id = a.submission_id
    where s.agent_id = (select auth.uid())
  )
  or entity_id in (
    select m.id
    from public.media_assets m
    join public.submissions s on s.id = m.submission_id
    where s.agent_id = (select auth.uid())
  )
  or entity_id in (
    select ap.id::text
    from public.appointments ap
    join public.submissions s on s.id = ap.submission_id
    where s.agent_id = (select auth.uid())
  )
);

create policy "status history insert owned"
on public.status_history for insert
with check (
  (select app_private.current_profile_role()) = 'admin'
  or (
    changed_by = (select auth.uid())
    and (
      (
        entity_type = 'submission'
        and entity_id in (
          select id from public.submissions where agent_id = (select auth.uid())
        )
      )
      or (
        entity_type = 'applicant'
        and entity_id in (
          select a.id
          from public.applicants a
          join public.submissions s on s.id = a.submission_id
          where s.agent_id = (select auth.uid())
        )
      )
      or (
        entity_type = 'media'
        and entity_id in (
          select m.id
          from public.media_assets m
          join public.submissions s on s.id = m.submission_id
          where s.agent_id = (select auth.uid())
        )
      )
      or (
        entity_type = 'appointment'
        and entity_id in (
          select ap.id::text
          from public.appointments ap
          join public.submissions s on s.id = ap.submission_id
          where s.agent_id = (select auth.uid())
        )
      )
    )
  )
);

create policy "media storage owner or admin"
on storage.objects for all
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
      select id from public.submissions where agent_id = (select auth.uid())
    )
  )
);
