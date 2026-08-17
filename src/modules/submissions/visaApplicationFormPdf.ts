import { createReferenceVisaApplicationFormPdfBlob } from "./visaApplicationFormReferencePdf";
import {
  resolveVisaFormSelections,
  validateVisaFormDataForRendering,
} from "./visaApplicationFormRenderContract";
import type { Applicant, Submission } from "./types";
import { canonicalQuestionnaireHomeAddress } from "./questionnaireAddressFields";

export function createVisaApplicationFormPdfBlob(
  submission: Submission,
  applicant: Applicant,
  options: { exportDate?: string } = {},
): Blob {
  const data = buildVisaFormData(submission, applicant);
  const validation = validateVisaFormData(data);
  if (!validation.ok) {
    throw new VisaApplicationFormDataError(validation.missingFields);
  }
  return createReferenceVisaApplicationFormPdfBlob(data, options);
}

export type VisaFormData = {
  address: string;
  addressCity: string;
  birthCountry: string;
  birthDate: string;
  birthPlace: string;
  citizenship: string;
  companyContact?: string;
  companyDetails?: string;
  companyPhone?: string;
  costCoveredBy: string;
  duration: string;
  email: string;
  employer: string;
  entries: string;
  firstEntryCountry: string;
  firstName: string;
  gender: string;
  hotelAddress: string;
  hotelCity: string;
  hotelCountry: string;
  hotelEmail: string;
  hotelName: string;
  hotelPhone: string;
  issueCountry: string;
  issueDate: string;
  issuePlace: string;
  maritalStatus: string;
  mainDestination: string;
  meansOfSupport: string;
  nationalityAtBirth: string;
  occupation: string;
  otherSponsor?: string;
  passportExpiry: string;
  passportNo: string;
  passportType: string;
  phone: string;
  postalCode: string;
  purpose: string;
  residenceCountry: string;
  surname: string;
  surnameAtBirth: string;
  sponsorInHostFields?: string;
  sponsorMeans?: string;
  tripFrom: string;
  tripTo: string;
  visaSubType: string;
};

export type VisaApplicationFormMissingField = {
  key: keyof VisaFormData;
  label: string;
};

export type VisaApplicationFormDataValidation =
  | { ok: true; missingFields: [] }
  | { ok: false; missingFields: VisaApplicationFormMissingField[] };

/**
 * An official export must never silently substitute example values when an
 * applicant answer is absent.
 */
export class VisaApplicationFormDataError extends Error {
  constructor(readonly missingFields: VisaApplicationFormMissingField[]) {
    super("Visa application form has incomplete or unsafe questionnaire data.");
    this.name = "VisaApplicationFormDataError";
  }
}

export function visaApplicationFormValidationMessage(
  fields: readonly VisaApplicationFormMissingField[],
): string {
  const labels = [...new Set(fields.map((field) => field.label))];
  const preview = labels.slice(0, 4).join(", ");
  const suffix = labels.length > 4 ? " и другие поля" : "";
  return `Исправьте данные для PDF: ${preview}${suffix}. ZIP не сформирован.`;
}

const requiredVisaFormFields = [
  { key: "surname", label: "Фамилия" },
  { key: "firstName", label: "Имя" },
  { key: "birthDate", label: "Дата рождения" },
  { key: "birthPlace", label: "Место рождения" },
  { key: "birthCountry", label: "Страна рождения" },
  { key: "citizenship", label: "Гражданство" },
  { key: "nationalityAtBirth", label: "Гражданство при рождении" },
  { key: "gender", label: "Пол" },
  { key: "maritalStatus", label: "Семейное положение" },
  { key: "passportType", label: "Тип паспорта" },
  { key: "passportNo", label: "Номер паспорта" },
  { key: "issueDate", label: "Дата выдачи паспорта" },
  { key: "passportExpiry", label: "Срок действия паспорта" },
  { key: "issueCountry", label: "Страна выдачи паспорта" },
  { key: "issuePlace", label: "Место выдачи паспорта" },
  { key: "address", label: "Домашний адрес" },
  { key: "email", label: "Email" },
  { key: "phone", label: "Телефон" },
  { key: "residenceCountry", label: "Страна проживания" },
  { key: "addressCity", label: "Город проживания" },
  { key: "postalCode", label: "Почтовый индекс" },
  { key: "occupation", label: "Профессия" },
  { key: "employer", label: "Работодатель или учебное заведение" },
  { key: "purpose", label: "Цель поездки" },
  { key: "mainDestination", label: "Основная страна назначения" },
  { key: "firstEntryCountry", label: "Страна первого въезда" },
  { key: "entries", label: "Количество въездов" },
  { key: "tripFrom", label: "Дата въезда" },
  { key: "tripTo", label: "Дата выезда" },
  { key: "duration", label: "Длительность пребывания" },
  { key: "hotelName", label: "Принимающая сторона или отель" },
  { key: "hotelAddress", label: "Адрес принимающей стороны или отеля" },
  { key: "hotelCity", label: "Город принимающей стороны или отеля" },
  { key: "hotelCountry", label: "Страна принимающей стороны или отеля" },
  { key: "costCoveredBy", label: "Кто оплачивает поездку" },
] as const satisfies ReadonlyArray<VisaApplicationFormMissingField>;

const applicantMeansField = {
  key: "meansOfSupport",
  label: "Средства на поездку",
} as const satisfies VisaApplicationFormMissingField;

const sponsorInHostFieldsField = {
  key: "sponsorInHostFields",
  label: "Спонсор указан в полях 30/31",
} as const satisfies VisaApplicationFormMissingField;

const sponsorMeansField = {
  key: "sponsorMeans",
  label: "Средства спонсора",
} as const satisfies VisaApplicationFormMissingField;

const otherSponsorField = {
  key: "otherSponsor",
  label: "Данные другого спонсора",
} as const satisfies VisaApplicationFormMissingField;

function buildVisaFormData(submission: Submission, applicant: Applicant): VisaFormData {
  const field = fieldReader(applicant);
  const tripFrom = dateForVisaForm(field("arrival-date"));
  const tripTo = dateForVisaForm(field("departure-date"));
  const passportNo = normalizeVisaFormInput(
    firstNonEmpty(field("passport-no"), field("passport-number"), field("passportNo")),
  );
  const homeAddress = canonicalQuestionnaireHomeAddress({
    homeAddress: field("home-address"),
    homeBuilding: field("home-building"),
    homeHouse: field("home-house"),
    homeStreet: field("home-street"),
    homeUnit: field("home-unit"),
  });

  return {
    address: homeAddress,
    addressCity: field("home-city"),
    birthCountry: normalizeCountry(field("birth-country")),
    birthDate: dateForVisaForm(field("birth-date")),
    birthPlace: field("birth-place"),
    citizenship: normalizeCountry(field("nationality")),
    companyContact: field("company-contact-person"),
    companyDetails: field("company-org-details"),
    companyPhone: normalizeVisaFormInput(field("company-phone")),
    costCoveredBy: field("cost-covered-by"),
    duration: field("stay-duration"),
    email: field("email"),
    employer: firstNonEmpty(field("employer-name"), field("occupation")),
    entries: field("entry-count"),
    firstEntryCountry: normalizeCountry(field("first-entry-country")),
    firstName: field("first-name"),
    gender: field("gender"),
    hotelAddress: field("hotel-address"),
    hotelCity: field("hotel-city"),
    hotelCountry: normalizeCountry(field("hotel-country")),
    hotelEmail: field("hotel-email"),
    hotelName: field("hotel-name"),
    hotelPhone: normalizeVisaFormInput(field("hotel-contact")),
    issueCountry: normalizeCountry(field("passport-issue-country")),
    issueDate: dateForVisaForm(field("passport-issue-date")),
    issuePlace: field("passport-issue-place"),
    maritalStatus: field("marital-status"),
    mainDestination: normalizeCountry(field("main-destination")),
    meansOfSupport: field("means-of-support"),
    nationalityAtBirth: normalizeCountry(
      firstNonEmpty(
        field("birth-citizenship"),
        field("nationality-at-birth"),
        field("nationality"),
        field("birth-country"),
      ),
    ),
    occupation: firstNonEmpty(field("occupation"), field("occupation-specify")),
    otherSponsor: field("other-sponsor"),
    passportExpiry: dateForVisaForm(field("passport-expiry-date")),
    passportNo,
    passportType: field("passport-type"),
    phone: normalizeVisaFormInput(field("contact-number")),
    postalCode: field("postal-code"),
    purpose: field("purpose"),
    residenceCountry: normalizeCountry(field("home-country")),
    surname: field("surname"),
    surnameAtBirth: firstNonEmpty(
      field("previous-surname"),
      field("surname-at-birth"),
      field("surname"),
    ),
    sponsorInHostFields: field("sponsor-in-host-fields"),
    sponsorMeans: field("sponsor-means"),
    tripFrom,
    tripTo,
    visaSubType: firstNonEmpty(
      field("stay-purpose-details"),
      field("visa-sub-type"),
      field("purpose"),
    ),
  };
}

export function validateVisaApplicationFormData(
  submission: Submission,
  applicant: Applicant,
): VisaApplicationFormDataValidation {
  return validateVisaFormData(buildVisaFormData(submission, applicant));
}

function validateVisaFormData(data: VisaFormData): VisaApplicationFormDataValidation {
  const selections = resolveVisaFormSelections(data);
  const requiredFields: VisaApplicationFormMissingField[] = [
    ...requiredVisaFormFields,
  ];
  if (selections.costCoveredBy === "sponsor") {
    requiredFields.push(sponsorInHostFieldsField, sponsorMeansField);
    if (selections.sponsorInHostFields === "other") {
      requiredFields.push(otherSponsorField);
    }
  } else {
    requiredFields.push(applicantMeansField);
  }

  const missingFields = requiredFields.filter((field) => !data[field.key]?.trim());
  const renderValidation = validateVisaFormDataForRendering(data);
  const blockedFields = [
    ...missingFields,
    ...(renderValidation.ok ? [] : renderValidation.fields),
  ].reduce<VisaApplicationFormMissingField[]>((fields, field) => {
    if (!fields.some((candidate) => candidate.key === field.key)) {
      fields.push({ key: field.key, label: field.label });
    }
    return fields;
  }, []);

  return blockedFields.length
    ? { ok: false, missingFields: blockedFields }
    : { ok: true, missingFields: [] };
}

function fieldReader(applicant: Applicant) {
  const values = new Map<string, string>();
  for (const section of applicant.sections) {
    for (const field of section.fields) values.set(field.id, field.value);
  }
  return (id: string, fallback = "") => values.get(id)?.trim() || fallback;
}

function dateForVisaForm(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) return [iso[3], iso[2], iso[1]].join("-");
  const local = trimmed.match(/^(\d{2})[./-](\d{2})[./-](\d{4})$/);
  if (local) return [local[1], local[2], local[3]].join("-");
  return trimmed;
}

function normalizeCountry(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return "";
  if (/^(рф|russia|russian federation)$/i.test(trimmed)) return "Russian Federation";
  if (/испания|spain/i.test(trimmed)) return "Spain";
  return trimmed;
}

function normalizeVisaFormInput(value: string) {
  return value.normalize("NFKC").trim();
}

function firstNonEmpty(...values: string[]) {
  return values.find((value) => value.trim())?.trim() ?? "";
}
