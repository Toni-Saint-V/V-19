import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { motion } from "motion/react";
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
  Trash2,
  UserRound,
  UsersRound,
} from "lucide-react";
import type { QuestionnaireInitialFocus } from "../modules/submissions/components/FigmaQuestionnaireScreen";
import { useExperienceReducedMotion } from "../shared/ui/experiencePreferences";
import { ConfirmationDialog } from "../modules/submissions/components/Primitives";
import {
  applicantWorkflowActions,
  type ApplicantWorkflowAction,
} from "../modules/submissions/applicantWorkflow";
import { familyDisplayTitleFromMainApplicantName } from "../modules/submissions/listFormatters";
import {
  passportScanUploadAccept,
  selfieUploadAccept,
} from "../modules/submissions/mediaStoragePolicy";
import {
  relativeSubmissionCreatedAt,
  resolveSubmissionCreatedAt,
  submissionCreatedAtDateTime,
} from "../modules/submissions/relativeCreatedAt";
import { agentSubmissionCardArchiveDecision } from "../modules/submissions/agentSubmissionCardArchive";
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
  agentQuestionnaireCompletionDecision,
  canAgentEditSubmission,
  statusLabelFor,
} from "../modules/submissions/status";
import type {
  Applicant,
  Submission,
  SubmissionFileType,
} from "../modules/submissions/types";
import type { WorkspaceTarget } from "../modules/submissions/workspaceModel";
import { agentInteractionProps } from "../modules/submissions/agentInteractionContract";
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
  onOpenQuestionnaire?: (id: string, initialFocus?: QuestionnaireInitialFocus) => void;
  onOpenWorkspaceTarget?: (id: string, target: WorkspaceTarget) => void;
  onDeleteSubmission?: (id: string) => Promise<void>;
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

function ApplicantMarkerIcon({ marker }: { marker: ApplicantMarker }) {
  const Icon = marker === "child" ? Baby : UserRound;
  const label = marker === "child" ? "Ребёнок" : "Заявитель";
  return <Icon aria-label={label} className="v19-applicant-person-icon" />;
}

function applicantCardDisplayName(applicant: Applicant, index: number) {
  const normalizedName = applicant.fullName.trim().toLowerCase();
  const isRolePlaceholder = [
    "основной заявитель",
    "супруг",
    "супруга",
    "супруг/супруга",
    "ребенок",
    "ребёнок",
  ].includes(normalizedName);

  return isRolePlaceholder ? `Заявитель ${index + 1}` : applicant.fullName;
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
  isReplaced,
  onOpenQuestionnaire,
  onOpenWorkspaceTarget,
  onUploadApplicantFile,
  submission,
}: {
  action: ApplicantWorkflowAction;
  applicant: Applicant;
  isReplaced: boolean;
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
  const canPickFile =
    canAgentEditSubmission(submission) && Boolean(onUploadApplicantFile);

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
      await onUploadApplicantFile(submission.id, applicant.id, action.kind, file);
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
        {...agentInteractionProps(
          action.kind === "questionnaire"
            ? "submissions.open-questionnaire"
            : action.state === "ready"
              ? "submissions.open"
              : "submissions.upload-file",
        )}
        aria-label={accessibleLabel}
        className={`v19-applicant-workflow-action is-${action.state}`}
        disabled={uploading}
        tabIndex={isReplaced ? -1 : undefined}
        title={accessibleLabel}
        type="button"
        onClick={activate}
      >
        {actionIcon(action)}
      </button>
      {!isQuestionnaire ? (
        <input
          {...agentInteractionProps("submissions.upload-file")}
          ref={inputRef}
          accept={
            action.kind === "passport_scan"
              ? passportScanUploadAccept
              : selfieUploadAccept
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
  isReplaced = false,
  onOpenQuestionnaire,
  onOpenWorkspaceTarget,
  onUploadApplicantFile,
  submission,
}: {
  applicant: Applicant;
  isReplaced?: boolean;
  onOpenQuestionnaire?: ApplicantsScreenProps["onOpenQuestionnaire"];
  onOpenWorkspaceTarget?: ApplicantsScreenProps["onOpenWorkspaceTarget"];
  onUploadApplicantFile?: ApplicantsScreenProps["onUploadApplicantFile"];
  submission: Submission;
}) {
  return (
    <div
      aria-label={`Документы: ${applicant.fullName}`}
      aria-hidden={isReplaced || undefined}
      className={`v19-applicant-workflow-actions${isReplaced ? " is-replaced" : ""}`}
      role="group"
    >
      {applicantWorkflowActions(submission, applicant).map((action) => (
        <ApplicantWorkflowActionButton
          action={action}
          applicant={applicant}
          isReplaced={isReplaced}
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

function submissionWorkflowIsReady(submission: Submission) {
  const actions = submission.applicants.flatMap((applicant) =>
    applicantWorkflowActions(submission, applicant),
  );
  return actions.length > 0 && actions.every((action) => action.state === "ready");
}

function lifecycleStatusTone(status: Submission["status"]) {
  if (status === "submitted_for_review" || status === "corrections_received") {
    return "is-review";
  }
  if (status === "ready_for_export" || status === "exported") return "is-ready";
  if (status === "returned" || status === "requires_action") return "is-returned";
  return "is-progress";
}

function SubmissionCreatedAt({ createdAt, now }: { createdAt: string; now: Date }) {
  return (
    <time
      className="v19-applicant-created-at"
      dateTime={submissionCreatedAtDateTime(createdAt, now)}
    >
      {relativeSubmissionCreatedAt(createdAt, now)}
    </time>
  );
}

function SubmissionFooterMeta({
  canDeleteSubmission,
  deleting,
  label,
  now,
  onDeleteRequest,
  submission,
}: {
  canDeleteSubmission: boolean;
  deleting: boolean;
  label: string;
  now: Date;
  onDeleteRequest: (submission: Submission, trigger: HTMLButtonElement) => void;
  submission: Submission;
}) {
  const canArchive =
    canDeleteSubmission && agentSubmissionCardArchiveDecision(submission).ok;

  return (
    <div className="v19-applicant-card-footer-meta">
      <SubmissionCreatedAt createdAt={submission.createdAt} now={now} />
      {canArchive ? (
        <button
          {...agentInteractionProps("submissions.open-delete")}
          aria-label={`Удалить подачу: ${label}`}
          className="v19-applicant-delete-footer-action"
          disabled={deleting}
          type="button"
          onClick={(event) => onDeleteRequest(submission, event.currentTarget)}
        >
          Удалить
        </button>
      ) : null}
    </div>
  );
}

type CardCallbacks = Pick<
  ApplicantsScreenProps,
  | "onOpenDrawer"
  | "onOpenQuestionnaire"
  | "onOpenWorkspaceTarget"
  | "onUploadApplicantFile"
> & {
  canDeleteSubmission: boolean;
  canSubmitForReview: boolean;
  deleting: boolean;
  error?: string;
  now: Date;
  onDeleteRequest: (submission: Submission, trigger: HTMLButtonElement) => void;
  onPrimaryAction: (submission: Submission) => void;
  submitting: boolean;
};

const mobileSwipeActionWidth = 88;
const mobileSwipeOpenThreshold = mobileSwipeActionWidth / 2;

function SwipeableSubmissionCard({
  canDeleteSubmission,
  children,
  deleting,
  label,
  onDeleteRequest,
  submission,
}: {
  canDeleteSubmission: boolean;
  children: ReactNode;
  deleting: boolean;
  label: string;
  onDeleteRequest: CardCallbacks["onDeleteRequest"];
  submission: Submission;
}) {
  const canRevealDelete =
    canDeleteSubmission && agentSubmissionCardArchiveDecision(submission).ok;
  const [open, setOpen] = useState(false);
  const [dragOffset, setDragOffset] = useState<number | null>(null);
  const gestureRef = useRef<{
    pointerId: number;
    startOffset: number;
    startX: number;
    startY: number;
  } | null>(null);
  const suppressClickRef = useRef(false);
  const visibleOffset = dragOffset ?? (open ? -mobileSwipeActionWidth : 0);

  const resetGesture = () => {
    gestureRef.current = null;
    setDragOffset(null);
  };

  const cancelGesture = () => {
    suppressClickRef.current = false;
    resetGesture();
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (
      !canRevealDelete ||
      window.innerWidth > 767 ||
      (event.target instanceof Element &&
        event.target.closest("button, a, input, select, textarea, label"))
    ) {
      return;
    }
    gestureRef.current = {
      pointerId: event.pointerId,
      startOffset: open ? -mobileSwipeActionWidth : 0,
      startX: event.clientX,
      startY: event.clientY,
    };
    suppressClickRef.current = false;
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (Math.abs(deltaY) > Math.abs(deltaX)) return;

    const nextOffset = Math.max(
      -mobileSwipeActionWidth,
      Math.min(0, gesture.startOffset + deltaX),
    );
    if (Math.abs(deltaX) > 6) suppressClickRef.current = true;
    setDragOffset(nextOffset);
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLDivElement>) => {
    const gesture = gestureRef.current;
    if (!gesture || gesture.pointerId !== event.pointerId) return;

    const deltaX = event.clientX - gesture.startX;
    const deltaY = event.clientY - gesture.startY;
    if (Math.abs(deltaY) > Math.abs(deltaX)) {
      setOpen(gesture.startOffset < 0);
      suppressClickRef.current = false;
      resetGesture();
      return;
    }
    const finalOffset = Math.max(
      -mobileSwipeActionWidth,
      Math.min(0, gesture.startOffset + deltaX),
    );
    setOpen(finalOffset <= -mobileSwipeOpenThreshold);
    resetGesture();
  };

  return (
    <div
      className="v19-submission-swipe-shell"
      data-dragging={dragOffset !== null ? "true" : undefined}
      data-open={open ? "true" : undefined}
    >
      <div
        className="v19-submission-swipe-content"
        style={{ transform: `translate3d(${visibleOffset}px, 0, 0)` }}
        onClickCapture={(event) => {
          if (suppressClickRef.current) {
            event.preventDefault();
            event.stopPropagation();
            suppressClickRef.current = false;
            return;
          }
          if (open) {
            event.preventDefault();
            event.stopPropagation();
            setOpen(false);
          }
        }}
        onPointerCancel={cancelGesture}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
      >
        {children}
      </div>
      {canRevealDelete ? (
        <button
          {...agentInteractionProps("submissions.open-delete")}
          aria-label={`Удалить свайпом: ${label}`}
          className="v19-submission-swipe-delete"
          data-testid="agent-submission-swipe-delete"
          disabled={deleting}
          type="button"
          onFocus={() => setOpen(true)}
          onClick={(event) => onDeleteRequest(submission, event.currentTarget)}
        >
          <Trash2 aria-hidden="true" />
          <span>Удалить</span>
        </button>
      ) : null}
    </div>
  );
}

function openSubmissionCardFromKeyboard(
  event: ReactKeyboardEvent<HTMLElement>,
  onOpen: () => void,
) {
  if (
    event.currentTarget !== event.target ||
    (event.key !== "Enter" && event.key !== " ")
  ) {
    return;
  }
  event.preventDefault();
  onOpen();
}

function AssignedPublicId({
  showFallback = false,
  submission,
}: {
  showFallback?: boolean;
  submission: Submission;
}) {
  const publicId =
    submissionPublicNumber(submission) === null
      ? showFallback
        ? "VF—"
        : null
      : submissionPublicId(submission);

  return publicId ? <span className="v19-applicant-public-id">{publicId}</span> : null;
}

function SubmissionStatusLabel({
  onOpen,
  submission,
}: {
  onOpen: () => void;
  submission: Submission;
}) {
  const className = `v19-applicant-card-status ${lifecycleStatusTone(
    submission.status,
  )}`;
  if (submission.status === "ready_for_export") {
    return (
      <button
        {...agentInteractionProps("submissions.open")}
        aria-label="Готово к выгрузке"
        className={className}
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onOpen();
        }}
      >
        {statusLabelFor(submission.status, "full")}
      </button>
    );
  }

  return <span className={className}>{statusLabelFor(submission.status, "full")}</span>;
}

function SubmissionCardHeaderActions({
  onOpen,
  submission,
}: {
  onOpen: () => void;
  submission: Submission;
}) {
  return (
    <div className="v19-applicant-card-head-actions">
      <SubmissionStatusLabel onOpen={onOpen} submission={submission} />
    </div>
  );
}

function SubmissionPrimaryAction({
  canSubmitForReview,
  label,
  onPrimaryAction,
  submission,
  submitting,
  visible,
}: {
  canSubmitForReview: boolean;
  label: string;
  onPrimaryAction: (submission: Submission) => void;
  submission: Submission;
  submitting: boolean;
  visible: boolean;
}) {
  const canSubmit = canSubmitForReviewFromList(submission, canSubmitForReview);
  const actionVisible = visible || canSubmit;
  let actionLabel = "Открыть";
  if (canSubmit) {
    actionLabel = submitting ? "Отправляем…" : "Отправить на проверку";
  }
  return (
    <button
      {...agentInteractionProps(
        canSubmit ? "submissions.submit-review" : "submissions.open",
      )}
      aria-label={`${actionLabel}: ${label}`}
      aria-hidden={!actionVisible || undefined}
      className={`v19-applicant-status-action${actionVisible ? " is-visible" : ""}`}
      disabled={submitting}
      tabIndex={actionVisible ? undefined : -1}
      type="button"
      onClick={() => onPrimaryAction(submission)}
    >
      {actionLabel}
    </button>
  );
}

function SubmissionWorkflowSwitch({
  action,
  children,
  ready,
}: {
  action: ReactNode;
  children: ReactNode;
  ready: boolean;
}) {
  return (
    <div
      className="v19-applicant-workflow-switch"
      data-ready={ready ? "true" : "false"}
    >
      {children}
      {action}
    </div>
  );
}

function canSubmitForReviewFromList(
  submission: Submission,
  canSubmitForReview: boolean,
) {
  if (!canSubmitForReview) return false;
  const completionDecision = agentQuestionnaireCompletionDecision(submission);
  return completionDecision.action === "submit_for_review" && completionDecision.ok;
}

function FamilySubmissionCard({
  canDeleteSubmission,
  canSubmitForReview,
  deleting,
  error,
  now,
  onOpenDrawer,
  onOpenQuestionnaire,
  onOpenWorkspaceTarget,
  onDeleteRequest,
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
  const workflowReady = submissionWorkflowIsReady(submission);

  return (
    <V19QueueCard
      {...agentInteractionProps("submissions.open")}
      as="article"
      aria-label={`Подача ${title}`}
      className="v19-agent-shared-card group"
      data-submission-id={submission.id}
      data-testid="agent-submission-card"
      tabIndex={0}
      onClick={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest("button, a, input, select, textarea, label")
        ) {
          return;
        }
        onOpenDrawer(submission.id);
      }}
      onKeyDown={(event) =>
        openSubmissionCardFromKeyboard(event, () => onOpenDrawer(submission.id))
      }
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
              <AssignedPublicId showFallback submission={submission} />
            </p>
          </div>
        </div>
        <SubmissionCardHeaderActions
          onOpen={() => onOpenDrawer(submission.id)}
          submission={submission}
        />
      </div>

      <div className="v19-applicant-member-list">
        {submission.applicants.map((applicant, index) => {
          const marker = applicantMarker(submission, applicant);
          return (
            <div
              className="v19-applicant-member-cell"
              data-applicant-role={applicant.role}
              key={applicant.id}
            >
              <ApplicantMarkerIcon marker={marker} />
              <div className="v19-applicant-member-identity">
                <span className="v19-applicant-member-name">
                  {applicantCardDisplayName(applicant, index)}
                </span>
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
        <SubmissionFooterMeta
          canDeleteSubmission={canDeleteSubmission}
          deleting={deleting}
          label={title}
          now={now}
          onDeleteRequest={onDeleteRequest}
          submission={submission}
        />
        <SubmissionPrimaryAction
          canSubmitForReview={canSubmitForReview}
          label={title}
          onPrimaryAction={onPrimaryAction}
          submission={submission}
          submitting={submitting}
          visible={workflowReady}
        />
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
  canDeleteSubmission,
  canSubmitForReview,
  deleting,
  error,
  now,
  onOpenDrawer,
  onOpenQuestionnaire,
  onOpenWorkspaceTarget,
  onDeleteRequest,
  onPrimaryAction,
  onUploadApplicantFile,
  submission,
  submitting,
}: CardCallbacks & { submission: Submission }) {
  const applicant = submission.applicants[0];
  const name = applicant?.fullName ?? submission.title;
  const marker = applicant ? applicantMarker(submission, applicant) : "person";
  const workflowReady = submissionWorkflowIsReady(submission);

  return (
    <V19QueueCard
      {...agentInteractionProps("submissions.open")}
      as="article"
      aria-label={`Подача ${name}`}
      className="v19-agent-shared-card group"
      data-submission-id={submission.id}
      data-testid="agent-submission-card"
      tabIndex={0}
      onClick={(event) => {
        if (
          event.target instanceof Element &&
          event.target.closest("button, a, input, select, textarea, label")
        ) {
          return;
        }
        onOpenDrawer(submission.id);
      }}
      onKeyDown={(event) =>
        openSubmissionCardFromKeyboard(event, () => onOpenDrawer(submission.id))
      }
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
        <SubmissionCardHeaderActions
          onOpen={() => onOpenDrawer(submission.id)}
          submission={submission}
        />
      </div>

      <div className="v19-applicant-card-footer">
        <SubmissionFooterMeta
          canDeleteSubmission={canDeleteSubmission}
          deleting={deleting}
          label={name}
          now={now}
          onDeleteRequest={onDeleteRequest}
          submission={submission}
        />
        {applicant ? (
          <SubmissionWorkflowSwitch
            action={
              <SubmissionPrimaryAction
                canSubmitForReview={canSubmitForReview}
                label={name}
                onPrimaryAction={onPrimaryAction}
                submission={submission}
                submitting={submitting}
                visible={workflowReady}
              />
            }
            ready={workflowReady}
          >
            <ApplicantWorkflowActions
              applicant={applicant}
              isReplaced={workflowReady}
              onOpenQuestionnaire={onOpenQuestionnaire}
              onOpenWorkspaceTarget={onOpenWorkspaceTarget}
              onUploadApplicantFile={onUploadApplicantFile}
              submission={submission}
            />
          </SubmissionWorkflowSwitch>
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

function sortedSubmissions(submissions: Submission[], sort: ApplicantSort, now: Date) {
  return [...submissions].sort((left, right) => {
    if (sort === "tripDate") {
      const tripOrder = left.tripDateFrom.localeCompare(right.tripDateFrom);
      if (tripOrder !== 0) return tripOrder;
    } else {
      const leftTime = resolveSubmissionCreatedAt(left.createdAt, now)?.getTime() ?? 0;
      const rightTime =
        resolveSubmissionCreatedAt(right.createdAt, now)?.getTime() ?? 0;
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
  onDeleteSubmission,
  onSubmitForReview,
  onTypeFilterChange,
  onUploadApplicantFile,
  submissions,
  typeFilter: controlledTypeFilter,
}: ApplicantsScreenProps) {
  const prefersReducedMotion = useExperienceReducedMotion();
  const [internalTypeFilter, setInternalTypeFilter] =
    useState<SubmissionTypeFilter>("single");
  const typeFilter = controlledTypeFilter ?? internalTypeFilter;
  const [summaryFilter, setSummaryFilter] = useState<AgentSubmissionQueueFilter>("all");
  const [cityFilter, setCityFilter] = useState("Все города");
  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<ApplicantSort>("createdDesc");
  const [relativeNow, setRelativeNow] = useState(() => Date.now());
  const [pendingReviewSubmission, setPendingReviewSubmission] =
    useState<Submission | null>(null);
  const [pendingDeleteSubmission, setPendingDeleteSubmission] =
    useState<Submission | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [deleteDialogError, setDeleteDialogError] = useState<string | null>(null);
  const [deleteStatusMessage, setDeleteStatusMessage] = useState("");
  const [submittingId, setSubmittingId] = useState<string | null>(null);
  const [submissionError, setSubmissionError] = useState<{
    id: string;
    message: string;
  } | null>(null);
  const [submissionDialogError, setSubmissionDialogError] = useState<string | null>(
    null,
  );
  const submissionRequestRef = useRef<string | null>(null);
  const deleteRequestRef = useRef<string | null>(null);
  const deleteTriggerRef = useRef<HTMLButtonElement | null>(null);
  const submissionsListRef = useRef<HTMLDivElement | null>(null);
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
  const displayedSubmissionGroups = useMemo(() => {
    if (typeFilter !== "all") {
      return [
        {
          id: typeFilter,
          label: typeFilter === "family" ? "Семьи" : "Заявители",
          submissions: displayedSubmissions,
        },
      ];
    }

    return [
      {
        id: "family" as const,
        label: "Семьи",
        submissions: displayedSubmissions.filter(
          (submission) => submission.type === "family",
        ),
      },
      {
        id: "single" as const,
        label: "Заявители",
        submissions: displayedSubmissions.filter(
          (submission) => submission.type === "single",
        ),
      },
    ].filter((group) => group.submissions.length > 0);
  }, [displayedSubmissions, typeFilter]);
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

  const resetFilters = () => {
    changeTypeFilter("all");
    setSummaryFilter("all");
    setCityFilter("Все города");
    setSearchQuery("");
    setSortBy("createdDesc");
  };

  const handlePrimaryAction = (submission: Submission) => {
    const canSendToReview = canSubmitForReviewFromList(
      submission,
      Boolean(onSubmitForReview),
    );

    if (!canSendToReview || !onSubmitForReview) {
      onOpenDrawer(submission.id);
      return;
    }

    setSubmissionDialogError(null);
    setPendingReviewSubmission(submission);
  };

  const confirmSubmissionForReview = async () => {
    const submission = pendingReviewSubmission;
    if (!submission || !onSubmitForReview || submissionRequestRef.current !== null) {
      return;
    }

    submissionRequestRef.current = submission.id;
    setSubmissionError(null);
    setSubmissionDialogError(null);
    setSubmittingId(submission.id);
    try {
      await onSubmitForReview(submission.id);
      setPendingReviewSubmission(null);
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : "Не удалось отправить подачу на проверку.";
      setSubmissionError({ id: submission.id, message });
      setSubmissionDialogError(message);
    } finally {
      submissionRequestRef.current = null;
      setSubmittingId(null);
    }
  };

  const handleDeleteRequest = (submission: Submission, trigger: HTMLButtonElement) => {
    if (!onDeleteSubmission || !agentSubmissionCardArchiveDecision(submission).ok) {
      return;
    }
    deleteTriggerRef.current = trigger;
    setDeleteDialogError(null);
    setPendingDeleteSubmission(submission);
  };

  const restoreDeleteTriggerFocus = (submissionId: string) => {
    window.requestAnimationFrame(() => {
      const trigger = deleteTriggerRef.current;
      if (trigger?.isConnected) {
        trigger.focus({ preventScroll: true });
      } else {
        const card = Array.from(
          document.querySelectorAll<HTMLElement>("[data-submission-id]"),
        ).find((candidate) => candidate.dataset.submissionId === submissionId);
        card
          ?.querySelector<HTMLButtonElement>(
            '[data-v19-interaction-id="submissions.open-delete"]',
          )
          ?.focus({ preventScroll: true });
      }
      deleteTriggerRef.current = null;
    });
  };

  const confirmDeleteSubmission = async () => {
    const submission = pendingDeleteSubmission;
    if (!submission || !onDeleteSubmission || deleteRequestRef.current !== null) {
      return;
    }

    deleteRequestRef.current = submission.id;
    setDeleteDialogError(null);
    setDeleteStatusMessage("");
    setDeletingId(submission.id);
    try {
      await onDeleteSubmission(submission.id);
      setPendingDeleteSubmission(null);
      setDeleteStatusMessage("Карточка удалена из «Моих подач».");
      window.requestAnimationFrame(() => {
        submissionsListRef.current?.focus({ preventScroll: true });
      });
    } catch (error) {
      setDeleteDialogError(
        error instanceof Error ? error.message : "Не удалось удалить карточку подачи.",
      );
    } finally {
      deleteRequestRef.current = null;
      setDeletingId(null);
    }
  };

  const cardCallbacks = {
    canDeleteSubmission: Boolean(onDeleteSubmission),
    canSubmitForReview: Boolean(onSubmitForReview),
    deleting: false,
    now,
    onDeleteRequest: handleDeleteRequest,
    onOpenDrawer,
    onOpenQuestionnaire,
    onOpenWorkspaceTarget,
    onPrimaryAction: handlePrimaryAction,
    onUploadApplicantFile,
  };
  const renderSubmissionCard = (submission: Submission) => {
    const mainApplicant =
      submission.applicants.find((applicant) => applicant.role === "main") ??
      submission.applicants[0];
    const cardLabel =
      submission.type === "family"
        ? (familyDisplayTitleFromMainApplicantName(mainApplicant?.fullName) ??
          submission.title)
        : (mainApplicant?.fullName ?? submission.title);
    const error =
      submissionError?.id === submission.id &&
      pendingReviewSubmission?.id !== submission.id
        ? submissionError.message
        : undefined;
    const deleting = deletingId === submission.id;
    const submitting = submittingId === submission.id;

    return (
      <SwipeableSubmissionCard
        canDeleteSubmission={cardCallbacks.canDeleteSubmission}
        deleting={deleting}
        key={submission.id}
        label={cardLabel}
        onDeleteRequest={handleDeleteRequest}
        submission={submission}
      >
        {submission.type === "family" ? (
          <FamilySubmissionCard
            {...cardCallbacks}
            deleting={deleting}
            error={error}
            submission={submission}
            submitting={submitting}
          />
        ) : (
          <IndividualSubmissionCard
            {...cardCallbacks}
            deleting={deleting}
            error={error}
            submission={submission}
            submitting={submitting}
          />
        )}
      </SwipeableSubmissionCard>
    );
  };

  return (
    <motion.div
      animate={{ opacity: 1, y: 0 }}
      className="v19-agent-shared-screen"
      data-reduced-motion={prefersReducedMotion ? "true" : "false"}
      initial={prefersReducedMotion ? false : { opacity: 0, y: 10 }}
      transition={prefersReducedMotion ? { duration: 0 } : { duration: 0.3 }}
    >
      <V19MetricStrip>
        <V19MetricCard
          active={summaryFilter === "all"}
          detail={profileNoun(metrics.queue)}
          icon={FileStack}
          interactionId="submissions.summary-filter"
          label="В очереди"
          value={metrics.queue}
          onClick={() => setSummaryFilter("all")}
        />
        <V19MetricCard
          active={summaryFilter === "review"}
          detail="ревью"
          icon={AlertCircle}
          interactionId="submissions.summary-filter"
          label="Проверить"
          tone="amber"
          value={metrics.review}
          onClick={() => setSummaryFilter("review")}
        />
        <V19MetricCard
          active={summaryFilter === "ready"}
          detail="экспорт"
          icon={CheckCircle2}
          interactionId="submissions.summary-filter"
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
          countLabel={`${displayedSubmissions.length}`}
          interactionId="submissions.reset-filters"
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
                interactionId="submissions.type-filter"
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
                interactionId="submissions.status-filter"
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
                interactionId="submissions.sort"
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
          interactionIds={{
            cityFilter: "submissions.city-filter",
            reset: "submissions.reset-filters",
            search: "submissions.search",
          }}
          onCityFilterChange={setCityFilter}
          onFilterClick={resetFilters}
          onSearchChange={setSearchQuery}
          searchAriaLabel="Поиск по подачам"
          searchPlaceholder="VF-номер, семья или заявитель"
          searchValue={searchQuery}
        />

        <div
          ref={submissionsListRef}
          aria-label="Список подач"
          className={`v19-agent-submissions-list${
            typeFilter === "all" && displayedSubmissionGroups.length > 1
              ? " is-type-columns"
              : ""
          }`}
          tabIndex={-1}
        >
          {!displayedSubmissions.length ? (
            <div className="v19-applicant-empty-state" role="status">
              <h2>Ничего не найдено</h2>
              <p>Измените поисковый запрос или фильтры.</p>
              <button
                {...agentInteractionProps("submissions.reset-filters")}
                type="button"
                onClick={resetFilters}
              >
                Сбросить фильтры
              </button>
            </div>
          ) : (
            displayedSubmissionGroups.map((group) => (
              <section
                aria-labelledby={`agent-submissions-${group.id}`}
                className="v19-agent-submissions-group"
                data-submission-type-group={group.id}
                key={group.id}
              >
                <h2 id={`agent-submissions-${group.id}`}>{group.label}</h2>
                {group.submissions.map(renderSubmissionCard)}
              </section>
            ))
          )}
        </div>
        {deleteStatusMessage ? (
          <span aria-live="polite" className="sr-only" role="status">
            {deleteStatusMessage}
          </span>
        ) : null}

        {pendingReviewSubmission ? (
          <ConfirmationDialog
            busy={submittingId === pendingReviewSubmission.id}
            cancelLabel="Отмена"
            cancelInteractionId="submissions.cancel-submit"
            confirmDanger={false}
            confirmLabel="Отправить"
            confirmInteractionId="submissions.submit-review"
            description="После отправки подача перейдёт в очередь проверки администратора."
            error={
              submissionDialogError ? (
                <span className="v19-applicant-submit-error">
                  {submissionDialogError}
                </span>
              ) : undefined
            }
            kicker="Подтверждение отправки"
            title="Отправить на проверку администратору?"
            onCancel={() => {
              if (submittingId !== pendingReviewSubmission.id) {
                setPendingReviewSubmission(null);
                setSubmissionDialogError(null);
              }
            }}
            onConfirm={() => void confirmSubmissionForReview()}
          />
        ) : null}

        {pendingDeleteSubmission ? (
          <ConfirmationDialog
            busy={deletingId === pendingDeleteSubmission.id}
            cancelLabel="Отмена"
            cancelInteractionId="submissions.cancel-delete"
            confirmDanger
            confirmLabel="Удалить карточку"
            confirmInteractionId="submissions.confirm-delete"
            description="Карточка исчезнет из «Моих подач». Данные и файлы останутся в Supabase для аудита."
            error={
              deleteDialogError ? (
                <span className="v19-applicant-submit-error">{deleteDialogError}</span>
              ) : undefined
            }
            kicker="Удаление карточки"
            title={`Удалить карточку «${
              pendingDeleteSubmission.type === "family"
                ? (familyDisplayTitleFromMainApplicantName(
                    pendingDeleteSubmission.applicants.find(
                      (applicant) => applicant.role === "main",
                    )?.fullName,
                  ) ?? pendingDeleteSubmission.title)
                : (pendingDeleteSubmission.applicants[0]?.fullName ??
                  pendingDeleteSubmission.title)
            }»?`}
            onCancel={() => {
              if (deletingId !== pendingDeleteSubmission.id) {
                const submissionId = pendingDeleteSubmission.id;
                setPendingDeleteSubmission(null);
                setDeleteDialogError(null);
                restoreDeleteTriggerFocus(submissionId);
              }
            }}
            onConfirm={() => void confirmDeleteSubmission()}
          />
        ) : null}
      </div>
    </motion.div>
  );
}
