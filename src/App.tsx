import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessGate } from "./components/AccessGate";
import {
  noopVisaflowBusinessBridge,
  type VisaflowBusinessBridge,
} from "./integration/visaflowBusinessBridge";
import {
  addPreciseAdminIssue,
  approveQuestionnaireFieldForAdmin,
  applyExportStateToSelection,
  applyActionToSubmissionListResult,
  markSubmissionFileAccepted,
} from "./modules/submissions/submissionActions";
import { isPersistablePrivateFileAssetAtSubmissionTarget } from "./modules/submissions/fileAsset";
import {
  acceptAiSuggestionAsIssue,
  dismissAiSuggestion,
  runAiReview,
} from "./modules/submissions/aiSuggestions";
import {
  completeExportPackage,
  ExportPackageCompletionUncertainError,
  reconcileExportPackageCompletion,
} from "./modules/submissions/exportWorkflow";
import {
  buildExportPackageIdentity,
  exportPackageIdentityMatches,
} from "./modules/submissions/exportRules";
import { exportPackageDocumentCommitMatchesIdentity } from "./modules/submissions/exportPackageDocumentCommit";
import {
  loadCockpitSubmissionsForProfile,
  saveCockpitSubmissionsForProfile,
} from "./modules/submissions/supabasePersistence";
import { getSupabaseClient } from "./lib/supabase/client";
import type {
  AccessRequest,
  AccessRequestRegistrationInput,
  Session,
} from "./shared/authContract";
import { supabaseAccessRequestRepository } from "./shared/supabaseAuthRegistration";
import {
  getCurrentAppSession,
  requestPasswordReset,
  signInSupabaseWithPassword,
  signOutCurrentSession,
} from "./services/authService";
import {
  completeSupabaseInvitePasswordSetup,
  getPendingSupabaseInvitePasswordSetup,
} from "./services/supabaseInviteFlow";
import { completeSupabasePasswordRecovery } from "./services/supabasePasswordRecovery";
import { fetchCurrentProfile } from "./services/profileService";
import { supabaseRuntimeConfig } from "./lib/supabase/config";
import {
  canRefreshVisibleWorkspace,
  isCurrentWorkspaceSession,
  isLatestWorkspaceResponse,
  shouldBlockLocalDemoDataSource,
  WorkspaceRefreshCoordinator,
  workspaceDataState as workspaceDataStatusForCount,
  workspaceInitialGate,
  workspaceRefreshIntervalMs,
  type WorkspaceDataStatus,
  type WorkspaceSessionToken,
} from "./lib/supabase/workspaceRuntime";
import type { Role, Submission, SubmissionAction } from "./modules/submissions/types";
import type { AppProfile, AppSession } from "./types/session";

type Workspace = "agent" | "admin";

type WorkspaceDataState = {
  error?: string;
  refreshedAt?: string;
  sessionUserId?: string;
  status: WorkspaceDataStatus;
};

function sessionFromSupabase(appSession: AppSession): Session {
  const { profile, supabaseSession } = appSession;
  return {
    approvalStatus: "approved",
    companyName: profile.organizationName ?? "",
    createdAt: supabaseSession?.user.created_at ?? new Date(0).toISOString(),
    email: profile.email,
    expiresAt: supabaseSession?.expires_at
      ? new Date(supabaseSession.expires_at * 1000).toISOString()
      : undefined,
    fullName: profile.displayName,
    ownerAgentId: profile.role === "agent" ? profile.id : undefined,
    role: profile.role,
    status: "active",
    userId: profile.id,
  };
}

function pendingSessionFromAccessRequest(request: AccessRequest): Session {
  return {
    approvalStatus: "pending",
    companyName: request.companyName,
    createdAt: request.createdAt,
    email: request.email,
    fullName: request.fullName,
    role: "agent",
    status: "pending",
    userId: request.userId,
  };
}

function approvedSessionUserId(session: Session | null): string | null {
  return session?.status === "active" && session.approvalStatus === "approved"
    ? session.userId
    : null;
}

export interface AppProps {
  bridge?: VisaflowBusinessBridge;
  initialWorkspace?: Workspace;
  inviteSetupPromise?: Promise<{ email: string; userId: string } | null>;
  recoverySetupPromise?: Promise<{ email: string; userId: string } | null>;
}

const noInviteSetupPromise = Promise.resolve(null);

const WorkspaceSurface = lazy(async () => {
  const module = await import("./components/WorkspaceSurface");
  return { default: module.WorkspaceSurface };
});

export default function App({
  bridge = noopVisaflowBusinessBridge,
  initialWorkspace = "agent",
  inviteSetupPromise = noInviteSetupPromise,
  recoverySetupPromise = noInviteSetupPromise,
}: AppProps = {}) {
  const supabaseClient = getSupabaseClient();
  const supabaseActivationBlocked = shouldBlockLocalDemoDataSource(
    supabaseRuntimeConfig,
    __V19_LOCAL_DEMO_BUILD__,
  );
  const supabaseEnabled = Boolean(supabaseClient);
  const localDemoEnabled =
    __V19_LOCAL_DEMO_BUILD__ && !supabaseEnabled && !supabaseActivationBlocked;
  const [workspace, setWorkspace] = useState<Workspace>(initialWorkspace);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [authSession, setAuthSession] = useState<Session | null>(null);
  const [inviteSetupEmail, setInviteSetupEmail] = useState("");
  const [recoverySetupEmail, setRecoverySetupEmail] = useState("");
  const [authChecked, setAuthChecked] = useState(false);
  const [authError, setAuthError] = useState("");
  const [accessRequests, setAccessRequests] = useState<AccessRequest[]>([]);
  const [accessRequestsBusy, setAccessRequestsBusy] = useState(false);
  const [supabaseProfile, setSupabaseProfile] = useState<AppProfile | null>(null);
  const [ownerIdsBySubmissionId, setOwnerIdsBySubmissionId] = useState<
    Map<string, string>
  >(new Map());
  const [workspaceDataState, setWorkspaceDataState] = useState<WorkspaceDataState>(
    () => ({
      error: supabaseActivationBlocked
        ? supabaseRuntimeConfig.blockedReasons.join(" ")
        : undefined,
      status: supabaseActivationBlocked ? "blocked" : "idle",
    }),
  );
  const submissionsRef = useRef(submissions);
  const ownerIdsBySubmissionIdRef = useRef(ownerIdsBySubmissionId);
  const workspaceRefreshRequestRef = useRef(0);
  const workspaceRefreshCoordinatorRef = useRef(new WorkspaceRefreshCoordinator());
  const workspaceSessionGenerationRef = useRef(0);
  const workspaceSessionUserIdRef = useRef<string | null>(null);
  const workspaceMutationStateRef = useRef({ count: 0, generation: 0 });
  const workspaceSubmissionMutationQueueRef = useRef(
    new Map<string, Promise<Submission>>(),
  );
  const activeApprovedSession =
    authSession?.status === "active" && authSession.approvalStatus === "approved"
      ? authSession
      : null;

  const invalidateWorkspaceSession = useCallback((nextUserId: string | null) => {
    workspaceSessionGenerationRef.current += 1;
    workspaceSessionUserIdRef.current = nextUserId;
    workspaceRefreshRequestRef.current += 1;
    workspaceRefreshCoordinatorRef.current.invalidate();
    workspaceMutationStateRef.current = {
      count: 0,
      generation: workspaceSessionGenerationRef.current,
    };
    workspaceSubmissionMutationQueueRef.current.clear();
  }, []);

  const commitAuthSession = useCallback(
    (nextSession: Session | null) => {
      invalidateWorkspaceSession(approvedSessionUserId(nextSession));
      setAuthSession(nextSession);
    },
    [invalidateWorkspaceSession],
  );

  useEffect(() => {
    submissionsRef.current = submissions;
  }, [submissions]);

  useEffect(() => {
    ownerIdsBySubmissionIdRef.current = ownerIdsBySubmissionId;
  }, [ownerIdsBySubmissionId]);

  useEffect(() => {
    if (supabaseActivationBlocked) return;
    if (!supabaseEnabled) return;

    const nextUserId = activeApprovedSession?.userId ?? null;
    if (workspaceSessionUserIdRef.current !== nextUserId) {
      invalidateWorkspaceSession(nextUserId);
    }

    submissionsRef.current = [];
    ownerIdsBySubmissionIdRef.current = new Map();
    setSubmissions([]);
    setOwnerIdsBySubmissionId(new Map());
    setSupabaseProfile(null);
    setWorkspaceDataState({
      sessionUserId: nextUserId ?? undefined,
      status: nextUserId ? "loading" : "idle",
    });
  }, [
    activeApprovedSession?.userId,
    invalidateWorkspaceSession,
    supabaseActivationBlocked,
    supabaseEnabled,
  ]);
  const visibleSubmissions = useMemo(() => {
    if (!activeApprovedSession) return [];
    if (activeApprovedSession.role === "admin") return submissions;
    const ownerAgentId =
      activeApprovedSession.ownerAgentId ?? activeApprovedSession.userId;
    return submissions.filter((submission) => submission.agentId === ownerAgentId);
  }, [activeApprovedSession, submissions]);

  const loadAccessRequests = useCallback(
    async (session: Session | null) => {
      if (session?.role !== "admin") return [];

      if (supabaseEnabled) {
        return supabaseAccessRequestRepository.listAccessRequests();
      }

      if (!__V19_LOCAL_DEMO_BUILD__) return [];
      const { accessRequestRepository } = await import("./shared/authRegistration");
      return accessRequestRepository.listAccessRequests();
    },
    [supabaseEnabled],
  );

  const refreshAccessRequests = useCallback(
    async (session: Session | null) => {
      const expectedUserId = approvedSessionUserId(session);
      const generation = workspaceSessionGenerationRef.current;
      const nextAccessRequests = await loadAccessRequests(session);
      if (
        generation !== workspaceSessionGenerationRef.current ||
        expectedUserId !== workspaceSessionUserIdRef.current
      ) {
        return;
      }
      setAccessRequests(nextAccessRequests);
    },
    [loadAccessRequests],
  );

  const activeProfile = useMemo<AppProfile | null>(() => {
    if (!activeApprovedSession) return null;
    return {
      displayName: activeApprovedSession.fullName,
      email: activeApprovedSession.email,
      id: activeApprovedSession.userId,
      organizationName: activeApprovedSession.companyName,
      role: activeApprovedSession.role,
    };
  }, [activeApprovedSession]);

  const runCanonicalSubmissionsRefresh = useCallback(async () => {
    if (!supabaseEnabled || !activeApprovedSession || !activeProfile) return;

    const sessionToken: WorkspaceSessionToken = {
      generation: workspaceSessionGenerationRef.current,
      userId: activeApprovedSession.userId,
    };
    if (
      !isCurrentWorkspaceSession(
        sessionToken,
        workspaceSessionGenerationRef.current,
        workspaceSessionUserIdRef.current,
      )
    ) {
      return;
    }

    const requestId = workspaceRefreshRequestRef.current + 1;
    workspaceRefreshRequestRef.current = requestId;
    setWorkspaceDataState((current) => ({
      ...current,
      error: undefined,
      sessionUserId: sessionToken.userId,
      status:
        current.sessionUserId !== sessionToken.userId ||
        current.status === "idle" ||
        current.status === "error"
          ? "loading"
          : current.status,
    }));

    const isCurrentResponse = () =>
      isLatestWorkspaceResponse(requestId, workspaceRefreshRequestRef.current) &&
      isCurrentWorkspaceSession(
        sessionToken,
        workspaceSessionGenerationRef.current,
        workspaceSessionUserIdRef.current,
      );

    try {
      const [loaded, nextAccessRequests] = await Promise.all([
        loadCockpitSubmissionsForProfile(activeProfile),
        loadAccessRequests(activeApprovedSession),
      ]);
      if (!isCurrentResponse()) return;

      submissionsRef.current = loaded.submissions;
      ownerIdsBySubmissionIdRef.current = loaded.ownerIdsBySubmissionId;
      setSupabaseProfile(activeProfile);
      setOwnerIdsBySubmissionId(loaded.ownerIdsBySubmissionId);
      setSubmissions(loaded.submissions);
      setAccessRequests(nextAccessRequests);
      setWorkspaceDataState({
        refreshedAt: new Date().toISOString(),
        sessionUserId: sessionToken.userId,
        status: workspaceDataStatusForCount(loaded.submissions.length),
      });
    } catch (error) {
      if (!isCurrentResponse()) return;
      setWorkspaceDataState({
        error:
          error instanceof Error
            ? error.message
            : "Не удалось загрузить данные Supabase.",
        sessionUserId: sessionToken.userId,
        status: "error",
      });
    }
  }, [activeApprovedSession, activeProfile, loadAccessRequests, supabaseEnabled]);

  const refreshCanonicalSubmissions = useCallback(() => {
    const mutationState = workspaceMutationStateRef.current;
    const blockedByMutation =
      mutationState.generation === workspaceSessionGenerationRef.current &&
      mutationState.count > 0;
    return workspaceRefreshCoordinatorRef.current.request(
      runCanonicalSubmissionsRefresh,
      blockedByMutation,
    );
  }, [runCanonicalSubmissionsRefresh]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapLocalAuth() {
      setAuthError("");
      try {
        if (supabaseActivationBlocked) {
          commitAuthSession(null);
          setWorkspace("agent");
          setAccessRequests([]);
          setAuthError(
            supabaseRuntimeConfig.blockedReasons.join(" ") ||
              supabaseRuntimeConfig.activation.boundary,
          );
          return;
        }

        let restored: Session | null;
        if (supabaseEnabled) {
          const client = getSupabaseClient();
          const recoverySetup = await recoverySetupPromise;
          if (recoverySetup) {
            if (cancelled) return;
            const recoveryProfile = await fetchCurrentProfile(recoverySetup.userId);
            const validRecoveryProfile =
              Boolean(recoveryProfile) &&
              recoveryProfile?.email.trim().toLowerCase() === recoverySetup.email;
            if (!validRecoveryProfile) {
              await client?.auth.signOut({ scope: "local" });
              throw new Error("Ссылка восстановления не связана с активным профилем.");
            }
            setRecoverySetupEmail(recoverySetup.email);
            setInviteSetupEmail("");
            commitAuthSession(null);
            setWorkspace("agent");
            setAccessRequests([]);
            return;
          }
          const inviteSetup =
            (await inviteSetupPromise) ??
            (client ? await getPendingSupabaseInvitePasswordSetup(client.auth) : null);
          if (inviteSetup) {
            if (cancelled) return;
            const inviteProfile = await fetchCurrentProfile(inviteSetup.userId);
            const validInviteProfile =
              inviteProfile?.role === "agent" &&
              inviteProfile.email.trim().toLowerCase() === inviteSetup.email;
            if (!validInviteProfile) {
              await client?.auth.signOut({ scope: "local" });
              throw new Error(
                "Приглашение не связано с подтверждённым профилем агента.",
              );
            }
            setInviteSetupEmail(inviteSetup.email);
            setRecoverySetupEmail("");
            commitAuthSession(null);
            setWorkspace("agent");
            setAccessRequests([]);
            return;
          }
          const appSession = await getCurrentAppSession();
          restored = appSession ? sessionFromSupabase(appSession) : null;
        } else if (__V19_LOCAL_DEMO_BUILD__ && localDemoEnabled) {
          const { authRepository } = await import("./shared/authRegistration");
          restored = await authRepository.restoreSession();
        } else {
          restored = null;
        }
        if (cancelled) return;
        commitAuthSession(restored);
        if (
          restored?.role === "admin" &&
          restored.status === "active" &&
          restored.approvalStatus === "approved"
        ) {
          setWorkspace("admin");
        } else {
          setWorkspace("agent");
        }
        await refreshAccessRequests(restored);
      } catch (error) {
        if (!cancelled) {
          setAuthError(
            error instanceof Error ? error.message : "Не удалось восстановить сессию.",
          );
        }
      } finally {
        if (!cancelled) setAuthChecked(true);
      }
    }

    void bootstrapLocalAuth();

    return () => {
      cancelled = true;
    };
  }, [
    inviteSetupPromise,
    recoverySetupPromise,
    commitAuthSession,
    localDemoEnabled,
    refreshAccessRequests,
    supabaseActivationBlocked,
    supabaseEnabled,
  ]);

  useEffect(() => {
    async function loadCanonicalSubmissions() {
      if (supabaseActivationBlocked) return;

      if (!supabaseEnabled) {
        if (!localDemoEnabled) return;
        if (!__V19_LOCAL_DEMO_BUILD__) return;
        const { loadSubmissions } = await import("./modules/submissions/persistence");
        const localSubmissions = loadSubmissions();
        setSubmissions(localSubmissions);
        setWorkspaceDataState({
          refreshedAt: new Date().toISOString(),
          status: workspaceDataStatusForCount(localSubmissions.length),
        });
        return;
      }

      if (!activeApprovedSession) return;
      await refreshCanonicalSubmissions();
    }

    void loadCanonicalSubmissions();
  }, [
    activeApprovedSession,
    localDemoEnabled,
    refreshCanonicalSubmissions,
    supabaseActivationBlocked,
    supabaseEnabled,
  ]);

  useEffect(() => {
    if (!supabaseEnabled || !activeApprovedSession) return;
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const refreshIfVisible = () => {
      if (!canRefreshVisibleWorkspace(document.visibilityState)) return;
      void refreshCanonicalSubmissions();
    };
    const onVisibilityChange = () => refreshIfVisible();
    const interval = window.setInterval(refreshIfVisible, workspaceRefreshIntervalMs);

    window.addEventListener("focus", refreshIfVisible);
    document.addEventListener("visibilitychange", onVisibilityChange);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshIfVisible);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [activeApprovedSession, refreshCanonicalSubmissions, supabaseEnabled]);

  const persistSubmissions = useCallback(
    async (nextSubmissions: Submission[]) => {
      const currentSubmissions = submissionsRef.current;
      const currentOwnerIds = ownerIdsBySubmissionIdRef.current;
      if (!supabaseEnabled) {
        if (!localDemoEnabled) return;
        submissionsRef.current = nextSubmissions;
        setSubmissions(nextSubmissions);
        if (!__V19_LOCAL_DEMO_BUILD__) return;
        const { saveSubmissions } = await import("./modules/submissions/persistence");
        saveSubmissions(nextSubmissions);
        return;
      }

      if (!activeApprovedSession || !activeProfile) {
        throw new Error("Активная Supabase-сессия не найдена. Войдите снова.");
      }

      const sessionToken: WorkspaceSessionToken = {
        generation: workspaceSessionGenerationRef.current,
        userId: activeApprovedSession.userId,
      };
      const isCurrentMutationSession = () =>
        isCurrentWorkspaceSession(
          sessionToken,
          workspaceSessionGenerationRef.current,
          workspaceSessionUserIdRef.current,
        );
      if (!isCurrentMutationSession()) {
        throw new Error(
          "Сессия изменилась. Обновите данные перед повторным действием.",
        );
      }

      const persistenceProfile =
        supabaseProfile?.id === activeProfile.id ? supabaseProfile : activeProfile;
      if (!persistenceProfile) {
        throw new Error(
          "Профиль Supabase ещё загружается. Повторите действие через несколько секунд.",
        );
      }

      const currentById = new Map(
        currentSubmissions.map((submission) => [submission.id, submission]),
      );
      const changedSubmissions = nextSubmissions.filter(
        (submission) => currentById.get(submission.id) !== submission,
      );
      if (!changedSubmissions.length) return;

      if (workspaceMutationStateRef.current.generation !== sessionToken.generation) {
        workspaceMutationStateRef.current = {
          count: 0,
          generation: sessionToken.generation,
        };
      }
      workspaceMutationStateRef.current.count += 1;
      workspaceRefreshRequestRef.current += 1;
      workspaceRefreshCoordinatorRef.current.invalidate();
      let mutationSucceeded = false;
      try {
        const nextOwnerIds = await saveCockpitSubmissionsForProfile(
          persistenceProfile,
          changedSubmissions,
          currentOwnerIds,
        );
        if (!isCurrentMutationSession()) return;

        workspaceRefreshRequestRef.current += 1;
        submissionsRef.current = nextSubmissions;
        setSubmissions(nextSubmissions);
        ownerIdsBySubmissionIdRef.current = nextOwnerIds;
        setOwnerIdsBySubmissionId(nextOwnerIds);
        setWorkspaceDataState({
          refreshedAt: new Date().toISOString(),
          sessionUserId: sessionToken.userId,
          status: workspaceDataStatusForCount(nextSubmissions.length),
        });
        mutationSucceeded = true;
      } catch (error) {
        if (isCurrentMutationSession()) {
          setWorkspaceDataState({
            error:
              error instanceof Error
                ? error.message
                : "Не удалось сохранить данные Supabase.",
            sessionUserId: sessionToken.userId,
            status: "error",
          });
        }
        throw error;
      } finally {
        if (workspaceMutationStateRef.current.generation === sessionToken.generation) {
          workspaceMutationStateRef.current.count = Math.max(
            0,
            workspaceMutationStateRef.current.count - 1,
          );
          if (
            mutationSucceeded &&
            workspaceMutationStateRef.current.count === 0 &&
            isCurrentMutationSession()
          ) {
            void refreshCanonicalSubmissions();
          }
        }
      }
    },
    [
      activeApprovedSession,
      activeProfile,
      localDemoEnabled,
      refreshCanonicalSubmissions,
      supabaseEnabled,
      supabaseProfile,
    ],
  );

  const persistVisibleAgentSubmissions = useCallback(
    async (nextVisibleSubmissions: Submission[]) => {
      const currentSubmissions = submissionsRef.current;
      const nextById = new Map(
        nextVisibleSubmissions.map((submission) => [submission.id, submission]),
      );
      const existingIds = new Set(
        currentSubmissions.map((submission) => submission.id),
      );
      const additions = nextVisibleSubmissions.filter(
        (submission) => !existingIds.has(submission.id),
      );
      await persistSubmissions([
        ...additions,
        ...currentSubmissions.map(
          (submission) => nextById.get(submission.id) ?? submission,
        ),
      ]);
    },
    [persistSubmissions],
  );

  const updateVisibleAgentSubmission = useCallback(
    (
      submissionId: string,
      update: (submission: Submission) => Submission,
    ): Promise<Submission> => {
      const session = activeApprovedSession;
      if (!session || session.role !== "agent") {
        return Promise.reject(
          new Error("Только активный агент может изменить свою подачу."),
        );
      }
      const ownerAgentId = session.ownerAgentId ?? session.userId;
      const queue = workspaceSubmissionMutationQueueRef.current;
      const previous = queue.get(submissionId) ?? Promise.resolve(undefined);
      const mutation = previous
        .catch(() => undefined)
        .then(async () => {
          const current = submissionsRef.current.find(
            (submission) => submission.id === submissionId,
          );
          if (!current || current.agentId !== ownerAgentId) {
            throw new Error("Подача недоступна текущему агенту.");
          }
          const nextSubmission = update(current);
          if (nextSubmission === current) return current;
          const nextSubmissions = submissionsRef.current.map((submission) =>
            submission.id === submissionId ? nextSubmission : submission,
          );
          await persistSubmissions(nextSubmissions);
          return (
            submissionsRef.current.find(
              (submission) => submission.id === submissionId,
            ) ?? nextSubmission
          );
        });
      const tracked = mutation.finally(() => {
        if (queue.get(submissionId) === tracked) queue.delete(submissionId);
      });
      queue.set(submissionId, tracked);
      return tracked;
    },
    [activeApprovedSession, persistSubmissions],
  );

  const handleLogin = useCallback(
    async (email: string, password: string) => {
      setAuthError("");
      let nextSession: Session;
      if (supabaseEnabled) {
        nextSession = sessionFromSupabase(
          await signInSupabaseWithPassword(email, password),
        );
      } else {
        if (!__V19_LOCAL_DEMO_BUILD__ || !localDemoEnabled) {
          throw new Error("Supabase production data source is unavailable.");
        }
        const { authRepository } = await import("./shared/authRegistration");
        nextSession = await authRepository.loginApprovedUser(email, password);
      }
      commitAuthSession(nextSession);
      setWorkspace(
        nextSession.role === "admin" &&
          nextSession.status === "active" &&
          nextSession.approvalStatus === "approved"
          ? "admin"
          : "agent",
      );
      await refreshAccessRequests(nextSession);
    },
    [commitAuthSession, localDemoEnabled, refreshAccessRequests, supabaseEnabled],
  );

  const handleRegister = useCallback(
    async (input: AccessRequestRegistrationInput) => {
      setAuthError("");
      if (supabaseEnabled) {
        const request =
          await supabaseAccessRequestRepository.submitAccessRequest(input);
        commitAuthSession(pendingSessionFromAccessRequest(request));
        setWorkspace("agent");
        setAccessRequests([]);
        return;
      }

      if (!__V19_LOCAL_DEMO_BUILD__ || !localDemoEnabled) {
        throw new Error("Supabase production data source is unavailable.");
      }
      const { authRepository } = await import("./shared/authRegistration");
      await authRepository.submitAccessRequest(input);
      const nextSession = await authRepository.restoreSession();
      commitAuthSession(nextSession);
      setWorkspace("agent");
      await refreshAccessRequests(nextSession);
    },
    [commitAuthSession, localDemoEnabled, refreshAccessRequests, supabaseEnabled],
  );

  const handleCompleteInvite = useCallback(
    async (password: string) => {
      const client = getSupabaseClient();
      if (!client) {
        throw new Error("Supabase is inactive.");
      }

      await completeSupabaseInvitePasswordSetup(client.auth, password);
      setInviteSetupEmail("");
      commitAuthSession(null);
      setWorkspace("agent");
      setAccessRequests([]);
    },
    [commitAuthSession],
  );

  const handleCompleteRecovery = useCallback(
    async (password: string) => {
      const client = getSupabaseClient();
      if (!client) throw new Error("Supabase is inactive.");
      await completeSupabasePasswordRecovery(client.auth, password);
      setRecoverySetupEmail("");
      commitAuthSession(null);
      setWorkspace("agent");
      setAccessRequests([]);
    },
    [commitAuthSession],
  );

  const handleResetPassword = useCallback(
    async (email: string) => {
      setAuthError("");
      if (!email.trim()) return "Введите email.";
      if (!supabaseEnabled) {
        return "В local/dev режиме восстановление не отправляет email. Нужен Supabase Auth или email provider.";
      }

      const result = await requestPasswordReset(email.trim().toLowerCase());
      return result.message;
    },
    [supabaseEnabled],
  );

  const handleSignOut = useCallback(async () => {
    const signedOutUserId = activeApprovedSession?.userId ?? null;
    invalidateWorkspaceSession(null);
    try {
      if (supabaseEnabled) {
        await signOutCurrentSession();
      } else {
        if (!__V19_LOCAL_DEMO_BUILD__ || !localDemoEnabled) return;
        const { authRepository } = await import("./shared/authRegistration");
        await authRepository.logout();
      }
    } catch (error) {
      invalidateWorkspaceSession(signedOutUserId);
      throw error;
    }
    setAuthSession(null);
    setWorkspace("agent");
    setAccessRequests([]);
    submissionsRef.current = [];
    ownerIdsBySubmissionIdRef.current = new Map();
    setSubmissions([]);
    setOwnerIdsBySubmissionId(new Map());
    setSupabaseProfile(null);
    setWorkspaceDataState({ status: "idle" });
  }, [
    activeApprovedSession?.userId,
    invalidateWorkspaceSession,
    localDemoEnabled,
    supabaseEnabled,
  ]);

  const handleApproveAccessRequest = useCallback(
    async (requestId: string) => {
      if (!activeApprovedSession || activeApprovedSession.role !== "admin") return;
      setAccessRequestsBusy(true);
      try {
        const repository = supabaseEnabled
          ? supabaseAccessRequestRepository
          : __V19_LOCAL_DEMO_BUILD__ && localDemoEnabled
            ? (await import("./shared/authRegistration")).accessRequestRepository
            : null;
        if (!repository)
          throw new Error("Supabase production data source is unavailable.");
        await repository.approveAccessRequest(requestId, activeApprovedSession.userId);
        await refreshAccessRequests(activeApprovedSession);
      } finally {
        setAccessRequestsBusy(false);
      }
    },
    [activeApprovedSession, localDemoEnabled, refreshAccessRequests, supabaseEnabled],
  );

  const handleRejectAccessRequest = useCallback(
    async (requestId: string) => {
      if (!activeApprovedSession || activeApprovedSession.role !== "admin") return;
      setAccessRequestsBusy(true);
      try {
        const repository = supabaseEnabled
          ? supabaseAccessRequestRepository
          : __V19_LOCAL_DEMO_BUILD__ && localDemoEnabled
            ? (await import("./shared/authRegistration")).accessRequestRepository
            : null;
        if (!repository)
          throw new Error("Supabase production data source is unavailable.");
        await repository.rejectAccessRequest(requestId, activeApprovedSession.userId);
        await refreshAccessRequests(activeApprovedSession);
      } finally {
        setAccessRequestsBusy(false);
      }
    },
    [activeApprovedSession, localDemoEnabled, refreshAccessRequests, supabaseEnabled],
  );

  const applySubmissionAction = useCallback(
    async (submissionId: string, action: SubmissionAction, source: Role) => {
      if (!activeApprovedSession || activeApprovedSession.role !== source) {
        const error = new Error("Действие недоступно для текущей Supabase-роли.");
        setWorkspaceDataState({
          error: error.message,
          sessionUserId: activeApprovedSession?.userId,
          status: "error",
        });
        throw error;
      }

      const result = applyActionToSubmissionListResult(
        submissionsRef.current,
        submissionId,
        action,
        source,
        activeApprovedSession.userId,
      );
      if (!result.ok) {
        const error = new Error(result.error.message);
        setWorkspaceDataState({
          error: error.message,
          sessionUserId: activeApprovedSession.userId,
          status: "error",
        });
        throw error;
      }
      await persistSubmissions(result.data);
    },
    [activeApprovedSession, persistSubmissions],
  );

  const updateAdminSubmission = useCallback(
    async (submissionId: string, update: (submission: Submission) => Submission) => {
      if (!activeApprovedSession || activeApprovedSession.role !== "admin") {
        const error = new Error("Только активный администратор может изменить подачу.");
        setWorkspaceDataState({
          error: error.message,
          sessionUserId: activeApprovedSession?.userId,
          status: "error",
        });
        throw error;
      }

      let changed = false;
      const nextSubmissions = submissionsRef.current.map((submission) => {
        if (submission.id !== submissionId) return submission;
        const nextSubmission = update(submission);
        changed ||= nextSubmission !== submission;
        return nextSubmission;
      });
      if (changed) await persistSubmissions(nextSubmissions);
    },
    [activeApprovedSession, persistSubmissions],
  );

  const appBridge = useMemo<VisaflowBusinessBridge>(
    () => ({
      ...bridge,
      onSubmissionAction: async ({ submissionId, action, source }) => {
        await applySubmissionAction(submissionId, action, source);
        await bridge.onSubmissionAction?.({ submissionId, action, source });
      },
      onAdminIssueAdd: async ({ submissionId, input }) => {
        if (!activeApprovedSession || activeApprovedSession.role !== "admin") {
          throw new Error("Только активный администратор может добавить замечание.");
        }
        await updateAdminSubmission(submissionId, (submission) =>
          addPreciseAdminIssue(submission, input, activeApprovedSession.userId),
        );
        await bridge.onAdminIssueAdd?.({ submissionId, input });
      },
      onAdminQuestionnaireFieldApprove: async ({
        submissionId,
        applicantId,
        sectionId,
        fieldId,
      }) => {
        if (!activeApprovedSession || activeApprovedSession.role !== "admin") {
          throw new Error("Только активный администратор может подтвердить поле анкеты.");
        }
        const approvedAtIso = new Date().toISOString();
        let approved = false;
        await updateAdminSubmission(submissionId, (submission) => {
          const next = approveQuestionnaireFieldForAdmin(
            submission,
            { applicantId, sectionId, fieldId },
            activeApprovedSession.userId,
            approvedAtIso,
          );
          approved = next !== submission;
          return next;
        });
        if (!approved) {
          throw new Error(
            "Поле нельзя подтвердить: заполните значение и закройте замечания.",
          );
        }
        await bridge.onAdminQuestionnaireFieldApprove?.({
          submissionId,
          applicantId,
          sectionId,
          fieldId,
        });
      },
      onAdminFileAccept: async ({ submissionId, applicantId, fileType }) => {
        if (activeApprovedSession?.role !== "admin") {
          throw new Error("Только активный администратор может подтвердить файл.");
        }

        let foundSubmission = false;
        await updateAdminSubmission(submissionId, (submission) => {
          foundSubmission = true;
          const applicantExists = submission.applicants.some(
            (applicant) => applicant.id === applicantId,
          );
          const file = submission.files.find(
            (candidate) =>
              candidate.applicantId === applicantId && candidate.type === fileType,
          );
          const isReviewableStatus =
            file?.status === "uploaded" || file?.status === "pending_review";

          if (
            !applicantExists ||
            !file ||
            !isReviewableStatus ||
            !isPersistablePrivateFileAssetAtSubmissionTarget(file, {
              applicantId,
              fileType,
              submissionId,
            })
          ) {
            throw new Error(
              "Нельзя подтвердить файл без защищённого оригинала выбранного заявителя.",
            );
          }

          return markSubmissionFileAccepted(submission, {
            applicantId,
            fileType,
            reviewedBy: activeApprovedSession.userId,
          });
        });
        if (!foundSubmission) {
          throw new Error("Подача для подтверждения файла не найдена.");
        }
        await bridge.onAdminFileAccept?.({ submissionId, applicantId, fileType });
      },
      onAdminAiReviewRun: async (submissionId) => {
        await updateAdminSubmission(submissionId, runAiReview);
        await bridge.onAdminAiReviewRun?.(submissionId);
      },
      onAdminAiSuggestionAccept: async ({ submissionId, suggestionId }) => {
        await updateAdminSubmission(submissionId, (submission) =>
          acceptAiSuggestionAsIssue(submission, suggestionId, "admin"),
        );
        await bridge.onAdminAiSuggestionAccept?.({ submissionId, suggestionId });
      },
      onAdminAiSuggestionDismiss: async ({ submissionId, suggestionId }) => {
        await updateAdminSubmission(submissionId, (submission) =>
          dismissAiSuggestion(submission, suggestionId, "admin"),
        );
        await bridge.onAdminAiSuggestionDismiss?.({ submissionId, suggestionId });
      },
      onExportPackages: async ({
        documentExport,
        packageIdentity,
        submissionIds,
      }) => {
        if (
          workspace !== "admin" ||
          activeApprovedSession?.role !== "admin" ||
          activeApprovedSession.status !== "active" ||
          activeApprovedSession.approvalStatus !== "approved"
        ) {
          throw new Error(
            "Only an approved admin session can complete export packages.",
          );
        }

        const currentSubmissions = submissionsRef.current;
        const requestedSubmissionIds = new Set(submissionIds);
        const selectedCurrent = currentSubmissions.filter((submission) =>
          requestedSubmissionIds.has(submission.id),
        );
        const currentPackageIdentity = buildExportPackageIdentity(selectedCurrent);
        const artifactStillMatchesCurrentSelection =
          requestedSubmissionIds.size === submissionIds.length &&
          selectedCurrent.length === submissionIds.length &&
          exportPackageIdentityMatches(packageIdentity, currentPackageIdentity) &&
          exportPackageDocumentCommitMatchesIdentity(
            documentExport,
            packageIdentity,
          );
        if (!artifactStillMatchesCurrentSelection) {
          throw new Error(
            "Export artifact is stale; regenerate Excel and ZIP before retrying.",
          );
        }

        const generatedSubmissions = applyExportStateToSelection(
          currentSubmissions,
          submissionIds,
          "file_generated",
        );
        const downloadedSubmissions = applyExportStateToSelection(
          generatedSubmissions,
          submissionIds,
          "file_downloaded",
        );
        if (downloadedSubmissions === generatedSubmissions) {
          throw new Error("Export download state was blocked by domain guards.");
        }

        const selectedDownloaded = downloadedSubmissions.filter((submission) =>
          requestedSubmissionIds.has(submission.id),
        );
        const downloadedIdentity = buildExportPackageIdentity(selectedDownloaded);
        const downloadedSelectionMatchesArtifact =
          selectedDownloaded.length === submissionIds.length &&
          exportPackageIdentityMatches(packageIdentity, downloadedIdentity) &&
          selectedDownloaded.every(
            (submission) =>
              submission.exportPackage &&
              exportPackageIdentityMatches(
                packageIdentity,
                submission.exportPackage,
              ),
          );
        if (!downloadedSelectionMatchesArtifact) {
          throw new Error(
            "Export artifact is stale; regenerate Excel and ZIP before retrying.",
          );
        }

        await persistSubmissions(downloadedSubmissions);
        const failWithRetryableExportState = async (
          failure: unknown,
        ): Promise<never> => {
          const retryableSubmissions = applyExportStateToSelection(
            downloadedSubmissions,
            submissionIds,
            "ready",
          );
          const failureMessage =
            failure instanceof Error
              ? failure.message
              : typeof failure === "string"
                ? failure
                : "Export package completion failed.";
          if (retryableSubmissions === downloadedSubmissions) {
            throw new Error(
              `${failureMessage} Export state could not be restored for retry.`,
            );
          }
          try {
            await persistSubmissions(retryableSubmissions);
          } catch {
            throw new Error(
              `${failureMessage} Export state rollback could not be persisted.`,
            );
          }
          throw new Error(failureMessage);
        };

        const completionOptions = {
          batchId: crypto.randomUUID(),
          createdAt: new Date().toISOString(),
          createdBy: activeApprovedSession.userId,
          documentExport,
          format: "xlsx" as const,
        };
        let completed: Awaited<ReturnType<typeof completeExportPackage>>;
        try {
          completed = await completeExportPackage(
            selectedDownloaded,
            completionOptions,
          );
        } catch (error) {
          const reconciliation = await reconcileExportPackageCompletion(
            selectedDownloaded,
            completionOptions,
            error,
          );
          if (reconciliation.status === "committed") {
            // A lost RPC response can still represent a committed transaction.
            // Converge from canonical Supabase state and never roll that commit back.
            try {
              await refreshCanonicalSubmissions();
            } catch {
              // Canonical refresh is follow-up only after durable commit proof.
            }
            try {
              await bridge.onExportPackages?.({
                documentExport,
                packageIdentity,
                submissionIds,
              });
            } catch {
              // External bridge/tracking is deliberately non-transactional.
            }
            return;
          }
          if (reconciliation.status === "not_committed") {
            return failWithRetryableExportState(error);
          }

          try {
            await refreshCanonicalSubmissions();
          } catch {
            // Preserve the uncertain outcome classification across refresh failures.
          }
          const failureMessage =
            error instanceof Error
              ? error.message
              : "Export package completion failed.";
          throw new ExportPackageCompletionUncertainError(
            `${failureMessage} Canonical export commit could not be confirmed; automatic rollback was skipped.`,
            { cause: error },
          );
        }
        if (completed.status === "blocked") {
          return failWithRetryableExportState(completed.blockers.join("; "));
        }

        // `complete_export_package` is the durable, atomic terminal transition.
        // Do not send the exported snapshot through the generic draft writer: that
        // endpoint correctly rejects terminal submissions and would surface a false
        // save error after a successful export. Converge the workspace from the
        // canonical Supabase state instead.
        try {
          await refreshCanonicalSubmissions();
        } catch {
          // A failed follow-up read must not undo a committed export package.
        }
        try {
          await bridge.onExportPackages?.({
            documentExport,
            packageIdentity,
            submissionIds,
          });
        } catch {
          // External bridge/tracking is deliberately non-transactional after persistence.
        }
      },
    }),
    [
      activeApprovedSession,
      applySubmissionAction,
      bridge,
      persistSubmissions,
      refreshCanonicalSubmissions,
      updateAdminSubmission,
      workspace,
    ],
  );

  if (!authChecked) {
    return (
      <div className="min-h-dvh bg-[#101011] text-white grid place-items-center">
        <span className="text-sm text-white/50">Загрузка доступа...</span>
      </div>
    );
  }

  if (supabaseActivationBlocked) {
    return (
      <div className="min-h-dvh bg-[#101011] text-white grid place-items-center px-6">
        <section
          aria-labelledby="production-runtime-blocked-title"
          className="max-w-xl rounded-[16px] border border-[#242529] bg-[#161617] p-6"
        >
          <p className="text-[12px] font-medium uppercase tracking-wide text-white/45">
            Production data source blocked
          </p>
          <h1
            className="mt-2 text-[22px] font-semibold text-white"
            id="production-runtime-blocked-title"
          >
            Supabase не активирован
          </h1>
          <p className="mt-3 text-[14px] leading-6 text-white/62">
            Для выбранного Supabase target локальные демо-данные отключены. Приложение
            остановлено fail-closed, чтобы не загрузить seed/mock данные вместо
            production source.
          </p>
          <p className="mt-4 text-[12px] leading-5 text-white/45">
            {workspaceDataState.error || supabaseRuntimeConfig.activation.boundary}
          </p>
        </section>
      </div>
    );
  }

  if (!activeApprovedSession) {
    return (
      <AccessGate
        error={authError}
        inviteSetupEmail={inviteSetupEmail}
        recoverySetupEmail={recoverySetupEmail}
        pendingSession={authSession}
        usesSupabase={supabaseEnabled}
        onCompleteInvite={handleCompleteInvite}
        onCompleteRecovery={handleCompleteRecovery}
        onLogin={handleLogin}
        onRegister={handleRegister}
        onResetPassword={handleResetPassword}
        onSignOut={handleSignOut}
      />
    );
  }

  const initialWorkspaceGate = supabaseEnabled
    ? workspaceInitialGate(
        workspaceDataState.status,
        workspaceDataState.sessionUserId,
        activeApprovedSession.userId,
        supabaseProfile?.id === activeApprovedSession.userId,
      )
    : "workspace";

  if (initialWorkspaceGate === "loading") {
    return (
      <div
        aria-busy="true"
        aria-live="polite"
        className="min-h-dvh bg-[#101011] text-white grid place-items-center"
        role="status"
      >
        <span className="text-sm text-white/50">Загрузка данных Supabase...</span>
      </div>
    );
  }

  if (initialWorkspaceGate === "error") {
    return (
      <div className="min-h-dvh bg-[#101011] text-white grid place-items-center px-6">
        <section
          aria-labelledby="workspace-load-error-title"
          className="max-w-xl rounded-[16px] border border-[#7f3d45] bg-[#211416] p-6"
          role="alert"
        >
          <h1 className="text-[20px] font-semibold" id="workspace-load-error-title">
            Не удалось загрузить данные Supabase
          </h1>
          <p className="mt-3 text-[13px] leading-5 text-white/70">
            {workspaceDataState.error ?? "Повторите загрузку рабочей области."}
          </p>
          <button
            className="mt-5 h-10 rounded-[10px] border border-[#7f3d45] px-4 text-[12px] font-semibold"
            type="button"
            onClick={() => void refreshCanonicalSubmissions()}
          >
            Повторить
          </button>
        </section>
      </div>
    );
  }

  return (
    <Suspense
      fallback={
        <div
          aria-busy="true"
          aria-live="polite"
          className="min-h-dvh bg-[#101011] text-white grid place-items-center"
          role="status"
        >
          <span className="text-sm text-white/50">Загрузка рабочей области...</span>
        </div>
      }
    >
      <WorkspaceSurface
        adminWorkspaceProps={{
          accessRequests,
          accessRequestsBusy,
          currentEmail: activeApprovedSession.email,
          currentDisplayName: activeApprovedSession.fullName,
          onApproveAccessRequest: handleApproveAccessRequest,
          onRejectAccessRequest: handleRejectAccessRequest,
          onSignOut: handleSignOut,
          submissions,
          usesSupabase: supabaseEnabled,
        }}
        agentWorkspaceProps={{
          agentId: activeApprovedSession.ownerAgentId ?? activeApprovedSession.userId,
          onSubmissionUpdate: updateVisibleAgentSubmission,
          onSubmissionsChange: persistVisibleAgentSubmissions,
          submissions: visibleSubmissions,
          usesSupabase: supabaseEnabled,
          onSignOut: handleSignOut,
        }}
        bridge={appBridge}
        onRetryWorkspace={refreshCanonicalSubmissions}
        workspace={workspace}
        workspaceDataState={workspaceDataState}
      />
    </Suspense>
  );
}
