export type Role = "agent" | "admin";

export type Surface = "agent-submissions" | "admin-review" | "export";

export type SubmissionType = "single" | "family";

export type SubmissionStatus =
  | "draft"
  | "in_progress"
  | "requires_action"
  | "submitted_for_review"
  | "returned"
  | "corrections_received"
  | "ready_for_export"
  | "exported";

export type ApplicantRole = "main" | "spouse" | "child";

export type QuestionnaireStatus = "empty" | "partial" | "complete" | "needs_fix";

export type SubmissionFileStatus =
  | "missing"
  | "uploaded"
  | "needs_replacement"
  | "pending_review"
  | "accepted";

export type SubmissionFileType = "photo" | "selfie" | "video";

export type IssueSeverity = "blocker" | "warning" | "info";

export type IssueStatus = "open" | "fixed_by_manager" | "closed_by_admin";

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

export type Applicant = {
  id: string;
  fullName: string;
  role?: ApplicantRole;
  questionnaireStatus: QuestionnaireStatus;
  fileStatus: QuestionnaireStatus;
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
  uploadedBy?: string;
  uploadedAt?: string;
  linkedIssueId?: string;
};

export type SubmissionHistoryItem = {
  id: string;
  text: string;
  at: string;
  detail?: string;
  source?: SubmissionHistorySource;
};

export type Submission = {
  id: string;
  title: string;
  type: SubmissionType;
  country: "Испания";
  city: City;
  tripDateFrom: string;
  tripDateTo: string;
  status: SubmissionStatus;
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
