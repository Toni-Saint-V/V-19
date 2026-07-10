import { useState, useEffect } from 'react';
import { emitVisaflowUiEvent, useVisaflowBusinessBridge } from '../integration/visaflowBusinessBridge';
import type { Submission as CanonicalSubmission, SubmissionAction } from '../modules/submissions/types';
import { actionGate } from './v19BusinessScreenAdapter';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, CheckCircle2, AlertCircle, Clock, FileText, User,
  Calendar, MapPin, FileDigit, UploadCloud,
  Briefcase, Plane, ShieldAlert, CreditCard, Edit3, Image as ImageIcon, History
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
}

interface DrawerProps {
  isOpen: boolean;
  onClose: () => void;
  submissionId: string | null;
  submission?: CanonicalSubmission;
  onOpenQuestionnaire?: () => void;
  onSubmissionAction?: (submissionId: string, action: SubmissionAction) => void | Promise<void>;
}

type TabId = 'overview' | 'questionnaire' | 'issues' | 'history';
type DrawerState = 'idle' | 'loading' | 'success' | 'error';

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
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.045] border border-white/10 text-[#b8baff] text-[10px] sm:text-[11px] font-medium uppercase tracking-wide"><Clock className="w-3.5 h-3.5" /> В работе</span>;
    case 'returned':
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.045] border border-white/10 text-white/62 text-[10px] sm:text-[11px] font-medium uppercase tracking-wide"><AlertCircle className="w-3.5 h-3.5" /> Возвращено (Ошибки)</span>;
    case 'submitted_for_review':
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#6f64ff]/20 border border-[#6f64ff]/30 text-[#b8baff] text-[10px] sm:text-[11px] font-medium uppercase tracking-wide"><ShieldAlert className="w-3.5 h-3.5" /> На проверке</span>;
    case 'ready_for_export':
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/[0.045] border border-white/10 text-[#b8baff] text-[10px] sm:text-[11px] font-medium uppercase tracking-wide"><CheckCircle2 className="w-3.5 h-3.5" /> Готово к выгрузке</span>;
    default:
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/5 border border-white/10 text-white/70 text-[10px] sm:text-[11px] font-medium uppercase tracking-wide"><FileText className="w-3.5 h-3.5" /> Черновик</span>;
  }
};

// --- Sub-components for Tabs ---
const OverviewTab = ({ data }: { data: SubmissionDetail }) => (
  <div className="space-y-6">
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 hover:border-white/10 transition-colors">
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

      <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 hover:border-white/10 transition-colors flex flex-col">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-[11px] font-medium text-white/40 uppercase tracking-wider">Чеклист документов</h3>
          <span className="text-[11px] font-mono text-[#b8baff] font-medium bg-white/[0.045] px-2 py-0.5 rounded-md">8/10</span>
        </div>
        <div className="space-y-3 flex-1 flex flex-col justify-center">
          {[
            { label: 'Паспорта (Загран, РФ)', status: 'done' },
            { label: 'Финансовые гарантии', status: 'done' },
            { label: 'Справки с работы', status: 'pending' },
            { label: 'Бронирования (Отель, Авиа)', status: 'done' }
          ].map((doc, i) => (
            <div key={i} className="flex items-center gap-3">
              {doc.status === 'done' ? (
                <CheckCircle2 className="w-4 h-4 text-[#b8baff]" />
              ) : (
                <div className="w-4 h-4 rounded-full border border-white/20" />
              )}
              <span className={`text-[13px] ${doc.status === 'done' ? 'text-white/70' : 'text-white'}`}>{doc.label}</span>
            </div>
          ))}
        </div>
      </div>
    </div>

    <div className="space-y-3">
      <h3 className="text-[11px] font-medium text-white/40 uppercase tracking-wider pl-1">Участники ({data.applicantsCount})</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {data.applicants.map((applicant, i) => (
          <div key={i} className="flex items-center p-3 bg-white/[0.02] border border-white/5 hover:border-white/10 rounded-xl transition-all group">
            <div className="w-10 h-10 shrink-0 rounded-full bg-gradient-to-br from-[#2a2a30] to-[#1a1a20] border border-white/10 flex items-center justify-center text-xs font-semibold text-white/70 shadow-inner mr-3">
              {applicant.name.split(' ').map(n => n[0]).join('')}
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-[14px] text-white font-medium truncate group-hover:text-[#b8baff] transition-colors">{applicant.name}</div>
              <div className="text-[11px] text-white/50 mt-0.5">{applicant.role}</div>
            </div>
            <div className="text-right">
              <div className="text-[12px] font-mono font-medium text-[#b8baff]">{applicant.completeness}%</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  </div>
);

const QuestionnaireTab = ({ onOpenQuestionnaire }: { onOpenQuestionnaire?: () => void }) => (
  <div className="space-y-6">
    <div className="flex items-center justify-between">
      <div>
        <h3 className="text-[14px] font-medium text-white">Прогресс заполнения</h3>
      </div>
      <button 
        onClick={onOpenQuestionnaire}
        className="h-9 px-4 border border-[#0b090b] bg-[#35324e] hover:bg-[#3d395a] text-[#aca5c0] text-[14px] font-medium rounded-[8px] transition-colors flex items-center gap-2"
      >
        <Edit3 className="w-4 h-4" /> Открыть
      </button>
    </div>

    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      {[
        { title: 'Личные данные', icon: User, progress: 100, progressClass: 'w-full', status: 'done' },
        { title: 'Паспортные данные', icon: FileDigit, progress: 100, progressClass: 'w-full', status: 'done' },
        { title: 'Место работы / Учебы', icon: Briefcase, progress: 40, progressClass: 'w-[40%]', status: 'in_progress', remaining: '3 поля' },
        { title: 'Спонсоры и финансы', icon: CreditCard, progress: 0, progressClass: 'w-0', status: 'pending' },
        { title: 'Детали поездки', icon: Plane, progress: 100, progressClass: 'w-full', status: 'done' },
        { title: 'Визовая история', icon: History, progress: 100, progressClass: 'w-full', status: 'done' }
      ].map((section, i) => (
        <div key={i} className="p-4 bg-white/[0.02] border border-white/5 rounded-xl flex items-center gap-4 hover:bg-white/[0.04] transition-colors cursor-pointer" onClick={onOpenQuestionnaire}>
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center shrink-0 border
            ${section.status === 'done' ? 'bg-white/[0.045] border-white/10 text-[#b8baff]' : 
              section.status === 'in_progress' ? 'bg-[#6f64ff]/10 border-[#6f64ff]/20 text-[#b8baff]' : 
              'bg-white/5 border-white/10 text-white/40'}`}>
            <section.icon className="w-5 h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-[13px] font-medium text-white truncate">{section.title}</span>
              <span className="text-[11px] font-mono text-white/50">{section.progress}%</span>
            </div>
            <div className="w-full h-1.5 bg-white/5 rounded-full overflow-hidden">
              <div 
                className={`h-full rounded-full ${section.progressClass} ${section.status === 'done' ? 'bg-[#202126]' : section.status === 'in_progress' ? 'bg-[#6f64ff]' : 'bg-white/10'}`}
              />
            </div>
            {section.remaining && (
              <div className="text-[10px] text-white/40 mt-1.5">Осталось: {section.remaining}</div>
            )}
          </div>
        </div>
      ))}
    </div>
  </div>
);

const IssuesTab = ({ data, onOpenQuestionnaire }: { data: SubmissionDetail, onOpenQuestionnaire?: () => void }) => (
  <div className="space-y-6">
    <div className="flex items-center justify-between border-b border-white/5 pb-4">
      <div>
        <h3 className="text-[16px] font-semibold text-white">Список задач по замечаниям</h3>
        <p className="text-[12px] text-white/50 mt-1">Ошибки, выявленные администратором при проверке</p>
      </div>
      <div className="px-3 py-1 bg-white/[0.045] text-white/62 rounded-lg text-[12px] font-medium border border-white/10">
        Требуют исправления: {data.issuesCount}
      </div>
    </div>

    {data.issuesCount > 0 ? (
      <div className="space-y-4">
        {[
          { 
            id: 1, 
            title: 'Несоответствие даты рождения', 
            target: 'Иван Петров • Паспортные данные', 
            desc: 'В анкете указано 12.05.1985, а в загруженном скане паспорта — 15.05.1985.', 
            actionText: 'Исправить в анкете',
            icon: FileText
          },
          { 
            id: 2, 
            title: 'Плохое качество скана', 
            target: 'Анна Петрова • Скан загранпаспорта', 
            desc: 'Размытый скан, не читается MRZ-зона. Загрузите файл в более высоком разрешении.', 
            actionText: 'Перезагрузить файл',
            icon: ImageIcon
          }
        ].slice(0, data.issuesCount).map((issue) => (
          <div key={issue.id} className="p-4 bg-[#1a1a1d] border border-white/10 rounded-xl relative overflow-hidden flex flex-col sm:flex-row gap-4">
            <div className="absolute top-0 left-0 w-1 h-full bg-[#24242a]" />
            <div className="w-10 h-10 rounded-full bg-white/[0.045] flex items-center justify-center shrink-0 border border-white/10">
              <issue.icon className="w-5 h-5 text-white/62" />
            </div>
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <h4 className="text-[14px] font-semibold text-white">{issue.title}</h4>
                <span className="px-1.5 py-0.5 rounded text-[10px] bg-[#2a1d20]/70 text-[#d59aa3] font-medium">Blocker</span>
              </div>
              <div className="text-[11px] font-medium text-white/55 uppercase tracking-wider mb-2">{issue.target}</div>
              <p className="text-[13px] text-white/60 leading-relaxed max-w-xl">{issue.desc}</p>
            </div>
            <div className="sm:w-[180px] shrink-0 flex items-center">
              <button 
                onClick={onOpenQuestionnaire}
                className="w-full h-10 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl text-[13px] font-medium text-white transition-colors"
              >
                {issue.actionText}
              </button>
            </div>
          </div>
        ))}
      </div>
    ) : (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <div className="w-16 h-16 bg-white/[0.045] rounded-full flex items-center justify-center mb-4 border border-white/10">
          <CheckCircle2 className="w-8 h-8 text-[#b8baff]" />
        </div>
        <h4 className="text-[16px] font-semibold text-white mb-2">Ошибок не найдено</h4>
        <p className="text-[13px] text-white/50 max-w-sm">Все данные проверены администратором. Замечаний к анкете и документам нет.</p>
      </div>
    )}
  </div>
);


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
  };
}

const HistoryTab = () => (
  <div className="relative pl-6 space-y-8 before:absolute before:inset-y-2 before:left-[31px] before:w-px before:bg-white/10">
    {[
      { title: 'Возвращено с замечаниями', time: 'Сегодня, 14:30', user: 'Система', icon: <AlertCircle className="w-4 h-4 text-white/62" />, type: 'warning' },
      { title: 'Отправлено на проверку', time: 'Вчера, 18:45', user: 'Вы', icon: <UploadCloud className="w-4 h-4 text-[#b8baff]" />, type: 'info' },
      { title: 'Загружены сканы паспортов', time: 'Вчера, 15:10', user: 'Вы', icon: <ImageIcon className="w-4 h-4 text-white/60" />, type: 'neutral' },
      { title: 'Создан черновик', time: 'Вчера, 12:00', user: 'Вы', icon: <FileText className="w-4 h-4 text-white/40" />, type: 'neutral' },
    ].map((event, i) => (
      <div key={i} className="relative flex gap-5">
        <div className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 border-2 bg-[#111113] z-10
          ${event.type === 'warning' ? 'border-white/15 shadow-[0_0_15px_rgba(249,115,22,0.2)]' : 
            event.type === 'info' ? 'border-[#6f64ff]/50' : 'border-white/10'}`}>
          {event.icon}
        </div>
        <div className="pt-1.5">
          <div className="text-[14px] font-medium text-white/90">{event.title}</div>
          <div className="flex items-center gap-2 mt-1.5 text-[12px] text-white/40">
            <span>{event.time}</span>
            <span className="w-1 h-1 rounded-full bg-white/20" />
            <span>{event.user}</span>
          </div>
        </div>
      </div>
    ))}
  </div>
);

// --- Main Drawer Component ---
export function Drawer({ isOpen, onClose, submissionId, submission, onOpenQuestionnaire, onSubmissionAction }: DrawerProps) {
  const bridge = useVisaflowBusinessBridge();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [status, setStatus] = useState<DrawerState>('idle');
  const [data, setData] = useState<SubmissionDetail | null>(null);
  const isDesktop = useMediaQuery('(min-width: 1024px)');

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => { if (e.key === 'Escape' && isOpen) onClose(); };
    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      document.body.style.overflow = 'hidden'; 
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      document.body.style.overflow = '';
    };
  }, [isOpen, onClose]);

  // Canonical data first, mock fallback second. This keeps the restored screen usable
  // without making mock state a source of truth.
  useEffect(() => {
    if (isOpen && submissionId) {
      setStatus('loading');
      setActiveTab('overview');

      const timer = setTimeout(() => {
        if (submission) {
          setData(detailFromCanonicalSubmission(submission));
          setStatus('success');
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
          issuesCount: submissionId === 'SUB-1042' || submissionId === 'SUB-1088' ? 2 : 0
        });
        setStatus('success');
      }, submission ? 80 : 400);

      return () => clearTimeout(timer);
    } else if (!isOpen) {
      const resetTimer = setTimeout(() => setStatus('idle'), 300);
      return () => clearTimeout(resetTimer);
    }
  }, [isOpen, submission, submissionId]);

  const tabs: { id: TabId; label: string; getCount?: (d: SubmissionDetail) => number; isWarning?: boolean }[] = [
    { id: 'overview', label: 'Обзор' },
    { id: 'questionnaire', label: 'Анкета' },
    { id: 'issues', label: 'Замечания', getCount: (d) => d.issuesCount, isWarning: true },
    { id: 'history', label: 'История' }
  ];

  const handleAction = (action: SubmissionAction) => {
    if (!submissionId) return;
    const payload = { submissionId, action, source: 'agent' as const };
    void bridge.onSubmissionAction?.(payload);
    void onSubmissionAction?.(submissionId, action);
    emitVisaflowUiEvent(bridge, { type: 'submission.action', payload });
  };

  // Dynamic Footer Actions
  const getFooterActions = () => {
    if (!data) return null;

    if (data.status === 'returned') {
      return (
        <button
          onClick={() => handleAction('submit_corrections')}
          disabled={submission ? !actionGate(submission, 'submit_corrections', 'agent').ok : false}
          title={submission ? actionGate(submission, 'submit_corrections', 'agent').reason : undefined}
          className="flex-1 sm:flex-none h-11 px-8 bg-[#24242a] hover:bg-[#2a2b32] disabled:bg-white/10 disabled:text-white/35 disabled:cursor-not-allowed text-white font-medium text-[14px] rounded-[8px] shadow-[0_0_28px_rgba(111,100,255,0.14)] transition-colors flex items-center justify-center gap-2"
        >
          <UploadCloud className="w-4 h-4" /> Отправить
        </button>
      );
    }
    
    if (data.status === 'in_progress') {
      return (
        <button
          onClick={() => handleAction('submit_for_review')}
          disabled={submission ? !actionGate(submission, 'submit_for_review', 'agent').ok : false}
          title={submission ? actionGate(submission, 'submit_for_review', 'agent').reason : undefined}
          className="flex-1 sm:flex-none h-11 px-8 bg-[#6f64ff] hover:bg-[#4855d4] disabled:bg-white/10 disabled:text-white/35 disabled:cursor-not-allowed text-white font-medium text-[14px] rounded-xl shadow-[0_0_20px_rgba(58,69,180,0.3)] transition-colors flex items-center justify-center gap-2"
        >
          <CheckCircle2 className="w-4 h-4" /> Отправить на проверку
        </button>
      );
    }

    return (
      <button
        onClick={() => data.status === 'draft' ? handleAction('save_progress') : undefined}
        disabled={data.status === 'exported'}
        className="flex-1 sm:flex-none h-11 px-8 bg-white/10 hover:bg-white/15 disabled:bg-white/5 disabled:text-white/30 disabled:cursor-not-allowed text-white font-medium text-[14px] rounded-xl transition-colors"
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
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            onClick={onClose}
          />
          
          <motion.div
            role="dialog"
            initial={{ x: isDesktop ? '100%' : 0, y: isDesktop ? 0 : '100%', opacity: 0.5 }}
            animate={{ x: 0, y: 0, opacity: 1 }}
            exit={{ x: isDesktop ? '100%' : 0, y: isDesktop ? 0 : '100%', opacity: 0 }}
            transition={{ type: "spring", damping: 28, stiffness: 240, mass: 0.8 }}
            className="fixed z-50 flex flex-col bg-[#111113] border-white/10 shadow-[0_24px_80px_rgba(0,0,0,0.6)]
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

            {status === 'success' && data && (
              <>
                <header className="px-5 lg:px-8 pt-4 pb-0 bg-[#111113]/95 backdrop-blur-md relative lg:sticky lg:top-0 z-20 shrink-0 border-b border-white/5">
                  <div className="flex items-start justify-between gap-4 mb-6">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 text-[10px] sm:text-[11px] lg:text-xs text-white/50 mb-2">
                        <span className="font-mono font-medium tracking-wider text-white/70">{data.id}</span>
                        <span className="w-1 h-1 rounded-full bg-white/20" />
                        <span className="font-medium uppercase tracking-wider">{data.type === 'family' ? 'Семейная' : 'Индивидуальная'}</span>
                      </div>
                      <h2 className="text-[22px] sm:text-[24px] font-semibold text-white leading-tight tracking-tight mb-4">
                        {data.title}
                      </h2>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <StatusBadge status={data.status} />
                      </div>
                    </div>
                    
                    <button 
                      onClick={onClose}
                      className="hidden lg:flex w-10 h-10 items-center justify-center bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-xl transition-colors border border-white/5 hover:border-white/10"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Tabs */}
                  <div className="w-full overflow-x-auto scrollbar-hide -mx-5 px-5 lg:mx-0 lg:px-0">
                    <div className="flex items-center gap-1.5 w-max mb-[-1px]">
                      {tabs.map(tab => {
                        const count = tab.getCount ? tab.getCount(data) : 0;
                        const isActive = activeTab === tab.id;
                        return (
                          <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
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

                <div className="lg:flex-1 lg:overflow-y-auto p-5 lg:p-8 scrollbar-thin scrollbar-thumb-white/10">
                  <AnimatePresence mode="wait">
                    <motion.div
                      key={activeTab}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -10 }}
                      transition={{ duration: 0.2 }}
                    >
                      {activeTab === 'overview' && <OverviewTab data={data} />}
                      {activeTab === 'questionnaire' && <QuestionnaireTab onOpenQuestionnaire={onOpenQuestionnaire} />}
                      {activeTab === 'issues' && <IssuesTab data={data} onOpenQuestionnaire={onOpenQuestionnaire} />}
                      {activeTab === 'history' && <HistoryTab />}
                    </motion.div>
                  </AnimatePresence>
                </div>

                <footer className="p-4 lg:px-8 lg:py-5 border-t border-white/10 bg-[#111113]/95 backdrop-blur-md shrink-0 flex flex-col sm:flex-row items-center justify-between gap-4 pb-[max(16px,env(safe-area-inset-bottom))] lg:sticky lg:bottom-0 z-20">
                  <div className="text-[12px] text-white/40 hidden sm:block">
                    {data.status === 'returned' ? 'Исправьте замечания перед повторной отправкой.' : 'Проверьте все данные перед отправкой администратору.'}
                  </div>
                  <div className="flex gap-3 w-full sm:w-auto">
                    <button onClick={onClose} className="flex-1 sm:flex-none h-11 px-5 border border-[#253e6f] bg-transparent opacity-50 hover:bg-white/5 text-white/70 hover:text-white font-medium text-[14px] rounded-[8px] transition-colors">
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
