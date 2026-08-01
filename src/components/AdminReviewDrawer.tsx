import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  CheckCircle2,
  ClipboardPenLine,
  Files,
  Users,
  UsersRound,
  History,
  ScanText,
  MessageSquarePlus,
  AlertCircle,
  TriangleAlert,
  Info,
  DownloadCloud,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  emitVisaflowUiEvent,
  useVisaflowBusinessBridge,
} from "../integration/visaflowBusinessBridge";
import { useExperienceReducedMotion } from "../shared/ui/experiencePreferences";
import {
  fileStatusLabels,
  fileTypeLabels,
  getAdminReviewActions,
  getPrimaryAction,
  statusLabelFor,
  statusTone as submissionStatusTone,
} from "../modules/submissions/status";
import {
  historyDetailForUser,
  historyTimestampForUser,
} from "../modules/submissions/historyPresentation";
import { blsApplicantQuestionnaireStatus } from "../modules/submissions/questionnaireBlsRules";
import { questionnaireFieldMatchesTarget } from "../modules/submissions/questionnaire";
import type {
  ActionDecision,
  Applicant,
  Issue,
  QuestionnaireField,
  Submission,
  SubmissionAction,
  SubmissionFile,
  SubmissionFileType,
} from "../modules/submissions/types";

interface AdminReviewDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  submissionId: string | null;
  submission?: Submission | null;
  returnFocusTarget?: HTMLElement | null;
  onVerifyDocument: (applicantId?: string) => void;
  onAddRemark: (
    field?: string,
    applicant?: string,
    fileType?: SubmissionFileType,
    applicantId?: string,
  ) => void;
  onApproveQuestionnaireField?: (input: {
    applicantId: string;
    fieldId: string;
    sectionId: string;
  }) => boolean | Promise<boolean>;
  onPrimaryAction?: (
    submissionId: string,
    action: SubmissionAction,
  ) => void | Promise<void>;
  onOpenExport?: () => void;
  canPublishReturnedPdfHandoff?: boolean;
  returnedPdfHandoffReason?: string;
  onPublishReturnedPdfHandoff?: (submissionId: string) => void | Promise<void>;
}

type TabId = "applicants" | "questionnaire";
type FieldReviewStatus = "approved" | "pending" | "error";
type ApplicantPanelId = "overview" | "media" | "issues" | "history";
type ReviewTargetRequest = {
  issue: Issue;
  requestId: number;
};
type DrawerTabDefinition = {
  id: TabId;
  label: string;
  icon: typeof Info;
  count?: number;
  isWarning?: boolean;
};

const drawerHeadingId = "admin-review-drawer-heading";
const primaryActionReasonId = "admin-review-primary-action-reason";
const focusableDrawerControlSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function drawerTabId(tab: TabId) {
  return `admin-review-tab-${tab}`;
}

function drawerPanelId(tab: TabId) {
  return `admin-review-panel-${tab}`;
}

function unresolvedIssues(submission: Submission | null | undefined): Issue[] {
  return submission?.issues.filter((issue) => issue.status !== "closed_by_admin") ?? [];
}

function issueStatusLabel(issue: Issue) {
  if (issue.status === "open") return "Открыто";
  if (issue.status === "fixed_by_agent") return "Исправлено агентом";
  return "Закрыто админом";
}

function issueSeverityLabel(issue: Issue) {
  if (issue.severity === "blocker") return "Критичное";
  if (issue.severity === "warning") return "Проверить";
  return "Инфо";
}

function fileStatusTone(file: SubmissionFile) {
  if (file.status === "accepted") return "text-[#b8baff]";
  if (file.status === "needs_replacement" || file.status === "missing")
    return "text-white/62";
  return "text-white/55";
}

function fieldMatchesIssue(field: QuestionnaireField, issue: Issue) {
  return questionnaireFieldMatchesTarget(field, issue.target.field);
}

function questionnaireFieldDomId(applicantId: string, fieldId: string) {
  return `admin-review-field-${applicantId}-${fieldId}`;
}

function questionnaireSectionDomId(applicantId: string, sectionId: string) {
  return `admin-review-section-${applicantId}-${sectionId}`;
}

function fileDomId(fileId: string) {
  return `admin-review-file-${fileId}`;
}

function focusReviewTarget(target: HTMLElement | null, prefersReducedMotion: boolean) {
  if (!target) {
    return;
  }

  if (typeof target.scrollIntoView === "function") {
    target.scrollIntoView({
      behavior: prefersReducedMotion ? "auto" : "smooth",
      block: "center",
    });
  }
  target.focus({ preventScroll: true });
}

function issueTargetsFile(issue: Issue) {
  return (
    issue.type === "file" || issue.type === "media" || Boolean(issue.target.fileType)
  );
}

function fieldStatus(field: QuestionnaireField, issues: Issue[]): FieldReviewStatus {
  if (
    field.error ||
    issues.some((issue) => issue.status === "open" && fieldMatchesIssue(field, issue))
  )
    return "error";
  if (field.adminReviewApprovedAtIso && field.adminReviewApprovedBy) {
    return "approved";
  }
  return "pending";
}

function selectedApplicantLabel(applicant: Applicant) {
  return applicant.fullName;
}

function reviewValueFor(field: QuestionnaireField) {
  const value = field.value.trim();
  if (!value) return "";

  if (field.id === "gender") {
    if (/^(m|male|м|мужской)(\s*-.*)?$/i.test(value)) return "Мужской";
    if (/^(f|female|ж|женский)(\s*-.*)?$/i.test(value)) return "Женский";
  }

  if (field.id === "marital-status") {
    if (/^(single|холост|не замуж)/i.test(value)) return "Холост/не замужем";
    if (/^(married|женат|замуж)/i.test(value)) return "Женат/замужем";
    if (/^(divorced|развед)/i.test(value)) return "Разведен(а)";
    if (/^(widow|вдов)/i.test(value)) return "Вдовец/вдова";
  }

  return value;
}

function hasReviewValue(value: string) {
  const normalized = value.trim().toLocaleLowerCase("ru-RU");
  return Boolean(normalized) && normalized !== "—" && normalized !== "не заполнено";
}

function questionnaireStatusLabel(status: string) {
  if (status === "complete") return "Готово";
  if (status === "partial") return "Частично";
  if (status === "needs_fix") return "Нужны исправления";
  if (status === "empty") return "Не заполнена";
  return "Статус не определён";
}

function fieldReviewStatusLabel(status: FieldReviewStatus, value: string) {
  if (!hasReviewValue(value)) return "Поле не заполнено";
  if (status === "approved") return "Подтверждено документом";
  if (status === "error") return "Требуется исправление";
  return "Не подтверждено документом";
}

const FieldRow = ({
  id,
  label,
  value,
  status,
  approveDisabled,
  approvePending,
  onApprove,
  onRemark,
}: {
  id?: string;
  label: string;
  value: string;
  status: FieldReviewStatus;
  approveDisabled?: boolean;
  approvePending?: boolean;
  onApprove?: () => void;
  onRemark?: () => void;
}) => (
  <div
    data-review-empty={!hasReviewValue(value) || undefined}
    data-review-state={status}
    id={id}
    tabIndex={id ? -1 : undefined}
    className={`admin-review-field-row v19-admin-passport-field ${
      status === "approved"
        ? "is-approved"
        : status === "error"
          ? "is-error"
          : "is-pending"
    }`}
  >
    <div className="admin-review-row-main min-w-0 flex-1">
      <span className="admin-review-row-label">{label}</span>
      <strong className="admin-review-row-value">{value || "Не заполнено"}</strong>
      <span className="admin-review-row-review-status">
        {fieldReviewStatusLabel(status, value)}
      </span>
    </div>
    <div className="admin-review-row-actions">
      {onApprove && (
        <button
          aria-label={`${status === "approved" ? "Проверено" : "Апрув"}: ${label}`}
          aria-pressed={status === "approved"}
          className="admin-review-row-approve"
          data-testid="admin-review-approve-field"
          disabled={approveDisabled || approvePending || status === "approved"}
          onClick={onApprove}
          title={
            status === "approved"
              ? "Поле проверено"
              : approveDisabled
                ? "Заполните поле и закройте замечания перед апрувом"
                : "Апрув поля"
          }
          type="button"
        >
          <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
          <span>
            {approvePending
              ? "Сохраняем…"
              : status === "approved"
                ? "Подтверждено"
                : "Подтвердить"}
          </span>
        </button>
      )}
      {onRemark && (
        <button
          aria-label={`Добавить замечание: ${label}`}
          data-testid="admin-review-add-remark"
          type="button"
          onClick={onRemark}
          className="linear-product-action linear-product-action--outline linear-product-action--compact admin-review-row-remark admin-review-remark-action"
          title="Добавить замечание"
        >
          <MessageSquarePlus className="h-4 w-4" />
          <span>Замечание</span>
        </button>
      )}
    </div>
  </div>
);

function EmptyTabState({
  title,
  copy,
  tone = "neutral",
}: {
  title: string;
  copy: string;
  tone?: "neutral" | "success";
}) {
  const Icon = tone === "success" ? CheckCircle2 : Info;

  return (
    <div
      className={`admin-review-empty-state is-${tone} flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-20 text-center`}
    >
      <Icon className="mb-3 h-8 w-8 text-white/22" />
      <h3 className="m-0 text-[15px] font-semibold text-white">{title}</h3>
      <p className="m-0 mt-2 max-w-[420px] text-[13px] leading-5 text-white/50">
        {copy}
      </p>
    </div>
  );
}

function applicantRoleLabel(role: Applicant["role"]) {
  if (role === "spouse") return "Супруг / супруга";
  if (role === "child") return "Ребёнок";
  return "Основной турист";
}

function russianCountLabel(count: number, one: string, few: string, many: string) {
  const lastTwo = count % 100;
  const last = count % 10;
  if (lastTwo >= 11 && lastTwo <= 14) return many;
  if (last === 1) return one;
  if (last >= 2 && last <= 4) return few;
  return many;
}

function applicantInitials(fullName: string) {
  return fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toLocaleUpperCase("ru-RU"))
    .join("");
}

function ApplicantsTab({
  submission,
  primaryAction,
  reviewTarget,
  selectedApplicantId,
  onAddRemark,
  onOpenIssue,
  onSelectedApplicantIdChange,
  onVerifyDocument,
}: {
  submission: Submission | null;
  primaryAction: ActionDecision | null;
  reviewTarget: ReviewTargetRequest | null;
  selectedApplicantId: string;
  onAddRemark: AdminReviewDrawerProps["onAddRemark"];
  onOpenIssue: (issue: Issue) => void;
  onSelectedApplicantIdChange: (applicantId: string) => void;
  onVerifyDocument: AdminReviewDrawerProps["onVerifyDocument"];
}) {
  const [activePanel, setActivePanel] = useState<ApplicantPanelId>("overview");
  const prefersReducedMotion = useExperienceReducedMotion();

  useEffect(() => {
    const issue = reviewTarget?.issue;
    if (!issue || !issueTargetsFile(issue)) return;
    if (!submission?.applicants.some((item) => item.id === issue.target.applicantId)) {
      return;
    }

    onSelectedApplicantIdChange(issue.target.applicantId);
    setActivePanel("media");
  }, [onSelectedApplicantIdChange, reviewTarget, submission]);

  if (!submission) {
    return (
      <EmptyTabState
        title="Заявители не загружены"
        copy="Нет выбранной заявки для просмотра состава пакета."
      />
    );
  }

  if (!submission.applicants.length) {
    return (
      <EmptyTabState
        title="Заявителей пока нет"
        copy="Состав заявки появится здесь после добавления заявителей в анкету."
      />
    );
  }

  const applicant =
    submission.applicants.find((item) => item.id === selectedApplicantId) ??
    submission.applicants[0];
  if (!applicant) return null;

  const applicantFiles = submission.files.filter(
    (file) => file.applicantId === applicant.id,
  );
  const applicantIssues = unresolvedIssues(submission).filter(
    (issue) => issue.target.applicantId === applicant.id,
  );
  const acceptedFiles = applicantFiles.filter(
    (file) => file.status === "accepted",
  ).length;
  const questionnaireFields = applicant.sections.flatMap((section) => section.fields);
  const filledQuestionnaireFields = questionnaireFields.filter((field) =>
    hasReviewValue(field.value),
  );
  const approvedQuestionnaireFields = filledQuestionnaireFields.filter(
    (field) => fieldStatus(field, applicantIssues) === "approved",
  ).length;
  const applicantQuestionnaireStatus = applicantIssues.some(
    (issue) => issue.status === "open" && !issueTargetsFile(issue),
  )
    ? "needs_fix"
    : blsApplicantQuestionnaireStatus(applicant);
  const totalReviewItems = filledQuestionnaireFields.length + applicantFiles.length;
  const completedReviewItems = approvedQuestionnaireFields + acceptedFiles;
  const attentionPanel: ApplicantPanelId | null = applicantIssues.length
    ? "issues"
    : applicantFiles.some((file) => file.status !== "accepted")
      ? "media"
      : null;
  const applicantSubmission: Submission = {
    ...submission,
    applicants: [applicant],
    files: applicantFiles,
    issues: submission.issues.filter(
      (issue) => issue.target.applicantId === applicant.id,
    ),
  };
  const panels: Array<{
    id: ApplicantPanelId;
    label: string;
    icon: typeof Info;
    count?: number;
  }> = [
    { id: "overview", label: "Обзор", icon: Info },
    { id: "media", label: "Файлы", icon: Files, count: applicantFiles.length },
    {
      id: "issues",
      label: "Замечания",
      icon: TriangleAlert,
      count: applicantIssues.length,
    },
    {
      id: "history",
      label: "История",
      icon: History,
      count: submission.history.length,
    },
  ];

  const handlePanelTabKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    currentPanel: ApplicantPanelId,
  ) => {
    const currentIndex = panels.findIndex((panel) => panel.id === currentPanel);
    if (currentIndex < 0) return;

    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % panels.length;
    else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + panels.length) % panels.length;
    } else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = panels.length - 1;
    else return;

    event.preventDefault();
    const nextPanel = panels[nextIndex]?.id;
    if (!nextPanel) return;
    setActivePanel(nextPanel);
    window.requestAnimationFrame(() => {
      document
        .getElementById(`admin-review-traveler-tab-${nextPanel}`)
        ?.focus({ preventScroll: true });
    });
  };

  return (
    <div className="admin-review-travelers" data-testid="admin-review-travelers">
      <nav aria-label="Заявители пакета" className="admin-review-traveler-switcher">
        <header>
          <span>Заявители</span>
          <em>{submission.applicants.length}</em>
        </header>
        <div>
          {submission.applicants.map((item, index) => {
            const isSelected = item.id === applicant.id;
            const itemIssues = unresolvedIssues(submission).filter(
              (issue) => issue.target.applicantId === item.id,
            ).length;
            return (
              <button
                aria-controls="admin-review-traveler-workspace"
                aria-expanded={isSelected}
                className={isSelected ? "is-selected" : undefined}
                key={item.id}
                onClick={() => {
                  onSelectedApplicantIdChange(item.id);
                  setActivePanel("overview");
                }}
                type="button"
              >
                <span>{index + 1}</span>
                <div>
                  <strong>{item.fullName}</strong>
                  <small>{applicantRoleLabel(item.role)}</small>
                </div>
                {itemIssues ? <em>{itemIssues}</em> : null}
                <ChevronRight aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </nav>

      <section
        aria-label={`Профиль туриста: ${applicant.fullName}`}
        className="admin-review-traveler-workspace"
        id="admin-review-traveler-workspace"
      >
        <motion.header
          animate={{ opacity: 1, scale: 1 }}
          className="admin-review-traveler-hero"
          initial={prefersReducedMotion ? false : { opacity: 0, scale: 0.985 }}
          key={applicant.id}
          transition={{ duration: prefersReducedMotion ? 0 : 0.22 }}
        >
          <span aria-hidden="true" className="admin-review-traveler-avatar">
            {applicantInitials(applicant.fullName) || <Users />}
          </span>
          <div className="admin-review-traveler-identity">
            <span>{applicantRoleLabel(applicant.role)}</span>
            <h3>{applicant.fullName}</h3>
            <p>
              {submission.city} · {submission.tripDateFrom} – {submission.tripDateTo}
            </p>
          </div>
          <p className="admin-review-traveler-state">
            {applicantIssues.length
              ? `${applicantIssues.length} ${russianCountLabel(applicantIssues.length, "замечание", "замечания", "замечаний")} ${applicantIssues.length === 1 ? "требует" : "требуют"} внимания`
              : `${acceptedFiles}/${applicantFiles.length} файлов принято`}
          </p>
        </motion.header>

        <div
          aria-label={`Разделы заявителя: ${applicant.fullName}`}
          className="admin-review-traveler-tabs"
          role="tablist"
        >
          {panels.map((panel) => {
            const isActive = activePanel === panel.id;
            const isAttention = attentionPanel === panel.id;
            return (
              <button
                aria-controls={`admin-review-traveler-panel-${panel.id}`}
                aria-selected={isActive}
                className={`${isActive ? "is-active" : ""} ${
                  isAttention ? "is-attention" : ""
                }`}
                id={`admin-review-traveler-tab-${panel.id}`}
                key={panel.id}
                onClick={() => setActivePanel(panel.id)}
                onKeyDown={(event) => handlePanelTabKeyDown(event, panel.id)}
                role="tab"
                tabIndex={isActive ? 0 : -1}
                type="button"
              >
                <panel.icon aria-hidden="true" />
                <span>{panel.label}</span>
                {panel.count ? <em>{panel.count}</em> : null}
                {isAttention ? <i aria-label="Требует внимания" /> : null}
              </button>
            );
          })}
        </div>

        <AnimatePresence mode="wait">
          <motion.div
            animate={{ opacity: 1, x: 0 }}
            aria-labelledby={`admin-review-traveler-tab-${activePanel}`}
            className="admin-review-traveler-content"
            exit={prefersReducedMotion ? { opacity: 1 } : { opacity: 0, x: -8 }}
            id={`admin-review-traveler-panel-${activePanel}`}
            initial={prefersReducedMotion ? false : { opacity: 0, x: 8 }}
            key={`${applicant.id}:${activePanel}`}
            role="tabpanel"
            transition={{ duration: prefersReducedMotion ? 0 : 0.18 }}
          >
            {activePanel === "overview" ? (
              <div className="admin-review-traveler-overview-layout">
                <dl className="admin-review-traveler-overview">
                  <div>
                    <dt>Анкета</dt>
                    <dd>{questionnaireStatusLabel(applicantQuestionnaireStatus)}</dd>
                  </div>
                  <div>
                    <dt>Проверено полей</dt>
                    <dd>
                      {approvedQuestionnaireFields}/{filledQuestionnaireFields.length}
                    </dd>
                  </div>
                  <div>
                    <dt>Файлы</dt>
                    <dd>
                      {acceptedFiles}/{applicantFiles.length} принято
                    </dd>
                  </div>
                  <div>
                    <dt>Маршрут</dt>
                    <dd>{submission.city} · Испания</dd>
                  </div>
                </dl>
                <aside className="admin-review-traveler-summary">
                  <header>
                    <span>Итог по заявителю</span>
                    <strong>
                      {completedReviewItems}/{totalReviewItems || 0}
                    </strong>
                  </header>
                  <progress
                    aria-label="Прогресс проверки заявителя"
                    max={Math.max(totalReviewItems, 1)}
                    value={completedReviewItems}
                  />
                  <div className={attentionPanel ? "is-warning" : "is-ready"}>
                    {attentionPanel ? (
                      <AlertCircle aria-hidden="true" />
                    ) : (
                      <CheckCircle2 aria-hidden="true" />
                    )}
                    <span>
                      <strong>
                        {attentionPanel ? "Требует внимания" : "Проверка завершена"}
                      </strong>
                      <small>
                        {attentionPanel === "issues"
                          ? "Замечания агента нужно перепроверить."
                          : attentionPanel === "media"
                            ? "Не все файлы приняты администратором."
                            : "Данные готовы к решению по пакету."}
                      </small>
                    </span>
                    {attentionPanel ? (
                      <button
                        onClick={() => setActivePanel(attentionPanel)}
                        type="button"
                      >
                        {attentionPanel === "issues"
                          ? "Перейти к замечаниям"
                          : "Проверить файлы"}
                        <ChevronRight aria-hidden="true" />
                      </button>
                    ) : null}
                  </div>
                </aside>
              </div>
            ) : null}
            {activePanel === "media" ? (
              <MediaTab
                onAddRemark={onAddRemark}
                onVerifyDocument={onVerifyDocument}
                reviewTarget={reviewTarget}
                submission={applicantSubmission}
              />
            ) : null}
            {activePanel === "issues" ? (
              <IssuesTab
                onOpenIssue={onOpenIssue}
                primaryAction={primaryAction}
                submission={applicantSubmission}
              />
            ) : null}
            {activePanel === "history" ? (
              <div className="admin-review-traveler-history">
                <p>История пакета · {applicant.fullName}</p>
                <HistoryTab submission={submission} />
              </div>
            ) : null}
          </motion.div>
        </AnimatePresence>
      </section>
    </div>
  );
}

function QuestionnaireTab({
  submission,
  reviewTarget,
  selectedApplicantId,
  onAddRemark,
  onApproveQuestionnaireField,
  onSelectedApplicantIdChange,
}: {
  submission: Submission | null;
  reviewTarget: ReviewTargetRequest | null;
  selectedApplicantId: string;
  onAddRemark: (
    field?: string,
    applicant?: string,
    fileType?: SubmissionFileType,
    applicantId?: string,
  ) => void;
  onApproveQuestionnaireField?: AdminReviewDrawerProps["onApproveQuestionnaireField"];
  onSelectedApplicantIdChange: (applicantId: string) => void;
}) {
  const prefersReducedMotion = useExperienceReducedMotion();
  const [isApplicantMenuOpen, setApplicantMenuOpen] = useState(false);
  const [pendingApprovalKey, setPendingApprovalKey] = useState("");
  const [pendingSectionId, setPendingSectionId] = useState("");
  const applicantSelectRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setApplicantMenuOpen(false);
    setPendingSectionId("");
  }, [submission]);

  useEffect(() => {
    if (!isApplicantMenuOpen) return;

    const closeOutsideMenu = (event: MouseEvent) => {
      if (!applicantSelectRef.current?.contains(event.target as Node)) {
        setApplicantMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", closeOutsideMenu);
    return () => document.removeEventListener("mousedown", closeOutsideMenu);
  }, [isApplicantMenuOpen]);

  useEffect(() => {
    const issue = reviewTarget?.issue;
    if (!issue || issueTargetsFile(issue)) return;
    if (!submission?.applicants.some((item) => item.id === issue.target.applicantId)) {
      return;
    }

    onSelectedApplicantIdChange(issue.target.applicantId);
  }, [onSelectedApplicantIdChange, reviewTarget, submission]);

  useEffect(() => {
    const issue = reviewTarget?.issue;
    if (
      !issue ||
      issueTargetsFile(issue) ||
      selectedApplicantId !== issue.target.applicantId
    ) {
      return;
    }

    const targetApplicant = submission?.applicants.find(
      (item) => item.id === issue.target.applicantId,
    );
    if (!targetApplicant) {
      return;
    }

    const targetField = targetApplicant.sections
      .flatMap((section) => section.fields)
      .find((field) => questionnaireFieldMatchesTarget(field, issue.target.field));
    const targetSection = targetApplicant.sections.find(
      (section) =>
        section.id === issue.target.section || section.title === issue.target.section,
    );
    const targetId = targetField
      ? questionnaireFieldDomId(targetApplicant.id, targetField.id)
      : targetSection
        ? questionnaireSectionDomId(targetApplicant.id, targetSection.id)
        : undefined;
    if (!targetId) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      const target = document.getElementById(targetId);
      const section = target?.closest("details");
      if (section instanceof HTMLDetailsElement) {
        section.open = true;
      }
      focusReviewTarget(target, prefersReducedMotion);
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [prefersReducedMotion, reviewTarget, selectedApplicantId, submission]);

  if (!submission) {
    return (
      <EmptyTabState
        title="Анкета не загружена"
        copy="Выберите существующую заявку из админской очереди."
      />
    );
  }

  const applicant =
    submission.applicants.find((item) => item.id === selectedApplicantId) ??
    submission.applicants[0];
  if (!applicant) {
    return (
      <EmptyTabState
        title="Нет заявителей"
        copy="В выбранной заявке нет заявителей для проверки анкеты."
      />
    );
  }

  const applicantIssues = unresolvedIssues(submission).filter(
    (issue) => issue.target.applicantId === applicant.id,
  );
  const fields = applicant.sections.flatMap((section) => section.fields);
  const reviewableFields = fields.filter((field) => hasReviewValue(field.value));
  const approvedCount = reviewableFields.filter(
    (field) => fieldStatus(field, applicantIssues) === "approved",
  ).length;
  const focusFirstField = (predicate: (field: QuestionnaireField) => boolean) => {
    const target = fields.find(predicate);
    if (!target) return;
    document
      .getElementById(questionnaireFieldDomId(applicant.id, target.id))
      ?.scrollIntoView({
        behavior: prefersReducedMotion ? "auto" : "smooth",
        block: "center",
      });
  };

  return (
    <div className="admin-review-questionnaire">
      <div className="admin-review-applicant-strip">
        <div className="admin-review-applicant-select">
          <span>Заявитель</span>
          <div
            className="admin-review-applicant-select-control"
            ref={applicantSelectRef}
            onKeyDown={(event) => {
              if (event.key !== "Escape" || !isApplicantMenuOpen) return;
              event.preventDefault();
              event.stopPropagation();
              setApplicantMenuOpen(false);
            }}
          >
            <button
              aria-controls={
                submission.applicants.length > 1
                  ? "admin-review-applicant-menu"
                  : undefined
              }
              aria-expanded={isApplicantMenuOpen}
              aria-haspopup="listbox"
              aria-label={`Выбранный заявитель: ${selectedApplicantLabel(applicant)}`}
              className="admin-review-applicant-select-trigger"
              disabled={submission.applicants.length < 2 || Boolean(pendingSectionId)}
              onClick={() => setApplicantMenuOpen((current) => !current)}
              type="button"
            >
              <span className="admin-review-applicant-select-value">
                {selectedApplicantLabel(applicant)}
              </span>
              {submission.applicants.length > 1 ? (
                <ChevronDown
                  aria-hidden="true"
                  className={isApplicantMenuOpen ? "is-open" : undefined}
                />
              ) : null}
            </button>

            {isApplicantMenuOpen ? (
              <div
                aria-label="Выберите заявителя"
                className="admin-review-applicant-select-menu"
                id="admin-review-applicant-menu"
                role="listbox"
              >
                {submission.applicants.map((item) => {
                  const isSelected = item.id === applicant.id;
                  return (
                    <button
                      aria-selected={isSelected}
                      className={isSelected ? "is-selected" : undefined}
                      key={item.id}
                      onClick={() => {
                        onSelectedApplicantIdChange(item.id);
                        setApplicantMenuOpen(false);
                      }}
                      role="option"
                      type="button"
                    >
                      <span>{selectedApplicantLabel(item)}</span>
                      {isSelected ? <CheckCircle2 aria-hidden="true" /> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>

        <div className="admin-review-applicant-stats" aria-label="Навигация по анкете">
          <button
            className={`admin-review-applicant-stat-button ${
              approvedCount === reviewableFields.length && reviewableFields.length
                ? "is-ok"
                : "is-warning"
            }`}
            onClick={() => focusFirstField((field) => hasReviewValue(field.value))}
            type="button"
          >
            <CheckCircle2 className="h-4 w-4" /> Проверено {approvedCount} из{" "}
            {reviewableFields.length} заполненных
          </button>
          <button
            className={`admin-review-applicant-stat-button ${
              applicantIssues.length ? "is-warning" : "is-ok"
            }`}
            disabled={!applicantIssues.length}
            onClick={() =>
              focusFirstField(
                (field) => fieldStatus(field, applicantIssues) === "error",
              )
            }
            type="button"
          >
            <AlertCircle className="h-4 w-4" />{" "}
            {applicantIssues.length
              ? `${applicantIssues.length} ${russianCountLabel(applicantIssues.length, "замечание", "замечания", "замечаний")}`
              : "Без замечаний"}
          </button>
        </div>
      </div>

      <div className="admin-review-field-pane">
        {applicant.sections.map((section, sectionIndex) => {
          const visibleFields = section.fields;
          const reviewableFields = visibleFields.filter((field) =>
            hasReviewValue(field.value),
          );

          const approvedInSection = reviewableFields.filter(
            (field) => fieldStatus(field, applicantIssues) === "approved",
          ).length;
          const fieldsToApprove = reviewableFields.filter((field) => {
            const status = fieldStatus(field, applicantIssues);
            return status !== "approved" && status !== "error";
          });
          const isSectionComplete =
            Boolean(reviewableFields.length) &&
            approvedInSection === reviewableFields.length;

          const unresolvedInSection = visibleFields.some(
            (field) => fieldStatus(field, applicantIssues) === "error",
          );

          return (
            <details
              className="admin-review-field-section"
              id={questionnaireSectionDomId(applicant.id, section.id)}
              key={section.id}
              open={sectionIndex === 0 || unresolvedInSection}
              tabIndex={-1}
            >
              <summary className="admin-review-questionnaire-section-title flex cursor-pointer items-center gap-2 text-[15px] font-semibold text-white">
                <span className="admin-review-section-number flex h-6 w-6 items-center justify-center rounded-md bg-white/5 font-mono text-[12px] text-white/60">
                  {sectionIndex + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">{section.title}</span>
                <span className="text-[11px] font-medium text-white/40">
                  {visibleFields.length} полей
                </span>
                <ChevronDown aria-hidden="true" className="h-4 w-4 text-white/45" />
              </summary>
              <div className="admin-review-section-review">
                <span>
                  Проверено {approvedInSection} из {reviewableFields.length} заполненных
                </span>
                <button
                  aria-label={`Апрув всей секции: ${section.title}`}
                  className={`admin-review-section-approve ${
                    isSectionComplete ? "is-complete" : ""
                  }`}
                  data-testid="admin-review-approve-section"
                  disabled={
                    !onApproveQuestionnaireField ||
                    !fieldsToApprove.length ||
                    Boolean(pendingApprovalKey) ||
                    Boolean(pendingSectionId)
                  }
                  onClick={async () => {
                    if (
                      !onApproveQuestionnaireField ||
                      !fieldsToApprove.length ||
                      pendingApprovalKey ||
                      pendingSectionId
                    ) {
                      return;
                    }

                    setPendingSectionId(section.id);
                    try {
                      for (const field of fieldsToApprove) {
                        const approved = await onApproveQuestionnaireField({
                          applicantId: applicant.id,
                          fieldId: field.id,
                          sectionId: section.id,
                        });
                        if (approved === false) break;
                      }
                    } finally {
                      setPendingSectionId("");
                    }
                  }}
                  type="button"
                >
                  <CheckCircle2 aria-hidden="true" className="h-4 w-4" />
                  <span>
                    {pendingSectionId === section.id
                      ? "Сохраняем…"
                      : isSectionComplete
                        ? "Вся секция подтверждена"
                        : "Апрув всей секции"}
                  </span>
                </button>
              </div>
              <div className="admin-review-field-table mt-3 space-y-2">
                {visibleFields.map((field) => {
                  const status = fieldStatus(field, applicantIssues);
                  const approvalKey = `${applicant.id}:${section.id}:${field.id}`;
                  const approveDisabled =
                    !hasReviewValue(field.value) || status === "error";
                  return (
                    <FieldRow
                      approveDisabled={approveDisabled}
                      approvePending={
                        pendingApprovalKey === approvalKey ||
                        pendingSectionId === section.id
                      }
                      id={questionnaireFieldDomId(applicant.id, field.id)}
                      key={field.id}
                      label={field.label}
                      value={reviewValueFor(field)}
                      status={status}
                      onApprove={
                        onApproveQuestionnaireField
                          ? async () => {
                              if (
                                approveDisabled ||
                                pendingApprovalKey ||
                                pendingSectionId
                              ) {
                                return;
                              }
                              setPendingApprovalKey(approvalKey);
                              try {
                                await onApproveQuestionnaireField({
                                  applicantId: applicant.id,
                                  fieldId: field.id,
                                  sectionId: section.id,
                                });
                              } finally {
                                setPendingApprovalKey("");
                              }
                            }
                          : undefined
                      }
                      onRemark={() =>
                        onAddRemark(
                          field.label,
                          applicant.fullName,
                          undefined,
                          applicant.id,
                        )
                      }
                    />
                  );
                })}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}

function MediaTab({
  onAddRemark,
  onVerifyDocument,
  reviewTarget,
  submission,
}: {
  onAddRemark: AdminReviewDrawerProps["onAddRemark"];
  onVerifyDocument: AdminReviewDrawerProps["onVerifyDocument"];
  reviewTarget: ReviewTargetRequest | null;
  submission: Submission | null;
}) {
  const prefersReducedMotion = useExperienceReducedMotion();
  useEffect(() => {
    const issue = reviewTarget?.issue;
    if (!issue || !issueTargetsFile(issue)) {
      return;
    }

    const targetFile = submission?.files.find(
      (file) =>
        file.applicantId === issue.target.applicantId &&
        (!issue.target.fileType || file.type === issue.target.fileType),
    );
    if (!targetFile) {
      return;
    }

    const animationFrame = window.requestAnimationFrame(() => {
      focusReviewTarget(
        document.getElementById(fileDomId(targetFile.id)),
        prefersReducedMotion,
      );
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [prefersReducedMotion, reviewTarget, submission]);

  if (!submission) {
    return (
      <EmptyTabState
        title="Файлы не загружены"
        copy="Нет выбранной заявки для просмотра медиа."
      />
    );
  }

  if (!submission.files.length) {
    return (
      <EmptyTabState
        title="Файлов пока нет"
        copy="Загруженные документы появятся здесь и будут доступны для статусов и замечаний."
      />
    );
  }

  return (
    <div className="admin-review-files-tab">
      {submission.files.map((file) => {
        const applicant = submission.applicants.find(
          (item) => item.id === file.applicantId,
        );
        return (
          <article
            key={file.id}
            className="admin-review-file-row"
            data-file-status={file.status}
            id={fileDomId(file.id)}
            tabIndex={-1}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="admin-review-file-title text-[13px] font-semibold text-white">
                  {fileTypeLabels[file.type]}
                </span>
                <span className="admin-review-file-applicant rounded-full border border-white/10 bg-white/[0.045] px-2 py-0.5 text-[10px] font-medium text-white/50">
                  {applicant?.fullName ?? file.applicantId}
                </span>
              </div>
              <p className="admin-review-file-name m-0 mt-1 truncate text-[12px] text-white/45">
                {file.generatedFileName ??
                  file.originalFileName ??
                  file.storagePath ??
                  file.id}
              </p>
            </div>
            <div className="admin-review-file-actions">
              <span
                className={`admin-review-file-status text-[12px] font-semibold ${fileStatusTone(file)}`}
              >
                {fileStatusLabels[file.status]}
              </span>
              {file.type === "passport_scan" && file.status !== "missing" && (
                <button
                  aria-label={`Сверить паспорт: ${applicant?.fullName ?? "заявитель"}`}
                  className="linear-product-action linear-product-action--outline linear-product-action--compact admin-review-file-verify"
                  data-testid="admin-review-verify-passport"
                  title="Открыть сверку паспорта"
                  type="button"
                  onClick={() => onVerifyDocument(applicant?.id ?? file.applicantId)}
                >
                  <ScanText aria-hidden="true" />
                  <span>Сверить</span>
                </button>
              )}
              <button
                aria-label={`Добавить замечание: ${fileTypeLabels[file.type]} — ${applicant?.fullName ?? "заявитель"}`}
                className="linear-product-action linear-product-action--outline linear-product-action--compact admin-review-file-remark flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] border border-transparent bg-white/[0.045] px-3 text-[12px] font-medium text-white/62 outline-none transition-colors hover:border-white/10 hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-[#6f64ff]/60"
                data-testid="admin-review-add-file-remark"
                title="Добавить замечание к файлу"
                type="button"
                onClick={() =>
                  onAddRemark(
                    fileTypeLabels[file.type],
                    applicant?.fullName,
                    file.type,
                    file.applicantId,
                  )
                }
              >
                <MessageSquarePlus className="h-4 w-4" />
                <span>Замечание</span>
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function IssuesTab({
  submission,
  primaryAction,
  onOpenIssue,
}: {
  submission: Submission | null;
  primaryAction: ActionDecision | null;
  onOpenIssue: (issue: Issue) => void;
}) {
  if (!submission) {
    return (
      <EmptyTabState
        title="Замечания не загружены"
        copy="Выберите заявку, чтобы увидеть замечания по анкете и файлам."
      />
    );
  }

  const issues = unresolvedIssues(submission);
  if (!issues.length) {
    const packageBlocked = Boolean(primaryAction?.disabled);

    return (
      <EmptyTabState
        title={
          packageBlocked ? "Замечаний нет, но пакет ещё не готов" : "Замечаний нет"
        }
        copy={
          primaryAction?.disabled && primaryAction.reason
            ? primaryAction.reason
            : "Открытых замечаний нет. Следующее допустимое действие указано внизу панели."
        }
        tone={packageBlocked ? "neutral" : "success"}
      />
    );
  }

  return (
    <div className="admin-review-issues-list">
      {issues.map((issue) => (
        <article key={issue.id} className="admin-review-issue-card">
          <button
            aria-label={`Открыть замечание: ${issue.reason}`}
            className="linear-product-action linear-product-action--ghost admin-review-issue-open"
            onClick={() => onOpenIssue(issue)}
            type="button"
          >
            <span className="admin-review-issue-badges">
              <span
                className={`admin-review-issue-severity is-${issue.severity} rounded-full border border-white/10 bg-white/[0.045] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/62`}
              >
                {issueSeverityLabel(issue)}
              </span>
              <span
                className={`admin-review-issue-status is-${issue.status} rounded-full border border-white/10 bg-white/[0.045] px-2 py-1 text-[10px] font-medium text-white/50`}
              >
                {issueStatusLabel(issue)}
              </span>
            </span>
            <strong>{issue.reason}</strong>
            <span>{issue.comment}</span>
            <small>
              {issue.target.applicantName} ·{" "}
              {issue.target.field ??
                issue.target.section ??
                issue.target.fileType ??
                issue.type}
            </small>
            <span className="admin-review-issue-open-hint">
              Открыть место проверки <ChevronRight aria-hidden="true" />
            </span>
          </button>
        </article>
      ))}
    </div>
  );
}

function HistoryTab({ submission }: { submission: Submission | null }) {
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  if (!submission) {
    return <EmptyTabState title="История не загружена" copy="Нет выбранной заявки." />;
  }

  if (!submission.history.length) {
    return (
      <EmptyTabState
        title="История пока пуста"
        copy="Здесь появятся действия по заявке после первого сохранённого шага."
      />
    );
  }

  return (
    <div className="admin-review-history-tab">
      {submission.history.map((item) => {
        const detail = historyDetailForUser(item);
        const isExpanded = expandedEventId === item.id;
        const summary = (
          <>
            <span>{historyTimestampForUser(item.at)}</span>
            <div>
              <strong>{item.text}</strong>
              {isExpanded && detail ? <p>{detail}</p> : null}
            </div>
          </>
        );
        return (
          <article
            key={item.id}
            className={`admin-review-history-item ${isExpanded ? "is-expanded" : ""}`}
          >
            {detail ? (
              <button
                aria-expanded={isExpanded}
                className="w-full text-left"
                onClick={() => setExpandedEventId(isExpanded ? null : item.id)}
                type="button"
              >
                {summary}
                <ChevronDown aria-hidden="true" className="h-4 w-4 text-white/45" />
              </button>
            ) : (
              <div className="admin-review-history-summary">{summary}</div>
            )}
          </article>
        );
      })}
    </div>
  );
}

export function AdminReviewDrawer({
  isOpen,
  onClose,
  submissionId,
  submission = null,
  returnFocusTarget,
  onVerifyDocument,
  onAddRemark,
  onApproveQuestionnaireField,
  onPrimaryAction,
  onOpenExport,
  canPublishReturnedPdfHandoff = false,
  returnedPdfHandoffReason = "Передача доступна после exported, валидного PDF-пакета и закрытых PDF-замечаний.",
  onPublishReturnedPdfHandoff,
}: AdminReviewDrawerProps) {
  const bridge = useVisaflowBusinessBridge();
  const drawerRef = useRef<HTMLDivElement>(null);
  const tabListRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("applicants");
  const [selectedApplicantId, setSelectedApplicantId] = useState("");
  const [reviewTarget, setReviewTarget] = useState<ReviewTargetRequest | null>(null);
  const activeSubmissionId = submission?.id ?? submissionId;
  const primaryAction = useMemo(
    () => (submission ? getPrimaryAction(submission, "admin", "review") : null),
    [submission],
  );
  const adminReviewActions = useMemo(
    () => (submission ? getAdminReviewActions(submission) : null),
    [submission],
  );
  const hasOpenReviewIssues = unresolvedIssues(submission).some(
    (issue) => issue.status === "open",
  );
  const footerReviewAction = adminReviewActions
    ? hasOpenReviewIssues
      ? adminReviewActions.returnForCorrection
      : adminReviewActions.acceptForExport
    : null;
  const isReturnReviewAction =
    footerReviewAction?.action === "return_with_issues" ||
    footerReviewAction?.action === "return_again";
  const primaryButtonLabel =
    primaryAction?.action === "generate_export"
      ? "Перейти к выгрузке"
      : (primaryAction?.label ?? "Завершить проверку");
  const primaryDisabled =
    !activeSubmissionId ||
    !primaryAction ||
    primaryAction.disabled ||
    primaryAction.action === "open_history";
  const reviewActionBlockerReason =
    !hasOpenReviewIssues &&
    adminReviewActions?.acceptForExport.disabled &&
    adminReviewActions.acceptForExport.reason
      ? adminReviewActions.acceptForExport.reason
      : undefined;
  const primaryReason =
    reviewActionBlockerReason ??
    (primaryAction?.disabled && primaryAction.reason
      ? primaryAction.reason
      : primaryAction?.action === "open_history"
        ? "Для этой заявки нет действия проверки."
        : undefined);
  const currentStatusTone = submission
    ? submissionStatusTone[submission.status]
    : "muted";

  useEffect(() => {
    if (!submission?.applicants.length) {
      setSelectedApplicantId("");
      return;
    }

    setSelectedApplicantId((current) =>
      submission.applicants.some((applicant) => applicant.id === current)
        ? current
        : submission.applicants[0].id,
    );
  }, [submission]);

  useEffect(() => {
    if (!isOpen) return;

    returnFocusRef.current =
      returnFocusTarget && document.contains(returnFocusTarget)
        ? returnFocusTarget
        : document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
    const animationFrame = window.requestAnimationFrame(() => {
      drawerRef.current
        ?.querySelector<HTMLElement>("[data-admin-review-initial-focus]")
        ?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [isOpen, returnFocusTarget]);

  useEffect(() => {
    if (isOpen) return;

    const trigger = returnFocusRef.current;
    if (!trigger || !document.contains(trigger)) return;
    const animationFrame = window.requestAnimationFrame(() => {
      trigger.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen || document.querySelector(".v19-remark-form-dialog[role='dialog']")) {
        return;
      }

      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const root = drawerRef.current;
      if (!root) return;
      const controls = Array.from(
        root.querySelectorAll<HTMLElement>(focusableDrawerControlSelector),
      ).filter((control) => control.getClientRects().length > 0);
      if (!controls.length) return;

      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      setActiveTab("applicants");
      setReviewTarget(null);
      const animationFrame = window.requestAnimationFrame(() => {
        tabListRef.current
          ?.querySelector<HTMLElement>("[role='tab'][aria-selected='true']")
          ?.scrollIntoView?.({ block: "nearest", inline: "center" });
      });
      return () => window.cancelAnimationFrame(animationFrame);
    }
    return undefined;
  }, [isOpen, activeSubmissionId]);

  const tabs = useMemo<DrawerTabDefinition[]>(
    () => [
      {
        id: "applicants" as const,
        label: "Заявители",
        icon: UsersRound,
        count: submission?.applicants.length,
      },
      {
        id: "questionnaire" as const,
        label: "Анкета",
        icon: ClipboardPenLine,
        count: submission?.applicants
          .flatMap((applicant) =>
            applicant.sections.flatMap((section) => section.fields),
          )
          .filter((field) => hasReviewValue(field.value)).length,
      },
    ],
    [submission],
  );

  const handlePublishReturnedPdfHandoff = () => {
    if (!activeSubmissionId || !canPublishReturnedPdfHandoff) return;
    void onPublishReturnedPdfHandoff?.(activeSubmissionId);
    void bridge.onPublishReturnedPdfHandoff?.(activeSubmissionId);
    emitVisaflowUiEvent(bridge, {
      type: "returned-pdf-handoff.publish",
      submissionId: activeSubmissionId,
    });
  };

  const handleAdminAction = (actionDecision: ActionDecision | null) => {
    if (
      !activeSubmissionId ||
      !actionDecision ||
      actionDecision.disabled ||
      actionDecision.action === "open_history"
    )
      return;

    if (actionDecision.action === "generate_export") {
      onOpenExport?.();
      return;
    }

    void onPrimaryAction?.(activeSubmissionId, actionDecision.action);
  };

  const handlePrimaryAction = () => handleAdminAction(primaryAction);

  const reviewActionControl = canPublishReturnedPdfHandoff ? (
    <button
      className="linear-product-action linear-product-action--secondary admin-review-secondary"
      onClick={handlePublishReturnedPdfHandoff}
      title={returnedPdfHandoffReason}
      type="button"
    >
      Передать PDF агенту
    </button>
  ) : footerReviewAction ? (
    <button
      aria-describedby={primaryReason ? primaryActionReasonId : undefined}
      className={`linear-product-action ${
        isReturnReviewAction
          ? "linear-product-action--warning"
          : "linear-product-action--primary"
      } admin-review-primary${isReturnReviewAction ? " is-return" : ""}`}
      disabled={footerReviewAction.disabled}
      onClick={() => handleAdminAction(footerReviewAction)}
      title={footerReviewAction.reason}
      type="button"
    >
      {isReturnReviewAction ? (
        <AlertCircle aria-hidden="true" />
      ) : (
        <CheckCircle2 aria-hidden="true" />
      )}
      <span>{footerReviewAction.label}</span>
    </button>
  ) : (
    <button
      aria-describedby={primaryReason ? primaryActionReasonId : undefined}
      className="linear-product-action linear-product-action--primary admin-review-primary"
      disabled={primaryDisabled}
      onClick={handlePrimaryAction}
      title={primaryReason}
      type="button"
    >
      {primaryAction?.action === "generate_export" ? (
        <DownloadCloud aria-hidden="true" />
      ) : (
        <CheckCircle2 aria-hidden="true" />
      )}
      <span>{primaryButtonLabel}</span>
    </button>
  );

  const handleOpenIssue = (issue: Issue) => {
    setSelectedApplicantId(issue.target.applicantId);
    setReviewTarget((current) => ({
      issue,
      requestId: (current?.requestId ?? 0) + 1,
    }));
    setActiveTab(issueTargetsFile(issue) ? "applicants" : "questionnaire");
  };

  const selectTab = (tab: TabId) => {
    setActiveTab(tab);
    window.requestAnimationFrame(() => {
      tabListRef.current
        ?.querySelector<HTMLElement>("[role='tab'][aria-selected='true']")
        ?.scrollIntoView?.({ block: "nearest", inline: "center" });
      const drawer = drawerRef.current;
      if (!drawer) return;
      if (typeof drawer.scrollTo === "function") {
        drawer.scrollTo({ left: 0 });
        return;
      }
      drawer.scrollLeft = 0;
    });
  };

  const handleTabKeyDown = (
    event: ReactKeyboardEvent<HTMLButtonElement>,
    currentTab: TabId,
  ) => {
    const currentIndex = tabs.findIndex((tab) => tab.id === currentTab);
    if (currentIndex < 0) return;

    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabs.length;
    else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabs.length - 1;
    else return;

    event.preventDefault();
    const nextTab = tabs[nextIndex]?.id;
    if (!nextTab) return;
    selectTab(nextTab);
    window.requestAnimationFrame(() => {
      document.getElementById(drawerTabId(nextTab))?.focus({ preventScroll: true });
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="admin-review-backdrop fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            aria-hidden="true"
            onClick={onClose}
          />

          <motion.div
            ref={drawerRef}
            role="dialog"
            aria-labelledby={drawerHeadingId}
            aria-modal="true"
            tabIndex={-1}
            initial={{ x: "100%", opacity: 0.5, filter: "blur(8px)" }}
            animate={{ x: 0, opacity: 1, filter: "blur(0px)" }}
            exit={{ x: "100%", opacity: 0, filter: "blur(4px)" }}
            transition={{
              type: "spring",
              damping: 26,
              stiffness: 220,
              mass: 1,
            }}
            className="admin-review-drawer fixed inset-x-0 bottom-0 top-12 z-50 flex flex-col overflow-hidden rounded-t-[28px] border-x border-t border-white/10 bg-[#111113] shadow-[0_24px_80px_rgba(0,0,0,0.6)] lg:inset-y-2 lg:right-2 lg:left-auto lg:w-[860px] lg:rounded-2xl lg:border"
            data-admin-review-drawer-surface="workspace"
          >
            <header className="admin-review-drawer-header z-20 shrink-0 border-b border-white/5 bg-[#111113]/90 px-5 pb-0 pt-5 backdrop-blur-md lg:px-8">
              <div className="admin-review-titlebar mb-5 flex items-start justify-between gap-4">
                <div className="admin-review-titlecopy min-w-0">
                  <div className="admin-review-titlemeta">
                    <code>{activeSubmissionId ?? "Заявка не выбрана"}</code>
                    <span aria-hidden="true">·</span>
                    <span>
                      {submission?.type === "family"
                        ? "Семейная подача"
                        : "Одиночная подача"}
                    </span>
                  </div>
                  <h2 className="flex items-center gap-3 text-[20px] font-semibold leading-tight tracking-tight text-white lg:text-[24px]">
                    <span id={drawerHeadingId} className="admin-review-drawer-heading">
                      Проверка пакета
                    </span>
                    <span
                      aria-label={
                        submission ? statusLabelFor(submission.status) : "Не выбрана"
                      }
                      className={`admin-review-status-pill is-${currentStatusTone} rounded-full border border-white/10 bg-white/[0.045] px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-white/62`}
                    >
                      <i
                        className={`admin-review-status-dot is-${currentStatusTone}`}
                        aria-hidden="true"
                      />
                      {submission ? statusLabelFor(submission.status) : "Не выбрана"}
                    </span>
                  </h2>
                </div>

                <div className="admin-review-header-actions">
                  <button
                    aria-label="Закрыть проверку"
                    className="linear-product-action linear-product-action--icon linear-product-action--ghost admin-review-close"
                    data-admin-review-initial-focus
                    onClick={onClose}
                    type="button"
                  >
                    <X aria-hidden="true" />
                  </button>
                </div>
                {primaryReason ? (
                  <span className="sr-only" id={primaryActionReasonId} role="status">
                    {primaryReason}
                  </span>
                ) : null}
              </div>

              <div
                aria-label="Разделы проверки"
                className="admin-review-tabs relative -mx-5 w-full overflow-visible px-5 lg:mx-0 lg:px-0"
                ref={tabListRef}
                role="tablist"
              >
                <div className="mb-[-1px] flex min-w-0 w-full items-center gap-1.5">
                  {tabs.map((tab) => (
                    <button
                      aria-controls={drawerPanelId(tab.id)}
                      aria-selected={activeTab === tab.id}
                      id={drawerTabId(tab.id)}
                      key={tab.id}
                      role="tab"
                      tabIndex={activeTab === tab.id ? 0 : -1}
                      type="button"
                      onClick={() => selectTab(tab.id)}
                      onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
                      className={`relative flex min-h-[44px] items-center gap-2 whitespace-nowrap px-4 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#3a45b4]
                        ${activeTab === tab.id ? "is-active text-white" : "text-white/50 hover:text-white/80"}
                      `}
                    >
                      <tab.icon
                        className={`h-4 w-4 ${activeTab === tab.id ? (tab.isWarning ? "text-white/62" : "text-[#b8baff]") : "opacity-70"}`}
                      />
                      <span>{tab.label}</span>
                      {typeof tab.count === "number" && tab.count > 0 && (
                        <em
                          className={`admin-review-tab-count ml-1 rounded-md px-1.5 py-0.5 text-[10px] leading-none ${tab.isWarning ? "is-warning bg-white/[0.06] text-white/62" : "bg-white/10 text-white/70"}`}
                        >
                          {tab.count}
                        </em>
                      )}
                      {activeTab === tab.id && (
                        <motion.i
                          layoutId="adminActiveTab"
                          className="absolute inset-x-0 bottom-0 h-0.5 bg-[#6f64ff]"
                          initial={false}
                          transition={{
                            type: "spring",
                            bounce: 0.2,
                            duration: 0.5,
                          }}
                        />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </header>

            <div className="admin-review-content scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10 flex-1 overflow-x-hidden overflow-y-auto p-5 lg:p-8">
              <AnimatePresence mode="wait">
                <motion.div
                  aria-labelledby={drawerTabId(activeTab)}
                  key={activeTab}
                  id={drawerPanelId(activeTab)}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  role="tabpanel"
                  tabIndex={0}
                  transition={{ duration: 0.2 }}
                >
                  {activeTab === "applicants" && (
                    <ApplicantsTab
                      onAddRemark={onAddRemark}
                      onOpenIssue={handleOpenIssue}
                      onSelectedApplicantIdChange={setSelectedApplicantId}
                      onVerifyDocument={onVerifyDocument}
                      primaryAction={primaryAction}
                      reviewTarget={reviewTarget}
                      selectedApplicantId={selectedApplicantId}
                      submission={submission}
                    />
                  )}
                  {activeTab === "questionnaire" && (
                    <QuestionnaireTab
                      onSelectedApplicantIdChange={setSelectedApplicantId}
                      reviewTarget={reviewTarget}
                      selectedApplicantId={selectedApplicantId}
                      submission={submission}
                      onAddRemark={onAddRemark}
                      onApproveQuestionnaireField={onApproveQuestionnaireField}
                    />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            <footer className="admin-review-footer">
              <p className="admin-review-primary-reason">
                {primaryReason ? (
                  <>
                    <AlertCircle aria-hidden="true" />
                    <span>
                      <strong>Что блокирует решение:</strong> {primaryReason}
                    </span>
                  </>
                ) : (
                  <>
                    <CheckCircle2 aria-hidden="true" />
                    <span>Пакет готов к следующему действию.</span>
                  </>
                )}
              </p>
              <div className="admin-review-footer-actions">{reviewActionControl}</div>
            </footer>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
