export function agentDisplayName(agentId?: string) {
  if (!agentId) return "Агент не указан";
  return readableAgentFallback(agentId);
}

export function agentAgencyLabel(agentId?: string) {
  if (!agentId) return "Агентство не указано";
  return "Агент Supabase";
}

export function agentInitials(agentId?: string) {
  if (!agentId) return "АГ";
  return readableAgentFallback(agentId)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function readableAgentFallback(agentId: string) {
  return agentId
    .replace(/^agent-/, "")
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b\p{L}/gu, (char) => char.toUpperCase());
}
