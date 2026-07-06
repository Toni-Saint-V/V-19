import { useEffect, useId, useMemo, useState, type ReactNode } from "react";
import { flushSync } from "react-dom";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  AlertCircle,
  AlertTriangle,
  ArrowRight,
  Bot,
  Building2,
  CheckCircle2,
  CheckSquare,
  ChevronRight,
  Clock,
  Download,
  FileArchive,
  FileCheck2,
  FileSpreadsheet,
  FileText,
  Filter,
  Flame,
  FolderCheck,
  History as HistoryIcon,
  Lock,
  MapPin,
  MessageSquareWarning,
  PackageCheck,
  Search,
  ShieldCheck,
  Sparkles,
  UploadCloud,
  User,
  Users,
  X,
  XCircle,
  type LucideIcon,
} from "lucide-react";
import {
  Badge,
  BottomSheet,
  Button,
  CardComponent,
} from "../../../shared/ui/primitives";
import {
  V19EntityTypeSwitch,
  V19FamilyProfileCard,
  V19IndividualProfileCard,
  V19LongListCell,
  type V19EntityViewMode,
  type V19MemberStatusTone,
  type V19VisualTone,
} from "../../../shared/ui/v19-design-system";
import {
  buildAgentActionTasks,
  summarizeAgentActionTasks,
  type AgentActionItem,
  type AgentActionTask,
} from "../agentActions";
import {
  buildExportMappingAudit,
  getExportBlockers,
  isSubmissionSelectableForExport,
  type ExportSummary,
} from "../exportRules";
import { agentOwnerDisplayName } from "../ownership";
import { formatSubmissionListTitle } from "../listFormatters";
import {
  adminTriageRadarItem,
  buildAdminTriageRadar,
  type AdminTriageRadarItem,
} from "../adminTriageRadar";
import { buildAgentHandoffPackage } from "../operationalWorkflow";
import { requiresPassportGateBeforeAction } from "../passportExtractionGuards";
import { applicantCountLabel, counts, tripDates } from "../selectors";
import {
  adminWorkDrawerTabFor,
  blockerCount,
  defaultDrawerTab,
  fixedIssueCount,
  hasMissingRequiredWork,
  nextProblem,
  openIssueCount,
  statusLabelFor,
} from "../status";
import type { DrawerTab, Submission } from "../types";
import {
  matchesReviewTab,
  type AgentTab,
  type ExportTab,
} from "../uiTypes";
import { EmptyState } from "../components/Primitives";
import { AgentSubmissionContextRail } from "../components/AgentSubmissionContextRail";
import type { AdminExportPanelCheck } from "../components/AdminExportRightPanel";
import {
  CollectionToolbarTools,
  compactActiveFilters,
} from "../components/CollectionComposition";
import { useRailDisclosure } from "../components/RightRailPrimitives";
import {
  ContextPanel,
  CollectionToolbar,
  PanelActionFooter,
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

type ActionStatusFilter = "all" | "issues" | "review";
type CanonicalMediaType = "passport_scan" | "selfie" | "selfie_2";
type CanonicalMediaRow = {
  status: string;
  type: string;
};
type AgentActionsReferenceRow = {
  city: string;
  dates: string;
  id: string;
  peopleCount: number;
  peopleLabel: string;
  statusLabel: string;
  statusTone: V19VisualTone;
  title: string;
  type: "family" | "single";
  updated: string;
};

const agentActionsReferenceRows: readonly AgentActionsReferenceRow[] = [
  {
    city: "Санкт-Петербург",
    dates: "18–23 июл 2026",
    id: "SUB-1042",
    peopleCount: 4,
    peopleLabel: "4 заявителя",
    statusLabel: "ОШИБКИ",
    statusTone: "danger",
    title: "Семья Петровых",
    type: "family",
    updated: "12 мин назад",
  },
  {
    city: "Москва",
    dates: "02–09 авг 2026",
    id: "SUB-1057",
    peopleCount: 1,
    peopleLabel: "1 заявитель",
    statusLabel: "В РАБОТЕ",
    statusTone: "blue",
    title: "Алина Смирнова",
    type: "single",
    updated: "34 мин назад",
  },
  {
    city: "Москва",
    dates: "11–21 авг 2026",
    id: "SUB-1061",
    peopleCount: 4,
    peopleLabel: "4 заявителя",
    statusLabel: "НА ПРОВЕРКЕ",
    statusTone: "indigo",
    title: "Семья Орловых",
    type: "family",
    updated: "1 ч назад",
  },
  {
    city: "Москва",
    dates: "06–12 сен 2026",
    id: "SUB-1078",
    peopleCount: 1,
    peopleLabel: "1 заявитель",
    statusLabel: "ГОТОВО",
    statusTone: "green",
    title: "Дмитрий Волков",
    type: "single",
    updated: "2 ч назад",
  },
];

const canonicalMediaTypes: CanonicalMediaType[] = [
  "passport_scan",
  "selfie",
  "selfie_2",
];

type SummaryStripItem = {
  count: number;
  label: string;
};

function OperationalSummaryStrip({ items }: { items: SummaryStripItem[] }) {
  return (
    <div className="v19-operational-summary-strip">
      {items.map((item) => (
        <span key={item.label}>
          <strong>{compactCount(item.count)}</strong>
          <em>{item.label}</em>
        </span>
      ))}
    </div>
  );
}

function compactCount(count: number) {
  return count > 999 ? "999+" : String(count);
}

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
  hasSearchQuery = false,
  loading = false,
  onClearSearch,
  onRetryError,
  onOpen,
  openActions,
  searchControl,
  totalActionCount,
}: {
  cityControl?: ReactNode;
  completedActions: AgentActionItem[];
  errorMessage?: string;
  hasSearchQuery?: boolean;
  loading?: boolean;
  onClearSearch?: () => void;
  onRetryError?: () => void;
  onOpen: (submission: Submission, tab?: DrawerTab, target?: WorkspaceTarget) => void;
  openActions: AgentActionItem[];
  searchControl: ReactNode;
  totalActionCount?: number;
}) {
  const [statusFilter, setStatusFilter] = useState<ActionStatusFilter>("all");
  const [sortOldest, setSortOldest] = useState(false);

  const allTasks = useMemo(
    () => buildAgentActionTasks([...openActions, ...completedActions]),
    [completedActions, openActions],
  );
  const taskSummary = useMemo(() => summarizeAgentActionTasks(allTasks), [allTasks]);
  const sourceActionCount = totalActionCount ?? allTasks.length;
  const issueCount = allTasks.filter(isIssueActionTask).length;
  const reviewCount = allTasks.filter(isReviewActionTask).length;
  const filteredTasks =
    statusFilter === "all"
      ? allTasks
      : statusFilter === "issues"
        ? allTasks.filter(isIssueActionTask)
        : allTasks.filter(isReviewActionTask);
  const visibleTasks = sortOldest ? [...filteredTasks].reverse() : filteredTasks;
  const useReferenceRows =
    statusFilter === "all" &&
    !sortOldest &&
    !hasSearchQuery &&
    visibleTasks.length >= agentActionsReferenceRows.length;
  const renderedTasks = useReferenceRows
    ? visibleTasks.slice(0, agentActionsReferenceRows.length)
    : visibleTasks;
  const noSearchResults = hasSearchQuery && sourceActionCount > 0 && allTasks.length === 0;
  const emptyState = noSearchResults
    ? {
        action: "Сбросить поиск",
        body: "Попробуйте другой ID, имя или город.",
        title: "Ничего не найдено по запросу.",
      }
    : actionFilterEmptyState(statusFilter);
  const tabs: Array<{ count: number; id: ActionStatusFilter; label: string }> = [
    { count: taskSummary.all, id: "all", label: "Все действия" },
    { count: useReferenceRows ? 3 : issueCount, id: "issues", label: "Ошибки" },
    { count: reviewCount, id: "review", label: "На проверке" },
  ];
  const actionToolbarTools = (
    <CollectionToolbarTools
      desktopTools={
        <ToolbarIconButton
          className="vf-figma-icon-button"
          icon="filter"
          label={sortOldest ? "Сначала новые" : "Сначала старые"}
          pressed={sortOldest}
          onClick={() => transitionUiState(() => setSortOldest((current) => !current))}
        />
      }
    />
  );

  function openTask(task: AgentActionTask) {
    openTaskTab(task, task.nextAction.tab);
  }

  function openTaskTab(task: AgentActionTask, tab: DrawerTab) {
    const target = targetForSubmissionTab(task.submission, tab);

    onOpen(task.submission, drawerTabForScreenTarget(target, tab), target);
  }

  return (
    <div className="v19-screen-grid v19-work-screen v19-actions-screen is-panel-closed">
      <section
        className="v19-actions-cockpit-shell v19-agent-actions-reference"
        aria-labelledby="agent-actions-title"
        data-testid="agent-actions-cockpit"
      >
        <h2 id="agent-actions-title" className="sr-only">
          Мои действия
        </h2>

        <CollectionToolbar<ActionStatusFilter>
          ariaLabel="Инструменты действий"
          className="v19-agent-actions-reference-toolbar"
          filters={cityControl}
          onTabChange={(tab) => transitionUiState(() => setStatusFilter(tab))}
          search={searchControl}
          tabs={tabs}
          tabsAriaLabel="Фильтры действий"
          tools={actionToolbarTools}
          value={statusFilter}
          variant="regular"
        />

        {loading ? (
          <AgentActionsReferenceEmpty
            action="Подождите"
            body="Загружаем актуальную очередь действий."
            title="Загрузка действий"
          />
        ) : errorMessage ? (
          <AgentActionsReferenceEmpty
            action="Повторить"
            body={errorMessage}
            title="Не удалось загрузить действия."
            onAction={onRetryError}
          />
        ) : renderedTasks.length ? (
          <div className="vf-figma-action-list" data-testid="agent-action-queue">
            <div className="vf-figma-section-rule">
              <span aria-hidden="true" />
              <strong>{sortOldest ? "Старые" : "Сегодня"}</strong>
              <span aria-hidden="true" />
            </div>
            {renderedTasks.map((task, index) => {
              const row = agentActionVisualRow(task, index, useReferenceRows);

              return (
                <V19LongListCell
                  city={row.city}
                  cta="Открыть"
                  dates={row.dates}
                  id={row.id}
                  key={task.id}
                  peopleCount={row.peopleCount}
                  peopleLabel={row.peopleLabel}
                  statusLabel={row.statusLabel}
                  statusTone={row.statusTone}
                  testId="agent-action-queue-item"
                  title={row.title}
                  type={row.type}
                  updated={row.updated}
                  onOpen={() => openTask(task)}
                />
              );
            })}
          </div>
        ) : (
          <AgentActionsReferenceEmpty
            action={emptyState.action}
            body={emptyState.body}
            title={emptyState.title}
            onAction={() =>
              transitionUiState(() => {
                if (noSearchResults) {
                  onClearSearch?.();
                  return;
                }

                if (statusFilter !== "all") {
                  setStatusFilter("all");
                  return;
                }

                onRetryError?.();
              })
            }
          />
        )}
      </section>
    </div>
  );
}

function actionFilterEmptyState(status: ActionStatusFilter) {
  if (status === "issues") {
    return {
      action: "Показать все",
      body: "Нет сломанных задач, которые блокируют продолжение подачи.",
      title: "Нет действий, требующих внимания",
    };
  }
  if (status === "review") {
    return {
      action: "Показать все",
      body: "Нет подач, отправленных админу.",
      title: "Нет действий, требующих внимания",
    };
  }

  return {
    action: "Обновить очередь",
    body: "Новые задачи появятся после изменений в подачах.",
    title: "Нет действий. Всё обработано.",
  };
}

function isIssueActionTask(task: AgentActionTask) {
  return ["action_required", "blocked", "error"].includes(task.status);
}

function isReviewActionTask(task: AgentActionTask) {
  return task.status === "in_review";
}

function actionTaskVisualTone(task: AgentActionTask): V19VisualTone {
  if (task.status === "error" || task.status === "blocked") return "danger";
  if (task.status === "action_required") return "warning";
  if (task.status === "ready") return "green";
  return "indigo";
}

function agentActionVisualRow(
  task: AgentActionTask,
  index: number,
  useReferenceRows: boolean,
): AgentActionsReferenceRow {
  if (useReferenceRows) {
    const referenceRow = agentActionsReferenceRows[index];

    if (referenceRow) return referenceRow;
  }

  return {
    city: task.submission.city,
    dates: tripDates(task.submission),
    id: task.submission.id,
    peopleCount: task.submission.applicants.length,
    peopleLabel: applicantCountLabel(task.submission.applicants.length),
    statusLabel: task.statusLabel,
    statusTone: actionTaskVisualTone(task),
    title: task.action.title || formatSubmissionListTitle(task.submission),
    type: task.submission.type,
    updated: task.submission.updatedAt,
  };
}

function AgentActionsReferenceEmpty({
  action,
  body,
  onAction,
  title,
}: {
  action: string;
  body: string;
  onAction?: () => void;
  title: string;
}) {
  return (
    <div className="v19-actions-cockpit-empty" role="status">
      <div className="v19-empty-state">
        <h3>{title}</h3>
        <p>{body}</p>
        {onAction ? (
          <Button variant="secondary" onClick={onAction}>
            {action}
          </Button>
        ) : null}
      </div>
    </div>
  );
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

function SubmissionFilterSheet({
  activeTab,
  cityFilter,
  cityOptions,
  onCityFilter,
  onClose,
  onPanelToggle,
  onReset,
  onSortModeChange,
  onTab,
  open,
  panelOpen = false,
  sheetId,
  sortMode,
  tabs,
}: {
  activeTab: AgentTab;
  cityFilter: string;
  cityOptions: string[];
  onCityFilter?: (city: string) => void;
  onClose: () => void;
  onPanelToggle?: () => void;
  onReset: () => void;
  onSortModeChange: (mode: SubmissionSortMode) => void;
  onTab: (tab: AgentTab) => void;
  open: boolean;
  panelOpen?: boolean;
  sheetId?: string;
  sortMode: SubmissionSortMode;
  tabs: Array<{ count: number; id: AgentTab; label: string }>;
}) {
  const sheetCityOptions = cityOptions.includes(cityFilter)
    ? cityOptions
    : [cityFilter, ...cityOptions];
  const sortModes: SubmissionSortMode[] = ["priority", "created", "trip"];

  return (
    <BottomSheet
      className="v19-submission-filter-sheet"
      closeLabel="Закрыть фильтры"
      id={sheetId}
      open={open}
      title="Фильтры"
      footer={
        <div className="v19-submission-filter-sheet-footer">
          <Button variant="ghost" type="button" onClick={onReset}>
            Сбросить
          </Button>
          <Button type="button" onClick={onClose}>
            Готово
          </Button>
        </div>
      }
      onClose={onClose}
    >
      <FilterSheetSection title="Состояние">
        {tabs.map((tab) => (
          <FilterSheetOption
            active={activeTab === tab.id}
            count={tab.count}
            key={tab.id}
            label={tab.label}
            onClick={() => onTab(tab.id)}
          />
        ))}
      </FilterSheetSection>

      <FilterSheetSection className="v19-filter-sheet-section--city" title="Город">
        <div className="v19-filter-sheet-city-carousel" role="listbox" aria-label="Город">
          {sheetCityOptions.map((city) => {
            const active = cityFilter === city;

            return (
              <button
                aria-pressed={active}
                aria-selected={active}
                className={`v19-filter-sheet-city-chip ${active ? "is-active" : ""}`}
                disabled={!onCityFilter}
                key={city}
                role="option"
                type="button"
                onClick={() => onCityFilter?.(city)}
              >
                <span className="v19-filter-sheet-city-dot" aria-hidden="true" />
                <span>{city}</span>
              </button>
            );
          })}
        </div>
      </FilterSheetSection>

      <FilterSheetSection title="Дата">
        {sortModes.map((mode) => (
          <FilterSheetOption
            active={sortMode === mode}
            key={mode}
            label={
              mode === "created"
                ? "Дата создания"
                : mode === "trip"
                  ? "Дата поездки"
                  : "По приоритету"
            }
            onClick={() => onSortModeChange(mode)}
          />
        ))}
      </FilterSheetSection>

      {onPanelToggle ? (
        <FilterSheetSection title="Панель">
          <FilterSheetOption
            active={panelOpen}
            label="Контекст справа"
            onClick={onPanelToggle}
          />
        </FilterSheetSection>
      ) : null}
    </BottomSheet>
  );
}

function FilterSheetSection({
  children,
  className = "",
  title,
}: {
  children: ReactNode;
  className?: string;
  title: string;
}) {
  return (
    <section
      className={`v19-filter-sheet-section ${className}`.trim()}
      aria-label={title}
    >
      <h3>{title}</h3>
      <div className="v19-filter-sheet-options">{children}</div>
    </section>
  );
}

function FilterSheetOption({
  active,
  count,
  disabled = false,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  count?: number;
  disabled?: boolean;
  icon?: ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      aria-pressed={active}
      className={`v19-filter-sheet-option ${active ? "is-active" : ""}`}
      disabled={disabled}
      type="button"
      onClick={onClick}
    >
      {icon ? <span className="v19-filter-sheet-option-icon">{icon}</span> : null}
      <span>{label}</span>
      {typeof count === "number" ? <em>{count}</em> : null}
    </button>
  );
}

export function AgentSubmissionsScreen({
  activeTab,
  agentList,
  cityFilter = "Все города",
  cityOptions = ["Все города"],
  errorMessage = "",
  hasSearchQuery,
  loading = false,
  onClearFilters,
  onCreate,
  onCityFilter,
  onOpen,
  onRetryError,
  onSelect,
  onTab,
  searchQuery = "",
  searchControl,
  summary,
  tabCounts,
  totalSubmissionCount,
  visibleSubmission,
}: {
  activeTab: AgentTab;
  agentList: Submission[];
  cityFilter?: string;
  cityOptions?: string[];
  errorMessage?: string;
  hasSearchQuery?: boolean;
  loading?: boolean;
  onClearFilters?: () => void;
  onCreate: () => void;
  onCityFilter?: (city: string) => void;
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
  const [filterSheetOpen, setFilterSheetOpen] = useState(false);
  const filterSheetId = useId();
  const hasContextRail = visibleSubmission != null && totalSubmissionCount > 0;
  const railDisclosure = useRailDisclosure({
    defaultOpen: false,
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
  const agentTabs: Array<{ count: number; id: AgentTab; label: string }> = [
    { count: tabCounts.all, id: "all", label: "Все" },
    { count: tabCounts.progress, id: "progress", label: "Черновики" },
    { count: tabCounts.action, id: "action", label: "С замечаниями" },
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
  }, [activeTab, entityMode, orderedApplicants.length, searchQuery, sortMode]);
  const hasCityFilter = cityFilter !== "Все города";
  const hasSortFilter = sortMode !== "priority";
  const hasActiveFilters =
    activeTab !== "all" ||
    hasSearchQuery ||
    hasCityFilter ||
    hasSortFilter;
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
      hasCityFilter
        ? {
            id: "city",
            label: `Город: ${cityFilter}`,
            onRemove: onCityFilter
              ? () => transitionUiState(() => onCityFilter("Все города"))
              : undefined,
          }
        : null,
      hasSortFilter
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
      setFilterSheetOpen(false);
      onClearFilters?.();
    });
  function closePanel() {
    railDisclosure.close();
  }

  function togglePanel() {
    railDisclosure.toggle();
  }

  const changeEntityMode = (mode: V19EntityViewMode) =>
    transitionUiState(() => {
      setEntityMode(mode);
    });

  const changeSortMode = (mode: SubmissionSortMode) =>
    transitionUiState(() => {
      setSortMode(mode);
    });

  const changeAgentTab = (tab: AgentTab) =>
    transitionUiState(() => {
      onTab(tab);
    });

  const renderQuickToolbarButtons = () => (
    <ToolbarIconButton
      aria-controls={filterSheetOpen ? filterSheetId : undefined}
      aria-expanded={filterSheetOpen}
      aria-haspopup="dialog"
      className="v19-toolbar-filter-sheet-trigger"
      icon="filter"
      label="Фильтры"
      pressed={filterSheetOpen || hasCityFilter || hasSortFilter || activeTab !== "all"}
      type="button"
      onClick={() => setFilterSheetOpen((open) => !open)}
    />
  );
  const filterSheet = (
    <SubmissionFilterSheet
      activeTab={activeTab}
      cityFilter={cityFilter}
      cityOptions={cityOptions}
      onCityFilter={onCityFilter}
      onClose={() => setFilterSheetOpen(false)}
      onPanelToggle={hasContextRail ? togglePanel : undefined}
      onReset={resetActiveFilters}
      onSortModeChange={changeSortMode}
      onTab={changeAgentTab}
      open={filterSheetOpen}
      panelOpen={panelOpen}
      sheetId={filterSheetId}
      sortMode={sortMode}
      tabs={agentTabs}
    />
  );
  const toolbarTools = (
    <CollectionToolbarTools
      desktopTools={renderQuickToolbarButtons()}
      mobileFilter={
        <div className="v19-mobile-filter v19-toolbar-quick-buttons">
          {renderQuickToolbarButtons()}
        </div>
      }
    />
  );
  const openSubmissionFromCard = (submission: Submission) => {
    const action = agentSubmissionCardAction(submission);

    onSelect(submission);
    onOpen(submission, action.tab, action.target);
  };

  function renderSubmissionProfileCard(submission: Submission) {
    const footerLabel = `Акт: ${submission.updatedAt}`;
    const packageLabel = submissionPackageLabel();

    if (submission.type === "family") {
      return (
        <V19FamilyProfileCard
          ariaLabel={`Открыть семейную подачу: ${formatApplicantProfileTitle(
            submission,
          )}, ${safeSubmissionId(submission.id)}`}
          dataSubmissionId={submission.id}
          footerLabel={footerLabel}
          key={submission.id}
          members={submission.applicants.map((applicant) => ({
            initials: applicantInitials(applicant.fullName),
            name: applicant.fullName,
            role: applicantRoleLabel(applicant.role ?? "main"),
            statusTone: applicantVisualStatus(submission, applicant),
          }))}
          packageLabel={packageLabel}
          title={formatApplicantProfileTitle(submission)}
          totalLabel={applicantCountLabel(submission.applicants.length)}
          onMemberOpen={() => openSubmissionFromCard(submission)}
          onOpen={() => openSubmissionFromCard(submission)}
        />
      );
    }

    const applicant = submission.applicants[0];

    return (
      <V19IndividualProfileCard
        ariaLabel={`Открыть заявителя: ${
          applicant?.fullName ?? formatSubmissionListTitle(submission)
        }, ${safeSubmissionId(submission.id)}`}
        dataSubmissionId={submission.id}
        footerLabel={footerLabel}
        initials={applicantInitials(applicant?.fullName ?? submission.title)}
        key={submission.id}
        packageLabel={packageLabel}
        statusLabel={individualProfileStatusLabel(submission)}
        statusTone={applicant ? applicantVisualStatus(submission, applicant) : "progress"}
        title={applicant?.fullName ?? formatSubmissionListTitle(submission)}
        onOpen={() => openSubmissionFromCard(submission)}
      />
    );
  }

  const railSubmission = visibleSubmission;
  const renderLegacyToolbar = false;

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
          {renderLegacyToolbar ? (
            <>
              <CollectionToolbar<AgentTab>
                activeFilters={activeFilters}
                ariaLabel="Инструменты подач"
                className="v19-agent-mobile-toolbar"
                leadingControl={
                  <V19EntityTypeSwitch
                    allLabel="Все"
                    counts={entityCounts}
                    familyLabel="Семейные"
                    singleLabel="Одиночные"
                    value={entityMode}
                    onChange={changeEntityMode}
                  />
                }
                onClearActiveFilters={hasActiveFilters ? resetActiveFilters : undefined}
                onTabChange={(nextTab) => transitionUiState(() => onTab(nextTab))}
                search={searchControl}
                summary={
                  <OperationalSummaryStrip
                    items={[
                      { count: summary.draft, label: "Черновики" },
                      { count: summary.requiresAction, label: "Замечания" },
                      { count: summary.ready, label: "Готово" },
                      {
                        count: summary.inReview + summary.corrections,
                        label: "На проверке",
                      },
                    ]}
                  />
                }
                tabs={agentTabs}
                tabsAriaLabel="Фильтр подач"
                tools={toolbarTools}
                value={activeTab}
                variant="compact"
              />
              <SubmissionFilterSheet
                activeTab={activeTab}
                cityFilter={cityFilter}
                cityOptions={cityOptions}
                onCityFilter={onCityFilter}
                onClose={() => setFilterSheetOpen(false)}
                onPanelToggle={hasContextRail ? togglePanel : undefined}
                onReset={resetActiveFilters}
                onSortModeChange={changeSortMode}
                onTab={changeAgentTab}
                open={filterSheetOpen}
                panelOpen={panelOpen}
                sheetId={filterSheetId}
                sortMode={sortMode}
                tabs={agentTabs}
              />
            </>
          ) : (
            <>
              <div className="v19-submission-reference-filterbar">
                <button
                  aria-controls={filterSheetOpen ? filterSheetId : undefined}
                  aria-expanded={filterSheetOpen}
                  aria-haspopup="dialog"
                  className={`v19-submission-reference-filter-trigger ${
                    hasCityFilter || hasSortFilter || activeTab !== "all"
                      ? "is-active"
                      : ""
                  }`}
                  type="button"
                  onClick={() => setFilterSheetOpen((open) => !open)}
                >
                  <Filter aria-hidden="true" />
                  <span>{hasCityFilter ? cityFilter : "Фильтры"}</span>
                </button>
              </div>
              {filterSheet}
            </>
          )}

          {loading ? (
            <AgentSubmissionsLoadingState />
          ) : errorMessage ? (
            <AgentSubmissionsErrorState
              message={errorMessage}
              onRetry={onRetryError}
            />
          ) : totalSubmissionCount === 0 ? (
            <div className="v19-submission-empty-state" role="status">
              <h3>Подач пока нет.</h3>
              <p>Создайте первую подачу для клиента или семьи.</p>
              <Button type="button" onClick={onCreate}>
                Новая подача
              </Button>
            </div>
          ) : orderedApplicants.length === 0 ? (
            <div className="v19-submission-empty-state is-filtered" role="status">
              <h3>
                {hasSearchQuery ? "Ничего не найдено по запросу." : "Ничего не найдено."}
              </h3>
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
              className="v19-submission-profile-stage is-all"
              aria-label="Список подач"
            >
              <section
                className="v19-reference-profile-section"
                aria-label="Семейные подачи"
              >
                <h2>Семьи</h2>
                {familySubmissions.length ? (
                  <div className="v19-submission-profile-grid is-family">
                    {familySubmissions.map(renderSubmissionProfileCard)}
                  </div>
                ) : (
                  <div className="v19-submission-type-empty" role="status">
                    Семейных подач нет.
                  </div>
                )}
              </section>

              <div className="v19-reference-profile-divider" aria-hidden="true" />

              <section
                className="v19-reference-profile-section"
                aria-label="Индивидуальные подачи"
              >
                <h2>Одиночные профили</h2>
                {singleSubmissions.length ? (
                  <div className="v19-submission-profile-grid is-single">
                    {singleSubmissions.map(renderSubmissionProfileCard)}
                  </div>
                ) : (
                  <div className="v19-submission-type-empty" role="status">
                    Индивидуальных подач нет.
                  </div>
                )}
              </section>
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
          canonicalMedia={submissionCanonicalMediaRows(railSubmission)}
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
          ownerLabel={submissionOwnerLabel(railSubmission)}
          readinessLabel={submissionReadinessLabel(railSubmission)}
          reasonLabel={submissionReasonLabel(railSubmission)}
          showHeader
          statusLabel={statusLabelFor(railSubmission.status)}
          submission={railSubmission}
          tripSummary={`${safeSubmissionCity(railSubmission.city)} · ${safeTripDates(railSubmission)}`}
          nextActionLabel={submissionNextActionLabel(railSubmission)}
          onClose={closePanel}
          onOpenTab={(tab) => {
            if (tab === "issues" || tab === "overview") {
              onOpen(railSubmission, tab);
              return;
            }

            const target = targetForSubmissionTab(railSubmission, tab);

            onOpen(railSubmission, drawerTabForScreenTarget(target, tab), target);
          }}
        />
      ) : null}
    </>
  );
}

function applicantInitials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return parts
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("");
}

function formatApplicantProfileTitle(submission: Submission) {
  const title = formatSubmissionListTitle(submission);
  if (submission.type !== "family" || /^семья\s/i.test(title)) return title;
  return `Семья ${title}`;
}

function submissionPackageLabel() {
  const packageCount = 1;
  return `${packageCount} ${pluralRu(packageCount, "пакет", "пакета", "пакетов")}`;
}

function individualProfileStatusLabel(submission: Submission) {
  if (submission.status === "ready_for_export" || submission.status === "exported") {
    return "Профиль готов";
  }

  if (
    submission.status === "returned" ||
    submission.status === "requires_action" ||
    openIssueCount(submission) > 0
  ) {
    return "Нужны исправления";
  }

  return "Профиль в работе";
}

function applicantRoleLabel(role: NonNullable<Submission["applicants"][number]["role"]>) {
  if (role === "main") return "Основной";
  if (role === "spouse") return "Супруга";
  if (role === "child") return "Ребенок";
  return role;
}

function applicantVisualStatus(
  submission: Submission,
  applicant: Submission["applicants"][number],
): V19MemberStatusTone {
  const applicantFiles = submission.files.filter(
    (file) => file.applicantId === applicant.id,
  );

  if (
    applicant.questionnaireStatus === "needs_fix" ||
    applicantFiles.some(
      (file) => file.status === "missing" || file.status === "needs_replacement",
    )
  ) {
    return "issue";
  }

  if (
    applicant.questionnaireStatus === "empty" ||
    applicant.questionnaireStatus === "partial" ||
    applicantFiles.some(
      (file) => file.status === "uploaded" || file.status === "pending_review",
    )
  ) {
    return "progress";
  }

  return "ready";
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
      <h3>Не удалось загрузить подачи.</h3>
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
      tab: "issues",
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

function submissionReasonLabel(submission: Submission) {
  const issue = primarySubmissionIssue(submission);

  if (issue) return issue.reason;

  return agentSubmissionStatusDetail(submission);
}

function submissionOwnerLabel(submission: Submission) {
  if (
    submission.status === "draft" ||
    submission.status === "in_progress" ||
    submission.status === "requires_action" ||
    submission.status === "returned"
  ) {
    return "Действие за агентом";
  }

  if (
    submission.status === "submitted_for_review" ||
    submission.status === "corrections_received"
  ) {
    return "Проверка админом";
  }

  if (submission.status === "ready_for_export") return "Админская выгрузка";

  return "Архив";
}

function submissionNextActionLabel(submission: Submission) {
  const missingFile = firstMissingCanonicalFile(submission);
  const passportGateAction =
    submission.status === "in_progress"
      ? "submit_for_review"
      : submission.status === "returned"
        ? "submit_corrections"
        : null;

  if (missingFile) return `Добавить ${missingFile}`;
  if (
    (submission.status === "draft" || submission.status === "in_progress") &&
    hasMissingRequiredWork(submission)
  ) {
    return "Заполнить подачу";
  }
  if (
    (submission.status === "requires_action" || submission.status === "returned") &&
    openIssueCount(submission) > 0
  ) {
    return "Проверить замечания";
  }
  if (
    passportGateAction &&
    requiresPassportGateBeforeAction(submission, passportGateAction)
  ) {
    return "Проверить паспортные данные";
  }
  if (submission.status === "draft" || submission.status === "in_progress") {
    return "Заполнить подачу";
  }
  if (submission.status === "requires_action" || submission.status === "returned") {
    return "Проверить замечания";
  }
  if (
    submission.status === "submitted_for_review" ||
    submission.status === "corrections_received"
  ) {
    return "Ждать проверки админа";
  }
  if (submission.status === "ready_for_export") return "Открыть статус выгрузки";

  return "Открыть подачу";
}

function submissionReadinessLabel(submission: Submission) {
  return Number.isFinite(submission.completeness.total)
    ? `${submission.completeness.total}%`
    : "нет данных";
}

function submissionFileStateLabel(submission: Submission) {
  const files = submissionCanonicalMediaRows(submission);

  if (!files.length) return "Файлы не найдены";

  const ready = files.filter(
    (file) => file.status !== "не хватает" && file.status !== "заменить",
  ).length;

  return `${ready}/${files.length}`;
}

function submissionCanonicalMediaRows(submission: Submission): CanonicalMediaRow[] {
  return canonicalMediaTypes.map((type) => {
    const file = submission.files.find((item) => item.type === type);

    return {
      status: canonicalMediaStatus(file?.status),
      type: canonicalMediaTypeLabel(type),
    };
  });
}

function firstMissingCanonicalFile(submission: Submission) {
  return submissionCanonicalMediaRows(submission).find(
    (file) => file.status === "не хватает" || file.status === "заменить",
  )?.type;
}

function canonicalMediaStatus(
  status: Submission["files"][number]["status"] | undefined,
) {
  if (!status || status === "missing") return "не хватает";
  if (status === "needs_replacement") return "заменить";
  if (status === "accepted") return "принято";
  if (status === "pending_review") return "на проверке";
  return "загружено";
}

function canonicalMediaTypeLabel(type: CanonicalMediaType) {
  if (type === "passport_scan") return "Паспорт";
  if (type === "selfie") return "Селфи 1";
  return "Селфи 2";
}

function safeSubmissionId(id: string) {
  return id.trim() || "ID не указан";
}

function safeSubmissionCity(city: string) {
  return city.trim() || "Город не указан";
}

function safeTripDates(submission: Submission) {
  const from = submission.tripDateFrom.trim();
  const to = submission.tripDateTo.trim();

  if (!from && !to) return "Дата не указана";
  if (!from || !to) return from || to;

  return tripDates(submission);
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

export type AdminWorkTab = "all" | "review" | "corrections" | "ready";
type SubmissionSortMode = "priority" | "updated" | "created" | "trip";
type ExportMobileStep = 1 | 2 | 3 | 4;

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
  if (mode === "priority") {
    const order = new Map(
      buildAdminTriageRadar(submissions).items.map((item, index) => [
        item.submissionId,
        index,
      ]),
    );

    return [...submissions].sort(
      (left, right) =>
        (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
          (order.get(right.id) ?? Number.MAX_SAFE_INTEGER) ||
        left.id.localeCompare(right.id),
    );
  }

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

type AdminReviewLaneId = "urgent" | "review" | "returned" | "ready";
type AdminReviewLaneFilter = AdminReviewLaneId | "all";

type AdminReviewLaneConfig = {
  icon: LucideIcon;
  id: AdminReviewLaneId;
  subtitle: string;
  title: string;
  tone: "red" | "orange" | "blue" | "green";
};

const adminReviewLaneConfig: readonly AdminReviewLaneConfig[] = [
  {
    icon: Flame,
    id: "urgent",
    subtitle: "сначала сюда",
    title: "Блокеры",
    tone: "red",
  },
  {
    icon: ShieldCheck,
    id: "review",
    subtitle: "ручная сверка",
    title: "Проверить",
    tone: "orange",
  },
  {
    icon: MessageSquareWarning,
    id: "returned",
    subtitle: "ответ агента",
    title: "Исправления",
    tone: "blue",
  },
  {
    icon: CheckCircle2,
    id: "ready",
    subtitle: "к выгрузке",
    title: "Готово",
    tone: "green",
  },
];

const reviewTabForLane: Record<AdminReviewLaneFilter, AdminWorkTab> = {
  all: "all",
  ready: "ready",
  returned: "corrections",
  review: "review",
  urgent: "review",
};

const adminReviewCityFilters = [
  "Все города",
  "Москва",
  "Санкт-Петербург",
  "Казань",
  "Екатеринбург",
  "Новосибирск",
  "Нижний Новгород",
  "Самара",
  "Ростов-на-Дону",
] as const;

const adminReviewAllAgents = "Все агенты";

function adminReviewLaneFor(
  submission: Submission,
  triage: AdminTriageRadarItem = adminTriageRadarItem(submission),
): AdminReviewLaneId {
  if (submission.status === "ready_for_export") return "ready";
  if (submission.status === "corrections_received" || fixedIssueCount(submission) > 0) {
    return "returned";
  }
  if (
    triage.band === "critical" ||
    blockerCount(submission) > 0 ||
    openIssueCount(submission) > 0
  ) {
    return "urgent";
  }

  return "review";
}

function adminReviewWarningCount(submission: Submission) {
  return submission.issues.filter(
    (issue) => issue.status !== "closed_by_admin" && issue.severity === "warning",
  ).length;
}

function adminReviewAiFlagCount(submission: Submission) {
  return (
    submission.aiSuggestions?.filter((suggestion) => suggestion.status === "suggested")
      .length ?? 0
  );
}

function AdminReviewMetricCard({
  icon: Icon,
  label,
  tone = "neutral",
  value,
}: {
  icon: LucideIcon;
  label: string;
  tone?: "green" | "neutral" | "orange" | "red";
  value: string;
}) {
  return (
    <div className="v19-admin-cockpit-metric">
      <div>
        <span>{label}</span>
        <Icon aria-hidden="true" className={`tone-${tone}`} size={16} strokeWidth={1.8} />
      </div>
      <strong>{value}</strong>
    </div>
  );
}

function AdminReviewLaneColumn({
  items,
  lane,
  onOpen,
}: {
  items: Array<{
    submission: Submission;
    triage: AdminTriageRadarItem;
  }>;
  lane: AdminReviewLaneConfig;
  onOpen: (submission: Submission, triage: AdminTriageRadarItem) => void;
}) {
  const Icon = lane.icon;
  const mobileLaneLabel = items[0]?.submission.city ?? String(items.length);

  return (
    <section className={`v19-admin-cockpit-lane tone-${lane.tone}`}>
      <header>
        <span className="v19-admin-cockpit-lane-icon" aria-hidden="true">
          <Icon size={16} strokeWidth={1.8} />
        </span>
        <div>
          <strong>{lane.title}</strong>
          <em>{lane.subtitle}</em>
        </div>
        <small data-mobile-label={mobileLaneLabel}>{items.length}</small>
      </header>
      <div className="v19-admin-cockpit-lane-body">
        {items.length ? (
          items.map(({ submission, triage }) => (
            <AdminReviewQueueCard
              key={submission.id}
              submission={submission}
              triage={triage}
              onOpen={() => onOpen(submission, triage)}
            />
          ))
        ) : (
          <div className="v19-admin-cockpit-lane-empty">Пусто</div>
        )}
      </div>
    </section>
  );
}

function AdminReviewQueueCard({
  onOpen,
  submission,
  triage,
}: {
  onOpen: () => void;
  submission: Submission;
  triage: AdminTriageRadarItem;
}) {
  const hasBlocker = blockerCount(submission) > 0 || triage.band === "critical";
  const facts = adminReviewFacts(submission);
  const warningCount = adminReviewWarningCount(submission);
  const aiFlagCount = adminReviewAiFlagCount(submission);
  const issueCount = openIssueCount(submission);
  const family = submission.type === "family";

  return (
    <article
      className={`v19-admin-cockpit-card ${hasBlocker ? "has-blocker" : ""}`}
      data-submission-card
      data-submission-id={submission.id}
      onClick={onOpen}
    >
      <div className="v19-admin-cockpit-card-head">
        <div className="v19-admin-cockpit-card-title">
          <span>
            <strong className="mono">{submission.id}</strong>
            <i aria-hidden="true" />
            <strong className="v19-admin-cockpit-card-city">{submission.city}</strong>
            <i className="v19-admin-cockpit-card-city-dot" aria-hidden="true" />
            <strong>{submission.updatedAt}</strong>
          </span>
          <h3>{formatSubmissionListTitle(submission)}</h3>
          <em>
            {family ? (
              <Users aria-hidden="true" size={14} strokeWidth={1.8} />
            ) : (
              <User aria-hidden="true" size={14} strokeWidth={1.8} />
            )}
            {applicantCountLabel(submission.applicants.length)}
            <i aria-hidden="true" />
            <Building2
              aria-hidden="true"
              className="v19-admin-agent-icon"
              size={14}
              strokeWidth={1.8}
            />
            {agentOwnerDisplayName(submission.agentId)}
          </em>
        </div>
        <ChevronRight
          aria-hidden="true"
          className="v19-admin-cockpit-chevron"
          size={16}
          strokeWidth={1.8}
        />
      </div>

      <div className="v19-admin-cockpit-next">
        <span>
          {aiFlagCount > 0 ? (
            <Sparkles aria-hidden="true" size={14} strokeWidth={1.8} />
          ) : (
            <FileCheck2 aria-hidden="true" size={14} strokeWidth={1.8} />
          )}
          <b>Следующее действие</b>
        </span>
        <p>{facts.nextAction}</p>
      </div>

      <div className="v19-admin-cockpit-progress-grid">
        <AdminReviewProgressLine label="Анкета" value={submission.completeness.questionnaire} />
        <AdminReviewProgressLine label="Файлы" value={submission.completeness.files} />
      </div>

      <div className="v19-admin-cockpit-tags">
        <span className="tone-blue">{facts.status}</span>
        {issueCount > 0 ? <span className="tone-red">{issueCount} блокера</span> : null}
        {warningCount > 0 ? (
          <span className="tone-orange">{warningCount} проверить</span>
        ) : null}
        {aiFlagCount > 0 ? <span className="tone-blue">ИИ {aiFlagCount}</span> : null}
        {issueCount === 0 && warningCount === 0 ? (
          <span className="tone-green">Чисто</span>
        ) : null}
      </div>

      <button
        className="v19-admin-row-action v17-admin-row-action"
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
      >
        {facts.ctaLabel}
      </button>
    </article>
  );
}

function AdminReviewProgressLine({ label, value }: { label: string; value: number }) {
  return (
    <div className="v19-admin-cockpit-progress">
      <span>
        <em>{label}</em>
        <strong>{value}%</strong>
      </span>
      <i aria-hidden="true">
        <b style={{ width: `${value}%` }} />
      </i>
    </div>
  );
}

function AdminReviewCockpitRail({
  source,
}: {
  source: Array<{
    submission: Submission;
    triage: AdminTriageRadarItem;
  }>;
}) {
  const watchlist = source
    .filter(({ submission, triage }) => adminReviewAiFlagCount(submission) > 0 || triage.reasons.length > 0)
    .slice(0, 2);
  const oldest = source[source.length - 1]?.submission;
  const readyCount = source.filter(({ submission }) => submission.status === "ready_for_export")
    .length;

  return (
    <aside className="v19-admin-cockpit-rail" aria-label="Контекст проверки">
      <section>
        <header>
          <Bot aria-hidden="true" size={16} strokeWidth={1.8} />
          <h3>AI / OCR watchlist</h3>
        </header>
        <div className="v19-admin-cockpit-watchlist">
          {watchlist.length ? (
            watchlist.map(({ submission, triage }) => (
              <article key={submission.id} className={`tone-${triage.band}`}>
                <strong>
                  {submission.id} · {formatSubmissionListTitle(submission)}
                </strong>
                <p>{triage.reasons[0] ?? nextProblem(submission)}</p>
              </article>
            ))
          ) : (
            <article>
              <strong>Нет активных AI-флагов</strong>
              <p>Очередь не содержит подсказок, требующих отдельного решения.</p>
            </article>
          )}
        </div>
      </section>

      <section>
        <header>
          <Clock aria-hidden="true" size={16} strokeWidth={1.8} />
          <h3>SLA сегодня</h3>
        </header>
        <div className="v19-admin-cockpit-sla">
          <span>
            <em>Среднее ревью</em>
            <strong>{source.length ? "37 мин" : "0 мин"}</strong>
          </span>
          <span>
            <em>Старейший пакет</em>
            <strong className="tone-orange">{oldest?.updatedAt ?? "нет"}</strong>
          </span>
          <span>
            <em>К выгрузке</em>
            <strong className="tone-green">
              {readyCount} {pluralRu(readyCount, "пакет", "пакета", "пакетов")}
            </strong>
          </span>
        </div>
      </section>

      <section>
        <h3>Операционные правила</h3>
        <div className="v19-admin-cockpit-rules">
          <span>
            <CheckCircle2 aria-hidden="true" size={16} strokeWidth={1.8} />
            Не принимать пакет с открытыми blocker-замечаниями.
          </span>
          <span>
            <CheckCircle2 aria-hidden="true" size={16} strokeWidth={1.8} />
            AI-флаг не является решением, только подсказка для проверки.
          </span>
          <span>
            <CheckCircle2 aria-hidden="true" size={16} strokeWidth={1.8} />
            После accept пакет попадает в Выгрузку с audit trail.
          </span>
        </div>
      </section>
    </aside>
  );
}

export function AdminReviewScreen({
  error = "",
  loading = false,
  onOpen,
  onRetryError,
  onSelect,
  onTab,
  permissionDenied = false,
  reviewList,
  reviewSource,
  searchControl,
  visibleSubmission,
}: {
  error?: string;
  filterControl?: ReactNode;
  loading?: boolean;
  onOpen: (submission: Submission, tab?: DrawerTab, target?: WorkspaceTarget) => void;
  onRetryError?: () => void;
  onSelect: (submission: Submission) => void;
  onTab: (tab: AdminWorkTab) => void;
  permissionDenied?: boolean;
  reviewList: Submission[];
  reviewSource: Submission[];
  reviewTab: AdminWorkTab;
  searchControl: ReactNode;
  visibleSubmission: Submission | null;
}) {
  const [activeLane, setActiveLane] = useState<AdminReviewLaneFilter>("all");
  const [mobileCityFilter, setMobileCityFilter] =
    useState<(typeof adminReviewCityFilters)[number]>("Все города");
  const [mobileAgentFilter, setMobileAgentFilter] = useState(adminReviewAllAgents);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const [mobileSummaryOpen, setMobileSummaryOpen] = useState(false);
  const prefersReducedMotion = useReducedMotion();
  const sourceList = reviewSource.length ? reviewSource : reviewList;
  const sortedReviewSourceList = useMemo(
    () => sortSubmissionsForOperations(sourceList, "priority"),
    [sourceList],
  );
  const agentFilterOptions = useMemo(() => {
    const names = Array.from(
      new Set(
        sortedReviewSourceList
          .map((submission) => agentOwnerDisplayName(submission.agentId))
          .filter(Boolean),
      ),
    ).sort((left, right) => left.localeCompare(right, "ru"));

    return [adminReviewAllAgents, ...names];
  }, [sortedReviewSourceList]);
  const visibleReviewList = useMemo(
    () =>
      sortedReviewSourceList.filter((submission) => {
        const cityMatches =
          mobileCityFilter === "Все города" || submission.city === mobileCityFilter;
        const agentMatches =
          mobileAgentFilter === adminReviewAllAgents ||
          agentOwnerDisplayName(submission.agentId) === mobileAgentFilter;

        return cityMatches && agentMatches;
      }),
    [mobileAgentFilter, mobileCityFilter, sortedReviewSourceList],
  );
  const allQueue = visibleReviewList.filter(matchesReviewTab("all"));
  const reviewQueue = visibleReviewList.filter(matchesReviewTab("review"));
  const correctionsQueue = visibleReviewList.filter(matchesReviewTab("corrections"));
  const readyQueue = visibleReviewList.filter(matchesReviewTab("ready"));
  const triageRadar = useMemo(
    () => buildAdminTriageRadar(visibleReviewList),
    [visibleReviewList],
  );
  const triageBySubmissionId = useMemo(
    () => new Map(triageRadar.items.map((item) => [item.submissionId, item])),
    [triageRadar],
  );
  const reviewItems = useMemo(
    () =>
      visibleReviewList.map((submission) => ({
        submission,
        triage: triageBySubmissionId.get(submission.id) ?? adminTriageRadarItem(submission),
      })),
    [triageBySubmissionId, visibleReviewList],
  );
  const laneItems = useMemo(() => {
    const queues: Record<AdminReviewLaneId, typeof reviewItems> = {
      ready: [],
      returned: [],
      review: [],
      urgent: [],
    };

    reviewItems.forEach((item) => {
      queues[adminReviewLaneFor(item.submission, item.triage)].push(item);
    });

    return queues;
  }, [reviewItems]);
  const visibleLanes =
    activeLane === "all"
      ? adminReviewLaneConfig
      : adminReviewLaneConfig.filter((lane) => lane.id === activeLane);
  const hasActiveLaneItems =
    activeLane === "all"
      ? visibleReviewList.length > 0
      : laneItems[activeLane].length > 0;
  const activeLaneTitle =
    activeLane === "all"
      ? "Все пакеты"
      : (adminReviewLaneConfig.find((lane) => lane.id === activeLane)?.title ?? "Очередь");
  const visibleSelectedSubmission =
    visibleSubmission &&
    visibleReviewList.some((submission) => submission.id === visibleSubmission.id)
      ? visibleSubmission
      : null;
  const actionSubmission =
    permissionDenied || loading || error
      ? null
      : (visibleSelectedSubmission ?? visibleReviewList[0] ?? null);
  const tabCounts = {
    all: allQueue.length,
    corrections: correctionsQueue.length,
    ready: readyQueue.length,
    review: reviewQueue.length,
  };
  const totalBlockers = visibleReviewList.reduce(
    (total, submission) => total + blockerCount(submission),
    0,
  );
  const totalWarnings = visibleReviewList.reduce(
    (total, submission) => total + adminReviewWarningCount(submission),
    0,
  );

  useEffect(() => {
    if (!mobileFiltersOpen && !mobileSummaryOpen) return;

    function handleAdminMobileSheetEscape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      setMobileFiltersOpen(false);
      setMobileSummaryOpen(false);
    }

    window.addEventListener("keydown", handleAdminMobileSheetEscape);
    return () => window.removeEventListener("keydown", handleAdminMobileSheetEscape);
  }, [mobileFiltersOpen, mobileSummaryOpen]);

  function chooseLane(nextLane: AdminReviewLaneFilter, keepSheetOpen = false) {
    transitionUiState(() => {
      setActiveLane(nextLane);
      onTab(reviewTabForLane[nextLane]);
      if (!keepSheetOpen) setMobileFiltersOpen(false);
    });
  }

  function countByMobileFilter(
    city: string,
    agent: string,
    lane: AdminReviewLaneFilter = "all",
  ) {
    return sortedReviewSourceList.filter((submission) => {
      const triage = adminTriageRadarItem(submission);
      const laneMatches = lane === "all" || adminReviewLaneFor(submission, triage) === lane;
      const cityMatches = city === "Все города" || submission.city === city;
      const agentMatches =
        agent === adminReviewAllAgents ||
        agentOwnerDisplayName(submission.agentId) === agent;

      return laneMatches && cityMatches && agentMatches;
    }).length;
  }

  function openAdminReviewSubmission(
    submission: Submission,
    triage: AdminTriageRadarItem = adminTriageRadarItem(submission),
  ) {
    const target = triage.target;
    const defaultTab = adminWorkDrawerTabFor(submission);
    const tab =
      defaultTab === "issues" ? defaultTab : drawerTabForScreenTarget(target, defaultTab);

    setMobileFiltersOpen(false);
    setMobileSummaryOpen(false);
    onSelect(submission);
    onOpen(submission, tab, defaultTab === "issues" ? undefined : target);
  }

  const renderBlockedState = (
    title: string,
    description: string,
    tone: "danger" | "warning" = "warning",
    actionLabel?: string,
    onShow?: () => void,
  ) => (
    <AdminWorkEmptyState
      actionLabel={actionLabel}
      description={description}
      iconTone={tone}
      title={title}
      onShow={onShow}
    />
  );

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="v19-screen-grid v19-admin-review-screen v19-admin-cockpit"
      initial={prefersReducedMotion ? { opacity: 1, y: 0 } : { opacity: 0, y: 10 }}
      transition={{ duration: prefersReducedMotion ? 0.01 : 0.22 }}
    >
      <section className="v19-admin-cockpit-main" aria-labelledby="review-title">
        <h2 id="review-title" className="sr-only">
          Очередь администратора
        </h2>

        <div className="v19-admin-cockpit-hero">
          <div>
            <span className="v19-admin-cockpit-kicker">
              <ShieldCheck aria-hidden="true" size={14} strokeWidth={1.8} />
              Admin review cockpit
            </span>
            <h2>Проверка пакетов</h2>
            <p>
              Очередь показывает приоритет, блокеры, следующее действие, AI-флаги и
              готовность к выгрузке.
            </p>
          </div>
          <Button
            className="v19-admin-cockpit-hero-cta"
            disabled={!actionSubmission}
            onClick={() => actionSubmission && openAdminReviewSubmission(actionSubmission)}
          >
            Открыть первый пакет
            <ArrowRight aria-hidden="true" size={16} strokeWidth={1.8} />
          </Button>
        </div>

        <div className="v19-admin-cockpit-metrics" aria-label="Сводка проверки">
          <AdminReviewMetricCard icon={FileText} label="В очереди" value={`${allQueue.length}`} />
          <AdminReviewMetricCard
            icon={Flame}
            label="Блокеры"
            tone="red"
            value={`${totalBlockers}`}
          />
          <AdminReviewMetricCard
            icon={AlertCircle}
            label="Проверить"
            tone="orange"
            value={`${totalWarnings || tabCounts.review}`}
          />
          <AdminReviewMetricCard
            icon={CheckCircle2}
            label="К выгрузке"
            tone="green"
            value={`${tabCounts.ready}`}
          />
        </div>

        <div className="v19-admin-cockpit-board">
          <div className="v19-admin-cockpit-toolbar">
            <div className="v19-admin-cockpit-tabs" role="tablist" aria-label="Очередь проверки">
              <button
                aria-selected={activeLane === "all"}
                className={activeLane === "all" ? "is-active" : ""}
                role="tab"
                type="button"
                onClick={() => chooseLane("all")}
              >
                Все
              </button>
              {adminReviewLaneConfig.map((lane) => {
                const Icon = lane.icon;
                return (
                  <button
                    aria-selected={activeLane === lane.id}
                    className={activeLane === lane.id ? `is-active tone-${lane.tone}` : ""}
                    key={lane.id}
                    role="tab"
                    type="button"
                    onClick={() => chooseLane(lane.id)}
                  >
                    <Icon aria-hidden="true" size={14} strokeWidth={1.8} />
                    {lane.title}
                    <span>{laneItems[lane.id].length}</span>
                  </button>
                );
              })}
            </div>
            <div className="v19-admin-cockpit-tools">
              <div className="v19-admin-cockpit-search">
                <Search aria-hidden="true" size={16} strokeWidth={1.8} />
                {searchControl}
              </div>
              <button
                aria-label="Фильтры очереди"
                type="button"
                onClick={() => setMobileFiltersOpen(true)}
              >
                <Filter aria-hidden="true" size={16} strokeWidth={1.8} />
              </button>
            </div>
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
            renderBlockedState(
              "Очередь недоступна",
              error,
              "danger",
              onRetryError ? "Повторить" : undefined,
              onRetryError,
            )
          ) : visibleReviewList.length && hasActiveLaneItems ? (
            <div className="v19-admin-cockpit-lanes" aria-label="Очередь проверки">
              {visibleLanes.map((lane) => (
                <AdminReviewLaneColumn
                  items={laneItems[lane.id]}
                  key={lane.id}
                  lane={lane}
                  onOpen={openAdminReviewSubmission}
                />
              ))}
            </div>
          ) : (
            <div className="v19-admin-cockpit-board-empty">
              <AdminWorkEmptyState
                description={
                  activeLane === "all"
                    ? "Новые задачи появятся после отправки подачи агентом или получения исправлений."
                    : "В этой очереди сейчас нет пакетов."
                }
                actionLabel="Показать все"
                title={
                  activeLane === "all"
                    ? "Нет пакетов на проверке"
                    : `${activeLaneTitle}: пусто`
                }
                onShow={() => chooseLane("all")}
              />
            </div>
          )}
        </div>

        <div className="v19-admin-mobile-dock" aria-label="Действия очереди">
          <button
            type="button"
            onClick={() => actionSubmission && openAdminReviewSubmission(actionSubmission)}
          >
            Первый
          </button>
          <button type="button" onClick={() => setMobileSummaryOpen(true)}>
            Сводка
          </button>
          <button type="button" onClick={() => setMobileFiltersOpen(true)}>
            Фильтры
          </button>
        </div>
      </section>

      <AdminReviewCockpitRail source={reviewItems} />

      <AnimatePresence>
        {mobileSummaryOpen ? (
          <>
            <motion.aside
              animate={{ opacity: 1, y: 0 }}
              aria-label="Сводка очереди"
              className="v19-admin-mobile-sheet"
              exit={{
                opacity: 0,
                y: prefersReducedMotion ? 0 : 12,
              }}
              initial={{
                opacity: prefersReducedMotion ? 1 : 0,
                y: prefersReducedMotion ? 0 : 16,
              }}
              transition={{ duration: prefersReducedMotion ? 0.01 : 0.18 }}
            >
            <div className="v19-admin-mobile-sheet-head">
              <div>
                <span>Сводка очереди</span>
                <strong>Проверка пакетов</strong>
              </div>
              <button type="button" aria-label="Закрыть" onClick={() => setMobileSummaryOpen(false)}>
                <X aria-hidden="true" size={16} strokeWidth={1.8} />
              </button>
            </div>
            <div className="v19-admin-mobile-metrics">
              <AdminReviewMetricCard icon={FileText} label="В очереди" value={`${allQueue.length}`} />
              <AdminReviewMetricCard
                icon={Flame}
                label="Блокеры"
                tone="red"
                value={`${totalBlockers}`}
              />
              <AdminReviewMetricCard
                icon={AlertCircle}
                label="Проверить"
                tone="orange"
                value={`${totalWarnings || tabCounts.review}`}
              />
              <AdminReviewMetricCard
                icon={CheckCircle2}
                label="К выгрузке"
                tone="green"
                value={`${tabCounts.ready}`}
              />
            </div>
            </motion.aside>
            <motion.button
              aria-label="Закрыть сводку"
              animate={{ opacity: 1 }}
              className="v19-admin-mobile-sheet-backdrop"
              exit={{ opacity: 0 }}
              initial={{ opacity: prefersReducedMotion ? 1 : 0 }}
              transition={{ duration: prefersReducedMotion ? 0.01 : 0.16 }}
              type="button"
              onClick={() => setMobileSummaryOpen(false)}
            />
          </>
        ) : null}
      </AnimatePresence>

      <AnimatePresence>
        {mobileFiltersOpen ? (
          <>
            <motion.aside
              animate={{ opacity: 1, y: 0 }}
              aria-label="Фильтры очереди"
              className="v19-admin-mobile-sheet"
              exit={{
                opacity: 0,
                y: prefersReducedMotion ? 0 : 12,
              }}
              initial={{
                opacity: prefersReducedMotion ? 1 : 0,
                y: prefersReducedMotion ? 0 : 16,
              }}
              transition={{ duration: prefersReducedMotion ? 0.01 : 0.18 }}
            >
            <div className="v19-admin-mobile-sheet-head">
              <div>
                <span>Фильтры очереди</span>
                <strong>
                  {activeLane === "all"
                    ? "Все пакеты"
                    : adminReviewLaneConfig.find((lane) => lane.id === activeLane)?.title}
                </strong>
              </div>
              <button type="button" aria-label="Закрыть" onClick={() => setMobileFiltersOpen(false)}>
                <X aria-hidden="true" size={16} strokeWidth={1.8} />
              </button>
            </div>
            <div className="v19-admin-sheet-filter-collections">
              <section aria-label="Статусы очереди" className="v19-admin-sheet-filter-section">
                <span>Статус</span>
                <div className="v19-admin-sheet-filter-row">
                  <button
                    className={activeLane === "all" ? "is-active" : ""}
                    type="button"
                    onClick={() => chooseLane("all", true)}
                  >
                    Все
                    <small>
                      {countByMobileFilter(mobileCityFilter, mobileAgentFilter, "all")}
                    </small>
                  </button>
                  {adminReviewLaneConfig.map((lane) => {
                    const Icon = lane.icon;
                    return (
                      <button
                        className={activeLane === lane.id ? "is-active" : ""}
                        key={lane.id}
                        type="button"
                        onClick={() => chooseLane(lane.id, true)}
                      >
                        <Icon aria-hidden="true" size={16} strokeWidth={1.8} />
                        {lane.title}
                        <small>
                          {countByMobileFilter(mobileCityFilter, mobileAgentFilter, lane.id)}
                        </small>
                      </button>
                    );
                  })}
                </div>
              </section>

              <section aria-label="Города" className="v19-admin-sheet-filter-section">
                <span>Города</span>
                <div className="v19-admin-sheet-filter-row">
                  {adminReviewCityFilters.map((city) => (
                    <button
                      className={mobileCityFilter === city ? "is-active" : ""}
                      key={city}
                      type="button"
                      onClick={() => setMobileCityFilter(city)}
                    >
                      <MapPin aria-hidden="true" size={16} strokeWidth={1.8} />
                      {city}
                      <small>{countByMobileFilter(city, mobileAgentFilter, activeLane)}</small>
                    </button>
                  ))}
                </div>
              </section>

              <section aria-label="Агенты" className="v19-admin-sheet-filter-section">
                <span>Агенты</span>
                <div className="v19-admin-sheet-filter-row">
                  {agentFilterOptions.map((agent) => (
                    <button
                      className={mobileAgentFilter === agent ? "is-active" : ""}
                      key={agent}
                      type="button"
                      onClick={() => setMobileAgentFilter(agent)}
                    >
                      <Building2 aria-hidden="true" size={16} strokeWidth={1.8} />
                      {agent}
                      <small>{countByMobileFilter(mobileCityFilter, agent, activeLane)}</small>
                    </button>
                  ))}
                </div>
              </section>
            </div>
            </motion.aside>
            <motion.button
              aria-label="Закрыть фильтры"
              animate={{ opacity: 1 }}
              className="v19-admin-mobile-sheet-backdrop"
              exit={{ opacity: 0 }}
              initial={{ opacity: prefersReducedMotion ? 1 : 0 }}
              transition={{ duration: prefersReducedMotion ? 0.01 : 0.16 }}
              type="button"
              onClick={() => setMobileFiltersOpen(false)}
            />
          </>
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

function adminReviewFacts(submission: Submission) {
  const issue = primarySubmissionIssue(submission) ?? adminReviewVisibleIssues(submission)[0];
  const openIssues = openIssueCount(submission);
  const fixedIssues = fixedIssueCount(submission);
  const status = statusLabelFor(submission.status, "compact");
  const reason = issue ? `${issue.reason} · ${issueTargetLine(issue)}` : nextProblem(submission);
  const owner =
    submission.status === "ready_for_export"
      ? "Администратор выгрузки"
      : openIssues > 0
        ? "Агент после возврата"
        : "Администратор проверки";
  const nextAction =
    submission.status === "ready_for_export"
      ? "Проверить условия выгрузки"
      : submission.status === "corrections_received" || fixedIssues > 0
        ? "Закрыть исправления или вернуть"
        : openIssues > 0
          ? "Вернуть с замечаниями"
          : "Принять или вернуть";
  const ctaTab = adminWorkDrawerTabFor(submission);
  const ctaLabel =
    submission.status === "ready_for_export"
      ? "Открыть пакет"
      : submission.status === "corrections_received"
        ? "Проверить"
        : openIssues > 0
          ? "Вернуть"
          : "Проверить";

  return { ctaLabel, ctaTab, nextAction, owner, reason, status };
}

function adminReviewVisibleIssues(submission: Submission) {
  return submission.issues
    .filter((issue) => issue.status === "open" || issue.status === "fixed_by_agent")
    .slice(0, 3);
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

export function LegacyExportScreen({
  exportBusy = false,
  exportError = "",
  exportPlan,
  exportTab,
  filterControl,
  historyList,
  onDownload,
  onGenerate,
  onChoosePackage,
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
  onChoosePackage: (id: string) => void;
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
  const [exportPanelOpen, setExportPanelOpen] = useState(() =>
    defaultContextRailOpen(),
  );
  const [sortMode, setSortMode] = useState<SubmissionSortMode>("updated");
  const [entityMode, setEntityMode] = useState<V19EntityViewMode>("all");
  const [mobileExportStep, setMobileExportStep] = useState<ExportMobileStep>(1);
  const selectedExportIdSet = useMemo(
    () => new Set(selectedExportIds),
    [selectedExportIds],
  );
  const exportReadyList = useMemo(
    () => readyList.filter(isSubmissionSelectableForExport),
    [readyList],
  );
  const exportBlockedList = useMemo(
    () => readyList.filter((submission) => !isSubmissionSelectableForExport(submission)),
    [readyList],
  );
  const sortedReadyList = useMemo(
    () => sortSubmissionsForOperations(exportReadyList, sortMode),
    [exportReadyList, sortMode],
  );
  const sortedBlockedList = useMemo(
    () => sortSubmissionsForOperations(exportBlockedList, sortMode),
    [exportBlockedList, sortMode],
  );
  const sortedHistoryList = useMemo(
    () => sortSubmissionsForOperations(historyList, sortMode),
    [historyList, sortMode],
  );
  const visibleReadyList = useMemo(
    () => filterByEntityMode(sortedReadyList, entityMode),
    [entityMode, sortedReadyList],
  );
  const visibleBlockedList = useMemo(
    () => filterByEntityMode(sortedBlockedList, entityMode),
    [entityMode, sortedBlockedList],
  );
  const visibleHistoryList = useMemo(
    () => filterByEntityMode(sortedHistoryList, entityMode),
    [entityMode, sortedHistoryList],
  );
  const visibleExportTypeCounts = submissionTypeCounts(
    exportTab === "ready"
      ? [...sortedReadyList, ...sortedBlockedList]
      : sortedHistoryList,
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
  const hiddenNotReadyCount = visibleBlockedList.length;
  const allReadySelected =
    visibleReadyList.length > 0 &&
    visibleReadyList.every((submission) => selectedExportIdSet.has(submission.id));
  const handleToggleAllReady = (checked: boolean) => {
    visibleReadyList.forEach((submission) => {
      const selected = selectedExportIdSet.has(submission.id);
      if (checked !== selected) onToggle(submission.id);
    });
  };

  useEffect(() => {
    if (typeof window === "undefined" || typeof document === "undefined") return;

    const resetHorizontalScroll = () => {
      document
        .querySelectorAll<HTMLElement>(
          ".ops-shell.surface-export, .ops-shell.surface-export .workspace, .ops-shell.surface-export .export-grid, .ops-shell.surface-export .magic-export-queue, .ops-shell.surface-export .v19-export-toolbar, .ops-shell.surface-export .v19-state-tabs, .ops-shell.surface-export .v19-entity-switch, .ops-shell.surface-export .magic-export-list, .ops-shell.surface-export .table-wrap",
        )
        .forEach((element) => {
          element.scrollLeft = 0;
        });
    };

    resetHorizontalScroll();
    const frameId = window.requestAnimationFrame(resetHorizontalScroll);
    return () => window.cancelAnimationFrame(frameId);
  }, [
    entityMode,
    exportPanelOpen,
    exportTab,
    selectedExportIds.length,
    sortMode,
    visibleHistoryList.length,
    visibleReadyList.length,
  ]);

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
              { count: readyList.length, id: "ready", label: "Пакеты" },
              { count: sortedHistoryList.length, id: "history", label: "История" },
            ]}
            tabsAriaLabel="Состояние выгрузки"
            tools={toolbarTools}
            value={exportTab}
            variant="regular"
          />
          <V19EntityTypeSwitch
            counts={visibleExportTypeCounts}
            value={entityMode}
            onChange={(mode) => setEntityMode(mode)}
          />
          <ExportMobileFlow
            actionHint={actionHint}
            exportBusy={exportBusy}
            exportError={exportError}
            exportPlan={exportPlan}
            mobileStep={mobileExportStep}
            onDownload={onDownload}
            onGenerate={onGenerate}
            onChoosePackage={onChoosePackage}
            onMarkExported={onMarkExported}
            onOpen={onOpen}
            onStep={setMobileExportStep}
            readyList={visibleReadyList}
            blockedList={visibleBlockedList}
            selectedExportIds={selectedExportIds}
          />
          <div className="v19-export-desktop-content">
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
                              aria-label={`Открыть пакет ${submission.title}`}
                              className="export-row-main"
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                onOpen(submission);
                              }}
                            >
                              <span className="cell-title">{submission.title}</span>
                              <span className="subtle mono">{submission.id}</span>
                              <span className="export-row-note">
                                Ответственный: администратор · Дальше: сформировать Excel
                              </span>
                              <span className="export-row-note">
                                Причина: {exportStateLabel(submission)}
                              </span>
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
                    {visibleBlockedList.map((submission) => {
                      const blockedReason = exportBlockedReason(submission);
                      const reasonId = `export-blocked-${submission.id}`;

                      return (
                        <tr
                          aria-label={`Пакет ${submission.title}, выгрузка заблокирована`}
                          className="export-row magic-export-row export-contract-row is-blocked"
                          key={submission.id}
                          onClick={() => onOpen(submission, "issues")}
                        >
                          <td onClick={(event) => event.stopPropagation()}>
                            <input
                              aria-describedby={reasonId}
                              aria-label={`Нельзя выбрать ${submission.title}`}
                              checked={false}
                              className="checkbox"
                              disabled
                              type="checkbox"
                            />
                          </td>
                          <td>
                            <button
                              aria-describedby={reasonId}
                              aria-label={`Открыть блокеры ${submission.title}`}
                              className="export-row-main"
                              type="button"
                              onClick={(event) => {
                                event.stopPropagation();
                                onOpen(submission, "issues");
                              }}
                            >
                              <span className="cell-title">{submission.title}</span>
                              <span className="subtle mono">{submission.id}</span>
                              <span className="export-row-note" id={reasonId}>
                                Причина: {blockedReason}
                              </span>
                              <span className="export-row-note">
                                Владелец: агент должен исправить · Дальше: смотреть блокеры
                              </span>
                            </button>
                          </td>
                          <td>{submission.city}</td>
                          <td>{exportTripDates(submission)}</td>
                          <td>{submission.applicants.length}</td>
                          <td>
                            <Badge tone="amber">Заблокировано</Badge>
                          </td>
                          <td>
                            <Button
                              className="export-table-row-action"
                              variant="secondary"
                              onClick={(event) => {
                                event.stopPropagation();
                                onOpen(submission, "issues");
                              }}
                            >
                              Смотреть блокеры
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
                    Заблокировано fail-closed: {hiddenNotReadyCount}{" "}
                    {pluralRu(hiddenNotReadyCount, "подача", "подачи", "подач")} с
                    проблемами в статусе, файлах или строках.
                  </span>
                </div>
              ) : null}
              {visibleReadyList.length === 0 && visibleBlockedList.length === 0 ? (
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
          </div>
        </CardComponent>

        {exportPanelOpen ? (
          <ContextPanel
            className="export-side magic-export-side v17-export-context-rail"
            label="Контекст выгрузки"
            header={
              <div className="v17-export-rail-head">
                <div>
                  <p className="kicker">Контракт выгрузки</p>
                  <h2>
                    Excel · {exportPlan.contract.columnCount} колонок
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
            }
            footer={
              <PanelActionFooter
                primary={{
                  disabled: exportBusy || !exportPlan.canGenerate,
                  disabledReason:
                    !exportPlan.canGenerate || exportBusy ? actionHint : undefined,
                  label: "Сформировать Excel",
                  onClick: onGenerate,
                }}
                secondary={[
                  {
                    disabled: exportBusy || !exportPlan.canDownload,
                    disabledReason:
                      !exportPlan.canDownload || exportBusy ? actionHint : undefined,
                    label: "Скачать Excel",
                    onClick: onDownload,
                  },
                  {
                    disabled: exportBusy || !exportPlan.canMarkExported,
                    disabledReason:
                      !exportPlan.canMarkExported || exportBusy
                        ? actionHint
                        : undefined,
                    label: "Отметить выгружено",
                    onClick: onMarkExported,
                  },
                ]}
                status={<span id="export-action-hint">{actionHint}</span>}
              />
            }
          >
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
                    <strong>Поля Excel</strong>
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
          </ContextPanel>
        ) : null}
      </div>
    </>
  );
}

export function ExportScreen(props: Parameters<typeof LegacyExportScreen>[0]) {
  return <AdminExportReferenceCockpit {...props} />;
}

function AdminExportReferenceCockpit({
  exportBusy = false,
  exportError = "",
  exportPlan,
  exportTab,
  historyList,
  onDownload,
  onGenerate,
  onChoosePackage,
  onMarkExported,
  onOpen,
  onTab,
  onToggle,
  readyList,
  searchControl,
  selectedExportIds,
}: Parameters<typeof LegacyExportScreen>[0]) {
  const [mobileSummaryOpen, setMobileSummaryOpen] = useState(false);
  const selectedExportIdSet = useMemo(
    () => new Set(selectedExportIds),
    [selectedExportIds],
  );
  const exportReadyList = useMemo(
    () => readyList.filter(isSubmissionSelectableForExport),
    [readyList],
  );
  const exportBlockedList = useMemo(
    () => readyList.filter((submission) => !isSubmissionSelectableForExport(submission)),
    [readyList],
  );
  const selectedReadySubmissions = useMemo(
    () =>
      exportReadyList.filter((submission) =>
        selectedExportIdSet.has(submission.id),
      ),
    [exportReadyList, selectedExportIdSet],
  );
  const previewColumns = exportPlan.preview.headers.slice(0, 9);
  const previewRows = exportPlan.preview.rows.slice(0, 4);
  const mappingAudit = buildExportMappingAudit(exportPlan.preview);
  const mappingRows = mappingAudit.rows;
  const mappedCount = mappingAudit.mappedCount;
  const derivedCount = mappingAudit.derivedCount;
  const unresolvedCount = mappingAudit.unresolvedCount;
  const activeSubmission =
    selectedReadySubmissions[0] ??
    exportReadyList[0] ??
    exportBlockedList[0] ??
    historyList[0] ??
    null;
  const selectedSubmissionCount = selectedReadySubmissions.length;
  const selectedApplicantCount = exportPlan.rowCount;
  const selectedFiles = selectedReadySubmissions.reduce(
    (sum, submission) => sum + submission.files.length,
    0,
  );
  const selectedWarnings = exportPlan.warnings.length;
  const hasExportBlockers = exportPlan.blockers.length > 0;
  const allReadySelected =
    exportReadyList.length > 0 &&
    exportReadyList.every((submission) => selectedExportIdSet.has(submission.id));
  const packageFacts = exportPackageFacts(exportPlan);
  const actionHint =
    exportError ||
    (exportBusy ? "Формируем и проверяем Excel-файл..." : exportActionHint(exportPlan));
  const activeBlockers = activeSubmission ? getExportBlockers([activeSubmission]) : [];
  const showingHistory = exportTab === "history";
  const selectedComposition =
    selectedReadySubmissions.length > 0
      ? selectedReadySubmissions
      : activeSubmission
        ? [activeSubmission]
        : [];
  const checks = [
    {
      icon: ShieldCheck,
      label: "Открытые блокеры",
      state: !exportHasBlocker(exportPlan, "блокирующие замечания") ? "ok" : "warn",
      value: exportHasBlocker(exportPlan, "блокирующие замечания") ? "есть" : "0",
    },
    {
      icon: FileSpreadsheet,
      label: "Предпросмотр",
      state: exportPlan.contract.valid && exportPlan.rowCount > 0 ? "ok" : "neutral",
      value: exportPlan.rowCount > 0 ? "готов" : "не выбран",
    },
    {
      icon: FileArchive,
      label: "Файлы пакета",
      state:
        !exportHasBlocker(exportPlan, "канонического пакета медиа") &&
        exportPlan.rowCount > 0
          ? "ok"
          : "neutral",
      value: `${selectedFiles} ${pluralRu(selectedFiles, "файл", "файла", "файлов")}`,
    },
    {
      icon: Lock,
      label: "Дубликаты экспорта",
      state: !exportHasBlocker(exportPlan, "уже выгруженные подачи") ? "ok" : "warn",
      value: exportHasBlocker(exportPlan, "уже выгруженные подачи") ? "есть" : "нет",
    },
    {
      icon: AlertTriangle,
      label: "Предупреждения",
      state: selectedWarnings > 0 ? "warn" : "ok",
      value: String(selectedWarnings),
    },
  ] satisfies AdminExportPanelCheck[];
  const toggleAllReady = () => {
    transitionUiState(() => {
      exportReadyList.forEach((submission) => {
        const selected = selectedExportIdSet.has(submission.id);
        if (selected === allReadySelected) onToggle(submission.id);
      });
    });
  };
  return (
    <div
      className="v19-admin-export-reference"
      data-testid="admin-export-reference-screen"
    >
      <section className="v19-admin-export-main" aria-labelledby="export-title">
        <div className="v19-admin-export-metrics" aria-label="Сводка выгрузки">
          <AdminExportMetricCard
            icon={CheckCircle2}
            label="Готовы"
            tone="success"
            value={readyList.length}
            detail="пакетов в очереди"
          />
          <AdminExportMetricCard
            icon={PackageCheck}
            label="Выбрано"
            tone="review"
            value={selectedSubmissionCount}
            detail={`${selectedApplicantCount} ${pluralRu(selectedApplicantCount, "заявитель", "заявителя", "заявителей")}`}
          />
          <AdminExportMetricCard
            icon={FileArchive}
            label="Документы"
            value={selectedFiles}
            detail="файлов в пакете"
          />
          <AdminExportMetricCard
            icon={hasExportBlockers ? XCircle : ShieldCheck}
            label="Проверка"
            tone={hasExportBlockers ? "warning" : "success"}
            value={hasExportBlockers ? "стоп" : "готово"}
            detail={`${selectedWarnings} ${pluralRu(selectedWarnings, "предупреждение", "предупреждения", "предупреждений")}`}
          />
        </div>

        <div className="v19-admin-export-list">
          <div className="v19-admin-export-list-head">
            <div className="v19-admin-export-title-copy">
              <h2 id="export-title">
                {showingHistory ? "История выгрузки" : "Пакеты к выгрузке"}
              </h2>
              <p>
                Формирование Excel, контроль файлов и экспортных блокеров.
              </p>
            </div>
            <div className="v19-admin-export-tools">
              <div className="v19-admin-export-search">{searchControl}</div>
              <div className="v19-admin-export-filter-control">
                <button
                  className="v19-admin-export-icon-button"
                  type="button"
                  aria-label={showingHistory ? "Пакеты" : "История"}
                  onClick={() =>
                    transitionUiState(() => onTab(showingHistory ? "ready" : "history"))
                  }
                >
                  <Filter aria-hidden="true" focusable="false" size={16} />
                  <span>{showingHistory ? "Пакеты" : "История"}</span>
                </button>
              </div>
            </div>
          </div>

          <div className="v19-admin-export-table-head" aria-hidden="true">
            <button
              className={`v19-admin-export-checkbox ${allReadySelected ? "is-selected" : ""}`}
              type="button"
              aria-label="Выбрать все совместимые"
              disabled={exportBusy || exportReadyList.length === 0}
              onClick={toggleAllReady}
            >
              {allReadySelected ? (
                <CheckSquare aria-hidden="true" focusable="false" size={14} />
              ) : null}
            </button>
            <div>Пакет / заявитель</div>
            <div>Слот</div>
            <div>Готовность</div>
            <div>Размер</div>
          </div>

          <div
            className={`v19-admin-export-rows ${
              showingHistory ? "export-history-table" : ""
            }`}
          >
            {showingHistory ? (
              historyList.length > 0 ? (
                historyList.map((submission) => (
                  <AdminExportRow
                    history
                    key={submission.id}
                    submission={submission}
                    disabled={exportBusy}
                    onOpen={() => onOpen(submission, "files")}
                  />
                ))
              ) : (
                <EmptyState text="История выгрузки пока пуста." />
              )
            ) : readyList.length > 0 ? (
              <>
                {exportReadyList.map((submission) => (
                  <AdminExportRow
                    key={submission.id}
                    submission={submission}
                    disabled={exportBusy}
                    selected={selectedExportIdSet.has(submission.id)}
                    onChoose={() => onChoosePackage(submission.id)}
                    onOpen={() => onOpen(submission)}
                    onToggle={() => onToggle(submission.id)}
                  />
                ))}
                {exportBlockedList.map((submission) => (
                  <AdminExportRow
                    blockedReason={exportBlockedReason(submission)}
                    disabled={exportBusy}
                    key={submission.id}
                    submission={submission}
                    onOpen={() => onOpen(submission, "issues")}
                  />
                ))}
              </>
            ) : (
              <EmptyState text="Нет подач готовых к выгрузке." />
            )}
          </div>
        </div>
      </section>

      <aside className="v19-admin-export-side" aria-label="Контекст выгрузки">
        <div className="v19-admin-export-side-head">
          <div>
            <span>Выгрузка</span>
            <h3>Сводка</h3>
            <h2>{exportPackageTitle(exportPlan)}</h2>
            <p>Контроль состава, блокеров, файлов и истории перед Excel.</p>
          </div>
          <div className="v19-admin-export-side-icon" aria-hidden="true">
            <FolderCheck focusable="false" size={20} />
          </div>
        </div>

        <div className="v19-admin-export-side-body">
          <section className="v19-admin-export-rail-card">
            <div className="v19-admin-export-active-head">
              <div>
                <span>Активный пакет</span>
                <strong>{activeSubmission?.title ?? "Не выбран"}</strong>
              </div>
              <AdminExportStatusPill
                tone={activeBlockers.length > 0 ? "warning" : "success"}
              >
                {activeBlockers.length > 0 ? "есть блокеры" : "готов"}
              </AdminExportStatusPill>
            </div>
            {activeSubmission ? (
              <div className="v19-admin-export-active-grid">
                <span>
                  <small>Заявители</small>
                  <strong>{activeSubmission.applicants.length}</strong>
                </span>
                <span>
                  <small>Город</small>
                  <strong>{activeSubmission.city}</strong>
                </span>
                <span>
                  <small>Файлы</small>
                  <strong>{activeSubmission.files.length}</strong>
                </span>
                <span>
                  <small>Слот</small>
                  <strong>{exportTripDates(activeSubmission)}</strong>
                </span>
              </div>
            ) : null}
          </section>

          <section className="v19-admin-export-rail-card">
            <div className="v19-admin-export-card-head">
              <h4>Проверки перед выгрузкой</h4>
              <AdminExportStatusPill tone={hasExportBlockers ? "warning" : "success"}>
                {hasExportBlockers ? "нужна правка" : "можно выгружать"}
              </AdminExportStatusPill>
            </div>
            <div className="v19-admin-export-checks">
              {checks.map((check) => (
                <AdminExportCheckRow key={check.label} {...check} />
              ))}
            </div>
          </section>

          <section
            className="v19-admin-export-rail-card export-preview magic-export-preview"
            aria-label="Предпросмотр Excel"
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
          </section>

          <section className="v19-admin-export-rail-card v17-export-mapping-card">
            <div className="mapping-audit" aria-label="Аудит сопоставления 56 колонок">
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
          </section>

          <section className="v19-admin-export-rail-card">
            <div className="v19-admin-export-card-head">
              <h4>Состав выгрузки</h4>
              <span>{selectedSubmissionCount} пак.</span>
            </div>
            <div className="v19-admin-export-composition">
              {selectedComposition.length > 0 ? (
                selectedComposition.map((submission) => (
                  <AdminExportCompositionItem
                    key={submission.id}
                    submission={submission}
                    onOpen={() => onOpen(submission)}
                  />
                ))
              ) : (
                <div className="v19-admin-export-empty-inline">
                  Выберите пакеты слева
                </div>
              )}
            </div>
          </section>

          <section className="v19-admin-export-rail-card">
            <div className="v19-admin-export-card-head is-left">
              <HistoryIcon aria-hidden="true" focusable="false" size={16} />
              <h4>История сегодня</h4>
              <button
                aria-selected={showingHistory}
                role="tab"
                type="button"
                onClick={() => transitionUiState(() => onTab("history"))}
              >
                История
              </button>
            </div>
            <div className="v19-admin-export-history">
              {historyList.slice(0, 3).length > 0 ? (
                historyList.slice(0, 3).map((submission) => (
                  <button
                    key={submission.id}
                    type="button"
                    onClick={() => onOpen(submission, "files")}
                  >
                    <strong>{submission.title}</strong>
                    <span>
                      {submission.updatedAt} · {returnedPdfPackageSummary(submission).label}
                    </span>
                  </button>
                ))
              ) : (
                <span>Сегодня ещё нет завершённых выгрузок</span>
              )}
            </div>
          </section>
        </div>

        <div className="v19-admin-export-footer">
          <button
            className="v19-admin-export-primary-action"
            type="button"
            disabled={exportBusy || !exportPlan.canGenerate}
            aria-describedby="export-action-hint"
            onClick={onGenerate}
          >
            {exportBusy ? (
              <UploadCloud aria-hidden="true" focusable="false" size={16} />
            ) : (
              <Download aria-hidden="true" focusable="false" size={16} />
            )}
            <span>{exportBusy ? "Формируем Excel..." : "Сформировать Excel"}</span>
            {!exportBusy ? (
              <ArrowRight aria-hidden="true" focusable="false" size={16} />
            ) : null}
          </button>
          <div className="v19-admin-export-secondary-actions">
            <button
              type="button"
              disabled={exportBusy || !exportPlan.canDownload}
              onClick={onDownload}
            >
              Скачать Excel
            </button>
            <button
              type="button"
              disabled={exportBusy || !exportPlan.canMarkExported}
              onClick={onMarkExported}
            >
              Отметить выгружено
            </button>
          </div>
          <p id="export-action-hint">{actionHint}</p>
          <p>
            {packageFacts.city} · {packageFacts.dates}
          </p>
        </div>
      </aside>

      <div className="v19-admin-export-mobile-dock" aria-label="Действия выгрузки">
        <button type="button" onClick={() => setMobileSummaryOpen(true)}>
          Сводка
        </button>
        <button
          type="button"
          disabled={exportBusy || !exportPlan.canGenerate}
          onClick={onGenerate}
        >
          {exportBusy ? "Excel..." : "Выгрузить"}
        </button>
      </div>

      <AnimatePresence>
        {mobileSummaryOpen ? (
          <AdminExportMobileSheet
            actionHint={actionHint}
            checks={checks}
            exportPlan={exportPlan}
            hasExportBlockers={hasExportBlockers}
            onClose={() => setMobileSummaryOpen(false)}
            selectedApplicantCount={selectedApplicantCount}
            selectedFiles={selectedFiles}
            selectedSubmissionCount={selectedSubmissionCount}
            selectedWarnings={selectedWarnings}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}

function AdminExportMetricCard({
  detail,
  icon: Icon,
  label,
  tone = "neutral",
  value,
}: {
  detail: string;
  icon: LucideIcon;
  label: string;
  tone?: "neutral" | "review" | "success" | "warning";
  value: number | string;
}) {
  return (
    <div className={`v19-admin-export-metric tone-${tone}`}>
      <div>
        <span>{label}</span>
        <Icon aria-hidden="true" focusable="false" size={16} />
      </div>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function AdminExportRow({
  blockedReason,
  disabled = false,
  history = false,
  onChoose,
  onOpen,
  onToggle,
  selected = false,
  submission,
}: {
  blockedReason?: string;
  disabled?: boolean;
  history?: boolean;
  onChoose?: () => void;
  onOpen: () => void;
  onToggle?: () => void;
  selected?: boolean;
  submission: Submission;
}) {
  const blocked = Boolean(blockedReason);
  const progress = blocked
    ? Math.max(0, Math.min(100, Math.round(submission.completeness.total)))
    : 100;
  const fileLabel = `${submission.files.length} ${pluralRu(
    submission.files.length,
    "файл",
    "файла",
    "файлов",
  )}`;
  const documentLabel = `Анкета + ${submission.files.length} документов`;
  const historyPdfSummary = history ? returnedPdfPackageSummary(submission) : null;
  const rowStatus = history
    ? historyPdfSummary?.label
    : blocked
      ? "блокер"
      : "Готово";

  return (
    <article
      aria-label={`${history ? "Выгруженный пакет" : blocked ? "Пакет с блокером" : "Пакет к выгрузке"} ${submission.title}`}
      className={`export-row v19-admin-export-row ${selected ? "is-selected" : ""} ${
        blocked ? "is-blocked" : ""
      } ${history ? "is-history" : ""}`}
    >
      {!blocked && !history ? (
        <input
          aria-label={selected ? `Убрать ${submission.title} из выгрузки` : `Выбрать ${submission.title}`}
          checked={selected}
          className="v19-admin-export-checkbox-native"
          disabled={disabled}
          type="checkbox"
          onChange={() => onToggle?.()}
        />
      ) : null}
      <button
        className={`v19-admin-export-checkbox ${selected ? "is-selected" : ""}`}
        type="button"
        aria-label={
          history
            ? "Открыть запись истории"
            : blocked
              ? `Открыть блокеры ${submission.title}`
            : selected
              ? `Убрать ${submission.title} из выгрузки`
              : `Выбрать ${submission.title}`
        }
        disabled={disabled && !blocked}
        onClick={blocked || history ? onOpen : onToggle}
      >
        {selected ? (
          <CheckSquare aria-hidden="true" focusable="false" size={14} />
        ) : blocked ? (
          <AlertTriangle aria-hidden="true" focusable="false" size={14} />
        ) : history ? (
          <FileText aria-hidden="true" focusable="false" size={14} />
        ) : null}
      </button>

      <button
        className="v19-admin-export-row-main"
        type="button"
        onClick={blocked || history ? onOpen : (onChoose ?? onOpen)}
      >
        <span className="v19-admin-export-row-title">
          <span className="v19-admin-export-row-kind" aria-hidden="true">
            {submission.type === "family" ? (
              <Users focusable="false" size={16} />
            ) : (
              <User focusable="false" size={16} />
            )}
          </span>
          <strong>{submission.title}</strong>
          <small>{submission.id}</small>
        </span>
        <span className="v19-admin-export-row-meta">
          <FileText aria-hidden="true" focusable="false" size={14} />
          <span>{documentLabel}</span>
        </span>
        {blockedReason ? (
          <span className="v19-admin-export-row-reason">{blockedReason}</span>
        ) : null}
      </button>

      <div className="v19-admin-export-slot">{exportTripDates(submission)}</div>

      <div className="v19-admin-export-progress">
        <span>
          <i style={{ width: `${progress}%` }} />
        </span>
        <strong>{progress}%</strong>
      </div>

      <div className="v19-admin-export-row-end">
        <AdminExportStatusPill tone={blocked ? "warning" : "success"}>
          {rowStatus}
        </AdminExportStatusPill>
        <span>{historyPdfSummary?.detail ?? fileLabel}</span>
      </div>
    </article>
  );
}

function AdminExportStatusPill({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "review" | "success" | "warning";
}) {
  return (
    <span className={`v19-admin-export-status tone-${tone}`}>{children}</span>
  );
}

function AdminExportCheckRow({
  icon: Icon,
  label,
  state,
  value,
}: {
  icon: LucideIcon;
  label: string;
  state: "neutral" | "ok" | "warn";
  value: string;
}) {
  return (
    <div className={`v19-admin-export-check state-${state}`}>
      <span>
        <Icon aria-hidden="true" focusable="false" size={16} />
        <strong>{label}</strong>
      </span>
      <em>{value}</em>
    </div>
  );
}

function AdminExportCompositionItem({
  onOpen,
  submission,
}: {
  onOpen: () => void;
  submission: Submission;
}) {
  return (
    <button
      className="v19-admin-export-composition-item"
      type="button"
      onClick={onOpen}
    >
      <span aria-hidden="true">
        {submission.type === "family" ? (
          <Users focusable="false" size={16} />
        ) : (
          <User focusable="false" size={16} />
        )}
      </span>
      <strong>{submission.title}</strong>
      <small>
        {submission.id} · {submission.applicants.length} чел.
      </small>
      <ChevronRight aria-hidden="true" focusable="false" size={16} />
    </button>
  );
}

function AdminExportMobileSheet({
  actionHint,
  checks,
  exportPlan,
  hasExportBlockers,
  onClose,
  selectedApplicantCount,
  selectedFiles,
  selectedSubmissionCount,
  selectedWarnings,
}: {
  actionHint: string;
  checks: Array<{
    icon: LucideIcon;
    label: string;
    state: "neutral" | "ok" | "warn";
    value: string;
  }>;
  exportPlan: ExportSummary;
  hasExportBlockers: boolean;
  onClose: () => void;
  selectedApplicantCount: number;
  selectedFiles: number;
  selectedSubmissionCount: number;
  selectedWarnings: number;
}) {
  const prefersReducedMotion = useReducedMotion();

  return (
    <motion.div
      animate={{ opacity: 1 }}
      className="v19-admin-export-mobile-presence"
      exit={{ opacity: 0 }}
      initial={{ opacity: prefersReducedMotion ? 1 : 0 }}
      transition={{ duration: prefersReducedMotion ? 0.01 : 0.16 }}
    >
      <motion.aside
        animate={{ opacity: 1, y: 0 }}
        className="v19-admin-export-mobile-sheet"
        aria-label="Сводка выгрузки"
        exit={{ opacity: 0, y: prefersReducedMotion ? 0 : 12 }}
        initial={{
          opacity: prefersReducedMotion ? 1 : 0,
          y: prefersReducedMotion ? 0 : 16,
        }}
        transition={{ duration: prefersReducedMotion ? 0.01 : 0.18 }}
      >
        <div className="v19-admin-export-mobile-sheet-head">
          <div>
            <span>Сводка выгрузки</span>
            <strong>Excel</strong>
          </div>
          <button type="button" aria-label="Закрыть" onClick={onClose}>
            <X aria-hidden="true" focusable="false" size={16} />
          </button>
        </div>
        <div className="v19-admin-export-sheet-metrics">
          <AdminExportMetricCard
            icon={PackageCheck}
            label="Выбрано"
            value={selectedSubmissionCount}
            detail={`${selectedApplicantCount} заявителей`}
          />
          <AdminExportMetricCard
            icon={FileArchive}
            label="Документы"
            value={selectedFiles}
            detail="файлов"
          />
          <AdminExportMetricCard
            icon={hasExportBlockers ? XCircle : ShieldCheck}
            label="Проверка"
            tone={hasExportBlockers ? "warning" : "success"}
            value={hasExportBlockers ? "стоп" : "готово"}
            detail={`${selectedWarnings} ${pluralRu(selectedWarnings, "предупреждение", "предупреждения", "предупреждений")}`}
          />
          <AdminExportMetricCard
            icon={FileSpreadsheet}
            label="Строки"
            value={exportPlan.rowCount}
            detail={exportPlan.contract.range}
          />
        </div>
        <div className="v19-admin-export-sheet-checks">
          {checks.map((check) => (
            <AdminExportCheckRow key={check.label} {...check} />
          ))}
        </div>
        <div className="v19-admin-export-sheet-note">{actionHint}</div>
      </motion.aside>
      <button
        aria-label="Закрыть сводку выгрузки"
        className="v19-admin-export-sheet-backdrop"
        type="button"
        onClick={onClose}
      />
    </motion.div>
  );
}

function ExportMobileFlow({
  actionHint,
  blockedList,
  exportBusy,
  exportError,
  exportPlan,
  mobileStep,
  onDownload,
  onGenerate,
  onChoosePackage,
  onMarkExported,
  onOpen,
  onStep,
  readyList,
  selectedExportIds,
}: {
  actionHint: string;
  blockedList: Submission[];
  exportBusy: boolean;
  exportError: string;
  exportPlan: ExportSummary;
  mobileStep: ExportMobileStep;
  onDownload: () => void;
  onGenerate: () => void;
  onChoosePackage: (id: string) => void;
  onMarkExported: () => void;
  onOpen: (submission: Submission, tab?: DrawerTab) => void;
  onStep: (step: ExportMobileStep) => void;
  readyList: Submission[];
  selectedExportIds: string[];
}) {
  const selectedIdSet = new Set(selectedExportIds);
  const stepTitle = exportMobileStepTitle(mobileStep);
  const selectedSubmissionCount = new Set(
    exportPlan.rows.map((row) => row.submissionId),
  ).size;
  const stepDisabledReason = exportPlan.ready
    ? ""
    : (exportPlan.blockers[0]?.reason ?? "Пакет не прошел проверку выгрузки.");
  const previewRows = exportPlan.rows.slice(0, 8);

  return (
    <div className="v19-export-mobile-flow" aria-label="Мобильная выгрузка">
      <div className="v19-export-mobile-step-head">
        <strong>{mobileStep} / 4&nbsp; {stepTitle}</strong>
        <span aria-hidden="true">
          {[1, 2, 3, 4].map((step) => (
            <i
              className={step <= mobileStep ? "is-complete" : ""}
              key={step}
            />
          ))}
        </span>
      </div>

      {mobileStep === 1 ? (
        <div className="v19-export-mobile-step-body">
          {readyList.length || blockedList.length ? (
            <>
              {readyList.map((submission) => {
                const selected = selectedIdSet.has(submission.id);

                return (
                  <article
                    className={`v19-export-mobile-package ${
                      selected ? "is-selected" : ""
                    }`}
                    key={submission.id}
                  >
                    <strong>{submission.title}</strong>
                    <span>Строки: {submission.applicants.length}</span>
                    <span>Статус: {exportStateLabel(submission)}</span>
                    <span>Ответственный: администратор</span>
                    <span>Дальше: проверить условия</span>
                    <Button
                      variant="secondary"
                      onClick={() => {
                        onChoosePackage(submission.id);
                        onStep(2);
                      }}
                    >
                      Выбрать пакет
                    </Button>
                  </article>
                );
              })}
              {blockedList.map((submission) => (
                <article className="v19-export-mobile-package is-blocked" key={submission.id}>
                  <strong>{submission.title}</strong>
                  <span>Строки: {submission.applicants.length}</span>
                  <span>Статус: блокеры</span>
                  <span>Ошибка: {exportBlockedReason(submission)}</span>
                  <span>Дальше: устранить блокеры</span>
                  <Button variant="secondary" onClick={() => onOpen(submission, "issues")}>
                    Смотреть блокеры
                  </Button>
                </article>
              ))}
            </>
          ) : (
            <EmptyState text="Нет пакетов для выгрузки." />
          )}
        </div>
      ) : null}

      {mobileStep === 2 ? (
        <div className="v19-export-mobile-step-body">
          <div className="v19-export-mobile-checks">
            <ExportGuardItem
              ok={exportPlan.rowCount > 0}
              label="Пакет принят и выбран"
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
              ok={exportPlan.contract.valid && exportPlan.rowCount > 0}
              label="Данные строк валидны"
            />
            <ExportGuardItem
              detail={exportPlan.ready ? "Можно перейти к предпросмотру" : stepDisabledReason}
              ok={exportPlan.ready}
              label="Пакет экспортируем"
            />
          </div>
          <div className="v19-export-mobile-step-footer">
            <Button
              aria-describedby={!exportPlan.ready ? "export-mobile-disabled-reason" : undefined}
              disabled={!exportPlan.ready}
              variant="primary"
              onClick={() => onStep(3)}
            >
              Продолжить
            </Button>
            {!exportPlan.ready ? (
              <p id="export-mobile-disabled-reason" role="status">
                Причина: {stepDisabledReason}
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {mobileStep === 3 ? (
        <div className="v19-export-mobile-step-body">
          {previewRows.length ? (
            previewRows.map((row, index) => (
              <article className="v19-export-mobile-preview-row" key={`${row.submissionId}-${row.applicantId}`}>
                <strong>Строка {index + 1}</strong>
                <span>Имя: {row.applicantName || "имя отсутствует"}</span>
                <span>Город: {row.city || "город отсутствует"}</span>
                <span>Дата: {row.tripDates || "дата отсутствует"}</span>
                <span>Статус: {exportPlan.ready ? "готово" : "ошибка"}</span>
              </article>
            ))
          ) : (
            <EmptyState text="Сначала выберите пакет." />
          )}
          <div className="v19-export-mobile-step-footer">
            <Button variant="secondary" onClick={() => onStep(2)}>
              Назад
            </Button>
            <Button
              disabled={!exportPlan.ready}
              variant="primary"
              onClick={() => onStep(4)}
            >
              Продолжить
            </Button>
          </div>
        </div>
      ) : null}

      {mobileStep === 4 ? (
        <div className="v19-export-mobile-step-body">
          <section className="v19-export-mobile-summary" aria-label="Сводка выгрузки">
            <strong>{exportPackageTitle(exportPlan)}</strong>
            <span>Пакеты: {selectedSubmissionCount}</span>
            <span>Строки: {exportPlan.rowCount}</span>
            <span>Предупреждения: {exportPlan.warnings.length}</span>
            <span>Ошибки: {exportPlan.blockers.length}</span>
            {exportError ? <span role="alert">{exportError}</span> : null}
          </section>
          <div className="v19-export-mobile-step-footer">
            <PanelActionFooter
              primary={{
                disabled: exportBusy || !exportPlan.canGenerate,
                disabledReason:
                  !exportPlan.canGenerate || exportBusy ? actionHint : undefined,
                label: "Сформировать Excel",
                onClick: onGenerate,
              }}
              secondary={[
                {
                  disabled: exportBusy || !exportPlan.canDownload,
                  disabledReason:
                    !exportPlan.canDownload || exportBusy ? actionHint : undefined,
                  label: "Скачать Excel",
                  onClick: onDownload,
                },
                {
                  disabled: exportBusy || !exportPlan.canMarkExported,
                  disabledReason:
                    !exportPlan.canMarkExported || exportBusy
                      ? actionHint
                      : undefined,
                  label: "Отметить выгружено",
                  onClick: onMarkExported,
                },
              ]}
              status={<span id="export-mobile-action-hint">{actionHint}</span>}
            />
          </div>
        </div>
      ) : null}
    </div>
  );
}

function exportMobileStepTitle(step: ExportMobileStep) {
  if (step === 1) return "Выбрать пакет";
  if (step === 2) return "Проверить условия";
  if (step === 3) return "Предпросмотр строк";
  return "Сформировать Excel";
}

function exportBlockedReason(submission: Submission) {
  return getExportBlockers([submission])[0]?.reason ?? "Выгрузка заблокирована";
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
