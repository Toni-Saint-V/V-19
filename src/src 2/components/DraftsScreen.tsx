import { motion } from 'motion/react';
import { 
  Plus, CheckCircle2, AlertCircle, ScanLine, 
  UploadCloud, ChevronRight, User, Users, FileWarning
} from 'lucide-react';

interface DraftsScreenProps {
  onOpenDrawer: (id: string) => void;
}

// --- Mock Data ---
type DocStatus = 'verified' | 'processing' | 'error' | 'missing';

interface DocumentMatrix {
  passport: DocStatus;
  selfie: DocStatus;
  financial: DocStatus;
  booking: DocStatus;
  insurance: DocStatus;
  questionnaire: DocStatus;
}

interface DraftApplicant {
  id: string;
  name: string;
  role: string;
  docs: DocumentMatrix;
}

interface DraftSubmission {
  id: string;
  title: string;
  type: 'single' | 'family';
  country: string;
  deadline: string;
  applicants: DraftApplicant[];
}

const mockDrafts: DraftSubmission[] = [
  {
    id: 'SUB-1088',
    title: 'Семья Ивановых',
    type: 'family',
    country: 'Испания (Schengen)',
    deadline: 'Через 2 дня',
    applicants: [
      {
        id: 'APP-1',
        name: 'Алексей Иванов',
        role: 'Основной',
        docs: { passport: 'verified', selfie: 'verified', financial: 'verified', booking: 'verified', insurance: 'verified', questionnaire: 'verified' }
      },
      {
        id: 'APP-2',
        name: 'Елена Иванова',
        role: 'Супруга',
        docs: { passport: 'verified', selfie: 'error', financial: 'missing', booking: 'verified', insurance: 'verified', questionnaire: 'processing' }
      },
      {
        id: 'APP-3',
        name: 'Егор Иванов',
        role: 'Ребенок',
        docs: { passport: 'missing', selfie: 'missing', financial: 'verified', booking: 'verified', insurance: 'verified', questionnaire: 'missing' }
      }
    ]
  },
  {
    id: 'SUB-1092',
    title: 'Михаил Соколов',
    type: 'single',
    country: 'Китай (Business)',
    deadline: 'Сегодня',
    applicants: [
      {
        id: 'APP-4',
        name: 'Михаил Соколов',
        role: 'Основной',
        docs: { passport: 'verified', selfie: 'verified', financial: 'error', booking: 'missing', insurance: 'missing', questionnaire: 'missing' }
      }
    ]
  }
];

// --- Helpers ---
const DocCell = ({ status }: { status: DocStatus }) => {
  switch (status) {
    case 'verified':
      return (
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/[0.045] border border-white/10 text-[#b8baff] mx-auto" title="Подтверждено">
          <CheckCircle2 className="w-[18px] h-[18px]" />
        </div>
      );
    case 'processing':
      return (
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/[0.045] border border-white/10 text-[#b8baff] mx-auto" title="OCR распознавание...">
          <ScanLine className="w-[16px] h-[16px] animate-pulse" />
        </div>
      );
    case 'error':
      return (
        <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-[#24191b]/60 border border-[#5b2b32]/50 text-[#d59aa3] mx-auto shadow-[0_0_10px_rgba(239,68,68,0.15)]" title="Ошибка проверки">
          <AlertCircle className="w-[18px] h-[18px]" />
        </div>
      );
    case 'missing':
      return (
        <button className="w-8 h-8 rounded-lg flex items-center justify-center bg-white/5 border border-dashed border-white/20 text-white/30 hover:border-white/50 hover:bg-white/10 hover:text-white mx-auto transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]" title="Загрузить документ">
          <Plus className="w-4 h-4" />
        </button>
      );
  }
};

const docTypes = [
  { key: 'passport', label: 'Загран' },
  { key: 'selfie', label: 'Селфи' },
  { key: 'financial', label: 'Финансы' },
  { key: 'booking', label: 'Билеты' },
  { key: 'insurance', label: 'Страховка' },
  { key: 'questionnaire', label: 'Анкета' }
];

export function DraftsScreen({ onOpenDrawer }: DraftsScreenProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6 lg:space-y-8"
    >
      {/* Top Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-4">
        <div className="p-4 lg:p-5 rounded-2xl bg-gradient-to-br from-[#1a1a1d] to-[#141416] border border-[#242529] shadow-sm flex flex-col justify-between h-[110px]">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-white/50 uppercase tracking-wide">Ждут загрузки</span>
            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center">
              <UploadCloud className="w-4 h-4 text-white/40" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-semibold text-white">24</div>
            <div className="text-[11px] text-white/40 mt-1">Документа по 8 пакетам</div>
          </div>
        </div>

        <div className="p-4 lg:p-5 rounded-2xl bg-gradient-to-br from-[#1a1a1d] to-[#141416] border border-[#242529] shadow-sm flex flex-col justify-between h-[110px]">
          <div className="flex items-center justify-between">
            <span className="text-[12px] font-medium text-white/50 uppercase tracking-wide">В обработке OCR</span>
            <div className="w-8 h-8 rounded-full bg-white/[0.045] flex items-center justify-center">
              <ScanLine className="w-4 h-4 text-[#b8baff]" />
            </div>
          </div>
          <div>
            <div className="text-2xl font-semibold text-white">3</div>
            <div className="text-[11px] text-white/40 mt-1">Распознаются системой</div>
          </div>
        </div>

        <div className="p-4 lg:p-5 rounded-2xl bg-gradient-to-br from-[#1a1a1d] to-[#141416] border border-[#5b2b32]/50 shadow-[0_4px_20px_rgba(239,68,68,0.05)] flex flex-col justify-between h-[110px] relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-32 h-32 bg-[#a35f69]/5 rounded-full blur-2xl -mr-10 -mt-10" />
          <div className="flex items-center justify-between relative z-10">
            <span className="text-[12px] font-medium text-[#d59aa3]/80 uppercase tracking-wide">Ошибки проверки</span>
            <div className="w-8 h-8 rounded-full bg-[#24191b]/60 flex items-center justify-center">
              <FileWarning className="w-4 h-4 text-[#d59aa3]" />
            </div>
          </div>
          <div className="relative z-10">
            <div className="text-2xl font-semibold text-white group-hover:text-[#d59aa3] transition-colors">2</div>
            <div className="text-[11px] text-white/50 mt-1">Требуют ручного ревью</div>
          </div>
        </div>
      </div>

      {/* Matrix Section */}
      <div className="flex flex-col rounded-2xl bg-[#161617] border border-[#242529] overflow-hidden shadow-[0_4px_24px_rgba(0,0,0,0.15)]">
        
        {/* Matrix Header */}
        <div className="px-4 py-4 border-b border-[#242529] bg-[#1a1a1d] flex items-center justify-between">
          <div>
            <h2 className="text-[15px] font-semibold text-white">Матрица сбора документов</h2>
            <p className="text-[12px] text-white/50 mt-1">Сводка по незавершенным черновикам</p>
          </div>
          <button className="hidden sm:flex items-center gap-2 h-9 px-4 bg-white/5 hover:bg-white/10 text-[13px] font-medium text-white rounded-lg transition-colors border border-white/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]">
            <UploadCloud className="w-4 h-4 text-white/70" />
            Массовая загрузка
          </button>
        </div>

        {/* Matrix Table with internal scroll on mobile */}
        <div className="w-full overflow-x-auto scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">
          <div className="min-w-[700px]">
            {/* Table Headers */}
            <div className="flex items-center border-b border-[#242529] bg-[#111113]/50">
              <div className="w-[280px] lg:w-[320px] shrink-0 px-5 py-3 sticky left-0 z-20 bg-[#111113] border-r border-[#242529] text-[11px] font-medium text-white/40 uppercase tracking-wider">
                Пакет / Заявитель
              </div>
              <div className="flex-1 grid grid-cols-6 px-2">
                {docTypes.map(doc => (
                  <div key={doc.key} className="text-center py-3 text-[11px] font-medium text-white/40 uppercase tracking-wider">
                    {doc.label}
                  </div>
                ))}
              </div>
              <div className="w-[60px] shrink-0" />
            </div>

            {/* Submissions List */}
            <div className="divide-y divide-[#202124]">
              {mockDrafts.map((sub) => (
                <div key={sub.id} className="group/sub">
                  
                  {/* Submission Row */}
                  <div className="flex items-center bg-[#1a1a1d] hover:bg-[#1e1e21] transition-colors border-b border-[#202124]">
                    <div className="w-[280px] lg:w-[320px] shrink-0 px-5 py-3.5 sticky left-0 z-20 bg-[#1a1a1d] group-hover/sub:bg-[#1e1e21] border-r border-[#242529] transition-colors">
                      <div className="flex items-center justify-between">
                        <div>
                          <div className="flex items-center gap-2">
                            {sub.type === 'family' ? <Users className="w-3.5 h-3.5 text-white/50" /> : <User className="w-3.5 h-3.5 text-white/50" />}
                            <span className="text-[13px] font-medium text-white">{sub.title}</span>
                          </div>
                          <div className="text-[11px] text-white/40 mt-1 flex items-center gap-2">
                            <span>{sub.country}</span>
                            <span className="w-1 h-1 rounded-full bg-white/20" />
                            <span className="text-white/55">{sub.deadline}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="flex-1 flex justify-center py-3 px-6">
                      <div className="h-[2px] w-full bg-white/5 rounded-full relative overflow-hidden">
                        <div className={`absolute inset-y-0 left-0 bg-[#6f64ff]/40 ${sub.type === 'family' ? 'w-[45%]' : 'w-[20%]'}`} />
                      </div>
                    </div>
                    <div className="w-[60px] shrink-0 flex items-center justify-center">
                      <button 
                        onClick={() => onOpenDrawer(sub.id)}
                        className="w-8 h-8 rounded-lg flex items-center justify-center text-white/30 hover:bg-white/10 hover:text-white transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]"
                      >
                        <ChevronRight className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Applicants Rows */}
                  <div className="divide-y divide-white/5">
                    {sub.applicants.map((app) => (
                      <div key={app.id} className="flex items-center bg-[#161617] hover:bg-[#1a1a1d] transition-colors">
                        <div className="w-[280px] lg:w-[320px] shrink-0 px-5 py-3 sticky left-0 z-20 bg-[#161617] hover:bg-[#1a1a1d] border-r border-[#242529] transition-colors flex items-center gap-3">
                          <div className="w-7 h-7 rounded-full bg-[#202024] border border-white/5 flex items-center justify-center text-[10px] font-medium text-white/50 shrink-0">
                            {app.name.split(' ').map(n => n[0]).join('')}
                          </div>
                          <div className="min-w-0">
                            <div className="text-[13px] text-white/80 font-medium truncate">{app.name}</div>
                            <div className="text-[11px] text-white/40 mt-0.5">{app.role}</div>
                          </div>
                        </div>
                        
                        <div className="flex-1 grid grid-cols-6 px-2 py-2">
                          <DocCell status={app.docs.passport} />
                          <DocCell status={app.docs.selfie} />
                          <DocCell status={app.docs.financial} />
                          <DocCell status={app.docs.booking} />
                          <DocCell status={app.docs.insurance} />
                          <DocCell status={app.docs.questionnaire} />
                        </div>
                        <div className="w-[60px] shrink-0" />
                      </div>
                    ))}
                  </div>

                </div>
              ))}
            </div>
            
          </div>
        </div>
      </div>
    </motion.div>
  );
}
