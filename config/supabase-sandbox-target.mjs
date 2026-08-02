export const SUPABASE_SANDBOX_TARGET = Object.freeze({
  schemaVersion: 1,
  projectId: "",
  projectUrl: "",
  generation: "unassigned",
});

export function isCanonicalSupabaseSandboxTarget(projectId, projectUrl) {
  return (
    Boolean(SUPABASE_SANDBOX_TARGET.projectId) &&
    projectId === SUPABASE_SANDBOX_TARGET.projectId &&
    projectUrl === SUPABASE_SANDBOX_TARGET.projectUrl
  );
}
