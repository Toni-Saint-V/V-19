import { describe, expect, test } from "vitest";

import {
  productionCohortExpectedFinalTotals,
  productionCohortFinalGate,
} from "../../scripts/lib/production-cohort-final-gate.mjs";

const exactTotals = {
  ...productionCohortExpectedFinalTotals,
  blankAnswers: 0,
  populatedAnswers: productionCohortExpectedFinalTotals.answers,
  storageReadable: productionCohortExpectedFinalTotals.media,
};

describe("production cohort final gate", () => {
  test("rejects a remote-only case even when all expected cases were discovered", () => {
    const reports = Array.from({ length: 12 }, (_, index) => ({
      stage: index === 0 ? "remote_only" : "submitted",
      status: "waiting_review",
    }));

    expect(
      productionCohortFinalGate({
        expectedCaseCount: 12,
        reports,
        totals: exactTotals,
      }),
    ).toBe(false);
  });

  test("requires exact aggregate projections and submitted checkpoint stages", () => {
    const reports = Array.from({ length: 12 }, () => ({
      stage: "submitted",
      status: "waiting_review",
    }));

    expect(
      productionCohortFinalGate({
        expectedCaseCount: 12,
        reports,
        totals: { ...exactTotals, answers: exactTotals.answers - 1 },
      }),
    ).toBe(false);
    expect(
      productionCohortFinalGate({
        expectedCaseCount: 12,
        reports,
        totals: exactTotals,
      }),
    ).toBe(true);
  });
});
