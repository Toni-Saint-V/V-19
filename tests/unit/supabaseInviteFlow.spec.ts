import { describe, expect, test, vi } from "vitest";

import {
  beginSupabaseInvitePasswordSetup,
  cleanSupabaseAuthCallbackUrl,
  completeSupabaseInvitePasswordSetup,
  getPendingSupabaseInvitePasswordSetup,
  parseSupabaseInviteCallbackUrl,
  type SupabaseInviteAuthClient,
} from "../../src/services/supabaseInviteFlow";

function inviteAuthClient(): SupabaseInviteAuthClient {
  return {
    getSession: vi.fn(async () => ({
      data: {
        session: {
          user: {
            email: "invite.user@example.test",
            id: "invite-user-id",
            user_metadata: {
              password_setup_required: true,
            },
          },
        },
      },
      error: null,
    })),
    signOut: vi.fn(async () => ({ error: null })),
    updateUser: vi.fn(async () => ({ error: null })),
    verifyOtp: vi.fn(async () => ({
      data: {
        session: {
          user: {
            email: "invite.user@example.test",
            id: "invite-user-id",
            user_metadata: {
              password_setup_required: true,
            },
          },
        },
      },
      error: null,
    })),
  };
}

describe("Supabase invite completion", () => {
  test("recognizes token-hash and implicit invite callbacks", () => {
    expect(
      parseSupabaseInviteCallbackUrl(
        "http://127.0.0.1:5191/?token_hash=invite-token&type=invite",
      ),
    ).toEqual({ tokenHash: "invite-token" });
    expect(
      parseSupabaseInviteCallbackUrl(
        "http://127.0.0.1:5191/#access_token=session-token&type=invite",
      ),
    ).toEqual({ tokenHash: null });
    expect(
      parseSupabaseInviteCallbackUrl(
        "http://127.0.0.1:5191/?token_hash=recovery-token&type=recovery",
      ),
    ).toBeNull();
  });

  test("verifies token-hash callbacks and returns the invited email", async () => {
    const auth = inviteAuthClient();

    await expect(
      beginSupabaseInvitePasswordSetup(
        auth,
        "http://127.0.0.1:5191/?token_hash=invite-token&type=invite",
      ),
    ).resolves.toEqual({
      email: "invite.user@example.test",
      userId: "invite-user-id",
    });

    expect(auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: "invite-token",
      type: "invite",
    });
    expect(auth.getSession).not.toHaveBeenCalled();
  });

  test("uses the detected session for implicit callbacks", async () => {
    const auth = inviteAuthClient();

    await expect(
      beginSupabaseInvitePasswordSetup(
        auth,
        "http://127.0.0.1:5191/#access_token=session-token&type=invite",
      ),
    ).resolves.toEqual({
      email: "invite.user@example.test",
      userId: "invite-user-id",
    });

    expect(auth.getSession).toHaveBeenCalledOnce();
    expect(auth.verifyOtp).not.toHaveBeenCalled();
  });

  test("accepts a verified legacy invite callback without the setup metadata flag", async () => {
    const auth = inviteAuthClient();
    vi.mocked(auth.verifyOtp).mockResolvedValueOnce({
      data: {
        session: {
          user: {
            email: "legacy.invite@example.test",
            id: "legacy-invite-user-id",
            user_metadata: {},
          },
        },
      },
      error: null,
    });

    await expect(
      beginSupabaseInvitePasswordSetup(
        auth,
        "http://127.0.0.1:5191/?token_hash=legacy-token&type=invite",
      ),
    ).resolves.toEqual({
      email: "legacy.invite@example.test",
      userId: "legacy-invite-user-id",
    });
  });

  test("updates the password, signs out, and removes callback secrets from the URL", async () => {
    const auth = inviteAuthClient();

    await completeSupabaseInvitePasswordSetup(auth, "Unique-E2E-password-2026");

    expect(auth.updateUser).toHaveBeenCalledWith({
      data: {
        password_setup_required: false,
      },
      password: "Unique-E2E-password-2026",
    });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(
      cleanSupabaseAuthCallbackUrl(
        "http://127.0.0.1:5191/?token_hash=invite-token&type=invite&keep=value#access_token=session-token&type=invite",
      ),
    ).toBe("http://127.0.0.1:5191/?keep=value");
  });

  test("restores only a marked pending invite session after reload", async () => {
    const auth = inviteAuthClient();

    await expect(getPendingSupabaseInvitePasswordSetup(auth)).resolves.toEqual({
      email: "invite.user@example.test",
      userId: "invite-user-id",
    });

    const unmarkedAuth = inviteAuthClient();
    vi.mocked(unmarkedAuth.getSession).mockResolvedValueOnce({
      data: {
        session: {
          user: {
            email: "invite.user@example.test",
            id: "invite-user-id",
            user_metadata: {},
          },
        },
      },
      error: null,
    });

    await expect(getPendingSupabaseInvitePasswordSetup(unmarkedAuth)).resolves.toBeNull();
  });
});
