import { describe, expect, test } from "vitest";
import {
  canShowLocalDemoRoleSwitch,
  canUseLocalDemoSeedAutoLogin,
  isExplicitLocalDemoAuthBypassEnabled,
} from "../../src/services/pilotAccessGate";

describe("pilot access gate policy", () => {
  test("keeps fresh pilot sessions behind the access gate by default", () => {
    expect(canUseLocalDemoSeedAutoLogin({})).toBe(false);
    expect(isExplicitLocalDemoAuthBypassEnabled({})).toBe(false);
  });

  test("allows local demo seed auto-login only through explicit local or e2e mode", () => {
    expect(
      canUseLocalDemoSeedAutoLogin({
        VITE_LOCAL_DEMO_AUTH_BYPASS: "true",
      }),
    ).toBe(true);
    expect(
      canUseLocalDemoSeedAutoLogin({
        VITE_E2E_LOCAL_DEMO_AUTH_BYPASS: "true",
      }),
    ).toBe(true);
  });

  test("hides the role switch outside explicit local or e2e demo mode", () => {
    expect(
      canShowLocalDemoRoleSwitch({
        env: {},
        isSupabaseMode: false,
        session: { role: "agent" },
      }),
    ).toBe(false);
    expect(
      canShowLocalDemoRoleSwitch({
        env: { VITE_LOCAL_DEMO_AUTH_BYPASS: "true" },
        isSupabaseMode: false,
        session: { role: "agent" },
      }),
    ).toBe(true);
  });

  test("never shows the local role switch in Supabase mode", () => {
    expect(
      canShowLocalDemoRoleSwitch({
        env: { VITE_E2E_LOCAL_DEMO_AUTH_BYPASS: "true" },
        isSupabaseMode: true,
        session: { role: "admin" },
      }),
    ).toBe(false);
  });
});
