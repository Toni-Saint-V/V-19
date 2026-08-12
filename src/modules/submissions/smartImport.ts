import {
  findQuestionnaireDataLabelSpan,
  parseQuestionnaireDataText,
  questionnaireDataFieldIdsForExactLabel,
} from "./questionnaireDataImageExtraction";

export const smartImportDocumentKinds = [
  "mixed_package",
  "russian_registration",
  "russian_internal_passport",
  "passport_identity",
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
  inputValue?: string;
  priority?: number;
};

type SmartImportParseContext = {
  labelIdentities: Map<string, ReturnType<typeof parseQuestionnaireDataText>>;
  structuredJson?: {
    omittedCount: number;
    rows: SmartImportStructuredRow[];
    source: string;
  };
};

const allowedFieldIds = new Set<string>(smartImportFieldIds);
const supportedStructuredQuestionnaireFieldIds = new Set<string>([
  ...smartImportFieldIds,
  "home-address",
  "occupation-specify",
]);
const maxSmartImportAlternativesPerField = 5;
const maxSmartImportStructuredLabelLength = 200;
const maxSmartImportStructuredRows = 250;
const maxSmartImportStructuredValueLength = 500;
const forbiddenPassportFieldIds = new Set([
  "passport-type",
  "passport-no",
  "passport-issue-date",
  "passport-expiry-date",
  "passport-issue-country",
  "passport-issue-place",
]);
const internalPassportProposalFieldIds = new Set<SmartImportFieldId>([
  "surname",
  "first-name",
  "previous-surname",
  "birth-date",
  "birth-place",
  "birth-country",
  "nationality",
  "gender",
]);
const registrationProposalFieldIds = new Set<SmartImportFieldId>([
  "home-country",
  "home-city",
  "home-street",
  "home-house",
  "home-building",
  "home-unit",
  "postal-code",
]);

const fieldMetadata: Record<SmartImportFieldId, { label: string; sectionId: string }> =
  {
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
  passport_identity: "паспорт / документ личности",
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
  const context: SmartImportParseContext = { labelIdentities: new Map() };
  const isJsonSource = isValidStructuredJsonSource(source);
  const documentKind = classifySmartImportDocument(source, context);
  if (!source) {
    return {
      candidates: [],
      documentKind,
      summary: "Текст не найден. Попробуйте более чёткий источник.",
    };
  }

  const candidates: CandidateInput[] = [];
  collectGenericQuestionnaireCandidates(source, documentKind, candidates, context);
  if (
    !isJsonSource &&
    documentKind !== "russian_internal_passport" &&
    documentKind !== "passport_identity" &&
    documentKind !== "russian_registration" &&
    documentKind !== "employment" &&
    documentKind !== "travel_ticket"
  ) {
    collectGenericContactCandidates(source, documentKind, candidates, context);
  }
  if (
    !isJsonSource &&
    (documentKind === "filled_form" ||
      documentKind === "contact_note" ||
      documentKind === "unknown")
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

  const deduplicated = deduplicateCandidates(candidates);
  const sanitized = enforceSmartImportCrossFieldConsistency(
    deduplicated.candidates,
  ).map((item) => ({
    ...item,
    sourceKind: documentKind,
  }));
  const valuesByField = new Map<SmartImportFieldId, Set<string>>();
  for (const item of sanitized) {
    const values = valuesByField.get(item.fieldId) ?? new Set<string>();
    values.add(comparableCandidateValue(item.fieldId, item.value));
    valuesByField.set(item.fieldId, values);
  }
  const ambiguousFieldCount = [...valuesByField.values()].filter(
    (values) => values.size > 1,
  ).length;
  const omittedCount =
    deduplicated.omittedCount +
    (context.structuredJson?.source === source
      ? context.structuredJson.omittedCount
      : 0);
  return {
    candidates: sanitized,
    documentKind,
    summary: sanitized.length
      ? `Источник: ${kindLabels[documentKind]}. Найдено полей: ${valuesByField.size}.${
          ambiguousFieldCount ? ` Требуют выбора: ${ambiguousFieldCount}.` : ""
        }${omittedCount ? ` Ограничено вариантов: ${omittedCount}.` : ""}`
      : `Источник: ${kindLabels[documentKind]}. Подходящие поля не найдены.`,
  };
}

function enforceSmartImportCrossFieldConsistency(candidates: SmartImportCandidate[]) {
  const arrivals = candidates.filter((item) => item.fieldId === "arrival-date");
  const departures = candidates.filter((item) => item.fieldId === "departure-date");
  if (arrivals.length !== 1 || departures.length !== 1) {
    return arrivals.length || departures.length
      ? candidates.map((item) =>
          item.fieldId === "stay-duration"
            ? { ...item, confidence: "low" as const }
            : item,
        )
      : candidates;
  }

  const arrivalTime = questionnaireDateTimestamp(arrivals[0]?.value ?? "");
  const departureTime = questionnaireDateTimestamp(departures[0]?.value ?? "");
  if (arrivalTime === undefined || departureTime === undefined) {
    return candidates.map((item) =>
      item.fieldId === "arrival-date" ||
      item.fieldId === "departure-date" ||
      item.fieldId === "stay-duration"
        ? { ...item, confidence: "low" as const }
        : item,
    );
  }
  if (departureTime < arrivalTime) {
    return candidates.map((item) =>
      item.fieldId === "arrival-date" ||
      item.fieldId === "departure-date" ||
      item.fieldId === "stay-duration"
        ? { ...item, confidence: "low" as const }
        : item,
    );
  }

  const dayMs = 24 * 60 * 60 * 1_000;
  const stayDuration = String(Math.round((departureTime - arrivalTime) / dayMs) + 1);
  const hasCalculatedDuration = candidates.some(
    (item) =>
      item.fieldId === "stay-duration" &&
      comparableCandidateValue(item.fieldId, item.value) === stayDuration,
  );
  if (hasCalculatedDuration) return candidates;

  const confidence =
    confidenceRank(arrivals[0]?.confidence ?? "low") <=
    confidenceRank(departures[0]?.confidence ?? "low")
      ? (arrivals[0]?.confidence ?? "low")
      : (departures[0]?.confidence ?? "low");
  return [
    ...candidates,
    {
      confidence,
      fieldId: "stay-duration" as const,
      label: fieldMetadata["stay-duration"].label,
      sectionId: fieldMetadata["stay-duration"].sectionId,
      sourceKind: arrivals[0]?.sourceKind,
      value: stayDuration,
    },
  ];
}

function questionnaireDateTimestamp(value: string) {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/u.exec(value);
  if (!match) return undefined;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  return Date.UTC(year, month - 1, day);
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

  const mergedCandidates = [...byCanonicalValue.values()].sort((left, right) => {
    const fieldOrder =
      smartImportFieldIds.indexOf(left.fieldId) -
      smartImportFieldIds.indexOf(right.fieldId);
    if (fieldOrder !== 0) return fieldOrder;
    return packageCandidateRank(right) - packageCandidateRank(left);
  });
  const consistentCandidates =
    enforceSmartImportCrossFieldConsistency(mergedCandidates);
  // A package is already bounded by the caller to ten sources. Keep every
  // distinct package-level discrepancy visible so review never presents a
  // truncated set as the complete evidence.
  const candidates = consistentCandidates;
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
  const omittedCount = results.reduce(
    (total, result) => total + omittedSmartImportVariantCount(result.summary),
    0,
  );

  return {
    candidates,
    documentKind:
      results.length === 1 ? (results[0]?.documentKind ?? "unknown") : "mixed_package",
    summary: `Пакет источников: ${results.length}. Найдено полей: ${fieldCount}. Конфликтов между источниками: ${conflictCount}.${
      omittedCount ? ` Ограничено вариантов: ${omittedCount}.` : ""
    }`,
  };
}

function omittedSmartImportVariantCount(summary: string) {
  const match = /(?:^|\s)Ограничено вариантов:\s*(\d+)\./u.exec(summary);
  return match?.[1] ? Number(match[1]) : 0;
}

export function buildSmartImportReview(input: {
  currentValues: Readonly<Record<string, string | undefined>>;
  parsed: SmartImportParsedResult;
}): SmartImportReview {
  const distinctValuesByField = new Map<SmartImportFieldId, Set<string>>();
  for (const candidate of input.parsed.candidates) {
    const values = distinctValuesByField.get(candidate.fieldId) ?? new Set<string>();
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

function classifySmartImportDocument(
  source: string,
  context: SmartImportParseContext,
): SmartImportDocumentKind {
  const searchable = normalizeForSearch(source);
  if (
    /pnrus/u.test(searchable) ||
    (/российская\s+федерация/u.test(searchable) &&
      /(?:серия|код\s+подразделения|паспорт\s+выдан)/u.test(searchable))
  ) {
    return "russian_internal_passport";
  }
  if (
    /(?:passport\s+no|номер\s+паспорта)/u.test(searchable) &&
    /(?:date\s+of\s+birth|дата\s+рождения)/u.test(searchable) &&
    /(?:date\s+of\s+(?:expiry|issue)|дата\s+(?:окончания|выдачи))/u.test(searchable)
  ) {
    return "passport_identity";
  }
  if (
    /зарегистрирован(?:а|ы)?\s+по\s+месту\s+(?:жительства|пребывания)|регистраци[яи]\s+по\s+месту|снят(?:а|ы)?\s+с\s+регистрационного\s+учета/u.test(
      searchable,
    )
  ) {
    return "russian_registration";
  }
  if (isValidStructuredJsonSource(source)) {
    const jsonFieldIds = new Set(
      extractJsonQuestionnaireRows(source, context)
        .flatMap((row) => parseSmartImportStructuredRow(row, context))
        .map((field) => field.fieldId),
    );
    return jsonFieldIds.size ? "filled_form" : "unknown";
  }
  if (
    /(?:^|\n)\s*(?:маршрутн(?:ая|ой)\s+квитанц\w*|электронн(?:ый|ого)\s+билет\w*|e[ -]?ticket(?:\s+itinerary)?|itinerary\s+receipt)\b/iu.test(
      source,
    ) ||
    (/(?:^|\n)\s*(?:flight|рейс)\s*[a-zа-я0-9-]+/iu.test(source) &&
      /(?:departure\s+date|дата\s+вылета|airline|авиакомпан)/iu.test(source))
  ) {
    return "travel_ticket";
  }
  if (
    /(?:^|\n)\s*(?:(?:booking|reservation)\s+(?:confirmation|receipt|details)|подтверждение\s+бронирования)\b/iu.test(
      source,
    )
  ) {
    return "booking";
  }
  if (
    /(?:^|\n)\s*(?:справк[аи]\s+с\s+места\s+работ\w*|employment\s+(?:letter|certificate)|certificate\s+of\s+employment|company\s+letter)\b/iu.test(
      source,
    )
  ) {
    return "employment";
  }
  if (/(?:^|\n)\s*(?:приглашени\w*|invitation(?:\s+letter)?)\b/iu.test(source)) {
    return "invitation";
  }

  const labelledLineCount = source
    .split(/\n+/u)
    .filter((line) => /^.{2,70}?(?::|=|—|–)\s*.{1,}/u.test(line.trim())).length;
  const applicantIdentityLabelCount = [
    /(?:^|\n)\s*(?:фамилия|surname|family name|last name)\s*(?::|=|—|–)/iu,
    /(?:^|\n)\s*(?:имя|first name|given name)\s*(?::|=|—|–)/iu,
    /(?:^|\n)\s*(?:дата рождения|date of birth|birth date|dob)\s*(?::|=|—|–)/iu,
  ].filter((pattern) => pattern.test(source)).length;
  if (labelledLineCount >= 3 && applicantIdentityLabelCount >= 2) {
    return "filled_form";
  }
  const tabularFieldIds = new Set(
    [
      ...extractJsonQuestionnaireRows(source, context),
      ...extractTabularQuestionnaireRows(source),
      ...extractVerticalDelimitedQuestionnaireRows(source, context),
      ...extractHorizontalDelimitedQuestionnaireRows(source, context),
      ...extractInlineQuestionnaireRows(source, context),
      ...extractImplicitQuestionnaireRows(source, context),
      ...extractCollapsedQuestionnaireRows(source, context),
      ...extractLabelValueBlockRows(source, context),
    ]
      .flatMap((row) => parseSmartImportStructuredRow(row, context))
      .map((field) => field.fieldId),
  );
  if (
    tabularFieldIds.size >= 3 &&
    ["surname", "first-name", "birth-date"].filter((fieldId) =>
      tabularFieldIds.has(fieldId),
    ).length >= 2
  ) {
    return "filled_form";
  }
  if (hasPositiveAccommodationEvidence(source)) {
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
  context: SmartImportParseContext,
) {
  const sourceNegatesAccommodation = hasNegatedAccommodationSource(source);
  const jsonRows = extractJsonQuestionnaireRows(source, context);
  const isJsonSource = isValidStructuredJsonSource(source);
  const parsedFields = [
    ...(isJsonSource
      ? []
      : boundedExplicitQuestionnaireLines(source).flatMap((line) =>
          explicitLineStartsWithNestedQuestionnaireLabel(line, context)
            ? []
            : parseQuestionnaireDataText(line),
        )),
    ...jsonRows.flatMap((row) =>
      parseSmartImportStructuredRow(row, context).filter(
        (field) => !row.allowedFieldIds || row.allowedFieldIds.includes(field.fieldId),
      ),
    ),
    ...(isJsonSource
      ? []
      : [
          ...extractTabularQuestionnaireRows(source),
          ...extractVerticalDelimitedQuestionnaireRows(source, context),
          ...extractHorizontalDelimitedQuestionnaireRows(source, context),
          ...extractInlineQuestionnaireRows(source, context),
          ...extractImplicitQuestionnaireRows(source, context),
          ...extractCollapsedQuestionnaireRows(source, context),
          ...extractLabelValueBlockRows(source, context),
        ].flatMap((row) => parseSmartImportStructuredRow(row, context))),
  ];
  for (const parsedField of parsedFields) {
    if (forbiddenPassportFieldIds.has(parsedField.fieldId)) continue;
    if (parsedField.fieldId === "home-address") {
      if (
        documentKind !== "russian_registration" &&
        documentKind !== "filled_form" &&
        documentKind !== "contact_note" &&
        documentKind !== "unknown"
      ) {
        continue;
      }
      collectRussianHomeAddressParts(parsedField.rawValue, candidates, {
        confidence: parsedField.confidence,
        forceRussianCountry: documentKind === "russian_registration",
        priority: parsedField.confidence === "high" ? 40 : 25,
        requireRussianSignal: true,
      });
      continue;
    }
    if (
      !isAddressLikeSmartImportField(parsedField.fieldId) &&
      valueStartsWithDifferentQuestionnaireLabel(
        parsedField.rawValue,
        parsedField.fieldId,
        context,
      )
    ) {
      continue;
    }
    if (
      parsedField.fieldId === "birth-date" &&
      normalizeForSearch(parsedField.label) === "date"
    ) {
      continue;
    }

    const sourceFieldId = parsedField.fieldId;
    const value =
      sourceFieldId === "occupation-specify"
        ? normalizeOccupation(parsedField.value)
        : parsedField.value;
    const canonicalFieldId =
      sourceFieldId === "occupation-specify" ? "occupation" : sourceFieldId;

    if (
      (canonicalFieldId === "email" || canonicalFieldId === "contact-number") &&
      parsedField.confidence !== "high"
    ) {
      const rawIndex = source.indexOf(parsedField.rawValue);
      const sourceLine = rawIndex >= 0 ? sourceLineAt(source, rawIndex) : "";
      if (
        sourceLine &&
        !isContactLineCompatibleWithDocument(sourceLine, documentKind)
      ) {
        continue;
      }
    }

    const adaptedFieldId = adaptGenericFieldForDocumentKind(
      canonicalFieldId,
      parsedField.label,
      documentKind,
    );
    if (!adaptedFieldId) continue;
    if (
      (adaptedFieldId === "hotel-name" || adaptedFieldId === "employer-name") &&
      (isNamedEntityMetadataLabel(parsedField.label) ||
        isNamedEntityMetadataValue(parsedField.rawValue))
    ) {
      continue;
    }
    if (
      adaptedFieldId === "hotel-name" &&
      /^(?:hotel|hostel|отель|гостиница)$/u.test(
        normalizeForSearch(parsedField.label),
      ) &&
      /^(?:address|phone|telephone|contact|email|e mail|city|country|postal|postcode|zip|адрес|телефон|контакт|почта|город|страна|индекс)(?:\s|$)/u.test(
        normalizeForSearch(parsedField.rawValue),
      )
    ) {
      continue;
    }
    if (
      (adaptedFieldId === "inviting-party-type" ||
        adaptedFieldId.startsWith("hotel-")) &&
      isNegatedAccommodationEvidence(parsedField.label, parsedField.rawValue)
    ) {
      continue;
    }
    if (
      (documentKind === "russian_internal_passport" ||
        documentKind === "passport_identity") &&
      !internalPassportProposalFieldIds.has(adaptedFieldId)
    ) {
      continue;
    }
    if (
      documentKind === "russian_registration" &&
      !registrationProposalFieldIds.has(adaptedFieldId)
    ) {
      continue;
    }

    const normalizedRoleLabel = normalizeForSearch(parsedField.label);
    const contactRoleIsExplicit =
      /(?:hotel|hostel|property|accommodation|host|отел|гостиниц|жиль|принимающ|приглашающ)/u.test(
        normalizedRoleLabel,
      );
    const roleAmbiguousContact =
      (documentKind === "booking" || documentKind === "invitation") &&
      (adaptedFieldId === "hotel-email" || adaptedFieldId === "hotel-contact") &&
      !contactRoleIsExplicit;
    const orderAmbiguousEnglishFullName =
      (adaptedFieldId === "surname" || adaptedFieldId === "first-name") &&
      /(?:^|\s)full name$/u.test(normalizedRoleLabel) &&
      !/,/u.test(parsedField.rawValue);
    const contradictsSourceNegation =
      sourceNegatesAccommodation &&
      (adaptedFieldId === "inviting-party-type" || adaptedFieldId.startsWith("hotel-"));

    const boundedRawValue = valueBeforeNestedNonDataIdentifierLabel(
      parsedField.rawValue,
    );
    if (!boundedRawValue) continue;
    const expandedValues = extractSmartImportAlternatives(
      adaptedFieldId,
      boundedRawValue,
    );
    const hasExplicitAlternatives = hasSmartImportAlternativeSyntax(
      boundedRawValue,
      adaptedFieldId,
    );
    if (
      !expandedValues.length &&
      hasExplicitAlternatives &&
      isSingleChoiceSmartImportField(adaptedFieldId)
    ) {
      continue;
    }
    if (
      expandedValues.length > 1 ||
      (expandedValues.length === 1 && hasExplicitAlternatives)
    ) {
      for (const expandedValue of expandedValues) {
        addCandidate(candidates, {
          confidence:
            roleAmbiguousContact ||
            orderAmbiguousEnglishFullName ||
            contradictsSourceNegation ||
            expandedValues.length === 1
              ? "low"
              : parsedField.confidence,
          fieldId: adaptedFieldId,
          inputValue: expandedValue,
          label: fieldMetadata[adaptedFieldId].label,
          priority: parsedField.confidence === "high" ? 40 : 25,
          sectionId: fieldMetadata[adaptedFieldId].sectionId,
          value: expandedValue,
        });
      }
      continue;
    }

    addCandidate(candidates, {
      confidence:
        roleAmbiguousContact ||
        orderAmbiguousEnglishFullName ||
        contradictsSourceNegation
          ? "low"
          : parsedField.confidence,
      fieldId: adaptedFieldId,
      inputValue: boundedRawValue,
      label: fieldMetadata[adaptedFieldId].label,
      priority: parsedField.confidence === "high" ? 40 : 25,
      sectionId: fieldMetadata[adaptedFieldId].sectionId,
      value:
        boundedRawValue === parsedField.rawValue
          ? value
          : sourceFieldId === "occupation-specify"
            ? normalizeOccupation(boundedRawValue)
            : boundedRawValue,
    });
  }
}

function isAddressLikeSmartImportField(fieldId: string) {
  return (
    fieldId === "home-address" ||
    fieldId === "home-street" ||
    fieldId === "employer-address" ||
    fieldId === "hotel-address"
  );
}

function extractSmartImportAlternatives(fieldId: SmartImportFieldId, rawValue: string) {
  const countryField = isSmartImportCountryField(fieldId);
  const segments = countryField
    ? splitSmartImportCountryAlternativeSegments(rawValue)
    : splitSmartImportAlternativeSegments(rawValue);
  if (fieldId === "email" || fieldId === "hotel-email") {
    return distinctNonEmptyValues(
      [
        ...rawValue.matchAll(
          /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Z0-9.-]{1,253}\.[A-Z]{2,63}/giu,
        ),
      ].map((match) => normalizeEmail(match[0] ?? "")),
    );
  }
  if (
    fieldId === "birth-date" ||
    fieldId === "arrival-date" ||
    fieldId === "departure-date"
  ) {
    const dateSegments = rawValue
      .split(/\s+(?:or|или)\s+|\s*[;|]\s*|\s*\/\s*/iu)
      .map((segment) => segment.trim())
      .filter(Boolean);
    return distinctNonEmptyValues([
      ...[
        ...rawValue.matchAll(
          /(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}[./-]\d{1,2}[./-]\d{1,2})/gu,
        ),
      ].map((match) => normalizeDate(match[0] ?? "", fieldId)),
      ...dateSegments.map((segment) => normalizeDate(segment, fieldId)),
    ]);
  }
  if (
    fieldId === "contact-number" ||
    fieldId === "hotel-contact" ||
    fieldId === "employer-contact"
  ) {
    const phoneSegments = rawValue
      .split(/\s*(?:\/|[;,|])\s*|\s+(?:or|или)\s+/iu)
      .map((segment) => segment.trim())
      .filter(Boolean);
    return distinctNonEmptyValues(
      phoneSegments.map((segment) => normalizePhone(segment)),
    );
  }
  if (isFreeTextAlternativeField(fieldId)) {
    const freeTextSegments = splitFreeTextAlternativeSegments(rawValue);
    if (freeTextSegments.length < 2) return [];
    return distinctNonEmptyValues(
      freeTextSegments.map((segment) =>
        fieldId === "employer-name" || fieldId === "hotel-name"
          ? normalizeNamedEntity(segment)
          : normalizePersonalName(segment),
      ),
    );
  }
  if (segments.length < 2) return [];

  const normalizeSegment = (segment: string) => {
    if (fieldId === "purpose") return normalizePurpose(segment);
    if (fieldId === "marital-status") return normalizeMaritalStatus(segment);
    if (fieldId === "entry-count") return normalizeEntryCount(segment);
    if (fieldId === "inviting-party-type") {
      return normalizeInvitingPartyType(segment);
    }
    if (fieldId === "cost-covered-by") return normalizeCostCoveredBy(segment);
    if (countryField) return normalizeCountry(segment);
    return "";
  };
  return distinctNonEmptyValues(segments.map(normalizeSegment));
}

function isFreeTextAlternativeField(fieldId: SmartImportFieldId) {
  return (
    fieldId === "surname" ||
    fieldId === "first-name" ||
    fieldId === "previous-surname" ||
    fieldId === "employer-name" ||
    fieldId === "hotel-name"
  );
}

function splitFreeTextAlternativeSegments(rawValue: string) {
  return rawValue
    .split(/\s+(?:or|или)\s+/iu)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function splitSmartImportAlternativeSegments(rawValue: string) {
  return rawValue
    .split(/\s+(?:or|или|and|и)\s+|\s*[,;|]\s*|(?<!\d)\s*\/\s*(?!\d)/iu)
    .map((segment) => segment.trim())
    .filter(Boolean);
}

function splitSmartImportCountryAlternativeSegments(rawValue: string) {
  const segments = rawValue
    .split(/\s+(?:or|или)\s+|\s*[;|]\s*|(?<!\d)\s*\/\s*(?!\d)/iu)
    .map((segment) => segment.trim())
    .filter(Boolean);
  if (
    segments.length === 1 &&
    rawValue.includes(",") &&
    !isOfficialCommaCountryName(rawValue)
  ) {
    return rawValue
      .split(/\s*,\s*/u)
      .map((segment) => segment.trim())
      .filter(Boolean);
  }
  return segments;
}

function hasSmartImportAlternativeSyntax(
  rawValue: string,
  fieldId?: SmartImportFieldId,
) {
  if (fieldId === "inviting-party-type" && normalizeInvitingPartyType(rawValue)) {
    return false;
  }
  if (fieldId && isSmartImportCountryField(fieldId)) {
    return (
      /\s+(?:or|или)\s+|[;|]|(?<!\d)\s*\/\s*(?!\d)/iu.test(rawValue) ||
      (rawValue.includes(",") && !isOfficialCommaCountryName(rawValue))
    );
  }
  if (
    fieldId === "birth-date" ||
    fieldId === "arrival-date" ||
    fieldId === "departure-date"
  ) {
    return (
      /\s+(?:or|или)\s+|[;|]/iu.test(rawValue) ||
      /\p{L}[^/]*\/[^/]*\p{L}/iu.test(rawValue)
    );
  }
  if (
    fieldId === "contact-number" ||
    fieldId === "hotel-contact" ||
    fieldId === "employer-contact"
  ) {
    return /\s+(?:or|или)\s+|[,;|/]/iu.test(rawValue);
  }
  return /\s+(?:or|или|and|и)\s+|[,;|]|(?<!\d)\s*\/\s*(?!\d)/iu.test(rawValue);
}

function isSmartImportCountryField(fieldId: SmartImportFieldId) {
  return (
    fieldId === "nationality" ||
    fieldId === "home-country" ||
    fieldId === "birth-country" ||
    fieldId === "hotel-country" ||
    fieldId === "main-destination" ||
    fieldId === "first-entry-country"
  );
}

function isOfficialCommaCountryName(value: string) {
  return /^(?:bolivia plurinational state of|congo democratic republic of(?: the)?|iran islamic republic of|korea republic of|micronesia federated states of|moldova republic of|palestine state of|tanzania united republic of|venezuela bolivarian republic of)$/u.test(
    normalizeForSearch(value),
  );
}

function isSingleChoiceSmartImportField(fieldId: SmartImportFieldId) {
  return (
    isSmartImportCountryField(fieldId) ||
    fieldId === "gender" ||
    fieldId === "marital-status" ||
    fieldId === "purpose" ||
    fieldId === "entry-count" ||
    fieldId === "inviting-party-type" ||
    fieldId === "cost-covered-by" ||
    fieldId === "means-of-support"
  );
}

function distinctNonEmptyValues(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function boundedExplicitQuestionnaireLines(source: string) {
  const selected: string[] = [];
  const countByLabel = new Map<string, number>();
  for (const rawLine of source.split(/\n+/u)) {
    if (
      rawLine.length >
      maxSmartImportStructuredLabelLength + maxSmartImportStructuredValueLength + 10
    ) {
      continue;
    }
    const line = rawLine.trim();
    const match = /^\s*([^:=—–]{2,90}?)\s*(?::|=|—|–)\s*(.+?)\s*$/u.exec(line);
    const label = match?.[1] ?? "";
    if (!label || !mayContainQuestionnaireLabel(label)) continue;
    const labelKey = normalizeForSearch(label);
    const count = countByLabel.get(labelKey) ?? 0;
    if (count > maxSmartImportAlternativesPerField) continue;
    selected.push(line);
    countByLabel.set(labelKey, count + 1);
    if (selected.length >= maxSmartImportStructuredRows) break;
  }
  return selected;
}

function valueStartsWithDifferentQuestionnaireLabel(
  value: string,
  expectedFieldId: string,
  context: SmartImportParseContext,
) {
  const explicit = /^\s*([^:=—–]{2,90}?)\s*(?::|=|—|–)\s*(.+?)\s*$/u.exec(value);
  const row = explicit?.[1]
    ? { label: explicit[1], value: explicit[2] ?? "" }
    : extractImplicitQuestionnaireRows(value, context)[0];
  const fieldIds = row
    ? questionnaireFieldIdentitiesForLabel(row.label, context).map(
        (field) => field.fieldId,
      )
    : [];
  if (row && isForbiddenPassportQuestionnaireLabel(row.label)) return true;
  if (!fieldIds.length && startsWithNonPhoneIdentifierLabel(value)) return true;
  return fieldIds.length > 0 && !fieldIds.includes(expectedFieldId);
}

function explicitLineStartsWithNestedQuestionnaireLabel(
  line: string,
  context: SmartImportParseContext,
) {
  const outer = /^\s*([^:=—–]{2,90}?)\s*(?::|=|—|–)\s*(.+?)\s*$/u.exec(line);
  const value = outer?.[2] ?? "";
  if (!value) return false;
  const nested = /^\s*([^:=—–]{2,90}?)\s*(?::|=|—|–)\s*(.+?)\s*$/u.exec(value);
  const row = nested?.[1]
    ? { label: nested[1], value: nested[2] ?? "" }
    : extractImplicitQuestionnaireRows(value, context)[0];
  return Boolean(
    (row &&
      (isForbiddenPassportQuestionnaireLabel(row.label) ||
        questionnaireFieldIdentitiesForLabel(row.label, context).length > 0)) ||
    startsWithNonPhoneIdentifierLabel(value),
  );
}

function isForbiddenPassportQuestionnaireLabel(label: string) {
  return questionnaireDataFieldIdsForExactLabel(label).some((fieldId) =>
    forbiddenPassportFieldIds.has(fieldId),
  );
}

function startsWithNonPhoneIdentifierLabel(value: string) {
  const passportLabel = findQuestionnaireDataLabelSpan(
    value,
    forbiddenPassportFieldIds,
  );
  if (passportLabel?.start === 0) return true;
  const genericIdentifier = genericNonDataIdentifierLabelPattern.exec(value);
  return Boolean(
    genericIdentifier && value.slice(0, genericIdentifier.index).trim().length === 0,
  );
}

function valueBeforeNestedNonDataIdentifierLabel(value: string) {
  const passportLabel = findQuestionnaireDataLabelSpan(
    value,
    forbiddenPassportFieldIds,
  );
  const genericIdentifier = genericNonDataIdentifierLabelPattern.exec(value);
  const genericStart = genericIdentifier?.index;
  const cutAt = [passportLabel?.start, genericStart]
    .filter((index): index is number => index !== undefined)
    .sort((left, right) => left - right)[0];
  return cutAt === undefined ? value.trim() : value.slice(0, cutAt).trim();
}

const genericNonDataIdentifierLabelPattern =
  /(?:^|[\s,;])(?:(?:reservation|booking|confirmation|order|reference|application)\s*(?:id|no|number)|identity\s+card\s+(?:id|no|number)|national\s+(?:id|identity\s+card)\s*(?:id|no|number)?|(?:personal\s+)?identification\s+(?:id|no|number)|document\s+(?:id|no|number)|id(?:\s+card)?\s+(?:no|number)|mrz|pnrus|номер\s+(?:брони|бронирования|заказа|заявки|проездного\s+документа|документа|удостоверения\s+личности)|удостоверени\p{L}*\s+личности\s+(?:номер|серия)|идентификационн\p{L}*\s+номер|код\s+брони)(?=\s*(?::|=|—|–|-)?\s*\S|$)/iu;

type SmartImportStructuredRow = {
  allowedFieldIds?: readonly string[];
  confidence: SmartImportConfidence;
  label: string;
  value: string;
};

function isValidStructuredJsonSource(source: string) {
  const trimmed = source.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
    return false;
  }
  try {
    JSON.parse(trimmed);
    return true;
  } catch {
    return false;
  }
}

function isSafeStructuredJsonPath(path: string[]) {
  const segments = path
    .map((segment) => normalizeForSearch(humanizeStructuredLabel(segment)))
    .filter(Boolean);
  if (!segments.length) return false;
  if (segments.length === 1) return true;

  const ancestors = segments.slice(0, -1);
  const domainIndex = ancestors.findIndex(
    (segment) =>
      isStructuredAccommodationPathSegment(segment) ||
      isStructuredEmployerPathSegment(segment),
  );
  if (domainIndex >= 0) {
    const domain = isStructuredAccommodationPathSegment(ancestors[domainIndex] ?? "")
      ? "accommodation"
      : "employer";
    const prefixIsSafe = ancestors
      .slice(0, domainIndex)
      .every(isStructuredSafePrefixSegment);
    if (!prefixIsSafe) return false;
    return ancestors.slice(domainIndex + 1).every((segment) => {
      if (isStructuredContainerPathSegment(segment)) return true;
      return domain === "accommodation"
        ? isStructuredAccommodationPathSegment(segment)
        : isStructuredEmployerPathSegment(segment);
    });
  }

  const homeIndex = ancestors.findIndex(isStructuredHomePathSegment);
  if (homeIndex >= 0) {
    const prefixIsSafe = ancestors
      .slice(0, homeIndex)
      .every(isStructuredSafePrefixSegment);
    if (!prefixIsSafe) return false;
    return ancestors
      .slice(homeIndex + 1)
      .every(
        (segment) =>
          isStructuredContainerPathSegment(segment) ||
          isStructuredHomePathSegment(segment),
      );
  }

  return ancestors.every(isStructuredSafePrefixSegment);
}

function isStructuredSafePrefixSegment(segment: string) {
  return (
    isStructuredNeutralPathSegment(segment) || isStructuredContainerPathSegment(segment)
  );
}

function isStructuredAccommodationPathSegment(segment: string) {
  return /^(?:property|accommodation|lodging|hotel|hostel|host|host company|host organization|host organisation|host person|inviting|inviting company|inviting organization|inviting organisation|inviting person|inviting party|отел\p{L}*|гостиниц\p{L}*|жиль\p{L}*|принимающ\p{L}*(?:\s+(?:компани\p{L}*|организаци\p{L}*|лиц\p{L}*|сторон\p{L}*))?|приглашающ\p{L}*(?:\s+(?:компани\p{L}*|организаци\p{L}*|лиц\p{L}*|сторон\p{L}*))?)$/u.test(
    segment,
  );
}

function isStructuredEmployerPathSegment(segment: string) {
  return /^(?:employer|workplace|company|work|office|school|university|работодател\p{L}*|место работы|компани\p{L}*|работ\p{L}*|офис\p{L}*|школ\p{L}*|университет\p{L}*)$/u.test(
    segment,
  );
}

function isStructuredHomePathSegment(segment: string) {
  return /^(?:home|home address|residence|residential|residential address|address|домашн\p{L}* адрес|адрес|адрес проживания|место жительства|проживани\p{L}*)$/u.test(
    segment,
  );
}

function isStructuredNeutralPathSegment(segment: string) {
  return /^(?:booking|reservation|invitation|application|submission|applicant|guest|travell?er|passenger|person|personal|personal info|identity|profile|questionnaire|form|document|travel|trip|employment|contact|data|payload|result|results|responses?|content|body|input|output|ocr|extraction|fields?|field values|values|records?|бронировани\p{L}*|брон\p{L}*|приглашени\p{L}*|заявлени\p{L}*|подач\p{L}*|заявител\p{L}*|гост\p{L}*|путешественник\p{L}*|пассажир\p{L}*|лиц\p{L}*|личн\p{L}*(?:\s+данн\p{L}*)?|профил\p{L}*|анкет\p{L}*|форм\p{L}*|документ\p{L}*|поездк\p{L}*|работ\p{L}*|контакт\p{L}*|данн\p{L}*|результат\p{L}*|ответ\p{L}*|содержим\p{L}*|ввод\p{L}*|вывод\p{L}*|извлечени\p{L}*|пол\p{L}*|значени\p{L}*|запис\p{L}*)$/u.test(
    segment,
  );
}

function isStructuredContainerPathSegment(segment: string) {
  return /^(?:address|contact|fields?|attributes|data|details|personal info|values|адрес|контакт\p{L}*|пол\p{L}*|атрибут\p{L}*|данн\p{L}*|детал\p{L}*|личн\p{L}* данн\p{L}*|значени\p{L}*)$/u.test(
    segment,
  );
}

function isStructuredJsonFieldPathAllowed(path: string[], fieldId: string) {
  const normalizedPath = path
    .map((segment) => normalizeForSearch(humanizeStructuredLabel(segment)))
    .filter(Boolean);
  const normalizedLeaf = normalizedPath.at(-1) ?? "";
  const normalizedAncestors = normalizedPath.slice(0, -1);
  const normalizedLabel = normalizeForSearch(
    path.map(humanizeStructuredLabel).join(" "),
  );
  if (
    !isExactDirectStructuredJsonFieldLabel(normalizedLeaf, fieldId) &&
    !isStructuredJsonRoleLeafAllowed(normalizedAncestors, normalizedLeaf, fieldId)
  ) {
    return false;
  }
  const serviceRole = hasStructuredServiceRole(normalizedLabel);
  if (serviceRole) return false;

  const explicitAccommodationCompany =
    /(?:^|\s)(?:host|inviting|принимающ\p{L}*|приглашающ\p{L}*)\s+(?:company|organization|organisation|компани\p{L}*|организаци\p{L}*)(?:\s|$)/u.test(
      normalizedLabel,
    );
  const accommodationRole =
    hasStructuredAccommodationRole(normalizedLabel) ||
    /(?:^|\s)(?:booking|reservation|invitation|бронировани\p{L}*|брон\p{L}*|приглашени\p{L}*)(?:\s|$)/u.test(
      normalizedLabel,
    );
  const employerRole =
    !explicitAccommodationCompany &&
    (hasStructuredEmployerRole(normalizedLabel) ||
      /(?:^|\s)(?:employment|трудоустройств\p{L}*)(?:\s|$)/u.test(normalizedLabel));
  const applicantRole =
    /(?:^|\s)(?:applicant|guest|travell?er|passenger|заявител\p{L}*|гост\p{L}*|путешественник\p{L}*|пассажир\p{L}*)(?:\s|$)/u.test(
      normalizedLabel,
    );
  const subordinateRole =
    hasStructuredNestedSubordinateRole(normalizedLabel) ||
    (accommodationRole && hasStructuredNestedPersonRole(normalizedLabel)) ||
    (employerRole && hasStructuredNestedContactPersonRole(normalizedLabel)) ||
    /(?:^|\s)(?:contact|representative|контакт\p{L}*|представител\p{L}*)\s+(?:name|position|title|имя|название|должност\p{L}*)(?:\s|$)/u.test(
      normalizedLabel,
    ) ||
    (accommodationRole &&
      /(?:^|\s)(?:invitation|приглашени\p{L}*)\s+(?:person|лиц\p{L}*)(?:\s|$)/u.test(
        normalizedLabel,
      ));

  if (accommodationRole && employerRole) return false;
  if (accommodationRole) {
    if (applicantRole || subordinateRole) return false;
    return isStructuredAccommodationFieldPathCompatible(normalizedLabel, fieldId);
  }
  if (employerRole) {
    if (subordinateRole) return false;
    return isStructuredEmployerFieldPathCompatible(normalizedLabel, fieldId);
  }

  const explicitHomeRole =
    /^(?:home|residence|residential|address)(?:\s|$)/u.test(normalizedLabel) ||
    /(?:^|\s)applicant\b[^\n]*\baddress(?:\s|$)/u.test(normalizedLabel);
  if (explicitHomeRole) {
    return /^(?:home-address|home-country|home-city|home-street|home-house|home-building|home-unit|postal-code)$/u.test(
      fieldId,
    );
  }

  if (applicantRole) {
    return !(
      fieldId === "inviting-party-type" ||
      fieldId.startsWith("hotel-") ||
      fieldId.startsWith("employer-")
    );
  }
  return true;
}

function isStructuredJsonRoleLeafAllowed(
  normalizedAncestors: string[],
  normalizedLeaf: string,
  fieldId: string,
) {
  if (
    normalizedAncestors.some(isStructuredAccommodationPathSegment) &&
    isStructuredAccommodationFieldLeafCompatible(normalizedLeaf, fieldId)
  ) {
    return true;
  }
  if (
    normalizedAncestors.some(isStructuredEmployerPathSegment) &&
    isStructuredEmployerFieldLeafCompatible(normalizedLeaf, fieldId)
  ) {
    return true;
  }
  return (
    normalizedAncestors.some(
      (segment) =>
        isStructuredHomePathSegment(segment) ||
        /^(?:applicant|guest|travell?er|passenger|заявител\p{L}*|гост\p{L}*|путешественник\p{L}*|пассажир\p{L}*)$/u.test(
          segment,
        ),
    ) && isStructuredHomeFieldLeafCompatible(normalizedLeaf, fieldId)
  );
}

function isStructuredAccommodationFieldLeafCompatible(
  normalizedLeaf: string,
  fieldId: string,
) {
  const leafByField: Partial<Record<string, RegExp>> = {
    "hotel-address": /^(?:address|адрес)$/u,
    "hotel-city": /^(?:city|город)$/u,
    "hotel-contact": /^(?:phone|telephone|contact|телефон|контакт)$/u,
    "hotel-country": /^(?:country|страна)$/u,
    "hotel-email": /^(?:email|e mail|электронная почта|почта)$/u,
    "hotel-name": /^(?:name|название|наименование|имя)$/u,
    "hotel-postal-code": /^(?:postal code|postcode|zip|почтовый индекс|индекс)$/u,
  };
  return leafByField[fieldId]?.test(normalizedLeaf) ?? false;
}

function isStructuredEmployerFieldLeafCompatible(
  normalizedLeaf: string,
  fieldId: string,
) {
  const leafByField: Partial<Record<string, RegExp>> = {
    "employer-address": /^(?:address|адрес)$/u,
    "employer-contact": /^(?:phone|telephone|contact|телефон|контакт)$/u,
    "employer-name": /^(?:name|название|наименование)$/u,
    occupation: /^(?:position|occupation|job title|должность|профессия)$/u,
  };
  return leafByField[fieldId]?.test(normalizedLeaf) ?? false;
}

function isStructuredHomeFieldLeafCompatible(normalizedLeaf: string, fieldId: string) {
  const leafByField: Partial<Record<string, RegExp>> = {
    "home-address": /^(?:address|адрес)$/u,
    "home-building": /^(?:building|structure|корпус|строение)$/u,
    "home-city": /^(?:city|город)$/u,
    "home-country": /^(?:country|страна)$/u,
    "home-house": /^(?:house|house number|дом|номер дома)$/u,
    "home-street": /^(?:street|улица)$/u,
    "home-unit": /^(?:apartment|flat|unit|квартира)$/u,
    "postal-code": /^(?:postal code|postcode|zip|почтовый индекс|индекс)$/u,
  };
  return leafByField[fieldId]?.test(normalizedLeaf) ?? false;
}

function isExactDirectStructuredJsonFieldLabel(
  normalizedLabel: string,
  fieldId: string,
) {
  if (!normalizedLabel) return false;
  if (normalizeForSearch(humanizeStructuredLabel(fieldId)) === normalizedLabel) {
    return true;
  }
  if (questionnaireDataFieldIdsForExactLabel(normalizedLabel).includes(fieldId)) {
    return true;
  }
  if (
    (fieldId === "surname" || fieldId === "first-name") &&
    /^(?:full name|фио)$/u.test(normalizedLabel)
  ) {
    return true;
  }
  const directAddressComponentLabels: Partial<Record<string, RegExp>> = {
    "home-building": /^(?:building|structure|корпус|строение)$/u,
    "home-house": /^(?:house|house number|дом|номер дома)$/u,
    "home-street": /^(?:street|улица)$/u,
    "home-unit": /^(?:apartment|flat|unit|квартира)$/u,
  };
  return directAddressComponentLabels[fieldId]?.test(normalizedLabel) ?? false;
}

function isStructuredAccommodationFieldPathCompatible(
  normalizedLabel: string,
  fieldId: string,
) {
  const suffixByField: Partial<Record<SmartImportFieldId, RegExp>> = {
    "hotel-address": /(?:^|\s)(?:address|адрес)$/u,
    "hotel-city": /(?:^|\s)(?:city|город)$/u,
    "hotel-contact": /(?:^|\s)(?:phone|telephone|contact|телефон|контакт)$/u,
    "hotel-country": /(?:^|\s)(?:country|страна)$/u,
    "hotel-email": /(?:^|\s)(?:email|e mail|электронная почта|почта)$/u,
    "hotel-name": /(?:^|\s)(?:name|название|наименование|имя)$/u,
    "hotel-postal-code":
      /(?:^|\s)(?:postal code|postcode|zip|почтовый индекс|индекс)$/u,
    "inviting-party-type": /(?:^|\s)(?:inviting party type|тип принимающей стороны)$/u,
  };
  return suffixByField[fieldId as SmartImportFieldId]?.test(normalizedLabel) ?? false;
}

function isStructuredEmployerFieldPathCompatible(
  normalizedLabel: string,
  fieldId: string,
) {
  const suffixByField: Partial<Record<SmartImportFieldId, RegExp>> = {
    "employer-address": /(?:^|\s)(?:address|адрес)$/u,
    "employer-contact": /(?:^|\s)(?:phone|telephone|contact|телефон|контакт)$/u,
    "employer-name":
      /(?:^|\s)(?:name|название|наименование|employer|workplace|company|school|university|работодател\p{L}*|место работы|компани\p{L}*|школ\p{L}*|университет\p{L}*)$/u,
    occupation: /(?:^|\s)(?:position|occupation|job title|должность|профессия)$/u,
  };
  return suffixByField[fieldId as SmartImportFieldId]?.test(normalizedLabel) ?? false;
}

function extractJsonQuestionnaireRows(
  source: string,
  context: SmartImportParseContext,
): SmartImportStructuredRow[] {
  if (context.structuredJson?.source === source) {
    return context.structuredJson.rows;
  }
  const trimmed = source.trim();
  if (!trimmed || (!trimmed.startsWith("{") && !trimmed.startsWith("["))) {
    return [];
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(trimmed);
  } catch {
    return [];
  }

  const rows: SmartImportStructuredRow[] = [];
  const countByField = new Map<string, number>();
  const seenStructuredEvidence = new Set<string>();
  let omittedCount = 0;
  const pushPrimitive = (
    label: string,
    value: string | number,
    structuredPath: string[],
  ) => {
    if (!isSafeStructuredJsonPath(structuredPath)) return false;
    const structuredLabel = humanizeStructuredLabel(label);
    const primitive = String(value);
    if (
      !primitive.trim() ||
      !mayContainQuestionnaireLabel(structuredLabel) ||
      structuredLabel.length > maxSmartImportStructuredLabelLength ||
      primitive.length > maxSmartImportStructuredValueLength ||
      (typeof value === "number" &&
        (!Number.isSafeInteger(value) ||
          value <= 0 ||
          !isNumericCompatibleJsonLabel(structuredLabel)))
    ) {
      return false;
    }
    const recognizedFields = parseSmartImportStructuredRow(
      { confidence: "high", label: structuredLabel, value: primitive },
      context,
    );
    const structuredFieldIds = distinctNonEmptyValues(
      recognizedFields
        .filter(
          (field) =>
            supportedStructuredQuestionnaireFieldIds.has(field.fieldId) &&
            !forbiddenPassportFieldIds.has(field.fieldId) &&
            isStructuredJsonFieldPathAllowed(structuredPath, field.fieldId),
        )
        .map((field) => field.fieldId),
    );
    if (!structuredFieldIds.length) {
      return false;
    }
    const validatedValuesByField = new Map<string, string>();
    for (const fieldId of structuredFieldIds) {
      const validatedValue = validatedStructuredJsonFieldValue(
        fieldId,
        recognizedFields,
        primitive,
      );
      if (validatedValue) validatedValuesByField.set(fieldId, validatedValue);
    }
    const acceptedFieldIds: string[] = [];
    for (const [fieldId, validatedValue] of validatedValuesByField) {
      const comparableValue =
        normalizeComparable(validatedValue) || validatedValue.normalize("NFKC").trim();
      const evidenceKey = `${fieldId}\u0000${comparableValue}`;
      if (seenStructuredEvidence.has(evidenceKey)) continue;
      seenStructuredEvidence.add(evidenceKey);
      const count = countByField.get(fieldId) ?? 0;
      if (count >= maxSmartImportAlternativesPerField) {
        omittedCount += 1;
        continue;
      }
      countByField.set(fieldId, count + 1);
      acceptedFieldIds.push(fieldId);
    }
    if (acceptedFieldIds.length) {
      if (rows.length >= maxSmartImportStructuredRows) {
        omittedCount += acceptedFieldIds.length;
      } else {
        rows.push({
          allowedFieldIds: acceptedFieldIds,
          confidence: "high",
          label: structuredLabel,
          value: primitive,
        });
      }
    }
    return true;
  };
  const visit = (value: unknown, path: string[], depth: number) => {
    if (depth > 8) return;
    if (Array.isArray(value)) {
      for (const item of value) visit(item, path, depth + 1);
      return;
    }
    if (value && typeof value === "object") {
      const record = value as Record<string, unknown>;
      const recordLabel = [record.field, record.name, record.label].find(
        (item): item is string => typeof item === "string" && Boolean(item.trim()),
      );
      const recordValue =
        typeof record.value === "string" || typeof record.value === "number"
          ? record.value
          : typeof record.text === "string" || typeof record.text === "number"
            ? record.text
            : undefined;
      const contextualRecordLabel = [...path, recordLabel ?? ""].join(" ").trim();
      const consumedRecord = Boolean(
        recordLabel &&
        recordValue !== undefined &&
        mayContainQuestionnaireLabel(contextualRecordLabel) &&
        pushPrimitive(contextualRecordLabel, recordValue, [...path, recordLabel]),
      );

      const wrapperValue = record.value;
      const consumedWrapper = Boolean(
        !consumedRecord &&
        path.length > 0 &&
        (typeof wrapperValue === "string" || typeof wrapperValue === "number") &&
        pushPrimitive(path.join(" "), wrapperValue, path),
      );

      for (const [key, item] of Object.entries(record)) {
        if (
          (consumedRecord && /^(?:field|name|label|value|text)$/u.test(key)) ||
          (consumedWrapper && key === "value")
        ) {
          continue;
        }
        if (
          path.length > 0 &&
          /^(?:confidence|source|status|score|raw|page|bbox)$/iu.test(key)
        ) {
          continue;
        }
        visit(item, [...path, key], depth + 1);
      }
      return;
    }
    if (
      !path.length ||
      value === null ||
      value === undefined ||
      (typeof value !== "string" && typeof value !== "number")
    ) {
      return;
    }
    pushPrimitive(path.join(" "), value, path);
  };
  visit(parsed, [], 0);
  context.structuredJson = { omittedCount, rows, source };
  return rows;
}

function validatedStructuredJsonFieldValue(
  fieldId: string,
  recognizedFields: ReturnType<typeof parseQuestionnaireDataText>,
  primitive: string,
) {
  const field = recognizedFields.find((item) => item.fieldId === fieldId);
  if (!field) return "";
  if (fieldId === "home-address") {
    const preview: CandidateInput[] = [];
    collectRussianHomeAddressParts(field.rawValue || primitive, preview, {
      confidence: "high",
      forceRussianCountry: false,
      priority: 40,
      requireRussianSignal: true,
    });
    return preview.length ? normalizeComparable(field.rawValue || primitive) : "";
  }
  const canonicalFieldId = fieldId === "occupation-specify" ? "occupation" : fieldId;
  if (!isSmartImportFieldId(canonicalFieldId)) return "";
  const rawValue = field.rawValue || primitive;
  const expandedValues = extractSmartImportAlternatives(canonicalFieldId, rawValue);
  const hasExplicitAlternatives = hasSmartImportAlternativeSyntax(
    rawValue,
    canonicalFieldId,
  );
  if (
    expandedValues.length > 1 ||
    (expandedValues.length === 1 && hasExplicitAlternatives)
  ) {
    return distinctNonEmptyValues(
      expandedValues.map((expandedValue) =>
        normalizeCandidateValue(canonicalFieldId, expandedValue, expandedValue),
      ),
    )
      .map((expandedValue) => comparableCandidateValue(canonicalFieldId, expandedValue))
      .sort()
      .join("|");
  }
  if (
    !expandedValues.length &&
    hasExplicitAlternatives &&
    isSingleChoiceSmartImportField(canonicalFieldId)
  ) {
    return "";
  }
  const value =
    fieldId === "occupation-specify" ? normalizeOccupation(field.value) : field.value;
  return normalizeCandidateValue(canonicalFieldId, value, rawValue);
}

function isNumericCompatibleJsonLabel(label: string) {
  return /(?:postal|postcode|zip|индекс|stay\s+duration|duration|days|длитель|entry\s+count|number\s+of\s+entries|entries|количество\s+въездов|home\s+house|house|дом|home\s+building|building|корпус|строение|home\s+unit|unit|apartment|квартира)/u.test(
    normalizeForSearch(label),
  );
}

function extractTabularQuestionnaireRows(source: string): SmartImportStructuredRow[] {
  const rows: SmartImportStructuredRow[] = [];
  for (const rawLine of source.split(/\n+/u)) {
    const line = rawLine.trim();
    const separator = line.includes("\t") ? "\t" : line.includes("|") ? "|" : "";
    if (!separator) continue;
    const cells = line
      .split(separator)
      .map((cell) => unwrapStructuredValue(cell).trim())
      .filter(Boolean);
    if (cells.length < 2) continue;
    const label = cells[0] ?? "";
    const value = cells.slice(1).join(separator === "|" ? " | " : " ");
    const normalizedLabel = normalizeForSearch(label);
    const normalizedValue = normalizeForSearch(value);
    if (
      /^(?:поле|field|key|параметр)$/u.test(normalizedLabel) &&
      /^(?:значение|value|data)$/u.test(normalizedValue)
    ) {
      continue;
    }
    rows.push({ confidence: "high", label, value });
    if (rows.length >= maxSmartImportStructuredRows) break;
  }
  return rows;
}

function extractVerticalDelimitedQuestionnaireRows(
  source: string,
  context: SmartImportParseContext,
): SmartImportStructuredRow[] {
  const lines = source
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maxSmartImportStructuredRows + 1);
  if (lines.length < 2) return [];

  for (const delimiter of [",", ";"] as const) {
    const parsedLines = lines.map((line) => parseDelimitedLine(line, delimiter));
    if (parsedLines.some((cells) => cells.length < 2)) continue;
    const first = parsedLines[0] ?? [];
    const explicitHeader =
      /^(?:поле|field|key|параметр)$/u.test(normalizeForSearch(first[0] ?? "")) &&
      /^(?:значение|value|data)$/u.test(normalizeForSearch(first[1] ?? ""));
    const startIndex = explicitHeader ? 1 : 0;
    const recognized = parsedLines
      .slice(startIndex)
      .filter(
        (cells) => questionnaireFieldIdentitiesForLabel(cells[0] ?? "", context).length,
      );
    if (!explicitHeader && recognized.length < 2) continue;

    const rows: SmartImportStructuredRow[] = [];
    for (const cells of parsedLines.slice(startIndex)) {
      const label = unwrapStructuredValue(cells[0] ?? "").trim();
      if (!questionnaireFieldIdentitiesForLabel(label, context).length) continue;
      const value = unwrapStructuredValue(cells.slice(1).join(delimiter)).trim();
      if (!value) continue;
      rows.push({ confidence: "high", label, value });
      if (rows.length >= maxSmartImportStructuredRows) break;
    }
    if (rows.length) return rows;
  }
  return [];
}

function extractHorizontalDelimitedQuestionnaireRows(
  source: string,
  context: SmartImportParseContext,
): SmartImportStructuredRow[] {
  const lines = source
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return [];

  for (const delimiter of [";", "\t", "|", ","] as const) {
    const headers = parseDelimitedLine(lines[0] ?? "", delimiter);
    if (headers.length < 2) continue;
    const recognizedByLabel = new Map<string, boolean>();
    const recognizedIndices: number[] = [];
    let recognizedHeaderCount = 0;
    for (let index = 0; index < headers.length; index += 1) {
      const header = headers[index] ?? "";
      const key = normalizeForSearch(header);
      let recognized = recognizedByLabel.get(key);
      if (recognized === undefined) {
        recognized = questionnaireFieldIdentitiesForLabel(header, context).length > 0;
        recognizedByLabel.set(key, recognized);
      }
      if (!recognized) continue;
      recognizedHeaderCount += 1;
      if (recognizedIndices.length < maxSmartImportStructuredRows) {
        recognizedIndices.push(index);
      }
    }
    if (!recognizedHeaderCount) continue;

    const rows: SmartImportStructuredRow[] = [];
    for (const line of lines.slice(1, maxSmartImportStructuredRows + 1)) {
      const values = parseDelimitedLine(line, delimiter);
      if (values.length !== headers.length) continue;
      for (const index of recognizedIndices) {
        if (rows.length >= maxSmartImportStructuredRows) break;
        const label = headers[index] ?? "";
        const value = values[index] ?? "";
        if (value.trim()) {
          rows.push({
            confidence: recognizedHeaderCount === 1 ? "medium" : "high",
            label,
            value,
          });
        }
      }
    }
    if (rows.length) return rows;
  }
  return [];
}

function extractInlineQuestionnaireRows(
  source: string,
  context: SmartImportParseContext,
): SmartImportStructuredRow[] {
  const rows: SmartImportStructuredRow[] = [];
  const countByLabel = new Map<string, number>();
  for (const line of source.split(/\n+/u)) {
    const segments = line.includes(";") ? parseDelimitedLine(line, ";") : [line.trim()];
    for (const segment of segments) {
      if (
        segment.length >
        maxSmartImportStructuredLabelLength + maxSmartImportStructuredValueLength + 10
      ) {
        continue;
      }
      const match = /^\s*([^:=—–]{2,90}?)\s*(?::|=|—|–)\s*(.+?)\s*$/u.exec(segment);
      if (!match?.[1] || !match[2]) continue;
      const label = unwrapStructuredValue(match[1]);
      const value = unwrapStructuredValue(match[2]);
      const labelKey = normalizeForSearch(label);
      const count = countByLabel.get(labelKey) ?? 0;
      if (count > maxSmartImportAlternativesPerField) continue;
      if (!questionnaireFieldIdentitiesForLabel(label, context).length) continue;
      rows.push({ confidence: "high", label, value });
      countByLabel.set(labelKey, count + 1);
      if (rows.length >= maxSmartImportStructuredRows) return rows;
    }
  }
  return rows;
}

function extractImplicitQuestionnaireRows(
  source: string,
  context: SmartImportParseContext,
): SmartImportStructuredRow[] {
  const rows: SmartImportStructuredRow[] = [];
  for (const rawLine of source.split(/\n+/u)) {
    const line = rawLine.trim();
    if (
      !line ||
      line.length > 240 ||
      /^(?:company|employment|certificate of employment|company letter|справка с места работы)$/iu.test(
        line,
      ) ||
      /[,;:=|\t—–]/u.test(line) ||
      !mayContainQuestionnaireLabel(line)
    ) {
      continue;
    }
    const hotelSubfield =
      /^(?:hotel|hostel|отель|гостиница)\s+(?:address|phone|telephone|contact|email|e-mail|city|country|postal(?:\s+code)?|postcode|zip|адрес|телефон|контакт|почта|город|страна|индекс)\s+(.+)$/iu.exec(
        line,
      );
    if (hotelSubfield?.[1]) {
      const valueStart = line.length - hotelSubfield[1].length;
      const label = line.slice(0, valueStart).trim();
      rows.push({ confidence: "medium", label, value: hotelSubfield[1].trim() });
      if (rows.length >= maxSmartImportStructuredRows) return rows;
      continue;
    }
    const tokens = line.split(/\s+/u);
    const maxLabelTokens = Math.min(tokens.length - 1, 7);
    for (let count = 1; count <= maxLabelTokens; count += 1) {
      const label = tokens.slice(0, count).join(" ");
      if (!questionnaireFieldIdentitiesForLabel(label, context).length) continue;
      const value = tokens.slice(count).join(" ");
      if (value && !isLikelyStructuredInstructionValue(label, value)) {
        rows.push({ confidence: "medium", label, value });
      }
      if (rows.length >= maxSmartImportStructuredRows) return rows;
      break;
    }
  }
  return rows;
}

function extractCollapsedQuestionnaireRows(
  source: string,
  context: SmartImportParseContext,
): SmartImportStructuredRow[] {
  const rows: SmartImportStructuredRow[] = [];
  for (const rawLine of source.split(/\n+/u)) {
    const line = rawLine.trim();
    if (!line || line.length > 500 || !mayContainQuestionnaireLabel(line)) continue;
    if (/[,;|\t]/u.test(line)) continue;
    const explicitSeparatorCount = line.match(/[:=—–]/gu)?.length ?? 0;
    if (explicitSeparatorCount === 1) continue;

    const tokens = [...line.matchAll(/\S+/gu)].map((match) => ({
      end: (match.index ?? 0) + (match[0]?.length ?? 0),
      start: match.index ?? 0,
      value: match[0] ?? "",
    }));
    if (tokens.length < 4) continue;

    const labels: Array<{ end: number; label: string; start: number }> = [];
    for (let tokenIndex = 0; tokenIndex < tokens.length - 1; tokenIndex += 1) {
      if (!mayStartQuestionnaireLabel(tokens[tokenIndex]?.value ?? "")) continue;
      let match:
        | { end: number; label: string; start: number; tokenCount: number }
        | undefined;
      const maxTokenCount = Math.min(7, tokens.length - tokenIndex - 1);
      for (let tokenCount = 1; tokenCount <= maxTokenCount; tokenCount += 1) {
        const first = tokens[tokenIndex];
        const last = tokens[tokenIndex + tokenCount - 1];
        if (!first || !last) continue;
        const label = line
          .slice(first.start, last.end)
          .replace(/\s*(?::|=|—|–|-)+\s*$/u, "")
          .trim();
        if (!label || !questionnaireFieldIdentitiesForLabel(label, context).length) {
          continue;
        }
        match = { end: last.end, label, start: first.start, tokenCount };
        break;
      }
      if (!match) continue;
      labels.push(match);
      tokenIndex += match.tokenCount - 1;
    }
    if (labels.length < 2) continue;

    for (let index = 0; index < labels.length; index += 1) {
      const current = labels[index];
      if (!current) continue;
      const nextStart = labels[index + 1]?.start ?? line.length;
      const value = line
        .slice(current.end, nextStart)
        .replace(/^\s*(?::|=|—|–|-)+\s*/u, "")
        .trim();
      if (!value || isLikelyStructuredInstructionValue(current.label, value)) {
        continue;
      }
      rows.push({ confidence: "low", label: current.label, value });
      if (rows.length >= maxSmartImportStructuredRows) return rows;
    }
  }
  return rows;
}

function mayStartQuestionnaireLabel(value: string) {
  return /^(?:фио|фамил|имя|дата|место|страна|граждан|национальн|пол|семейн|прожив|домашн|город|улиц|дом|корп|строен|квартир|адрес|индекс|почт|телефон|мобильн|контакт|профес|должност|работодател|работы|цель|назначен|въезд|выезд|длитель|отел|гостиниц|жиль|принимающ|приглашающ|оплач|средств|applicant|full|surname|family|last|first|given|birth|date|dob|nationality|citizenship|gender|sex|marital|residence|home|city|street|house|building|unit|apartment|address|postal|postcode|zip|email|phone|mobile|contact|occupation|profession|job|employer|company|purpose|destination|entry|arrival|departure|travel|stay|duration|days|hotel|hostel|property|accommodation|host|inviting|covered|payer|means|support)/u.test(
    normalizeForSearch(value),
  );
}

function isLikelyStructuredInstructionValue(label: string, value: string) {
  const normalizedLabel = normalizeForSearch(label);
  const normalizedValue = normalizeForSearch(value);
  if (
    /(?:^|\s)(?:field|fields|required|optional|instruction|instructions|enter|provide|fill|placeholder|поле|обязательн|необязательн|заполните|укажите)(?:\s|$)/u.test(
      normalizedValue,
    ) ||
    /^(?:policy\s+appl(?:y|ies)|terms?(?:\s+and\s+conditions?)?|conditions?\s+appl(?:y|ies)|address\s+from\s+(?:your|the)\s+confirmation|политик\p{L}*\s+действует|услови\p{L}*\s+применя)/u.test(
      normalizedValue,
    )
  ) {
    return true;
  }
  return (
    /^(?:company|компания)$/u.test(normalizedLabel) &&
    /^(?:policy|letter|document|heading|template|политика|письмо|документ|шаблон)(?:\s|$)/u.test(
      normalizedValue,
    )
  );
}

function extractLabelValueBlockRows(
  source: string,
  context: SmartImportParseContext,
): SmartImportStructuredRow[] {
  const lines = source
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter(Boolean);
  const rows: SmartImportStructuredRow[] = [];
  for (let index = 0; index < lines.length - 1; index += 1) {
    const label = lines[index] ?? "";
    const value = lines[index + 1] ?? "";
    if (/[,;|\t]/u.test(label) || /[,;|\t]/u.test(value)) continue;
    if (/(?::|=|—|–)/u.test(label)) continue;
    if (/(?::|=|—|–)/u.test(value)) continue;
    if (
      /^(?:company|employment|certificate of employment|company letter|справка с места работы)$/iu.test(
        label,
      )
    ) {
      continue;
    }
    if (!mayContainQuestionnaireLabel(label)) continue;
    if (!questionnaireFieldIdentitiesForLabel(label, context).length) continue;
    if (
      questionnaireFieldIdentitiesForLabel(value, context).length ||
      extractInlineQuestionnaireRows(value, context).length
    ) {
      continue;
    }
    rows.push({ confidence: "high", label, value });
    if (rows.length >= maxSmartImportStructuredRows) break;
  }
  return rows;
}

function parseDelimitedLine(line: string, delimiter: string) {
  const cells: string[] = [];
  let cell = "";
  let quote = "";
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index] ?? "";
    if (quote) {
      if (character === quote && line[index + 1] === quote) {
        cell += quote;
        index += 1;
      } else if (character === quote) {
        quote = "";
      } else {
        cell += character;
      }
      continue;
    }
    if (character === '"' && !cell) {
      quote = character;
    } else if (character === delimiter) {
      cells.push(cell.trim());
      cell = "";
    } else {
      cell += character;
    }
  }
  cells.push(cell.trim());
  return cells;
}

function questionnaireFieldIdentitiesForLabel(
  label: string,
  context: SmartImportParseContext,
) {
  if (!mayContainQuestionnaireLabel(label)) return [];
  const normalizedLabel = normalizeForSearch(humanizeStructuredLabel(label));
  const cached = context.labelIdentities.get(normalizedLabel);
  if (cached) return cached;
  return parseSmartImportStructuredRow(
    {
      confidence: "high",
      label,
      value: "",
    },
    context,
  );
}

function parseSmartImportStructuredRow(
  row: SmartImportStructuredRow,
  context: SmartImportParseContext,
): ReturnType<typeof parseQuestionnaireDataText> {
  const parsedLabel = humanizeStructuredLabel(row.label);
  const normalizedLabel = normalizeForSearch(parsedLabel);
  if (!normalizedLabel || !mayContainQuestionnaireLabel(normalizedLabel)) return [];
  if (isForbiddenPassportQuestionnaireLabel(parsedLabel)) return [];
  if (isStructuredMetadataLabel(normalizedLabel)) return [];
  if (
    /(?:^|\s)(?:entry count|number of entries|entries|количество въездов)$/u.test(
      normalizedLabel,
    )
  ) {
    return [
      {
        confidence: row.confidence,
        fieldId: "entry-count",
        label: parsedLabel,
        rawValue: row.value,
        sectionId: fieldMetadata["entry-count"].sectionId,
        value: row.value,
      },
    ];
  }
  if (
    /(?:^|\s)(?:inviting party type|тип принимающей стороны)$/u.test(normalizedLabel)
  ) {
    return [
      {
        confidence: row.confidence,
        fieldId: "inviting-party-type",
        label: parsedLabel,
        rawValue: row.value,
        sectionId: fieldMetadata["inviting-party-type"].sectionId,
        value: row.value,
      },
    ];
  }
  if (
    (hasStructuredAccommodationRole(normalizedLabel) &&
      (hasStructuredNestedPersonRole(normalizedLabel) ||
        hasStructuredNestedSubordinateRole(normalizedLabel))) ||
    (hasStructuredEmployerRole(normalizedLabel) &&
      (hasStructuredNestedContactPersonRole(normalizedLabel) ||
        hasStructuredNestedSubordinateRole(normalizedLabel)))
  ) {
    return [];
  }
  const accommodationFieldId = structuredAccommodationFieldId(normalizedLabel);
  if (accommodationFieldId) {
    return [
      {
        confidence: row.confidence,
        fieldId: accommodationFieldId,
        label: parsedLabel,
        rawValue: row.value,
        sectionId: fieldMetadata[accommodationFieldId].sectionId,
        value: row.value,
      },
    ];
  }
  const structuredTripField =
    hasStructuredEmployerRole(normalizedLabel) &&
    !hasStructuredAccommodationRole(normalizedLabel)
      ? undefined
      : structuredTripFieldId(normalizedLabel);
  if (structuredTripField) {
    return [
      {
        confidence: row.confidence,
        fieldId: structuredTripField,
        label: parsedLabel,
        rawValue: row.value,
        sectionId: fieldMetadata[structuredTripField].sectionId,
        value: row.value,
      },
    ];
  }
  if (hasStructuredAccommodationRole(normalizedLabel)) return [];
  if (hasStructuredServiceRole(normalizedLabel)) return [];
  if (isStructuredEmployerAddressComponent(normalizedLabel)) return [];
  const employerFieldId = structuredEmployerFieldId(normalizedLabel);
  if (employerFieldId) {
    return [
      {
        confidence: row.confidence,
        fieldId: employerFieldId,
        label: parsedLabel,
        rawValue: row.value,
        sectionId: fieldMetadata[employerFieldId].sectionId,
        value: row.value,
      },
    ];
  }
  if (
    hasStructuredEmployerRole(normalizedLabel) &&
    /(?:^|\s)(?:position|occupation|job title|должность|профессия)$/u.test(
      normalizedLabel,
    )
  ) {
    return [
      {
        confidence: row.confidence,
        fieldId: "occupation",
        label: parsedLabel,
        rawValue: row.value,
        sectionId: fieldMetadata.occupation.sectionId,
        value: row.value,
      },
    ];
  }
  if (hasStructuredEmployerRole(normalizedLabel)) return [];
  const homeFieldId = structuredHomeAddressFieldId(normalizedLabel);
  if (homeFieldId) {
    return [
      {
        confidence: row.confidence,
        fieldId: homeFieldId,
        label: parsedLabel,
        rawValue: row.value,
        sectionId: fieldMetadata[homeFieldId].sectionId,
        value: row.value,
      },
    ];
  }
  const componentFieldId = structuredAddressComponentFieldId(normalizedLabel);
  if (componentFieldId) {
    return [
      {
        confidence: row.confidence,
        fieldId: componentFieldId,
        label: parsedLabel,
        rawValue: row.value,
        sectionId: fieldMetadata[componentFieldId].sectionId,
        value: row.value,
      },
    ];
  }
  if (
    /(?:^|\s)full name$/u.test(normalizedLabel) &&
    !/(?:^|\s)(?:hotel|hostel|property|accommodation|host|inviting|employer|company)(?:\s|$)/u.test(
      normalizedLabel,
    )
  ) {
    return parseQuestionnaireDataText(`Full name: ${row.value}`).map((field) => ({
      ...field,
      confidence: row.confidence,
      label: parsedLabel,
      rawValue: row.value,
    }));
  }
  const direct = parseQuestionnaireDataText(`${parsedLabel}: ${row.value}`).filter(
    (field) =>
      field.confidence === "high" &&
      normalizeForSearch(field.label) === normalizedLabel,
  );
  if (direct.length) {
    return direct.map((field) => ({ ...field, confidence: row.confidence }));
  }

  let identities = context.labelIdentities.get(normalizedLabel);
  if (!identities) {
    const probes = [questionnaireLabelProbeValue(normalizedLabel)];
    const byFieldId = new Map<
      string,
      ReturnType<typeof parseQuestionnaireDataText>[number]
    >();
    for (const probe of probes) {
      for (const field of parseQuestionnaireDataText(`${parsedLabel}: ${probe}`)) {
        if (
          field.confidence === "high" &&
          normalizeForSearch(field.label) === normalizedLabel
        ) {
          byFieldId.set(field.fieldId, field);
        }
      }
    }
    identities = [...byFieldId.values()];
    context.labelIdentities.set(normalizedLabel, identities);
  }

  return identities.map((field) => ({
    ...field,
    confidence: row.confidence,
    label: parsedLabel,
    rawValue: row.value,
    value: row.value,
  }));
}

function structuredAccommodationFieldId(
  normalizedLabel: string,
): SmartImportFieldId | undefined {
  if (
    !hasStructuredAccommodationRole(normalizedLabel) ||
    hasStructuredNestedPersonRole(normalizedLabel) ||
    hasStructuredNestedSubordinateRole(normalizedLabel)
  ) {
    return undefined;
  }
  const aliases: Array<[RegExp, SmartImportFieldId]> = [
    [/(?:^|\s)(?:name|название|наименование|имя)$/u, "hotel-name"],
    [/(?:^|\s)(?:address|адрес)$/u, "hotel-address"],
    [/(?:^|\s)(?:country|страна)$/u, "hotel-country"],
    [/(?:^|\s)(?:city|город)$/u, "hotel-city"],
    [
      /(?:^|\s)(?:postal code|postcode|zip|почтовый индекс|индекс)$/u,
      "hotel-postal-code",
    ],
    [/(?:^|\s)(?:email|e mail|электронная почта|почта)$/u, "hotel-email"],
    [/(?:^|\s)(?:phone|telephone|contact|телефон|контакт)$/u, "hotel-contact"],
  ];
  return aliases.find(([pattern]) => pattern.test(normalizedLabel))?.[1];
}

function hasStructuredAccommodationRole(normalizedLabel: string) {
  return /(?:^|\s)(?:property|accommodation|lodging|hotel|hostel|host|inviting|отел\p{L}*|гостиниц\p{L}*|жиль\p{L}*|принимающ\p{L}*|приглашающ\p{L}*)(?:\s|$)/u.test(
    normalizedLabel,
  );
}

function hasStructuredNestedPersonRole(normalizedLabel: string) {
  return /(?:^|\s)(?:contact person|representative|guests?|applicants?|travell?ers?|passengers?|customers?|контактн\p{L}* лицо|представител\p{L}*|гость|гостя|гости|гостей|заявител\p{L}*|пассажир\p{L}*|клиент\p{L}*)(?:\s|$)/u.test(
    normalizedLabel,
  );
}

function hasStructuredNestedContactPersonRole(normalizedLabel: string) {
  return /(?:^|\s)(?:contact person|representative|контактн\p{L}* лицо|представител\p{L}*)(?:\s|$)/u.test(
    normalizedLabel,
  );
}

function hasStructuredNestedSubordinateRole(normalizedLabel: string) {
  return (
    /(?:^|\s)(?:property|accommodation|lodging|hotel|hostel|host|inviting|отел\p{L}*|гостиниц\p{L}*|жиль\p{L}*|принимающ\p{L}*|приглашающ\p{L}*)(?=\s|$)[^\n]*(?:^|\s)(?:rooms?|suites?|owners?|departments?|divisions?|teams?|staff|employees?|managers?|directors?|members?|комнат\p{L}*|номер\p{L}*|владел\p{L}*|отдел\p{L}*|департамент\p{L}*|команд\p{L}*|сотрудник\p{L}*|руководител\p{L}*)(?=\s|$)/u.test(
      normalizedLabel,
    ) ||
    /(?:^|\s)(?:employer|workplace|company|work|office|school|university|работодател\p{L}*|место работы|компани\p{L}*|рабоч\p{L}*|школ\p{L}*|университет\p{L}*)(?=\s|$)[^\n]*(?:^|\s)(?:departments?|divisions?|teams?|branches?|subsidiaries?|staff|employees?|managers?|directors?|members?|отдел\p{L}*|департамент\p{L}*|подразделени\p{L}*|филиал\p{L}*|команд\p{L}*|сотрудник\p{L}*|руководител\p{L}*)(?=\s|$)/u.test(
      normalizedLabel,
    ) ||
    /(?:^|\s)(?:property|accommodation|lodging|hotel|hostel|host|inviting|отел\p{L}*|гостиниц\p{L}*|жиль\p{L}*|принимающ\p{L}*|приглашающ\p{L}*)(?=\s|$)[^\n]*(?:^|\s)(?:facilit(?:y|ies)|amenit(?:y|ies)|management|front desk|locations?|offices?|служб\p{L}*|удобств\p{L}*|инфраструктур\p{L}*|управлени\p{L}*|ресепшн\p{L}*|местоположени\p{L}*|офис\p{L}*)(?=\s|$)/u.test(
      normalizedLabel,
    ) ||
    /(?:^|\s)(?:employer|workplace|company|work|office|school|university|работодател\p{L}*|место работы|компани\p{L}*|рабоч\p{L}*|школ\p{L}*|университет\p{L}*)(?=\s|$)[^\n]*(?:^|\s)(?:locations?|offices?|campuses?|projects?|programs?|местоположени\p{L}*|офис\p{L}*|кампус\p{L}*|проект\p{L}*|программ\p{L}*)(?=\s|$)/u.test(
      normalizedLabel,
    )
  );
}

function isStructuredMetadataLabel(normalizedLabel: string) {
  if (
    /(?:^|\s)(?:postal code|postcode|zip|inviting party type)$/u.test(normalizedLabel)
  ) {
    return false;
  }
  return /(?:^|\s)(?:confidence|score|probability|certainty|id|identifier|uuid|metadata(?:\s+\d+)?|meta|website|url|uri|source|error|warning|notes?|reviewer|bbox|page|code|type|kind)$/u.test(
    normalizedLabel,
  );
}

function hasStructuredServiceRole(normalizedLabel: string) {
  return /(?:^|\s)(?:airline|carrier|agency|provider|supplier|vendor|merchant|broker|platform|insurance|insurer|support|customer service|booking provider|travel agency|tour operator|travel operator|travel partner|booking agent|авиакомпан\p{L}*|перевозчик\p{L}*|агентств\p{L}*|провайдер\p{L}*|поставщик\p{L}*|продавец|брокер\p{L}*|платформ\p{L}*|страхов\p{L}*|туроператор\p{L}*|туристическ\p{L}* оператор\p{L}*|туристическ\p{L}* партнер\p{L}*|поддержк\p{L}*|служб\p{L}*)(?:\s|$)/u.test(
    normalizedLabel,
  );
}

function structuredTripFieldId(
  normalizedLabel: string,
): "arrival-date" | "departure-date" | "stay-duration" | undefined {
  if (
    /(?:^|\s)(?:check in|checkin|arrival date|date of arrival|travel start|дата въезда|дата заезда|заезд)$/u.test(
      normalizedLabel,
    )
  ) {
    return "arrival-date";
  }
  if (
    /(?:^|\s)(?:check out|checkout|return date|departure date|date of departure|travel end|дата выезда|дата возвращения|выезд)$/u.test(
      normalizedLabel,
    )
  ) {
    return "departure-date";
  }
  if (/(?:^|\s)(?:stay duration|duration|days|длительность)$/u.test(normalizedLabel)) {
    return "stay-duration";
  }
  return undefined;
}

function structuredEmployerFieldId(
  normalizedLabel: string,
): SmartImportFieldId | undefined {
  if (
    !hasStructuredEmployerRole(normalizedLabel) ||
    hasStructuredNestedContactPersonRole(normalizedLabel) ||
    hasStructuredNestedSubordinateRole(normalizedLabel) ||
    /(?:^|\s)(?:host|inviting|hotel|property|accommodation)(?:\s|$)/u.test(
      normalizedLabel,
    )
  ) {
    return undefined;
  }
  const aliases: Array<[RegExp, SmartImportFieldId]> = [
    [/(?:^|\s)(?:name|название|наименование)$/u, "employer-name"],
    [/(?:^|\s)(?:address|адрес)$/u, "employer-address"],
    [/(?:^|\s)(?:phone|telephone|contact|телефон|контакт)$/u, "employer-contact"],
  ];
  return aliases.find(([pattern]) => pattern.test(normalizedLabel))?.[1];
}

function hasStructuredEmployerRole(normalizedLabel: string) {
  return /(?:^|\s)(?:employer|workplace|company|work|office|school|university|работодател\p{L}*|место работы|компани\p{L}*|рабоч\p{L}*|школ\p{L}*|университет\p{L}*)(?:\s|$)/u.test(
    normalizedLabel,
  );
}

function isStructuredEmployerAddressComponent(normalizedLabel: string) {
  if (!hasStructuredEmployerRole(normalizedLabel)) return false;
  const hasNestedAddressContainer =
    /(?:^|\s)(?:address|адрес)(?:\s|$)/u.test(normalizedLabel) &&
    !/(?:^|\s)(?:address|адрес)$/u.test(normalizedLabel);
  return (
    hasNestedAddressContainer ||
    /(?:^|\s)(?:country|city|street|house(?: number)?|building|structure|unit|apartment|flat|postal code|postcode|zip|state|province|region|district|location|latitude|longitude|coordinates|address line(?: \d+)?|страна|город|улица|дом|номер дома|корпус|строение|квартира|почтовый индекс|индекс|область|край|район|регион|местоположение|координаты|строка адреса(?: \d+)?)$/u.test(
      normalizedLabel,
    )
  );
}

function structuredHomeAddressFieldId(
  normalizedLabel: string,
): SmartImportFieldId | undefined {
  const homeContext =
    /(?:^|\s)(?:home|residence|residential)(?:\s|$)/u.test(normalizedLabel) ||
    /(?:^|\s)applicant\b[^\n]*\baddress(?:\s|$)/u.test(normalizedLabel);
  if (!homeContext) return undefined;
  const aliases: Array<[RegExp, SmartImportFieldId]> = [
    [/(?:^|\s)country$/u, "home-country"],
    [/(?:^|\s)city$/u, "home-city"],
    [/(?:^|\s)street$/u, "home-street"],
    [/(?:^|\s)(?:house|house number)$/u, "home-house"],
    [/(?:^|\s)(?:building|structure)$/u, "home-building"],
    [/(?:^|\s)(?:unit|apartment|flat)$/u, "home-unit"],
    [/(?:^|\s)(?:postal code|postcode|zip)$/u, "postal-code"],
  ];
  return aliases.find(([pattern]) => pattern.test(normalizedLabel))?.[1];
}

function structuredAddressComponentFieldId(
  normalizedLabel: string,
): SmartImportFieldId | undefined {
  const aliases: Array<[RegExp, SmartImportFieldId]> = [
    [/(?:^|\s)(?:home\s+house|house\s+number|номер\s+дома|дом)$/u, "home-house"],
    [
      /(?:^|\s)(?:home\s+building|building\s+number|корпус|строение)$/u,
      "home-building",
    ],
    [/(?:^|\s)(?:home\s+unit|apartment|flat|квартира)$/u, "home-unit"],
    [/(?:^|\s)(?:home\s+street|street|улица)$/u, "home-street"],
  ];
  return aliases.find(([pattern]) => pattern.test(normalizedLabel))?.[1];
}

function mayContainQuestionnaireLabel(value: string) {
  const normalized = normalizeForSearch(humanizeStructuredLabel(value));
  if (!normalized || normalized.length > maxSmartImportStructuredLabelLength) {
    return false;
  }
  return /(?:фио|фамил|имя|рожд|граждан|национальн|пол|семейн|семейное|прожив|домашн|город|улиц|дом|корп|строен|квартир|адрес|индекс|почт|телефон|мобильн|контакт|профес|должност|работодател|работы|цель|назначен|въезд|выезд|длитель|отел|гостиниц|жиль|принимающ|приглашающ|оплач|средств|applicant|full name|surname|family name|last name|maiden name|first name|given name|birth|dob|nationality|citizenship|gender|sex|marital|residence|home|city|street|house|building|unit|apartment|address|postal|postcode|zip|email|e mail|phone|mobile|contact|occupation|profession|job|employer|company|workplace|school|university|purpose|destination|entry|entries|arrival|departure|travel|stay|duration|days|hotel|hostel|property|accommodation|host|inviting|covered|paid|payer|means|support)/u.test(
    normalized,
  );
}

function questionnaireLabelProbeValue(normalizedLabel: string) {
  if (/(?:email|e mail|почт)/u.test(normalizedLabel)) return "test@example.com";
  if (/(?:phone|mobile|contact|телефон|мобильн|контакт)/u.test(normalizedLabel)) {
    return "+70000000000";
  }
  if (
    /(?:date|birth|arrival|departure|travel start|travel end|дата|рожд|въезд|выезд)/u.test(
      normalizedLabel,
    )
  ) {
    return "01.01.2000";
  }
  if (/(?:gender|sex|пол)/u.test(normalizedLabel)) return "Мужской";
  if (/(?:marital|семейн|семейное)/u.test(normalizedLabel)) {
    return "Холост/не замужем";
  }
  if (/(?:purpose|цель)/u.test(normalizedLabel)) return "TOURISM";
  if (/(?:entries|entry count|количество въездов)/u.test(normalizedLabel)) {
    return "Однократная";
  }
  if (/(?:covered|payer|кто оплач|оплачивает)/u.test(normalizedLabel)) {
    return "Сам заявитель";
  }
  if (/(?:means|support|средств)/u.test(normalizedLabel)) return "Наличные";
  if (/(?:country|nationality|citizenship|страна|граждан)/u.test(normalizedLabel)) {
    return "Spain";
  }
  if (/(?:duration|days|длитель)/u.test(normalizedLabel)) return "1";
  if (/(?:inviting party type|тип принимающ)/u.test(normalizedLabel)) {
    return "Гостиница/временное жилье";
  }
  return "DOE JOHN";
}

function adaptGenericFieldForDocumentKind(
  fieldId: string,
  label: string,
  documentKind: SmartImportDocumentKind,
): SmartImportFieldId | undefined {
  const normalizedLabel = normalizeForSearch(label);
  const applicantRole =
    /(?:applicant|guest|travell?er|passenger|заявител|гост[ья]|пассажир)/u.test(
      normalizedLabel,
    );
  const accommodationRole = hasStructuredAccommodationRole(normalizedLabel);
  const employerRole = hasStructuredEmployerRole(normalizedLabel);
  const serviceRole = hasStructuredServiceRole(normalizedLabel);
  const emailSignal = /(?:email|e mail|почт)/u.test(normalizedLabel);

  if (emailSignal && employerRole && !accommodationRole) return undefined;
  if (
    serviceRole &&
    (fieldId === "email" ||
      fieldId === "contact-number" ||
      fieldId === "employer-contact")
  ) {
    return undefined;
  }
  if (!applicantRole && accommodationRole) {
    if (fieldId === "email") return "hotel-email";
    if (fieldId === "postal-code") return "hotel-postal-code";
    if (fieldId === "contact-number" || fieldId === "employer-contact") {
      return "hotel-contact";
    }
  }

  if (documentKind === "booking" || documentKind === "invitation") {
    if (
      (fieldId === "email" || fieldId === "contact-number") &&
      /(?:guest|applicant|travell?er|passenger|customer|support|help|service|provider|agency|airline|carrier|заявител|гост[ья]|пассажир|клиент|поддержк|служб|агентств|авиакомпан|перевозчик)/u.test(
        normalizedLabel,
      )
    ) {
      return undefined;
    }
    if (fieldId === "email") return "hotel-email";
    if (fieldId === "contact-number") return "hotel-contact";
    if (fieldId === "employer-contact") {
      return !applicantRole && accommodationRole ? "hotel-contact" : undefined;
    }
    if (
      documentKind === "invitation" &&
      fieldId === "employer-name" &&
      !applicantRole &&
      accommodationRole
    ) {
      return "hotel-name";
    }
    if (
      documentKind === "invitation" &&
      fieldId === "employer-address" &&
      !applicantRole &&
      accommodationRole
    ) {
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
    fieldId === "departure-date" &&
    /(?:^|\s)(?:departure date|flight date|дата вылета|вылет)$/u.test(normalizedLabel)
  ) {
    return "arrival-date";
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

function isNegatedAccommodationEvidence(label: string, value: string) {
  const normalized = normalizeForSearch(`${label} ${value}`);
  return /^(?:(?:no|without)\s+(?:hotel|hostel|accommodation)|(?:hotel|hostel|accommodation)\s+(?:none|not required)|(?:гостиниц|отел|жиль)[^\n]{0,30}(?:не\s+треб|не\s+нуж|нет)|живу\s+у\s+(?:друз|родствен))/u.test(
    normalized,
  );
}

function hasPositiveAccommodationEvidence(source: string) {
  return source.split(/\n+/u).some((rawLine) => {
    const typedAccommodationField =
      /^\s*((?:hotel|hostel|property|accommodation|отель|гостиница|жилье)\s+(?:name|address|phone|telephone|contact|email|e[ -]?mail|city|country|postal(?:\s+code)?|postcode|zip|название|адрес|телефон|контакт|почта|город|страна|индекс))\s*(?::|=|—|–|-)?\s*(.+?)\s*$/iu.exec(
        rawLine,
      );
    if (typedAccommodationField) {
      const label = typedAccommodationField[1] ?? "";
      const value = typedAccommodationField[2] ?? "";
      const fieldId = structuredAccommodationFieldId(normalizeForSearch(label));
      return Boolean(
        fieldId &&
        value &&
        !isSmartImportPlaceholder(value) &&
        !isLikelyStructuredInstructionValue(label, value) &&
        !isNegatedAccommodationEvidence(label, value) &&
        normalizeCandidateValue(fieldId, value, value),
      );
    }
    const stayField =
      /^\s*((?:check[ -]?in|check[ -]?out|заезд|выезд|дата заезда|дата выезда))\s*(?::|=|—|–|-)?\s*(.+?)\s*$/iu.exec(
        rawLine,
      );
    if (stayField) {
      const label = stayField[1] ?? "";
      const value = stayField[2] ?? "";
      const fieldId: SmartImportFieldId = /(?:check in|arrival|заезд)/u.test(
        normalizeForSearch(label),
      )
        ? "arrival-date"
        : "departure-date";
      return Boolean(
        value &&
        !isSmartImportPlaceholder(value) &&
        !isLikelyStructuredInstructionValue(label, value) &&
        normalizeCandidateValue(fieldId, value, value),
      );
    }
    const line = normalizeForSearch(rawLine);
    if (!line) return false;
    return /^(?:hotel|hostel|отель|гостиница)\s+(?!policy\b|terms?\b|conditions?\b|field\b|name\b|id\b|identifier\b|reference\b|status\b|type\b|category\b|rating\b|code\b|registration\b|tax\b|address\b|phone\b|telephone\b|contact\b|email\b|city\b|country\b|postal\b|postcode\b|zip\b|none\b|not\b|политик\p{L}*\b|услови\p{L}*\b|поле\b|название\b|идентификатор\b|ссылка\b|статус\b|тип\b|категори\p{L}*\b|рейтинг\b|код\b|регистрац\p{L}*\b|налог\p{L}*\b|адрес\b|телефон\b|контакт\b|почт\p{L}*\b|город\b|страна\b|индекс\b|нет\b|не\b)[\p{L}\p{N}][^\n]{1,160}$/u.test(
      line,
    );
  });
}

function hasNegatedAccommodationSource(source: string) {
  const lines = source
    .split(/\n+/u)
    .map((rawLine) => normalizeForSearch(rawLine))
    .filter(Boolean);
  const hasBookingContext = lines.some((line) =>
    /(?:^|\s)(?:booking|reservation|hotel booking|брон\p{L}*|бронирован\p{L}*)(?:\s|$)/u.test(
      line,
    ),
  );
  const hasInvitationContext = lines.some((line) =>
    /(?:^|\s)(?:invitation|приглашени\p{L}*)(?:\s|$)/u.test(line),
  );
  const hasStandaloneCancellationStatus = lines.some((line) =>
    /^(?:status|статус)\s+(?:cancelled|canceled|declined|отмен\p{L}*|отклон\p{L}*)$/u.test(
      line,
    ),
  );
  if (hasStandaloneCancellationStatus && (hasBookingContext || hasInvitationContext)) {
    return true;
  }

  return lines.some(
    (line) =>
      /^(?:no|without)\s+(?:hotel|hostel|accommodation)(?:\s+(?:(?:is\s+)?(?:required|needed|booked|arranged|provided|available)|staying\s+with|living\s+with)|$)/u.test(
        line,
      ) ||
      /^(?:no|without)\s+(?:booking|reservation)(?:\s+(?:(?:was\s+)?(?:made|created|confirmed|completed|found)|exists?)|$)/u.test(
        line,
      ) ||
      /^(?:no|without)\s+invitation(?:\s+(?:is\s+)?(?:required|needed|provided|available)|$)/u.test(
        line,
      ) ||
      /^(?:hotel|hostel|accommodation|invitation)\s+(?:none|not required|not needed|declined)$/u.test(
        line,
      ) ||
      /^(?:hotel\s+)?(?:booking|reservation)(?:\s+confirmation)?(?:\s+status)?\s+(?:cancelled|canceled|declined|not made)(?:\s|$)/u.test(
        line,
      ) ||
      /^invitation(?:\s+letter)?(?:\s+status)?\s+(?:cancelled|canceled|declined)(?:\s|$)/u.test(
        line,
      ) ||
      /(?:^|\s)(?:гостиниц\p{L}*|отел\p{L}*|жиль\p{L}*|брон\p{L}*|бронирован\p{L}*|приглашени\p{L}*)[^\n]{0,30}(?:не\s+треб\p{L}*|не\s+нуж\p{L}*|нет|отмен\p{L}*|отклон\p{L}*)(?:\s|$)/u.test(
        line,
      ) ||
      /(?:^|\s)живу\s+у\s+(?:друз\p{L}*|родствен\p{L}*)(?:\s|$)/u.test(line),
  );
}

function isNamedEntityMetadataLabel(value: string) {
  const normalized = normalizeForSearch(value);
  return /(?:^|\s)(?:hotel|hostel|property|employer|company|inviting company|host company|отель|гостиница|работодател\p{L}*|компани\p{L}*|приглашающ\p{L}*)\s+(?:id|identifier|reference|status|type|category|rating|code|registration(?:\s+number)?|tax(?:\s+number)?|номер\s+регистрации|регистрационн\p{L}*\s+номер|налогов\p{L}*\s+номер|идентификатор|ссылка|статус|тип|категория|рейтинг|код)(?:\s|$)/u.test(
    normalized,
  );
}

function isNamedEntityMetadataValue(value: string) {
  const normalized = normalizeForSearch(value);
  return /^(?:id|identifier|reference|status|type|category|rating|code|registration(?:\s+number)?|tax(?:\s+number)?|номер\s+регистрации|регистрационн\p{L}*\s+номер|налогов\p{L}*\s+номер|идентификатор|ссылка|статус|тип|категория|рейтинг|код)(?:\s|$)/u.test(
    normalized,
  );
}

function collectGenericContactCandidates(
  source: string,
  documentKind: SmartImportDocumentKind,
  candidates: CandidateInput[],
  context: SmartImportParseContext,
) {
  if (
    hasNegatedAccommodationSource(source) &&
    (documentKind === "booking" || documentKind === "invitation")
  ) {
    return;
  }
  if (hasForbiddenPassportDelimitedColumn(source, context)) return;
  const email = findRoleCompatibleEmail(source, documentKind);
  if (email) {
    const fieldId =
      documentKind === "booking" || documentKind === "invitation"
        ? "hotel-email"
        : "email";
    if (!candidates.some((item) => item.fieldId === fieldId)) {
      addCandidate(candidates, candidate(fieldId, email.toLowerCase(), "low", 15));
    }
  }

  const phone = findPhone(source, (line) =>
    isContactLineCompatibleWithDocument(line, documentKind),
  );
  if (phone) {
    const fieldId =
      documentKind === "booking" || documentKind === "invitation"
        ? "hotel-contact"
        : "contact-number";
    if (!candidates.some((item) => item.fieldId === fieldId)) {
      addCandidate(candidates, candidate(fieldId, phone, "low", 15));
    }
  }
}

function hasForbiddenPassportDelimitedColumn(
  source: string,
  context: SmartImportParseContext,
) {
  const lines = source
    .split(/\n+/u)
    .map((line) => line.trim())
    .filter(Boolean);
  if (lines.length < 2) return false;
  for (const delimiter of [",", ";", "\t", "|"] as const) {
    const headers = parseDelimitedLine(lines[0] ?? "", delimiter);
    const values = parseDelimitedLine(lines[1] ?? "", delimiter);
    if (headers.length < 2 || values.length !== headers.length) continue;
    if (
      headers.some(
        (header) =>
          questionnaireFieldIdentitiesForLabel(header, context).some((field) =>
            forbiddenPassportFieldIds.has(field.fieldId),
          ) ||
          /(?:^|\s)(?:(?:passport|travel document|identity document|document)\s*(?:id|no|number)|(?:номер|серия(?:\s+и\s+номер)?)\s+(?:загран)?паспорта|(?:загран)?паспорт\s*(?:номер|серия)|проездн\p{L}*\s+документ\s*(?:номер)?)(?:\s|$)/u.test(
            normalizeForSearch(header),
          ),
      )
    ) {
      return true;
    }
  }
  return false;
}

function findRoleCompatibleEmail(
  source: string,
  documentKind: SmartImportDocumentKind,
) {
  const emailPattern =
    /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Z0-9.-]{1,253}\.[A-Z]{2,63}/giu;
  for (const match of source.matchAll(emailPattern)) {
    const email = match[0] ?? "";
    const line = sourceLineAt(source, match.index ?? 0);
    if (!isContactLineCompatibleWithDocument(line, documentKind)) continue;
    const normalized = normalizeEmail(email);
    if (normalized) return normalized;
  }
  return "";
}

function isContactLineCompatibleWithDocument(
  line: string,
  documentKind: SmartImportDocumentKind,
) {
  const normalized = normalizeForSearch(line);
  const applicantRole =
    /(?:guest|applicant|travell?er|passenger|customer|заявител|гост[ья]|пассажир|клиент)/u.test(
      normalized,
    );
  const accommodationRole =
    /(?:hotel|hostel|property|accommodation|host|отел|гостиниц|жиль|принимающ|приглашающ)/u.test(
      normalized,
    );
  const nonApplicantOrganizationRole =
    /(?:employer|company|work|office|работодател|компан|рабоч)/u.test(normalized);
  const serviceRole =
    /(?:support|help|service|provider|agency|airline|carrier|поддержк|служб|провайдер|агентств|авиакомпан|перевозчик)/u.test(
      normalized,
    );

  if (documentKind === "booking" || documentKind === "invitation") {
    return !applicantRole && !serviceRole;
  }
  return !accommodationRole && !nonApplicantOrganizationRole && !serviceRole;
}

function sourceLineAt(source: string, index: number) {
  const start = source.lastIndexOf("\n", Math.max(0, index - 1)) + 1;
  const end = source.indexOf("\n", index);
  return source.slice(start, end < 0 ? source.length : end);
}

function collectGenericHomeAddressCandidates(
  source: string,
  candidates: CandidateInput[],
) {
  if (!containsHomeAddressSignal(source)) return;
  const parsedAddress = boundedExplicitQuestionnaireLines(source)
    .flatMap((line) => parseQuestionnaireDataText(line))
    .find((field) => field.fieldId === "home-address")?.value;
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
    forceRussianCountry: false,
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
    forceRussianCountry: true,
    priority: 90,
    requireRussianSignal: false,
  });
}

function collectRussianHomeAddressParts(
  source: string,
  candidates: CandidateInput[],
  options: {
    confidence: SmartImportConfidence;
    forceRussianCountry: boolean;
    priority: number;
    requireRussianSignal: boolean;
  },
) {
  const russianSignal = looksLikeRussianAddress(source);
  if (options.requireRussianSignal && !russianSignal) return;

  const explicitCountry = extractAddressCountry(source);
  const inferredRussianCountry = hasKnownRussianAddressCity(source);
  const country = options.forceRussianCountry
    ? "Russian Federation"
    : explicitCountry || inferredRussianCountry
      ? explicitCountry || "Russian Federation"
      : "";
  if (country) {
    addCandidate(
      candidates,
      candidate("home-country", country, options.confidence, options.priority + 10),
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
    /(?:^|[,;\n]|\s)\s*(?:дом|д)(?![\p{L}])\.?\s*([0-9А-ЯA-Z/-]+)/iu,
  )?.[1];
  if (house) {
    addCandidate(
      candidates,
      candidate("home-house", house, options.confidence, options.priority),
    );
  }

  const buildingParts: string[] = [];
  const corpus = source.match(
    /(?:^|[,;\n]|\s)\s*(?:корп(?:ус)?|к)(?![\p{L}])\.?\s*([0-9А-ЯA-Z/-]+)/iu,
  )?.[1];
  const structure = source.match(
    /(?:^|[,;\n]|\s)\s*(?:строение|стр)(?![\p{L}])\.?\s*([0-9А-ЯA-Z/-]+)/iu,
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
    /(?:^|[,;\n]|\s)\s*(?:квартира|кв)(?![\p{L}])\.?\s*([0-9А-ЯA-Z/-]+)/iu,
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
  const labelledBirthPlace = extractLongInlineValue(source, [
    "место рождения",
    "place of birth",
  ]);
  const labelledGender = extractInlineValue(source, ["пол", "sex"], /[A-ZА-ЯЁ.]+/iu);

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
    (line) => /(?:муж|жен|\b[MF]\b)/iu.test(line) && dateValuePattern.test(line),
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
    .filter((word) => !/^(?:МЕСТО|РОЖДЕНИЯ|ПОЛ|ДАТА|СЕРИЯ|НОМЕР)$/u.test(word))
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
    const transliteratedFirstName =
      transliterateRussianInternalPassportMrzName(firstName);
    if (transliteratedSurname) {
      addCandidate(candidates, candidate("surname", transliteratedSurname, "low", 5));
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
      index <= 9 || (index >= 13 && index <= 19)
        ? (russianInternalPassportMrzDigitCorrections[character] ?? character)
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
  if (hasNegatedAccommodationSource(source)) return;
  addCandidate(
    candidates,
    candidate("inviting-party-type", "Гостиница/временное жилье", "high", 110),
  );

  const lines = source
    .split(/\n+/u)
    .map((line) => line.replace(/\s+/gu, " ").trim())
    .filter(Boolean);
  const hotelLine = lines.find(
    (line) =>
      /^(?:hotel|hostel|отель|гостиница)\b/iu.test(line) &&
      !/[:=]/u.test(line) &&
      !isNamedEntityMetadataLabel(line) &&
      !/^(?:hotel|hostel|отель|гостиница)\s+(?:address|phone|telephone|contact|email|e-mail|city|country|postal|postcode|zip|policy|terms?|conditions?|field|адрес|телефон|контакт|почта|город|страна|индекс|политик\p{L}*|услови\p{L}*|поле)\b/iu.test(
        line,
      ),
  );
  if (hotelLine) {
    addCandidate(
      candidates,
      candidate("hotel-name", hotelLine.toUpperCase(), "high", 100),
    );
  }

  const labelledHotelName = extractInlineValue(
    source,
    ["hotel name", "название отеля", "гостиница"],
    /[^\n]{2,120}/u,
  );
  if (labelledHotelName && !isNamedEntityMetadataValue(labelledHotelName)) {
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
    addCandidate(
      candidates,
      candidate("hotel-address", cleanLongValue(address), "high", 100),
    );
  }

  const postalCityCountry = source.match(
    /(?:^|\n)\s*([A-Z0-9 -]{4,10})\s+([\p{L} .'-]{2,70})\s*,\s*([\p{L} .'-]{2,70})(?:\n|$)/iu,
  );
  if (postalCityCountry) {
    const postalCode = normalizePostalCode(postalCityCountry[1] ?? "");
    const country = normalizeKnownCountry(postalCityCountry[3] ?? "");
    if (postalCode && country) {
      addCandidate(candidates, candidate("hotel-postal-code", postalCode, "high", 90));
      addCandidate(
        candidates,
        candidate("hotel-city", titleCasePlace(postalCityCountry[2] ?? ""), "high", 90),
      );
      addCandidate(candidates, candidate("hotel-country", country, "high", 90));
    }
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
    if (value)
      addCandidate(candidates, candidate("departure-date", value, "high", 100));
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
    if (value)
      addCandidate(candidates, candidate("departure-date", value, "medium", 55));
  }
}

function collectEmploymentCandidates(source: string, candidates: CandidateInput[]) {
  const employer = extractInlineValue(
    source,
    ["работодатель", "место работы", "employer"],
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

  if (employer && !isNamedEntityMetadataValue(employer)) {
    addCandidate(
      candidates,
      candidate("employer-name", employer.toUpperCase(), "high", 90),
    );
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
  const invitationNegated = hasNegatedAccommodationSource(source);
  if (invitationNegated) return;
  const explicitCompanyHost =
    /(?:inviting|host)\s+(?:company|organization)|приглашающ(?:ая|ей)\s+(?:компан|организа)/iu.test(
      source,
    );
  const explicitPersonHost =
    /(?:host\s+name|inviting\s+person)|приглашающ(?:ее\s+лицо|ий|ая\s+сторона)/iu.test(
      source,
    );
  if (!invitationNegated && (explicitCompanyHost || explicitPersonHost)) {
    const hostType = explicitCompanyHost
      ? "Приглашающая компания/организация"
      : "Приглашающее лицо";
    addCandidate(candidates, candidate("inviting-party-type", hostType, "medium", 45));
  }

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
  if (hostName && !isNamedEntityMetadataValue(hostName)) {
    addCandidate(
      candidates,
      candidate("hotel-name", hostName.toUpperCase(), "high", 85),
    );
  }
  if (address) {
    addCandidate(
      candidates,
      candidate("hotel-address", cleanLongValue(address), "high", 85),
    );
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
    (sourceKind === "russian_internal_passport" ||
      sourceKind === "passport_identity") &&
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
  if (sourceKind === "travel_ticket" && fieldMetadata[fieldId].sectionId === "trip") {
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
    return Boolean(
      normalizedLeft && normalizedRight && normalizedLeft === normalizedRight,
    );
  }
  return normalizeComparable(left) === normalizeComparable(right);
}

function deduplicateCandidates(candidates: CandidateInput[]) {
  const byCanonicalValue = new Map<string, CandidateInput>();
  for (const item of candidates) {
    if (!item.value.trim() || !allowedFieldIds.has(item.fieldId)) continue;
    const comparableValue = comparableCandidateValue(item.fieldId, item.value);
    if (!comparableValue) continue;
    const key = `${item.fieldId}\u0000${comparableValue}`;
    const current = byCanonicalValue.get(key);
    if (!current || candidateRank(item) > candidateRank(current)) {
      byCanonicalValue.set(key, item);
    }
  }
  const distinctCandidates = [...byCanonicalValue.values()];
  const withoutLessSpecificNames = distinctCandidates.filter((item) => {
    if (item.fieldId !== "hotel-name" && item.fieldId !== "employer-name") {
      return true;
    }
    const comparable = comparableCandidateValue(item.fieldId, item.value);
    return !distinctCandidates.some((other) => {
      if (other === item || other.fieldId !== item.fieldId) return false;
      const otherComparable = comparableCandidateValue(other.fieldId, other.value);
      return (
        candidateRank(other) > candidateRank(item) &&
        otherComparable.length > comparable.length &&
        ` ${otherComparable} `.includes(` ${comparable} `)
      );
    });
  });
  const sorted = withoutLessSpecificNames.sort((left, right) => {
    const leftIndex = smartImportFieldIds.indexOf(left.fieldId);
    const rightIndex = smartImportFieldIds.indexOf(right.fieldId);
    if (leftIndex !== rightIndex) return leftIndex - rightIndex;
    return candidateRank(right) - candidateRank(left);
  });
  const countByField = new Map<SmartImportFieldId, number>();
  const capped = sorted.filter((item) => {
    const count = countByField.get(item.fieldId) ?? 0;
    if (count >= maxSmartImportAlternativesPerField) return false;
    countByField.set(item.fieldId, count + 1);
    return true;
  });

  return {
    candidates: capped.map((item) => ({
      confidence: item.confidence,
      fieldId: item.fieldId,
      label: item.label,
      sectionId: item.sectionId,
      sourceKind: item.sourceKind,
      value: item.value,
    })),
    omittedCount: sorted.length - capped.length,
  };
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
  const value = normalizeCandidateValue(
    item.fieldId,
    item.value,
    item.inputValue ?? item.value,
  );
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

function normalizeCandidateValue(
  fieldId: SmartImportFieldId,
  value: string,
  inputValue: string,
) {
  const rawUnwrappedValue = unwrapStructuredValue(value);
  const rawUnwrappedInput = unwrapStructuredValue(inputValue);
  if (
    rawUnwrappedValue.length > maxSmartImportStructuredValueLength ||
    rawUnwrappedInput.length > maxSmartImportStructuredValueLength
  ) {
    return "";
  }
  const unwrappedInput = valueBeforeNestedNonDataIdentifierLabel(rawUnwrappedInput);
  if (!unwrappedInput) return "";
  const unwrappedValue =
    unwrappedInput === rawUnwrappedInput ? rawUnwrappedValue : unwrappedInput;
  if (fieldId === "stay-duration") {
    return normalizeStayDuration(unwrappedInput.trim());
  }
  if (fieldId === "previous-surname" && normalizeForSearch(unwrappedInput) === "нет") {
    return "НЕТ";
  }
  const clean = cleanLongValue(unwrappedValue);
  const cleanInput = cleanLongValue(unwrappedInput);
  if (!clean) return "";
  if (
    isFreeTextAlternativeField(fieldId) &&
    splitFreeTextAlternativeSegments(cleanInput).length > 1
  ) {
    return "";
  }
  if (
    isSmartImportPlaceholder(clean) ||
    isSmartImportPlaceholder(cleanInput) ||
    isBooleanLikeScalar(cleanInput)
  ) {
    return "";
  }
  if (fieldId === "gender") return normalizeGender(cleanInput);
  if (fieldId === "marital-status") return normalizeMaritalStatus(cleanInput);
  if (fieldId === "purpose") return normalizePurpose(cleanInput);
  if (fieldId === "entry-count") return normalizeEntryCount(cleanInput);
  if (fieldId === "inviting-party-type") {
    return normalizeInvitingPartyType(cleanInput);
  }
  if (fieldId === "cost-covered-by") return normalizeCostCoveredBy(cleanInput);
  if (fieldId === "means-of-support") return normalizeMeansOfSupport(cleanInput);
  if (fieldId === "email" || fieldId === "hotel-email") {
    return normalizeEmail(cleanInput);
  }
  if (
    fieldId === "contact-number" ||
    fieldId === "hotel-contact" ||
    fieldId === "employer-contact"
  ) {
    return normalizePhone(cleanInput);
  }
  if (fieldId === "postal-code" || fieldId === "hotel-postal-code") {
    return normalizePostalCode(cleanInput);
  }
  if (
    fieldId === "birth-date" ||
    fieldId === "arrival-date" ||
    fieldId === "departure-date"
  ) {
    return normalizeDate(cleanInput, fieldId);
  }
  if (
    fieldId === "surname" ||
    fieldId === "first-name" ||
    fieldId === "previous-surname"
  ) {
    return normalizePersonalName(clean);
  }
  if (fieldId === "employer-name" || fieldId === "hotel-name") {
    return normalizeNamedEntity(clean);
  }
  if (fieldId === "occupation") {
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
    return normalizeCountry(cleanInput);
  }
  return clean;
}

function extractRussianCity(source: string) {
  const explicit = source.match(
    /(?:^|[,;\n]|\s)\s*г(?:ород)?\.?\s+([\p{L}-]+(?:\s+[\p{L}-]+){0,3}?)(?=\s+(?:ул(?:ица)?|просп(?:ект)?|пр[-\s]?т|пер(?:еулок)?|наб(?:ережная)?|бул(?:ьвар)?|ш(?:оссе)?|проезд|пл(?:ощадь)?)\.?\s|[,;\n]|$)/iu,
  );
  if (explicit?.[1]) return titleCasePlace(explicit[1]);

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
  return knownCity?.[1] ?? "";
}

function extractAddressCountry(source: string) {
  const normalized = normalizeForSearch(source);
  if (/(?:^|\s)(?:россия|russia|russian federation)(?:\s|$)/u.test(normalized)) {
    return "Russian Federation";
  }
  if (/(?:^|\s)(?:беларусь|belarus)(?:\s|$)/u.test(normalized)) {
    return "Belarus";
  }
  if (/(?:^|\s)(?:казахстан|kazakhstan)(?:\s|$)/u.test(normalized)) {
    return "Kazakhstan";
  }
  return "";
}

function hasKnownRussianAddressCity(source: string) {
  return /(?:санкт[ -]петербург|москва|казань|екатеринбург|новосибирск|нижний\s+новгород|самара|ростов[ -]на[ -]дону)/u.test(
    normalizeForSearch(source),
  );
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
        `(?:^|[,;\\n]|\\s)\\s*${typePattern.source}\\s+([\\p{L}][\\p{L} .'-]{1,70}?)(?=\\s*[,;\\n]|\\s+(?:д|дом|корп|стр|кв)[.\\s])`,
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
const dateValuePattern =
  /(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}[./-]\d{1,2}[./-]\d{1,2})/u;

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
    source.match(
      /[A-Z0-9.!#$%&'*+/=?^_`{|}~-]{1,64}@[A-Z0-9.-]{1,253}\.[A-Z]{2,63}/iu,
    ) || findPhone(source),
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
    /(?:улиц|проспект|просп\.?|пр[-\s]?т\.?|переул|набереж|бульвар|шоссе|проезд|площад|(?:^|[,;\s])(?:ул|пер|наб|бул|пл)\.?\s)/iu.test(
      source,
    ) &&
    /(?:^|[,\s])(?:д(?:ом)?|корп(?:ус)?|стр(?:оение)?|кв(?:артира)?)\.?\s*[0-9А-ЯA-Z/-]+/iu.test(
      source,
    )
  );
}

function findPhone(
  source: string,
  lineAllowed: (line: string) => boolean = () => true,
) {
  for (const line of source.split(/\n+/u)) {
    if (!lineAllowed(line)) continue;
    let explicitPhoneValue = valueAfterExplicitPhoneLabel(line);
    while (
      explicitPhoneValue !== undefined &&
      startsWithNonPhoneIdentifierLabel(explicitPhoneValue)
    ) {
      const nestedPhoneValue = valueAfterExplicitPhoneLabel(explicitPhoneValue);
      if (nestedPhoneValue === undefined || nestedPhoneValue === explicitPhoneValue) {
        explicitPhoneValue = undefined;
        break;
      }
      explicitPhoneValue = nestedPhoneValue;
    }
    if (explicitPhoneValue !== undefined) {
      explicitPhoneValue = valueBeforeNestedNonDataIdentifierLabel(explicitPhoneValue);
      const normalized = normalizePhone(explicitPhoneValue);
      const digits = normalized.replace(/\D/gu, "");
      if (digits.length >= 7 && digits.length <= 15) return normalized;
      continue;
    }
    if (isNonPhoneIdentifierLine(line)) continue;
    const matches = line.match(/\+?\d[\d\s().-]{5,}\d/gu) ?? [];
    for (const match of matches) {
      if (/^\s*\d{1,4}[./-]\d{1,2}[./-]\d{1,4}\s*$/u.test(match)) continue;
      const normalized = normalizePhone(match);
      const digits = normalized.replace(/\D/gu, "");
      if (digits.length >= 7 && digits.length <= 15) return normalized;
    }
  }
  return "";
}

function valueAfterExplicitPhoneLabel(line: string) {
  const match =
    /(?:^|[\s,;])(?:phone(?:\s+number)?|telephone|mobile(?:\s+phone)?|tel|contact\s+phone|номер\s+телефона|телефон|мобильн\p{L}*(?:\s+телефон)?|контактн\p{L}*\s+телефон)\s*(?::|=|—|–|-)?\s*(.+)$/iu.exec(
      line,
    );
  return match ? (match[1] ?? "") : undefined;
}

function isNonPhoneIdentifierLine(line: string) {
  if (findQuestionnaireDataLabelSpan(line, forbiddenPassportFieldIds)) {
    return true;
  }
  const normalized = normalizeForSearch(line);
  return /(?:reservation|booking|confirmation|order|reference|application|passport|travel\s+document|identity\s+(?:document|card)|national\s+(?:id|identity\s+card)|(?:personal\s+)?identification\s+(?:number|no|id)|(?:^|\s)id(?:\s+card)?\s+(?:number|no)|document\s+(?:number|no|id)|pnrus|mrz|номер\s+(?:брони|бронирования|заказа|заявки|паспорта|проездного\s+документа|документа|удостоверения\s+личности)|удостоверени\p{L}*\s+личности\s+(?:номер|серия)|идентификационн\p{L}*\s+номер|код\s+брони|серия)/u.test(
    normalized,
  );
}

function normalizeEmail(value: string) {
  const prepared = unwrapStructuredValue(value)
    .normalize("NFKC")
    .replace(/^mailto:\s*/iu, "")
    .replace(/\s*(?:\[at\]|\(at\)|\bat\b)\s*/giu, "@")
    .replace(/\s*(?:\[dot\]|\(dot\)|\bdot\b)\s*/giu, ".")
    .replace(/\s*@\s*/gu, "@")
    .replace(/\s*\.\s*/gu, ".")
    .toLowerCase();
  const email =
    prepared.match(/[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,63}/u)?.[0] ??
    "";
  if (!email || email.length > 254) return "";
  const [local = "", domain = ""] = email.split("@");
  if (
    !local ||
    local.length > 64 ||
    local.startsWith(".") ||
    local.endsWith(".") ||
    local.includes("..") ||
    domain.includes("..")
  ) {
    return "";
  }
  const domainLabels = domain.split(".");
  if (
    domainLabels.some(
      (label) =>
        !label ||
        label.length > 63 ||
        !/^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?$/u.test(label),
    )
  ) {
    return "";
  }
  return email;
}

function normalizePersonalName(value: string) {
  const normalized = unwrapStructuredValue(value)
    .replace(/^\s*(?:mr|mrs|ms|miss|г-н|г-жа)\.?\s+/iu, "")
    .replace(/\s+/gu, " ")
    .trim()
    .toLocaleUpperCase("ru-RU");
  if (
    !normalized ||
    normalized.length > 100 ||
    !/[\p{L}]/u.test(normalized) ||
    !/^[\p{L}\p{M}][\p{L}\p{M}'’ -]*$/u.test(normalized)
  ) {
    return "";
  }
  return normalized.replace(/’/gu, "'");
}

function normalizeNamedEntity(value: string) {
  const normalized = unwrapStructuredValue(value).replace(/\s+/gu, " ").trim();
  if (
    !normalized ||
    normalized.length > 180 ||
    /^(?:address|адрес|phone|телефон|email|e-mail|check[ -]?(?:in|out)|заезд|выезд)\s*(?::|=|—|–)/iu.test(
      normalized,
    ) ||
    !/[\p{L}\p{N}]/u.test(normalized)
  ) {
    return "";
  }
  return normalized.toLocaleUpperCase("ru-RU");
}

function normalizePhone(value: string) {
  const clean = unwrapStructuredValue(value)
    .replace(/\b(?:ext(?:ension)?|доб(?:авочный)?|вн)\.?\s*\d+.*$/iu, "")
    .trim();
  if (/^\d{1,2}[./-]\d{1,2}[./-]\d{2,4}$/u.test(clean)) return "";
  const withoutCalendarDates = clean.replace(
    /(?<!\d)(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}[./-]\d{1,2}[./-]\d{1,2})(?!\d)/gu,
    "",
  );
  if (
    withoutCalendarDates !== clean &&
    withoutCalendarDates.replace(/\D/gu, "").length < 7
  ) {
    return "";
  }
  const phoneText = withoutCalendarDates.trim();
  const digits = phoneText.replace(/\D/gu, "");
  if (digits.length < 7 || digits.length > 15) return "";
  if (phoneText.startsWith("+") || digits.startsWith("00")) {
    return `+${digits.startsWith("00") ? digits.slice(2) : digits}`;
  }
  if (digits.length === 11 && digits.startsWith("8")) {
    return `+7${digits.slice(1)}`;
  }
  return digits.length === 11 && digits.startsWith("7") ? `+${digits}` : digits;
}

function normalizePhoneForCompare(value: string) {
  let digits = value.replace(/\D/gu, "");
  if (digits.length === 11 && digits.startsWith("8")) digits = `7${digits.slice(1)}`;
  return digits;
}

function normalizePostalCode(value: string) {
  const normalized = unwrapStructuredValue(value)
    .normalize("NFKC")
    .replace(/\s+/gu, " ")
    .trim()
    .toUpperCase();
  if (
    normalized.length < 3 ||
    normalized.length > 16 ||
    !/\d/u.test(normalized) ||
    !/^[\p{L}\d][\p{L}\d -]*[\p{L}\d]$/u.test(normalized)
  ) {
    return "";
  }
  return normalized;
}

function normalizeDate(value: string, fieldId?: SmartImportFieldId) {
  const clean = unwrapStructuredValue(value).trim();
  if (
    /(?:^|\s)(?:(?:may|might|could)\s+be|maybe|possibly|perhaps|approximately|approx|around|about|circa|возможно|может\s+быть|примерно|ориентировочно|предположительно)(?:\s|$)/u.test(
      normalizeForSearch(clean),
    )
  ) {
    return "";
  }
  const dotted = /(?<!\d)(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?!\d)/u.exec(clean);
  const iso = /(?<!\d)(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?!\d)/u.exec(clean);
  const textual = parseTextualDateParts(clean);
  const rawYear = iso?.[1] ?? dotted?.[3] ?? textual?.year;
  const rawMonth = iso?.[2] ?? dotted?.[2] ?? textual?.month;
  const rawDay = iso?.[3] ?? dotted?.[1] ?? textual?.day;
  if (!rawYear || !rawMonth || !rawDay) return "";
  const yearNumber = Number(rawYear);
  const year =
    rawYear.length === 2 ? resolveTwoDigitYear(yearNumber, fieldId) : yearNumber;
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
  if (fieldId === "birth-date") {
    const now = new Date();
    const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
    if (year < 1900 || date.getTime() > today) return "";
  }
  return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${year}`;
}

function parseTextualDateParts(value: string) {
  const tokens = value
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/gu, "е")
    .replace(/\b(\d{1,2})(?:st|nd|rd|th)\b/gu, "$1")
    .replace(/[,;]+/gu, " ")
    .replace(/\b(?:г|года|de|of)\.?\b/gu, " ")
    .split(/\s+/u)
    .map((token) => token.replace(/[^\p{L}\p{N}]/gu, ""))
    .filter(Boolean);
  const monthIndex = tokens.findIndex((token) => textualMonthNumber(token) > 0);
  if (monthIndex < 0) return undefined;
  const month = textualMonthNumber(tokens[monthIndex] ?? "");
  const before = tokens[monthIndex - 1] ?? "";
  const after = tokens[monthIndex + 1] ?? "";
  const afterNext = tokens[monthIndex + 2] ?? "";
  const day = /^\d{1,2}$/u.test(before)
    ? before
    : /^\d{1,2}$/u.test(after)
      ? after
      : "";
  const year =
    /^\d{2,4}$/u.test(before) && before !== day
      ? before
      : /^\d{2,4}$/u.test(after) && after !== day
        ? after
        : /^\d{2,4}$/u.test(afterNext)
          ? afterNext
          : "";
  return day && year ? { day, month: String(month), year } : undefined;
}

function textualMonthNumber(value: string) {
  const monthPatterns: RegExp[] = [
    /^(?:январ|january|jan|enero)/u,
    /^(?:феврал|february|feb|febrero)/u,
    /^(?:март|march|mar|marzo)/u,
    /^(?:апрел|april|apr|abril)/u,
    /^(?:май|мая|may|mayo)/u,
    /^(?:июн|june|jun|junio)/u,
    /^(?:июл|july|jul|julio)/u,
    /^(?:август|august|aug|agosto)/u,
    /^(?:сентябр|september|sep|septiembre)/u,
    /^(?:октябр|october|oct|octubre)/u,
    /^(?:ноябр|november|nov|noviembre)/u,
    /^(?:декабр|december|dec|diciembre)/u,
  ];
  const index = monthPatterns.findIndex((pattern) => pattern.test(value));
  return index < 0 ? 0 : index + 1;
}

function resolveTwoDigitYear(year: number, fieldId?: SmartImportFieldId) {
  if (fieldId === "birth-date") {
    const currentYear = new Date().getUTCFullYear();
    const recent = 2000 + year;
    return recent <= currentYear ? recent : 1900 + year;
  }
  if (fieldId === "arrival-date" || fieldId === "departure-date") {
    return 2000 + year;
  }
  return year > 40 ? 1900 + year : 2000 + year;
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
  if (/^(?:м|муж|мужской|male|m)$/u.test(normalized.replace(/\./gu, "")))
    return "Мужской";
  if (/^(?:ж|жен|женский|female|f)$/u.test(normalized.replace(/\./gu, "")))
    return "Женский";
  return "";
}

function normalizeMaritalStatus(value: string) {
  const normalized = normalizeForSearch(value);
  if (
    /(?:^|\s)(?:single|unmarried|never\s+married|not\s+(?:re)?married|холост|не\s+(?:женат|замуж))(?:\s|$)/u.test(
      normalized,
    )
  ) {
    return "Холост/не замужем";
  }
  if (isNegatedCategoricalValue(normalized)) return "";
  if (/(?:married|женат|замуж)/u.test(normalized)) return "Женат/замужем";
  if (/(?:divorced|развед)/u.test(normalized)) return "Разведен(а)";
  if (/(?:widow|вдов)/u.test(normalized)) return "Вдовец/вдова";
  if (/(?:registered\s+partnership|civil\s+partnership|партнерств)/u.test(normalized)) {
    return "Зарегистрированное партнерство";
  }
  if (/(?:separated|раздельн)/u.test(normalized)) return "Раздельно";
  if (/^(?:other|иное|другое)$/u.test(normalized)) return "Иное";
  return "";
}

function normalizePurpose(value: string) {
  const normalized = normalizeForSearch(value);
  if (isNegatedCategoricalValue(normalized)) return "";
  if (/(?:business|conference|делов|бизнес|конференц)/u.test(normalized)) {
    return "BUSINESS";
  }
  if (/(?:family|friend|родствен|друз|частн(?:ый|ая)\s+визит)/u.test(normalized)) {
    return "VISITING FAMILY OR FRIENDS";
  }
  if (/(?:study|education|учеб|образован)/u.test(normalized)) return "STUDY";
  if (/(?:medical|treatment|лечен|медицин)/u.test(normalized)) {
    return "MEDICAL TREATMENT";
  }
  if (/(?:official|официаль)/u.test(normalized)) return "OFFICIAL VISIT";
  if (/(?:culture|cultural|культур)/u.test(normalized)) return "CULTURAL";
  if (/(?:sport|sports|спорт)/u.test(normalized)) return "SPORTS";
  if (/(?:transit|транзит)/u.test(normalized)) return "TRANSIT";
  if (/(?:tour|tourism|туризм|турист)/u.test(normalized)) return "TOURISM";
  if (/^(?:other|иная|иной|иное|другое)$/u.test(normalized)) return "OTHER";
  return "";
}

function normalizeEntryCount(value: string) {
  const normalized = normalizeForSearch(value);
  if (/^(?:1|one|single|одно(?:кратная|кратный)?|один)$/u.test(normalized)) {
    return "Однократная";
  }
  if (/^(?:2|two|double|дву(?:кратная|кратный)?|два)$/u.test(normalized)) {
    return "Двукратная";
  }
  if (/(?:multi|multiple|много(?:кратная|кратный)?)/u.test(normalized)) {
    return "Многократная";
  }
  return "";
}

function normalizeInvitingPartyType(value: string) {
  const normalized = normalizeForSearch(value);
  if (isNegatedCategoricalValue(normalized)) return "";
  if (
    /^(?:приглашающая компания организация|приглашающая организация|приглашающая компания|inviting company|host company|company|organization|organisation)$/u.test(
      normalized,
    )
  ) {
    return "Приглашающая компания/организация";
  }
  if (
    /^(?:гостиница временное жилье|гостиница|отель|временное жилье|hotel|hostel|accommodation|temporary accommodation)$/u.test(
      normalized,
    )
  ) {
    return "Гостиница/временное жилье";
  }
  if (
    /^(?:приглашающее лицо|принимающее лицо|inviting person|host person|person|individual)$/u.test(
      normalized,
    )
  ) {
    return "Приглашающее лицо";
  }
  return "";
}

function normalizeCostCoveredBy(value: string) {
  const normalized = normalizeForSearch(value);
  if (isNegatedCategoricalValue(normalized)) return "";
  if (
    /(?:sponsor|employer|company|host|спонс|работодател|компан|принимающ)/u.test(
      normalized,
    )
  ) {
    return "Спонсор";
  }
  if (/(?:applicant|self|personal|заявител|самостоятель|личн)/u.test(normalized)) {
    return "Сам заявитель";
  }
  return "";
}

function normalizeMeansOfSupport(value: string) {
  const normalized = normalizeForSearch(value);
  if (isNegatedCategoricalValue(normalized)) return "";
  const means: string[] = [];
  if (/(?:cash|налич)/u.test(normalized)) means.push("Наличные");
  if (/(?:credit|debit|bank\s+card|кредитн|дебетов|банковск.*карт)/u.test(normalized)) {
    means.push("Кредитная карта");
  }
  if (/(?:travell?er'?s?\s+cheque|travel\s+check|дорожн.*чек)/u.test(normalized)) {
    means.push("Дорожные чеки");
  }
  if (
    /(?:prepaid\s+accommodation|accommodation\s+prepaid|жиль.*предоплач)/u.test(
      normalized,
    )
  ) {
    means.push("Жилье предоплачено");
  }
  if (
    /(?:prepaid\s+transport|transport\s+prepaid|транспорт.*предоплач)/u.test(normalized)
  ) {
    means.push("Транспорт предоплачен");
  }
  if (!means.length && /^(?:other|иное|другое)$/u.test(normalized)) {
    means.push("Иное");
  }
  const distinctMeans = [...new Set(means)];
  return distinctMeans.length === 1 ? (distinctMeans[0] ?? "") : "";
}

function normalizeStayDuration(value: string) {
  const match = /^\s*(\d{1,4})(?:\s*(?:days?|дн(?:ей|я|ь)?))?\s*$/iu.exec(value);
  if (!match?.[1]) return "";
  const days = Number(match[1]);
  return Number.isSafeInteger(days) && days > 0 ? String(days) : "";
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
  return (
    aliases.find(([pattern]) => pattern.test(normalized))?.[1] ??
    cleanLongValue(value).toUpperCase()
  );
}

function normalizeCountry(value: string) {
  const normalized = normalizeForSearch(value);
  if (isNegatedCategoricalValue(normalized)) return "";
  if (
    !normalized ||
    /^(?:tbd|n a|na|unknown|not stated|pending|уточняется|неизвестно|не указано|нет данных)$/u.test(
      normalized,
    )
  ) {
    return "";
  }
  return normalizeKnownCountry(value) || titleCasePlace(value);
}

function normalizeKnownCountry(value: string) {
  const normalized = normalizeForSearch(value);
  if (!normalized || isNegatedCategoricalValue(normalized)) return "";
  if (/росси|russia|russian federation|\brf\b/u.test(normalized))
    return "Russian Federation";
  if (/испан|spain|espana|españa/u.test(normalized)) return "Spain";
  if (/франц|france/u.test(normalized)) return "France";
  if (/герман|germany/u.test(normalized)) return "Germany";
  if (/итал|italy/u.test(normalized)) return "Italy";
  if (/португал|portugal/u.test(normalized)) return "Portugal";
  if (/^(?:united states(?: of america)?|usa|u s a|сша)$/u.test(normalized)) {
    return "United States";
  }
  if (/^(?:canada|канада)$/u.test(normalized)) return "Canada";
  if (/^(?:bosnia and herzegovina|босния и герцеговина)$/u.test(normalized)) {
    return "Bosnia and Herzegovina";
  }
  if (/^congo democratic republic of(?: the)?$/u.test(normalized)) {
    return "Congo, Democratic Republic of the";
  }
  if (/^(?:united kingdom|uk|u k|великобритания)$/u.test(normalized)) {
    return "United Kingdom";
  }
  if (/^(?:netherlands|нидерланды)$/u.test(normalized)) return "Netherlands";
  if (/^(?:turkey|turkiye|турция)$/u.test(normalized)) return "Turkey";
  if (/беларус|belarus/u.test(normalized)) return "Belarus";
  if (/казахстан|kazakhstan/u.test(normalized)) return "Kazakhstan";
  if (/ссср|ussr/u.test(normalized)) return "USSR";
  return "";
}

function isSmartImportPlaceholder(value: string) {
  const normalized = normalizeForSearch(value);
  return (
    /^(?:not applicable|same as above|as above|no hotel|no hostel|no accommodation|no employer|не применимо|как указано выше|см выше|нет гостиницы|нет отеля|нет жилья|нет работодателя)$/u.test(
      normalized,
    ) ||
    /^(?:(?:tbd|n a|unknown|not stated|not provided|not available|pending|none|null|undefined|required|optional|mandatory|not required)(?:\s+(?:yet|by\s+applicant|at\s+this\s+time|for\s+now|pending|due\s+to\s+privacy|currently))?|(?:уточняется|неизвестно|не указано|не заполнено|нет данных|отсутствует|обязательно|обязательное|необязательно|необязательное)(?:\s+(?:пока|на\s+данный\s+момент|заявителем|из\s+соображений\s+конфиденциальности))?)$/u.test(
      normalized,
    ) ||
    /^(?:(?:please\s+)?(?:enter|write|type|fill\s+in|provide|select|choose)(?:\s+[\p{L}\d_-]+)*(?:\s+here)?|to\s+be\s+(?:confirmed|provided|updated|determined|completed)|(?:пожалуйста\s+)?(?:введите|напишите|укажите|заполните|выберите)(?:\s+[\p{L}\d_-]+)*(?:\s+здесь)?|будет\s+(?:подтверждено|указано|заполнено|завершено))$/u.test(
      normalized,
    )
  );
}

function isNegatedCategoricalValue(value: string) {
  return /(?:^|\s)(?:not|no|without|не|без)(?:\s|$)/u.test(value);
}

function isBooleanLikeScalar(value: string) {
  return /^(?:true|false|yes|no|да|нет)$/u.test(normalizeForSearch(value));
}

function titleCasePlace(value: string) {
  return cleanLongValue(value)
    .toLocaleLowerCase("ru-RU")
    .replace(
      /(^|[\s-])([\p{L}])/gu,
      (_match, prefix: string, letter: string) =>
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

function humanizeStructuredLabel(value: string) {
  return value
    .normalize("NFKC")
    .replace(/([\p{Ll}\d])([\p{Lu}])/gu, "$1 $2")
    .replace(/[_-]+/gu, " ")
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
    .replace(/[\f\v]+/gu, " ")
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

function unwrapStructuredValue(value: string) {
  let clean = value.trim().replace(/,\s*$/u, "").trim();
  const first = clean[0];
  const last = clean.at(-1);
  if (
    clean.length >= 2 &&
    ((first === '"' && last === '"') ||
      (first === "'" && last === "'") ||
      (first === "`" && last === "`"))
  ) {
    clean = clean.slice(1, -1).trim();
  }
  return clean;
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
