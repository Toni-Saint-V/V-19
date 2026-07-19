import { ClipboardPenLine, Files, TriangleAlert } from "lucide-react";
import type { DrawerTab, Issue, Submission, SubmissionHistoryItem } from "../types";
import { submissionPublicId } from "../submissionIdentity";
import { Button } from "../../../shared/ui/primitives";
import { ContextRail } from "./CollectionPrimitives";
import {
  RailHistoryList,
  RailIssueList,
  RailQuickLinks,
} from "./RightRailPrimitives";

type AgentSubmissionContextRailIssue = {
  id: Issue["id"];
  reason: string;
  targetLine: string;
  tone: "danger" | "warning";
  onOpen: () => void;
};

type AgentSubmissionContextRailProps = {
  applicantSummary: string;
  canonicalMedia: Array<{ status: string; type: string }>;
  fileSummary: string;
  history: SubmissionHistoryItem[];
  issues: AgentSubmissionContextRailIssue[];
  nextActionLabel: string;
  openIssueCount: number;
  ownerLabel: string;
  readinessLabel: string;
  reasonLabel: string;
  showHeader?: boolean;
  statusLabel: string;
  submission: Submission;
  tripSummary: string;
  onClose: () => void;
  onOpenTab: (tab: DrawerTab) => void;
};

export function AgentSubmissionContextRail({
  applicantSummary,
  canonicalMedia,
  fileSummary,
  history,
  issues,
  nextActionLabel,
  openIssueCount,
  ownerLabel,
  readinessLabel,
  reasonLabel,
  showHeader = false,
  statusLabel,
  submission,
  tripSummary,
  onClose,
  onOpenTab,
}: AgentSubmissionContextRailProps) {
  const disabledReason = primaryOpenDisabledReason(submission);
  const disabledReasonId = disabledReason
    ? `agent-submission-open-disabled-${submission.id}`
    : undefined;

  return (
    <ContextRail
      className="v19-submissions-context"
      label="Контекст подачи"
      title={submission.title}
      showHeader={showHeader}
      onClose={onClose}
    >
      <div className="v19-submission-context-body">
        <section className="v19-submission-context-identity">
          <p>Подача</p>
          <h3>{submission.title}</h3>
          <span>
            {statusLabel} · {submissionPublicId(submission)}
          </span>
          <span>Ответственный: {ownerLabel}</span>
        </section>

        <section className="v19-submission-context-facts" aria-label="Состояние подачи">
          <span>
            <strong>Поездка</strong>
            <em>{tripSummary}</em>
          </span>
          <span>
            <strong>Заявители</strong>
            <em>{applicantSummary}</em>
          </span>
          <span>
            <strong>Причина</strong>
            <em>{reasonLabel}</em>
          </span>
          <span>
            <strong>Следующее</strong>
            <em>{nextActionLabel}</em>
          </span>
          <span>
            <strong>Готовность</strong>
            <em>{readinessLabel}</em>
          </span>
        </section>

        <section className="v19-submission-context-files" aria-label="Обязательные файлы">
          <div>
            <p>Обязательные файлы</p>
            <strong>Файлы {fileSummary}</strong>
          </div>
          <div>
            {canonicalMedia.map((file) => (
              <span key={file.type}>
                <strong>{file.type}</strong>
                <em>{file.status}</em>
              </span>
            ))}
          </div>
        </section>

        <RailIssueList count={openIssueCount} issues={issues} />

        <RailQuickLinks
          links={[
            {
              label: "Анкета",
              onClick: () => onOpenTab("questionnaire"),
              icon: <ClipboardPenLine aria-hidden="true" size={16} />,
            },
            {
              label: "Файлы",
              onClick: () => onOpenTab("files"),
              icon: <Files aria-hidden="true" size={16} />,
            },
            {
              label: "Замечания",
              onClick: () => onOpenTab("issues"),
              icon: <TriangleAlert aria-hidden="true" size={16} />,
            },
          ]}
        />

        <RailHistoryList history={history} />
      </div>

      <footer className="v19-submission-context-footer">
        {disabledReason ? <p id={disabledReasonId}>{disabledReason}</p> : null}
        <Button
          aria-describedby={disabledReasonId}
          disabled={Boolean(disabledReason)}
          title={disabledReason || undefined}
          type="button"
          onClick={() => onOpenTab("overview")}
        >
          Открыть подачу
        </Button>
      </footer>
    </ContextRail>
  );
}

function primaryOpenDisabledReason(submission: Submission) {
  if (!submission.id.trim()) return "Открытие недоступно: ID подачи не указан.";

  return "";
}
