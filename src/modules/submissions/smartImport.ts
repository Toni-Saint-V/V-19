import { parseQuestionnaireDataText } from "./questionnaireDataImageExtraction";

export const smartImportDocumentKinds = [
  "mixed_package",
  "russian_registration",
  "russian_internal_passport",
  "booking",
  "travel_ticket",
  "employment",
  "invitation",
  "filled_form",
  "contact_note",
  "unknown",
] as const;

export type SmartImportDocumentKind = (typeof smartImportDocumentKinds)[number];
export type SmartImportConfidence = "low" | "medium" | "high";

export const smartImportFieldIds = [
  "surname",
  "first-name",
  "previous-surname",
  "birth-date",
  "birth-place",
  "birth-country",
  "nationality",
  "gender",
  "marital-status",
  "home-country",
  "home-city",
  "home-street",
  "home-house",
  "home-building",
  "home-unit",
  "postal-code",
  "email",
  "contact-number",
  "occupation",
  "employer-name",
  "employer-contact",
  "employer-address",
  "purpose",
  "main-destination",
  "first-entry-country",
  "entry-count",
  "arrival-date",
  "departure-date",
  "stay-duration",
  "inviting-party-type",
  "hotel-name",
  "hotel-address",
  "hotel-country",
  "hotel-city",
  "hotel-postal-code",
  "hotel-email",
  "hotel-contact",
  "cost-covered-by",
  "means-of-support",
] as const;

export type SmartImportFieldId = (typeof smartImportFieldIds)[number];

export type SmartImportCandidate = {
  confidence: SmartImportConfidence;
  fieldId: SmartImportFieldId;
  label: string;
  sectionId: string;
  sourceKind?: SmartImportDocumentKind;
  value: string;
};

export type SmartImportParsedResult = {
  candidates: SmartImportCandidate[];
  documentKind: SmartImportDocumentKind;
  summary: string;
};

export type SmartImportReviewStatus =
  | "new"
  | "same"
  | "conflict"
  | "source_conflict"
  | "low_confidence";

export type SmartImportReviewItem = SmartImportCandidate & {
  currentValue: string;
  hasSourceAlternatives: boolean;
  id: string;
  selectedByDefault: boolean;
  status: SmartImportReviewStatus;
};

export type SmartImportReview = {
  documentKind: SmartImportDocumentKind;
  items: SmartImportReviewItem[];
  summary: string;
};

type CandidateInput = SmartImportCandidate & {
  priority?: number;
};

const allowedFieldIds = new Set<string>(smartImportFieldIds);
const forbiddenPassportFieldIds = new Set([
  "passport-type",
  "passport-no",
  "passport-issue-date",
  "passport-expiry-date",
  "passport-issue-country",
  "passport-issue-place",
]);

const fieldMetadata: Record<
  SmartImportFieldId,
  { label: string; sectionId: string }
> = {
  surname: { label: "Фамилия", sectionId: "personal" },
  "first-name": { label: "Имя", sectionId: "personal" },
  "previous-surname": { label: "Предыдущая фамилия", sectionId: "personal" },
  "birth-date": { label: "Дата рождения", sectionId: "personal" },
  "birth-place": { label: "Место рождения", sectionId: "personal" },
  "birth-country": { label: "Страна рождения", sectionId: "personal" },
  nationality: { label: "Гражданство", sectionId: "personal" },
  gender: { label: "Пол", sectionId: "personal" },
  "marital-status": { label: "Семейное положение", sectionId: "personal" },
  "home-country": { label: "Страна проживания", sectionId: "contacts" },
  "home-city": { label: "Город", sectionId: "contacts" },
  "home-street": { label: "Улица", sectionId: "contacts" },
  "home-house": { label: "Дом", sectionId: "contacts" },
  "home-building": { label: "Корпус / строение", sectionId: "contacts" },
  "home-unit": { label: "Квартира", sectionId: "contacts" },
  "postal-code": { label: "Почтовый индекс", sectionId: "contacts" },
  email: { label: "Email", sectionId: "contacts" },
  "contact-number": { label: "Телефон", sectionId: "contacts" },
  occupation: { label: "Должность / профессия", sectionId: "employment" },
  "employer-name": { label: "Работодатель", sectionId: "employment" },
  "employer-contact": { label: "Телефон работодателя", sectionId: "employment" },
  "employer-address": { label: "Адрес работодателя", sectionId: "employment" },
  purpose: { label: "Цель поездки", sectionId: "trip" },
  "main-destination": { label: "Основная страна назначения", sectionId: "trip" },
  "first-entry-country": { label: "Страна первого въезда", sectionId: "trip" },
  "entry-count": { label: "Количество въездов", sectionId: "trip" },
  "arrival-date": { label: "Дата въезда", sectionId: "trip" },
  "departure-date": { label: "Дата выезда", sectionId: "trip" },
  "stay-duration": { label: "Длительность поездки", sectionId: "trip" },
  "inviting-party-type": { label: "Тип принимающей стороны", sectionId: "hotel" },
  "hotel-name": { label: "Отель / принимающая сторона", sectionId: "hotel" },
  "hotel-address": { label: "Адрес в Испании", sectionId: "hotel" },
  "hotel-country": { label: "Страна отеля", sectionId: "hotel" },
  "hotel-city": { label: "Город отеля", sectionId: "hotel" },
  "hotel-postal-code": { label: "Индекс отеля", sectionId: "hotel" },
  "hotel-email": { label: "Email отеля", sectionId: "hotel" },
  "hotel-contact": { label: "Телефон отеля", sectionId: "hotel" },
  "cost-covered-by": { label: "Кто оплачивает", sectionId: "payment" },
  "means-of-support": { label: "Средства", sectionId: "payment" },
};

const kindLabels: Record<SmartImportDocumentKind, string> = {
  mixed_package: "пакет документов",
  russian_registration: "страница регистрации",
  russian_internal_passport: "внутренний паспорт РФ",
  booking: "бронь проживания",
  travel_ticket: "билет или маршрут",
  employment: "документ о работе",
  invitation: "приглашение",
  filled_form: "заполненная анкета",
  contact_note: "записка с данными",
  unknown: "неопределённый источник",
};

export function smartImportDocumentKindLabel(kind: SmartImportDocumentKind) {
  return kindLabels[kind];
}

export function parseSmartImportText(text: string): SmartImportParsedResult {
  const source = normalizeSourceText(text);
  const documentKind = classifySmartImportDocument(source);
  if (!source) {
    return {
      candidates: [],
      documentKind,
      summary: "Текст не найден. Попробуйте более чёткий источник.",
    };
  }

  const candidates: CandidateInput[] = [];
  collectGenericQuestionnaireCandidates(source, documentKind, candidates);
  if (
    documentKind !== "russian_internal_passport" &&
    documentKind !== "employment" &&
    documentKind !== "travel_ticket"
  ) {
    collectGenericContactCandidates(source, documentKind, candidates);
  }
  if (
    documentKind === "filled_form" ||
    documentKind === "contact_note" ||
    documentKind === "unknown"
  ) {
    collectGenericHomeAddressCandidates(source, candidates);
  }

  if (documentKind === "russian_registration") {
    collectRussianRegistrationCandidates(source, candidates);
  }
  if (documentKind === "russian_internal_passport") {
    collectRussianInternalPassportCandidates(source, candidates);
  }
  if (documentKind === "booking") {
    collectBookingCandidates(source, candidates);
  }
  if (documentKind === "travel_ticket") {
    collectTravelTicketCandidates(source, candidates);
  }
  if (documentKind === "employment") {
    collectEmploymentCandidates(source, candidates);
  }
  if (documentKind === "invitation") {
    collectInvitationCandidates(source, candidates);
  }

  const sanitized = deduplicateCandidates(candidates).map((item) => ({
    ...item,
    sourceKind: documentKind,
  }));
  return {
    candidates: sanitized,
    documentKind,
    summary: sanitized.length
      ? `Источник: ${kindLabels[documentKind]}. Найдено полей: ${sanitized.length}.`
      : `Источник: ${kindLabels[documentKind]}. Подходящие поля не найдены.`,
  };
}

export function mergeSmartImportParsedResults(
  results: readonly SmartImportParsedResult[],
): SmartImportParsedResult {
  if (!results.length) {
    return {
      candidates: [],
      documentKind: "mixed_package",
      summary: "Пакет пуст. Добавьте хотя бы один источник.",
    };
  }

  const byCanonicalValue = new Map<string, SmartImportCandidate>();
  for (const result of results) {
    for (const candidate of result.candidates) {
      const item: SmartImportCandidate = {
        ...candidate,
        sourceKind: candidate.sourceKind ?? result.documentKind,
      };
      const valueKey = comparableCandidateValue(item.fieldId, item.value);
      if (!valueKey) continue;
      const key = `${item.fieldId}\u0000${valueKey}`;
      const current = byCanonicalValue.get(key);
      if (!current || packageCandidateRank(item) > packageCandidateRank(current)) {
        byCanonicalValue.set(key, item);
      }
    }
  }

  const candidates = [...byCanonicalValue.values()].sort((left, right) => {
    const fieldOrder =
      smartImportFieldIds.indexOf(left.fieldId) -
      smartImportFieldIds.indexOf(right.fieldId);
    if (fieldOrder !== 0) return fieldOrder;
    return packageCandidateRank(right) - packageCandidateRank(left);
  });
  const valuesByField = new Map<SmartImportFieldId, Set<string>>();
  for (const item of candidates) {
    const values = valuesByField.get(item.fieldId) ?? new Set<string>();
    values.add(comparableCandidateValue(item.fieldId, item.value));
    valuesByField.set(item.fieldId, values);
  }
  const conflictCount = [...valuesByField.values()].filter(
    (values) => values.size > 1,
  ).length;
  const fieldCount = valuesByField.size;

  return {
    candidates,
    documentKind:
      results.length === 1 ? results[0]?.documentKind ?? "unknown" : "mixed_package",
    summary: `Пакет источников: ${results.length}. Найдено полей: ${fieldCount}. Конфликтов между источниками: ${conflictCount}.`,
  };
}

export function buildSmartImportReview(input: {
  currentValues: Readonly<Record<string, string | undefined>>;
  parsed: SmartImportParsedResult;
}): SmartImportReview {
  const distinctValuesByField = new Map<SmartImportFieldId, Set<string>>();
  for (const candidate of input.parsed.candidates) {
    const values =
      distinctValuesByField.get(candidate.fieldId) ?? new Set<string>();
    values.add(comparableCandidateValue(candidate.fieldId, candidate.value));
    distinctValuesByField.set(candidate.fieldId, values);
  }

  return {
    documentKind: input.parsed.documentKind,
    items: input.parsed.candidates.map((candidate, index) => {
      const currentValue = input.currentValues[candidate.fieldId]?.trim() ?? "";
      const hasSourceAlternatives =
        (distinctValuesByField.get(candidate.fieldId)?.size ?? 0) > 1;
      const status = reviewStatus(candidate, currentValue, hasSourceAlternatives);
      return {
        ...candidate,
        currentValue,
        hasSourceAlternatives,
        id: `${candidate.sectionId}:${candidate.fieldId}:${index}`,
        selectedByDefault: status === "new" && candidate.confidence !== "low",
        status,
      };
    }),
    summary: input.parsed.summary,
  };
}

export function isSmartImportFieldId(value: string): value is SmartImportFieldId {
  return allowedFieldIds.has(value);
}

function classifySmartImportDocument(source: string): SmartImportDocumentKind {
  const searchable = normalizeForSearch(source);
  if (
    /зарегистрирован(?:а|ы)?\s+по\s+месту\s+(?:жительства|пребывания)|регистраци[яи]\s+по\s+месту|снят(?:а|ы)?\s+с\s+регистрационного\s+учета/u.test(
      searchable,
    )
  ) {
    return "russian_registration";
  }
  if (
    /pnrus/u.test(searchable) ||
    (/российская\s+федерация/u.test(searchable) &&
      /(?:серия|код\s+подразделения|паспорт\s+выдан)/u.test(searchable))
  ) {
    return "russian_internal_passport";
  }
  if (
    /booking|reservation|confirmation|check[ -]?in|check[ -]?out|hotel|hostel|apartment|брон(?:ь|ирование)|отел[ья]|гостиниц/u.test(
      searchable,
    )
  ) {
    return "booking";
  }
  if (
    /маршрутн(?:ая|ой)\s+квитанц|электронн(?:ый|ого)\s+билет|e[ -]?ticket|itinerary|flight|boarding|рейс\s*[a-zа-я0-9]/u.test(
      searchable,
    )
  ) {
    return "travel_ticket";
  }
  if (
    /справк[аи]\s+с\s+места\s+работ|employment\s+(?:letter|certificate)|certificate\s+of\s+employment|company\s+letter/u.test(
      searchable,
    )
  ) {
    return "employment";
  }
  if (
    /приглашени|invitation|inviting\s+(?:person|company)|host\s+(?:person|company)/u.test(
      searchable,
    )
  ) {
    return "invitation";
  }

  const labelledLineCount = source
    .split(/\n+/u)
    .filter((line) => /^.{2,70}?(?::|=|—|–)\s*.{1,}/u.test(line.trim())).length;
  if (labelledLineCount >= 3) return "filled_form";

  if (containsContactSignal(source) || containsHomeAddressSignal(source)) {
    return "contact_note";
  }
  return "unknown";
}

function collectGenericQuestionnaireCandidates(
  source: string,
  documentKind: SmartImportDocumentKind,
  candidates: CandidateInput[],
) {
  for (const parsedField of parseQuestionnaireDataText(source)) {
    if (forbiddenPassportFieldIds.has(parsedField.fieldId)) continue;
    if (parsedField.fieldId === "home-address") continue;
    if (parsedField.fieldId === "birth-date" && normalizeForSearch(parsedField.label) === "date") {
      continue;
    }

    const sourceFieldId = parsedField.fieldId;
    const value =
      sourceFieldId === "occupation-specify"
        ? normalizeOccupation(parsedField.value)
        : parsedField.value;
    const canonicalFieldId =
      sourceFieldId === "occupation-specify" ? "occupation" : sourceFieldId;

    const adaptedFieldId = adaptGenericFieldForDocumentKind(
      canonicalFieldId,
      parsedField.label,
      documentKind,
    );
    if (!adaptedFieldId) continue;

    addCandidate(candidates, {
      confidence: parsedField.confidence,
      fieldId: adaptedFieldId,
      label: fieldMetadata[adaptedFieldId].label,
      priority: parsedField.confidence === "high" ? 40 : 25,
      sectionId: fieldMetadata[adaptedFieldId].sectionId,
      value,
    });
  }
}

function adaptGenericFieldForDocumentKind(
  fieldId: string,
  label: string,
  documentKind: SmartImportDocumentKind,
): SmartImportFieldId | undefined {
  if (documentKind === "booking" || documentKind === "invitation") {
    if (fieldId === "email") return "hotel-email";
    if (fieldId === "contact-number") return "hotel-contact";
    if (fieldId === "employer-contact") return "hotel-contact";
    if (documentKind === "invitation" && fieldId === "employer-name") {
      return "hotel-name";
    }
    if (documentKind === "invitation" && fieldId === "employer-address") {
      return "hotel-address";
    }
    if (
      fieldId === "employer-name" ||
      fieldId === "employer-address" ||
      fieldId === "occupation"
    ) {
      return undefined;
    }
  }

  if (
    documentKind === "employment" &&
    (fieldId === "email" || fieldId === "contact-number")
  ) {
    return undefined;
  }

  if (
    documentKind === "travel_ticket" &&
    (fieldId === "email" ||
      fieldId === "contact-number" ||
      fieldId.startsWith("employer-") ||
      fieldId === "occupation" ||
      fieldId.startsWith("home-") ||
      fieldId === "postal-code" ||
      fieldId.startsWith("hotel-") ||
      fieldId === "inviting-party-type")
  ) {
    return undefined;
  }

  if (!isSmartImportFieldId(fieldId)) return undefined;

  // A generic `company` label on a booking usually names the booking provider,
  // not the applicant's employer or the hotel. Keep it out unless a
  // source-specific extractor can identify the role precisely.
  if (
    documentKind === "booking" &&
    fieldId === "employer-name" &&
    !/(?:hotel|hostel|отел|гостиниц)/iu.test(label)
  ) {
    return undefined;
  }

  return fieldId;
}

function collectGenericContactCandidates(
  source: string,
  documentKind: SmartImportDocumentKind,
  candidates: CandidateInput[],
) {
  const email = source.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu)?.[0];
  if (email) {
    const fieldId =
      documentKind === "booking" || documentKind === "invitation"
        ? "hotel-email"
        : "email";
    addCandidate(candidates, candidate(fieldId, email.toLowerCase(), "medium", 15));
  }

  const phone = findPhone(source);
  if (phone) {
    const fieldId =
      documentKind === "booking" || documentKind === "invitation"
        ? "hotel-contact"
        : "contact-number";
    addCandidate(candidates, candidate(fieldId, phone, "medium", 15));
  }
}

function collectGenericHomeAddressCandidates(
  source: string,
  candidates: CandidateInput[],
) {
  const parsedAddress = parseQuestionnaireDataText(source).find(
    (field) => field.fieldId === "home-address",
  )?.value;
  const labelledAddress = extractInlineValue(
    source,
    [
      "домашний адрес",
      "адрес проживания",
      "адрес регистрации",
      "прописка",
      "home address",
      "residential address",
      "registration address",
      "address",
      "адрес",
    ],
    /[^\n]{3,220}/u,
  );
  const address = parsedAddress || labelledAddress;
  if (!address) return;

  collectRussianHomeAddressParts(address, candidates, {
    confidence: "high",
    priority: 80,
    requireRussianSignal: true,
  });
}

function collectRussianRegistrationCandidates(
  source: string,
  candidates: CandidateInput[],
) {
  collectRussianHomeAddressParts(source, candidates, {
    confidence: "high",
    priority: 90,
    requireRussianSignal: false,
  });
}

function collectRussianHomeAddressParts(
  source: string,
  candidates: CandidateInput[],
  options: {
    confidence: SmartImportConfidence;
    priority: number;
    requireRussianSignal: boolean;
  },
) {
  const russianSignal = looksLikeRussianAddress(source);
  if (options.requireRussianSignal && !russianSignal) return;

  if (russianSignal || !options.requireRussianSignal) {
    addCandidate(
      candidates,
      candidate(
        "home-country",
        "Russian Federation",
        options.confidence,
        options.priority + 10,
      ),
    );
  }

  const postalCode = source.match(/(?<!\d)\d{6}(?!\d)/u)?.[0];
  if (postalCode) {
    addCandidate(
      candidates,
      candidate("postal-code", postalCode, options.confidence, options.priority),
    );
  }

  const city = extractRussianCity(source);
  if (city) {
    addCandidate(
      candidates,
      candidate("home-city", city, options.confidence, options.priority),
    );
  }

  const street = extractRussianStreet(source);
  if (street) {
    addCandidate(
      candidates,
      candidate("home-street", street, options.confidence, options.priority),
    );
  }

  const house = source.match(
    /(?:^|[,\n])\s*(?:д(?:ом)?)\.?\s*([0-9А-ЯA-Z/-]+)/iu,
  )?.[1];
  if (house) {
    addCandidate(
      candidates,
      candidate("home-house", house, options.confidence, options.priority),
    );
  }

  const buildingParts: string[] = [];
  const corpus = source.match(
    /(?:^|[,\n])\s*(?:корп(?:ус)?|к)\.?\s*([0-9А-ЯA-Z/-]+)/iu,
  )?.[1];
  const structure = source.match(
    /(?:^|[,\n])\s*(?:стр(?:оение)?)\.?\s*([0-9А-ЯA-Z/-]+)/iu,
  )?.[1];
  if (corpus) buildingParts.push(corpus);
  if (structure) buildingParts.push(`стр. ${structure}`);
  if (buildingParts.length) {
    addCandidate(
      candidates,
      candidate(
        "home-building",
        buildingParts.join(", "),
        options.confidence,
        options.priority,
      ),
    );
  }

  const unit = source.match(
    /(?:^|[,\n])\s*(?:кв(?:артира)?)\.?\s*([0-9А-ЯA-Z/-]+)/iu,
  )?.[1];
  if (unit) {
    addCandidate(
      candidates,
      candidate("home-unit", unit, options.confidence, options.priority),
    );
  }
}

function collectRussianInternalPassportCandidates(
  source: string,
  candidates: CandidateInput[],
) {
  const visual = extractRussianInternalPassportVisualIdentity(source);
  const labelledSurname = extractInlineValue(
    source,
    ["фамилия", "surname"],
    nameValuePattern,
  );
  const labelledFirstName = extractInlineValue(
    source,
    ["имя", "given name"],
    nameValuePattern,
  );
  const labelledBirthDate = extractInlineValue(
    source,
    ["дата рождения", "date of birth"],
    dateValuePattern,
  );
  const labelledBirthPlace = extractLongInlineValue(
    source,
    ["место рождения", "place of birth"],
  );
  const labelledGender = extractInlineValue(
    source,
    ["пол", "sex"],
    /[A-ZА-ЯЁ.]+/iu,
  );

  const surname = labelledSurname || visual.surname;
  const firstName = labelledFirstName || visual.firstName;
  const birthDate = labelledBirthDate || visual.birthDate;
  const birthPlace = labelledBirthPlace || visual.birthPlace;
  const gender = labelledGender || visual.gender;

  if (surname) {
    addCandidate(
      candidates,
      candidate(
        "surname",
        surname.toUpperCase(),
        labelledSurname ? "high" : "medium",
        labelledSurname ? 120 : 75,
      ),
    );
  }
  if (firstName) {
    addCandidate(
      candidates,
      candidate(
        "first-name",
        firstName.toUpperCase(),
        labelledFirstName ? "high" : "medium",
        labelledFirstName ? 120 : 75,
      ),
    );
  }
  if (birthDate) {
    const normalized = normalizeDate(birthDate);
    if (normalized) {
      addCandidate(
        candidates,
        candidate(
          "birth-date",
          normalized,
          labelledBirthDate ? "high" : "medium",
          labelledBirthDate ? 120 : 75,
        ),
      );
    }
  }
  if (birthPlace) {
    addCandidate(
      candidates,
      candidate(
        "birth-place",
        cleanLongValue(birthPlace).toUpperCase(),
        labelledBirthPlace ? "high" : "medium",
        labelledBirthPlace ? 120 : 70,
      ),
    );
  }
  if (gender) {
    const normalized = normalizeGender(gender);
    if (normalized) {
      addCandidate(
        candidates,
        candidate(
          "gender",
          normalized,
          labelledGender ? "high" : "medium",
          labelledGender ? 120 : 75,
        ),
      );
    }
  }
  addCandidate(candidates, candidate("nationality", "Russian Federation", "high", 100));

  collectInternalPassportMrzFallback(source, candidates);
}

type RussianInternalPassportVisualIdentity = {
  birthDate: string;
  birthPlace: string;
  firstName: string;
  gender: string;
  surname: string;
};

function extractRussianInternalPassportVisualIdentity(
  source: string,
): RussianInternalPassportVisualIdentity {
  const lines = normalizeSourceText(source)
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const identity: RussianInternalPassportVisualIdentity = {
    birthDate: "",
    birthPlace: "",
    firstName: "",
    gender: "",
    surname: "",
  };

  const birthLineIndex = lines.findIndex(
    (line) =>
      /(?:муж|жен|\b[MF]\b)/iu.test(line) &&
      dateValuePattern.test(line),
  );
  if (birthLineIndex < 0) return identity;

  const birthLine = lines[birthLineIndex] ?? "";
  identity.birthDate = birthLine.match(dateValuePattern)?.[0] ?? "";
  identity.gender = /жен|\bF\b/iu.test(birthLine) ? "Женский" : "Мужской";

  const nameLines = lines
    .slice(Math.max(0, birthLineIndex - 10), birthLineIndex)
    .map(cleanInternalPassportVisualNameLine)
    .filter(Boolean)
    .slice(-3);
  if (nameLines.length >= 2) {
    identity.surname = nameLines[0] ?? "";
    identity.firstName = nameLines[1] ?? "";
  }

  const placeLines: string[] = [];
  for (const line of lines.slice(birthLineIndex + 1, birthLineIndex + 7)) {
    if (/PNRUS|(?:серия|номер|паспорт\s+выдан|код\s+подразделения)/iu.test(line)) {
      break;
    }
    const normalized = cleanInternalPassportVisualPlaceLine(line);
    if (normalized) placeLines.push(normalized);
    if (placeLines.length >= 3) break;
  }
  identity.birthPlace = placeLines.join(" ");
  return identity;
}

function cleanInternalPassportVisualNameLine(value: string) {
  const words = value.toUpperCase().match(/[А-ЯЁ][А-ЯЁ-]{1,30}/gu) ?? [];
  if (words.length !== 1) return "";
  const word = words[0] ?? "";
  if (
    word.length < 3 ||
    /^(?:РОССИЙСКАЯ|ФЕДЕРАЦИЯ|ПАСПОРТ|ВЫДАН|ОТДЕЛОМ|ФАМИЛИЯ|ИМЯ|ОТЧЕСТВО|МУЖ|ЖЕН)$/u.test(
      word,
    )
  ) {
    return "";
  }
  return word;
}

function cleanInternalPassportVisualPlaceLine(value: string) {
  const words = value.toUpperCase().match(/[А-ЯЁ][А-ЯЁ-]*/gu) ?? [];
  const cleaned = words
    .filter(
      (word) =>
        !/^(?:МЕСТО|РОЖДЕНИЯ|ПОЛ|ДАТА|СЕРИЯ|НОМЕР)$/u.test(word),
    )
    .join(" ")
    .trim();
  if (!cleaned || cleaned.length < 3) return "";
  return cleaned;
}

function collectInternalPassportMrzFallback(
  source: string,
  candidates: CandidateInput[],
) {
  const compactLines = source
    .toUpperCase()
    .split(/\n+/u)
    .map((line) => line.replace(/\s+/gu, ""));
  const nameLine = compactLines.find((line) => line.includes("PNRUS"));
  if (nameLine) {
    const nameBlock = nameLine.slice(nameLine.indexOf("PNRUS") + 5);
    const [surname = "", givenBlock = ""] = nameBlock.split("<<", 2);
    const firstName = givenBlock.split("<").find(Boolean) ?? "";
    const transliteratedSurname = transliterateRussianInternalPassportMrzName(
      surname.replace(/<+$/u, ""),
    );
    const transliteratedFirstName = transliterateRussianInternalPassportMrzName(
      firstName,
    );
    if (transliteratedSurname) {
      addCandidate(
        candidates,
        candidate("surname", transliteratedSurname, "low", 5),
      );
    }
    if (transliteratedFirstName) {
      addCandidate(
        candidates,
        candidate("first-name", transliteratedFirstName, "low", 5),
      );
    }
  }

  const rawDataLine = compactLines.find((line) => line.indexOf("RUS") >= 10);
  const dataLine = normalizeRussianInternalPassportMrzDataLine(rawDataLine ?? "");
  const dataMatch = dataLine.match(/^([A-Z0-9<]{9})(\d)RUS(\d{6})(\d)([MF])/u);
  const validDataLine = Boolean(
    dataMatch?.[1] &&
      dataMatch[2] &&
      dataMatch[3] &&
      dataMatch[4] &&
      hasMrzCheckDigit(dataMatch[1], dataMatch[2]) &&
      hasMrzCheckDigit(dataMatch[3], dataMatch[4]),
  );
  if (validDataLine && dataMatch?.[3]) {
    const date = normalizeMrzBirthDate(dataMatch[3]);
    if (date) addCandidate(candidates, candidate("birth-date", date, "medium", 35));
  }
  if (validDataLine && dataMatch?.[5]) {
    addCandidate(
      candidates,
      candidate("gender", dataMatch[5] === "M" ? "Мужской" : "Женский", "medium", 35),
    );
  }
}

const russianInternalPassportMrzDigitCorrections: Readonly<Record<string, string>> = {
  B: "8",
  D: "0",
  I: "1",
  L: "1",
  O: "0",
  Q: "0",
  S: "5",
  Z: "2",
};

function normalizeRussianInternalPassportMrzDataLine(value: string) {
  const source = value.toUpperCase().replace(/\s+/gu, "");
  const nationalityIndex = source.indexOf("RUS");
  if (nationalityIndex < 10) return "";
  const candidate = source.slice(nationalityIndex - 10, nationalityIndex + 11);
  return candidate
    .split("")
    .map((character, index) =>
      (index <= 9 || (index >= 13 && index <= 19))
        ? russianInternalPassportMrzDigitCorrections[character] ?? character
        : character,
    )
    .join("");
}

function hasMrzCheckDigit(value: string, checkDigit: string) {
  if (!/^\d$/u.test(checkDigit)) return false;
  const weights = [7, 3, 1] as const;
  let total = 0;
  for (let index = 0; index < value.length; index += 1) {
    const character = value[index] ?? "";
    const characterValue =
      character === "<"
        ? 0
        : /^\d$/u.test(character)
          ? Number(character)
          : /^[A-Z]$/u.test(character)
            ? character.charCodeAt(0) - 55
            : Number.NaN;
    if (!Number.isFinite(characterValue)) return false;
    total += characterValue * (weights[index % weights.length] ?? 1);
  }
  return String(total % 10) === checkDigit;
}

const russianInternalPassportMrzAlphabet: Readonly<Record<string, string>> = {
  "2": "Ё",
  "3": "Ч",
  "4": "Ъ",
  "6": "Ь",
  "7": "Э",
  "8": "Ю",
  "9": "Я",
  A: "А",
  B: "Б",
  C: "Ц",
  D: "Д",
  E: "Е",
  F: "Ф",
  G: "Г",
  H: "Х",
  I: "И",
  J: "Ж",
  K: "К",
  L: "Л",
  M: "М",
  N: "Н",
  O: "О",
  P: "П",
  Q: "Й",
  R: "Р",
  S: "С",
  T: "Т",
  U: "У",
  V: "В",
  W: "Ш",
  X: "Щ",
  Y: "Ы",
  Z: "З",
};

function transliterateRussianInternalPassportMrzName(value: string) {
  const source = value.toUpperCase().replace(/<+/gu, "").trim();
  if (!source) return "";

  let result = "";
  for (const character of source) {
    if (character === "-") {
      result += character;
      continue;
    }
    const mapped = russianInternalPassportMrzAlphabet[character];
    if (!mapped) return "";
    result += mapped;
  }
  return result;
}

function collectBookingCandidates(source: string, candidates: CandidateInput[]) {
  addCandidate(
    candidates,
    candidate("inviting-party-type", "Гостиница/временное жилье", "high", 110),
  );

  const lines = source
    .split(/\n+/u)
    .map((line) => line.replace(/\s+/gu, " ").trim())
    .filter(Boolean);
  const hotelLine = lines.find((line) => /^(?:hotel|hostel|отель|гостиница)\b/iu.test(line));
  if (hotelLine && !/^(?:hotel|отель)\s+(?:name|название)\s*[:=-]/iu.test(hotelLine)) {
    addCandidate(candidates, candidate("hotel-name", hotelLine.toUpperCase(), "high", 100));
  }

  const labelledHotelName = extractInlineValue(
    source,
    ["hotel name", "название отеля", "гостиница"],
    /[^\n]{2,120}/u,
  );
  if (labelledHotelName) {
    addCandidate(
      candidates,
      candidate("hotel-name", labelledHotelName.toUpperCase(), "high", 105),
    );
  }

  const address = extractInlineValue(
    source,
    ["address", "hotel address", "адрес отеля", "адрес"],
    /[^\n]{3,160}/u,
  );
  if (address) {
    addCandidate(candidates, candidate("hotel-address", cleanLongValue(address), "high", 100));
  }

  const postalCityCountry = source.match(
    /(?:^|\n)\s*([A-Z0-9 -]{4,10})\s+([\p{L} .'-]{2,70})\s*,\s*([\p{L} .'-]{2,70})(?:\n|$)/iu,
  );
  if (postalCityCountry) {
    addCandidate(
      candidates,
      candidate("hotel-postal-code", postalCityCountry[1]?.trim() ?? "", "high", 90),
    );
    addCandidate(
      candidates,
      candidate("hotel-city", titleCasePlace(postalCityCountry[2] ?? ""), "high", 90),
    );
    addCandidate(
      candidates,
      candidate("hotel-country", normalizeCountry(postalCityCountry[3] ?? ""), "high", 90),
    );
  }

  const checkIn = extractInlineValue(
    source,
    ["check-in", "check in", "arrival", "заезд", "дата заезда"],
    dateValuePattern,
  );
  const checkOut = extractInlineValue(
    source,
    ["check-out", "check out", "departure", "выезд", "дата выезда"],
    dateValuePattern,
  );
  if (checkIn) {
    const value = normalizeDate(checkIn);
    if (value) addCandidate(candidates, candidate("arrival-date", value, "high", 100));
  }
  if (checkOut) {
    const value = normalizeDate(checkOut);
    if (value) addCandidate(candidates, candidate("departure-date", value, "high", 100));
  }
}

function collectTravelTicketCandidates(source: string, candidates: CandidateInput[]) {
  const arrival = extractInlineValue(
    source,
    ["departure date", "flight date", "дата вылета", "вылет"],
    dateValuePattern,
  );
  const returnDate = extractInlineValue(
    source,
    ["return date", "дата возвращения", "обратно"],
    dateValuePattern,
  );
  if (arrival) {
    const value = normalizeDate(arrival);
    if (value) addCandidate(candidates, candidate("arrival-date", value, "medium", 55));
  }
  if (returnDate) {
    const value = normalizeDate(returnDate);
    if (value) addCandidate(candidates, candidate("departure-date", value, "medium", 55));
  }
}

function collectEmploymentCandidates(source: string, candidates: CandidateInput[]) {
  const employer = extractInlineValue(
    source,
    ["работодатель", "место работы", "employer", "company"],
    /[^\n]{2,160}/u,
  );
  const occupation = extractInlineValue(
    source,
    ["должность", "профессия", "position", "occupation", "job title"],
    /[^\n]{2,100}/u,
  );
  const address = extractInlineValue(
    source,
    ["адрес работодателя", "рабочий адрес", "employer address", "company address"],
    /[^\n]{3,180}/u,
  );
  const phone = extractLabeledPhone(source, [
    "телефон работодателя",
    "рабочий телефон",
    "employer phone",
    "company phone",
  ]);

  if (employer) {
    addCandidate(candidates, candidate("employer-name", employer.toUpperCase(), "high", 90));
  }
  if (occupation) {
    addCandidate(
      candidates,
      candidate("occupation", normalizeOccupation(occupation), "high", 90),
    );
  }
  if (address) {
    addCandidate(
      candidates,
      candidate("employer-address", cleanLongValue(address), "high", 90),
    );
  }
  if (phone) addCandidate(candidates, candidate("employer-contact", phone, "high", 90));
}

function collectInvitationCandidates(source: string, candidates: CandidateInput[]) {
  const hostType = /company|organization|компан|организа/iu.test(source)
    ? "Организация/компания"
    : "Приглашающее лицо";
  addCandidate(candidates, candidate("inviting-party-type", hostType, "medium", 45));

  const hostName = extractInlineValue(
    source,
    ["inviting company", "host name", "приглашающая компания", "приглашающее лицо"],
    /[^\n]{2,140}/u,
  );
  const address = extractInlineValue(
    source,
    ["inviting address", "host address", "адрес приглашающей стороны", "адрес"],
    /[^\n]{3,180}/u,
  );
  if (hostName) {
    addCandidate(candidates, candidate("hotel-name", hostName.toUpperCase(), "high", 85));
  }
  if (address) {
    addCandidate(candidates, candidate("hotel-address", cleanLongValue(address), "high", 85));
  }
}

function reviewStatus(
  candidate: SmartImportCandidate,
  currentValue: string,
  hasSourceAlternatives: boolean,
): SmartImportReviewStatus {
  if (currentValue) {
    return valuesEquivalent(candidate.fieldId, currentValue, candidate.value)
      ? "same"
      : "conflict";
  }
  if (hasSourceAlternatives) return "source_conflict";
  if (candidate.confidence === "low") return "low_confidence";
  return "new";
}

function comparableCandidateValue(fieldId: SmartImportFieldId, value: string) {
  if (fieldId === "email" || fieldId === "hotel-email") {
    return value.trim().toLowerCase();
  }
  if (
    fieldId === "contact-number" ||
    fieldId === "hotel-contact" ||
    fieldId === "employer-contact"
  ) {
    return normalizePhoneForCompare(value);
  }
  if (
    fieldId === "birth-date" ||
    fieldId === "arrival-date" ||
    fieldId === "departure-date"
  ) {
    return normalizeDate(value);
  }
  return normalizeComparable(value);
}

function packageCandidateRank(candidate: SmartImportCandidate) {
  return (
    confidenceRank(candidate.confidence) * 10_000 +
    sourceTrustRank(candidate.sourceKind, candidate.fieldId)
  );
}

function sourceTrustRank(
  sourceKind: SmartImportDocumentKind | undefined,
  fieldId: SmartImportFieldId,
) {
  if (
    sourceKind === "russian_internal_passport" &&
    fieldMetadata[fieldId].sectionId === "personal"
  ) {
    return 900;
  }
  if (
    sourceKind === "russian_registration" &&
    fieldMetadata[fieldId].sectionId === "contacts"
  ) {
    return 900;
  }
  if (
    sourceKind === "booking" &&
    (fieldMetadata[fieldId].sectionId === "hotel" ||
      fieldId === "arrival-date" ||
      fieldId === "departure-date")
  ) {
    return 800;
  }
  if (
    sourceKind === "travel_ticket" &&
    fieldMetadata[fieldId].sectionId === "trip"
  ) {
    return 800;
  }
  if (
    sourceKind === "employment" &&
    fieldMetadata[fieldId].sectionId === "employment"
  ) {
    return 800;
  }
  if (sourceKind === "invitation" && fieldMetadata[fieldId].sectionId === "hotel") {
    return 800;
  }
  if (sourceKind === "filled_form") return 500;
  if (sourceKind === "contact_note") return 400;
  if (sourceKind === "unknown") return 200;
  return 100;
}

function valuesEquivalent(fieldId: SmartImportFieldId, left: string, right: string) {
  if (fieldId === "email" || fieldId === "hotel-email") {
    return left.trim().toLowerCase() === right.trim().toLowerCase();
  }
  if (
    fieldId === "contact-number" ||
    fieldId === "hotel-contact" ||
    fieldId === "employer-contact"
  ) {
    return normalizePhoneForCompare(left) === normalizePhoneForCompare(right);
  }
  if (
    fieldId === "birth-date" ||
    fieldId === "arrival-date" ||
    fieldId === "departure-date"
  ) {
    const normalizedLeft = normalizeDate(left);
    const normalizedRight = normalizeDate(right);
    return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
  }
  return normalizeComparable(left) === normalizeComparable(right);
}

function deduplicateCandidates(candidates: CandidateInput[]): SmartImportCandidate[] {
  const byFieldId = new Map<SmartImportFieldId, CandidateInput>();
  for (const item of candidates) {
    if (!item.value.trim() || !allowedFieldIds.has(item.fieldId)) continue;
    const current = byFieldId.get(item.fieldId);
    if (!current || candidateRank(item) > candidateRank(current)) {
      byFieldId.set(item.fieldId, item);
    }
  }
  return [...byFieldId.values()]
    .map(({ priority: _priority, ...item }) => item)
    .sort((left, right) => {
      const leftIndex = smartImportFieldIds.indexOf(left.fieldId);
      const rightIndex = smartImportFieldIds.indexOf(right.fieldId);
      return leftIndex - rightIndex;
    });
}

function candidateRank(item: CandidateInput) {
  return confidenceRank(item.confidence) * 1_000 + (item.priority ?? 0);
}

function confidenceRank(confidence: SmartImportConfidence) {
  if (confidence === "high") return 3;
  if (confidence === "medium") return 2;
  return 1;
}

function addCandidate(candidates: CandidateInput[], item: CandidateInput) {
  const value = normalizeCandidateValue(item.fieldId, item.value);
  if (!value) return;
  candidates.push({ ...item, value });
}

function candidate(
  fieldId: SmartImportFieldId,
  value: string,
  confidence: SmartImportConfidence,
  priority: number,
): CandidateInput {
  return {
    confidence,
    fieldId,
    label: fieldMetadata[fieldId].label,
    priority,
    sectionId: fieldMetadata[fieldId].sectionId,
    value,
  };
}

function normalizeCandidateValue(fieldId: SmartImportFieldId, value: string) {
  const clean = cleanLongValue(value);
  if (!clean) return "";
  if (fieldId === "email" || fieldId === "hotel-email") {
    return clean.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu)?.[0]?.toLowerCase() ?? "";
  }
  if (
    fieldId === "contact-number" ||
    fieldId === "hotel-contact" ||
    fieldId === "employer-contact"
  ) {
    return normalizePhone(clean);
  }
  if (
    fieldId === "birth-date" ||
    fieldId === "arrival-date" ||
    fieldId === "departure-date"
  ) {
    return normalizeDate(clean);
  }
  if (
    fieldId === "surname" ||
    fieldId === "first-name" ||
    fieldId === "previous-surname" ||
    fieldId === "employer-name" ||
    fieldId === "hotel-name" ||
    fieldId === "occupation"
  ) {
    return clean.toUpperCase();
  }
  if (
    fieldId === "home-country" ||
    fieldId === "birth-country" ||
    fieldId === "nationality" ||
    fieldId === "hotel-country" ||
    fieldId === "main-destination" ||
    fieldId === "first-entry-country"
  ) {
    return normalizeCountry(clean);
  }
  return clean;
}

function extractRussianCity(source: string) {
  const searchable = normalizeForSearch(source);
  const known: Array<[RegExp, string]> = [
    [/санкт[ -]петербург/u, "Санкт-Петербург"],
    [/москва/u, "Москва"],
    [/казань/u, "Казань"],
    [/екатеринбург/u, "Екатеринбург"],
    [/новосибирск/u, "Новосибирск"],
    [/нижний\s+новгород/u, "Нижний Новгород"],
    [/самара/u, "Самара"],
    [/ростов[ -]на[ -]дону/u, "Ростов-на-Дону"],
  ];
  const knownCity = known.find(([pattern]) => pattern.test(searchable));
  if (knownCity) return knownCity[1];

  const match = source.match(/(?:^|[,\n])\s*г(?:ород)?[.\s]+([\p{L}-]+(?:\s+[\p{L}-]+){0,3})/iu);
  return match?.[1] ? titleCasePlace(match[1]) : "";
}

function extractRussianStreet(source: string) {
  const typeAliases: Array<[RegExp, string]> = [
    [/(?:проспект|просп\.?|пр[-\s]?т\.?)/iu, "проспект"],
    [/(?:улица|ул\.?)/iu, "улица"],
    [/(?:переулок|пер\.?)/iu, "переулок"],
    [/(?:набережная|наб\.?)/iu, "набережная"],
    [/(?:бульвар|бул\.?)/iu, "бульвар"],
    [/(?:шоссе|ш\.?)/iu, "шоссе"],
    [/(?:проезд|пр-д\.?)/iu, "проезд"],
    [/(?:площадь|пл\.?)/iu, "площадь"],
  ];

  for (const [typePattern, canonicalType] of typeAliases) {
    const afterName = source.match(
      new RegExp(
        `(?:^|[,\\n])\\s*([\\p{L}][\\p{L} .'-]{1,70}?)\\s+${typePattern.source}(?=\\s*[,\\n]|\\s+(?:д|дом)[.\\s])`,
        "iu",
      ),
    );
    if (afterName?.[1]) {
      return `${canonicalType} ${titleCasePlace(afterName[1])}`;
    }

    const beforeName = source.match(
      new RegExp(
        `(?:^|[,\\n])\\s*${typePattern.source}\\s+([\\p{L}][\\p{L} .'-]{1,70}?)(?=\\s*[,\\n]|\\s+(?:д|дом)[.\\s])`,
        "iu",
      ),
    );
    if (beforeName?.[1]) {
      return `${canonicalType} ${titleCasePlace(beforeName[1])}`;
    }
  }
  return "";
}

const nameValuePattern = /[A-ZА-ЯЁ-]{2,}/iu;
const dateValuePattern = /(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}[./-]\d{1,2}[./-]\d{1,2})/u;

function extractInlineValue(source: string, labels: string[], valuePattern: RegExp) {
  for (const label of labels) {
    const pattern = new RegExp(
      `(?:^|\\n)\\s*${escapeRegExp(label)}\\s*(?::|=|—|–|-)?\\s*(${valuePattern.source})(?=\\s*(?:\\n|$))`,
      "imu",
    );
    const match = pattern.exec(source);
    if (match?.[1]) return cleanLongValue(match[1]);
  }
  return "";
}

function extractLongInlineValue(source: string, labels: string[]) {
  const stopLabels = [
    "фамилия",
    "имя",
    "отчество",
    "пол",
    "дата рождения",
    "место рождения",
    "серия",
    "номер",
    "дата выдачи",
    "код подразделения",
  ];
  for (const label of labels) {
    const match = new RegExp(
      `(?:^|\\n)\\s*${escapeRegExp(label)}\\s*(?::|=|—|–|-)?\\s*([^\\n]{2,200})(?=\\n|$)`,
      "imu",
    ).exec(source);
    const value = match?.[1]?.trim() ?? "";
    if (!value) continue;
    const cut = stopLabels.reduce((current, stopLabel) => {
      const index = normalizeForSearch(current).indexOf(normalizeForSearch(stopLabel));
      return index > 0 ? current.slice(0, index) : current;
    }, value);
    return cleanLongValue(cut);
  }
  return "";
}

function extractLabeledPhone(source: string, labels: string[]) {
  const value = extractInlineValue(source, labels, /\+?\d[\d\s().-]{6,}\d/u);
  return normalizePhone(value);
}

function containsContactSignal(source: string) {
  return Boolean(
    source.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/iu) || findPhone(source),
  );
}

function containsHomeAddressSignal(source: string) {
  return (
    /(?:домашний\s+адрес|адрес\s+(?:проживания|регистрации)|прописка|home\s+address|residential\s+address|registration\s+address|(?:^|\n)\s*адрес\s*(?::|=|—|–|-))/iu.test(
      source,
    ) || looksLikeRussianAddress(source)
  );
}

function looksLikeRussianAddress(source: string) {
  return (
    /[А-ЯЁ]/iu.test(source) &&
    /(?:улиц|\bул\.?|проспект|просп\.?|пр[-\s]?т\.?|переул|\bпер\.?|набереж|\bнаб\.?|бульвар|\bбул\.?|шоссе|проезд|площад|\bпл\.?)/iu.test(
      source,
    ) &&
    /(?:^|[,\s])(?:д(?:ом)?|корп(?:ус)?|стр(?:оение)?|кв(?:артира)?)\.?\s*[0-9А-ЯA-Z/-]+/iu.test(
      source,
    )
  );
}

function findPhone(source: string) {
  const matches = source.match(/\+?\d[\d\s().-]{5,}\d/gu) ?? [];
  for (const match of matches) {
    if (/^\s*\d{1,4}[./-]\d{1,2}[./-]\d{1,4}\s*$/u.test(match)) continue;
    const normalized = normalizePhone(match);
    const digits = normalized.replace(/\D/gu, "");
    if (digits.length >= 7 && digits.length <= 15) return normalized;
  }
  return "";
}

function normalizePhone(value: string) {
  const clean = value.trim();
  const digits = clean.replace(/\D/gu, "");
  if (digits.length < 7 || digits.length > 15) return "";
  return clean.startsWith("+") ? `+${digits}` : digits.length === 11 ? `+${digits}` : digits;
}

function normalizePhoneForCompare(value: string) {
  let digits = value.replace(/\D/gu, "");
  if (digits.length === 11 && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  return digits;
}

function normalizeDate(value: string) {
  const clean = value.trim();
  const dotted = /(?<!\d)(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?!\d)/u.exec(clean);
  const iso = /(?<!\d)(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?!\d)/u.exec(clean);
  const rawYear = iso?.[1] ?? dotted?.[3];
  const rawMonth = iso?.[2] ?? dotted?.[2];
  const rawDay = iso?.[3] ?? dotted?.[1];
  if (!rawYear || !rawMonth || !rawDay) return "";
  const yearNumber = Number(rawYear);
  const year = rawYear.length === 2 ? (yearNumber > 40 ? 1900 + yearNumber : 2000 + yearNumber) : yearNumber;
  const month = Number(rawMonth);
  const day = Number(rawDay);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return "";
  }
  return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${year}`;
}

function normalizeMrzBirthDate(value: string) {
  if (!/^\d{6}$/u.test(value)) return "";
  const year = Number(value.slice(0, 2));
  const month = Number(value.slice(2, 4));
  const day = Number(value.slice(4, 6));
  const currentYear = new Date().getUTCFullYear() % 100;
  const fullYear = year <= currentYear ? 2000 + year : 1900 + year;
  return normalizeDate(`${day}.${month}.${fullYear}`);
}

function normalizeGender(value: string) {
  const normalized = normalizeForSearch(value);
  if (/^(?:м|муж|мужской|male|m)$/u.test(normalized.replace(/\./gu, ""))) return "Мужской";
  if (/^(?:ж|жен|женский|female|f)$/u.test(normalized.replace(/\./gu, ""))) return "Женский";
  return "";
}

function normalizeOccupation(value: string) {
  const normalized = normalizeForSearch(value);
  const aliases: Array<[RegExp, string]> = [
    [/инженер|engineer/u, "ENGINEER"],
    [/программист|developer|software/u, "IT PROFESSIONAL"],
    [/менеджер|manager/u, "MANAGER"],
    [/директор|director/u, "COMPANY DIRECTOR"],
    [/бухгалтер|accountant/u, "ACCOUNTANT"],
    [/врач|doctor/u, "DOCTOR"],
    [/учитель|преподаватель|teacher/u, "TEACHER"],
    [/студент|student/u, "STUDENT"],
    [/пенсионер|pensioner|retired/u, "PENSIONER"],
    [/предприниматель|business/u, "BUSINESSMAN"],
  ];
  return aliases.find(([pattern]) => pattern.test(normalized))?.[1] ?? cleanLongValue(value).toUpperCase();
}

function normalizeCountry(value: string) {
  const normalized = normalizeForSearch(value);
  if (/росси|russia|russian federation|\brf\b/u.test(normalized)) return "Russian Federation";
  if (/испан|spain|espana|españa/u.test(normalized)) return "Spain";
  if (/франц|france/u.test(normalized)) return "France";
  if (/герман|germany/u.test(normalized)) return "Germany";
  if (/итал|italy/u.test(normalized)) return "Italy";
  if (/португал|portugal/u.test(normalized)) return "Portugal";
  if (/ссср|ussr/u.test(normalized)) return "USSR";
  return titleCasePlace(value);
}

function titleCasePlace(value: string) {
  return cleanLongValue(value)
    .toLocaleLowerCase("ru-RU")
    .replace(/(^|[\s-])([\p{L}])/gu, (_match, prefix: string, letter: string) =>
      `${prefix}${letter.toLocaleUpperCase("ru-RU")}`,
    );
}

function normalizeComparable(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/gu, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

function normalizeForSearch(value: string) {
  return normalizeComparable(value);
}

function normalizeSourceText(value: string) {
  return value
    .normalize("NFKC")
    .replace(/\r\n?/gu, "\n")
    .replace(/[\t\f\v]+/gu, " ")
    .replace(/[ ]{2,}/gu, " ")
    .replace(/\n{3,}/gu, "\n\n")
    .trim();
}

function cleanLongValue(value: string) {
  return value
    .replace(/^\s*[-—–:=;]+\s*/u, "")
    .replace(/\s+/gu, " ")
    .replace(/[;,\s]+$/u, "")
    .trim();
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
