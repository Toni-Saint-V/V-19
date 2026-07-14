export const productionCohortExpectedFinalTotals = Object.freeze({
  answers: 2079,
  applicants: 27,
  documents: 81,
  legacyFiles: 0,
  media: 81,
  submissions: 12,
});

const exportedCohortCaseKeys = new Set(["A1-F6"]);

export function productionCohortFinalGate({
  expectedCaseCount,
  reports,
  totals,
}) {
  const expected = productionCohortExpectedFinalTotals;
  const exactExpectedLifecycle =
    reports.length === expectedCaseCount &&
    reports.every((report) =>
      exportedCohortCaseKeys.has(report.caseKey)
        ? report.stage === "exported" && report.status === "exported"
        : report.stage === "submitted" && report.status === "waiting_review",
    );
  const exactFinalTotals =
    totals.answers === expected.answers &&
    totals.applicants === expected.applicants &&
    totals.documents === expected.documents &&
    totals.legacyFiles === expected.legacyFiles &&
    totals.media === expected.media &&
    totals.storageReadable === expected.media;

  return exactExpectedLifecycle && exactFinalTotals;
}
