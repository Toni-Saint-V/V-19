import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  X,
  CheckCircle2,
  FileText,
  Image as ImageIcon,
  Users,
  History,
  ScanText,
  MessageSquarePlus,
  AlertCircle,
  FileWarning,
  Info,
  DownloadCloud,
  ChevronDown,
  ChevronRight,
} from "lucide-react";
import {
  emitVisaflowUiEvent,
  useVisaflowBusinessBridge,
} from "../integration/visaflowBusinessBridge";
import {
  fileStatusLabels,
  fileTypeLabels,
  getPrimaryAction,
  statusLabelFor,
  statusTone as submissionStatusTone,
} from "../modules/submissions/status";
import {
  historyDetailForUser,
  historyTimestampForUser,
} from "../modules/submissions/historyPresentation";
import type {
  ActionDecision,
  Applicant,
  Issue,
  QuestionnaireField,
  Submission,
  SubmissionAction,
  SubmissionFile,
  SubmissionFileType,
} from "../modules/submissions/types";

interface AdminReviewDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  submissionId: string | null;
  submission?: Submission | null;
  returnFocusTarget?: HTMLElement | null;
  onVerifyDocument: (applicantId?: string) => void;
  onAddRemark: (
    field?: string,
    applicant?: string,
    fileType?: SubmissionFileType,
    applicantId?: string,
  ) => void;
  onPrimaryAction?: (
    submissionId: string,
    action: SubmissionAction,
  ) => void | Promise<void>;
  onOpenExport?: () => void;
  canPublishReturnedPdfHandoff?: boolean;
  returnedPdfHandoffReason?: string;
  onPublishReturnedPdfHandoff?: (submissionId: string) => void | Promise<void>;
}

type TabId =
  | "overview"
  | "applicants"
  | "questionnaire"
  | "media"
  | "issues"
  | "history";
type FieldReviewStatus = "ok" | "pending" | "error";
type DrawerTabDefinition = {
  id: TabId;
  label: string;
  icon: typeof Info;
  count?: number;
  isWarning?: boolean;
};

const passportFieldNeedles = [
  "паспорт",
  "passport",
  "номер",
  "выдач",
  "expires",
  "expiry",
];

const drawerHeadingId = "admin-review-drawer-heading";
const primaryActionReasonId = "admin-review-primary-action-reason";
const focusableDrawerControlSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function drawerTabId(tab: TabId) {
  return `admin-review-tab-${tab}`;
}

function drawerPanelId(tab: TabId) {
  return `admin-review-panel-${tab}`;
}

function displaySubmissionTitle(submission: Submission | null | undefined) {
  return submission?.listTitle ?? submission?.title ?? "Заявка не выбрана";
}

function unresolvedIssues(submission: Submission | null | undefined): Issue[] {
  return submission?.issues.filter((issue) => issue.status !== "closed_by_admin") ?? [];
}

function issueStatusLabel(issue: Issue) {
  if (issue.status === "open") return "Открыто";
  if (issue.status === "fixed_by_agent") return "Исправлено агентом";
  return "Закрыто админом";
}

function issueSeverityLabel(issue: Issue) {
  if (issue.severity === "blocker") return "Критичное";
  if (issue.severity === "warning") return "Проверить";
  return "Инфо";
}

function fileStatusTone(file: SubmissionFile) {
  if (file.status === "accepted") return "text-[#b8baff]";
  if (file.status === "needs_replacement" || file.status === "missing")
    return "text-white/62";
  return "text-white/55";
}

function fieldMatchesIssue(field: QuestionnaireField, issue: Issue) {
  const targetField = issue.target.field?.trim().toLowerCase();
  if (!targetField) return false;
  const fieldLabel = field.label.trim().toLowerCase();
  const fieldId = field.id.trim().toLowerCase();
  return (
    fieldLabel === targetField ||
    fieldId === targetField ||
    fieldLabel.includes(targetField)
  );
}

function fieldStatus(field: QuestionnaireField, issues: Issue[]): FieldReviewStatus {
  if (field.error || issues.some((issue) => fieldMatchesIssue(field, issue)))
    return "error";
  if (field.value.trim()) return "ok";
  return "pending";
}

function isPassportRelatedField(field: QuestionnaireField) {
  const value = `${field.id} ${field.label}`.toLowerCase();
  return passportFieldNeedles.some((needle) => value.includes(needle));
}

function selectedApplicantLabel(applicant: Applicant) {
  return applicant.fullName;
}

function reviewValueFor(field: QuestionnaireField) {
  const value = field.value.trim();
  if (!value) return "";

  if (field.id === "gender") {
    if (/^(m|male|м|мужской)(\s*-.*)?$/i.test(value)) return "Мужской";
    if (/^(f|female|ж|женский)(\s*-.*)?$/i.test(value)) return "Женский";
  }

  if (field.id === "marital-status") {
    if (/^(single|холост|не замуж)/i.test(value)) return "Холост/не замужем";
    if (/^(married|женат|замуж)/i.test(value)) return "Женат/замужем";
    if (/^(divorced|развед)/i.test(value)) return "Разведен(а)";
    if (/^(widow|вдов)/i.test(value)) return "Вдовец/вдова";
  }

  return value;
}

function hasReviewValue(value: string) {
  const normalized = value.trim().toLocaleLowerCase("ru-RU");
  return Boolean(normalized) && normalized !== "—" && normalized !== "не заполнено";
}

function questionnaireStatusLabel(status: string) {
  if (status === "complete") return "Готово";
  if (status === "partial") return "Частично";
  return status;
}

const FieldRow = ({
  id,
  label,
  value,
  status,
  hasDocument,
  onVerify,
  onRemark,
}: {
  id?: string;
  label: string;
  value: string;
  status: FieldReviewStatus;
  hasDocument?: boolean;
  onVerify?: () => void;
  onRemark?: () => void;
}) => (
  <div
    id={id}
    tabIndex={id ? -1 : undefined}
    className={`admin-review-field-row flex flex-col justify-between gap-4 rounded-xl border bg-[#1a1a1d] p-4 transition-colors lg:flex-row lg:items-center
    ${status === "error" ? "is-error border-white/10 bg-white/[0.035]" : status === "ok" ? "is-ok border-[#242529] hover:border-[#2e2f34]" : "border-[#242529] hover:border-[#2e2f34]"}
  `}
  >
    <div className="admin-review-row-main min-w-0 flex-1">
      <div className="admin-review-row-kicker mb-1 flex items-center gap-2">
        <span className="admin-review-row-label text-[11.5px] font-medium uppercase tracking-wider text-white/40">
          {label}
        </span>
        {status === "error" && (
          <span className="admin-review-row-status is-error rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-white/62">
            Есть замечание
          </span>
        )}
        {status === "ok" && (
          <span className="admin-review-row-status is-ok rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-[#b8baff]">
            Заполнено
          </span>
        )}
      </div>
      <strong className="truncate text-[14px] font-medium text-white">
        {value || "—"}
      </strong>
    </div>
    <div className="admin-review-row-actions flex shrink-0 items-center gap-2">
      {hasDocument && onVerify && (
        <button
          type="button"
          onClick={onVerify}
          className="admin-review-row-verify flex h-8 items-center gap-1.5 rounded-lg border border-[#6f64ff]/20 bg-[#6f64ff]/10 px-3 text-[12px] font-medium text-[#b8baff] outline-none transition-colors hover:bg-[#6f64ff]/20 focus-visible:ring-2 focus-visible:ring-[#3a45b4]"
        >
          <ScanText className="h-3.5 w-3.5" /> Сверить с паспортом
        </button>
      )}
      {onRemark && (
        <button
          aria-label="Добавить замечание"
          data-testid="admin-review-add-remark"
          type="button"
          onClick={onRemark}
          className="admin-review-row-remark admin-review-remark-action flex h-8 items-center gap-1.5 rounded-lg border border-[#6f64ff]/20 bg-[#6f64ff]/10 px-3 text-[12px] font-medium text-[#b8baff] outline-none transition-colors hover:bg-[#6f64ff]/20 focus-visible:ring-2 focus-visible:ring-[#3a45b4]"
          title="Добавить замечание"
        >
          <MessageSquarePlus className="h-4 w-4" />
          <span>Замечание</span>
        </button>
      )}
    </div>
  </div>
);

function EmptyTabState({
  title,
  copy,
  tone = "neutral",
}: {
  title: string;
  copy: string;
  tone?: "neutral" | "success";
}) {
  const Icon = tone === "success" ? CheckCircle2 : Info;

  return (
    <div
      className={`admin-review-empty-state is-${tone} flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-20 text-center`}
    >
      <Icon className="mb-3 h-8 w-8 text-white/22" />
      <h3 className="m-0 text-[15px] font-semibold text-white">{title}</h3>
      <p className="m-0 mt-2 max-w-[420px] text-[13px] leading-5 text-white/50">
        {copy}
      </p>
    </div>
  );
}

function OverviewTab({
  submission,
  primaryAction,
  onOpenTab,
}: {
  submission: Submission | null;
  primaryAction: ActionDecision | null;
  onOpenTab: (tab: TabId) => void;
}) {
  if (!submission) {
    return (
      <EmptyTabState
        title="Заявка не найдена"
        copy="Откройте реальную карточку из очереди проверки."
      />
    );
  }

  const openIssues = unresolvedIssues(submission);
  const acceptedFiles = submission.files.filter(
    (file) => file.status === "accepted",
  ).length;
  const nextAction =
    primaryAction?.disabled && primaryAction.reason
      ? primaryAction.reason
      : (primaryAction?.label ?? "Нет действия");
  const decisionChecks = [
    {
      label: "Анкета",
      value: `${submission.completeness.questionnaire}% заполнено`,
      tab: "questionnaire" as const,
      state: submission.completeness.questionnaire === 100 ? "is-ready" : "is-pending",
    },
    {
      label: "Документы",
      value: `${acceptedFiles} из ${submission.files.length} приняты`,
      tab: "media" as const,
      state: acceptedFiles === submission.files.length ? "is-ready" : "is-pending",
    },
    {
      label: "Замечания",
      value: openIssues.length
        ? `${openIssues.length} требуют решения`
        : "Нет открытых",
      tab: "issues" as const,
      state: openIssues.length ? "is-warning" : "is-ready",
    },
  ];

  return (
    <div className="admin-review-overview-tab">
      <section className="admin-review-overview-hero">
        <div>
          <span>Пакет на проверке</span>
          <h3>{displaySubmissionTitle(submission)}</h3>
          <p>
            {submission.city} · {submission.tripDateFrom} – {submission.tripDateTo}
          </p>
        </div>
        <strong>{statusLabelFor(submission.status)}</strong>
      </section>

      <section className="admin-review-overview-metrics" aria-label="Состояние пакета">
        {[
          {
            label: "Анкета",
            value: `${submission.completeness.questionnaire}%`,
            tab: "questionnaire" as const,
            className:
              submission.completeness.questionnaire === 100
                ? "admin-review-metric--checked"
                : "admin-review-metric--pending",
          },
          {
            label: "Файлы",
            value: `${acceptedFiles}/${submission.files.length}`,
            tab: "media" as const,
            className:
              submission.files.length > 0 && acceptedFiles === submission.files.length
                ? "admin-review-metric--checked"
                : "admin-review-metric--pending",
          },
          {
            label: "Заявители",
            value: String(submission.applicants.length),
            tab: "applicants" as const,
            className: "admin-review-metric--applicants",
          },
          {
            label: "Замечания",
            value: String(openIssues.length),
            tab: "issues" as const,
            className: `admin-review-metric--issues ${openIssues.length ? "is-open is-warning" : "is-clear"}`,
          },
        ].map((metric) => (
          <button
            aria-label={`Открыть: ${metric.label}`}
            key={metric.label}
            className={`admin-review-metric ${metric.className}`}
            onClick={() => onOpenTab(metric.tab)}
            type="button"
          >
            <span>{metric.label}</span>
            <strong>{metric.value}</strong>
          </button>
        ))}
      </section>

      <section className="admin-review-overview-detail-grid">
        <div>
          <span>Маршрут</span>
          <strong>{submission.city}</strong>
        </div>
        <div>
          <span>Следующее действие</span>
          <strong>{nextAction}</strong>
        </div>
      </section>

      <section
        className="admin-review-decision-checklist"
        aria-label="Контроль перед решением"
      >
        <header>
          <div>
            <span>Контроль перед решением</span>
            <p>Откройте блок, который требует действия.</p>
          </div>
        </header>
        <ul>
          {decisionChecks.map((check) => (
            <li key={check.label} className={check.state}>
              <button
                aria-label={`Открыть раздел: ${check.label}`}
                type="button"
                onClick={() => onOpenTab(check.tab)}
              >
                <span>{check.label}</span>
                <strong>{check.value}</strong>
                <ChevronRight aria-hidden="true" />
              </button>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function ApplicantsTab({ submission }: { submission: Submission | null }) {
  if (!submission) {
    return (
      <EmptyTabState
        title="Заявители не загружены"
        copy="Нет выбранной заявки для просмотра состава пакета."
      />
    );
  }

  if (!submission.applicants.length) {
    return (
      <EmptyTabState
        title="Заявителей пока нет"
        copy="Состав заявки появится здесь после добавления заявителей в анкету."
      />
    );
  }

  return (
    <div className="admin-review-applicants-tab">
      {submission.applicants.map((applicant, index) => {
        const files = submission.files.filter(
          (file) => file.applicantId === applicant.id,
        );
        const open = unresolvedIssues(submission).filter(
          (issue) => issue.target.applicantId === applicant.id,
        );
        return (
          <article
            key={applicant.id}
            className={index === 0 ? "is-selected" : undefined}
          >
            <header>
              <span>{index + 1}</span>
              <strong>{applicant.fullName}</strong>
              <em className={open.length ? "is-warning" : "is-clear"}>
                {open.length ? `${open.length} замеч.` : "Без замечаний"}
              </em>
            </header>
            <dl>
              <div className="admin-review-applicant-metric">
                <dt>Анкета</dt>
                <dd>{questionnaireStatusLabel(applicant.questionnaireStatus)}</dd>
              </div>
              <div className="admin-review-applicant-metric">
                <dt>Файлы</dt>
                <dd>{files.length}</dd>
              </div>
              <div className="admin-review-applicant-metric">
                <dt>Разделы</dt>
                <dd>{applicant.sections.length}</dd>
              </div>
            </dl>
          </article>
        );
      })}
    </div>
  );
}

function QuestionnaireTab({
  submission,
  onVerifyDocument,
  onAddRemark,
}: {
  submission: Submission | null;
  onVerifyDocument: (applicantId?: string) => void;
  onAddRemark: (
    field?: string,
    applicant?: string,
    fileType?: SubmissionFileType,
    applicantId?: string,
  ) => void;
}) {
  const [applicantId, setApplicantId] = useState("");
  const [isApplicantMenuOpen, setApplicantMenuOpen] = useState(false);
  const applicantSelectRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setApplicantMenuOpen(false);
    if (!submission?.applicants.length) {
      setApplicantId("");
      return;
    }

    setApplicantId((current) =>
      submission.applicants.some((applicant) => applicant.id === current)
        ? current
        : submission.applicants[0].id,
    );
  }, [submission]);

  useEffect(() => {
    if (!isApplicantMenuOpen) return;

    const closeOutsideMenu = (event: MouseEvent) => {
      if (!applicantSelectRef.current?.contains(event.target as Node)) {
        setApplicantMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", closeOutsideMenu);
    return () => document.removeEventListener("mousedown", closeOutsideMenu);
  }, [isApplicantMenuOpen]);

  if (!submission) {
    return (
      <EmptyTabState
        title="Анкета не загружена"
        copy="Выберите существующую заявку из админской очереди."
      />
    );
  }

  const applicant =
    submission.applicants.find((item) => item.id === applicantId) ??
    submission.applicants[0];
  if (!applicant) {
    return (
      <EmptyTabState
        title="Нет заявителей"
        copy="В выбранной заявке нет заявителей для проверки анкеты."
      />
    );
  }

  const applicantIssues = unresolvedIssues(submission).filter(
    (issue) => issue.target.applicantId === applicant.id,
  );
  const fields = applicant.sections.flatMap((section) => section.fields);
  const reviewableFields = fields.filter((field) => hasReviewValue(field.value));
  const reviewableCount = reviewableFields.length;
  const fieldDomId = (fieldId: string) =>
    `admin-review-field-${applicant.id}-${fieldId}`;
  const focusFirstField = (
    predicate: (field: QuestionnaireField) => boolean,
  ) => {
    const target = reviewableFields.find(predicate);
    if (!target) return;
    document.getElementById(fieldDomId(target.id))?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  };

  return (
    <div className="admin-review-questionnaire">
      <div className="admin-review-applicant-strip">
        <div className="admin-review-applicant-select">
          <span>Заявитель</span>
          <div
            className="admin-review-applicant-select-control"
            ref={applicantSelectRef}
            onKeyDown={(event) => {
              if (event.key !== "Escape" || !isApplicantMenuOpen) return;
              event.preventDefault();
              event.stopPropagation();
              setApplicantMenuOpen(false);
            }}
          >
            <button
              aria-controls={
                submission.applicants.length > 1
                  ? "admin-review-applicant-menu"
                  : undefined
              }
              aria-expanded={isApplicantMenuOpen}
              aria-haspopup="listbox"
              aria-label={`Выбранный заявитель: ${selectedApplicantLabel(applicant)}`}
              className="admin-review-applicant-select-trigger"
              disabled={submission.applicants.length < 2}
              onClick={() => setApplicantMenuOpen((current) => !current)}
              type="button"
            >
              <span className="admin-review-applicant-select-value">
                {selectedApplicantLabel(applicant)}
              </span>
              {submission.applicants.length > 1 ? (
                <ChevronDown aria-hidden="true" className={isApplicantMenuOpen ? "is-open" : undefined} />
              ) : null}
            </button>

            {isApplicantMenuOpen ? (
              <div
                aria-label="Выберите заявителя"
                className="admin-review-applicant-select-menu"
                id="admin-review-applicant-menu"
                role="listbox"
              >
                {submission.applicants.map((item) => {
                  const isSelected = item.id === applicant.id;
                  return (
                    <button
                      aria-selected={isSelected}
                      className={isSelected ? "is-selected" : undefined}
                      key={item.id}
                      onClick={() => {
                        setApplicantId(item.id);
                        setApplicantMenuOpen(false);
                      }}
                      role="option"
                      type="button"
                    >
                      <span>{selectedApplicantLabel(item)}</span>
                      {isSelected ? <CheckCircle2 aria-hidden="true" /> : null}
                    </button>
                  );
                })}
              </div>
            ) : null}
          </div>
        </div>

        <div className="admin-review-applicant-stats" aria-label="Навигация по анкете">
          <button
            className="admin-review-applicant-stat-button is-ok"
            onClick={() => focusFirstField(() => true)}
            type="button"
          >
            <CheckCircle2 className="h-4 w-4" /> {reviewableCount} значений
          </button>
          <button
            className={`admin-review-applicant-stat-button ${
              applicantIssues.length ? "is-warning" : "is-ok"
            }`}
            disabled={!applicantIssues.length}
            onClick={() =>
              focusFirstField(
                (field) => fieldStatus(field, applicantIssues) === "error",
              )
            }
            type="button"
          >
            <AlertCircle className="h-4 w-4" /> {applicantIssues.length
              ? `${applicantIssues.length} замечаний`
              : "Без замечаний"}
          </button>
        </div>
      </div>

      <div className="admin-review-field-pane">
        {applicant.sections.map((section, sectionIndex) => {
          const visibleFields = section.fields.filter((field) =>
            hasReviewValue(field.value),
          );
          if (!visibleFields.length) return null;

          const unresolvedInSection = visibleFields.some(
            (field) =>
              fieldStatus(field, applicantIssues) === "error",
          );

          return (
            <details
              className="admin-review-field-section"
              key={section.id}
              open={sectionIndex === 0 || unresolvedInSection}
            >
              <summary className="admin-review-questionnaire-section-title flex cursor-pointer items-center gap-2 text-[15px] font-semibold text-white">
                <span className="admin-review-section-number flex h-6 w-6 items-center justify-center rounded-md bg-white/5 font-mono text-[12px] text-white/60">
                  {sectionIndex + 1}
                </span>
                <span className="min-w-0 flex-1 truncate">{section.title}</span>
                <span className="text-[11px] font-medium text-white/40">
                  {visibleFields.length} полей
                </span>
                <ChevronDown aria-hidden="true" className="h-4 w-4 text-white/45" />
              </summary>
              <div className="admin-review-field-table mt-3 space-y-2">
                {visibleFields.map((field) => (
                  <FieldRow
                    id={fieldDomId(field.id)}
                    key={field.id}
                    label={field.label}
                    value={reviewValueFor(field)}
                    status={fieldStatus(field, applicantIssues)}
                    hasDocument={isPassportRelatedField(field)}
                    onVerify={() => onVerifyDocument(applicant.id)}
                    onRemark={() =>
                      onAddRemark(field.label, applicant.fullName, undefined, applicant.id)
                    }
                  />
                ))}
              </div>
            </details>
          );
        })}
      </div>
    </div>
  );
}

function MediaTab({
  onAddRemark,
  onVerifyDocument,
  submission,
}: {
  onAddRemark: AdminReviewDrawerProps["onAddRemark"];
  onVerifyDocument: AdminReviewDrawerProps["onVerifyDocument"];
  submission: Submission | null;
}) {
  if (!submission) {
    return (
      <EmptyTabState
        title="Файлы не загружены"
        copy="Нет выбранной заявки для просмотра медиа."
      />
    );
  }

  if (!submission.files.length) {
    return (
      <EmptyTabState
        title="Файлов пока нет"
        copy="Загруженные документы появятся здесь и будут доступны для статусов и замечаний."
      />
    );
  }

  return (
    <div className="admin-review-files-tab">
      {submission.files.map((file) => {
        const applicant = submission.applicants.find(
          (item) => item.id === file.applicantId,
        );
        return (
          <article
            key={file.id}
            className="admin-review-file-row"
            data-file-status={file.status}
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="admin-review-file-title text-[13px] font-semibold text-white">
                  {fileTypeLabels[file.type]}
                </span>
                <span className="admin-review-file-applicant rounded-full border border-white/10 bg-white/[0.045] px-2 py-0.5 text-[10px] font-medium text-white/50">
                  {applicant?.fullName ?? file.applicantId}
                </span>
              </div>
              <p className="admin-review-file-name m-0 mt-1 truncate text-[12px] text-white/45">
                {file.generatedFileName ??
                  file.originalFileName ??
                  file.storagePath ??
                  file.id}
              </p>
            </div>
            <div className="admin-review-file-actions">
              <span
                className={`admin-review-file-status text-[12px] font-semibold ${fileStatusTone(file)}`}
              >
                {fileStatusLabels[file.status]}
              </span>
              {file.type === "passport_scan" && file.status !== "missing" && (
                <button
                  aria-label={`Сверить паспорт: ${applicant?.fullName ?? "заявитель"}`}
                  className="admin-review-file-verify"
                  data-testid="admin-review-verify-passport"
                  title="Открыть сверку паспорта"
                  type="button"
                  onClick={() => onVerifyDocument(applicant?.id ?? file.applicantId)}
                >
                  <ScanText aria-hidden="true" />
                  <span>Сверить</span>
                </button>
              )}
              <button
                aria-label={`Добавить замечание: ${fileTypeLabels[file.type]} — ${applicant?.fullName ?? "заявитель"}`}
                className="admin-review-file-remark flex h-10 items-center justify-center gap-1.5 whitespace-nowrap rounded-[10px] border border-transparent bg-white/[0.045] px-3 text-[12px] font-medium text-white/62 outline-none transition-colors hover:border-white/10 hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-[#6f64ff]/60"
                data-testid="admin-review-add-file-remark"
                title="Добавить замечание к файлу"
                type="button"
                onClick={() =>
                  onAddRemark(
                    fileTypeLabels[file.type],
                    applicant?.fullName,
                    file.type,
                    file.applicantId,
                  )
                }
                >
                  <MessageSquarePlus className="h-4 w-4" />
                  <span>Замечание</span>
                </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}

function IssuesTab({
  submission,
  primaryAction,
}: {
  submission: Submission | null;
  primaryAction: ActionDecision | null;
}) {
  if (!submission) {
    return (
      <EmptyTabState
        title="Замечания не загружены"
        copy="Выберите заявку, чтобы увидеть замечания по анкете и файлам."
      />
    );
  }

  const issues = unresolvedIssues(submission);
  if (!issues.length) {
    const packageBlocked = Boolean(primaryAction?.disabled);

    return (
      <EmptyTabState
        title={
          packageBlocked
            ? "Замечаний нет, но пакет ещё не готов"
            : "Замечаний нет"
        }
        copy={
          primaryAction?.disabled && primaryAction.reason
            ? primaryAction.reason
            : "Открытых замечаний нет. Следующее допустимое действие указано внизу панели."
        }
        tone={packageBlocked ? "neutral" : "success"}
      />
    );
  }

  return (
    <div className="admin-review-issues-list">
      {issues.map((issue) => (
        <article key={issue.id} className="admin-review-issue-card">
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`admin-review-issue-severity is-${issue.severity} rounded-full border border-white/10 bg-white/[0.045] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/62`}
            >
              {issueSeverityLabel(issue)}
            </span>
            <span
              className={`admin-review-issue-status is-${issue.status} rounded-full border border-white/10 bg-white/[0.045] px-2 py-1 text-[10px] font-medium text-white/50`}
            >
              {issueStatusLabel(issue)}
            </span>
          </div>
          <h3 className="m-0 mt-3 text-[14px] font-semibold text-white">
            {issue.reason}
          </h3>
          <p className="m-0 mt-2 text-[13px] leading-5 text-white/55">
            {issue.comment}
          </p>
          <p className="m-0 mt-3 text-[11px] text-white/35">
            {issue.target.applicantName} ·{" "}
            {issue.target.field ??
              issue.target.section ??
              issue.target.fileType ??
              issue.type}
          </p>
        </article>
      ))}
    </div>
  );
}

function HistoryTab({ submission }: { submission: Submission | null }) {
  const [expandedEventId, setExpandedEventId] = useState<string | null>(null);

  if (!submission) {
    return <EmptyTabState title="История не загружена" copy="Нет выбранной заявки." />;
  }

  if (!submission.history.length) {
    return (
      <EmptyTabState
        title="История пока пуста"
        copy="Здесь появятся действия по заявке после первого сохранённого шага."
      />
    );
  }

  return (
    <div className="admin-review-history-tab">
      {submission.history.map((item) => {
        const detail = historyDetailForUser(item);
        const isExpanded = expandedEventId === item.id;
        return (
          <article
            key={item.id}
            className={`admin-review-history-item ${isExpanded ? "is-expanded" : ""}`}
          >
            <button
              aria-expanded={isExpanded}
              className="w-full text-left"
              onClick={() => setExpandedEventId(isExpanded ? null : item.id)}
              type="button"
            >
              <span>{historyTimestampForUser(item.at)}</span>
              <div>
                <strong>{item.text}</strong>
                {isExpanded && detail ? <p>{detail}</p> : null}
              </div>
              <ChevronDown aria-hidden="true" className="h-4 w-4 text-white/45" />
            </button>
          </article>
        );
      })}
    </div>
  );
}

export function AdminReviewDrawer({
  isOpen,
  onClose,
  submissionId,
  submission = null,
  returnFocusTarget,
  onVerifyDocument,
  onAddRemark,
  onPrimaryAction,
  onOpenExport,
  canPublishReturnedPdfHandoff = false,
  returnedPdfHandoffReason = "Передача доступна после exported, валидного PDF-пакета и закрытых PDF-замечаний.",
  onPublishReturnedPdfHandoff,
}: AdminReviewDrawerProps) {
  const bridge = useVisaflowBusinessBridge();
  const drawerRef = useRef<HTMLDivElement>(null);
  const tabListRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const [activeTab, setActiveTab] = useState<TabId>("media");
  const activeSubmissionId = submission?.id ?? submissionId;
  const primaryAction = useMemo(
    () => (submission ? getPrimaryAction(submission, "admin", "review") : null),
    [submission],
  );
  const primaryButtonLabel =
    primaryAction?.action === "generate_export"
      ? "Перейти к выгрузке"
      : (primaryAction?.label ?? "Завершить проверку");
  const primaryDisabled =
    !activeSubmissionId ||
    !primaryAction ||
    primaryAction.disabled ||
    primaryAction.action === "open_history";
  const primaryReason =
    primaryAction?.disabled && primaryAction.reason
      ? primaryAction.reason
      : primaryAction?.action === "open_history"
        ? "Для этой заявки нет действия проверки."
        : undefined;
  const currentStatusTone = submission
    ? submissionStatusTone[submission.status]
    : "muted";

  useEffect(() => {
    if (!isOpen) return;

    returnFocusRef.current =
      returnFocusTarget && document.contains(returnFocusTarget)
        ? returnFocusTarget
        : document.activeElement instanceof HTMLElement
          ? document.activeElement
          : null;
    const animationFrame = window.requestAnimationFrame(() => {
      drawerRef.current
        ?.querySelector<HTMLElement>("[data-admin-review-initial-focus]")
        ?.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [isOpen, returnFocusTarget]);

  useEffect(() => {
    if (isOpen) return;

    const trigger = returnFocusRef.current;
    if (!trigger || !document.contains(trigger)) return;
    const animationFrame = window.requestAnimationFrame(() => {
      trigger.focus({ preventScroll: true });
    });

    return () => window.cancelAnimationFrame(animationFrame);
  }, [isOpen]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!isOpen || document.querySelector(".v19-remark-form-dialog[role='dialog']")) {
        return;
      }

      if (event.key === "Escape") {
        onClose();
        return;
      }

      if (event.key !== "Tab") return;

      const root = drawerRef.current;
      if (!root) return;
      const controls = Array.from(
        root.querySelectorAll<HTMLElement>(focusableDrawerControlSelector),
      ).filter((control) => control.getClientRects().length > 0);
      if (!controls.length) return;

      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    if (isOpen) {
      window.addEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (isOpen) {
      setActiveTab("media");
      const animationFrame = window.requestAnimationFrame(() => {
        tabListRef.current
          ?.querySelector<HTMLElement>("[role='tab'][aria-selected='true']")
          ?.scrollIntoView?.({ block: "nearest", inline: "center" });
      });
      return () => window.cancelAnimationFrame(animationFrame);
    }
    return undefined;
  }, [isOpen, activeSubmissionId]);

  const tabs = useMemo<DrawerTabDefinition[]>(
    () => [
      { id: "overview" as const, label: "Обзор", icon: Info },
      {
        id: "applicants" as const,
        label: "Заявители",
        icon: Users,
        count: submission?.applicants.length,
      },
      {
        id: "questionnaire" as const,
        label: "Анкета",
        icon: FileText,
        count: submission?.applicants.flatMap((applicant) =>
          applicant.sections.flatMap((section) => section.fields),
        ).length,
      },
      {
        id: "media" as const,
        label: "Файлы",
        icon: ImageIcon,
        count: submission?.files.length,
      },
      {
        id: "issues" as const,
        label: "Замечания",
        icon: FileWarning,
        count: unresolvedIssues(submission).length,
        isWarning: unresolvedIssues(submission).length > 0,
      },
      {
        id: "history" as const,
        label: "История",
        icon: History,
        count: submission?.history.length,
      },
    ],
    [submission],
  );

  const handlePublishReturnedPdfHandoff = () => {
    if (!activeSubmissionId || !canPublishReturnedPdfHandoff) return;
    void onPublishReturnedPdfHandoff?.(activeSubmissionId);
    void bridge.onPublishReturnedPdfHandoff?.(activeSubmissionId);
    emitVisaflowUiEvent(bridge, {
      type: "returned-pdf-handoff.publish",
      submissionId: activeSubmissionId,
    });
  };

  const handlePrimaryAction = () => {
    if (
      !activeSubmissionId ||
      !primaryAction ||
      primaryAction.disabled ||
      primaryAction.action === "open_history"
    )
      return;

    if (primaryAction.action === "generate_export") {
      onOpenExport?.();
      return;
    }

    void onPrimaryAction?.(activeSubmissionId, primaryAction.action);
  };

  const selectTab = (tab: TabId) => {
    setActiveTab(tab);
    window.requestAnimationFrame(() => {
      tabListRef.current
        ?.querySelector<HTMLElement>("[role='tab'][aria-selected='true']")
        ?.scrollIntoView?.({ block: "nearest", inline: "center" });
      const drawer = drawerRef.current;
      if (!drawer) return;
      if (typeof drawer.scrollTo === "function") {
        drawer.scrollTo({ left: 0 });
        return;
      }
      drawer.scrollLeft = 0;
    });
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="admin-review-backdrop fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            aria-hidden="true"
            onClick={onClose}
          />

          <motion.div
            ref={drawerRef}
            role="dialog"
            aria-labelledby={drawerHeadingId}
            aria-modal="true"
            tabIndex={-1}
            initial={{ x: "100%", opacity: 0.5, filter: "blur(8px)" }}
            animate={{ x: 0, opacity: 1, filter: "blur(0px)" }}
            exit={{ x: "100%", opacity: 0, filter: "blur(4px)" }}
            transition={{
              type: "spring",
              damping: 26,
              stiffness: 220,
              mass: 1,
            }}
            className="admin-review-drawer fixed inset-x-0 bottom-0 top-12 z-50 flex flex-col overflow-hidden rounded-t-[28px] border-x border-t border-white/10 bg-[#111113] shadow-[0_24px_80px_rgba(0,0,0,0.6)] lg:inset-y-2 lg:right-2 lg:left-auto lg:w-[860px] lg:rounded-2xl lg:border"
            data-admin-review-drawer-surface="workspace"
          >
            <header className="admin-review-drawer-header z-20 shrink-0 border-b border-white/5 bg-[#111113]/90 px-5 pb-0 pt-5 backdrop-blur-md lg:px-8">
              <div className="admin-review-titlebar mb-5 flex items-start justify-between gap-4">
                <div className="admin-review-titlecopy min-w-0">
                  <p className="mb-2 flex items-center gap-2 text-[11px] text-white/50 lg:text-xs">
                    <span className="admin-review-submission-tag font-mono font-medium tracking-wider text-white/70">
                      {activeSubmissionId ?? "—"}
                    </span>
                    <span className="admin-review-title-separator h-1 w-1 rounded-full bg-white/20" />
                    <span className="truncate">
                      {displaySubmissionTitle(submission)}
                    </span>
                  </p>
                  <h2 className="flex items-center gap-3 text-[20px] font-semibold leading-tight tracking-tight text-white lg:text-[24px]">
                    <span id={drawerHeadingId} className="admin-review-drawer-heading">
                      Проверка пакета
                    </span>
                    <span
                      aria-label={
                        submission ? statusLabelFor(submission.status) : "Не выбрана"
                      }
                      className={`admin-review-status-pill is-${currentStatusTone} rounded-full border border-white/10 bg-white/[0.045] px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-white/62`}
                    >
                      <i
                        className={`admin-review-status-dot is-${currentStatusTone}`}
                        aria-hidden="true"
                      />
                      {submission ? statusLabelFor(submission.status) : "Не выбрана"}
                    </span>
                  </h2>
                </div>

                <button
                  aria-label="Закрыть проверку"
                  data-admin-review-initial-focus
                  type="button"
                  onClick={onClose}
                  className="admin-review-close flex h-10 w-10 items-center justify-center rounded-xl border border-white/5 bg-white/5 text-white/70 outline-none transition-colors hover:border-white/10 hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-[#3a45b4]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div
                aria-label="Разделы проверки"
                className="admin-review-tabs relative -mx-5 w-full overflow-visible px-5 lg:mx-0 lg:px-0"
                ref={tabListRef}
                role="tablist"
              >
                <div className="mb-[-1px] flex min-w-0 w-full items-center gap-1.5">
                  {tabs.map((tab) => (
                    <button
                      aria-controls={drawerPanelId(tab.id)}
                      aria-selected={activeTab === tab.id}
                      id={drawerTabId(tab.id)}
                      key={tab.id}
                      role="tab"
                      type="button"
                      onClick={() => selectTab(tab.id)}
                      className={`relative flex min-h-[44px] items-center gap-2 whitespace-nowrap px-4 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#3a45b4]
                        ${activeTab === tab.id ? "is-active text-white" : "text-white/50 hover:text-white/80"}
                      `}
                    >
                      <tab.icon
                        className={`h-4 w-4 ${activeTab === tab.id ? (tab.isWarning ? "text-white/62" : "text-[#b8baff]") : "opacity-70"}`}
                      />
                      <span>{tab.label}</span>
                      {typeof tab.count === "number" && tab.count > 0 && (
                        <em
                          className={`admin-review-tab-count ml-1 rounded-md px-1.5 py-0.5 text-[10px] leading-none ${tab.isWarning ? "is-warning bg-white/[0.06] text-white/62" : "bg-white/10 text-white/70"}`}
                        >
                          {tab.count}
                        </em>
                      )}
                      {activeTab === tab.id && (
                        <motion.i
                          layoutId="adminActiveTab"
                          className="absolute inset-x-0 bottom-0 h-0.5 bg-[#6f64ff]"
                          initial={false}
                          transition={{
                            type: "spring",
                            bounce: 0.2,
                            duration: 0.5,
                          }}
                        />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </header>

            <div className="admin-review-content scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10 flex-1 overflow-y-auto p-5 lg:p-8">
              <AnimatePresence mode="wait">
                <motion.div
                  aria-labelledby={drawerTabId(activeTab)}
                  key={activeTab}
                  id={drawerPanelId(activeTab)}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  role="tabpanel"
                  tabIndex={0}
                  transition={{ duration: 0.2 }}
                >
                  {activeTab === "overview" && (
                    <OverviewTab
                      submission={submission}
                      primaryAction={primaryAction}
                      onOpenTab={selectTab}
                    />
                  )}
                  {activeTab === "applicants" && (
                    <ApplicantsTab submission={submission} />
                  )}
                  {activeTab === "questionnaire" && (
                    <QuestionnaireTab
                      submission={submission}
                      onVerifyDocument={onVerifyDocument}
                      onAddRemark={onAddRemark}
                    />
                  )}
                  {activeTab === "media" && (
                    <MediaTab
                      onAddRemark={onAddRemark}
                      onVerifyDocument={onVerifyDocument}
                      submission={submission}
                    />
                  )}
                  {activeTab === "issues" && (
                    <IssuesTab primaryAction={primaryAction} submission={submission} />
                  )}
                  {activeTab === "history" && <HistoryTab submission={submission} />}
                </motion.div>
              </AnimatePresence>
            </div>

            <footer className="admin-review-footer flex shrink-0 justify-end gap-3 border-t border-white/10 bg-[#111113]/90 p-4 pb-[max(16px,env(safe-area-inset-bottom))] backdrop-blur-md lg:px-8 lg:py-5">
              {primaryDisabled && primaryReason ? (
                <div
                  className="admin-review-primary-reason"
                  id={primaryActionReasonId}
                  role="status"
                >
                  <AlertCircle aria-hidden="true" className="h-4 w-4 shrink-0" />
                  <span>
                    <strong>Нельзя принять:</strong> {primaryReason}
                  </span>
                  <button
                    className="admin-review-primary-reason-action"
                    onClick={() => selectTab("overview")}
                    type="button"
                  >
                    Показать требования
                  </button>
                </div>
              ) : null}
              <div className="admin-review-footer-actions">
                <button
                  type="button"
                  onClick={onClose}
                  className="admin-review-secondary h-11 rounded-xl border border-white/5 bg-white/5 px-5 text-[13px] font-medium text-white transition-colors hover:bg-white/10"
                >
                  Закрыть
                </button>
                {canPublishReturnedPdfHandoff && (
                  <button
                    type="button"
                    onClick={handlePublishReturnedPdfHandoff}
                    title={returnedPdfHandoffReason}
                    className="admin-review-secondary h-11 rounded-xl border border-white/10 bg-white/[0.045] px-5 text-[13px] font-medium text-white/70 transition-colors hover:bg-white/[0.08]"
                  >
                    Передать PDF агенту
                  </button>
                )}
                <button
                  aria-describedby={
                    primaryDisabled && primaryReason
                      ? primaryActionReasonId
                      : undefined
                  }
                  type="button"
                  onClick={handlePrimaryAction}
                  disabled={primaryDisabled}
                  title={primaryReason}
                  className="admin-review-primary flex h-11 items-center gap-2 rounded-xl bg-[#202126] px-6 text-[13px] font-medium text-white shadow-[0_0_28px_rgba(111,100,255,0.16)] transition-colors hover:bg-[#2a2b32] disabled:cursor-not-allowed disabled:bg-white/5 disabled:text-white/30"
                >
                  {primaryAction?.action === "generate_export" ? (
                    <DownloadCloud className="h-4 w-4" />
                  ) : (
                    <CheckCircle2 className="h-4 w-4" />
                  )}
                  {primaryButtonLabel}
                </button>
              </div>
            </footer>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
