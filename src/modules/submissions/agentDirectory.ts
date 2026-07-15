declare const __V19_LOCAL_DEMO_BUILD__: boolean;

const localDemoBuildEnabled =
  typeof __V19_LOCAL_DEMO_BUILD__ !== "undefined" && __V19_LOCAL_DEMO_BUILD__;

export function agentDisplayName(agentId?: string) {
  if (!agentId) return "Агент не указан";
  if (localDemoBuildEnabled && agentId === "local-agent-tony") return "Агент Тони";
  return readableAgentFallback(agentId);
}

export function agentAgencyLabel(agentId?: string) {
  if (!agentId) return "Агентство не указано";
  return "Команда VisaFlow";
}

export function agentInitials(agentId?: string) {
  if (!agentId) return "АГ";
  return agentDisplayName(agentId)
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
