import type { Applicant, City, Submission } from "./types";
import { agentOwnerDisplayName } from "./ownership";
import { canonicalQuestionnaireHomeAddress } from "./questionnaireAddressFields";
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
  const invitingPartyType = field("inviting-party-type");
  const privateHostName = applicantNameParts(hotelName);
  const companyContactPerson = field("company-contact-person");
  const companyContactName = applicantNameParts(companyContactPerson);
  const companyPhone = digitsOnly(field("company-phone"));
  const costCoveredBySource = field("cost-covered-by");
  const useCompanyContact = isCompanyInvitation(
    invitingPartyType,
    field("purpose"),
  );
  const usePrivateHostContact = isPrivateInvitation(invitingPartyType);
  const groupLabel = submission.type === "family" ? "Семья" : "Один заявитель";
  const intendedDateOfArrival = normalizeExportContractDate(
    field("arrival-date", submission.tripDateFrom),
  );
  const intendedDateOfDeparture = normalizeExportContractDate(
    field("departure-date", submission.tripDateTo),
  );
  const passportNumber = normalizePassportNumber(field("passport-no"));
  const meansOfSupportSource = isSponsorCost(costCoveredBySource)
    ? field("sponsor-means")
    : field("means-of-support");
  const familyGroupId = submission.type === "family" ? submission.id : undefined;
  const homeAddress = canonicalQuestionnaireHomeAddress({
    homeAddress: field("home-address"),
    homeBuilding: field("home-building"),
    homeHouse: field("home-house"),
    homeStreet: field("home-street"),
    homeUnit: field("home-unit"),
  });

  return {
    addressCity: field("home-city"),
    addressContactNo: contactNumber,
    addressCountry: field("home-country"),
    addressLine1: homeAddress,
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
    contactPersonFirstName:
      (useCompanyContact
        ? companyContactName.first
        : usePrivateHostContact
          ? privateHostName.first
          : "") || hotelName,
    contactPersonLastName: useCompanyContact
      ? companyContactName.surname
      : usePrivateHostContact
        ? privateHostName.surname
        : "",
    contactPersonMobile: (useCompanyContact ? companyPhone : "") || hotelContact,
    contactPersonZipCode: hotelPostalCode,
    costCoveredBy: normalizeCost(costCoveredBySource),
    countryOfBirth: normalizeCountry(field("birth-country")),
    currentNationality: normalizeCountry(field("nationality")),
    dateOfBirth: normalizeExportContractDate(field("birth-date")),
    employerAddress: field("employer-address"),
    employerContactNo: digitsOnly(field("employer-contact")),
    employerName: field("employer-name"),
    employerOccupation: field("occupation"),
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
    invitingCompanyContactNo: (useCompanyContact ? companyPhone : "") || hotelContact,
    invitingCompanyCountry: hotelCountry,
    invitingCompanyEmail: hotelEmail,
    invitingCompanyName: hotelName,
    invitingCompanyZipCode: hotelPostalCode,
    lastName: surname,
    location: exportLocationCode(submission.city),
    maritalStatus: normalizeMaritalStatus(field("marital-status")),
    meansOfSupport: normalizeMeans(meansOfSupportSource),
    nationalityAtBirth: normalizeCountry(
      firstNonEmpty(
        field("birth-citizenship"),
        field("nationality-at-birth"),
        field("nationality"),
        field("birth-country"),
      ),
    ),
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
    surnameAtBirth: firstNonEmpty(
      field("previous-surname"),
      field("surname-at-birth"),
      surname,
    ),
    surnameFamilyName: surname,
    travelDate: intendedDateOfArrival,
    tripDates: `${submission.tripDateFrom}-${submission.tripDateTo}`,
    type: groupLabel,
    visaSubType: normalizeVisaSubType(
      firstNonEmpty(
        field("stay-purpose-details"),
        field("visa-sub-type"),
        field("purpose"),
      ),
    ),
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

function firstNonEmpty(...values: string[]): string {
  return values.find((value) => value.trim())?.trim() ?? "";
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
  if (/single|холост|не замуж/i.test(value)) return "Single";
  if (/married|женат|замуж/i.test(value)) return "Married";
  if (/registered|partner|партнер/i.test(value)) return "Registered Partnership";
  if (/separated|раздель/i.test(value)) return "Separated";
  if (/divorced|развед/i.test(value)) return "Divorced";
  if (/widow|вдов/i.test(value)) return "Widowed";
  if (/^other$|^иное$/i.test(value.trim())) return "Other";
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
  return isSponsorCost(value) ? "Sponsor" : "Applicant";
}

function isSponsorCost(value: string): boolean {
  return /sponsor|спонсор/i.test(value);
}

function isCompanyInvitation(invitingPartyType: string, purpose: string): boolean {
  return (
    /company|organization|компан|организа/i.test(invitingPartyType) ||
    /business|cultural|medical treatment|official visit|sports|study/i.test(purpose)
  );
}

function isPrivateInvitation(invitingPartyType: string): boolean {
  return /inviting person|private host|приглашающее лицо/i.test(invitingPartyType);
}

function normalizeMeans(value: string): string {
  if (/all expenses|все расходы/i.test(value)) return "All expenses covered";
  if (/credit|кредит/i.test(value)) return "CreditCard";
  if (/accommodation|жиль/i.test(value)) return "Accommodation Provided";
  if (/cash|налич/i.test(value)) return "Cash";
  return value;
}

const supportedExportMeans = new Set([
  "Accommodation Provided",
  "All expenses covered",
  "Cash",
  "CreditCard",
]);

export type ExportContractDataIssue =
  | "duplicate_identity"
  | "duplicate_passport"
  | "family_contact_mismatch"
  | "invalid_applicant_mobile"
  | "unsupported_means";

export function exportContractDataIssues(
  rows: readonly ExportContractRow[],
): ExportContractDataIssue[] {
  const issues = new Set<ExportContractDataIssue>();

  if (
    rows.some(
      (row) =>
        Boolean(row.meansOfSupport.trim()) &&
        !supportedExportMeans.has(row.meansOfSupport),
    )
  ) {
    issues.add("unsupported_means");
  }

  if (rows.some((row) => !/^\d{10}$/.test(row.applicantMobile))) {
    issues.add("invalid_applicant_mobile");
  }

  if (hasRepeatedValueForDifferentApplicants(rows, (row) => row.passportNo)) {
    issues.add("duplicate_passport");
  }

  if (
    hasRepeatedValueForDifferentApplicants(rows, (row) =>
      [row.surnameFamilyName, row.firstName, row.dateOfBirth]
        .map(normalizedComparisonValue)
        .join("|"),
    )
  ) {
    issues.add("duplicate_identity");
  }

  if (familyContactsDiffer(rows)) {
    issues.add("family_contact_mismatch");
  }

  return [...issues];
}

function hasRepeatedValueForDifferentApplicants(
  rows: readonly ExportContractRow[],
  valueFor: (row: ExportContractRow) => string,
): boolean {
  const applicantIdsByValue = new Map<string, Set<string>>();

  for (const row of rows) {
    const value = normalizedComparisonValue(valueFor(row));
    if (!value || value === "||") continue;
    const applicantIds = applicantIdsByValue.get(value) ?? new Set<string>();
    applicantIds.add(row.applicantId);
    applicantIdsByValue.set(value, applicantIds);
    if (applicantIds.size > 1) return true;
  }

  return false;
}

function familyContactsDiffer(rows: readonly ExportContractRow[]): boolean {
  const rowsByFamily = new Map<string, ExportContractRow[]>();

  for (const row of rows) {
    const familyId = row.familyGroupId ?? row.familySubmissionId;
    if (!familyId) continue;
    const familyRows = rowsByFamily.get(familyId) ?? [];
    familyRows.push(row);
    rowsByFamily.set(familyId, familyRows);
  }

  return [...rowsByFamily.values()].some((familyRows) => {
    const emails = new Set(
      familyRows.map((row) => normalizedComparisonValue(row.applicantEmail)),
    );
    const mobiles = new Set(familyRows.map((row) => row.applicantMobile));
    return emails.size > 1 || mobiles.size > 1;
  });
}

function normalizedComparisonValue(value: string): string {
  return value.normalize("NFKC").trim().toLocaleUpperCase("ru-RU");
}

function normalizePassportNumber(value: string): string {
  return value
    .normalize("NFKC")
    .toLocaleUpperCase("en-US")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}
