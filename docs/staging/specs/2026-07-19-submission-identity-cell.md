# Submission identity cell

target: shared submission identity block used inside operational list and board cells

outcome: every migrated cell renders one stable identity hierarchy: public number and optional family-size tag above, surname/name as one unbroken primary label, and optional city with an icon below

## Decisions

approach: add one tokenized `V19SubmissionIdentity` primitive in `src/shared/ui/v19-design-system.tsx`; do not solve the active row with screen-local markup or duplicate CSS

contract: `publicId: string`, `title: string`, `peopleCount: number`, `city?: string`, `tripDates?: string`, `className?: string`

rendering:

- public ID is always rendered as the first compact tag;
- people tag is rendered only when `peopleCount > 1`;
- ID, people, and action-status tags share one fluid `20–22px` height, dark elevated fill, selected-border outline, and one larger muted middle-dot separator with explicit spacing;
- title is rendered as the primary identity line and does not split away from its metadata block;
- city is optional and, when present, renders below the title at `10px` with a compact `9px` Lucide `MapPin` and a tight icon-to-label gap;
- the optional trip date uses the same compact route-metadata treatment with a Lucide calendar icon; below `1200px` it renders only day plus month (`DD.MM`), while the widest desktop column renders one full date (`DD.MM.YYYY`) or `Дата не указана`, never a range;
- optional action context such as `Добавить селфи 1` is removed from the identity stack and rendered as an ID-style compact tag at the bottom-left of the row, opposite the bottom-right CTA;
- the primitive uses non-interactive inline markup so it remains valid inside clickable rows and cards;
- screen components pass data only and do not restyle the identity hierarchy locally.

responsive invariant: the metadata row may stay compact; below `1200px` optional city and trip dates remain inside the identity container, while desktop action rows render the same shared primitives in dedicated city and date columns; long titles truncate or wrap intentionally without page-level overflow

composition invariant: below `1200px` the `Нужно заполнить` / `Нужно добавить` status tag remains in the upper-right corner and optional action context remains opposite the CTA; from `1200px` the row becomes one strict horizontal grid containing only identity, city, full trip date, action-status tag, and CTA, while context and document-type badges are hidden; the queue heading renders on one line as `Очередь действий {count}`

typography invariant: the title uses `--v19b-weight-control` (`500`), `--v19b-size-14` on mobile/tablet, and `--v19b-size-14-5` from `1024px`

accessibility invariant: the people tag has a Russian accessible label; decorative icons are hidden from assistive technology; hiding the tag for one person does not remove the person name or submission number

integration scope:

- replace the custom identity markup in active `CommandCenter` / `Мои действия` rows;
- keep desktop `Мои действия` city and trip dates in their own evenly spaced grid columns while hiding those duplicate columns below `1200px`;
- reuse the same primitive inside shared action list and action board cells where the required data already exists;
- keep row click, CTA, status, sorting, filtering, and drawer behavior unchanged;
- preserve the current title-only `V19PriorityHero` implementation on `Мои действия`, keeping the blocker action intact.

test:

- component render proof for people counts `1` and `2`, with and without city;
- `Мои действия` row proof that ID, family tag, title, and city use the shared primitive and the optional context tag stays opposite the CTA;
- desktop and mobile computed/rendered checks with no overlap or horizontal overflow;
- `npm run typecheck` and `npm run build:supabase-production` pass.

deferred: migrate screen-specific applicant, export, drawer, and legacy submission-card identity markup only during their own screen-by-screen convergence pass; the shared primitive is the required target for those migrations

## Working notes

Rejected: CSS-only repair of `.v19-legacy-action-labels`; it would preserve duplicate markup and would not establish a reusable contract.

Rejected: immediate repository-wide replacement of every name/ID occurrence; the checkout contains unrelated dirty work and a broad migration would violate the active scope lock.
