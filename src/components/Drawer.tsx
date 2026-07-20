import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import {
  drawerMotion,
  drawerPanelExit,
  drawerPanelInitial,
  drawerPanelTransition,
  drawerTabExit,
  drawerTabInitial,
  useDrawerDesktopQuery,
} from "../shared/ui/drawer/drawerMotion";
import {
  AlertCircle,
  Briefcase,
  Calendar,
  CheckCircle2,
  CreditCard,
  Edit3,
  FileDigit,
  FileText,
  History,
  Image as ImageIcon,
  MapPin,
  Plane,
  UploadCloud,
  User,
  X,
} from "lucide-react";

import { historyTimestampForUser } from "../modules/submissions/historyPresentation";
import { submissionPublicId } from "../modules/submissions/submissionIdentity";
import {
  getPrimaryAction,
  statusLabelFor,
} from "../modules/submissions/status";
import type {
  DrawerTab,
  Issue,
  Submission,
  SubmissionAction,
  SubmissionFile,
  SubmissionFileType,
  SubmissionStatus,
} from "../modules/submissions/types";
import {
  fileLabel,
  targetElementId,
  targetForIssue,
  type WorkspaceTarget,
} from "../modules/submissions/workspaceModel";
import {
  applicantInitials,
  tripDatesForSubmission,
  updatedLabel,
} from "./v19BusinessScreenAdapter";

interface ApplicantDetail {
  completeness: number;
  name: string;
  role: string;
}

interface SubmissionDetail {
  id: string;
  title: string;
  type: "single" | "family";
  applicantsCount: number;
  applicants: ApplicantDetail[];
  city: string;
  tripDates: string;
  status: SubmissionStatus;
  updated: string;
  issuesCount: number;
}

interface DrawerProps {
  activeTab?: DrawerTab;
  focusTarget?: WorkspaceTarget;
  isOpen: boolean;
  submission: Submission;
  onAction: (action: SubmissionAction) => void | Promise<void>;
  onClearFocusTarget?: () => void;
  onClose: () => void;
  onOpenQuestionnaire: (target?: QuestionnaireFocusTarget) => void;
  onOpenWorkspaceTarget: (target: WorkspaceTarget) => void;
  onUploadApplicantFile?: (
    submissionId: string,
    applicantId: string,
    fileType: SubmissionFileType,
    file: File,
  ) => Promise<unknown>;
}

type TabId = "overview" | "questionnaire" | "issues" | "history";

type QuestionnaireFocusTarget = {
  applicantId?: string;
  field?: string;
  section?: string;
};

type QuestionnaireSectionDetail = {
  Icon: LucideIcon;
  progress: number;
  remaining?: string;
  status: "done" | "in_progress" | "pending";
  target?: QuestionnaireFocusTarget;
  title: string;
};

const questionnaireSectionBlueprint: ReadonlyArray<{
  Icon: LucideIcon;
  fieldIds?: readonly string[];
  sectionIds: readonly string[];
  title: string;
}> = [
  { Icon: User, sectionIds: ["personal", "contacts"], title: "Личные данные" },
  { Icon: FileDigit, sectionIds: ["passport"], title: "Паспортные данные" },
  { Icon: Briefcase, sectionIds: ["employment"], title: "Место работы / Учебы" },
  { Icon: CreditCard, sectionIds: ["payment"], title: "Спонсоры и финансы" },
  {
    Icon: Plane,
    sectionIds: ["appointment", "trip", "hotel"],
    title: "Детали поездки",
  },
  {
    Icon: History,
    fieldIds: [
      "previous-biometrics",
      "previous-biometrics-date",
      "previous-visa-number",
    ],
    sectionIds: ["trip"],
    title: "Визовая история",
  },
];

const neutralStatusStyles = `
  [data-v19-submission-drawer="true"] .v19-submission-drawer-status:not([data-preserve-status-tone="true"]) {
    border-color: var(--v19b-color-border-strong) !important;
    color: var(--v19b-color-text-muted) !important;
    background: var(--v19b-color-control) !important;
  }
`;

function applicantRoleLabel(role: string) {
  if (role === "main") return "Основной";
  if (role === "spouse") return "Супруг(а)";
  if (role === "child") return "Ребёнок";
  return role;
}

function applicantQuestionnairePercent(applicant: Submission["applicants"][number]) {
  if (applicant.questionnaireStatus === "complete") return 100;
  if (applicant.questionnaireStatus === "empty") return 0;
  if (applicant.sections.length === 0) return 0;

  const completeCount = applicant.sections.filter(
    (section) => section.status === "complete",
  ).length;
  return Math.round((completeCount / applicant.sections.length) * 100);
}

function buildSubmissionDetail(submission: Submission): SubmissionDetail {
  return {
    applicants: submission.applicants.map((applicant) => ({
      completeness: applicantQuestionnairePercent(applicant),
      name: applicant.fullName,
      role: applicantRoleLabel(applicant.role ?? "main"),
    })),
    applicantsCount: submission.applicants.length,
    city: submission.city,
    id: submissionPublicId(submission),
    issuesCount: submission.issues.filter((issue) => issue.status !== "closed_by_admin")
      .length,
    status: submission.status,
    title: submission.title,
    tripDates: tripDatesForSubmission(submission),
    type: submission.type,
    updated: updatedLabel(submission.updatedAt),
  };
}

function isFileReady(file: SubmissionFile) {
  return file.status !== "missing" && file.status !== "needs_replacement";
}

function documentPackageItems(submission: Submission) {
  const groupedFiles = new Map<
    SubmissionFile["type"],
    { ready: number; total: number; type: SubmissionFile["type"] }
  >();

  for (const file of submission.files) {
    const current = groupedFiles.get(file.type) ?? {
      ready: 0,
      total: 0,
      type: file.type,
    };
    groupedFiles.set(file.type, {
      ...current,
      ready: current.ready + (isFileReady(file) ? 1 : 0),
      total: current.total + 1,
    });
  }

  return Array.from(groupedFiles.values()).map((item) => ({
    label:
      item.total > 1
        ? `${fileLabel(item.type)} (${item.ready}/${item.total})`
        : fileLabel(item.type),
    status: item.ready === item.total ? "done" : "pending",
  }));
}

function questionnaireSectionCandidateProgress(
  candidate: Submission["applicants"][number]["sections"][number],
  fieldIds: readonly string[] | undefined,
) {
  if (candidate.status === "complete") return 100;
  if (candidate.status === "empty") return 0;

  const fields = fieldIds
    ? candidate.fields.filter((field) => fieldIds.includes(field.id))
    : candidate.fields;
  const requiredFields = fields.filter((field) => field.required);
  if (requiredFields.length === 0) {
    return candidate.status === "needs_fix" ? 65 : 40;
  }

  const filledFields = requiredFields.filter(
    (field) => field.value.trim().length > 0 && !field.error,
  );
  const calculated = Math.round((filledFields.length / requiredFields.length) * 100);
  return candidate.status === "needs_fix" ? Math.min(calculated, 90) : calculated;
}

function questionnaireProgressStatus(
  progress: number,
): QuestionnaireSectionDetail["status"] {
  if (progress >= 100) return "done";
  if (progress > 0) return "in_progress";
  return "pending";
}

function remainingFieldsLabel(count: number) {
  if (count % 10 === 1 && count % 100 !== 11) return `${count} поле`;
  if (count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14)) {
    return `${count} поля`;
  }
  return `${count} полей`;
}

function remainingBlocksLabel(count: number) {
  if (count === 0) return "Все блоки данных заполнены";
  if (count % 10 === 1 && count % 100 !== 11) {
    return `Осталось заполнить ${count} блок данных`;
  }
  if (count % 10 >= 2 && count % 10 <= 4 && (count % 100 < 12 || count % 100 > 14)) {
    return `Осталось заполнить ${count} блока данных`;
  }
  return `Осталось заполнить ${count} блоков данных`;
}

function buildQuestionnaireSections(
  submission: Submission,
): QuestionnaireSectionDetail[] {
  const allApplicantsComplete = submission.applicants.every(
    (applicant) => applicant.questionnaireStatus === "complete",
  );

  return questionnaireSectionBlueprint.map((blueprint) => {
    const relevantSections = submission.applicants.flatMap((applicant) =>
      applicant.sections
        .filter((section) =>
          blueprint.sectionIds.some(
            (sectionId) =>
              section.id === sectionId || section.id.endsWith(`-${sectionId}`),
          ),
        )
        .map((section) => ({ applicant, section })),
    );
    let progress = 0;
    if (allApplicantsComplete) {
      progress = 100;
    } else if (relevantSections.length > 0) {
      progress = Math.round(
        relevantSections.reduce(
          (sum, candidate) =>
            sum +
            questionnaireSectionCandidateProgress(
              candidate.section,
              blueprint.fieldIds,
            ),
          0,
        ) / relevantSections.length,
      );
    }
    const remainingFieldCount = allApplicantsComplete
      ? 0
      : relevantSections.reduce((sum, candidate) => {
          const fields = blueprint.fieldIds
            ? candidate.section.fields.filter((field) =>
                blueprint.fieldIds?.includes(field.id),
              )
            : candidate.section.fields;
          return (
            sum +
            fields.filter(
              (field) =>
                field.required && (!field.value.trim() || Boolean(field.error)),
            ).length
          );
        }, 0);
    const targetCandidate =
      relevantSections.find(({ section }) => section.status !== "complete") ??
      relevantSections[0];

    return {
      Icon: blueprint.Icon,
      progress,
      remaining:
        remainingFieldCount > 0 ? remainingFieldsLabel(remainingFieldCount) : undefined,
      status: questionnaireProgressStatus(progress),
      target: targetCandidate
        ? {
            applicantId: targetCandidate.applicant.id,
            section: targetCandidate.section.title,
          }
        : undefined,
      title: blueprint.title,
    };
  });
}

function drawerTab(activeTab: DrawerTab | undefined): TabId {
  if (activeTab === "questionnaire") return "questionnaire";
  if (activeTab === "issues") return "issues";
  if (activeTab === "history") return "history";
  return "overview";
}

function questionnaireSectionIconClass(status: QuestionnaireSectionDetail["status"]) {
  if (status === "done") {
    return "[color:var(--vf-success)]";
  }
  if (status === "in_progress") {
    return "[color:var(--v19b-color-primary-text)]";
  }
  return "[color:var(--v19b-color-text-40)]";
}

function questionnaireSectionProgressClass(
  status: QuestionnaireSectionDetail["status"],
) {
  if (status === "done") return "bg-[var(--vf-success)]";
  if (status === "in_progress") return "bg-[var(--v19b-color-primary)]";
  return "bg-[var(--v19b-color-tag-selected)]";
}

function historyEventBorderClass(tone: string) {
  if (tone === "warning") {
    return "border-[var(--vf-warning-border)] shadow-[var(--v19b-shadow-primary-soft)]";
  }
  if (tone === "info") return "border-[var(--vf-accent-border)]";
  return "border-[var(--v19b-color-border-soft)]";
}

function primaryButtonToneClass(action: SubmissionAction) {
  if (action === "submit_corrections") {
    return "bg-[var(--vf-warning)] hover:bg-[var(--v19b-admin-orange)]";
  }
  if (action === "submit_for_review") {
    return "bg-[var(--v19b-color-primary)] hover:bg-[var(--v19b-color-primary-hover)]";
  }
  return "bg-[var(--v19b-color-control)] hover:bg-[var(--v19b-color-control-hover)]";
}

const OverviewTab = ({
  data,
  submission,
}: {
  data: SubmissionDetail;
  submission: Submission;
}) => {
  const packageItems = documentPackageItems(submission);
  const readyFilesCount = submission.files.filter(isFileReady).length;

  return (
    <div className="space-y-6" data-v19-drawer-overview>
      <div className="overflow-hidden rounded-xl border border-[var(--v19b-color-border-faint)] bg-[var(--v19b-color-panel)]">
        <div className="grid grid-cols-1 lg:grid-cols-2">
          <section
            aria-labelledby="submission-drawer-route-title"
            className="flex flex-col p-5 lg:pr-6"
          >
            <h3
              className="mb-4 text-[11px] font-medium uppercase tracking-wider [color:var(--v19b-color-text-40)]"
              id="submission-drawer-route-title"
            >
              Маршрут и подача
            </h3>
            <div className="grid flex-1 grid-cols-1 content-center gap-4 text-sm sm:grid-cols-2">
              <div className="flex min-w-0 gap-4">
                <Calendar className="h-5 w-5 shrink-0 [color:var(--v19b-color-text-30)]" />
                <div className="min-w-0">
                  <div className="font-medium [color:var(--v19b-color-text)]">
                    {data.tripDates}
                  </div>
                  <div className="mt-0.5 text-[11px] [color:var(--v19b-color-text-40)]">
                    Даты поездки
                  </div>
                </div>
              </div>
              <div className="flex min-w-0 gap-4">
                <MapPin className="h-5 w-5 shrink-0 [color:var(--v19b-color-text-30)]" />
                <div className="min-w-0">
                  <div className="font-medium [color:var(--v19b-color-text)]">
                    {data.city}
                  </div>
                  <div className="mt-0.5 text-[11px] [color:var(--v19b-color-text-40)]">
                    Визовый центр подачи
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section
            aria-labelledby="submission-drawer-documents-title"
            className="flex flex-col border-t border-[var(--v19b-color-border-faint)] p-5 lg:border-l lg:border-t-0 lg:pl-6"
          >
            <div className="mb-4 flex items-center justify-between">
              <h3
                className="text-[11px] font-medium uppercase tracking-wider [color:var(--v19b-color-text-40)]"
                id="submission-drawer-documents-title"
              >
                Чеклист документов
              </h3>
              <span className="v19-submission-drawer-status is-ready inline-flex min-h-6 items-center rounded-[var(--v19b-radius-pill)] border border-[var(--vf-success-border)] bg-[var(--vf-success-soft)] px-2 text-[11px] font-mono font-medium [color:var(--vf-success)]">
                {readyFilesCount}/{submission.files.length}
              </span>
            </div>
            <div className="flex flex-1 flex-col justify-center space-y-3">
              {packageItems.map((doc) => (
                <div key={doc.label} className="flex items-center gap-3">
                  {doc.status === "done" ? (
                    <CheckCircle2 className="h-4 w-4 [color:var(--vf-success)]" />
                  ) : (
                    <div className="h-4 w-4 rounded-full border border-[var(--v19b-color-border-soft)]" />
                  )}
                  <span
                    className={`text-[13px] ${doc.status === "done" ? "[color:var(--v19b-color-text-70)]" : "[color:var(--v19b-color-text-strong)]"}`}
                  >
                    {doc.label}
                  </span>
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>

      <section
        aria-labelledby="submission-drawer-applicants-title"
        className="space-y-3"
      >
        <div className="flex items-center justify-between px-1">
          <h3
            className="text-[11px] font-medium uppercase tracking-wider [color:var(--v19b-color-text-40)]"
            id="submission-drawer-applicants-title"
          >
            Участники
          </h3>
          <span className="text-[11px] font-medium [color:var(--v19b-color-text-40)]">
            {data.applicantsCount}
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3">
          {data.applicants.map((applicant) => (
            <article
              key={applicant.name}
              className="flex items-center rounded-xl border border-[var(--v19b-color-border-faint)] bg-[var(--v19b-color-panel)] p-4"
            >
              <div className="mr-3 flex h-10 w-10 shrink-0 items-center justify-center rounded-full border border-[var(--v19b-color-border-soft)] bg-gradient-to-br from-[var(--v19b-color-border-selected)] to-[var(--v19b-color-panel-strong)] text-xs font-semibold shadow-inner [color:var(--v19b-color-text-70)]">
                {applicantInitials(applicant.name)}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-[14px] font-medium [color:var(--v19b-color-text-strong)]">
                  {applicant.name}
                </div>
                <div className="mt-0.5 text-[11px] [color:var(--v19b-color-text-50)]">
                  {applicant.role}
                </div>
              </div>
              <div className="text-right">
                <div className="text-[12px] font-mono font-medium [color:var(--vf-success)]">
                  {applicant.completeness}%
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </div>
  );
};

const QuestionnaireTab = ({
  onOpenQuestionnaire,
  submission,
}: {
  onOpenQuestionnaire: (target?: QuestionnaireFocusTarget) => void;
  submission: Submission;
}) => {
  const sections = buildQuestionnaireSections(submission);
  const remainingBlockCount = sections.filter(
    (section) => section.progress < 100,
  ).length;
  const remainingBlockLabel = remainingBlocksLabel(remainingBlockCount);

  function openSection(target: QuestionnaireFocusTarget | undefined) {
    onOpenQuestionnaire(target);
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-[16px] font-semibold [color:var(--v19b-color-text-strong)]">
            Прогресс заполнения
          </h3>
          <p className="text-[12px] [color:var(--v19b-color-text-50)] mt-1">
            {remainingBlockLabel}
          </p>
        </div>
        <button
          onClick={() => onOpenQuestionnaire()}
          className="h-9 px-4 bg-[var(--v19b-color-control)] hover:bg-[var(--v19b-color-control-hover)] [color:var(--v19b-color-text-strong)] text-[13px] font-medium rounded-[var(--v19b-radius-control)] transition-colors flex items-center gap-2"
          type="button"
        >
          <Edit3 className="w-4 h-4" /> Открыть анкету
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {sections.map((section) => (
          <div
            key={section.title}
            className="p-4 bg-[var(--v19b-color-panel)] border border-[var(--v19b-color-border-faint)] rounded-xl flex items-center gap-4 hover:bg-[var(--v19b-color-panel-strong)] transition-colors cursor-pointer"
            role="button"
            tabIndex={0}
            onClick={() => openSection(section.target)}
            onKeyDown={(event) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              openSection(section.target);
            }}
          >
            <div
              className={`flex h-5 w-5 shrink-0 items-center justify-center
              ${questionnaireSectionIconClass(section.status)}`}
            >
              <section.Icon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="truncate text-[length:var(--v19b-size-11)] font-[var(--v19b-weight-control)] [color:var(--v19b-color-text-strong)]">
                  {section.title}
                </span>
                <span className="text-[length:var(--v19b-size-11)] font-[var(--v19b-weight-control)] [color:var(--v19b-color-text-50)]">
                  {section.progress}%
                </span>
              </div>
              <div className="h-[var(--v19b-size-2)] w-full overflow-hidden rounded-full bg-[var(--v19b-color-control)]">
                <div
                  aria-hidden="true"
                  className={`h-full rounded-full ${questionnaireSectionProgressClass(section.status)}`}
                  style={{ width: `${section.progress}%` }}
                />
              </div>
              {section.remaining ? (
                <div className="text-[10px] [color:var(--v19b-color-text-40)] mt-1.5">
                  Осталось: {section.remaining}
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

function issueTargetLabel(issue: Issue) {
  if (issue.target.fileType) {
    return `${issue.target.applicantName} • ${fileLabel(issue.target.fileType)}`;
  }

  return [issue.target.applicantName, issue.target.field ?? issue.target.section]
    .filter(Boolean)
    .join(" • ");
}

function issueBadgeLabel(issue: Issue) {
  if (issue.status === "fixed_by_agent") return "Исправлено";
  if (issue.severity === "blocker") return "Blocker";
  return "Замечание";
}

function issueActionLabel(issue: Issue) {
  if (issue.status === "fixed_by_agent") {
    return issue.target.fileType ? "Открыть файл" : "Открыть анкету";
  }
  return issue.target.fileType ? "Перезагрузить файл" : "Исправить в анкете";
}

const IssuesTab = ({
  data,
  onOpenWorkspaceTarget,
  onUploadApplicantFile,
  submission,
}: {
  data: SubmissionDetail;
  onOpenWorkspaceTarget: (target: WorkspaceTarget) => void;
  onUploadApplicantFile?: DrawerProps["onUploadApplicantFile"];
  submission: Submission;
}) => {
  const [uploadingIssueId, setUploadingIssueId] = useState<string | null>(null);
  const unresolvedIssues = submission.issues.filter(
    (issue) => issue.status !== "closed_by_admin",
  );

  const uploadIssueFile = async (
    issue: Issue,
    event: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file || !issue.target.fileType || !onUploadApplicantFile) return;

    setUploadingIssueId(issue.id);
    try {
      await onUploadApplicantFile(
        submission.id,
        issue.target.applicantId,
        issue.target.fileType,
        file,
      );
    } catch (error) {
      window.alert(
        error instanceof Error ? error.message : "Не удалось загрузить файл.",
      );
    } finally {
      setUploadingIssueId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-[var(--v19b-color-border-faint)] pb-4">
        <div>
          <h3 className="text-[16px] font-semibold [color:var(--v19b-color-text-strong)]">
            Список задач по замечаниям
          </h3>
          <p className="text-[12px] [color:var(--v19b-color-text-50)] mt-1">
            Ошибки, выявленные администратором при проверке
          </p>
        </div>
        <div data-preserve-status-tone="true" className="v19-submission-drawer-status is-review inline-flex min-h-6 items-center rounded-[var(--v19b-radius-pill)] border border-[var(--vf-warning-border)] bg-[var(--vf-warning-soft)] px-3 py-1 text-[12px] font-medium [color:var(--vf-warning)]">
          Замечания: {data.issuesCount}
        </div>
      </div>

      {unresolvedIssues.length > 0 ? (
        <div className="space-y-4">
          {unresolvedIssues.map((issue) => {
            const IssueIcon = issue.target.fileType ? ImageIcon : FileText;
            const issueElementId = targetElementId({
              issueId: issue.id,
              tab: "issues",
            });
            const uploadInputId = `${issueElementId}-upload`;
            const canUploadReplacement =
              Boolean(issue.target.fileType) &&
              issue.status !== "fixed_by_agent" &&
              Boolean(onUploadApplicantFile);

            return (
              <div
                id={issueElementId}
                key={issue.id}
                className="p-4 bg-[var(--v19b-color-panel-strong)] border border-[var(--vf-warning-border)] rounded-xl relative overflow-hidden flex flex-col sm:flex-row gap-4"
              >
                <div className="absolute top-0 left-0 w-1 h-full bg-[var(--vf-warning)]" />
                <div className="w-10 h-10 rounded-full bg-[var(--vf-warning-soft)] flex items-center justify-center shrink-0 border border-[var(--vf-warning-border)]">
                  <IssueIcon className="w-5 h-5 [color:var(--vf-warning)]" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-[14px] font-semibold [color:var(--v19b-color-text-strong)]">
                      {issue.reason}
                    </h4>
                    <span data-preserve-status-tone="true" className="v19-submission-drawer-status is-returned inline-flex min-h-6 items-center rounded-[var(--v19b-radius-pill)] border border-[var(--vf-danger-border)] bg-[var(--vf-danger-soft)] px-2 py-0.5 text-[10px] font-medium [color:var(--vf-danger)]">
                      {issueBadgeLabel(issue)}
                    </span>
                  </div>
                  <div className="text-[11px] font-medium [color:var(--vf-warning)] uppercase tracking-wider mb-2">
                    {issueTargetLabel(issue)}
                  </div>
                  <p className="text-[13px] [color:var(--v19b-color-text-60)] leading-relaxed max-w-xl">
                    {issue.comment || issue.reason}
                  </p>
                </div>
                <div className="sm:w-[180px] shrink-0 flex items-center">
                  <button
                    disabled={uploadingIssueId === issue.id}
                    onClick={() => {
                      if (canUploadReplacement) {
                        document.getElementById(uploadInputId)?.click();
                        return;
                      }
                      onOpenWorkspaceTarget(targetForIssue(issue));
                    }}
                    className="w-full h-10 bg-[var(--v19b-color-control)] hover:bg-[var(--v19b-color-control-hover)] border border-[var(--v19b-color-border-soft)] rounded-[var(--v19b-radius-control)] text-[13px] font-medium [color:var(--v19b-color-text-strong)] transition-colors"
                    type="button"
                  >
                    {issueActionLabel(issue)}
                  </button>
                  {canUploadReplacement ? (
                    <input
                      accept={
                        issue.target.fileType === "passport_scan"
                          ? "image/jpeg,image/png,image/webp,application/pdf"
                          : "image/jpeg,image/png,image/webp"
                      }
                      aria-hidden="true"
                      aria-label={`Выбрать файл: ${issueTargetLabel(issue)}`}
                      hidden
                      id={uploadInputId}
                      tabIndex={-1}
                      type="file"
                      onChange={(event) => void uploadIssueFile(issue, event)}
                    />
                  ) : null}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <div className="w-16 h-16 bg-[var(--vf-success-soft)] rounded-full flex items-center justify-center mb-4 border border-[var(--vf-success-border)]">
            <CheckCircle2 className="w-8 h-8 [color:var(--vf-success)]" />
          </div>
          <h4 className="text-[16px] font-semibold [color:var(--v19b-color-text-strong)] mb-2">
            Ошибок не найдено
          </h4>
          <p className="text-[13px] [color:var(--v19b-color-text-50)] max-w-sm">
            Все данные проверены администратором. Замечаний к анкете и документам нет.
          </p>
        </div>
      )}
    </div>
  );
};

function historySourceLabel(source: Submission["history"][number]["source"]) {
  if (source === "agent") return "Вы";
  if (source === "admin") return "Администратор";
  if (source === "bb") return "BB";
  return "Система";
}

function historyEventTone(text: string) {
  const normalized = text.toLocaleLowerCase("ru-RU");
  if (normalized.includes("возвращ")) return "warning";
  if (normalized.includes("отправ")) return "info";
  return "neutral";
}

function historyEventIcon(tone: string) {
  if (tone === "warning") {
    return <AlertCircle className="w-4 h-4 [color:var(--vf-warning)]" />;
  }
  if (tone === "info") {
    return <UploadCloud className="w-4 h-4 [color:var(--v19b-color-primary-text)]" />;
  }
  return <FileText className="w-4 h-4 [color:var(--v19b-color-text-40)]" />;
}

const HistoryTab = ({ submission }: { submission: Submission }) => (
  <div className="relative pl-6 space-y-8 before:absolute before:inset-y-2 before:left-[31px] before:w-px before:bg-[var(--v19b-color-border-soft)]">
    {submission.history.map((event) => {
      const tone = historyEventTone(event.text);

      return (
        <div key={event.id} className="relative flex gap-5">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 bg-[var(--v19b-color-app)] z-10
          ${historyEventBorderClass(tone)}`}
          >
            {historyEventIcon(tone)}
          </div>
          <div className="pt-1.5">
            <div className="text-[14px] font-medium [color:var(--v19b-color-text)]">
              {event.text}
            </div>
            <div className="flex items-center gap-2 mt-1.5 text-[12px] [color:var(--v19b-color-text-40)]">
              <span>{historyTimestampForUser(event.createdAt ?? event.at)}</span>
              <span className="w-1 h-1 rounded-full bg-[var(--v19b-color-text-25)]" />
              <span>{historySourceLabel(event.source)}</span>
            </div>
          </div>
        </div>
      );
    })}
  </div>
);

const drawerTabs: Array<{
  getCount?: (data: SubmissionDetail) => number;
  id: TabId;
  isWarning?: boolean;
  label: string;
}> = [
  { id: "overview", label: "Обзор" },
  { id: "questionnaire", label: "Анкета" },
  {
    getCount: (data) => data.issuesCount,
    id: "issues",
    isWarning: true,
    label: "Замечания",
  },
  { id: "history", label: "История" },
];

const drawerFocusableSelector = [
  "button:not([disabled])",
  "[href]",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

function footerActionLabel(action: SubmissionAction, fallback: string) {
  if (action === "submit_for_review") return "Отправить на проверку";
  if (action === "submit_corrections") return "Отправить исправления";
  if (action === "save_progress") return "Сохранить черновик";
  return fallback;
}

export function Drawer({
  activeTab: requestedTab = "overview",
  focusTarget,
  isOpen,
  submission,
  onAction,
  onClearFocusTarget,
  onClose,
  onOpenQuestionnaire,
  onOpenWorkspaceTarget,
  onUploadApplicantFile,
}: DrawerProps) {
  const [activeTab, setActiveTab] = useState<TabId>(() => drawerTab(requestedTab));
  const [actionError, setActionError] = useState("");
  const [actionPending, setActionPending] = useState(false);
  const actionRequestIdRef = useRef(0);
  const actionPendingRef = useRef(false);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const isDesktop = useDrawerDesktopQuery();
  const prefersReducedMotion = useReducedMotion();
  const shouldReduceMotion = Boolean(prefersReducedMotion);
  const panelInitial = drawerPanelInitial(isDesktop, shouldReduceMotion);
  const panelExit = drawerPanelExit(isDesktop, shouldReduceMotion);
  const panelTransition = drawerPanelTransition(shouldReduceMotion);
  const tabInitial = drawerTabInitial(shouldReduceMotion);
  const tabExit = drawerTabExit(shouldReduceMotion);
  const data = buildSubmissionDetail(submission);
  const primaryAction = getPrimaryAction(submission, "agent", "agent");
  const primaryLabel = footerActionLabel(primaryAction.action, primaryAction.label);
  const footerActionNotice =
    actionError || (primaryAction.disabled ? primaryAction.reason : "");
  const primaryButtonClassName = primaryButtonToneClass(primaryAction.action);

  useEffect(() => {
    actionRequestIdRef.current += 1;
    actionPendingRef.current = false;
    setActionError("");
    setActionPending(false);
    if (isOpen) setActiveTab(drawerTab(requestedTab));

    return () => {
      actionRequestIdRef.current += 1;
      actionPendingRef.current = false;
    };
  }, [isOpen, requestedTab, submission.id]);

  useEffect(() => {
    if (!isOpen || focusTarget?.tab !== "issues") return;

    setActiveTab("issues");
    const timer = window.setTimeout(() => {
      document.getElementById(targetElementId(focusTarget))?.scrollIntoView({
        behavior: shouldReduceMotion ? "auto" : "smooth",
        block: "center",
      });
      onClearFocusTarget?.();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [focusTarget, isOpen, onClearFocusTarget, shouldReduceMotion]);

  useEffect(() => {
    if (!isOpen) return;

    previouslyFocusedElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    window.requestAnimationFrame(() =>
      dialogRef.current?.focus({ preventScroll: true }),
    );

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocusedElementRef.current?.isConnected) {
        previouslyFocusedElementRef.current.focus({ preventScroll: true });
      }
    };
  }, [isOpen, onClose, submission.id]);

  function handleDialogKeyDown(event: React.KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Tab") return;

    const focusableElements = Array.from(
      dialogRef.current?.querySelectorAll<HTMLElement>(drawerFocusableSelector) ?? [],
    ).filter((element) => element.offsetParent !== null);
    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    if (!firstElement || !lastElement) {
      event.preventDefault();
      dialogRef.current?.focus({ preventScroll: true });
      return;
    }

    if (event.shiftKey && document.activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus({ preventScroll: true });
      return;
    }
    if (!event.shiftKey && document.activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus({ preventScroll: true });
    }
  }

  function handleTabKeyDown(event: React.KeyboardEvent<HTMLButtonElement>, tab: TabId) {
    const currentIndex = drawerTabs.findIndex((item) => item.id === tab);
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % drawerTabs.length;
    else if (event.key === "ArrowLeft") {
      nextIndex = (currentIndex - 1 + drawerTabs.length) % drawerTabs.length;
    } else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = drawerTabs.length - 1;
    else return;

    const nextTab = drawerTabs[nextIndex]?.id;
    if (!nextTab) return;
    event.preventDefault();
    setActiveTab(nextTab);
    window.requestAnimationFrame(() => {
      document.getElementById(`submission-drawer-tab-${nextTab}`)?.focus();
    });
  }

  async function handlePrimaryAction() {
    if (primaryAction.disabled || actionPendingRef.current) return;
    if (primaryAction.action === "open_history") {
      setActiveTab("history");
      return;
    }

    const requestId = ++actionRequestIdRef.current;
    setActionPending(true);
    actionPendingRef.current = true;
    setActionError("");
    try {
      await onAction(primaryAction.action);
    } catch {
      if (requestId !== actionRequestIdRef.current) return;
      setActionError(
        "Не удалось сохранить действие. Состояние подачи не изменено. Повторите попытку.",
      );
    } finally {
      if (requestId === actionRequestIdRef.current) {
        actionPendingRef.current = false;
        setActionPending(false);
      }
    }
  }

  return (
    <AnimatePresence>
      {isOpen ? (
        <>
          <motion.div
            aria-hidden="true"
            animate={{ opacity: 1 }}
            className="fixed inset-0 bg-[var(--v19-dialog-backdrop)] backdrop-blur-sm z-40"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            transition={
              shouldReduceMotion ? drawerMotion.reduced : drawerMotion.overlay
            }
            onClick={onClose}
          />

          <motion.div
            aria-labelledby="submission-drawer-heading"
            aria-modal="true"
            animate={{ opacity: 1, x: 0, y: 0 }}
            className="fixed z-50 flex flex-col bg-[var(--v19b-color-app)] border-[var(--v19b-color-border-soft)] shadow-[var(--v19-dialog-shadow)] [font-family:var(--v19-font-family)]
              lg:inset-y-2 lg:right-2 lg:left-auto lg:w-[840px] lg:rounded-2xl lg:border lg:overflow-hidden
              inset-x-0 bottom-0 top-12 rounded-t-[28px] border-t border-x overflow-x-hidden overflow-y-auto"
            exit={panelExit}
            initial={panelInitial}
            data-v19-submission-drawer="true"
            ref={dialogRef}
            role="dialog"
            tabIndex={-1}
            transition={panelTransition}
            onKeyDown={handleDialogKeyDown}
          >
            <style>{neutralStatusStyles}</style>
            <div className="lg:hidden sticky top-0 z-30 w-full flex items-center justify-center py-3 bg-[var(--v19b-color-deep-drawer-90)] backdrop-blur-md">
              <div className="w-12 h-1.5 rounded-full bg-[var(--v19b-color-text-25)]" />
            </div>

            <header className="px-4 lg:px-6 pt-2 pb-0 bg-[var(--v19b-color-deep-drawer-95)] backdrop-blur-md relative lg:sticky lg:top-0 z-20 shrink-0 border-b border-[var(--v19b-color-border-faint)]">
              <h2 id="submission-drawer-heading" className="sr-only">
                {data.title}
              </h2>
              <button
                aria-label="Закрыть подачу"
                className="hidden lg:flex absolute top-2 right-6 w-9 h-9 items-center justify-center bg-[var(--v19b-color-control)] hover:bg-[var(--v19b-color-control-hover)] [color:var(--v19b-color-text-70)] hover:[color:var(--v19b-color-text-strong)] rounded-[var(--v19b-radius-control)] transition-colors border border-[var(--v19b-color-border-faint)] hover:border-[var(--v19b-color-border-soft)]"
                type="button"
                onClick={onClose}
              >
                <X className="w-5 h-5" />
              </button>

              <div
                className="v19-drawer-lifecycle-context lg:pr-12"
                data-testid="drawer-lifecycle-context"
              >
                <div className="v19-drawer-lifecycle-identity">
                  <span>{data.id}</span>
                  <strong>{data.title}</strong>
                </div>
                <span className="sr-only">
                  Статус подачи: {statusLabelFor(data.status, "full")}
                </span>
              </div>

              <div className="w-full overflow-x-auto scrollbar-hide -mx-4 px-4 lg:mx-0 lg:px-0 lg:pr-12">
                <div
                  className="flex items-center gap-1.5 w-max mb-[-1px]"
                  role="tablist"
                  aria-label="Разделы подачи"
                >
                  {drawerTabs.map((tab) => {
                    const count = tab.getCount ? tab.getCount(data) : 0;
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        aria-controls={`submission-drawer-panel-${tab.id}`}
                        aria-selected={isActive}
                        className={`relative min-h-9 px-3 text-[12px] font-medium transition-colors flex items-center gap-1.5 focus-visible:outline-none whitespace-nowrap
                          ${isActive ? "[color:var(--v19b-color-text-strong)]" : "[color:var(--v19b-color-text-50)] hover:[color:var(--v19b-color-text-80)]"}
                        `}
                        id={`submission-drawer-tab-${tab.id}`}
                        key={tab.id}
                        role="tab"
                        tabIndex={isActive ? 0 : -1}
                        type="button"
                        onClick={() => setActiveTab(tab.id)}
                        onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
                      >
                        <span>{tab.label}</span>
                        {count > 0 ? (
                          <span
                            data-preserve-status-tone={
                              tab.isWarning ? "true" : undefined
                            }
                            className={`v19-submission-drawer-status inline-flex min-h-6 items-center rounded-[var(--v19b-radius-pill)] border px-2 py-0.5 text-[10px] leading-none ml-1 ${tab.isWarning ? "is-review border-[var(--vf-warning-border)] bg-[var(--vf-warning-soft)] [color:var(--vf-warning)]" : "border-[var(--v19b-color-border-strong)] bg-[var(--v19b-color-control)] [color:var(--v19b-color-text-70)]"}`}
                          >
                            {count}
                          </span>
                        ) : null}
                        {isActive ? (
                          <motion.div
                            className="absolute bottom-0 inset-x-0 h-0.5 bg-[var(--v19b-color-primary)]"
                            initial={false}
                            layoutId="drawerAgentActiveTab"
                            transition={
                              shouldReduceMotion
                                ? drawerMotion.reduced
                                : drawerMotion.tabIndicator
                            }
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </header>

            <div className="lg:flex-1 lg:overflow-y-auto p-5 lg:p-8 scrollbar-thin scrollbar-thumb-white/10">
              <AnimatePresence mode="wait">
                <motion.div
                  aria-labelledby={`submission-drawer-tab-${activeTab}`}
                  animate={{ opacity: 1, y: 0 }}
                  exit={tabExit}
                  id={`submission-drawer-panel-${activeTab}`}
                  initial={tabInitial}
                  key={activeTab}
                  role="tabpanel"
                  tabIndex={0}
                  transition={
                    shouldReduceMotion ? drawerMotion.reduced : drawerMotion.tab
                  }
                >
                  {activeTab === "overview" ? (
                    <OverviewTab data={data} submission={submission} />
                  ) : null}
                  {activeTab === "questionnaire" ? (
                    <QuestionnaireTab
                      onOpenQuestionnaire={onOpenQuestionnaire}
                      submission={submission}
                    />
                  ) : null}
                  {activeTab === "issues" ? (
                    <IssuesTab
                      data={data}
                      onOpenWorkspaceTarget={onOpenWorkspaceTarget}
                      onUploadApplicantFile={onUploadApplicantFile}
                      submission={submission}
                    />
                  ) : null}
                  {activeTab === "history" ? (
                    <HistoryTab submission={submission} />
                  ) : null}
                </motion.div>
              </AnimatePresence>
            </div>

            <footer className="p-4 lg:px-8 lg:py-5 border-t border-[var(--v19b-color-border-soft)] bg-[var(--v19b-color-deep-drawer-95)] backdrop-blur-md shrink-0 flex flex-col sm:flex-row items-center justify-end gap-4 pb-[max(16px,env(safe-area-inset-bottom))] lg:sticky lg:bottom-0 z-20">
              {footerActionNotice ? (
                <span
                  className="v19-drawer-action-notice"
                  role={actionError ? "alert" : undefined}
                >
                  {footerActionNotice}
                </span>
              ) : null}
              <div className="flex gap-3 w-full sm:w-auto">
                <button
                  aria-label="Отменить и закрыть подачу"
                  className="flex-1 sm:flex-none h-11 px-5 bg-transparent hover:bg-[var(--v19b-color-control)] [color:var(--v19b-color-text-70)] hover:[color:var(--v19b-color-text-strong)] font-medium text-[14px] rounded-[var(--v19b-radius-control)] transition-colors"
                  type="button"
                  onClick={onClose}
                >
                  Отмена
                </button>
                <button
                  aria-busy={actionPending}
                  className={`flex-1 sm:flex-none h-11 px-8 ${primaryButtonClassName} [color:var(--v19b-color-text-strong)] font-medium text-[14px] rounded-[var(--v19b-radius-control)] shadow-none transition-colors flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50`}
                  disabled={primaryAction.disabled || actionPending}
                  type="button"
                  onClick={() => void handlePrimaryAction()}
                >
                  {primaryAction.action === "submit_corrections" ? (
                    <UploadCloud className="w-4 h-4" />
                  ) : null}
                  {primaryAction.action === "submit_for_review" ? (
                    <CheckCircle2 className="w-4 h-4" />
                  ) : null}
                  {primaryLabel}
                </button>
              </div>
            </footer>
          </motion.div>
        </>
      ) : null}
    </AnimatePresence>
  );
}
