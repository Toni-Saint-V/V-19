import { lazy, Suspense, useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldCheck, DownloadCloud, Settings,
  Users, Menu, X, ArrowLeftRight, CheckCircle2, XCircle
} from 'lucide-react';
import { ReviewScreen } from './AdminScreens';
import { AdminExportScreen } from './AdminExportScreen';
import { ReviewWorkspace } from './ReviewWorkspace';
import { AdminReviewDrawer } from './AdminReviewDrawer';
import { RemarkForm } from './RemarkForm';
import visaflowLogo from '../assets/visaflow-logo.png';
import type { AccessRequest } from '../shared/authRegistration';
import type { Submission } from '../modules/submissions/types';
import {
  emitVisaflowUiEvent,
  useVisaflowBusinessBridge,
  type AdminNavSection as BridgeAdminNavSection,
} from '../integration/visaflowBusinessBridge';

type AdminNavSection = BridgeAdminNavSection | 'users';
type AdminViewState = 'main' | 'review_workspace';

const SettingsScreen = lazy(() => import('../modules/submissions/pages/SettingsScreen'));

const accessRequestStatusCopy: Record<AccessRequest['status'], string> = {
  approved: 'approved',
  pending: 'pending',
  rejected: 'rejected',
};

const accessRequestStatusClassName: Record<AccessRequest['status'], string> = {
  approved: 'border-[#244238] bg-[#14251f] text-[#8fe7c1]',
  pending: 'border-[#3b321d] bg-[#221d13] text-[#f6c66b]',
  rejected: 'border-[#44262b] bg-[#26191c] text-[#ffadb4]',
};

function formatAccessRequestDate(createdAt: string) {
  const date = new Date(createdAt);
  if (Number.isNaN(date.getTime())) return createdAt;

  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    month: '2-digit',
  }).format(date);
}

function AdminUsersAccessPanel({
  busy,
  requests,
  onApprove,
  onReject,
}: {
  busy: boolean;
  requests: AccessRequest[];
  onApprove: (requestId: string) => void;
  onReject: (requestId: string) => void;
}) {
  const pendingCount = requests.filter((request) => request.status === 'pending').length;
  const historyCount = requests.length - pendingCount;
  const [activeAccessTab, setActiveAccessTab] = useState<'pending' | 'history'>('pending');
  const visibleRequests = requests.filter((request) =>
    activeAccessTab === 'pending' ? request.status === 'pending' : request.status !== 'pending',
  );
  const emptyTitle = activeAccessTab === 'pending' ? 'Новых заявок нет' : 'История пока пустая';
  const emptyCopy =
    activeAccessTab === 'pending'
      ? 'Когда агент отправит форму регистрации, карточка появится здесь с действиями одобрения и отклонения.'
      : 'Одобренные и отклонённые заявки остаются здесь после рассмотрения.';

  return (
    <section
      className="grid gap-4"
      aria-labelledby="admin-users-access-title"
      data-testid="admin-users-access-requests"
    >
      <div className="flex flex-col gap-3 rounded-2xl border border-[#242529] bg-[#161617] p-5 md:flex-row md:items-center md:justify-between">
        <div className="min-w-0">
          <p className="m-0 text-[12px] font-semibold uppercase tracking-[0.16em] text-white/38">
            Входящие заявки
          </p>
          <h2
            id="admin-users-access-title"
            className="m-0 mt-1 text-[22px] font-semibold tracking-tight text-white"
          >
            Заявки на доступ
          </h2>
          <p className="m-0 mt-2 max-w-[680px] text-[13px] leading-5 text-white/52">
            Новые агенты попадают сюда после формы регистрации. До одобрения они не видят рабочий кабинет.
          </p>
        </div>
        <div className="grid gap-1 text-right">
          <div className="flex h-11 min-w-11 items-center justify-center rounded-xl border border-[#26306f] bg-[#18205a] px-3 text-[13px] font-semibold text-[#dfe4ff]">
            {requests.length}
          </div>
          <span className="text-[11px] text-white/38">всего</span>
        </div>
      </div>

      <div className="inline-flex w-fit rounded-[11px] border border-[#242529] bg-[#1a1a1d] p-1">
        <button
          className={`h-9 rounded-[8px] px-3 text-[12px] font-semibold transition-colors ${
            activeAccessTab === 'pending'
              ? 'bg-[#3a1e24] text-[#ffbdc3]'
              : 'text-white/54 hover:bg-white/[0.04] hover:text-white'
          }`}
          type="button"
          onClick={() => setActiveAccessTab('pending')}
        >
          Новые {pendingCount}
        </button>
        <button
          className={`h-9 rounded-[8px] px-3 text-[12px] font-semibold transition-colors ${
            activeAccessTab === 'history'
              ? 'bg-[#18205a] text-[#dfe4ff]'
              : 'text-white/54 hover:bg-white/[0.04] hover:text-white'
          }`}
          type="button"
          onClick={() => setActiveAccessTab('history')}
        >
          История {historyCount}
        </button>
      </div>

      {visibleRequests.length ? (
        <div className="grid gap-2.5">
          {visibleRequests.map((request) => (
            <article
              className="grid gap-4 rounded-2xl border border-[#242529] bg-[#161617] p-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-center"
              key={request.id}
            >
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <strong className="text-[15px] font-semibold text-white">
                    {request.fullName}
                  </strong>
                  <span className="rounded-full border border-[#2e2f34] bg-[#202126] px-2 py-0.5 text-[11px] font-medium text-[#b8baff]">
                    agent
                  </span>
                  <span className={`rounded-full border px-2 py-0.5 text-[11px] font-medium ${accessRequestStatusClassName[request.status]}`}>
                    {accessRequestStatusCopy[request.status]}
                  </span>
                </div>
                <p className="m-0 mt-2 text-[13px] text-white/62">
                  {request.companyName} · {request.city} · {request.phone}
                </p>
                <p className="m-0 mt-1 text-[12px] text-white/42">
                  {request.email} · {formatAccessRequestDate(request.createdAt)}
                </p>
              </div>

              {request.status === 'pending' ? (
                <div className="grid grid-cols-2 gap-2 md:flex md:justify-end">
                  <button
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] border border-[#2a2224] bg-[#1f1719] px-3 text-[12px] font-semibold text-[#ffadb4] transition-colors hover:border-[#513036] hover:bg-[#281c20] disabled:cursor-not-allowed disabled:opacity-55"
                    disabled={busy}
                    type="button"
                    onClick={() => onReject(request.id)}
                  >
                    <XCircle className="h-4 w-4" />
                    Отклонить
                  </button>
                  <button
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-[10px] border border-[#4450c5] bg-[#3a45b4] px-3 text-[12px] font-semibold text-white transition-colors hover:bg-[#4855d4] disabled:cursor-not-allowed disabled:opacity-55"
                    disabled={busy}
                    type="button"
                    onClick={() => onApprove(request.id)}
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    Одобрить
                  </button>
                </div>
              ) : (
                <div className="inline-flex h-10 items-center justify-center rounded-[10px] border border-[#242529] bg-[#1e1e21] px-3 text-[12px] font-semibold text-white/54">
                  {request.status === 'approved' ? 'Доступ выдан' : 'Заявка отклонена'}
                </div>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="flex min-h-[360px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#242529] bg-[#161617] p-8 text-center">
          <Users className="mb-4 h-10 w-10 text-white/20" />
          <h3 className="m-0 text-[16px] font-medium text-white">{emptyTitle}</h3>
          <p className="m-0 mt-2 max-w-[420px] text-[13px] leading-5 text-white/50">
            {emptyCopy}
          </p>
        </div>
      )}
    </section>
  );
}

export function AdminWorkspace({
  accessRequests = [],
  accessRequestsBusy = false,
  currentEmail = '',
  onApproveAccessRequest = () => undefined,
  onRejectAccessRequest = () => undefined,
  onSignOut,
  onSwitchWorkspace,
  submissions,
}: {
  accessRequests?: AccessRequest[];
  accessRequestsBusy?: boolean;
  currentEmail?: string;
  onApproveAccessRequest?: (requestId: string) => void;
  onRejectAccessRequest?: (requestId: string) => void;
  onSignOut: () => void | Promise<void>;
  onSwitchWorkspace?: () => void;
  submissions?: Submission[];
}) {
  const bridge = useVisaflowBusinessBridge();
  const [activeNav, setActiveNav] = useState<AdminNavSection>('review');
  const [currentView, setCurrentView] = useState<AdminViewState>('main');
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [bottomProfileMenuOpen, setBottomProfileMenuOpen] = useState(false);
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const pendingAccessRequestCount = accessRequests.filter((request) => request.status === 'pending').length;
  
  // Drawer & Form State
  const [adminDrawerOpen, setAdminDrawerOpen] = useState(false);
  const [remarkFormOpen, setRemarkFormOpen] = useState(false);
  const [remarkContext, setRemarkContext] = useState<{ field?: string, applicant?: string }>({});

  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) setMobileNavOpen(false);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  const handleOpenReviewDrawer = (id: string) => {
    bridge.onAdminReviewOpen?.(id);
    emitVisaflowUiEvent(bridge, { type: 'admin.review.open', submissionId: id });
    setSelectedRow(id);
    setAdminDrawerOpen(true);
  };

  const handleVerifyDocument = () => {
    bridge.onVerifyDocument?.(selectedRow);
    emitVisaflowUiEvent(bridge, { type: 'admin.document.verify', submissionId: selectedRow });
    setAdminDrawerOpen(false);
    setCurrentView('review_workspace');
  };

  const handleBackToDrawer = () => {
    setCurrentView('main');
    setAdminDrawerOpen(true);
  };

  const handleOpenRemark = (field?: string, applicant?: string) => {
    const payload = { submissionId: selectedRow, field, applicant };
    bridge.onRemarkOpen?.(payload);
    emitVisaflowUiEvent(bridge, { type: 'remark.open', payload });
    setRemarkContext({ field, applicant });
    setRemarkFormOpen(true);
  };

  const navigateTo = (nav: AdminNavSection) => {
    if (nav !== 'users') {
      bridge.onAdminNavChange?.(nav);
      emitVisaflowUiEvent(bridge, { type: 'admin.nav', section: nav });
    }
    setActiveNav(nav);
    setMobileNavOpen(false);
    setBottomProfileMenuOpen(false);
    setUserMenuOpen(false);
  };

  const renderNavContent = () => (
    <>
      <div className="flex items-center gap-3 px-10 pt-3 pb-2.5 mb-2 border-b border-[#242529]">
        <img
          src={visaflowLogo}
          alt="VisaFlow"
          className="h-8 w-8 rounded-lg object-cover shadow-[0_0_24px_rgba(111,100,255,0.10)]"
        />
        <div className="flex-1 min-w-0">
          <div className="text-[16px] font-[500] tracking-tight">VisaFlow V-19</div>
        </div>
        <button onClick={() => setMobileNavOpen(false)} className="md:hidden p-2 text-white/50 hover:text-white">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-4 space-y-5 scrollbar-hide">
        <nav className="space-y-0.5">
          <div className="px-2 pb-1 text-[11px] text-white/40 font-medium tracking-wide uppercase">Очередь</div>
          <button onClick={() => navigateTo('review')} className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[8px] text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f64ff]/60 ${activeNav === 'review' ? 'bg-[#27272b] text-white border border-[#2e2f34]' : 'hover:bg-white/5 text-white/70 hover:text-white border border-transparent'}`}>
            <ShieldCheck className="w-4 h-4 text-white/55" /> <span className="flex-1 text-left">Проверка</span>
            <span className="px-1.5 py-0.5 rounded-md bg-white/[0.06] text-white/62 text-[11px] font-medium">2</span>
          </button>
          <button onClick={() => navigateTo('export')} className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[8px] text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f64ff]/60 ${activeNav === 'export' ? 'bg-[#27272b] text-white border border-[#2e2f34]' : 'hover:bg-white/5 text-white/70 hover:text-white border border-transparent'}`}>
            <DownloadCloud className="w-4 h-4 text-[#b8baff]/75" /> <span className="flex-1 text-left">Выгрузка</span>
            <span className="px-1.5 py-0.5 rounded-md bg-white/[0.06] text-[#b8baff] text-[11px] font-medium">3</span>
          </button>
        </nav>

        <nav className="space-y-0.5">
          <div className="px-2 pb-1 text-[11px] text-white/40 font-medium tracking-wide uppercase">Система</div>
          <button onClick={() => navigateTo('users')} className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[8px] text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f64ff]/60 ${activeNav === 'users' ? 'bg-[#27272b] text-white border border-[#2e2f34]' : 'hover:bg-white/5 text-white/70 hover:text-white border border-transparent'}`}>
            <Users className="w-4 h-4" /> <span className="flex-1 text-left">Пользователи</span>
            {pendingAccessRequestCount ? (
              <span className="px-1.5 py-0.5 rounded-md bg-[#5a1f2a] text-[#ffccd1] text-[11px] font-medium">
                {pendingAccessRequestCount}
              </span>
            ) : null}
          </button>
          <button onClick={() => navigateTo('settings')} className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-[8px] text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f64ff]/60 ${activeNav === 'settings' ? 'bg-[#27272b] text-white border border-[#2e2f34]' : 'hover:bg-white/5 text-white/70 hover:text-white border border-transparent'}`}>
            <Settings className="w-4 h-4" /> <span className="flex-1 text-left">Настройки</span>
          </button>
        </nav>
      </div>

      <div className="relative mt-auto border-t border-[#202124] p-3 mx-2 space-y-2">
        <AnimatePresence>
          {bottomProfileMenuOpen ? (
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.98 }}
              transition={{ duration: 0.14 }}
              className="absolute bottom-[88px] left-3 right-3 z-40 rounded-xl border border-[#242529] bg-[#1a1a1d] p-1 shadow-[0_18px_45px_rgba(0,0,0,0.35)]"
            >
              <button
                type="button"
                onClick={() => navigateTo('settings')}
                className="flex h-10 w-full items-center gap-2 rounded-[8px] px-3 text-left text-[13px] font-medium text-white/80 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f64ff]/60"
              >
                <Settings className="h-4 w-4 text-white/55" />
                Настройки
              </button>
              {onSwitchWorkspace ? (
                <button
                  type="button"
                  onClick={() => {
                    setBottomProfileMenuOpen(false);
                    onSwitchWorkspace();
                  }}
                  className="flex h-10 w-full items-center gap-2 rounded-[8px] px-3 text-left text-[13px] font-medium text-white/80 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f64ff]/60"
                >
                  <ArrowLeftRight className="h-4 w-4 text-white/55" />
                  В агентскую зону
                </button>
              ) : null}
              <button
                type="button"
                onClick={() => {
                  setBottomProfileMenuOpen(false);
                  void onSignOut();
                }}
                className="flex h-10 w-full items-center gap-2 rounded-[8px] px-3 text-left text-[13px] font-medium text-[#ffadb4] transition-colors hover:bg-[#281c20] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f64ff]/60"
              >
                <XCircle className="h-4 w-4" />
                Выйти
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>
        {onSwitchWorkspace ? (
          <button
            onClick={() => setBottomProfileMenuOpen((open) => !open)}
            aria-label="Профиль администратора"
            aria-expanded={bottomProfileMenuOpen}
            className="w-full min-h-[64px] px-3 py-2 bg-transparent hover:bg-white/[0.04] border border-[#242529] rounded-xl text-left transition-colors flex items-center gap-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/10 bg-[#27272b] text-[11px] font-semibold text-white/80">
              АД
            </span>
            <span className="min-w-0 flex-1">
              <span className="block whitespace-normal text-[12.5px] font-medium leading-4 text-white">Алексей Дмитриев</span>
              <span className="block text-[10.5px] font-medium leading-4 text-white/42">Администратор</span>
            </span>
            <ArrowLeftRight className="w-4 h-4 shrink-0 text-white/42" />
          </button>
        ) : null}
      </div>
    </>
  );

  const getPageTitle = () => {
    switch (activeNav) {
      case 'review': return 'Проверка';
      case 'export': return 'Центр выгрузки';
      case 'users': return 'Управление пользователями';
      case 'settings': return 'Системные настройки';
    }
  };

  return (
    <div className="flex h-full w-full bg-[#101011] relative overflow-hidden">
      
      {currentView === 'review_workspace' && selectedRow && (
        <ReviewWorkspace 
          submissionId={selectedRow} 
          onBack={handleBackToDrawer}
          onAddRemark={(field) => handleOpenRemark(field)}
        />
      )}

      {/* Admin Review Drawer */}
      <AdminReviewDrawer 
        isOpen={adminDrawerOpen}
        onClose={() => setAdminDrawerOpen(false)}
        submissionId={selectedRow}
        onVerifyDocument={handleVerifyDocument}
        onAddRemark={handleOpenRemark}
      />

      {/* Shared Remark Form */}
      <RemarkForm 
        isOpen={remarkFormOpen}
        onClose={() => setRemarkFormOpen(false)}
        submissionId={selectedRow || ''}
        defaultField={remarkContext.field}
        defaultApplicant={remarkContext.applicant}
      />

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
      <aside className="hidden md:flex w-[260px] shrink-0 bg-[#161617] border-r border-[#202124] flex-col py-3 z-20">
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
          <div className="relative ml-auto flex items-center gap-2">
            <button
              type="button"
              aria-label="Профиль администратора"
              aria-expanded={userMenuOpen}
              onClick={() => setUserMenuOpen((open) => !open)}
              className="w-8 h-8 rounded-full bg-gradient-to-br from-[#2a2a30] to-[#1a1a20] border border-white/10 flex items-center justify-center text-xs font-medium text-white/70 shadow-inner transition-colors hover:border-white/20 hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f64ff]/60"
            >
              АД
            </button>
            <AnimatePresence>
              {userMenuOpen && (
                <motion.div
                  initial={{ opacity: 0, y: -4, scale: 0.98 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -4, scale: 0.98 }}
                  transition={{ duration: 0.14 }}
                  className="absolute right-0 top-10 z-30 w-36 rounded-[8px] border border-[#242529] bg-[#1a1a1d] p-1 shadow-[0_18px_45px_rgba(0,0,0,0.35)]"
                >
                  <button
                    type="button"
                    onClick={() => {
                      setUserMenuOpen(false);
                      void onSignOut();
                    }}
                    className="w-full rounded-[6px] px-3 py-2 text-left text-[13px] font-medium text-white/80 transition-colors hover:bg-white/[0.06] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f64ff]/60"
                  >
                    Выйти
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </header>

        {/* Dynamic View Content */}
        <div className="flex-1 overflow-auto p-4 lg:p-6 pb-[max(24px,env(safe-area-inset-bottom))]">
          <div className="max-w-[1460px] mx-auto h-full">
            {activeNav === 'review' && <ReviewScreen onOpenDrawer={handleOpenReviewDrawer} />}
            {activeNav === 'export' && <AdminExportScreen submissions={submissions} />}
            {activeNav === 'users' && (
              <AdminUsersAccessPanel
                busy={accessRequestsBusy}
                requests={accessRequests}
                onApprove={onApproveAccessRequest}
                onReject={onRejectAccessRequest}
              />
            )}
            {activeNav === 'settings' && (
              <Suspense
                fallback={
                  <div
                    className="flex min-h-[360px] items-center justify-center rounded-2xl border border-[#242529] bg-[#161617] text-[13px] text-white/54"
                    role="status"
                    aria-live="polite"
                  >
                    Загрузка настроек...
                  </div>
                }
              >
                <SettingsScreen
                  accessRequests={accessRequests}
                  accessRequestsBusy={accessRequestsBusy}
                  confirmLeave={false}
                  dirty={false}
                  email={currentEmail}
                  isSupabaseMode={false}
                  onApproveAccessRequest={onApproveAccessRequest}
                  onCancelLeave={() => undefined}
                  onConfirmLeave={() => undefined}
                  onRejectAccessRequest={onRejectAccessRequest}
                  onReset={() => undefined}
                  onSave={() => undefined}
                  onSettings={() => undefined}
                  onSignOut={onSignOut}
                  role="admin"
                  saveState="idle"
                  settings={{ compactLists: true, digest: 'instant', drawerHints: true }}
                />
              </Suspense>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
