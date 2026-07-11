import type { AgentOwnerId, Submission } from "./types";

export const defaultLocalAgentOwnerId: AgentOwnerId = "unassigned-agent";
export const alternateLocalAgentOwnerId: AgentOwnerId = "unassigned-agent-secondary";

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
  return override?.trim() || agentId;
}
