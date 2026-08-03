import type { LucideIcon } from "lucide-react";

type OperationalMetricTone = "muted" | "neutral" | "primary" | "danger";

const iconToneClass: Record<OperationalMetricTone, string> = {
  muted: "text-white/45",
  neutral: "text-white/55",
  primary: "text-[#b8baff]",
  danger: "text-[#d59aa3]",
};

export function OperationalMetricCard({
  detail,
  icon: Icon,
  label,
  tone = "neutral",
  value,
}: {
  detail?: string;
  icon: LucideIcon;
  label: string;
  tone?: OperationalMetricTone;
  value: number | string;
}) {
  return (
    <div className="h-[60px] rounded-[8px] border border-[var(--v19-depth-border)] bg-gradient-to-br from-[var(--v19-depth-panel-strong)] to-[var(--v19-depth-panel)] px-3 py-1.5 shadow-sm sm:h-auto sm:min-h-[116px] sm:rounded-2xl sm:p-4">
      <div className="flex items-center justify-between">
        <span className="hidden text-[11px] font-medium uppercase tracking-wide text-white/50 sm:block">
          {label}
        </span>
        <Icon className={`h-3.5 w-3.5 sm:h-4 sm:w-4 ${iconToneClass[tone]}`} />
      </div>
      <div className="ml-1 mt-3 text-[24px] font-medium leading-none text-white sm:ml-0 sm:mt-5 sm:text-2xl sm:font-semibold">
        {value}
      </div>
      {detail ? (
        <div className="mt-1 hidden text-[11px] text-white/40 sm:block">{detail}</div>
      ) : null}
    </div>
  );
}
