import type { Submission } from "../types/domain";
import { buildAiHelperDisplayModel } from "./aiHelperDisplayModel";
import {
  buildAdminReviewSummary,
  buildExportGuard,
  buildReadinessSummary,
  buildTextIntakeReview,
  draftCorrectionText,
  type AiHelperResult,
} from "./aiHelperService";
import type { AiHelperDisplayModel } from "./aiHelperDisplayModel";

export type AiHelperFacadeInput =
  | {
      intent: "readiness_summary" | "text_intake_review" | "admin_review";
      submission: Submission;
    }
  | {
      intent: "correction_draft";
      submission: Submission;
      targetLabel: string;
    }
  | {
      intent: "export_guard";
      submissions: Submission[];
    };

export interface AiHelperSurface {
  result: AiHelperResult;
  display: AiHelperDisplayModel;
}

export function buildAiHelperResult(input: AiHelperFacadeInput): AiHelperResult {
  switch (input.intent) {
    case "readiness_summary":
      return buildReadinessSummary(input.submission);
    case "text_intake_review":
      return buildTextIntakeReview(input.submission);
    case "admin_review":
      return buildAdminReviewSummary(input.submission);
    case "correction_draft":
      return draftCorrectionText(input.submission, input.targetLabel);
    case "export_guard":
      return buildExportGuard(input.submissions);
  }
}

export function buildAiHelperSurface(input: AiHelperFacadeInput): AiHelperSurface {
  const result = buildAiHelperResult(input);

  return {
    result,
    display: buildAiHelperDisplayModel(result),
  };
}
