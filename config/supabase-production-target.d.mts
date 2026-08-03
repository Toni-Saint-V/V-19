export interface SupabaseProductionTargetDescriptor {
  readonly schemaVersion: number;
  readonly projectId: string;
  readonly projectUrl: string;
  readonly canonicalApplicationHost: string;
  readonly cutoverGeneration: string;
  readonly baselineGitSha: string;
  readonly evidenceNotBefore: string;
  readonly maxEvidenceAgeMs: number;
  readonly ownerApprovalPublicKeySha256: string;
  readonly requiredCleanDataState: Readonly<{
    authUserCount: number;
    confirmedAuthUserCount: number;
    profileCount: number;
    adminProfileCount: number;
    agentProfileCount: number;
    orphanAuthUsersWithoutProfileCount: number;
    orphanProfilesWithoutAuthCount: number;
  }>;
  readonly requiredEdgeFunctions: readonly string[];
  readonly requiredEdgeFunctionCapabilities: Readonly<Record<string, string>>;
  readonly requiredEdgeFunctionSemanticActions: Readonly<Record<string, string>>;
  readonly requiredEdgeFunctionSecretNames: readonly string[];
  readonly requiredEmptyPublicTables: readonly string[];
  readonly requiredStorageBuckets: readonly string[];
  readonly requiredAdminOnlyProductionEvidence: readonly string[];
  readonly requiredAdminOnlyEvidenceArtifacts: Readonly<
    Record<
      string,
      Readonly<{
        scope: string;
        checks: readonly string[];
      }>
    >
  >;
}

export const SUPABASE_PRODUCTION_TARGET_DESCRIPTOR_PATH: string;
export const SUPABASE_PRODUCTION_TARGET: Readonly<SupabaseProductionTargetDescriptor>;
