export type SupabaseActivationTarget = "sandbox" | "production";
export type SupabaseBackendTarget = "local-demo" | "supabase";
export type SupabaseRuntimeAdapterState = "not-wired" | "client";

export interface SupabaseActivationConfig {
  projectId?: string;
  url?: string;
  publishableKey?: string;
  edgeFunctionsUrl?: string;
}

export interface SupabaseActivationEvidence {
  target?: SupabaseActivationTarget;
  migrationApproval?: boolean;
  migrationsApplied?: boolean;
  rlsPolicyTestsPassed?: boolean;
  storagePolicyTestsPassed?: boolean;
  edgeFunctionDryRunsPassed?: boolean;
  browserQaPassed?: boolean;
  browserKeyAudited?: boolean;
  productionApproval?: boolean;
}

export type SupabaseActivationCheckId =
  | "project-config"
  | "migration-approval"
  | "migrations-applied"
  | "rls-policy-tests"
  | "storage-policy-tests"
  | "edge-function-dry-runs"
  | "browser-qa"
  | "browser-key-audit"
  | "production-approval";

export interface SupabaseActivationChecklistItem {
  id: SupabaseActivationCheckId;
  label: string;
  requiredFor: SupabaseActivationTarget[];
}

export interface SupabaseActivationReadiness {
  target: SupabaseActivationTarget;
  ready: boolean;
  allowClientActivation: boolean;
  state:
    | "missing-config"
    | "placeholder-config"
    | "contract-only"
    | "sandbox-ready"
    | "production-ready";
  missing: SupabaseActivationChecklistItem[];
  warnings: string[];
  configured: Record<keyof SupabaseActivationConfig, boolean>;
  configValues: Record<
    keyof SupabaseActivationConfig,
    "missing" | "placeholder" | "configured"
  >;
  boundary: string;
}

export interface SupabaseBackendSelectionConfig {
  target?: SupabaseBackendTarget;
  releaseSwitch?: boolean;
  runtimeAdapter?: SupabaseRuntimeAdapterState;
  supabase?: Partial<SupabaseActivationConfig>;
  evidence?: Partial<SupabaseActivationEvidence>;
}

export interface SupabaseBackendSelection {
  target: SupabaseBackendTarget;
  selected: SupabaseBackendTarget;
  releaseSwitch: boolean;
  runtimeAdapter: SupabaseRuntimeAdapterState;
  readiness: SupabaseActivationReadiness;
  blockedReasons: string[];
  boundary: string;
}

export const supabaseActivationChecklist: SupabaseActivationChecklistItem[] = [
  {
    id: "project-config",
    label:
      "Supabase project id, URL, browser-safe publishable key and Edge Functions URL are configured.",
    requiredFor: ["sandbox", "production"],
  },
  {
    id: "migration-approval",
    label:
      "Target owner approved applying the local migration to this Supabase target.",
    requiredFor: ["sandbox", "production"],
  },
  {
    id: "migrations-applied",
    label: "The V-19 foundation migration was applied and recorded on the target.",
    requiredFor: ["sandbox", "production"],
  },
  {
    id: "rls-policy-tests",
    label:
      "RLS policy checks passed for admin, owning agent and cross-agent denial paths.",
    requiredFor: ["sandbox", "production"],
  },
  {
    id: "storage-policy-tests",
    label:
      "Private submission-media storage checks passed for upload, read and denial paths.",
    requiredFor: ["sandbox", "production"],
  },
  {
    id: "edge-function-dry-runs",
    label: "AI helper Edge Function dry-runs passed with user authentication.",
    requiredFor: ["sandbox", "production"],
  },
  {
    id: "browser-qa",
    label:
      "Admin and agent browser QA passed against the Supabase target, including mobile.",
    requiredFor: ["sandbox", "production"],
  },
  {
    id: "browser-key-audit",
    label:
      "Browser-visible environment was audited to contain only public Supabase keys.",
    requiredFor: ["sandbox", "production"],
  },
  {
    id: "production-approval",
    label:
      "Production activation was explicitly approved after current sandbox evidence was reviewed.",
    requiredFor: ["production"],
  },
];

function clean(value: string | undefined) {
  return value?.trim() ?? "";
}

function hasAnyValue(value: string | undefined) {
  return clean(value).length > 0;
}

function hasConfiguredValue(value: string | undefined) {
  const normalized = clean(value);
  return (
    normalized.length > 0 &&
    !/(^|[^a-z0-9])(change_me|todo|placeholder)([^a-z0-9]|$)/i.test(normalized)
  );
}

function configValueState(
  value: string | undefined,
): "missing" | "placeholder" | "configured" {
  if (!hasAnyValue(value)) return "missing";
  return hasConfiguredValue(value) ? "configured" : "placeholder";
}

function normalizeTarget(
  target: SupabaseActivationEvidence["target"],
): SupabaseActivationTarget {
  return target === "production" ? "production" : "sandbox";
}

function configState(
  config: Partial<SupabaseActivationConfig>,
): Record<keyof SupabaseActivationConfig, boolean> {
  return {
    projectId: hasConfiguredValue(config.projectId),
    url: hasConfiguredValue(config.url),
    publishableKey: hasConfiguredValue(config.publishableKey),
    edgeFunctionsUrl: hasConfiguredValue(config.edgeFunctionsUrl),
  };
}

function configValueStates(
  config: Partial<SupabaseActivationConfig>,
): Record<keyof SupabaseActivationConfig, "missing" | "placeholder" | "configured"> {
  return {
    projectId: configValueState(config.projectId),
    url: configValueState(config.url),
    publishableKey: configValueState(config.publishableKey),
    edgeFunctionsUrl: configValueState(config.edgeFunctionsUrl),
  };
}

function isProjectConfigReady(
  configured: Record<keyof SupabaseActivationConfig, boolean>,
) {
  return (
    configured.projectId &&
    configured.url &&
    configured.publishableKey &&
    configured.edgeFunctionsUrl
  );
}

function hasPlaceholderProjectConfig(
  configValues: Record<
    keyof SupabaseActivationConfig,
    "missing" | "placeholder" | "configured"
  >,
) {
  return Object.values(configValues).some((state) => state === "placeholder");
}

function isEvidenceReady(
  id: SupabaseActivationCheckId,
  evidence: Partial<SupabaseActivationEvidence>,
) {
  if (id === "project-config") return true;
  if (id === "migration-approval") return evidence.migrationApproval === true;
  if (id === "migrations-applied") return evidence.migrationsApplied === true;
  if (id === "rls-policy-tests") return evidence.rlsPolicyTestsPassed === true;
  if (id === "storage-policy-tests") {
    return evidence.storagePolicyTestsPassed === true;
  }
  if (id === "edge-function-dry-runs") {
    return evidence.edgeFunctionDryRunsPassed === true;
  }
  if (id === "browser-qa") return evidence.browserQaPassed === true;
  if (id === "browser-key-audit") return evidence.browserKeyAudited === true;
  return evidence.productionApproval === true;
}

export function evaluateSupabaseActivationReadiness(
  config: Partial<SupabaseActivationConfig>,
  evidence: Partial<SupabaseActivationEvidence> = {},
): SupabaseActivationReadiness {
  const target = normalizeTarget(evidence.target);
  const configured = configState(config);
  const configValues = configValueStates(config);
  const projectConfigReady = isProjectConfigReady(configured);
  const missing = supabaseActivationChecklist.filter((item) => {
    if (!item.requiredFor.includes(target)) return false;
    if (item.id === "project-config") return !projectConfigReady;
    return !isEvidenceReady(item.id, evidence);
  });
  const ready = missing.length === 0;
  const state = ready
    ? target === "production"
      ? "production-ready"
      : "sandbox-ready"
    : projectConfigReady
      ? "contract-only"
      : hasPlaceholderProjectConfig(configValues)
        ? "placeholder-config"
        : "missing-config";
  const warnings: string[] = [];

  if (target === "production" && evidence.productionApproval !== true) {
    warnings.push(
      "Production target is selected, but explicit production approval is not present.",
    );
  }

  if (state === "contract-only") {
    warnings.push(
      "Supabase config shape is present, but activation remains blocked until evidence gates pass.",
    );
  }

  if (state === "placeholder-config") {
    warnings.push(
      "Supabase config placeholders are present. Replace placeholder values before live probes or UI activation.",
    );
  }

  return {
    target,
    ready,
    allowClientActivation: ready,
    state,
    missing,
    warnings,
    configured,
    configValues,
    boundary: ready
      ? `Supabase ${target} activation gate passed. Client wiring can run behind the release switch.`
      : "Supabase activation remains fail-closed. Keep the app in local demo mode until every missing gate is closed.",
  };
}

function buildBlockedReasons(
  target: SupabaseBackendTarget,
  releaseSwitch: boolean,
  runtimeAdapter: SupabaseRuntimeAdapterState,
  readiness: SupabaseActivationReadiness,
) {
  if (target === "local-demo") return [];

  const reasons: string[] = [];
  if (!releaseSwitch) reasons.push("release switch is off");
  if (!readiness.ready || !readiness.allowClientActivation) {
    reasons.push("Supabase activation evidence is not complete");
  }
  if (runtimeAdapter !== "client") {
    reasons.push("Supabase client adapter is not enabled");
  }

  return reasons;
}

export function selectSupabaseBackend(
  config: SupabaseBackendSelectionConfig = {},
): SupabaseBackendSelection {
  const target = config.target === "supabase" ? "supabase" : "local-demo";
  const releaseSwitch = config.releaseSwitch === true;
  const runtimeAdapter = config.runtimeAdapter ?? "not-wired";
  const readiness = evaluateSupabaseActivationReadiness(
    config.supabase ?? {},
    config.evidence ?? {},
  );
  const blockedReasons = buildBlockedReasons(
    target,
    releaseSwitch,
    runtimeAdapter,
    readiness,
  );
  const selected =
    target === "supabase" && blockedReasons.length === 0 ? "supabase" : "local-demo";

  return {
    target,
    selected,
    releaseSwitch,
    runtimeAdapter,
    readiness,
    blockedReasons,
    boundary:
      selected === "supabase"
        ? "Supabase backend selected behind readiness evidence and release switch gates."
        : target === "supabase"
          ? `Supabase backend request blocked: ${blockedReasons.join("; ")}. Falling back to local demo.`
          : "Local demo backend selected. Supabase cannot activate without an explicit target and release switch.",
  };
}
