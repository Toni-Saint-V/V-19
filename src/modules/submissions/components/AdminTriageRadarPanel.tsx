import type {
  AdminTriageBand,
  AdminTriageRadar,
} from "../adminTriageRadar";

export type AdminTriageBandFilter = AdminTriageBand | "all";

type RadarCard = {
  band: AdminTriageBandFilter;
  label: string;
  note: string;
  tone: "critical" | "attention" | "ready" | "waiting" | "done" | "all";
  value: number;
};

export function AdminTriageRadarPanel({
  activeBand,
  onBand,
  radar,
}: {
  activeBand: AdminTriageBandFilter;
  onBand: (band: AdminTriageBandFilter) => void;
  radar: AdminTriageRadar;
}) {
  const total = radar.items.length;
  const cards: RadarCard[] = [
    {
      band: "all",
      label: "Все",
      note: "в очереди",
      tone: "all",
      value: total,
    },
    {
      band: "critical",
      label: "Критично",
      note: "сначала",
      tone: "critical",
      value: radar.totals.critical,
    },
    {
      band: "attention",
      label: "Внимание",
      note: "проверить",
      tone: "attention",
      value: radar.totals.attention,
    },
    {
      band: "ready",
      label: "Готово",
      note: "к решению",
      tone: "ready",
      value: radar.totals.ready,
    },
    {
      band: "waiting",
      label: "Ждёт",
      note: "агента/систему",
      tone: "waiting",
      value: radar.totals.waiting,
    },
  ];

  return (
    <section className="v17-admin-ai-radar" aria-label="AI-радар очереди">
      <div className="v17-admin-ai-radar-copy">
        <span>AI-радар</span>
        <strong>Приоритизация по риску</strong>
        <em>{radar.summaries.join(" · ")}</em>
      </div>
      <div className="v17-admin-ai-radar-cards" role="list">
        {cards.map((card) => (
          <button
            aria-pressed={activeBand === card.band}
            className={`v17-admin-ai-radar-card tone-${card.tone} ${
              activeBand === card.band ? "is-active" : ""
            }`}
            key={card.band}
            type="button"
            onClick={() => onBand(card.band)}
          >
            <span>{card.label}</span>
            <strong>{card.value}</strong>
            <small>{card.note}</small>
          </button>
        ))}
      </div>
    </section>
  );
}
