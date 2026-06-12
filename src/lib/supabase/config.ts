export interface SupabaseRuntimeConfig {
  url: string;
  publishableKey: string;
  configured: boolean;
  mode: "supabase" | "local-demo";
  missing: string[];
}

function clean(value: string | undefined): string {
  return value?.trim() ?? "";
}

export function getSupabaseRuntimeConfig(): SupabaseRuntimeConfig {
  const url = clean(import.meta.env.VITE_SUPABASE_URL);
  const publishableKey = clean(
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
      import.meta.env.VITE_SUPABASE_ANON_KEY,
  );
  const missing = [
    url ? "" : "VITE_SUPABASE_URL",
    publishableKey ? "" : "VITE_SUPABASE_PUBLISHABLE_KEY",
  ].filter(Boolean);
  const configured = missing.length === 0;

  return {
    url,
    publishableKey,
    configured,
    mode: configured ? "supabase" : "local-demo",
    missing,
  };
}

export const supabaseRuntimeConfig = getSupabaseRuntimeConfig();
