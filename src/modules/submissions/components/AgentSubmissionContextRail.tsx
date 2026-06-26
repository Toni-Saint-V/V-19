import type { CSSProperties } from "react";

import { Badge, Button } from "../../../shared/ui/primitives";
import type { DrawerTab, Issue, Submission, SubmissionHistoryItem } from "../types";
import { ContextRail, SvgIcon } from "./CollectionPrimitives";

type BadgeTone = "amber" | "blue" | "danger" | "default" | "muted" | "teal";

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
  status: {
    label: string;
    tone: BadgeTone;
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
      showHeader={false}
      onClose={onClose}
    >
      <section className="v19-rail-card v19-rail-card-primary">
        <p className="v19-rail-meta">
          {submission.id} · {submission.city}
        </p>
        <div className="v19-rail-statusline">
          <Badge tone={status.tone}>{status.label}</Badge>
          <strong>{submission.completeness.total}%</strong>
        </div>
        <div
          className="v19-rail-progress"
          style={
            {
              "--progress": `${submission.completeness.total}%`,
            } as CSSProperties
          }
          aria-hidden="true"
        />
        <p className="v19-rail-meta">
          {applicantSummary} · {tripSummary} · {fileSummary}
        </p>
      </section>

      <section className="v19-rail-card v19-rail-next-card">
        <p className="v19-rail-label">Следующее действие</p>
        <h3>{nextAction.title}</h3>
        <p className="v19-rail-action-detail">{nextAction.description}</p>
        <Button variant="primary" onClick={nextAction.onOpen}>
          {nextAction.label}
        </Button>
      </section>

      {openIssueCount > 0 ? (
        <section className="v19-rail-card v19-rail-issues-card">
          <p className="v19-rail-label">Открытые замечания · {openIssueCount}</p>
          <div className="v19-rail-issue-list">
            {issues.map((issue) => (
              <button
                className="v19-rail-issue"
                key={issue.id}
                type="button"
                onClick={issue.onOpen}
              >
                <span
                  className={`v19-rail-issue-dot tone-${issue.tone}`}
                  aria-hidden="true"
                />
                <span>
                  <strong>{issue.reason}</strong>
                  <small>{issue.targetLine}</small>
                </span>
                <SvgIcon>
                  <path d="M9 6l6 6-6 6" />
                </SvgIcon>
              </button>
            ))}
          </div>
        </section>
      ) : null}

      <section className="v19-rail-card v19-rail-quick-card">
        <p className="v19-rail-label">Быстрые переходы</p>
        <div className="v19-rail-quick-links">
          <Button variant="secondary" onClick={() => onOpenTab("questionnaire")}>
            <SvgIcon>
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </SvgIcon>
            Анкета
          </Button>
          <Button variant="secondary" onClick={() => onOpenTab("files")}>
            <SvgIcon>
              <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z" />
              <path d="M14 2v6h6" />
            </SvgIcon>
            Файлы
          </Button>
          <Button variant="secondary" onClick={() => onOpenTab("issues")}>
            <SvgIcon>
              <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
              <path d="M12 9v4M12 17h.01" />
            </SvgIcon>
            Замечания
          </Button>
        </div>
      </section>

      <section className="v19-rail-card v19-rail-history-card">
        <p className="v19-rail-label">Последние изменения</p>
        <div className="v19-rail-history">
          {history.slice(0, 2).map((item) => (
            <span key={item.id}>
              <strong>{item.text}</strong>
              <small>
                {item.at}
                {item.detail ? ` · ${item.detail}` : ""}
              </small>
            </span>
          ))}
        </div>
      </section>
    </ContextRail>
  );
}
