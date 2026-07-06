import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  AlertCircle,
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
} from 'lucide-react';

interface AdminScreenProps {
  onOpenDrawer: (id: string) => void;
}

type Lane = 'urgent' | 'review' | 'returned' | 'ready';
type LaneFilter = Lane | 'all';
type ReviewSortMode = 'priority' | 'oldest' | 'readiness' | 'agent';
type RiskFilter = 'all' | 'blockers' | 'attention' | 'ai' | 'clean';

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
  queueMinutes?: number;
  questionnaire: number;
  files: number;
  blockers: number;
  warnings: number;
  aiFlags: number;
  nextAction: string;
  lastEvent: string;
}

type ReviewTypeFilter = 'all' | ReviewCard['type'];

interface ParsedQueueQuery {
  terms: string[];
  sortMode?: ReviewSortMode;
  riskFilter?: RiskFilter;
  typeFilter?: ReviewTypeFilter;
  laneFilter?: LaneFilter;
  fields: Partial<Record<'id' | 'agent' | 'city' | 'country', string>>;
}

interface QueueControls {
  activeLane: LaneFilter;
  searchQuery: string;
  quickRiskFilter: RiskFilter;
  quickSortMode: ReviewSortMode;
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
    queueMinutes: 75,
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
    queueMinutes: 45,
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
    queueMinutes: 125,
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
    queueMinutes: 18,
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

const lanePriority: Record<Lane, number> = {
  urgent: 0,
  review: 1,
  returned: 2,
  ready: 3,
};

const riskFilterOrder: RiskFilter[] = ['all', 'blockers', 'attention', 'ai', 'clean'];
const sortModeOrder: ReviewSortMode[] = ['priority', 'oldest', 'readiness', 'agent'];

const riskFilterLabels: Record<RiskFilter, string> = {
  all: 'все',
  blockers: 'блокеры',
  attention: 'сверка',
  ai: 'AI',
  clean: 'без замечаний',
};

const sortModeLabels: Record<ReviewSortMode, string> = {
  priority: 'приоритет',
  oldest: 'дольше ждут',
  readiness: 'ниже готовность',
  agent: 'агент',
};

const reviewIntroStorageKey = 'visaflow.v19.adminReviewIntroSeen';
const reviewQueueControlsStorageKey = 'visaflow.v19.adminReviewControls';

const defaultQueueControls: QueueControls = {
  activeLane: 'all',
  searchQuery: '',
  quickRiskFilter: 'all',
  quickSortMode: 'priority',
};

function isLaneFilter(value: unknown): value is LaneFilter {
  return value === 'all' || value === 'urgent' || value === 'review' || value === 'returned' || value === 'ready';
}

function isRiskFilter(value: unknown): value is RiskFilter {
  return value === 'all' || value === 'blockers' || value === 'attention' || value === 'ai' || value === 'clean';
}

function isReviewSortMode(value: unknown): value is ReviewSortMode {
  return value === 'priority' || value === 'oldest' || value === 'readiness' || value === 'agent';
}
function readStoredQueueControls() {
  if (typeof window === 'undefined') return defaultQueueControls;

  try {
    const rawValue = window.sessionStorage.getItem(reviewQueueControlsStorageKey);
    if (!rawValue) return defaultQueueControls;

    const parsed = JSON.parse(rawValue) as Partial<QueueControls>;

    return {
      activeLane: isLaneFilter(parsed.activeLane) ? parsed.activeLane : defaultQueueControls.activeLane,
      searchQuery: typeof parsed.searchQuery === 'string' ? parsed.searchQuery : defaultQueueControls.searchQuery,
      quickRiskFilter: isRiskFilter(parsed.quickRiskFilter) ? parsed.quickRiskFilter : defaultQueueControls.quickRiskFilter,
      quickSortMode: isReviewSortMode(parsed.quickSortMode) ? parsed.quickSortMode : defaultQueueControls.quickSortMode,
    };
  } catch {
    return defaultQueueControls;
  }
}

function getNextValue<T extends string>(items: readonly T[], value: T) {
  const currentIndex = items.indexOf(value);
  const nextIndex = currentIndex === -1 ? 0 : (currentIndex + 1) % items.length;
  return items[nextIndex];
}

function clampPercent(value: number) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

function normalizeSearch(value: string) {
  return value.toLocaleLowerCase('ru-RU').replace(/ё/g, 'е').replace(/\s+/g, ' ').trim();
}

function parseQueueDuration(value: string) {
  const normalizedValue = normalizeSearch(value);
  const hoursMatch = normalizedValue.match(/(\d+)\s*ч/);
  const minutesMatch = normalizedValue.match(/(\d+)\s*мин/);
  const hours = hoursMatch ? Number(hoursMatch[1]) : 0;
  const minutes = minutesMatch ? Number(minutesMatch[1]) : 0;
  return hours * 60 + minutes;
}

function getQueueMinutes(item: ReviewCard) {
  return typeof item.queueMinutes === 'number' ? item.queueMinutes : parseQueueDuration(item.timeInQueue);
}

function reviewReadiness(item: ReviewCard) {
  return Math.round((clampPercent(item.questionnaire) + clampPercent(item.files)) / 2);
}

function reviewRiskScore(item: ReviewCard) {
  return item.blockers * 100 + item.warnings * 20 + item.aiFlags * 12 + Math.max(0, 100 - reviewReadiness(item));
}

function russianPlural(count: number, one: string, few: string, many: string) {
  const mod10 = Math.abs(count) % 10;
  const mod100 = Math.abs(count) % 100;

  if (mod10 === 1 && mod100 !== 11) return one;
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return few;
  return many;
}

function formatPackageCount(count: number) {
  return `${count} ${russianPlural(count, 'пакет', 'пакета', 'пакетов')}`;
}

function formatQueueMinutes(minutes: number) {
  if (!Number.isFinite(minutes) || minutes <= 0) return '—';
  if (minutes < 60) return `${minutes} мин`;

  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} ч ${String(rest).padStart(2, '0')} мин` : `${hours} ч`;
}

function mapLaneFilter(value: string): LaneFilter | undefined {
  const aliases: Record<string, LaneFilter> = {
    all: 'all',
    все: 'all',
    urgent: 'urgent',
    blocker: 'urgent',
    blockers: 'urgent',
    block: 'urgent',
    блокер: 'urgent',
    блокеры: 'urgent',
    срочно: 'urgent',
    review: 'review',
    check: 'review',
    проверить: 'review',
    проверка: 'review',
    returned: 'returned',
    return: 'returned',
    исправления: 'returned',
    возврат: 'returned',
    ready: 'ready',
    done: 'ready',
    готово: 'ready',
    выгрузка: 'ready',
  };

  return aliases[value];
}

function mapRiskFilter(value: string): RiskFilter | undefined {
  const aliases: Record<string, RiskFilter> = {
    all: 'all',
    все: 'all',
    blockers: 'blockers',
    blocker: 'blockers',
    block: 'blockers',
    блокеры: 'blockers',
    блокер: 'blockers',
    attention: 'attention',
    warning: 'attention',
    warnings: 'attention',
    сверка: 'attention',
    проверить: 'attention',
    ai: 'ai',
    ии: 'ai',
    ocr: 'ai',
    clean: 'clean',
    clear: 'clean',
    ok: 'clean',
    чистые: 'clean',
    чисто: 'clean',
  };

  return aliases[value];
}

function mapSortMode(value: string): ReviewSortMode | undefined {
  const aliases: Record<string, ReviewSortMode> = {
    priority: 'priority',
    приоритет: 'priority',
    critical: 'priority',
    критичные: 'priority',
    oldest: 'oldest',
    старые: 'oldest',
    ждут: 'oldest',
    time: 'oldest',
    readiness: 'readiness',
    готовность: 'readiness',
    progress: 'readiness',
    низкая: 'readiness',
    agent: 'agent',
    агент: 'agent',
  };

  return aliases[value];
}

function mapTypeFilter(value: string): ReviewTypeFilter | undefined {
  const aliases: Record<string, ReviewTypeFilter> = {
    all: 'all',
    все: 'all',
    family: 'family',
    fam: 'family',
    семья: 'family',
    семейные: 'family',
    single: 'single',
    solo: 'single',
    один: 'single',
    одиночные: 'single',
  };

  return aliases[value];
}

function parseQueueQuery(value: string): ParsedQueueQuery {
  const normalizedValue = normalizeSearch(value);
  const fields: ParsedQueueQuery['fields'] = {};
  let sortMode: ReviewSortMode | undefined;
  let riskFilter: RiskFilter | undefined;
  let typeFilter: ReviewTypeFilter | undefined;
  let laneFilter: LaneFilter | undefined;

  const queryWithoutCommands = normalizedValue.replace(/(?:^|\s)(sort|сорт|risk|риск|type|тип|lane|статус|city|город|country|страна|agent|агент|id|ид):([^\s]+)/g, (fullMatch, rawKey: string, rawValue: string) => {
    const key = normalizeSearch(rawKey);
    const commandValue = normalizeSearch(rawValue);

    if (key === 'sort' || key === 'сорт') sortMode = mapSortMode(commandValue) ?? sortMode;
    if (key === 'risk' || key === 'риск') riskFilter = mapRiskFilter(commandValue) ?? riskFilter;
    if (key === 'type' || key === 'тип') typeFilter = mapTypeFilter(commandValue) ?? typeFilter;
    if (key === 'lane' || key === 'статус') laneFilter = mapLaneFilter(commandValue) ?? laneFilter;
    if (key === 'city' || key === 'город') fields.city = commandValue;
    if (key === 'country' || key === 'страна') fields.country = commandValue;
    if (key === 'agent' || key === 'агент') fields.agent = commandValue;
    if (key === 'id' || key === 'ид') fields.id = commandValue;

    return fullMatch.startsWith(' ') ? ' ' : '';
  });

  const terms = queryWithoutCommands
    .split(/\s+/)
    .filter(Boolean)
    .filter((term) => {
      if (!term.startsWith('#')) return true;

      const tagValue = term.slice(1);
      sortMode = mapSortMode(tagValue) ?? sortMode;
      riskFilter = mapRiskFilter(tagValue) ?? riskFilter;
      typeFilter = mapTypeFilter(tagValue) ?? typeFilter;
      laneFilter = mapLaneFilter(tagValue) ?? laneFilter;

      return false;
    });

  return {
    terms,
    sortMode,
    riskFilter,
    typeFilter,
    laneFilter,
    fields,
  };
}

function matchesRisk(item: ReviewCard, riskFilter: RiskFilter) {
  switch (riskFilter) {
    case 'blockers':
      return item.blockers > 0;
    case 'attention':
      return item.warnings > 0 || item.aiFlags > 0 || item.blockers > 0;
    case 'ai':
      return item.aiFlags > 0;
    case 'clean':
      return item.blockers === 0 && item.warnings === 0 && item.aiFlags === 0;
    default:
      return true;
  }
}

function getSearchableText(item: ReviewCard) {
  return normalizeSearch(
    [
      item.id,
      item.title,
      item.type === 'family' ? 'семья семейные family fam' : 'один одиночные single solo',
      item.country,
      item.city,
      item.agent,
      item.timeInQueue,
      item.nextAction,
      item.lastEvent,
      `${item.applicants} чел`,
      item.lane,
      item.blockers > 0 ? 'блокер блокеры blockers' : 'без блокеров',
      item.warnings > 0 ? 'проверить warning warnings сверка' : 'без предупреждений',
      item.aiFlags > 0 ? 'ai ии ocr' : 'без ai',
    ].join(' '),
  );
}

function matchesSearch(item: ReviewCard, parsedQuery: ParsedQueueQuery) {
  const searchableText = getSearchableText(item);
  const matchesTerms = parsedQuery.terms.every((term) => searchableText.includes(term));

  if (!matchesTerms) return false;
  if (parsedQuery.fields.id && !normalizeSearch(item.id).includes(parsedQuery.fields.id)) return false;
  if (parsedQuery.fields.agent && !normalizeSearch(item.agent).includes(parsedQuery.fields.agent)) return false;
  if (parsedQuery.fields.city && !normalizeSearch(item.city).includes(parsedQuery.fields.city)) return false;
  if (parsedQuery.fields.country && !normalizeSearch(item.country).includes(parsedQuery.fields.country)) return false;

  return true;
}

function compareFallback(left: ReviewCard, right: ReviewCard) {
  return left.title.localeCompare(right.title, 'ru') || left.id.localeCompare(right.id, 'ru');
}

function sortReviews(items: ReviewCard[], sortMode: ReviewSortMode) {
  return [...items].sort((left, right) => {
    switch (sortMode) {
      case 'oldest':
        return getQueueMinutes(right) - getQueueMinutes(left) || reviewRiskScore(right) - reviewRiskScore(left) || compareFallback(left, right);
      case 'readiness':
        return reviewReadiness(left) - reviewReadiness(right) || reviewRiskScore(right) - reviewRiskScore(left) || compareFallback(left, right);
      case 'agent':
        return left.agent.localeCompare(right.agent, 'ru') || reviewRiskScore(right) - reviewRiskScore(left) || compareFallback(left, right);
      case 'priority':
      default:
        return (
          lanePriority[left.lane] - lanePriority[right.lane] ||
          reviewRiskScore(right) - reviewRiskScore(left) ||
          getQueueMinutes(right) - getQueueMinutes(left) ||
          compareFallback(left, right)
        );
    }
  });
}

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

function MetricCard({ icon: Icon, label, value, tone = 'neutral' }: { icon: React.ElementType; label: string; value: string; tone?: string }) {
  return (
    <div className="min-h-[82px] rounded-[8px] border border-[#242529] bg-gradient-to-br from-[#1a1a1d] to-[#141416] p-3">
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] font-medium uppercase tracking-wide text-white/45">{label}</span>
        <Icon className={`h-4 w-4 ${tone === 'green' ? 'text-[#b8baff]' : tone === 'orange' ? 'text-white/62' : tone === 'red' ? 'text-[#d59aa3]' : 'text-white/40'}`} />
      </div>
      <div className="mt-2 text-xl font-semibold text-white">{value}</div>
    </div>
  );
}

function ProgressLine({ label, value }: { label: string; value: number }) {
  const safeValue = clampPercent(value);

  return (
    <div>
      <div className="mb-1 flex justify-between text-[10.5px] text-white/40">
        <span>{label}</span>
        <span>{safeValue}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
        <div className="h-full rounded-full bg-[#8fa3ff]" style={{ width: `${safeValue}%` }} />
      </div>
    </div>
  );
}

function ReviewQueueCard({ item, onOpenDrawer }: { item: ReviewCard; onOpenDrawer: (id: string) => void }) {
  const hasBlocker = item.blockers > 0;

  return (
    <button
      type="button"
      onClick={() => onOpenDrawer(item.id)}
      className={`group w-full rounded-[10px] border p-4 text-left transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_40px_rgba(0,0,0,0.22)] ${hasBlocker ? 'border-[#5b2b32]/45 bg-[#1d1719]/80 hover:border-[#74414a]/55' : 'border-[#242529] bg-[#161617] hover:border-[#6f64ff]/40'}`}
    >
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1.5 flex min-w-0 items-center gap-2 overflow-hidden text-[10.5px] font-medium tracking-wide text-white/40">
            <span className="shrink-0 whitespace-nowrap font-mono text-white/60">{item.id}</span>
            <span className="h-1 w-1 shrink-0 rounded-full bg-white/20" />
            <span className="min-w-0 truncate whitespace-nowrap">{item.city}</span>
            <span className="h-1 w-1 shrink-0 rounded-full bg-white/20" />
            <span className="shrink-0 whitespace-nowrap">{item.timeInQueue}</span>
          </div>
          <h3 className="truncate text-[15px] font-semibold text-white group-hover:text-[#b8baff]">{item.title}</h3>
          <div className="mt-1 flex min-w-0 items-center gap-2 overflow-hidden text-[11.5px] text-white/45">
            {item.type === 'family' ? <Users className="h-3.5 w-3.5 shrink-0" /> : <User className="h-3.5 w-3.5 shrink-0" />}
            <span className="shrink-0 whitespace-nowrap">{item.applicants} чел.</span>
            <span className="shrink-0">·</span>
            <span className="truncate">{item.agent}</span>
          </div>
        </div>
        <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-white/25 transition-transform group-hover:translate-x-0.5 group-hover:text-white/55" />
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
        {item.blockers > 0 && <span className="rounded-full border border-[#5b2b32]/45 bg-[#24191b]/60 px-2 py-1 text-[10.5px] font-medium text-[#d59aa3]">{item.blockers} {russianPlural(item.blockers, 'блокер', 'блокера', 'блокеров')}</span>}
        {item.warnings > 0 && <span className="rounded-full border border-white/10 bg-white/[0.045] px-2 py-1 text-[10.5px] font-medium text-white/62">{item.warnings} проверить</span>}
        {item.aiFlags > 0 && <span className="rounded-full border border-[#6f64ff]/25 bg-[#6f64ff]/15 px-2 py-1 text-[10.5px] font-medium text-[#b8baff]">ИИ {item.aiFlags}</span>}
        {item.blockers === 0 && item.warnings === 0 && <span className="rounded-full border border-white/10 bg-white/[0.045] px-2 py-1 text-[10.5px] font-medium text-[#b8baff]">без замечаний</span>}
      </div>

      <div className="mt-3 border-t border-white/5 pt-3 text-[11px] text-white/35">{item.lastEvent}</div>
    </button>
  );
}

export function ReviewScreen({ onOpenDrawer }: AdminScreenProps) {
  const [queueControls, setQueueControls] = useState<QueueControls>(readStoredQueueControls);
  const [showIntro, setShowIntro] = useState(() => {
    if (typeof window === 'undefined') return true;

    try {
      return window.sessionStorage.getItem(reviewIntroStorageKey) !== 'true';
    } catch {
      return true;
    }
  });
  const searchInputRef = useRef<HTMLInputElement>(null);

  const { activeLane, searchQuery, quickRiskFilter, quickSortMode } = queueControls;
  const parsedQuery = useMemo(() => parseQueueQuery(searchQuery), [searchQuery]);
  const effectiveRiskFilter = parsedQuery.riskFilter ?? quickRiskFilter;
  const effectiveTypeFilter = parsedQuery.typeFilter ?? 'all';
  const effectiveSortMode = parsedQuery.sortMode ?? quickSortMode;
  const effectiveLaneFilter = parsedQuery.laneFilter ?? activeLane;

  const baseFilteredReviews = useMemo(
    () =>
      reviews.filter((item) => {
        if (!matchesSearch(item, parsedQuery)) return false;
        if (effectiveTypeFilter !== 'all' && item.type !== effectiveTypeFilter) return false;
        return matchesRisk(item, effectiveRiskFilter);
      }),
    [effectiveRiskFilter, effectiveTypeFilter, parsedQuery],
  );

  const visibleReviews = useMemo(() => {
    const laneScopedReviews = effectiveLaneFilter === 'all' ? baseFilteredReviews : baseFilteredReviews.filter((item) => item.lane === effectiveLaneFilter);
    return sortReviews(laneScopedReviews, effectiveSortMode);
  }, [baseFilteredReviews, effectiveLaneFilter, effectiveSortMode]);

  const laneCounts = useMemo(
    () =>
      lanes.reduce((acc, lane) => {
        acc[lane.id] = baseFilteredReviews.filter((item) => item.lane === lane.id).length;
        return acc;
      }, {} as Record<Lane, number>),
    [baseFilteredReviews],
  );

  const totalBlockers = visibleReviews.reduce((sum, item) => sum + item.blockers, 0);
  const totalWarnings = visibleReviews.reduce((sum, item) => sum + item.warnings, 0);
  const readyCount = visibleReviews.filter((item) => item.lane === 'ready').length;
  const averageQueue = visibleReviews.length ? Math.round(visibleReviews.reduce((sum, item) => sum + getQueueMinutes(item), 0) / visibleReviews.length) : 0;
  const oldestReview = visibleReviews.length ? [...visibleReviews].sort((left, right) => getQueueMinutes(right) - getQueueMinutes(left))[0] : undefined;
  const watchlist = sortReviews(
    visibleReviews.filter((item) => item.blockers > 0 || item.warnings > 0 || item.aiFlags > 0),
    'priority',
  ).slice(0, 2);
  const laneGridClass = effectiveLaneFilter === 'all' ? 'lg:grid-cols-2 2xl:grid-cols-4' : 'lg:grid-cols-1';

  const setActiveLane = (lane: LaneFilter) => {
    setQueueControls((currentControls) => ({ ...currentControls, activeLane: lane }));
  };

  const setSearchQuery = (value: string) => {
    setQueueControls((currentControls) => ({ ...currentControls, searchQuery: value }));
  };

  const cycleQuickControl = (shiftKey: boolean) => {
    setQueueControls((currentControls) => ({
      ...currentControls,
      quickRiskFilter: shiftKey ? currentControls.quickRiskFilter : getNextValue(riskFilterOrder, currentControls.quickRiskFilter),
      quickSortMode: shiftKey ? getNextValue(sortModeOrder, currentControls.quickSortMode) : currentControls.quickSortMode,
    }));
  };

  const resetQueueControls = () => {
    setQueueControls(defaultQueueControls);
  };

  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      window.sessionStorage.setItem(reviewQueueControlsStorageKey, JSON.stringify(queueControls));
    } catch {
      // Storage is optional; queue logic must stay functional without it.
    }
  }, [queueControls]);

  useEffect(() => {
    if (!showIntro || typeof window === 'undefined') return;

    try {
      window.sessionStorage.setItem(reviewIntroStorageKey, 'true');
    } catch {
      // sessionStorage may be unavailable; intro still closes by timer.
    }

    const timeoutId = window.setTimeout(() => {
      setShowIntro(false);
    }, 5000);

    return () => window.clearTimeout(timeoutId);
  }, [showIntro]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchInputRef.current?.focus();
      }

      if (event.key === 'Escape') {
        setQueueControls(defaultQueueControls);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <MetricCard icon={FileText} label="В очереди" value={`${visibleReviews.length}`} />
          <MetricCard icon={Flame} label="Блокеры" value={`${totalBlockers}`} tone="red" />
          <MetricCard icon={AlertCircle} label="Проверить" value={`${totalWarnings}`} tone="orange" />
          <MetricCard icon={CheckCircle2} label="К выгрузке" value={`${readyCount}`} tone="green" />
        </div>

        <div className="rounded-[10px] border border-[#242529] bg-[#161617]">
          <div className="flex flex-col gap-3 border-b border-[#242529] p-4 lg:flex-row lg:items-center">
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setActiveLane('all')} className={`rounded-[10px] border px-3 py-2 text-[12px] font-medium transition-colors ${activeLane === 'all' ? 'border-[#6f64ff]/40 bg-[#6f64ff]/15 text-[#b8baff]' : 'border-white/10 bg-white/5 text-white/55 hover:text-white'}`}>Все</button>
              {lanes.map((lane) => {
                const Icon = lane.icon;
                const count = laneCounts[lane.id] ?? 0;
                return (
                  <button key={lane.id} type="button" onClick={() => setActiveLane(lane.id)} className={`inline-flex items-center gap-2 rounded-[10px] border px-3 py-2 text-[12px] font-medium transition-colors ${activeLane === lane.id ? toneClasses(lane.tone) : 'border-white/10 bg-white/5 text-white/55 hover:text-white'}`}>
                    <Icon className="h-3.5 w-3.5" /> {lane.title} <span className="text-white/35">{count}</span>
                  </button>
                );
              })}
            </div>
            <div className="flex flex-1 items-center gap-2 lg:ml-auto lg:max-w-[440px]">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/35" />
                <input
                  ref={searchInputRef}
                  value={searchQuery}
                  onChange={(event: React.ChangeEvent<HTMLInputElement>) => setSearchQuery(event.currentTarget.value)}
                  onKeyDown={(event: React.KeyboardEvent<HTMLInputElement>) => {
                    if (event.key === 'Escape') resetQueueControls();
                  }}
                  className="h-10 w-full rounded-[10px] border border-[#242529] bg-[#111113] pl-9 pr-3 text-[13px] text-white placeholder:text-white/30 outline-none focus:border-[#6f64ff]/55"
                  placeholder="Поиск: ID, агент, семья"
                />
              </div>
              <button
                type="button"
                onClick={(event: React.MouseEvent<HTMLButtonElement>) => cycleQuickControl(event.shiftKey || event.altKey)}
                onDoubleClick={resetQueueControls}
                title={`Фильтр: ${riskFilterLabels[effectiveRiskFilter]}; Shift/Alt+click сортировка: ${sortModeLabels[effectiveSortMode]}; double click сброс`}
                aria-label={`Фильтр: ${riskFilterLabels[effectiveRiskFilter]}; сортировка: ${sortModeLabels[effectiveSortMode]}`}
                className="flex h-10 w-10 items-center justify-center rounded-[10px] border border-[#242529] bg-[#111113] text-white/55 hover:bg-white/5 hover:text-white"
              >
                <Filter className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className={`grid grid-cols-1 gap-4 p-4 ${laneGridClass}`}>
            {lanes.map((lane) => {
              const Icon = lane.icon;
              const laneItems = visibleReviews.filter((item) => item.lane === lane.id);
              if (effectiveLaneFilter !== 'all' && effectiveLaneFilter !== lane.id) return null;

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
            {watchlist.length > 0 ? (
              watchlist.map((item) => (
                <div key={item.id} className={item.aiFlags > 0 ? 'rounded-[10px] border border-[#6f64ff]/25 bg-[#6f64ff]/10 p-3' : 'rounded-[10px] border border-white/10 bg-white/[0.045] p-3'}>
                  <div className="text-[12px] font-medium text-white">{item.id} · {item.blockers > 0 ? `${item.blockers} ${russianPlural(item.blockers, 'блокер', 'блокера', 'блокеров')}` : item.aiFlags > 0 ? 'AI-флаг' : 'ручная сверка'}</div>
                  <p className="mt-1 text-[11.5px] leading-relaxed text-white/45">{item.nextAction}</p>
                </div>
              ))
            ) : (
              <div className="rounded-[10px] border border-white/10 bg-white/[0.045] p-3">
                <div className="text-[12px] font-medium text-white">Нет критичных флагов</div>
                <p className="mt-1 text-[11.5px] leading-relaxed text-white/45">В текущей выборке нет AI/OCR-флагов, блокеров или ручной сверки.</p>
              </div>
            )}
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
              <span className="text-[13px] font-semibold text-white">{formatQueueMinutes(averageQueue)}</span>
            </div>
            <div className="flex items-center justify-between rounded-[10px] bg-white/[0.03] p-3">
              <span className="text-[12px] text-white/45">Старейший пакет</span>
              <span className="text-[13px] font-semibold text-white/62">{oldestReview ? formatQueueMinutes(getQueueMinutes(oldestReview)) : '—'}</span>
            </div>
            <div className="flex items-center justify-between rounded-[10px] bg-white/[0.03] p-3">
              <span className="text-[12px] text-white/45">К выгрузке</span>
              <span className="text-[13px] font-semibold text-[#b8baff]">{formatPackageCount(readyCount)}</span>
            </div>
          </div>
        </div>

        <div className="rounded-[10px] border border-[#242529] bg-[#161617] p-5">
          <h3 className="mb-4 text-[15px] font-semibold text-white">Операционные правила</h3>
          <div className="space-y-3 text-[12px] leading-relaxed text-white/45">
            <div className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#b8baff]" /> Не принимать пакет с открытыми blocker-замечаниями.</div>
            <div className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#b8baff]" /> AI-флаг не является решением, только подсказка для проверки.</div>
            <div className="flex gap-2"><CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[#b8baff]" /> После accept пакет попадает в Выгрузку с audit trail.</div>
          </div>
        </div>
      </aside>
    </motion.div>
  );
}
