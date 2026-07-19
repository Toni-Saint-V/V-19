import { AlertCircle, CheckCircle2, FileText, X } from "lucide-react";

import { getPrimaryAction, statusLabelFor } from "../status";
import { submissionPublicId } from "../submissionIdentity";
import type { DrawerTab, Role, Submission, SubmissionAction } from "../types";

type FigmaSubmissionDrawerProps = {
  actionError?: string;
  activeTab?: DrawerTab;
  onAction?: (action: SubmissionAction) => void;
  onClose: () => void;
  onOpenQuestionnaire?: () => void;
  onTab?: (tab: DrawerTab) => void;
  role?: Role;
  submission: Submission;
  surface?: "agent" | "review" | "export";
};

const drawerTabs: Array<{ id: DrawerTab; label: string }> = [
  { id: "overview", label: "Обзор" },
  { id: "applicants", label: "Заявители" },
  { id: "questionnaire", label: "Анкета" },
  { id: "files", label: "Файлы" },
  { id: "issues", label: "Замечания" },
  { id: "history", label: "История" },
];

function formatSubmissionTitle(submission: Submission) {
  const firstApplicant = submission.applicants[0]?.fullName;
  if (submission.type === "family") {
    return firstApplicant
      ? `${firstApplicant} и семья`
      : "Семейная подача";
  }
  return firstApplicant || submission.id;
}

function readyFileCount(submission: Submission) {
  return submission.files.filter(
    (file) =>
      file.status === "uploaded" ||
      file.status === "pending_review" ||
      file.status === "accepted",
  ).length;
}

function issueTargetLine(issue: Submission["issues"][number]) {
  return [
    issue.target.applicantName,
    issue.target.fileType,
    issue.target.section,
    issue.target.field,
  ]
    .filter(Boolean)
    .join(" · ");
}

export function FigmaSubmissionDrawer({
  actionError = "",
  activeTab = "overview",
  onAction,
  onClose,
  onOpenQuestionnaire,
  onTab,
  role = "agent",
  submission,
  surface = "agent",
}: FigmaSubmissionDrawerProps) {
  const primaryAction = getPrimaryAction(submission, role, surface);
  const isReturned = submission.status === "returned";
  const readyFiles = readyFileCount(submission);
  const issueCount = submission.issues.filter(
    (issue) => issue.status !== "closed_by_admin",
  ).length;

  return (
    <aside
      aria-label={`Подача ${submissionPublicId(submission)}`}
      aria-modal="true"
      className="vf-figma-surface v19-submission-drawer-frame v19-figma-drawer-shell"
      role="dialog"
    >
      <header className="v19-figma-drawer-title-row">
        <div className="v19-figma-drawer-title-block">
          <div className="v19-figma-drawer-meta">
            <span>{submissionPublicId(submission)}</span>
            <span>{submission.city}</span>
            <span>{submission.country}</span>
          </div>
          <div className="v19-figma-drawer-status-row">
            <h2>{formatSubmissionTitle(submission)}</h2>
            <span className="v19-figma-drawer-header-status">
              {statusLabelFor(submission.status, "compact")}
            </span>
          </div>
          <span className="v19-figma-drawer-updated">
            Обновлено: {submission.updatedAt}
          </span>
        </div>
        <button
          aria-label="Закрыть"
          className="v19-figma-drawer-close"
          onClick={onClose}
          type="button"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </header>

      <nav aria-label="Разделы подачи" className="v19-drawer-tabbar">
        {drawerTabs.map((tab) => (
          <button
            aria-current={activeTab === tab.id ? "page" : undefined}
            className={activeTab === tab.id ? "is-active" : undefined}
            key={tab.id}
            onClick={() => onTab?.(tab.id)}
            type="button"
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <main className="v19-submission-drawer-body">
        <section className="v19-drawer-issues">
          <div className="v19-drawer-issues-head">
            <div>
              <h3>Пакет документов</h3>
              <p>Анкета, файлы и замечания остаются в контексте подачи.</p>
            </div>
            <span>{submission.applicants.length} чел.</span>
          </div>

          <div className="v19-drawer-file-section-head">
            <span className="v19-drawer-file-section-copy">
              <span className="v19-drawer-file-section-title">
                Готовность файлов
              </span>
              <span className="v19-drawer-file-section-meta">
                <FileText size={14} aria-hidden="true" />
                {readyFiles}/{submission.files.length}
              </span>
            </span>
            <span className="v19-drawer-package-count">
              {Math.round(submission.completeness.total)}%
            </span>
          </div>

          {issueCount > 0 ? (
            <div className="v19-drawer-issues-list">
              {submission.issues
                .filter((issue) => issue.status !== "closed_by_admin")
                .slice(0, 3)
                .map((issue) => (
                  <article className="v19-drawer-issue-card" key={issue.id}>
                    <span className="v19-drawer-issue-accent" aria-hidden="true" />
                    <span className="v19-drawer-issue-icon" aria-hidden="true">
                      <AlertCircle size={18} />
                    </span>
                    <span className="v19-drawer-issue-copy">
                      <span className="v19-drawer-issue-title-row">
                        <h4>{issue.reason}</h4>
                        <span>{issue.severity}</span>
                      </span>
                      <span className="v19-drawer-issue-target">
                        {issueTargetLine(issue)}
                      </span>
                      <p>{issue.comment}</p>
                    </span>
                    <span className="v19-drawer-issue-actions">
                      <button type="button" onClick={onOpenQuestionnaire}>
                        Открыть
                      </button>
                    </span>
                  </article>
                ))}
            </div>
          ) : (
            <div className="v19-drawer-issues-empty">
              <div aria-hidden="true">
                <CheckCircle2 size={22} />
              </div>
              <h4>Критичных замечаний нет</h4>
              <p>Подача готова к следующему действию по текущему статусу.</p>
            </div>
          )}
        </section>
      </main>

      <footer className="v19-figma-drawer-footer">
        {actionError || primaryAction.reason ? (
          <span className="v19-figma-drawer-footer-status">
            {actionError || primaryAction.reason}
          </span>
        ) : null}
        <button
          className={`v19-drawer-footer-action ${
            isReturned
              ? "v19-drawer-footer-action--returned"
              : "v19-drawer-footer-action--primary"
          }`}
          disabled={primaryAction.disabled}
          onClick={() => onAction?.(primaryAction.action)}
          type="button"
        >
          {primaryAction.label}
        </button>
      </footer>
    </aside>
  );
}
