import { beforeEach, describe, expect, test, vi } from "vitest";

const supabaseMock = vi.hoisted(() => ({
  client: null as null | {
    auth: {
      signInWithPassword: ReturnType<typeof vi.fn>;
      signOut: ReturnType<typeof vi.fn>;
      signUp: ReturnType<typeof vi.fn>;
    };
    functions: {
      invoke: ReturnType<typeof vi.fn>;
    };
  },
  invoke: vi.fn(),
  signInWithPassword: vi.fn(),
  signOut: vi.fn(),
  signUp: vi.fn(),
}));

vi.mock("../../src/lib/supabase/client", () => ({
  getSupabaseClient: () => supabaseMock.client,
}));

import { SupabaseAccessRequestAdapter } from "../../src/shared/supabaseAuthRegistration";

describe("Supabase auth registration adapter", () => {
  beforeEach(() => {
    supabaseMock.invoke.mockReset();
    supabaseMock.signInWithPassword.mockReset();
    supabaseMock.signOut.mockReset();
    supabaseMock.signUp.mockReset();
    supabaseMock.signUp.mockResolvedValue({
      data: { session: null, user: { id: "auth-user-1" } },
      error: null,
    });
    supabaseMock.signOut.mockResolvedValue({ error: null });
    supabaseMock.client = {
      auth: {
        signInWithPassword: supabaseMock.signInWithPassword,
        signOut: supabaseMock.signOut,
        signUp: supabaseMock.signUp,
      },
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
      password: "Unique-E2E-password-2026",
      phone: "+7 900 000-00-00",
    });

    expect(request).toMatchObject({
      email: "new.agent@example.com",
      status: "pending",
    });
    expect(supabaseMock.signUp).toHaveBeenCalledWith({
      email: "new.agent@example.com",
      password: "Unique-E2E-password-2026",
      options: {
        data: {
          password_setup_required: false,
        },
      },
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

  test("clears a sign-up session before submitting the approval-gated request", async () => {
    supabaseMock.signUp.mockResolvedValue({
      data: { session: { access_token: "temporary" }, user: { id: "auth-user-1" } },
      error: null,
    });
    supabaseMock.invoke.mockResolvedValue({
      data: {
        request: {
          city: "Москва",
          company_name: "Visa Test",
          created_at: "2026-07-07T00:00:00.000Z",
          email: "agent@example.com",
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

    await new SupabaseAccessRequestAdapter().submitAccessRequest({
      city: "Москва",
      companyName: "Visa Test",
      email: "agent@example.com",
      fullName: "Анна Петрова",
      password: "Unique-E2E-password-2026",
      phone: "+7 900 000-00-00",
    });

    expect(supabaseMock.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(supabaseMock.signOut.mock.invocationCallOrder[0]).toBeLessThan(
      supabaseMock.invoke.mock.invocationCallOrder[0] ?? Number.MAX_SAFE_INTEGER,
    );
  });

  test("rejects a weak password before creating Auth state or an access request", async () => {
    await expect(
      new SupabaseAccessRequestAdapter().submitAccessRequest({
        city: "Москва",
        companyName: "Visa Test",
        email: "agent@example.com",
        fullName: "Анна Петрова",
        password: "short",
        phone: "+7 900 000-00-00",
      }),
    ).rejects.toMatchObject({ code: "INVALID_PASSWORD" });

    expect(supabaseMock.signUp).not.toHaveBeenCalled();
    expect(supabaseMock.invoke).not.toHaveBeenCalled();
  });

  test("reconciles an Auth identity when a retry follows a committed Edge failure", async () => {
    const edgeFailure = new Error("edge unavailable");
    supabaseMock.invoke
      .mockResolvedValueOnce({ data: null, error: edgeFailure })
      .mockResolvedValueOnce({
        data: {
          request: {
            city: "Москва",
            company_name: "Visa Test",
            created_at: "2026-07-07T00:00:00.000Z",
            email: "agent@example.com",
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
    const input = {
      city: "Москва",
      companyName: "Visa Test",
      email: "agent@example.com",
      fullName: "Анна Петрова",
      password: "Unique-E2E-password-2026",
      phone: "+7 900 000-00-00",
    };

    await expect(
      new SupabaseAccessRequestAdapter().submitAccessRequest(input),
    ).rejects.toBeTruthy();

    const alreadyRegistered = new Error("User already registered");
    supabaseMock.signUp.mockResolvedValueOnce({
      data: { session: null, user: null },
      error: alreadyRegistered,
    });
    supabaseMock.signInWithPassword.mockResolvedValueOnce({
      data: { session: { access_token: "reconciled" } },
      error: null,
    });

    await expect(
      new SupabaseAccessRequestAdapter().submitAccessRequest(input),
    ).resolves.toMatchObject({ email: "agent@example.com", status: "pending" });
    expect(supabaseMock.signInWithPassword).toHaveBeenCalledWith({
      email: "agent@example.com",
      password: "Unique-E2E-password-2026",
    });
    expect(supabaseMock.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(supabaseMock.invoke).toHaveBeenCalledTimes(2);
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
      auth: {
        signInWithPassword: supabaseMock.signInWithPassword,
        signOut: supabaseMock.signOut,
        signUp: supabaseMock.signUp,
      },
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
});
