import type { Role } from "../types/domain";

type LocalDemoAuthEnv = {
  readonly VITE_E2E_LOCAL_DEMO_AUTH_BYPASS?: string;
  readonly VITE_LOCAL_DEMO_AUTH_BYPASS?: string;
};

export type LocalDemoSessionLike = {
  role: Role;
} | null;

function enabled(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(value?.trim().toLowerCase() ?? "");
}

export function isExplicitLocalDemoAuthBypassEnabled(
  env: LocalDemoAuthEnv,
): boolean {
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
    !isSupabaseMode &&
    Boolean(session) &&
    isExplicitLocalDemoAuthBypassEnabled(env)
  );
}
