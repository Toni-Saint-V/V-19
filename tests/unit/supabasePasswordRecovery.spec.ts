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
  });

  test("updates the password and closes the temporary recovery session", async () => {
    const auth = authClient();
    await completeSupabasePasswordRecovery(auth, "a-secure-password");
    expect(auth.updateUser).toHaveBeenCalledWith({ password: "a-secure-password" });
    expect(auth.signOut).toHaveBeenCalledWith({ scope: "local" });
  });

  test("rejects weak passwords before writing", async () => {
    const auth = authClient();
    await expect(completeSupabasePasswordRecovery(auth, "short")).rejects.toThrow(
      "не меньше 12",
    );
    expect(auth.updateUser).not.toHaveBeenCalled();
  });
});
