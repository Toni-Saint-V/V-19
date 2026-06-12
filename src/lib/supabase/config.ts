import {
  evaluateSupabaseActivationReadiness,
  type SupabaseActivationEvidence,
  type SupabaseActivationReadiness,
  type SupabaseActivationTarget,
  type SupabaseBackendTarget,
} from "./activation";

export interface SupabaseRuntimeConfig {
  projectId: string;
  url: string;
  publishableKey: string;
  edgeFunctionsUrl: string;
  configured: boolean;
  target: SupabaseBackendTarget;
  selected: SupabaseBackendTarget;
  mode: SupabaseBackendTarget;
  releaseEnabled: boolean;
  activation: SupabaseActivationReadiness;
  evidence: SupabaseActivationEvidence;
  missing: string[];
  blockedReasons: string[];
}

interface VisaFlowEnv {
  readonly VITE_SUPABASE_BACKEND_TARGET?: string;
  readonly VITE_SUPABASE_RELEASE_ENABLED?: string;
  readonly VITE_SUPABASE_PROJECT_ID?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SUPABASE_EDGE_FUNCTIONS_URL?: string;
  readonly VITE_SUPABASE_ACTIVATION_TARGET?: string;
  readonly VITE_SUPABASE_TRANSACTIONAL_PERSISTENCE_TESTED?: string;
  readonly VITE_SUPABASE_MIGRATION_APPROVED?: string;
  readonly VITE_SUPABASE_MIGRATIONS_APPLIED?: string;
  readonly VITE_SUPABASE_RLS_POLICY_TESTS_PASSED?: string;
  readonly VITE_SUPABASE_STORAGE_POLICY_TESTS_PASSED?: string;
  readonly VITE_SUPABASE_EDGE_FUNCTION_DRY_RUNS_PASSED?: string;
  readonly VITE_SUPABASE_BROWSER_QA_PASSED?: string;
  readonly VITE_SUPABASE_BROWSER_KEY_AUDITED?: string;
  readonly VITE_SUPABASE_PRODUCTION_APPROVED?: string;
}

interface VisaFlowImportMeta {
  env: VisaFlowEnv;
}

function clean(value: string | undefined): string {
  return value?.trim() ?? "";
}

function enabled(value: string | undefined): boolean {
  return ["1", "true", "yes", "on"].includes(clean(value).toLowerCase());
}

function backendTarget(value: string | undefined): SupabaseBackendTarget {
  return clean(value) === "supabase" ? "supabase" : "local-demo";
}

function activationTarget(value: string | undefined): SupabaseActivationTarget {
  return clean(value) === "production" ? "production" : "sandbox";
}

function validActivationTarget(value: string | undefined): boolean {
  const target = clean(value);
  return target === "sandbox" || target === "production";
}

export function getSupabaseRuntimeConfig(): SupabaseRuntimeConfig {
  const env = (import.meta as unknown as VisaFlowImportMeta).env;
  const projectId = clean(env.VITE_SUPABASE_PROJECT_ID);
  const url = clean(env.VITE_SUPABASE_URL);
  const publishableKey = clean(
    env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.VITE_SUPABASE_ANON_KEY,
  );
  const edgeFunctionsUrl = clean(env.VITE_SUPABASE_EDGE_FUNCTIONS_URL);
  const target = backendTarget(env.VITE_SUPABASE_BACKEND_TARGET);
  const activationTargetRaw = env.VITE_SUPABASE_ACTIVATION_TARGET;
  const releaseEnabled = enabled(env.VITE_SUPABASE_RELEASE_ENABLED);
  const evidence: SupabaseActivationEvidence = {
    target: activationTarget(activationTargetRaw),
    activationTargetDeclared: validActivationTarget(activationTargetRaw),
    transactionalPersistenceTested: enabled(
      env.VITE_SUPABASE_TRANSACTIONAL_PERSISTENCE_TESTED,
    ),
    migrationApproved: enabled(env.VITE_SUPABASE_MIGRATION_APPROVED),
    migrationsApplied: enabled(env.VITE_SUPABASE_MIGRATIONS_APPLIED),
    rlsPolicyTestsPassed: enabled(env.VITE_SUPABASE_RLS_POLICY_TESTS_PASSED),
    storagePolicyTestsPassed: enabled(env.VITE_SUPABASE_STORAGE_POLICY_TESTS_PASSED),
    edgeFunctionDryRunsPassed: enabled(env.VITE_SUPABASE_EDGE_FUNCTION_DRY_RUNS_PASSED),
    browserQaPassed: enabled(env.VITE_SUPABASE_BROWSER_QA_PASSED),
    browserKeyAudited: enabled(env.VITE_SUPABASE_BROWSER_KEY_AUDITED),
    productionApproved: enabled(env.VITE_SUPABASE_PRODUCTION_APPROVED),
  };
  const activation = evaluateSupabaseActivationReadiness({
    target,
    releaseEnabled,
    config: {
      projectId,
      url,
      publishableKey,
      edgeFunctionsUrl,
    },
    evidence,
  });
  const missing = [
    projectId ? "" : "VITE_SUPABASE_PROJECT_ID",
    url ? "" : "VITE_SUPABASE_URL",
    publishableKey ? "" : "VITE_SUPABASE_PUBLISHABLE_KEY",
    edgeFunctionsUrl ? "" : "VITE_SUPABASE_EDGE_FUNCTIONS_URL",
  ].filter(Boolean);
  const configured =
    activation.configured.projectId &&
    activation.configured.url &&
    activation.configured.publishableKey &&
    activation.configured.edgeFunctionsUrl;
  const selected: SupabaseBackendTarget =
    target === "supabase" && activation.allowClientActivation
      ? "supabase"
      : "local-demo";

  return {
    projectId,
    url,
    publishableKey,
    edgeFunctionsUrl,
    configured,
    target,
    selected,
    mode: selected,
    releaseEnabled,
    activation,
    evidence,
    missing,
    blockedReasons: activation.blockedReasons,
  };
}

export const supabaseRuntimeConfig = getSupabaseRuntimeConfig();
