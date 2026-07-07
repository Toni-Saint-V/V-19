import { createContext, useContext, type ReactNode } from 'react';
import type { SubmissionStatus } from '../modules/submissions/types';

export type VisaflowWorkspace = 'agent' | 'admin';
export type AgentNavSection = 'actions' | 'documents' | 'submissions' | 'settings';
export type AdminNavSection = 'review' | 'export' | 'settings';

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
  field?: string;
  applicant?: string;
  severity?: 'warning' | 'critical';
  message?: string;
}

export type VisaflowUiEvent =
  | { type: 'workspace.switch'; workspace: VisaflowWorkspace }
  | { type: 'agent.nav'; section: AgentNavSection }
  | { type: 'admin.nav'; section: AdminNavSection }
  | { type: 'submission.open'; submissionId: string }
  | { type: 'questionnaire.open'; submissionId: string }
  | { type: 'package.create' }
  | { type: 'upload.open' }
  | { type: 'admin.review.open'; submissionId: string }
  | { type: 'admin.document.verify'; submissionId: string | null }
  | { type: 'remark.open'; payload: RemarkBridgePayload }
  | { type: 'remark.submit'; payload: RemarkBridgePayload }
  | { type: 'export.start'; submissionIds: string[] };

export interface VisaflowBusinessBridge {
  onWorkspaceSwitch?: (workspace: VisaflowWorkspace) => void;
  onAgentNavChange?: (section: AgentNavSection) => void;
  onAdminNavChange?: (section: AdminNavSection) => void;
  onSubmissionOpen?: (submissionId: string) => void;
  onQuestionnaireOpen?: (submissionId: string) => void;
  onCreatePackage?: () => void;
  onUploadOpen?: () => void;
  onAdminReviewOpen?: (submissionId: string) => void;
  onVerifyDocument?: (submissionId: string | null) => void;
  onRemarkOpen?: (payload: RemarkBridgePayload) => void;
  onRemarkSubmit?: (payload: RemarkBridgePayload) => void | Promise<void>;
  onExportPackages?: (submissionIds: string[]) => void | Promise<void>;
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
