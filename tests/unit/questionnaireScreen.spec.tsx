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

function openPersonalSection() {
  const button = screen.getAllByRole("button", { name: /Личные данные/ })[0];
  if (!button) throw new Error("expected personal questionnaire section");
  fireEvent.click(button);
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
  test("normalizes a hidden legacy nationality from the passport issue country", async () => {
    const draft = readySubmission("in_progress");
    const submission: Submission = {
      ...draft,
      applicants: draft.applicants.map((applicant) => ({
        ...applicant,
        sections: applicant.sections.map((section) => ({
          ...section,
          fields: section.fields.map((field) => {
            if (field.id === "passport-issue-country") {
              return { ...field, value: "Spain" };
            }
            if (field.id === "nationality") {
              return {
                ...field,
                error: "Обязательное поле",
                required: true,
                value: "",
              };
            }
            return field;
          }),
        })),
      })),
    };
    const onSubmissionChange = vi.fn().mockResolvedValue(undefined);

    render(
      <QuestionnaireScreen
        onBack={vi.fn()}
        onSubmissionChange={onSubmissionChange}
        submission={submission}
        submissionId={submission.id}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /Текущее гражданство/ }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Сохранить и выйти" }));
    await waitFor(() => expect(onSubmissionChange).toHaveBeenCalledTimes(1));

    const normalized = onSubmissionChange.mock.calls[0]?.[0] as Submission;
    const nationality = normalized.applicants[0]?.sections
      .flatMap((section) => section.fields)
      .find((field) => field.id === "nationality");
    expect(nationality).toMatchObject({
      error: undefined,
      reviewState: "confirmed",
      value: "Spain",
    });
  });

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

    openPersonalSection();
    fireEvent.change(screen.getByLabelText("Фамилия"), {
      target: { value: "VOLKOV" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить и выйти" }));

    await waitFor(() => expect(onSubmissionChange).toHaveBeenCalledTimes(1));

    const nextSubmission = onSubmissionChange.mock.calls[0]?.[0] as Submission;
    expect(fieldValue(nextSubmission, "surname")).toBe("VOLKOV");
    expect(nextSubmission.status).toBe("draft");
  });

  test("synchronizes the applicant identity that Admin reads from questionnaire fields", async () => {
    const submission = createDraftSubmission({
      applicantNames: ["OCR PERSON"],
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

    openPersonalSection();
    fireEvent.change(screen.getByLabelText("Фамилия"), {
      target: { value: "VOLKOV" },
    });
    fireEvent.change(screen.getByLabelText("Имя"), {
      target: { value: "ANTON" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить и выйти" }));

    await waitFor(() => expect(onSubmissionChange).toHaveBeenCalledTimes(1));

    const nextSubmission = onSubmissionChange.mock.calls[0]?.[0] as Submission;
    expect(nextSubmission.applicants[0]?.fullName).toBe("ANTON VOLKOV");
    expect(nextSubmission.title).toContain("ANTON VOLKOV");
  });

  test("keeps the full save-and-exit label on the mobile action", () => {
    const submission = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });

    render(
      <QuestionnaireScreen
        onBack={vi.fn()}
        submission={submission}
        submissionId={submission.id}
      />,
    );

    const saveAndExit = screen.getByRole("button", {
      name: "Сохранить и выйти",
    });
    expect(saveAndExit).toHaveTextContent("Сохранить и выйти");
    expect(saveAndExit).not.toHaveTextContent(/^Сохранить$/);
  });

  test("assigns and announces a public number only after a complete questionnaire save", async () => {
    const submission = readySubmission("draft");
    const onAssignPublicNumber = vi.fn().mockResolvedValue({
      assignedNow: true,
      caseRevision: 8,
      publicNumber: 1059,
    });
    const onBack = vi.fn();
    const onSavedAndExit = vi.fn().mockResolvedValue(undefined);
    const onSubmissionChange = vi.fn().mockResolvedValue(undefined);
    const alert = vi.spyOn(window, "alert").mockImplementation(() => undefined);

    render(
      <QuestionnaireScreen
        onAssignPublicNumber={onAssignPublicNumber}
        onBack={onBack}
        onSavedAndExit={onSavedAndExit}
        onSubmissionChange={onSubmissionChange}
        submission={submission}
        submissionId={submission.id}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Сохранить и выйти" }));

    await waitFor(() => expect(onSavedAndExit).toHaveBeenCalledTimes(1));
    expect(onSubmissionChange).toHaveBeenCalledTimes(1);
    expect(onAssignPublicNumber).toHaveBeenCalledOnce();
    expect(onAssignPublicNumber).toHaveBeenCalledWith(submission.id);
    expect(alert).toHaveBeenCalledOnce();
    expect(alert).toHaveBeenCalledWith(
      "Анкета сохранена. Номер подачи: VF-1059",
    );
    expect(onSavedAndExit).toHaveBeenCalledWith(
      expect.objectContaining({ publicNumber: 1059 }),
    );
    expect(onBack).not.toHaveBeenCalled();

    alert.mockRestore();
  });

  test("does not repeat the public-number alert when the number was assigned earlier", async () => {
    const submission = readySubmission("draft");
    const onAssignPublicNumber = vi.fn().mockResolvedValue({
      assignedNow: false,
      caseRevision: 8,
      publicNumber: 1059,
    });
    const onSavedAndExit = vi.fn().mockResolvedValue(undefined);
    const alert = vi.spyOn(window, "alert").mockImplementation(() => undefined);

    render(
      <QuestionnaireScreen
        onAssignPublicNumber={onAssignPublicNumber}
        onBack={vi.fn()}
        onSavedAndExit={onSavedAndExit}
        onSubmissionChange={vi.fn().mockResolvedValue(undefined)}
        submission={submission}
        submissionId={submission.id}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Сохранить и выйти" }));

    await waitFor(() => expect(onSavedAndExit).toHaveBeenCalledTimes(1));
    expect(onAssignPublicNumber).toHaveBeenCalledOnce();
    expect(alert).not.toHaveBeenCalled();
    expect(onSavedAndExit).toHaveBeenCalledWith(
      expect.objectContaining({ publicNumber: 1059 }),
    );

    alert.mockRestore();
  });

  test("exits an incomplete draft without assigning or announcing a public number", async () => {
    const submission = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const onAssignPublicNumber = vi.fn();
    const onBack = vi.fn();
    const onSavedAndExit = vi.fn().mockResolvedValue(undefined);
    const onSubmissionChange = vi.fn().mockResolvedValue(undefined);
    const alert = vi.spyOn(window, "alert").mockImplementation(() => undefined);

    render(
      <QuestionnaireScreen
        onAssignPublicNumber={onAssignPublicNumber}
        onBack={onBack}
        onSavedAndExit={onSavedAndExit}
        onSubmissionChange={onSubmissionChange}
        submission={submission}
        submissionId={submission.id}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Сохранить и выйти" }));

    await waitFor(() => expect(onSavedAndExit).toHaveBeenCalledTimes(1));
    expect(onSubmissionChange).toHaveBeenCalledTimes(1);
    expect(onAssignPublicNumber).not.toHaveBeenCalled();
    expect(alert).not.toHaveBeenCalled();
    expect(onSavedAndExit).toHaveBeenCalledWith(
      expect.objectContaining({ publicNumber: null, status: "draft" }),
    );
    expect(onBack).not.toHaveBeenCalled();

    alert.mockRestore();
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

    openPersonalSection();
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

    openPersonalSection();
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
    openPersonalSection();
    expect(screen.getByLabelText("Фамилия")).toBeDisabled();
    expect(onSubmissionChange).not.toHaveBeenCalled();
    expect(onSubmitForReview).not.toHaveBeenCalled();
    expect(screen.queryByText("Отправлено на проверку")).not.toBeInTheDocument();
  });

  test("keeps the current lifecycle when a questionnaire save is retried", async () => {
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

    expect(
      screen.queryByRole("button", { name: "Отправить на проверку" }),
    ).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Сохранить и выйти" }));
    await waitFor(() =>
      expect(screen.getByTestId("questionnaire-save-error")).toHaveTextContent(
        "Сервис не подтвердил сохранение",
      ),
    );
    expect(screen.queryByText("Supabase недоступен")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Сохранить и выйти" }));
    await waitFor(() => expect(onSubmissionChange).toHaveBeenCalledTimes(2));

    const retrySubmission = onSubmissionChange.mock.calls[1]?.[0] as Submission;
    expect(retrySubmission.status).toBe("in_progress");
  });

  test("saves returned corrections without performing the review handoff", async () => {
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

    openPersonalSection();
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
    expect(
      screen.queryByRole("button", { name: "Отправить исправления" }),
    ).not.toBeInTheDocument();
    expect(onSubmissionChange).toHaveBeenCalledTimes(1);
    expect(onSubmitForReview).not.toHaveBeenCalled();
  });

  test("persists an explicit OCR confirmation without submitting the lifecycle", async () => {
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

    expect(
      screen.queryByRole("button", { name: "Отправить на проверку" }),
    ).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole("button", { name: "Сохранить и выйти" }));

    await waitFor(() => expect(onSubmissionChange).toHaveBeenCalledTimes(1));
    const submitted = onSubmissionChange.mock.calls[0]?.[0] as Submission;
    const submittedApplicant = submitted.applicants[0];
    const confirmedPassportNumber = submittedApplicant?.sections
      .flatMap((section) => section.fields)
      .find((field) => field.id === "passport-no");
    expect(submitted.status).toBe("in_progress");
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
