# 95+ Readiness Rubric

Use this rubric before final verdicts and `-ux` reviews.

Score:

- 70-79: useful local progress, but weak proof, fragile UX, or unclear architecture.
- 80-89: solid scoped implementation with targeted verification.
- 90-94: production-leaning, reviewed, reusable, and visually checked.
- 95+: premium, reusable, verified, review-clean, and ready for the next product step.

Required for 95+:

- Clear bounded goal.
- No unrelated churn.
- Reusable architecture.
- Performance budget passes when runtime output changed.
- Concurrency is intentional and deterministic.
- Animations are lightweight and reduced-motion safe.
- New screens/redesigns have a visually inspected HTML prototype before React implementation.
- Security and dependency risk are checked for release-facing work.
- AI behavior is bounded, explainable, and trust-safe.
- Trust-safe copy and behavior.
- Desktop and mobile UI proof when visible UI changed.
- Browser or Computer Use evidence for premium UI claims.
- `npm run verify` passes.
- `npm run test:e2e` passes when UI/runtime changed.
- Review findings fixed or rejected with source evidence.
- Rollback path is obvious from git diff or branch/worktree.

If any item is missing, report the highest honest score below 95 and name the single next task that would raise it.
