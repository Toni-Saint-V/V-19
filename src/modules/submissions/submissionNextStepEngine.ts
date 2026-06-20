import {
  buildPassportExtractionBrief,
  type PassportExtractionBrief,
} from "./passportExtractionBrief";
import { passportExtractionRows } from "./passportExtraction";
import {
  blockerCount,
  fixedIssueCount,
  getPrimaryAction,
  openIssueCount,
  typeLabels,
  unresolvedOpenIssueCount,
} from "./status";
import {
  buildReadinessQueue,
  firstActionableQueueItem,
  type WorkspaceTarget,
} from "./workspaceModel";
import type { Role, Submission, SubmissionAction } from "./types";

export type SubmissionNextStepStatus =
  | "blocked"
  | "ready_for_action"
  | "waiting"
  | "complete";

export type SubmissionNextStepActionKind =
  | "navigate_target"
  | "submission_action"
  | "passport_review"
  | "wait"
  | "none";

export type SubmissionNextStepAction = {
  disabled?: boolean;
  id: string;
  kind: SubmissionNextStepActionKind;
  label: string;
  reason?: string;
  submissionAction?: SubmissionAction;
  target?: WorkspaceTarget;
};

export type SubmissionNextStepBrief = {
  actions: string[];
  ariaLabel: string;
  blockers: string[];
  guardrails: string[];
  metrics: {
    passportConflicts: number;
    passportSafeFields: number;
    queueCount: number;
  };
  owner: Role | "system";
  primaryAction: SubmissionNextStepAction;
  status: SubmissionNextStepStatus;
  summary: string;
  title: string;
};

const guardrails = [
  "Подсказка не является решением.",
  "Детерминированные проверки остаются источником истины.",
  "Оператор принимает медиа и заявку вручную.",
];

export function buildSubmissionNextStepBrief({
  role,
  submission,
  surface,
}: {
  role: Role;
  submission: Submission;
  surface: "agent" | "review" | "export";
}): SubmissionNextStepBrief {
  const queue = buildReadinessQueue(submission);
  const passportBrief = buildPassportExtractionBrief(submission);
  const blockers = readinessBlockers(submission, role);
  const primaryAction =
    agentWaitingPrimaryAction(submission, role, surface) ??
    passportPrimaryAction(submission, passportBrief) ??
    queuePrimaryAction(submission) ??
    lifecyclePrimaryAction(submission, role, surface);
  const fileCounts = mediaCounts(submission);

  return {
    actions: nextActions({
      blockers,
      fileCounts,
      primaryAction,
      role,
      submission,
      surface,
    }),
    ariaLabel: ariaLabel(role, surface),
    blockers,
    guardrails,
    metrics: {
      passportConflicts: passportBrief.metrics.conflicts,
      passportSafeFields: passportBrief.metrics.safeFieldsToApply,
      queueCount: queue.length,
    },
    owner: nextOwner(submission, role, primaryAction),
    primaryAction,
    status: statusFor(primaryAction, blockers),
    summary: summaryFor(submission, surface, fileCounts),
    title: titleFor(submission, role, surface, primaryAction, blockers),
  };
}

function passportPrimaryAction(
  submission: Submission,
  brief: PassportExtractionBrief,
): SubmissionNextStepAction | null {
  if (brief.status === "extracting") {
    return {
      disabled: true,
      id: "wait_passport_extraction",
      kind: "wait",
      label: brief.nextStep.label,
      reason: "Распознавание еще выполняется.",
    };
  }

  const conflict = firstPassportRow(submission, (row) => row.conflict && !row.applied);
  if (conflict) {
    return {
      id: "resolve_passport_conflicts",
      kind: "passport_review",
      label: "Разберите конфликтные паспортные поля",
      target: passportRowTarget(conflict),
    };
  }

  const safe = firstPassportRow(submission, (row) => !row.conflict && !row.applied);
  if (safe) {
    return {
      id: "apply_passport_fields",
      kind: "passport_review",
      label: "Примените безопасные паспортные поля",
      target: passportRowTarget(safe),
    };
  }

  if (brief.status === "review_required") {
    const review = firstPassportRow(submission, () => true);
    return {
      id: "verify_passport_review",
      kind: "passport_review",
      label: brief.nextStep.label,
      target: review ? passportRowTarget(review) : undefined,
    };
  }

  if (brief.status === "failed" || brief.status === "unavailable") {
    const applicant = submission.applicants.find((item) =>
      ["failed", "unavailable"].includes(item.passportExtraction?.status ?? ""),
    );
    return {
      id: "manual_passport_entry",
      kind: "passport_review",
      label: brief.nextStep.label,
      target: applicant
        ? {
            applicantId: applicant.id,
            fileType: "passport_scan",
            tab: "files",
          }
        : undefined,
    };
  }

  return null;
}

function queuePrimaryAction(submission: Submission): SubmissionNextStepAction | null {
  const first = firstActionableQueueItem(submission);
  if (!first) return null;

  return {
    id: "open_first_queue_item",
    kind: "navigate_target",
    label: first.actionLabel,
    target: first.target,
  };
}

function agentWaitingPrimaryAction(
  submission: Submission,
  role: Role,
  surface: "agent" | "review" | "export",
): SubmissionNextStepAction | null {
  if (role !== "agent" || surface !== "agent") return null;

  if (submission.status === "submitted_for_review") {
    return {
      disabled: true,
      id: "wait_admin_review",
      kind: "wait",
      label: "Дождитесь ручной проверки администратора",
      reason: "Заявка уже отправлена на проверку.",
    };
  }

  if (submission.status === "corrections_received") {
    return {
      disabled: true,
      id: "wait_admin_corrections_review",
      kind: "wait",
      label: "Дождитесь закрытия исправлений администратором",
      reason: "Исправления уже отправлены.",
    };
  }

  if (submission.status === "ready_for_export") {
    return {
      disabled: true,
      id: "wait_admin_export",
      kind: "wait",
      label: "Дождитесь выгрузки администратором",
      reason: "Пакет принят к выгрузке.",
    };
  }

  return null;
}

function lifecyclePrimaryAction(
  submission: Submission,
  role: Role,
  surface: "agent" | "review" | "export",
): SubmissionNextStepAction {
  const action = getPrimaryAction(submission, role, surface);
  return {
    disabled: action.disabled,
    id: action.disabled ? `disabled_${action.action}` : `submission_${action.action}`,
    kind: action.disabled ? "none" : "submission_action",
    label: action.label,
    reason: action.reason,
    submissionAction: action.action,
  };
}

function firstPassportRow(
  submission: Submission,
  predicate: (row: ReturnType<typeof passportExtractionRows>[number]) => boolean,
) {
  for (const applicant of submission.applicants) {
    const row = passportExtractionRows(applicant).find(predicate);
    if (row) return { applicantId: applicant.id, row };
  }
  return null;
}

function passportRowTarget(match: NonNullable<ReturnType<typeof firstPassportRow>>) {
  return {
    applicantId: match.applicantId,
    field: match.row.fieldLabel,
    tab: "questionnaire" as const,
  };
}

function statusFor(
  primaryAction: SubmissionNextStepAction,
  blockers: string[],
): SubmissionNextStepStatus {
  if (primaryAction.kind === "wait") return "waiting";
  if (primaryAction.disabled) return "blocked";
  if (primaryAction.kind === "none") return "complete";
  if (
    primaryAction.id === "resolve_passport_conflicts" ||
    primaryAction.id === "open_first_queue_item" ||
    blockers.length > 0
  ) {
    return "blocked";
  }
  return "ready_for_action";
}

function nextOwner(
  submission: Submission,
  role: Role,
  primaryAction: SubmissionNextStepAction,
): Role | "system" {
  if (
    submission.status === "submitted_for_review" ||
    submission.status === "corrections_received" ||
    submission.status === "ready_for_export" ||
    submission.status === "exported"
  ) {
    return "admin";
  }
  if (primaryAction.kind === "wait") return "system";
  return role;
}

function titleFor(
  submission: Submission,
  role: Role,
  surface: "agent" | "review" | "export",
  primaryAction: SubmissionNextStepAction,
  blockers: string[],
) {
  if (primaryAction.id === "resolve_passport_conflicts") return "Есть конфликт паспорта";
  if (primaryAction.id === "apply_passport_fields") return "Паспорт готов к применению";
  if (primaryAction.id === "wait_passport_extraction") return "Паспорт распознается";
  if (primaryAction.id === "manual_passport_entry") return "Паспорт заполнить вручную";
  if (surface === "export") {
    return submission.status === "exported" ? "Пакет уже выгружен" : "Пакет принят к выгрузке";
  }
  if (role === "admin" && surface === "review") {
    return blockers.length ? "Нужна ручная проверка блокеров" : "Фокус проверки";
  }
  return agentReadinessTitle(submission, blockerCount(submission));
}

function summaryFor(
  submission: Submission,
  surface: "agent" | "review" | "export",
  fileCounts: ReturnType<typeof mediaCounts>,
) {
  if (surface === "review") {
    return `Этап ручной проверки. Готовность ${submission.completeness.total}%.`;
  }
  if (surface === "export") {
    return `Медиа принято ${fileCounts.accepted}/${fileCounts.required}.`;
  }
  return `Готовность ${submission.completeness.total}%. Загружено ${fileCounts.uploaded}/${fileCounts.required}, принято оператором ${fileCounts.accepted}/${fileCounts.required}.`;
}

function nextActions({
  blockers,
  fileCounts,
  primaryAction,
  role,
  submission,
  surface,
}: {
  blockers: string[];
  fileCounts: ReturnType<typeof mediaCounts>;
  primaryAction: SubmissionNextStepAction;
  role: Role;
  submission: Submission;
  surface: "agent" | "review" | "export";
}) {
  if (primaryAction.kind === "passport_review") return [primaryAction.label];
  if (primaryAction.kind === "wait") return [primaryAction.label];
  if (surface === "export") {
    return submission.status === "exported"
      ? ["Проверьте историю выгрузки и не создавайте повторный пакет без причины."]
      : ["Сформируйте Эксель, скачайте файл и отметьте выгрузку после передачи."];
  }
  if (role === "admin" && surface === "review") {
    const actions = [
      `Сначала проверьте ${typeLabels[submission.type].toLowerCase()} и ${submission.applicants.length} заявителя(ей).`,
      `Медиа: ${fileCounts.uploaded}/${fileCounts.required} загружено, ${fileCounts.accepted}/${fileCounts.required} принято оператором.`,
    ];
    if (openIssueCount(submission)) {
      actions.push("Верните точечные замечания агенту вместо общего комментария.");
    } else if (blockers.length) {
      actions.push("Сначала закройте пункты готовности, затем возвращайтесь к приемке.");
    } else if (fileCounts.accepted < fileCounts.required) {
      actions.push("Примите каждый файл вручную или запросите замену с причиной.");
    } else {
      actions.push("Если визуальная проверка завершена, можно принять заявку.");
    }
    return actions;
  }
  if (blockers.length) {
    return blockers.slice(0, 3).map((blocker) => `Закрыть: ${blocker}`);
  }
  return agentReadinessActions(submission, primaryAction);
}

function ariaLabel(role: Role, surface: "agent" | "review" | "export") {
  if (role === "admin" && surface === "review") return "Фокус проверки администратора";
  if (role === "admin" && surface === "export") return "Фокус выгрузки администратора";
  return "Локальная подсказка агента";
}

function agentReadinessTitle(submission: Submission, blockerTotal: number) {
  if (blockerTotal > 0) return "Есть блокеры";
  if (openIssueCount(submission) > 0 || fixedIssueCount(submission) > 0)
    return "Нужно закрыть замечания";
  if (submission.status === "submitted_for_review") return "Пакет на ручной проверке";
  if (submission.status === "corrections_received") return "Исправления на проверке";
  if (submission.status === "ready_for_export") return "Пакет принят к выгрузке";
  if (submission.status === "exported") return "Пакет выгружен";
  if (submission.status === "returned" || submission.status === "requires_action")
    return "Нужно закрыть замечания";
  return "Можно готовить к проверке";
}

function agentReadinessActions(
  submission: Submission,
  primaryAction: SubmissionNextStepAction,
) {
  if (submission.status === "submitted_for_review") {
    return [
      "Дождитесь ручной проверки администратора и не отправляйте пакет повторно.",
    ];
  }
  if (submission.status === "corrections_received") {
    return ["Дождитесь закрытия исправлений администратором."];
  }
  if (submission.status === "ready_for_export") {
    return ["Пакет принят. Дальше его выгружает администратор."];
  }
  if (submission.status === "exported") {
    return [
      "Пакет уже выгружен. Используйте историю для проверки дальнейших действий.",
    ];
  }
  if (submission.status === "draft") {
    return ["Сохраните черновик и продолжите заполнение перед отправкой на проверку."];
  }
  if (primaryAction.submissionAction === "submit_for_review") {
    return ["Проверьте комплект визуально и отправьте заявку на ручную проверку."];
  }

  return ["Сверьте текущий статус и продолжите работу в доступном действии."];
}

function readinessBlockers(submission: Submission, role: Role): string[] {
  const blockers: string[] = [];
  const blockerTotal = blockerCount(submission);
  const unresolvedTotal = unresolvedOpenIssueCount(submission);
  const openTotal = openIssueCount(submission);
  const fixedTotal = fixedIssueCount(submission);

  if (blockerTotal) {
    blockers.push(`${blockerTotal} открытых блокера по замечаниям`);
  }
  if (unresolvedTotal > blockerTotal) {
    blockers.push(
      `${unresolvedTotal - blockerTotal} открытых замечания ждут точечного исправления`,
    );
  } else if (openTotal > blockerTotal) {
    blockers.push(
      `${openTotal - blockerTotal} замечаний ожидают закрытия администратором`,
    );
  }
  if (role === "agent" && fixedTotal && submission.status === "corrections_received") {
    blockers.push(`${fixedTotal} исправлений ждут закрытия администратором`);
  }
  if (submission.completeness.questionnaire < 100) {
    blockers.push(`Анкета заполнена на ${submission.completeness.questionnaire}%`);
  }
  if (submission.completeness.files < 100) {
    blockers.push(`Файлы готовы на ${submission.completeness.files}%`);
  }

  return blockers;
}

function mediaCounts(submission: Submission) {
  return {
    accepted: submission.files.filter((file) => file.status === "accepted").length,
    required: submission.files.length,
    uploaded: submission.files.filter((file) => file.status !== "missing").length,
  };
}
