import { motion } from 'motion/react';
import { 
  Users, ChevronRight, Folder, CheckCircle2, AlertCircle
} from 'lucide-react';

interface ApplicantsScreenProps {
  onOpenDrawer: (id: string) => void;
}

// Mock Types
type ApplicantStatus = 'ready' | 'missing_docs' | 'in_progress';

interface FamilyMember {
  initials: string;
  name: string;
  role: string;
  status: ApplicantStatus;
}

interface FamilyData {
  id: string;
  title: string;
  members: FamilyMember[];
  lastActivity: string;
  submissionsCount: number;
}

interface IndividualData {
  id: string;
  name: string;
  initials: string;
  status: ApplicantStatus;
  lastActivity: string;
  submissionsCount: number;
}

const mockFamilies: FamilyData[] = [
  {
    id: "FAM-001",
    title: "Семья Петровых",
    lastActivity: "12 авг 2026",
    submissionsCount: 2,
    members: [
      { initials: "ИП", name: "Иван Петров", role: "Основной", status: "ready" },
      { initials: "АП", name: "Анна Петрова", role: "Супруга", status: "ready" },
      { initials: "МП", name: "Максим Петров", role: "Ребенок", status: "in_progress" },
      { initials: "МП", name: "Мария Петрова", role: "Ребенок", status: "missing_docs" }
    ]
  },
  {
    id: "FAM-002",
    title: "Семья Орловых",
    lastActivity: "Вчера",
    submissionsCount: 1,
    members: [
      { initials: "СО", name: "Сергей Орлов", role: "Основной", status: "ready" },
      { initials: "МО", name: "Марина Орлова", role: "Супруга", status: "ready" },
      { initials: "ДО", name: "Дмитрий Орлов", role: "Ребенок", status: "ready" }
    ]
  }
];

const mockIndividuals: IndividualData[] = [
  {
    id: "IND-001",
    name: "Алина Смирнова",
    initials: "АС",
    status: "in_progress",
    lastActivity: "Сегодня",
    submissionsCount: 1
  },
  {
    id: "IND-002",
    name: "Дмитрий Волков",
    initials: "ДВ",
    status: "ready",
    lastActivity: "5 авг 2026",
    submissionsCount: 3
  }
];

const getStatusDot = (status: ApplicantStatus) => {
  switch (status) {
    case 'ready': return <CheckCircle2 className="w-[14px] h-[14px] text-[#b8baff]" />;
    case 'missing_docs': return <AlertCircle className="w-[14px] h-[14px] text-[#d59aa3]" />;
    case 'in_progress': return <div className="w-2.5 h-2.5 rounded-full bg-[#7c73ff] ring-4 ring-[#161617]" />;
  }
};

export function ApplicantsScreen({ onOpenDrawer }: ApplicantsScreenProps) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Families Section */}
      <div>
        <h2 className="text-[13px] font-medium text-white/50 uppercase tracking-wider mb-4 px-1">
          Семьи
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {mockFamilies.map((family) => (
            <div 
              key={family.id}
              onClick={() => onOpenDrawer(family.id)}
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpenDrawer(family.id);
                }
              }}
              className="p-5 rounded-2xl bg-gradient-to-b from-[#1a1a1d] to-[#141416] border border-[#242529] hover:border-[#6f64ff]/40 cursor-pointer transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4] shadow-[inset_0_1px_0_rgba(255,255,255,0.02),0_4px_20px_rgba(0,0,0,0.2)]"
            >
              <div className="flex justify-between items-start mb-5">
                <div className="flex gap-3.5 items-center">
                  <div className="w-11 h-11 rounded-xl bg-white/5 border border-white/5 flex items-center justify-center shadow-inner group-hover:bg-[#6f64ff]/10 group-hover:border-[#6f64ff]/20 transition-colors">
                    <Users className="w-5 h-5 text-white/70 group-hover:text-[#3a45b4] transition-colors" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-semibold text-white group-hover:text-white transition-colors">{family.title}</h3>
                    <p className="text-[12px] text-white/50 mt-0.5">{family.members.length} человека</p>
                  </div>
                </div>
                <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                  <ChevronRight className="w-4 h-4 text-white/70" />
                </div>
              </div>

              {/* Members List */}
              <div className="space-y-1.5 mb-6">
                {family.members.map((member, i) => (
                  <div key={i} className="flex items-center gap-3 p-2 -mx-2 rounded-lg hover:bg-white/[0.03] transition-colors">
                    <div className="w-[26px] h-[26px] rounded-full bg-[#202024] border border-white/5 flex items-center justify-center text-[10px] font-semibold text-white/60 shrink-0">
                      {member.initials}
                    </div>
                    <span className="text-[13px] text-white/80 font-medium truncate flex-1">{member.name}</span>
                    <span className="text-[11px] text-white/40">{member.role}</span>
                    <div className="w-5 flex justify-end shrink-0">
                      {getStatusDot(member.status)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="pt-4 border-t border-[#242529] flex justify-between items-center text-[11.5px] text-white/40">
                <span>Акт: {family.lastActivity}</span>
                <span className="flex items-center gap-1.5 font-medium text-white/50 bg-[#1e1e21] px-2 py-0.5 rounded-md border border-[#242529]">
                  <Folder className="w-3.5 h-3.5" /> 
                  {family.submissionsCount} пакета
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="h-px w-full bg-[#202124] my-2" />

      {/* Individuals Section */}
      <div>
        <h2 className="text-[13px] font-medium text-white/50 uppercase tracking-wider mb-4 px-1">
          Одиночные профили
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {mockIndividuals.map((ind) => (
            <div 
              key={ind.id}
              onClick={() => onOpenDrawer(ind.id)}
              tabIndex={0}
              className="p-5 rounded-2xl bg-gradient-to-b from-[#1a1a1d] to-[#141416] border border-[#242529] hover:border-[#6f64ff]/40 cursor-pointer transition-all group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3a45b4] shadow-[inset_0_1px_0_rgba(255,255,255,0.02),0_4px_20px_rgba(0,0,0,0.2)]"
            >
              <div className="flex justify-between items-start mb-6">
                <div className="flex gap-3.5 items-center">
                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-[#2a2a30] to-[#1a1a20] border border-white/10 flex items-center justify-center shadow-inner group-hover:border-[#6f64ff]/40 transition-colors">
                    <span className="text-[14px] font-semibold text-white/70 group-hover:text-white transition-colors">{ind.initials}</span>
                  </div>
                  <div>
                    <h3 className="text-[15px] font-semibold text-white group-hover:text-white transition-colors">{ind.name}</h3>
                    <div className="flex items-center gap-1.5 mt-1 text-[12px] text-white/50">
                      {getStatusDot(ind.status)}
                      <span>Профиль готов</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="pt-4 border-t border-[#242529] flex justify-between items-center text-[11.5px] text-white/40">
                <span>Акт: {ind.lastActivity}</span>
                <span className="flex items-center gap-1.5 font-medium text-white/50 bg-[#1e1e21] px-2 py-0.5 rounded-md border border-[#242529]">
                  <Folder className="w-3.5 h-3.5" /> 
                  {ind.submissionsCount} пакета
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </motion.div>
  );
}
