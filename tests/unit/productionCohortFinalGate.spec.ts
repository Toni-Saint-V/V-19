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
    stage:
      caseKey === "A1-F6"
        ? "exported"
        : caseKey === "A1-S1"
          ? "ready_for_export"
          : "submitted",
    status:
      caseKey === "A1-F6"
        ? "exported"
        : caseKey === "A1-S1"
          ? "ready_for_excel"
          : "waiting_review",
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

  test("rejects a lifecycle outside the exact per-case production contract", () => {
    const reports = submittedReports();
    reports[1] = { caseKey: "A1-S1", stage: "exported", status: "exported" };

    expect(
      productionCohortFinalGate({
        expectedCaseCount: 12,
        reports,
        totals: exactTotals,
      }),
    ).toBe(false);

    reports[1] = {
      caseKey: "A1-S1",
      stage: "ready_for_export",
      status: "accepted",
    };
    expect(
      productionCohortFinalGate({
        expectedCaseCount: 12,
        reports,
        totals: exactTotals,
      }),
    ).toBe(false);

    reports[1] = { caseKey: "A1-S1", stage: "submitted", status: "waiting_review" };
    expect(
      productionCohortFinalGate({
        expectedCaseCount: 12,
        reports,
        totals: exactTotals,
      }),
    ).toBe(false);

    reports[1] = {
      caseKey: "A1-S2",
      stage: "ready_for_export",
      status: "ready_for_excel",
    };
    expect(
      productionCohortFinalGate({
        expectedCaseCount: 12,
        reports,
        totals: exactTotals,
      }),
    ).toBe(false);
  });

  test("allows the separately declared terminal state only after A1-S1 export", () => {
    const reports = submittedReports();
    reports[1] = { caseKey: "A1-S1", stage: "exported", status: "exported" };

    expect(
      productionCohortFinalGate({
        expectedCaseCount: 12,
        expectedLifecyclePhase: "pre_export",
        reports,
        totals: exactTotals,
      }),
    ).toBe(false);
    expect(
      productionCohortFinalGate({
        expectedCaseCount: 12,
        expectedLifecyclePhase: "post_export",
        reports,
        totals: exactTotals,
      }),
    ).toBe(true);
    expect(
      productionCohortFinalGate({
        expectedCaseCount: 12,
        expectedLifecyclePhase: "unknown" as never,
        reports,
        totals: exactTotals,
      }),
    ).toBe(false);
  });

  test("allows only the declared A2-S1 terminal state in the named final phase", () => {
    const reports = submittedReports();
    reports[1] = { caseKey: "A1-S1", stage: "exported", status: "exported" };
    reports[5] = { caseKey: "A2-S1", stage: "exported", status: "exported" };

    expect(
      productionCohortFinalGate({
        expectedCaseCount: 12,
        expectedLifecyclePhase: "post_export",
        reports,
        totals: exactTotals,
      }),
    ).toBe(false);
    expect(
      productionCohortFinalGate({
        expectedCaseCount: 12,
        expectedLifecyclePhase: "post_export_a2_s1",
        reports,
        totals: exactTotals,
      }),
    ).toBe(true);
  });

  test("allows only the declared A2-S1 pre-export state in its named phase", () => {
    const reports = submittedReports();
    reports[1] = { caseKey: "A1-S1", stage: "exported", status: "exported" };
    reports[5] = {
      caseKey: "A2-S1",
      stage: "ready_for_export",
      status: "ready_for_excel",
    };

    expect(
      productionCohortFinalGate({
        expectedCaseCount: 12,
        expectedLifecyclePhase: "post_export",
        reports,
        totals: exactTotals,
      }),
    ).toBe(false);
    expect(
      productionCohortFinalGate({
        expectedCaseCount: 12,
        expectedLifecyclePhase: "pre_export_a2_s1",
        reports,
        totals: exactTotals,
      }),
    ).toBe(true);

    reports[6] = {
      caseKey: "A2-S2",
      stage: "ready_for_export",
      status: "ready_for_excel",
    };
    expect(
      productionCohortFinalGate({
        expectedCaseCount: 12,
        expectedLifecyclePhase: "pre_export_a2_s1",
        reports,
        totals: exactTotals,
      }),
    ).toBe(false);
  });

  test("rejects arbitrary terminal drift in the A2-S1 final phase", () => {
    const reports = submittedReports();
    reports[1] = { caseKey: "A1-S1", stage: "exported", status: "exported" };
    reports[5] = { caseKey: "A2-S1", stage: "exported", status: "exported" };
    reports[6] = { caseKey: "A2-S2", stage: "exported", status: "exported" };

    expect(
      productionCohortFinalGate({
        expectedCaseCount: 12,
        expectedLifecyclePhase: "post_export_a2_s1",
        reports,
        totals: exactTotals,
      }),
    ).toBe(false);
  });
});
