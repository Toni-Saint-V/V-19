import type { ReactNode } from 'react';
import { ChevronDown, Filter, MapPin, Search } from 'lucide-react';
import {
  V19SummaryTile,
  V19TwoRowToolbar,
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
  const selectedOption = options.find((option) => option.value === value);

  return (
    <label className="v19-admin-toolbar-select relative flex h-10 shrink-0 items-center gap-2 rounded-[10px] border border-[#242529] bg-[#111113] px-3 text-[11px] font-medium text-white/55 transition-colors hover:bg-white/5 hover:text-white has-[:focus-visible]:border-[#6f64ff]/55">
      <span className="v19-admin-toolbar-select-label text-white/35">{label}</span>
      <span className="min-w-0 flex-1 truncate font-semibold text-white/72">
        {selectedOption?.label}
      </span>
      <ChevronDown aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-white/35" />
      <select
        aria-label={ariaLabel ?? label}
        className="absolute inset-0 h-full w-full cursor-pointer appearance-none opacity-0 outline-none"
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
    <V19TwoRowToolbar
      className="v19-admin-queue-toolbar border-b border-[#242529] p-4 lg:p-5"
      filters={
        <>
          {controls ? (
            <div className="v19-admin-toolbar-controls">
              {controls}
            </div>
          ) : null}
          <label
            className={`v19-admin-city-filter relative flex h-10 shrink-0 items-center rounded-[10px] border bg-[#111113] text-white/55 hover:bg-white/5 hover:text-white ${
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
        </>
      }
      search={
        <div className="v19-admin-queue-toolbar-search relative min-w-[220px]">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/38" />
          <input
            className="h-10 w-full rounded-[10px] border border-[#242529] bg-[#111113] pl-9 pr-3 text-[11px] font-medium text-white/70 placeholder:text-[#525151] outline-none focus:border-[#6f64ff]/55"
            placeholder={searchPlaceholder}
            value={searchValue}
            onChange={(event) => onSearchChange(event.currentTarget.value)}
          />
        </div>
      }
      action={
        <button
          aria-label={filterLabel}
          title={filterLabel}
          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[10px] border border-[#242529] bg-[#111113] text-white/55 hover:bg-white/5 hover:text-white"
          type="button"
          onClick={onFilterClick}
        >
          <Filter className="h-3.5 w-3.5" />
        </button>
      }
    />
  );
}
