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
import { PersistenceObservableError } from "../../src/services/persistenceObservability";

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

  test("lists reviewed requests as well as pending requests for the admin history", async () => {
    const order = vi.fn(async () => ({
      data: [
        {
          city: "Мадрид",
          company_name: "Visa Test",
          created_at: "2026-07-07T00:00:00.000Z",
          email: "approved.agent@example.com",
          full_name: "Одобренный Агент",
          id: "access-request-approved",
          phone: "+7 900 000-00-00",
          rejection_reason: null,
          requested_role: "agent",
          reviewed_at: "2026-07-08T00:00:00.000Z",
          reviewed_by_admin_id: "admin-1",
          status: "approved",
          updated_at: "2026-07-08T00:00:00.000Z",
          user_id: "agent-1",
        },
        {
          city: "Москва",
          company_name: "Visa Test",
          created_at: "2026-07-06T00:00:00.000Z",
          email: "pending.agent@example.com",
          full_name: "Новый Агент",
          id: "access-request-pending",
          phone: "+7 900 000-00-01",
          rejection_reason: null,
          requested_role: "agent",
          reviewed_at: null,
          reviewed_by_admin_id: null,
          status: "pending",
          updated_at: "2026-07-06T00:00:00.000Z",
          user_id: null,
        },
      ],
      error: null,
    }));
    const select = vi.fn(() => ({ order }));
    const from = vi.fn(() => ({ select }));
    supabaseMock.client = {
      from,
      functions: {
        invoke: supabaseMock.invoke,
      },
    } as never;

    const requests = await new SupabaseAccessRequestAdapter().listAccessRequests();

    expect(requests).toMatchObject([
      { id: "access-request-approved", status: "approved" },
      { id: "access-request-pending", status: "pending" },
    ]);
    expect(from).toHaveBeenCalledWith("access_requests");
    expect(order).toHaveBeenCalledWith("created_at", { ascending: false });
  });

  test("preserves HTTP 402 when the admin access request read is service-restricted", async () => {
    const order = vi.fn(async () => ({
      data: null,
      error: { message: "provider response intentionally omitted" },
      status: 402,
    }));
    const select = vi.fn(() => ({ order }));
    const from = vi.fn(() => ({ select }));
    supabaseMock.client = {
      from,
      functions: {
        invoke: supabaseMock.invoke,
      },
    } as never;

    try {
      await new SupabaseAccessRequestAdapter().listAccessRequests();
      throw new Error("Expected the restricted Supabase read to fail.");
    } catch (error) {
      expect(error).toBeInstanceOf(PersistenceObservableError);
      expect((error as PersistenceObservableError).diagnostics).toMatchObject({
        httpStatus: 402,
        operation: "auth.access_requests_list",
        retryable: false,
      });
    }
  });
});
