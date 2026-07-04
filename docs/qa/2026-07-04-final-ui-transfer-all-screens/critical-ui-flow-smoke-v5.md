# Critical UI Flow Smoke v5

Run id: `20260704-174426-MSK-31f9d5cd`

Status: `BLOCKED_NOT_RUN_TO_PASS`

Reason:

- UI/Logic agents have not both reported `READY_FOR_QA_RETEST`.
- Latest existing checklist evidence, `final-checklist-qa.json`, reports `6` browser/click failures.
- Current `npm run test` fails on the passport extraction guard regression.
- Current `npm run lint` fails on extracted reference source under `docs/References/perfect_extracted`.

Current gate result:

| Gate | Result |
|---|---|
| `npm run typecheck` | PASS |
| `npm run lint` | FAIL |
| `npm run test` | FAIL |
| `npm run build` | PASS |
| Fresh final browser/click QA on `5174` | NOT RUN - blocked by failing preconditions |

Required retest:

- Agent: login, navigate Agent screens, open drawer, verify questionnaire/files/issues tabs, verify required media slots, create drawer, submit gating, mobile menu, no overflow.
- Admin: login, navigate Admin screens, open review drawer, verify tabs, add/return/accept/export flows, tablet/mobile Review blocker, mobile menu, no overflow.
- Responsive: `1440x900`, `768x1024`, `390x844`.

Verdict: `NO MERGE`
