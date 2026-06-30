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
import { ArrowLeft, Eye, EyeOff } from "lucide-react";
import visaOpsLogo from "./assets/visaflow-logo.png";
import { supabaseRuntimeConfig } from "./lib/supabase/config";
import { Button, SearchBar, StateTabs } from "./shared/ui/primitives";
import {
  adminActionQueue,
  agentActionQueue,
  searchAgentActions,
} from "./modules/submissions/agentActions";
import {
  buildExportPackageIdentity,
  exportPackageIdentityMatches,
  exportSummary,
  exportSummaryForSelectedIds,
  isSubmissionSelectableForExport,
  selectedReadySubmissionsForExport,
} from "./modules/submissions/exportRules";
import { loadSubmissions, saveSubmissions } from "./modules/submissions/persistence";
import {
  agentOwnerDisplayName,
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
  filterSubmissionsByAgentOwner,
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
  cockpitUploadExtensionForMimeType,
  applyExportStateToSelection,
  completeQuestionnaire,
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
  buildApplicantDocumentFileName,
  type ApplicantDocumentType,
} from "./modules/submissions/filenamePolicy";
import {
  createSubmissionActionErrorState,
  submissionActionErrorForSubmission,
  type SubmissionActionErrorState,
} from "./modules/submissions/submissionActionErrors";
import { completeExportPackage } from "./modules/submissions/exportWorkflow";
import {
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
  OperationalSideMenu,
  type OperationalNavItem,
} from "./modules/submissions/components/OperationalNavigation";
import { ConfirmationDialog } from "./modules/submissions/components/Primitives";
import { FigmaQuestionnaireScreen } from "./modules/submissions/components/FigmaQuestionnaireScreen";
import { FigmaSubmissionDrawer } from "./modules/submissions/components/FigmaSubmissionDrawer";
import {
  AgentActionsScreen,
  AgentInboxScreen,
  AgentSubmissionsScreen,
  ExportScreen,
  type AdminWorkTab,
} from "./modules/submissions/pages/OperationsScreens";
import SettingsScreen from "./modules/submissions/pages/SettingsScreen";
import { CANONICAL_CITIES } from "./modules/submissions/types";
import type {
  City,
  AgentOwnerId,
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
  requestPasswordReset,
  signInSupabaseWithPassword,
  signOutCurrentSession,
  type PasswordResetRequestResult,
} from "./services/authService";
import type {
  AccessRequest,
  AccessRequestRegistrationInput,
  Session as LocalAuthSession,
} from "./shared/authRegistration";
import { supabaseAccessRequestRepository } from "./shared/supabaseAuthRegistration";
import {
  canShowLocalDemoRoleSwitch,
  canUseLocalDemoSeedAutoLogin,
} from "./shared/pilotAccessGate";
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
import { buildReturnedPdfAgentHandoffGate } from "./modules/submissions/operationalWorkflow";
import { publishReturnedPdfAgentHandoff } from "./modules/submissions/returnedPdfHandoffPersistence";
import type { AppProfile } from "./types/session";

const FigmaActionQueueVisual = lazy(() =>
  import("./modules/submissions/pages/FigmaVisualScreens").then((module) => ({
    default: module.FigmaActionQueueVisual,
  })),
);
const CreateSubmissionDrawer = lazy(() =>
  import("./modules/submissions/components/CreateSubmissionDrawer").then((module) => ({
    default: module.CreateSubmissionDrawer,
  })),
);
const AdminReviewDrawer = lazy(() =>
  import("./modules/submissions/components/AdminReviewDrawer").then((module) => ({
    default: module.AdminReviewDrawer,
  })),
);

const cities: Array<City | "Все города"> = ["Все города", ...CANONICAL_CITIES];
const workspaceEmailStorageKey = "visaflow.workspaceEmail.v1";
const fallbackAdminEmails = ["admin@visaflow.local"];
const fallbackAgentEmails = ["agent@visaflow.local"];

type WorkspaceSettings = {
  compactLists: boolean;
  digest: "instant" | "daily";
  drawerHints: boolean;
};

type AgentInboxMode = "actions" | "events";
type AgentFilterValue = AgentOwnerId | "Все агенты";

const defaultWorkspaceSettings: WorkspaceSettings = {
  compactLists: true,
  digest: "instant",
  drawerHints: true,
};

function CityFilterMenu({
  onChange,
  options,
  value,
}: {
  onChange: (city: City | "Все города") => void;
  options: Array<City | "Все города">;
  value: City | "Все города";
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={`topbar-filter v19-city-filter ${open ? "is-open" : ""}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          event.currentTarget
            .querySelector<HTMLButtonElement>(".v19-city-filter-trigger")
            ?.focus();
        }
      }}
    >
      <button
        className="v19-city-filter-trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Фильтр по городу: ${value}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="v19-city-filter-pin" aria-hidden="true">
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M12 21s6-5.3 6-11a6 6 0 0 0-12 0c0 5.7 6 11 6 11Z" />
            <circle cx="12" cy="10" r="2.2" />
          </svg>
        </span>
        <span className="v19-city-filter-value">
          {value === "Все города" ? "Все города" : value}
        </span>
        <svg className="v19-city-filter-chevron" aria-hidden="true" viewBox="0 0 24 24">
          <path d="m7 10 5 5 5-5" />
        </svg>
      </button>
      {open ? (
        <div className="v19-city-filter-menu" role="listbox" aria-label="Город">
          {options.map((city) => {
            const selected = city === value;

            return (
              <button
                className={`v19-city-filter-option ${selected ? "is-selected" : ""}`}
                type="button"
                key={city}
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(city);
                  setOpen(false);
                }}
              >
                <span className="v19-city-filter-dot" aria-hidden="true" />
                <span>{city === "Все города" ? "Все города" : city}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

function AgentFilterMenu({
  onChange,
  options,
  value,
}: {
  onChange: (agentId: AgentFilterValue) => void;
  options: AgentFilterValue[];
  value: AgentFilterValue;
}) {
  return (
    <label className="topbar-filter v19-agent-filter">
      <span className="sr-only">Фильтр по агенту</span>
      <select
        aria-label="Фильтр по агенту"
        className="v19-agent-filter-select"
        value={value}
        onChange={(event) => onChange(event.target.value as AgentFilterValue)}
      >
        {options.map((agentId) => (
          <option key={agentId} value={agentId}>
            {agentId === "Все агенты"
              ? "Все агенты"
              : agentOwnerDisplayName(agentId)}
          </option>
        ))}
      </select>
    </label>
  );
}

function applicantFileDisplayName(input: {
  applicant: Submission["applicants"][number];
  fileType: SubmissionFile["type"];
  mimeType: string;
}): string {
  const documentType = applicantDocumentTypeForFileType(input.fileType);
  if (!documentType) return "";

  return buildApplicantDocumentFileName({
    applicant: input.applicant,
    documentType,
    extension: cockpitUploadExtensionForMimeType(input.mimeType, input.fileType),
  });
}

function applicantDocumentTypeForFileType(
  fileType: SubmissionFile["type"],
): ApplicantDocumentType | null {
  if (fileType === "passport_scan") return "passport_scan";
  if (fileType === "selfie") return "selfie";
  if (fileType === "selfie_2") return "selfie_2";
  return null;
}

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

type AccessRequestSubmitResult =
  | {
      message: string;
      status: "requested";
    }
  | {
      message: string;
      status: "unavailable";
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

const workspaceEmailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isValidWorkspaceEmail(email: string) {
  return workspaceEmailPattern.test(normalizeEmail(email));
}

function isAuthAccessError(error: unknown): error is { code: string; message: string } {
  return (
    error instanceof Error &&
    typeof (error as { code?: unknown }).code === "string"
  );
}

async function loadLocalAuthRegistration() {
  return import("./shared/authRegistration");
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

function localAgentOwnerIdForSession(session: LocalAuthSession | null) {
  if (
    session?.role === "agent" &&
    session.status === "active" &&
    session.approvalStatus === "approved" &&
    session.ownerAgentId
  ) {
    return session.ownerAgentId;
  }

  return defaultLocalAgentOwnerId;
}

function reviewTabForAdminWork(tab: AdminWorkTab): ReviewTab | null {
  if (tab === "events") return null;
  return tab;
}

function MainApp() {
  const isSupabaseMode = supabaseRuntimeConfig.selected === "supabase";
  const localDemoSeedAutoLoginEnabled = canUseLocalDemoSeedAutoLogin(import.meta.env);
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
  const [agentQuestionnaireOpen, setAgentQuestionnaireOpen] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
  const [createCloseFocusToken, setCreateCloseFocusToken] = useState(0);
  const [query, setQuery] = useState("");
  const [cityFilter, setCityFilter] = useState<City | "Все города">("Все города");
  const [agentFilter, setAgentFilter] =
    useState<AgentFilterValue>("Все агенты");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [agentInboxMode, setAgentInboxMode] = useState<AgentInboxMode>("events");
  const [agentTab, setAgentTab] = useState<AgentTab>("all");
  const [reviewTab, setReviewTab] = useState<AdminWorkTab>("review");
  const [exportTab, setExportTab] = useState<ExportTab>("ready");
  const [selectedExportIds, setSelectedExportIds] = useState<string[]>(["ПД-1056"]);
  const [exportBusy, setExportBusy] = useState(false);
  const [exportError, setExportError] = useState("");
  const [passportReviewRequest, setPassportReviewRequest] =
    useState<PassportReviewRequest | null>(null);
  const [submissionActionError, setSubmissionActionError] =
    useState<SubmissionActionErrorState | null>(null);
  const [createType, setCreateType] = useState<Submission["type"]>("single");
  const [createCity] = useState<City>("Москва");
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
  const [, setLocalPassportFileIds] = useState<string[]>([]);
  const [, setUploadingSubmissionIds] = useState<Set<string>>(
    () => new Set(),
  );
  const settingsDirty = !sameWorkspaceSettings(workspaceSettings, settingsDraft);

  const currentAgentOwnerId =
    role === "agent" && remoteProfile?.role === "agent"
      ? remoteProfile.id
      : localAgentOwnerIdForSession(localAuthSession);
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
  const agentFilterOptions = useMemo<AgentFilterValue[]>(() => {
    const owners = Array.from(
      new Set(submissions.map((submission) => submission.agentId)),
    ).sort((left, right) =>
      agentOwnerDisplayName(left).localeCompare(agentOwnerDisplayName(right)),
    );
    return ["Все агенты", ...owners];
  }, [submissions]);
  const adminReviewSource = useMemo(
    () =>
      filterSubmissionsByAgentOwner(
        reviewQueue(submissions),
        role === "admin" ? agentFilter : "Все агенты",
      ),
    [agentFilter, role, submissions],
  );
  const searchedReviewQueue = useMemo(
    () => searchSubmissions(adminReviewSource, query, cityFilter),
    [adminReviewSource, cityFilter, query],
  );
  const adminActions = useMemo(
    () => adminActionQueue(searchedReviewQueue),
    [searchedReviewQueue],
  );
  const searchedOpenAdminActions = useMemo(
    () => searchAgentActions(adminActions.open, query),
    [adminActions.open, query],
  );
  const searchedCompletedAdminActions = useMemo(
    () => searchAgentActions(adminActions.completed, query),
    [adminActions.completed, query],
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
    agentList.find((submission) => submission.id === selectedSubmissionId) ??
    agentList[0] ??
    null;
  const searchedExportSubmissions = useMemo(
    () =>
      searchSubmissions(
        filterSubmissionsByAgentOwner(
          submissions,
          role === "admin" ? agentFilter : "Все агенты",
        ),
        query,
        cityFilter,
      ),
    [agentFilter, cityFilter, query, role, submissions],
  );
  const readyList = useMemo(
    () => readyForExport(searchedExportSubmissions),
    [searchedExportSubmissions],
  );
  const exportReadyList = useMemo(
    () => readyList.filter(isSubmissionSelectableForExport),
    [readyList],
  );
  const historyList = useMemo(
    () => exportedHistory(searchedExportSubmissions),
    [searchedExportSubmissions],
  );
  const selectedForExport = exportReadyList.filter((submission) =>
    selectedExportIds.includes(submission.id),
  );
  const selectedVisibleExportIds = selectedForExport.map((submission) => submission.id);
  const exportPlan = exportSummary(selectedForExport);
  const showRoleSwitcher = canShowLocalDemoRoleSwitch({
    env: import.meta.env,
    isSupabaseMode,
    session: localAuthSession,
  });
  const isV19CollectionSurface =
    surface === "agent-actions" ||
    surface === "agent-inbox" ||
    surface === "agent-submissions" ||
    surface === "admin-review";
  const isFigmaVisualSurface = surface === "agent-actions" || surface === "admin-review";
  const workspaceSurfaceTitle =
    surface === "admin-review" ? "Проверка" : surfaceTitle(surface);
  const workspaceSurfaceDescription =
    surface === "admin-review" ? "Проверка и события" : surfaceDescription(surface);
  const agentInboxUnreadCount = Math.min(3, searchedAgentQueue.length);
  const localAuthHasWorkspaceAccess =
    localAuthSession?.status === "active" &&
    localAuthSession.approvalStatus === "approved";
  const hasWorkspaceAccess = isSupabaseMode
    ? Boolean(remoteProfile)
    : localAuthHasWorkspaceAccess;
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
            onClick: () => showAgentTab("all"),
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
          {
            active: surface === "settings",
            count: pendingAccessRequests.length,
            icon: "Н",
            id: "admin-settings",
            label: "Настройки",
            meta: "доступ и роли",
            onClick: showSettingsSurface,
            tone: pendingAccessRequests.length > 0 ? "warning" : "default",
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
        const { accessRequestRepository, authRepository } =
          await loadLocalAuthRegistration();
        const requestedWorkspaceEmail = loadWorkspaceEmail();
        const restoredSession = await authRepository.restoreSession();
        if (cancelled) return;

        if (
          restoredSession &&
          (!requestedWorkspaceEmail || requestedWorkspaceEmail === restoredSession.email)
        ) {
          setLocalAuthSession(restoredSession);
          setWorkspaceEmail(restoredSession.email);
          setWorkspaceEmailDraft(restoredSession.email);
          saveWorkspaceEmail(restoredSession.email);
          if (
            restoredSession.approvalStatus === "approved" &&
            restoredSession.status === "active"
          ) {
            setRole(restoredSession.role);
            setSurface(
              restoredSession.role === "admin" ? "admin-review" : "agent-actions",
            );
          }
          if (
            restoredSession.role === "admin" &&
            restoredSession.approvalStatus === "approved" &&
            restoredSession.status === "active"
          ) {
            setPendingAccessRequests(
              await accessRequestRepository.listPendingAccessRequests(),
            );
          }
          return;
        }

        if (!localDemoSeedAutoLoginEnabled) return;

        const bootstrapEmail = requestedWorkspaceEmail || fallbackAgentEmails[0];
        const bootstrapSession = await authRepository.loginApprovedUser(
          bootstrapEmail,
          "local-dev-password",
        );
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
            isAuthAccessError(error)
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
  }, [isSupabaseMode, localDemoSeedAutoLoginEnabled]);

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
    searchedReviewQueue,
    selectedSubmissionId,
    surface,
  ]);

  useEffect(() => {
    selectedExportIdsRef.current = selectedExportIds;
  }, [selectedExportIds]);

  useEffect(() => {
    const readyIds = new Set(exportReadyList.map((submission) => submission.id));
    setSelectedExportIds((current) => {
      const next = current.filter((id) => readyIds.has(id));
      if (next.length !== current.length) selectedExportIdsRef.current = next;
      return next.length === current.length ? current : next;
    });
  }, [exportReadyList]);

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
        setAgentInboxMode("actions");
        setAgentTab("all");
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
      setAgentInboxMode("actions");
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
      const nextSubmission = exportReadyList[0] ?? historyList[0];
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
    setCreateType("single");
    setCreateFamilyCount(2);
    setCreateApplicantNames(["Новый заявитель", "Супруг", "Ребёнок 1", "Ребёнок 2"]);
    setDirty(false);
  }

  function openSubmission(
    submission: Submission,
    tab = defaultDrawerTab(submission),
  ) {
    rememberReturnFocus();
    setSubmissionActionError(null);
    setSelectedSubmissionId(submission.id);
    setActiveDrawerTab(tab);
    setDrawerMode("detail");
    setAgentQuestionnaireOpen(false);
  }

  function openApplicantsUploadTarget() {
    const selectedSubmission = agentList.find(
      (submission) => submission.id === selectedSubmissionId,
    );
    const candidates = [selectedSubmission, ...agentList].filter(
      (submission, index, list): submission is Submission =>
        Boolean(submission) &&
        list.findIndex((item) => item?.id === submission?.id) === index,
    );
    const target =
      candidates.find((submission) =>
        submission.files.some(
          (file) =>
            file.status === "missing" ||
            file.status === "needs_replacement" ||
            file.status === "uploaded" ||
            file.status === "pending_review",
        ) ||
        submission.issues.some(
          (issue) =>
            issue.status !== "closed_by_admin" &&
            (issue.type === "file" || issue.type === "media" || Boolean(issue.target.fileType)),
        ),
      ) ?? candidates[0];

    if (!target) {
      openCreateSubmissionDrawer();
      return;
    }

    openSubmission(target, "files");
  }

  function openAgentQuestionnaireWorkspace() {
    const targetSubmission = activeSubmission ?? firstAgentActionSubmission();
    if (!targetSubmission) return;
    setSelectedSubmissionId(targetSubmission.id);
    setActiveDrawerTab("questionnaire");
    setDrawerMode("closed");
    setAgentQuestionnaireOpen(true);
  }

  function completeActiveQuestionnaire(values: {
    travelEnd: string;
    travelStart: string;
  }) {
    const submission = activeSubmission;
    const applicant = submission?.applicants[0];
    if (!submission || !applicant) return;

    const withArrivalDate = updateQuestionnaireField(submission, {
      applicantId: applicant.id,
      fieldId: "arrival-date",
      sectionId: "trip",
      value: values.travelStart,
    });
    const withDepartureDate = updateQuestionnaireField(withArrivalDate, {
      applicantId: applicant.id,
      fieldId: "departure-date",
      sectionId: "trip",
      value: values.travelEnd,
    });
    const completed = completeQuestionnaire(withDepartureDate);
    const nextSubmissions = submissionsRef.current.map((candidate) =>
      candidate.id === completed.id ? completed : candidate,
    );

    submissionsRef.current = nextSubmissions;
    setSubmissions(nextSubmissions);
    setSubmissionActionError(null);
    setSelectedSubmissionId(completed.id);
    setActiveDrawerTab("questionnaire");
    setDrawerMode("detail");
    setAgentQuestionnaireOpen(false);
  }

  function selectSubmission(submission: Submission) {
    setSubmissionActionError(null);
    setSelectedSubmissionId(submission.id);
    setActiveDrawerTab(defaultDrawerTab(submission));
  }

  const closeDrawer = useCallback(() => {
    if (dirty) {
      setConfirmClose(true);
      return;
    }
    setSubmissionActionError(null);
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

  useEffect(() => {
    if (!mobileNavOpen) return;

    function handleMobileNavEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setMobileNavOpen(false);
    }

    document.addEventListener("keydown", handleMobileNavEscape);
    return () => document.removeEventListener("keydown", handleMobileNavEscape);
  }, [mobileNavOpen]);

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
    setActiveDrawerTab("files");
    setDrawerMode("detail");
  }

  function markPassportExtractionUnavailableForUpload(
    submissionId: string,
    fileId: string,
    fallbackFile: SubmissionFile,
  ) {
    updateSubmissionById(submissionId, (submission) => {
      const latestFile =
        submission.files.find((candidate) => candidate.id === fileId) ??
        fallbackFile;
      return failPassportExtraction(
        submission,
        latestFile,
        "Распознавание паспорта недоступно. Проверьте данные вручную.",
      );
    });
  }

  function uploadActiveSubmissionFile(fileId: string, selectedFile: File) {
    if (!activeSubmission) return;
    const currentSubmission =
      submissionsRef.current.find(
        (submission) => submission.id === activeSubmission.id,
      ) ?? activeSubmission;
    const targetFile = currentSubmission.files.find((file) => file.id === fileId);
    if (!targetFile) return;
    if (
      targetFile.type === "passport_scan" &&
      !passportScanUploadMimeTypes.has(selectedFile.type)
    ) {
      return;
    }

    if (isSupabaseMode) {
      if (!remoteProfile) {
        setRemoteSaveState("error");
        setRemoteSaveError("Сначала войдите в Supabase, чтобы сохранить файл.");
        return;
      }

      void enqueueSupabaseMediaUpload(currentSubmission.id, async () => {
        const updatedSubmission = await performSupabaseMediaUpload(
          currentSubmission.id,
          fileId,
          selectedFile,
          remoteProfile,
        );
        if (updatedSubmission && targetFile.type === "passport_scan") {
          if (passportExtractionEnabled) {
            void extractPassportForSubmission(updatedSubmission.id, fileId, true);
          } else {
            markPassportExtractionUnavailableForUpload(
              updatedSubmission.id,
              fileId,
              targetFile,
            );
          }
        }
      });
      setSubmissionActionError(null);
      setActiveDrawerTab("files");
      setDrawerMode("detail");
      return;
    }

    const applicant = currentSubmission.applicants.find(
      (item) => item.id === targetFile.applicantId,
    );
    const generatedFileName = applicant
      ? applicantFileDisplayName({
          applicant,
          fileType: targetFile.type,
          mimeType: selectedFile.type,
        }) || selectedFile.name
      : selectedFile.name;

    updateActiveSubmission((submission) =>
      applyUploadedFileMetadata(submission, fileId, {
        generatedFileName,
        mimeType: selectedFile.type,
        originalFileName: selectedFile.name,
        sizeBytes: selectedFile.size,
        storageAdapter: "local-dev" as const,
        storageBucket: "",
        storagePath: "",
        uploadedAtIso: new Date().toISOString(),
      }),
    );
    if (targetFile.type === "passport_scan") {
      rememberLocalPassportFile(fileId, selectedFile);
      if (passportExtractionEnabled) {
        void extractPassportForSubmission(currentSubmission.id, fileId, true);
      } else {
        markPassportExtractionUnavailableForUpload(
          currentSubmission.id,
          fileId,
          targetFile,
        );
      }
    }
    setSubmissionActionError(null);
    setActiveDrawerTab("files");
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

    setSubmissionActionError(null);
    setSubmissions((current) => {
      const next = current.map((submission) =>
        submission.id === result.data.id ? result.data : submission,
      );
      submissionsRef.current = next;
      return next;
    });
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
      const storageFileName = generatedCockpitMediaFileName({
        applicantId: applicant.id,
        fileType: targetFile.type,
        mimeType: selectedFile.type,
        submissionId: latestSubmission.id,
        uploadNonce: createMediaUploadNonce(uploadedAtIso),
      });
      const generatedFileName =
        applicantFileDisplayName({
          applicant,
          fileType: targetFile.type,
          mimeType: selectedFile.type,
        }) || storageFileName;
      const storageTarget = buildMediaStoragePath(
        latestSubmission.id,
        applicant.id,
        mediaSlotType,
        storageFileName,
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
        storageAdapter: "supabase-private" as const,
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

    const handoffPackage = buildReturnedPdfAgentHandoffGate(
      activeSubmission,
      submissionsRef.current,
    );
    if (!handoffPackage.ready) {
      const message = handoffPackage.blockers[0] ?? "Комплект PDF ещё не готов.";
      setRemoteSaveState("error");
      setRemoteSaveError(message);
      throw new Error(message);
    }

    if (!isSupabaseMode || !remoteProfile) {
      const message =
        "Сначала войдите в Supabase, чтобы открыть PDF агенту.";
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

      const latestHandoffPackage = buildReturnedPdfAgentHandoffGate(
        latestSubmission,
        submissionsRef.current,
      );
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

  // Preserved for the next PDF/passport review UI wiring after removing the legacy drawer UI.
  void extractPassportForActiveSubmission;
  void applyPassportFieldForActiveSubmission;
  void updateActiveQuestionnaireField;
  void reviewVisaApplicationPdfForActiveSubmission;
  void confirmVisaApplicationPdfReviewForActiveSubmission;
  void publishReturnedPdfHandoffForActiveSubmission;
  void dismissVisaApplicationPdfReviewForActiveSubmission;

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
        const applicant = current.applicants.find(
          (item) => item.id === slot.applicantId,
        );
        rememberLocalPassportFile(slot.id, upload.file);
        const withUploadedFile = uploadRequiredFile(current, slot.id, {
          generatedFileName: applicant
            ? applicantFileDisplayName({
                applicant,
                fileType: slot.type,
                mimeType: upload.file.type,
              }) || upload.file.name
            : upload.file.name,
          mimeType: upload.file.type,
          originalFileName: upload.file.name,
          sizeBytes: upload.file.size,
          storageAdapter: "local-dev" as const,
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
    options?: { openQuestionnaire?: boolean },
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
    setActiveDrawerTab(passportUploads.length ? "questionnaire" : "overview");
    if (options?.openQuestionnaire) {
      setDrawerMode("closed");
      setAgentQuestionnaireOpen(true);
    } else {
      setDrawerMode("detail");
      setAgentQuestionnaireOpen(false);
    }
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

    setExportError("");

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
      setExportTab("history");
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

    if (!isValidWorkspaceEmail(email)) {
      setWorkspaceAccessError("Введите корректный email");
      return;
    }

    if (!workspacePasswordDraft.trim()) {
      setWorkspaceAccessError("Введите пароль");
      return;
    }

    if (isSupabaseMode) {
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
        if (session.profile.role === "admin") {
          setPendingAccessRequests(
            await supabaseAccessRequestRepository.listPendingAccessRequests(),
          );
        }
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

    setLoginBusy(true);
    setWorkspaceAccessError("");
    setWorkspaceAccessNotice("");
    try {
      const { accessRequestRepository, authRepository } =
        await loadLocalAuthRegistration();
      const session = await authRepository.loginApprovedUser(
        email,
        workspacePasswordDraft,
      );
      setLocalAuthSession(session);
      setWorkspaceEmail(session.email);
      setWorkspaceEmailDraft(session.email);
      saveWorkspaceEmail(session.email);
      if (session.approvalStatus === "approved" && session.status === "active") {
        chooseRole(session.role);
      } else {
        setRole("agent");
        setSurface("agent-actions");
      }
      if (
        session.role === "admin" &&
        session.approvalStatus === "approved" &&
        session.status === "active"
      ) {
        setPendingAccessRequests(
          await accessRequestRepository.listPendingAccessRequests(),
        );
      }
    } catch (error) {
      setWorkspaceAccessError(
        isAuthAccessError(error) && error.code === "ACCESS_NOT_FOUND"
          ? "Почта не найдена в списке доступа. Если входите впервые, подайте заявку."
          : isAuthAccessError(error)
            ? error.message
            : "Не удалось проверить local/dev доступ.",
      );
    } finally {
      setLoginBusy(false);
      setAuthChecked(true);
    }
  }

  async function requestWorkspaceAccess(
    input: AccessRequestRegistrationInput,
  ): Promise<AccessRequestSubmitResult> {
    const normalizedEmail = normalizeEmail(input.email);

    if (isSupabaseMode) {
      const request = await supabaseAccessRequestRepository.submitAccessRequest({
        ...input,
        email: normalizedEmail,
      });
      return {
        status: "requested",
        message:
          request.status === "approved"
            ? "Доступ уже подтверждён. Вернитесь ко входу."
            : "Заявка отправлена. Доступ появится после подтверждения администратором.",
      };
    }

    const { accessRequestRepository, authRepository } =
      await loadLocalAuthRegistration();
    const request = await accessRequestRepository.submitAccessRequest({
      ...input,
      email: normalizedEmail,
    });
    if (request.status === "pending") {
      const pendingSession = await authRepository.loginApprovedUser(
        normalizedEmail,
        input.password,
      );
      setLocalAuthSession(pendingSession);
      setWorkspaceEmail(pendingSession.email);
      setWorkspaceEmailDraft(pendingSession.email);
      saveWorkspaceEmail(pendingSession.email);
      setRole("agent");
      setSurface("agent-actions");
      return {
        status: "requested",
        message:
          "Заявка отправлена. Доступ появится после подтверждения администратором.",
      };
    }

    if (request.status === "rejected") {
      const rejectedSession = await authRepository.loginApprovedUser(
        normalizedEmail,
        input.password,
      );
      setLocalAuthSession(rejectedSession);
      setWorkspaceEmail(rejectedSession.email);
      setWorkspaceEmailDraft(rejectedSession.email);
      saveWorkspaceEmail(rejectedSession.email);
      setRole("agent");
      setSurface("agent-actions");
      return {
        status: "requested",
        message: "Заявка отклонена.",
      };
    }

    return {
      status: "requested",
      message:
        "Если доступ уже подтверждён, вернитесь ко входу. Если нет, администратор рассмотрит заявку.",
    };
  }

  async function requestWorkspacePasswordReset(
    email: string,
  ): Promise<PasswordResetRequestResult> {
    return requestPasswordReset(normalizeEmail(email));
  }

  async function resetWorkspaceEmail() {
    if (isSupabaseMode) {
      await signOutCurrentSession();
      remoteOwnerIdsRef.current = new Map();
      remoteSubmissionFingerprintsRef.current = new Map();
      setRemoteProfile(null);
      setPendingAccessRequests([]);
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

    const { authRepository } = await loadLocalAuthRegistration();
    await authRepository.logout();
    setLocalAuthSession(null);
    setPendingAccessRequests([]);
    clearWorkspaceEmail();
    setWorkspaceEmail("");
    setWorkspaceEmailDraft("");
    setWorkspacePasswordDraft("");
    setWorkspaceAccessError("");
    setWorkspaceAccessNotice("");
    chooseRole("agent");
  }

  async function approvePendingAccessRequest(requestId: string) {
    if (isSupabaseMode) {
      if (!remoteProfile || remoteProfile.role !== "admin") return;

      setLoginBusy(true);
      setWorkspaceAccessError("");
      try {
        await supabaseAccessRequestRepository.approveAccessRequest(
          requestId,
          remoteProfile.id,
        );
        setPendingAccessRequests(
          await supabaseAccessRequestRepository.listPendingAccessRequests(),
        );
      } catch (error) {
        setWorkspaceAccessError(
          formatPersistenceFailureForUser(
            error,
            "Не удалось одобрить Supabase заявку.",
          ),
        );
      } finally {
        setLoginBusy(false);
      }
      return;
    }

    if (!localAuthSession || localAuthSession.role !== "admin") return;

    setLoginBusy(true);
    setWorkspaceAccessError("");
    try {
      const { accessRequestRepository } = await loadLocalAuthRegistration();
      await accessRequestRepository.approveAccessRequest(
        requestId,
        localAuthSession.userId,
      );
      setPendingAccessRequests(
        await accessRequestRepository.listPendingAccessRequests(),
      );
    } catch (error) {
      setWorkspaceAccessError(
        isAuthAccessError(error)
          ? error.message
          : "Не удалось одобрить заявку.",
      );
    } finally {
      setLoginBusy(false);
    }
  }

  async function rejectPendingAccessRequest(requestId: string, reason?: string) {
    if (isSupabaseMode) {
      if (!remoteProfile || remoteProfile.role !== "admin") return;

      setLoginBusy(true);
      setWorkspaceAccessError("");
      try {
        await supabaseAccessRequestRepository.rejectAccessRequest(
          requestId,
          remoteProfile.id,
          reason,
        );
        setPendingAccessRequests(
          await supabaseAccessRequestRepository.listPendingAccessRequests(),
        );
      } catch (error) {
        setWorkspaceAccessError(
          formatPersistenceFailureForUser(
            error,
            "Не удалось отклонить Supabase заявку.",
          ),
        );
      } finally {
        setLoginBusy(false);
      }
      return;
    }

    if (!localAuthSession || localAuthSession.role !== "admin") return;

    setLoginBusy(true);
    setWorkspaceAccessError("");
    try {
      const { accessRequestRepository } = await loadLocalAuthRegistration();
      await accessRequestRepository.rejectAccessRequest(
        requestId,
        localAuthSession.userId,
        reason,
      );
      setPendingAccessRequests(
        await accessRequestRepository.listPendingAccessRequests(),
      );
    } catch (error) {
      setWorkspaceAccessError(
        isAuthAccessError(error)
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
  const cityFilterControl = (
    <CityFilterMenu options={cities} value={cityFilter} onChange={setCityFilter} />
  );
  const adminFilterControl = (
    <div className="v19-admin-filter-controls">
      {cityFilterControl}
      <AgentFilterMenu
        options={agentFilterOptions}
        value={agentFilter}
        onChange={setAgentFilter}
      />
    </div>
  );
  const inboxSearchControl = (
    <SearchBar
      label="Поиск по входящим"
      placeholder="Поиск"
      value={query}
      onChange={setQuery}
    />
  );
  const agentActionsSearchControl = (
    <SearchBar
      label="Поиск по действиям"
      placeholder="Поиск"
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
  const showMobileCreateDock = role === "agent" && surface === "agent-submissions";
  const mobileAgentNavItems: OperationalNavItem[] =
    role === "agent"
      ? operationalNavItems.map((item) => ({
          ...item,
          onClick: () => {
            item.onClick();
            setMobileNavOpen(false);
          },
        }))
      : [];
  const sidebarCreateAction =
    role === "agent"
      ? {
          label: isFigmaVisualSurface ? "Создать пакет" : "Новая подача",
          onClick: () => {
            openCreateSubmissionDrawer();
            setMobileNavOpen(false);
          },
        }
      : undefined;
  const operationalSidebarFooter = (
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
            <span>{role === "agent" ? "ТН" : "АД"}</span>
            <div>
              <strong>
                {role === "agent" ? "Татьяна Николаева" : "Ирина Лебедева"}
              </strong>
              <small>{role === "agent" ? "Visa Center Spb" : "Админ"}</small>
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
  );

  if (!isSupabaseMode && localAuthSession && !localAuthHasWorkspaceAccess) {
    return (
      <WorkspaceAccessStatusGate
        session={localAuthSession}
        onSignOut={() => {
          void resetWorkspaceEmail();
        }}
      />
    );
  }

  if (!hasWorkspaceAccess) {
    return (
      <WorkspaceAccessGate
        busy={loginBusy || !authChecked}
        email={workspaceEmailDraft}
        error={workspaceAccessError}
        notice={workspaceAccessNotice}
        onAccessRequest={requestWorkspaceAccess}
        onEmail={setWorkspaceEmailDraft}
        onPassword={setWorkspacePasswordDraft}
        onPasswordReset={requestWorkspacePasswordReset}
        onSubmit={submitWorkspaceEmail}
        password={workspacePasswordDraft}
      />
    );
  }

  return (
    <main
      className={`ops-shell surface-${surface} ${
        isV19CollectionSurface ? "is-v19-collection-surface" : ""
      } has-unified-side-menu role-${role} ${
        drawerMode !== "closed" ? "has-open-drawer" : ""
      } ${mobileNavOpen ? "is-mobile-nav-open" : ""}`}
      aria-label="Рабочая область подач"
    >
      <OperationalSideMenu
        createAction={sidebarCreateAction}
        items={operationalNavItems}
        mobileOpen={mobileNavOpen}
        onMobileClose={() => setMobileNavOpen(false)}
        mobileTitle={workspaceSurfaceTitle}
        footer={operationalSidebarFooter}
      />

      <section className="workspace">
        <header className="topbar">
          <button
            className="v19-topbar-menu"
            type="button"
            aria-label={mobileNavOpen ? "Закрыть меню" : "Меню"}
            aria-expanded={mobileNavOpen}
            onClick={() => setMobileNavOpen((open) => !open)}
          >
            <span aria-hidden="true" />
          </button>
          <div className="topbar-heading">
            <h1>{workspaceSurfaceTitle}</h1>
            {surface !== "agent-actions" &&
            surface !== "agent-inbox" &&
            surface !== "agent-submissions" &&
            surface !== "export" ? (
              <p>{workspaceSurfaceDescription}</p>
            ) : null}
          </div>
          {isFigmaVisualSurface ? null : surface === "agent-submissions" ? (
            <div className="vf-applicants-transfer-actions topbar-actions">
              <Button
                className="vf-applicants-transfer-upload"
                type="button"
                variant="secondary"
                aria-label="Загрузить файлы в текущую подачу"
                onClick={openApplicantsUploadTarget}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M12 16V4" />
                  <path d="m7 9 5-5 5 5" />
                  <path d="M5 20h14" />
                </svg>
                Загрузить
              </Button>
              <Button
                className="vf-applicants-transfer-create"
                type="button"
                variant="primary"
                onClick={openCreateSubmissionDrawer}
              >
                <svg aria-hidden="true" viewBox="0 0 24 24">
                  <path d="M12 5v14" />
                  <path d="M5 12h14" />
                </svg>
                Создать пакет
              </Button>
            </div>
          ) : surface === "agent-inbox" ? (
            <div className="v19-topbar-city-filter">{cityFilterControl}</div>
          ) : !isV19CollectionSurface || isSupabaseMode ? (
            <div className="topbar-actions">
              {!isV19CollectionSurface ? (
                <span className="service-logo vf-brand-wordmark" aria-label="VisaFlow 19">
                  <span
                    className="vf-brand-capital vf-brand-capital--mini"
                    aria-hidden="true"
                  >
                    <img className="vf-brand-capital-image" src={visaOpsLogo} alt="" />
                  </span>
                  <span aria-hidden="true">VisaFlow</span>
                  <span className="vf-brand-comma-version" aria-hidden="true">
                    19
                  </span>
                </span>
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
        ) : surface === "agent-actions" || surface === "admin-review" ? (
          <Suspense fallback={null}>
            <FigmaActionQueueVisual
              cityFilter={cityFilter}
              cityOptions={cities}
              completedActions={
                surface === "admin-review"
                  ? searchedCompletedAdminActions
                  : searchedCompletedAgentActions
              }
              onCityFilter={setCityFilter}
              onOpen={openSubmission}
              onSearch={setQuery}
              openActions={
                surface === "admin-review"
                  ? searchedOpenAdminActions
                  : searchedOpenAgentActions
              }
              query={query}
              summary={
                surface === "admin-review" ? adminActions.summary : agentActions.summary
              }
            />
          </Suspense>
        ) : surface === "agent-inbox" ? (
          <>
            <div className="v19-inbox-mode-tabs">
              <StateTabs<AgentInboxMode>
                ariaLabel="Раздел входящих"
                tabs={[
                  { count: agentInboxUnreadCount, id: "events", label: "Входящие" },
                  {
                    count: agentActions.summary.open,
                    id: "actions",
                    label: "Мои действия",
                  },
                ]}
                value={agentInboxMode}
                onValueChange={(nextMode) => {
                  setAgentInboxMode(nextMode);
                  if (nextMode === "actions") {
                    const nextSubmission = firstAgentActionSubmission();
                    if (nextSubmission) setSelectedSubmissionId(nextSubmission.id);
                  }
                }}
              />
            </div>
            {agentInboxMode === "events" ? (
              <AgentInboxScreen
                contextRailEnabled
                onOpen={openSubmission}
                searchControl={inboxSearchControl}
                submissions={searchedAgentQueue}
                summary={summary}
              />
            ) : (
              <AgentActionsScreen
                completedActions={searchedCompletedAgentActions}
                onOpen={openSubmission}
                openActions={searchedOpenAgentActions}
                searchControl={agentActionsSearchControl}
                summary={agentActions.summary}
              />
            )}
          </>
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
            searchQuery={query}
            searchControl={agentSubmissionsSearchControl}
            visibleSubmission={visibleAgentSubmission}
            summary={summary}
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
            filterControl={adminFilterControl}
            readyList={exportReadyList}
            searchControl={searchControl}
            selectedExportIds={selectedVisibleExportIds}
          />
        ) : null}

        {surface === "settings" ? (
          <Suspense fallback={<SettingsLoadingState />}>
            <SettingsScreen
              accessRequests={pendingAccessRequests}
              accessRequestsBusy={loginBusy}
              confirmLeave={confirmSettingsLeave}
              dirty={settingsDirty}
              email={workspaceEmail}
              isSupabaseMode={isSupabaseMode}
              role={role}
              saveState={settingsSaveState}
              settings={settingsDraft}
              onApproveAccessRequest={(requestId) =>
                void approvePendingAccessRequest(requestId)
              }
              onCancelLeave={cancelSettingsLeave}
              onConfirmLeave={confirmSettingsLeaveAndRun}
              onRejectAccessRequest={(requestId) =>
                void rejectPendingAccessRequest(requestId)
              }
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
          onComplete={completeActiveQuestionnaire}
          onBack={() => setAgentQuestionnaireOpen(false)}
          submission={activeSubmission}
        />
      ) : null}

      {drawerMode === "detail" &&
      activeSubmission &&
      role === "admin" ? (
        <Suspense fallback={null}>
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
        </Suspense>
      ) : drawerMode === "detail" && activeSubmission && role === "agent" ? (
        <FigmaSubmissionDrawer
          actionError={activeSubmissionActionError}
          activeTab={activeDrawerTab}
          onAction={updateSubmission}
          onClose={closeDrawer}
          onMarkIssueFixed={markActiveIssueFixed}
          onOpenQuestionnaireWorkspace={openAgentQuestionnaireWorkspace}
          onUploadFile={uploadActiveSubmissionFile}
          role={role}
          surface="agent"
          submission={activeSubmission}
        />
      ) : null}

      {drawerMode === "create" ? (
        <Suspense fallback={null}>
          <CreateSubmissionDrawer
            familyCount={createFamilyCount}
            focusCloseToken={createCloseFocusToken}
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
  onAccessRequest,
  onEmail,
  onPassword,
  onPasswordReset,
  onSubmit,
  password = "",
}: {
  busy?: boolean;
  email: string;
  error: string;
  notice?: string;
  onAccessRequest: (
    input: AccessRequestRegistrationInput,
  ) => Promise<AccessRequestSubmitResult>;
  onEmail: (email: string) => void;
  onPassword?: (password: string) => void;
  onPasswordReset: (email: string) => Promise<PasswordResetRequestResult>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  password?: string;
}) {
  const [screen, setScreen] = useState<"login" | "reset" | "register">("login");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [accessPasswordVisible, setAccessPasswordVisible] = useState(false);
  const [loginAttempted, setLoginAttempted] = useState(false);
  const [emailTouched, setEmailTouched] = useState(false);
  const [passwordTouched, setPasswordTouched] = useState(false);
  const [accessDraft, setAccessDraft] = useState<AccessRequestRegistrationInput>({
    city: "",
    companyName: "",
    email,
    fullName: "",
    password: "",
    phone: "",
  });
  const [accessAttempted, setAccessAttempted] = useState(false);
  const [accessTouched, setAccessTouched] = useState<
    Partial<Record<keyof AccessRequestRegistrationInput, boolean>>
  >({});
  const [accessBusy, setAccessBusy] = useState(false);
  const [accessError, setAccessError] = useState("");
  const [accessSuccess, setAccessSuccess] = useState("");
  const [resetEmail, setResetEmail] = useState(email);
  const [resetAttempted, setResetAttempted] = useState(false);
  const [resetEmailTouched, setResetEmailTouched] = useState(false);
  const [resetBusy, setResetBusy] = useState(false);
  const [resetError, setResetError] = useState("");
  const [resetSuccess, setResetSuccess] = useState("");
  const showEmailError =
    (loginAttempted || emailTouched) && !isValidWorkspaceEmail(email);
  const showPasswordError =
    (loginAttempted || passwordTouched) && password.trim().length === 0;
  const emailError = showEmailError ? "Введите корректный email" : "";
  const passwordError = showPasswordError ? "Введите пароль" : "";
  const accessErrors = {
    city:
      (accessAttempted || accessTouched.city) && !accessDraft.city.trim()
        ? "Введите город"
        : "",
    companyName:
      (accessAttempted || accessTouched.companyName) &&
      !accessDraft.companyName.trim()
        ? "Введите название агентства"
        : "",
    email:
      (accessAttempted || accessTouched.email) &&
      !isValidWorkspaceEmail(accessDraft.email)
        ? "Введите корректный email"
        : "",
    fullName:
      (accessAttempted || accessTouched.fullName) && !accessDraft.fullName.trim()
        ? "Введите имя и фамилию"
        : "",
    password:
      (accessAttempted || accessTouched.password) && !accessDraft.password.trim()
        ? "Введите пароль"
        : "",
    phone:
      (accessAttempted || accessTouched.phone) && !accessDraft.phone.trim()
        ? "Введите телефон"
        : "",
  } satisfies Record<keyof AccessRequestRegistrationInput, string>;
  const showResetEmailError =
    (resetAttempted || resetEmailTouched) && !isValidWorkspaceEmail(resetEmail);
  const resetEmailError = showResetEmailError ? "Введите корректный email" : "";
  const loginNoteId = error || notice ? "workspace-access-note" : undefined;
  const emailDescribedBy = emailError
    ? loginNoteId
      ? "workspace-email-error workspace-access-note"
      : "workspace-email-error"
    : loginNoteId;
  const passwordDescribedBy = passwordError
    ? loginNoteId
      ? "workspace-password-error workspace-access-note"
      : "workspace-password-error"
    : loginNoteId;

  function handleLoginSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoginAttempted(true);
    if (!isValidWorkspaceEmail(email) || password.trim().length === 0) return;
    onSubmit(event);
  }

  async function handlePasswordResetSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResetAttempted(true);
    setResetError("");
    setResetSuccess("");

    if (!isValidWorkspaceEmail(resetEmail)) return;

    setResetBusy(true);
    try {
      const result = await onPasswordReset(resetEmail);
      if (result.status === "requested") {
        setResetSuccess(result.message);
      } else {
        setResetError(result.message);
      }
    } catch (resetRequestError) {
      setResetError(
        formatPersistenceFailureForUser(
          resetRequestError,
          "Не удалось подготовить восстановление доступа. Попробуйте позже.",
        ),
      );
    } finally {
      setResetBusy(false);
    }
  }

  async function handleAccessRequestSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setAccessAttempted(true);
    setAccessError("");
    setAccessSuccess("");

    const complete =
      accessDraft.fullName.trim() &&
      accessDraft.companyName.trim() &&
      accessDraft.city.trim() &&
      accessDraft.phone.trim() &&
      accessDraft.password.trim() &&
      isValidWorkspaceEmail(accessDraft.email);
    if (!complete) return;

    setAccessBusy(true);
    try {
      const result = await onAccessRequest(accessDraft);
      if (result.status === "requested") {
        setAccessSuccess(result.message);
      } else {
        setAccessError(result.message);
      }
    } catch (accessRequestError) {
      setAccessError(
        isAuthAccessError(accessRequestError)
          ? accessRequestError.message
          : formatPersistenceFailureForUser(
              accessRequestError,
              "Не удалось отправить заявку на доступ. Попробуйте позже.",
            ),
      );
    } finally {
      setAccessBusy(false);
    }
  }

  function openAccessRequest() {
    setAccessDraft((current) => ({
      ...current,
      email,
    }));
    setAccessAttempted(false);
    setAccessTouched({});
    setAccessError("");
    setAccessSuccess("");
    setScreen("register");
  }

  function openPasswordReset() {
    setResetEmail(email);
    setResetAttempted(false);
    setResetEmailTouched(false);
    setResetError("");
    setResetSuccess("");
    setScreen("reset");
  }

  function returnToLogin() {
    setScreen("login");
    setAccessError("");
    setAccessSuccess("");
    setResetError("");
    setResetSuccess("");
  }

  const activeTitleId =
    screen === "login"
      ? "workspace-access-title"
      : screen === "reset"
        ? "workspace-reset-title"
        : "workspace-register-title";
  const activeCopyId =
    screen === "login"
      ? "workspace-access-copy"
      : screen === "reset"
        ? "workspace-reset-copy"
        : "workspace-register-copy";
  const accessTextFields: Array<{
    autoComplete: string;
    id: string;
    inputMode?: "email" | "tel";
    key: Exclude<keyof AccessRequestRegistrationInput, "password">;
    label: string;
    placeholder: string;
    type: "email" | "tel" | "text";
  }> = [
    {
      autoComplete: "name",
      id: "workspace-register-name",
      key: "fullName",
      label: "Имя и фамилия",
      placeholder: "Анна Петрова",
      type: "text",
    },
    {
      autoComplete: "organization",
      id: "workspace-register-company",
      key: "companyName",
      label: "Агентство / компания",
      placeholder: "Visa Center",
      type: "text",
    },
    {
      autoComplete: "address-level2",
      id: "workspace-register-city",
      key: "city",
      label: "Город",
      placeholder: "Москва",
      type: "text",
    },
    {
      autoComplete: "tel",
      id: "workspace-register-phone",
      inputMode: "tel",
      key: "phone",
      label: "Телефон",
      placeholder: "+7 900 000-00-00",
      type: "tel",
    },
    {
      autoComplete: "email",
      id: "workspace-register-email",
      inputMode: "email",
      key: "email",
      label: "Email",
      placeholder: "name@example.com",
      type: "email",
    },
  ];

  return (
    <main className="access-shell" aria-label="Вход в рабочий кабинет">
      <div className="access-layout">
        <section className="access-brand-panel" aria-label="VisaFlow">
          <div className="access-brand-markline">
            <div className="access-brand-copy">
              <p
                className="access-kicker vf-brand-wordmark vf-brand-wordmark--hero"
                aria-label="VisaFlow 19"
              >
                <span
                  className="vf-brand-capital vf-brand-capital--hero"
                  aria-hidden="true"
                >
                  <img className="vf-brand-capital-image" src={visaOpsLogo} alt="" />
                </span>
                <span className="vf-brand-tail" aria-hidden="true">
                  VisaFlow
                </span>
                <span className="vf-brand-comma-version" aria-hidden="true">
                  19
                </span>
              </p>
            </div>
          </div>
          <div className="access-brand-message">
            <p className="access-brand-title">Операционный вход в платформу</p>
            <p className="access-brand-text">Кабинет для испанских подач.</p>
          </div>
        </section>

        <section
          className="access-card"
          aria-labelledby={activeTitleId}
          aria-describedby={activeCopyId}
        >
          {screen === "login" ? (
            <>
              <div className="access-card-header">
                <div>
                  <p className="access-kicker">VisaFlow</p>
                  <h1 id="workspace-access-title">Вход</h1>
                </div>
              </div>
              <p className="access-intro" id="workspace-access-copy">
                Введите email и пароль для доступа к кабинету.
              </p>
              <form className="access-form" onSubmit={handleLoginSubmit} noValidate>
                <div className="access-field">
                  <label className="access-field-label" htmlFor="workspace-email">
                    Email
                  </label>
                  <input
                    aria-describedby={emailDescribedBy}
                    aria-invalid={Boolean(emailError)}
                    autoComplete="email"
                    id="workspace-email"
                    inputMode="email"
                    name="email"
                    placeholder="name@example.com"
                    type="email"
                    value={email}
                    onBlur={() => setEmailTouched(true)}
                    onChange={(event) => onEmail(event.target.value)}
                  />
                  {emailError ? (
                    <small className="access-field-error" id="workspace-email-error">
                      {emailError}
                    </small>
                  ) : null}
                </div>

                <div className="access-field">
                  <label className="access-field-label" htmlFor="workspace-password">
                    Пароль
                  </label>
                  <div className="access-password-control">
                    <input
                      aria-describedby={passwordDescribedBy}
                      aria-invalid={Boolean(passwordError)}
                      autoComplete="current-password"
                      id="workspace-password"
                      name="password"
                      placeholder="Введите пароль"
                      type={passwordVisible ? "text" : "password"}
                      value={password}
                      onBlur={() => setPasswordTouched(true)}
                      onChange={(event) => onPassword?.(event.target.value)}
                    />
                    <button
                      className="access-password-toggle"
                      type="button"
                      aria-label={passwordVisible ? "Скрыть пароль" : "Показать пароль"}
                      aria-pressed={passwordVisible}
                      onClick={() => setPasswordVisible((visible) => !visible)}
                    >
                      {passwordVisible ? (
                        <EyeOff aria-hidden="true" />
                      ) : (
                        <Eye aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  {passwordError ? (
                    <small className="access-field-error" id="workspace-password-error">
                      {passwordError}
                    </small>
                  ) : null}
                </div>

                {error ? (
                  <p className="access-error" id="workspace-access-note" role="alert">
                    {error}
                  </p>
                ) : notice ? (
                  <p className="access-note" id="workspace-access-note" role="status">
                    {notice}
                  </p>
                ) : null}

                <Button className="access-submit" type="submit" disabled={busy}>
                  {busy ? "Входим..." : "Войти"}
                </Button>
              </form>

              <div className="access-secondary-actions">
                <button
                  className="access-secondary-link"
                  type="button"
                  onClick={openAccessRequest}
                >
                  Подать заявку на доступ
                </button>
                <span className="access-secondary-divider" aria-hidden="true">
                  ·
                </span>
                <button
                  className="access-secondary-link"
                  type="button"
                  onClick={openPasswordReset}
                >
                  Забыли пароль?
                </button>
              </div>
            </>
          ) : screen === "reset" ? (
            <>
              <button className="access-back-button" type="button" onClick={returnToLogin}>
                <ArrowLeft aria-hidden="true" />
                Вернуться ко входу
              </button>
              <div className="access-card-header">
                <div>
                  <p className="access-kicker">Безопасное восстановление</p>
                  <h1 id="workspace-reset-title">Восстановление доступа</h1>
                </div>
              </div>
              <p className="access-intro" id="workspace-reset-copy">
                Укажите email, и мы отправим инструкции, если аккаунт существует.
              </p>
              <form className="access-form" onSubmit={handlePasswordResetSubmit} noValidate>
                <div className="access-field">
                  <label className="access-field-label" htmlFor="workspace-reset-email">
                    Email
                  </label>
                  <input
                    aria-describedby={
                      resetEmailError ? "workspace-reset-email-error" : undefined
                    }
                    aria-invalid={Boolean(resetEmailError)}
                    autoComplete="email"
                    id="workspace-reset-email"
                    inputMode="email"
                    name="email"
                    placeholder="name@example.com"
                    type="email"
                    value={resetEmail}
                    onBlur={() => setResetEmailTouched(true)}
                    onChange={(event) => setResetEmail(event.target.value)}
                  />
                  {resetEmailError ? (
                    <small className="access-field-error" id="workspace-reset-email-error">
                      {resetEmailError}
                    </small>
                  ) : null}
                </div>

                {resetError ? (
                  <p className="access-error" role="alert">
                    {resetError}
                  </p>
                ) : resetSuccess ? (
                  <p className="access-success" role="status">
                    {resetSuccess}
                  </p>
                ) : (
                  <p className="access-note">
                    Мы не раскрываем, существует ли аккаунт с указанным email.
                  </p>
                )}

                <Button className="access-submit" type="submit" disabled={resetBusy}>
                  {resetBusy ? "Отправляем..." : "Отправить инструкции"}
                </Button>
              </form>
            </>
          ) : (
            <>
              <button className="access-back-button" type="button" onClick={returnToLogin}>
                <ArrowLeft aria-hidden="true" />
                Вернуться ко входу
              </button>
              <div className="access-card-header">
                <div>
                  <p className="access-kicker">Первый вход</p>
                  <h1 id="workspace-register-title">Заявка на доступ</h1>
                </div>
              </div>
              <p className="access-intro" id="workspace-register-copy">
                Заполните данные агентства. Доступ появится после подтверждения
                администратором.
              </p>
              <form className="access-form" onSubmit={handleAccessRequestSubmit} noValidate>
                {accessTextFields.map((field) => {
                  const errorId = `${field.id}-error`;
                  const fieldError = accessErrors[field.key];

                  return (
                    <div className="access-field" key={field.key}>
                      <label className="access-field-label" htmlFor={field.id}>
                        {field.label}
                      </label>
                      <input
                        aria-describedby={fieldError ? errorId : undefined}
                        aria-invalid={Boolean(fieldError)}
                        autoComplete={field.autoComplete}
                        id={field.id}
                        inputMode={field.inputMode}
                        name={field.key}
                        placeholder={field.placeholder}
                        type={field.type}
                        value={accessDraft[field.key]}
                        onBlur={() =>
                          setAccessTouched((current) => ({
                            ...current,
                            [field.key]: true,
                          }))
                        }
                        onChange={(event) =>
                          setAccessDraft((current) => ({
                            ...current,
                            [field.key]: event.target.value,
                          }))
                        }
                      />
                      {fieldError ? (
                        <small className="access-field-error" id={errorId}>
                          {fieldError}
                        </small>
                      ) : null}
                    </div>
                  );
                })}

                <div className="access-field">
                  <label className="access-field-label" htmlFor="workspace-register-password">
                    Пароль
                  </label>
                  <div className="access-password-control">
                    <input
                      aria-describedby={
                        accessErrors.password
                          ? "workspace-register-password-error"
                          : undefined
                      }
                      aria-invalid={Boolean(accessErrors.password)}
                      autoComplete="new-password"
                      id="workspace-register-password"
                      name="password"
                      placeholder="Введите пароль"
                      type={accessPasswordVisible ? "text" : "password"}
                      value={accessDraft.password}
                      onBlur={() =>
                        setAccessTouched((current) => ({
                          ...current,
                          password: true,
                        }))
                      }
                      onChange={(event) =>
                        setAccessDraft((current) => ({
                          ...current,
                          password: event.target.value,
                        }))
                      }
                    />
                    <button
                      className="access-password-toggle"
                      type="button"
                      aria-label={
                        accessPasswordVisible ? "Скрыть пароль" : "Показать пароль"
                      }
                      aria-pressed={accessPasswordVisible}
                      onClick={() => setAccessPasswordVisible((visible) => !visible)}
                    >
                      {accessPasswordVisible ? (
                        <EyeOff aria-hidden="true" />
                      ) : (
                        <Eye aria-hidden="true" />
                      )}
                    </button>
                  </div>
                  {accessErrors.password ? (
                    <small
                      className="access-field-error"
                      id="workspace-register-password-error"
                    >
                      {accessErrors.password}
                    </small>
                  ) : null}
                </div>

                {accessError ? (
                  <p className="access-error" role="alert">
                    {accessError}
                  </p>
                ) : accessSuccess ? (
                  <p className="access-success" role="status">
                    {accessSuccess}
                  </p>
                ) : (
                  <p className="access-note">
                    Регистрация не активирует аккаунт автоматически. Заявка ожидает
                    подтверждения администратора.
                  </p>
                )}

                <Button className="access-submit" type="submit" disabled={accessBusy}>
                  {accessBusy ? "Отправляем..." : "Подать заявку на доступ"}
                </Button>
              </form>
            </>
          )}
        </section>
      </div>
    </main>
  );
}

function WorkspaceAccessStatusGate({
  onSignOut,
  session,
}: {
  onSignOut: () => void;
  session: LocalAuthSession;
}) {
  const rejected = session.approvalStatus === "rejected";
  const title = rejected ? "Заявка отклонена" : "Ожидает подтверждения";
  const copy = rejected
    ? "Доступ к кабинету не активирован."
    : "Заявка отправлена. Доступ появится после подтверждения администратором.";

  return (
    <main className="access-shell" aria-label="Статус доступа">
      <section className="access-card access-status-card" aria-labelledby="access-status-title">
        <p className="access-kicker">Заявка на доступ</p>
        <h1 id="access-status-title">{title}</h1>
        <p className="access-intro">{copy}</p>
        <div
          className={rejected ? "access-error" : "access-note"}
          role={rejected ? "alert" : "status"}
        >
          {rejected && session.rejectionReason ? (
            <>Причина: {session.rejectionReason}</>
          ) : rejected ? (
            <>Администратор отклонил заявку.</>
          ) : (
            <>Доступ появится после подтверждения администратором.</>
          )}
        </div>
        <Button className="access-submit" type="button" onClick={onSignOut}>
          Выйти
        </Button>
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
