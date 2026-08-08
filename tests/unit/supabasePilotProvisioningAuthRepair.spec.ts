import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const provisioningScript = readFileSync(
  resolve(process.cwd(), "scripts/provision-supabase-pilot-cohort.mjs"),
  "utf8",
);

describe("pilot provisioning auth repair contract", () => {
  test("rotates existing passwords only through an explicit verified mode", () => {
    expect(provisioningScript).toContain("--rotate-existing-passwords");
    expect(provisioningScript).toContain(
      'fail("--rotate-existing-passwords requires --verify-sign-in.")',
    );
    expect(provisioningScript).toContain(
      "admin.auth.admin.updateUserById(existing.id",
    );
    expect(provisioningScript).toContain("mergeAuthRepairMetadata(");
  });

  test("verifies the new password and revokes stale sessions", () => {
    expect(provisioningScript).toContain("auth.signInWithPassword");
    expect(provisioningScript).toContain('signOut({ scope: "others" })');
    expect(provisioningScript).toContain('signOut({ scope: "local" })');
    expect(provisioningScript).toContain(
      "data.user.user_metadata?.password_setup_required === true",
    );
    expect(provisioningScript).toContain(
      "rerun with --rotate-existing-passwords",
    );
    expect(provisioningScript).not.toContain("await publicClient.auth.signOut();");
  });
});
