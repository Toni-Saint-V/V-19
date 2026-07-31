-- Keep terminal T9 dormant while the canonical release contract permits only
-- Excel export. A later owner-approved activation must restore the exact
-- execution grant explicitly.

revoke all on function app_private.complete_export_package_core(jsonb)
  from public, anon, authenticated;
revoke all on function public.complete_export_package(jsonb)
  from public, anon, authenticated;
