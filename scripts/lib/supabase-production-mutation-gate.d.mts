export interface ProductionMutationIdentity {
  readonly gitHead: string;
  readonly migrationContractSha: string;
  readonly sourceSha256: string;
}

export function assertProductionMutationAllowed(options: {
  action: "migration-apply" | "function-deploy" | "pilot-provision" | "workflow-smoke";
  expectedOwnerPublicKeySha256?: string;
  now?: number;
  repoRoot: string;
  readinessPath?: string;
}): ProductionMutationIdentity;

export function productionApprovalPacketPath(repoRoot: string): string;

export function verifyDetachedOwnerApproval(options: {
  action?: string;
  approval: {
    receiptPath?: string;
    receiptSha256?: string;
    signaturePath?: string;
    publicKeyPath?: string;
  };
  expectedPublicKeySha256?: string;
  evidenceRootSha256: string;
  gitHead: string;
  issues: string[];
  now?: number;
  repoRoot: string;
  sourceSha256: string;
}): void;
