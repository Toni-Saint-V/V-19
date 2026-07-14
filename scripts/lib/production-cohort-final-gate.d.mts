export type ProductionCohortFinalTotals = {
  answers: number;
  applicants: number;
  documents: number;
  legacyFiles: number;
  media: number;
  submissions: number;
};

export const productionCohortExpectedFinalTotals: Readonly<ProductionCohortFinalTotals>;

export function productionCohortFinalGate(input: {
  expectedCaseCount: number;
  reports: Array<{ caseKey: string; stage: string; status: string }>;
  totals: ProductionCohortFinalTotals & { storageReadable: number };
}): boolean;
