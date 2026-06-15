import { applicantCountLabel, nextAuditLine, tripDates } from "../selectors";
import {
  blockerCount,
  getCardActionLabel,
  getPrimaryAction,
  nextProblem,
  responsibleRole,
  typeLabels,
} from "../status";
import type { DrawerTab, Role, Submission } from "../types";
import { EmptyState, StatusChip, SummaryRow } from "./Primitives";

export function SubmissionList({
  activeSubmission,
  empty,
  onOpen,
  onSelect,
  role,
  submissions,
}: {
  activeSubmission: Submission;
  empty: string;
  onOpen: (submission: Submission, tab?: DrawerTab) => void;
  onSelect: (submission: Submission) => void;
  role: Role;
  submissions: Submission[];
}) {
  return (
    <div className="submission-list">
      {submissions.map((submission) => (
        <SubmissionCard
          active={submission.id === activeSubmission.id}
          key={submission.id}
          onOpen={onOpen}
          onSelect={onSelect}
          role={role}
          submission={submission}
        />
      ))}
      {submissions.length === 0 ? <EmptyState text={empty} /> : null}
    </div>
  );
}

function SubmissionCard({
  active,
  onOpen,
  onSelect,
  role,
  submission,
}: {
  active: boolean;
  onOpen: (submission: Submission, tab?: DrawerTab) => void;
  onSelect: (submission: Submission) => void;
  role: Role;
  submission: Submission;
}) {
  const action = getPrimaryAction(
    submission,
    role,
    role === "admin" ? "review" : "agent",
  );
  const cardLabel = getCardActionLabel(submission, role);

  return (
    <article
      className={`submission-card ${active ? "is-selected" : ""}`}
      onClick={() => onSelect(submission)}
    >
      <div className="card-main">
        <div className="card-topline">
          <strong>{submission.id}</strong>
          <StatusChip submission={submission} />
          {blockerCount(submission) > 0 ? (
            <span className="status-chip danger">
              {blockerCount(submission)} блокера
            </span>
          ) : null}
        </div>
        <h3>{submission.title}</h3>
        <p className="meta-line">
          {typeLabels[submission.type]} ·{" "}
          {applicantCountLabel(submission.applicants.length)} · Испания ·{" "}
          {submission.city} · {tripDates(submission)}
        </p>
        <div className="problem-line">
          <span aria-hidden="true">!</span>
          <p>{nextProblem(submission)}</p>
        </div>
        <div
          className="progress-line"
          role="progressbar"
          aria-label="Готовность подачи"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={submission.completeness.total}
        >
          <span style={{ width: `${submission.completeness.total}%` }} />
        </div>
      </div>
      <div className="card-side">
        <span className="owner-pill">{responsibleRole(submission)}</span>
        <p>{nextAuditLine(submission)}</p>
        <button
          className={
            action.action === "return_with_issues"
              ? "primary-button danger-action"
              : "secondary-button"
          }
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onOpen(submission);
          }}
        >
          {cardLabel}
        </button>
      </div>
    </article>
  );
}

export function RightRail({
  activeSubmission,
  onOpen,
  summaryChips,
}: {
  activeSubmission: Submission;
  onOpen: (submission: Submission, tab?: DrawerTab) => void;
  summaryChips?: Array<[string, string, string]>;
}) {
  const isProblemState =
    activeSubmission.status === "returned" ||
    activeSubmission.status === "requires_action";
  const steps = agentNextSteps(activeSubmission);

  return (
    <aside className="right-rail" aria-label="Контекст выбранной подачи">
      {summaryChips ? (
        <section className="rail-panel rail-summary">
          <p className="kicker">Информация по заявкам</p>
          <SummaryRow chips={summaryChips} />
        </section>
      ) : null}
      <section className="rail-panel selected-context">
        <p className="kicker">Выбранная подача</p>
        <h2>{activeSubmission.title}</h2>
        <StatusChip submission={activeSubmission} />
        <dl>
          <div>
            <dt>Проблема</dt>
            <dd>{nextProblem(activeSubmission)}</dd>
          </div>
          <div>
            <dt>Действует</dt>
            <dd>{responsibleRole(activeSubmission)}</dd>
          </div>
          <div>
            <dt>Следующая кнопка</dt>
            <dd>{getCardActionLabel(activeSubmission, "agent")}</dd>
          </div>
        </dl>
        <button
          className={
            isProblemState ? "primary-button wide danger-action" : "primary-button wide"
          }
          type="button"
          onClick={() => onOpen(activeSubmission)}
        >
          {getCardActionLabel(activeSubmission, "agent")}
        </button>
      </section>
      <section className="rail-panel">
        <p className="kicker">Следующие действия</p>
        <ul className="next-list">
          {steps.map((step, index) => (
            <li key={step}>
              <span>{index + 1}</span>
              <p>{step}</p>
            </li>
          ))}
        </ul>
      </section>
    </aside>
  );
}

function agentNextSteps(submission: Submission) {
  if (submission.status === "returned" || submission.status === "requires_action") {
    return [
      "Перейти к замечаниям выбранной подачи",
      "Исправить анкету или файлы внутри панели",
      "Отправить исправления на проверку",
    ];
  }

  if (submission.status === "draft" || submission.status === "in_progress") {
    return [
      "Заполнить анкету",
      "Загрузить обязательные файлы",
      "Отправить на проверку",
    ];
  }

  if (
    submission.status === "submitted_for_review" ||
    submission.status === "corrections_received"
  ) {
    return ["Смотреть статус проверки", "Ждать действия администратора"];
  }

  if (submission.status === "ready_for_export") {
    return ["Подача принята", "Администратор выполнит выгрузку"];
  }

  return ["Смотреть историю подачи"];
}
