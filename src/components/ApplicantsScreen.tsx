import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
} from "react";
import { motion, useReducedMotion } from "motion/react";
import {
  AlertCircle,
  ArrowUpDown,
  Baby,
  Camera,
  CheckCircle2,
  ClipboardPenLine,
  FileStack,
  IdCard,
  ListFilter,
  RotateCcw,
  UserRound,
  UsersRound,
} from "lucide-react";
import type {
  QuestionnaireInitialFocus,
} from "../modules/submissions/components/FigmaQuestionnaireScreen";
import {
  applicantWorkflowActions,
  type ApplicantWorkflowAction,
} from "../modules/submissions/applicantWorkflow";
import { familyDisplayTitleFromMainApplicantName } from "../modules/submissions/listFormatters";
import {
  relativeSubmissionCreatedAt,
  resolveSubmissionCreatedAt,
  submissionCreatedAtDateTime,
} from "../modules/submissions/relativeCreatedAt";
import {
  cityFilterValuesForSubmissions,
  filterAgentSubmissionQueue,
  questionnaireCityForSubmission,
  type AgentSubmissionQueueFilter,
} from "../modules/submissions/selectors";
import {
  submissionPublicId,
  submissionPublicNumber,
} from "../modules/submissions/submissionIdentity";
import {
  canAgentEditSubmission,
  canPerformAction,
  statusLabelFor,
} from "../modules/submissions/status";
import type {
  Applicant,
  Submission,
  SubmissionFileType,
} from "../modules/submissions/types";
import type { WorkspaceTarget } from "../modules/submissions/workspaceModel";
import {
  V19ListHeader,
  V19MetricCard,
  V19MetricStrip,
  V19QueueCard,
  V19QueueToolbar,
  V19ToolbarSelect,
} from "../shared/ui/v19-design-system";

export type SubmissionTypeFilter = "all" | "family" | "single";
export type ApplicantSort = "createdAsc" | "createdDesc" | "tripDate";

export type ApplicantFocusRequest = {
  revision: number;
  submissionId: string;
  type: Submission["type"];
};

interface ApplicantsScreenProps {
  focusRequest?: ApplicantFocusRequest;
  onOpenDrawer: (id: string) => void;
  onOpenQuestionnaire?: (
    id: string,
    initialFocus?: QuestionnaireInitialFocus,
  ) => void;
  onOpenWorkspaceTarget?: (id: string, target: WorkspaceTarget) => void;
  onSubmitForReview?: (id: string) => Promise<void>;
  onTypeFilterChange?: (filter: SubmissionTypeFilter) => void;
  onUploadApplicantFile?: (
    submissionId: string,
    applicantId: string,
    fileType: SubmissionFileType,
    file: File,
  ) => Promise<void>;
  submissions?: Submission[];
  typeFilter?: SubmissionTypeFilter;
}

type ApplicantMarker = "child" | "female" | "male" | "person";

const emptySubmissions: Submission[] = [];
const minuteMs = 60_000;

const actionLabels: Record<ApplicantWorkflowAction["kind"], string> = {
  passport_scan: "Паспорт",
  questionnaire: "Анкета",
  selfie: "Селфи 1",
  selfie_2: "Селфи 2",
};

const actionStateLabels: Record<ApplicantWorkflowAction["state"], string> = {
  attention: "нужна доработка",
  missing: "не добавлено",
  ready: "готово",
};

function questionnaireValueForApplicant(
  submission: Submission,
  applicantId: string,
  fieldId: string,
) {
  const applicant = submission.applicants.find((item) => item.id === applicantId);
  return (
    applicant?.sections
      .flatMap((section) => section.fields)
      .find((field) => field.id === fieldId)
      ?.value.trim() ?? ""
  );
}

function applicantMarker(
  submission: Submission,
  applicant: Applicant,
): ApplicantMarker {
  if (applicant.role === "child") return "child";
  const gender = questionnaireValueForApplicant(
    submission,
    applicant.id,
    "gender",
  ).toLowerCase();
  if (gender.includes("жен") || gender === "female" || gender === "f") {
    return "female";
  }
  if (gender.includes("муж") || gender === "male" || gender === "m") {
    return "male";
  }
  return "person";
}

function applicantRoleLabel(
  role: Applicant["role"],
  marker: ApplicantMarker,
) {
  if (role === "child") return "Ребёнок";
  if (role === "spouse") {
    return marker === "male"
      ? "Супруг"
      : marker === "female"
        ? "Супруга"
        : "Супруг/супруга";
  }
  return undefined;
}

function ApplicantMarkerIcon({ marker }: { marker: ApplicantMarker }) {
  const Icon = marker === "child" ? Baby : UserRound;
  const label = marker === "child" ? "Ребёнок" : "Заявитель";
  return <Icon aria-label={label} className="v19-applicant-person-icon" />;
}

function actionIcon(action: ApplicantWorkflowAction) {
  if (action.kind === "questionnaire") {
    return <ClipboardPenLine aria-hidden="true" />;
  }
  if (action.kind === "passport_scan") return <IdCard aria-hidden="true" />;
  return (
    <>
      <Camera aria-hidden="true" />
      <span aria-hidden="true" className="v19-applicant-workflow-index">
        {action.kind === "selfie" ? "1" : "2"}
      </span>
    </>
  );
}

function ApplicantWorkflowActionButton({
  action,
  applicant,
  onOpenQuestionnaire,
  onOpenWorkspaceTarget,
  onUploadApplicantFile,
  submission,
}: {
  action: ApplicantWorkflowAction;
  applicant: Applicant;
  onOpenQuestionnaire?: ApplicantsScreenProps["onOpenQuestionnaire"];
  onOpenWorkspaceTarget?: ApplicantsScreenProps["onOpenWorkspaceTarget"];
  onUploadApplicantFile?: ApplicantsScreenProps["onUploadApplicantFile"];
  submission: Submission;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const label = actionLabels[action.kind];
  const stateLabel = actionStateLabels[action.state];
  const accessibleLabel = `${label}: ${stateLabel}, ${applicant.fullName}`;
  const isQuestionnaire = action.kind === "questionnaire";
  const canPickFile = canAgentEditSubmission(submission) && Boolean(onUploadApplicantFile);

  const activate = () => {
    if (action.kind === "questionnaire") {
      if (action.state === "ready") {
        window.alert("Анкета уже заполнена");
        return;
      }
      onOpenQuestionnaire?.(submission.id, {
        applicantId: applicant.id,
        field: action.field,
        section: action.section,
      });
      return;
    }
    if (action.issueId) {
      onOpenWorkspaceTarget?.(submission.id, {
        issueId: action.issueId,
        tab: "issues",
      });
      return;
    }
    if (action.state === "ready") {
      onOpenWorkspaceTarget?.(submission.id, {
        applicantId: applicant.id,
        fileType: action.kind,
        tab: "files",
      });
      return;
    }
    if (!canPickFile) {
      window.alert("Файл нельзя загрузить в текущем статусе подачи.");
      return;
    }
    inputRef.current?.click();
  };

  const uploadSelectedFile = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || action.kind === "questionnaire" || !onUploadApplicantFile) return;
    setUploading(true);
    try {
      await onUploadApplicantFile(
        submission.id,
        applicant.id,
        action.kind,
        file,
      );
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Не удалось загрузить файл.",
      );
    } finally {
      setUploading(false);
    }
  };

  return (
    <span className="v19-applicant-workflow-action-wrap">
      <button
        aria-label={accessibleLabel}
        className={`v19-applicant-workflow-action is-${action.state}`}
        disabled={uploading}
        title={accessibleLabel}
        type="button"
        onClick={activate}
      >
        {actionIcon(action)}
      </button>
      {!isQuestionnaire ? (
        <input
          ref={inputRef}
          accept={
            action.kind === "passport_scan"
              ? "image/jpeg,image/png,image/webp,application/pdf"
              : "image/jpeg,image/png,image/webp"
          }
          aria-hidden="true"
          aria-label={`Выбрать файл: ${label}, ${applicant.fullName}`}
          className="sr-only"
          hidden
          tabIndex={-1}
          type="file"
          onChange={(event) => void uploadSelectedFile(event)}
        />
      ) : null}
    </span>
  );
}

function ApplicantWorkflowActions({
  applicant,
  onOpenQuestionnaire,
  onOpenWorkspaceTarget,
  onUploadApplicantFile,
  submission,
}: {
  applicant: Applicant;
  onOpenQuestionnaire?: ApplicantsScreenProps["onOpenQuestionnaire"];
  onOpenWorkspaceTarget?: ApplicantsScreenProps["onOpenWorkspaceTarget"];
  onUploadApplicantFile?: ApplicantsScreenProps["onUploadApplicantFile"];
  submission: Submission;
}) {
  return (
    <div
      aria-label={`Документы: ${applicant.fullName}`}
      className="v19-applicant-workflow-actions"
      role="group"
    >
      {applicantWorkflowActions(submission, applicant).map((action) => (
        <ApplicantWorkflowActionButton
          action={action}
          applicant={applicant}
          key={action.kind}
          onOpenQuestionnaire={onOpenQuestionnaire}
          onOpenWorkspaceTarget={onOpenWorkspaceTarget}
          onUploadApplicantFile={onUploadApplicantFile}
          submission={submission}
        />
      ))}
    </div>
  );
}

function lifecycleStatusTone(status: Submission["status"]) {
  if (status === "submitted_for_review" || status === "corrections_received") {
    return "is-review";
  }
  if (status === "ready_for_export" || status === "exported") return "is-ready";
  if (status === "returned" || status === "requires_action") return "is-returned";
  return "is-progress";
}

function SubmissionCreatedAt({
  createdAt,
  now,
}: {
  createdAt: string;
  now: Date;
}) {
  return (
    <time
      className="v19-applicant-created-at"
      dateTime={submissionCreatedAtDateTime(createdAt, now)}
    >
      {relativeSubmissionCreatedAt(createdAt, now)}
    </time>
  );
}

type CardCallbacks = Pick<
  ApplicantsScreenProps,
  | "onOpenQuestionnaire"
  | "onOpenWorkspaceTarget"
  | "onUploadApplicantFile"
> & {
  canSubmitForReview: boolean;
  error?: string;
  now: Date;
  onPrimaryAction: (submission: Submission) => void;
  submitting: boolean;
};

function AssignedPublicId({ submission }: { submission: Submission }) {
  return submissionPublicNumber(submission) === null ? null : (
    <span>{submissionPublicId(submission)}</span>
  );
}

function SubmissionStatusAction({
  canSubmitForReview,
  label,
  onPrimaryAction,
  submission,
  submitting,
}: {
  canSubmitForReview: boolean;
  label: string;
  onPrimaryAction: (submission: Submission) => void;
  submission: Submission;
  submitting: boolean;
}) {
  const canSubmit =
    canSubmitForReview &&
    canPerformAction(submission, "submit_for_review", "agent").ok;

  if (canSubmit) {
    const actionLabel = submitting ? "Отправляем…" : "Отправить на проверку";
    return (
      <button
        aria-label={`${actionLabel}: ${label}`}
        className="v19-applicant-status-action"
        disabled={submitting}
        type="button"
        onClick={() => onPrimaryAction(submission)}
      >
        {actionLabel}
      </button>
    );
  }

  return (
    <span
      className={`v19-applicant-card-status ${lifecycleStatusTone(submission.status)}`}
    >
      {statusLabelFor(submission.status, "full")}
    </span>
  );
}

function FamilySubmissionCard({
  canSubmitForReview,
  error,
  now,
  onOpenQuestionnaire,
  onOpenWorkspaceTarget,
  onPrimaryAction,
  onUploadApplicantFile,
  submission,
  submitting,
}: CardCallbacks & { submission: Submission }) {
  const mainApplicant =
    submission.applicants.find((applicant) => applicant.role === "main") ??
    submission.applicants[0];
  const title =
    familyDisplayTitleFromMainApplicantName(mainApplicant?.fullName) ??
    submission.title;

  return (
    <V19QueueCard
      as="article"
      aria-label={`Подача ${title}`}
      className="v19-agent-shared-card group"
      data-submission-id={submission.id}
    >
      <div className="v19-applicant-family-header">
        <div className="v19-applicant-family-main">
          <div className="v19-agent-submission-family-icon">
            <UsersRound aria-hidden="true" />
          </div>
          <div className="v19-applicant-family-copy">
            <h3>{title}</h3>
            <p className="v19-applicant-family-meta">
              <span>{submission.applicants.length} человек</span>
              <span aria-hidden="true">·</span>
              <span>{questionnaireCityForSubmission(submission)}</span>
              <AssignedPublicId submission={submission} />
            </p>
          </div>
        </div>
        <SubmissionStatusAction
          canSubmitForReview={canSubmitForReview}
          label={title}
          onPrimaryAction={onPrimaryAction}
          submission={submission}
          submitting={submitting}
        />
      </div>

      <div className="v19-applicant-member-list">
        {submission.applicants.map((applicant) => {
          const marker = applicantMarker(submission, applicant);
          const roleLabel = applicantRoleLabel(applicant.role, marker);
          return (
            <div
              className="v19-applicant-member-cell"
              data-applicant-role={applicant.role}
              key={applicant.id}
            >
              <ApplicantMarkerIcon marker={marker} />
              <div className="v19-applicant-member-identity">
                <span className="v19-applicant-member-name">{applicant.fullName}</span>
                {roleLabel ? (
                  <span className="v19-applicant-member-role">{roleLabel}</span>
                ) : null}
              </div>
              <ApplicantWorkflowActions
                applicant={applicant}
                onOpenQuestionnaire={onOpenQuestionnaire}
                onOpenWorkspaceTarget={onOpenWorkspaceTarget}
                onUploadApplicantFile={onUploadApplicantFile}
                submission={submission}
              />
            </div>
          );
        })}
      </div>

      <div className="v19-applicant-card-footer">
        <SubmissionCreatedAt createdAt={submission.createdAt} now={now} />
        {error ? (
          <span className="v19-applicant-submit-error" role="alert">
            {error}
          </span>
        ) : null}
      </div>
    </V19QueueCard>
  );
}

function IndividualSubmissionCard({
  canSubmitForReview,
  error,
  now,
  onOpenQuestionnaire,
  onOpenWorkspaceTarget,
  onPrimaryAction,
  onUploadApplicantFile,
  submission,
  submitting,
}: CardCallbacks & { submission: Submission }) {
  const applicant = submission.applicants[0];
  const name = applicant?.fullName ?? submission.title;
  const marker = applicant ? applicantMarker(submission, applicant) : "person";

  return (
    <V19QueueCard
      as="article"
      aria-label={`Подача ${name}`}
      className="v19-agent-shared-card group"
      data-submission-id={submission.id}
    >
      <div className="v19-applicant-individual-header">
        <div className="v19-applicant-individual-main">
          <div className="v19-applicant-individual-icon">
            <ApplicantMarkerIcon marker={marker} />
          </div>
          <div className="v19-applicant-individual-copy">
            <div className="v19-applicant-individual-name-row">
              <h3>{name}</h3>
            </div>
            <p className="v19-applicant-individual-meta">
              <span>{questionnaireCityForSubmission(submission)}</span>
              <AssignedPublicId submission={submission} />
            </p>
          </div>
        </div>
        <SubmissionStatusAction
          canSubmitForReview={canSubmitForReview}
          label={name}
          onPrimaryAction={onPrimaryAction}
          submission={submission}
          submitting={submitting}
        />
      </div>

      <div className="v19-applicant-card-footer">
        <SubmissionCreatedAt createdAt={submission.createdAt} now={now} />
        {applicant ? (
          <ApplicantWorkflowActions
            applicant={applicant}
            onOpenQuestionnaire={onOpenQuestionnaire}
            onOpenWorkspaceTarget={onOpenWorkspaceTarget}
            onUploadApplicantFile={onUploadApplicantFile}
            submission={submission}
          />
        ) : null}
        {error ? (
          <span className="v19-applicant-submit-error" role="alert">
            {error}
          </span>
        ) : null}
      </div>
    </V19QueueCard>
  );
}

function metricsFromSubmissions(submissions: Submission[]) {
  const count = (filter: AgentSubmissionQueueFilter) =>
    filterAgentSubmissionQueue(submissions, {
      city: "Все города",
      filter,
      query: "",
    }).length;
  return {
    exportReady: count("ready"),
    queue: count("all"),
    review: count("review"),
  };
}

function profileNoun(count: number) {
  const lastTwo = count % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return "профилей";
  const last = count % 10;
  if (last === 1) return "профиль";
  if (last >= 2 && last <= 4) return "профиля";
  return "профилей";
}

function queueFilterLabel(filter: AgentSubmissionQueueFilter) {
  if (filter === "blockers") return "Блокеры";
  if (filter === "review") return "Проверить";
  if (filter === "ready") return "К выгрузке";
  return "";
}

function typeFilterLabel(filter: SubmissionTypeFilter) {
  if (filter === "family") return "Семья";
  if (filter === "single") return "Заявитель";
  return "Все типы";
}

function sortLabel(sort: ApplicantSort) {
  if (sort === "createdAsc") return "Сначала старые";
  if (sort === "tripDate") return "По дате поездки";
  return "Сначала новые";
}

function sortedSubmissions(
  submissions: Submission[],
  sort: ApplicantSort,
  now: Date,
) {
  return [...submissions].sort((left, right) => {
    if (sort === "tripDate") {
      const tripOrder = left.tripDateFrom.localeCompare(right.tripDateFrom);
      if (tripOrder !== 0) return tripOrder;
    } else {
      const leftTime = resolveSubmissionCreatedAt(left.createdAt, now)?.getTime() ?? 0;
      const rightTime = resolveSubmissionCreatedAt(right.createdAt, now)?.getTime() ?? 0;
      const createdOrder =
        sort === "createdAsc" ? leftTime - rightTime : rightTime - leftTime;
      if (createdOrder !== 0) return createdOrder;
    }
    return left.id.localeCompare(right.id);
  });
}

export function ApplicantsScreen({
  focusRequest,
  onOpenDrawer,
  onOpenQuestionnaire,
  onOpenWorkspaceTarget,
  onSubmitForReview,
  onTypeFilterChange,
  onUploadApplicantFile,
  submissions,
  typeFilter: controlledTypeFilter,
}: ApplicantsScreenProps) {
  const prefersReducedMotion = useReducedMotion();
  const [internalTypeFilter, setInternalTypeFilter] =
    useState<SubmissionTypeFilter>("single");
  const typeFilter = controlledTypeFilter ?? internalTypeFilter;
  const [summaryFilter, setSummaryFilter] =
    useState<AgentSubmissionQueueFilter>("all");
  const [cityFilter, setCityFilter] = useState("Все города");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<ApplicantSort>("createdDesc");
  const [relativeNow, setRelativeNow] = useState(() => Date.now());
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const canonicalSubmissions = submissions ?? emptySubmissions;
  const focusSubmissionId = focusRequest?.submissionId;
  const focusRevision = focusRequest?.revision;

  const changeTypeFilter = (filter: SubmissionTypeFilter) => {
    if (controlledTypeFilter === undefined) setInternalTypeFilter(filter);
    onTypeFilterChange?.(filter);
  };

  useEffect(() => {
    const interval = window.setInterval(() => setRelativeNow(Date.now()), minuteMs);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!focusSubmissionId || focusRevision === undefined || !focusRequest) return;
    changeTypeFilter(focusRequest.type);
    setSummaryFilter("all");
    setCityFilter("Все города");
    setSearchQuery("");
    setSortBy("createdDesc");
    let secondFrame: number | undefined;
    const firstFrame = window.requestAnimationFrame(() => {
      secondFrame = window.requestAnimationFrame(() => {
        document
          .querySelector<HTMLElement>(
            `[data-submission-id="${CSS.escape(focusSubmissionId)}"]`,
          )
          ?.scrollIntoView({
            behavior: prefersReducedMotion ? "auto" : "smooth",
            block: "start",
          });
      });
    });
    return () => {
      window.cancelAnimationFrame(firstFrame);
      if (secondFrame !== undefined) window.cancelAnimationFrame(secondFrame);
    };
    // A new revision is the event boundary; filter callbacks are intentionally not dependencies.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusRevision, focusSubmissionId, prefersReducedMotion]);

  const typedSubmissions = useMemo(
    () =>
      typeFilter === "all"
        ? canonicalSubmissions
        : canonicalSubmissions.filter((submission) => submission.type === typeFilter),
    [canonicalSubmissions, typeFilter],
  );
  const filteredSubmissions = useMemo(
    () =>
      filterAgentSubmissionQueue(typedSubmissions, {
        city: cityFilter,
        filter: summaryFilter,
        query: searchQuery,
      }),
    [cityFilter, searchQuery, summaryFilter, typedSubmissions],
  );
  const now = useMemo(() => new Date(relativeNow), [relativeNow]);
  const displayedSubmissions = useMemo(
    () => sortedSubmissions(filteredSubmissions, sortBy, now),
    [filteredSubmissions, now, sortBy],
  );
  const cityOptions = useMemo(
    () => cityFilterValuesForSubmissions(canonicalSubmissions),
    [canonicalSubmissions],
  );
  const metrics = useMemo(
    () => metricsFromSubmissions(canonicalSubmissions),
    [canonicalSubmissions],
  );
  const hasActiveFilters =
    typeFilter !== "all" ||
    summaryFilter !== "all" ||
    cityFilter !== "Все города" ||
    searchQuery.trim().length > 0 ||
    sortBy !== "createdDesc";
  const activeFilterContext = [
    typeFilterLabel(typeFilter),
    queueFilterLabel(summaryFilter),
    cityFilter !== "Все города" ? cityFilter : "",
    searchQuery.trim() ? "Поиск" : "",
    sortLabel(sortBy),
  ]
    .filter(Boolean)
    .join(" · ");

  const resetFilters = () => {
    changeTypeFilter("all");
    setSummaryFilter("all");
    setCityFilter("Все города");
    setSearchQuery("");
    setSortBy("createdDesc");
  };

  const handlePrimaryAction = async (submission: Submission) => {
    if (
      !canPerformAction(submission, "submit_for_review", "agent").ok ||
      !onSubmitForReview
    ) {
      onOpenDrawer(submission.id);
      return;
    }
    setSubmissionError(null);
    setSubmittingId(submission.id);
    try {
      await onSubmitForReview(submission.id);
    } catch (error) {
      setSubmissionError({
        id: submission.id,
        message:
          error instanceof Error
            ? error.message
            : "Не удалось отправить подачу на проверку.",
      });
    } finally {
      setSubmittingId(null);
    }
  };

  const cardCallbacks = {
    canSubmitForReview: Boolean(onSubmitForReview),
    now,
    onOpenQuestionnaire,
    onOpenWorkspaceTarget,
    onPrimaryAction: (submission: Submission) => void handlePrimaryAction(submission),
    onUploadApplicantFile,
  };

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="v19-agent-shared-screen"
      initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
      transition={{ duration: 0.3 }}
    >
      <V19MetricStrip>
        <V19MetricCard
          active={summaryFilter === "all"}
          detail={profileNoun(metrics.queue)}
          icon={FileStack}
          label="В очереди"
          value={metrics.queue}
          onClick={() => setSummaryFilter("all")}
        />
        <V19MetricCard
          active={summaryFilter === "review"}
          detail="ревью"
          icon={AlertCircle}
          label="Проверить"
          tone="amber"
          value={metrics.review}
          onClick={() => setSummaryFilter("review")}
        />
        <V19MetricCard
          active={summaryFilter === "ready"}
          detail="экспорт"
          icon={CheckCircle2}
          label="К выгрузке"
          tone="green"
          value={metrics.exportReady}
          onClick={() => setSummaryFilter("ready")}
        />
      </V19MetricStrip>

      <div className="v19-admin-export-workspace-v2 v19-agent-submissions-board">
        <V19ListHeader
          actionDisabled={!hasActiveFilters}
          actionLabel="Все"
          className="v19-admin-export-list-head-v2"
          countLabel={
            hasActiveFilters
              ? `${activeFilterContext} · ${displayedSubmissions.length}/${metrics.queue}`
              : `${metrics.queue} ${profileNoun(metrics.queue)}`
          }
          onAction={resetFilters}
          title="Мои подачи"
        />
        <V19QueueToolbar
          actionDisabled={!hasActiveFilters}
          actionIcon={RotateCcw}
          cityFilter={cityFilter}
          cityOptions={cityOptions}
          controls={
            <>
              <V19ToolbarSelect<SubmissionTypeFilter>
                ariaLabel="Тип подачи"
                className={typeFilter !== "all" ? "is-active" : ""}
                icon={UsersRound}
                label="Тип"
                options={[
                  { label: "Все", value: "all" },
                  { label: "Заявитель", value: "single" },
                  { label: "Семья", value: "family" },
                ]}
                value={typeFilter}
                onChange={changeTypeFilter}
              />
              <V19ToolbarSelect<AgentSubmissionQueueFilter>
                ariaLabel="Фильтр подач"
                className={summaryFilter !== "all" ? "is-active" : ""}
                icon={ListFilter}
                label="Статус"
                options={[
                  { label: "Все", value: "all" },
                  { label: "Блокеры", value: "blockers" },
                  { label: "Проверить", value: "review" },
                  { label: "К выгрузке", value: "ready" },
                ]}
                value={summaryFilter}
                onChange={setSummaryFilter}
              />
              <V19ToolbarSelect<ApplicantSort>
                ariaLabel="Сортировка подач"
                className={sortBy !== "createdDesc" ? "is-active" : ""}
                icon={ArrowUpDown}
                label="Сортировка"
                options={[
                  { label: "Сначала новые", value: "createdDesc" },
                  { label: "Сначала старые", value: "createdAsc" },
                  { label: "По дате поездки", value: "tripDate" },
                ]}
                value={sortBy}
                onChange={setSortBy}
              />
            </>
          }
          filterLabel="Сбросить фильтры"
          onCityFilterChange={setCityFilter}
          onFilterClick={resetFilters}
          onSearchChange={setSearchQuery}
          searchAriaLabel="Поиск по подачам"
          searchPlaceholder="VF-номер, семья или заявитель"
          searchValue={searchQuery}
        />

        <div className="v19-agent-submissions-list">
          {!displayedSubmissions.length ? (
            <div className="v19-applicant-empty-state" role="status">
              <h2>Ничего не найдено</h2>
              <p>Измените поисковый запрос или фильтры.</p>
              <button type="button" onClick={resetFilters}>
                Сбросить фильтры
              </button>
            </div>
          ) : (
            <section
              aria-labelledby="agent-submissions-visible"
              className="v19-agent-submissions-group"
            >
              <h2 id="agent-submissions-visible">
                {typeFilter === "family"
                  ? "Семьи"
                  : typeFilter === "single"
                    ? "Заявители"
                    : "Все подачи"}
              </h2>
              {displayedSubmissions.map((submission) =>
                submission.type === "family" ? (
                  <FamilySubmissionCard
                    {...cardCallbacks}
                    error={
                      submissionError?.id === submission.id
                        ? submissionError.message
                        : undefined
                    }
                    key={submission.id}
                    submission={submission}
                    submitting={submittingId === submission.id}
                  />
                ) : (
                  <IndividualSubmissionCard
                    {...cardCallbacks}
                    error={
                      submissionError?.id === submission.id
                        ? submissionError.message
                        : undefined
                    }
                    key={submission.id}
                    submission={submission}
                    submitting={submittingId === submission.id}
                  />
                ),
              )}
            </section>
          )}
        </div>
      </div>
    </motion.div>
  );
}
