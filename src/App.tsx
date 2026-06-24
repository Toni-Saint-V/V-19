import {
  type FormEvent,
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { supabaseRuntimeConfig } from "./lib/supabase/config";
import { Button, SearchBar, Select } from "./shared/ui/primitives";
import {
  acceptAiSuggestionAsIssue,
  canRunAiReview,
  dismissAiSuggestion,
  runAiReview,
} from "./modules/submissions/aiSuggestions";
import {
  adminActionQueue,
  adminInboxEvents,
  agentActionQueue,
  searchAgentActions,
} from "./modules/submissions/agentActions";
import { exportSummary } from "./modules/submissions/exportRules";
import { loadSubmissions, saveSubmissions } from "./modules/submissions/persistence";
import {
  defaultLocalAgentOwnerId,
  ensureSubmissionOwner,
} from "./modules/submissions/ownership";
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
  applyUploadedFileMetadata,
  applyActionToSubmissionList,
  applyExportStateToSelection,
  createDraftSubmission,
  generatedCockpitMediaFileName,
  mergeUploadedFileMetadataIntoSubmissions,
  mediaSlotTypeForSubmissionFileType,
  updateQuestionnaireField,
  type UploadedFileMetadata,
  uploadRequiredFile,
} from "./modules/submissions/submissionActions";
import { completeExportPackage } from "./modules/submissions/exportWorkflow";
import { canAddAdminIssue, defaultDrawerTab } from "./modules/submissions/status";
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
  OperationalSidebar,
  type OperationalNavItem,
} from "./modules/submissions/components/OperationalNavigation";
import { ConfirmationDialog } from "./modules/submissions/components/Primitives";
import { SubmissionDrawer } from "./modules/submissions/components/SubmissionDrawer";
import {
  AdminReviewScreen,
  AgentActionsScreen,
  AgentInboxScreen,
  AgentSubmissionsScreen,
  ExportScreen,
} from "./modules/submissions/pages/OperationsScreens";
import type { WorkspaceTarget } from "./modules/submissions/workspaceModel";
import { CANONICAL_CITIES, isCity } from "./modules/submissions/types";
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
  signUpSupabaseAgentWithPassword,
  signOutCurrentSession,
} from "./services/authService";
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
import type { AppProfile } from "./types/session";

const SettingsScreen = lazy(() => import("./modules/submissions/pages/SettingsScreen"));
const CreateSubmissionDrawer = lazy(() =>
  import("./modules/submissions/components/CreateSubmissionDrawer").then((module) => ({
    default: module.CreateSubmissionDrawer,
  })),
);

const cities: Array<City | "Все города"> = ["Все города", ...CANONICAL_CITIES];
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
const agentEmails = parseWorkspaceEmails(
  import.meta.env.VITE_AGENT_EMAILS,
  fallbackAgentEmails,
);

function normalizeEmail(email: string) {
  return email.trim().toLowerCase();
}

function resolveWorkspaceRole(email: string): Role | null {
  const normalized = normalizeEmail(email);
  if (adminEmails.includes(normalized)) return "admin";
  if (agentEmails.includes(normalized)) return "agent";
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
  const [workspaceAuthMode, setWorkspaceAuthMode] = useState<"sign-in" | "sign-up">(
    "sign-in",
  );
  const [workspaceNameDraft, setWorkspaceNameDraft] = useState("");
  const [workspaceOrganizationDraft, setWorkspaceOrganizationDraft] = useState("");
  const [workspaceAccessError, setWorkspaceAccessError] = useState("");
  const [authChecked, setAuthChecked] = useState(!isSupabaseMode);
  const [loginBusy, setLoginBusy] = useState(false);
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
    initialWorkspaceRole === "admin" ? "admin-review" : "agent-inbox",
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
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [createCloseFocusToken, setCreateCloseFocusToken] = useState(0);
  const [query, setQuery] = useState("");
  const [cityFilter, setCityFilter] = useState<City | "Все города">("Все города");
  const [agentTab, setAgentTab] = useState<AgentTab>("action");
  const [reviewTab, setReviewTab] = useState<ReviewTab>("review");
  const [exportTab, setExportTab] = useState<ExportTab>("ready");
  const [selectedExportIds, setSelectedExportIds] = useState<string[]>(["ПД-1056"]);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState("");
  const [issueComposerRequest, setIssueComposerRequest] =
    useState<IssueComposerRequest | null>(null);
  const [passportReviewRequest, setPassportReviewRequest] =
    useState<PassportReviewRequest | null>(null);
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
  const agentActions = useMemo(
    () => agentActionQueue(agentActionSource),
    [agentActionSource],
  );
  const searchedOpenAgentActions = useMemo(
    () => searchAgentActions(agentActions.open, query),
    [agentActions.open, query],
  );
  const searchedCompletedAgentActions = useMemo(
    () => searchAgentActions(agentActions.completed, query),
    [agentActions.completed, query],
  );
  const searchedReviewQueue = useMemo(
    () => searchSubmissions(reviewQueue(submissions), query, cityFilter),
    [cityFilter, query, submissions],
  );
  const searchedAdminOperationalQueue = useMemo(
    () => searchSubmissions(submissions, query, cityFilter),
    [cityFilter, query, submissions],
  );
  const adminActions = useMemo(
    () => adminActionQueue(searchedAdminOperationalQueue),
    [searchedAdminOperationalQueue],
  );
  const searchedOpenAdminActions = useMemo(
    () => searchAgentActions(adminActions.open, query),
    [adminActions.open, query],
  );
  const searchedCompletedAdminActions = useMemo(
    () => searchAgentActions(adminActions.completed, query),
    [adminActions.completed, query],
  );
  const searchedAdminInboxEvents = useMemo(
    () => adminInboxEvents(searchedReviewQueue),
    [searchedReviewQueue],
  );
  const agentList = highestPriorityFirst(
    searchedAgentQueue.filter(matchesAgentTab(agentTab)),
  );
  const reviewList = highestPriorityFirst(
    searchedReviewQueue.filter(matchesReviewTab(reviewTab)),
  );
  const visibleAgentSubmission =
    agentList.find((submission) => submission.id === selectedSubmissionId) ??
    agentList[0] ??
    null;
  const visibleReviewSubmission =
    reviewList.find((submission) => submission.id === selectedSubmissionId) ??
    reviewList[0] ??
    null;
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
    (import.meta.env.DEV || import.meta.env.VITE_ENABLE_ROLE_SWITCH === "true");
  const isV19CollectionSurface =
    surface === "agent-inbox" ||
    surface === "agent-actions" ||
    surface === "agent-submissions" ||
    surface === "admin-inbox" ||
    surface === "admin-actions" ||
    surface === "admin-review";
  const agentInboxUnreadCount = Math.min(3, searchedAgentQueue.length);
  const resolvedWorkspaceRole = resolveWorkspaceRole(workspaceEmail);
  const hasWorkspaceAccess = isSupabaseMode
    ? Boolean(remoteProfile)
    : showRoleSwitcher || Boolean(resolvedWorkspaceRole);
  const emptyRemoteWorkspace =
    isSupabaseMode && Boolean(remoteProfile) && authChecked && submissions.length === 0;
  const sessionDisplayName =
    isSupabaseMode && remoteProfile
      ? remoteProfile.displayName || remoteProfile.email
      : role === "agent"
        ? "Татьяна Новикова"
        : "Ирина Лебедева";
  const sessionInitials =
    isSupabaseMode && remoteProfile
      ? remoteProfile.role === "admin"
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
      : `${role === "agent" ? "Агент" : "Админ"} · VisaFlow Operations`;
  const operationalNavItems: OperationalNavItem[] =
    role === "agent"
      ? [
          {
            active: surface === "agent-inbox",
            count: agentInboxUnreadCount,
            icon: "В",
            id: "agent-inbox",
            label: "Входящие",
            meta: "новые события",
            onClick: showAgentInbox,
            tone: agentInboxUnreadCount > 0 ? "danger" : "default",
          },
          {
            active: surface === "agent-actions",
            count: agentActions.summary.open,
            icon: "Д",
            id: "agent-actions",
            label: "Мои действия",
            meta: "точные шаги",
            onClick: showAgentActions,
            tone: agentActions.summary.open > 0 ? "warning" : "default",
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
            count: searchedReviewQueue.length,
            icon: "П",
            id: "admin-work",
            label: "Работа",
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
        : surface === "admin-inbox" || surface === "admin-actions"
          ? searchedAdminOperationalQueue
          : surface === "agent-submissions" || surface === "agent-inbox"
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
    searchedAdminOperationalQueue,
    searchedReviewQueue,
    selectedSubmissionId,
    surface,
  ]);

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
      setDirty(false);
      if (nextRole === "agent") {
        setSurface("agent-inbox");
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

  function firstReviewSubmissionForTab(tab: ReviewTab) {
    return (
      highestPriorityFirst(searchedReviewQueue.filter(matchesReviewTab(tab)))[0] ??
      searchedReviewQueue[0]
    );
  }

  function showAgentInbox() {
    requestSettingsLeave(() => {
      setSurface("agent-inbox");
      setDrawerMode("closed");
      const nextSubmission =
        firstAgentSubmissionForTab("action") ?? searchedAgentQueue[0];
      if (nextSubmission) setSelectedSubmissionId(nextSubmission.id);
    });
  }

  function showAgentActions() {
    requestSettingsLeave(() => {
      setSurface("agent-actions");
      setDrawerMode("closed");
      const nextSubmission = firstAgentActionSubmission();
      if (nextSubmission) setSelectedSubmissionId(nextSubmission.id);
    });
  }

  function showAgentTab(tab: AgentTab) {
    requestSettingsLeave(() => {
      setSurface("agent-submissions");
      setAgentTab(tab);
      setDrawerMode("closed");
      const nextSubmission = firstAgentSubmissionForTab(tab);
      if (nextSubmission) setSelectedSubmissionId(nextSubmission.id);
    });
  }

  function showReviewTab(tab: ReviewTab) {
    requestSettingsLeave(() => {
      setSurface("admin-review");
      setReviewTab(tab);
      setDrawerMode("closed");
      const nextSubmission = firstReviewSubmissionForTab(tab);
      if (nextSubmission) setSelectedSubmissionId(nextSubmission.id);
    });
  }

  function showExportSurface() {
    requestSettingsLeave(() => {
      setSurface("export");
      setDrawerMode("closed");
      const nextSubmission = readyList[0] ?? historyList[0];
      if (nextSubmission) setSelectedSubmissionId(nextSubmission.id);
    });
  }

  function showSettingsSurface() {
    setSurface("settings");
    setDrawerMode("closed");
  }

  function openCreateSubmissionDrawer() {
    rememberReturnFocus();
    setDrawerMode("create");
    setCreateType("single");
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
    setSelectedSubmissionId(submission.id);
    setActiveDrawerTab(tab);
    setDrawerInitialTarget(target ?? null);
    setDrawerMode("detail");
  }

  function selectSubmission(submission: Submission) {
    setSelectedSubmissionId(submission.id);
    setActiveDrawerTab(defaultDrawerTab(submission));
    setDrawerInitialTarget(null);
  }

  function closeDrawer() {
    if (dirty) {
      setConfirmClose(true);
      return;
    }
    setDrawerInitialTarget(null);
    setDrawerMode("closed");
  }

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
    const nextSubmissions = applyActionToSubmissionList(
      submissionsRef.current,
      submission.id,
      action,
      role,
      remoteProfile?.id,
    );
    submissionsRef.current = nextSubmissions;
    setSubmissions(nextSubmissions);
    const updated = nextSubmissions.find((candidate) => candidate.id === submission.id);
    if (updated) setActiveDrawerTab(defaultDrawerTab(updated));
  }

  function updateSubmission(action: SubmissionAction) {
    if (!activeSubmission) return;
    if (requiresPassportExtractionReviewBeforeAction(activeSubmission, action)) {
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

  function addAdminIssue(input: IssueInput) {
    updateActiveSubmission((submission) =>
      addPreciseAdminIssue(submission, input, remoteProfile?.id),
    );
    setActiveDrawerTab("issues");
    setDrawerMode("detail");
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
      confirmVisaApplicationPdfManualReview(submission, reviewId, workspaceEmail || role),
    );
    setActiveDrawerTab("files");
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
    const applicant =
      submission.applicants[
        Math.min(upload.applicantIndex, submission.applicants.length - 1)
      ];
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
    setSelectedExportIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function generateExport() {
    if (!exportPlan.canGenerate) return;
    setSubmissions((current) => {
      const next = applyExportStateToSelection(
        current,
        selectedVisibleExportIds,
        "file_generated",
      );
      submissionsRef.current = next;
      return next;
    });
  }

  async function downloadExport() {
    if (!exportPlan.canDownload) return;

    try {
      const { default: downloadExportWorkbook } =
        await import("./modules/submissions/exportWorkbook");
      const result = downloadExportWorkbook(
        exportPlan.rows,
        exportPlan.downloadPackageIdentity,
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
        selectedVisibleExportIds,
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
    setSurface(nextRole === "admin" ? "admin-review" : "agent-inbox");
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
      if (workspaceAuthMode === "sign-up" && !workspaceNameDraft.trim()) {
        setWorkspaceAccessError("Введите имя для Supabase-профиля.");
        return;
      }

      setLoginBusy(true);
      setWorkspaceAccessError("");
      try {
        const signUpResult =
          workspaceAuthMode === "sign-up"
            ? await signUpSupabaseAgentWithPassword({
                displayName: workspaceNameDraft,
                email,
                organizationName: workspaceOrganizationDraft,
                password: workspacePasswordDraft,
              })
            : null;
        if (signUpResult?.status === "confirmation_required") {
          setWorkspaceAccessError(
            "Проверьте почту и подтвердите Supabase-регистрацию, затем войдите.",
          );
          setWorkspaceAuthMode("sign-in");
          setWorkspacePasswordDraft("");
          return;
        }
        const session =
          signUpResult?.status === "authenticated"
            ? signUpResult.session
            : await signInSupabaseWithPassword(email, workspacePasswordDraft);
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
            workspaceAuthMode === "sign-up"
              ? "Не удалось зарегистрироваться. Проверьте почту, пароль и Supabase profile policy."
              : "Не удалось войти. Проверьте почту, пароль и профиль Supabase.",
          ),
        );
      } finally {
        setLoginBusy(false);
        setAuthChecked(true);
      }
      return;
    }

    const nextRole = resolveWorkspaceRole(email);

    if (!email || !nextRole) {
      setWorkspaceAccessError("Почта не найдена в списке доступа.");
      return;
    }

    setWorkspaceAccessError("");
    setWorkspaceEmail(email);
    saveWorkspaceEmail(email);
    chooseRole(nextRole);
  }

  async function resetWorkspaceEmail() {
    if (isSupabaseMode) {
      await signOutCurrentSession();
      remoteOwnerIdsRef.current = new Map();
      remoteSubmissionFingerprintsRef.current = new Map();
      setRemoteProfile(null);
      setWorkspacePasswordDraft("");
      setWorkspaceNameDraft("");
      setWorkspaceOrganizationDraft("");
      setWorkspaceAuthMode("sign-in");
      setWorkspaceAccessError("");
      const localSubmissions = loadSubmissions();
      submissionsRef.current = localSubmissions;
      setSubmissions(localSubmissions);
      setSelectedSubmissionId(
        firstSubmissionForRole(localSubmissions, "agent", defaultLocalAgentOwnerId)
          ?.id ?? "",
      );
      setRole("agent");
      setSurface("agent-inbox");
      clearWorkspaceEmail();
      setWorkspaceEmail("");
      setWorkspaceEmailDraft("");
      return;
    }

    clearWorkspaceEmail();
    setWorkspaceEmail("");
    setWorkspaceEmailDraft("");
    setWorkspaceAccessError("");
    chooseRole("agent");
  }

  const searchControl = (
    <SearchBar
      label="Поиск в текущем списке"
      placeholder="Поиск по имени, ID или статусу"
      value={query}
      onChange={setQuery}
    />
  );
  const adminReviewSearchControl = (
    <SearchBar
      label="Поиск в текущем списке"
      placeholder="Поиск по имени или ID"
      value={query}
      onChange={setQuery}
    />
  );
  const cityFilterControl = (
    <Select
      aria-label="Фильтр по городу"
      containerClassName="topbar-filter"
      fieldClassName=""
      label="Город"
      options={cities.map((city) => ({
        label: city === "Все города" ? "Все" : city,
        value: city,
      }))}
      selectClassName="select-control"
      value={cityFilter}
      onChange={(event) => {
        const nextCity = event.target.value;
        setCityFilter(
          nextCity === "Все города" || isCity(nextCity) ? nextCity : "Все города",
        );
      }}
    />
  );
  const inboxSearchControl = (
    <SearchBar
      label="Поиск по входящим"
      placeholder="Поиск по входящим"
      value={query}
      onChange={setQuery}
    />
  );
  const agentActionsSearchControl = (
    <SearchBar
      label="Поиск по действиям"
      placeholder="Поиск по действиям"
      value={query}
      onChange={setQuery}
    />
  );
  const agentSubmissionsSearchControl = (
    <SearchBar
      label="Поиск по подачам"
      placeholder="Поиск по подачам"
      value={query}
      onChange={setQuery}
    />
  );
  const showMobileCreateDock =
    role === "agent" &&
    (surface === "agent-inbox" ||
      surface === "agent-actions" ||
      surface === "agent-submissions");

  if (!hasWorkspaceAccess) {
    return (
      <WorkspaceAccessGate
        busy={loginBusy || !authChecked}
        email={workspaceEmailDraft}
        error={workspaceAccessError}
        onEmail={setWorkspaceEmailDraft}
        onMode={setWorkspaceAuthMode}
        onName={setWorkspaceNameDraft}
        onOrganization={setWorkspaceOrganizationDraft}
        onPassword={setWorkspacePasswordDraft}
        onSubmit={submitWorkspaceEmail}
        mode={workspaceAuthMode}
        name={workspaceNameDraft}
        organization={workspaceOrganizationDraft}
        password={workspacePasswordDraft}
        requiresPassword={isSupabaseMode}
      />
    );
  }

  return (
    <main
      className={`ops-shell surface-${surface} ${
        isV19CollectionSurface ? "is-v19-collection-surface" : ""
      } ${drawerMode !== "closed" ? "has-open-drawer" : ""}`}
      aria-label="Рабочая область подач"
    >
      <OperationalSidebar
        items={operationalNavItems}
        mobileTitle={
          role === "agent" &&
          (surface === "agent-inbox" ||
            surface === "agent-actions" ||
            surface === "agent-submissions")
            ? surfaceTitle(surface)
            : undefined
        }
        onRoleClick={() =>
          showRoleSwitcher
            ? chooseRole(role === "agent" ? "admin" : "agent")
            : resetWorkspaceEmail()
        }
        roleLabel={role === "agent" ? "Агент" : "Админ"}
        footer={
          <>
            {showRoleSwitcher ? (
              <Button
                className="ops-session"
                aria-label="Сменить роль"
                variant="ghost"
                onClick={() => chooseRole(role === "agent" ? "admin" : "agent")}
              >
                <span>{role === "agent" ? "ТП" : "АД"}</span>
                <div>
                  <strong>{role === "agent" ? "Татьяна Новикова" : "Ирина Лебедева"}</strong>
                  <small>{role === "agent" ? "Агент" : "Админ"} · VisaFlow Operations</small>
                </div>
                <svg className="ops-user-more" aria-hidden="true" viewBox="0 0 24 24">
                  <circle cx="5" cy="12" r="1" />
                  <circle cx="12" cy="12" r="1" />
                  <circle cx="19" cy="12" r="1" />
                </svg>
              </Button>
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
      />

      <section className="workspace">
        <header className="topbar">
          {isV19CollectionSurface ? (
            <button className="v19-topbar-menu" type="button" aria-label="Меню">
              <span aria-hidden="true" />
            </button>
          ) : null}
          <div className="topbar-heading">
            <h1>{surfaceTitle(surface)}</h1>
            <p>{surfaceDescription(surface)}</p>
          </div>
          {surface === "agent-submissions" ? (
            <Button
              className="v19-topbar-cta"
              variant="primary"
              onClick={openCreateSubmissionDrawer}
            >
              <span aria-hidden="true">+</span>
              Новая подача
            </Button>
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

        {emptyRemoteWorkspace ? (
          <RemoteWorkspaceEmptyState
            role={role}
            onCreate={role === "agent" ? openCreateSubmissionDrawer : undefined}
          />
        ) : surface === "agent-inbox" ? (
          <AgentInboxScreen
            cityControl={cityFilterControl}
            onOpen={openSubmission}
            searchControl={inboxSearchControl}
            submissions={searchedAgentQueue}
            summary={summary}
          />
        ) : surface === "agent-actions" ? (
          <AgentActionsScreen
            cityControl={cityFilterControl}
            completedActions={searchedCompletedAgentActions}
            onOpen={openSubmission}
            openActions={searchedOpenAgentActions}
            searchControl={agentActionsSearchControl}
            summary={agentActions.summary}
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

        {surface === "admin-inbox" ? (
          <AgentInboxScreen
            inboxEvents={searchedAdminInboxEvents}
            onOpen={openSubmission}
            searchControl={inboxSearchControl}
            submissions={searchedReviewQueue}
            summary={counts(searchedReviewQueue)}
          />
        ) : null}

        {surface === "admin-actions" ? (
          <AgentActionsScreen
            completedActions={searchedCompletedAdminActions}
            onOpen={openSubmission}
            openActions={searchedOpenAdminActions}
            searchControl={agentActionsSearchControl}
            summary={adminActions.summary}
          />
        ) : null}

        {surface === "admin-review" && activeSubmission ? (
          <AdminReviewScreen
            filterControl={cityFilterControl}
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
            filterControl={cityFilterControl}
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

      {drawerMode === "detail" && activeSubmission ? (
        <SubmissionDrawer
          activeTab={activeDrawerTab}
          initialTarget={drawerInitialTarget}
          issueComposerRequest={issueComposerRequest}
          onIssueComposerConsumed={() => setIssueComposerRequest(null)}
          onAction={updateSubmission}
          onAddIssue={addAdminIssue}
          onAcceptAiSuggestion={acceptAiSuggestionForActiveSubmission}
          onClose={closeDrawer}
          onDismissAiSuggestion={dismissAiSuggestionForActiveSubmission}
          onApplyPassportField={applyPassportFieldForActiveSubmission}
          onExtractPassport={extractPassportForActiveSubmission}
          onConfirmVisaApplicationPdfReview={
            confirmVisaApplicationPdfReviewForActiveSubmission
          }
          onDismissVisaApplicationPdfReview={
            dismissVisaApplicationPdfReviewForActiveSubmission
          }
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
          surface={
            surface === "export"
              ? "export"
              : surface === "admin-review"
                ? "review"
                : "agent"
          }
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
                const next = normalizeCreateApplicantNames(current, createFamilyCount);
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
  onEmail,
  onMode,
  onName,
  onOrganization,
  onPassword,
  onSubmit,
  mode = "sign-in",
  name = "",
  organization = "",
  password = "",
  requiresPassword = false,
}: {
  busy?: boolean;
  email: string;
  error: string;
  mode?: "sign-in" | "sign-up";
  name?: string;
  organization?: string;
  onEmail: (email: string) => void;
  onMode?: (mode: "sign-in" | "sign-up") => void;
  onName?: (name: string) => void;
  onOrganization?: (organization: string) => void;
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
            ? mode === "sign-up"
              ? "Создайте агентский профиль через Supabase Auth."
              : "Войдите через Supabase Auth, чтобы открыть рабочий стол по роли профиля."
            : "Введите рабочую почту, чтобы открыть свой рабочий стол."}
        </p>
        <form onSubmit={onSubmit}>
          {requiresPassword && mode === "sign-up" ? (
            <>
              <label>
                <span>Имя</span>
                <input
                  autoComplete="name"
                  id="workspace-name"
                  name="name"
                  placeholder="Имя агента"
                  type="text"
                  value={name}
                  onChange={(event) => onName?.(event.target.value)}
                />
              </label>
              <label>
                <span>Организация</span>
                <input
                  autoComplete="organization"
                  id="workspace-organization"
                  name="organization"
                  placeholder="Название агентства"
                  type="text"
                  value={organization}
                  onChange={(event) => onOrganization?.(event.target.value)}
                />
              </label>
            </>
          ) : null}
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
          ) : (
            <p className="access-note" id="workspace-access-note">
              {busy
                ? "Проверяем текущую сессию."
                : requiresPassword
                  ? mode === "sign-up"
                    ? "Роль будет agent; admin назначается только на стороне Supabase."
                    : "Вход идёт через Supabase Auth."
                  : "Доступ откроется после проверки почты."}
            </p>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? "Проверяем" : mode === "sign-up" ? "Создать профиль" : "Войти"}
          </Button>
          {requiresPassword ? (
            <Button
              type="button"
              variant="ghost"
              onClick={() => onMode?.(mode === "sign-up" ? "sign-in" : "sign-up")}
            >
              {mode === "sign-up" ? "У меня уже есть доступ" : "Создать агентский доступ"}
            </Button>
          ) : null}
        </form>
      </section>
    </main>
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
