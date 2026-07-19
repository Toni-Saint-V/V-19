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
import { FigmaQuestionnaireScreen } from "../../src/modules/submissions/components/FigmaQuestionnaireScreen";
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
    (candidate) => candidate.applicantId === applicant?.id && candidate.type === fileType,
  );
  if (!applicant || !file) throw new Error("expected applicant and file");

  return {
    ...submission,
    files: submission.files.map((candidate) =>
      candidate.id === file.id
        ? { ...candidate, linkedIssueId: "issue-file-selfie", status: "needs_replacement" as const }
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

    await waitFor(() =>
      expect(screen.getByLabelText("По какое число")).toHaveFocus(),
    );
    expect(
      screen.getByText(
        "Контекст анкеты: заявитель VOLKOV ANTON; раздел Запись.",
      ),
    ).toBeInTheDocument();
    expect(
      screen.getAllByText("Исправьте поле и повторно отправьте анкету."),
    ).toHaveLength(1);
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
        "Контекст анкеты: заявитель VOLKOV ANTON; раздел Личные данные.",
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
    fireEvent.click(
      screen.getByRole("button", {
        name: /Перейти к следующему обязательному действию:/,
      }),
    );

    await waitFor(() =>
      expect(screen.getAllByText(/^Сначала:/).length).toBeGreaterThan(0),
    );
    expect(result.container.querySelector(".v19-questionnaire-field-control.is-invalid"))
      .toBeInTheDocument();
    expect(screen.getAllByText("Обязательное поле").length).toBeGreaterThan(0);
    expect(onComplete).not.toHaveBeenCalled();
  });

  test("keeps exactly back and save actions in the compact header", () => {
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
    expect(header?.querySelectorAll("button")).toHaveLength(2);
    expect(
      screen.queryByRole("button", { name: /Отправить на проверку|Отправить/ }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Сохранить и выйти" })).toBeEnabled();
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
      "Адрес и контакты",
      "Поездка",
      "Отель / приглашение",
      "Запись",
      "Личные данные",
      "Паспорт",
      "Работа / учеба",
    ]);
    expect(pinnedSectionTitles(result.container)).not.toContain("Файлы");
    expect(pinnedSectionTitles(result.container)).not.toContain("Родственник ЕС");
    expect(pinnedSectionTitles(result.container)).not.toContain("Оплата поездки");
    expect(pinnedSectionTitles(result.container)).not.toContain("Кто заполнил");
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

  test("keeps stay duration as a manual field when travel dates change", () => {
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

    clickPinnedSection(result.container, "Поездка");
    const duration = screen.getByLabelText("Длительность пребывания");
    expect(duration).not.toHaveAttribute("readonly");
    expect(duration).toHaveValue(null);

    fireEvent.change(screen.getByLabelText("Дата въезда"), {
      target: { value: "15012027" },
    });
    fireEvent.change(screen.getByLabelText("Дата выезда"), {
      target: { value: "22012027" },
    });
    expect(duration).toHaveValue(null);

    fireEvent.change(duration, {
      target: { value: "8" },
    });
    expect(duration).toHaveValue(8);
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
      "Москва",
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
    expect(payload).toEqual(
      expect.objectContaining({ saveIntent: "manual" }),
    );
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
    expect(dropdownTrigger(legacyResult.container, "Страна рождения")).toHaveTextContent(
      "Выберите вариант",
    );
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
    const replacementSave = vi
      .fn()
      .mockRejectedValue(new Error("network failure"));
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

  test("allows leaving the questionnaire when the navigation save fails", async () => {
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

    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
    expect(onSaveDraft).toHaveBeenCalledWith(
      expect.objectContaining({ saveIntent: "navigation" }),
    );
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
    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        submission={submission}
      />,
    );

    clickPinnedSection(result.container, "Адрес и контакты");
    const street = screen.getByLabelText("Улица / проспект / переулок");
    fireEvent.focus(street);
    fireEvent.change(street, { target: { value: "ул" } });
    fireEvent.click(screen.getByRole("option", { name: "улица" }));
    expect(street).toHaveValue("улица ");
    expect(screen.getByLabelText("Дом")).toBeInTheDocument();
    expect(screen.getByLabelText("Корпус / строение")).toBeInTheDocument();
    expect(screen.getByLabelText("Квартира / офис / помещение")).toBeInTheDocument();

    const city = screen.getByLabelText("Город проживания");
    fireEvent.focus(city);
    fireEvent.change(city, { target: { value: "спб" } });
    fireEvent.click(screen.getByRole("option", { name: "Санкт-Петербург" }));
    expect(city).toHaveValue("Санкт-Петербург");
    fireEvent.change(city, { target: { value: "с" } });
    expect(screen.getByRole("option", { name: "Самара" })).toBeInTheDocument();
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
    if (!applicantId || !selfieFile) throw new Error("expected applicant and selfie slot");
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
    expect(within(focusedSlot as HTMLElement).getByLabelText("Заменить Селфи 1")).toBeInTheDocument();
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

    fireEvent.click(
      screen.getByRole("button", { name: "Гостиница/временное жилье" }),
    );
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
    const submission = setField(fillEveryQuestionnaireField(draft), "home-street", "");

    render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        submission={submission}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Следующее поле" }));

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

    fireEvent.click(screen.getByRole("button", { name: "Блокер" }));

    await waitFor(() => expect(screen.getByLabelText("Почтовый индекс")).toHaveFocus());
    expect(
      screen.getByText(
        "Контекст анкеты: заявитель VOLKOV ANTON; раздел Отель / приглашение.",
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

    fireEvent.click(screen.getByRole("button", { name: "Блокер" }));

    expect(screen.getByLabelText("Файлы заявителя")).toBeInTheDocument();
    const focusedSlot = result.container.querySelector(`[data-file-id="${passport.id}"]`);
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

    fireEvent.click(screen.getByRole("button", { name: "Блокер" }));

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

  test("routes file blockers to document collection when that workspace is available", () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Блокер" }));

    expect(onOpenDocuments).toHaveBeenCalledWith("error");
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

    fireEvent.click(screen.getByRole("button", { name: "Блокер" }));

    await waitFor(() =>
      expect(screen.getByLabelText("Почтовый индекс")).toHaveFocus(),
    );
    expect(
      screen.getByText(
        "Контекст анкеты: заявитель VOLKOV ANTON; раздел Отель / приглашение.",
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
    fireEvent.click(screen.getByRole("button", { name: "Блокер" }));

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
    fireEvent.click(screen.getByRole("button", { name: "Блокер" }));

    await waitFor(() => expect(screen.getByLabelText("Почтовый индекс")).toHaveFocus());
    expect(
      screen.getByText(
        "Контекст анкеты: заявитель VOLKOV ANTON; раздел Отель / приглашение.",
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
          "Контекст анкеты: заявитель IVANOV ANTON; раздел Отель / приглашение.",
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

  test("copies allowlisted shared data to every secondary applicant without overwriting", async () => {
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
    const primary = [
      ["home-city", "Москва"],
      ["home-street", "Арбат"],
      ["home-house", "1"],
      ["email", "family@example.com"],
      ["contact-number", "79000000000"],
      ["surname", "PRIMARY"],
      ["passport-no", "111111111"],
    ].reduce(
      (current, [fieldId, value]) => setField(current, fieldId, value),
      draft,
    );
    const second = [
      ["home-street", "Собственная улица"],
      ["surname", "SECONDARY"],
      ["passport-no", "222222222"],
    ].reduce(
      (current, [fieldId, value]) =>
        setApplicantField(current, 1, fieldId, value),
      primary,
    );
    const submission = [
      ["surname", "THIRD"],
      ["passport-no", "333333333"],
    ].reduce(
      (current, [fieldId, value]) =>
        setApplicantField(current, 2, fieldId, value),
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

    const copyButton = screen.getByRole("button", {
      name: "Копировать для всех",
    });
    const workToolbar = copyButton.closest(
      ".v19-questionnaire-work-toolbar",
    );
    expect(workToolbar).not.toBeNull();
    expect(workToolbar).toContainElement(
      screen.getByTestId("questionnaire-next-blocker"),
    );
    expect(copyButton.parentElement).toHaveClass(
      "v19-questionnaire-work-toolbar-copy",
    );

    fireEvent.click(copyButton);
    expect(onFieldChange).not.toHaveBeenCalled();
    expect(screen.getByText(/Предпросмотр:/)).toHaveAttribute("role", "status");
    fireEvent.click(
      screen.getByRole("button", { name: "Подтвердить копирование" }),
    );

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
          applicantId: thirdApplicantId,
          fieldId: "home-street",
          value: "Арбат",
        }),
        expect.objectContaining({
          applicantId: thirdApplicantId,
          fieldId: "home-house",
          value: "1",
        }),
      ]),
    );
    expect(copiedUpdates).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          applicantId: secondApplicantId,
          fieldId: "home-street",
        }),
      ]),
    );
    expect(
      copiedUpdates.some(
        (update) =>
          update.sectionId === "personal" || update.sectionId === "passport",
      ),
    ).toBe(false);

    const applicantTabs = result.container.querySelectorAll(
      ".v19-questionnaire-applicant-tab",
    );
    fireEvent.click(applicantTabs[1] as HTMLButtonElement);
    clickPinnedSection(result.container, "Адрес и контакты");
    expect(screen.getByLabelText("Улица / проспект / переулок")).toHaveValue(
      "Собственная улица",
    );
    expect(screen.getByLabelText("Город проживания")).toHaveValue("Москва");

    fireEvent.click(screen.getByRole("button", { name: "Сохранить и выйти" }));
    await waitFor(() => expect(onSaveDraft).toHaveBeenCalledTimes(1));
    expect(onSaveDraft.mock.calls[0]?.[0].fieldUpdates).toEqual(
      expect.arrayContaining(copiedUpdates),
    );
  });

  test("reports when family-wide copy has no eligible empty targets", () => {
    const draft = createDraftSubmission({
      applicantNames: ["IVANOVA MARIA", "IVANOV ANTON"],
      city: "Москва",
      familyCount: 2,
      idScheme: "local",
      submissions: [],
      type: "family",
    });
    const submission: Submission = {
      ...draft,
      applicants: draft.applicants.map((applicant, index) =>
        index === 1
          ? {
              ...applicant,
              sections: applicant.sections.map((section) => ({
                ...section,
                fields: section.fields.map((field) => ({
                  ...field,
                  value: "EXISTING",
                })),
              })),
            }
          : applicant,
      ),
    };
    const onFieldChange = vi.fn();
    render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        onFieldChange={onFieldChange}
        submission={submission}
      />,
    );

    fireEvent.click(
      screen.getByRole("button", { name: "Копировать для всех" }),
    );

    expect(onFieldChange).not.toHaveBeenCalled();
    expect(
      screen.getByText(
        "В этом разделе данные уже заполнены или у первого заявителя нет значений для копирования.",
      ),
    ).toHaveAttribute("role", "status");
  });

  test("shows applicant completion and blocker cues with direct next-incomplete navigation", async () => {
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
      screen.getByRole("button", { name: /READY PERSON: \d+ из \d+, готов/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /PENDING PERSON: \d+ из \d+, не завершён/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("button", {
        name: /BLOCKED PERSON: \d+ из \d+, есть блокер/,
      }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Следующее незаполненное: READY PERSON" }),
    ).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Следующее незаполненное: PENDING PERSON",
      }),
    );
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: /Город проживания/ })).toHaveFocus(),
    );
    expect(
      screen.getByText(
        "Контекст анкеты: заявитель PENDING PERSON; раздел Адрес и контакты.",
      ),
    ).toBeInTheDocument();

    fireEvent.click(
      screen.getByRole("button", {
        name: "Следующее незаполненное: BLOCKED PERSON",
      }),
    );
    await waitFor(() => expect(screen.getByLabelText("Номер паспорта")).toHaveFocus());
    expect(
      screen.getByText(
        "Контекст анкеты: заявитель BLOCKED PERSON; раздел Паспорт.",
      ),
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
    const submission = setField(
      setField(setField(draft, "hotel-country", "Spain"), "hotel-city", "Madrid"),
      "hotel-postal-code",
      "28001",
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
    fireEvent.click(
      screen.getByRole("button", { name: "Подтвердить копирование" }),
    );
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
    fireEvent.focus(birthDate);
    expect(birthDate).toHaveClass("is-review");

    fireEvent.click(
      screen.getByRole("button", { name: "Подтвердить поле: Дата рождения" }),
    );
    expect(birthDate).not.toHaveClass("is-review");
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
