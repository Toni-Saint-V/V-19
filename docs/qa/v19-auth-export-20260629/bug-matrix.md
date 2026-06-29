# V-19 Auth / Export QA Matrix

Date: 2026-06-29

| Area | Scenario | Finding | Status | Evidence |
| --- | --- | --- | --- | --- |
| Registration | Pending agent tries to enter workspace | Pending request must stay outside agent/admin app until admin approval. | Fixed / verified | `v19-registration-admin-approval.spec.ts` passed |
| Registration | Two approved local agents | Approved local agents used shared default owner, leaking seeded workspace rows. | Fixed / verified | E2E asserts distinct `ownerAgentId` and no `Семья Ивановых` leak |
| Registration UI | Login wordmark | Active runtime still rendered `isaFlow19` in the registration hero. | Fixed / verified | `login-desktop.png`, runtime text `VisaFlow19` |
| Create flow | Family passport upload | `Дальше` could become enabled from a file error instead of accepted passports. | Fixed / verified | `createSubmissionDrawer.spec.tsx`, create family desktop/mobile e2e passed |
| Create flow UX | Multiple applicants | Missing passport state was too implicit per applicant. | Fixed / verified | Per-applicant readiness labels added |
| Export contract | Mapping audit | UI hardcoded `2 unresolved` while contract actually maps all 56 columns. | Fixed / verified | `53 mapped · 3 derived · 0 unresolved`, `v19SubmissionRules.spec.ts` |
| Export UI | Ready package callout | Ready export package used red blocker styling/copy. | Fixed / verified | `export-desktop.png`, `export-mobile.png` |
| Export UI | Ready/exported completeness | Ready/exported rows could show confusing raw percent. | Fixed / verified | Non-percent readiness labels supported in collection row |
| Admin drawer | Manual issue creation | New drawer lost visible city/agent metadata and generic add-issue entry. | Fixed / verified | `adminReviewDrawer.spec.tsx` |
| Admin drawer | Issue target list | Remark form offered non-canonical `Документ` target. | Fixed / verified | `adminReviewDrawer.spec.tsx` |
| E2E suite | Legacy app-smoke export selectors | Old smoke tests time out on stale `Новая подача` / `Данные` selectors after UI branch changes. | Not fixed | Playwright traces in `test-results/`; newer create/export-adjacent checks used |
| E2E suite | Release ops heading | `v19-release-ops-lists-export-flow` expects old admin heading `Работа`. | Not fixed | Failure captured in Playwright output |
| Visual | Export desktop/mobile | No obvious overlap; mobile export rail stacks under list; overflow is 0. | Verified | `export-desktop.png`, `export-mobile.png` |
