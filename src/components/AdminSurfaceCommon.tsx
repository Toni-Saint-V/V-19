import type { ReactNode } from 'react';
import { Filter, MapPin, Search } from 'lucide-react';

type AdminSurfaceIcon = React.ElementType;

export function AdminMetricCard({
  detail,
  icon: Icon,
  label,
  tone = 'neutral',
  value,
}: {
  detail?: ReactNode;
  icon: AdminSurfaceIcon;
  label: string;
  tone?: string;
  value: ReactNode;
}) {
  return (
    <div className="h-[90px] rounded-[8px] border border-[#242529] bg-gradient-to-br from-[#1a1a1d] to-[#141416] p-3">
      <div className="flex items-center justify-end sm:justify-between">
        <span className="hidden text-[11px] font-medium uppercase tracking-wide text-white/45 sm:block">
          {label}
        </span>
        <Icon
          className={`h-4 w-4 ${
            tone === 'green'
              ? 'text-[#b8baff]'
              : tone === 'orange'
                ? 'text-white/62'
                : tone === 'red'
                  ? 'text-[#d59aa3]'
                  : 'text-white/40'
          }`}
        />
      </div>
      <div className="mt-[30px] text-[22px] font-semibold leading-none text-white">
        {value}
      </div>
      {detail ? <div className="mt-1 text-[10px] font-medium text-white/38">{detail}</div> : null}
    </div>
  );
}

export type AdminToolbarTab<T extends string> = {
  count?: number;
  icon?: AdminSurfaceIcon;
  id: T;
  label: string;
  tone?: string;
};

export function AdminQueueToolbar<T extends string>({
  activeTab,
  cityFilter,
  cityOptions,
  filterLabel = 'Фильтры',
  onCityFilterChange,
  onFilterClick,
  onSearchChange,
  onTabChange,
  searchPlaceholder,
  searchValue,
  tabs,
}: {
  activeTab: T;
  cityFilter: string;
  cityOptions: string[];
  filterLabel?: string;
  onCityFilterChange: (city: string) => void;
  onFilterClick?: () => void;
  onSearchChange: (value: string) => void;
  onTabChange: (tab: T) => void;
  searchPlaceholder: string;
  searchValue: string;
  tabs: AdminToolbarTab<T>[];
}) {
  return (
    <div className="flex flex-col gap-5 border-b border-[#242529] p-4 lg:p-5">
      <div className="flex flex-wrap items-center gap-3">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`inline-flex h-8 items-center gap-2 rounded-[10px] border px-3 text-[10px] font-medium transition-colors ${
                active
                  ? tab.tone
                    ? tab.tone
                    : 'border-[#6f64ff]/60 bg-[#6f64ff]/18 text-[#c9c6ff]'
                  : 'border-white/10 bg-white/[0.045] text-white/55 hover:text-white'
              }`}
              type="button"
            >
              {Icon ? <Icon className="h-3.5 w-3.5" /> : null}
              {tab.label}
              {typeof tab.count === 'number' ? <span className="text-white/35">{tab.count}</span> : null}
            </button>
          );
        })}
      </div>

      <div className="flex items-center gap-2 lg:gap-3">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/38" />
          <input
            className="h-10 w-full rounded-[10px] border border-[#242529] bg-[#111113] pl-9 pr-3 text-[11px] font-medium text-white/70 placeholder:text-[#525151] outline-none focus:border-[#6f64ff]/55"
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(event) => onSearchChange(event.currentTarget.value)}
          />
        </div>
        <label className="relative flex h-10 shrink-0 items-center rounded-[10px] border border-[#242529] bg-[#111113] text-white/55 hover:bg-white/5 hover:text-white">
          <MapPin className="pointer-events-none absolute left-3 h-3.5 w-3.5" />
          <span className="sr-only">Фильтр городов</span>
          <select
            aria-label="Фильтр городов"
            className="h-full appearance-none rounded-[10px] bg-transparent pl-8 pr-7 text-[11px] font-medium outline-none"
            value={cityFilter}
            onChange={(event) => onCityFilterChange(event.currentTarget.value)}
          >
            {cityOptions.map((city) => (
              <option key={city} value={city}>
                {city}
              </option>
            ))}
          </select>
        </label>
        <button
          aria-label={filterLabel}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-[#242529] bg-[#111113] text-white/55 hover:bg-white/5 hover:text-white"
          type="button"
          onClick={onFilterClick}
        >
          <Filter className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}
