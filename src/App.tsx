import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { AccessGate } from './components/AccessGate';
import { CommandCenter } from './components/CommandCenter';
import { AdminWorkspace } from './components/AdminWorkspace';
import {
  emitVisaflowUiEvent,
  VisaflowBusinessBridgeProvider,
  noopVisaflowBusinessBridge,
  type VisaflowBusinessBridge,
} from './integration/visaflowBusinessBridge';
import { applyExportStateToSelection, applyActionToSubmissionListResult } from './modules/submissions/submissionActions';
import { completeExportPackage } from './modules/submissions/exportWorkflow';
import { loadSubmissions, saveSubmissions } from './modules/submissions/persistence';
import {
  loadCockpitSubmissionsForProfile,
  saveCockpitSubmissionsForProfile,
} from './modules/submissions/supabasePersistence';
import { getSupabaseClient } from './lib/supabase/client';
import {
  accessRequestRepository,
  authRepository,
  type AccessRequest,
  type AccessRequestRegistrationInput,
  type Session,
} from './shared/authRegistration';
import type { Role, Submission, SubmissionAction } from './modules/submissions/types';
import type { AppProfile } from './types/session';

type Workspace = 'agent' | 'admin';

export interface AppProps {
  bridge?: VisaflowBusinessBridge;
  initialWorkspace?: Workspace;
}

export default function App({ bridge = noopVisaflowBusinessBridge, initialWorkspace = 'agent' }: AppProps = {}) {
  const [workspace, setWorkspace] = useState<Workspace>(initialWorkspace);
  const [submissions, setSubmissions] = useState<Submission[]>(() =>
    getSupabaseClient() ? [] : loadSubmissions(),
  );
  const [authSession, setAuthSession] = useState<Session | null>(null);
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState('');
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [accessRequestsBusy, setAccessRequestsBusy] = useState(false);
  const [supabaseProfile, setSupabaseProfile] = useState<AppProfile | null>(null);
  const [ownerIdsBySubmissionId, setOwnerIdsBySubmissionId] = useState<
    Map<string, string>
  >(new Map());
  const supabaseEnabled = Boolean(getSupabaseClient());
  const activeApprovedSession =
    authSession?.status === 'active' && authSession.approvalStatus === 'approved'
      ? authSession
      : null;
  const visibleSubmissions = useMemo(() => {
    if (!activeApprovedSession) return [];
    if (activeApprovedSession.role === 'admin') return submissions;
    const ownerAgentId = activeApprovedSession.ownerAgentId ?? activeApprovedSession.userId;
    return submissions.filter((submission) => submission.agentId === ownerAgentId);
  }, [activeApprovedSession, submissions]);

  const refreshAccessRequests = useCallback(async () => {
    setAccessRequests(await accessRequestRepository.listPendingAccessRequests());
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapLocalAuth() {
      setAuthError('');
      try {
        const restored = await authRepository.restoreSession();
        if (cancelled) return;
        setAuthSession(restored);
        if (restored?.role === 'admin' && restored.status === 'active' && restored.approvalStatus === 'approved') {
          setWorkspace('admin');
        } else {
          setWorkspace('agent');
        }
        await refreshAccessRequests();
      } catch (error) {
        if (!cancelled) {
          setAuthError(error instanceof Error ? error.message : 'Не удалось восстановить сессию.');
        }
      } finally {
        if (!cancelled) setAuthChecked(true);
      }
    }

    void bootstrapLocalAuth();

    return () => {
      cancelled = true;
    };
  }, [refreshAccessRequests]);

  useEffect(() => {
    let cancelled = false;

    async function loadCanonicalSubmissions() {
      if (!supabaseEnabled) {
        setSubmissions(loadSubmissions());
        return;
      }

      if (!activeApprovedSession) return;

      const loaded = await loadCockpitSubmissionsForProfile({
        displayName: activeApprovedSession.fullName,
        email: activeApprovedSession.email,
        id: activeApprovedSession.userId,
        organizationName: activeApprovedSession.companyName,
        role: activeApprovedSession.role,
      });
      if (cancelled) return;

      setSupabaseProfile({
        displayName: activeApprovedSession.fullName,
        email: activeApprovedSession.email,
        id: activeApprovedSession.userId,
        organizationName: activeApprovedSession.companyName,
        role: activeApprovedSession.role,
      });
      setOwnerIdsBySubmissionId(loaded.ownerIdsBySubmissionId);
      setSubmissions(loaded.submissions);
    }

    void loadCanonicalSubmissions();

    return () => {
      cancelled = true;
    };
  }, [activeApprovedSession, supabaseEnabled]);

  const persistSubmissions = useCallback(async (nextSubmissions: Submission[]) => {
    setSubmissions(nextSubmissions);
    if (!supabaseEnabled) {
      saveSubmissions(nextSubmissions);
      return;
    }
    if (!supabaseProfile) return;

    const nextOwnerIds = await saveCockpitSubmissionsForProfile(
      supabaseProfile,
      nextSubmissions,
      ownerIdsBySubmissionId,
    );
    setOwnerIdsBySubmissionId(nextOwnerIds);
  }, [ownerIdsBySubmissionId, supabaseEnabled, supabaseProfile]);

  const persistVisibleAgentSubmissions = useCallback(
    async (nextVisibleSubmissions: Submission[]) => {
      const nextById = new Map(
        nextVisibleSubmissions.map((submission) => [submission.id, submission]),
      );
      const existingIds = new Set(submissions.map((submission) => submission.id));
      const additions = nextVisibleSubmissions.filter(
        (submission) => !existingIds.has(submission.id),
      );
      await persistSubmissions(
        [
          ...additions,
          ...submissions.map((submission) => nextById.get(submission.id) ?? submission),
        ],
      );
    },
    [persistSubmissions, submissions],
  );

  const handleLogin = useCallback(async (email: string, password: string) => {
    setAuthError('');
    const nextSession = await authRepository.loginApprovedUser(email, password);
    setAuthSession(nextSession);
    setWorkspace(nextSession.role === 'admin' && nextSession.status === 'active' && nextSession.approvalStatus === 'approved' ? 'admin' : 'agent');
    await refreshAccessRequests();
  }, [refreshAccessRequests]);

  const handleRegister = useCallback(async (input: AccessRequestRegistrationInput) => {
    setAuthError('');
    await authRepository.submitAccessRequest(input);
    const nextSession = await authRepository.restoreSession();
    setAuthSession(nextSession);
    setWorkspace('agent');
    await refreshAccessRequests();
  }, [refreshAccessRequests]);

  const handleResetPassword = useCallback(async (email: string) => {
    setAuthError('');
    if (!email.trim()) return 'Введите email.';
    return 'В local/dev режиме восстановление не отправляет email. Нужен Supabase Auth или email provider.';
  }, []);

  const handleSignOut = useCallback(async () => {
    await authRepository.logout();
    setAuthSession(null);
    setWorkspace('agent');
  }, []);

  const handleApproveAccessRequest = useCallback(async (requestId: string) => {
    if (!activeApprovedSession || activeApprovedSession.role !== 'admin') return;
    setAccessRequestsBusy(true);
    try {
      await accessRequestRepository.approveAccessRequest(requestId, activeApprovedSession.userId);
      await refreshAccessRequests();
    } finally {
      setAccessRequestsBusy(false);
    }
  }, [activeApprovedSession, refreshAccessRequests]);

  const handleRejectAccessRequest = useCallback(async (requestId: string) => {
    if (!activeApprovedSession || activeApprovedSession.role !== 'admin') return;
    setAccessRequestsBusy(true);
    try {
      await accessRequestRepository.rejectAccessRequest(requestId, activeApprovedSession.userId);
      await refreshAccessRequests();
    } finally {
      setAccessRequestsBusy(false);
    }
  }, [activeApprovedSession, refreshAccessRequests]);

  const applySubmissionAction = useCallback((
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
    if (result.ok) void persistSubmissions(result.data);
  }, [persistSubmissions, submissions]);

  const appBridge = useMemo<VisaflowBusinessBridge>(
    () => ({
      ...bridge,
      onSubmissionAction: ({ submissionId, action, source }) => {
        bridge.onSubmissionAction?.({ submissionId, action, source });
        applySubmissionAction(submissionId, action, source);
      },
      onExportPackages: async (submissionIds) => {
        if (
          workspace !== 'admin' ||
          activeApprovedSession?.role !== 'admin' ||
          activeApprovedSession.status !== 'active' ||
          activeApprovedSession.approvalStatus !== 'approved'
        ) {
          throw new Error('Only an approved admin session can complete export packages.');
        }

        const generatedSubmissions = applyExportStateToSelection(
          submissions,
          submissionIds,
          'file_generated',
        );
        const downloadedSubmissions = applyExportStateToSelection(
          generatedSubmissions,
          submissionIds,
          'file_downloaded',
        );
        if (downloadedSubmissions === generatedSubmissions) {
          throw new Error('Export download state was blocked by domain guards.');
        }

        const selectedDownloaded = downloadedSubmissions.filter((submission) =>
          submissionIds.includes(submission.id),
        );
        const completed = await completeExportPackage(selectedDownloaded, {
          createdAt: new Date().toISOString(),
          createdBy: activeApprovedSession.userId,
          format: 'xlsx',
        });
        if (completed.status === 'blocked') {
          throw new Error(completed.blockers.join('; '));
        }

        const exportedById = new Map(
          completed.submissions.map((submission) => [submission.id, submission]),
        );
        const nextSubmissions = downloadedSubmissions.map(
          (submission) => exportedById.get(submission.id) ?? submission,
        );
        await persistSubmissions(nextSubmissions);
        try {
          await bridge.onExportPackages?.(submissionIds);
        } catch {
          // External bridge/tracking is deliberately non-transactional after persistence.
        }
      },
    }),
    [activeApprovedSession, applySubmissionAction, bridge, persistSubmissions, submissions, workspace],
  );

  const switchWorkspace = () => {
    if (activeApprovedSession?.role !== 'admin') return;
    setWorkspace((current) => {
      const nextWorkspace = current === 'agent' ? 'admin' : 'agent';
      appBridge.onWorkspaceSwitch?.(nextWorkspace);
      emitVisaflowUiEvent(appBridge, { type: 'workspace.switch', workspace: nextWorkspace });
      return nextWorkspace;
    });
  };

  if (!authChecked) {
    return (
      <div className="min-h-dvh bg-[#101011] text-white grid place-items-center">
        <span className="text-sm text-white/50">Загрузка доступа...</span>
      </div>
    );
  }

  if (!activeApprovedSession) {
    return (
      <AccessGate
        error={authError}
        pendingSession={authSession}
        onLogin={handleLogin}
        onRegister={handleRegister}
        onResetPassword={handleResetPassword}
        onSignOut={handleSignOut}
      />
    );
  }

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
              <CommandCenter
                agentId={activeApprovedSession.ownerAgentId ?? activeApprovedSession.userId}
                onSubmissionsChange={persistVisibleAgentSubmissions}
                submissions={visibleSubmissions}
                onSignOut={handleSignOut}
                onSwitchWorkspace={activeApprovedSession.role === 'admin' ? switchWorkspace : undefined}
              />
            ) : (
              <AdminWorkspace
                accessRequests={accessRequests}
                accessRequestsBusy={accessRequestsBusy}
                currentEmail={activeApprovedSession.email}
                onApproveAccessRequest={handleApproveAccessRequest}
                onRejectAccessRequest={handleRejectAccessRequest}
                onSignOut={handleSignOut}
                onSwitchWorkspace={switchWorkspace}
                submissions={submissions}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </VisaflowBusinessBridgeProvider>
  );
}
