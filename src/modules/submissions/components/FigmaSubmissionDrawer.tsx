import {
  type ChangeEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
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
} from "lucide-react";
import { getPrimaryAction, statusLabels } from "../status";
import { ProgressMeter } from "./CollectionPrimitives";
import {
  V19DrawerHeader,
  type V19DrawerTab,
} from "../../../shared/ui/v19-design-system";
import { QuestionnaireSectionPreviewCard } from "./QuestionnaireWorkspacePrimitives";
import {
  targetElementId,
  tabForTarget,
  type WorkspaceTarget,
} from "../workspaceModel";
import type {
  DrawerTab,
  Role,
  Submission,
  SubmissionAction,
  SubmissionFile,
} from "../types";

type SourceStatus =
  | "draft"
  | "in_progress"
  | "submitted_for_review"
  | "returned"
  | "corrections_received"
  | "ready_for_export"
  | "exported";

type TabId = "overview" | "questionnaire" | "files" | "issues" | "history";

type DrawerTabConfig = Omit<V19DrawerTab<TabId>, "count"> & {
  getCount?: (detail: FigmaSubmissionDetail) => number;
};

const drawerFocusableSelector = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function getDrawerFocusableElements(container: HTMLElement | null) {
  if (!container) return [];
  return Array.from(container.querySelectorAll<HTMLElement>(drawerFocusableSelector)).filter(
    (element) =>
      !element.hasAttribute("disabled") &&
      element.getAttribute("aria-hidden") !== "true" &&
      element.offsetParent !== null,
  );
}

function useDrawerDesktopQuery() {
  const [isDesktop, setIsDesktop] = useState(() =>
    typeof window === "undefined"
      ? true
      : window.matchMedia("(min-width: 1024px)").matches,
  );

  useEffect(() => {
    if (typeof window === "undefined") return;

    const media = window.matchMedia("(min-width: 1024px)");
    const update = () => setIsDesktop(media.matches);
    update();
    media.addEventListener("change", update);

    return () => media.removeEventListener("change", update);
  }, []);

  return isDesktop;
}

type QuestionnaireFocusTarget = {
  applicantId?: string;
  field?: string;
  section?: string;
};

type FigmaApplicant = {
  completeness: number;
  name: string;
  role: string;
  status: string;
};

type FigmaSubmissionDetail = {
  applicants: FigmaApplicant[];
  applicantsCount: number;
  city: string;
  completeness: number;
  id: string;
  issuesCount: number;
  owner: string;
  status: SourceStatus;
  title: string;
  tripDates: string;
  type: "family" | "single";
  updated: string;
};

type FigmaSubmissionDrawerProps = {
  activeTab: DrawerTab;
  actionError?: string;
  focusTarget?: WorkspaceTarget;
  onClearFocusTarget?: () => void;
  onAction: (action: SubmissionAction) => void;
  onClose: () => void;
  onMarkIssueFixed?: (issueId: string) => void;
  onUploadFile?: (fileId: string, file: File) => void | Promise<void>;
  onOpenQuestionnaireWorkspace: (target?: QuestionnaireFocusTarget) => void;
  role: Role;
  submission: Submission;
  surface: "agent" | "review" | "export";
  [key: string]: unknown;
};

function sourceStatus(submission: Submission): SourceStatus {
  if (submission.status === "draft") return "draft";
  if (submission.status === "returned") return "returned";
  if (submission.status === "submitted_for_review") return "submitted_for_review";
  if (submission.status === "ready_for_export") return "ready_for_export";
  if (submission.status === "exported") return "exported";
  return "in_progress";
}

function applicantRoleLabel(role: string) {
  if (role === "main") return "Основной";
  if (role === "spouse") return "Супруга";
  if (role === "child") return "Ребенок";
  return role;
}

function applicantQuestionnairePercent(
  applicant: Submission["applicants"][number],
) {
  if (applicant.questionnaireStatus === "complete") return 100;
  if (applicant.questionnaireStatus === "empty") return 0;

  const sections = applicant.sections;
  if (!sections.length) return applicant.questionnaireStatus === "needs_fix" ? 65 : 40;

  const completeCount = sections.filter((section) => section.status === "complete").length;
  return Math.round((completeCount / sections.length) * 100);
}

function buildDetail(submission: Submission): FigmaSubmissionDetail {
  return {
    applicants: submission.applicants.map((applicant) => ({
      completeness: applicantQuestionnairePercent(applicant),
      name: applicant.fullName,
      role: applicantRoleLabel(applicant.role ?? "main"),
      status: applicant.questionnaireStatus,
    })),
    applicantsCount: submission.applicants.length,
    city: `${submission.city} (VFS Global)`,
    completeness: submission.completeness.total,
    id: submission.id,
    issuesCount: submission.issues.filter(
      (issue) => issue.status !== "closed_by_admin",
    ).length,
    owner: "Татьяна Н.",
    status: sourceStatus(submission),
    title: submission.title,
    tripDates: `${submission.tripDateFrom.replace("-", "–")} – ${submission.tripDateTo.replace("-", "–")}`,
    type: submission.type,
    updated: submission.updatedAt,
  };
}

function fileTypeLabel(type: SubmissionFile["type"]) {
  if (type === "passport_scan") return "Скан паспорта";
  if (type === "selfie") return "Селфи 1";
  if (type === "selfie_2") return "Селфи 2";
  return "Документ";
}

function fileStatusLabel(file: SubmissionFile) {
  if (file.status === "missing") return "Не загружено";
  if (file.status === "needs_replacement") return "Нужна замена";
  if (file.status === "pending_review") return "На проверке";
  if (file.status === "accepted") return "Принято";
  if (file.status === "uploaded") return "Загружено";
  return "Не загружено";
}

function fileActionLabel(file: SubmissionFile) {
  return file.status === "needs_replacement" ? "Заменить" : "Загрузить";
}

function fileAccept(file: SubmissionFile) {
  if (file.type === "passport_scan") return "image/jpeg,image/png,application/pdf";
  if (file.type === "selfie" || file.type === "selfie_2") return "image/*";
  return undefined;
}

function fileSummary(file: SubmissionFile) {
  const uploadedName = file.originalFileName ?? file.generatedFileName;
  if (!uploadedName) return fileStatusLabel(file);
  return `${fileStatusLabel(file)} · ${uploadedName}`;
}

function fileReadyBadgeLabel(file: SubmissionFile) {
  if (file.status === "pending_review") return "На проверке";
  if (file.status === "accepted") return "Принято";
  if (file.status === "uploaded") return "Загружено";
  return "Готово";
}

type FileApplicantSection = {
  files: SubmissionFile[];
  id: string;
  name: string;
};

function fileApplicantSections(submission: Submission): FileApplicantSection[] {
  const applicantNameById = new Map(
    submission.applicants.map((applicant) => [applicant.id, applicant.fullName]),
  );
  const applicantOrder = new Map(
    submission.applicants.map((applicant, index) => [applicant.id, index]),
  );
  const filesByApplicantId = new Map<string, SubmissionFile[]>();

  for (const file of submission.files) {
    const files = filesByApplicantId.get(file.applicantId) ?? [];
    files.push(file);
    filesByApplicantId.set(file.applicantId, files);
  }

  return Array.from(filesByApplicantId.entries())
    .sort(
      ([leftId], [rightId]) =>
        (applicantOrder.get(leftId) ?? Number.MAX_SAFE_INTEGER) -
          (applicantOrder.get(rightId) ?? Number.MAX_SAFE_INTEGER) ||
        leftId.localeCompare(rightId),
    )
    .map(([applicantId, files], index) => ({
      files,
      id: applicantId,
      name: applicantNameById.get(applicantId) ?? `Заявитель ${index + 1}`,
    }));
}

const Skeleton = ({ className = "" }: { className?: string }) => (
  <div className={`v19-figma-skeleton ${className}`} />
);

function compactStatusLabel(status: SourceStatus) {
  if (status === "returned") return "возвращено";
  if (status === "submitted_for_review") return "проверка";
  if (status === "ready_for_export") return "готово";
  if (status === "exported") return "выгружено";
  if (status === "in_progress") return "в работе";
  return "черновик";
}

function isFileReady(file: SubmissionFile) {
  return file.status !== "missing" && file.status !== "needs_replacement";
}

function documentPackageItems(submission: Submission) {
  const byType = new Map<
    SubmissionFile["type"],
    { ready: number; total: number; type: SubmissionFile["type"] }
  >();

  for (const file of submission.files) {
    const current = byType.get(file.type) ?? { ready: 0, total: 0, type: file.type };
    byType.set(file.type, {
      ...current,
      ready: current.ready + (isFileReady(file) ? 1 : 0),
      total: current.total + 1,
    });
  }

  return Array.from(byType.values()).map((item) => ({
    label:
      item.total > 1
        ? `${fileTypeLabel(item.type)} (${item.ready}/${item.total})`
        : fileTypeLabel(item.type),
    status:
      item.ready === item.total
        ? "done"
        : item.ready > 0
          ? "in_progress"
          : "pending",
  }));
}

const OverviewTab = ({
  data,
  submission,
}: {
  data: FigmaSubmissionDetail;
  submission: Submission;
}) => {
  const documentItems = documentPackageItems(submission);
  const readyFilesCount = submission.files.filter(isFileReady).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="v19-drawer-route-card bg-white/[0.02] border border-white/5 rounded-xl p-5 hover:border-white/10 transition-colors">
          <h3 className="v19-drawer-overview-heading text-[var(--v19b-size-11)] font-medium text-white/40 uppercase tracking-wider mb-5">
            Маршрут и подача
          </h3>
          <div className="space-y-4 text-sm">
            <div className="flex gap-4">
              <Calendar className="w-5 h-5 text-white/30 shrink-0" />
              <div className="v19-drawer-route-copy">
                <div className="text-white/90 font-medium">{data.tripDates}</div>
                <div className="text-white/40 text-[var(--v19b-size-11)] mt-0.5">Даты поездки</div>
              </div>
            </div>
            <div className="flex gap-4">
              <MapPin className="w-5 h-5 text-white/30 shrink-0" />
              <div className="v19-drawer-route-copy">
                <div className="text-white/90 font-medium">{data.city}</div>
                <div className="text-white/40 text-[var(--v19b-size-11)] mt-0.5">
                  Визовый центр подачи
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 hover:border-white/10 transition-colors flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <h3 className="v19-drawer-overview-heading text-[var(--v19b-size-11)] font-medium text-white/40 uppercase tracking-wider">
              Пакет документов
            </h3>
            <span className="v19-drawer-package-count">
              {readyFilesCount}/{submission.files.length}
            </span>
          </div>
          <div className="space-y-3 flex-1 flex flex-col justify-center">
            {documentItems.map((doc) => (
              <div key={doc.label} className="v19-drawer-package-row flex items-center gap-3">
                {doc.status === "done" ? (
                  <CheckCircle2 className="v19-drawer-package-check" />
                ) : doc.status === "in_progress" ? (
                  <div className="v19-document-package-dot is-progress" />
                ) : (
                  <div className="v19-document-package-dot" />
                )}
                <span
                  className={`v19-drawer-package-label text-[var(--v19b-size-13)] ${
                    doc.status === "pending" ? "text-white" : "text-white/70"
                  }`}
                >
                  {doc.label}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="v19-drawer-overview-heading text-[var(--v19b-size-11)] font-medium text-white/40 uppercase tracking-wider pl-1">
          Участники ({data.applicantsCount})
        </h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {data.applicants.map((applicant, index) => (
            <div
              key={`${applicant.name}-${index}`}
              className="flex items-center p-3 bg-white/[0.02] border border-white/5 hover:border-white/10 rounded-xl transition-all group"
            >
              <div className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-[var(--v19b-color-control-hover)] to-[var(--v19b-color-panel-strong)] border border-white/10 flex items-center justify-center text-xs font-semibold text-white/70 shadow-inner mr-3">
                {applicant.name
                  .split(" ")
                  .map((part) => part[0])
                  .join("")}
              </div>
              <div className="v19-drawer-applicant-copy flex-1 min-w-0">
                <div className="v19-drawer-applicant-name text-[var(--v19b-size-14)] text-white font-medium truncate group-hover:text-[var(--v19b-color-primary-text)] transition-colors">
                  {applicant.name}
                </div>
                <div className="v19-drawer-applicant-role text-[var(--v19b-size-11)] text-white/50 mt-0.5">
                  {applicant.role}
                </div>
              </div>
              <div className="text-right">
                <div className="v19-drawer-applicant-score">
                  {applicant.completeness}%
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const QuestionnaireTab = ({
  onOpenQuestionnaire,
}: {
  onOpenQuestionnaire: (target?: QuestionnaireFocusTarget) => void;
}) => (
  <div className="space-y-6">
    <div className="v19-drawer-questionnaire-summary-head">
      <div className="v19-drawer-questionnaire-summary-copy">
        <h3 className="v19-drawer-questionnaire-summary-title">
          Прогресс заполнения
        </h3>
        <p className="v19-questionnaire-progress-helper v19-drawer-questionnaire-summary-helper">
          Осталось заполнить 2 блока данных
        </p>
      </div>
      <button
        className="v19-drawer-questionnaire-open-button"
        onClick={() => onOpenQuestionnaire()}
        type="button"
      >
        <Edit3 className="v19-drawer-questionnaire-open-icon" />
        <span className="v19-drawer-questionnaire-open-text">Открыть анкету</span>
      </button>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {[
        { title: "Личные данные", icon: User, progress: 100, status: "done" },
        { title: "Паспортные данные", icon: FileDigit, progress: 100, status: "done" },
        {
          title: "Место работы / Учебы",
          icon: Briefcase,
          progress: 40,
          remaining: "3 поля",
          status: "in_progress",
        },
        { title: "Спонсоры и финансы", icon: CreditCard, progress: 0, status: "pending" },
        { title: "Детали поездки", icon: Plane, progress: 100, status: "done" },
        { title: "Визовая история", icon: History, progress: 100, status: "done" },
      ].map((section) => (
        <QuestionnaireSectionPreviewCard
          key={section.title}
          className="p-4 bg-white/[0.02] border border-white/5 rounded-xl flex items-center gap-4 hover:bg-white/[0.04] transition-colors cursor-pointer"
          role="button"
          tabIndex={0}
          onClick={() => onOpenQuestionnaire()}
          onKeyDown={(event) => {
            if (event.key !== "Enter" && event.key !== " ") return;
            event.preventDefault();
            onOpenQuestionnaire();
          }}
        >
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border ${
              section.status === "done"
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                : section.status === "in_progress"
                  ? "bg-[var(--v19b-color-primary-soft-10)] border-[var(--v19b-color-primary-soft-20)] text-[var(--v19b-color-primary-text)]"
                  : "bg-white/5 border-white/10 text-white/40"
            }`}
          >
            <section.icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="v19-drawer-questionnaire-section-head flex items-center justify-between mb-1">
              <span className="v19-drawer-questionnaire-section-title text-[var(--v19b-size-13)] font-medium text-white truncate">
                {section.title}
              </span>
              <span className="v19-drawer-questionnaire-section-percent text-[var(--v19b-size-11)] font-mono text-white/50">
                {section.progress}%
              </span>
            </div>
            <ProgressMeter
              ariaHidden
              className="v19-questionnaire-section-progress"
              tone={
                section.status === "done"
                  ? "success"
                  : section.status === "in_progress"
                    ? "accent"
                    : "muted"
              }
              value={section.progress}
            />
            {section.remaining ? (
              <div className="v19-drawer-questionnaire-section-remaining text-[var(--v19b-size-10)] text-white/40 mt-1.5">
                Осталось: {section.remaining}
              </div>
            ) : null}
          </div>
        </QuestionnaireSectionPreviewCard>
      ))}
    </div>
  </div>
);

const FilesTab = ({
  onUploadFile,
  submission,
}: {
  onUploadFile?: (fileId: string, file: File) => void | Promise<void>;
  submission: Submission;
}) => {
  const applicantSections = fileApplicantSections(submission);
  const firstUploadableApplicant =
    applicantSections.find((section) =>
      section.files.some(
        (file) =>
          file.status === "needs_replacement" ||
          (submission.status !== "returned" && file.status === "missing"),
      ),
    )?.id ?? applicantSections[0]?.id;
  const [expandedApplicantIds, setExpandedApplicantIds] = useState<string[]>(
    firstUploadableApplicant ? [firstUploadableApplicant] : [],
  );
  const fileInputsRef = useRef(new Map<string, HTMLInputElement>());

  useEffect(() => {
    setExpandedApplicantIds(firstUploadableApplicant ? [firstUploadableApplicant] : []);
  }, [firstUploadableApplicant, submission.id]);

  function toggleApplicant(applicantId: string) {
    setExpandedApplicantIds((current) =>
      current.includes(applicantId)
        ? current.filter((id) => id !== applicantId)
        : [...current, applicantId],
    );
  }

  function handleFileChange(
    event: ChangeEvent<HTMLInputElement>,
    fileId: string,
  ) {
    const selectedFile = event.currentTarget.files?.[0];
    if (!selectedFile) return;

    void onUploadFile?.(fileId, selectedFile);
    event.currentTarget.value = "";
  }

  return (
    <div className="v19-drawer-files">
      <div className="v19-drawer-files-head">
        <h3 className="v19-drawer-files-title">Файлы подачи</h3>
        <span className="v19-drawer-files-count">
          {submission.files.filter(isFileReady).length}/{submission.files.length}
        </span>
      </div>

      <div className="v19-drawer-file-sections">
        {applicantSections.map((section) => {
          const isExpanded = expandedApplicantIds.includes(section.id);
          const uploadedCount = section.files.filter(
            (file) => file.status !== "missing" && file.status !== "needs_replacement",
          ).length;
          const actionCount = section.files.length - uploadedCount;

          return (
            <section
              className="v19-drawer-file-section"
              key={section.id}
            >
              <button
                aria-expanded={isExpanded}
                className="v19-drawer-file-section-head"
                type="button"
                onClick={() => toggleApplicant(section.id)}
              >
                <span className="v19-drawer-file-section-copy">
                  <span className="v19-drawer-file-section-title">
                    {section.name}
                  </span>
                  <span className="v19-drawer-file-section-meta">
                    {uploadedCount}/{section.files.length} файлов готово
                    {actionCount > 0 ? ` · требуется ${actionCount}` : ""}
                  </span>
                </span>
                <span className="v19-drawer-file-section-toggle">
                  {isExpanded ? "Свернуть" : "Раскрыть"}
                </span>
              </button>

              {isExpanded ? (
                <div className="v19-drawer-file-list">
                  {section.files.map((file) => {
                    const canUpload =
                      file.status === "missing" || file.status === "needs_replacement";
                    const actionLabel = `${fileActionLabel(file)} ${fileTypeLabel(file.type)} — ${section.name}`;

                    return (
                      <div
                        id={targetElementId({
                          applicantId: file.applicantId,
                          fileType: file.type,
                          tab: "files",
                        })}
                        className="v19-drawer-file-item"
                        key={file.id}
                      >
                        <div className="v19-drawer-file-icon">
                          <UploadCloud aria-hidden="true" />
                        </div>
                        <div className="v19-drawer-file-copy">
                          <div className="v19-drawer-file-title">
                            {fileTypeLabel(file.type)}
                          </div>
                          <div className="v19-drawer-file-meta">
                            {fileSummary(file)}
                          </div>
                        </div>
                        {canUpload ? (
                          <>
                            <input
                              accept={fileAccept(file)}
                              aria-label={actionLabel}
                              className="drawer-file-input"
                              disabled={!onUploadFile}
                              ref={(node) => {
                                if (node) fileInputsRef.current.set(file.id, node);
                                else fileInputsRef.current.delete(file.id);
                              }}
                              type="file"
                              onChange={(event) => handleFileChange(event, file.id)}
                            />
                            <button
                              aria-label={actionLabel}
                              className="v19-drawer-file-action"
                              disabled={!onUploadFile}
                              type="button"
                              onClick={() => fileInputsRef.current.get(file.id)?.click()}
                            >
                              {fileActionLabel(file)}
                            </button>
                          </>
                        ) : (
                          <span className="v19-drawer-file-status is-ready">
                            {fileReadyBadgeLabel(file)}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </section>
          );
        })}
      </div>
    </div>
  );
};

const IssuesTab = ({
  data,
  onMarkIssueFixed,
  onOpenQuestionnaire,
  role,
  submission,
}: {
  data: FigmaSubmissionDetail;
  onMarkIssueFixed?: (issueId: string) => void;
  onOpenQuestionnaire: (target?: QuestionnaireFocusTarget) => void;
  role: Role;
  submission: Submission;
}) => (
  <div className="v19-drawer-issues">
    <div className="v19-drawer-issues-head">
      <div>
        <h3>Список задач по замечаниям</h3>
        <p>Ошибки, выявленные администратором при проверке</p>
      </div>
      <span>Требуют исправления: {data.issuesCount}</span>
    </div>
    {data.issuesCount > 0 ? (
      <div className="v19-drawer-issues-list">
        {submission.issues
          .filter((issue) => issue.status !== "closed_by_admin")
          .map((issue) => {
            const Icon = issue.type === "file" ? ImageIcon : FileText;
            const canMarkFixed =
              role === "agent" && issue.status === "open" && Boolean(onMarkIssueFixed);

            return (
            <div
              id={targetElementId({ issueId: issue.id, tab: "issues" })}
              key={issue.id}
              className="v19-drawer-issue-card"
            >
              <span className="v19-drawer-issue-accent" aria-hidden="true" />
              <div className="v19-drawer-issue-icon">
                <Icon className="w-5 h-5" />
              </div>
              <div className="v19-drawer-issue-copy">
                <div className="v19-drawer-issue-title-row">
                  <h4>{issue.reason}</h4>
                  <span>{issue.status === "fixed_by_agent" ? "Исправлено" : "Blocker"}</span>
                </div>
                <div className="v19-drawer-issue-target">
                  {issueTargetLine(issue)}
                </div>
                <p>{issue.comment}</p>
              </div>
              <div className="v19-drawer-issue-actions">
                {issue.type === "field" && issue.status === "open" ? (
                  <button
                    type="button"
                    onClick={() =>
                      onOpenQuestionnaire({
                        applicantId: issue.target.applicantId,
                        field: issue.target.field,
                        section: issue.target.section,
                      })
                    }
                  >
                    Исправить в анкете
                  </button>
                ) : null}
                {canMarkFixed ? (
                  <button
                    type="button"
                    onClick={() => onMarkIssueFixed?.(issue.id)}
                  >
                    Отметить исправленным
                  </button>
                ) : null}
                {!canMarkFixed && !(issue.type === "field" && issue.status === "open") ? (
                  <span className="v19-drawer-issue-state">
                    {issue.status === "fixed_by_agent" ? "Ждет проверки" : "Документ"}
                  </span>
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    ) : (
      <div className="v19-drawer-issues-empty">
        <div>
          <CheckCircle2 className="w-8 h-8" />
        </div>
        <h4>Ошибок не найдено</h4>
        <p>Все данные проверены администратором. Замечаний к анкете и документам нет.</p>
      </div>
    )}
  </div>
);

function issueTargetLine(issue: Submission["issues"][number]) {
  const parts = [
    issue.target.applicantName,
    issue.target.fileType ? "Файлы" : (issue.target.section ?? "Анкета"),
    issue.target.field,
  ];
  return parts.filter(Boolean).join(" · ");
}

const HistoryTab = () => {
  const events = [
    {
      Icon: AlertCircle,
      time: "Сегодня, 14:30",
      title: "Возвращено с замечаниями",
      tone: "warning",
      user: "Система",
    },
    {
      Icon: UploadCloud,
      time: "Вчера, 18:45",
      title: "Отправлено на проверку",
      tone: "info",
      user: "Вы",
    },
    {
      Icon: ImageIcon,
      time: "Вчера, 15:10",
      title: "Загружены сканы паспортов",
      tone: "neutral",
      user: "Вы",
    },
    {
      Icon: FileText,
      time: "Вчера, 12:00",
      title: "Создан черновик",
      tone: "neutral",
      user: "Вы",
    },
  ];

  return (
    <section className="v19-history-composition" aria-label="История подачи">
      {events.map((event) => (
        <div className="v19-history-item" key={event.title}>
          <span className={`v19-history-icon is-${event.tone}`}>
            <event.Icon aria-hidden="true" />
          </span>
          <span className="v19-history-copy">
            <strong>{event.title}</strong>
            <span>
              {event.time}
              <i aria-hidden="true" />
              {event.user}
            </span>
          </span>
        </div>
      ))}
    </section>
  );
};

function initialTab(tab: DrawerTab): TabId {
  if (tab === "files") return "files";
  if (tab === "issues") return "issues";
  if (tab === "history") return "history";
  if (tab === "questionnaire") return "questionnaire";
  return "overview";
}

function tabIdForWorkspaceTarget(target: WorkspaceTarget): TabId {
  return initialTab(tabForTarget(target));
}

function questionnaireFocusFromTarget(target: WorkspaceTarget): QuestionnaireFocusTarget | undefined {
  if (target.tab !== "questionnaire") return undefined;
  return {
    applicantId: target.applicantId,
    field: target.field,
    section: target.section,
  };
}

export function FigmaSubmissionDrawer({
  activeTab,
  actionError = "",
  focusTarget,
  onClearFocusTarget,
  onAction,
  onClose,
  onMarkIssueFixed,
  onOpenQuestionnaireWorkspace,
  onUploadFile,
  role,
  submission,
  surface,
}: FigmaSubmissionDrawerProps) {
  const [tab, setTab] = useState<TabId>(() => initialTab(activeTab));
  const [status, setStatus] = useState<"loading" | "success">("loading");
  const drawerRef = useRef<HTMLDivElement>(null);
  const drawerTabsRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedElementRef = useRef<HTMLElement | null>(null);
  const isDesktopDrawer = useDrawerDesktopQuery();
  const prefersReducedMotion = useReducedMotion();
  const data = useMemo(() => buildDetail(submission), [submission]);
  const primaryAction = getPrimaryAction(submission, role, surface);
  const pendingTargetRef = useRef<WorkspaceTarget | null>(null);
  const drawerPanelInitial = prefersReducedMotion
    ? { opacity: 0, x: 0, y: 0 }
    : {
        opacity: 0.5,
        x: isDesktopDrawer ? "100%" : 0,
        y: isDesktopDrawer ? 0 : "100%",
      };
  const drawerPanelExit = prefersReducedMotion
    ? { opacity: 0, x: 0, y: 0 }
    : {
        opacity: 0,
        x: isDesktopDrawer ? "100%" : 0,
        y: isDesktopDrawer ? 0 : "100%",
      };
  const drawerPanelTransition = prefersReducedMotion
    ? { duration: 0.01 }
    : { damping: 28, mass: 0.8, stiffness: 240, type: "spring" as const };
  const tabContentInitial = prefersReducedMotion
    ? { opacity: 0, y: 0 }
    : { opacity: 0, y: 10 };
  const tabContentExit = prefersReducedMotion
    ? { opacity: 0, y: 0 }
    : { opacity: 0, y: -10 };

  const openWorkspaceTarget = useCallback((target: WorkspaceTarget) => {
    pendingTargetRef.current = target;

    if (target.tab === "questionnaire") {
      setTab("questionnaire");
      if (role === "agent") onOpenQuestionnaireWorkspace(questionnaireFocusFromTarget(target));
      return;
    }

    setTab(tabIdForWorkspaceTarget(target));
  }, [onOpenQuestionnaireWorkspace, role]);

  useEffect(() => {
    previouslyFocusedElementRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    return () => {
      previouslyFocusedElementRef.current?.focus({ preventScroll: true });
    };
  }, [submission.id]);

  useEffect(() => {
    setStatus("loading");
    setTab(initialTab(activeTab));
    const timer = window.setTimeout(() => setStatus("success"), 260);
    return () => window.clearTimeout(timer);
  }, [activeTab, submission.id]);

  useEffect(() => {
    if (!focusTarget) return;
    if (initialTab(activeTab) === "issues" && focusTarget.tab !== "issues") {
      pendingTargetRef.current = null;
      onClearFocusTarget?.();
      return;
    }
    openWorkspaceTarget(focusTarget);
  }, [activeTab, focusTarget, onClearFocusTarget, openWorkspaceTarget, submission.id]);

  useEffect(() => {
    if (status !== "success") return;
    const target = pendingTargetRef.current;
    if (!target) return;

    const timer = window.setTimeout(() => {
      const element = document.getElementById(targetElementId(target));
      if (element) {
        element.scrollIntoView({ behavior: "smooth", block: "center" });
        element.classList.add("is-ai-focus");
        window.setTimeout(() => element.classList.remove("is-ai-focus"), 1800);
      }
      pendingTargetRef.current = null;
      onClearFocusTarget?.();
    }, 120);

    return () => window.clearTimeout(timer);
  }, [onClearFocusTarget, status, tab, submission.id]);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = "";
    };
  }, [onClose]);

  useEffect(() => {
    if (status !== "success") return;
    const activeButton = drawerTabsRef.current?.querySelector<HTMLButtonElement>(
      `[data-drawer-tab="${tab}"]`,
    );
    activeButton?.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
      inline: "nearest",
    });
  }, [status, tab]);

  useEffect(() => {
    if (status !== "success") return;
    window.requestAnimationFrame(() => {
      drawerRef.current?.focus({ preventScroll: true });
    });
  }, [status, submission.id]);

  function handleDrawerKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.stopPropagation();
      onClose();
      return;
    }

    if (event.key !== "Tab") return;

    const focusableElements = getDrawerFocusableElements(drawerRef.current);
    if (focusableElements.length === 0) {
      event.preventDefault();
      drawerRef.current?.focus({ preventScroll: true });
      return;
    }

    const firstElement = focusableElements[0];
    const lastElement = focusableElements[focusableElements.length - 1];
    const activeElement = document.activeElement;

    if (event.shiftKey && activeElement === firstElement) {
      event.preventDefault();
      lastElement.focus({ preventScroll: true });
      return;
    }

    if (!event.shiftKey && activeElement === lastElement) {
      event.preventDefault();
      firstElement.focus({ preventScroll: true });
      return;
    }

    if (!drawerRef.current?.contains(activeElement)) {
      event.preventDefault();
      firstElement.focus({ preventScroll: true });
    }
  }

  const tabs: DrawerTabConfig[] = [
    { id: "overview", label: "Обзор" },
    { id: "questionnaire", label: "Анкета" },
    { id: "files", label: "Файлы" },
    {
      getCount: (detail) => detail.issuesCount,
      id: "issues",
      isWarning: true,
      label: "Замечания",
    },
    { id: "history", label: "История" },
  ];

  const footerAction =
    data.status === "returned" ? (
      <button
        className="v19-drawer-footer-action v19-drawer-footer-action--returned"
        disabled={primaryAction.disabled}
        type="button"
        onClick={() => {
          if (!primaryAction.disabled) onAction(primaryAction.action);
        }}
      >
        <UploadCloud className="w-4 h-4" /> Отправить исправления
      </button>
    ) : (
      <button
        className="v19-drawer-footer-action v19-drawer-footer-action--primary"
        disabled={primaryAction.disabled}
        type="button"
        onClick={() => onAction(primaryAction.action)}
      >
        <CheckCircle2 className="w-4 h-4" /> {primaryAction.label}
      </button>
    );
  const footerStatusText =
    actionError ||
    primaryAction.reason ||
    (data.status === "returned"
      ? "Исправьте замечания перед повторной отправкой."
      : statusLabels[submission.status]);
  const drawerTabs = tabs.map((item) => ({
    count: item.getCount ? item.getCount(data) : undefined,
    id: item.id,
    isWarning: item.isWarning,
    label: item.label,
  }));

  return (
    <AnimatePresence>
      <motion.div
        animate={{ opacity: 1 }}
        className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
        exit={{ opacity: 0 }}
        initial={{ opacity: 0 }}
        key="figma-drawer-overlay"
        onClick={onClose}
        transition={{ duration: prefersReducedMotion ? 0.01 : 0.25 }}
      />

      <motion.div
        animate={{ opacity: 1, x: 0, y: 0 }}
        className="vf-figma-surface v19-submission-drawer-frame v19-figma-drawer-shell"
        exit={drawerPanelExit}
        initial={drawerPanelInitial}
        key="figma-drawer-panel"
        ref={drawerRef}
        role="dialog"
        aria-label={`Подача ${data.id}`}
        aria-modal="true"
        tabIndex={-1}
        transition={drawerPanelTransition}
        onKeyDown={handleDrawerKeyDown}
      >
        <div className="v19-figma-drawer-grabber-wrap">
          <div className="v19-figma-drawer-grabber" />
        </div>

        {status === "loading" ? (
          <div className="flex-1 p-6 lg:p-8 flex flex-col pointer-events-none">
            <Skeleton className="w-48 h-5 mb-4" />
            <Skeleton className="w-3/4 max-w-[var(--v19b-size-400)] h-8 mb-8" />
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
              <Skeleton className="h-[var(--v19b-size-160)] w-full rounded-xl" />
              <Skeleton className="h-[var(--v19b-size-160)] w-full rounded-xl" />
            </div>
          </div>
        ) : (
          <>
            <V19DrawerHeader
              activeTab={tab}
              layoutId="drawerAgentActiveTab"
              meta={[data.id, data.type === "family" ? "семейная" : "индивидуальная"]}
              onClose={onClose}
              onTab={setTab}
              status={compactStatusLabel(data.status)}
              tabs={drawerTabs}
              tabsRef={drawerTabsRef}
              title={data.title}
              statusTone={data.status === "returned" ? "danger" : undefined}
              updated={data.updated}
            />
            <div className="v19-submission-drawer-body flex-1 min-h-0 overflow-y-auto p-5 lg:p-8 scrollbar-thin scrollbar-thumb-white/10">
              <AnimatePresence mode="wait">
                <motion.div
                  animate={{ opacity: 1, y: 0 }}
                  exit={tabContentExit}
                  initial={tabContentInitial}
                  key={tab}
                  transition={{ duration: prefersReducedMotion ? 0.01 : 0.2 }}
                >
                  {tab === "overview" ? (
                    <OverviewTab
                      data={data}
                      submission={submission}
                    />
                  ) : null}
                  {tab === "questionnaire" ? (
                    <QuestionnaireTab
                      onOpenQuestionnaire={onOpenQuestionnaireWorkspace}
                    />
                  ) : null}
                  {tab === "files" ? (
                    <FilesTab
                      onUploadFile={onUploadFile}
                      submission={submission}
                    />
                  ) : null}
                  {tab === "issues" ? (
                    <IssuesTab
                      data={data}
                      onMarkIssueFixed={onMarkIssueFixed}
                      onOpenQuestionnaire={onOpenQuestionnaireWorkspace}
                      role={role}
                      submission={submission}
                    />
                  ) : null}
                  {tab === "history" ? <HistoryTab /> : null}
                </motion.div>
              </AnimatePresence>
            </div>

            <footer className="v19-figma-drawer-footer">
              <div className="v19-figma-drawer-footer-status text-[var(--v19b-size-12)] text-white/40">
                {footerStatusText}
              </div>
              <div className="flex gap-3 w-full sm:w-auto">
                <button
                  className="v19-drawer-footer-action v19-drawer-footer-action--ghost"
                  aria-label="Закрыть подачу"
                  type="button"
                  onClick={onClose}
                >
                  Отмена
                </button>
                {footerAction}
              </div>
            </footer>
          </>
        )}
      </motion.div>
    </AnimatePresence>
  );
}
