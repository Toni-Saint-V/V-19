/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_PROJECT_ID?: string;
  readonly VITE_SUPABASE_URL?: string;
  readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
  readonly VITE_SUPABASE_ANON_KEY?: string;
  readonly VITE_SUPABASE_EDGE_FUNCTIONS_URL?: string;
  readonly VITE_SUPABASE_BACKEND_TARGET?: "local-demo" | "supabase";
  readonly VITE_SUPABASE_RELEASE_SWITCH?: string;
  readonly VITE_SUPABASE_ACTIVATION_TARGET?: "sandbox" | "production";
  readonly VITE_SUPABASE_MIGRATION_APPROVAL?: string;
  readonly VITE_SUPABASE_MIGRATIONS_APPLIED?: string;
  readonly VITE_SUPABASE_RLS_POLICY_TESTS_PASSED?: string;
  readonly VITE_SUPABASE_STORAGE_POLICY_TESTS_PASSED?: string;
  readonly VITE_SUPABASE_EDGE_FUNCTION_DRY_RUNS_PASSED?: string;
  readonly VITE_SUPABASE_BROWSER_QA_PASSED?: string;
  readonly VITE_SUPABASE_BROWSER_KEY_AUDITED?: string;
  readonly VITE_SUPABASE_PRODUCTION_APPROVAL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
