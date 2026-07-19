import { useState, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { emitVisaflowUiEvent, useVisaflowBusinessBridge } from '../integration/visaflowBusinessBridge';
import type { Submission as CanonicalSubmission, SubmissionAction } from '../modules/submissions/types';
import {
  agentQuestionnaireStatusPresentation,
  fileTypeLabels,
  statusLabelFor,
} from '../modules/submissions/status';
import { agentDisplayName } from '../modules/submissions/agentDirectory';
import { questionnaireCityForSubmission } from '../modules/submissions/selectors';
import { submissionPublicId } from '../modules/submissions/submissionIdentity';
import { actionGate } from './v19BusinessScreenAdapter';
import { motion, AnimatePresence, useReducedMotion } from 'motion/react';
import {
  drawerMotion,
  drawerPanelExit,
  drawerPanelInitial,
  drawerPanelTransition,
  drawerTabExit,
  drawerTabInitial,
  useDrawerDesktopQuery,
} from '../shared/ui/drawer/drawerMotion';
import { 
  X, CheckCircle2, AlertCircle, Clock, FileText, User,
  Calendar, MapPin, FileDigit, UploadCloud,
  ShieldAlert, Edit3, Image as ImageIcon, History, ChevronDown
} from 'lucide-react';

// --- Types & Interfaces ---
export type SubmissionStatus = 'draft' | 'in_progress' | 'submitted_for_review' | 'returned' | 'corrections_received' | 'ready_for_export' | 'exported';

export interface Applicant {
  name: string;
  role: string;
  status: string;
  completeness: number;
}

export interface SubmissionDetail {
  id: string;
  title: string;
  type: 'single' | 'family';
  applicantsCount: number;
  applicants: Applicant[];
  city: string;
  tripDates: string;
  status: SubmissionStatus;
  completeness: number;
  updated: string;
  owner: string;
  issuesCount: number;
  documents: Array<{ applicantName: string; label: string; status: 'done' | 'pending' }>;
  issues: CanonicalSubmission['issues'];
  history: CanonicalSubmission['history'];
  isDemo: boolean;
}

function tripDatesLabel(from: string, to: string) {
  if (from && to) return `${from} — ${to}`;
  if (from) return `С ${from}`;
  if (to) return `До ${to}`;
  return 'Даты не указаны';
}

function updatedLabel(updatedAt: string) {
  const parsed = new Date(updatedAt);
  if (Number.isNaN(parsed.getTime())) return updatedAt || 'недавно';
  return parsed.toLocaleString('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function historyPresentation(event: CanonicalSubmission['history'][number]) {
  if (event.text.startsWith('Файл загружен') || event.text.startsWith('Файл заменён')) {
    return { icon: UploadCloud, tone: 'document', label: 'Документ' } as const;
  }
  if (event.text.startsWith('Статус изменён') || event.fromStatus || event.toStatus) {
    return { icon: CheckCircle2, tone: 'status', label: 'Статус' } as const;
  }
  if (event.source === 'system') {
    return { icon: ShieldAlert, tone: 'system', label: 'Система' } as const;
  }
  return { icon: FileText, tone: 'activity', label: 'Действие' } as const;
}

interface DrawerProps {
  initialTab?: TabId;
  isOpen: boolean;
  onClose: () => void;
  submissionId: string | null;
  submission?: CanonicalSubmission;
  allowDemoFallback?: boolean;
  onOpenQuestionnaire?: () => void;
  onOpenDocuments?: () => void;
  onSubmissionAction?: (submissionId: string, action: SubmissionAction) => void | Promise<void>;
}

type TabId = 'overview' | 'applicants' | 'questionnaire' | 'files' | 'issues' | 'history';
type DrawerState = 'idle' | 'loading' | 'success' | 'error';

const drawerFocusableSelector = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const drawerTabId = (tab: TabId) => `submission-drawer-tab-${tab}`;
const drawerMobileTabId = (tab: TabId) => `submission-drawer-mobile-tab-${tab}`;
const drawerPanelId = (tab: TabId) => `submission-drawer-panel-${tab}`;
const drawerPanelLabelId = (tab: TabId) => `submission-drawer-panel-label-${tab}`;
// The mobile rail deliberately exposes only two work-starting sections. The
// remaining sections remain one tap away in «Ещё» instead of forcing Russian
// labels to collide in a 320px viewport.
const mobilePrimaryTabIds: readonly TabId[] = ['overview', 'applicants'];

// --- Helper Components ---
const Skeleton = ({ className }: { className?: string }) => (
  <div className={`bg-white/5 animate-pulse rounded-[10px] ${className}`} />
);

const StatusBadge = ({ status }: { status: SubmissionStatus }) => {
  const label = statusLabelFor(status);

  switch (status) {
    case 'in_progress':
      return <span className="v19-submission-drawer-status is-in-progress inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.045] border border-white/10 text-[#b8baff] text-[11px] font-medium uppercase tracking-wide"><Clock className="w-3.5 h-3.5" /> {label}</span>;
    case 'returned':
      return <span className="v19-submission-drawer-status is-returned inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.045] border border-white/10 text-white/62 text-[11px] font-medium uppercase tracking-wide"><AlertCircle className="w-3.5 h-3.5" /> {label}</span>;
    case 'submitted_for_review':
      return <span className="v19-submission-drawer-status is-review inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#6f64ff]/20 border border-[#6f64ff]/30 text-[#b8baff] text-[11px] font-medium uppercase tracking-wide"><ShieldAlert className="w-3.5 h-3.5" /> {label}</span>;
    case 'corrections_received':
      return <span className="v19-submission-drawer-status is-review inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#6f64ff]/20 border border-[#6f64ff]/30 text-[#b8baff] text-[11px] font-medium uppercase tracking-wide"><AlertCircle className="w-3.5 h-3.5" /> {label}</span>;
    case 'ready_for_export':
      return <span className="v19-submission-drawer-status is-ready inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.045] border border-white/10 text-[#b8baff] text-[11px] font-medium uppercase tracking-wide"><CheckCircle2 className="w-3.5 h-3.5" /> {label}</span>;
    case 'exported':
      return <span className="v19-submission-drawer-status is-ready inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.045] border border-white/10 text-[#b8baff] text-[11px] font-medium uppercase tracking-wide"><CheckCircle2 className="w-3.5 h-3.5" /> {label}</span>;
    default:
      return <span className="v19-submission-drawer-status is-draft inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white/70 text-[11px] font-medium uppercase tracking-wide"><FileText className="w-3.5 h-3.5" /> {label}</span>;
  }
};

// --- Sub-components for Tabs ---
const OverviewTab = ({
  data,
  onOpenDocuments,
  onOpenIssues,
  onOpenQuestionnaire,
}: {
  data: SubmissionDetail;
  onOpenDocuments?: () => void;
  onOpenIssues: () => void;
  onOpenQuestionnaire?: () => void;
}) => {
  const hasPendingDocuments = data.documents.some((document) => document.status !== "done");
  const needsCorrections = data.status === "returned";
  const nextStep = needsCorrections
    ? {
        action: onOpenIssues,
        actionLabel: "Открыть замечания",
        description: "Исправьте отмеченные поля и файлы, затем отправьте пакет повторно.",
        label: "Требует действий",
        title: "Исправьте замечания",
      }
    : data.status === "corrections_received"
      ? {
          action: undefined,
          actionLabel: "",
          description: "Исправления отправлены. Администратор повторно проверяет пакет.",
          label: "Статус пакета",
          title: "Исправления на проверке",
        }
    : hasPendingDocuments
      ? {
          action: onOpenDocuments,
          actionLabel: "Открыть файлы",
          description: "Добавьте недостающие документы, чтобы продолжить подачу.",
          label: "Следующий шаг",
          title: "Соберите документы",
        }
      : data.completeness < 100
        ? {
            action: onOpenQuestionnaire,
            actionLabel: "Открыть анкету",
            description: "Заполните оставшиеся поля каждого заявителя.",
            label: "Следующий шаг",
            title: "Завершите анкету",
          }
        : {
            action: undefined,
            actionLabel: "",
            description: "Пакет собран. Перед отправкой проверьте состав и данные.",
            label: "Статус пакета",
            title: "Готово к отправке",
          };

  return (
    <div className="v19-submission-drawer-overview">
      <section className={`v19-submission-drawer-next-action${needsCorrections ? " is-warning" : ""}`} aria-labelledby="drawer-next-action-title">
        <div className="v19-submission-drawer-next-action-mark" aria-hidden="true"><ShieldAlert /></div>
        <div>
          <span>{nextStep.label}</span>
          <h3 id="drawer-next-action-title">{nextStep.title}</h3>
          <p>{nextStep.description}</p>
        </div>
        {nextStep.action ? (
          <button className="v19-submission-drawer-next-action-cta" onClick={nextStep.action} type="button">
            {nextStep.actionLabel}
          </button>
        ) : null}
      </section>
    <div className="v19-submission-drawer-overview-grid">
      <section className="v19-submission-drawer-card v19-submission-drawer-overview-card" aria-labelledby="drawer-route-title">
        <h3 id="drawer-route-title">Маршрут и подача</h3>
        <dl className="v19-submission-drawer-route-list">
          <div className={data.tripDates === 'Даты не указаны' ? 'is-missing' : undefined}>
            <Calendar aria-hidden="true" />
            <div><dt>Даты поездки</dt><dd>{data.tripDates}</dd></div>
          </div>
          <div>
            <MapPin aria-hidden="true" />
            <div><dt>Визовый центр подачи</dt><dd>{data.city}</dd></div>
          </div>
        </dl>
      </section>

      <section className="v19-submission-drawer-card v19-submission-drawer-overview-card" aria-labelledby="drawer-documents-title">
        <header>
          <h3 id="drawer-documents-title">Чеклист документов</h3>
          <span aria-label={`Готово документов: ${data.documents.filter((document) => document.status === 'done').length} из ${data.documents.length}`}>{data.documents.filter((document) => document.status === 'done').length}/{data.documents.length}</span>
        </header>
        <div className="v19-submission-drawer-document-list">
          {data.documents.length > 0 ? data.documents.slice(0, 4).map((doc, i) => (
            <div key={i} className={doc.status === 'done' ? 'is-ready' : undefined}>
              {doc.status === 'done' ? (
                <CheckCircle2 aria-hidden="true" />
              ) : (
                <i aria-hidden="true" />
              )}
              <span>{doc.label}</span>
            </div>
          )) : (
            <div className="v19-submission-drawer-empty is-compact">
              <FileDigit aria-hidden="true" />
              <span>Файлы ещё не добавлены</span>
              <small>Проверьте состав пакета во вкладке «Файлы».</small>
            </div>
          )}
        </div>
      </section>
    </div>

    <section className="v19-submission-drawer-participants" aria-labelledby="drawer-participants-title">
      <div className="v19-submission-drawer-participants-head">
        <h3 id="drawer-participants-title">Участники ({data.applicantsCount})</h3>
        <span>Ответственный: <strong>{data.owner}</strong></span>
      </div>
      <div className="v19-submission-drawer-participant-grid">
        {data.applicants.map((applicant) => (
          <article className="v19-submission-drawer-participant" key={applicant.name}>
            <span className="v19-submission-drawer-avatar" aria-hidden="true">
              {applicant.name.split(' ').filter(Boolean).slice(0, 2).map((part) => part[0]).join('') || '—'}
            </span>
            <span className="v19-submission-drawer-participant-copy">
              <strong>{applicant.name}</strong>
              <small>{applicant.role}</small>
            </span>
            <span className="v19-submission-drawer-participant-progress">{applicant.completeness}%</span>
          </article>
        ))}
      </div>
    </section>
  </div>
  );
};

const ApplicantsTab = ({ data }: { data: SubmissionDetail }) => (
  <section className="v19-submission-drawer-stack" aria-labelledby="drawer-applicants-title">
    <div className="v19-submission-drawer-section-head">
      <div>
        <h3 id="drawer-applicants-title">Заявители</h3>
        <p>Состав подачи и готовность анкеты каждого участника.</p>
      </div>
      <span className="v19-submission-drawer-count">{data.applicantsCount}</span>
    </div>
    <div className="v19-submission-drawer-applicants">
      {data.applicants.map((applicant) => (
        <article className="v19-submission-drawer-applicant" key={applicant.name}>
          <span className="v19-submission-drawer-avatar" aria-hidden="true">
            {applicant.name.split(' ').map((part) => part[0]).join('').slice(0, 2)}
          </span>
          <div>
            <strong>{applicant.name}</strong>
            <small>{applicant.role}</small>
          </div>
          <div className="v19-submission-drawer-progress" aria-label={`Готовность анкеты ${applicant.completeness}%`}>
            <span>{applicant.completeness}%</span>
            <i><b style={{ width: `${applicant.completeness}%` }} /></i>
          </div>
        </article>
      ))}
    </div>
  </section>
);

const QuestionnaireTab = ({ data, onOpenQuestionnaire }: { data: SubmissionDetail; onOpenQuestionnaire?: () => void }) => {
  const presentation = agentQuestionnaireStatusPresentation(data.status);
  const ActionIcon = presentation.canEdit ? Edit3 : FileText;

  return (
    <div className="v19-submission-drawer-stack">
      <div className="v19-submission-drawer-section-head">
        <div>
          <h3>Анкета</h3>
          <p>{presentation.drawerDescription}</p>
        </div>
        {onOpenQuestionnaire ? (
          <button className="v19-submission-drawer-secondary" onClick={onOpenQuestionnaire} type="button">
            <ActionIcon className="w-4 h-4" /> {presentation.drawerActionLabel}
          </button>
        ) : null}
      </div>
      <div className="v19-submission-drawer-questionnaires">
        {data.applicants.map((applicant) => (
          <article
            className="v19-submission-drawer-questionnaire"
            key={applicant.name}
          >
            <span className="v19-submission-drawer-avatar" aria-hidden="true"><User /></span>
            <span>
              <strong>{applicant.name}</strong>
              <small>{applicant.completeness === 100 ? 'Анкета заполнена' : 'Требуется продолжить заполнение'}</small>
            </span>
            <span className="v19-submission-drawer-progress is-inline">
              <span>{applicant.completeness}%</span>
              <i><b style={{ width: `${applicant.completeness}%` }} /></i>
            </span>
          </article>
        ))}
      </div>
    </div>
  );
};

const FilesTab = ({ data, onOpenDocuments }: { data: SubmissionDetail; onOpenDocuments?: () => void }) => {
  const readyCount = data.documents.filter((document) => document.status === 'done').length;
  const hasPendingDocuments = readyCount < data.documents.length;
  return (
    <section className="v19-submission-drawer-stack" aria-labelledby="drawer-files-title">
      <div className="v19-submission-drawer-section-head">
        <div>
          <h3 id="drawer-files-title">Файлы подачи</h3>
          <p>Пакет документов сгруппирован по текущей подаче.</p>
        </div>
        <span className="v19-submission-drawer-count">{readyCount}/{data.documents.length}</span>
      </div>
      {hasPendingDocuments && onOpenDocuments ? (
        <button className="v19-submission-drawer-secondary" onClick={onOpenDocuments} type="button">
          Открыть в «Моих подачах»
        </button>
      ) : null}
      {data.documents.length > 0 ? (
        <div className="v19-submission-drawer-files">
          {data.documents.map((document, index) => (
            <article className="v19-submission-drawer-file" key={`${document.label}-${index}`}>
              <span className="v19-submission-drawer-file-icon"><FileText aria-hidden="true" /></span>
              <div><strong>{document.label}</strong><small>{document.applicantName}</small></div>
              <span className={`v19-submission-drawer-file-state ${document.status === 'done' ? 'is-ready' : ''}`}>
                {document.status === 'done' ? 'Готов' : 'Требуется файл'}
              </span>
            </article>
          ))}
        </div>
      ) : (
        <div className="v19-submission-drawer-empty">
          <FileDigit aria-hidden="true" />
          <strong>Файлы ещё не добавлены</strong>
          <p>Состав пакета появится здесь после загрузки документов в «Моих подачах».</p>
          {onOpenDocuments ? (
            <button className="v19-submission-drawer-secondary" onClick={onOpenDocuments} type="button">
              Открыть в «Моих подачах»
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
};

function getIssuesEmptyCopy(status: SubmissionStatus) {
  if (status === 'draft' || status === 'in_progress') {
    return { title: 'Замечаний пока нет', description: 'Подача ещё не отправлялась на проверку.', stage: 'До первой проверки', tone: 'awaiting' };
  }
  if (status === 'submitted_for_review' || status === 'corrections_received') {
    return { title: 'Проверка продолжается', description: 'Открытых замечаний пока нет.', stage: 'На проверке', tone: 'review' };
  }
  if (status === 'ready_for_export' || status === 'exported') {
    return { title: 'Открытых замечаний нет', description: 'Проверка завершена, подача готова к следующему этапу.', stage: 'Проверка завершена', tone: 'complete' };
  }
  return { title: 'Открытых замечаний нет', description: 'Все замечания исправлены или закрыты.', stage: 'Все задачи закрыты', tone: 'complete' };
}

const IssuesTab = ({
  data,
  onOpenDocuments,
  onOpenQuestionnaire,
}: {
  data: SubmissionDetail;
  onOpenDocuments?: () => void;
  onOpenQuestionnaire?: () => void;
}) => {
  const presentation = agentQuestionnaireStatusPresentation(data.status);
  const emptyCopy = getIssuesEmptyCopy(data.status);
  const openIssues = data.issues.filter((issue) => issue.status === 'open').length;
  const fixedIssues = data.issues.filter((issue) => issue.status === 'fixed_by_agent').length;
  const issuesSummary = presentation.canEdit
    ? `Требуют исправления: ${openIssues}`
    : data.status === 'corrections_received'
      ? `Исправления на проверке: ${fixedIssues}`
      : 'Проверяет администратор';
  const lockedIssueLabel = data.status === 'corrections_received'
    ? 'Исправления отправлены'
    : 'Проверяет администратор';
  return (
  <div className="v19-submission-drawer-issues">
    <div className="v19-submission-drawer-issues-heading">
      <div>
        <h3>Список задач по замечаниям</h3>
        <p>
          {presentation.canEdit
            ? data.status === 'draft' || data.status === 'in_progress'
              ? 'Задачи появятся после первой проверки администратором'
              : 'Замечания, выявленные администратором при проверке'
            : presentation.drawerDescription}
        </p>
      </div>
      <div className="v19-submission-drawer-issues-count">
        {issuesSummary}
      </div>
    </div>

    {data.issues.length > 0 ? (
      <div className="space-y-4">
        {data.issues.map((issue) => (
          <div key={issue.id} className="p-4 bg-[#1a1a1d] border border-white/10 rounded-xl relative overflow-hidden flex flex-col sm:flex-row gap-4">
            <div className="absolute top-0 left-0 w-1 h-full bg-[#24242a]" />
            <div className="w-10 h-10 rounded-full bg-white/[0.045] flex items-center justify-center shrink-0 border border-white/10">
              {issue.type === 'file' || issue.type === 'media'
                ? <ImageIcon className="w-5 h-5 text-white/62" />
                : <FileText className="w-5 h-5 text-white/62" />}
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="text-[14px] font-semibold text-white">{issue.reason}</h4>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#2a1d20]/70 text-[#d59aa3] font-medium">{issue.severity === 'blocker' ? 'Blocker' : 'Замечание'}</span>
              </div>
              <div className="text-[11px] font-medium text-white/55 uppercase tracking-wider mb-2">{[issue.target.applicantName, issue.target.section, issue.target.field].filter(Boolean).join(' • ')}</div>
              <p className="text-[13px] text-white/60 leading-relaxed max-w-xl">{issue.comment}</p>
            </div>
            {presentation.canEdit && issue.status === 'open' && (issue.type === 'field' || issue.type === 'section') && onOpenQuestionnaire ? <div className="sm:w-[180px] shrink-0 flex items-center">
              <button 
                onClick={onOpenQuestionnaire}
                className="w-full h-10 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[13px] font-medium text-white transition-colors"
                type="button"
              >
                Исправить в анкете
              </button>
            </div> : null}
            {presentation.canEdit && issue.status === 'open' && (issue.type === 'file' || issue.type === 'media') && onOpenDocuments ? <div className="sm:w-[180px] shrink-0 flex items-center">
              <button
                onClick={onOpenDocuments}
                className="w-full h-10 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[13px] font-medium text-white transition-colors"
                type="button"
              >
                Исправить файл
              </button>
            </div> : null}
            {!presentation.canEdit ? (
              <div className="sm:w-[180px] shrink-0 flex items-center">
                <span className="v19-submission-drawer-file-state is-ready" role="status">
                  {lockedIssueLabel}
                </span>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    ) : (
      <section className={`v19-submission-drawer-issues-empty is-${emptyCopy.tone}`} aria-labelledby="drawer-issues-empty-title">
        <div className="v19-submission-drawer-issues-empty-icon" aria-hidden="true">
          {emptyCopy.tone === 'awaiting' || emptyCopy.tone === 'review' ? <Clock /> : <CheckCircle2 />}
        </div>
        <span className="v19-submission-drawer-issues-empty-stage" role="status">{emptyCopy.stage}</span>
        <h4 id="drawer-issues-empty-title">{emptyCopy.title}</h4>
        <p>{emptyCopy.description}</p>
      </section>
    )}
  </div>
);
};


function detailFromCanonicalSubmission(submission: CanonicalSubmission): SubmissionDetail {
  return {
    id: submissionPublicId(submission),
    title: submission.listTitle ?? submission.title,
    type: submission.type,
    applicantsCount: submission.applicants.length,
    applicants: submission.applicants.map((applicant) => ({
      name: applicant.fullName,
      role: applicant.role === 'main' ? 'Основной' : applicant.role === 'spouse' ? 'Супруг(а)' : applicant.role === 'child' ? 'Ребёнок' : 'Заявитель',
      status: applicant.questionnaireStatus,
      completeness: applicant.sections.length
        ? Math.round((applicant.sections.filter((section) => section.status === 'complete').length / applicant.sections.length) * 100)
        : submission.completeness.questionnaire,
    })),
    city: questionnaireCityForSubmission(submission),
    tripDates: tripDatesLabel(submission.tripDateFrom, submission.tripDateTo),
    status: submission.status === 'requires_action' ? 'returned' : submission.status,
    completeness: submission.completeness.total,
    updated: updatedLabel(submission.updatedAt),
    owner: agentDisplayName(submission.agentId),
    issuesCount: submission.issues.filter((issue) => issue.status !== 'closed_by_admin').length,
    documents: submission.files.map((file) => ({
      applicantName: submission.applicants.find((applicant) => applicant.id === file.applicantId)?.fullName ?? 'Подача',
      label: fileTypeLabels[file.type],
      status: file.status === 'accepted' ? 'done' : 'pending',
    })),
    issues: submission.issues.filter((issue) => issue.status !== 'closed_by_admin'),
    history: submission.history,
    isDemo: false,
  };
}

const HistoryTab = ({ data }: { data: SubmissionDetail }) => data.history.length > 0 ? (
  <ol className="v19-submission-drawer-history" aria-label="История подачи">
    {data.history.map((event) => {
      const presentation = historyPresentation(event);
      const EventIcon = presentation.icon;
      return (
        <li key={event.id} className={`v19-submission-drawer-history-item is-${presentation.tone}`}>
          <div className="v19-submission-drawer-history-icon" aria-hidden="true">
            <EventIcon />
          </div>
          <div className="v19-submission-drawer-history-copy">
            <span className="v19-submission-drawer-history-label">{presentation.label}</span>
            <strong>{event.text}</strong>
            {event.detail || event.note ? <p>{event.detail || event.note}</p> : null}
            <div className="v19-submission-drawer-history-meta">
              <time>{updatedLabel(event.createdAt || event.at)}</time>
              <i aria-hidden="true" />
              <span>{event.actorId || (event.source === 'system' ? 'Система' : 'Оператор')}</span>
            </div>
          </div>
        </li>
      );
    })}
  </ol>
) : (
  <div className="v19-submission-drawer-empty">
    <History aria-hidden="true" />
    <strong>История пока пуста</strong>
    <p>{data.isDemo ? 'История недоступна в демо-данных.' : 'События по подаче пока не загружены.'}</p>
  </div>
);

// --- Main Drawer Component ---
export function Drawer({
  initialTab = 'overview',
  isOpen,
  onClose,
  submissionId,
  submission,
  allowDemoFallback = false,
  onOpenQuestionnaire,
  onOpenDocuments,
  onSubmissionAction,
}: DrawerProps) {
  const bridge = useVisaflowBusinessBridge();
  const [activeTab, setActiveTab] = useState<TabId>(initialTab);
  const [status, setStatus] = useState<DrawerState>('idle');
  const [data, setData] = useState<SubmissionDetail | null>(null);
  const [actionError, setActionError] = useState('');
  const [actionPending, setActionPending] = useState(false);
  const [isMoreMenuOpen, setIsMoreMenuOpen] = useState(false);
  const actionPendingRef = useRef(false);
  const actionRequestIdRef = useRef(0);
  const drawerRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const moreMenuRef = useRef<HTMLDivElement>(null);
  const moreMenuButtonRef = useRef<HTMLButtonElement>(null);
  const isDesktop = useDrawerDesktopQuery();
  const prefersReducedMotion = Boolean(useReducedMotion());

  useEffect(() => {
    if (!isOpen) return;
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const frame = window.requestAnimationFrame(() => drawerRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = previousOverflow;
      if (previouslyFocusedRef.current?.isConnected) previouslyFocusedRef.current.focus();
    };
  }, [isOpen]);

  // Canonical data first, mock fallback second. This keeps the restored screen usable
  // without making mock state a source of truth.
  useEffect(() => {
    if (isOpen && submissionId) {
      actionRequestIdRef.current += 1;
      setStatus('loading');
      setActiveTab(initialTab);
      setActionError('');
      setActionPending(false);
      setIsMoreMenuOpen(false);
      actionPendingRef.current = false;

      if (submission) {
        setData(detailFromCanonicalSubmission(submission));
        setStatus('success');
        return;
      }

      if (!allowDemoFallback) {
        setData(null);
        setStatus('error');
        return;
      }

      setData({
          id: submissionId,
          title: submissionId === 'SUB-1042' || submissionId.startsWith('SUB-FAM') || submissionId.startsWith('FAM') || submissionId === 'SUB-1088' ? "Семья Петровых" : "Алина Смирнова",
          type: submissionId === 'SUB-1042' || submissionId.startsWith('SUB-FAM') || submissionId.startsWith('FAM') || submissionId === 'SUB-1088' ? 'family' : 'single',
          applicantsCount: submissionId === 'SUB-1042' || submissionId.startsWith('SUB-FAM') || submissionId.startsWith('FAM') || submissionId === 'SUB-1088' ? 4 : 1,
          applicants: submissionId === 'SUB-1042' || submissionId.startsWith('SUB-FAM') || submissionId.startsWith('FAM') || submissionId === 'SUB-1088' ? [
            { name: 'Иван Петров', role: 'Основной', status: 'ready', completeness: 90 },
            { name: 'Анна Петрова', role: 'Супруга', status: 'ready', completeness: 100 },
            { name: 'Максим Петров', role: 'Ребенок', status: 'ready', completeness: 100 },
            { name: 'Мария Петрова', role: 'Ребенок', status: 'ready', completeness: 100 }
          ] : [
            { name: 'Алина Смирнова', role: 'Основной', status: 'ready', completeness: 64 }
          ],
          city: "Москва (VFS Global)",
          tripDates: "18 авг – 02 сен 2026",
          status: submissionId === 'SUB-1042' ? 'returned' : 'in_progress',
          completeness: submissionId === 'SUB-1042' ? 92 : 64,
          updated: "12 мин назад",
          owner: "Татьяна Н.",
          issuesCount: 0,
          documents: [],
          issues: [],
          history: [],
          isDemo: true,
      });
      setStatus('success');
    } else if (!isOpen) {
      actionRequestIdRef.current += 1;
      actionPendingRef.current = false;
      setStatus('idle');
    }
  }, [allowDemoFallback, initialTab, isOpen, submission, submissionId]);

  const tabs: { id: TabId; label: string; getCount?: (d: SubmissionDetail) => number; isWarning?: boolean; tone: string }[] = [
    { id: 'overview', label: 'Обзор', tone: 'overview' },
    { id: 'applicants', label: 'Заявители', getCount: (d) => d.applicantsCount, tone: 'applicants' },
    { id: 'questionnaire', label: 'Анкета', tone: 'questionnaire' },
    { id: 'files', label: 'Файлы', getCount: (d) => d.documents.length, tone: 'files' },
    { id: 'issues', label: 'Замечания', getCount: (d) => d.issuesCount, isWarning: true, tone: 'issues' },
    { id: 'history', label: 'История', tone: 'history' }
  ];
  const primaryTabs = tabs.filter((tab) => mobilePrimaryTabIds.includes(tab.id));
  const additionalTabs = tabs.filter((tab) => !mobilePrimaryTabIds.includes(tab.id));
  const activeTabDefinition = tabs.find((tab) => tab.id === activeTab);
  const activeAdditionalTab = additionalTabs.find((tab) => tab.id === activeTab);

  useEffect(() => {
    if (!isOpen || status !== 'success') return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(drawerTabId(activeTab))?.scrollIntoView?.({
        block: 'nearest',
        inline: 'nearest',
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [activeTab, isOpen, status]);

  useEffect(() => {
    if (!isOpen || isDesktop) setIsMoreMenuOpen(false);
  }, [isDesktop, isOpen]);

  useEffect(() => {
    if (!isMoreMenuOpen) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node)) return;
      if (moreMenuRef.current?.contains(target) || moreMenuButtonRef.current?.contains(target)) return;
      setIsMoreMenuOpen(false);
    };
    document.addEventListener('pointerdown', closeOnOutsidePointer);
    return () => document.removeEventListener('pointerdown', closeOnOutsidePointer);
  }, [isMoreMenuOpen]);

  const focusMoreMenuButton = () => {
    window.requestAnimationFrame(() => moreMenuButtonRef.current?.focus());
  };

  const closeMoreMenu = (restoreFocus = false) => {
    setIsMoreMenuOpen(false);
    if (restoreFocus) focusMoreMenuButton();
  };

  const openMoreMenu = (moveFocus = false) => {
    setIsMoreMenuOpen(true);
    if (!moveFocus) return;
    const firstTab = activeAdditionalTab ?? additionalTabs[0];
    window.requestAnimationFrame(() => document.getElementById(drawerMobileTabId(firstTab.id))?.focus());
  };

  const selectMobileTab = (tabId: TabId, restoreMoreMenuFocus = false) => {
    setActiveTab(tabId);
    setIsMoreMenuOpen(false);
    window.requestAnimationFrame(() => {
      if (restoreMoreMenuFocus) {
        moreMenuButtonRef.current?.focus();
        return;
      }
      document.getElementById(drawerMobileTabId(tabId))?.focus();
    });
  };

  const handleDrawerKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
      if (isMoreMenuOpen) {
        event.preventDefault();
        event.stopPropagation();
        closeMoreMenu(true);
        return;
      }
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const focusable = Array.from(
      drawerRef.current?.querySelectorAll<HTMLElement>(drawerFocusableSelector) ?? [],
    ).filter((element) => !element.hasAttribute('disabled') && element.getAttribute('aria-hidden') !== 'true');
    if (!focusable.length) {
      event.preventDefault();
      drawerRef.current?.focus();
      return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const handleTabsKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const currentIndex = tabs.findIndex((tab) => tab.id === activeTab);
    let nextIndex = currentIndex;
    if (event.key === 'ArrowRight') nextIndex = (currentIndex + 1) % tabs.length;
    else if (event.key === 'ArrowLeft') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = tabs.length - 1;
    else return;
    event.preventDefault();
    const nextTab = tabs[nextIndex].id;
    setActiveTab(nextTab);
    window.requestAnimationFrame(() => document.getElementById(drawerTabId(nextTab))?.focus());
  };

  const handleMobilePrimaryTabsKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const focusedIndex = primaryTabs.findIndex(
      (tab) => drawerMobileTabId(tab.id) === document.activeElement?.id,
    );
    if (focusedIndex < 0) return;
    let nextIndex = focusedIndex;
    if (event.key === 'ArrowRight') nextIndex = (focusedIndex + 1) % primaryTabs.length;
    else if (event.key === 'ArrowLeft') nextIndex = (focusedIndex - 1 + primaryTabs.length) % primaryTabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = primaryTabs.length - 1;
    else return;
    event.preventDefault();
    selectMobileTab(primaryTabs[nextIndex].id);
  };

  const handleAdditionalTabsKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    const focusedIndex = additionalTabs.findIndex(
      (tab) => drawerMobileTabId(tab.id) === document.activeElement?.id,
    );
    if (focusedIndex < 0) return;
    let nextIndex = focusedIndex;
    if (event.key === 'ArrowDown' || event.key === 'ArrowRight') nextIndex = (focusedIndex + 1) % additionalTabs.length;
    else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') nextIndex = (focusedIndex - 1 + additionalTabs.length) % additionalTabs.length;
    else if (event.key === 'Home') nextIndex = 0;
    else if (event.key === 'End') nextIndex = additionalTabs.length - 1;
    else return;
    event.preventDefault();
    const nextTab = additionalTabs[nextIndex].id;
    setActiveTab(nextTab);
    window.requestAnimationFrame(() => document.getElementById(drawerMobileTabId(nextTab))?.focus());
  };

  const handleAction = async (action: SubmissionAction) => {
    if (!submissionId || !submission || data?.isDemo || actionPendingRef.current) return;
    const payload = { submissionId, action, source: 'agent' as const };
    const requestId = ++actionRequestIdRef.current;
    setActionError('');
    setActionPending(true);
    actionPendingRef.current = true;

    try {
      if (onSubmissionAction) {
        await onSubmissionAction(submissionId, action);
      } else if (bridge.onSubmissionAction) {
        await bridge.onSubmissionAction(payload);
      } else {
        setActionError(
          'Действие недоступно: обработчик сохранения не подключён.',
        );
        return;
      }
      emitVisaflowUiEvent(bridge, { type: 'submission.action', payload });
    } catch {
      if (requestId !== actionRequestIdRef.current) return;
      setActionError(
        'Не удалось сохранить действие. Состояние подачи не изменено. Повторите попытку.',
      );
    } finally {
      if (requestId === actionRequestIdRef.current) {
        actionPendingRef.current = false;
        setActionPending(false);
      }
    }
  };

  // Dynamic Footer Actions
  const getFooterActions = () => {
    if (!data) return null;

    if (data.isDemo) {
      return (
        <button className="v19-submission-drawer-primary" disabled title="Демо-данные не меняют состояние подачи" type="button">
          Действия отключены
        </button>
      );
    }

    if (data.status === 'returned') {
      return (
        <button
          onClick={() => void handleAction('submit_corrections')}
          disabled={actionPending || (submission ? !actionGate(submission, 'submit_corrections', 'agent').ok : false)}
          title={submission ? actionGate(submission, 'submit_corrections', 'agent').reason : undefined}
          className="v19-submission-drawer-primary flex-1 sm:flex-none h-11 px-8 bg-[#24242a] hover:bg-[#2a2b32] disabled:bg-white/10 disabled:text-white/35 disabled:cursor-not-allowed text-white font-medium text-[14px] rounded-xl shadow-[0_0_28px_rgba(111,100,255,0.14)] transition-colors flex items-center justify-center gap-2"
        >
          <UploadCloud className="w-4 h-4" /> Отправить исправления
        </button>
      );
    }
    
    if (data.status === 'in_progress') {
      return (
        <button
          onClick={() => void handleAction('submit_for_review')}
          disabled={actionPending || (submission ? !actionGate(submission, 'submit_for_review', 'agent').ok : false)}
          title={submission ? actionGate(submission, 'submit_for_review', 'agent').reason : undefined}
          className="v19-submission-drawer-primary flex-1 sm:flex-none h-11 px-8 bg-[#6f64ff] hover:bg-[#4855d4] disabled:bg-white/10 disabled:text-white/35 disabled:cursor-not-allowed text-white font-medium text-[14px] rounded-xl shadow-[0_0_20px_rgba(58,69,180,0.3)] transition-colors flex items-center justify-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4" /> Отправить на проверку
        </button>
      );
    }

    if (data.status === 'submitted_for_review') {
      return (
        <button className="v19-submission-drawer-primary" disabled type="button">
          Отправлено на проверку
        </button>
      );
    }

    if (data.status === 'corrections_received') {
      return (
        <button className="v19-submission-drawer-primary" disabled type="button">
          Исправления на проверке
        </button>
      );
    }

    if (data.status === 'ready_for_export') {
      return (
        <button
          className="v19-submission-drawer-primary"
          onClick={() => setActiveTab('history')}
          title="Открыть историю принятой подачи"
          type="button"
        >
          <History className="w-4 h-4" /> Готово к выгрузке
        </button>
      );
    }

    return (
      <button
        onClick={() => void handleAction('save_progress')}
        disabled={actionPending || data.status === 'exported'}
        className="v19-submission-drawer-primary flex-1 sm:flex-none h-11 px-8 bg-white/10 hover:bg-white/15 disabled:bg-white/5 disabled:text-white/30 disabled:cursor-not-allowed text-white font-medium text-[14px] rounded-xl transition-colors"
      >
        {data.status === 'exported' ? 'Подача выгружена' : 'Сохранить прогресс'}
      </button>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={prefersReducedMotion ? drawerMotion.reduced : drawerMotion.overlay}
          className="v19-submission-drawer-backdrop fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            onClick={onClose}
          />
          
          <motion.div
            ref={drawerRef}
            role="dialog"
            aria-label={data ? `Подача ${data.id}` : 'Подача'}
            aria-modal="true"
            tabIndex={-1}
            onKeyDown={handleDrawerKeyDown}
            initial={drawerPanelInitial(isDesktop, prefersReducedMotion)}
            animate={{ x: 0, y: 0, opacity: 1 }}
            exit={drawerPanelExit(isDesktop, prefersReducedMotion)}
            transition={drawerPanelTransition(prefersReducedMotion)}
            className="v19-submission-drawer fixed z-50 flex flex-col bg-[#111113] border-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.6)]
              lg:inset-y-2 lg:right-2 lg:w-[840px] lg:rounded-2xl lg:border lg:overflow-hidden
              inset-x-0 bottom-0 top-12 rounded-t-[28px] border-t border-x overflow-y-auto"
            data-v19-agent-drawer="fallback"
          >
            {/* Mobile Header Drag */}
            <div className="lg:hidden sticky top-0 z-30 w-full flex items-center justify-center py-3 bg-[#111113]/90 backdrop-blur-md">
               <div className="w-12 h-1.5 rounded-full bg-white/20" />
            </div>

            {status === 'loading' && (
              <div className="flex-1 p-6 lg:p-8 flex flex-col pointer-events-none">
                <Skeleton className="w-48 h-5 mb-4" />
                <Skeleton className="w-3/4 max-w-[400px] h-8 mb-8" />
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mb-6">
                  <Skeleton className="h-[160px] w-full rounded-xl" />
                  <Skeleton className="h-[160px] w-full rounded-xl" />
                </div>
              </div>
            )}

            {status === 'error' && (
              <div className="v19-submission-drawer-unavailable" role="alert">
                <FileText aria-hidden="true" />
                <strong>Данные подачи недоступны</strong>
                <p>Не удалось сопоставить выбранную строку с актуальной подачей. Закройте окно и обновите список.</p>
                <button className="v19-submission-drawer-secondary" onClick={onClose} type="button">Закрыть</button>
              </div>
            )}

            {status === 'success' && data && (
              <>
                <header className="v19-submission-drawer-header px-5 lg:px-8 pt-4 pb-0 bg-[#111113]/95 backdrop-blur-md relative lg:sticky lg:top-0 z-20 shrink-0 border-b border-white/5">
                  <div className="v19-submission-drawer-titlebar flex items-start justify-between gap-4 mb-6">
                    <div className="v19-submission-drawer-titlecopy min-w-0">
                      <div className="v19-submission-drawer-identity flex items-center gap-2 text-[11px] lg:text-xs text-white/50 mb-2">
                        <span className="font-mono font-medium tracking-wider text-white/70">{data.id}</span>
                        <span className="w-1 h-1 rounded-full bg-white/20" />
                        <span className="uppercase tracking-wider">{data.type === 'family' ? 'Семейная' : 'Индивидуальная'}</span>
                        {data.isDemo ? <span aria-label="Демо-данные" className="v19-submission-drawer-demo-badge">Демо</span> : null}
                      </div>
                      <h2 className="v19-submission-drawer-title text-[24px] font-semibold text-white leading-tight tracking-tight mb-4">
                        {data.title}
                      </h2>
                      <div className="v19-submission-drawer-meta flex flex-wrap items-center gap-2.5">
                        <StatusBadge status={data.status} />
                        <span className="v19-submission-drawer-updated text-[12px] text-white/40 flex items-center gap-1.5"><Clock className="w-3 h-3" /> Обновлено {data.updated}</span>
                      </div>
                    </div>
                    
                    <button 
                      aria-label="Закрыть подачу"
                      onClick={onClose}
                      className="v19-submission-drawer-close flex w-10 h-10 shrink-0 items-center justify-center bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-xl transition-colors border border-white/5 hover:border-white/10"
                      type="button"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Tabs */}
                  <div className="v19-submission-drawer-tabs-scroll w-full -mx-5 px-5 lg:mx-0 lg:px-0">
                    <div className="v19-submission-drawer-mobile-tabs grid grid-cols-[minmax(0,1fr)_auto] items-center gap-1 pb-1 lg:hidden">
                      <div aria-label="Основные разделы подачи" className="grid min-w-0 grid-cols-3 items-center gap-1" onKeyDown={handleMobilePrimaryTabsKeyDown} role="tablist">
                        {primaryTabs.map((tab) => {
                          const count = tab.getCount ? tab.getCount(data) : 0;
                          const isActive = activeTab === tab.id;
                          return (
                            <button
                              aria-controls={drawerPanelId(tab.id)}
                              aria-selected={isActive}
                              data-testid={`submission-drawer-mobile-tab-${tab.id}`}
                              id={drawerMobileTabId(tab.id)}
                              key={tab.id}
                              onClick={() => selectMobileTab(tab.id)}
                              role="tab"
                              tabIndex={isActive ? 0 : -1}
                              type="button"
                              className={`v19-submission-drawer-tab v19-submission-drawer-mobile-tab is-${tab.tone} ${isActive ? 'is-active' : ''}`}
                            >
                              <span>{tab.label}</span>
                              {count > 0 && (
                                <span className={`v19-submission-drawer-tab-count ${tab.isWarning ? 'is-warning' : ''} shrink-0 rounded-md px-1.5 py-0.5 text-[10px] leading-none`}>
                                  {count}
                                </span>
                              )}
                              {isActive && (
                                <motion.div
                                  layoutId="drawerAgentMobileActiveTab"
                                  className="v19-submission-drawer-tab-indicator absolute bottom-0 inset-x-0 h-0.5 bg-white"
                                  initial={false}
                                  transition={drawerMotion.tabIndicator}
                                />
                              )}
                            </button>
                          );
                        })}
                      </div>

                      <div className="relative">
                        <button
                          aria-controls="submission-drawer-mobile-more-tabs"
                          aria-expanded={isMoreMenuOpen}
                          aria-label={activeAdditionalTab
                            ? `Дополнительные разделы подачи. Выбран раздел: ${activeAdditionalTab.label}`
                            : 'Открыть дополнительные разделы подачи'}
                          className={`v19-submission-drawer-mobile-more ${activeAdditionalTab ? 'is-active' : ''}`}
                          data-active-tab={activeAdditionalTab?.id}
                          data-testid="submission-drawer-mobile-more"
                          onClick={() => {
                            if (isMoreMenuOpen) closeMoreMenu();
                            else openMoreMenu();
                          }}
                          onKeyDown={(event) => {
                            if (event.key !== 'ArrowDown' && event.key !== 'Enter' && event.key !== ' ') return;
                            event.preventDefault();
                            openMoreMenu(true);
                          }}
                          ref={moreMenuButtonRef}
                          type="button"
                        >
                          Ещё <ChevronDown aria-hidden="true" className={`h-3.5 w-3.5 transition-transform ${isMoreMenuOpen ? 'rotate-180' : ''}`} />
                        </button>

                        {isMoreMenuOpen && (
                          <div
                            aria-label="Дополнительные разделы подачи"
                            className="v19-submission-drawer-mobile-more-menu"
                            data-testid="submission-drawer-mobile-more-menu"
                            id="submission-drawer-mobile-more-tabs"
                            onKeyDown={handleAdditionalTabsKeyDown}
                            ref={moreMenuRef}
                            role="tablist"
                          >
                            {additionalTabs.map((tab) => {
                              const count = tab.getCount ? tab.getCount(data) : 0;
                              const isActive = activeTab === tab.id;
                              return (
                                <button
                                  aria-controls={drawerPanelId(tab.id)}
                                  aria-selected={isActive}
                                  data-testid={`submission-drawer-mobile-tab-${tab.id}`}
                                  id={drawerMobileTabId(tab.id)}
                                  key={tab.id}
                                  onClick={() => selectMobileTab(tab.id, true)}
                                  role="tab"
                                  tabIndex={isActive ? 0 : -1}
                                  type="button"
                                  className={`v19-submission-drawer-tab v19-submission-drawer-mobile-more-tab is-${tab.tone} ${isActive ? 'is-active' : ''}`}
                                >
                                  <span>{tab.label}</span>
                                  {count > 0 && (
                                    <span className={`v19-submission-drawer-tab-count ${tab.isWarning ? 'is-warning' : ''} shrink-0 rounded-md px-1.5 py-0.5 text-[10px] leading-none`}>
                                      {count}
                                    </span>
                                  )}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    </div>

                    <div aria-label="Разделы подачи" className="v19-submission-drawer-tabs hidden w-max items-center gap-1.5 mb-[-1px] lg:flex" onKeyDown={handleTabsKeyDown} role="tablist">
                      {tabs.map(tab => {
                        const count = tab.getCount ? tab.getCount(data) : 0;
                        const isActive = activeTab === tab.id;
                        return (
                          <button
                            aria-controls={drawerPanelId(tab.id)}
                            aria-selected={isActive}
                            id={drawerTabId(tab.id)}
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            role="tab"
                            tabIndex={isActive ? 0 : -1}
                            type="button"
                            className={`v19-submission-drawer-tab is-${tab.tone} ${isActive ? 'is-active' : ''} relative min-h-[44px] px-4 text-[13px] font-medium transition-colors flex items-center gap-2 focus-visible:outline-none whitespace-nowrap
                              ${isActive ? 'text-white' : 'text-white/50 hover:text-white/80'}
                            `}
                          >
                            <span>{tab.label}</span>
                            {count > 0 && (
                              <span className={`v19-submission-drawer-tab-count ${tab.isWarning ? 'is-warning' : ''} px-1.5 py-0.5 rounded-md text-[10px] leading-none ml-1`}>
                                {count}
                              </span>
                            )}
                            {isActive && (
                              <motion.div
                                layoutId="drawerAgentActiveTab"
                                className="v19-submission-drawer-tab-indicator absolute bottom-0 inset-x-0 h-0.5 bg-white"
                                initial={false}
                                transition={drawerMotion.tabIndicator}
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </header>

                  <div className={`v19-submission-drawer-body is-${activeTab} lg:flex-1 lg:overflow-y-auto p-5 lg:p-8 scrollbar-thin scrollbar-thumb-white/10`}>
                  <AnimatePresence mode="wait">
                    <motion.div
                      aria-labelledby={drawerPanelLabelId(activeTab)}
                      id={drawerPanelId(activeTab)}
                      key={activeTab}
                      role="tabpanel"
                      initial={drawerTabInitial(prefersReducedMotion)}
                      animate={{ opacity: 1, y: 0 }}
                      exit={drawerTabExit(prefersReducedMotion)}
                      transition={prefersReducedMotion ? drawerMotion.reduced : drawerMotion.tab}
                    >
                      <span className="sr-only" id={drawerPanelLabelId(activeTab)}>{activeTabDefinition?.label}</span>
                      {activeTab === 'overview' && (
                        <OverviewTab
                          data={data}
                          onOpenDocuments={onOpenDocuments}
                          onOpenIssues={() => setActiveTab('issues')}
                          onOpenQuestionnaire={onOpenQuestionnaire}
                        />
                      )}
                      {activeTab === 'applicants' && <ApplicantsTab data={data} />}
                      {activeTab === 'questionnaire' && <QuestionnaireTab data={data} onOpenQuestionnaire={onOpenQuestionnaire} />}
                      {activeTab === 'files' && <FilesTab data={data} onOpenDocuments={onOpenDocuments} />}
                      {activeTab === 'issues' && (
                        <IssuesTab
                          data={data}
                          onOpenDocuments={onOpenDocuments}
                          onOpenQuestionnaire={onOpenQuestionnaire}
                        />
                      )}
                      {activeTab === 'history' && <HistoryTab data={data} />}
                    </motion.div>
                  </AnimatePresence>
                </div>

                <footer className="v19-submission-drawer-footer p-4 lg:px-8 lg:py-5 border-t border-white/10 bg-[#111113]/95 backdrop-blur-md shrink-0 flex flex-col sm:flex-row items-center justify-between gap-4 pb-[max(16px,env(safe-area-inset-bottom))] lg:sticky lg:bottom-0 z-20">
                  <div
                    className={`text-[12px] ${actionError ? 'text-[#ffadb4]' : 'hidden text-white/40 sm:block'}`}
                    role={actionError ? 'alert' : undefined}
                  >
                    {actionError || (actionPending
                      ? 'Сохраняем действие…'
                      : data.isDemo
                        ? 'Демо-данные не меняют состояние подачи.'
                      : data.status === 'returned'
                        ? 'Исправьте замечания перед повторной отправкой.'
                        : 'Проверьте все данные перед отправкой администратору.')}
                  </div>
                  <div className="v19-submission-drawer-footer-actions flex gap-3 w-full sm:w-auto">
                    <button onClick={onClose} className="flex-1 sm:flex-none h-11 px-5 bg-transparent hover:bg-white/5 text-white/70 hover:text-white font-medium text-[14px] rounded-xl transition-colors">
                      Отмена
                    </button>
                    {getFooterActions()}
                  </div>
                </footer>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
