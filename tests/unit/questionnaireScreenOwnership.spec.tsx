import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, test, vi } from "vitest";
import {
  createDraftSubmission,
  uploadRequiredFiles,
} from "../../src/modules/submissions/submissionActions";
import type { Submission } from "../../src/modules/submissions/types";
import {
  adminApprovePassportFieldsForTest,
  fillRequiredQuestionnaireForTest,
} from "./helpers/questionnaireTestFill";

const completionState = vi.hoisted(() => ({
  onRejected: vi.fn(),
}));

vi.mock(
  "../../src/modules/submissions/components/FigmaQuestionnaireScreen",
  () => ({
    FigmaQuestionnaireScreen: ({
      onComplete,
    }: {
      onComplete: (payload: {
        fieldUpdates: [];
        reviewConfirmations: [];
        saveIntent: "completion";
        travelEnd: string;
        travelStart: string;
      }) => Promise<void>;
    }) => (
      <button
        type="button"
        onClick={() => {
          void onComplete({
            fieldUpdates: [],
            reviewConfirmations: [],
            saveIntent: "completion",
            travelEnd: "2026-08-20",
            travelStart: "2026-08-11",
          }).catch((error: unknown) => completionState.onRejected(error));
        }}
      >
        Complete questionnaire
      </button>
    ),
  }),
);

import { QuestionnaireScreen } from "../../src/components/QuestionnaireScreen";

describe("QuestionnaireScreen ownership boundary", () => {
  test("rejects a foreign snapshot when completion uses the session actor", async () => {
    completionState.onRejected.mockClear();
    const draft = createDraftSubmission({
      applicantNames: ["Мария Иванова"],
      city: "Москва",
      familyCount: 1,
      idScheme: "supabase",
      submissions: [],
      type: "single",
    });
    const foreignSubmission: Submission = adminApprovePassportFieldsForTest({
      ...uploadRequiredFiles(fillRequiredQuestionnaireForTest(draft)),
      agentId: "snapshot-owner",
      status: "in_progress",
      tripDateFrom: "2026-08-11",
      tripDateTo: "2026-08-20",
    });
    const onSubmissionChange = vi.fn();
    const onSubmitForReview = vi.fn();

    render(
      <QuestionnaireScreen
        agentId="session-agent"
        onBack={vi.fn()}
        onSubmissionChange={onSubmissionChange}
        onSubmitForReview={onSubmitForReview}
        submission={foreignSubmission}
        submissionId={foreignSubmission.id}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Complete questionnaire" }));

    await waitFor(() => {
      expect(completionState.onRejected).toHaveBeenCalledWith(
        expect.objectContaining({
          message: "Agent can submit only an owned submission.",
        }),
      );
    });
    expect(onSubmissionChange).not.toHaveBeenCalled();
    expect(onSubmitForReview).not.toHaveBeenCalled();
    expect(foreignSubmission.agentId).toBe("snapshot-owner");
  });
});
