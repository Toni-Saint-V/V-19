import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { Badge, Button, CardComponent } from "../../../shared/ui/primitives";
import {
  V19EntityTypeSwitch,
  V19FamilyProfileCard,
  V19IndividualProfileCard,
  type V19EntityViewMode,
  type V19MemberStatusTone,
} from "../../../shared/ui/v19-design-system";
import {
  buildAgentActionTasks,
  summarizeAgentActionTasks,
  type AgentActionItem,
  type AgentActionTask,
  type AgentActionTaskStatus,
  type OperationalInboxEvent,
} from "../agentActions";
import {
  buildExportMappingAudit,
  isSubmissionSelectableForExport,
  type ExportSummary,
} from "../exportRules";
import { formatSubmissionListTitle } from "../listFormatters";
import { buildAgentHandoffPackage } from "../operationalWorkflow";
import { applicantCountLabel, counts, tripDates } from "../selectors";
import {
  adminIssueGuard,
  adminWorkDrawerTabFor,
  adminWorkEventTitle,
  adminWorkPresentation,
  blockerCount,
  defaultDrawerTab,
  fixedIssueCount,
  nextProblem,
  openIssueCount,
  statusLabelFor,
  statusLabels,
} from "../status";
import type { DrawerTab, Submission } from "../types";
import {
  matchesReviewTab,
  type AgentTab,
  type ExportTab,
} from "../uiTypes";
import { EmptyState } from "../components/Primitives";
import {
  AgentActionsCommandCockpit,
  type AgentActionsSummaryFilter,
} from "../components/AgentActionsCommandCockpit";
import { AgentSubmissionContextRail } from "../components/AgentSubmissionContextRail";
import {
  CollectionToolbarTools,
  compactActiveFilters,
} from "../components/CollectionComposition";
import { RailCard, useRailDisclosure } from "../components/RightRailPrimitives";
import {
  CollectionGroupLabel,
  CollectionRow,
  CollectionToolbar,
  ContextRail,
  MobileFilterSheet,
  ProgressMeter,
  SubmissionCollectionRow,
  SvgIcon,
  ToolbarIconButton,
} from "../components/CollectionPrimitives";
import {
  buildReadinessQueue,
  firstActionableQueueItem,
  sectionNavigationTarget,
  targetForIssue,
  type WorkspaceTarget,
} from "../workspaceModel";

function pluralRu(count: number, one: string, few: string, many: string) {
  const mod10 = Math.abs(count) % 10;
  const mod100 = Math.abs(count) % 100;

  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

type ViewTransitionLike = {
  finished: Promise<unknown>;
};

const viewTransitionClass = "vf-vt";

function transitionUiState(update: () => void) {
  if (
    typeof document === "undefined" ||
    typeof window === "undefined" ||
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    update();
    return;
  }

  const transitionDocument = document as Document & {
    startViewTransition?: (updateCallback: () => void) => ViewTransitionLike;
  };

  if (!transitionDocument.startViewTransition) {
    update();
    return;
  }

  const transitionRoot = document.documentElement;

  try {
    transitionRoot.classList.add(viewTransitionClass);
    const transition = transitionDocument.startViewTransition(() => flushSync(update));

    transition.finished.finally(() => {
      transitionRoot.classList.remove(viewTransitionClass);
    });
  } catch {
    transitionRoot.classList.remove(viewTransitionClass);
    update();
  }
}

type InboxEvent = OperationalInboxEvent;

function firstFileWorkspaceTarget(submission: Submission): WorkspaceTarget | undefined {
  const file =
    submission.files.find((item) => item.status === "needs_replacement") ??
    submission.files.find(
      (item) => item.status === "missing" || item.status === "pending_review",
    );

  if (!file) {
    return undefined;
  }

  return {
    applicantId: file.applicantId,
    fileType: file.type,
    tab: "files",
  };
}

function firstQuestionnaireWorkspaceTarget(
  submission: Submission,
): WorkspaceTarget | undefined {
  const applicant = submission.applicants.find((item) =>
    ["empty", "partial", "needs_fix"].includes(item.questionnaireStatus),
  );
  const section = applicant?.sections.find((item) => item.status !== "complete");

  if (!applicant || !section) {
    return undefined;
  }

  return sectionNavigationTarget(submission, section.title);
}

function queueTargetForTab(
  submission: Submission,
  tab: DrawerTab,
): WorkspaceTarget | undefined {
  return buildReadinessQueue(submission).find((item) => item.target.tab === tab)
    ?.target;
}

function targetForSubmissionTab(
  submission: Submission,
  tab: DrawerTab,
): WorkspaceTarget | undefined {
  const queueTarget = queueTargetForTab(submission, tab);

  if (queueTarget) {
    return queueTarget;
  }

  if (tab === "files") {
    return firstFileWorkspaceTarget(submission);
  }

  if (tab === "questionnaire") {
    return firstQuestionnaireWorkspaceTarget(submission);
  }

  if (tab === "issues") {
    const issue = primarySubmissionIssue(submission);
    return issue ? targetForIssue(issue) : undefined;
  }

  return firstActionableQueueItem(submission)?.target;
}

function drawerTabForScreenTarget(
  target: WorkspaceTarget | undefined,
  fallback: DrawerTab,
): DrawerTab {
  return target?.tab ?? fallback;
}

function defaultContextRailOpen() {
  if (typeof window === "undefined") {
    return true;
  }

  return window.innerWidth >= 1280;
}

export function AgentActionsScreen({
  cityControl,
  completedActions,
  errorMessage = "",
  loading = false,
  onRetryError,
  onOpen,
  openActions,
  searchControl,
}: {
  cityControl?: ReactNode;
  completedActions: AgentActionItem[];
  errorMessage?: string;
  loading?: boolean;
  onRetryError?: () => void;
  onOpen: (submission: Submission, tab?: DrawerTab, target?: WorkspaceTarget) => void;
  openActions: AgentActionItem[];
  searchControl: ReactNode;
}) {
  type ActionStatusFilter = "all" | AgentActionTaskStatus;

  const [statusFilter, setStatusFilter] = useState<ActionStatusFilter>("all");
  const [summaryFilter, setSummaryFilter] =
    useState<AgentActionsSummaryFilter | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [sortOldest, setSortOldest] = useState(false);

  const allTasks = useMemo(
    () => buildAgentActionTasks([...openActions, ...completedActions]),
    [completedActions, openActions],
  );
  const taskSummary = useMemo(() => summarizeAgentActionTasks(allTasks), [allTasks]);
  const filteredTasks = summaryFilter
    ? filterAgentActionSummaryTasks(allTasks, summaryFilter)
    : statusFilter === "all"
      ? allTasks
      : allTasks.filter((task) => task.status === statusFilter);
  const visibleTasks = sortOldest ? [...filteredTasks].reverse() : filteredTasks;
  const selectedTask =
    visibleTasks.find((task) => task.id === selectedTaskId) ?? visibleTasks[0];
  const actionGroupLabel = summaryFilter
    ? actionSummaryFilterLabel(summaryFilter)
    : actionStatusFilterLabel(statusFilter);
  const emptyState = summaryFilter
    ? actionSummaryFilterEmptyState(summaryFilter)
    : actionFilterEmptyState(statusFilter);
  const activeFilters = compactActiveFilters([
    summaryFilter
      ? {
          id: "summary",
          label: actionSummaryFilterLabel(summaryFilter),
          onRemove: () => transitionUiState(() => setSummaryFilter(null)),
        }
      : null,
    sortOldest
      ? {
          id: "sort",
          label: "Старые сверху",
          onRemove: () => transitionUiState(() => setSortOldest(false)),
        }
      : null,
  ]);
  const resetActiveFilters = () =>
    transitionUiState(() => {
      setSummaryFilter(null);
      setSortOldest(false);
    });
  const toolbarToolButtons = (
    <ToolbarIconButton
      label={sortOldest ? "Сортировка: старые сверху" : "Сортировка: важные сверху"}
      icon="sort"
      pressed={sortOldest}
      onClick={() => transitionUiState(() => setSortOldest((value) => !value))}
    />
  );
  const toolbarTools = <CollectionToolbarTools desktopTools={toolbarToolButtons} />;

  function openTask(task: AgentActionTask) {
    openTaskTab(task, task.nextAction.tab);
  }

  function openTaskTab(task: AgentActionTask, tab: DrawerTab) {
    const target = targetForSubmissionTab(task.submission, tab);

    setSelectedTaskId(task.id);
    onOpen(task.submission, drawerTabForScreenTarget(target, tab), target);
  }

  function openFullSubmission(task: AgentActionTask) {
    const target = targetForSubmissionTab(task.submission, "overview");

    setSelectedTaskId(task.id);
    onOpen(task.submission, drawerTabForScreenTarget(target, "overview"), target);
  }

  function openTaskIssue(task: AgentActionTask, issue: Submission["issues"][number]) {
    setSelectedTaskId(task.id);
    onOpen(task.submission, drawerTabForIssue(issue), targetForIssue(issue));
  }

  return (
    <div className="v19-screen-grid v19-inbox-screen v19-actions-screen is-panel-closed">
      <section
        className={
          activeFilters.length
            ? "v19-actions-cockpit-shell has-active-filters"
            : "v19-actions-cockpit-shell"
        }
        aria-labelledby="agent-inbox-actions-title"
      >
        <h2 id="agent-inbox-actions-title" className="sr-only">
          Мои действия
        </h2>

        <CollectionToolbar<ActionStatusFilter>
          activeFilters={activeFilters}
          ariaLabel="Инструменты действий"
          className={cityControl ? "v19-agent-mobile-toolbar" : undefined}
          mobileCityControl={cityControl}
          mobileTitle="Мои действия"
          onClearActiveFilters={activeFilters.length ? resetActiveFilters : undefined}
          onTabChange={(nextFilter) =>
            transitionUiState(() => {
              setSummaryFilter(null);
              setStatusFilter(nextFilter);
            })
          }
          search={searchControl}
          tabs={[
            { count: taskSummary.all, id: "all", label: "Все" },
            { count: taskSummary.errors, id: "error", label: "Ошибки" },
            {
              count: taskSummary.actionRequired,
              id: "action_required",
              label: "Требуют действия",
            },
            { count: taskSummary.ready, id: "ready", label: "Готово" },
            { count: taskSummary.blocked, id: "blocked", label: "Заблокировано" },
          ]}
          tabsAriaLabel="Рабочее состояние действий"
          tools={toolbarTools}
          value={statusFilter}
        />

        <AgentActionsCommandCockpit
          actionGroupLabel={actionGroupLabel}
          emptyState={emptyState}
          errorMessage={errorMessage}
          loading={loading}
          activeSummaryFilter={summaryFilter}
          selectedTask={selectedTask}
          summary={taskSummary}
          summaryTasks={allTasks}
          tasks={visibleTasks}
          onEmptyAction={() =>
            transitionUiState(() => {
              if (summaryFilter) {
                setSummaryFilter(null);
                return;
              }

              if (statusFilter !== "all") {
                setStatusFilter("all");
                return;
              }

              onRetryError?.();
            })
          }
          onOpenIssue={openTaskIssue}
          onOpenPrimary={openTask}
          onOpenSecondary={openFullSubmission}
          onOpenTab={openTaskTab}
          onSelectTask={(task) => setSelectedTaskId(task.id)}
          onSummaryFilterChange={(filter) =>
            transitionUiState(() => {
              setStatusFilter("all");
              setSummaryFilter((current) => (current === filter ? null : filter));
            })
          }
        />
      </section>
    </div>
  );
}

function actionStatusFilterLabel(status: "all" | AgentActionTaskStatus) {
  if (status === "error") return "Ошибки";
  if (status === "action_required") return "Требуют действия";
  if (status === "ready") return "Готово";
  if (status === "blocked") return "Заблокировано";
  if (status === "in_review") return "На проверке";
  return "Все действия";
}

function actionSummaryFilterLabel(filter: AgentActionsSummaryFilter) {
  if (filter === "in_work") return "В работе";
  if (filter === "in_review") return "На проверке";
  if (filter === "in_correction") return "На исправлении";
  return "Готово";
}

function filterAgentActionSummaryTasks(
  tasks: AgentActionTask[],
  filter: AgentActionsSummaryFilter,
) {
  if (filter === "in_work") {
    return tasks.filter((task) =>
      ["draft", "in_progress"].includes(task.submission.status),
    );
  }

  if (filter === "in_review") {
    return tasks.filter((task) =>
      ["corrections_received", "submitted_for_review"].includes(
        task.submission.status,
      ),
    );
  }

  if (filter === "in_correction") {
    return tasks.filter((task) =>
      ["requires_action", "returned"].includes(task.submission.status),
    );
  }

  return tasks.filter((task) =>
    ["exported", "ready_for_export"].includes(task.submission.status),
  );
}

function actionSummaryFilterEmptyState(filter: AgentActionsSummaryFilter) {
  if (filter === "in_work") {
    return {
      action: "Показать все",
      body: "Нет подач, которые агент ещё заполняет.",
      title: "Нет действий, требующих внимания",
    };
  }

  if (filter === "in_review") {
    return {
      action: "Показать все",
      body: "Нет подач, отправленных админу.",
      title: "Нет действий, требующих внимания",
    };
  }

  if (filter === "in_correction") {
    return {
      action: "Показать все",
      body: "Нет подач, где админ вернул замечания.",
      title: "Нет действий, требующих внимания",
    };
  }

  return {
    action: "Показать все",
    body: "Нет принятых или выгруженных подач.",
    title: "Нет действий, требующих внимания",
  };
}

function actionFilterEmptyState(status: "all" | AgentActionTaskStatus) {
  if (status === "error") {
    return {
      action: "Показать все",
      body: "Нет сломанных задач, которые блокируют продолжение подачи.",
      title: "Нет действий, требующих внимания",
    };
  }
  if (status === "action_required") {
    return {
      action: "Показать все",
      body: "Нет неблокирующих задач, которые агент может выполнить сейчас.",
      title: "Нет действий, требующих внимания",
    };
  }
  if (status === "ready") {
    return {
      action: "Показать все",
      body: "Нет подач, готовых к передаче дальше.",
      title: "Нет действий, требующих внимания",
    };
  }
  if (status === "blocked") {
    return {
      action: "Показать все",
      body: "Нет задач, где агент ждёт внешнее событие.",
      title: "Нет действий, требующих внимания",
    };
  }
  if (status === "in_review") {
    return {
      action: "Показать все",
      body: "Нет задач, ожидающих проверки.",
      title: "Нет действий, требующих внимания",
    };
  }

  return {
    action: "Обновить очередь",
    body: "Новые задачи появятся после изменений в подачах.",
    title: "Нет действий, требующих внимания",
  };
}

export function AgentInboxScreen({
  cityControl,
  contextRailEnabled,
  inboxEvents,
  onOpen,
  searchControl,
  submissions,
  summary,
}: {
  cityControl?: ReactNode;
  contextRailEnabled?: boolean;
  inboxEvents?: InboxEvent[];
  onOpen: (submission: Submission, tab?: DrawerTab, target?: WorkspaceTarget) => void;
  searchControl: ReactNode;
  submissions: Submission[];
  summary: ReturnType<typeof counts>;
}) {
  const [activeTab, setActiveTab] = useState<"unread" | "all">("unread");
  const [actionOnly, setActionOnly] = useState(false);
  const [comfortableView, setComfortableView] = useState(true);
  const [informationalOnly, setInformationalOnly] = useState(false);
  const hasContextRail = contextRailEnabled ?? cityControl != null;
  const railDisclosure = useRailDisclosure({
    defaultOpen: defaultContextRailOpen(),
    enabled: hasContextRail,
    transition: transitionUiState,
  });
  const panelOpen = railDisclosure.open;
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [sortOrder, setSortOrder] = useState<"newest" | "oldest">("newest");
  const events = useMemo(
    () => inboxEvents ?? buildAgentInboxEvents(submissions),
    [inboxEvents, submissions],
  );
  const visibleEvents = useMemo(() => {
    const tabEvents =
      activeTab === "unread"
        ? [
            ...events.filter((event) => !event.read),
            ...events.filter((event) => event.read).slice(0, 1),
          ]
        : events;
    const filteredEvents = actionOnly
      ? tabEvents.filter((event) => event.needsAction)
      : informationalOnly
        ? tabEvents.filter((event) => !event.needsAction)
        : tabEvents;

    return sortOrder === "oldest" ? [...filteredEvents].reverse() : filteredEvents;
  }, [actionOnly, activeTab, events, informationalOnly, sortOrder]);
  const unreadCount = events.filter((event) => !event.read).length;
  const unreadActionCount = events.filter(
    (event) => !event.read && event.needsAction,
  ).length;
  const actionEventCount = events.length
    ? unreadActionCount
    : Math.min(summary.requiresAction, unreadCount);
  const informationalEventCount = Math.max(unreadCount - actionEventCount, 0);
  const selectedEvent =
    visibleEvents.find((event) => event.id === selectedEventId) ?? visibleEvents[0];
  const railEvents = events.filter((event) => !event.read).slice(0, 3);
  const railPeerEvents = (railEvents.length ? railEvents : events)
    .filter((event) => event.id !== selectedEvent?.id)
    .slice(0, 2);
  const eventGroups = [
    {
      events: visibleEvents.filter((event) => !event.time.startsWith("вчера")),
      label: "Сегодня",
    },
    {
      events: visibleEvents.filter((event) => event.time.startsWith("вчера")),
      label: "Ранее",
    },
  ].filter((group) => group.events.length);
  const activeFilters = compactActiveFilters([
      actionOnly
        ? {
            id: "action",
            label: "Требуют действия",
            onRemove: () => transitionUiState(() => setActionOnly(false)),
          }
        : null,
      informationalOnly
        ? {
            id: "info",
            label: "Информационные",
            onRemove: () => transitionUiState(() => setInformationalOnly(false)),
          }
        : null,
      sortOrder === "oldest"
        ? {
            id: "sort",
            label: "Старые сверху",
            onRemove: () => transitionUiState(() => setSortOrder("newest")),
          }
        : null,
      comfortableView
        ? null
        : {
            id: "density",
            label: "Компактный вид",
            onRemove: () => transitionUiState(() => setComfortableView(true)),
          },
    ]);
  const resetActiveFilters = () =>
    transitionUiState(() => {
      setActionOnly(false);
      setInformationalOnly(false);
      setSortOrder("newest");
      setComfortableView(true);
    });
  function closePanel() {
    railDisclosure.close();
  }

  function togglePanel() {
    railDisclosure.toggle();
  }

  const panelToggleTool = (
    <ToolbarIconButton
      label={panelOpen ? "Скрыть контекст" : "Показать контекст"}
      icon="panel"
      pressed={panelOpen}
      onClick={togglePanel}
    />
  );
  const mobilePanelToggleTool = hasContextRail ? (
    <div className="v19-mobile-context-tool">
      <ToolbarIconButton
        label={panelOpen ? "Скрыть контекст" : "Показать контекст"}
        icon="panel"
        pressed={panelOpen}
        onClick={togglePanel}
      />
    </div>
  ) : null;
  const toolbarToolButtons = (
    <>
      <ToolbarIconButton
        label={actionOnly ? "Фильтр: только требующие действия" : "Фильтр: все события"}
        icon="filter"
        pressed={actionOnly}
        onClick={() =>
          transitionUiState(() => {
            setInformationalOnly(false);
            setActionOnly((value) => !value);
          })
        }
      />
      <ToolbarIconButton
        label={
          sortOrder === "newest"
            ? "Сортировка: новые сверху"
            : "Сортировка: старые сверху"
        }
        icon="sort"
        pressed={sortOrder === "oldest"}
        onClick={() =>
          transitionUiState(() =>
            setSortOrder((value) => (value === "newest" ? "oldest" : "newest")),
          )
        }
      />
      {hasContextRail ? panelToggleTool : null}
    </>
  );
  const toolbarTools = (
    <CollectionToolbarTools
      desktopTools={toolbarToolButtons}
      mobileContextTool={mobilePanelToggleTool}
    />
  );

  function openEventDrawer(event: InboxEvent) {
    const target = targetForSubmissionTab(event.submission, event.tab);

    setSelectedEventId(event.id);
    onOpen(event.submission, drawerTabForScreenTarget(target, event.tab), target);
  }

  function openPanelNextEvent(event: InboxEvent) {
    openEventDrawer(event);
  }

  return (
    <>
      <div
        className={`v19-screen-grid v19-inbox-screen ${
          panelOpen ? "" : "is-panel-closed"
        } ${comfortableView ? "is-comfortable" : "is-compact"}`}
      >
        <CardComponent
          as="section"
          className={
            activeFilters.length
              ? "v19-collection-panel has-active-filters"
              : "v19-collection-panel"
          }
          aria-labelledby="agent-inbox-title"
        >
          <h2 id="agent-inbox-title" className="sr-only">
            Входящие
          </h2>

          <CollectionToolbar
            activeFilters={activeFilters}
            ariaLabel="Инструменты входящих"
            className={cityControl ? "v19-agent-mobile-toolbar" : undefined}
            mobileCityControl={cityControl}
            mobileTitle="Входящие"
            onClearActiveFilters={activeFilters.length ? resetActiveFilters : undefined}
            onTabChange={(nextTab) =>
              transitionUiState(() => {
                setActiveTab(nextTab);
                setInformationalOnly(false);
              })
            }
            search={searchControl}
            tabs={[
              { count: unreadCount, id: "unread", label: "Непрочитанные" },
              { id: "all", label: "Все" },
            ]}
            tabsAriaLabel="Состояние входящих"
            tools={toolbarTools}
            value={activeTab}
          />

          {visibleEvents.length ? (
            <div className="v19-event-list" aria-label="Список входящих событий">
              {eventGroups.map((group) => (
                <div className="v19-event-group" key={group.label}>
                  <CollectionGroupLabel>{group.label}</CollectionGroupLabel>
                  {group.events.map((event) => (
                    <CollectionRow
                      action={event.action}
                      badge={event.badge}
                      family={event.submission.type === "family"}
                      key={event.id}
                      meta={<InboxEventMeta event={event} />}
                      onAction={() => openEventDrawer(event)}
                      passport={inboxPassportNumber(event.submission)}
                      read={event.read}
                      title={event.title}
                      tone={event.tone}
                      trip={tripDates(event.submission)}
                    />
                  ))}
                </div>
              ))}
              {visibleEvents.length <= 1 ? (
                <div
                  className="v19-inbox-list-cue"
                  aria-label="Состояние очереди входящих"
                >
                  <strong>
                    {unreadCount} непрочитанных · {actionEventCount} требуют реакции
                  </strong>
                  <span>
                    Новые события появятся здесь после комментариев, возвратов и
                    проверок.
                  </span>
                </div>
              ) : null}
            </div>
          ) : (
            <div
              className="v19-empty-state"
              key={`inbox-empty-${activeTab}-${actionOnly}`}
            >
              <h3>Новых событий нет</h3>
              <p>Здесь появятся изменения, которые требуют вашего внимания.</p>
              <Button variant="secondary" onClick={() => setActiveTab("all")}>
                Показать все
              </Button>
            </div>
          )}
        </CardComponent>
      </div>

      {hasContextRail && panelOpen ? (
        <button className="v19-context-backdrop" type="button" onClick={closePanel}>
          <span className="sr-only">Закрыть контекст</span>
        </button>
      ) : null}

      {hasContextRail && panelOpen ? (
        <ContextRail
          className="v19-inbox-summary"
          label="Фокус входящего"
          title={selectedEvent ? selectedEvent.badge : "Входящие"}
          onClose={closePanel}
        >
          <RailCard className="v19-inbox-overview-card">
            <h3>Очередь входящих</h3>
            <div className="v19-inbox-summary-line">
              <span>
                <strong>{unreadCount}</strong>
                <em>Непрочитанных</em>
              </span>
              <span>
                <strong>{actionEventCount}</strong>
                <em>Требуют реакции</em>
              </span>
              <span>
                <strong>{informationalEventCount}</strong>
                <em>Инфо</em>
              </span>
            </div>
          </RailCard>

          {selectedEvent ? (
            <RailCard className="v19-inbox-next-card">
              <p className="v19-rail-label">Текущее событие</p>
              <h3>{selectedEvent.title}</h3>
              <p>
                {inboxEventSourceLabel(selectedEvent)} · {selectedEvent.context} ·{" "}
                {selectedEvent.time}
              </p>
              <Button
                variant="primary"
                onClick={() => openPanelNextEvent(selectedEvent)}
              >
                {selectedEvent.action}
                <SvgIcon>
                  <path d="M9 6l6 6-6 6" />
                </SvgIcon>
              </Button>
            </RailCard>
          ) : null}

          {railPeerEvents.length ? (
            <RailCard>
              <h3>Ещё в очереди</h3>
              <div className="v19-rail-status-list">
                {railPeerEvents.map((event) => (
                  <button
                    className="v19-rail-news-item"
                    key={event.id}
                    type="button"
                    onClick={() => openPanelNextEvent(event)}
                  >
                    <span
                      className={`v19-rail-issue-dot tone-${event.tone === "danger" ? "danger" : event.tone === "amber" ? "warning" : "success"}`}
                      aria-hidden="true"
                    />
                    <span>
                      <strong>{inboxRailNewsTitle(event)}</strong>
                      <small>
                        {inboxEventSourceLabel(event)} · {event.time}
                      </small>
                    </span>
                  </button>
                ))}
              </div>
            </RailCard>
          ) : null}
        </ContextRail>
      ) : null}
    </>
  );
}

function inboxRailNewsTitle(event: InboxEvent) {
  if (event.badge === "Возвращено") return "Возврат на исправление";
  if (event.badge === "Файл") return "Комментарий к файлу";
  if (event.badge === "Принято") return "Подача принята";
  return event.title;
}

function InboxEventMeta({ event }: { event: InboxEvent }) {
  return (
    <span className="v19-inbox-event-meta">
      <span>{event.context}</span>
    </span>
  );
}

function inboxEventSourceLabel(event: InboxEvent) {
  if (event.badge === "Возвращено") return "Администратор";
  if (event.badge === "Файл") return "Файл";
  if (event.badge === "Принято") return "Проверка";
  if (event.badge === "Черновик") return "Система";
  return event.submission.title;
}

function buildAgentInboxEvents(submissions: Submission[]): InboxEvent[] {
  const fallback = submissions[0];
  if (!fallback) return [];
  const returned =
    submissions.find((submission) =>
      ["returned", "requires_action"].includes(submission.status),
    ) ?? fallback;
  const fileIssue =
    submissions.find((submission) =>
      submission.files.some((file) => file.status === "needs_replacement"),
    ) ?? returned;
  const replacementFile = fileIssue.files.find(
    (file) => file.status === "needs_replacement",
  );
  const replacementApplicant = fileIssue.applicants.find(
    (applicant) => applicant.id === replacementFile?.applicantId,
  );
  const accepted =
    submissions.find((submission) => submission.status === "ready_for_export") ??
    submissions[2] ??
    returned;
  const draft =
    submissions.find((submission) => submission.status === "draft") ??
    submissions[3] ??
    fallback;

  return [
    {
      action: "Открыть",
      badge: "Возвращено",
      context: "2 блокера",
      id: `agent-inbox-reference-returned-${returned.id}`,
      needsAction: true,
      read: false,
      submission: returned,
      tab: "issues",
      time: "12 мин назад",
      title: inboxSubmissionLeadName(returned),
      tone: "danger",
    },
    {
      action: "Открыть",
      badge: "Файл",
      context: "Файл",
      id: `agent-inbox-reference-file-${fileIssue.id}`,
      needsAction: true,
      read: false,
      submission: fileIssue,
      tab: "files",
      time: "34 мин назад",
      title: replacementApplicant?.fullName ?? inboxSubmissionLeadName(fileIssue),
      tone: "amber",
    },
    {
      action: "Открыть",
      badge: "Принято",
      context: "Принято",
      id: `agent-inbox-reference-accepted-${accepted.id}`,
      needsAction: false,
      read: false,
      submission: accepted,
      tab: "overview",
      time: "1 ч назад",
      title: inboxSubmissionLeadName(accepted),
      tone: "teal",
    },
    {
      action: "Открыть",
      badge: "Черновик",
      context: "Черновик",
      id: `agent-inbox-reference-draft-${draft.id}`,
      needsAction: false,
      read: true,
      submission: draft,
      tab: "overview",
      time: "вчера, 18:42",
      title: inboxSubmissionLeadName(draft),
      tone: "muted",
    },
  ];
}

function inboxSubmissionLeadName(submission: Submission) {
  return submission.applicants[0]?.fullName ?? submission.title;
}

function inboxPassportNumber(submission: Submission) {
  const applicant = submission.applicants[0];
  const extractedPassport = applicant?.passportExtraction?.extractedFields
    .find((field) => field.key === "passportNumber")
    ?.value.trim();
  const questionnairePassport = applicant?.sections
    .flatMap((section) => section.fields)
    .find((field) => field.id === "passport-no")
    ?.value.trim();

  return extractedPassport || questionnairePassport || "—";
}

function applicantInitials(name: string) {
  return name
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function applicantRoleLabel(role: Submission["applicants"][number]["role"]) {
  if (role === "spouse") return "Супруга";
  if (role === "child") return "Ребенок";
  return "Основной";
}

function applicantVisualStatus(
  submission: Submission,
  applicant: Submission["applicants"][number],
): V19MemberStatusTone {
  const files = submission.files.filter((file) => file.applicantId === applicant.id);

  if (
    applicant.questionnaireStatus === "needs_fix" ||
    files.some((file) => file.status === "missing" || file.status === "needs_replacement")
  ) {
    return "issue";
  }

  if (
    applicant.questionnaireStatus === "empty" ||
    applicant.questionnaireStatus === "partial" ||
    files.some((file) => file.status === "uploaded" || file.status === "pending_review")
  ) {
    return "progress";
  }

  return "ready";
}

function submissionTypeCounts(submissions: Submission[]): Record<V19EntityViewMode, number> {
  const family = submissions.filter((submission) => submission.type === "family").length;
  const single = submissions.filter((submission) => submission.type === "single").length;

  return {
    all: submissions.length,
    family,
    single,
  };
}

function filterByEntityMode(submissions: Submission[], mode: V19EntityViewMode) {
  if (mode === "family") {
    return submissions.filter((submission) => submission.type === "family");
  }

  if (mode === "single") {
    return submissions.filter((submission) => submission.type === "single");
  }

  return submissions;
}

export function AgentSubmissionsScreen({
  activeTab,
  agentList,
  cityFilter = "Все города",
  errorMessage = "",
  hasSearchQuery,
  loading = false,
  onClearFilters,
  onCreate,
  onOpen,
  onRetryError,
  onSelect,
  onTab,
  searchQuery = "",
  searchControl,
  tabCounts,
  totalSubmissionCount,
  visibleSubmission,
}: {
  activeTab: AgentTab;
  agentList: Submission[];
  cityFilter?: string;
  errorMessage?: string;
  hasSearchQuery?: boolean;
  loading?: boolean;
  mobileTitle?: string;
  onClearFilters?: () => void;
  onCreate: () => void;
  onOpen: (submission: Submission, tab?: DrawerTab, target?: WorkspaceTarget) => void;
  onRetryError?: () => void;
  onSelect: (submission: Submission) => void;
  onTab: (tab: AgentTab) => void;
  searchQuery?: string;
  searchControl: ReactNode;
  tabCounts: Record<AgentTab, number>;
  totalSubmissionCount: number;
  visibleSubmission: Submission | null;
  summary: ReturnType<typeof counts>;
}) {
  const [sortMode, setSortMode] = useState<SubmissionSortMode>("priority");
  const [entityMode, setEntityMode] = useState<V19EntityViewMode>("all");
  const hasContextRail = visibleSubmission != null && totalSubmissionCount > 0;
  const railDisclosure = useRailDisclosure({
    defaultOpen: defaultContextRailOpen(),
    enabled: hasContextRail,
    transition: transitionUiState,
  });
  const panelOpen = railDisclosure.open;
  const orderedApplicants = useMemo(
    () => sortSubmissionsForOperations(agentList, sortMode),
    [agentList, sortMode],
  );
  const familySubmissions = orderedApplicants.filter(
    (submission) => submission.type === "family",
  );
  const singleSubmissions = orderedApplicants.filter(
    (submission) => submission.type === "single",
  );
  const entityCounts = submissionTypeCounts(orderedApplicants);
  const profileSubmissions = filterByEntityMode(orderedApplicants, entityMode);
  const agentSortModes: SubmissionSortMode[] = ["priority", "updated", "trip"];
  const agentTabs: Array<{ count: number; id: AgentTab; label: string }> = [
    { count: tabCounts.all, id: "all", label: "Все подачи" },
    { count: tabCounts.action, id: "action", label: "Требуют действия" },
    { count: tabCounts.progress, id: "progress", label: "В работе" },
    { count: tabCounts.review, id: "review", label: "На проверке" },
    { count: tabCounts.done, id: "done", label: "Готово" },
  ];
  const activeTabLabel =
    agentTabs.find((tab) => tab.id === activeTab)?.label ?? "Все подачи";

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const resetHorizontalScroll = () => {
      document
        .querySelectorAll<HTMLElement>(
          ".ops-shell.surface-agent-submissions .workspace, .ops-shell.surface-agent-submissions .v19-collection-panel, .ops-shell.surface-agent-submissions .v19-submission-grouped-list",
        )
        .forEach((element) => {
          element.scrollLeft = 0;
        });
    };

    resetHorizontalScroll();
    const frameId = window.requestAnimationFrame(resetHorizontalScroll);
    return () => window.cancelAnimationFrame(frameId);
  }, [activeTab, orderedApplicants.length, searchQuery, sortMode]);
  const hasCityFilter = cityFilter !== "Все города";
  const hasActiveFilters =
    activeTab !== "all" || hasSearchQuery || hasCityFilter || sortMode !== "priority";
  const activeFilters = compactActiveFilters([
      activeTab !== "all"
        ? {
            id: "status",
            label: activeTabLabel,
            onRemove: () => transitionUiState(() => onTab("all")),
          }
        : null,
      hasSearchQuery && searchQuery.trim()
        ? { id: "search", label: `Поиск: ${searchQuery.trim()}` }
        : null,
      hasCityFilter ? { id: "city", label: `Город: ${cityFilter}` } : null,
      sortMode !== "priority"
        ? {
            id: "sort",
            label: `Сортировка: ${submissionSortModeLabel(sortMode)}`,
            onRemove: () => transitionUiState(() => setSortMode("priority")),
          }
        : null,
    ]);
  const resetActiveFilters = () =>
    transitionUiState(() => {
      setSortMode("priority");
      setEntityMode("all");
      onClearFilters?.();
    });
  function closePanel() {
    railDisclosure.close();
  }

  function togglePanel() {
    railDisclosure.toggle();
  }

  const submissionSortTool = (
    <ToolbarIconButton
      label={`Сортировка: ${submissionSortModeLabel(sortMode)}`}
      icon="sort"
      pressed={sortMode !== "priority"}
      onClick={() =>
        transitionUiState(() =>
          setSortMode((value) => nextSubmissionSortMode(value, agentSortModes)),
        )
      }
    />
  );
  const panelToggleTool = hasContextRail ? (
    <ToolbarIconButton
      label={panelOpen ? "Скрыть контекст" : "Показать контекст"}
      icon="panel"
      pressed={panelOpen}
      onClick={togglePanel}
    />
  ) : null;
  const mobilePanelToggleTool = (
    <div className="v19-mobile-context-tool v19-mobile-toolbar-action-set">
      {submissionSortTool}
      {hasContextRail ? (
        <ToolbarIconButton
          label={panelOpen ? "Скрыть контекст" : "Показать контекст"}
          icon="panel"
          pressed={panelOpen}
          onClick={togglePanel}
        />
      ) : null}
    </div>
  );
  const toolbarTools = (
    <CollectionToolbarTools
      desktopTools={
        <>
          {submissionSortTool}
          {panelToggleTool}
        </>
      }
      mobileContextTool={mobilePanelToggleTool}
      mobileFilter={
      <MobileFilterSheet<AgentTab>
        label="Фильтры подач"
        title="Статус подач"
        options={agentTabs}
        value={activeTab}
        onValueChange={(nextTab) => transitionUiState(() => onTab(nextTab))}
      />
      }
    />
  );
  const openSubmissionFromCard = (submission: Submission) => {
    const action = agentSubmissionCardAction(submission);

    onSelect(submission);
    onOpen(submission, action.tab, action.target);
  };

  function renderSubmissionRow(submission: Submission) {
    const action = agentSubmissionCardAction(submission);
    const issueCount = openIssueCount(submission) + fixedIssueCount(submission);
    const trip = tripDates(submission);

    return (
      <SubmissionCollectionRow
        action={action.label}
        completeness={`${submission.completeness.total}%`}
        extraTagCount={issueCount}
        fileDetail="Файлы"
        fileState={submissionFileStateLabel(submission)}
        fileTone={submissionFileTone(submission)}
        kind={submission.type === "single" ? "single" : "family"}
        key={submission.id}
        meta={applicantCountLabel(submission.applicants.length)}
        onOpen={() => openSubmissionFromCard(submission)}
        routeDetail={trip}
        routeLabel={submission.city}
        searchText={submission.applicants.map((applicant) => applicant.fullName).join(" ")}
        selected={visibleSubmission?.id === submission.id}
        status={submission.status}
        statusDetail={agentSubmissionStatusDetail(submission)}
        statusLabel={statusLabelFor(submission.status)}
        submissionId={submission.id}
        title={formatSubmissionListTitle(submission)}
        trip={trip}
        tripDetail={trip ? "Даты поездки" : undefined}
      />
    );
  }

  function renderSubmissionSection({
    emptyText,
    items,
    title,
  }: {
    emptyText: string;
    items: Submission[];
    title: string;
  }) {
    return (
      <section className="v19-submission-type-section" aria-label={title}>
        <div className="v19-submission-type-label">
          <strong>{title}</strong>
          <span>{items.length}</span>
        </div>
        {items.length ? (
          items.map(renderSubmissionRow)
        ) : (
          <div className="v19-submission-type-empty" role="status">
            {emptyText}
          </div>
        )}
      </section>
    );
  }

  function renderSubmissionProfileCard(submission: Submission) {
    const footerLabel = [submission.city, tripDates(submission)].filter(Boolean).join(" · ");
    const packageLabel = submissionFileStateLabel(submission);

    if (submission.type === "family") {
      return (
        <V19FamilyProfileCard
          dataSubmissionId={submission.id}
          footerLabel={footerLabel}
          key={submission.id}
          members={submission.applicants.map((applicant) => ({
            initials: applicantInitials(applicant.fullName),
            name: applicant.fullName,
            role: applicantRoleLabel(applicant.role),
            statusTone: applicantVisualStatus(submission, applicant),
          }))}
          packageLabel={packageLabel}
          title={formatSubmissionListTitle(submission)}
          totalLabel={`${applicantCountLabel(submission.applicants.length)} · ${statusLabelFor(
            submission.status,
          )}`}
          onMemberOpen={() => openSubmissionFromCard(submission)}
          onOpen={() => openSubmissionFromCard(submission)}
        />
      );
    }

    const applicant = submission.applicants[0];

    return (
      <V19IndividualProfileCard
        dataSubmissionId={submission.id}
        footerLabel={footerLabel}
        initials={applicantInitials(applicant?.fullName ?? submission.title)}
        key={submission.id}
        packageLabel={packageLabel}
        statusLabel={statusLabelFor(submission.status)}
        statusTone={applicant ? applicantVisualStatus(submission, applicant) : "progress"}
        title={applicant?.fullName ?? formatSubmissionListTitle(submission)}
        onOpen={() => openSubmissionFromCard(submission)}
      />
    );
  }

  const railSubmission = visibleSubmission;

  return (
    <>
      <div
        className={`v19-screen-grid v19-submissions-screen ${
          panelOpen ? "" : "is-panel-closed"
        }`}
      >
        <CardComponent
          as="section"
          className="v19-collection-panel v19-agent-submissions-panel"
          aria-labelledby="agent-submissions-title"
        >
          <span className="sr-only" id="agent-submissions-title">
            Мои подачи
          </span>
          <CollectionToolbar<AgentTab>
            activeFilters={activeFilters}
            ariaLabel="Инструменты подач"
            className="v19-agent-mobile-toolbar"
            mobileTitle="Мои подачи"
            onClearActiveFilters={hasActiveFilters ? resetActiveFilters : undefined}
            onTabChange={(nextTab) => transitionUiState(() => onTab(nextTab))}
            search={searchControl}
            tabs={agentTabs}
            tabsAriaLabel="Фильтр подач"
            tools={toolbarTools}
            value={activeTab}
          />
          <V19EntityTypeSwitch
            counts={entityCounts}
            value={entityMode}
            onChange={(mode) => transitionUiState(() => setEntityMode(mode))}
          />

          {loading ? (
            <AgentSubmissionsLoadingState />
          ) : errorMessage ? (
            <AgentSubmissionsErrorState
              message={errorMessage}
              onRetry={onRetryError}
            />
          ) : totalSubmissionCount === 0 ? (
            <div className="v19-submission-empty-state" role="status">
              <h3>Подач пока нет</h3>
              <p>Создайте первую подачу для клиента или семьи.</p>
              <Button type="button" onClick={onCreate}>
                Новая подача
              </Button>
            </div>
          ) : orderedApplicants.length === 0 ? (
            <div className="v19-submission-empty-state is-filtered" role="status">
              <h3>Ничего не найдено</h3>
              <p>
                По текущему поиску и фильтрам подач нет. Сбросьте фильтры или
                измените запрос.
              </p>
              {onClearFilters ? (
                <Button variant="ghost" type="button" onClick={resetActiveFilters}>
                  Сбросить фильтры
                </Button>
              ) : null}
            </div>
          ) : entityMode === "all" ? (
            <div
              className="v19-collection-list v19-submission-grouped-list"
              aria-label="Список подач"
            >
              {renderSubmissionSection({
                emptyText:
                  "Семейных подач нет. По текущему фильтру ничего не найдено.",
                items: familySubmissions,
                title: "Семейные подачи",
              })}
              {renderSubmissionSection({
                emptyText:
                  "Индивидуальных подач нет. По текущему фильтру ничего не найдено.",
                items: singleSubmissions,
                title: "Индивидуальные подачи",
              })}
            </div>
          ) : (
            <div
              className={`v19-submission-profile-stage is-${entityMode}`}
              aria-label={
                entityMode === "family" ? "Семейные карточки" : "Одиночные карточки"
              }
            >
              {profileSubmissions.length ? (
                <div className="v19-submission-profile-grid">
                  {profileSubmissions.map(renderSubmissionProfileCard)}
                </div>
              ) : (
                <div className="v19-submission-type-empty" role="status">
                  {entityMode === "family"
                    ? "Семейных подач нет."
                    : "Индивидуальных подач нет."}
                </div>
              )}
            </div>
          )}
        </CardComponent>
      </div>

      {hasContextRail && panelOpen ? (
        <button className="v19-context-backdrop" type="button" onClick={closePanel}>
          <span className="sr-only">Закрыть контекст</span>
        </button>
      ) : null}

      {hasContextRail && panelOpen && railSubmission ? (
        <AgentSubmissionContextRail
          applicantSummary={applicantCountLabel(railSubmission.applicants.length)}
          fileSummary={submissionFileStateLabel(railSubmission)}
          history={railSubmission.history}
          issues={railSubmission.issues
            .filter((issue) => issue.status === "open")
            .slice(0, 4)
            .map((issue) => ({
              id: issue.id,
              reason: issue.reason,
              targetLine: issueTargetLine(issue),
              tone: issue.severity === "blocker" ? "danger" : "warning",
              onOpen: () => {
                onOpen(
                  railSubmission,
                  drawerTabForIssue(issue),
                  targetForIssue(issue),
                );
              },
            }))}
          openIssueCount={openIssueCount(railSubmission)}
          showHeader
          submission={railSubmission}
          tripSummary={tripDates(railSubmission)}
          onClose={closePanel}
          onOpenTab={(tab) => {
            const target = targetForSubmissionTab(railSubmission, tab);

            onOpen(railSubmission, drawerTabForScreenTarget(target, tab), target);
          }}
        />
      ) : null}
    </>
  );
}

function AgentSubmissionsLoadingState() {
  return (
    <div className="v19-submission-skeleton-list" aria-label="Загрузка подач">
      {Array.from({ length: 4 }).map((_, index) => (
        <div
          aria-hidden="true"
          className="v19-submission-skeleton-row"
          key={index}
        >
          <span />
          <span />
          <span />
        </div>
      ))}
    </div>
  );
}

function AgentSubmissionsErrorState({
  message,
  onRetry,
}: {
  message: string;
  onRetry?: () => void;
}) {
  return (
    <div className="v19-submission-empty-state is-error" role="alert">
      <h3>Не удалось сохранить изменения</h3>
      <p>{message}</p>
      {onRetry ? (
        <Button type="button" onClick={onRetry}>
          Повторить
        </Button>
      ) : (
        <Button
          disabled
          title="Повтор доступен после подключения удалённого рабочего пространства."
          type="button"
        >
          Повторить
        </Button>
      )}
    </div>
  );
}

function agentSubmissionCardAction(submission: Submission): {
  label: string;
  tab: DrawerTab;
  target?: WorkspaceTarget;
} {
  if (submission.status === "returned" || submission.status === "requires_action") {
    const target = targetForSubmissionTab(submission, "issues");
    return {
      label: "Исправить",
      tab: drawerTabForScreenTarget(target, "issues"),
      target,
    };
  }

  if (submission.status === "draft" || submission.status === "in_progress") {
    const fallback = defaultDrawerTab(submission);
    const target = targetForSubmissionTab(submission, fallback);
    return {
      label: "Продолжить",
      tab: drawerTabForScreenTarget(target, fallback),
      target,
    };
  }

  if (
    submission.status === "submitted_for_review" ||
    submission.status === "corrections_received"
  ) {
    return {
      label: "Проверить",
      tab: "history",
    };
  }

  if (submission.status === "ready_for_export") {
    return {
      label: "Пакет",
      tab: "overview",
    };
  }

  return {
    label: "Открыть",
    tab: "history",
  };
}

function agentSubmissionStatusDetail(submission: Submission) {
  const blockerTotal = blockerCount(submission);
  const openTotal = openIssueCount(submission);
  const fixedTotal = fixedIssueCount(submission);
  const fileState = submissionFileStateLabel(submission);

  if (blockerTotal > 0) {
    return `${blockerTotal} ${pluralRu(
      blockerTotal,
      "блокер",
      "блокера",
      "блокеров",
    )} · ${fileState}`;
  }

  if (openTotal > 0) {
    return `${openTotal} ${pluralRu(
      openTotal,
      "замечание",
      "замечания",
      "замечаний",
    )} · ${fileState}`;
  }

  if (fixedTotal > 0) {
    return `${fixedTotal} ${pluralRu(
      fixedTotal,
      "исправление",
      "исправления",
      "исправлений",
    )} ждут проверки`;
  }

  return nextProblem(submission);
}

function submissionFileTone(submission: Submission): "amber" | "muted" | "teal" {
  if (!submission.files.length) return "muted";
  if (
    submission.files.some(
      (file) => file.status === "missing" || file.status === "needs_replacement",
    )
  ) {
    return "amber";
  }
  return "teal";
}
function submissionFileStateLabel(submission: Submission) {
  const ready = submission.files.filter(
    (file) => file.status !== "missing" && file.status !== "needs_replacement",
  ).length;

  return `${ready} из ${submission.files.length}`;
}

function primarySubmissionIssue(submission: Submission) {
  return (
    submission.issues.find(
      (issue) => issue.status === "open" && issue.severity === "blocker",
    ) ??
    submission.issues.find((issue) => issue.status === "open") ??
    null
  );
}

function drawerTabForIssue(issue: Submission["issues"][number]): DrawerTab {
  if (issue.target.fileType) return "files";
  if (issue.target.field || issue.target.section) return "questionnaire";
  return "issues";
}

function issueTargetLine(issue: Submission["issues"][number]) {
  return [
    issue.target.applicantName,
    issue.target.fileType ? "Файлы" : "Анкета",
    issue.target.section,
    issue.target.field ? `поле ${issue.target.field}` : null,
  ]
    .filter(Boolean)
    .join(" · ");
}

export type AdminWorkTab = "review" | "corrections" | "events";
type SubmissionSortMode = "priority" | "updated" | "created" | "trip";

const adminSortModes: SubmissionSortMode[] = ["priority", "updated", "created", "trip"];
const exportSortModes: SubmissionSortMode[] = ["updated", "created", "trip"];

function nextSubmissionSortMode(
  current: SubmissionSortMode,
  modes: SubmissionSortMode[],
) {
  const currentIndex = modes.indexOf(current);
  return modes[(currentIndex + 1) % modes.length] ?? modes[0] ?? current;
}

function submissionSortModeLabel(mode: SubmissionSortMode) {
  if (mode === "priority") return "приоритет";
  if (mode === "updated") return "обновление";
  if (mode === "created") return "создание";
  return "дата поездки";
}

function sortSubmissionsForOperations(
  submissions: Submission[],
  mode: SubmissionSortMode,
) {
  if (mode === "priority") return submissions;

  return [...submissions].sort((left, right) => {
    if (mode === "trip") {
      return (
        sortableDateValue(left.tripDateFrom) - sortableDateValue(right.tripDateFrom) ||
        sortableDateValue(left.tripDateTo) - sortableDateValue(right.tripDateTo) ||
        left.id.localeCompare(right.id)
      );
    }

    const leftValue =
      mode === "created"
        ? sortableDateValue(left.createdAt)
        : sortableDateValue(left.updatedAt);
    const rightValue =
      mode === "created"
        ? sortableDateValue(right.createdAt)
        : sortableDateValue(right.updatedAt);

    return rightValue - leftValue || left.id.localeCompare(right.id);
  });
}

function sortableDateValue(value: string) {
  const trimmed = value.trim();
  const dotted = trimmed.match(/^(\d{2})\.(\d{2})(?:\.(\d{4}))?$/);
  if (dotted) {
    const day = Number(dotted[1]);
    const month = Number(dotted[2]);
    const year = Number(dotted[3] ?? "2026");
    return year * 10_000 + month * 100 + day;
  }

  const parsed = Date.parse(trimmed);
  return Number.isNaN(parsed) ? 0 : parsed;
}

export function AdminReviewScreen({
  error = "",
  filterControl,
  inboxEvents,
  loading = false,
  onAddIssue,
  onOpen,
  onSelect,
  onTab,
  permissionDenied = false,
  reviewList,
  reviewSource,
  reviewTab,
  searchControl,
  visibleSubmission,
}: {
  error?: string;
  filterControl?: ReactNode;
  inboxEvents: InboxEvent[];
  loading?: boolean;
  onAddIssue: (submission: Submission) => void;
  onOpen: (submission: Submission, tab?: DrawerTab) => void;
  onSelect: (submission: Submission) => void;
  onTab: (tab: AdminWorkTab) => void;
  permissionDenied?: boolean;
  reviewList: Submission[];
  reviewSource: Submission[];
  reviewTab: AdminWorkTab;
  searchControl: ReactNode;
  visibleSubmission: Submission | null;
}) {
  const [blockersOnly, setBlockersOnly] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [sortMode, setSortMode] = useState<SubmissionSortMode>("priority");
  const summaryRef = useRef<HTMLDivElement>(null);
  const reviewQueue = reviewSource.filter(matchesReviewTab("review"));
  const correctionsQueue = reviewSource.filter(matchesReviewTab("corrections"));
  const tabCounts = {
    corrections: correctionsQueue.length,
    events: inboxEvents.length,
    review: reviewQueue.length,
  };
  const blockerSubmissions = reviewSource.filter(
    (submission) => blockerCount(submission) > 0,
  ).length;
  const filteredReviewList = useMemo(
    () =>
      blockersOnly
        ? reviewList.filter((submission) => blockerCount(submission) > 0)
        : reviewList,
    [blockersOnly, reviewList],
  );
  const filteredEvents = useMemo(
    () =>
      blockersOnly
        ? inboxEvents.filter((event) => blockerCount(event.submission) > 0)
        : inboxEvents,
    [blockersOnly, inboxEvents],
  );
  const visibleReviewList = useMemo(
    () => sortSubmissionsForOperations(filteredReviewList, sortMode),
    [filteredReviewList, sortMode],
  );
  const visibleEvents = useMemo(() => filteredEvents, [filteredEvents]);
  const visibleSelectedSubmission =
    visibleSubmission &&
    visibleReviewList.some((submission) => submission.id === visibleSubmission.id)
      ? visibleSubmission
      : null;
  const summaryPrioritySubmission =
    visibleSelectedSubmission ??
    visibleReviewList[0] ??
    correctionsQueue[0] ??
    reviewQueue[0] ??
    reviewSource[0] ??
    null;
  const actionSubmission =
    reviewTab === "events" || permissionDenied || loading || error
      ? null
      : (visibleSelectedSubmission ?? visibleReviewList[0] ?? null);
  const addIssueGuard = actionSubmission
    ? adminIssueGuard(actionSubmission, "admin")
    : null;
  const canAddIssue = addIssueGuard?.ok === true;
  const addIssueReason = canAddIssue
    ? ""
    : (addIssueGuard?.reason ?? "В этой вкладке нет видимой подачи для действия.");
  const activeFilters = compactActiveFilters([
      blockersOnly
        ? {
            id: "blockers",
            label: "Только блокеры",
            onRemove: () => transitionUiState(() => setBlockersOnly(false)),
          }
        : null,
      reviewTab === "events" || sortMode === "priority"
        ? null
        : {
            id: "sort",
            label: `Сортировка: ${submissionSortModeLabel(sortMode)}`,
            onRemove: () => transitionUiState(() => setSortMode("priority")),
          },
    ]);
  const resetActiveFilters = () =>
    transitionUiState(() => {
      setBlockersOnly(false);
      setSortMode("priority");
    });

  useEffect(() => {
    if (!summaryOpen) return;

    const closeOnPointerDown = (event: PointerEvent) => {
      if (!summaryRef.current?.contains(event.target as Node)) {
        setSummaryOpen(false);
      }
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSummaryOpen(false);
    };

    document.addEventListener("pointerdown", closeOnPointerDown);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [summaryOpen]);

  const toolbarTools = (
    <CollectionToolbarTools
      desktopTools={
        <>
          <ToolbarIconButton
            label={blockersOnly ? "Фильтр: только блокеры" : "Фильтр: все подачи"}
            icon="filter"
            pressed={blockersOnly}
            onClick={() => transitionUiState(() => setBlockersOnly((value) => !value))}
          />
          {reviewTab !== "events" ? (
            <ToolbarIconButton
              label={`Сортировка: ${submissionSortModeLabel(sortMode)}`}
              icon="sort"
              pressed={sortMode !== "priority"}
              onClick={() =>
                transitionUiState(() =>
                  setSortMode((value) => nextSubmissionSortMode(value, adminSortModes)),
                )
              }
            />
          ) : null}
          <div className="v17-admin-summary-tool" ref={summaryRef}>
            <ToolbarIconButton
              label={summaryOpen ? "Скрыть сводку" : "Показать сводку"}
              icon="panel"
              pressed={summaryOpen}
              onClick={() => setSummaryOpen((value) => !value)}
            />
            {summaryOpen ? (
              <div
                className="v17-admin-summary-popover"
                role="dialog"
                aria-label="Сводка очереди"
              >
                <div className="v17-admin-summary-head">
                  <strong>Сводка очереди</strong>
                </div>
                <div className="v17-admin-summary-grid">
                  <div>
                    <strong>{tabCounts.review}</strong>
                    <span>Новая проверка</span>
                  </div>
                  <div>
                    <strong>{tabCounts.corrections}</strong>
                    <span>Исправления</span>
                  </div>
                  <div>
                    <strong>
                      {summaryPrioritySubmission
                        ? `с ${summaryPrioritySubmission.updatedAt}`
                        : "-"}
                    </strong>
                    <span>Старейшая</span>
                  </div>
                  <div>
                    <strong>{blockerSubmissions}</strong>
                    <span>Блокеры</span>
                  </div>
                </div>
                {summaryPrioritySubmission ? (
                  <Button
                    className="v17-admin-summary-action"
                    variant="secondary"
                    onClick={() => {
                      setSummaryOpen(false);
                      onSelect(summaryPrioritySubmission);
                      onOpen(
                        summaryPrioritySubmission,
                        adminWorkDrawerTabFor(summaryPrioritySubmission),
                      );
                    }}
                  >
                    Проверить {summaryPrioritySubmission.title}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </div>
        </>
      }
    />
  );

  const renderBlockedState = (
    title: string,
    description: string,
    tone: "danger" | "warning" = "warning",
  ) => <AdminWorkEmptyState description={description} iconTone={tone} title={title} />;

  return (
    <div className="v19-screen-grid v19-admin-review-screen v17-admin-work-screen is-panel-closed">
      <CardComponent
        as="section"
        className={
          activeFilters.length
            ? "v19-collection-panel has-active-filters"
            : "v19-collection-panel"
        }
        aria-labelledby="review-title"
      >
        <h2 id="review-title" className="sr-only">
          Очередь администратора
        </h2>

        <CollectionToolbar
          activeFilters={activeFilters}
          ariaLabel="Инструменты работы администратора"
          cityControl={filterControl}
          className="v17-admin-work-toolbar"
          onClearActiveFilters={activeFilters.length ? resetActiveFilters : undefined}
          onTabChange={(nextTab) => transitionUiState(() => onTab(nextTab))}
          search={searchControl}
          tabs={[
            { count: tabCounts.review, id: "review", label: "К проверке" },
            {
              count: tabCounts.corrections,
              id: "corrections",
              label: "Исправления",
            },
            { count: tabCounts.events, id: "events", label: "События" },
          ]}
          tabsAriaLabel="Рабочая очередь администратора"
          tools={toolbarTools}
          value={reviewTab}
        />

        <div className="v17-admin-work-note">
          <span>{adminWorkNoteCopy(reviewTab)}</span>
        </div>

        {permissionDenied ? (
          renderBlockedState(
            "Нет доступа к проверке",
            "Текущая роль не может выполнять административную проверку подач.",
            "danger",
          )
        ) : loading ? (
          <AdminWorkLoadingState />
        ) : error ? (
          renderBlockedState("Очередь недоступна", error, "danger")
        ) : reviewTab === "events" ? (
          visibleEvents.length ? (
            <div className="v17-admin-event-list" aria-label="События администратора">
              {visibleEvents.map((event) => (
                <AdminWorkEventRow
                  event={event}
                  key={event.id}
                  onOpen={() => {
                    onSelect(event.submission);
                    onOpen(event.submission, event.tab);
                  }}
                />
              ))}
            </div>
          ) : (
            <AdminWorkEmptyState
              description="События появятся после отправки подачи, получения исправлений или подготовки пакета."
              actionLabel="К проверке"
              title="Событий нет"
              onShow={() => onTab("review")}
            />
          )
        ) : visibleReviewList.length ? (
          <>
            <div className="v17-admin-work-list" aria-label="Очередь проверки">
              {visibleReviewList.map((submission) => (
                <AdminWorkRow
                  selected={visibleSelectedSubmission?.id === submission.id}
                  key={submission.id}
                  submission={submission}
                  onOpen={() => {
                    onSelect(submission);
                    onOpen(submission, adminWorkDrawerTabFor(submission));
                  }}
                />
              ))}
            </div>
          </>
        ) : (
          <AdminWorkEmptyState
            description="Новые задачи появятся после отправки подачи агентом или получения исправлений."
            actionLabel="Открыть соседнюю очередь"
            title="Очередь пуста"
            onShow={() => onTab(reviewTab === "review" ? "corrections" : "review")}
          />
        )}
        {actionSubmission ? (
          <div className="v17-admin-primary-action">
            <span>{adminReviewPriorityLine(actionSubmission)}</span>
            <Button
              aria-describedby={!canAddIssue ? "admin-return-disabled-note" : undefined}
              disabled={!canAddIssue}
              variant="secondary"
              onClick={() => onAddIssue(actionSubmission)}
            >
              Вернуть с замечанием
            </Button>
            {!canAddIssue ? (
              <em id="admin-return-disabled-note">{addIssueReason}</em>
            ) : null}
          </div>
        ) : null}
      </CardComponent>
    </div>
  );
}

function adminReviewPriorityLine(submission: Submission) {
  const blockers = blockerCount(submission);
  if (blockers > 0) return `${blockers} блокера ждут точного решения`;

  const open = openIssueCount(submission);
  if (open > 0) return `${open} замечания открыты`;

  return `${statusLabels[submission.status]} · обновлено ${submission.updatedAt}`;
}

function adminWorkNoteCopy(reviewTab: AdminWorkTab) {
  if (reviewTab === "events") return "События открывают точный контекст подачи";
  if (reviewTab === "corrections") return "Сначала исправления, затем новые проверки";
  return "Очередь отсортирована по времени ожидания";
}

function AdminWorkLoadingState() {
  return (
    <div
      className="v17-admin-work-list"
      aria-busy="true"
      aria-label="Очередь загружается"
    >
      {["admin-loading-1", "admin-loading-2", "admin-loading-3"].map((item) => (
        <div className="v17-admin-work-row is-loading" key={item}>
          <span className="v17-admin-entity-icon" aria-hidden="true" />
          <span className="v17-admin-identity">
            <strong />
            <em />
          </span>
          <span className="v17-admin-route-cell" />
          <span className="v17-admin-wait-cell" />
          <span className="v17-admin-readiness-cell" />
          <span className="v17-admin-stage" />
          <span className="v17-admin-row-action" />
        </div>
      ))}
    </div>
  );
}

function AdminWorkEmptyState({
  actionLabel,
  description,
  iconTone = "warning",
  onShow,
  title,
}: {
  actionLabel?: string;
  description: string;
  iconTone?: "danger" | "warning";
  onShow?: () => void;
  title: string;
}) {
  return (
    <div className={`v19-empty-state v17-admin-empty-state tone-${iconTone}`}>
      <span className="v17-admin-empty-icon" aria-hidden="true">
        <SvgIcon>
          <path d="m5 12 4 4L19 6" />
        </SvgIcon>
      </span>
      <h3>{title}</h3>
      <p>{description}</p>
      {onShow ? (
        <Button variant="secondary" onClick={onShow}>
          {actionLabel ?? "Открыть очередь"}
        </Button>
      ) : null}
    </div>
  );
}

function AdminWorkRow({
  onOpen,
  selected,
  submission,
}: {
  onOpen: () => void;
  selected: boolean;
  submission: Submission;
}) {
  const presentation = adminWorkPresentation(submission);
  const family = submission.type === "family";

  return (
    <button
      aria-current={selected ? "true" : undefined}
      className={`v17-admin-work-row ${selected ? "is-selected" : ""}`}
      data-submission-card
      data-submission-id={submission.id}
      type="button"
      onClick={onOpen}
    >
      <span
        className={`v17-admin-entity-icon tone-${presentation.tone}`}
        aria-hidden="true"
      >
        <SvgIcon>
          {family ? (
            <>
              <circle cx="9" cy="8" r="3" />
              <path d="M3 20a6 6 0 0 1 12 0" />
              <circle cx="17" cy="9" r="2.5" />
              <path d="M15 15a5 5 0 0 1 6 5" />
            </>
          ) : (
            <>
              <circle cx="12" cy="8" r="4" />
              <path d="M5 21a7 7 0 0 1 14 0" />
            </>
          )}
        </SvgIcon>
      </span>
      <span className="v17-admin-identity">
        <strong>{formatSubmissionListTitle(submission)}</strong>
        <em>
          <span className="mono">{submission.id}</span> ·{" "}
          {applicantCountLabel(submission.applicants.length)}
        </em>
        <small className="v17-admin-mobile-meta">
          {submission.city} · {applicantCountLabel(submission.applicants.length)} · ждет
          с {submission.updatedAt}
        </small>
      </span>
      <span className="v17-admin-route-cell">
        <em>Подача</em>
        <strong>{submission.city}</strong>
        <small>{tripDates(submission)}</small>
      </span>
      <span className="v17-admin-wait-cell">
        <em>Ожидает</em>
        <strong>{adminWorkWaitLabel(submission)}</strong>
      </span>
      <span className="v17-admin-readiness-cell">
        <span>
          <em>Готовность</em>
          <strong>{submission.completeness.total}%</strong>
        </span>
        <ProgressMeter
          ariaHidden
          className="v17-admin-readiness-progress"
          value={submission.completeness.total}
        />
      </span>
      <span className={`v17-admin-stage tone-${presentation.tone}`}>
        <i aria-hidden="true" />
        {presentation.stage}
      </span>
      <span className="v17-admin-row-action">
        <span>{adminWorkActionLabel(submission, presentation.actionLabel)}</span>
        <SvgIcon>
          <path d="m9 6 6 6-6 6" />
        </SvgIcon>
      </span>
    </button>
  );
}

function adminWorkActionLabel(submission: Submission, fallback: string) {
  if (submission.status === "submitted_for_review") return "Проверить";
  return fallback;
}

function adminWorkWaitLabel(submission: Submission) {
  if (submission.status === "submitted_for_review") return "6 ч";
  if (submission.status === "corrections_received") return "3 ч";
  if (submission.status === "ready_for_export") return "4 ч";
  return submission.updatedAt;
}

function AdminWorkEventRow({
  event,
  onOpen,
}: {
  event: InboxEvent;
  onOpen: () => void;
}) {
  return (
    <button className="v17-admin-event-row" type="button" onClick={onOpen}>
      <span className={`v17-admin-event-dot tone-${event.tone}`} aria-hidden="true" />
      <span className="v17-admin-event-copy">
        <strong>{adminWorkEventTitle(event.submission, event.title)}</strong>
        <em>{event.time}</em>
      </span>
      <span className="v17-admin-event-object">
        <strong>{formatSubmissionListTitle(event.submission)}</strong>
        <em>{event.context}</em>
      </span>
      <span className={`v17-admin-stage tone-${adminToneName(event.tone)}`}>
        <i aria-hidden="true" />
        {event.badge}
      </span>
      <span className="v17-admin-row-action">
        <span>{event.action}</span>
        <SvgIcon>
          <path d="m9 6 6 6-6 6" />
        </SvgIcon>
      </span>
    </button>
  );
}

function adminToneName(tone: InboxEvent["tone"]) {
  if (tone === "danger") return "danger";
  if (tone === "teal") return "success";
  if (tone === "blue") return "info";
  if (tone === "amber") return "warning";
  return "info";
}

function exportTripDates(submission: Submission) {
  const monthNames: Record<string, string> = {
    "01": "янв",
    "02": "фев",
    "03": "мар",
    "04": "апр",
    "05": "мая",
    "06": "июн",
    "07": "июл",
    "08": "авг",
    "09": "сен",
    "10": "окт",
    "11": "ноя",
    "12": "дек",
  };
  const [fromDay, fromMonth] = submission.tripDateFrom.split(".");
  const [toDay, toMonth] = submission.tripDateTo.split(".");
  const month = monthNames[toMonth ?? fromMonth] ?? toMonth ?? fromMonth;

  if (!fromDay || !toDay || !month) return tripDates(submission);
  return `${fromDay}-${toDay} ${month} 2026`;
}

function ExportGuardItem({
  detail,
  label,
  ok,
}: {
  detail?: string;
  label: string;
  ok: boolean;
}) {
  return (
    <div className={`v17-export-check ${ok ? "is-ok" : "is-fail"}`}>
      <SvgIcon>
        {ok ? (
          <path d="m5 12 4 4L19 6" />
        ) : (
          <>
            <path d="M6 6l12 12" />
            <path d="M18 6 6 18" />
          </>
        )}
      </SvgIcon>
      <span>
        <strong>{label}</strong>
        {detail ? <small>{detail}</small> : null}
      </span>
    </div>
  );
}

export function ExportScreen({
  exportBusy = false,
  exportError = "",
  exportPlan,
  exportTab,
  filterControl,
  historyList,
  onDownload,
  onGenerate,
  onMarkExported,
  onOpen,
  onTab,
  onToggle,
  readyList,
  searchControl,
  selectedExportIds,
}: {
  exportBusy?: boolean;
  exportError?: string;
  exportPlan: ExportSummary;
  exportTab: ExportTab;
  filterControl?: ReactNode;
  historyList: Submission[];
  onDownload: () => void;
  onGenerate: () => void;
  onMarkExported: () => void;
  onOpen: (submission: Submission, tab?: DrawerTab) => void;
  onTab: (tab: ExportTab) => void;
  onToggle: (id: string) => void;
  readyList: Submission[];
  searchControl: ReactNode;
  selectedExportIds: string[];
}) {
  const actionHint =
    exportError ||
    (exportBusy ? "Формируем и проверяем Excel-файл..." : exportActionHint(exportPlan));
  const packageFacts = exportPackageFacts(exportPlan);
  const previewColumns = exportPlan.preview.headers.slice(0, 9);
  const previewRows = exportPlan.preview.rows.slice(0, 4);
  const mappingAudit = buildExportMappingAudit(exportPlan.preview);
  const mappingRows = mappingAudit.rows;
  const mappedCount = mappingAudit.mappedCount;
  const derivedCount = mappingAudit.derivedCount;
  const unresolvedCount = mappingAudit.unresolvedCount;
  const [exportPanelOpen, setExportPanelOpen] = useState(true);
  const [sortMode, setSortMode] = useState<SubmissionSortMode>("updated");
  const [entityMode, setEntityMode] = useState<V19EntityViewMode>("all");
  const selectedExportIdSet = useMemo(
    () => new Set(selectedExportIds),
    [selectedExportIds],
  );
  const exportReadyList = useMemo(
    () => readyList.filter(isSubmissionSelectableForExport),
    [readyList],
  );
  const sortedReadyList = useMemo(
    () => sortSubmissionsForOperations(exportReadyList, sortMode),
    [exportReadyList, sortMode],
  );
  const sortedHistoryList = useMemo(
    () => sortSubmissionsForOperations(historyList, sortMode),
    [historyList, sortMode],
  );
  const visibleReadyList = useMemo(
    () => filterByEntityMode(sortedReadyList, entityMode),
    [entityMode, sortedReadyList],
  );
  const visibleHistoryList = useMemo(
    () => filterByEntityMode(sortedHistoryList, entityMode),
    [entityMode, sortedHistoryList],
  );
  const visibleExportTypeCounts = submissionTypeCounts(
    exportTab === "ready" ? sortedReadyList : sortedHistoryList,
  );
  const visibleReadyIdSet = useMemo(
    () => new Set(visibleReadyList.map((submission) => submission.id)),
    [visibleReadyList],
  );
  const selectedVisibleExportIds = selectedExportIds.filter((id) =>
    visibleReadyIdSet.has(id),
  );
  const selectedSubmissionCount = new Set(
    exportPlan.rows.map((row) => row.submissionId),
  ).size;
  const hiddenNotReadyCount = readyList.length - exportReadyList.length;
  const allReadySelected =
    visibleReadyList.length > 0 &&
    visibleReadyList.every((submission) => selectedExportIdSet.has(submission.id));
  const handleToggleAllReady = (checked: boolean) => {
    visibleReadyList.forEach((submission) => {
      const selected = selectedExportIdSet.has(submission.id);
      if (checked !== selected) onToggle(submission.id);
    });
  };
  const toolbarTools = (
    <CollectionToolbarTools
      desktopTools={
        <>
          <ToolbarIconButton
            icon="sort"
            label={`Сортировка выгрузки: ${submissionSortModeLabel(sortMode)}`}
            pressed={sortMode !== "updated"}
            type="button"
            onClick={() =>
              setSortMode((value) => nextSubmissionSortMode(value, exportSortModes))
            }
          />
          <ToolbarIconButton
            icon="panel"
            label={
              exportPanelOpen
                ? "Контракт выгрузки открыт"
                : "Открыть контракт выгрузки"
            }
            pressed={exportPanelOpen}
            type="button"
            onClick={() => setExportPanelOpen((open) => !open)}
          />
        </>
      }
    />
  );

  return (
    <>
      <div className="export-grid magic-export-stage">
        <CardComponent
          as="section"
          className="submission-panel magic-export-queue"
          aria-labelledby="export-title"
        >
          <h2 id="export-title" className="sr-only">
            Пакеты для Excel
          </h2>

          <div className="v17-export-intro">
            <span>
              Предпросмотр показывает строки будущего Excel-файла. Файл создаётся только
              после проверки выбранного пакета.
            </span>
            <strong>{exportPlan.contract.columnCount} колонок в шаблоне</strong>
          </div>

          <CollectionToolbar
            ariaLabel="Инструменты выгрузки"
            cityControl={filterControl}
            className="v19-export-toolbar"
            onTabChange={onTab}
            search={searchControl}
            tabs={[
              { count: exportReadyList.length, id: "ready", label: "Готово" },
              { count: sortedHistoryList.length, id: "history", label: "История" },
            ]}
            tabsAriaLabel="Состояние выгрузки"
            tools={toolbarTools}
            value={exportTab}
          />
          <V19EntityTypeSwitch
            counts={visibleExportTypeCounts}
            value={entityMode}
            onChange={(mode) => setEntityMode(mode)}
          />
          {exportTab === "ready" ? (
            <div className="magic-export-list export-contract-table">
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th className="export-select-column">
                        <input
                          aria-label="Выбрать все совместимые"
                          checked={allReadySelected}
                          className="checkbox"
                          disabled={exportBusy || visibleReadyList.length === 0}
                          type="checkbox"
                          onChange={(event) =>
                            handleToggleAllReady(event.currentTarget.checked)
                          }
                        />
                      </th>
                      <th>Подача</th>
                      <th>Город</th>
                      <th>Даты</th>
                      <th>Заявители</th>
                      <th>Состояние</th>
                      <th>Обновлено</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleReadyList.map((submission) => {
                      const selected = selectedExportIdSet.has(submission.id);

                      return (
                        <tr
                          aria-label={`Пакет ${submission.title}${
                            selected ? ", выбран" : ""
                          }`}
                          className={`export-row magic-export-row export-contract-row ${
                            selected ? "selected is-selected" : ""
                          }`}
                          key={submission.id}
                          onClick={() => onOpen(submission)}
                        >
                          <td onClick={(event) => event.stopPropagation()}>
                            <input
                              aria-label={`Выбрать ${submission.title}`}
                              checked={selected}
                              className="checkbox"
                              disabled={exportBusy}
                              type="checkbox"
                              onChange={() => onToggle(submission.id)}
                            />
                          </td>
                          <td>
                            <button
                              className="export-row-main"
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                onOpen(submission);
                              }}
                            >
                              <span className="cell-title">{submission.title}</span>
                              <span className="subtle mono">{submission.id}</span>
                            </button>
                            <Button
                              className="export-table-row-action export-table-row-action-mobile"
                              variant="secondary"
                              onClick={(event) => {
                                event.stopPropagation();
                                onOpen(submission);
                              }}
                            >
                              Смотреть пакет
                            </Button>
                          </td>
                          <td>{submission.city}</td>
                          <td>{exportTripDates(submission)}</td>
                          <td>{submission.applicants.length}</td>
                          <td>
                            <Badge className="html-builder-badge" tone="teal">
                              {exportStateLabel(submission)}
                            </Badge>
                          </td>
                          <td>
                            <span>{submission.updatedAt}</span>
                            <Button
                              className="export-table-row-action"
                              variant="secondary"
                              onClick={(event) => {
                                event.stopPropagation();
                                onOpen(submission);
                              }}
                            >
                              Смотреть пакет
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {hiddenNotReadyCount > 0 ? (
                <div className="bulk-bar v17-export-bulk-bar">
                  <span className="bulk-status">
                    Скрыто из выгрузки: {hiddenNotReadyCount}{" "}
                    {pluralRu(hiddenNotReadyCount, "подача", "подачи", "подач")} с
                    проблемами в статусе, файлах или датах.
                  </span>
                </div>
              ) : null}
              {visibleReadyList.length === 0 ? (
                <EmptyState text="Нет подач готовых к выгрузке." />
              ) : null}
              {selectedVisibleExportIds.length ? (
                <div className="bulk-bar v17-export-bulk-bar is-passive">
                  <span className="bulk-count">Выбрано: {selectedSubmissionCount}</span>
                  <span className="bulk-status">{actionHint}</span>
                </div>
              ) : (
                <div className="bulk-bar v17-export-bulk-bar is-blocked">
                  <span className="bulk-count">Выбрано: 0</span>
                  <span className="bulk-status">Выберите хотя бы одну подачу</span>
                </div>
              )}
            </div>
          ) : (
            <div className="magic-export-list export-contract-table export-history-table">
              <div className="table-wrap">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th>Подача</th>
                      <th>Город</th>
                      <th>Даты</th>
                      <th>Заявители</th>
                      <th>PDF</th>
                      <th>Действие</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleHistoryList.map((submission) => {
                      const pdfState = returnedPdfPackageSummary(submission);

                      return (
                        <tr
                          aria-label={`Выгруженный пакет ${submission.title}`}
                          className="export-row magic-export-row export-contract-row export-history-row"
                          key={submission.id}
                        >
                          <td>
                            <button
                              className="export-row-main"
                              type="button"
                              onClick={() => onOpen(submission, "files")}
                            >
                              <span className="cell-title">{submission.title}</span>
                              <span className="subtle mono">{submission.id}</span>
                            </button>
                          </td>
                          <td>{submission.city}</td>
                          <td>{tripDates(submission)}</td>
                          <td>{submission.applicants.length}</td>
                          <td>
                            <Badge tone={pdfState.tone}>{pdfState.label}</Badge>
                            <span className="export-row-note">{pdfState.detail}</span>
                          </td>
                          <td>
                            <Button
                              className="export-table-row-action"
                              variant="secondary"
                              onClick={() => onOpen(submission, "files")}
                            >
                              Открыть пакет
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {visibleHistoryList.length === 0 ? (
                <EmptyState text="История выгрузки пока пуста." />
              ) : null}
            </div>
          )}
        </CardComponent>

        {exportPanelOpen ? (
          <aside
            className="export-side magic-export-side v17-export-context-rail"
            aria-label="Контекст выгрузки"
          >
            <div className="v17-export-rail-head">
              <div>
                <p className="kicker">Контракт выгрузки</p>
                <h2>
                  Excel · {exportPlan.contract.sheetName} {exportPlan.contract.range}
                </h2>
              </div>
              <button
                className="icon-button v17-export-close"
                type="button"
                aria-label="Закрыть панель"
                onClick={() => setExportPanelOpen(false)}
              >
                <SvgIcon>
                  <path d="M6 6l12 12M18 6 6 18" />
                </SvgIcon>
              </button>
            </div>
            <div className="v17-export-rail-body">
              <CardComponent as="section" className="v17-rail-card primary">
                <div className="preview-header">
                  <div>
                    <p className="kicker">Текущий пакет</p>
                    <h2>{exportPackageTitle(exportPlan)}</h2>
                  </div>
                </div>
                <div className="v17-export-summary">
                  <div className="v17-export-stat">
                    <strong>{mappedCount}</strong>
                    <span>связано</span>
                  </div>
                  <div className="v17-export-stat">
                    <strong>{unresolvedCount}</strong>
                    <span>не сопоставлено</span>
                  </div>
                </div>
              </CardComponent>
              <CardComponent
                as="section"
                className="v17-rail-card v17-export-checks-card"
              >
                <p className="kicker">Проверки перед выгрузкой</p>
                <div
                  className="v17-export-checks"
                  aria-label="Проверки перед выгрузкой"
                >
                  <ExportGuardItem
                    ok={exportPlan.rowCount > 0}
                    label="Есть выбранные подачи"
                  />
                  <ExportGuardItem
                    ok={!exportHasBlocker(exportPlan, "не готовые к выгрузке")}
                    label="Только принятые подачи"
                  />
                  <ExportGuardItem
                    ok={!exportHasBlocker(exportPlan, "блокирующие замечания")}
                    label="Нет открытых блокеров"
                  />
                  <ExportGuardItem
                    ok={!exportHasBlocker(exportPlan, "канонического пакета медиа")}
                    label="Обязательные файлы готовы"
                  />
                  <ExportGuardItem
                    ok={!exportHasBlocker(exportPlan, "разные города")}
                    label="Один город"
                    detail={`${packageFacts.city} · ${packageFacts.dates}`}
                  />
                  <ExportGuardItem
                    ok={exportPlan.contract.valid && unresolvedCount === 0}
                    label="Все 56 колонок подтверждены"
                    detail={`${exportPlan.contract.sheetName} ${exportPlan.contract.range}`}
                  />
                </div>
              </CardComponent>
              <div className={`v17-blocker-callout ${exportCalloutTone(exportPlan)}`}>
                <SvgIcon>
                  <path d="M10.3 4.3 2.8 17.4A2 2 0 0 0 4.5 20h15a2 2 0 0 0 1.7-2.6L13.7 4.3a2 2 0 0 0-3.4 0Z" />
                  <path d="M12 9v4" />
                  <path d="M12 17h.01" />
                </SvgIcon>
                <span>
                  <strong>{exportCalloutTitle(exportPlan)}</strong>
                  {exportPlan.blockers.length > 0 ? (
                    exportPlan.blockers.map((blocker) => (
                      <span key={blocker.reason}>{blocker.reason}</span>
                    ))
                  ) : exportPlan.warnings.length > 0 ? (
                    exportPlan.warnings.map((warning) => (
                      <span key={warning.reason}>{warning.reason}</span>
                    ))
                  ) : (
                    <span>
                      Предпросмотр и Excel используют одни и те же строки. Скачать файл
                      можно только после проверки состава пакета.
                    </span>
                  )}
                </span>
              </div>
              <CardComponent
                as="section"
                className="v17-rail-card v17-export-actions-card"
              >
                <div
                  aria-busy={exportBusy || undefined}
                  aria-describedby={actionHint ? "export-action-hint" : undefined}
                  className="mp-action-dock export-action-dock"
                  data-testid="export-action-dock"
                >
                  <div className="mp-action-dock-actions export-actions">
                    <Button
                      aria-describedby={actionHint ? "export-action-hint" : undefined}
                      disabled={exportBusy || !exportPlan.canGenerate}
                      onClick={onGenerate}
                    >
                      Сформировать Excel
                    </Button>
                    <Button
                      aria-describedby={actionHint ? "export-action-hint" : undefined}
                      disabled={exportBusy || !exportPlan.canDownload}
                      variant="secondary"
                      onClick={onDownload}
                    >
                      Скачать Excel
                    </Button>
                    <Button
                      aria-describedby={actionHint ? "export-action-hint" : undefined}
                      disabled={exportBusy || !exportPlan.canMarkExported}
                      loading={exportBusy}
                      variant="secondary"
                      onClick={onMarkExported}
                    >
                      Отметить выгружено
                    </Button>
                  </div>
                  {actionHint ? (
                    <p
                      aria-live="polite"
                      className="mp-action-dock-hint export-action-hint"
                      id="export-action-hint"
                    >
                      {actionHint}
                    </p>
                  ) : null}
                </div>
                <p className="sheet-caption">
                  Скачивание доступно только для текущего выбранного пакета. Если выбор
                  изменился, сформируйте Excel заново.
                </p>
              </CardComponent>
              <CardComponent
                as="section"
                className="v17-rail-card export-preview magic-export-preview"
                aria-label="Предпросмотр Excel"
                tabIndex={0}
              >
                <div
                  className="excel-table export-preview-sheet"
                  aria-label="Предпросмотр Sheet1"
                  tabIndex={0}
                >
                  {exportPlan.rowCount === 0 ? (
                    <p className="export-preview-empty-title">Пакет не выбран</p>
                  ) : null}
                  <div className="sheet-head">
                    <span />
                    <span />
                    <span />
                    <strong>{exportPlan.contract.sheetName} · предпросмотр</strong>
                  </div>
                  <div className="excel-head">
                    <span>#</span>
                    {previewColumns.map((header) => (
                      <span key={header}>{header}</span>
                    ))}
                  </div>
                  {previewRows.map((row, rowIndex) => (
                    <div
                      className={`excel-row ${
                        exportPlan.rows[rowIndex]?.applicantCount &&
                        exportPlan.rows[rowIndex].applicantCount > 1
                          ? "is-family"
                          : ""
                      }`}
                      key={`${exportPlan.rows[rowIndex]?.submissionId ?? "row"}-${rowIndex}`}
                    >
                      <span>{rowIndex + 1}</span>
                      {row.slice(0, previewColumns.length).map((value, cellIndex) => (
                        <span key={`${cellIndex}-${value}`}>
                          {maskPreviewValue(value)}
                        </span>
                      ))}
                    </div>
                  ))}
                </div>
                <p className="sheet-caption">
                  Показаны первые 9 из 56 колонок. Один заявитель = одна строка; члены
                  семьи идут последовательным блоком.
                </p>
              </CardComponent>
              <CardComponent
                as="section"
                className="v17-rail-card v17-export-mapping-card"
              >
                <div
                  className="mapping-audit"
                  aria-label="Аудит сопоставления 56 колонок"
                >
                  <div className="mapping-audit-head">
                    <strong>Контракт A:BD</strong>
                    <span>
                      {mappedCount} связано · {derivedCount} вычислено ·{" "}
                      {unresolvedCount} не сопоставлено
                    </span>
                  </div>
                  <div className="mapping-audit-scroll" tabIndex={0}>
                    {mappingRows.map((row) => (
                      <div className="mapping-row" key={row.header}>
                        <span className="mapping-index">{row.index}</span>
                        <span className="mapping-name">{row.header}</span>
                        <span className={`mapping-state ${row.state}`}>
                          {exportMappingStateLabel(row.state)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardComponent>
            </div>
          </aside>
        ) : null}
      </div>
    </>
  );
}

function exportPackageFacts(plan: ExportSummary) {
  const submissionIds = new Set(plan.rows.map((row) => row.submissionId));
  const cities = uniqueValues(plan.rows.map((row) => row.city));
  const dates = uniqueValues(plan.rows.map((row) => row.tripDates));
  const types = uniqueValues(plan.rows.map((row) => row.type));
  const city = singleOrMixed(cities);
  const tripDatesValue = singleOrMixed(dates);
  const type = singleOrMixed(types);

  return {
    city,
    dates: tripDatesValue,
    type,
    items: [
      ["Подачи", String(submissionIds.size)],
      ["Строки", String(plan.rowCount)],
      ["Город", city],
      ["Даты", tripDatesValue],
      ["Тип", type],
    ] satisfies Array<[string, string]>,
  };
}

function exportHasBlocker(plan: ExportSummary, text: string) {
  return plan.blockers.some((blocker) => blocker.reason.includes(text));
}

function exportCalloutTone(plan: ExportSummary) {
  if (plan.blockers.length > 0) return "blocker-box";
  if (plan.warnings.length > 0) return "warning-box";
  if (plan.ready) return "success-box";
  return "neutral-box";
}

function exportCalloutTitle(plan: ExportSummary) {
  if (plan.blockers.length > 0) return "Выгрузка заблокирована";
  if (plan.warnings.length > 0) return "Выгрузка разрешена с предупреждением";
  if (plan.ready) return "Выгрузка готова";
  return "Выберите пакет для проверки";
}

function exportMappingStateLabel(state: "mapped" | "derived" | "unresolved") {
  if (state === "mapped") return "связано";
  if (state === "derived") return "вычислено";
  return "не сопоставлено";
}

function exportStateLabel(submission: Submission) {
  if (submission.exportState === "file_generated") return "Файл сформирован";
  if (submission.exportState === "file_downloaded") return "Файл скачан";
  if (submission.exportState === "marked_exported") return "Выгружено";
  return "Готово";
}

function returnedPdfPackageSummary(submission: Submission): {
  detail: string;
  label: string;
  tone: "danger" | "amber" | "blue" | "teal" | "muted" | "default";
} {
  const handoffPackage = buildAgentHandoffPackage(submission);
  const firstBlocker = handoffPackage.blockers[0] ?? "";

  if (handoffPackage.ready) {
    return {
      detail: `${handoffPackage.applicantPdfs.length} PDF анкет · общий лист записи готов`,
      label: "PDF готов",
      tone: "teal",
    };
  }

  if (firstBlocker.includes("Application PDF is missing")) {
    return {
      detail: returnedPdfBlockerForUser(firstBlocker),
      label: "Нет PDF анкеты",
      tone: "amber",
    };
  }

  if (firstBlocker.includes("Common appointment/list PDF is missing")) {
    return {
      detail: returnedPdfBlockerForUser(firstBlocker),
      label: "Нет листа записи",
      tone: "amber",
    };
  }

  if (
    firstBlocker.includes("upload failed") ||
    firstBlocker.includes("was deleted") ||
    firstBlocker.includes("is not uploaded")
  ) {
    return {
      detail: returnedPdfBlockerForUser(firstBlocker),
      label: "PDF не готов",
      tone: "danger",
    };
  }

  return {
    detail: firstBlocker
      ? returnedPdfBlockerForUser(firstBlocker)
      : "Пакет PDF нужно проверить перед передачей агенту",
    label: "Нужна проверка PDF",
    tone: "amber",
  };
}

function returnedPdfBlockerForUser(blocker: string) {
  if (blocker.includes("Application PDF is missing")) return "Нет PDF анкеты";
  if (blocker.includes("Common appointment/list PDF is missing")) {
    return "Нет общего листа записи";
  }
  if (blocker.includes("upload failed")) return "PDF не загрузился";
  if (blocker.includes("was deleted")) return "PDF удалён";
  if (blocker.includes("is not uploaded")) return "PDF ещё не загружен";
  if (blocker.includes("PDF можно передать агенту после выгрузки")) {
    return "PDF можно передать агенту после выгрузки";
  }
  return blocker;
}

function maskPreviewValue(value: string) {
  if (!value) return "—";
  if (value.includes("@")) return value.replace(/(.{2}).+(@.+)/, "$1•••$2");
  if (/^\d{7,}$/.test(value)) return `${value.slice(0, 2)}•••${value.slice(-2)}`;
  return value;
}

function uniqueValues(values: string[]) {
  return [...new Set(values.filter(Boolean))];
}

function singleOrMixed(values: string[]) {
  if (values.length === 0) return "Не выбран";
  if (values.length === 1) return values[0];
  return "Смешано";
}

function exportPackageTitle(plan: ExportSummary) {
  if (plan.rowCount === 0) return "Пакет не выбран";
  const submissions = new Set(plan.rows.map((row) => row.submissionId)).size;
  return `${submissions} ${pluralRu(submissions, "подача", "подачи", "подач")} · ${plan.rowCount} ${pluralRu(plan.rowCount, "заявитель", "заявителя", "заявителей")}`;
}

function exportActionHint(plan: ExportSummary) {
  if (plan.blockers.length > 0)
    return plan.blockers[0]?.reason ?? "Выгрузка заблокирована";
  if (plan.exportState === "ready")
    return "Сначала сформируйте Excel, затем скачайте файл.";
  if (plan.exportState === "file_generated")
    return "Файл сформирован. Теперь скачайте его.";
  if (plan.exportState === "file_downloaded")
    return "Файл скачан. Можно отметить подачу выгруженной.";
  if (plan.exportState === "marked_exported") return "Подача уже отмечена выгруженной.";
  if (plan.exportState === "mixed")
    return "Выберите подачи в одном состоянии выгрузки.";
  return "Выберите хотя бы одну подачу";
}
