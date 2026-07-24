-- Forward-only production repair.
--
-- Do not drop public_number, case_revision, revision triggers, or the private
-- dispatch boundary: the deployed clients depend on them and existing public
-- numbers are durable identifiers. If the frontend must be rolled back, keep
-- this schema repair in place and promote a compatible Vercel deployment.
--
-- This migration is intentionally not reversible. Restoring the old function
-- topology would reintroduce recursive dispatch and runtime-only failures.
do $rollback$
begin
  raise exception 'FORWARD_ONLY: keep the repaired schema and roll back only to a compatible frontend';
end;
$rollback$;
