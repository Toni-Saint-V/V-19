import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  ArrowLeftRight,
  FileText,
  Menu,
  Plus,
  Search,
  Settings,
  UploadCloud,
  Users,
  X,
} from 'lucide-react';
import { Drawer } from './Drawer';
import { QuestionnaireScreen } from './QuestionnaireScreen';
import { ApplicantsScreen } from './ApplicantsScreen';
import { DraftsScreen } from './DraftsScreen';
import { PreUploadScreen } from './PreUploadScreen';
import {
  emitVisaflowUiEvent,
  useVisaflowBusinessBridge,
  type AgentNavSection,
} from '../integration/visaflowBusinessBridge';
import type { Submission } from '../modules/submissions/types';
import {
  listItemsFromSubmissions,
  type LegacyAgentNavSection,
  type LegacySubmissionListItem,
} from './v19BusinessScreenAdapter';
import {
  loadProductIntakeDrafts,
  saveProductIntakeDrafts,
  type ProductIntakeDraft,
} from '../modules/submissions/productIntakeFlow';
import {
  agentActionQueue,
  searchAgentActions,
  type AgentActionItem,
} from '../modules/submissions/agentActions';
import {
  agentAgencyLabel,
  agentDisplayName,
  agentInitials,
} from '../modules/submissions/agentDirectory';

export type SubmissionListItem = LegacySubmissionListItem;

type ViewState = 'main' | 'questionnaire' | 'upload';

type CommandCenterProps = {
  agentId?: Submission['agentId'];
  onSubmissionsChange?: (submissions: Submission[]) => void | Promise<void>;
  submissions?: Submission[];
  onSignOut?: () => void | Promise<void>;
  onSwitchWorkspace?: () => void;
  onNavigateSettings?: () => void;
};

const fallbackSubmissions: SubmissionListItem[] = [
  {
    id: 'SUB-1042',
    title: 'Семья Петровых',
    type: 'family',
    applicantsCount: 4,
    city: 'Санкт-Петербург',
    tripDates: '18–23 июл 2026',
    status: 'returned',
    completeness: 92,
    updated: '12 мин назад',
    owner: 'Татьяна Н.',
    issueCount: 2,
    nextAction: 'Исправить замечания администратора',
  },
  {
    id: 'SUB-1057',
    title: 'Алина Смирнова',
    type: 'single',
    applicantsCount: 1,
    city: 'Москва',
    tripDates: '02–09 авг 2026',
    status: 'in_progress',
    completeness: 64,
    updated: '34 мин назад',
    owner: 'Татьяна Н.',
    issueCount: 0,
    nextAction: 'Дособрать обязательные документы',
  },
  {
    id: 'SUB-1061',
    title: 'Семья Орловых',
    type: 'family',
    applicantsCount: 4,
    city: 'Москва',
    tripDates: '11–21 авг 2026',
    status: 'submitted_for_review',
    completeness: 100,
    updated: '1 ч назад',
    owner: 'Татьяна Н.',
    issueCount: 0,
    nextAction: 'Ожидать проверки администратора',
  },
  {
    id: 'SUB-1078',
    title: 'Дмитрий Волков',
    type: 'single',
    applicantsCount: 1,
    city: 'Москва',
    tripDates: '06–12 сен 2026',
    status: 'ready_for_export',
    completeness: 100,
    updated: '2 ч назад',
    owner: 'Марина К.',
    issueCount: 0,
    nextAction: 'Готово к Excel-выгрузке',
  },
];

function intakeDraftToListItem(draft: ProductIntakeDraft): SubmissionListItem {
  return {
    id: draft.id,
    title: draft.title,
    type: draft.type,
    applicantsCount: draft.applicants.length,
    city: draft.city,
    tripDates: draft.tripDates.replace(/\.2026/g, '').replace(/\s+–\s+/g, '–'),
    status: draft.issues.some((issue) => issue.severity === 'blocker') ? 'returned' : 'in_progress',
    completeness: draft.readyPercent,
    updated: 'только что',
    owner: 'Татьяна Н.',
    issueCount: draft.issues.length,
    nextAction: draft.nextAction,
  };
}

function canonicalBridgeNav(section: LegacyAgentNavSection): AgentNavSection | null {
  if (section === 'actions' || section === 'documents' || section === 'submissions' || section === 'settings') return section;
  return null;
}

function navLabel(section: LegacyAgentNavSection) {
  switch (section) {
    case 'actions':
      return 'Мои действия';
    case 'documents':
      return 'Сбор документов';
    case 'submissions':
      return 'Мои подачи';
    case 'settings':
      return 'Настройки';
    case 'applicants':
      return 'Заявители / Семьи';
    case 'files':
    case 'media':
      return 'Файлы / Медиа';
    case 'issues':
      return 'Замечания';
  }
}

function normalizeAgentNav(section: LegacyAgentNavSection): LegacyAgentNavSection {
  if (section === 'files' || section === 'media') return 'documents';
  if (section === 'issues') return 'actions';
  return section;
}

export function CommandCenter({
  agentId,
  onSubmissionsChange,
  submissions: canonicalSubmissions,
  onSignOut,
  onSwitchWorkspace,
  onNavigateSettings,
}: CommandCenterProps) {
  const bridge = useVisaflowBusinessBridge();
  const [activeNav, setActiveNav] = useState<LegacyAgentNavSection>('actions');
  const [currentView, setCurrentView] = useState<ViewState>('main');
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [intakeDrafts, setIntakeDrafts] = useState<ProductIntakeDraft[]>(() => loadProductIntakeDrafts());

  const canonicalRows = useMemo(() => listItemsFromSubmissions(canonicalSubmissions), [canonicalSubmissions]);
  const intakeRows = useMemo(() => intakeDrafts.map(intakeDraftToListItem), [intakeDrafts]);
  const rows = useMemo(
    () => [...intakeRows, ...(canonicalRows.length ? canonicalRows : fallbackSubmissions)],
    [canonicalRows, intakeRows],
  );
  const actionQueue = useMemo(() => agentActionQueue(canonicalSubmissions ?? []), [canonicalSubmissions]);
  const visibleActions = useMemo(() => searchAgentActions(actionQueue.open, searchQuery), [actionQueue.open, searchQuery]);
  const agentName = agentDisplayName(agentId);
  const agentAgency = agentAgencyLabel(agentId);
  const agentAvatar = agentInitials(agentId);
  const selectedCanonicalSubmission = useMemo(
    () => canonicalSubmissions?.find((submission) => submission.id === selectedRow),
    [canonicalSubmissions, selectedRow],
  );
  const selectedIntakeDraft = useMemo(
    () => intakeDrafts.find((draft) => draft.id === selectedRow),
    [intakeDrafts, selectedRow],
  );

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) setMobileNavOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  useEffect(() => {
    saveProductIntakeDrafts(intakeDrafts);
  }, [intakeDrafts]);

  const navigateTo = (nav: LegacyAgentNavSection) => {
    const normalizedNav = normalizeAgentNav(nav);
    const canonicalNav = canonicalBridgeNav(normalizedNav);
    if (canonicalNav) {
      bridge.onAgentNavChange?.(canonicalNav);
      emitVisaflowUiEvent(bridge, { type: 'agent.nav', section: canonicalNav });
      if (canonicalNav === 'settings') onNavigateSettings?.();
    }
    setActiveNav(normalizedNav);
    setMobileNavOpen(false);
  };

  const handleRowClick = (id: string) => {
    bridge.onSubmissionOpen?.(id);
    emitVisaflowUiEvent(bridge, { type: 'submission.open', submissionId: id });
    setSelectedRow(id);
    setDrawerOpen(true);
  };

  const handleOpenQuestionnaire = (id: string) => {
    bridge.onQuestionnaireOpen?.(id);
    emitVisaflowUiEvent(bridge, { type: 'questionnaire.open', submissionId: id });
    setSelectedRow(id);
    setDrawerOpen(false);
    setCurrentView('questionnaire');
  };

  const handleActionOpen = (action: AgentActionItem) => {
    if (action.tab === 'questionnaire') {
      handleOpenQuestionnaire(action.submission.id);
      return;
    }
    handleRowClick(action.submission.id);
  };

  const openUpload = () => {
    bridge.onUploadOpen?.();
    emitVisaflowUiEvent(bridge, { type: 'upload.open' });
    setCurrentView('upload');
  };

  const createPackage = () => {
    bridge.onCreatePackage?.();
    emitVisaflowUiEvent(bridge, { type: 'package.create' });
    setCurrentView('upload');
  };

  const handleUploadComplete = (draft: ProductIntakeDraft) => {
    bridge.onQuestionnaireOpen?.(draft.id);
    emitVisaflowUiEvent(bridge, { type: 'questionnaire.open', submissionId: draft.id });
    setIntakeDrafts((current) => [draft, ...current.filter((item) => item.id !== draft.id)].slice(0, 8));
    setSelectedRow(draft.id);
    setDrawerOpen(false);
    setActiveNav('submissions');
    setSearchQuery('');
    setCurrentView('questionnaire');
  };

  const handleUploadDraftSave = (draft: ProductIntakeDraft) => {
    setIntakeDrafts((current) => [draft, ...current.filter((item) => item.id !== draft.id)].slice(0, 8));
  };

  const persistQuestionnaireSubmission = (nextSubmission: Submission) =>
    onSubmissionsChange?.([nextSubmission]);

  const renderNavButton = (section: LegacyAgentNavSection, icon: ReactNode, count?: number, warning?: boolean) => (
    <button
      onClick={() => navigateTo(section)}
      className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4] ${activeNav === section ? 'bg-[#27272b] text-white' : 'hover:bg-white/5 text-white/70 hover:text-white'}`}
    >
      {icon}
      <span className="flex-1 text-left">{navLabel(section)}</span>
      {typeof count === 'number' && <span className="px-1.5 py-0.5 rounded-full bg-[#18181b] border border-white/5 text-[11px] font-medium text-white/80">{count}</span>}
      {warning && <span className="w-2 h-2 rounded-full bg-[#a35f69]" />}
    </button>
  );

  const renderNavContent = () => (
    <>
      <div className="flex items-center gap-2.5 px-2 pb-4 mb-2">
        <div className="w-8 h-8 rounded-lg bg-white text-[#0a0a0b] flex items-center justify-center font-bold text-sm">V</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold tracking-tight">VisaFlow V-19</div>
          <div className="text-[11px] text-white/50">Agent workspace</div>
        </div>
        <button onClick={() => setMobileNavOpen(false)} className="md:hidden p-2 text-white/50 hover:text-white">
          <X className="w-5 h-5" />
        </button>
      </div>

      <button className="h-10 mb-4 bg-white/5 hover:bg-white/10 border border-[#242529] rounded-[10px] text-white/50 flex items-center gap-2 px-3 text-sm transition-colors text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4] mx-2">
        <Search className="w-4 h-4" />
        <span>Поиск...</span>
        <kbd className="ml-auto px-1.5 py-0.5 rounded bg-black/40 border border-[#242529] text-[10px] font-sans">⌘K</kbd>
      </button>

      <div className="flex-1 overflow-y-auto px-2 space-y-5 scrollbar-hide">
        <nav className="space-y-0.5">
          <div className="px-2 pb-1 text-[11px] text-white/40 font-medium tracking-wide uppercase">Работа</div>
          {renderNavButton('actions', <Menu className="w-4 h-4" />, actionQueue.summary.open)}
          {renderNavButton('documents', <FileText className="w-4 h-4" />, rows.filter((item) => item.completeness < 100 || item.status === 'returned').length)}
          {renderNavButton('submissions', <Users className="w-4 h-4" />, rows.length)}
          {renderNavButton('settings', <Settings className="w-4 h-4" />)}
        </nav>
      </div>

      {onSwitchWorkspace ? (
        <div className="mt-auto border-t border-[#202124] p-3 mx-2 space-y-2">
          <button
            onClick={onSwitchWorkspace}
            className="w-full h-10 px-3 bg-[#1e1e21] hover:bg-[#27272b] border border-[#242529] rounded-xl text-[13px] font-medium text-white transition-colors flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]"
          >
            <ArrowLeftRight className="w-4 h-4 text-white/50" />
            В админскую зону
          </button>
        </div>
      ) : onSignOut ? (
        <div className="mt-auto border-t border-[#202124] p-3 mx-2 space-y-2">
          <div className="flex items-center gap-2.5 rounded-xl px-2 py-2">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[#242529] bg-white text-[12px] font-bold text-[#0a0a0b]">
              {agentAvatar}
            </span>
            <div className="min-w-0 text-left">
              <div className="truncate text-[13px] font-medium leading-5 text-white">{agentName}</div>
              <div className="truncate text-[11px] leading-4 text-white/50">{agentAgency}</div>
            </div>
          </div>
          <button
            onClick={() => void onSignOut()}
            className="w-full h-10 px-3 bg-[#1e1e21] hover:bg-[#27272b] border border-[#242529] rounded-xl text-[13px] font-medium text-white transition-colors flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]"
          >
            Выйти
          </button>
        </div>
      ) : null}
    </>
  );

  const renderActionsList = () => (
    <div className="space-y-4 lg:space-y-6">
      <div className="grid grid-cols-4 gap-2">
        {[
          { label: 'Открыто', value: actionQueue.summary.open },
          { label: 'Сегодня', value: actionQueue.summary.today },
          { label: 'На неделе', value: actionQueue.summary.week },
          { label: 'Закрыто', value: actionQueue.summary.completed },
        ].map((item) => (
          <div key={item.label} className="h-[60px] rounded-[8px] border border-[#242529] bg-[#161617] px-2.5 py-2">
            <div className="truncate text-[9px] font-medium uppercase tracking-wide text-white/40">{item.label}</div>
            <div className="mt-2 text-[22px] font-medium leading-none text-white">{item.value}</div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-2">
        <div className="relative w-full sm:w-[320px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
          <input
            type="text"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.currentTarget.value)}
            placeholder="Поиск по действиям..."
            className="w-full h-10 bg-[#1e1e21] border border-[#242529] rounded-[10px] pl-9 pr-3 text-sm text-white placeholder-white/40 focus:border-[#6f64ff] focus:ring-1 focus:ring-[#3a45b4]/30 transition-all outline-none"
          />
        </div>
      </div>

      <div className="space-y-2">
        <AnimatePresence mode="popLayout">
          {visibleActions.length === 0 ? (
            <motion.div key="empty-actions" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }} className="rounded-[15px] border border-dashed border-[#242529] bg-[#161617] p-8 text-center text-sm text-white/45">
              Нет открытых действий по текущим подачам.
            </motion.div>
          ) : (
            visibleActions.map((action, index) => (
              <motion.div
                layout
                key={action.id}
                initial={{ opacity: 0, y: 14, scale: 0.992 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.992 }}
                transition={{ duration: 0.2, delay: index * 0.018 }}
                onClick={() => handleActionOpen(action)}
                tabIndex={0}
                onKeyDown={(event) => {
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    handleActionOpen(action);
                  }
                }}
                className="min-h-[104px] p-4 border rounded-[15px] cursor-pointer transition-all flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4] bg-gradient-to-b from-[#161617] to-[#0e0e10] border-[#242529] hover:border-[#2e2f34] hover:from-[#1a1a1d] shadow-[inset_0_1px_0_rgba(255,255,255,0.026)]"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="text-[14.5px] font-semibold text-white truncate leading-snug">{action.title}</div>
                    <span className="rounded-md border border-white/5 bg-white/5 px-1.5 py-0.5 font-mono text-[10px] text-white/45">{action.submission.id}</span>
                  </div>
                  <div className="text-[11px] text-white/40 mt-1 truncate">{action.context}</div>
                </div>
                <div className="lg:w-[190px] shrink-0 lg:border-l border-[#202124] lg:pl-4">
                  <div className="text-[12px] font-medium text-white/90 truncate">{action.dueLabel}</div>
                  <div className="text-[10.5px] text-white/40 mt-0.5">{action.submission.city}</div>
                </div>
                <div className="hidden lg:flex min-w-[160px] shrink-0 items-center gap-1.5">
                  {action.badges.slice(0, 2).map((badge) => (
                    <span key={`${action.id}-${badge.label}`} className="rounded-full border border-white/10 bg-white/[0.045] px-2 py-1 text-[10.5px] font-medium uppercase tracking-wide text-white/62">
                      {badge.label}
                    </span>
                  ))}
                </div>
                <div className="lg:w-[180px] shrink-0 flex items-center justify-end lg:justify-center mt-2 lg:mt-0">
                  <button
                    onClick={(event) => {
                      event.stopPropagation();
                      handleActionOpen(action);
                    }}
                    className="h-10 px-4 w-full lg:w-auto bg-[#1e1e21] hover:bg-[#27272b] border border-[#242529] rounded-[10px] text-sm text-white transition-colors flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]"
                  >
                    {action.cta}
                  </button>
                </div>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );

  const renderSettings = () => (
    <div className="rounded-2xl border border-[#242529] bg-[#161617] p-6 max-w-3xl">
      <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-white/62 mb-4">
        <Settings className="w-3.5 h-3.5" /> Canonical V19
      </div>
      <h2 className="text-[24px] font-semibold text-white tracking-tight">Настройки рабочего места</h2>
      <p className="mt-2 text-[13px] leading-relaxed text-white/50">
        Этот экран оставлен как compatibility entry. Основные настройки, доступы и Supabase-профиль ведутся в canonical Settings surface.
      </p>
      <button onClick={onNavigateSettings} className="mt-5 h-10 px-4 rounded-xl bg-[#6f64ff] hover:bg-[#4855d4] text-[13px] font-semibold text-white transition-colors">
        Открыть canonical настройки
      </button>
    </div>
  );

  const title = navLabel(activeNav);

  return (
    <div className="flex h-full w-full bg-[#101011] relative overflow-hidden">
      <AnimatePresence mode="wait">
        {currentView === 'questionnaire' && selectedRow && (
          <QuestionnaireScreen
            key={`questionnaire-${selectedRow}`}
            agentId={agentId}
            submissionId={selectedRow}
            draft={selectedIntakeDraft}
            submission={selectedCanonicalSubmission}
            onBack={() => setCurrentView('main')}
            onSubmissionChange={persistQuestionnaireSubmission}
          />
        )}
        {currentView === 'upload' && (
          <PreUploadScreen key="upload" onBack={() => setCurrentView('main')} onSaveDraft={handleUploadDraftSave} onComplete={handleUploadComplete} />
        )}
      </AnimatePresence>

      <AnimatePresence>
        {mobileNavOpen && (
          <div className="md:hidden">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileNavOpen(false)} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" />
            <motion.aside initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: 'spring', damping: 25, stiffness: 250 }} className="fixed inset-y-0 left-0 w-[280px] bg-[#141416] border-r border-[#202124] z-50 flex flex-col py-3 font-medium shadow-[0_0_40px_rgba(0,0,0,0.5)]">
              {renderNavContent()}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      <aside className="hidden md:flex w-[288px] shrink-0 bg-[#161617] border-r border-[#202124] flex-col py-3 z-20">{renderNavContent()}</aside>

      <main className="flex-1 min-w-0 flex flex-col bg-[#141416]">
        <header className="h-[60px] lg:h-16 shrink-0 border-b border-[#202124] flex items-center px-4 lg:px-6 gap-4 bg-[#141416] z-10 sticky top-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileNavOpen(true)} className="md:hidden w-10 h-10 -ml-2 rounded-lg hover:bg-white/5 flex items-center justify-center text-white/70">
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-[19px] lg:text-[21px] font-semibold tracking-tight text-white m-0 leading-none">{title}</h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button onClick={openUpload} className="h-[36px] lg:h-10 px-3.5 bg-[#1e1e21] hover:bg-[#27272b] border border-[#242529] text-white rounded-[10px] text-[13px] lg:text-sm font-medium transition-colors flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]">
              <UploadCloud className="w-4 h-4" />
              <span className="hidden sm:inline">Загрузить</span>
            </button>
            <button onClick={createPackage} className="h-[36px] lg:h-10 px-3.5 bg-[#6f64ff] hover:bg-[#4855d4] text-white rounded-[10px] text-[13px] lg:text-sm font-medium transition-colors flex items-center gap-2 shadow-[0_0_20px_rgba(58,69,180,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white">
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Создать пакет</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto p-4 lg:p-6 pb-[max(24px,env(safe-area-inset-bottom))]">
          <div className="max-w-[1460px] mx-auto h-full">
            {activeNav === 'documents' && (
              <DraftsScreen
                onOpenDrawer={handleRowClick}
                onSubmissionsChange={onSubmissionsChange}
                submissions={canonicalSubmissions}
              />
            )}
            {activeNav === 'applicants' && <ApplicantsScreen onOpenDrawer={handleRowClick} submissions={canonicalSubmissions} />}
            {activeNav === 'settings' && renderSettings()}
            {activeNav === 'actions' && renderActionsList()}
            {activeNav === 'submissions' && <ApplicantsScreen onOpenDrawer={handleRowClick} submissions={canonicalSubmissions} />}
          </div>
        </div>
      </main>

      <Drawer
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        submissionId={selectedRow}
        submission={canonicalSubmissions?.find((submission) => submission.id === selectedRow)}
        onOpenQuestionnaire={() => selectedRow && handleOpenQuestionnaire(selectedRow)}
      />
    </div>
  );
}
