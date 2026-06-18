# Passport Photo Extraction With Kill Switch And One-Time Review

## Summary

Implement passport-photo data extraction as a guarded, optional local OCR feature in the existing operator workspace. The flow is: upload passport scan/photo, optionally run free OCR/MRZ extraction, review/apply extracted fields, then optionally confirm once before sending to admin. Manual entry remains fully available.

## Key Changes

- Add client switch `VITE_PASSPORT_EXTRACTION_ENABLED=true|false`; when off, hide extraction actions and never block submission.
- OpenAI is not part of this plan. Do not require OpenAI quota, keys, or billing for passport extraction.
- Product model: free OCR attempts are not capped. Track attempt count for observability only; repeated free retries are allowed when recognition fails.
- Preferred provider: local OCR/MRZ extraction first. A future server worker may improve quality, but it must remain separate from OpenAI.
- Keep server-side contracts fail-closed while no local/server OCR provider is wired. Do not fake extracted data.
- Read only passport scan/photo inputs; v1 extracts from `image/jpeg` and `image/png`. PDFs stay uploadable but extraction can return unavailable.
- Add a client extraction service that validates the shared contract and returns unavailable in local-demo mode instead of fake data.
- Extend workspace state with per-applicant passport extraction review state: source file, source storage path, request id, attempt count, extracted fields, applied fields, verified/skipped timestamps.
- Persist that state through the existing cockpit snapshot; no new DB migration for v1.
- Map extracted fields to questionnaire fields, including new passport issue place/country fields.
- Never overwrite a non-empty different field silently; show conflicts and require explicit apply, skip, or keep-current action.
- In creation mode, keep selected passport files and upload them to each applicant passport slot after draft creation in Supabase mode. Extraction remains operator-triggered after upload.
- Intercept `submit_for_review`; if current extracted passport data was not verified or skipped, show one optional review modal. Do not repeat unless the passport scan is replaced or extraction reruns.

## Test Plan

- Unit-test extraction contract unavailable/disabled behavior, field mapping, conflict handling, and one-time prompt logic.
- Component-test feature flag off, extraction action visibility, apply/skip flow, and submit prompt.
- Run `npm run typecheck`, targeted Vitest, `npm run test`, `npm run build`, `npm run verify:safety`.
- Capture Playwright screenshots for create flow, media extraction state, data review state, and pre-submit review modal.

## Assumptions

- Continue on branch `product/operator-workspace-passport-intake-run`.
- Existing untracked `docs/qa/*` and prototype files are unrelated and must not be touched.
- Production key setup is out of scope; provider fails closed if server env is absent.
- This is not official document verification. UI copy must say the operator manually checks extracted data.
