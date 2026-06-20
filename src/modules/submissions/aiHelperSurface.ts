import {
  buildCaseCopilotBrief,
  formatCaseCopilotHighlight,
} from "./caseCopilot";
import type { SubmissionNextStepAction } from "./submissionNextStepEngine";
import type { Role, Submission } from "./types";

type AiHelperSectionId = "blockers" | "actions" | "drafts" | "guardrails";

export type AiHelperSurfaceModel = {
  ariaLabel: string;
  primaryAction: SubmissionNextStepAction;
  summary: string;
  title: string;
  sections: Array<{
    id: AiHelperSectionId;
    title: string;
    items: string[];
  }>;
};

export function buildSubmissionAiHelperSurface({
  role,
  submission,
  surface,
}: {
  role: Role;
  submission: Submission;
  surface: "agent" | "review" | "export";
}): AiHelperSurfaceModel {
  const brief = buildCaseCopilotBrief({ role, submission, surface });

  return {
    ariaLabel: ariaLabel(role, surface),
    primaryAction: brief.nextStep,
    summary: brief.summary,
    title: brief.title,
    sections: compactSections([
      {
        id: "blockers",
        title: role === "admin" ? "Что проверить" : "Что мешает движению",
        items: brief.highlights.map(formatCaseCopilotHighlight),
      },
      {
        id: "actions",
        title: "Следующие действия",
        items: brief.actions,
      },
      {
        id: "drafts",
        title: "Черновики",
        items: brief.drafts.map((draft) => `${draft.title}: ${draft.body}`),
      },
      {
        id: "guardrails",
        title: "Границы подсказки",
        items: brief.guardrails,
      },
    ]),
  };
}

function ariaLabel(role: Role, surface: "agent" | "review" | "export") {
  if (role === "admin" && surface === "review") return "Фокус проверки администратора";
  if (role === "admin" && surface === "export") return "Фокус выгрузки администратора";
  return "Локальная подсказка агента";
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
