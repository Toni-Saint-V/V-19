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
      trackEvent({ type: 'export.start', submissionIds });
      patchRuntimeState({ activeSubmissionId: submissionIds[0] ?? null });
    },
    track: trackEvent,
  };
}
