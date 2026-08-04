import { describe, expect, test, vi } from "vitest";
import {
  beginSupabasePasswordRecovery,
  cleanSupabaseRecoveryCallbackUrl,
  completeSupabasePasswordRecovery,
  parseSupabaseRecoveryCallbackUrl,
  type SupabaseRecoveryAuthClient,
} from "../../src/services/supabasePasswordRecovery";

function authClient(): SupabaseRecoveryAuthClient {
  return {
    getSession: vi.fn(async () => ({
      data: {
        session: { user: { email: "audit@example.com", id: "user-1" } },
      },
      error: null,
    })),
    onAuthStateChange: vi.fn(() => ({
      data: {
        subscription: {
          unsubscribe: vi.fn(),
        },
      },
    })),
    signOut: vi.fn(async () => ({ error: null })),
    updateUser: vi.fn(async () => ({ error: null })),
    verifyOtp: vi.fn(async () => ({
      data: {
        session: { user: { email: "audit@example.com", id: "user-1" } },
      },
      error: null,
    })),
  };
}

describe("Supabase password recovery", () => {
  test("parses, verifies and removes a production recovery callback", async () => {
    const auth = authClient();
    const url = "https://app.example/?type=recovery&token_hash=secret#type=recovery";

    expect(parseSupabaseRecoveryCallbackUrl(url)).toEqual({ tokenHash: "secret" });
    await expect(beginSupabasePasswordRecovery(auth, url)).resolves.toEqual({
      email: "audit@example.com",
      userId: "user-1",
    });
    expect(auth.verifyOtp).toHaveBeenCalledWith({
      token_hash: "secret",
      type: "recovery",
    });
    expect(cleanSupabaseRecoveryCallbackUrl(url)).toBe("https://app.example/");
    expect(
      parseSupabaseRecoveryCallbackUrl("https://app.example/?type=recovery"),
    ).toBeNull();
  });

  test("updates the password and closes the temporary recovery session", async () => {
    const auth = authClient();
    await completeSupabasePasswordRecovery(auth, "a-secure-password");
    expect(auth.updateUser).toHaveBeenCalledWith({
      data: { password_setup_required: false },
      password: "a-secure-password",
    });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  test("accepts the PASSWORD_RECOVERY session emitted while the callback initializes", async () => {
    const auth = authClient();
    vi.mocked(auth.getSession).mockResolvedValueOnce({
      data: { session: null },
      error: null,
    });
    vi.mocked(auth.onAuthStateChange!).mockImplementationOnce((callback) => {
      queueMicrotask(() => {
        callback("PASSWORD_RECOVERY", {
          user: { email: "recovery@example.com", id: "recovery-user" },
        });
      });
      return {
        data: {
          subscription: {
            unsubscribe: vi.fn(),
          },
        },
      };
    });

    await expect(
      beginSupabasePasswordRecovery(
        auth,
        "https://app.example/?type=recovery#access_token=temporary",
      ),
    ).resolves.toEqual({
      email: "recovery@example.com",
      userId: "recovery-user",
    });
  });

  test("rejects an unrelated current session when no recovery event arrives", async () => {
    vi.useFakeTimers();
    try {
      const auth = authClient();
      const recovery = beginSupabasePasswordRecovery(
        auth,
        "https://app.example/?type=recovery#access_token=untrusted",
      );
      const rejection = expect(recovery).rejects.toThrow(
        "Supabase не подтвердил сессию восстановления пароля",
      );

      await vi.advanceTimersByTimeAsync(2_000);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  test("rejects weak passwords before writing", async () => {
    const auth = authClient();
    await expect(completeSupabasePasswordRecovery(auth, "short")).rejects.toThrow(
      "не меньше 12",
    );
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
});
