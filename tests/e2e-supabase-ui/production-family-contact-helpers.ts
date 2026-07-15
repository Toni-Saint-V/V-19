import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

import {
  PRODUCTION_PROJECT_REF,
  buildProductionCohortPlan,
  loadCohortResumeState,
  requiredProductionRunMarker,
  type ProductionCohortCase,
} from "./production-cohort-helpers";

export const REQUIRED_PRODUCTION_FAMILY_CONTACT_WRITE_UNLOCK =
  "I_APPROVE_A2_F6_A3_F6_FAMILY_CONTACT_REMEDIATION";

export const PRODUCTION_FAMILY_CONTACT_CASE_KEYS = ["A2-F6", "A3-F6"] as const;

export type ProductionFamilyContactCaseKey =
  (typeof PRODUCTION_FAMILY_CONTACT_CASE_KEYS)[number];

export type ProductionFamilyContactStage =
  | "pending_review"
  | "adding_issue"
  | "issue_added"
  | "returning"
  | "returned"
  | "correcting_emails"
  | "marking_issue_fixed"
  | "agent_fixed"
  | "resubmitting"
  | "resubmitted"
  | "verified";

export type ProductionFamilyContactState = {
  case: {
    caseKey: ProductionFamilyContactCaseKey;
    ownerKey: string;
    submissionId: string;
  };
  nextApplicantIndex: number;
  projectRef: typeof PRODUCTION_PROJECT_REF;
  runMarker: string;
  schemaVersion: 1;
  stage: ProductionFamilyContactStage;
  updatedAt: string;
};

const stages = new Set<ProductionFamilyContactStage>([
  "pending_review",
  "adding_issue",
  "issue_added",
  "returning",
  "returned",
  "correcting_emails",
  "marking_issue_fixed",
  "agent_fixed",
  "resubmitting",
  "resubmitted",
  "verified",
]);

function invariant(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
export function requiredProductionFamilyContactCaseKey(): ProductionFamilyContactCaseKey {
  const caseKey = process.env.V19_PRODUCTION_COHORT_CASE_KEY?.trim();
  invariant(
    PRODUCTION_FAMILY_CONTACT_CASE_KEYS.includes(
      caseKey as ProductionFamilyContactCaseKey,
    ),
    "V19_PRODUCTION_COHORT_CASE_KEY must be exactly A2-F6 or A3-F6.",
  );
  return caseKey as ProductionFamilyContactCaseKey;
}

export function assertProductionFamilyContactWriteUnlock() {
  const caseKey = requiredProductionFamilyContactCaseKey();
  invariant(
    process.env.SUPABASE_PRODUCTION_E2E_UNLOCK === "1",
    "SUPABASE_PRODUCTION_E2E_UNLOCK=1 is required.",
  );
  invariant(
    process.env.V19_PRODUCTION_FAMILY_CONTACT_WRITE_UNLOCK ===
      REQUIRED_PRODUCTION_FAMILY_CONTACT_WRITE_UNLOCK,
    "The dedicated family-contact production write unlock is absent.",
  );
  invariant(
    process.env.V19_PRODUCTION_FAMILY_CONTACT_CONFIRM_CASE_KEY === caseKey,
    "The family-contact case-key confirmation is absent or wrong.",
  );
  invariant(
    process.env.V19_PRODUCTION_COHORT_CONFIRM_PROJECT_REF ===
      PRODUCTION_PROJECT_REF,
    "The family-contact production project-ref confirmation is absent or wrong.",
  );
}

export function productionFamilyContactStatePath(
  runMarker: string,
  caseKey: ProductionFamilyContactCaseKey,
) {
  return resolve(
    process.cwd(),
    `.production-family-contact-${runMarker}-${caseKey}.state.local.json`,
  );
}

async function readJson<T>(path: string): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch {
    throw new Error(`Required family-contact JSON is missing or invalid: ${path}`);
  }
}

async function writeJsonAtomic(path: string, value: unknown) {
  await mkdir(dirname(path), { recursive: true });
  const temporaryPath = `${path}.${process.pid}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, {
    mode: 0o600,
  });
  await rename(temporaryPath, path);
}

function validateCohortCase(
  runMarker: string,
  caseKey: ProductionFamilyContactCaseKey,
  cohortCase: ProductionCohortCase | undefined,
  checkpoint:
    | { caseMarker: string; stage: string; submissionId?: string }
    | undefined,
) {
  invariant(
    cohortCase?.caseKey === caseKey &&
      cohortCase.type === "family" &&
      cohortCase.applicantCount === 6,
    `${caseKey} is not the exact six-person technical family case.`,
  );
  invariant(
    checkpoint?.stage === "submitted" && checkpoint.submissionId,
    `${caseKey} must remain at the submitted cohort checkpoint before remediation.`,
  );
  invariant(
    checkpoint.caseMarker === `${runMarker}-${caseKey}` &&
      checkpoint.caseMarker === cohortCase.caseMarker,
    `${caseKey} checkpoint marker mismatch.`,
  );
  return {
    caseKey,
    ownerKey: cohortCase.ownerKey,
    submissionId: checkpoint.submissionId,
  };
}

function validateStoredState(
  state: ProductionFamilyContactState,
  expected: ProductionFamilyContactState["case"],
  runMarker: string,
) {
  invariant(state.schemaVersion === 1, "Unsupported family-contact state schema.");
  invariant(
    state.projectRef === PRODUCTION_PROJECT_REF && state.runMarker === runMarker,
    "Family-contact state production identity mismatch.",
  );
  invariant(
    state.case.caseKey === expected.caseKey &&
      state.case.ownerKey === expected.ownerKey &&
      state.case.submissionId === expected.submissionId,
    "Family-contact state no longer matches the registered cohort case.",
  );
  invariant(stages.has(state.stage), "Family-contact stage is invalid.");
  invariant(
    Number.isInteger(state.nextApplicantIndex) &&
      state.nextApplicantIndex >= 0 &&
      state.nextApplicantIndex <= 6,
    "Family-contact applicant checkpoint is invalid.",
  );
}

export async function loadOrCreateProductionFamilyContactState() {
  assertProductionFamilyContactWriteUnlock();
  const runMarker = requiredProductionRunMarker();
  const caseKey = requiredProductionFamilyContactCaseKey();
  const planCase = buildProductionCohortPlan(runMarker).find(
    (candidate) => candidate.caseKey === caseKey,
  );
  const cohortState = await loadCohortResumeState(runMarker);
  const exactCase = validateCohortCase(
    runMarker,
    caseKey,
    planCase,
    cohortState.cases[caseKey],
  );
  const path = productionFamilyContactStatePath(runMarker, caseKey);
  if (existsSync(path)) {
    const state = await readJson<ProductionFamilyContactState>(path);
    validateStoredState(state, exactCase, runMarker);
    return { cohortCase: planCase, state };
  }

  const state: ProductionFamilyContactState = {
    case: exactCase,
    nextApplicantIndex: 0,
    projectRef: PRODUCTION_PROJECT_REF,
    runMarker,
    schemaVersion: 1,
    stage: "pending_review",
    updatedAt: new Date().toISOString(),
  };
  await saveProductionFamilyContactState(state);
  return { cohortCase: planCase, state };
}

export async function saveProductionFamilyContactState(
  state: ProductionFamilyContactState,
) {
  state.updatedAt = new Date().toISOString();
  await writeJsonAtomic(
    productionFamilyContactStatePath(state.runMarker, state.case.caseKey),
    state,
  );
}

export function productionFamilyContactIssueMarker(
  state: ProductionFamilyContactState,
) {
  return `${state.runMarker} ${state.case.caseKey}: установить один общий Email для всех 6 членов семьи и отправить повторно.`;
}
