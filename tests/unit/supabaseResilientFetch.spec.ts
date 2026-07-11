import { describe, expect, test, vi } from "vitest";
import {
  createSupabaseResilientFetch,
  isSafeSupabaseNetworkRetry,
} from "../../src/lib/supabase/resilientFetch";

const origin = "https://project.supabase.co";

describe("Supabase resilient fetch", () => {
  test("retries idempotent reads after network failures", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new TypeError("network down"))
      .mockRejectedValueOnce(new TypeError("tls timeout"))
      .mockResolvedValue(new Response("ok", { status: 200 }));
    const resilientFetch = createSupabaseResilientFetch(fetchImpl, {
      delayMs: 0,
      requestTimeoutMs: 1_000,
    });

    const response = await resilientFetch(`${origin}/rest/v1/submissions`, {
      method: "GET",
    });

    expect(response.status).toBe(200);
    expect(fetchImpl).toHaveBeenCalledTimes(3);
  });

  test("retries password and refresh token requests only", async () => {
    expect(
      isSafeSupabaseNetworkRetry(
        `${origin}/auth/v1/token?grant_type=password`,
        { method: "POST" },
      ),
    ).toBe(true);
    expect(
      isSafeSupabaseNetworkRetry(
        `${origin}/auth/v1/token?grant_type=refresh_token`,
        { method: "POST" },
      ),
    ).toBe(true);
    expect(
      isSafeSupabaseNetworkRetry(`${origin}/rest/v1/rpc/save_submission_draft`, {
        method: "POST",
      }),
    ).toBe(false);
  });

  test("never retries mutations after an ambiguous network failure", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new TypeError("network down"));
    const resilientFetch = createSupabaseResilientFetch(fetchImpl, {
      delayMs: 0,
      requestTimeoutMs: 1_000,
    });

    await expect(
      resilientFetch(`${origin}/rest/v1/rpc/save_submission_draft`, {
        method: "POST",
      }),
    ).rejects.toThrow("network down");
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  test("does not retry completed HTTP error responses", async () => {
    const fetchImpl = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response("unavailable", { status: 503 }));
    const resilientFetch = createSupabaseResilientFetch(fetchImpl, {
      delayMs: 0,
      requestTimeoutMs: 1_000,
    });

    const response = await resilientFetch(`${origin}/rest/v1/submissions`);

    expect(response.status).toBe(503);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
