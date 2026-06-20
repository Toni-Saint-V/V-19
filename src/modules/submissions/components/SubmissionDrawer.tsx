import { type ReactNode, useEffect, useLayoutEffect, useRef, useState } from "react";
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
  canAgentEditSubmissionContent,
  getPrimaryAction,
  nextProblem,
  openIssueCount,
  blockerCount,
  fixedIssueCount,
  statusLabels,
} from "../status";
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
  activeMediaFileTypes,
  buildReadinessQueue,
  fileLabel,
  fileStatusLabel,
  firstActionableQueueItem,
  tabForTarget,
  targetElementId,
  targetForIssue,
  workspaceTabs,
  type ReadinessQueueItem,
  type WorkspaceTarget,
} from "../workspaceModel";
import type {
  ActionDecision,
  Applicant,
  DrawerTab,
  Issue,
  IssueSeverity,
  IssueInput,
  PassportExtractedFieldKey,
  QuestionnaireField,
  QuestionnaireStatus,
  Role,
  Submission,
  SubmissionAction,
  SubmissionFileStatus,
  SubmissionFileType,
} from "../types";
import type { SubmissionNextStepAction } from "../submissionNextStepEngine";
import { AiHelperSurfacePanel } from "./AiHelperSurfacePanel";
import { BbAiPanel } from "./BbAiPanel";
import { EmptyState } from "./Primitives";

export function SubmissionDrawer({
  activeTab,
  fileUploadBusy = false,
  issueComposerRequest,
  localPassportFileIds = [],
  onAction,
  onAddIssue,
  onIssueComposerConsumed,
  onClose,
  onAcceptAiSuggestion,
  onDismissAiSuggestion,
  onRunAiReview,
  onTab,
  onQuestionnaireField,
  onApplyPassportField,
  onExtractPassport,
  onUploadFile,
  passportExtractionEnabled = false,
  requireSelectedFile,
  role,
  submission,
  surface,
}: {
  activeTab: DrawerTab;
  fileUploadBusy?: boolean;
  issueComposerRequest: { submissionId: string; token: number } | null;
  localPassportFileIds?: string[];
  onAction: (action: SubmissionAction) => void;
  onAddIssue: (input: IssueInput) => void;
  onIssueComposerConsumed: () => void;
  onAcceptAiSuggestion: (suggestionId: string) => void;
  onClose: () => void;
  onDismissAiSuggestion: (suggestionId: string) => void;
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
  const [pendingTarget, setPendingTarget] = useState<WorkspaceTarget | null>(null);
  const drawerBodyRef = useRef<HTMLDivElement | null>(null);
  const tabNavigationModeRef = useRef<"manual" | "target">("manual");
  const canOpenIssueComposer =
    surface === "review" && canAddAdminIssue(submission, role);
  const contentCanBeEdited =
    role === "agent" && canAgentEditSubmissionContent(submission);
  const footerHint =
    primaryAction.reason ??
    (contentCanBeEdited
      ? "Изменения сохраняются внутри подачи"
      : "Проверьте данные и выберите действие по подаче");
  useEffect(() => {
    setIssueComposerOpen(false);
  }, [submission.id]);

  useEffect(() => {
    if (canOpenIssueComposer && issueComposerRequest?.submissionId === submission.id) {
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
    if (!canOpenIssueComposer) setIssueComposerOpen(false);
  }, [canOpenIssueComposer]);

  useLayoutEffect(() => {
    if (tabNavigationModeRef.current === "target") return;
    drawerBodyRef.current?.scrollTo({ behavior: "auto", top: 0 });
  }, [activeTab, submission.id]);

  useLayoutEffect(() => {
    if (!pendingTarget || tabForTarget(pendingTarget) !== activeTab) return;

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
  }, [activeTab, pendingTarget]);

  function openTarget(target: WorkspaceTarget) {
    tabNavigationModeRef.current = "target";
    onTab(tabForTarget(target));
    setPendingTarget(target);
  }

  function handleTabChange(tab: DrawerTab) {
    tabNavigationModeRef.current = "manual";
    onTab(tab);
  }

  function openFirstProblem() {
    const first = firstActionableQueueItem(submission);
    if (first) openTarget(first.target);
  }

  function handleAiPrimaryAction(action: SubmissionNextStepAction) {
    if (action.disabled) return;
    if (action.target) {
      openTarget(action.target);
      return;
    }
    if (action.submissionAction) {
      onAction(action.submissionAction);
    }
  }

  return (
    <SheetFrame
      className="submission-drawer"
      labelledBy="drawer-title"
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        event.stopPropagation();
        if (issueComposerOpen) {
          setIssueComposerOpen(false);
          return;
        }
        onClose();
      }}
    >
      <header className="drawer-header">
        <div className="drawer-title-block">
          <h2 id="drawer-title">{submission.title}</h2>
        </div>
        <Button variant="icon" aria-label="Закрыть подачу" onClick={onClose}>
          ×
        </Button>
      </header>

      <DrawerTabs
        ariaLabel="Разделы подачи"
        autoFocusOnValueChange={tabNavigationModeRef.current !== "target"}
        tabs={workspaceTabs.map((tab) => ({
          ...tab,
          meta: drawerTabValue(submission, tab.id),
        }))}
        value={activeTab}
        onValueChange={handleTabChange}
      />

      <div
        className="drawer-body workspace-drawer-body"
        id={`drawer-panel-${activeTab}`}
        ref={drawerBodyRef}
        role="tabpanel"
        aria-labelledby={`drawer-tab-${activeTab}`}
      >
        <main className="workspace-main">
          {activeTab === "overview" ? (
            <DrawerOverview
              onAiPrimaryAction={handleAiPrimaryAction}
              onOpenTarget={openTarget}
              primaryAction={primaryAction}
              role={role}
              submission={submission}
              surface={surface}
            />
          ) : null}
          {activeTab === "applicants" ? (
            <DrawerApplicants onOpenTarget={openTarget} submission={submission} />
          ) : null}
          {activeTab === "questionnaire" ? (
            <DrawerQuestionnaire
              onApplyPassportField={onApplyPassportField}
              onFieldChange={onQuestionnaireField}
              passportExtractionEnabled={passportExtractionEnabled}
              pendingTarget={pendingTarget}
              role={role}
              submission={submission}
            />
          ) : null}
          {activeTab === "files" ? (
            <DrawerFiles
              fileUploadBusy={fileUploadBusy}
              localPassportFileIds={localPassportFileIds}
              onExtractPassport={onExtractPassport}
              onUploadFile={onUploadFile}
              passportExtractionEnabled={passportExtractionEnabled}
              pendingTarget={pendingTarget}
              requireSelectedFile={requireSelectedFile}
              role={role}
              submission={submission}
            />
          ) : null}
          {activeTab === "issues" ? (
            <DrawerIssues
              onAcceptAiSuggestion={onAcceptAiSuggestion}
              onDismissAiSuggestion={onDismissAiSuggestion}
              onOpenTarget={openTarget}
              onRunAiReview={onRunAiReview}
              role={role}
              submission={submission}
              surface={surface}
            />
          ) : null}
          {activeTab === "history" ? <DrawerHistory submission={submission} /> : null}
        </main>
      </div>

      {canOpenIssueComposer && issueComposerOpen ? (
        <IssueComposer
          submission={submission}
          onCancel={() => setIssueComposerOpen(false)}
          onSubmit={(input) => {
            onAddIssue(input);
            setIssueComposerOpen(false);
          }}
        />
      ) : null}

      <footer className="drawer-footer">
        <span>
          {issueComposerOpen
            ? "Сначала создайте или отмените новое замечание"
            : footerHint}
        </span>
        {!issueComposerOpen && firstActionableQueueItem(submission) ? (
          <Button variant="secondary" onClick={openFirstProblem}>
            Открыть первый блокер
          </Button>
        ) : null}
        {canOpenIssueComposer && !issueComposerOpen ? (
          <Button variant="secondary" onClick={() => setIssueComposerOpen(true)}>
            Добавить замечание
          </Button>
        ) : null}
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

function IssueComposer({
  onCancel,
  onSubmit,
  submission,
}: {
  onCancel: () => void;
  onSubmit: (input: IssueInput) => void;
  submission: Submission;
}) {
  const [applicantId, setApplicantId] = useState(submission.applicants[0]?.id ?? "");
  const [targetKind, setTargetKind] = useState<"questionnaire" | "files">(
    "questionnaire",
  );
  const [fieldLabel, setFieldLabel] = useState("");
  const [fileType, setFileType] =
    useState<NonNullable<IssueInput["fileType"]>>("photo");
  const [severity, setSeverity] = useState<IssueInput["severity"]>("blocker");
  const [reason, setReason] = useState("Нужно уточнить маршрут поездки");
  const [comment, setComment] = useState(
    "Проверьте целевое поле и отправьте исправление.",
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

    onSubmit({
      type: targetKind === "files" ? "file" : "field",
      applicantId: applicant.id,
      section: targetKind === "files" ? "Медиа" : "Данные",
      field: targetKind === "files" ? undefined : selectedField,
      fileType: targetKind === "files" ? fileType : undefined,
      reason,
      comment,
      severity,
    });
  }

  return (
    <section className="issue-composer" aria-label="Новое замечание">
      <div>
        <p className="kicker">Новое замечание</p>
        <h3>Точная цель возврата</h3>
      </div>
      <div className="issue-composer-grid">
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
        <TextInputField
          containerClassName=""
          label="Причина"
          ref={reasonInputRef}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
        />
        <TextInputField
          containerClassName=""
          label="Комментарий агенту"
          value={comment}
          onChange={(event) => setComment(event.target.value)}
        />
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

function DrawerSectionHeader({
  action,
  badge,
  title,
}: {
  action?: ReactNode;
  badge?: ReactNode;
  title: string;
}) {
  return (
    <div className="drawer-section-header">
      <div>
        <h3>{title}</h3>
      </div>
      {badge || action ? (
        <div className="drawer-section-header-side">
          {badge}
          {action}
        </div>
      ) : null}
    </div>
  );
}

function IssueCategoryTag({ issue }: { issue: Issue }) {
  return <Badge className="drawer-category-tag">{issueCategoryLabel(issue)}</Badge>;
}

function SegmentedFilter<T extends string>({
  ariaLabel,
  items,
  onChange,
  value,
}: {
  ariaLabel: string;
  items: Array<{ count?: number; id: T; label: string }>;
  onChange: (value: T) => void;
  value: T;
}) {
  return (
    <div className="drawer-filter-tabs" role="group" aria-label={ariaLabel}>
      {items.map((item) => (
        <Button
          aria-pressed={value === item.id}
          className={value === item.id ? "is-active" : ""}
          key={item.id}
          variant="ghost"
          onClick={() => onChange(item.id)}
        >
          <span>{item.label}</span>
          {typeof item.count === "number" ? <em>{item.count}</em> : null}
        </Button>
      ))}
    </div>
  );
}

function DrawerApplicants({
  onOpenTarget,
  submission,
}: {
  onOpenTarget: (target: WorkspaceTarget) => void;
  submission: Submission;
}) {
  const applicantsWithIssues = submission.applicants.filter((applicant) =>
    submission.issues.some(
      (issue) => issue.status === "open" && issue.target.applicantId === applicant.id,
    ),
  );
  const [filter, setFilter] = useState<ApplicantFilter>(() =>
    applicantsWithIssues.length ? "issues" : "all",
  );
  const visibleApplicants =
    filter === "issues" && applicantsWithIssues.length
      ? applicantsWithIssues
      : submission.applicants;

  useEffect(() => {
    setFilter(applicantsWithIssues.length ? "issues" : "all");
  }, [applicantsWithIssues.length, submission.id]);

  return (
    <section className="drawer-section">
      <DrawerSectionHeader
        title="Состояние по каждому человеку"
        action={
          <SegmentedFilter
            ariaLabel="Фильтр заявителей"
            items={[
              { count: applicantsWithIssues.length, id: "issues", label: "Проблемы" },
              { count: submission.applicants.length, id: "all", label: "Все" },
            ]}
            value={filter}
            onChange={setFilter}
          />
        }
      />
      <div className="drawer-list applicant-work-list" aria-label="Заявители в подаче">
        {visibleApplicants.map((applicant) => {
          const openIssues = submission.issues.filter(
            (issue) =>
              issue.status === "open" && issue.target.applicantId === applicant.id,
          );
          const blockerTotal = openIssues.filter(
            (issue) => issue.severity === "blocker",
          ).length;
          const fileIssue = openIssues.find((issue) => issue.target.fileType);
          const firstIncompleteSection =
            applicant.sections.find((section) => section.status !== "complete") ??
            applicant.sections[0];
          const questionnaireTarget: WorkspaceTarget = {
            applicantId: applicant.id,
            section: firstIncompleteSection?.title,
            tab: "questionnaire",
          };
          const filesTarget: WorkspaceTarget | null = fileIssue?.target.fileType
            ? {
                applicantId: applicant.id,
                fileType: fileIssue.target.fileType,
                tab: "files",
              }
            : null;
          const percent = questionnaireProgressForApplicant(applicant);
          const visualState = applicantVisualState(submission, applicant);

          return (
            <CardComponent
              as="article"
              aria-label={`${applicant.fullName}: ${percent}%, ${
                blockerTotal
                  ? blockerCountLabel(blockerTotal)
                  : openIssues.length
                    ? issueCountLabel(openIssues.length)
                    : "без замечаний"
              }`}
              className={`applicant-work-card ${visualState.tone}`}
              key={applicant.id}
            >
              <div className="applicant-work-main">
                <div>
                  <strong>{applicant.fullName}</strong>
                  <p>{applicantRoleLabel(applicant.role)}</p>
                </div>
              </div>
              <div className="applicant-work-tags">
                <Badge className="visa-tag visa-tag-muted">{percent}%</Badge>
                {blockerTotal ? (
                  <Badge className="visa-tag visa-tag-danger">
                    {blockerCountLabel(blockerTotal)}
                  </Badge>
                ) : null}
              </div>
              <div className="applicant-work-actions">
                <Button
                  variant="secondary"
                  onClick={() => onOpenTarget(questionnaireTarget)}
                >
                  Анкета
                </Button>
                {filesTarget ? (
                  <Button variant="secondary" onClick={() => onOpenTarget(filesTarget)}>
                    Файл
                  </Button>
                ) : null}
              </div>
            </CardComponent>
          );
        })}
      </div>
    </section>
  );
}

function DrawerOverview({
  onAiPrimaryAction,
  onOpenTarget,
  primaryAction,
  role,
  submission,
  surface,
}: {
  onAiPrimaryAction: (action: SubmissionNextStepAction) => void;
  onOpenTarget: (target: WorkspaceTarget) => void;
  primaryAction: ActionDecision;
  role: Role;
  submission: Submission;
  surface: "agent" | "review" | "export";
}) {
  const blockers = blockerCount(submission);
  const openIssues = openIssueCount(submission);
  const needsAttention = Boolean(blockers || openIssues);
  const fileProgress = fileReadyCount(submission);
  const nextLine = firstWorkLine(submission);
  const queue = buildReadinessQueue(submission).filter(
    (item) => !(item.type === "admin_blocker" && item.status === "open"),
  );
  const openIssueList = submission.issues.filter((issue) => issue.status === "open");
  const [focus, setFocus] = useState<OverviewFocus>(() =>
    openIssueList.length ? "issues" : "queue",
  );

  useEffect(() => {
    setFocus(openIssueList.length ? "issues" : "queue");
  }, [openIssueList.length, submission.id]);

  return (
    <section className="drawer-section drawer-overview">
      <CardComponent
        as="article"
        className={`decision-card ${needsAttention ? "needs-attention" : ""}`}
      >
        <div>
          <p className="kicker">Решение</p>
          <h3>{decisionTitle(submission, primaryAction)}</h3>
          <p>{nextLine}</p>
        </div>
        <Badge
          className={`decision-card-badge ${
            needsAttention ? "is-attention" : "is-clear"
          }`}
        >
          {decisionBadge(submission, primaryAction)}
        </Badge>
        <dl>
          <div>
            <dt>Статус</dt>
            <dd>{reviewStageLabel(submission.status)}</dd>
          </div>
          <div>
            <dt>Пакет</dt>
            <dd>
              {fileProgress.ready} из {fileProgress.total}
            </dd>
          </div>
          <div>
            <dt>Открыто</dt>
            <dd>{openIssues ? issueCountLabel(openIssues) : "Нет замечаний"}</dd>
          </div>
          <div>
            <dt>Анкета</dt>
            <dd>{submission.completeness.questionnaire}%</dd>
          </div>
          <div>
            <dt>Файлы</dt>
            <dd>{submission.completeness.files}%</dd>
          </div>
          <div>
            <dt>Действие</dt>
            <dd>{primaryAction.label}</dd>
          </div>
        </dl>
      </CardComponent>
      <AiHelperSurfacePanel
        compact
        onPrimaryAction={onAiPrimaryAction}
        role={role}
        submission={submission}
        surface={surface}
      />
      <section className="workspace-queue" aria-label="Фокус подачи">
        <DrawerSectionHeader
          title={focus === "issues" ? "Открытые препятствия" : "Очередь"}
          action={
            <SegmentedFilter
              ariaLabel="Фокус подачи"
              items={[
                { count: openIssueList.length, id: "issues", label: "Замечания" },
                { count: queue.length, id: "queue", label: "Очередь" },
              ]}
              value={focus}
              onChange={setFocus}
            />
          }
        />
        {focus === "issues" ? (
          <div className="compact-issue-list">
            {openIssueList.length ? (
              openIssueList.map((issue) => (
                <CompactIssueRow
                  issue={issue}
                  key={issue.id}
                  onOpenTarget={onOpenTarget}
                />
              ))
            ) : (
              <EmptyState text="Открытых замечаний нет." />
            )}
          </div>
        ) : (
          <div className="workspace-queue-list">
            {queue.length ? (
              queue.map((item) => (
                <QueueItemCard item={item} key={item.id} onOpenTarget={onOpenTarget} />
              ))
            ) : (
              <EmptyState text="Активных шагов нет." />
            )}
          </div>
        )}
      </section>
    </section>
  );
}

function CompactIssueRow({
  issue,
  onOpenTarget,
}: {
  issue: Issue;
  onOpenTarget: (target: WorkspaceTarget) => void;
}) {
  return (
    <CardComponent as="article" className={`compact-issue-row ${issue.severity}`}>
      <div>
        <strong>{issue.target.applicantName}</strong>
        <p>{drawerIssueSummary(issue)}</p>
      </div>
      <IssueCategoryTag issue={issue} />
      <Button
        aria-label="Открыть место исправления"
        className="compact-button"
        variant="secondary"
        onClick={() => onOpenTarget(targetForIssue(issue))}
      >
        Перейти
      </Button>
    </CardComponent>
  );
}

function QueueItemCard({
  item,
  onOpenTarget,
}: {
  item: ReadinessQueueItem;
  onOpenTarget: (target: WorkspaceTarget) => void;
}) {
  return (
    <CardComponent as="article" className={`workspace-queue-item ${item.tone}`}>
      <div>
        <strong>{item.title}</strong>
        <p>{item.body}</p>
      </div>
      <Badge className={queueBadgeClass(item)}>{queueSourceLabel(item)}</Badge>
      <Button
        aria-label={item.actionLabel}
        className="compact-button"
        variant="secondary"
        onClick={() => onOpenTarget(item.target)}
      >
        {queueActionLabel(item.actionLabel)}
      </Button>
    </CardComponent>
  );
}

function queueActionLabel(label: string) {
  if (label === "Открыть место исправления") return "Перейти";
  if (label === "Открыть раздел") return "Раздел";
  return label;
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
  const canEdit = role === "agent" && canAgentEditSubmissionContent(submission);
  const problemCount = questionnaireProblemCount(submission);
  const questionnaireReady =
    submission.completeness.questionnaire === 100 && problemCount === 0;
  const [openSectionState, setOpenSectionState] = useState(() => ({
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
  const activeApplicantId =
    openSectionKey.split(":")[0] || submission.applicants[0]?.id || "";
  const activeApplicant =
    submission.applicants.find((applicant) => applicant.id === activeApplicantId) ??
    submission.applicants[0];

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

  function activateApplicant(applicantId: string) {
    const applicant =
      submission.applicants.find((item) => item.id === applicantId) ??
      submission.applicants[0];
    if (!applicant) return;

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

  return (
    <section
      className={`drawer-section questionnaire-screen visa-form-screen ${
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
          className="questionnaire-workspace visa-form-workspace"
          aria-label="Заявители семьи"
        >
          {submission.applicants.map((applicant) => {
            const visualState = applicantVisualState(submission, applicant);
            const expandedApplicant = activeApplicant?.id === applicant.id;
            const applicantPanelId = `questionnaire-applicant-${applicant.id}`;

            return (
              <CardComponent
                as="article"
                className={`questionnaire-card visa-applicant-sheet questionnaire-applicant-accordion ${
                  expandedApplicant ? "is-expanded" : "is-collapsed"
                } ${visualState.tone}`}
                key={applicant.id}
              >
                <Button
                  aria-controls={applicantPanelId}
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
                    <Badge tone="blue">
                      {questionnaireProgressForApplicant(applicant)}%
                    </Badge>
                    {shouldShowApplicantStateBadge(submission, applicant) ? (
                      <Badge tone={visualState.tone}>{visualState.label}</Badge>
                    ) : null}
                    <span className="accordion-chevron" aria-hidden="true" />
                  </span>
                </Button>
                {expandedApplicant ? (
                  <div className="questionnaire-applicant-panel" id={applicantPanelId}>
                    <PassportExtractionReviewPanel
                      applicant={applicant}
                      canEdit={canEdit}
                      enabled={passportExtractionEnabled}
                      onApplyField={onApplyPassportField}
                    />
                    <div className="questionnaire-section-list visa-section-stack">
                      {applicant.sections.map((section) => {
                        const issue = sectionIssue(
                          submission,
                          applicant.id,
                          section.title,
                        );
                        const sectionKey = questionnaireSectionKey(
                          applicant.id,
                          section.id,
                        );
                        const sectionElementId = targetElementId({
                          applicantId: applicant.id,
                          section: section.title,
                          tab: "questionnaire",
                        });
                        const fieldsId = `questionnaire-fields-${applicant.id}-${section.id}`;
                        const expanded = openSectionKey === sectionKey;

                        return (
                          <CardComponent
                            as="section"
                            className={`questionnaire-edit-section visa-section-card ${
                              issue ? "has-issue" : ""
                            } ${expanded ? "is-expanded" : "is-collapsed"}`}
                            id={sectionElementId}
                            key={section.id}
                            aria-label={`${applicant.fullName}: ${section.title}`}
                          >
                            <Button
                              className="questionnaire-section-heading visa-section-trigger"
                              variant="plain"
                              type="button"
                              aria-controls={fieldsId}
                              aria-expanded={expanded}
                              onClick={() =>
                                openQuestionnaireSection(sectionKey, sectionElementId)
                              }
                              onFocus={() =>
                                openQuestionnaireSection(sectionKey, sectionElementId)
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
                                    <p className="visa-section-note">
                                      {section.missing}
                                    </p>
                                  ) : null}
                                </div>
                              </div>
                              <span className="questionnaire-section-side">
                                {issue || section.status !== "complete" ? (
                                  <Badge tone={questionnaireTone(section.status)}>
                                    {questionnaireLabel(section.status)}
                                  </Badge>
                                ) : null}
                                <span
                                  className="accordion-chevron"
                                  aria-hidden="true"
                                />
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
                                  applicant.id,
                                  section.title,
                                  field.label,
                                );
                                const error = field.error ?? fieldIssue?.reason;
                                const fieldClassName = `visa-field ${field.span === "full" ? "is-full" : ""} ${error ? "has-error" : ""}`;
                                const fieldAriaLabel = `${applicant.fullName} · ${section.title} · ${field.label}`;
                                const fieldElementId = targetElementId({
                                  applicantId: applicant.id,
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
                                          applicantId: applicant.id,
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
                                        applicantId: applicant.id,
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
                      })}
                    </div>
                  </div>
                ) : null}
              </CardComponent>
            );
          })}
        </div>
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

function reviewStageLabel(status: Submission["status"]) {
  if (status === "submitted_for_review") return "Внутренняя проверка";
  if (status === "requires_action" || status === "returned") return "Нужны исправления";
  if (status === "corrections_received") return "Исправления получены";
  if (status === "ready_for_export") return "Экспортный пакет готов";
  if (status === "exported") return "Архив выгрузки";
  return statusLabels[status];
}

function questionnaireSectionKey(applicantId: string, sectionId: string) {
  return `${applicantId}:${sectionId}`;
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
  fileUploadBusy = false,
  localPassportFileIds = [],
  onExtractPassport,
  onUploadFile,
  passportExtractionEnabled = false,
  pendingTarget,
  requireSelectedFile = false,
  role,
  submission,
}: {
  fileUploadBusy?: boolean;
  localPassportFileIds?: string[];
  onExtractPassport: (fileId: string) => void;
  onUploadFile: (fileId: string, file?: File) => void;
  passportExtractionEnabled?: boolean;
  pendingTarget: WorkspaceTarget | null;
  requireSelectedFile?: boolean;
  role: Role;
  submission: Submission;
}) {
  const progress = fileReadyCount(submission);
  const canEditFiles = role === "agent" && canAgentEditSubmissionContent(submission);
  const initialCategory = initialFileCategory(submission);
  const [activeCategory, setActiveCategory] = useState<FileCategoryId>(
    () => initialCategory,
  );
  const activeCategoryConfig =
    fileCategoryConfigs.find((category) => category.id === activeCategory) ??
    fileCategoryConfigs[0];
  const fileTypes = activeCategoryConfig.types;
  const categoryProgress = fileCategoryProgress(submission, activeCategoryConfig);
  const categoryHasIssue = submission.issues.some(
    (issue) =>
      issue.status === "open" &&
      issue.target.fileType &&
      activeCategoryConfig.types.includes(issue.target.fileType),
  );

  useEffect(() => {
    setActiveCategory(initialCategory);
  }, [initialCategory, submission.id]);

  useLayoutEffect(() => {
    if (pendingTarget?.tab !== "files") return;

    const category = fileCategoryForType(pendingTarget.fileType);
    if (category) setActiveCategory(category.id);
  }, [pendingTarget]);

  return (
    <section className="drawer-section">
      <DrawerSectionHeader
        title="Паспорт, фото и селфи"
        badge={
          <Badge className="visa-tag visa-tag-muted">
            {progress.ready}/{progress.total}
          </Badge>
        }
      />
      <div
        className="document-category-tabs"
        role="group"
        aria-label="Категории документов"
      >
        {fileCategoryConfigs.map((category) => {
          const categoryStats = fileCategoryProgress(submission, category);
          const hasIssue = submission.issues.some(
            (issue) =>
              issue.status === "open" &&
              issue.target.fileType &&
              category.types.includes(issue.target.fileType),
          );

          return (
            <Button
              aria-pressed={activeCategory === category.id}
              className={activeCategory === category.id ? "is-active" : ""}
              key={category.id}
              variant="plain"
              onClick={() => setActiveCategory(category.id)}
            >
              <span>{category.label}</span>
              <em>
                {categoryStats.ready}/{categoryStats.total}
              </em>
              {hasIssue ? <i aria-label="Есть замечание" /> : null}
            </Button>
          );
        })}
      </div>
      <DrawerSectionHeader
        title={activeCategoryConfig.title}
        badge={
          <Badge
            className={
              categoryHasIssue
                ? "visa-tag visa-tag-danger"
                : categoryProgress.ready === categoryProgress.total
                  ? "visa-tag visa-tag-ready"
                  : "visa-tag visa-tag-attention"
            }
          >
            {categoryHasIssue
              ? "Есть замечание"
              : `${categoryProgress.ready}/${categoryProgress.total}`}
          </Badge>
        }
      />
      <div className="drawer-list media-file-list" aria-label="Файлы подачи">
        <div className="media-file-head" aria-hidden="true">
          <span>Заявитель</span>
          <span>Статус</span>
          <span>Действие</span>
        </div>
        {submission.applicants.flatMap((applicant) =>
          fileTypes.map((type) => {
            const file = submission.files.find(
              (item) => item.applicantId === applicant.id && item.type === type,
            );
            const issue = file
              ? submission.issues.find(
                  (item) =>
                    item.id === file.linkedIssueId && item.status !== "closed_by_admin",
                )
              : undefined;
            const canUploadFile =
              Boolean(file) &&
              canEditFiles &&
              (file?.status === "missing" || file?.status === "needs_replacement");
            const uploadDisabled = fileUploadBusy || !file;
            const extractionState = applicant.passportExtraction;
            const hasLocalPassportFile = file
              ? localPassportFileIds.includes(file.id)
              : false;
            const canExtractPassport =
              passportExtractionEnabled &&
              canEditFiles &&
              Boolean(file) &&
              file?.type === "passport_scan" &&
              (Boolean(file.storagePath) || hasLocalPassportFile) &&
              (file.status === "uploaded" ||
                file.status === "pending_review" ||
                file.status === "accepted") &&
              canStartPassportExtraction(applicant);
            const inputId = file ? `file-upload-${submission.id}-${file.id}` : "";
            const uploadLabel = `${file?.status === "needs_replacement" ? "Заменить" : "Загрузить"} ${fileLabel(type)}: ${applicant.fullName}`;

            const rowId = file?.id ?? `${applicant.id}-${type}`;

            return (
              <CardComponent
                as="article"
                aria-label={`${applicant.fullName}: ${fileLabel(type)}, ${fileStatusLabel(file)}`}
                className={`media-file-row ${issue ? "has-issue" : ""} ${
                  file?.status ?? "missing"
                }`}
                id={targetElementId({
                  applicantId: applicant.id,
                  fileType: type,
                  tab: "files",
                })}
                key={rowId}
                tabIndex={-1}
              >
                <div className="media-file-main">
                  <strong>{applicant.fullName}</strong>
                  <p>{mediaFileRowSubtitle(applicant, issue)}</p>
                </div>
                <div className="media-file-status">
                  <Badge
                    className={
                      file ? fileStatusPillClass(file.status) : "status-pill muted"
                    }
                  >
                    {fileStatusLabel(file)}
                  </Badge>
                </div>
                <div className="media-file-actions">
                  {canUploadFile && file ? (
                    requireSelectedFile ? (
                      <>
                        <input
                          accept={
                            file.type === "video"
                              ? "video/mp4"
                              : file.type === "passport_scan"
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
                  {canExtractPassport && file ? (
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
                    file?.type === "passport_scan" ? (
                    <Badge className="visa-tag">Распознавание</Badge>
                  ) : null}
                </div>
              </CardComponent>
            );
          }),
        )}
      </div>
    </section>
  );
}

function DrawerIssues({
  onAcceptAiSuggestion,
  onDismissAiSuggestion,
  onOpenTarget,
  onRunAiReview,
  role,
  submission,
  surface,
}: {
  onAcceptAiSuggestion: (suggestionId: string) => void;
  onDismissAiSuggestion: (suggestionId: string) => void;
  onOpenTarget: (target: WorkspaceTarget) => void;
  onRunAiReview: () => void;
  role: Role;
  submission: Submission;
  surface: "agent" | "review" | "export";
}) {
  const [expandedIssueIds, setExpandedIssueIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [view, setView] = useState<IssueView>("issues");

  useEffect(() => {
    setExpandedIssueIds(new Set());
    setView("issues");
  }, [submission.id]);

  function toggleIssue(issueId: string) {
    setExpandedIssueIds((current) => {
      const next = new Set(current);
      if (next.has(issueId)) next.delete(issueId);
      else next.add(issueId);
      return next;
    });
  }

  return (
    <section className="drawer-section">
      <DrawerSectionHeader
        title={view === "issues" ? "Что нужно закрыть" : "ББ-проверка"}
        action={
          <SegmentedFilter
            ariaLabel="Режим замечаний"
            items={[
              { count: openIssueCount(submission), id: "issues", label: "Замечания" },
              { id: "bb", label: "ББ" },
            ]}
            value={view}
            onChange={setView}
          />
        }
      />
      {view === "issues" ? (
        <div className="drawer-list">
          {submission.issues.length ? (
            submission.issues.map((issue) => {
              const expanded = expandedIssueIds.has(issue.id);
              const detailsId = `issue-details-${issue.id}`;

              return (
                <CardComponent
                  as="article"
                  className={`issue-row compact ${issue.severity} ${
                    expanded ? "is-expanded" : ""
                  }`}
                  id={`workspace-issue-${issue.id}`}
                  key={issue.id}
                  tabIndex={-1}
                >
                  <Button
                    aria-controls={detailsId}
                    aria-expanded={expanded}
                    className="issue-row-summary"
                    variant="plain"
                    onClick={() => toggleIssue(issue.id)}
                  >
                    <div>
                      <strong>{issue.target.applicantName}</strong>
                      <IssueCategoryTag issue={issue} />
                    </div>
                    <p>{drawerIssueSummary(issue)}</p>
                    <span className="accordion-chevron" aria-hidden="true" />
                  </Button>
                  <div className="issue-row-details" hidden={!expanded} id={detailsId}>
                    <p>{issue.comment}</p>
                    <div className="issue-row-meta">
                      <Badge className={issueBadgeClass(issue.severity)}>
                        {issueSeverityLabel(issue.severity)}
                      </Badge>
                      <span>{issueStatusLabel(issue.status)}</span>
                      <span>{issueTarget(issue)}</span>
                    </div>
                    {issue.status === "open" ? (
                      <Button
                        aria-label="Открыть место исправления"
                        variant="secondary"
                        onClick={() => onOpenTarget(targetForIssue(issue))}
                      >
                        Перейти
                      </Button>
                    ) : null}
                  </div>
                </CardComponent>
              );
            })
          ) : (
            <EmptyState text="Открытых замечаний нет." />
          )}
        </div>
      ) : (
        <BbAiPanel
          compact
          onAccept={onAcceptAiSuggestion}
          onDismiss={onDismissAiSuggestion}
          onRun={onRunAiReview}
          role={role}
          submission={submission}
          surface={surface}
        />
      )}
    </section>
  );
}

type ApplicantFilter = "all" | "issues";
type IssueView = "bb" | "issues";
type OverviewFocus = "issues" | "queue";
type HistoryFilter = "all" | "bb";

function DrawerHistory({ submission }: { submission: Submission }) {
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const events =
    filter === "bb"
      ? submission.history.filter((event) => event.source === "bb")
      : submission.history;
  const groups = groupHistoryEvents(events);

  return (
    <section className="drawer-section">
      <DrawerSectionHeader
        title="Журнал действий"
        action={
          <div className="history-filter" role="group" aria-label="Фильтр истории">
            <Button
              className={filter === "all" ? "is-active" : ""}
              aria-pressed={filter === "all"}
              variant="ghost"
              onClick={() => setFilter("all")}
            >
              Все
            </Button>
            <Button
              className={filter === "bb" ? "is-active" : ""}
              aria-pressed={filter === "bb"}
              variant="ghost"
              onClick={() => setFilter("bb")}
            >
              ББ
            </Button>
          </div>
        }
      />
      <div className="history-timeline">
        {groups.length ? (
          groups.map((group) => (
            <section className="history-day-group" key={group.date}>
              <p>{group.date}</p>
              <div className="drawer-list">
                {group.events.map((event) => {
                  const time = historyTimeLabel(event.at, group.date);

                  return (
                    <CardComponent
                      as="article"
                      className={`drawer-row history-row ${time ? "has-time" : "no-time"}`}
                      key={event.id}
                    >
                      {time ? <span>{time}</span> : null}
                      <div>
                        <strong>{event.text}</strong>
                        {event.detail ? (
                          <details>
                            <summary>Подробнее</summary>
                            <p>{event.detail}</p>
                          </details>
                        ) : null}
                      </div>
                      <Badge className="visa-tag visa-tag-muted">
                        {historySourceLabel(event.source)}
                      </Badge>
                    </CardComponent>
                  );
                })}
              </div>
            </section>
          ))
        ) : (
          <EmptyState text="Событий ББ пока нет." />
        )}
      </div>
    </section>
  );
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

function toneTagClass(tone: "amber" | "blue" | "danger" | "muted" | "teal") {
  if (tone === "teal") return "visa-tag-ready";
  if (tone === "amber") return "visa-tag-attention";
  if (tone === "danger") return "visa-tag-danger";
  if (tone === "blue") return "visa-tag-info";
  return "visa-tag-muted";
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

function shouldShowApplicantStateBadge(submission: Submission, applicant: Applicant) {
  const state = applicantVisualState(submission, applicant);
  return state.tone === "danger" || questionnaireProgressForApplicant(applicant) < 100;
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
    return "Проверить файл";
  }
  if (issue.target.field) return `Проверить поле «${issue.target.field}»`;
  if (issue.target.section) return `Проверить раздел «${issue.target.section}»`;
  return "Проверить данные";
}

function mediaFileRowSubtitle(applicant: Applicant, issue?: Issue) {
  if (issue) return drawerIssueSummary(issue);
  return applicantRoleLabel(applicant.role);
}

function queueTone(
  item: ReadinessQueueItem,
): "amber" | "blue" | "danger" | "muted" | "teal" {
  if (item.status === "fixed") return "teal";
  if (item.tone === "danger") return "danger";
  if (item.tone === "warning") return "amber";
  if (item.tone === "success") return "teal";
  return "blue";
}

function queueBadgeClass(item: ReadinessQueueItem) {
  return `visa-tag ${toneTagClass(queueTone(item))}`;
}

type FileCategoryId = "passport" | "photo" | "selfie";

type FileCategoryConfig = {
  id: FileCategoryId;
  label: string;
  title: string;
  types: SubmissionFileType[];
};

const fileCategoryConfigs: FileCategoryConfig[] = [
  {
    id: "passport",
    label: "Паспорт",
    title: "Паспорт",
    types: ["passport_scan"],
  },
  {
    id: "photo",
    label: "Фото",
    title: "Фото на белом фоне",
    types: ["photo"],
  },
  {
    id: "selfie",
    label: "Селфи",
    title: "Селфи и видео",
    types: ["selfie", "selfie_2", "video"],
  },
];

function initialFileCategory(submission: Submission): FileCategoryId {
  const issueFileType = submission.issues.find(
    (issue) => issue.status === "open" && issue.target.fileType,
  )?.target.fileType;
  const category = fileCategoryConfigs.find(
    (item) => issueFileType && item.types.includes(issueFileType),
  );
  return category?.id ?? "passport";
}

function fileCategoryForType(type: SubmissionFileType) {
  return fileCategoryConfigs.find((category) => category.types.includes(type));
}

function fileCategoryProgress(submission: Submission, category: FileCategoryConfig) {
  const files = submission.files.filter((file) => category.types.includes(file.type));
  return {
    ready: files.filter(
      (file) => file.status !== "missing" && file.status !== "needs_replacement",
    ).length,
    total: files.length,
  };
}

function groupHistoryEvents(events: Submission["history"]) {
  const groups: Array<{ date: string; events: Submission["history"] }> = [];

  for (const event of events) {
    const date = historyDateLabel(event.at);
    const group = groups.find((item) => item.date === date);
    if (group) {
      group.events.push(event);
    } else {
      groups.push({ date, events: [event] });
    }
  }

  return groups;
}

function historyDateLabel(value: string) {
  return value.split(/[ ,]+/)[0] || value;
}

function historyTimeLabel(value: string, groupDate: string) {
  const parts = value.split(/[ ,]+/).filter(Boolean);
  const time = parts[1];
  if (!time || time === groupDate) return "";
  return time;
}

function applicantRoleLabel(role: Submission["applicants"][number]["role"]) {
  if (role === "main") return "Основной заявитель";
  if (role === "spouse") return "Супруг";
  if (role === "child") return "Ребёнок";
  return "Заявитель";
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
  if (status === "fixed_by_manager") return "Исправлено агентом";
  return "Закрыто администратором";
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

function decisionTitle(submission: Submission, primaryAction: ActionDecision) {
  if (primaryAction.disabled) return "Действие заблокировано";
  if (blockerCount(submission) > 0) return "Сначала закрыть блокеры";
  if (fixedIssueCount(submission) > 0) return "Исправления ждут проверки";
  if (submission.status === "submitted_for_review")
    return "Пакет на внутренней проверке";
  if (submission.status === "ready_for_export") return "Подача готова к Эксель";
  if (submission.status === "exported") return "Подача выгружена";
  if (submission.completeness.total < 100) return "Нужно завершить подготовку";
  return "Пакет можно двигать дальше";
}

function decisionBadge(submission: Submission, primaryAction: ActionDecision) {
  if (primaryAction.disabled) return "Стоп";
  const blockers = blockerCount(submission);
  if (blockers > 0) return blockerCountLabel(blockers);
  const open = openIssueCount(submission);
  if (open > 0) return `${open} замеч.`;
  if (submission.status === "ready_for_export") return "К Эксель";
  if (submission.status === "exported") return "История";
  return "Без блокеров";
}

function firstWorkLine(submission: Submission) {
  const firstOpenIssue = submission.issues.find((issue) => issue.status === "open");
  if (firstOpenIssue) {
    return `${firstOpenIssue.target.applicantName} · ${drawerIssueSummary(firstOpenIssue)}`;
  }

  const firstFixedIssue = submission.issues.find(
    (issue) => issue.status === "fixed_by_manager",
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

function queueSourceLabel(item: ReadinessQueueItem) {
  if (item.type === "admin_blocker") return "Блокер";
  if (item.type === "ai_suggestion") return "ИИ";
  if (item.type === "fixed_waiting_admin") return "Проверка";
  return "Система";
}
