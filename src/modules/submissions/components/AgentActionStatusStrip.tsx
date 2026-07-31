import {
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Clock3,
  ListChecks,
  type LucideIcon,
} from "lucide-react";

import { V19MetricCard, V19MetricStrip } from "../../../shared/ui/v19-design-system";
import { agentInteractionProps } from "../agentInteractionContract";

export type AgentActionFilter = "blockers" | "completed" | "open" | "today" | "week";

export type AgentActionFilterCounts = Record<AgentActionFilter, number>;

type AgentActionFilterOption = {
  filter: AgentActionFilter;
  icon: LucideIcon;
  label: string;
  tone?: "green" | "red";
};

const actionFilterOptions: AgentActionFilterOption[] = [
  {
    filter: "open",
    icon: ListChecks,
    label: "Открыто",
  },
  {
    filter: "blockers",
    icon: CircleAlert,
    label: "Правки",
    tone: "red",
  },
  {
    filter: "today",
    icon: Clock3,
    label: "Сегодня",
  },
  {
    filter: "week",
    icon: CalendarDays,
    label: "Неделя",
  },
  {
    filter: "completed",
    icon: CheckCircle2,
    label: "Закрыто",
    tone: "green",
  },
];

export function AgentActionStatusStrip({
  counts,
  value,
  onChange,
}: {
  counts: AgentActionFilterCounts;
  value: AgentActionFilter;
  onChange: (filter: AgentActionFilter) => void;
}) {
  return (
    <V19MetricStrip
      ariaLabel="Фильтр очереди действий"
      className="v19-agent-action-metrics"
    >
      {actionFilterOptions.map((option) => (
        <V19MetricCard
          active={option.filter === value}
          ariaLabel={`${option.label}: ${counts[option.filter]}`}
          icon={option.icon}
          interactionId={
            agentInteractionProps("actions.summary-filter")["data-v19-interaction-id"]
          }
          key={option.filter}
          label={option.label}
          metricId={option.filter}
          tone={option.tone}
          value={counts[option.filter]}
          onClick={() => onChange(option.filter)}
        />
      ))}
    </V19MetricStrip>
  );
}
