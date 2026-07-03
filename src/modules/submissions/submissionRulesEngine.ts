export const appointmentReadinessRuleIds = [
  "APPT_NO_APPLICANTS",
  "APPT_PASSPORT_MISSING",
  "APPT_PASSPORT_MRZ_UNREADABLE",
  "APPT_PASSPORT_EXPIRED",
  "APPT_PASSPORT_VALIDITY_TOO_SHORT",
  "APPT_PASSPORT_NO_BLANK_PAGES_DECLARED",
  "APPT_PASSPORT_NO_BLANK_PAGES_UNCONFIRMED",
  "APPT_SELFIE_1_MISSING",
  "APPT_SELFIE_2_MISSING",
  "APPT_SELFIE_BAD_QUALITY",
  "APPT_SELFIES_LOOK_DUPLICATED",
  "APPT_TRIP_DATES_MISSING",
  "APPT_TRIP_DATE_INVALID_RANGE",
  "APPT_TOO_EARLY_FOR_APPLICATION",
  "APPT_TOO_LATE_FOR_APPLICATION",
  "APPT_VISA_TYPE_MISSING",
  "APPT_UNSUPPORTED_VISA_TYPE",
  "APPT_CONSULAR_JURISDICTION_MISSING",
  "APPT_CONSULAR_JURISDICTION_MISMATCH",
  "APPT_DUPLICATE_PASSPORT_ACTIVE_SUBMISSION",
  "APPT_DUPLICATE_ACTIVE_APPOINTMENT",
  "APPT_CONTACT_MISSING",
  "APPT_AGENT_MISSING",
  "APPT_APPLICANT_NAME_MISSING",
  "APPT_DOB_MISSING",
  "APPT_NATIONALITY_MISSING",
  "APPT_FAMILY_MEMBER_MISSING_PASSPORT",
  "APPT_FAMILY_MEMBER_MISSING_SELFIES",
  "APPT_FAMILY_DIFFERENT_CITIES",
  "APPT_FAMILY_DIFFERENT_TRIP_DATES",
  "APPT_FAMILY_DIFFERENT_VISA_TYPES",
  "APPT_FAMILY_MEMBER_COUNT_REQUIRES_MANUAL_CHECK",
] as const;

export type AppointmentReadinessRuleId =
  (typeof appointmentReadinessRuleIds)[number];

export type AppointmentReadinessPhase = "appointment_readiness";

export type RuleSeverity = "blocker" | "warning" | "info";

export type RuleFindingCategory =
  | "appointment"
  | "city"
  | "family"
  | "files"
  | "passport"
  | "questionnaire"
  | "system";

export type RuleFindingTarget =
  | "applicant"
  | "contact"
  | "duplicate"
  | "family"
  | "file"
  | "jurisdiction"
  | "passport"
  | "selfie"
  | "submission"
  | "trip";

export type AppointmentReadinessBlock = "appointment_readiness" | "none";

export type AppointmentReadinessInput = {
  actorRole?: "agent" | "admin";
  agentId?: string;
  applicants: AppointmentReadinessApplicantInput[];
  applicationDate?: string;
  appointmentCenter?: string;
  city?: string;
  duplicateActiveAppointment?: boolean;
  duplicatePassportActiveSubmission?: boolean;
  familyAutoLimit?: number;
  familyUnifiedTripRequired?: boolean;
  familyUnifiedVisaTypeRequired?: boolean;
  jurisdiction?: string;
  jurisdictionMatches?: boolean;
  now?: string;
  requiredContactFields?: Array<"email" | "phone">;
  residenceCity?: string;
  submissionStatus?: string;
  submissionType: "family" | "single";
  supportedVisaTypes?: string[];
  trip?: AppointmentReadinessTripInput;
  visaType?: string;
};

export type AppointmentReadinessTripInput = {
  entryDate?: string;
  exitDate?: string;
};

export type AppointmentReadinessApplicantInput = {
  applicantId: string;
  blankPagesConfirmed?: boolean;
  city?: string;
  contactEmailPresent?: boolean;
  contactPhonePresent?: boolean;
  declaredBlankPages?: number;
  dobPresent?: boolean;
  duplicateActiveAppointment?: boolean;
  duplicatePassportActiveSubmission?: boolean;
  fullNamePresent?: boolean;
  hasPassportScan?: boolean;
  hasSelfie1?: boolean;
  hasSelfie2?: boolean;
  nationalityPresent?: boolean;
  passportExpiryDate?: string;
  passportIdentityFieldsReadable?: boolean;
  passportMrzConfidence?: "low" | "medium" | "high";
  passportMrzReadable?: boolean;
  selfieQualityStatus?: "accepted" | "bad" | "needs_replacement" | "pending_review";
  selfiesLookDuplicated?: boolean;
  tripDates?: AppointmentReadinessTripInput;
  visaType?: string;
};

export type RuleFinding = {
  applicantId?: string;
  blocks: AppointmentReadinessBlock;
  category: RuleFindingCategory;
  messageRu: string;
  overridePolicy?: string;
  ruleId: AppointmentReadinessRuleId;
  safeForAdmin: boolean;
  safeForAgent: boolean;
  severity: RuleSeverity;
  target?: RuleFindingTarget;
  titleRu: string;
};

export type AppointmentReadinessResult = {
  adminSummaryRu: string;
  agentSummaryRu: string;
  blockers: RuleFinding[];
  canBookAppointment: boolean;
  evaluatedRuleIds: AppointmentReadinessRuleId[];
  infos: RuleFinding[];
  nextActionRu: string;
  phase: AppointmentReadinessPhase;
  ready: boolean;
  warnings: RuleFinding[];
};

type DateOnly = {
  day: number;
  month: number;
  year: number;
};

type RuleDefinition = {
  adminMessageRu: string;
  agentMessageRu: string;
  category: RuleFindingCategory;
  nextActionRu: string;
  overridePolicy?: string;
  severity: RuleSeverity;
  target: RuleFindingTarget;
  titleRu: string;
};

const millisecondsPerDay = 24 * 60 * 60 * 1000;
const defaultFamilyAutoLimit = 4;
const defaultSupportedVisaTypes = [
  "business",
  "family",
  "family_visit",
  "normal",
  "schengen",
  "tourism",
  "tourist",
  "деловая",
  "семейная",
  "туризм",
  "туристическая",
  "шенгенская",
];
const defaultRequiredContactFields = ["phone", "email"] as const;

const appointmentBlockingRuleIds = new Set<AppointmentReadinessRuleId>([
  "APPT_NO_APPLICANTS",
  "APPT_PASSPORT_MISSING",
  "APPT_SELFIE_1_MISSING",
  "APPT_SELFIE_2_MISSING",
  "APPT_FAMILY_MEMBER_MISSING_PASSPORT",
  "APPT_FAMILY_MEMBER_MISSING_SELFIES",
]);

const ruleDefinitions: Record<AppointmentReadinessRuleId, RuleDefinition> = {
  APPT_NO_APPLICANTS: {
    adminMessageRu: "В подаче нет заявителей; подготовка записи невозможна.",
    agentMessageRu: "Добавьте хотя бы одного заявителя.",
    category: "appointment",
    nextActionRu: "Добавить заявителя в подачу.",
    severity: "blocker",
    target: "submission",
    titleRu: "Нет заявителей",
  },
  APPT_PASSPORT_MISSING: {
    adminMessageRu: "Скан паспорта отсутствует; подготовка записи заблокирована.",
    agentMessageRu: "Загрузите скан паспорта для заявителя.",
    category: "passport",
    nextActionRu: "Агент загружает или заменяет скан паспорта.",
    severity: "blocker",
    target: "passport",
    titleRu: "Скан паспорта не загружен",
  },
  APPT_PASSPORT_MRZ_UNREADABLE: {
    adminMessageRu: "Паспортные данные требуют ручной проверки до подготовки записи.",
    agentMessageRu: "Проверьте паспорт и заполните данные вручную.",
    category: "passport",
    nextActionRu: "Открыть паспорт, проверить номер и identity поля, сохранить ручные значения.",
    severity: "blocker",
    target: "passport",
    titleRu: "Данные паспорта не прочитаны",
  },
  APPT_PASSPORT_EXPIRED: {
    adminMessageRu: "Паспорт просрочен; подготовка записи заблокирована.",
    agentMessageRu: "Паспорт просрочен. Проверьте документ и замените данные.",
    category: "passport",
    nextActionRu: "Уточнить документ у заявителя или заменить паспортные данные.",
    severity: "blocker",
    target: "passport",
    titleRu: "Паспорт просрочен",
  },
  APPT_PASSPORT_VALIDITY_TOO_SHORT: {
    adminMessageRu: "Срок действия паспорта слишком короткий для подготовки записи.",
    agentMessageRu: "Проверьте срок действия паспорта относительно даты выезда.",
    category: "passport",
    nextActionRu: "Обновить дату выезда или паспортные данные после проверки.",
    severity: "blocker",
    target: "passport",
    titleRu: "Срок действия паспорта недостаточен",
  },
  APPT_PASSPORT_NO_BLANK_PAGES_DECLARED: {
    adminMessageRu: "Заявитель указал меньше 2 пустых страниц; запись заблокирована.",
    agentMessageRu: "Уточните наличие минимум 2 пустых страниц в паспорте.",
    category: "passport",
    nextActionRu: "Получить подтверждение или новый документ от заявителя.",
    severity: "blocker",
    target: "passport",
    titleRu: "Недостаточно пустых страниц",
  },
  APPT_PASSPORT_NO_BLANK_PAGES_UNCONFIRMED: {
    adminMessageRu: "Наличие пустых страниц не подтверждено; нужна ручная проверка.",
    agentMessageRu: "Подтвердите, что в паспорте есть минимум 2 пустые страницы.",
    category: "passport",
    nextActionRu: "Получить подтверждение от заявителя.",
    overridePolicy: "Предупреждение можно усилить профилем страны, но в MVP оно не блокирует запись.",
    severity: "warning",
    target: "passport",
    titleRu: "Пустые страницы не подтверждены",
  },
  APPT_SELFIE_1_MISSING: {
    adminMessageRu: "Фронтальное селфи отсутствует; запись заблокирована.",
    agentMessageRu: "Загрузите фронтальное селфи заявителя.",
    category: "files",
    nextActionRu: "Агент загружает или заменяет фронтальное селфи.",
    severity: "blocker",
    target: "selfie",
    titleRu: "Первое селфи не загружено",
  },
  APPT_SELFIE_2_MISSING: {
    adminMessageRu: "Второе селфи отсутствует; запись заблокирована.",
    agentMessageRu: "Загрузите второе селфи заявителя.",
    category: "files",
    nextActionRu: "Агент загружает или заменяет второе селфи.",
    severity: "blocker",
    target: "selfie",
    titleRu: "Второе селфи не загружено",
  },
  APPT_SELFIE_BAD_QUALITY: {
    adminMessageRu: "Селфи требует замены до подготовки записи.",
    agentMessageRu: "Замените селфи: лицо должно быть видно без сильного размытия или обрезки.",
    category: "files",
    nextActionRu: "Запросить новый снимок у заявителя.",
    severity: "blocker",
    target: "selfie",
    titleRu: "Селфи требует замены",
  },
  APPT_SELFIES_LOOK_DUPLICATED: {
    adminMessageRu: "Селфи похожи; нужна ручная проверка.",
    agentMessageRu: "Проверьте, что загружены два разных снимка.",
    category: "files",
    nextActionRu: "При необходимости запросить второй отличающийся снимок.",
    overridePolicy: "Предупреждение можно усилить профилем страны, но в MVP оно не блокирует запись.",
    severity: "warning",
    target: "selfie",
    titleRu: "Селфи похожи друг на друга",
  },
  APPT_TRIP_DATES_MISSING: {
    adminMessageRu: "Даты поездки отсутствуют; запись заблокирована.",
    agentMessageRu: "Заполните даты въезда и выезда.",
    category: "appointment",
    nextActionRu: "Уточнить и сохранить обе даты поездки.",
    severity: "blocker",
    target: "trip",
    titleRu: "Даты поездки не заполнены",
  },
  APPT_TRIP_DATE_INVALID_RANGE: {
    adminMessageRu: "Диапазон дат поездки некорректен.",
    agentMessageRu: "Проверьте даты поездки: выезд раньше въезда.",
    category: "appointment",
    nextActionRu: "Исправить дату въезда или выезда.",
    severity: "blocker",
    target: "trip",
    titleRu: "Некорректный диапазон поездки",
  },
  APPT_TOO_EARLY_FOR_APPLICATION: {
    adminMessageRu: "Запись слишком ранняя относительно планируемой поездки.",
    agentMessageRu: "Дата подготовки слишком ранняя относительно поездки.",
    category: "appointment",
    nextActionRu: "Выбрать корректную дату подготовки или уточнить даты поездки.",
    severity: "blocker",
    target: "trip",
    titleRu: "Слишком рано для подачи",
  },
  APPT_TOO_LATE_FOR_APPLICATION: {
    adminMessageRu: "Срок до поездки меньше 15 дней; требуется решение администратора.",
    agentMessageRu: "Дата подготовки слишком близко к поездке. Передайте администратору для решения.",
    category: "appointment",
    nextActionRu: "Администратор проверяет возможность исключения или меняет даты.",
    overridePolicy: "Блокирует агентский поток; администратор может продолжить только с зафиксированной причиной исключения.",
    severity: "blocker",
    target: "trip",
    titleRu: "Слишком поздно для подачи",
  },
  APPT_VISA_TYPE_MISSING: {
    adminMessageRu: "Тип визы не выбран; запись заблокирована.",
    agentMessageRu: "Выберите тип визы.",
    category: "appointment",
    nextActionRu: "Выбрать тип из доступного списка MVP.",
    severity: "blocker",
    target: "submission",
    titleRu: "Тип визы не выбран",
  },
  APPT_UNSUPPORTED_VISA_TYPE: {
    adminMessageRu: "Выбранный тип визы не входит в MVP процесс.",
    agentMessageRu: "Выберите тип визы, поддерживаемый в текущем процессе.",
    category: "appointment",
    nextActionRu: "Изменить тип или перенести подачу в отдельный ручной процесс.",
    overridePolicy: "Администратор может перенести подачу в ручной процесс, но правило остается блокером MVP.",
    severity: "blocker",
    target: "submission",
    titleRu: "Тип визы вне MVP",
  },
  APPT_CONSULAR_JURISDICTION_MISSING: {
    adminMessageRu: "Данные юрисдикции отсутствуют; запись заблокирована.",
    agentMessageRu: "Заполните город и центр подачи для записи.",
    category: "city",
    nextActionRu: "Уточнить город проживания и центр подачи.",
    severity: "blocker",
    target: "jurisdiction",
    titleRu: "Юрисдикция не заполнена",
  },
  APPT_CONSULAR_JURISDICTION_MISMATCH: {
    adminMessageRu: "Центр подачи не соответствует юрисдикции заявителя.",
    agentMessageRu: "Проверьте город проживания и выбранный центр подачи.",
    category: "city",
    nextActionRu: "Выбрать корректный центр или исправить данные проживания.",
    overridePolicy: "Профиль страны может разрешить администраторское исключение с причиной.",
    severity: "blocker",
    target: "jurisdiction",
    titleRu: "Центр подачи не совпадает с юрисдикцией",
  },
  APPT_DUPLICATE_PASSPORT_ACTIVE_SUBMISSION: {
    adminMessageRu: "Есть активная подача с тем же паспортом; запись заблокирована.",
    agentMessageRu: "Проверьте дубль подачи по паспорту.",
    category: "system",
    nextActionRu: "Объединить процесс вручную или закрыть дубль по регламенту.",
    overridePolicy: "Администратор может продолжить только после разрешения дубля.",
    severity: "blocker",
    target: "duplicate",
    titleRu: "Активная подача с тем же паспортом",
  },
  APPT_DUPLICATE_ACTIVE_APPOINTMENT: {
    adminMessageRu: "Активная запись уже существует; повторная подготовка заблокирована.",
    agentMessageRu: "Проверьте существующую запись заявителя.",
    category: "appointment",
    nextActionRu: "Открыть существующую запись или закрыть дубль по регламенту.",
    overridePolicy: "Администратор может продолжить только после разрешения дубля.",
    severity: "blocker",
    target: "duplicate",
    titleRu: "Уже есть активная запись",
  },
  APPT_CONTACT_MISSING: {
    adminMessageRu: "Контактные данные отсутствуют; запись заблокирована.",
    agentMessageRu: "Заполните контактные данные заявителя.",
    category: "questionnaire",
    nextActionRu: "Запросить и сохранить требуемый контакт.",
    severity: "blocker",
    target: "contact",
    titleRu: "Контактные данные не заполнены",
  },
  APPT_AGENT_MISSING: {
    adminMessageRu: "Ответственный агент не указан; нужна маршрутизация подачи.",
    agentMessageRu: "Укажите ответственного агента для подачи.",
    category: "system",
    nextActionRu: "Назначить ответственного агента.",
    severity: "warning",
    target: "submission",
    titleRu: "Ответственный агент не указан",
  },
  APPT_APPLICANT_NAME_MISSING: {
    adminMessageRu: "ФИО отсутствует; запись заблокирована.",
    agentMessageRu: "Заполните ФИО заявителя по паспорту.",
    category: "passport",
    nextActionRu: "Проверить паспорт и сохранить ФИО вручную.",
    severity: "blocker",
    target: "applicant",
    titleRu: "ФИО заявителя не заполнено",
  },
  APPT_DOB_MISSING: {
    adminMessageRu: "Дата рождения отсутствует; запись заблокирована.",
    agentMessageRu: "Заполните дату рождения заявителя по паспорту.",
    category: "passport",
    nextActionRu: "Проверить паспорт и сохранить дату рождения вручную.",
    severity: "blocker",
    target: "applicant",
    titleRu: "Дата рождения не заполнена",
  },
  APPT_NATIONALITY_MISSING: {
    adminMessageRu: "Гражданство отсутствует; запись заблокирована.",
    agentMessageRu: "Заполните гражданство заявителя по паспорту.",
    category: "passport",
    nextActionRu: "Проверить паспорт и сохранить гражданство вручную.",
    severity: "blocker",
    target: "applicant",
    titleRu: "Гражданство не заполнено",
  },
  APPT_FAMILY_MEMBER_MISSING_PASSPORT: {
    adminMessageRu: "В семейной подаче есть участник без паспорта.",
    agentMessageRu: "Загрузите скан паспорта для каждого участника семьи.",
    category: "family",
    nextActionRu: "Открыть участника семьи и загрузить паспорт.",
    severity: "blocker",
    target: "family",
    titleRu: "У участника семьи нет паспорта",
  },
  APPT_FAMILY_MEMBER_MISSING_SELFIES: {
    adminMessageRu: "В семейной подаче есть участник без полного набора селфи.",
    agentMessageRu: "Загрузите оба селфи для каждого участника семьи.",
    category: "family",
    nextActionRu: "Открыть участника семьи и загрузить недостающие селфи.",
    severity: "blocker",
    target: "family",
    titleRu: "У участника семьи нет селфи",
  },
  APPT_FAMILY_DIFFERENT_CITIES: {
    adminMessageRu: "В семейной подаче разные города; запись заблокирована.",
    agentMessageRu: "Проверьте город записи у участников семьи.",
    category: "family",
    nextActionRu: "Исправить город или разделить подачу.",
    severity: "blocker",
    target: "family",
    titleRu: "Участники семьи в разных городах",
  },
  APPT_FAMILY_DIFFERENT_TRIP_DATES: {
    adminMessageRu: "Даты поездки в семье расходятся; запись заблокирована.",
    agentMessageRu: "Проверьте даты поездки у всех участников семьи.",
    category: "family",
    nextActionRu: "Исправить даты или разделить подачу.",
    overridePolicy: "Профиль страны может отключить это правило для независимых поездок.",
    severity: "blocker",
    target: "family",
    titleRu: "Участники семьи с разными датами поездки",
  },
  APPT_FAMILY_DIFFERENT_VISA_TYPES: {
    adminMessageRu: "В семейной подаче разные типы визы; запись заблокирована.",
    agentMessageRu: "Проверьте тип визы у участников семьи.",
    category: "family",
    nextActionRu: "Исправить тип или разделить подачу.",
    overridePolicy: "Профиль страны может отключить это правило, если смешанные типы поддерживаются.",
    severity: "blocker",
    target: "family",
    titleRu: "Участники семьи с разными типами визы",
  },
  APPT_FAMILY_MEMBER_COUNT_REQUIRES_MANUAL_CHECK: {
    adminMessageRu: "Количество участников семьи требует ручной проверки.",
    agentMessageRu: "Передайте семейную подачу администратору для проверки состава.",
    category: "family",
    nextActionRu: "Администратор проверяет состав семьи и способ записи.",
    overridePolicy: "Предупреждение можно усилить профилем страны, но в MVP оно не блокирует запись.",
    severity: "warning",
    target: "family",
    titleRu: "Количество участников требует проверки",
  },
};

export function evaluateAppointmentReadiness(
  input: AppointmentReadinessInput,
): AppointmentReadinessResult {
  const findings: RuleFinding[] = [];
  const tripDates = parsedTripDates(input.trip);
  const evaluationDate = parseDateOnly(input.now ?? input.applicationDate);
  const applicationDate = parseDateOnly(input.applicationDate ?? input.now);

  if (input.applicants.length === 0) {
    findings.push(finding("APPT_NO_APPLICANTS"));
  }

  for (const [index, applicant] of input.applicants.entries()) {
    evaluateApplicantRules(findings, input, applicant, index, {
      applicationDate,
      evaluationDate,
      tripDates,
    });
  }

  evaluateSubmissionRules(findings, input, {
    applicationDate,
    tripDates,
  });
  evaluateFamilyRules(findings, input);

  const blockers = findings.filter((finding) => finding.severity === "blocker");
  const warnings = findings.filter((finding) => finding.severity === "warning");
  const infos = findings.filter((finding) => finding.severity === "info");
  const ready = blockers.length === 0;

  return {
    adminSummaryRu: summaryFor("admin", blockers.length, warnings.length),
    agentSummaryRu: summaryFor("agent", blockers.length, warnings.length),
    blockers,
    canBookAppointment: ready,
    evaluatedRuleIds: [...appointmentReadinessRuleIds],
    infos,
    nextActionRu: nextActionFor(blockers, warnings),
    phase: "appointment_readiness",
    ready,
    warnings,
  };
}

function evaluateApplicantRules(
  findings: RuleFinding[],
  input: AppointmentReadinessInput,
  applicant: AppointmentReadinessApplicantInput,
  index: number,
  dates: {
    applicationDate: DateOnly | null;
    evaluationDate: DateOnly | null;
    tripDates: ParsedTripDates;
  },
) {
  const applicantRef = applicantReference(applicant, index);

  if (applicant.hasPassportScan !== true) {
    findings.push(finding("APPT_PASSPORT_MISSING", applicant, applicantRef));
  } else if (
    applicant.passportMrzReadable !== true ||
    applicant.passportIdentityFieldsReadable !== true ||
    applicant.passportMrzConfidence === "low"
  ) {
    findings.push(finding("APPT_PASSPORT_MRZ_UNREADABLE", applicant, applicantRef));
  }

  const passportExpiry = parseDateOnly(applicant.passportExpiryDate);
  if (passportExpiry && dates.evaluationDate && compareDates(passportExpiry, dates.evaluationDate) < 0) {
    findings.push(finding("APPT_PASSPORT_EXPIRED", applicant, applicantRef));
  }

  if (dates.tripDates.exitDate && !passportValidAfterDeparture(passportExpiry, dates.tripDates.exitDate)) {
    findings.push(finding("APPT_PASSPORT_VALIDITY_TOO_SHORT", applicant, applicantRef));
  }

  if (
    typeof applicant.declaredBlankPages === "number" &&
    applicant.declaredBlankPages < 2
  ) {
    findings.push(
      finding("APPT_PASSPORT_NO_BLANK_PAGES_DECLARED", applicant, applicantRef),
    );
  }

  if (
    typeof applicant.declaredBlankPages !== "number" &&
    applicant.blankPagesConfirmed !== true
  ) {
    findings.push(
      finding("APPT_PASSPORT_NO_BLANK_PAGES_UNCONFIRMED", applicant, applicantRef),
    );
  }

  if (applicant.hasSelfie1 !== true) {
    findings.push(finding("APPT_SELFIE_1_MISSING", applicant, applicantRef));
  }

  if (applicant.hasSelfie2 !== true) {
    findings.push(finding("APPT_SELFIE_2_MISSING", applicant, applicantRef));
  }

  if (
    applicant.selfieQualityStatus === "bad" ||
    applicant.selfieQualityStatus === "needs_replacement"
  ) {
    findings.push(finding("APPT_SELFIE_BAD_QUALITY", applicant, applicantRef));
  }

  if (applicant.selfiesLookDuplicated === true) {
    findings.push(finding("APPT_SELFIES_LOOK_DUPLICATED", applicant, applicantRef));
  }

  if (applicant.duplicatePassportActiveSubmission === true) {
    findings.push(
      finding("APPT_DUPLICATE_PASSPORT_ACTIVE_SUBMISSION", applicant, applicantRef),
    );
  }

  if (applicant.duplicateActiveAppointment === true) {
    findings.push(finding("APPT_DUPLICATE_ACTIVE_APPOINTMENT", applicant, applicantRef));
  }

  if (contactMissing(input.requiredContactFields, applicant)) {
    findings.push(finding("APPT_CONTACT_MISSING", applicant, applicantRef));
  }

  if (applicant.fullNamePresent !== true) {
    findings.push(finding("APPT_APPLICANT_NAME_MISSING", applicant, applicantRef));
  }

  if (applicant.dobPresent !== true) {
    findings.push(finding("APPT_DOB_MISSING", applicant, applicantRef));
  }

  if (applicant.nationalityPresent !== true) {
    findings.push(finding("APPT_NATIONALITY_MISSING", applicant, applicantRef));
  }

  if (!dates.applicationDate && dates.tripDates.entryDate) {
    findings.push(finding("APPT_TOO_EARLY_FOR_APPLICATION", applicant, applicantRef));
  }
}

function evaluateSubmissionRules(
  findings: RuleFinding[],
  input: AppointmentReadinessInput,
  dates: {
    applicationDate: DateOnly | null;
    tripDates: ParsedTripDates;
  },
) {
  if (!dates.tripDates.entryDate || !dates.tripDates.exitDate) {
    findings.push(finding("APPT_TRIP_DATES_MISSING"));
  } else if (compareDates(dates.tripDates.exitDate, dates.tripDates.entryDate) < 0) {
    findings.push(finding("APPT_TRIP_DATE_INVALID_RANGE"));
  }

  if (dates.applicationDate && dates.tripDates.entryDate) {
    const earliestApplicationDate = addCalendarMonths(dates.tripDates.entryDate, -6);
    if (compareDates(dates.applicationDate, earliestApplicationDate) < 0) {
      findings.push(finding("APPT_TOO_EARLY_FOR_APPLICATION"));
    }

    if (daysBetween(dates.applicationDate, dates.tripDates.entryDate) < 15) {
      findings.push(finding("APPT_TOO_LATE_FOR_APPLICATION"));
    }
  }

  if (isBlank(input.visaType)) {
    findings.push(finding("APPT_VISA_TYPE_MISSING"));
  } else if (!supportedVisaTypes(input).has(normalizeValue(input.visaType))) {
    findings.push(finding("APPT_UNSUPPORTED_VISA_TYPE"));
  }

  if (
    isBlank(input.city) ||
    isBlank(input.residenceCity) ||
    isBlank(input.appointmentCenter) ||
    isBlank(input.jurisdiction)
  ) {
    findings.push(finding("APPT_CONSULAR_JURISDICTION_MISSING"));
  } else if (input.jurisdictionMatches === false) {
    findings.push(finding("APPT_CONSULAR_JURISDICTION_MISMATCH"));
  }

  if ("agentId" in input && isBlank(input.agentId)) {
    findings.push(finding("APPT_AGENT_MISSING"));
  }

  if (input.duplicatePassportActiveSubmission === true) {
    findings.push(finding("APPT_DUPLICATE_PASSPORT_ACTIVE_SUBMISSION"));
  }

  if (input.duplicateActiveAppointment === true) {
    findings.push(finding("APPT_DUPLICATE_ACTIVE_APPOINTMENT"));
  }
}

function evaluateFamilyRules(
  findings: RuleFinding[],
  input: AppointmentReadinessInput,
) {
  if (input.submissionType !== "family") return;

  const missingPassport = input.applicants.find(
    (applicant) => applicant.hasPassportScan !== true,
  );
  if (missingPassport) {
    findings.push(
      finding(
        "APPT_FAMILY_MEMBER_MISSING_PASSPORT",
        missingPassport,
        applicantReference(
          missingPassport,
          input.applicants.findIndex((applicant) => applicant === missingPassport),
        ),
      ),
    );
  }

  const missingSelfies = input.applicants.find(
    (applicant) => applicant.hasSelfie1 !== true || applicant.hasSelfie2 !== true,
  );
  if (missingSelfies) {
    findings.push(
      finding(
        "APPT_FAMILY_MEMBER_MISSING_SELFIES",
        missingSelfies,
        applicantReference(
          missingSelfies,
          input.applicants.findIndex((applicant) => applicant === missingSelfies),
        ),
      ),
    );
  }

  if (distinctKnownValues(input.applicants.map((applicant) => applicant.city)).size > 1) {
    findings.push(finding("APPT_FAMILY_DIFFERENT_CITIES"));
  }

  if (
    input.familyUnifiedTripRequired !== false &&
    distinctKnownValues(input.applicants.map((applicant) => tripKey(applicant.tripDates))).size > 1
  ) {
    findings.push(finding("APPT_FAMILY_DIFFERENT_TRIP_DATES"));
  }

  if (
    input.familyUnifiedVisaTypeRequired !== false &&
    distinctKnownValues(input.applicants.map((applicant) => applicant.visaType ?? input.visaType)).size > 1
  ) {
    findings.push(finding("APPT_FAMILY_DIFFERENT_VISA_TYPES"));
  }

  if (input.applicants.length > (input.familyAutoLimit ?? defaultFamilyAutoLimit)) {
    findings.push(finding("APPT_FAMILY_MEMBER_COUNT_REQUIRES_MANUAL_CHECK"));
  }
}

function finding(
  ruleId: AppointmentReadinessRuleId,
  applicant?: AppointmentReadinessApplicantInput,
  applicantRef?: string,
): RuleFinding {
  const definition = ruleDefinitions[ruleId];
  const prefix = applicantRef ? `${applicantRef}: ` : "";
  const overridePolicy =
    "overridePolicy" in definition ? definition.overridePolicy : undefined;
  const severity = appointmentBlockingRuleIds.has(ruleId)
    ? "blocker"
    : definition.severity === "info"
      ? "info"
      : "warning";

  return {
    applicantId: applicant?.applicantId,
    blocks: severity === "blocker" ? "appointment_readiness" : "none",
    category: definition.category,
    messageRu: `${prefix}${definition.agentMessageRu}`,
    overridePolicy,
    ruleId,
    safeForAdmin: true,
    safeForAgent: true,
    severity,
    target: definition.target,
    titleRu: definition.titleRu,
  };
}

function applicantReference(
  applicant: AppointmentReadinessApplicantInput,
  index: number,
) {
  const safeIndex = index >= 0 ? index + 1 : undefined;
  return safeIndex ? `Заявитель ${safeIndex}` : applicant.applicantId;
}

type ParsedTripDates = {
  entryDate: DateOnly | null;
  exitDate: DateOnly | null;
};

function parsedTripDates(trip: AppointmentReadinessTripInput | undefined): ParsedTripDates {
  return {
    entryDate: parseDateOnly(trip?.entryDate),
    exitDate: parseDateOnly(trip?.exitDate),
  };
}

function parseDateOnly(value: string | undefined): DateOnly | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (!trimmed || isBlank(trimmed)) return null;

  const iso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (iso) return validDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));

  const dotted = /^(\d{2})[.-](\d{2})[.-](\d{4})$/.exec(trimmed);
  if (dotted) {
    return validDate(Number(dotted[3]), Number(dotted[2]), Number(dotted[1]));
  }

  return null;
}

function validDate(year: number, month: number, day: number): DateOnly | null {
  if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) {
    return null;
  }
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > daysInMonth(year, month)) return null;
  return { day, month, year };
}

function daysInMonth(year: number, month: number) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function dateTime(date: DateOnly) {
  return Date.UTC(date.year, date.month - 1, date.day);
}

function compareDates(left: DateOnly, right: DateOnly) {
  return dateTime(left) - dateTime(right);
}

function daysBetween(from: DateOnly, to: DateOnly) {
  return Math.round((dateTime(to) - dateTime(from)) / millisecondsPerDay);
}

function addCalendarMonths(date: DateOnly, months: number): DateOnly {
  const totalMonths = date.year * 12 + (date.month - 1) + months;
  const year = Math.floor(totalMonths / 12);
  const month = ((totalMonths % 12) + 12) % 12 + 1;
  const day = Math.min(date.day, daysInMonth(year, month));

  return { day, month, year };
}

function passportValidAfterDeparture(
  passportExpiry: DateOnly | null,
  tripExitDate: DateOnly,
) {
  if (!passportExpiry) return false;
  return compareDates(passportExpiry, addCalendarMonths(tripExitDate, 3)) >= 0;
}

function contactMissing(
  requiredFields: AppointmentReadinessInput["requiredContactFields"],
  applicant: AppointmentReadinessApplicantInput,
) {
  const required = requiredFields?.length ? requiredFields : defaultRequiredContactFields;
  const requiresPhone = required.includes("phone");
  const requiresEmail = required.includes("email");

  return (
    (requiresPhone && applicant.contactPhonePresent !== true) ||
    (requiresEmail && applicant.contactEmailPresent !== true)
  );
}

function supportedVisaTypes(input: AppointmentReadinessInput) {
  return new Set((input.supportedVisaTypes ?? defaultSupportedVisaTypes).map(normalizeValue));
}

function normalizeValue(value: string | undefined) {
  return value?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
}

function isBlank(value: string | undefined) {
  const normalized = normalizeValue(value);
  return !normalized || normalized === "не указано" || normalized === "n/a";
}

function distinctKnownValues(values: Array<string | undefined>) {
  return new Set(values.map(normalizeValue).filter((value) => value && value !== "не указано"));
}

function tripKey(trip: AppointmentReadinessTripInput | undefined) {
  const entry = normalizeValue(trip?.entryDate);
  const exit = normalizeValue(trip?.exitDate);
  if (!entry && !exit) return undefined;
  return `${entry}|${exit}`;
}

function nextActionFor(blockers: RuleFinding[], warnings: RuleFinding[]) {
  if (blockers[0]) return ruleDefinitions[blockers[0].ruleId].nextActionRu;
  if (warnings[0]) return ruleDefinitions[warnings[0].ruleId].nextActionRu;
  return "Можно переходить к подготовке записи.";
}

function summaryFor(role: "admin" | "agent", blockerCount: number, warningCount: number) {
  if (blockerCount > 0) {
    return role === "admin"
      ? `Найдено блокеров: ${blockerCount}. Подготовка записи остановлена до исправления.`
      : `Найдено блокеров: ${blockerCount}. Исправьте данные перед подготовкой записи.`;
  }

  if (warningCount > 0) {
    return `Блокеров для подготовки записи нет. Предупреждений: ${warningCount}.`;
  }

  return "Блокеров для подготовки записи нет.";
}
