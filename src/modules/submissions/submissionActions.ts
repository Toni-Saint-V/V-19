import {
  applySubmissionAction,
  canAddAdminIssue,
  canAgentEditSubmissionContent,
} from "./status";
import {
  completeQuestionnaireSections,
  createQuestionnaireSections,
  flagQuestionnaireField,
  updateQuestionnaireField as updateQuestionnaireFieldInSubmission,
  type QuestionnaireFieldUpdate,
} from "./questionnaire";
import {
  buildExportPackageIdentity,
  exportPackageIdentityMatches,
  exportSummary,
} from "./exportRules";
import type {
  City,
  ExportState,
  Issue,
  IssueInput,
  Submission,
  SubmissionAction,
  Role,
  SubmissionFile,
  SubmissionFileStatus,
} from "./types";

export type CreateDraftInput = {
  city: City;
  applicantNames?: string[];
  familyCount: number;
  submissions: Submission[];
  type: Submission["type"];
};

export function createDraftSubmission({
  applicantNames = [],
  city,
  familyCount,
  submissions,
  type,
}: CreateDraftInput): Submission {
  const nextIndex = nextSubmissionIndex(submissions);
  const applicantTotal = type === "family" ? familyCount : 1;

  const applicants = Array.from({ length: applicantTotal }, (_, index) => {
    const id = `з-${nextIndex}-${index + 1}`;
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

  return {
    id: `ПД-${nextIndex}`,
    title: draftTitle(type, applicants[0]?.fullName),
    type,
    country: "Испания",
    city,
    tripDateFrom: "не указано",
    tripDateTo: "не указано",
    status: "draft",
    applicants,
    issues: [],
    files: requiredFilesForApplicants(applicants, nextIndex),
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
  return updateQuestionnaireFieldInSubmission(submission, update);
}

export function uploadRequiredFiles(submission: Submission): Submission {
  const files = submission.files.length
    ? submission.files
    : requiredFilesForApplicants(
        submission.applicants,
        Number(submission.id.replace("ПД-", "")),
      );
  const withFiles = { ...submission, files };

  return files.reduce(
    (current, file) => uploadRequiredFile(current, file.id),
    withFiles,
  );
}

export function uploadRequiredFile(submission: Submission, fileId: string): Submission {
  if (!canAgentEditSubmissionContent(submission)) return submission;

  const targetFile = submission.files.find((file) => file.id === fileId);
  if (!targetFile || !isFileUploadable(targetFile.status)) return submission;

  const files = submission.files.map((file) =>
    file.id === fileId
      ? {
          ...file,
          status: "uploaded" as const,
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
    newIssue.target.fileType && newIssue.target.section === "Файлы"
      ? markIssueFileForReplacement(submission, newIssue)
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

export function applyActionToSubmissionList(
  submissions: Submission[],
  submissionId: string,
  action: SubmissionAction,
  role: Role,
) {
  return submissions.map((submission) =>
    submission.id === submissionId
      ? applySubmissionAction(submission, action, role)
      : submission,
  );
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
    .map((submission) => Number(submission.id.replace("ПД-", "")))
    .filter(Number.isFinite);
  return Math.max(1058, ...indexes) + 1;
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

function fileCompleteness(files: SubmissionFile[]) {
  if (!files.length) return 0;
  const ready = files.filter((file) => !isFileUploadable(file.status)).length;
  return Math.round((ready / files.length) * 100);
}

function applicantFileStatus(files: SubmissionFile[]) {
  if (!files.length || files.every((file) => file.status === "missing"))
    return "empty" as const;
  if (files.some((file) => file.status === "needs_replacement"))
    return "needs_fix" as const;
  if (files.every((file) => !isFileUploadable(file.status))) return "complete" as const;
  return "partial" as const;
}

function fileTypeName(type: SubmissionFile["type"]) {
  if (type === "photo") return "Фото";
  if (type === "selfie") return "Селфи";
  return "Видео";
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

function markIssueFileForReplacement(submission: Submission, issue: Issue): Submission {
  const files = submission.files.map((file) =>
    file.applicantId === issue.target.applicantId && file.type === issue.target.fileType
      ? {
          ...file,
          status: "needs_replacement" as const,
          linkedIssueId: issue.id,
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
): SubmissionFile[] {
  return applicants.flatMap((applicant, applicantIndex) =>
    (["photo", "selfie", "video"] as const).map((type, fileIndex) => ({
      id: `ф-${submissionIndex}-${applicantIndex + 1}-${fileIndex + 1}`,
      applicantId: applicant.id,
      type,
      status: "missing" as const,
    })),
  );
}
