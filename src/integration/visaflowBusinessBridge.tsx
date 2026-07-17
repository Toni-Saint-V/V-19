import { createContext, useContext, type ReactNode } from 'react';
import type {
  IssueInput,
  SubmissionAction,
  SubmissionFileType,
} from '../modules/submissions/types';
import type { ExportPackageCompletionRequest } from '../modules/submissions/exportPackageDocumentCommit';
import type { SubmissionStatus } from '../components/Drawer';

export type VisaflowWorkspace = 'agent' | 'admin';
export type AgentNavSection =
  | 'actions'
  | 'documents'
  | 'submissions'
  | 'settings'
  | 'drafts'
  | 'applicants'
  | 'media'
  | 'issues';
export type AdminNavSection = 'review' | 'export' | 'users' | 'settings';

export interface VisaflowSubmissionSummary {
  id: string;
  title: string;
  type: 'single' | 'family';
  applicantsCount: number;
  city?: string;
  tripDates?: string;
  status?: SubmissionStatus;
  completeness?: number;
  updated?: string;
  owner?: string;
}

export interface RemarkBridgePayload {
  submissionId: string | null;
  applicantId?: string;
  field?: string;
  fileType?: SubmissionFileType;
  applicant?: string;
  severity?: 'warning' | 'critical';
  message?: string;
}

export interface AdminIssueBridgePayload {
  submissionId: string;
  input: IssueInput;
}

export interface AdminPassportSectionApprovalBridgePayload {
  submissionId: string;
  applicantId: string;
}

export interface AdminAiSuggestionBridgePayload {
  submissionId: string;
  suggestionId: string;
}

export type VisaflowUiEvent =
  | { type: 'workspace.switch'; workspace: VisaflowWorkspace }
  | { type: 'agent.nav'; section: AgentNavSection }
  | { type: 'admin.nav'; section: AdminNavSection }
  | { type: 'submission.open'; submissionId: string }
  | { type: 'questionnaire.open'; submissionId: string }
  | { type: 'submission.action'; payload: { submissionId: string; action: SubmissionAction; source: 'agent' | 'admin' } }
  | { type: 'package.create' }
  | { type: 'upload.open' }
  | { type: 'admin.review.open'; submissionId: string }
  | { type: 'admin.issue.add'; payload: AdminIssueBridgePayload }
  | { type: 'admin.passport-section.approve'; payload: AdminPassportSectionApprovalBridgePayload }
  | { type: 'admin.ai.run'; submissionId: string }
  | { type: 'admin.ai.accept'; payload: AdminAiSuggestionBridgePayload }
  | { type: 'admin.ai.dismiss'; payload: AdminAiSuggestionBridgePayload }
  | { type: 'admin.document.verify'; submissionId: string | null }
  | { type: 'admin.document.download'; submissionId: string | null }
  | { type: 'returned-pdf-handoff.publish'; submissionId: string }
  | { type: 'remark.open'; payload: RemarkBridgePayload }
  | { type: 'remark.submit'; payload: RemarkBridgePayload }
  | { type: 'export.start'; submissionIds: string[] };

export interface VisaflowBusinessBridge {
  onWorkspaceSwitch?: (workspace: VisaflowWorkspace) => void;
  onAgentNavChange?: (section: AgentNavSection) => void;
  onAdminNavChange?: (section: AdminNavSection) => void;
  onSubmissionOpen?: (submissionId: string) => void;
  onQuestionnaireOpen?: (submissionId: string) => void;
  onSubmissionAction?: (payload: { submissionId: string; action: SubmissionAction; source: 'agent' | 'admin' }) => void | Promise<void>;
  onCreatePackage?: () => void;
  onUploadOpen?: () => void;
  onAdminReviewOpen?: (submissionId: string) => void;
  onAdminIssueAdd?: (payload: AdminIssueBridgePayload) => void | Promise<void>;
  onAdminPassportSectionApprove?: (
    payload: AdminPassportSectionApprovalBridgePayload,
  ) => void | Promise<void>;
  onAdminAiReviewRun?: (submissionId: string) => void | Promise<void>;
  onAdminAiSuggestionAccept?: (
    payload: AdminAiSuggestionBridgePayload,
  ) => void | Promise<void>;
  onAdminAiSuggestionDismiss?: (
    payload: AdminAiSuggestionBridgePayload,
  ) => void | Promise<void>;
  onVerifyDocument?: (submissionId: string | null) => void;
  onDownloadOriginalDocument?: (submissionId: string | null) => void;
  onPublishReturnedPdfHandoff?: (submissionId: string) => void | Promise<void>;
  onRemarkOpen?: (payload: RemarkBridgePayload) => void;
  onRemarkSubmit?: (payload: RemarkBridgePayload) => void | Promise<void>;
  onExportPackages?: (
    request: ExportPackageCompletionRequest,
  ) => void | Promise<void>;
  track?: (event: VisaflowUiEvent) => void;
}

export const noopVisaflowBusinessBridge: VisaflowBusinessBridge = Object.freeze({});

const VisaflowBusinessBridgeContext = createContext<VisaflowBusinessBridge>(noopVisaflowBusinessBridge);

export function VisaflowBusinessBridgeProvider({
  bridge = noopVisaflowBusinessBridge,
  children,
}: {
  bridge?: VisaflowBusinessBridge;
  children: ReactNode;
}) {
  return <VisaflowBusinessBridgeContext.Provider value={bridge}>{children}</VisaflowBusinessBridgeContext.Provider>;
}

export function useVisaflowBusinessBridge() {
  return useContext(VisaflowBusinessBridgeContext);
}

export function emitVisaflowUiEvent(bridge: VisaflowBusinessBridge, event: VisaflowUiEvent) {
  bridge.track?.(event);
}
