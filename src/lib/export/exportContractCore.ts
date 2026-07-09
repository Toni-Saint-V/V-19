export const EXPORT_WORKBOOK_SHEET_NAME = "Sheet1";
export const EXPORT_WORKBOOK_RANGE = "A:BD";
export const EXPORT_WORKBOOK_COLUMN_COUNT = 56;
export const EXPORT_DEFAULT_YEAR = "2026";

export const EXPECTED_EXPORT_CONTRACT_HEADERS = [
  "Location",
  "Visa Type",
  "Visa Sub Type",
  "Appointment Category(Normal)",
  "Applicant Email",
  "Applicant Mobile(10 Digit, No space or -,leading zero)",
  "Passport No",
  "Surname (Family Name)",
  "Surname At Birth",
  "FirstName",
  "LastName",
  "Date of Birth(YYYY-MM-DD)",
  "Place Of Birth",
  "Country Of Birth",
  "Current Nationality",
  "Gender(Male/Female)",
  "Marital Status(Single/Married)",
  "TravelDate(YYYY-MM-DD)",
  "Passport Type(Ordinary Passport)",
  "Passport Issue Date(YYYY-MM-DD)",
  "Passport Expiry Date(YYYY-MM-DD)",
  "Passport Issue Place",
  "Passport Issue Country",
  "Address Line 1",
  "Address City",
  "Address Postal Code",
  "Address Contact No",
  "Address Country",
  "Employer Name",
  "Employer Contact No",
  "Employer Address",
  "Employer Occupation",
  "Purpose of journey",
  "Stay Duration in Days",
  "Number of Entries Requested(Single Entry/Two Entry/Multiple Entry)",
  "Intended Date Of Arrival",
  "Intended Date Of Departure",
  "Inviting Company Name",
  "Inviting Company Country",
  "Inviting Company City",
  "Inviting Company Zip Code",
  "Inviting Company Email",
  "Inviting Company Address",
  "Inviting Company Contact No",
  "Contact Person First Name",
  "Contact Person Last Name",
  "Contact Person Country",
  "Contact Person City",
  "Contact Person Zip Code",
  "Contact Person address",
  "Contact Person Email",
  "Contact Person Mobile",
  "Cost Covered By(Sponsor/Applicant)",
  "Means Of Support(Accommodation Provided/All expenses covered/Cash/CreditCard)",
  "Appointment Type(For Family, applicant email and contact number should be same for all family members)",
  "Nationality At Birth",
] as const;

export const exportContractColumns = [
  { key: "location", header: "Location" },
  { key: "visaType", header: "Visa Type" },
  { key: "visaSubType", header: "Visa Sub Type" },
  { key: "appointmentCategory", header: "Appointment Category(Normal)" },
  { key: "applicantEmail", header: "Applicant Email" },
  {
    key: "applicantMobile",
    header: "Applicant Mobile(10 Digit, No space or -,leading zero)",
  },
  { key: "passportNo", header: "Passport No" },
  { key: "surnameFamilyName", header: "Surname (Family Name)" },
  { key: "surnameAtBirth", header: "Surname At Birth" },
  { key: "firstName", header: "FirstName" },
  { key: "lastName", header: "LastName" },
  { key: "dateOfBirth", header: "Date of Birth(YYYY-MM-DD)" },
  { key: "placeOfBirth", header: "Place Of Birth" },
  { key: "countryOfBirth", header: "Country Of Birth" },
  { key: "currentNationality", header: "Current Nationality" },
  { key: "gender", header: "Gender(Male/Female)" },
  { key: "maritalStatus", header: "Marital Status(Single/Married)" },
  { key: "travelDate", header: "TravelDate(YYYY-MM-DD)" },
  { key: "passportType", header: "Passport Type(Ordinary Passport)" },
  { key: "passportIssueDate", header: "Passport Issue Date(YYYY-MM-DD)" },
  { key: "passportExpiryDate", header: "Passport Expiry Date(YYYY-MM-DD)" },
  { key: "passportIssuePlace", header: "Passport Issue Place" },
  { key: "passportIssueCountry", header: "Passport Issue Country" },
  { key: "addressLine1", header: "Address Line 1" },
  { key: "addressCity", header: "Address City" },
  { key: "addressPostalCode", header: "Address Postal Code" },
  { key: "addressContactNo", header: "Address Contact No" },
  { key: "addressCountry", header: "Address Country" },
  { key: "employerName", header: "Employer Name" },
  { key: "employerContactNo", header: "Employer Contact No" },
  { key: "employerAddress", header: "Employer Address" },
  { key: "employerOccupation", header: "Employer Occupation" },
  { key: "purposeOfJourney", header: "Purpose of journey" },
  { key: "stayDurationInDays", header: "Stay Duration in Days" },
  {
    key: "entriesRequested",
    header: "Number of Entries Requested(Single Entry/Two Entry/Multiple Entry)",
  },
  { key: "intendedDateOfArrival", header: "Intended Date Of Arrival" },
  { key: "intendedDateOfDeparture", header: "Intended Date Of Departure" },
  { key: "invitingCompanyName", header: "Inviting Company Name" },
  { key: "invitingCompanyCountry", header: "Inviting Company Country" },
  { key: "invitingCompanyCity", header: "Inviting Company City" },
  { key: "invitingCompanyZipCode", header: "Inviting Company Zip Code" },
  { key: "invitingCompanyEmail", header: "Inviting Company Email" },
  { key: "invitingCompanyAddress", header: "Inviting Company Address" },
  { key: "invitingCompanyContactNo", header: "Inviting Company Contact No" },
  { key: "contactPersonFirstName", header: "Contact Person First Name" },
  { key: "contactPersonLastName", header: "Contact Person Last Name" },
  { key: "contactPersonCountry", header: "Contact Person Country" },
  { key: "contactPersonCity", header: "Contact Person City" },
  { key: "contactPersonZipCode", header: "Contact Person Zip Code" },
  { key: "contactPersonAddress", header: "Contact Person address" },
  { key: "contactPersonEmail", header: "Contact Person Email" },
  { key: "contactPersonMobile", header: "Contact Person Mobile" },
  { key: "costCoveredBy", header: "Cost Covered By(Sponsor/Applicant)" },
  {
    key: "meansOfSupport",
    header:
      "Means Of Support(Accommodation Provided/All expenses covered/Cash/CreditCard)",
  },
  {
    key: "appointmentType",
    header:
      "Appointment Type(For Family, applicant email and contact number should be same for all family members)",
  },
  { key: "nationalityAtBirth", header: "Nationality At Birth" },
] as const;

export type ExportContractColumn = (typeof exportContractColumns)[number];
export type ExportContractColumnKey = ExportContractColumn["key"];
export type ExportContractRow = Record<ExportContractColumnKey, string> & {
  applicantCount: number;
  applicantId: string;
  applicantIndex: number;
  applicantName: string;
  city: string;
  excelRowNumber?: number;
  exportPackageId?: string;
  familyGroupId?: string;
  familySubmissionId?: string;
  groupKey: string;
  groupLabel: string;
  ownerAgentId: string;
  ownerAgentName?: string;
  passportLast3: string;
  passportNumber: string;
  submissionCode: string;
  submissionId: string;
  submissionTitle: string;
  tripDates: string;
  type: string;
};

export type ExportContractPreview = {
  columnCount: number;
  headers: string[];
  range: typeof EXPORT_WORKBOOK_RANGE;
  rows: string[][];
  sheetName: typeof EXPORT_WORKBOOK_SHEET_NAME;
};

export type ExportContractRecord = Record<string, string>;

export function exportContractHeaders(): string[] {
  return exportContractColumns.map((column) => column.header);
}

export function validateExportContractShape(): boolean {
  const headers = exportContractHeaders();

  return (
    exportContractColumns.length === EXPORT_WORKBOOK_COLUMN_COUNT &&
    EXPECTED_EXPORT_CONTRACT_HEADERS.length === EXPORT_WORKBOOK_COLUMN_COUNT &&
    headers.every((header, index) => header === EXPECTED_EXPORT_CONTRACT_HEADERS[index])
  );
}

export function serializeExportContractRow(row: ExportContractRow): string[] {
  return exportContractColumns.map((column) =>
    safeSpreadsheetValue(serializedColumnValue(row, column.key)),
  );
}

function serializedColumnValue(
  row: ExportContractRow,
  key: ExportContractColumnKey,
): string {
  const value = row[key] ?? "";
  if (key === "appointmentType") {
    if (value === "FAMILY") return "Family";
    if (value === "INDIVIDUAL") return "Individual";
  }
  return value;
}

export function exportContractRecordFromRow(
  row: ExportContractRow,
): ExportContractRecord {
  const values = serializeExportContractRow(row);
  return Object.fromEntries(
    exportContractColumns.map((column, index) => [column.header, values[index] ?? ""]),
  );
}

export function buildExportPreview(rows: ExportContractRow[]): ExportContractPreview {
  return {
    columnCount: EXPORT_WORKBOOK_COLUMN_COUNT,
    headers: exportContractHeaders(),
    range: EXPORT_WORKBOOK_RANGE,
    rows: rows.map(serializeExportContractRow),
    sheetName: EXPORT_WORKBOOK_SHEET_NAME,
  };
}

export function buildExportWorkbookMatrix(rows: ExportContractRow[]): string[][] {
  return [exportContractHeaders(), ...rows.map(serializeExportContractRow)];
}

export function exportContractFingerprint(
  rows: ExportContractRow[],
  format: string,
): string {
  const orderedRows = [...rows].sort(
    (left, right) =>
      left.submissionId.localeCompare(right.submissionId) ||
      left.applicantIndex - right.applicantIndex,
  );
  const source = orderedRows.map((row) =>
    [
      row.submissionId,
      row.submissionTitle,
      row.type,
      row.applicantIndex,
      serializeExportContractRow(row).join("\u001f"),
    ].join("\u001f"),
  );

  return [
    format,
    orderedRows.length,
    EXPORT_WORKBOOK_SHEET_NAME,
    EXPORT_WORKBOOK_RANGE,
    ...source,
  ].join("|");
}

export type ExcelWorkbookDateSystem = "1900" | "1904";

export function excelSerialDateToIsoDate(
  value: number,
  dateSystem: ExcelWorkbookDateSystem = "1900",
): string {
  if (!Number.isFinite(value) || value <= 0) return "";

  const base =
    dateSystem === "1904" ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
  const date = new Date(base + Math.floor(value) * 86_400_000);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

export function normalizeExportContractDateInput(
  value: string | number,
  dateSystem: ExcelWorkbookDateSystem = "1900",
): string {
  if (typeof value === "number") return excelSerialDateToIsoDate(value, dateSystem);

  const trimmed = value.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  if (/^\d+(?:\.\d+)?$/.test(trimmed)) {
    return excelSerialDateToIsoDate(Number(trimmed), dateSystem);
  }

  const dotted = trimmed.match(/^(\d{2})\.(\d{2})(?:\.(\d{4}))?$/);
  if (!dotted) return "";

  const [, day, month, year = EXPORT_DEFAULT_YEAR] = dotted;
  return `${year}-${month}-${day}`;
}

export function normalizeExportContractDate(value: string): string {
  return normalizeExportContractDateInput(value);
}

export function isRealBlsApplicantRow(
  row:
    | Partial<Record<ExportContractColumnKey, string | number | null | undefined>>
    | readonly unknown[],
): boolean {
  let byKey: {
    firstName?: unknown;
    lastName?: unknown;
    passportNo?: unknown;
    surnameFamilyName?: unknown;
  };
  if (isReadonlyUnknownArray(row)) {
    byKey = {
      firstName: row[9],
      lastName: row[10],
      passportNo: row[6],
      surnameFamilyName: row[7],
    };
  } else {
    byKey = row;
  }
  const passportNo = String(byKey.passportNo ?? "").trim();
  const applicantName = [
    byKey.surnameFamilyName,
    byKey.firstName,
    byKey.lastName,
  ]
    .map((value) => String(value ?? "").trim())
    .join("");

  return Boolean(passportNo || applicantName);
}

function isReadonlyUnknownArray(value: unknown): value is readonly unknown[] {
  return Array.isArray(value);
}

export function exportDurationDays(
  arrivalDate: string,
  departureDate: string,
): string {
  if (!arrivalDate || !departureDate) return "";

  const start = new Date(`${arrivalDate}T00:00:00Z`);
  const end = new Date(`${departureDate}T00:00:00Z`);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return "";

  const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86_400_000));
  return String(days);
}

export function digitsOnly(value: string): string {
  return value.replace(/\D/g, "");
}

export function safeSpreadsheetValue(value: string): string {
  const trimmed = value.trimStart();
  return /^[=+\-@]/.test(trimmed) ? `'${value}` : value;
}
