import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { QuestionnaireScreen } from "../../src/components/QuestionnaireScreen";
import { createDraftSubmission } from "../../src/modules/submissions/submissionActions";
import type { Submission } from "../../src/modules/submissions/types";

afterEach(() => {
  cleanup();
});

function fieldValue(submission: Submission, fieldId: string) {
  return (
    submission.applicants[0]?.sections
      .flatMap((section) => section.fields)
      .find((field) => field.id === fieldId)?.value ?? ""
  );
}

describe("QuestionnaireScreen", () => {
  test("persists changed questionnaire fields through the agent submission bridge", async () => {
    const submission = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const onSubmissionChange = vi.fn();

    render(
      <QuestionnaireScreen
        onBack={vi.fn()}
        onSubmissionChange={onSubmissionChange}
        submission={submission}
        submissionId={submission.id}
      />,
    );

    fireEvent.change(screen.getByLabelText("Фамилия"), {
      target: { value: "VOLKOV" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Готово/ }));

    await waitFor(() => expect(onSubmissionChange).toHaveBeenCalledTimes(1));

    const nextSubmission = onSubmissionChange.mock.calls[0]?.[0] as Submission;
    expect(fieldValue(nextSubmission, "surname")).toBe("VOLKOV");
    expect(nextSubmission.status).toBe("in_progress");
  });
});
