import type { Applicant, Submission } from "./types";
import { agentOwnerDisplayName } from "./ownership";
import {
  digitsOnly,
  exportDurationDays,
  normalizeExportContractDate,
  type ExportContractRow,
} from "../../lib/export/exportContractCore";
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
  const mobile = digitsOnly(field("contact-number"));
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
    addressContactNo: mobile,
    addressCountry: field("home-country"),
    addressLine1: field("home-address"),
    addressPostalCode: field("postal-code"),
    applicantCount: submission.applicants.length,
    applicantEmail: field("email"),
    applicantId: applicant.id,
    applicantIndex: index + 1,
    applicantMobile: mobile,
    applicantName: applicant.fullName,
    appointmentCategory: normalizeCategory(field("category")),
    appointmentType: submission.type === "family" ? "Family" : "Individual",
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
    location: submission.city,
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
    visaSubType: field("visa-sub-type"),
    visaType: field("visa-type"),
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
  return value.includes("Normal") ? "Normal" : value;
}

function normalizeCountry(value: string): string {
  if (value === "РФ") return "Russian Federation";
  if (value === "USSR") return "USSR";
  return value;
}

function normalizeGender(value: string): string {
  if (/female/i.test(value)) return "Female";
  if (/male/i.test(value)) return "Male";
  return value;
}

function normalizeMaritalStatus(value: string): string {
  if (/married/i.test(value)) return "Married";
  if (/divorced/i.test(value)) return "Divorced";
  if (/single/i.test(value)) return "Single";
  return value;
}

function normalizeEntryCount(value: string): string {
  if (/multiple/i.test(value)) return "Multiple Entry";
  if (/two/i.test(value)) return "Two Entry";
  if (/single/i.test(value)) return "Single Entry";
  return value;
}

function normalizeCost(value: string): string {
  if (!value.trim()) return "";
  return /sponsor/i.test(value) ? "Sponsor" : "Applicant";
}

function normalizeMeans(value: string): string {
  if (/credit/i.test(value)) return "CreditCard";
  if (/accommodation/i.test(value)) return "Accommodation Provided";
  if (/cash/i.test(value)) return "Cash";
  return value;
}
