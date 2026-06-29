import {
  applyVisaApplicationPdfReview,
  visaApplicationPdfReviewsForSubmission,
  type VisaApplicationPdfArtifactInput,
} from "./visaApplicationPdfReconciliation";
import {
  buildExportPackageIdentity,
  buildExportRows,
  exportSummary,
} from "./exportRules";
import { createDraft, submitForReview } from "./domainEngine";
import {
  mediaStorageBucket,
  validateAppointmentPdfStorageTarget,
  validateVisaApplicationPdfStorageTarget,
} from "./mediaStoragePolicy";
import {
  applicantHasPassportNumber,
  buildApplicantDocumentFileName,
} from "./filenamePolicy";
import { agentOwnerDisplayName } from "./ownership";
import {
  passportGateReason,
  requiresPassportExtractionReviewBeforeAction,
  requiresPassportGateBeforeAction,
} from "./passportExtractionGuards";
import { normalizeSubmissionQuestionnaire } from "./questionnaire";
import type { ExportContractRow } from "./exportContract";
import type { CreateDraftInput } from "./submissionActions";
import type {
  City,
  CommandResult,
  DomainErrorCode,
  ExportBlocker,
  ExportPackageIdentity,
  Issue,
  PassportExtractedField,
  PassportExtractedFieldKey,
  QuestionnaireReviewSource,
  ReturnedPdfArtifact,
  Role,
  Submission,
  SubmissionFile,
  SubmissionFileType,
  SubmissionHistorySource,
  VisaApplicationPdfReviewState,
} from "./types";
import type { VisaPdfFieldKey, VisaPdfFinding } from "./visaApplicationPdfReviewTypes";

export type { ReturnedPdfArtifact, ReturnedPdfPackageState } from "./types";

type FieldTarget = {
  fieldId: string;
  sectionKey: "contacts" | "passport" | "personal" | "trip";
};

type FieldUpdate = {
  reviewSource: QuestionnaireReviewSource;
  value?: string;
};

type QuestionnaireFieldLocation = {
  applicant: Submission["applicants"][number];
  field: Submission["applicants"][number]["sections"][number]["fields"][number];
  section: Submission["applicants"][number]["sections"][number];
};

type VisaApplicationPdfReviewArtifact = NonNullable<
  VisaApplicationPdfReviewState["artifact"]
>;

type ReturnedPdfArtifactLike = Pick<
  ReturnedPdfArtifact,
  | "deletedAtIso"
  | "failureReason"
  | "fileName"
  | "mimeType"
  | "sha256"
  | "sizeBytes"
  | "storageBucket"
  | "storagePath"
  | "uploadStatus"
>;

export type OperationalWorkflowResult<T> = CommandResult<T>;

export type PassportAutofillMode = "replace" | "safe";

export type OperationalActorSource = SubmissionHistorySource;

export type PassportAutofillResultInput = {
  actorId?: string;
  actorSource?: OperationalActorSource;
  applicantId: string;
  error?: string;
  fields?: PassportExtractedField[];
  mode?: PassportAutofillMode;
  nowIso?: string;
  sourceFileId?: string;
  sourceFileName?: string;
  sourceStoragePath?: string;
  status: "failed" | "ready" | "unavailable";
  summary?: string;
};

export type ReviewFieldConfirmationInput = {
  actorId?: string;
  applicantId: string;
  fieldIds: string[];
  nowIso?: string;
  source?: QuestionnaireReviewSource;
};

export type FamilySharedAnswersInput = {
  actorId?: string;
  actorSource?: OperationalActorSource;
  homeAddress?: string;
  nowIso?: string;
  sameHomeAddress?: boolean;
  sameSpainStay?: boolean;
  sameTripDetails?: boolean;
  spainStay?: {
    address?: string;
    city?: string;
    contact?: string;
    country?: string;
    email?: string;
    name?: string;
    postalCode?: string;
  };
  tripDetails?: {
    arrivalDate?: string;
    costCoveredBy?: string;
    departureDate?: string;
    entryCount?: string;
    meansOfSupport?: string;
    purpose?: string;
    route?: string;
    stayDuration?: string;
  };
};

export type IssueFocusTarget = {
  applicantId: string;
  applicantName: string;
  drawerTab: "files" | "questionnaire";
  fieldId?: string;
  fieldLabel?: string;
  fileType?: SubmissionFileType;
  focus: true;
  highlight: "error";
  issueId: string;
  sectionId: string;
  sectionTitle: string;
  submissionId: string;
};

export type FamilyMarkerColor = "blue" | "green" | "yellow";

export type CityExportFamilyMarker = {
  color: FamilyMarkerColor;
  familyIndex: number;
  rowEndIndex: number;
  rowStartIndex: number;
  submissionId: string;
  submissionTitle: string;
};

export type CityExportBatchPlan = {
  blockers: ExportBlocker[];
  city: City;
  contractValid: boolean;
  familyMarkers: CityExportFamilyMarker[];
  packageIdentity: ExportPackageIdentity | null;
  ready: boolean;
  rows: ExportContractRow[];
  submissions: Submission[];
};

export type ReturnedApplicationPdfInput = {
  artifact: VisaApplicationPdfArtifactInput;
  pdfText: string;
};

export type ReturnedPdfPackageReviewInput = {
  actorId?: string;
  actorSource?: OperationalActorSource;
  applicationPdfs: ReturnedApplicationPdfInput[];
  commonAppointmentPdf?: ReturnedPdfArtifact;
  nowIso?: string;
  ownerAgentName?: string;
};

export type ReturnedPdfMismatchIssueConfirmationInput = {
  actorId?: string;
  issueId: string;
  nowIso?: string;
};

export type ApplicantArtifactFileNames = {
  application: string;
  applicationFormPdf: string;
  appointment: string;
  passportScan: string;
  questionnaire: string;
  selfie: string;
  selfie2: string;
};

export type AgentHandoffApplicantPdf = {
  applicantId: string;
  applicantName: string;
  artifact: VisaApplicationPdfReviewArtifact;
  fileName: string;
  fileNames: ApplicantArtifactFileNames;
  reviewId: string;
  status: VisaApplicationPdfReviewState["status"];
};

export type ReturnedPdfPackageMapping = {
  applicantId?: string;
  applicantName?: string;
  artifactKind: "application_form_pdf" | "appointment_list_pdf";
  city: City;
  excelRowNumber?: number;
  exportPackageId: string;
  fileName: string;
  ownerAgentId: string;
  ownerAgentName?: string;
  reviewId?: string;
  sha256: string;
  storageBucket: string;
  storagePath: string;
  submissionId: string;
};

export type AgentHandoffPackage = {
  applicantPdfs: AgentHandoffApplicantPdf[];
  blockers: string[];
  commonAppointmentPdf?: ReturnedPdfArtifact;
  mappings: ReturnedPdfPackageMapping[];
  ready: boolean;
};

export type AgentReturnedPdfPackageView = AgentHandoffPackage & {
  visible: boolean;
};

export type ReturnedPdfPackageReviewResult = {
  handoffPackage: AgentHandoffPackage;
  submission: Submission;
};

export type AppointmentListPdfRowExtraction = {
  appointmentDateTime?: string;
  maskedApplicantName?: string;
  passportLast3?: string;
  referenceNumber?: string;
};

export type AppointmentListPdfExtraction = {
  appointmentDate?: string;
  appointmentTime?: string;
  centerAddress?: string;
  centerCity?: string;
  groupUrn?: string;
  rows: AppointmentListPdfRowExtraction[];
  serviceType?: string;
  visaType?: string;
};

export type AppointmentListPdfMappingResult = {
  agentHandoffAllowed: boolean;
  artifactKind: "appointment_list_pdf";
  blockerReasons: string[];
  exportPackageId?: string;
  groupUrn?: string;
  matchedApplicantsCount: number;
  matchedApplicantIds: string[];
  mixedAgentBlocker?: string;
  packageLevel: true;
  passportLast3Collisions: string[];
  unmatchedRows: AppointmentListPdfRowExtraction[];
};

export function extractBlsAppointmentListPdfData(
  text: string,
): AppointmentListPdfExtraction {
  const normalized = text.replace(/\r/g, "\n");
  const groupUrn = normalized.match(/\b[A-Z]{3}\d{9,}\b/)?.[0];
  const appointmentDate =
    normalized.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0] ??
    normalized.match(/\b\d{2}[./-]\d{2}[./-]\d{4}\b/)?.[0];
  const appointmentTime = normalized.match(/\b\d{1,2}:\d{2}\b/)?.[0];
  const rows = normalized
    .split("\n")
    .map((line) => appointmentListRowFromLine(line))
    .filter((row): row is AppointmentListPdfRowExtraction => Boolean(row));

  return {
    appointmentDate,
    appointmentTime,
    centerAddress: normalized.match(/(?:address|адрес)[:\s]+(.+)/i)?.[1]?.trim(),
    centerCity: ["Москва", "Санкт-Петербург", "Казань", "SPB", "Moscow"].find(
      (city) => normalized.toLowerCase().includes(city.toLowerCase()),
    ),
    groupUrn,
    rows,
    serviceType: normalized.match(/(?:service type|service)[:\s]+(.+)/i)?.[1]?.trim(),
    visaType: normalized.match(/(?:visa type|visa)[:\s]+(.+)/i)?.[1]?.trim(),
  };
}

export function buildAppointmentListPdfMapping(input: {
  expectedGroupUrn?: string;
  exportPackageId?: string;
  pdfText: string;
  submissions: Submission[];
}): AppointmentListPdfMappingResult {
  const extraction = extractBlsAppointmentListPdfData(input.pdfText);
  const rows = buildExportRows(input.submissions);
  const ownerAgentIds = new Set(input.submissions.map((submission) => submission.agentId));
  const blockerReasons: string[] = [];
  const groupUrnAgrees =
    !input.expectedGroupUrn ||
    (Boolean(extraction.groupUrn) && extraction.groupUrn === input.expectedGroupUrn);
  if (!groupUrnAgrees) {
    blockerReasons.push("Appointment list group URN does not match export package.");
  }

  const passportLast3Collisions = duplicateValues(
    rows.map((row) => row.passportLast3).filter(Boolean),
  );
  const matchedApplicantIds: string[] = [];
  const unmatchedRows: AppointmentListPdfRowExtraction[] = [];

  for (const extractedRow of extraction.rows) {
    const matchedRow = groupUrnAgrees
      ? uniqueMatchedAppointmentRow(rows, extractedRow)
      : undefined;
    if (matchedRow) {
      matchedApplicantIds.push(matchedRow.applicantId);
    } else {
      unmatchedRows.push(extractedRow);
    }
  }

  if (unmatchedRows.length > 0) {
    blockerReasons.push("Appointment list contains rows that cannot be safely matched.");
  }

  const mixedAgentBlocker =
    ownerAgentIds.size > 1
      ? "Mixed-agent appointment list PDF is admin-only until the export package is split or scoped."
      : undefined;
  if (mixedAgentBlocker) blockerReasons.push(mixedAgentBlocker);

  return {
    agentHandoffAllowed: ownerAgentIds.size === 1 && blockerReasons.length === 0,
    artifactKind: "appointment_list_pdf",
    blockerReasons: uniqueMessages(blockerReasons),
    exportPackageId: input.exportPackageId,
    groupUrn: extraction.groupUrn,
    matchedApplicantsCount: new Set(matchedApplicantIds).size,
    matchedApplicantIds: [...new Set(matchedApplicantIds)],
    mixedAgentBlocker,
    packageLevel: true,
    passportLast3Collisions,
    unmatchedRows,
  };
}

function appointmentListRowFromLine(
  line: string,
): AppointmentListPdfRowExtraction | null {
  const referenceNumber = line.match(/\b[A-Z]{3}\d{9,}\/\d+\b/)?.[0];
  const passportLast3 = line.match(/\*{2,}\s*(\d{3,4})\b/)?.[1]?.slice(-3);
  const maskedNameMatch = line.match(
    /\b([\p{L}]{2,}\*{2,})\s+([\p{L}]{2,}\*{2,})/u,
  );
  if (!referenceNumber && !passportLast3 && !maskedNameMatch) return null;

  const date =
    line.match(/\b\d{4}-\d{2}-\d{2}\b/)?.[0] ??
    line.match(/\b\d{2}[./-]\d{2}[./-]\d{4}\b/)?.[0];
  const time = line.match(/\b\d{1,2}:\d{2}\b/)?.[0];

  return {
    appointmentDateTime: [date, time].filter(Boolean).join(" ") || undefined,
    maskedApplicantName: maskedNameMatch
      ? `${maskedNameMatch[1]} ${maskedNameMatch[2]}`
      : undefined,
    passportLast3,
    referenceNumber,
  };
}

function uniqueMatchedAppointmentRow(
  rows: ExportContractRow[],
  extractedRow: AppointmentListPdfRowExtraction,
): ExportContractRow | undefined {
  if (!extractedRow.passportLast3 || !extractedRow.maskedApplicantName) {
    return undefined;
  }

  const candidates = rows.filter(
    (row) =>
      row.passportLast3 === extractedRow.passportLast3 &&
      maskedNameMatchesApplicantName(extractedRow.maskedApplicantName!, row),
  );

  return candidates.length === 1 ? candidates[0] : undefined;
}

function maskedNameMatchesApplicantName(
  maskedApplicantName: string,
  row: ExportContractRow,
): boolean {
  const prefixes = maskedApplicantName
    .split(/\s+/)
    .map((part) => normalizeAppointmentName(part.replace(/\*/g, "")))
    .filter(Boolean);
  if (prefixes.length < 2) return false;

  const applicantParts = [
    row.firstName,
    row.surnameFamilyName,
    row.lastName,
    row.applicantName,
  ].map(normalizeAppointmentName);

  return prefixes.every((prefix) =>
    applicantParts.some((part) => part.startsWith(prefix)),
  );
}

function normalizeAppointmentName(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .toUpperCase();
}

function duplicateValues(values: string[]): string[] {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()]
    .filter(([, count]) => count > 1)
    .map(([value]) => value);
}

const passportAutofillTargets = {
  birthCountry: { fieldId: "birth-country", sectionKey: "personal" },
  birthDate: { fieldId: "birth-date", sectionKey: "personal" },
  birthPlace: { fieldId: "birth-place", sectionKey: "personal" },
  citizenship: { fieldId: "nationality", sectionKey: "personal" },
  firstName: { fieldId: "first-name", sectionKey: "personal" },
  gender: { fieldId: "gender", sectionKey: "personal" },
  passportExpiresAt: { fieldId: "passport-expiry-date", sectionKey: "passport" },
  passportIssueCountry: { fieldId: "passport-issue-country", sectionKey: "passport" },
  passportIssuePlace: { fieldId: "passport-issue-place", sectionKey: "passport" },
  passportIssuedAt: { fieldId: "passport-issue-date", sectionKey: "passport" },
  passportNumber: { fieldId: "passport-no", sectionKey: "passport" },
  passportType: { fieldId: "passport-type", sectionKey: "passport" },
  surname: { fieldId: "surname", sectionKey: "personal" },
} satisfies Record<PassportExtractedFieldKey, FieldTarget>;

const pdfFieldTargets = {
  arrivalDate: { fieldId: "arrival-date", sectionKey: "trip" },
  birthCountry: { fieldId: "birth-country", sectionKey: "personal" },
  birthDate: { fieldId: "birth-date", sectionKey: "personal" },
  birthPlace: { fieldId: "birth-place", sectionKey: "personal" },
  citizenship: { fieldId: "nationality", sectionKey: "personal" },
  departureDate: { fieldId: "departure-date", sectionKey: "trip" },
  destinationCountry: { fieldId: "hotel-country", sectionKey: "trip" },
  entriesRequested: { fieldId: "entry-count", sectionKey: "trip" },
  firstEntryCountry: { fieldId: "route", sectionKey: "trip" },
  firstName: { fieldId: "first-name", sectionKey: "personal" },
  passportExpiresAt: { fieldId: "passport-expiry-date", sectionKey: "passport" },
  passportIssueCountry: { fieldId: "passport-issue-country", sectionKey: "passport" },
  passportIssuedAt: { fieldId: "passport-issue-date", sectionKey: "passport" },
  passportNumber: { fieldId: "passport-no", sectionKey: "passport" },
  paymentCoverage: { fieldId: "cost-covered-by", sectionKey: "trip" },
  surname: { fieldId: "surname", sectionKey: "personal" },
  travelDatesInAddress: { fieldId: "home-address", sectionKey: "contacts" },
  tripPurpose: { fieldId: "purpose", sectionKey: "trip" },
} satisfies Record<VisaPdfFieldKey, FieldTarget>;

const familyMarkerPalette: FamilyMarkerColor[] = ["green", "yellow", "blue"];

export function createOperationalDraft(
  input: CreateDraftInput,
): OperationalWorkflowResult<Submission> {
  return createDraft(input);
}

export function submitOperationalForReview(
  submission: Submission,
  role: Role,
): OperationalWorkflowResult<Submission> {
  if (role === "agent" && submission.status === "in_progress") {
    const pendingReviews = questionnaireReviewBlockers(submission);
    if (pendingReviews.length > 0) {
      return failure("VALIDATION_ERROR", pendingReviews[0] ?? "Review is required.");
    }

    if (requiresPassportGateBeforeAction(submission, "submit_for_review")) {
      return failure("VALIDATION_ERROR", passportGateReason(submission));
    }

    if (requiresPassportExtractionReviewBeforeAction(submission, "submit_for_review")) {
      return failure(
        "VALIDATION_ERROR",
        "Проверьте распознанные паспортные данные перед отправкой",
      );
    }
  }

  return submitForReview(submission, role);
}

export function applyPassportAutofillResult(
  submission: Submission,
  input: PassportAutofillResultInput,
): OperationalWorkflowResult<Submission> {
  const applicant = submission.applicants.find(
    (candidate) => candidate.id === input.applicantId,
  );
  if (!applicant) {
    return failure("VALIDATION_ERROR", "Applicant not found.");
  }

  const passportFile = uploadedPassportScan(submission, input.applicantId);
  if (!passportFile) {
    return failure(
      "VALIDATION_ERROR",
      "Passport scan must be uploaded before passport autofill.",
    );
  }

  if (input.status !== "ready") {
    const nextSubmission = setApplicantPassportExtraction(
      submission,
      input.applicantId,
      {
        appliedFieldKeys: [],
        error: input.error,
        extractedFields: [],
        lastAttemptAtIso: input.nowIso,
        sourceFileId: input.sourceFileId ?? passportFile.id,
        sourceFileName: passportAutofillSourceName(input, passportFile),
        sourceStoragePath: input.sourceStoragePath ?? passportFile.storagePath,
        status: input.status,
        summary: input.summary ?? "Passport autofill was not completed.",
      },
    );

    return success(
      appendOperationalHistoryEvent(nextSubmission, {
        at: operationalEventTimestamp(input.nowIso),
        detail: operationalActorDetail(input.actorId),
        id: operationalEventId(
          nextSubmission.id,
          "passport-autofill",
          input.applicantId,
          input.status,
          input.nowIso,
        ),
        source: input.actorSource ?? "system",
        text: "AI/OCR не заполнил паспортные данные автоматически",
      }),
    );
  }

  const fieldUpdates = new Map<string, FieldUpdate>();
  const appliedFieldKeys: PassportExtractedFieldKey[] = [];
  const extractedFields = (input.fields ?? []).map((field) => ({
    ...field,
    needsManualReview: true,
    source: "passport_scan" as const,
    verified: false,
  }));

  for (const field of input.fields ?? []) {
    const target = passportAutofillTargets[field.key];
    const current = questionnaireFieldLocation(
      submission,
      input.applicantId,
      target.fieldId,
    );
    const canApplyValue =
      input.mode === "replace" ||
      !current?.field.value.trim() ||
      normalizedComparable(current.field.value) === normalizedComparable(field.value);

    fieldUpdates.set(target.fieldId, {
      reviewSource: "passport_ocr",
      value: canApplyValue ? field.value : undefined,
    });

    if (canApplyValue) {
      appliedFieldKeys.push(field.key);
    }
  }

  const withFields = updateApplicantQuestionnaireFields(
    submission,
    input.applicantId,
    fieldUpdates,
  );

  const nextSubmission = setApplicantPassportExtraction(withFields, input.applicantId, {
    appliedFieldKeys: uniquePassportKeys(appliedFieldKeys),
    extractedFields,
    lastAttemptAtIso: input.nowIso,
    sourceFileId: input.sourceFileId ?? passportFile.id,
    sourceFileName: passportAutofillSourceName(input, passportFile),
    sourceStoragePath: input.sourceStoragePath ?? passportFile.storagePath,
    status: "ready",
    summary: input.summary ?? "Passport fields were applied for manual review.",
  });

  return success(
    appendOperationalHistoryEvent(nextSubmission, {
      at: operationalEventTimestamp(input.nowIso),
      detail: operationalActorDetail(input.actorId),
      id: operationalEventId(
        nextSubmission.id,
        "passport-autofill",
        input.applicantId,
        "ready",
        input.nowIso,
      ),
      source: input.actorSource ?? "system",
      text: "AI/OCR заполнил паспортные поля для ручной проверки",
    }),
  );
}

export function confirmQuestionnaireReviewFields(
  submission: Submission,
  input: ReviewFieldConfirmationInput,
): OperationalWorkflowResult<Submission> {
  const applicant = submission.applicants.find(
    (candidate) => candidate.id === input.applicantId,
  );
  if (!applicant) {
    return failure("VALIDATION_ERROR", "Applicant not found.");
  }

  const fieldIds = new Set(input.fieldIds);
  let confirmedCount = 0;
  const withConfirmedFields = normalizeSubmissionQuestionnaire({
    ...submission,
    applicants: submission.applicants.map((candidate) => {
      if (candidate.id !== input.applicantId) {
        return candidate;
      }

      return {
        ...candidate,
        sections: candidate.sections.map((section) => ({
          ...section,
          fields: section.fields.map((field) => {
            const sourceMatches = !input.source || field.reviewSource === input.source;
            if (
              !fieldIds.has(field.id) ||
              !sourceMatches ||
              field.reviewState !== "needs_review"
            ) {
              return field;
            }

            confirmedCount += 1;
            return {
              ...field,
              reviewConfirmedAtIso: input.nowIso ?? new Date().toISOString(),
              reviewConfirmedBy: input.actorId,
              reviewOriginSource: field.reviewOriginSource ?? field.reviewSource,
              reviewSource: "manual" as const,
              reviewState: "confirmed" as const,
            };
          }),
        })),
      };
    }),
    updatedAt: input.nowIso ?? "сейчас",
  });

  if (confirmedCount === 0) {
    return failure("VALIDATION_ERROR", "No matching review fields were confirmed.");
  }

  return success(
    markApplicantPassportExtractionVerified(
      withConfirmedFields,
      input.applicantId,
      input.nowIso,
    ),
  );
}

export function applyFamilySharedAnswers(
  submission: Submission,
  input: FamilySharedAnswersInput,
): OperationalWorkflowResult<Submission> {
  if (submission.type !== "family") {
    return failure(
      "VALIDATION_ERROR",
      "Shared family answers can be applied only to family submissions.",
    );
  }

  const fieldUpdates = new Map<string, FieldUpdate>();
  addFamilySharedField(
    fieldUpdates,
    input.sameHomeAddress,
    "home-address",
    input.homeAddress,
  );

  if (input.sameSpainStay) {
    const stay = input.spainStay;
    addFamilySharedField(fieldUpdates, true, "hotel-name", stay?.name);
    addFamilySharedField(fieldUpdates, true, "hotel-country", stay?.country);
    addFamilySharedField(fieldUpdates, true, "hotel-city", stay?.city);
    addFamilySharedField(fieldUpdates, true, "hotel-postal-code", stay?.postalCode);
    addFamilySharedField(fieldUpdates, true, "hotel-address", stay?.address);
    addFamilySharedField(fieldUpdates, true, "hotel-email", stay?.email);
    addFamilySharedField(fieldUpdates, true, "hotel-contact", stay?.contact);
    if (hasAnyValue(stay)) {
      addFamilySharedField(
        fieldUpdates,
        true,
        "inviting-party-type",
        "Гостиница/временное жильё",
      );
    }
  }

  if (input.sameTripDetails) {
    const trip = input.tripDetails;
    addFamilySharedField(fieldUpdates, true, "arrival-date", trip?.arrivalDate);
    addFamilySharedField(fieldUpdates, true, "departure-date", trip?.departureDate);
    addFamilySharedField(fieldUpdates, true, "route", trip?.route);
    addFamilySharedField(fieldUpdates, true, "stay-duration", trip?.stayDuration);
    addFamilySharedField(fieldUpdates, true, "purpose", trip?.purpose);
    addFamilySharedField(fieldUpdates, true, "entry-count", trip?.entryCount);
    addFamilySharedField(fieldUpdates, true, "cost-covered-by", trip?.costCoveredBy);
    addFamilySharedField(fieldUpdates, true, "means-of-support", trip?.meansOfSupport);
  }

  const nextSubmission = {
    ...submission,
    tripDateFrom:
      input.sameTripDetails && input.tripDetails?.arrivalDate?.trim()
        ? input.tripDetails.arrivalDate.trim()
        : submission.tripDateFrom,
    tripDateTo:
      input.sameTripDetails && input.tripDetails?.departureDate?.trim()
        ? input.tripDetails.departureDate.trim()
        : submission.tripDateTo,
    updatedAt: "сейчас",
  };

  const normalized = normalizeSubmissionQuestionnaire({
    ...nextSubmission,
    applicants: nextSubmission.applicants.map((applicantItem) =>
      applyFieldUpdatesToApplicant(applicantItem, fieldUpdates),
    ),
  });

  if (fieldUpdates.size === 0) {
    return success(normalized);
  }

  return success(
    appendOperationalHistoryEvent(normalized, {
      at: operationalEventTimestamp(input.nowIso),
      detail: operationalActorDetail(input.actorId),
      id: operationalEventId(
        normalized.id,
        "family-shared-answers",
        String(fieldUpdates.size),
        input.nowIso,
      ),
      source: input.actorSource ?? "agent",
      text: "Агент распространил общие ответы семьи по заявителям",
    }),
  );
}

export function resolveIssueFocusTarget(
  submission: Submission,
  issueId: string,
): OperationalWorkflowResult<IssueFocusTarget> {
  const issue = submission.issues.find((candidate) => candidate.id === issueId);
  if (!issue) {
    return failure("ISSUE_NOT_FOUND", "Issue not found.");
  }

  const applicant = submission.applicants.find(
    (candidate) => candidate.id === issue.target.applicantId,
  );
  if (!applicant) {
    return failure("VALIDATION_ERROR", "Issue applicant target is invalid.");
  }

  if (issue.target.fileType) {
    return success({
      applicantId: applicant.id,
      applicantName: applicant.fullName,
      drawerTab: "files",
      fileType: issue.target.fileType,
      focus: true,
      highlight: "error",
      issueId: issue.id,
      sectionId: "files",
      sectionTitle: "Файлы",
      submissionId: submission.id,
    });
  }

  const target = questionnaireIssueTarget(applicant, issue);
  if (!target) {
    return failure("VALIDATION_ERROR", "Issue questionnaire target is invalid.");
  }

  return success({
    applicantId: applicant.id,
    applicantName: applicant.fullName,
    drawerTab: "questionnaire",
    fieldId: target.field?.id,
    fieldLabel: target.field?.label,
    focus: true,
    highlight: "error",
    issueId: issue.id,
    sectionId: target.section.id,
    sectionTitle: target.section.title,
    submissionId: submission.id,
  });
}

export function buildCityExportBatchPlan(
  submissions: Submission[],
): CityExportBatchPlan[] {
  const cities = orderedCities(submissions);

  return cities.map((city) => {
    const citySubmissions = submissions
      .map((submission, index) => ({ index, submission }))
      .filter((item) => item.submission.city === city)
      .slice()
      .sort((left, right) => {
        if (left.submission.type !== right.submission.type) {
          return left.submission.type === "family" ? -1 : 1;
        }

        return left.index - right.index;
      })
      .map((item) => item.submission);
    const summary = exportSummary(citySubmissions, "xlsx");
    const rows = summary.rows;
    const contractValid = summary.contract.valid;
    const blockers = summary.blockers;

    return {
      blockers,
      city,
      contractValid,
      familyMarkers: familyMarkersFor(citySubmissions),
      packageIdentity:
        blockers.length === 0
          ? buildExportPackageIdentity(citySubmissions, "xlsx")
          : null,
      ready: blockers.length === 0,
      rows,
      submissions: citySubmissions,
    };
  });
}

export function applyReturnedPdfPackageReview(
  submission: Submission,
  input: ReturnedPdfPackageReviewInput,
): OperationalWorkflowResult<ReturnedPdfPackageReviewResult> {
  if (submission.status !== "exported") {
    return failure(
      "INVALID_TRANSITION",
      "Returned PDF package can be reviewed only after export.",
    );
  }

  try {
    let reviewedSubmission = submission;

    for (const pdf of input.applicationPdfs) {
      reviewedSubmission = applyVisaApplicationPdfReview(
        reviewedSubmission,
        pdf.pdfText,
        {
          artifact: pdf.artifact,
          fileName: pdf.artifact.fileName,
        },
      );
    }

    const withIssues = attachCriticalPdfIssues(
      reviewedSubmission,
      input.nowIso ?? "сейчас",
      input.actorSource ?? "system",
      input.actorId,
    );
    const withPackageState = applyReturnedPdfPackageState(withIssues, input);

    return success({
      handoffPackage: buildAgentHandoffPackage(withPackageState),
      submission: withPackageState,
    });
  } catch (error) {
    return failure(
      "VALIDATION_ERROR",
      error instanceof Error ? error.message : "Returned PDF package is invalid.",
    );
  }
}

export function buildAgentHandoffPackage(
  submission: Submission,
  options: { commonAppointmentPdf?: ReturnedPdfArtifact } = {},
): AgentHandoffPackage {
  const blockers: string[] = [];
  const applicantPdfs: AgentHandoffApplicantPdf[] = [];
  const mappings: ReturnedPdfPackageMapping[] = [];
  const commonAppointmentPdf =
    options.commonAppointmentPdf ?? submission.returnedPdfPackage?.commonAppointmentPdf;
  const exportPackageId =
    submission.returnedPdfPackage?.exportPackageId ??
    submission.exportPackage?.idempotencyKey;
  const ownerAgentId = submission.returnedPdfPackage?.ownerAgentId ?? submission.agentId;
  const ownerAgentName = agentOwnerDisplayName(
    ownerAgentId,
    submission.returnedPdfPackage?.ownerAgentName,
  );
  const excelRowsByApplicantId = exportExcelRowNumbersByApplicantId(submission);

  if (submission.status !== "exported") {
    blockers.push("PDF package can be handed to agent only after export.");
  }

  if (!exportPackageId) {
    blockers.push("Returned PDF handoff requires a durable export package identity.");
  }

  if (ownerAgentId !== submission.agentId) {
    blockers.push("Returned PDF handoff owner does not match submission owner.");
  }

  const commonPdfBlocker = returnedPdfArtifactBlocker(
    commonAppointmentPdf,
    "Common appointment/list PDF",
    "common_pdf",
    { submissionId: submission.id },
  );
  if (commonPdfBlocker) {
    blockers.push(commonPdfBlocker);
  } else if (commonAppointmentPdf && exportPackageId) {
    mappings.push({
      artifactKind: "appointment_list_pdf",
      city: submission.city,
      exportPackageId,
      fileName: commonAppointmentPdf.fileName,
      ownerAgentId,
      ownerAgentName,
      sha256: commonAppointmentPdf.sha256,
      storageBucket: commonAppointmentPdf.storageBucket ?? "",
      storagePath: commonAppointmentPdf.storagePath ?? "",
      submissionId: submission.id,
    });
  }

  for (const issue of unresolvedReturnedPdfMismatchIssues(submission)) {
    blockers.push(returnedPdfIssueBlocker(issue));
  }

  const reviews = visaApplicationPdfReviewsForSubmission(submission);
  for (const review of reviews) {
    if (review.status !== "blocked") {
      continue;
    }

    blockers.push(
      criticalPdfReason(review) ??
        `Application PDF has a critical mismatch: ${review.fileName ?? "unmatched file"}.`,
    );
  }

  for (const applicant of submission.applicants) {
    const fileNames = buildApplicantArtifactFileNames(submission, applicant.id);
    if (!fileNames) {
      blockers.push(`Applicant is missing for returned PDF file naming.`);
      continue;
    }

    if (!applicantHasPassportNumber(applicant)) {
      blockers.push(`Passport number is missing for ${applicant.fullName}.`);
      continue;
    }

    const applicantReviews = reviews.filter(
      (candidate) => candidate.applicantId === applicant.id,
    );
    if (!applicantReviews.length) {
      blockers.push(`Application PDF is missing for ${applicant.fullName}.`);
      continue;
    }

    const readyReviews = applicantReviews.filter(
      isReadyApplicationPdfReviewForAgentHandoff,
    );
    if (readyReviews.length !== 1) {
      if (
        applicantReviews.some(
          (candidate) =>
            candidate.status === "needs_review" &&
            candidate.handoffStatus !== "ready_for_agent",
        )
      ) {
        blockers.push(
          `Application PDF requires manual confirmation for ${applicant.fullName}.`,
        );
      } else {
        blockers.push(
          `Application PDF must have exactly one ready review for ${applicant.fullName}.`,
        );
      }
      continue;
    }

    const review = readyReviews[0];
    if (!review) {
      blockers.push(`Application PDF is missing for ${applicant.fullName}.`);
      continue;
    }

    if (!review.artifact) {
      blockers.push(
        `Uploaded application PDF artifact is missing for ${applicant.fullName}.`,
      );
      continue;
    }

    const applicationPdfBlocker = returnedPdfArtifactBlocker(
      review.artifact,
      `Application PDF for ${applicant.fullName}`,
      "application_pdf",
      { applicantId: applicant.id, submissionId: submission.id },
    );
    if (applicationPdfBlocker) {
      blockers.push(applicationPdfBlocker);
      continue;
    }

    if (
      review.status === "needs_review" &&
      review.handoffStatus !== "ready_for_agent"
    ) {
      blockers.push(
        `Application PDF requires manual confirmation for ${applicant.fullName}.`,
      );
      continue;
    }

    applicantPdfs.push({
      applicantId: applicant.id,
      applicantName: applicant.fullName,
      artifact: review.artifact,
      fileName: fileNames.applicationFormPdf,
      fileNames,
      reviewId: review.id,
      status: review.status,
    });
    if (exportPackageId) {
      mappings.push({
        applicantId: applicant.id,
        applicantName: applicant.fullName,
        artifactKind: "application_form_pdf",
        city: submission.city,
        excelRowNumber: excelRowsByApplicantId.get(applicant.id),
        exportPackageId,
        fileName: fileNames.applicationFormPdf,
        ownerAgentId,
        ownerAgentName,
        reviewId: review.id,
        sha256: review.artifact.sha256,
        storageBucket: review.artifact.storageBucket ?? "",
        storagePath: review.artifact.storagePath ?? "",
        submissionId: submission.id,
      });
    }
  }

  return {
    applicantPdfs,
    blockers: uniqueMessages(blockers),
    commonAppointmentPdf,
    mappings: blockers.length === 0 ? mappings : [],
    ready: blockers.length === 0,
  };
}

export function buildReturnedPdfAgentHandoffGate(
  submission: Submission,
  packageSubmissions: Submission[] = [submission],
  options: { commonAppointmentPdf?: ReturnedPdfArtifact } = {},
): AgentHandoffPackage {
  const handoffPackage = buildAgentHandoffPackage(submission, options);
  const exportPackageId = returnedPdfExportPackageId(submission);
  const scopedSubmissions = exportPackageId
    ? packageSubmissions.filter(
        (candidate) => returnedPdfExportPackageId(candidate) === exportPackageId,
      )
    : [submission];
  const ownerAgentIds = new Set(
    (scopedSubmissions.length ? scopedSubmissions : [submission]).map(
      (candidate) => candidate.returnedPdfPackage?.ownerAgentId ?? candidate.agentId,
    ),
  );

  if (ownerAgentIds.size <= 1) {
    return handoffPackage;
  }

  return {
    ...handoffPackage,
    blockers: uniqueMessages([
      ...handoffPackage.blockers,
      "Mixed-agent appointment list PDF is admin-only until the export package is split or scoped.",
    ]),
    mappings: [],
    ready: false,
  };
}

export function buildAgentReturnedPdfPackageView(
  submission: Submission,
  agentId: string,
  options: { commonAppointmentPdf?: ReturnedPdfArtifact } = {},
): AgentReturnedPdfPackageView {
  const ownerAgentId = submission.returnedPdfPackage?.ownerAgentId ?? submission.agentId;
  if (submission.agentId !== agentId || ownerAgentId !== agentId) {
    return {
      applicantPdfs: [],
      blockers: ["Agent can see only own returned PDF package."],
      commonAppointmentPdf: undefined,
      mappings: [],
      ready: false,
      visible: false,
    };
  }

  const handoffPackage = buildAgentHandoffPackage(submission, options);
  return {
    ...handoffPackage,
    visible: handoffPackage.ready,
  };
}

function returnedPdfExportPackageId(submission: Submission): string {
  return (
    submission.returnedPdfPackage?.exportPackageId ??
    submission.exportPackage?.idempotencyKey ??
    ""
  );
}

export function confirmReturnedPdfMismatchIssue(
  submission: Submission,
  role: Role,
  input: ReturnedPdfMismatchIssueConfirmationInput,
): OperationalWorkflowResult<Submission> {
  if (role !== "admin") {
    return failure("PERMISSION_DENIED", "Only admin can confirm returned PDF issues.");
  }

  if (submission.status !== "exported") {
    return failure(
      "INVALID_TRANSITION",
      "Returned PDF issue confirmation is available only after export.",
    );
  }

  const issue = submission.issues.find((candidate) => candidate.id === input.issueId);
  if (!issue) {
    return failure("ISSUE_NOT_FOUND", "Issue not found.");
  }

  if (!isReturnedPdfMismatchIssue(issue)) {
    return failure(
      "VALIDATION_ERROR",
      "Only returned PDF mismatch issues can be confirmed after export.",
    );
  }

  if (issue.status === "closed_by_admin") {
    return success(submission);
  }

  if (returnedPdfReviewStillBlocksIssue(submission, issue)) {
    return failure(
      "VALIDATION_ERROR",
      "Returned PDF mismatch is still present in the latest PDF review.",
    );
  }

  const confirmed = {
    ...submission,
    issues: submission.issues.map((candidate) =>
      candidate.id === issue.id
        ? { ...candidate, status: "closed_by_admin" as const }
        : candidate,
    ),
    updatedAt: "сейчас",
  };

  return success(
    appendOperationalHistoryEvent(confirmed, {
      at: operationalEventTimestamp(input.nowIso),
      detail: operationalActorDetail(input.actorId),
      id: operationalEventId(
        submission.id,
        "pdf-issue-confirmed",
        issue.id,
        input.nowIso,
      ),
      source: "admin",
      text: "Администратор подтвердил исправление расхождения returned PDF",
    }),
  );
}

export function buildApplicantArtifactFileNames(
  submission: Submission,
  applicantId: string,
): ApplicantArtifactFileNames | null {
  const applicant = submission.applicants.find(
    (candidate) => candidate.id === applicantId,
  );
  if (!applicant) {
    return null;
  }

  const applicationFormPdf = buildApplicantDocumentFileName({
    applicant,
    applicantId,
    documentType: "application_form_pdf",
  });

  return {
    application: applicationFormPdf,
    applicationFormPdf,
    appointment: buildApplicantDocumentFileName({
      applicant,
      applicantId,
      documentType: "application_form_pdf",
    }),
    passportScan: buildApplicantDocumentFileName({
      applicant,
      applicantId,
      documentType: "passport_scan",
    }),
    questionnaire: buildApplicantDocumentFileName({
      applicant,
      applicantId,
      documentType: "questionnaire",
    }),
    selfie: buildApplicantDocumentFileName({
      applicant,
      applicantId,
      documentType: "selfie",
    }),
    selfie2: buildApplicantDocumentFileName({
      applicant,
      applicantId,
      documentType: "selfie_2",
    }),
  };
}

function applyReturnedPdfPackageState(
  submission: Submission,
  input: ReturnedPdfPackageReviewInput,
): Submission {
  if (!input.commonAppointmentPdf) {
    return submission;
  }

  return {
    ...submission,
    returnedPdfPackage: {
      ...submission.returnedPdfPackage,
      commonAppointmentPdf: input.commonAppointmentPdf,
      exportPackageId:
        submission.exportPackage?.idempotencyKey ??
        submission.returnedPdfPackage?.exportPackageId,
      ownerAgentId: submission.agentId,
      ownerAgentName: input.ownerAgentName ?? submission.returnedPdfPackage?.ownerAgentName,
      reviewedAtIso: operationalEventTimestamp(input.nowIso),
      reviewedBy: input.actorId ?? submission.returnedPdfPackage?.reviewedBy,
    },
    updatedAt: "сейчас",
  };
}

export function questionnaireReviewBlockers(submission: Submission): string[] {
  return submission.applicants.flatMap((applicant) =>
    applicant.sections.flatMap((section) =>
      section.fields.flatMap((field) => {
        if (field.reviewState !== "needs_review") {
          return [];
        }

        return [
          `${applicant.fullName}: confirm ${field.label} before sending to review.`,
        ];
      }),
    ),
  );
}

function setApplicantPassportExtraction(
  submission: Submission,
  applicantId: string,
  passportExtraction: Submission["applicants"][number]["passportExtraction"],
): Submission {
  return {
    ...submission,
    applicants: submission.applicants.map((applicant) =>
      applicant.id === applicantId
        ? {
            ...applicant,
            passportExtraction,
          }
        : applicant,
    ),
    updatedAt: "сейчас",
  };
}

function uploadedPassportScan(
  submission: Submission,
  applicantId: string,
): SubmissionFile | undefined {
  return submission.files.find(
    (file) =>
      file.applicantId === applicantId &&
      file.type === "passport_scan" &&
      file.status !== "missing" &&
      file.status !== "needs_replacement",
  );
}

function passportAutofillSourceName(
  input: PassportAutofillResultInput,
  file: SubmissionFile,
) {
  return input.sourceFileName ?? file.originalFileName ?? file.generatedFileName;
}

function updateApplicantQuestionnaireFields(
  submission: Submission,
  applicantId: string,
  fieldUpdates: Map<string, FieldUpdate>,
): Submission {
  return normalizeSubmissionQuestionnaire({
    ...submission,
    applicants: submission.applicants.map((applicant) =>
      applicant.id === applicantId
        ? applyFieldUpdatesToApplicant(applicant, fieldUpdates)
        : applicant,
    ),
    updatedAt: "сейчас",
  });
}

function applyFieldUpdatesToApplicant(
  applicant: Submission["applicants"][number],
  fieldUpdates: Map<string, FieldUpdate>,
): Submission["applicants"][number] {
  return {
    ...applicant,
    sections: applicant.sections.map((section) => ({
      ...section,
      fields: section.fields.map((field) => {
        const update = fieldUpdates.get(field.id);
        if (!update) {
          return field;
        }

        return {
          ...field,
          reviewOriginSource: field.reviewOriginSource ?? update.reviewSource,
          reviewSource: update.reviewSource,
          reviewState: "needs_review" as const,
          value: update.value ?? field.value,
        };
      }),
    })),
  };
}

function markApplicantPassportExtractionVerified(
  submission: Submission,
  applicantId: string,
  nowIso = new Date().toISOString(),
): Submission {
  const applicant = submission.applicants.find(
    (candidate) => candidate.id === applicantId,
  );
  const state = applicant?.passportExtraction;
  if (
    !state ||
    state.status !== "ready" ||
    state.verifiedAtIso ||
    hasPendingApplicantReview(submission, applicantId, "passport_ocr")
  ) {
    return submission;
  }

  return {
    ...submission,
    applicants: submission.applicants.map((candidate) =>
      candidate.id === applicantId
        ? {
            ...candidate,
            passportExtraction: {
              ...state,
              verifiedAtIso: nowIso,
            },
          }
        : candidate,
    ),
    history: [
      {
        at: "сейчас",
        id: `и-${submission.id}-passport-review-${applicantId}-${nowIso}`,
        source: "agent",
        text: "Агент подтвердил распознанные паспортные данные",
      },
      ...submission.history,
    ],
    updatedAt: "сейчас",
  };
}

function hasPendingApplicantReview(
  submission: Submission,
  applicantId: string,
  source?: QuestionnaireReviewSource,
) {
  const applicant = submission.applicants.find(
    (candidate) => candidate.id === applicantId,
  );
  if (!applicant) {
    return false;
  }

  return applicant.sections.some((section) =>
    section.fields.some(
      (field) =>
        field.reviewState === "needs_review" &&
        (!source || field.reviewSource === source),
    ),
  );
}

function addFamilySharedField(
  fieldUpdates: Map<string, FieldUpdate>,
  enabled: boolean | undefined,
  fieldId: string,
  value: string | undefined,
) {
  if (!enabled) {
    return;
  }

  const normalized = value?.trim();
  if (!normalized) {
    return;
  }

  fieldUpdates.set(fieldId, {
    reviewSource: "family_shared",
    value: normalized,
  });
}

function hasAnyValue(values: Record<string, string | undefined> | undefined) {
  return Object.values(values ?? {}).some((value) => Boolean(value?.trim()));
}

function questionnaireIssueTarget(
  applicant: Submission["applicants"][number],
  issue: Issue,
) {
  const issueSection = issue.target.section;
  const issueField = issue.target.field;

  for (const section of applicant.sections) {
    const sectionMatches =
      !issueSection ||
      issueSection === "Анкета" ||
      issueSection === "Данные" ||
      section.id === issueSection ||
      section.title === issueSection;
    const field = section.fields.find(
      (candidate) => candidate.id === issueField || candidate.label === issueField,
    );

    if (field) {
      return { field, section };
    }

    if (sectionMatches && !issueField) {
      return { field: undefined, section };
    }
  }

  return null;
}

function orderedCities(submissions: Submission[]): City[] {
  const cities: City[] = [];
  for (const submission of submissions) {
    if (!cities.includes(submission.city)) {
      cities.push(submission.city);
    }
  }

  return cities;
}

function familyMarkersFor(submissions: Submission[]): CityExportFamilyMarker[] {
  const markers: CityExportFamilyMarker[] = [];
  let rowStartIndex = 0;
  let familyIndex = 0;

  for (const submission of submissions) {
    const rowCount = submission.applicants.length;
    if (submission.type === "family") {
      const color = familyMarkerPalette[familyIndex % familyMarkerPalette.length];
      if (color) {
        markers.push({
          color,
          familyIndex: familyIndex + 1,
          rowEndIndex: rowStartIndex + Math.max(rowCount - 1, 0),
          rowStartIndex,
          submissionId: submission.id,
          submissionTitle: submission.title,
        });
      }

      familyIndex += 1;
    }

    rowStartIndex += rowCount;
  }

  return markers;
}

function attachCriticalPdfIssues(
  submission: Submission,
  nowIso: string,
  actorSource: OperationalActorSource,
  actorId: string | undefined,
): Submission {
  let nextSubmission = submission;
  const reviews = visaApplicationPdfReviewsForSubmission(submission);

  for (const review of reviews) {
    if (!review.applicantId || review.status !== "blocked") {
      continue;
    }

    for (const finding of review.findings) {
      if (finding.severity !== "critical") {
        continue;
      }

      const nextIssue = pdfFindingIssue(nextSubmission, review, finding, nowIso);
      if (!nextIssue) {
        continue;
      }

      const existingIssue = nextSubmission.issues.find(
        (issue) => issue.id === nextIssue.id,
      );
      if (existingIssue) {
        nextSubmission = {
          ...markPdfFieldForReview(nextSubmission, nextIssue),
          history: pdfIssueHistory(
            nextSubmission,
            nextIssue,
            "PDF mismatch issue reopened from returned PDF",
            nowIso,
            actorSource,
            actorId,
          ),
          issues: nextSubmission.issues.map((issue) =>
            issue.id === nextIssue.id
              ? {
                  ...issue,
                  comment: nextIssue.comment,
                  createdAt: nextIssue.createdAt,
                  createdBy: nextIssue.createdBy,
                  reason: nextIssue.reason,
                  severity: nextIssue.severity,
                  status: "open" as const,
                  target: nextIssue.target,
                  type: nextIssue.type,
                }
              : issue,
          ),
          updatedAt: "сейчас",
        };
        continue;
      }

      nextSubmission = {
        ...markPdfFieldForReview(nextSubmission, nextIssue),
        history: pdfIssueHistory(
          nextSubmission,
          nextIssue,
          "PDF mismatch issue created from returned PDF",
          nowIso,
          actorSource,
          actorId,
        ),
        issues: [nextIssue, ...nextSubmission.issues],
        updatedAt: "сейчас",
      };
    }
  }

  return normalizeSubmissionQuestionnaire(nextSubmission);
}

function pdfFindingIssue(
  submission: Submission,
  review: VisaApplicationPdfReviewState,
  finding: VisaPdfFinding,
  nowIso: string,
): Issue | null {
  if (!review.applicantId) {
    return null;
  }

  const applicant = submission.applicants.find(
    (candidate) => candidate.id === review.applicantId,
  );
  if (!applicant) {
    return null;
  }

  const target = pdfFieldTargets[finding.field];
  const section = applicant.sections.find((candidate) =>
    candidate.id.endsWith(`-${target.sectionKey}`),
  );
  const field = section?.fields.find((candidate) => candidate.id === target.fieldId);
  if (!section || !field) {
    return null;
  }

  return {
    comment: finding.message,
    createdAt: nowIso,
    createdBy: "system",
    id: `зм-${submission.id}-pdf-${applicant.id}-${finding.field}`,
    reason: "Returned PDF mismatch",
    severity: "blocker",
    status: "open",
    target: {
      applicantId: applicant.id,
      applicantName: applicant.fullName,
      field: field.label,
      section: section.title,
    },
    type: "field",
  };
}

function markPdfFieldForReview(submission: Submission, issue: Issue): Submission {
  const applicantId = issue.target.applicantId;
  const targetFieldLabel = issue.target.field;

  return {
    ...submission,
    applicants: submission.applicants.map((applicant) => {
      if (applicant.id !== applicantId) {
        return applicant;
      }

      return {
        ...applicant,
        sections: applicant.sections.map((section) => ({
          ...section,
          fields: section.fields.map((field) => {
            if (field.label !== targetFieldLabel) {
              return field;
            }

            return {
              ...field,
              reviewOriginSource: field.reviewOriginSource ?? "pdf_reconciliation",
              reviewSource: "pdf_reconciliation" as const,
              reviewState: "needs_review" as const,
            };
          }),
        })),
      };
    }),
  };
}

function pdfIssueHistory(
  submission: Submission,
  issue: Issue,
  text: string,
  nowIso: string,
  actorSource: OperationalActorSource,
  actorId: string | undefined,
) {
  return appendOperationalHistoryEvent(submission, {
    at: operationalEventTimestamp(nowIso),
    detail: operationalActorDetail(actorId),
    id: operationalEventId(submission.id, "pdf-issue", issue.id, nowIso),
    source: actorSource,
    text,
  }).history;
}

function returnedPdfArtifactBlocker(
  artifact: ReturnedPdfArtifactLike | undefined,
  label: string,
  storageKind: "application_pdf" | "common_pdf" = "common_pdf",
  context: { applicantId?: string; submissionId?: string } = {},
) {
  if (!artifact) {
    return `${label} is missing.`;
  }

  if (
    artifact.uploadStatus === "failed" ||
    artifact.uploadStatus === "deleted" ||
    artifact.uploadStatus === "pending" ||
    artifact.uploadStatus === "none"
  ) {
    const suffix = artifact.failureReason ? ` ${artifact.failureReason}` : "";
    if (artifact.uploadStatus === "failed") return `${label} upload failed.${suffix}`;
    if (artifact.uploadStatus === "deleted") return `${label} was deleted.`;
    return `${label} is not uploaded.`;
  }

  if (artifact.mimeType !== "application/pdf") {
    return `${label} must be a PDF.`;
  }

  if (!/^[a-fA-F0-9]{64}$/.test(artifact.sha256)) {
    return `${label} must include a SHA-256 checksum.`;
  }

  if (!Number.isInteger(artifact.sizeBytes) || artifact.sizeBytes <= 0) {
    return `${label} must include a positive file size.`;
  }

  if (!artifact.storageBucket || !artifact.storagePath) {
    return `${label} must include private storage identity.`;
  }

  if (artifact.storageBucket !== mediaStorageBucket) {
    return `${label} must use the private submission-media bucket.`;
  }

  if (storageKind === "application_pdf") {
    try {
      validateVisaApplicationPdfStorageTarget({
        applicantId: context.applicantId ?? "",
        file: {
          name: artifact.fileName,
          size: artifact.sizeBytes,
          type: artifact.mimeType,
        },
        sha256: artifact.sha256,
        submissionId: context.submissionId ?? "",
        target: {
          bucket: mediaStorageBucket,
          path: artifact.storagePath,
        },
      });
    } catch {
      return `${label} has invalid application PDF storage identity.`;
    }
  } else {
    try {
      validateAppointmentPdfStorageTarget({
        file: {
          name: artifact.fileName,
          size: artifact.sizeBytes,
          type: artifact.mimeType,
        },
        sha256: artifact.sha256,
        submissionId: context.submissionId ?? "",
        target: {
          bucket: mediaStorageBucket,
          path: artifact.storagePath,
        },
      });
    } catch {
      return `${label} has invalid appointment PDF storage identity.`;
    }
  }

  return "";
}

function exportExcelRowNumbersByApplicantId(submission: Submission): Map<string, number> {
  const rows = buildExportRows([submission]);
  const rowNumbersByApplicantId = new Map<string, number>();

  for (const applicant of submission.applicants) {
    const row = rows.find(
      (candidate) =>
        candidate.submissionId === submission.id &&
        candidate.applicantName === applicant.fullName,
    );
    if (row) {
      rowNumbersByApplicantId.set(applicant.id, row.applicantIndex + 1);
    }
  }

  return rowNumbersByApplicantId;
}

function unresolvedReturnedPdfMismatchIssues(submission: Submission): Issue[] {
  return submission.issues.filter(
    (issue) =>
      isReturnedPdfMismatchIssue(issue) &&
      issue.severity === "blocker" &&
      (issue.status === "open" || issue.status === "fixed_by_agent"),
  );
}

function isReturnedPdfMismatchIssue(issue: Issue): boolean {
  return issue.reason === "Returned PDF mismatch";
}

function returnedPdfReviewStillBlocksIssue(submission: Submission, issue: Issue) {
  return visaApplicationPdfReviewsForSubmission(submission).some(
    (review) =>
      review.applicantId === issue.target.applicantId && review.status === "blocked",
  );
}

function returnedPdfIssueBlocker(issue: Issue) {
  const applicantName = issue.target.applicantName;
  const target = [issue.target.section, issue.target.field].filter(Boolean).join(" / ");
  const status =
    issue.status === "fixed_by_agent"
      ? "marked fixed by agent but not closed by admin"
      : "open";
  return `${applicantName}: returned PDF mismatch issue is ${status}${target ? ` (${target})` : ""}.`;
}

function criticalPdfReason(review: VisaApplicationPdfReviewState) {
  return review.findings.find((finding) => finding.severity === "critical")?.message;
}

function isReadyApplicationPdfReviewForAgentHandoff(
  review: VisaApplicationPdfReviewState,
) {
  return (
    review.status === "clear" ||
    (review.status === "needs_review" && review.handoffStatus === "ready_for_agent")
  );
}

function questionnaireFieldLocation(
  submission: Submission,
  applicantId: string,
  fieldId: string,
): QuestionnaireFieldLocation | null {
  const applicant = submission.applicants.find(
    (candidate) => candidate.id === applicantId,
  );
  if (!applicant) {
    return null;
  }

  for (const section of applicant.sections) {
    const field = section.fields.find((candidate) => candidate.id === fieldId);
    if (field) {
      return { applicant, field, section };
    }
  }

  return null;
}

function normalizedComparable(value: string) {
  return value
    .trim()
    .replace(/\s+/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .toUpperCase();
}

function operationalEventTimestamp(nowIso: string | undefined) {
  return nowIso?.trim() || "сейчас";
}

function operationalEventId(
  submissionId: string,
  action: string,
  target: string,
  ...discriminatorParts: Array<string | undefined>
) {
  const discriminator = discriminatorParts
    .map((part) => part?.trim())
    .filter(Boolean)
    .join("-");
  const suffix = (discriminator || new Date().toISOString()).replace(
    /[^a-zA-Z0-9]/g,
    "",
  );
  return `и-${submissionId}-${action}-${target}-${suffix}`;
}

function operationalActorDetail(actorId: string | undefined) {
  return actorId?.trim() ? `Оператор: ${actorId.trim()}` : undefined;
}

function appendOperationalHistoryEvent(
  submission: Submission,
  event: Submission["history"][number],
): Submission {
  if (submission.history.some((item) => item.id === event.id)) {
    return submission;
  }

  return {
    ...submission,
    history: [event, ...submission.history],
  };
}

function uniqueMessages(values: string[]): string[] {
  return Array.from(new Set(values));
}

function uniquePassportKeys(
  values: PassportExtractedFieldKey[],
): PassportExtractedFieldKey[] {
  return Array.from(new Set(values));
}

function success<T>(data: T): OperationalWorkflowResult<T> {
  return { ok: true, data };
}

function failure<T>(
  code: DomainErrorCode,
  message: string,
): OperationalWorkflowResult<T> {
  return { ok: false, error: { code, message } };
}
