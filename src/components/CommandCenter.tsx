import { useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { ArrowUpDown, Plus, RotateCcw, X } from "lucide-react";
import { QuestionnaireScreen } from "./QuestionnaireScreen";
import type { QuestionnaireInitialFocus } from "../modules/submissions/components/FigmaQuestionnaireScreen";
import {
  ApplicantsScreen,
  type ApplicantFocusRequest,
  type SubmissionTypeFilter,
} from "./ApplicantsScreen";
import { AgentReturnPackagesPanel } from "./AgentReturnPackagesPanel";
import { WorkspaceExperienceSettingsScreen } from "./AdminSystemSettingsScreen";
import { PreUploadScreen } from "./PreUploadScreen";
import { CommandPalette } from "../modules/submissions/components/CommandPalette";
import {
  AppShell,
  PageHeader,
  PageHeaderMenuButton,
} from "../modules/submissions/components/AppShell";
import {
  v19SideMenuDesktopMinWidth,
  v19SideMenuId,
} from "../shared/ui/v19-design-system";
import { Drawer } from "./Drawer";
import { workspaceSurfaceMotion } from "./workspaceSurfaceMotion";
import {
  emitVisaflowUiEvent,
  useVisaflowBusinessBridge,
  type AgentNavSection,
} from "../integration/visaflowBusinessBridge";
import {
  V19ListHeader,
  V19QueueToolbar,
  V19ToolbarSelect,
} from "../shared/ui/v19-design-system";
import { createDraft } from "../modules/submissions/domainEngine";
import type {
  DrawerTab,
  Submission,
  SubmissionAction,
  SubmissionFileType,
} from "../modules/submissions/types";
import {
  targetForIssue,
  type WorkspaceTarget,
} from "../modules/submissions/workspaceModel";
import {
  listItemsFromSubmissions,
  type LegacyAgentNavSection,
  type LegacySubmissionListItem,
} from "./v19BusinessScreenAdapter";
import type {
  SubmissionIntakeIntent,
  SubmissionIntakeProgressListener,
} from "../modules/submissions/submissionIntake";
import {
  agentActionQueue,
  agentActionWorkspaceTarget,
  buildAgentActionTasks,
  searchAgentActions,
  summarizeAgentActionTasks,
  type AgentActionDue,
  type AgentActionItem,
  type AgentActionTask,
} from "../modules/submissions/agentActions";
import { AgentActionsCommandCockpit } from "../modules/submissions/components/AgentActionsCommandCockpit";
import {
  AgentActionStatusStrip,
  type AgentActionFilter,
  type AgentActionFilterCounts,
} from "../modules/submissions/components/AgentActionStatusStrip";
import {
  agentAgencyLabel,
  agentDisplayName,
  agentInitials,
} from "../modules/submissions/agentDirectory";
import { cityFilterValuesForSubmissions } from "../modules/submissions/selectors";
import {
  generatedCockpitMediaFileName,
  ensureApplicantMediaSlot,
  mediaSlotTypeForSubmissionFileType,
  uploadRequiredFile,
} from "../modules/submissions/submissionActions";
import {
  buildMediaStoragePath,
  mediaMimeTypeForFile,
  uploadMediaToStorage,
} from "../modules/submissions/mediaStorage";
import {
  applyAgentSubmitForReviewResult,
  applySubmissionActionResult,
  canReplaceDocument,
  markSubmissionIssueFixedResult,
} from "../modules/submissions/status";
import { persistCreatedSubmissionWithPassports } from "../modules/submissions/createSubmissionPassportUseCase";
import type { PublicNumberAssignment } from "../modules/submissions/supabasePersistence";
import { agentInteractionProps } from "../modules/submissions/agentInteractionContract";

export type SubmissionListItem = LegacySubmissionListItem;

type ViewState = "main" | "questionnaire";
type NonCreateAgentShellNavSection = Extract<
  LegacyAgentNavSection,
  "actions" | "submissions" | "settings"
>;
type AgentShellNavSection = NonCreateAgentShellNavSection | "create";
type ActionSort = "tripDate" | "createdAt";
type CreateNavigationState = {
  busy: boolean;
  dirty: boolean;
};

const initialCreateNavigationState: CreateNavigationState = {
  busy: false,
  dirty: false,
};

type CommandCenterProps = {
  agentId?: Submission["agentId"];
  onAssignPublicNumber?: (submissionId: string) => Promise<PublicNumberAssignment>;
  onSubmissionUpdate?: (
    submissionId: string,
    update: (submission: Submission) => Submission,
  ) => Promise<Submission>;
  onSubmissionsChange?: (submissions: Submission[]) => void | Promise<void>;
  reservedSubmissionIds?: readonly Submission["id"][];
  submissions?: Submission[];
  onSignOut?: () => void | Promise<void>;
  onSwitchWorkspace?: () => void;
  onNavigateSettings?: () => void;
  usesSupabase?: boolean;
};

function canonicalBridgeNav(section: LegacyAgentNavSection): AgentNavSection | null {
  if (section === "actions" || section === "submissions" || section === "settings")
    return section;
  return null;
}

function navLabel(section: AgentShellNavSection) {
  switch (section) {
    case "actions":
      return "Мои действия";
    case "create":
      return "Новая подача";
    case "submissions":
      return "Мои подачи";
    case "settings":
      return "Настройки";
  }
}

function normalizeAgentNav(
  section: LegacyAgentNavSection,
): NonCreateAgentShellNavSection {
  if (section === "applicants") return "submissions";
  if (section === "drafts") return "submissions";
  if (section === "documents" || section === "files" || section === "media") {
    return "submissions";
  }
  if (section === "issues") return "actions";
  return section;
}

export function CommandCenter({
  agentId,
  onAssignPublicNumber,
  onSubmissionUpdate,
  onSubmissionsChange,
  reservedSubmissionIds,
  submissions: canonicalSubmissions,
  onSignOut,
  onNavigateSettings,
  usesSupabase = false,
}: CommandCenterProps) {
  const bridge = useVisaflowBusinessBridge();
  const prefersReducedMotion = useReducedMotion();
  const activeNavMotion = workspaceSurfaceMotion(Boolean(prefersReducedMotion));
  const [activeNav, setActiveNav] = useState<AgentShellNavSection>("actions");
  const [createOriginNav, setCreateOriginNav] =
    useState<NonCreateAgentShellNavSection>("actions");
  const [createNavigationState, setCreateNavigationState] =
    useState<CreateNavigationState>(initialCreateNavigationState);
  const [pendingCreateExit, setPendingCreateExit] =
    useState<NonCreateAgentShellNavSection | null>(null);
  const [currentView, setCurrentView] = useState<ViewState>("main");
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const [questionnaireInitialFocus, setQuestionnaireInitialFocus] =
    useState<QuestionnaireInitialFocus>();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerActiveTab, setDrawerActiveTab] = useState<DrawerTab>("overview");
  const [drawerFocusTarget, setDrawerFocusTarget] = useState<WorkspaceTarget>();
  const [submissionTypeFilter, setSubmissionTypeFilter] =
    useState<SubmissionTypeFilter>("single");
  const [submissionFocusRequest, setSubmissionFocusRequest] =
    useState<ApplicantFocusRequest>();
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [actionSummaryFilter, setActionSummaryFilter] =
    useState<AgentActionFilter>("open");
  const [actionCityFilter, setActionCityFilter] = useState("Все города");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionSort, setActionSort] = useState<ActionSort>("tripDate");
  const [selectedActionTaskId, setSelectedActionTaskId] = useState<string | null>(null);
  const questionnaireOriginFocusRef = useRef<HTMLElement | null>(null);
  const questionnaireOriginSurfaceRef = useRef<"drawer" | "workspace">("workspace");
  const questionnaireSubmissionSnapshotRef = useRef<Submission | undefined>(undefined);
  const commandPaletteFocusOriginRef = useRef<HTMLElement | null>(null);
  const createExitFocusOriginRef = useRef<HTMLElement | null>(null);
  const createExitDialogRef = useRef<HTMLElement | null>(null);
  const [canonicalOverrides, setCanonicalOverrides] = useState<
    Record<string, Submission>
  >({});
  const pendingCreatedSubmissionRef = useRef<Submission | null>(null);
  const createSubmissionPromiseRef = useRef<Promise<void> | null>(null);
  const attemptedCreateStoragePathsRef = useRef(new Set<string>());
  const legacyMigrationStartedRef = useRef(false);

  const effectiveCanonicalSubmissions = useMemo(() => {
    const byId = new Map(
      (canonicalSubmissions ?? []).map((submission) => [submission.id, submission]),
    );
    for (const submission of Object.values(canonicalOverrides)) {
      byId.set(submission.id, submission);
    }
    return [...byId.values()];
  }, [canonicalOverrides, canonicalSubmissions]);

  useEffect(() => {
    if (!canonicalSubmissions?.length || !Object.keys(canonicalOverrides).length)
      return;
    setCanonicalOverrides((current) => {
      const next = { ...current };
      let changed = false;
      for (const [id, override] of Object.entries(current)) {
        if (
          canonicalSubmissions.find((submission) => submission.id === id) === override
        ) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? next : current;
    });
  }, [canonicalOverrides, canonicalSubmissions]);

  const canonicalRows = useMemo(
    () => listItemsFromSubmissions(effectiveCanonicalSubmissions),
    [effectiveCanonicalSubmissions],
  );
  const rows = canonicalRows;
  const actionQueue = useMemo(
    () => agentActionQueue(effectiveCanonicalSubmissions),
    [effectiveCanonicalSubmissions],
  );
  const actionFilterCounts: AgentActionFilterCounts = {
    blockers: actionQueue.open.filter((action) => action.severity === "blocker").length,
    completed: actionQueue.completed.length,
    open: actionQueue.open.length,
    today: actionQueue.open.filter((action) => action.due === "today").length,
    week: actionQueue.open.filter(
      (action) => action.due === "today" || action.due === "week",
    ).length,
  };
  const actionCityOptions = useMemo(
    () => cityFilterValuesForSubmissions(effectiveCanonicalSubmissions),
    [effectiveCanonicalSubmissions],
  );
  const visibleActions = useMemo(() => {
    const matchesFilter = (due: AgentActionDue) => {
      if (actionSummaryFilter === "blockers") return true;
      if (actionSummaryFilter === "open") return true;
      if (actionSummaryFilter === "today") return due === "today";
      if (actionSummaryFilter === "week") return due === "today" || due === "week";
      return due === "completed";
    };
    const source =
      actionSummaryFilter === "completed" ? actionQueue.completed : actionQueue.open;
    const filtered = source.filter((action) => {
      if (
        actionCityFilter !== "Все города" &&
        action.submission.city !== actionCityFilter
      ) {
        return false;
      }
      if (actionSummaryFilter === "blockers") return action.severity === "blocker";
      return matchesFilter(action.due);
    });
    return searchAgentActions(filtered, searchQuery).sort((left, right) =>
      actionSort === "tripDate"
        ? left.submission.tripDateFrom.localeCompare(right.submission.tripDateFrom)
        : right.submission.createdAt.localeCompare(left.submission.createdAt),
    );
  }, [
    actionCityFilter,
    actionQueue.completed,
    actionQueue.open,
    actionSort,
    actionSummaryFilter,
    searchQuery,
  ]);
  const actionTasks = useMemo(
    () => buildAgentActionTasks(visibleActions),
    [visibleActions],
  );
  const actionTaskSummary = useMemo(
    () => summarizeAgentActionTasks(actionTasks),
    [actionTasks],
  );
  const selectedActionTask = useMemo(
    () => actionTasks.find((task) => task.id === selectedActionTaskId),
    [actionTasks, selectedActionTaskId],
  );
  const actionFiltersActive =
    actionSummaryFilter !== "open" ||
    actionCityFilter !== "Все города" ||
    Boolean(searchQuery.trim());
  const actionControlsAreDefault = !actionFiltersActive && actionSort === "tripDate";
  const handleActionFilterChange = (filter: AgentActionFilter) => {
    setActionSummaryFilter(filter);
    setSelectedActionTaskId(null);
  };
  const handleActionCityFilterChange = (city: string) => {
    setActionCityFilter(city);
    setSelectedActionTaskId(null);
  };
  const handleActionSearchChange = (query: string) => {
    setSearchQuery(query);
    setSelectedActionTaskId(null);
  };
  const resetActionFilters = () => {
    setActionSummaryFilter("open");
    setActionCityFilter("Все города");
    setSearchQuery("");
    setActionSort("tripDate");
    setSelectedActionTaskId(null);
  };
  const agentName = agentDisplayName(agentId);
  const agentAgency = agentAgencyLabel(agentId);
  const agentAvatar = agentInitials(agentId);
  const selectedCanonicalSubmission = useMemo(
    () =>
      effectiveCanonicalSubmissions.find((submission) => submission.id === selectedRow),
    [effectiveCanonicalSubmissions, selectedRow],
  );
  useEffect(() => {
    if (selectedCanonicalSubmission) {
      questionnaireSubmissionSnapshotRef.current = selectedCanonicalSubmission;
    }
  }, [selectedCanonicalSubmission]);
  const selectedQuestionnaireSubmission =
    selectedCanonicalSubmission ??
    (questionnaireSubmissionSnapshotRef.current?.id === selectedRow
      ? questionnaireSubmissionSnapshotRef.current
      : undefined);
  const submissionCards = effectiveCanonicalSubmissions;

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= v19SideMenuDesktopMinWidth) {
        setMobileNavOpen(false);
      }
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const handleCommandPaletteShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;

      event.preventDefault();
      if (createNavigationState.busy || pendingCreateExit) return;
      commandPaletteFocusOriginRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setMobileNavOpen(false);
      setCommandPaletteOpen(true);
    };

    window.addEventListener("keydown", handleCommandPaletteShortcut);
    return () => window.removeEventListener("keydown", handleCommandPaletteShortcut);
  }, [createNavigationState.busy, pendingCreateExit]);

  useEffect(() => {
    if (!pendingCreateExit) return;
    window.requestAnimationFrame(() => {
      createExitDialogRef.current
        ?.querySelector<HTMLButtonElement>("button:not([disabled])")
        ?.focus({ preventScroll: true });
    });
  }, [pendingCreateExit]);

  useEffect(() => {
    if (usesSupabase || legacyMigrationStartedRef.current || !onSubmissionsChange) {
      return;
    }
    legacyMigrationStartedRef.current = true;
    void import("../modules/submissions/legacyProductIntakeMigration")
      .then(({ migrateLegacyProductIntakeDrafts }) =>
        migrateLegacyProductIntakeDrafts({
          agentId,
          canonicalSubmissions: effectiveCanonicalSubmissions,
          persistSubmissions: onSubmissionsChange,
        }),
      )
      .catch(() => undefined);
  }, [agentId, effectiveCanonicalSubmissions, onSubmissionsChange, usesSupabase]);

  const completeNavigation = (normalizedNav: NonCreateAgentShellNavSection) => {
    const canonicalNav = canonicalBridgeNav(normalizedNav);
    if (canonicalNav) {
      bridge.onAgentNavChange?.(canonicalNav);
      emitVisaflowUiEvent(bridge, { type: "agent.nav", section: canonicalNav });
      if (canonicalNav === "settings") onNavigateSettings?.();
    }
    setQuestionnaireInitialFocus(undefined);
    setDrawerOpen(false);
    setCurrentView("main");
    setActiveNav(normalizedNav);
    setCreateNavigationState(initialCreateNavigationState);
    setPendingCreateExit(null);
    setMobileNavOpen(false);
  };

  const navigateTo = (nav: LegacyAgentNavSection) => {
    const normalizedNav = normalizeAgentNav(nav);
    if (activeNav === "create") {
      if (createNavigationState.busy) return;
      if (createNavigationState.dirty) {
        createExitFocusOriginRef.current =
          document.activeElement instanceof HTMLElement ? document.activeElement : null;
        setCommandPaletteOpen(false);
        setMobileNavOpen(false);
        setPendingCreateExit(normalizedNav);
        return;
      }
    }
    completeNavigation(normalizedNav);
  };

  const openCommandPalette = () => {
    if (createNavigationState.busy || pendingCreateExit) return;
    commandPaletteFocusOriginRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setMobileNavOpen(false);
    setCommandPaletteOpen(true);
  };

  const handleCommandPaletteOpenChange = (open: boolean) => {
    setCommandPaletteOpen(open);
    if (open) return;

    window.requestAnimationFrame(() => {
      const origin = commandPaletteFocusOriginRef.current;
      if (origin?.isConnected) origin.focus({ preventScroll: true });
    });
  };

  const handleRowClick = (id: string) => {
    questionnaireOriginFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setQuestionnaireInitialFocus(undefined);
    bridge.onSubmissionOpen?.(id);
    emitVisaflowUiEvent(bridge, { type: "submission.open", submissionId: id });
    setDrawerActiveTab("overview");
    setDrawerFocusTarget(undefined);
    setSelectedRow(id);
    setDrawerOpen(true);
  };

  const handleCommandPaletteSubmissionOpen = (id: string) => {
    if (activeNav === "create") {
      if (createNavigationState.busy) return;
      if (createNavigationState.dirty) {
        navigateTo("submissions");
        return;
      }
      completeNavigation("submissions");
    }
    setCommandPaletteOpen(false);
    handleRowClick(id);
  };

  const handleOpenWorkspaceTarget = (submissionId: string, target: WorkspaceTarget) => {
    if (target.tab === "questionnaire") {
      handleOpenQuestionnaire(submissionId, {
        applicantId: target.applicantId,
        field: target.field,
        section: target.section,
      });
      return;
    }
    if (target.tab === "files") {
      focusSubmissionInList(submissionId);
      return;
    }
    bridge.onSubmissionOpen?.(submissionId);
    emitVisaflowUiEvent(bridge, { type: "submission.open", submissionId });
    setDrawerActiveTab(target.tab);
    setDrawerFocusTarget(target);
    setSelectedRow(submissionId);
    setDrawerOpen(true);
  };

  const focusSubmissionInList = (submissionId: string) => {
    const submission = rows.find((candidate) => candidate.id === submissionId);
    setQuestionnaireInitialFocus(undefined);
    setDrawerOpen(false);
    setMobileNavOpen(false);
    setActiveNav("submissions");
    if (submission) {
      setSubmissionTypeFilter(submission.type);
      setSubmissionFocusRequest((current) => ({
        revision: (current?.revision ?? 0) + 1,
        submissionId,
        type: submission.type,
      }));
    }
    setCurrentView("main");
  };

  const handleOpenQuestionnaire = (
    id: string,
    initialFocus?: QuestionnaireInitialFocus,
  ) => {
    if (initialFocus?.fileId || initialFocus?.section === "Файлы") {
      focusSubmissionInList(id);
      return;
    }
    questionnaireOriginFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    questionnaireOriginSurfaceRef.current = drawerOpen ? "drawer" : "workspace";
    bridge.onQuestionnaireOpen?.(id);
    emitVisaflowUiEvent(bridge, { type: "questionnaire.open", submissionId: id });
    setSelectedRow(id);
    setQuestionnaireInitialFocus(initialFocus);
    setDrawerOpen(false);
    setCurrentView("questionnaire");
  };

  const handleQuestionnaireBack = () => {
    const shouldReopenDrawer =
      questionnaireOriginSurfaceRef.current === "drawer" && Boolean(selectedRow);
    questionnaireOriginSurfaceRef.current = "workspace";
    setQuestionnaireInitialFocus(undefined);
    setCurrentView("main");
    if (shouldReopenDrawer) {
      setDrawerActiveTab("questionnaire");
      setDrawerFocusTarget(undefined);
      setDrawerOpen(true);
      return;
    }
    window.requestAnimationFrame(() => {
      const origin = questionnaireOriginFocusRef.current;
      if (origin?.isConnected) {
        origin.focus({ preventScroll: true });
        return;
      }
      if (!selectedRow) return;
      const row = document.querySelector<HTMLElement>(
        `[data-submission-id="${CSS.escape(selectedRow)}"]`,
      );
      const fallback = row?.matches("button, [tabindex]")
        ? row
        : row?.querySelector<HTMLElement>("button, [tabindex]");
      fallback?.focus({ preventScroll: true });
    });
  };

  const showSavedSubmissionInList = (submission: Submission) => {
    setQuestionnaireInitialFocus(undefined);
    setDrawerOpen(false);
    setMobileNavOpen(false);
    setActiveNav("submissions");
    setCreateNavigationState(initialCreateNavigationState);
    setPendingCreateExit(null);
    setSubmissionTypeFilter(submission.type);
    setSubmissionFocusRequest((current) => ({
      revision: (current?.revision ?? 0) + 1,
      submissionId: submission.id,
      type: submission.type,
    }));
    setCurrentView("main");
  };

  const handleActionOpen = (action: AgentActionItem) => {
    const target = agentActionWorkspaceTarget(action);
    if (target) {
      handleOpenWorkspaceTarget(action.submission.id, target);
      return;
    }
    bridge.onSubmissionOpen?.(action.submission.id);
    emitVisaflowUiEvent(bridge, {
      type: "submission.open",
      submissionId: action.submission.id,
    });
    setDrawerActiveTab(action.tab);
    setDrawerFocusTarget(undefined);
    setSelectedRow(action.submission.id);
    setDrawerOpen(true);
  };

  const handleActionTaskTab = (task: AgentActionTask, tab: DrawerTab) => {
    if (tab === task.action.tab) {
      handleActionOpen(task.action);
      return;
    }
    if (tab === "questionnaire") {
      handleOpenQuestionnaire(task.submission.id);
      return;
    }
    if (tab === "files") {
      const target = agentActionWorkspaceTarget(task.action);
      if (target?.tab === "files") {
        handleOpenWorkspaceTarget(task.submission.id, target);
        return;
      }
      focusSubmissionInList(task.submission.id);
      return;
    }

    bridge.onSubmissionOpen?.(task.submission.id);
    emitVisaflowUiEvent(bridge, {
      type: "submission.open",
      submissionId: task.submission.id,
    });
    setDrawerActiveTab(tab);
    setDrawerFocusTarget(undefined);
    setSelectedRow(task.submission.id);
    setDrawerOpen(true);
  };

  const createPackage = () => {
    if (activeNav === "create") {
      setCommandPaletteOpen(false);
      setMobileNavOpen(false);
      return;
    }
    setCreateOriginNav(activeNav);
    bridge.onCreatePackage?.();
    emitVisaflowUiEvent(bridge, { type: "package.create" });
    setQuestionnaireInitialFocus(undefined);
    setDrawerOpen(false);
    setCurrentView("main");
    setActiveNav("create");
    setCreateNavigationState(initialCreateNavigationState);
    setPendingCreateExit(null);
    setCommandPaletteOpen(false);
    setMobileNavOpen(false);
  };

  const executeCreateCanonicalDraft = async (
    intent: SubmissionIntakeIntent,
    onProgress: SubmissionIntakeProgressListener,
  ) => {
    const passportUploads = intent.passportUploads;
    const applicantNames: string[] = [];
    for (const upload of passportUploads) {
      const firstName = upload.extractedFields
        .find((field) => field.key === "firstName")
        ?.value.trim();
      const surname = upload.extractedFields
        .find((field) => field.key === "surname")
        ?.value.trim();
      applicantNames[upload.applicantIndex] = [firstName, surname]
        .filter(Boolean)
        .join(" ");
    }
    let pendingSubmission = pendingCreatedSubmissionRef.current;
    if (!pendingSubmission) {
      const result = createDraft({
        agentId,
        applicantNames,
        city: intent.city,
        familyCount: intent.familyCount,
        idScheme: usesSupabase ? "supabase" : "local",
        reservedSubmissionIds,
        submissions: effectiveCanonicalSubmissions,
        type: intent.type,
      });
      if (!result.ok) throw new Error(result.error.message);
      pendingSubmission = result.data;
    }
    if (!onSubmissionsChange) {
      throw new Error("Сохранение подачи недоступно.");
    }

    const nextSubmission = await persistCreatedSubmissionWithPassports({
      attemptedStoragePaths: attemptedCreateStoragePathsRef.current,
      onPendingSubmission: (submission) => {
        pendingCreatedSubmissionRef.current = submission;
      },
      onProgress,
      passportUploads,
      persistSubmission: async (submission) => {
        await onSubmissionsChange([submission]);
        setCanonicalOverrides((current) => ({
          ...current,
          [submission.id]: submission,
        }));
      },
      storageAdapter: usesSupabase ? "supabase-private" : "local-dev",
      submission: pendingSubmission,
    });

    pendingCreatedSubmissionRef.current = null;
    attemptedCreateStoragePathsRef.current.clear();
    setCanonicalOverrides((current) => ({
      ...current,
      [nextSubmission.id]: nextSubmission,
    }));
    setSearchQuery("");
    if (intent.destination === "questionnaire") {
      setActiveNav("submissions");
      setCreateNavigationState(initialCreateNavigationState);
      setPendingCreateExit(null);
      setSelectedRow(nextSubmission.id);
      setQuestionnaireInitialFocus({
        applicantId: nextSubmission.applicants[0]?.id,
        field: "surname",
        section: "Личные данные заявителя",
      });
      setDrawerOpen(false);
      setCurrentView("questionnaire");
    } else {
      showSavedSubmissionInList(nextSubmission);
    }
  };

  const createCanonicalDraft = (
    intent: SubmissionIntakeIntent,
    onProgress: SubmissionIntakeProgressListener,
  ) => {
    if (createSubmissionPromiseRef.current) {
      return createSubmissionPromiseRef.current;
    }
    const promise = executeCreateCanonicalDraft(intent, onProgress).finally(() => {
      if (createSubmissionPromiseRef.current === promise) {
        createSubmissionPromiseRef.current = null;
      }
    });
    createSubmissionPromiseRef.current = promise;
    return promise;
  };

  const uploadCanonicalApplicantFile = async (
    submissionId: string,
    applicantId: string,
    fileType: SubmissionFileType,
    file: File,
  ) => {
    const submission = effectiveCanonicalSubmissions.find(
      (candidate) => candidate.id === submissionId,
    );
    if (!submission) throw new Error("Подача больше не доступна.");
    const prepared = ensureApplicantMediaSlot(submission, applicantId, fileType);
    if (!canReplaceDocument(prepared.submission, prepared.file)) {
      throw new Error("Файл нельзя загрузить в текущем статусе подачи.");
    }
    const mimeType = mediaMimeTypeForFile(file);
    if (!mimeType) {
      throw new Error("Не удалось определить тип выбранного файла.");
    }

    const generatedFileName = generatedCockpitMediaFileName({
      applicantId,
      fileType,
      mimeType,
      submissionId: submission.id,
      uploadNonce: `${Date.now()}`,
    });
    const uploadedAtIso = new Date().toISOString();
    const baseMetadata = {
      generatedFileName,
      mimeType,
      originalFileName: file.name,
      sizeBytes: file.size,
      uploadedAtIso,
    };
    let metadata:
      | (typeof baseMetadata & {
          storageAdapter: "local-dev";
        })
      | (typeof baseMetadata & {
          storageAdapter: "supabase-private";
          storageBucket: string;
          storagePath: string;
        });
    if (usesSupabase) {
      const target = buildMediaStoragePath(
        submission.id,
        applicantId,
        mediaSlotTypeForSubmissionFileType(fileType),
        generatedFileName,
      );
      const uploaded = await uploadMediaToStorage(target, file, {
        contentType: mimeType,
      });
      if (!uploaded) {
        throw new Error("Supabase Storage недоступен для загрузки файла.");
      }
      metadata = {
        ...baseMetadata,
        storageAdapter: "supabase-private",
        storageBucket: target.bucket,
        storagePath: uploaded.path,
      };
    } else {
      metadata = { ...baseMetadata, storageAdapter: "local-dev" };
    }

    const applyUploadToLatest = (latestSubmission: Submission) => {
      const latestPrepared = ensureApplicantMediaSlot(
        latestSubmission,
        applicantId,
        fileType,
      );
      const uploadedSubmission = uploadRequiredFile(
        latestPrepared.submission,
        latestPrepared.file.id,
        metadata,
      );
      if (uploadedSubmission === latestPrepared.submission) {
        throw new Error("Файл нельзя загрузить в текущем статусе подачи.");
      }
      if (
        latestPrepared.file.type !== "passport_scan" ||
        latestPrepared.file.status === "needs_replacement"
      ) {
        return uploadedSubmission;
      }
      return {
        ...uploadedSubmission,
        applicants: uploadedSubmission.applicants.map((applicant) =>
          applicant.id === latestPrepared.file.applicantId
            ? {
                ...applicant,
                passportExtraction: latestSubmission.applicants.find(
                  (candidate) => candidate.id === applicant.id,
                )?.passportExtraction,
              }
            : applicant,
        ),
      };
    };

    const nextSubmission = onSubmissionUpdate
      ? await onSubmissionUpdate(submission.id, applyUploadToLatest)
      : applyUploadToLatest(submission);
    if (!onSubmissionUpdate) await onSubmissionsChange?.([nextSubmission]);
    setCanonicalOverrides((current) => ({
      ...current,
      [nextSubmission.id]: nextSubmission,
    }));
    return nextSubmission;
  };

  const uploadCanonicalFile = async (
    submissionId: string,
    fileId: string,
    file: File,
  ) => {
    const submission = effectiveCanonicalSubmissions.find(
      (candidate) => candidate.id === submissionId,
    );
    const targetFile = submission?.files.find((candidate) => candidate.id === fileId);
    if (!submission || !targetFile) {
      throw new Error("Не удалось определить слот файла для загрузки.");
    }
    return uploadCanonicalApplicantFile(
      submissionId,
      targetFile.applicantId,
      targetFile.type,
      file,
    );
  };

  const executeAgentSubmissionActionFor = async (
    submissionId: string,
    action: SubmissionAction,
  ) => {
    const currentSubmission = effectiveCanonicalSubmissions.find(
      (submission) => submission.id === submissionId,
    );
    if (!currentSubmission) throw new Error("Подача больше не доступна.");

    const applyAction = (latestSubmission: Submission) => {
      const actorId = agentId ?? latestSubmission.agentId;
      const result =
        action === "submit_for_review"
          ? applyAgentSubmitForReviewResult(latestSubmission, actorId)
          : applySubmissionActionResult(latestSubmission, action, "agent", actorId);
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    };
    const nextSubmission = onSubmissionUpdate
      ? await onSubmissionUpdate(submissionId, applyAction)
      : applyAction(currentSubmission);
    if (!onSubmissionUpdate) await onSubmissionsChange?.([nextSubmission]);
    setCanonicalOverrides((current) => ({
      ...current,
      [nextSubmission.id]: nextSubmission,
    }));
    return nextSubmission;
  };

  const executeAgentSubmissionAction = async (action: SubmissionAction) => {
    if (!selectedCanonicalSubmission) return;
    await executeAgentSubmissionActionFor(selectedCanonicalSubmission.id, action);
  };

  const markAgentIssueFixed = async (issueId: string) => {
    if (!selectedCanonicalSubmission) {
      throw new Error("Не удалось определить подачу для исправления замечания.");
    }

    const markFixedOnLatest = (latestSubmission: Submission) => {
      const result = markSubmissionIssueFixedResult(latestSubmission, issueId, "agent");
      if (!result.ok) throw new Error(result.error.message);
      return result.data;
    };
    const nextSubmission = onSubmissionUpdate
      ? await onSubmissionUpdate(selectedCanonicalSubmission.id, markFixedOnLatest)
      : markFixedOnLatest(selectedCanonicalSubmission);
    if (!onSubmissionUpdate) await onSubmissionsChange?.([nextSubmission]);
    setCanonicalOverrides((current) => ({
      ...current,
      [nextSubmission.id]: nextSubmission,
    }));
    return nextSubmission;
  };

  const persistQuestionnaireSubmission = (nextSubmission: Submission) => {
    return onSubmissionsChange?.([nextSubmission]);
  };

  const renderActionsList = () => (
    <section
      aria-label="Мои действия"
      className="v19-legacy-actions-screen v19-agent-shared-screen ops-shell surface-agent-actions"
      data-ui-pattern="operational-queue-with-inline-context"
      data-testid="agent-actions-screen"
    >
      <div className="v19-agent-actions-main-v2">
        <AgentActionStatusStrip
          counts={actionFilterCounts}
          value={actionSummaryFilter}
          onChange={handleActionFilterChange}
        />

        <div className="v19-admin-review-board v19-agent-actions-board">
          <V19ListHeader
            actionDisabled={actionControlsAreDefault}
            actionLabel="Все"
            className="v19-admin-review-list-head"
            countLabel={`${visibleActions.length}`}
            interactionId="actions.reset-filters"
            onAction={resetActionFilters}
            title="Очередь действий"
          />
          <V19QueueToolbar
            actionDisabled={actionControlsAreDefault}
            actionIcon={RotateCcw}
            cityFilter={actionCityFilter}
            cityOptions={actionCityOptions}
            controls={
              <V19ToolbarSelect<ActionSort>
                ariaLabel="Сортировка действий"
                className={actionSort !== "tripDate" ? "is-active" : ""}
                icon={ArrowUpDown}
                interactionId="actions.sort"
                label="Сортировка"
                options={[
                  { label: "По дате вылета", value: "tripDate" },
                  { label: "По дате создания", value: "createdAt" },
                ]}
                value={actionSort}
                onChange={setActionSort}
              />
            }
            filterLabel="Сбросить фильтры"
            interactionIds={{
              cityFilter: "actions.city-filter",
              reset: "actions.reset-filters",
              search: "actions.search",
            }}
            onCityFilterChange={handleActionCityFilterChange}
            onFilterClick={resetActionFilters}
            onSearchChange={handleActionSearchChange}
            searchPlaceholder="ID, семья или город"
            searchValue={searchQuery}
          />
          <AgentActionsCommandCockpit
            actionGroupLabel={
              actionSummaryFilter === "completed"
                ? "Закрытые действия"
                : "Открытые действия"
            }
            desktopContextMode="inline"
            emptyState={{
              action: actionFiltersActive ? "Сбросить фильтры" : "Новая подача",
              body: actionFiltersActive
                ? "Измените поисковый запрос или сбросьте выбранные фильтры."
                : "Создайте подачу — следующие шаги появятся здесь автоматически.",
              title: actionFiltersActive
                ? "Ничего не найдено"
                : "Очередь действий пуста",
            }}
            selectedTask={selectedActionTask}
            showSummary={false}
            summary={actionTaskSummary}
            tasks={actionTasks}
            onEmptyAction={actionFiltersActive ? resetActionFilters : createPackage}
            onOpenIssue={(task, issue) =>
              handleOpenWorkspaceTarget(task.submission.id, targetForIssue(issue))
            }
            onOpenPrimary={(task) => handleActionOpen(task.action)}
            onOpenSecondary={(task) => handleActionTaskTab(task, "overview")}
            onOpenTab={handleActionTaskTab}
            onSelectTask={(task) =>
              setSelectedActionTaskId((current) =>
                current === task.id ? null : task.id,
              )
            }
          />
        </div>
      </div>
    </section>
  );

  const title = navLabel(activeNav);
  const sideMenuItems = [
    {
      active: activeNav === "actions",
      count: actionQueue.summary.open,
      icon: "✓",
      id: "agent-actions",
      interactionId: "shell.navigate-actions",
      label: "Мои действия",
      meta: "Очередь задач",
      onClick: () => navigateTo("actions"),
    },
    {
      active: activeNav === "submissions",
      count: rows.length,
      icon: "▤",
      id: "agent-submissions",
      interactionId: "shell.navigate-submissions",
      label: "Мои подачи",
      meta: "Пакеты заявителей",
      onClick: () => navigateTo("submissions"),
    },
    {
      active: activeNav === "settings",
      icon: "⚙",
      id: "agent-settings",
      interactionId: "shell.navigate-settings",
      label: "Настройки",
      meta: "Интерфейс и доступность",
      onClick: () => navigateTo("settings"),
    },
  ];
  const surface =
    activeNav === "actions"
      ? "agent-actions"
      : activeNav === "create"
        ? "agent-create"
        : activeNav === "submissions"
          ? "agent-submissions"
          : "settings";

  return (
    <div className="has-persistent-operational-sidebar relative h-full w-full overflow-hidden bg-[var(--v19-depth-canvas)]">
      <AnimatePresence mode="wait">
        {currentView === "questionnaire" && selectedRow && (
          <QuestionnaireScreen
            key={`questionnaire-${selectedRow}`}
            agentId={agentId}
            initialFocus={questionnaireInitialFocus}
            submissionId={selectedRow}
            submission={selectedQuestionnaireSubmission}
            onAssignPublicNumber={onAssignPublicNumber}
            onBack={handleQuestionnaireBack}
            onSavedAndExit={showSavedSubmissionInList}
            onOpenDocuments={() => focusSubmissionInList(selectedRow)}
            onSubmissionUpdate={
              onSubmissionUpdate
                ? (update) => onSubmissionUpdate(selectedRow, update)
                : undefined
            }
            onSubmissionChange={persistQuestionnaireSubmission}
            onMarkIssueFixed={markAgentIssueFixed}
            onUploadFile={
              selectedRow
                ? async (fileId, file) => {
                    await uploadCanonicalFile(selectedRow, fileId, file);
                  }
                : undefined
            }
          />
        )}
      </AnimatePresence>

      <div
        aria-hidden={
          currentView !== "main" || drawerOpen || pendingCreateExit ? true : undefined
        }
        className="contents"
        inert={currentView !== "main" || drawerOpen || Boolean(pendingCreateExit)}
      >
        <AppShell
          className="is-agent-shell-source-actions"
          collectionSurface={activeNav !== "settings"}
          drawerOpen={drawerOpen}
          header={
            <PageHeader
              actions={
                <div className="ml-auto flex items-center gap-2">
                  {activeNav === "create" ? (
                    <button
                      {...agentInteractionProps("new-submission.back")}
                      aria-label="Отменить создание подачи"
                      className="v19-create-cancel-action h-[36px] lg:h-10 px-3.5 bg-transparent text-[var(--v19-depth-text-muted)] rounded-[10px] border border-[var(--v19-depth-border-strong)] text-[13px] lg:text-sm font-medium transition-colors flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--v19-depth-focus)] disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={createNavigationState.busy}
                      onClick={() => navigateTo(createOriginNav)}
                      type="button"
                    >
                      <X aria-hidden="true" className="w-4 h-4" />
                      <span>Отмена</span>
                    </button>
                  ) : (
                    <button
                      {...agentInteractionProps("shell.create-submission")}
                      aria-label="Новая подача"
                      onClick={createPackage}
                      className="v19-action-surface-create h-[36px] lg:h-10 px-3.5 bg-[var(--v19-depth-accent)] hover:bg-[var(--v19-depth-accent-hover)] text-[var(--v19-depth-text-strong)] rounded-[10px] text-[13px] lg:text-sm font-medium transition-colors flex items-center gap-2 shadow-[var(--v19-depth-inner-highlight)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--v19-depth-focus)]"
                    >
                      <Plus className="w-4 h-4" />
                      <span className="hidden sm:inline">Новая подача</span>
                    </button>
                  )}
                </div>
              }
              menuButton={
                <PageHeaderMenuButton
                  {...agentInteractionProps("shell.toggle-mobile-menu")}
                  controls={v19SideMenuId}
                  disabled={createNavigationState.busy}
                  onClick={() => setMobileNavOpen((open) => !open)}
                  open={mobileNavOpen}
                />
              }
              title={title}
            />
          }
          label="Рабочая область агента"
          mobileNavOpen={mobileNavOpen}
          role="agent"
          sideMenu={{
            ariaLabel: "Меню агента",
            createAction: {
              active: activeNav === "create",
              label: "Новая подача",
              onClick: createPackage,
            },
            displayMode: "regular",
            inactive: createNavigationState.busy,
            items: sideMenuItems,
            mobileOpen: mobileNavOpen,
            mobileTitle: title,
            onCloseMobile: () => setMobileNavOpen(false),
            onCommandSearch: openCommandPalette,
            onResetWorkspace: () => onSignOut?.(),
            role: "agent",
            sessionDisplayName: agentName,
            sessionInitials: agentAvatar,
            sessionRoleLabel: agentAgency,
          }}
          sideMenuMode="regular"
          surface={surface}
          workspaceInactive={currentView !== "main"}
        >
          <div className="v19-agent-workspace-scroll flex-1 overflow-auto p-4 lg:p-6 pb-[max(24px,env(safe-area-inset-bottom))]">
            <AnimatePresence initial={false} mode="wait">
              <motion.div
                key={activeNav}
                {...activeNavMotion}
                className="v19-agent-workspace-content max-w-[1460px] mx-auto h-full"
                data-agent-screen={activeNav}
                data-testid="agent-screen-transition"
              >
                {activeNav === "settings" && (
                  <WorkspaceExperienceSettingsScreen
                    currentIdentity={agentName}
                    instrumentAgentInteractions
                    usesSupabase={usesSupabase}
                  />
                )}
                {activeNav === "actions" && renderActionsList()}
                {activeNav === "create" && (
                  <PreUploadScreen
                    onNavigationStateChange={setCreateNavigationState}
                    onSubmit={createCanonicalDraft}
                  />
                )}
                {activeNav === "submissions" && (
                  <div>
                    <AgentReturnPackagesPanel enabled={usesSupabase} />
                    <ApplicantsScreen
                      focusRequest={submissionFocusRequest}
                      onOpenDrawer={handleRowClick}
                      onOpenQuestionnaire={handleOpenQuestionnaire}
                      onOpenWorkspaceTarget={handleOpenWorkspaceTarget}
                      onSubmitForReview={(submissionId) =>
                        executeAgentSubmissionActionFor(
                          submissionId,
                          "submit_for_review",
                        ).then(() => undefined)
                      }
                      onTypeFilterChange={setSubmissionTypeFilter}
                      onUploadApplicantFile={async (...args) => {
                        await uploadCanonicalApplicantFile(...args);
                      }}
                      submissions={submissionCards}
                      typeFilter={submissionTypeFilter}
                    />
                  </div>
                )}
              </motion.div>
            </AnimatePresence>
          </div>
        </AppShell>
      </div>

      {selectedCanonicalSubmission ? (
        <Drawer
          activeTab={drawerActiveTab}
          focusTarget={drawerFocusTarget}
          isOpen={drawerOpen}
          submission={selectedCanonicalSubmission}
          onAction={executeAgentSubmissionAction}
          onClearFocusTarget={() => setDrawerFocusTarget(undefined)}
          onClose={() => setDrawerOpen(false)}
          onOpenQuestionnaire={(target) =>
            handleOpenQuestionnaire(selectedCanonicalSubmission.id, target)
          }
          onOpenWorkspaceTarget={(target) =>
            handleOpenWorkspaceTarget(selectedCanonicalSubmission.id, target)
          }
          onUploadApplicantFile={uploadCanonicalApplicantFile}
        />
      ) : null}

      <CommandPalette
        open={commandPaletteOpen}
        role="agent"
        submissions={submissionCards}
        onOpenChange={handleCommandPaletteOpenChange}
        onCreateSubmission={createPackage}
        onNavigateAgentActions={() => navigateTo("actions")}
        onNavigateAgentSubmissions={() => navigateTo("submissions")}
        onNavigateSettings={() => navigateTo("settings")}
        onOpenSubmission={(submission) =>
          handleCommandPaletteSubmissionOpen(submission.id)
        }
      />

      <AnimatePresence>
        {pendingCreateExit ? (
          <motion.div
            animate={{ opacity: 1 }}
            className="v19-preupload-modal-overlay"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
          >
            <motion.section
              aria-labelledby="create-exit-title"
              aria-modal="true"
              className="v19-preupload-confirmation-dialog"
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  event.preventDefault();
                  setPendingCreateExit(null);
                  window.requestAnimationFrame(() => {
                    const origin = createExitFocusOriginRef.current;
                    if (origin?.isConnected) {
                      origin.focus({ preventScroll: true });
                    }
                  });
                  return;
                }
                if (event.key !== "Tab") return;
                const focusable = Array.from(
                  createExitDialogRef.current?.querySelectorAll<HTMLButtonElement>(
                    "button:not([disabled])",
                  ) ?? [],
                );
                const first = focusable[0];
                const last = focusable[focusable.length - 1];
                if (!first || !last) return;
                if (event.shiftKey && document.activeElement === first) {
                  event.preventDefault();
                  last.focus({ preventScroll: true });
                } else if (!event.shiftKey && document.activeElement === last) {
                  event.preventDefault();
                  first.focus({ preventScroll: true });
                }
              }}
              ref={createExitDialogRef}
              role="alertdialog"
            >
              <h2 id="create-exit-title">Выйти без сохранения?</h2>
              <p>Изменения в новой подаче будут потеряны.</p>
              <footer>
                <button
                  {...agentInteractionProps("new-submission.back")}
                  onClick={() => {
                    setPendingCreateExit(null);
                    window.requestAnimationFrame(() => {
                      const origin = createExitFocusOriginRef.current;
                      if (origin?.isConnected) {
                        origin.focus({ preventScroll: true });
                      } else {
                        document
                          .querySelector<HTMLElement>(
                            '[data-agent-screen="create"] [tabindex="-1"]',
                          )
                          ?.focus({ preventScroll: true });
                      }
                    });
                  }}
                  type="button"
                >
                  Вернуться к редактированию
                </button>
                <button
                  {...agentInteractionProps("new-submission.back")}
                  className="is-danger"
                  onClick={() => completeNavigation(pendingCreateExit)}
                  type="button"
                >
                  Выйти без сохранения
                </button>
              </footer>
            </motion.section>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
