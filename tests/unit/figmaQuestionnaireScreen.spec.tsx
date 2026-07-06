import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { FigmaQuestionnaireScreen } from "../../src/modules/submissions/components/FigmaQuestionnaireScreen";
import {
  createDraftSubmission,
  updateQuestionnaireField,
} from "../../src/modules/submissions/submissionActions";
import type { Submission } from "../../src/modules/submissions/types";

afterEach(() => {
  cleanup();
});

function sectionIdForField(submission: Submission, fieldId: string) {
  const section = submission.applicants[0]?.sections.find((item) =>
    item.fields.some((field) => field.id === fieldId),
  );
  if (!section) throw new Error(`expected section for ${fieldId}`);
  return section.id;
}

function setField(submission: Submission, fieldId: string, value: string) {
  const applicantId = submission.applicants[0]?.id;
  if (!applicantId) throw new Error("expected applicant");

  return updateQuestionnaireField(submission, {
    applicantId,
    fieldId,
    sectionId: sectionIdForField(submission, fieldId),
    value,
  });
}

function setFieldReview(
  submission: Submission,
  fieldId: string,
  value: string,
  review: Pick<
    NonNullable<Submission["applicants"][number]["sections"][number]["fields"][number]>,
    "reviewSource" | "reviewState"
  >,
) {
  const applicantId = submission.applicants[0]?.id;
  if (!applicantId) throw new Error("expected applicant");

  return updateQuestionnaireField(submission, {
    applicantId,
    fieldId,
    sectionId: sectionIdForField(submission, fieldId),
    value,
    ...review,
  });
}

describe("FigmaQuestionnaireScreen", () => {
  test("renders passport values from the active submission instead of static defaults", () => {
    const draft = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const applicantId = draft.applicants[0]?.id;
    if (!applicantId) throw new Error("expected applicant");

    const submission = [
      ["passport-no", "752869613"],
      ["passport-issue-date", "26.02.2016"],
      ["passport-expiry-date", "26.02.2026"],
      ["passport-issue-place", "FMS 78039"],
    ].reduce(
      (current, [fieldId, value]) => setField(current, fieldId, value),
      draft,
    );

    const result = render(
      <FigmaQuestionnaireScreen
        initialFocus={{
          applicantId,
          field: "passport-expiry-date",
        }}
        onBack={vi.fn()}
        onComplete={vi.fn()}
        submission={submission}
      />,
    );

    expect(
      screen.getByRole("heading", { name: "Анкета: VOLKOV ANTON" }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText("Номер паспорта")).toHaveValue("752869613");
    expect(screen.getByLabelText("Дата выдачи")).toHaveValue("26.02.2016");
    expect(screen.getByLabelText("Действителен до")).toHaveValue("26.02.2026");
    expect(screen.getByLabelText("Место выдачи")).toHaveValue("FMS 78039");
    expect(result.container.querySelector("[data-field-focused='true']")).toHaveTextContent(
      "Действителен до",
    );
  });

  test("shows questionnaire answer options from the submission field model", () => {
    const submission = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });

    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        submission={submission}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Запись/ }));
    const cityField = result.container.querySelector("[data-field-label='Город подачи']");
    const cityTrigger = cityField?.querySelector("button");
    if (!cityTrigger) throw new Error("expected city dropdown trigger");

    fireEvent.click(cityTrigger);

    expect(screen.getByRole("button", { name: "Екатеринбург" })).toBeInTheDocument();
  });

  test("does not render a hardcoded birth date PDF mismatch for clean submission data", () => {
    const draft = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const submission = setField(draft, "birth-date", "20.08.1990");

    render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        submission={submission}
      />,
    );

    expect(screen.getByLabelText("Дата рождения")).toHaveValue("20.08.1990");
    expect(screen.queryByText("Дата рождения не совпадает")).not.toBeInTheDocument();
    expect(screen.queryByText("Не совпадает с PDF")).not.toBeInTheDocument();
    expect(screen.queryByText(/12\.05\.1985|15\.05\.1985/)).not.toBeInTheDocument();
  });

  test("keeps real PDF mismatch issues visible while needs-review fields only get an outline", () => {
    const draft = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const reviewed = setFieldReview(draft, "birth-place", "LENINGRAD", {
      reviewSource: "passport_ocr",
      reviewState: "needs_review",
    });
    const applicant = reviewed.applicants[0];
    if (!applicant) throw new Error("expected applicant");
    const submission: Submission = {
      ...reviewed,
      issues: [
        {
          comment: "PDF не совпадает с заявкой: Дата рождения.",
          createdAt: "2026-07-06T00:00:00.000Z",
          createdBy: "system",
          id: "issue-birth-date",
          reason: "PDF не совпадает",
          severity: "blocker",
          status: "open",
          target: {
            applicantId: applicant.id,
            applicantName: applicant.fullName,
            field: "Дата рождения",
            section: "Личные данные",
          },
          type: "field",
        },
      ],
    };

    render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        submission={submission}
      />,
    );

    expect(screen.getByText("Дата рождения не совпадает")).toBeInTheDocument();
    expect(screen.getByText("PDF не совпадает с заявкой: Дата рождения.")).toBeInTheDocument();
    expect(screen.queryByText(/Проверить|passport_ocr/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Место рождения")).toHaveClass("is-review");
  });
});
