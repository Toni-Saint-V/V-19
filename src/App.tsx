import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { LoaderCircle, RefreshCw, ShieldAlert, TriangleAlert } from "lucide-react";
import { AccessGate } from "./components/AccessGate";
import {
  noopVisaflowBusinessBridge,
  type VisaflowBusinessBridge,
} from "./integration/visaflowBusinessBridge";
import {
  addPreciseAdminIssue,
  approvePassportReviewSectionForAdmin,
  applyExportStateToSelection,
  applyActionToSubmissionListResult,
} from "./modules/submissions/submissionActions";
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
  buildExportArchiveInputSignature,
  buildExportPackageIdentity,
  exportPackageIdentityMatches,
} from "./modules/submissions/exportRules";
import { exportPackageDocumentCommitMatchesIdentity } from "./modules/submissions/exportPackageDocumentCommit";
import {
  archiveAgentSubmissionCard,
  ensureSubmissionPublicNumber,
  isAgentSubmissionCardArchiveConflict,
  isAdminSubmissionConcurrencyConflict,
  loadCockpitSubmissionsForProfile,
  saveAdminCockpitSubmissionsIfCurrent,
  saveCockpitSubmissionsForProfile,
  type PublicNumberAssignment,
} from "./modules/submissions/supabasePersistence";
import { agentSubmissionCardArchiveDecision } from "./modules/submissions/agentSubmissionCardArchive";
import {
  PostCommitBridgePolicy,
  type VisaflowPostCommitEvent,
  type VisaflowPostCommitObserver,
} from "./integration/postCommitBridgePolicy";
import {
  submissionPublicNumber,
  submissionPublicNumberMax,
} from "./modules/submissions/submissionIdentity";
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
  waitForWorkspaceMutationQueueDrain,
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

type AppBusinessBridge = VisaflowBusinessBridge & {
  /** Idempotent observer; retries reuse the same eventId. */
  onPostCommitEvent?: VisaflowPostCommitObserver;
};

type WorkspaceDataState = {
  error?: string;
  refreshedAt?: string;
  sessionUserId?: string;
  status: WorkspaceDataStatus;
};

type WorkspaceMutationFence = {
  assertCurrent: () => void;
  isCurrent: () => boolean;
  token: WorkspaceSessionToken;
};

class WorkspaceSessionChangedError extends Error {
  readonly code = "WORKSPACE_SESSION_CHANGED";

  constructor() {
    super("Сессия изменилась. Данные будут загружены заново; повторите действие.");
    this.name = "WorkspaceSessionChangedError";
  }
}

function isWorkspaceSessionChangedError(
  error: unknown,
): error is WorkspaceSessionChangedError {
  return error instanceof WorkspaceSessionChangedError;
}

type AppRuntimeStateProps = {
  actionLabel?: string;
  description: string;
  detail?: string;
  eyebrow: string;
  id: string;
  onAction?: () => void;
  statusText?: string;
  title: string;
  tone: "blocked" | "error" | "loading";
};

function AppRuntimeState({
  actionLabel,
  description,
  detail,
  eyebrow,
  id,
  onAction,
  statusText,
  title,
  tone,
}: AppRuntimeStateProps) {
  const isLoading = tone === "loading";
  const StateIcon = isLoading
    ? LoaderCircle
    : tone === "blocked"
      ? ShieldAlert
      : TriangleAlert;

  return (
    <div
      aria-busy={isLoading || undefined}
      aria-labelledby={id}
      aria-live={isLoading ? "polite" : "assertive"}
      className={`v19-app-runtime-state is-${tone}`}
      data-testid="app-runtime-state"
      role={isLoading ? "status" : "alert"}
    >
      <section className="v19-app-runtime-card">
        <div className="v19-app-runtime-brand">
          <span aria-hidden="true" className="v19-app-runtime-brand-mark">
            V
          </span>
          <span>VisaFlow V-19</span>
        </div>
        <span aria-hidden="true" className="v19-app-runtime-icon">
          <StateIcon />
        </span>
        <p className="v19-app-runtime-eyebrow">{eyebrow}</p>
        <h1 id={id}>{title}</h1>
        <p className="v19-app-runtime-copy">{description}</p>
        {detail ? <p className="v19-app-runtime-detail">{detail}</p> : null}
        {isLoading && statusText ? (
          <div className="v19-app-runtime-progress">
            <span aria-hidden="true" />
            <strong>{statusText}</strong>
          </div>
        ) : null}
        {actionLabel && onAction ? (
          <button type="button" onClick={onAction}>
            <RefreshCw aria-hidden="true" />
            <span>{actionLabel}</span>
          </button>
        ) : null}
      </section>
    </div>
  );
}

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
  bridge?: AppBusinessBridge;
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
  const [signOutPending, setSignOutPending] = useState(false);
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
  const caseRevisionsBySubmissionIdRef = useRef<Map<string, number>>(new Map());
  const quarantinedSubmissionIdsRef = useRef<Set<string>>(new Set());
  const ownerIdsBySubmissionIdRef = useRef(ownerIdsBySubmissionId);
  const postCommitBridgePolicyRef = useRef(new PostCommitBridgePolicy());
  const workspaceRefreshRequestRef = useRef(0);
  const workspaceRefreshCoordinatorRef = useRef(new WorkspaceRefreshCoordinator());
  const signOutPendingRef = useRef(false);
  const workspaceSessionGenerationRef = useRef(0);
  const workspaceSessionUserIdRef = useRef<string | null>(null);
  const workspaceSessionNeedsQueueDrainRef = useRef(false);
  const workspaceMutationStateRef = useRef({ count: 0, generation: 0 });
  const workspaceSubmissionMutationQueueRef = useRef<Promise<unknown>>(
    Promise.resolve(),
  );
  const refreshCanonicalSubmissionsRef = useRef<() => Promise<void>>(
    async () => undefined,
  );
  const publicNumberAssignmentQueueRef = useRef<Promise<void>>(Promise.resolve());
  const activeApprovedSession =
    authSession?.status === "active" && authSession.approvalStatus === "approved"
      ? authSession
      : null;

  const invalidateWorkspaceSession = useCallback((nextUserId: string | null) => {
    workspaceSessionGenerationRef.current += 1;
    workspaceSessionUserIdRef.current = nextUserId;
    workspaceRefreshRequestRef.current += 1;
    workspaceRefreshCoordinatorRef.current.invalidate();
    workspaceSessionNeedsQueueDrainRef.current = true;
    workspaceMutationStateRef.current = {
      count: 0,
      generation: workspaceSessionGenerationRef.current,
    };
    caseRevisionsBySubmissionIdRef.current = new Map();
    quarantinedSubmissionIdsRef.current = new Set();
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
    caseRevisionsBySubmissionIdRef.current = new Map();
    quarantinedSubmissionIdsRef.current = new Set();
    ownerIdsBySubmissionIdRef.current = new Map();
    setSubmissions([]);
    setOwnerIdsBySubmissionId(new Map());
    setAccessRequestsBusy(false);
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
      return nextAccessRequests;
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

  const createWorkspaceMutationFence = useCallback(
    (sessionUserId: string): WorkspaceMutationFence => {
      const token: WorkspaceSessionToken = {
        generation: workspaceSessionGenerationRef.current,
        userId: sessionUserId,
      };
      const isCurrent = () =>
        isCurrentWorkspaceSession(
          token,
          workspaceSessionGenerationRef.current,
          workspaceSessionUserIdRef.current,
        );
      return {
        assertCurrent: () => {
          if (!isCurrent()) throw new WorkspaceSessionChangedError();
        },
        isCurrent,
        token,
      };
    },
    [],
  );

  const runCanonicalSubmissionsRefresh = useCallback(
    async (throwOnFailure = false) => {
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

    if (workspaceSessionNeedsQueueDrainRef.current) {
      const pendingMutations = workspaceSubmissionMutationQueueRef.current;
      const queueDrain = await waitForWorkspaceMutationQueueDrain(pendingMutations);
      if (
        !isCurrentWorkspaceSession(
          sessionToken,
          workspaceSessionGenerationRef.current,
          workspaceSessionUserIdRef.current,
        )
      ) {
        return;
      }
      workspaceSessionNeedsQueueDrainRef.current = false;
      if (queueDrain === "timed_out") {
        // A never-settling mutation from the previous session must not remain
        // the parent promise for every mutation in the newly loaded session.
        // Its own fence still prevents a late continuation from committing.
        workspaceSubmissionMutationQueueRef.current = Promise.resolve();
        void pendingMutations.then(
          () => {
            if (
              isCurrentWorkspaceSession(
                sessionToken,
                workspaceSessionGenerationRef.current,
                workspaceSessionUserIdRef.current,
              )
            ) {
              void refreshCanonicalSubmissionsRef.current();
            }
          },
          () => {
            if (
              isCurrentWorkspaceSession(
                sessionToken,
                workspaceSessionGenerationRef.current,
                workspaceSessionUserIdRef.current,
              )
            ) {
              void refreshCanonicalSubmissionsRef.current();
            }
          },
        );
      }
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
      caseRevisionsBySubmissionIdRef.current =
        loaded.caseRevisionsBySubmissionId ?? new Map();
      quarantinedSubmissionIdsRef.current =
        loaded.quarantinedSubmissionIds ?? new Set();
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
      if (throwOnFailure) throw error;
    }
    },
    [activeApprovedSession, activeProfile, loadAccessRequests, supabaseEnabled],
  );

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
    refreshCanonicalSubmissionsRef.current = refreshCanonicalSubmissions;
  }, [refreshCanonicalSubmissions]);

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
    async (
      nextSubmissions: Submission[],
      providedFence?: WorkspaceMutationFence,
      expectedCaseRevisions?: ReadonlyMap<string, number>,
    ) => {
      const currentSubmissions = submissionsRef.current;
      const currentOwnerIds = ownerIdsBySubmissionIdRef.current;
      const currentCaseRevisions =
        expectedCaseRevisions ?? caseRevisionsBySubmissionIdRef.current;
      const mutationFence =
        providedFence ??
        (activeApprovedSession
          ? createWorkspaceMutationFence(activeApprovedSession.userId)
          : null);
      mutationFence?.assertCurrent();
      if (!supabaseEnabled) {
        if (!localDemoEnabled) return undefined;
        if (__V19_LOCAL_DEMO_BUILD__) {
          const { saveSubmissions } = await import("./modules/submissions/persistence");
          mutationFence?.assertCurrent();
          const saveResult = saveSubmissions(nextSubmissions);
          if (!saveResult.ok) throw new Error(saveResult.message);
        } else {
          mutationFence?.assertCurrent();
        }
        submissionsRef.current = nextSubmissions;
        setSubmissions(nextSubmissions);
        return undefined;
      }

      if (!activeApprovedSession || !activeProfile) {
        throw new Error("Активная Supabase-сессия не найдена. Войдите снова.");
      }

      const fence =
        mutationFence ?? createWorkspaceMutationFence(activeApprovedSession.userId);
      const { token: sessionToken } = fence;
      fence.assertCurrent();

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
      if (!changedSubmissions.length) return undefined;
      const quarantinedSubmission = changedSubmissions.find((submission) =>
        quarantinedSubmissionIdsRef.current.has(submission.id),
      );
      if (quarantinedSubmission) {
        throw new Error(
          `Подача ${quarantinedSubmission.id} доступна только для чтения: cockpit snapshot повреждён и требует отдельного восстановления.`,
        );
      }

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
      let refreshAfterMutation = false;
      try {
        const saveResult =
          persistenceProfile.role === "admin"
            ? await saveAdminCockpitSubmissionsIfCurrent(
                persistenceProfile,
                changedSubmissions,
                currentOwnerIds,
                currentCaseRevisions,
              )
            : await saveCockpitSubmissionsForProfile(
              persistenceProfile,
              changedSubmissions,
              currentOwnerIds,
              currentCaseRevisions,
            );
        const nextOwnerIds = saveResult.ownerIdsBySubmissionId;
        fence.assertCurrent();

        workspaceRefreshRequestRef.current += 1;
        submissionsRef.current = nextSubmissions;
        setSubmissions(nextSubmissions);
        caseRevisionsBySubmissionIdRef.current =
          saveResult.caseRevisionsBySubmissionId;
        ownerIdsBySubmissionIdRef.current = nextOwnerIds;
        setOwnerIdsBySubmissionId(nextOwnerIds);
        setWorkspaceDataState({
          refreshedAt: new Date().toISOString(),
          sessionUserId: sessionToken.userId,
          status: workspaceDataStatusForCount(nextSubmissions.length),
        });
        mutationSucceeded = true;
        return saveResult.caseRevisionsBySubmissionId;
      } catch (error) {
        refreshAfterMutation = isAdminSubmissionConcurrencyConflict(error);
        if (fence.isCurrent() && !isWorkspaceSessionChangedError(error)) {
          const errorMessage = refreshAfterMutation
            ? "Подача изменилась в другой сессии. Загружена актуальная версия; повторите действие."
            : error instanceof Error
              ? error.message
              : "Не удалось сохранить данные Supabase.";
          setWorkspaceDataState({
            error: errorMessage,
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
            (mutationSucceeded || refreshAfterMutation) &&
            workspaceMutationStateRef.current.count === 0 &&
            fence.isCurrent()
          ) {
            void refreshCanonicalSubmissions();
          }
        }
      }
    },
    [
      activeApprovedSession,
      activeProfile,
      createWorkspaceMutationFence,
      localDemoEnabled,
      refreshCanonicalSubmissions,
      supabaseEnabled,
      supabaseProfile,
    ],
  );

  const enqueueWorkspaceSubmissionMutation = useCallback(
    <Result,>(
      sessionUserId: string,
      mutation: (fence: WorkspaceMutationFence) => Result | Promise<Result>,
    ): Promise<Result> => {
      const fence = createWorkspaceMutationFence(sessionUserId);
      const queuedMutation = workspaceSubmissionMutationQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          fence.assertCurrent();
          const result = await mutation(fence);
          fence.assertCurrent();
          return result;
        });
      workspaceSubmissionMutationQueueRef.current = queuedMutation.then(
        () => undefined,
        () => undefined,
      );
      return queuedMutation;
    },
    [createWorkspaceMutationFence],
  );

  const persistVisibleAgentSubmissions = useCallback(
    async (nextVisibleSubmissions: Submission[]) => {
      const session = activeApprovedSession;
      if (!session || session.role !== "agent") {
        throw new Error("Только активный агент может изменить свои подачи.");
      }
      await enqueueWorkspaceSubmissionMutation(session.userId, async (fence) => {
        const ownerAgentId = session.ownerAgentId ?? session.userId;
        const currentSubmissions = submissionsRef.current;
        for (const submission of nextVisibleSubmissions) {
          if (submission.agentId !== ownerAgentId) {
            throw new Error("Нельзя сохранить подачу от имени другого агента.");
          }
          const existing = currentSubmissions.find(
            (candidate) => candidate.id === submission.id,
          );
          if (existing && existing.agentId !== ownerAgentId) {
            throw new Error("Номер подачи уже принадлежит другому агенту.");
          }
        }
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
        ], fence);
      });
    },
    [activeApprovedSession, enqueueWorkspaceSubmissionMutation, persistSubmissions],
  );

  const deleteVisibleAgentSubmission = useCallback(
    (submissionId: string): Promise<void> => {
      const session = activeApprovedSession;
      if (!session || session.role !== "agent") {
        return Promise.reject(
          new Error("Только активный агент может удалить свою карточку подачи."),
        );
      }

      return enqueueWorkspaceSubmissionMutation(session.userId, async (fence) => {
        const ownerAgentId = session.ownerAgentId ?? session.userId;
        const currentSubmission = submissionsRef.current.find(
          (submission) => submission.id === submissionId,
        );
        if (!currentSubmission || currentSubmission.agentId !== ownerAgentId) {
          throw new Error("Подача недоступна текущему агенту.");
        }
        const archiveDecision =
          agentSubmissionCardArchiveDecision(currentSubmission);
        if (!archiveDecision.ok) {
          throw new Error(archiveDecision.reason);
        }
        if (quarantinedSubmissionIdsRef.current.has(submissionId)) {
          throw new Error(
            "Карточка доступна только для чтения: данные требуют восстановления.",
          );
        }

        if (!supabaseEnabled) {
          if (!localDemoEnabled) {
            throw new Error("Supabase недоступен для удаления карточки подачи.");
          }
          const nextSubmissions = submissionsRef.current.filter(
            (submission) => submission.id !== submissionId,
          );
          if (__V19_LOCAL_DEMO_BUILD__) {
            const { saveSubmissions } = await import(
              "./modules/submissions/persistence"
            );
            fence.assertCurrent();
            const saveResult = saveSubmissions(nextSubmissions);
            if (!saveResult.ok) throw new Error(saveResult.message);
          }
          fence.assertCurrent();
          submissionsRef.current = nextSubmissions;
          setSubmissions(nextSubmissions);
          return;
        }

        if (!activeProfile || activeProfile.role !== "agent") {
          throw new Error("Профиль Supabase ещё загружается. Повторите действие.");
        }
        const expectedCaseRevision =
          caseRevisionsBySubmissionIdRef.current.get(submissionId);
        if (expectedCaseRevision === undefined) {
          throw new Error(
            "Не удалось подтвердить актуальность подачи. Обновите страницу и повторите действие.",
          );
        }

        const persistenceProfile =
          supabaseProfile?.id === activeProfile.id ? supabaseProfile : activeProfile;
        if (workspaceMutationStateRef.current.generation !== fence.token.generation) {
          workspaceMutationStateRef.current = {
            count: 0,
            generation: fence.token.generation,
          };
        }
        workspaceMutationStateRef.current.count += 1;
        workspaceRefreshRequestRef.current += 1;
        workspaceRefreshCoordinatorRef.current.invalidate();

        try {
          const archived = await archiveAgentSubmissionCard(
            submissionId,
            expectedCaseRevision,
          );
          fence.assertCurrent();
          if (archived.submissionId !== submissionId) {
            throw new Error(
              "Supabase подтвердил удаление другой карточки. Обновите страницу.",
            );
          }

          const loaded =
            await loadCockpitSubmissionsForProfile(persistenceProfile);
          fence.assertCurrent();
          if (
            loaded.submissions.some(
              (submission) => submission.id === submissionId,
            )
          ) {
            throw new Error(
              "Supabase не подтвердил удаление карточки после повторной загрузки.",
            );
          }

          submissionsRef.current = loaded.submissions;
          caseRevisionsBySubmissionIdRef.current =
            loaded.caseRevisionsBySubmissionId;
          quarantinedSubmissionIdsRef.current =
            loaded.quarantinedSubmissionIds;
          ownerIdsBySubmissionIdRef.current = loaded.ownerIdsBySubmissionId;
          setOwnerIdsBySubmissionId(loaded.ownerIdsBySubmissionId);
          setSubmissions(loaded.submissions);
          setWorkspaceDataState({
            refreshedAt: new Date().toISOString(),
            sessionUserId: fence.token.userId,
            status: workspaceDataStatusForCount(loaded.submissions.length),
          });
        } catch (error) {
          if (fence.isCurrent() && !isWorkspaceSessionChangedError(error)) {
            const message = isAgentSubmissionCardArchiveConflict(error)
              ? "Подача изменилась в другой сессии. Обновите список и повторите удаление."
              : error instanceof Error
                ? error.message
                : "Не удалось удалить карточку подачи.";
            setWorkspaceDataState({
              error: message,
              sessionUserId: fence.token.userId,
              status: "error",
            });
          }
          throw error;
        } finally {
          if (
            workspaceMutationStateRef.current.generation ===
            fence.token.generation
          ) {
            workspaceMutationStateRef.current.count = Math.max(
              0,
              workspaceMutationStateRef.current.count - 1,
            );
          }
        }
      });
    },
    [
      activeApprovedSession,
      activeProfile,
      enqueueWorkspaceSubmissionMutation,
      localDemoEnabled,
      supabaseEnabled,
      supabaseProfile,
    ],
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
      return enqueueWorkspaceSubmissionMutation(session.userId, async (fence) => {
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
        await persistSubmissions(nextSubmissions, fence);
        return (
          submissionsRef.current.find(
            (submission) => submission.id === submissionId,
          ) ?? nextSubmission
        );
      });
    },
    [
      activeApprovedSession,
      enqueueWorkspaceSubmissionMutation,
      persistSubmissions,
    ],
  );

  const assignVisibleAgentSubmissionPublicNumber = useCallback(
    (submissionId: string): Promise<PublicNumberAssignment> => {
      const session = activeApprovedSession;
      if (!session || session.role !== "agent") {
        return Promise.reject(
          new Error("Только активный агент может присвоить номер подаче."),
        );
      }
      const fence = createWorkspaceMutationFence(session.userId);
      let resolveAssignment!: (assignment: PublicNumberAssignment) => void;
      let rejectAssignment!: (error: unknown) => void;
      const result = new Promise<PublicNumberAssignment>((resolve, reject) => {
        resolveAssignment = resolve;
        rejectAssignment = reject;
      });
      const task = publicNumberAssignmentQueueRef.current
        .catch(() => undefined)
        .then(async () => {
          fence.assertCurrent();
          const current = submissionsRef.current.find(
            (submission) => submission.id === submissionId,
          );
          if (!current) throw new Error("Подача больше не доступна.");
          const existingNumber = submissionPublicNumber(current);
          if (existingNumber !== null) {
            resolveAssignment({
              assignedNow: false,
              caseRevision:
                caseRevisionsBySubmissionIdRef.current.get(submissionId) ?? null,
              publicNumber: existingNumber,
            });
            return;
          }

          const assignment = supabaseEnabled
            ? await ensureSubmissionPublicNumber(submissionId)
            : {
                assignedNow: true,
                caseRevision: null,
                publicNumber:
                  Math.max(
                    1000,
                    ...submissionsRef.current.map(
                      (submission) => submissionPublicNumber(submission) ?? 0,
                    ),
                  ) + 1,
              };
          fence.assertCurrent();
          if (assignment.publicNumber > submissionPublicNumberMax) {
            throw new Error("Лимит номеров подач исчерпан.");
          }
          if (supabaseEnabled && assignment.caseRevision !== null) {
            caseRevisionsBySubmissionIdRef.current = new Map(
              caseRevisionsBySubmissionIdRef.current,
            ).set(submissionId, assignment.caseRevision);
          }

          const nextSubmissions = submissionsRef.current.map((submission) =>
            submission.id === submissionId
              ? { ...submission, publicNumber: assignment.publicNumber }
              : submission,
          );
          if (supabaseEnabled) {
            submissionsRef.current = nextSubmissions;
            setSubmissions(nextSubmissions);
            void refreshCanonicalSubmissions();
          } else {
            await persistSubmissions(nextSubmissions, fence);
          }
          fence.assertCurrent();
          resolveAssignment({
            assignedNow: assignment.assignedNow,
            caseRevision: assignment.caseRevision,
            publicNumber: assignment.publicNumber,
          });
        })
        .catch((error) => {
          rejectAssignment(error);
        });
      publicNumberAssignmentQueueRef.current = task;
      return result;
    },
    [
      activeApprovedSession,
      createWorkspaceMutationFence,
      persistSubmissions,
      refreshCanonicalSubmissions,
      supabaseEnabled,
    ],
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
    if (signOutPendingRef.current) return;
    signOutPendingRef.current = true;
    const signedOutUserId = activeApprovedSession?.userId ?? null;
    let signOutWarning = "";
    setSignOutPending(true);
    setWorkspaceDataState((current) => ({ ...current, error: undefined }));
    invalidateWorkspaceSession(null);
    setSupabaseProfile(null);
    setWorkspaceDataState({
      sessionUserId: signedOutUserId ?? undefined,
      status: "loading",
    });
    try {
      if (supabaseEnabled) {
        const result: unknown = await signOutCurrentSession();
        if (
          typeof result === "object" &&
          result !== null &&
          "status" in result &&
          result.status === "local_session_cleared" &&
          "warning" in result &&
          typeof result.warning === "string"
        ) {
          signOutWarning = result.warning;
        }
      } else {
        if (!__V19_LOCAL_DEMO_BUILD__ || !localDemoEnabled) {
          return;
        }
        const { authRepository } = await import("./shared/authRegistration");
        await authRepository.logout();
      }
      setAuthSession(null);
      setWorkspace("agent");
      setAccessRequests([]);
      submissionsRef.current = [];
      caseRevisionsBySubmissionIdRef.current = new Map();
      quarantinedSubmissionIdsRef.current = new Set();
      ownerIdsBySubmissionIdRef.current = new Map();
      setSubmissions([]);
      setOwnerIdsBySubmissionId(new Map());
      setSupabaseProfile(null);
      setWorkspaceDataState({ status: "idle" });
      setAuthError(signOutWarning);
    } catch (error) {
      invalidateWorkspaceSession(signedOutUserId);
      if (supabaseEnabled && signedOutUserId) {
        try {
          await runCanonicalSubmissionsRefresh(true);
        } catch {
          // Keep the last known canonical snapshot available for a retry-safe
          // workspace recovery even when the recovery read also fails.
        }
      }
      setSupabaseProfile(activeProfile);
      setWorkspaceDataState((current) => ({
        ...current,
        error: "Не удалось выйти из аккаунта. Повторите попытку.",
        sessionUserId: signedOutUserId ?? undefined,
        status: "error",
      }));
      throw error;
    } finally {
      signOutPendingRef.current = false;
      setSignOutPending(false);
    }
  }, [
    activeApprovedSession?.userId,
    activeProfile,
    invalidateWorkspaceSession,
    localDemoEnabled,
    runCanonicalSubmissionsRefresh,
    supabaseEnabled,
  ]);

  const handleApproveAccessRequest = useCallback(
    async (requestId: string) => {
      const session = activeApprovedSession;
      if (!session || session.role !== "admin") return;
      const fence = createWorkspaceMutationFence(session.userId);
      setAccessRequestsBusy(true);
      try {
        const repository = supabaseEnabled
          ? supabaseAccessRequestRepository
          : __V19_LOCAL_DEMO_BUILD__ && localDemoEnabled
            ? (await import("./shared/authRegistration")).accessRequestRepository
            : null;
        if (!repository)
          throw new Error("Supabase production data source is unavailable.");
        await repository.approveAccessRequest(requestId, session.userId);
        fence.assertCurrent();
        await refreshAccessRequests(session);
        fence.assertCurrent();
      } catch (error) {
        if (fence.isCurrent()) {
          try {
            const canonicalRequests = await refreshAccessRequests(session);
            fence.assertCurrent();
            if (
              canonicalRequests?.some(
                (request) => request.id === requestId && request.status === "approved",
              )
            ) {
              return;
            }
          } catch {
            // The action remains retry-safe. Keep the original decision error
            // for the active screen while preserving the last known queue.
          }
        }
        throw error;
      } finally {
        if (fence.isCurrent()) setAccessRequestsBusy(false);
      }
    },
    [
      activeApprovedSession,
      createWorkspaceMutationFence,
      localDemoEnabled,
      refreshAccessRequests,
      supabaseEnabled,
    ],
  );

  const handleRejectAccessRequest = useCallback(
    async (requestId: string) => {
      const session = activeApprovedSession;
      if (!session || session.role !== "admin") return;
      const fence = createWorkspaceMutationFence(session.userId);
      setAccessRequestsBusy(true);
      try {
        const repository = supabaseEnabled
          ? supabaseAccessRequestRepository
          : __V19_LOCAL_DEMO_BUILD__ && localDemoEnabled
            ? (await import("./shared/authRegistration")).accessRequestRepository
            : null;
        if (!repository)
          throw new Error("Supabase production data source is unavailable.");
        await repository.rejectAccessRequest(requestId, session.userId);
        fence.assertCurrent();
        await refreshAccessRequests(session);
        fence.assertCurrent();
      } catch (error) {
        if (fence.isCurrent()) {
          try {
            const canonicalRequests = await refreshAccessRequests(session);
            fence.assertCurrent();
            if (
              canonicalRequests?.some(
                (request) => request.id === requestId && request.status === "rejected",
              )
            ) {
              return;
            }
          } catch {
            // Preserve the decision failure; retry uses the idempotent claim.
          }
        }
        throw error;
      } finally {
        if (fence.isCurrent()) setAccessRequestsBusy(false);
      }
    },
    [
      activeApprovedSession,
      createWorkspaceMutationFence,
      localDemoEnabled,
      refreshAccessRequests,
      supabaseEnabled,
    ],
  );

  const applySubmissionAction = useCallback(
    async (submissionId: string, action: SubmissionAction, source: Role) => {
      const session = activeApprovedSession;
      if (!session || session.role !== source) {
        const error = new Error("Действие недоступно для текущей Supabase-роли.");
        setWorkspaceDataState({
          error: error.message,
          sessionUserId: session?.userId,
          status: "error",
        });
        throw error;
      }

      try {
        await enqueueWorkspaceSubmissionMutation(session.userId, async (fence) => {
          const result = applyActionToSubmissionListResult(
            submissionsRef.current,
            submissionId,
            action,
            source,
            session.userId,
          );
          if (!result.ok) throw new Error(result.error.message);
          await persistSubmissions(result.data, fence);
        });
      } catch (caught) {
        const error =
          caught instanceof Error ? caught : new Error("Не удалось изменить подачу.");
        if (isAdminSubmissionConcurrencyConflict(error)) {
          await refreshCanonicalSubmissions();
        }
        if (
          !isWorkspaceSessionChangedError(error) &&
          workspaceSessionUserIdRef.current === session.userId
        ) {
          setWorkspaceDataState({
            error: error.message,
            sessionUserId: session.userId,
            status: "error",
          });
        }
        throw error;
      }
    },
    [
      activeApprovedSession,
      enqueueWorkspaceSubmissionMutation,
      persistSubmissions,
      refreshCanonicalSubmissions,
    ],
  );

  const updateAdminSubmission = useCallback(
    async (submissionId: string, update: (submission: Submission) => Submission) => {
      const session = activeApprovedSession;
      if (!session || session.role !== "admin") {
        const error = new Error("Только активный администратор может изменить подачу.");
        setWorkspaceDataState({
          error: error.message,
          sessionUserId: session?.userId,
          status: "error",
        });
        throw error;
      }

      try {
        await enqueueWorkspaceSubmissionMutation(session.userId, async (fence) => {
          let found = false;
          let changed = false;
          const nextSubmissions = submissionsRef.current.map((submission) => {
            if (submission.id !== submissionId) return submission;
            found = true;
            const nextSubmission = update(submission);
            changed ||= nextSubmission !== submission;
            return nextSubmission;
          });
          if (!found) throw new Error("Подача для изменения не найдена.");
          if (changed) await persistSubmissions(nextSubmissions, fence);
        });
      } catch (caught) {
        const error =
          caught instanceof Error ? caught : new Error("Не удалось изменить подачу.");
        if (isAdminSubmissionConcurrencyConflict(error)) {
          await refreshCanonicalSubmissions();
        }
        if (
          !isWorkspaceSessionChangedError(error) &&
          workspaceSessionUserIdRef.current === session.userId
        ) {
          setWorkspaceDataState({
            error: isAdminSubmissionConcurrencyConflict(error)
              ? "Подача изменилась в другой сессии. Загружена актуальная версия; повторите действие."
              : error.message,
            sessionUserId: session.userId,
            status: "error",
          });
        }
        throw error;
      }
    },
    [
      activeApprovedSession,
      enqueueWorkspaceSubmissionMutation,
      persistSubmissions,
      refreshCanonicalSubmissions,
    ],
  );

  const dispatchPostCommitBridge = useCallback(
    (
      event: VisaflowPostCommitEvent,
      fence: WorkspaceMutationFence,
      legacyObserver?: () => void | Promise<void>,
    ) => {
      void postCommitBridgePolicyRef.current.dispatch({
        event,
        isSessionCurrent: fence.isCurrent,
        legacyObserver,
        observer: bridge.onPostCommitEvent,
      });
    },
    [bridge],
  );

  const appBridge = useMemo<VisaflowBusinessBridge>(
    () => ({
      ...bridge,
      onSubmissionAction: async ({ submissionId, action, source }) => {
        const session = activeApprovedSession;
        if (!session) throw new WorkspaceSessionChangedError();
        const fence = createWorkspaceMutationFence(session.userId);
        const eventId = crypto.randomUUID();
        await applySubmissionAction(submissionId, action, source);
        fence.assertCurrent();
        dispatchPostCommitBridge(
          {
            actorId: session.userId,
            committedAt: new Date().toISOString(),
            eventId,
            payload: { action, source, submissionId },
            submissionIds: [submissionId],
            type: "submission.action",
          },
          fence,
          () => bridge.onSubmissionAction?.({ submissionId, action, source }),
        );
      },
      onAdminIssueAdd: async ({ submissionId, input }) => {
        const session = activeApprovedSession;
        if (!session || session.role !== "admin") {
          throw new Error("Только активный администратор может добавить замечание.");
        }
        const fence = createWorkspaceMutationFence(session.userId);
        const eventId = crypto.randomUUID();
        await updateAdminSubmission(submissionId, (submission) =>
          addPreciseAdminIssue(submission, input, session.userId),
        );
        fence.assertCurrent();
        dispatchPostCommitBridge(
          {
            actorId: session.userId,
            committedAt: new Date().toISOString(),
            eventId,
            payload: { input, submissionId },
            submissionIds: [submissionId],
            type: "admin.issue.add",
          },
          fence,
          () => bridge.onAdminIssueAdd?.({ submissionId, input }),
        );
      },
      onAdminPassportSectionApprove: async ({ submissionId, applicantId }) => {
        const session = activeApprovedSession;
        if (!session || session.role !== "admin") {
          throw new Error(
            "Только активный администратор может подтвердить паспортную секцию.",
          );
        }

        const fence = createWorkspaceMutationFence(session.userId);
        const eventId = crypto.randomUUID();
        let foundSubmission = false;
        await updateAdminSubmission(submissionId, (submission) => {
          foundSubmission = true;
          const result = approvePassportReviewSectionForAdmin(
            submission,
            { applicantId },
            session.userId,
          );
          if (!result.ok) throw new Error(result.error.message);
          return result.data;
        });
        if (!foundSubmission) {
          throw new Error("Подача для подтверждения паспортной секции не найдена.");
        }
        fence.assertCurrent();
        dispatchPostCommitBridge(
          {
            actorId: session.userId,
            committedAt: new Date().toISOString(),
            eventId,
            payload: { applicantId, submissionId },
            submissionIds: [submissionId],
            type: "admin.passport-section.approve",
          },
          fence,
          () =>
            bridge.onAdminPassportSectionApprove?.({ submissionId, applicantId }),
        );
      },
      onAdminAiReviewRun: async (submissionId) => {
        const session = activeApprovedSession;
        if (!session || session.role !== "admin") {
          throw new Error("Только активный администратор может запустить AI-проверку.");
        }
        const fence = createWorkspaceMutationFence(session.userId);
        const eventId = crypto.randomUUID();
        await updateAdminSubmission(submissionId, runAiReview);
        fence.assertCurrent();
        dispatchPostCommitBridge(
          {
            actorId: session.userId,
            committedAt: new Date().toISOString(),
            eventId,
            payload: { submissionId },
            submissionIds: [submissionId],
            type: "admin.ai.run",
          },
          fence,
          () => bridge.onAdminAiReviewRun?.(submissionId),
        );
      },
      onAdminAiSuggestionAccept: async ({ submissionId, suggestionId }) => {
        const session = activeApprovedSession;
        if (!session || session.role !== "admin") {
          throw new Error("Только активный администратор может принять AI-подсказку.");
        }
        const fence = createWorkspaceMutationFence(session.userId);
        const eventId = crypto.randomUUID();
        await updateAdminSubmission(submissionId, (submission) =>
          acceptAiSuggestionAsIssue(submission, suggestionId, "admin"),
        );
        fence.assertCurrent();
        dispatchPostCommitBridge(
          {
            actorId: session.userId,
            committedAt: new Date().toISOString(),
            eventId,
            payload: { submissionId, suggestionId },
            submissionIds: [submissionId],
            type: "admin.ai.accept",
          },
          fence,
          () => bridge.onAdminAiSuggestionAccept?.({ submissionId, suggestionId }),
        );
      },
      onAdminAiSuggestionDismiss: async ({ submissionId, suggestionId }) => {
        const session = activeApprovedSession;
        if (!session || session.role !== "admin") {
          throw new Error("Только активный администратор может отклонить AI-подсказку.");
        }
        const fence = createWorkspaceMutationFence(session.userId);
        const eventId = crypto.randomUUID();
        await updateAdminSubmission(submissionId, (submission) =>
          dismissAiSuggestion(submission, suggestionId, "admin"),
        );
        fence.assertCurrent();
        dispatchPostCommitBridge(
          {
            actorId: session.userId,
            committedAt: new Date().toISOString(),
            eventId,
            payload: { submissionId, suggestionId },
            submissionIds: [submissionId],
            type: "admin.ai.dismiss",
          },
          fence,
          () => bridge.onAdminAiSuggestionDismiss?.({ submissionId, suggestionId }),
        );
      },
      onExportPackages: async ({
        archiveInputSignature,
        documentExport,
        packageIdentity,
        submissionIds,
      }) => {
        const session = activeApprovedSession;
        if (
          workspace !== "admin" ||
          session?.role !== "admin" ||
          session.status !== "active" ||
          session.approvalStatus !== "approved"
        ) {
          throw new Error(
            "Only an approved admin session can complete export packages.",
          );
        }

        const postCommitFence = createWorkspaceMutationFence(session.userId);
        const eventId = crypto.randomUUID();
        try {
          await enqueueWorkspaceSubmissionMutation(session.userId, async (fence) => {
          const currentSubmissions = submissionsRef.current;
          const requestedSubmissionIds = new Set(submissionIds);
          const selectedCurrent = currentSubmissions.filter((submission) =>
            requestedSubmissionIds.has(submission.id),
          );
          const currentPackageIdentity = buildExportPackageIdentity(selectedCurrent);
          const currentArchiveInputSignature =
            buildExportArchiveInputSignature(selectedCurrent);
          const artifactStillMatchesCurrentSelection =
            requestedSubmissionIds.size === submissionIds.length &&
            selectedCurrent.length === submissionIds.length &&
            archiveInputSignature === currentArchiveInputSignature &&
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

          const selectionAlreadyDownloaded = selectedCurrent.every(
            (submission) =>
              submission.exportState === "file_downloaded" &&
              submission.exportPackage &&
              exportPackageIdentityMatches(
                submission.exportPackage,
                currentPackageIdentity,
              ),
          );
          let downloadedSubmissions = currentSubmissions;
          let rollbackExpectedCaseRevisions = new Map(
            caseRevisionsBySubmissionIdRef.current,
          );
          if (!selectionAlreadyDownloaded) {
            const generatedSubmissions = applyExportStateToSelection(
              currentSubmissions,
              submissionIds,
              "file_generated",
            );
            downloadedSubmissions = applyExportStateToSelection(
              generatedSubmissions,
              submissionIds,
              "file_downloaded",
            );
            if (downloadedSubmissions === generatedSubmissions) {
              throw new Error("Export download state was blocked by domain guards.");
            }
          }

          const selectedDownloaded = downloadedSubmissions.filter((submission) =>
            requestedSubmissionIds.has(submission.id),
          );
          const downloadedIdentity = buildExportPackageIdentity(selectedDownloaded);
          const downloadedArchiveInputSignature =
            buildExportArchiveInputSignature(selectedDownloaded);
          const downloadedSelectionMatchesArtifact =
            selectedDownloaded.length === submissionIds.length &&
            archiveInputSignature === downloadedArchiveInputSignature &&
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

          if (!selectionAlreadyDownloaded) {
            const checkpointRevisions = await persistSubmissions(
              downloadedSubmissions,
              fence,
            );
            if (checkpointRevisions) {
              rollbackExpectedCaseRevisions = new Map(checkpointRevisions);
            }
          }
          const failWithRetryableExportState = async (
            failure: unknown,
          ): Promise<never> => {
            fence.assertCurrent();
            const rollbackBaseSubmissions = submissionsRef.current;
            const retryableSubmissions = applyExportStateToSelection(
              rollbackBaseSubmissions,
              submissionIds,
              "ready",
            );
            const failureMessage =
              failure instanceof Error
                ? failure.message
                : typeof failure === "string"
                  ? failure
                  : "Export package completion failed.";
            if (retryableSubmissions === rollbackBaseSubmissions) {
              throw new Error(
                `${failureMessage} Export state could not be restored for retry.`,
              );
            }
            try {
              await persistSubmissions(
                retryableSubmissions,
                fence,
                rollbackExpectedCaseRevisions,
              );
            } catch (rollbackError) {
              if (isWorkspaceSessionChangedError(rollbackError)) throw rollbackError;
              throw new Error(
                `${failureMessage} Export state rollback could not be persisted.`,
              );
            }
            throw new Error(failureMessage);
          };

          const completionOptions = {
            batchId: crypto.randomUUID(),
            createdAt: new Date().toISOString(),
            createdBy: session.userId,
            documentExport,
            format: "xlsx" as const,
          };
          let completed: Awaited<ReturnType<typeof completeExportPackage>>;
          try {
            fence.assertCurrent();
            completed = await completeExportPackage(
              selectedDownloaded,
              completionOptions,
            );
            fence.assertCurrent();
          } catch (error) {
            if (isWorkspaceSessionChangedError(error)) throw error;
            fence.assertCurrent();
            const reconciliation = await reconcileExportPackageCompletion(
              selectedDownloaded,
              completionOptions,
              error,
              fence,
            );
            fence.assertCurrent();
            if (reconciliation.status === "committed") {
              // A lost response can still represent a committed transaction.
              // Follow-up reads and observers never roll that commit back.
              void refreshCanonicalSubmissions();
              return;
            }
            if (reconciliation.status === "not_committed") {
              return failWithRetryableExportState(error);
            }

            void refreshCanonicalSubmissions();
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
          // Follow-up reads are best-effort and remain outside that transaction.
            void refreshCanonicalSubmissions();
          });
        } catch (error) {
          if (isAdminSubmissionConcurrencyConflict(error)) {
            await refreshCanonicalSubmissions();
            if (postCommitFence.isCurrent()) {
              setWorkspaceDataState({
                error:
                  "Подача изменилась в другой сессии. Загружена актуальная версия; повторите выгрузку.",
                sessionUserId: session.userId,
                status: "error",
              });
            }
          }
          throw error;
        }

        postCommitFence.assertCurrent();
        dispatchPostCommitBridge(
          {
            actorId: session.userId,
            committedAt: new Date().toISOString(),
            eventId,
            payload: {
              archiveInputSignature,
              documentExport,
              packageIdentity,
              submissionIds,
          },
            submissionIds,
            type: "export.complete",
          },
          postCommitFence,
          () =>
            bridge.onExportPackages?.({
              archiveInputSignature,
              documentExport,
              packageIdentity,
              submissionIds,
            }),
        );
      },
    }),
    [
      activeApprovedSession,
      applySubmissionAction,
      bridge,
      createWorkspaceMutationFence,
      dispatchPostCommitBridge,
      enqueueWorkspaceSubmissionMutation,
      persistSubmissions,
      refreshCanonicalSubmissions,
      updateAdminSubmission,
      workspace,
    ],
  );

  if (!authChecked) {
    return (
      <AppRuntimeState
        description="Восстанавливаем защищённую сессию и права доступа к рабочей области."
        eyebrow="Безопасный вход"
        id="access-loading-title"
        statusText="Загрузка доступа..."
        title="Проверяем доступ"
        tone="loading"
      />
    );
  }

  if (supabaseActivationBlocked) {
    return (
      <AppRuntimeState
        description="Для выбранного Supabase target локальные демо-данные отключены. Приложение остановлено fail-closed, чтобы не загрузить seed/mock данные вместо production source."
        detail={workspaceDataState.error || supabaseRuntimeConfig.activation.boundary}
        eyebrow="Production safety"
        id="production-runtime-blocked-title"
        title="Supabase не активирован"
        tone="blocked"
      />
    );
  }

  if (signOutPending) {
    return (
      <AppRuntimeState
        description="Закрываем текущую сессию и останавливаем все связанные операции."
        eyebrow="Безопасный выход"
        id="sign-out-pending-title"
        statusText="Завершаем сессию..."
        title="Завершаем сессию"
        tone="loading"
      />
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
      <AppRuntimeState
        description="Получаем актуальные подачи и права доступа из Supabase."
        eyebrow="Рабочая область"
        id="workspace-loading-title"
        statusText="Загрузка данных Supabase..."
        title="Загружаем рабочую область"
        tone="loading"
      />
    );
  }

  if (initialWorkspaceGate === "error") {
    return (
      <AppRuntimeState
        actionLabel="Повторить"
        description={workspaceDataState.error ?? "Повторите загрузку рабочей области."}
        eyebrow="Синхронизация Supabase"
        id="workspace-load-error-title"
        onAction={() => void refreshCanonicalSubmissions()}
        title="Не удалось загрузить данные Supabase"
        tone="error"
      />
    );
  }

  return (
    <Suspense
      fallback={
        <AppRuntimeState
          description="Подключаем интерфейс и рабочие инструменты."
          eyebrow="Интерфейс"
          id="workspace-interface-loading-title"
          statusText="Загрузка рабочей области..."
          title="Открываем рабочую область"
          tone="loading"
        />
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
          onAssignPublicNumber: assignVisibleAgentSubmissionPublicNumber,
          onDeleteSubmission: deleteVisibleAgentSubmission,
          onSubmissionUpdate: updateVisibleAgentSubmission,
          onSubmissionsChange: persistVisibleAgentSubmissions,
          reservedSubmissionIds: submissions.map((submission) => submission.id),
          submissions: visibleSubmissions,
          usesSupabase: supabaseEnabled,
          onSignOut: handleSignOut,
        }}
        bridge={appBridge}
        onRetryWorkspace={refreshCanonicalSubmissions}
        sessionKey={activeApprovedSession.userId}
        workspace={workspace}
        workspaceDataState={workspaceDataState}
      />
    </Suspense>
  );
}
