import type { DrawerTab, Issue, Submission, SubmissionHistoryItem } from "../types";
import { ContextRail, SvgIcon } from "./CollectionPrimitives";
import {
  RailActionCard,
  RailCard,
  RailHistoryList,
  RailIssueList,
  RailQuickLinks,
  RailStatusLine,
  type RailBadgeTone,
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
  fileSummary: string;
  history: SubmissionHistoryItem[];
  issues: AgentSubmissionContextRailIssue[];
  nextAction: {
    description: string;
    label: string;
    title: string;
    onOpen: () => void;
  };
  openIssueCount: number;
  showHeader?: boolean;
  status: {
    label: string;
    tone: RailBadgeTone;
  };
  submission: Submission;
  tripSummary: string;
  onClose: () => void;
  onOpenTab: (tab: DrawerTab) => void;
};

export function AgentSubmissionContextRail({
  applicantSummary,
  fileSummary,
  history,
  issues,
  nextAction,
  openIssueCount,
  showHeader = false,
  status,
  submission,
  tripSummary,
  onClose,
  onOpenTab,
}: AgentSubmissionContextRailProps) {
  return (
    <ContextRail
      className="v19-submissions-context"
      label="Контекст подачи"
      title={submission.title}
      showHeader={showHeader}
      onClose={onClose}
    >
      <RailCard className="v19-rail-card-primary">
        <p className="v19-rail-meta">
          {submission.id} · {submission.city}
        </p>
        <RailStatusLine
          label={status.label}
          percent={submission.completeness.total}
          tone={status.tone}
        />
        <p className="v19-rail-meta">
          {applicantSummary} · {tripSummary} · {fileSummary}
        </p>
      </RailCard>

      <RailActionCard
        description={nextAction.description}
        label={nextAction.label}
        statusLabel={status.label}
        title={nextAction.title}
        tone={status.tone}
        onAction={nextAction.onOpen}
      />

      <RailIssueList count={openIssueCount} issues={issues} />

      <RailQuickLinks
        links={[
          {
            label: "Анкета",
            onClick: () => onOpenTab("questionnaire"),
            icon: (
            <SvgIcon>
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </SvgIcon>
            ),
          },
          {
            label: "Файлы",
            onClick: () => onOpenTab("files"),
            icon: (
            <SvgIcon>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
              <path d="M14 2v6h6" />
            </SvgIcon>
            ),
          },
          {
            label: "Замечания",
            onClick: () => onOpenTab("issues"),
            icon: (
            <SvgIcon>
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
              <path d="M12 9v4M12 17h.01" />
            </SvgIcon>
            ),
          },
        ]}
      />

      <RailHistoryList history={history} />
    </ContextRail>
  );
}
