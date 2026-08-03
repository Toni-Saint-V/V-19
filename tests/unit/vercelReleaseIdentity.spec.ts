import { describe, expect, test } from "vitest";

import { SUPABASE_PRODUCTION_TARGET } from "../../config/supabase-production-target.mjs";

import { isVercelReleaseIdentityMatch } from "../../scripts/lib/vercel-release-identity.mjs";

const canonicalHost = SUPABASE_PRODUCTION_TARGET.canonicalApplicationHost;
const expectedGitSha = "a".repeat(40);
const expectedSourceSha256 = "b".repeat(64);
const deployment = {
  id: "dpl_Identity123",
  readyState: "READY",
  target: "production",
};

function matches(dirty: boolean) {
  return isVercelReleaseIdentityMatch({
    aliases: [canonicalHost],
    canonicalHost,
    deployment,
    expectedGitSha,
    expectedSourceSha256,
    identity: {
      dirty,
      gitSha: expectedGitSha,
      mode: "supabase-production",
      schemaVersion: 1,
      sourceSha256: expectedSourceSha256,
    },
  });
}

describe("Vercel release identity", () => {
  test("accepts an exact clean production identity", () => {
    expect(matches(false)).toBe(true);
  });

  test("rejects dirty:true even when every source identity field matches", () => {
    expect(matches(true)).toBe(false);
  });
});
