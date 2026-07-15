import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { QuestionnaireScreen } from "../../src/components/QuestionnaireScreen";
import { markSubmissionIssueFixedResult } from "../../src/modules/submissions/status";
import { createDraftSubmission } from "../../src/modules/submissions/submissionActions";
import type { Submission } from "../../src/modules/submissions/types";
import { fillRequiredQuestionnaireForTest } from "./helpers/questionnaireTestFill";

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

function readySubmission(status: Submission["status"]) {
  const draft = createDraftSubmission({
    applicantNames: ["VOLKOV ANTON"],
    city: "Москва",
    familyCount: 1,
    idScheme: "local",
    submissions: [],
    type: "single",
  });
  const filled = fillRequiredQuestionnaireForTest(draft);

  return {
    ...filled,
    files: filled.applicants.flatMap((applicant) =>
      (["passport_scan", "selfie", "selfie_2"] as const).map((type) => ({
        applicantId: applicant.id,
        id: `${applicant.id}-${type}`,
        reviewStatus: "accepted" as const,
        status: "accepted" as const,
        type,
        uploadStatus: "uploaded" as const,
      })),
    ),
    status,
    tripDateFrom: "10.07.2026",
    tripDateTo: "18.07.2026",
  } satisfies Submission;
}

function withPendingPassportExtraction(submission: Submission): Submission {
  const applicant = submission.applicants[0];
  if (!applicant) throw new Error("expected applicant");
  const passportNumber = fieldValue(submission, "passport-no");

  return {
    ...submission,
    applicants: submission.applicants.map((candidate) =>
      candidate.id === applicant.id
        ? {
            ...candidate,
            passportExtraction: {
              appliedFieldKeys: ["passportNumber"],
              extractedFields: [
                {
                  confidence: "high" as const,
                  key: "passportNumber" as const,
                  needsManualReview: true,
                  source: "passport_scan" as const,
                  value: passportNumber,
                  verified: false,
                },
              ],
              sourceFileId: submission.files.find(
                (file) =>
                  file.applicantId === applicant.id && file.type === "passport_scan",
              )?.id,
              status: "ready" as const,
            },
            sections: candidate.sections.map((section) => ({
              ...section,
              fields: section.fields.map((field) =>
                field.id === "passport-no"
                  ? {
                      ...field,
                      reviewSource: "passport_ocr" as const,
                      reviewState: "needs_review" as const,
                    }
                  : field,
              ),
            })),
          }
        : candidate,
    ),
  };
}

describe("QuestionnaireScreen", () => {
  test("saves partial questionnaire changes as a draft through the agent submission bridge", async () => {
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
    fireEvent.click(screen.getByRole("button", { name: "Сохранить и выйти" }));

    await waitFor(() => expect(onSubmissionChange).toHaveBeenCalledTimes(1));

    const nextSubmission = onSubmissionChange.mock.calls[0]?.[0] as Submission;
    expect(fieldValue(nextSubmission, "surname")).toBe("VOLKOV");
    expect(nextSubmission.status).toBe("draft");
  });

  test("applies a questionnaire save to the latest serialized submission snapshot", async () => {
    const submission = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const file = submission.files[0];
    if (!file) throw new Error("expected file slot");
    let latestSubmission = {
      ...submission,
      files: submission.files.map((candidate) =>
        candidate.id === file.id
          ? {
              ...candidate,
              generatedFileName: "latest-passport.png",
              originalFileName: "latest-passport.png",
              status: "uploaded" as const,
              storageBucket: "submission-media",
              storagePath: "latest/storage/path",
              uploadStatus: "uploaded" as const,
            }
          : candidate,
      ),
    };
    const onSubmissionUpdate = vi.fn(
      async (update: (current: Submission) => Submission) => {
        latestSubmission = update(latestSubmission);
        return latestSubmission;
      },
    );

    render(
      <QuestionnaireScreen
        onBack={vi.fn()}
        onSubmissionUpdate={onSubmissionUpdate}
        submission={submission}
        submissionId={submission.id}
      />,
    );

    fireEvent.change(screen.getByLabelText("Фамилия"), {
      target: { value: "VOLKOV" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить и выйти" }));

    await waitFor(() => expect(onSubmissionUpdate).toHaveBeenCalledTimes(1));
    expect(fieldValue(latestSubmission, "surname")).toBe("VOLKOV");
    expect(latestSubmission.files[0]).toMatchObject({
      generatedFileName: "latest-passport.png",
      storagePath: "latest/storage/path",
      uploadStatus: "uploaded",
    });
  });

  test("keeps debounce autosave out of history while recording an explicit manual save", async () => {
    const submission = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const onSubmissionChange = vi.fn().mockResolvedValue(undefined);

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
    await waitFor(() => expect(onSubmissionChange).toHaveBeenCalledTimes(1), {
      timeout: 2_000,
    });

    const autosaved = onSubmissionChange.mock.calls[0]?.[0] as Submission;
    expect(autosaved.history).toHaveLength(submission.history.length);
    expect(fieldValue(autosaved, "surname")).toBe("VOLKOV");

    fireEvent.click(screen.getByRole("button", { name: "Сохранить и выйти" }));
    await waitFor(() => expect(onSubmissionChange).toHaveBeenCalledTimes(2));

    const manuallySaved = onSubmissionChange.mock.calls[1]?.[0] as Submission;
    expect(manuallySaved.history).toHaveLength(submission.history.length + 1);
    expect(manuallySaved.history[0]?.text).toBe("Черновик анкеты сохранён");
  });

  test("keeps a submitted questionnaire read-only without attempting a mutation", () => {
    const submission = readySubmission("submitted_for_review");
    const onSubmissionChange = vi.fn().mockResolvedValue(undefined);
    const onSubmitForReview = vi.fn();

    render(
      <QuestionnaireScreen
        onBack={vi.fn()}
        onSubmissionChange={onSubmissionChange}
        onSubmitForReview={onSubmitForReview}
        submission={submission}
        submissionId={submission.id}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Отправить на проверку" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Сохранить и выйти" }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("questionnaire-read-only-status")).toHaveTextContent(
      "На проверке",
    );
    expect(screen.getByLabelText("Фамилия")).toBeDisabled();
    expect(onSubmissionChange).not.toHaveBeenCalled();
    expect(onSubmitForReview).not.toHaveBeenCalled();
    expect(screen.queryByText("Отправлено на проверку")).not.toBeInTheDocument();
  });

  test("does not retain an optimistic submitted lifecycle after Supabase rejects", async () => {
    const submission = readySubmission("in_progress");
    const onSubmissionChange = vi
      .fn()
      .mockRejectedValueOnce(new Error("Supabase недоступен"))
      .mockResolvedValueOnce(undefined);

    render(
      <QuestionnaireScreen
        onBack={vi.fn()}
        onSubmissionChange={onSubmissionChange}
        submission={submission}
        submissionId={submission.id}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Отправить на проверку" }));
    await waitFor(() =>
      expect(screen.getAllByText("Supabase недоступен").length).toBeGreaterThan(0),
    );

    fireEvent.click(screen.getByRole("button", { name: "Сохранить и выйти" }));
    await waitFor(() => expect(onSubmissionChange).toHaveBeenCalledTimes(2));

    const retrySubmission = onSubmissionChange.mock.calls[1]?.[0] as Submission;
    expect(retrySubmission.status).toBe("in_progress");
  });

  test("runs returned corrections from field edit through fixed_by_agent to corrections_received", async () => {
    const returned = readySubmission("returned");
    const applicant = returned.applicants[0];
    if (!applicant) throw new Error("expected applicant");
    const surname = applicant.sections
      .flatMap((section) => section.fields)
      .find((field) => field.id === "surname");
    if (!surname) throw new Error("expected surname field");
    const withOpenIssue: Submission = {
      ...returned,
      issues: [
        {
          comment: "Исправьте фамилию и отправьте повторно.",
          createdAt: "2026-07-11T00:00:00.000Z",
          createdBy: "admin",
          id: "issue-returned-surname",
          reason: "Фамилия требует исправления",
          severity: "blocker",
          snapshot: surname.value,
          status: "open",
          target: {
            applicantId: applicant.id,
            applicantName: applicant.fullName,
            field: surname.label,
            section: "Личные данные",
          },
          type: "field",
        },
      ],
    };
    const onSubmissionChange = vi.fn().mockResolvedValue(undefined);
    const onSubmitForReview = vi.fn();
    const result = render(
      <QuestionnaireScreen
        onBack={vi.fn()}
        onSubmissionChange={onSubmissionChange}
        onSubmitForReview={onSubmitForReview}
        submission={withOpenIssue}
        submissionId={withOpenIssue.id}
      />,
    );

    fireEvent.change(screen.getByLabelText("Фамилия"), {
      target: { value: `${surname.value}A` },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить и выйти" }));
    await waitFor(() => expect(onSubmissionChange).toHaveBeenCalledTimes(1));

    const edited = onSubmissionChange.mock.calls[0]?.[0] as Submission;
    expect(edited.status).toBe("returned");
    expect(edited.issues[0]?.status).toBe("open");
    const fixedResult = markSubmissionIssueFixedResult(
      edited,
      "issue-returned-surname",
      "agent",
    );
    if (!fixedResult.ok) throw new Error(fixedResult.error.message);
    expect(fixedResult.data.issues[0]?.status).toBe("fixed_by_agent");

    result.rerender(
      <QuestionnaireScreen
        onBack={vi.fn()}
        onSubmissionChange={onSubmissionChange}
        onSubmitForReview={onSubmitForReview}
        submission={fixedResult.data}
        submissionId={fixedResult.data.id}
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Отправить исправления" })).toBeEnabled(),
    );
    fireEvent.click(screen.getByRole("button", { name: "Отправить исправления" }));
    await waitFor(() => expect(onSubmissionChange).toHaveBeenCalledTimes(2));

    const corrections = onSubmissionChange.mock.calls[1]?.[0] as Submission;
    expect(corrections.status).toBe("corrections_received");
    expect(corrections.issues[0]?.status).toBe("fixed_by_agent");
    expect(corrections.history[0]?.text).toContain("Агент отправил исправления");
    expect(onSubmitForReview).toHaveBeenCalledWith(corrections.id);
  });

  test("blocks untouched OCR values and submits only after explicit confirmation", async () => {
    const submission = withPendingPassportExtraction(
      readySubmission("in_progress"),
    );
    const onSubmissionChange = vi.fn().mockResolvedValue(undefined);

    render(
      <QuestionnaireScreen
        onBack={vi.fn()}
        onSubmissionChange={onSubmissionChange}
        submission={submission}
        submissionId={submission.id}
      />,
    );

    const completeButton = screen.getByRole("button", { name: "Отправить на проверку" });
    expect(completeButton).toBeEnabled();
    expect(onSubmissionChange).not.toHaveBeenCalled();

    fireEvent.click(completeButton);
    expect(onSubmissionChange).not.toHaveBeenCalled();

    const passportSectionButton = screen
      .getAllByRole("button", { name: /Паспорт/ })
      .find((button) => !button.hasAttribute("disabled"));
    if (!passportSectionButton) throw new Error("expected passport section button");
    fireEvent.click(passportSectionButton);
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Подтвердить поле: Номер паспорта",
      }),
    );
    await waitFor(() => expect(completeButton).toHaveClass("is-ready"));
    fireEvent.click(completeButton);

    await waitFor(() => expect(onSubmissionChange).toHaveBeenCalledTimes(2));
    const submitted = onSubmissionChange.mock.calls[1]?.[0] as Submission;
    const submittedApplicant = submitted.applicants[0];
    const confirmedPassportNumber = submittedApplicant?.sections
      .flatMap((section) => section.fields)
      .find((field) => field.id === "passport-no");
    expect(submitted.status).toBe("submitted_for_review");
    expect(confirmedPassportNumber).toMatchObject({
      reviewState: "confirmed",
      reviewSource: "manual",
    });
    expect(confirmedPassportNumber?.reviewConfirmedAtIso).toBeTruthy();
    expect(submittedApplicant?.passportExtraction).toMatchObject({
      extractedFields: [expect.objectContaining({ verified: true })],
    });
    expect(submittedApplicant?.passportExtraction?.verifiedAtIso).toBeTruthy();
  });
});
