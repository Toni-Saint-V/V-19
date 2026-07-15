-- save_submission_draft intentionally normalizes media asset identities for
-- snapshot-backed submissions. The document projection must follow that
-- identity update atomically instead of blocking a valid review checkpoint.
alter table public.document_assets
  drop constraint if exists document_assets_source_media_asset_id_fkey;

alter table public.document_assets
  add constraint document_assets_source_media_asset_id_fkey
  foreign key (source_media_asset_id)
  references public.media_assets (id)
  on delete cascade
  on update cascade;
