import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import type { Submission } from '../modules/submissions/types';
import { updatedLabel } from './v19BusinessScreenAdapter';
import {
  AlertCircle,
  ArrowUpDown,
  Baby,
  CheckCircle2,
  FileText,
  RotateCcw,
  Shapes,
  UserRound,
  Users,
} from 'lucide-react';
import { cityFilterValuesForSubmissions } from '../modules/submissions/selectors';
import {
  V19ListHeader,
  V19MetricCard,
  V19MetricStrip,
  V19QueueCard,
  V19QueueToolbar,
  V19ToolbarSelect,
} from '../shared/ui/v19-design-system';

interface ApplicantsScreenProps {
  onOpenDrawer: (id: string) => void;
  submissions?: Submission[];
}

// View types
type ApplicantStatus = 'ready' | 'missing_docs' | 'in_progress';
type ApplicantSummaryFilter = 'all' | 'blockers' | 'review' | 'ready';
type ApplicantMarker = 'male' | 'female' | 'child' | 'person';
type ApplicantSort = 'tripDate' | 'createdAt';

interface FamilyMember {
  marker: ApplicantMarker;
  name: string;
  roleLabel?: string;
  status: ApplicantStatus;
}

interface FamilyData {
  city: string;
  createdAt: string;
  id: string;
  title: string;
  members: FamilyMember[];
  lastActivity: string;
  readinessPercent: number;
  tripDateFrom: string;
}

interface IndividualData {
  city: string;
  createdAt: string;
  id: string;
  marker: ApplicantMarker;
  name: string;
  readinessPercent: number;
  status: ApplicantStatus;
  lastActivity: string;
  tripDateFrom: string;
}

const emptySubmissions: Submission[] = [];

function applicantStatusFromSubmission(submission: Submission, applicantId: string): ApplicantStatus {
  const applicant = submission.applicants.find((item) => item.id === applicantId);
  if (!applicant) return 'in_progress';
  if (applicant.questionnaireStatus === 'complete' && applicant.fileStatus === 'complete') return 'ready';
  if (applicant.questionnaireStatus === 'needs_fix' || applicant.fileStatus === 'needs_fix') return 'missing_docs';
  return 'in_progress';
}

function questionnaireValueForApplicant(submission: Submission, applicantId: string, fieldId: string) {
  const applicant = submission.applicants.find((item) => item.id === applicantId);
  return applicant?.sections
    .flatMap((section) => section.fields)
    .find((field) => field.id === fieldId)
    ?.value.trim() ?? '';
}

function applicantMarker(
  submission: Submission,
  applicant: Submission['applicants'][number],
): ApplicantMarker {
  if (applicant.role === 'child') return 'child';
  const gender = questionnaireValueForApplicant(submission, applicant.id, 'gender').toLowerCase();
  if (gender.includes('жен') || gender === 'female' || gender === 'f') return 'female';
  if (gender.includes('муж') || gender === 'male' || gender === 'm') return 'male';
  return 'person';
}

function applicantRoleLabel(
  role: Submission['applicants'][number]['role'],
  marker: ApplicantMarker,
) {
  if (role === 'child') return 'Ребёнок';
  if (role === 'spouse') {
    return marker === 'male' ? 'Супруг' : marker === 'female' ? 'Супруга' : 'Супруг(а)';
  }
  return undefined;
}

function ApplicantMarkerIcon({ marker }: { marker: ApplicantMarker }) {
  const Icon = marker === 'child' ? Baby : UserRound;
  const label = marker === 'child' ? 'Ребёнок' : 'Заявитель';
  return <Icon aria-label={label} className="v19-applicant-person-icon" />;
}

function runtimeFamiliesFromSubmissions(submissions: Submission[]): FamilyData[] {
  return submissions
    .filter((submission) => submission.type === 'family')
    .map((submission) => ({
      city: submission.city,
      createdAt: submission.createdAt,
      id: submission.id,
      title: submission.listTitle ?? submission.title,
      lastActivity: updatedLabel(submission.updatedAt),
      readinessPercent: submission.completeness.total,
      tripDateFrom: submission.tripDateFrom,
      members: submission.applicants.map((applicant) => {
        const marker = applicantMarker(submission, applicant);
        return {
          marker,
          name: applicant.fullName,
          roleLabel: applicantRoleLabel(applicant.role, marker),
          status: applicantStatusFromSubmission(submission, applicant.id),
        };
      }),
    }));
}

function runtimeIndividualsFromSubmissions(submissions: Submission[]): IndividualData[] {
  return submissions
    .filter((submission) => submission.type === 'single')
    .map((submission) => {
      const applicant = submission.applicants[0];
      return {
        city: submission.city,
        createdAt: submission.createdAt,
        id: submission.id,
        marker: applicant ? applicantMarker(submission, applicant) : 'person',
        name: applicant?.fullName ?? submission.title,
        readinessPercent: submission.completeness.total,
        status: applicant ? applicantStatusFromSubmission(submission, applicant.id) : 'in_progress',
        lastActivity: updatedLabel(submission.updatedAt),
        tripDateFrom: submission.tripDateFrom,
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

function applicantStatusLabel(status: ApplicantStatus) {
  if (status === 'missing_docs') return 'Нужны документы';
  if (status === 'in_progress') return 'На проверке';
  return 'Профиль готов';
}

function metricsFromSubmissions(submissions: Submission[]) {
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
  const [cityFilter, setCityFilter] = useState('Все города');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<ApplicantSort>('tripDate');
  const canonicalSubmissions = submissions ?? emptySubmissions;
  const families = useMemo(
    () => runtimeFamiliesFromSubmissions(canonicalSubmissions),
    [canonicalSubmissions],
  );
  const individuals = useMemo(
    () => runtimeIndividualsFromSubmissions(canonicalSubmissions),
    [canonicalSubmissions],
  );
  const cityOptions = useMemo(() => {
    return cityFilterValuesForSubmissions(canonicalSubmissions);
  }, [canonicalSubmissions]);
  const metrics = useMemo(
    () => metricsFromSubmissions(canonicalSubmissions),
    [canonicalSubmissions],
  );
  const searchNeedle = searchQuery.trim().toLowerCase();
  const displayFamilies = useMemo(
    () =>
      families.filter((family) => {
        if (cityFilter !== 'Все города' && family.city !== cityFilter) return false;
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
      }).sort((left, right) =>
        sortBy === 'tripDate'
          ? left.tripDateFrom.localeCompare(right.tripDateFrom)
          : right.createdAt.localeCompare(left.createdAt),
      ),
    [applicantSummaryFilter, cityFilter, families, searchNeedle, sortBy],
  );
  const displayIndividuals = useMemo(
    () =>
      individuals.filter((individual) => {
        if (cityFilter !== 'Все города' && individual.city !== cityFilter) return false;
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
      }).sort((left, right) =>
        sortBy === 'tripDate'
          ? left.tripDateFrom.localeCompare(right.tripDateFrom)
          : right.createdAt.localeCompare(left.createdAt),
      ),
    [applicantSummaryFilter, cityFilter, individuals, searchNeedle, sortBy],
  );
  const hasVisibleApplicants = displayFamilies.length > 0 || displayIndividuals.length > 0;
  const hasActiveFilters = applicantSummaryFilter !== 'all' || cityFilter !== 'Все города' || searchQuery.trim().length > 0 || sortBy !== 'tripDate';
  const resetFilters = () => {
    setApplicantSummaryFilter('all');
    setCityFilter('Все города');
    setSearchQuery('');
    setSortBy('tripDate');
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className="v19-agent-shared-screen"
    >
      <V19MetricStrip className="v19-admin-export-metrics-v2">
        <V19MetricCard
          active={applicantSummaryFilter === 'all'}
          detail="профили"
          icon={FileText}
          label="В очереди"
          value={metrics.queue}
          onClick={() => setApplicantSummaryFilter('all')}
        />
        <V19MetricCard
          active={applicantSummaryFilter === 'review'}
          detail="ревью"
          icon={AlertCircle}
          label="Проверить"
          tone="amber"
          value={metrics.review}
          onClick={() => setApplicantSummaryFilter('review')}
        />
        <V19MetricCard
          active={applicantSummaryFilter === 'ready'}
          detail="экспорт"
          icon={CheckCircle2}
          label="К выгрузке"
          tone="green"
          value={metrics.exportReady}
          onClick={() => setApplicantSummaryFilter('ready')}
        />
      </V19MetricStrip>

      <div className="v19-admin-export-workspace-v2 v19-agent-submissions-board">
        <V19ListHeader
          actionDisabled={!hasActiveFilters}
          actionLabel="Все"
          className="v19-admin-export-list-head-v2"
          countLabel={`${families.length + individuals.length} ${families.length + individuals.length === 1 ? 'профиль' : 'профилей'}`}
          onAction={resetFilters}
          title="Мои подачи"
        />
        <V19QueueToolbar
          actionDisabled={!hasActiveFilters}
          actionIcon={RotateCcw}
          cityFilter={cityFilter}
          cityOptions={cityOptions}
          controls={
            <>
              <V19ToolbarSelect<ApplicantSummaryFilter>
                ariaLabel="Фильтр подач"
                className={applicantSummaryFilter !== 'all' ? 'is-active' : ''}
                icon={Shapes}
                label="Статус"
                options={[
                  { label: 'Все', value: 'all' },
                  { label: 'Блокеры', value: 'blockers' },
                  { label: 'Проверить', value: 'review' },
                  { label: 'К выгрузке', value: 'ready' },
                ]}
                value={applicantSummaryFilter}
                onChange={setApplicantSummaryFilter}
              />
              <V19ToolbarSelect<ApplicantSort>
                ariaLabel="Сортировка подач"
                className={sortBy !== 'tripDate' ? 'is-active' : ''}
                icon={ArrowUpDown}
                label="Сортировка"
                options={[
                  { label: 'По дате вылета', value: 'tripDate' },
                  { label: 'По дате создания', value: 'createdAt' },
                ]}
                value={sortBy}
                onChange={setSortBy}
              />
            </>
          }
          filterLabel="Сбросить фильтры"
          onCityFilterChange={setCityFilter}
          onFilterClick={resetFilters}
          onSearchChange={setSearchQuery}
          searchAriaLabel="Поиск по подачам"
          searchPlaceholder="ID, семья или заявитель"
          searchValue={searchQuery}
        />
        <div className="v19-agent-submissions-list">

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

      {displayFamilies.length ? (
        <section className="v19-agent-submissions-group" aria-labelledby="agent-submissions-families">
          <h2 id="agent-submissions-families">Семьи</h2>
          {displayFamilies.map((family) => (
            <V19QueueCard
              aria-label={`Открыть подачу ${family.title}`}
              data-submission-id={family.id}
              key={family.id}
              onClick={() => onOpenDrawer(family.id)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpenDrawer(family.id);
                }
              }}
              className="v19-agent-shared-card group"
            >
              <div className="flex justify-between items-start gap-3 mb-5">
                <div className="flex gap-3.5 items-center">
                  <div className="v19-agent-submission-family-icon w-11 h-11 bg-white/5 border border-white/5 flex items-center justify-center shadow-inner group-hover:bg-[#6f64ff]/10 group-hover:border-[#6f64ff]/20 transition-colors">
                    <Users className="w-5 h-5 text-white/70 group-hover:text-[#3a45b4] transition-colors" />
                  </div>
                  <div>
                    <h3 className="text-[15px] font-semibold text-white group-hover:text-white transition-colors">{family.title}</h3>
                    <p className="mt-0.5 text-[12px] text-[var(--v19b-color-text-70)]">{family.members.length} человека</p>
                  </div>
                </div>
                <span className="v19-applicant-card-city">{family.city}</span>
              </div>

              {/* Members List */}
              <div className="space-y-1.5 mb-6">
                {family.members.map((member, i) => (
                  <div key={i} className="v19-applicant-member-cell">
                    <ApplicantMarkerIcon marker={member.marker} />
                    <span className="v19-applicant-member-name">{member.name}</span>
                    {member.roleLabel ? <span className="v19-applicant-member-role">{member.roleLabel}</span> : null}
                    <div className="w-5 flex justify-end shrink-0">
                      {getStatusDot(member.status)}
                    </div>
                  </div>
                ))}
              </div>

              {/* Footer */}
              <div className="pt-4 border-t border-[#242529] flex justify-between items-center text-[11.5px] text-white/40">
                <span>{family.lastActivity}</span>
                <span className="v19-applicant-readiness">
                  {family.readinessPercent}% готово
                </span>
              </div>
            </V19QueueCard>
          ))}
        </section>
      ) : null}

      {displayFamilies.length && displayIndividuals.length ? (
        <div aria-hidden="true" className="v19-agent-submissions-divider" />
      ) : null}

      {displayIndividuals.length ? (
        <section className="v19-agent-submissions-group" aria-labelledby="agent-submissions-individuals">
          <h2 id="agent-submissions-individuals">Заявители</h2>
          {displayIndividuals.map((ind) => (
            <V19QueueCard
              aria-label={`Открыть подачу ${ind.name}`}
              data-submission-id={ind.id}
              key={ind.id}
              onClick={() => onOpenDrawer(ind.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onOpenDrawer(ind.id);
                }
              }}
              role="button"
              tabIndex={0}
              className="v19-agent-shared-card group"
            >
              <div className="flex justify-between items-start gap-3 mb-6">
                <div className="flex gap-3.5 items-center">
                  <div className="v19-applicant-individual-icon">
                    <ApplicantMarkerIcon marker={ind.marker} />
                  </div>
                  <div>
                    <div className="v19-applicant-individual-name-row">
                      <h3 className="text-[15px] font-semibold text-white group-hover:text-white transition-colors">{ind.name}</h3>
                      <span className="v19-applicant-individual-status">
                        {getStatusDot(ind.status)}
                        {applicantStatusLabel(ind.status)}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Footer */}
              <div className="pt-4 border-t border-[#242529] flex justify-between items-center text-[11.5px] text-white/40">
                <div className="v19-applicant-card-footer-meta">
                  <span>{ind.lastActivity}</span>
                  <span className="v19-applicant-card-footer-city">{ind.city}</span>
                </div>
                <span className="v19-applicant-readiness">
                  {ind.readinessPercent}% готово
                </span>
              </div>
            </V19QueueCard>
          ))}
        </section>
      ) : null}
        </div>
      </div>
    </motion.div>
  );
}
