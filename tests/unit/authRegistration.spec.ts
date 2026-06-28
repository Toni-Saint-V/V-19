import { beforeEach, describe, expect, test } from "vitest";
import {
  AuthAccessError,
  accessRequestRepository,
  authRepository,
  resetLocalDevAuthRegistrationForTests,
  sessionRepository,
  userRepository,
} from "../../src/shared/authRegistration";

describe("admin-approved local/dev auth registration", () => {
  beforeEach(() => {
    localStorage.clear();
    resetLocalDevAuthRegistrationForTests();
  });

  test("rejects invalid email before creating an access request", async () => {
    await expect(
      accessRequestRepository.submitAccessRequest("bad-email"),
    ).rejects.toMatchObject({
      code: "INVALID_EMAIL",
    });
    await expect(accessRequestRepository.listPendingAccessRequests()).resolves.toEqual(
      [],
    );
  });

  test("seeds approved local demo agent for the default workspace", async () => {
    await expect(
      authRepository.loginApprovedUser("agent@visaflow.local"),
    ).resolves.toMatchObject({
      email: "agent@visaflow.local",
      role: "agent",
    });
  });

  test("creates one pending access request for duplicate agent email", async () => {
    const first = await accessRequestRepository.submitAccessRequest(
      "New.Agent@Example.com",
    );
    const second = await accessRequestRepository.submitAccessRequest(
      "new.agent@example.com",
    );

    expect(first).toMatchObject({
      email: "new.agent@example.com",
      requestedRole: "agent",
      status: "pending",
    });
    expect(second.id).toBe(first.id);
    await expect(accessRequestRepository.listPendingAccessRequests()).resolves.toHaveLength(
      1,
    );
  });

  test("blocks pending requests from agent app access", async () => {
    await accessRequestRepository.submitAccessRequest("pending@example.com");

    await expect(
      authRepository.loginApprovedUser("pending@example.com"),
    ).rejects.toMatchObject({
      code: "ACCESS_PENDING",
      message:
        "Заявка отправлена. Доступ появится после одобрения администратором.",
    });
    await expect(authRepository.getCurrentSession()).resolves.toBeNull();
  });

  test("admin sees pending requests and can approve an active agent user", async () => {
    const request =
      await accessRequestRepository.submitAccessRequest("agent-approved@example.com");
    const adminSession = await authRepository.loginApprovedUser(
      "admin@visaflow.local",
    );

    await expect(accessRequestRepository.listPendingAccessRequests()).resolves.toEqual(
      [request],
    );

    const approvedUser = await accessRequestRepository.approveAccessRequest(
      request.id,
      adminSession.userId,
    );
    expect(approvedUser).toMatchObject({
      email: "agent-approved@example.com",
      role: "agent",
      status: "active",
      approvedFromRequestId: request.id,
    });
    await expect(accessRequestRepository.listPendingAccessRequests()).resolves.toEqual(
      [],
    );
  });

  test("approved active agent can login and restore session", async () => {
    const request =
      await accessRequestRepository.submitAccessRequest("approved-login@example.com");
    const adminSession = await authRepository.loginApprovedUser(
      "admin@visaflow.local",
    );
    await accessRequestRepository.approveAccessRequest(request.id, adminSession.userId);
    await authRepository.logout();

    const agentSession = await authRepository.loginApprovedUser(
      "approved-login@example.com",
    );

    expect(agentSession).toMatchObject({
      email: "approved-login@example.com",
      role: "agent",
    });
    await expect(authRepository.restoreSession()).resolves.toEqual(agentSession);
    await expect(authRepository.getCurrentUser()).resolves.toMatchObject({
      email: "approved-login@example.com",
      role: "agent",
      status: "active",
    });
  });

  test("reject blocks access and rejected email cannot login", async () => {
    const request =
      await accessRequestRepository.submitAccessRequest("reject-me@example.com");
    const adminSession = await authRepository.loginApprovedUser(
      "admin@visaflow.local",
    );
    const rejected = await accessRequestRepository.rejectAccessRequest(
      request.id,
      adminSession.userId,
      "Нет договора",
    );

    expect(rejected).toMatchObject({
      status: "rejected",
      rejectionReason: "Нет договора",
      reviewedByAdminId: adminSession.userId,
    });
    await expect(
      authRepository.loginApprovedUser("reject-me@example.com"),
    ).rejects.toMatchObject({
      code: "ACCESS_REJECTED",
    });
  });

  test("disabled user cannot restore session or login", async () => {
    const request =
      await accessRequestRepository.submitAccessRequest("disabled@example.com");
    const adminSession = await authRepository.loginApprovedUser(
      "admin@visaflow.local",
    );
    const user = await accessRequestRepository.approveAccessRequest(
      request.id,
      adminSession.userId,
    );
    await authRepository.loginApprovedUser("disabled@example.com");
    await userRepository.saveUser({ ...user, status: "disabled" });

    await expect(authRepository.restoreSession()).resolves.toBeNull();
    await expect(
      authRepository.loginApprovedUser("disabled@example.com"),
    ).rejects.toMatchObject({
      code: "USER_DISABLED",
    });
  });

  test("admin role works and non-admin cannot review requests", async () => {
    const request =
      await accessRequestRepository.submitAccessRequest("needs-admin@example.com");
    const adminSession = await authRepository.loginApprovedUser(
      "admin@visaflow.local",
    );

    expect(adminSession.role).toBe("admin");
    await expect(
      accessRequestRepository.approveAccessRequest(request.id, "missing-admin"),
    ).rejects.toMatchObject({
      code: "ADMIN_REQUIRED",
    });
  });

  test("session repository keeps local adapter behavior explicit", async () => {
    const session = {
      userId: "admin-local-1",
      email: "admin@visaflow.local",
      role: "admin" as const,
      createdAt: "2026-06-28T10:00:00.000Z",
    };

    await expect(sessionRepository.saveSession(session)).resolves.toEqual(session);
    await expect(sessionRepository.readSession()).resolves.toEqual(session);
    await sessionRepository.clearSession();
    await expect(sessionRepository.readSession()).resolves.toBeNull();
  });

  test("uses typed AuthAccessError for denied paths", async () => {
    await expect(authRepository.loginApprovedUser("unknown@example.com")).rejects.toBeInstanceOf(
      AuthAccessError,
    );
  });
});
