import {
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  ClipboardPenLine,
  FileText,
  FileWarning,
  Files,
  History,
  Hash,
  Image as ImageIcon,
  Info,
  MessageSquarePlus,
  Send,
  ScanText,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  TriangleAlert,
  User,
  Users,
  UsersRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { useExperienceReducedMotion } from "../../../shared/ui/experiencePreferences";
import { invokeAiHelperEdge } from "../../../services/aiEdgeClient";
import {
  adminAiActor,
  buildAdminAiContext,
  buildAdminIssueDraftContext,
  failedAdminAiState,
  nextActionCopy,
  unavailableAdminAiState,
  type AdminAiDrawerState,
  type AdminAiRemarkDraftState,
} from "../adminAiAssistance";
import {
  adminIssueGuard,
  fileStatusLabels,
  getPrimaryAction,
  openIssueCount,
  statusLabels,
} from "../status";
import {
  fileLabel,
  targetElementId,
  targetForIssue,
  type WorkspaceTarget,
} from "../workspaceModel";
import type {
  Applicant,
  DrawerTab,
  IssueInput,
  QuestionnaireField,
  Submission,
  SubmissionAction,
  SubmissionFile,
} from "../types";
import {
  buildIdentityConsistencyReport,
  type IdentityConsistencyFinding,
} from "../identityConsistency";
import {
  ADMIN_PASSPORT_REVIEW_FIELD_IDS,
  ADMIN_PASSPORT_REVIEW_FIELD_LABELS,
  passportReviewMediaTypesVisibleForApplicant,
  requiredPassportReviewMediaTypesForApplicant,
} from "../passportReviewContract";
import {
  IdentityConsistencyPanel,
  IdentityConsistencyStatusStrip,
} from "./IdentityConsistencyPanel";
import { BbAiPanel } from "./BbAiPanel";

type AdminReviewFileTarget = "passport_scan" | "selfie" | "selfie_2";

type AdminReviewTab =
  | "overview"
  | "applicants"
  | "files"
  | "passport"
  | "selfie"
  | "questionnaire"
  | "issues"
  | "history";

type RemarkTargetType =
  | "checklistItem"
  | "document"
  | "questionnaire"
  | "section"
  | AdminReviewFileTarget;

type RemarkContext = {
  applicantId: string;
  checklistItemId?: string;
  checklistItemLabel?: string;
  field?: string;
  fileType?: AdminReviewFileTarget;
  reason?: string;
  sectionId?: string;
  sectionLabel?: string;
  targetLabel?: string;
  targetType: RemarkTargetType;
};

type FieldStatus = "error" | "ok" | "pending";

type ReviewFieldRow = {
  field?: QuestionnaireField;
  hasDocument?: boolean;
  label: string;
  section: string;
  sectionId: string;
  value: string;
};

type ReviewSection = {
  id: string;
  isPassport?: boolean;
  rows: ReviewFieldRow[];
  title: string;
};

type ChecklistItem = {
  helper: string;
  id: string;
  label: string;
  reason: string;
};

const adminReferenceTabs: Array<{
  count?: (submission: Submission) => number;
  icon: LucideIcon;
  id: DrawerTab;
  label: string;
  warning?: boolean;
}> = [
  { icon: Info, id: "overview", label: "Обзор" },
  {
    count: (submission) => submission.applicants.length,
    icon: UsersRound,
    id: "applicants",
    label: "Заявители",
  },
  {
    count: (submission) => questionnaireFieldCount(submission),
    icon: ClipboardPenLine,
    id: "questionnaire",
    label: "Анкета",
  },
  { icon: Files, id: "files", label: "Файлы" },
  {
    count: (submission) => openIssueCount(submission),
    icon: TriangleAlert,
    id: "issues",
    label: "Замечания",
    warning: true,
  },
  {
    count: (submission) => submission.history.length,
    icon: History,
    id: "history",
    label: "История",
  },
];

const mediaTargets: Array<{
  id: AdminReviewFileTarget;
  label: string;
  shortLabel: string;
}> = [
  { id: "passport_scan", label: "Скан паспорта", shortLabel: "Паспорт" },
  { id: "selfie", label: "Селфи 1", shortLabel: "Селфи 1" },
  { id: "selfie_2", label: "Селфи 2", shortLabel: "Селфи 2" },
];

const remarkTemplates = [
  "Значение в анкете не совпадает со сканом паспорта или селфи. Проверьте и исправьте поле.",
  "Скан паспорта или селфи читается не полностью. Загрузите файл в лучшем качестве.",
  "Нужно добавить актуальный скан паспорта или селфи для этого поля.",
];

function adminReviewTabId(tab: DrawerTab) {
  return `admin-review-tab-${tab}`;
}

function adminReviewPanelId(tab: DrawerTab) {
  return `admin-review-panel-${tab}`;
}

export function AdminReviewDrawer({
  actionError = "",
  activeTab,
  focusTarget,
  onClearFocusTarget,
  onAction,
  onAddIssue,
  onAcceptAiSuggestion,
  onClose,
  onDismissAiSuggestion,
  onRunAiReview,
  onTab,
  onVerifyDocument,
  submission,
}: {
  actionError?: string;
  activeTab: DrawerTab;
  focusTarget?: WorkspaceTarget;
  onClearFocusTarget?: () => void;
  onAction: (action: SubmissionAction) => void;
  onAddIssue: (input: IssueInput) => void;
  onAcceptAiSuggestion: (suggestionId: string) => void;
  onClose: () => void;
  onDismissAiSuggestion: (suggestionId: string) => void;
  onRunAiReview: () => void;
  onTab: (tab: DrawerTab) => void;
  onVerifyDocument: (applicantId: string) => void;
  submission: Submission;
}) {
  const [selectedApplicantId, setSelectedApplicantId] = useState(
    submission.applicants[0]?.id ?? "",
  );
  const [reviewTarget, setReviewTarget] =
    useState<AdminReviewFileTarget>("passport_scan");
  const [activeReviewTab, setActiveReviewTab] = useState<AdminReviewTab>(() =>
    drawerTabToReviewTab(activeTab),
  );
  const [remarkContext, setRemarkContext] = useState<RemarkContext | null>(null);
  const [passportWorkspaceOpen, setPassportWorkspaceOpen] = useState(false);
  const [adminAiState, setAdminAiState] = useState<AdminAiDrawerState>({
    status: "idle",
  });
  const [questionnaireFocusTarget, setQuestionnaireFocusTarget] =
    useState<WorkspaceTarget | undefined>(undefined);
  const drawerRef = useRef<HTMLElement | null>(null);
  const reviewTabsRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const remarkContextRef = useRef(remarkContext);
  const passportWorkspaceOpenRef = useRef(passportWorkspaceOpen);
  const prefersReducedMotion = useExperienceReducedMotion();

  onCloseRef.current = onClose;
  remarkContextRef.current = remarkContext;
  passportWorkspaceOpenRef.current = passportWorkspaceOpen;

  useEffect(() => {
    if (submission.applicants.some((applicant) => applicant.id === selectedApplicantId)) {
      return;
    }
    setSelectedApplicantId(submission.applicants[0]?.id ?? "");
  }, [selectedApplicantId, submission.applicants]);

  useEffect(() => {
    const mappedTab = drawerTabToReviewTab(activeTab);
    setActiveReviewTab((current) => {
      if (
        activeTab === "questionnaire" &&
        (current === "passport" || current === "selfie" || current === "questionnaire")
      ) {
        return current;
      }
      if (
        activeTab === "files" &&
        (current === "passport" || current === "selfie" || current === "files")
      ) {
        return current;
      }
      return mappedTab;
    });
  }, [activeTab]);

  useEffect(() => {
    const previouslyFocusedElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => {
      drawerRef.current
        ?.querySelector<HTMLButtonElement>(".admin-review-close")
        ?.focus({ preventScroll: true });
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (remarkContextRef.current) {
          return;
        }
        event.preventDefault();
        if (passportWorkspaceOpenRef.current) {
          setPassportWorkspaceOpen(false);
          return;
        }
        onCloseRef.current();
        return;
      }

      if (
        event.key !== "Tab" ||
        passportWorkspaceOpenRef.current ||
        remarkContextRef.current
      ) {
        return;
      }

      const focusableElements = Array.from(
        drawerRef.current?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      ).filter(
        (element) =>
          element.getAttribute("aria-hidden") !== "true" &&
          !element.hasAttribute("hidden"),
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);
      if (!firstElement || !lastElement) return;

      if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus({ preventScroll: true });
      } else if (!drawerRef.current?.contains(document.activeElement)) {
        event.preventDefault();
        firstElement.focus({ preventScroll: true });
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocusedElement && document.contains(previouslyFocusedElement)) {
        previouslyFocusedElement.focus({ preventScroll: true });
      }
    };
  }, [submission.id]);

  const selectedApplicant =
    submission.applicants.find((applicant) => applicant.id === selectedApplicantId) ??
    submission.applicants[0];
  const primaryAction = getPrimaryAction(submission, "admin", "review");
  const adminNextAction = nextActionCopy(adminAiState, primaryAction.label);
  const issueGuard = adminIssueGuard(submission, "admin");
  const issueGuardReason = "reason" in issueGuard ? issueGuard.reason : "";
  const identityReport = useMemo(
    () => buildIdentityConsistencyReport(submission),
    [submission],
  );
  const selectedApplicantIdentityFindings = useMemo(
    () =>
      selectedApplicant
        ? identityReport.findings.filter(
            (finding) => finding.applicantId === selectedApplicant.id,
          )
        : [],
    [identityReport, selectedApplicant],
  );

  const selectReviewTab = useCallback(
    (tab: AdminReviewTab) => {
      setActiveReviewTab(tab);
      onTab(reviewTabToDrawerTab(tab));
      if (tab === "passport") setReviewTarget("passport_scan");
      if (tab === "selfie" && reviewTarget === "passport_scan") {
        setReviewTarget("selfie");
      }
    },
    [onTab, reviewTarget],
  );

  function isReferenceTabSelected(tab: DrawerTab) {
    if (tab === "overview") return activeReviewTab === "overview";
    if (tab === "applicants") return activeReviewTab === "applicants";
    if (tab === "issues") return activeReviewTab === "issues";
    if (tab === "history") return activeReviewTab === "history";
    if (tab === "files")
      return activeReviewTab === "files" || activeReviewTab === "passport" || activeReviewTab === "selfie";
    if (tab === "questionnaire") return activeReviewTab === "questionnaire";
    return false;
  }

  function selectReferenceTab(tab: DrawerTab) {
    if (tab === "overview") {
      selectReviewTab("overview");
      return;
    }

    if (tab === "applicants") {
      selectReviewTab("applicants");
      return;
    }

    if (tab === "issues") {
      selectReviewTab("issues");
      return;
    }

    if (tab === "history") {
      selectReviewTab("history");
      return;
    }

    if (tab === "files") {
      selectReviewTab("files");
      return;
    }

    selectReviewTab("questionnaire");
  }

  function focusReferenceTab(tab: DrawerTab) {
    window.requestAnimationFrame(() => {
      reviewTabsRef.current
        ?.querySelector<HTMLElement>(`#${adminReviewTabId(tab)}`)
        ?.focus({ preventScroll: true });
    });
  }

  function handleReferenceTabKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    currentTab: DrawerTab,
  ) {
    const currentIndex = adminReferenceTabs.findIndex((tab) => tab.id === currentTab);
    if (currentIndex < 0) return;

    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % adminReferenceTabs.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + adminReferenceTabs.length) % adminReferenceTabs.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = adminReferenceTabs.length - 1;
    } else {
      return;
    }

    const nextTab = adminReferenceTabs[nextIndex]?.id;
    if (!nextTab) return;
    event.preventDefault();
    selectReferenceTab(nextTab);
    focusReferenceTab(nextTab);
  }

  function openApplicantSubscreen(
    applicantId: string,
    tab: Extract<AdminReviewTab, "passport" | "selfie" | "questionnaire" | "files">,
  ) {
    setSelectedApplicantId(applicantId);
    if (tab === "passport" || tab === "selfie") {
      onVerifyDocument(applicantId);
      return;
    }
    selectReviewTab(tab);
  }

  useEffect(() => {
    setAdminAiState({ status: "idle" });
    setPassportWorkspaceOpen(false);
  }, [submission.id]);

  const runAdminAiReview = useCallback(async () => {
    setAdminAiState({ status: "loading" });

    try {
      const [review, nextAction, readiness] = await Promise.all([
        invokeAiHelperEdge(
          "admin_review",
          buildAdminAiContext(submission, "review"),
          adminAiActor,
        ),
        invokeAiHelperEdge(
          "admin_next_action",
          buildAdminAiContext(submission, "nextAction"),
          adminAiActor,
        ),
        invokeAiHelperEdge(
          "admin_readiness_explanation",
          buildAdminAiContext(submission, "readiness"),
          adminAiActor,
        ),
      ]);

      if (!review && !nextAction && !readiness) {
        setAdminAiState(unavailableAdminAiState());
        return;
      }

      setAdminAiState({
        status: "ready",
        review: review ?? undefined,
        nextAction: nextAction ?? undefined,
        readiness: readiness ?? undefined,
      });
    } catch {
      setAdminAiState(failedAdminAiState());
    }
  }, [submission]);

  const draftAdminRemark = useCallback(
    async (input: {
      context: RemarkContext;
      field: string;
      reason: string;
      targetType: string;
    }) => {
      const result = await invokeAiHelperEdge(
        "admin_issue_remark_draft",
        buildAdminIssueDraftContext({
          field: input.field,
          reason: input.reason,
          sectionLabel: input.context.sectionLabel,
          submission,
          targetType: input.targetType,
        }),
        adminAiActor,
      );

      return (
        result?.issueRemarkDraft ??
        result?.agentFollowUpDrafts?.[0] ??
        result?.suggestions[0] ??
        result?.summary ??
        null
      );
    },
    [submission],
  );

  const jumpToWorkspaceTarget = useCallback((target: WorkspaceTarget) => {
    if (target.tab !== "issues") setSelectedApplicantId(target.applicantId);

    if (target.tab === "questionnaire") {
      setQuestionnaireFocusTarget(target);
      selectReviewTab("questionnaire");
      return;
    }

    if (target.tab === "files" && isAdminReviewFileTarget(target.fileType)) {
      setReviewTarget(target.fileType);
      onVerifyDocument(target.applicantId);
      return;
    }

    if (target.tab === "files") {
      selectReviewTab("files");
      return;
    }

    selectReviewTab("issues");
  }, [onVerifyDocument, selectReviewTab]);

  function handleIdentityFindingRemark(finding: IdentityConsistencyFinding) {
    const target = finding.target;
    const applicantId = target.tab !== "issues" ? target.applicantId : finding.applicantId;

    if (target.tab === "files" && isAdminReviewFileTarget(target.fileType)) {
      setRemarkContext({
        applicantId,
        field: finding.label,
        fileType: target.fileType,
        reason: finding.message,
        sectionLabel: fileLabel(target.fileType),
        targetLabel: finding.label,
        targetType: target.fileType,
      });
      return;
    }

    setRemarkContext({
      applicantId,
      field: finding.label,
      reason: finding.message,
      sectionLabel: target.tab === "questionnaire" ? target.section ?? "Анкета" : "AI-сверка",
      targetLabel: finding.label,
      targetType: "questionnaire",
    });
  }

  useEffect(() => {
    if (!focusTarget) return;
    jumpToWorkspaceTarget(focusTarget);
    onClearFocusTarget?.();
  }, [focusTarget, jumpToWorkspaceTarget, onClearFocusTarget, submission.id]);

  function openQuestionnaireRemark(row: ReviewFieldRow) {
    if (!selectedApplicant) return;
    setRemarkContext({
      applicantId: selectedApplicant.id,
      field: row.label,
      reason: `${row.label}: требуется уточнение`,
      sectionId: row.sectionId,
      sectionLabel: row.section,
      targetLabel: row.label,
      targetType: "questionnaire",
    });
  }

  function openFileRemark(
    fileType: AdminReviewFileTarget,
    reason?: string,
    context?: Partial<RemarkContext>,
    applicantId = selectedApplicant?.id,
  ) {
    if (!applicantId) return;
    setRemarkContext({
      applicantId,
      ...context,
      fileType,
      reason: reason ?? `${fileLabel(fileType)} требует повторной проверки`,
      targetType: fileType,
    });
  }

  function openGeneralRemark() {
    if (!selectedApplicant) return;
    setRemarkContext({
      applicantId: selectedApplicant.id,
      reason: "Требуется уточнение",
      sectionLabel: "Анкета",
      targetLabel: "Анкета",
      targetType: "questionnaire",
    });
  }

  function handleIssueJump(issue: Submission["issues"][number]) {
    jumpToWorkspaceTarget(targetForIssue(issue));
  }

  function submitRemark(input: IssueInput) {
    onAddIssue(input);
    setRemarkContext(null);
  }

  const activeReferenceTab =
    adminReferenceTabs.find((tab) => isReferenceTabSelected(tab.id))?.id ??
    "overview";

  return (
    <AnimatePresence>
      <motion.div
        className="admin-review-backdrop"
        key="admin-review-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.25, ease: "easeInOut" }}
        onClick={onClose}
      />

      <motion.aside
        aria-hidden={remarkContext ? "true" : undefined}
        aria-labelledby="admin-review-heading"
        aria-modal="true"
        className="admin-review-drawer"
        data-admin-review-drawer-surface="workspace"
        inert={remarkContext ? true : undefined}
        key="admin-review-drawer"
        ref={drawerRef}
        role="dialog"
        initial={
          prefersReducedMotion
            ? { filter: "blur(var(--v19b-size-0))", opacity: 1, x: 0 }
            : { filter: "blur(var(--v19b-size-8))", opacity: 0.5, x: "100%" }
        }
        animate={{ filter: "blur(var(--v19b-size-0))", opacity: 1, x: 0 }}
        exit={
          prefersReducedMotion
            ? { filter: "blur(var(--v19b-size-0))", opacity: 0, x: 0 }
            : { filter: "blur(var(--v19b-size-4))", opacity: 0, x: "100%" }
        }
        transition={
          prefersReducedMotion
            ? { duration: 0.01 }
            : { damping: 26, mass: 1, stiffness: 220, type: "spring" }
        }
      >
        <header className="admin-review-drawer-header">
          <div className="admin-review-titlebar">
            <div className="admin-review-titlecopy">
              <p>
                <strong>{submission.id}</strong>
                <span className="admin-review-title-separator" aria-hidden="true" />
                <span>{submission.title}</span>
              </p>
              <p className="admin-review-meta">
                {submission.city}
                <span aria-hidden="true"> · </span>
                {openIssueCount(submission)} замечаний
              </p>
              <h2 id="admin-review-heading">
                Проверка пакета
                <span className={`admin-review-status-pill is-${submission.status}`}>
                  {statusLabels[submission.status]}
                </span>
              </h2>
            </div>
            <button
              aria-label="Закрыть проверку"
              className="admin-review-close"
              type="button"
              onClick={onClose}
            >
              <X aria-hidden="true" size={20} />
            </button>
          </div>

          <nav
            className="admin-review-tabs"
            aria-label="Рабочие вкладки проверки"
            ref={reviewTabsRef}
            role="tablist"
          >
            {adminReferenceTabs.map((tab) => {
              const count = tab.count?.(submission);
              const selected = isReferenceTabSelected(tab.id);

              return (
                <button
                  aria-controls={adminReviewPanelId(tab.id)}
                  aria-selected={selected}
                  className={selected ? "is-active" : ""}
                  id={adminReviewTabId(tab.id)}
                  key={tab.id}
                  role="tab"
                  tabIndex={selected ? 0 : -1}
                  type="button"
                  onClick={() => selectReferenceTab(tab.id)}
                  onKeyDown={(event) => handleReferenceTabKeyDown(event, tab.id)}
                >
                  <span>{tab.label}</span>
                  {typeof count === "number" ? (
                    <em className={tab.warning && count > 0 ? "is-warning" : ""}>
                      {count}
                    </em>
                  ) : null}
                  {selected ? (
                    <motion.i
                      aria-hidden="true"
                      layoutId="adminReviewActiveTab"
                      transition={{ bounce: 0.2, duration: 0.5, type: "spring" }}
                    />
                  ) : null}
                </button>
              );
            })}
          </nav>
        </header>

        {actionError ? (
          <p className="admin-review-error" role="alert">
            {actionError}
          </p>
        ) : null}

        <div className="admin-review-content">
          <div className="admin-review-drawer-assist">
            <IdentityConsistencyStatusStrip compact report={identityReport} />
            <AdminAiAssistancePanel state={adminAiState} onRun={runAdminAiReview} />
          </div>

          {activeReviewTab === "passport" ||
          activeReviewTab === "selfie" ||
          activeReviewTab === "questionnaire" ? (
            <ApplicantChips
              selectedApplicantId={selectedApplicantId}
              submission={submission}
              onApplicant={setSelectedApplicantId}
            />
          ) : null}

          <AnimatePresence mode="wait">
            <motion.div
              aria-labelledby={adminReviewTabId(activeReferenceTab)}
              animate={{ opacity: 1, y: 0 }}
              className="admin-review-tab-panel"
              exit={
                prefersReducedMotion
                  ? { opacity: 0, y: 0 }
                  : { opacity: 0, y: -8 }
              }
              initial={
                prefersReducedMotion
                  ? { opacity: 0, y: 0 }
                  : { opacity: 0, y: 8 }
              }
              id={adminReviewPanelId(activeReferenceTab)}
              key={activeReviewTab}
              role="tabpanel"
              transition={{ duration: prefersReducedMotion ? 0.01 : 0.2 }}
            >
              {activeReviewTab === "overview" ? (
                <AdminOverviewTab
                  primaryActionLabel={primaryAction.label}
                  submission={submission}
                  onOpenTab={selectReviewTab}
                />
              ) : activeReviewTab === "applicants" ? (
                <ApplicantsReviewTab
                  selectedApplicantId={selectedApplicant?.id}
                  submission={submission}
                  onOpenSubscreen={openApplicantSubscreen}
                  onSelectApplicant={setSelectedApplicantId}
                />
              ) : activeReviewTab === "files" ? (
                <AdminFilesTab
                  submission={submission}
                  onFileRemark={(file, reason) => {
                    setSelectedApplicantId(file.applicantId);
                    openFileRemark(file.type, reason, undefined, file.applicantId);
                  }}
                  onOpenReview={(file) => {
                    setSelectedApplicantId(file.applicantId);
                    onVerifyDocument(file.applicantId);
                  }}
                />
              ) : activeReviewTab === "passport" ? (
                <PassportReviewTab
                  identityPanel={
                    <IdentityConsistencyPanel
                      compact
                      findings={selectedApplicantIdentityFindings}
                      report={identityReport}
                      selectedApplicantId={selectedApplicant?.id}
                      onCreateRemark={handleIdentityFindingRemark}
                      onJumpToFinding={(finding) => jumpToWorkspaceTarget(finding.target)}
                    />
                  }
                  issueGuardReason={issueGuardReason}
                  selectedApplicant={selectedApplicant}
                  submission={submission}
                  onChecklistRemark={(item) =>
                    openFileRemark("passport_scan", item.reason, {
                      checklistItemId: item.id,
                      checklistItemLabel: item.label,
                      field: item.label,
                      sectionId: "passport",
                      sectionLabel: "Паспорт",
                      targetLabel: item.label,
                      targetType: "checklistItem",
                    })
                  }
                  onFieldRemark={openQuestionnaireRemark}
                  onOpenWorkspace={() => {
                    if (selectedApplicant) onVerifyDocument(selectedApplicant.id);
                  }}
                  onNext={() => selectReviewTab("questionnaire")}
                  onRemark={() => openFileRemark("passport_scan", "Скан паспорта требует замены")}
                />
              ) : activeReviewTab === "selfie" ? (
                <SelfieReviewTab
                  issueGuardReason={issueGuardReason}
                  reviewTarget={reviewTarget === "passport_scan" ? "selfie" : reviewTarget}
                  selectedApplicant={selectedApplicant}
                  submission={submission}
                  onChecklistRemark={(fileType, item) =>
                    openFileRemark(fileType, `${fileLabel(fileType)}: ${item.reason}`, {
                      checklistItemId: item.id,
                      checklistItemLabel: item.label,
                      field: item.label,
                      sectionId: "selfie",
                      sectionLabel: "Селфи",
                      targetLabel: item.label,
                      targetType: "checklistItem",
                    })
                  }
                  onFileRemark={openFileRemark}
                  onOpenWorkspace={() => {
                    if (selectedApplicant) onVerifyDocument(selectedApplicant.id);
                  }}
                  onReviewTarget={setReviewTarget}
                />
              ) : activeReviewTab === "questionnaire" ? (
                <QuestionnaireReviewTab
                  focusTarget={questionnaireFocusTarget}
                  prefersReducedMotion={prefersReducedMotion}
                  selectedApplicant={selectedApplicant}
                  submission={submission}
                  onFieldRemark={openQuestionnaireRemark}
                  onVerifyPassport={() => {
                    if (selectedApplicant) onVerifyDocument(selectedApplicant.id);
                  }}
                />
              ) : activeReviewTab === "issues" ? (
                <IssuesTab
                  addRemarkDisabled={!selectedApplicant || Boolean(issueGuardReason)}
                  emptyStateReady={!primaryAction.disabled}
                  emptyStateReason={primaryAction.reason}
                  identityFindings={identityReport.findings}
                  submission={submission}
                  onAcceptAiSuggestion={onAcceptAiSuggestion}
                  onAddRemark={openGeneralRemark}
                  onDismissAiSuggestion={onDismissAiSuggestion}
                  onIdentityJump={(finding) => jumpToWorkspaceTarget(finding.target)}
                  onIdentityRemark={handleIdentityFindingRemark}
                  onJump={handleIssueJump}
                  onRunAiReview={onRunAiReview}
                />
              ) : activeReviewTab === "history" ? (
                <HistoryReviewTab submission={submission} />
              ) : null}
            </motion.div>
          </AnimatePresence>
        </div>

        <footer className="admin-review-footer">
          <div>
            <span className="admin-review-footer-dot" aria-hidden="true" />
            {adminNextAction}
          </div>
          <button className="admin-review-secondary" type="button" onClick={onClose}>
            Отложить
          </button>
          <button
            className={`admin-review-primary ${
              primaryAction.action === "return_with_issues" ||
              primaryAction.action === "return_again"
                ? "is-return"
                : ""
            }`}
            disabled={primaryAction.disabled}
            type="button"
            onClick={() => onAction(primaryAction.action)}
          >
            <ShieldCheck aria-hidden="true" size={16} />
            {primaryAction.label}
          </button>
        </footer>

      </motion.aside>

      {remarkContext ? (
        <AdminRemarkForm
          context={remarkContext}
          issueGuardReason={issueGuardReason}
          submission={submission}
          onClose={() => setRemarkContext(null)}
          onDraftRemark={draftAdminRemark}
          onSubmit={submitRemark}
        />
      ) : null}

      {passportWorkspaceOpen ? (
        <AdminPassportReviewWorkspace
          issueGuardReason={issueGuardReason}
          key="admin-passport-review-workspace"
          selectedApplicant={selectedApplicant}
          submission={submission}
          onChecklistRemark={(item) =>
            openFileRemark("passport_scan", item.reason, {
              checklistItemId: item.id,
              checklistItemLabel: item.label,
              field: item.label,
              sectionId: "passport",
              sectionLabel: "Паспорт",
              targetLabel: item.label,
              targetType: "checklistItem",
            })
          }
          onClose={() => setPassportWorkspaceOpen(false)}
          onFieldRemark={openQuestionnaireRemark}
          onNext={() => {
            setPassportWorkspaceOpen(false);
            selectReviewTab("questionnaire");
          }}
          onOpenWorkspace={() => {
            if (selectedApplicant) onVerifyDocument(selectedApplicant.id);
          }}
          onRemark={() => openFileRemark("passport_scan", "Скан паспорта требует замены")}
        />
      ) : null}

    </AnimatePresence>
  );
}

function AdminAiAssistancePanel({
  onRun,
  state,
}: {
  onRun: () => void;
  state: AdminAiDrawerState;
}) {
  const disabled = state.status === "loading";
  const reviewItems =
    state.review?.adminReviewChecklist?.length
      ? state.review.adminReviewChecklist
      : state.review?.suggestions;
  const blockerItems = [
    ...(state.review?.blockers ?? []),
    ...(state.readiness?.blockers ?? []),
  ].slice(0, 5);
  const readinessCopy =
    state.readiness?.readinessExplanation ||
    state.readiness?.summary ||
    "Готовность объясняется deterministic статусами, файлами и открытыми замечаниями.";

  return (
    <section className="admin-ai-assist" aria-label="AI-помощник администратора">
      <div className="admin-ai-assist-head">
        <div>
          <span>
            <Sparkles aria-hidden="true" size={14} />
            AI-помощник
          </span>
          <strong>Предварительная проверка</strong>
        </div>
        <button disabled={disabled} type="button" onClick={onRun}>
          <Sparkles aria-hidden="true" size={15} />
          {disabled ? "Проверяем" : "Проверить AI"}
        </button>
      </div>

      {state.status === "idle" ? (
        <p>
          Запустите локальную подсказку, чтобы собрать список проверки, возможные
          замечания и объяснение готовности.
        </p>
      ) : null}

      {state.status === "loading" ? (
        <p role="status">Запрос идет через серверный ai-helper. Действия не выполняются.</p>
      ) : null}

      {state.status === "unavailable" || state.status === "failed" ? (
        <p className="is-warning" role="status">
          {state.error}. Продолжайте ручную проверку; решения и отправка не выполняются
          автоматически.
        </p>
      ) : null}

      {state.status === "ready" ? (
        <div className="admin-ai-assist-grid">
          <section>
            <h3>Что проверить</h3>
            <ul>
              {(reviewItems?.length
                ? reviewItems
                : ["Сверьте файлы, анкету и открытые замечания вручную."]
              ).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
          <section>
            <h3>Блокеры и недостающие данные</h3>
            <ul>
              {(blockerItems.length
                ? blockerItems
                : ["Явные блокеры не найдены в безопасном AI-ответе."]
              ).map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
          <section>
            <h3>Готовность</h3>
            <p>{readinessCopy}</p>
          </section>
          <section>
            <h3>Ограничение</h3>
            <p>Требует проверки администратором. Принятие и выгрузка остаются ручными действиями.</p>
          </section>
        </div>
      ) : null}
    </section>
  );
}

function AdminOverviewTab({
  primaryActionLabel,
  submission,
  onOpenTab,
}: {
  primaryActionLabel: string;
  submission: Submission;
  onOpenTab: (tab: AdminReviewTab) => void;
}) {
  const fileCount = submission.files.length;
  const readyFileCount = submission.files.filter(
    (file) => file.status !== "missing" && file.status !== "needs_replacement",
  ).length;
  const fieldCount = questionnaireFieldCount(submission);
  const openIssues = openIssueCount(submission);
  const nextChecks: Array<{
    count: string;
    id: Extract<AdminReviewTab, "passport" | "selfie" | "questionnaire" | "issues" | "files">;
    label: string;
    tone?: "warning";
  }> = [
    { count: `${readyFileCount}/${fileCount}`, id: "files", label: "Файлы" },
    { count: String(fieldCount), id: "questionnaire", label: "Поля анкеты" },
    {
      count: String(openIssues),
      id: "issues",
      label: "Замечания",
      tone: openIssues > 0 ? "warning" : undefined,
    },
  ];

  return (
    <div className="admin-review-overview-tab" data-admin-review-overview>
      <section className="admin-review-overview-hero" aria-label="Сводка пакета">
        <div>
          <span>{submission.type === "family" ? "Семейная подача" : "Один заявитель"}</span>
          <h3>{submission.title}</h3>
          <p>
            {submission.city} · {submission.tripDateFrom}-{submission.tripDateTo} ·{" "}
            {submission.applicants.length} заявителей
          </p>
        </div>
        <strong>{primaryActionLabel}</strong>
      </section>

      <div className="admin-review-overview-metrics" aria-label="Метрики проверки">
        <MetricTile label="Анкета" value={`${submission.completeness.questionnaire}%`} />
        <MetricTile label="Файлы" value={`${submission.completeness.files}%`} />
        <MetricTile label="Всего" value={`${submission.completeness.total}%`} />
        <MetricTile label="Открыто" tone={openIssues > 0 ? "warning" : undefined} value={openIssues} />
      </div>

      <section className="admin-review-overview-route" aria-label="Маршрут проверки">
        {nextChecks.map((item) => (
          <button
            className={item.tone ? "is-warning" : ""}
            key={item.id}
            type="button"
            onClick={() => onOpenTab(item.id)}
          >
            <span>{item.label}</span>
            <strong>{item.count}</strong>
          </button>
        ))}
      </section>

      <section className="admin-review-overview-next" aria-label="Быстрые проверки">
        <button type="button" onClick={() => onOpenTab("files")}>
          <ScanText aria-hidden="true" size={15} />
          Паспорт и селфи
        </button>
        <button type="button" onClick={() => onOpenTab("history")}>
          <History aria-hidden="true" size={15} />
          История
        </button>
      </section>
    </div>
  );
}

function MetricTile({
  label,
  tone,
  value,
}: {
  label: string;
  tone?: "warning";
  value: number | string;
}) {
  return (
    <article className={tone ? "is-warning" : ""}>
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

function ApplicantsReviewTab({
  selectedApplicantId,
  submission,
  onOpenSubscreen,
  onSelectApplicant,
}: {
  selectedApplicantId?: string;
  submission: Submission;
  onOpenSubscreen: (
    applicantId: string,
    tab: Extract<AdminReviewTab, "passport" | "selfie" | "questionnaire" | "files">,
  ) => void;
  onSelectApplicant: (applicantId: string) => void;
}) {
  if (!submission.applicants.length) {
    return (
      <div className="admin-review-empty-card" role="status">
        <Users aria-hidden="true" size={18} />
        <strong>Заявители не добавлены</strong>
        <span>Проверка станет доступна после добавления хотя бы одного заявителя.</span>
      </div>
    );
  }

  return (
    <div className="admin-review-applicants-tab">
      {submission.applicants.map((applicant, index) => {
        const applicantFiles = submission.files.filter(
          (file) => file.applicantId === applicant.id,
        );
        const readyFiles = applicantFiles.filter(
          (file) => file.status !== "missing" && file.status !== "needs_replacement",
        ).length;
        const applicantIssues = submission.issues.filter(
          (issue) => issue.status === "open" && issue.target.applicantId === applicant.id,
        ).length;
        const passportRows = buildAdminPassportReviewRows(applicant);
        const fieldCount = passportRows.length;
        const checkedFields = passportRows.filter(
          (row) =>
            Boolean(row.field?.adminReviewApprovedAtIso) &&
            Boolean(row.field?.adminReviewApprovedBy),
        ).length;
        const selected = selectedApplicantId === applicant.id;
        const includesSelfies = requiredPassportReviewMediaTypesForApplicant(
          submission,
          applicant.id,
        ).includes("selfie");

        return (
          <article
            className={selected ? "is-selected" : ""}
            key={applicant.id}
            onFocus={() => onSelectApplicant(applicant.id)}
            onMouseEnter={() => onSelectApplicant(applicant.id)}
          >
            <header>
              <span>{index + 1}</span>
              <div>
                <strong>{applicant.fullName}</strong>
                <small>{applicantRoleLabel(applicant.role)}</small>
              </div>
              {applicantIssues > 0 ? <em>{applicantIssues} замеч.</em> : null}
            </header>
            <dl>
              <div>
                <dt>Анкета</dt>
                <dd>{checkedFields}/{fieldCount}</dd>
              </div>
              <div>
                <dt>Файлы</dt>
                <dd>{readyFiles}/{applicantFiles.length}</dd>
              </div>
              <div>
                <dt>Статус</dt>
                <dd>{applicant.questionnaireStatus === "complete" ? "Готово" : "Проверить"}</dd>
              </div>
            </dl>
            <footer>
              <button type="button" onClick={() => onOpenSubscreen(applicant.id, "passport")}>
                {includesSelfies ? "Паспорт и селфи" : "Паспорт"}
              </button>
              <button
                type="button"
                onClick={() => onOpenSubscreen(applicant.id, "questionnaire")}
              >
                Анкета
              </button>
            </footer>
          </article>
        );
      })}
    </div>
  );
}

function HistoryReviewTab({ submission }: { submission: Submission }) {
  if (!submission.history.length) {
    return (
      <div className="admin-review-empty-card">
        <History aria-hidden="true" size={18} />
        <strong>История пока пуста</strong>
        <span>События появятся после действий агента, администратора или системы.</span>
      </div>
    );
  }

  return (
    <div className="admin-review-history-tab" aria-label="История подачи">
      {submission.history.map((event) => (
        <article key={event.id}>
          <span>{historySourceLabel(event.source)}</span>
          <div>
            <strong>{event.text}</strong>
            {event.detail ? <p>{event.detail}</p> : null}
            <small>{event.at}</small>
          </div>
        </article>
      ))}
    </div>
  );
}


function isAdminReviewFileTarget(
  value: string | undefined,
): value is AdminReviewFileTarget {
  return value === "passport_scan" || value === "selfie" || value === "selfie_2";
}

function AdminFilesTab({
  onFileRemark,
  onOpenReview,
  submission,
}: {
  onFileRemark: (
    file: SubmissionFile & { type: AdminReviewFileTarget },
    reason?: string,
  ) => void;
  onOpenReview: (file: SubmissionFile & { type: AdminReviewFileTarget }) => void;
  submission: Submission;
}) {
  const reviewFiles = submission.files.filter(
    (file): file is SubmissionFile & { type: AdminReviewFileTarget } =>
      isAdminReviewFileTarget(file.type) &&
      passportReviewMediaTypesVisibleForApplicant(
        submission,
        file.applicantId,
      ).includes(file.type),
  );
  const readyCount = reviewFiles.filter(
    (file) => file.status !== "missing" && file.status !== "needs_replacement",
  ).length;

  return (
    <div className="admin-review-files-tab v19-drawer-files">
      <div className="v19-drawer-files-head">
        <h3 className="v19-drawer-files-title">Файлы подачи</h3>
        <span className="v19-drawer-files-count">
          {readyCount}/{reviewFiles.length}
        </span>
      </div>

      {!reviewFiles.length ? (
        <div className="admin-review-empty-card" role="status">
          <FileWarning aria-hidden="true" size={18} />
          <strong>Файлы для проверки не загружены</strong>
          <span>Паспорт и селфи появятся здесь после загрузки агентом.</span>
        </div>
      ) : null}

      <div className="v19-drawer-file-sections">
        {submission.applicants.map((applicant) => {
          const applicantFiles = reviewFiles.filter(
            (file) => file.applicantId === applicant.id,
          );
          if (!applicantFiles.length) return null;

          const applicantReadyCount = applicantFiles.filter(
            (file) => file.status !== "missing" && file.status !== "needs_replacement",
          ).length;

          return (
            <section className="v19-drawer-file-section" key={applicant.id}>
              <div className="v19-drawer-file-section-head">
                <span className="v19-drawer-file-section-copy">
                  <span className="v19-drawer-file-section-title">
                    {applicant.fullName}
                  </span>
                  <span className="v19-drawer-file-section-meta">
                    {applicantReadyCount}/{applicantFiles.length} файлов готово
                  </span>
                </span>
                <span className="v19-drawer-file-section-toggle">
                  {applicant.role === "main" ? "Основной" : applicantRoleLabel(applicant.role)}
                </span>
              </div>

              <div className="v19-drawer-file-list">
                {applicantFiles.map((file) => {
                  const Icon =
                    file.type === "passport_scan"
                      ? ScanText
                      : file.type === "selfie" || file.type === "selfie_2"
                        ? User
                        : ImageIcon;
                  const fileName =
                    file.originalFileName ?? file.generatedFileName ?? fileLabel(file.type);
                  const canCreateRemark =
                    requiredPassportReviewMediaTypesForApplicant(
                      submission,
                      file.applicantId,
                    ).includes(file.type);

                  return (
                    <div
                      className={`v19-drawer-file-item admin-review-file-item is-${file.status}`}
                      id={targetElementId({
                        applicantId: file.applicantId,
                        fileType: file.type,
                        tab: "files",
                      })}
                      key={file.id}
                    >
                      <div className="v19-drawer-file-icon">
                        <Icon aria-hidden="true" />
                      </div>
                      <div className="v19-drawer-file-copy">
                        <div className="v19-drawer-file-title">
                          {fileLabel(file.type)}
                        </div>
                        <div className="v19-drawer-file-meta">
                          {fileStatusLabels[file.status]} · {fileName}
                          {file.sizeBytes ? ` · ${formatBytes(file.sizeBytes)}` : ""}
                        </div>
                      </div>
                      <div className="admin-review-file-actions">
                        <button
                          className="v19-drawer-file-action admin-review-file-open"
                          type="button"
                          onClick={() => onOpenReview(file)}
                        >
                          Проверить
                        </button>
                        {canCreateRemark ? (
                          <button
                            aria-label={`Создать замечание: ${fileLabel(file.type)}`}
                            className="admin-review-row-remark admin-review-file-remark"
                            type="button"
                            onClick={() =>
                              onFileRemark(
                                file,
                                `${fileLabel(file.type)} требует повторной проверки`,
                              )
                            }
                          >
                            <MessageSquarePlus aria-hidden="true" size={14} />
                            <span>Замечание</span>
                          </button>
                        ) : (
                          <span className="admin-review-file-legacy-note">
                            Только просмотр
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

function ApplicantChips({
  selectedApplicantId,
  submission,
  onApplicant,
}: {
  selectedApplicantId: string;
  submission: Submission;
  onApplicant: (applicantId: string) => void;
}) {
  const selectedApplicant =
    submission.applicants.find((applicant) => applicant.id === selectedApplicantId) ??
    submission.applicants[0];
  const selectedPassportRows = selectedApplicant
    ? buildAdminPassportReviewRows(selectedApplicant)
    : [];
  const reviewedFields = selectedPassportRows.filter(
    (row) =>
      Boolean(row.field?.adminReviewApprovedAtIso) &&
      Boolean(row.field?.adminReviewApprovedBy),
  ).length;
  const remainingFields = Math.max(
    selectedPassportRows.length - reviewedFields,
    0,
  );
  const openIssues = selectedApplicant
    ? submission.issues.filter(
        (issue) =>
          issue.status === "open" && issue.target.applicantId === selectedApplicant.id,
      ).length
    : openIssueCount(submission);

  return (
    <div className="admin-review-applicant-strip" aria-label="Заявители в проверке">
      <label className="admin-review-applicant-select">
        <span>Заявитель</span>
        <select
          value={selectedApplicant?.id ?? ""}
          onChange={(event) => onApplicant(event.target.value)}
        >
          {submission.applicants.map((applicant) => (
            <option key={applicant.id} value={applicant.id}>
              {applicant.fullName} ({applicantRoleLabel(applicant.role)})
            </option>
          ))}
        </select>
      </label>

      <div className="admin-review-applicant-stats" aria-label="Статус проверки заявителя">
        <span className="is-ok">
          <CheckCircle2 aria-hidden="true" size={16} />
          {reviewedFields} проверено
        </span>
        <span>
          <i aria-hidden="true" />
          {remainingFields} осталось
        </span>
        <span className={openIssues ? "is-warning" : ""}>
          <AlertCircle aria-hidden="true" size={16} />
          {openIssues} замечаний
        </span>
      </div>
    </div>
  );
}

function PassportReviewTab({
  identityPanel,
  issueGuardReason,
  selectedApplicant,
  submission,
  onChecklistRemark,
  onFieldRemark,
  onOpenWorkspace,
  onNext,
  onRemark,
}: {
  identityPanel?: ReactNode;
  issueGuardReason: string;
  selectedApplicant?: Applicant;
  submission: Submission;
  onChecklistRemark: (item: ChecklistItem) => void;
  onFieldRemark: (row: ReviewFieldRow) => void;
  onOpenWorkspace: () => void;
  onNext: () => void;
  onRemark: () => void;
}) {
  const passportFile = selectedApplicant
    ? findApplicantFile(submission, selectedApplicant.id, "passport_scan")
    : undefined;
  const passportRows = selectedApplicant
    ? buildAdminPassportReviewRows(selectedApplicant)
    : [];
  return (
    <div className="admin-review-decision-workspace">
      <MediaReviewPane
        documentApplicant={selectedApplicant}
        file={passportFile}
        issueGuardReason={issueGuardReason}
        reviewTarget="passport_scan"
        showActions={false}
        showChecklist={false}
        submission={submission}
        onReject={() => onRemark()}
        onReviewTarget={() => undefined}
      />

      <section className="admin-review-check-pane" aria-label="Сверка паспорта">
        <header>
          <div>
            <span>Паспортная проверка</span>
            <h3>Паспорт + ключевые поля</h3>
          </div>
          <div className="admin-review-check-actions">
            <button type="button" onClick={onOpenWorkspace}>
              <ScanText aria-hidden="true" size={15} />
              Сверить
            </button>
          </div>
        </header>

        {identityPanel}

        <div className="admin-review-check-card">
          {passportChecklist().map((item) => (
            <article key={item.id}>
              <CheckCircle2 aria-hidden="true" size={15} />
              <div>
                <strong>{item.label}</strong>
                <span>{item.helper}</span>
              </div>
              <button type="button" onClick={() => onChecklistRemark(item)}>
                <MessageSquarePlus aria-hidden="true" size={14} />
                Замечание
              </button>
            </article>
          ))}
        </div>

        <div className="admin-review-passport-fields">
          <h4>Поля, сверяемые с паспортом</h4>
          {passportRows.map((row) => (
            <FieldReviewRow
              key={`passport-${row.field?.id ?? row.label}`}
              row={row}
              status={fieldStatus(submission, selectedApplicant?.id ?? "", row)}
              onRemark={() => onFieldRemark(row)}
            />
          ))}
        </div>

        <footer className="admin-review-inline-footer">
          <button type="button" onClick={onRemark}>
            <MessageSquarePlus aria-hidden="true" size={15} />
            Замечание
          </button>
          <button type="button" onClick={onNext}>
            К анкете
            <ArrowRight aria-hidden="true" size={15} />
          </button>
        </footer>
      </section>
    </div>
  );
}

function AdminPassportReviewWorkspace({
  issueGuardReason,
  selectedApplicant,
  submission,
  onChecklistRemark,
  onClose,
  onFieldRemark,
  onNext,
  onOpenWorkspace,
  onRemark,
}: {
  issueGuardReason: string;
  selectedApplicant?: Applicant;
  submission: Submission;
  onChecklistRemark: (item: ChecklistItem) => void;
  onClose: () => void;
  onFieldRemark: (row: ReviewFieldRow) => void;
  onNext: () => void;
  onOpenWorkspace: () => void;
  onRemark: () => void;
}) {
  const workspaceMainRef = useRef<HTMLElement | null>(null);
  const passportFile = selectedApplicant
    ? findApplicantFile(submission, selectedApplicant.id, "passport_scan")
    : undefined;
  const passportRows = selectedApplicant
    ? buildAdminPassportReviewRows(selectedApplicant)
    : [];
  const completedRows = passportRows.filter(
    (row) => fieldStatus(submission, selectedApplicant?.id ?? "", row) === "ok",
  ).length;
  const warningRows = passportRows.filter(
    (row) => fieldStatus(submission, selectedApplicant?.id ?? "", row) === "error",
  ).length;
  const confidence = passportRows.length
    ? Math.round((completedRows / passportRows.length) * 100)
    : 0;
  useEffect(() => {
    workspaceMainRef.current?.scrollTo?.({ top: 0, left: 0 });
  }, [submission.id, selectedApplicant?.id]);

  return (
    <motion.div
      animate={{ opacity: 1, scale: 1 }}
      aria-label="Сверка паспорта"
      aria-modal="true"
      className="admin-passport-workspace"
      exit={{ opacity: 0, scale: 0.985 }}
      initial={{ opacity: 0, scale: 0.985 }}
      role="dialog"
      transition={{ duration: 0.2, ease: "easeOut" }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        onClose();
      }}
    >
      <header className="admin-passport-workspace-header">
        <button aria-label="Назад к проверке" type="button" onClick={onClose}>
          <ArrowLeft aria-hidden="true" size={18} />
        </button>
        <div>
          <span>Admin document review</span>
          <h2>Сверка паспорта · {submission.id}</h2>
          <p>{selectedApplicant?.fullName ?? submission.title}</p>
        </div>
        <div className="admin-passport-workspace-actions">
          <button type="button" onClick={onOpenWorkspace}>
            <ScanText aria-hidden="true" size={16} />
            Открыть единую секцию
          </button>
        </div>
      </header>

      <main ref={workspaceMainRef} className="admin-passport-workspace-main">
        <section className="admin-passport-document-zone" aria-label="Скан паспорта">
          <MediaReviewPane
            documentApplicant={selectedApplicant}
            file={passportFile}
            issueGuardReason={issueGuardReason}
            reviewTarget="passport_scan"
            showActions={false}
            showChecklist={false}
            submission={submission}
            onReject={() => onRemark()}
            onReviewTarget={() => undefined}
          />
        </section>

        <section className="admin-passport-compare-zone" aria-label="Поля паспорта">
          <div className="admin-passport-compare-head">
            <span>
              <Sparkles aria-hidden="true" size={14} />
              Smart compare
            </span>
            <h3>Сверка полей</h3>
            <p>
              Проверьте совпадения между анкетой и сканом паспорта. Замечания создаются
              как точные задачи для агента.
            </p>
          </div>

          <div className="admin-passport-stats" aria-label="Статистика сверки">
            <article>
              <CheckCircle2 aria-hidden="true" size={18} />
              <strong>{completedRows}</strong>
              <span>совпало</span>
            </article>
            <article className={warningRows ? "is-warning" : ""}>
              <AlertCircle aria-hidden="true" size={18} />
              <strong>{warningRows}</strong>
              <span>риски</span>
            </article>
            <article>
              <ShieldCheck aria-hidden="true" size={18} />
              <strong>{confidence}%</strong>
              <span>готовность</span>
            </article>
          </div>

          <div className="admin-passport-checklist">
            {passportChecklist().map((item) => (
              <article key={item.id}>
                <CheckCircle2 aria-hidden="true" size={15} />
                <div>
                  <strong>{item.label}</strong>
                  <span>{item.helper}</span>
                </div>
                <button type="button" onClick={() => onChecklistRemark(item)}>
                  <MessageSquarePlus aria-hidden="true" size={14} />
                  Замечание
                </button>
              </article>
            ))}
          </div>

          <div className="admin-passport-fields">
            {passportRows.map((row) => (
              <FieldReviewRow
                key={`workspace-${row.field?.id ?? row.label}`}
                row={row}
                status={fieldStatus(submission, selectedApplicant?.id ?? "", row)}
                onRemark={() => onFieldRemark(row)}
              />
            ))}
          </div>
        </section>
      </main>

      <footer className="admin-passport-workspace-footer">
        <button type="button" onClick={onRemark}>
          <MessageSquarePlus aria-hidden="true" size={15} />
          Замечание
        </button>
        <button type="button" onClick={onOpenWorkspace}>
          <ScanText aria-hidden="true" size={15} />
          Открыть единую секцию
        </button>
        <button type="button" onClick={onNext}>
          К анкете
          <ArrowRight aria-hidden="true" size={15} />
        </button>
      </footer>
    </motion.div>
  );
}

function SelfieReviewTab({
  issueGuardReason,
  reviewTarget,
  selectedApplicant,
  submission,
  onChecklistRemark,
  onFileRemark,
  onOpenWorkspace,
  onReviewTarget,
}: {
  identityPanel?: ReactNode;
  issueGuardReason: string;
  reviewTarget: Extract<AdminReviewFileTarget, "selfie" | "selfie_2">;
  selectedApplicant?: Applicant;
  submission: Submission;
  onChecklistRemark: (fileType: AdminReviewFileTarget, item: ChecklistItem) => void;
  onFileRemark: (fileType: AdminReviewFileTarget, reason?: string) => void;
  onOpenWorkspace: () => void;
  onReviewTarget: (target: AdminReviewFileTarget) => void;
}) {
  const file = selectedApplicant
    ? findApplicantFile(submission, selectedApplicant.id, reviewTarget)
    : undefined;

  return (
    <div className="admin-review-decision-workspace is-selfie">
      <MediaReviewPane
        file={file}
        issueGuardReason={issueGuardReason}
        reviewTarget={reviewTarget}
        showActions={false}
        showChecklist={false}
        submission={submission}
        targets={["selfie", "selfie_2"]}
        onReject={onFileRemark}
        onReviewTarget={onReviewTarget}
      />

      <section className="admin-review-check-pane" aria-label="Проверка селфи">
        <header>
          <div>
            <span>Визуальная проверка</span>
            <h3>{fileLabel(reviewTarget)}</h3>
          </div>
          <button type="button" onClick={onOpenWorkspace}>
            <ScanText aria-hidden="true" size={15} />
            Открыть единую секцию
          </button>
        </header>

        <div className="admin-review-check-card">
          {selfieChecklist().map((item) => (
            <article key={item.id}>
              <CheckCircle2 aria-hidden="true" size={15} />
              <div>
                <strong>{item.label}</strong>
                <span>{item.helper}</span>
              </div>
              <button type="button" onClick={() => onChecklistRemark(reviewTarget, item)}>
                <MessageSquarePlus aria-hidden="true" size={14} />
                Замечание
              </button>
            </article>
          ))}
        </div>

        {!file || file.status === "missing" ? (
          <div className="admin-review-empty-card">
            <FileWarning aria-hidden="true" size={18} />
            <strong>Селфи не загружено</strong>
            <span>Создайте точное замечание, чтобы агент провалился прямо в этот файл.</span>
            <button
              type="button"
              onClick={() => onFileRemark(reviewTarget, `${fileLabel(reviewTarget)} отсутствует`)}
            >
              Создать замечание
            </button>
          </div>
        ) : null}

        <footer className="admin-review-inline-footer">
          <button
            type="button"
            onClick={() =>
              onFileRemark(reviewTarget, `${fileLabel(reviewTarget)} не проходит визуальную проверку`)
            }
          >
            <MessageSquarePlus aria-hidden="true" size={15} />
            Замечание
          </button>
        </footer>
      </section>
    </div>
  );
}

function QuestionnaireReviewTab({
  focusTarget,
  prefersReducedMotion,
  selectedApplicant,
  submission,
  onFieldRemark,
  onVerifyPassport,
}: {
  focusTarget?: WorkspaceTarget;
  prefersReducedMotion: boolean;
  selectedApplicant?: Applicant;
  submission: Submission;
  onFieldRemark: (row: ReviewFieldRow) => void;
  onVerifyPassport: () => void;
}) {
  const reviewSections = useMemo(
    () =>
      selectedApplicant
        ? [
            {
              id: "passport-review",
              isPassport: true,
              rows: buildAdminPassportReviewRows(selectedApplicant),
              title: "Паспортные данные",
            },
          ]
        : [],
    [selectedApplicant],
  );

  useEffect(() => {
    if (!focusTarget || focusTarget.tab !== "questionnaire" || !selectedApplicant) return;
    if (focusTarget.applicantId !== selectedApplicant.id) return;

    const timer = window.setTimeout(() => {
      const element = document.getElementById(targetElementId(focusTarget));
      if (!element) return;
      element.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "center",
      });
      element.classList.add("is-ai-focus");
      window.setTimeout(() => element.classList.remove("is-ai-focus"), 1800);
    }, 100);

    return () => window.clearTimeout(timer);
  }, [focusTarget, prefersReducedMotion, selectedApplicant]);

  const passportRows = reviewSections[0]?.rows ?? [];
  const reviewedCount = passportRows.filter(
    (row) =>
      Boolean(row.field?.adminReviewApprovedAtIso) &&
      Boolean(row.field?.adminReviewApprovedBy),
  ).length;
  const issueCount = selectedApplicant
    ? submission.issues.filter(
        (issue) =>
          issue.status === "open" && issue.target.applicantId === selectedApplicant.id,
      ).length
    : 0;
  const totalFields = passportRows.length;

  return (
    <div className="admin-review-questionnaire">
      <div className="admin-review-commandbar">
        <div>
          <span>Анкета</span>
          <strong>{selectedApplicant?.fullName ?? "Заявитель"}</strong>
        </div>
        <div className="admin-review-stats" aria-label="Статус проверки заявителя">
          <span className="is-ok">{reviewedCount} / {totalFields} ok</span>
          <span className={issueCount ? "is-warning" : ""}>
            <AlertCircle aria-hidden="true" size={13} />
            {issueCount} замечаний
          </span>
        </div>
      </div>

      <section className="admin-review-field-pane" aria-label="Поля анкеты">
        {reviewSections.map((section, index) => (
          <div className="admin-review-field-section" key={section.id}>
            <h3
              id={
                selectedApplicant
                  ? targetElementId({
                      applicantId: selectedApplicant.id,
                      section: section.title,
                      tab: "questionnaire",
                    })
                  : undefined
              }
            >
              <span className="admin-review-section-number">{index + 1}</span>
              {section.title}
              {section.isPassport ? (
                <button type="button" onClick={onVerifyPassport}>
                  Сверить с паспортом
                </button>
              ) : null}
            </h3>
            <div className="admin-review-field-table">
              {section.rows.map((row) => (
                <FieldReviewRow
                  domId={
                    selectedApplicant
                      ? targetElementId({
                          applicantId: selectedApplicant.id,
                          field: row.field?.id ?? row.label,
                          section: section.title,
                          tab: "questionnaire",
                        })
                      : undefined
                  }
                  focused={Boolean(
                    focusTarget &&
                      selectedApplicant &&
                      focusTarget.tab === "questionnaire" &&
                      focusTarget.applicantId === selectedApplicant.id &&
                      (focusTarget.field === row.field?.id ||
                        focusTarget.field === row.label ||
                        focusTarget.field === row.field?.label),
                  )}
                  key={`${section.id}-${row.field?.id ?? row.label}`}
                  row={row}
                  status={fieldStatus(submission, selectedApplicant?.id ?? "", row)}
                  onRemark={() => onFieldRemark(row)}
                  onVerifyPassport={row.hasDocument ? onVerifyPassport : undefined}
                />
              ))}
            </div>
          </div>
        ))}
      </section>
    </div>
  );
}

function MediaReviewPane({
  documentApplicant,
  file,
  issueGuardReason,
  reviewTarget,
  showActions = true,
  showChecklist = true,
  submission,
  targets = ["passport_scan"],
  onReject,
  onReviewTarget,
}: {
  documentApplicant?: Applicant;
  file?: SubmissionFile;
  issueGuardReason: string;
  reviewTarget: AdminReviewFileTarget;
  showActions?: boolean;
  showChecklist?: boolean;
  submission: Submission;
  targets?: AdminReviewFileTarget[];
  onReject: (fileType: AdminReviewFileTarget, reason?: string) => void;
  onReviewTarget: (target: AdminReviewFileTarget) => void;
}) {
  const targetCopy = mediaTargets.find((target) => target.id === reviewTarget) ?? mediaTargets[0];
  const previewApplicant =
    documentApplicant ??
    (file ? submission.applicants.find((applicant) => applicant.id === file.applicantId) : undefined);
  const previewRows = previewApplicant
    ? buildReviewSections(previewApplicant).flatMap((section) => section.rows)
    : [];
  const issue = file
    ? submission.issues.find(
        (item) =>
          item.status === "open" &&
          item.target.applicantId === file.applicantId &&
          item.target.fileType === file.type,
      )
    : undefined;

  return (
    <section
      id={
        file
          ? targetElementId({
              applicantId: file.applicantId,
              fileType: reviewTarget,
              tab: "files",
            })
          : undefined
      }
      className="admin-review-media-pane"
      aria-label="Проверка файлов"
    >
      {targets.length > 1 ? (
        <div className="admin-review-media-switcher" role="tablist" aria-label="Файл">
          {mediaTargets.filter((target) => targets.includes(target.id)).map((target) => (
          <button
            aria-selected={reviewTarget === target.id}
            className={reviewTarget === target.id ? "is-active" : ""}
            key={target.id}
            role="tab"
            type="button"
            onClick={() => onReviewTarget(target.id)}
          >
            {target.shortLabel}
          </button>
          ))}
        </div>
      ) : null}

      <div className="admin-review-preview">
        <div className="admin-review-preview-top">
          <span>
            {reviewTarget === "passport_scan" ? (
              <ScanText aria-hidden="true" size={17} />
            ) : (
              <ImageIcon aria-hidden="true" size={17} />
            )}
            {targetCopy.label}
          </span>
          <em className={fileStatusClass(file)}>{file ? fileStatusLabels[file.status] : "Нет файла"}</em>
        </div>
        <div className={`admin-review-document-frame is-${reviewTarget}`}>
          <div className="admin-review-document-sheet">
            {reviewTarget === "passport_scan" && previewApplicant ? (
              <PassportDocumentSheet
                applicant={previewApplicant}
                file={file}
                rows={previewRows}
              />
            ) : reviewTarget !== "passport_scan" && previewApplicant ? (
              <PhotoDocumentSheet
                applicant={previewApplicant}
                file={file}
                reviewTarget={reviewTarget}
              />
            ) : (
              <>
                <strong>{file?.originalFileName ?? file?.generatedFileName ?? fileLabel(reviewTarget)}</strong>
                <span>{file?.storagePath ?? "Приватный storage preview не доступен локально"}</span>
                <small>
                  {file?.mimeType ?? "media slot"} · {file?.sizeBytes ? formatBytes(file.sizeBytes) : "без размера"}
                </small>
              </>
            )}
          </div>
        </div>
        {issue ? (
          <p className="admin-review-media-issue">
            <AlertCircle aria-hidden="true" size={14} />
            {issue.reason}
          </p>
        ) : null}
      </div>

      {showChecklist ? (
        <div className="admin-review-checklist">
          {mediaChecklist(reviewTarget).map((item) => (
            <div key={item} className="admin-review-checkline">
              <CheckCircle2 aria-hidden="true" size={15} />
              <span>{item}</span>
            </div>
          ))}
        </div>
      ) : null}

      {showActions ? (
        <div className="admin-review-media-actions">
          <button
            disabled={Boolean(issueGuardReason)}
            type="button"
            onClick={() =>
              onReject(
                reviewTarget,
                reviewTarget === "passport_scan"
                  ? "Скан паспорта требует замены"
                  : `${fileLabel(reviewTarget)} не проходит визуальную проверку`,
              )
            }
          >
            <MessageSquarePlus aria-hidden="true" size={15} />
            Замечание
          </button>
        </div>
      ) : null}
      {issueGuardReason ? (
        <p className="admin-review-guard-note">{issueGuardReason}</p>
      ) : null}
    </section>
  );
}

function PassportDocumentSheet({
  applicant,
  file,
  rows,
}: {
  applicant: Applicant;
  file?: SubmissionFile;
  rows: ReviewFieldRow[];
}) {
  const nameParts = applicant.fullName.trim().split(/\\s+/).filter(Boolean);
  const givenName = nameParts[0] ?? applicant.fullName;
  const surname = nameParts.length > 1 ? nameParts.slice(1).join(" ") : applicant.fullName;
  const rowValue = (needles: string[], fallback = "Не заполнено") => {
    const found = rows.find((row) => {
      const label = `${row.label} ${row.field?.id ?? ""}`.toLowerCase();
      return needles.some((needle) => label.includes(needle));
    });
    return found?.value || fallback;
  };
  const passportNumber = rowValue(["номер", "number"], "—");
  const birthDate = rowValue(["дата рождения", "birth"], "—");
  const expiryDate = rowValue(["окончания", "expires", "expiry"], "—");
  const birthPlace = rowValue(["место рождения", "birthplace", "birth_place"], "—");
  const issueCountry = rowValue(["страна выдачи", "country"], "Russian Federation");
  const mrzName = `${surname.toUpperCase().replace(/\\s+/g, "<")}<<${givenName.toUpperCase()}`;
  const mrzNumber = passportNumber.replace(/\\s+/g, "");

  return (
    <div className="admin-review-passport-sheet">
      <div className="admin-review-passport-file">
        <FileText aria-hidden="true" size={13} />
        <span>{file?.originalFileName ?? file?.generatedFileName ?? fileLabel("passport_scan")}</span>
      </div>
      <div className="admin-review-passport-cover">
        <span>PASSPORT</span>
        <strong>{issueCountry}</strong>
        <em>RF</em>
      </div>
      <div className="admin-review-passport-body">
        <div className="admin-review-passport-photo" aria-hidden="true">
          <User size={42} />
        </div>
        <div className="admin-review-passport-data">
          <span>SURNAME</span>
          <strong>{surname}</strong>
          <span>GIVEN NAMES</span>
          <strong>{givenName}</strong>
          <div>
            <span>DOB</span>
            <strong>{birthDate}</strong>
          </div>
          <div>
            <span>EXPIRY</span>
            <strong>{expiryDate}</strong>
          </div>
          <div className="is-highlighted">
            <span>BIRTH PLACE</span>
            <strong>{birthPlace}</strong>
          </div>
        </div>
      </div>
      <div className="admin-review-passport-mrz">
        <span>{`P<RUS${mrzName}<<<<<<<<<<<<<<<<<<`}</span>
        <span>{`${mrzNumber || "000000000"}RUS${birthDate.replace(/\\D/g, "").slice(0, 6)}M${expiryDate.replace(/\\D/g, "").slice(0, 6)}7<<<<<<<<<<04`}</span>
      </div>
    </div>
  );
}

function PhotoDocumentSheet({
  applicant,
  file,
  reviewTarget,
}: {
  applicant: Applicant;
  file?: SubmissionFile;
  reviewTarget: Extract<AdminReviewFileTarget, "selfie" | "selfie_2">;
}) {
  const fileName = file?.originalFileName ?? file?.generatedFileName ?? fileLabel(reviewTarget);
  const fileMeta = `${file?.mimeType ?? "image slot"} · ${
    file?.sizeBytes ? formatBytes(file.sizeBytes) : "без размера"
  }`;
  const requirements =
    reviewTarget === "selfie"
      ? ["Лицо видно", "Свет ровный", "Совпадает с анкетой"]
      : ["Доп. фото видно", "Без бликов", "Подходит центру"];

  return (
    <div className="admin-review-photo-sheet">
      <div className="admin-review-passport-file">
        <ImageIcon aria-hidden="true" size={13} />
        <span>{fileName}</span>
      </div>
      <div className="admin-review-photo-frame">
        <div className="admin-review-photo-person" aria-hidden="true">
          <User size={54} />
        </div>
        <div className="admin-review-photo-meta">
          <span>{fileLabel(reviewTarget)}</span>
          <strong>{applicant.fullName}</strong>
          <small>{file?.storagePath ?? "Приватный storage preview не доступен локально"}</small>
        </div>
      </div>
      <div className="admin-review-photo-requirements" aria-label="Требования к фото">
        {requirements.map((item) => (
          <span key={item} className="admin-review-photo-chip">
            <CheckCircle2 aria-hidden="true" size={12} />
            {item}
          </span>
        ))}
      </div>
      <small className="admin-review-photo-file-meta">{fileMeta}</small>
    </div>
  );
}

function FieldReviewRow({
  domId,
  focused = false,
  row,
  status,
  onRemark,
  onVerifyPassport,
}: {
  domId?: string;
  focused?: boolean;
  row: ReviewFieldRow;
  status: FieldStatus;
  onRemark: () => void;
  onVerifyPassport?: () => void;
}) {
  return (
    <div
      id={domId}
      className={`admin-review-field-row is-${status} ${focused ? "is-ai-target" : ""}`}
    >
      <span aria-hidden="true" className="admin-review-row-dot" />
      <span className="admin-review-row-main">
        <span className="admin-review-row-kicker">
          <span className="admin-review-row-label" title={row.label}>
            {row.label}
          </span>
          <span className={`admin-review-row-status is-${status}`}>
            {status === "ok" ? "Проверено" : status === "error" ? "Есть замечание" : "Проверить"}
          </span>
        </span>
        <strong title={row.value || "Не заполнено"}>{row.value || "Не заполнено"}</strong>
      </span>
      <span className="admin-review-row-actions">
        {onVerifyPassport ? (
          <button
            aria-label={`Сверить с паспортом: ${row.label}`}
            className="admin-review-row-verify"
            type="button"
            onClick={onVerifyPassport}
          >
            <ScanText aria-hidden="true" size={13} />
            <span>Сверить с паспортом</span>
          </button>
        ) : null}
        <button
          aria-label={`Создать замечание: ${row.label}`}
          className="admin-review-row-remark"
          title="Добавить замечание"
          type="button"
          onClick={onRemark}
        >
          <MessageSquarePlus aria-hidden="true" size={14} />
          <span>Замечание</span>
        </button>
      </span>
    </div>
  );
}

function AdminRemarkForm({
  context,
  issueGuardReason,
  onClose,
  onDraftRemark,
  onSubmit,
  submission,
}: {
  context: RemarkContext;
  issueGuardReason: string;
  onClose: () => void;
  onDraftRemark?: (input: {
    context: RemarkContext;
    field: string;
    reason: string;
    targetType: string;
  }) => Promise<string | null>;
  onSubmit: (input: IssueInput) => void;
  submission: Submission;
}) {
  const defaultApplicant = submission.applicants[0]?.id ?? "";
  const [targetType, setTargetType] = useState<RemarkTargetType>(context.targetType);
  const [applicantId, setApplicantId] = useState(context.applicantId || defaultApplicant);
  const [field, setField] = useState(context.field ?? "");
  const [severity, setSeverity] = useState<"high" | "low">("high");
  const [reason, setReason] = useState(context.reason ?? "");
  const [comment, setComment] = useState(
    context.fileType
      ? "Загрузите новый файл и отправьте исправление на повторную проверку."
      : "Проверьте значение в анкете и отправьте исправление.",
  );
  const [internalComment, setInternalComment] = useState("");
  const [draftState, setDraftState] = useState<AdminAiRemarkDraftState>({
    status: "idle",
  });
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const onCloseRef = useRef(onClose);

  onCloseRef.current = onClose;

  useEffect(() => {
    const previouslyFocusedElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => {
      const dialog = dialogRef.current;
      const initialFocusTarget =
        dialog?.querySelector<HTMLTextAreaElement>(".admin-remark-reason textarea") ??
        dialog;
      initialFocusTarget?.focus({ preventScroll: true });
    });

    function handleKeyDown(event: KeyboardEvent) {
      const dialog = dialogRef.current;
      if (!dialog) return;

      if (event.key === "Escape") {
        event.preventDefault();
        event.stopPropagation();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab") return;

      const focusableElements = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(
        (element) =>
          element.getAttribute("aria-hidden") !== "true" &&
          !element.hasAttribute("hidden"),
      );
      const firstElement = focusableElements[0];
      const lastElement = focusableElements.at(-1);
      if (!firstElement || !lastElement) {
        event.preventDefault();
        dialog.focus({ preventScroll: true });
        return;
      }

      if (!dialog.contains(document.activeElement)) {
        event.preventDefault();
        (event.shiftKey ? lastElement : firstElement).focus({ preventScroll: true });
      } else if (event.shiftKey && document.activeElement === firstElement) {
        event.preventDefault();
        lastElement.focus({ preventScroll: true });
      } else if (!event.shiftKey && document.activeElement === lastElement) {
        event.preventDefault();
        firstElement.focus({ preventScroll: true });
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);

    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("keydown", handleKeyDown, true);
      window.requestAnimationFrame(() => {
        if (
          previouslyFocusedElement?.isConnected &&
          !previouslyFocusedElement.closest("[inert]")
        ) {
          previouslyFocusedElement.focus({ preventScroll: true });
        }
      });
    };
  }, []);

  useEffect(() => {
    setTargetType(context.targetType);
    setApplicantId(context.applicantId || defaultApplicant);
    setField(context.field ?? "");
    setReason(context.reason ?? "");
    setComment(
      context.fileType
        ? "Загрузите новый файл и отправьте исправление на повторную проверку."
        : "Проверьте значение в анкете и отправьте исправление.",
    );
    setInternalComment("");
    setDraftState({ status: "idle" });
  }, [context, defaultApplicant]);

  const allowedMediaTypes = requiredPassportReviewMediaTypesForApplicant(
    submission,
    applicantId,
  );
  const candidateFileType =
    remarkTargetFileType(targetType) ??
    (targetType === "checklistItem" || targetType === "document"
      ? context.fileType
      : undefined);
  const selectedFileType =
    candidateFileType && allowedMediaTypes.includes(candidateFileType)
      ? candidateFileType
      : undefined;
  const hasInvalidFileTarget = Boolean(candidateFileType && !selectedFileType);

  useEffect(() => {
    if (!hasInvalidFileTarget) return;
    setTargetType("passport_scan");
    setField("");
  }, [hasInvalidFileTarget]);

  const fieldReference =
    context.checklistItemLabel || field.trim() || context.targetLabel || "раздел";
  const canSubmit = Boolean(
    applicantId &&
      reason.trim() &&
      comment.trim() &&
      !issueGuardReason &&
      !hasInvalidFileTarget,
  );

  function submit() {
    if (!canSubmit) return;
    onSubmit({
      applicantId,
      comment: internalComment.trim()
        ? `${comment.trim()}\n\nВнутренне: ${internalComment.trim()}`
        : comment.trim(),
      field: field.trim() || context.checklistItemLabel || undefined,
      fileType: selectedFileType,
      reason: reason.trim(),
      section: selectedFileType ? "Файлы" : (context.sectionLabel ?? "Анкета"),
      severity: severity === "high" ? "blocker" : "warning",
      type: selectedFileType ? "file" : targetType === "section" ? "section" : "field",
    });
  }

  async function draftRemark() {
    if (!onDraftRemark) return;
    setDraftState({ status: "loading" });

    try {
      const draft = await onDraftRemark({
        context,
        field,
        reason,
        targetType,
      });

      if (!draft) {
        setDraftState({
          status: "unavailable",
          error: "Недоступно: локальный AI не настроен",
        });
        return;
      }

      setComment(draft);
      setDraftState({ status: "ready" });
    } catch {
      setDraftState({
        status: "failed",
        error: "AI-помощник не вернул безопасный черновик.",
      });
    }
  }

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="admin-remark-layer"
      exit={{ opacity: 0 }}
      initial={{ opacity: 0 }}
      transition={{ duration: 0.18 }}
    >
      <motion.div
        animate={{ opacity: 1, scale: 1, y: 0 }}
        aria-label="Новое замечание"
        aria-modal="true"
        className="admin-remark-form"
        exit={{ opacity: 0, scale: 0.98, y: 22 }}
        initial={{ opacity: 0, scale: 0.98, y: 22 }}
        ref={dialogRef}
        role="dialog"
        tabIndex={-1}
        transition={{ damping: 24, stiffness: 260, type: "spring" }}
      >
        <header>
          <div>
            <span>
              <MessageSquarePlus aria-hidden="true" size={20} />
            </span>
            <div>
              <h3>Добавить замечание</h3>
              <p>
                <strong>{submission.id}</strong>
                <i aria-hidden="true" />
                Новая проблема
              </p>
            </div>
          </div>
          <button aria-label="Закрыть форму замечания" type="button" onClick={onClose}>
            <X aria-hidden="true" size={16} />
          </button>
        </header>

        <div className="admin-remark-body">
          <div className="admin-remark-reference" aria-label="Идентификатор замечания">
            <div>
              <span>Поле</span>
              <strong>{fieldReference}</strong>
            </div>
            <div>
              <span>Заявитель</span>
              <strong>
                {submission.applicants.find((applicant) => applicant.id === applicantId)
                  ?.fullName ?? "Заявитель"}
              </strong>
            </div>
          </div>

          <section className="admin-remark-target-section">
            <label>
              <Target aria-hidden="true" size={14} />
              Где найдена ошибка?
            </label>
            <div className="admin-remark-targets">
              {[
                { id: "questionnaire" as const, icon: FileText, label: "Анкета" },
                { id: "passport_scan" as const, icon: ImageIcon, label: "Скан паспорта" },
                { id: "selfie" as const, icon: User, label: "Селфи 1" },
                { id: "selfie_2" as const, icon: User, label: "Селфи 2" },
              ]
                .filter(
                  (target) =>
                    target.id === "questionnaire" ||
                    allowedMediaTypes.includes(target.id),
                )
                .map((target) => {
                const TargetIcon = target.icon;
                const selected =
                  targetType === target.id ||
                  (targetType === "checklistItem" && context.fileType === target.id) ||
                  (targetType === "section" && target.id === "questionnaire");
                return (
                  <button
                    className={selected ? "is-active" : ""}
                    key={target.id}
                    type="button"
                    onClick={() => setTargetType(target.id)}
                  >
                    <TargetIcon aria-hidden="true" size={20} />
                    {target.label}
                  </button>
                );
                })}
            </div>
          </section>

          <div className="admin-remark-grid admin-remark-edit-controls">
            <label>
              <span>
                <User aria-hidden="true" size={14} />
                Заявитель
              </span>
              <select
                value={applicantId}
                onChange={(event) => setApplicantId(event.target.value)}
              >
                {submission.applicants.map((applicant) => (
                  <option key={applicant.id} value={applicant.id}>
                    {applicant.fullName} ({applicantRoleLabel(applicant.role)})
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>
                <Hash aria-hidden="true" size={14} />
                Привязка к полю / файлу
              </span>
              <input
                placeholder="Напр. Номер паспорта"
                type="text"
                value={selectedFileType ? fileLabel(selectedFileType) : field}
                onChange={(event) => setField(event.target.value)}
              />
            </label>
          </div>

          <section>
            <label>
              <ShieldAlert aria-hidden="true" size={14} />
              Критичность
            </label>
            <div className="admin-remark-severity">
              <button
                className={severity === "low" ? "is-active" : ""}
                type="button"
                onClick={() => setSeverity("low")}
              >
                Исправить
              </button>
              <button
                className={severity === "high" ? "is-active is-high" : ""}
                type="button"
                onClick={() => setSeverity("high")}
              >
                Критично
              </button>
            </div>
          </section>

          <label className="admin-remark-reason">
            <span>Описание ошибки (для агента)</span>
            <textarea
              placeholder="Что именно не так..."
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>

          <div className="admin-remark-ai-label">
            <span>Что нужно исправить?</span>
            <button
              aria-label="Сформулировать с AI"
              disabled={draftState.status === "loading"}
              type="button"
              onClick={draftRemark}
            >
              <Sparkles aria-hidden="true" size={14} />
              {draftState.status === "loading" ? "Черновик" : "Сформулировать с AI"}
            </button>
          </div>

          <label className="admin-remark-client-comment">
            <span>Текст для клиента</span>
            <textarea
              placeholder="Конкретное действие для агента"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
          </label>

          <div className="admin-remark-templates">
            <span>Быстрые шаблоны</span>
            {remarkTemplates.map((template) => (
              <button
                key={template}
                type="button"
                onClick={() => setComment(template)}
              >
                {template}
              </button>
            ))}
          </div>

          {draftState.status === "unavailable" || draftState.status === "failed" ? (
            <p className="admin-remark-ai-status" role="status">
              {draftState.error}. Текст можно заполнить вручную.
            </p>
          ) : null}

          {draftState.status === "ready" ? (
            <p className="admin-remark-ai-status" role="status">
              Черновик добавлен. Проверьте и отредактируйте перед созданием замечания.
            </p>
          ) : null}

          <label className="admin-remark-internal">
            <span>Внутренний комментарий (не виден агенту)</span>
            <textarea
              placeholder="Заметки для других ревьюеров..."
              value={internalComment}
              onChange={(event) => setInternalComment(event.target.value)}
            />
          </label>
        </div>

        <footer>
          <div>
            <span aria-hidden="true" />
            {issueGuardReason || "Статус: Открыто"}
          </div>
          <button type="button" onClick={onClose}>
            Отмена
          </button>
          <button disabled={!canSubmit} type="button" onClick={submit}>
            <Send aria-hidden="true" size={16} />
            Отправить замечание
          </button>
        </footer>
      </motion.div>
    </motion.div>
  );
}

function IssuesTab({
  addRemarkDisabled = false,
  emptyStateReady = false,
  emptyStateReason,
  identityFindings = [],
  onAcceptAiSuggestion,
  onAddRemark,
  onDismissAiSuggestion,
  onIdentityJump,
  onIdentityRemark,
  onRunAiReview,
  submission,
  onJump,
}: {
  addRemarkDisabled?: boolean;
  emptyStateReady?: boolean;
  emptyStateReason?: string;
  identityFindings?: IdentityConsistencyFinding[];
  onAcceptAiSuggestion: (suggestionId: string) => void;
  onAddRemark: () => void;
  onDismissAiSuggestion: (suggestionId: string) => void;
  onIdentityJump?: (finding: IdentityConsistencyFinding) => void;
  onIdentityRemark?: (finding: IdentityConsistencyFinding) => void;
  onRunAiReview: () => void;
  submission: Submission;
  onJump: (issue: Submission["issues"][number]) => void;
}) {
  const unresolvedIssueCount =
    submission.issues.filter((issue) => issue.status !== "closed_by_admin").length +
    identityFindings.length;
  const issuesSummary = (
    <header className="admin-review-issues-summary">
      <div>
        <h3>Список задач по замечаниям</h3>
        <p>Ошибки и расхождения, которые требуют решения по этому пакету.</p>
      </div>
      <span className={unresolvedIssueCount ? "is-warning" : "is-clear"}>
        {unresolvedIssueCount
          ? `Требуют решения: ${unresolvedIssueCount}`
          : "Требуют решения: 0"}
      </span>
    </header>
  );

  if (!submission.issues.length && !identityFindings.length) {
    return (
      <div className="admin-review-issues-list">
        {issuesSummary}
        <div className="admin-review-empty-card">
          {emptyStateReady ? (
            <ShieldCheck aria-hidden="true" size={18} />
          ) : (
            <AlertCircle aria-hidden="true" size={18} />
          )}
          <strong>{emptyStateReady ? "Замечаний пока нет" : "Открытых замечаний нет"}</strong>
          <span>
            {emptyStateReady
              ? "Паспорт, селфи и анкета не содержат открытых замечаний. Пакет можно принимать."
              : emptyStateReason ||
                "Пакет ещё не готов к принятию. Проверьте обязательные данные и файлы."}
          </span>
          <button disabled={addRemarkDisabled} type="button" onClick={onAddRemark}>
            <MessageSquarePlus aria-hidden="true" size={15} />
            Добавить замечание
          </button>
        </div>
        <div className="admin-review-issues-assist">
          <BbAiPanel
            role="admin"
            submission={submission}
            surface="review"
            onAccept={onAcceptAiSuggestion}
            onDismiss={onDismissAiSuggestion}
            onRun={onRunAiReview}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="admin-review-issues-list">
      {issuesSummary}

      <button
        className="admin-review-add-remark"
        disabled={addRemarkDisabled}
        type="button"
        onClick={onAddRemark}
      >
        <MessageSquarePlus aria-hidden="true" size={15} />
        Добавить замечание
      </button>

      {identityFindings.length ? (
        <section className="admin-review-ai-conflicts" aria-label="AI-конфликты личности">
          <header>
            <span>AI-конфликты личности</span>
            <em>{identityFindings.length}</em>
          </header>
          {identityFindings.map((finding) => (
            <article className={`is-${finding.severity}`} key={finding.id}>
              <header>
                <span>{finding.severity}</span>
                <em>{finding.applicantName}</em>
              </header>
              <strong>{finding.label}</strong>
              <p>{finding.message}</p>
              <small>{finding.evidence.map((item) => item.label).join(" · ")}</small>
              <footer>
                {onIdentityJump ? (
                  <button type="button" onClick={() => onIdentityJump(finding)}>
                    Открыть
                  </button>
                ) : null}
                {onIdentityRemark ? (
                  <button type="button" onClick={() => onIdentityRemark(finding)}>
                    Замечание
                  </button>
                ) : null}
              </footer>
            </article>
          ))}
        </section>
      ) : null}

      {submission.issues.map((issue) => (
        <article
          id={targetElementId({ issueId: issue.id, tab: "issues" })}
          className={`is-${issue.severity}`}
          key={issue.id}
        >
          <header>
            <span>{issue.id}</span>
            <em>{issueStatusLabel(issue.status)}</em>
          </header>
          <strong>{issue.reason}</strong>
          <p>{issue.comment}</p>
          <small>{issue.target.applicantName} · {issueTargetPath(issue)}</small>
          <button type="button" onClick={() => onJump(issue)}>
            Перейти к месту
          </button>
        </article>
      ))}

      <div className="admin-review-issues-assist">
        <BbAiPanel
          role="admin"
          submission={submission}
          surface="review"
          onAccept={onAcceptAiSuggestion}
          onDismiss={onDismissAiSuggestion}
          onRun={onRunAiReview}
        />
      </div>
    </div>
  );
}

function issueStatusLabel(status: Submission["issues"][number]["status"]) {
  if (status === "open") return "Открыто";
  if (status === "fixed_by_agent") return "Исправлено агентом";
  return "Закрыто администратором";
}

function buildReviewSections(applicant: Applicant): ReviewSection[] {
  const sections = applicant.sections.map((section) => {
    const isPassport = isPassportReviewSection(section);
    return {
      id: isPassport ? "passport-review" : section.id,
      isPassport,
      title: isPassport ? "Идентификация" : section.title,
      rows: section.fields.map((field) => ({
        field,
        hasDocument:
          isPassport ||
          field.id.toLowerCase().includes("passport") ||
          field.label.toLowerCase().includes("паспорт"),
        label: field.label,
        section: isPassport ? "Паспорт" : section.title,
        sectionId: section.id,
        value: field.value,
      })),
    };
  });
  const passportSections = sections.filter((section) => section.isPassport);
  const otherSections = sections.filter((section) => !section.isPassport);
  return [...passportSections, ...otherSections];
}

function buildAdminPassportReviewRows(applicant: Applicant): ReviewFieldRow[] {
  const fieldsById = new Map(
    applicant.sections.flatMap((section) =>
      section.fields.map(
        (field) => [field.id, { field, section }] as const,
      ),
    ),
  );

  return ADMIN_PASSPORT_REVIEW_FIELD_IDS.map((fieldId) => {
    const entry = fieldsById.get(fieldId);
    return {
      field: entry?.field,
      hasDocument: true,
      label: entry?.field.label ?? ADMIN_PASSPORT_REVIEW_FIELD_LABELS[fieldId],
      section: entry?.section.title ?? "Паспортные данные",
      sectionId: entry?.section.id ?? "passport-review",
      value: entry?.field.value ?? "",
    };
  });
}

function isPassportReviewSection(section: Applicant["sections"][number]) {
  const haystack = [
    section.id,
    section.title,
    ...section.fields.flatMap((field) => [field.id, field.label]),
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes("passport") || haystack.includes("паспорт");
}

function drawerTabToReviewTab(tab: DrawerTab): AdminReviewTab {
  if (tab === "overview") return "overview";
  if (tab === "applicants") return "applicants";
  if (tab === "issues") return "issues";
  if (tab === "files") return "files";
  if (tab === "history") return "history";
  return "questionnaire";
}

function reviewTabToDrawerTab(tab: AdminReviewTab): DrawerTab {
  if (tab === "passport" || tab === "selfie") return "files";
  return tab;
}

function fieldStatus(
  submission: Submission,
  applicantId: string,
  row: ReviewFieldRow,
): FieldStatus {
  const hasIssue = submission.issues.some(
    (issue) =>
      issue.status === "open" &&
      issue.target.applicantId === applicantId &&
      !issue.target.fileType &&
      (issue.target.field === row.label ||
        issue.target.field === row.field?.label ||
        issue.target.field === row.field?.id),
  );
  if (hasIssue) return "error";
  if (!row.value && row.field?.required !== false) return "error";
  if (row.field?.adminReviewApprovedAtIso && row.field.adminReviewApprovedBy)
    return "ok";
  return "pending";
}

function questionnaireFieldCount(submission: Submission) {
  return submission.applicants.length * ADMIN_PASSPORT_REVIEW_FIELD_IDS.length;
}

function issueTargetPath(issue: Submission["issues"][number]) {
  if (issue.target.fileType && issue.target.field) {
    return `${fileLabel(issue.target.fileType)} / ${issue.target.field}`;
  }
  if (issue.target.fileType) return fileLabel(issue.target.fileType);
  if (issue.target.field) return `Анкета · ${issue.target.field}`;
  return issue.target.section ? `Анкета · ${issue.target.section}` : "Анкета";
}

function findApplicantFile(
  submission: Submission,
  applicantId: string,
  fileType: AdminReviewFileTarget,
) {
  return submission.files.find(
    (file) => file.applicantId === applicantId && file.type === fileType,
  );
}

function remarkTargetFileType(targetType: RemarkTargetType) {
  if (targetType === "passport_scan" || targetType === "selfie" || targetType === "selfie_2") {
    return targetType;
  }
  return undefined;
}

function fileStatusClass(file: SubmissionFile | undefined) {
  if (!file) return "is-missing";
  if (file.status === "accepted") return "is-ok";
  if (file.status === "needs_replacement" || file.status === "missing")
    return "is-warning";
  return "is-pending";
}

function mediaChecklist(target: AdminReviewFileTarget) {
  if (target === "passport_scan") {
    return [
      "Номер и сроки паспорта видны",
      "MRZ/страница не обрезаны",
      "Поля справа сверяются с паспортом",
    ];
  }
  if (target === "selfie") {
    return ["Лицо заявителя видно", "Селфи соответствует заявителю", "Нет бликов и сильного размытия"];
  }
  return ["Дополнительное селфи читаемо", "Лицо совпадает с заявителем", "Файл соответствует требованиям центра"];
}

function passportChecklist(): ChecklistItem[] {
  return [
    {
      helper: "Имя, фамилия и дата рождения читаются и совпадают с анкетой.",
      id: "passport-identity",
      label: "Имя/фамилия/дата рождения совпадают",
      reason: "Паспортные личные данные не совпадают с анкетой",
    },
    {
      helper: "Номер паспорта виден, формат не повреждён, поле анкеты совпадает.",
      id: "passport-number",
      label: "Номер паспорта виден и совпадает",
      reason: "Номер паспорта не читается или не совпадает",
    },
    {
      helper: "Срок действия виден и не истёк на период поездки.",
      id: "passport-expiry",
      label: "Срок действия паспорта валиден",
      reason: "Срок действия паспорта требует проверки",
    },
    {
      helper: "MRZ, фото и края страницы не обрезаны.",
      id: "passport-readable",
      label: "Страница читаемая и не обрезана",
      reason: "Скан паспорта нечитаемый или обрезан",
    },
  ];
}

function selfieChecklist(): ChecklistItem[] {
  return [
    {
      helper: "Лицо полностью видно, нет сильного размытия или бликов.",
      id: "selfie-face-visible",
      label: "Лицо видно и фото читаемое",
      reason: "Селфи нечитаемое или лицо плохо видно",
    },
    {
      helper: "Заявитель на селфи соответствует выбранному профилю.",
      id: "selfie-matches-applicant",
      label: "Заявитель соответствует анкете",
      reason: "Селфи не соответствует выбранному заявителю",
    },
    {
      helper: "Файл доступен и подходит для визуальной проверки центра.",
      id: "selfie-requirements",
      label: "Файл соответствует требованиям",
      reason: "Селфи не соответствует требованиям",
    },
  ];
}

function applicantRoleLabel(role: Applicant["role"] | undefined) {
  if (role === "main") return "основной";
  if (role === "spouse") return "супруга";
  if (role === "child") return "ребенок";
  return "заявитель";
}

function historySourceLabel(source: Submission["history"][number]["source"]) {
  if (source === "admin") return "Админ";
  if (source === "agent") return "Агент";
  if (source === "bb") return "BB";
  return "Система";
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
