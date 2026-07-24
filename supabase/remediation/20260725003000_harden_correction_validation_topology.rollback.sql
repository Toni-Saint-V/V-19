do $rollback$
begin
  raise exception 'FORWARD_ONLY: correction validation and persistence topology hardening must be retained';
end;
$rollback$;
