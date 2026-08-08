# Universal Smart Import — design

## Purpose

Add one privacy-preserving **Умный импорт** entry point to the VisaFlow questionnaire. An agent may provide an image, a PDF, or pasted text containing applicant details. VisaFlow extracts a bounded set of questionnaire candidates, compares them with the current applicant, and lets the agent explicitly choose which values to apply.

The feature is advisory. It never silently overwrites questionnaire data and never treats a non-passport source as proof of passport data.

## Privacy boundary

Temporary source material is ephemeral:

- image/PDF bytes are processed locally in the browser;
- pasted source text and raw OCR text are held only inside the extraction call;
- the public extraction result contains structured candidates only;
- source files, filenames, hashes, thumbnails, raw OCR, and unrecognised text are not returned to React state;
- temporary content is not uploaded to Supabase Storage, written to the database, localStorage, IndexedDB, analytics, logs, Sentry, or browser caches by application code;
- closing, cancelling, switching applicant, or unmounting aborts the active extraction and clears structured review state;
- only fields explicitly selected by the agent are sent through the existing questionnaire update path.

The confirmed home address is ordinary questionnaire data and is persisted only after the agent presses **Применить выбранное**.

## Supported sources in V1

- JPEG, PNG, and WEBP images;
- PDF with a text layer or up to eight locally OCR-processed pages;
- pasted text;
- camera capture through the browser file input;
- a package of up to 10 files and 60 MB total, processed sequentially to bound memory use.

A package preserves contradictory values from different sources. Equivalent normalized values are deduplicated; conflicting values remain separate radio choices and none is selected automatically. The active questionnaire applicant is the only write target.

V1 targets printed text and legible block handwriting. Difficult cursive is returned as low-confidence data or no candidate; the system does not invent missing values.

## Document classification

The local classifier returns one of:

- `russian_registration` — registration/residence page;
- `russian_internal_passport` — Russian internal passport, including `PNRUS` MRZ;
- `booking` — hotel/accommodation booking;
- `travel_ticket` — flight or itinerary receipt;
- `employment` — employer letter or work note;
- `invitation` — private/company invitation;
- `filled_form` — labelled paper questionnaire;
- `contact_note` — free-form note with contacts/address/work data;
- `unknown`.

Classification only chooses extraction rules. It is not persisted.

## Candidate whitelist

Smart import may propose only these canonical questionnaire fields:

- personal: `surname`, `first-name`, `previous-surname`, `birth-date`, `birth-place`, `birth-country`, `nationality`, `gender`, `marital-status`;
- contacts: `home-country`, `home-city`, `home-street`, `home-house`, `home-building`, `home-unit`, `postal-code`, `email`, `contact-number`;
- employment: `occupation`, `employer-name`, `employer-contact`, `employer-address`;
- trip: `purpose`, `main-destination`, `first-entry-country`, `entry-count`, `arrival-date`, `departure-date`, `stay-duration`;
- host/hotel: `inviting-party-type`, `hotel-name`, `hotel-address`, `hotel-country`, `hotel-city`, `hotel-postal-code`, `hotel-email`, `hotel-contact`;
- payment: `cost-covered-by`, `means-of-support`.

Smart import must never produce `passport-type`, `passport-no`, passport issue/expiry data, passport issue country/place, or other canonical passport-section writes. A Russian internal passport can propose personal identity fields only and never satisfies the required international-passport file slot. Its `PNRUS` fallback validates MRZ document-number and birth-date check digits before proposing date or gender; visual Cyrillic lines remain reviewable candidates.

## Extraction and normalization

The extractor first uses labelled fields from the existing questionnaire parser, then applies source-specific rules. Image OCR runs locally with `rus+eng`, page segmentation mode 4, automatic rotation, and an English-only fallback when bilingual OCR fails or returns blank text. It removes raw evidence, filters forbidden fields, maps compatible aliases, normalizes dates, email, phone, country names, and structured Russian address parts, and deduplicates by canonical field ID. Higher-confidence evidence wins.

Registration pages are decomposed into country, city, postal code, street, house, building/structure, and unit. The public address dictionary may normalize names, but it is never trained or populated from user documents and no query-to-user association is stored.

Booking/invitation contact details are routed to hotel/host fields instead of the applicant’s personal contact fields. An unrelated unlabelled date must not become `birth-date`.

## Review model

Every candidate has `low`, `medium`, or `high` confidence and is compared with the current value:

- `new` — current field is empty;
- `same` — normalized values are equivalent;
- `conflict` — a different value already exists;
- `low_confidence` — source confidence is low.

Only medium/high-confidence `new` values are selected by default. Conflicts and low-confidence values require an explicit checkbox. `same` values are visible but not selected.

Applied fields use questionnaire provenance:

```ts
reviewOriginSource: "smart_import"
reviewSource: "smart_import"
reviewState: "needs_review"
```

A later manual edit or explicit confirmation continues to use the existing manual-confirmation behavior.

## UI

The editable questionnaire header gets **Умный импорт**. The responsive modal contains:

1. privacy notice;
2. image/PDF picker with camera support;
3. pasted-text input;
4. local processing state with cancellation;
5. classified source summary;
6. field-by-field review list with current and proposed values;
7. **Применить выбранное** and **Отменить**.

Read-only questionnaires do not expose the action. No source filename or raw OCR text is rendered after processing.

## Error handling

Unsupported MIME type, oversize input, OCR timeout, empty result, and cancellation produce user-safe messages. Cancellation is not reported as an error. Extraction failure never mutates questionnaire state.

## Testing and release gates

- pure parser/classifier/review unit tests;
- privacy contract static tests;
- file extraction boundary tests;
- dialog behavior tests;
- questionnaire integration tests for editable/read-only, selected-only apply, conflicts, provenance, and address composition;
- typecheck, lint, full unit/integration suite, production build, privacy/secret scan, and UI smoke where dependencies are available.

No dependency or lockfile change is permitted for this implementation.
