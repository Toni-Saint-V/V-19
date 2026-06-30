import type {
  VisaApplicationPdfExtractionSource,
  VisaApplicationPdfReviewData,
  VisaPdfFinding,
} from "./visaApplicationPdfReviewTypes";
import type {
  CanonicalFrontendMediaType,
  CanonicalSubmissionStatus,
  RejectedLegacyMediaType,
} from "./domainContract";

export type Role = "agent" | "admin";

export type UserRole = Role;

export type Surface =
  | "agent-actions"
  | "agent-inbox"
  | "agent-submissions"
  | "admin-review"
  | "export"
  | "settings";

export type AgentOwnerId = string;

export type SubmissionType = "single" | "family";

export type SubmissionKind = SubmissionType;

export type SpainCountryCode = "ES";

export const V19_FIXED_COUNTRY = {
  code: "ES",
  label: "Испания",
} as const satisfies { code: SpainCountryCode; label: Submission["country"] };

export type SubmissionStatus = CanonicalSubmissionStatus | "requires_action";

export type ApplicantRole = "main" | "spouse" | "child";

export type QuestionnaireStatus = "empty" | "partial" | "complete" | "needs_fix";

export const questionnaireReviewStates = ["confirmed", "needs_review"] as const;
export type QuestionnaireReviewState = (typeof questionnaireReviewStates)[number];

export const questionnaireReviewSources = [
  "manual",
  "passport_ocr",
  "family_shared",
  "pdf_reconciliation",
] as const;
export type QuestionnaireReviewSource = (typeof questionnaireReviewSources)[number];

export function isQuestionnaireReviewState(
  value: unknown,
): value is QuestionnaireReviewState {
  return questionnaireReviewStates.some((state) => state === value);
}

export function isQuestionnaireReviewSource(
  value: unknown,
): value is QuestionnaireReviewSource {
  return questionnaireReviewSources.some((source) => source === value);
}

export type SubmissionFileStatus =
  | "missing"
  | "uploaded"
  | "needs_replacement"
  | "pending_review"
  | "accepted";

export type FileAssetUploadStatus =
  | "none"
  | "pending"
  | "uploaded"
  | "failed"
  | "deleted";

export type FileAssetStorageAdapter = "local-dev" | "supabase-private";

export type SubmissionFileType = CanonicalFrontendMediaType | RejectedLegacyMediaType;

export type IssueSeverity = "blocker" | "warning" | "info";

export type IssueStatus = "open" | "fixed_by_agent" | "closed_by_admin";

export type DomainIssueStatus = "open" | "fixed_by_agent" | "closed_by_admin";

export type ExportState =
  | "not_ready"
  | "ready"
  | "file_generated"
  | "file_downloaded"
  | "marked_exported";

export type ExportPackageFormat = "csv" | "xlsx";

export type ExportPackageIdentity = {
  contentFingerprint: string;
  fileName: string;
  format: ExportPackageFormat;
  idempotencyKey: string;
  rowCount: number;
  submissionIds: string[];
};

export type AiSuggestionStatus =
  | "suggested"
  | "accepted_by_admin"
  | "dismissed_by_admin";

export type AiReviewState = "idle" | "checking" | "ready" | "failed";

export type SubmissionHistorySource = "agent" | "admin" | "bb" | "system";

export type DrawerTab =
  | "overview"
  | "applicants"
  | "questionnaire"
  | "files"
  | "issues"
  | "history";

export type PassportExtractionStatus =
  | "idle"
  | "selected"
  | "uploaded"
  | "extracting"
  | "ready"
  | "failed"
  | "unavailable";

export type PassportExtractedFieldKey =
  | "firstName"
  | "surname"
  | "birthDate"
  | "birthPlace"
  | "birthCountry"
  | "citizenship"
  | "gender"
  | "passportType"
  | "passportNumber"
  | "passportIssuePlace"
  | "passportIssueCountry"
  | "passportIssuedAt"
  | "passportExpiresAt";

export type PassportExtractedField = {
  confidence: "low" | "medium" | "high";
  key: PassportExtractedFieldKey;
  needsManualReview: boolean;
  source: "passport_scan";
  value: string;
  verified?: boolean;
};

export type PassportExtractionReviewState = {
  appliedFieldKeys: PassportExtractedFieldKey[];
  attemptCount?: number;
  dismissedAtIso?: string;
  error?: string;
  extractedFields: PassportExtractedField[];
  lastAttemptAtIso?: string;
  openaiAttemptedForFingerprint?: string;
  orientation?: {
    corrected: boolean;
    reason: "mrz_detected";
    rotation: 0 | 90 | 180 | 270;
  };
  requestId?: string;
  sourceFileId?: string;
  sourceFileName?: string;
  sourceStoragePath?: string;
  status: PassportExtractionStatus;
  summary?: string;
  verifiedAtIso?: string;
};

export type VisaApplicationPdfReviewState = {
  id: string;
  applicantId?: string;
  applicantName?: string;
  artifact?: {
    fileName: string;
    deletedAtIso?: string;
    extractedPageCount?: number;
    extractionSource?: VisaApplicationPdfExtractionSource;
    failureReason?: string;
    mimeType: string;
    ocrPageLimit?: number;
    parserVersion?: number;
    sha256: string;
    sizeBytes: number;
    storageBucket?: string;
    storagePath?: string;
    uploadStatus?: FileAssetUploadStatus;
    uploadedAtIso: string;
    uploadedBy?: string;
  };
  checkedAtIso: string;
  data: VisaApplicationPdfReviewData;
  fileName?: string;
  findings: VisaPdfFinding[];
  handoffStatus: "blocked" | "needs_manual_confirmation" | "ready_for_agent";
  manualReviewConfirmedAtIso?: string;
  manualReviewConfirmedBy?: string;
  status: "clear" | "blocked" | "needs_review";
};

export type ReturnedPdfArtifact = {
  fileName: string;
  deletedAtIso?: string;
  failureReason?: string;
  mimeType: string;
  sha256: string;
  sizeBytes: number;
  storageBucket?: string;
  storagePath?: string;
  uploadStatus?: FileAssetUploadStatus;
  uploadedAtIso?: string;
  uploadedBy?: string;
};

export type ReturnedPdfPackageState = {
  commonAppointmentPdf?: ReturnedPdfArtifact;
  exportPackageId?: string;
  ownerAgentId?: AgentOwnerId;
  ownerAgentName?: string;
  reviewedAtIso?: string;
  reviewedBy?: string;
};

export type PassportUploadDraft = {
  applicantIndex: number;
  extractedFields: PassportExtractedField[];
  file?: File;
  fileName: string;
  id: string;
  status: PassportExtractionStatus;
};

export type PreliminaryIntakeDraft = {
  arrivalPlace: string;
  homeAddress: string;
  sameArrivalPlace: boolean;
  sameHomeAddress: boolean;
  sameSpainStay: boolean;
  sameTripDates: boolean;
  spainStayAddress: string;
  spainStayCity: string;
  spainStayName: string;
  tripDateFrom: string;
  tripDateTo: string;
};

export type SubmissionAction =
  | "save_progress"
  | "submit_for_review"
  | "submit_corrections"
  | "return_with_issues"
  | "accept"
  | "close_issues_accept"
  | "return_again"
  | "generate_export"
  | "mark_exported"
  | "open_history";

export type City = "Москва" | "Санкт-Петербург" | "Казань";

export const CANONICAL_CITIES = [
  "Москва",
  "Санкт-Петербург",
  "Казань",
] as const satisfies readonly City[];

export function isCity(value: string): value is City {
  return CANONICAL_CITIES.includes(value as City);
}

export type Applicant = {
  id: string;
  fullName: string;
  role?: ApplicantRole;
  questionnaireStatus: QuestionnaireStatus;
  fileStatus: QuestionnaireStatus;
  passportExtraction?: PassportExtractionReviewState;
  sections: QuestionnaireSection[];
};

export type QuestionnaireField = {
  id: string;
  label: string;
  value: string;
  required: boolean;
  control?: "text" | "select";
  options?: string[];
  placeholder?: string;
  span?: "full";
  error?: string;
  reviewConfirmedAtIso?: string;
  reviewConfirmedBy?: string;
  reviewOriginSource?: QuestionnaireReviewSource;
  reviewState?: QuestionnaireReviewState;
  reviewSource?: QuestionnaireReviewSource;
};

export type QuestionnaireSection = {
  id: string;
  title: string;
  stepLabel?: string;
  status: QuestionnaireStatus;
  missing?: string;
  fields: QuestionnaireField[];
};

export type Issue = {
  id: string;
  type: "field" | "section" | "file" | "media";
  target: {
    applicantId: string;
    applicantName: string;
    section?: string;
    field?: string;
    fileType?: SubmissionFileType;
  };
  reason: string;
  comment: string;
  severity: IssueSeverity;
  status: IssueStatus;
  createdBy: "admin" | "system";
  createdAt: string;
  snapshot?: string;
};

export type IssueTarget = Issue["target"];

export type IssueInput = {
  type: Issue["type"];
  applicantId: string;
  section?: string;
  field?: string;
  fileType?: SubmissionFileType;
  reason: string;
  comment: string;
  severity: IssueSeverity;
};

export type AiSuggestion = {
  id: string;
  type: "field" | "section" | "file" | "media";
  target: {
    applicantId: string;
    applicantName: string;
    section?: string;
    field?: string;
    fileType?: SubmissionFileType;
  };
  title: string;
  reason: string;
  confidence: "low" | "medium" | "high";
  severity: IssueSeverity;
  status: AiSuggestionStatus;
  createdAt: string;
};

export type SubmissionFile = {
  id: string;
  applicantId: string;
  type: SubmissionFileType;
  status: SubmissionFileStatus;
  generatedFileName?: string;
  mimeType?: string;
  originalFileName?: string;
  reviewedAtIso?: string;
  reviewedBy?: string;
  reviewStatus?: "not_reviewed" | "accepted" | "replace_required" | "poor_quality";
  sizeBytes?: number;
  storageAdapter?: FileAssetStorageAdapter;
  storageBucket?: string;
  storagePath?: string;
  uploadedAtIso?: string;
  uploadStatus?: FileAssetUploadStatus;
  uploadedBy?: string;
  uploadedAt?: string;
  linkedIssueId?: string;
};

export type SubmissionHistoryItem = {
  id: string;
  text: string;
  at: string;
  detail?: string;
  fromStatus?: SubmissionStatus;
  source?: SubmissionHistorySource;
  toStatus?: SubmissionStatus;
};

export type Submission = {
  id: string;
  agentId: AgentOwnerId;
  title: string;
  listTitle?: string;
  type: SubmissionType;
  country: "Испания";
  countryCode?: SpainCountryCode;
  city: City;
  tripDateFrom: string;
  tripDateTo: string;
  status: SubmissionStatus;
  returnedPdfPackage?: ReturnedPdfPackageState;
  visaApplicationPdfReview?: VisaApplicationPdfReviewState;
  visaApplicationPdfReviews?: VisaApplicationPdfReviewState[];
  applicants: Applicant[];
  issues: Issue[];
  files: SubmissionFile[];
  completeness: {
    questionnaire: number;
    files: number;
    total: number;
  };
  aiSuggestions?: AiSuggestion[];
  aiReviewState?: AiReviewState;
  exportPackage?: ExportPackageIdentity;
  exportState?: ExportState;
  createdAt: string;
  updatedAt: string;
  history: SubmissionHistoryItem[];
};

export type ActionDecision = {
  action: SubmissionAction;
  label: string;
  disabled?: boolean;
  reason?: string;
};

export type ExportRow = {
  submissionCode: string;
  submissionId: string;
  submissionTitle: string;
  applicantName: string;
  city: City;
  tripDates: string;
  type: string;
  groupKey: string;
  groupLabel: string;
  applicantIndex: number;
  applicantCount: number;
};

export type ExportBlocker = {
  reason: string;
};

export type DomainErrorCode =
  | "INVALID_SUBMISSION_KIND"
  | "INVALID_TRANSITION"
  | "PERMISSION_DENIED"
  | "VALIDATION_ERROR"
  | "ISSUE_NOT_FOUND"
  | "ISSUE_NOT_FIXABLE"
  | "ACCEPTANCE_BLOCKED"
  | "EXPORT_NOT_READY"
  | "EXPORTED_TERMINAL"
  | "BLOCKED_EXPORT_SCHEMA";

export type DomainError = {
  code: DomainErrorCode;
  message: string;
};

export type CommandResult<T = Submission> =
  | { ok: true; data: T }
  | { ok: false; error: DomainError };
