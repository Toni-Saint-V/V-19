import { type KeyboardEvent, useRef } from "react";
import { Badge, Button, CardComponent } from "../../../shared/ui/primitives";
import {
  blockerCount,
  fileTypeLabels,
  getCardActionLabel,
  nextProblem,
  openIssueCount,
  responsibleRole,
  statusTone,
  typeLabels,
} from "../status";
import { applicantCountLabel, tripDates } from "../selectors";
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
  const openIssues = openIssueCount(submission);
  const issueLines = cardIssueLines(submission);
  const fileSlots = fileSlotSummary(submission);
  const submissionTypeFact =
    submission.type === "family" ? typeLabels[submission.type] : null;
  const compactAgentCard = role === "agent";
  const cardTitle =
    compactAgentCard && submission.type === "family" && issueLines[0]?.applicantName
      ? issueLines[0].applicantName
      : submission.title;
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
            {compactAgentCard && submissionTypeFact ? (
              <Badge className="family-fact">{submissionTypeFact}</Badge>
            ) : null}
          </div>
          <h3>{cardTitle}</h3>
          {compactAgentCard ? null : (
            <p className="meta-line">
              Испания · {submission.city} · {tripDates(submission)}
            </p>
          )}
        </div>
        <div className="card-summary">
          <div className="card-facts" aria-label="Операционная сводка">
            {!compactAgentCard && submissionTypeFact ? (
              <span className="family-fact">{submissionTypeFact}</span>
            ) : null}
            {compactAgentCard ? null : (
              <>
                <span>{applicantCountLabel(submission.applicants.length)}</span>
                <span>Анкета {submission.completeness.questionnaire}%</span>
                <span>
                  Файлы {fileSlots.ready}/{fileSlots.total}
                </span>
              </>
            )}
          </div>
        </div>
        {compactAgentCard && openIssues > 0 ? (
          <p className="card-action-summary">
            Нужно исправить: <strong>{issueCountLabel(openIssues)}</strong>
          </p>
        ) : issueLines.length ? (
          <p className={`card-issue-summary is-${issueLines[0].severity}`}>
            <strong>
              {issueLines[0].target}
            </strong>
            <span>{issueLines[0].text}</span>
            {issueLines.length > 1 ? <em>+{issueLines.length - 1}</em> : null}
          </p>
        ) : null}
        {!compactAgentCard || !issueLines.length ? (
          <div className={`problem-line ${blockers > 0 ? "is-danger" : ""}`}>
            <span aria-hidden="true">{blockers > 0 ? "!" : "→"}</span>
            <p>
              <strong>{role === "admin" ? "Проверка:" : "Дальше:"}</strong>{" "}
              {cardNextActionLine(submission, role)}
            </p>
          </div>
        ) : null}
        <div className="progress-strip">
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
          <span className="progress-value">
            <em>Заполнено</em>
            <strong>{submission.completeness.total}%</strong>
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
  const hasProblemAction =
    ["requires_action", "returned"].includes(activeSubmission.status) ||
    blockerCount(activeSubmission) > 0;
  const selectedActionLabel = hasProblemAction
    ? "Исправить замечания"
    : getCardActionLabel(activeSubmission, "agent");
  const selectedBlockers = activeSubmission.issues
    .filter((issue) => issue.status === "open" && issue.severity === "blocker")
    .slice(0, 2);
  const selectedIssueApplicant = activeSubmission.issues.find(
    (issue) => issue.status === "open" && issue.target.applicantName,
  )?.target.applicantName;

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
        <div className="selected-context-head">
          <div>
            <p className="kicker">Выбранная подача</p>
            <h2>{activeSubmission.title}</h2>
            <span>{activeSubmission.id}</span>
            {activeSubmission.type === "family" && selectedIssueApplicant ? (
              <span className="selected-context-applicant">
                Заявитель с замечанием: {selectedIssueApplicant}
              </span>
            ) : null}
          </div>
          <StatusChip submission={activeSubmission} />
        </div>
        <div className="selected-context-body">
          <div className="selected-context-problem">
            <p>Проблема</p>
            <strong className="selected-context-problem-title">
              {nextProblem(activeSubmission)}
            </strong>
            {selectedBlockers.length ? (
              <ul>
                {selectedBlockers.map((issue) => (
                  <li
                    aria-label={`${issueShortTarget(issue)}: ${issueShortText(issue)}`}
                    key={issue.id}
                  >
                    <i aria-hidden="true" />
                    <span>
                      <strong>{issueShortTarget(issue)}</strong>{" "}
                      <small>{issueShortText(issue)}</small>
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
          <dl className="selected-context-meta">
            <div>
              <dt>Блокеры</dt>
              <dd>{blockerCount(activeSubmission)}</dd>
            </div>
            <div>
              <dt>Отвечает</dt>
              <dd>{responsibleRole(activeSubmission)}</dd>
            </div>
            <div>
              <dt>Действие</dt>
              <dd>{selectedActionLabel}</dd>
            </div>
          </dl>
        </div>
        <Button className="selected-context-action" wide onClick={() => onOpen(activeSubmission)}>
          {selectedActionLabel}
        </Button>
        {hasProblemAction ? (
          <p className="selected-context-next-step">
            Шаг 1: {nextAgentRepairStep(activeSubmission)}
          </p>
        ) : null}
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
      applicantName: issue.target.applicantName,
      severity: issue.severity,
      target: issueTarget(issue),
      shortTarget: issueShortTarget(issue),
      text:
        issue.status === "fixed_by_manager"
          ? `${issue.reason}: исправлено агентом`
          : issue.reason,
      shortText:
        issue.status === "fixed_by_manager"
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
    return "Нужно заменить фото для внутренней проверки";
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

function nextAgentRepairStep(submission: Submission) {
  const blockerTargets = submission.issues
    .filter((issue) => issue.status === "open" && issue.severity === "blocker")
    .map(issueShortTarget);

  if (blockerTargets.length) {
    return `заменить ${formatTargetList(blockerTargets).toLocaleLowerCase("ru-RU")}, затем отправить на проверку`;
  }

  return "закрыть открытые замечания и отправить подачу на проверку";
}

function formatTargetList(targets: string[]) {
  const uniqueTargets = [...new Set(targets)];
  if (uniqueTargets.length <= 1) return uniqueTargets[0] ?? "замечания";
  return `${uniqueTargets.slice(0, -1).join(", ")} и ${uniqueTargets.at(-1)}`;
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
