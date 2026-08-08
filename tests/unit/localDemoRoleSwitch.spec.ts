import { beforeEach, describe, expect, test } from "vitest";

import {
  localDevAuthRegistrationAdapter,
  resetLocalDevAuthRegistrationForTests,
} from "../../src/shared/authRegistration";

describe("local demo role switch", () => {
  beforeEach(() => {
    resetLocalDevAuthRegistrationForTests();
  });

  test("activates only seeded approved users and persists each selected role", async () => {
    const adminSession =
      await localDevAuthRegistrationAdapter.activateApprovedRole("admin");

    expect(adminSession).toMatchObject({
      approvalStatus: "approved",
      role: "admin",
      status: "active",
    });
    await expect(
      localDevAuthRegistrationAdapter.restoreSession(),
    ).resolves.toMatchObject({
      role: "admin",
    });

    const agentSession =
      await localDevAuthRegistrationAdapter.activateApprovedRole("agent");

    expect(agentSession).toMatchObject({
      approvalStatus: "approved",
      role: "agent",
      status: "active",
    });
    await expect(
      localDevAuthRegistrationAdapter.restoreSession(),
    ).resolves.toMatchObject({
      role: "agent",
    });
  });
});
