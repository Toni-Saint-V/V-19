import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, test, vi } from "vitest";

import { FigmaQuestionnaireScreen } from "../../src/modules/submissions/components/FigmaQuestionnaireScreen";
import { createDraftSubmission } from "../../src/modules/submissions/submissionActions";
import type { Submission } from "../../src/modules/submissions/types";

function draftSubmission(status: Submission["status"] = "draft") {
  return {
    ...createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    }),
    status,
  } satisfies Submission;
}

function familyDraftSubmission() {
  return {
    ...createDraftSubmission({
      applicantNames: ["VOLKOV ANTON", "SMIRNOVA ELENA"],
      city: "Москва",
      familyCount: 2,
      idScheme: "local",
      submissions: [],
      type: "family",
    }),
    status: "draft",
  } satisfies Submission;
}

function renderQuestionnaire(
  options: {
    onFieldChange?: ReturnType<typeof vi.fn>;
    submission?: Submission;
  } = {},
) {
  const onFieldChange = options.onFieldChange ?? vi.fn();
  const submission = options.submission ?? draftSubmission();

  render(
    <FigmaQuestionnaireScreen
      onBack={vi.fn()}
      onComplete={vi.fn()}
      onFieldChange={onFieldChange}
      submission={submission}
    />,
  );

  return { onFieldChange, submission };
}

async function importPastedText(text: string) {
  fireEvent.click(screen.getByRole("button", { name: "Умный импорт" }));
  const textbox = screen.getByLabelText("Вставить текст");
  fireEvent.change(textbox, { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Распознать текст" }));
  await screen.findByRole("button", { name: "Применить выбранное" });
}

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: vi.fn(),
    writable: true,
  });
});

afterEach(cleanup);

describe("questionnaire smart import", () => {
  test("shows the action only while the questionnaire is editable", () => {
    const editable = renderQuestionnaire();
    expect(screen.getByRole("button", { name: "Умный импорт" })).toBeInTheDocument();
    cleanup();

    renderQuestionnaire({
      submission: { ...editable.submission, status: "submitted_for_review" },
    });
    expect(
      screen.queryByRole("button", { name: "Умный импорт" }),
    ).not.toBeInTheDocument();
  });

  test("applies selected fields with smart-import provenance", async () => {
    const { onFieldChange } = renderQuestionnaire();

    await importPastedText("Email: smart-import@example.com");
    await screen.findByText("smart-import@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Применить выбранное" }));

    await waitFor(() =>
      expect(onFieldChange).toHaveBeenCalledWith(
        expect.objectContaining({
          fieldId: "email",
          reviewOriginSource: "smart_import",
          reviewSource: "smart_import",
          reviewState: "needs_review",
          value: "smart-import@example.com",
        }),
      ),
    );
  });

  test("does not propose or apply protected passport fields", async () => {
    const { onFieldChange } = renderQuestionnaire();

    await importPastedText(`
      Passport type: Ordinary
      Passport number: P12345678
      Issue date: 2020-02-01
      Valid until: 2030-02-01
      Issuing country: Spain
      Place of issue: Moscow
    `);
    expect(screen.getByText(/Подходящие поля не найдены/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Применить выбранное" })).toBeDisabled();
    expect(onFieldChange).not.toHaveBeenCalled();
  });

  test("does not apply an unselected conflict", async () => {
    const submission = draftSubmission();
    const applicant = submission.applicants[0];
    if (!applicant) throw new Error("expected applicant");
    const withEmail: Submission = {
      ...submission,
      applicants: submission.applicants.map((candidate) =>
        candidate.id === applicant.id
          ? {
              ...candidate,
              sections: candidate.sections.map((section) => ({
                ...section,
                fields: section.fields.map((field) =>
                  field.id === "email"
                    ? { ...field, value: "current@example.com" }
                    : field,
                ),
              })),
            }
          : candidate,
      ),
    };
    const { onFieldChange } = renderQuestionnaire({ submission: withEmail });

    await importPastedText("Email: replacement@example.com");
    await screen.findByText("replacement@example.com");
    expect(screen.getByText("Конфликт с анкетой")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Применить выбранное" }));

    expect(onFieldChange).not.toHaveBeenCalledWith(
      expect.objectContaining({
        fieldId: "email",
        value: "replacement@example.com",
      }),
    );
  });

  test("applies only to the active family applicant and preserves family identity", async () => {
    const submission = familyDraftSubmission();
    const familyIdentity = submission.applicants.map(({ id, role }) => ({ id, role }));
    const activeApplicantId = submission.applicants[0]?.id;
    if (!activeApplicantId) throw new Error("expected family applicant");
    const { onFieldChange } = renderQuestionnaire({ submission });

    await importPastedText("Email: family-primary@example.com");
    fireEvent.click(screen.getByRole("button", { name: "Применить выбранное" }));

    await waitFor(() => expect(onFieldChange).toHaveBeenCalledTimes(1));
    expect(onFieldChange).toHaveBeenCalledWith(
      expect.objectContaining({
        applicantId: activeApplicantId,
        fieldId: "email",
        value: "family-primary@example.com",
      }),
    );
    expect(submission.applicants.map(({ id, role }) => ({ id, role }))).toEqual(
      familyIdentity,
    );
  });

  test("composes the canonical home address from selected registration parts", async () => {
    const { onFieldChange } = renderQuestionnaire();

    await importPastedText(`
      ЗАРЕГИСТРИРОВАН ПО МЕСТУ ЖИТЕЛЬСТВА
      198216, Г. САНКТ-ПЕТЕРБУРГ,
      ЛЕНИНСКИЙ ПР-Т, Д. 40, КОРП. 2, КВ. 14
    `);
    await screen.findByText("проспект Ленинский");
    fireEvent.click(screen.getByRole("button", { name: "Применить выбранное" }));

    await waitFor(() => {
      const updates = onFieldChange.mock.calls.map(([update]) => update);
      expect(updates).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            fieldId: "home-street",
            value: "проспект Ленинский",
          }),
          expect.objectContaining({ fieldId: "home-house", value: "40" }),
          expect.objectContaining({ fieldId: "home-building", value: "2" }),
          expect.objectContaining({ fieldId: "home-unit", value: "14" }),
          expect.objectContaining({
            fieldId: "home-address",
            reviewOriginSource: "manual",
            reviewSource: "manual",
            reviewState: undefined,
            value: "проспект Ленинский, д 40, корп 2, кв 14",
          }),
        ]),
      );
    });
  });

  test("applies only supported hotel contact fields from invitation text", async () => {
    const { onFieldChange } = renderQuestionnaire();

    await importPastedText(`
      Inviting party type: Hotel
      Host company details: Demo Host Company
      Host company contact person: Demo Host Contact
      Host company phone: +34 910 000 001
    `);
    fireEvent.click(screen.getByRole("button", { name: "Применить выбранное" }));

    await waitFor(() => {
      expect(onFieldChange).toHaveBeenCalledWith(
        expect.objectContaining({
          fieldId: "hotel-contact",
          reviewOriginSource: "smart_import",
          reviewSource: "smart_import",
          reviewState: "needs_review",
          value: "+34910000001",
        }),
      );
    });
    expect(onFieldChange).not.toHaveBeenCalledWith(
      expect.objectContaining({ fieldId: "company-org-details" }),
    );
  });
});
