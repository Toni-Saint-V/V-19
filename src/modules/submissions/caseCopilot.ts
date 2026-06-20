import { exportSummary } from "./exportRules";
import {
  buildPassportExtractionBrief,
  type PassportExtractionBrief,
} from "./passportExtractionBrief";
import {
  buildSubmissionNextStepBrief,
  type SubmissionNextStepAction,
  type SubmissionNextStepBrief,
} from "./submissionNextStepEngine";
import {
  blockerCount,
  fileStatusLabels,
  fileTypeLabels,
  fixedIssueCount,
  openIssueCount,
  statusLabels,
  unresolvedOpenIssueCount,
} from "./status";
import type { WorkspaceTarget } from "./workspaceModel";
import type { Role, Submission, SubmissionFileStatus } from "./types";

export type CaseCopilotStatus =
  | "ready"
  | "blocked"
  | "waiting"
  | "needs_review"
  | "complete";

export type CaseCopilotOwner = Role | "system";

export type CaseCopilotHighlightKind =
  | "passport"
  | "questionnaire"
  | "files"
  | "issues"
  | "export";

export type CaseCopilotDraft = {
  audience: Role;
  body: string;
  title: string;
};

export type CaseCopilotHighlight = {
  detail?: string;
  kind: CaseCopilotHighlightKind;
  label: string;
  owner?: CaseCopilotOwner;
  status: CaseCopilotStatus;
  summary: string;
  target?: WorkspaceTarget;
};

export type CaseCopilotBrief = {
  actions: string[];
  drafts: CaseCopilotDraft[];
  guardrails: string[];
  highlights: CaseCopilotHighlight[];
  nextStep: SubmissionNextStepAction;
  owner: CaseCopilotOwner;
  status: CaseCopilotStatus;
  summary: string;
  title: string;
};

const guardrails = [
  "Подсказка не принимает визовые решения.",
  "Не оценивайте вероятность результата и не обещайте исход.",
  "Паспортные поля требуют ручной сверки перед применением.",
  "Детерминированные проверки остаются источником истины.",
  "Ручная проверка остается обязательной для спорных данных.",
];

export function buildCaseCopilotBrief({
  role,
  submission,
  surface,
}: {
  role: Role;
  submission: Submission;
  surface: "agent" | "review" | "export";
}): CaseCopilotBrief {
  const nextStepBrief = buildSubmissionNextStepBrief({ role, submission, surface });
  const passportBrief = buildPassportExtractionBrief(submission);
  const exportPlan = exportSummary([submission]);
  const actionLockedByLifecycleWait = isAgentLifecycleWait(role, surface, submission);
  const highlights = compactHighlights([
    passportHighlight(submission, passportBrief, actionLockedByLifecycleWait),
    questionnaireHighlight(submission, surface),
    filesHighlight(submission, surface),
    issuesHighlight(submission, role),
    exportHighlightForSurface(submission, surface, exportPlan),
  ]);
  const status = caseStatusFor({
    nextStepBrief,
    passportBrief,
    submission,
    surface,
  });

  return {
    actions: nextStepBrief.actions,
    drafts: draftsFor(submission, role, surface, highlights, exportPlan.rowCount),
    guardrails,
    highlights,
    nextStep: nextStepBrief.primaryAction,
    owner: nextStepBrief.owner,
    status,
    summary: summaryFor(submission, nextStepBrief, surface),
    title: nextStepBrief.title,
  };
}

function caseStatusFor({
  nextStepBrief,
  passportBrief,
  submission,
  surface,
}: {
  nextStepBrief: SubmissionNextStepBrief;
  passportBrief: PassportExtractionBrief;
  submission: Submission;
  surface: "agent" | "review" | "export";
}): CaseCopilotStatus {
  if (submission.status === "exported") return "complete";
  if (nextStepBrief.status === "waiting" || nextStepBrief.primaryAction.kind === "wait") {
    return "waiting";
  }
  if (passportBrief.status === "extracting") return "waiting";
  if (surface === "export") return exportSummary([submission]).ready ? "ready" : "blocked";
  if (
    passportBrief.metrics.conflicts > 0 ||
    passportBrief.metrics.safeFieldsToApply > 0 ||
    nextStepBrief.primaryAction.kind === "passport_review"
  ) {
    return "needs_review";
  }
  if (surface === "review" && submission.status === "submitted_for_review") {
    return "needs_review";
  }
  if (surface === "review" && submission.status === "corrections_received") {
    return "needs_review";
  }
  if (nextStepBrief.status === "complete") return "complete";
  if (nextStepBrief.status === "ready_for_action") return "ready";
  return "blocked";
}

function isAgentLifecycleWait(
  role: Role,
  surface: "agent" | "review" | "export",
  submission: Submission,
) {
  return (
    role === "agent" &&
    surface === "agent" &&
    (submission.status === "submitted_for_review" ||
      submission.status === "corrections_received" ||
      submission.status === "ready_for_export")
  );
}

function passportHighlight(
  submission: Submission,
  brief: PassportExtractionBrief,
  actionLockedByLifecycleWait: boolean,
): CaseCopilotHighlight {
  const detail = brief.applicants
    .map((applicant) => `${applicant.applicantName}: ${applicant.summary}`)
    .join("; ");

  if (actionLockedByLifecycleWait) {
    return {
      detail,
      kind: "passport",
      label: "Паспорт",
      owner: "admin",
      status: "waiting",
      summary: "Заявка уже передана дальше; паспортные сигналы можно только смотреть до действия администратора.",
    };
  }

  if (brief.status === "extracting") {
    return {
      detail,
      kind: "passport",
      label: "Паспорт",
      owner: "system",
      status: "waiting",
      summary: "Распознавание паспорта выполняется.",
    };
  }

  if (brief.metrics.conflicts > 0) {
    return {
      detail,
      kind: "passport",
      label: "Паспорт",
      owner: "agent",
      status: "needs_review",
      summary: `${brief.metrics.conflicts} конфликтных паспортных полей нужно разобрать вручную.`,
    };
  }

  if (brief.metrics.safeFieldsToApply > 0) {
    return {
      detail,
      kind: "passport",
      label: "Паспорт",
      owner: "agent",
      status: "needs_review",
      summary: `${brief.metrics.safeFieldsToApply} паспортных полей можно применить после ручной сверки.`,
    };
  }

  if (brief.status === "failed" || brief.status === "unavailable") {
    return {
      detail,
      kind: "passport",
      label: "Паспорт",
      owner: "agent",
      status: "blocked",
      summary: "Паспортные данные нужно заполнить вручную.",
    };
  }

  if (brief.status === "review_required") {
    return {
      detail,
      kind: "passport",
      label: "Паспорт",
      owner: "agent",
      status: "needs_review",
      summary: "Паспортные поля ждут ручного подтверждения.",
    };
  }

  if (brief.status === "reviewed") {
    return {
      detail,
      kind: "passport",
      label: "Паспорт",
      owner: "agent",
      status: "ready",
      summary: "Паспортные поля сверены локальными правилами и ручным шагом.",
    };
  }

  return {
    detail,
    kind: "passport",
    label: "Паспорт",
    owner: "agent",
    status: passportFilesMissing(submission) ? "blocked" : "ready",
    summary: passportFilesMissing(submission)
      ? "Скан паспорта еще не загружен для части заявителей."
      : "Паспортные данные проверяются вручную без распознавания.",
  };
}

function questionnaireHighlight(
  submission: Submission,
  surface: "agent" | "review" | "export",
): CaseCopilotHighlight {
  const incomplete = submission.applicants.flatMap((applicant) =>
    applicant.sections
      .filter((section) => section.status !== "complete")
      .map((section) =>
        [applicant.fullName, section.title, section.missing].filter(Boolean).join(" · "),
      ),
  );
  const complete = submission.completeness.questionnaire >= 100;
  const needsReview = surface === "review" && complete;

  return {
    detail: incomplete.join("; "),
    kind: "questionnaire",
    label: "Анкета",
    owner: complete ? "admin" : "agent",
    status: complete ? (needsReview ? "needs_review" : "ready") : "blocked",
    summary: complete
      ? "Анкетные поля заполнены, нужна обычная ручная сверка по процессу."
      : `Анкета заполнена на ${submission.completeness.questionnaire}%.`,
  };
}

function filesHighlight(
  submission: Submission,
  surface: "agent" | "review" | "export",
): CaseCopilotHighlight {
  const counts = fileCounts(submission);
  const blocked = counts.missing + counts.needs_replacement > 0;
  const pending = counts.pending_review > 0;

  return {
    detail: fileDetails(submission),
    kind: "files",
    label: "Файлы",
    owner: blocked ? "agent" : "admin",
    status: blocked ? "blocked" : pending || surface === "review" ? "needs_review" : "ready",
    summary: blocked
      ? `Файлы готовы на ${submission.completeness.files}%; ${counts.missing} отсутствуют, ${counts.needs_replacement} требуют замены.`
      : pending
        ? `${counts.pending_review} файлов ждут ручной проверки администратора.`
        : `${counts.accepted}/${counts.required} файлов приняты.`,
  };
}

function issuesHighlight(
  submission: Submission,
  role: Role,
): CaseCopilotHighlight {
  const open = openIssueCount(submission);
  const fixed = fixedIssueCount(submission);
  const blockers = blockerCount(submission);
  const unresolved = unresolvedOpenIssueCount(submission);
  const detail = submission.issues
    .filter((issue) => issue.status !== "closed_by_admin")
    .map((issue) => `${issue.target.applicantName}: ${issue.reason}`)
    .join("; ");

  if (open > 0) {
    const summary =
      unresolved > 0
        ? `${open} открытых замечаний: ${blockers} блокеров, ${unresolved} требуют исправления.`
        : `${open} замечаний ожидают закрытия администратором.`;

    return {
      detail,
      kind: "issues",
      label: "Замечания",
      owner: role === "admin" ? "admin" : "agent",
      status: "blocked",
      summary,
    };
  }

  if (fixed > 0) {
    return {
      detail,
      kind: "issues",
      label: "Замечания",
      owner: "admin",
      status: "waiting",
      summary: `${fixed} исправлений ждут закрытия администратором.`,
    };
  }

  return {
    kind: "issues",
    label: "Замечания",
    owner: "system",
    status: "ready",
    summary: "Открытых замечаний нет.",
  };
}

function exportHighlightForSurface(
  submission: Submission,
  surface: "agent" | "review" | "export",
  plan: ReturnType<typeof exportSummary>,
): CaseCopilotHighlight | null {
  if (surface !== "export") return null;

  if (submission.status === "exported") {
    return {
      kind: "export",
      label: "Выгрузка",
      owner: "admin",
      status: "complete",
      summary: "Пакет уже выгружен, повторное действие не требуется.",
    };
  }

  if (!plan.ready) {
    return {
      detail: plan.blockers.map((blocker) => blocker.reason).join("; "),
      kind: "export",
      label: "Выгрузка",
      owner: "admin",
      status: "blocked",
      summary: "Пакет не готов к выгрузке.",
    };
  }

  return {
    kind: "export",
    label: "Выгрузка",
    owner: "admin",
    status: "ready",
    summary: `${plan.rowCount} строк(и) готовы к Эксель-выгрузке.`,
  };
}

function draftsFor(
  submission: Submission,
  role: Role,
  surface: "agent" | "review" | "export",
  highlights: CaseCopilotHighlight[],
  exportRows: number,
): CaseCopilotDraft[] {
  if (surface === "export" && submission.status === "ready_for_export") {
    return [
      {
        audience: "admin",
        body: `Проверьте состав выгрузки: ${exportRows} строк(и), ${submission.city}, ${submission.tripDateFrom}-${submission.tripDateTo}. После скачивания отметьте пакет выгруженным только один раз.`,
        title: "Черновик контроля выгрузки",
      },
    ];
  }

  if (role === "admin" && surface === "review") {
    return [
      {
        audience: "admin",
        body: adminReviewDraft(submission, highlights),
        title: "Черновик решения для ручной проверки",
      },
    ];
  }

  if (
    role === "agent" &&
    surface === "agent" &&
    openIssueCount(submission) > 0
  ) {
    return [
      {
        audience: "agent",
        body: `Исправьте точечные замечания по заявке ${submission.id}: ${issueReasons(submission)}. После сохранения отправьте исправления на ручную проверку.`,
        title: "Черновик ответа по исправлениям",
      },
    ];
  }

  return [];
}

function summaryFor(
  submission: Submission,
  nextStepBrief: SubmissionNextStepBrief,
  surface: "agent" | "review" | "export",
) {
  const prefix =
    submission.type === "family"
      ? `Семейная подача, ${submission.applicants.length} заявителя: ${applicantNames(submission)}.`
      : `Подача: ${applicantNames(submission)}.`;
  const state = `${statusLabels[submission.status]}. ${nextStepBrief.summary}`;

  if (surface === "export") return `${prefix} Экспорт: ${state}`;
  return `${prefix} ${state}`;
}

function adminReviewDraft(
  submission: Submission,
  highlights: CaseCopilotHighlight[],
) {
  const blockers = highlights
    .filter(
      (highlight) => highlight.status === "blocked" && highlight.kind !== "export",
    )
    .map((highlight) => `${highlight.label}: ${highlight.summary}`);
  const issueText = issueReasons(submission);

  if (blockers.length) {
    return `Проверьте заявителей ${applicantNames(submission)}. Верните только точные замечания: ${blockers.join("; ")}${issueText ? `; текущие замечания: ${issueText}` : ""}.`;
  }

  return `Проверьте заявителей ${applicantNames(submission)}, файлы и анкету. Если ручная сверка без замечаний, можно принять по штатному процессу.`;
}

function fileCounts(submission: Submission): Record<SubmissionFileStatus, number> & {
  required: number;
} {
  const counts = {
    accepted: 0,
    missing: 0,
    needs_replacement: 0,
    pending_review: 0,
    uploaded: 0,
  } satisfies Record<SubmissionFileStatus, number>;

  for (const file of submission.files) {
    counts[file.status] += 1;
  }

  return {
    ...counts,
    required: submission.files.length,
  };
}

function fileDetails(submission: Submission) {
  return submission.files
    .filter((file) => file.status !== "accepted")
    .map((file) => {
      const applicant = submission.applicants.find(
        (item) => item.id === file.applicantId,
      );
      return `${applicant?.fullName ?? "Заявитель"}: ${fileTypeLabels[file.type]} - ${fileStatusLabels[file.status]}`;
    })
    .join("; ");
}

function passportFilesMissing(submission: Submission) {
  return submission.files.some(
    (file) => file.type === "passport_scan" && file.status === "missing",
  );
}

function issueReasons(submission: Submission) {
  return submission.issues
    .filter((issue) => issue.status === "open")
    .map((issue) => `${issue.target.applicantName} - ${issue.reason}`)
    .join("; ");
}

function applicantNames(submission: Submission) {
  return submission.applicants.map((applicant) => applicant.fullName).join(", ");
}

export function formatCaseCopilotHighlight(highlight: CaseCopilotHighlight) {
  return [highlight.label, highlight.summary, highlight.detail]
    .filter(Boolean)
    .join(": ");
}

function compactHighlights(
  highlights: Array<CaseCopilotHighlight | null>,
): CaseCopilotHighlight[] {
  return highlights.filter((highlight): highlight is CaseCopilotHighlight =>
    Boolean(highlight),
  );
}
