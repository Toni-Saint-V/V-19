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

function submittedReports() {
  return [
    "A1-F6",
    "A1-S1",
    "A1-S2",
    "A1-S3",
    "A2-F6",
    "A2-S1",
    "A2-S2",
    "A2-S3",
    "A3-F6",
    "A3-S1",
    "A3-S2",
    "A3-S3",
  ].map((caseKey) => ({
    caseKey,
    stage: caseKey === "A1-F6" ? "exported" : "submitted",
    status: caseKey === "A1-F6" ? "exported" : "waiting_review",
  }));
}

describe("production cohort final gate", () => {
  test("rejects a remote-only case even when all expected cases were discovered", () => {
    const reports = submittedReports();
    reports[0] = { caseKey: "A1-F6", stage: "remote_only", status: "waiting_review" };

    expect(
      productionCohortFinalGate({
        expectedCaseCount: 12,
        reports,
        totals: exactTotals,
      }),
    ).toBe(false);
  });

  test("requires exact aggregate projections and the expected terminal lifecycle", () => {
    const reports = submittedReports();

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

  test("rejects an exported status for a non-terminal cohort case", () => {
    const reports = submittedReports();
    reports[1] = { caseKey: "A1-S1", stage: "exported", status: "exported" };

    expect(
      productionCohortFinalGate({
        expectedCaseCount: 12,
        reports,
        totals: exactTotals,
      }),
    ).toBe(false);
  });
});
