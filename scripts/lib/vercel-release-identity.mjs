export function isVercelReleaseIdentityMatch({
  aliases,
  canonicalHost,
  deployment,
  expectedGitSha,
  expectedSourceSha256,
  identity,
}) {
  return Boolean(
    /^dpl_[A-Za-z0-9]+$/.test(deployment?.id ?? "") &&
    deployment?.target === "production" &&
    deployment?.readyState === "READY" &&
    aliases.includes(canonicalHost) &&
    identity?.schemaVersion === 2 &&
    identity?.mode === "supabase-production" &&
    identity?.gitSha === expectedGitSha &&
    identity?.sourceSha256 === expectedSourceSha256 &&
    identity?.dirty === false,
  );
}
