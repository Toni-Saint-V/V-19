# Storage OCR Pilot

## Mode

V-19 file uploads and passport extraction are pilot-safe only until live,
owner-approved Supabase Storage and RLS evidence exists.

Current pilot mode supports two explicit file asset adapters:

- `local-dev`: local browser/dev metadata. This is not production Storage and is
  not persisted to `media_assets`.
- `supabase-private`: private Supabase Storage metadata for uploaded objects in
  the `submission-media` bucket. Only these completed private assets may be
  persisted to `media_assets`.

## OCR Boundary

Passport extraction remains advisory. The product must not claim production OCR
readiness from local OCR, browser-side parsing, or an unavailable Edge/provider
path.

Extraction status `failed` or `unavailable` routes the applicant to manual
review and warning/fallback behavior. It is not OCR success. Manual fallback is
valid only when the passport upload itself is complete and the required passport
fields are filled.

Changing the `passport_scan` upload invalidates the previous
`passportExtraction` review state.

## Private Storage Boundary

Production activation expects a private `submission-media` bucket. Public
Storage URLs are not allowed. Runtime file reads may use short-lived
`createSignedUrl` responses, but signed URLs must not be persisted in
submission snapshots, `media_assets`, logs, or exported artifacts.

Durable file metadata source of truth for reload is `media_assets`. The cockpit
snapshot remains a fallback/cache for UI state and must not be treated as the
authoritative restored file metadata source when durable rows exist.

## Future Migration Notes

Do not widen `public.media_upload_status` during this pilot. The current
database enum remains:

```sql
'none'
'uploaded'
```

A future production migration may add:

```sql
'pending'
'failed'
'deleted'
```

Only add those values after Storage/RLS production approval and policy tests
cover:

- agent can read/write media only for owned editable submissions;
- agent cannot read, restore, sign, update, or delete another agent's media;
- admin can read selected submissions and media through approved admin paths;
- private bucket denies public object reads;
- signed URLs are short-lived and created only through authorized runtime code;
- deleted/failed uploads never satisfy completion or handoff readiness;
- durable reload restores `media_assets` metadata without trusting stale
  snapshots.

## Production Gaps

- No owner-approved live Storage/RLS proof is attached to this pilot note.
- No production OCR provider success evidence is attached.
- No production activation migration widens upload status.
- No public bucket policy or public URL path is approved.
- `verify:production-packet` is expected to remain fail-closed `NO_GO` unless
  fresh live evidence is supplied.

## Activation Wording

This work is migration-ready pilot scaffolding, not production Storage/OCR
readiness. Production activation remains `NO_GO` without live owner-approved
Storage bucket, RLS, signed URL, denial-path, and OCR evidence.
