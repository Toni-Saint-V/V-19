-- document_assets is a server-maintained projection of media_assets.
-- Clients may read it; only admins may advance the export marker.

drop policy if exists "document assets write editable submission" on public.document_assets;
drop policy if exists "document assets update through submission" on public.document_assets;
drop policy if exists "document assets admin export update" on public.document_assets;

create policy "document assets admin export update"
on public.document_assets for update
to authenticated
using ((select app_private.current_profile_role()) = 'admin')
with check ((select app_private.current_profile_role()) = 'admin');

revoke insert, update on public.document_assets from authenticated;
grant update (export_status) on public.document_assets to authenticated;

comment on table public.document_assets is
  'Server-maintained projection of media_assets; clients may only read and admins may mark export_status exported.';
