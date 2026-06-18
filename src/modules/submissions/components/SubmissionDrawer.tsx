import { useEffect, useLayoutEffect, useRef, useState } from "react";
import {
  Badge,
  Button,
  CardComponent,
  DrawerTabs,
  Select,
  SheetFrame,
  TextInputField,
} from "../../../shared/ui/primitives";
import { applicantCountLabel, tripDates } from "../selectors";
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
  typeLabels,
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
  fileShortLabel,
  fileStatusLabel,
  firstActionableQueueItem,
  sectionNavigationTarget,
  tabForTarget,
  targetElementId,
  targetForIssue,
  workspaceSummary,
  workspaceTabs,
  type ReadinessQueueItem,
  type WorkspaceTarget,
} from "../workspaceModel";
import type {
  ActionDecision,
  Applicant,
  DrawerTab,
  Issue,
  IssueInput,
  PassportExtractedFieldKey,
  QuestionnaireField,
  QuestionnaireStatus,
  Role,
  Submission,
  SubmissionAction,
  SubmissionFileStatus,
} from "../types";
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
  onTab,
  onDismissAiSuggestion,
  onRunAiReview,
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
    if (!pendingTarget || tabForTarget(pendingTarget) !== activeTab) return;

    const target = document.getElementById(targetElementId(pendingTarget));
    const drawerBody = target?.closest<HTMLElement>(".drawer-body");
    if (!target || !drawerBody) return;

    const targetRect = target.getBoundingClientRect();
    const bodyRect = drawerBody.getBoundingClientRect();
    drawerBody.scrollTo({
      behavior: "auto",
      top: Math.max(drawerBody.scrollTop + targetRect.top - bodyRect.top - 14, 0),
    });
    target.focus({ preventScroll: true });
    setPendingTarget(null);
  }, [activeTab, pendingTarget]);

  function openTarget(target: WorkspaceTarget) {
    onTab(tabForTarget(target));
    setPendingTarget(target);
  }

  function openFirstProblem() {
    const first = firstActionableQueueItem(submission);
    if (first) openTarget(first.target);
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
          <p className="kicker">
            {submission.id} · {statusLabels[submission.status]}
          </p>
          <h2 id="drawer-title">{submission.title}</h2>
          <p>{drawerMetaLine(submission)}</p>
          <div className="workspace-header-status" aria-label="Статус подачи">
            <span>Готовность {submission.completeness.total}%</span>
            <span>{blockerCount(submission)} блокера</span>
            <span>{activeAiSuggestionsCount(submission)} ИИ</span>
            <span>Анкета {submission.completeness.questionnaire}%</span>
          </div>
        </div>
        <Button variant="icon" aria-label="Закрыть подачу" onClick={onClose}>
          ×
        </Button>
      </header>

      <DrawerTabs
        ariaLabel="Разделы подачи"
        tabs={workspaceTabs.map((tab) => ({
          ...tab,
          meta: drawerTabValue(submission, tab.id),
        }))}
        value={activeTab}
        onValueChange={onTab}
      />

      <div
        className="drawer-body workspace-drawer-body"
        id={`drawer-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`drawer-tab-${activeTab}`}
      >
        <WorkspaceNavigation
          activeTab={activeTab}
          onOpenTarget={openTarget}
          onTab={onTab}
          submission={submission}
        />
        <main className="workspace-main">
          {activeTab === "overview" ? (
            <DrawerOverview
              onAcceptAiSuggestion={onAcceptAiSuggestion}
              onDismissAiSuggestion={onDismissAiSuggestion}
              onOpenTarget={openTarget}
              onRunAiReview={onRunAiReview}
              primaryAction={primaryAction}
              role={role}
              submission={submission}
              surface={surface}
            />
          ) : null}
          {activeTab === "data" ? (
            <DrawerQuestionnaire
              onApplyPassportField={onApplyPassportField}
              onFieldChange={onQuestionnaireField}
              passportExtractionEnabled={passportExtractionEnabled}
              role={role}
              submission={submission}
            />
          ) : null}
          {activeTab === "media" ? (
            <DrawerFiles
              fileUploadBusy={fileUploadBusy}
              localPassportFileIds={localPassportFileIds}
              onExtractPassport={onExtractPassport}
              onUploadFile={onUploadFile}
              passportExtractionEnabled={passportExtractionEnabled}
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
            />
          ) : null}
          {activeTab === "history" ? <DrawerHistory submission={submission} /> : null}
        </main>
        <WorkspaceRightRail
          onOpenTarget={openTarget}
          onRunAiReview={onRunAiReview}
          role={role}
          submission={submission}
          surface={surface}
        />
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

function WorkspaceNavigation({
  activeTab,
  onOpenTarget,
  onTab,
  submission,
}: {
  activeTab: DrawerTab;
  onOpenTarget: (target: WorkspaceTarget) => void;
  onTab: (tab: DrawerTab) => void;
  submission: Submission;
}) {
  return (
    <aside className="workspace-nav" aria-label="Навигация по заявке">
      <div>
        <p className="kicker">{submission.title}</p>
        <strong>{submission.completeness.total}% готово</strong>
      </div>
      <div className="workspace-nav-group" aria-label="Разделы workspace">
        {workspaceTabs.map((tab) => (
          <button
            aria-current={activeTab === tab.id ? "page" : undefined}
            className={activeTab === tab.id ? "is-active" : ""}
            key={tab.id}
            type="button"
            onClick={() => onTab(tab.id)}
          >
            <span>{tab.label}</span>
            <em>{drawerTabValue(submission, tab.id)}</em>
          </button>
        ))}
      </div>
      <div className="workspace-nav-group" aria-label="Заявители">
        <p>Заявители</p>
        {submission.applicants.map((applicant) => {
          const blockerTotal = submission.issues.filter(
            (issue) =>
              issue.status === "open" &&
              issue.severity === "blocker" &&
              issue.target.applicantId === applicant.id,
          ).length;
          const firstProblemSection =
            applicant.sections.find((section) => section.status !== "complete") ??
            applicant.sections[0];

          return (
            <button
              key={applicant.id}
              type="button"
              onClick={() =>
                onOpenTarget({
                  applicantId: applicant.id,
                  section: firstProblemSection?.title,
                  tab: "data",
                })
              }
            >
              <span>{applicant.fullName}</span>
              <em>{blockerTotal ? `${blockerTotal} блокер` : "готово"}</em>
            </button>
          );
        })}
      </div>
      <div className="workspace-nav-group" aria-label="Секции анкеты">
        <p>Разделы</p>
        {submission.applicants[0]?.sections.map((section) => {
          const sectionIssues = submission.issues.filter(
            (issue) =>
              issue.status === "open" &&
              (issue.target.section === section.title ||
                issue.target.field === section.title),
          ).length;

          return (
            <button
              key={section.id}
              type="button"
              onClick={() =>
                onOpenTarget(sectionNavigationTarget(submission, section.title))
              }
            >
              <span>{section.title}</span>
              <em>
                {sectionIssues
                  ? `${sectionIssues}`
                  : questionnaireLabel(section.status)}
              </em>
            </button>
          );
        })}
      </div>
    </aside>
  );
}

function WorkspaceRightRail({
  onOpenTarget,
  onRunAiReview,
  role,
  submission,
  surface,
}: {
  onOpenTarget: (target: WorkspaceTarget) => void;
  onRunAiReview: () => void;
  role: Role;
  submission: Submission;
  surface: "agent" | "review" | "export";
}) {
  const summary = workspaceSummary(submission);
  const queuePreview = summary.queue.slice(0, 3);

  return (
    <aside className="workspace-right-rail" aria-label="Статус и ИИ-помощник">
      <section className="workspace-status-card">
        <p className="kicker">Состояние</p>
        <h3>{nextProblem(submission)}</h3>
        <dl>
          <div>
            <dt>Блокеры</dt>
            <dd>{blockerCount(submission)}</dd>
          </div>
          <div>
            <dt>ИИ</dt>
            <dd>{summary.aiCount}</dd>
          </div>
          <div>
            <dt>Ждёт админа</dt>
            <dd>{summary.waitingAdminCount}</dd>
          </div>
        </dl>
      </section>
      <AiHelperSurfacePanel
        compact
        role={role}
        submission={submission}
        surface={surface}
      />
      <section className="workspace-rail-queue">
        <div className="section-heading">
          <div>
            <p className="kicker">Что проверить</p>
            <h3>
              {queuePreview.length ? "Очередь готовности" : "Активных пунктов нет"}
            </h3>
          </div>
          <Button variant="secondary" onClick={onRunAiReview}>
            Проверить ИИ
          </Button>
        </div>
        <div className="workspace-queue-list">
          {queuePreview.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => onOpenTarget(item.target)}
            >
              <span>{queueSourceLabel(item)}</span>
              <strong>{item.title}</strong>
              <em>{item.actionLabel}</em>
            </button>
          ))}
        </div>
      </section>
    </aside>
  );
}

function DrawerOverview({
  onAcceptAiSuggestion,
  onDismissAiSuggestion,
  onOpenTarget,
  onRunAiReview,
  primaryAction,
  role,
  submission,
  surface,
}: {
  onAcceptAiSuggestion: (suggestionId: string) => void;
  onDismissAiSuggestion: (suggestionId: string) => void;
  onOpenTarget: (target: WorkspaceTarget) => void;
  onRunAiReview: () => void;
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
  const queue = buildReadinessQueue(submission);

  return (
    <section className="drawer-section">
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
            <dt>Следующий шаг</dt>
            <dd>{primaryAction.label}</dd>
          </div>
        </dl>
      </CardComponent>
      <section className="workspace-queue" aria-label="Что мешает отправке">
        <div className="section-heading">
          <div>
            <p className="kicker">Что мешает отправке</p>
            <h3>{queue.length ? "Очередь готовности" : "Блокеров нет"}</h3>
          </div>
        </div>
        <div className="workspace-queue-list">
          {queue.length ? (
            queue.map((item) => (
              <QueueItemCard item={item} key={item.id} onOpenTarget={onOpenTarget} />
            ))
          ) : (
            <EmptyState text="Активных блокеров и подсказок нет." />
          )}
        </div>
      </section>
      <div className="drawer-metrics">
        <CardComponent as="article">
          <span>{submission.completeness.questionnaire}%</span>
          <p>Анкета</p>
        </CardComponent>
        <CardComponent as="article">
          <span>{submission.completeness.files}%</span>
          <p>Файлы</p>
        </CardComponent>
        <CardComponent as="article">
          <span>{openIssueCount(submission)}</span>
          <p>Открытые замечания</p>
        </CardComponent>
      </div>
      <div className="blocker-box muted-box">
        <p>
          Система не принимает визовых решений. Она только помогает подготовить пакет к
          внутренней проверке.
        </p>
      </div>
      <AiHelperSurfacePanel role={role} submission={submission} surface={surface} />
      <BbAiPanel
        onAccept={onAcceptAiSuggestion}
        onDismiss={onDismissAiSuggestion}
        onRun={onRunAiReview}
        role={role}
        submission={submission}
      />
    </section>
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
      <span>{queueSourceLabel(item)}</span>
      <div>
        <strong>{item.title}</strong>
        <p>{item.body}</p>
      </div>
      <Button
        aria-label={item.actionLabel}
        variant="secondary"
        onClick={() => onOpenTarget(item.target)}
      >
        {item.actionLabel}
      </Button>
    </CardComponent>
  );
}

function DrawerQuestionnaire({
  onApplyPassportField,
  onFieldChange,
  passportExtractionEnabled,
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
  role: Role;
  submission: Submission;
}) {
  const canEdit = role === "agent" && canAgentEditSubmissionContent(submission);
  const problemCount = questionnaireProblemCount(submission);
  const questionnaireReady =
    submission.completeness.questionnaire === 100 && problemCount === 0;
  const isSingleApplicant = submission.applicants.length === 1;
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

  function setOpenSectionKey(sectionKey: string) {
    setOpenSectionState({ sectionKey, submissionId: submission.id });
  }

  function openQuestionnaireSection(sectionKey: string, sectionElementId: string) {
    setOpenSectionKey(sectionKey);
    setPendingSectionScrollId(sectionElementId);
  }

  function scrollToApplicant(applicantId: string) {
    document.getElementById(`questionnaire-applicant-${applicantId}`)?.scrollIntoView({
      block: "start",
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
        ? "auto"
        : "smooth",
    });
  }

  return (
    <section
      className={`drawer-section questionnaire-screen visa-form-screen ${
        canEdit ? "is-editable" : "is-read-only"
      }`}
    >
      <div className="questionnaire-form-intro visa-form-hero">
        <div>
          <p className="kicker">DS-пакет</p>
          <h3>Матрица визовой анкеты</h3>
          <p className="drawer-muted visa-form-hero-copy">
            {canEdit
              ? "Соберите поля в том порядке, в котором администратор сверяет пакет: личность, паспорт, адрес, работа, маршрут."
              : "Проверяйте один раскрытый блок за раз. Несовпадения фиксируются точным замечанием к полю или документу."}
          </p>
        </div>
        {questionnaireReady ? (
          <Badge className="visa-tag visa-tag-ready">Готово к решению</Badge>
        ) : problemCount ? (
          <Badge className="visa-tag visa-tag-attention">Уточнить {problemCount}</Badge>
        ) : null}
      </div>
      {submission.applicants.length > 1 ? (
        <div
          className="questionnaire-progress-grid visa-applicant-strip"
          aria-label="Готовность визовых профилей по заявителям"
        >
          {submission.applicants.map((applicant) => {
            const percent = questionnaireProgressForApplicant(applicant);
            const openForApplicant = submission.issues.filter(
              (issue) =>
                issue.status !== "closed_by_admin" &&
                issue.target.applicantId === applicant.id,
            ).length;

            return (
              <Button
                className="questionnaire-applicant-card visa-applicant-tile"
                key={applicant.id}
                variant="plain"
                type="button"
                onClick={() => scrollToApplicant(applicant.id)}
              >
                <div>
                  <span className="visa-avatar-dot" aria-hidden="true" />
                  <div>
                    <strong>{applicant.fullName}</strong>
                    <p>{applicantRoleLabel(applicant.role)} · профиль DS</p>
                  </div>
                </div>
                <Badge
                  className={
                    openForApplicant
                      ? "visa-tag visa-tag-attention"
                      : "visa-tag visa-tag-progress"
                  }
                >
                  {openForApplicant ? `${openForApplicant} замечания` : `${percent}%`}
                </Badge>
                <div
                  className="inline-progress visa-progress-line"
                  role="progressbar"
                  aria-label={`Визовый профиль заполнен на ${percent}%`}
                  aria-valuemax={100}
                  aria-valuemin={0}
                  aria-valuenow={percent}
                >
                  <i style={{ width: `${percent}%` }} />
                </div>
              </Button>
            );
          })}
        </div>
      ) : null}
      <div className="questionnaire-workspace visa-form-workspace">
        {submission.applicants.map((applicant) => (
          <CardComponent
            as="article"
            className={`questionnaire-card visa-applicant-sheet ${
              isSingleApplicant ? "is-single" : ""
            }`}
            id={`questionnaire-applicant-${applicant.id}`}
            key={applicant.id}
          >
            {!isSingleApplicant ? (
              <header className="questionnaire-card-header visa-applicant-header">
                <div>
                  <strong>{applicant.fullName}</strong>
                  <p>{applicantRoleLabel(applicant.role)} · консульский профиль</p>
                </div>
                <div className="questionnaire-card-status">
                  <span>{questionnaireProgressForApplicant(applicant)}%</span>
                  <Badge className={statusPillClass(applicant.questionnaireStatus)}>
                    {questionnaireLabel(applicant.questionnaireStatus)}
                  </Badge>
                </div>
              </header>
            ) : null}
            <PassportExtractionReviewPanel
              applicant={applicant}
              canEdit={canEdit}
              enabled={passportExtractionEnabled}
              onApplyField={onApplyPassportField}
            />
            <div className="questionnaire-section-list visa-section-stack">
              {applicant.sections.map((section) => {
                const issue = sectionIssue(submission, applicant.id, section.title);
                const sectionKey = questionnaireSectionKey(applicant.id, section.id);
                const sectionElementId = targetElementId({
                  applicantId: applicant.id,
                  section: section.title,
                  tab: "data",
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
                        <span className="visa-step-dot" aria-hidden="true" />
                        <div>
                          {section.stepLabel ? (
                            <p className="consular-step-label visa-step-label">
                              {section.stepLabel}
                            </p>
                          ) : null}
                          <h4>{section.title}</h4>
                          {issue ? (
                            <p className="visa-section-note">{issue.reason}</p>
                          ) : section.missing ? (
                            <p className="visa-section-note">{section.missing}</p>
                          ) : null}
                        </div>
                      </div>
                      <span className="questionnaire-section-side">
                        {issue || section.status !== "complete" ? (
                          <Badge className={statusPillClass(section.status)}>
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
                          tab: "data",
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
          </CardComponent>
        ))}
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

function drawerMetaLine(submission: Submission) {
  const parts = [
    "Испания",
    submission.city,
    tripDates(submission),
    submission.type === "family" ? typeLabels[submission.type] : undefined,
    applicantCountLabel(submission.applicants.length),
  ];

  return parts.filter(Boolean).join(" · ");
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
  requireSelectedFile = false,
  role,
  submission,
}: {
  fileUploadBusy?: boolean;
  localPassportFileIds?: string[];
  onExtractPassport: (fileId: string) => void;
  onUploadFile: (fileId: string, file?: File) => void;
  passportExtractionEnabled?: boolean;
  requireSelectedFile?: boolean;
  role: Role;
  submission: Submission;
}) {
  const progress = fileReadyCount(submission);
  const canEditFiles = role === "agent" && canAgentEditSubmissionContent(submission);
  const fileTypes = [
    ...activeMediaFileTypes,
    ...(submission.files.some((file) => file.type === "video")
      ? (["video"] as const)
      : []),
  ];

  return (
    <section className="drawer-section">
      <div className="section-heading">
        <div>
          <p className="kicker">Медиа</p>
          <h3>Матрица документов семьи</h3>
          <p className="drawer-muted">
            {progress.ready}/{progress.total} слотов загружены или ожидают проверки.
          </p>
        </div>
      </div>
      <div className="media-matrix" role="table" aria-label="Медиа по заявителям">
        <div className="media-matrix-row is-head" role="row">
          <span role="columnheader">Заявитель</span>
          {fileTypes.map((type) => (
            <span key={type} role="columnheader">
              {fileShortLabel(type)}
            </span>
          ))}
        </div>
        {submission.applicants.map((applicant) => (
          <div className="media-matrix-row" key={applicant.id} role="row">
            <div className="media-applicant-cell" role="rowheader">
              <strong>{applicant.fullName}</strong>
              <p>{applicantRoleLabel(applicant.role)}</p>
            </div>
            {fileTypes.map((type) => {
              const file = submission.files.find(
                (item) => item.applicantId === applicant.id && item.type === type,
              );
              const issue = file
                ? submission.issues.find(
                    (item) =>
                      item.id === file.linkedIssueId &&
                      item.status !== "closed_by_admin",
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

              return (
                <div
                  className={`media-slot-cell ${issue ? "has-issue" : ""}`}
                  id={targetElementId({
                    applicantId: applicant.id,
                    fileType: type,
                    tab: "media",
                  })}
                  key={type}
                  role="cell"
                  tabIndex={-1}
                >
                  <Badge
                    className={
                      file ? fileStatusPillClass(file.status) : "status-pill muted"
                    }
                  >
                    {fileStatusLabel(file)}
                  </Badge>
                  {issue ? <p>{issue.reason}</p> : <p>{fileLabel(type)}</p>}
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
              );
            })}
          </div>
        ))}
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
}: {
  onAcceptAiSuggestion: (suggestionId: string) => void;
  onDismissAiSuggestion: (suggestionId: string) => void;
  onOpenTarget: (target: WorkspaceTarget) => void;
  onRunAiReview: () => void;
  role: Role;
  submission: Submission;
}) {
  return (
    <section className="drawer-section">
      <div>
        <p className="kicker">Замечания</p>
        <h3>{openIssueCount(submission) ? "Что нужно закрыть" : "Замечаний нет"}</h3>
      </div>
      <BbAiPanel
        compact
        onAccept={onAcceptAiSuggestion}
        onDismiss={onDismissAiSuggestion}
        onRun={onRunAiReview}
        role={role}
        submission={submission}
      />
      <div className="drawer-list">
        {submission.issues.length ? (
          submission.issues.map((issue) => (
            <CardComponent
              as="article"
              className={`issue-row ${issue.severity}`}
              id={`workspace-issue-${issue.id}`}
              key={issue.id}
              tabIndex={-1}
            >
              <span>{issueSeverityLabel(issue.severity)}</span>
              <div>
                <strong>{issueTarget(issue)}</strong>
                <p>{issue.reason}</p>
                <small>{issue.comment}</small>
              </div>
              <div className="issue-row-actions">
                <em>{issueStatusLabel(issue.status)}</em>
                {issue.status === "open" ? (
                  <Button
                    aria-label="Открыть место исправления"
                    variant="secondary"
                    onClick={() => onOpenTarget(targetForIssue(issue))}
                  >
                    Открыть место исправления
                  </Button>
                ) : null}
              </div>
            </CardComponent>
          ))
        ) : (
          <EmptyState text="Открытых замечаний нет." />
        )}
      </div>
    </section>
  );
}

type HistoryFilter = "all" | "bb";

function DrawerHistory({ submission }: { submission: Submission }) {
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const events =
    filter === "bb"
      ? submission.history.filter((event) => event.source === "bb")
      : submission.history;

  return (
    <section className="drawer-section">
      <div className="section-heading">
        <div>
          <p className="kicker">История</p>
          <h3>Журнал действий</h3>
        </div>
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
      </div>
      <div className="drawer-list">
        {events.length ? (
          events.map((event) => (
            <CardComponent
              as="article"
              className="drawer-row history-row"
              key={event.id}
            >
              <div>
                <strong>{event.text}</strong>
                {event.detail ? (
                  <>
                    <p>{event.detail}</p>
                    <small>{event.at}</small>
                  </>
                ) : (
                  <p>{event.at}</p>
                )}
              </div>
              <span>{historySourceLabel(event.source)}</span>
            </CardComponent>
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
  if (tab === "data") return `${submission.completeness.questionnaire}%`;
  if (tab === "media") {
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
  if (blockers > 0) return `${blockers} блокера`;
  const open = openIssueCount(submission);
  if (open > 0) return `${open} замеч.`;
  if (submission.status === "ready_for_export") return "К Эксель";
  if (submission.status === "exported") return "История";
  return "Без блокеров";
}

function firstWorkLine(submission: Submission) {
  const firstOpenIssue = submission.issues.find((issue) => issue.status === "open");
  if (firstOpenIssue) return `${issueTarget(firstOpenIssue)}: ${firstOpenIssue.reason}`;

  const firstFixedIssue = submission.issues.find(
    (issue) => issue.status === "fixed_by_manager",
  );
  if (firstFixedIssue)
    return `${issueTarget(firstFixedIssue)}: ожидает закрытия администратором`;

  const firstMissingSection = submission.applicants
    .flatMap((applicant) =>
      applicant.sections.map((section) => ({ applicant, section })),
    )
    .find(({ section }) => section.status !== "complete");
  if (firstMissingSection) {
    return `${firstMissingSection.applicant.fullName}: ${firstMissingSection.section.missing ?? firstMissingSection.section.title}`;
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

function statusPillClass(status: QuestionnaireStatus) {
  if (status === "complete") return "visa-tag visa-tag-ready";
  if (status === "partial") return "visa-tag visa-tag-attention";
  if (status === "needs_fix") return "visa-tag visa-tag-danger";
  return "visa-tag visa-tag-muted";
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

function activeAiSuggestionsCount(submission: Submission) {
  return (submission.aiSuggestions ?? []).filter(
    (suggestion) => suggestion.status === "suggested",
  ).length;
}
