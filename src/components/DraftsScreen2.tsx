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

const countDocs = (submission: DraftSubmission, statuses: DocStatus[]) =>
  submission.applicants.reduce(
    (total, applicant) =>
      total + Object.values(applicant.docs).filter((status) => statuses.includes(status)).length,
    0
  );

const completionFor = (submission: DraftSubmission) => {
  const total = submission.applicants.length * docTypes.length;
  const ready = countDocs(submission, ['verified']);
  return Math.round((ready / total) * 100);
};

const primaryProblemFor = (submission: DraftSubmission) => {
  const errors = countDocs(submission, ['error']);
  if (errors > 0) return `${errors} файла требуют ручного ревью`;
  const missing = countDocs(submission, ['missing']);
  if (missing > 0) return `${missing} документов нужно загрузить`;
  const processing = countDocs(submission, ['processing']);
  if (processing > 0) return `${processing} документа в OCR`;
  return 'Критичных блокеров нет';
};

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

      <div className="space-y-3">
        {mockDrafts.map((sub) => {
          const completion = completionFor(sub);
          const errors = countDocs(sub, ['error']);
          const missing = countDocs(sub, ['missing']);
          const processing = countDocs(sub, ['processing']);

          return (
            <article
              key={sub.id}
              className="grid gap-4 rounded-2xl border border-[#242529] bg-[#161617] p-4 shadow-[0_4px_24px_rgba(0,0,0,0.15)] transition-colors hover:bg-[#1a1a1d] sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"
            >
              <div className="min-w-0 space-y-3">
                <div className="flex items-start gap-3">
                  <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-[#202024] text-white/55">
                    {sub.type === 'family' ? <Users className="h-4 w-4" /> : <User className="h-4 w-4" />}
                  </span>
                  <div className="min-w-0">
                    <div className="text-[11px] font-medium uppercase tracking-wide text-white/40">{sub.id}</div>
                    <h2 className="truncate text-[15px] font-semibold text-white">{sub.title}</h2>
                    <div className="mt-1 flex flex-wrap items-center gap-2 text-[12px] text-white/45">
                      <span>{sub.country}</span>
                      <span className="h-1 w-1 rounded-full bg-white/20" />
                      <span>{sub.applicants.length} заявителя</span>
                      <span className="h-1 w-1 rounded-full bg-white/20" />
                      <span className="text-white/60">{sub.deadline}</span>
                    </div>
                  </div>
                </div>

                <div className="grid gap-2 sm:grid-cols-2">
                  <div>
                    <div className="mb-1 flex items-center justify-between text-[11px] text-white/50">
                      <span>Документы</span>
                      <strong className="font-semibold text-white/80">{completion}%</strong>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.055]">
                      <div className="h-full rounded-full bg-[#6f64ff]" style={{ width: `${completion}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="mb-1 flex items-center justify-between text-[11px] text-white/50">
                      <span>Анкета</span>
                      <strong className="font-semibold text-white/80">{processing ? 'OCR' : 'Ожидает'}</strong>
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-white/[0.055]">
                      <div className="h-full w-1/2 rounded-full bg-white/25" />
                    </div>
                  </div>
                </div>

                <p className={`m-0 text-[12px] ${errors ? 'text-[#d59aa3]' : 'text-white/50'}`}>
                  {primaryProblemFor(sub)}
                </p>
              </div>

              <div className="flex items-center justify-between gap-3 sm:grid sm:justify-items-end">
                <span className={`inline-flex min-h-6 items-center rounded-full border px-2.5 text-[11px] font-semibold ${
                  errors
                    ? 'border-[#5b2b32]/50 bg-[#24191b]/60 text-[#d59aa3]'
                    : missing
                      ? 'border-white/10 bg-white/[0.045] text-white/65'
                      : 'border-white/10 bg-white/[0.045] text-white/65'
                }`}>
                  {errors ? `Ошибки ${errors}` : missing ? `Ждут ${missing}` : 'В работе'}
                </span>
                <button
                  onClick={() => onOpenDrawer(sub.id)}
                  className="inline-flex h-9 items-center gap-1 rounded-xl border border-white/10 bg-[#1e1e21] px-3 text-[12px] font-semibold text-white transition-colors hover:bg-[#27272b] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]"
                >
                  Документы
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </motion.div>
  );
}
