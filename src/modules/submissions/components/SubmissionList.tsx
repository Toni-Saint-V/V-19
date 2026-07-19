import { type KeyboardEvent, useRef } from "react";
import { Badge, Button, CardComponent } from "../../../shared/ui/primitives";
import {
  blockerCount,
  fileTypeLabels,
  getCardActionLabel,
  openIssueCount,
  statusTone,
  typeLabels,
} from "../status";
import { applicantCountLabel, tripDates } from "../selectors";
import { submissionPublicId } from "../submissionIdentity";
import type { DrawerTab, Issue, Role, Submission } from "../types";
import { EmptyState, StatusChip } from "./Primitives";
import { ProgressMeter } from "./CollectionPrimitives";

export function SubmissionList({
  activeSubmission,
  empty,
  onOpen,
  onSelect,
  role,
  submissions,
}: {
  activeSubmission: Submission | null;
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
          active={submission.id === activeSubmission?.id}
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
  const openIssues = openIssueCount(submission);
  const fileSlots = fileSlotSummary(submission);
  const issueLines = cardIssueLines(submission);
  const familyFact =
    submission.type === "family"
      ? `${typeLabels[submission.type]} · ${applicantCountLabel(submission.applicants.length)}`
      : typeLabels[submission.type];
  const cardSide = (
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
      aria-label={`Выбрать подачу ${submissionPublicId(submission)}: ${submission.title}`}
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
            <strong>{submissionPublicId(submission)}</strong>
            <StatusChip submission={submission} />
            {blockers > 0 ? (
              <Badge className="blocker-count">{blockers} блокера</Badge>
            ) : null}
          </div>
          <h3>{submission.title}</h3>
          <p className="meta-line">
            {submission.city} · Туризм C · {familyFact} · {tripDates(submission)}
          </p>
        </div>
        <div className="card-summary">
          <div className="card-facts" aria-label="Операционная сводка">
            <span className={submission.type === "family" ? "family-fact" : ""}>
              {applicantCountLabel(submission.applicants.length)}
            </span>
            <span>Анкета {submission.completeness.questionnaire}%</span>
            <span>
              Файлы {fileSlots.ready}/{fileSlots.total}
            </span>
            <span>Дата {submission.updatedAt}</span>
          </div>
        </div>
        {issueLines.length ? (
          <p className={`card-issue-summary is-${issueLines[0].severity}`}>
            <strong>
              {issueLines[0].target}
            </strong>
            <span>{issueLines[0].text}</span>
            {issueLines.length > 1 ? <em>+{issueLines.length - 1}</em> : null}
          </p>
        ) : openIssues > 0 ? (
          <p className="card-action-summary">
            Нужно исправить: <strong>{issueCountLabel(openIssues)}</strong>
          </p>
        ) : null}
        <div className={`problem-line ${blockers > 0 ? "is-danger" : ""}`}>
          <span aria-hidden="true">{blockers > 0 ? "!" : "→"}</span>
          <p>
            <strong>{role === "admin" ? "Проверка:" : "Дальше:"}</strong>{" "}
            {cardNextActionLine(submission, role)}
          </p>
        </div>
        <div className="progress-strip">
          <div className="row-progress-metrics">
            <ProgressMeter
              className="progress-line"
              label="Готовность анкеты"
              value={submission.completeness.questionnaire}
            />
            <ProgressMeter
              className="progress-line is-files"
              label="Готовность файлов"
              tone="warning"
              value={submission.completeness.files}
            />
          </div>
          <span className="progress-value">
            <em>Анкета</em>
            <strong>{submission.completeness.questionnaire}%</strong>
            <em>Файлы</em>
            <strong>{submission.completeness.files}%</strong>
          </span>
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
  const detailLabel =
    submission.status === "requires_action" || submission.status === "returned"
      ? "Исправить замечания"
      : getCardActionLabel(submission, role);

  return (
    <div className="card-side is-action-only">
      <Button
        className="card-detail-button"
        variant="primary"
        onClick={(event) => {
          event.stopPropagation();
          onOpen(submission);
        }}
      >
        {detailLabel}
      </Button>
    </div>
  );
}

function cardIssueLines(submission: Submission) {
  return submission.issues
    .filter((issue) => issue.status !== "closed_by_admin")
    .sort((left, right) => issueRank(left) - issueRank(right))
    .slice(0, 2)
    .map((issue) => ({
      id: issue.id,
      applicantName: issue.target.applicantName,
      severity: issue.severity,
      target: issueTarget(issue),
      shortTarget: issueShortTarget(issue),
      text:
        issue.status === "fixed_by_agent"
          ? `${issue.reason}: исправлено агентом`
          : issue.reason,
      shortText:
        issue.status === "fixed_by_agent"
          ? `${issueShortText(issue)}: исправлено агентом`
          : issueShortText(issue),
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

function issueShortTarget(issue: Issue) {
  return issue.target.fileType
    ? fileTypeLabels[issue.target.fileType]
    : issue.target.field || issue.target.section || "Замечание";
}

function issueShortText(issue: Issue) {
  const target = issueShortTarget(issue).trim();
  const reason = issue.reason.trim();
  const normalizedReason = reason.toLocaleLowerCase("ru-RU");
  const normalizedTarget = target.toLocaleLowerCase("ru-RU");

  if (
    issue.target.fileType === "photo" &&
    normalizedReason.includes("не подходит")
  ) {
    return "Архивный файл не используется в V-19";
  }

  if (normalizedReason.startsWith(`${normalizedTarget} `)) {
    return reason.slice(target.length).trim();
  }

  return reason;
}

function issueCountLabel(count: number) {
  if (count === 1) return "1 замечание";
  if (count > 1 && count < 5) return `${count} замечания`;
  return `${count} замечаний`;
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
    (issue) => issue.status === "fixed_by_agent",
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
