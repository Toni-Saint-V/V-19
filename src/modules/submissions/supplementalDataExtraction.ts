import { extractPdfTextFromFile, isVisaApplicationPdfFile } from "./pdfTextExtraction";
import type { ProductApplicantFields } from "./productIntakeFlow";

type TesseractRecognizeResponse = {
  data: {
    text?: string;
  };
};

type TesseractRecognize = (
  image: unknown,
  language: string,
  options: Record<string, string | boolean>,
) => Promise<TesseractRecognizeResponse>;

export type SupplementalDataExtractionFieldKey = keyof ProductApplicantFields;

export type SupplementalDataExtractionResult = {
  confidence: number;
  fields: Partial<ProductApplicantFields>;
  fieldKeys: SupplementalDataExtractionFieldKey[];
  rawText: string;
  source: "image_ocr" | "pdf_text" | "pdf_ocr";
  status: "extracted" | "unavailable";
  summary: string;
};

const supplementalOcrTimeoutMs = 45_000;
const localTesseractOptions = {
  cacheMethod: "none",
  corePath: "/tesseract/core",
  gzip: true,
  langPath: "/tesseract/lang",
  workerBlobURL: false,
  workerPath: "/tesseract/worker.min.js",
};

const supportedImageMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const occupationOptions = new Set([
  "UNEMPLOYED",
  "ACCOUNTANT",
  "ACTOR",
  "ARCHITECT",
  "ARTISAN",
  "ARTIST",
  "BANKER",
  "BUSINESSMAN",
  "CHEF",
  "CIVIL SERVANT",
  "COMPANY DIRECTOR",
  "CONSULTANT",
  "DENTIST",
  "DESIGNER",
  "DOCTOR",
  "DRIVER",
  "ECONOMIST",
  "ENGINEER",
  "FARMER",
  "FINANCIER",
  "FISHERMAN",
  "HOUSEWIFE",
  "IT PROFESSIONAL",
  "JOURNALIST",
  "JUDGE",
  "LABOURER",
  "LAWYER",
  "MANAGER",
  "MILITARY",
  "MINOR",
  "NURSE",
  "PENSIONER",
  "PHARMACIST",
  "PHOTOGRAPHER",
  "PILOT",
  "POLICE OFFICER",
  "PROFESSOR",
  "RETIRED",
  "SAILOR",
  "SALESPERSON",
  "SCIENTIST",
  "SECRETARY",
  "SELF EMPLOYED",
  "STAGIAIRE (STUDENT/INTERN)",
  "STUDENT",
  "TEACHER",
  "TECHNICIAN (OTHER)",
  "TRADER",
  "TRANSLATOR",
  "WRITER",
  "OTHER",
]);

const countryAliases: Array<[RegExp, string]> = [
  [/^(russia|rus|rf|россия|рф|russian federation)$/i, "Russian Federation"],
  [/^(ussr|ссср)$/i, "USSR"],
  [/^(spain|esp|испания)$/i, "Spain"],
  [/^(france|франция)$/i, "France"],
  [/^(germany|германия)$/i, "Germany"],
  [/^(italy|италия)$/i, "Italy"],
  [/^(portugal|португалия)$/i, "Portugal"],
  [/^(turkey|турция)$/i, "Turkey"],
  [/^(china|китай)$/i, "China"],
  [/^(united kingdom|uk|великобритания)$/i, "United Kingdom"],
  [/^(united states|usa|сша)$/i, "United States"],
];

const cityAliases: Array<[RegExp, string]> = [
  [/(^|\b)(москва|moscow|msk)(\b|$)/i, "Москва"],
  [/(^|\b)(санкт[-\s]?петербург|saint[-\s]?petersburg|st\.?\s?petersburg|spb|спб)(\b|$)/i, "Санкт-Петербург"],
  [/(^|\b)(казань|kazan)(\b|$)/i, "Казань"],
  [/(^|\b)(екатеринбург|yekaterinburg|ekaterinburg|ekb|екб)(\b|$)/i, "Екатеринбург"],
  [/(^|\b)(новосибирск|novosibirsk|nsk|нск)(\b|$)/i, "Новосибирск"],
  [/(^|\b)(нижний\s+новгород|nizhny\s+novgorod|nn|нн)(\b|$)/i, "Нижний Новгород"],
  [/(^|\b)(самара|samara)(\b|$)/i, "Самара"],
  [/(^|\b)(ростов[-\s]?на[-\s]?дону|rostov[-\s]?on[-\s]?don)(\b|$)/i, "Ростов-на-Дону"],
];

const fieldStopPattern = new RegExp(
  [
    "фамилия",
    "surname",
    "last name",
    "first name",
    "given name",
    "имя",
    "дата рождения",
    "date of birth",
    "место рождения",
    "place of birth",
    "гражданство",
    "nationality",
    "паспорт",
    "passport",
    "адрес",
    "address",
    "город",
    "city",
    "индекс",
    "postal",
    "email",
    "e-mail",
    "телефон",
    "phone",
    "профессия",
    "occupation",
    "работодатель",
    "employer",
    "отель",
    "hotel",
    "дата въезда",
    "arrival",
    "дата выезда",
    "departure",
  ].join("|"),
  "i",
);

export function isSupplementalDataUploadCandidate(file: File) {
  const name = file.name.toLowerCase();
  return (
    supportedImageMimeTypes.has(file.type) ||
    file.type === "application/pdf" ||
    /\.(jpe?g|png|webp|pdf)$/i.test(name)
  );
}

export async function extractSupplementalDataFromFile(
  file: File,
): Promise<SupplementalDataExtractionResult> {
  if (!isSupplementalDataUploadCandidate(file)) {
    throw new Error("Загрузите картинку или PDF с данными заявителя.");
  }

  const pdf = isVisaApplicationPdfFile(file);
  const extracted = pdf
    ? await extractSupplementalTextFromPdf(file)
    : await extractSupplementalTextFromImage(file);
  const rawText = extracted.text.trim();
  const fields = parseSupplementalApplicantText(rawText);
  const fieldKeys = Object.keys(fields) as SupplementalDataExtractionFieldKey[];

  if (!fieldKeys.length) {
    return {
      confidence: 0,
      fields: {},
      fieldKeys: [],
      rawText,
      source: extracted.source,
      status: "unavailable",
      summary: "Карточка прочитана, но явных полей анкеты не найдено.",
    };
  }

  const confidence = Math.min(0.93, 0.48 + fieldKeys.length * 0.045);
  return {
    confidence,
    fields,
    fieldKeys,
    rawText,
    source: extracted.source,
    status: "extracted",
    summary: `Из карточки данных найдено ${fieldKeys.length} полей для анкеты.`,
  };
}

async function extractSupplementalTextFromPdf(file: File) {
  const result = await extractPdfTextFromFile(file);
  return {
    source: result.source === "text_layer" ? "pdf_text" as const : "pdf_ocr" as const,
    text: result.text,
  };
}

async function extractSupplementalTextFromImage(file: File) {
  const recognize = await loadLocalTesseractRecognize();
  const languages = ["rus+eng", "eng"];
  let lastError: unknown;

  for (const language of languages) {
    try {
      const response = await withSupplementalOcrTimeout(
        recognize(file, language, localTesseractOptions),
      );
      const text = response.data.text?.trim() ?? "";
      if (text) return { source: "image_ocr" as const, text };
    } catch (error: unknown) {
      lastError = error;
    }
  }

  throw lastError instanceof Error
    ? lastError
    : new Error("OCR карточки данных не смог прочитать текст.");
}

async function loadLocalTesseractRecognize(): Promise<TesseractRecognize> {
  // tesseract.js does not publish declarations for this recognize-only subpath.
  // @ts-expect-error see note above
  const tesseract = await import("tesseract.js/src/Tesseract.js");
  const recognize = tesseract.recognize ?? tesseract.default?.recognize;
  if (!recognize) throw new Error("Локальный OCR карточки данных недоступен.");
  return recognize as TesseractRecognize;
}

function withSupplementalOcrTimeout<T>(task: Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    const timer = globalThis.setTimeout(
      () => reject(new Error("OCR карточки данных не успел обработать файл.")),
      supplementalOcrTimeoutMs,
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

export function parseSupplementalApplicantText(text: string): Partial<ProductApplicantFields> {
  const lines = normalizeLines(text);
  const normalizedText = lines.join("\n");
  const fields: Partial<ProductApplicantFields> = {};

  setIfValue(fields, "surname", readLabeledValue(lines, ["фамилия", "surname", "last name", "family name"]));
  setIfValue(fields, "firstName", readLabeledValue(lines, ["имя", "first name", "given name"]));
  setIfValue(fields, "previousSurname", readLabeledValue(lines, ["предыдущая фамилия", "фамилия при рождении", "maiden name", "surname at birth"]));

  const fullName = readLabeledValue(lines, ["фио", "full name", "applicant"]);
  if (fullName && (!fields.surname || !fields.firstName)) {
    const tokens = fullName
      .replace(/\b(mr|mrs|ms|miss)\.?\b/gi, "")
      .split(/\s+/)
      .map((token) => token.trim())
      .filter(Boolean);
    if (!fields.surname && tokens[0]) fields.surname = normalizePersonToken(tokens[0]);
    if (!fields.firstName && tokens[1]) fields.firstName = normalizePersonToken(tokens[1]);
  }

  setIfValue(fields, "birthDate", normalizeDate(readLabeledValue(lines, ["дата рождения", "date of birth", "birth date", "dob"])));
  setIfValue(fields, "birthPlace", readLabeledValue(lines, ["место рождения", "place of birth", "birth place"]));
  setIfValue(fields, "birthCountry", normalizeCountry(readLabeledValue(lines, ["страна рождения", "country of birth", "birth country"])));
  setIfValue(fields, "nationality", normalizeCountry(readLabeledValue(lines, ["гражданство", "nationality", "citizenship"])),);
  setIfValue(fields, "birthCitizenship", normalizeCountry(readLabeledValue(lines, ["гражданство при рождении", "citizenship at birth"])),);
  setIfValue(fields, "otherCitizenship", normalizeCountry(readLabeledValue(lines, ["иное гражданство", "other citizenship"])),);
  setIfValue(fields, "gender", normalizeGender(readLabeledValue(lines, ["пол", "gender", "sex"])));
  setIfValue(fields, "maritalStatus", normalizeMaritalStatus(readLabeledValue(lines, ["семейное положение", "marital status"])),);
  setIfValue(fields, "nationalId", readLabeledValue(lines, ["национальный id", "national id", "id number"]));

  setIfValue(fields, "passportType", normalizePassportType(readLabeledValue(lines, ["тип паспорта", "тип документа", "passport type", "document type"])),);
  setIfValue(fields, "passportNo", readLabeledValue(lines, ["номер паспорта", "passport no", "passport number", "passport #"]));
  setIfValue(fields, "passportIssuedAt", normalizeDate(readLabeledValue(lines, ["дата выдачи", "issued at", "issue date", "date of issue"])),);
  setIfValue(fields, "passportExpiresAt", normalizeDate(readLabeledValue(lines, ["действителен до", "valid until", "expiry date", "expiration date"])),);
  setIfValue(fields, "passportIssueCountry", normalizeCountry(readLabeledValue(lines, ["страна выдачи", "issuing country", "country of issue"])),);
  setIfValue(fields, "passportIssuePlace", readLabeledValue(lines, ["место выдачи", "place of issue", "issuing place"]));

  setIfValue(fields, "homeAddress", readLabeledValue(lines, ["домашний адрес", "адрес проживания", "адрес регистрации", "home address", "residential address", "registration address"]),);
  setIfValue(fields, "homeCountry", normalizeCountry(readLabeledValue(lines, ["страна проживания", "country of residence", "residence country"])),);
  setIfValue(fields, "homeCity", normalizeKnownCity(readLabeledValue(lines, ["город проживания", "город", "city of residence", "city"])),);
  setIfValue(fields, "postalCode", readLabeledValue(lines, ["почтовый индекс", "индекс", "postal code", "zip"]));
  setIfValue(fields, "email", readEmail(normalizedText));
  setIfValue(fields, "phone", readPhone(lines, ["телефон", "мобильный", "contact number", "phone", "mobile"]));

  setIfValue(fields, "occupation", normalizeOccupation(readLabeledValue(lines, ["профессия", "occupation", "job title", "profession"])),);
  setIfValue(fields, "occupationSpecify", readLabeledValue(lines, ["уточнение профессии", "occupation specify", "position", "должность"]));
  setIfValue(fields, "employerName", readLabeledValue(lines, ["работодатель", "место работы", "employer", "company", "workplace"]));
  setIfValue(fields, "employerAddress", readLabeledValue(lines, ["адрес работодателя", "рабочий адрес", "employer address", "work address", "company address"]),);
  setIfValue(fields, "employerPhone", readPhone(lines, ["телефон работодателя", "employer phone", "work phone", "company phone"]),);

  setIfValue(fields, "purpose", normalizePurpose(readLabeledValue(lines, ["цель поездки", "purpose", "travel purpose"])),);
  setIfValue(fields, "mainDestination", normalizeCountry(readLabeledValue(lines, ["основная страна назначения", "main destination", "destination"])),);
  setIfValue(fields, "firstEntryCountry", normalizeCountry(readLabeledValue(lines, ["страна первого въезда", "first entry country", "first entry"])),);
  setIfValue(fields, "entryCount", normalizeEntryCount(readLabeledValue(lines, ["количество въездов", "entries", "number of entries"])),);
  setIfValue(fields, "arrivalDate", normalizeDate(readLabeledValue(lines, ["дата въезда", "arrival date", "date of arrival", "trip from"])),);
  setIfValue(fields, "departureDate", normalizeDate(readLabeledValue(lines, ["дата выезда", "departure date", "date of departure", "trip to"])),);
  setIfValue(fields, "stayDuration", readLabeledValue(lines, ["длительность пребывания", "stay duration", "duration", "days"]));
  setIfValue(fields, "previousBiometrics", normalizeYesNo(readLabeledValue(lines, ["отпечатки ранее", "previous biometrics", "fingerprints"])),);

  setIfValue(fields, "invitingPartyType", normalizeInvitingPartyType(readLabeledValue(lines, ["тип принимающей стороны", "inviting party type", "host type"])),);
  setIfValue(fields, "hotelName", readLabeledValue(lines, ["название отеля", "отель", "hotel name", "hotel"]));
  setIfValue(fields, "hotelCountry", normalizeCountry(readLabeledValue(lines, ["страна отеля", "hotel country", "host country"])),);
  setIfValue(fields, "hotelCity", readLabeledValue(lines, ["город отеля", "hotel city", "host city"]));
  setIfValue(fields, "hotelPostalCode", readLabeledValue(lines, ["индекс отеля", "hotel postal code", "hotel zip", "host postal code"]),);
  setIfValue(fields, "hotelAddress", readLabeledValue(lines, ["адрес отеля", "hotel address", "host address", "адрес проживания в испании"]),);
  setIfValue(fields, "hotelEmail", readLabeledEmail(lines, ["email отеля", "hotel email", "host email"]));
  setIfValue(fields, "hotelContact", readPhone(lines, ["телефон отеля", "hotel phone", "host phone", "hotel contact"]));

  setIfValue(fields, "costCoveredBy", normalizeCostCoveredBy(readLabeledValue(lines, ["кто оплачивает", "cost covered by", "paid by", "payer"])),);
  setIfValue(fields, "meansOfSupport", normalizeMeansOfSupport(readLabeledValue(lines, ["средства заявителя", "means of support", "support means"])),);

  applyHeuristicFallbacks(fields, normalizedText);
  return compactFields(fields);
}

function normalizeLines(text: string) {
  return text
    .replace(/\r/g, "\n")
    .replace(/[•·]/g, "\n")
    .split(/\n+/)
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

function readLabeledValue(lines: string[], labels: string[]) {
  const labelPattern = labels.map(escapeRegExp).join("|");
  const directPattern = new RegExp(`^(?:${labelPattern})\\s*(?::|=|—|-|–)\\s*(.+)$`, "i");
  const inlinePattern = new RegExp(`(?:^|\\b)(?:${labelPattern})\\s*(?::|=|—|-|–)\\s*([^\\n]+)`, "i");

  for (const line of lines) {
    const direct = directPattern.exec(line);
    if (direct?.[1]) return cleanupValue(direct[1]);
  }

  const text = lines.join("\n");
  const inline = inlinePattern.exec(text);
  if (inline?.[1]) return cleanupValue(inline[1]);
  return "";
}

function readLabeledEmail(lines: string[], labels: string[]) {
  const value = readLabeledValue(lines, labels);
  const match = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(value);
  return match?.[0] ?? "";
}

function readEmail(text: string) {
  const match = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i.exec(text);
  return match?.[0] ?? "";
}

function readPhone(lines: string[], labels: string[]) {
  const value = readLabeledValue(lines, labels);
  const labeled = normalizePhone(value);
  if (labeled) return labeled;

  const phonePattern = /(?:\+?\d[\d\s().-]{7,}\d)/;
  for (const line of lines) {
    if (!labels.some((label) => line.toLowerCase().includes(label.toLowerCase()))) continue;
    const match = phonePattern.exec(line);
    const phone = normalizePhone(match?.[0] ?? "");
    if (phone) return phone;
  }
  return "";
}

function cleanupValue(value: string) {
  const normalized = value
    .replace(/^[:=—\-–\s]+/u, "")
    .replace(/\s+/g, " ")
    .trim();
  const stopMatch = fieldStopPattern.exec(normalized.slice(1));
  const trimmed = stopMatch && stopMatch.index > 3
    ? normalized.slice(0, stopMatch.index + 1).trim()
    : normalized;
  return trimmed.replace(/[;,]+$/u, "").trim();
}

function setIfValue<T extends keyof ProductApplicantFields>(
  fields: Partial<ProductApplicantFields>,
  key: T,
  value: string | undefined,
) {
  const cleaned = value?.trim();
  if (cleaned) fields[key] = cleaned;
}

function compactFields(fields: Partial<ProductApplicantFields>) {
  return Object.fromEntries(
    Object.entries(fields).filter(([, value]) => typeof value === "string" && value.trim()),
  ) as Partial<ProductApplicantFields>;
}

function normalizePersonToken(value: string) {
  return value.replace(/[^A-ZА-ЯЁ\-]/gi, "").toUpperCase();
}

function normalizeDate(value: string | undefined) {
  const raw = value?.trim() ?? "";
  if (!raw) return "";
  const iso = /(20\d{2}|19\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})/.exec(raw);
  if (iso) return `${iso[3].padStart(2, "0")}.${iso[2].padStart(2, "0")}.${iso[1]}`;
  const dotted = /(\d{1,2})[.\-/](\d{1,2})[.\-/]((?:19|20)?\d{2})/.exec(raw);
  if (!dotted) return raw;
  const year = dotted[3].length === 2 ? `20${dotted[3]}` : dotted[3];
  return `${dotted[1].padStart(2, "0")}.${dotted[2].padStart(2, "0")}.${year}`;
}

function normalizePhone(value: string) {
  const cleaned = value.replace(/[^+\d]/g, "");
  const digitCount = cleaned.replace(/\D/g, "").length;
  return digitCount >= 8 ? cleaned : "";
}

function normalizeCountry(value: string | undefined) {
  const raw = value?.trim() ?? "";
  if (!raw) return "";
  const compact = raw.replace(/[.,;]+$/u, "").trim();
  for (const [pattern, country] of countryAliases) {
    if (pattern.test(compact)) return country;
  }
  return compact;
}

function normalizeKnownCity(value: string | undefined) {
  const raw = value?.trim() ?? "";
  if (!raw) return "";
  for (const [pattern, city] of cityAliases) {
    if (pattern.test(raw)) return city;
  }
  return raw;
}

function normalizeGender(value: string | undefined) {
  const raw = value?.trim().toLowerCase() ?? "";
  if (!raw) return "";
  if (/^(m|male|муж|мужской)$/i.test(raw)) return "Мужской";
  if (/^(f|female|жен|женский)$/i.test(raw)) return "Женский";
  return "Другое";
}

function normalizeMaritalStatus(value: string | undefined) {
  const raw = value?.trim().toLowerCase() ?? "";
  if (!raw) return "";
  if (/single|холост|не замуж/i.test(raw)) return "Холост/не замужем";
  if (/married|женат|замуж/i.test(raw)) return "Женат/замужем";
  if (/divorced|развед/i.test(raw)) return "Разведен(а)";
  if (/widow|вдов/i.test(raw)) return "Вдовец/вдова";
  if (/separated|раздель/i.test(raw)) return "Раздельно";
  return "Иное";
}

function normalizePassportType(value: string | undefined) {
  const raw = value?.trim() ?? "";
  if (!raw) return "";
  if (/ordinary|обыч|загран|p\b/i.test(raw)) return "Ordinary Passport";
  if (/diplomatic/i.test(raw)) return "Diplomatic Passport";
  if (/service/i.test(raw)) return "Service Passport";
  if (/official/i.test(raw)) return "Official Passport";
  if (/travel/i.test(raw)) return "Travel Document";
  return raw;
}

function normalizeOccupation(value: string | undefined) {
  const raw = value?.trim() ?? "";
  if (!raw) return "";
  const upper = raw.toUpperCase();
  if (occupationOptions.has(upper)) return upper;
  if (/програм|developer|software|it\b|айти/i.test(raw)) return "IT PROFESSIONAL";
  if (/директор|director/i.test(raw)) return "COMPANY DIRECTOR";
  if (/менедж|manager/i.test(raw)) return "MANAGER";
  if (/предприним|business/i.test(raw)) return "BUSINESSMAN";
  if (/студент|student/i.test(raw)) return "STUDENT";
  if (/пенсион|retired|pension/i.test(raw)) return "RETIRED";
  if (/безработ|unemployed/i.test(raw)) return "UNEMPLOYED";
  return "OTHER";
}

function normalizePurpose(value: string | undefined) {
  const raw = value?.trim() ?? "";
  if (!raw) return "";
  if (/tour|тур/i.test(raw)) return "TOURISM";
  if (/business|делов|бизнес/i.test(raw)) return "BUSINESS";
  if (/family|friend|родствен|друз/i.test(raw)) return "VISITING FAMILY OR FRIENDS";
  if (/study|учеб/i.test(raw)) return "STUDY";
  if (/medical|лечен/i.test(raw)) return "MEDICAL TREATMENT";
  if (/transit|транзит/i.test(raw)) return "TRANSIT";
  return raw.toUpperCase();
}

function normalizeEntryCount(value: string | undefined) {
  const raw = value?.trim() ?? "";
  if (!raw) return "";
  if (/single|одно/i.test(raw)) return "Однократная";
  if (/two|double|дву/i.test(raw)) return "Двукратная";
  if (/multi|много/i.test(raw)) return "Многократная";
  return raw;
}

function normalizeYesNo(value: string | undefined) {
  const raw = value?.trim() ?? "";
  if (!raw) return "";
  if (/^(yes|да|true)$/i.test(raw)) return "Да";
  if (/^(no|нет|false)$/i.test(raw)) return "Нет";
  return raw;
}

function normalizeInvitingPartyType(value: string | undefined) {
  const raw = value?.trim() ?? "";
  if (!raw) return "";
  if (/hotel|гостин|жиль/i.test(raw)) return "Гостиница/временное жилье";
  if (/company|organization|организац|компан/i.test(raw)) return "Приглашающая компания/организация";
  if (/person|лицо|private/i.test(raw)) return "Приглашающее лицо";
  return raw;
}

function normalizeCostCoveredBy(value: string | undefined) {
  const raw = value?.trim() ?? "";
  if (!raw) return "";
  if (/sponsor|спонс/i.test(raw)) return "Спонсор";
  if (/applicant|сам|заявител/i.test(raw)) return "Сам заявитель";
  return raw;
}

function normalizeMeansOfSupport(value: string | undefined) {
  const raw = value?.trim() ?? "";
  if (!raw) return "";
  if (/cash|нал/i.test(raw)) return "Наличные";
  if (/credit|card|карт/i.test(raw)) return "Кредитная карта";
  if (/cheque|чек/i.test(raw)) return "Дорожные чеки";
  if (/accommodation|hotel|жиль/i.test(raw)) return "Жилье предоплачено";
  if (/transport|транспорт/i.test(raw)) return "Транспорт предоплачен";
  return "Иное";
}

function applyHeuristicFallbacks(
  fields: Partial<ProductApplicantFields>,
  text: string,
) {
  if (!fields.homeCity) {
    for (const [pattern, city] of cityAliases) {
      if (pattern.test(text)) {
        fields.homeCity = city;
        break;
      }
    }
  }

  if (!fields.homeCountry && /russian federation|росси/i.test(text)) {
    fields.homeCountry = "Russian Federation";
  }
  if (!fields.hotelCountry && /spain|испан/i.test(text)) {
    fields.hotelCountry = "Spain";
  }

  if (!fields.postalCode) {
    const postal = /(?:индекс|postal code|zip)\D*(\d{5,6})/i.exec(text);
    if (postal?.[1]) fields.postalCode = postal[1];
  }

  if (!fields.stayDuration && fields.arrivalDate && fields.departureDate) {
    const days = daysBetween(fields.arrivalDate, fields.departureDate);
    if (days > 0) fields.stayDuration = String(days + 1);
  }
}

function daysBetween(from: string, to: string) {
  const start = parseDate(from);
  const end = parseDate(to);
  if (!start || !end) return 0;
  return Math.round((end.getTime() - start.getTime()) / 86_400_000);
}

function parseDate(value: string) {
  const match = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(value);
  if (!match) return null;
  return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]));
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
