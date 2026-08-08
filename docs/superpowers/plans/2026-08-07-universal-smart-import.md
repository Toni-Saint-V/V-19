# Universal Smart Import Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Build a local, privacy-preserving smart import that extracts a whitelist of questionnaire fields from image/PDF/text and persists only agent-confirmed values.

**Architecture:** A pure parser/classifier emits sanitized candidates without raw source material. A bounded browser-only file extractor performs local OCR/PDF text extraction, a modal owns only sanitized review state, and the existing questionnaire mutation path persists selected values with `smart_import` provenance. Source bytes and raw OCR never cross the extraction boundary.

**Tech Stack:** React 19, TypeScript, Vitest, Testing Library, Tesseract.js, pdfjs-dist, existing VisaFlow questionnaire domain APIs.

## Global Constraints

- Do not modify Supabase schema, RLS, migrations, Auth, Storage contracts, dependencies, or lockfiles.
- Never upload or persist temporary source files or raw OCR.
- Never emit canonical passport fields from smart import.
- Internal Russian passports never satisfy the international-passport requirement.
- Only explicitly selected values use the existing questionnaire update path.
- User-derived documents never populate the public address dictionary.

---

### Task 1: Pure parser, classifier, and review model

**Files:**
- Create: `src/modules/submissions/smartImport.ts`
- Create: `tests/unit/smartImport.spec.ts`

**Interfaces:**
- Produces: `parseSmartImportText(text): SmartImportParsedResult`
- Produces: `buildSmartImportReview({ parsed, currentValues }): SmartImportReview`
- Produces: sanitized candidate/review types used by extraction and UI.

- [x] Write failing tests for labelled forms, contact notes, registration pages, bookings, internal passports, forbidden fields, unlabelled dates, dedupe, review status, and absence of raw source properties.
- [x] Run focused tests and confirm they fail because `smartImport.ts` does not exist.
- [x] Implement deterministic classification, whitelist filtering, source-specific parsing, normalization, dedupe, and review comparison.
- [x] Run focused tests and make them pass.

### Task 2: Ephemeral browser extraction boundary

**Files:**
- Create: `src/modules/submissions/smartImportFileExtraction.ts`
- Create: `tests/unit/smartImportFileExtraction.spec.ts`
- Support: packages of up to 10 files / 60 MB, processed sequentially.
- Modify: `public/tesseract/lang/rus.traineddata.gz` only by adding the official Tesseract language asset if retrieval succeeds.

**Interfaces:**
- Consumes: `parseSmartImportText` from Task 1.
- Produces: `extractSmartImportFromText`, `extractSmartImportFromFile`, and sequential `extractSmartImportFromFiles` returning sanitized parsed results only.

- [x] Write failing tests for supported types, size limits, abort, sanitized output, image OCR language order, and PDF text-layer/OCR handling through injected test adapters.
- [x] Implement bounded JPEG/PNG/WEBP/PDF extraction with AbortSignal, timeout, cleanup, `rus+eng` then `eng`, and no public raw text/file metadata.
- [x] Add or verify the official local Russian Tesseract language asset.
- [x] Run focused tests.

### Task 3: Review dialog

**Files:**
- Create: `src/modules/submissions/components/SmartImportDialog.tsx`
- Create: `src/modules/submissions/components/smart-import.css`
- Create: `tests/unit/smartImportDialog.spec.tsx`
- Modify: `src/modules/submissions/agentInteractionContract.ts`

**Interfaces:**
- Consumes: sanitized extraction and review APIs.
- Produces: `onApply(selectedItems)` with selected structured candidates only.

- [x] Write failing UI tests for file/text entry, privacy copy, defaults, conflicts, low-confidence opt-in, cancellation, selected-only apply, and absence of source details after extraction.
- [x] Implement accessible responsive dialog with immediate file processing, AbortController cleanup, and sanitized React state.
- [x] Add interaction contracts for open/cancel/apply.
- [ ] Run dialog tests through the repository Vitest runtime (blocked: dependencies absent in supplied archive).

### Task 4: Questionnaire integration and provenance

**Files:**
- Modify: `src/modules/submissions/types.ts`
- Modify: `src/modules/submissions/components/FigmaQuestionnaireScreen.tsx`
- Create: `tests/unit/questionnaireSmartImport.spec.tsx`

**Interfaces:**
- Consumes: dialog `SmartImportReviewItem[]`.
- Produces: existing `QuestionnaireFieldUpdate` values with `smart_import` provenance and `needs_review` state.

- [x] Write failing integration tests for editable/read-only visibility, selected field application, conflicts, provenance, and structured address composition.
- [x] Add `smart_import` to questionnaire review sources.
- [x] Add header action and modal lifecycle.
- [x] Extend field update helper with explicit import provenance while preserving manual behavior and family-copy behavior.
- [x] Apply structured address components and recompute `home-address` through the existing composer.
- [ ] Run questionnaire integration tests through the repository Vitest runtime (blocked: dependencies absent in supplied archive).

### Task 5: Privacy gates and documentation

**Files:**
- Create: `tests/unit/smartImportPrivacy.spec.ts`
- Modify: `docs/release/canonical-domain-contract.md`

**Interfaces:**
- Produces: static guard against persistence/network/logging regressions in smart-import modules.

- [x] Write a static privacy test rejecting Supabase/Storage/localStorage/IndexedDB/sendBeacon/source logging/raw-source public fields.
- [x] Document the ephemeral-source and selected-fields-only contract.
- [x] Run privacy and focused smart-import tests.

### Task 6: Verification and delivery

**Files:**
- Create outside repository: verification ledger, patch, updated archive, checksums.

- [ ] Run formatting check on changed files.
- [ ] Run focused and full tests.
- [ ] Run typecheck and lint.
- [ ] Run production build and bundle verification.
- [ ] Run privacy/secret/artifact scans.
- [ ] Compare work against pristine baseline and inspect every changed file.
- [ ] Package patch, updated source archive, verification ledger, and SHA-256 sums.
