import type { AgentOwnerId, Submission } from "./types";

export const defaultLocalAgentOwnerId: AgentOwnerId = "local-agent-tony";
export const alternateLocalAgentOwnerId: AgentOwnerId = "local-agent-alex";

const localAgentOwnerNames = new Map<AgentOwnerId, string>([
  [defaultLocalAgentOwnerId, "Татьяна Николаева"],
  [alternateLocalAgentOwnerId, "Алексей Морозов"],
  ["agent-1", "Ирина Агентова"],
  ["local-agent-partner", "Ольга Морозова"],
]);

export function ensureSubmissionOwner(
  submission: Submission,
  fallbackAgentId: AgentOwnerId,
): Submission {
  const agentId = (submission as { agentId?: AgentOwnerId }).agentId;
  return agentId ? submission : { ...submission, agentId: fallbackAgentId };
}

export function assignSubmissionOwner(
  submission: Submission,
  agentId: AgentOwnerId,
): Submission {
  return submission.agentId === agentId ? submission : { ...submission, agentId };
}

export function submissionBelongsToAgent(
  submission: Submission,
  agentId: AgentOwnerId,
) {
  return submission.agentId === agentId;
}

export function agentOwnerDisplayName(
  agentId: AgentOwnerId,
  override?: string,
): string {
  return override?.trim() || localAgentOwnerNames.get(agentId) || agentId;
}
