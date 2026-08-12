import type { QuestionnaireFieldUpdate } from "./questionnaire";

export type QuestionnaireDataImageConfidence = "low" | "medium" | "high";

export type QuestionnaireDataImageField = Pick<
  QuestionnaireFieldUpdate,
  "fieldId" | "sectionId" | "value"
> & {
  confidence: QuestionnaireDataImageConfidence;
  label: string;
  rawValue: string;
};

export type QuestionnaireDataImageResult = {
  fields: QuestionnaireDataImageField[];
  rawText: string;
  status: "extracted" | "empty" | "unsupported" | "failed";
  summary: string;
};

type DataImageFieldSpec = {
  confidence?: QuestionnaireDataImageConfidence;
  fieldId: string;
  labels: string[];
  normalize?: (value: string) => string;
  sectionId: string;
};

type DataImageOcrResponse = {
  data: {
    text: string;
  };
};

const supportedQuestionnaireDataImageMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

const dataImageOcrTimeoutMs = 45_000;

const dataImageOcrOptions = {
  cacheMethod: "none",
  corePath: "/tesseract/core",
  gzip: true,
  langPath: "/tesseract/lang",
  tessedit_pageseg_mode: "6",
  workerBlobURL: false,
  workerPath: "/tesseract/worker.min.js",
};

const countryAliases: Array<[RegExp, string]> = [
  [/\b(?:russia|russian federation|rf)\b|росси|рф/i, "Russian Federation"],
  [/\bussr\b|ссср/i, "USSR"],
  [/\bspain\b|испан/i, "Spain"],
  [/\bfrance\b|франц/i, "France"],
  [/\bgermany\b|герман/i, "Germany"],
  [/\bitaly\b|итал/i, "Italy"],
  [/\bportugal\b|португал/i, "Portugal"],
  [/\bnetherlands\b|нидерланд/i, "Netherlands"],
  [/\bbelarus\b|беларус/i, "Belarus"],
  [/\bkazakhstan\b|казахстан/i, "Kazakhstan"],
  [/\bturkey\b|турци/i, "Turkey"],
  [/\bunited states\b|\busa\b|сша/i, "United States"],
  [/\bunited kingdom\b|\buk\b|великобритан/i, "United Kingdom"],
];

const occupationAliases: Array<[RegExp, string]> = [
  [
    /\bit\b|айти|program|програм|developer|software|engineer|инженер-програм/i,
    "IT PROFESSIONAL",
  ],
  [/accountant|бухгалтер/i, "ACCOUNTANT"],
  [/architect|архитектор/i, "ARCHITECT"],
  [/banker|банк/i, "BANKER"],
  [/business|предприним|бизнес/i, "BUSINESSMAN"],
  [/chef|повар/i, "CHEF"],
  [/civil servant|госслуж/i, "CIVIL SERVANT"],
  [/director|директор/i, "COMPANY DIRECTOR"],
  [/consultant|консульт/i, "CONSULTANT"],
  [/doctor|врач/i, "DOCTOR"],
  [/driver|водител/i, "DRIVER"],
  [/economist|эконом/i, "ECONOMIST"],
  [/engineer|инженер/i, "ENGINEER"],
  [/financier|финанс/i, "FINANCIER"],
  [/journalist|журналист/i, "JOURNALIST"],
  [/lawyer|юрист|адвокат/i, "LAWYER"],
  [/manager|менеджер/i, "MANAGER"],
  [/nurse|медсестр/i, "NURSE"],
  [/pensioner|пенсион/i, "PENSIONER"],
  [/photographer|фотограф/i, "PHOTOGRAPHER"],
  [/student|студент/i, "STUDENT"],
  [/teacher|преподав|учител/i, "TEACHER"],
  [/translator|перевод/i, "TRANSLATOR"],
  [/writer|писател/i, "WRITER"],
  [/unemployed|безработ/i, "UNEMPLOYED"],
  [/retired/i, "RETIRED"],
];

const fieldSpecs: DataImageFieldSpec[] = [
  {
    fieldId: "previous-surname",
    labels: [
      "фамилия при рождении",
      "предыдущая фамилия",
      "прежняя фамилия",
      "maiden name",
      "surname at birth",
      "previous surname",
    ],
    normalize: normalizeNameLikeValue,
    sectionId: "personal",
  },
  {
    fieldId: "surname",
    labels: ["фамилия", "surname", "family name", "last name"],
    normalize: normalizeNameLikeValue,
    sectionId: "personal",
  },
  {
    fieldId: "first-name",
    labels: ["имя", "first name", "given name"],
    normalize: normalizeNameLikeValue,
    sectionId: "personal",
  },
  {
    fieldId: "birth-date",
    labels: ["дата рождения", "date of birth", "dob", "birth date"],
    normalize: normalizeDateValue,
    sectionId: "personal",
  },
  {
    fieldId: "birth-place",
    labels: ["место рождения", "place of birth", "birth place"],
    normalize: normalizeCityLikeValue,
    sectionId: "personal",
  },
  {
    fieldId: "birth-country",
    labels: ["страна рождения", "country of birth", "birth country"],
    normalize: normalizeCountryValue,
    sectionId: "personal",
  },
  {
    fieldId: "nationality",
    labels: ["текущее гражданство", "гражданство", "nationality", "citizenship"],
    normalize: normalizeCountryValue,
    sectionId: "personal",
  },
  {
    fieldId: "birth-citizenship",
    labels: [
      "гражданство при рождении",
      "nationality at birth",
      "citizenship at birth",
    ],
    normalize: normalizeCountryValue,
    sectionId: "personal",
  },
  {
    fieldId: "other-citizenship",
    labels: ["иное гражданство", "other nationality", "other citizenship"],
    normalize: normalizeCountryValue,
    sectionId: "personal",
  },
  {
    fieldId: "gender",
    labels: ["пол", "sex", "gender"],
    normalize: normalizeGenderValue,
    sectionId: "personal",
  },
  {
    fieldId: "marital-status",
    labels: ["семейное положение", "marital status"],
    normalize: normalizeMaritalStatusValue,
    sectionId: "personal",
  },
  {
    fieldId: "national-id",
    labels: ["национальный id", "national id", "id number"],
    sectionId: "personal",
  },
  {
    fieldId: "passport-type",
    labels: ["тип паспорта", "тип документа", "passport type", "document type"],
    normalize: normalizePassportTypeValue,
    sectionId: "passport",
  },
  {
    fieldId: "passport-no",
    labels: [
      "номер паспорта",
      "№ паспорта",
      "# паспорта",
      "номер проездного документа",
      "№ проездного документа",
      "# проездного документа",
      "паспорт",
      "passport no",
      "passport number",
      "travel document no",
      "travel document number",
    ],
    normalize: normalizePassportNumberValue,
    sectionId: "passport",
  },
  {
    fieldId: "passport-issue-date",
    labels: [
      "дата выдачи паспорта",
      "дата выдачи",
      "issue date",
      "issued at",
      "date of issue",
      "passport issue date",
      "passport date of issue",
    ],
    normalize: normalizeDateValue,
    sectionId: "passport",
  },
  {
    fieldId: "passport-expiry-date",
    labels: [
      "дата окончания паспорта",
      "действителен до",
      "expiry date",
      "date of expiry",
      "valid until",
      "passport expiry date",
      "passport expiry",
      "passport exp",
      "passport expiration date",
      "passport expiration",
      "passport date of expiry",
    ],
    normalize: normalizeDateValue,
    sectionId: "passport",
  },
  {
    fieldId: "passport-issue-country",
    labels: [
      "страна выдачи паспорта",
      "страна выдачи",
      "issuing country",
      "passport issue country",
      "passport issuing country",
      "passport country of issue",
    ],
    normalize: normalizeCountryValue,
    sectionId: "passport",
  },
  {
    fieldId: "passport-issue-place",
    labels: [
      "место выдачи паспорта",
      "место выдачи",
      "кем выдан",
      "орган выдачи паспорта",
      "place of issue",
      "issuing place",
      "passport place of issue",
      "passport issued by",
      "passport issuing authority",
    ],
    normalize: normalizeCityLikeValue,
    sectionId: "passport",
  },
  {
    fieldId: "home-address",
    labels: [
      "домашний адрес",
      "адрес проживания",
      "home address",
      "residential address",
      "address line",
    ],
    sectionId: "contacts",
  },
  {
    fieldId: "email",
    labels: ["email", "e-mail", "почта", "электронная почта"],
    normalize: normalizeEmailValue,
    sectionId: "contacts",
  },
  {
    fieldId: "contact-number",
    labels: [
      "телефон заявителя",
      "контактный телефон",
      "contact number",
      "mobile",
      "phone",
      "телефон",
    ],
    normalize: normalizePhoneValue,
    sectionId: "contacts",
  },
  {
    fieldId: "home-country",
    labels: ["страна проживания", "country of residence", "residence country"],
    normalize: normalizeCountryValue,
    sectionId: "contacts",
  },
  {
    fieldId: "home-city",
    labels: ["город проживания", "residence city", "home city", "city of residence"],
    normalize: normalizeCityLikeValue,
    sectionId: "contacts",
  },
  {
    fieldId: "postal-code",
    labels: ["почтовый индекс", "postal code", "zip code", "postcode", "индекс"],
    normalize: normalizePostalCodeValue,
    sectionId: "contacts",
  },
  {
    fieldId: "lives-outside-citizenship",
    labels: [
      "есть вид на жительство в другой стране",
      "проживает вне страны гражданства",
      "lives outside citizenship country",
      "residence outside nationality country",
    ],
    normalize: normalizeYesNoValue,
    sectionId: "contacts",
  },
  {
    fieldId: "residence-permit-type",
    labels: [
      "вид на жительство",
      "документ на проживание",
      "residence permit type",
      "residence document type",
    ],
    sectionId: "contacts",
  },
  {
    fieldId: "residence-permit-number",
    labels: [
      "номер внж",
      "номер вида на жительство",
      "residence permit number",
      "residence document number",
    ],
    sectionId: "contacts",
  },
  {
    fieldId: "residence-permit-valid-until",
    labels: [
      "внж действителен до",
      "вид на жительство действителен до",
      "residence permit valid until",
      "residence document valid until",
    ],
    normalize: normalizeDateValue,
    sectionId: "contacts",
  },
  {
    fieldId: "occupation",
    labels: ["профессия", "occupation", "profession", "job title"],
    normalize: normalizeOccupationValue,
    sectionId: "employment",
  },
  {
    fieldId: "occupation-specify",
    labels: [
      "уточнение профессии",
      "должность",
      "position",
      "occupation specify",
      "job position",
    ],
    normalize: normalizeNameLikeValue,
    sectionId: "employment",
  },
  {
    fieldId: "employer-name",
    labels: [
      "работодатель",
      "место работы",
      "employer",
      "company",
      "workplace",
      "school",
      "university",
    ],
    normalize: normalizeNameLikeValue,
    sectionId: "employment",
  },
  {
    fieldId: "employer-contact",
    labels: [
      "телефон работодателя",
      "employer phone",
      "employer contact",
      "work phone",
    ],
    normalize: normalizePhoneValue,
    sectionId: "employment",
  },
  {
    fieldId: "employer-address",
    labels: [
      "адрес работодателя",
      "рабочий адрес",
      "employer address",
      "company address",
      "work address",
    ],
    sectionId: "employment",
  },
  {
    fieldId: "purpose",
    labels: ["цель поездки", "purpose", "purpose of journey", "trip purpose"],
    normalize: normalizePurposeValue,
    sectionId: "trip",
  },
  {
    fieldId: "stay-purpose-details",
    labels: [
      "детали цели поездки",
      "уточнение цели поездки",
      "purpose details",
      "purpose of journey details",
    ],
    sectionId: "trip",
  },
  {
    fieldId: "main-destination",
    labels: ["основная страна назначения", "main destination", "destination country"],
    normalize: normalizeCountryValue,
    sectionId: "trip",
  },
  {
    fieldId: "first-entry-country",
    labels: ["страна первого въезда", "first entry", "first entry country"],
    normalize: normalizeCountryValue,
    sectionId: "trip",
  },
  {
    fieldId: "entry-count",
    labels: ["количество въездов", "number of entries", "entries"],
    normalize: normalizeEntryCountValue,
    sectionId: "trip",
  },
  {
    fieldId: "arrival-date",
    labels: ["дата въезда", "arrival date", "date of arrival", "travel start"],
    normalize: normalizeDateValue,
    sectionId: "trip",
  },
  {
    fieldId: "departure-date",
    labels: ["дата выезда", "departure date", "date of departure", "travel end"],
    normalize: normalizeDateValue,
    sectionId: "trip",
  },
  {
    fieldId: "stay-duration",
    labels: ["длительность", "duration", "stay duration", "days"],
    normalize: normalizeNumberValue,
    sectionId: "trip",
  },
  {
    fieldId: "previous-biometrics",
    labels: ["отпечатки", "биометрия", "fingerprints", "biometrics"],
    normalize: normalizeYesNoValue,
    sectionId: "trip",
  },
  {
    fieldId: "previous-biometrics-date",
    labels: [
      "дата сдачи отпечатков",
      "дата биометрии",
      "fingerprints date",
      "biometrics date",
    ],
    normalize: normalizeDateValue,
    sectionId: "trip",
  },
  {
    fieldId: "previous-visa-number",
    labels: [
      "номер предыдущей визы",
      "номер визы",
      "previous visa number",
      "visa number",
    ],
    sectionId: "trip",
  },
  {
    fieldId: "hotel-name",
    labels: [
      "название отеля",
      "отель",
      "hotel name",
      "hotel",
      "host name",
      "inviting party name",
    ],
    normalize: normalizeNameLikeValue,
    sectionId: "hotel",
  },
  {
    fieldId: "hotel-country",
    labels: ["страна отеля", "hotel country", "host country"],
    normalize: normalizeCountryValue,
    sectionId: "hotel",
  },
  {
    fieldId: "hotel-city",
    labels: ["город отеля", "hotel city", "host city"],
    normalize: normalizeCityLikeValue,
    sectionId: "hotel",
  },
  {
    fieldId: "hotel-postal-code",
    labels: ["индекс отеля", "hotel postal", "hotel postcode"],
    normalize: normalizePostalCodeValue,
    sectionId: "hotel",
  },
  {
    fieldId: "hotel-address",
    labels: ["адрес отеля", "hotel address", "host address", "invitation address"],
    sectionId: "hotel",
  },
  {
    fieldId: "hotel-email",
    labels: ["email отеля", "hotel email", "host email"],
    normalize: normalizeEmailValue,
    sectionId: "hotel",
  },
  {
    fieldId: "hotel-contact",
    labels: ["телефон отеля", "hotel phone", "hotel contact", "host phone"],
    normalize: normalizePhoneValue,
    sectionId: "hotel",
  },
  {
    fieldId: "company-org-details",
    labels: [
      "данные организации",
      "данные приглашающей организации",
      "organization details",
      "company details",
    ],
    sectionId: "hotel",
  },
  {
    fieldId: "company-contact-person",
    labels: [
      "контактное лицо организации",
      "контактное лицо",
      "company contact person",
      "organization contact person",
    ],
    sectionId: "hotel",
  },
  {
    fieldId: "company-phone",
    labels: [
      "телефон организации",
      "телефон компании",
      "company phone",
      "organization phone",
    ],
    normalize: normalizePhoneValue,
    sectionId: "hotel",
  },
  {
    fieldId: "cost-covered-by",
    labels: ["кто оплачивает", "cost covered by", "paid by", "payer"],
    normalize: normalizeCostCoveredByValue,
    sectionId: "payment",
  },
  {
    fieldId: "means-of-support",
    labels: ["средства заявителя", "means of support", "support means"],
    normalize: normalizeMeansOfSupportValue,
    sectionId: "payment",
  },
  {
    fieldId: "sponsor-in-host-fields",
    labels: [
      "спонсор указан у принимающей стороны",
      "спонсор в данных принимающей стороны",
      "sponsor in host fields",
    ],
    normalize: normalizeYesNoValue,
    sectionId: "payment",
  },
  {
    fieldId: "other-sponsor",
    labels: ["другой спонсор", "имя спонсора", "other sponsor", "sponsor name"],
    sectionId: "payment",
  },
  {
    fieldId: "sponsor-means",
    labels: ["средства спонсора", "sponsor means", "sponsor support means"],
    sectionId: "payment",
  },
];

const exactFieldIdsByNormalizedLabel = new Map<string, string[]>();
for (const spec of fieldSpecs) {
  for (const label of spec.labels) {
    const normalizedLabel = normalizeForMatch(label);
    const fieldIds = exactFieldIdsByNormalizedLabel.get(normalizedLabel) ?? [];
    if (!fieldIds.includes(spec.fieldId)) {
      fieldIds.push(spec.fieldId);
      exactFieldIdsByNormalizedLabel.set(normalizedLabel, fieldIds);
    }
  }
}

const questionnaireDataLabelSpans = fieldSpecs.flatMap((spec) =>
  spec.labels.map((label) => ({
    fieldId: spec.fieldId,
    label,
    pattern: normalizedLabelSpanPattern(label),
  })),
);

export function questionnaireDataFieldIdsForExactLabel(label: string) {
  const normalizedLabel = normalizeForMatch(label);
  return normalizedLabel
    ? [...(exactFieldIdsByNormalizedLabel.get(normalizedLabel) ?? [])]
    : [];
}

export function findQuestionnaireDataLabelSpan(
  value: string,
  fieldIds: ReadonlySet<string>,
) {
  let best: { end: number; fieldId: string; label: string; start: number } | undefined;
  for (const entry of questionnaireDataLabelSpans) {
    if (!fieldIds.has(entry.fieldId)) continue;
    const match = entry.pattern.exec(value);
    if (match?.index === undefined || !match[0]) continue;
    const leadingBoundaryLength = match[1]?.length ?? 0;
    const start = match.index + leadingBoundaryLength;
    const end = start + match[0].length - leadingBoundaryLength;
    if (!best || start < best.start || (start === best.start && end > best.end)) {
      best = { end, fieldId: entry.fieldId, label: entry.label, start };
    }
  }
  return best;
}

function normalizedLabelSpanPattern(label: string) {
  const tokens = normalizeForMatch(label).split(" ").filter(Boolean);
  const body = tokens
    .map((token) =>
      token === "no" || token === "number"
        ? "(?:no|number|№|#)"
        : token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"),
    )
    .join("[^a-zа-я0-9]+?");
  return new RegExp(`(^|[^a-zа-я0-9])${body}(?=$|[^a-zа-я0-9])`, "iu");
}

export async function extractQuestionnaireDataFromImage(
  file: File,
): Promise<QuestionnaireDataImageResult> {
  if (!supportedQuestionnaireDataImageMimeTypes.has(file.type)) {
    return {
      fields: [],
      rawText: "",
      status: "unsupported",
      summary: "Можно загрузить JPG, PNG или WEBP с данными заявителя.",
    };
  }

  try {
    const rawText = await invokeLocalDataImageOcr(file);
    const fields = parseQuestionnaireDataText(rawText);
    if (!rawText.trim() || !fields.length) {
      return {
        fields: [],
        rawText,
        status: "empty",
        summary:
          "Текст найден, но поля анкеты не распознаны. Лучше добавить подписи: Фамилия, Имя, Адрес, Телефон и т.д.",
      };
    }

    return {
      fields,
      rawText,
      status: "extracted",
      summary: `Найдено ${fields.length} полей из фото с данными.`,
    };
  } catch {
    return {
      fields: [],
      rawText: "",
      status: "failed",
      summary:
        "Не удалось распознать фото с данными. Попробуйте более четкое изображение или заполните вручную.",
    };
  }
}

export function parseQuestionnaireDataText(
  text: string,
): QuestionnaireDataImageField[] {
  const cleanText = text.replace(/\r/g, "\n");
  const keyValueLines = extractKeyValueLines(cleanText);
  const byFieldId = new Map<string, QuestionnaireDataImageField>();

  for (const row of keyValueLines) {
    if (isFullNameLabel(row.label)) {
      const [surname, firstName] = splitFullNameValue(row.value);
      if (surname) {
        mergeDataImageField(byFieldId, {
          confidence: "high",
          fieldId: "surname",
          label: row.label,
          rawValue: row.value,
          sectionId: "personal",
          value: surname,
        });
      }
      if (firstName) {
        mergeDataImageField(byFieldId, {
          confidence: "high",
          fieldId: "first-name",
          label: row.label,
          rawValue: row.value,
          sectionId: "personal",
          value: firstName,
        });
      }
      continue;
    }

    const spec = fieldSpecForLabel(row.label);
    if (!spec) continue;
    const value = normalizeDataImageValue(spec, row.value);
    if (!value) continue;
    mergeDataImageField(byFieldId, {
      confidence: spec.confidence ?? "high",
      fieldId: spec.fieldId,
      label: row.label,
      rawValue: row.value,
      sectionId: spec.sectionId,
      value,
    });
  }

  inferUnlabelledFields(cleanText).forEach((field) =>
    mergeDataImageField(byFieldId, field),
  );

  return Array.from(byFieldId.values());
}

async function invokeLocalDataImageOcr(file: File) {
  // tesseract.js does not publish declarations for this recognize-only subpath.
  // @ts-expect-error see note above
  const tesseract = await import("tesseract.js/src/Tesseract.js");
  const recognize = tesseract.recognize ?? tesseract.default.recognize;

  try {
    const response = await withDataImageOcrTimeout<DataImageOcrResponse>(
      recognize(file, "eng+rus", dataImageOcrOptions),
    );
    return response.data.text;
  } catch {
    const response = await withDataImageOcrTimeout<DataImageOcrResponse>(
      recognize(file, "eng", dataImageOcrOptions),
    );
    return response.data.text;
  }
}

function withDataImageOcrTimeout<T>(task: Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    const timer = globalThis.setTimeout(
      () => reject(new Error("Local questionnaire data OCR timed out.")),
      dataImageOcrTimeoutMs,
    );

    task.then(
      (result) => {
        globalThis.clearTimeout(timer);
        resolve(result);
      },
      (error: unknown) => {
        globalThis.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function isFullNameLabel(label: string) {
  const normalized = normalizeForMatch(label);
  return ["фио", "full name", "applicant", "заявитель"].some(
    (candidate) => normalized === normalizeForMatch(candidate),
  );
}

function splitFullNameValue(value: string) {
  const tokens = normalizeLooseValue(value)
    .replace(/\b(mr|mrs|ms|miss)\.?\b/gi, "")
    .split(/\s+/)
    .map((token) => token.replace(/[^A-ZА-ЯЁ-]/gi, "").toUpperCase())
    .filter(Boolean);
  if (tokens.length < 2) return ["", ""] as const;
  return [tokens[0] ?? "", tokens[1] ?? ""] as const;
}

function extractKeyValueLines(text: string) {
  const lines = text
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  const rows: Array<{ label: string; value: string }> = [];

  lines.forEach((line, index) => {
    const explicit = /^(.{2,70}?)[\s]*(?::|=|—|–)[\s]*(.{1,160})$/.exec(line);
    if (explicit) {
      rows.push({ label: explicit[1] ?? "", value: explicit[2] ?? "" });
      return;
    }

    const labelOnlySpec = fieldSpecForLabel(line);
    const nextLine = lines[index + 1] ?? "";
    if (labelOnlySpec && nextLine && !fieldSpecForLabel(nextLine)) {
      rows.push({ label: line, value: nextLine });
    }
  });

  return rows;
}

function fieldSpecForLabel(label: string) {
  const normalizedLabel = normalizeForMatch(label);
  if (!normalizedLabel) return undefined;

  const labelledSpecs = fieldSpecs.flatMap((spec) =>
    spec.labels.map((candidate) => ({
      candidate,
      normalizedCandidate: normalizeForMatch(candidate),
      spec,
    })),
  );

  const exact = labelledSpecs.find(
    (item) => normalizedLabel === item.normalizedCandidate,
  );
  if (exact) return exact.spec;

  const contained = labelledSpecs
    .filter(
      (item) =>
        item.normalizedCandidate.length >= 4 &&
        normalizedLabel.includes(item.normalizedCandidate),
    )
    .sort((a, b) => b.normalizedCandidate.length - a.normalizedCandidate.length);

  return contained[0]?.spec;
}

function inferUnlabelledFields(text: string): QuestionnaireDataImageField[] {
  const fields: QuestionnaireDataImageField[] = [];
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? "";
  if (email) {
    fields.push({
      confidence: "medium",
      fieldId: "email",
      label: "email",
      rawValue: email,
      sectionId: "contacts",
      value: email.toLowerCase(),
    });
  }

  const dates = Array.from(
    new Set(
      (
        text.match(
          /(?:\d{1,2}[./-]\d{1,2}[./-]\d{2,4}|\d{4}[./-]\d{1,2}[./-]\d{1,2})/g,
        ) ?? []
      )
        .map(normalizeDateValue)
        .filter(Boolean),
    ),
  );
  if (dates[0]) {
    fields.push({
      confidence: "low",
      fieldId: "birth-date",
      label: "date",
      rawValue: dates[0],
      sectionId: "personal",
      value: dates[0],
    });
  }

  const passportNumber = normalizePassportNumberValue(
    text.match(/(?:passport|паспорт)[^\dA-ZА-Я]{0,20}([A-ZА-Я0-9]{6,12})/i)?.[1] ?? "",
  );
  if (passportNumber) {
    fields.push({
      confidence: "medium",
      fieldId: "passport-no",
      label: "passport",
      rawValue: passportNumber,
      sectionId: "passport",
      value: passportNumber,
    });
  }

  return fields;
}

function mergeDataImageField(
  byFieldId: Map<string, QuestionnaireDataImageField>,
  field: QuestionnaireDataImageField,
) {
  const current = byFieldId.get(field.fieldId);
  if (
    !current ||
    confidenceRank(field.confidence) >= confidenceRank(current.confidence)
  ) {
    byFieldId.set(field.fieldId, field);
  }
}

function confidenceRank(confidence: QuestionnaireDataImageConfidence) {
  if (confidence === "high") return 3;
  if (confidence === "medium") return 2;
  return 1;
}

function normalizeDataImageValue(spec: DataImageFieldSpec, value: string) {
  return (spec.normalize ? spec.normalize(value) : normalizeLooseValue(value)).trim();
}

function normalizeForMatch(value: string) {
  return value
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[№#]/g, " number ")
    .replace(/[^a-zа-я0-9]+/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeLooseValue(value: string) {
  return value
    .replace(/^[-—–:;\s]+/, "")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeNameLikeValue(value: string) {
  return normalizeLooseValue(value).toUpperCase();
}

function normalizeCityLikeValue(value: string) {
  return normalizeLooseValue(value).replace(/\s+/g, " ").trim();
}

function normalizeEmailValue(value: string) {
  return (
    value.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0]?.toLowerCase() ?? ""
  );
}

function normalizePhoneValue(value: string) {
  const normalized = normalizeLooseValue(value);
  const plus = normalized.trim().startsWith("+") ? "+" : "";
  const digits = normalized.replace(/\D/g, "");
  return digits.length >= 7 ? `${plus}${digits}` : "";
}

function normalizePostalCodeValue(value: string) {
  return (
    normalizeLooseValue(value)
      .match(/[A-Z0-9 -]{4,12}/i)?.[0]
      ?.replace(/\s+/g, " ")
      .trim() ?? ""
  );
}

function normalizePassportNumberValue(value: string) {
  return normalizeLooseValue(value)
    .replace(/[^A-ZА-Я0-9]/gi, "")
    .toUpperCase()
    .slice(0, 12);
}

function normalizeNumberValue(value: string) {
  return normalizeLooseValue(value).match(/\d{1,3}/)?.[0] ?? "";
}

function normalizeDateValue(value: string) {
  const trimmed = normalizeLooseValue(value);
  const dotted = /(?<!\d)(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})(?!\d)/.exec(trimmed);
  const iso = /(?<!\d)(\d{4})[./-](\d{1,2})[./-](\d{1,2})(?!\d)/.exec(trimmed);
  const year = iso ? Number(iso[1]) : dotted ? Number(dotted[3]) : NaN;
  const month = iso ? Number(iso[2]) : dotted ? Number(dotted[2]) : NaN;
  const day = iso ? Number(iso[3]) : dotted ? Number(dotted[1]) : NaN;
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day))
    return "";
  const fullYear = year < 100 ? (year > 40 ? 1900 + year : 2000 + year) : year;
  const parsed = new Date(fullYear, month - 1, day);
  if (
    parsed.getFullYear() !== fullYear ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return "";
  }
  return `${String(day).padStart(2, "0")}.${String(month).padStart(2, "0")}.${fullYear}`;
}

function normalizeCountryValue(value: string) {
  const clean = normalizeLooseValue(value);
  const alias = countryAliases.find(([pattern]) => pattern.test(clean));
  return alias?.[1] ?? clean;
}

function normalizeOccupationValue(value: string) {
  const clean = normalizeLooseValue(value);
  const upper = clean.toUpperCase();
  const alias = occupationAliases.find(([pattern]) => pattern.test(clean));
  return alias?.[1] ?? upper;
}

function normalizeGenderValue(value: string) {
  const normalized = normalizeForMatch(value);
  if (
    /^(m|male|м|мужскои|мужчина)$/.test(normalized) ||
    normalized.includes("male") ||
    normalized.includes("муж")
  ) {
    return "Мужской";
  }
  if (
    /^(f|female|ж|женскии|женщина)$/.test(normalized) ||
    normalized.includes("female") ||
    normalized.includes("жен")
  ) {
    return "Женский";
  }
  return normalized ? "Другое" : "";
}

function normalizeMaritalStatusValue(value: string) {
  const normalized = normalizeForMatch(value);
  if (
    normalized.includes("single") ||
    normalized.includes("холост") ||
    normalized.includes("не замуж")
  )
    return "Холост/не замужем";
  if (
    normalized.includes("married") ||
    normalized.includes("женат") ||
    normalized.includes("замуж")
  )
    return "Женат/замужем";
  if (normalized.includes("divorced") || normalized.includes("развед"))
    return "Разведен(а)";
  if (normalized.includes("widow") || normalized.includes("вдов"))
    return "Вдовец/вдова";
  if (normalized.includes("partner") || normalized.includes("партнер"))
    return "Зарегистрированное партнерство";
  if (normalized.includes("separated") || normalized.includes("раздель"))
    return "Раздельно";
  return normalized ? "Иное" : "";
}

function normalizePassportTypeValue(value: string) {
  const normalized = normalizeForMatch(value);
  if (normalized.includes("diplomatic")) return "Diplomatic Passport";
  if (normalized.includes("service")) return "Service Passport";
  if (normalized.includes("official")) return "Official Passport";
  if (normalized.includes("special")) return "Special Passport";
  if (normalized.includes("travel document")) return "Travel Document";
  if (normalized.includes("ordinary") || normalized.includes("паспорт"))
    return "Ordinary Passport";
  return "Ordinary Passport";
}

function normalizePurposeValue(value: string) {
  const normalized = normalizeForMatch(value);
  if (normalized.includes("business") || normalized.includes("бизнес"))
    return "BUSINESS";
  if (
    normalized.includes("family") ||
    normalized.includes("friend") ||
    normalized.includes("родствен") ||
    normalized.includes("друз")
  )
    return "VISITING FAMILY OR FRIENDS";
  if (normalized.includes("study") || normalized.includes("учеб")) return "STUDY";
  if (normalized.includes("medical") || normalized.includes("лечен"))
    return "MEDICAL TREATMENT";
  if (normalized.includes("official") || normalized.includes("официаль"))
    return "OFFICIAL VISIT";
  if (normalized.includes("culture") || normalized.includes("культур"))
    return "CULTURAL";
  if (normalized.includes("sport") || normalized.includes("спорт")) return "SPORTS";
  if (normalized.includes("transit") || normalized.includes("транзит"))
    return "TRANSIT";
  if (
    normalized.includes("tour") ||
    normalized.includes("туризм") ||
    normalized.includes("турист")
  )
    return "TOURISM";
  return normalized ? "OTHER" : "";
}

function normalizeEntryCountValue(value: string) {
  const normalized = normalizeForMatch(value);
  if (
    normalized.includes("multi") ||
    normalized.includes("много") ||
    normalized.includes("multiple")
  )
    return "Многократная";
  if (normalized.includes("two") || normalized.includes("дв")) return "Двукратная";
  if (normalized.includes("single") || normalized.includes("одно"))
    return "Однократная";
  return "Многократная";
}

function normalizeYesNoValue(value: string) {
  const normalized = normalizeForMatch(value);
  if (
    ["yes", "y", "да", "true"].includes(normalized) ||
    normalized.includes("yes") ||
    normalized.includes("да")
  )
    return "Да";
  if (
    ["no", "n", "нет", "false"].includes(normalized) ||
    normalized.includes("no") ||
    normalized.includes("нет")
  )
    return "Нет";
  return "";
}

function normalizeCostCoveredByValue(value: string) {
  const normalized = normalizeForMatch(value);
  if (normalized.includes("sponsor") || normalized.includes("спонс")) return "Спонсор";
  if (
    normalized.includes("applicant") ||
    normalized.includes("сам") ||
    normalized.includes("заявител")
  )
    return "Сам заявитель";
  return "Сам заявитель";
}

function normalizeMeansOfSupportValue(value: string) {
  const normalized = normalizeForMatch(value);
  if (normalized.includes("credit") || normalized.includes("кредит"))
    return "Кредитная карта";
  if (normalized.includes("cheque") || normalized.includes("чек"))
    return "Дорожные чеки";
  if (normalized.includes("accommodation") || normalized.includes("жиль"))
    return "Жилье предоплачено";
  if (normalized.includes("transport") || normalized.includes("транспорт"))
    return "Транспорт предоплачен";
  if (normalized.includes("cash") || normalized.includes("налич")) return "Наличные";
  return "Иное";
}
