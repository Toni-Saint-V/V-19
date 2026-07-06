import { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, Plus, Filter, User, Users, X, 
  Menu, FileText, CheckCircle2, Clock, AlertCircle, 
  Image as ImageIcon, FileWarning, UploadCloud
} from 'lucide-react';
import { Drawer, SubmissionStatus } from './Drawer';
import { QuestionnaireScreen } from './QuestionnaireScreen';
import { ApplicantsScreen } from './ApplicantsScreen';
import { DraftsScreen } from './DraftsScreen';
import { PreUploadScreen } from './PreUploadScreen';
import { MediaScreen } from './MediaScreen';
import { IssuesScreen } from './IssuesScreen';
import { ArrowLeftRight } from 'lucide-react';
import {
  emitVisaflowUiEvent,
  useVisaflowBusinessBridge,
  type AgentNavSection,
} from '../integration/visaflowBusinessBridge';

export type SubmissionListItem = {
  id: string;
  title: string;
  type: 'single' | 'family';
  applicantsCount: number;
  applicantNames: string[];
  passportNumbers: string[];
  city: string;
  tripDates: string;
  departureDate: string;
  createdAt: string;
  status: SubmissionStatus;
  completeness: number;
  updated: string;
  owner: string;
  issuesCount: number;
};

type SubmissionStatusFilter = 'all' | 'issues' | 'review';
type SubmissionSortKey = 'issues_desc' | 'departure_asc' | 'departure_desc' | 'created_desc' | 'created_asc';

const mockSubmissions: SubmissionListItem[] = [
  {
    id: "SUB-1042",
    title: "Семья Петровых",
    type: "family",
    applicantsCount: 4,
    applicantNames: ["Иван Петров", "Анна Петрова", "Максим Петров", "Мария Петрова"],
    passportNumbers: ["75 1234567", "75 7654321", "76 1002003", "76 1002004"],
    city: "Санкт-Петербург",
    tripDates: "18–23 июл 2026",
    departureDate: "2026-07-18",
    createdAt: "2026-07-05T09:35:00+03:00",
    status: "returned",
    completeness: 92,
    updated: "12 мин назад",
    owner: "Татьяна Н.",
    issuesCount: 3,
  },
  {
    id: "SUB-1057",
    title: "Алина Смирнова",
    type: "single",
    applicantsCount: 1,
    applicantNames: ["Алина Смирнова"],
    passportNumbers: ["71 4455667"],
    city: "Москва",
    tripDates: "02–09 авг 2026",
    departureDate: "2026-08-02",
    createdAt: "2026-07-04T16:10:00+03:00",
    status: "in_progress",
    completeness: 64,
    updated: "34 мин назад",
    owner: "Татьяна Н.",
    issuesCount: 0,
  },
  {
    id: "SUB-1061",
    title: "Семья Орловых",
    type: "family",
    applicantsCount: 4,
    applicantNames: ["Олег Орлов", "Ирина Орлова", "Павел Орлов", "Дарья Орлова"],
    passportNumbers: ["73 0022001", "73 0022002", "74 9040110", "74 9040111"],
    city: "Москва",
    tripDates: "11–21 авг 2026",
    departureDate: "2026-08-11",
    createdAt: "2026-07-03T12:25:00+03:00",
    status: "submitted_for_review",
    completeness: 100,
    updated: "1 ч назад",
    owner: "Татьяна Н.",
    issuesCount: 0,
  },
  {
    id: "SUB-1078",
    title: "Дмитрий Волков",
    type: "single",
    applicantsCount: 1,
    applicantNames: ["Дмитрий Волков"],
    passportNumbers: ["72 8889900"],
    city: "Москва",
    tripDates: "06–12 сен 2026",
    departureDate: "2026-09-06",
    createdAt: "2026-07-02T18:45:00+03:00",
    status: "ready_for_export",
    completeness: 100,
    updated: "2 ч назад",
    owner: "Марина К.",
    issuesCount: 0,
  },
];

const dateFormatter = new Intl.DateTimeFormat('ru-RU', {
  day: '2-digit',
  month: 'short',
  year: 'numeric',
});

const normalizeText = (value: string) =>
  value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').trim();

const normalizePassport = (value: string) =>
  normalizeText(value).replace(/[^a-zа-я0-9]/gi, '');

const getDateTime = (value: string) => {
  const time = new Date(value).getTime();
  return Number.isNaN(time) ? 0 : time;
};

const formatShortDate = (value: string) => {
  const time = getDateTime(value);
  return time === 0 ? '—' : dateFormatter.format(new Date(time));
};

type NavSection = AgentNavSection;
type ViewState = 'main' | 'questionnaire' | 'upload';

export function CommandCenter({ onSwitchWorkspace }: { onSwitchWorkspace?: () => void }) {
  const bridge = useVisaflowBusinessBridge();
  const [activeNav, setActiveNav] = useState<NavSection>('submissions');
  const [currentView, setCurrentView] = useState<ViewState>('main');
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [submissionStatusFilter, setSubmissionStatusFilter] = useState<SubmissionStatusFilter>('all');
  const [cityFilter, setCityFilter] = useState('all');
  const [sortBy, setSortBy] = useState<SubmissionSortKey>('created_desc');
  const [searchQuery, setSearchQuery] = useState('');

  const cityOptions = useMemo(
    () => Array.from(new Set(mockSubmissions.map((sub) => sub.city))).sort((a, b) => a.localeCompare(b, 'ru')),
    []
  );

  const totalIssuesCount = useMemo(
    () => mockSubmissions.reduce((total, sub) => total + sub.issuesCount, 0),
    []
  );

  const reviewCount = useMemo(
    () => mockSubmissions.filter((sub) => sub.status === 'submitted_for_review').length,
    []
  );

  const filteredSubmissions = useMemo(() => {
    const normalizedSearch = normalizeText(searchQuery);
    const compactSearch = normalizePassport(searchQuery);

    return mockSubmissions
      .filter((sub) => {
        const matchesStatus =
          submissionStatusFilter === 'all'
            ? true
            : submissionStatusFilter === 'issues'
              ? sub.issuesCount > 0 || sub.status === 'returned'
              : sub.status === 'submitted_for_review';

        const matchesCity = cityFilter === 'all' || sub.city === cityFilter;

        const searchableText = [
          sub.id,
          sub.title,
          sub.owner,
          sub.city,
          ...sub.applicantNames,
          ...sub.passportNumbers,
        ].map(normalizeText);

        const searchablePassports = sub.passportNumbers.map(normalizePassport);

        const matchesSearch =
          normalizedSearch.length === 0 ||
          searchableText.some((value) => value.includes(normalizedSearch)) ||
          (compactSearch.length > 0 && searchablePassports.some((passport) => passport.includes(compactSearch)));

        return matchesStatus && matchesCity && matchesSearch;
      })
      .sort((a, b) => {
        switch (sortBy) {
          case 'issues_desc':
            return b.issuesCount - a.issuesCount || getDateTime(b.createdAt) - getDateTime(a.createdAt);
          case 'departure_asc':
            return getDateTime(a.departureDate) - getDateTime(b.departureDate);
          case 'departure_desc':
            return getDateTime(b.departureDate) - getDateTime(a.departureDate);
          case 'created_asc':
            return getDateTime(a.createdAt) - getDateTime(b.createdAt);
          case 'created_desc':
          default:
            return getDateTime(b.createdAt) - getDateTime(a.createdAt);
        }
      });
  }, [cityFilter, searchQuery, sortBy, submissionStatusFilter]);

  const hasActiveSubmissionFilters =
    submissionStatusFilter !== 'all' ||
    cityFilter !== 'all' ||
    sortBy !== 'created_desc' ||
    searchQuery.trim().length > 0;

  const resetSubmissionFilters = () => {
    setSubmissionStatusFilter('all');
    setCityFilter('all');
    setSortBy('created_desc');
    setSearchQuery('');
  };

  const getStatusFilterButtonClassName = (filter: SubmissionStatusFilter) => {
    const isActive = submissionStatusFilter === filter;

    return `px-3 py-1.5 rounded-lg text-sm transition-colors whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4] border ${
      isActive
        ? 'bg-[#27272b] text-white shadow-sm border-[#2e2f34]'
        : 'text-white/50 hover:text-white/80 border-transparent'
    }`;
  };

  // Close mobile nav on resize to desktop
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) setMobileNavOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

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

  const navigateTo = (nav: NavSection) => {
    bridge.onAgentNavChange?.(nav);
    emitVisaflowUiEvent(bridge, { type: 'agent.nav', section: nav });
    setActiveNav(nav);
    setMobileNavOpen(false);
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

  const getStatusBadge = (status: SubmissionStatus) => {
    switch (status) {
      case 'in_progress': return <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/[0.045] border border-white/10 text-[#b8baff] text-[10.5px] uppercase tracking-wide font-medium"><Clock className="w-3 h-3" /> В работе</span>;
      case 'returned': return <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/[0.045] border border-white/10 text-white/62 text-[10.5px] uppercase tracking-wide font-medium"><AlertCircle className="w-3 h-3" /> Ошибки</span>;
      case 'submitted_for_review': return <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-[#6f64ff]/20 border border-[#6f64ff]/30 text-[#b8baff] text-[10.5px] uppercase tracking-wide font-medium"><Clock className="w-3 h-3" /> На проверке</span>;
      case 'corrections_received': return <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/[0.045] border border-white/10 text-white/62 text-[10.5px] uppercase tracking-wide font-medium"><Clock className="w-3 h-3" /> Исправления</span>;
      case 'ready_for_export': return <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/[0.045] border border-white/10 text-[#b8baff] text-[10.5px] uppercase tracking-wide font-medium"><CheckCircle2 className="w-3 h-3" /> Готово</span>;
      default: return <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-white/5 border border-white/10 text-white/70 text-[10.5px] uppercase tracking-wide font-medium"><FileText className="w-3 h-3" /> Черновик</span>;
    }
  };

  const getStatusDot = (status: SubmissionStatus) => {
    switch (status) {
      case 'in_progress': return 'bg-[#7c73ff]';
      case 'returned': return 'bg-[#7c73ff]';
      case 'submitted_for_review': return 'bg-[#8fa3ff]';
      case 'corrections_received': return 'bg-[#7c73ff]';
      case 'ready_for_export': return 'bg-[#7c73ff]';
      default: return 'bg-white/30';
    }
  };

  const renderNavContent = () => (
    <>
      <div className="flex items-center gap-2.5 px-2 pb-4 mb-2">
        <div className="w-8 h-8 rounded-lg bg-white text-[#0a0a0b] flex items-center justify-center font-bold text-sm">V</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold tracking-tight">VisaFlow V-19</div>
          <div className="text-[11px] text-white/50">Workspace</div>
        </div>
        {/* Mobile close button */}
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
          <button onClick={() => navigateTo('submissions')} className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4] ${activeNav === 'submissions' ? 'bg-[#27272b] text-white' : 'hover:bg-white/5 text-white/70 hover:text-white'}`}>
            <Menu className="w-4 h-4" /> <span className="flex-1 text-left">Мои действия</span>
            <span className="px-1.5 py-0.5 rounded-full bg-[#18181b] border border-white/5 text-[11px] font-medium text-white/80">12</span>
          </button>
          <button onClick={() => navigateTo('drafts')} className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4] ${activeNav === 'drafts' ? 'bg-[#27272b] text-white' : 'hover:bg-white/5 text-white/70 hover:text-white'}`}>
            <FileText className="w-4 h-4" /> <span className="flex-1 text-left">Сбор документов</span>
          </button>
          <button onClick={() => navigateTo('applicants')} className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4] ${activeNav === 'applicants' ? 'bg-[#27272b] text-white' : 'hover:bg-white/5 text-white/70 hover:text-white'}`}>
            <Users className="w-4 h-4" /> <span className="flex-1 text-left">Заявители / Семьи</span>
          </button>
          <button onClick={() => navigateTo('media')} className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4] ${activeNav === 'media' ? 'bg-[#27272b] text-white' : 'hover:bg-white/5 text-white/70 hover:text-white'}`}>
            <ImageIcon className="w-4 h-4" /> <span className="flex-1 text-left">Файлы / Медиа</span>
          </button>
          <button onClick={() => navigateTo('issues')} className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4] ${activeNav === 'issues' ? 'bg-[#27272b] text-white' : 'hover:bg-white/5 text-white/70 hover:text-white'}`}>
            <FileWarning className="w-4 h-4" /> <span className="flex-1 text-left">Замечания</span>
            <span className="w-2 h-2 rounded-full bg-[#a35f69]" />
          </button>
        </nav>
      </div>

      <div className="mt-auto border-t border-[#202124] p-3 mx-2 space-y-2">
        <button 
          onClick={onSwitchWorkspace}
          className="w-full h-10 px-3 bg-[#1e1e21] hover:bg-[#27272b] border border-[#242529] rounded-xl text-[13px] font-medium text-white transition-colors flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]"
        >
          <ArrowLeftRight className="w-4 h-4 text-white/50" />
          В админскую зону
        </button>
        <div className="flex items-center gap-3 pt-1">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#2a2a30] to-[#1a1a20] border border-white/10 flex items-center justify-center text-xs font-medium text-white/70">
            ТН
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-xs font-medium text-white truncate">Татьяна Николаева</div>
            <div className="text-[10px] text-white/40 truncate">Visa Center Spb</div>
          </div>
        </div>
      </div>
    </>
  );

  const getPageTitle = () => {
    switch (activeNav) {
      case 'submissions': return 'Мои действия';
      case 'drafts': return 'Сбор документов';
      case 'applicants': return 'Заявители и Семьи';
      case 'media': return 'Файлы и Медиа';
      case 'issues': return 'Замечания и Ошибки';
    }
  };

  return (
    <div className="flex h-full w-full bg-[#101011] relative overflow-hidden">
      
      {/* Screens / Overlays */}
      {currentView === 'questionnaire' && selectedRow && <QuestionnaireScreen submissionId={selectedRow} onBack={() => setCurrentView('main')} />}
      <AnimatePresence>
        {currentView === 'upload' && <PreUploadScreen onBack={() => setCurrentView('main')} />}
      </AnimatePresence>

      {/* Mobile Nav Overlay */}
      <AnimatePresence>
        {mobileNavOpen && (
          <div className="md:hidden">
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={() => setMobileNavOpen(false)} className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40" />
            <motion.aside initial={{ x: '-100%' }} animate={{ x: 0 }} exit={{ x: '-100%' }} transition={{ type: "spring", damping: 25, stiffness: 250 }} className="fixed inset-y-0 left-0 w-[280px] bg-[#161617] border-r border-[#202124] z-50 flex flex-col py-3 shadow-[0_0_40px_rgba(0,0,0,0.5)]">
              {renderNavContent()}
            </motion.aside>
          </div>
        )}
      </AnimatePresence>

      {/* Desktop Sidebar */}
      <aside className="hidden md:flex w-[288px] shrink-0 bg-[#161617] border-r border-[#202124] flex-col py-3 z-20">
        {renderNavContent()}
      </aside>

      {/* Main Content */}
      <main className="flex-1 min-w-0 flex flex-col bg-[#141416]">
        {/* Topbar */}
        <header className="h-[60px] lg:h-16 shrink-0 border-b border-[#202124] flex items-center px-4 lg:px-6 gap-4 bg-[#141416] z-10 sticky top-0">
          <div className="flex items-center gap-3">
            <button onClick={() => setMobileNavOpen(true)} className="md:hidden w-10 h-10 -ml-2 rounded-lg hover:bg-white/5 flex items-center justify-center text-white/70">
              <Menu className="w-5 h-5" />
            </button>
            <h1 className="text-[19px] lg:text-[21px] font-semibold tracking-tight text-white m-0 leading-none">
              {getPageTitle()}
            </h1>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <button 
              onClick={openUpload}
              className="h-[36px] lg:h-10 px-3.5 bg-[#1e1e21] hover:bg-[#27272b] border border-[#242529] text-white rounded-[10px] text-[13px] lg:text-sm font-medium transition-colors flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]"
            >
              <UploadCloud className="w-4 h-4" />
              <span className="hidden sm:inline">Загрузить</span>
            </button>
            <button 
              onClick={createPackage}
              className="h-[36px] lg:h-10 px-3.5 bg-[#6f64ff] hover:bg-[#4855d4] text-white rounded-[10px] text-[13px] lg:text-sm font-medium transition-colors flex items-center gap-2 shadow-[0_0_20px_rgba(58,69,180,0.2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Создать пакет</span>
            </button>
          </div>
        </header>

        {/* Dynamic View Content */}
        <div className="flex-1 overflow-auto p-4 lg:p-6 pb-[max(24px,env(safe-area-inset-bottom))]">
          <div className="max-w-[1460px] mx-auto h-full">
            
            {activeNav === 'drafts' && <DraftsScreen onOpenDrawer={handleRowClick} />}
            {activeNav === 'applicants' && <ApplicantsScreen onOpenDrawer={handleRowClick} />}
            {activeNav === 'media' && <MediaScreen />}
            {activeNav === 'issues' && <IssuesScreen onOpenDrawer={handleRowClick} />}

            {/* Submissions List */}
            {activeNav === 'submissions' && (
              <div className="space-y-4 lg:space-y-6">
                <div className="space-y-3 min-h-[48px] lg:min-h-12">
                  <div className="flex flex-col xl:flex-row xl:items-center gap-3">
                    <div className="flex bg-[#161617] p-1 border border-[#202124] rounded-[11px] overflow-x-auto scrollbar-hide">
                      <button
                        type="button"
                        onClick={() => setSubmissionStatusFilter('all')}
                        className={getStatusFilterButtonClassName('all')}
                      >
                        Все действия
                        <span className="ml-1.5 text-[10px] bg-black/30 text-white/55 px-1.5 py-0.5 rounded-md">
                          {mockSubmissions.length}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSubmissionStatusFilter('issues')}
                        className={getStatusFilterButtonClassName('issues')}
                      >
                        Ошибки
                        <span className="ml-1.5 text-[10px] bg-[#2a1d20]/70 text-[#d59aa3] px-1.5 py-0.5 rounded-md">
                          {totalIssuesCount}
                        </span>
                      </button>
                      <button
                        type="button"
                        onClick={() => setSubmissionStatusFilter('review')}
                        className={getStatusFilterButtonClassName('review')}
                      >
                        На проверке
                        <span className="ml-1.5 text-[10px] bg-black/30 text-white/55 px-1.5 py-0.5 rounded-md">
                          {reviewCount}
                        </span>
                      </button>
                    </div>

                    <div className="xl:ml-auto flex items-center gap-2 w-full xl:w-auto">
                      <div className="relative w-full xl:w-[320px]">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
                        <input
                          type="search"
                          value={searchQuery}
                          onChange={(event) => setSearchQuery(event.target.value)}
                          placeholder="Паспорт или имя..."
                          className="w-full h-10 bg-[#1e1e21] border border-[#242529] rounded-[10px] pl-9 pr-3 text-sm text-white placeholder-white/40 focus:border-[#6f64ff] focus:ring-1 focus:ring-[#3a45b4]/30 transition-all outline-none"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={resetSubmissionFilters}
                        disabled={!hasActiveSubmissionFilters}
                        aria-label={hasActiveSubmissionFilters ? 'Сбросить фильтры' : 'Фильтры не применены'}
                        className="w-10 h-10 shrink-0 bg-[#1e1e21] hover:bg-[#27272b] border border-[#242529] rounded-[10px] flex items-center justify-center text-white/70 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4] disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-[#1e1e21]"
                      >
                        {hasActiveSubmissionFilters ? <X className="w-4 h-4" /> : <Filter className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-[minmax(190px,240px)_minmax(240px,300px)_auto] gap-2">
                    <label className="block">
                      <span className="block mb-1.5 text-[11px] font-medium uppercase tracking-wider text-white/40">
                        Город
                      </span>
                      <select
                        value={cityFilter}
                        onChange={(event) => setCityFilter(event.target.value)}
                        className="w-full h-10 bg-[#1e1e21] border border-[#242529] rounded-[10px] px-3 text-sm text-white focus:border-[#6f64ff] focus:ring-1 focus:ring-[#3a45b4]/30 transition-all outline-none"
                      >
                        <option value="all">Все города</option>
                        {cityOptions.map((city) => (
                          <option key={city} value={city}>
                            {city}
                          </option>
                        ))}
                      </select>
                    </label>

                    <label className="block">
                      <span className="block mb-1.5 text-[11px] font-medium uppercase tracking-wider text-white/40">
                        Сортировка
                      </span>
                      <select
                        value={sortBy}
                        onChange={(event) => setSortBy(event.target.value as SubmissionSortKey)}
                        className="w-full h-10 bg-[#1e1e21] border border-[#242529] rounded-[10px] px-3 text-sm text-white focus:border-[#6f64ff] focus:ring-1 focus:ring-[#3a45b4]/30 transition-all outline-none"
                      >
                        <option value="issues_desc">Сначала с проблемами</option>
                        <option value="departure_asc">Дата вылета: ближе</option>
                        <option value="departure_desc">Дата вылета: дальше</option>
                        <option value="created_desc">Дата создания: новые</option>
                        <option value="created_asc">Дата создания: старые</option>
                      </select>
                    </label>

                    <div className="min-h-10 sm:col-span-2 xl:col-span-1 xl:self-end px-3 py-2 bg-[#161617] border border-[#202124] rounded-[10px] flex items-center justify-between gap-3 text-sm">
                      <span className="text-white/40">Найдено</span>
                      <span className="font-mono text-white/80">
                        {filteredSubmissions.length} / {mockSubmissions.length}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="text-[11px] font-medium text-white/40 uppercase tracking-wider mb-4 flex items-center">
                    <span className="flex-1 border-b border-[#202124] mr-3"></span>
                    <span>{filteredSubmissions.length === 0 ? 'Нет совпадений' : 'Результаты'}</span>
                    <span className="flex-1 border-b border-[#202124] ml-3"></span>
                  </div>

                  {filteredSubmissions.length === 0 ? (
                    <div className="min-h-[180px] rounded-[15px] border border-[#242529] bg-gradient-to-b from-[#161617] to-[#0e0e10] flex flex-col items-center justify-center text-center px-6">
                      <Search className="w-8 h-8 text-white/25 mb-3" />
                      <div className="text-sm font-medium text-white">Заявки не найдены</div>
                      <div className="text-[12px] text-white/45 mt-1 max-w-[360px]">
                        Измени город, сортировку, статус или запрос по паспорту / имени.
                      </div>
                      {hasActiveSubmissionFilters && (
                        <button
                          type="button"
                          onClick={resetSubmissionFilters}
                          className="mt-4 h-9 px-4 bg-[#1e1e21] hover:bg-[#27272b] border border-[#242529] rounded-[10px] text-[13px] text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]"
                        >
                          Сбросить фильтры
                        </button>
                      )}
                    </div>
                  ) : (
                    filteredSubmissions.map((sub) => (
                      <div
                        key={sub.id}
                        onClick={() => handleRowClick(sub.id)}
                        tabIndex={0}
                        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleRowClick(sub.id); } }}
                        className={`min-h-[92px] p-3 lg:p-0 lg:pl-4 lg:pr-3 border rounded-[15px] cursor-pointer transition-all flex flex-col lg:flex-row lg:items-center gap-3 lg:gap-4 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4] shadow-[inset_0_1px_0_rgba(255,255,255,0.026)] ${selectedRow === sub.id ? 'bg-gradient-to-b from-[#202024] to-[#161617] border-[#2e2f34]' : 'bg-gradient-to-b from-[#161617] to-[#0e0e10] border-[#242529] hover:border-[#2e2f34] hover:from-[#1a1a1d]'}`}
                      >
                        <div className="hidden lg:flex w-3.5 h-full items-center justify-center shrink-0">
                          <div className={`w-2.5 h-2.5 rounded-full ${getStatusDot(sub.status)} ring-4 ring-black/20`} />
                        </div>

                        <div className="flex-1 min-w-0 flex flex-col justify-center">
                          <div className="flex items-center gap-2 mb-1 lg:hidden">
                            <div className={`w-2 h-2 rounded-full ${getStatusDot(sub.status)}`} />
                            <div className="text-[10.5px] text-white/50 font-mono">{sub.id}</div>
                          </div>
                          <div className="text-[14.5px] font-semibold text-white truncate leading-snug">{sub.title}</div>
                          <div className="text-[10.5px] text-white/40 mt-0.5 truncate hidden lg:block">
                            ID: <span className="font-mono text-white/60 mr-2">{sub.id}</span>
                            Создано: {formatShortDate(sub.createdAt)}
                          </div>
                          <div className="lg:hidden flex flex-wrap gap-x-3 gap-y-1 text-[10.5px] text-white/42 mt-2">
                            <span>Вылет: {formatShortDate(sub.departureDate)}</span>
                            <span>Создано: {formatShortDate(sub.createdAt)}</span>
                            <span>Проблем: {sub.issuesCount}</span>
                          </div>
                        </div>

                        <div className="lg:w-[190px] shrink-0 lg:border-l border-[#202124] lg:pl-4 flex flex-col justify-center">
                          <div className="text-[12px] font-medium text-white/90 truncate">{sub.city}</div>
                          <div className="text-[10.5px] text-white/40 mt-0.5 flex items-center gap-1.5">
                            {sub.type === 'family' ? <Users className="w-3 h-3" /> : <User className="w-3 h-3" />}
                            {sub.type === 'family' ? `${sub.applicantsCount} заявителя` : '1 заявитель'}
                          </div>
                        </div>

                        <div className="hidden lg:flex w-[136px] shrink-0 flex-col justify-center">
                          <div className="text-[12px] font-medium text-white/90 truncate">{sub.tripDates}</div>
                          <div className="text-[10.5px] text-white/40 mt-0.5">Вылет: {formatShortDate(sub.departureDate)}</div>
                        </div>

                        <div className="hidden xl:flex w-[118px] shrink-0 flex-col justify-center">
                          <div className="text-[12px] font-medium text-white/90 truncate">{formatShortDate(sub.createdAt)}</div>
                          <div className="text-[10.5px] text-white/40 mt-0.5">Дата создания</div>
                        </div>

                        <div className="hidden lg:flex w-[154px] shrink-0 flex-col items-start justify-center gap-1">
                          {getStatusBadge(sub.status)}
                          <span className={`text-[10.5px] ${sub.issuesCount > 0 ? 'text-[#d59aa3]' : 'text-white/35'}`}>
                            Проблем: {sub.issuesCount}
                          </span>
                        </div>

                        <div className="lg:w-[154px] shrink-0 flex items-center justify-end lg:justify-center mt-2 lg:mt-0">
                          <button
                            onClick={(e) => { e.stopPropagation(); handleOpenQuestionnaire(sub.id); }}
                            tabIndex={0}
                            className="h-10 px-4 w-full lg:w-auto bg-[#1e1e21] hover:bg-[#27272b] border border-[#242529] rounded-[10px] text-sm text-white transition-colors flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]"
                          >
                            <span>Открыть</span>
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
            
          </div>
        </div>
      </main>

      <Drawer 
        isOpen={drawerOpen} 
        onClose={() => setDrawerOpen(false)} 
        submissionId={selectedRow}
        onOpenQuestionnaire={() => handleOpenQuestionnaire(selectedRow!)}
      />
    </div>
  );
}
