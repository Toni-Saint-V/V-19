import type { ReactNode } from "react";
import {
  ChevronRight,
  FileText,
  FolderOpen,
  User,
  Users,
} from "lucide-react";

import { Button } from "../../../shared/ui/primitives";
import { cn } from "../../../shared/ui/cn";
import { formatSubmissionListTitle } from "../listFormatters";
import { submissionPublicId } from "../submissionIdentity";
import { applicantCountLabel, tripDates } from "../selectors";
import {
  blockerCount,
  nextProblem,
  openIssueCount,
  statusLabelFor,
} from "../status";
import type { DrawerTab, Submission, SubmissionFile } from "../types";

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

export function AgentDocumentCollectionScreen({
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
                    <small>{submissionPublicId(submission)}</small>
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
