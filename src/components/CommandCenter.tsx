import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowLeftRight,
  ArrowUpDown,
  CheckCircle2,
  Clock,
  FileStack,
  ListChecks,
  Menu,
  Plus,
  RotateCcw,
  Search,
  Shapes,
  SlidersHorizontal,
  X,
} from "lucide-react";
import { QuestionnaireScreen } from "./QuestionnaireScreen";
import type { QuestionnaireInitialFocus } from "../modules/submissions/components/FigmaQuestionnaireScreen";
import {
  ApplicantsScreen,
  type ApplicantFocusRequest,
  type SubmissionTypeFilter,
} from "./ApplicantsScreen";
import { AgentReturnPackagesPanel } from "./AgentReturnPackagesPanel";
import { PreUploadScreen } from "./PreUploadScreen";
import { CommandPalette } from "../modules/submissions/components/CommandPalette";
import { Drawer } from "./Drawer";
import visaflowLogo from "../assets/v-logo-premium-black-style.webp";
import {
  emitVisaflowUiEvent,
  useVisaflowBusinessBridge,
  type AgentNavSection,
} from "../integration/visaflowBusinessBridge";
import {
  V19ListHeader,
  V19MetricCard,
  V19MetricStrip,
  V19OperationalCard,
  V19OperationalCardGrid,
  V19OperationalProgressLine,
  V19PriorityHero,
  V19QueueToolbar,
  V19ToolbarSelect,
} from "../shared/ui/v19-design-system";
import { createDraft } from "../modules/submissions/domainEngine";
import type {
  City,
  DrawerTab,
  PassportUploadDraft,
  PreliminaryIntakeDraft,
  Submission,
  SubmissionAction,
  SubmissionFileType,
} from "../modules/submissions/types";
import type { WorkspaceTarget } from "../modules/submissions/workspaceModel";
import {
  listItemsFromSubmissions,
  type LegacyAgentNavSection,
  type LegacySubmissionListItem,
} from "./v19BusinessScreenAdapter";
import {
  loadProductIntakeDrafts,
  saveProductIntakeDrafts,
  type ProductIntakeDraft,
} from "../modules/submissions/productIntakeFlow";
import {
  productIntakeDraftToPassportUploads,
  productIntakeDraftToSubmission,
} from "../modules/submissions/productIntakeSubmissionAdapter";
import {
  agentActionQueue,
  agentActionWorkspaceTarget,
  searchAgentActions,
  type AgentActionDue,
  type AgentActionItem,
} from "../modules/submissions/agentActions";
import {
  agentAgencyLabel,
  agentDisplayName,
  agentInitials,
} from "../modules/submissions/agentDirectory";
import {
  cityFilterValuesForSubmissions,
} from "../modules/submissions/selectors";
import {
  generatedCockpitMediaFileName,
  ensureApplicantMediaSlot,
  mediaSlotTypeForSubmissionFileType,
  uploadRequiredFile,
} from "../modules/submissions/submissionActions";
import { submissionPublicId } from "../modules/submissions/submissionIdentity";
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

export type SubmissionListItem = LegacySubmissionListItem;

type ViewState = "main" | "questionnaire" | "upload";
type AgentShellNavSection = Extract<
  LegacyAgentNavSection,
  "actions" | "submissions" | "settings"
>;
type ActionSummaryFilter = "blockers" | "open" | "today" | "week" | "completed";
type ActionSort = "tripDate" | "createdAt";

type CommandCenterProps = {
  agentId?: Submission["agentId"];
  onAssignPublicNumber?: (submissionId: string) => Promise<PublicNumberAssignment>;
  onSubmissionUpdate?: (
    submissionId: string,
    update: (submission: Submission) => Submission,
  ) => Promise<Submission>;
  onSubmissionsChange?: (submissions: Submission[]) => void | Promise<void>;
  submissions?: Submission[];
  onSignOut?: () => void | Promise<void>;
  onSwitchWorkspace?: () => void;
  onNavigateSettings?: () => void;
  usesSupabase?: boolean;
};

const agentMobileNavigationId = "v19-agent-mobile-navigation";

function intakeDraftToListItem(draft: ProductIntakeDraft): SubmissionListItem {
  return {
    id: draft.id,
    title: draft.title,
    type: draft.type,
    applicantsCount: draft.applicants.length,
    city: draft.city,
    tripDates: draft.tripDates.replace(/\.2026/g, "").replace(/\s+–\s+/g, "–"),
    status: draft.issues.some((issue) => issue.severity === "blocker")
      ? "returned"
      : "in_progress",
    completeness: draft.readyPercent,
    updated: "только что",
    owner: "Татьяна Н.",
    issueCount: draft.issues.length,
    nextAction: draft.nextAction,
  };
}

function canonicalBridgeNav(section: LegacyAgentNavSection): AgentNavSection | null {
  if (
    section === "actions" ||
    section === "submissions" ||
    section === "settings"
  )
    return section;
  return null;
}

function navLabel(section: AgentShellNavSection) {
  switch (section) {
    case "actions":
      return "Мои действия";
    case "submissions":
      return "Мои подачи";
    case "settings":
      return "Настройки";
  }
}

function normalizeAgentNav(section: LegacyAgentNavSection): AgentShellNavSection {
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
  submissions: canonicalSubmissions,
  onSignOut,
  onSwitchWorkspace,
  onNavigateSettings,
  usesSupabase = false,
}: CommandCenterProps) {
  const bridge = useVisaflowBusinessBridge();
  const prefersReducedMotion = useReducedMotion();
  const [activeNav, setActiveNav] = useState<AgentShellNavSection>("actions");
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
    useState<ActionSummaryFilter>("open");
  const [actionCityFilter, setActionCityFilter] = useState("Все города");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionSort, setActionSort] = useState<ActionSort>("tripDate");
  const [settingsDigest, setSettingsDigest] = useState<"instant" | "daily">("instant");
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [intakeDrafts, setIntakeDrafts] = useState<ProductIntakeDraft[]>(() =>
    usesSupabase ? [] : loadProductIntakeDrafts(),
  );
  const questionnaireOriginFocusRef = useRef<HTMLElement | null>(null);
  const commandPaletteFocusOriginRef = useRef<HTMLElement | null>(null);
  const createCity: City = "Москва";
  const createFamilyCount = 2;
  const createType: Submission["type"] = "single";
  const [canonicalOverrides, setCanonicalOverrides] = useState<
    Record<string, Submission>
  >({});
  const pendingCreatedSubmissionRef = useRef<Submission | null>(null);
  const createSubmissionPromiseRef = useRef<Promise<void> | null>(null);
  const attemptedCreateStoragePathsRef = useRef(new Set<string>());

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
  const intakeRows = useMemo(
    () => intakeDrafts.map(intakeDraftToListItem),
    [intakeDrafts],
  );
  const rows = useMemo(
    () =>
      usesSupabase
        ? canonicalRows
        : [...intakeRows, ...canonicalRows],
    [canonicalRows, intakeRows, usesSupabase],
  );
  const actionQueue = useMemo(
    () => agentActionQueue(effectiveCanonicalSubmissions),
    [effectiveCanonicalSubmissions],
  );
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
      if (actionCityFilter !== "Все города" && action.submission.city !== actionCityFilter) {
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
  }, [actionCityFilter, actionQueue.completed, actionQueue.open, actionSort, actionSummaryFilter, searchQuery]);
  const blockerActionCount = actionQueue.open.filter(
    (action) => action.severity === "blocker",
  ).length;
  const actionFiltersActive =
    actionSummaryFilter !== "open" ||
    actionCityFilter !== "Все города" ||
    Boolean(searchQuery.trim());
  const actionControlsAreDefault =
    !actionFiltersActive && actionSort === "tripDate";
  const resetActionFilters = () => {
    setActionSummaryFilter("open");
    setActionCityFilter("Все города");
    setSearchQuery("");
    setActionSort("tripDate");
  };
  const agentName = agentDisplayName(agentId);
  const agentAgency = agentAgencyLabel(agentId);
  const agentAvatar = agentInitials(agentId);
  const selectedCanonicalSubmission = useMemo(
    () =>
      effectiveCanonicalSubmissions.find((submission) => submission.id === selectedRow),
    [effectiveCanonicalSubmissions, selectedRow],
  );
  const selectedIntakeDraft = useMemo(
    () => intakeDrafts.find((draft) => draft.id === selectedRow),
    [intakeDrafts, selectedRow],
  );

  useEffect(() => {
    if (
      !usesSupabase ||
      currentView !== "questionnaire" ||
      !selectedRow ||
      selectedCanonicalSubmission
    ) {
      return;
    }

    // A refresh can remove a submission from the current agent's visible scope
    // while its questionnaire is still mounted. Do not leave the user on a
    // screen where every persistence action is guaranteed to be rejected.
    setQuestionnaireInitialFocus(undefined);
    setCurrentView("main");
  }, [currentView, selectedCanonicalSubmission, selectedRow, usesSupabase]);
  const intakeSubmissionsForCards = useMemo(
    () =>
      intakeDrafts.map((draft) =>
        productIntakeDraftToSubmission(draft, {
          agentId,
          useIntakeFilesAsLocalDemoUploads: true,
        }),
      ),
    [agentId, intakeDrafts],
  );
  const submissionCards = useMemo(
    () =>
      usesSupabase
        ? effectiveCanonicalSubmissions
        : [...intakeSubmissionsForCards, ...effectiveCanonicalSubmissions],
    [effectiveCanonicalSubmissions, intakeSubmissionsForCards, usesSupabase],
  );

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) setMobileNavOpen(false);
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    const handleCommandPaletteShortcut = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.key.toLowerCase() !== "k") return;

      event.preventDefault();
      commandPaletteFocusOriginRef.current =
        document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setMobileNavOpen(false);
      setCommandPaletteOpen(true);
    };

    window.addEventListener("keydown", handleCommandPaletteShortcut);
    return () => window.removeEventListener("keydown", handleCommandPaletteShortcut);
  }, []);

  useEffect(() => {
    if (usesSupabase) return;
    saveProductIntakeDrafts(intakeDrafts);
  }, [intakeDrafts, usesSupabase]);

  const navigateTo = (nav: LegacyAgentNavSection) => {
    const normalizedNav = normalizeAgentNav(nav);
    const canonicalNav = canonicalBridgeNav(normalizedNav);
    if (canonicalNav) {
      bridge.onAgentNavChange?.(canonicalNav);
      emitVisaflowUiEvent(bridge, { type: "agent.nav", section: canonicalNav });
      if (canonicalNav === "settings") onNavigateSettings?.();
    }
    setActiveNav(normalizedNav);
    setMobileNavOpen(false);
  };

  const openCommandPalette = () => {
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
    if (intakeDrafts.some((draft) => draft.id === id)) {
      bridge.onQuestionnaireOpen?.(id);
      emitVisaflowUiEvent(bridge, { type: "questionnaire.open", submissionId: id });
      setSelectedRow(id);
      setDrawerOpen(false);
      setCurrentView("questionnaire");
      return;
    }

    bridge.onSubmissionOpen?.(id);
    emitVisaflowUiEvent(bridge, { type: "submission.open", submissionId: id });
    setDrawerActiveTab("overview");
    setDrawerFocusTarget(undefined);
    setSelectedRow(id);
    setDrawerOpen(true);
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
    bridge.onQuestionnaireOpen?.(id);
    emitVisaflowUiEvent(bridge, { type: "questionnaire.open", submissionId: id });
    setSelectedRow(id);
    setQuestionnaireInitialFocus(initialFocus);
    setDrawerOpen(false);
    setCurrentView("questionnaire");
  };

  const handleQuestionnaireBack = () => {
    setQuestionnaireInitialFocus(undefined);
    setCurrentView("main");
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

  const createPackage = () => {
    bridge.onCreatePackage?.();
    emitVisaflowUiEvent(bridge, { type: "package.create" });
    setCurrentView("upload");
  };

  const executeCreateCanonicalDraft = async (
    passportUploads: PassportUploadDraft[] = [],
    preliminaryIntake?: PreliminaryIntakeDraft,
    options?: {
      familyCount?: number;
      openQuestionnaire?: boolean;
      type?: Submission["type"];
    },
  ) => {
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
        city: createCity,
        familyCount: options?.familyCount ?? createFamilyCount,
        idScheme: "supabase",
        preliminaryIntake,
        submissions: canonicalSubmissions ?? [],
        type: options?.type ?? createType,
      });
      if (!result.ok) throw new Error(result.error.message);
      pendingSubmission = result.data;
    }
    if (!onSubmissionsChange) {
      throw new Error("Supabase persistence недоступен для создания подачи.");
    }

    const nextSubmission = await persistCreatedSubmissionWithPassports({
      attemptedStoragePaths: attemptedCreateStoragePathsRef.current,
      onPendingSubmission: (submission) => {
        pendingCreatedSubmissionRef.current = submission;
      },
      passportUploads,
      persistSubmission: async (submission) => {
        await onSubmissionsChange([submission]);
        setCanonicalOverrides((current) => ({
          ...current,
          [submission.id]: submission,
        }));
      },
      submission: pendingSubmission,
    });

    pendingCreatedSubmissionRef.current = null;
    attemptedCreateStoragePathsRef.current.clear();
    setCanonicalOverrides((current) => ({
      ...current,
      [nextSubmission.id]: nextSubmission,
    }));
    setSearchQuery("");
    if (options?.openQuestionnaire) {
      setActiveNav("submissions");
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
    passportUploads: PassportUploadDraft[] = [],
    preliminaryIntake?: PreliminaryIntakeDraft,
    options?: {
      familyCount?: number;
      openQuestionnaire?: boolean;
      type?: Submission["type"];
    },
  ) => {
    if (createSubmissionPromiseRef.current) {
      return createSubmissionPromiseRef.current;
    }
    const promise = executeCreateCanonicalDraft(
      passportUploads,
      preliminaryIntake,
      options,
    ).finally(() => {
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
          : applySubmissionActionResult(
              latestSubmission,
              action,
              "agent",
              actorId,
            );
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
      const result = markSubmissionIssueFixedResult(
        latestSubmission,
        issueId,
        "agent",
      );
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

  const handleUploadComplete = (draft: ProductIntakeDraft) => {
    bridge.onQuestionnaireOpen?.(draft.id);
    emitVisaflowUiEvent(bridge, { type: "questionnaire.open", submissionId: draft.id });
    setIntakeDrafts((current) =>
      [draft, ...current.filter((item) => item.id !== draft.id)].slice(0, 8),
    );
    setSelectedRow(draft.id);
    setQuestionnaireInitialFocus({
      applicantId: draft.applicants[0]?.id,
      field: "surname",
      section: "Личные данные заявителя",
    });
    setDrawerOpen(false);
    setActiveNav("submissions");
    setSearchQuery("");
    setCurrentView("questionnaire");
  };

  const persistSupabasePreUploadDraft = async (
    draft: ProductIntakeDraft,
    preliminaryIntake: PreliminaryIntakeDraft,
    openQuestionnaire: boolean,
  ) => {
    await createCanonicalDraft(
      productIntakeDraftToPassportUploads(draft),
      preliminaryIntake,
      {
        familyCount: draft.applicants.length,
        openQuestionnaire,
        type: draft.type,
      },
    );
    if (!openQuestionnaire) setCurrentView("main");
  };

  const handleUploadDraftSave = (draft: ProductIntakeDraft) => {
    setIntakeDrafts((current) =>
      [draft, ...current.filter((item) => item.id !== draft.id)].slice(0, 8),
    );
    setSelectedRow(draft.id);
    setDrawerOpen(false);
    setActiveNav("submissions");
    setSubmissionTypeFilter(draft.type);
    setSubmissionFocusRequest((current) => ({
      revision: (current?.revision ?? 0) + 1,
      submissionId: draft.id,
      type: draft.type,
    }));
    setSearchQuery("");
    setCurrentView("main");
  };

  const persistQuestionnaireSubmission = (nextSubmission: Submission) => {
    setIntakeDrafts((current) =>
      current.filter((draft) => draft.id !== nextSubmission.id),
    );
    return onSubmissionsChange?.([nextSubmission]);
  };

  const renderNavButton = (
    section: LegacyAgentNavSection,
    icon: ReactNode,
    count?: number,
    warning?: boolean,
  ) => {
    const active = activeNav === section;

    return (
      <button
        aria-current={active ? "page" : undefined}
        aria-label={navLabel(normalizeAgentNav(section))}
        onClick={() => navigateTo(section)}
        className={`v19-agent-sidebar-nav-item w-full flex items-center gap-2.5 border px-2.5 py-2 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4] ${active ? "is-active" : "border-transparent hover:bg-white/5 text-white/70 hover:text-white"}`}
      >
        <span
          className={
            active
              ? "v19-agent-sidebar-nav-icon is-active"
              : "v19-agent-sidebar-nav-icon"
          }
        >
          {icon}
        </span>
        <span className="flex-1 text-left">{navLabel(normalizeAgentNav(section))}</span>
        {typeof count === "number" ? (
          <span
            className={`v19-agent-sidebar-nav-count px-1.5 py-0.5 rounded-full border text-[11px] font-medium ${active ? "is-active" : "border-white/5 bg-[var(--v19b-color-tag)] text-white/80"}`}
          >
            {count}
          </span>
        ) : null}
        {warning ? (
          <span className="h-2 w-2 rounded-full bg-[var(--v19b-dot-warning)]" />
        ) : null}
      </button>
    );
  };

  const actionStatusTagClass = (action: AgentActionItem) =>
    action.severity === "blocker"
      ? "tone-danger"
      : action.severity === "warning"
        ? "tone-warning"
        : action.severity === "ready"
          ? "tone-ready"
          : "tone-info";

  const actionPeopleCount = (action: AgentActionItem) =>
    action.submission.applicants.length;

  const actionAreaLabel = (action: AgentActionItem) => {
    if (action.tab === "questionnaire") return "Анкета";
    if (action.tab === "files") return "Файлы";
    if (action.tab === "issues") return "Замечания";
    if (action.tab === "history") return "История";
    return "Подача";
  };

  const renderNavContent = () => (
    <>
      <div className="flex items-center gap-2.5 px-2 pb-4 mb-2">
        <img
          src={visaflowLogo}
          alt="VisaFlow"
          className="h-8 w-8 shrink-0 rounded-lg object-cover"
        />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold tracking-tight">VisaFlow V-19</div>
          <div className="text-[11px] text-white/50">Кабинет агента</div>
        </div>
        <button
          aria-label="Закрыть меню"
          onClick={() => setMobileNavOpen(false)}
          type="button"
          className="md:hidden p-2 text-white/50 hover:text-white"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      <button
        aria-label="Открыть командную палитру"
        className="h-10 mb-4 bg-white/5 hover:bg-white/10 border border-[#242529] rounded-[10px] text-white/50 flex items-center gap-2 px-3 text-sm transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4] mx-2"
        type="button"
        onClick={openCommandPalette}
      >
        <Search className="w-4 h-4" />
        <span>Поиск...</span>
        <kbd className="ml-auto px-1.5 py-0.5 rounded bg-black/40 border border-[#242529] text-[10px] font-sans">
          ⌘K
        </kbd>
      </button>

      <div className="flex-1 overflow-y-auto px-2 space-y-5 scrollbar-hide">
        <nav className="space-y-0.5">
          <div className="px-2 pb-1 text-[11px] text-[var(--v19b-color-text-muted)] font-medium tracking-wide uppercase">
            Работа
          </div>
          {renderNavButton(
            "actions",
            <ListChecks className="w-4 h-4" />,
            actionQueue.summary.open,
          )}
          {renderNavButton("submissions", <FileStack className="w-4 h-4" />, rows.length)}
          {renderNavButton("settings", <SlidersHorizontal className="w-4 h-4" />)}
        </nav>
      </div>

      <div className="mt-auto border-t border-[#202124] p-3 mx-2 space-y-2">
        <button
          aria-label="Открыть профиль"
          onClick={() => navigateTo("settings")}
          className="v19-agent-sidebar-profile w-full min-h-[60px] rounded-xl border px-3 py-2 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]"
        >
          <span className="flex items-center gap-2.5">
            <span className="v19-agent-sidebar-avatar relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border text-[12px] font-bold text-white">
              {agentAvatar}
              <span
                className="v19-agent-sidebar-presence absolute -right-0.5 -bottom-0.5 h-2.5 w-2.5 rounded-full border-2"
                aria-label="Сеанс активен"
              />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[13px] font-semibold leading-5 text-white">
                {agentName}
              </span>
              <span className="v19-agent-sidebar-profile-meta block truncate text-[11px] leading-4">
                {agentAgency}
              </span>
            </span>
            <SlidersHorizontal
              className="v19-agent-sidebar-profile-icon h-4 w-4 shrink-0"
              aria-hidden="true"
            />
          </span>
        </button>
        {onSwitchWorkspace ? (
          <button
            onClick={() => {
              setMobileNavOpen(false);
              onSwitchWorkspace();
            }}
            type="button"
            className="v19-agent-sidebar-workspace w-full h-10 px-3 border rounded-xl text-[13px] font-medium text-white transition-colors flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]"
          >
            <ArrowLeftRight className="v19-agent-sidebar-workspace-icon w-4 h-4" />В
            админскую зону
          </button>
        ) : null}
        {onSignOut ? (
          <button
            onClick={() => {
              setMobileNavOpen(false);
              void onSignOut();
            }}
            type="button"
            className="w-full h-10 px-3 bg-[#1e1e21] hover:bg-[#27272b] border border-[#242529] rounded-xl text-[13px] font-medium text-white/82 transition-colors flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]"
          >
            Выйти
          </button>
        ) : null}
      </div>
    </>
  );

  const renderActionsList = () => (
    <section
      aria-label="Мои действия"
      className="v19-legacy-actions-screen v19-agent-shared-screen"
      data-testid="agent-actions-screen"
    >
      <V19PriorityHero
        actionAriaLabel={`Открыть приоритетные действия: ${blockerActionCount} требуют решения`}
        actionCount={blockerActionCount}
        hasBlockers={blockerActionCount > 0}
        title={
          blockerActionCount
            ? `${blockerActionCount} ${blockerActionCount === 1 ? "действие требует" : "действия требуют"} решения`
            : "Очередь готова к работе"
        }
        onAction={() => setActionSummaryFilter("blockers")}
      />

      <V19MetricStrip>
        <V19MetricCard
          active={actionSummaryFilter === "open"}
          detail="в работе"
          icon={ListChecks}
          label="Открыто"
          tone="neutral"
          value={actionQueue.summary.open}
          onClick={() => setActionSummaryFilter("open")}
        />
        <V19MetricCard
          active={actionSummaryFilter === "today"}
          detail="сегодня"
          icon={Clock}
          label="Сегодня"
          tone="amber"
          value={actionQueue.summary.today}
          onClick={() => setActionSummaryFilter("today")}
        />
        <V19MetricCard
          active={actionSummaryFilter === "completed"}
          detail="закрыто"
          icon={CheckCircle2}
          label="Закрыто"
          tone="green"
          value={actionQueue.summary.completed}
          onClick={() => setActionSummaryFilter("completed")}
        />
      </V19MetricStrip>

      <div className="v19-admin-review-board v19-agent-actions-board">
        <V19ListHeader
          actionDisabled={actionControlsAreDefault}
          actionLabel="Все"
          className="v19-admin-review-list-head"
          countLabel={`${visibleActions.length}`}
          onAction={resetActionFilters}
          title="Очередь действий"
        />
        <V19QueueToolbar
          actionDisabled={actionControlsAreDefault}
          actionIcon={RotateCcw}
          cityFilter={actionCityFilter}
          cityOptions={actionCityOptions}
          controls={
            <>
              <V19ToolbarSelect<ActionSummaryFilter>
                ariaLabel="Фильтр действий"
                className={actionSummaryFilter !== "open" ? "is-active" : ""}
                icon={Shapes}
                label="Статус"
                options={[
                  { label: "Открыто", value: "open" },
                  { label: "Блокеры", value: "blockers" },
                  { label: "Сегодня", value: "today" },
                  { label: "На неделе", value: "week" },
                  { label: "Закрыто", value: "completed" },
                ]}
                value={actionSummaryFilter}
                onChange={setActionSummaryFilter}
              />
              <V19ToolbarSelect<ActionSort>
                ariaLabel="Сортировка действий"
                className={actionSort !== "tripDate" ? "is-active" : ""}
                icon={ArrowUpDown}
                label="Сортировка"
                options={[
                  { label: "По дате вылета", value: "tripDate" },
                  { label: "По дате создания", value: "createdAt" },
                ]}
                value={actionSort}
                onChange={setActionSort}
              />
            </>
          }
          filterLabel="Сбросить фильтры"
          onCityFilterChange={setActionCityFilter}
          onFilterClick={resetActionFilters}
          onSearchChange={setSearchQuery}
          searchPlaceholder="ID, семья или город"
          searchValue={searchQuery}
        />
        <V19OperationalCardGrid className="v19-agent-actions-card-grid">
          <AnimatePresence mode="popLayout">
            {visibleActions.length === 0 ? (
              <motion.div
                key="empty-actions"
                initial={false}
                animate={{ opacity: 1, y: 0 }}
                exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, y: -10 }}
                className="v19-legacy-actions-empty"
                role="status"
              >
                <span aria-hidden="true" className="v19-legacy-actions-empty-icon">
                  {actionFiltersActive ? <Search /> : <ListChecks />}
                </span>
                <h2>
                  {actionFiltersActive ? "Ничего не найдено" : "Очередь действий пуста"}
                </h2>
                <p>
                  {actionFiltersActive
                    ? "Измените поисковый запрос или сбросьте выбранные фильтры."
                    : "Создайте подачу — следующие шаги появятся здесь автоматически."}
                </p>
                <button
                  type="button"
                  onClick={actionFiltersActive ? resetActionFilters : createPackage}
                >
                  {actionFiltersActive ? "Сбросить фильтры" : "Новая подача"}
                </button>
              </motion.div>
            ) : (
              visibleActions.map((action) => (
                <V19OperationalCard
                  actionIcon={ListChecks}
                  actionText={action.context}
                  as={motion.button}
                  city={action.submission.city}
                  footer={
                    <>
                      <span className="v19-operational-card-signals">
                        <span
                          className={actionStatusTagClass(action)}
                          data-testid="agent-action-status"
                        >
                          {action.dueLabel}
                        </span>
                      </span>
                    </>
                  }
                  layout
                  peopleCount={actionPeopleCount(action)}
                  progress={
                    <>
                      <V19OperationalProgressLine
                        label="Анкета"
                        value={action.submission.completeness.questionnaire}
                      />
                      <V19OperationalProgressLine
                        label="Файлы"
                        value={action.submission.completeness.files}
                      />
                    </>
                  }
                  publicId={submissionPublicId(action.submission)}
                  shellDetail={actionAreaLabel(action)}
                  shellIcon={ListChecks}
                  shellLabel="Задача"
                  shellMeta={action.dueLabel}
                  title={action.title}
                  type="button"
                  key={action.id}
                  initial={false}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={
                    prefersReducedMotion
                      ? { opacity: 0 }
                      : { opacity: 0, x: 120, scale: 0.992 }
                  }
                  transition={{ duration: prefersReducedMotion ? 0.01 : 0.2 }}
                  onClick={() => handleActionOpen(action)}
                  tabIndex={0}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      handleActionOpen(action);
                    }
                  }}
                  className={`severity-${action.severity}${action.severity === "blocker" ? " has-blocker" : ""}`}
                  data-agent-action-id={action.id}
                  data-testid="agent-action-row"
                  aria-label={`${action.cta}: ${action.title}`}
                />
              ))
            )}
          </AnimatePresence>
        </V19OperationalCardGrid>
      </div>
    </section>
  );

  const renderSettings = () => (
    <section
      aria-labelledby="agent-settings-title"
      className="grid max-w-3xl gap-5 rounded-2xl border border-[#242529] bg-[#161617] p-6"
    >
      <div>
        <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-white/62">
          <SlidersHorizontal className="w-3.5 h-3.5" /> Canonical V19
        </div>
        <h2
          className="m-0 text-[24px] font-semibold tracking-tight text-white"
          id="agent-settings-title"
        >
          Настройки рабочего места
        </h2>
        <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-white/60">
          Основные параметры рабочего места агента сохраняются в этом контуре.
        </p>
      </div>

      <label className="grid max-w-sm gap-2">
        <h2 className="m-0 text-[18px] font-semibold text-white">Уведомления</h2>
        <span className="text-[13px] font-semibold text-white">
          Сводка по действиям
        </span>
        <select
          aria-label="Сводка по действиям"
          className="h-10 rounded-[10px] border border-[#242529] bg-[#1e1e21] px-3 text-[13px] font-medium text-white outline-none focus:border-[#6f64ff]/55"
          value={settingsDigest}
          onChange={(event) => {
            setSettingsDigest(event.currentTarget.value as "instant" | "daily");
            setSettingsDirty(true);
            setSettingsSaved(false);
          }}
        >
          <option value="instant">Сразу</option>
          <option value="daily">Раз в день</option>
        </select>
      </label>

      <label className="flex max-w-sm items-center justify-between gap-3 rounded-[12px] border border-[#242529] bg-[#1e1e21] p-3">
        <span className="text-[13px] font-semibold text-white">Возврат подачи</span>
        <input
          aria-label="Возврат подачи"
          className="h-5 w-9 accent-[#3a45b4]"
          defaultChecked
          role="switch"
          type="checkbox"
        />
      </label>

      {settingsDirty ? (
        <div
          className="flex flex-col gap-3 rounded-[12px] border border-[#3b321d] bg-[#221d13] p-4 text-[13px] font-medium text-[#f6c66b] sm:flex-row sm:items-center sm:justify-between"
          role="status"
        >
          <span>Есть несохранённые изменения</span>
          <button
            className="h-10 rounded-[10px] border border-[#4450c5] bg-[#3a45b4] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#4855d4]"
            type="button"
            onClick={() => {
              setSettingsDirty(false);
              setSettingsSaved(true);
            }}
          >
            Сохранить
          </button>
        </div>
      ) : (
        <div className="text-[13px] font-medium text-white/60" role="status">
          {settingsSaved ? "Настройки сохранены" : "Изменений нет"}
        </div>
      )}
    </section>
  );

  const title = navLabel(activeNav);

  return (
    <div className="flex h-full w-full bg-[#101011] relative overflow-hidden">
      <AnimatePresence mode="wait">
        {currentView === "questionnaire" && selectedRow && (
          <QuestionnaireScreen
            key={`questionnaire-${selectedRow}`}
            agentId={agentId}
            initialFocus={questionnaireInitialFocus}
            submissionId={selectedRow}
            draft={selectedIntakeDraft}
            submission={selectedCanonicalSubmission}
            onAssignPublicNumber={onAssignPublicNumber}
            onBack={handleQuestionnaireBack}
            onSavedAndExit={showSavedSubmissionInList}
            onOpenDocuments={() => focusSubmissionInList(selectedRow)}
            onSubmissionUpdate={
              onSubmissionUpdate && !selectedIntakeDraft
                ? (update) => onSubmissionUpdate(selectedRow, update)
                : undefined
            }
            onSubmissionChange={persistQuestionnaireSubmission}
            onMarkIssueFixed={markAgentIssueFixed}
            onUploadFile={
              usesSupabase && selectedRow
                ? async (fileId, file) => {
                    await uploadCanonicalFile(selectedRow, fileId, file);
                  }
                : undefined
            }
          />
        )}
        {currentView === "upload" && (
          <PreUploadScreen
            key="upload"
            onBack={() => setCurrentView("main")}
            onSaveDraft={
              usesSupabase
                ? (draft, preliminaryIntake) =>
                    persistSupabasePreUploadDraft(draft, preliminaryIntake, false)
                : handleUploadDraftSave
            }
            onComplete={
              usesSupabase
                ? (draft, preliminaryIntake) =>
                    persistSupabasePreUploadDraft(draft, preliminaryIntake, true)
                : handleUploadComplete
            }
          />
        )}
      </AnimatePresence>

      <div
        aria-hidden={currentView !== "main" ? "true" : undefined}
        className="contents"
        inert={currentView !== "main"}
      >
      <AnimatePresence>
        {mobileNavOpen && (
          <div className="md:hidden">
            <motion.button
              aria-label="Закрыть меню"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setMobileNavOpen(false)}
              type="button"
              className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            />
            <motion.aside
              aria-label="Меню агента"
              aria-modal="true"
              id={agentMobileNavigationId}
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              role="dialog"
              transition={{ type: "spring", damping: 25, stiffness: 250 }}
              className="fixed inset-y-0 left-0 w-[280px] bg-[#141416] border-r border-[#202124] z-50 flex flex-col py-3 font-medium shadow-[0_0_40px_rgba(0,0,0,0.5)]"
            >
              {renderNavContent()}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <aside className="hidden md:flex w-[288px] shrink-0 bg-[#161617] border-r border-[#202124] flex-col py-3 z-20">
        {renderNavContent()}
      </aside>

      <main
        aria-label="Рабочая область подач"
        className="flex-1 min-w-0 flex flex-col bg-[#141416]"
      >
        <header className="h-[60px] lg:h-16 shrink-0 border-b border-[#202124] flex items-center px-4 lg:px-6 gap-4 bg-[#141416] z-10 sticky top-0">
          <div className="flex items-center gap-3">
            <button
              aria-controls={agentMobileNavigationId}
              aria-expanded={mobileNavOpen}
              aria-label="Меню"
              onClick={() => setMobileNavOpen(true)}
              type="button"
              className="md:hidden w-10 h-10 -ml-2 rounded-lg hover:bg-white/5 flex items-center justify-center text-white/70"
            >
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-[19px] lg:text-[21px] font-semibold tracking-tight text-white m-0 leading-none">
              {title}
            </h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button
              aria-label="Новая подача"
              onClick={createPackage}
              className="v19-action-surface-create h-[36px] lg:h-10 px-3.5 bg-[#3a45b4] hover:bg-[#4855d4] text-white rounded-[10px] text-[13px] lg:text-sm font-medium transition-colors flex items-center gap-2 shadow-[0_0_20px_rgba(58,69,180,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Новая подача</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4 lg:p-6 pb-[max(24px,env(safe-area-inset-bottom))]">
          <div className="max-w-[1460px] mx-auto h-full">
            {activeNav === "settings" && renderSettings()}
            {activeNav === "actions" && renderActionsList()}
            {activeNav === "submissions" && (
              <div>
                <AgentReturnPackagesPanel enabled={usesSupabase} />
                <ApplicantsScreen
                  focusRequest={submissionFocusRequest}
                  onOpenDrawer={handleRowClick}
                  onOpenQuestionnaire={handleOpenQuestionnaire}
                  onOpenWorkspaceTarget={handleOpenWorkspaceTarget}
                  onSubmitForReview={(submissionId) =>
                    executeAgentSubmissionActionFor(submissionId, "submit_for_review").then(
                      () => undefined,
                    )
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
          </div>
        </div>
      </main>

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
        onOpenSubmission={(submission) => handleRowClick(submission.id)}
      />
      </div>
    </div>
  );
}
