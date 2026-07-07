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

function pinnedSectionTitles(container: HTMLElement) {
  const list = container.querySelector(".v19-questionnaire-section-list--pinned");
  if (!list) throw new Error("expected pinned section list");

  return Array.from(list.querySelectorAll("button")).map((button) => {
    const title = button.querySelector(".font-semibold")?.textContent?.trim();
    if (!title) throw new Error("expected section title");
    return title;
  });
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
    container.querySelectorAll(".v19-questionnaire-fields-grid .v19-questionnaire-field-number"),
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
  expect(screen.getAllByRole("button", { name }).length).toBeGreaterThan(0);
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

    clickPinnedSection(result.container, "Запись");
    const cityField = result.container.querySelector("[data-field-label='Город подачи']");
    const cityTrigger = cityField?.querySelector("button");
    if (!cityTrigger) throw new Error("expected city dropdown trigger");

    fireEvent.click(cityTrigger);

    expect(screen.getByRole("button", { name: "Екатеринбург" })).toBeInTheDocument();
  });

  test("renders BLS sections in the archived order without changing the shell", () => {
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
      "Файлы",
      "Запись",
      "Личные данные",
      "Паспорт",
      "Родственник ЕС",
      "Адрес и контакты",
      "Работа / учеба",
      "Поездка",
      "Отель / приглашение",
      "Оплата поездки",
      "Кто заполнил",
    ]);
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
      "Фамилия при рождении / предыдущая",
      "Имя",
      "Дата рождения",
      "Место рождения",
      "Страна рождения",
      "Текущее гражданство",
      "Гражданство при рождении, если отличается",
      "Иное гражданство",
      "Пол",
      "Семейное положение",
      "Родитель/опекун несовершеннолетнего",
      "Национальный ID",
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
    expect(visibleFieldNumbers(result.container)).toEqual(["1", "2", "3", "4", "5", "6"]);

    clickPinnedSection(result.container, "Адрес и контакты");
    expect(visibleFieldLabels(result.container)).toEqual([
      "Домашний адрес",
      "Email",
      "Телефон",
      "Страна проживания",
      "Город проживания",
      "Почтовый индекс",
      "Проживание не в стране гражданства",
      "Вид на жительство / документ",
      "Номер документа",
      "Действителен до",
    ]);

    clickPinnedSection(result.container, "Работа / учеба");
    expect(visibleFieldLabels(result.container)).toEqual([
      "Профессия",
      "Уточнение профессии",
      "Работодатель / учебное заведение",
      "Телефон работодателя / учебного заведения",
      "Адрес работодателя / учебного заведения",
    ]);

    clickPinnedSection(result.container, "Поездка");
    expect(visibleFieldLabels(result.container)).toEqual([
      "Цель поездки",
      "Дополнительные сведения о цели",
      "Основная страна назначения",
      "Страна первого въезда",
      "Количество въездов",
      "Дата въезда",
      "Дата выезда",
      "Длительность пребывания",
      "Отпечатки ранее сдавались",
      "Дата сдачи отпечатков",
      "Номер визы",
      "Разрешение на въезд в конечную страну",
      "Кем выдано",
      "Действительно с",
      "Действительно до",
    ]);

    clickPinnedSection(result.container, "Отель / приглашение");
    expect(visibleFieldLabels(result.container)).toEqual([
      "Тип принимающей стороны",
      "ФИО приглашающего лица или название отеля",
      "Адрес",
      "Email",
      "Телефон",
      "Название и адрес компании/организации",
      "Контактное лицо компании",
      "Телефон компании",
    ]);

    clickPinnedSection(result.container, "Оплата поездки");
    expect(visibleFieldLabels(result.container)).toEqual([
      "Кто оплачивает поездку",
      "Средства заявителя",
      "Спонсор указан в полях 30/31",
      "Другой спонсор",
      "Средства спонсора",
    ]);
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

    fireEvent.click(dropdownTrigger(result.container, "Тип визы"));
    expectDropdownOption("Национальная");
    expectDropdownOption("Шенгенская");
    fireEvent.mouseDown(document.body);

    clickPinnedSection(result.container, "Паспорт");
    fireEvent.click(dropdownTrigger(result.container, "Тип документа"));
    expectDropdownOption("Ordinary Passport");
    expectDropdownOption("Travel Document");
    fireEvent.mouseDown(document.body);

    clickPinnedSection(result.container, "Работа / учеба");
    fireEvent.click(dropdownTrigger(result.container, "Профессия"));
    expectDropdownOption("UNEMPLOYED");
    expectDropdownOption("OTHER");
    fireEvent.mouseDown(document.body);

    clickPinnedSection(result.container, "Поездка");
    fireEvent.click(dropdownTrigger(result.container, "Количество въездов"));
    expectDropdownOption("Однократная");
    expectDropdownOption("Многократная");
    fireEvent.mouseDown(document.body);

    clickPinnedSection(result.container, "Оплата поездки");
    fireEvent.click(dropdownTrigger(result.container, "Кто оплачивает поездку"));
    expectDropdownOption("Сам заявитель");
    expectDropdownOption("Спонсор");
    fireEvent.mouseDown(document.body);

    fireEvent.click(dropdownTrigger(result.container, "Средства заявителя"));
    expectDropdownOption("Наличные");
    expectDropdownOption("Кредитная карта");
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

    expect(screen.getByText("Дата рождения: PDF не совпадает")).toBeInTheDocument();
    expect(screen.getAllByText("PDF не совпадает с заявкой: Дата рождения.")).toHaveLength(2);
    expect(screen.queryByText(/Проверить|passport_ocr/)).not.toBeInTheDocument();
    expect(screen.getByLabelText("Место рождения")).toHaveClass("is-review");
  });

  test("returns every changed questionnaire field on completion", () => {
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
    const onComplete = vi.fn();

    render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={onComplete}
        submission={draft}
      />,
    );

    fireEvent.change(screen.getByLabelText("Фамилия"), {
      target: { value: "VOLKOV" },
    });
    fireEvent.change(screen.getByLabelText("Имя"), {
      target: { value: "ANTON" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Готово/ }));

    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(onComplete.mock.calls[0]?.[0].fieldUpdates).toEqual(
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
