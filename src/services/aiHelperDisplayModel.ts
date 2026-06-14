import type { AiHelperResult } from "./aiHelperService";

export type AiHelperDisplaySectionId =
  | "suggestions"
  | "blockers"
  | "operator_summary"
  | "agent_follow_up"
  | "guardrails";

export interface AiHelperDisplaySection {
  id: AiHelperDisplaySectionId;
  title: string;
  items: string[];
}

export interface AiHelperDisplayModel {
  intent: AiHelperResult["intent"];
  title: string;
  summary: string;
  source: AiHelperResult["source"];
  sections: AiHelperDisplaySection[];
}

function section(
  id: AiHelperDisplaySectionId,
  title: string,
  items: string[],
): AiHelperDisplaySection | null {
  const cleanItems = items.map((item) => item.trim()).filter(Boolean);
  return cleanItems.length ? { id, title, items: cleanItems } : null;
}

export function buildAiHelperDisplayModel(
  result: AiHelperResult,
): AiHelperDisplayModel {
  const sections = [
    section("blockers", "Блокеры", result.blockers),
    section("operator_summary", "Фокус оператора", result.operatorSummary ?? []),
    section("suggestions", "Следующие действия", result.suggestions),
    section("agent_follow_up", "Черновики агенту", result.agentFollowUpDrafts ?? []),
    section("guardrails", "Границы подсказки", result.guardrails),
  ].filter((item): item is AiHelperDisplaySection => Boolean(item));

  return {
    intent: result.intent,
    title: result.title,
    summary: result.summary,
    source: result.source,
    sections,
  };
}
