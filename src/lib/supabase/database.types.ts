import type {
  AppointmentStatus,
  MediaSlotType,
  Role,
  SubmissionStatus,
} from "../../types/domain";

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      profiles: {
        Row: ProfileRow;
        Insert: ProfileInsert;
        Update: Partial<ProfileInsert>;
        Relationships: [];
      };
      access_requests: {
        Row: AccessRequestRow;
        Insert: AccessRequestInsert;
        Update: Partial<AccessRequestInsert>;
        Relationships: [];
      };
      submissions: {
        Row: SubmissionRow;
        Insert: SubmissionInsert;
        Update: Partial<SubmissionInsert>;
        Relationships: [];
      };
      applicants: {
        Row: ApplicantRow;
        Insert: ApplicantInsert;
        Update: Partial<ApplicantInsert>;
        Relationships: [];
      };
      media_assets: {
        Row: MediaAssetRow;
        Insert: MediaAssetInsert;
        Update: Partial<MediaAssetInsert>;
        Relationships: [];
      };
      document_assets: {
        Row: DocumentAssetRow;
        Insert: DocumentAssetInsert;
        Update: Partial<DocumentAssetInsert>;
        Relationships: [];
      };
      corrections: {
        Row: CorrectionRow;
        Insert: CorrectionInsert;
        Update: Partial<CorrectionInsert>;
        Relationships: [];
      };
      questionnaire_answers: {
        Row: QuestionnaireAnswerRow;
        Insert: QuestionnaireAnswerInsert;
        Update: Partial<QuestionnaireAnswerInsert>;
        Relationships: [];
      };
      returned_pdf_handoff_artifacts: {
        Row: ReturnedPdfHandoffArtifactRow;
        Insert: ReturnedPdfHandoffArtifactInsert;
        Update: Partial<ReturnedPdfHandoffArtifactInsert>;
        Relationships: [];
      };
      admin_pdf_artifacts: {
        Row: AdminPdfArtifactRow;
        Insert: AdminPdfArtifactInsert;
        Update: Partial<AdminPdfArtifactInsert>;
        Relationships: [];
      };
      export_batches: {
        Row: ExportBatchRow;
        Insert: ExportBatchInsert;
        Update: Partial<ExportBatchInsert>;
        Relationships: [];
      };
      export_batch_members: {
        Row: ExportBatchMemberRow;
        Insert: ExportBatchMemberInsert;
        Update: Partial<ExportBatchMemberInsert>;
        Relationships: [];
      };
      agent_return_packages: {
        Row: AgentReturnPackageRow;
        Insert: AgentReturnPackageInsert;
        Update: Partial<AgentReturnPackageInsert>;
        Relationships: [];
      };
      agent_return_package_artifacts: {
        Row: AgentReturnPackageArtifactRow;
        Insert: AgentReturnPackageArtifactInsert;
        Update: Partial<AgentReturnPackageArtifactInsert>;
        Relationships: [];
      };
      document_export_events: {
        Row: DocumentExportEventRow;
        Insert: DocumentExportEventInsert;
        Update: Partial<DocumentExportEventInsert>;
        Relationships: [];
      };
      appointments: {
        Row: AppointmentRow;
        Insert: AppointmentInsert;
        Update: Partial<AppointmentInsert>;
        Relationships: [];
      };
      status_history: {
        Row: StatusHistoryRow;
        Insert: StatusHistoryInsert;
        Update: Partial<StatusHistoryInsert>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: {
      ensure_submission_public_number: {
        Args: {
          submission_id: string;
        };
        Returns: {
          assignedNow: boolean;
          publicNumber: number;
        };
      };
      complete_export_package: {
        Args: {
          payload: ExportPackageCommitPayload;
        };
        Returns: ExportPackageCommitResult;
      };
      repair_incomplete_export_document_completion: {
        Args: {
          p_idempotency_key: string;
        };
        Returns: ExportPackageDocumentRepairResult;
      };
      publish_returned_pdf_handoff: {
        Args: {
          payload: ReturnedPdfHandoffPublishPayload;
        };
        Returns: ReturnedPdfHandoffPublishResult;
      };
      start_agent_return_package: {
        Args: {
          payload: AgentReturnPackageStartPayload;
        };
        Returns: AgentReturnPackageStartResult;
      };
      publish_agent_return_package: {
        Args: {
          payload: AgentReturnPackagePublishPayload;
        };
        Returns: AgentReturnPackagePublishResult;
      };
      save_submission_draft: {
        Args: {
          payload: SubmissionDraftPersistencePayload;
        };
        Returns: {
          submissionId: string;
          applicants: number;
          questionnaireAnswers?: number;
          mediaAssets: number;
          statusHistory: number;
        };
      };
      submit_corrections_handoff: {
        Args: {
          payload: SubmissionDraftPersistencePayload;
        };
        Returns: {
          submissionId: string;
          applicants: number;
          questionnaireAnswers?: number;
          mediaAssets: number;
          statusHistory: number;
          idempotent?: boolean;
        };
      };
      upsert_questionnaire_answers: {
        Args: {
          answers: QuestionnaireAnswerInsert[];
        };
        Returns: {
          answers: number;
        };
      };
    };
    Enums: {
      profile_role: Role;
      submission_status: SubmissionStatus;
      appointment_status: AppointmentStatus;
      media_slot_type: MediaSlotType;
      media_upload_status: "none" | "uploaded";
      media_review_status:
        | "not_reviewed"
        | "accepted"
        | "replace_required"
        | "poor_quality";
      access_request_status: AccessRequestStatus;
    };
    CompositeTypes: Record<string, never>;
  };
};

interface DbRecord {
  [key: string]: unknown;
}

export interface ProfileRow extends DbRecord {
  id: string;
  email: string;
  display_name: string;
  organization_name: string | null;
  role: Role;
  created_at: string;
}

export type ProfileInsert = Omit<ProfileRow, "created_at" | "role"> & {
  role?: Role;
  created_at?: string;
};

export type AccessRequestStatus = "pending" | "approved" | "rejected";

export interface AccessRequestRow extends DbRecord {
  id: string;
  user_id: string | null;
  email: string;
  full_name: string;
  company_name: string;
  city: string;
  phone: string;
  requested_role: "agent";
  status: AccessRequestStatus;
  created_at: string;
  updated_at: string;
  reviewed_at: string | null;
  reviewed_by_admin_id: string | null;
  rejection_reason: string | null;
}

export type AccessRequestInsert = Omit<
  AccessRequestRow,
  "id" | "created_at" | "updated_at" | "requested_role" | "status"
> & {
  id?: string;
  created_at?: string;
  requested_role?: "agent";
  status?: AccessRequestStatus;
  updated_at?: string;
};

export interface SubmissionRow extends DbRecord {
  id: string;
  public_number: number | null;
  agent_id: string;
  type: "single" | "family";
  title: string;
  country: string;
  city: string;
  travel_date: string;
  trip_date_from: string | null;
  trip_date_to: string | null;
  status: SubmissionStatus;
  priority: "Высокий" | "Средний" | "Низкий";
  readiness_percent: number;
  family_intelligence: Json | null;
  appointment_status: AppointmentStatus;
  created_at: string;
  submitted_at: string | null;
  review_started_at: string | null;
  accepted_at: string | null;
  exported_at: string | null;
  updated_at: string;
}

export type SubmissionInsert = Omit<
  SubmissionRow,
  | "created_at"
  | "public_number"
  | "submitted_at"
  | "review_started_at"
  | "accepted_at"
  | "exported_at"
  | "updated_at"
> & {
  created_at?: string;
  submitted_at?: string | null;
  review_started_at?: string | null;
  accepted_at?: string | null;
  exported_at?: string | null;
  updated_at?: string;
};

export interface ApplicantRow extends DbRecord {
  id: string;
  submission_id: string;
  full_name: string;
  role: string;
  suggested_role: string | null;
  role_confirmed: boolean;
  birth_date: string | null;
  patronymic: string | null;
  citizenship: string | null;
  address: string | null;
  phone: string | null;
  email: string | null;
  passport_number: string;
  passport_issued_at: string | null;
  passport_expires_at: string | null;
  country: string;
  city: string;
  trip_dates: string;
  hotel_name: string | null;
  hotel_address: string | null;
  questionnaire_percent: number;
  media_percent: number;
  created_at: string;
  updated_at: string;
}

export type ApplicantInsert = Omit<
  ApplicantRow,
  "created_at" | "updated_at"
> & {
  created_at?: string;
  updated_at?: string;
};

export interface MediaAssetRow extends DbRecord {
  id: string;
  applicant_id: string;
  submission_id: string;
  type: MediaSlotType;
  original_file_name: string | null;
  generated_file_name: string | null;
  storage_bucket: string;
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  upload_status: "none" | "uploaded";
  review_status:
    | "not_reviewed"
    | "accepted"
    | "replace_required"
    | "poor_quality";
  uploaded_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

export type MediaAssetInsert = MediaAssetRow;

export type DocumentAssetType = "passport_scan" | "selfie_1" | "selfie_2";
export type DocumentUploadStatus = "pending" | "uploaded" | "failed";
export type DocumentValidationStatus = "pending" | "passed" | "failed";
export type DocumentExportStatus = "not_ready" | "ready" | "exported";

export interface DocumentAssetRow extends DbRecord {
  id: string;
  source_media_asset_id: string | null;
  submission_id: string;
  applicant_id: string;
  owner_user_id: string | null;
  type: DocumentAssetType;
  bucket: "submission-media";
  storage_path: string;
  filename: string | null;
  upload_status: DocumentUploadStatus;
  validation_status: DocumentValidationStatus;
  export_status: DocumentExportStatus;
  mime: string | null;
  size: number | null;
  checksum: string | null;
  uploaded_at: string | null;
  validated_at: string | null;
  created_at: string;
  updated_at: string | null;
}

export type DocumentAssetInsert = Omit<
  DocumentAssetRow,
  "id" | "created_at" | "updated_at"
> & {
  id?: string;
  created_at?: string;
  updated_at?: string | null;
};

export interface CorrectionRow extends DbRecord {
  id: string;
  submission_id: string;
  applicant_id: string | null;
  scope: "submission" | "applicant" | "field" | "media";
  field_key: string | null;
  media_type: MediaSlotType | null;
  reason: string;
  severity: "blocking" | "note";
  status: "open" | "fixed" | "closed";
  created_by: string;
  created_at: string;
  fixed_at: string | null;
}

export type CorrectionInsert = Omit<
  CorrectionRow,
  "id" | "created_at" | "fixed_at"
> & {
  id?: string;
  created_at?: string;
  fixed_at?: string | null;
};

export interface QuestionnaireAnswerRow extends DbRecord {
  id: string;
  submission_id: string;
  applicant_id: string;
  section_id: string;
  field_id: string;
  label: string;
  value: Json;
  updated_by: string | null;
  created_at: string;
  updated_at: string;
}

export type QuestionnaireAnswerInsert = Omit<
  QuestionnaireAnswerRow,
  "id" | "created_at" | "updated_at"
> & {
  id?: string;
  created_at?: string;
  updated_at?: string;
};

export interface ReturnedPdfHandoffArtifactRow extends DbRecord {
  id: string;
  submission_id: string;
  applicant_id: string | null;
  artifact_kind: "appointment_pdf" | "visa_application_pdf";
  storage_bucket: "submission-media";
  storage_path: string;
  file_name: string;
  sha256: string;
  released_by: string;
  released_at: string;
}

export type ReturnedPdfHandoffArtifactInsert = Omit<
  ReturnedPdfHandoffArtifactRow,
  "id" | "released_at"
> & {
  id?: string;
  released_at?: string;
};

export type AdminPdfArtifactKind = "appointment_pdf" | "application_pdf";

export interface AdminPdfArtifactRow extends DbRecord {
  id: string;
  submission_id: string;
  artifact_kind: AdminPdfArtifactKind;
  storage_bucket: "submission-media";
  storage_path: string;
  file_name: string;
  sha256: string;
  uploaded_by: string;
  uploaded_at: string;
}

export type AdminPdfArtifactInsert = Omit<
  AdminPdfArtifactRow,
  "id" | "uploaded_at"
> & {
  id?: string;
  uploaded_at?: string;
};

export interface ExportBatchRow extends DbRecord {
  id: string;
  created_by: string;
  created_at: string;
  file_name: string | null;
  format: "xlsx" | "csv";
  content_fingerprint: string | null;
  idempotency_key: string | null;
  row_count: number;
  submission_ids: string[];
}

export type ExportBatchInsert = Omit<
  ExportBatchRow,
  | "id"
  | "created_by"
  | "created_at"
  | "content_fingerprint"
  | "file_name"
  | "idempotency_key"
> & {
  id?: string;
  created_by?: string;
  created_at?: string;
  content_fingerprint?: string | null;
  file_name?: string | null;
  idempotency_key?: string | null;
};

export interface ExportBatchMemberRow extends DbRecord {
  export_batch_id: string;
  submission_id: string;
  applicant_id: string;
  source_agent_id: string;
  source_agent_display_name: string;
  city: string;
  submission_type: "single" | "family";
  family_submission_id: string | null;
  submission_title: string;
  applicant_name: string;
  submission_order: number;
  applicant_order: number;
  created_at: string;
}

export type ExportBatchMemberInsert = Omit<
  ExportBatchMemberRow,
  "created_at"
> & {
  created_at?: string;
};

export type AgentReturnPackageStatus = "draft" | "published";

export interface AgentReturnPackageRow extends DbRecord {
  id: string;
  export_batch_id: string;
  agent_id: string;
  city: string;
  status: AgentReturnPackageStatus;
  created_by: string;
  created_at: string;
  published_by: string | null;
  published_at: string | null;
}

export type AgentReturnPackageInsert = Omit<
  AgentReturnPackageRow,
  "id" | "created_at" | "published_by" | "published_at" | "status"
> & {
  id?: string;
  created_at?: string;
  published_by?: string | null;
  published_at?: string | null;
  status?: AgentReturnPackageStatus;
};

export type AgentReturnPackageArtifactKind =
  | "agent_list_pdf"
  | "visa_application_pdf";

export interface AgentReturnPackageArtifactRow extends DbRecord {
  id: string;
  return_package_id: string;
  applicant_id: string | null;
  applicant_name: string | null;
  artifact_kind: AgentReturnPackageArtifactKind;
  storage_bucket: "agent-return-packages";
  storage_path: string;
  file_name: string;
  sha256: string;
  size_bytes: number;
  uploaded_by: string;
  uploaded_at: string;
}

export type AgentReturnPackageArtifactInsert = Omit<
  AgentReturnPackageArtifactRow,
  "id" | "uploaded_at" | "uploaded_by"
> & {
  id?: string;
  uploaded_at?: string;
  uploaded_by?: string;
};

export interface AgentReturnPackageStartPayload {
  exportPackageKey: string;
  agentId: string;
}

export interface AgentReturnPackageStartResult extends DbRecord {
  id: string;
  exportBatchId: string;
  agentId: string;
  city: string;
  status: AgentReturnPackageStatus;
  applicantCount: number;
}

export interface AgentReturnPackagePublishPayload {
  returnPackageId: string;
}

export interface AgentReturnPackagePublishResult extends DbRecord {
  id: string;
  status: AgentReturnPackageStatus;
  artifactCount: number;
  duplicate: boolean;
}

export interface DocumentExportEventRow extends DbRecord {
  id: string;
  event_type: "DOCUMENT_EXPORT_CREATED";
  submission_ids: string[];
  asset_ids: string[];
  zip_file_name: string;
  file_count: number;
  applicant_count: number | null;
  workbook_file_name: string | null;
  package_identity_key: string | null;
  created_by: string | null;
  created_at: string;
}

export type DocumentExportEventInsert = Omit<
  DocumentExportEventRow,
  | "id"
  | "created_by"
  | "created_at"
  | "applicant_count"
  | "workbook_file_name"
> & {
  applicant_count?: number | null;
  id?: string;
  created_by?: string | null;
  created_at?: string;
  workbook_file_name?: string | null;
};

export interface ExportPackageCommitPayload extends DbRecord {
  batch: {
    id?: string;
    format: "xlsx" | "csv";
    content_fingerprint: string;
    idempotency_key: string;
    file_name: string;
    row_count: number;
    submission_ids: string[];
  };
  document_export: {
    asset_ids: string[];
    zip_file_name: string;
    file_count: number;
    applicant_count: number;
    workbook_file_name: string;
  };
}

export interface ExportPackageDocumentCommitResult extends DbRecord {
  id: string;
  asset_ids: string[];
  zip_file_name: string;
  file_count: number;
  applicant_count: number;
  workbook_file_name: string;
}

export interface ExportPackageCommitResult extends DbRecord {
  exportBatch: ExportBatchRow;
  documentExport: ExportPackageDocumentCommitResult;
  submissions: number;
  statusHistory: number;
  duplicate: boolean;
}

export interface ExportPackageDocumentRepairResult extends DbRecord {
  exportBatchId: string;
  documentExportId: string;
  repaired: boolean;
}

export interface ReturnedPdfHandoffPublishPayload extends DbRecord {
  submissionId: string;
}

export interface ReturnedPdfHandoffPublishResult extends DbRecord {
  submissionId: string;
  artifactCount: number;
  duplicate?: boolean;
}

export interface AppointmentRow extends DbRecord {
  id: string;
  submission_id: string;
  status: AppointmentStatus;
  city: string;
  date: string | null;
  time: string | null;
  operator_comment: string;
  updated_by: string;
  updated_at: string;
}

export type AppointmentInsert = Omit<AppointmentRow, "id" | "updated_at"> & {
  id?: string;
  updated_at?: string;
};

export interface StatusHistoryRow extends DbRecord {
  id: string;
  entity_type: "submission" | "applicant" | "media" | "appointment";
  entity_id: string;
  from_status: string | null;
  to_status: string;
  comment: string;
  source: "agent" | "admin" | "bb" | "system";
  note: string | null;
  changed_by: string;
  changed_at: string;
}

export type StatusHistoryInsert = Omit<
  StatusHistoryRow,
  "id" | "changed_at"
> & {
  id?: string;
  changed_at?: string;
};

export interface SubmissionDraftPersistencePayload extends DbRecord {
  submission: SubmissionInsert;
  applicants: ApplicantInsert[];
  questionnaire_answers?: QuestionnaireAnswerInsert[];
  media_assets: MediaAssetInsert[];
  corrections: CorrectionInsert[];
  status_history: StatusHistoryInsert[];
}
