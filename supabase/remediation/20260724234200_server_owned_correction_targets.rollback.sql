-- Forward-only lifecycle hardening.
--
-- Do not remove stable target identity, server-owned revisions/projections, or
-- DB-side questionnaire readiness: doing so would let stale or incomplete
-- correction payloads advance the submission. Roll back only to a frontend
-- that understands the retained contract.
do $rollback$
begin
  raise exception 'FORWARD_ONLY: server-owned correction revisions and questionnaire readiness must be retained';
end;
$rollback$;
