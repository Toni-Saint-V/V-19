import { describe, expect, test, vi } from "vitest";
import {
  findAuthUserByEmail,
  resolveAccessRequestUserId,
  type AccessRequestAuthAdmin,
} from "../../supabase/functions/_shared/accessRequestProvisioning";

function authAdmin(
  overrides: Partial<AccessRequestAuthAdmin> = {},
): AccessRequestAuthAdmin {
  return {
    inviteUserByEmail: vi.fn().mockResolvedValue({
      data: { user: { email: "agent@example.com", id: "invited-user" } },
      error: null,
    }),
    listUsers: vi.fn().mockResolvedValue({ data: { users: [] }, error: null }),
    ...overrides,
  };
}

describe("access request provisioning recovery", () => {
  test("finds an existing Auth user through paginated server-side lookup", async () => {
    const firstPage = Array.from({ length: 1000 }, (_, index) => ({
      email: `user-${index}@example.com`,
      id: `user-${index}`,
    }));
    const admin = authAdmin({
      listUsers: vi
        .fn()
        .mockResolvedValueOnce({ data: { users: firstPage }, error: null })
        .mockResolvedValueOnce({
          data: {
            users: [{ email: "Agent@Example.com", id: "existing-user" }],
          },
          error: null,
        }),
    });

    await expect(
      findAuthUserByEmail(admin, "agent@example.com"),
    ).resolves.toMatchObject({ id: "existing-user" });
    expect(admin.listUsers).toHaveBeenNthCalledWith(2, {
      page: 2,
      perPage: 1000,
    });
  });

  test("reconciles a committed invite after its response is lost", async () => {
    const admin = authAdmin({
      inviteUserByEmail: vi.fn().mockRejectedValue(new Error("network lost")),
      listUsers: vi
        .fn()
        .mockResolvedValueOnce({ data: { users: [] }, error: null })
        .mockResolvedValueOnce({
          data: {
            users: [{ email: "agent@example.com", id: "recovered-user" }],
          },
          error: null,
        }),
    });

    await expect(
      resolveAccessRequestUserId(
        admin,
        "agent@example.com",
        {
          display_name: "Agent",
        },
        "https://document-intake-system.vercel.app/",
      ),
    ).resolves.toBe("recovered-user");
    expect(admin.inviteUserByEmail).toHaveBeenCalledTimes(1);
    expect(admin.inviteUserByEmail).toHaveBeenCalledWith("agent@example.com", {
      data: { display_name: "Agent" },
      redirectTo: "https://document-intake-system.vercel.app/",
    });
  });

  test("fails explicitly when both invite and reconciliation fail", async () => {
    const failure = new Error("invite rejected");
    const admin = authAdmin({
      inviteUserByEmail: vi.fn().mockResolvedValue({
        data: { user: null },
        error: failure,
      }),
    });

    await expect(
      resolveAccessRequestUserId(
        admin,
        "agent@example.com",
        {},
        "https://document-intake-system.vercel.app/",
      ),
    ).rejects.toBe(failure);
  });
});
