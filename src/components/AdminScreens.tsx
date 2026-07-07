import React, { useEffect, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertCircle,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  FileCheck2,
  Flame,
  MessageSquareWarning,
  ShieldCheck,
  Sparkles,
  User,
  Users,
} from 'lucide-react';
import { AdminMetricCard, AdminQueueToolbar } from './AdminSurfaceCommon';

interface AdminScreenProps {
  onOpenDrawer: (id: string) => void;
}

type Lane = 'urgent' | 'review' | 'returned' | 'ready';

interface ReviewCard {
  id: string;
  title: string;
  type: 'family' | 'single';
  applicants: number;
  country: string;
  city: string;
  lane: Lane;
  agent: string;
  timeInQueue: string;
  questionnaire: number;
  files: number;
  blockers: number;
  warnings: number;
  aiFlags: number;
  nextAction: string;
  lastEvent: string;
}

const reviews: ReviewCard[] = [
  {
    id: 'SUB-1061',
    title: 'Семья Орловых',
    type: 'family',
    applicants: 4,
    country: 'Испания',
    city: 'Москва',
    lane: 'urgent',
    agent: 'Мария Климова',
    timeInQueue: '1 ч 15 мин',
    questionnaire: 100,
    files: 92,
    blockers: 1,
    warnings: 2,
    aiFlags: 1,
    nextAction: 'Проверить паспорт основного заявителя',
    lastEvent: 'Агент загрузил исправленный scan 14 мин назад',
  },
  {
    id: 'SUB-1082',
    title: 'Евгений Смирнов',
    type: 'single',
    applicants: 1,
    country: 'Испания',
    city: 'Санкт-Петербург',
    lane: 'review',
    agent: 'Игорь Сафонов',
    timeInQueue: '45 мин',
    questionnaire: 96,
    files: 100,
    blockers: 0,
    warnings: 1,
    aiFlags: 1,
    nextAction: 'Сверить место рождения в анкете и паспорте',
    lastEvent: 'OCR отметил расхождение 8 мин назад',
  },
  {
    id: 'FAM-005',
    title: 'Семья Кузнецовых',
    type: 'family',
    applicants: 3,
    country: 'Испания',
    city: 'Екатеринбург',
    lane: 'returned',
    agent: 'Олег Морозов',
    timeInQueue: '2 ч 05 мин',
    questionnaire: 88,
    files: 71,
    blockers: 2,
    warnings: 0,
    aiFlags: 0,
    nextAction: 'Ждём новые справки по детям',
    lastEvent: 'Админ вернул 2 замечания сегодня в 11:42',
  },
  {
    id: 'SUB-1078',
    title: 'Дмитрий Волков',
    type: 'single',
    applicants: 1,
    country: 'Испания',
    city: 'Москва',
    lane: 'ready',
    agent: 'Анна Ветрова',
    timeInQueue: '18 мин',
    questionnaire: 100,
    files: 100,
    blockers: 0,
    warnings: 0,
    aiFlags: 0,
    nextAction: 'Подтвердить и отправить в выгрузку',
    lastEvent: 'Все замечания закрыты 18 мин назад',
  },
];

const lanes: { id: Lane; title: string; subtitle: string; tone: string; icon: React.ElementType }[] = [
  { id: 'urgent', title: 'Блокеры', subtitle: 'сначала сюда', tone: 'red', icon: Flame },
  { id: 'review', title: 'Проверить', subtitle: 'ручная сверка', tone: 'orange', icon: ShieldCheck },
  { id: 'returned', title: 'Исправления', subtitle: 'ответ агента', tone: 'blue', icon: MessageSquareWarning },
  { id: 'ready', title: 'Готово', subtitle: 'к выгрузке', tone: 'green', icon: CheckCircle2 },
];

const reviewIntroStorageKey = 'visaflow.v19.adminReviewIntroSeen';

function toneClasses(tone: string) {
  switch (tone) {
    case 'red':
      return 'border-[#5b2b32]/45 bg-[#24191b]/60 text-[#d59aa3]';
    case 'orange':
      return 'border-white/10 bg-white/[0.045] text-white/62';
    case 'blue':
      return 'border-[#6f64ff]/25 bg-[#6f64ff]/15 text-[#b8baff]';
    case 'green':
      return 'border-white/10 bg-white/[0.045] text-[#b8baff]';
    default:
      return 'border-white/10 bg-white/5 text-white/50';
  }
}

function ProgressLine({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[10.5px] text-white/40">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-[3px] overflow-hidden rounded-full bg-white/5">
        <div className="h-full rounded-full bg-[#8fa3ff]" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function ReviewQueueCard({ item, onOpenDrawer }: { item: ReviewCard; onOpenDrawer: (id: string) => void }) {
  const hasBlocker = item.blockers > 0;
  const shortQueueTime = item.timeInQueue.replace(/\s+\d+\s+мин$/, '');

  return (
    <button
      onClick={() => onOpenDrawer(item.id)}
      className={`group w-full rounded-[10px] border p-4 text-left font-medium transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_40px_rgba(0,0,0,0.22)] ${hasBlocker ? 'border-[#5b2b32]/45 bg-[#1d1719]/80 hover:border-[#74414a]/55' : 'border-[#242529] bg-[#161617] hover:border-[#6f64ff]/40'}`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1.5 flex max-w-full items-center gap-1.5 overflow-hidden whitespace-nowrap text-[10.5px] font-medium tracking-wide text-white/40">
            <span className="shrink-0 font-mono text-white/60">{item.id}</span>
            <span className="h-1 w-1 shrink-0 rounded-full bg-white/20" />
            <span className="shrink-0">{item.city}</span>
            <span className="h-1 w-1 shrink-0 rounded-full bg-white/20" />
            <span className="shrink-0">{shortQueueTime}</span>
          </div>
          <h3 className="truncate text-[15px] font-semibold text-white group-hover:text-[#b8baff]">{item.title}</h3>
          <div className="mt-1 flex items-center gap-2 text-[11.5px] font-medium text-white/45">
            {item.type === 'family' ? <Users className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
            <span>{item.applicants} чел.</span>
          </div>
        </div>
        <span className="mt-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-white/30 transition-colors group-hover:bg-white/[0.09] group-hover:text-white/55">
          <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>

      <div className="mb-3 rounded-[8px] border border-white/5 bg-white/[0.025] p-3">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-medium text-white/75">
          {item.aiFlags > 0 ? <Sparkles className="h-3.5 w-3.5 text-[#b8baff]" /> : <FileCheck2 className="h-3.5 w-3.5 text-[#b8baff]" />}
          Следующее действие
        </div>
        <p className="text-[12px] leading-relaxed text-white/50">{item.nextAction}</p>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <ProgressLine label="Анкета" value={item.questionnaire} />
        <ProgressLine label="Файлы" value={item.files} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {item.blockers > 0 && <span className="rounded-full border border-[#5b2b32]/45 bg-[#24191b]/60 px-2 py-1 text-[9px] font-medium text-[#d59aa3]">{item.blockers} блокера</span>}
        {item.warnings > 0 && <span className="rounded-full border border-white/10 bg-white/[0.045] px-2 py-1 text-[9px] font-medium text-white/62">{item.warnings} проверить</span>}
        {item.aiFlags > 0 && <span className="rounded-full border border-[#6f64ff]/25 bg-[#6f64ff]/15 px-2 py-1 text-[9px] font-medium text-[#b8baff]">ИИ {item.aiFlags}</span>}
        {item.blockers === 0 && item.warnings === 0 && <span className="rounded-full border border-white/10 bg-white/[0.045] px-2 py-1 text-[9px] font-medium text-[#b8baff]">без замечаний</span>}
      </div>

      <div className="mt-3 border-t border-white/5 pt-3 text-[11px] font-medium text-[#6d6f6d]">{item.agent}</div>
    </button>
  );
}

export function ReviewScreen({ onOpenDrawer }: AdminScreenProps) {
  const [activeLane, setActiveLane] = useState<Lane | 'all'>('all');
  const [cityFilter, setCityFilter] = useState('Все города');
  const [searchQuery, setSearchQuery] = useState('');
  const [showIntro, setShowIntro] = useState(() => {
    if (typeof window === 'undefined') return true;
    return window.sessionStorage.getItem(reviewIntroStorageKey) !== 'true';
  });
  const cityOptions = ['Все города', ...Array.from(new Set(reviews.map((item) => item.city)))];
  const searchNeedle = searchQuery.trim().toLowerCase();
  const filteredReviews = reviews.filter((item) => {
    const cityMatches = cityFilter === 'Все города' || item.city === cityFilter;
    const searchMatches =
      !searchNeedle ||
      [item.id, item.title, item.agent, item.city]
        .join(' ')
        .toLowerCase()
        .includes(searchNeedle);
    return cityMatches && searchMatches;
  });
  const visibleReviews =
    activeLane === 'all'
      ? filteredReviews
      : filteredReviews.filter((item) => item.lane === activeLane);
  const totalBlockers = filteredReviews.reduce((sum, item) => sum + item.blockers, 0);
  const totalWarnings = filteredReviews.reduce((sum, item) => sum + item.warnings, 0);
  const readyCount = filteredReviews.filter((item) => item.lane === 'ready').length;

  useEffect(() => {
    if (!showIntro) return;

    window.sessionStorage.setItem(reviewIntroStorageKey, 'true');
    const timeoutId = window.setTimeout(() => {
      setShowIntro(false);
    }, 5000);

    return () => window.clearTimeout(timeoutId);
  }, [showIntro]);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="grid h-full min-h-[760px] grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="min-w-0 space-y-5">
        {showIntro && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="rounded-[10px] border border-[#242529] bg-gradient-to-br from-[#1a1a1d] via-[#161617] to-[#101011] p-5 lg:p-6"
          >
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.045] px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-white/62">
                <ShieldCheck className="h-3.5 w-3.5" /> Admin review cockpit
              </div>
              <h2 className="text-[24px] font-semibold tracking-tight text-white lg:text-[32px]">Проверка пакетов</h2>
              <p className="mt-2 max-w-2xl text-[13px] leading-relaxed text-white/50">Не просто карточки: очередь показывает приоритет, блокеры, следующее действие, AI-флаги и готовность к выгрузке за 3 секунды.</p>
            </div>
          </motion.div>
        )}

        <div className="grid grid-cols-4 gap-2">
          <AdminMetricCard icon={FileText} label="В очереди" value={`${filteredReviews.length}`} />
          <AdminMetricCard icon={Flame} label="Блокеры" value={`${totalBlockers}`} tone="red" />
          <AdminMetricCard icon={AlertCircle} label="Проверить" value={`${totalWarnings}`} tone="orange" />
          <AdminMetricCard icon={CheckCircle2} label="К выгрузке" value={`${readyCount}`} tone="green" />
        </div>

        <div className="rounded-[10px] border border-[#242529] bg-[#161617]">
          <AdminQueueToolbar
            activeTab={activeLane}
            cityFilter={cityFilter}
            cityOptions={cityOptions}
            filterLabel="Фильтры проверки"
            onCityFilterChange={setCityFilter}
            onFilterClick={() => {
              setCityFilter('Все города');
              setSearchQuery('');
            }}
            onSearchChange={setSearchQuery}
            onTabChange={setActiveLane}
            searchPlaceholder="Поиск: ID, агент, семья"
            searchValue={searchQuery}
            tabs={[
              { id: 'all', label: 'Все' },
              ...lanes.map((lane) => ({
                count: filteredReviews.filter((item) => item.lane === lane.id).length,
                icon: lane.icon,
                id: lane.id,
                label: lane.title,
                tone: toneClasses(lane.tone),
              })),
            ]}
          />

          <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-2 2xl:grid-cols-4">
            {lanes.map((lane) => {
              const Icon = lane.icon;
              const laneItems = visibleReviews.filter((item) => item.lane === lane.id);
              if (activeLane !== 'all' && activeLane !== lane.id) return null;

              return (
                <div key={lane.id} className="min-h-[360px] rounded-[10px] border border-[#242529] bg-[#141416] p-3">
                  <div className="mb-3 flex items-center justify-between gap-2 px-1">
                    <div className="flex items-center gap-2">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-[8px] border ${toneClasses(lane.tone)}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-[13px] font-semibold text-white">{lane.title}</div>
                        <div className="text-[10.5px] text-white/35">{lane.subtitle}</div>
                      </div>
                    </div>
                    <span className="rounded-[8px] bg-white/5 px-2 py-1 text-[11px] font-medium text-white/45">{laneItems.length}</span>
                  </div>

                  <div className="space-y-3">
                    {laneItems.length === 0 ? (
                      <div className="rounded-[10px] border border-dashed border-white/10 p-5 text-center text-[12px] text-white/30">Пусто</div>
                    ) : (
                      laneItems.map((item) => <ReviewQueueCard key={item.id} item={item} onOpenDrawer={onOpenDrawer} />)
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <aside className="flex min-h-0 flex-col gap-5">
        <div className="rounded-[10px] border border-[#242529] bg-[#161617] p-5">
          <div className="mb-4 flex items-center gap-2">
            <Bot className="h-4 w-4 text-[#b8baff]" />
            <h3 className="text-[15px] font-semibold text-white">AI / OCR watchlist</h3>
          </div>
          <div className="space-y-3">
            <div className="rounded-[10px] border border-[#6f64ff]/25 bg-[#6f64ff]/10 p-3">
              <div className="text-[12px] font-medium text-white">SUB-1082 · место рождения</div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-white/45">OCR видит MOSCOW, анкета содержит MOSKVA. Нужно решение админа.</p>
            </div>
            <div className="rounded-[10px] border border-white/10 bg-white/[0.045] p-3">
              <div className="text-[12px] font-medium text-white">SUB-1061 · файл страховки</div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-white/45">Срок покрытия меньше периода поездки на 1 день.</p>
            </div>
          </div>
        </div>

        <div className="rounded-[10px] border border-[#242529] bg-[#161617] p-5">
          <div className="mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-white/40" />
            <h3 className="text-[15px] font-semibold text-white">SLA сегодня</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-[10px] bg-white/[0.03] p-3">
              <span className="text-[12px] text-white/45">Среднее ревью</span>
              <span className="text-[13px] font-semibold text-white">37 мин</span>
            </div>
            <div className="flex items-center justify-between rounded-[10px] bg-white/[0.03] p-3">
              <span className="text-[12px] text-white/45">Старейший пакет</span>
              <span className="text-[13px] font-semibold text-white/62">2 ч 05 мин</span>
            </div>
            <div className="flex items-center justify-between rounded-[10px] bg-white/[0.03] p-3">
              <span className="text-[12px] text-white/45">К выгрузке</span>
              <span className="text-[13px] font-semibold text-[#b8baff]">1 пакет</span>
            </div>
          </div>
        </div>

        <div className="rounded-[10px] border border-[#242529] bg-[#161617] p-5">
          <h3 className="mb-4 text-[15px] font-semibold text-white">Операционные правила</h3>
          <div className="space-y-3 text-[12px] leading-relaxed text-white/45">
            <div className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#b8baff]" /> Не принимать пакет с открытыми blocker-замечаниями.</div>
            <div className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#b8baff]" /> AI-флаг не является решением, только подсказка для проверки.</div>
            <div className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#b8baff]" /> После принятия пакет получает status ready_for_export и попадает в Excel-выгрузку с audit trail.</div>
          </div>
        </div>
      </aside>
    </motion.div>
  );
}
