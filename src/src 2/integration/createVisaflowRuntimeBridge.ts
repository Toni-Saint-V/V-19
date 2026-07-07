import { applyExportPackageDraft, buildExportPackageDraftsByCity } from '../services/exportService';
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
      const createdAt = new Date().toISOString();
      const cityDrafts = buildExportPackageDraftsByCity(selectedSubmissions, {
        createdAt,
        createdBy: 'admin-local',
        format: 'xlsx',
      });

      trackEvent({ type: 'export.start', submissionIds });

      if (cityDrafts.length === 0) {
        console.warn('[VisaFlow bridge] Export blocked: no selected submissions');
        return;
      }

      let nextSubmissions = submissions;
      let readyCount = 0;
      const blockedCities: Array<{ city: string; blockers: unknown }> = [];

      for (const { city, draft } of cityDrafts) {
        if (draft.status === 'blocked') {
          blockedCities.push({ city, blockers: draft.blockers });
          continue;
        }

        downloadExportArtifact(draft.artifact);

        if (draft.status === 'ready') {
          nextSubmissions = applyExportPackageDraft(nextSubmissions, draft);
          readyCount += 1;
        }
      }

      if (readyCount > 0) {
        saveLocalSubmissions(nextSubmissions);
      }

      if (blockedCities.length > 0) {
        console.warn('[VisaFlow bridge] Export blocked by city', blockedCities);
      }

      patchRuntimeState({ activeSubmissionId: submissionIds[0] ?? null });
    },
    track: trackEvent,
  };
}
