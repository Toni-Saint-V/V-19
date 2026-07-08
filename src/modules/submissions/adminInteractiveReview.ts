export type AdminReviewFieldState = "match" | "warning" | "pending" | "approved" | "remarked";

export type AdminReviewField = {
  label: string;
  value: string;
  source: string;
  confidence: string;
  state: AdminReviewFieldState;
};

export type AdminReviewAction = "approve" | "remark" | "reset";

export type AdminReviewSummary = {
  approved: number;
  pending: number;
  remarks: number;
  risk: number;
  total: number;
  progress: number;
  nextAction: string;
  canFinish: boolean;
};

export function applyAdminReviewFieldAction(
  fields: readonly AdminReviewField[],
  label: string,
  action: AdminReviewAction,
): AdminReviewField[] {
  return fields.map((field) => {
    if (field.label !== label) return { ...field };
    if (action === "approve") return { ...field, state: "approved" };
    if (action === "remark") return { ...field, state: "remarked" };
    if (field.state === "approved" || field.state === "remarked") {
      return { ...field, state: "pending" };
    }
    return { ...field };
  });
}

export function approveAllAdminReviewFields(
  fields: readonly AdminReviewField[],
): AdminReviewField[] {
  return fields.map((field) =>
    field.state === "remarked" ? { ...field } : { ...field, state: "approved" },
  );
}

export function summarizeAdminReviewFields(
  fields: readonly AdminReviewField[],
): AdminReviewSummary {
  const total = fields.length;
  const approved = fields.filter((field) => isApprovedState(field.state)).length;
  const remarks = fields.filter((field) => field.state === "remarked").length;
  const risk = fields.filter((field) => field.state === "warning").length;
  const pending = Math.max(0, total - approved - remarks);
  const progress = total === 0 ? 0 : Math.round((approved / total) * 100);
  const firstRemark = fields.find((field) => field.state === "remarked");
  const firstPending = fields.find(
    (field) => !isApprovedState(field.state) && field.state !== "remarked",
  );

  return {
    approved,
    pending,
    remarks,
    risk,
    total,
    progress,
    canFinish: total > 0 && pending === 0 && remarks === 0,
    nextAction: firstRemark
      ? `Отправить замечание по полю «${firstRemark.label}»`
      : firstPending
        ? `Подтвердить поле «${firstPending.label}» или создать замечание`
        : "Все поля подтверждены, можно завершать сверку",
  };
}

export function adminReviewActionNotice(
  label: string,
  action: AdminReviewAction,
): string {
  if (action === "approve") return `OK: поле «${label}» отмечено как проверенное`;
  if (action === "remark") return `Замечание по полю «${label}» добавлено в пакет исправлений`;
  return `Поле «${label}» возвращено в ожидание проверки`;
}

function isApprovedState(state: AdminReviewFieldState): boolean {
  return state === "match" || state === "approved";
}
