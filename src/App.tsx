import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { supabaseAccessRequestRepository } from './shared/supabaseAuthRegistration';
import {
  getCurrentAppSession,
  signInSupabaseWithPassword,
  signOutCurrentSession,
} from './services/authService';
import type { Role, Submission, SubmissionAction } from './modules/submissions/types';
import type { AppProfile, AppSession } from './types/session';

type Workspace = 'agent' | 'admin';

function sessionFromSupabase(appSession: AppSession): Session {
  const { profile, supabaseSession } = appSession;
  return {
    approvalStatus: 'approved',
    companyName: profile.organizationName ?? '',
    createdAt: supabaseSession?.user.created_at ?? new Date(0).toISOString(),
    email: profile.email,
    expiresAt: supabaseSession?.expires_at
      ? new Date(supabaseSession.expires_at * 1000).toISOString()
      : undefined,
    fullName: profile.displayName,
    ownerAgentId: profile.role === 'agent' ? profile.id : undefined,
    role: profile.role,
    status: 'active',
    userId: profile.id,
  };
}

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
  const submissionsRef = useRef(submissions);
  const ownerIdsBySubmissionIdRef = useRef(ownerIdsBySubmissionId);
  const supabaseEnabled = Boolean(getSupabaseClient());
  const activeApprovedSession =
    authSession?.status === 'active' && authSession.approvalStatus === 'approved'
      ? authSession
      : null;

  useEffect(() => {
    submissionsRef.current = submissions;
  }, [submissions]);

  useEffect(() => {
    ownerIdsBySubmissionIdRef.current = ownerIdsBySubmissionId;
  }, [ownerIdsBySubmissionId]);

  useEffect(() => {
    if (!supabaseEnabled) return;

    submissionsRef.current = [];
    ownerIdsBySubmissionIdRef.current = new Map();
    setSubmissions([]);
    setOwnerIdsBySubmissionId(new Map());
    setSupabaseProfile(null);
  }, [activeApprovedSession?.userId, supabaseEnabled]);
  const visibleSubmissions = useMemo(() => {
    if (!activeApprovedSession) return [];
    if (activeApprovedSession.role === 'admin') return submissions;
    const ownerAgentId = activeApprovedSession.ownerAgentId ?? activeApprovedSession.userId;
    return submissions.filter((submission) => submission.agentId === ownerAgentId);
  }, [activeApprovedSession, submissions]);

  const refreshAccessRequests = useCallback(async (session: Session | null) => {
    if (supabaseEnabled) {
      if (session?.role !== 'admin') {
        setAccessRequests([]);
        return;
      }
      setAccessRequests(await supabaseAccessRequestRepository.listPendingAccessRequests());
      return;
    }

    setAccessRequests(await accessRequestRepository.listPendingAccessRequests());
  }, [supabaseEnabled]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapLocalAuth() {
      setAuthError('');
      try {
        let restored: Session | null;
        if (supabaseEnabled) {
          const appSession = await getCurrentAppSession();
          restored = appSession ? sessionFromSupabase(appSession) : null;
        } else {
          restored = await authRepository.restoreSession();
        }
        if (cancelled) return;
        setAuthSession(restored);
        if (restored?.role === 'admin' && restored.status === 'active' && restored.approvalStatus === 'approved') {
          setWorkspace('admin');
        } else {
          setWorkspace('agent');
        }
        await refreshAccessRequests(restored);
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
  }, [refreshAccessRequests, supabaseEnabled]);

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
    const currentSubmissions = submissionsRef.current;
    const currentOwnerIds = ownerIdsBySubmissionIdRef.current;
    if (!supabaseEnabled) {
      submissionsRef.current = nextSubmissions;
      setSubmissions(nextSubmissions);
      saveSubmissions(nextSubmissions);
      return;
    }
    const persistenceProfile =
      supabaseProfile ??
      (activeApprovedSession
        ? {
            displayName: activeApprovedSession.fullName,
            email: activeApprovedSession.email,
            id: activeApprovedSession.userId,
            organizationName: activeApprovedSession.companyName,
            role: activeApprovedSession.role,
          }
        : null);
    if (!persistenceProfile) {
      throw new Error('Профиль Supabase ещё загружается. Повторите действие через несколько секунд.');
    }

    const currentById = new Map(currentSubmissions.map((submission) => [submission.id, submission]));
    const changedSubmissions = nextSubmissions.filter(
      (submission) => currentById.get(submission.id) !== submission,
    );
    if (!changedSubmissions.length) return;

    const nextOwnerIds = await saveCockpitSubmissionsForProfile(
      persistenceProfile,
      changedSubmissions,
      currentOwnerIds,
    );
    submissionsRef.current = nextSubmissions;
    setSubmissions(nextSubmissions);
    ownerIdsBySubmissionIdRef.current = nextOwnerIds;
    setOwnerIdsBySubmissionId(nextOwnerIds);
  }, [activeApprovedSession, supabaseEnabled, supabaseProfile]);

  const persistVisibleAgentSubmissions = useCallback(
    async (nextVisibleSubmissions: Submission[]) => {
      const currentSubmissions = submissionsRef.current;
      const nextById = new Map(
        nextVisibleSubmissions.map((submission) => [submission.id, submission]),
      );
      const existingIds = new Set(currentSubmissions.map((submission) => submission.id));
      const additions = nextVisibleSubmissions.filter(
        (submission) => !existingIds.has(submission.id),
      );
      await persistSubmissions(
        [
          ...additions,
          ...currentSubmissions.map((submission) => nextById.get(submission.id) ?? submission),
        ],
      );
    },
    [persistSubmissions],
  );

  const handleLogin = useCallback(async (email: string, password: string) => {
    setAuthError('');
    const nextSession = supabaseEnabled
      ? sessionFromSupabase(await signInSupabaseWithPassword(email, password))
      : await authRepository.loginApprovedUser(email, password);
    setAuthSession(nextSession);
    setWorkspace(nextSession.role === 'admin' && nextSession.status === 'active' && nextSession.approvalStatus === 'approved' ? 'admin' : 'agent');
    await refreshAccessRequests(nextSession);
  }, [refreshAccessRequests, supabaseEnabled]);

  const handleRegister = useCallback(async (input: AccessRequestRegistrationInput) => {
    setAuthError('');
    if (supabaseEnabled) {
      await supabaseAccessRequestRepository.submitAccessRequest(input);
      setAuthSession(null);
      setWorkspace('agent');
      setAccessRequests([]);
      return;
    }

    await authRepository.submitAccessRequest(input);
    const nextSession = await authRepository.restoreSession();
    setAuthSession(nextSession);
    setWorkspace('agent');
    await refreshAccessRequests(nextSession);
  }, [refreshAccessRequests, supabaseEnabled]);

  const handleResetPassword = useCallback(async (email: string) => {
    setAuthError('');
    if (!email.trim()) return 'Введите email.';
    return 'В local/dev режиме восстановление не отправляет email. Нужен Supabase Auth или email provider.';
  }, []);

  const handleSignOut = useCallback(async () => {
    if (supabaseEnabled) {
      await signOutCurrentSession();
    } else {
      await authRepository.logout();
    }
    setAuthSession(null);
    setWorkspace('agent');
    setAccessRequests([]);
    submissionsRef.current = [];
    ownerIdsBySubmissionIdRef.current = new Map();
    setSubmissions([]);
    setOwnerIdsBySubmissionId(new Map());
    setSupabaseProfile(null);
  }, [supabaseEnabled]);

  const handleApproveAccessRequest = useCallback(async (requestId: string) => {
    if (!activeApprovedSession || activeApprovedSession.role !== 'admin') return;
    setAccessRequestsBusy(true);
    try {
      const repository = supabaseEnabled
        ? supabaseAccessRequestRepository
        : accessRequestRepository;
      await repository.approveAccessRequest(requestId, activeApprovedSession.userId);
      await refreshAccessRequests(activeApprovedSession);
    } finally {
      setAccessRequestsBusy(false);
    }
  }, [activeApprovedSession, refreshAccessRequests, supabaseEnabled]);

  const handleRejectAccessRequest = useCallback(async (requestId: string) => {
    if (!activeApprovedSession || activeApprovedSession.role !== 'admin') return;
    setAccessRequestsBusy(true);
    try {
      const repository = supabaseEnabled
        ? supabaseAccessRequestRepository
        : accessRequestRepository;
      await repository.rejectAccessRequest(requestId, activeApprovedSession.userId);
      await refreshAccessRequests(activeApprovedSession);
    } finally {
      setAccessRequestsBusy(false);
    }
  }, [activeApprovedSession, refreshAccessRequests, supabaseEnabled]);

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
            initial={{ opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
            className="v19-fullscreen-app h-full w-full"
          >
            {workspace === 'agent' ? (
              <CommandCenter
                agentId={activeApprovedSession.ownerAgentId ?? activeApprovedSession.userId}
                onSubmissionsChange={persistVisibleAgentSubmissions}
                submissions={visibleSubmissions}
                usesSupabase={supabaseEnabled}
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
                usesSupabase={supabaseEnabled}
              />
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </VisaflowBusinessBridgeProvider>
  );
}
