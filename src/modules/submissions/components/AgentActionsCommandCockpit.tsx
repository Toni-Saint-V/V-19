import { useEffect, useState } from "react";
import { User, Users } from "lucide-react";

import { Badge, Button } from "../../../shared/ui/primitives";
import { cn } from "../../../shared/ui/cn";
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
import { applicantCountLabel, tripDates } from "../selectors";
import type { DrawerTab, Issue } from "../types";

type EmptyState = {
  action: string;
  body: string;
  title: string;
};

export type AgentActionsSummaryFilter =
  | "done"
  | "in_correction"
  | "in_review"
  | "in_work";

type AgentActionsCommandCockpitProps = {
  actionGroupLabel: string;
  activeSummaryFilter?: AgentActionsSummaryFilter | null;
  emptyState: EmptyState;
  errorMessage?: string;
  loading?: boolean;
  selectedTask?: AgentActionTask;
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
  emptyState,
  errorMessage = "",
  loading = false,
  selectedTask,
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
  const [mobileDetailTaskId, setMobileDetailTaskId] = useState<string | null>(null);
  const mobileDetailTask =
    tasks.find((task) => task.id === mobileDetailTaskId) ?? null;

  useEffect(() => {
    if (!mobileDetailTaskId) return;
    if (tasks.some((task) => task.id === mobileDetailTaskId)) return;
    setMobileDetailTaskId(null);
  }, [mobileDetailTaskId, tasks]);

  useEffect(() => {
    if (!mobileDetailTask) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileDetailTaskId(null);
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [mobileDetailTask]);

  function openMobileDetail(task: AgentActionTask) {
    onSelectTask(task);
    setMobileDetailTaskId(task.id);
  }

  if (errorMessage) {
    return (
      <div className="v19-actions-cockpit-empty" data-testid="agent-actions-cockpit">
        <div className="v19-empty-state is-error" role="alert">
          <h3>Не удалось загрузить действия.</h3>
          <p>{errorMessage}</p>
          <Button variant="secondary" onClick={onEmptyAction}>
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
        <CockpitSummary
          activeFilter={activeSummaryFilter}
          summary={summary}
          tasks={summaryTasks ?? tasks}
          onFilterChange={onSummaryFilterChange}
        />
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
        <div className="v19-empty-state">
          <h3>{emptyState.title}</h3>
          <p>{emptyState.body}</p>
          <Button variant="secondary" onClick={onEmptyAction}>
            {emptyState.action}
          </Button>
        </div>
      </div>
    );
  }

  const activeTask = selectedTask ?? tasks[0];

  return (
    <div
      className="v19-actions-cockpit"
      data-testid="agent-actions-cockpit"
      aria-label="Очередь действий агента"
    >
      <CockpitSummary
        activeFilter={activeSummaryFilter}
        summary={summary}
        tasks={summaryTasks ?? tasks}
        onFilterChange={onSummaryFilterChange}
      />

      <div className="v19-actions-desktop-grid">
        <section
          className="v19-actions-queue-panel"
          aria-label="Очередь действий"
          data-testid="agent-action-queue"
        >
          <PanelHeader label="Очередь" title={actionGroupLabel} />
          <div className="v19-actions-queue-list">
            {tasks.map((task) => (
              <ActionTaskCard
                key={task.id}
                selected={activeTask.id === task.id}
                task={task}
                onSelect={() => onSelectTask(task)}
              />
            ))}
          </div>
        </section>

        <ActionSummaryPanel
          task={activeTask}
          onOpenIssue={(issue) => onOpenIssue(activeTask, issue)}
          onOpenPrimary={() => onOpenPrimary(activeTask)}
          onOpenSecondary={() => onOpenSecondary(activeTask)}
          onOpenTab={(tab) => onOpenTab(activeTask, tab)}
        />
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
              onSelect={() => openMobileDetail(task)}
            />
          ))}
        </div>
      </section>

      {mobileDetailTask ? (
        <MobileActionDetail
          task={mobileDetailTask}
          onClose={() => setMobileDetailTaskId(null)}
          onOpenIssue={(issue) => {
            setMobileDetailTaskId(null);
            onOpenIssue(mobileDetailTask, issue);
          }}
          onOpenPrimary={() => {
            setMobileDetailTaskId(null);
            onOpenPrimary(mobileDetailTask);
          }}
          onOpenSecondary={() => {
            setMobileDetailTaskId(null);
            onOpenSecondary(mobileDetailTask);
          }}
          onOpenTab={(tab) => {
            setMobileDetailTaskId(null);
            onOpenTab(mobileDetailTask, tab);
          }}
        />
      ) : null}
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

function ActionTaskCard({
  selected,
  task,
  onSelect,
}: {
  selected: boolean;
  task: AgentActionTask;
  onSelect: () => void;
}) {
  const dateLabel = tripDates(task.submission);

  return (
    <button
      className={cn(
        "v19-actions-queue-item",
        `status-${task.status}`,
        selected && "is-selected",
      )}
      aria-current={selected ? "true" : undefined}
      aria-label={`Выбрать действие: ${task.statusLabel}. ${task.title}. ${queueSubjectText(task)}. ${task.problem}. Следующее действие: ${task.nextAction.label}${task.priority.reason ? `. ${task.priority.label}: ${task.priority.reason}` : ""}`}
      data-action-status={task.status}
      data-submission-id={task.submission.id}
      data-testid="agent-action-queue-item"
      type="button"
      onClick={onSelect}
    >
      <span className="v19-actions-queue-strip" aria-hidden="true" />
      <span className="v19-actions-queue-icon" aria-hidden="true">
        {task.submission.type === "family" ? <Users size={17} /> : <User size={17} />}
      </span>
      <span className="v19-actions-queue-main">
        <span className="v19-actions-queue-topline">
          <strong>{task.applicantName || formatSubmissionListTitle(task.submission)}</strong>
        </span>
        <span className="v19-actions-queue-facts">
          <span>{dateLabel}</span>
          <span>{safeCity(task.submission.city)}</span>
          <span>{safeSubmissionId(task.submission.id)}</span>
        </span>
      </span>
    </button>
  );
}

function ActionSummaryPanel({
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

  return (
    <section
      className="v19-actions-active-panel v19-actions-summary-panel"
      aria-label="Краткая сводка выбранной задачи"
      data-testid="agent-action-active-panel"
    >
      <div className="v19-actions-active-head">
        <div>
          <p>Сводка</p>
          <h3>{formatSubmissionListTitle(task.submission)}</h3>
        </div>
        <StatusBadge status={task.status} label={task.statusLabel} />
      </div>

      <div className="v19-actions-task-problem" aria-label="Проблема и причина">
        <p>Проблема</p>
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
              <button key={issue.id} type="button" onClick={() => onOpenIssue(issue)}>
                <span className="v19-actions-status-node status-error" aria-hidden="true" />
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
        <MetaItem label="ID" value={safeSubmissionId(task.submission.id)} />
        <MetaItem label="Направление" value={task.destination} />
        <MetaItem label="Даты поездки" value={tripDates(task.submission)} />
        <MetaItem
          label="Заявители"
          value={applicantCountLabel(task.submission.applicants.length)}
        />
      </div>

      <div className="v19-actions-next-copy" aria-label="Что сделать дальше">
        <p>Следующее</p>
        <span>{task.nextAction.detail}</span>
      </div>

      <div className="v19-actions-detail-footer">
        {disabledReason ? (
          <p className="v19-actions-disabled-reason" id={disabledReasonId}>
            {disabledReason}
          </p>
        ) : null}
        <div className="v19-actions-summary-cta">
          <Button
            aria-describedby={disabledReason ? disabledReasonId : undefined}
            disabled={Boolean(disabledReason)}
            title={disabledReason || undefined}
            variant="primary"
            wide
            onClick={onOpenPrimary}
          >
            {task.nextAction.primaryLabel}
          </Button>
          <Button variant="secondary" wide onClick={onOpenSecondary}>
            {task.secondaryAction.label}
          </Button>
        </div>
      </div>
    </section>
  );
}

function MetaItem({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <small>{label}</small>
      <strong>{value}</strong>
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
        label={`${readiness.finalResult.label} · ${readiness.overallPercent}%`}
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
  const owner = actionOwnerLabel(task);
  const readiness = readinessPercentLabel(task);
  const submissionId = safeSubmissionId(task.submission.id);

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
        className="v19-actions-timeline-hit"
        type="button"
        onClick={onSelect}
      >
        <span className="v19-actions-timeline-title">
          <strong>{task.statusLabel}</strong>
          <small>{submissionId}</small>
        </span>
        <span className="v19-actions-timeline-state">
          {formatSubmissionListTitle(task.submission)}
        </span>
        <span className="v19-actions-queue-scope">{queueSubjectText(task)}</span>
        <span className="v19-actions-timeline-state">
          {safeCity(task.submission.city)}
        </span>
        <span className="v19-actions-timeline-state">Причина: {task.reason}</span>
        <span className="v19-actions-timeline-state">Ответственный: {owner}</span>
        {task.priority.reason ? (
          <span className="v19-actions-timeline-meta">{priorityCopy(task)}</span>
        ) : null}
        <span className="v19-actions-timeline-state">
          Следующее: {task.nextAction.label}
        </span>
        <span className="v19-actions-timeline-state">{readiness}</span>
      </button>
    </article>
  );
}

function MobileActionDetail({
  task,
  onClose,
  onOpenIssue,
  onOpenPrimary,
  onOpenSecondary,
  onOpenTab,
}: {
  task: AgentActionTask;
  onClose: () => void;
  onOpenIssue: (issue: Issue) => void;
  onOpenPrimary: () => void;
  onOpenSecondary: () => void;
  onOpenTab: (tab: DrawerTab) => void;
}) {
  return (
    <div className="v19-actions-mobile-overlay" role="presentation">
      <button
        className="v19-actions-mobile-backdrop"
        type="button"
        onClick={onClose}
      >
        <span className="sr-only">Закрыть детали действия</span>
      </button>
      <section
        className="v19-actions-mobile-detail"
        role="dialog"
        aria-modal="true"
        aria-label={`Детали действия ${formatSubmissionListTitle(task.submission)}`}
        data-testid="agent-action-mobile-detail"
      >
        <div className="v19-actions-mobile-detail-head">
          <div>
            <p>Сводка действия</p>
            <h3>{formatSubmissionListTitle(task.submission)}</h3>
          </div>
          <button aria-label="Закрыть детали действия" type="button" onClick={onClose}>
            Закрыть
          </button>
        </div>
        <ActionSummaryPanel
          task={task}
          onOpenIssue={onOpenIssue}
          onOpenPrimary={onOpenPrimary}
          onOpenSecondary={onOpenSecondary}
          onOpenTab={onOpenTab}
        />
      </section>
    </div>
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

function priorityCopy(task: AgentActionTask) {
  if (!task.priority.reason) return "";
  return `${task.priority.label}: ${lowercaseFirst(task.priority.reason)}`;
}

function actionOwnerLabel(task: AgentActionTask) {
  if (task.status === "in_review") return "Проверка админом";
  if (task.status === "ready") return "Агент может отправить";
  if (task.status === "blocked") return "Ожидание внешнего события";
  return "Действие за агентом";
}

function primaryActionDisabledReason(task: AgentActionTask) {
  if (task.status === "blocked") {
    return "Действие недоступно: агент ждёт внешнее событие.";
  }

  return "";
}

function readinessPercentLabel(task: AgentActionTask) {
  return `Готовность ${task.readiness.overallPercent}%`;
}

function safeSubmissionId(id: string) {
  return id.trim() || "ID не указан";
}

function safeCity(city: string) {
  return city.trim() || "Город не указан";
}

function stableDomId(value: string) {
  return value.replace(/[^A-Za-z0-9_-]/g, "-");
}

function lowercaseFirst(value: string) {
  if (!value) return value;
  return value[0].toLocaleLowerCase("ru-RU") + value.slice(1);
}
