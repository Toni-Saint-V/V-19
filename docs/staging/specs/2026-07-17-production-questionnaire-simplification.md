# Production questionnaire simplification

status: Approved by the user's section-by-section decisions in this task; implementation requested on 2026-07-17.

contract: The production questionnaire remains on `QuestionnaireScreen -> FigmaQuestionnaireScreen` and preserves the current header, persistence, issue targeting, export/PDF compatibility, roles, and submission lifecycle.

contract: Visible section order is `contacts -> trip -> hotel -> appointment -> personal -> passport -> employment`.

contract: Remove the visible sections `files`, `euRelative`, `payment`, and `filler` from the questionnaire. File upload remains in the existing pre-upload/document flow.

contract: `appointment` contains only `appointment-city` and one date-range control backed by range start/end values. Visa type is derived as `Шенгенская`; category is derived as `Normal`.

contract: `contacts` contains country, city, structured street, house, building/corpus, apartment/office/premises, postal code, email, phone, and conditional residence-permit fields. The street input provides local suggestions/autocomplete without adding a network dependency.

contract: The structured address is composed into the legacy `home-address` value for existing export and PDF consumers. Existing legacy address values remain readable and editable without destructive migration.

contract: `personal` hides previous surname behind an explicit optional reveal action beside surname. Guardian data is available through an optional reveal action only when the applicant is under 18. `national-id`, visible nationality, birth citizenship, and other citizenship fields are removed.

contract: Nationality defaults to `Russian Federation`. Birth citizenship derives to `USSR` when birth country is `USSR`, otherwise `Russian Federation`.

contract: `employment` contains only position, employer/school name, employer/school address, and employer/school phone. Existing `occupation` remains the compatibility field for position; the separate `occupation-specify` question is removed from the visible form.

contract: Payment fields are not shown. Existing compatibility values default to `Сам заявитель` and `Наличные`.

contract: For family submissions, each shared section (`contacts`, `trip`, `hotel`) exposes `Копировать для всех`. Contact copying includes the structured home address and excludes email and phone. Trip/hotel copying includes all visible values in that section.

invariant: Copying never mutates personal, passport, employment, email, or phone values of another applicant.

invariant: Hidden/removed fields cannot block completion or count as missing visible questions.

invariant: Changing sections or applicants preserves unsaved local values and does not cause layout jumps or unexpected scroll resets.

invariant: Existing submissions with legacy questionnaire fields remain loadable and exportable.

test: Unit tests cover the simplified blueprint, derived defaults, date interval validation, address composition, minor-only guardian behavior, and family-copy allowlists.

test: Typecheck, lint, focused Vitest, and production build pass.

test: Fresh browser proof covers single and family submissions on desktop and mobile, section/applicant switching, optional reveals, address suggestions, copy-for-all, console errors, and horizontal overflow.

deferred: No external address provider is added in this change. Suggestions use the repository's existing local address/city support; provider-backed address normalization can be added separately if required.

## Implementation choice

Recommended hybrid compatibility approach: simplify the visible production form and introduce structured UI values while continuing to populate legacy canonical fields consumed by exports and PDFs. This avoids a destructive production-data migration and keeps old submissions compatible.

Rejected approach: UI-only hiding without updating validation and defaults. It would leave invisible blockers and incomplete exports.

Rejected approach: immediate replacement of all persisted field IDs. It would require a data migration and expand the release risk beyond the requested questionnaire change.

## Working notes

- Checkout was dirty and had pre-existing unresolved conflicts before this task. Do not edit unrelated conflicted files; report verification blocked by those conflicts separately from questionnaire-specific failures.
- Package Manager: npm (via `package-lock.json`).
- Framework: React 19 + Vite 8.
