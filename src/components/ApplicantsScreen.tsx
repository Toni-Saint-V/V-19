import { useMemo } from 'react';
import { motion } from 'motion/react';
import type { Submission } from '../modules/submissions/types';
import { applicantInitials, updatedLabel } from './v19BusinessScreenAdapter';
import { 
  Users, ChevronRight, Folder, CheckCircle2, AlertCircle, FileText, Flame
} from 'lucide-react';

interface ApplicantsScreenProps {
  onOpenDrawer: (id: string) => void;
  submissions?: Submission[];
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


function applicantStatusFromSubmission(submission: Submission, applicantId: string): ApplicantStatus {
  const applicant = submission.applicants.find((item) => item.id === applicantId);
  if (!applicant) return 'in_progress';
  if (applicant.questionnaireStatus === 'complete' && applicant.fileStatus === 'complete') return 'ready';
  if (applicant.questionnaireStatus === 'needs_fix' || applicant.fileStatus === 'needs_fix') return 'missing_docs';
  return 'in_progress';
}

function runtimeFamiliesFromSubmissions(submissions?: Submission[]): FamilyData[] {
  if (!submissions?.length) return mockFamilies;
  return submissions
    .filter((submission) => submission.type === 'family')
    .map((submission) => ({
      id: submission.id,
      title: submission.listTitle ?? submission.title,
      lastActivity: updatedLabel(submission.updatedAt),
      submissionsCount: 1,
      members: submission.applicants.map((applicant) => ({
        initials: applicantInitials(applicant.fullName),
        name: applicant.fullName,
        role: applicant.role === 'main' ? 'Основной' : applicant.role === 'spouse' ? 'Супруг(а)' : applicant.role === 'child' ? 'Ребёнок' : 'Заявитель',
        status: applicantStatusFromSubmission(submission, applicant.id),
      })),
    }));
}

function runtimeIndividualsFromSubmissions(submissions?: Submission[]): IndividualData[] {
  if (!submissions?.length) return mockIndividuals;
  return submissions
    .filter((submission) => submission.type === 'single')
    .map((submission) => {
      const applicant = submission.applicants[0];
      return {
        id: submission.id,
        name: applicant?.fullName ?? submission.title,
        initials: applicantInitials(applicant?.fullName ?? submission.title),
        status: applicant ? applicantStatusFromSubmission(submission, applicant.id) : 'in_progress',
        lastActivity: updatedLabel(submission.updatedAt),
        submissionsCount: 1,
      };
    });
}

const getStatusDot = (status: ApplicantStatus) => {
  switch (status) {
    case 'ready': return <CheckCircle2 className="w-[14px] h-[14px] text-[#b8baff]" />;
    case 'missing_docs': return <AlertCircle className="w-[14px] h-[14px] text-[#d59aa3]" />;
    case 'in_progress': return <div className="w-2.5 h-2.5 rounded-full bg-[#7c73ff] ring-4 ring-[#161617]" />;
  }
};

function metricsFromSubmissions(submissions: Submission[] | undefined, fallbackTotal: number) {
  if (!submissions?.length) {
    return {
      blockers: 3,
      exportReady: 1,
      queue: fallbackTotal,
      review: 3,
    };
  }

  return {
    blockers: submissions.reduce(
      (total, submission) =>
        total +
        submission.issues.filter(
          (issue) => issue.status === 'open' && issue.severity === 'blocker',
        ).length,
      0,
    ),
    exportReady: submissions.filter((submission) => submission.status === 'ready_for_export').length,
    queue: submissions.length,
    review: submissions.filter((submission) =>
      ['submitted_for_review', 'corrections_received'].includes(submission.status),
    ).length,
  };
}

function MetricCard({
  hideLabel = false,
  icon: Icon,
  label,
  tone = 'muted',
  value,
}: {
  hideLabel?: boolean;
  icon: typeof FileText;
  label: string;
  tone?: 'danger' | 'muted' | 'ready';
  value: number;
}) {
  const iconClass =
    tone === 'danger'
      ? 'text-[#d59aa3]'
      : tone === 'ready'
        ? 'text-[#b8baff]'
        : 'text-white/45';

  return (
    <div
      aria-label={label}
      className="flex h-[60px] min-h-[60px] flex-col justify-between rounded-[15px] border border-[#242529] bg-[#161617] px-3 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] sm:h-auto sm:min-h-[118px] sm:px-5 sm:py-4"
    >
      <div className="flex items-start justify-end gap-3 sm:justify-between">
        {!hideLabel ? (
          <div className="hidden text-[12px] font-medium uppercase tracking-[0.12em] text-white/42 sm:block">
            {label}
          </div>
        ) : null}
        <Icon className={`h-3.5 w-3.5 sm:h-5 sm:w-5 ${iconClass}`} />
      </div>
      <div className="ml-1 text-[24px] font-medium leading-none text-white sm:ml-0 sm:mt-8 sm:text-[30px]">
        {value}
      </div>
    </div>
  );
}

export function ApplicantsScreen({ onOpenDrawer, submissions }: ApplicantsScreenProps) {
  const families = useMemo(() => runtimeFamiliesFromSubmissions(submissions), [submissions]);
  const individuals = useMemo(() => runtimeIndividualsFromSubmissions(submissions), [submissions]);
  const metrics = useMemo(
    () => metricsFromSubmissions(submissions, families.length + individuals.length),
    [families.length, individuals.length, submissions],
  );

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <div className="grid grid-cols-4 gap-2 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
        <MetricCard icon={FileText} label="В очереди" value={metrics.queue} />
        <MetricCard icon={Flame} label="Блокеры" tone="danger" value={metrics.blockers} />
        <MetricCard icon={AlertCircle} label="Проверить" value={metrics.review} />
        <MetricCard hideLabel icon={CheckCircle2} label="К выгрузке" tone="ready" value={metrics.exportReady} />
      </div>

      {/* Families Section */}
      <div>
        <h2 className="text-[13px] font-medium text-white/50 uppercase tracking-wider mb-4 px-1">
          Семьи
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {families.map((family) => (
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
          {individuals.map((ind) => (
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
