import type { Applicant, City, Submission } from "./types";
import { agentOwnerDisplayName } from "./ownership";
import {
  digitsOnly,
  exportDurationDays,
  normalizeExportContractDate,
  type ExportContractRow,
} from "../../lib/export/exportContractCore";


const exportLocationCodes: Record<City, string> = {
  "Москва": "MOW",
  "Санкт-Петербург": "SPB",
  "Казань": "KZN",
  "Екатеринбург": "SVX",
  "Новосибирск": "OVB",
  "Нижний Новгород": "GOJ",
  "Самара": "KUF",
  "Ростов-на-Дону": "ROV",
};

function exportLocationCode(city: City): string {
  return exportLocationCodes[city] ?? city;
}
export {
  buildExportPreview,
  buildExportWorkbookMatrix,
  EXPORT_DEFAULT_YEAR,
  EXPORT_WORKBOOK_COLUMN_COUNT,
  EXPORT_WORKBOOK_RANGE,
  EXPORT_WORKBOOK_SHEET_NAME,
  EXPECTED_EXPORT_CONTRACT_HEADERS,
  exportContractColumns,
  exportContractFingerprint,
  exportContractHeaders,
  exportContractRecordFromRow,
  excelSerialDateToIsoDate,
  isRealBlsApplicantRow,
  normalizeExportContractDate,
  normalizeExportContractDateInput,
  safeSpreadsheetValue,
  serializeExportContractRow,
  validateExportContractShape,
  type ExcelWorkbookDateSystem,
  type ExportContractColumn,
  type ExportContractColumnKey,
  type ExportContractPreview,
  type ExportContractRecord,
  type ExportContractRow,
} from "../../lib/export/exportContractCore";

export function buildExportContractRows(
  submissions: Submission[],
): ExportContractRow[] {
  return submissions
    .flatMap((submission) =>
      submission.applicants.map((applicant, index) =>
        buildExportContractRow(submission, applicant, index),
      ),
    )
    .map((row, index) => ({ ...row, excelRowNumber: index + 2 }));
}

function buildExportContractRow(
  submission: Submission,
  applicant: Applicant,
  index: number,
): ExportContractRow {
  const field = fieldReader(applicant);
  const nameParts = applicantNameParts(applicant.fullName);
  const firstName = field("first-name", nameParts.first);
  const surname = field("surname", nameParts.surname);
  const contactNumber = digitsOnly(field("contact-number"));
  const applicantMobile = normalizeApplicantMobile(contactNumber);
  const hotelName = field("hotel-name");
  const hotelCountry = field("hotel-country");
  const hotelCity = field("hotel-city");
  const hotelPostalCode = field("hotel-postal-code");
  const hotelEmail = field("hotel-email");
  const hotelAddress = field("hotel-address");
  const hotelContact = digitsOnly(field("hotel-contact"));
  const groupLabel = submission.type === "family" ? "Семья" : "Один заявитель";
  const intendedDateOfArrival = normalizeExportContractDate(
    field("arrival-date", submission.tripDateFrom),
  );
  const intendedDateOfDeparture = normalizeExportContractDate(
    field("departure-date", submission.tripDateTo),
  );
  const passportNumber = digitsOnly(field("passport-no"));
  const familyGroupId = submission.type === "family" ? submission.id : undefined;

  return {
    addressCity: field("home-city"),
    addressContactNo: contactNumber,
    addressCountry: field("home-country"),
    addressLine1: field("home-address"),
    addressPostalCode: field("postal-code"),
    applicantCount: submission.applicants.length,
    applicantEmail: field("email"),
    applicantId: applicant.id,
    applicantIndex: index + 1,
    applicantMobile,
    applicantName: applicant.fullName,
    appointmentCategory: normalizeCategory(field("category")),
    appointmentType: normalizeAppointmentType(submission.type),
    city: submission.city,
    contactPersonAddress: hotelAddress,
    contactPersonCity: hotelCity,
    contactPersonCountry: hotelCountry,
    contactPersonEmail: hotelEmail,
    contactPersonFirstName: hotelName,
    contactPersonLastName: field("hotel-contact-last-name"),
    contactPersonMobile: hotelContact,
    contactPersonZipCode: hotelPostalCode,
    costCoveredBy: normalizeCost(field("cost-covered-by")),
    countryOfBirth: normalizeCountry(field("birth-country")),
    currentNationality: normalizeCountry(field("nationality")),
    dateOfBirth: normalizeExportContractDate(field("birth-date")),
    employerAddress: field("employer-address"),
    employerContactNo: digitsOnly(field("employer-contact")),
    employerName: field("employer-name"),
    employerOccupation: field("occupation-specify", field("occupation")),
    entriesRequested: normalizeEntryCount(field("entry-count")),
    firstName,
    familyGroupId,
    familySubmissionId: familyGroupId,
    gender: normalizeGender(field("gender")),
    groupKey: submission.id,
    groupLabel,
    intendedDateOfArrival,
    intendedDateOfDeparture,
    invitingCompanyAddress: hotelAddress,
    invitingCompanyCity: hotelCity,
    invitingCompanyContactNo: hotelContact,
    invitingCompanyCountry: hotelCountry,
    invitingCompanyEmail: hotelEmail,
    invitingCompanyName: hotelName,
    invitingCompanyZipCode: hotelPostalCode,
    lastName: surname,
    location: exportLocationCode(submission.city),
    maritalStatus: normalizeMaritalStatus(field("marital-status")),
    meansOfSupport: normalizeMeans(field("means-of-support")),
    nationalityAtBirth: normalizeCountry(field("birth-country")),
    ownerAgentId: submission.agentId,
    ownerAgentName: agentOwnerDisplayName(submission.agentId),
    passportLast3: passportNumber.slice(-3),
    passportNumber,
    passportExpiryDate: normalizeExportContractDate(field("passport-expiry-date")),
    passportIssueCountry: normalizeCountry(field("passport-issue-country")),
    passportIssueDate: normalizeExportContractDate(field("passport-issue-date")),
    passportIssuePlace: field("passport-issue-place"),
    passportNo: passportNumber,
    passportType: field("passport-type"),
    placeOfBirth: field("birth-place"),
    purposeOfJourney: field("purpose"),
    stayDurationInDays:
      digitsOnly(field("stay-duration")) ||
      exportDurationDays(intendedDateOfArrival, intendedDateOfDeparture),
    submissionCode:
      submission.type === "family" ? `${submission.id}-${index + 1}` : submission.id,
    submissionId: submission.id,
    submissionTitle: submission.title,
    surnameAtBirth: field("surname-at-birth", surname),
    surnameFamilyName: surname,
    travelDate: normalizeExportContractDate(
      field("travel-date", submission.tripDateFrom),
    ),
    tripDates: `${submission.tripDateFrom}-${submission.tripDateTo}`,
    type: groupLabel,
    visaSubType: normalizeVisaSubType(field("visa-sub-type")),
    visaType: normalizeVisaType(field("visa-type")),
  };
}

function fieldReader(applicant: Applicant) {
  const values = new Map<string, string>();
  for (const section of applicant.sections) {
    for (const field of section.fields) {
      values.set(field.id, field.value);
    }
  }

  return (id: string, fallback = "") => values.get(id)?.trim() || fallback;
}

function applicantNameParts(fullName: string) {
  const [first = "", ...rest] = fullName.trim().split(/\s+/);
  if (rest.length && looksLikeRussianSurname(first)) {
    return {
      first: rest.join(" "),
      surname: first,
    };
  }

  const surname = rest.join(" ");
  return {
    first: first || fullName,
    surname: surname || first || fullName,
  };
}

function looksLikeRussianSurname(value: string) {
  return /(?:ов|ова|ев|ева|ёв|ёва|ин|ина|ын|ына|ский|ская|цкий|цкая|ых|их|ко|чук|юк)$/i.test(
    value.trim(),
  );
}

function normalizeCategory(value: string): string {
  if (/normal/i.test(value)) return "NORMAL";
  if (/premium|prime/i.test(value)) return "PREMIUM";
  return value.trim().toUpperCase();
}

function normalizeApplicantMobile(value: string): string {
  if (value.length === 11 && (value.startsWith("7") || value.startsWith("8"))) {
    return value.slice(1);
  }
  return value;
}

function normalizeAppointmentType(value: Submission["type"]): string {
  return value === "family" ? "FAMILY" : "INDIVIDUAL";
}

function normalizeVisaType(value: string): string {
  if (/\bC\b|schengen|шенген/i.test(value)) return "C";
  if (/\bD\b|national|национ/i.test(value)) return "D";
  return value.trim().toUpperCase();
}

function normalizeVisaSubType(value: string): string {
  if (!value.trim()) return "NA";
  if (/tour|тур|business|делов|visit|visitor|гост/i.test(value)) return "NA";
  return value.trim().toUpperCase();
}

function normalizeCountry(value: string): string {
  if (value === "РФ") return "Russian Federation";
  if (value === "USSR") return "USSR";
  return value;
}

function normalizeGender(value: string): string {
  if (/female|жен/i.test(value)) return "Female";
  if (/male|муж/i.test(value)) return "Male";
  return value;
}

function normalizeMaritalStatus(value: string): string {
  if (/married|женат|замуж/i.test(value)) return "Married";
  if (/divorced|развед/i.test(value)) return "Divorced";
  if (/single|холост|не замуж/i.test(value)) return "Single";
  if (/widow|вдов/i.test(value)) return "Widowed";
  return value;
}

function normalizeEntryCount(value: string): string {
  if (/multiple|multi|мног/i.test(value)) return "MULTIPLE";
  if (/two|double|дв/i.test(value)) return "TWO";
  if (/single|одн/i.test(value)) return "SINGLE";
  return value.trim().toUpperCase();
}

function normalizeCost(value: string): string {
  if (!value.trim()) return "";
  return /sponsor|спонсор/i.test(value) ? "Sponsor" : "Applicant";
}

function normalizeMeans(value: string): string {
  if (/credit|кредит/i.test(value)) return "CreditCard";
  if (/accommodation|жиль/i.test(value)) return "Accommodation Provided";
  if (/cash|налич/i.test(value)) return "Cash";
  return value;
}
