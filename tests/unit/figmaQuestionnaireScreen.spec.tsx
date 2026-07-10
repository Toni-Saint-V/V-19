import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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

function fillEveryQuestionnaireField(submission: Submission) {
  const applicant = submission.applicants[0];
  if (!applicant) throw new Error("expected applicant");

  return applicant.sections
    .flatMap((section) => section.fields)
    .reduce((current, field) => {
      const { id: fieldId, label } = field;
      const value = fieldId.includes("date") || fieldId.includes("valid") || fieldId.includes("expiry")
        ? "20.08.2030"
        : label.toLocaleLowerCase("ru-RU").includes("email")
          ? "ready@example.com"
          : label.toLocaleLowerCase("ru-RU").includes("телефон")
            ? "79000000000"
            : fieldId === "passport-no"
              ? "752869613"
              : "READY";
      return setField(current, fieldId, value);
    }, submission);
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

  return Array.from(list.querySelectorAll(".v19-questionnaire-section-tab")).map((button) => {
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

  test("disables review handoff while the questionnaire is incomplete", () => {
    const submission = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const onComplete = vi.fn();

    render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={onComplete}
        submission={submission}
      />,
    );

    const completeButton = screen.getByRole("button", {
      name: /Готово к проверке|Готово/,
    });
    expect(completeButton).toBeDisabled();

    fireEvent.click(completeButton);
    expect(onComplete).not.toHaveBeenCalled();
  });

  test("hides the EU relative section until it is explicitly needed", () => {
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
      "Адрес и контакты",
      "Работа / учеба",
      "Поездка",
      "Отель / приглашение",
      "Оплата поездки",
      "Кто заполнил",
    ]);
    fireEvent.click(screen.getAllByRole("button", { name: "Добавить родственника ЕС" })[0]!);
    expect(pinnedSectionTitles(result.container)).toContain("Родственник ЕС");
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
      "Основная страна назначения",
      "Страна первого въезда",
      "Количество въездов",
      "Дата въезда",
      "Дата выезда",
      "Длительность пребывания",
      "Отпечатки ранее сдавались",
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
      "Страна",
      "Город",
      "Почтовый индекс",
      "Email",
      "Телефон",
    ]);

    clickPinnedSection(result.container, "Оплата поездки");
    expect(visibleFieldLabels(result.container)).toEqual([
      "Кто оплачивает поездку",
      "Средства заявителя",
    ]);
  });

  test("hides the rare previous surname field for male applicants until requested", () => {
    const submission = createDraftSubmission({
      applicantNames: ["VOLKOV ANTON"],
      city: "Москва",
      familyCount: 1,
      idScheme: "local",
      submissions: [],
      type: "single",
    });
    const result = render(
      <FigmaQuestionnaireScreen onBack={vi.fn()} onComplete={vi.fn()} submission={submission} />,
    );

    clickPinnedSection(result.container, "Личные данные");
    fireEvent.click(screen.getByRole("button", { name: "Мужской" }));

    expect(visibleFieldLabels(result.container)).not.toContain("Фамилия при рождении / предыдущая");
    fireEvent.click(screen.getByRole("button", { name: "Указать предыдущую фамилию" }));
    expect(visibleFieldLabels(result.container)).toContain("Фамилия при рождении / предыдущая");
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
    expect(screen.queryByLabelText("Вид на жительство / документ")).not.toBeInTheDocument();
    fireEvent.click(dropdownTrigger(result.container, "Проживание не в стране гражданства"));
    fireEvent.click(screen.getByRole("button", { name: "Да" }));
    expect(screen.getByLabelText("Вид на жительство / документ")).toBeInTheDocument();

    clickPinnedSection(result.container, "Поездка");
    expect(visibleFieldLabels(result.container)).not.toContain("Дополнительные сведения о цели");
    expect(screen.queryByLabelText("Дата сдачи отпечатков")).not.toBeInTheDocument();
    fireEvent.click(dropdownTrigger(result.container, "Цель поездки"));
    fireEvent.click(screen.getByRole("button", { name: "OTHER" }));
    expect(visibleFieldLabels(result.container)).toContain("Дополнительные сведения о цели");
    fireEvent.click(dropdownTrigger(result.container, "Отпечатки ранее сдавались"));
    fireEvent.click(screen.getByRole("button", { name: "Да" }));
    expect(screen.getByLabelText("Дата сдачи отпечатков")).toBeInTheDocument();

    clickPinnedSection(result.container, "Оплата поездки");
    expect(screen.queryByLabelText("Другой спонсор")).not.toBeInTheDocument();
    fireEvent.click(dropdownTrigger(result.container, "Кто оплачивает поездку"));
    fireEvent.click(screen.getByRole("button", { name: "Спонсор" }));
    expect(screen.getByLabelText("Другой спонсор")).toBeInTheDocument();
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
    expect(hotelPhone).toHaveValue("+34");
  });

  test("defaults Russia-related fields and derives USSR for a pre-1991 birth date", () => {
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

    expect(dropdownTrigger(result.container, "Текущее гражданство")).toHaveTextContent("Russian Federation");
    expect(dropdownTrigger(result.container, "Страна рождения")).toHaveTextContent("Russian Federation");
    expect(screen.queryByRole("button", { name: "Другое" })).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Дата рождения"), {
      target: { value: "20081990" },
    });
    expect(dropdownTrigger(result.container, "Страна рождения")).toHaveTextContent("USSR");

    fireEvent.click(screen.getByRole("button", { name: "Черновик" }));
    expect(onSaveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        fieldUpdates: expect.not.arrayContaining([
          expect.objectContaining({ fieldId: "nationality" }),
          expect.objectContaining({ fieldId: "birth-country" }),
        ]),
      }),
    );

    const withManualCountry = setField(submission, "birth-country", "Spain");
    const manualResult = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        submission={withManualCountry}
      />,
    );
    expect(dropdownTrigger(manualResult.container, "Страна рождения")).toHaveTextContent("Spain");
  });

  test("clears stale conditional answers when saving a draft", () => {
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

    fireEvent.click(screen.getByRole("button", { name: "Черновик" }));

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

  test("keeps addresses compact, expands common abbreviations, and offers city completion", () => {
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
    const address = screen.getByLabelText("Домашний адрес");
    expect(address.tagName).toBe("INPUT");
    expect(address).toHaveAttribute("placeholder", "ул ленина д 5 кв 12");

    fireEvent.change(address, { target: { value: "ул ленина д 5 кв 12" } });
    fireEvent.blur(address);
    expect(address).toHaveValue("улица ленина дом 5 квартира 12");

    const city = screen.getByLabelText("Город проживания");
    fireEvent.focus(city);
    fireEvent.change(city, { target: { value: "спб" } });
    fireEvent.click(screen.getByRole("option", { name: "Санкт-Петербург" }));
    expect(city).toHaveValue("Санкт-Петербург");
    fireEvent.change(city, { target: { value: "с" } });
    expect(screen.getByRole("option", { name: "Самара" })).toBeInTheDocument();
  });

  test("shows actionable file slots and uploads a passport in one selection", async () => {
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
    expect(screen.getByText("Три файла на заявителя. Выберите нужный слот — статус обновится после загрузки.")).toBeInTheDocument();
    const passportInput = screen.getByLabelText("Загрузить Загранпаспорт");
    expect(passportInput).toHaveAttribute("accept", expect.stringContaining("image/webp"));
    const selfieInput = screen.getByLabelText("Загрузить Селфи 1");
    expect(selfieInput).toHaveAttribute("accept", expect.stringContaining("image/heic"));
    expect(selfieInput.getAttribute("accept")).not.toContain("image/gif");

    fireEvent.change(passportInput, {
      target: { files: [new File(["passport"], "passport.webp", { type: "image/webp" })] },
    });
    await waitFor(() =>
      expect(onUploadFile).toHaveBeenCalledWith(
        passportFile.id,
        expect.objectContaining({ name: "passport.webp" }),
      ),
    );
  });

  test("does not offer a file upload when the submission is no longer editable", () => {
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
    expect(screen.getByRole("group", { name: "Проживание не в стране гражданства" })).toBeInTheDocument();

    clickPinnedSection(result.container, "Личные данные");
    fireEvent.click(dropdownTrigger(result.container, "Страна рождения"));
    const countrySearch = screen.getByLabelText("Поиск: Страна рождения");
    fireEvent.change(countrySearch, { target: { value: "испан" } });
    expect(screen.getByRole("button", { name: "Spain" })).toBeInTheDocument();
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

    expect(visibleFieldLabels(result.container)).not.toContain("Родитель/опекун несовершеннолетнего");
    fireEvent.change(screen.getByLabelText("Дата рождения"), {
      target: { value: "20.08.2012" },
    });
    expect(visibleFieldLabels(result.container)).toContain("Родитель/опекун несовершеннолетнего");

    clickPinnedSection(result.container, "Отель / приглашение");
    expect(visibleFieldLabels(result.container)).not.toContain("Контактное лицо компании");
    fireEvent.click(dropdownTrigger(result.container, "Тип принимающей стороны"));
    fireEvent.click(screen.getByRole("button", { name: "Приглашающая компания/организация" }));
    expect(visibleFieldLabels(result.container)).toContain("Контактное лицо компании");
  });

  test("copies only the current section's shared family data from the primary applicant", () => {
    const draft = createDraftSubmission({
      applicantNames: ["IVANOVA MARIA", "IVANOV ANTON"],
      city: "Москва",
      familyCount: 2,
      idScheme: "local",
      submissions: [],
      type: "family",
    });
    const submission = setField(setField(draft, "home-city", "Москва"), "home-address", "Арбат, 1");
    const result = render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={vi.fn()}
        submission={submission}
      />,
    );
    const applicantTabs = result.container.querySelectorAll(".v19-questionnaire-applicant-tab");
    fireEvent.click(applicantTabs[1] as HTMLButtonElement);
    clickPinnedSection(result.container, "Адрес и контакты");

    fireEvent.click(
      screen.getByRole("button", { name: "Скопировать общие данные от IVANOVA MARIA" }),
    );

    expect(screen.getByLabelText("Город проживания")).toHaveValue("Москва");
    expect(visibleFieldLabels(result.container)).toContain("Домашний адрес");
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

  test("clears a non-blocking review highlight after the applicant focuses the field", () => {
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

    render(
      <FigmaQuestionnaireScreen onBack={vi.fn()} onComplete={vi.fn()} submission={submission} />,
    );

    const birthDate = screen.getByLabelText("Дата рождения");
    expect(birthDate).toHaveClass("is-review");
    fireEvent.focus(birthDate);
    expect(birthDate).not.toHaveClass("is-review");
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

    const readySubmission = fillEveryQuestionnaireField(draft);

    render(
      <FigmaQuestionnaireScreen
        onBack={vi.fn()}
        onComplete={onComplete}
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
