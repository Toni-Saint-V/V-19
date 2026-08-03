import { describe, expect, test, vi } from "vitest";

import {
  createEdgeFunctionsRoutingFetch,
  routeSupabaseEdgeFunctionsUrl,
} from "../../src/lib/supabase/edgeFunctionsRoutingFetch";
import { createSupabaseResilientFetch } from "../../src/lib/supabase/resilientFetch";

const routingOptions = {
  edgeFunctionsUrl: "https://project.functions.supabase.co",
  projectId: "project",
  supabaseUrl: "https://project.supabase.co",
};

describe("Supabase Edge Functions routing fetch", () => {
  test("routes SDK function requests through the configured Edge Functions URL", () => {
    expect(
      routeSupabaseEdgeFunctionsUrl(
        "https://project.supabase.co/functions/v1/access-request?region=eu",
        routingOptions,
      ),
    ).toBe("https://project.functions.supabase.co/access-request?region=eu");
  });

  test.each([
    "https://project.supabase.co/rest/v1/access_requests",
    "https://project.supabase.co/auth/v1/token",
    "https://project.supabase.co/storage/v1/object/media/file.png",
    "https://lookalike.example/functions/v1/access-request",
    "https://project.supabase.co/functions/v10/access-request",
  ])("does not rewrite non-function URL %s", (url) => {
    expect(routeSupabaseEdgeFunctionsUrl(url, routingOptions)).toBe(url);
  });

  test.each([
    "https://attacker.example",
    "http://project.functions.supabase.co",
    "https://project.functions.supabase.co?redirect=attacker.example",
    "https://user:password@project.functions.supabase.co",
  ])("rejects untrusted Edge Functions target %s", (edgeFunctionsUrl) => {
    expect(() =>
      routeSupabaseEdgeFunctionsUrl(
        "https://project.supabase.co/functions/v1/access-request",
        { ...routingOptions, edgeFunctionsUrl },
      ),
    ).toThrow("Untrusted Supabase Edge Functions URL.");
  });

  test("rejects a Functions origin when project id and canonical Supabase host differ", () => {
    expect(() =>
      routeSupabaseEdgeFunctionsUrl(
        "https://project.supabase.co/functions/v1/access-request",
        {
          edgeFunctionsUrl: "https://otherproject.functions.supabase.co",
          projectId: "otherproject",
          supabaseUrl: "https://project.supabase.co",
        },
      ),
    ).toThrow("Untrusted Supabase Edge Functions URL.");
  });

  test.each([
    "https://project.supabase.co/functions/v1///attacker.example/collect",
    "https://project.supabase.co/functions/v1/https://attacker.example/collect",
  ])("rejects an absolute URL-shaped function path %s", (url) => {
    expect(() => routeSupabaseEdgeFunctionsUrl(url, routingOptions)).toThrow(
      "Untrusted Supabase Edge Functions path.",
    );
  });

  test("keeps a nested function path under the trusted configured base path", () => {
    expect(
      routeSupabaseEdgeFunctionsUrl(
        "https://project.supabase.co/functions/v1/access-request/versioned",
        {
          ...routingOptions,
          edgeFunctionsUrl: "https://project.functions.supabase.co/edge/functions/v1//",
        },
      ),
    ).toBe(
      "https://project.functions.supabase.co/edge/functions/v1/access-request/versioned",
    );
  });

  test("allows an HTTP Edge Functions path only on the same loopback origin", () => {
    expect(
      routeSupabaseEdgeFunctionsUrl(
        "http://127.0.0.1:4310/functions/v1/access-request",
        {
          edgeFunctionsUrl: "http://127.0.0.1:4310/functions/v1",
          projectId: "v19-local-proof",
          supabaseUrl: "http://127.0.0.1:4310",
        },
      ),
    ).toBe("http://127.0.0.1:4310/functions/v1/access-request");
  });

  test("allows same-origin HTTP routing on IPv6 loopback", () => {
    expect(
      routeSupabaseEdgeFunctionsUrl("http://[::1]:4310/functions/v1/access-request", {
        edgeFunctionsUrl: "http://[::1]:4310/edge/functions/v1",
        projectId: "v19-local-proof",
        supabaseUrl: "http://[::1]:4310",
      }),
    ).toBe("http://[::1]:4310/edge/functions/v1/access-request");
  });

  test("validates a deterministic policy error once before resilient GET retries", async () => {
    const networkFetch = vi.fn<typeof fetch>(async () =>
      Promise.reject(new Error("network should not be reached")),
    );
    let edgeFunctionsUrlReads = 0;
    const options = {
      get edgeFunctionsUrl() {
        edgeFunctionsUrlReads += 1;
        return "https://attacker.example";
      },
      projectId: "project",
      supabaseUrl: "https://project.supabase.co",
    };
    const routedFetch = createEdgeFunctionsRoutingFetch(
      createSupabaseResilientFetch(networkFetch, { attempts: 3, delayMs: 0 }),
      options,
    );

    await expect(
      routedFetch("https://project.supabase.co/functions/v1/read-model", {
        method: "GET",
      }),
    ).rejects.toThrow("Untrusted Supabase Edge Functions URL.");
    expect(edgeFunctionsUrlReads).toBe(1);
    expect(networkFetch).not.toHaveBeenCalled();
  });

  test("preserves the SDK string and RequestInit invocation shape", async () => {
    const calls: Parameters<typeof fetch>[] = [];
    const fetchMock = vi.fn<typeof fetch>(async (...args) => {
      calls.push(args);
      return new Response(null, { status: 204 });
    });
    const routedFetch = createEdgeFunctionsRoutingFetch(fetchMock, routingOptions);
    const init: RequestInit = {
      body: JSON.stringify({ action: "submit" }),
      headers: { authorization: "Bearer public-key" },
      method: "POST",
    };

    await routedFetch("https://project.supabase.co/functions/v1/access-request", init);

    expect(calls[0]?.[0]).toBe("https://project.functions.supabase.co/access-request");
    expect(calls[0]?.[1]).toBe(init);
  });

  test("preserves Request method, headers, and body while routing", async () => {
    const calls: Parameters<typeof fetch>[] = [];
    const fetchMock = vi.fn<typeof fetch>(async (...args) => {
      calls.push(args);
      return new Response(null, { status: 204 });
    });
    const routedFetch = createEdgeFunctionsRoutingFetch(fetchMock, routingOptions);
    const request = new Request(
      "https://project.supabase.co/functions/v1/access-request",
      {
        body: JSON.stringify({ action: "submit" }),
        headers: {
          authorization: "Bearer public-key",
          "content-type": "application/json",
        },
        method: "POST",
      },
    );

    await routedFetch(request);

    const routedRequest = calls[0]?.[0];
    expect(routedRequest).toBeInstanceOf(Request);
    expect((routedRequest as Request).url).toBe(
      "https://project.functions.supabase.co/access-request",
    );
    expect((routedRequest as Request).method).toBe("POST");
    expect((routedRequest as Request).headers.get("authorization")).toBe(
      "Bearer public-key",
    );
    await expect((routedRequest as Request).json()).resolves.toEqual({
      action: "submit",
    });
  });
});
