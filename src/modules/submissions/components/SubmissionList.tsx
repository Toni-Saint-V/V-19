import { applicantCountLabel, nextAuditLine, tripDates } from "../selectors";
import { type KeyboardEvent, useRef } from "react";
import { Badge, Button, CardComponent } from "../../../shared/ui/primitives";
import {
  blockerCount,
  fileTypeLabels,
  getCardActionLabel,
  getPrimaryAction,
  nextProblem,
  responsibleRole,
  statusTone,
  typeLabels,
} from "../status";
import type { DrawerTab, Issue, Role, Submission } from "../types";
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
  const cardRefs = useRef(new Map<string, HTMLElement>());

  function focusSubmissionAt(index: number) {
    const nextIndex = Math.min(Math.max(index, 0), submissions.length - 1);
    const nextSubmission = submissions[nextIndex];

    if (!nextSubmission) return;

    onSelect(nextSubmission);
    requestAnimationFrame(() => {
      cardRefs.current.get(nextSubmission.id)?.focus({ preventScroll: true });
    });
  }

  return (
    <div className="submission-list">
      {submissions.map((submission, index) => (
        <SubmissionCard
          active={submission.id === activeSubmission.id}
          cardRef={(node) => {
            if (node) cardRefs.current.set(submission.id, node);
            else cardRefs.current.delete(submission.id);
          }}
          index={index}
          key={submission.id}
          onMoveFocus={focusSubmissionAt}
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
  cardRef,
  index,
  onMoveFocus,
  onOpen,
  onSelect,
  role,
  submission,
}: {
  active: boolean;
  cardRef: (node: HTMLElement | null) => void;
  index: number;
  onMoveFocus: (index: number) => void;
  onOpen: (submission: Submission, tab?: DrawerTab) => void;
  onSelect: (submission: Submission) => void;
  role: Role;
  submission: Submission;
}) {
  const isAdminCard = role === "admin";
  const blockers = blockerCount(submission);
  const issueLines = cardIssueLines(submission);
  const fileSlots = fileSlotSummary(submission);
  const submissionTypeFact =
    submission.type === "family" ? typeLabels[submission.type] : null;
  const cardSide = isAdminCard ? null : (
    <AgentCardSide onOpen={onOpen} role={role} submission={submission} />
  );

  function handleCardKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (event.target !== event.currentTarget) return;

    if (event.key === "Enter") {
      event.preventDefault();
      onOpen(submission);
      return;
    }

    if (event.key === " ") {
      event.preventDefault();
      onSelect(submission);
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      onMoveFocus(index + 1);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      onMoveFocus(index - 1);
      return;
    }

    if (event.key === "Home") {
      event.preventDefault();
      onMoveFocus(0);
      return;
    }

    if (event.key === "End") {
      event.preventDefault();
      onMoveFocus(Number.MAX_SAFE_INTEGER);
    }
  }

  return (
    <CardComponent
      as="article"
      aria-current={active ? "true" : undefined}
      aria-label={`Выбрать подачу ${submission.id}: ${submission.title}`}
      className={`submission-card tone-${statusTone[submission.status]} ${
        active ? "is-selected" : ""
      } ${
        isAdminCard ? "is-admin-card" : ""
      }`}
      ref={cardRef}
      tabIndex={0}
      onClick={() => onSelect(submission)}
      onKeyDown={handleCardKeyDown}
    >
      <div className="card-main">
        <div className="card-identity">
          <div className="card-topline">
            <strong>{submission.id}</strong>
            <StatusChip submission={submission} />
            {blockers > 0 ? (
              <Badge className="blocker-count">{blockers} блокера</Badge>
            ) : null}
          </div>
          <h3>{submission.title}</h3>
          <p className="meta-line">
            Испания · {submission.city} · {tripDates(submission)}
          </p>
        </div>
        <div className="card-summary">
          <div className="card-facts" aria-label="Операционная сводка">
            {submissionTypeFact ? <span>{submissionTypeFact}</span> : null}
            <span>{applicantCountLabel(submission.applicants.length)}</span>
            <span>Анкета {submission.completeness.questionnaire}%</span>
            <span>
              Файлы {fileSlots.ready}/{fileSlots.total}
            </span>
          </div>
          {issueLines.length ? (
            <p className={`card-issue-summary is-${issueLines[0].severity}`}>
              <strong>{issueLines[0].target}</strong>
              <span>{issueLines[0].text}</span>
              {issueLines.length > 1 ? <em>+{issueLines.length - 1}</em> : null}
            </p>
          ) : null}
        </div>
        <div className={`problem-line ${blockers > 0 ? "is-danger" : ""}`}>
          <span aria-hidden="true">{blockers > 0 ? "!" : "→"}</span>
          <p>
            <strong>{role === "admin" ? "Проверка:" : "Дальше:"}</strong>{" "}
            {cardNextActionLine(submission, role)}
          </p>
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
      {cardSide}
    </CardComponent>
  );
}

function AgentCardSide({
  onOpen,
  role,
  submission,
}: {
  onOpen: (submission: Submission, tab?: DrawerTab) => void;
  role: Role;
  submission: Submission;
}) {
  const action = getPrimaryAction(submission, role, "agent");
  const cardLabel = getCardActionLabel(submission, role);

  return (
    <div className="card-side">
      <div className="card-side-head">
        <small>Ответственный</small>
        <span className="owner-pill">{responsibleRole(submission)}</span>
      </div>
      <p>{nextAuditLine(submission)}</p>
      <Button
        danger={action.action === "return_with_issues"}
        variant={action.action === "return_with_issues" ? "primary" : "secondary"}
        onClick={(event) => {
          event.stopPropagation();
          onOpen(submission);
        }}
      >
        {cardLabel}
      </Button>
    </div>
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
  const steps = agentNextSteps(activeSubmission);

  return (
    <CardComponent
      as="aside"
      className="right-rail"
      aria-label="Контекст выбранной подачи"
    >
      {summaryChips ? (
        <CardComponent as="section" className="rail-panel rail-summary">
          <p className="kicker">Сводка подач</p>
          <SummaryRow chips={summaryChips} />
        </CardComponent>
      ) : null}
      <CardComponent
        as="section"
        className={`rail-panel selected-context tone-${statusTone[activeSubmission.status]}`}
      >
        <p className="kicker">Выбранная подача</p>
        <h2>{activeSubmission.title}</h2>
        <StatusChip submission={activeSubmission} />
        <dl>
          <div>
            <dt>Проблема</dt>
            <dd>{nextProblem(activeSubmission)}</dd>
          </div>
          <div>
            <dt>Кто отвечает</dt>
            <dd>{responsibleRole(activeSubmission)}</dd>
          </div>
          <div>
            <dt>Основное действие</dt>
            <dd>{getCardActionLabel(activeSubmission, "agent")}</dd>
          </div>
        </dl>
        <Button wide onClick={() => onOpen(activeSubmission)}>
          {getCardActionLabel(activeSubmission, "agent")}
        </Button>
      </CardComponent>
      <CardComponent as="section" className="rail-panel">
        <p className="kicker">Следующие действия</p>
        <ul className="next-list">
          {steps.map((step, index) => (
            <li key={step}>
              <span>{index + 1}</span>
              <p>{step}</p>
            </li>
          ))}
        </ul>
      </CardComponent>
    </CardComponent>
  );
}

function cardIssueLines(submission: Submission) {
  return submission.issues
    .filter((issue) => issue.status !== "closed_by_admin")
    .sort((left, right) => issueRank(left) - issueRank(right))
    .slice(0, 2)
    .map((issue) => ({
      id: issue.id,
      severity: issue.severity,
      target: issueTarget(issue),
      text:
        issue.status === "fixed_by_manager"
          ? `${issue.reason}: исправлено агентом`
          : issue.reason,
    }));
}

function issueRank(issue: Issue) {
  if (issue.severity === "blocker") return 0;
  if (issue.severity === "warning") return 1;
  return 2;
}

function issueTarget(issue: Issue) {
  const parts = [
    issue.target.applicantName,
    issue.target.field,
    issue.target.fileType
      ? fileTypeLabels[issue.target.fileType]
      : issue.target.section,
  ];

  return parts.filter(Boolean).join(" · ");
}

function fileSlotSummary(submission: Submission) {
  return {
    ready: submission.files.filter(
      (file) => file.status !== "missing" && file.status !== "needs_replacement",
    ).length,
    total: submission.files.length,
  };
}

function cardNextActionLine(submission: Submission, role: Role) {
  const hasOpenIssue = submission.issues.some((issue) => issue.status === "open");
  const hasFixedIssue = submission.issues.some(
    (issue) => issue.status === "fixed_by_manager",
  );
  const fileSlots = fileSlotSummary(submission);

  if (role === "admin") {
    if (submission.status === "submitted_for_review")
      return hasOpenIssue ? "Вернуть с точным замечанием" : "Проверить и принять";
    if (submission.status === "corrections_received")
      return "Проверить исправления агента";
    if (submission.status === "ready_for_export") return "Перейти к выгрузке";
    if (submission.status === "exported") return "Открыть историю";
  }

  if (hasOpenIssue) return "Открыть замечания и исправить целевые пункты";
  if (hasFixedIssue) return "Ждать закрытия администратором";
  if (submission.completeness.questionnaire < 100) return "Дозаполнить анкету";
  if (fileSlots.ready < fileSlots.total) return "Дозагрузить обязательные файлы";
  if (submission.status === "submitted_for_review") return "Ждать внутренней проверки";
  if (submission.status === "ready_for_export") return "Подача готова к выгрузке";
  if (submission.status === "exported") return "Открыть историю";

  return "Продолжить подготовку подачи";
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
