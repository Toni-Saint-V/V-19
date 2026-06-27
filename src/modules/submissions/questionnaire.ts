import type {
  Applicant,
  QuestionnaireField,
  QuestionnaireSection,
  QuestionnaireStatus,
  Submission,
} from "./types";

type FieldSeed = {
  id: string;
  label: string;
  placeholder: string;
  control?: QuestionnaireField["control"];
  options?: string[];
  required?: boolean;
  span?: QuestionnaireField["span"];
  completeValue: (applicantName: string) => string;
};

export type QuestionnaireSectionPreview = {
  id: string;
  number: string;
  title: string;
  summary: string;
};

const questionnaireSectionSummaries: Record<string, string> = {
  appointment: "Страна, город подачи и параметры записи",
  personal: "Имя заявителя и базовые личные данные",
  passport: "Паспорт и дата поездки заполняются отдельно",
  contacts: "Адрес и контакты каждого заявителя",
  employment: "Работа или учеба каждого заявителя",
  trip: "Даты, маршрут и принимающая сторона",
};

const questionnaireBlueprint: Array<{
  id: string;
  title: string;
  stepLabel?: string;
  fields: FieldSeed[];
}> = [
  {
    id: "appointment",
    title: "Запись",
    stepLabel: "1 из 6",
    fields: [
      {
        id: "appointment-city",
        label: "Город подачи",
        placeholder: "Выберите город",
        control: "select",
        options: ["Москва", "Санкт-Петербург", "Казань", "Екатеринбург"],
        completeValue: () => "Москва",
      },
      {
        id: "visa-type",
        label: "Тип визы",
        placeholder: "Выберите тип визы",
        control: "select",
        options: ["Шенгенская", "Национальная"],
        completeValue: () => "Шенгенская",
      },
      {
        id: "category",
        label: "Категория",
        placeholder: "Выберите категорию",
        control: "select",
        options: ["Normal (Нормал)", "Premium", "Family"],
        completeValue: () => "Normal (Нормал)",
      },
      {
        id: "desired-date-1",
        label: "Желаемая дата 1",
        placeholder: "ДД.ММ.ГГГГ",
        completeValue: () => "16.06.2026",
      },
      {
        id: "desired-date-2",
        label: "Желаемая дата 2",
        placeholder: "ДД.ММ.ГГГГ",
        required: false,
        completeValue: () => "18.06.2026",
      },
      {
        id: "desired-date-3",
        label: "Желаемая дата 3",
        placeholder: "ДД.ММ.ГГГГ",
        required: false,
        completeValue: () => "22.06.2026",
      },
      {
        id: "appointment-note",
        label: "Примечание",
        placeholder: "Комментарий к записи",
        required: false,
        span: "full",
        completeValue: () => "",
      },
    ],
  },
  {
    id: "personal",
    title: "Личные данные",
    stepLabel: "2 из 6",
    fields: [
      {
        id: "first-name",
        label: "Имя (First Name)",
        placeholder: "IVAN",
        completeValue: (applicantName) => applicantNameParts(applicantName).first,
      },
      {
        id: "surname",
        label: "Фамилия (Surname)",
        placeholder: "IVANOV",
        completeValue: (applicantName) => applicantNameParts(applicantName).surname,
      },
      {
        id: "maiden-name",
        label: "Девичья / прежняя фамилия",
        placeholder: "Если нет - повторите фамилию",
        completeValue: (applicantName) => applicantNameParts(applicantName).surname,
      },
      {
        id: "surname-at-birth",
        label: "Фамилия при рождении",
        placeholder: "Фамилия при рождении",
        completeValue: (applicantName) => applicantNameParts(applicantName).surname,
      },
      {
        id: "birth-date",
        label: "Дата рождения",
        placeholder: "ДД.ММ.ГГГГ",
        completeValue: () => "01.01.1990",
      },
      {
        id: "birth-place",
        label: "Место рождения",
        placeholder: "MOSCOW",
        completeValue: () => "MOSCOW",
      },
      {
        id: "birth-country",
        label: "Страна рождения",
        placeholder: "Выберите страну",
        control: "select",
        options: ["Russian Federation", "USSR", "Spain"],
        completeValue: () => "USSR",
      },
      {
        id: "nationality",
        label: "Гражданство",
        placeholder: "Выберите гражданство",
        control: "select",
        options: ["Russian Federation", "Spain", "Other"],
        completeValue: () => "Russian Federation",
      },
      {
        id: "gender",
        label: "Пол",
        placeholder: "Выберите пол",
        control: "select",
        options: ["Male - Мужской", "Female - Женский"],
        completeValue: () => "Male - Мужской",
      },
      {
        id: "marital-status",
        label: "Семейное положение",
        placeholder: "Выберите статус",
        control: "select",
        options: [
          "Single - Холост/не замужем",
          "Married - Женат/замужем",
          "Divorced - Разведен(а)",
        ],
        completeValue: () => "Single - Холост/не замужем",
      },
    ],
  },
  {
    id: "passport",
    title: "Паспорт",
    stepLabel: "3 из 6",
    fields: [
      {
        id: "passport-type",
        label: "Тип паспорта",
        placeholder: "Выберите тип паспорта",
        control: "select",
        options: [
          "Ordinary Passport",
          "Diplomatic Passport",
          "Service Passport",
          "Official Passport",
          "Travel Document",
        ],
        completeValue: () => "Ordinary Passport",
      },
      {
        id: "passport-no",
        label: "Номер паспорта",
        placeholder: "123456789",
        completeValue: () => "778194570",
      },
      {
        id: "passport-issue-place",
        label: "Место выдачи паспорта",
        placeholder: "FMS 77001",
        completeValue: () => "FMS 77001",
      },
      {
        id: "passport-issue-country",
        label: "Страна выдачи паспорта",
        placeholder: "Russian Federation",
        control: "select",
        options: ["Russian Federation", "Spain", "Other"],
        completeValue: () => "Russian Federation",
      },
      {
        id: "passport-issue-date",
        label: "Дата выдачи паспорта",
        placeholder: "ДД.ММ.ГГГГ",
        completeValue: () => "10.02.2026",
      },
      {
        id: "passport-expiry-date",
        label: "Дата окончания паспорта",
        placeholder: "ДД.ММ.ГГГГ",
        completeValue: () => "10.02.2036",
      },
      {
        id: "travel-date",
        label: "Дата поездки",
        placeholder: "ДД.ММ.ГГГГ",
        completeValue: () => "19.08.2026",
      },
    ],
  },
  {
    id: "contacts",
    title: "Адрес и контакты",
    stepLabel: "4 из 6",
    fields: [
      {
        id: "home-address",
        label: "Домашний адрес",
        placeholder: "AKADEMIKA KOROLEVA STREET 4 1 149",
        completeValue: () => "AKADEMIKA KOROLEVA STREET 4 1 149",
      },
      {
        id: "home-country",
        label: "Страна проживания",
        placeholder: "Выберите страну",
        control: "select",
        options: ["Russian Federation", "Spain", "Other"],
        completeValue: () => "Russian Federation",
      },
      {
        id: "home-city",
        label: "Город проживания",
        placeholder: "MOSCOW",
        completeValue: () => "MOSCOW",
      },
      {
        id: "postal-code",
        label: "Почтовый индекс",
        placeholder: "129515",
        completeValue: () => "129515",
      },
      {
        id: "contact-number",
        label: "Контактный телефон",
        placeholder: "79151590999",
        completeValue: () => "79151590999",
      },
      {
        id: "email",
        label: "Email",
        placeholder: "name@example.com",
        completeValue: () => "applicant@example.com",
      },
    ],
  },
  {
    id: "employment",
    title: "Работа / учёба",
    stepLabel: "5 из 6",
    fields: [
      {
        id: "employer-name",
        label: "Работодатель",
        placeholder: "JSC VTB LEASING",
        completeValue: () => "JSC VTB LEASING",
      },
      {
        id: "occupation",
        label: "Профессия",
        placeholder: "Выберите профессию",
        control: "select",
        options: [
          "MANAGER",
          "ENGINEER",
          "STUDENT",
          "TEACHER",
          "SELF EMPLOYED",
          "OTHER",
        ],
        completeValue: () => "OTHER",
      },
      {
        id: "occupation-specify",
        label: "Уточнение профессии",
        placeholder: "LEAD SPECIALIST",
        completeValue: () => "LEAD SPECIALIST",
      },
      {
        id: "employer-contact",
        label: "Телефон работодателя",
        placeholder: "74957376553",
        completeValue: () => "74957376553",
      },
      {
        id: "employer-address",
        label: "Адрес работодателя",
        placeholder: "VORONTSOVSKAYA STREET 43 1, MOSCOW",
        span: "full",
        completeValue: () => "VORONTSOVSKAYA STREET 43 1, 109147, MOSCOW",
      },
    ],
  },
  {
    id: "trip",
    title: "Поездка",
    stepLabel: "6 из 6",
    fields: [
      {
        id: "purpose",
        label: "Цель поездки",
        placeholder: "Выберите цель",
        control: "select",
        options: ["TOURISM", "BUSINESS", "VISIT FAMILY OR FRIENDS", "OTHER"],
        completeValue: () => "TOURISM",
      },
      {
        id: "stay-duration",
        label: "Длительность, дней",
        placeholder: "9",
        completeValue: () => "9",
      },
      {
        id: "entry-count",
        label: "Количество въездов",
        placeholder: "Выберите количество въездов",
        control: "select",
        options: [
          "Single Entry - Однократный",
          "Two Entry - Двукратный",
          "Multiple Entry - Многократный",
        ],
        completeValue: () => "Multiple Entry - Многократный",
      },
      {
        id: "arrival-date",
        label: "Дата въезда",
        placeholder: "ДД.ММ.ГГГГ",
        completeValue: () => "19.08.2026",
      },
      {
        id: "departure-date",
        label: "Дата выезда",
        placeholder: "ДД.ММ.ГГГГ",
        completeValue: () => "27.08.2026",
      },
      {
        id: "inviting-party-type",
        label: "Тип принимающей стороны",
        placeholder: "Выберите тип",
        control: "select",
        options: ["Гостиница/временное жильё", "Частное лицо", "Компания"],
        completeValue: () => "Гостиница/временное жильё",
      },
      {
        id: "hotel-name",
        label: "Название отеля",
        placeholder: "HOTEL ILUNION BARCELONA",
        completeValue: () => "HOTEL ILUNION BARCELONA",
      },
      {
        id: "hotel-country",
        label: "Страна отеля",
        placeholder: "Spain",
        control: "select",
        options: ["Spain", "France", "Italy", "Other"],
        completeValue: () => "Spain",
      },
      {
        id: "hotel-city",
        label: "Город отеля",
        placeholder: "BARCELONA",
        completeValue: () => "BARCELONA",
      },
      {
        id: "hotel-postal-code",
        label: "Почтовый индекс отеля",
        placeholder: "08005",
        completeValue: () => "08005",
      },
      {
        id: "hotel-address",
        label: "Адрес отеля",
        placeholder: "CALLE RAMON TUR 196-198",
        completeValue: () => "CALLE RAMON TUR 196-198",
      },
      {
        id: "hotel-email",
        label: "Email отеля",
        placeholder: "contactcenter@ilunionhotels.com",
        completeValue: () => "contactcenter@ilunionhotels.com",
      },
      {
        id: "hotel-contact",
        label: "Телефон отеля",
        placeholder: "34932438800",
        completeValue: () => "34932438800",
      },
      {
        id: "cost-covered-by",
        label: "Кто оплачивает поездку",
        placeholder: "Выберите источник оплаты",
        control: "select",
        options: ["By the applicant - Самим заявителем", "By a Sponsor - Спонсором"],
        completeValue: () => "By the applicant - Самим заявителем",
      },
      {
        id: "means-of-support",
        label: "Средства обеспечения",
        placeholder: "Выберите средство",
        control: "select",
        options: [
          "Cash - Наличные",
          "Credit card - Кредитная карта",
          "Prepaid accommodation - Оплаченное жильё",
          "Other - Другое",
        ],
        completeValue: () => "Cash - Наличные",
      },
      {
        id: "route",
        label: "Маршрут поездки",
        placeholder: "Москва, Барселона, Москва",
        span: "full",
        completeValue: () => "Москва, Барселона, Москва",
      },
    ],
  },
];

export type QuestionnaireFieldUpdate = {
  applicantId: string;
  sectionId: string;
  fieldId: string;
  value: string;
};

export function questionnaireSectionPreviews(): QuestionnaireSectionPreview[] {
  return questionnaireBlueprint.map((section) => ({
    id: section.id,
    number: section.stepLabel ?? "",
    summary:
      questionnaireSectionSummaries[section.id] ??
      `${section.fields.length} полей после сохранения черновика`,
    title: section.title,
  }));
}

export function createQuestionnaireSections(
  applicantId: string,
  applicantName: string,
  status: QuestionnaireStatus,
  missing?: string,
): QuestionnaireSection[] {
  return questionnaireBlueprint.map((section) =>
    normalizeSection({
      id: `${applicantId}-${section.id}`,
      title: section.title,
      stepLabel: section.stepLabel,
      status,
      missing,
      fields: section.fields.map((field, index) =>
        seedField(field, applicantName, status, section.id, index, missing),
      ),
    }),
  );
}

export function normalizeSubmissionQuestionnaire(submission: Submission): Submission {
  return recalculateQuestionnaire({
    ...submission,
    applicants: submission.applicants.map((applicant) => ({
      ...applicant,
      sections: normalizeApplicantSections(applicant),
    })),
  });
}

export function updateQuestionnaireField(
  submission: Submission,
  update: QuestionnaireFieldUpdate,
): Submission {
  const next = {
    ...submission,
    applicants: submission.applicants.map((applicant) => {
      if (applicant.id !== update.applicantId) return applicant;

      return {
        ...applicant,
        sections: normalizeApplicantSections({
          ...applicant,
          sections: applicant.sections.map((section) => {
            if (section.id !== update.sectionId) return section;

            return {
              ...section,
              fields: normalizeFields(section).map((field) =>
                field.id === update.fieldId
                  ? {
                      ...field,
                      value: update.value,
                      error:
                        update.value.trim() &&
                        !hasOpenQuestionnaireFieldIssue(
                          submission,
                          update.applicantId,
                          section.title,
                          field.label,
                        )
                          ? undefined
                          : field.error,
                    }
                  : field,
              ),
            };
          }),
        }),
      };
    }),
    updatedAt: "сейчас",
  };

  return recalculateQuestionnaire(next);
}

export function completeQuestionnaireSections(submission: Submission): Submission {
  return recalculateQuestionnaire({
    ...submission,
    applicants: submission.applicants.map((applicant) => ({
      ...applicant,
      sections: createQuestionnaireSections(
        applicant.id,
        applicant.fullName,
        "complete",
      ),
    })),
    updatedAt: "сейчас",
  });
}

export function flagQuestionnaireField(
  submission: Submission,
  applicantId: string,
  fieldLabel: string,
  reason: string,
): Submission {
  return recalculateQuestionnaire({
    ...submission,
    applicants: submission.applicants.map((applicant) => {
      if (applicant.id !== applicantId) return applicant;

      return {
        ...applicant,
        sections: normalizeApplicantSections({
          ...applicant,
          sections: applicant.sections.map((section) => ({
            ...section,
            fields: normalizeFields(section).map((field) =>
              field.label === fieldLabel ? { ...field, error: reason } : field,
            ),
          })),
        }),
      };
    }),
  });
}

export function clearOpenQuestionnaireIssueErrors(submission: Submission): Submission {
  return recalculateQuestionnaire({
    ...submission,
    applicants: submission.applicants.map((applicant) => ({
      ...applicant,
      sections: normalizeApplicantSections({
        ...applicant,
        sections: applicant.sections.map((section) => ({
          ...section,
          fields: normalizeFields(section).map((field) =>
            hasOpenQuestionnaireFieldIssue(
              submission,
              applicant.id,
              section.title,
              field.label,
            )
              ? { ...field, error: undefined }
              : field,
          ),
        })),
      }),
    })),
  });
}

export function questionnaireProgressForApplicant(applicant: Applicant) {
  const fields = applicant.sections.flatMap((section) => normalizeFields(section));
  if (!fields.length) return 0;
  const ready = fields.filter(isFieldReady).length;
  return Math.round((ready / fields.length) * 100);
}

export function questionnaireProblemCount(submission: Submission) {
  const keys = new Set<string>();

  for (const applicant of submission.applicants) {
    for (const section of applicant.sections) {
      for (const field of normalizeFields(section)) {
        if (field.required && !field.value.trim()) {
          keys.add(`${applicant.id}:${section.id}:${field.id}:missing`);
        }
        if (field.error) {
          keys.add(`${applicant.id}:${section.id}:${field.id}:error`);
        }
      }
    }
  }

  for (const issue of submission.issues) {
    if (issue.status !== "open") continue;
    if (
      issue.target.section === "Анкета" ||
      issue.target.section === "Данные" ||
      issue.type === "field" ||
      issue.type === "section"
    ) {
      keys.add(
        `${issue.target.applicantId}:${issue.target.section ?? ""}:${issue.target.field ?? ""}:issue`,
      );
    }
  }

  return keys.size;
}

function hasOpenQuestionnaireFieldIssue(
  submission: Submission,
  applicantId: string,
  sectionTitle: string,
  fieldLabel: string,
) {
  return submission.issues.some(
    (issue) =>
      issue.status === "open" &&
      issue.target.applicantId === applicantId &&
      issue.target.field === fieldLabel &&
      (issue.target.section === sectionTitle ||
        issue.target.section === "Анкета" ||
        issue.target.section === "Данные"),
  );
}

function normalizeApplicantSections(applicant: Applicant): QuestionnaireSection[] {
  return questionnaireBlueprint.map((blueprint) =>
    normalizeBlueprintSection(applicant, blueprint),
  );
}

function normalizeBlueprintSection(
  applicant: Applicant,
  blueprint: (typeof questionnaireBlueprint)[number],
): QuestionnaireSection {
  const existingSection = findExistingSection(applicant, blueprint);
  const existingStatus = existingSection?.status ?? applicant.questionnaireStatus;
  const existingMissing = existingSection?.missing;

  return normalizeSection({
    id: existingSection?.id ?? `${applicant.id}-${blueprint.id}`,
    title: blueprint.title,
    stepLabel: blueprint.stepLabel,
    status: existingStatus,
    missing: existingMissing,
    fields: blueprint.fields.map((field, index) =>
      mergeSeedField(
        field,
        existingSection?.fields ?? [],
        applicant.fullName,
        existingStatus,
        blueprint.id,
        index,
        existingMissing,
      ),
    ),
  });
}

function findExistingSection(
  applicant: Applicant,
  blueprint: (typeof questionnaireBlueprint)[number],
) {
  return applicant.sections.find((section) => {
    if (section.id === `${applicant.id}-${blueprint.id}`) return true;
    if (section.id.endsWith(`-${blueprint.id}`)) return true;
    if (section.title === blueprint.title) return true;

    const blueprintLabels = new Set(blueprint.fields.map((field) => field.label));
    return section.fields.some((field) => blueprintLabels.has(field.label));
  });
}

function mergeSeedField(
  field: FieldSeed,
  existingFields: QuestionnaireField[],
  applicantName: string,
  status: QuestionnaireStatus,
  sectionId: string,
  index: number,
  missing?: string,
): QuestionnaireField {
  const seeded = seedField(field, applicantName, status, sectionId, index, missing);
  const existing = existingFields.find(
    (item) => item.id === field.id || item.label === field.label,
  );

  if (!existing) return seeded;

  return {
    ...seeded,
    value: existing.value,
    error: existing.error,
    reviewConfirmedAtIso: existing.reviewConfirmedAtIso,
    reviewConfirmedBy: existing.reviewConfirmedBy,
    reviewOriginSource: existing.reviewOriginSource,
    reviewState: existing.reviewState,
    reviewSource: existing.reviewSource,
  };
}

function normalizeFields(
  section: QuestionnaireSection,
  applicantName = "Заявитель",
  sectionTitle = section.title,
): QuestionnaireField[] {
  if (section.fields?.length) return section.fields;

  const blueprint = questionnaireBlueprint.find((item) => item.title === sectionTitle);
  if (!blueprint) return [];

  return blueprint.fields.map((field, index) =>
    seedField(
      field,
      applicantName,
      section.status,
      blueprint.id,
      index,
      section.missing,
    ),
  );
}

function seedField(
  field: FieldSeed,
  applicantName: string,
  status: QuestionnaireStatus,
  sectionId: string,
  index: number,
  missing?: string,
): QuestionnaireField {
  const partialLeavesWholeTrip =
    status === "partial" && Boolean(missing?.includes("поезд"));
  const shouldFill =
    status === "complete" ||
    status === "needs_fix" ||
    (status === "partial" &&
      (partialLeavesWholeTrip
        ? sectionId !== "trip"
        : !(sectionId === "trip" && index === 1)));

  const shouldFlag =
    status === "needs_fix" && sectionId === "trip" && field.id === "route";

  return {
    id: field.id,
    label: field.label,
    value: shouldFill ? field.completeValue(applicantName) : "",
    required: field.required ?? true,
    control: field.control,
    options: field.options,
    span: field.span,
    placeholder: field.placeholder,
    error: shouldFlag ? (missing ?? "Нужно уточнить значение") : undefined,
  };
}

function normalizeSection(section: QuestionnaireSection): QuestionnaireSection {
  const fields = normalizeFields(section);
  const status = sectionStatus(fields);
  const firstMissing = fields.find((field) => field.required && !field.value.trim());
  const firstError = fields.find((field) => field.error);

  return {
    ...section,
    fields,
    status,
    missing:
      firstError?.error ??
      (firstMissing ? `Нужно заполнить: ${firstMissing.label}` : undefined),
  };
}

function recalculateQuestionnaire(submission: Submission): Submission {
  const applicants = submission.applicants.map((applicant) => {
    const sections = normalizeApplicantSections(applicant);
    return {
      ...applicant,
      sections,
      questionnaireStatus: applicantStatus(sections),
    };
  });

  const fields = applicants.flatMap((applicant) =>
    applicant.sections.flatMap((section) => section.fields),
  );
  const questionnaire = fields.length
    ? Math.round((fields.filter(isFieldReady).length / fields.length) * 100)
    : 0;

  return {
    ...submission,
    applicants,
    completeness: {
      ...submission.completeness,
      questionnaire,
      total: Math.round((questionnaire + submission.completeness.files) / 2),
    },
  };
}

function sectionStatus(fields: QuestionnaireField[]): QuestionnaireStatus {
  if (!fields.length) return "empty";
  if (fields.some((field) => field.error)) return "needs_fix";
  const ready = fields.filter(isFieldReady).length;
  if (ready === fields.length) return "complete";
  if (ready === 0) return "empty";
  return "partial";
}

function applicantStatus(sections: QuestionnaireSection[]): QuestionnaireStatus {
  if (!sections.length) return "empty";
  if (sections.some((section) => section.status === "needs_fix")) return "needs_fix";
  if (sections.every((section) => section.status === "complete")) return "complete";
  if (sections.every((section) => section.status === "empty")) return "empty";
  return "partial";
}

function isFieldReady(field: QuestionnaireField) {
  return !field.required || Boolean(field.value.trim() && !field.error);
}

function applicantNameParts(applicantName: string) {
  const parts = applicantName.trim().split(/\s+/).filter(Boolean);
  const first = transliterate(parts[0] ?? applicantName).toUpperCase();
  const surname = transliterate(parts.at(-1) ?? applicantName).toUpperCase();

  return { first, surname };
}

function transliterate(input: string) {
  const map: Record<string, string> = {
    а: "a",
    б: "b",
    в: "v",
    г: "g",
    д: "d",
    е: "e",
    ё: "e",
    ж: "zh",
    з: "z",
    и: "i",
    й: "i",
    к: "k",
    л: "l",
    м: "m",
    н: "n",
    о: "o",
    п: "p",
    р: "r",
    с: "s",
    т: "t",
    у: "u",
    ф: "f",
    х: "kh",
    ц: "ts",
    ч: "ch",
    ш: "sh",
    щ: "shch",
    ы: "y",
    э: "e",
    ю: "yu",
    я: "ya",
    ь: "",
    ъ: "",
  };

  return input
    .split("")
    .map((char) => {
      const lower = char.toLowerCase();
      const value = map[lower];
      if (value === undefined) return char;
      return char === lower ? value : value.toUpperCase();
    })
    .join("");
}
