import { useEffect, useMemo, useState } from "react";
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
  statusTone,
} from "../modules/submissions/status";
import type {
  ActionDecision,
  Applicant,
  Issue,
  QuestionnaireField,
  Submission,
  SubmissionAction,
  SubmissionFile,
} from "../modules/submissions/types";

interface AdminReviewDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  submissionId: string | null;
  submission?: Submission | null;
  onVerifyDocument: () => void;
  onAddRemark: (field?: string, applicant?: string) => void;
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
  "overview" | "applicants" | "questionnaire" | "media" | "issues" | "history";
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

function displaySubmissionTitle(submission: Submission | null | undefined) {
  return submission?.listTitle ?? submission?.title ?? "Заявка не выбрана";
}

function unresolvedIssues(submission: Submission | null | undefined): Issue[] {
  return (
    submission?.issues.filter((issue) => issue.status !== "closed_by_admin") ??
    []
  );
}

function issueStatusLabel(issue: Issue) {
  if (issue.status === "open") return "Открыто";
  if (issue.status === "fixed_by_agent") return "Исправлено агентом";
  return "Закрыто админом";
}

function issueSeverityLabel(issue: Issue) {
  if (issue.severity === "blocker") return "Блокер";
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

function fieldStatus(
  field: QuestionnaireField,
  issues: Issue[],
): FieldReviewStatus {
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
  const role =
    applicant.role === "main"
      ? "Основной"
      : applicant.role === "spouse"
        ? "Супруг/а"
        : applicant.role === "child"
          ? "Ребёнок"
          : "Заявитель";
  return `${applicant.fullName} (${role})`;
}

const FieldRow = ({
  label,
  value,
  status,
  hasDocument,
  onVerify,
  onRemark,
  onApprove,
}: {
  label: string;
  value: string;
  status: FieldReviewStatus;
  hasDocument?: boolean;
  onVerify?: () => void;
  onRemark?: () => void;
  onApprove?: () => void;
}) => (
  <div
    className={`flex flex-col justify-between gap-4 rounded-xl border bg-[#1a1a1d] p-4 transition-colors lg:flex-row lg:items-center
    ${status === "error" ? "border-white/10 bg-white/[0.035]" : "border-[#242529] hover:border-[#2e2f34]"}
  `}
  >
    <div className="min-w-0 flex-1">
      <div className="mb-1 flex items-center gap-2">
        <span className="text-[11.5px] font-medium uppercase tracking-wider text-white/40">
          {label}
        </span>
        {status === "error" && (
          <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-white/62">
            Есть замечание
          </span>
        )}
        {status === "ok" && (
          <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] font-medium text-[#b8baff]">
            Проверено
          </span>
        )}
      </div>
      <div className="truncate text-[14px] font-medium text-white">
        {value || "—"}
      </div>
    </div>
    <div className="flex shrink-0 items-center gap-2">
      {hasDocument && (
        <button
          type="button"
          onClick={onVerify}
          className="flex h-8 items-center gap-1.5 rounded-lg border border-[#6f64ff]/20 bg-[#6f64ff]/10 px-3 text-[12px] font-medium text-[#b8baff] outline-none transition-colors hover:bg-[#6f64ff]/20 focus-visible:ring-2 focus-visible:ring-[#3a45b4]"
        >
          <ScanText className="h-3.5 w-3.5" /> Сверить с паспортом
        </button>
      )}
      <button
        aria-label="Добавить замечание"
        data-testid="admin-review-add-remark"
        type="button"
        onClick={onRemark}
        className="admin-review-remark-action flex h-8 w-8 items-center justify-center rounded-lg border border-transparent bg-white/[0.045] text-white/62 outline-none transition-colors hover:border-white/10 hover:bg-white/[0.06] focus-visible:ring-2 focus-visible:ring-[#6f64ff]/60"
        title="Добавить замечание"
      >
        <MessageSquarePlus className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={onApprove}
        className={`admin-review-approve-action flex h-8 w-8 items-center justify-center rounded-lg border outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#6f64ff]/60
          ${status === "ok" ? "border-white/12 bg-white/[0.06] text-[#b8baff]" : "border-transparent bg-white/5 text-white/40 hover:border-white/10 hover:bg-white/[0.045] hover:text-[#b8baff]"}`}
        title="Пометить как проверенное"
      >
        <CheckCircle2 className="h-4 w-4" />
      </button>
    </div>
  </div>
);

function EmptyTabState({ title, copy }: { title: string; copy: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-20 text-center">
      <Info className="mb-3 h-8 w-8 text-white/22" />
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
}: {
  submission: Submission | null;
  primaryAction: ActionDecision | null;
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

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {[
        ["Статус", statusLabelFor(submission.status)],
        ["Город подачи", submission.city],
        ["Поездка", `${submission.tripDateFrom} – ${submission.tripDateTo}`],
        ["Заявителей", String(submission.applicants.length)],
        ["Анкета", `${submission.completeness.questionnaire}%`],
        ["Файлы", `${acceptedFiles}/${submission.files.length}`],
        ["Незакрытых замечаний", String(openIssues.length)],
        [
          "Следующее действие",
          primaryAction?.disabled && primaryAction.reason
            ? `${primaryAction.label}: ${primaryAction.reason}`
            : (primaryAction?.label ?? "Нет действия"),
        ],
      ].map(([label, value]) => (
        <div
          key={label}
          className="rounded-2xl border border-white/5 bg-white/[0.025] p-4"
        >
          <div className="text-[11px] font-medium uppercase tracking-wider text-white/40">
            {label}
          </div>
          <div className="mt-2 text-[14px] font-semibold text-white">
            {value}
          </div>
        </div>
      ))}
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

  return (
    <div className="space-y-3">
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
            className="rounded-2xl border border-white/5 bg-white/[0.025] p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-[11px] font-medium uppercase tracking-wider text-white/40">
                  Заявитель {index + 1}
                </div>
                <h3 className="m-0 mt-1 text-[15px] font-semibold text-white">
                  {selectedApplicantLabel(applicant)}
                </h3>
              </div>
              <span className="rounded-full border border-white/10 bg-white/[0.045] px-2 py-1 text-[11px] font-medium text-white/62">
                {applicant.questionnaireStatus} / {applicant.fileStatus}
              </span>
            </div>
            <div className="mt-4 grid gap-2 text-[12px] text-white/55 sm:grid-cols-3">
              <span>{applicant.sections.length} разделов анкеты</span>
              <span>{files.length} файлов</span>
              <span>{open.length} замечаний</span>
            </div>
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
  onVerifyDocument: () => void;
  onAddRemark: (field?: string, applicant?: string) => void;
}) {
  const [applicantId, setApplicantId] = useState("");

  useEffect(() => {
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
  const checkedCount = fields.filter(
    (field) => fieldStatus(field, applicantIssues) === "ok",
  ).length;
  const missingCount = fields.filter(
    (field) => field.required && !field.value.trim(),
  ).length;

  return (
    <div className="space-y-6 lg:space-y-8">
      <div className="flex flex-col justify-between gap-4 rounded-2xl border border-white/5 bg-white/[0.02] p-4 sm:flex-row sm:items-center">
        <div>
          <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wider text-white/50">
            Заявитель
          </div>
          <select
            aria-label="Заявитель"
            value={applicant.id}
            onChange={(event) => setApplicantId(event.target.value)}
            className="h-10 w-full rounded-xl border border-[#242529] bg-[#1e1e21] px-3 text-[13px] text-white outline-none focus:border-[#6f64ff] focus:ring-1 focus:ring-[#3a45b4]/30 sm:w-[280px]"
          >
            {submission.applicants.map((item) => (
              <option key={item.id} value={item.id}>
                {selectedApplicantLabel(item)}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-[12px] font-medium">
          <div className="admin-review-metric admin-review-metric--checked flex items-center gap-1.5 text-[#b8baff]">
            <CheckCircle2 className="h-4 w-4" /> {checkedCount} проверено
          </div>
          <div className="admin-review-metric admin-review-metric--pending flex items-center gap-1.5 text-white/40">
            <span className="h-2 w-2 rounded-full bg-white/20" /> {missingCount}{" "}
            осталось
          </div>
          <div
            className={`admin-review-metric admin-review-metric--issues ${
              applicantIssues.length ? "is-open" : "is-clear"
            } flex items-center gap-1.5 text-white/62`}
          >
            <AlertCircle className="h-4 w-4" /> {applicantIssues.length}{" "}
            замечаний
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {applicant.sections.map((section, sectionIndex) => (
          <section key={section.id}>
            <h3 className="admin-review-questionnaire-section-title mb-4 flex items-center gap-2 text-[15px] font-semibold text-white">
              <span className="flex h-6 w-6 items-center justify-center rounded-md bg-white/5 font-mono text-[12px] text-white/60">
                {sectionIndex + 1}
              </span>
              {section.title}
              {section.missing && (
                <span className="admin-review-questionnaire-section-note text-[11px] font-medium text-white/38">
                  · {section.missing}
                </span>
              )}
            </h3>
            <div className="space-y-2">
              {section.fields.map((field) => (
                <FieldRow
                  key={field.id}
                  label={field.label}
                  value={field.value}
                  status={fieldStatus(field, applicantIssues)}
                  hasDocument={isPassportRelatedField(field)}
                  onVerify={onVerifyDocument}
                  onRemark={() => onAddRemark(field.label, applicant.fullName)}
                />
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}

function MediaTab({ submission }: { submission: Submission | null }) {
  if (!submission) {
    return (
      <EmptyTabState
        title="Файлы не загружены"
        copy="Нет выбранной заявки для просмотра медиа."
      />
    );
  }

  return (
    <div className="space-y-3">
      {submission.files.map((file) => {
        const applicant = submission.applicants.find(
          (item) => item.id === file.applicantId,
        );
        return (
          <article
            key={file.id}
            className="flex flex-col gap-3 rounded-2xl border border-white/5 bg-white/[0.025] p-4 sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-[13px] font-semibold text-white">
                  {fileTypeLabels[file.type]}
                </span>
                <span className="rounded-full border border-white/10 bg-white/[0.045] px-2 py-0.5 text-[10px] font-medium text-white/50">
                  {applicant?.fullName ?? file.applicantId}
                </span>
              </div>
              <p className="m-0 mt-1 truncate text-[12px] text-white/45">
                {file.generatedFileName ??
                  file.originalFileName ??
                  file.storagePath ??
                  file.id}
              </p>
            </div>
            <span
              className={`text-[12px] font-semibold ${fileStatusTone(file)}`}
            >
              {fileStatusLabels[file.status]}
            </span>
          </article>
        );
      })}
    </div>
  );
}

function IssuesTab({ submission }: { submission: Submission | null }) {
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
    return (
      <EmptyTabState
        title="Замечаний нет"
        copy="Заявку можно принять, если доменные проверки не нашли блокеров."
      />
    );
  }

  return (
    <div className="space-y-3">
      {issues.map((issue) => (
        <article
          key={issue.id}
          className="rounded-2xl border border-white/5 bg-white/[0.025] p-4"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-white/10 bg-white/[0.045] px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-white/62">
              {issueSeverityLabel(issue)}
            </span>
            <span className="rounded-full border border-white/10 bg-white/[0.045] px-2 py-1 text-[10px] font-medium text-white/50">
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
  if (!submission) {
    return (
      <EmptyTabState
        title="История не загружена"
        copy="Нет выбранной заявки."
      />
    );
  }

  return (
    <div className="space-y-3">
      {submission.history.map((item) => (
        <article
          key={item.id}
          className="rounded-2xl border border-white/5 bg-white/[0.025] p-4"
        >
          <div className="text-[13px] font-semibold text-white">
            {item.text}
          </div>
          <div className="mt-1 text-[11px] text-white/38">{item.at}</div>
          {item.detail && (
            <div className="mt-2 text-[12px] text-white/50">{item.detail}</div>
          )}
        </article>
      ))}
    </div>
  );
}

export function AdminReviewDrawer({
  isOpen,
  onClose,
  submissionId,
  submission = null,
  onVerifyDocument,
  onAddRemark,
  onPrimaryAction,
  onOpenExport,
  canPublishReturnedPdfHandoff = false,
  returnedPdfHandoffReason = "Передача доступна после exported, валидного PDF-пакета и закрытых PDF-замечаний.",
  onPublishReturnedPdfHandoff,
}: AdminReviewDrawerProps) {
  const bridge = useVisaflowBusinessBridge();
  const [activeTab, setActiveTab] = useState<TabId>("questionnaire");
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
  const reviewStatusTone = submission ? statusTone[submission.status] : "muted";
  const primaryReason =
    primaryAction?.disabled && primaryAction.reason
      ? primaryAction.reason
      : primaryAction?.action === "open_history"
        ? "Для этой заявки нет действия проверки."
        : undefined;

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && isOpen) onClose();
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
    if (isOpen) setActiveTab("questionnaire");
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

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          <motion.div
            data-admin-review-drawer-surface="workspace"
            role="dialog"
            initial={{ x: "100%", opacity: 0.5, filter: "blur(8px)" }}
            animate={{ x: 0, opacity: 1, filter: "blur(0px)" }}
            exit={{ x: "100%", opacity: 0, filter: "blur(4px)" }}
            transition={{
              type: "spring",
              damping: 26,
              stiffness: 220,
              mass: 1,
            }}
            className="fixed inset-x-0 bottom-0 top-12 z-50 flex flex-col overflow-hidden rounded-t-[28px] border-x border-t border-white/10 bg-[#111113] shadow-[0_24px_80px_rgba(0,0,0,0.6)] lg:inset-y-2 lg:right-2 lg:left-auto lg:w-[860px] lg:rounded-2xl lg:border"
          >
            <header className="z-20 shrink-0 border-b border-white/5 bg-[#111113]/90 px-5 pb-0 pt-5 backdrop-blur-md lg:px-8">
              <div className="mb-5 flex items-start justify-between gap-4">
                <div className="min-w-0">
                  <div className="mb-2 flex items-center gap-2 text-[11px] text-white/50 lg:text-xs">
                    <span className="admin-review-submission-tag font-mono font-medium tracking-wider text-white/70">
                      {activeSubmissionId ?? "—"}
                    </span>
                    <span className="h-1 w-1 rounded-full bg-white/20" />
                    <span className="truncate">
                      {displaySubmissionTitle(submission)}
                    </span>
                  </div>
                  <h2 className="flex items-center gap-3 text-[20px] font-semibold leading-tight tracking-tight text-white lg:text-[24px]">
                    Проверка пакета
                    <span
                      className={`admin-review-status-pill is-${reviewStatusTone} rounded-full border border-white/10 bg-white/[0.045] px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-white/62`}
                    >
                      <span className="admin-review-status-dot" aria-hidden="true" />
                      {submission
                        ? statusLabelFor(submission.status)
                        : "Не выбрана"}
                    </span>
                  </h2>
                </div>

                <button
                  aria-label="Закрыть проверку"
                  type="button"
                  onClick={onClose}
                  className="flex h-10 w-10 items-center justify-center rounded-xl border border-white/5 bg-white/5 text-white/70 outline-none transition-colors hover:border-white/10 hover:bg-white/10 hover:text-white focus-visible:ring-2 focus-visible:ring-[#3a45b4]"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="-mx-5 w-full overflow-x-auto px-5 scrollbar-hide lg:mx-0 lg:px-0">
                <div className="mb-[-1px] flex w-max items-center gap-1.5">
                  {tabs.map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setActiveTab(tab.id)}
                      className={`relative flex min-h-[44px] items-center gap-2 whitespace-nowrap px-4 text-[13px] font-medium outline-none transition-colors focus-visible:ring-2 focus-visible:ring-[#3a45b4]
                        ${activeTab === tab.id ? "text-white" : "text-white/50 hover:text-white/80"}
                      `}
                    >
                      <tab.icon
                        className={`h-4 w-4 ${activeTab === tab.id ? (tab.isWarning ? "text-white/62" : "text-[#b8baff]") : "opacity-70"}`}
                      />
                      <span>{tab.label}</span>
                      {typeof tab.count === "number" && tab.count > 0 && (
                        <span
                          className={`ml-1 rounded-md px-1.5 py-0.5 text-[10px] leading-none ${tab.isWarning ? "bg-white/[0.06] text-white/62" : "bg-white/10 text-white/70"}`}
                        >
                          {tab.count}
                        </span>
                      )}
                      {activeTab === tab.id && (
                        <motion.div
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

            <div className="scrollbar-thin scrollbar-track-transparent scrollbar-thumb-white/10 flex-1 overflow-y-auto p-5 lg:p-8">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                >
                  {activeTab === "overview" && (
                    <OverviewTab
                      submission={submission}
                      primaryAction={primaryAction}
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
                    <MediaTab submission={submission} />
                  )}
                  {activeTab === "issues" && (
                    <IssuesTab submission={submission} />
                  )}
                  {activeTab === "history" && (
                    <HistoryTab submission={submission} />
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            <footer className="flex shrink-0 justify-end gap-3 border-t border-white/10 bg-[#111113]/90 p-4 pb-[max(16px,env(safe-area-inset-bottom))] backdrop-blur-md lg:px-8 lg:py-5">
              <button
                type="button"
                onClick={onClose}
                className="h-11 rounded-xl border border-white/5 bg-white/5 px-5 text-[13px] font-medium text-white transition-colors hover:bg-white/10"
              >
                Отложить
              </button>
              <button
                type="button"
                onClick={handlePublishReturnedPdfHandoff}
                disabled={!canPublishReturnedPdfHandoff}
                title={
                  canPublishReturnedPdfHandoff
                    ? "Передать опубликованный PDF-пакет агенту"
                    : returnedPdfHandoffReason
                }
                className="h-11 rounded-xl border border-white/10 bg-white/[0.045] px-5 text-[13px] font-medium text-white/70 transition-colors hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:bg-white/5 disabled:text-white/30"
              >
                Передать PDF агенту
              </button>
              <button
                type="button"
                onClick={handlePrimaryAction}
                disabled={primaryDisabled}
                title={primaryReason}
                className="flex h-11 items-center gap-2 rounded-xl bg-[#202126] px-6 text-[13px] font-medium text-white shadow-[0_0_28px_rgba(111,100,255,0.16)] transition-colors hover:bg-[#2a2b32] disabled:cursor-not-allowed disabled:bg-white/5 disabled:text-white/30"
              >
                {primaryAction?.action === "generate_export" ? (
                  <DownloadCloud className="h-4 w-4" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                {primaryButtonLabel}
              </button>
            </footer>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
