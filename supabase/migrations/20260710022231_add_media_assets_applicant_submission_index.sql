-- Cover the composite media_assets -> applicants foreign key for deletes and updates.
create index if not exists media_assets_applicant_submission_idx
  on public.media_assets (applicant_id, submission_id);
