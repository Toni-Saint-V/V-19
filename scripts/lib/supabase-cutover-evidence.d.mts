export interface SupabaseCutoverPhaseContract {
  readonly status: "NO_GO" | "GO";
  readonly decision: "NO_GO" | "GO";
  readonly evidenceComplete: boolean;
  readonly approvalsRequired: boolean;
}

export const SUPABASE_CUTOVER_PHASE_CONTRACTS: Readonly<
  Record<string, Readonly<SupabaseCutoverPhaseContract>>
>;

export function cutoverPhaseContract(
  phase: string,
): Readonly<SupabaseCutoverPhaseContract> | null;

export function sha256Evidence(content: string | Uint8Array): string;
export function cutoverEvidenceRootSha256(packet: Record<string, unknown>): string;

export function validateExternalApprovalPacketBinding(options: {
  approvalPacket: Record<string, unknown>;
  trackedContent: string;
  trackedPacket: Record<string, unknown>;
}): string[];

export function validateBoundEvidence(options: {
  content: string;
  expectedCheckedAt: string;
  expectedGeneration: string;
  expectedProjectRef: string;
  expectedScope: string;
  expectedSha256: string;
  expectedGitHead: string;
  expectedSourceSha256: string;
  evidenceNotBefore: string;
  maxAgeMs: number;
  now?: number;
}): {
  document: Record<string, unknown> | null;
  issues: string[];
  sha256: string;
};
