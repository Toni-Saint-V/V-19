import { cleanup, render, screen } from "@testing-library/react";
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
    expect(screen.getByLabelText("Кем выдан")).toHaveValue("FMS 78039");
    expect(result.container.querySelector("[data-field-focused='true']")).toHaveTextContent(
      "Действителен до",
    );
  });
});
