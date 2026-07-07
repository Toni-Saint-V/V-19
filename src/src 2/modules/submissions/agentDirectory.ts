import type { AgentOwnerId } from "./types";

type LocalAgentProfile = {
  agency: string;
  fullName: string;
  id: AgentOwnerId;
  initials: string;
};

const localAgentProfiles: Record<AgentOwnerId, LocalAgentProfile> = {
  "local-agent-alex": {
    agency: "Visa Center Moscow",
    fullName: "Алексей Сидоров",
    id: "local-agent-alex",
    initials: "АС",
  },
  "local-agent-tony": {
    agency: "Visa Center Spb",
    fullName: "Татьяна Николаева",
    id: "local-agent-tony",
    initials: "ТН",
  },
};

export function agentDisplayName(agentId?: string) {
  if (!agentId) return "Агент не указан";
  return localAgentProfiles[agentId]?.fullName ?? readableAgentFallback(agentId);
}

export function agentAgencyLabel(agentId?: string) {
  if (!agentId) return "Агентство не указано";
  return localAgentProfiles[agentId]?.agency ?? "Внешний агент";
}

export function agentInitials(agentId?: string) {
  if (!agentId) return "АГ";
  const profile = localAgentProfiles[agentId];
  if (profile) return profile.initials;

  return readableAgentFallback(agentId)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function readableAgentFallback(agentId: string) {
  return agentId
    .replace(/^local-agent-/, "")
    .replace(/^agent-/, "")
    .replace(/[-_]+/g, " ")
    .trim()
    .replace(/\b\p{L}/gu, (char) => char.toUpperCase());
}
