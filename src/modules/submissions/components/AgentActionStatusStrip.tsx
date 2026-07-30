import {
  CalendarDays,
  CheckCircle2,
  ChevronDown,
  CircleAlert,
  Clock3,
  ListChecks,
  MoreHorizontal,
  type LucideIcon,
} from "lucide-react";

import { cn } from "../../../shared/ui/cn";
import { AccessibleSelectMenu } from "../../../shared/ui/AccessibleSelectMenu";
import { agentInteractionProps } from "../agentInteractionContract";

export type AgentActionFilter = "blockers" | "completed" | "open" | "today" | "week";

export type AgentActionFilterCounts = Record<AgentActionFilter, number>;

type AgentActionFilterOption = {
  filter: AgentActionFilter;
  icon: LucideIcon;
  label: string;
  mobilePrimary: boolean;
};

const actionFilterOptions: AgentActionFilterOption[] = [
  {
    filter: "open",
    icon: ListChecks,
    label: "Открыто",
    mobilePrimary: true,
  },
  {
    filter: "blockers",
    icon: CircleAlert,
    label: "Правки",
    mobilePrimary: true,
  },
  {
    filter: "today",
    icon: Clock3,
    label: "Сегодня",
    mobilePrimary: true,
  },
  {
    filter: "week",
    icon: CalendarDays,
    label: "Неделя",
    mobilePrimary: false,
  },
  {
    filter: "completed",
    icon: CheckCircle2,
    label: "Закрыто",
    mobilePrimary: false,
  },
];

const extraFilterOptions = actionFilterOptions.filter(
  (option) => !option.mobilePrimary,
);

function isExtraFilter(value: string): value is "completed" | "week" {
  return value === "completed" || value === "week";
}

export function AgentActionStatusStrip({
  counts,
  value,
  onChange,
}: {
  counts: AgentActionFilterCounts;
  value: AgentActionFilter;
  onChange: (filter: AgentActionFilter) => void;
}) {
  const extraFilter = extraFilterOptions.find((option) => option.filter === value);
  const extraValue = extraFilter?.filter ?? "";

  return (
    <section
      className="v19-agent-action-status-strip"
      aria-label="Фильтр очереди действий"
    >
      <div className="v19-agent-action-status-buttons" role="group">
        {actionFilterOptions.map((option) => {
          const Icon = option.icon;
          const active = option.filter === value;

          return (
            <button
              {...agentInteractionProps("actions.summary-filter")}
              aria-label={`${option.label}: ${counts[option.filter]}`}
              aria-pressed={active}
              className={cn(
                "v19-agent-action-status-button",
                `tone-${option.filter}`,
                !option.mobilePrimary && "is-mobile-secondary",
                active && "is-active",
              )}
              data-action-filter={option.filter}
              key={option.filter}
              type="button"
              onClick={() => onChange(option.filter)}
            >
              <Icon aria-hidden="true" />
              <span>{option.label}</span>
              <strong>{counts[option.filter]}</strong>
            </button>
          );
        })}
      </div>

      <div className={cn("v19-agent-action-status-more", extraFilter && "is-active")}>
        <MoreHorizontal aria-hidden="true" />
        <span>{extraFilter?.label ?? "Ещё"}</span>
        <AccessibleSelectMenu
          ariaLabel="Дополнительный фильтр действий"
          className="v19-agent-action-status-more-menu"
          options={extraFilterOptions.map((option) => ({
            description: `Задач: ${counts[option.filter]}`,
            label: option.label,
            tone: option.filter === "week" ? "warning" : "default",
            value: option.filter,
          }))}
          placeholder="Ещё"
          value={extraValue}
          triggerProps={{
            ...agentInteractionProps("actions.summary-filter"),
            className: "v19-agent-action-status-more-trigger",
          }}
          onValueChange={(nextValue) => {
            if (isExtraFilter(nextValue)) onChange(nextValue);
          }}
        />
        <strong>{extraFilter ? counts[extraFilter.filter] : null}</strong>
        <ChevronDown aria-hidden="true" />
      </div>
    </section>
  );
}
