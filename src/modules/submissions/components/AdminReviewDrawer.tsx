import { useEffect, useRef, useState } from "react";
import { applicantCountLabel, tripDates } from "../selectors";
import {
  adminIssueGuard,
  blockerCount,
  fileStatusLabels,
  fixedIssueCount,
  getPrimaryAction,
  openIssueCount,
  statusLabels,
  statusTone,
  typeLabels,
} from "../status";
import {
  activeMediaFileTypes,
  fileLabel,
  fileStatusLabel,
  tabForTarget,
  targetForIssue,
  workspaceTabs,
  type WorkspaceTarget,
} from "../workspaceModel";
import type {
  Applicant,
  DrawerTab,
  Issue,
  IssueInput,
  IssueSeverity,
  QuestionnaireField,
  QuestionnaireSection,
  Submission,
  SubmissionAction,
  SubmissionFile,
  SubmissionFileType,
} from "../types";
import { BbAiPanel } from "./BbAiPanel";
import "./AdminReviewDrawer.css";

type AdminIssueTarget = "questionnaire" | "passport_scan" | "selfie" | "selfie_2";

const adminIssueTargets: Array<{
  id: AdminIssueTarget;
  label: string;
  type: IssueInput["type"];
}> = [
  { id: "questionnaire", label: "Анкета", type: "field" },
  { id: "passport_scan", label: "Скан загранпаспорта", type: "file" },
  { id: "selfie", label: "Селфи", type: "file" },
  { id: "selfie_2", label: "Селфи N2", type: "file" },
];

const localAgentNames: Record<string, string> = {
  "local-agent-alex": "Алексей Сидоров",
  "local-agent-tony": "Татьяна Николаева",
};

export function AdminReviewDrawer({
  actionError = "",
  activeTab,
  initialTarget = null,
  issueComposerRequest,
  onAcceptAiSuggestion,
  onAction,
  onAddIssue,
  onClose,
  onDismissAiSuggestion,
  onIssueComposerConsumed,
  onRunAiReview,
  onTab,
  submission,
}: {
  actionError?: string;
  activeTab: DrawerTab;
  initialTarget?: WorkspaceTarget | null;
  issueComposerRequest: { submissionId: string; token: number } | null;
  onAcceptAiSuggestion: (suggestionId: string) => void;
  onAction: (action: SubmissionAction) => void;
  onAddIssue: (input: IssueInput) => void;
  onClose: () => void;
  onDismissAiSuggestion: (suggestionId: string) => void;
  onIssueComposerConsumed: () => void;
  onRunAiReview: () => void;
  onTab: (tab: DrawerTab) => void;
  submission: Submission;
}) {
  const [issueComposerOpen, setIssueComposerOpen] = useState(false);
  const [composerDraft, setComposerDraft] = useState<IssueComposerDraft | null>(null);
  const drawerBodyRef = useRef<HTMLDivElement | null>(null);
  const canAddIssue = adminIssueGuard(submission, "admin");
  const primaryAction = getPrimaryAction(submission, "admin", "review");

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, []);

  useEffect(() => {
    setIssueComposerOpen(false);
    setComposerDraft(null);
  }, [submission.id]);

  useEffect(() => {
    if (!initialTarget) return;
    onTab(tabForTarget(initialTarget));
  }, [initialTarget, onTab]);

  useEffect(() => {
    drawerBodyRef.current?.scrollTo({ behavior: "auto", top: 0 });
  }, [activeTab, submission.id]);

  useEffect(() => {
    if (!issueComposerRequest || issueComposerRequest.submissionId !== submission.id) {
      return;
    }
    setComposerDraft(null);
    setIssueComposerOpen(true);
    onIssueComposerConsumed();
  }, [issueComposerRequest, onIssueComposerConsumed, submission.id]);

  function openIssueComposer(draft?: IssueComposerDraft) {
    if (!canAddIssue.ok) {
      onTab("issues");
      return;
    }
    setComposerDraft(draft ?? null);
    setIssueComposerOpen(true);
    onTab("issues");
  }

  function openIssueTarget(issue: Issue) {
    const target = targetForIssue(issue);
    onTab(tabForTarget(target));
  }

  function closeIssueComposer() {
    setIssueComposerOpen(false);
    setComposerDraft(null);
  }

  return (
    <div className="admin-review-shell">
      <button
        aria-label="Закрыть окно"
        className="admin-review-backdrop"
        type="button"
        onClick={onClose}
      />
      <aside
        aria-labelledby="drawer-title"
        aria-modal="true"
        className="admin-review-drawer submission-detail-drawer"
        role="dialog"
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
        <header className="admin-review-drawer-header">
          <div className="admin-review-titlebar">
            <div className="admin-review-titlecopy">
              <p className="drawer-meta-line">
                <span
                  aria-hidden="true"
                  className={`admin-review-status-dot is-${statusTone[submission.status]}`}
                />
                <span>{submission.id}</span>
                <span>{submission.city}</span>
                <span>{statusLabels[submission.status]}</span>
              </p>
              <h2 id="drawer-title">{submission.title}</h2>
              <div className="admin-review-meta-grid" aria-label="Сводка подачи">
                <span>{applicantCountLabel(submission.applicants.length)}</span>
                <span>{typeLabels[submission.type]}</span>
                <span>{tripDates(submission)}</span>
                <span>Агент: {agentDisplayName(submission)}</span>
              </div>
              <div className="drawer-chips" aria-label="Состояние проверки">
                <span className={`drawer-status-chip ${statusTone[submission.status]}`}>
                  {statusLabels[submission.status]}
                </span>
                <span className="drawer-readiness-chip">
                  {submission.completeness.total}% готово
                </span>
                {blockerCount(submission) ? (
                  <span className="admin-review-blocker-chip">
                    {blockerCount(submission)} блокер
                  </span>
                ) : null}
              </div>
            </div>
            <button
              aria-label="Закрыть подачу"
              className="admin-review-close"
              type="button"
              onClick={onClose}
            >
              ×
            </button>
          </div>
          <nav className="admin-review-tabs" aria-label="Разделы проверки">
            {workspaceTabs.map((tab) => (
              <button
                aria-selected={activeTab === tab.id}
                className={activeTab === tab.id ? "is-active" : ""}
                id={`drawer-tab-${tab.id}`}
                key={tab.id}
                role="tab"
                type="button"
                onClick={() => onTab(tab.id)}
              >
                <span>{tab.label}</span>
                {drawerTabValue(submission, tab.id) ? (
                  <em>{drawerTabValue(submission, tab.id)}</em>
                ) : null}
              </button>
            ))}
          </nav>
        </header>

        <div
          aria-labelledby={`drawer-tab-${activeTab}`}
          className="admin-review-content"
          id={`drawer-panel-${activeTab}`}
          ref={drawerBodyRef}
          role="tabpanel"
        >
          {activeTab === "overview" ? (
            <AdminOverview
              primaryAction={primaryAction}
              submission={submission}
              onOpenIssue={(issue) => openIssueTarget(issue)}
              onTab={onTab}
            />
          ) : null}
          {activeTab === "applicants" ? (
            <AdminApplicants
              submission={submission}
              onOpenApplicant={(applicant) =>
                onTab(applicantIssueCount(submission, applicant.id) ? "issues" : "questionnaire")
              }
            />
          ) : null}
          {activeTab === "questionnaire" ? (
            <AdminQuestionnaire
              submission={submission}
              onAddIssue={openIssueComposer}
            />
          ) : null}
          {activeTab === "files" ? (
            <AdminFiles submission={submission} onAddIssue={openIssueComposer} />
          ) : null}
          {activeTab === "issues" ? (
            <AdminIssues
              canAddIssue={canAddIssue.ok}
              issueGuardReason={canAddIssue.ok ? "" : canAddIssue.reason}
              onAcceptAiSuggestion={onAcceptAiSuggestion}
              submission={submission}
              onAddIssue={() => openIssueComposer()}
              onDismissAiSuggestion={onDismissAiSuggestion}
              onOpenIssue={openIssueTarget}
              onRunAiReview={onRunAiReview}
            />
          ) : null}
          {activeTab === "history" ? <AdminHistory submission={submission} /> : null}
        </div>

        {canAddIssue.ok && issueComposerOpen ? (
          <AdminIssueComposer
            draft={composerDraft}
            submission={submission}
            onCancel={closeIssueComposer}
            onSubmit={(input) => {
              onAddIssue(input);
              closeIssueComposer();
            }}
          />
        ) : null}

        <footer className="admin-review-footer">
          <span role={actionError ? "alert" : undefined}>
            {actionError ||
              (issueComposerOpen
                ? "Сначала создайте или отмените новое замечание."
                : (primaryAction.reason ??
                  adminFooterHint(submission, primaryAction.label)))}
          </span>
          <button className="admin-review-secondary" type="button" onClick={onClose}>
            Закрыть
          </button>
          <button
            className={`admin-review-primary ${
              primaryAction.action === "return_with_issues" ||
              primaryAction.action === "return_again"
                ? "is-return"
                : ""
            }`}
            disabled={primaryAction.disabled || issueComposerOpen}
            type="button"
            onClick={() => onAction(primaryAction.action)}
          >
            {primaryAction.label}
          </button>
        </footer>
      </aside>
    </div>
  );
}

type IssueComposerDraft = {
  applicantId?: string;
  field?: string;
  fileType?: Exclude<AdminIssueTarget, "questionnaire">;
  reason?: string;
  section?: string;
  target?: AdminIssueTarget;
};

function AdminOverview({
  onOpenIssue,
  onTab,
  primaryAction,
  submission,
}: {
  onOpenIssue: (issue: Issue) => void;
  onTab: (tab: DrawerTab) => void;
  primaryAction: ReturnType<typeof getPrimaryAction>;
  submission: Submission;
}) {
  const firstIssue = submission.issues.find((issue) => issue.status !== "closed_by_admin");

  return (
    <section className="admin-review-overview-tab" aria-label="Обзор подачи">
      <article className="admin-review-card admin-review-overview-main">
        <div className="admin-review-section-title">
          <span>Подача</span>
          <strong className="admin-review-section-heading">{submission.title}</strong>
        </div>
        <dl className="admin-review-fact-grid">
          <div>
            <dt>ID</dt>
            <dd>{submission.id}</dd>
          </div>
          <div>
            <dt>Город</dt>
            <dd>{submission.city}</dd>
          </div>
          <div>
            <dt>Статус</dt>
            <dd>{statusLabels[submission.status]}</dd>
          </div>
          <div>
            <dt>Агент</dt>
            <dd>{agentDisplayName(submission)}</dd>
          </div>
          <div>
            <dt>Заявители</dt>
            <dd>{applicantCountLabel(submission.applicants.length)}</dd>
          </div>
          <div>
            <dt>Даты</dt>
            <dd>{tripDates(submission)}</dd>
          </div>
        </dl>
      </article>

      <article className="admin-review-card">
        <div className="admin-review-section-title">
          <span>Готовность</span>
          <h3>{primaryAction.label}</h3>
        </div>
        <div className="admin-review-readiness">
          <ReadinessMeter label="Анкета" value={submission.completeness.questionnaire} />
          <ReadinessMeter label="Файлы" value={submission.completeness.files} />
          <ReadinessMeter label="Итого" value={submission.completeness.total} />
        </div>
        <div className="admin-review-action-note">
          {primaryAction.reason ??
            (openIssueCount(submission)
              ? "Есть открытые замечания. Возврат доступен только с точной целью."
              : "Блокеров нет. Решение выполняется через доменные guards.")}
        </div>
      </article>

      <article className="admin-review-card">
        <div className="admin-review-section-title">
          <span>Фокус</span>
          <h3>Следующее действие</h3>
        </div>
        {firstIssue ? (
          <button
            className="admin-review-focus-row"
            type="button"
            onClick={() => onOpenIssue(firstIssue)}
          >
            <strong>{issueTargetLine(firstIssue)}</strong>
            <span>{issueStatusLabel(firstIssue.status)} · {firstIssue.reason}</span>
          </button>
        ) : (
          <button
            className="admin-review-focus-row"
            type="button"
            onClick={() => onTab("files")}
          >
            <strong>Проверить обязательные файлы</strong>
            <span>{canonicalFileSummary(submission)}</span>
          </button>
        )}
      </article>
    </section>
  );
}

function AdminApplicants({
  onOpenApplicant,
  submission,
}: {
  onOpenApplicant: (applicant: Applicant) => void;
  submission: Submission;
}) {
  return (
    <section className="admin-review-list" aria-label="Заявители">
      {submission.applicants.map((applicant) => {
        const files = submission.files.filter((file) => file.applicantId === applicant.id);
        const readyFiles = files.filter(
          (file) => file.status !== "missing" && file.status !== "needs_replacement",
        ).length;
        const issues = applicantIssueCount(submission, applicant.id);

        return (
          <article className="admin-review-list-row" key={applicant.id}>
            <button type="button" onClick={() => onOpenApplicant(applicant)}>
              <span className="admin-review-avatar" aria-hidden="true">
                {initials(applicant.fullName)}
              </span>
              <span>
                <strong>{applicant.fullName}</strong>
                <small>{applicantRoleLabel(applicant.role)}</small>
              </span>
            </button>
            <div className="admin-review-row-metrics">
              <span>Анкета: {questionnaireLabel(applicant.questionnaireStatus)}</span>
              <span>Файлы: {readyFiles}/{files.length}</span>
              <span>{issues ? `${issues} замеч.` : "Без замечаний"}</span>
            </div>
          </article>
        );
      })}
    </section>
  );
}

function AdminQuestionnaire({
  onAddIssue,
  submission,
}: {
  onAddIssue: (draft: IssueComposerDraft) => void;
  submission: Submission;
}) {
  return (
    <section className="admin-review-questionnaire" aria-label="Анкета">
      {submission.applicants.map((applicant) => (
        <article className="admin-review-card" key={applicant.id}>
          <div className="admin-review-section-title">
            <span>{applicantRoleLabel(applicant.role)}</span>
            <h3>{applicant.fullName}</h3>
          </div>
          <div className="admin-review-section-stack">
            {applicant.sections.map((section) => (
              <QuestionnaireSectionView
                applicant={applicant}
                key={section.id}
                section={section}
                submission={submission}
                onAddIssue={onAddIssue}
              />
            ))}
          </div>
        </article>
      ))}
    </section>
  );
}

function QuestionnaireSectionView({
  applicant,
  onAddIssue,
  section,
  submission,
}: {
  applicant: Applicant;
  onAddIssue: (draft: IssueComposerDraft) => void;
  section: QuestionnaireSection;
  submission: Submission;
}) {
  return (
    <section className="admin-review-section" aria-label={`${applicant.fullName}: ${section.title}`}>
      <header>
        <div>
          <strong>{section.title}</strong>
          <span>{questionnaireLabel(section.status)}</span>
        </div>
        <button
          type="button"
          onClick={() =>
            onAddIssue({
              applicantId: applicant.id,
              field: preferredFieldLabel(section),
              reason: `${section.title}: требуется уточнение`,
              section: section.title,
              target: "questionnaire",
            })
          }
        >
          Замечание
        </button>
      </header>
      <div className="admin-review-field-table">
        {section.fields.map((field) => {
          const issue = fieldIssue(submission, applicant.id, section.title, field);
          return (
            <div
              aria-label={`${applicant.fullName} · ${section.title} · ${field.label}`}
              className={`admin-review-field-row ${issue ? "has-issue" : ""}`}
              key={field.id}
            >
              <span>{field.label}</span>
              <strong>{field.value || "Не заполнено"}</strong>
              <em>{issue ? issueStatusLabel(issue.status) : fieldReviewLabel(field)}</em>
              <button
                aria-label={`Создать замечание: ${field.label}`}
                type="button"
                onClick={() =>
                  onAddIssue({
                    applicantId: applicant.id,
                    field: field.label,
                    reason: `${field.label}: требуется уточнение`,
                    section: section.title,
                    target: "questionnaire",
                  })
                }
              >
                Замечание
              </button>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function AdminFiles({
  onAddIssue,
  submission,
}: {
  onAddIssue: (draft: IssueComposerDraft) => void;
  submission: Submission;
}) {
  const files = canonicalFiles(submission);

  return (
    <section className="admin-review-list" aria-label="Файлы">
      {files.map((file) => {
        const applicant = applicantForFile(submission, file);
        const issue = fileIssue(submission, file);
        const fileTarget = issueTargetForFile(file.type);

        return (
          <article
            aria-label={`${fileTargetLabel(file.type)}: ${applicant?.fullName ?? "заявитель"}, ${fileStatusLabel(file)}`}
            className={`admin-review-file-row ${issue ? "has-issue" : ""}`}
            key={file.id}
          >
            <div>
              <strong>{fileTargetLabel(file.type)}</strong>
              <span>{applicant?.fullName ?? "Заявитель"}</span>
            </div>
            <div>
              <span>{fileStatusLabels[file.status]}</span>
              {issue ? <em>{issueStatusLabel(issue.status)}</em> : null}
            </div>
            <button
              disabled={!fileTarget}
              type="button"
              onClick={() => {
                if (!fileTarget || !applicant) return;
                onAddIssue({
                  applicantId: applicant.id,
                  fileType: fileTarget,
                  reason: `${fileTargetLabel(file.type)} требует замены`,
                  section: "Файлы",
                  target: fileTarget,
                });
              }}
            >
              Замечание
            </button>
          </article>
        );
      })}
      {!files.length ? (
        <div className="admin-review-empty">Файлы для проверки не найдены.</div>
      ) : null}
    </section>
  );
}

function AdminIssues({
  canAddIssue,
  issueGuardReason,
  onAcceptAiSuggestion,
  onAddIssue,
  onDismissAiSuggestion,
  onOpenIssue,
  onRunAiReview,
  submission,
}: {
  canAddIssue: boolean;
  issueGuardReason: string;
  onAcceptAiSuggestion: (suggestionId: string) => void;
  onAddIssue: () => void;
  onDismissAiSuggestion: (suggestionId: string) => void;
  onOpenIssue: (issue: Issue) => void;
  onRunAiReview: () => void;
  submission: Submission;
}) {
  return (
    <section className="admin-review-issues" aria-label="Замечания">
      <div className="admin-review-issues-actions">
        <div>
          <strong>{openIssueCount(submission)} открытых</strong>
          <span>{fixedIssueCount(submission)} на подтверждении</span>
        </div>
        <button disabled={!canAddIssue} type="button" onClick={onAddIssue}>
          Добавить замечание
        </button>
      </div>
      {issueGuardReason ? <p className="admin-review-guard">{issueGuardReason}</p> : null}
      <BbAiPanel
        compact
        onAccept={onAcceptAiSuggestion}
        onDismiss={onDismissAiSuggestion}
        onRun={onRunAiReview}
        role="admin"
        submission={submission}
        surface="review"
      />
      <div className="admin-review-issues-list">
        {submission.issues.map((issue) => (
          <article
            aria-label={issueTargetLine(issue)}
            className={`is-${issue.severity} is-${issue.status}`}
            key={issue.id}
          >
            <header>
              <span>{issue.id}</span>
              <em>{issueStatusLabel(issue.status)}</em>
            </header>
            <button
              aria-label={`${issueTargetLine(issue)} · ${issue.reason}`}
              type="button"
              onClick={() => onOpenIssue(issue)}
            >
              <strong>{issueTargetLine(issue)}</strong>
              <span>{issue.reason}</span>
            </button>
            <p>{issue.comment}</p>
            <small>{issueSeverityLabel(issue.severity)}</small>
          </article>
        ))}
        {!submission.issues.length ? (
          <div className="admin-review-empty">Замечаний пока нет.</div>
        ) : null}
      </div>
    </section>
  );
}

function AdminHistory({ submission }: { submission: Submission }) {
  return (
    <section className="admin-review-history" aria-label="История">
      {submission.history.map((event) => (
        <article className="admin-review-history-row" key={event.id}>
          <span>{event.at}</span>
          <strong>{event.text}</strong>
          {event.detail ? <p>{event.detail}</p> : null}
        </article>
      ))}
      {!submission.history.length ? (
        <div className="admin-review-empty">История пока пуста.</div>
      ) : null}
    </section>
  );
}

function AdminIssueComposer({
  draft,
  onCancel,
  onSubmit,
  submission,
}: {
  draft: IssueComposerDraft | null;
  onCancel: () => void;
  onSubmit: (input: IssueInput) => void;
  submission: Submission;
}) {
  const defaultApplicantId = draft?.applicantId ?? submission.applicants[0]?.id ?? "";
  const defaultTarget = draft?.target ?? (draft?.fileType ?? "questionnaire");
  const [applicantId, setApplicantId] = useState(defaultApplicantId);
  const [target, setTarget] = useState<AdminIssueTarget>(defaultTarget);
  const [field, setField] = useState(draft?.field ?? "");
  const [severity, setSeverity] = useState<IssueSeverity>("blocker");
  const [reason, setReason] = useState(
    draft?.reason ?? defaultReasonForTarget(defaultTarget),
  );
  const [comment, setComment] = useState(defaultCommentForTarget(defaultTarget));
  const reasonRef = useRef<HTMLInputElement | null>(null);

  const applicant =
    submission.applicants.find((candidate) => candidate.id === applicantId) ??
    submission.applicants[0];
  const fields = applicant?.sections.flatMap((section) => section.fields) ?? [];
  const selectedField = field && fields.some((item) => item.label === field)
    ? field
    : (draft?.field ??
      fields.find((item) => item.label === "Маршрут поездки")?.label ??
      fields[0]?.label ??
      "");
  const selectedSection =
    draft?.section ??
    applicant?.sections.find((section) =>
      section.fields.some((candidate) => candidate.label === selectedField),
    )?.title ??
    "Анкета";
  const canSubmit = Boolean(applicant && reason.trim() && comment.trim());

  useEffect(() => {
    reasonRef.current?.focus({ preventScroll: true });
  }, []);

  function submit() {
    if (!applicant || !canSubmit) return;
    const selectedTarget = adminIssueTargets.find((item) => item.id === target);
    const fileType = target === "questionnaire" ? undefined : target;

    onSubmit({
      applicantId: applicant.id,
      comment: comment.trim(),
      field: fileType ? undefined : selectedField,
      fileType,
      reason: reason.trim(),
      section: fileType ? "Файлы" : selectedSection,
      severity,
      type: selectedTarget?.type ?? "field",
    });
  }

  return (
    <section aria-label="Новое замечание" className="admin-review-composer">
      <div className="admin-review-composer-head">
        <div>
          <span>Новая проблема</span>
          <h3>Точная цель возврата</h3>
        </div>
        <button aria-label="Закрыть форму замечания" type="button" onClick={onCancel}>
          ×
        </button>
      </div>
      <div className="admin-review-composer-body">
        <label>
          <span>Заявитель</span>
          <select value={applicant?.id ?? ""} onChange={(event) => setApplicantId(event.target.value)}>
            {submission.applicants.map((candidate) => (
              <option key={candidate.id} value={candidate.id}>
                {candidate.fullName}
              </option>
            ))}
          </select>
        </label>

        <fieldset className="admin-review-targets">
          <legend>Где найдена ошибка?</legend>
          {adminIssueTargets.map((item) => (
            <button
              aria-pressed={target === item.id}
              className={target === item.id ? "is-active" : ""}
              key={item.id}
              type="button"
              onClick={() => {
                setTarget(item.id);
                setReason(defaultReasonForTarget(item.id));
                setComment(defaultCommentForTarget(item.id));
              }}
            >
              {item.label}
            </button>
          ))}
        </fieldset>

        {target === "questionnaire" ? (
          <label>
            <span>Поле</span>
            <select value={selectedField} onChange={(event) => setField(event.target.value)}>
              {fields.map((candidate) => (
                <option key={candidate.id} value={candidate.label}>
                  {candidate.label}
                </option>
              ))}
            </select>
          </label>
        ) : null}

        <label>
          <span>Критичность</span>
          <select value={severity} onChange={(event) => setSeverity(event.target.value as IssueSeverity)}>
            <option value="blocker">Блокер</option>
            <option value="warning">Проверить</option>
            <option value="info">Инфо</option>
          </select>
        </label>

        <label>
          <span>Причина</span>
          <input ref={reasonRef} value={reason} onChange={(event) => setReason(event.target.value)} />
        </label>

        <label>
          <span>Комментарий агенту</span>
          <textarea value={comment} onChange={(event) => setComment(event.target.value)} />
        </label>
      </div>
      <div className="admin-review-composer-actions">
        <button type="button" onClick={onCancel}>
          Отмена
        </button>
        <button disabled={!canSubmit} type="button" onClick={submit}>
          Создать замечание
        </button>
      </div>
    </section>
  );
}

function ReadinessMeter({ label, value }: { label: string; value: number }) {
  return (
    <div className="admin-review-meter">
      <span>{label}</span>
      <strong>{value}%</strong>
      <i style={{ width: `${Math.max(0, Math.min(value, 100))}%` }} />
    </div>
  );
}

function drawerTabValue(submission: Submission, tab: DrawerTab) {
  if (tab === "applicants") return String(submission.applicants.length);
  if (tab === "files") return String(canonicalFiles(submission).length);
  if (tab === "issues") return String(openIssueCount(submission) + fixedIssueCount(submission));
  return "";
}

function agentDisplayName(submission: Submission) {
  return (
    submission.returnedPdfPackage?.ownerAgentName ??
    localAgentNames[submission.agentId] ??
    submission.agentId
  );
}

function adminFooterHint(submission: Submission, actionLabel: string) {
  if (openIssueCount(submission)) {
    return `Открытые замечания: ${openIssueCount(submission)}. Действие: ${actionLabel}.`;
  }
  if (fixedIssueCount(submission)) {
    return "Исправления агента можно закрыть только доменным действием администратора.";
  }
  return "Проверьте анкету и файлы перед решением администратора.";
}

function canonicalFiles(submission: Submission) {
  return submission.files.filter((file) => activeMediaFileTypes.includes(file.type));
}

function canonicalFileSummary(submission: Submission) {
  const files = canonicalFiles(submission);
  const ready = files.filter(
    (file) => file.status !== "missing" && file.status !== "needs_replacement",
  ).length;
  return `${ready}/${files.length} обязательных файлов`;
}

function applicantForFile(submission: Submission, file: SubmissionFile) {
  return (
    submission.applicants.find((applicant) => applicant.id === file.applicantId) ??
    submission.applicants[0]
  );
}

function applicantIssueCount(submission: Submission, applicantId: string) {
  return submission.issues.filter(
    (issue) =>
      issue.status !== "closed_by_admin" && issue.target.applicantId === applicantId,
  ).length;
}

function fieldIssue(
  submission: Submission,
  applicantId: string,
  sectionTitle: string,
  field: QuestionnaireField,
) {
  return submission.issues.find(
    (issue) =>
      issue.status !== "closed_by_admin" &&
      !issue.target.fileType &&
      issue.target.applicantId === applicantId &&
      (issue.target.field === field.label || issue.target.section === sectionTitle),
  );
}

function fileIssue(submission: Submission, file: SubmissionFile) {
  return submission.issues.find(
    (issue) =>
      issue.status !== "closed_by_admin" &&
      issue.target.applicantId === file.applicantId &&
      issue.target.fileType === file.type,
  );
}

function issueTargetForFile(type: SubmissionFileType) {
  if (type === "passport_scan" || type === "selfie" || type === "selfie_2") {
    return type;
  }
  return undefined;
}

function issueTargetLine(issue: Issue) {
  const target = issue.target;
  if (target.fileType) {
    return `${target.applicantName} · Медиа · ${fileTargetLabel(target.fileType)}`;
  }
  return `${target.applicantName} · ${target.section ?? "Анкета"} · ${
    target.field ?? issue.reason
  }`;
}

function fileTargetLabel(type: SubmissionFileType) {
  if (type === "passport_scan") return "Скан загранпаспорта";
  if (type === "selfie") return "Селфи";
  if (type === "selfie_2") return "Селфи N2";
  return fileLabel(type);
}

function defaultReasonForTarget(target: AdminIssueTarget) {
  if (target === "passport_scan") return "Скан загранпаспорта требует замены";
  if (target === "selfie") return "Селфи требует замены";
  if (target === "selfie_2") return "Селфи N2 требует замены";
  return "Нужно уточнить маршрут поездки";
}

function defaultCommentForTarget(target: AdminIssueTarget) {
  if (target === "questionnaire") {
    return "Проверьте указанное значение анкеты и отправьте исправление.";
  }
  return "Загрузите корректный файл и отправьте исправление на повторную проверку.";
}

function preferredFieldLabel(section: QuestionnaireSection) {
  return (
    section.fields.find((field) => field.label === "Маршрут поездки")?.label ??
    section.fields[0]?.label ??
    section.title
  );
}

function questionnaireLabel(status: Applicant["questionnaireStatus"]) {
  if (status === "complete") return "Готово";
  if (status === "needs_fix") return "Нужно исправить";
  if (status === "partial") return "Частично";
  return "Пусто";
}

function fieldReviewLabel(field: QuestionnaireField) {
  if (field.reviewState === "confirmed" || field.reviewConfirmedAtIso) return "Проверено";
  if (!field.value && field.required) return "Не заполнено";
  return "К проверке";
}

function issueStatusLabel(status: Issue["status"]) {
  if (status === "open") return "Открыто";
  if (status === "fixed_by_agent") return "Исправлено агентом";
  return "Закрыто";
}

function issueSeverityLabel(severity: IssueSeverity) {
  if (severity === "blocker") return "Блокер";
  if (severity === "warning") return "Проверить";
  return "Инфо";
}

function applicantRoleLabel(role: Applicant["role"] | undefined) {
  if (role === "main") return "Основной";
  if (role === "spouse") return "Супруг/супруга";
  if (role === "child") return "Ребенок";
  return "Заявитель";
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
