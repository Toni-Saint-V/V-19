import {
  applySubmissionAction,
  applySubmissionActionResult,
  canAddAdminIssue,
  canAgentEditSubmissionContent,
} from "./status";
import {
  completeQuestionnaireSections,
  createQuestionnaireSections,
  flagQuestionnaireField,
  normalizeSubmissionQuestionnaire,
  updateQuestionnaireField as updateQuestionnaireFieldInSubmission,
  type QuestionnaireFieldUpdate,
} from "./questionnaire";
import {
  buildExportPackageIdentity,
  exportPackageIdentityMatches,
  exportSummary,
} from "./exportRules";
import { familyListTitleFromMainApplicantName } from "./listFormatters";
import { defaultLocalAgentOwnerId } from "./ownership";
import {
  CANONICAL_FRONTEND_MEDIA_TYPES,
  isCanonicalFrontendMediaType,
  isCanonicalSubmissionStatus,
  isRejectedLegacyMediaType,
  normalizeLegacySubmissionStatus,
  toCanonicalStorageMediaType,
} from "./domainContract";
import {
  applicantFileStatusForFiles,
  fileCompletenessPercent,
} from "./fileAsset";
import type {
  City,
  AgentOwnerId,
  CommandResult,
  ExportState,
  Issue,
  IssueInput,
  PreliminaryIntakeDraft,
  QuestionnaireSection,
  Submission,
  SubmissionAction,
  Role,
  SubmissionFile,
  FileAssetStorageAdapter,
  SubmissionFileStatus,
  SubmissionFileType,
  SubmissionStatus,
} from "./types";

export type CreateDraftInput = {
  agentId?: AgentOwnerId;
  city: City;
  applicantNames?: string[];
  familyCount: number;
  idScheme?: "local" | "supabase";
  preliminaryIntake?: PreliminaryIntakeDraft;
  submissions: Submission[];
  type: Submission["type"];
};

export type UploadedFileMetadata = {
  generatedFileName: string;
  mimeType: string;
  originalFileName: string;
  sizeBytes: number;
  storageAdapter?: FileAssetStorageAdapter;
  storageBucket?: string;
  storagePath?: string;
  uploadedAtIso: string;
};

export function applyUploadedFileMetadata(
  submission: Submission,
  fileId: string,
  metadata: UploadedFileMetadata,
): Submission {
  return uploadRequiredFile(submission, fileId, metadata);
}

export function mergeUploadedFileMetadataIntoSubmissions(
  submissions: Submission[],
  submissionId: string,
  fileId: string,
  metadata: UploadedFileMetadata,
): { submission: Submission | null; submissions: Submission[] } {
  let mergedSubmission: Submission | null = null;

  const nextSubmissions = submissions.map((submission) => {
    if (submission.id !== submissionId) return submission;

    const updated = applyUploadedFileMetadata(submission, fileId, metadata);
    if (updated !== submission) {
      mergedSubmission = updated;
      return updated;
    }

    const targetFile = submission.files.find((file) => file.id === fileId);
    if (!targetFile) {
      mergedSubmission = submission;
      return submission;
    }
    if (!isCanonicalFrontendMediaType(targetFile.type)) {
      mergedSubmission = submission;
      return submission;
    }

    const files = submission.files.map((file) =>
      file.id === fileId ? mergeUploadedStorageFields(file, metadata) : file,
    );
    const filePercent = fileCompleteness(files);
    const withStorageMetadata = {
      ...submission,
      applicants: submission.applicants.map((applicant) => ({
        ...applicant,
        fileStatus: applicantFileStatus(
          files.filter((file) => file.applicantId === applicant.id),
        ),
      })),
      completeness: {
        ...submission.completeness,
        files: filePercent,
        total: Math.round((submission.completeness.questionnaire + filePercent) / 2),
      },
      files,
    };
    mergedSubmission = withStorageMetadata;
    return withStorageMetadata;
  });

  return {
    submission: mergedSubmission,
    submissions: nextSubmissions,
  };
}

export function mediaSlotTypeForSubmissionFileType(type: SubmissionFileType) {
  const result = toCanonicalStorageMediaType(type);
  if (!result.ok) return type as never;
  return result.data;
}

export function cockpitUploadExtensionForMimeType(
  mimeType: string,
  fileType: SubmissionFileType,
): "jpg" | "png" | "pdf" | "mp4" {
  if (
    !isCanonicalFrontendMediaType(fileType) &&
    !isRejectedLegacyMediaType(fileType)
  ) {
    throw new Error("Unsupported media type for Package 1 upload slot.");
  }
  if (fileType === "passport_scan" && mimeType === "application/pdf") return "pdf";
  if (fileType === "video" && mimeType === "video/mp4") return "mp4";
  if (mimeType === "image/png") return "png";
  if (mimeType === "image/jpeg") return "jpg";
  throw new Error("Unsupported media MIME type for this upload slot.");
}

export function generatedCockpitMediaFileName({
  applicantId,
  fileType,
  mimeType,
  submissionId,
  uploadNonce,
}: {
  applicantId: string;
  fileType: SubmissionFileType;
  mimeType: string;
  submissionId: string;
  uploadNonce?: string;
}): string {
  const slotType = mediaSlotTypeForSubmissionFileType(fileType);
  const extension = cockpitUploadExtensionForMimeType(mimeType, fileType);
  const nonceSegment = uploadNonce ? `:${uploadNonce}` : "";
  return `${stableAsciiToken(`${submissionId}:${applicantId}:${slotType}${nonceSegment}`)}_${slotType}.${extension}`;
}

export function createDraftSubmission({
  agentId = defaultLocalAgentOwnerId,
  applicantNames = [],
  city,
  familyCount,
  idScheme = "local",
  preliminaryIntake,
  submissions,
  type,
}: CreateDraftInput): Submission {
  const nextIndex = nextSubmissionIndex(submissions);
  const applicantTotal = type === "family" ? familyCount : 1;
  const submissionId = submissionIdForScheme(nextIndex, idScheme);

  const applicants = Array.from({ length: applicantTotal }, (_, index) => {
    const id = applicantIdForScheme(nextIndex, index, idScheme);
    const fullName = draftApplicantName(index, type, applicantNames[index]);

    return {
      id,
      fullName,
      role: draftApplicantRole(index, type),
      questionnaireStatus: "empty",
      fileStatus: "empty",
      sections: createQuestionnaireSections(id, fullName, "empty"),
    };
  }) satisfies Submission["applicants"];

  const submission: Submission = {
    id: submissionId,
    agentId,
    title: draftTitle(type, applicants[0]?.fullName),
    listTitle:
      type === "family"
        ? familyListTitleFromMainApplicantName(applicants[0]?.fullName)
        : undefined,
    type,
    country: "Испания",
    city,
    tripDateFrom:
      preliminaryIntake?.sameTripDates && preliminaryIntake.tripDateFrom.trim()
        ? preliminaryIntake.tripDateFrom.trim()
        : "не указано",
    tripDateTo:
      preliminaryIntake?.sameTripDates && preliminaryIntake.tripDateTo.trim()
        ? preliminaryIntake.tripDateTo.trim()
        : "не указано",
    status: "draft",
    applicants: applyPreliminaryIntakeToApplicants(applicants, preliminaryIntake),
    issues: [],
    files: requiredFilesForApplicants(applicants, nextIndex, idScheme),
    completeness: { questionnaire: 0, files: 0, total: 0 },
    aiSuggestions: [],
    aiReviewState: "idle",
    exportState: "not_ready",
    createdAt: "сейчас",
    updatedAt: "сейчас",
    history: [
      {
        id: `и-${nextIndex}-создано`,
        text: "Черновик создан",
        at: "сейчас",
        source: "agent",
      },
    ],
  };

  return preliminaryIntake ? normalizeSubmissionQuestionnaire(submission) : submission;
}

function applyPreliminaryIntakeToApplicants(
  applicants: Submission["applicants"],
  intake: PreliminaryIntakeDraft | undefined,
) {
  if (!intake) return applicants;

  return applicants.map((applicant) => ({
    ...applicant,
    sections: applicant.sections.map((section) =>
      applyPreliminaryIntakeToSection(section, intake),
    ),
  }));
}

function applyPreliminaryIntakeToSection(
  section: QuestionnaireSection,
  intake: PreliminaryIntakeDraft,
): QuestionnaireSection {
  if (section.id.endsWith("-contacts")) {
    return {
      ...section,
      fields: section.fields.map((field) => {
        if (
          intake.sameHomeAddress &&
          field.id === "home-address" &&
          intake.homeAddress.trim()
        ) {
          return { ...field, value: intake.homeAddress.trim() };
        }

        return field;
      }),
    };
  }

  if (section.id.endsWith("-trip")) {
    return {
      ...section,
      fields: section.fields.map((field) => applyPreliminaryTripField(field, intake)),
    };
  }

  return section;
}

function applyPreliminaryTripField(
  field: QuestionnaireSection["fields"][number],
  intake: PreliminaryIntakeDraft,
) {
  if (
    intake.sameTripDates &&
    field.id === "arrival-date" &&
    intake.tripDateFrom.trim()
  ) {
    return { ...field, value: intake.tripDateFrom.trim() };
  }

  if (
    intake.sameTripDates &&
    field.id === "departure-date" &&
    intake.tripDateTo.trim()
  ) {
    return { ...field, value: intake.tripDateTo.trim() };
  }

  if (
    intake.sameSpainStay &&
    field.id === "inviting-party-type" &&
    hasSpainStayInput(intake)
  ) {
    return { ...field, value: "Гостиница/временное жильё" };
  }

  if (
    intake.sameSpainStay &&
    field.id === "hotel-country" &&
    hasSpainStayInput(intake)
  ) {
    return { ...field, value: "Spain" };
  }

  if (
    intake.sameSpainStay &&
    field.id === "hotel-name" &&
    intake.spainStayName.trim()
  ) {
    return { ...field, value: intake.spainStayName.trim() };
  }

  if (
    intake.sameSpainStay &&
    field.id === "hotel-city" &&
    intake.spainStayCity.trim()
  ) {
    return { ...field, value: intake.spainStayCity.trim() };
  }

  if (
    intake.sameSpainStay &&
    field.id === "hotel-address" &&
    intake.spainStayAddress.trim()
  ) {
    return { ...field, value: intake.spainStayAddress.trim() };
  }

  if (intake.sameArrivalPlace && field.id === "route" && intake.arrivalPlace.trim()) {
    return { ...field, value: intake.arrivalPlace.trim() };
  }

  return field;
}

function hasSpainStayInput(intake: PreliminaryIntakeDraft) {
  return Boolean(
    intake.spainStayName.trim() ||
    intake.spainStayCity.trim() ||
    intake.spainStayAddress.trim(),
  );
}

export function completeQuestionnaire(submission: Submission): Submission {
  return {
    ...completeQuestionnaireSections(submission),
    updatedAt: "сейчас",
    history: [
      {
        id: `и-${submission.id}-анкета`,
        text: "Анкета заполнена",
        at: "сейчас",
        source: "agent",
      },
      ...submission.history,
    ],
  };
}

export function updateQuestionnaireField(
  submission: Submission,
  update: QuestionnaireFieldUpdate,
): Submission {
  const updated = updateQuestionnaireFieldInSubmission(submission, update);
  return syncTripDateRangeFromQuestionnaireUpdate(updated, update);
}

function syncTripDateRangeFromQuestionnaireUpdate(
  submission: Submission,
  update: QuestionnaireFieldUpdate,
): Submission {
  if (update.fieldId === "arrival-date") {
    return { ...submission, tripDateFrom: normalizedTripDateValue(update.value) };
  }

  if (update.fieldId === "departure-date") {
    return { ...submission, tripDateTo: normalizedTripDateValue(update.value) };
  }

  return submission;
}

function normalizedTripDateValue(value: string) {
  return value.trim() || "не указано";
}

export function uploadRequiredFiles(submission: Submission): Submission {
  const files = submission.files.length
    ? submission.files
    : requiredFilesForApplicants(
        submission.applicants,
        submissionIndexFromId(submission.id),
        submission.id.startsWith("VF-") ? "supabase" : "local",
      );
  const withFiles = { ...submission, files };

  return files.reduce(
    (current, file) => uploadRequiredFile(current, file.id),
    withFiles,
  );
}

export function normalizeSubmissionForCanonicalRuntime(
  submission: Submission,
  options: { exportedAt?: unknown; statusFallback?: SubmissionStatus } = {},
): Submission {
  const normalizedStatus = normalizeLegacySubmissionStatus(submission.status, {
    exportedAt: options.exportedAt,
  });
  if (!normalizedStatus.ok && !options.statusFallback) {
    throw new Error(normalizedStatus.reason);
  }
  const status = normalizedStatus.ok ? normalizedStatus.data : options.statusFallback;
  if (!isCanonicalSubmissionStatus(status)) {
    throw new Error("Unknown submission status.");
  }

  const issues = canonicalRuntimeIssues(submission.issues);
  const files = applyCanonicalIssueReplacementState(
    canonicalRuntimeFiles(submission),
    submission.files,
    issues,
  );
  const filePercent = fileCompleteness(files);

  return normalizeSubmissionQuestionnaire({
    ...submission,
    status,
    issues,
    applicants: submission.applicants.map((applicant) => ({
      ...applicant,
      fileStatus: applicantFileStatus(
        files.filter((file) => file.applicantId === applicant.id),
      ),
    })),
    files,
    completeness: {
      ...submission.completeness,
      files: filePercent,
      total: Math.round((submission.completeness.questionnaire + filePercent) / 2),
    },
  });
}

export function uploadRequiredFile(
  submission: Submission,
  fileId: string,
  metadata?: UploadedFileMetadata,
): Submission {
  if (!canAgentEditSubmissionContent(submission)) return submission;

  const targetFile = submission.files.find((file) => file.id === fileId);
  if (!targetFile || !isFileUploadable(targetFile.status)) return submission;
  if (!isCanonicalFrontendMediaType(targetFile.type)) return submission;

  const files = submission.files.map((file) =>
    file.id === fileId
      ? {
          ...file,
          status: "uploaded" as const,
          generatedFileName: metadata?.generatedFileName ?? file.generatedFileName,
          mimeType: metadata?.mimeType ?? file.mimeType,
          originalFileName: metadata?.originalFileName ?? file.originalFileName,
          reviewedAtIso: undefined,
          reviewedBy: undefined,
          reviewStatus: "not_reviewed" as const,
          sizeBytes: metadata?.sizeBytes ?? file.sizeBytes,
          storageAdapter: metadata?.storageAdapter ?? file.storageAdapter ?? "local-dev",
          storageBucket: metadata?.storageBucket ?? file.storageBucket,
          storagePath: metadata?.storagePath ?? file.storagePath,
          uploadedAtIso: metadata?.uploadedAtIso ?? file.uploadedAtIso,
          uploadStatus: "uploaded" as const,
          uploadedBy: file.uploadedBy ?? "Агент",
          uploadedAt: "сейчас",
        }
      : file,
  );
  const applicant = submission.applicants.find(
    (item) => item.id === targetFile.applicantId,
  );
  const filePercent = fileCompleteness(files);

  return {
    ...submission,
    applicants: submission.applicants.map((item) => ({
      ...item,
      fileStatus: applicantFileStatus(
        files.filter((file) => file.applicantId === item.id),
      ),
      passportExtraction:
        targetFile.type === "passport_scan" && item.id === targetFile.applicantId
          ? undefined
          : item.passportExtraction,
    })),
    files,
    completeness: {
      ...submission.completeness,
      files: filePercent,
      total: Math.round((submission.completeness.questionnaire + filePercent) / 2),
    },
    updatedAt: "сейчас",
    history: [
      {
        id: `и-${submission.id}-файл-${fileId}`,
        text: `Файл загружен: ${fileTypeName(targetFile.type)} · ${applicant?.fullName ?? "Заявитель"}`,
        at: "сейчас",
        source: "agent",
      },
      ...submission.history,
    ],
  };
}

export function addPreciseAdminIssue(
  submission: Submission,
  input: IssueInput,
  actorId?: string,
): Submission {
  if (!canAddAdminIssue(submission, "admin")) return submission;

  const firstApplicant = submission.applicants[0];
  if (!firstApplicant) return submission;
  const reason = input.reason.trim();
  const comment = input.comment.trim();
  if (!reason || !comment) return submission;

  const issueInput = input;
  const applicant =
    submission.applicants.find((item) => item.id === issueInput.applicantId) ??
    firstApplicant;

  const newIssue: Issue = {
    id: `зм-${submission.id}-новое-${submission.issues.length + 1}`,
    type: issueInput.type,
    target: {
      applicantId: applicant.id,
      applicantName: applicant.fullName,
      section: issueInput.section,
      field: issueInput.field,
      fileType: issueInput.fileType,
    },
    reason,
    comment,
    severity: issueInput.severity,
    status: "open",
    createdBy: "admin",
    createdAt: "сейчас",
    snapshot: issueSnapshot(submission, issueInput),
  };

  const withTargetFlag =
    newIssue.target.fileType &&
    (newIssue.target.section === "Файлы" || newIssue.target.section === "Медиа")
      ? markIssueFileForReplacement(submission, newIssue, actorId)
      : flagQuestionnaireField(
          submission,
          applicant.id,
          newIssue.target.field ?? "Маршрут поездки",
          newIssue.reason,
        );

  return {
    ...withTargetFlag,
    issues: [newIssue, ...withTargetFlag.issues],
    updatedAt: "сейчас",
    history: [
      {
        id: `и-${submission.id}-замечание`,
        text: "Администратор добавил точное замечание",
        at: "сейчас",
        source: "admin",
      },
      ...submission.history,
    ],
  };
}

export function markSubmissionFileAccepted(
  submission: Submission,
  input: {
    applicantId: string;
    fileType: SubmissionFileType;
    reviewedBy?: string;
  },
): Submission {
  const targetFile = submission.files.find(
    (file) => file.applicantId === input.applicantId && file.type === input.fileType,
  );

  if (!targetFile || targetFile.status === "missing") return submission;

  const files = submission.files.map((file) =>
    file.applicantId === input.applicantId && file.type === input.fileType
      ? {
          ...file,
          status: "accepted" as const,
          reviewedAtIso: new Date().toISOString(),
          reviewedBy: input.reviewedBy ?? file.reviewedBy ?? "Администратор",
          reviewStatus: "accepted" as const,
        }
      : file,
  );
  const filePercent = fileCompleteness(files);

  return {
    ...submission,
    applicants: submission.applicants.map((applicant) => ({
      ...applicant,
      fileStatus: applicantFileStatus(
        files.filter((file) => file.applicantId === applicant.id),
      ),
    })),
    completeness: {
      ...submission.completeness,
      files: filePercent,
      total: Math.round((submission.completeness.questionnaire + filePercent) / 2),
    },
    files,
    history: [
      {
        id: `и-${submission.id}-file-accepted-${targetFile.id}`,
        at: "сейчас",
        detail: fileTypeName(input.fileType),
        source: "admin",
        text: "Администратор принял файл",
      },
      ...submission.history,
    ],
    updatedAt: "сейчас",
  };
}

export function applyActionToSubmissionList(
  submissions: Submission[],
  submissionId: string,
  action: SubmissionAction,
  role: Role,
  actorId?: string,
) {
  const result = applyActionToSubmissionListResult(
    submissions,
    submissionId,
    action,
    role,
    actorId,
  );

  return result.ok ? result.data : submissions;
}

export function applyActionToSubmissionListResult(
  submissions: Submission[],
  submissionId: string,
  action: SubmissionAction,
  role: Role,
  actorId?: string,
): CommandResult<Submission[]> {
  let matchedSubmission = false;
  const nextSubmissions: Submission[] = [];

  for (const submission of submissions) {
    if (submission.id !== submissionId) {
      nextSubmissions.push(submission);
      continue;
    }

    matchedSubmission = true;
    const actionResult = applySubmissionActionResult(
      submission,
      action,
      role,
      actorId,
    );

    if (!actionResult.ok) {
      return {
        ok: false,
        error: actionResult.error,
      };
    }

    nextSubmissions.push(actionResult.data);
  }

  if (!matchedSubmission) {
    return {
      ok: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Подача не найдена",
      },
    };
  }

  return {
    ok: true,
    data: nextSubmissions,
  };
}

export function applyExportStateToSelection(
  submissions: Submission[],
  selectedIds: string[],
  exportState: ExportState,
) {
  if (!canApplyExportStateToSelection(submissions, selectedIds, exportState)) {
    return submissions;
  }

  const selected = submissions.filter((submission) =>
    selectedIds.includes(submission.id),
  );
  const exportPackage = buildExportPackageIdentity(selected);

  return submissions.map((submission) => {
    if (!selectedIds.includes(submission.id)) return submission;
    if (exportState === "file_generated" || exportState === "file_downloaded") {
      return { ...submission, exportPackage: exportPackage ?? undefined, exportState };
    }
    if (exportState === "ready" || exportState === "not_ready") {
      const nextSubmission = { ...submission };
      delete nextSubmission.exportPackage;
      return { ...nextSubmission, exportState };
    }
    return { ...submission, exportState };
  });
}

function canApplyExportStateToSelection(
  submissions: Submission[],
  selectedIds: string[],
  exportState: ExportState,
) {
  const selected = submissions.filter((submission) =>
    selectedIds.includes(submission.id),
  );

  if (selected.length === 0) return false;

  const plan = exportSummary(selected);

  if (exportState === "file_generated") return plan.canGenerate;
  if (exportState === "file_downloaded") {
    const exportPackage = buildExportPackageIdentity(selected);
    return (
      plan.canDownload &&
      selected.every(
        (submission) =>
          submission.exportPackage &&
          exportPackageIdentityMatches(submission.exportPackage, exportPackage),
      )
    );
  }
  if (exportState === "marked_exported") return plan.canMarkExported;

  return plan.ready;
}

export function markSelectedExported(submissions: Submission[], selectedIds: string[]) {
  if (!canApplyExportStateToSelection(submissions, selectedIds, "marked_exported")) {
    return submissions;
  }

  return submissions.map((submission) =>
    selectedIds.includes(submission.id)
      ? applySubmissionAction(submission, "mark_exported", "admin")
      : submission,
  );
}

function nextSubmissionIndex(submissions: Submission[]) {
  const indexes = submissions
    .map((submission) => submissionIndexFromId(submission.id))
    .filter(Number.isFinite);
  return Math.max(1058, ...indexes) + 1;
}

function submissionIndexFromId(id: string): number {
  return Number(id.match(/\d+/)?.[0]);
}

function submissionIdForScheme(
  nextIndex: number,
  idScheme: NonNullable<CreateDraftInput["idScheme"]>,
) {
  return idScheme === "supabase" ? `VF-${nextIndex}` : `ПД-${nextIndex}`;
}

function applicantIdForScheme(
  nextIndex: number,
  applicantIndex: number,
  idScheme: NonNullable<CreateDraftInput["idScheme"]>,
) {
  return idScheme === "supabase"
    ? `app-${nextIndex}-${applicantIndex + 1}`
    : `з-${nextIndex}-${applicantIndex + 1}`;
}

function draftApplicantName(index: number, type: Submission["type"], input?: string) {
  const normalized = input?.trim();
  if (normalized) return normalized;
  if (type === "single") return "Новый заявитель";
  if (index === 0) return "Основной заявитель";
  if (index === 1) return "Супруг";
  return `Ребёнок ${index - 1}`;
}

function draftApplicantRole(index: number, type: Submission["type"]) {
  if (index === 0) return "main" as const;
  if (type === "family" && index === 1) return "spouse" as const;
  return "child" as const;
}

function draftTitle(type: Submission["type"], firstApplicantName?: string) {
  if (!firstApplicantName || firstApplicantName === "Новый заявитель") {
    return type === "family" ? "Новая семейная подача" : "Новая подача";
  }
  if (type === "single") return firstApplicantName;

  const firstToken = firstApplicantName.split(/\s+/)[0];
  if (!firstToken || firstToken === "Основной") return "Новая семейная подача";
  return `Семья ${firstToken.replace(/а$/i, "")}ых`;
}

function isFileUploadable(status: SubmissionFileStatus) {
  return status === "missing" || status === "needs_replacement";
}

function mergeUploadedStorageFields(
  file: SubmissionFile,
  metadata: UploadedFileMetadata,
): SubmissionFile {
  return {
    ...file,
    generatedFileName: metadata.generatedFileName,
    mimeType: metadata.mimeType,
    originalFileName: metadata.originalFileName,
    sizeBytes: metadata.sizeBytes,
    storageAdapter: metadata.storageAdapter ?? file.storageAdapter ?? "local-dev",
    storageBucket: metadata.storageBucket,
    storagePath: metadata.storagePath,
    uploadedAtIso: metadata.uploadedAtIso,
    uploadedAt: file.uploadedAt ?? "сейчас",
    uploadedBy: file.uploadedBy ?? "Агент",
    uploadStatus: "uploaded",
  };
}

function stableAsciiToken(value: string): string {
  let hash = 2_166_136_261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16_777_619);
  }

  return `v19${(hash >>> 0).toString(36).padStart(7, "0")}`;
}

function fileCompleteness(files: SubmissionFile[]) {
  return fileCompletenessPercent(files);
}

function applicantFileStatus(files: SubmissionFile[]) {
  return applicantFileStatusForFiles(files);
}

function fileTypeName(type: SubmissionFile["type"]) {
  if (type === "photo") return "Архивное фото";
  if (type === "photo_white") return "Архивное фото";
  if (type === "selfie") return "Селфи";
  if (type === "selfie_2") return "Селфи N2";
  if (type === "passport_scan") return "Загранпаспорт";
  return "Архивное видео";
}

function canonicalRuntimeIssues(issues: Submission["issues"]): Submission["issues"] {
  return issues.map((issue) => {
    const legacyFileType = issue.target.fileType;
    const fileType = legacyFileType
      ? canonicalRuntimeIssueFileType(legacyFileType)
      : legacyFileType;

    if (fileType === legacyFileType) return issue;

    return {
      ...issue,
      target: {
        ...issue.target,
        fileType,
      },
    };
  });
}

function canonicalRuntimeIssueFileType(type: SubmissionFileType): SubmissionFileType {
  if (isCanonicalFrontendMediaType(type)) return type;
  if (type === "photo" || type === "photo_white") return "selfie";
  if (type === "video") return "selfie_2";
  return type;
}

function applyCanonicalIssueReplacementState(
  files: SubmissionFile[],
  sourceFiles: SubmissionFile[],
  issues: Submission["issues"],
): SubmissionFile[] {
  const replacementByCanonicalKey = new Map<string, SubmissionFile>();

  for (const file of sourceFiles) {
    if (!isRejectedLegacyMediaType(file.type)) continue;
    if (file.status !== "needs_replacement") continue;

    const canonicalType = canonicalRuntimeIssueFileType(file.type);
    const hasMappedIssue = issues.some(
      (issue) =>
        issue.id === file.linkedIssueId &&
        issue.target.applicantId === file.applicantId &&
        issue.target.fileType === canonicalType,
    );
    if (!hasMappedIssue) continue;

    replacementByCanonicalKey.set(`${file.applicantId}:${canonicalType}`, file);
  }

  if (replacementByCanonicalKey.size === 0) return files;

  return files.map((file) => {
    const replacement = replacementByCanonicalKey.get(`${file.applicantId}:${file.type}`);
    if (!replacement) return file;

    return {
      ...file,
      status: "needs_replacement",
      linkedIssueId: replacement.linkedIssueId,
      reviewedAtIso: replacement.reviewedAtIso,
      reviewedBy: replacement.reviewedBy,
      reviewStatus: replacement.reviewStatus ?? "replace_required",
    };
  });
}

function canonicalRuntimeFiles(submission: Submission): SubmissionFile[] {
  const canonicalFiles = new Map<string, SubmissionFile>();
  for (const file of submission.files) {
    if (!isCanonicalFrontendMediaType(file.type)) continue;
    const key = `${file.applicantId}:${file.type}`;
    if (!canonicalFiles.has(key)) canonicalFiles.set(key, file);
  }

  const submissionIndex = submissionIndexFromId(submission.id);
  const templates = requiredFilesForApplicants(
    submission.applicants,
    Number.isFinite(submissionIndex) ? submissionIndex : 0,
    submission.id.startsWith("VF-") ? "supabase" : "local",
  );
  const templatesByKey = new Map(
    templates.map((file) => [`${file.applicantId}:${file.type}`, file]),
  );

  return submission.applicants.flatMap((applicant) =>
    CANONICAL_FRONTEND_MEDIA_TYPES.map((type) => {
      const key = `${applicant.id}:${type}`;
      const existing = canonicalFiles.get(key);
      if (existing) return existing;
      const template = templatesByKey.get(key);
      if (template) return template;
      return {
        id: `ф-${submission.id}-${applicant.id}-${type}`,
        applicantId: applicant.id,
        type,
        status: "missing" as const,
      };
    }),
  );
}

function issueSnapshot(submission: Submission, input: IssueInput) {
  if (input.fileType) {
    return submission.files.find(
      (file) => file.applicantId === input.applicantId && file.type === input.fileType,
    )?.status;
  }

  const applicant = submission.applicants.find((item) => item.id === input.applicantId);
  const fields = applicant?.sections.flatMap((section) => section.fields) ?? [];
  return fields.find((field) => field.label === input.field)?.value;
}

function markIssueFileForReplacement(
  submission: Submission,
  issue: Issue,
  reviewedBy?: string,
): Submission {
  const files = submission.files.map((file) =>
    file.applicantId === issue.target.applicantId && file.type === issue.target.fileType
      ? {
          ...file,
          status: "needs_replacement" as const,
          linkedIssueId: issue.id,
          reviewedAtIso: new Date().toISOString(),
          reviewedBy: reviewedBy ?? file.reviewedBy,
          reviewStatus: "replace_required" as const,
        }
      : file,
  );
  const filePercent = fileCompleteness(files);

  return {
    ...submission,
    applicants: submission.applicants.map((applicant) =>
      applicant.id === issue.target.applicantId
        ? { ...applicant, fileStatus: "needs_fix" }
        : {
            ...applicant,
            fileStatus: applicantFileStatus(
              files.filter((file) => file.applicantId === applicant.id),
            ),
          },
    ),
    files,
    completeness: {
      ...submission.completeness,
      files: filePercent,
      total: Math.round((submission.completeness.questionnaire + filePercent) / 2),
    },
  };
}

function requiredFilesForApplicants(
  applicants: Submission["applicants"],
  submissionIndex: number,
  idScheme: NonNullable<CreateDraftInput["idScheme"]> = "local",
): SubmissionFile[] {
  return applicants.flatMap((applicant, applicantIndex) =>
    CANONICAL_FRONTEND_MEDIA_TYPES.map(
      (type, fileIndex) => ({
        id:
          idScheme === "supabase"
            ? `file-${submissionIndex}-${applicantIndex + 1}-${fileIndex + 1}`
            : `ф-${submissionIndex}-${applicantIndex + 1}-${fileIndex + 1}`,
        applicantId: applicant.id,
        type,
        status: "missing" as const,
      }),
    ),
  );
}
