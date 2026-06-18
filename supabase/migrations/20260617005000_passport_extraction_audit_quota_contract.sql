alter table public.ai_helper_audit_events
  drop constraint if exists ai_helper_audit_events_event_check;

alter table public.ai_helper_audit_events
  add constraint ai_helper_audit_events_event_check
  check (
    event in (
      'ai_helper_invoked',
      'ai_helper_denied',
      'ai_helper_rate_limited',
      'ai_helper_quota_failed',
      'ai_helper_provider_failed',
      'ai_helper_output_rejected',
      'passport_extraction_invoked',
      'passport_extraction_denied',
      'passport_extraction_provider_failed',
      'passport_extraction_output_rejected'
    )
  );

alter table public.ai_helper_audit_events
  drop constraint if exists ai_helper_audit_events_intent_check;

alter table public.ai_helper_audit_events
  add constraint ai_helper_audit_events_intent_check
  check (
    intent is null
    or intent in (
      'readiness_summary',
      'text_intake_review',
      'admin_review',
      'correction_draft',
      'export_guard',
      'passport_extraction'
    )
  );
