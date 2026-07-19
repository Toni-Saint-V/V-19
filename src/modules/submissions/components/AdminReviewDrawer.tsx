import {
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  AlertCircle,
  CheckCircle2,
  FileText,
  FileWarning,
  History,
  Hash,
  Image as ImageIcon,
  MessageSquarePlus,
  Maximize2,
  RotateCw,
  Send,
  ScanText,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  Target,
  User,
  Users,
  X,
  ZoomIn,
  ZoomOut,
  type LucideIcon,
} from "lucide-react";
import { invokeAiHelperEdge } from "../../../services/aiEdgeClient";
import { isPersistablePrivateFileAssetAtSubmissionTarget } from "../fileAsset";
import { createMediaSignedUrl, mediaStorageBucket } from "../mediaStorage";
import {
  adminAiActor,
  buildAdminIssueDraftContext,
  type AdminAiRemarkDraftState,
} from "../adminAiAssistance";
import {
  adminIssueGuard,
  fileStatusLabels,
  getPrimaryAction,
  openIssueCount,
  statusLabels,
  statusTone,
} from "../status";
import {
  fileLabel,
  targetElementId,
  targetForIssue,
  type WorkspaceTarget,
} from "../workspaceModel";
import { submissionPublicId } from "../submissionIdentity";
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
  drawerMotion,
  drawerPanelExit,
  drawerPanelInitial,
  drawerPanelTransition,
  drawerTabExit,
  drawerTabInitial,
  useDrawerDesktopQuery,
} from "../../../shared/ui/drawer/drawerMotion";

type AdminReviewFileTarget = "passport_scan" | "selfie" | "selfie_2";

type ProtectedMediaPreviewState =
  | { status: "loading" }
  | { status: "ready"; url: string }
  | { status: "unavailable" };

const unavailableProtectedMediaPreview: ProtectedMediaPreviewState = {
  status: "unavailable",
};

type AdminReviewTab =
  | "overview"
  | "applicants"
  | "files"
  | "passport"
  | "selfie"
  | "issues"
  | "history";

type RemarkTargetType =
  | "checklistItem"
  | "document"
  | "field"
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

const adminReferenceTabs: Array<{
  count?: (submission: Submission) => number;
  icon: LucideIcon;
  id: DrawerTab;
  label: string;
  warning?: boolean;
}> = [
  { icon: ScanText, id: "overview", label: "Сверка" },
  {
    count: (submission) => submission.applicants.length,
    icon: Users,
    id: "applicants",
    label: "Заявители",
  },
  { icon: ImageIcon, id: "files", label: "Файлы" },
  {
    count: (submission) => openIssueCount(submission),
    icon: FileWarning,
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
  "Значение в данных подачи не совпадает со сканом паспорта или селфи. Проверьте и исправьте поле.",
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
  isOpen = true,
  onClearFocusTarget,
  onAction,
  onAddIssue,
  onClose,
  onReviewFileAccept,
  onTab,
  submission,
}: {
  actionError?: string;
  activeTab: DrawerTab;
  focusTarget?: WorkspaceTarget;
  isOpen?: boolean;
  onClearFocusTarget?: () => void;
  onAction: (action: SubmissionAction) => void;
  onAddIssue: (input: IssueInput) => Promise<boolean>;
  onAcceptAiSuggestion: (suggestionId: string) => void;
  onClose: () => void;
  onDismissAiSuggestion: (suggestionId: string) => void;
  onReviewFileAccept: (input: {
    applicantId: string;
    fileType: AdminReviewFileTarget;
  }) => Promise<boolean>;
  onRunAiReview: () => void;
  onTab: (tab: DrawerTab) => void;
  onVerifyDocument?: (applicantId: string) => void;
  submission: Submission;
}) {
  const [selectedApplicantId, setSelectedApplicantId] = useState(
    submission.applicants[0]?.id ?? "",
  );
  const [activeReviewTab, setActiveReviewTab] = useState<AdminReviewTab>(() =>
    drawerTabToReviewTab(activeTab),
  );
  const [activeIdentityReference, setActiveIdentityReference] =
    useState<AdminReviewFileTarget>("passport_scan");
  const [remarkContext, setRemarkContext] = useState<RemarkContext | null>(null);
  const [passportFocusTarget, setPassportFocusTarget] = useState<
    Extract<WorkspaceTarget, { tab: "questionnaire" }> | undefined
  >(undefined);
  const drawerRef = useRef<HTMLElement | null>(null);
  const reviewTabsRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const remarkContextRef = useRef(remarkContext);
  const prefersReducedMotion = useReducedMotion();
  const isDesktopDrawer = useDrawerDesktopQuery();

  onCloseRef.current = onClose;
  remarkContextRef.current = remarkContext;

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
        activeTab === "files" &&
        (current === "passport" || current === "selfie" || current === "files")
      ) {
        return current;
      }
      return mappedTab;
    });
  }, [activeTab]);

  useEffect(() => {
    if (!isOpen) return;

    const previouslyFocusedElement =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => {
      drawerRef.current
        ?.querySelector<HTMLButtonElement>(".admin-review-close")
        ?.focus({ preventScroll: true });
    });

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        if (remarkContextRef.current) {
          setRemarkContext(null);
          return;
        }
        onCloseRef.current();
        return;
      }

      if (
        event.key !== "Tab" || remarkContextRef.current
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
  }, [isOpen, submission.id]);

  useEffect(() => {
    if (isOpen) return;
    setRemarkContext(null);
    setPassportFocusTarget(undefined);
  }, [isOpen]);

  const selectedApplicant =
    submission.applicants.find((applicant) => applicant.id === selectedApplicantId) ??
    submission.applicants[0];
  const primaryAction = getPrimaryAction(submission, "admin", "review");
  const adminNextAction = primaryAction.reason
    ? `${primaryAction.label}: ${primaryAction.reason}`
    : `Следующее действие: ${primaryAction.label}.`;
  const submissionTone = statusTone[submission.status];
  const issueGuard = adminIssueGuard(submission, "admin");
  const issueGuardReason = "reason" in issueGuard ? issueGuard.reason : "";
  const selectReviewTab = useCallback(
    (tab: AdminReviewTab) => {
      setActiveReviewTab(tab);
      onTab(reviewTabToDrawerTab(tab));
    },
    [onTab],
  );

  const selectApplicant = useCallback((applicantId: string) => {
    setSelectedApplicantId(applicantId);
    setActiveIdentityReference("passport_scan");
  }, []);

  function isReferenceTabSelected(tab: DrawerTab) {
    if (tab === "overview")
      return (
        activeReviewTab === "overview" ||
        activeReviewTab === "passport" ||
        activeReviewTab === "selfie"
      );
    if (tab === "applicants") return activeReviewTab === "applicants";
    if (tab === "issues") return activeReviewTab === "issues";
    if (tab === "history") return activeReviewTab === "history";
    if (tab === "files") return activeReviewTab === "files";
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

    selectReviewTab("passport");
  }

  function focusReferenceTab(tab: DrawerTab) {
    window.requestAnimationFrame(() => {
      const tabButton = reviewTabsRef.current?.querySelector<HTMLElement>(
        `#${adminReviewTabId(tab)}`,
      );
      if (typeof tabButton?.scrollIntoView === "function") {
        tabButton.scrollIntoView({
          behavior: prefersReducedMotion ? "auto" : "smooth",
          block: "nearest",
          inline: "nearest",
        });
      }
      tabButton?.focus({ preventScroll: true });
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
    tab: Extract<AdminReviewTab, "passport" | "selfie" | "files">,
  ) {
    setSelectedApplicantId(applicantId);
    if (tab === "passport") {
      setActiveIdentityReference("passport_scan");
    } else if (tab === "selfie") {
      setActiveIdentityReference("selfie");
    }
    selectReviewTab(tab);
  }

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
      const applicant = submission.applicants.find(
        (candidate) => candidate.id === target.applicantId,
      );
      const isPassportField = Boolean(
        applicant &&
          buildReviewSections(applicant)
            .find((section) => section.isPassport)
            ?.rows.some(
              (row) =>
                target.field === row.field?.id ||
                target.field === row.label ||
                target.field === row.field?.label ||
                target.section === row.section,
            ),
      );
      if (isPassportField) {
        setPassportFocusTarget(target);
        setActiveIdentityReference("passport_scan");
        selectReviewTab("passport");
      } else {
        selectReviewTab("issues");
      }
      return;
    }

    if (target.tab === "files" && isAdminReviewFileTarget(target.fileType)) {
      setActiveIdentityReference(target.fileType);
      selectReviewTab(target.fileType === "passport_scan" ? "passport" : "selfie");
      return;
    }

    if (target.tab === "files") {
      selectReviewTab("files");
      return;
    }

    selectReviewTab("issues");
  }, [selectReviewTab, submission.applicants]);

  useEffect(() => {
    if (!isOpen || !focusTarget) return;
    jumpToWorkspaceTarget(focusTarget);
    onClearFocusTarget?.();
  }, [focusTarget, isOpen, jumpToWorkspaceTarget, onClearFocusTarget, submission.id]);

  function openPassportFieldRemark(row: ReviewFieldRow) {
    if (!selectedApplicant) return;
    setRemarkContext({
      applicantId: selectedApplicant.id,
      field: row.label,
      reason: `${row.label}: требуется уточнение`,
      sectionId: row.sectionId,
      sectionLabel: row.section,
      targetLabel: row.label,
      targetType: "field",
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

  function openPassportRemark() {
    if (!selectedApplicant) return;
    setRemarkContext({
      applicantId: selectedApplicant.id,
      reason: "Требуется уточнение",
      sectionLabel: "Паспорт",
      targetLabel: "Паспорт",
      targetType: "section",
    });
  }

  function handleIssueJump(issue: Submission["issues"][number]) {
    jumpToWorkspaceTarget(targetForIssue(issue));
  }

  async function submitRemark(input: IssueInput) {
    const saved = await onAddIssue(input);
    if (saved) {
      setRemarkContext(null);
    }
    return saved;
  }

  const activeReferenceTab =
    adminReferenceTabs.find((tab) => isReferenceTabSelected(tab.id))?.id ??
    "overview";
  const isIdentityReview =
    activeReviewTab === "overview" ||
    activeReviewTab === "passport" ||
    activeReviewTab === "selfie";

  const primaryApplicant =
    submission.applicants.find((applicant) => applicant.role === "main") ??
    submission.applicants[0];
  const identityReferenceFiles = mediaTargets.map((target) => {
    const applicant =
      target.id === "passport_scan" ? selectedApplicant : primaryApplicant;
    return {
      applicant,
      file: applicant
        ? findApplicantFile(submission, applicant.id, target.id)
        : undefined,
      target,
    };
  });
  const hasPendingIdentityReferences = identityReferenceFiles.some(
    (item) => item.file?.status !== "accepted",
  );

  return (
    <AnimatePresence>
      {isOpen ? <motion.div
        className="admin-review-backdrop"
        key="admin-review-backdrop"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={prefersReducedMotion ? drawerMotion.reduced : drawerMotion.overlay}
        onClick={onClose}
      /> : null}

      {isOpen ? <motion.aside
        aria-labelledby="admin-review-heading"
        aria-modal="true"
        className="admin-review-drawer"
        data-admin-review-drawer-surface="workspace"
        data-review-mode={isIdentityReview ? "identity" : "standard"}
        id="admin-review-drawer"
        key="admin-review-drawer"
        ref={drawerRef}
        role="dialog"
        initial={drawerPanelInitial(isDesktopDrawer, Boolean(prefersReducedMotion))}
        animate={{ opacity: 1, x: 0, y: 0 }}
        exit={drawerPanelExit(isDesktopDrawer, Boolean(prefersReducedMotion))}
        transition={drawerPanelTransition(Boolean(prefersReducedMotion))}
      >
        <header className="admin-review-drawer-header">
          <div className="admin-review-titlebar">
            <div className="admin-review-titlecopy">
              <div className="admin-review-titleidentity">
                <p>
                  <strong>{submissionPublicId(submission)}</strong>
                  <span className="admin-review-title-separator" aria-hidden="true" />
                  <span className="admin-review-title-submission">{submission.title}</span>
                </p>
              </div>
              <p className="admin-review-meta">
                {submission.city}
                <span aria-hidden="true"> · </span>
                {openIssueCount(submission)} замечаний
              </p>
              <h2 id="admin-review-heading">
                <span className="admin-review-drawer-heading">Проверка пакета</span>
                <span
                  aria-label={`Статус заявки: ${statusLabels[submission.status]}`}
                  className={`admin-review-status-pill is-${submissionTone} is-${submission.status}`}
                >
                  <i
                    aria-hidden="true"
                    className={`admin-review-status-dot is-${submissionTone}`}
                  />
                  {statusLabels[submission.status]}
                </span>
              </h2>
            </div>
            <div className="admin-review-header-actions">
              <button
                aria-label="Закрыть проверку"
                className="admin-review-close"
                type="button"
                onClick={onClose}
              >
                <X aria-hidden="true" size={20} />
              </button>
            </div>
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
              const Icon = tab.icon;

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
                  <Icon aria-hidden="true" size={16} />
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
                      transition={drawerMotion.tabIndicator}
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
          {isIdentityReview ? (
            <ApplicantChips
              selectedApplicantId={selectedApplicantId}
              submission={submission}
              onApplicant={selectApplicant}
            />
          ) : null}

          <AnimatePresence mode="wait">
            <motion.div
              aria-labelledby={adminReviewTabId(activeReferenceTab)}
              animate={{ opacity: 1, y: 0 }}
              className="admin-review-tab-panel"
              exit={drawerTabExit(Boolean(prefersReducedMotion))}
              initial={drawerTabInitial(Boolean(prefersReducedMotion))}
              id={adminReviewPanelId(activeReferenceTab)}
              key={activeReviewTab}
              role="tabpanel"
              transition={prefersReducedMotion ? drawerMotion.reduced : drawerMotion.tab}
            >
              {isIdentityReview ? (
                <AdminIdentityReviewWorkspace
                  activeReference={activeIdentityReference}
                  focusTarget={passportFocusTarget}
                  issueGuardReason={issueGuardReason}
                  selectedApplicant={selectedApplicant}
                  submission={submission}
                  onAcceptFile={(applicantId, fileType) =>
                    onReviewFileAccept({ applicantId, fileType })
                  }
                  onFieldRemark={openPassportFieldRemark}
                  onFileRemark={(applicantId, fileType, reason) =>
                    openFileRemark(fileType, reason, undefined, applicantId)
                  }
                  onReference={setActiveIdentityReference}
                />
              ) : activeReviewTab === "applicants" ? (
                <ApplicantsReviewTab
                  selectedApplicantId={selectedApplicant?.id}
                  submission={submission}
                  onOpenSubscreen={openApplicantSubscreen}
                  onSelectApplicant={selectApplicant}
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
                    setActiveIdentityReference(file.type);
                    selectReviewTab(
                      file.type === "passport_scan" ? "passport" : "selfie",
                    );
                  }}
                />
              ) : activeReviewTab === "issues" ? (
                <IssuesTab
                  addRemarkDisabled={!selectedApplicant || Boolean(issueGuardReason)}
                  emptyStateReady={!primaryAction.disabled}
                  emptyStateReason={primaryAction.reason}
                  submission={submission}
                  onAddRemark={openPassportRemark}
                  onJump={handleIssueJump}
                />
              ) : activeReviewTab === "history" ? (
                <HistoryReviewTab submission={submission} />
              ) : null}
            </motion.div>
          </AnimatePresence>
        </div>

        <footer className="admin-review-footer">
          <p className="admin-review-primary-reason">
            <span className="admin-review-footer-dot" aria-hidden="true" />
            {isIdentityReview && hasPendingIdentityReferences
              ? "Подтвердите паспорт и два селфи по очереди. Одновременно доступна одна кнопка принятия."
              : adminNextAction}
          </p>
          <div className="admin-review-footer-actions">
            <button className="admin-review-secondary" type="button" onClick={onClose}>
              Отложить
            </button>
            {!isIdentityReview || !hasPendingIdentityReferences ? (
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
            ) : null}
          </div>
        </footer>

      </motion.aside> : null}

      {isOpen && remarkContext ? (
        <AdminRemarkForm
          context={remarkContext}
          issueGuardReason={issueGuardReason}
          submission={submission}
          onClose={() => setRemarkContext(null)}
          onDraftRemark={draftAdminRemark}
          onSubmit={submitRemark}
        />
      ) : null}

    </AnimatePresence>
  );
}

function AdminIdentityReviewWorkspace({
  activeReference,
  focusTarget,
  issueGuardReason,
  selectedApplicant,
  submission,
  onAcceptFile,
  onFieldRemark,
  onFileRemark,
  onReference,
}: {
  activeReference: AdminReviewFileTarget;
  focusTarget?: Extract<WorkspaceTarget, { tab: "questionnaire" }>;
  issueGuardReason: string;
  selectedApplicant?: Applicant;
  submission: Submission;
  onAcceptFile: (
    applicantId: string,
    fileType: AdminReviewFileTarget,
  ) => Promise<boolean>;
  onFieldRemark: (row: ReviewFieldRow) => void;
  onFileRemark: (
    applicantId: string,
    fileType: AdminReviewFileTarget,
    reason: string,
  ) => void;
  onReference: (target: AdminReviewFileTarget) => void;
}) {
  const referenceTabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const prefersReducedMotion = useReducedMotion();
  const primaryApplicant =
    submission.applicants.find((applicant) => applicant.role === "main") ??
    submission.applicants[0];
  const passportFile = selectedApplicant
    ? findApplicantFile(submission, selectedApplicant.id, "passport_scan")
    : undefined;
  const firstSelfie = primaryApplicant
    ? findApplicantFile(submission, primaryApplicant.id, "selfie")
    : undefined;
  const secondSelfie = primaryApplicant
    ? findApplicantFile(submission, primaryApplicant.id, "selfie_2")
    : undefined;
  const passportPreview = useProtectedMediaPreview({
    applicantId: selectedApplicant?.id,
    file: passportFile,
    fileType: "passport_scan",
    submissionId: submission.id,
  });
  const firstSelfiePreview = useProtectedMediaPreview({
    applicantId: primaryApplicant?.id,
    file: firstSelfie,
    fileType: "selfie",
    submissionId: submission.id,
  });
  const secondSelfiePreview = useProtectedMediaPreview({
    applicantId: primaryApplicant?.id,
    file: secondSelfie,
    fileType: "selfie_2",
    submissionId: submission.id,
  });
  const passportRows = selectedApplicant
    ? buildReviewSections(selectedApplicant).find((section) => section.isPassport)?.rows ?? []
    : [];
  const reviewedPassportFields = passportRows.filter(
    (row) => row.field?.reviewState === "confirmed" || row.field?.reviewConfirmedAtIso,
  ).length;

  const activeFile =
    activeReference === "passport_scan"
      ? passportFile
      : activeReference === "selfie"
        ? firstSelfie
        : secondSelfie;
  const activePreview =
    activeReference === "passport_scan"
      ? passportPreview
      : activeReference === "selfie"
        ? firstSelfiePreview
        : secondSelfiePreview;

  function selectReference(target: AdminReviewFileTarget, focusTab = false) {
    onReference(target);
    if (focusTab) {
      const nextIndex = mediaTargets.findIndex((item) => item.id === target);
      referenceTabRefs.current[nextIndex]?.focus();
    }
  }

  function fileForReference(target: AdminReviewFileTarget) {
    if (target === "passport_scan") return passportFile;
    if (target === "selfie") return firstSelfie;
    return secondSelfie;
  }

  async function acceptReference(target: AdminReviewFileTarget) {
    const applicant = target === "passport_scan" ? selectedApplicant : primaryApplicant;
    if (!applicant) return false;
    const accepted = await onAcceptFile(applicant.id, target);
    if (!accepted) return false;

    const currentIndex = mediaTargets.findIndex((item) => item.id === target);
    const followingTargets = [
      ...mediaTargets.slice(currentIndex + 1),
      ...mediaTargets.slice(0, currentIndex),
    ];
    const nextTarget = followingTargets.find(
      (item) => fileForReference(item.id)?.status !== "accepted",
    );
    if (nextTarget) onReference(nextTarget.id);
    return true;
  }

  function handleReferenceKeyDown(
    event: ReactKeyboardEvent<HTMLButtonElement>,
    currentIndex: number,
  ) {
    let nextIndex = currentIndex;

    if (event.key === "ArrowRight") {
      nextIndex = (currentIndex + 1) % mediaTargets.length;
    } else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + mediaTargets.length) % mediaTargets.length;
    } else if (event.key === "Home") {
      nextIndex = 0;
    } else if (event.key === "End") {
      nextIndex = mediaTargets.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    selectReference(mediaTargets[nextIndex].id, true);
  }

  if (!selectedApplicant || !primaryApplicant) {
    return (
      <div className="admin-review-empty-card" role="status">
        <Users aria-hidden="true" size={18} />
        <strong>Нет заявителя для сверки</strong>
        <span>Паспортные данные и селфи появятся после добавления заявителя.</span>
      </div>
    );
  }

  const activeApplicant =
    activeReference === "passport_scan" ? selectedApplicant : primaryApplicant;

  return (
    <section
      aria-label="Паспортные данные и два селфи"
      className="admin-review-identity-workspace"
      data-admin-identity-review
      id="admin-review-identity-workspace"
    >
      <div className="admin-review-identity-evidence">
        <header className="admin-review-identity-section-header">
          <div>
            <span>Защищённые оригиналы</span>
            <h3>Паспорт и два селфи</h3>
            <p>
              Паспорт: {selectedApplicant.fullName}. Селфи: {primaryApplicant.fullName}, основной
              заявитель.
            </p>
          </div>
          <strong>3 референса</strong>
        </header>

        <div className="admin-review-identity-reference-stack">
          <div
            aria-label="Референс для сверки"
            className="admin-review-identity-reference-tabs"
            role="tablist"
          >
            {mediaTargets.map((target, index) => {
              const selected = activeReference === target.id;

              return (
                <button
                  aria-controls={`admin-identity-reference-panel-${target.id}`}
                  aria-selected={selected}
                  className={selected ? "is-active" : ""}
                  id={`admin-identity-reference-tab-${target.id}`}
                  key={target.id}
                  ref={(node) => {
                    referenceTabRefs.current[index] = node;
                  }}
                  role="tab"
                  tabIndex={selected ? 0 : -1}
                  type="button"
                  onClick={() => selectReference(target.id)}
                  onKeyDown={(event) => handleReferenceKeyDown(event, index)}
                >
                  {target.shortLabel}
                </button>
              );
            })}
          </div>

          <AnimatePresence initial={false} mode="wait">
            <motion.div
              aria-labelledby={`admin-identity-reference-tab-${activeReference}`}
              animate={{ opacity: 1 }}
              className="admin-review-identity-reference-panel"
              data-reference-target={activeReference}
              exit={{ opacity: 0 }}
              id={`admin-identity-reference-panel-${activeReference}`}
              initial={{ opacity: prefersReducedMotion ? 1 : 0 }}
              key={`${selectedApplicant.id}-${activeReference}`}
              role="tabpanel"
              transition={
                prefersReducedMotion ? drawerMotion.reduced : drawerMotion.reference
              }
            >
              <MediaReviewPane
                documentApplicant={activeApplicant}
                file={activeFile}
                issueGuardReason={issueGuardReason}
                preview={activePreview.preview}
                reviewTarget={activeReference}
                showChecklist={false}
                submission={submission}
                onAccept={acceptReference}
                onPreviewError={activePreview.markUnavailable}
                onReject={(fileType, reason) =>
                  onFileRemark(
                    activeApplicant.id,
                    fileType,
                    reason ??
                      (fileType === "passport_scan"
                        ? "Скан паспорта требует замены"
                        : `${fileLabel(fileType)} не проходит визуальную проверку`),
                  )
                }
                onReviewTarget={selectReference}
              />
            </motion.div>
          </AnimatePresence>
        </div>
      </div>

      <aside className="admin-review-identity-fields" aria-label="Паспортные поля для сверки">
        <header className="admin-review-identity-section-header">
          <div>
            <span>Данные подачи</span>
            <h3>Только паспортные поля</h3>
            <p>Сравните значения с оригиналом слева. Остальные разделы анкеты не показаны.</p>
          </div>
          <strong>{reviewedPassportFields}/{passportRows.length}</strong>
        </header>

        <div
          aria-label="Сверка паспортных полей"
          className="admin-review-identity-field-list"
          role="table"
        >
          {passportRows.length ? (
            <>
              <div className="admin-review-identity-column-head" role="row">
                <span role="columnheader">Свойство</span>
                <span role="columnheader">Значение</span>
                <span role="columnheader">Действие</span>
              </div>
              {passportRows.map((row) => (
                <FieldReviewRow
                  focused={Boolean(
                    focusTarget &&
                      focusTarget.applicantId === selectedApplicant.id &&
                      (focusTarget.field === row.field?.id ||
                        focusTarget.field === row.label ||
                        focusTarget.field === row.field?.label ||
                        focusTarget.section === row.section),
                  )}
                  key={`identity-${row.field?.id ?? row.label}`}
                  row={row}
                  status={fieldStatus(submission, selectedApplicant.id, row)}
                  onRemark={() => onFieldRemark(row)}
                />
              ))}
            </>
          ) : (
            <div className="admin-review-empty-card" role="status">
              <FileWarning aria-hidden="true" size={18} />
              <strong>Паспортные поля не заполнены</strong>
              <span>Создайте точное замечание к отсутствующим данным.</span>
            </div>
          )}
        </div>
      </aside>
    </section>
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
    tab: Extract<AdminReviewTab, "passport" | "selfie" | "files">,
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
        const primaryApplicant =
          submission.applicants.find((candidate) => candidate.role === "main") ??
          submission.applicants[0];
        const isPrimaryApplicant = applicant.id === primaryApplicant?.id;
        const applicantFiles = submission.files.filter(
          (file) => file.applicantId === applicant.id,
        );
        const acceptedSelfies = (["selfie", "selfie_2"] as const).filter((fileType) =>
          applicantFiles.some((file) => file.type === fileType && file.status === "accepted"),
        ).length;
        const applicantIssues = submission.issues.filter(
          (issue) => issue.status === "open" && issue.target.applicantId === applicant.id,
        ).length;
        const passportRows =
          buildReviewSections(applicant).find((section) => section.isPassport)?.rows ?? [];
        const checkedFields = passportRows.filter(
          (row) => row.field?.reviewState === "confirmed" || row.field?.reviewConfirmedAtIso,
        ).length;
        const selected = selectedApplicantId === applicant.id;

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
                <dt>Паспорт</dt>
                <dd>{checkedFields}/{passportRows.length}</dd>
              </div>
              <div>
                <dt>Селфи</dt>
                <dd>{isPrimaryApplicant ? `${acceptedSelfies}/2` : "Не нужны"}</dd>
              </div>
              <div>
                <dt>Замечания</dt>
                <dd>{applicantIssues}</dd>
              </div>
            </dl>
            <footer>
              <button type="button" onClick={() => onOpenSubscreen(applicant.id, "passport")}>
                Открыть сверку
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
  const primaryApplicant =
    submission.applicants.find((applicant) => applicant.role === "main") ??
    submission.applicants[0];
  const reviewFiles = submission.files.filter(
    (file): file is SubmissionFile & { type: AdminReviewFileTarget } =>
      isAdminReviewFileTarget(file.type) &&
      (file.type === "passport_scan" || file.applicantId === primaryApplicant?.id),
  );
  const acceptedCount = reviewFiles.filter((file) => file.status === "accepted").length;
  const expectedReviewFileCount = submission.applicants.length
    ? submission.applicants.length + 2
    : 0;

  return (
    <div className="admin-review-files-tab v19-drawer-files">
      <div className="v19-drawer-files-head">
        <h3 className="v19-drawer-files-title">Файлы подачи</h3>
        <span className="v19-drawer-files-count">
          {expectedReviewFileCount > 0 ? `${acceptedCount}/${expectedReviewFileCount}` : "—"}
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

          const applicantAcceptedCount = applicantFiles.filter(
            (file) => file.status === "accepted",
          ).length;
          const applicantExpectedFileCount =
            applicant.id === primaryApplicant?.id ? 3 : 1;

          return (
            <section className="v19-drawer-file-section" key={applicant.id}>
              <div className="v19-drawer-file-section-head">
                <span className="v19-drawer-file-section-copy">
                  <span className="v19-drawer-file-section-title">
                    {applicant.fullName}
                  </span>
                  <span className="v19-drawer-file-section-meta">
                    {applicantAcceptedCount}/{applicantExpectedFileCount} файлов принято
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
  const passportRows = selectedApplicant
    ? buildReviewSections(selectedApplicant).find((section) => section.isPassport)?.rows ?? []
    : [];
  const reviewedFields = passportRows.filter(
    (row) => row.field?.reviewState === "confirmed" || row.field?.reviewConfirmedAtIso,
  ).length;
  const remainingFields = Math.max(passportRows.length - reviewedFields, 0);
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
          {reviewedFields} полей паспорта проверено
        </span>
        <span>
          <i aria-hidden="true" />
          {remainingFields} полей паспорта осталось
        </span>
        <span className={openIssues ? "is-warning" : ""}>
          <AlertCircle aria-hidden="true" size={16} />
          {openIssues} замечаний
        </span>
      </div>
    </div>
  );
}

function useProtectedMediaPreview({
  applicantId,
  file,
  fileType,
  submissionId,
}: {
  applicantId?: string;
  file?: SubmissionFile;
  fileType: AdminReviewFileTarget;
  submissionId: string;
}) {
  const protectedFile =
    file &&
    applicantId &&
    isPersistablePrivateFileAssetAtSubmissionTarget(file, {
      applicantId,
      fileType,
      submissionId,
    })
      ? file
      : undefined;
  const protectedStoragePath = protectedFile?.storagePath;
  const previewKey = protectedFile
    ? [
        submissionId,
        applicantId,
        fileType,
        protectedFile.id,
        protectedStoragePath,
      ].join("\u0000")
    : "";
  const [previewState, setPreviewState] = useState<{
    key: string;
    preview: ProtectedMediaPreviewState;
  }>({
    key: "",
    preview: unavailableProtectedMediaPreview,
  });
  const preview =
    previewState.key === previewKey
      ? previewState.preview
      : unavailableProtectedMediaPreview;

  useEffect(() => {
    let cancelled = false;

    if (!protectedStoragePath) {
      setPreviewState({
        key: previewKey,
        preview: unavailableProtectedMediaPreview,
      });
      return () => {
        cancelled = true;
      };
    }

    setPreviewState({
      key: previewKey,
      preview: { status: "loading" },
    });
    void createMediaSignedUrl({
      bucket: mediaStorageBucket,
      path: protectedStoragePath,
    })
      .then((url) => {
        if (cancelled) return;
        setPreviewState({
          key: previewKey,
          preview: url
            ? { status: "ready", url }
            : unavailableProtectedMediaPreview,
        });
      })
      .catch(() => {
        if (!cancelled) {
          setPreviewState({
            key: previewKey,
            preview: unavailableProtectedMediaPreview,
          });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [previewKey, protectedStoragePath]);

  return {
    preview,
    markUnavailable: () =>
      setPreviewState({
        key: previewKey,
        preview: unavailableProtectedMediaPreview,
      }),
  };
}

function isPdfReviewFile(file?: SubmissionFile) {
  const fileName = file?.originalFileName ?? file?.generatedFileName ?? "";
  return (
    file?.mimeType === "application/pdf" ||
    fileName.toLocaleLowerCase().endsWith(".pdf")
  );
}

function needsExternalMediaViewer(file?: SubmissionFile) {
  const fileName = file?.originalFileName ?? file?.generatedFileName ?? "";
  const normalizedName = fileName.toLocaleLowerCase();
  return (
    file?.mimeType === "image/heic" ||
    file?.mimeType === "image/heif" ||
    normalizedName.endsWith(".heic") ||
    normalizedName.endsWith(".heif")
  );
}

function ProtectedMediaPreview({
  applicantName,
  file,
  preview,
  reviewTarget,
  onPreviewError,
}: {
  applicantName?: string;
  file?: SubmissionFile;
  preview: ProtectedMediaPreviewState;
  reviewTarget: AdminReviewFileTarget;
  onPreviewError: () => void;
}) {
  const readyUrl = preview.status === "ready" ? preview.url : undefined;
  const label = fileLabel(reviewTarget);
  const alt = `${label}: ${applicantName ?? "заявитель"}`;

  if (preview.status === "loading") {
    return (
      <div
        className="admin-review-protected-placeholder grid min-h-72 place-items-center gap-3 p-6 text-center"
        role="status"
      >
        <strong>Загружаем защищённый оригинал</strong>
        <span>Получаем временный доступ к файлу подачи.</span>
      </div>
    );
  }

  if (!readyUrl) {
    return (
      <div
        className="admin-review-protected-placeholder grid min-h-72 place-items-center gap-3 p-6 text-center"
        data-testid={`protected-media-unavailable-${reviewTarget}`}
      >
        <AlertCircle aria-hidden="true" size={24} />
        <strong>{file ? "Защищённый оригинал недоступен" : "Файл не загружен"}</strong>
        <span>Принятие файла заблокировано. Создайте точное замечание.</span>
      </div>
    );
  }

  if (isPdfReviewFile(file)) {
    return (
      <object
        aria-label={alt}
        className="block h-96 w-full"
        data={readyUrl}
        data-testid={`protected-media-preview-${reviewTarget}`}
        type="application/pdf"
      >
        <a href={readyUrl} rel="noreferrer" target="_blank">
          Открыть защищённый оригинал
        </a>
      </object>
    );
  }

  if (needsExternalMediaViewer(file)) {
    return (
      <div className="admin-review-protected-placeholder grid min-h-72 place-items-center gap-3 p-6 text-center">
        <strong>Оригинал готов к просмотру</strong>
        <span>Этот формат открывается во внешнем просмотрщике.</span>
        <a
          data-testid={`protected-media-preview-${reviewTarget}`}
          href={readyUrl}
          rel="noreferrer"
          target="_blank"
        >
          Открыть оригинал
        </a>
      </div>
    );
  }

  return (
    <img
      alt={alt}
      className="block max-h-96 w-full object-contain"
      data-testid={`protected-media-preview-${reviewTarget}`}
      onError={onPreviewError}
      src={readyUrl}
    />
  );
}

function MediaReviewPane({
  documentApplicant,
  file,
  issueGuardReason,
  preview,
  reviewTarget,
  showActions = true,
  showChecklist = true,
  submission,
  targets = ["passport_scan"],
  onAccept,
  onPreviewError,
  onReject,
  onReviewTarget,
}: {
  documentApplicant?: Applicant;
  file?: SubmissionFile;
  issueGuardReason: string;
  preview: ProtectedMediaPreviewState;
  reviewTarget: AdminReviewFileTarget;
  showActions?: boolean;
  showChecklist?: boolean;
  submission: Submission;
  targets?: AdminReviewFileTarget[];
  onAccept: (fileType: AdminReviewFileTarget) => Promise<boolean>;
  onPreviewError: () => void;
  onReject: (fileType: AdminReviewFileTarget, reason?: string) => void;
  onReviewTarget: (target: AdminReviewFileTarget) => void;
}) {
  const [acceptPending, setAcceptPending] = useState(false);
  const [zoom, setZoom] = useState(100);
  const [rotation, setRotation] = useState(0);
  const [fitPreview, setFitPreview] = useState(true);
  const targetCopy = mediaTargets.find((target) => target.id === reviewTarget) ?? mediaTargets[0];
  const canAccept = Boolean(
    file &&
      file.status !== "accepted" &&
      file.status !== "missing" &&
      file.status !== "needs_replacement" &&
      preview.status === "ready",
  );
  const previewApplicant =
    documentApplicant ??
    (file ? submission.applicants.find((applicant) => applicant.id === file.applicantId) : undefined);
  const issue = file
    ? submission.issues.find(
        (item) =>
          item.status === "open" &&
          item.target.applicantId === file.applicantId &&
          item.target.fileType === file.type,
      )
    : undefined;

  async function acceptCurrentReference() {
    if (!canAccept || acceptPending) return;
    setAcceptPending(true);
    try {
      await onAccept(reviewTarget);
    } finally {
      setAcceptPending(false);
    }
  }

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
            {previewApplicant ? (
              <small className="admin-review-preview-owner">
                · {previewApplicant.fullName}
              </small>
            ) : null}
          </span>
          <em className={fileStatusClass(file)}>{file ? fileStatusLabels[file.status] : "Нет файла"}</em>
        </div>
        <div className="admin-review-preview-toolbar" aria-label="Управление предпросмотром">
          <button
            aria-label="Уменьшить масштаб"
            disabled={zoom <= 50}
            type="button"
            onClick={() => {
              setFitPreview(false);
              setZoom((value) => Math.max(50, value - 10));
            }}
          >
            <ZoomOut aria-hidden="true" size={16} />
          </button>
          <span>{fitPreview ? "По размеру" : `${zoom}%`}</span>
          <button
            aria-label="Увеличить масштаб"
            disabled={zoom >= 200}
            type="button"
            onClick={() => {
              setFitPreview(false);
              setZoom((value) => Math.min(200, value + 10));
            }}
          >
            <ZoomIn aria-hidden="true" size={16} />
          </button>
          <i aria-hidden="true" />
          <button
            aria-label="Повернуть документ"
            type="button"
            onClick={() => setRotation((value) => (value + 90) % 360)}
          >
            <RotateCw aria-hidden="true" size={16} />
          </button>
          <button
            aria-label="Вписать документ"
            aria-pressed={fitPreview}
            type="button"
            onClick={() => {
              setFitPreview(true);
              setZoom(100);
            }}
          >
            <Maximize2 aria-hidden="true" size={16} />
          </button>
        </div>
        <div
          className={`admin-review-document-frame admin-review-identity-document-frame is-${reviewTarget}`}
        >
          <div
            className={`admin-review-document-sheet ${fitPreview ? "is-fit" : ""}`}
            style={{
              transform: `rotate(${rotation}deg) scale(${fitPreview ? 1 : zoom / 100})`,
            }}
          >
            <ProtectedMediaPreview
              applicantName={previewApplicant?.fullName}
              file={file}
              preview={preview}
              reviewTarget={reviewTarget}
              onPreviewError={onPreviewError}
            />
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
            disabled={!canAccept || acceptPending}
            type="button"
            onClick={() => void acceptCurrentReference()}
          >
            <CheckCircle2 aria-hidden="true" size={15} />
            {file?.status === "accepted"
              ? "Принято"
              : acceptPending
                ? "Подтверждаем…"
                : "Принять"}
          </button>
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

function FieldReviewRow({
  domId,
  focused = false,
  row,
  status,
  onRemark,
}: {
  domId?: string;
  focused?: boolean;
  row: ReviewFieldRow;
  status: FieldStatus;
  onRemark: () => void;
}) {
  return (
    <div
      id={domId}
      className={`admin-review-identity-field-row is-${status} ${focused ? "is-ai-target" : ""}`}
      role="row"
    >
      <span className="admin-review-identity-field-property" role="cell">
        <span className="admin-review-identity-field-label" title={row.label}>
          {row.label}
        </span>
      </span>
      <span className="admin-review-identity-field-value" role="cell">
        <strong title={row.value || "Не заполнено"}>{row.value || "Не заполнено"}</strong>
        <span className={`admin-review-identity-field-status is-${status}`}>
          {status === "ok" ? "Проверено" : status === "error" ? "Есть замечание" : "Проверить"}
        </span>
      </span>
      <span className="admin-review-identity-field-action" role="cell">
        <button
          aria-label={`Добавить замечание к полю ${row.label}`}
          className="admin-review-identity-remark"
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
  onSubmit: (input: IssueInput) => Promise<boolean>;
  submission: Submission;
}) {
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const defaultApplicant = submission.applicants[0]?.id ?? "";
  const [targetType, setTargetType] = useState<RemarkTargetType>(context.targetType);
  const [applicantId, setApplicantId] = useState(context.applicantId || defaultApplicant);
  const [field, setField] = useState(context.field ?? "");
  const [severity, setSeverity] = useState<"high" | "low">("high");
  const [reason, setReason] = useState(context.reason ?? "");
  const [comment, setComment] = useState(
    context.fileType
      ? "Загрузите новый файл и отправьте исправление на повторную проверку."
      : "Проверьте значение в данных подачи и отправьте исправление.",
  );
  const [internalComment, setInternalComment] = useState("");
  const [draftState, setDraftState] = useState<AdminAiRemarkDraftState>({
    status: "idle",
  });
  const [submitPending, setSubmitPending] = useState(false);
  const [submitError, setSubmitError] = useState("");

  useEffect(() => {
    openerRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const focusFrame = window.requestAnimationFrame(() => {
      dialogRef.current
        ?.querySelector<HTMLButtonElement>('[aria-label="Закрыть форму замечания"]')
        ?.focus({ preventScroll: true });
    });

    return () => {
      window.cancelAnimationFrame(focusFrame);
      const opener = openerRef.current;
      if (opener && document.contains(opener)) {
        opener.focus({ preventScroll: true });
      }
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
        : "Проверьте значение в данных подачи и отправьте исправление.",
    );
    setInternalComment("");
    setDraftState({ status: "idle" });
    setSubmitPending(false);
    setSubmitError("");
  }, [context, defaultApplicant]);

  const selectedFileType = remarkTargetFileType(targetType) ?? context.fileType;
  const fieldReference =
    context.checklistItemLabel || field.trim() || context.targetLabel || "раздел";
  const canSubmit = Boolean(
    applicantId &&
      reason.trim() &&
      comment.trim() &&
      !issueGuardReason &&
      !submitPending,
  );
  const targetOptions: Array<{
    icon: LucideIcon;
    id: RemarkTargetType;
    label: string;
  }> = [
    ...(context.targetType === "field" || targetType === "field"
      ? [{ id: "field" as const, icon: FileText, label: "Поле паспорта" }]
      : []),
    ...(context.targetType === "section" || targetType === "section"
      ? [{ id: "section" as const, icon: ScanText, label: "Раздел паспорта" }]
      : []),
    { id: "passport_scan", icon: ImageIcon, label: "Скан паспорта" },
    { id: "selfie", icon: User, label: "Селфи 1" },
    { id: "selfie_2", icon: User, label: "Селфи 2" },
  ];

  function handleDialogKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      onClose();
      return;
    }

    if (event.key !== "Tab") return;
    const focusableElements = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
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
    } else if (!dialogRef.current?.contains(document.activeElement)) {
      event.preventDefault();
      firstElement.focus({ preventScroll: true });
    }
  }

  async function submit() {
    if (!canSubmit) return;
    setSubmitPending(true);
    setSubmitError("");
    let saved = false;
    try {
      saved = await onSubmit({
        applicantId,
        comment: internalComment.trim()
          ? `${comment.trim()}\n\nВнутренне: ${internalComment.trim()}`
          : comment.trim(),
        field: field.trim() || context.checklistItemLabel || undefined,
        fileType: selectedFileType,
        reason: reason.trim(),
        section: selectedFileType ? "Файлы" : (context.sectionLabel ?? "Паспорт"),
        severity: severity === "high" ? "blocker" : "warning",
        type: selectedFileType
          ? "file"
          : targetType === "section"
            ? "section"
            : "field",
      });
    } catch {
      saved = false;
    }
    if (!saved) {
      setSubmitError("Замечание не сохранено. Проверьте соединение и повторите попытку.");
      setSubmitPending(false);
    }
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
        role="dialog"
        ref={dialogRef}
        onKeyDown={handleDialogKeyDown}
        transition={{ damping: 24, stiffness: 260, type: "spring" }}
      >
        <header>
          <div role={submitError ? "alert" : undefined}>
            <span>
              <MessageSquarePlus aria-hidden="true" size={20} />
            </span>
            <div>
              <h3>Добавить замечание</h3>
              <p>
                <strong>{submissionPublicId(submission)}</strong>
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
              {targetOptions.map((target) => {
                const TargetIcon = target.icon;
                const selected =
                  targetType === target.id ||
                  (targetType === "checklistItem" && context.fileType === target.id);
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
              <select value={applicantId} onChange={(event) => setApplicantId(event.target.value)}>
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
            {submitError || issueGuardReason || "Статус: Открыто"}
          </div>
          <button disabled={submitPending} type="button" onClick={onClose}>
            Отмена
          </button>
          <button disabled={!canSubmit} type="button" onClick={submit}>
            <Send aria-hidden="true" size={16} />
            {submitPending ? "Сохраняем…" : "Отправить замечание"}
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
  onAddRemark,
  submission,
  onJump,
}: {
  addRemarkDisabled?: boolean;
  emptyStateReady?: boolean;
  emptyStateReason?: string;
  onAddRemark: () => void;
  submission: Submission;
  onJump: (issue: Submission["issues"][number]) => void;
}) {
  const unresolvedIssueCount = submission.issues.filter(
    (issue) => issue.status !== "closed_by_admin",
  ).length;
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

  if (!submission.issues.length) {
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
              ? "Паспорт и все селфи не содержат открытых замечаний. Пакет можно принимать."
              : emptyStateReason ||
                "Пакет ещё не готов к принятию. Проверьте обязательные данные и файлы."}
          </span>
          <button disabled={addRemarkDisabled} type="button" onClick={onAddRemark}>
            <MessageSquarePlus aria-hidden="true" size={15} />
            Добавить замечание
          </button>
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
  return "overview";
}

function reviewTabToDrawerTab(tab: AdminReviewTab): DrawerTab {
  if (tab === "passport" || tab === "selfie") return "overview";
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
        issue.target.section === row.section),
  );
  if (hasIssue) return "error";
  if (!row.value && row.field?.required !== false) return "error";
  if (row.field?.reviewState === "confirmed" || row.field?.reviewConfirmedAtIso)
    return "ok";
  return "pending";
}

function issueTargetPath(issue: Submission["issues"][number]) {
  if (issue.target.fileType && issue.target.field) {
    return `${fileLabel(issue.target.fileType)} / ${issue.target.field}`;
  }
  if (issue.target.fileType) return fileLabel(issue.target.fileType);
  if (issue.target.field) return `Паспорт · ${issue.target.field}`;
  return issue.target.section ? `Паспорт · ${issue.target.section}` : "Паспорт";
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
