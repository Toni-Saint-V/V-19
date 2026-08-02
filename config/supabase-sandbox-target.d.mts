export interface SupabaseSandboxTargetDescriptor {
  readonly schemaVersion: number;
  readonly projectId: string;
  readonly projectUrl: string;
  readonly generation: string;
}

export const SUPABASE_SANDBOX_TARGET: Readonly<SupabaseSandboxTargetDescriptor>;

export function isCanonicalSupabaseSandboxTarget(
  projectId: string | undefined,
  projectUrl: string | undefined,
): boolean;
