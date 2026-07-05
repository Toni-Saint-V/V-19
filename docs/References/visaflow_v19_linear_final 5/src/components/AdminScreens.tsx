import React, { useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  AlertCircle,
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileCheck2,
  FileText,
  Filter,
  Flame,
  MessageSquareWarning,
  Search,
  ShieldCheck,
  Sparkles,
  User,
  Users,
  X,
} from 'lucide-react';

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

function toneClasses(tone: string) {
  switch (tone) {
    case 'red':
      return 'border-red-500/25 bg-red-500/10 text-red-400';
    case 'orange':
      return 'border-orange-500/25 bg-orange-500/10 text-orange-400';
    case 'blue':
      return 'border-[#3a45b4]/25 bg-[#3a45b4]/15 text-[#8fa3ff]';
    case 'green':
      return 'border-emerald-500/25 bg-emerald-500/10 text-emerald-400';
    default:
      return 'border-white/10 bg-white/5 text-white/50';
  }
}

function MetricCard({ icon: Icon, label, value, tone = 'neutral' }: { icon: React.ElementType; label: string; value: string; tone?: string }) {
  return (
    <div className="rounded-2xl border border-[#242529] bg-gradient-to-br from-[#1a1a1d] to-[#141416] p-4">
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-medium uppercase tracking-wide text-white/45">{label}</span>
        <Icon className={`h-4 w-4 ${tone === 'green' ? 'text-emerald-400' : tone === 'orange' ? 'text-orange-400' : tone === 'red' ? 'text-red-400' : 'text-white/40'}`} />
      </div>
      <div className="mt-4 text-2xl font-semibold text-white">{value}</div>
    </div>
  );
}

function ProgressLine({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <div className="mb-1 flex justify-between text-[10.5px] text-white/40">
        <span>{label}</span>
        <span>{value}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
        <div className="h-full rounded-full bg-[#8fa3ff]" style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function ReviewQueueCard({ item, onOpenDrawer }: { item: ReviewCard; onOpenDrawer: (id: string) => void }) {
  const hasBlocker = item.blockers > 0;

  return (
    <button
      onClick={() => onOpenDrawer(item.id)}
      className={`group w-full rounded-2xl border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_40px_rgba(0,0,0,0.22)] ${hasBlocker ? 'border-red-500/25 bg-red-500/[0.055] hover:border-red-500/40' : 'border-[#242529] bg-[#161617] hover:border-[#3a45b4]/40'}`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1.5 flex items-center gap-2 text-[10.5px] font-medium tracking-wide text-white/40">
            <span className="font-mono text-white/60">{item.id}</span>
            <span className="h-1 w-1 rounded-full bg-white/20" />
            <span>{item.city}</span>
            <span className="h-1 w-1 rounded-full bg-white/20" />
            <span>{item.timeInQueue}</span>
          </div>
          <h3 className="truncate text-[15px] font-semibold text-white group-hover:text-[#8fa3ff]">{item.title}</h3>
          <div className="mt-1 flex items-center gap-2 text-[11.5px] text-white/45">
            {item.type === 'family' ? <Users className="h-3.5 w-3.5" /> : <User className="h-3.5 w-3.5" />}
            <span>{item.applicants} чел.</span>
            <span>·</span>
            <span>{item.agent}</span>
          </div>
        </div>
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-white/25 transition-transform group-hover:translate-x-0.5 group-hover:text-white/55" />
      </div>

      <div className="mb-3 rounded-xl border border-white/5 bg-white/[0.025] p-3">
        <div className="mb-2 flex items-center gap-2 text-[11px] font-medium text-white/75">
          {item.aiFlags > 0 ? <Sparkles className="h-3.5 w-3.5 text-[#8fa3ff]" /> : <FileCheck2 className="h-3.5 w-3.5 text-emerald-400" />}
          Следующее действие
        </div>
        <p className="text-[12px] leading-relaxed text-white/50">{item.nextAction}</p>
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2">
        <ProgressLine label="Анкета" value={item.questionnaire} />
        <ProgressLine label="Файлы" value={item.files} />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {item.blockers > 0 && <span className="rounded-full border border-red-500/25 bg-red-500/10 px-2 py-1 text-[10.5px] font-medium text-red-400">{item.blockers} блокера</span>}
        {item.warnings > 0 && <span className="rounded-full border border-orange-500/25 bg-orange-500/10 px-2 py-1 text-[10.5px] font-medium text-orange-400">{item.warnings} проверить</span>}
        {item.aiFlags > 0 && <span className="rounded-full border border-[#3a45b4]/25 bg-[#3a45b4]/15 px-2 py-1 text-[10.5px] font-medium text-[#8fa3ff]">ИИ {item.aiFlags}</span>}
        {item.blockers === 0 && item.warnings === 0 && <span className="rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-[10.5px] font-medium text-emerald-400">без замечаний</span>}
      </div>

      <div className="mt-3 border-t border-white/5 pt-3 text-[11px] text-white/35">{item.lastEvent}</div>
    </button>
  );
}

export function ReviewScreen({ onOpenDrawer }: AdminScreenProps) {
  const [activeLane, setActiveLane] = useState<Lane | 'all'>('all');
  const [mobileSummaryOpen, setMobileSummaryOpen] = useState(false);
  const [mobileFiltersOpen, setMobileFiltersOpen] = useState(false);
  const visibleReviews = activeLane === 'all' ? reviews : reviews.filter((item) => item.lane === activeLane);
  const totalBlockers = reviews.reduce((sum, item) => sum + item.blockers, 0);
  const totalWarnings = reviews.reduce((sum, item) => sum + item.warnings, 0);
  const readyCount = reviews.filter((item) => item.lane === 'ready').length;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="vf-admin-review-screen grid h-full min-h-[760px] grid-cols-1 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="min-w-0 space-y-5">
        <div className="vf-admin-review-hero rounded-3xl border border-[#242529] bg-gradient-to-br from-[#1a1a1d] via-[#161617] to-[#101011] p-5 lg:p-6">
          <div className="vf-admin-review-hero-head flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="vf-admin-review-kicker mb-3 inline-flex items-center gap-2 rounded-full border border-orange-500/20 bg-orange-500/10 px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide text-orange-400">
                <ShieldCheck className="h-3.5 w-3.5" /> Admin review cockpit
              </div>
              <h2 className="vf-admin-review-title text-[24px] font-semibold tracking-tight text-white lg:text-[32px]">Проверка пакетов</h2>
              <p className="vf-admin-review-copy mt-2 max-w-2xl text-[13px] leading-relaxed text-white/50">Не просто карточки: очередь показывает приоритет, блокеры, следующее действие, AI-флаги и готовность к выгрузке за 3 секунды.</p>
            </div>
            <button onClick={() => visibleReviews[0] && onOpenDrawer(visibleReviews[0].id)} className="flex h-11 items-center justify-center gap-2 rounded-xl bg-[#3a45b4] px-4 text-[13px] font-semibold text-white shadow-[0_0_24px_rgba(58,69,180,0.25)] transition-colors hover:bg-[#4855d4]">
              Открыть первый пакет <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="vf-admin-review-metrics grid grid-cols-2 gap-3 lg:grid-cols-4">
          <MetricCard icon={FileText} label="В очереди" value={`${reviews.length}`} />
          <MetricCard icon={Flame} label="Блокеры" value={`${totalBlockers}`} tone="red" />
          <MetricCard icon={AlertCircle} label="Проверить" value={`${totalWarnings}`} tone="orange" />
          <MetricCard icon={CheckCircle2} label="К выгрузке" value={`${readyCount}`} tone="green" />
        </div>

        <div className="vf-admin-review-filters rounded-2xl border border-[#242529] bg-[#161617]">
          <div className="flex flex-col gap-3 border-b border-[#242529] p-4 lg:flex-row lg:items-center">
            <div className="flex flex-wrap items-center gap-2">
              <button onClick={() => setActiveLane('all')} className={`rounded-xl border px-3 py-2 text-[12px] font-medium transition-colors ${activeLane === 'all' ? 'border-[#3a45b4]/40 bg-[#3a45b4]/15 text-[#8fa3ff]' : 'border-white/10 bg-white/5 text-white/55 hover:text-white'}`}>Все</button>
              {lanes.map((lane) => {
                const Icon = lane.icon;
                const count = reviews.filter((item) => item.lane === lane.id).length;
                return (
                  <button key={lane.id} onClick={() => setActiveLane(lane.id)} className={`inline-flex items-center gap-2 rounded-xl border px-3 py-2 text-[12px] font-medium transition-colors ${activeLane === lane.id ? toneClasses(lane.tone) : 'border-white/10 bg-white/5 text-white/55 hover:text-white'}`}>
                    <Icon className="h-3.5 w-3.5" /> {lane.title} <span className="text-white/35">{count}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-1 items-center gap-2 lg:ml-auto lg:max-w-[440px]">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                <input className="h-10 w-full rounded-xl border border-[#242529] bg-[#111113] pl-9 pr-3 text-[13px] text-white placeholder:text-white/30 outline-none focus:border-orange-500/60" placeholder="Поиск: ID, агент, семья" />
              </div>
              <button className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#242529] bg-[#111113] text-white/55 hover:bg-white/5 hover:text-white">
                <Filter className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 p-4 lg:grid-cols-2 2xl:grid-cols-4">
            {lanes.map((lane) => {
              const Icon = lane.icon;
              const laneItems = visibleReviews.filter((item) => item.lane === lane.id);
              if (activeLane !== 'all' && activeLane !== lane.id) return null;

              return (
                <div key={lane.id} className="min-h-[360px] rounded-2xl border border-[#242529] bg-[#141416] p-3">
                  <div className="mb-3 flex items-center justify-between gap-2 px-1">
                    <div className="flex items-center gap-2">
                      <div className={`flex h-8 w-8 items-center justify-center rounded-xl border ${toneClasses(lane.tone)}`}>
                        <Icon className="h-4 w-4" />
                      </div>
                      <div>
                        <div className="text-[13px] font-semibold text-white">{lane.title}</div>
                        <div className="text-[10.5px] text-white/35">{lane.subtitle}</div>
                      </div>
                    </div>
                    <span className="rounded-lg bg-white/5 px-2 py-1 text-[11px] font-medium text-white/45">{laneItems.length}</span>
                  </div>

                  <div className="space-y-3">
                    {laneItems.length === 0 ? (
                      <div className="rounded-2xl border border-dashed border-white/10 p-5 text-center text-[12px] text-white/30">Пусто</div>
                    ) : (
                      laneItems.map((item) => <ReviewQueueCard key={item.id} item={item} onOpenDrawer={onOpenDrawer} />)
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="vf-admin-mobile-dock" aria-label="Действия очереди">
          <button type="button" onClick={() => visibleReviews[0] && onOpenDrawer(visibleReviews[0].id)}>
            Первый
          </button>
          <button type="button" onClick={() => setMobileSummaryOpen(true)}>
            Сводка
          </button>
          <button type="button" onClick={() => setMobileFiltersOpen(true)}>
            Фильтры
          </button>
        </div>

        <AnimatePresence>
          {mobileSummaryOpen && (
            <>
              <motion.button
                aria-label="Закрыть сводку"
                className="vf-questionnaire-info-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                type="button"
                onClick={() => setMobileSummaryOpen(false)}
              />
              <motion.aside
                aria-label="Сводка очереди"
                className="vf-questionnaire-info-sheet vf-admin-mobile-sheet"
                initial={{ y: 32, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 32, opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                <div className="vf-questionnaire-info-sheet-head">
                  <div>
                    <span>Сводка очереди</span>
                    <strong>Проверка пакетов</strong>
                  </div>
                  <button type="button" onClick={() => setMobileSummaryOpen(false)} aria-label="Закрыть">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="vf-admin-sheet-metrics">
                  <MetricCard icon={FileText} label="В очереди" value={`${reviews.length}`} />
                  <MetricCard icon={Flame} label="Блокеры" value={`${totalBlockers}`} tone="red" />
                  <MetricCard icon={AlertCircle} label="Проверить" value={`${totalWarnings}`} tone="orange" />
                  <MetricCard icon={CheckCircle2} label="К выгрузке" value={`${readyCount}`} tone="green" />
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {mobileFiltersOpen && (
            <>
              <motion.button
                aria-label="Закрыть фильтры"
                className="vf-questionnaire-info-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                type="button"
                onClick={() => setMobileFiltersOpen(false)}
              />
              <motion.aside
                aria-label="Фильтры очереди"
                className="vf-questionnaire-info-sheet vf-admin-mobile-sheet"
                initial={{ y: 32, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: 32, opacity: 0 }}
                transition={{ duration: 0.18 }}
              >
                <div className="vf-questionnaire-info-sheet-head">
                  <div>
                    <span>Фильтры очереди</span>
                    <strong>{activeLane === 'all' ? 'Все пакеты' : lanes.find((lane) => lane.id === activeLane)?.title}</strong>
                  </div>
                  <button type="button" onClick={() => setMobileFiltersOpen(false)} aria-label="Закрыть">
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <div className="vf-admin-sheet-filters">
                  <button onClick={() => { setActiveLane('all'); setMobileFiltersOpen(false); }} className={activeLane === 'all' ? 'is-active' : ''}>Все</button>
                  {lanes.map((lane) => {
                    const Icon = lane.icon;
                    const count = reviews.filter((item) => item.lane === lane.id).length;
                    return (
                      <button key={lane.id} onClick={() => { setActiveLane(lane.id); setMobileFiltersOpen(false); }} className={activeLane === lane.id ? 'is-active' : ''}>
                        <Icon className="h-4 w-4" />
                        {lane.title}
                        <span>{count}</span>
                      </button>
                    );
                  })}
                </div>
                <div className="vf-admin-sheet-search">
                  <Search className="h-4 w-4" />
                  <span>Поиск доступен на основной панели</span>
                </div>
              </motion.aside>
            </>
          )}
        </AnimatePresence>
      </section>

      <aside className="flex min-h-0 flex-col gap-5">
        <div className="rounded-2xl border border-[#242529] bg-[#161617] p-5">
          <div className="mb-4 flex items-center gap-2">
            <Bot className="h-4 w-4 text-[#8fa3ff]" />
            <h3 className="text-[15px] font-semibold text-white">AI / OCR watchlist</h3>
          </div>
          <div className="space-y-3">
            <div className="rounded-xl border border-[#3a45b4]/25 bg-[#3a45b4]/10 p-3">
              <div className="text-[12px] font-medium text-white">SUB-1082 · место рождения</div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-white/45">OCR видит MOSCOW, анкета содержит MOSKVA. Нужно решение админа.</p>
            </div>
            <div className="rounded-xl border border-orange-500/25 bg-orange-500/10 p-3">
              <div className="text-[12px] font-medium text-white">SUB-1061 · файл страховки</div>
              <p className="mt-1 text-[11.5px] leading-relaxed text-white/45">Срок покрытия меньше периода поездки на 1 день.</p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#242529] bg-[#161617] p-5">
          <div className="mb-4 flex items-center gap-2">
            <Clock className="h-4 w-4 text-white/40" />
            <h3 className="text-[15px] font-semibold text-white">SLA сегодня</h3>
          </div>
          <div className="space-y-3">
            <div className="flex items-center justify-between rounded-xl bg-white/[0.03] p-3">
              <span className="text-[12px] text-white/45">Среднее ревью</span>
              <span className="text-[13px] font-semibold text-white">37 мин</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-white/[0.03] p-3">
              <span className="text-[12px] text-white/45">Старейший пакет</span>
              <span className="text-[13px] font-semibold text-orange-400">2 ч 05 мин</span>
            </div>
            <div className="flex items-center justify-between rounded-xl bg-white/[0.03] p-3">
              <span className="text-[12px] text-white/45">К выгрузке</span>
              <span className="text-[13px] font-semibold text-emerald-400">1 пакет</span>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#242529] bg-[#161617] p-5">
          <h3 className="mb-4 text-[15px] font-semibold text-white">Операционные правила</h3>
          <div className="space-y-3 text-[12px] leading-relaxed text-white/45">
            <div className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> Не принимать пакет с открытыми blocker-замечаниями.</div>
            <div className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> AI-флаг не является решением, только подсказка для проверки.</div>
            <div className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-400" /> После accept пакет попадает в Выгрузку с audit trail.</div>
          </div>
        </div>
      </aside>
    </motion.div>
  );
}
