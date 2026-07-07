import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  ShieldCheck, DownloadCloud, Settings, 
  Users, Menu, X, SlidersHorizontal, ArrowLeftRight
} from 'lucide-react';
import { ReviewScreen } from './AdminScreens';
import { AdminExportScreen } from './AdminExportScreen';
import { ReviewWorkspace } from './ReviewWorkspace';
import { AdminReviewDrawer } from './AdminReviewDrawer';
import { RemarkForm } from './RemarkForm';
import {
  emitVisaflowUiEvent,
  useVisaflowBusinessBridge,
  type AdminNavSection as BridgeAdminNavSection,
} from '../integration/visaflowBusinessBridge';

type AdminNavSection = BridgeAdminNavSection;
type AdminViewState = 'main' | 'review_workspace';

export function AdminWorkspace({ onSwitchWorkspace }: { onSwitchWorkspace: () => void }) {
  const bridge = useVisaflowBusinessBridge();
  const [activeNav, setActiveNav] = useState<AdminNavSection>('review');
  const [currentView, setCurrentView] = useState<AdminViewState>('main');
  const [selectedRow, setSelectedRow] = useState<string | null>(null);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  
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
    bridge.onAdminNavChange?.(nav);
    emitVisaflowUiEvent(bridge, { type: 'admin.nav', section: nav });
    setActiveNav(nav);
    setMobileNavOpen(false);
  };

  const renderNavContent = () => (
    <>
      <div className="flex items-center gap-2.5 px-2 pb-4 mb-2 border-b border-[#242529]">
        <div className="w-8 h-8 rounded-lg bg-[#24242a] text-white flex items-center justify-center font-bold text-sm shadow-[0_0_24px_rgba(111,100,255,0.10)]">A</div>
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold tracking-tight">VisaFlow V-19</div>
          <div className="text-[11px] text-white/62 font-medium">Admin Zone</div>
        </div>
        <button onClick={() => setMobileNavOpen(false)} className="md:hidden p-2 text-white/50 hover:text-white">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-4 space-y-5 scrollbar-hide">
        <nav className="space-y-0.5">
          <div className="px-2 pb-1 text-[11px] text-white/40 font-medium tracking-wide uppercase">Очередь</div>
          <button onClick={() => navigateTo('review')} className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f64ff]/60 ${activeNav === 'review' ? 'bg-[#27272b] text-white border border-[#2e2f34]' : 'hover:bg-white/5 text-white/70 hover:text-white border border-transparent'}`}>
            <ShieldCheck className="w-4 h-4 text-white/55" /> <span className="flex-1 text-left">Проверка</span>
            <span className="px-1.5 py-0.5 rounded-md bg-white/[0.06] text-white/62 text-[11px] font-medium">2</span>
          </button>
          <button onClick={() => navigateTo('export')} className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f64ff]/60 ${activeNav === 'export' ? 'bg-[#27272b] text-white border border-[#2e2f34]' : 'hover:bg-white/5 text-white/70 hover:text-white border border-transparent'}`}>
            <DownloadCloud className="w-4 h-4 text-[#b8baff]/75" /> <span className="flex-1 text-left">Выгрузка</span>
            <span className="px-1.5 py-0.5 rounded-md bg-white/[0.06] text-[#b8baff] text-[11px] font-medium">3</span>
          </button>
        </nav>

        <nav className="space-y-0.5">
          <div className="px-2 pb-1 text-[11px] text-white/40 font-medium tracking-wide uppercase">Система</div>
          <button onClick={() => navigateTo('users')} className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f64ff]/60 ${activeNav === 'users' ? 'bg-[#27272b] text-white border border-[#2e2f34]' : 'hover:bg-white/5 text-white/70 hover:text-white border border-transparent'}`}>
            <Users className="w-4 h-4" /> <span className="flex-1 text-left">Пользователи</span>
          </button>
          <button onClick={() => navigateTo('settings')} className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-lg text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#6f64ff]/60 ${activeNav === 'settings' ? 'bg-[#27272b] text-white border border-[#2e2f34]' : 'hover:bg-white/5 text-white/70 hover:text-white border border-transparent'}`}>
            <Settings className="w-4 h-4" /> <span className="flex-1 text-left">Настройки</span>
          </button>
        </nav>
      </div>

      <div className="mt-auto border-t border-[#202124] p-3 mx-2 space-y-2">
        <button 
          onClick={onSwitchWorkspace}
          className="w-full h-10 px-3 bg-[#1e1e21] hover:bg-[#27272b] border border-[#242529] rounded-xl text-[13px] font-medium text-white transition-colors flex items-center justify-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]"
        >
          <ArrowLeftRight className="w-4 h-4 text-white/50" />
          В агентскую зону
        </button>
      </div>
    </>
  );

  const getPageTitle = () => {
    switch (activeNav) {
      case 'review': return 'Очередь на проверку';
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
          <div className="ml-auto flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-[#2a2a30] to-[#1a1a20] border border-white/10 flex items-center justify-center text-xs font-medium text-white/70 shadow-inner">
              АД
            </div>
          </div>
        </header>

        {/* Dynamic View Content */}
        <div className="flex-1 overflow-auto p-4 lg:p-6 pb-[max(24px,env(safe-area-inset-bottom))]">
          <div className="max-w-[1460px] mx-auto h-full">
            {activeNav === 'review' && <ReviewScreen onOpenDrawer={handleOpenReviewDrawer} />}
            {activeNav === 'export' && <AdminExportScreen />}
            {activeNav === 'users' && (
              <div className="flex flex-col items-center justify-center py-32 text-center border border-dashed border-[#242529] rounded-2xl bg-[#161617]">
                <Users className="w-10 h-10 text-white/20 mb-4" />
                <h3 className="text-white font-medium">Пользователи</h3>
                <p className="text-[13px] text-white/50 mt-1">Здесь будет управление ролями и доступом</p>
              </div>
            )}
            {activeNav === 'settings' && (
              <div className="flex flex-col items-center justify-center py-32 text-center border border-dashed border-[#242529] rounded-2xl bg-[#161617]">
                <SlidersHorizontal className="w-10 h-10 text-white/20 mb-4" />
                <h3 className="text-white font-medium">Настройки системы</h3>
                <p className="text-[13px] text-white/50 mt-1">Управление справочниками и правилами экспорта</p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
