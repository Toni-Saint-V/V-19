/// <reference types="vite/client" />

export {};

declare global {
  interface ImportMetaEnv {
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

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}
