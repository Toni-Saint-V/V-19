import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  ArrowUpRight,
  CheckCircle2,
  ChevronRight,
  Clock3,
  FileText,
  Folder,
  Search,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  User,
  Users,
  X,
} from 'lucide-react';

interface ApplicantsScreenProps {
  onOpenDrawer: (id: string) => void;
}

type ApplicantStatus = 'ready' | 'missing_docs' | 'in_progress';

interface FamilyMember {
  initials: string;
  name: string;
  role: string;
  status: ApplicantStatus;
  docs: number;
  questionnaire: number;
}

interface FamilyData {
  id: string;
  title: string;
  city: string;
  tripDates: string;
  lastActivity: string;
  submissionsCount: number;
  readiness: number;
  blockers: number;
  members: FamilyMember[];
}

interface IndividualData {
  id: string;
  name: string;
  initials: string;
  city: string;
  tripDates: string;
  status: ApplicantStatus;
  lastActivity: string;
  submissionsCount: number;
  docs: number;
  questionnaire: number;
}

const mockFamilies: FamilyData[] = [
  {
    id: 'FAM-001',
    title: 'Семья Петровых',
    city: 'Санкт-Петербург',
    tripDates: '18–23 июл',
    lastActivity: '12 мин назад',
    submissionsCount: 2,
    readiness: 86,
    blockers: 2,
    members: [
      { initials: 'ИП', name: 'Иван Петров', role: 'Основной', status: 'ready', docs: 100, questionnaire: 100 },
      { initials: 'АП', name: 'Анна Петрова', role: 'Супруга', status: 'ready', docs: 100, questionnaire: 96 },
      { initials: 'МП', name: 'Максим Петров', role: 'Ребёнок', status: 'in_progress', docs: 72, questionnaire: 88 },
      { initials: 'МП', name: 'Мария Петрова', role: 'Ребёнок', status: 'missing_docs', docs: 58, questionnaire: 91 },
    ],
  },
  {
    id: 'FAM-002',
    title: 'Семья Орловых',
    city: 'Москва',
    tripDates: '11–21 авг',
    lastActivity: 'Вчера',
    submissionsCount: 1,
    readiness: 100,
    blockers: 0,
    members: [
      { initials: 'СО', name: 'Сергей Орлов', role: 'Основной', status: 'ready', docs: 100, questionnaire: 100 },
      { initials: 'МО', name: 'Марина Орлова', role: 'Супруга', status: 'ready', docs: 100, questionnaire: 100 },
      { initials: 'ДО', name: 'Дмитрий Орлов', role: 'Ребёнок', status: 'ready', docs: 100, questionnaire: 100 },
    ],
  },
  {
    id: 'FAM-003',
    title: 'Семья Соколовых',
    city: 'Москва',
    tripDates: '03–10 сен',
    lastActivity: '2 ч назад',
    submissionsCount: 1,
    readiness: 74,
    blockers: 1,
    members: [
      { initials: 'ЕС', name: 'Егор Соколов', role: 'Основной', status: 'in_progress', docs: 88, questionnaire: 93 },
      { initials: 'НС', name: 'Нина Соколова', role: 'Супруга', status: 'missing_docs', docs: 61, questionnaire: 84 },
    ],
  },
];

const mockIndividuals: IndividualData[] = [
  { id: 'IND-001', name: 'Алина Смирнова', initials: 'АС', city: 'Москва', tripDates: '02–09 авг', status: 'in_progress', lastActivity: 'Сегодня', submissionsCount: 1, docs: 71, questionnaire: 94 },
  { id: 'IND-002', name: 'Дмитрий Волков', initials: 'ДВ', city: 'Москва', tripDates: '06–12 сен', status: 'ready', lastActivity: '5 авг', submissionsCount: 3, docs: 100, questionnaire: 100 },
  { id: 'IND-003', name: 'Карина Белова', initials: 'КБ', city: 'СПб', tripDates: '14–20 авг', status: 'missing_docs', lastActivity: 'Вчера', submissionsCount: 1, docs: 64, questionnaire: 89 },
  { id: 'IND-004', name: 'Михаил Левин', initials: 'МЛ', city: 'Москва', tripDates: '22–29 сен', status: 'ready', lastActivity: '3 ч назад', submissionsCount: 2, docs: 100, questionnaire: 97 },
];

const statusCopy: Record<ApplicantStatus, string> = {
  ready: 'Готов',
  missing_docs: 'Нужны файлы',
  in_progress: 'В работе',
};

function StatusIcon({ status }: { status: ApplicantStatus }) {
  if (status === 'ready') return <CheckCircle2 className="w-[14px] h-[14px] text-white/48" />;
  if (status === 'missing_docs') return <AlertCircle className="w-[14px] h-[14px] text-[#d6a78f]" />;
  return <Clock3 className="w-[14px] h-[14px] text-[#a8b2ff]" />;
}

function Meter({ value }: { value: number }) {
  return (
    <div className="h-1.5 rounded-full bg-black/35 border border-white/[0.04] overflow-hidden">
      <div className="h-full rounded-full bg-gradient-to-r from-white/34 to-[#a8b2ff]/75" style={{ width: `${value}%` }} />
    </div>
  );
}

function StatPill({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-[#151518] border border-[#25262b] px-4 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.025)]">
      <div className="text-[11px] uppercase tracking-[0.14em] text-white/34">{label}</div>
      <div className="text-[18px] font-semibold text-white tracking-[-0.03em] mt-1">{value}</div>
    </div>
  );
}

export function ApplicantsScreen({ onOpenDrawer }: ApplicantsScreenProps) {
  const [mobileSummaryOpen, setMobileSummaryOpen] = useState(false);
  const totalReady = mockFamilies.filter((family) => family.blockers === 0).length + mockIndividuals.filter((ind) => ind.status === 'ready').length;
  const totalNeeds = mockFamilies.filter((family) => family.blockers > 0).length + mockIndividuals.filter((ind) => ind.status === 'missing_docs').length;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.24 }}
      className="vf-applicants-screen space-y-5"
    >
      <div className="vf-applicants-hero rounded-[24px] bg-[radial-gradient(circle_at_18%_0%,rgba(88,101,242,0.12),transparent_32%),linear-gradient(180deg,#1a1a1d,#111113)] border border-[#26272d] p-5 lg:p-6 shadow-[inset_0_1px_0_rgba(255,255,255,0.035),0_18px_60px_rgba(0,0,0,0.25)]">
        <div className="flex flex-col xl:flex-row xl:items-end gap-5">
          <div className="flex-1 min-w-0">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full bg-[#22232a] border border-[#34364a] text-[#a8b2ff] text-[11px] font-medium mb-4">
              <Users className="w-3.5 h-3.5" /> Единый реестр заявителей
            </div>
            <h1 className="text-[24px] lg:text-[30px] font-semibold tracking-[-0.04em] text-white leading-tight m-0">
              Семьи и одиночные профили без CRM-шума
            </h1>
            <p className="text-[13.5px] text-white/50 mt-2 max-w-[760px] leading-relaxed">
              Быстрый обзор готовности: кто входит в пакет, где недостающие файлы, какие анкеты закрыты и какой следующий шаг нужен агенту.
            </p>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-4 xl:grid-cols-4 gap-2.5 xl:w-[560px]">
            <StatPill label="семьи" value="3" />
            <StatPill label="одиночные" value="4" />
            <StatPill label="готово" value={`${totalReady}`} />
            <StatPill label="нужно" value={`${totalNeeds}`} />
          </div>
        </div>
      </div>

      <div className="vf-applicants-toolbar flex flex-col lg:flex-row gap-3 lg:items-center">
        <div className="vf-applicants-tabs flex bg-[#161617] p-1 border border-[#202124] rounded-[12px] overflow-x-auto scrollbar-hide">
          {['Все', 'Семьи', 'Одиночные', 'Нужны файлы', 'Готовы'].map((tab, i) => (
            <button key={tab} className={`px-3.5 py-1.5 rounded-[9px] text-[13px] whitespace-nowrap border transition-colors ${i === 0 ? 'bg-[#27272b] border-[#34353b] text-white shadow-sm' : 'border-transparent text-white/46 hover:text-white/75 hover:bg-white/[0.035]'}`}>{tab}</button>
          ))}
        </div>
        <div className="vf-applicants-search-row lg:ml-auto flex items-center gap-2">
          <div className="relative min-w-0 flex-1 lg:w-[320px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/35" />
            <input placeholder="Поиск по имени, семье, городу..." className="w-full h-10 bg-[#1e1e21] border border-[#242529] rounded-[11px] pl-9 pr-3 text-[13px] text-white placeholder-white/35 focus:border-[#5963d8]/70 focus:ring-1 focus:ring-[#5963d8]/25 transition-all outline-none" />
          </div>
          <button className="w-10 h-10 rounded-[11px] bg-[#1e1e21] hover:bg-[#27272b] border border-[#242529] text-white/62 flex items-center justify-center transition-colors">
            <SlidersHorizontal className="w-4 h-4" />
          </button>
        </div>
      </div>

      <section className="vf-applicants-section rounded-[24px] bg-gradient-to-b from-[#18181b] to-[#111113] border border-[#25262b] overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_18px_45px_rgba(0,0,0,0.22)]">
        <div className="vf-applicants-section-head h-14 px-5 border-b border-[#242529] flex items-center justify-between">
          <div>
            <h2 className="text-[14px] font-semibold text-white m-0">Семейные пакеты</h2>
            <p className="text-[11.5px] text-white/38 m-0 mt-0.5">Группировка по семье, заявителям и готовности документов</p>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#202024] border border-white/[0.06] text-[11px] text-white/52"><Sparkles className="w-3.5 h-3.5 text-[#a8b2ff]" /> AI подсказки тихие</span>
        </div>

        <div className="divide-y divide-white/[0.055]">
          {mockFamilies.map((family) => (
            <button
              key={family.id}
              onClick={() => onOpenDrawer(family.id)}
              className="vf-family-row w-full p-4 lg:p-5 text-left hover:bg-white/[0.025] transition-colors group focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5963d8]"
            >
              <div className="vf-family-grid grid grid-cols-1 xl:grid-cols-[260px_minmax(0,1fr)_210px_120px] gap-4 xl:items-center">
                <div className="min-w-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-[#202024] border border-white/[0.07] flex items-center justify-center text-white/62 group-hover:text-[#a8b2ff] transition-colors">
                      <Users className="w-4.5 h-4.5" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-[14.5px] font-semibold text-white truncate">{family.title}</div>
                      <div className="text-[11.5px] text-white/42 mt-0.5 truncate">{family.city} · {family.tripDates} · {family.members.length} заявителя</div>
                    </div>
                  </div>
                </div>

                <div className="vf-family-members grid grid-cols-1 md:grid-cols-2 gap-2">
                  {family.members.slice(0, 4).map((member) => (
                    <div key={`${family.id}-${member.name}`} className="vf-family-member rounded-2xl bg-[#151518] border border-[#25262b] px-3 py-2.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-full bg-gradient-to-b from-[#2a2b31] to-[#1a1b1f] border border-white/[0.08] flex items-center justify-center text-[10px] font-semibold text-white/65 shrink-0">{member.initials}</div>
                        <div className="min-w-0 flex-1">
                          <div className="text-[12.5px] font-medium text-white/86 truncate">{member.name}</div>
                          <div className="text-[10.5px] text-white/36 truncate">{member.role} · анкета {member.questionnaire}% · файлы {member.docs}%</div>
                        </div>
                        <StatusIcon status={member.status} />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="vf-family-readiness space-y-2">
                  <div className="flex items-center justify-between text-[11.5px]">
                    <span className="text-white/42">Готовность</span>
                    <span className="text-white/70 font-medium">{family.readiness}%</span>
                  </div>
                  <Meter value={family.readiness} />
                  <div className="flex items-center gap-2 text-[11px] text-white/42">
                    <Folder className="w-3.5 h-3.5" /> {family.submissionsCount} пакета · акт: {family.lastActivity}
                  </div>
                </div>

                <div className="vf-family-status flex xl:justify-end items-center gap-2">
                  <span className={`px-2.5 py-1 rounded-full border text-[11px] font-semibold ${family.blockers ? 'bg-[#2a2320] border-[#47372f] text-[#d6a78f]' : 'bg-[#202024] border-white/[0.06] text-white/62'}`}>
                    {family.blockers ? `${family.blockers} blocker` : 'чисто'}
                  </span>
                  <ChevronRight className="w-4 h-4 text-white/28 group-hover:text-white/60 transition-colors" />
                </div>
              </div>
            </button>
          ))}
        </div>
      </section>

      <section className="vf-applicants-section rounded-[24px] bg-gradient-to-b from-[#18181b] to-[#111113] border border-[#25262b] overflow-hidden shadow-[inset_0_1px_0_rgba(255,255,255,0.03),0_18px_45px_rgba(0,0,0,0.22)]">
        <div className="vf-applicants-section-head h-14 px-5 border-b border-[#242529] flex items-center justify-between">
          <div>
            <h2 className="text-[14px] font-semibold text-white m-0">Одиночные профили</h2>
            <p className="text-[11.5px] text-white/38 m-0 mt-0.5">Быстрый доступ к заявителю без раскрытия drawer</p>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[#202024] border border-white/[0.06] text-[11px] text-white/52"><ShieldCheck className="w-3.5 h-3.5 text-white/42" /> 4 активных</span>
        </div>

        <div className="vf-individual-grid grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3 p-4 lg:p-5">
          {mockIndividuals.map((ind) => (
            <button
              key={ind.id}
              onClick={() => onOpenDrawer(ind.id)}
              className="vf-individual-card p-4 rounded-[20px] bg-[#151518] border border-[#25262b] hover:border-[#5963d8]/35 transition-all text-left group shadow-[inset_0_1px_0_rgba(255,255,255,0.025)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#5963d8]"
            >
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-full bg-gradient-to-b from-[#2a2b31] to-[#191a1d] border border-white/[0.09] flex items-center justify-center text-[12px] font-semibold text-white/70 shrink-0 group-hover:border-[#5963d8]/45 transition-colors">{ind.initials}</div>
                <div className="min-w-0 flex-1">
                  <div className="text-[14px] font-semibold text-white truncate">{ind.name}</div>
                  <div className="text-[11.5px] text-white/42 mt-0.5 truncate">{ind.city} · {ind.tripDates}</div>
                </div>
                <ArrowUpRight className="w-4 h-4 text-white/28 group-hover:text-[#a8b2ff] transition-colors" />
              </div>

              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between text-[11.5px]"><span className="text-white/42 flex items-center gap-1.5"><FileText className="w-3.5 h-3.5" /> Анкета</span><span className="text-white/68 font-medium">{ind.questionnaire}%</span></div>
                <Meter value={ind.questionnaire} />
                <div className="flex items-center justify-between text-[11.5px]"><span className="text-white/42 flex items-center gap-1.5"><Folder className="w-3.5 h-3.5" /> Файлы</span><span className="text-white/68 font-medium">{ind.docs}%</span></div>
                <Meter value={ind.docs} />
              </div>

              <div className="mt-4 pt-3 border-t border-white/[0.055] flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-[11.5px] text-white/46"><StatusIcon status={ind.status} /> {statusCopy[ind.status]}</span>
                <span className="text-[11px] text-white/34">{ind.lastActivity}</span>
              </div>
            </button>
          ))}
        </div>
      </section>

      <div className="vf-applicants-mobile-dock" aria-label="Дополнения заявителей">
        <button type="button" onClick={() => setMobileSummaryOpen(true)}>
          <Sparkles className="h-4 w-4" />
          Сводка
        </button>
      </div>

      <AnimatePresence>
        {mobileSummaryOpen && (
          <>
            <motion.button
              type="button"
              aria-label="Закрыть сводку заявителей"
              className="vf-questionnaire-info-backdrop"
              onClick={() => setMobileSummaryOpen(false)}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.24 }}
            />
            <motion.aside
              role="dialog"
              aria-modal="true"
              aria-label="Сводка заявителей"
              className="vf-questionnaire-info-sheet vf-applicants-summary-sheet"
              initial={{ y: 24, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 24, opacity: 0 }}
              transition={{ duration: 0.24 }}
            >
              <div className="vf-questionnaire-info-sheet-head">
                <div>
                  <span>Единый реестр заявителей</span>
                  <strong>Семьи и одиночные профили</strong>
                </div>
                <button type="button" onClick={() => setMobileSummaryOpen(false)} aria-label="Закрыть">
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="vf-admin-sheet-metrics">
                <StatPill label="семьи" value={`${mockFamilies.length}`} />
                <StatPill label="одиночные" value={`${mockIndividuals.length}`} />
                <StatPill label="готово" value={`${totalReady}`} />
                <StatPill label="нужно" value={`${totalNeeds}`} />
              </div>
              <div className="vf-questionnaire-info-note">
                Обзор готовности, недостающие файлы и общий статус вынесены сюда, чтобы рабочий список заявителей был первым экраном.
              </div>
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
