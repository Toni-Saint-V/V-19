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
      corrections: {
        Row: CorrectionRow;
        Insert: CorrectionInsert;
        Update: Partial<CorrectionInsert>;
        Relationships: [];
      };
      export_batches: {
        Row: ExportBatchRow;
        Insert: ExportBatchInsert;
        Update: Partial<ExportBatchInsert>;
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
    Functions: Record<string, never>;
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

export type ProfileInsert = Omit<ProfileRow, "created_at"> & {
  created_at?: string;
};

export interface SubmissionRow extends DbRecord {
  id: string;
  agent_id: string;
  type: "single" | "family";
  title: string;
  country: string;
  city: string;
  travel_date: string;
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

export type ApplicantInsert = Omit<ApplicantRow, "created_at" | "updated_at"> & {
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
  review_status: "not_reviewed" | "accepted" | "replace_required" | "poor_quality";
  uploaded_at: string | null;
  reviewed_at: string | null;
  reviewed_by: string | null;
}

export type MediaAssetInsert = MediaAssetRow;

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

export type CorrectionInsert = CorrectionRow;

export interface ExportBatchRow extends DbRecord {
  id: string;
  created_by: string;
  created_at: string;
  format: "xlsx" | "csv";
  row_count: number;
  submission_ids: string[];
}

export type ExportBatchInsert = ExportBatchRow;

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

export type AppointmentInsert = AppointmentRow;

export interface StatusHistoryRow extends DbRecord {
  id: string;
  entity_type: "submission" | "applicant" | "media" | "appointment";
  entity_id: string;
  from_status: string | null;
  to_status: string;
  comment: string;
  changed_by: string;
  changed_at: string;
}

export type StatusHistoryInsert = StatusHistoryRow;
