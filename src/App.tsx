import { useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { CommandCenter } from './components/CommandCenter';
import { AdminWorkspace } from './components/AdminWorkspace';
import {
  emitVisaflowUiEvent,
  VisaflowBusinessBridgeProvider,
  noopVisaflowBusinessBridge,
  type VisaflowBusinessBridge,
} from './integration/visaflowBusinessBridge';
import { applyExportStateToSelection, applyActionToSubmissionListResult } from './modules/submissions/submissionActions';
import { loadSubmissions, saveSubmissions } from './modules/submissions/persistence';
import type { Role, Submission, SubmissionAction } from './modules/submissions/types';

type Workspace = 'agent' | 'admin';

export interface AppProps {
  bridge?: VisaflowBusinessBridge;
  initialWorkspace?: Workspace;
}

export default function App({ bridge = noopVisaflowBusinessBridge, initialWorkspace = 'agent' }: AppProps = {}) {
  const [workspace, setWorkspace] = useState<Workspace>(initialWorkspace);
  const [submissions, setSubmissions] = useState<Submission[]>(() => loadSubmissions());

  const persistSubmissions = (nextSubmissions: Submission[]) => {
    setSubmissions(nextSubmissions);
    saveSubmissions(nextSubmissions);
  };

  const applySubmissionAction = (
    submissionId: string,
    action: SubmissionAction,
    source: Role,
  ) => {
    const result = applyActionToSubmissionListResult(
      submissions,
      submissionId,
      action,
      source,
      source === 'admin' ? 'local-admin' : 'local-agent-tony',
    );
    if (result.ok) persistSubmissions(result.data);
  };

  const appBridge = useMemo<VisaflowBusinessBridge>(
    () => ({
      ...bridge,
      onSubmissionAction: ({ submissionId, action, source }) => {
        bridge.onSubmissionAction?.({ submissionId, action, source });
        applySubmissionAction(submissionId, action, source);
      },
      onExportPackages: (submissionIds) => {
        bridge.onExportPackages?.(submissionIds);
        const nextSubmissions = applyExportStateToSelection(
          submissions,
          submissionIds,
          'marked_exported',
        );
        if (nextSubmissions !== submissions) persistSubmissions(nextSubmissions);
      },
    }),
    [bridge, submissions],
  );

  const switchWorkspace = () => {
    setWorkspace((current) => {
      const nextWorkspace = current === 'agent' ? 'admin' : 'agent';
      appBridge.onWorkspaceSwitch?.(nextWorkspace);
      emitVisaflowUiEvent(appBridge, { type: 'workspace.switch', workspace: nextWorkspace });
      return nextWorkspace;
    });
  };

  return (
    <VisaflowBusinessBridgeProvider bridge={appBridge}>
      <div className="h-dvh w-full bg-[#101011] text-white overflow-hidden">
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={workspace}
            initial={{ opacity: 0, scale: 0.985 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.985 }}
            transition={{ duration: 0.2 }}
            className="h-full w-full"
          >
            {workspace === 'agent' ? (
              <CommandCenter submissions={submissions} onSwitchWorkspace={switchWorkspace} />
            ) : (
              <AdminWorkspace onSwitchWorkspace={switchWorkspace} />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </VisaflowBusinessBridgeProvider>
  );
}
