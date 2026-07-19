import { useState } from "react";
import { ChevronDown, MapPin } from "lucide-react";

import { agentOwnerDisplayName } from "../ownership";
import type { AgentOwnerId } from "../types";

export type AgentFilterValue = AgentOwnerId | "Все агенты";
export type CityFilterValue = string | "Все города";

export function CityFilterMenu({
  onChange,
  options,
  value,
}: {
  onChange: (city: CityFilterValue) => void;
  options: CityFilterValue[];
  value: CityFilterValue;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={`topbar-filter v19-city-filter ${open ? "is-open" : ""}`}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) {
          setOpen(false);
        }
      }}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          setOpen(false);
          event.currentTarget
            .querySelector<HTMLButtonElement>(".v19-city-filter-trigger")
            ?.focus();
        }
      }}
    >
      <button
        className="v19-city-filter-trigger"
        type="button"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Фильтр по городу: ${value}`}
        onClick={() => setOpen((current) => !current)}
      >
        <span className="v19-city-filter-pin" aria-hidden="true">
          <MapPin focusable="false" />
        </span>
        <span className="v19-city-filter-value v19-city-filter-value-full">
          {value === "Все города" ? "Все города" : value}
        </span>
        <span className="v19-city-filter-value v19-city-filter-value-compact" aria-hidden="true">
          {value === "Все города" ? "Все" : value}
        </span>
        <ChevronDown className="v19-city-filter-chevron" aria-hidden="true" />
      </button>
      {open ? (
        <div className="v19-city-filter-menu" role="listbox" aria-label="Город">
          {options.map((city) => {
            const selected = city === value;

            return (
              <button
                className={`v19-city-filter-option ${selected ? "is-selected" : ""}`}
                type="button"
                key={city}
                role="option"
                aria-selected={selected}
                onClick={() => {
                  onChange(city);
                  setOpen(false);
                }}
              >
                <span className="v19-city-filter-dot" aria-hidden="true" />
                <span>{city === "Все города" ? "Все города" : city}</span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}

export function AgentFilterMenu({
  onChange,
  options,
  value,
}: {
  onChange: (agentId: AgentFilterValue) => void;
  options: AgentFilterValue[];
  value: AgentFilterValue;
}) {
  return (
    <label className="topbar-filter v19-agent-filter">
      <span className="sr-only">Фильтр по агенту</span>
      <select
        aria-label="Фильтр по агенту"
        className="v19-agent-filter-select"
        value={value}
        onChange={(event) => onChange(event.target.value as AgentFilterValue)}
      >
        {options.map((agentId) => (
          <option key={agentId} value={agentId}>
            {agentId === "Все агенты" ? "Все агенты" : agentOwnerDisplayName(agentId)}
          </option>
        ))}
      </select>
    </label>
  );
}
