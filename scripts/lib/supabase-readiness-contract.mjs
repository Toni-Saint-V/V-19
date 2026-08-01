const forbiddenProductionReadinessPatterns = Object.freeze([
  /SUPABASE_SMOKE_[A-Z_]*PASSWORD/i,
  /SUPABASE_SERVICE_ROLE/i,
  /SUPABASE_FUNCTION_ADMIN_KEY/i,
  /OPENAI_API_KEY/i,
  /ANTHROPIC_API_KEY/i,
  /MODEL_PROVIDER_API_KEY/i,
  /sb_secret_/i,
  /sk-[A-Za-z0-9_-]{12,}/,
]);

export function forbiddenProductionReadinessMarkers(content) {
  return forbiddenProductionReadinessPatterns
    .filter((pattern) => pattern.test(content))
    .map((pattern) => pattern.source);
}
