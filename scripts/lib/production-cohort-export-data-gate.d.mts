export type ProductionCohortExportDataFindingCode =
  | "answer_ownership_mismatch"
  | "applicant_projection_birth_date_mismatch"
  | "applicant_projection_email_mismatch"
  | "applicant_projection_passport_mismatch"
  | "applicant_projection_phone_mismatch"
  | "applicant_without_submission"
  | "duplicate_answer_key"
  | "duplicate_identity"
  | "duplicate_passport"
  | "family_contact_mismatch"
  | "invalid_applicant_phone"
  | "invalid_passport"
  | "missing_export_field";

export type ProductionCohortExportDataFinding = {
  applicantId?: string;
  code: ProductionCohortExportDataFindingCode;
  count?: number;
  fieldId?: string;
  submissionId?: string;
  submissionIds?: string[];
};

export function productionCohortExportDataGate(input: {
  answers: Array<{
    applicant_id: string;
    field_id: string;
    submission_id: string;
    value: unknown;
  }>;
  applicants: Array<{
    birth_date?: unknown;
    email?: unknown;
    id: string;
    passport_number?: unknown;
    phone?: unknown;
    submission_id: string;
  }>;
  submissions: Array<{ id: string; type: string }>;
}): { findings: ProductionCohortExportDataFinding[]; ok: boolean };
