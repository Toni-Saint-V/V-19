import { describe, expect, test, vi } from "vitest";
import {
  findAuthUserByEmail,
  provisionAccessRequestInvite,
  type AccessRequestAuthAdmin,
} from "../../supabase/functions/_shared/accessRequestProvisioning";

function authAdmin(
  overrides: Partial<AccessRequestAuthAdmin> = {},
): AccessRequestAuthAdmin {
  return {
    deleteUser: vi.fn().mockResolvedValue({ data: {}, error: null }),
    inviteUserByEmail: vi.fn().mockResolvedValue({
      data: { user: { email: "agent@example.com", id: "fresh-invited-user" } },
      error: null,
    }),
    listUsers: vi.fn().mockResolvedValue({ data: { users: [] }, error: null }),
    ...overrides,
  };
}

describe("access request invite provisioning", () => {
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
            users: [{ email: "Agent@Example.com", id: "pre-hijacked-user" }],
          },
          error: null,
        }),
    });

    await expect(
      findAuthUserByEmail(admin, "agent@example.com"),
    ).resolves.toMatchObject({ id: "pre-hijacked-user" });
    expect(admin.listUsers).toHaveBeenNthCalledWith(2, {
      page: 2,
      perPage: 1000,
    });
  });

  test("deletes an unapproved pre-hijacked identity before issuing a fresh invite", async () => {
    const admin = authAdmin();

    await expect(
      provisionAccessRequestInvite(
        admin,
        "agent@example.com",
        { password_setup_required: true },
        "pre-hijacked-user",
      ),
    ).resolves.toBe("fresh-invited-user");

    expect(admin.deleteUser).toHaveBeenCalledWith("pre-hijacked-user", false);
    expect(vi.mocked(admin.deleteUser).mock.invocationCallOrder[0]).toBeLessThan(
      vi.mocked(admin.inviteUserByEmail).mock.invocationCallOrder[0] ??
        Number.MAX_SAFE_INTEGER,
    );
    expect(admin.inviteUserByEmail).toHaveBeenCalledWith("agent@example.com", {
      data: { password_setup_required: true },
    });
  });

  test("fails closed instead of reusing an unexpected existing identity", async () => {
    const admin = authAdmin({
      listUsers: vi.fn().mockResolvedValue({
        data: { users: [{ email: "agent@example.com", id: "unknown-user" }] },
        error: null,
      }),
    });

    await expect(
      provisionAccessRequestInvite(admin, "agent@example.com", {}),
    ).rejects.toThrow("ACCESS_REQUEST_IDENTITY_CONFLICT");
    expect(admin.inviteUserByEmail).not.toHaveBeenCalled();
  });

  test("removes an uncertain invited identity and fails for an immediate retry", async () => {
    const inviteFailure = new Error("network lost");
    const admin = authAdmin({
      inviteUserByEmail: vi.fn().mockRejectedValue(inviteFailure),
      listUsers: vi
        .fn()
        .mockResolvedValueOnce({ data: { users: [] }, error: null })
        .mockResolvedValueOnce({
          data: {
            users: [{
              email: "agent@example.com",
              id: "recovered-user",
              invited_at: "2026-08-05T00:00:00.000Z",
            }],
          },
          error: null,
        }),
    });

    await expect(
      provisionAccessRequestInvite(admin, "agent@example.com", {}),
    ).rejects.toBe(inviteFailure);
    expect(admin.deleteUser).toHaveBeenCalledWith("recovered-user", false);
  });

  test("rejects a concurrent public signup after an invite failure", async () => {
    const admin = authAdmin({
      inviteUserByEmail: vi.fn().mockRejectedValue(new Error("user already exists")),
      listUsers: vi
        .fn()
        .mockResolvedValueOnce({ data: { users: [] }, error: null })
        .mockResolvedValueOnce({
          data: {
            users: [{ email: "agent@example.com", id: "concurrent-attacker" }],
          },
          error: null,
        }),
    });

    await expect(
      provisionAccessRequestInvite(admin, "agent@example.com", {}),
    ).rejects.toThrow("ACCESS_REQUEST_IDENTITY_CONFLICT");
  });

  test("does not send an invite when replacement deletion fails", async () => {
    const deletionFailure = new Error("delete rejected");
    const admin = authAdmin({
      deleteUser: vi.fn().mockResolvedValue({ data: null, error: deletionFailure }),
    });

    await expect(
      provisionAccessRequestInvite(
        admin,
        "agent@example.com",
        {},
        "pre-hijacked-user",
      ),
    ).rejects.toBe(deletionFailure);
    expect(admin.inviteUserByEmail).not.toHaveBeenCalled();
  });
});
