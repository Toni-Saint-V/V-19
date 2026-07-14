import { useState, useEffect, useRef, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { emitVisaflowUiEvent, useVisaflowBusinessBridge } from '../integration/visaflowBusinessBridge';
import type { Submission as CanonicalSubmission, SubmissionAction } from '../modules/submissions/types';
import { actionGate } from './v19BusinessScreenAdapter';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, CheckCircle2, AlertCircle, Clock, FileText, User,
  Calendar, MapPin, FileDigit, UploadCloud,
  ShieldAlert, Edit3, Image as ImageIcon, History
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

interface DrawerProps {
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
const drawerPanelId = (tab: TabId) => `submission-drawer-panel-${tab}`;

// --- Utility Hooks ---
function useMediaQuery(query: string) {
  const [matches, setMatches] = useState(
    typeof window !== 'undefined' ? window.matchMedia(query).matches : true
  );

  useEffect(() => {
    const media = window.matchMedia(query);
    const listener = (e: MediaQueryListEvent) => setMatches(e.matches);
    media.addEventListener('change', listener);
    return () => media.removeEventListener('change', listener);
  }, [query]);

  return matches;
}

// --- Helper Components ---
const Skeleton = ({ className }: { className?: string }) => (
  <div className={`bg-white/5 animate-pulse rounded-[10px] ${className}`} />
);

const StatusBadge = ({ status }: { status: SubmissionStatus }) => {
  switch (status) {
    case 'in_progress':
      return <span className="v19-submission-drawer-status inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.045] border border-white/10 text-[#b8baff] text-[11px] font-medium uppercase tracking-wide"><Clock className="w-3.5 h-3.5" /> В работе</span>;
    case 'returned':
      return <span className="v19-submission-drawer-status inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.045] border border-white/10 text-white/62 text-[11px] font-medium uppercase tracking-wide"><AlertCircle className="w-3.5 h-3.5" /> Возвращено (Ошибки)</span>;
    case 'submitted_for_review':
      return <span className="v19-submission-drawer-status inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#6f64ff]/20 border border-[#6f64ff]/30 text-[#b8baff] text-[11px] font-medium uppercase tracking-wide"><ShieldAlert className="w-3.5 h-3.5" /> На проверке</span>;
    case 'ready_for_export':
      return <span className="v19-submission-drawer-status inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.045] border border-white/10 text-[#b8baff] text-[11px] font-medium uppercase tracking-wide"><CheckCircle2 className="w-3.5 h-3.5" /> Готово к выгрузке</span>;
    default:
      return <span className="v19-submission-drawer-status inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white/70 text-[11px] font-medium uppercase tracking-wide"><FileText className="w-3.5 h-3.5" /> Черновик</span>;
  }
};

// --- Sub-components for Tabs ---
const OverviewTab = ({ data }: { data: SubmissionDetail }) => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="v19-submission-drawer-card bg-white/[0.02] border border-white/5 rounded-xl p-5 hover:border-white/10 transition-colors">
        <h3 className="text-[11px] font-medium text-white/40 uppercase tracking-wider mb-5">Маршрут и подача</h3>
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
              <div className="text-white/40 text-[11px] mt-0.5">Визовый центр подачи</div>
            </div>
          </div>
        </div>
      </div>

      <div className="v19-submission-drawer-card bg-white/[0.02] border border-white/5 rounded-xl p-5 hover:border-white/10 transition-colors flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[11px] font-medium text-white/40 uppercase tracking-wider">Чеклист документов</h3>
          <span className="text-[11px] font-mono text-[#b8baff] font-medium bg-white/[0.045] px-2 py-0.5 rounded-md">{data.documents.filter((document) => document.status === 'done').length}/{data.documents.length}</span>
        </div>
        <div className="space-y-3 flex-1 flex flex-col justify-center">
          {data.documents.length > 0 ? data.documents.slice(0, 4).map((doc, i) => (
            <div key={i} className="flex items-center gap-3">
              {doc.status === 'done' ? (
                <CheckCircle2 className="w-4 h-4 text-[#b8baff]" />
              ) : (
                <div className="w-4 h-4 rounded-full border border-white/20" />
              )}
              <span className={`text-[13px] ${doc.status === 'done' ? 'text-white/70' : 'text-white'}`}>{doc.label}</span>
            </div>
          )) : (
            <div className="v19-submission-drawer-empty is-compact">
              <FileDigit aria-hidden="true" />
              <span>Файлы ещё не добавлены</span>
              <small>Проверьте состав пакета во вкладке «Файлы».</small>
            </div>
          )}
        </div>
      </div>
    </div>

    <section className="v19-submission-drawer-summary" aria-label="Сводка по подаче">
      <div><span>Заявителей</span><strong>{data.applicantsCount}</strong></div>
      <div><span>Общая готовность</span><strong>{data.completeness}%</strong></div>
      <div><span>Ответственный</span><strong>{data.owner}</strong></div>
    </section>
  </div>
);

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

const QuestionnaireTab = ({ data, onOpenQuestionnaire }: { data: SubmissionDetail; onOpenQuestionnaire?: () => void }) => (
  <div className="v19-submission-drawer-stack">
    <div className="v19-submission-drawer-section-head">
      <div>
        <h3>Анкета</h3>
        <p>Проверьте готовность заявителей и продолжите заполнение в рабочей анкете.</p>
      </div>
      <button className="v19-submission-drawer-secondary" onClick={onOpenQuestionnaire} type="button">
        <Edit3 className="w-4 h-4" /> Открыть анкету
      </button>
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

const FilesTab = ({ data, onOpenDocuments }: { data: SubmissionDetail; onOpenDocuments?: () => void }) => {
  const readyCount = data.documents.filter((document) => document.status === 'done').length;
  return (
    <section className="v19-submission-drawer-stack" aria-labelledby="drawer-files-title">
      <div className="v19-submission-drawer-section-head">
        <div>
          <h3 id="drawer-files-title">Файлы подачи</h3>
          <p>Пакет документов сгруппирован по текущей подаче.</p>
        </div>
        <span className="v19-submission-drawer-count">{readyCount}/{data.documents.length}</span>
      </div>
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
          <p>Состав пакета появится здесь после загрузки документов в разделе «Сбор документов».</p>
          {onOpenDocuments ? (
            <button className="v19-submission-drawer-secondary" onClick={onOpenDocuments} type="button">
              Перейти к сбору документов
            </button>
          ) : null}
        </div>
      )}
    </section>
  );
};

function getIssuesEmptyCopy(status: SubmissionStatus) {
  if (status === 'draft' || status === 'in_progress') {
    return { title: 'Замечаний пока нет', description: 'Подача ещё не отправлялась на проверку.' };
  }
  if (status === 'submitted_for_review' || status === 'corrections_received') {
    return { title: 'Проверка продолжается', description: 'Открытых замечаний пока нет.' };
  }
  if (status === 'ready_for_export' || status === 'exported') {
    return { title: 'Открытых замечаний нет', description: 'Проверка завершена, подача готова к следующему этапу.' };
  }
  return { title: 'Открытых замечаний нет', description: 'Все замечания исправлены или закрыты.' };
}

const IssuesTab = ({ data, onOpenQuestionnaire }: { data: SubmissionDetail, onOpenQuestionnaire?: () => void }) => {
  const emptyCopy = getIssuesEmptyCopy(data.status);
  return (
  <div className="space-y-6">
    <div className="flex items-center justify-between border-b border-white/5 pb-4">
      <div>
        <h3 className="text-[16px] font-semibold text-white">Список задач по замечаниям</h3>
        <p className="text-[12px] text-white/50 mt-1">
          {data.status === 'draft' || data.status === 'in_progress'
            ? 'Задачи появятся после первой проверки администратором'
            : 'Замечания, выявленные администратором при проверке'}
        </p>
      </div>
      <div className="px-3 py-1 bg-white/[0.045] text-white/62 rounded-lg text-[12px] font-medium border border-white/10">
        Требуют исправления: {data.issuesCount}
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
            {(issue.type === 'field' || issue.type === 'section') && onOpenQuestionnaire ? <div className="sm:w-[180px] shrink-0 flex items-center">
              <button 
                onClick={onOpenQuestionnaire}
                className="w-full h-10 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[13px] font-medium text-white transition-colors"
                type="button"
              >
                Исправить в анкете
              </button>
            </div> : null}
          </div>
        ))}
      </div>
    ) : (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 bg-white/[0.045] rounded-full flex items-center justify-center mb-4 border border-white/10">
          <CheckCircle2 className="w-8 h-8 text-[#b8baff]" />
        </div>
        <h4 className="text-[16px] font-semibold text-white mb-2">{emptyCopy.title}</h4>
        <p className="text-[13px] text-white/50 max-w-sm">{emptyCopy.description}</p>
      </div>
    )}
  </div>
  );
};


function detailFromCanonicalSubmission(submission: CanonicalSubmission): SubmissionDetail {
  return {
    id: submission.id,
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
    city: submission.city,
    tripDates: `${submission.tripDateFrom || 'не указано'} – ${submission.tripDateTo || 'не указано'}`,
    status: submission.status === 'requires_action' ? 'returned' : submission.status,
    completeness: submission.completeness.total,
    updated: new Date(submission.updatedAt).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }),
    owner: submission.agentId,
    issuesCount: submission.issues.filter((issue) => issue.status !== 'closed_by_admin').length,
    documents: submission.files.map((file) => ({
      applicantName: submission.applicants.find((applicant) => applicant.id === file.applicantId)?.fullName ?? 'Подача',
      label: file.originalFileName || file.generatedFileName || file.type.replaceAll('_', ' '),
      status: file.status === 'accepted' ? 'done' : 'pending',
    })),
    issues: submission.issues.filter((issue) => issue.status !== 'closed_by_admin'),
    history: submission.history,
    isDemo: false,
  };
}

const HistoryTab = ({ data }: { data: SubmissionDetail }) => data.history.length > 0 ? (
  <div className="relative pl-6 space-y-8 before:absolute before:inset-y-2 before:left-[31px] before:w-px before:bg-white/10">
    {data.history.map((event) => (
      <div key={event.id} className="relative flex gap-5">
        <div className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 bg-[#111113] z-10 border-white/10">
          <History className="w-4 h-4 text-white/60" />
        </div>
        <div className="pt-1.5">
          <div className="text-[14px] font-medium text-white/90">{event.text}</div>
          {event.detail || event.note ? <p className="text-[12px] text-white/50 mt-1">{event.detail || event.note}</p> : null}
          <div className="flex items-center gap-2 mt-1.5 text-[12px] text-white/40">
            <span>{new Date(event.createdAt || event.at).toLocaleString('ru-RU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <span>{event.actorId || (event.source === 'system' ? 'Система' : 'Оператор')}</span>
          </div>
        </div>
      </div>
    ))}
  </div>
) : (
  <div className="v19-submission-drawer-empty">
    <History aria-hidden="true" />
    <strong>История пока пуста</strong>
    <p>{data.isDemo ? 'История недоступна в демо-данных.' : 'События по подаче пока не загружены.'}</p>
  </div>
);

// --- Main Drawer Component ---
export function Drawer({
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
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [status, setStatus] = useState<DrawerState>('idle');
  const [data, setData] = useState<SubmissionDetail | null>(null);
  const [actionError, setActionError] = useState('');
  const [actionPending, setActionPending] = useState(false);
  const actionPendingRef = useRef(false);
  const actionRequestIdRef = useRef(0);
  const drawerRef = useRef<HTMLDivElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  useEffect(() => {
    if (!isOpen) return;
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    document.body.style.overflow = 'hidden';
    const frame = window.requestAnimationFrame(() => drawerRef.current?.focus());
    return () => {
      window.cancelAnimationFrame(frame);
      document.body.style.overflow = '';
      if (previouslyFocusedRef.current?.isConnected) previouslyFocusedRef.current.focus();
    };
  }, [isOpen]);

  // Canonical data first, mock fallback second. This keeps the restored screen usable
  // without making mock state a source of truth.
  useEffect(() => {
    if (isOpen && submissionId) {
      actionRequestIdRef.current += 1;
      setStatus('loading');
      setActiveTab('overview');
      setActionError('');
      setActionPending(false);
      actionPendingRef.current = false;

      const timer = setTimeout(() => {
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
      }, submission ? 80 : 400);

      return () => clearTimeout(timer);
    } else if (!isOpen) {
      actionRequestIdRef.current += 1;
      actionPendingRef.current = false;
      const resetTimer = setTimeout(() => setStatus('idle'), 300);
      return () => clearTimeout(resetTimer);
    }
  }, [allowDemoFallback, isOpen, submission, submissionId]);

  const tabs: { id: TabId; label: string; getCount?: (d: SubmissionDetail) => number; isWarning?: boolean }[] = [
    { id: 'overview', label: 'Обзор' },
    { id: 'applicants', label: 'Заявители', getCount: (d) => d.applicantsCount },
    { id: 'questionnaire', label: 'Анкета' },
    { id: 'files', label: 'Файлы', getCount: (d) => d.documents.length },
    { id: 'issues', label: 'Замечания', getCount: (d) => d.issuesCount, isWarning: true },
    { id: 'history', label: 'История' }
  ];

  useEffect(() => {
    if (!isOpen) return;
    document.getElementById(drawerTabId(activeTab))?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [activeTab, isOpen]);

  const handleDrawerKeyDown = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') {
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

    return (
      <button
        onClick={() => data.status === 'draft' ? void handleAction('save_progress') : undefined}
        disabled={actionPending || data.status === 'exported'}
        className="v19-submission-drawer-primary flex-1 sm:flex-none h-11 px-8 bg-white/10 hover:bg-white/15 disabled:bg-white/5 disabled:text-white/30 disabled:cursor-not-allowed text-white font-medium text-[14px] rounded-xl transition-colors"
      >
        {data.status === 'exported' ? 'Подача выгружена' : data.status === 'draft' ? 'Сохранить прогресс' : 'Сохранить черновик'}
      </button>
    );
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.25 }}
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
            initial={{ x: isDesktop ? '100%' : 0, y: isDesktop ? 0 : '100%', opacity: 0.5 }}
            animate={{ x: 0, y: 0, opacity: 1 }}
            exit={{ x: isDesktop ? '100%' : 0, y: isDesktop ? 0 : '100%', opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 240, mass: 0.8 }}
            className="v19-submission-drawer fixed z-50 flex flex-col bg-[#111113] border-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.6)]
              lg:inset-y-2 lg:right-2 lg:w-[840px] lg:rounded-2xl lg:border lg:overflow-hidden
              inset-x-0 bottom-0 top-12 rounded-t-[28px] border-t border-x overflow-y-auto"
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
                  <div className="flex items-start justify-between gap-4 mb-6">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-[11px] lg:text-xs text-white/50 mb-2">
                        <span className="font-mono font-medium tracking-wider text-white/70">{data.id}</span>
                        <span className="w-1 h-1 rounded-full bg-white/20" />
                        <span className="uppercase tracking-wider">{data.type === 'family' ? 'Семейная' : 'Индивидуальная'}</span>
                        {data.isDemo ? <span aria-label="Демо-данные" className="v19-submission-drawer-demo-badge">Демо</span> : null}
                      </div>
                      <h2 className="text-[24px] font-semibold text-white leading-tight tracking-tight mb-4">
                        {data.title}
                      </h2>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <StatusBadge status={data.status} />
                        <span className="v19-submission-drawer-updated text-[12px] text-white/40 flex items-center gap-1.5"><Clock className="w-3 h-3" /> Обновлено {data.updated}</span>
                      </div>
                    </div>
                    
                    <button 
                      aria-label="Закрыть подачу"
                      onClick={onClose}
                      className="flex w-10 h-10 shrink-0 items-center justify-center bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-xl transition-colors border border-white/5 hover:border-white/10"
                      type="button"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Tabs */}
                  <div className="v19-submission-drawer-tabs-scroll w-full overflow-x-auto scrollbar-hide -mx-5 px-5 lg:mx-0 lg:px-0">
                    <div aria-label="Разделы подачи" className="flex items-center gap-1.5 w-max mb-[-1px]" onKeyDown={handleTabsKeyDown} role="tablist">
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
                            className={`relative min-h-[44px] px-4 text-[13px] font-medium transition-colors flex items-center gap-2 focus-visible:outline-none whitespace-nowrap
                              ${isActive ? 'text-white' : 'text-white/50 hover:text-white/80'}
                            `}
                          >
                            <span>{tab.label}</span>
                            {count > 0 && (
                              <span className={`px-1.5 py-0.5 rounded-md text-[10px] leading-none ml-1 ${tab.isWarning ? 'bg-white/[0.06] text-white/62' : 'bg-white/10 text-white/70'}`}>
                                {count}
                              </span>
                            )}
                            {isActive && (
                              <motion.div
                                layoutId="drawerAgentActiveTab"
                                className="absolute bottom-0 inset-x-0 h-0.5 bg-white"
                                initial={false}
                                transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                              />
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </header>

                  <div className="v19-submission-drawer-body lg:flex-1 lg:overflow-y-auto p-5 lg:p-8 scrollbar-thin scrollbar-thumb-white/10">
                  <AnimatePresence mode="wait">
                    <motion.div
                      aria-label={tabs.find((tab) => tab.id === activeTab)?.label}
                      aria-labelledby={drawerTabId(activeTab)}
                      id={drawerPanelId(activeTab)}
                      key={activeTab}
                      role="tabpanel"
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                    >
                      {activeTab === 'overview' && <OverviewTab data={data} />}
                      {activeTab === 'applicants' && <ApplicantsTab data={data} />}
                      {activeTab === 'questionnaire' && <QuestionnaireTab data={data} onOpenQuestionnaire={onOpenQuestionnaire} />}
                      {activeTab === 'files' && <FilesTab data={data} onOpenDocuments={onOpenDocuments} />}
                      {activeTab === 'issues' && <IssuesTab data={data} onOpenQuestionnaire={onOpenQuestionnaire} />}
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
                  <div className="flex gap-3 w-full sm:w-auto">
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
