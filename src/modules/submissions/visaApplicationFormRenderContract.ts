import type { VisaFormData } from "./visaApplicationFormPdf";

export type VisaApplicationFormRenderIssue = {
  key: keyof VisaFormData;
  label: string;
  reason:
    | "invalid_value"
    | "text_overflow"
    | "unsupported_character"
    | "unsupported_choice";
};

export type VisaApplicationFormRenderValidation =
  | { ok: true; fields: [] }
  | { ok: false; fields: VisaApplicationFormRenderIssue[] };

export type VisaFormSelections = {
  costCoveredBy: "applicant" | "sponsor" | null;
  entries: "multiple" | "single" | "two" | null;
  gender: "female" | "male" | null;
  maritalStatus:
    | "divorced"
    | "married"
    | "registered"
    | "separated"
    | "single"
    | "widow"
    | null;
  meansOfSupport:
    | "accommodation"
    | "cash"
    | "cheques"
    | "credit"
    | "other"
    | "transport"
    | null;
  passportType:
    | "diplomatic"
    | "official"
    | "ordinary"
    | "otherDocument"
    | "service"
    | "special"
    | null;
  purpose:
    | "business"
    | "cultural"
    | "medical"
    | "official"
    | "other"
    | "sports"
    | "study"
    | "tourism"
    | "transit"
    | "visit"
    | null;
  sponsorInHostFields: "listed" | "other" | null;
  sponsorMeans: "accommodation" | "allExpenses" | "cash" | "other" | "transport" | null;
};

export class VisaApplicationFormRenderError extends Error {
  constructor(readonly fields: VisaApplicationFormRenderIssue[]) {
    super("Visa application form contains values that cannot be rendered safely.");
    this.name = "VisaApplicationFormRenderError";
  }
}

type ChoiceAliases<T extends string> = ReadonlyArray<readonly [T, readonly string[]]>;

type TextFieldSpec = {
  key: keyof VisaFormData;
  label: string;
  maxWidth: number;
  size: number;
  value: (data: VisaFormData) => string;
};

// The reference PDF keeps its 0.75 page transform active for our appended
// Times-Bold text layer. Keeping this value shared makes the render guard use
// the same coordinate system as the emitted PDF commands.
export const visaFormPdfReferenceScale = 0.75;

// Widths are the Base-14 Times-Bold / WinAnsi metrics in 1/1000 em. The
// renderer emits only normalized printable ASCII in this font and encoding.
const timesBoldWinAnsiWidths: Readonly<Record<string, number>> = {
  " ": 250,
  "!": 333,
  '"': 555,
  "#": 500,
  "$": 500,
  "%": 1000,
  "&": 833,
  "'": 278,
  "(": 333,
  ")": 333,
  "*": 500,
  "+": 570,
  ",": 250,
  "-": 333,
  ".": 250,
  "/": 278,
  "0": 500,
  "1": 500,
  "2": 500,
  "3": 500,
  "4": 500,
  "5": 500,
  "6": 500,
  "7": 500,
  "8": 500,
  "9": 500,
  ":": 333,
  ";": 333,
  "<": 570,
  "=": 570,
  ">": 570,
  "?": 500,
  "@": 930,
  A: 722,
  B: 667,
  C: 722,
  D: 722,
  E: 667,
  F: 611,
  G: 778,
  H: 778,
  I: 389,
  J: 500,
  K: 778,
  L: 667,
  M: 944,
  N: 722,
  O: 778,
  P: 611,
  Q: 778,
  R: 722,
  S: 556,
  T: 667,
  U: 722,
  V: 722,
  W: 1000,
  X: 722,
  Y: 722,
  Z: 667,
  "[": 333,
  "\\": 278,
  "]": 333,
  "^": 581,
  _: 500,
  "`": 333,
  a: 500,
  b: 556,
  c: 444,
  d: 556,
  e: 444,
  f: 333,
  g: 500,
  h: 556,
  i: 278,
  j: 333,
  k: 556,
  l: 278,
  m: 833,
  n: 556,
  o: 500,
  p: 556,
  q: 556,
  r: 444,
  s: 389,
  t: 333,
  u: 556,
  v: 500,
  w: 722,
  x: 500,
  y: 500,
  z: 444,
  "{": 394,
  "|": 220,
  "}": 394,
  "~": 520,
};

const passportNumberPattern = /^[A-Za-z0-9_-]{1,32}$/;
const phoneNumberPattern = /^\+?[0-9][0-9 ()-]{4,31}$/;

const maritalStatusAliases = [
  ["single", ["single", "холост/не замужем", "холост", "не замужем"]],
  ["married", ["married", "женат/замужем", "женат", "замужем"]],
  ["registered", ["registered partnership", "зарегистрированное партнерство"]],
  ["separated", ["separated", "раздельно", "не проживает с супругом/ой"]],
  ["divorced", ["divorced", "разведен(а)", "в разводе"]],
  ["widow", ["widow", "widowed", "вдовец/вдова"]],
] as const satisfies ChoiceAliases<NonNullable<VisaFormSelections["maritalStatus"]>>;

const passportTypeAliases = [
  ["ordinary", ["ordinary", "ordinary passport", "обычный паспорт"]],
  ["diplomatic", ["diplomatic", "diplomatic passport", "дипломатический паспорт"]],
  ["service", ["service", "service passport", "служебный паспорт"]],
  ["official", ["official", "official passport", "официальный паспорт"]],
  ["special", ["special", "special passport", "special passport"]],
  [
    "otherDocument",
    ["other", "travel document", "other travel document", "иной документ"],
  ],
] as const satisfies ChoiceAliases<NonNullable<VisaFormSelections["passportType"]>>;

const purposeAliases = [
  ["tourism", ["tourism", "tour", "туризм"]],
  ["business", ["business", "деловая"]],
  [
    "visit",
    ["visiting family or friends", "visit", "посещение родственников или друзей"],
  ],
  ["cultural", ["cultural", "культура"]],
  ["sports", ["sports", "sport"]],
  ["official", ["official visit", "официальный визит"]],
  ["medical", ["medical treatment", "medical", "лечение"]],
  ["study", ["study", "studies", "учеба", "учёба"]],
  ["transit", ["transit", "аэропортовый транзит"]],
  ["other", ["other", "иное"]],
] as const satisfies ChoiceAliases<NonNullable<VisaFormSelections["purpose"]>>;

const entriesAliases = [
  ["single", ["single", "single entry", "однократная"]],
  ["two", ["two", "double", "two entries", "двукратная"]],
  ["multiple", ["multiple", "multiple entry", "многократная"]],
] as const satisfies ChoiceAliases<NonNullable<VisaFormSelections["entries"]>>;

const meansAliases = [
  ["cash", ["cash", "наличные"]],
  ["cheques", ["traveller's checks", "travelers checks", "дорожные чеки"]],
  ["credit", ["credit card", "creditcard", "кредитная карта"]],
  ["accommodation", ["accommodation", "жилье предоплачено", "жильё предоплачено"]],
  ["transport", ["transport", "транспорт предоплачен"]],
  ["other", ["other", "иное"]],
] as const satisfies ChoiceAliases<NonNullable<VisaFormSelections["meansOfSupport"]>>;

const sponsorMeansAliases = [
  ["cash", ["cash", "наличные"]],
  [
    "accommodation",
    ["accommodation", "жилье предоставляется", "жильё предоставляется"],
  ],
  ["allExpenses", ["all expenses", "все расходы оплачиваются"]],
  ["transport", ["transport", "транспорт предоплачен"]],
  ["other", ["other", "иное"]],
] as const satisfies ChoiceAliases<NonNullable<VisaFormSelections["sponsorMeans"]>>;

const textFieldSpecs: readonly TextFieldSpec[] = [
  {
    key: "surname",
    label: "Фамилия",
    value: (data) => data.surname,
    size: 6.13,
    maxWidth: 112,
  },
  {
    key: "surnameAtBirth",
    label: "Фамилия при рождении",
    value: (data) => data.surnameAtBirth,
    size: 6.13,
    maxWidth: 112,
  },
  {
    key: "firstName",
    label: "Имя",
    value: (data) => data.firstName,
    size: 6.13,
    maxWidth: 112,
  },
  {
    key: "birthDate",
    label: "Дата рождения",
    value: (data) => data.birthDate,
    size: 6.13,
    maxWidth: 90,
  },
  {
    key: "birthPlace",
    label: "Место рождения",
    value: (data) => data.birthPlace,
    size: 6.13,
    maxWidth: 128,
  },
  {
    key: "birthCountry",
    label: "Страна рождения",
    value: (data) => data.birthCountry,
    size: 6.13,
    maxWidth: 128,
  },
  {
    key: "citizenship",
    label: "Гражданство",
    value: (data) => data.citizenship,
    size: 6.13,
    maxWidth: 104,
  },
  {
    key: "nationalityAtBirth",
    label: "Гражданство при рождении",
    value: (data) => data.nationalityAtBirth,
    size: 6.13,
    maxWidth: 104,
  },
  {
    key: "passportNo",
    label: "Номер паспорта",
    value: (data) => data.passportNo,
    size: 6.13,
    maxWidth: 76,
  },
  {
    key: "issueDate",
    label: "Дата выдачи паспорта",
    value: (data) => data.issueDate,
    size: 6.13,
    maxWidth: 78,
  },
  {
    key: "passportExpiry",
    label: "Срок действия паспорта",
    value: (data) => data.passportExpiry,
    size: 6.13,
    maxWidth: 78,
  },
  {
    key: "issuePlace",
    label: "Страна и место выдачи паспорта",
    value: (data) => joinVisaFormValues(data.issueCountry, data.issuePlace),
    size: 6.13,
    maxWidth: 104,
  },
  {
    key: "email",
    label: "Email",
    value: (data) => data.email,
    size: 6.13,
    maxWidth: 210,
  },
  {
    key: "address",
    label: "Домашний адрес",
    value: (data) => data.address,
    size: 6.13,
    maxWidth: 210,
  },
  {
    key: "addressCity",
    label: "Город, страна и индекс",
    value: (data) =>
      joinVisaFormValues(data.addressCity, data.residenceCountry, data.postalCode),
    size: 6.13,
    maxWidth: 210,
  },
  {
    key: "phone",
    label: "Телефон",
    value: (data) => data.phone,
    size: 6.13,
    maxWidth: 105,
  },
  {
    key: "occupation",
    label: "Профессия",
    value: (data) => data.occupation,
    size: 6.13,
    maxWidth: 132,
  },
  {
    key: "employer",
    label: "Работодатель или учебное заведение",
    value: (data) => data.employer,
    size: 6.13,
    maxWidth: 352,
  },
  {
    key: "visaSubType",
    label: "Дополнительные сведения о цели поездки",
    value: (data) => data.visaSubType,
    size: 6.13,
    maxWidth: 352,
  },
  {
    key: "mainDestination",
    label: "Основная страна назначения",
    value: (data) => data.mainDestination,
    size: 6.13,
    maxWidth: 222,
  },
  {
    key: "firstEntryCountry",
    label: "Страна первого въезда",
    value: (data) => data.firstEntryCountry,
    size: 6.13,
    maxWidth: 222,
  },
  {
    key: "tripFrom",
    label: "Дата въезда",
    value: (data) => data.tripFrom,
    size: 6.13,
    maxWidth: 78,
  },
  {
    key: "tripTo",
    label: "Дата выезда",
    value: (data) => data.tripTo,
    size: 6.13,
    maxWidth: 78,
  },
  {
    key: "duration",
    label: "Длительность пребывания",
    value: (data) => data.duration,
    size: 6.13,
    maxWidth: 78,
  },
  {
    key: "hotelName",
    label: "Принимающая сторона или отель",
    value: (data) =>
      joinVisaFormValues(
        data.hotelName,
        data.hotelAddress,
        data.hotelCity,
        data.hotelCountry,
      ),
    size: 6.13,
    maxWidth: 364,
  },
  {
    key: "hotelAddress",
    label: "Адрес принимающей стороны или отеля",
    value: (data) => data.hotelAddress,
    size: 6.13,
    maxWidth: 210,
  },
  {
    key: "hotelCity",
    label: "Город и email принимающей стороны",
    value: (data) =>
      joinVisaFormValues(data.hotelCity, data.hotelCountry, data.hotelEmail),
    size: 6.13,
    maxWidth: 170,
  },
  {
    key: "hotelPhone",
    label: "Телефон принимающей стороны",
    value: (data) => data.hotelPhone,
    size: 6.13,
    maxWidth: 112,
  },
  {
    key: "companyDetails",
    label: "Компания или организация",
    value: (data) => data.companyDetails ?? "",
    size: 6.13,
    maxWidth: 460,
  },
  {
    key: "companyContact",
    label: "Контактное лицо компании",
    value: (data) => data.companyContact ?? "",
    size: 6.13,
    maxWidth: 210,
  },
  {
    key: "companyPhone",
    label: "Телефон компании",
    value: (data) => data.companyPhone ?? "",
    size: 6.13,
    maxWidth: 112,
  },
  {
    key: "addressCity",
    label: "Город для даты и места",
    value: (data) => `${visaFormCityToLatin(data.addressCity)}, 00-00-0000`,
    size: 6.13,
    maxWidth: 220,
  },
];

export function assertVisaFormDataRenderable(data: VisaFormData): VisaFormSelections {
  const validation = validateVisaFormDataForRendering(data);
  if (!validation.ok) throw new VisaApplicationFormRenderError(validation.fields);
  return resolveVisaFormSelections(data);
}

export function validateVisaFormDataForRendering(
  data: VisaFormData,
): VisaApplicationFormRenderValidation {
  const selections = resolveVisaFormSelections(data);
  const fields: VisaApplicationFormRenderIssue[] = [];

  validatePassportNumber(fields, data.passportNo);
  validatePhoneNumber(fields, "phone", "Телефон", data.phone);
  validatePhoneNumber(
    fields,
    "hotelPhone",
    "Телефон принимающей стороны",
    data.hotelPhone,
  );
  validatePhoneNumber(fields, "companyPhone", "Телефон компании", data.companyPhone);
  validateVisaFormDate(fields, "birthDate", "Дата рождения", data.birthDate);
  validateVisaFormDate(fields, "issueDate", "Дата выдачи паспорта", data.issueDate);
  validateVisaFormDate(
    fields,
    "passportExpiry",
    "Срок действия паспорта",
    data.passportExpiry,
  );
  validateVisaFormDate(fields, "tripFrom", "Дата въезда", data.tripFrom);
  validateVisaFormDate(fields, "tripTo", "Дата выезда", data.tripTo);

  validateChoice(fields, "gender", "Пол", data.gender, selections.gender);
  validateChoice(
    fields,
    "maritalStatus",
    "Семейное положение",
    data.maritalStatus,
    selections.maritalStatus,
  );
  validateChoice(
    fields,
    "passportType",
    "Тип паспорта",
    data.passportType,
    selections.passportType,
  );
  validateChoice(fields, "purpose", "Цель поездки", data.purpose, selections.purpose);
  validateChoice(
    fields,
    "entries",
    "Количество въездов",
    data.entries,
    selections.entries,
  );
  validateChoice(
    fields,
    "costCoveredBy",
    "Кто оплачивает поездку",
    data.costCoveredBy,
    selections.costCoveredBy,
  );

  if (selections.costCoveredBy === "applicant") {
    validateChoice(
      fields,
      "meansOfSupport",
      "Средства на поездку",
      data.meansOfSupport,
      selections.meansOfSupport,
    );
  }

  if (selections.costCoveredBy === "sponsor") {
    validateChoice(
      fields,
      "sponsorInHostFields",
      "Спонсор указан в полях 30/31",
      data.sponsorInHostFields ?? "",
      selections.sponsorInHostFields,
    );
    validateChoice(
      fields,
      "sponsorMeans",
      "Средства спонсора",
      data.sponsorMeans ?? "",
      selections.sponsorMeans,
    );
    if (selections.sponsorInHostFields === "other") {
      addIssue(fields, {
        key: "otherSponsor",
        label: "Данные другого спонсора",
        reason: "unsupported_choice",
      });
    }
  }

  for (const spec of textFieldSpecs) {
    const value = spec.value(data);
    if (!value.trim()) continue;
    if (hasUnsupportedPdfCharacters(value)) {
      addIssue(fields, {
        key: spec.key,
        label: spec.label,
        reason: "unsupported_character",
      });
      continue;
    }
    if (!visaFormTextFits(value, spec.size, spec.maxWidth)) {
      addIssue(fields, {
        key: spec.key,
        label: spec.label,
        reason: "text_overflow",
      });
    }
  }

  return fields.length > 0 ? { ok: false, fields } : { ok: true, fields: [] };
}

export function resolveVisaFormSelections(data: VisaFormData): VisaFormSelections {
  const costCoveredBy = resolveChoice(data.costCoveredBy, [
    ["applicant", ["applicant", "self", "сам заявитель", "заявитель"]],
    ["sponsor", ["sponsor", "спонсор"]],
  ]);

  return {
    costCoveredBy,
    entries: resolveChoice(data.entries, entriesAliases),
    gender: resolveChoice(data.gender, [
      ["male", ["male", "m", "мужской"]],
      ["female", ["female", "f", "женский"]],
    ]),
    maritalStatus: resolveChoice(data.maritalStatus, maritalStatusAliases),
    meansOfSupport: resolveChoice(data.meansOfSupport, meansAliases),
    passportType: resolveChoice(data.passportType, passportTypeAliases),
    purpose: resolveChoice(data.purpose, purposeAliases),
    sponsorInHostFields: resolveChoice(data.sponsorInHostFields ?? "", [
      ["listed", ["yes", "да"]],
      ["other", ["no", "нет"]],
    ]),
    sponsorMeans: resolveChoice(data.sponsorMeans ?? "", sponsorMeansAliases),
  };
}

export function joinVisaFormValues(...values: Array<string | undefined>) {
  return values.filter((value): value is string => Boolean(value?.trim())).join(", ");
}

export function normalizeVisaFormPdfText(value: string) {
  return value
    .split("")
    .map((character) => transliteration[character] ?? character)
    .join("")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\x20-\x7e]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function visaFormTextFits(value: string, size: number, maxWidth: number) {
  const normalized = normalizeVisaFormPdfText(value);
  if (!normalized) return !value.trim();
  const units = [...normalized].reduce<number | null>((total, character) => {
    if (total === null) return null;
    const width = timesBoldWinAnsiWidths[character];
    return typeof width === "number" ? total + width : null;
  }, 0);
  if (units === null) return false;
  return (units * size * visaFormPdfReferenceScale) / 1000 <= maxWidth;
}

export function visaFormCityToLatin(value: string) {
  if (value === "Москва") return "Moscow";
  if (value === "Санкт-Петербург") return "St Petersburg";
  return normalizeVisaFormPdfText(value);
}

function addIssue(
  fields: VisaApplicationFormRenderIssue[],
  issue: VisaApplicationFormRenderIssue,
) {
  if (!fields.some((field) => field.key === issue.key)) fields.push(issue);
}

function validatePassportNumber(fields: VisaApplicationFormRenderIssue[], value: string) {
  if (!value.trim() || passportNumberPattern.test(value)) return;
  addIssue(fields, {
    key: "passportNo",
    label: "Номер паспорта",
    reason: "invalid_value",
  });
}

function validatePhoneNumber(
  fields: VisaApplicationFormRenderIssue[],
  key: "companyPhone" | "hotelPhone" | "phone",
  label: string,
  value: string | undefined,
) {
  if (!value?.trim() || phoneNumberPattern.test(value)) return;
  addIssue(fields, { key, label, reason: "invalid_value" });
}

function validateVisaFormDate(
  fields: VisaApplicationFormRenderIssue[],
  key: "birthDate" | "issueDate" | "passportExpiry" | "tripFrom" | "tripTo",
  label: string,
  value: string,
) {
  if (!value.trim() || isVisaFormDate(value)) return;
  addIssue(fields, { key, label, reason: "invalid_value" });
}

function isVisaFormDate(value: string) {
  const match = value.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
  if (!match) return false;
  const day = Number(match[1]);
  const month = Number(match[2]);
  const year = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function hasUnsupportedPdfCharacters(value: string) {
  return [...value].some(
    (character) =>
      !/^[\x20-\x7e\t\r\n]$/.test(character) &&
      !Object.keys(transliteration).includes(character),
  );
}

function normalizeChoice(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase("ru-RU")
    .replace(/ё/g, "е")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function resolveChoice<T extends string>(
  value: string,
  aliases: ChoiceAliases<T>,
): T | null {
  const normalized = normalizeChoice(value);
  if (!normalized) return null;
  for (const [selection, values] of aliases) {
    if (values.some((candidate) => normalizeChoice(candidate) === normalized)) {
      return selection;
    }
  }
  return null;
}

function validateChoice<T extends string>(
  fields: VisaApplicationFormRenderIssue[],
  key: keyof VisaFormData,
  label: string,
  value: string,
  selection: T | null,
) {
  if (value.trim() && !selection) {
    addIssue(fields, { key, label, reason: "unsupported_choice" });
  }
}

const transliteration: Record<string, string> = {
  А: "A",
  Б: "B",
  В: "V",
  Г: "G",
  Д: "D",
  Е: "E",
  Ё: "E",
  Ж: "ZH",
  З: "Z",
  И: "I",
  Й: "Y",
  К: "K",
  Л: "L",
  М: "M",
  Н: "N",
  О: "O",
  П: "P",
  Р: "R",
  С: "S",
  Т: "T",
  У: "U",
  Ф: "F",
  Х: "KH",
  Ц: "TS",
  Ч: "CH",
  Ш: "SH",
  Щ: "SCH",
  Ъ: "",
  Ы: "Y",
  Ь: "",
  Э: "E",
  Ю: "YU",
  Я: "YA",
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
  й: "y",
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
  щ: "sch",
  ъ: "",
  ы: "y",
  ь: "",
  э: "e",
  ю: "yu",
  я: "ya",
};
