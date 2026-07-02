import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardCopy,
  ExternalLink,
  MessageSquarePlus,
  ShieldCheck,
} from "lucide-react";
import { Badge, Button, CardComponent } from "../../../shared/ui/primitives";
import type {
  IdentityConsistencyFinding,
  IdentityConsistencyReport,
  IdentityConsistencySeverity,
  IdentityConsistencySource,
  IdentityConsistencyStatus,
} from "../identityConsistency";

const sourceLabels = {
  passport_ocr: "Паспорт OCR",
  questionnaire: "Анкета",
  visa_pdf: "PDF анкеты",
} satisfies Record<IdentityConsistencySource, string>;

const statusLabels = {
  blocked: "Заблокировано",
  clear: "Чисто",
  needs_review: "Нужна сверка",
} satisfies Record<IdentityConsistencyStatus, string>;

const severityLabels = {
  critical: "critical",
  info: "info",
  warning: "warning",
} satisfies Record<IdentityConsistencySeverity, string>;

function badgeToneForStatus(status: IdentityConsistencyStatus) {
  if (status === "blocked") return "danger";
  if (status === "needs_review") return "amber";
  return "teal";
}

function badgeToneForSeverity(severity: IdentityConsistencySeverity) {
  if (severity === "critical") return "danger";
  if (severity === "warning") return "amber";
  return "blue";
}

function statusIcon(status: IdentityConsistencyStatus) {
  if (status === "clear") return <ShieldCheck aria-hidden="true" size={18} />;
  if (status === "blocked") return <AlertTriangle aria-hidden="true" size={18} />;
  return <CheckCircle2 aria-hidden="true" size={18} />;
}

export function IdentityConsistencyStatusStrip({
  compact = false,
  report,
}: {
  compact?: boolean;
  report: IdentityConsistencyReport;
}) {
  return (
    <section
      className={`identity-consistency-strip is-${report.status} ${compact ? "is-compact" : ""}`}
      aria-label="Статус согласованности личности"
    >
      <span className="identity-consistency-strip-icon">{statusIcon(report.status)}</span>
      <span className="identity-consistency-strip-copy">
        <strong>Согласованность личности</strong>
        <em>{report.operatorSummary}</em>
      </span>
      <Badge tone={badgeToneForStatus(report.status)}>{statusLabels[report.status]}</Badge>
      {!compact ? (
        <span className="identity-consistency-strip-stats">
          <b>{report.totals.blocked}</b> critical
          <i aria-hidden="true" />
          <b>{report.totals.needsReview}</b> warnings
        </span>
      ) : null}
    </section>
  );
}

export function IdentityConsistencyPanel({
  compact = false,
  findings,
  onCreateRemark,
  onJumpToFinding,
  report,
  selectedApplicantId,
}: {
  compact?: boolean;
  findings: IdentityConsistencyFinding[];
  onCreateRemark?: (finding: IdentityConsistencyFinding) => void;
  onJumpToFinding?: (finding: IdentityConsistencyFinding) => void;
  report: IdentityConsistencyReport;
  selectedApplicantId?: string;
}) {
  const [copiedDraftKey, setCopiedDraftKey] = useState<string | null>(null);
  const visibleDrafts = selectedApplicantId
    ? report.agentFollowUpDrafts.filter((draft) => draft.applicantId === selectedApplicantId)
    : report.agentFollowUpDrafts;

  async function copyDraft(key: string, text: string) {
    try {
      await navigator.clipboard?.writeText(text);
      setCopiedDraftKey(key);
      window.setTimeout(() => setCopiedDraftKey(null), 1600);
    } catch {
      setCopiedDraftKey(null);
    }
  }

  return (
    <CardComponent
      as="section"
      className={`identity-consistency-panel ${compact ? "is-compact" : ""}`}
      aria-label="AI-сверка личности"
    >
      <header className="identity-consistency-panel-head">
        <div>
          <p className="kicker">AI-сверка</p>
          <h3>Анкета ↔ Паспорт OCR ↔ PDF</h3>
          <p>{report.operatorSummary}</p>
        </div>
        <Badge tone={badgeToneForStatus(report.status)}>{statusLabels[report.status]}</Badge>
      </header>

      {findings.length ? (
        <div className="identity-finding-list">
          {findings.map((finding) => (
            <article
              className={`identity-finding-card is-${finding.severity}`}
              key={finding.id}
            >
              <header>
                <Badge tone={badgeToneForSeverity(finding.severity)}>
                  {severityLabels[finding.severity]}
                </Badge>
                <strong>{finding.label}</strong>
                <span>{finding.applicantName}</span>
              </header>
              <p>{finding.message}</p>
              <div className="identity-evidence-list" aria-label="Источники данных">
                {finding.evidence.map((evidence) => (
                  <span
                    className={`identity-evidence-chip source-${evidence.source}`}
                    key={`${finding.id}-${evidence.source}-${evidence.value}`}
                    title={evidence.normalizedValue ?? evidence.value}
                  >
                    <b>{sourceLabels[evidence.source]}</b>
                    <em>{evidence.value || "—"}</em>
                    {evidence.confidence ? <small>{evidence.confidence}</small> : null}
                  </span>
                ))}
              </div>
              <footer>
                {onJumpToFinding ? (
                  <Button
                    className="identity-panel-action"
                    variant="secondary"
                    onClick={() => onJumpToFinding(finding)}
                  >
                    <ExternalLink aria-hidden="true" size={14} />
                    Открыть поле
                  </Button>
                ) : null}
                {onCreateRemark ? (
                  <Button
                    className="identity-panel-action"
                    variant="secondary"
                    onClick={() => onCreateRemark(finding)}
                  >
                    <MessageSquarePlus aria-hidden="true" size={14} />
                    Создать замечание
                  </Button>
                ) : null}
              </footer>
            </article>
          ))}
        </div>
      ) : (
        <div className="identity-consistency-empty">
          <ShieldCheck aria-hidden="true" size={20} />
          <strong>Конфликтов личности не найдено</strong>
          <span>Анкета, паспорт OCR и PDF анкеты не дают критичных расхождений.</span>
        </div>
      )}

      {!compact && visibleDrafts.length ? (
        <section className="identity-followup-drafts" aria-label="Черновики сообщений агенту">
          <h4>Черновик для агента</h4>
          {visibleDrafts.map((draft) => {
            const draftTitle = `Сообщение для ${draft.applicantName}`;
            const draftKey = `${draft.applicantId}-${draft.text}`;
            return (
              <div className="identity-followup-draft" key={draftKey}>
                <span>
                  <strong>{draftTitle}</strong>
                  <em>{draft.text}</em>
                </span>
                <Button
                  aria-label={`Скопировать: ${draftTitle}`}
                  className="identity-panel-action"
                  variant="secondary"
                  onClick={() => copyDraft(draftKey, draft.text)}
                >
                  <ClipboardCopy aria-hidden="true" size={14} />
                  {copiedDraftKey === draftKey ? "Скопировано" : "Скопировать"}
                </Button>
              </div>
            );
          })}
        </section>
      ) : null}
    </CardComponent>
  );
}
