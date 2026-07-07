import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  X, CheckCircle2, FileText, Image as ImageIcon,
  Users, History, ScanText, MessageSquarePlus,
  AlertCircle, FileWarning, Info
} from 'lucide-react';

interface AdminReviewDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  submissionId: string | null;
  onVerifyDocument: () => void;
  onAddRemark: (field?: string, applicant?: string) => void;
}

type TabId = 'overview' | 'applicants' | 'questionnaire' | 'media' | 'issues' | 'history';

// --- Helper Components for the Questionnaire Tab ---

const FieldRow = ({ 
  label, value, status, hasDocument, onVerify, onRemark, onApprove 
}: { 
  label: string, value: string, status: 'ok' | 'pending' | 'error', hasDocument?: boolean, 
  onVerify?: () => void, onRemark?: () => void, onApprove?: () => void 
}) => (
  <div className={`flex flex-col lg:flex-row lg:items-center justify-between p-4 bg-[#1a1a1d] border rounded-xl gap-4 transition-colors
    ${status === 'error' ? 'border-white/10 bg-white/[0.035]' : 'border-[#242529] hover:border-[#2e2f34]'}
  `}>
    <div className="flex-1 min-w-0">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-[11.5px] font-medium text-white/40 uppercase tracking-wider">{label}</span>
        {status === 'error' && <span className="px-1.5 py-0.5 rounded text-[10px] bg-white/[0.06] text-white/62 font-medium">Есть замечание</span>}
        {status === 'ok' && <span className="px-1.5 py-0.5 rounded text-[10px] bg-white/[0.06] text-[#b8baff] font-medium">Проверено</span>}
      </div>
      <div className="text-[14px] text-white font-medium truncate">{value}</div>
    </div>
    <div className="flex items-center gap-2 shrink-0">
      {hasDocument && (
        <button 
          onClick={onVerify} 
          className="h-8 px-3 rounded-lg bg-[#6f64ff]/10 border border-[#6f64ff]/20 text-[#b8baff] text-[12px] font-medium hover:bg-[#6f64ff]/20 transition-colors flex items-center gap-1.5 focus-visible:ring-2 focus-visible:ring-[#3a45b4] outline-none"
        >
          <ScanText className="w-3.5 h-3.5" /> Сверить с паспортом
        </button>
      )}
      <button 
        onClick={onRemark} 
        className="w-8 h-8 rounded-lg bg-white/[0.045] text-white/62 flex items-center justify-center hover:bg-white/[0.06] transition-colors border border-transparent hover:border-white/10 focus-visible:ring-2 focus-visible:ring-[#6f64ff]/60 outline-none" 
        title="Добавить замечание"
      >
        <MessageSquarePlus className="w-4 h-4" />
      </button>
      <button 
        onClick={onApprove}
        className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors border focus-visible:ring-2 focus-visible:ring-[#6f64ff]/60 outline-none
          ${status === 'ok' ? 'bg-white/[0.06] text-[#b8baff] border-white/12' : 'bg-white/5 text-white/40 border-transparent hover:bg-white/[0.045] hover:text-[#b8baff] hover:border-white/10'}`} 
        title="Пометить как проверенное"
      >
        <CheckCircle2 className="w-4 h-4" />
      </button>
    </div>
  </div>
);

const QuestionnaireTab = ({ onVerifyDocument, onAddRemark }: any) => {
  const [applicant, setApplicant] = useState('app1');

  return (
    <div className="space-y-6 lg:space-y-8">
      {/* Filters / Selectors */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 bg-white/[0.02] border border-white/5 rounded-2xl">
        <div>
          <div className="text-[11px] text-white/50 uppercase tracking-wider font-medium mb-1.5">Заявитель</div>
          <select 
            value={applicant}
            onChange={(e) => setApplicant(e.target.value)}
            className="h-10 w-full sm:w-[240px] bg-[#1e1e21] border border-[#242529] rounded-xl px-3 text-[13px] text-white outline-none focus:border-[#6f64ff] focus:ring-1 focus:ring-[#3a45b4]/30"
          >
            <option value="app1">Иван Петров (Основной)</option>
            <option value="app2">Анна Петрова (Супруга)</option>
          </select>
        </div>
        
        <div className="flex items-center gap-4 text-[12px] font-medium">
          <div className="flex items-center gap-1.5 text-[#b8baff]">
            <CheckCircle2 className="w-4 h-4" /> 24 проверено
          </div>
          <div className="flex items-center gap-1.5 text-white/40">
            <span className="w-2 h-2 rounded-full bg-white/20" /> 12 осталось
          </div>
          <div className="flex items-center gap-1.5 text-white/62">
            <AlertCircle className="w-4 h-4" /> 1 замечание
          </div>
        </div>
      </div>

      {/* Sections */}
      <div className="space-y-6">
        {/* Section 1 */}
        <section>
          <h3 className="text-[15px] font-semibold text-white flex items-center gap-2 mb-4">
            <span className="w-6 h-6 rounded-md bg-white/5 flex items-center justify-center text-[12px] text-white/60 font-mono">1</span>
            Личные данные
          </h3>
          <div className="space-y-2">
            <FieldRow label="Фамилия (Surname)" value="PETROV" status="ok" onRemark={() => onAddRemark('Фамилия')} />
            <FieldRow label="Имя (First name)" value="IVAN" status="ok" onRemark={() => onAddRemark('Имя')} />
            <FieldRow label="Дата рождения" value="12.05.1985" status="pending" onRemark={() => onAddRemark('Дата рождения')} />
            <FieldRow label="Место рождения" value="MOSCOW" status="error" onRemark={() => onAddRemark('Место рождения')} />
          </div>
        </section>

        {/* Section 2 */}
        <section>
          <h3 className="text-[15px] font-semibold text-white flex items-center gap-2 mb-4">
            <span className="w-6 h-6 rounded-md bg-white/5 flex items-center justify-center text-[12px] text-white/60 font-mono">2</span>
            Паспортные данные
          </h3>
          <div className="space-y-2">
            <FieldRow 
              label="Номер паспорта" 
              value="75 1234567" 
              status="pending" 
              hasDocument 
              onVerify={onVerifyDocument}
              onRemark={() => onAddRemark('Номер паспорта')} 
            />
            <FieldRow 
              label="Дата выдачи" 
              value="15.06.2020" 
              status="pending" 
              hasDocument 
              onVerify={onVerifyDocument}
              onRemark={() => onAddRemark('Дата выдачи')} 
            />
            <FieldRow 
              label="Кем выдан" 
              value="FMS 770-123" 
              status="pending" 
              hasDocument 
              onVerify={onVerifyDocument}
              onRemark={() => onAddRemark('Кем выдан')} 
            />
          </div>
        </section>
      </div>
    </div>
  );
};


// --- Main Drawer Component ---

export function AdminReviewDrawer({ isOpen, onClose, submissionId, onVerifyDocument, onAddRemark }: AdminReviewDrawerProps) {
  const [activeTab, setActiveTab] = useState<TabId>('questionnaire');

  // Focus and Keyboard Management
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) onClose();
    };

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

  const tabs = [
    { id: 'overview', label: 'Обзор', icon: Info },
    { id: 'applicants', label: 'Заявители', icon: Users },
    { id: 'questionnaire', label: 'Анкета', icon: FileText, count: 12 },
    { id: 'media', label: 'Файлы', icon: ImageIcon },
    { id: 'issues', label: 'Замечания', icon: FileWarning, count: 1, isWarning: true },
    { id: 'history', label: 'История', icon: History }
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.25, ease: "easeInOut" }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40"
            onClick={onClose}
          />
          
          <motion.div
            role="dialog"
            initial={{ x: '100%', opacity: 0.5, filter: 'blur(8px)' }}
            animate={{ x: 0, opacity: 1, filter: 'blur(0px)' }}
            exit={{ x: '100%', opacity: 0, filter: 'blur(4px)' }}
            transition={{ type: "spring", damping: 26, stiffness: 220, mass: 1 }}
            className="fixed z-50 flex flex-col bg-[#111113] shadow-[0_24px_80px_rgba(0,0,0,0.6)]
              lg:inset-y-2 lg:right-2 lg:w-[860px] lg:rounded-2xl lg:border border-white/10 overflow-hidden
              inset-x-0 bottom-0 top-12 rounded-t-[28px] border-t border-x
            "
          >
            {/* Header */}
            <header className="px-5 lg:px-8 pt-5 pb-0 border-b border-white/5 bg-[#111113]/90 backdrop-blur-md z-20 shrink-0">
              <div className="flex items-start justify-between gap-4 mb-5">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 text-[11px] lg:text-xs text-white/50 mb-2">
                    <span className="font-mono font-medium tracking-wider text-white/70">{submissionId || 'SUB-1042'}</span>
                    <span className="w-1 h-1 rounded-full bg-white/20" />
                    <span>Семья Петровых</span>
                  </div>
                  <h2 className="text-[20px] lg:text-[24px] font-semibold text-white leading-tight tracking-tight flex items-center gap-3">
                    Проверка пакета
                    <span className="px-2.5 py-1 rounded-full bg-white/[0.045] border border-white/10 text-white/62 text-[11px] font-medium uppercase tracking-wide">
                      На проверке
                    </span>
                  </h2>
                </div>
                
                <button 
                  onClick={onClose}
                  className="w-10 h-10 flex items-center justify-center bg-white/5 hover:bg-white/10 text-white/70 hover:text-white rounded-xl transition-colors border border-white/5 hover:border-white/10 focus-visible:ring-2 focus-visible:ring-[#3a45b4] outline-none"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* Tabs */}
              <div className="w-full overflow-x-auto scrollbar-hide -mx-5 px-5 lg:mx-0 lg:px-0">
                <div className="flex items-center gap-1.5 w-max mb-[-1px]">
                  {tabs.map(tab => (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id as TabId)}
                      className={`relative min-h-[44px] px-4 text-[13px] font-medium transition-colors flex items-center gap-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4] whitespace-nowrap
                        ${activeTab === tab.id ? 'text-white' : 'text-white/50 hover:text-white/80'}
                      `}
                    >
                      <tab.icon className={`w-4 h-4 ${activeTab === tab.id ? (tab.isWarning ? 'text-white/62' : 'text-[#b8baff]') : 'opacity-70'}`} />
                      <span>{tab.label}</span>
                      {tab.count && (
                        <span className={`px-1.5 py-0.5 rounded-md text-[10px] leading-none ml-1 ${tab.isWarning ? 'bg-white/[0.06] text-white/62' : 'bg-white/10 text-white/70'}`}>
                          {tab.count}
                        </span>
                      )}
                      {activeTab === tab.id && (
                        <motion.div
                          layoutId="adminActiveTab"
                          className="absolute bottom-0 inset-x-0 h-0.5 bg-[#6f64ff]"
                          initial={false}
                          transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                        />
                      )}
                    </button>
                  ))}
                </div>
              </div>
            </header>

            {/* Scrollable Content */}
            <div className="flex-1 overflow-y-auto p-5 lg:p-8 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
              <AnimatePresence mode="wait">
                <motion.div
                  key={activeTab}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.2 }}
                >
                  {activeTab === 'questionnaire' ? (
                    <QuestionnaireTab onVerifyDocument={onVerifyDocument} onAddRemark={onAddRemark} />
                  ) : (
                    <div className="flex flex-col items-center justify-center py-20 text-center text-white/50">
                      Контент вкладки "{tabs.find(t => t.id === activeTab)?.label}"
                    </div>
                  )}
                </motion.div>
              </AnimatePresence>
            </div>

            {/* Footer Action */}
            <footer className="p-4 lg:px-8 lg:py-5 border-t border-white/10 bg-[#111113]/90 backdrop-blur-md shrink-0 flex justify-end gap-3 pb-[max(16px,env(safe-area-inset-bottom))]">
              <button 
                onClick={onClose}
                className="h-11 px-5 bg-white/5 hover:bg-white/10 text-white font-medium text-[13px] rounded-xl transition-colors border border-white/5"
              >
                Отложить
              </button>
              <button className="h-11 px-6 bg-[#202126] hover:bg-[#2a2b32] text-white font-medium text-[13px] rounded-xl shadow-[0_0_28px_rgba(111,100,255,0.16)] transition-colors flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4" /> Завершить проверку
              </button>
            </footer>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}