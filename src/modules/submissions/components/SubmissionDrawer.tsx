import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Badge,
  Button,
  CardComponent,
  DrawerTabs,
  Select,
  SheetFrame,
  TextInputField,
} from "../../../shared/ui/primitives";
import {
  fileTypeLabels,
  canAddAdminIssue,
  canEditSubmissionContent,
  getPrimaryAction,
  nextProblem,
  openIssueCount,
  blockerCount,
  fixedIssueCount,
  statusTone,
  statusLabels,
  typeLabels,
} from "../status";
import { applicantCountLabel, tripDates } from "../selectors";
import {
  questionnaireProblemCount,
  questionnaireProgressForApplicant,
} from "../questionnaire";
import {
  canStartPassportExtraction,
  passportExtractionRows,
  type PassportFieldApplyMode,
} from "../passportExtraction";
import {
  visaApplicationPdfAgentHandoffStatus,
  visaApplicationPdfReviewsForSubmission,
} from "../visaApplicationPdfReconciliation";
import {
  buildAgentHandoffPackage,
  buildAgentReturnedPdfPackageView,
} from "../operationalWorkflow";
import { agentOwnerDisplayName } from "../ownership";
import {
  activeMediaFileTypes,
  buildReadinessQueue,
  fileLabel,
  fileStatusLabel,
  firstActionableQueueItem,
  tabForTarget,
  targetElementId,
  targetForIssue,
  workspaceTabs,
  type WorkspaceTarget,
} from "../workspaceModel";
import type {
  ActionDecision,
  AgentOwnerId,
  Applicant,
  DrawerTab,
  Issue,
  IssueSeverity,
  IssueInput,
  PassportExtractedFieldKey,
  QuestionnaireField,
  QuestionnaireSection,
  QuestionnaireStatus,
  Role,
  Submission,
  SubmissionAction,
  SubmissionFileStatus,
  SubmissionFileType,
} from "../types";
import { EmptyState } from "./Primitives";
import { BbAiPanel } from "./BbAiPanel";

type ReviewRemarkContext = {
  applicantId?: string;
  category?: string;
  comment: string;
  description: string;
  field?: string;
  fileType?: SubmissionFileType;
  reason: string;
  section?: string;
  severity?: IssueSeverity;
  title: string;
  type: IssueInput["type"];
};

export function SubmissionDrawer({
  actionError = "",
  activeTab,
  agentOwnerId,
  fileUploadBusy = false,
  initialTarget = null,
  issueComposerRequest,
  localPassportFileIds = [],
  onAction,
  onAddIssue,
  onAcceptAiSuggestion,
  onIssueComposerConsumed,
  onClose,
  onDismissAiSuggestion,
  onMarkIssueFixed,
  onTab,
  onRunAiReview,
  onQuestionnaireField,
  onApplyPassportField,
  onExtractPassport,
  onConfirmVisaApplicationPdfReview,
  onDismissVisaApplicationPdfReview,
  onPublishReturnedPdfHandoff,
  onReviewVisaApplicationPdf,
  onUploadFile,
  passportExtractionEnabled = false,
  requireSelectedFile,
  role,
  submission,
  surface,
}: {
  actionError?: string;
  activeTab: DrawerTab;
  agentOwnerId?: AgentOwnerId;
  fileUploadBusy?: boolean;
  initialTarget?: WorkspaceTarget | null;
  issueComposerRequest: { submissionId: string; token: number } | null;
  localPassportFileIds?: string[];
  onAction: (action: SubmissionAction) => void;
  onAddIssue: (input: IssueInput) => void;
  onIssueComposerConsumed: () => void;
  onAcceptAiSuggestion: (suggestionId: string) => void;
  onClose: () => void;
  onDismissAiSuggestion: (suggestionId: string) => void;
  onMarkIssueFixed: (issueId: string) => void;
  onRunAiReview: () => void;
  onQuestionnaireField: (input: {
    applicantId: string;
    sectionId: string;
    fieldId: QuestionnaireField["id"];
    value: string;
  }) => void;
  onApplyPassportField: (
    applicantId: string,
    key: PassportExtractedFieldKey,
    mode: PassportFieldApplyMode,
  ) => void;
  onExtractPassport: (fileId: string) => void;
  onConfirmVisaApplicationPdfReview: (reviewId: string) => void;
  onDismissVisaApplicationPdfReview: (reviewId: string) => void;
  onPublishReturnedPdfHandoff: () => Promise<void>;
  onReviewVisaApplicationPdf: (file: File) => Promise<void>;
  onTab: (tab: DrawerTab) => void;
  onUploadFile: (fileId: string, file?: File) => void;
  passportExtractionEnabled?: boolean;
  requireSelectedFile?: boolean;
  role: Role;
  submission: Submission;
  surface: "agent" | "review" | "export";
}) {
  const primaryAction = getPrimaryAction(submission, role, surface);
  const [issueComposerOpen, setIssueComposerOpen] = useState(false);
  const [issueComposerContext, setIssueComposerContext] =
    useState<ReviewRemarkContext | null>(null);
  const [selectedReviewApplicantId, setSelectedReviewApplicantId] = useState(
    submission.applicants[0]?.id ?? "",
  );
  const [pendingTarget, setPendingTarget] = useState<WorkspaceTarget | null>(null);
  const drawerBodyRef = useRef<HTMLDivElement | null>(null);
  const tabNavigationModeRef = useRef<"manual" | "target">("manual");
  const canOpenIssueComposer =
    surface === "review" && canAddAdminIssue(submission, role);
  const contentCanBeEdited = canEditSubmissionContent(submission, role);
  const closeIssueComposer = useCallback(() => {
    setIssueComposerOpen(false);
    setIssueComposerContext(null);
  }, []);
  const footerHint =
    (primaryAction.action === "open_history" && primaryAction.disabled
      ? undefined
      : primaryAction.reason) ??
    (contentCanBeEdited
      ? "Изменения сохраняются внутри подачи"
      : "Проверьте данные и выберите действие по подаче");
  const firstReviewApplicantId = submission.applicants[0]?.id ?? "";
  useEffect(() => {
    closeIssueComposer();
    setSelectedReviewApplicantId(firstReviewApplicantId);
  }, [closeIssueComposer, firstReviewApplicantId, submission.id]);

  const selectedReviewApplicant =
    submission.applicants.find(
      (applicant) => applicant.id === selectedReviewApplicantId,
    ) ??
    submission.applicants[0] ??
    null;
  const visibleActiveTab =
    surface === "review" ? adminReviewVisibleTab(activeTab) : activeTab;

  useEffect(() => {
    if (canOpenIssueComposer && issueComposerRequest?.submissionId === submission.id) {
      setIssueComposerContext(null);
      setIssueComposerOpen(true);
      onIssueComposerConsumed();
    }
  }, [
    canOpenIssueComposer,
    issueComposerRequest,
    onIssueComposerConsumed,
    submission.id,
  ]);

  useEffect(() => {
    if (!canOpenIssueComposer) closeIssueComposer();
  }, [canOpenIssueComposer, closeIssueComposer]);

  useLayoutEffect(() => {
    if (tabNavigationModeRef.current === "target") return;
    drawerBodyRef.current?.scrollTo({ behavior: "auto", top: 0 });
  }, [activeTab, submission.id]);

  useLayoutEffect(() => {
    if (
      !pendingTarget ||
      drawerTabForWorkspaceTarget(pendingTarget, surface) !== visibleActiveTab
    )
      return;

    const targetRequest = pendingTarget;
    let cancelled = false;
    let attempts = 0;

    function focusPendingTarget() {
      if (cancelled) return;

      const target = document.getElementById(targetElementId(targetRequest));
      const drawerBody = target?.closest<HTMLElement>(".drawer-body");
      if (!target || !drawerBody) {
        attempts += 1;
        if (attempts <= 4) {
          window.requestAnimationFrame(focusPendingTarget);
          return;
        }
        setPendingTarget(null);
        tabNavigationModeRef.current = "manual";
        return;
      }

      const targetRect = target.getBoundingClientRect();
      const bodyRect = drawerBody.getBoundingClientRect();
      drawerBody.scrollTo({
        behavior: "auto",
        top: Math.max(drawerBody.scrollTop + targetRect.top - bodyRect.top - 14, 0),
      });
      target.focus({ preventScroll: true });
      setPendingTarget(null);
      tabNavigationModeRef.current = "manual";
    }

    window.requestAnimationFrame(focusPendingTarget);

    return () => {
      cancelled = true;
    };
  }, [pendingTarget, surface, visibleActiveTab]);

  function openTarget(target: WorkspaceTarget) {
    tabNavigationModeRef.current = "target";
    if (surface === "review" && "applicantId" in target) {
      setSelectedReviewApplicantId(target.applicantId);
    }
    onTab(drawerTabForWorkspaceTarget(target, surface));
    setPendingTarget(target);
  }

  useEffect(() => {
    if (!initialTarget) return;
    tabNavigationModeRef.current = "target";
    if (surface === "review" && "applicantId" in initialTarget) {
      setSelectedReviewApplicantId(initialTarget.applicantId);
    }
    onTab(drawerTabForWorkspaceTarget(initialTarget, surface));
    setPendingTarget(initialTarget);
  }, [initialTarget, onTab, surface]);

  function handleTabChange(tab: DrawerTab) {
    tabNavigationModeRef.current = "manual";
    onTab(tab);
  }

  function openFirstProblem() {
    const first = firstActionableQueueItem(submission);
    if (first) openTarget(first.target);
  }

  function openIssueComposer(context?: ReviewRemarkContext) {
    if (!canOpenIssueComposer) return;
    setIssueComposerContext(context ?? null);
    setIssueComposerOpen(true);
  }

  const drawerTabs =
    surface === "review"
      ? adminReviewTabs(submission, selectedReviewApplicant)
      : workspaceTabs.map((tab) => ({
          ...tab,
          label: drawerTabLabel(tab.id, tab.label),
          meta: drawerTabValue(submission, tab.id),
        }));

  return (
    <SheetFrame
      className={`submission-drawer submission-detail-drawer ${
        surface === "review" ? "is-admin-review-drawer" : ""
      } ${visibleActiveTab === "overview" ? "is-overview-tab" : ""} ${
        visibleActiveTab === "applicants" ? "is-selfie-tab" : ""
      }`}
      labelledBy="drawer-title"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        if (issueComposerOpen) {
          closeIssueComposer();
          return;
        }
        onClose();
      }}
    >
      {surface === "review" ? (
        <AdminReviewTopBar
          applicant={selectedReviewApplicant}
          onClose={onClose}
          submission={submission}
        />
      ) : (
        <header className="drawer-header">
          <div className="drawer-title-block">
            <h2 id="drawer-title">{submission.title}</h2>
            <p className="drawer-meta-line">{drawerHeaderMeta(submission)}</p>
            <div className="drawer-chips" aria-label="Состояние подачи">
              <Badge className={`drawer-status-chip ${statusTone[submission.status]}`}>
                {statusLabels[submission.status]}
                {blockerCount(submission)
                  ? ` · ${blockerCountLabel(blockerCount(submission))}`
                  : ""}
              </Badge>
              <span className="drawer-readiness-chip">
                {submission.completeness.total}% готово
              </span>
            </div>
          </div>
          <div className="drawer-header-actions" aria-label="Действия панели">
            <button
              className="icon-button"
              type="button"
              aria-label="Дополнительные действия недоступны"
              disabled
            >
              ···
            </button>
            <button
              className="icon-button"
              type="button"
              aria-label="Закрыть подачу"
              onClick={onClose}
            >
              ×
            </button>
          </div>
        </header>
      )}

      <DrawerTabs
        ariaLabel={surface === "review" ? "Разделы проверки" : "Разделы подачи"}
        autoFocusOnValueChange={tabNavigationModeRef.current !== "target"}
        tabs={drawerTabs}
        value={visibleActiveTab}
        onValueChange={handleTabChange}
      />

      <div
        className="drawer-body workspace-drawer-body"
        id={`drawer-panel-${visibleActiveTab}`}
        ref={drawerBodyRef}
        role="tabpanel"
        aria-labelledby={`drawer-tab-${visibleActiveTab}`}
      >
        {surface === "review" && submission.applicants.length > 1 ? (
          <AdminReviewApplicantStrip
            selectedApplicantId={selectedReviewApplicant?.id ?? ""}
            submission={submission}
            onSelect={setSelectedReviewApplicantId}
          />
        ) : null}
        <div className="workspace-main">
          {visibleActiveTab === "overview" ? (
            surface === "review" ? (
              <AdminPassportReview
                canAddIssue={canOpenIssueComposer}
                fileUploadBusy={fileUploadBusy}
                applicant={selectedReviewApplicant}
                onAddRemark={openIssueComposer}
                onClose={onClose}
                onConfirmVisaApplicationPdfReview={onConfirmVisaApplicationPdfReview}
                onDismissVisaApplicationPdfReview={onDismissVisaApplicationPdfReview}
                onPublishReturnedPdfHandoff={onPublishReturnedPdfHandoff}
                onReviewVisaApplicationPdf={onReviewVisaApplicationPdf}
                submission={submission}
              />
            ) : (
              <DrawerOverview
                onOpenHistory={() => handleTabChange("history")}
                onOpenTarget={openTarget}
                primaryAction={primaryAction}
                surface={surface}
                submission={submission}
              />
            )
          ) : null}
          {visibleActiveTab === "applicants" ? (
            surface === "review" ? (
              <AdminSelfieReview
                canAddIssue={canOpenIssueComposer}
                applicant={selectedReviewApplicant}
                onAddRemark={openIssueComposer}
                onClose={onClose}
                submission={submission}
              />
            ) : (
              <DrawerApplicants onOpenTarget={openTarget} submission={submission} />
            )
          ) : null}
          {visibleActiveTab === "questionnaire" ? (
            surface === "review" ? (
              <AdminQuestionnaireReview
                canAddIssue={canOpenIssueComposer}
                applicant={selectedReviewApplicant}
                onAddRemark={openIssueComposer}
                pendingTarget={pendingTarget}
                submission={submission}
              />
            ) : (
              <DrawerQuestionnaire
                onApplyPassportField={onApplyPassportField}
                onFieldChange={onQuestionnaireField}
                passportExtractionEnabled={passportExtractionEnabled}
                pendingTarget={pendingTarget}
                role={role}
                submission={submission}
              />
            )
          ) : null}
          {visibleActiveTab === "files" && surface !== "review" ? (
            <DrawerFiles
              fileUploadBusy={fileUploadBusy}
              localPassportFileIds={localPassportFileIds}
              onConfirmVisaApplicationPdfReview={onConfirmVisaApplicationPdfReview}
              onDismissVisaApplicationPdfReview={onDismissVisaApplicationPdfReview}
              onExtractPassport={onExtractPassport}
              onPublishReturnedPdfHandoff={onPublishReturnedPdfHandoff}
              onReviewVisaApplicationPdf={onReviewVisaApplicationPdf}
              onUploadFile={onUploadFile}
              agentOwnerId={agentOwnerId ?? submission.agentId}
              passportExtractionEnabled={passportExtractionEnabled}
              requireSelectedFile={requireSelectedFile}
              role={role}
              submission={submission}
            />
          ) : null}
          {visibleActiveTab === "issues" ? (
            surface === "review" ? (
              <AdminRemarksReview
                canAddIssue={canOpenIssueComposer}
                onAcceptAiSuggestion={onAcceptAiSuggestion}
                onAddRemark={openIssueComposer}
                onDismissAiSuggestion={onDismissAiSuggestion}
                onRunAiReview={onRunAiReview}
                onOpenTarget={openTarget}
                role={role}
                submission={submission}
              />
            ) : (
              <DrawerIssues
                canAddIssue={canOpenIssueComposer}
                onAcceptAiSuggestion={onAcceptAiSuggestion}
                onAddIssue={() => openIssueComposer()}
                onDismissAiSuggestion={onDismissAiSuggestion}
                onMarkIssueFixed={onMarkIssueFixed}
                onOpenTarget={openTarget}
                onRunAiReview={onRunAiReview}
                role={role}
                submission={submission}
                surface={surface}
              />
            )
          ) : null}
          {visibleActiveTab === "history" && surface !== "review" ? (
            <DrawerHistory submission={submission} />
          ) : null}
        </div>
      </div>

      {canOpenIssueComposer && issueComposerOpen ? (
        <IssueComposer
          context={issueComposerContext}
          submission={submission}
          onCancel={closeIssueComposer}
          onSubmit={(input) => {
            onAddIssue(input);
            closeIssueComposer();
          }}
        />
      ) : null}

      <footer className="drawer-footer">
        <span role={submissionActionErrorRole(actionError)}>
          {actionError ||
            (issueComposerOpen
              ? "Сначала создайте или отмените новое замечание"
              : footerHint)}
        </span>
        {!issueComposerOpen && firstActionableQueueItem(submission) ? (
          <Button
            className="drawer-footer-context-action"
            variant="secondary"
            onClick={openFirstProblem}
          >
            Открыть первый блокер
          </Button>
        ) : null}
        {surface === "review" && canOpenIssueComposer ? (
          <Button
            className="drawer-footer-context-action"
            variant="secondary"
            onClick={() => openIssueComposer(globalRemarkContext(submission))}
          >
            Замечание
          </Button>
        ) : null}
        <Button variant="ghost" onClick={onClose}>
          {surface === "review" ? "Отложить" : "Закрыть"}
        </Button>
        <Button
          danger={primaryAction.action === "return_with_issues"}
          disabled={primaryAction.disabled || issueComposerOpen}
          onClick={() => onAction(primaryAction.action)}
        >
          {primaryAction.label}
        </Button>
      </footer>
    </SheetFrame>
  );
}

function submissionActionErrorRole(actionError: string): "alert" | undefined {
  return actionError ? "alert" : undefined;
}

function AdminReviewTopBar({
  applicant,
  onClose,
  submission,
}: {
  applicant: Applicant | null;
  onClose: () => void;
  submission: Submission;
}) {
  const applicantIndex = applicant
    ? submission.applicants.findIndex((item) => item.id === applicant.id) + 1
    : 0;
  const familyProgress =
    submission.type === "family" && applicantIndex > 0
      ? `${applicantIndex}/${submission.applicants.length}`
      : null;
  const ownerAgentName = agentOwnerDisplayName(
    submission.agentId,
    submission.returnedPdfPackage?.ownerAgentName,
  );

  return (
    <header className="drawer-header admin-review-topbar">
      <div className="admin-review-topbar-main">
        <h2 id="drawer-title">{submission.title}</h2>
        <div className="admin-review-topbar-line" aria-label="Контекст проверки">
          <Badge className={`drawer-status-chip ${statusTone[submission.status]}`}>
            {statusLabels[submission.status]}
          </Badge>
          <span className="admin-review-status-snapshot">
            {submission.id} · {statusLabels[submission.status]}
          </span>
          <strong className="admin-review-owner-agent">
            Агент: {ownerAgentName}
          </strong>
          <span className="mono">{submission.id}</span>
          <span>{applicant?.fullName ?? submission.title}</span>
          {familyProgress ? <span>Семья {familyProgress}</span> : null}
        </div>
      </div>
      <button
        className="icon-button"
        type="button"
        aria-label="Закрыть подачу"
        onClick={onClose}
      >
        ×
      </button>
    </header>
  );
}

function AdminReviewApplicantStrip({
  onSelect,
  selectedApplicantId,
  submission,
}: {
  onSelect: (applicantId: string) => void;
  selectedApplicantId: string;
  submission: Submission;
}) {
  return (
    <div className="admin-review-applicant-strip" aria-label="Заявители семьи">
      {submission.applicants.map((applicant) => {
        const issues = applicantIssues(submission, applicant.id);
        const blockers = issues.filter((issue) => issue.severity === "blocker").length;
        const selected = applicant.id === selectedApplicantId;
        const visualState = applicantVisualState(submission, applicant);

        return (
          <button
            aria-pressed={selected}
            className={`admin-review-applicant-chip ${selected ? "is-active" : ""} tone-${visualState.tone}`}
            key={applicant.id}
            type="button"
            onClick={() => onSelect(applicant.id)}
          >
            <span>
              <strong>{applicant.fullName}</strong>
              <small>{applicantRoleLabel(applicant.role)}</small>
            </span>
            <Badge className="visa-tag">{visualState.label}</Badge>
            {issues.length ? (
              <em className={blockers ? "has-blocker" : ""}>
                {blockers ? `${blockers} блок.` : issueCountLabel(issues.length)}
              </em>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

type AdminReviewChecklistItem = {
  helper: string;
  label: string;
  status: "accepted" | "missing" | "unchecked" | "warning";
};

function AdminChecklistPanel({
  canAddIssue,
  items,
  onAddRemark,
  remarkContext,
  title,
}: {
  canAddIssue: boolean;
  items: AdminReviewChecklistItem[];
  onAddRemark: (context: ReviewRemarkContext) => void;
  remarkContext: (item: AdminReviewChecklistItem) => ReviewRemarkContext;
  title: string;
}) {
  return (
    <aside className="admin-checklist-panel" aria-label={`Чеклист: ${title}`}>
      <div className="admin-checklist-head">
        <p className="kicker">Проверка</p>
        <h3>{title}</h3>
      </div>
      <div className="admin-checklist-list">
        {items.map((item) => (
          <div className={`admin-checklist-item state-${item.status}`} key={item.label}>
            <span className="admin-checklist-icon" aria-hidden="true" />
            <div>
              <strong>{item.label}</strong>
              <p>{item.helper}</p>
            </div>
            <Button
              className="compact-button"
              disabled={!canAddIssue}
              variant="secondary"
              onClick={() => onAddRemark(remarkContext(item))}
            >
              Замечание
            </Button>
          </div>
        ))}
      </div>
    </aside>
  );
}

function AdminPassportReview({
  applicant,
  canAddIssue,
  fileUploadBusy = false,
  onAddRemark,
  onClose,
  onConfirmVisaApplicationPdfReview,
  onDismissVisaApplicationPdfReview,
  onPublishReturnedPdfHandoff,
  onReviewVisaApplicationPdf,
  submission,
}: {
  applicant: Applicant | null;
  canAddIssue: boolean;
  fileUploadBusy?: boolean;
  onAddRemark: (context: ReviewRemarkContext) => void;
  onClose: () => void;
  onConfirmVisaApplicationPdfReview: (reviewId: string) => void;
  onDismissVisaApplicationPdfReview: (reviewId: string) => void;
  onPublishReturnedPdfHandoff: () => Promise<void>;
  onReviewVisaApplicationPdf: (file: File) => Promise<void>;
  submission: Submission;
}) {
  if (!applicant) return <EmptyState text="Заявитель для проверки не выбран." />;

  const passportFile = reviewFileForApplicant(submission, applicant.id, "passport_scan");
  const fileIssue = fileIssueFor(submission, applicant.id, "passport_scan");
  const passportFields = questionnaireSectionByAlias(applicant, "passport");
  const personalFields = questionnaireSectionByAlias(applicant, "personal");
  const passportNumber = fieldValue(passportFields, "passport-no");
  const expiryDate = fieldValue(passportFields, "passport-expiry-date");
  const passportType = fieldValue(passportFields, "passport-type");
  const birthDate = fieldValue(personalFields, "birth-date");
  const firstName = fieldValue(personalFields, "first-name");
  const surname = fieldValue(personalFields, "surname");
  const fileReady = Boolean(
    passportFile &&
      passportFile.status !== "missing" &&
      passportFile.status !== "needs_replacement",
  );
  const checklist = [
    {
      helper: [surname, firstName].filter(Boolean).join(" ") || "ФИО не заполнено",
      label: "Имя и фамилия совпадают",
      status: fileIssue ? "warning" : firstName && surname ? "accepted" : "missing",
    },
    {
      helper: birthDate || "Дата рождения не заполнена",
      label: "Дата рождения совпадает",
      status: fileIssue ? "warning" : birthDate ? "accepted" : "missing",
    },
    {
      helper: passportNumber || "Номер не заполнен",
      label: "Номер паспорта виден",
      status: passportNumber ? "accepted" : "missing",
    },
    {
      helper: passportNumber
        ? `Анкета: ${passportNumber}`
        : "Нет значения для сравнения",
      label: "Номер паспорта совпадает с анкетой",
      status: passportNumber && !fileIssue ? "accepted" : "warning",
    },
    {
      helper: expiryDate || "Срок действия не заполнен",
      label: "Срок действия виден",
      status: expiryDate ? "accepted" : "missing",
    },
    {
      helper: expiryDate ? `До ${expiryDate}` : "Нужна ручная проверка",
      label: "Срок действия не истёк",
      status: expiryDate ? "accepted" : "warning",
    },
    {
      helper: passportType || "Тип документа не заполнен",
      label: "Страна и тип документа совпадают",
      status: passportType ? "accepted" : "missing",
    },
    {
      helper: fileReady ? fileStatusLabel(passportFile) : "Файл не готов",
      label: "MRZ и страница не обрезаны",
      status: fileIssue ? "warning" : fileReady ? "unchecked" : "missing",
    },
    {
      helper: fileReady ? fileStatusLabel(passportFile) : "Файл не готов",
      label: "Страница читаемая",
      status: fileIssue ? "warning" : fileReady ? "unchecked" : "missing",
    },
  ] satisfies AdminReviewChecklistItem[];

  return (
    <section className="drawer-section admin-review-tab admin-passport-review">
      <div className="admin-review-split">
        <article
          className="admin-document-preview"
          id={targetElementId({
            applicantId: applicant.id,
            fileType: "passport_scan",
            tab: "files",
          })}
          tabIndex={-1}
        >
          <div className="admin-document-preview-stage">
            <span aria-hidden="true">PASSPORT</span>
            <p>Превью документа недоступно в локальном окружении</p>
          </div>
          <dl className="admin-document-meta">
            <div>
              <dt>Тип</dt>
              <dd>{passportType || "Загранпаспорт"}</dd>
            </div>
            <div>
              <dt>Заявитель</dt>
              <dd>{applicant.fullName}</dd>
            </div>
            <div>
              <dt>Статус файла</dt>
              <dd>{fileStatusLabel(passportFile)}</dd>
            </div>
            <div>
              <dt>Загрузка</dt>
              <dd>{passportFile?.uploadedAt ?? "нет даты"}</dd>
            </div>
          </dl>
        </article>
        <AdminChecklistPanel
          canAddIssue={canAddIssue}
          items={checklist}
          remarkContext={(item) =>
            fileRemarkContext({
              applicant,
              fileType: "passport_scan",
              itemLabel: item.label,
              submission,
            })
          }
          title="Паспорт"
          onAddRemark={onAddRemark}
        />
      </div>
      <div className="admin-review-action-row">
        <Button
          className="compact-button"
          disabled
          title="Отдельное принятие паспорта не поддержано текущими handlers."
        >
          Принять паспорт
        </Button>
        <Button
          className="compact-button"
          disabled={!canAddIssue}
          variant="secondary"
          onClick={() =>
            onAddRemark(
              fileRemarkContext({
                applicant,
                fileType: "passport_scan",
                itemLabel: "Паспорт",
                submission,
              }),
            )
          }
        >
          Замечание
        </Button>
        <Button className="compact-button" variant="ghost" onClick={onClose}>
          Отложить
        </Button>
      </div>
      <AdminReturnedPdfHandoff
        fileUploadBusy={fileUploadBusy}
        role="admin"
        submission={submission}
        onConfirmVisaApplicationPdfReview={onConfirmVisaApplicationPdfReview}
        onDismissVisaApplicationPdfReview={onDismissVisaApplicationPdfReview}
        onPublishReturnedPdfHandoff={onPublishReturnedPdfHandoff}
        onReviewVisaApplicationPdf={onReviewVisaApplicationPdf}
      />
    </section>
  );
}

function AdminReturnedPdfHandoff({
  fileUploadBusy = false,
  onConfirmVisaApplicationPdfReview,
  onDismissVisaApplicationPdfReview,
  onPublishReturnedPdfHandoff,
  onReviewVisaApplicationPdf,
  role,
  submission,
}: {
  fileUploadBusy?: boolean;
  onConfirmVisaApplicationPdfReview: (reviewId: string) => void;
  onDismissVisaApplicationPdfReview: (reviewId: string) => void;
  onPublishReturnedPdfHandoff: () => Promise<void>;
  onReviewVisaApplicationPdf: (file: File) => Promise<void>;
  role: Role;
  submission: Submission;
}) {
  const [pdfReviewBusy, setPdfReviewBusy] = useState(false);
  const [pdfReviewError, setPdfReviewError] = useState("");
  const [pdfHandoffBusy, setPdfHandoffBusy] = useState(false);
  const [pdfHandoffMessage, setPdfHandoffMessage] = useState("");
  const pdfReviewAvailable = submission.status === "exported";
  const pdfReviews = visaApplicationPdfReviewsForSubmission(submission);
  const pdfHandoffStatus = visaApplicationPdfAgentHandoffStatus(submission);
  const agentHandoffPackage = buildAgentHandoffPackage(submission);
  const canReviewVisaPdf =
    pdfReviewAvailable &&
    !fileUploadBusy &&
    !pdfReviewBusy &&
    !pdfHandoffBusy &&
    role === "admin";
  const canPublishReturnedPdfHandoff = canReviewVisaPdf && agentHandoffPackage.ready;

  useEffect(() => {
    setPdfReviewBusy(false);
    setPdfReviewError("");
    setPdfHandoffBusy(false);
    setPdfHandoffMessage("");
  }, [submission.id]);

  if (!pdfReviewAvailable) return null;

  async function handleVisaApplicationPdf(file: File) {
    setPdfReviewBusy(true);
    setPdfReviewError("");
    setPdfHandoffMessage("");
    try {
      await onReviewVisaApplicationPdf(file);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "PDF анкеты не удалось прочитать. Проверьте файл и попробуйте снова.";
      setPdfReviewError(message);
      window.alert(message);
    } finally {
      setPdfReviewBusy(false);
    }
  }

  async function handlePublishReturnedPdfHandoff() {
    setPdfHandoffBusy(true);
    setPdfReviewError("");
    setPdfHandoffMessage("");
    try {
      await onPublishReturnedPdfHandoff();
      setPdfHandoffMessage("Комплект PDF опубликован агенту.");
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Комплект PDF не удалось открыть агенту.";
      setPdfReviewError(message);
    } finally {
      setPdfHandoffBusy(false);
    }
  }

  return (
    <section className="admin-review-technical" aria-label="Техническое">
      <div className="admin-review-technical-head">
        <span>Техническое</span>
        <strong>Returned PDF handoff</strong>
      </div>
      <VisaApplicationPdfReviewPanel
        busy={pdfReviewBusy || pdfHandoffBusy}
        canPublish={canPublishReturnedPdfHandoff}
        canUpload={canReviewVisaPdf}
        error={pdfReviewError}
        handoffBlockers={agentHandoffPackage.blockers}
        handoffMessage={pdfHandoffMessage}
        handoffStatus={pdfHandoffStatus}
        applicants={submission.applicants}
        reviews={pdfReviews}
        submissionId={submission.id}
        onConfirm={onConfirmVisaApplicationPdfReview}
        onDismiss={onDismissVisaApplicationPdfReview}
        onPublish={handlePublishReturnedPdfHandoff}
        onReview={handleVisaApplicationPdf}
      />
    </section>
  );
}

function AdminSelfieReview({
  applicant,
  canAddIssue,
  onAddRemark,
  onClose,
  submission,
}: {
  applicant: Applicant | null;
  canAddIssue: boolean;
  onAddRemark: (context: ReviewRemarkContext) => void;
  onClose: () => void;
  submission: Submission;
}) {
  if (!applicant) return <EmptyState text="Заявитель для проверки не выбран." />;

  const selfieFiles = (["selfie", "selfie_2"] as const).map((fileType) => ({
    file: reviewFileForApplicant(submission, applicant.id, fileType),
    issue: fileIssueFor(submission, applicant.id, fileType),
    type: fileType,
  }));
  const hasCompleteSelfieSet = selfieFiles.every(
    ({ file }) =>
      file && file.status !== "missing" && file.status !== "needs_replacement",
  );
  const selfieRemarkFileType =
    selfieFiles.find(
      ({ file }) => !file || file.status === "missing" || file.status === "needs_replacement",
    )?.type ??
    selfieFiles.find(({ issue }) => issue)?.type ??
    "selfie";
  const hasSelfieIssue = selfieFiles.some(({ issue }) => issue);
  const checklist = [
    {
      helper: hasCompleteSelfieSet ? "Оба файла есть в карточке" : "Selfie + Selfie N2 обязательны",
      label: "Лицо видно",
      status: hasCompleteSelfieSet ? "unchecked" : "missing",
    },
    {
      helper: hasSelfieIssue ? "Есть замечание по селфи" : "Нужна ручная проверка",
      label: "Фото не размыто",
      status: hasSelfieIssue ? "warning" : hasCompleteSelfieSet ? "unchecked" : "missing",
    },
    {
      helper: applicant.fullName,
      label: "Заявитель соответствует",
      status: hasCompleteSelfieSet ? "unchecked" : "missing",
    },
    {
      helper: "Selfie + Selfie N2",
      label: "Требования соблюдены",
      status: hasSelfieIssue ? "warning" : hasCompleteSelfieSet ? "unchecked" : "missing",
    },
    {
      helper: selfieFiles
        .map(({ file, type }) => `${fileLabel(type)}: ${fileStatusLabel(file)}`)
        .join(" · "),
      label: "Файл доступен и читаем",
      status: hasSelfieIssue ? "warning" : hasCompleteSelfieSet ? "unchecked" : "missing",
    },
  ] satisfies AdminReviewChecklistItem[];

  return (
    <section className="drawer-section admin-review-tab admin-selfie-review">
      <div className="admin-review-split">
        <div className="admin-selfie-previews">
          {selfieFiles.map(({ file, issue, type }) => (
            <article
              className={`admin-selfie-card ${issue ? "has-issue" : ""}`}
              id={targetElementId({
                applicantId: applicant.id,
                fileType: type,
                tab: "files",
              })}
              key={type}
              tabIndex={-1}
            >
              <div className="admin-selfie-preview-stage">
                <span aria-hidden="true">SELFIE</span>
                <p>
                  {file && file.status !== "missing"
                    ? "Превью селфи недоступно в локальном окружении"
                    : "Селфи отсутствует"}
                </p>
              </div>
              <div className="admin-selfie-card-copy">
                <strong>{fileLabel(type)}</strong>
                <span>{fileStatusLabel(file)}</span>
                <small>{issue ? drawerIssueSummary(issue) : applicant.fullName}</small>
              </div>
            </article>
          ))}
        </div>
        <AdminChecklistPanel
          canAddIssue={canAddIssue}
          items={checklist}
          remarkContext={(item) =>
            fileRemarkContext({
              applicant,
              fileType: selfieRemarkFileType,
              itemLabel: item.label,
              submission,
            })
          }
          title="Селфи"
          onAddRemark={onAddRemark}
        />
      </div>
      {!hasCompleteSelfieSet ? (
        <div className="admin-review-empty-callout">
          <strong>Селфи не готово к проверке</strong>
          <p>Оба файла обязательны: Selfie и Selfie N2. Создайте точное замечание к отсутствующему документу.</p>
          <Button
            className="compact-button"
            disabled={!canAddIssue}
            variant="secondary"
            onClick={() =>
              onAddRemark(
                fileRemarkContext({
                  applicant,
                  fileType: selfieRemarkFileType,
                  itemLabel: `${fileLabel(selfieRemarkFileType)} отсутствует`,
                  submission,
                }),
              )
            }
          >
            Замечание к {fileLabel(selfieRemarkFileType)}
          </Button>
        </div>
      ) : null}
      <div className="admin-review-action-row">
        <Button
          className="compact-button"
          disabled
          title="Отдельное принятие селфи не поддержано текущими handlers."
        >
          Принять селфи
        </Button>
        <Button
          className="compact-button"
          disabled={!canAddIssue}
          variant="secondary"
          onClick={() =>
            onAddRemark(
              fileRemarkContext({
                applicant,
                fileType: selfieRemarkFileType,
                itemLabel: fileLabel(selfieRemarkFileType),
                submission,
              }),
            )
          }
        >
          Замечание
        </Button>
        <Button className="compact-button" variant="ghost" onClick={onClose}>
          Отложить
        </Button>
      </div>
    </section>
  );
}

function AdminQuestionnaireReview({
  applicant,
  canAddIssue,
  onAddRemark,
  pendingTarget,
  submission,
}: {
  applicant: Applicant | null;
  canAddIssue: boolean;
  onAddRemark: (context: ReviewRemarkContext) => void;
  pendingTarget: WorkspaceTarget | null;
  submission: Submission;
}) {
  const groups = useMemo(
    () => (applicant ? adminQuestionnaireGroups(submission, applicant) : []),
    [applicant, submission],
  );
  const [activeGroupId, setActiveGroupId] = useState<string>(groups[0]?.id ?? "");

  useEffect(() => {
    if (!groups.length) {
      setActiveGroupId("");
      return;
    }
    if (!groups.some((group) => group.id === activeGroupId)) {
      setActiveGroupId(groups[0].id);
    }
  }, [activeGroupId, groups]);

  useEffect(() => {
    if (!applicant || pendingTarget?.tab !== "questionnaire") return;
    if (pendingTarget.applicantId !== applicant.id) return;
    const targetGroup = adminQuestionnaireGroupForTarget(groups, pendingTarget);
    if (targetGroup) setActiveGroupId(targetGroup.id);
  }, [applicant, groups, pendingTarget]);

  if (!applicant) return <EmptyState text="Заявитель для проверки не выбран." />;

  const activeGroup = groups.find((group) => group.id === activeGroupId) ?? groups[0];
  if (!activeGroup) return <EmptyState text="Разделы анкеты не найдены." />;

  const activeIndex = groups.findIndex((group) => group.id === activeGroup.id);
  const nextGroup = groups[(activeIndex + 1) % groups.length];
  const groupIssues = issuesForQuestionnaireGroup(submission, applicant, activeGroup);
  const fieldCount = activeGroup.sections.reduce(
    (total, section) => total + section.fields.length,
    0,
  );
  const reviewedCount = activeGroup.sections.reduce(
    (total, section) =>
      total + section.fields.filter((field) => field.value.trim()).length,
    0,
  );
  const status = questionnaireGroupStatus(activeGroup, groupIssues);

  return (
    <section className="drawer-section admin-review-tab admin-questionnaire-review">
      <div className="admin-questionnaire-head">
        <div>
          <p className="kicker">Анкета</p>
          <h3>{applicant.fullName}</h3>
          <p>Разделы проверяются по одному, без длинной простыни полей.</p>
        </div>
        <Badge className={adminReviewStatusClass(status)}>
          {adminReviewStatusLabel(status)}
        </Badge>
      </div>

      <div className="admin-questionnaire-section-nav" aria-label="Разделы анкеты">
        {groups.map((group) => {
          const issues = issuesForQuestionnaireGroup(submission, applicant, group);
          const groupStatus = questionnaireGroupStatus(group, issues);

          return (
            <button
              aria-pressed={group.id === activeGroup.id}
              className={`admin-questionnaire-section-tab ${group.id === activeGroup.id ? "is-active" : ""}`}
              key={group.id}
              type="button"
              onClick={() => setActiveGroupId(group.id)}
            >
              <span>{group.title}</span>
              <em>{group.reviewedCount}/{group.fieldCount}</em>
              {issues.length ? <strong>{issues.length}</strong> : null}
              <i className={`state-${groupStatus}`} aria-hidden="true" />
            </button>
          );
        })}
      </div>

      <article className={`admin-questionnaire-section-card state-${status}`}>
        <header className="admin-questionnaire-section-header">
          <div>
            <h4>{activeGroup.title}</h4>
            <p>
              {fieldCount} полей · проверено {reviewedCount} · замечаний{" "}
              {groupIssues.length}
            </p>
          </div>
          <Badge className={adminReviewStatusClass(status)}>
            {adminReviewStatusLabel(status)}
          </Badge>
        </header>

        {activeGroup.id === "documents" ? (
          <div className="admin-questionnaire-linked-note">
            <strong>Паспортные поля проверяются во вкладке «Паспорт»</strong>
            <p>
              Здесь показана только связь с анкетой, чтобы не дублировать тяжёлую
              проверку документа.
            </p>
          </div>
        ) : null}

        {activeGroup.id === "family" ? (
          <div className="admin-questionnaire-linked-note">
            <strong>Семейный контекст</strong>
            <p>
              Общие семейные проблемы оформляются семейным замечанием. Личные
              замечания остаются привязанными к заявителю.
            </p>
          </div>
        ) : null}

        <div className="admin-questionnaire-field-list">
          {activeGroup.sections.flatMap((section) =>
            section.fields.map((field) => {
              const issue = fieldIssueFor(
                submission,
                applicant.id,
                section.title,
                field.label,
              );
              const passportLinked = activeGroup.id === "documents";

              return (
                <div
                  aria-label={`${applicant.fullName} · ${section.title} · ${field.label}`}
                  className={`admin-questionnaire-field ${issue ? "has-issue" : ""} ${
                    field.value.trim() ? "is-filled" : "is-missing"
                  }`}
                  id={targetElementId({
                    applicantId: applicant.id,
                    field: field.label,
                    tab: "questionnaire",
                  })}
                  key={`${section.id}-${field.id}`}
                  role="group"
                  tabIndex={-1}
                >
                  <div>
                    <strong>{field.label}</strong>
                    <p>
                      {passportLinked
                        ? "Проверяется во вкладке «Паспорт»"
                        : field.reviewSource ?? field.reviewOriginSource ?? "Анкета"}
                    </p>
                  </div>
                  <span>{field.value || "Не заполнено"}</span>
                  {issue ? (
                    <Badge className="visa-tag visa-tag-danger">
                      {drawerIssueSummary(issue)}
                    </Badge>
                  ) : (
                    <Badge
                      className={
                        field.value.trim()
                          ? "visa-tag visa-tag-ready"
                          : "visa-tag visa-tag-attention"
                      }
                    >
                      {field.value.trim() ? "Сверить" : "Нет данных"}
                    </Badge>
                  )}
                  <Button
                    className="compact-button"
                    disabled={!canAddIssue}
                    variant="secondary"
                    onClick={() =>
                      onAddRemark(
                        fieldRemarkContext({
                          applicant,
                          field,
                          section,
                          submission,
                        }),
                      )
                    }
                  >
                    Замечание
                  </Button>
                </div>
              );
            }),
          )}
          {!activeGroup.sections.some((section) => section.fields.length) ? (
            <EmptyState text="В этом разделе нет отдельных полей." />
          ) : null}
        </div>

        <div className="admin-questionnaire-section-actions">
          <Button
            className="compact-button"
            disabled
            title="Секционное принятие пока не поддержано текущими handlers."
          >
            Принять секцию
          </Button>
          <Button
            className="compact-button"
            disabled={!canAddIssue}
            variant="secondary"
            onClick={() =>
              onAddRemark(
                sectionRemarkContext({
                  applicant,
                  group: activeGroup,
                  submission,
                }),
              )
            }
          >
            Есть замечание
          </Button>
          <Button
            className="compact-button"
            variant="ghost"
            onClick={() => {
              if (nextGroup) setActiveGroupId(nextGroup.id);
            }}
          >
            Проверить позже
          </Button>
        </div>
      </article>
    </section>
  );
}

function AdminRemarksReview({
  canAddIssue,
  onAcceptAiSuggestion,
  onAddRemark,
  onDismissAiSuggestion,
  onRunAiReview,
  onOpenTarget,
  role,
  submission,
}: {
  canAddIssue: boolean;
  onAcceptAiSuggestion: (suggestionId: string) => void;
  onAddRemark: (context?: ReviewRemarkContext) => void;
  onDismissAiSuggestion: (suggestionId: string) => void;
  onRunAiReview: () => void;
  onOpenTarget: (target: WorkspaceTarget) => void;
  role: Role;
  submission: Submission;
}) {
  const openIssues = submission.issues.filter(
    (issue) => issue.status !== "closed_by_admin",
  );
  const resolvedIssues = submission.issues.filter(
    (issue) => issue.status === "closed_by_admin",
  );

  return (
    <section className="drawer-section admin-review-tab admin-remarks-review">
      <div className="admin-remarks-head">
        <div>
          <p className="kicker">Замечания</p>
          <h3>Точные замечания по проверке</h3>
          <p>Группировка по заявителю и цели: паспорт, селфи, анкета или подача.</p>
        </div>
        {canAddIssue ? (
          <Button
            className="compact-button"
            variant="secondary"
            onClick={() => onAddRemark()}
          >
            Добавить замечание
          </Button>
        ) : null}
      </div>

      {role === "admin" ? (
        <div className="admin-remarks-ops">
          <BbAiPanel
            compact
            onAccept={onAcceptAiSuggestion}
            onDismiss={onDismissAiSuggestion}
            onRun={onRunAiReview}
            role={role}
            submission={submission}
            surface="review"
          />
        </div>
      ) : null}

      {openIssues.length || resolvedIssues.length ? (
        <div className="admin-remarks-groups">
          <AdminRemarkGroup
            issues={openIssues}
            title="Открытые"
            role={role}
            onOpenTarget={onOpenTarget}
          />
          <AdminRemarkGroup
            issues={resolvedIssues}
            title="Закрытые"
            role={role}
            onOpenTarget={onOpenTarget}
          />
        </div>
      ) : (
        <div className="admin-review-empty-callout">
          <strong>Замечаний пока нет</strong>
          <p>Если проверка выявит проблему, создайте точное замечание из нужного раздела.</p>
          {canAddIssue ? (
            <Button
              className="compact-button"
              variant="secondary"
              onClick={() => onAddRemark()}
            >
              Добавить первое замечание
            </Button>
          ) : null}
        </div>
      )}
    </section>
  );
}

function AdminRemarkGroup({
  issues,
  onOpenTarget,
  role,
  title,
}: {
  issues: Issue[];
  onOpenTarget: (target: WorkspaceTarget) => void;
  role: Role;
  title: string;
}) {
  if (!issues.length) return null;

  const applicants = new Map<string, Issue[]>();
  for (const issue of issues) {
    const key = issue.target.applicantName || "Подача";
    applicants.set(key, [...(applicants.get(key) ?? []), issue]);
  }

  return (
    <div className="admin-remark-group">
      <h4>{title}</h4>
      {[...applicants.entries()].map(([applicantName, applicantIssues]) => (
        <section className="admin-remark-applicant-group" key={applicantName}>
          <h5>{applicantName}</h5>
          {applicantIssues.map((issue) => {
            const target = targetForIssue(issue);

            return (
              <article
                className={`admin-remark-card ${issue.severity} ${issue.status}`}
                id={`admin-review-remark-${issue.id}`}
                key={issue.id}
                tabIndex={-1}
              >
                <header>
                  <div>
                    <strong>{drawerIssueTitle(issue)}</strong>
                    <p>{issueTarget(issue)}</p>
                  </div>
                  <Badge className={issueStatusPillClass(issue.status)}>
                    {issueStatusLabel(issue.status)}
                  </Badge>
                </header>
                <dl>
                  <div>
                    <dt>Категория</dt>
                    <dd>{issueCategoryLabel(issue)}</dd>
                  </div>
                  <div>
                    <dt>Критичность</dt>
                    <dd>{issueSeverityLabel(issue.severity)}</dd>
                  </div>
                  <div>
                    <dt>Создано</dt>
                    <dd>
                      {issue.createdBy === "admin" ? "Админ" : "Система"} ·{" "}
                      {issue.createdAt}
                    </dd>
                  </div>
                </dl>
                <p>{issue.comment}</p>
                {issue.status !== "closed_by_admin" ? (
                  <Button
                    aria-label={`${role === "admin" ? "К цели проверки" : "Открыть"}: ${drawerIssueTitle(issue)}`}
                    className="compact-button"
                    variant="secondary"
                    onClick={() => onOpenTarget(target)}
                  >
                    {role === "admin" ? "К цели проверки" : "Открыть"}
                  </Button>
                ) : null}
              </article>
            );
          })}
        </section>
      ))}
    </div>
  );
}

type AdminQuestionnaireGroup = {
  fieldCount: number;
  id:
    | "additional"
    | "contacts"
    | "documents"
    | "employment"
    | "family"
    | "personal"
    | "trip";
  reviewedCount: number;
  sections: QuestionnaireSection[];
  title: string;
};

function adminQuestionnaireGroupForTarget(
  groups: AdminQuestionnaireGroup[],
  target: Extract<WorkspaceTarget, { tab: "questionnaire" }>,
) {
  if (target.section === "Семья") {
    return groups.find((group) => group.id === "family") ?? groups[0] ?? null;
  }

  if (target.section === "Вся подача") {
    return (
      groups.find((group) => group.id === "family") ??
      groups.find((group) => group.id === "additional") ??
      groups[0] ??
      null
    );
  }

  return (
    groups.find((group) =>
      group.sections.some(
        (section) =>
          section.title === target.section ||
          section.fields.some((field) => field.label === target.field),
      ),
    ) ?? null
  );
}

function adminReviewVisibleTab(tab: DrawerTab): DrawerTab {
  if (tab === "files") return "overview";
  if (tab === "history") return "issues";
  return tab;
}

function drawerTabForWorkspaceTarget(
  target: WorkspaceTarget,
  surface: "agent" | "review" | "export",
): DrawerTab {
  if (surface !== "review") return tabForTarget(target);
  if (target.tab === "files") {
    return target.fileType === "passport_scan" ? "overview" : "applicants";
  }
  return target.tab;
}

function adminReviewTabs(
  submission: Submission,
  applicant: Applicant | null,
): Array<{ id: DrawerTab; label: string; meta?: string }> {
  const applicantId = applicant?.id ?? submission.applicants[0]?.id ?? "";
  const passportIssue = applicantId
    ? fileIssueFor(submission, applicantId, "passport_scan")
    : null;
  const selfieIssueCount = applicantId
    ? (["selfie", "selfie_2"] as const).filter((type) =>
        fileIssueFor(submission, applicantId, type),
      ).length
    : 0;
  const questionnaireIssueCount = applicantId
    ? submission.issues.filter(
        (issue) =>
          issue.status !== "closed_by_admin" &&
          issue.target.applicantId === applicantId &&
          !issue.target.fileType,
      ).length
    : 0;
  const openIssues = openIssueCount(submission);

  return [
    { id: "overview", label: "Паспорт", meta: passportIssue ? "1" : undefined },
    {
      id: "applicants",
      label: "Селфи",
      meta: selfieIssueCount ? String(selfieIssueCount) : undefined,
    },
    {
      id: "questionnaire",
      label: "Анкета",
      meta: questionnaireIssueCount ? String(questionnaireIssueCount) : undefined,
    },
    { id: "issues", label: "Замечания", meta: openIssues ? String(openIssues) : undefined },
  ];
}

function reviewFileForApplicant(
  submission: Submission,
  applicantId: string,
  fileType: SubmissionFileType,
) {
  return submission.files.find(
    (file) => file.applicantId === applicantId && file.type === fileType,
  );
}

function fileIssueFor(
  submission: Submission,
  applicantId: string,
  fileType: SubmissionFileType,
) {
  return submission.issues.find(
    (issue) =>
      issue.status !== "closed_by_admin" &&
      issue.target.applicantId === applicantId &&
      issue.target.fileType === fileType,
  );
}

function applicantIssues(submission: Submission, applicantId: string) {
  return submission.issues.filter(
    (issue) =>
      issue.status !== "closed_by_admin" && issue.target.applicantId === applicantId,
  );
}

function fieldValue(section: QuestionnaireSection | undefined, fieldId: string) {
  return section?.fields.find((field) => field.id === fieldId)?.value.trim() ?? "";
}

function sectionMatchesAlias(section: QuestionnaireSection, alias: string) {
  return section.id === alias || section.id.endsWith(`-${alias}`);
}

function questionnaireSectionByAlias(applicant: Applicant, alias: string) {
  return applicant.sections.find((section) => sectionMatchesAlias(section, alias));
}

function adminQuestionnaireGroups(
  submission: Submission,
  applicant: Applicant,
): AdminQuestionnaireGroup[] {
  const usedSectionIds = new Set<string>();
  const makeGroup = (
    id: AdminQuestionnaireGroup["id"],
    title: string,
    sectionAliases: string[],
  ): AdminQuestionnaireGroup | null => {
    const sections = sectionAliases
      .map((sectionAlias) =>
        applicant.sections.find(
          (section) =>
            !usedSectionIds.has(section.id) && sectionMatchesAlias(section, sectionAlias),
        ),
      )
      .filter((section): section is QuestionnaireSection => Boolean(section));
    sections.forEach((section) => usedSectionIds.add(section.id));
    if (!sections.length) return null;

    return {
      fieldCount: sections.reduce((total, section) => total + section.fields.length, 0),
      id,
      reviewedCount: sections.reduce(
        (total, section) =>
          total + section.fields.filter((field) => field.value.trim()).length,
        0,
      ),
      sections,
      title,
    };
  };

  const groups = [
    makeGroup("personal", "Личные данные", ["personal"]),
    makeGroup("contacts", "Адрес и контакты", ["contacts"]),
    makeGroup("employment", "Работа / учёба", ["employment"]),
    makeGroup("trip", "Поездка", ["appointment", "trip"]),
    submission.type === "family"
      ? {
          fieldCount: submission.applicants.length,
          id: "family" as const,
          reviewedCount: submission.applicants.length,
          sections: [] as QuestionnaireSection[],
          title: "Семья",
        }
      : null,
    makeGroup("documents", "Документы", ["passport"]),
  ].filter((group): group is AdminQuestionnaireGroup => Boolean(group));

  const additionalSections = applicant.sections.filter(
    (section) => !usedSectionIds.has(section.id),
  );
  if (additionalSections.length) {
    groups.push({
      fieldCount: additionalSections.reduce(
        (total, section) => total + section.fields.length,
        0,
      ),
      id: "additional",
      reviewedCount: additionalSections.reduce(
        (total, section) =>
          total + section.fields.filter((field) => field.value.trim()).length,
        0,
      ),
      sections: additionalSections,
      title: "Дополнительно",
    });
  }

  return groups;
}

function issuesForQuestionnaireGroup(
  submission: Submission,
  applicant: Applicant,
  group: AdminQuestionnaireGroup,
) {
  const sectionTitles = new Set(group.sections.map((section) => section.title));
  const fieldLabels = new Set(
    group.sections.flatMap((section) => section.fields.map((field) => field.label)),
  );

  return submission.issues.filter((issue) => {
    if (
      issue.status === "closed_by_admin" ||
      issue.target.applicantId !== applicant.id ||
      issue.target.fileType
    ) {
      return false;
    }

    if (group.id === "family") {
      return issue.target.section === "Семья" || issue.target.section === "Вся подача";
    }

    return (
      Boolean(issue.target.section && sectionTitles.has(issue.target.section)) ||
      Boolean(issue.target.field && fieldLabels.has(issue.target.field))
    );
  });
}

function questionnaireGroupStatus(
  group: AdminQuestionnaireGroup,
  issues: Issue[],
): "accepted" | "blocking" | "has-remarks" | "in-review" | "not-reviewed" {
  if (issues.some((issue) => issue.severity === "blocker")) return "blocking";
  if (issues.length) return "has-remarks";
  if (group.fieldCount > 0 && group.reviewedCount >= group.fieldCount) return "accepted";
  if (group.reviewedCount > 0) return "in-review";
  return "not-reviewed";
}

function adminReviewStatusClass(status: ReturnType<typeof questionnaireGroupStatus>) {
  if (status === "accepted") return "visa-tag visa-tag-ready";
  if (status === "blocking") return "visa-tag visa-tag-blocked";
  if (status === "has-remarks") return "visa-tag visa-tag-attention";
  if (status === "in-review") return "visa-tag";
  return "visa-tag visa-tag-muted";
}

function adminReviewStatusLabel(status: ReturnType<typeof questionnaireGroupStatus>) {
  switch (status) {
    case "accepted":
      return "принято";
    case "blocking":
      return "блокер";
    case "has-remarks":
      return "есть замечания";
    case "in-review":
      return "в проверке";
    case "not-reviewed":
      return "не проверено";
  }
}

function fileRemarkContext({
  applicant,
  fileType,
  itemLabel,
  submission,
}: {
  applicant: Applicant;
  fileType: SubmissionFileType;
  itemLabel: string;
  submission: Submission;
}): ReviewRemarkContext {
  return {
    applicantId: applicant.id,
    category: "Документ",
    comment: `${fileLabel(fileType)}: ${itemLabel}. Опишите, что агент должен исправить.`,
    description: `${submission.id} · ${applicant.fullName} · ${fileLabel(fileType)}`,
    fileType,
    reason: itemLabel,
    section: "Медиа",
    severity: "blocker",
    title: itemLabel,
    type: "file",
  };
}

function fieldRemarkContext({
  applicant,
  field,
  section,
  submission,
}: {
  applicant: Applicant;
  field: QuestionnaireField;
  section: QuestionnaireSection;
  submission: Submission;
}): ReviewRemarkContext {
  return {
    applicantId: applicant.id,
    category: "Анкета",
    comment: field.value
      ? `Текущее значение: ${field.value}. Опишите точную правку для агента.`
      : "Поле пустое. Опишите, что нужно заполнить.",
    description: `${submission.id} · ${applicant.fullName} · ${section.title} · ${field.label}`,
    field: field.label,
    reason: field.value ? `Проверить поле: ${field.label}` : `Заполнить поле: ${field.label}`,
    section: section.title,
    severity: field.value ? "warning" : "blocker",
    title: field.label,
    type: "field",
  };
}

function sectionRemarkContext({
  applicant,
  group,
  submission,
}: {
  applicant: Applicant;
  group: AdminQuestionnaireGroup;
  submission: Submission;
}): ReviewRemarkContext {
  const targetSection = questionnaireRemarkTargetSection(group);
  const contextTitle =
    targetSection === group.title ? group.title : `${group.title}: ${targetSection}`;

  return {
    applicantId: applicant.id,
    category: "Анкета",
    comment: `${contextTitle}: опишите, какие поля агент должен исправить.`,
    description: `${submission.id} · ${applicant.fullName} · ${contextTitle}`,
    reason: `Проверить раздел: ${targetSection}`,
    section: targetSection,
    severity: "warning",
    title: contextTitle,
    type: "section",
  };
}

function questionnaireRemarkTargetSection(group: AdminQuestionnaireGroup) {
  if (group.id === "family") return "Семья";
  return group.sections[0]?.title ?? group.title;
}

function globalRemarkContext(submission: Submission): ReviewRemarkContext {
  const applicant = submission.applicants[0];

  return {
    applicantId: applicant?.id,
    category: "Подача",
    comment: "Опишите общее замечание по подаче.",
    description: `${submission.id} · ${typeLabels[submission.type]} · ${submission.city}`,
    reason: "Общее замечание по подаче",
    section: "Вся подача",
    severity: "warning",
    title: "Вся подача",
    type: "section",
  };
}

function IssueComposer({
  context,
  onCancel,
  onSubmit,
  submission,
}: {
  context?: ReviewRemarkContext | null;
  onCancel: () => void;
  onSubmit: (input: IssueInput) => void;
  submission: Submission;
}) {
  const hasContext = Boolean(context);
  const [applicantId, setApplicantId] = useState(
    context?.applicantId ?? submission.applicants[0]?.id ?? "",
  );
  const [targetKind, setTargetKind] = useState<"questionnaire" | "files">(
    context?.fileType ? "files" : "questionnaire",
  );
  const [fieldLabel, setFieldLabel] = useState(context?.field ?? "");
  const [fileType, setFileType] =
    useState<NonNullable<IssueInput["fileType"]>>(context?.fileType ?? "passport_scan");
  const [severity, setSeverity] = useState<IssueInput["severity"]>(
    context?.severity ?? "blocker",
  );
  const [category, setCategory] = useState(context?.category ?? "Анкета");
  const [reason, setReason] = useState(
    context?.reason ?? "Нужно уточнить маршрут поездки",
  );
  const [comment, setComment] = useState(
    context?.comment ?? "Проверьте целевое поле и отправьте исправление.",
  );
  const reasonInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    reasonInputRef.current?.focus({ preventScroll: true });
  }, []);

  const applicant =
    submission.applicants.find((item) => item.id === applicantId) ??
    submission.applicants[0];
  const fields = applicant?.sections.flatMap((section) => section.fields) ?? [];
  const selectedField = fields.some((field) => field.label === fieldLabel)
    ? fieldLabel
    : (fields.find((field) => field.label === "Маршрут поездки")?.label ??
      fields[0]?.label ??
      "");
  const canSubmit = Boolean(applicant && reason.trim() && comment.trim());

  function submit() {
    if (!applicant || !canSubmit) return;

    const resolvedReason = category.trim()
      ? `${category.trim()}: ${reason.trim()}`
      : reason.trim();

    const targetField = context
      ? context.field
      : targetKind === "files"
        ? undefined
        : selectedField;

    onSubmit({
      type: context?.type ?? (targetKind === "files" ? "file" : "field"),
      applicantId: applicant.id,
      section: context?.section ?? (targetKind === "files" ? "Медиа" : "Данные"),
      field: targetField,
      fileType: context?.fileType ?? (targetKind === "files" ? fileType : undefined),
      reason: resolvedReason,
      comment: comment.trim(),
      severity,
    });
  }

  return (
    <section className="issue-composer" aria-label="Новое замечание">
      <div>
        <p className="kicker">Новое замечание</p>
        <h3>Точная цель возврата</h3>
      </div>
      {context ? (
        <div className="issue-composer-context">
          <span>Контекст</span>
          <strong>{context.title}</strong>
          <p>{context.description}</p>
        </div>
      ) : null}
      <div className="issue-composer-grid">
        {!hasContext ? (
          <>
            <Select
              containerClassName=""
              fieldClassName=""
              label="Заявитель"
              options={submission.applicants.map((item) => ({
                label: item.fullName,
                value: item.id,
              }))}
              value={applicant?.id ?? ""}
              onChange={(event) => setApplicantId(event.target.value)}
            />
            <Select
              containerClassName=""
              fieldClassName=""
              label="Раздел"
              options={[
                { label: "Данные", value: "questionnaire" },
                { label: "Медиа", value: "files" },
              ]}
              value={targetKind}
              onChange={(event) => {
                const nextKind = event.target.value as "questionnaire" | "files";
                setTargetKind(nextKind);
                setReason(
                  nextKind === "files"
                    ? "Файл требует замены"
                    : "Нужно уточнить маршрут поездки",
                );
              }}
            />
            {targetKind === "questionnaire" ? (
              <Select
                containerClassName=""
                fieldClassName=""
                label="Поле"
                options={fields.map((field) => ({
                  label: field.label,
                  value: field.label,
                }))}
                value={selectedField}
                onChange={(event) => setFieldLabel(event.target.value)}
              />
            ) : (
              <Select
                containerClassName=""
                fieldClassName=""
                label="Файл"
                options={activeMediaFileTypes.map((type) => ({
                  label: fileLabel(type),
                  value: type,
                }))}
                value={fileType}
                onChange={(event) => setFileType(event.target.value as typeof fileType)}
              />
            )}
          </>
        ) : null}
        <Select
          containerClassName=""
          fieldClassName=""
          label="Критичность"
          options={[
            { label: "Блокер", value: "blocker" },
            { label: "Проверить", value: "warning" },
            { label: "Инфо", value: "info" },
          ]}
          value={severity}
          onChange={(event) => setSeverity(event.target.value as typeof severity)}
        />
        <Select
          containerClassName=""
          fieldClassName=""
          label="Категория"
          options={[
            { label: "Анкета", value: "Анкета" },
            { label: "Документ", value: "Документ" },
            { label: "Подача", value: "Подача" },
            { label: "Качество файла", value: "Качество файла" },
          ]}
          value={category}
          onChange={(event) => setCategory(event.target.value)}
        />
        <TextInputField
          containerClassName=""
          label="Причина"
          ref={reasonInputRef}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <div className="issue-composer-textarea-field">
          <label htmlFor="issue-composer-comment">Комментарий агенту</label>
          <textarea
            className="issue-composer-textarea"
            id="issue-composer-comment"
            rows={4}
            value={comment}
            onChange={(event) => setComment(event.target.value)}
          />
        </div>
      </div>
      <div className="issue-composer-actions">
        <Button variant="ghost" onClick={onCancel}>
          Отмена
        </Button>
        <Button disabled={!canSubmit} onClick={submit}>
          Создать замечание
        </Button>
      </div>
    </section>
  );
}

function DrawerApplicants({
  onOpenTarget,
  submission,
}: {
  onOpenTarget: (target: WorkspaceTarget) => void;
  submission: Submission;
}) {
  return (
    <section className="drawer-section drawer-applicants-section">
      <div
        className="applicant-matrix v17-applicant-matrix"
        aria-label="Заявители в подаче"
      >
        <div className="applicant-matrix-head" aria-hidden="true">
          <span>Заявитель</span>
          <span>Готовность</span>
          <span>Состояние</span>
        </div>
        {submission.applicants.length ? (
          submission.applicants.map((applicant) => {
            const applicantIssues = submission.issues.filter(
              (issue) =>
                issue.status !== "closed_by_admin" &&
                issue.target.applicantId === applicant.id,
            );
            const firstIssue = applicantIssues[0];
            const firstIncompleteSection =
              applicant.sections.find((section) => section.status !== "complete") ??
              applicant.sections[0];
            const questionnaireTarget: WorkspaceTarget = {
              applicantId: applicant.id,
              section: firstIssue?.target.section ?? firstIncompleteSection?.title,
              field: firstIssue?.target.field,
              tab: "questionnaire",
            };
            const files = submission.files.filter(
              (file) => file.applicantId === applicant.id,
            );
            const readyFiles = files.filter(
              (file) =>
                file.status !== "missing" && file.status !== "needs_replacement",
            ).length;
            const percent = questionnaireProgressForApplicant(applicant);
            const visualState = applicantVisualState(submission, applicant);

            return (
              <article
                aria-label={`${applicant.fullName}: анкета ${percent}%, файлы ${readyFiles}/${files.length}, ${visualState.label}`}
                className="applicant-matrix-row"
                key={applicant.id}
              >
                <button
                  className="applicant-identity"
                  type="button"
                  onClick={() => onOpenTarget(questionnaireTarget)}
                >
                  <strong>{applicant.fullName}</strong>
                  <span>
                    {applicantRoleLabel(applicant.role)} ·{" "}
                    {applicantPassportHint(applicant)}
                  </span>
                </button>
                <div className="applicant-readiness">
                  <div className="readiness-top">
                    <span>Анкета {percent}%</span>
                    <Badge
                      className={
                        readyFiles === files.length
                          ? "visa-tag visa-tag-ready"
                          : "visa-tag visa-tag-attention"
                      }
                    >
                      Файлы {readyFiles}/{files.length}
                    </Badge>
                  </div>
                  <div className="progress" aria-hidden="true">
                    <span style={{ width: `${Math.min(percent, 100)}%` }} />
                  </div>
                </div>
                <div className="applicant-result">
                  {applicantIssues.length ? (
                    <Button
                      className={`compact-button ${visualState.tone}`}
                      variant="secondary"
                      onClick={() =>
                        firstIssue
                          ? onOpenTarget(targetForIssue(firstIssue))
                          : onOpenTarget(questionnaireTarget)
                      }
                    >
                      {issueCountLabel(applicantIssues.length)}
                    </Button>
                  ) : (
                    <Badge className="visa-tag visa-tag-ready">Готово</Badge>
                  )}
                </div>
              </article>
            );
          })
        ) : (
          <EmptyState text="В подаче пока нет заявителей." />
        )}
      </div>
    </section>
  );
}

function DrawerOverview({
  onOpenHistory,
  onOpenTarget,
  primaryAction,
  surface,
  submission,
}: {
  onOpenHistory: () => void;
  onOpenTarget: (target: WorkspaceTarget) => void;
  primaryAction: ActionDecision;
  surface: "agent" | "review" | "export";
  submission: Submission;
}) {
  const openIssues = openIssueCount(submission);
  const fileProgress = fileReadyCount(submission);
  const nextLine = firstWorkLine(submission);
  const queue = buildReadinessQueue(submission).filter(
    (item) => !(item.type === "admin_blocker" && item.status === "open"),
  );
  const checklist = [
    {
      label: "Заявители и паспорта",
      value: applicantCountLabel(submission.applicants.length),
      marker: "check",
      tone: submission.applicants.length ? "ready" : "warning",
    },
    {
      label: "Анкета и поездка",
      value: `${submission.completeness.questionnaire}%`,
      marker: submission.completeness.questionnaire === 100 ? "check" : "warning",
      tone: submission.completeness.questionnaire === 100 ? "ready" : "warning",
    },
    {
      label: "Обязательные файлы",
      value: `${fileProgress.ready} из ${fileProgress.total}`,
      marker: "file",
      tone: fileProgress.ready === fileProgress.total ? "ready" : "warning",
    },
    {
      label: "Открытые замечания",
      value: openIssues ? String(openIssues) : "Нет",
      marker: openIssues ? "warning" : "check",
      tone: openIssues ? "danger" : "ready",
    },
  ] satisfies Array<{
    label: string;
    marker: "check" | "file" | "warning";
    tone: "danger" | "ready" | "warning";
    value: string;
  }>;
  const firstTarget = queue.find((item) => item.status !== "fixed")?.target;
  const isAdminReview = surface === "review";

  return (
    <section className="drawer-section drawer-overview drawer-overview-section">
      <div className="overview-release">
        <div className="overview-main">
          <CardComponent as="article" className="surface overview-status-card">
            <div className="overview-status-line">
              <h3>Состояние подачи</h3>
              <Badge className={`entity-tag ${statusTone[submission.status]}`}>
                {statusLabels[submission.status]}
              </Badge>
              <Badge className="badge solid neutral">
                {submission.completeness.total}%
              </Badge>
            </div>
            <p className="overview-copy">
              {typeLabels[submission.type]} ·{" "}
              {applicantCountLabel(submission.applicants.length)}. {submission.city} ·{" "}
              {tripDates(submission)}.
            </p>
            <dl className="overview-summary-grid">
              <div>
                <dt>Ответственный</dt>
                <dd>{isAdminReview ? "Татьяна Н." : "Агент подачи"}</dd>
              </div>
              <div>
                <dt>Проверяющий</dt>
                <dd>{isAdminReview ? "Не назначен" : "Текущий администратор"}</dd>
              </div>
              <div>
                <dt>Категория</dt>
                <dd>Туризм</dd>
              </div>
              <div>
                <dt>ID</dt>
                <dd>{submission.id}</dd>
              </div>
            </dl>
          </CardComponent>

          <CardComponent as="section" className="surface">
            <div className="drawer-section-head">
              <h3>Контрольный список</h3>
              <span>рабочие условия</span>
            </div>
            <div className="overview-checks">
              {checklist.map((item) => (
                <div
                  className={`overview-check ${item.tone === "danger" || item.tone === "warning" ? "problem" : ""}`}
                  key={item.label}
                >
                  <span
                    className={`overview-check-marker ${item.marker} ${item.tone}`}
                    aria-hidden="true"
                  />
                  <span>{item.label}</span>
                  {item.label === "Обязательные файлы" ? (
                    <Badge
                      className={`overview-check-value entity-tag ${item.tone === "ready" ? "teal" : "amber"}`}
                    >
                      {item.value}
                    </Badge>
                  ) : (
                    <small className="overview-check-value">{item.value}</small>
                  )}
                </div>
              ))}
            </div>
          </CardComponent>
        </div>

        <aside className="overview-side" aria-label="Контекст подачи">
          <CardComponent as="section" className="surface overview-next">
            <div className="surface-title">Следующий шаг</div>
            <h3>{primaryAction.label}</h3>
            <p>{primaryAction.reason ?? nextLine}</p>
            <Button
              variant="primary"
              disabled={!firstTarget}
              onClick={() => {
                if (firstTarget) onOpenTarget(firstTarget);
              }}
            >
              Перейти
            </Button>
          </CardComponent>
          <CardComponent as="section" className="surface drawer-recent-card">
            <div className="surface-title">Последние изменения</div>
            <div className="history mini v17-overview-history">
              <article className="history-event">
                <strong>{statusLabels[submission.status]}</strong>
                <span>
                  {submission.updatedAt} ·{" "}
                  {isAdminReview ? "Не назначен" : "Текущий администратор"}
                </span>
              </article>
              <article className="history-event">
                <strong>Анкета обновлена</strong>
                <span>вчера · Агент подачи</span>
              </article>
            </div>
            <Button variant="ghost" onClick={onOpenHistory}>
              Открыть историю
            </Button>
          </CardComponent>
        </aside>
      </div>
    </section>
  );
}

function DrawerQuestionnaire({
  onApplyPassportField,
  onFieldChange,
  passportExtractionEnabled,
  pendingTarget,
  role,
  submission,
}: {
  onApplyPassportField: (
    applicantId: string,
    key: PassportExtractedFieldKey,
    mode: PassportFieldApplyMode,
  ) => void;
  onFieldChange: (input: {
    applicantId: string;
    sectionId: string;
    fieldId: QuestionnaireField["id"];
    value: string;
  }) => void;
  passportExtractionEnabled: boolean;
  pendingTarget: WorkspaceTarget | null;
  role: Role;
  submission: Submission;
}) {
  const canEdit = canEditSubmissionContent(submission, role);
  const problemCount = questionnaireProblemCount(submission);
  const questionnaireReady =
    submission.completeness.questionnaire === 100 && problemCount === 0;
  const [openSectionState, setOpenSectionState] = useState<{
    sectionKey: string | null;
    submissionId: string;
  }>(() => ({
    sectionKey: defaultQuestionnaireSectionKey(submission),
    submissionId: submission.id,
  }));
  const [pendingSectionScrollId, setPendingSectionScrollId] = useState<string | null>(
    null,
  );
  const openSectionKey =
    openSectionState.submissionId === submission.id
      ? openSectionState.sectionKey
      : defaultQuestionnaireSectionKey(submission);
  const activeApplicantId = openSectionKey?.split(":")[0] ?? "";
  const activeApplicant =
    submission.applicants.find((applicant) => applicant.id === activeApplicantId) ??
    null;

  useLayoutEffect(() => {
    if (!pendingSectionScrollId) return;

    const sectionElement = document.getElementById(pendingSectionScrollId);
    const drawerBody = sectionElement?.closest<HTMLElement>(".drawer-body");
    if (!sectionElement || !drawerBody) return;

    const sectionRect = sectionElement.getBoundingClientRect();
    const drawerBodyRect = drawerBody.getBoundingClientRect();
    drawerBody.scrollTo({
      top: Math.max(
        drawerBody.scrollTop + sectionRect.top - drawerBodyRect.top - 12,
        0,
      ),
      behavior: "auto",
    });
    setPendingSectionScrollId(null);
  }, [openSectionKey, pendingSectionScrollId]);

  useLayoutEffect(() => {
    if (pendingTarget?.tab !== "questionnaire") return;

    const applicant =
      submission.applicants.find((item) => item.id === pendingTarget.applicantId) ??
      submission.applicants[0];
    if (!applicant) return;

    const targetSection =
      applicant.sections.find(
        (section) =>
          section.title === pendingTarget.section ||
          section.fields.some((field) => field.label === pendingTarget.field),
      ) ??
      applicant.sections.find((section) => section.status !== "complete") ??
      applicant.sections[0];
    if (!targetSection) return;

    setOpenSectionState({
      sectionKey: questionnaireSectionKey(applicant.id, targetSection.id),
      submissionId: submission.id,
    });
  }, [pendingTarget, submission.applicants, submission.id]);

  function setOpenSectionKey(sectionKey: string) {
    setOpenSectionState({ sectionKey, submissionId: submission.id });
  }

  function openQuestionnaireSection(sectionKey: string, sectionElementId: string) {
    setOpenSectionKey(sectionKey);
    setPendingSectionScrollId(sectionElementId);
  }

  function toggleQuestionnaireSection(sectionKey: string, sectionElementId: string) {
    if (openSectionKey === sectionKey) {
      setOpenSectionKey(closedQuestionnaireSectionKey(sectionKey.split(":")[0] ?? ""));
      return;
    }

    openQuestionnaireSection(sectionKey, sectionElementId);
  }

  function activateApplicant(applicantId: string) {
    const applicant =
      submission.applicants.find((item) => item.id === applicantId) ??
      submission.applicants[0];
    if (!applicant) return;

    if (activeApplicant?.id === applicant.id) return;

    const issue = submission.issues.find(
      (item) =>
        item.status !== "closed_by_admin" && item.target.applicantId === applicant.id,
    );
    const nextSection =
      applicant.sections.find(
        (section) =>
          section.title === issue?.target.section ||
          section.fields.some((field) => field.label === issue?.target.field),
      ) ??
      applicant.sections.find((section) => section.status !== "complete") ??
      applicant.sections[0];

    if (!nextSection) return;
    const sectionKey = questionnaireSectionKey(applicant.id, nextSection.id);
    const sectionElementId = targetElementId({
      applicantId: applicant.id,
      section: nextSection.title,
      tab: "questionnaire",
    });
    openQuestionnaireSection(sectionKey, sectionElementId);
  }

  const activeApplicantPanelId = activeApplicant
    ? `questionnaire-applicant-${activeApplicant.id}`
    : undefined;
  const activeApplicantPrioritySections = useMemo(() => {
    if (!activeApplicant) return [];

    return activeApplicant.sections.filter(
      (section) =>
        section.status !== "complete" ||
        Boolean(sectionIssue(submission, activeApplicant.id, section.title)),
    );
  }, [activeApplicant, submission]);
  const activeApplicantReviewSections = useMemo(() => {
    if (!activeApplicant) return [];

    return activeApplicant.sections;
  }, [activeApplicant]);
  const activeApplicantCompletedSectionCount = activeApplicant
    ? activeApplicant.sections.length - activeApplicantPrioritySections.length
    : 0;
  const activeApplicantReviewSectionKeys = useMemo(() => {
    if (!activeApplicant) return [];

    return activeApplicantReviewSections.map((section) =>
      questionnaireSectionKey(activeApplicant.id, section.id),
    );
  }, [activeApplicant, activeApplicantReviewSections]);
  const activeApplicantReviewSignature = activeApplicantReviewSectionKeys.join("|");

  useEffect(() => {
    if (!activeApplicant || !activeApplicantReviewSections.length) return;
    if (openSectionKey && activeApplicantReviewSectionKeys.includes(openSectionKey)) {
      return;
    }
    if (openSectionKey === closedQuestionnaireSectionKey(activeApplicant.id)) {
      return;
    }

    const nextSection =
      activeApplicantPrioritySections[0] ?? activeApplicantReviewSections[0];

    setOpenSectionState({
      sectionKey: questionnaireSectionKey(activeApplicant.id, nextSection.id),
      submissionId: submission.id,
    });
  }, [
    activeApplicant,
    activeApplicantPrioritySections,
    activeApplicantReviewSections,
    activeApplicantReviewSectionKeys,
    activeApplicantReviewSignature,
    openSectionKey,
    submission.id,
  ]);

  return (
    <section
      className={`drawer-section questionnaire-screen visa-form-screen v17-questionnaire-section ${
        canEdit ? "is-editable" : "is-read-only"
      }`}
    >
      <div className="questionnaire-form-intro visa-form-hero">
        <div>
          <p className="kicker">Анкета</p>
          <h3>Визовая анкета</h3>
          <p className="drawer-muted visa-form-hero-copy">
            {canEdit
              ? "Один заявитель и один раздел в фокусе."
              : "Проверка по одному раскрытому блоку."}
          </p>
        </div>
        {questionnaireReady ? (
          <Badge className="visa-tag visa-tag-ready">Готово к решению</Badge>
        ) : problemCount ? (
          <Badge className="visa-tag visa-tag-attention">Уточнить {problemCount}</Badge>
        ) : null}
      </div>
      <div className="questionnaire-focus-layout">
        <div
          className="questionnaire-workspace visa-form-workspace questionnaire-applicant-rail"
          aria-label="Заявители семьи"
        >
          {submission.applicants.map((applicant) => {
            const visualState = applicantVisualState(submission, applicant);
            const expandedApplicant = activeApplicant?.id === applicant.id;

            return (
              <CardComponent
                as="article"
                className={`questionnaire-card visa-applicant-sheet questionnaire-applicant-accordion ${
                  expandedApplicant ? "is-expanded" : "is-collapsed"
                } ${visualState.tone}`}
                key={applicant.id}
              >
                <Button
                  aria-controls={expandedApplicant ? activeApplicantPanelId : undefined}
                  aria-expanded={expandedApplicant}
                  className="questionnaire-applicant-trigger visa-applicant-header"
                  title={applicant.fullName}
                  variant="plain"
                  type="button"
                  onClick={() => activateApplicant(applicant.id)}
                >
                  <span className="questionnaire-applicant-main">
                    <span>
                      <strong>{applicant.fullName}</strong>
                      <p>{applicantRoleLabel(applicant.role)}</p>
                    </span>
                  </span>
                  <span className="questionnaire-card-status">
                    <Badge className="questionnaire-progress-tag">
                      {questionnaireProgressForApplicant(applicant)}%
                    </Badge>
                    <span className="accordion-chevron" aria-hidden="true" />
                  </span>
                </Button>
              </CardComponent>
            );
          })}
        </div>
        {activeApplicant ? (
          <div
            className="questionnaire-applicant-panel visa-questionnaire-deck"
            id={activeApplicantPanelId}
            aria-label={`Анкета: ${activeApplicant.fullName}`}
          >
            <PassportExtractionReviewPanel
              applicant={activeApplicant}
              canEdit={canEdit}
              enabled={passportExtractionEnabled}
              onApplyField={onApplyPassportField}
            />
            <div className="questionnaire-section-list visa-section-stack visa-section-deck">
              {!activeApplicantPrioritySections.length &&
              activeApplicantReviewSections.length ? (
                <CardComponent
                  as="section"
                  className="questionnaire-deck-empty visa-answer-card"
                >
                  <p className="kicker">Фокус</p>
                  <h4>Все разделы заполнены</h4>
                  <p>
                    {activeApplicantCompletedSectionCount} из{" "}
                    {activeApplicant.sections.length} секций доступны ниже для проверки.
                  </p>
                </CardComponent>
              ) : null}
              {activeApplicantReviewSections.length ? (
                activeApplicantReviewSections.map((section) => {
                  const issue = sectionIssue(
                    submission,
                    activeApplicant.id,
                    section.title,
                  );
                  const sectionKey = questionnaireSectionKey(
                    activeApplicant.id,
                    section.id,
                  );
                  const sectionElementId = targetElementId({
                    applicantId: activeApplicant.id,
                    section: section.title,
                    tab: "questionnaire",
                  });
                  const fieldsId = `questionnaire-fields-${activeApplicant.id}-${section.id}`;
                  const expanded = openSectionKey === sectionKey;
                  const prioritySection =
                    activeApplicantPrioritySections.includes(section);

                  return (
                    <CardComponent
                      as="section"
                      className={`questionnaire-edit-section visa-section-card visa-answer-card ${
                        issue ? "has-issue" : ""
                      } ${prioritySection ? "is-priority" : "is-complete-section"} ${
                        expanded ? "is-expanded" : "is-collapsed"
                      }`}
                      id={sectionElementId}
                      key={section.id}
                      aria-label={`${activeApplicant.fullName}: ${section.title}`}
                    >
                      <Button
                        className="questionnaire-section-heading visa-section-trigger"
                        variant="plain"
                        type="button"
                        aria-controls={fieldsId}
                        aria-expanded={expanded}
                        onClick={() =>
                          toggleQuestionnaireSection(sectionKey, sectionElementId)
                        }
                      >
                        <div>
                          <div>
                            {section.stepLabel ? (
                              <p className="consular-step-label visa-step-label">
                                {section.stepLabel}
                              </p>
                            ) : null}
                            <h4>{section.title}</h4>
                            {issue ? (
                              <p className="visa-section-note">
                                {drawerIssueSummary(issue)}
                              </p>
                            ) : section.missing ? (
                              <p className="visa-section-note">{section.missing}</p>
                            ) : null}
                          </div>
                        </div>
                        <span className="questionnaire-section-side">
                          {issue || section.status !== "complete" ? (
                            <Badge tone={questionnaireTone(section.status)}>
                              {questionnaireLabel(section.status)}
                            </Badge>
                          ) : null}
                          <span className="accordion-chevron" aria-hidden="true" />
                        </span>
                      </Button>
                      <div
                        className="questionnaire-fields visa-field-grid"
                        hidden={!expanded}
                        id={fieldsId}
                      >
                        {section.fields.map((field) => {
                          const fieldIssue = fieldIssueFor(
                            submission,
                            activeApplicant.id,
                            section.title,
                            field.label,
                          );
                          const error = field.error ?? fieldIssue?.reason;
                          const fieldClassName = `visa-field ${field.span === "full" ? "is-full" : ""} ${error ? "has-error" : ""}`;
                          const fieldAriaLabel = `${activeApplicant.fullName} · ${section.title} · ${field.label}`;
                          const fieldElementId = targetElementId({
                            applicantId: activeApplicant.id,
                            field: field.label,
                            tab: "questionnaire",
                          });

                          if (field.control === "select") {
                            return (
                              <Select
                                aria-label={fieldAriaLabel}
                                containerClassName={fieldClassName}
                                disabled={!canEdit}
                                errorMessage={error}
                                id={fieldElementId}
                                key={field.id}
                                label={field.label}
                                options={(field.options ?? []).map((option) => ({
                                  label: option,
                                  value: option,
                                }))}
                                placeholder={field.placeholder ?? "Выберите"}
                                required={field.required}
                                value={field.value}
                                onChange={(event) =>
                                  onFieldChange({
                                    applicantId: activeApplicant.id,
                                    sectionId: section.id,
                                    fieldId: field.id,
                                    value: event.target.value,
                                  })
                                }
                              />
                            );
                          }

                          return (
                            <TextInputField
                              aria-label={fieldAriaLabel}
                              containerClassName={fieldClassName}
                              disabled={!canEdit}
                              errorMessage={error}
                              id={fieldElementId}
                              key={field.id}
                              label={field.label}
                              placeholder={field.placeholder}
                              required={field.required}
                              value={field.value}
                              onChange={(event) =>
                                onFieldChange({
                                  applicantId: activeApplicant.id,
                                  sectionId: section.id,
                                  fieldId: field.id,
                                  value: event.target.value,
                                })
                              }
                            />
                          );
                        })}
                      </div>
                    </CardComponent>
                  );
                })
              ) : (
                <CardComponent
                  as="section"
                  className="questionnaire-deck-empty visa-answer-card"
                >
                  <p className="kicker">Анкета</p>
                  <h4>Разделы не найдены</h4>
                  <p>Для этого заявителя пока нет полей анкеты.</p>
                </CardComponent>
              )}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}

function PassportExtractionReviewPanel({
  applicant,
  canEdit,
  enabled,
  onApplyField,
}: {
  applicant: Applicant;
  canEdit: boolean;
  enabled: boolean;
  onApplyField: (
    applicantId: string,
    key: PassportExtractedFieldKey,
    mode: PassportFieldApplyMode,
  ) => void;
}) {
  if (!enabled) return null;

  const state = applicant.passportExtraction;
  if (!state) return null;

  const rows = passportExtractionRows(applicant);
  const source = state.sourceFileName ?? "Загранпаспорт";

  if (state.status === "extracting") {
    return (
      <CardComponent as="section" className="passport-extraction-panel is-busy">
        <div>
          <p className="kicker">Паспорт</p>
          <h4>Распознавание выполняется</h4>
          <p>{source} · данные появятся здесь после проверки server contract.</p>
        </div>
      </CardComponent>
    );
  }

  if (state.status === "failed" || state.status === "unavailable") {
    return (
      <CardComponent as="section" className="passport-extraction-panel">
        <div>
          <p className="kicker">Паспорт</p>
          <h4>Автозаполнение недоступно</h4>
          <p>{state.error ?? state.summary ?? "Заполните паспортные поля вручную."}</p>
        </div>
      </CardComponent>
    );
  }

  if (!rows.length) return null;
  const safeRows = rows.filter((row) => !row.applied && !row.conflict);

  return (
    <CardComponent as="section" className="passport-extraction-panel">
      <div className="passport-extraction-head">
        <div>
          <p className="kicker">Паспорт · требуется проверка</p>
          <h4>{source}</h4>
          <p>
            {state.summary ?? "Поля из документа подготовлены для ручного применения."}
          </p>
          {state.orientation?.corrected ? (
            <p className="passport-extraction-orientation">
              Паспорт повернут автоматически на {state.orientation.rotation}° по MRZ.
            </p>
          ) : null}
        </div>
        <Badge className="visa-tag visa-tag-attention">
          {rows.filter((row) => !row.applied).length} к проверке
        </Badge>
        {canEdit && safeRows[0] ? (
          <Button
            onClick={() =>
              safeRows.map(({ key }) => onApplyField(applicant.id, key, "safe"))
            }
          >
            Авто
          </Button>
        ) : null}
      </div>
      <div className="passport-extraction-rows">
        {rows.map((row) => (
          <article className={row.conflict ? "has-conflict" : ""} key={row.key}>
            <div>
              <strong>{row.fieldLabel}</strong>
              <p>
                {row.conflict && row.currentValue
                  ? `Сейчас: ${row.currentValue}`
                  : row.sectionTitle}
              </p>
            </div>
            <span>{row.extractedValue}</span>
            <Badge
              className={row.conflict ? "visa-tag visa-tag-attention" : "visa-tag"}
            >
              {row.conflict ? "Конфликт" : row.confidence}
            </Badge>
            {row.applied ? (
              <Badge className="visa-tag visa-tag-ready">Применено</Badge>
            ) : (
              <Button
                className="compact-button"
                disabled={!canEdit}
                variant={row.conflict ? "secondary" : "primary"}
                onClick={() =>
                  onApplyField(applicant.id, row.key, row.conflict ? "replace" : "safe")
                }
              >
                {row.conflict ? "Заменить" : "Применить"}
              </Button>
            )}
          </article>
        ))}
      </div>
    </CardComponent>
  );
}

function questionnaireSectionKey(applicantId: string, sectionId: string) {
  return `${applicantId}:${sectionId}`;
}

function closedQuestionnaireSectionKey(applicantId: string) {
  return `${applicantId}:__closed__`;
}

function defaultQuestionnaireSectionKey(submission: Submission) {
  for (const applicant of submission.applicants) {
    const issue = submission.issues.find(
      (item) =>
        item.status !== "closed_by_admin" && item.target.applicantId === applicant.id,
    );
    const issueSection = applicant.sections.find(
      (section) =>
        section.title === issue?.target.section ||
        section.fields.some((field) => field.label === issue?.target.field),
    );

    if (issueSection) return questionnaireSectionKey(applicant.id, issueSection.id);
  }

  for (const applicant of submission.applicants) {
    const incompleteSection = applicant.sections.find(
      (section) => section.status !== "complete",
    );

    if (incompleteSection)
      return questionnaireSectionKey(applicant.id, incompleteSection.id);
  }

  const firstApplicant = submission.applicants[0];
  const firstSection = firstApplicant?.sections[0];

  return firstApplicant && firstSection
    ? questionnaireSectionKey(firstApplicant.id, firstSection.id)
    : "";
}

function DrawerFiles({
  agentOwnerId,
  fileUploadBusy = false,
  localPassportFileIds = [],
  onConfirmVisaApplicationPdfReview,
  onDismissVisaApplicationPdfReview,
  onExtractPassport,
  onPublishReturnedPdfHandoff,
  onReviewVisaApplicationPdf,
  onUploadFile,
  passportExtractionEnabled = false,
  requireSelectedFile = false,
  role,
  submission,
}: {
  agentOwnerId: AgentOwnerId;
  fileUploadBusy?: boolean;
  localPassportFileIds?: string[];
  onConfirmVisaApplicationPdfReview: (reviewId: string) => void;
  onDismissVisaApplicationPdfReview: (reviewId: string) => void;
  onExtractPassport: (fileId: string) => void;
  onPublishReturnedPdfHandoff: () => Promise<void>;
  onReviewVisaApplicationPdf: (file: File) => Promise<void>;
  onUploadFile: (fileId: string, file?: File) => void;
  passportExtractionEnabled?: boolean;
  requireSelectedFile?: boolean;
  role: Role;
  submission: Submission;
}) {
  const canEditFiles = canEditSubmissionContent(submission, role);
  const [pdfReviewBusy, setPdfReviewBusy] = useState(false);
  const [pdfReviewError, setPdfReviewError] = useState("");
  const [pdfHandoffBusy, setPdfHandoffBusy] = useState(false);
  const [pdfHandoffMessage, setPdfHandoffMessage] = useState("");
  const pdfReviewAvailable = submission.status === "exported";
  const pdfReviews = visaApplicationPdfReviewsForSubmission(submission);
  const pdfHandoffStatus = visaApplicationPdfAgentHandoffStatus(submission);
  const agentHandoffPackage = buildAgentHandoffPackage(submission);
  const agentReturnedPdfPackage =
    role === "agent"
      ? buildAgentReturnedPdfPackageView(submission, agentOwnerId)
      : null;
  const canReviewVisaPdf =
    pdfReviewAvailable &&
    !fileUploadBusy &&
    !pdfReviewBusy &&
    !pdfHandoffBusy &&
    role === "admin";
  const canPublishReturnedPdfHandoff = canReviewVisaPdf && agentHandoffPackage.ready;

  useEffect(() => {
    setPdfReviewBusy(false);
    setPdfReviewError("");
    setPdfHandoffBusy(false);
    setPdfHandoffMessage("");
  }, [submission.id]);

  async function handleVisaApplicationPdf(file: File) {
    setPdfReviewBusy(true);
    setPdfReviewError("");
    setPdfHandoffMessage("");
    try {
      await onReviewVisaApplicationPdf(file);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "PDF анкеты не удалось прочитать. Проверьте файл и попробуйте снова.";
      setPdfReviewError(message);
      window.alert(message);
    } finally {
      setPdfReviewBusy(false);
    }
  }

  async function handlePublishReturnedPdfHandoff() {
    setPdfHandoffBusy(true);
    setPdfReviewError("");
    setPdfHandoffMessage("");
    try {
      await onPublishReturnedPdfHandoff();
      setPdfHandoffMessage("Комплект PDF опубликован агенту.");
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Комплект PDF не удалось открыть агенту.";
      setPdfReviewError(message);
    } finally {
      setPdfHandoffBusy(false);
    }
  }

  return (
    <section className="drawer-section drawer-files-section">
      {pdfReviewAvailable && role === "admin" ? (
        <VisaApplicationPdfReviewPanel
          busy={pdfReviewBusy || pdfHandoffBusy}
          canPublish={canPublishReturnedPdfHandoff}
          canUpload={canReviewVisaPdf}
          error={pdfReviewError}
          handoffBlockers={agentHandoffPackage.blockers}
          handoffMessage={pdfHandoffMessage}
          handoffStatus={pdfHandoffStatus}
          applicants={submission.applicants}
          reviews={pdfReviews}
          submissionId={submission.id}
          onConfirm={onConfirmVisaApplicationPdfReview}
          onDismiss={onDismissVisaApplicationPdfReview}
          onPublish={handlePublishReturnedPdfHandoff}
          onReview={handleVisaApplicationPdf}
        />
      ) : null}
      {agentReturnedPdfPackage?.visible ? (
        <AgentReturnedPdfPackagePanel packageView={agentReturnedPdfPackage} />
      ) : null}
      <div className="file-matrix v17-file-matrix" aria-label="Файлы подачи">
        <div className="media-file-head" aria-hidden="true">
          <span>Файл</span>
          <span>Владелец</span>
          <span>Состояние</span>
        </div>
        {submission.files.length ? (
          submission.files.map((file) => {
            const applicant =
              submission.applicants.find((item) => item.id === file.applicantId) ??
              submission.applicants[0];
            const issue = submission.issues.find(
              (item) =>
                item.status !== "closed_by_admin" &&
                (item.id === file.linkedIssueId ||
                  (item.target.applicantId === file.applicantId &&
                    item.target.fileType === file.type)),
            );
            const canUploadFile =
              canEditFiles &&
              (file.status === "missing" || file.status === "needs_replacement");
            const uploadDisabled = fileUploadBusy;
            const extractionState = applicant?.passportExtraction;
            const hasLocalPassportFile = localPassportFileIds.includes(file.id);
            const canExtractPassport =
              passportExtractionEnabled &&
              canEditFiles &&
              file.type === "passport_scan" &&
              (Boolean(file.storagePath) || hasLocalPassportFile) &&
              (file.status === "uploaded" ||
                file.status === "pending_review" ||
                file.status === "accepted") &&
              Boolean(applicant) &&
              canStartPassportExtraction(applicant);
            const inputId = `file-upload-${submission.id}-${file.id}`;
            const uploadLabel = `${file.status === "needs_replacement" ? "Заменить" : "Загрузить"} ${fileLabel(file.type)}: ${applicant?.fullName ?? "заявитель"}`;

            return (
              <article
                aria-label={`${fileLabel(file.type)}: ${applicant?.fullName ?? "заявитель"}, ${fileStatusLabel(file)}`}
                className={`media-file-row ${issue ? "has-issue" : ""} ${file.status}`}
                id={targetElementId({
                  applicantId: file.applicantId,
                  fileType: file.type,
                  tab: "files",
                })}
                key={file.id}
                tabIndex={-1}
              >
                <div className="media-file-main">
                  <strong>{fileLabel(file.type)}</strong>
                  <p>{fileRequirementCopy(file, issue)}</p>
                </div>
                <div className="media-file-owner">
                  <span>{applicant?.fullName ?? "Заявитель"}</span>
                </div>
                <div className="media-file-status media-file-actions file-state-actions">
                  <Badge className={fileStatusPillClass(file.status)}>
                    {fileStatusLabel(file)}
                  </Badge>
                  {canUploadFile ? (
                    requireSelectedFile ? (
                      <>
                        <input
                          accept={
                            file.type === "passport_scan"
                              ? "image/jpeg,image/png,application/pdf"
                              : "image/jpeg,image/png"
                          }
                          aria-label={`Выбрать файл: ${uploadLabel}`}
                          className="sr-only"
                          disabled={uploadDisabled}
                          id={inputId}
                          type="file"
                          onChange={(event) => {
                            const selectedFile = event.currentTarget.files?.[0];
                            if (selectedFile) onUploadFile(file.id, selectedFile);
                            event.currentTarget.value = "";
                          }}
                        />
                        <label
                          className="mp-button secondary-button compact-button"
                          htmlFor={inputId}
                          aria-disabled={uploadDisabled || undefined}
                          role="button"
                          tabIndex={0}
                          onClick={(event) => {
                            if (!uploadDisabled) return;
                            event.preventDefault();
                          }}
                          onKeyDown={(event) => {
                            if (uploadDisabled) return;
                            if (event.key !== "Enter" && event.key !== " ") return;
                            event.preventDefault();
                            event.currentTarget.click();
                          }}
                        >
                          {uploadDisabled
                            ? "Сохранение"
                            : file.status === "needs_replacement"
                              ? "Заменить"
                              : "Загрузить"}
                        </label>
                      </>
                    ) : (
                      <Button
                        className="compact-button"
                        disabled={uploadDisabled}
                        variant="secondary"
                        aria-label={uploadLabel}
                        onClick={() => onUploadFile(file.id)}
                      >
                        {file.status === "needs_replacement" ? "Заменить" : "Загрузить"}
                      </Button>
                    )
                  ) : null}
                  {canExtractPassport ? (
                    <Button
                      className="compact-button"
                      variant="secondary"
                      onClick={() => onExtractPassport(file.id)}
                    >
                      {extractionState?.status === "ready"
                        ? "Распознать снова"
                        : "Распознать"}
                    </Button>
                  ) : extractionState?.status === "extracting" &&
                    file.type === "passport_scan" ? (
                    <Badge className="visa-tag">Распознавание</Badge>
                  ) : null}
                  {issue ? (
                    <Badge className="visa-tag visa-tag-attention">К замечанию</Badge>
                  ) : null}
                </div>
              </article>
            );
          })
        ) : (
          <EmptyState text="Файлы для подачи пока не заведены." />
        )}
      </div>
      <CardComponent as="section" className="surface v17-file-trust">
        <div className="guard warn">
          <span className="guard-icon" aria-hidden="true">
            i
          </span>
          <span>
            <strong>
              {canEditFiles ? "Загрузка обновляет подачу" : "Файлы только для просмотра"}
            </strong>
            <br />
            <span className="subtle">
              {canEditFiles
                ? requireSelectedFile
                  ? "Выберите файл: приватная загрузка обновит слот и состояние подачи."
                  : "В local/dev режиме кнопка загрузки обновляет слот, историю и готовность."
                : "Изменение файлов доступно агенту в черновике, работе или возврате."}
            </span>
          </span>
        </div>
      </CardComponent>
    </section>
  );
}

function VisaApplicationPdfReviewPanel({
  applicants,
  busy,
  canPublish,
  canUpload,
  error,
  handoffBlockers,
  handoffMessage,
  handoffStatus,
  onConfirm,
  onDismiss,
  onPublish,
  onReview,
  reviews,
  submissionId,
}: {
  applicants: Submission["applicants"];
  busy: boolean;
  canPublish: boolean;
  canUpload: boolean;
  error: string;
  handoffBlockers: string[];
  handoffMessage: string;
  handoffStatus: ReturnType<typeof visaApplicationPdfAgentHandoffStatus>;
  onConfirm: (reviewId: string) => void;
  onDismiss: (reviewId: string) => void;
  onPublish: () => void;
  onReview: (file: File) => void;
  reviews: NonNullable<Submission["visaApplicationPdfReviews"]>;
  submissionId: string;
}) {
  const inputId = `visa-application-pdf-${submissionId}`;
  const status = aggregateVisaPdfReviewStatus(applicants, reviews);
  const uploadDisabled = busy || handoffStatus.ok;
  const findings = reviews.flatMap((review) =>
    review.findings.map((finding) => ({
      ...finding,
      applicantName: review.applicantName,
      fileName: review.artifact?.fileName ?? review.fileName,
    })),
  );
  const missingApplicants = applicants.filter(
    (applicant) => !reviews.some((review) => review.applicantId === applicant.id),
  );
  const unmatchedReviews = reviews.filter((review) => !review.applicantId);

  const handoffBlocker = handoffBlockers[0] ?? handoffStatus.reason;
  const handoffActionLabel = busy
    ? "Передача"
    : canPublish
      ? "Передать агенту"
      : "Передача закрыта";
  const handoffActionTitle = canPublish
    ? `Открыть агенту комплект PDF: ${handoffStatus.reason}`
    : `Передача агентам недоступна: ${handoffBlocker}`;

  return (
    <CardComponent
      as="article"
      aria-label="Проверка PDF анкеты"
      className={`media-file-row ${status === "blocked" ? "has-issue needs_replacement" : ""}`}
    >
      <div className="media-file-main">
        <strong>PDF анкеты после выгрузки</strong>
        <p>
          {reviews.length
            ? `Проверено PDF: ${reviews.length}/${applicants.length}`
            : "Загрузите PDF, который вернулся после внешней обработки, чтобы поймать ошибки перед передачей агентам."}
        </p>
        {status === "blocked" ? (
          <p>Не отдавать агентам: есть критичные расхождения в анкете.</p>
        ) : status === "clear" ? (
          <p>Можно отдавать агентам: критичные данные совпали.</p>
        ) : status === "needs_review" ? (
          <p>Критичных ошибок нет, но предупреждения требуют ручного подтверждения.</p>
        ) : (
          <p>PDF после внешней обработки ещё не загружен.</p>
        )}
        {applicants.map((applicant) => {
          const review = reviews.find((item) => item.applicantId === applicant.id);
          const data = review?.data ?? {};
          const extractedName = [data.surname, data.firstName]
            .filter(Boolean)
            .join(" ");

          return (
            <p key={applicant.id}>
              {applicant.fullName}:{" "}
              {review
                ? `${visaPdfReviewStatusLabel(review.status)}${
                    extractedName ? `, ФИО PDF: ${extractedName}` : ""
                  }${data.passportNumber ? `, паспорт: ${data.passportNumber}` : ""}`
                : "PDF не загружен"}
            </p>
          );
        })}
        {missingApplicants.length ? (
          <p>
            Не хватает PDF: {missingApplicants.map((item) => item.fullName).join(", ")}.
          </p>
        ) : null}
        {unmatchedReviews.length ? (
          <p>
            Есть PDF, который не сопоставился с заявителем: {unmatchedReviews.length}.
          </p>
        ) : null}
        {reviews.some((review) => review.artifact?.extractionSource === "local_ocr") ? (
          <p>Источник текста: локальный OCR. Проверьте поля вручную перед передачей.</p>
        ) : null}
        {reviews.some(
          (review) =>
            review.status === "needs_review" &&
            review.handoffStatus === "ready_for_agent",
        ) ? (
          <p>Предупреждения подтверждены вручную.</p>
        ) : null}
        {error ? <p role="alert">{error}</p> : null}
        {handoffMessage ? <p role="status">{handoffMessage}</p> : null}
        {findings.length ? (
          <ul aria-label="Ошибки PDF анкеты">
            {findings.map((finding, index) => (
              <li key={`${finding.field}-${finding.fileName ?? "pdf"}-${index}`}>
                {finding.applicantName ? `${finding.applicantName}: ` : ""}
                {finding.message}
                {finding.expected || finding.value ? (
                  <>
                    {" "}
                    {finding.expected ? `Заявка: ${finding.expected}.` : ""}
                    {finding.value ? ` PDF: ${finding.value}.` : ""}
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        ) : null}
        {reviews.some(
          (review) =>
            review.status === "needs_review" &&
            review.handoffStatus !== "ready_for_agent",
        ) || unmatchedReviews.length ? (
          <div className="media-file-review-actions">
            {reviews.map((review) => {
              const needsConfirmation =
                review.status === "needs_review" &&
                review.handoffStatus !== "ready_for_agent";
              const canDismissReview =
                !review.applicantId || review.status === "blocked";
              if (!needsConfirmation && !canDismissReview) return null;

              return (
                <div className="media-file-review-action-row" key={review.id}>
                  <span>
                    {review.applicantName ??
                      review.artifact?.fileName ??
                      review.fileName ??
                      "PDF анкеты"}
                  </span>
                  {needsConfirmation ? (
                    <Button
                      disabled={busy || !canUpload}
                      variant="secondary"
                      onClick={() => onConfirm(review.id)}
                    >
                      Подтвердить
                    </Button>
                  ) : null}
                  {canDismissReview ? (
                    <Button
                      disabled={busy || !canUpload}
                      variant="ghost"
                      onClick={() => onDismiss(review.id)}
                    >
                      Снять PDF
                    </Button>
                  ) : null}
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
      <div className="media-file-status">
        <Badge className={visaPdfReviewPillClass(status)}>
          {visaPdfReviewStatusLabel(status)}
        </Badge>
      </div>
      <div className="media-file-actions">
        <Button
          aria-label={handoffActionTitle}
          disabled={!canPublish || busy}
          onClick={onPublish}
          title={handoffActionTitle}
          variant="secondary"
        >
          {handoffActionLabel}
        </Button>
        {canUpload ? (
          <>
            <input
              accept="application/pdf"
              aria-label="Выбрать PDF анкеты после выгрузки"
              className="sr-only"
              disabled={uploadDisabled}
              id={inputId}
              type="file"
              onChange={(event) => {
                const selectedFile = event.currentTarget.files?.[0];
                if (selectedFile) onReview(selectedFile);
                event.currentTarget.value = "";
              }}
            />
            <label
              aria-disabled={uploadDisabled || undefined}
              className="mp-button secondary-button compact-button"
              htmlFor={inputId}
              role="button"
              tabIndex={0}
              onClick={(event) => {
                if (!uploadDisabled) return;
                event.preventDefault();
              }}
              onKeyDown={(event) => {
                if (uploadDisabled) return;
                if (event.key !== "Enter" && event.key !== " ") return;
                event.preventDefault();
                event.currentTarget.click();
              }}
            >
              {busy
                ? "Проверка"
                : handoffStatus.ok
                  ? "PDF проверен"
                  : reviews.length
                    ? "Загрузить ещё PDF"
                    : "Проверить PDF"}
            </label>
          </>
        ) : null}
      </div>
    </CardComponent>
  );
}

function AgentReturnedPdfPackagePanel({
  packageView,
}: {
  packageView: ReturnType<typeof buildAgentReturnedPdfPackageView>;
}) {
  if (!packageView.visible) return null;

  return (
    <CardComponent
      as="article"
      aria-label="Returned PDF комплект агента"
      className="media-file-row"
    >
      <div className="media-file-main">
        <strong>Returned PDF комплект готов</strong>
        <p>
          Агент видит только свой опубликованный пакет: анкета PDF по каждому
          заявителю и общий appointment/list PDF по пакету.
        </p>
        {packageView.commonAppointmentPdf ? (
          <p>
            Пакет: {packageView.commonAppointmentPdf.fileName} · appointment_list_pdf
          </p>
        ) : null}
        {packageView.applicantPdfs.map((pdf) => (
          <p key={pdf.reviewId}>
            {pdf.applicantName}: {pdf.fileName} · application_form_pdf
          </p>
        ))}
      </div>
      <div className="media-file-status">
        <Badge className="visa-tag visa-tag-success">Готово агенту</Badge>
      </div>
    </CardComponent>
  );
}

function DrawerIssues({
  canAddIssue,
  onAcceptAiSuggestion,
  onAddIssue,
  onDismissAiSuggestion,
  onMarkIssueFixed,
  onOpenTarget,
  onRunAiReview,
  role,
  submission,
  surface,
}: {
  canAddIssue: boolean;
  onAcceptAiSuggestion: (suggestionId: string) => void;
  onAddIssue: () => void;
  onDismissAiSuggestion: (suggestionId: string) => void;
  onMarkIssueFixed: (issueId: string) => void;
  onOpenTarget: (target: WorkspaceTarget) => void;
  onRunAiReview: () => void;
  role: Role;
  submission: Submission;
  surface: "agent" | "review" | "export";
}) {
  return (
    <section className="drawer-section drawer-issues-section">
      {canAddIssue ? (
        <div className="drawer-issues-actions">
          <Button variant="secondary" onClick={onAddIssue}>
            Добавить замечание
          </Button>
        </div>
      ) : null}
      {surface !== "export" ? (
        <BbAiPanel
          compact
          onAccept={onAcceptAiSuggestion}
          onDismiss={onDismissAiSuggestion}
          onRun={onRunAiReview}
          role={role}
          submission={submission}
          surface={surface}
        />
      ) : null}
      <div className="issue-list v17-issue-list" id="workspace-issues">
        {submission.issues.length ? (
          submission.issues.map((issue) => {
            const target = targetForIssue(issue);
            const isFileIssue = target.tab === "files";

            return (
              <article
                className={`issue-card v17-issue-card ${issue.severity} ${issue.status} ${issueCardStateClass(issue)}`}
                id={`workspace-issue-${issue.id}`}
                key={issue.id}
                tabIndex={-1}
              >
                <div className="issue-head v17-issue-top">
                  <div className="issue-title-copy v17-issue-heading">
                    <strong>{issue.reason || drawerIssueTitle(issue)}</strong>
                    <span>{issueTarget(issue)}</span>
                  </div>
                  <Badge className={issueStatusPillClass(issue.status)}>
                    {issueStatusLabel(issue.status)}
                  </Badge>
                </div>
                <div className="issue-details-grid v17-issue-details">
                  <div className="v17-issue-detail">
                    <span>Причина</span>
                    <p>{drawerIssueSummary(issue)}</p>
                  </div>
                  <div className="v17-issue-detail">
                    <span>Комментарий</span>
                    <p>{issue.comment}</p>
                  </div>
                </div>
                <div className="issue-foot v17-issue-footer">
                  <Badge className={issueBadgeClass(issue.severity)}>
                    {issueSeverityLabel(issue.severity)}
                  </Badge>
                  {issue.status !== "closed_by_admin" ? (
                    <Button
                      aria-label={`${issue.status === "fixed_by_agent" ? "Проверить исправление" : "Открыть место исправления"}: ${drawerIssueTitle(issue)}`}
                      className="compact-button"
                      variant="secondary"
                      onClick={() => onOpenTarget(target)}
                    >
                      {issue.status === "fixed_by_agent"
                        ? "Проверить"
                        : isFileIssue
                          ? "Открыть файл"
                          : "Открыть точное поле"}
                    </Button>
                  ) : (
                    <Button className="compact-button" disabled variant="secondary">
                      Завершено
                    </Button>
                  )}
                  {role === "agent" &&
                  submission.status === "returned" &&
                  issue.status === "open" ? (
                    <Button
                      aria-label={`Отметить замечание исправленным: ${drawerIssueTitle(issue)}`}
                      className="compact-button"
                      variant="secondary"
                      onClick={() => onMarkIssueFixed(issue.id)}
                    >
                      Отметить исправленным
                    </Button>
                  ) : null}
                  {isFileIssue && role === "agent" ? (
                    <span className="v17-issue-note">
                      Загрузка доступна только для тестовых документов в пилотном режиме.
                    </span>
                  ) : null}
                </div>
              </article>
            );
          })
        ) : (
          <EmptyState text="Открытых замечаний нет." />
        )}
      </div>
    </section>
  );
}

type HistoryFilter = "all" | "bb" | "files" | "questionnaire" | "status";

function drawerHeaderMeta(submission: Submission) {
  return [
    submission.country,
    submission.city,
    typeLabels[submission.type],
    applicantCountLabel(submission.applicants.length),
    submission.id,
  ].join(" · ");
}

function drawerTabLabel(tab: DrawerTab, fallback: string) {
  if (tab === "files") return "Файлы";
  return fallback;
}

function DrawerHistory({ submission }: { submission: Submission }) {
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const events = drawerHistoryEvents(submission).filter((event) => {
    if (filter === "all") return true;
    if (filter === "bb") return event.source === "bb";
    return event.kind === filter;
  });

  return (
    <section className="drawer-section drawer-history-section">
      <div
        className="history-filter v17-history-filter"
        role="group"
        aria-label="Фильтр истории"
      >
        {[
          { id: "all", label: "Все" },
          { id: "questionnaire", label: "Анкета" },
          { id: "files", label: "Файлы" },
          { id: "status", label: "Статусы" },
        ].map((item) => (
          <Button
            className={filter === item.id ? "is-active" : ""}
            aria-pressed={filter === item.id}
            key={item.id}
            variant="ghost"
            onClick={() => setFilter(item.id as HistoryFilter)}
          >
            {item.label}
          </Button>
        ))}
      </div>
      <div className="history history-timeline v17-history-timeline">
        {events.length ? (
          events.map((event) => (
            <article className="history-event" key={event.id}>
              <strong>{event.text}</strong>
              <span>
                {event.at} · {event.actor}
              </span>
              {event.detail ? <p>{event.detail}</p> : null}
            </article>
          ))
        ) : (
          <EmptyState text="Событий пока нет." />
        )}
      </div>
    </section>
  );
}

function drawerHistoryEvents(submission: Submission) {
  const base = submission.history.map((event) => ({
    actor: historySourceLabel(event.source),
    at: event.at,
    detail: event.detail,
    id: event.id,
    kind: "status" as HistoryFilter,
    source: event.source,
    text: event.text,
  }));
  const issueEvents = submission.issues.slice(0, 3).map((issue) => ({
    actor: issue.target.applicantName,
    at: issue.createdAt,
    detail:
      issue.target.fileType || issue.type === "file" || issue.type === "media"
        ? "Новая версия ожидает ручной проверки администратора."
        : issue.comment,
    id: `issue-history-${issue.id}`,
    kind:
      issue.target.fileType || issue.type === "file" || issue.type === "media"
        ? ("files" as HistoryFilter)
        : ("questionnaire" as HistoryFilter),
    source: issue.createdBy,
    text:
      issue.target.fileType || issue.type === "file" || issue.type === "media"
        ? `${fileLabel(issue.target.fileType ?? "passport_scan")} заменено`
        : issue.target.field
          ? `${issue.target.field}: ${issue.reason}`
          : issue.reason,
  }));

  return [...base, ...issueEvents];
}

function historySourceLabel(source: Submission["history"][number]["source"]) {
  if (source === "bb") return "ББ";
  if (source === "admin") return "Администратор";
  if (source === "agent") return "Агент";
  if (source === "system") return "Система";
  return "Без источника";
}

function issueCountLabel(count: number) {
  if (count % 10 === 1 && count % 100 !== 11) return `${count} замечание`;
  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) {
    return `${count} замечания`;
  }
  return `${count} замечаний`;
}

function blockerCountLabel(count: number) {
  if (count % 10 === 1 && count % 100 !== 11) return `${count} блокер`;
  if ([2, 3, 4].includes(count % 10) && ![12, 13, 14].includes(count % 100)) {
    return `${count} блокера`;
  }
  return `${count} блокеров`;
}

function applicantVisualState(
  submission: Submission,
  applicant: Applicant,
): {
  label: string;
  tone: "amber" | "danger" | "muted" | "teal";
} {
  const percent = questionnaireProgressForApplicant(applicant);
  const hasBlocker = submission.issues.some(
    (issue) =>
      issue.status === "open" &&
      issue.severity === "blocker" &&
      issue.target.applicantId === applicant.id,
  );

  if (hasBlocker) {
    return { label: "Блокер", tone: "danger" };
  }
  if (percent === 100) {
    return { label: "Сверено", tone: "teal" };
  }
  if (percent > 0) {
    return { label: "В работе", tone: "amber" };
  }
  return { label: "Нет данных", tone: "muted" };
}

function questionnaireTone(
  status: QuestionnaireStatus,
): "amber" | "danger" | "muted" | "teal" {
  if (status === "complete") return "teal";
  if (status === "partial") return "amber";
  if (status === "needs_fix") return "danger";
  return "muted";
}

function issueBadgeClass(severity: IssueSeverity) {
  if (severity === "blocker") return "visa-tag visa-tag-danger";
  if (severity === "warning") return "visa-tag visa-tag-attention";
  return "visa-tag visa-tag-info";
}

function issueCategoryLabel(issue: Issue) {
  if (issue.target.fileType || issue.type === "file" || issue.type === "media") {
    return "Медиа";
  }
  if (issue.type === "section") return "Раздел";
  return "Данные";
}

function drawerIssueSummary(issue: Issue) {
  if (issue.target.fileType || issue.type === "file" || issue.type === "media") {
    return issue.reason || "Проверить файл";
  }
  if (issue.target.field)
    return issue.reason || `Проверить поле «${issue.target.field}»`;
  if (issue.target.section)
    return issue.reason || `Проверить раздел «${issue.target.section}»`;
  return "Проверить данные";
}

function drawerIssueTitle(issue: Issue) {
  const target = issue.target.fileType
    ? fileLabel(issue.target.fileType)
    : (issue.target.field ?? issue.target.section ?? "Данные");
  return `${issue.target.applicantName} · ${issueCategoryLabel(issue)} · ${target}`;
}

function fileRequirementCopy(file: Submission["files"][number], issue?: Issue) {
  if (issue) return drawerIssueSummary(issue);
  if (file.type === "passport_scan") return "Разворот с персональными данными";
  if (file.type === "photo") return "Архивный неканонический файл";
  if (file.type === "selfie") return "Селфи для проверки владельца документа";
  if (file.type === "selfie_2") return "Дополнительная проверка владельца";
  return "Проверка документа в кадре";
}

function applicantRoleLabel(role: Submission["applicants"][number]["role"]) {
  if (role === "main") return "Основной заявитель";
  if (role === "spouse") return "Супруг";
  if (role === "child") return "Ребёнок";
  return "Заявитель";
}

function applicantPassportHint(applicant: Applicant) {
  const passportValue = applicant.sections
    .flatMap((section) => section.fields)
    .find((field) => field.id === "passport-no" || field.label.includes("паспорта"))
    ?.value.trim();

  if (!passportValue) return "паспорт не указан";
  return `паспорт **** ${passportValue.slice(-3)}`;
}

function questionnaireLabel(
  status: Submission["applicants"][number]["questionnaireStatus"],
) {
  if (status === "empty") return "Нет данных";
  if (status === "partial") return "В работе";
  if (status === "complete") return "Сверено";
  return "На правку";
}

function issueSeverityLabel(severity: Issue["severity"]) {
  if (severity === "blocker") return "Блокер";
  if (severity === "warning") return "Предупреждение";
  return "Инфо";
}

function issueStatusLabel(status: Issue["status"]) {
  if (status === "open") return "Открыто";
  if (status === "fixed_by_agent") return "Исправлено агентом";
  return "Закрыто администратором";
}

function issueStatusPillClass(status: Issue["status"]) {
  if (status === "open") return "visa-tag visa-tag-danger";
  if (status === "fixed_by_agent") return "visa-tag visa-tag-attention";
  return "visa-tag visa-tag-ready";
}

function issueCardStateClass(issue: Issue) {
  if (issue.status === "fixed_by_agent") return "fixed";
  if (issue.status === "closed_by_admin") return "closed";
  return "open";
}

function issueTarget(issue: Issue) {
  const parts = [
    issue.target.applicantName,
    issue.target.section,
    issue.target.field,
    issue.target.fileType ? fileTypeLabels[issue.target.fileType] : undefined,
  ];
  return parts.filter(Boolean).join(" · ");
}

function drawerTabValue(submission: Submission, tab: DrawerTab) {
  if (tab === "overview") return `${submission.completeness.total}%`;
  if (tab === "applicants") return String(submission.applicants.length);
  if (tab === "questionnaire") return `${submission.completeness.questionnaire}%`;
  if (tab === "files") {
    const progress = fileReadyCount(submission);
    return `${progress.ready}/${progress.total}`;
  }
  if (tab === "issues")
    return String(openIssueCount(submission) + fixedIssueCount(submission));
  return String(submission.history.length);
}

function fileReadyCount(submission: Submission) {
  return {
    ready: submission.files.filter(
      (file) => file.status !== "missing" && file.status !== "needs_replacement",
    ).length,
    total: submission.files.length,
  };
}

function firstWorkLine(submission: Submission) {
  const firstOpenIssue = submission.issues.find((issue) => issue.status === "open");
  if (firstOpenIssue) {
    return `${firstOpenIssue.target.applicantName} · ${drawerIssueSummary(firstOpenIssue)}`;
  }

  const firstFixedIssue = submission.issues.find(
    (issue) => issue.status === "fixed_by_agent",
  );
  if (firstFixedIssue) return `${firstFixedIssue.target.applicantName} · ждёт проверки`;

  const firstMissingSection = submission.applicants
    .flatMap((applicant) =>
      applicant.sections.map((section) => ({ applicant, section })),
    )
    .find(({ section }) => section.status !== "complete");
  if (firstMissingSection) {
    return `${firstMissingSection.applicant.fullName} · ${firstMissingSection.section.title}`;
  }

  return nextProblem(submission);
}

function sectionIssue(
  submission: Submission,
  applicantId: string,
  sectionTitle: string,
) {
  return submission.issues.find(
    (issue) =>
      issue.status === "open" &&
      issue.target.applicantId === applicantId &&
      (issue.target.section === sectionTitle ||
        ((issue.target.section === "Анкета" || issue.target.section === "Данные") &&
          submission.applicants
            .find((applicant) => applicant.id === applicantId)
            ?.sections.find((section) => section.title === sectionTitle)
            ?.fields.some((field) => field.label === issue.target.field))),
  );
}

function fieldIssueFor(
  submission: Submission,
  applicantId: string,
  sectionTitle: string,
  fieldLabel: string,
) {
  return submission.issues.find(
    (issue) =>
      issue.status === "open" &&
      issue.target.applicantId === applicantId &&
      (issue.target.section === sectionTitle ||
        issue.target.section === "Анкета" ||
        issue.target.section === "Данные") &&
      issue.target.field === fieldLabel,
  );
}

function fileStatusPillClass(status: SubmissionFileStatus) {
  if (status === "accepted") return "status-pill ready";
  if (status === "uploaded" || status === "pending_review")
    return "status-pill warning";
  if (status === "needs_replacement") return "status-pill danger";
  return "status-pill muted";
}

type VisaPdfReviewStatus =
  | NonNullable<Submission["visaApplicationPdfReview"]>["status"]
  | "missing";

function visaPdfReviewStatusLabel(status?: VisaPdfReviewStatus) {
  if (status === "clear") return "Можно отдать";
  if (status === "blocked") return "Не отдавать";
  if (status === "needs_review") return "Требует проверки";
  return "Ждёт PDF";
}

function visaPdfReviewPillClass(status?: VisaPdfReviewStatus) {
  if (status === "clear") return "visa-tag visa-tag-ready";
  if (status === "blocked") return "visa-tag visa-tag-danger";
  if (status === "needs_review") return "visa-tag visa-tag-attention";
  return "visa-tag visa-tag-muted";
}

function aggregateVisaPdfReviewStatus(
  applicants: Submission["applicants"],
  reviews: NonNullable<Submission["visaApplicationPdfReviews"]>,
): VisaPdfReviewStatus {
  if (!reviews.length) return "missing";
  if (reviews.some((review) => review.status === "blocked")) return "blocked";
  if (
    applicants.some(
      (applicant) =>
        !reviews.some(
          (review) =>
            review.applicantId === applicant.id && review.status !== "blocked",
        ),
    )
  ) {
    return "missing";
  }
  if (
    reviews.some(
      (review) =>
        review.status === "needs_review" && review.handoffStatus !== "ready_for_agent",
    )
  ) {
    return "needs_review";
  }
  return "clear";
}
