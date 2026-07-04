# Final UI Transfer QA Report

## Lead QA Gate Update - 20260704-174426-MSK-31f9d5cd

Current verdict: `NO MERGE`.

This report's earlier pass language is superseded by newer evidence and current verification:

- `final-checklist-qa.json` was generated after `all-screens-browser-qa-v4.json` and reports `6` click/browser failures.
- `npm run typecheck`: passed in this run.
- `npm run lint`: failed because `docs/References/perfect_extracted/visaflow_top_product/src/components/*.tsx` is scanned by ESLint and contains reference-app lint errors.
- `npm run test`: failed in `tests/unit/v19SubmissionRules.spec.ts` because the current `passportExtractionGuards.ts` edit allows submission where the test expects `Скан паспорта не проверен.`
- `npm run build`: passed with existing Vite warnings.

Commit gate: `NO`.

Next required state before final QA: UI Agent fixes/reports the drawer/admin click failures, Logic Agent fixes/reports the passport guard regression, then Lead QA reruns browser/click QA on `5174` and all npm gates.

## Scope

Final UI transfer from `docs/References/Perfect.zip` and the old Linear-style baseline into the real V-19 product UI.

`Perfect.zip` was the local source archive for this pass. The committed reference evidence is the extracted source/docs subset plus the mapping notes in this QA folder; the 41 MB archive itself remains a local input artifact.

This pass focused on:

- reference audit and mapping;
- domain/status audit;
- single-instance shell/nav/UI system;
- Admin Review responsive blocker;
- Agent/Admin screen click QA;
- typecheck/build/test/verifier gates;
- browser proof on `http://127.0.0.1:5174/`.

## Runtime Proof

Port `5174` was verified as serving this checkout:

- PID: `72610`
- cwd: `/Users/user/.codex/worktrees/94fc/V-19`
- `curl -I http://127.0.0.1:5174/`: `HTTP/1.1 200 OK`

## Commands Run

- `ls -lah docs/References/Perfect.zip`
- `unzip -l docs/References/Perfect.zip | sed -n '1,240p'`
- `unzip -oq docs/References/Perfect.zip -d docs/References/perfect_extracted -x '*/node_modules/*'`
- `npm run typecheck`
- `npm run build`
- `npm run test`
- `npm run verify:agent-screen-system`
- `npm run verify:v19-boundary`
- Playwright browser QA on `5174`, final artifact: `all-screens-browser-qa-v4.json`

## Historical Verification Results Superseded By Lead QA Update

- Historical `npm run typecheck`: passed.
- Historical `npm run build`: passed.
- Historical `npm run test`: passed, `54` files and `497` tests.
- Historical `npm run verify:agent-screen-system`: passed.
- Historical `npm run verify:v19-boundary`: passed, `79` runtime files checked.
- Historical Browser QA v4: passed with `0` failures, `0` page overflows, `0` console/page errors.

Current Lead QA result is different and supersedes this section: `typecheck` passed, `lint` failed, `test` failed, `build` passed, and final browser QA is blocked.

Build warnings observed:

- Vite chunk-size warning.
- `src/shared/authRegistration.ts` dynamic import warning because it is also statically imported elsewhere.
- `visaflow-css-runtime-split` plugin timing warning.

These warnings did not fail the build and were not introduced as release blockers by this task.

## Screenshots

Final screenshots use the `v4-` prefix and cover:

- Agent/Admin desktop.
- Agent/Admin tablet.
- Agent/Admin mobile.
- Inbox/actions/review/submissions/export/settings.
- Agent create drawer.
- Agent submission drawer.
- Admin review drawer.

## Admin Review Blocker

Fixed issues:

- compact hidden right rail no longer reserves a grid track at tablet/compact desktop widths;
- review row action remains clickable on tablet/mobile;
- radar cards no longer clip on mobile;
- admin tabs wrap on mobile instead of hiding the final state;
- no document-level horizontal overflow remains.

Fresh proof:

- `v4-tablet-admin-review.png`
- `v4-mobile-admin-review.png`
- `v4-tablet-admin-drawer.png`
- `v4-mobile-admin-drawer.png`

## Product Logic Notes

Domain source of truth remains current V-19:

- `src/modules/submissions/domainContract.ts`
- `src/modules/submissions/domainEngine.ts`
- `src/modules/submissions/status.ts`
- `src/modules/submissions/types.ts`
- `src/modules/submissions/uiTypes.ts`

Confirmed:

- allowed submission types remain `single` and `family`;
- no `group` type was introduced;
- canonical statuses remain normalized through existing helpers;
- drawer/files/issues/questionnaire stay inside submission/applicant context;
- MVP appointment readiness remains based on `passport_scan`, `selfie`, and `selfie_2`;
- export remains fail-closed through current export rules.

## Final Status Superseded By Lead QA Update

Hard gates do not currently pass.

Commit gate: `NO`.

Remaining blocking risks: current lint failure, current unit test failure, latest checklist browser/click failures, and no fresh passing v5 browser QA.
