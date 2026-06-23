export type VisaPdfFieldKey =
  | "arrivalDate"
  | "birthCountry"
  | "birthDate"
  | "birthPlace"
  | "citizenship"
  | "departureDate"
  | "destinationCountry"
  | "entriesRequested"
  | "firstEntryCountry"
  | "firstName"
  | "passportExpiresAt"
  | "passportIssueCountry"
  | "passportIssuedAt"
  | "passportNumber"
  | "paymentCoverage"
  | "surname"
  | "travelDatesInAddress"
  | "tripPurpose";

export type VisaPdfFindingSeverity = "critical" | "warning";

export type VisaPdfFindingCode =
  | "pdf_applicant_match_missing"
  | "pdf_critical_field_missing"
  | "pdf_field_mismatch"
  | "pdf_required_field_missing"
  | "pdf_travel_dates_in_address";

export type VisaPdfFinding = {
  code: VisaPdfFindingCode;
  expected?: string;
  field: VisaPdfFieldKey;
  message: string;
  severity: VisaPdfFindingSeverity;
  value?: string;
};

export type VisaApplicationPdfReviewData = Partial<Record<VisaPdfFieldKey, string>>;

export type VisaApplicationPdfExtractionSource = "local_ocr" | "text_layer";

export const maxVisaApplicationPdfBytes = 25 * 1024 * 1024;
export const maxVisaApplicationOcrPages = 4;
export const visaApplicationPdfParserVersion = 1;
