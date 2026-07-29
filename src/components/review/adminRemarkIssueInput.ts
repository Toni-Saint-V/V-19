import type { IssueInput, SubmissionFileType } from "../../modules/submissions/types";

export function buildAdminRemarkIssueInput(input: {
  applicantId: string;
  field?: string;
  fieldLabel?: string;
  fileType?: SubmissionFileType;
  message: string;
  severity: "warning" | "critical";
}): IssueInput {
  const normalizedField = input.field?.trim() || undefined;
  const normalizedFieldLabel = input.fieldLabel?.trim() || normalizedField;
  if (!input.fileType && !normalizedField) {
    throw new Error("Замечание должно быть привязано к конкретному полю или файлу.");
  }

  return {
    applicantId: input.applicantId,
    comment: input.message,
    field: input.fileType ? undefined : normalizedField,
    fileType: input.fileType,
    reason: input.fileType
      ? `Требуется заменить файл «${normalizedField ?? input.fileType}»`
      : `Требуется исправить поле «${normalizedFieldLabel}»`,
    section: input.fileType ? "Файлы" : "Паспорт",
    severity: input.severity === "critical" ? "blocker" : "warning",
    type: input.fileType ? "file" : "field",
  };
}
