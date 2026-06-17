import {
  blockerCount,
  fixedIssueCount,
  openIssueCount,
  typeLabels,
  unresolvedOpenIssueCount,
} from "./status";
import type { Role, Submission } from "./types";

type AiHelperSectionId = "blockers" | "focus" | "actions" | "guardrails";

export type AiHelperSurfaceModel = {
  ariaLabel: string;
  title: string;
  summary: string;
  sections: Array<{
    id: AiHelperSectionId;
    title: string;
    items: string[];
  }>;
};

const guardrails = [
  "Подсказка не является решением.",
  "Детерминированные проверки остаются источником истины.",
  "Оператор принимает медиа и заявку вручную.",
];

export function buildSubmissionAiHelperSurface({
  role,
  submission,
  surface,
}: {
  role: Role;
  submission: Submission;
  surface: "agent" | "review" | "export";
}): AiHelperSurfaceModel {
  if (role === "admin" && surface === "review") {
    return buildAdminReviewSurface(submission);
  }
  if (role === "admin" && surface === "export") {
    return buildExportSurface(submission);
  }

  return buildAgentReadinessSurface(submission);
}

function buildAgentReadinessSurface(submission: Submission): AiHelperSurfaceModel {
  const blockers = readinessBlockers(submission);
  const hardBlockers = blockerCount(submission);
  const fileCounts = mediaCounts(submission);
  const readyForAgentHandoff =
    blockers.length === 0 && submission.status === "in_progress";

  return {
    ariaLabel: "Локальная подсказка агента",
    title: agentReadinessTitle(submission, hardBlockers),
    summary: `Готовность ${submission.completeness.total}%. Загружено ${fileCounts.uploaded}/${fileCounts.required}, принято оператором ${fileCounts.accepted}/${fileCounts.required}.`,
    sections: compactSections([
      {
        id: "blockers",
        title: "Что мешает движению",
        items: blockers,
      },
      {
        id: "actions",
        title: "Следующие действия",
        items: agentReadinessActions(submission, blockers, readyForAgentHandoff),
      },
      {
        id: "guardrails",
        title: "Границы подсказки",
        items: guardrails,
      },
    ]),
  };
}

function buildAdminReviewSurface(submission: Submission): AiHelperSurfaceModel {
  const blockers = readinessBlockers(submission);
  const hardBlockers = blockerCount(submission);
  const fileCounts = mediaCounts(submission);
  const openIssues = openIssueCount(submission);
  const actions = [
    `Сначала проверьте ${typeLabels[submission.type].toLowerCase()} и ${submission.applicants.length} заявителя(ей).`,
    `Медиа: ${fileCounts.uploaded}/${fileCounts.required} загружено, ${fileCounts.accepted}/${fileCounts.required} принято оператором.`,
  ];

  if (openIssues) {
    actions.push("Верните точечные замечания агенту вместо общего комментария.");
  } else if (blockers.length) {
    actions.push("Сначала закройте пункты готовности, затем возвращайтесь к приемке.");
  } else if (fileCounts.accepted < fileCounts.required) {
    actions.push("Примите каждый файл вручную или запросите замену с причиной.");
  } else {
    actions.push("Если визуальная проверка завершена, можно принять заявку.");
  }

  return {
    ariaLabel: "Фокус проверки администратора",
    title: hardBlockers ? "Нужна ручная проверка блокеров" : "Фокус проверки",
    summary: `Этап ручной проверки. Готовность ${submission.completeness.total}%.`,
    sections: compactSections([
      {
        id: "blockers",
        title: "Что проверить",
        items: blockers,
      },
      {
        id: "actions",
        title: "Следующие действия",
        items: actions,
      },
      {
        id: "guardrails",
        title: "Границы подсказки",
        items: guardrails,
      },
    ]),
  };
}

function buildExportSurface(submission: Submission): AiHelperSurfaceModel {
  const blockers = readinessBlockers(submission);
  const fileCounts = mediaCounts(submission);

  return {
    ariaLabel: "Фокус выгрузки администратора",
    title:
      submission.status === "exported"
        ? "Пакет уже выгружен"
        : "Пакет принят к выгрузке",
    summary: `Медиа принято ${fileCounts.accepted}/${fileCounts.required}.`,
    sections: compactSections([
      {
        id: "blockers",
        title: "Что проверить",
        items: blockers,
      },
      {
        id: "actions",
        title: "Следующие действия",
        items:
          submission.status === "exported"
            ? [
                "Проверьте историю выгрузки и не создавайте повторный пакет без причины.",
              ]
            : ["Сформируйте Эксель, скачайте файл и отметьте выгрузку после передачи."],
      },
      {
        id: "guardrails",
        title: "Границы подсказки",
        items: guardrails,
      },
    ]),
  };
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
  blockers: string[],
  readyForAgentHandoff: boolean,
) {
  if (blockers.length)
    return blockers.slice(0, 3).map((blocker) => `Закрыть: ${blocker}`);

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
  if (readyForAgentHandoff) {
    return ["Проверьте комплект визуально и отправьте заявку на ручную проверку."];
  }

  return ["Сверьте текущий статус и продолжите работу в доступном действии."];
}

function readinessBlockers(submission: Submission): string[] {
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
  if (fixedTotal && submission.status === "corrections_received") {
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

function compactSections(
  sections: AiHelperSurfaceModel["sections"],
): AiHelperSurfaceModel["sections"] {
  return sections
    .map((section) => ({
      ...section,
      items: section.items.map((item) => item.trim()).filter(Boolean),
    }))
    .filter((section) => section.items.length > 0);
}
