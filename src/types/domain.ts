export type Role = "agent" | "admin";

export type Screen =
  | "login"
  | "agent-overview"
  | "agent-create"
  | "agent-applications"
  | "agent-corrections"
  | "agent-detail"
  | "admin-overview"
  | "admin-queue"
  | "admin-detail"
  | "admin-export"
  | "admin-appointments";

export type SubmissionStatus =
  | "draft"
  | "filling"
  | "ready_for_review"
  | "waiting_review"
  | "in_review"
  | "returned"
  | "accepted"
  | "ready_for_excel"
  | "exported"
  | "sent_to_appointment"
  | "appointment_scheduled"
  | "attention_required"
  | "completed";

export type StatusGroup = "filling" | "review" | "fix" | "ready" | "appointment";

export type AppointmentStatus =
  | "not_started"
  | "sent_to_appointment"
  | "appointment_scheduled"
  | "attention_required"
  | "completed";

export type MediaState = "missing" | "uploaded" | "accepted" | "replace";

export type ApplicantStatus =
  | "questionnaire_empty"
  | "questionnaire_partial"
  | "questionnaire_complete"
  | "media_missing"
  | "waiting_review"
  | "needs_fix"
  | "accepted";

export type MediaUploadStatus = "none" | "uploaded";

export type MediaReviewStatus =
  | "not_reviewed"
  | "accepted"
  | "replace_required"
  | "poor_quality";

export type CorrectionStatus = "open" | "fixed" | "closed";

export type MediaSlotType =
  | "photo_white"
  | "selfie"
  | "selfie_2"
  | "passport_scan"
  | "pdf"
  | "video";

export type Tone =
  | "neutral"
  | "warning"
  | "info"
  | "success"
  | "error"
  | "gold"
  | "violet";

export interface Applicant {
  id?: string;
  name: string;
  role: string;
  suggestedRole?: string;
  roleConfirmed?: boolean;
  passport: string;
  form: number;
  media: number;
  mediaRequired: number;
  birthDate?: string;
  patronymic?: string;
  citizenship?: string;
  address?: string;
  phone?: string;
  email?: string;
  passportIssuedAt?: string;
  passportExpiresAt?: string;
  country?: string;
  city?: string;
  tripDates?: string;
  hotelName?: string;
  hotelAddress?: string;
  employment?: string;
  tripPurpose?: string;
  tripDuration?: string;
  mediaSlots?: MediaSlot[];
  status?: ApplicantStatus;
}

export interface MediaSlot {
  id: string;
  applicantId: string;
  type: MediaSlotType;
  label: string;
  state: MediaState;
  originalFileName?: string;
  generatedFileName?: string;
  mimeType?: string;
  sizeBytes?: number;
  reason?: string;
  uploadStatus?: MediaUploadStatus;
  reviewStatus?: MediaReviewStatus;
  uploadedAt?: string;
  reviewedAt?: string;
  reviewedBy?: string;
}

export interface Agent {
  id: string;
  name: string;
  email: string;
}

export interface MediaAsset extends MediaSlot {
  submissionId: string;
}

export interface MediaRowData {
  label: string;
  state: MediaState;
}

export interface CorrectionNote {
  id?: string;
  target: string;
  text: string;
  scope?: "submission" | "applicant" | "field" | "media";
  applicantId?: string;
  fieldKey?: keyof Applicant;
  mediaType?: MediaSlotType;
  severity?: "blocking" | "note";
  status?: CorrectionStatus;
  createdBy?: string;
  createdAt?: string;
  fixedAt?: string;
}

export interface ExportBatch {
  id: string;
  createdBy: string;
  createdAt: string;
  format: "csv" | "xlsx";
  idempotencyKey?: string;
  contentFingerprint?: string;
  fileName?: string;
  rowCount: number;
  submissionIds: string[];
}

export interface Appointment {
  submissionId: string;
  status: AppointmentStatus;
  city?: string;
  date?: string;
  time?: string;
  operatorComment?: string;
  updatedBy?: string;
  updatedAt?: string;
}

export interface StatusHistoryItem {
  id: string;
  entityType: "submission" | "applicant" | "media" | "appointment";
  entityId: string;
  fromStatus?: string;
  toStatus: string;
  comment: string;
  changedBy: string;
  changedAt: string;
}

export interface Submission {
  id: string;
  title: string;
  type: "single" | "family";
  agentId: string;
  agentName: string;
  country: string;
  city: string;
  travelDate: string;
  updated: string;
  status: SubmissionStatus;
  appointment: AppointmentStatus;
  appointmentDetails?: Appointment;
  priority: "Высокий" | "Средний" | "Низкий";
  fields: number;
  media: number;
  mediaRequired: number;
  applicants: Applicant[];
  mediaRows: MediaRowData[];
  notes: CorrectionNote[];
  timeline?: StatusHistoryItem[];
  familyIntelligence?: FamilyIntelligenceState;
  familyGroupId?: string;
  familyGroupColor?: string;
  createdAt?: string;
  submittedAt?: string;
  reviewStartedAt?: string;
  acceptedAt?: string;
  exportedAt?: string;
  exportHistory?: ExportBatch[];
}

export interface FamilyIntelligenceState {
  status: "unreviewed" | "confirmed" | "dismissed";
  confirmedAt?: string;
}

export interface MetaItem {
  label: string;
  tone: Tone;
}

export interface NextAction {
  label: string;
  button: string;
  tone: Tone;
}
