import { useEffect, useState } from "react";

import { Badge, Button } from "../../../shared/ui/primitives";
import { cn } from "../../../shared/ui/cn";
import type { AgentActionItem, AgentActionSummary } from "../agentActions";
import { formatSubmissionListTitle } from "../listFormatters";
import { applicantCountLabel, tripDates } from "../selectors";
import {
  blockerCount,
  fixedIssueCount,
  nextProblem,
  openIssueCount,
  statusLabelFor,
} from "../status";
import type { DrawerTab, Issue, Submission } from "../types";
import { ProgressMeter } from "./CollectionPrimitives";

type EmptyState = {
  action: string;
  body: string;
  title: string;
};

type AgentActionsCommandCockpitProps = {
  actionGroupLabel: string;
  actions: AgentActionItem[];
  emptyState: EmptyState;
  selectedAction?: AgentActionItem;
  summary: AgentActionSummary;
  onEmptyAction: () => void;
  onOpenAction: (action: AgentActionItem) => void;
  onOpenIssue: (action: AgentActionItem, issue: Issue) => void;
  onOpenTab: (action: AgentActionItem, tab: DrawerTab) => void;
  onSelectAction: (action: AgentActionItem) => void;
};

export function AgentActionsCommandCockpit({
  actionGroupLabel,
  actions,
  emptyState,
  selectedAction,
  summary,
  onEmptyAction,
  onOpenAction,
  onOpenIssue,
  onOpenTab,
  onSelectAction,
}: AgentActionsCommandCockpitProps) {
  const [mobileDetailActionId, setMobileDetailActionId] = useState<string | null>(null);
  const mobileDetailAction =
    actions.find((action) => action.id === mobileDetailActionId) ?? null;

  useEffect(() => {
    if (!mobileDetailActionId) return;
    if (actions.some((action) => action.id === mobileDetailActionId)) return;
    setMobileDetailActionId(null);
  }, [actions, mobileDetailActionId]);

  useEffect(() => {
    if (!mobileDetailAction) return;

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileDetailActionId(null);
    };

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [mobileDetailAction]);

  function openMobileDetail(action: AgentActionItem) {
    onSelectAction(action);
    setMobileDetailActionId(action.id);
  }

  if (!actions.length) {
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

  const activeAction = selectedAction ?? actions[0];

  return (
    <div
      className="v19-actions-cockpit"
      data-testid="agent-actions-cockpit"
      aria-label="Командный центр действий"
    >
      <CockpitSummary summary={summary} />

      <div className="v19-actions-desktop-grid">
        <section
          className="v19-actions-queue-panel"
          aria-label="Очередь действий"
          data-testid="agent-action-queue"
        >
          <PanelHeader label="Очередь" title={actionGroupLabel} />
          <div className="v19-actions-queue-list">
            {actions.map((action) => (
              <QueueItem
                action={action}
                key={action.id}
                selected={activeAction.id === action.id}
                onSelect={() => onSelectAction(action)}
              />
            ))}
          </div>
        </section>

        <ActiveSubmissionPanel
          action={activeAction}
          onOpenAction={() => onOpenAction(activeAction)}
          onOpenIssue={(issue) => onOpenIssue(activeAction, issue)}
          onOpenTab={(tab) => onOpenTab(activeAction, tab)}
        />

        <NextActionPanel action={activeAction} onOpen={() => onOpenAction(activeAction)} />
      </div>

      <section
        className="v19-actions-mobile-stage"
        aria-label="Лента действий"
        data-testid="agent-action-timeline"
      >
        <PanelHeader label="Лента" title={actionGroupLabel} />
        <div className="v19-actions-timeline">
          {actions.map((action) => (
            <TimelineEvent
              action={action}
              key={action.id}
              selected={activeAction.id === action.id}
              onOpen={() => onOpenAction(action)}
              onSelect={() => openMobileDetail(action)}
            />
          ))}
        </div>
      </section>

      {mobileDetailAction ? (
        <MobileActionDetail
          action={mobileDetailAction}
          onClose={() => setMobileDetailActionId(null)}
          onOpenAction={() => {
            setMobileDetailActionId(null);
            onOpenAction(mobileDetailAction);
          }}
          onOpenIssue={(issue) => {
            setMobileDetailActionId(null);
            onOpenIssue(mobileDetailAction, issue);
          }}
          onOpenTab={(tab) => {
            setMobileDetailActionId(null);
            onOpenTab(mobileDetailAction, tab);
          }}
        />
      ) : null}
    </div>
  );
}

function CockpitSummary({ summary }: { summary: AgentActionSummary }) {
  return (
    <div className="v19-actions-cockpit-summary" aria-label="Сводка действий">
      <SummaryMetric label="просрочено" tone="danger" value={summary.overdue} />
      <SummaryMetric label="сегодня" tone="amber" value={summary.today} />
      <SummaryMetric label="выполнено" tone="teal" value={summary.completed} />
    </div>
  );
}

function SummaryMetric({
  label,
  tone,
  value,
}: {
  label: string;
  tone: "amber" | "danger" | "teal";
  value: number;
}) {
  return (
    <span className={`v19-actions-summary-metric tone-${tone}`}>
      <strong>{value}</strong>
      <em>{label}</em>
    </span>
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

function QueueItem({
  action,
  selected,
  onSelect,
}: {
  action: AgentActionItem;
  selected: boolean;
  onSelect: () => void;
}) {
  const submission = action.submission;
  const issues = openIssueCount(submission);

  return (
    <button
      className={cn(
        "v19-actions-queue-item",
        `severity-${action.severity}`,
        selected && "is-selected",
      )}
      aria-current={selected ? "true" : undefined}
      aria-label={`Выбрать подачу: ${formatSubmissionListTitle(submission)}. ${action.dueLabel}. ${action.context}`}
      data-submission-id={submission.id}
      data-testid="agent-action-queue-item"
      type="button"
      onClick={onSelect}
    >
      <span className="v19-actions-status-node" aria-hidden="true" />
      <span className="v19-actions-queue-main">
        <span className="v19-actions-queue-topline">
          <strong>{formatSubmissionListTitle(submission)}</strong>
          <small>{submission.id}</small>
        </span>
        <span className="v19-actions-queue-meta">
          {submission.city} · {tripDates(submission)}
        </span>
        <span className="v19-actions-queue-state">{action.dueLabel}</span>
      </span>
      <span className="v19-actions-queue-metric">
        <strong>{submission.completeness.total}%</strong>
        <small>{issues ? `${issues} замеч.` : "без блок."}</small>
      </span>
    </button>
  );
}

function ActiveSubmissionPanel({
  action,
  onOpenAction,
  onOpenIssue,
  onOpenTab,
}: {
  action: AgentActionItem;
  onOpenAction: () => void;
  onOpenIssue: (issue: Issue) => void;
  onOpenTab: (tab: DrawerTab) => void;
}) {
  const submission = action.submission;
  const openIssues = submission.issues.filter((issue) => issue.status === "open");

  return (
    <section
      className="v19-actions-active-panel"
      aria-label="Активная подача"
      data-testid="agent-action-active-panel"
    >
      <div className="v19-actions-active-head">
        <span className={`v19-actions-status-node severity-${action.severity}`} />
        <div>
          <p>Активная подача</p>
          <h3>{formatSubmissionListTitle(submission)}</h3>
        </div>
        <Badge tone={statusTone(submission)}>{statusLabelFor(submission.status)}</Badge>
      </div>

      <div className="v19-actions-active-meta" aria-label="Сводка подачи">
        <MetaItem label="ID" value={submission.id} />
        <MetaItem label="Город" value={submission.city} />
        <MetaItem label="Даты" value={tripDates(submission)} />
        <MetaItem
          label="Заявители"
          value={applicantCountLabel(submission.applicants.length)}
        />
      </div>

      <div className="v19-actions-readiness" aria-label="Комплектность">
        <ReadinessLine
          label="Анкета"
          tab="questionnaire"
          value={submission.completeness.questionnaire}
          onOpen={onOpenTab}
        />
        <ReadinessLine
          label="Файлы"
          tab="files"
          value={submission.completeness.files}
          onOpen={onOpenTab}
        />
        <ReadinessLine
          label="Итог"
          tab="overview"
          value={submission.completeness.total}
          onOpen={onOpenTab}
        />
      </div>

      <BlockerPreview
        action={action}
        issues={openIssues}
        onOpenIssue={onOpenIssue}
        onOpenTab={onOpenTab}
      />

      <div className="v19-actions-recent-history" aria-label="Последние изменения">
        <p>История</p>
        {submission.history.slice(0, 2).map((item) => (
          <span key={item.id}>
            <strong>{item.text}</strong>
            <small>{item.at}</small>
          </span>
        ))}
      </div>

      <div className="v19-actions-active-next">
        <NextActionContent action={action} />
        <Button variant="primary" onClick={onOpenAction}>
          {action.cta}
        </Button>
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

function ReadinessLine({
  label,
  tab,
  value,
  onOpen,
}: {
  label: string;
  tab: DrawerTab;
  value: number;
  onOpen: (tab: DrawerTab) => void;
}) {
  return (
    <button
      className="v19-actions-readiness-line"
      type="button"
      onClick={() => onOpen(tab)}
    >
      <span>
        <strong>{label}</strong>
        <small>{value}%</small>
      </span>
      <ProgressMeter ariaHidden tone={readinessTone(value)} value={value} />
    </button>
  );
}

function BlockerPreview({
  action,
  issues,
  onOpenIssue,
  onOpenTab,
}: {
  action: AgentActionItem;
  issues: Issue[];
  onOpenIssue: (issue: Issue) => void;
  onOpenTab: (tab: DrawerTab) => void;
}) {
  if (!issues.length) {
    return (
      <div className="v19-actions-blockers is-clear">
        <p>Блокеры</p>
        <strong>{nextProblem(action.submission)}</strong>
      </div>
    );
  }

  return (
    <div className="v19-actions-blockers">
      <div className="v19-actions-blockers-head">
        <p>Блокеры</p>
        <Badge tone={blockerCount(action.submission) ? "danger" : "amber"}>
          {issues.length}
        </Badge>
      </div>
      <div className="v19-actions-blocker-list">
        {issues.slice(0, 3).map((issue) => (
          <button key={issue.id} type="button" onClick={() => onOpenIssue(issue)}>
            <span
              className={cn(
                "v19-actions-status-node",
                issue.severity === "blocker" ? "severity-blocker" : "severity-warning",
              )}
              aria-hidden="true"
            />
            <span>
              <strong>{issue.reason}</strong>
              <small>{issue.target.applicantName}</small>
            </span>
          </button>
        ))}
      </div>
      <button
        className="v19-actions-secondary-link"
        type="button"
        onClick={() => onOpenTab("issues")}
      >
        Все замечания
      </button>
    </div>
  );
}

function NextActionPanel({
  action,
  onOpen,
}: {
  action: AgentActionItem;
  onOpen: () => void;
}) {
  return (
    <aside
      className="v19-actions-next-panel"
      aria-label="Следующее действие"
      data-testid="agent-action-next-panel"
    >
      <PanelHeader label="Next Action" title={action.cta} />
      <NextActionContent action={action} />
      <Button variant="primary" wide onClick={onOpen}>
        {action.cta}
      </Button>
      <div className="v19-actions-secondary-actions">
        <Badge tone={action.severity === "blocker" ? "danger" : "default"}>
          {action.dueLabel}
        </Badge>
        <span>{fixedIssueCount(action.submission)} исправлено</span>
      </div>
    </aside>
  );
}

function NextActionContent({ action }: { action: AgentActionItem }) {
  return (
    <div className="v19-actions-next-copy">
      <strong>{action.title}</strong>
      <p>{action.context}</p>
      <small>{nextProblem(action.submission)}</small>
    </div>
  );
}

function TimelineEvent({
  action,
  selected,
  onOpen,
  onSelect,
}: {
  action: AgentActionItem;
  selected: boolean;
  onOpen: () => void;
  onSelect: () => void;
}) {
  const submission = action.submission;

  return (
    <article
      className={cn(
        "v19-actions-timeline-event",
        `severity-${action.severity}`,
        selected && "is-selected",
      )}
      data-submission-id={submission.id}
    >
      <span className="v19-actions-timeline-node" aria-hidden="true" />
      <button
        className="v19-actions-timeline-hit"
        type="button"
        onClick={onSelect}
      >
        <span className="v19-actions-timeline-title">
          <strong>{formatSubmissionListTitle(submission)}</strong>
          <small>{submission.id}</small>
        </span>
        <span className="v19-actions-timeline-meta">
          {submission.city} · {tripDates(submission)}
        </span>
        <span className="v19-actions-timeline-state">
          {action.dueLabel} · {nextProblem(submission)}
        </span>
      </button>
      <Button className="v19-actions-timeline-cta" variant="secondary" onClick={onOpen}>
        {action.cta}
      </Button>
    </article>
  );
}

function MobileActionDetail({
  action,
  onClose,
  onOpenAction,
  onOpenIssue,
  onOpenTab,
}: {
  action: AgentActionItem;
  onClose: () => void;
  onOpenAction: () => void;
  onOpenIssue: (issue: Issue) => void;
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
        aria-label={`Детали действия ${formatSubmissionListTitle(action.submission)}`}
        data-testid="agent-action-mobile-detail"
      >
        <div className="v19-actions-mobile-detail-head">
          <div>
            <p>Активная подача</p>
            <h3>{formatSubmissionListTitle(action.submission)}</h3>
          </div>
          <button type="button" onClick={onClose}>
            Закрыть
          </button>
        </div>
        <ActiveSubmissionPanel
          action={action}
          onOpenAction={onOpenAction}
          onOpenIssue={onOpenIssue}
          onOpenTab={onOpenTab}
        />
      </section>
    </div>
  );
}

function readinessTone(value: number): "danger" | "success" | "warning" {
  if (value >= 100) return "success";
  if (value >= 70) return "warning";
  return "danger";
}

function statusTone(submission: Submission): "amber" | "blue" | "danger" | "muted" | "teal" {
  if (submission.status === "ready_for_export") return "teal";
  if (submission.status === "submitted_for_review") return "blue";
  if (submission.status === "returned" || submission.status === "requires_action") {
    return "danger";
  }
  if (submission.status === "draft" || submission.status === "exported") {
    return "muted";
  }
  return "amber";
}
