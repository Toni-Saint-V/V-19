import type { Role } from "../types/domain";

type LocalDemoAuthEnv = {
  readonly MODE?: string;
  readonly PROD?: boolean;
  readonly VITE_E2E_LOCAL_DEMO_AUTH_BYPASS?: string;
  readonly VITE_LOCAL_DEMO_AUTH_BYPASS?: string;
  readonly VITE_SUPABASE_ACTIVATION_TARGET?: string;
  readonly VITE_SUPABASE_BACKEND_TARGET?: string;
};

export type LocalDemoSessionLike = {
  role: Role;
} | null;

function clean(value: string | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function enabled(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(clean(value));
}

export function isLocalDemoAuthBypassRuntimeSafe(env: LocalDemoAuthEnv): boolean {
  return (
    env.PROD !== true &&
    clean(env.MODE) !== "production" &&
    clean(env.VITE_SUPABASE_BACKEND_TARGET) !== "supabase" &&
    clean(env.VITE_SUPABASE_ACTIVATION_TARGET) !== "production"
  );
}

export function isExplicitLocalDemoAuthBypassEnabled(env: LocalDemoAuthEnv): boolean {
  if (!isLocalDemoAuthBypassRuntimeSafe(env)) return false;
  return (
    enabled(env.VITE_LOCAL_DEMO_AUTH_BYPASS) ||
    enabled(env.VITE_E2E_LOCAL_DEMO_AUTH_BYPASS)
  );
}

export function canUseLocalDemoSeedAutoLogin(env: LocalDemoAuthEnv): boolean {
  return isExplicitLocalDemoAuthBypassEnabled(env);
}

export function canShowLocalDemoRoleSwitch({
  env,
  isSupabaseMode,
  session,
}: {
  env: LocalDemoAuthEnv;
  isSupabaseMode: boolean;
  session: LocalDemoSessionLike;
}): boolean {
  return (
    !isSupabaseMode && Boolean(session) && isExplicitLocalDemoAuthBypassEnabled(env)
  );
}
