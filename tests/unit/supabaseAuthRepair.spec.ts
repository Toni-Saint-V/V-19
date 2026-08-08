import { describe, expect, test } from "vitest";
import {
  defaultAuthRepairPlan,
  generatedAuthRepairPassword,
  mergeAuthRepairMetadata,
  normalizeAuthRepairUsers,
  passwordForAuthRepairUser,
  projectRefFromSupabaseUrl,
  validateAuthRepairPlan,
} from "../../scripts/lib/supabase-auth-repair.mjs";

const projectRef = "abcdefghijklmnopqrst";
const projectUrl = `https://${projectRef}.supabase.co`;

describe("Supabase auth repair contract", () => {
  test("derives and validates an exact Supabase project target", () => {
    expect(projectRefFromSupabaseUrl(projectUrl)).toBe(projectRef);
    expect(projectRefFromSupabaseUrl("https://example.com")).toBe("");
    expect(projectRefFromSupabaseUrl(`${projectUrl}/rest/v1`)).toBe("");
    expect(projectRefFromSupabaseUrl(projectUrl.replace("https:", "http:"))).toBe(
      "",
    );

    const config = {
      ...defaultAuthRepairPlan({
        expectedProjectRef: projectRef,
        expectedProjectUrl: projectUrl,
      }),
      users: [
        {
          key: "agent-account",
          email: "AGENT@example.com",
          role: "agent",
          passwordMode: "generate",
        },
      ],
    };
    const result = validateAuthRepairPlan({
      config,
      projectRef,
      projectUrl,
      requireAdminKey: true,
      requirePublishableKey: true,
      adminKey: "server-admin-key",
      publishableKey: "browser-publishable-key",
    });

    expect(result.failures).toEqual([]);
    expect(result.users).toEqual([
      expect.objectContaining({
        email: "agent@example.com",
        role: "agent",
      }),
    ]);

    const sameKeyResult = validateAuthRepairPlan({
      config,
      projectRef,
      projectUrl,
      requireAdminKey: true,
      requirePublishableKey: true,
      adminKey: "same-key",
      publishableKey: "same-key",
    });
    expect(sameKeyResult.failures).toContain(
      "admin API key and publishable key must differ",
    );
  });

  test("fails closed for target drift, duplicate emails, and invalid roles", () => {
    const config = {
      schemaVersion: 1,
      expectedProjectRef: "another-project",
      expectedProjectUrl: projectUrl,
      users: [
        { key: "duplicate", email: "same@example.com", role: "agent" },
        { key: "duplicate", email: "SAME@example.com", role: "owner" },
        { key: "invalid-email", email: "not-an-email", role: "agent" },
      ],
    };
    const result = validateAuthRepairPlan({
      config,
      projectRef,
      projectUrl,
      requireAdminKey: true,
      requirePublishableKey: true,
      adminKey: "",
      publishableKey: "",
    });

    expect(result.failures).toEqual(
      expect.arrayContaining([
        "target project ref differs from the repair plan",
        "admin API key is missing",
        "publishable key is missing",
        "every repair user must have a valid email",
        "repair user emails must be unique",
        "repair user keys must be unique",
        "every repair user role must be agent or admin",
      ]),
    );
  });

  test("preserves metadata while clearing the password setup gate", () => {
    expect(
      mergeAuthRepairMetadata(
        {
          display_name: "Old Name",
          password_setup_required: true,
          tenant: "pilot",
        },
        "New Name",
      ),
    ).toEqual({
      display_name: "New Name",
      password_setup_required: false,
      tenant: "pilot",
    });
  });

  test("generates strong passwords and supports explicit environment passwords", () => {
    const generated = generatedAuthRepairPassword();
    expect(generated.length).toBeGreaterThanOrEqual(36);
    expect(generated).toMatch(/[A-Z]/);
    expect(generated).toMatch(/[a-z]/);
    expect(generated).toMatch(/[0-9]/);
    expect(generated).toContain("!");

    const [environmentUser] = normalizeAuthRepairUsers([
      {
        email: "admin@example.com",
        role: "admin",
        passwordMode: "environment",
        passwordEnv: "V19_NEW_ADMIN_PASSWORD",
      },
    ]);
    expect(
      passwordForAuthRepairUser(environmentUser, {
        V19_NEW_ADMIN_PASSWORD: "correct-horse-battery-staple",
      }),
    ).toBe("correct-horse-battery-staple");
    expect(() =>
      passwordForAuthRepairUser(environmentUser, {
        V19_NEW_ADMIN_PASSWORD: "short",
      }),
    ).toThrow("at least 12 characters");
  });
});
