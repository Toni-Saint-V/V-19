import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import { useDrawerDesktopQuery } from "../shared/ui/drawer/drawerMotion";
import { linearDrawerMotion } from "../shared/ui/drawer/linearDrawerMotion";
import {
  AlertCircle,
  Briefcase,
  Calendar,
  CheckCircle2,
  Clock,
  CreditCard,
  Edit3,
  Eye,
  FileDigit,
  FileText,
  History,
  Image as ImageIcon,
  MapPin,
  Plane,
  ShieldAlert,
  UploadCloud,
  User,
  X,
} from "lucide-react";

import { historyTimestampForUser } from "../modules/submissions/historyPresentation";
import { ConfirmationDialog } from "../modules/submissions/components/Primitives";
import {
  agentInteractionProps,
  type AgentInteractionId,
} from "../modules/submissions/agentInteractionContract";
import { submissionPublicId } from "../modules/submissions/submissionIdentity";
import {
  agentQuestionnaireStatusPresentation,
  getPrimaryAction,
  statusLabelFor,
} from "../modules/submissions/status";
import { requiredPassportReviewMediaSlots } from "../modules/submissions/passportReviewContract";
import { buildSubmissionNextStepBrief } from "../modules/submissions/submissionNextStepEngine";
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
  openIssuesCount: number;
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
    openIssuesCount: submission.issues.filter((issue) => issue.status === "open")
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
  return requiredPassportReviewMediaSlots(submission).map((slot) => {
    const applicant = submission.applicants.find(
      (candidate) => candidate.id === slot.applicantId,
    );
    const file = submission.files.find(
      (candidate) =>
        candidate.applicantId === slot.applicantId && candidate.type === slot.type,
    );

    return {
      label:
        submission.applicants.length > 1
          ? `${applicant?.fullName ?? "Заявитель"} • ${fileLabel(slot.type)}`
          : fileLabel(slot.type),
      status: file && isFileReady(file) ? "done" : "pending",
    };
  });
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
    return "bg-emerald-500/10 border-emerald-500/20 text-emerald-400";
  }
  if (status === "in_progress") {
    return "bg-[#3a45b4]/10 border-[#3a45b4]/20 text-[#8fa3ff]";
  }
  return "bg-white/5 border-white/10 text-white/40";
}

function questionnaireSectionProgressClass(
  status: QuestionnaireSectionDetail["status"],
) {
  if (status === "done") return "bg-emerald-500";
  if (status === "in_progress") return "bg-[#3a45b4]";
  return "bg-white/10";
}

function historyEventBorderClass(tone: string) {
  if (tone === "warning") {
    return "border-orange-500/40 shadow-[0_0_15px_rgba(249,115,22,0.2)]";
  }
  if (tone === "info") return "border-[#3a45b4]/50";
  return "border-white/10";
}

function primaryButtonToneClass(action: SubmissionAction) {
  if (action === "submit_corrections") {
    return "bg-orange-500 hover:bg-orange-600 shadow-[0_0_20px_rgba(249,115,22,0.2)]";
  }
  if (action === "submit_for_review" || action === "open_history") {
    return "bg-[#3a45b4] hover:bg-[#4855d4] shadow-[0_0_20px_rgba(58,69,180,0.3)]";
  }
  return "bg-white/10 hover:bg-white/15";
}

type StatusBadgePresentation = {
  Icon: LucideIcon;
  toneClassName: string;
};

const statusBadgePresentation = {
  draft: {
    Icon: FileText,
    toneClassName: "bg-white/5 border-white/10 text-white/70",
  },
  in_progress: {
    Icon: Clock,
    toneClassName: "bg-blue-500/10 border-blue-500/20 text-blue-400",
  },
  requires_action: {
    Icon: AlertCircle,
    toneClassName: "bg-orange-500/10 border-orange-500/20 text-orange-400",
  },
  submitted_for_review: {
    Icon: ShieldAlert,
    toneClassName: "bg-[#3a45b4]/20 border-[#3a45b4]/30 text-[#8fa3ff]",
  },
  returned: {
    Icon: AlertCircle,
    toneClassName: "bg-orange-500/10 border-orange-500/20 text-orange-400",
  },
  corrections_received: {
    Icon: ShieldAlert,
    toneClassName: "bg-[#3a45b4]/20 border-[#3a45b4]/30 text-[#8fa3ff]",
  },
  ready_for_export: {
    Icon: CheckCircle2,
    toneClassName: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
  },
  exported: {
    Icon: CheckCircle2,
    toneClassName: "bg-emerald-500/10 border-emerald-500/20 text-emerald-400",
  },
} satisfies Record<SubmissionStatus, StatusBadgePresentation>;

const statusBadgeBaseClassName =
  "inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[11px] font-medium uppercase tracking-wide";

const StatusBadge = ({ status }: { status: SubmissionStatus }) => {
  const displayStatus = status === "requires_action" ? "returned" : status;
  const presentation = statusBadgePresentation[displayStatus];
  const StatusIcon = presentation.Icon;

  return (
    <span
      className={[statusBadgeBaseClassName, presentation.toneClassName].join(" ")}
      data-testid="drawer-status-badge"
    >
      <StatusIcon className="w-3.5 h-3.5" /> {statusLabelFor(displayStatus, "full")}
    </span>
  );
};

const OverviewTab = ({
  data,
  submission,
}: {
  data: SubmissionDetail;
  submission: Submission;
}) => {
  const packageItems = documentPackageItems(submission);
  const readyFilesCount = packageItems.filter((item) => item.status === "done").length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <section
          aria-labelledby="submission-drawer-route-title"
          className="v19-submission-drawer-card bg-white/[0.02] border border-white/5 rounded-xl p-5 hover:border-white/10 transition-colors"
        >
          <h3
            className="text-[11px] font-medium text-white/40 uppercase tracking-wider mb-5"
            id="submission-drawer-route-title"
          >
            Маршрут и подача
          </h3>
          <div className="space-y-4 text-sm">
            <div className="flex gap-4">
              <Calendar className="w-5 h-5 text-white/30 shrink-0" />
              <div>
                <div className="text-white/90 font-medium">{data.tripDates}</div>
                <div className="text-white/40 text-[11px] mt-0.5">Даты поездки</div>
              </div>
            </div>
            <div className="flex gap-4">
              <MapPin className="w-5 h-5 text-white/30 shrink-0" />
              <div>
                <div className="text-white/90 font-medium">{data.city}</div>
                <div className="text-white/40 text-[11px] mt-0.5">
                  Визовый центр подачи
                </div>
              </div>
            </div>
          </div>
        </section>

        <section
          aria-labelledby="submission-drawer-documents-title"
          className="v19-submission-drawer-card bg-white/[0.02] border border-white/5 rounded-xl p-5 hover:border-white/10 transition-colors flex flex-col"
        >
          <div className="flex items-center justify-between mb-4">
            <h3
              className="text-[11px] font-medium text-white/40 uppercase tracking-wider"
              id="submission-drawer-documents-title"
            >
              Чеклист документов
            </h3>
            <span className="text-[11px] font-mono text-emerald-400 font-medium bg-emerald-500/10 px-2 py-0.5 rounded-md">
              {readyFilesCount}/{packageItems.length}
            </span>
          </div>
          <div className="space-y-3 flex-1 flex flex-col justify-center">
            {packageItems.map((doc) => (
              <div key={doc.label} className="flex items-center gap-3">
                {doc.status === "done" ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : (
                  <div className="w-4 h-4 rounded-full border border-white/20" />
                )}
                <span
                  className={`text-[13px] ${doc.status === "done" ? "text-white/70" : "text-white"}`}
                >
                  {doc.label}
                </span>
              </div>
            ))}
          </div>
        </section>
      </div>

      <section
        aria-labelledby="submission-drawer-applicants-title"
        className="space-y-3"
      >
        <h3
          className="text-[11px] font-medium text-white/40 uppercase tracking-wider pl-1"
          id="submission-drawer-applicants-title"
        >
          Участники ({data.applicantsCount})
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {data.applicants.map((applicant) => (
            <article
              key={applicant.name}
              className="v19-submission-drawer-card flex items-center p-3 bg-white/[0.02] border border-white/5 hover:border-white/10 rounded-xl transition-all group"
            >
              <div className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-[#2a2a30] to-[#1a1a20] border border-white/10 flex items-center justify-center text-xs font-semibold text-white/70 shadow-inner mr-3">
                {applicantInitials(applicant.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] text-white font-medium truncate group-hover:text-[#8fa3ff] transition-colors">
                  {applicant.name}
                </div>
                <div className="text-[11px] text-white/50 mt-0.5">{applicant.role}</div>
              </div>
              <div className="text-right">
                <div className="text-[12px] font-mono font-medium text-emerald-400">
                  {applicant.completeness}%
                </div>
                <div className="text-[10px] text-white/40 mt-0.5">
                  готовность анкеты
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
  const questionnairePresentation = agentQuestionnaireStatusPresentation(
    submission.status,
  );
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
          <h3 className="text-[16px] font-semibold text-white">Прогресс заполнения</h3>
          <p className="text-[12px] text-white/50 mt-1">
            {questionnairePresentation.drawerDescription}
          </p>
          <p className="text-[11px] text-white/40 mt-1">{remainingBlockLabel}</p>
        </div>
        <button
          {...agentInteractionProps("drawer.open-questionnaire")}
          onClick={() => onOpenQuestionnaire()}
          className="h-9 px-4 bg-white/10 hover:bg-white/15 text-white text-[13px] font-medium rounded-lg transition-colors flex items-center gap-2"
          type="button"
        >
          {questionnairePresentation.canEdit ? (
            <Edit3 className="w-4 h-4" />
          ) : (
            <Eye className="w-4 h-4" />
          )}
          {questionnairePresentation.drawerActionLabel}
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {sections.map((section) => (
          <div
            {...agentInteractionProps("drawer.open-questionnaire")}
            key={section.title}
            className="p-4 bg-white/[0.02] border border-white/5 rounded-xl flex items-center gap-4 hover:bg-white/[0.04] transition-colors cursor-pointer"
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
              className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border
              ${questionnaireSectionIconClass(section.status)}`}
            >
              <section.Icon className="w-5 h-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[13px] font-medium text-white truncate">
                  {section.title}
                </span>
                <span className="text-[11px] font-mono text-white/50">
                  {section.progress}%
                </span>
              </div>
              <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                <div
                  aria-hidden="true"
                  className={`h-full rounded-full ${questionnaireSectionProgressClass(section.status)}`}
                  style={{ width: `${section.progress}%` }}
                />
              </div>
              {section.remaining ? (
                <div className="text-[10px] text-white/40 mt-1.5">
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
  canEdit,
  data,
  onOpenWorkspaceTarget,
  onUploadApplicantFile,
  submission,
}: {
  canEdit: boolean;
  data: SubmissionDetail;
  onOpenWorkspaceTarget: (target: WorkspaceTarget) => void;
  onUploadApplicantFile?: DrawerProps["onUploadApplicantFile"];
  submission: Submission;
}) => {
  const [uploadingIssueId, setUploadingIssueId] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState("");
  const uploadingIssueIdsRef = useRef(new Set<string>());
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
    if (uploadingIssueIdsRef.current.size > 0) return;

    uploadingIssueIdsRef.current.add(issue.id);
    setUploadError("");
    setUploadingIssueId(issue.id);
    try {
      await onUploadApplicantFile(
        submission.id,
        issue.target.applicantId,
        issue.target.fileType,
        file,
      );
    } catch (error) {
      setUploadError(
        error instanceof Error ? error.message : "Не удалось загрузить файл.",
      );
    } finally {
      uploadingIssueIdsRef.current.delete(issue.id);
      setUploadingIssueId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between border-b border-white/5 pb-4">
        <div>
          <h3 className="text-[16px] font-semibold text-white">
            Список задач по замечаниям
          </h3>
          <p className="text-[12px] text-white/50 mt-1">
            Ошибки, выявленные администратором при проверке
          </p>
        </div>
        <div
          className="px-3 py-1 bg-orange-500/10 text-orange-400 rounded-lg text-[12px] font-medium border border-orange-500/20"
          data-testid="drawer-open-issues-count"
        >
          Требуют исправления: {data.openIssuesCount}
        </div>
      </div>

      {uploadError ? (
        <p className="text-[12px] text-orange-400" role="alert">
          {uploadError} Состояние файла не изменено. Повторите попытку.
        </p>
      ) : null}

      {unresolvedIssues.length > 0 ? (
        <div className="space-y-4">
          {unresolvedIssues.map((issue) => {
            const IssueIcon = issue.target.fileType ? ImageIcon : FileText;
            const issueElementId = targetElementId({
              issueId: issue.id,
              tab: "issues",
            });
            const uploadInputId = `${issueElementId}-upload`;
            const uploadStatusId = `${issueElementId}-upload-status`;
            const canUploadReplacement =
              canEdit &&
              Boolean(issue.target.fileType) &&
              issue.status !== "fixed_by_agent" &&
              Boolean(onUploadApplicantFile);
            const isUploadingThisIssue = uploadingIssueId === issue.id;

            return (
              <div
                id={issueElementId}
                key={issue.id}
                className="p-4 bg-[#1a1a1d] border border-orange-500/20 rounded-xl relative overflow-hidden flex flex-col sm:flex-row gap-4"
              >
                <div className="absolute top-0 left-0 w-1 h-full bg-orange-500" />
                <div className="w-10 h-10 rounded-full bg-orange-500/10 flex items-center justify-center shrink-0 border border-orange-500/20">
                  <IssueIcon className="w-5 h-5 text-orange-400" />
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-[14px] font-semibold text-white">
                      {issue.reason}
                    </h4>
                    <span className="px-1.5 py-0.5 rounded text-[10px] bg-red-500/20 text-red-400 font-medium">
                      {issueBadgeLabel(issue)}
                    </span>
                  </div>
                  <div className="text-[11px] font-medium text-orange-400/80 uppercase tracking-wider mb-2">
                    {issueTargetLabel(issue)}
                  </div>
                  <p className="text-[13px] text-white/60 leading-relaxed max-w-xl">
                    {issue.comment || issue.reason}
                  </p>
                </div>
                <div className="sm:w-[180px] shrink-0 flex items-center">
                  <button
                    {...agentInteractionProps(
                      canUploadReplacement
                        ? "drawer.upload-file"
                        : "drawer.open-target",
                    )}
                    aria-busy={isUploadingThisIssue}
                    aria-describedby={isUploadingThisIssue ? uploadStatusId : undefined}
                    disabled={Boolean(uploadingIssueId)}
                    onClick={() => {
                      if (canUploadReplacement) {
                        document.getElementById(uploadInputId)?.click();
                        return;
                      }
                      onOpenWorkspaceTarget(targetForIssue(issue));
                    }}
                    className="w-full h-10 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[13px] font-medium text-white transition-colors"
                    type="button"
                  >
                    {isUploadingThisIssue
                      ? "Загрузка…"
                      : canUploadReplacement
                        ? issueActionLabel(issue)
                        : issue.target.fileType
                          ? "Открыть файл"
                          : "Открыть анкету"}
                  </button>
                  <span
                    aria-live="polite"
                    className="sr-only"
                    id={uploadStatusId}
                    role="status"
                  >
                    {isUploadingThisIssue ? "Файл загружается." : ""}
                  </span>
                  {canUploadReplacement ? (
                    <input
                      {...agentInteractionProps("drawer.upload-file")}
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
          <div className="w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mb-4 border border-emerald-500/20">
            <CheckCircle2 className="w-8 h-8 text-emerald-400" />
          </div>
          <h4 className="text-[16px] font-semibold text-white mb-2">
            Ошибок не найдено
          </h4>
          <p className="text-[13px] text-white/50 max-w-sm">
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
    return <AlertCircle className="w-4 h-4 text-orange-400" />;
  }
  if (tone === "info") {
    return <UploadCloud className="w-4 h-4 text-[#8fa3ff]" />;
  }
  return <FileText className="w-4 h-4 text-white/40" />;
}

const HistoryTab = ({ submission }: { submission: Submission }) =>
  submission.history.length === 0 ? (
    <div className="v19-agent-drawer-empty" role="status">
      <History className="w-7 h-7" />
      <h3>История пока пуста</h3>
      <p>События появятся после первого сохранения или изменения статуса.</p>
    </div>
  ) : (
    <div className="relative pl-6 space-y-8 before:absolute before:inset-y-2 before:left-[31px] before:w-px before:bg-white/10">
      {submission.history.map((event) => {
        const tone = historyEventTone(event.text);

        return (
          <div className="relative flex gap-5" key={event.id}>
            <div
              className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 bg-[#111113] z-10
          ${historyEventBorderClass(tone)}`}
            >
              {historyEventIcon(tone)}
            </div>
            <div className="pt-1.5">
              <div className="text-[14px] font-medium text-white/90">{event.text}</div>
              <div className="flex items-center gap-2 mt-1.5 text-[12px] text-white/40">
                <span>{historyTimestampForUser(event.createdAt ?? event.at)}</span>
                <span className="w-1 h-1 rounded-full bg-white/20" />
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

function footerActionLabel(
  action: SubmissionAction,
  fallback: string,
  status: SubmissionStatus,
) {
  if (action === "submit_for_review") return "Отправить на проверку";
  if (action === "submit_corrections") return "Отправить исправления";
  if (status === "draft" && action === "save_progress") return "Начать работу";
  if (action === "open_history") return "Открыть историю";
  return fallback;
}

function ownerLabel(status: SubmissionStatus, owner: "agent" | "admin" | "system") {
  if (status === "exported") return "Нет";
  if (owner === "agent") return "Агент";
  if (owner === "admin") return "Администратор";
  return "Система";
}

const primaryActionInteractionByStatus = {
  corrections_received: "drawer.open-history",
  draft: "drawer.save-progress",
  exported: "drawer.open-history",
  in_progress: "drawer.submit-review",
  ready_for_export: "drawer.open-history",
  requires_action: "drawer.submit-corrections",
  returned: "drawer.submit-corrections",
  submitted_for_review: "drawer.open-history",
} satisfies Record<SubmissionStatus, AgentInteractionId>;

const footerInstructions = {
  draft: "Сохраните текущий прогресс, чтобы продолжить позже.",
  in_progress: "Проверьте все данные перед отправкой администратору.",
  requires_action: "Дождитесь синхронизации статуса перед повторной отправкой.",
  submitted_for_review: "Подача отправлена администратору и доступна для просмотра.",
  returned: "Исправьте замечания перед повторной отправкой.",
  corrections_received: "Исправления отправлены администратору и ожидают проверки.",
  ready_for_export: "Подача принята и готова к выгрузке.",
  exported: "Подача выгружена; история статусов доступна для просмотра.",
} satisfies Record<SubmissionStatus, string>;

const footerInstructionId = "submission-drawer-primary-action-notice";

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
  const [actionAnnouncement, setActionAnnouncement] = useState("");
  const [actionPending, setActionPending] = useState(false);
  const [missingTargetMessage, setMissingTargetMessage] = useState("");
  const [reviewConfirmationOpen, setReviewConfirmationOpen] = useState(false);
  const actionRequestIdRef = useRef(0);
  const actionPendingRef = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const reviewConfirmationTriggerRef = useRef<HTMLButtonElement>(null);
  const tabScrollPositionsRef = useRef(new Map<TabId, number>());
  const isDesktop = useDrawerDesktopQuery();
  const prefersReducedMotion = useReducedMotion();
  const shouldReduceMotion = Boolean(prefersReducedMotion);
  const panelInitial = shouldReduceMotion
    ? { opacity: 1, x: 0, y: 0 }
    : {
        opacity: 0.5,
        x: isDesktop ? "100%" : 0,
        y: isDesktop ? 0 : "100%",
      };
  const panelExit = shouldReduceMotion
    ? { opacity: 0, x: 0, y: 0 }
    : {
        opacity: 0,
        x: isDesktop ? "100%" : 0,
        y: isDesktop ? 0 : "100%",
      };
  const panelTransition = shouldReduceMotion
    ? linearDrawerMotion.reduced
    : linearDrawerMotion.panel;
  const tabInitial = shouldReduceMotion ? { opacity: 0, y: 0 } : { opacity: 0, y: 10 };
  const tabExit = shouldReduceMotion ? { opacity: 0, y: 0 } : { opacity: 0, y: -10 };
  const data = buildSubmissionDetail(submission);
  const primaryAction = getPrimaryAction(submission, "agent", "agent");
  const nextStepBrief = buildSubmissionNextStepBrief({
    role: "agent",
    submission,
    surface: "agent",
  });
  const nextStepTarget = nextStepBrief.primaryAction.target;
  const nextStepLabel =
    submission.status === "exported"
      ? "Подача завершена; доступна только история"
      : nextStepBrief.primaryAction.id === "open_first_queue_item" &&
          nextStepTarget?.tab === "questionnaire" &&
          nextStepTarget.section
        ? `Заполнить раздел «${nextStepTarget.section}»`
        : nextStepBrief.primaryAction.label;
  const questionnairePresentation = agentQuestionnaireStatusPresentation(
    submission.status,
  );
  const primaryLabel = footerActionLabel(
    primaryAction.action,
    primaryAction.label,
    submission.status,
  );
  const blockerReason =
    primaryAction.reason ??
    nextStepBrief.primaryAction.reason ??
    nextStepBrief.blockers[0];
  const footerActionNotice =
    actionError || (primaryAction.disabled ? primaryAction.reason : "");
  const footerInstruction = footerActionNotice || footerInstructions[data.status];
  let footerInstructionToneClassName = "text-white/40";
  if (footerActionNotice) {
    footerInstructionToneClassName = "text-white/70";
  }
  if (actionError) {
    footerInstructionToneClassName = "text-orange-400";
  }
  let footerInstructionRole: "alert" | "status" | undefined;
  if (footerActionNotice) {
    footerInstructionRole = "status";
  }
  if (actionError) {
    footerInstructionRole = "alert";
  }
  const footerInstructionClassName = [
    "text-[12px]",
    footerActionNotice ? "block" : "hidden sm:block",
    footerInstructionToneClassName,
  ].join(" ");
  const primaryButtonClassName = primaryButtonToneClass(primaryAction.action);

  useEffect(() => {
    actionRequestIdRef.current += 1;
    actionPendingRef.current = false;
    setActionError("");
    setActionAnnouncement("");
    setActionPending(false);
    setMissingTargetMessage("");
    setReviewConfirmationOpen(false);
    if (isOpen) setActiveTab(drawerTab(requestedTab));

    return () => {
      actionRequestIdRef.current += 1;
      actionPendingRef.current = false;
    };
  }, [isOpen, requestedTab, submission.id]);

  useEffect(() => {
    if (!isOpen) return;

    const frame = window.requestAnimationFrame(() => {
      if (bodyRef.current) {
        bodyRef.current.scrollTop = tabScrollPositionsRef.current.get(activeTab) ?? 0;
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [activeTab, isOpen]);

  useEffect(() => {
    if (!isOpen || focusTarget?.tab !== "issues") return;

    setActiveTab("issues");
    const timer = window.setTimeout(() => {
      const target = document.getElementById(targetElementId(focusTarget));
      if (target) {
        target.scrollIntoView({
          behavior: shouldReduceMotion ? "auto" : "smooth",
          block: "center",
        });
        setMissingTargetMessage("");
      } else {
        setMissingTargetMessage(
          "Точный объект замечания не найден. Откройте список замечаний и выберите доступную задачу.",
        );
      }
      onClearFocusTarget?.();
    }, 0);

    return () => window.clearTimeout(timer);
  }, [focusTarget, isOpen, onClearFocusTarget, shouldReduceMotion]);

  function selectTab(nextTab: TabId) {
    if (bodyRef.current) {
      tabScrollPositionsRef.current.set(activeTab, bodyRef.current.scrollTop);
    }
    setActiveTab(nextTab);
  }

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
    selectTab(nextTab);
    window.requestAnimationFrame(() => {
      document.getElementById(`submission-drawer-tab-${nextTab}`)?.focus();
    });
  }

  async function runAction(action: SubmissionAction, successMessage: string) {
    if (actionPendingRef.current) return false;
    const requestId = ++actionRequestIdRef.current;
    setActionPending(true);
    actionPendingRef.current = true;
    setActionError("");
    setActionAnnouncement("");
    try {
      await onAction(action);
      if (requestId !== actionRequestIdRef.current) return false;
      setActionAnnouncement(successMessage);
      return true;
    } catch {
      if (requestId !== actionRequestIdRef.current) return false;
      setActionError(
        "Не удалось сохранить действие. Состояние подачи не изменено. Повторите попытку.",
      );
      return false;
    } finally {
      if (requestId === actionRequestIdRef.current) {
        actionPendingRef.current = false;
        setActionPending(false);
      }
    }
  }

  async function handlePrimaryAction() {
    if (primaryAction.disabled || actionPendingRef.current) return;
    if (primaryAction.action === "open_history") {
      selectTab("history");
      return;
    }

    await runAction(
      primaryAction.action,
      "Действие выполнено. Статус подачи обновлён.",
    );
  }

  async function handleReturnToReview() {
    const succeeded = await runAction(
      "submit_for_review",
      "Подача возвращена на проверку администратору.",
    );
    if (succeeded) {
      closeReviewConfirmation();
    }
  }

  function closeReviewConfirmation() {
    setReviewConfirmationOpen(false);
    window.requestAnimationFrame(() => {
      const focusTarget = reviewConfirmationTriggerRef.current ?? dialogRef.current;
      focusTarget?.focus({ preventScroll: true });
    });
  }

  return (
    <AnimatePresence>
      {isOpen ? (
        <>
          <motion.div
            {...agentInteractionProps("drawer.close")}
            aria-hidden="true"
            animate={{ opacity: 1 }}
            className="v19-submission-drawer-backdrop fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            transition={
              shouldReduceMotion
                ? linearDrawerMotion.reduced
                : linearDrawerMotion.overlay
            }
            onClick={onClose}
          />

          <motion.div
            aria-labelledby="submission-drawer-heading"
            aria-hidden={reviewConfirmationOpen || undefined}
            aria-modal="true"
            animate={{ opacity: 1, x: 0, y: 0 }}
            className="v19-submission-drawer v19-agent-drawer fixed z-50 flex flex-col bg-[#111113] border-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.6)]
              lg:inset-y-2 lg:right-2 lg:left-auto lg:w-[840px] lg:rounded-2xl lg:border lg:overflow-hidden
              inset-x-0 bottom-0 top-12 rounded-t-[28px] border-t border-x overflow-y-auto"
            exit={panelExit}
            initial={panelInitial}
            data-v19-linear-drawer="true"
            inert={reviewConfirmationOpen}
            ref={dialogRef}
            role="dialog"
            tabIndex={-1}
            transition={panelTransition}
            onKeyDown={handleDialogKeyDown}
          >
            <div className="lg:hidden sticky top-0 z-30 w-full flex items-center justify-center py-3 bg-[#111113]/90 backdrop-blur-md">
              <div className="w-12 h-1.5 rounded-full bg-white/20" />
            </div>

            <header className="v19-submission-drawer-header px-5 lg:px-8 pt-4 pb-0 bg-[#111113]/95 backdrop-blur-md relative lg:sticky lg:top-0 z-20 shrink-0 border-b border-white/5">
              <div
                className="flex items-start justify-between gap-4 mb-6"
                data-testid="drawer-lifecycle-context"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[11px] lg:text-xs text-white/50 mb-2">
                    <span className="font-mono font-medium tracking-wider text-white/70">
                      {data.id}
                    </span>
                    <span className="w-1 h-1 rounded-full bg-white/20" />
                    <span className="uppercase tracking-wider">
                      {data.type === "family" ? "Семейная" : "Индивидуальная"}
                    </span>
                  </div>
                  <h2
                    className="text-[24px] font-semibold text-white leading-tight tracking-tight mb-4"
                    id="submission-drawer-heading"
                  >
                    {data.title}
                  </h2>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <StatusBadge status={data.status} />
                    <span
                      className="text-[12px] text-white/40 flex items-center gap-1.5"
                      data-testid="drawer-updated-at"
                    >
                      <Clock className="w-3 h-3" /> Обновлено {data.updated}
                    </span>
                  </div>
                  <dl
                    aria-label="Следующий шаг по подаче"
                    className="v19-agent-drawer-context"
                    data-testid="drawer-next-step-context"
                  >
                    <div>
                      <dt>Следующий owner</dt>
                      <dd data-testid="drawer-next-owner">
                        {ownerLabel(submission.status, nextStepBrief.owner)}
                      </dd>
                    </div>
                    <div>
                      <dt>Следующий шаг</dt>
                      <dd data-testid="drawer-next-step">{nextStepLabel}</dd>
                    </div>
                    <div className={blockerReason ? "is-blocked" : "is-clear"}>
                      <dt>Готовность</dt>
                      <dd data-testid="drawer-blocker-reason">
                        {blockerReason ?? "Канонических блокеров нет"}
                      </dd>
                    </div>
                  </dl>
                </div>

                <button
                  {...agentInteractionProps("drawer.close")}
                  aria-label="Закрыть"
                  className="hidden lg:flex w-10 h-10 items-center justify-center bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-xl transition-colors border border-white/5 hover:border-white/10"
                  type="button"
                  onClick={onClose}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="v19-submission-drawer-tabs-scroll w-full overflow-x-auto scrollbar-hide -mx-5 px-5 lg:mx-0 lg:px-0">
                <div
                  className="v19-submission-drawer-tabs flex items-center gap-1.5 w-max mb-[-1px]"
                  role="tablist"
                  aria-label="Разделы подачи"
                >
                  {drawerTabs.map((tab) => {
                    const count = tab.getCount ? tab.getCount(data) : 0;
                    const isActive = activeTab === tab.id;
                    return (
                      <button
                        {...agentInteractionProps("drawer.navigate-tab")}
                        aria-controls={`submission-drawer-panel-${tab.id}`}
                        aria-selected={isActive}
                        className={`v19-submission-drawer-tab relative min-h-[44px] px-4 text-[13px] font-medium transition-colors flex items-center gap-2 focus-visible:outline-none whitespace-nowrap
                          ${isActive ? "text-white" : "text-white/50 hover:text-white/80"}
                        `}
                        id={`submission-drawer-tab-${tab.id}`}
                        key={tab.id}
                        role="tab"
                        tabIndex={isActive ? 0 : -1}
                        type="button"
                        onClick={() => selectTab(tab.id)}
                        onKeyDown={(event) => handleTabKeyDown(event, tab.id)}
                      >
                        <span>{tab.label}</span>
                        {count > 0 ? (
                          <span
                            className={`v19-submission-drawer-tab-count px-1.5 py-0.5 rounded-md text-[10px] leading-none ml-1 ${tab.isWarning ? "bg-orange-500/20 text-orange-400" : "bg-white/10 text-white/70"}`}
                          >
                            {count}
                          </span>
                        ) : null}
                        {isActive ? (
                          <motion.div
                            className="v19-submission-drawer-tab-indicator absolute bottom-0 inset-x-0 h-0.5 bg-white"
                            initial={false}
                            layoutId="drawerAgentActiveTab"
                            transition={
                              shouldReduceMotion
                                ? linearDrawerMotion.reduced
                                : linearDrawerMotion.tabIndicator
                            }
                          />
                        ) : null}
                      </button>
                    );
                  })}
                </div>
              </div>
            </header>

            <div
              className="v19-submission-drawer-body p-5 lg:p-8 scrollbar-thin scrollbar-thumb-white/10"
              ref={bodyRef}
            >
              {missingTargetMessage ? (
                <div className="v19-agent-drawer-target-notice" role="status">
                  <span>{missingTargetMessage}</span>
                  <button
                    aria-label="Скрыть сообщение"
                    type="button"
                    onClick={() => setMissingTargetMessage("")}
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ) : null}
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
                    shouldReduceMotion
                      ? linearDrawerMotion.reduced
                      : linearDrawerMotion.tab
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
                      canEdit={questionnairePresentation.canEdit}
                      data={data}
                      key={submission.id}
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

            <footer className="v19-submission-drawer-footer p-4 lg:px-8 lg:py-5 border-t border-white/10 bg-[#111113]/95 backdrop-blur-md shrink-0 flex flex-col sm:flex-row items-center justify-between gap-4 pb-[max(16px,env(safe-area-inset-bottom))] lg:sticky lg:bottom-0 z-20">
              <span aria-live="polite" className="sr-only" role="status">
                {actionAnnouncement}
              </span>
              <div
                className={footerInstructionClassName}
                data-testid="drawer-footer-instruction"
                id={footerInstructionId}
                role={footerInstructionRole}
              >
                {footerInstruction}
              </div>
              <div className="flex gap-3 w-full sm:w-auto">
                <button
                  {...agentInteractionProps("drawer.close")}
                  aria-label="Закрыть подачу"
                  className="flex-1 sm:flex-none h-11 px-5 bg-transparent hover:bg-white/5 text-white/70 hover:text-white font-medium text-[14px] rounded-xl transition-colors"
                  type="button"
                  onClick={onClose}
                >
                  Закрыть
                </button>
                {submission.status === "ready_for_export" ? (
                  <button
                    className="v19-agent-drawer-return-review flex-1 sm:flex-none h-11 px-5 text-[13px] font-medium rounded-xl transition-colors"
                    disabled={actionPending}
                    ref={reviewConfirmationTriggerRef}
                    type="button"
                    onClick={() => {
                      setActionError("");
                      setReviewConfirmationOpen(true);
                    }}
                  >
                    Вернуть на проверку
                  </button>
                ) : null}
                <button
                  {...agentInteractionProps(
                    primaryActionInteractionByStatus[submission.status],
                  )}
                  aria-busy={actionPending}
                  aria-describedby={
                    footerActionNotice ? footerInstructionId : undefined
                  }
                  className={`v19-submission-drawer-primary flex-1 sm:flex-none h-11 px-8 ${primaryButtonClassName} text-white font-medium text-[14px] rounded-xl transition-colors flex items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50`}
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
          {reviewConfirmationOpen ? (
            <ConfirmationDialog
              busy={actionPending}
              cancelLabel="Оставить готовой к выгрузке"
              confirmDanger={false}
              confirmInteractionId="drawer.submit-review"
              confirmLabel="Вернуть на проверку"
              description="Подача снова перейдёт в очередь администратора, а готовность к выгрузке будет сброшена канонической командой."
              error={actionError || undefined}
              kicker="Повторная проверка"
              title="Вернуть подачу на проверку?"
              onCancel={() => {
                if (!actionPending) {
                  setActionError("");
                  closeReviewConfirmation();
                }
              }}
              onConfirm={() => void handleReturnToReview()}
            />
          ) : null}
        </>
      ) : null}
    </AnimatePresence>
  );
}
