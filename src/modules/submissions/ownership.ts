import type { AgentOwnerId, Submission } from "./types";

declare const __V19_LOCAL_DEMO_BUILD__: boolean;

// Vite replaces this build-time flag in the browser bundle. The guarded
// fallback keeps Node-based test discovery fail-closed when it loads this
// shared module without Vite's `define` transform.
const localDemoBuildEnabled =
  typeof __V19_LOCAL_DEMO_BUILD__ !== "undefined" && __V19_LOCAL_DEMO_BUILD__;

// These IDs must stay aligned with the approved local-demo accounts in
// shared/authRegistration: otherwise the role filter correctly hides every
// seeded submission from the agent who is meant to exercise the fixture flow.
export const defaultLocalAgentOwnerId: AgentOwnerId = localDemoBuildEnabled
  ? "local-agent-tony"
  : "unassigned-agent";
export const alternateLocalAgentOwnerId: AgentOwnerId = localDemoBuildEnabled
  ? "local-agent-alex"
  : "unassigned-agent-secondary";

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
