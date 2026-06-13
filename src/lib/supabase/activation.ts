export type SupabaseBackendTarget = "local-demo" | "supabase";
export type SupabaseActivationTarget = "sandbox" | "production";

export interface SupabaseActivationConfig {
  projectId: string;
  url: string;
  publishableKey: string;
  edgeFunctionsUrl: string;
}

export interface SupabaseActivationEvidence {
  target: SupabaseActivationTarget;
  activationTargetDeclared?: boolean;
  transactionalPersistenceTested?: boolean;
  migrationApproved: boolean;
  migrationsApplied: boolean;
  rlsPolicyTestsPassed: boolean;
  storagePolicyTestsPassed: boolean;
  edgeFunctionDryRunsPassed: boolean;
  browserQaPassed: boolean;
  browserKeyAudited: boolean;
  productionApproved: boolean;
}

export type SupabaseActivationCheckId =
  | "project-config"
  | "activation-target"
  | "transactional-persistence"
  | "release-switch"
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
  allowSandboxProbe: boolean;
  state:
    | "local-demo"
    | "missing-config"
    | "placeholder-config"
    | "contract-only"
    | "sandbox-ready"
    | "production-ready";
  missing: SupabaseActivationChecklistItem[];
  warnings: string[];
  blockedReasons: string[];
  configured: Record<keyof SupabaseActivationConfig, boolean>;
  configValues: Record<
    keyof SupabaseActivationConfig,
    "missing" | "placeholder" | "configured"
  >;
  boundary: string;
}

export const supabaseActivationChecklist: SupabaseActivationChecklistItem[] = [
  {
    id: "project-config",
    label:
      "Supabase project id, URL, browser-safe publishable key, and Edge Functions URL are configured.",
    requiredFor: ["sandbox", "production"],
  },
  {
    id: "activation-target",
    label:
      "Supabase activation target is explicitly declared as sandbox or production.",
    requiredFor: ["sandbox", "production"],
  },
  {
    id: "transactional-persistence",
    label:
      "Transactional persistence was implemented and dry-run tested for questionnaire and media rows.",
    requiredFor: ["sandbox", "production"],
  },
  {
    id: "release-switch",
    label: "Supabase release switch is explicitly enabled for this target.",
    requiredFor: ["sandbox", "production"],
  },
  {
    id: "migration-approval",
    label: "Target owner approved applying the local migration contract.",
    requiredFor: ["sandbox", "production"],
  },
  {
    id: "migrations-applied",
    label: "Database migrations were applied and recorded on the target.",
    requiredFor: ["sandbox", "production"],
  },
  {
    id: "rls-policy-tests",
    label: "RLS tests passed for admin, own-agent, and cross-agent denial flows.",
    requiredFor: ["sandbox", "production"],
  },
  {
    id: "storage-policy-tests",
    label: "Private Storage upload/read/replace policy tests passed.",
    requiredFor: ["sandbox", "production"],
  },
  {
    id: "edge-function-dry-runs",
    label: "Edge Function dry-runs passed with user JWTs.",
    requiredFor: ["sandbox", "production"],
  },
  {
    id: "browser-qa",
    label: "Agent and operations browser QA passed against this Supabase target.",
    requiredFor: ["sandbox", "production"],
  },
  {
    id: "browser-key-audit",
    label: "Browser key audit confirmed only public Supabase keys are exposed.",
    requiredFor: ["sandbox", "production"],
  },
  {
    id: "production-approval",
    label: "Production activation was explicitly approved after sandbox evidence.",
    requiredFor: ["production"],
  },
];

const placeholderPattern = /(^|[^a-z0-9])(change_me|todo|placeholder)([^a-z0-9]|$)/i;

function hasAnyValue(value: string): boolean {
  return value.trim().length > 0;
}

function hasRealValue(value: string): boolean {
  return hasAnyValue(value) && !placeholderPattern.test(value);
}

function configValueState(value: string): "missing" | "placeholder" | "configured" {
  if (!hasAnyValue(value)) return "missing";
  return hasRealValue(value) ? "configured" : "placeholder";
}

function configuredState(
  config: SupabaseActivationConfig,
): Record<keyof SupabaseActivationConfig, boolean> {
  return {
    projectId: hasRealValue(config.projectId),
    url: hasRealValue(config.url),
    publishableKey: hasRealValue(config.publishableKey),
    edgeFunctionsUrl: hasRealValue(config.edgeFunctionsUrl),
  };
}

function configValueStates(
  config: SupabaseActivationConfig,
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
): boolean {
  return (
    configured.projectId &&
    configured.url &&
    configured.publishableKey &&
    configured.edgeFunctionsUrl
  );
}

function hasPlaceholderConfig(
  values: Record<
    keyof SupabaseActivationConfig,
    "missing" | "placeholder" | "configured"
  >,
): boolean {
  return Object.values(values).some((value) => value === "placeholder");
}

function evidenceReady(
  id: SupabaseActivationCheckId,
  evidence: SupabaseActivationEvidence,
  releaseEnabled: boolean,
): boolean {
  if (id === "project-config") return true;
  if (id === "activation-target") return evidence.activationTargetDeclared === true;
  if (id === "transactional-persistence") {
    return evidence.transactionalPersistenceTested === true;
  }
  if (id === "release-switch") return releaseEnabled;
  if (id === "migration-approval") return evidence.migrationApproved;
  if (id === "migrations-applied") return evidence.migrationsApplied;
  if (id === "rls-policy-tests") return evidence.rlsPolicyTestsPassed;
  if (id === "storage-policy-tests") return evidence.storagePolicyTestsPassed;
  if (id === "edge-function-dry-runs") return evidence.edgeFunctionDryRunsPassed;
  if (id === "browser-qa") return evidence.browserQaPassed;
  if (id === "browser-key-audit") return evidence.browserKeyAudited;
  return evidence.productionApproved;
}

export function evaluateSupabaseActivationReadiness(input: {
  target: SupabaseBackendTarget;
  releaseEnabled: boolean;
  sandboxProbeEnabled?: boolean;
  config: SupabaseActivationConfig;
  evidence: SupabaseActivationEvidence;
}): SupabaseActivationReadiness {
  const configured = configuredState(input.config);
  const configValues = configValueStates(input.config);

  if (input.target === "local-demo") {
    return {
      target: input.evidence.target,
      ready: false,
      allowClientActivation: false,
      allowSandboxProbe: false,
      state: "local-demo",
      missing: [],
      warnings: [],
      blockedReasons: [],
      configured,
      configValues,
      boundary:
        "Local demo selected. Supabase Auth, database, and Storage remain inactive.",
    };
  }

  const missing = supabaseActivationChecklist.filter((item) => {
    if (!item.requiredFor.includes(input.evidence.target)) return false;
    if (item.id === "project-config") return !isProjectConfigReady(configured);
    return !evidenceReady(item.id, input.evidence, input.releaseEnabled);
  });
  const ready = missing.length === 0;
  const projectConfigReady = isProjectConfigReady(configured);
  const allowSandboxProbe =
    input.sandboxProbeEnabled === true &&
    input.target === "supabase" &&
    input.evidence.target === "sandbox" &&
    input.evidence.activationTargetDeclared === true &&
    projectConfigReady;
  const state = ready
    ? input.evidence.target === "production"
      ? "production-ready"
      : "sandbox-ready"
    : projectConfigReady
      ? "contract-only"
      : hasPlaceholderConfig(configValues)
        ? "placeholder-config"
        : "missing-config";
  const warnings: string[] = [];

  if (input.evidence.target === "production" && !input.evidence.productionApproved) {
    warnings.push("Production target selected without explicit production approval.");
  }

  if (state === "contract-only") {
    warnings.push(
      "Supabase config is present, but activation remains blocked until evidence gates pass.",
    );
  }

  if (allowSandboxProbe && !ready) {
    warnings.push(
      "Supabase sandbox probe is enabled for Auth, database, and Storage smoke only. Activation evidence remains incomplete.",
    );
  }

  if (state === "placeholder-config") {
    warnings.push(
      "Supabase config contains placeholder values. Replace them before live probes.",
    );
  }

  const blockedReasons = missing.map((item) => item.label);

  return {
    target: input.evidence.target,
    ready,
    allowClientActivation: ready,
    allowSandboxProbe,
    state,
    missing,
    warnings,
    blockedReasons,
    configured,
    configValues,
    boundary: ready
      ? `Supabase ${input.evidence.target} activation gate passed behind the release switch.`
      : "Supabase activation is fail-closed. Do not use Auth, database, or Storage until every missing gate is closed.",
  };
}
