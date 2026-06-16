import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { supabaseRuntimeConfig } from "./lib/supabase/config";
import { Button, SearchBar, Select } from "./shared/ui/primitives";
import {
  acceptAiSuggestionAsIssue,
  dismissAiSuggestion,
  runAiReview,
} from "./modules/submissions/aiSuggestions";
import { exportSummary } from "./modules/submissions/exportRules";
import { loadSubmissions, saveSubmissions } from "./modules/submissions/persistence";
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
  readyForExport,
  reviewQueue,
  searchSubmissions,
} from "./modules/submissions/selectors";
import {
  addPreciseAdminIssue,
  applyActionToSubmissionList,
  applyExportStateToSelection,
  createDraftSubmission,
  updateQuestionnaireField,
  uploadRequiredFile,
} from "./modules/submissions/submissionActions";
import { completeExportPackage } from "./modules/submissions/exportWorkflow";
import { canAddAdminIssue, defaultDrawerTab } from "./modules/submissions/status";
import { CreateSubmissionDrawer } from "./modules/submissions/components/CreateSubmissionDrawer";
import { ConfirmationDialog } from "./modules/submissions/components/Primitives";
import { SubmissionDrawer } from "./modules/submissions/components/SubmissionDrawer";
import {
  AdminReviewScreen,
  AgentSubmissionsScreen,
  ExportScreen,
} from "./modules/submissions/pages/OperationsScreens";
import type {
  City,
  DrawerTab,
  IssueInput,
  Role,
  Submission,
  SubmissionAction,
  Surface,
  QuestionnaireField,
} from "./modules/submissions/types";
import {
  type AgentTab,
  type CreateStep,
  type DrawerMode,
  type ExportTab,
  matchesAgentTab,
  matchesReviewTab,
  surfaceDescription,
  type ReviewTab,
  surfaceTitle,
} from "./modules/submissions/uiTypes";
import {
  getCurrentAppSession,
  signInSupabaseWithPassword,
  signOutCurrentSession,
} from "./services/authService";
import { formatPersistenceFailureForUser } from "./services/persistenceObservability";
import type { AppProfile } from "./types/session";

const cities: Array<City | "Все города"> = [
  "Все города",
  "Москва",
  "Санкт-Петербург",
  "Казань",
];
const workspaceEmailStorageKey = "visaflow.workspaceEmail.v1";
const fallbackAdminEmails = ["admin@visaflow.local"];
const fallbackAgentEmails = ["agent@visaflow.local"];

type IssueComposerRequest = {
  submissionId: string;
  token: number;
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

function firstSubmissionForRole(submissions: Submission[], role: Role) {
  if (role === "admin") return reviewQueue(submissions)[0] ?? submissions[0];
  return agentQueue(submissions)[0] ?? submissions[0];
}

function App() {
  const isSupabaseMode = supabaseRuntimeConfig.selected === "supabase";
  const [workspaceEmail, setWorkspaceEmail] = useState(loadWorkspaceEmail);
  const initialWorkspaceRole = resolveWorkspaceRole(workspaceEmail) ?? "agent";
  const [role, setRole] = useState<Role>(initialWorkspaceRole);
  const [workspaceEmailDraft, setWorkspaceEmailDraft] = useState(workspaceEmail);
  const [workspacePasswordDraft, setWorkspacePasswordDraft] = useState("");
  const [workspaceAccessError, setWorkspaceAccessError] = useState("");
  const [authChecked, setAuthChecked] = useState(!isSupabaseMode);
  const [loginBusy, setLoginBusy] = useState(false);
  const [remoteProfile, setRemoteProfile] = useState<AppProfile | null>(null);
  const [remoteSaveState, setRemoteSaveState] = useState<
    "idle" | "loading" | "saving" | "error"
  >("idle");
  const [remoteSaveError, setRemoteSaveError] = useState("");
  const [surface, setSurface] = useState<Surface>(
    initialWorkspaceRole === "admin" ? "admin-review" : "agent-submissions",
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
  const [dirty, setDirty] = useState(false);
  const [confirmClose, setConfirmClose] = useState(false);
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
  const [createStep, setCreateStep] = useState<CreateStep>("params");
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
  const remoteOwnerIdsRef = useRef<Map<string, string>>(new Map());
  const remoteSubmissionFingerprintsRef = useRef<Map<string, string>>(new Map());
  const skipNextRemoteSaveRef = useRef(false);
  const remoteSaveTimerRef = useRef<number | null>(null);
  const remoteSavePromiseRef = useRef<Promise<void> | null>(null);

  const activeSubmission =
    submissions.find((submission) => submission.id === selectedSubmissionId) ??
    submissions[0];
  const summary = counts(submissions);

  const searchedAgentQueue = useMemo(
    () => searchSubmissions(agentQueue(submissions), query, cityFilter),
    [cityFilter, query, submissions],
  );
  const searchedReviewQueue = useMemo(
    () => searchSubmissions(reviewQueue(submissions), query, cityFilter),
    [cityFilter, query, submissions],
  );
  const agentList = highestPriorityFirst(
    searchedAgentQueue.filter(matchesAgentTab(agentTab)),
  );
  const reviewList = highestPriorityFirst(
    searchedReviewQueue.filter(matchesReviewTab(reviewTab)),
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
    (import.meta.env.DEV || import.meta.env.VITE_ENABLE_ROLE_SWITCH === "true");
  const resolvedWorkspaceRole = resolveWorkspaceRole(workspaceEmail);
  const hasWorkspaceAccess = isSupabaseMode
    ? Boolean(remoteProfile)
    : showRoleSwitcher || Boolean(resolvedWorkspaceRole);
  const emptyRemoteWorkspace =
    isSupabaseMode && Boolean(remoteProfile) && authChecked && submissions.length === 0;

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
        : surface === "agent-submissions"
          ? agentList
          : [];

    if (visibleList.length === 0) return;
    if (visibleList.some((submission) => submission.id === selectedSubmissionId))
      return;
    setSelectedSubmissionId(visibleList[0].id);
  }, [agentList, drawerMode, reviewList, selectedSubmissionId, surface]);

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

  function focusActiveDrawerTab() {
    requestAnimationFrame(() => {
      document
        .querySelector<HTMLElement>(
          ".submission-drawer [role='tab'][aria-selected='true']",
        )
        ?.focus({ preventScroll: true });
    });
  }

  function chooseRole(nextRole: Role) {
    if (isSupabaseMode) return;
    setRole(nextRole);
    setDrawerMode("closed");
    setDirty(false);
    if (nextRole === "agent") {
      setSurface("agent-submissions");
      setSelectedSubmissionId(submissions[0]?.id ?? "");
    } else {
      setSurface("admin-review");
      const firstReview = reviewQueue(submissions)[0] ?? submissions[0];
      setSelectedSubmissionId(firstReview?.id ?? "");
    }
  }

  function openSubmission(submission: Submission, tab = defaultDrawerTab(submission)) {
    rememberReturnFocus();
    setSelectedSubmissionId(submission.id);
    setActiveDrawerTab(tab);
    setDrawerMode("detail");
  }

  function selectSubmission(submission: Submission) {
    setSelectedSubmissionId(submission.id);
    setActiveDrawerTab(defaultDrawerTab(submission));
  }

  function closeDrawer() {
    if (dirty) {
      setConfirmClose(true);
      return;
    }
    setDrawerMode("closed");
  }

  function updateActiveSubmission(transform: (submission: Submission) => Submission) {
    if (!activeSubmission) return;
    setSubmissions((current) =>
      current.map((submission) =>
        submission.id === activeSubmission.id ? transform(submission) : submission,
      ),
    );
  }

  function updateSubmission(action: SubmissionAction) {
    if (!activeSubmission) return;
    const nextSubmissions = applyActionToSubmissionList(
      submissions,
      activeSubmission.id,
      action,
      role,
    );
    setSubmissions(nextSubmissions);
    const updated = nextSubmissions.find(
      (submission) => submission.id === activeSubmission.id,
    );
    if (updated) setActiveDrawerTab(defaultDrawerTab(updated));
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
    updateActiveSubmission((submission) => addPreciseAdminIssue(submission, input));
    setActiveDrawerTab("issues");
    setDrawerMode("detail");
  }

  function uploadActiveFile(fileId: string) {
    updateActiveSubmission((submission) => uploadRequiredFile(submission, fileId));
    setActiveDrawerTab("files");
  }

  function updateActiveQuestionnaireField(input: {
    applicantId: string;
    sectionId: string;
    fieldId: QuestionnaireField["id"];
    value: string;
  }) {
    updateActiveSubmission((submission) => updateQuestionnaireField(submission, input));
  }

  function runAiReviewForActiveSubmission() {
    if (!activeSubmission) return;
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

  function createDraft() {
    const newSubmission = createDraftSubmission({
      applicantNames: createApplicantNames,
      city: createCity,
      familyCount: createFamilyCount,
      submissions,
      type: createType,
    });
    setSubmissions((current) => [newSubmission, ...current]);
    setSelectedSubmissionId(newSubmission.id);
    setDrawerMode("detail");
    setActiveDrawerTab("overview");
    setDirty(false);
  }

  function toggleExportSelection(id: string) {
    setSelectedExportIds((current) =>
      current.includes(id) ? current.filter((item) => item !== id) : [...current, id],
    );
  }

  function generateExport() {
    if (!exportPlan.canGenerate) return;
    setSubmissions((current) =>
      applyExportStateToSelection(current, selectedVisibleExportIds, "file_generated"),
    );
  }

  function downloadExport() {
    if (!exportPlan.canDownload) return;
    setSubmissions((current) =>
      applyExportStateToSelection(current, selectedVisibleExportIds, "file_downloaded"),
    );
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
      setSubmissions((current) =>
        current.map((submission) => exportedById.get(submission.id) ?? submission),
      );
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
    const nextSubmissions = remoteSubmissions;
    const nextRole = profile.role;
    const firstSubmission = firstSubmissionForRole(nextSubmissions, nextRole);

    remoteOwnerIdsRef.current = ownerIdsBySubmissionId;
    remoteSubmissionFingerprintsRef.current =
      cockpitSubmissionFingerprintMap(nextSubmissions);
    skipNextRemoteSaveRef.current = true;
    setRemoteProfile(profile);
    setRole(nextRole);
    setSurface(nextRole === "admin" ? "admin-review" : "agent-submissions");
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
      setWorkspaceAccessError("");
      const localSubmissions = loadSubmissions();
      setSubmissions(localSubmissions);
      setSelectedSubmissionId(
        firstSubmissionForRole(localSubmissions, "agent")?.id ?? "",
      );
      setRole("agent");
      setSurface("agent-submissions");
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
      placeholder="имя, номер, заявитель, статус"
      value={query}
      onChange={setQuery}
    />
  );
  const cityFilterControl = (
    <Select
      aria-label="Фильтр по городу"
      containerClassName="topbar-filter panel-filter"
      fieldClassName=""
      label="Город"
      options={cities.map((city) => ({ label: city, value: city }))}
      selectClassName="select-control"
      value={cityFilter}
      onChange={(event) =>
        setCityFilter(event.target.value as City | "Все города")
      }
    />
  );

  if (!hasWorkspaceAccess) {
    return (
      <WorkspaceAccessGate
        busy={loginBusy || !authChecked}
        email={workspaceEmailDraft}
        error={workspaceAccessError}
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
      className={`ops-shell ${drawerMode !== "closed" ? "has-open-drawer" : ""}`}
      aria-label="Рабочая область подач"
    >
      <aside className="left-rail" aria-label="Основная навигация">
        <div className="rail-mark" aria-label="VisaFlow">
          <span>VF</span>
          <strong>VisaFlow</strong>
        </div>
        <nav className="rail-nav" aria-label="Навигация">
          {role === "agent" ? (
            <>
              <Button
                className="rail-item is-active"
                aria-current="page"
                variant="ghost"
                onClick={() => setSurface("agent-submissions")}
              >
                <span className="rail-icon" aria-hidden="true">
                  П
                </span>
                <span>Мои подачи</span>
              </Button>
              <Button
                className="rail-item rail-create"
                aria-label="Новая подача"
                variant="ghost"
                onClick={() => {
                  rememberReturnFocus();
                  setDrawerMode("create");
                  setCreateStep("params");
                  setCreateType("single");
                  setCreateFamilyCount(2);
                  setCreateApplicantNames([
                    "Новый заявитель",
                    "Супруг",
                    "Ребёнок 1",
                    "Ребёнок 2",
                  ]);
                  setDirty(false);
                }}
              >
                <span className="rail-icon" aria-hidden="true">
                  +
                </span>
              </Button>
            </>
          ) : (
            <>
              <Button
                className={`rail-item ${surface === "admin-review" ? "is-active" : ""}`}
                aria-current={surface === "admin-review" ? "page" : undefined}
                variant="ghost"
                onClick={() => {
                  setSurface("admin-review");
                  const firstReview = reviewList[0] ?? reviewQueue(submissions)[0];
                  if (firstReview) setSelectedSubmissionId(firstReview.id);
                }}
              >
                <span className="rail-icon" aria-hidden="true">
                  П
                </span>
                <span>Проверка</span>
              </Button>
              <Button
                className={`rail-item ${surface === "export" ? "is-active" : ""}`}
                aria-current={surface === "export" ? "page" : undefined}
                variant="ghost"
                onClick={() => setSurface("export")}
              >
                <span className="rail-icon" aria-hidden="true">
                  Э
                </span>
                <span>Выгрузка</span>
              </Button>
            </>
          )}
        </nav>
        {showRoleSwitcher ? (
          <Button
            className="rail-user"
            aria-label="Сменить роль"
            variant="ghost"
            onClick={() => chooseRole(role === "agent" ? "admin" : "agent")}
          >
            <span>{role === "agent" ? "АГ" : "АД"}</span>
            <small>Демо</small>
          </Button>
        ) : (
          <Button
            className="rail-user"
            aria-label="Выйти из рабочей области"
            variant="ghost"
            onClick={resetWorkspaceEmail}
          >
            <span>ВЫХ</span>
            <small>Выход</small>
          </Button>
        )}
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="kicker">
              {role === "agent"
                ? "Рабочее место агента"
                : "Рабочее место администратора"}
            </p>
            <h1>{surfaceTitle(surface)}</h1>
            <p className="topbar-copy">{surfaceDescription(surface)}</p>
          </div>
          <div className="topbar-actions">
            <div className="service-logo" aria-label="VisaFlow V-19">
              <span className="service-logo-mark" aria-hidden="true">
                VF
              </span>
              <span className="service-logo-copy">
                <span>VisaFlow</span>
                <strong>V-19</strong>
              </span>
            </div>
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
        </header>

        {emptyRemoteWorkspace ? (
          <RemoteWorkspaceEmptyState
            role={role}
            onCreate={
              role === "agent"
                ? () => {
                    rememberReturnFocus();
                    setDrawerMode("create");
                    setCreateStep("params");
                    setCreateType("single");
                    setCreateFamilyCount(2);
                    setCreateApplicantNames([
                      "Новый заявитель",
                      "Супруг",
                      "Ребёнок 1",
                      "Ребёнок 2",
                    ]);
                    setDirty(false);
                  }
                : undefined
            }
          />
        ) : surface === "agent-submissions" && activeSubmission ? (
          <AgentSubmissionsScreen
            activeSubmission={activeSubmission}
            agentList={agentList}
            agentTab={agentTab}
            filterControl={cityFilterControl}
            onOpen={openSubmission}
            onSelect={selectSubmission}
            onTab={setAgentTab}
            searchControl={searchControl}
            summary={summary}
          />
        ) : null}

        {surface === "admin-review" && activeSubmission ? (
          <AdminReviewScreen
            activeSubmission={activeSubmission}
            filterControl={cityFilterControl}
            onAddIssue={() => openIssueComposer(activeSubmission)}
            onOpen={openSubmission}
            onSelect={selectSubmission}
            onTab={setReviewTab}
            reviewList={reviewList}
            reviewTab={reviewTab}
            searchControl={searchControl}
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
      </section>

      {drawerMode === "detail" && activeSubmission ? (
        <SubmissionDrawer
          activeTab={activeDrawerTab}
          issueComposerRequest={issueComposerRequest}
          onIssueComposerConsumed={() => setIssueComposerRequest(null)}
          onAction={updateSubmission}
          onAddIssue={addAdminIssue}
          onAcceptAiSuggestion={acceptAiSuggestionForActiveSubmission}
          onClose={closeDrawer}
          onDismissAiSuggestion={dismissAiSuggestionForActiveSubmission}
          onRunAiReview={runAiReviewForActiveSubmission}
          onTab={setActiveDrawerTab}
          onQuestionnaireField={updateActiveQuestionnaireField}
          onUploadFile={uploadActiveFile}
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
        <CreateSubmissionDrawer
          city={createCity}
          applicantNames={createApplicantNames}
          dirty={dirty}
          familyCount={createFamilyCount}
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
          onApplicantName={(index, name) => {
            setCreateApplicantNames((current) => {
              const next = normalizeCreateApplicantNames(current, createFamilyCount);
              next[index] = name;
              return next;
            });
            setDirty(true);
          }}
          onStep={setCreateStep}
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
          step={createStep}
          type={createType}
        />
      ) : null}

      {confirmClose ? (
        <ConfirmationDialog
          onCancel={() => {
            setConfirmClose(false);
            focusActiveDrawerTab();
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

function WorkspaceAccessGate({
  busy = false,
  email,
  error,
  onEmail,
  onPassword,
  onSubmit,
  password = "",
  requiresPassword = false,
}: {
  busy?: boolean;
  email: string;
  error: string;
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
          Введите рабочую почту, чтобы открыть свой рабочий стол.
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
          ) : (
            <p className="access-note" id="workspace-access-note">
              {busy
                ? "Проверяем текущую сессию."
                : requiresPassword
                  ? "Вход идёт через Supabase Auth."
                  : "Доступ откроется после проверки почты."}
            </p>
          )}
          <Button type="submit" disabled={busy}>
            {busy ? "Проверяем" : "Войти"}
          </Button>
        </form>
      </section>
    </main>
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
      {onCreate ? (
        <Button onClick={onCreate}>
          Новая подача
        </Button>
      ) : null}
    </section>
  );
}

export default App;
