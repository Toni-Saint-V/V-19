import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import type { Submission } from '../modules/submissions/types';
import { applicantInitials, updatedLabel } from './v19BusinessScreenAdapter';
import { 
  Users, ChevronRight, Folder, CheckCircle2, AlertCircle, FileText, Flame, Search
} from 'lucide-react';
import { V19SummaryTile, V19SummaryTileGrid } from '../shared/ui/v19-design-system';

interface ApplicantsScreenProps {
  onOpenDrawer: (id: string) => void;
  submissions?: Submission[];
}

// Mock Types
type ApplicantStatus = 'ready' | 'missing_docs' | 'in_progress';
type ApplicantSummaryFilter = 'all' | 'blockers' | 'review' | 'ready';

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

export function ApplicantsScreen({ onOpenDrawer, submissions }: ApplicantsScreenProps) {
  const [applicantSummaryFilter, setApplicantSummaryFilter] = useState<ApplicantSummaryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const families = useMemo(() => runtimeFamiliesFromSubmissions(submissions), [submissions]);
  const individuals = useMemo(() => runtimeIndividualsFromSubmissions(submissions), [submissions]);
  const metrics = useMemo(
    () => metricsFromSubmissions(submissions, families.length + individuals.length),
    [families.length, individuals.length, submissions],
  );
  const searchNeedle = searchQuery.trim().toLowerCase();
  const displayFamilies = useMemo(
    () =>
      families.filter((family) => {
        if (applicantSummaryFilter === 'all') return true;
        if (applicantSummaryFilter === 'blockers') {
          return family.members.some((member) => member.status === 'missing_docs');
        }
        if (applicantSummaryFilter === 'review') {
          return family.members.some((member) => member.status === 'in_progress');
        }
        return family.members.every((member) => member.status === 'ready');
      }).filter((family) => {
        if (!searchNeedle) return true;
        return [
          family.id,
          family.title,
          ...family.members.map((member) => member.name),
        ]
          .join(' ')
          .toLowerCase()
          .includes(searchNeedle);
      }),
    [applicantSummaryFilter, families, searchNeedle],
  );
  const displayIndividuals = useMemo(
    () =>
      individuals.filter((individual) => {
        if (applicantSummaryFilter === 'all') return true;
        if (applicantSummaryFilter === 'blockers') return individual.status === 'missing_docs';
        if (applicantSummaryFilter === 'review') return individual.status === 'in_progress';
        return individual.status === 'ready';
      }).filter((individual) => {
        if (!searchNeedle) return true;
        return [individual.id, individual.name]
          .join(' ')
          .toLowerCase()
          .includes(searchNeedle);
      }),
    [applicantSummaryFilter, individuals, searchNeedle],
  );
  const hasVisibleApplicants = displayFamilies.length > 0 || displayIndividuals.length > 0;
  const resetFilters = () => {
    setApplicantSummaryFilter('all');
    setSearchQuery('');
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      <V19SummaryTileGrid>
        <V19SummaryTile
          active={applicantSummaryFilter === 'all'}
          detail="профили"
          icon={FileText}
          label="В очереди"
          value={metrics.queue}
          onClick={() => setApplicantSummaryFilter('all')}
        />
        <V19SummaryTile
          active={applicantSummaryFilter === 'blockers'}
          detail="блокеры"
          icon={Flame}
          label="Блокеры"
          tone="danger"
          value={metrics.blockers}
          onClick={() => setApplicantSummaryFilter('blockers')}
        />
        <V19SummaryTile
          active={applicantSummaryFilter === 'review'}
          detail="ревью"
          icon={AlertCircle}
          label="Проверить"
          tone="amber"
          value={metrics.review}
          onClick={() => setApplicantSummaryFilter('review')}
        />
        <V19SummaryTile
          active={applicantSummaryFilter === 'ready'}
          detail="экспорт"
          icon={CheckCircle2}
          label="К выгрузке"
          tone="green"
          value={metrics.exportReady}
          onClick={() => setApplicantSummaryFilter('ready')}
        />
      </V19SummaryTileGrid>

      <label className="relative block max-w-[360px]">
        <span className="sr-only">Поиск по подачам</span>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/50"
        />
        <input
          aria-label="Поиск по подачам"
          className="h-10 w-full rounded-[10px] border border-[#242529] bg-[#1e1e21] pl-9 pr-3 text-[13px] font-medium text-white outline-none transition-colors placeholder:text-white/50 focus:border-[#6f64ff]/55 focus:ring-1 focus:ring-[#3a45b4]/35"
          placeholder="Поиск по подачам"
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.currentTarget.value)}
        />
      </label>

      {!hasVisibleApplicants ? (
        <div
          className="flex min-h-[260px] flex-col items-center justify-center rounded-2xl border border-dashed border-[#242529] bg-[#161617] p-8 text-center"
          role="status"
        >
          <h2 className="m-0 text-[18px] font-semibold text-white">Ничего не найдено</h2>
          <p className="m-0 mt-2 max-w-[420px] text-[13px] leading-5 text-white/60">
            Измените поисковый запрос или фильтр готовности.
          </p>
          <button
            className="mt-4 h-10 rounded-[10px] border border-[#242529] bg-[#1e1e21] px-4 text-[13px] font-semibold text-white transition-colors hover:bg-[#27272b]"
            type="button"
            onClick={resetFilters}
          >
            Сбросить фильтры
          </button>
        </div>
      ) : null}

      {/* Families Section */}
      {displayFamilies.length ? (
      <div>
        <h2 className="text-[13px] font-medium text-white/50 uppercase tracking-wider mb-4 px-1">
          Семьи
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {displayFamilies.map((family) => (
            <div 
              data-submission-id={family.id}
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
      ) : null}

      {displayFamilies.length && displayIndividuals.length ? (
        <div className="h-px w-full bg-[#202124] my-2" />
      ) : null}

      {/* Individuals Section */}
      {displayIndividuals.length ? (
      <div>
        <h2 className="text-[13px] font-medium text-white/50 uppercase tracking-wider mb-4 px-1">
          Одиночные профили
        </h2>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
          {displayIndividuals.map((ind) => (
            <div 
              data-submission-id={ind.id}
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
      ) : null}
    </motion.div>
  );
}
