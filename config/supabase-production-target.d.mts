export interface SupabaseProductionTargetDescriptor {
  readonly schemaVersion: number;
  readonly projectId: string;
  readonly projectUrl: string;
  readonly cutoverGeneration: string;
  readonly baselineGitSha: string;
  readonly evidenceNotBefore: string;
}

export const SUPABASE_PRODUCTION_TARGET_DESCRIPTOR_PATH: string;
export const SUPABASE_PRODUCTION_TARGET: Readonly<SupabaseProductionTargetDescriptor>;
