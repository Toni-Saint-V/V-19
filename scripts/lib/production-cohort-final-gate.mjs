export const productionCohortExpectedFinalTotals = Object.freeze({
  answers: 2079,
  applicants: 27,
  documents: 81,
  legacyFiles: 0,
  media: 81,
  submissions: 12,
});

const lifecycleByCase = Object.freeze([
  ["A1-F6", { stage: "exported", status: "exported" }],
  ["A1-S1", { stage: "ready_for_export", status: "ready_for_excel" }],
  ["A1-S2", { stage: "submitted", status: "waiting_review" }],
  ["A1-S3", { stage: "submitted", status: "waiting_review" }],
  ["A2-F6", { stage: "submitted", status: "waiting_review" }],
  ["A2-S1", { stage: "submitted", status: "waiting_review" }],
  ["A2-S2", { stage: "submitted", status: "waiting_review" }],
  ["A2-S3", { stage: "submitted", status: "waiting_review" }],
  ["A3-F6", { stage: "submitted", status: "waiting_review" }],
  ["A3-S1", { stage: "submitted", status: "waiting_review" }],
  ["A3-S2", { stage: "submitted", status: "waiting_review" }],
  ["A3-S3", { stage: "submitted", status: "waiting_review" }],
]);

const postExportLifecycle = new Map(
  lifecycleByCase.map(([caseKey, expected]) =>
    caseKey === "A1-S1"
      ? [caseKey, { stage: "exported", status: "exported" }]
      : [caseKey, expected],
  ),
);

const preExportA2S1Lifecycle = new Map(
  [...postExportLifecycle].map(([caseKey, expected]) =>
    caseKey === "A2-S1"
      ? [caseKey, { stage: "ready_for_export", status: "ready_for_excel" }]
      : [caseKey, expected],
  ),
);

const expectedLifecycleByPhase = new Map([
  ["pre_export", new Map(lifecycleByCase)],
  ["post_export", postExportLifecycle],
  ["pre_export_a2_s1", preExportA2S1Lifecycle],
  [
    "post_export_a2_s1",
    new Map(
      [...postExportLifecycle].map(([caseKey, expected]) =>
        caseKey === "A2-S1"
          ? [caseKey, { stage: "exported", status: "exported" }]
          : [caseKey, expected],
      ),
    ),
  ],
  [
    "all_submitted",
    new Map(
      lifecycleByCase.map(([caseKey]) => [
        caseKey,
        { stage: "submitted", status: "waiting_review" },
      ]),
    ),
  ],
  [
    "family_export_proof",
    new Map(
      lifecycleByCase.map(([caseKey]) => [
        caseKey,
        caseKey === "A1-F6"
          ? { stage: "exported", status: "exported" }
          : { stage: "submitted", status: "waiting_review" },
      ]),
    ),
  ],
]);

export function productionCohortFinalGate({
  expectedCaseCount,
  expectedLifecyclePhase = "pre_export",
  reports,
  totals,
}) {
  const expected = productionCohortExpectedFinalTotals;
  const expectedLifecycle = expectedLifecycleByPhase.get(expectedLifecyclePhase);
  const exactExpectedLifecycle =
    expectedLifecycle !== undefined &&
    expectedCaseCount === expectedLifecycle.size &&
    reports.length === expectedCaseCount &&
    new Set(reports.map((report) => report.caseKey)).size === expectedCaseCount &&
    reports.every((report) => {
      const expectedCase = expectedLifecycle.get(report.caseKey);
      return (
        expectedCase !== undefined &&
        report.stage === expectedCase.stage &&
        report.status === expectedCase.status
      );
    });
  const exactFinalTotals =
    totals.answers === expected.answers &&
    totals.applicants === expected.applicants &&
    totals.documents === expected.documents &&
    totals.legacyFiles === expected.legacyFiles &&
    totals.media === expected.media &&
    totals.storageReadable === expected.media;

  return exactExpectedLifecycle && exactFinalTotals;
}
