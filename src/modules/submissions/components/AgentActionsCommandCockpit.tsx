import { ChevronDown } from "lucide-react";

import { Badge, Button } from "../../../shared/ui/primitives";
import { cn } from "../../../shared/ui/cn";
import { OperationalTableHeader } from "../../../shared/ui/OperationalTableHeader";
import {
  V19SignalButton,
  type V19SignalButtonTone,
} from "../../../shared/ui/v19-design-system";
import type {
  AgentActionTask,
  AgentActionTaskReadiness,
  AgentActionTaskSummary,
  AgentActionTaskStatus,
} from "../agentActions";
import { formatSubmissionListTitle } from "../listFormatters";
import { submissionPublicId } from "../submissionIdentity";
import { applicantCountLabel, tripDates } from "../selectors";
import type { DrawerTab, Issue } from "../types";
import { CaseCopilotBriefCard } from "./CaseCopilotBriefCard";
import { WorkspaceIntelligencePulse } from "./WorkspaceIntelligencePulse";
import { agentInteractionProps } from "../agentInteractionContract";

type EmptyState = {
  action: string;
  body: string;
  title: string;
};

type DesktopContextMode = "inline" | "rail";

export type AgentActionsSummaryFilter =
  | "done"
  | "in_correction"
  | "in_review"
  | "in_work";

type AgentActionsCommandCockpitProps = {
  actionGroupLabel: string;
  activeSummaryFilter?: AgentActionsSummaryFilter | null;
  desktopContextMode?: DesktopContextMode;
  emptyState: EmptyState;
  errorMessage?: string;
  loading?: boolean;
  selectedTask?: AgentActionTask;
  showSummary?: boolean;
  summary: AgentActionTaskSummary;
  summaryTasks?: AgentActionTask[];
  tasks: AgentActionTask[];
  onEmptyAction: () => void;
  onOpenIssue: (task: AgentActionTask, issue: Issue) => void;
  onOpenPrimary: (task: AgentActionTask) => void;
  onOpenSecondary: (task: AgentActionTask) => void;
  onOpenTab: (task: AgentActionTask, tab: DrawerTab) => void;
  onSelectTask: (task: AgentActionTask) => void;
  onSummaryFilterChange?: (filter: AgentActionsSummaryFilter) => void;
};

export function AgentActionsCommandCockpit({
  actionGroupLabel,
  activeSummaryFilter = null,
  desktopContextMode = "rail",
  emptyState,
  errorMessage = "",
  loading = false,
  selectedTask,
  showSummary = true,
  summary,
  summaryTasks,
  tasks,
  onEmptyAction,
  onOpenIssue,
  onOpenPrimary,
  onOpenSecondary,
  onOpenTab,
  onSelectTask,
  onSummaryFilterChange,
}: AgentActionsCommandCockpitProps) {
  function openMobileDrawer(task: AgentActionTask) {
    onSelectTask(task);
    onOpenSecondary(task);
  }

  if (errorMessage) {
    return (
      <div className="v19-actions-cockpit-empty" data-testid="agent-actions-cockpit">
        <div className="v19-empty-state is-error" role="alert">
          <h3>Не удалось загрузить действия.</h3>
          <p>{errorMessage}</p>
          <Button
            {...agentInteractionProps("actions.retry")}
            variant="secondary"
            onClick={onEmptyAction}
          >
            Повторить
          </Button>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div
        className="v19-actions-cockpit is-loading"
        data-testid="agent-actions-cockpit"
        aria-busy="true"
        aria-label="Загрузка действий"
      >
        {showSummary ? (
          <CockpitSummary
            activeFilter={activeSummaryFilter}
            summary={summary}
            tasks={summaryTasks ?? tasks}
            onFilterChange={onSummaryFilterChange}
          />
        ) : null}
        <div className="v19-actions-loading-grid">
          {["loading-1", "loading-2", "loading-3"].map((item) => (
            <div className="v19-actions-loading-card" key={item} />
          ))}
        </div>
      </div>
    );
  }

  if (!tasks.length) {
    return (
      <div className="v19-actions-cockpit-empty" data-testid="agent-actions-cockpit">
        <div className="v19-empty-state" role="status">
          <h3>{emptyState.title}</h3>
          <p>{emptyState.body}</p>
          <Button
            {...agentInteractionProps(
              emptyState.action === "Новая подача"
                ? "shell.create-submission"
                : "actions.reset-filters",
            )}
            variant="secondary"
            onClick={onEmptyAction}
          >
            {emptyState.action}
          </Button>
        </div>
      </div>
    );
  }

  const activeTask = selectedTask ?? tasks[0];
  const usesInlineContext = desktopContextMode === "inline";
  const intelligenceTasks = summaryTasks ?? tasks;
  const intelligenceSubmissions = Array.from(
    new Map(
      intelligenceTasks.map((task) => [task.submission.id, task.submission] as const),
    ).values(),
  );

  return (
    <div
      className="v19-actions-cockpit"
      data-testid="agent-actions-cockpit"
      aria-label="Очередь действий агента"
    >
      {showSummary ? (
        <CockpitSummary
          activeFilter={activeSummaryFilter}
          summary={summary}
          tasks={summaryTasks ?? tasks}
          onFilterChange={onSummaryFilterChange}
        />
      ) : null}

      {showSummary ? (
        <WorkspaceIntelligencePulse
          role="agent"
          submissions={intelligenceSubmissions}
          onOpenSubmission={(submissionId) => {
            const target = intelligenceTasks.find(
              (task) => task.submission.id === submissionId,
            );
            if (target) onSelectTask(target);
          }}
        />
      ) : null}

      <div
        className={cn(
          "v19-actions-desktop-grid",
          usesInlineContext && "is-inline-context",
        )}
      >
        <section
          className="v19-actions-queue-panel"
          aria-label="Очередь действий"
          data-testid="agent-action-queue"
        >
          <PanelEyebrow label="Очередь" />
          <OperationalTableHeader
            className="v19-actions-table-head"
            columns={
              usesInlineContext
                ? [
                    { key: "rank", label: "№" },
                    { key: "priority", label: "Приоритет" },
                    { key: "submission", label: "ID" },
                    { key: "task", label: "Заявитель / задача" },
                    { key: "city", label: "Город" },
                    { key: "dates", label: "Даты поездки" },
                    { key: "status", label: "Статус" },
                  ]
                : [
                    { key: "submission", label: "Подача" },
                    { key: "task", label: "Заявитель / задача" },
                    { key: "dates", label: "Даты поездки" },
                    { key: "status", label: "Статус" },
                  ]
            }
          />
          <div className="v19-actions-queue-list">
            {tasks.map((task, index) => {
              const selected = activeTask.id === task.id;
              const rowId = `agent-action-row-${stableDomId(task.id)}`;
              const detailId = `agent-action-detail-${stableDomId(task.id)}`;

              return (
                <div
                  className={cn(
                    "v19-actions-queue-entry",
                    selected && "is-selected",
                  )}
                  data-agent-action-id={task.id}
                  key={task.id}
                >
                  <ActionTaskCard
                    detailId={usesInlineContext ? detailId : undefined}
                    inlineContext={usesInlineContext}
                    rank={index + 1}
                    rowId={rowId}
                    selected={selected}
                    task={task}
                    onSelect={() => onSelectTask(task)}
                  />
                  {usesInlineContext && selected ? (
                    <AgentActionInlineDetail
                      detailId={detailId}
                      rowId={rowId}
                      task={task}
                      onOpenPrimary={() => onOpenPrimary(task)}
                      onOpenSecondary={() => onOpenSecondary(task)}
                      onOpenTab={(tab) => onOpenTab(task, tab)}
                    />
                  ) : null}
                </div>
              );
            })}
          </div>
        </section>

        {desktopContextMode === "rail" ? (
          <AgentActionContextPanel
            task={activeTask}
            onOpenIssue={(issue) => onOpenIssue(activeTask, issue)}
            onOpenPrimary={() => onOpenPrimary(activeTask)}
            onOpenSecondary={() => onOpenSecondary(activeTask)}
            onOpenTab={(tab) => onOpenTab(activeTask, tab)}
          />
        ) : null}
      </div>

      <section
        className="v19-actions-mobile-stage"
        aria-label="Лента действий"
        data-testid="agent-action-timeline"
      >
        <PanelHeader label="Лента" title={actionGroupLabel} />
        <div className="v19-actions-timeline">
          {tasks.map((task) => (
            <TimelineEvent
              key={task.id}
              selected={activeTask.id === task.id}
              task={task}
              onSelect={() => openMobileDrawer(task)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function CockpitSummary({
  activeFilter,
  onFilterChange,
  tasks,
}: {
  activeFilter?: AgentActionsSummaryFilter | null;
  onFilterChange?: (filter: AgentActionsSummaryFilter) => void;
  summary: AgentActionTaskSummary;
  tasks: AgentActionTask[];
}) {
  const inWorkCount = tasks.filter((task) =>
    ["draft", "in_progress"].includes(task.submission.status),
  ).length;
  const inReviewCount = tasks.filter((task) =>
    ["corrections_received", "submitted_for_review"].includes(task.submission.status),
  ).length;
  const inCorrectionCount = tasks.filter((task) =>
    ["requires_action", "returned"].includes(task.submission.status),
  ).length;
  const doneCount = tasks.filter((task) =>
    ["exported", "ready_for_export"].includes(task.submission.status),
  ).length;

  return (
    <section className="v19-actions-cockpit-summary" aria-label="Операционное табло">
      <SummarySignal
        active={activeFilter === "in_work"}
        filter="in_work"
        label="В работе"
        note="Агент ещё заполняет подачу"
        tone="green"
        value={inWorkCount}
        valueLabel={`${inWorkCount} задач: агент ещё заполняет подачу`}
        onFilterChange={onFilterChange}
      />
      <SummarySignal
        active={activeFilter === "in_review"}
        filter="in_review"
        label="На проверке"
        note="Подача отправлена админу"
        tone="blue"
        value={inReviewCount}
        valueLabel={`${inReviewCount} задач: подача отправлена админу`}
        onFilterChange={onFilterChange}
      />
      <SummarySignal
        active={activeFilter === "in_correction"}
        filter="in_correction"
        label="На исправлении"
        note="Админ вернул замечания"
        tone="amber"
        value={inCorrectionCount}
        valueLabel={`${inCorrectionCount} задач: админ вернул замечания`}
        onFilterChange={onFilterChange}
      />
      <SummarySignal
        active={activeFilter === "done"}
        filter="done"
        label="Готово"
        note="Подача принята / выгружена"
        tone="black"
        value={doneCount}
        valueLabel={`${doneCount} задач: подача принята или выгружена`}
        onFilterChange={onFilterChange}
      />
    </section>
  );
}

function SummarySignal({
  active,
  filter,
  label,
  note,
  onFilterChange,
  tone,
  value,
  valueLabel,
}: {
  active: boolean;
  filter: AgentActionsSummaryFilter;
  label: string;
  note: string;
  onFilterChange?: (filter: AgentActionsSummaryFilter) => void;
  tone: V19SignalButtonTone;
  value: number;
  valueLabel: string;
}) {
  return (
    <V19SignalButton
      {...agentInteractionProps("actions.summary-filter")}
      active={active}
      ariaLabel={`Фильтр: ${label}. ${valueLabel}. ${note}`}
      className="v19-actions-summary-signal"
      label={label}
      note={note}
      tone={tone}
      value={value}
      onClick={() => onFilterChange?.(filter)}
    />
  );
}

function PanelHeader({ label, title }: { label: string; title: string }) {
  return (
    <div className="v19-actions-panel-header">
      <p>{label}</p>
      <h3>{title}</h3>
    </div>
  );
}

function PanelEyebrow({ label }: { label: string }) {
  return (
    <div className="v19-actions-panel-header">
      <p>{label}</p>
    </div>
  );
}

function ActionTaskCard({
  detailId,
  inlineContext,
  rank,
  rowId,
  selected,
  task,
  onSelect,
}: {
  detailId?: string;
  inlineContext: boolean;
  rank: number;
  rowId: string;
  selected: boolean;
  task: AgentActionTask;
  onSelect: () => void;
}) {
  const dateLabel = tripDates(task.submission);

  return (
    <button
      {...agentInteractionProps("actions.select-task")}
      className={cn(
        "v19-actions-queue-item",
        "v19-actions-table-row",
        inlineContext && "is-inline-context",
        `status-${task.status}`,
        selected && "is-selected",
      )}
      aria-controls={inlineContext ? detailId : undefined}
      aria-current={selected ? "true" : undefined}
      aria-expanded={inlineContext ? selected : undefined}
      aria-label={`Выбрать действие: ${task.statusLabel}. ${task.title}. ${queueSubjectText(task)}. ${task.problem}. Следующее действие: ${task.nextAction.label}${task.priority.reason ? `. ${task.priority.label}: ${task.priority.reason}` : ""}`}
      data-action-status={task.status}
      data-agent-action-id={task.id}
      data-submission-id={task.submission.id}
      data-testid="agent-action-queue-item"
      id={rowId}
      type="button"
      onClick={onSelect}
    >
      <span className="v19-actions-queue-strip" aria-hidden="true" />

      {inlineContext ? (
        <>
          <span className="v19-actions-table-rank">{rank}</span>
          <span
            className={`v19-actions-table-priority priority-${task.priority.level}`}
          >
            <span aria-hidden="true" />
            <strong>{priorityDisplayLabel(task)}</strong>
          </span>
          <span className="v19-actions-table-submission">
            <strong>{submissionPublicId(task.submission)}</strong>
          </span>
          <span className="v19-actions-table-task">
            <strong>
              {task.applicantName || formatSubmissionListTitle(task.submission)}
            </strong>
            <small>{task.problem}</small>
          </span>
          <span className="v19-actions-table-city">
            {safeCity(task.submission.city)}
          </span>
          <span className="v19-actions-table-dates">{dateLabel}</span>
          <span className="v19-actions-table-status">
            <StatusBadge status={task.status} label={task.statusLabel} />
            <small>{task.nextAction.label}</small>
          </span>
          <ChevronDown
            aria-hidden="true"
            className="v19-actions-table-chevron"
          />
        </>
      ) : (
        <>
          <span className="v19-actions-table-submission">
            <span>
              <strong>{submissionPublicId(task.submission)}</strong>
              <small>{safeCity(task.submission.city)}</small>
            </span>
          </span>
          <span className="v19-actions-table-task">
            <strong>
              {task.applicantName || formatSubmissionListTitle(task.submission)}
            </strong>
            <small>{task.problem}</small>
          </span>
          <span className="v19-actions-table-dates">{dateLabel}</span>
          <span className="v19-actions-table-status">
            <StatusBadge status={task.status} label={task.statusLabel} />
            <small>{task.nextAction.label}</small>
          </span>
        </>
      )}
    </button>
  );
}

function AgentActionInlineDetail({
  detailId,
  rowId,
  task,
  onOpenPrimary,
  onOpenSecondary,
  onOpenTab,
}: {
  detailId: string;
  rowId: string;
  task: AgentActionTask;
  onOpenPrimary: () => void;
  onOpenSecondary: () => void;
  onOpenTab: (tab: DrawerTab) => void;
}) {
  const disabledReason = primaryActionDisabledReason(task);
  const disabledReasonId = `${stableDomId(task.id)}-inline-primary-disabled-reason`;

  return (
    <section
      aria-labelledby={rowId}
      className="v19-actions-inline-detail"
      data-action-status={task.status}
      data-agent-action-id={task.id}
      data-testid="agent-action-inline-detail"
      id={detailId}
      role="region"
    >
      <div className="v19-actions-inline-why">
        <p>Почему сейчас</p>
        <strong>{task.problem}</strong>
        <span>{task.reason}</span>
      </div>

      <div className="v19-actions-inline-readiness">
        <div className="v19-actions-inline-readiness-head">
          <p>Готовность подачи</p>
          <strong>{task.readiness.overallPercent}%</strong>
        </div>
        <progress max={100} value={task.readiness.overallPercent} />
        <ReadinessGrid readiness={task.readiness} onOpenTab={onOpenTab} />
      </div>

      <div className="v19-actions-inline-next">
        <p>Следующее действие</p>
        <strong>{task.nextAction.label}</strong>
        <span>{task.nextAction.detail}</span>
        {disabledReason ? (
          <small className="v19-actions-disabled-reason" id={disabledReasonId}>
            {disabledReason}
          </small>
        ) : null}
        <div className="v19-actions-inline-actions">
          <Button
            {...agentInteractionProps("actions.open-primary")}
            aria-describedby={disabledReason ? disabledReasonId : undefined}
            disabled={Boolean(disabledReason)}
            title={disabledReason || undefined}
            variant="primary"
            onClick={onOpenPrimary}
          >
            {task.nextAction.primaryLabel}
          </Button>
          <Button
            {...agentInteractionProps("actions.open-secondary")}
            variant="secondary"
            onClick={onOpenSecondary}
          >
            {task.secondaryAction.label}
          </Button>
        </div>
      </div>
    </section>
  );
}

export function AgentActionContextPanel({
  task,
  onOpenIssue,
  onOpenPrimary,
  onOpenSecondary,
  onOpenTab,
}: {
  task: AgentActionTask;
  onOpenIssue: (issue: Issue) => void;
  onOpenPrimary: () => void;
  onOpenSecondary: () => void;
  onOpenTab: (tab: DrawerTab) => void;
}) {
  const openIssues = task.submission.issues.filter((issue) => issue.status === "open");
  const disabledReason = primaryActionDisabledReason(task);
  const disabledReasonId = `${stableDomId(task.id)}-primary-disabled-reason`;
  const publicId = submissionPublicId(task.submission);

  return (
    <section
      className="v19-actions-active-panel v19-actions-summary-panel"
      aria-label="Краткая сводка выбранной задачи"
      data-testid="agent-action-active-panel"
    >
      <div className="v19-actions-active-head">
        <div>
          <p>
            {publicId} · {safeCity(task.submission.city)}
          </p>
          <h3>{formatSubmissionListTitle(task.submission)}</h3>
        </div>
        <StatusBadge status={task.status} label={task.statusLabel} />
      </div>

      <CaseCopilotBriefCard
        compact
        role="agent"
        submission={task.submission}
        surface="agent"
      />

      <div
        className="v19-actions-context-progress"
        aria-label={`Готовность подачи ${task.readiness.overallPercent}%`}
      >
        <span>
          <small>Готовность подачи</small>
          <strong>{task.readiness.overallPercent}%</strong>
        </span>
        <progress max={100} value={task.readiness.overallPercent} />
      </div>

      <div className="v19-actions-task-problem" aria-label="Следующее действие">
        <p>Следующее действие</p>
        <strong>{task.nextAction.label}</strong>
        <span>{task.nextAction.detail}</span>
      </div>

      <div className="v19-actions-next-copy" aria-label="Причина действия">
        <p>Почему сейчас</p>
        <strong>{task.problem}</strong>
        <span>{task.reason}</span>
      </div>

      <div className="v19-actions-work-structure" aria-label="Что в работе">
        <p>Что в работе</p>
        <ReadinessGrid readiness={task.readiness} onOpenTab={onOpenTab} />
      </div>

      {openIssues.length ? (
        <div className="v19-actions-blockers" aria-label="Ключевые замечания">
          <div className="v19-actions-blockers-head">
            <p>Ключевые замечания</p>
            <Badge tone="danger">{openIssues.length}</Badge>
          </div>
          <div className="v19-actions-blocker-list">
            {openIssues.slice(0, 2).map((issue) => (
              <button
                {...agentInteractionProps("actions.open-issue")}
                key={issue.id}
                type="button"
                onClick={() => onOpenIssue(issue)}
              >
                <span
                  className="v19-actions-status-node status-error"
                  aria-hidden="true"
                />
                <span>
                  <strong>{issue.reason}</strong>
                  <small>{issue.target.applicantName}</small>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div className="v19-actions-active-meta" aria-label="Информация по подаче">
        <MetaItem label="ФИО" value={task.applicantName} />
        <MetaItem label="ID" value={submissionPublicId(task.submission)} />
        <MetaItem breakAfterSeparator label="Направление" value={task.destination} />
        <MetaItem label="Даты поездки" value={tripDates(task.submission)} />
        <MetaItem
          label="Заявители"
          value={applicantCountLabel(task.submission.applicants.length)}
        />
      </div>

      <div className="v19-actions-detail-footer">
        {disabledReason ? (
          <p className="v19-actions-disabled-reason" id={disabledReasonId}>
            {disabledReason}
          </p>
        ) : null}
        <div className="v19-actions-summary-cta">
          <Button
            {...agentInteractionProps("actions.open-primary")}
            aria-describedby={disabledReason ? disabledReasonId : undefined}
            disabled={Boolean(disabledReason)}
            title={disabledReason || undefined}
            variant="primary"
            wide
            onClick={onOpenPrimary}
          >
            {task.nextAction.primaryLabel}
          </Button>
          <Button
            {...agentInteractionProps("actions.open-secondary")}
            variant="secondary"
            wide
            onClick={onOpenSecondary}
          >
            {task.secondaryAction.label}
          </Button>
        </div>
      </div>
    </section>
  );
}

function MetaItem({
  breakAfterSeparator = false,
  label,
  value,
}: {
  breakAfterSeparator?: boolean;
  label: string;
  value: string;
}) {
  const [leadingValue, ...trailingValue] = value.split(" · ");
  const shouldBreak = breakAfterSeparator && trailingValue.length > 0;

  return (
    <span>
      <small>{label}</small>
      <strong>
        {shouldBreak ? (
          <>
            {leadingValue} ·<br />
            {trailingValue.join(" · ")}
          </>
        ) : (
          value
        )}
      </strong>
    </span>
  );
}

function StatusBadge({
  label,
  status,
}: {
  label: string;
  status: AgentActionTaskStatus;
}) {
  return (
    <Badge
      aria-label={`Статус действия: ${label}`}
      className="v19-actions-status-badge"
      tone={statusTone(status)}
    >
      {label}
    </Badge>
  );
}

function ReadinessGrid({
  readiness,
  onOpenTab,
}: {
  readiness: AgentActionTaskReadiness;
  onOpenTab: (tab: DrawerTab) => void;
}) {
  return (
    <div className="v19-actions-readiness" aria-label="Готовность по зонам">
      <ReadinessLine
        label={readiness.form.label}
        state={readiness.form.state}
        tab="questionnaire"
        onOpen={onOpenTab}
      />
      <ReadinessLine
        label={readiness.files.label}
        state={readiness.files.state}
        tab="files"
        onOpen={onOpenTab}
      />
      <ReadinessLine
        label={readiness.review.label}
        state={readiness.review.state}
        tab="history"
        onOpen={onOpenTab}
      />
      <ReadinessLine
        label={`Итог: ${readiness.overallPercent}%`}
        state={readiness.finalResult.state}
        tab="overview"
        onOpen={onOpenTab}
      />
    </div>
  );
}

function ReadinessLine({
  label,
  state,
  tab,
  onOpen,
}: {
  label: string;
  state:
    | AgentActionTaskReadiness["files"]["state"]
    | AgentActionTaskReadiness["finalResult"]["state"]
    | AgentActionTaskReadiness["form"]["state"]
    | AgentActionTaskReadiness["review"]["state"];
  tab: DrawerTab;
  onOpen: (tab: DrawerTab) => void;
}) {
  return (
    <button
      {...agentInteractionProps("actions.open-tab")}
      className={cn("v19-actions-readiness-line", `state-${state}`)}
      type="button"
      onClick={() => onOpen(tab)}
    >
      <span>
        <strong>{label}</strong>
      </span>
    </button>
  );
}

function TimelineEvent({
  selected,
  task,
  onSelect,
}: {
  selected: boolean;
  task: AgentActionTask;
  onSelect: () => void;
}) {
  const submissionId = submissionPublicId(task.submission);
  const dateLabel = tripDates(task.submission);

  return (
    <article
      className={cn(
        "v19-actions-timeline-event",
        `status-${task.status}`,
        selected && "is-selected",
      )}
      data-action-status={task.status}
      data-submission-id={task.submission.id}
    >
      <span className="v19-actions-timeline-node" aria-hidden="true" />
      <button
        {...agentInteractionProps("actions.select-task")}
        className="v19-actions-timeline-hit"
        aria-label={`Открыть действие: ${task.statusLabel}. ${formatSubmissionListTitle(task.submission)}. ${task.problem}`}
        type="button"
        onClick={onSelect}
      >
        <span className="v19-actions-mobile-cell-top">
          <small>{submissionId}</small>
          <span className="v19-actions-mobile-cell-signals">
            <span
              className={`v19-actions-mobile-priority priority-${task.priority.level}`}
            >
              <span aria-hidden="true" />
              {priorityDisplayLabel(task)}
            </span>
            <span className="v19-actions-mobile-status">{task.statusLabel}</span>
          </span>
        </span>
        <strong className="v19-actions-mobile-cell-title">
          {formatSubmissionListTitle(task.submission)}
        </strong>
        <span className="v19-actions-mobile-cell-route">
          <span>{safeCity(task.submission.city)}</span>
          <i aria-hidden="true" />
          <span>{dateLabel}</span>
        </span>
        <span className="v19-actions-mobile-cell-reason">{task.problem}</span>
      </button>
    </article>
  );
}

function statusTone(
  status: AgentActionTaskStatus,
): "amber" | "blue" | "danger" | "muted" | "teal" {
  if (status === "error") return "danger";
  if (status === "action_required") return "amber";
  if (status === "ready") return "teal";
  if (status === "blocked") return "muted";
  return "blue";
}

function queueSubjectText(task: AgentActionTask) {
  return task.problemScope === "applicant" ? task.applicantName : "Вся подача";
}

function primaryActionDisabledReason(task: AgentActionTask) {
  if (task.status === "blocked") {
    return "Действие недоступно: агент ждёт внешнее событие.";
  }

  return "";
}

function safeCity(city: string) {
  return city.trim() || "Город не указан";
}

function priorityDisplayLabel(task: AgentActionTask) {
  if (task.priority.label.trim()) {
    return task.priority.label;
  }

  if (task.priority.level === "urgent") {
    return "Срочно";
  }

  if (task.priority.level === "high") {
    return "Высокий";
  }

  if (task.priority.level === "medium") {
    return "Средний";
  }

  return "Низкий";
}

function stableDomId(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, "-");
}
