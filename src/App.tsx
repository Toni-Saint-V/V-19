import {
  type FormEvent,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabaseRuntimeConfig } from "./lib/supabase/config";
import { Button, SearchBar } from "./shared/ui/primitives";
import {
  acceptAiSuggestionAsIssue,
  canRunAiReview,
  dismissAiSuggestion,
  runAiReview,
} from "./modules/submissions/aiSuggestions";
import {
  adminInboxEvents,
  agentActionQueue,
  searchAgentActions,
} from "./modules/submissions/agentActions";
import {
  buildExportPackageIdentity,
  exportPackageIdentityMatches,
  exportSummary,
  exportSummaryForSelectedIds,
  selectedReadySubmissionsForExport,
} from "./modules/submissions/exportRules";
import { loadSubmissions, saveSubmissions } from "./modules/submissions/persistence";
import {
  defaultLocalAgentOwnerId,
  ensureSubmissionOwner,
} from "./modules/submissions/ownership";
import {
  agentAgencyLabel,
  agentDisplayName,
  agentInitials,
} from "./modules/submissions/agentDirectory";
import {
  changedCockpitSubmissions,
  cockpitSubmissionFingerprint,
  cockpitSubmissionFingerprintMap,
  loadCockpitSubmissionsForProfile,
  saveCockpitSubmissionsForProfile,
} from "./modules/submissions/supabasePersistence";
import {
  agentQueue,
  counts,
  exportedHistory,
  highestPriorityFirst,
  ownedSubmissions,
  readyForExport,
  reviewQueue,
  searchSubmissions,
} from "./modules/submissions/selectors";
import {
  addPreciseAdminIssue,
  applyActionToSubmissionListResult,
  applyUploadedFileMetadata,
  applyExportStateToSelection,
  createDraftSubmission,
  generatedCockpitMediaFileName,
  markSubmissionFileAccepted,
  mergeUploadedFileMetadataIntoSubmissions,
  mediaSlotTypeForSubmissionFileType,
  updateQuestionnaireField,
  type UploadedFileMetadata,
  uploadRequiredFile,
} from "./modules/submissions/submissionActions";
import {
  createSubmissionActionErrorState,
  submissionActionErrorForSubmission,
  type SubmissionActionErrorState,
} from "./modules/submissions/submissionActionErrors";
import { completeExportPackage } from "./modules/submissions/exportWorkflow";
import {
  canAddAdminIssue,
  defaultDrawerTab,
  markSubmissionIssueFixedResult,
} from "./modules/submissions/status";
import {
  applySafePassportExtractionFields,
  applyPassportExtractionField,
  canStartPassportExtraction,
  failPassportExtraction,
  finishPassportExtraction,
  markPassportExtractionReviewed,
  passportExtractionEnabledFromEnv,
  requiresPassportExtractionReviewBeforeAction,
  startPassportExtraction,
  type PassportFieldApplyMode,
} from "./modules/submissions/passportExtraction";
import {
  extractPdfTextFromFile,
  normalizeVisaApplicationPdfUploadFile,
} from "./modules/submissions/pdfTextExtraction";
import {
  applyVisaApplicationPdfReview,
  confirmVisaApplicationPdfManualReview,
  dismissVisaApplicationPdfReview,
} from "./modules/submissions/visaApplicationPdfReconciliation";
import {
  OperationalMobileTabBar,
  OperationalSidebar,
  type OperationalNavItem,
} from "./modules/submissions/components/OperationalNavigation";
import { ConfirmationDialog } from "./modules/submissions/components/Primitives";
import { FigmaQuestionnaireScreen } from "./modules/submissions/components/FigmaQuestionnaireScreen";
import { FigmaSubmissionDrawer } from "./modules/submissions/components/FigmaSubmissionDrawer";
import { AdminReviewDrawer } from "./modules/submissions/components/AdminReviewDrawer";
import { SubmissionDrawer } from "./modules/submissions/components/SubmissionDrawer";
import {
  AgentSubmissionsScreen,
  AdminReviewScreen,
  ExportScreen,
  type AdminWorkTab,
} from "./modules/submissions/pages/OperationsScreens";
import { FigmaActionQueueVisual } from "./modules/submissions/pages/FigmaVisualScreens";
import type { WorkspaceTarget } from "./modules/submissions/workspaceModel";
import type {
  City,
  DrawerTab,
  IssueInput,
  PassportUploadDraft,
  PreliminaryIntakeDraft,
  Role,
  Submission,
  SubmissionAction,
  SubmissionFile,
  Surface,
  QuestionnaireField,
} from "./modules/submissions/types";
import {
  type AgentTab,
  type DrawerMode,
  type ExportTab,
  matchesAgentTab,
  matchesReviewTab,
  type ReviewTab,
  surfaceDescription,
  surfaceTitle,
} from "./modules/submissions/uiTypes";
import {
  getCurrentAppSession,
  signInSupabaseWithPassword,
  signOutCurrentSession,
} from "./services/authService";
import {
  AuthAccessError,
  accessRequestRepository,
  authRepository,
  type AccessRequest,
  type Session as LocalAuthSession,
} from "./services/authRegistration";
import { formatPersistenceFailureForUser } from "./services/persistenceObservability";
import { invokePassportExtraction } from "./modules/submissions/passportExtractionService";
import {
  buildMediaStoragePath,
  buildVisaApplicationPdfStorageTarget,
  deleteMediaFromStorage,
  mediaStorageBucket,
  uploadMediaToStorage,
  type MediaStorageTarget,
} from "./modules/submissions/mediaStorage";
import { buildAgentHandoffPackage } from "./modules/submissions/operationalWorkflow";
import { publishReturnedPdfAgentHandoff } from "./modules/submissions/returnedPdfHandoffPersistence";
import type { AppProfile } from "./types/session";

const SettingsScreen = lazy(() => import("./modules/submissions/pages/SettingsScreen"));
const CreateSubmissionDrawer = lazy(() =>
  import("./modules/submissions/components/CreateSubmissionDrawer").then((module) => ({
    default: module.CreateSubmissionDrawer,
  })),
);

const workspaceEmailStorageKey = "visaflow.workspaceEmail.v1";
const fallbackAdminEmails = ["admin@visaflow.local"];
const fallbackAgentEmails = ["agent@visaflow.local"];

type IssueComposerRequest = {
  submissionId: string;
  token: number;
};

type WorkspaceSettings = {
  compactLists: boolean;
  digest: "instant" | "daily";
  drawerHints: boolean;
};

const defaultWorkspaceSettings: WorkspaceSettings = {
  compactLists: true,
  digest: "instant",
  drawerHints: true,
};

function sameWorkspaceSettings(left: WorkspaceSettings, right: WorkspaceSettings) {
  return (
    left.compactLists === right.compactLists &&
    left.digest === right.digest &&
    left.drawerHints === right.drawerHints
  );
}

type PassportReviewRequest = {
  action: SubmissionAction;
  submissionId: string;
};

function parseWorkspaceEmails(input: unknown, fallback: string[]) {
  if (typeof input !== "string" || input.trim() === "") return fallback;
  const parsed = input
    .split(",")
    .map((email) => normalizeEmail(email))
    .filter(Boolean);
  return parsed.length ? parsed : fallback;
}

const adminEmails = parseWorkspaceEmails(
  import.meta.env.VITE_ADMIN_EMAILS,
  fallbackAdminEmails,
);

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function resolveWorkspaceRole(email: string): Role | null {
  const normalized = normalizeEmail(email);
  if (adminEmails.includes(normalized)) return "admin";
  return null;
}

function loadWorkspaceEmail() {
  try {
    return localStorage.getItem(workspaceEmailStorageKey) ?? "";
  } catch {
    return "";
  }
}

function saveWorkspaceEmail(email: string) {
  try {
    localStorage.setItem(workspaceEmailStorageKey, email);
  } catch {
    // Хранилище может быть недоступно в приватном режиме.
  }
}

function clearWorkspaceEmail() {
  try {
    localStorage.removeItem(workspaceEmailStorageKey);
  } catch {
    // Хранилище может быть недоступно в приватном режиме.
  }
}

function createMediaUploadNonce(uploadedAtIso: string) {
  return `${uploadedAtIso}:${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2)}`;
}

function normalizeCreateApplicantNames(names: string[], count: number) {
  const fallbacks = [
    "Новый заявитель",
    "Супруг",
    "Ребёнок 1",
    "Ребёнок 2",
    "Ребёнок 3",
    "Ребёнок 4",
  ];

  return Array.from(
    { length: count },
    (_, index) => names[index] ?? fallbacks[index] ?? `Заявитель ${index + 1}`,
  );
}

function applicantNameFromPassportUpload(upload: PassportUploadDraft | undefined) {
  if (!upload) return "";

  const surname = upload.extractedFields
    .find((field) => field.key === "surname")
    ?.value.trim();
  const firstName = upload.extractedFields
    .find((field) => field.key === "firstName")
    ?.value.trim();

  return [surname, firstName].filter(Boolean).join(" ");
}

function applicantNamesForCreateDraft({
  currentNames,
  familyCount,
  passportUploads,
  type,
}: {
  currentNames: string[];
  familyCount: number;
  passportUploads: PassportUploadDraft[];
  type: Submission["type"];
}) {
  const applicantCount = type === "family" ? familyCount : 1;
  const names = normalizeCreateApplicantNames(currentNames, applicantCount);

  for (const upload of passportUploads) {
    const extractedName = applicantNameFromPassportUpload(upload);
    if (!extractedName) continue;
    if (upload.applicantIndex < 0 || upload.applicantIndex >= names.length) continue;
    names[upload.applicantIndex] = extractedName;
  }

  return names;
}

const passportScanUploadMimeTypes = new Set([
  "image/jpeg",
  "image/png",
  "application/pdf",
]);

function firstSubmissionForRole(
  submissions: Submission[],
  role: Role,
  agentId = defaultLocalAgentOwnerId,
) {
  if (role === "admin") return reviewQueue(submissions)[0] ?? submissions[0];
  return (
    agentQueue(submissions, agentId)[0] ?? ownedSubmissions(submissions, agentId)[0]
  );
}

function reviewTabForAdminWork(tab: AdminWorkTab): ReviewTab | null {
  if (tab === "events") return null;
  return tab;
}

function MainApp() {
  const isSupabaseMode = supabaseRuntimeConfig.selected === "supabase";
  const passportExtractionEnabled = passportExtractionEnabledFromEnv(
    import.meta.env as { readonly VITE_PASSPORT_EXTRACTION_ENABLED?: string },
  );
  const [workspaceEmail, setWorkspaceEmail] = useState(loadWorkspaceEmail);
  const initialWorkspaceRole = resolveWorkspaceRole(workspaceEmail) ?? "agent";
  const [role, setRole] = useState<Role>(initialWorkspaceRole);
  const [workspaceEmailDraft, setWorkspaceEmailDraft] = useState(workspaceEmail);
  const [workspacePasswordDraft, setWorkspacePasswordDraft] = useState("");
  const [workspaceAccessError, setWorkspaceAccessError] = useState("");
  const [workspaceAccessNotice, setWorkspaceAccessNotice] = useState("");
  const [authChecked, setAuthChecked] = useState(!isSupabaseMode);
  const [loginBusy, setLoginBusy] = useState(false);
  const [localAuthSession, setLocalAuthSession] = useState<LocalAuthSession | null>(
    null,
  );
  const [pendingAccessRequests, setPendingAccessRequests] = useState<
    AccessRequest[]
  >([]);
  const [remoteProfile, setRemoteProfile] = useState<AppProfile | null>(null);
  const [remoteSaveState, setRemoteSaveState] = useState<
    "idle" | "loading" | "saving" | "error"
  >("idle");
  const [remoteSaveError, setRemoteSaveError] = useState("");
  const [workspaceSettings, setWorkspaceSettings] = useState<WorkspaceSettings>(
    defaultWorkspaceSettings,
  );
  const [settingsDraft, setSettingsDraft] = useState<WorkspaceSettings>(
    defaultWorkspaceSettings,
  );
  const [settingsSaveState, setSettingsSaveState] = useState<"idle" | "saved">("idle");
  const [confirmSettingsLeave, setConfirmSettingsLeave] = useState(false);
  const [surface, setSurface] = useState<Surface>(
    initialWorkspaceRole === "admin" ? "admin-review" : "agent-actions",
  );
  const [submissions, setSubmissions] = useState<Submission[]>(() => loadSubmissions());
  const [selectedSubmissionId, setSelectedSubmissionId] = useState(() => {
    const initialSubmissions = loadSubmissions();
    return firstSubmissionForRole(initialSubmissions, initialWorkspaceRole)?.id ?? "";
  });
  const [drawerMode, setDrawerMode] = useState<DrawerMode>("closed");
  const [activeDrawerTab, setActiveDrawerTab] = useState<DrawerTab>(
    defaultDrawerTab(loadSubmissions()[0]),
  );
  const [drawerInitialTarget, setDrawerInitialTarget] =
    useState<WorkspaceTarget | null>(null);
  const [agentQuestionnaireOpen, setAgentQuestionnaireOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [createCloseFocusToken, setCreateCloseFocusToken] = useState(0);
  const [query, setQuery] = useState("");
  const [cityFilter, setCityFilter] = useState<City | "Все города">("Все города");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [agentTab, setAgentTab] = useState<AgentTab>("action");
  const [reviewTab, setReviewTab] = useState<AdminWorkTab>("review");
  const [exportTab, setExportTab] = useState<ExportTab>("ready");
  const [selectedExportIds, setSelectedExportIds] = useState<string[]>(["ПД-1056"]);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState("");
  const [issueComposerRequest, setIssueComposerRequest] =
    useState<IssueComposerRequest | null>(null);
  const [passportReviewRequest, setPassportReviewRequest] =
    useState<PassportReviewRequest | null>(null);
  const [submissionActionError, setSubmissionActionError] =
    useState<SubmissionActionErrorState | null>(null);
  const [createType, setCreateType] = useState<Submission["type"]>("single");
  const [createCity, setCreateCity] = useState<City>("Москва");
  const [createFamilyCount, setCreateFamilyCount] = useState(2);
  const [createApplicantNames, setCreateApplicantNames] = useState<string[]>([
    "Новый заявитель",
    "Супруг",
    "Ребёнок 1",
    "Ребёнок 2",
  ]);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const pendingSettingsNavigationRef = useRef<(() => void) | null>(null);
  const remoteOwnerIdsRef = useRef<Map<string, string>>(new Map());
  const remoteSubmissionFingerprintsRef = useRef<Map<string, string>>(new Map());
  const skipNextRemoteSaveRef = useRef(false);
  const remoteSaveTimerRef = useRef<number | null>(null);
  const remoteSavePromiseRef = useRef<Promise<void> | null>(null);
  const submissionsRef = useRef<Submission[]>(submissions);
  const selectedExportIdsRef = useRef<string[]>(selectedExportIds);
  const localPassportFilesRef = useRef<Map<string, File>>(new Map());
  const uploadQueuesRef = useRef<Map<string, Promise<void>>>(new Map());
  const [localPassportFileIds, setLocalPassportFileIds] = useState<string[]>([]);
  const [uploadingSubmissionIds, setUploadingSubmissionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const settingsDirty = !sameWorkspaceSettings(workspaceSettings, settingsDraft);

  const currentAgentOwnerId =
    role === "agent" && remoteProfile?.role === "agent"
      ? remoteProfile.id
      : defaultLocalAgentOwnerId;
  const visibleSubmissionsForRole =
    role === "agent" ? ownedSubmissions(submissions, currentAgentOwnerId) : submissions;
  const activeSubmission =
    visibleSubmissionsForRole.find(
      (submission) => submission.id === selectedSubmissionId,
    ) ?? visibleSubmissionsForRole[0];
  const activeSubmissionActionError = activeSubmission
    ? submissionActionErrorForSubmission(submissionActionError, activeSubmission, role)
    : "";
  const summary = counts(visibleSubmissionsForRole);
  const searchedAgentQueue = useMemo(
    () =>
      searchSubmissions(
        agentQueue(submissions, currentAgentOwnerId),
        query,
        cityFilter,
      ),
    [cityFilter, currentAgentOwnerId, query, submissions],
  );
  const agentActionSource = useMemo(
    () =>
      searchSubmissions(agentQueue(submissions, currentAgentOwnerId), "", cityFilter),
    [cityFilter, currentAgentOwnerId, submissions],
  );
  const visualActionSubmissions = useMemo(
    () => agentQueue(submissions, currentAgentOwnerId),
    [currentAgentOwnerId, submissions],
  );
  const agentActions = useMemo(
    () => agentActionQueue(agentActionSource),
    [agentActionSource],
  );
  const searchedOpenAgentActions = useMemo(
    () => searchAgentActions(agentActions.open, query),
    [agentActions.open, query],
  );
  const searchedReviewQueue = useMemo(
    () => searchSubmissions(reviewQueue(submissions), query, cityFilter),
    [cityFilter, query, submissions],
  );
  const adminWorkSubmissionCount = useMemo(
    () =>
      searchedReviewQueue.filter(
        (submission) =>
          matchesReviewTab("review")(submission) ||
          matchesReviewTab("corrections")(submission),
      ).length,
    [searchedReviewQueue],
  );
  const agentList = highestPriorityFirst(
    searchedAgentQueue.filter(matchesAgentTab(agentTab)),
  );
  const reviewFilterTab = reviewTabForAdminWork(reviewTab);
  const reviewList = highestPriorityFirst(
    reviewFilterTab
      ? searchedReviewQueue.filter(matchesReviewTab(reviewFilterTab))
      : [],
  );
  const visibleAgentSubmission =
    activeSubmission && agentList.some((submission) => submission.id === activeSubmission.id)
      ? activeSubmission
      : agentList[0] ?? null;
  const visibleReviewSubmission =
    activeSubmission && reviewList.some((submission) => submission.id === activeSubmission.id)
      ? activeSubmission
      : reviewList[0] ?? null;
  const searchedAdminInboxEvents = useMemo(
    () => adminInboxEvents(searchedReviewQueue),
    [searchedReviewQueue],
  );
  const searchedExportSubmissions = useMemo(
    () => searchSubmissions(submissions, query, cityFilter),
    [cityFilter, query, submissions],
  );
  const readyList = readyForExport(searchedExportSubmissions);
  const historyList = exportedHistory(searchedExportSubmissions);
  const selectedForExport = readyList.filter((submission) =>
    selectedExportIds.includes(submission.id),
  );
  const selectedVisibleExportIds = selectedForExport.map((submission) => submission.id);
  const exportPlan = exportSummary(selectedForExport);
  const showRoleSwitcher =
    !isSupabaseMode &&
    Boolean(localAuthSession) &&
    (import.meta.env.DEV || import.meta.env.VITE_ENABLE_ROLE_SWITCH === "true");
  const isV19CollectionSurface =
    surface === "agent-actions" ||
    surface === "agent-submissions" ||
    surface === "admin-review";
  const isOperationalNavSurface = isV19CollectionSurface || surface === "export";
  const isFigmaVisualSurface = surface === "agent-actions";
  const workspaceSurfaceTitle =
    surface === "admin-review" ? "Проверка" : surfaceTitle(surface);
  const workspaceSurfaceDescription =
    surface === "admin-review"
      ? "Очередь проверки и исправления"
      : surfaceDescription(surface);
  const hasWorkspaceAccess = isSupabaseMode
    ? Boolean(remoteProfile)
    : Boolean(localAuthSession);
  const emptyRemoteWorkspace =
    isSupabaseMode && Boolean(remoteProfile) && authChecked && submissions.length === 0;
  const sessionDisplayName =
    isSupabaseMode && remoteProfile
      ? remoteProfile.displayName || remoteProfile.email
      : localAuthSession
        ? localAuthSession.email
      : role === "agent"
        ? "Татьяна Новикова"
        : "Ирина Лебедева";
  const sessionInitials =
    isSupabaseMode && remoteProfile
      ? remoteProfile.role === "admin"
        ? "АД"
        : "АГ"
      : localAuthSession
        ? localAuthSession.role === "admin"
          ? "АД"
          : "АГ"
      : role === "agent"
        ? "ТН"
        : "ИЛ";
  const sessionRoleLabel =
    isSupabaseMode && remoteProfile
      ? remoteProfile.role === "admin"
        ? "Admin profile"
        : "Agent profile"
      : localAuthSession
        ? `${localAuthSession.role === "admin" ? "Админ" : "Агент"} · local/dev auth`
      : `${role === "agent" ? "Агент" : "Админ"} · VisaFlow Operations`;
  const operationalNavItems: OperationalNavItem[] =
    role === "agent"
      ? [
          {
            active: surface === "agent-actions",
            count: agentActions.summary.open,
            icon: "М",
            id: "agent-actions",
            label: "Мои действия",
            meta: "активная очередь",
            onClick: showAgentActions,
          },
          {
            active: surface === "agent-submissions",
            icon: "П",
            id: "agent-submissions",
            label: "Мои подачи",
            meta: "все рабочие подачи",
            onClick: () => showAgentTab("action"),
          },
          {
            active: surface === "settings",
            icon: "Н",
            id: "agent-settings",
            label: "Настройки",
            meta: "роль и доступ",
            onClick: showSettingsSurface,
          },
        ]
      : [
          {
            active: surface === "admin-review",
            count: adminWorkSubmissionCount,
            icon: "М",
            id: "admin-work",
            label: "Проверка",
            meta: "очередь проверки",
            onClick: () => showReviewTab("review"),
          },
          {
            active: surface === "export",
            count: summary.ready,
            icon: "Э",
            id: "admin-export",
            label: "Выгрузка",
            meta: "готово к Excel",
            onClick: showExportSurface,
            tone: summary.ready > 0 ? "success" : "default",
          },
        ];

  async function saveRemoteWorkspaceSnapshot(
    activeRemoteProfile: AppProfile,
    dirtySubmissions: Submission[],
  ) {
    setRemoteSaveState("saving");
    setRemoteSaveError("");
    try {
      remoteOwnerIdsRef.current = await saveCockpitSubmissionsForProfile(
        activeRemoteProfile,
        dirtySubmissions,
        remoteOwnerIdsRef.current,
      );
      remoteSubmissionFingerprintsRef.current = new Map(
        remoteSubmissionFingerprintsRef.current,
      );
      for (const submission of dirtySubmissions) {
        remoteSubmissionFingerprintsRef.current.set(
          submission.id,
          cockpitSubmissionFingerprint(submission),
        );
      }
      setRemoteSaveState("idle");
    } catch (error) {
      setRemoteSaveState("error");
      setRemoteSaveError(
        formatPersistenceFailureForUser(
          error,
          "Удалённое сохранение не прошло. Обновите данные перед продолжением.",
        ),
      );
      throw error;
    }
  }

  async function drainRemoteSavesBeforeExport(
    activeRemoteProfile: AppProfile,
    latestSubmissions: Submission[],
  ) {
    if (remoteSaveTimerRef.current !== null) {
      window.clearTimeout(remoteSaveTimerRef.current);
      remoteSaveTimerRef.current = null;
    }

    if (remoteSavePromiseRef.current) {
      await remoteSavePromiseRef.current;
    }

    const dirtySubmissions = changedCockpitSubmissions(
      latestSubmissions,
      remoteSubmissionFingerprintsRef.current,
    );
    if (!dirtySubmissions.length) return;

    const savePromise = saveRemoteWorkspaceSnapshot(
      activeRemoteProfile,
      dirtySubmissions,
    );
    remoteSavePromiseRef.current = savePromise;
    try {
      await savePromise;
    } finally {
      if (remoteSavePromiseRef.current === savePromise) {
        remoteSavePromiseRef.current = null;
      }
    }
  }

  useEffect(() => {
    submissionsRef.current = submissions;
  }, [submissions]);

  useEffect(() => {
    if (isSupabaseMode) return;
    saveSubmissions(submissions);
  }, [isSupabaseMode, submissions]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapLocalDevSession() {
      if (isSupabaseMode) return;

      setAuthChecked(false);
      setWorkspaceAccessError("");
      try {
        const requestedWorkspaceEmail = loadWorkspaceEmail();
        const restoredSession = await authRepository.restoreSession();
        if (cancelled) return;

        if (
          restoredSession &&
          (!requestedWorkspaceEmail || requestedWorkspaceEmail === restoredSession.email)
        ) {
          setLocalAuthSession(restoredSession);
          setRole(restoredSession.role);
          setSurface(restoredSession.role === "admin" ? "admin-review" : "agent-actions");
          setWorkspaceEmail(restoredSession.email);
          setWorkspaceEmailDraft(restoredSession.email);
          saveWorkspaceEmail(restoredSession.email);
          if (restoredSession.role === "admin") {
            setPendingAccessRequests(
              await accessRequestRepository.listPendingAccessRequests(),
            );
          }
          return;
        }

        const bootstrapEmail = requestedWorkspaceEmail || fallbackAgentEmails[0];
        const bootstrapSession = await authRepository.loginApprovedUser(bootstrapEmail);
        if (cancelled) return;

        setLocalAuthSession(bootstrapSession);
        setRole(bootstrapSession.role);
        setSurface(
          bootstrapSession.role === "admin" ? "admin-review" : "agent-actions",
        );
        setWorkspaceEmail(bootstrapSession.email);
        setWorkspaceEmailDraft(bootstrapSession.email);
        saveWorkspaceEmail(bootstrapSession.email);
        if (bootstrapSession.role === "admin") {
          setPendingAccessRequests(
            await accessRequestRepository.listPendingAccessRequests(),
          );
        }
      } catch (error) {
        if (!cancelled) {
          setWorkspaceAccessError(
            error instanceof AuthAccessError
              ? error.message
              : "Не удалось восстановить local/dev сессию.",
          );
        }
      } finally {
        if (!cancelled) setAuthChecked(true);
      }
    }

    void bootstrapLocalDevSession();

    return () => {
      cancelled = true;
    };
  }, [isSupabaseMode]);

  useEffect(() => {
    let cancelled = false;

    async function bootstrapSupabaseSession() {
      if (!isSupabaseMode) return;

      setAuthChecked(false);
      setRemoteSaveState("loading");
      setWorkspaceAccessError("");
      try {
        const session = await getCurrentAppSession();
        if (cancelled) return;

        if (session) {
          const loaded = await loadCockpitSubmissionsForProfile(session.profile);
          if (cancelled) return;
          applyRemoteWorkspace(
            session.profile,
            loaded.submissions,
            loaded.ownerIdsBySubmissionId,
          );
        }
      } catch (error) {
        if (!cancelled) {
          setWorkspaceAccessError(
            formatPersistenceFailureForUser(
              error,
              "Не удалось загрузить текущую Supabase-сессию.",
            ),
          );
        }
      } finally {
        if (!cancelled) {
          setRemoteSaveState("idle");
          setAuthChecked(true);
        }
      }
    }

    void bootstrapSupabaseSession();

    return () => {
      cancelled = true;
    };
  }, [isSupabaseMode]);

  useEffect(() => {
    if (!isSupabaseMode || !remoteProfile || !authChecked) return;
    const activeRemoteProfile = remoteProfile;

    if (skipNextRemoteSaveRef.current) {
      skipNextRemoteSaveRef.current = false;
      return;
    }

    const dirtySubmissions = changedCockpitSubmissions(
      submissions,
      remoteSubmissionFingerprintsRef.current,
    );
    if (!dirtySubmissions.length) return;

    const timer = window.setTimeout(() => {
      remoteSaveTimerRef.current = null;
      const savePromise = saveRemoteWorkspaceSnapshot(
        activeRemoteProfile,
        dirtySubmissions,
      );
      remoteSavePromiseRef.current = savePromise;
      void savePromise
        .catch(() => undefined)
        .finally(() => {
          if (remoteSavePromiseRef.current === savePromise) {
            remoteSavePromiseRef.current = null;
          }
        });
    }, 500);
    remoteSaveTimerRef.current = timer;

    return () => {
      if (remoteSaveTimerRef.current === timer) {
        remoteSaveTimerRef.current = null;
      }
      window.clearTimeout(timer);
    };
  }, [authChecked, isSupabaseMode, remoteProfile, submissions]);

  useEffect(() => {
    if (drawerMode !== "closed") return;

    const visibleList =
      surface === "admin-review"
        ? reviewList
        : surface === "agent-submissions"
          ? agentList
          : [];

    if (visibleList.length === 0) return;
    if (visibleList.some((submission) => submission.id === selectedSubmissionId))
      return;
    setSelectedSubmissionId(visibleList[0].id);
  }, [
    agentList,
    drawerMode,
    reviewList,
    searchedReviewQueue,
    selectedSubmissionId,
    surface,
  ]);

  useEffect(() => {
    selectedExportIdsRef.current = selectedExportIds;
  }, [selectedExportIds]);

  useEffect(() => {
    const readyIds = new Set(readyList.map((submission) => submission.id));
    setSelectedExportIds((current) => {
      const next = current.filter((id) => readyIds.has(id));
      return next.length === current.length ? current : next;
    });
  }, [readyList]);

  useEffect(() => {
    if (drawerMode !== "closed" || confirmClose) return;

    const node = returnFocusRef.current;
    returnFocusRef.current = null;
    if (!node || !document.contains(node)) return;

    requestAnimationFrame(() => {
      node.focus({ preventScroll: true });
    });
  }, [confirmClose, drawerMode]);

  function rememberReturnFocus() {
    const activeElement = document.activeElement;
    returnFocusRef.current =
      activeElement instanceof HTMLElement ? activeElement : null;
  }

  function focusDrawerRecoveryTarget() {
    window.setTimeout(() => {
      const selector =
        drawerMode === "create"
          ? ".create-drawer [aria-label='Закрыть создание'], .create-drawer select, .create-drawer input, .create-drawer button"
          : ".submission-drawer [role='tab'][aria-selected='true'], .submission-drawer [aria-label='Закрыть подачу']";

      document.querySelector<HTMLElement>(selector)?.focus({ preventScroll: true });
    }, 120);
  }

  function requestSettingsLeave(action: () => void) {
    if (surface !== "settings" || !settingsDirty) {
      action();
      return;
    }

    pendingSettingsNavigationRef.current = action;
    setConfirmSettingsLeave(true);
  }

  function cancelSettingsLeave() {
    pendingSettingsNavigationRef.current = null;
    setConfirmSettingsLeave(false);
  }

  function confirmSettingsLeaveAndRun() {
    const pendingAction = pendingSettingsNavigationRef.current;
    pendingSettingsNavigationRef.current = null;
    setSettingsDraft(workspaceSettings);
    setSettingsSaveState("idle");
    setConfirmSettingsLeave(false);
    pendingAction?.();
  }

  function updateSettingsDraft(patch: Partial<WorkspaceSettings>) {
    setSettingsDraft((current) => ({ ...current, ...patch }));
    setSettingsSaveState("idle");
  }

  function saveSettingsDraft() {
    setWorkspaceSettings(settingsDraft);
    setSettingsSaveState("saved");
  }

  function resetSettingsDraft() {
    setSettingsDraft(workspaceSettings);
    setSettingsSaveState("idle");
  }

  function chooseRole(nextRole: Role) {
    if (isSupabaseMode) return;
    requestSettingsLeave(() => {
      setRole(nextRole);
      setDrawerMode("closed");
      setAgentQuestionnaireOpen(false);
      setDirty(false);
      if (nextRole === "agent") {
        setSurface("agent-actions");
        setAgentTab("action");
        setSelectedSubmissionId(
          firstSubmissionForRole(submissions, "agent", defaultLocalAgentOwnerId)?.id ??
            "",
        );
      } else {
        setSurface("admin-review");
        setReviewTab("review");
        const firstReview = reviewQueue(submissions)[0] ?? submissions[0];
        setSelectedSubmissionId(firstReview?.id ?? "");
      }
    });
  }

  function firstAgentSubmissionForTab(tab: AgentTab) {
    return (
      highestPriorityFirst(searchedAgentQueue.filter(matchesAgentTab(tab)))[0] ??
      searchedAgentQueue[0]
    );
  }

  function firstAgentActionSubmission() {
    return searchedOpenAgentActions[0]?.submission ?? searchedAgentQueue[0];
  }

  function firstReviewSubmissionForTab(tab: AdminWorkTab) {
    const nextReviewFilterTab = reviewTabForAdminWork(tab);

    return (
      (nextReviewFilterTab
        ? highestPriorityFirst(
            searchedReviewQueue.filter(matchesReviewTab(nextReviewFilterTab)),
          )[0]
        : searchedReviewQueue[0]) ?? searchedReviewQueue[0]
    );
  }

  function showAgentActions() {
    requestSettingsLeave(() => {
      setSurface("agent-actions");
      setAgentTab("action");
      setDrawerMode("closed");
      setAgentQuestionnaireOpen(false);
      const nextSubmission = firstAgentActionSubmission();
      if (nextSubmission) setSelectedSubmissionId(nextSubmission.id);
    });
  }

  function showAgentTab(tab: AgentTab) {
    requestSettingsLeave(() => {
      setSurface("agent-submissions");
      setAgentTab(tab);
      setDrawerMode("closed");
      setAgentQuestionnaireOpen(false);
      const nextSubmission = firstAgentSubmissionForTab(tab);
      if (nextSubmission) setSelectedSubmissionId(nextSubmission.id);
    });
  }

  function showReviewTab(tab: AdminWorkTab) {
    requestSettingsLeave(() => {
      setSurface("admin-review");
      setReviewTab(tab);
      setDrawerMode("closed");
      setAgentQuestionnaireOpen(false);
      const nextSubmission = firstReviewSubmissionForTab(tab);
      if (nextSubmission) setSelectedSubmissionId(nextSubmission.id);
    });
  }

  function showExportSurface() {
    requestSettingsLeave(() => {
      setSurface("export");
      setDrawerMode("closed");
      setAgentQuestionnaireOpen(false);
      const nextSubmission = readyList[0] ?? historyList[0];
      if (nextSubmission) setSelectedSubmissionId(nextSubmission.id);
    });
  }

  function showSettingsSurface() {
    requestSettingsLeave(() => {
      setSurface("settings");
      setDrawerMode("closed");
      setAgentQuestionnaireOpen(false);
    });
  }

  function openCreateSubmissionDrawer() {
    rememberReturnFocus();
    setDrawerMode("create");
    setAgentQuestionnaireOpen(false);
    setCreateType("family");
    setCreateFamilyCount(2);
    setCreateApplicantNames(["Новый заявитель", "Супруг", "Ребёнок 1", "Ребёнок 2"]);
    setDirty(false);
  }

  function openSubmission(
    submission: Submission,
    tab = defaultDrawerTab(submission),
    target?: WorkspaceTarget,
  ) {
    rememberReturnFocus();
    setSubmissionActionError(null);
    setSelectedSubmissionId(submission.id);
    setActiveDrawerTab(tab);
    setDrawerInitialTarget(target ?? null);
    setDrawerMode("detail");
    setAgentQuestionnaireOpen(false);
  }

  function selectSubmission(submission: Submission) {
    setSubmissionActionError(null);
    setSelectedSubmissionId(submission.id);
    setActiveDrawerTab(defaultDrawerTab(submission));
    setDrawerInitialTarget(null);
  }

  function openVisualSubmission(visualId: string, intent?: "detail" | "issues") {
    const exactSubmission = visibleSubmissionsForRole.find(
      (submission) => submission.id === visualId,
    );
    const fallbackSubmission =
      role === "admin"
        ? firstReviewSubmissionForTab(reviewTab) ?? activeSubmission
        : firstAgentActionSubmission() ?? activeSubmission;
    const targetSubmission = exactSubmission ?? fallbackSubmission;

    if (!targetSubmission) return;

    openSubmission(
      targetSubmission,
      intent === "issues"
        ? "issues"
        : role === "admin" && surface === "admin-review"
          ? "questionnaire"
          : defaultDrawerTab(targetSubmission),
    );
  }

  function openAgentQuestionnaireWorkspace() {
    const targetSubmission = activeSubmission ?? firstAgentActionSubmission();
    if (!targetSubmission) return;
    setSelectedSubmissionId(targetSubmission.id);
    setActiveDrawerTab("questionnaire");
    setDrawerMode("closed");
    setAgentQuestionnaireOpen(true);
  }

  function openIssueComposer(submission: Submission) {
    if (!canAddAdminIssue(submission, "admin")) {
      openSubmission(submission, "issues");
      return;
    }

    rememberReturnFocus();
    setSelectedSubmissionId(submission.id);
    setActiveDrawerTab("issues");
    setDrawerMode("detail");
    setIssueComposerRequest((current) => ({
      submissionId: submission.id,
      token: (current?.token ?? 0) + 1,
    }));
  }

  const closeDrawer = useCallback(() => {
    if (dirty) {
      setConfirmClose(true);
      return;
    }
    setSubmissionActionError(null);
    setDrawerInitialTarget(null);
    setDrawerMode("closed");
  }, [dirty]);

  useEffect(() => {
    if (drawerMode === "closed" || confirmClose || passportReviewRequest) return;

    function handleDrawerEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      closeDrawer();
    }

    document.addEventListener("keydown", handleDrawerEscape, true);
    return () => document.removeEventListener("keydown", handleDrawerEscape, true);
  }, [closeDrawer, confirmClose, drawerMode, passportReviewRequest]);

  function updateActiveSubmission(transform: (submission: Submission) => Submission) {
    if (!activeSubmission) return;
    setSubmissions((current) => {
      const next = current.map((submission) =>
        submission.id === activeSubmission.id ? transform(submission) : submission,
      );
      submissionsRef.current = next;
      return next;
    });
  }

  function setSubmissionUploadBusy(submissionId: string, busy: boolean) {
    setUploadingSubmissionIds((current) => {
      const next = new Set(current);
      if (busy) next.add(submissionId);
      else next.delete(submissionId);
      return next;
    });
  }

  function commitUploadedSubmissionAfterRemoteSave(
    savedSubmission: Submission,
    fileId: string,
    metadata: UploadedFileMetadata,
  ) {
    const { submissions: nextSubmissions } = mergeUploadedFileMetadataIntoSubmissions(
      submissionsRef.current,
      savedSubmission.id,
      fileId,
      metadata,
    );
    submissionsRef.current = nextSubmissions;
    remoteSubmissionFingerprintsRef.current = new Map(
      remoteSubmissionFingerprintsRef.current,
    );
    remoteSubmissionFingerprintsRef.current.set(
      savedSubmission.id,
      cockpitSubmissionFingerprint(savedSubmission),
    );
    setSubmissions(nextSubmissions);
  }

  function enqueueSupabaseMediaUpload(submissionId: string, job: () => Promise<void>) {
    const previous = uploadQueuesRef.current.get(submissionId) ?? Promise.resolve();
    setSubmissionUploadBusy(submissionId, true);

    const queued = previous.catch(() => undefined).then(job);
    uploadQueuesRef.current.set(submissionId, queued);

    void queued.finally(() => {
      if (uploadQueuesRef.current.get(submissionId) !== queued) return;
      uploadQueuesRef.current.delete(submissionId);
      setSubmissionUploadBusy(submissionId, false);
    });

    return queued;
  }

  function commitSubmissionAction(submission: Submission, action: SubmissionAction) {
    const currentSubmissions = submissionsRef.current;
    const currentSubmission =
      currentSubmissions.find((candidate) => candidate.id === submission.id) ??
      submission;
    const result = applyActionToSubmissionListResult(
      currentSubmissions,
      submission.id,
      action,
      role,
      remoteProfile?.id,
    );

    if (!result.ok) {
      setSubmissionActionError(
        createSubmissionActionErrorState({
          action,
          error: result.error,
          submission: currentSubmission,
        }),
      );
      return;
    }

    setSubmissionActionError(null);
    const nextSubmissions = result.data;
    submissionsRef.current = nextSubmissions;
    setSubmissions(nextSubmissions);
    const updated = nextSubmissions.find((candidate) => candidate.id === submission.id);
    if (updated) setActiveDrawerTab(defaultDrawerTab(updated));
  }

  function updateSubmission(action: SubmissionAction) {
    if (!activeSubmission) return;
    if (action === "open_history") {
      setSubmissionActionError(null);
      setActiveDrawerTab("history");
      return;
    }
    if (
      action === "generate_export" &&
      role === "admin" &&
      activeSubmission.status === "ready_for_export"
    ) {
      setSubmissionActionError(null);
      setSelectedSubmissionId(activeSubmission.id);
      setSelectedExportIds([activeSubmission.id]);
      selectedExportIdsRef.current = [activeSubmission.id];
      setSurface("export");
      setDrawerMode("closed");
      return;
    }
    if (requiresPassportExtractionReviewBeforeAction(activeSubmission, action)) {
      setSubmissionActionError(null);
      setPassportReviewRequest({ action, submissionId: activeSubmission.id });
      return;
    }

    commitSubmissionAction(activeSubmission, action);
  }

  function rememberLocalPassportFile(fileId: string, file: File) {
    localPassportFilesRef.current.set(fileId, file);
    setLocalPassportFileIds((current) =>
      current.includes(fileId) ? current : [...current, fileId],
    );
  }

  function passportSourceFingerprint(file: SubmissionFile, localFile?: File) {
    return [
      file.id,
      file.status,
      file.storageBucket ?? "",
      file.storagePath ?? "",
      file.uploadedAtIso ?? "",
      file.mimeType ?? "",
      file.sizeBytes ?? "",
      localFile?.name ?? "",
      localFile?.size ?? "",
      localFile?.lastModified ?? "",
    ].join("|");
  }

  function addAdminIssue(input: IssueInput) {
    updateActiveSubmission((submission) =>
      addPreciseAdminIssue(submission, input, remoteProfile?.id),
    );
    setActiveDrawerTab("issues");
    setDrawerMode("detail");
  }

  function markActiveIssueFixed(issueId: string) {
    if (!activeSubmission) return;
    const currentSubmission =
      submissionsRef.current.find(
        (submission) => submission.id === activeSubmission.id,
      ) ?? activeSubmission;
    const result = markSubmissionIssueFixedResult(
      currentSubmission,
      issueId,
      role,
    );
    if (!result.ok) {
      setSubmissionActionError(
        createSubmissionActionErrorState({
          action: "mark_issue_fixed",
          error: result.error,
          submission: currentSubmission,
        }),
      );
      setActiveDrawerTab("issues");
      setDrawerMode("detail");
      return;
    }

    updateActiveSubmission(() => result.data);
    setSubmissionActionError(null);
    setActiveDrawerTab("issues");
    setDrawerMode("detail");
  }

  function acceptAdminReviewFile(input: {
    applicantId: string;
    fileType: "passport_scan" | "selfie" | "selfie_2";
  }) {
    updateActiveSubmission((submission) =>
      markSubmissionFileAccepted(submission, {
        ...input,
        reviewedBy: remoteProfile?.id,
      }),
    );
  }

  async function performSupabaseMediaUpload(
    submissionId: string,
    fileId: string,
    selectedFile: File,
    activeRemoteProfile: AppProfile,
  ): Promise<Submission | null> {
    setRemoteSaveState("saving");
    setRemoteSaveError("");
    let uploadedStorageTarget: MediaStorageTarget | null = null;
    let previousStorageTarget: MediaStorageTarget | null = null;

    try {
      await drainRemoteSavesBeforeExport(activeRemoteProfile, submissionsRef.current);

      const latestSubmission = submissionsRef.current.find(
        (submission) => submission.id === submissionId,
      );
      if (!latestSubmission) {
        throw new Error("Submission no longer exists for this media upload.");
      }

      const targetFile = latestSubmission.files.find((file) => file.id === fileId);
      if (!targetFile) {
        throw new Error("Media slot no longer exists for this upload.");
      }
      if (
        targetFile.type === "passport_scan" &&
        !passportScanUploadMimeTypes.has(selectedFile.type)
      ) {
        throw new Error("Passport scan uploads accept only JPEG, PNG or PDF files.");
      }
      if (
        targetFile.status !== "missing" &&
        targetFile.status !== "needs_replacement"
      ) {
        setRemoteSaveState("idle");
        return null;
      }
      const applicant = latestSubmission.applicants.find(
        (item) => item.id === targetFile.applicantId,
      );
      if (!applicant) {
        throw new Error("Applicant no longer exists for this media upload.");
      }

      const uploadedAtIso = new Date().toISOString();
      const mediaSlotType = mediaSlotTypeForSubmissionFileType(targetFile.type);
      const generatedFileName = generatedCockpitMediaFileName({
        applicantId: applicant.id,
        fileType: targetFile.type,
        mimeType: selectedFile.type,
        submissionId: latestSubmission.id,
        uploadNonce: createMediaUploadNonce(uploadedAtIso),
      });
      const storageTarget = buildMediaStoragePath(
        latestSubmission.id,
        applicant.id,
        mediaSlotType,
        generatedFileName,
      );

      remoteOwnerIdsRef.current = await saveCockpitSubmissionsForProfile(
        activeRemoteProfile,
        [latestSubmission],
        remoteOwnerIdsRef.current,
      );
      const uploaded = await uploadMediaToStorage(storageTarget, selectedFile);
      if (!uploaded) {
        throw new Error("Supabase Storage upload did not return an object path.");
      }

      uploadedStorageTarget = storageTarget;
      if (
        targetFile.storageBucket === mediaStorageBucket &&
        targetFile.storagePath &&
        targetFile.storagePath !== uploaded.path
      ) {
        previousStorageTarget = {
          bucket: mediaStorageBucket,
          path: targetFile.storagePath,
        };
      }

      const uploadMetadata = {
        generatedFileName,
        mimeType: selectedFile.type,
        originalFileName: selectedFile.name,
        sizeBytes: selectedFile.size,
        storageBucket: mediaStorageBucket,
        storagePath: uploaded.path,
        uploadedAtIso,
      };
      const currentSubmission = submissionsRef.current.find(
        (submission) => submission.id === submissionId,
      );
      if (!currentSubmission) {
        throw new Error("Submission no longer exists after media upload.");
      }
      const updatedSubmission = applyUploadedFileMetadata(
        currentSubmission,
        fileId,
        uploadMetadata,
      );
      if (updatedSubmission === currentSubmission) {
        throw new Error("Media upload no longer applies to the current submission.");
      }

      remoteOwnerIdsRef.current = await saveCockpitSubmissionsForProfile(
        activeRemoteProfile,
        [updatedSubmission],
        remoteOwnerIdsRef.current,
      );
      uploadedStorageTarget = null;
      commitUploadedSubmissionAfterRemoteSave(
        updatedSubmission,
        fileId,
        uploadMetadata,
      );
      if (targetFile.type === "passport_scan") {
        rememberLocalPassportFile(fileId, selectedFile);
      }

      if (previousStorageTarget) {
        try {
          await deleteMediaFromStorage(previousStorageTarget);
        } catch (error) {
          setRemoteSaveState("error");
          setRemoteSaveError(
            formatPersistenceFailureForUser(
              error,
              "Новая загрузка сохранена, но старый приватный файл не удалён. Повторите проверку Storage перед пилотом.",
            ),
          );
          return null;
        }
      }
      setRemoteSaveState("idle");
      return updatedSubmission;
    } catch (error) {
      let cleanupFailed = false;
      if (uploadedStorageTarget) {
        try {
          await deleteMediaFromStorage(uploadedStorageTarget);
        } catch {
          cleanupFailed = true;
        }
      }
      setRemoteSaveState("error");
      const message = formatPersistenceFailureForUser(
        error,
        "Приватная загрузка не сохранена. Файл удалён из Storage, повторите попытку.",
      );
      setRemoteSaveError(
        cleanupFailed
          ? `${message} Загруженный файл не удалось удалить из Storage; нужна проверка оператора перед пилотом.`
          : message,
      );
      return null;
    }
  }

  async function uploadActiveFile(fileId: string, selectedFile?: File) {
    if (!activeSubmission) return;
    const targetFile = activeSubmission.files.find((file) => file.id === fileId);
    if (
      selectedFile &&
      targetFile?.type === "passport_scan" &&
      !passportScanUploadMimeTypes.has(selectedFile.type)
    ) {
      setRemoteSaveState("error");
      setRemoteSaveError("Загрузите паспорт в формате JPEG, PNG или PDF.");
      return;
    }

    if (isSupabaseMode) {
      if (!remoteProfile) {
        setRemoteSaveState("error");
        setRemoteSaveError("Сначала войдите в Supabase.");
        return;
      }
      if (!selectedFile) {
        setRemoteSaveState("error");
        setRemoteSaveError("Выберите файл для приватной загрузки.");
        return;
      }

      await enqueueSupabaseMediaUpload(activeSubmission.id, () =>
        performSupabaseMediaUpload(
          activeSubmission.id,
          fileId,
          selectedFile,
          remoteProfile,
        ).then(() => undefined),
      );
      setActiveDrawerTab("files");
      return;
    }

    if (selectedFile && targetFile?.type === "passport_scan") {
      rememberLocalPassportFile(fileId, selectedFile);
    }
    updateActiveSubmission((submission) =>
      uploadRequiredFile(
        submission,
        fileId,
        selectedFile
          ? {
              generatedFileName: selectedFile.name,
              mimeType: selectedFile.type,
              originalFileName: selectedFile.name,
              sizeBytes: selectedFile.size,
              storageBucket: "",
              storagePath: "",
              uploadedAtIso: new Date().toISOString(),
            }
          : undefined,
      ),
    );
    setActiveDrawerTab("files");
  }

  function updateSubmissionById(
    submissionId: string,
    transform: (submission: Submission) => Submission,
  ) {
    setSubmissions((current) => {
      const next = current.map((submission) =>
        submission.id === submissionId ? transform(submission) : submission,
      );
      submissionsRef.current = next;
      return next;
    });
  }

  async function extractPassportForSubmission(
    submissionId: string,
    fileId: string,
    applySafeFieldsAfter = false,
  ) {
    if (!passportExtractionEnabled || role !== "agent") return;

    const submission = submissionsRef.current.find(
      (candidate) => candidate.id === submissionId,
    );
    const file = submission?.files.find((candidate) => candidate.id === fileId);
    if (!submission || !file || file.type !== "passport_scan") return;
    const applicant = submission.applicants.find(
      (candidate) => candidate.id === file.applicantId,
    );
    if (!applicant || !canStartPassportExtraction(applicant)) return;

    const applicantIndex = submission.applicants.findIndex(
      (candidate) => candidate.id === file.applicantId,
    );
    const localFile = localPassportFilesRef.current.get(file.id);
    const requestedFingerprint = passportSourceFingerprint(file, localFile);
    const openAiFallbackAllowed =
      applicant.passportExtraction?.openaiAttemptedForFingerprint !==
      requestedFingerprint;
    updateSubmissionById(submission.id, (current) =>
      startPassportExtraction(current, file),
    );

    try {
      const result = await invokePassportExtraction({
        applicantIndex: applicantIndex >= 0 ? applicantIndex : undefined,
        file,
        localFile,
        openAiFallbackAllowed,
        submission,
      });
      updateSubmissionById(submission.id, (current) => {
        const latestFile = current.files.find((candidate) => candidate.id === fileId);
        if (!latestFile) return current;
        const latestLocalFile = localPassportFilesRef.current.get(latestFile.id);
        if (
          passportSourceFingerprint(latestFile, latestLocalFile) !==
          requestedFingerprint
        ) {
          return failPassportExtraction(
            current,
            latestFile,
            "Файл паспорта изменился во время распознавания. Запустите проверку снова.",
          );
        }
        const finished = finishPassportExtraction(
          current,
          latestFile,
          result,
          requestedFingerprint,
        );
        return applySafeFieldsAfter
          ? applySafePassportExtractionFields(finished, latestFile.applicantId)
          : finished;
      });
      if (selectedSubmissionId === submission.id) setActiveDrawerTab("questionnaire");
    } catch {
      updateSubmissionById(submission.id, (current) => {
        const latestFile = current.files.find((candidate) => candidate.id === fileId);
        return failPassportExtraction(
          current,
          latestFile ?? file,
          "Распознавание паспорта недоступно. Проверьте данные вручную.",
        );
      });
      if (selectedSubmissionId === submission.id) setActiveDrawerTab("files");
    }
  }

  async function extractPassportForActiveSubmission(fileId: string) {
    if (!selectedSubmissionId) return;
    await extractPassportForSubmission(selectedSubmissionId, fileId);
  }

  function applyPassportFieldForActiveSubmission(
    applicantId: string,
    key: Parameters<typeof applyPassportExtractionField>[2],
    mode: PassportFieldApplyMode,
  ) {
    updateActiveSubmission((submission) =>
      applyPassportExtractionField(submission, applicantId, key, mode),
    );
    setActiveDrawerTab("questionnaire");
  }

  function updateActiveQuestionnaireField(input: {
    applicantId: string;
    sectionId: string;
    fieldId: QuestionnaireField["id"];
    value: string;
  }) {
    updateActiveSubmission((submission) => updateQuestionnaireField(submission, input));
  }

  async function reviewVisaApplicationPdfForActiveSubmission(file: File) {
    if (!activeSubmission) return;
    const extracted = await extractPdfTextFromFile(file);
    const artifact = {
      extractedPageCount: extracted.extractedPageCount,
      extractionSource: extracted.source,
      fileName: extracted.fileName,
      mimeType: extracted.mimeType,
      ocrPageLimit: extracted.ocrPageLimit,
      parserVersion: extracted.parserVersion,
      sha256: extracted.sha256,
      sizeBytes: extracted.sizeBytes,
      uploadedBy: workspaceEmail || role,
    };

    if (isSupabaseMode) {
      if (!remoteProfile) {
        const message = "Сначала войдите в Supabase.";
        setRemoteSaveState("error");
        setRemoteSaveError(message);
        throw new Error(message);
      }

      setRemoteSaveState("saving");
      setRemoteSaveError("");
      let uploadedStorageTarget: MediaStorageTarget | null = null;

      try {
        await drainRemoteSavesBeforeExport(remoteProfile, submissionsRef.current);
        const latestSubmission = submissionsRef.current.find(
          (submission) => submission.id === activeSubmission.id,
        );
        if (!latestSubmission) {
          throw new Error("Submission no longer exists for this PDF review.");
        }

        const preview = applyVisaApplicationPdfReview(
          latestSubmission,
          extracted.text,
          { artifact },
        );
        const review = preview.visaApplicationPdfReview;
        const uploadedAtIso = new Date().toISOString();
        const storageTarget = buildVisaApplicationPdfStorageTarget({
          applicantId: review?.applicantId ?? "unmatched",
          nonce: createMediaUploadNonce(uploadedAtIso),
          sha256: extracted.sha256,
          submissionId: latestSubmission.id,
        });
        const uploadFile = normalizeVisaApplicationPdfUploadFile(file);
        const uploaded = await uploadMediaToStorage(storageTarget, uploadFile);
        if (!uploaded) {
          throw new Error("Supabase Storage upload did not return an object path.");
        }
        uploadedStorageTarget = storageTarget;

        const reviewedSubmission = applyVisaApplicationPdfReview(
          latestSubmission,
          extracted.text,
          {
            artifact: {
              ...artifact,
              storageBucket: mediaStorageBucket,
              storagePath: uploaded.path,
              uploadedAtIso,
            },
          },
        );
        remoteOwnerIdsRef.current = await saveCockpitSubmissionsForProfile(
          remoteProfile,
          [reviewedSubmission],
          remoteOwnerIdsRef.current,
        );

        uploadedStorageTarget = null;
        const nextSubmissions = submissionsRef.current.map((submission) =>
          submission.id === reviewedSubmission.id ? reviewedSubmission : submission,
        );
        submissionsRef.current = nextSubmissions;
        remoteSubmissionFingerprintsRef.current = new Map(
          remoteSubmissionFingerprintsRef.current,
        );
        remoteSubmissionFingerprintsRef.current.set(
          reviewedSubmission.id,
          cockpitSubmissionFingerprint(reviewedSubmission),
        );
        setSubmissions(nextSubmissions);
        setRemoteSaveState("idle");
        setActiveDrawerTab("files");
        return;
      } catch (error) {
        if (uploadedStorageTarget) {
          try {
            await deleteMediaFromStorage(uploadedStorageTarget);
          } catch {
            setRemoteSaveState("error");
            setRemoteSaveError(
              "PDF анкеты не сохранён в заявке, и загруженный файл не удалось удалить из Storage. Нужна проверка оператора.",
            );
            throw error;
          }
        }
        const message = formatPersistenceFailureForUser(
          error,
          "PDF анкеты не сохранён. Повторите загрузку.",
        );
        setRemoteSaveState("error");
        setRemoteSaveError(message);
        throw new Error(message);
      }
    }

    updateActiveSubmission((submission) =>
      applyVisaApplicationPdfReview(submission, extracted.text, {
        artifact,
      }),
    );
    setActiveDrawerTab("files");
  }

  function confirmVisaApplicationPdfReviewForActiveSubmission(reviewId: string) {
    if (!activeSubmission) return;
    updateActiveSubmission((submission) =>
      confirmVisaApplicationPdfManualReview(
        submission,
        reviewId,
        workspaceEmail || role,
      ),
    );
    setActiveDrawerTab("files");
  }

  async function publishReturnedPdfHandoffForActiveSubmission() {
    if (!activeSubmission) return;

    if (role !== "admin") {
      const message = "Только администратор может открыть комплект PDF агенту.";
      setRemoteSaveState("error");
      setRemoteSaveError(message);
      throw new Error(message);
    }

    const handoffPackage = buildAgentHandoffPackage(activeSubmission);
    if (!handoffPackage.ready) {
      const message = handoffPackage.blockers[0] ?? "Комплект PDF ещё не готов.";
      setRemoteSaveState("error");
      setRemoteSaveError(message);
      throw new Error(message);
    }

    if (!isSupabaseMode || !remoteProfile) {
      const message =
        "Сначала войдите в Supabase, чтобы открыть returned PDF комплект агенту.";
      setRemoteSaveState("error");
      setRemoteSaveError(message);
      throw new Error(message);
    }

    setRemoteSaveState("saving");
    setRemoteSaveError("");
    try {
      await drainRemoteSavesBeforeExport(remoteProfile, submissionsRef.current);
      const latestSubmission = submissionsRef.current.find(
        (submission) => submission.id === activeSubmission.id,
      );
      if (!latestSubmission) {
        throw new Error("Подача больше не найдена перед публикацией PDF комплекта.");
      }

      const latestHandoffPackage = buildAgentHandoffPackage(latestSubmission);
      if (!latestHandoffPackage.ready) {
        throw new Error(
          latestHandoffPackage.blockers[0] ?? "Комплект PDF больше не готов.",
        );
      }

      const published = await publishReturnedPdfAgentHandoff(latestSubmission.id);
      if (!published) {
        throw new Error("Supabase не вернул подтверждение публикации PDF комплекта.");
      }

      setRemoteSaveState("idle");
      setActiveDrawerTab("files");
    } catch (error) {
      const message =
        error && typeof error === "object" && "diagnostics" in error
          ? formatPersistenceFailureForUser(
              error,
              "Комплект PDF не опубликован агенту.",
            )
          : error instanceof Error
            ? error.message
            : "Комплект PDF не опубликован агенту.";
      setRemoteSaveState("error");
      setRemoteSaveError(message);
      throw new Error(message);
    }
  }

  function dismissVisaApplicationPdfReviewForActiveSubmission(reviewId: string) {
    if (!activeSubmission) return;
    updateActiveSubmission((submission) =>
      dismissVisaApplicationPdfReview(submission, reviewId, workspaceEmail || role),
    );
    setActiveDrawerTab("files");
  }

  function runAiReviewForActiveSubmission() {
    if (!activeSubmission) return;
    const reviewSurface =
      surface === "export" ? "export" : surface === "admin-review" ? "review" : "agent";
    if (!canRunAiReview(activeSubmission, role, reviewSurface)) return;
    updateActiveSubmission(runAiReview);
  }

  function acceptAiSuggestionForActiveSubmission(suggestionId: string) {
    if (!activeSubmission) return;
    updateActiveSubmission((submission) =>
      acceptAiSuggestionAsIssue(submission, suggestionId, role),
    );
    setActiveDrawerTab("issues");
  }

  function dismissAiSuggestionForActiveSubmission(suggestionId: string) {
    if (!activeSubmission) return;
    updateActiveSubmission((submission) =>
      dismissAiSuggestion(submission, suggestionId, role),
    );
  }

  function passportSlotForUpload(submission: Submission, upload: PassportUploadDraft) {
    if (upload.applicantIndex < 0 || upload.applicantIndex >= submission.applicants.length) {
      return null;
    }

    const applicant = submission.applicants[upload.applicantIndex];
    if (!applicant) return null;
    return (
      submission.files.find(
        (file) => file.applicantId === applicant.id && file.type === "passport_scan",
      ) ?? null
    );
  }

  function prepareInitialPassportUploads(
    submission: Submission,
    passportUploads: PassportUploadDraft[],
  ) {
    const uploadsWithFiles = passportUploads.filter((upload) => upload.file);
    if (!uploadsWithFiles.length) return submission;

    if (!isSupabaseMode) {
      return uploadsWithFiles.reduce((current, upload) => {
        const slot = passportSlotForUpload(current, upload);
        if (!slot || !upload.file) return current;
        rememberLocalPassportFile(slot.id, upload.file);
        const withUploadedFile = uploadRequiredFile(current, slot.id, {
          generatedFileName: upload.file.name,
          mimeType: upload.file.type,
          originalFileName: upload.file.name,
          sizeBytes: upload.file.size,
          storageBucket: "",
          storagePath: "",
          uploadedAtIso: new Date().toISOString(),
        });
        return applyInitialPassportExtraction(withUploadedFile, slot.id, upload);
      }, submission);
    }

    return submission;
  }

  function applyInitialPassportExtraction(
    submission: Submission,
    fileId: string,
    upload: PassportUploadDraft,
  ): Submission {
    if (!upload.extractedFields.length) return submission;

    const file = submission.files.find((candidate) => candidate.id === fileId);
    if (!file) return submission;

    const withExtraction = {
      ...submission,
      applicants: submission.applicants.map((applicant) =>
        applicant.id === file.applicantId
          ? {
              ...applicant,
              passportExtraction: {
                appliedFieldKeys: [],
                extractedFields: upload.extractedFields,
                sourceFileId: file.id,
                sourceFileName: upload.fileName,
                sourceStoragePath: file.storagePath,
                status: "ready" as const,
                summary:
                  "ФИО и поля MRZ распознаны при создании черновика. Проверьте их вручную.",
              },
            }
          : applicant,
      ),
    };
    return applySafePassportExtractionFields(withExtraction, file.applicantId);
  }

  function enqueueSupabaseInitialPassportUploads(
    submission: Submission,
    passportUploads: PassportUploadDraft[],
  ) {
    const uploadsWithFiles = passportUploads.filter((upload) => upload.file);
    if (!isSupabaseMode || !uploadsWithFiles.length) return;

    if (!remoteProfile) {
      setRemoteSaveState("error");
      setRemoteSaveError("Сначала войдите в Supabase, чтобы сохранить паспорта.");
      return;
    }

    for (const upload of uploadsWithFiles) {
      const selectedFile = upload.file;
      const slot = passportSlotForUpload(submission, upload);
      if (!slot || !selectedFile) continue;
      void enqueueSupabaseMediaUpload(submission.id, () =>
        performSupabaseMediaUpload(
          submission.id,
          slot.id,
          selectedFile,
          remoteProfile,
        ).then((updatedSubmission) => {
          if (updatedSubmission) {
            if (upload.extractedFields.length) {
              updateSubmissionById(updatedSubmission.id, (current) =>
                applyInitialPassportExtraction(current, slot.id, upload),
              );
              return;
            }
            void extractPassportForSubmission(updatedSubmission.id, slot.id, true);
          }
        }),
      );
    }
  }

  function extractInitialPassportUploads(
    submission: Submission,
    passportUploads: PassportUploadDraft[],
  ) {
    passportUploads.forEach((upload) => {
      const selectedFile = upload.file;
      const slot = passportSlotForUpload(submission, upload);
      if (!slot || !selectedFile) return;
      if (upload.extractedFields.length) return;
      rememberLocalPassportFile(slot.id, selectedFile);
      void extractPassportForSubmission(submission.id, slot.id, true);
    });
  }

  function createDraft(
    passportUploads: PassportUploadDraft[] = [],
    preliminaryIntake?: PreliminaryIntakeDraft,
  ) {
    const applicantNames = applicantNamesForCreateDraft({
      currentNames: createApplicantNames,
      familyCount: createFamilyCount,
      passportUploads,
      type: createType,
    });
    const newSubmission = createDraftSubmission({
      agentId: currentAgentOwnerId,
      applicantNames,
      city: createCity,
      familyCount: createFamilyCount,
      idScheme: isSupabaseMode ? "supabase" : "local",
      preliminaryIntake,
      submissions,
      type: createType,
    });
    const preparedSubmission = prepareInitialPassportUploads(
      newSubmission,
      passportUploads,
    );
    const nextSubmissions = [preparedSubmission, ...submissionsRef.current];
    submissionsRef.current = nextSubmissions;
    setSubmissions(nextSubmissions);
    enqueueSupabaseInitialPassportUploads(preparedSubmission, passportUploads);
    if (!isSupabaseMode) {
      extractInitialPassportUploads(preparedSubmission, passportUploads);
    }
    setSelectedSubmissionId(preparedSubmission.id);
    setDrawerMode("detail");
    setActiveDrawerTab(passportUploads.length ? "questionnaire" : "overview");
    setDirty(false);
  }

  function resolvePassportReviewRequest(mode: "verified" | "dismissed") {
    const request = passportReviewRequest;
    if (!request) return;

    const submission = submissionsRef.current.find(
      (candidate) => candidate.id === request.submissionId,
    );
    if (!submission) {
      setPassportReviewRequest(null);
      return;
    }

    const reviewedSubmission = markPassportExtractionReviewed(submission, mode);
    const reviewedSubmissions = submissionsRef.current.map((candidate) =>
      candidate.id === reviewedSubmission.id ? reviewedSubmission : candidate,
    );
    submissionsRef.current = reviewedSubmissions;
    setSubmissions(reviewedSubmissions);
    setPassportReviewRequest(null);
    commitSubmissionAction(reviewedSubmission, request.action);
  }

  function returnToPassportReviewFields() {
    const request = passportReviewRequest;
    setPassportReviewRequest(null);
    if (!request) return;
    setSelectedSubmissionId(request.submissionId);
    setDrawerMode("detail");
    setActiveDrawerTab("questionnaire");
  }

  function toggleExportSelection(id: string) {
    if (exportBusy) return;

    setSelectedExportIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  async function generateExport() {
    if (!exportPlan.canGenerate || exportBusy) return;

    setExportBusy(true);
    setExportError("");

    try {
      const { createExportWorkbookArtifact, verifyExportWorkbookArtifact } =
        await import("./modules/submissions/exportWorkbook");
      const initialSelectedIds = selectedExportIdsRef.current;
      const initialPlan = exportSummaryForSelectedIds(
        submissionsRef.current,
        initialSelectedIds,
      );
      if (!initialPlan.canGenerate) {
        setExportError("Выборка изменилась. Сформируйте файл заново.");
        return;
      }

      const identity =
        initialPlan.downloadPackageIdentity ??
        buildExportPackageIdentity(
          selectedReadySubmissionsForExport(submissionsRef.current, initialSelectedIds),
        );
      if (!identity) {
        setExportError("Пакет выгрузки пуст.");
        return;
      }

      const artifact = createExportWorkbookArtifact(initialPlan.rows, identity);
      const verified = await verifyExportWorkbookArtifact(artifact);
      if (!verified) {
        setExportError("Контракт Sheet1 A:BD не подтверждён.");
        return;
      }

      const currentSelectedIds = selectedExportIdsRef.current;
      const currentPlan = exportSummaryForSelectedIds(
        submissionsRef.current,
        currentSelectedIds,
      );
      if (!currentPlan.canGenerate) {
        setExportError("Выборка изменилась. Сформируйте файл заново.");
        return;
      }

      const currentIdentity =
        currentPlan.downloadPackageIdentity ??
        buildExportPackageIdentity(
          selectedReadySubmissionsForExport(submissionsRef.current, currentSelectedIds),
        );
      if (!exportPackageIdentityMatches(identity, currentIdentity)) {
        setExportError("Выборка изменилась. Сформируйте файл заново.");
        return;
      }

      setSubmissions((current) => {
        const next = applyExportStateToSelection(
          current,
          currentSelectedIds,
          "file_generated",
        );
        submissionsRef.current = next;
        return next;
      });
    } catch {
      setExportError("Не удалось сформировать и проверить Эксель.");
    } finally {
      setExportBusy(false);
    }
  }

  async function downloadExport() {
    if (!exportPlan.canDownload) return;

    try {
      const { default: downloadExportWorkbook } =
        await import("./modules/submissions/exportWorkbook");
      const currentSelectedIds = selectedExportIdsRef.current;
      const currentPlan = exportSummaryForSelectedIds(
        submissionsRef.current,
        currentSelectedIds,
      );
      if (!currentPlan.canDownload || !currentPlan.downloadPackageIdentity) {
        return setExportError("Выборка изменилась. Сформируйте файл заново.");
      }

      const result = downloadExportWorkbook(
        currentPlan.rows,
        currentPlan.downloadPackageIdentity,
      );
      if (!result.ok) {
        return setExportError(result.safeMessage);
      }
    } catch {
      return setExportError("Сбой.");
    }

    setSubmissions((current) => {
      const next = applyExportStateToSelection(
        current,
        selectedExportIdsRef.current,
        "file_downloaded",
      );
      submissionsRef.current = next;
      return next;
    });
  }

  async function markExported() {
    if (!exportPlan.canMarkExported || exportBusy) return;
    const selectedIds = new Set(selectedVisibleExportIds);
    const selectedSubmissions = submissions.filter((submission) =>
      selectedIds.has(submission.id),
    );

    setExportBusy(true);
    setExportError("");
    if (isSupabaseMode) {
      setRemoteSaveState("saving");
      setRemoteSaveError("");
    }

    try {
      if (isSupabaseMode && remoteProfile) {
        await drainRemoteSavesBeforeExport(remoteProfile, submissions);
      }

      const result = await completeExportPackage(selectedSubmissions, {
        createdAt: new Date().toISOString(),
        createdBy: remoteProfile?.id ?? "local-admin",
        format: "xlsx",
        persistExportedSubmissions:
          isSupabaseMode && remoteProfile
            ? async (exportedSubmissions) => {
                remoteOwnerIdsRef.current = await saveCockpitSubmissionsForProfile(
                  remoteProfile,
                  exportedSubmissions,
                  remoteOwnerIdsRef.current,
                );
                remoteSubmissionFingerprintsRef.current = new Map(
                  remoteSubmissionFingerprintsRef.current,
                );
                for (const submission of exportedSubmissions) {
                  remoteSubmissionFingerprintsRef.current.set(
                    submission.id,
                    cockpitSubmissionFingerprint(submission),
                  );
                }
              }
            : undefined,
      });

      if (result.status === "blocked") {
        setExportError(result.blockers[0] ?? "Выгрузка заблокирована.");
        if (isSupabaseMode) setRemoteSaveState("idle");
        return;
      }

      const exportedById = new Map(
        result.submissions.map((submission) => [submission.id, submission]),
      );
      setSubmissions((current) => {
        const next = current.map(
          (submission) => exportedById.get(submission.id) ?? submission,
        );
        submissionsRef.current = next;
        return next;
      });
      setSelectedExportIds([]);
      if (isSupabaseMode) setRemoteSaveState("idle");
    } catch (error) {
      const message = formatPersistenceFailureForUser(
        error,
        "Не удалось безопасно зафиксировать выгрузку. Повторите после синхронизации.",
      );
      setExportError(message);
      if (isSupabaseMode) {
        setRemoteSaveState("error");
        setRemoteSaveError(message);
      }
    } finally {
      setExportBusy(false);
    }
  }

  function applyRemoteWorkspace(
    profile: AppProfile,
    remoteSubmissions: Submission[],
    ownerIdsBySubmissionId: Map<string, string>,
  ) {
    const nextSubmissions = remoteSubmissions.map((submission) =>
      ensureSubmissionOwner(
        submission,
        ownerIdsBySubmissionId.get(submission.id) ?? profile.id,
      ),
    );
    const nextRole = profile.role;
    const firstSubmission = firstSubmissionForRole(
      nextSubmissions,
      nextRole,
      profile.id,
    );

    remoteOwnerIdsRef.current = ownerIdsBySubmissionId;
    remoteSubmissionFingerprintsRef.current =
      cockpitSubmissionFingerprintMap(nextSubmissions);
    submissionsRef.current = nextSubmissions;
    skipNextRemoteSaveRef.current = true;
    setRemoteProfile(profile);
    setRole(nextRole);
    setSurface(nextRole === "admin" ? "admin-review" : "agent-actions");
    setSubmissions(nextSubmissions);
    setSelectedSubmissionId(firstSubmission?.id ?? "");
    if (firstSubmission) setActiveDrawerTab(defaultDrawerTab(firstSubmission));
    setDrawerMode("closed");
    setDirty(false);
    setWorkspaceEmail(profile.email);
    setWorkspaceEmailDraft(profile.email);
    saveWorkspaceEmail(profile.email);
  }

  async function submitWorkspaceEmail(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const email = normalizeEmail(workspaceEmailDraft);

    if (isSupabaseMode) {
      if (!email || !workspacePasswordDraft) {
        setWorkspaceAccessError("Введите почту и пароль Supabase.");
        return;
      }

      setLoginBusy(true);
      setWorkspaceAccessError("");
      setWorkspaceAccessNotice("");
      try {
        const session = await signInSupabaseWithPassword(email, workspacePasswordDraft);
        const loaded = await loadCockpitSubmissionsForProfile(session.profile);
        applyRemoteWorkspace(
          session.profile,
          loaded.submissions,
          loaded.ownerIdsBySubmissionId,
        );
        setWorkspacePasswordDraft("");
      } catch (error) {
        setWorkspaceAccessError(
          formatPersistenceFailureForUser(
            error,
            "Не удалось войти. Проверьте почту, пароль и профиль Supabase.",
          ),
        );
      } finally {
        setLoginBusy(false);
        setAuthChecked(true);
      }
      return;
    }

    if (!email) {
      setWorkspaceAccessError("Введите рабочую почту.");
      return;
    }

    setLoginBusy(true);
    setWorkspaceAccessError("");
    setWorkspaceAccessNotice("");
    try {
      const session = await authRepository.loginApprovedUser(email);
      setLocalAuthSession(session);
      setWorkspaceEmail(session.email);
      setWorkspaceEmailDraft(session.email);
      saveWorkspaceEmail(session.email);
      chooseRole(session.role);
      if (session.role === "admin") {
        setPendingAccessRequests(
          await accessRequestRepository.listPendingAccessRequests(),
        );
      }
    } catch (error) {
      if (error instanceof AuthAccessError && error.code === "ACCESS_NOT_FOUND") {
        const request = await accessRequestRepository.submitAccessRequest(email);
        if (request.status === "pending") {
          setWorkspaceAccessNotice(
            "Заявка отправлена. Доступ появится после одобрения администратором.",
          );
          return;
        }
      }
      setWorkspaceAccessError(
        error instanceof AuthAccessError
          ? error.message
          : "Не удалось проверить local/dev доступ.",
      );
    } finally {
      setLoginBusy(false);
      setAuthChecked(true);
    }
  }

  async function resetWorkspaceEmail() {
    if (isSupabaseMode) {
      await signOutCurrentSession();
      remoteOwnerIdsRef.current = new Map();
      remoteSubmissionFingerprintsRef.current = new Map();
      setRemoteProfile(null);
      setWorkspacePasswordDraft("");
      setWorkspaceAccessError("");
      setWorkspaceAccessNotice("");
      const localSubmissions = loadSubmissions();
      submissionsRef.current = localSubmissions;
      setSubmissions(localSubmissions);
      setSelectedSubmissionId(
        firstSubmissionForRole(localSubmissions, "agent", defaultLocalAgentOwnerId)
          ?.id ?? "",
      );
      setRole("agent");
      setSurface("agent-actions");
      clearWorkspaceEmail();
      setWorkspaceEmail("");
      setWorkspaceEmailDraft("");
      return;
    }

    await authRepository.logout();
    setLocalAuthSession(null);
    setPendingAccessRequests([]);
    clearWorkspaceEmail();
    setWorkspaceEmail("");
    setWorkspaceEmailDraft("");
    setWorkspaceAccessError("");
    setWorkspaceAccessNotice("");
    chooseRole("agent");
  }

  async function approvePendingAccessRequest(requestId: string) {
    if (!localAuthSession || localAuthSession.role !== "admin") return;

    setLoginBusy(true);
    setWorkspaceAccessError("");
    try {
      await accessRequestRepository.approveAccessRequest(
        requestId,
        localAuthSession.userId,
      );
      setPendingAccessRequests(
        await accessRequestRepository.listPendingAccessRequests(),
      );
    } catch (error) {
      setWorkspaceAccessError(
        error instanceof AuthAccessError
          ? error.message
          : "Не удалось одобрить заявку.",
      );
    } finally {
      setLoginBusy(false);
    }
  }

  async function rejectPendingAccessRequest(requestId: string) {
    if (!localAuthSession || localAuthSession.role !== "admin") return;

    setLoginBusy(true);
    setWorkspaceAccessError("");
    try {
      await accessRequestRepository.rejectAccessRequest(
        requestId,
        localAuthSession.userId,
        "Отклонено администратором",
      );
      setPendingAccessRequests(
        await accessRequestRepository.listPendingAccessRequests(),
      );
    } catch (error) {
      setWorkspaceAccessError(
        error instanceof AuthAccessError
          ? error.message
          : "Не удалось отклонить заявку.",
      );
    } finally {
      setLoginBusy(false);
    }
  }

  const searchControl = (
    <SearchBar
      label="Поиск в текущем списке"
      placeholder="Подача, город или ID"
      value={query}
      onChange={setQuery}
    />
  );
  const agentSubmissionsSearchControl = (
    <SearchBar
      label="Поиск по подачам агента"
      placeholder="Подача, город или ID"
      value={query}
      onChange={setQuery}
    />
  );
  const adminReviewSearchControl = (
    <SearchBar
      label="Поиск в проверке"
      placeholder="Подача, город или ID"
      value={query}
      onChange={setQuery}
    />
  );
  const showMobileCreateDock = role === "agent" && surface === "agent-submissions";
  const mobileAwareOperationalNavItems = operationalNavItems.map((item) => ({
    ...item,
    onClick: () => {
      item.onClick();
      setMobileNavOpen(false);
    },
  }));
  const agentMobileNavItems: OperationalNavItem[] =
    role === "agent"
      ? operationalNavItems
          .filter((item) =>
            ["agent-actions", "agent-submissions", "agent-settings"].includes(
              item.id,
            ),
          )
          .map((item) => {
            if (item.id === "agent-settings") {
              return {
                ...item,
                label: "Настройки",
                meta: "профиль и настройки",
              };
            }

            return item;
          })
      : [];
  const mobileAgentNavItems = agentMobileNavItems.map((item) => ({
    ...item,
    onClick: () => {
      item.onClick();
      setMobileNavOpen(false);
    },
  }));

  if (!hasWorkspaceAccess) {
    return (
      <WorkspaceAccessGate
        busy={loginBusy || !authChecked}
        email={workspaceEmailDraft}
        error={workspaceAccessError}
        notice={workspaceAccessNotice}
        onEmail={setWorkspaceEmailDraft}
        onPassword={setWorkspacePasswordDraft}
        onSubmit={submitWorkspaceEmail}
        password={workspacePasswordDraft}
        requiresPassword={isSupabaseMode}
      />
    );
  }

  return (
    <main
      className={`ops-shell surface-${surface} ${
        isV19CollectionSurface ? "is-v19-collection-surface" : ""
      } role-${role} ${drawerMode !== "closed" ? "has-open-drawer" : ""} ${
        mobileNavOpen ? "is-mobile-nav-open" : ""
      }`}
      aria-label="Рабочая область подач"
    >
      <OperationalSidebar
        createAction={
          role === "agent" && !isFigmaVisualSurface
            ? {
                label: "Новая подача",
                onClick: () => {
                  openCreateSubmissionDrawer();
                  setMobileNavOpen(false);
                },
              }
            : undefined
        }
        items={mobileAwareOperationalNavItems}
        mobileTitle={
          role === "agent" &&
          (surface === "agent-actions" || surface === "agent-submissions")
            ? workspaceSurfaceTitle
            : undefined
        }
        footer={
          <>
            {showRoleSwitcher ? (
              <>
                {role === "agent" && isFigmaVisualSurface ? (
                  <Button
                    className="vf-figma-admin-zone"
                    aria-label="В админскую зону"
                    variant="secondary"
                    onClick={() => {
                      chooseRole("admin");
                      setMobileNavOpen(false);
                    }}
                  >
                    <svg aria-hidden="true" viewBox="0 0 24 24">
                      <path d="M7 7h10M7 7l3-3M7 7l3 3" />
                      <path d="M17 17H7m10 0-3-3m3 3-3 3" />
                    </svg>
                    В админскую зону
                  </Button>
                ) : null}
                <Button
                  className="ops-session"
                  aria-label="Сменить роль"
                  variant="ghost"
                  onClick={() => {
                    chooseRole(role === "agent" ? "admin" : "agent");
                    setMobileNavOpen(false);
                  }}
                >
                  <span>{role === "agent" ? agentInitials(defaultLocalAgentOwnerId) : "АД"}</span>
                  <div>
                    <strong>
                      {role === "agent"
                        ? agentDisplayName(defaultLocalAgentOwnerId)
                        : "Ирина Лебедева"}
                    </strong>
                    <small>
                      {role === "agent"
                        ? agentAgencyLabel(defaultLocalAgentOwnerId)
                        : "Админ"}
                    </small>
                  </div>
                  <svg className="ops-user-more" aria-hidden="true" viewBox="0 0 24 24">
                    <circle cx="5" cy="12" r="1" />
                    <circle cx="12" cy="12" r="1" />
                    <circle cx="19" cy="12" r="1" />
                  </svg>
                </Button>
              </>
            ) : (
              <Button
                className="ops-session"
                aria-label="Выйти из рабочей области"
                variant="ghost"
                onClick={resetWorkspaceEmail}
              >
                <span>{sessionInitials}</span>
                <div>
                  <strong>{sessionDisplayName}</strong>
                  <small>{sessionRoleLabel}</small>
                </div>
                <svg className="ops-user-more" aria-hidden="true" viewBox="0 0 24 24">
                  <circle cx="5" cy="12" r="1" />
                  <circle cx="12" cy="12" r="1" />
                  <circle cx="19" cy="12" r="1" />
                </svg>
              </Button>
            )}
          </>
        }
        onMobileClose={() => setMobileNavOpen(false)}
      />

      <section className="workspace">
        <header className="topbar">
          {isOperationalNavSurface ? (
            <button
              className="v19-topbar-menu"
              type="button"
              aria-label="Меню"
              aria-expanded={mobileNavOpen}
              onClick={() => setMobileNavOpen(true)}
            >
              <span aria-hidden="true" />
            </button>
          ) : null}
          <div className="topbar-heading">
            <h1>{workspaceSurfaceTitle}</h1>
            {surface !== "agent-actions" &&
            surface !== "agent-submissions" &&
            surface !== "export" ? (
              <p>{workspaceSurfaceDescription}</p>
            ) : null}
          </div>
          {isFigmaVisualSurface ? (
            <div className="topbar-actions vf-figma-topbar-actions">
              <Button
                className="v19-topbar-cta is-secondary"
                disabled
                title="Загрузка доступна через создание подачи"
                variant="secondary"
              >
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M12 16V4" />
                  <path d="m8 8 4-4 4 4" />
                  <path d="M20 16.5a4.5 4.5 0 0 1-4.5 4.5h-7A4.5 4.5 0 0 1 4 16.5" />
                </svg>
                Загрузить
              </Button>
              <Button
                className="v19-topbar-cta"
                variant="primary"
                onClick={role === "agent" ? openCreateSubmissionDrawer : undefined}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M12 5v14M5 12h14" />
                </svg>
                Создать пакет
              </Button>
            </div>
          ) : !isV19CollectionSurface || isSupabaseMode ? (
            <div className="topbar-actions">
              {!isV19CollectionSurface ? (
                <span className="service-logo">VisaFlow V-19</span>
              ) : null}
              {isSupabaseMode ? (
                <p
                  className="save-status"
                  role={remoteSaveState === "error" ? "alert" : "status"}
                >
                  {remoteSaveState === "saving"
                    ? "Сохранение"
                    : remoteSaveState === "error"
                      ? remoteSaveError
                      : "Supabase"}
                </p>
              ) : null}
            </div>
          ) : null}
        </header>

        {!isSupabaseMode && localAuthSession?.role === "admin" ? (
          <AdminAccessRequestQueue
            busy={loginBusy}
            requests={pendingAccessRequests}
            onApprove={(requestId) => void approvePendingAccessRequest(requestId)}
            onReject={(requestId) => void rejectPendingAccessRequest(requestId)}
          />
        ) : null}

        {emptyRemoteWorkspace ? (
          <RemoteWorkspaceEmptyState
            role={role}
            onCreate={role === "agent" ? openCreateSubmissionDrawer : undefined}
          />
        ) : surface === "agent-actions" ? (
          <FigmaActionQueueVisual
            submissions={visualActionSubmissions}
            onOpen={openVisualSubmission}
          />
        ) : surface === "agent-submissions" && activeSubmission ? (
          <AgentSubmissionsScreen
            activeTab={agentTab}
            agentList={agentList}
            hasSearchQuery={query.trim().length > 0}
            onCreate={openCreateSubmissionDrawer}
            onClearFilters={() => {
              setQuery("");
              setCityFilter("Все города");
            }}
            onOpen={openSubmission}
            onSelect={selectSubmission}
            onTab={showAgentTab}
            searchControl={agentSubmissionsSearchControl}
            visibleSubmission={visibleAgentSubmission}
            summary={summary}
          />
        ) : null}

        {surface === "admin-review" && activeSubmission ? (
          <AdminReviewScreen
            inboxEvents={searchedAdminInboxEvents}
            onAddIssue={openIssueComposer}
            onOpen={openSubmission}
            onSelect={selectSubmission}
            onTab={showReviewTab}
            reviewList={reviewList}
            reviewSource={searchedReviewQueue}
            reviewTab={reviewTab}
            searchControl={adminReviewSearchControl}
            visibleSubmission={visibleReviewSubmission}
          />
        ) : null}

        {surface === "export" ? (
          <ExportScreen
            exportPlan={exportPlan}
            exportTab={exportTab}
            exportBusy={exportBusy}
            exportError={exportError}
            historyList={historyList}
            onDownload={downloadExport}
            onGenerate={generateExport}
            onMarkExported={markExported}
            onOpen={openSubmission}
            onTab={setExportTab}
            onToggle={toggleExportSelection}
            readyList={readyList}
            searchControl={searchControl}
            selectedExportIds={selectedVisibleExportIds}
          />
        ) : null}

        {surface === "settings" ? (
          <Suspense fallback={<SettingsLoadingState />}>
            <SettingsScreen
              confirmLeave={confirmSettingsLeave}
              dirty={settingsDirty}
              email={workspaceEmail}
              isSupabaseMode={isSupabaseMode}
              role={role}
              saveState={settingsSaveState}
              settings={settingsDraft}
              onCancelLeave={cancelSettingsLeave}
              onConfirmLeave={confirmSettingsLeaveAndRun}
              onReset={resetSettingsDraft}
              onSave={saveSettingsDraft}
              onSettings={updateSettingsDraft}
              onSignOut={() => requestSettingsLeave(() => void resetWorkspaceEmail())}
            />
          </Suspense>
        ) : null}

        {showMobileCreateDock ? (
          <div className="mobile-create-dock">
            <Button
              aria-label="Новая подача"
              variant="primary"
              onClick={openCreateSubmissionDrawer}
            >
              Новая подача
            </Button>
          </div>
        ) : null}
      </section>

      {role === "agent" ? (
        <OperationalMobileTabBar items={mobileAgentNavItems} />
      ) : null}

      {agentQuestionnaireOpen && activeSubmission && role === "agent" ? (
        <FigmaQuestionnaireScreen
          onBack={() => setAgentQuestionnaireOpen(false)}
          submission={activeSubmission}
        />
      ) : null}

      {drawerMode === "detail" &&
      activeSubmission &&
      role === "agent" &&
      isFigmaVisualSurface ? (
        <FigmaSubmissionDrawer
          actionError={activeSubmissionActionError}
          activeTab={activeDrawerTab}
          onAction={updateSubmission}
          onClose={closeDrawer}
          onOpenQuestionnaireWorkspace={openAgentQuestionnaireWorkspace}
          role={role}
          surface="agent"
          submission={activeSubmission}
        />
      ) : null}

      {drawerMode === "detail" &&
      activeSubmission &&
      role !== "agent" &&
      surface === "admin-review" ? (
        <AdminReviewDrawer
          actionError={activeSubmissionActionError}
          activeTab={activeDrawerTab}
          onAction={updateSubmission}
          onAddIssue={addAdminIssue}
          onClose={closeDrawer}
          onReviewFileAccept={acceptAdminReviewFile}
          onTab={setActiveDrawerTab}
          submission={activeSubmission}
        />
      ) : drawerMode === "detail" &&
        activeSubmission &&
        !(role === "agent" && isFigmaVisualSurface) ? (
        <SubmissionDrawer
          actionError={activeSubmissionActionError}
          activeTab={activeDrawerTab}
          initialTarget={drawerInitialTarget}
          issueComposerRequest={issueComposerRequest}
          onIssueComposerConsumed={() => setIssueComposerRequest(null)}
          onAction={updateSubmission}
          onAddIssue={addAdminIssue}
          onAcceptAiSuggestion={acceptAiSuggestionForActiveSubmission}
          onClose={closeDrawer}
          onDismissAiSuggestion={dismissAiSuggestionForActiveSubmission}
          onMarkIssueFixed={markActiveIssueFixed}
          onApplyPassportField={applyPassportFieldForActiveSubmission}
          onExtractPassport={extractPassportForActiveSubmission}
          onConfirmVisaApplicationPdfReview={
            confirmVisaApplicationPdfReviewForActiveSubmission
          }
          onDismissVisaApplicationPdfReview={
            dismissVisaApplicationPdfReviewForActiveSubmission
          }
          onPublishReturnedPdfHandoff={publishReturnedPdfHandoffForActiveSubmission}
          onRunAiReview={runAiReviewForActiveSubmission}
          onTab={setActiveDrawerTab}
          onQuestionnaireField={updateActiveQuestionnaireField}
          onReviewVisaApplicationPdf={reviewVisaApplicationPdfForActiveSubmission}
          onUploadFile={uploadActiveFile}
          fileUploadBusy={uploadingSubmissionIds.has(activeSubmission.id)}
          localPassportFileIds={localPassportFileIds}
          passportExtractionEnabled={passportExtractionEnabled}
          requireSelectedFile={isSupabaseMode}
          role={role}
          surface={surface === "export" ? "export" : "agent"}
          submission={activeSubmission}
        />
      ) : null}

      {drawerMode === "create" ? (
        <Suspense fallback={null}>
          <CreateSubmissionDrawer
            applicantNames={createApplicantNames}
            city={createCity}
            dirty={dirty}
            familyCount={createFamilyCount}
            focusCloseToken={createCloseFocusToken}
            onApplicantName={(index, name) => {
              setCreateApplicantNames((current) => {
                const next = normalizeCreateApplicantNames(
                  current,
                  createFamilyCount,
                );
                next[index] = name;
                return next;
              });
              setDirty(true);
            }}
            onCity={(city) => {
              setCreateCity(city);
              setDirty(true);
            }}
            onClose={closeDrawer}
            onCreate={createDraft}
            onFamilyCount={(count) => {
              const safeCount = Math.max(2, Math.min(6, count || 2));
              setCreateFamilyCount(safeCount);
              setCreateApplicantNames((current) =>
                normalizeCreateApplicantNames(current, safeCount),
              );
              setDirty(true);
            }}
            onPassportFilesSelected={() => {
              setDirty(true);
            }}
            onType={(type) => {
              setCreateType(type);
              if (type === "single") {
                setCreateFamilyCount(2);
                setCreateApplicantNames((current) =>
                  normalizeCreateApplicantNames(current, 1),
                );
              } else {
                setCreateApplicantNames((current) =>
                  normalizeCreateApplicantNames(current, createFamilyCount),
                );
              }
              setDirty(true);
            }}
            type={createType}
          />
        </Suspense>
      ) : null}

      {passportReviewRequest ? (
        <PassportExtractionReviewDialog
          onCancel={returnToPassportReviewFields}
          onDismiss={() => resolvePassportReviewRequest("dismissed")}
          onVerified={() => resolvePassportReviewRequest("verified")}
        />
      ) : null}

      {confirmClose ? (
        <ConfirmationDialog
          onCancel={() => {
            setConfirmClose(false);
            if (drawerMode === "create") {
              setCreateCloseFocusToken((token) => token + 1);
              return;
            }
            focusDrawerRecoveryTarget();
          }}
          onConfirm={() => {
            setConfirmClose(false);
            setDirty(false);
            setDrawerMode("closed");
          }}
        />
      ) : null}
    </main>
  );
}

function App() {
  return <MainApp />;
}

function PassportExtractionReviewDialog({
  onCancel,
  onDismiss,
  onVerified,
}: {
  onCancel: () => void;
  onDismiss: () => void;
  onVerified: () => void;
}) {
  const verifyButtonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    verifyButtonRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="modal-backdrop" role="presentation">
      <section
        className="confirmation-dialog passport-review-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="passport-review-title"
        onKeyDown={(event) => {
          if (event.key !== "Escape") return;
          event.stopPropagation();
          onCancel();
        }}
      >
        <p className="kicker">Паспортные данные</p>
        <h2 id="passport-review-title">Проверить распознанные поля?</h2>
        <p>
          Помощник подготовил данные из паспорта. Перед отправкой администратору агент
          может один раз сверить их вручную или явно отправить без этой проверки.
        </p>
        <div className="dialog-actions">
          <Button variant="secondary" onClick={onCancel}>
            Открыть поля
          </Button>
          <Button danger onClick={onDismiss}>
            Отправить без проверки
          </Button>
          <Button ref={verifyButtonRef} onClick={onVerified}>
            Проверил, отправить
          </Button>
        </div>
      </section>
    </div>
  );
}

function WorkspaceAccessGate({
  busy = false,
  email,
  error,
  notice,
  onEmail,
  onPassword,
  onSubmit,
  password = "",
  requiresPassword = false,
}: {
  busy?: boolean;
  email: string;
  error: string;
  notice?: string;
  onEmail: (email: string) => void;
  onPassword?: (password: string) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  password?: string;
  requiresPassword?: boolean;
}) {
  return (
    <main className="access-shell" aria-label="Вход в рабочий кабинет">
      <section
        className="access-card"
        aria-labelledby="workspace-access-title"
        aria-describedby="workspace-access-copy"
      >
        <div className="access-card-header">
          <div>
            <h1 id="workspace-access-title">Вход в рабочий кабинет</h1>
          </div>
          <span className="access-badge">Закрытый доступ</span>
        </div>
        <p className="access-intro" id="workspace-access-copy">
          {requiresPassword
            ? "Войдите через Supabase Auth, чтобы открыть рабочий стол по роли профиля."
            : "Введите рабочую почту. Если доступа ещё нет, будет создана заявка на одобрение администратором."}
        </p>
        <form onSubmit={onSubmit}>
          <label>
            <span>Рабочая почта</span>
            <input
              aria-describedby="workspace-access-note"
              autoComplete="email"
              id="workspace-email"
              inputMode="email"
              name="email"
              placeholder="name@visaflow.local"
              type="email"
              value={email}
              onChange={(event) => onEmail(event.target.value)}
            />
          </label>
          {requiresPassword ? (
            <label>
              <span>Пароль</span>
              <input
                autoComplete="current-password"
                id="workspace-password"
                name="password"
                placeholder="Пароль Supabase"
                type="password"
                value={password}
                onChange={(event) => onPassword?.(event.target.value)}
              />
            </label>
          ) : null}
          {error ? (
            <p className="access-error" role="alert">
              {error}
            </p>
          ) : notice ? (
            <p className="access-note" id="workspace-access-note" role="status">
              {notice}
            </p>
          ) : (
            <p className="access-note" id="workspace-access-note">
              {busy
                ? "Проверяем текущую сессию."
                : requiresPassword
                  ? "Вход идёт через Supabase Auth. Самостоятельная регистрация отключена."
                  : "Pending и rejected email не открывают агентский кабинет."}
            </p>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? "Проверяем" : requiresPassword ? "Войти" : "Продолжить"}
          </Button>
        </form>
      </section>
    </main>
  );
}

function AdminAccessRequestQueue({
  busy,
  requests,
  onApprove,
  onReject,
}: {
  busy: boolean;
  requests: AccessRequest[];
  onApprove: (requestId: string) => void;
  onReject: (requestId: string) => void;
}) {
  return (
    <section
      className="access-queue-panel"
      aria-labelledby="access-queue-title"
      data-testid="admin-access-queue"
    >
      <div className="access-queue-head">
        <div>
          <p className="kicker">local/dev auth</p>
          <h2 id="access-queue-title">Заявки на доступ</h2>
        </div>
        <span>{requests.length}</span>
      </div>
      {requests.length ? (
        <div className="access-queue-list">
          {requests.map((request) => (
            <article className="access-queue-row" key={request.id}>
              <div>
                <strong>{request.email}</strong>
                <small>Роль: agent · статус: pending</small>
              </div>
              <div className="access-queue-actions">
                <Button
                  disabled={busy}
                  variant="secondary"
                  onClick={() => onReject(request.id)}
                >
                  Отклонить
                </Button>
                <Button disabled={busy} onClick={() => onApprove(request.id)}>
                  Одобрить
                </Button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="access-queue-empty">Новых заявок нет.</p>
      )}
    </section>
  );
}

function SettingsLoadingState() {
  return (
    <section
      className="workspace-empty-state"
      role="status"
      aria-live="polite"
      aria-labelledby="settings-loading-title"
    >
      <p className="kicker">Рабочее место</p>
      <h2 id="settings-loading-title">Настройки загружаются</h2>
      <p>Подготавливаем локальные параметры роли, доступа и рабочего режима.</p>
    </section>
  );
}

function RemoteWorkspaceEmptyState({
  onCreate,
  role,
}: {
  onCreate?: () => void;
  role: Role;
}) {
  return (
    <section className="workspace-empty-state" aria-labelledby="workspace-empty-title">
      <p className="kicker">Supabase workspace</p>
      <h2 id="workspace-empty-title">В этой рабочей области пока нет подач</h2>
      <p>
        {role === "agent"
          ? "Создайте первую подачу: она будет сохранена в вашем Supabase-профиле без подмешивания локальных демо-данных."
          : "Администратор увидит реальные подачи после того, как агент создаст или отправит их на проверку."}
      </p>
      {onCreate ? <Button onClick={onCreate}>Новая подача</Button> : null}
    </section>
  );
}

export default App;
