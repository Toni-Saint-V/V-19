revoke all on table public.ai_helper_audit_events from anon, authenticated;
revoke all on table public.ai_helper_quota_counters from anon, authenticated;
revoke all on table public.ai_helper_quota_receipts from anon, authenticated;

grant select, insert on table public.ai_helper_audit_events to service_role;
grant select, insert, update on table public.ai_helper_quota_counters to service_role;
grant select, insert on table public.ai_helper_quota_receipts to service_role;

drop policy if exists "ai helper audit service only" on public.ai_helper_audit_events;
drop policy if exists "ai helper counters service only" on public.ai_helper_quota_counters;
drop policy if exists "ai helper receipts service only" on public.ai_helper_quota_receipts;

create policy "ai helper audit service only"
on public.ai_helper_audit_events for all
using (false)
with check (false);

create policy "ai helper counters service only"
on public.ai_helper_quota_counters for all
using (false)
with check (false);

create policy "ai helper receipts service only"
on public.ai_helper_quota_receipts for all
using (false)
with check (false);

revoke all on function public.consume_ai_helper_quota(text, text, text, text) from public;
revoke execute on function public.consume_ai_helper_quota(text, text, text, text)
from anon, authenticated;
grant execute on function public.consume_ai_helper_quota(text, text, text, text)
to service_role;
