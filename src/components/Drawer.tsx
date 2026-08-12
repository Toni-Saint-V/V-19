import React, { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import type { LucideIcon } from "lucide-react";
import { useDrawerDesktopQuery } from "../shared/ui/drawer/drawerMotion";
import { linearDrawerMotion } from "../shared/ui/drawer/linearDrawerMotion";
import { useExperienceReducedMotion } from "../shared/ui/experiencePreferences";
import {
  AlertCircle,
  ArrowRight,
  Briefcase,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock,
  CreditCard,
  Edit3,
  Eye,
  FileDigit,
  FileText,
  History,
  Image as ImageIcon,
  LoaderCircle,
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
  canAgentEditSubmission,
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
  completedSections: number;
  id: string;
  name: string;
  role: string;
  sectionsCount: number;
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
  completedApplicants: number;
  progress: number | null;
  remaining?: string;
  targetApplicantName?: string;
  status: "done" | "in_progress" | "pending";
  target?: QuestionnaireFocusTarget;
  title: string;
  totalApplicants: number;
};

type DrawerActionIntent =
  | {
      action: SubmissionAction;
      kind: "submission";
      label: string;
      reason?: string;
    }
  | {
      kind: "navigate";
      label: string;
      target: WorkspaceTarget;
    }
  | {
      applicantId: string;
      fileType: SubmissionFileType;
      kind: "upload";
      label: string;
    }
  | {
      kind: "history";
      label: string;
    }
  | {
      kind: "wait";
      label: string;
      reason: string;
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

function buildSubmissionDetail(submission: Submission): SubmissionDetail {
  return {
    applicants: submission.applicants.map((applicant) => ({
      completedSections: applicant.sections.filter(
        (section) => section.status === "complete",
      ).length,
      id: applicant.id,
      name: applicant.fullName,
      role: applicantRoleLabel(applicant.role ?? "main"),
      sectionsCount: applicant.sections.length,
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
      applicantId: slot.applicantId,
      fileType: slot.type,
      label:
        submission.applicants.length > 1
          ? `${applicant?.fullName ?? "Заявитель"} • ${fileLabel(slot.type)}`
          : fileLabel(slot.type),
      status: file && isFileReady(file) ? "done" : "pending",
    };
  });
}

function questionnaireSectionCandidateStats(
  candidate: Submission["applicants"][number]["sections"][number],
  fieldIds: readonly string[] | undefined,
) {
  const fields = fieldIds
    ? candidate.fields.filter((field) => fieldIds.includes(field.id))
    : candidate.fields;
  const requiredFields = fields.filter((field) => field.required);
  const filledFields = requiredFields.filter(
    (field) => field.value.trim().length > 0 && !field.error,
  );

  if (candidate.status === "complete") {
    return {
      exactProgress: 100,
      filledRequired: requiredFields.length,
      required: requiredFields.length,
    };
  }
  if (candidate.status === "empty") {
    return {
      exactProgress: 0,
      filledRequired: 0,
      required: requiredFields.length,
    };
  }
  if (requiredFields.length === 0) {
    return {
      exactProgress: null,
      filledRequired: 0,
      required: 0,
    };
  }

  return {
    exactProgress: Math.round((filledFields.length / requiredFields.length) * 100),
    filledRequired: filledFields.length,
    required: requiredFields.length,
  };
}

function questionnaireProgressStatus(
  progress: number | null,
  hasStarted: boolean,
): QuestionnaireSectionDetail["status"] {
  if (progress !== null && progress >= 100) return "done";
  if (hasStarted || (progress !== null && progress > 0)) return "in_progress";
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
    const candidateStats = relevantSections.map((candidate) => ({
      ...candidate,
      stats: questionnaireSectionCandidateStats(candidate.section, blueprint.fieldIds),
    }));
    const progressIsExact = candidateStats.every(
      (candidate) => candidate.stats.exactProgress !== null,
    );
    const totalRequired = candidateStats.reduce(
      (sum, candidate) => sum + candidate.stats.required,
      0,
    );
    const totalFilledRequired = candidateStats.reduce(
      (sum, candidate) => sum + candidate.stats.filledRequired,
      0,
    );
    const progress = allApplicantsComplete
      ? 100
      : progressIsExact && totalRequired > 0
        ? Math.round((totalFilledRequired / totalRequired) * 100)
        : progressIsExact && candidateStats.length > 0
          ? Math.round(
              candidateStats.reduce(
                (sum, candidate) => sum + (candidate.stats.exactProgress ?? 0),
                0,
              ) / candidateStats.length,
            )
          : null;
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
    const completedApplicants = submission.applicants.filter((applicant) => {
      const sections = relevantSections.filter(
        (candidate) => candidate.applicant.id === applicant.id,
      );
      return (
        sections.length > 0 &&
        sections.every((candidate) => candidate.section.status === "complete")
      );
    }).length;
    const hasStarted = relevantSections.some(
      ({ section }) => section.status !== "empty",
    );

    return {
      Icon: blueprint.Icon,
      completedApplicants,
      progress,
      remaining:
        remainingFieldCount > 0 ? remainingFieldsLabel(remainingFieldCount) : undefined,
      status: questionnaireProgressStatus(progress, hasStarted),
      target: targetCandidate
        ? {
            applicantId: targetCandidate.applicant.id,
            section: targetCandidate.section.title,
          }
        : undefined,
      targetApplicantName:
        targetCandidate?.section.status === "complete"
          ? undefined
          : targetCandidate?.applicant.fullName,
      title: blueprint.title,
      totalApplicants: submission.applicants.length,
    };
  });
}

function acceptedFileTypes(fileType: SubmissionFileType) {
  return fileType === "passport_scan"
    ? "image/jpeg,image/png,image/webp,application/pdf"
    : "image/jpeg,image/png,image/webp";
}

function uploadTargetKey(applicantId: string, fileType: SubmissionFileType) {
  return `${applicantId}:${fileType}`;
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

function primaryIntentToneClass(intent: DrawerActionIntent) {
  if (intent.kind === "submission" && intent.action === "submit_corrections") {
    return "is-warning";
  }
  if (intent.kind === "wait") return "is-waiting";
  return "is-primary";
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
  canEdit,
  data,
  onOpenQuestionnaire,
  onSelectUploadTarget,
  submission,
  uploadingTargetKey,
}: {
  canEdit: boolean;
  data: SubmissionDetail;
  onOpenQuestionnaire: (target?: QuestionnaireFocusTarget) => void;
  onSelectUploadTarget: (applicantId: string, fileType: SubmissionFileType) => void;
  submission: Submission;
  uploadingTargetKey: string | null;
}) => {
  const packageItems = documentPackageItems(submission);
  const readyFilesCount = packageItems.filter((item) => item.status === "done").length;

  return (
    <div className="space-y-6">
      <div className="v19-agent-drawer-overview-grid grid grid-cols-1 lg:grid-cols-2 gap-4">
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
          <div className="v19-agent-drawer-document-list">
            {packageItems.map((doc) => {
              const targetKey = uploadTargetKey(doc.applicantId, doc.fileType);
              const isUploading = uploadingTargetKey === targetKey;
              const content = (
                <>
                  {doc.status === "done" ? (
                    <CheckCircle2 aria-hidden="true" className="w-4 h-4" />
                  ) : isUploading ? (
                    <LoaderCircle aria-hidden="true" className="w-4 h-4 animate-spin" />
                  ) : (
                    <UploadCloud aria-hidden="true" className="w-4 h-4" />
                  )}
                  <span>{doc.label}</span>
                  {doc.status === "pending" && canEdit ? (
                    <span className="v19-agent-drawer-document-action">
                      {isUploading ? "Загрузка…" : "Загрузить"}
                    </span>
                  ) : null}
                </>
              );

              return doc.status === "pending" && canEdit ? (
                <button
                  {...agentInteractionProps("drawer.upload-file")}
                  aria-busy={isUploading}
                  className="v19-agent-drawer-document-row is-actionable"
                  disabled={Boolean(uploadingTargetKey)}
                  key={targetKey}
                  type="button"
                  onClick={() => onSelectUploadTarget(doc.applicantId, doc.fileType)}
                >
                  {content}
                </button>
              ) : (
                <div
                  className="v19-agent-drawer-document-row is-complete"
                  key={targetKey}
                >
                  {content}
                </div>
              );
            })}
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
            <button
              {...agentInteractionProps("drawer.open-questionnaire")}
              aria-label={`Открыть анкету: ${applicant.name}`}
              key={applicant.id}
              className="v19-submission-drawer-card v19-agent-drawer-applicant"
              type="button"
              onClick={() => onOpenQuestionnaire({ applicantId: applicant.id })}
            >
              <div className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-[#2a2a30] to-[#1a1a20] border border-white/10 flex items-center justify-center text-xs font-semibold text-white/70 shadow-inner mr-3">
                {applicantInitials(applicant.name)}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[14px] text-white font-medium truncate">
                  {applicant.name}
                </div>
                <div className="text-[11px] text-white/50 mt-0.5">{applicant.role}</div>
              </div>
              <div className="text-right">
                <div className="text-[12px] font-mono font-medium text-emerald-400">
                  {applicant.completedSections}/{applicant.sectionsCount}
                </div>
                <div className="text-[11px] text-white/50 mt-0.5">разделов готово</div>
              </div>
              <ArrowRight aria-hidden="true" className="w-4 h-4 ml-3" />
            </button>
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
    (section) => section.status !== "done",
  ).length;
  const remainingBlockLabel = remainingBlocksLabel(remainingBlockCount);

  function openSection(target: QuestionnaireFocusTarget | undefined) {
    onOpenQuestionnaire(target);
  }

  return (
    <div className="space-y-6">
      <div className="v19-agent-drawer-section-heading">
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
          className="linear-product-action linear-product-action--secondary v19-agent-drawer-section-primary"
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
          <button
            {...agentInteractionProps("drawer.open-questionnaire")}
            aria-label={`${section.title}: ${
              section.targetApplicantName
                ? `следующий заявитель ${section.targetApplicantName}`
                : section.status === "done"
                  ? "готово"
                  : "открыть раздел"
            }`}
            key={section.title}
            className="v19-agent-drawer-questionnaire-card"
            type="button"
            onClick={() => openSection(section.target)}
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
                  {section.progress !== null
                    ? `${section.progress}%`
                    : section.status === "in_progress"
                      ? "В процессе"
                      : "Не начато"}
                </span>
              </div>
              {section.progress !== null ? (
                <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
                  <div
                    aria-hidden="true"
                    className={`h-full rounded-full ${questionnaireSectionProgressClass(section.status)}`}
                    style={{ width: `${section.progress}%` }}
                  />
                </div>
              ) : null}
              <div className="v19-agent-drawer-questionnaire-meta">
                <span>
                  {section.completedApplicants}/{section.totalApplicants} заявителей
                </span>
                {section.targetApplicantName ? (
                  <span>{section.targetApplicantName}</span>
                ) : null}
                {section.remaining ? <span>Осталось: {section.remaining}</span> : null}
              </div>
            </div>
            <ArrowRight aria-hidden="true" className="w-4 h-4 shrink-0" />
          </button>
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
  if (issue.severity === "blocker") return "Блокирующее";
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
  const [uploadFeedback, setUploadFeedback] = useState<{
    issueId: string;
    message: string;
    tone: "error" | "success";
  } | null>(null);
  const uploadingIssueIdsRef = useRef(new Set<string>());
  const openIssues = submission.issues.filter((issue) => issue.status === "open");
  const fixedIssues = submission.issues.filter(
    (issue) => issue.status === "fixed_by_agent",
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
    setUploadFeedback(null);
    setUploadingIssueId(issue.id);
    try {
      await onUploadApplicantFile(
        submission.id,
        issue.target.applicantId,
        issue.target.fileType,
        file,
      );
      setUploadFeedback({
        issueId: issue.id,
        message: "Файл загружен. Исправление ожидает проверки администратора.",
        tone: "success",
      });
    } catch (error) {
      setUploadFeedback({
        issueId: issue.id,
        message: `${
          error instanceof Error ? error.message : "Не удалось загрузить файл."
        } Состояние файла не изменено. Повторите попытку.`,
        tone: "error",
      });
    } finally {
      uploadingIssueIdsRef.current.delete(issue.id);
      setUploadingIssueId(null);
    }
  };

  const renderIssue = (issue: Issue) => {
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
      issue.status === "open" &&
      Boolean(onUploadApplicantFile);
    const isUploadingThisIssue = uploadingIssueId === issue.id;
    const feedback = uploadFeedback?.issueId === issue.id ? uploadFeedback : null;

    return (
      <article
        aria-labelledby={`${issueElementId}-title`}
        className={`v19-agent-drawer-issue ${
          issue.status === "fixed_by_agent" ? "is-fixed" : "is-open"
        }`}
        id={issueElementId}
        key={issue.id}
        tabIndex={-1}
      >
        <div className="v19-agent-drawer-issue-icon">
          <IssueIcon aria-hidden="true" className="w-5 h-5" />
        </div>
        <div className="v19-agent-drawer-issue-copy">
          <div className="v19-agent-drawer-issue-title-row">
            <h4 id={`${issueElementId}-title`}>{issue.reason}</h4>
            <span>{issueBadgeLabel(issue)}</span>
          </div>
          <div className="v19-agent-drawer-issue-target">{issueTargetLabel(issue)}</div>
          <p>{issue.comment || issue.reason}</p>
          {feedback ? (
            <p
              className={`v19-agent-drawer-inline-feedback is-${feedback.tone}`}
              role={feedback.tone === "error" ? "alert" : "status"}
            >
              {feedback.message}
            </p>
          ) : null}
        </div>
        <div className="v19-agent-drawer-issue-action">
          <button
            {...agentInteractionProps(
              canUploadReplacement ? "drawer.upload-file" : "drawer.open-target",
            )}
            aria-busy={isUploadingThisIssue}
            aria-describedby={isUploadingThisIssue ? uploadStatusId : undefined}
            disabled={Boolean(uploadingIssueId)}
            type="button"
            onClick={() => {
              if (canUploadReplacement) {
                document.getElementById(uploadInputId)?.click();
                return;
              }
              onOpenWorkspaceTarget(targetForIssue(issue));
            }}
          >
            {isUploadingThisIssue ? (
              <>
                <LoaderCircle aria-hidden="true" className="w-4 h-4 animate-spin" />
                Загрузка…
              </>
            ) : canUploadReplacement ? (
              issueActionLabel(issue)
            ) : issue.target.fileType ? (
              "Открыть файл"
            ) : (
              issueActionLabel(issue)
            )}
          </button>
          <span
            aria-live="polite"
            className="sr-only"
            id={uploadStatusId}
            role="status"
          >
            {isUploadingThisIssue ? "Файл загружается." : ""}
          </span>
          {canUploadReplacement && issue.target.fileType ? (
            <input
              {...agentInteractionProps("drawer.upload-file")}
              accept={acceptedFileTypes(issue.target.fileType)}
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
      </article>
    );
  };

  return (
    <div className="v19-agent-drawer-issues">
      <div className="v19-agent-drawer-section-heading">
        <div>
          <h3 className="text-[16px] font-semibold text-white">
            Замечания администратора
          </h3>
          <p className="text-[12px] text-white/50 mt-1">
            Исправляйте открытые задачи по одной — готовые останутся в истории проверки.
          </p>
        </div>
        <div
          className="v19-agent-drawer-issue-count"
          data-testid="drawer-open-issues-count"
        >
          Открыто: {data.openIssuesCount}
        </div>
      </div>

      {openIssues.length > 0 ? (
        <section aria-labelledby="drawer-open-issues-title">
          <div className="v19-agent-drawer-issue-group-heading">
            <h4 id="drawer-open-issues-title">Нужно исправить</h4>
            <span>{openIssues.length}</span>
          </div>
          <div className="v19-agent-drawer-issue-list">
            {openIssues.map(renderIssue)}
          </div>
        </section>
      ) : (
        <div className="v19-agent-drawer-empty is-compact" role="status">
          <CheckCircle2 className="w-7 h-7" />
          <h4>Открытых замечаний нет</h4>
          <p>Все доступные исправления уже выполнены.</p>
        </div>
      )}

      {fixedIssues.length > 0 ? (
        <section aria-labelledby="drawer-fixed-issues-title">
          <div className="v19-agent-drawer-issue-group-heading is-fixed">
            <h4 id="drawer-fixed-issues-title">Исправлено, ждёт проверки</h4>
            <span>{fixedIssues.length}</span>
          </div>
          <div className="v19-agent-drawer-issue-list">
            {fixedIssues.map(renderIssue)}
          </div>
        </section>
      ) : null}
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
    getCount: (data) => data.openIssuesCount,
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
  if (status === "exported") return "Завершено";
  if (owner === "agent") return "Агент";
  if (owner === "admin") return "Администратор";
  return "Система";
}

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

function interactionForIntent(intent: DrawerActionIntent): AgentInteractionId {
  if (intent.kind === "history") return "drawer.open-history";
  if (intent.kind === "navigate") {
    return intent.target.tab === "questionnaire"
      ? "drawer.open-questionnaire"
      : "drawer.open-target";
  }
  if (intent.kind === "upload") return "drawer.upload-file";
  if (intent.kind === "submission") {
    if (intent.action === "save_progress") return "drawer.save-progress";
    if (intent.action === "submit_corrections") {
      return "drawer.submit-corrections";
    }
    return "drawer.submit-review";
  }
  return "drawer.open-target";
}

function pendingLabelForIntent(intent: DrawerActionIntent) {
  if (intent.kind === "upload") return "Загрузка…";
  if (intent.kind === "submission" && intent.action === "save_progress") {
    return "Начинаем…";
  }
  if (intent.kind === "submission") return "Отправляем…";
  return "Выполняем…";
}

function PrimaryIntentIcon({
  intent,
  pending,
}: {
  intent: DrawerActionIntent;
  pending: boolean;
}) {
  if (pending) {
    return <LoaderCircle aria-hidden="true" className="w-4 h-4 animate-spin" />;
  }
  if (
    intent.kind === "upload" ||
    (intent.kind === "submission" && intent.action === "submit_corrections")
  ) {
    return <UploadCloud aria-hidden="true" className="w-4 h-4" />;
  }
  if (intent.kind === "submission" && intent.action === "submit_for_review") {
    return <CheckCircle2 aria-hidden="true" className="w-4 h-4" />;
  }
  return <ArrowRight aria-hidden="true" className="w-4 h-4" />;
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
  const [actionAnnouncement, setActionAnnouncement] = useState("");
  const [actionPending, setActionPending] = useState(false);
  const [contextExpanded, setContextExpanded] = useState(false);
  const [missingTargetMessage, setMissingTargetMessage] = useState("");
  const [reviewConfirmationOpen, setReviewConfirmationOpen] = useState(false);
  const [selectedUploadTarget, setSelectedUploadTarget] = useState<{
    applicantId: string;
    fileType: SubmissionFileType;
    label: string;
  } | null>(null);
  const actionRequestIdRef = useRef(0);
  const actionPendingRef = useRef(false);
  const bodyRef = useRef<HTMLDivElement>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const primaryUploadInputRef = useRef<HTMLInputElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const reviewConfirmationTriggerRef = useRef<HTMLButtonElement>(null);
  const reviewConfirmationOpenRef = useRef(false);
  const scrollSubmissionIdRef = useRef(submission.id);
  const tabScrollPositionsRef = useRef(new Map<TabId, number>());
  const isDesktop = useDrawerDesktopQuery();
  const shouldReduceMotion = useExperienceReducedMotion();
  reviewConfirmationOpenRef.current = reviewConfirmationOpen;
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
  const packageItems = documentPackageItems(submission);
  const firstMissingMedia = packageItems.find((item) => item.status === "pending");
  const canEditSubmission = canAgentEditSubmission(submission);
  let primaryIntent: DrawerActionIntent;
  if (submission.status === "draft") {
    primaryIntent = {
      action: primaryAction.action,
      kind: "submission",
      label: footerActionLabel(
        primaryAction.action,
        primaryAction.label,
        submission.status,
      ),
      reason: primaryAction.reason,
    };
  } else if (!canEditSubmission) {
    primaryIntent = {
      kind: "history",
      label: "Открыть историю",
    };
  } else if (nextStepBrief.primaryAction.kind === "wait") {
    primaryIntent = {
      kind: "wait",
      label: nextStepBrief.primaryAction.label,
      reason:
        nextStepBrief.primaryAction.reason ?? "Дождитесь завершения текущей операции.",
    };
  } else if (nextStepTarget?.tab === "files") {
    const uploadTargetLabel =
      packageItems.find(
        (item) =>
          item.applicantId === nextStepTarget.applicantId &&
          item.fileType === nextStepTarget.fileType,
      )?.label ?? fileLabel(nextStepTarget.fileType);
    primaryIntent = {
      applicantId: nextStepTarget.applicantId,
      fileType: nextStepTarget.fileType,
      kind: "upload",
      label: `Загрузить: ${uploadTargetLabel}`,
    };
  } else if (nextStepTarget) {
    primaryIntent = {
      kind: "navigate",
      label: nextStepLabel,
      target: nextStepTarget,
    };
  } else if (primaryAction.disabled && firstMissingMedia) {
    primaryIntent = {
      applicantId: firstMissingMedia.applicantId,
      fileType: firstMissingMedia.fileType,
      kind: "upload",
      label: `Загрузить: ${firstMissingMedia.label}`,
    };
  } else if (!primaryAction.disabled && primaryAction.action !== "open_history") {
    primaryIntent = {
      action: primaryAction.action,
      kind: "submission",
      label: footerActionLabel(
        primaryAction.action,
        primaryAction.label,
        submission.status,
      ),
      reason: primaryAction.reason,
    };
  } else if (primaryAction.action === "open_history") {
    primaryIntent = {
      kind: "history",
      label: "Открыть историю",
    };
  } else {
    primaryIntent = {
      kind: "wait",
      label: "Проверьте готовность подачи",
      reason:
        primaryAction.reason ??
        nextStepBrief.primaryAction.reason ??
        nextStepBrief.blockers[0] ??
        "Для продолжения требуется проверить данные подачи.",
    };
  }
  const blockerReason =
    nextStepBrief.primaryAction.reason ??
    primaryAction.reason ??
    nextStepBrief.blockers[0];
  const footerActionNotice =
    actionError || (primaryIntent.kind === "wait" ? primaryIntent.reason : "");
  const footerInstruction =
    footerActionNotice || actionAnnouncement || footerInstructions[data.status];
  let footerInstructionToneClassName = "text-white/40";
  if (footerActionNotice || actionAnnouncement) {
    footerInstructionToneClassName = "text-white/70";
  }
  if (actionError) {
    footerInstructionToneClassName = "text-orange-400";
  }
  let footerInstructionRole: "alert" | "status" | undefined;
  if (footerActionNotice || actionAnnouncement) {
    footerInstructionRole = "status";
  }
  if (actionError) {
    footerInstructionRole = "alert";
  }
  const footerInstructionClassName = [
    "text-[12px]",
    footerActionNotice || actionAnnouncement ? "block" : "hidden sm:block",
    footerInstructionToneClassName,
  ].join(" ");
  const primaryButtonClassName = primaryIntentToneClass(primaryIntent);
  const primaryIntentDisabled = actionPending || primaryIntent.kind === "wait";
  const primaryIntentLabel = actionPending
    ? pendingLabelForIntent(primaryIntent)
    : primaryIntent.label;
  const primaryIntentInteraction = interactionForIntent(primaryIntent);
  const uploadingTargetKey =
    actionPending && selectedUploadTarget
      ? uploadTargetKey(selectedUploadTarget.applicantId, selectedUploadTarget.fileType)
      : null;

  useEffect(() => {
    if (scrollSubmissionIdRef.current !== submission.id) {
      tabScrollPositionsRef.current.clear();
      scrollSubmissionIdRef.current = submission.id;
    }
    actionRequestIdRef.current += 1;
    actionPendingRef.current = false;
    setActionError("");
    setActionAnnouncement("");
    setActionPending(false);
    setContextExpanded(false);
    setMissingTargetMessage("");
    setReviewConfirmationOpen(false);
    setSelectedUploadTarget(null);
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
  }, [focusTarget, isOpen]);

  useEffect(() => {
    if (!isOpen || activeTab !== "issues" || focusTarget?.tab !== "issues") {
      return;
    }

    let cancelled = false;
    let frame = 0;
    let attempt = 0;
    const focusRequestedTarget = () => {
      if (cancelled) return;
      const target = document.getElementById(targetElementId(focusTarget));
      if (target) {
        target.scrollIntoView({
          behavior: shouldReduceMotion ? "auto" : "smooth",
          block: "center",
        });
        target.focus({ preventScroll: true });
        setMissingTargetMessage("");
        onClearFocusTarget?.();
        return;
      }

      if (attempt < 20) {
        attempt += 1;
        frame = window.requestAnimationFrame(focusRequestedTarget);
        return;
      }

      setMissingTargetMessage(
        "Точный объект замечания не найден. Откройте список замечаний и выберите доступную задачу.",
      );
      onClearFocusTarget?.();
    };
    frame = window.requestAnimationFrame(focusRequestedTarget);

    return () => {
      cancelled = true;
      window.cancelAnimationFrame(frame);
    };
  }, [activeTab, focusTarget, isOpen, onClearFocusTarget, shouldReduceMotion]);

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
      if (event.key === "Escape" && !reviewConfirmationOpenRef.current) onClose();
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

  async function runPendingOperation(
    operation: () => void | Promise<unknown>,
    successMessage: string,
    errorMessage = "Не удалось сохранить действие. Состояние подачи не изменено. Повторите попытку.",
  ) {
    if (actionPendingRef.current) return false;
    const requestId = ++actionRequestIdRef.current;
    setActionPending(true);
    actionPendingRef.current = true;
    setActionError("");
    setActionAnnouncement("");
    try {
      await operation();
      if (requestId !== actionRequestIdRef.current) return false;
      setActionAnnouncement(successMessage);
      return true;
    } catch {
      if (requestId !== actionRequestIdRef.current) return false;
      setActionError(errorMessage);
      return false;
    } finally {
      if (requestId === actionRequestIdRef.current) {
        actionPendingRef.current = false;
        setActionPending(false);
      }
    }
  }

  async function runAction(action: SubmissionAction, successMessage: string) {
    return runPendingOperation(() => onAction(action), successMessage);
  }

  function selectUploadTarget(
    applicantId: string,
    fileType: SubmissionFileType,
    label = `Загрузить ${fileLabel(fileType)}`,
  ) {
    if (!onUploadApplicantFile || actionPendingRef.current) return;
    setActionError("");
    setActionAnnouncement("");
    setSelectedUploadTarget({ applicantId, fileType, label });
    window.requestAnimationFrame(() => primaryUploadInputRef.current?.click());
  }

  async function uploadSelectedTarget(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    const target = selectedUploadTarget;
    if (!file || !target || !onUploadApplicantFile) {
      setSelectedUploadTarget(null);
      return;
    }

    await runPendingOperation(
      () =>
        onUploadApplicantFile(submission.id, target.applicantId, target.fileType, file),
      `${fileLabel(target.fileType)} загружен. Готовность подачи обновлена.`,
      "Не удалось загрузить файл. Состояние подачи не изменено. Повторите попытку.",
    );
    setSelectedUploadTarget(null);
  }

  async function handlePrimaryIntent() {
    if (primaryIntentDisabled || actionPendingRef.current) return;
    if (primaryIntent.kind === "history") {
      selectTab("history");
      return;
    }
    if (primaryIntent.kind === "navigate") {
      onOpenWorkspaceTarget(primaryIntent.target);
      return;
    }
    if (primaryIntent.kind === "upload") {
      selectUploadTarget(
        primaryIntent.applicantId,
        primaryIntent.fileType,
        primaryIntent.label,
      );
      return;
    }
    if (primaryIntent.kind !== "submission") return;

    await runAction(
      primaryIntent.action,
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

  function openReviewConfirmation(trigger: React.MouseEvent<HTMLButtonElement>) {
    reviewConfirmationTriggerRef.current = trigger.currentTarget;
    setActionError("");
    setReviewConfirmationOpen(true);
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
            className="v19-submission-drawer v19-agent-drawer fixed z-50 flex flex-col"
            data-reduced-motion={shouldReduceMotion ? "true" : "false"}
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
            <header className="v19-submission-drawer-header">
              <div
                className="v19-agent-drawer-heading"
                data-testid="drawer-lifecycle-context"
              >
                <div className="v19-agent-drawer-titlecopy">
                  <div className="v19-agent-drawer-eyebrow">
                    <span className="font-mono font-medium tracking-wider text-white/70">
                      {data.id}
                    </span>
                    <span aria-hidden="true">•</span>
                    <span className="uppercase tracking-wider">
                      {data.type === "family" ? "Семейная" : "Индивидуальная"}
                    </span>
                  </div>
                  <h2 id="submission-drawer-heading">{data.title}</h2>
                  <div className="v19-agent-drawer-status-row">
                    <StatusBadge status={data.status} />
                    <span data-testid="drawer-updated-at">
                      <Clock aria-hidden="true" className="w-3.5 h-3.5" />
                      Обновлено {data.updated}
                    </span>
                  </div>
                </div>

                <button
                  {...agentInteractionProps("drawer.close")}
                  aria-label="Закрыть подачу"
                  className="linear-product-action linear-product-action--icon linear-product-action--ghost v19-agent-drawer-close"
                  type="button"
                  onClick={onClose}
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <section
                aria-label="Следующий шаг по подаче"
                className={`v19-agent-drawer-action-card ${
                  blockerReason ? "is-blocked" : "is-clear"
                }`}
                data-testid="drawer-next-step-context"
              >
                <div className="v19-agent-drawer-action-copy">
                  <span>Что сделать сейчас</span>
                  <strong data-testid="drawer-next-step">{primaryIntent.label}</strong>
                </div>

                {!isDesktop ? (
                  <button
                    {...agentInteractionProps("drawer.toggle-context")}
                    aria-expanded={contextExpanded}
                    className="linear-product-action linear-product-action--secondary v19-agent-drawer-context-toggle"
                    type="button"
                    onClick={() => setContextExpanded((expanded) => !expanded)}
                  >
                    Подробнее
                    <ChevronDown
                      aria-hidden="true"
                      className={contextExpanded ? "is-expanded" : undefined}
                    />
                  </button>
                ) : null}

                <dl
                  className="v19-agent-drawer-context"
                  hidden={!isDesktop && !contextExpanded}
                >
                  <div>
                    <dt>Ответственный сейчас</dt>
                    <dd data-testid="drawer-next-owner">
                      {ownerLabel(submission.status, nextStepBrief.owner)}
                    </dd>
                  </div>
                  <div>
                    <dt>{blockerReason ? "Что мешает" : "Готовность"}</dt>
                    <dd data-testid="drawer-blocker-reason">
                      {blockerReason ?? "Можно переходить к следующему действию"}
                    </dd>
                  </div>
                </dl>
              </section>

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
                        {tab.id === "issues" &&
                        data.issuesCount > data.openIssuesCount ? (
                          <span className="sr-only">
                            , исправлено и ждёт проверки:{" "}
                            {data.issuesCount - data.openIssuesCount}
                          </span>
                        ) : null}
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
                    {...agentInteractionProps("drawer.dismiss-notice")}
                    aria-label="Скрыть сообщение"
                    className="linear-product-action linear-product-action--icon linear-product-action--ghost"
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
                    <OverviewTab
                      canEdit={canEditSubmission}
                      data={data}
                      onOpenQuestionnaire={onOpenQuestionnaire}
                      onSelectUploadTarget={selectUploadTarget}
                      submission={submission}
                      uploadingTargetKey={uploadingTargetKey}
                    />
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

            <footer className="v19-submission-drawer-footer">
              <div
                className={footerInstructionClassName}
                data-testid="drawer-footer-instruction"
                id={footerInstructionId}
                role={footerInstructionRole}
              >
                {footerInstruction}
              </div>
              <div className="v19-agent-drawer-footer-actions">
                {submission.status === "ready_for_export" ? (
                  <button
                    {...agentInteractionProps("drawer.open-return-review")}
                    className="linear-product-action linear-product-action--secondary v19-agent-drawer-return-review"
                    disabled={actionPending}
                    type="button"
                    onClick={openReviewConfirmation}
                  >
                    Вернуть на проверку
                  </button>
                ) : null}
                <button
                  {...agentInteractionProps(primaryIntentInteraction)}
                  aria-busy={actionPending}
                  aria-describedby={
                    footerActionNotice ? footerInstructionId : undefined
                  }
                  className={`linear-product-action ${
                    primaryButtonClassName === "is-warning"
                      ? "linear-product-action--warning"
                      : "linear-product-action--primary"
                  } v19-agent-drawer-primary ${primaryButtonClassName}`}
                  data-testid="drawer-primary-action"
                  disabled={primaryIntentDisabled}
                  type="button"
                  onClick={() => void handlePrimaryIntent()}
                >
                  <PrimaryIntentIcon intent={primaryIntent} pending={actionPending} />
                  {primaryIntentLabel}
                </button>
              </div>
            </footer>

            <input
              {...agentInteractionProps("drawer.upload-file")}
              accept={
                selectedUploadTarget
                  ? acceptedFileTypes(selectedUploadTarget.fileType)
                  : undefined
              }
              aria-hidden="true"
              aria-label={
                selectedUploadTarget
                  ? `Выбрать файл: ${selectedUploadTarget.label}`
                  : "Выбрать файл для подачи"
              }
              hidden
              ref={primaryUploadInputRef}
              tabIndex={-1}
              type="file"
              onChange={(event) => void uploadSelectedTarget(event)}
            />
          </motion.div>
          {reviewConfirmationOpen ? (
            <ConfirmationDialog
              busy={actionPending}
              cancelInteractionId="drawer.cancel-return-review"
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
