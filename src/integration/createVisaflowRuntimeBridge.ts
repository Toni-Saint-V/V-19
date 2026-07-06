import { applyExportPackageDraft, buildExportPackageDraft } from '../services/exportService';
import { loadLocalSubmissions, saveLocalSubmissions } from '../services/localRepository';
import type {
  AgentNavSection,
  AdminNavSection,
  RemarkBridgePayload,
  VisaflowBusinessBridge,
  VisaflowUiEvent,
  VisaflowWorkspace,
} from './visaflowBusinessBridge';

const runtimeStateKey = 'visaflow.v19.ui.runtimeBridge';

type RuntimeState = {
  workspace?: VisaflowWorkspace;
  agentNav?: AgentNavSection;
  adminNav?: AdminNavSection;
  activeSubmissionId?: string | null;
  activeQuestionnaireId?: string | null;
  lastRemark?: RemarkBridgePayload;
  lastEvent?: VisaflowUiEvent;
};

function readRuntimeState(): RuntimeState {
  if (typeof window === 'undefined') return {};

  try {
    const raw = window.sessionStorage.getItem(runtimeStateKey);
    return raw ? (JSON.parse(raw) as RuntimeState) : {};
  } catch {
    return {};
  }
}

function writeRuntimeState(nextState: RuntimeState) {
  if (typeof window === 'undefined') return;
  window.sessionStorage.setItem(runtimeStateKey, JSON.stringify(nextState));
}

function patchRuntimeState(patch: RuntimeState) {
  writeRuntimeState({ ...readRuntimeState(), ...patch });
}

function downloadExportArtifact(artifact: { blob: Blob; fileName: string }) {
  const url = URL.createObjectURL(artifact.blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = artifact.fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function trackEvent(event: VisaflowUiEvent) {
  patchRuntimeState({ lastEvent: event });

  if (import.meta.env.DEV) {
    console.info('[VisaFlow bridge]', event);
  }
}

export function createVisaflowRuntimeBridge(): VisaflowBusinessBridge {
  return {
    onWorkspaceSwitch: (workspace) => patchRuntimeState({ workspace }),
    onAgentNavChange: (agentNav) => patchRuntimeState({ agentNav }),
    onAdminNavChange: (adminNav) => patchRuntimeState({ adminNav }),
    onSubmissionOpen: (activeSubmissionId) => patchRuntimeState({ activeSubmissionId }),
    onQuestionnaireOpen: (activeQuestionnaireId) =>
      patchRuntimeState({ activeQuestionnaireId, activeSubmissionId: activeQuestionnaireId }),
    onCreatePackage: () => patchRuntimeState({ activeSubmissionId: null }),
    onUploadOpen: () => patchRuntimeState({ activeSubmissionId: null }),
    onAdminReviewOpen: (activeSubmissionId) => patchRuntimeState({ activeSubmissionId }),
    onVerifyDocument: (activeSubmissionId) => patchRuntimeState({ activeSubmissionId }),
    onRemarkOpen: (lastRemark) => patchRuntimeState({ lastRemark }),
    onRemarkSubmit: (lastRemark) => patchRuntimeState({ lastRemark }),
    onExportPackages: (submissionIds) => {
      const submissions = loadLocalSubmissions();
      const selectedIds = new Set(submissionIds);
      const selectedSubmissions = submissions.filter((submission) => selectedIds.has(submission.id));

      const draft = buildExportPackageDraft(selectedSubmissions, {
        createdAt: new Date().toISOString(),
        createdBy: 'admin-local',
        format: 'xlsx',
      });

      if (draft.status === 'blocked') {
        trackEvent({ type: 'export.start', submissionIds });
        console.warn('[VisaFlow bridge] Export blocked', draft.blockers);
        return;
      }

      downloadExportArtifact(draft.artifact);

      if (draft.status === 'ready') {
        saveLocalSubmissions(applyExportPackageDraft(submissions, draft));
      }

      patchRuntimeState({ activeSubmissionId: submissionIds[0] ?? null });
    },
    track: trackEvent,
  };
}
