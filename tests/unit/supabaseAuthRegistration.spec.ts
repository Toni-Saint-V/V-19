import { beforeEach, describe, expect, test, vi } from "vitest";

const supabaseMock = vi.hoisted(() => ({
  client: null as null | {
    functions: {
      invoke: ReturnType<typeof vi.fn>;
    };
  },
  invoke: vi.fn(),
}));

vi.mock("../../src/lib/supabase/client", () => ({
  getSupabaseClient: () => supabaseMock.client,
}));

import { SupabaseAccessRequestAdapter } from "../../src/shared/supabaseAuthRegistration";

describe("Supabase auth registration adapter", () => {
  beforeEach(() => {
    supabaseMock.invoke.mockReset();
    supabaseMock.client = {
      functions: {
        invoke: supabaseMock.invoke,
      },
    };
  });

  test("submits the access request without leaking the password through the edge function payload", async () => {
    supabaseMock.invoke.mockResolvedValue({
      data: {
        request: {
          city: "Мадрид",
          company_name: "Visa Test",
          created_at: "2026-07-07T00:00:00.000Z",
          email: "new.agent@example.com",
          full_name: "Анна Петрова",
          id: "access-request-1",
          phone: "+7 900 000-00-00",
          rejection_reason: null,
          requested_role: "agent",
          reviewed_at: null,
          reviewed_by_admin_id: null,
          status: "pending",
          updated_at: "2026-07-07T00:00:00.000Z",
          user_id: null,
        },
      },
      error: null,
    });

    const request = await new SupabaseAccessRequestAdapter().submitAccessRequest({
      city: "Мадрид",
      companyName: "Visa Test",
      email: " New.Agent@Example.COM ",
      fullName: "Анна Петрова",
      password: "previous-flow-password",
      phone: "+7 900 000-00-00",
    });

    expect(request).toMatchObject({
      email: "new.agent@example.com",
      status: "pending",
    });
    expect(supabaseMock.invoke).toHaveBeenCalledWith("access-request", {
      body: {
        action: "submit",
        input: {
          city: "Мадрид",
          companyName: "Visa Test",
          email: "new.agent@example.com",
          fullName: "Анна Петрова",
          phone: "+7 900 000-00-00",
        },
      },
    });
  });
});
