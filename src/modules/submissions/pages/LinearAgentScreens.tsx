import type { ReactNode } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  FileCheck2,
  FileText,
  FolderOpen,
  ImageIcon,
  MessageSquareWarning,
  UploadCloud,
  User,
  Users,
} from "lucide-react";

import { Button } from "../../../shared/ui/primitives";
import { cn } from "../../../shared/ui/cn";
import { formatSubmissionListTitle } from "../listFormatters";
import { applicantCountLabel, tripDates } from "../selectors";
import {
  blockerCount,
  fileStatusLabels,
  fileTypeLabels,
  fixedIssueCount,
  nextProblem,
  openIssueCount,
  statusLabelFor,
} from "../status";
import type { DrawerTab, Issue, Submission, SubmissionFile } from "../types";

type LinearOpenHandler = (submission: Submission, tab?: DrawerTab) => void;

type LinearAgentScreenProps = {
  hasSearchQuery?: boolean;
  onClearSearch?: () => void;
  onCreate?: () => void;
  onOpen: LinearOpenHandler;
  submissions: Submission[];
};

function percent(value: number, total: number) {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((value / total) * 100)));
}

function fileIsReady(file: SubmissionFile) {
  return file.status === "uploaded" || file.status === "pending_review" || file.status === "accepted";
}

function fileNeedsWork(file: SubmissionFile) {
  return file.status === "missing" || file.status === "needs_replacement";
}

function applicantInitials(name: string) {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase()).join("") || "З";
}

function EmptyLinearState({
  action = "Сбросить поиск",
  body,
  onAction,
  title,
}: {
  action?: string;
  body: string;
  onAction?: () => void;
  title: string;
}) {
  return (
    <div className="vf-linear-empty" role="status">
      <div className="vf-linear-empty-icon" aria-hidden="true">
        <FolderOpen size={22} strokeWidth={1.8} />
      </div>
      <h3>{title}</h3>
      <p>{body}</p>
      {onAction ? (
        <Button variant="secondary" onClick={onAction}>
          {action}
        </Button>
      ) : null}
    </div>
  );
}

function LinearSectionHeader({
  action,
  icon,
  kicker,
  title,
}: {
  action?: ReactNode;
  icon: ReactNode;
  kicker: string;
  title: string;
}) {
  return (
    <header className="vf-linear-section-head">
      <span className="vf-linear-section-icon" aria-hidden="true">
        {icon}
      </span>
      <span>
        <small>{kicker}</small>
        <strong>{title}</strong>
      </span>
      {action ? <span className="vf-linear-section-action">{action}</span> : null}
    </header>
  );
}

function LinearSubmissionMeta({ submission }: { submission: Submission }) {
  return (
    <div className="vf-linear-meta-row">
      <span>{submission.city}</span>
      <span>{applicantCountLabel(submission.applicants.length)}</span>
      <span>{tripDates(submission)}</span>
      <span>{statusLabelFor(submission.status, "compact")}</span>
    </div>
  );
}

function ProgressLine({ label, value }: { label: string; value: number }) {
  const safeValue = Math.max(0, Math.min(100, Math.round(value)));
  const bucket = Math.max(0, Math.min(100, Math.round(safeValue / 5) * 5));
  return (
    <div className="vf-linear-progress" data-progress={safeValue}>
      <span>
        <small>{label}</small>
        <strong>{safeValue}%</strong>
      </span>
      <div aria-hidden="true">
        <i className={`is-p-${bucket}`} />
      </div>
    </div>
  );
}

function SubmissionOpenButton({
  label = "Открыть",
  onClick,
}: {
  label?: string;
  onClick: () => void;
}) {
  return (
    <button className="vf-linear-open" type="button" onClick={onClick}>
      <span>{label}</span>
      <ChevronRight size={16} strokeWidth={1.9} aria-hidden="true" />
    </button>
  );
}

export function AgentDraftsScreen({
  hasSearchQuery = false,
  onClearSearch,
  onCreate,
  onOpen,
  submissions,
}: LinearAgentScreenProps) {
  if (!submissions.length) {
    return (
      <section className="vf-linear-screen vf-linear-screen--drafts">
        <EmptyLinearState
          action={hasSearchQuery ? "Сбросить поиск" : "Создать пакет"}
          body={
            hasSearchQuery
              ? "По текущему поиску нет подач с документами."
              : "Создайте первую подачу или загрузите документы, чтобы собрать пакет."
          }
          title={hasSearchQuery ? "Документы не найдены" : "Документы ещё не собирались"}
          onAction={hasSearchQuery ? onClearSearch : onCreate}
        />
      </section>
    );
  }

  const totalFiles = submissions.reduce((sum, submission) => sum + submission.files.length, 0);
  const readyFiles = submissions.reduce(
    (sum, submission) => sum + submission.files.filter(fileIsReady).length,
    0,
  );
  const blockedSubmissions = submissions.filter((submission) =>
    submission.files.some(fileNeedsWork) || blockerCount(submission) > 0,
  ).length;

  return (
    <section className="vf-linear-screen vf-linear-screen--drafts">
      <div className="vf-linear-metrics">
        <article>
          <small>Файлы собраны</small>
          <strong>{readyFiles}/{totalFiles || 0}</strong>
          <span>по текущей очереди</span>
        </article>
        <article>
          <small>Пакеты с блокерами</small>
          <strong>{blockedSubmissions}</strong>
          <span>нужны действия агента</span>
        </article>
        <article>
          <small>Средняя готовность</small>
          <strong>
            {submissions.length
              ? Math.round(submissions.reduce((sum, item) => sum + item.completeness.total, 0) / submissions.length)
              : 0}%
          </strong>
          <span>анкета + файлы</span>
        </article>
      </div>

      <LinearSectionHeader
        icon={<FileText size={18} strokeWidth={1.8} />}
        kicker="Сегодня"
        title="Сбор документов"
        action={
          onCreate ? (
            <Button variant="secondary" onClick={onCreate}>
              Создать пакет
            </Button>
          ) : null
        }
      />

      <div className="vf-linear-card-list">
        {submissions.map((submission) => {
          const ready = submission.files.filter(fileIsReady).length;
          const fileProgress = percent(ready, submission.files.length);
          const issueCount = openIssueCount(submission);
          const problem = nextProblem(submission);

          return (
            <article className="vf-linear-submission-card" key={submission.id}>
              <div className="vf-linear-card-main">
                <div className="vf-linear-card-title-row">
                  <span className="vf-linear-type-mark" aria-hidden="true">
                    {submission.type === "family" ? <Users size={16} /> : <User size={16} />}
                  </span>
                  <div>
                    <small>{submission.id}</small>
                    <h3>{formatSubmissionListTitle(submission)}</h3>
                  </div>
                </div>
                <LinearSubmissionMeta submission={submission} />
                <div className="vf-linear-progress-grid">
                  <ProgressLine label="Документы" value={fileProgress} />
                  <ProgressLine label="Анкета" value={submission.completeness.questionnaire} />
                </div>
                <p className={cn("vf-linear-problem", issueCount > 0 && "is-warning")}>
                  {problem || (issueCount > 0 ? `${issueCount} открытых замечаний` : "Критичных блокеров нет")}
                </p>
              </div>
              <div className="vf-linear-card-side">
                <span className={cn("vf-linear-status-pill", issueCount > 0 && "tone-warning")}>
                  {issueCount > 0 ? `Ошибки ${issueCount}` : statusLabelFor(submission.status, "compact")}
                </span>
                <SubmissionOpenButton label="Документы" onClick={() => onOpen(submission, "files")} />
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export function AgentApplicantsScreen({
  hasSearchQuery = false,
  onClearSearch,
  onCreate,
  onOpen,
  submissions,
}: LinearAgentScreenProps) {
  if (!submissions.length) {
    return (
      <section className="vf-linear-screen vf-linear-screen--applicants">
        <EmptyLinearState
          action={hasSearchQuery ? "Сбросить поиск" : "Создать заявителя"}
          body={
            hasSearchQuery
              ? "Поиск не нашёл заявителей или семей."
              : "Заявители появятся после создания подачи."
          }
          title={hasSearchQuery ? "Заявители не найдены" : "Нет заявителей"}
          onAction={hasSearchQuery ? onClearSearch : onCreate}
        />
      </section>
    );
  }

  const familySubmissions = submissions.filter((submission) => submission.type === "family");
  const singleSubmissions = submissions.filter((submission) => submission.type === "single");

  return (
    <section className="vf-linear-screen vf-linear-screen--applicants">
      <LinearSectionHeader
        icon={<Users size={18} strokeWidth={1.8} />}
        kicker="Профили"
        title="Семьи"
      />
      <div className="vf-linear-family-grid">
        {familySubmissions.length ? (
          familySubmissions.map((submission) => (
            <article className="vf-linear-family-card" key={submission.id}>
              <div className="vf-linear-family-head">
                <div>
                  <small>{submission.id}</small>
                  <h3>{formatSubmissionListTitle(submission)}</h3>
                  <LinearSubmissionMeta submission={submission} />
                </div>
                <span>{submission.applicants.length}</span>
              </div>
              <div className="vf-linear-member-stack">
                {submission.applicants.map((applicant) => (
                  <button
                    className="vf-linear-member-row"
                    key={applicant.id}
                    type="button"
                    onClick={() => onOpen(submission, "applicants")}
                  >
                    <span>{applicantInitials(applicant.fullName)}</span>
                    <strong>{applicant.fullName}</strong>
                    <em>{applicant.questionnaireStatus === "complete" ? "Анкета готова" : "Нужно заполнить"}</em>
                  </button>
                ))}
              </div>
              <SubmissionOpenButton label="Открыть семью" onClick={() => onOpen(submission, "applicants")} />
            </article>
          ))
        ) : (
          <div className="vf-linear-soft-empty">Семейных подач в текущей выборке нет.</div>
        )}
      </div>

      <LinearSectionHeader
        icon={<User size={18} strokeWidth={1.8} />}
        kicker="Профили"
        title="Индивидуальные заявители"
      />
      <div className="vf-linear-individual-grid">
        {singleSubmissions.length ? (
          singleSubmissions.map((submission) => {
            const applicant = submission.applicants[0];
            return (
              <article className="vf-linear-person-card" key={submission.id}>
                <span className="vf-linear-avatar" aria-hidden="true">
                  {applicantInitials(applicant?.fullName ?? submission.title)}
                </span>
                <div>
                  <small>{submission.id}</small>
                  <h3>{applicant?.fullName ?? formatSubmissionListTitle(submission)}</h3>
                  <LinearSubmissionMeta submission={submission} />
                </div>
                <SubmissionOpenButton onClick={() => onOpen(submission, "applicants")} />
              </article>
            );
          })
        ) : (
          <div className="vf-linear-soft-empty">Индивидуальных подач в текущей выборке нет.</div>
        )}
      </div>
    </section>
  );
}

export function AgentMediaScreen({
  hasSearchQuery = false,
  onClearSearch,
  onCreate,
  onOpen,
  submissions,
}: LinearAgentScreenProps) {
  const rows = submissions.flatMap((submission) =>
    submission.files.map((file) => ({ file, submission })),
  );

  if (!rows.length) {
    return (
      <section className="vf-linear-screen vf-linear-screen--media">
        <EmptyLinearState
          action={hasSearchQuery ? "Сбросить поиск" : "Загрузить"}
          body={
            hasSearchQuery
              ? "Поиск не нашёл файлов."
              : "Файлы появятся после создания подачи и выбора документов."
          }
          title={hasSearchQuery ? "Файлы не найдены" : "Файлов пока нет"}
          onAction={hasSearchQuery ? onClearSearch : onCreate}
        />
      </section>
    );
  }

  const missing = rows.filter(({ file }) => fileNeedsWork(file)).length;
  const accepted = rows.filter(({ file }) => file.status === "accepted").length;
  const review = rows.filter(({ file }) => file.status === "uploaded" || file.status === "pending_review").length;

  return (
    <section className="vf-linear-screen vf-linear-screen--media">
      <div className="vf-linear-metrics">
        <article>
          <small>Нужно загрузить/заменить</small>
          <strong>{missing}</strong>
          <span>слотов документов</span>
        </article>
        <article>
          <small>На проверке</small>
          <strong>{review}</strong>
          <span>файлов ожидают решения</span>
        </article>
        <article>
          <small>Принято</small>
          <strong>{accepted}</strong>
          <span>подтверждено админом</span>
        </article>
      </div>

      <LinearSectionHeader
        icon={<ImageIcon size={18} strokeWidth={1.8} />}
        kicker="Очередь"
        title="Файлы документов"
        action={
          onCreate ? (
            <Button variant="secondary" onClick={onCreate}>
              Загрузить
            </Button>
          ) : null
        }
      />

      <div className="vf-linear-table-card">
        {rows.map(({ file, submission }) => {
          const applicant = submission.applicants.find((item) => item.id === file.applicantId);
          return (
            <button
              className="vf-linear-media-row"
              key={`${submission.id}-${file.id}`}
              type="button"
              onClick={() => onOpen(submission, "files")}
            >
              <span className="vf-linear-media-icon" aria-hidden="true">
                {fileNeedsWork(file) ? <UploadCloud size={17} /> : <FileCheck2 size={17} />}
              </span>
              <span className="vf-linear-media-main">
                <strong>{file.generatedFileName || file.originalFileName || fileTypeLabels[file.type]}</strong>
                <em>{formatSubmissionListTitle(submission)} · {applicant?.fullName ?? "Заявитель"}</em>
              </span>
              <span className={cn("vf-linear-file-status", `is-${file.status}`)}>
                {fileStatusLabels[file.status]}
              </span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

export function AgentIssuesScreen({
  hasSearchQuery = false,
  onClearSearch,
  onOpen,
  submissions,
}: LinearAgentScreenProps) {
  const issueRows = submissions.flatMap((submission) =>
    submission.issues.map((issue) => ({ issue, submission })),
  );

  if (!issueRows.length) {
    return (
      <section className="vf-linear-screen vf-linear-screen--issues">
        <EmptyLinearState
          body={
            hasSearchQuery
              ? "Поиск не нашёл замечаний."
              : "Замечаний нет. Когда администратор вернёт пакет, задачи появятся здесь."
          }
          title={hasSearchQuery ? "Замечания не найдены" : "Открытых замечаний нет"}
          onAction={hasSearchQuery ? onClearSearch : undefined}
        />
      </section>
    );
  }

  const open = issueRows.filter(({ issue }) => issue.status === "open").length;
  const fixed = submissions.reduce((sum, submission) => sum + fixedIssueCount(submission), 0);
  const blockers = issueRows.filter(({ issue }) => issue.severity === "blocker" && issue.status === "open").length;

  return (
    <section className="vf-linear-screen vf-linear-screen--issues">
      <div className="vf-linear-metrics">
        <article>
          <small>Открыто</small>
          <strong>{open}</strong>
          <span>ждут исправления</span>
        </article>
        <article>
          <small>Блокеры</small>
          <strong>{blockers}</strong>
          <span>нельзя отправлять дальше</span>
        </article>
        <article>
          <small>Исправлено</small>
          <strong>{fixed}</strong>
          <span>ожидают закрытия админом</span>
        </article>
      </div>

      <LinearSectionHeader
        icon={<MessageSquareWarning size={18} strokeWidth={1.8} />}
        kicker="Контроль качества"
        title="Замечания и ошибки"
      />

      <div className="vf-linear-card-list">
        {issueRows.map(({ issue, submission }) => (
          <IssueCard
            issue={issue}
            key={`${submission.id}-${issue.id}`}
            onOpen={() => onOpen(submission, "issues")}
            submission={submission}
          />
        ))}
      </div>
    </section>
  );
}

function IssueCard({
  issue,
  onOpen,
  submission,
}: {
  issue: Issue;
  onOpen: () => void;
  submission: Submission;
}) {
  const isClosed = issue.status === "closed_by_admin";
  const isFixed = issue.status === "fixed_by_agent";
  return (
    <article className={cn("vf-linear-issue-card", isClosed && "is-closed", isFixed && "is-fixed")}>
      <span className={cn("vf-linear-issue-icon", issue.severity === "blocker" && "tone-danger")} aria-hidden="true">
        {isClosed ? <CheckCircle2 size={18} /> : <AlertTriangle size={18} />}
      </span>
      <div className="vf-linear-issue-main">
        <small>{submission.id} · {issue.target.applicantName}</small>
        <h3>{issue.reason}</h3>
        <p>{issue.comment || "Комментарий не указан."}</p>
        <div className="vf-linear-meta-row">
          <span>{issue.target.section || issue.type}</span>
          <span>{issue.status === "open" ? "Открыто" : isFixed ? "Исправлено агентом" : "Закрыто"}</span>
          <span>{issue.severity}</span>
        </div>
      </div>
      <SubmissionOpenButton label="Исправить" onClick={onOpen} />
    </article>
  );
}
