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

  const railTask = selectedTask ?? tasks[0];
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
                    { key: "id", label: "ID" },
                    { key: "applicant", label: "Имя, фамилия" },
                    { key: "dates", label: "Даты поездки" },
                    { key: "city", label: "Город" },
                    { key: "action", label: "Действие" },
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
            {tasks.map((task) => {
              const selected = selectedTask?.id === task.id;
              const rowId = `agent-action-row-${stableDomId(task.id)}`;
              const detailId = `agent-action-detail-${stableDomId(task.id)}`;

              return (
                <div
                  className={cn("v19-actions-queue-entry", selected && "is-selected")}
                  data-agent-action-id={task.id}
                  key={task.id}
                >
                  <ActionTaskCard
                    detailId={usesInlineContext ? detailId : undefined}
                    inlineContext={usesInlineContext}
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
            task={railTask}
            onOpenIssue={(issue) => onOpenIssue(railTask, issue)}
            onOpenPrimary={() => onOpenPrimary(railTask)}
            onOpenSecondary={() => onOpenSecondary(railTask)}
            onOpenTab={(tab) => onOpenTab(railTask, tab)}
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
              selected={selectedTask?.id === task.id}
              task={task}
              onOpenPrimary={() => onOpenPrimary(task)}
              onOpenSecondary={() => onOpenSecondary(task)}
              onOpenTab={(tab) => onOpenTab(task, tab)}
              onSelect={() => onSelectTask(task)}
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
  rowId,
  selected,
  task,
  onSelect,
}: {
  detailId?: string;
  inlineContext: boolean;
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
      aria-label={`Выбрать действие: ${task.statusLabel}. ${task.title}. ${queueSubjectText(task)}. ${task.problem}. Следующее действие: ${task.nextAction.label}. Даты поездки: ${dateLabel}${task.priority.reason ? `. ${task.priority.label}: ${task.priority.reason}` : ""}`}
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
          <span
            className="v19-actions-cell-id"
            title={submissionPublicId(task.submission)}
          >
            <strong>{submissionPublicId(task.submission)}</strong>
          </span>
          <span
            className="v19-actions-cell-applicant"
            title={task.applicantName || formatSubmissionListTitle(task.submission)}
          >
            <strong>
              {task.applicantName || formatSubmissionListTitle(task.submission)}
            </strong>
          </span>
          <span className="v19-actions-cell-dates" title={dateLabel}>
            {dateLabel}
          </span>
          <span
            className="v19-actions-cell-city"
            title={safeCity(task.submission.city)}
          >
            {safeCity(task.submission.city)}
          </span>
          <span className="v19-actions-cell-action">
            <Badge
              aria-label={`Действие: ${task.nextAction.label}`}
              className="v19-actions-action-tag"
              title={task.nextAction.label}
              tone={statusTone(task.status)}
            >
              {compactActionTagLabel(task)}
            </Badge>
          </span>
          <ChevronDown aria-hidden="true" className="v19-actions-table-chevron" />
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
  surface = "desktop",
  task,
  onOpenPrimary,
  onOpenSecondary,
  onOpenTab,
}: {
  detailId: string;
  rowId: string;
  surface?: "desktop" | "mobile";
  task: AgentActionTask;
  onOpenPrimary: () => void;
  onOpenSecondary: () => void;
  onOpenTab: (tab: DrawerTab) => void;
}) {
  const disabledReason = primaryActionDisabledReason(task);
  const disabledReasonId = `${stableDomId(task.id)}-${surface}-inline-primary-disabled-reason`;
  const whySummary = mobileWhySummary(task);

  return (
    <section
      aria-labelledby={rowId}
      className={cn(
        "v19-actions-inline-detail",
        surface === "mobile" && "v19-actions-mobile-detail",
      )}
      data-action-status={task.status}
      data-agent-action-id={task.id}
      data-testid={
        surface === "mobile"
          ? "agent-action-mobile-detail"
          : "agent-action-inline-detail"
      }
      id={detailId}
      role="region"
    >
      <div className="v19-actions-inline-why">
        <p>Почему сейчас</p>
        <strong>{task.problem}</strong>
        <span>{task.reason}</span>
        <div
          aria-label={`${task.problem}. ${task.reason}`}
          className="v19-actions-inline-why-compact"
        >
          <strong>{whySummary.label}</strong>
          <span>{whySummary.detail}</span>
        </div>
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
  onOpenPrimary,
  onOpenSecondary,
  onOpenTab,
  onSelect,
}: {
  selected: boolean;
  task: AgentActionTask;
  onOpenPrimary: () => void;
  onOpenSecondary: () => void;
  onOpenTab: (tab: DrawerTab) => void;
  onSelect: () => void;
}) {
  const submissionId = submissionPublicId(task.submission);
  const rowId = `agent-action-mobile-row-${stableDomId(task.id)}`;
  const detailId = `agent-action-mobile-detail-${stableDomId(task.id)}`;

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
        aria-controls={detailId}
        aria-expanded={selected}
        aria-label={`Выбрать действие: ${task.statusLabel}. ${task.title}. ${queueSubjectText(task)}. ${task.problem}. Следующее действие: ${task.nextAction.label}${task.priority.reason ? `. ${task.priority.label}: ${task.priority.reason}` : ""}`}
        id={rowId}
        type="button"
        onClick={onSelect}
      >
        <span className="v19-actions-mobile-identity">
          <small className="v19-actions-identity-id">{submissionId}</small>
          <strong>
            {task.applicantName || formatSubmissionListTitle(task.submission)}
          </strong>
        </span>
        <span className="v19-actions-mobile-next">
          <small>Следующий шаг</small>
          <strong>{task.nextAction.label}</strong>
        </span>
        <span className="v19-actions-mobile-status-row">
          <StatusBadge
            status={task.status}
            label={task.status === "error" ? "Нужны правки" : task.statusLabel}
          />
          <ChevronDown aria-hidden="true" className="v19-actions-table-chevron" />
        </span>
      </button>
      {selected ? (
        <AgentActionInlineDetail
          detailId={detailId}
          rowId={rowId}
          surface="mobile"
          task={task}
          onOpenPrimary={onOpenPrimary}
          onOpenSecondary={onOpenSecondary}
          onOpenTab={onOpenTab}
        />
      ) : null}
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

function mobileWhySummary(task: AgentActionTask) {
  const source = `${task.problem} ${task.reason}`.toLocaleLowerCase("ru-RU");
  const label = source.includes("анкет")
    ? "Анкета"
    : source.includes("паспорт")
      ? "Паспорт"
      : source.includes("селфи")
        ? "Селфи"
        : source.includes("файл")
          ? "Файлы"
          : source.includes("провер")
            ? "Проверка"
            : "Задача";
  const reasonSegments = task.reason
    .split("·")
    .map((segment) => segment.trim())
    .filter(Boolean);

  return {
    detail: reasonSegments.at(-1) ?? task.statusLabel,
    label,
  };
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

function compactActionTagLabel(task: AgentActionTask) {
  const source =
    task.nextAction.primaryLabel.trim() || task.nextAction.label.trim() || "Открыть";

  return source.split(/\s+/).slice(0, 2).join(" ");
}

function stableDomId(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, "-");
}
