# Questionnaire save failure loop — Tasks

## Traceability

| Requirement | Tasks |
|---|---|
| US-1.1, US-1.2 | T-1, T-2 |
| US-1.3, US-1.4, US-1.5 | T-1, T-2 |
| US-1.6 | T-3 |

### T-1: Add save-loop regression coverage

- **Status**: completed
- **Wired**: n/a
- **Verified**: yes
- **Requirements**: US-1
- **Description**: Reproduce rejected save for a questionnaire opened on a focused field, then refresh the submission identity and advance autosave timers.
- **Acceptance**:
  - Test fails on pre-fix `HEAD` because the same revision is saved more than once.
  - Test covers explicit Retry and a new user edit as the only allowed recovery triggers.
- **Dependencies**: none

### T-2: Guard background autosave by failed revision

- **Status**: completed
- **Wired**: yes
- **Verified**: yes
- **Requirements**: US-1
- **Description**: Track the rejected current revision in `FigmaQuestionnaireScreen` and prevent timer/pagehide autosave from retrying it.
- **Acceptance**:
  - Parent render and refreshed `submission` identity do not create another request.
  - Explicit Retry performs one request.
  - A new edit increments revision and restores autosave.
  - Existing save serialization tests remain green.
- **Dependencies**: T-1

### T-3: Verify canonical and regression boundaries

- **Status**: completed
- **Wired**: n/a
- **Verified**: yes
- **Requirements**: US-1
- **Description**: Run focused questionnaire tests, typecheck, full unit/integration baseline comparison, and review the scoped diff.
- **Acceptance**:
  - New regression test passes.
  - No new failures beyond the recorded baseline.
  - Diff is limited to the spec, questionnaire lifecycle, and its test.
- **Dependencies**: T-2

### T-4: Run Praxis review

- **Status**: completed
- **Wired**: n/a
- **Verified**: yes
- **Requirements**: US-1
- **Description**: Review spec match, tests, edge cases, security, and scope using `BLOCK/FIX/NIT`.
- **Acceptance**:
  - No unresolved BLOCK.
  - FIX items are resolved or explicitly deferred.
- **Dependencies**: T-3
