import { type ReactNode, useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  AlertCircle,
  ArrowRight,
  CheckCircle2,
  FileText,
  FileWarning,
  Hash,
  Image as ImageIcon,
  MessageSquarePlus,
  Save,
  ScanText,
  ShieldAlert,
  ShieldCheck,
  Target,
  User,
  X,
  type LucideIcon,
} from "lucide-react";
import { applicantCountLabel } from "../selectors";
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
  QuestionnaireSectionTabs,
  QuestionnaireWorkspaceShell,
} from "./QuestionnaireWorkspacePrimitives";
import {
  buildIdentityConsistencyReport,
  type IdentityConsistencyFinding,
} from "../identityConsistency";
import {
  IdentityConsistencyPanel,
  IdentityConsistencyStatusStrip,
} from "./IdentityConsistencyPanel";

type AdminReviewFileTarget = "passport_scan" | "selfie" | "selfie_2";

type AdminReviewTab = "passport" | "selfie" | "questionnaire" | "issues";

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

const adminReviewTabs: Array<{
  count?: (submission: Submission) => number;
  icon: LucideIcon;
  id: AdminReviewTab;
  label: string;
  warning?: boolean;
}> = [
  { icon: ScanText, id: "passport", label: "Паспорт" },
  { icon: ImageIcon, id: "selfie", label: "Селфи" },
  {
    count: (submission) => questionnaireFieldCount(submission),
    icon: FileText,
    id: "questionnaire",
    label: "Анкета",
  },
  {
    count: (submission) => openIssueCount(submission),
    icon: FileWarning,
    id: "issues",
    label: "Замечания",
    warning: true,
  },
];

const mediaTargets: Array<{
  id: AdminReviewFileTarget;
  label: string;
  shortLabel: string;
}> = [
  { id: "passport_scan", label: "Скан паспорта", shortLabel: "Паспорт" },
  { id: "selfie", label: "Селфи 1", shortLabel: "Селфи 1" },
  { id: "selfie_2", label: "Селфи N2", shortLabel: "Селфи 2" },
];

const localAgentNames: Record<string, string> = {
  "local-agent-alex": "Алексей Сидоров",
  "local-agent-tony": "Татьяна Николаева",
};

export function AdminReviewDrawer({
  actionError = "",
  activeTab,
  focusTarget,
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
  onClearFocusTarget?: () => void;
  onAction: (action: SubmissionAction) => void;
  onAddIssue: (input: IssueInput) => void;
  onClose: () => void;
  onReviewFileAccept: (input: {
    applicantId: string;
    fileType: AdminReviewFileTarget;
  }) => void;
  onTab: (tab: DrawerTab) => void;
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
  const [questionnaireFocusTarget, setQuestionnaireFocusTarget] =
    useState<WorkspaceTarget | undefined>(undefined);

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
      return mappedTab;
    });
  }, [activeTab]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [onClose]);

  const selectedApplicant =
    submission.applicants.find((applicant) => applicant.id === selectedApplicantId) ??
    submission.applicants[0];
  const primaryAction = getPrimaryAction(submission, "admin", "review");
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
      onTab(tab === "issues" ? "issues" : "questionnaire");
      if (tab === "passport") setReviewTarget("passport_scan");
      if (tab === "selfie" && reviewTarget === "passport_scan") {
        setReviewTarget("selfie");
      }
    },
    [onTab, reviewTarget],
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
      selectReviewTab(target.fileType === "passport_scan" ? "passport" : "selfie");
      return;
    }

    selectReviewTab("issues");
  }, [selectReviewTab]);

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
      sectionId: row.field?.id,
      sectionLabel: row.section,
      targetLabel: row.label,
      targetType: "questionnaire",
    });
  }

  function openFileRemark(
    fileType: AdminReviewFileTarget,
    reason?: string,
    context?: Partial<RemarkContext>,
  ) {
    if (!selectedApplicant) return;
    setRemarkContext({
      applicantId: selectedApplicant.id,
      ...context,
      fileType,
      reason: reason ?? `${fileLabel(fileType)} требует повторной проверки`,
      targetType: fileType,
    });
  }

  function openSectionRemark(section: ReviewSection) {
    if (!selectedApplicant) return;
    setRemarkContext({
      applicantId: selectedApplicant.id,
      reason: `${section.title}: требуется уточнение`,
      sectionId: section.id,
      sectionLabel: section.title,
      targetLabel: section.title,
      targetType: "section",
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

  function submitRemark(input: IssueInput) {
    onAddIssue(input);
    setRemarkContext(null);
  }

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
        aria-label="Проверка пакета"
        aria-modal="true"
        className="admin-review-drawer"
        key="admin-review-drawer"
        role="dialog"
        initial={{ filter: "blur(10px)", opacity: 1, x: "100%" }}
        animate={{ filter: "blur(0px)", opacity: 1, x: 0 }}
        exit={{ filter: "blur(5px)", opacity: 0, x: "100%" }}
        transition={{ damping: 30, mass: 1, stiffness: 250, type: "spring" }}
      >
        <header className="admin-review-drawer-header">
          <div className="admin-review-titlebar">
            <div className="admin-review-titlecopy">
              <p>
                <span className={`admin-review-status-dot is-${submission.status}`} aria-hidden="true" />
                <span>{statusLabels[submission.status]}</span>
                <i aria-hidden="true">/</i>
                <strong>{submission.id}</strong>
              </p>
              <h2>{selectedApplicant?.fullName ?? submission.title}</h2>
              <span className="admin-review-meta">
                {submission.title} · {applicantCountLabel(submission.applicants.length)} ·{" "}
                {submission.city} · Агент: {agentName(submission.agentId)} ·{" "}
                {openIssueCount(submission)} открытых замечаний
              </span>
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

          <ApplicantChips
            selectedApplicantId={selectedApplicantId}
            submission={submission}
            onApplicant={setSelectedApplicantId}
          />

          <IdentityConsistencyStatusStrip compact report={identityReport} />

          <nav
            className="admin-review-tabs"
            aria-label="Рабочие вкладки проверки"
            role="tablist"
          >
            {adminReviewTabs.map((tab) => {
              const TabIcon = tab.icon;
              const count = tab.count?.(submission);
              const selected = activeReviewTab === tab.id;

              return (
                <button
                  aria-selected={selected}
                  className={selected ? "is-active" : ""}
                  key={tab.id}
                  role="tab"
                  type="button"
                  onClick={() => selectReviewTab(tab.id)}
                >
                  <TabIcon aria-hidden="true" size={16} />
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
                      transition={{ bounce: 0, duration: 0.3, type: "spring" }}
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
          <AnimatePresence mode="wait">
            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="admin-review-tab-panel"
              exit={{ opacity: 1, y: -10 }}
              initial={{ opacity: 1, y: 10 }}
              key={activeTab}
              transition={{ duration: 0.2 }}
            >
              {activeTab === "questionnaire" ? (
                activeReviewTab === "passport" ? (
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
                    onAcceptFile={() => {
                      if (!selectedApplicant) return;
                      onReviewFileAccept({
                        applicantId: selectedApplicant.id,
                        fileType: "passport_scan",
                      });
                    }}
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
                    onNext={() => selectReviewTab("questionnaire")}
                    onRemark={() => openFileRemark("passport_scan", "Скан паспорта требует замены")}
                  />
                ) : activeReviewTab === "selfie" ? (
                  <SelfieReviewTab
                    issueGuardReason={issueGuardReason}
                    reviewTarget={reviewTarget === "passport_scan" ? "selfie" : reviewTarget}
                    selectedApplicant={selectedApplicant}
                    submission={submission}
                    onAcceptFile={(fileType) => {
                      if (!selectedApplicant) return;
                      onReviewFileAccept({
                        applicantId: selectedApplicant.id,
                        fileType,
                      });
                    }}
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
                    onReviewTarget={setReviewTarget}
                  />
                ) : activeReviewTab === "questionnaire" ? (
                  <QuestionnaireReviewTab
                    focusTarget={questionnaireFocusTarget}
                    issueGuardReason={issueGuardReason}
                    selectedApplicant={selectedApplicant}
                    submission={submission}
                    onFieldRemark={openQuestionnaireRemark}
                    onSectionRemark={openSectionRemark}
                    onVerifyPassport={() => selectReviewTab("passport")}
                  />
                ) : (
                  <IssuesTab
                    identityFindings={identityReport.findings}
                    submission={submission}
                    onAddRemark={openGeneralRemark}
                    onIdentityJump={(finding) => jumpToWorkspaceTarget(finding.target)}
                    onIdentityRemark={handleIdentityFindingRemark}
                    onJump={(issue) => {
                      if (issue.target.applicantId) setSelectedApplicantId(issue.target.applicantId);
                      if (issue.target.fileType === "passport_scan") {
                        selectReviewTab("passport");
                      } else if (
                        issue.target.fileType === "selfie" ||
                        issue.target.fileType === "selfie_2"
                      ) {
                        setReviewTarget(issue.target.fileType);
                        selectReviewTab("selfie");
                      } else {
                        selectReviewTab("questionnaire");
                      }
                    }}
                  />
                )
              ) : (
                <IssuesTab
                  identityFindings={identityReport.findings}
                  submission={submission}
                  onAddRemark={openGeneralRemark}
                  onIdentityJump={(finding) => jumpToWorkspaceTarget(finding.target)}
                  onIdentityRemark={handleIdentityFindingRemark}
                  onJump={() => selectReviewTab("questionnaire")}
                />
              )}
            </motion.div>
          </AnimatePresence>
        </div>

        <footer className="admin-review-footer">
          <div>
            <span className="admin-review-footer-dot" aria-hidden="true" />
            {openIssueCount(submission)
              ? `Есть открытые замечания: ${openIssueCount(submission)}. Основное действие: ${primaryAction.label}.`
              : primaryAction.reason ?? "Паспорт, селфи и анкета готовы к решению администратора."}
          </div>
          <button className="admin-review-secondary" type="button" onClick={onClose}>
            Отложить
          </button>
          <button
            className={`admin-review-primary ${
              primaryAction.action === "return_with_issues" ? "is-return" : ""
            }`}
            disabled={primaryAction.disabled}
            type="button"
            onClick={() => onAction(primaryAction.action)}
          >
            <ShieldCheck aria-hidden="true" size={16} />
            {primaryAction.label}
          </button>
        </footer>

        {remarkContext ? (
          <AdminRemarkForm
            context={remarkContext}
            issueGuardReason={issueGuardReason}
            submission={submission}
            onClose={() => setRemarkContext(null)}
            onSubmit={submitRemark}
          />
        ) : null}
      </motion.aside>
    </AnimatePresence>
  );
}


function isAdminReviewFileTarget(
  value: string | undefined,
): value is AdminReviewFileTarget {
  return value === "passport_scan" || value === "selfie" || value === "selfie_2";
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
  const reviewedApplicants = submission.applicants.filter(
    (applicant) => applicant.questionnaireStatus === "complete" && applicant.fileStatus === "complete",
  ).length;
  const openIssues = openIssueCount(submission);

  return (
    <div className="admin-review-applicant-strip" aria-label="Заявители в проверке">
      <div className="admin-review-family-progress">
        <strong>{reviewedApplicants}/{submission.applicants.length}</strong>
        <span>заявителей проверено</span>
        <em className={openIssues ? "is-warning" : ""}>{openIssues} замечаний</em>
      </div>
      <div className="admin-review-applicant-chips">
        {submission.applicants.map((applicant) => {
          const issueCount = submission.issues.filter(
            (issue) => issue.status === "open" && issue.target.applicantId === applicant.id,
          ).length;
          const selected = applicant.id === selectedApplicantId;
          const status =
            issueCount > 0
              ? "has-remarks"
              : applicant.fileStatus === "complete" && applicant.questionnaireStatus === "complete"
                ? "accepted"
                : "pending";

          return (
            <button
              aria-pressed={selected}
              className={`is-${status} ${selected ? "is-active" : ""}`}
              key={applicant.id}
              type="button"
              onClick={() => onApplicant(applicant.id)}
            >
              <span>{applicantInitials(applicant.fullName)}</span>
              <strong>{applicant.fullName}</strong>
              {issueCount ? <em>{issueCount}</em> : null}
            </button>
          );
        })}
      </div>
    </div>
  );
}

function PassportReviewTab({
  identityPanel,
  issueGuardReason,
  selectedApplicant,
  submission,
  onAcceptFile,
  onChecklistRemark,
  onFieldRemark,
  onNext,
  onRemark,
}: {
  identityPanel?: ReactNode;
  issueGuardReason: string;
  selectedApplicant?: Applicant;
  submission: Submission;
  onAcceptFile: () => void;
  onChecklistRemark: (item: ChecklistItem) => void;
  onFieldRemark: (row: ReviewFieldRow) => void;
  onNext: () => void;
  onRemark: () => void;
}) {
  const passportFile = selectedApplicant
    ? findApplicantFile(submission, selectedApplicant.id, "passport_scan")
    : undefined;
  const passportSection = selectedApplicant
    ? buildReviewSections(selectedApplicant).find((section) => section.isPassport)
    : undefined;
  const passportRows = passportSection?.rows ?? [];
  const canAcceptPassport = Boolean(
    passportFile &&
      passportFile.status !== "missing" &&
      passportFile.status !== "needs_replacement",
  );

  return (
    <div className="admin-review-decision-workspace">
      <MediaReviewPane
        file={passportFile}
        issueGuardReason={issueGuardReason}
        reviewTarget="passport_scan"
        showActions={false}
        showChecklist={false}
        submission={submission}
        onAccept={() => onAcceptFile()}
        onReject={() => onRemark()}
        onReviewTarget={() => undefined}
      />

      <section className="admin-review-check-pane" aria-label="Сверка паспорта">
        <header>
          <div>
            <span>Паспортная проверка</span>
            <h3>Паспорт + ключевые поля</h3>
          </div>
          <button disabled={!canAcceptPassport} type="button" onClick={onAcceptFile}>
            <CheckCircle2 aria-hidden="true" size={15} />
            Принять паспорт
          </button>
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

function SelfieReviewTab({
  issueGuardReason,
  reviewTarget,
  selectedApplicant,
  submission,
  onAcceptFile,
  onChecklistRemark,
  onFileRemark,
  onReviewTarget,
}: {
  identityPanel?: ReactNode;
  issueGuardReason: string;
  reviewTarget: Extract<AdminReviewFileTarget, "selfie" | "selfie_2">;
  selectedApplicant?: Applicant;
  submission: Submission;
  onAcceptFile: (fileType: AdminReviewFileTarget) => void;
  onChecklistRemark: (fileType: AdminReviewFileTarget, item: ChecklistItem) => void;
  onFileRemark: (fileType: AdminReviewFileTarget, reason?: string) => void;
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
        onAccept={onAcceptFile}
        onReject={onFileRemark}
        onReviewTarget={onReviewTarget}
      />

      <section className="admin-review-check-pane" aria-label="Проверка селфи">
        <header>
          <div>
            <span>Визуальная проверка</span>
            <h3>{fileLabel(reviewTarget)}</h3>
          </div>
          <button
            disabled={!file || file.status === "missing" || file.status === "needs_replacement"}
            type="button"
            onClick={() => onAcceptFile(reviewTarget)}
          >
            <CheckCircle2 aria-hidden="true" size={15} />
            Принять селфи
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
  issueGuardReason,
  selectedApplicant,
  submission,
  onFieldRemark,
  onSectionRemark,
  onVerifyPassport,
}: {
  focusTarget?: WorkspaceTarget;
  issueGuardReason: string;
  selectedApplicant?: Applicant;
  submission: Submission;
  onFieldRemark: (row: ReviewFieldRow) => void;
  onSectionRemark: (section: ReviewSection) => void;
  onVerifyPassport: () => void;
}) {
  const reviewSections = useMemo(
    () => (selectedApplicant ? buildReviewSections(selectedApplicant) : []),
    [selectedApplicant],
  );
  const firstNonPassportSection = reviewSections.find((section) => !section.isPassport);
  const [activeSectionId, setActiveSectionId] = useState(
    firstNonPassportSection?.id ?? reviewSections[0]?.id ?? "",
  );

  useEffect(() => {
    if (!reviewSections.length) return;
    if (reviewSections.some((section) => section.id === activeSectionId)) return;
    setActiveSectionId(firstNonPassportSection?.id ?? reviewSections[0]?.id ?? "");
  }, [activeSectionId, firstNonPassportSection?.id, reviewSections]);

  useEffect(() => {
    if (!focusTarget || focusTarget.tab !== "questionnaire" || !selectedApplicant) return;
    if (focusTarget.applicantId !== selectedApplicant.id) return;

    const matchingSection = reviewSections.find(
      (section) =>
        section.title === focusTarget.section ||
        section.id === focusTarget.section ||
        section.rows.some(
          (row) =>
            row.field?.id === focusTarget.field ||
            row.label === focusTarget.field ||
            row.field?.label === focusTarget.field,
        ),
    );

    if (matchingSection) setActiveSectionId(matchingSection.id);
  }, [focusTarget, reviewSections, selectedApplicant]);

  useEffect(() => {
    if (!focusTarget || focusTarget.tab !== "questionnaire" || !selectedApplicant) return;
    if (focusTarget.applicantId !== selectedApplicant.id) return;

    const timer = window.setTimeout(() => {
      const element = document.getElementById(targetElementId(focusTarget));
      if (!element) return;
      element.scrollIntoView({ behavior: "smooth", block: "center" });
      element.classList.add("is-ai-focus");
      window.setTimeout(() => element.classList.remove("is-ai-focus"), 1800);
    }, 100);

    return () => window.clearTimeout(timer);
  }, [activeSectionId, focusTarget, selectedApplicant]);

  const activeSection =
    reviewSections.find((section) => section.id === activeSectionId) ??
    firstNonPassportSection ??
    reviewSections[0];
  const activeSectionIndex = activeSection
    ? reviewSections.findIndex((section) => section.id === activeSection.id)
    : -1;
  const nextSection =
    activeSectionIndex >= 0 ? reviewSections[activeSectionIndex + 1] : undefined;

  const reviewedCount = selectedApplicant
    ? selectedApplicant.sections
        .flatMap((section) => section.fields)
        .filter(
          (field) => field.reviewState === "confirmed" || field.reviewConfirmedAtIso,
        ).length
    : 0;
  const issueCount = selectedApplicant
    ? submission.issues.filter(
        (issue) =>
          issue.status === "open" && issue.target.applicantId === selectedApplicant.id,
      ).length
    : 0;
  const totalFields = selectedApplicant
    ? selectedApplicant.sections.flatMap((section) => section.fields).length
    : 0;

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
            {issueCount} issues
          </span>
        </div>
      </div>

      <QuestionnaireWorkspaceShell className="admin-review-questionnaire-workspace">
        <section className="admin-review-field-pane" aria-label="Поля анкеты">
          <QuestionnaireSectionTabs
            className="admin-review-section-flow"
            ariaLabel="Секции анкеты"
            activeId={activeSection?.id ?? ""}
            sections={reviewSections.map((section, index) => ({
              count: section.rows.length,
              id: section.id,
              prefix: index + 1,
              title: section.title,
            }))}
            onChange={setActiveSectionId}
          />
          <div className="admin-review-field-head">
            <span />
            <small>Поле</small>
            <small>Значение</small>
            <small>Статус</small>
          </div>
          {activeSection ? (
            <div className="admin-review-field-section" key={activeSection.id}>
              <h3
                id={
                  selectedApplicant
                    ? targetElementId({
                        applicantId: selectedApplicant.id,
                        section: activeSection.title,
                        tab: "questionnaire",
                      })
                    : undefined
                }
              >
                {activeSection.title}
                {activeSection.isPassport ? (
                  <button type="button" onClick={onVerifyPassport}>
                    Проверяется во вкладке Паспорт
                  </button>
                ) : null}
              </h3>
              {activeSection.rows.map((row) => (
                <FieldReviewRow
                  domId={
                    selectedApplicant
                      ? targetElementId({
                          applicantId: selectedApplicant.id,
                          field: row.field?.id ?? row.label,
                          section: activeSection.title,
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
                  key={`${activeSection.id}-${row.field?.id ?? row.label}`}
                  row={row}
                  status={fieldStatus(submission, selectedApplicant?.id ?? "", row)}
                  onRemark={() => onFieldRemark(row)}
                  onVerifyPassport={row.hasDocument ? onVerifyPassport : undefined}
                />
              ))}
              <div className="admin-review-section-actions">
                <button
                  disabled={Boolean(issueGuardReason)}
                  type="button"
                  onClick={() => onSectionRemark(activeSection)}
                >
                  <MessageSquarePlus aria-hidden="true" size={15} />
                  Есть замечание
                </button>
                {nextSection ? (
                  <button
                    type="button"
                    onClick={() => setActiveSectionId(nextSection.id)}
                  >
                    Далее: {nextSection.title}
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </section>
      </QuestionnaireWorkspaceShell>
    </div>
  );
}

function MediaReviewPane({
  file,
  issueGuardReason,
  reviewTarget,
  showActions = true,
  showChecklist = true,
  submission,
  targets = ["passport_scan"],
  onAccept,
  onReject,
  onReviewTarget,
}: {
  file?: SubmissionFile;
  issueGuardReason: string;
  reviewTarget: AdminReviewFileTarget;
  showActions?: boolean;
  showChecklist?: boolean;
  submission: Submission;
  targets?: AdminReviewFileTarget[];
  onAccept: (fileType: AdminReviewFileTarget) => void;
  onReject: (fileType: AdminReviewFileTarget, reason?: string) => void;
  onReviewTarget: (target: AdminReviewFileTarget) => void;
}) {
  const targetCopy = mediaTargets.find((target) => target.id === reviewTarget) ?? mediaTargets[0];
  const canAccept = Boolean(file && file.status !== "missing" && file.status !== "needs_replacement");
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
            <strong>{file?.originalFileName ?? file?.generatedFileName ?? fileLabel(reviewTarget)}</strong>
            <span>{file?.storagePath ?? "Приватный storage preview не доступен локально"}</span>
            <small>
              {file?.mimeType ?? "media slot"} · {file?.sizeBytes ? formatBytes(file.sizeBytes) : "без размера"}
            </small>
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
            disabled={!canAccept}
            type="button"
            onClick={() => onAccept(reviewTarget)}
          >
            <CheckCircle2 aria-hidden="true" size={15} />
            Принять
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
      <span className="admin-review-row-label" title={row.label}>
        {row.label}
      </span>
      <strong title={row.value || "Не заполнено"}>{row.value || "Не заполнено"}</strong>
      <span className="admin-review-row-status">
        {status === "ok" ? "Verified" : status === "error" ? "Замечание" : "Проверить"}
      </span>
      <span className="admin-review-row-actions">
        {onVerifyPassport ? (
          <button aria-label={`Сверить с паспортом: ${row.label}`} type="button" onClick={onVerifyPassport}>
            <ScanText aria-hidden="true" size={13} />
          </button>
        ) : null}
        <button aria-label={`Создать замечание: ${row.label}`} type="button" onClick={onRemark}>
          <MessageSquarePlus aria-hidden="true" size={14} />
        </button>
      </span>
    </div>
  );
}

function AdminRemarkForm({
  context,
  issueGuardReason,
  onClose,
  onSubmit,
  submission,
}: {
  context: RemarkContext;
  issueGuardReason: string;
  onClose: () => void;
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
  }, [context, defaultApplicant]);

  const selectedFileType = remarkTargetFileType(targetType) ?? context.fileType;
  const issuePreviewId = nextAdminIssueId(submission);
  const fieldReference =
    context.checklistItemLabel || field.trim() || context.targetLabel || "раздел";
  const targetReference = selectedFileType
    ? `${fileLabel(selectedFileType)} / ${fieldReference}`
    : `${context.sectionLabel ?? "Анкета"} / ${fieldReference}`;
  const canSubmit = Boolean(
    applicantId && reason.trim() && comment.trim() && !issueGuardReason,
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
        exit={{ opacity: 0, scale: 0.96, y: 10 }}
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        role="dialog"
        transition={{ damping: 26, stiffness: 300, type: "spring" }}
      >
        <header>
          <div>
            <span>
              <AlertCircle aria-hidden="true" size={20} />
            </span>
            <div>
              <h3>Создать замечание</h3>
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
              <span>ID замечания</span>
              <strong>{issuePreviewId}</strong>
            </div>
            <div>
              <span>Переход агента</span>
              <strong>{targetReference}</strong>
            </div>
          </div>

          <section>
            <label>
              <Target aria-hidden="true" size={14} />
              Где найдена ошибка?
            </label>
            <div className="admin-remark-targets">
              {[
                { id: "questionnaire" as const, icon: FileText, label: "Анкета" },
                { id: "passport_scan" as const, icon: ImageIcon, label: "Скан загранпаспорта" },
                { id: "selfie" as const, icon: User, label: "Селфи" },
                { id: "selfie_2" as const, icon: User, label: "Селфи N2" },
              ].map((target) => {
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

          <div className="admin-remark-grid">
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
                Низкая (Рекомендация)
              </button>
              <button
                className={severity === "high" ? "is-active is-high" : ""}
                type="button"
                onClick={() => setSeverity("high")}
              >
                Высокая (Blocker)
              </button>
            </div>
          </section>

          <label>
            <span>Описание ошибки (для агента)</span>
            <textarea
              placeholder="Что именно не так..."
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </label>

          <label>
            <span>Что нужно исправить?</span>
            <textarea
              placeholder="Конкретное действие для агента"
              value={comment}
              onChange={(event) => setComment(event.target.value)}
            />
          </label>

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
            <Save aria-hidden="true" size={16} />
            Создать замечание
          </button>
        </footer>
      </motion.div>
    </motion.div>
  );
}

function IssuesTab({
  identityFindings = [],
  onAddRemark,
  onIdentityJump,
  onIdentityRemark,
  submission,
  onJump,
}: {
  identityFindings?: IdentityConsistencyFinding[];
  onAddRemark: () => void;
  onIdentityJump?: (finding: IdentityConsistencyFinding) => void;
  onIdentityRemark?: (finding: IdentityConsistencyFinding) => void;
  submission: Submission;
  onJump: (issue: Submission["issues"][number]) => void;
}) {
  if (!submission.issues.length && !identityFindings.length) {
    return (
      <div className="admin-review-empty-card">
        <ShieldCheck aria-hidden="true" size={18} />
        <strong>Замечаний пока нет</strong>
        <span>Если паспорт, селфи и анкета корректны, можно принимать заявку.</span>
        <button type="button" onClick={onAddRemark}>
          <MessageSquarePlus aria-hidden="true" size={15} />
          Добавить замечание
        </button>
      </div>
    );
  }

  return (
    <div className="admin-review-issues-list">
      <button type="button" onClick={onAddRemark}>
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
  if (tab === "issues") return "issues";
  if (tab === "files") return "selfie";
  return "passport";
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

function questionnaireFieldCount(submission: Submission) {
  return submission.applicants.reduce(
    (count, applicant) =>
      count + applicant.sections.reduce((sectionCount, section) => sectionCount + section.fields.length, 0),
    0,
  );
}

function nextAdminIssueId(submission: Submission) {
  return `зм-${submission.id}-новое-${submission.issues.length + 1}`;
}

function agentName(agentId: string) {
  return localAgentNames[agentId] ?? agentId;
}

function issueTargetPath(issue: Submission["issues"][number]) {
  if (issue.target.fileType && issue.target.field) {
    return `${fileLabel(issue.target.fileType)} / ${issue.target.field}`;
  }
  if (issue.target.fileType) return `Документ / ${fileLabel(issue.target.fileType)}`;
  if (issue.target.field) return `Анкета / ${issue.target.field}`;
  return issue.target.section ? `Анкета / ${issue.target.section}` : "Анкета";
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
    return ["Лицо заявителя видно", "Документ совпадает с заявителем", "Нет бликов и сильного размытия"];
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

function applicantInitials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${Math.round(value / 1024)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}
