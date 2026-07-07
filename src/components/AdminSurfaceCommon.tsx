import type { ReactNode } from 'react';
import { Filter, MapPin, Search } from 'lucide-react';
import {
  V19SummaryTile,
  type V19SummaryTileTone,
} from '../shared/ui/v19-design-system';

type AdminSurfaceIcon = React.ElementType;

export function AdminMetricCard({
  active = false,
  detail,
  icon: Icon,
  label,
  onClick,
  tone = 'neutral',
  value,
}: {
  active?: boolean;
  detail?: ReactNode;
  icon: AdminSurfaceIcon;
  label: string;
  onClick?: () => void;
  tone?: string;
  value: ReactNode;
}) {
  const mappedTone: V19SummaryTileTone =
    tone === 'green'
      ? 'green'
      : tone === 'orange'
        ? 'amber'
        : tone === 'red'
          ? 'danger'
          : 'neutral';

  return (
    <V19SummaryTile
      active={active}
      detail={detail}
      icon={Icon}
      label={label}
      tone={mappedTone}
      value={value}
      onClick={onClick}
    />
  );
}

export type AdminToolbarTab<T extends string> = {
  count?: number;
  icon?: AdminSurfaceIcon;
  id: T;
  label: string;
  tone?: string;
};

export function AdminToolbarSelect<T extends string>({
  ariaLabel,
  label,
  onChange,
  options,
  value,
}: {
  ariaLabel?: string;
  label: string;
  onChange: (value: T) => void;
  options: Array<{ label: string; value: T }>;
  value: T;
}) {
  return (
    <label className="flex h-10 shrink-0 items-center gap-2 rounded-[10px] border border-[#242529] bg-[#111113] px-3 text-[11px] font-medium text-white/55 hover:bg-white/5 hover:text-white">
      <span className="hidden text-white/35 sm:inline">{label}</span>
      <select
        aria-label={ariaLabel ?? label}
        className="h-full min-w-[112px] appearance-none bg-transparent text-[11px] font-semibold text-white/72 outline-none"
        value={value}
        onChange={(event) => onChange(event.currentTarget.value as T)}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function AdminQueueToolbar({
  cityFilter,
  cityOptions,
  controls,
  filterLabel = 'Фильтры',
  onCityFilterChange,
  onFilterClick,
  onSearchChange,
  searchPlaceholder,
  searchValue,
}: {
  cityFilter: string;
  cityOptions: string[];
  controls?: ReactNode;
  filterLabel?: string;
  onCityFilterChange: (city: string) => void;
  onFilterClick?: () => void;
  onSearchChange: (value: string) => void;
  searchPlaceholder: string;
  searchValue: string;
}) {
  const cityActive = cityFilter !== 'Все города';

  return (
    <div className="flex flex-col gap-3 border-b border-[#242529] p-4 sm:gap-5 lg:p-5">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:gap-3">
        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/38" />
          <input
            className="h-10 w-full rounded-[10px] border border-[#242529] bg-[#111113] pl-9 pr-3 text-[11px] font-medium text-white/70 placeholder:text-[#525151] outline-none focus:border-[#6f64ff]/55"
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(event) => onSearchChange(event.currentTarget.value)}
          />
        </div>
        {controls ? (
          <div className="v19-admin-toolbar-controls flex min-w-0 flex-wrap items-center gap-2">
            {controls}
          </div>
        ) : null}
        <label
          className={`relative flex h-10 shrink-0 items-center rounded-[10px] border bg-[#111113] text-white/55 hover:bg-white/5 hover:text-white ${
            cityActive ? 'border-[#6f64ff]/55 text-[#dfe4ff]' : 'border-[#242529]'
          }`}
        >
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
