import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test } from "vitest";

const repairScript = readFileSync(
  resolve(process.cwd(), "scripts/repair-supabase-auth-users.mjs"),
  "utf8",
);

describe("Supabase auth repair script safety contract", () => {
  test("rejects unknown CLI arguments and unsafe force usage", () => {
    expect(repairScript).toContain("Unknown argument(s)");
    expect(repairScript).toContain(
      'fail("--force is allowed only with --write-template.")',
    );
  });

  test("loads the Supabase client only after offline validation", () => {
    expect(repairScript).not.toContain(
      'import { createClient } from "@supabase/supabase-js"',
    );
    expect(repairScript).toContain(
      'await import("@supabase/supabase-js")',
    );
  });

  test("escrows generated credentials before the first Auth mutation", () => {
    const receiptWrite = repairScript.indexOf(
      "writePrivateJson(resultPath, receipt);",
    );
    const authMutation = repairScript.indexOf(
      "await writeAuthUser(admin, item, result.password)",
    );

    expect(receiptWrite).toBeGreaterThan(-1);
    expect(authMutation).toBeGreaterThan(receiptWrite);
    expect(repairScript).toContain('status: "prepared"');
    expect(repairScript).toContain('receipt.status = "partial_failure"');
    expect(repairScript).toContain('receipt.users[activeIndex].status = "failed"');
  });

  test("keeps the credential receipt private and out of terminal output", () => {
    expect(repairScript).toContain("{ mode: 0o600 }");
    expect(repairScript).toContain("chmodSync(path, 0o600)");
    expect(repairScript).toContain(
      'console.log("Passwords were not printed to the terminal.")',
    );
    expect(repairScript).not.toContain("console.log(result.password)");
  });
});
