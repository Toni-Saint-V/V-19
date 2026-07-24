import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";

import { FigmaQuestionnaireScreen } from "../../src/modules/submissions/components/FigmaQuestionnaireScreen";
import { createDraftSubmission } from "../../src/modules/submissions/submissionActions";
import { agentQuestionnaireStatusPresentation } from "../../src/modules/submissions/status";
import type { Submission } from "../../src/modules/submissions/types";

afterEach(cleanup);

function correctionsAwaitingReviewSubmission(): Submission {
  const draft = createDraftSubmission({
    applicantNames: ["TEST PRIMARY", "TEST SECONDARY"],
    city: "Москва",
    familyCount: 2,
    idScheme: "local",
    submissions: [],
    type: "family",
  });
  const applicant = draft.applicants[0];
  if (!applicant) throw new Error("expected applicant fixture");

  return {
    ...draft,
    status: "corrections_received",
    issues: [
      {
        comment: "Уточните значение и отправьте исправления.",
        createdAt: "2026-07-15T00:00:00.000Z",
        createdBy: "admin",
        id: "issue-awaiting-admin-review",
        reason: "Нужно уточнение",
        severity: "blocker",
        status: "open",
        target: {
          applicantId: applicant.id,
          applicantName: applicant.fullName,
          field: "Фамилия",
          section: "Личные данные",
        },
        type: "field",
      },
    ],
  };
}

describe("agent questionnaire read-only status", () => {
  test("keeps returned work editable and makes admin-owned corrections view-only", () => {
    expect(agentQuestionnaireStatusPresentation("returned")).toMatchObject({
      canEdit: true,
      completionLabel: "Отправить исправления",
      drawerActionLabel: "Исправить анкету",
    });
    expect(agentQuestionnaireStatusPresentation("corrections_received")).toMatchObject({
      canEdit: false,
      drawerActionLabel: "Смотреть анкету",
      readOnly: {
        label: "Исправления на проверке",
      },
    });
  });

  test("explains the waiting state instead of exposing draft or mutation controls", () => {
    const onComplete = vi.fn();
    const onMarkIssueFixed = vi.fn();
    const onSaveDraft = vi.fn();

    render(
      <FigmaQuestionnaireScreen
        initialFocus={{ section: "Личные данные" }}
        onBack={vi.fn()}
        onComplete={onComplete}
        onMarkIssueFixed={onMarkIssueFixed}
        onSaveDraft={onSaveDraft}
        submission={correctionsAwaitingReviewSubmission()}
      />,
    );

    expect(screen.getByTestId("questionnaire-read-only-status")).toHaveTextContent(
      "Исправления на проверке",
    );
    expect(screen.getByTestId("questionnaire-read-only-banner")).toHaveTextContent(
      "Исправления отправлены администратору",
    );
    expect(screen.getByLabelText("Фамилия")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Черновик" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Отправить/ })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Заполнить общие поля семьи" }),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Следующее поле" })).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Сохранить исправление" }),
    ).not.toBeInTheDocument();
    expect(onComplete).not.toHaveBeenCalled();
    expect(onMarkIssueFixed).not.toHaveBeenCalled();
    expect(onSaveDraft).not.toHaveBeenCalled();
  });
});
