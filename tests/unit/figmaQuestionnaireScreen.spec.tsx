import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  FigmaQuestionnaireScreen,
  questionnaireUiBindingContract,
  questionnaireUiLegacyBindingDispositions,
  questionnaireUiNonRenderedFieldDispositions,
} from "../../src/modules/submissions/components/FigmaQuestionnaireScreen";
import { auditAgentInteractionControls } from "../../src/modules/submissions/agentInteractionContract";
import { questionnaireBlueprintContract } from "../../src/modules/submissions/questionnaire";
import {
  createDraftSubmission,
  updateQuestionnaireField,
} from "../../src/modules/submissions/submissionActions";
import type { Submission } from "../../src/modules/submissions/types";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function deferred() {
  let resolve!: () => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<void>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

function sectionIdForField(submission: Submission, fieldId: string) {
  const section = submission.applicants[0]?.sections.find((item) =>
    item.fields.some((field) => field.id === fieldId),
  );
  if (!section) throw new Error(`expected section for ${fieldId}`);
  return section.id;
}

function setField(submission: Submission, fieldId: string, value: string) {
  return setApplicantField(submission, 0, fieldId, value);
}

function setApplicantField(
  submission: Submission,
  applicantIndex: number,
  fieldId: string,
  value: string,
) {
  const applicantId = submission.applicants[applicantIndex]?.id;
  if (!applicantId) throw new Error("expected applicant");

  const section = submission.applicants[applicantIndex]?.sections.find((item) =>
    item.fields.some((field) => field.id === fieldId),
  );
  if (!section) throw new Error(`expected section for ${fieldId}`);

  return updateQuestionnaireField(submission, {
    applicantId,
    fieldId,
    sectionId: section.id,
    value,
  });
}

function markApplicantValuesManual(
  submission: Submission,
  applicantIndex: number,
  fieldIds: readonly string[],
): Submission {
  const applicant = submission.applicants[applicantIndex];
  if (!applicant) throw new Error("expected applicant");
  const allowedFieldIds = new Set(fieldIds);

  return {
    ...submission,
    applicants: submission.applicants.map((candidate, index) =>
      index !== applicantIndex
        ? candidate
        : {
            ...candidate,
            sections: candidate.sections.map((section) => ({
              ...section,
              fields: section.fields.map((field) =>
                allowedFieldIds.has(field.id)
                  ? {
                      ...field,
                      reviewOriginSource: "manual" as const,
                      reviewSource: "manual" as const,
                    }
                  : field,
              ),
            })),
          },
    ),
  };
}

function fillEveryQuestionnaireField(submission: Submission, applicantIndex = 0) {
  const applicant = submission.applicants[applicantIndex];
  if (!applicant) throw new Error("expected applicant");

  return applicant.sections
    .flatMap((section) => section.fields)
    .reduce((current, field) => {
      const { id: fieldId, label } = field;
      const exactValues: Record<string, string> = {
        "arrival-date": "10.07.2026",
        "birth-date": "20.08.1990",
        "departure-date": "18.07.2026",
        "passport-expiry-date": "26.02.2032",
        "passport-issue-date": "26.02.2016",
        "stay-duration": "9",
      };
      const value =
        exactValues[fieldId] ??
        (fieldId.includes("date") ||
        fieldId.includes("valid") ||
        fieldId.includes("expiry")
          ? "20.08.2030"
          : label.toLocaleLowerCase("ru-RU").includes("email")
            ? "ready@example.com"
            : label.toLocaleLowerCase("ru-RU").includes("телефон")
              ? "79000000000"
              : fieldId === "passport-no"
                ? "752869613"
                : "READY");
      return setApplicantField(current, applicantIndex, fieldId, value);
    }, submission);
}

function withReadyQuestionnaireFiles(submission: Submission): Submission {
  return {
    ...submission,
    files: submission.files.map((file) => ({
      ...file,
      reviewStatus: "accepted" as const,
      status: "accepted" as const,
      uploadStatus: "uploaded" as const,
    })),
  };
}

function withQuestionnaireIssue(
  submission: Submission,
  status: "fixed_by_agent" | "open",
  field = "Почтовый индекс",
  section = "Отель / приглашение",
): Submission {
  const applicant = submission.applicants[0];
  if (!applicant) throw new Error("expected applicant");

  return {
    ...submission,
    issues: [
      {
        comment: "Исправьте поле и повторно отправьте анкету.",
        createdAt: "2026-07-11T00:00:00.000Z",
        createdBy: "admin",
        id: `issue-${status}`,
        reason: "Нужно уточнение",
        severity: "blocker",
        status,
        target: {
          applicantId: applicant.id,
          applicantName: applicant.fullName,
          field,
          section,
        },
        type: "field",
      },
    ],
  };
}

function withQuestionnaireFileIssue(
  submission: Submission,
  fileType: "passport_scan" | "selfie" | "selfie_2",
): Submission {
  const applicant = submission.applicants[0];
  const file = submission.files.find(
    (candidate) =>
      candidate.applicantId === applicant?.id && candidate.type === fileType,
  );
  if (!applicant || !file) throw new Error("expected applicant and file");

  return {
    ...submission,
    files: submission.files.map((candidate) =>
      candidate.id === file.id
        ? {
            ...candidate,
            linkedIssueId: "issue-file-selfie",
            status: "needs_replacement" as const,
          }
        : candidate,
    ),
    issues: [
      {
        comment: "Лицо должно быть полностью видно в кадре.",
        createdAt: "2026-07-15T00:00:00.000Z",
        createdBy: "admin",
        id: "issue-file-selfie",
        reason: "Замените это селфи",
        severity: "blocker",
        status: "open",
        target: {
          applicantId: applicant.id,
          applicantName: applicant.fullName,
          fileType,
          section: "Файлы",
        },
        type: "file",
      },
    ],
  };
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

function pinnedSectionTitles(container: HTMLElement) {
  const list = container.querySelector(".v19-questionnaire-section-list--pinned");
  if (!list) throw new Error("expected pinned section list");

  return Array.from(list.querySelectorAll(".v19-questionnaire-section-tab")).map(
    (button) => {
      const title = button.querySelector(".font-semibold")?.textContent?.trim();
      if (!title) throw new Error("expected section title");
      return title;
    },
  );
}

function clickPinnedSection(container: HTMLElement, title: string) {
  const list = container.querySelector(".v19-questionnaire-section-list--pinned");
  const button = Array.from(list?.querySelectorAll("button") ?? []).find((candidate) =>
    candidate.textContent?.includes(title),
  );
  if (!button) throw new Error(`expected section ${title}`);
  fireEvent.click(button);
}

function visibleFieldLabels(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll(".v19-questionnaire-fields-grid [data-field-label]"),
  ).map((field) => {
    const label = field.getAttribute("data-field-label");
    if (!label) throw new Error("expected field label");
    return label;
  });
}

function visibleFieldNumbers(container: HTMLElement) {
  return Array.from(
    container.querySelectorAll(
      ".v19-questionnaire-fields-grid .v19-questionnaire-field-number",
    ),
  ).map((number) => number.textContent?.trim() ?? "");
}

function dropdownTrigger(container: HTMLElement, fieldLabel: string) {
  const field = Array.from(
    container.querySelectorAll(".v19-questionnaire-fields-grid [data-field-label]"),
  ).find((candidate) => candidate.getAttribute("data-field-label") === fieldLabel);
  const trigger = field?.querySelector("button");
  if (!trigger) throw new Error(`expected dropdown for ${fieldLabel}`);
  return trigger;
}

function expectDropdownOption(name: string) {
  expect(
    screen.queryAllByRole("option", { name }).length +
      screen.queryAllByRole("button", { name }).length,
  ).toBeGreaterThan(0);
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
    ].reduce((current, [fieldId, value]) => setField(current, fieldId, value), draft);

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
    expect(
      result.container.querySelector("[data-field-focused='true']"),
    ).toHaveTextContent("Действителен до");
    expect(auditAgentInteractionControls(result.container)).toEqual([]);
  });

  test("opens a desired interval issue on the exact questionnaire field", async () => {
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
    const submission = withQuestionnaireIssue(
      draft,
      "open",
      "Желаемый интервал — по",
      "",
    );

    render(
      <FigmaQuestionnaireScreen
        initialFocus={{ applicantId, field: "Желаемый интервал — по" }}
        onBack={vi.fn()}
        onComplete={vi.fn()}
        submission={submission}
      />,
    );

    await waitFor(() => expect(screen.getByLabelText("По какое число")).toHaveFocus());
    expect(
      screen.getByText("Контекст анкеты: заявитель Volkov Anton; раздел Запись."),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("Исправьте поле и повторно отправьте анкету."),
    ).toHaveLength(1);
  });

  test("renders the desired interval as one paired numeric date control", () => {
    const submission = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON", "VOLKOVA MARIA"],
      city: "Москва",
      familyCount: 2,
      idScheme: "local",
      submissions: [],
      type: "family",
    });
    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Запись");
    const interval = screen.getByRole("group", {
      name: "Желаемый интервал",
    });
    const start = within(interval).getByLabelText("С какого числа");
    const end = within(interval).getByLabelText("По какое число");

    fireEvent.change(start, { target: { value: "01082027" } });
    fireEvent.change(end, { target: { value: "15082027" } });

    expect(start).toHaveValue("01.08.2027");
    expect(end).toHaveValue("15.08.2027");
    expect(
      screen.getByRole("button", { name: "Копировать для всех" }),
    ).toBeInTheDocument();
  });

  test("keeps secondary appointment data unchanged until explicit copy confirmation", () => {
    const submission = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON", "VOLKOVA MARIA"],
      city: "Москва",
      familyCount: 2,
      idScheme: "local",
      submissions: [],
      type: "family",
    });
    const secondaryApplicantId = submission.applicants[1]?.id;
    if (!secondaryApplicantId) throw new Error("expected secondary applicant");
    const onFieldChange = vi.fn();
    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        onFieldChange={onFieldChange}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Запись");
    fireEvent.click(dropdownTrigger(result.container, "Город подачи"));
    fireEvent.click(screen.getByRole("option", { name: "Самара" }));
    fireEvent.change(screen.getByLabelText("С какого числа"), {
      target: { value: "01082027" },
    });
    fireEvent.change(screen.getByLabelText("По какое число"), {
      target: { value: "15082027" },
    });

    expect(
      onFieldChange.mock.calls
        .map(([update]) => update)
        .filter((update) => update.applicantId === secondaryApplicantId),
    ).toEqual([]);

    const applicantTabs = result.container.querySelectorAll(
      ".v19-questionnaire-applicant-tab",
    );
    fireEvent.click(applicantTabs[1] as HTMLButtonElement);
    expect(dropdownTrigger(result.container, "Город подачи")).not.toHaveTextContent(
      "Самара",
    );
    expect(screen.getByLabelText("С какого числа")).not.toHaveValue("01.08.2027");

    fireEvent.click(applicantTabs[0] as HTMLButtonElement);
    fireEvent.click(screen.getByRole("button", { name: "Копировать для всех" }));
    expect(
      onFieldChange.mock.calls
        .map(([update]) => update)
        .filter((update) => update.applicantId === secondaryApplicantId),
    ).toEqual([]);
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить копирование" }));

    expect(onFieldChange.mock.calls.map(([update]) => update)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          applicantId: secondaryApplicantId,
          fieldId: "appointment-city",
          value: "Самара",
        }),
        expect.objectContaining({
          applicantId: secondaryApplicantId,
          fieldId: "desired-date-1",
          value: "01.08.2027",
        }),
        expect.objectContaining({
          applicantId: secondaryApplicantId,
          fieldId: "desired-date-2",
          value: "15.08.2027",
        }),
      ]),
    );
  });

  test("opens personal data when the OCR handoff targets the surname", async () => {
    const submission = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const applicantId = submission.applicants[0]?.id;
    if (!applicantId) throw new Error("expected applicant");

    render(
      <FigmaQuestionnaireScreen
        initialFocus={{
          applicantId,
          field: "surname",
          section: "Личные данные заявителя",
        }}
        onBack={vi.fn()}
        onComplete={vi.fn()}
        submission={submission}
      />,
    );

    await waitFor(() => expect(screen.getByLabelText("Фамилия")).toHaveFocus());
    expect(screen.getAllByRole("button", { name: /Личные данные/ })[0]).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("opens a non-passport issue on its exact bound questionnaire field", async () => {
    const submission = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const applicantId = submission.applicants[0]?.id;
    if (!applicantId) throw new Error("expected applicant");

    render(
      <FigmaQuestionnaireScreen
        initialFocus={{ applicantId, field: "Место рождения" }}
        onBack={vi.fn()}
        onComplete={vi.fn()}
        submission={submission}
      />,
    );

    const birthPlace = screen.getByLabelText("Место рождения");
    expect(birthPlace.closest("[data-field-label]")).toHaveAttribute(
      "data-field-focused",
      "true",
    );
    await waitFor(() => expect(birthPlace).toHaveFocus());
    expect(
      screen.getByText(
        "Контекст анкеты: заявитель Volkov Anton; раздел Личные данные.",
      ),
    ).toBeInTheDocument();
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

    clickPinnedSection(result.container, "Запись");
    const cityField = result.container.querySelector(
      "[data-field-label='Город подачи']",
    );
    const cityTrigger = cityField?.querySelector("button");
    if (!cityTrigger) throw new Error("expected city dropdown trigger");

    fireEvent.click(cityTrigger);

    expect(screen.getByRole("option", { name: "Екатеринбург" })).toBeInTheDocument();
  });

  test("keeps review handoff out of the questionnaire and shows the exact first blocker", async () => {
    const submission = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const onComplete = vi.fn();

    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={onComplete}
        submission={submission}
      />,
    );

    expect(
      screen.queryByRole("button", { name: /Отправить на проверку|Отправить/ }),
    ).not.toBeInTheDocument();
    clickPinnedSection(result.container, "Паспорт");
    fireEvent.click(
      screen.getByRole("button", {
        name: /Перейти к следующему обязательному действию:/,
      }),
    );

    await waitFor(() =>
      expect(screen.getAllByText(/^Сначала:/).length).toBeGreaterThan(0),
    );
    expect(
      result.container.querySelector(".v19-questionnaire-field-control.is-invalid"),
    ).toBeInTheDocument();
    expect(screen.getAllByText("Обязательное поле").length).toBeGreaterThan(0);
    expect(onComplete).not.toHaveBeenCalled();
  });

  test("keeps exactly back, tourist switcher, and save actions in the compact header", () => {
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

    const headerActions = result.container.querySelector(
      ".v19-questionnaire-header-actions",
    );
    expect(headerActions).toHaveTextContent("Изменений нет");
    const header = result.container.querySelector(".v19-questionnaire-screen-header");
    expect(header?.querySelectorAll("button")).toHaveLength(3);
    expect(
      screen.queryByRole("button", { name: /Отправить на проверку|Отправить/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сохранить и выйти" })).toBeEnabled();
  });

  test("preserves the production section navigation under Codex Polish v1", () => {
    const submission = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON", "VOLKOVA MARIA"],
      city: "Москва",
      familyCount: 2,
      idScheme: "local",
      submissions: [],
      type: "family",
    });
    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        submission={submission}
      />,
    );

    expect(
      result.container.querySelector(".v19-questionnaire-screen-shell"),
    ).toHaveClass("codex-polish-v1");

    expect(pinnedSectionTitles(result.container)).toEqual([
      "Личные данные",
      "Паспорт",
      "Адрес и контакты",
      "Работа / учеба",
      "Поездка",
      "Запись",
      "Отель / приглашение",
    ]);
    expect(
      result.container.querySelector(".v19-questionnaire-section-progress-card"),
    ).not.toBeInTheDocument();

    const applicantTab = result.container.querySelector(
      ".v19-questionnaire-applicant-tab",
    );
    expect(applicantTab).toHaveTextContent(/\d+ из \d+/u);

    const previousSurname = result.container.querySelector(
      '[data-field-label="Предыдущие фамилии"]',
    );
    expect(previousSurname).toHaveClass("md:col-span-2");
    expect(
      result.container.querySelector(".v19-questionnaire-next-action-bar"),
    ).toContainElement(screen.getByRole("button", { name: "Далее: Паспорт" }));
  });

  test("uses the simplified production section order", () => {
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

    expect(pinnedSectionTitles(result.container)).toEqual([
      "Личные данные",
      "Паспорт",
      "Адрес и контакты",
      "Работа / учеба",
      "Поездка",
      "Запись",
      "Отель / приглашение",
    ]);
    expect(pinnedSectionTitles(result.container)).not.toContain("Файлы");
    expect(pinnedSectionTitles(result.container)).not.toContain("Родственник ЕС");
    expect(pinnedSectionTitles(result.container)).not.toContain("Оплата поездки");
    expect(pinnedSectionTitles(result.container)).not.toContain("Кто заполнил");
  });

  test("keeps blueprint, bindings, and rendered questionnaire fields exhaustive", () => {
    const blueprint = questionnaireBlueprintContract();
    const bindings = questionnaireUiBindingContract();
    const dispositions: Readonly<Record<string, string>> =
      questionnaireUiNonRenderedFieldDispositions;
    const legacyBindings = questionnaireUiLegacyBindingDispositions;

    for (const section of blueprint) {
      for (const field of section.fields) {
        expect(
          bindings.filter((binding) => binding.fieldId === field.id),
          `binding for ${section.id}/${field.id}`,
        ).toEqual([{ fieldId: field.id, sectionId: section.id }]);
        if (field.id in dispositions) expect(field.required).toBe(false);
      }
    }
    const blueprintFieldIds = new Set(
      blueprint.flatMap((section) => section.fields.map((field) => field.id)),
    );
    const blueprintSectionIds = blueprint.map((section) => section.id);
    expect(new Set(blueprintSectionIds).size).toBe(blueprintSectionIds.length);
    expect(
      bindings
        .filter((binding) => !blueprintFieldIds.has(binding.fieldId))
        .map((binding) => `${binding.sectionId}/${binding.fieldId}`)
        .sort(),
    ).toEqual(
      Object.entries(legacyBindings)
        .map(([fieldId, disposition]) => `${disposition.sectionId}/${fieldId}`)
        .sort(),
    );
    expect(
      [...new Set(
        bindings
          .filter((binding) => blueprintFieldIds.has(binding.fieldId))
          .map((binding) => binding.sectionId),
      )].sort(),
    ).toEqual([...blueprintSectionIds].sort());

    const draft = fillEveryQuestionnaireField(
      createDraftSubmission({
        applicantNames: ["VOLKOV ANTON"],
        city: "Москва",
        familyCount: 1,
        idScheme: "local",
        submissions: [],
        type: "single",
      }),
    );
    const submission = [
      ["birth-date", "20.08.2012"],
      ["inviting-party-type", "Приглашающая компания/организация"],
      ["lives-outside-citizenship", "Да"],
      ["previous-biometrics", "Да"],
      ["purpose", "OTHER"],
    ].reduce((current, [fieldId, value]) => setField(current, fieldId, value), draft);
    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        submission={submission}
      />,
    );
    const renderedFieldIds = new Set<string>();
    for (const title of pinnedSectionTitles(result.container)) {
      clickPinnedSection(result.container, title);
      for (const field of result.container.querySelectorAll<HTMLElement>(
        "[data-model-field-id]",
      )) {
        const fieldId = field.dataset.modelFieldId;
        if (fieldId) renderedFieldIds.add(fieldId);
      }
    }

    const missingFields = blueprint
      .flatMap((section) => section.fields)
      .filter((field) => !renderedFieldIds.has(field.id))
      .map((field) => field.id)
      .sort();
    expect(missingFields).toEqual(Object.keys(dispositions).sort());
    expect(
      [...renderedFieldIds]
        .filter((fieldId) => !blueprintFieldIds.has(fieldId))
        .sort(),
    ).toEqual(
      [...renderedFieldIds]
        .filter((fieldId) => fieldId in legacyBindings)
        .sort(),
    );
  });

  test("shows family copy only in shared contact, trip, appointment, and hotel sections", () => {
    const submission = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON", "VOLKOVA MARIA"],
      city: "Москва",
      familyCount: 2,
      idScheme: "local",
      submissions: [],
      type: "family",
    });
    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        submission={submission}
      />,
    );

    for (const title of ["Личные данные", "Паспорт", "Работа / учеба"]) {
      clickPinnedSection(result.container, title);
      expect(
        screen.queryByRole("button", { name: "Копировать для всех" }),
      ).not.toBeInTheDocument();
    }

    for (const title of [
      "Адрес и контакты",
      "Поездка",
      "Запись",
      "Отель / приглашение",
    ]) {
      clickPinnedSection(result.container, title);
      expect(
        screen.getByRole("button", { name: "Копировать для всех" }),
      ).toBeInTheDocument();
    }
  });

  test("shows section issues as an icon without duplicate progress copy", () => {
    const submission = setFieldReview(
      createDraftSubmission({
        applicantNames: ["VOLKOV ANTON"],
        city: "Москва",
        familyCount: 1,
        idScheme: "local",
        submissions: [],
        type: "single",
      }),
      "passport-no",
      "123456789",
      {
        reviewSource: "passport_ocr",
        reviewState: "needs_review",
      },
    );

    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        submission={submission}
      />,
    );

    const passportTab = result.container.querySelector(
      '.v19-questionnaire-section-list--pinned .v19-questionnaire-section-tab[aria-label="Паспорт: есть замечание"]',
    );
    expect(passportTab).toBeInTheDocument();
    expect(passportTab).toHaveTextContent("Паспорт");
    expect(passportTab).not.toHaveTextContent(/\d+ из \d+/);
    expect(
      passportTab?.querySelector(".v19-questionnaire-section-number"),
    ).toBeInTheDocument();
    expect(
      passportTab?.querySelector(".v19-questionnaire-section-meta"),
    ).not.toBeInTheDocument();
  });

  test("renders BLS field order and labels inside questionnaire sections", () => {
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

    clickPinnedSection(result.container, "Личные данные");
    expect(visibleFieldLabels(result.container)).toEqual([
      "Фамилия",
      "Предыдущие фамилии",
      "Имя",
      "Дата рождения",
      "Место рождения",
      "Страна рождения",
      "Пол",
      "Семейное положение",
    ]);

    clickPinnedSection(result.container, "Паспорт");
    expect(visibleFieldLabels(result.container)).toEqual([
      "Тип документа",
      "Номер паспорта",
      "Дата выдачи",
      "Действителен до",
      "Страна выдачи",
      "Место выдачи",
    ]);
    expect(visibleFieldNumbers(result.container)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
    ]);

    clickPinnedSection(result.container, "Адрес и контакты");
    expect(visibleFieldLabels(result.container)).toEqual([
      "Страна проживания",
      "Город проживания",
      "Улица / проспект / переулок",
      "Дом",
      "Корпус / строение",
      "Квартира / офис / помещение",
      "Почтовый индекс",
      "Email",
      "Телефон",
      "Есть вид на жительство в другой стране",
    ]);

    clickPinnedSection(result.container, "Работа / учеба");
    expect(visibleFieldLabels(result.container)).toEqual([
      "Должность",
      "Работодатель / учебное заведение",
      "Телефон работодателя / учебного заведения",
      "Адрес работодателя / учебного заведения",
    ]);

    clickPinnedSection(result.container, "Поездка");
    expect(visibleFieldLabels(result.container)).toEqual([
      "Цель поездки",
      "Основная страна назначения",
      "Страна первого въезда",
      "Количество въездов",
      "Дата въезда",
      "Дата выезда",
      "Длительность пребывания",
      "Отпечатки ранее сдавались",
    ]);

    clickPinnedSection(result.container, "Отель / приглашение");
    expect(visibleFieldLabels(result.container)).toEqual([
      "Тип принимающей стороны",
      "ФИО приглашающего лица или название отеля/компании",
      "Адрес",
      "Страна",
      "Город",
      "Почтовый индекс",
      "Email",
      "Телефон",
    ]);
  });

  test("keeps previous surnames visible and optional for every applicant", () => {
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

    clickPinnedSection(result.container, "Личные данные");
    fireEvent.click(screen.getByRole("button", { name: "Мужской" }));

    expect(visibleFieldLabels(result.container)).toContain("Предыдущие фамилии");
    expect(screen.getByLabelText("Предыдущие фамилии")).not.toHaveAttribute(
      "aria-required",
      "true",
    );
  });

  test("persists the biometrics choice for submissions with legacy fingerprint field ids", async () => {
    const draft = createDraftSubmission({
      applicantNames: ["Ирина Петрова"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const submission: Submission = {
      ...draft,
      applicants: draft.applicants.map((applicant) => ({
        ...applicant,
        sections: applicant.sections.map((section) => ({
          ...section,
          fields: section.fields.map((field) => {
            if (field.id === "previous-biometrics") {
              return { ...field, id: "fingerprints-collected", value: "" };
            }
            if (field.id === "previous-biometrics-date") {
              return { ...field, id: "fingerprints-date", value: "" };
            }
            return field;
          }),
        })),
      })),
    };
    const onFieldChange = vi.fn();
    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        onFieldChange={onFieldChange}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Поездка");
    const biometricsField = result.container.querySelector<HTMLElement>(
      '[data-field-label="Отпечатки ранее сдавались"]',
    );
    if (!biometricsField) throw new Error("expected biometrics field");

    const noButton = within(biometricsField).getByRole("button", { name: "Нет" });
    fireEvent.click(noButton);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Нет", pressed: true }),
      ).toBeInTheDocument(),
    );
    expect(onFieldChange).toHaveBeenCalledWith(
      expect.objectContaining({
        fieldId: "fingerprints-collected",
        value: "Нет",
      }),
    );
  });

  test("reveals only the follow-up questions required by an answer", () => {
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

    clickPinnedSection(result.container, "Адрес и контакты");
    expect(
      screen.queryByLabelText("Вид на жительство / документ"),
    ).not.toBeInTheDocument();
    fireEvent.click(
      dropdownTrigger(result.container, "Есть вид на жительство в другой стране"),
    );
    fireEvent.click(screen.getByRole("button", { name: "Да" }));
    expect(screen.getByLabelText("Вид на жительство / документ")).toHaveAttribute(
      "aria-required",
      "true",
    );
    expect(screen.getByLabelText("Номер документа")).toHaveAttribute(
      "aria-required",
      "true",
    );
    expect(screen.getByLabelText("Действителен до")).toHaveAttribute(
      "aria-required",
      "true",
    );

    clickPinnedSection(result.container, "Поездка");
    expect(visibleFieldLabels(result.container)).not.toContain(
      "Дополнительные сведения о цели",
    );
    expect(screen.queryByLabelText("Дата сдачи отпечатков")).not.toBeInTheDocument();
    fireEvent.click(dropdownTrigger(result.container, "Цель поездки"));
    fireEvent.click(screen.getByRole("option", { name: "OTHER" }));
    expect(visibleFieldLabels(result.container)).toContain(
      "Дополнительные сведения о цели",
    );
    fireEvent.click(screen.getByRole("button", { name: "Да" }));
    expect(screen.getByLabelText("Дата сдачи отпечатков")).toHaveAttribute(
      "aria-required",
      "true",
    );
  });

  test("formats dates and phones while offering common email domains", () => {
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

    clickPinnedSection(result.container, "Личные данные");
    fireEvent.change(screen.getByLabelText("Дата рождения"), {
      target: { value: "20082012" },
    });
    expect(screen.getByLabelText("Дата рождения")).toHaveValue("20.08.2012");

    clickPinnedSection(result.container, "Адрес и контакты");
    const phone = screen.getByLabelText("Телефон");
    fireEvent.focus(phone);
    expect(phone).toHaveValue("+7");
    fireEvent.change(phone, { target: { value: "+79001234567" } });
    expect(phone).toHaveValue("+7 900 123-45-67");

    const email = screen.getByLabelText("Email");
    fireEvent.change(email, { target: { value: "anna" } });
    fireEvent.focus(email);
    expect(screen.getByRole("option", { name: "anna@gmail.com" })).toBeInTheDocument();

    clickPinnedSection(result.container, "Отель / приглашение");
    const hotelPhone = screen.getByLabelText("Телефон");
    fireEvent.focus(hotelPhone);
    expect(hotelPhone).toHaveValue("");
    expect(hotelPhone).toHaveAttribute("placeholder", "Номер с кодом страны");
  });

  test.each([
    ["22626", "22.06.2026"],
    ["22926", "22.09.2026"],
    ["221226", "22.12.2026"],
  ])("normalizes compact future date input %s on blur", (compactDate, expectedDate) => {
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

    clickPinnedSection(result.container, "Запись");
    const desiredDate = screen.getByLabelText("С какого числа");
    fireEvent.change(desiredDate, { target: { value: compactDate } });
    fireEvent.blur(desiredDate);

    expect(desiredDate).toHaveValue(expectedDate);
  });

  test("uses past and future year boundaries for compact dates", () => {
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

    clickPinnedSection(result.container, "Личные данные");
    const birthDate = screen.getByLabelText("Дата рождения");
    fireEvent.change(birthDate, { target: { value: "010149" } });
    fireEvent.blur(birthDate);
    expect(birthDate).toHaveValue("01.01.1949");

    clickPinnedSection(result.container, "Паспорт");
    const passportExpiry = screen.getByLabelText("Действителен до");
    fireEvent.change(passportExpiry, { target: { value: "010150" } });
    fireEvent.blur(passportExpiry);
    expect(passportExpiry).toHaveValue("01.01.2050");
  });

  test("switches the active tourist from the header dropdown", () => {
    const submission = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON", "VOLKOVA MARIA"],
      city: "Москва",
      familyCount: 2,
      idScheme: "local",
      submissions: [],
      type: "family",
    });
    const secondApplicant = submission.applicants[1];
    if (!secondApplicant) throw new Error("expected second applicant");

    render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        submission={submission}
      />,
    );

    const touristMenu = screen.getByLabelText("Выбрать туриста");
    fireEvent.click(touristMenu);
    const touristOptions = within(
      screen.getByRole("listbox", { name: "Выбрать туриста" }),
    ).getAllByRole("option");
    expect(touristOptions[1]).toHaveTextContent(
      new RegExp(`${secondApplicant.fullName}.*\\d+ из \\d+`, "iu"),
    );
    fireEvent.click(touristOptions[1] as HTMLElement);

    expect(touristMenu).toHaveTextContent(/Volkova Maria/iu);
    expect(
      screen.getByText(/Контекст анкеты: заявитель Volkova Maria/u),
    ).toBeInTheDocument();
  });

  test("reveals a required-field warning only after leaving an incomplete section", () => {
    const submission = withReadyQuestionnaireFiles(
      createDraftSubmission({
        applicantNames: ["VOLKOV ANTON"],
        city: "Москва",
        familyCount: 1,
        idScheme: "local",
        submissions: [],
        type: "single",
      }),
    );
    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        submission={submission}
      />,
    );

    expect(screen.queryByTestId("questionnaire-next-blocker")).not.toBeInTheDocument();
    clickPinnedSection(result.container, "Паспорт");
    expect(screen.getByTestId("questionnaire-next-blocker")).toBeInTheDocument();
  });

  test("calculates and saves stay duration from the travel dates", async () => {
    const submission = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const onSaveDraft = vi.fn().mockResolvedValue(undefined);
    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        onSaveDraft={onSaveDraft}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Поездка");
    const duration = screen.getByLabelText("Длительность пребывания");
    expect(duration).toHaveAttribute("readonly");
    expect(duration).toHaveValue(null);

    fireEvent.change(screen.getByLabelText("Дата въезда"), {
      target: { value: "15012027" },
    });
    fireEvent.change(screen.getByLabelText("Дата выезда"), {
      target: { value: "22012027" },
    });
    expect(duration).toHaveValue(8);

    fireEvent.change(screen.getByLabelText("Дата въезда"), {
      target: { value: "11022026" },
    });
    fireEvent.change(screen.getByLabelText("Дата выезда"), {
      target: { value: "11022027" },
    });
    expect(duration).toHaveValue(366);
    expect(duration).not.toHaveAttribute("aria-invalid", "true");
    expect(
      screen.queryByText("Проверьте длительность пребывания"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Сохранить и выйти" }));
    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledTimes(1));
    expect(onSaveDraft.mock.calls[0]?.[0].fieldUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldId: "stay-duration",
          value: "366",
        }),
      ]),
    );
  });

  test("deletes the previous date digit with one Backspace at a separator", () => {
    const draft = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const submission = setField(draft, "arrival-date", "12.03.2027");
    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Поездка");
    const arrivalDate = screen.getByLabelText("Дата въезда");
    arrivalDate.focus();
    arrivalDate.setSelectionRange(3, 3);
    fireEvent.keyDown(arrivalDate, { key: "Backspace" });

    expect(arrivalDate).toHaveValue("1.03.2027");
  });

  test("defaults Russia-related fields and derives USSR for a pre-1991 birth date", async () => {
    const submission = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 2,
      idScheme: "local",
      submissions: [],
      type: "family",
    });
    const onSaveDraft = vi.fn();
    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        onSaveDraft={onSaveDraft}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Личные данные");
    expect(screen.queryByLabelText("Текущее гражданство")).not.toBeInTheDocument();
    expect(dropdownTrigger(result.container, "Страна рождения")).toHaveTextContent(
      "Russian Federation",
    );
    expect(screen.queryByRole("button", { name: "Другое" })).not.toBeInTheDocument();

    clickPinnedSection(result.container, "Запись");
    expect(dropdownTrigger(result.container, "Город подачи")).toHaveTextContent(
      "Выберите город",
    );
    clickPinnedSection(result.container, "Поездка");
    expect(
      dropdownTrigger(result.container, "Основная страна назначения"),
    ).toHaveTextContent("Spain");
    expect(
      dropdownTrigger(result.container, "Страна первого въезда"),
    ).toHaveTextContent("Spain");
    clickPinnedSection(result.container, "Отель / приглашение");
    expect(dropdownTrigger(result.container, "Страна")).toHaveTextContent("Spain");
    clickPinnedSection(result.container, "Личные данные");

    fireEvent.change(screen.getByLabelText("Дата рождения"), {
      target: { value: "20081990" },
    });
    expect(dropdownTrigger(result.container, "Страна рождения")).toHaveTextContent(
      "USSR",
    );

    fireEvent.click(screen.getByRole("button", { name: "Сохранить и выйти" }));
    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledTimes(1));
    const payload = onSaveDraft.mock.calls[0]?.[0];
    expect(payload).toEqual(expect.objectContaining({ saveIntent: "manual" }));
    expect(payload.fieldUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldId: "birth-country", value: "USSR" }),
      ]),
    );
    expect(payload.fieldUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldId: "birth-citizenship",
          value: "USSR",
        }),
      ]),
    );

    result.unmount();

    const legacyEmptyCountry = setField(submission, "birth-country", "");
    const legacySave = vi.fn();
    const legacyResult = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        onSaveDraft={legacySave}
        submission={legacyEmptyCountry}
      />,
    );
    clickPinnedSection(legacyResult.container, "Личные данные");
    expect(
      dropdownTrigger(legacyResult.container, "Страна рождения"),
    ).toHaveTextContent("Выберите вариант");
    fireEvent.click(dropdownTrigger(legacyResult.container, "Страна рождения"));
    fireEvent.change(screen.getByLabelText("Поиск: Страна рождения"), {
      target: { value: "россия" },
    });
    fireEvent.click(screen.getByRole("option", { name: "Russian Federation" }));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить и выйти" }));
    await waitFor(() => expect(legacySave).toHaveBeenCalledTimes(1));
    expect(legacySave.mock.calls[0]?.[0].fieldUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldId: "birth-country",
          value: "Russian Federation",
        }),
      ]),
    );

    legacyResult.unmount();

    const withManualCountry = setField(submission, "birth-country", "Spain");
    const manualResult = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        submission={withManualCountry}
      />,
    );
    clickPinnedSection(manualResult.container, "Личные данные");
    expect(
      dropdownTrigger(manualResult.container, "Страна рождения"),
    ).toHaveTextContent("Spain");
  });

  test("clears stale conditional answers when saving a draft", async () => {
    const draft = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const staleSubmission = setField(
      setField(draft, "lives-outside-citizenship", "Нет"),
      "residence-permit-type",
      "ВНЖ",
    );
    const onSaveDraft = vi.fn();

    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        onSaveDraft={onSaveDraft}
        submission={staleSubmission}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Сохранить и выйти" }));
    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledTimes(1));

    expect(onSaveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        fieldUpdates: expect.arrayContaining([
          expect.objectContaining({
            fieldId: "residence-permit-type",
            value: "",
          }),
        ]),
      }),
    );
    expect(result.container).toBeTruthy();
  });

  test("deduplicates a manual draft save against the pending autosave timer", async () => {
    vi.useFakeTimers();
    const submission = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const onSaveDraft = vi.fn().mockResolvedValue(undefined);

    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        onSaveDraft={onSaveDraft}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Личные данные");
    fireEvent.change(screen.getByLabelText("Фамилия"), {
      target: { value: "VOLKOV" },
    });
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Сохранить и выйти" }));
      await Promise.resolve();
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(onSaveDraft).toHaveBeenCalledWith(
      expect.objectContaining({ saveIntent: "manual" }),
    );
  });

  test("does not retry a rejected autosave when the save callback identity changes", async () => {
    vi.useFakeTimers();
    const submission = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const onBack = vi.fn();
    const onComplete = vi.fn();
    const firstSave = vi.fn().mockRejectedValue(new Error("network failure"));
    const replacementSave = vi.fn().mockRejectedValue(new Error("network failure"));
    const result = render(
      <FigmaQuestionnaireScreen
        onBack={onBack}
        onComplete={onComplete}
        onSaveDraft={firstSave}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Личные данные");
    fireEvent.change(screen.getByLabelText("Фамилия"), {
      target: { value: "VOLKOV" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(firstSave).toHaveBeenCalledTimes(1);

    result.rerender(
      <FigmaQuestionnaireScreen
        onBack={onBack}
        onComplete={onComplete}
        onSaveDraft={replacementSave}
        submission={submission}
      />,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(5_000);
    });
    expect(firstSave).toHaveBeenCalledTimes(1);
    expect(replacementSave).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText("Фамилия"), {
      target: { value: "VOLKOV RETRY" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(replacementSave).toHaveBeenCalledTimes(1);
  });

  test("flushes the pending revision before leaving the questionnaire", async () => {
    const save = deferred();
    const submission = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const onBack = vi.fn();
    const onSaveDraft = vi.fn(() => save.promise);

    const result = render(
      <FigmaQuestionnaireScreen
        onBack={onBack}
        onComplete={vi.fn()}
        onSaveDraft={onSaveDraft}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Личные данные");
    fireEvent.change(screen.getByLabelText("Фамилия"), {
      target: { value: "VOLKOV" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Назад" }));

    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(onSaveDraft).toHaveBeenCalledWith(
      expect.objectContaining({ saveIntent: "navigation" }),
    );
    expect(onBack).not.toHaveBeenCalled();

    await act(async () => {
      save.resolve();
      await Promise.resolve();
    });
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test.each([
    ["Назад", "navigation"],
    ["Сохранить и выйти", "manual"],
  ] as const)(
    "captures the latest revision and rejects edits during deferred %s",
    async (actionName, saveIntent) => {
      const save = deferred();
      const submission = createDraftSubmission({
        applicantNames: ["VOLKOV ANTON"],
        city: "Москва",
        familyCount: 1,
        idScheme: "local",
        submissions: [],
        type: "single",
      });
      const onBack = vi.fn();
      const onFieldChange = vi.fn();
      const onSaveAndExit = vi.fn().mockResolvedValue(undefined);
      const onSaveDraft = vi.fn(() => save.promise);
      const result = render(
        <FigmaQuestionnaireScreen
          onBack={onBack}
          onComplete={vi.fn()}
          onFieldChange={onFieldChange}
          onSaveAndExit={onSaveAndExit}
          onSaveDraft={onSaveDraft}
          submission={submission}
        />,
      );

      clickPinnedSection(result.container, "Личные данные");
      fireEvent.change(screen.getByLabelText("Фамилия"), {
        target: { value: "LATEST" },
      });
      fireEvent.click(screen.getByRole("button", { name: actionName }));

      expect(onSaveDraft).toHaveBeenCalledWith(
        expect.objectContaining({
          fieldUpdates: expect.arrayContaining([
            expect.objectContaining({ fieldId: "surname", value: "LATEST" }),
          ]),
          saveIntent,
        }),
      );
      expect(screen.getByLabelText("Имя")).toBeDisabled();
      fireEvent.change(screen.getByLabelText("Имя"), {
        target: { value: "MUST NOT WRITE" },
      });
      expect(
        onFieldChange.mock.calls.map(([update]) => update.fieldId),
      ).toEqual(["surname"]);

      await act(async () => {
        save.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
      if (actionName === "Назад") expect(onBack).toHaveBeenCalledTimes(1);
      else expect(onSaveAndExit).toHaveBeenCalledTimes(1);
    },
  );

  test("explains a navigation save failure and offers an explicit safe exit", async () => {
    const submission = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const onBack = vi.fn();
    const onSaveDraft = vi
      .fn()
      .mockRejectedValue(new Error("Подача недоступна текущему агенту."));

    const result = render(
      <FigmaQuestionnaireScreen
        onBack={onBack}
        onComplete={vi.fn()}
        onSaveDraft={onSaveDraft}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Личные данные");
    fireEvent.change(screen.getByLabelText("Фамилия"), {
      target: { value: "VOLKOV" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Назад" }));

    await waitFor(() =>
      expect(screen.getByTestId("questionnaire-save-error")).toHaveTextContent(
        "Нет доступа к этой подаче. Введённые данные остаются в анкете; обновите список подач или обратитесь к администратору.",
      ),
    );
    expect(screen.getByTestId("questionnaire-save-error")).toHaveAttribute(
      "role",
      "alert",
    );
    expect(screen.getByTestId("questionnaire-save-error")).toHaveTextContent(
      "Не удалось сохранить и выйти",
    );
    expect(screen.queryByText("Подача недоступна текущему агенту.")).not.toBeInTheDocument();
    expect(onBack).not.toHaveBeenCalled();
    expect(onSaveDraft).toHaveBeenCalledWith(
      expect.objectContaining({ saveIntent: "navigation" }),
    );
    expect(screen.getByRole("button", { name: "Назад" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Выйти без сохранения" }));
    expect(
      screen.getByText(/Последние несохранённые изменения будут потеряны/),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", { name: "Да, выйти без сохранения" }),
    );
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test("serializes autosaves and keeps only the latest queued revision", async () => {
    vi.useFakeTimers();
    const firstSave = deferred();
    const submission = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const onSaveDraft = vi
      .fn()
      .mockImplementationOnce(() => firstSave.promise)
      .mockResolvedValue(undefined);

    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        onSaveDraft={onSaveDraft}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Личные данные");
    fireEvent.change(screen.getByLabelText("Фамилия"), {
      target: { value: "VOLKOV" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(onSaveDraft.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ saveIntent: "autosave" }),
    );

    fireEvent.change(screen.getByLabelText("Имя"), {
      target: { value: "ANTON" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(onSaveDraft).toHaveBeenCalledTimes(1);

    await act(async () => {
      firstSave.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSaveDraft).toHaveBeenCalledTimes(2);
    expect(onSaveDraft.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({ saveIntent: "autosave" }),
    );
    expect(onSaveDraft.mock.calls[1]?.[0].fieldUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ fieldId: "surname", value: "VOLKOV" }),
        expect.objectContaining({ fieldId: "first-name", value: "ANTON" }),
      ]),
    );
  });

  test("reconciles manual Save and Exit intent after an in-flight autosave", async () => {
    vi.useFakeTimers();
    const autosave = deferred();
    const submission = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const onSaveAndExit = vi.fn().mockResolvedValue(undefined);
    const onSaveDraft = vi.fn().mockImplementationOnce(() => autosave.promise);

    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        onSaveAndExit={onSaveAndExit}
        onSaveDraft={onSaveDraft}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Личные данные");
    fireEvent.change(screen.getByLabelText("Фамилия"), {
      target: { value: "VOLKOV" },
    });
    clickPinnedSection(result.container, "Отель / приглашение");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(onSaveDraft.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ saveIntent: "autosave" }),
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Готово — сохранить и выйти" }),
    );
    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(onSaveAndExit).not.toHaveBeenCalled();

    await act(async () => {
      autosave.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSaveDraft).toHaveBeenCalledTimes(2);
    expect(onSaveDraft.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        fieldUpdates: [],
        saveIntent: "manual",
      }),
    );
    expect(onSaveAndExit).toHaveBeenCalledTimes(1);
  });

  test("retries the full edit payload when Save and Exit follows a rejected autosave", async () => {
    vi.useFakeTimers();
    const autosave = deferred();
    const submission = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const onSaveAndExit = vi.fn().mockResolvedValue(undefined);
    const onSaveDraft = vi
      .fn()
      .mockImplementationOnce(() => autosave.promise)
      .mockResolvedValueOnce(undefined);

    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        onSaveAndExit={onSaveAndExit}
        onSaveDraft={onSaveDraft}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Личные данные");
    fireEvent.change(screen.getByLabelText("Фамилия"), {
      target: { value: "VOLKOV" },
    });
    clickPinnedSection(result.container, "Отель / приглашение");
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Готово — сохранить и выйти" }),
    );

    await act(async () => {
      autosave.reject(new Error("temporary autosave failure"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSaveDraft).toHaveBeenCalledTimes(2);
    expect(onSaveDraft.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        fieldUpdates: expect.arrayContaining([
          expect.objectContaining({ fieldId: "surname", value: "VOLKOV" }),
        ]),
        saveIntent: "manual",
      }),
    );
    expect(onSaveAndExit).toHaveBeenCalledTimes(1);
  });

  test("retries the full edit payload when Back follows a rejected autosave", async () => {
    vi.useFakeTimers();
    const autosave = deferred();
    const submission = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const onBack = vi.fn();
    const onSaveDraft = vi
      .fn()
      .mockImplementationOnce(() => autosave.promise)
      .mockResolvedValueOnce(undefined);

    const result = render(
      <FigmaQuestionnaireScreen
        onBack={onBack}
        onComplete={vi.fn()}
        onSaveDraft={onSaveDraft}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Личные данные");
    fireEvent.change(screen.getByLabelText("Фамилия"), {
      target: { value: "VOLKOV" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    fireEvent.click(screen.getByRole("button", { name: "Назад" }));

    await act(async () => {
      autosave.reject(new Error("temporary autosave failure"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSaveDraft).toHaveBeenCalledTimes(2);
    expect(onSaveDraft.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        fieldUpdates: expect.arrayContaining([
          expect.objectContaining({ fieldId: "surname", value: "VOLKOV" }),
        ]),
        saveIntent: "navigation",
      }),
    );
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test("does not resurrect a reverted edit after an older autosave fails", async () => {
    vi.useFakeTimers();
    const autosave = deferred();
    const submission = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const onBack = vi.fn();
    const onSaveDraft = vi
      .fn()
      .mockImplementationOnce(() => autosave.promise)
      .mockResolvedValueOnce(undefined);

    const result = render(
      <FigmaQuestionnaireScreen
        onBack={onBack}
        onComplete={vi.fn()}
        onSaveDraft={onSaveDraft}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Личные данные");
    const surname = screen.getByLabelText("Фамилия") as HTMLInputElement;
    const originalSurname = surname.value;
    fireEvent.change(surname, { target: { value: "STALE-SURNAME" } });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    fireEvent.change(surname, { target: { value: originalSurname } });
    fireEvent.click(screen.getByRole("button", { name: "Назад" }));

    await act(async () => {
      autosave.reject(new Error("temporary autosave failure"));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSaveDraft).toHaveBeenCalledTimes(2);
    expect(onSaveDraft.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({ saveIntent: "navigation" }),
    );
    expect(
      onSaveDraft.mock.calls[1]?.[0].fieldUpdates.some(
        (update) => update.fieldId === "surname" && update.value === "STALE-SURNAME",
      ),
    ).toBe(false);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test("keeps a queued applicant payload before Back returns to the in-flight applicant", async () => {
    vi.useFakeTimers();
    const autosave = deferred();
    const draft = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON", "VOLKOVA MARIA"],
      city: "Москва",
      familyCount: 2,
      idScheme: "local",
      submissions: [],
      type: "family",
    });
    const submission = setApplicantField(
      setApplicantField(draft, 1, "lives-outside-citizenship", "Нет"),
      1,
      "residence-permit-type",
      "ВНЖ",
    );
    const secondaryApplicantId = submission.applicants[1]?.id;
    if (!secondaryApplicantId) throw new Error("expected secondary applicant");
    const onBack = vi.fn();
    const onSaveDraft = vi
      .fn()
      .mockImplementationOnce(() => autosave.promise)
      .mockResolvedValue(undefined);

    const result = render(
      <FigmaQuestionnaireScreen
        onBack={onBack}
        onComplete={vi.fn()}
        onSaveDraft={onSaveDraft}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Личные данные");
    fireEvent.change(screen.getByLabelText("Фамилия"), {
      target: { value: "VOLKOV" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(onSaveDraft).toHaveBeenCalledTimes(1);

    const applicantTabs = result.container.querySelectorAll(
      ".v19-questionnaire-applicant-tab",
    );
    fireEvent.click(applicantTabs[1] as HTMLButtonElement);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });
    expect(onSaveDraft).toHaveBeenCalledTimes(1);

    fireEvent.click(applicantTabs[0] as HTMLButtonElement);
    fireEvent.click(screen.getByRole("button", { name: "Назад" }));
    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(onBack).not.toHaveBeenCalled();

    await act(async () => {
      autosave.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSaveDraft).toHaveBeenCalledTimes(2);
    expect(onSaveDraft.mock.calls[1]?.[0].fieldUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          applicantId: secondaryApplicantId,
          fieldId: "residence-permit-type",
          value: "",
        }),
      ]),
    );
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test("reconciles navigation intent after an in-flight autosave", async () => {
    vi.useFakeTimers();
    const autosave = deferred();
    const submission = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const onBack = vi.fn();
    const onSaveDraft = vi.fn().mockImplementationOnce(() => autosave.promise);

    const result = render(
      <FigmaQuestionnaireScreen
        onBack={onBack}
        onComplete={vi.fn()}
        onSaveDraft={onSaveDraft}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Личные данные");
    fireEvent.change(screen.getByLabelText("Фамилия"), {
      target: { value: "VOLKOV" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });

    fireEvent.click(screen.getByRole("button", { name: "Назад" }));
    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(onBack).not.toHaveBeenCalled();

    await act(async () => {
      autosave.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSaveDraft).toHaveBeenCalledTimes(2);
    expect(onSaveDraft.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        fieldUpdates: [],
        saveIntent: "navigation",
      }),
    );
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test("preserves issue manual-save intent before Back behind an in-flight autosave", async () => {
    vi.useFakeTimers();
    const autosave = deferred();
    const draft = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const submission = withQuestionnaireIssue(draft, "open");
    const onBack = vi.fn();
    const onMarkIssueFixed = vi.fn().mockResolvedValue(undefined);
    const onSaveDraft = vi.fn().mockImplementationOnce(() => autosave.promise);

    const result = render(
      <FigmaQuestionnaireScreen
        onBack={onBack}
        onComplete={vi.fn()}
        onMarkIssueFixed={onMarkIssueFixed}
        onSaveDraft={onSaveDraft}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Отель / приглашение");
    fireEvent.change(screen.getByLabelText("Почтовый индекс"), {
      target: { value: "101000" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(900);
    });

    fireEvent.click(screen.getByRole("button", { name: "Пометить исправленным" }));
    fireEvent.click(screen.getByRole("button", { name: "Назад" }));
    expect(onSaveDraft).toHaveBeenCalledTimes(1);

    await act(async () => {
      autosave.resolve();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSaveDraft).toHaveBeenCalledTimes(2);
    expect(onSaveDraft.mock.calls[1]?.[0]).toEqual(
      expect.objectContaining({
        fieldUpdates: [],
        saveIntent: "manual",
      }),
    );
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onMarkIssueFixed).toHaveBeenCalledTimes(1);
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test("does not start a pagehide autosave while mark-fixed serialization is pending", async () => {
    const issueSave = deferred();
    const draft = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const submission = withQuestionnaireIssue(draft, "open");
    const onMarkIssueFixed = vi.fn().mockResolvedValue(undefined);
    const onSaveDraft = vi.fn(() => issueSave.promise);
    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        onMarkIssueFixed={onMarkIssueFixed}
        onSaveDraft={onSaveDraft}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Отель / приглашение");
    fireEvent.change(screen.getByLabelText("Почтовый индекс"), {
      target: { value: "101000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Пометить исправленным" }));
    expect(onSaveDraft).toHaveBeenCalledTimes(1);

    window.dispatchEvent(new Event("pagehide"));
    await act(async () => Promise.resolve());
    expect(onSaveDraft).toHaveBeenCalledTimes(1);

    await act(async () => {
      issueSave.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onMarkIssueFixed).toHaveBeenCalledTimes(1);
  });

  test("waits for delayed mark-fixed before Back can finish", async () => {
    const markFixed = deferred();
    const submission = withQuestionnaireIssue(
      withReadyQuestionnaireFiles(
        fillEveryQuestionnaireField(
          createDraftSubmission({
            applicantNames: ["VOLKOV ANTON"],
            city: "Москва",
            familyCount: 1,
            idScheme: "local",
            submissions: [],
            type: "single",
          }),
        ),
      ),
      "open",
    );
    const onBack = vi.fn();
    const onMarkIssueFixed = vi.fn(() => markFixed.promise);
    const result = render(
      <FigmaQuestionnaireScreen
        onBack={onBack}
        onComplete={vi.fn()}
        onMarkIssueFixed={onMarkIssueFixed}
        onSaveDraft={vi.fn().mockResolvedValue(undefined)}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Отель / приглашение");
    fireEvent.click(screen.getByRole("button", { name: "Пометить исправленным" }));
    await waitFor(() => expect(onMarkIssueFixed).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Назад" }));
    expect(onBack).not.toHaveBeenCalled();

    await act(async () => {
      markFixed.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  test("keeps the questionnaire open when mark-fixed rejects during Save and Exit", async () => {
    const markFixed = deferred();
    const submission = withQuestionnaireIssue(
      withReadyQuestionnaireFiles(
        fillEveryQuestionnaireField(
          createDraftSubmission({
            applicantNames: ["VOLKOV ANTON"],
            city: "Москва",
            familyCount: 1,
            idScheme: "local",
            submissions: [],
            type: "single",
          }),
        ),
      ),
      "open",
    );
    const onSaveAndExit = vi.fn();
    const onMarkIssueFixed = vi.fn(() => markFixed.promise);
    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        onMarkIssueFixed={onMarkIssueFixed}
        onSaveAndExit={onSaveAndExit}
        onSaveDraft={vi.fn().mockResolvedValue(undefined)}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Отель / приглашение");
    fireEvent.click(screen.getByRole("button", { name: "Пометить исправленным" }));
    await waitFor(() => expect(onMarkIssueFixed).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Сохранить и выйти" }));

    await act(async () => {
      markFixed.reject(new Error("Не удалось отметить замечание"));
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(onSaveAndExit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Не удалось отметить замечание",
    );
  });

  test("does not duplicate the draft write when Save and Exit waits for mark-fixed", async () => {
    const markFixed = deferred();
    const submission = withQuestionnaireIssue(
      withReadyQuestionnaireFiles(
        fillEveryQuestionnaireField(
          createDraftSubmission({
            applicantNames: ["VOLKOV ANTON"],
            city: "Москва",
            familyCount: 1,
            idScheme: "local",
            submissions: [],
            type: "single",
          }),
        ),
      ),
      "open",
    );
    const onSaveAndExit = vi.fn().mockResolvedValue(undefined);
    const onMarkIssueFixed = vi.fn(() => markFixed.promise);
    const onSaveDraft = vi.fn().mockResolvedValue(undefined);
    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        onMarkIssueFixed={onMarkIssueFixed}
        onSaveAndExit={onSaveAndExit}
        onSaveDraft={onSaveDraft}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Отель / приглашение");
    fireEvent.click(screen.getByRole("button", { name: "Пометить исправленным" }));
    await waitFor(() => expect(onMarkIssueFixed).toHaveBeenCalledTimes(1));
    expect(onSaveDraft).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Сохранить и выйти" }));
    expect(onSaveAndExit).not.toHaveBeenCalled();

    await act(async () => {
      markFixed.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(onSaveAndExit).toHaveBeenCalledTimes(1);
  });

  test("clears dirty state and cancels autosave after a field is reverted", async () => {
    vi.useFakeTimers();
    const submission = setField(
      createDraftSubmission({
        applicantNames: ["VOLKOV ANTON"],
        city: "Москва",
        familyCount: 1,
        idScheme: "local",
        submissions: [],
        type: "single",
      }),
      "surname",
      "ORIGINAL",
    );
    const onSaveDraft = vi.fn().mockResolvedValue(undefined);

    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        onSaveDraft={onSaveDraft}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Личные данные");
    fireEvent.change(screen.getByLabelText("Фамилия"), {
      target: { value: "CHANGED" },
    });
    fireEvent.change(screen.getByLabelText("Фамилия"), {
      target: { value: "ORIGINAL" },
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_000);
    });

    expect(
      screen
        .getAllByRole("status")
        .some((status) => status.textContent?.includes("Изменений нет")),
    ).toBe(true);
    expect(onSaveDraft).not.toHaveBeenCalled();
  });

  test("uses structured address fields with street and city completion", () => {
    const submission = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const onFieldChange = vi.fn();
    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        onFieldChange={onFieldChange}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Адрес и контакты");
    const street = screen.getByLabelText("Улица / проспект / переулок");
    expect(screen.getByLabelText("Город проживания")).toHaveAttribute(
      "placeholder",
      "Санкт-Петербург",
    );
    expect(street).toHaveAttribute("placeholder", "Улица Ленина");
    expect(street.getAttribute("placeholder")).not.toMatch(/\d/u);
    expect(screen.getByLabelText("Дом")).toHaveAttribute("placeholder", "15");
    expect(screen.getByLabelText("Корпус / строение")).toHaveAttribute(
      "placeholder",
      "Корпус 2",
    );
    expect(screen.getByLabelText("Квартира / офис / помещение")).toHaveAttribute(
      "placeholder",
      "Квартира 12",
    );
    fireEvent.focus(street);
    fireEvent.change(street, { target: { value: "ул" } });
    fireEvent.click(screen.getByRole("option", { name: "улица" }));
    expect(street).toHaveValue("улица ");
    expect(screen.getByLabelText("Дом")).toBeInTheDocument();
    expect(screen.getByLabelText("Корпус / строение")).toBeInTheDocument();
    expect(screen.getByLabelText("Квартира / офис / помещение")).toBeInTheDocument();

    fireEvent.change(street, {
      target: { value: "ул ленина д 5 корп 2 кв 12" },
    });
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole("button", {
        name: "Подставить адрес: Улица / проспект / переулок",
      }),
    );
    expect(street).toHaveValue("улица Ленина");
    expect(screen.getByLabelText("Дом")).toHaveValue("5");
    expect(screen.getByLabelText("Корпус / строение")).toHaveValue("2");
    expect(screen.getByLabelText("Квартира / офис / помещение")).toHaveValue("12");
    expect(onFieldChange).toHaveBeenCalledWith(
      expect.objectContaining({
        fieldId: "home-address",
        value: "улица Ленина, д 5, корп 2, кв 12",
      }),
    );

    const city = screen.getByLabelText("Город проживания");
    fireEvent.focus(city);
    fireEvent.change(city, { target: { value: "спб" } });
    fireEvent.click(screen.getByRole("option", { name: "Санкт-Петербург" }));
    expect(city).toHaveValue("Санкт-Петербург");
    fireEvent.change(city, { target: { value: "с" } });
    expect(screen.getByRole("option", { name: "Самара" })).toBeInTheDocument();

    clickPinnedSection(result.container, "Работа / учеба");
    expect(
      screen.getByLabelText("Адрес работодателя / учебного заведения"),
    ).toHaveAttribute("placeholder", "Проспект Мира, 10, офис 4");
  });

  test("keeps questionnaire placeholders sentence-cased and the idle search status hidden", () => {
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

    expect(screen.queryByText("Поиск по полям и значениям")).not.toBeInTheDocument();
    const search = screen.getByRole("searchbox", { name: "Поиск поля анкеты" });
    fireEvent.change(search, { target: { value: "паспорт" } });
    expect(screen.getByText(/\d+ совпадений/u)).toBeInTheDocument();

    clickPinnedSection(result.container, "Личные данные");
    expect(screen.getByLabelText("Фамилия")).toHaveAttribute("placeholder", "Волков");
    expect(screen.getByLabelText("Предыдущие фамилии")).toHaveAttribute(
      "placeholder",
      "Петрова или нет",
    );
    expect(screen.getByLabelText("Имя")).toHaveAttribute("placeholder", "Антон");
    expect(screen.getByLabelText("Место рождения")).toHaveAttribute(
      "placeholder",
      "Москва",
    );
  });

  test("suggests building and unit types while keeping their values editable", () => {
    const submission = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const onFieldChange = vi.fn();
    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        onFieldChange={onFieldChange}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Адрес и контакты");
    const building = screen.getByLabelText("Корпус / строение");
    fireEvent.focus(building);
    expect(screen.getByRole("option", { name: "корпус" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "строение" }));
    fireEvent.change(building, { target: { value: "строение 2" } });
    expect(building).toHaveValue("строение 2");

    const unit = screen.getByLabelText("Квартира / офис / помещение");
    fireEvent.focus(unit);
    expect(screen.getByRole("option", { name: "квартира" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "офис" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("option", { name: "помещение" }));
    fireEvent.change(unit, { target: { value: "помещение 12" } });
    expect(unit).toHaveValue("помещение 12");

    expect(onFieldChange.mock.calls.map(([update]) => update)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldId: "home-building",
          value: "строение 2",
        }),
        expect.objectContaining({
          fieldId: "home-unit",
          value: "помещение 12",
        }),
      ]),
    );
  });

  test.skip("shows actionable file slots and uploads a passport in one selection", async () => {
    const draft = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const passportFile = draft.files.find((file) => file.type === "passport_scan");
    if (!passportFile) throw new Error("expected passport file slot");
    const submission = {
      ...draft,
      files: draft.files.map((file) =>
        file.id === passportFile.id ? { ...file, status: "missing" as const } : file,
      ),
    };
    const onUploadFile = vi.fn().mockResolvedValue(undefined);
    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        onUploadFile={onUploadFile}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Файлы");
    expect(
      screen.getByText(
        "Три файла на заявителя. Выберите нужный слот — статус обновится после загрузки.",
      ),
    ).toBeInTheDocument();
    const passportInput = screen.getByLabelText("Загрузить Загранпаспорт");
    expect(passportInput.getAttribute("accept")).not.toContain("image/webp");
    expect(passportInput).toHaveAttribute(
      "accept",
      expect.stringContaining("image/png"),
    );
    const selfieInput = screen.getByLabelText("Загрузить Селфи 1");
    expect(selfieInput).toHaveAttribute(
      "accept",
      expect.stringContaining("image/heic"),
    );
    expect(selfieInput.getAttribute("accept")).not.toContain("image/gif");

    fireEvent.change(passportInput, {
      target: {
        files: [new File(["passport"], "passport.png", { type: "image/png" })],
      },
    });
    await waitFor(() =>
      expect(onUploadFile).toHaveBeenCalledWith(
        passportFile.id,
        expect.objectContaining({ name: "passport.png" }),
      ),
    );
  });

  test.skip("focuses the exact returned file slot and keeps its replacement control available", async () => {
    const draft = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const applicantId = draft.applicants[0]?.id;
    const selfieFile = draft.files.find((file) => file.type === "selfie");
    if (!applicantId || !selfieFile)
      throw new Error("expected applicant and selfie slot");
    const submission = {
      ...draft,
      files: draft.files.map((file) =>
        file.id === selfieFile.id
          ? { ...file, status: "needs_replacement" as const }
          : file,
      ),
      status: "returned" as const,
    };
    const result = render(
      <FigmaQuestionnaireScreen
        initialFocus={{ applicantId, fileId: selfieFile.id, section: "Файлы" }}
        onBack={vi.fn()}
        onComplete={vi.fn()}
        onUploadFile={vi.fn()}
        submission={submission}
      />,
    );

    const focusedSlot = result.container.querySelector(
      `[data-file-id="${selfieFile.id}"]`,
    );
    expect(focusedSlot).toHaveAttribute("data-file-focused", "true");
    await waitFor(() => expect(focusedSlot).toHaveFocus());
    expect(
      within(focusedSlot as HTMLElement).getByLabelText("Заменить Селфи 1"),
    ).toBeInTheDocument();
  });

  test.skip("does not offer a file upload when the submission is no longer editable", () => {
    const draft = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const submission = {
      ...draft,
      files: draft.files.map((file) =>
        file.type === "passport_scan" ? { ...file, status: "missing" as const } : file,
      ),
      status: "submitted_for_review" as const,
    };
    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        onUploadFile={vi.fn()}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Файлы");
    expect(screen.queryByLabelText("Загрузить Загранпаспорт")).not.toBeInTheDocument();
  });

  test("makes questionnaire fields and actions read-only outside agent editable statuses", () => {
    const draft = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const onComplete = vi.fn();
    const onFieldChange = vi.fn();
    const onSaveDraft = vi.fn();

    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={onComplete}
        onFieldChange={onFieldChange}
        onSaveDraft={onSaveDraft}
        submission={{ ...draft, status: "submitted_for_review" }}
      />,
    );

    clickPinnedSection(result.container, "Личные данные");
    expect(screen.getByLabelText("Фамилия")).toBeDisabled();
    expect(
      screen.queryByRole("button", { name: "Сохранить и выйти" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Отправить на проверку" }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("questionnaire-read-only-status")).toHaveTextContent(
      "На проверке",
    );
    fireEvent.change(screen.getByLabelText("Фамилия"), {
      target: { value: "CHANGED" },
    });
    expect(onFieldChange).not.toHaveBeenCalled();
    expect(onSaveDraft).not.toHaveBeenCalled();
    expect(onComplete).not.toHaveBeenCalled();
  });

  test("suggests a ten-year passport expiry when it is empty", () => {
    const submission = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const onFieldChange = vi.fn();
    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        onFieldChange={onFieldChange}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Паспорт");
    fireEvent.change(screen.getByLabelText("Дата выдачи"), {
      target: { value: "20082016" },
    });

    expect(screen.getByLabelText("Дата выдачи")).toHaveValue("20.08.2016");
    expect(screen.getByLabelText("Действителен до")).toHaveValue("20.08.2026");
    expect(screen.queryByText(/подставим \+10 лет/u)).not.toBeInTheDocument();
    expect(onFieldChange).toHaveBeenCalledWith(
      expect.objectContaining({
        fieldId: "passport-expiry-date",
        value: "20.08.2026",
      }),
    );

    fireEvent.click(screen.getByRole("button", { name: "5 лет" }));
    expect(screen.getByLabelText("Действителен до")).toHaveValue("20.08.2021");
    expect(screen.getByRole("button", { name: "5 лет" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    fireEvent.click(screen.getByRole("button", { name: "10 лет" }));
    expect(screen.getByLabelText("Действителен до")).toHaveValue("20.08.2026");

    fireEvent.change(screen.getByLabelText("Действителен до"), {
      target: { value: "20082021" },
    });
    fireEvent.change(screen.getByLabelText("Дата выдачи"), {
      target: { value: "20082017" },
    });
    expect(screen.getByLabelText("Действителен до")).toHaveValue("20.08.2021");
  });

  test("uses one-click options for short choice lists and search for long lists", () => {
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

    clickPinnedSection(result.container, "Адрес и контакты");
    expect(
      screen.getByRole("group", { name: /Есть вид на жительство в другой стране/ }),
    ).toBeInTheDocument();

    clickPinnedSection(result.container, "Личные данные");
    fireEvent.click(dropdownTrigger(result.container, "Страна рождения"));
    const countrySearch = screen.getByLabelText("Поиск: Страна рождения");
    fireEvent.change(countrySearch, { target: { value: "испан" } });
    expect(screen.getByRole("option", { name: "Spain" })).toBeInTheDocument();
  });

  test("keeps both short-answer choices visible so the answer changes in one click", () => {
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

    clickPinnedSection(result.container, "Адрес и контакты");
    const residenceGroup = screen.getByRole("group", {
      name: /Есть вид на жительство в другой стране/,
    });
    fireEvent.click(within(residenceGroup).getByRole("button", { name: "Да" }));

    const no = within(residenceGroup).getByRole("button", { name: "Нет" });
    expect(no).toBeInTheDocument();
    fireEvent.click(no);
    expect(no).toHaveAttribute("aria-pressed", "true");
  });

  test("associates dropdown labels and supports keyboard selection through a listbox", async () => {
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

    clickPinnedSection(result.container, "Личные данные");
    const countryField = result.container.querySelector(
      "[data-field-label='Страна рождения']",
    );
    const countryCombobox = screen.getByRole("combobox", {
      name: /Страна рождения/,
    });
    const fieldLabel = countryField?.querySelector("label");

    expect(countryCombobox).toHaveAttribute("id");
    expect(fieldLabel).toHaveAttribute("for", countryCombobox.id);

    countryCombobox.focus();
    fireEvent.keyDown(countryCombobox, { key: "ArrowDown" });
    expect(countryCombobox).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("listbox")).toHaveAttribute(
      "id",
      countryCombobox.getAttribute("aria-controls"),
    );

    expect(countryCombobox).toHaveFocus();
    expect(
      screen.getAllByRole("option").every((option) => option.tabIndex === -1),
    ).toBe(true);

    const countrySearch = await screen.findByRole("searchbox", {
      name: "Поиск: Страна рождения",
    });
    fireEvent.focus(countrySearch);
    fireEvent.change(countrySearch, { target: { value: "испан" } });
    fireEvent.keyDown(countrySearch, { key: "Enter" });

    expect(countryCombobox).toHaveTextContent("Spain");
    expect(countryCombobox).toHaveAttribute("aria-expanded", "false");
    expect(countryCombobox).toHaveFocus();

    fireEvent.keyDown(countryCombobox, { key: "ArrowDown" });
    fireEvent.keyDown(countryCombobox, { key: "Escape" });
    expect(countryCombobox).toHaveAttribute("aria-expanded", "false");
    expect(countryCombobox).toHaveFocus();
  });

  test("reveals minor and company-only fields from their triggering answers", () => {
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

    clickPinnedSection(result.container, "Личные данные");
    expect(visibleFieldLabels(result.container)).not.toContain(
      "Родитель/опекун несовершеннолетнего",
    );
    fireEvent.change(screen.getByLabelText("Дата рождения"), {
      target: { value: "20.08.2012" },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Добавить родителя или опекуна" }),
    );
    expect(visibleFieldLabels(result.container)).toContain(
      "Родитель/опекун несовершеннолетнего",
    );
    expect(
      screen.getByLabelText("Родитель/опекун несовершеннолетнего"),
    ).toBeInTheDocument();

    clickPinnedSection(result.container, "Отель / приглашение");
    expect(
      screen.getByRole("group", { name: /^Тип принимающей стороны/ }),
    ).toHaveAttribute("data-wrap-options", "true");
    expect(visibleFieldLabels(result.container)).not.toContain(
      "Контактное лицо компании",
    );
    fireEvent.click(dropdownTrigger(result.container, "Тип принимающей стороны"));
    fireEvent.click(
      screen.getByRole("button", { name: "Приглашающая компания/организация" }),
    );
    expect(visibleFieldLabels(result.container)).toContain("Контактное лицо компании");
    expect(screen.getByLabelText("Контактное лицо компании")).toHaveAttribute(
      "aria-required",
      "true",
    );
    expect(screen.getByLabelText("Телефон компании")).toHaveAttribute(
      "aria-required",
      "true",
    );
  });

  test("keeps company invitation details when the host type is changed and restored", async () => {
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

    clickPinnedSection(result.container, "Отель / приглашение");
    fireEvent.click(dropdownTrigger(result.container, "Тип принимающей стороны"));
    fireEvent.click(
      screen.getByRole("button", { name: "Приглашающая компания/организация" }),
    );
    fireEvent.change(screen.getByLabelText("Название и адрес компании/организации"), {
      target: { value: "VisaFlow S.L., Calle Mayor 1" },
    });
    await act(async () => {
      await Promise.resolve();
    });

    fireEvent.click(
      screen.getByRole("button", {
        name: "Приглашающая компания/организация",
      }),
    );
    fireEvent.click(
      await screen.findByRole("button", { name: "Гостиница/временное жилье" }),
    );
    expect(
      screen.queryByLabelText("Название и адрес компании/организации"),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Гостиница/временное жилье" }));
    fireEvent.click(
      await screen.findByRole("button", {
        name: "Приглашающая компания/организация",
      }),
    );
    expect(screen.getByLabelText("Название и адрес компании/организации")).toHaveValue(
      "VisaFlow S.L., Calle Mayor 1",
    );
  });

  test("shows the canonical guardian requirement for a child role even with an adult date", () => {
    const draft = setField(
      createDraftSubmission({
        applicantNames: ["VOLKOV ANTON"],
        city: "Москва",
        familyCount: 1,
        idScheme: "local",
        submissions: [],
        type: "single",
      }),
      "birth-date",
      "20.08.1990",
    );
    const applicant = draft.applicants[0];
    if (!applicant) throw new Error("expected applicant");
    const submission: Submission = {
      ...draft,
      applicants: [{ ...applicant, role: "child" }],
    };

    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Личные данные");
    fireEvent.click(
      screen.getByRole("button", { name: "Добавить родителя или опекуна" }),
    );
    expect(
      screen.getByLabelText("Родитель/опекун несовершеннолетнего"),
    ).toBeInTheDocument();
  });

  test("uses the explicit next-field action to reveal and focus the exact gap", async () => {
    const draft = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const submission = withReadyQuestionnaireFiles(
      setField(fillEveryQuestionnaireField(draft), "home-street", ""),
    );

    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Адрес и контакты");
    clickPinnedSection(result.container, "Паспорт");
    fireEvent.click(screen.getByTestId("questionnaire-next-blocker"));

    const address = screen.getByLabelText("Улица / проспект / переулок");
    await waitFor(() => expect(address).toHaveFocus());
    expect(address).toHaveAttribute("aria-invalid", "true");
    expect(
      within(address.closest("[data-field-label]") as HTMLElement).getByText(
        "Обязательное поле",
      ),
    ).toBeInTheDocument();
  });

  test("resolves a validation risk before required gaps, missing files, and admin issues", async () => {
    const draft = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const submission = withQuestionnaireIssue(
      setField(draft, "hotel-postal-code", "?"),
      "open",
      "Номер паспорта",
      "Паспорт",
    );

    render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        submission={submission}
      />,
    );

    fireEvent.click(screen.getByTestId("questionnaire-next-blocker"));

    await waitFor(() => expect(screen.getByLabelText("Почтовый индекс")).toHaveFocus());
    expect(
      screen.getByText(
        "Контекст анкеты: заявитель Volkov Anton; раздел Отель / приглашение.",
      ),
    ).toBeInTheDocument();
  });

  test.skip("resolves a missing required file before an admin issue with the exact upload slot", async () => {
    const draft = fillEveryQuestionnaireField(
      createDraftSubmission({
        applicantNames: ["VOLKOV ANTON"],
        city: "Москва",
        familyCount: 1,
        idScheme: "local",
        submissions: [],
        type: "single",
      }),
    );
    const ready = withReadyQuestionnaireFiles(draft);
    const passport = ready.files.find((file) => file.type === "passport_scan");
    if (!passport) throw new Error("expected passport file");
    const submission = withQuestionnaireIssue(
      {
        ...ready,
        files: ready.files.map((file) =>
          file.id === passport.id
            ? { ...file, status: "missing" as const, uploadStatus: "pending" as const }
            : file,
        ),
      },
      "open",
      "Номер паспорта",
      "Паспорт",
    );

    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        onUploadFile={vi.fn()}
        submission={submission}
      />,
    );

    fireEvent.click(screen.getByTestId("questionnaire-next-blocker"));

    expect(screen.getByLabelText("Файлы заявителя")).toBeInTheDocument();
    const focusedSlot = result.container.querySelector(
      `[data-file-id="${passport.id}"]`,
    );
    expect(focusedSlot).toHaveAttribute("data-file-focused", "true");
    await waitFor(() => expect(focusedSlot).toHaveFocus());
    expect(
      within(focusedSlot as HTMLElement).getByLabelText("Загрузить Загранпаспорт"),
    ).toBeInTheDocument();
  });

  test.skip("shows the exact admin file comment inside the focused replacement slot", async () => {
    const submission = withQuestionnaireFileIssue(
      withReadyQuestionnaireFiles(
        fillEveryQuestionnaireField(
          createDraftSubmission({
            applicantNames: ["VOLKOV ANTON"],
            city: "Москва",
            familyCount: 1,
            idScheme: "local",
            submissions: [],
            type: "single",
          }),
        ),
      ),
      "selfie",
    );
    const selfie = submission.files.find((file) => file.type === "selfie");
    if (!selfie) throw new Error("expected selfie");
    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        onUploadFile={vi.fn()}
        submission={submission}
      />,
    );

    fireEvent.click(screen.getByTestId("questionnaire-next-blocker"));

    const focusedSlot = result.container.querySelector(`[data-file-id="${selfie.id}"]`);
    expect(focusedSlot).toHaveAttribute("data-file-focused", "true");
    await waitFor(() => expect(focusedSlot).toHaveFocus());
    expect(
      within(focusedSlot as HTMLElement).getByText(/Замените это селфи/),
    ).toBeInTheDocument();
    expect(
      within(focusedSlot as HTMLElement).getByText(
        "Лицо должно быть полностью видно в кадре.",
      ),
    ).toBeInTheDocument();
    expect(
      within(focusedSlot as HTMLElement).getByLabelText("Заменить Селфи 1"),
    ).toBeInTheDocument();
  });

  test("keeps file remarks out of questionnaire blocker routing", () => {
    const submission = withQuestionnaireFileIssue(
      withReadyQuestionnaireFiles(
        fillEveryQuestionnaireField(
          createDraftSubmission({
            applicantNames: ["VOLKOV ANTON"],
            city: "Москва",
            familyCount: 1,
            idScheme: "local",
            submissions: [],
            type: "single",
          }),
        ),
      ),
      "selfie",
    );
    const onOpenDocuments = vi.fn();

    render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        onOpenDocuments={onOpenDocuments}
        onUploadFile={vi.fn()}
        submission={submission}
      />,
    );

    expect(screen.queryByTestId("questionnaire-next-blocker")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /есть блокер/u }),
    ).not.toBeInTheDocument();
    expect(onOpenDocuments).not.toHaveBeenCalled();
  });

  test("keeps questionnaire gaps as the only blockers when a file remark exists", () => {
    const submission = withQuestionnaireFileIssue(
      withReadyQuestionnaireFiles(
        createDraftSubmission({
          applicantNames: ["VOLKOV ANTON"],
          city: "Москва",
          familyCount: 1,
          idScheme: "local",
          submissions: [],
          type: "single",
        }),
      ),
      "passport_scan",
    );
    const onOpenDocuments = vi.fn();
    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        onOpenDocuments={onOpenDocuments}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Паспорт");
    expect(screen.getByTestId("questionnaire-next-blocker")).not.toHaveAccessibleName(
      /Загранпаспорт|Скан паспорта/u,
    );
    fireEvent.click(screen.getByTestId("questionnaire-next-blocker"));
    expect(onOpenDocuments).not.toHaveBeenCalled();
  });

  test("keeps passport extraction gates out of questionnaire blocker routing", () => {
    const ready = withReadyQuestionnaireFiles(
      fillEveryQuestionnaireField(
        createDraftSubmission({
          applicantNames: ["VOLKOV ANTON"],
          city: "Москва",
          familyCount: 1,
          idScheme: "local",
          submissions: [],
          type: "single",
        }),
      ),
    );
    const submission: Submission = {
      ...ready,
      files: ready.files.map((file) =>
        file.type === "passport_scan"
          ? {
              ...file,
              mimeType: "image/jpeg",
              originalFileName: "passport.jpg",
              storageBucket: "submission-media",
              storagePath: `${ready.id}/${file.applicantId}/passport_scan/passport.jpg`,
            }
          : file,
      ),
    };

    render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        submission={submission}
      />,
    );

    expect(screen.queryByTestId("questionnaire-next-blocker")).not.toBeInTheDocument();
    expect(screen.queryByText("Скан паспорта не проверен.")).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /есть блокер/u }),
    ).not.toBeInTheDocument();
  });

  test("keeps an admin field blocker available while required fields are deferred", async () => {
    const submission = withQuestionnaireIssue(
      withReadyQuestionnaireFiles(
        createDraftSubmission({
          applicantNames: ["VOLKOV ANTON"],
          city: "Москва",
          familyCount: 1,
          idScheme: "local",
          submissions: [],
          type: "single",
        }),
      ),
      "open",
      "Почтовый индекс",
      "Отель / приглашение",
    );
    render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        submission={submission}
      />,
    );

    expect(screen.getByTestId("questionnaire-next-blocker")).toHaveAccessibleName(
      /Почтовый индекс/u,
    );
    fireEvent.click(screen.getByTestId("questionnaire-next-blocker"));
    await waitFor(() => expect(screen.getByLabelText("Почтовый индекс")).toHaveFocus());
  });

  test("does not require a secondary family selfie in questionnaire document routing", () => {
    const ready = withReadyQuestionnaireFiles(
      fillEveryQuestionnaireField(
        createDraftSubmission({
          applicantNames: ["IVANOVA MARIA", "IVANOV ANTON"],
          city: "Москва",
          familyCount: 2,
          idScheme: "local",
          submissions: [],
          type: "family",
        }),
      ),
    );
    const primary = ready.applicants[0];
    const secondary = ready.applicants[1];
    const primarySelfie = ready.files.find(
      (file) => file.applicantId === primary?.id && file.type === "selfie",
    );
    if (!primary || !secondary || !primarySelfie) {
      throw new Error("expected primary, secondary, and primary selfie");
    }
    const legacySecondarySelfie = {
      ...primarySelfie,
      applicantId: secondary.id,
      id: `${secondary.id}-legacy-selfie`,
      status: "missing" as const,
      uploadStatus: "none" as const,
    };
    const submission: Submission = {
      ...ready,
      files: [
        ...ready.files.filter(
          (file) => !(file.applicantId === secondary.id && file.type === "selfie"),
        ),
        legacySecondarySelfie,
      ],
    };
    const onOpenDocuments = vi.fn();
    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        onOpenDocuments={onOpenDocuments}
        submission={submission}
      />,
    );

    expect(screen.queryByTestId("questionnaire-next-blocker")).not.toBeInTheDocument();
    expect(onOpenDocuments).not.toHaveBeenCalled();
    expect(pinnedSectionTitles(result.container)).not.toContain("Файлы");
  });

  test("resolves an open issue through the full field binding catalog", async () => {
    const submission = withQuestionnaireIssue(
      withReadyQuestionnaireFiles(
        fillEveryQuestionnaireField(
          createDraftSubmission({
            applicantNames: ["VOLKOV ANTON"],
            city: "Москва",
            familyCount: 1,
            idScheme: "local",
            submissions: [],
            type: "single",
          }),
        ),
      ),
      "open",
    );

    render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        submission={submission}
      />,
    );

    fireEvent.click(screen.getByTestId("questionnaire-next-blocker"));

    await waitFor(() => expect(screen.getByLabelText("Почтовый индекс")).toHaveFocus());
    expect(
      screen.getByText(
        "Контекст анкеты: заявитель Ready Ready; раздел Отель / приглашение.",
      ),
    ).toBeInTheDocument();
  });

  test("keeps a fixed_by_agent issue visible without blocking repeat submission", () => {
    const submission = {
      ...withQuestionnaireIssue(
        withReadyQuestionnaireFiles(
          fillEveryQuestionnaireField(
            createDraftSubmission({
              applicantNames: ["VOLKOV ANTON"],
              city: "Москва",
              familyCount: 1,
              idScheme: "local",
              submissions: [],
              type: "single",
            }),
          ),
        ),
        "fixed_by_agent",
      ),
      status: "returned" as const,
      tripDateFrom: "10.07.2026",
      tripDateTo: "18.07.2026",
    };
    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        submission={submission}
      />,
    );

    expect(
      screen.queryByRole("button", { name: "Отправить исправления" }),
    ).not.toBeInTheDocument();
    clickPinnedSection(result.container, "Отель / приглашение");
    const awaitingHeading = screen.getByText(
      "Исправление по полю «Почтовый индекс» отправлено, ожидает проверки администратора",
    );
    const awaitingStatus = awaitingHeading.closest(".v19-questionnaire-review-alert");
    expect(awaitingStatus).toHaveAttribute("role", "status");
    expect(awaitingStatus).toHaveAttribute("aria-live", "polite");
    expect(awaitingStatus).toHaveAttribute("aria-atomic", "true");
    expect(
      screen.getByText(
        "Исправление сохранено и не блокирует повторную отправку. Администратор увидит его при проверке.",
      ),
    ).toBeInTheDocument();
  });

  test("connects a blocking combobox issue to its accessible error text", async () => {
    const submission = withQuestionnaireIssue(
      withReadyQuestionnaireFiles(
        fillEveryQuestionnaireField(
          createDraftSubmission({
            applicantNames: ["VOLKOV ANTON"],
            city: "Москва",
            familyCount: 1,
            idScheme: "local",
            submissions: [],
            type: "single",
          }),
        ),
      ),
      "open",
      "Тип документа",
      "Паспорт",
    );
    const submissionWithLongPassportTypeOptions: Submission = {
      ...submission,
      applicants: submission.applicants.map((applicant) => ({
        ...applicant,
        sections: applicant.sections.map((section) => ({
          ...section,
          fields: section.fields.map((field) =>
            field.id === "passport-type"
              ? {
                  ...field,
                  options: [
                    "Ordinary Passport",
                    "Diplomatic Passport",
                    "Service Passport",
                    "Travel Document",
                  ],
                }
              : field,
          ),
        })),
      })),
    };

    render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        submission={submissionWithLongPassportTypeOptions}
      />,
    );
    fireEvent.click(screen.getByTestId("questionnaire-next-blocker"));

    const passportType = await screen.findByRole("combobox", { name: /Тип документа/ });
    const errorId = passportType.getAttribute("aria-describedby");
    expect(passportType).toHaveAttribute("aria-invalid", "true");
    expect(errorId).toBeTruthy();
    expect(document.getElementById(errorId ?? "")).toHaveTextContent(
      "Исправьте поле и повторно отправьте анкету.",
    );
  });

  test("prefers an exact field binding over stale issue section metadata", async () => {
    const submission = withQuestionnaireIssue(
      withReadyQuestionnaireFiles(
        fillEveryQuestionnaireField(
          createDraftSubmission({
            applicantNames: ["VOLKOV ANTON"],
            city: "Москва",
            familyCount: 1,
            idScheme: "local",
            submissions: [],
            type: "single",
          }),
        ),
      ),
      "open",
      "hotel-postal-code",
      "Устаревший раздел",
    );

    render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        submission={submission}
      />,
    );
    fireEvent.click(screen.getByTestId("questionnaire-next-blocker"));

    await waitFor(() => expect(screen.getByLabelText("Почтовый индекс")).toHaveFocus());
    expect(
      screen.getByText(
        "Контекст анкеты: заявитель Ready Ready; раздел Отель / приглашение.",
      ),
    ).toBeInTheDocument();
  });

  test("does not create a focused update for the wrong family applicant", async () => {
    const draft = createDraftSubmission({
      applicantNames: ["IVANOVA MARIA", "IVANOV ANTON"],
      city: "Москва",
      familyCount: 2,
      idScheme: "local",
      submissions: [],
      type: "family",
    });
    const firstApplicantId = draft.applicants[0]?.id;
    const secondApplicantId = draft.applicants[1]?.id;
    if (!firstApplicantId || !secondApplicantId)
      throw new Error("expected family applicants");
    const submission = setApplicantField(
      setApplicantField(draft, 0, "passport-expiry-date", "20.08.2030"),
      1,
      "passport-expiry-date",
      "21.08.2031",
    );
    const onSaveDraft = vi.fn().mockResolvedValue(undefined);
    const result = render(
      <FigmaQuestionnaireScreen
        initialFocus={{ applicantId: firstApplicantId, field: "passport-expiry-date" }}
        onBack={vi.fn()}
        onComplete={vi.fn()}
        onSaveDraft={onSaveDraft}
        submission={submission}
      />,
    );

    const applicantTabs = result.container.querySelectorAll(
      ".v19-questionnaire-applicant-tab",
    );
    fireEvent.click(applicantTabs[1] as HTMLButtonElement);
    fireEvent.change(screen.getByLabelText("Действителен до"), {
      target: { value: "31.12.2035" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить и выйти" }));

    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledTimes(1));
    const payload = onSaveDraft.mock.calls[0]?.[0];
    expect(payload.focusedUpdate).toBeUndefined();
    expect(payload.fieldUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          applicantId: secondApplicantId,
          fieldId: "passport-expiry-date",
          value: "31.12.2035",
        }),
      ]),
    );
  });

  test("announces the active family context and keeps active tabs in view", () => {
    const scrollIntoView = vi.fn();
    const originalScrollIntoView = HTMLElement.prototype.scrollIntoView;
    Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
      configurable: true,
      value: scrollIntoView,
      writable: true,
    });

    try {
      const submission = createDraftSubmission({
        applicantNames: ["IVANOVA MARIA", "IVANOV ANTON"],
        city: "Москва",
        familyCount: 2,
        idScheme: "local",
        submissions: [],
        type: "family",
      });
      const result = render(
        <FigmaQuestionnaireScreen
          onBack={vi.fn()}
          onComplete={vi.fn()}
          submission={submission}
        />,
      );
      const applicantTabs = result.container.querySelectorAll(
        ".v19-questionnaire-applicant-tab",
      );

      fireEvent.click(applicantTabs[1] as HTMLButtonElement);
      clickPinnedSection(result.container, "Отель / приглашение");

      expect(
        screen.getByText(
          "Контекст анкеты: заявитель Ivanov Anton; раздел Отель / приглашение.",
        ),
      ).toHaveAttribute("aria-live", "polite");
      expect(scrollIntoView).toHaveBeenCalled();
    } finally {
      if (originalScrollIntoView) {
        Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
          configurable: true,
          value: originalScrollIntoView,
          writable: true,
        });
      } else {
        delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
      }
    }
  });

  test("copies every field in the active shared section and overwrites existing values", async () => {
    const draft = createDraftSubmission({
      applicantNames: ["IVANOVA MARIA", "IVANOV ANTON", "IVANOVA ANNA"],
      city: "Москва",
      familyCount: 3,
      idScheme: "local",
      submissions: [],
      type: "family",
    });
    const secondApplicantId = draft.applicants[1]?.id;
    const thirdApplicantId = draft.applicants[2]?.id;
    if (!secondApplicantId || !thirdApplicantId) {
      throw new Error("expected secondary applicants");
    }
    const primaryValues = [
      ["home-city", "Москва"],
      ["home-street", "Арбат"],
      ["home-house", "1"],
      ["email", "family@example.com"],
      ["contact-number", "79000000000"],
      ["surname", "PRIMARY"],
      ["passport-no", "111111111"],
    ] as const;
    const primary = markApplicantValuesManual(
      primaryValues.reduce(
        (current, [fieldId, value]) => setField(current, fieldId, value),
        draft,
      ),
      0,
      primaryValues.map(([fieldId]) => fieldId),
    );
    const second = [
      ["home-street", "Собственная улица"],
      ["surname", "SECONDARY"],
      ["passport-no", "222222222"],
    ].reduce(
      (current, [fieldId, value]) => setApplicantField(current, 1, fieldId, value),
      primary,
    );
    const submission = [
      ["surname", "THIRD"],
      ["passport-no", "333333333"],
    ].reduce(
      (current, [fieldId, value]) => setApplicantField(current, 2, fieldId, value),
      second,
    );
    const onFieldChange = vi.fn();
    const onSaveDraft = vi.fn().mockResolvedValue(undefined);
    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        onFieldChange={onFieldChange}
        onSaveDraft={onSaveDraft}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Адрес и контакты");

    const copyButton = screen.getByRole("button", {
      name: "Копировать для всех",
    });
    const workToolbar = copyButton.closest(".v19-questionnaire-work-toolbar");
    expect(workToolbar).not.toBeNull();
    expect(workToolbar).toContainElement(
      screen.getByTestId("questionnaire-next-blocker"),
    );
    expect(copyButton.parentElement).toHaveClass("v19-questionnaire-work-toolbar-copy");
    expect(screen.getByLabelText("Город проживания")).toHaveAttribute(
      "autocomplete",
      "off",
    );

    fireEvent.click(copyButton);
    expect(onFieldChange).not.toHaveBeenCalled();
    expect(screen.queryByText(/Предпросмотр:/)).not.toBeInTheDocument();
    expect(
      result.container.querySelectorAll('[data-family-copy-preview="true"]').length,
    ).toBeGreaterThan(0);
    const confirmCopyButton = screen.getByRole("button", {
      name: "Подтвердить копирование",
    });
    expect(confirmCopyButton).toHaveClass("v19-questionnaire-family-copy-confirm");
    fireEvent.click(confirmCopyButton);

    const copiedUpdates = onFieldChange.mock.calls.map(([update]) => update);
    const affectedApplicantCount = new Set(
      copiedUpdates.map((update) => update.applicantId),
    ).size;
    expect(copiedUpdates.length).toBeGreaterThan(0);
    expect(affectedApplicantCount).toBe(2);
    expect(
      screen.getByText(
        `Скопировано и подтверждено после предпросмотра: ${copiedUpdates.length} полей · заявителей: ${affectedApplicantCount}.`,
      ),
    ).toHaveAttribute("role", "status");
    expect(copiedUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          applicantId: secondApplicantId,
          fieldId: "home-city",
          reviewSource: "family_shared",
          reviewState: "confirmed",
          value: "Москва",
        }),
        expect.objectContaining({
          applicantId: secondApplicantId,
          fieldId: "home-street",
          value: "Арбат",
        }),
        expect.objectContaining({
          applicantId: thirdApplicantId,
          fieldId: "home-street",
          value: "Арбат",
        }),
        expect.objectContaining({
          applicantId: thirdApplicantId,
          fieldId: "home-house",
          value: "1",
        }),
        expect.objectContaining({
          applicantId: thirdApplicantId,
          fieldId: "email",
          value: "family@example.com",
        }),
        expect.objectContaining({
          applicantId: thirdApplicantId,
          fieldId: "contact-number",
          value: "79000000000",
        }),
      ]),
    );
    expect(
      copiedUpdates.some(
        (update) => update.sectionId === "personal" || update.sectionId === "passport",
      ),
    ).toBe(false);

    const applicantTabs = result.container.querySelectorAll(
      ".v19-questionnaire-applicant-tab",
    );
    fireEvent.click(applicantTabs[1] as HTMLButtonElement);
    clickPinnedSection(result.container, "Адрес и контакты");
    expect(screen.getByLabelText("Улица / проспект / переулок")).toHaveValue("Арбат");
    expect(screen.getByLabelText("Город проживания")).toHaveValue("Москва");

    fireEvent.click(screen.getByRole("button", { name: "Сохранить и выйти" }));
    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledTimes(1));
    expect(onSaveDraft.mock.calls[0]?.[0].fieldUpdates).toEqual(
      expect.arrayContaining(copiedUpdates),
    );
  });

  test("copies every trip field, including fields outside the former shared subset", () => {
    const draft = createDraftSubmission({
      applicantNames: ["IVANOVA MARIA", "IVANOV ANTON"],
      city: "Москва",
      familyCount: 2,
      idScheme: "local",
      submissions: [],
      type: "family",
    });
    const primaryValues = [
      ["purpose", "TOURISM"],
      ["entry-count", "Многократная"],
      ["previous-biometrics", "Нет"],
      ["previous-biometrics-date", "01.02.2024"],
      ["previous-visa-number", "VISA-123"],
    ] as const;
    const primary = markApplicantValuesManual(
      primaryValues.reduce(
        (current, [fieldId, value]) => setField(current, fieldId, value),
        draft,
      ),
      0,
      primaryValues.map(([fieldId]) => fieldId),
    );
    const submission = setApplicantField(
      setApplicantField(primary, 1, "entry-count", "Однократная"),
      1,
      "previous-biometrics",
      "Да",
    );
    const onFieldChange = vi.fn();
    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        onFieldChange={onFieldChange}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Поездка");
    fireEvent.click(screen.getByRole("button", { name: "Копировать для всех" }));
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить копирование" }));

    const copiedUpdates = onFieldChange.mock.calls.map(([update]) => update);
    expect(copiedUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldId: "entry-count",
          sectionId: "trip",
          value: "Многократная",
        }),
        expect.objectContaining({
          fieldId: "previous-biometrics",
          sectionId: "trip",
          value: "Нет",
        }),
        expect.objectContaining({
          fieldId: "previous-biometrics-date",
          sectionId: "trip",
          value: "01.02.2024",
        }),
        expect.objectContaining({
          fieldId: "previous-visa-number",
          sectionId: "trip",
          value: "VISA-123",
        }),
      ]),
    );

    const applicantTabs = result.container.querySelectorAll(
      ".v19-questionnaire-applicant-tab",
    );
    fireEvent.click(applicantTabs[1] as HTMLButtonElement);
    clickPinnedSection(result.container, "Поездка");
    expect(screen.getByRole("button", { name: "Многократная" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Нет" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });

  test("invalidates a family-copy preview when the source value changes", () => {
    const draft = createDraftSubmission({
      applicantNames: ["IVANOVA MARIA", "IVANOV ANTON"],
      city: "Москва",
      familyCount: 2,
      idScheme: "local",
      submissions: [],
      type: "family",
    });
    const submission = markApplicantValuesManual(
      setField(draft, "home-city", "Самара"),
      0,
      ["home-city"],
    );
    const secondaryApplicantId = submission.applicants[1]?.id;
    if (!secondaryApplicantId) throw new Error("expected secondary applicant");
    const onFieldChange = vi.fn();
    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        onFieldChange={onFieldChange}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Адрес и контакты");
    fireEvent.click(screen.getByRole("button", { name: "Копировать для всех" }));
    expect(
      screen.getByRole("button", { name: "Подтвердить копирование" }),
    ).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Город проживания"), {
      target: { value: "Казань" },
    });
    expect(
      screen.queryByRole("button", { name: "Подтвердить копирование" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(
        "Предпросмотр отменён: данные изменились. Откройте копирование заново.",
      ),
    ).toHaveAttribute("role", "status");

    fireEvent.click(screen.getByRole("button", { name: "Копировать для всех" }));
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить копирование" }));
    expect(
      onFieldChange.mock.calls
        .map(([update]) => update)
        .filter(
          (update) =>
            update.applicantId === secondaryApplicantId &&
            update.fieldId === "home-city",
        ),
    ).toEqual([expect.objectContaining({ value: "Казань" })]);
  });

  test("reports when the primary applicant has no values to copy", () => {
    const draft = createDraftSubmission({
      applicantNames: ["IVANOVA MARIA", "IVANOV ANTON"],
      city: "Москва",
      familyCount: 2,
      idScheme: "local",
      submissions: [],
      type: "family",
    });
    const submission = setField(
      setField(draft, "home-country", ""),
      "lives-outside-citizenship",
      "",
    );
    const onFieldChange = vi.fn();
    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        onFieldChange={onFieldChange}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Адрес и контакты");

    fireEvent.click(screen.getByRole("button", { name: "Копировать для всех" }));

    expect(onFieldChange).not.toHaveBeenCalled();
    const alert = screen.getByRole("alert");
    expect(alert).toHaveClass("v19-questionnaire-family-copy-alert");
    expect(alert).toHaveTextContent(
      "У основного заявителя нет введённых пользователем значений для копирования в этом разделе.",
    );
  });

  test("does not copy OCR or legacy values without manual provenance", () => {
    const draft = createDraftSubmission({
      applicantNames: ["IVANOVA MARIA", "IVANOV ANTON"],
      city: "Москва",
      familyCount: 2,
      idScheme: "local",
      submissions: [],
      type: "family",
    });
    const legacy = setField(draft, "home-city", "Москва");
    const submission = setFieldReview(legacy, "home-street", "Арбат", {
      reviewSource: "passport_ocr",
      reviewState: "confirmed",
    });
    const onFieldChange = vi.fn();
    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        onFieldChange={onFieldChange}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Адрес и контакты");
    fireEvent.click(screen.getByRole("button", { name: "Копировать для всех" }));

    expect(onFieldChange).not.toHaveBeenCalled();
    expect(
      screen.queryByRole("button", { name: "Подтвердить копирование" }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "У основного заявителя нет введённых пользователем значений",
    );
  });

  test("uses role main for family copy when the primary applicant is not first", () => {
    const draft = createDraftSubmission({
      applicantNames: ["IVANOVA MARIA", "IVANOV ANTON"],
      city: "Москва",
      familyCount: 2,
      idScheme: "local",
      submissions: [],
      type: "family",
    });
    const mainApplicant = draft.applicants.find((applicant) => applicant.role === "main");
    const secondaryApplicant = draft.applicants.find(
      (applicant) => applicant.role !== "main",
    );
    if (!mainApplicant || !secondaryApplicant) throw new Error("expected family roles");
    const reordered: Submission = {
      ...draft,
      applicants: [secondaryApplicant, mainApplicant],
    };
    const mainIndex = reordered.applicants.findIndex(
      (applicant) => applicant.id === mainApplicant.id,
    );
    const submission = markApplicantValuesManual(
      setApplicantField(reordered, mainIndex, "home-city", "Самара"),
      mainIndex,
      ["home-city"],
    );
    const onFieldChange = vi.fn();
    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        onFieldChange={onFieldChange}
        submission={submission}
      />,
    );

    fireEvent.click(screen.getByLabelText("Выбрать туриста"));
    fireEvent.click(
      screen.getByRole("option", {
        name: new RegExp(mainApplicant.fullName, "iu"),
      }),
    );
    clickPinnedSection(result.container, "Адрес и контакты");
    fireEvent.click(screen.getByRole("button", { name: "Копировать для всех" }));
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить копирование" }));

    expect(onFieldChange).toHaveBeenCalledWith(
      expect.objectContaining({
        applicantId: secondaryApplicant.id,
        fieldId: "home-city",
        value: "Самара",
      }),
    );
  });

  test("shows applicant completion and blocker cues without duplicate next-field buttons", () => {
    const draft = createDraftSubmission({
      applicantNames: ["READY PERSON", "PENDING PERSON", "BLOCKED PERSON"],
      city: "Москва",
      familyCount: 3,
      idScheme: "local",
      submissions: [],
      type: "family",
    });
    const filled = fillEveryQuestionnaireField(
      fillEveryQuestionnaireField(draft, 0),
      2,
    );
    const ready = withReadyQuestionnaireFiles(filled);
    const blockedApplicant = ready.applicants[2];
    if (!blockedApplicant) throw new Error("expected blocked applicant");
    const submission: Submission = {
      ...ready,
      issues: [
        {
          comment: "Сверьте номер паспорта.",
          createdAt: "2026-07-11T00:00:00.000Z",
          createdBy: "admin",
          id: "issue-blocked-family-member",
          reason: "Требуется проверка",
          severity: "blocker",
          status: "open",
          target: {
            applicantId: blockedApplicant.id,
            applicantName: blockedApplicant.fullName,
            field: "Номер паспорта",
            section: "Паспорт",
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

    expect(
      screen.getByRole("button", { name: /Ready Ready: \d+ из \d+, готов/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /Pending Person: \d+ из \d+, не завершён/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /Ready Ready: \d+ из \d+, есть блокер/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: /^Следующее незаполненное:/u }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: /Pending Person: \d+ из \d+, не завершён/,
      }),
    );
    expect(
      screen.getByText(
        "Контекст анкеты: заявитель Pending Person; раздел Личные данные.",
      ),
    ).toBeInTheDocument();
  });

  test("continues to the next family applicant before offering save and exit", () => {
    const submission = createDraftSubmission({
      applicantNames: ["IVANOVA MARIA", "IVANOV ANTON"],
      city: "Москва",
      familyCount: 2,
      idScheme: "local",
      submissions: [],
      type: "family",
    });
    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Отель / приглашение");
    const nextApplicantButton = screen.getByRole("button", {
      name: "Далее: Ivanov Anton",
    });
    expect(
      screen.queryByRole("button", { name: "Готово — сохранить и выйти" }),
    ).not.toBeInTheDocument();
    fireEvent.click(nextApplicantButton);

    expect(
      screen.getByRole("button", {
        name: /Ivanov Anton: \d+ из \d+, не завершён/,
      }),
    ).toHaveAttribute("aria-pressed", "true");
    clickPinnedSection(result.container, "Отель / приглашение");
    expect(
      screen.getByRole("button", { name: "Готово — сохранить и выйти" }),
    ).toBeInTheDocument();
  });

  test("copies hotel country, city, and postal code for another family applicant", () => {
    const draft = createDraftSubmission({
      applicantNames: ["IVANOVA MARIA", "IVANOV ANTON"],
      city: "Москва",
      familyCount: 2,
      idScheme: "local",
      submissions: [],
      type: "family",
    });
    const submission = markApplicantValuesManual(
      setField(
        setField(setField(draft, "hotel-country", "Spain"), "hotel-city", "Madrid"),
        "hotel-postal-code",
        "28001",
      ),
      0,
      ["hotel-country", "hotel-city", "hotel-postal-code"],
    );
    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        submission={submission}
      />,
    );
    const applicantTabs = result.container.querySelectorAll(
      ".v19-questionnaire-applicant-tab",
    );

    clickPinnedSection(result.container, "Отель / приглашение");
    fireEvent.click(screen.getByRole("button", { name: "Копировать для всех" }));
    fireEvent.click(screen.getByRole("button", { name: "Подтвердить копирование" }));
    fireEvent.click(applicantTabs[1] as HTMLButtonElement);
    clickPinnedSection(result.container, "Отель / приглашение");

    expect(dropdownTrigger(result.container, "Страна")).toHaveTextContent("Spain");
    expect(screen.getByLabelText("Город")).toHaveValue("Madrid");
    expect(screen.getByLabelText("Почтовый индекс")).toHaveValue("28001");
  });

  test("keeps BLS dropdown dictionaries available on the current UI", () => {
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

    clickPinnedSection(result.container, "Запись");
    fireEvent.click(dropdownTrigger(result.container, "Город подачи"));
    expectDropdownOption("Екатеринбург");
    fireEvent.mouseDown(document.body);

    expect(visibleFieldLabels(result.container)).toEqual([
      "Город подачи",
      "С какого числа",
      "По какое число",
    ]);

    clickPinnedSection(result.container, "Паспорт");
    fireEvent.click(dropdownTrigger(result.container, "Тип документа"));
    expectDropdownOption("Ordinary Passport");
    expectDropdownOption("Travel Document");
    fireEvent.mouseDown(document.body);

    clickPinnedSection(result.container, "Поездка");
    fireEvent.click(dropdownTrigger(result.container, "Количество въездов"));
    expectDropdownOption("Однократная");
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

    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Личные данные");
    expect(screen.getByLabelText("Дата рождения")).toHaveValue("20.08.1990");
    expect(screen.queryByText("Дата рождения не совпадает")).not.toBeInTheDocument();
    expect(screen.queryByText("Не совпадает с PDF")).not.toBeInTheDocument();
    expect(screen.queryByText(/12\.05\.1985|15\.05\.1985/)).not.toBeInTheDocument();
  });

  test("renders valid filled controls with a quiet gray state", () => {
    const draft = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const submission = setField(draft, "birth-place", "LENINGRAD");

    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Личные данные");
    expect(screen.getByLabelText("Место рождения")).toHaveClass("is-filled");
    expect(screen.getByLabelText("Предыдущие фамилии")).not.toHaveClass(
      "is-filled",
    );
  });

  test("does not duplicate a field issue as the next blocker notice", () => {
    const draft = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const ready = fillEveryQuestionnaireField(draft);
    const submission = withQuestionnaireIssue(
      ready,
      "open",
      "Место рождения",
      "Личные данные",
    );

    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Личные данные");
    expect(screen.getByText("Место рождения: Нужно уточнение")).toBeInTheDocument();
    expect(screen.queryByTestId("questionnaire-next-blocker")).not.toBeInTheDocument();
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

    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Личные данные");
    expect(screen.getByText("Дата рождения: PDF не совпадает")).toBeInTheDocument();
    expect(
      screen.getAllByText("PDF не совпадает с заявкой: Дата рождения."),
    ).toHaveLength(2);
    expect(screen.queryByText(/Проверить|passport_ocr/)).not.toBeInTheDocument();
    const birthDate = screen.getByLabelText("Дата рождения");
    const birthDateErrorId = birthDate.getAttribute("aria-describedby");
    expect(birthDate).toHaveAttribute("aria-invalid", "true");
    expect(birthDateErrorId).toBeTruthy();
    expect(document.getElementById(birthDateErrorId ?? "")).toHaveTextContent(
      "PDF не совпадает с заявкой: Дата рождения.",
    );
    expect(screen.getByLabelText("Место рождения")).toHaveClass("is-review");
  });

  test("keeps OCR review pending until the agent explicitly confirms it", async () => {
    const draft = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const submission = setFieldReview(draft, "birth-date", "20.08.1990", {
      reviewSource: "passport_ocr",
      reviewState: "needs_review",
    });

    const onSaveDraft = vi.fn();
    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        onSaveDraft={onSaveDraft}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Личные данные");
    const birthDate = screen.getByLabelText("Дата рождения");
    expect(birthDate).toHaveClass("is-review");
    const reviewShell = birthDate.closest(".v19-questionnaire-control-shell");
    expect(reviewShell).toHaveClass("has-confirmation");
    expect(
      within(reviewShell as HTMLElement).getByRole("button", {
        name: "Подтвердить поле: Дата рождения",
      }),
    ).toBeInTheDocument();
    fireEvent.focus(birthDate);
    expect(birthDate).toHaveClass("is-review");

    fireEvent.click(
      screen.getByRole("button", { name: "Подтвердить поле: Дата рождения" }),
    );
    expect(birthDate).not.toHaveClass("is-review");
    expect(reviewShell).not.toHaveClass("has-confirmation");
    fireEvent.click(screen.getByRole("button", { name: "Сохранить и выйти" }));

    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledTimes(1));
    expect(onSaveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        reviewConfirmations: [
          expect.objectContaining({
            applicantId: submission.applicants[0]?.id,
            fieldId: "birth-date",
            sectionId: "personal",
          }),
        ],
        saveIntent: "manual",
      }),
    );
    expect(onSaveDraft.mock.calls[0]?.[0].fieldUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          fieldId: "birth-date",
          reviewSource: "manual",
          reviewState: "confirmed",
          value: "20.08.1990",
        }),
      ]),
    );
  });

  test("returns every changed questionnaire field on save and exit", async () => {
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
    const onBack = vi.fn();
    const onSaveDraft = vi.fn();

    const readySubmission = fillEveryQuestionnaireField(draft);

    const result = render(
      <FigmaQuestionnaireScreen
        onBack={onBack}
        onComplete={vi.fn()}
        onSaveDraft={onSaveDraft}
        submission={{
          ...readySubmission,
          completeness: { files: 100, questionnaire: 100, total: 100 },
          files: readySubmission.files.map((file) => ({
            ...file,
            reviewStatus: "accepted",
            status: "accepted",
            uploadStatus: "uploaded",
          })),
        }}
      />,
    );

    clickPinnedSection(result.container, "Личные данные");
    fireEvent.change(screen.getByLabelText("Фамилия"), {
      target: { value: "VOLKOV" },
    });
    fireEvent.change(screen.getByLabelText("Имя"), {
      target: { value: "ANTON" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить и выйти" }));
    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledTimes(1));
    expect(onBack).toHaveBeenCalledTimes(1);

    expect(onSaveDraft.mock.calls[0]?.[0]).toEqual(
      expect.objectContaining({ saveIntent: "manual" }),
    );
    expect(onSaveDraft.mock.calls[0]?.[0].fieldUpdates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          applicantId,
          fieldId: "surname",
          sectionId: "personal",
          value: "VOLKOV",
        }),
        expect.objectContaining({
          applicantId,
          fieldId: "first-name",
          sectionId: "personal",
          value: "ANTON",
        }),
      ]),
    );
  });

  test("runs the dedicated save-and-exit callback only after a successful manual save", async () => {
    const submission = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const save = deferred();
    const onBack = vi.fn();
    const onSaveAndExit = vi.fn().mockResolvedValue(undefined);
    const onSaveDraft = vi.fn().mockReturnValue(save.promise);

    render(
      <FigmaQuestionnaireScreen
        onBack={onBack}
        onComplete={vi.fn()}
        onSaveAndExit={onSaveAndExit}
        onSaveDraft={onSaveDraft}
        submission={submission}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Сохранить и выйти" }));

    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledTimes(1));
    expect(onSaveAndExit).not.toHaveBeenCalled();
    expect(onBack).not.toHaveBeenCalled();

    save.resolve();

    await waitFor(() => expect(onSaveAndExit).toHaveBeenCalledTimes(1));
    expect(onBack).not.toHaveBeenCalled();
  });

  test("retries a failed exit without duplicating an already successful draft save", async () => {
    const submission = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const onSaveAndExit = vi
      .fn()
      .mockRejectedValueOnce(new Error("Failed to fetch"))
      .mockResolvedValueOnce(undefined);
    const onSaveDraft = vi.fn().mockResolvedValue(undefined);
    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        onSaveAndExit={onSaveAndExit}
        onSaveDraft={onSaveDraft}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Личные данные");
    fireEvent.change(screen.getByLabelText("Фамилия"), {
      target: { value: "VOLKOV" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить и выйти" }));

    await waitFor(() =>
      expect(screen.getByTestId("questionnaire-save-error")).toHaveTextContent(
        "Нет соединения с сервером",
      ),
    );
    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(onSaveAndExit).toHaveBeenCalledTimes(1);

    fireEvent.click(
      screen.getByRole("button", { name: "Повторить сохранение" }),
    );

    await waitFor(() => expect(onSaveAndExit).toHaveBeenCalledTimes(2));
    expect(onSaveDraft).toHaveBeenCalledTimes(1);
  });

  test("deduplicates rapid save-and-exit clicks through the final navigation side effect", async () => {
    const submission = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const save = deferred();
    const onSaveAndExit = vi.fn().mockResolvedValue(undefined);
    const onSaveDraft = vi.fn().mockReturnValue(save.promise);

    render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        onSaveAndExit={onSaveAndExit}
        onSaveDraft={onSaveDraft}
        submission={submission}
      />,
    );

    const saveAndExit = screen.getByRole("button", { name: "Сохранить и выйти" });
    fireEvent.click(saveAndExit);
    fireEvent.click(saveAndExit);

    expect(onSaveDraft).toHaveBeenCalledTimes(1);
    expect(saveAndExit).toBeDisabled();
    save.resolve();

    await waitFor(() => expect(onSaveAndExit).toHaveBeenCalledTimes(1));
  });

  test("matches open issues by legacy labels after questionnaire label changes", () => {
    const draft = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const applicant = draft.applicants[0];
    if (!applicant) throw new Error("expected applicant");
    const submission: Submission = {
      ...draft,
      issues: [
        {
          comment: "Проверьте срок действия паспорта.",
          createdAt: "2026-07-06T00:00:00.000Z",
          createdBy: "admin",
          id: "issue-passport-expiry",
          reason: "Требует проверки",
          severity: "blocker",
          status: "open",
          target: {
            applicantId: applicant.id,
            applicantName: applicant.fullName,
            field: "Дата окончания паспорта",
            section: "Паспорт",
          },
          type: "field",
        },
      ],
    };

    render(
      <FigmaQuestionnaireScreen
        initialFocus={{
          applicantId: applicant.id,
          field: "passport-expiry-date",
        }}
        onBack={vi.fn()}
        onComplete={vi.fn()}
        submission={submission}
      />,
    );

    expect(screen.getByLabelText("Действителен до")).toHaveClass("is-invalid");
    expect(screen.getAllByText("Проверьте срок действия паспорта.")).toHaveLength(2);
  });
});
