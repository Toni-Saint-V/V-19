import {
  buildSubmissionNextStepBrief,
  type SubmissionNextStepAction,
} from "./submissionNextStepEngine";
import type { Role, Submission } from "./types";

type AiHelperSectionId = "blockers" | "actions" | "guardrails";

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
  const brief = buildSubmissionNextStepBrief({ role, submission, surface });

  return {
    ariaLabel: brief.ariaLabel,
    primaryAction: brief.primaryAction,
    summary: brief.summary,
    title: brief.title,
    sections: compactSections([
      {
        id: "blockers",
        title: role === "admin" ? "Что проверить" : "Что мешает движению",
        items: brief.blockers,
      },
      {
        id: "actions",
        title: "Следующие действия",
        items: brief.actions,
      },
      {
        id: "guardrails",
        title: "Границы подсказки",
        items: brief.guardrails,
      },
    ]),
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
