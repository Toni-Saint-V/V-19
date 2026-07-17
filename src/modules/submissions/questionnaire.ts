import type {
  Applicant,
  QuestionnaireField,
  QuestionnaireReviewSource,
  QuestionnaireReviewState,
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
  value?: string;
};

export type QuestionnaireSectionPreview = {
  id: string;
  number: string;
  title: string;
  summary: string;
};

const questionnaireSectionSummaries: Record<string, string> = {
  appointment: "Город подачи и желаемый интервал записи",
  contacts: "Структурированный домашний адрес и контакты",
  employment: "Должность и данные работодателя или учебного заведения",
  hotel: "Отель или приглашающая сторона",
  passport: "Паспортные данные из скана паспорта",
  personal: "Личные данные заявителя",
  trip: "Цель, маршрут, даты поездки и биометрия",
};

export const BLS_CITY_OPTIONS = [
  "Москва",
  "Санкт-Петербург",
  "Казань",
  "Екатеринбург",
  "Новосибирск",
  "Нижний Новгород",
  "Самара",
  "Ростов-на-Дону",
];

export const POPULAR_RUSSIAN_CITY_OPTIONS = [
  "Москва",
  "Санкт-Петербург",
  "Нижний Новгород",
  "Ростов-на-Дону",
  "Самара",
  "Новосибирск",
  "Екатеринбург",
  "Казань",
  "Краснодар",
  "Уфа",
] as const;

const blsCountryOptions = [
  "Russian Federation",
  "USSR",
  "Belarus",
  "Kazakhstan",
  "Armenia",
  "Azerbaijan",
  "Georgia",
  "Kyrgyzstan",
  "Tajikistan",
  "Turkmenistan",
  "Uzbekistan",
  "Ukraine",
  "Moldova",
  "Spain",
  "France",
  "Germany",
  "Italy",
  "Portugal",
  "Netherlands",
  "Belgium",
  "Austria",
  "Switzerland",
  "Greece",
  "Czech Republic",
  "Poland",
  "Hungary",
  "Sweden",
  "Norway",
  "Finland",
  "Denmark",
  "United Kingdom",
  "United States",
  "Turkey",
  "China",
  "India",
  "Israel",
  "United Arab Emirates",
  "Other",
];

const yesNoOptions = ["Нет", "Да"];

const questionnaireBlueprint: Array<{
  id: string;
  title: string;
  stepLabel?: string;
  fields: FieldSeed[];
}> = [
  {
    id: "contacts",
    title: "Адрес и контакты",
    stepLabel: "1 из 7",
    fields: [
      { id: "home-country", label: "Страна проживания", placeholder: "Выберите страну", control: "select", options: blsCountryOptions, value: "Russian Federation" },
      { id: "home-city", label: "Город проживания", placeholder: "Начните вводить город" },
      { id: "home-street", label: "Улица / проспект / переулок", placeholder: "Например, ул Ленина" },
      { id: "home-house", label: "Дом", placeholder: "Номер дома" },
      { id: "home-building", label: "Корпус / строение", placeholder: "Если есть", required: false },
      { id: "home-unit", label: "Квартира / офис / помещение", placeholder: "Например, кв 12", required: false },
      { id: "postal-code", label: "Почтовый индекс", placeholder: "Введите почтовый индекс" },
      { id: "email", label: "Email", placeholder: "name@example.com" },
      { id: "contact-number", label: "Телефон", placeholder: "Введите телефон" },
      { id: "lives-outside-citizenship", label: "Есть вид на жительство в другой стране", placeholder: "Выберите ответ", control: "select", options: yesNoOptions, value: "Нет" },
      { id: "residence-permit-type", label: "Вид на жительство / документ", placeholder: "Укажите тип документа", required: false },
      { id: "residence-permit-number", label: "Номер документа", placeholder: "Введите номер", required: false },
      { id: "residence-permit-valid-until", label: "Действителен до", placeholder: "ДД.ММ.ГГГГ", required: false },
      { id: "home-address", label: "Домашний адрес", placeholder: "Собирается автоматически", required: false },
    ],
  },
  {
    id: "trip",
    title: "Поездка",
    stepLabel: "2 из 7",
    fields: [
      { id: "purpose", label: "Цель поездки", placeholder: "Выберите цель", control: "select", options: ["TOURISM", "BUSINESS", "VISITING FAMILY OR FRIENDS", "STUDY", "MEDICAL TREATMENT", "OFFICIAL VISIT", "CULTURAL", "SPORTS", "TRANSIT", "OTHER"], value: "TOURISM" },
      { id: "stay-purpose-details", label: "Дополнительные сведения о цели", placeholder: "Введите дополнительные сведения", required: false, span: "full" },
      { id: "main-destination", label: "Основная страна назначения", placeholder: "Выберите или введите страну", control: "select", options: blsCountryOptions, value: "Spain" },
      { id: "first-entry-country", label: "Страна первого въезда", placeholder: "Выберите или введите страну", control: "select", options: blsCountryOptions, value: "Spain" },
      { id: "entry-count", label: "Количество въездов", placeholder: "Выберите количество въездов", control: "select", options: ["Однократная", "Двукратная", "Многократная"] },
      { id: "arrival-date", label: "Дата въезда", placeholder: "ДД.ММ.ГГГГ" },
      { id: "departure-date", label: "Дата выезда", placeholder: "ДД.ММ.ГГГГ" },
      { id: "stay-duration", label: "Длительность пребывания", placeholder: "Рассчитывается автоматически" },
      { id: "previous-biometrics", label: "Отпечатки ранее сдавались", placeholder: "Выберите ответ", control: "select", options: yesNoOptions },
      { id: "previous-biometrics-date", label: "Дата сдачи отпечатков", placeholder: "ДД.ММ.ГГГГ", required: false },
      { id: "previous-visa-number", label: "Номер визы", placeholder: "Если известно", required: false },
      { id: "final-entry-permit", label: "Разрешение на въезд в конечную страну", placeholder: "Если применимо", required: false },
      { id: "final-entry-permit-issued-by", label: "Кем выдано", placeholder: "Если применимо", required: false },
      { id: "final-entry-permit-valid-from", label: "Действительно с", placeholder: "ДД.ММ.ГГГГ", required: false },
      { id: "final-entry-permit-valid-to", label: "Действительно до", placeholder: "ДД.ММ.ГГГГ", required: false },
      { id: "cost-covered-by", label: "Кто оплачивает поездку", placeholder: "Служебное значение", required: false, value: "Сам заявитель" },
      { id: "means-of-support", label: "Средства заявителя", placeholder: "Служебное значение", required: false, value: "Наличные" },
    ],
  },
  {
    id: "hotel",
    title: "Отель / приглашающая сторона",
    stepLabel: "3 из 7",
    fields: [
      { id: "inviting-party-type", label: "Тип принимающей стороны", placeholder: "Выберите тип", control: "select", options: ["Приглашающая компания/организация", "Гостиница/временное жилье", "Приглашающее лицо"] },
      { id: "hotel-name", label: "ФИО приглашающего лица или название отеля/компании", placeholder: "Введите ФИО или название отеля/компании" },
      { id: "hotel-address", label: "Адрес", placeholder: "Введите адрес", span: "full" },
      { id: "hotel-country", label: "Страна", placeholder: "Выберите страну", control: "select", options: blsCountryOptions, value: "Spain" },
      { id: "hotel-city", label: "Город", placeholder: "Введите город" },
      { id: "hotel-postal-code", label: "Почтовый индекс", placeholder: "Введите почтовый индекс" },
      { id: "hotel-email", label: "Email", placeholder: "name@example.com", required: false },
      { id: "hotel-contact", label: "Телефон", placeholder: "Введите телефон", required: false },
      { id: "company-org-details", label: "Название и адрес компании/организации", placeholder: "Для business/invitation", required: false, span: "full" },
      { id: "company-contact-person", label: "Контактное лицо компании", placeholder: "Для business/invitation", required: false, span: "full" },
      { id: "company-phone", label: "Телефон компании", placeholder: "Для business/invitation", required: false },
    ],
  },
  {
    id: "appointment",
    title: "Запись",
    stepLabel: "4 из 7",
    fields: [
      { id: "appointment-city", label: "Город подачи", placeholder: "Выберите город", control: "select", options: BLS_CITY_OPTIONS },
      { id: "desired-date-1", label: "Желаемый интервал — с", placeholder: "ДД.ММ.ГГГГ" },
      { id: "desired-date-2", label: "Желаемый интервал — по", placeholder: "ДД.ММ.ГГГГ" },
      { id: "visa-type", label: "Тип визы", placeholder: "Служебное значение", required: false, value: "Шенгенская" },
      { id: "category", label: "Категория обслуживания", placeholder: "Служебное значение", required: false, value: "Normal" },
    ],
  },
  {
    id: "personal",
    title: "Личные данные заявителя",
    stepLabel: "5 из 7",
    fields: [
      { id: "surname", label: "Фамилия", placeholder: "Введите фамилию" },
      { id: "previous-surname", label: "Фамилия при рождении / предыдущая", placeholder: "Если отличается", required: false },
      { id: "first-name", label: "Имя", placeholder: "Введите имя" },
      { id: "birth-date", label: "Дата рождения", placeholder: "ДД.ММ.ГГГГ" },
      { id: "birth-place", label: "Место рождения", placeholder: "Введите место рождения" },
      { id: "birth-country", label: "Страна рождения", placeholder: "Выберите страну", control: "select", options: blsCountryOptions, value: "Russian Federation" },
      { id: "gender", label: "Пол", placeholder: "Выберите пол", control: "select", options: ["Мужской", "Женский"] },
      { id: "marital-status", label: "Семейное положение", placeholder: "Выберите статус", control: "select", options: ["Холост/не замужем", "Женат/замужем", "Зарегистрированное партнерство", "Раздельно", "Разведен(а)", "Вдовец/вдова", "Иное"] },
      { id: "guardian-info", label: "Родитель/опекун несовершеннолетнего", placeholder: "Только для несовершеннолетних", required: false, span: "full" },
      { id: "nationality", label: "Текущее гражданство", placeholder: "Служебное значение", required: false, value: "Russian Federation" },
      { id: "birth-citizenship", label: "Гражданство при рождении", placeholder: "Служебное значение", required: false, value: "Russian Federation" },
    ],
  },
  {
    id: "passport",
    title: "Паспорт",
    stepLabel: "6 из 7",
    fields: [
      { id: "passport-type", label: "Тип документа", placeholder: "Выберите тип документа", control: "select", options: ["Ordinary Passport", "Diplomatic Passport", "Service Passport", "Official Passport", "Special Passport", "Travel Document", "Other"] },
      { id: "passport-no", label: "Номер паспорта", placeholder: "Введите номер паспорта" },
      { id: "passport-issue-date", label: "Дата выдачи", placeholder: "ДД.ММ.ГГГГ" },
      { id: "passport-expiry-date", label: "Действителен до", placeholder: "ДД.ММ.ГГГГ" },
      { id: "passport-issue-country", label: "Страна выдачи", placeholder: "Выберите страну", control: "select", options: blsCountryOptions, value: "Russian Federation" },
      { id: "passport-issue-place", label: "Место выдачи", placeholder: "Введите место выдачи" },
    ],
  },
  {
    id: "employment",
    title: "Работа / учеба",
    stepLabel: "7 из 7",
    fields: [
      { id: "occupation", label: "Должность", placeholder: "Введите должность" },
      { id: "employer-name", label: "Работодатель / учебное заведение", placeholder: "Введите работодателя или учебное заведение", span: "full" },
      { id: "employer-contact", label: "Телефон работодателя / учебного заведения", placeholder: "Введите телефон", required: false },
      { id: "employer-address", label: "Адрес работодателя / учебного заведения", placeholder: "Введите адрес", required: false, span: "full" },
    ],
  },
];


type QuestionnaireValidationField = Pick<QuestionnaireField, "id" | "label" | "required"> &
  Partial<Pick<QuestionnaireField, "value">>;

function parseQuestionnaireDateValue(value: string) {
  const trimmed = value.trim();
  const dotted = /^(\d{2})[.-](\d{2})[.-](\d{4})$/.exec(trimmed);
  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!dotted && !iso) return null;

  const year = Number(iso ? iso[1] : dotted?.[3]);
  const month = Number(iso ? iso[2] : dotted?.[2]);
  const day = Number(iso ? iso[3] : dotted?.[1]);
  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function questionnaireFieldLooksLikeDate(
  field: Pick<QuestionnaireField, "id" | "label">,
) {
  const label = field.label.toLocaleLowerCase("ru-RU");
  return (
    field.id.includes("date") ||
    field.id.includes("valid") ||
    field.id.includes("expiry") ||
    field.id.includes("expires") ||
    label.includes("дата") ||
    label.includes("действител")
  );
}

export function validateQuestionnaireFieldValue(
  field: QuestionnaireValidationField,
  value = field.value ?? "",
) {
  const trimmed = value.trim();
  const normalizedLabel = field.label.toLocaleLowerCase("ru-RU");

  if (field.required && !trimmed) return "Обязательное поле";
  if (!trimmed) return undefined;

  if (field.id === "email" || normalizedLabel.includes("email")) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)
      ? undefined
      : "Проверьте формат email";
  }

  if (
    field.id.includes("phone") ||
    field.id === "contact-number" ||
    normalizedLabel.includes("телефон")
  ) {
    const digits = trimmed.replace(/\D/g, "");
    return digits.length >= 7 && digits.length <= 18
      ? undefined
      : "Проверьте номер телефона";
  }

  if (questionnaireFieldLooksLikeDate(field)) {
    return parseQuestionnaireDateValue(trimmed)
      ? undefined
      : "Дата должна быть в формате ДД.ММ.ГГГГ";
  }

  if (field.id === "passport-no") {
    const compact = trimmed.replace(/\s/g, "");
    return /^[A-ZА-Я0-9-]{5,20}$/i.test(compact)
      ? undefined
      : "Проверьте номер паспорта";
  }

  return undefined;
}

export type QuestionnaireFieldUpdate = {
  applicantId: string;
  sectionId: string;
  fieldId: string;
  value: string;
  error?: string;
  reviewOriginSource?: QuestionnaireReviewSource;
  reviewSource?: QuestionnaireReviewSource;
  reviewState?: QuestionnaireReviewState;
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
    applicants: submission.applicants.map((applicant) => {
      const sections = normalizeApplicantSections(applicant);
      const birthCountry = sections
        .flatMap((section) => section.fields)
        .find((field) => field.id === "birth-country")?.value.trim();

      return {
        ...applicant,
        sections: sections.map((section) => ({
          ...section,
          fields: section.fields.map((field) => {
            if (field.id === "appointment-city" && !field.value.trim()) {
              return { ...field, value: submission.city };
            }
            if (field.id === "visa-type") return { ...field, value: "Шенгенская" };
            if (field.id === "category") return { ...field, value: "Normal" };
            if (field.id === "nationality") {
              return { ...field, value: "Russian Federation" };
            }
            if (field.id === "birth-citizenship") {
              return {
                ...field,
                value: birthCountry?.toUpperCase() === "USSR" ? "USSR" : "Russian Federation",
              };
            }
            if (field.id === "cost-covered-by") {
              return { ...field, value: "Сам заявитель" };
            }
            if (field.id === "means-of-support") return { ...field, value: "Наличные" };
            return field;
          }),
        })),
      };
    }),
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
            if (!sectionMatchesUpdate(section.id, update.sectionId)) return section;

            return {
              ...section,
              fields: normalizeFields(section).map((field) =>
                field.id === update.fieldId
                  ? {
                      ...field,
                      adminReviewApprovedAtIso:
                        update.value === field.value
                          ? field.adminReviewApprovedAtIso
                          : undefined,
                      adminReviewApprovedBy:
                        update.value === field.value
                          ? field.adminReviewApprovedBy
                          : undefined,
                      value: update.value,
                      reviewOriginSource:
                        update.reviewOriginSource ?? field.reviewOriginSource,
                      reviewSource: update.reviewSource ?? field.reviewSource,
                      reviewState: update.reviewState ?? field.reviewState,
                      error:
                        update.error ??
                        validateQuestionnaireFieldValue(field, update.value) ??
                        (update.value.trim() &&
                        !hasOpenQuestionnaireFieldIssue(
                          submission,
                          update.applicantId,
                          section.title,
                          field,
                        )
                          ? undefined
                          : field.error),
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

function sectionMatchesUpdate(sectionId: string, updateSectionId: string) {
  return sectionId === updateSectionId || sectionId.endsWith(`-${updateSectionId}`);
}

export function completeQuestionnaireSections(submission: Submission): Submission {
  return recalculateQuestionnaire({
    ...submission,
    applicants: submission.applicants.map((applicant) => ({
      ...applicant,
      sections: normalizeApplicantSections(applicant).map((section) =>
        normalizeSection({
          ...section,
          status: "complete",
          missing: undefined,
        }),
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
              questionnaireFieldMatchesTarget(field, fieldLabel)
                ? {
                    ...field,
                    adminReviewApprovedAtIso: undefined,
                    adminReviewApprovedBy: undefined,
                    error: reason,
                  }
                : field,
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
              field,
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
        if (validateQuestionnaireFieldValue(field)) {
          keys.add(`${applicant.id}:${section.id}:${field.id}:validation`);
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
  field: QuestionnaireField,
) {
  return submission.issues.some(
    (issue) =>
      issue.status === "open" &&
      issue.target.applicantId === applicantId &&
      questionnaireFieldMatchesTarget(field, issue.target.field) &&
      (issue.target.section === sectionTitle ||
        issue.target.section === "Анкета" ||
        issue.target.section === "Данные"),
  );
}

const questionnaireFieldLabelAliases: Record<string, string[]> = {
  "birth-date": ["Дата рождения"],
  "birth-place": ["Место рождения"],
  "company-contact-person": ["Контакт компании"],
  "company-org-details": ["Компания и адрес"],
  "cost-covered-by": ["Кто оплачивает"],
  "employer-address": ["Адрес работодателя"],
  "employer-contact": ["Телефон работодателя"],
  "employer-name": ["Работа / учеба"],
  "eu-relative-details": ["Родственник ЕС / ЕЭЗ"],
  "final-entry-permit": ["Разрешение на въезд"],
  "form-filler-contact": ["Адрес или email"],
  "form-filler-name": ["Кто заполнил"],
  "guardian-info": ["Родитель / опекун"],
  "hotel-name": ["Отель / приглашающий"],
  "inviting-party-type": ["Принимающая сторона"],
  "lives-outside-citizenship": ["Живет не в стране гражданства"],
  "main-destination": ["Страна назначения"],
  "passport-expiry-date": ["Дата окончания паспорта", "Действителен до"],
  "passport-issue-date": ["Дата выдачи паспорта", "Дата выдачи"],
  "passport-issue-country": ["Страна выдачи паспорта"],
  "passport-no": ["Номер паспорта"],
  "passport-type": ["Тип паспорта", "Тип документа", "Тип проездного документа"],
  "first-entry-country": ["Маршрут поездки"],
  "previous-biometrics": ["Биометрия уже сдавалась"],
  "previous-biometrics-date": ["Дата биометрии"],
  "previous-surname": ["Прежняя фамилия"],
  "residence-permit-type": ["ВНЖ / документ"],
  "sponsor-in-host-fields": ["Спонсор из 30/31"],
  "stay-purpose-details": ["Уточнение цели"],
};

export function questionnaireFieldMatchesTarget(
  field: Pick<QuestionnaireField, "id" | "label">,
  target?: string,
) {
  const normalizedTarget = normalizeQuestionnaireFieldLabel(target);
  if (!normalizedTarget) return false;

  const candidates = [
    field.id,
    field.label,
    ...(questionnaireFieldLabelAliases[field.id] ?? []),
  ];

  return candidates.some(
    (candidate) => normalizeQuestionnaireFieldLabel(candidate) === normalizedTarget,
  );
}

function normalizeQuestionnaireFieldLabel(value?: string) {
  return (value ?? "")
    .trim()
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е");
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
  const exactMatch = applicant.sections.find((section) => {
    if (section.id === `${applicant.id}-${blueprint.id}`) return true;
    if (section.id.endsWith(`-${blueprint.id}`)) return true;
    if (section.title === blueprint.title) return true;

    return false;
  });

  if (exactMatch) return exactMatch;

  return applicant.sections.find((section) => {
    if (belongsToDifferentBlueprint(section, blueprint.id)) return false;

    const matchingLabelCount = blueprint.fields.filter((blueprintField) =>
      section.fields.some((field) => field.label === blueprintField.label),
    ).length;
    const minimumLabelMatch = Math.max(2, Math.ceil(blueprint.fields.length * 0.6));

    return matchingLabelCount >= minimumLabelMatch;
  });
}

function belongsToDifferentBlueprint(
  section: QuestionnaireSection,
  blueprintId: string,
) {
  return questionnaireBlueprint.some(
    (candidate) =>
      candidate.id !== blueprintId &&
      (section.id.endsWith(`-${candidate.id}`) || section.title === candidate.title),
  );
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
    adminReviewApprovedAtIso: existing.adminReviewApprovedAtIso,
    adminReviewApprovedBy: existing.adminReviewApprovedBy,
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
  _applicantName: string,
  status: QuestionnaireStatus,
  sectionId: string,
  _index: number,
  missing?: string,
): QuestionnaireField {
  const shouldFlag =
    status === "needs_fix" && sectionId === "trip" && field.id === "first-entry-country";

  return {
    id: field.id,
    label: field.label,
    value: field.value ?? "",
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
  const firstInvalidField = fields.find((field) => validateQuestionnaireFieldValue(field));
  const firstError = fields.find((field) => field.error);

  return {
    ...section,
    fields,
    status,
    missing:
      firstError?.error ??
      (firstInvalidField
        ? validateQuestionnaireFieldValue(firstInvalidField) ??
          `Нужно заполнить: ${firstInvalidField.label}`
        : undefined),
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
  if (
    fields.some(
      (field) =>
        field.error ||
        (field.value.trim() && validateQuestionnaireFieldValue(field)),
    )
  ) {
    return "needs_fix";
  }
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
  return !validateQuestionnaireFieldValue(field) && !field.error;
}
