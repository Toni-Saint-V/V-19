---
paths:
  - "src/lib/**"
  - "src/types/**"
  - "src/services/**"
  - "src/modules/submissions/**"
  - "tests/**"
---

# V-19 Domain Scope

- `Submission` is the primary entity.
- Allowed submission types are `single` and `family`.
- Allowed roles are `agent` and `admin`.
- Spain is fixed metadata: `countryCode: "ES"` and `countryLabel: "Испания"`.
- Agent primary surfaces are `My submissions` and `Submission drawer`.
- Admin primary surfaces are `Review`, `Export`, `Submission drawer`, and `Excel preview`.
- Do not add CRM, People, Families, Groups, dashboards, AI checker, AI filters, board view, saved filters, legal promise screens, or multi-country selection as primary V-19 surfaces.
- Statuses, transitions, permissions, readiness, issue lifecycle, and export eligibility belong in domain/use-case code, not React components.
- `requiresAction` is derived operational state.
- Blocking issues in `open` or `fixed_by_agent` block acceptance.
- Export must fail closed, and preview/workbook rows must share one model.
