import { AlertCircle, CheckCircle2, MessageSquarePlus } from "lucide-react";

import { hasAdminPassportReviewValue } from "../modules/submissions/passportReviewContract";
import type { AdminPassportReviewFieldId } from "../modules/submissions/passportReviewContract";
import type { Applicant, SubmissionFileType } from "../modules/submissions/types";

export type PassportReviewField = {
  alreadyApproved: boolean;
  hasError: boolean;
  id: AdminPassportReviewFieldId;
  label: string;
  sectionId: string;
  sourceLabel: string;
  value: string;
};

type ReviewPassportFieldRowProps = {
  applicant?: Applicant;
  field: PassportReviewField;
  onAddRemark: (
    field?: string,
    applicant?: string,
    fileType?: SubmissionFileType,
    applicantId?: string,
  ) => void;
};

export function ReviewPassportFieldRow({
  applicant,
  field,
  onAddRemark,
}: ReviewPassportFieldRowProps) {
  const valid = hasAdminPassportReviewValue(field.value) && !field.hasError;
  const state = field.alreadyApproved ? "approved" : valid ? "review" : "warning";
  const statusLabel = field.alreadyApproved
    ? "Подтверждено"
    : valid
      ? "Проверить"
      : "Нужно замечание";

  return (
    <article
      aria-label={`${field.label}: ${field.value || "не заполнено"}. ${statusLabel}`}
      className={`v19-review-field-card is-${state}`}
      data-passport-field-id={field.id}
    >
      <div className="v19-review-field-copy">
        <span className="v19-review-field-label">{field.label}</span>
        <strong>
          {hasAdminPassportReviewValue(field.value) ? field.value : "Не заполнено"}
        </strong>
        {valid ? null : <small>Поле отсутствует или содержит ошибку</small>}
      </div>

      <span className={`v19-review-field-status is-${state}`}>
        {field.alreadyApproved ? (
          <CheckCircle2 aria-hidden="true" />
        ) : (
          <AlertCircle aria-hidden="true" />
        )}
        {statusLabel}
      </span>

      <button
        aria-label={`Добавить замечание: ${field.label}`}
        className="v19-admin-passport-field-remark v19-review-field-remark"
        onClick={() =>
          onAddRemark(field.sourceLabel, applicant?.fullName, undefined, applicant?.id)
        }
        type="button"
      >
        <MessageSquarePlus aria-hidden="true" />
        <span>Замечание</span>
      </button>
    </article>
  );
}
