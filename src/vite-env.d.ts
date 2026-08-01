/// <reference types="vite/client" />

export {};

declare global {
  const __V19_LOCAL_DEMO_BUILD__: boolean;

  interface ImportMetaEnv {
    readonly VITE_SUPABASE_BACKEND_TARGET?: string;
    readonly VITE_SUPABASE_SANDBOX_PROBE_ENABLED?: string;
    readonly VITE_SUPABASE_RELEASE_ENABLED?: string;
    readonly VITE_SUPABASE_PROJECT_ID?: string;
    readonly VITE_SUPABASE_URL?: string;
    readonly VITE_SUPABASE_PUBLISHABLE_KEY?: string;
    readonly VITE_SUPABASE_ANON_KEY?: string;
    readonly VITE_SUPABASE_EDGE_FUNCTIONS_URL?: string;
    readonly VITE_SUPABASE_ACTIVATION_TARGET?: string;
    readonly VITE_SUPABASE_CUTOVER_GENERATION?: string;
    readonly VITE_SUPABASE_TRANSACTIONAL_PERSISTENCE_TESTED?: string;
    readonly VITE_SUPABASE_MIGRATION_APPROVED?: string;
    readonly VITE_SUPABASE_MIGRATIONS_APPLIED?: string;
    readonly VITE_SUPABASE_RLS_POLICY_TESTS_PASSED?: string;
    readonly VITE_SUPABASE_STORAGE_POLICY_TESTS_PASSED?: string;
    readonly VITE_SUPABASE_EDGE_FUNCTION_DRY_RUNS_PASSED?: string;
    readonly VITE_SUPABASE_BROWSER_QA_PASSED?: string;
    readonly VITE_SUPABASE_BROWSER_KEY_AUDITED?: string;
    readonly VITE_SUPABASE_PRODUCTION_APPROVED?: string;
    readonly VITE_E2E_PASSPORT_MOCK_ENABLED?: string;
    readonly VITE_E2E_LOCAL_DEMO_AUTH_BYPASS?: string;
    readonly VITE_LOCAL_DEMO_AUTH_BYPASS?: string;
  }

  interface ImportMeta {
    readonly env: ImportMetaEnv;
  }
}


declare module '*.css';
