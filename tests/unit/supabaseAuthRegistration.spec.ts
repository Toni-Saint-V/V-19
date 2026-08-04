import { beforeEach, describe, expect, test, vi } from "vitest";

const supabaseMock = vi.hoisted(() => ({
  authCall: vi.fn(),
  client: null as null | Record<string, unknown>,
  invoke: vi.fn(),
}));

vi.mock("../../src/lib/supabase/client", () => ({
  getSupabaseClient: () => supabaseMock.client,
}));

import { SupabaseAccessRequestAdapter } from "../../src/shared/supabaseAuthRegistration";

const input = {
  city: "Москва",
  companyName: "Visa Test",
  email: " Agent@Example.COM ",
  fullName: "Анна Петрова",
  password: "",
  phone: "+7 900 000-00-00",
};

const pendingRequest = {
  city: "Москва",
  company_name: "Visa Test",
  created_at: "2026-08-04T00:00:00.000Z",
  email: "agent@example.com",
  full_name: "Анна Петрова",
  id: "submitted-agent-example.com",
  phone: "+7 900 000-00-00",
  rejection_reason: null,
  requested_role: "agent",
  reviewed_at: null,
  reviewed_by_admin_id: null,
  status: "pending",
  updated_at: "2026-08-04T00:00:00.000Z",
  user_id: null,
};

describe("Supabase access-request registration adapter", () => {
  beforeEach(() => {
    supabaseMock.authCall.mockReset();
    supabaseMock.invoke.mockReset();
    supabaseMock.invoke.mockResolvedValue({
      data: { request: pendingRequest },
      error: null,
    });
    supabaseMock.client = {
      auth: {
        signInWithOtp: supabaseMock.authCall,
        signInWithPassword: supabaseMock.authCall,
        signUp: supabaseMock.authCall,
      },
      functions: { invoke: supabaseMock.invoke },
    };
  });

  test("creates the request without creating an Auth user or accepting a password", async () => {
    const request = await new SupabaseAccessRequestAdapter().submitAccessRequest(input);

    expect(request).toMatchObject({
      email: "agent@example.com",
      status: "pending",
    });
    expect(supabaseMock.authCall).not.toHaveBeenCalled();
    expect(supabaseMock.invoke).toHaveBeenCalledWith("access-request", {
      body: {
        action: "submit",
        input: {
          city: "Москва",
          companyName: "Visa Test",
          email: "agent@example.com",
          fullName: "Анна Петрова",
          phone: "+7 900 000-00-00",
        },
      },
    });
    expect(JSON.stringify(supabaseMock.invoke.mock.calls)).not.toContain("password");
  });

  test("accepts an empty browser password field because setup happens only after approval", async () => {
    await expect(
      new SupabaseAccessRequestAdapter().submitAccessRequest(input),
    ).resolves.toMatchObject({ status: "pending" });
  });

  test("rejects an invalid email before invoking Edge", async () => {
    await expect(
      new SupabaseAccessRequestAdapter().submitAccessRequest({
        ...input,
        email: "invalid",
      }),
    ).rejects.toMatchObject({ code: "INVALID_EMAIL" });
    expect(supabaseMock.invoke).not.toHaveBeenCalled();
  });

  test("maps an Edge identity conflict to the typed auth contract", async () => {
    supabaseMock.invoke.mockResolvedValue({
      data: null,
      error: {
        context: new Response(
          JSON.stringify({ error: "ACCESS_REQUEST_IDENTITY_CONFLICT" }),
          { status: 409 },
        ),
      },
    });

    await expect(
      new SupabaseAccessRequestAdapter().approveAccessRequest("request-1", "admin-1"),
    ).rejects.toMatchObject({ code: "ACCESS_REQUEST_IDENTITY_CONFLICT" });
  });
});
