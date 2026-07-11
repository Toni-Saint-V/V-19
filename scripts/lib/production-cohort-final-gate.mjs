export const productionCohortExpectedFinalTotals = Object.freeze({
  answers: 2079,
  applicants: 27,
  documents: 81,
  legacyFiles: 0,
  media: 81,
  submissions: 12,
});

export function productionCohortFinalGate({
  expectedCaseCount,
  reports,
  totals,
}) {
  const expected = productionCohortExpectedFinalTotals;
  const allCheckpointCasesSubmitted =
    reports.length === expectedCaseCount &&
    reports.every(
      (report) => report.stage === "submitted" && report.status === "waiting_review",
    );
  const exactFinalTotals =
    totals.answers === expected.answers &&
    totals.applicants === expected.applicants &&
    totals.documents === expected.documents &&
    totals.legacyFiles === expected.legacyFiles &&
    totals.media === expected.media &&
    totals.storageReadable === expected.media;

  return allCheckpointCasesSubmitted && exactFinalTotals;
}
