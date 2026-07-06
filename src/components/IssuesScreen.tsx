import type { AgentDrawerTab } from './Drawer';
import { motion } from 'motion/react';
import { AlertCircle, FileWarning, ArrowRight, User, Check } from 'lucide-react';

type IssueSeverity = 'critical' | 'warning';

interface Issue {
  id: string;
  type: IssueSeverity;
  title: string;
  description: string;
  applicant: string;
  submissionId: string;
  date: string;
}

const mockIssues: Issue[] = [
  {
    id: 'iss-1',
    type: 'critical',
    title: 'Несоответствие даты рождения',
    description: 'В анкете указано 12.05.1985, а в загруженном PDF скане паспорта — 15.05.1985. Требуется ручное подтверждение менеджера.',
    applicant: 'Иван Петров',
    submissionId: 'SUB-1042',
    date: '2 часа назад'
  },
  {
    id: 'iss-2',
    type: 'critical',
    title: 'Отсутствует финансовая гарантия',
    description: 'Для поездки в зону Schengen требуется выписка с банковского счета с остатком не менее 300 000 ₽.',
    applicant: 'Анна Петрова',
    submissionId: 'SUB-1042',
    date: '3 часа назад'
  },
  {
    id: 'iss-3',
    type: 'warning',
    title: 'Срок действия паспорта',
    description: 'Паспорт истекает через 6.5 месяцев. Консульство Китая рекомендует иметь запас минимум 6 месяцев. Проходит по границе.',
    applicant: 'Михаил Соколов',
    submissionId: 'SUB-1092',
    date: 'Вчера'
  }
];

interface IssuesScreenProps {
  onOpenDrawer: (id: string, tab?: AgentDrawerTab) => void;
}

export function IssuesScreen({ onOpenDrawer }: IssuesScreenProps) {
  const criticalCount = mockIssues.filter(i => i.type === 'critical').length;
  const warningCount = mockIssues.filter(i => i.type === 'warning').length;

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6 lg:space-y-8 max-w-[900px]"
    >
      {/* Overview Cards */}
      <div className="grid grid-cols-2 gap-3 lg:gap-4">
        <div className="p-4 lg:p-5 rounded-2xl bg-[#a35f69]/5 border border-[#5b2b32]/45 shadow-[0_4px_24px_rgba(0,0,0,0.12)] flex flex-col justify-between h-[100px] relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#24191b]/60 rounded-full blur-2xl -mr-10 -mt-10 transition-transform group-hover:scale-110" />
          <div className="flex items-center justify-between relative z-10">
            <span className="text-[12px] font-medium text-[#d59aa3] uppercase tracking-wide">Критичные ошибки</span>
            <AlertCircle className="w-5 h-5 text-[#d59aa3]" />
          </div>
          <div className="relative z-10 text-2xl font-semibold text-white">{criticalCount}</div>
        </div>

        <div className="p-4 lg:p-5 rounded-2xl bg-white/[0.035] border border-white/10 flex flex-col justify-between h-[100px] relative overflow-hidden group">
          <div className="absolute top-0 right-0 w-24 h-24 bg-white/[0.045] rounded-full blur-2xl -mr-10 -mt-10 transition-transform group-hover:scale-110" />
          <div className="flex items-center justify-between relative z-10">
            <span className="text-[12px] font-medium text-white/62 uppercase tracking-wide">Предупреждения</span>
            <FileWarning className="w-5 h-5 text-white/62" />
          </div>
          <div className="relative z-10 text-2xl font-semibold text-white">{warningCount}</div>
        </div>
      </div>

      {/* Issues List */}
      <div className="space-y-3">
        {mockIssues.map((issue) => (
          <div 
            key={issue.id}
            onClick={() => onOpenDrawer(issue.submissionId, 'issues')}
            className="group flex flex-col sm:flex-row gap-4 p-4 lg:p-5 bg-[#161617] border border-[#242529] hover:border-[#6f64ff]/40 rounded-2xl cursor-pointer transition-all shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4]"
            tabIndex={0}
          >
            {/* Severity Indicator */}
            <div className={`w-10 h-10 shrink-0 rounded-xl flex items-center justify-center border shadow-inner mt-1
              ${issue.type === 'critical' ? 'bg-[#24191b]/60 border-[#5b2b32]/45 text-[#d59aa3]' : 'bg-white/[0.045] border-white/10 text-white/62'}`}>
              {issue.type === 'critical' ? <AlertCircle className="w-5 h-5" /> : <FileWarning className="w-5 h-5" />}
            </div>

            <div className="flex-1 min-w-0 flex flex-col justify-center">
              <div className="flex flex-wrap items-center gap-2 text-[11px] text-white/40 mb-1.5 font-medium">
                <span className="font-mono text-white/60">{issue.submissionId}</span>
                <span className="w-1 h-1 rounded-full bg-white/20" />
                <span className="flex items-center gap-1.5"><User className="w-3 h-3" /> {issue.applicant}</span>
                <span className="w-1 h-1 rounded-full bg-white/20" />
                <span>{issue.date}</span>
              </div>
              
              <h3 className="text-[15px] font-semibold text-white mb-1.5 group-hover:text-[#b8baff] transition-colors">{issue.title}</h3>
              <p className="text-[13px] text-white/50 leading-relaxed max-w-2xl">{issue.description}</p>
            </div>

            <div className="flex items-center sm:justify-end mt-2 sm:mt-0 shrink-0">
              <button className="w-full sm:w-auto px-5 h-10 rounded-xl text-[13px] font-medium transition-colors flex items-center justify-center gap-2 bg-[#1a1a1d] border border-[#242529] text-white group-hover:border-[#6f64ff]/50 group-hover:bg-[#6f64ff]/10 group-hover:text-[#b8baff]">
                <span>Решить проблему</span>
                <ArrowRight className="w-4 h-4 opacity-50 group-hover:opacity-100 transition-opacity" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {mockIssues.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center bg-[#161617] rounded-2xl border border-[#242529] border-dashed">
          <div className="w-14 h-14 bg-white/5 rounded-full flex items-center justify-center mb-5 border border-white/5 shadow-inner">
            <Check className="w-6 h-6 text-[#b8baff]/50" />
          </div>
          <h4 className="text-[15px] font-semibold text-white mb-2">Ошибок не найдено</h4>
          <p className="text-[13px] text-white/50 max-w-xs leading-relaxed">Система работает стабильно. Все документы и анкеты проходят проверки без замечаний.</p>
        </div>
      )}
    </motion.div>
  );
}
