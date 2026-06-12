import {
  evaluateSupabaseActivationReadiness,
  selectSupabaseBackend,
  type SupabaseActivationEvidence,
  type SupabaseActivationReadiness,
  type SupabaseBackendTarget,
  type SupabaseBackendSelection,
} from "./activation";

export interface SupabaseRuntimeConfig {
  projectId: string;
  url: string;
  publishableKey: string;
  edgeFunctionsUrl: string;
  configured: boolean;
  mode: "supabase" | "local-demo";
  missing: string[];
  releaseSwitch: boolean;
  allowClientActivation: boolean;
  activation: SupabaseActivationReadiness;
  backendSelection: SupabaseBackendSelection;
}

function clean(value: string | undefined): string {
  return value?.trim() ?? "";
}

function enabled(value: string | undefined): boolean {
  return /^(1|true|yes|on)$/i.test(clean(value));
}

function backendTarget(value: string | undefined): SupabaseBackendTarget {
  return value === "supabase" ? "supabase" : "local-demo";
}

function activationEvidence(
  target: SupabaseActivationEvidence["target"],
): SupabaseActivationEvidence {
  return {
    target,
    migrationApproval: enabled(import.meta.env.VITE_SUPABASE_MIGRATION_APPROVAL),
    migrationsApplied: enabled(import.meta.env.VITE_SUPABASE_MIGRATIONS_APPLIED),
    rlsPolicyTestsPassed: enabled(
      import.meta.env.VITE_SUPABASE_RLS_POLICY_TESTS_PASSED,
    ),
    storagePolicyTestsPassed: enabled(
      import.meta.env.VITE_SUPABASE_STORAGE_POLICY_TESTS_PASSED,
    ),
    edgeFunctionDryRunsPassed: enabled(
      import.meta.env.VITE_SUPABASE_EDGE_FUNCTION_DRY_RUNS_PASSED,
    ),
    browserQaPassed: enabled(import.meta.env.VITE_SUPABASE_BROWSER_QA_PASSED),
    browserKeyAudited: enabled(import.meta.env.VITE_SUPABASE_BROWSER_KEY_AUDITED),
    productionApproval: enabled(import.meta.env.VITE_SUPABASE_PRODUCTION_APPROVAL),
  };
}

export function getSupabaseRuntimeConfig(): SupabaseRuntimeConfig {
  const projectId = clean(import.meta.env.VITE_SUPABASE_PROJECT_ID);
  const url = clean(import.meta.env.VITE_SUPABASE_URL);
  const publishableKey = clean(
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
      import.meta.env.VITE_SUPABASE_ANON_KEY,
  );
  const edgeFunctionsUrl = clean(import.meta.env.VITE_SUPABASE_EDGE_FUNCTIONS_URL);
  const releaseSwitch = enabled(import.meta.env.VITE_SUPABASE_RELEASE_SWITCH);
  const target =
    import.meta.env.VITE_SUPABASE_ACTIVATION_TARGET === "production"
      ? "production"
      : "sandbox";
  const supabase = {
    projectId,
    url,
    publishableKey,
    edgeFunctionsUrl,
  };
  const evidence = activationEvidence(target);
  const activation = evaluateSupabaseActivationReadiness(supabase, evidence);
  const backendSelection = selectSupabaseBackend({
    target: backendTarget(import.meta.env.VITE_SUPABASE_BACKEND_TARGET),
    releaseSwitch,
    runtimeAdapter: "client",
    supabase,
    evidence,
  });
  const missing = [
    projectId ? "" : "VITE_SUPABASE_PROJECT_ID",
    url ? "" : "VITE_SUPABASE_URL",
    publishableKey ? "" : "VITE_SUPABASE_PUBLISHABLE_KEY",
    edgeFunctionsUrl ? "" : "VITE_SUPABASE_EDGE_FUNCTIONS_URL",
  ].filter(Boolean);
  const configured = activation.configured.url && activation.configured.publishableKey;

  return {
    projectId,
    url,
    publishableKey,
    edgeFunctionsUrl,
    configured,
    mode: backendSelection.selected,
    missing,
    releaseSwitch,
    allowClientActivation: backendSelection.selected === "supabase",
    activation,
    backendSelection,
  };
}

export const supabaseRuntimeConfig = getSupabaseRuntimeConfig();
