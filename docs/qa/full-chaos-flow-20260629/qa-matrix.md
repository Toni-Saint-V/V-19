# Full Chaos Flow QA Matrix - 2026-06-29

Runtime: `http://127.0.0.1:4202/`
Branch: `codex/v19-final-integration-emergency-20260629-073635`
Mode: local/dev auth, isolated Playwright Chromium. In-app Browser backend was unavailable in this session, so browser proof used Playwright screenshots and console/network listeners.

## Scenario Matrix

| ID | Scenario | Status | Severity | Evidence | Notes |
| --- | --- | --- | --- | --- | --- |
| QA-01 | Fresh registration page opens | Pass with visual issue | Medium | `00-login-start.png`, `00-login-empty.png` | Left brand wordmark clips the leading `V` on the auth screen. |
| QA-02 | Agent A submits access request and remains pending | Pass | - | `01-agent-a-register-filled.png`, `01-agent-a-pending-status.png` | Pending user did not enter workspace. |
| QA-03 | Agent B submits access request and remains pending | Pass | - | `02-agent-b-register-filled.png`, `02-agent-b-pending-status.png` | Pending user did not enter workspace. |
| QA-04 | Third candidate is rejected by admin | Pass | - | `03-agent-reject-register-filled.png`, `03-agent-reject-pending-status.png`, `07-rejected-agent-status.png` | Rejected user remains blocked from workspace. |
| QA-05 | Admin login opens approval queue and processes 2 approvals + 1 rejection | Pass | - | `04-admin-review-after-login.png`, `05-admin-access-queue-three-requests.png`, `06-admin-access-queue-after-actions.png` | Queue actions worked in local/dev auth. |
| QA-06 | Approved Agent A enters workspace | Pass | - | `08-agent-a-workspace.png` | Workspace opens after approval. |
| QA-07 | Approved Agent B enters workspace | Pass with limitation | Medium | `09-agent-b-workspace.png`, `10-agent-my-submissions.png` | Local demo data appears shared/seeded, so true two-agent ownership isolation is not proven. |
| QA-08 | Agent sees family + individual submissions across cities and statuses | Pass with logic issue | Medium | `10-agent-my-submissions.png` | Moscow, Kazan, Saint Petersburg, family and single rows are visible. Readiness/status copy is inconsistent in several rows. |
| QA-09 | Family creation flow opens and can switch family mode | Pass | - | `11-create-drawer-open.png`, `12-create-family-mode.png` | Family mode is visible and selected. |
| QA-10 | Family creation without files is blocked | Pass with UX issue | Medium | `13-create-next-without-files.png` | `Дальше` is disabled, but the blocking reason is low-emphasis bottom copy, not an inline per-applicant validation message. |
| QA-11 | Admin review screen opens with mixed cities/statuses | Pass | - | `14-admin-review-mixed-work.png` | Review list includes Moscow, Kazan, Saint Petersburg and ready/error/review states. |
| QA-12 | Admin export screen opens with ready rows and city/agent filters | Pass with export contract issues | Serious | `15-admin-export-screen.png` | Export panel shows `51 mapped`, `3 derived`, `2 unresolved`, while pre-export checks say all 56 columns are confirmed. |
| QA-13 | Generate Excel action | Pass with guard/copy contradiction | Serious | `16-admin-export-after-action.png`, `admin-export-probe.json` | File reaches `Файл сформирован`, but warning says stale preview/row mismatch blocks download. |
| QA-14 | Download Excel action | Pass with guard/copy contradiction | Serious | `18-export-download-attempt.png`, `19-export-download-saved.png`, `visaflow-export-0mwe8ei.xlsx`, `export-download-saved.json` | `Скачать Excel` remains enabled and downloads `visaflow-export-0mwe8ei.xlsx` despite the red blocking warning. |
| QA-15 | Mark exported final action | Pass with residual fail-closed state | - | `20-export-marked-final.png`, `export-marked-final.json` | Selected row moves out of ready list; panel correctly asks to select another row. |
| QA-16 | Mobile export viewport 390px | Pass with density concern | Minor | `17-mobile-export-390.png` | No horizontal overflow (`390/390`), but right-side contract panel becomes very long and action area sits far below the table. |
| QA-17 | Browser console/page/network health during admin/export | Pass | - | `admin-export-probe.json`, `export-download-attempt.json`, `export-marked-final.json` | No captured console errors, page errors, or failed network requests in the export probes. |
| QA-18 | XLSX artifact integrity | Pass | - | `visaflow-export-0mwe8ei.xlsx` | `unzip -t` reported no compressed data errors. |

## Findings

| Finding | Severity | Area | Evidence | Detail | Suggested next step |
| --- | --- | --- | --- | --- | --- |
| VF-QA-001 | Serious | Export contract | `15-admin-export-screen.png`, `16-admin-export-after-action.png` | Export says `Все 56 колонок подтверждены`, but the contract card simultaneously shows `2 unresolved`. This makes the pre-export gate logically untrustworthy. | Align `exportPlan` checks with workbook contract mapping and block generation while unresolved columns remain, or remove the unresolved state if it is only informational. |
| VF-QA-002 | Serious | Export guard/copy | `18-export-download-attempt.png`, `19-export-download-saved.png` | Red warning says stale preview / row mismatch blocks download, but `Скачать Excel` is enabled and downloads a file. | Make the UI state honest: either block the download when mismatch exists, or replace the warning with non-blocking verification copy. |
| VF-QA-003 | Medium | Readiness logic | `10-agent-my-submissions.png` | Rows show full file counts like `9 из 9` or `3 из 3` while readiness remains `50%`, including rows marked ready for export. | Separate document completeness from readiness score and expose the reason for the remaining 50%. |
| VF-QA-004 | Medium | Multi-agent isolation | `08-agent-a-workspace.png`, `09-agent-b-workspace.png`, `10-agent-my-submissions.png` | Two approved agents can log in, but local seeded workspace does not prove ownership isolation because visible submission data is shared. | Add Supabase-backed or explicit owner-filtered E2E proof for two agents before claiming production-safe isolation. |
| VF-QA-005 | Medium | Registration visual | `00-login-start.png`, `00-login-empty.png` | The auth hero brand reads like `isaFlow`; the logo block overlaps/clips the leading `V`. | Adjust auth brand spacing/logo layout and recapture desktop + mobile auth screenshots. |
| VF-QA-006 | Medium | Create flow UX | `13-create-next-without-files.png` | Family/no-file block works, but the disabled reason is easy to miss and not attached to the applicant/file controls. | Add inline validation for each required applicant passport file and keep the bottom summary as secondary copy. |
| VF-QA-007 | Minor | Mobile export UX | `17-mobile-export-390.png` | Mobile export has no horizontal overflow, but the contract panel is extremely tall and pushes actions deep into the page. | Consider collapsible contract sections on mobile after preserving the fail-closed checks. |

## Visual Score

Overall visual score from this pass: 82/100.

- Auth/registration: 76/100. Strong dark premium mood, but the clipped `VisaFlow` wordmark is a visible first-screen defect.
- Agent workspace: 86/100. Dense, readable, visually consistent with Visual Lock. Logic labels reduce trust more than styling.
- Create family flow: 80/100. Clean and stable, but disabled-state explanation is too quiet.
- Admin review: 88/100. Strong scan density and hierarchy; icon rail is usable in this viewport.
- Export desktop: 82/100. Good information density, but contradictory red warning and contract states harm confidence.
- Export mobile: 78/100. No horizontal overflow, but vertical density and action discoverability need another pass.

## Proof Files

- `00-login-start.png`
- `01-agent-a-register-filled.png`
- `02-agent-b-register-filled.png`
- `03-agent-reject-register-filled.png`
- `05-admin-access-queue-three-requests.png`
- `06-admin-access-queue-after-actions.png`
- `07-rejected-agent-status.png`
- `08-agent-a-workspace.png`
- `09-agent-b-workspace.png`
- `10-agent-my-submissions.png`
- `13-create-next-without-files.png`
- `14-admin-review-mixed-work.png`
- `15-admin-export-screen.png`
- `16-admin-export-after-action.png`
- `17-mobile-export-390.png`
- `18-export-download-attempt.png`
- `19-export-download-saved.png`
- `20-export-marked-final.png`
- `visaflow-export-0mwe8ei.xlsx`
