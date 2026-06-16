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
  fileStatusLabels,
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
import type {
  ActionDecision,
  DrawerTab,
  Issue,
  IssueInput,
  QuestionnaireField,
  QuestionnaireStatus,
  Role,
  Submission,
  SubmissionAction,
  SubmissionFileStatus,
} from "../types";
import { BbAiPanel } from "./BbAiPanel";
import { EmptyState } from "./Primitives";

const drawerTabs: Array<{ id: DrawerTab; label: string }> = [
  { id: "overview", label: "Обзор" },
  { id: "applicants", label: "Заявители" },
  { id: "questionnaire", label: "Анкета" },
  { id: "files", label: "Файлы" },
  { id: "issues", label: "Замечания" },
  { id: "history", label: "История" },
];

export function SubmissionDrawer({
  activeTab,
  issueComposerRequest,
  onAction,
  onAddIssue,
  onIssueComposerConsumed,
  onClose,
  onAcceptAiSuggestion,
  onTab,
  onDismissAiSuggestion,
  onRunAiReview,
  onQuestionnaireField,
  onUploadFile,
  role,
  submission,
  surface,
}: {
  activeTab: DrawerTab;
  issueComposerRequest: { submissionId: string; token: number } | null;
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
  onTab: (tab: DrawerTab) => void;
  onUploadFile: (fileId: string) => void;
  role: Role;
  submission: Submission;
  surface: "agent" | "review" | "export";
}) {
  const primaryAction = getPrimaryAction(submission, role, surface);
  const [issueComposerOpen, setIssueComposerOpen] = useState(false);
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
        </div>
        <Button variant="icon" aria-label="Закрыть подачу" onClick={onClose}>
          ×
        </Button>
      </header>

      <DrawerTabs
        ariaLabel="Разделы подачи"
        tabs={drawerTabs.map((tab) => ({
          ...tab,
          meta: drawerTabValue(submission, tab.id),
        }))}
        value={activeTab}
        onValueChange={onTab}
      />

      <div
        className="drawer-body"
        id={`drawer-panel-${activeTab}`}
        role="tabpanel"
        aria-labelledby={`drawer-tab-${activeTab}`}
      >
        {activeTab === "overview" ? (
          <DrawerOverview
            onAcceptAiSuggestion={onAcceptAiSuggestion}
            onDismissAiSuggestion={onDismissAiSuggestion}
            onRunAiReview={onRunAiReview}
            primaryAction={primaryAction}
            role={role}
            submission={submission}
          />
        ) : null}
        {activeTab === "applicants" ? (
          <DrawerApplicants submission={submission} />
        ) : null}
        {activeTab === "questionnaire" ? (
          <DrawerQuestionnaire
            onFieldChange={onQuestionnaireField}
            role={role}
            submission={submission}
          />
        ) : null}
        {activeTab === "files" ? (
          <DrawerFiles
            onUploadFile={onUploadFile}
            role={role}
            submission={submission}
          />
        ) : null}
        {activeTab === "issues" ? (
          <DrawerIssues
            onAcceptAiSuggestion={onAcceptAiSuggestion}
            onDismissAiSuggestion={onDismissAiSuggestion}
            onRunAiReview={onRunAiReview}
            role={role}
            submission={submission}
          />
        ) : null}
        {activeTab === "history" ? <DrawerHistory submission={submission} /> : null}
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
        {canOpenIssueComposer && !issueComposerOpen ? (
          <Button
            variant="secondary"
            onClick={() => setIssueComposerOpen(true)}
          >
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
      section: targetKind === "files" ? "Файлы" : "Анкета",
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
            { label: "Анкета", value: "questionnaire" },
            { label: "Файлы", value: "files" },
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
            options={(["photo", "selfie", "video"] as const).map((type) => ({
              label: fileTypeLabels[type],
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

function DrawerOverview({
  onAcceptAiSuggestion,
  onDismissAiSuggestion,
  onRunAiReview,
  primaryAction,
  role,
  submission,
}: {
  onAcceptAiSuggestion: (suggestionId: string) => void;
  onDismissAiSuggestion: (suggestionId: string) => void;
  onRunAiReview: () => void;
  primaryAction: ActionDecision;
  role: Role;
  submission: Submission;
}) {
  const blockers = blockerCount(submission);
  const openIssues = openIssueCount(submission);
  const needsAttention = Boolean(blockers || openIssues);
  const fileProgress = fileReadyCount(submission);
  const nextLine = firstWorkLine(submission);

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

function DrawerApplicants({ submission }: { submission: Submission }) {
  return (
    <section className="drawer-section">
      <p className="kicker">Заявители внутри подачи</p>
      <div className="drawer-list">
        {submission.applicants.map((applicant) => (
          <CardComponent as="article" className="drawer-row" key={applicant.id}>
            <div>
              <strong>{applicant.fullName}</strong>
              <p>{applicantRoleLabel(applicant.role)}</p>
            </div>
            <span>
              анкета {questionnaireLabel(applicant.questionnaireStatus)} · файлы{" "}
              {questionnaireLabel(applicant.fileStatus)}
            </span>
          </CardComponent>
        ))}
      </div>
    </section>
  );
}

function DrawerQuestionnaire({
  onFieldChange,
  role,
  submission,
}: {
  onFieldChange: (input: {
    applicantId: string;
    sectionId: string;
    fieldId: QuestionnaireField["id"];
    value: string;
  }) => void;
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
          <Badge className="visa-tag visa-tag-attention">
            Уточнить {problemCount}
          </Badge>
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
            <div className="questionnaire-section-list visa-section-stack">
              {applicant.sections.map((section) => {
                const issue = sectionIssue(submission, applicant.id, section.title);
                const sectionKey = questionnaireSectionKey(applicant.id, section.id);
                const sectionElementId = `questionnaire-section-${applicant.id}-${section.id}`;
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

                        if (field.control === "select") {
                          return (
                            <Select
                              aria-label={fieldAriaLabel}
                              containerClassName={fieldClassName}
                              disabled={!canEdit}
                              errorMessage={error}
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
  onUploadFile,
  role,
  submission,
}: {
  onUploadFile: (fileId: string) => void;
  role: Role;
  submission: Submission;
}) {
  const progress = fileReadyCount(submission);
  const canEditFiles = role === "agent" && canAgentEditSubmissionContent(submission);

  return (
    <section className="drawer-section">
      <div className="section-heading">
        <div>
          <p className="kicker">Файлы</p>
          <h3>Фото, селфи и видео</h3>
          <p className="drawer-muted">
            {progress.ready}/{progress.total} слотов загружены или ожидают проверки.
          </p>
        </div>
      </div>
      <div className="drawer-list">
        {submission.files.length ? (
          submission.files.map((file) => {
            const applicant = submission.applicants.find(
              (item) => item.id === file.applicantId,
            );
            const issue = submission.issues.find(
              (item) =>
                item.id === file.linkedIssueId && item.status !== "closed_by_admin",
            );
            const applicantName = applicant?.fullName ?? "Заявитель";
            const canUploadFile =
              canEditFiles &&
              (file.status === "missing" || file.status === "needs_replacement");
            return (
              <CardComponent
                as="article"
                className={`drawer-row file-row ${issue ? "has-issue" : ""}`}
                key={file.id}
              >
                <span className="row-dot" aria-hidden="true" />
                <div>
                  <strong>{fileTypeLabels[file.type]}</strong>
                  <p>{applicantName}</p>
                  {issue ? <small>{issue.reason}</small> : null}
                </div>
                <div className="file-row-actions">
                  <Badge className={fileStatusPillClass(file.status)}>
                    {fileStatusLabels[file.status]}
                  </Badge>
                  {canUploadFile ? (
                    <Button
                      className="compact-button"
                      variant="secondary"
                      aria-label={`${file.status === "needs_replacement" ? "Заменить" : "Загрузить"} ${fileTypeLabels[file.type]}: ${applicantName}`}
                      onClick={() => onUploadFile(file.id)}
                    >
                      {file.status === "needs_replacement" ? "Заменить" : "Загрузить"}
                    </Button>
                  ) : null}
                </div>
              </CardComponent>
            );
          })
        ) : (
          <EmptyState text="Файлы пока не добавлены." />
        )}
      </div>
    </section>
  );
}

function DrawerIssues({
  onAcceptAiSuggestion,
  onDismissAiSuggestion,
  onRunAiReview,
  role,
  submission,
}: {
  onAcceptAiSuggestion: (suggestionId: string) => void;
  onDismissAiSuggestion: (suggestionId: string) => void;
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
              key={issue.id}
            >
              <span>{issueSeverityLabel(issue.severity)}</span>
              <div>
                <strong>{issueTarget(issue)}</strong>
                <p>{issue.reason}</p>
                <small>{issue.comment}</small>
              </div>
              <em>{issueStatusLabel(issue.status)}</em>
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
            <CardComponent as="article" className="drawer-row history-row" key={event.id}>
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
        (issue.target.section === "Анкета" &&
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
      (issue.target.section === sectionTitle || issue.target.section === "Анкета") &&
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
