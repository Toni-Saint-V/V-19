import { beforeEach, describe, expect, test } from "vitest";
import {
  AuthAccessError,
  accessRequestRepository,
  authRepository,
  resetLocalDevAuthRegistrationForTests,
  sessionRepository,
  userRepository,
  type AccessRequestRegistrationInput,
} from "../../src/shared/authRegistration";
import { initialSubmissions } from "../../src/modules/submissions/mockData";
import {
  alternateLocalAgentOwnerId,
  defaultLocalAgentOwnerId,
} from "../../src/modules/submissions/ownership";

const localDevAdminPassword = "22";
const localDevAgentPassword = "11";

function registrationInput(
  email: string,
  patch: Partial<AccessRequestRegistrationInput> = {},
): AccessRequestRegistrationInput {
  return {
    city: "Москва",
    companyName: "Visa Test",
    email,
    fullName: "Анна Петрова",
    password: "secure-local-password",
    phone: "+7 900 000-00-00",
    ...patch,
  };
}

describe("admin-approved local/dev auth registration", () => {
  beforeEach(() => {
    localStorage.clear();
    resetLocalDevAuthRegistrationForTests();
  });

  test("rejects invalid registration before creating an access request", async () => {
    await expect(
      accessRequestRepository.submitAccessRequest(registrationInput("bad-email")),
    ).rejects.toMatchObject({
      code: "INVALID_EMAIL",
    });
    await expect(
      accessRequestRepository.submitAccessRequest(
        registrationInput("missing-name@example.com", { fullName: "" }),
      ),
    ).rejects.toMatchObject({
      code: "INVALID_REGISTRATION",
    });
    await expect(accessRequestRepository.listPendingAccessRequests()).resolves.toEqual(
      [],
    );
  });

  test("seeds approved local demo agent and admin for e2e mode", async () => {
    await expect(
      authRepository.loginApprovedUser("1@1.ru", localDevAgentPassword),
    ).resolves.toMatchObject({
      approvalStatus: "approved",
      email: "1@1.ru",
      ownerAgentId: defaultLocalAgentOwnerId,
      role: "agent",
      status: "active",
    });
    await expect(
      authRepository.loginApprovedUser("2@2.ru", localDevAdminPassword),
    ).resolves.toMatchObject({
      approvalStatus: "approved",
      email: "2@2.ru",
      role: "admin",
      status: "active",
    });
  });

  test("keeps local demo fixture ownership aligned with approved agent accounts", async () => {
    const primaryAgent = await authRepository.loginApprovedUser(
      "1@1.ru",
      localDevAgentPassword,
    );
    const secondaryAgent = await authRepository.loginApprovedUser(
      "agent2@visaflow.local",
      localDevAgentPassword,
    );

    expect(primaryAgent.ownerAgentId).toBe(defaultLocalAgentOwnerId);
    expect(secondaryAgent.ownerAgentId).toBe(alternateLocalAgentOwnerId);
    expect(initialSubmissions.find((submission) => submission.id === "ПД-1048")?.agentId).toBe(
      defaultLocalAgentOwnerId,
    );
    expect(
      initialSubmissions.some(
        (submission) => submission.agentId === alternateLocalAgentOwnerId,
      ),
    ).toBe(true);
  });

  test("public registration creates one pending request and no active agent", async () => {
    const first = await accessRequestRepository.submitAccessRequest(
      registrationInput("New.Agent@Example.com"),
    );
    const second = await accessRequestRepository.submitAccessRequest(
      registrationInput("new.agent@example.com"),
    );

    expect(first).toMatchObject({
      city: "Москва",
      companyName: "Visa Test",
      email: "new.agent@example.com",
      fullName: "Анна Петрова",
      phone: "+7 900 000-00-00",
      requestedRole: "agent",
      status: "pending",
    });
    expect(second.id).toBe(first.id);
    await expect(accessRequestRepository.listPendingAccessRequests()).resolves.toHaveLength(
      1,
    );
    const pendingUser = await userRepository.findUserByEmail("new.agent@example.com");
    expect(pendingUser).toMatchObject({
      approvalStatus: "pending",
      role: "agent",
      status: "pending",
    });
    expect(pendingUser?.ownerAgentId).toBeUndefined();
  });

  test("pending user can only restore pending state, not active workspace access", async () => {
    await accessRequestRepository.submitAccessRequest(
      registrationInput("pending@example.com"),
    );

    const session = await authRepository.loginApprovedUser(
      "pending@example.com",
      "secure-local-password",
    );

    expect(session).toMatchObject({
      approvalStatus: "pending",
      email: "pending@example.com",
      ownerAgentId: undefined,
      role: "agent",
      status: "pending",
    });
    await expect(authRepository.restoreSession()).resolves.toMatchObject({
      approvalStatus: "pending",
      status: "pending",
    });
  });

  test("repeat pending registration refreshes the password verifier", async () => {
    const first = await accessRequestRepository.submitAccessRequest(
      registrationInput("repeat-pending@example.com", {
        password: "first-local-password",
      }),
    );
    const second = await accessRequestRepository.submitAccessRequest(
      registrationInput("repeat-pending@example.com", {
        fullName: "Мария Соколова",
        password: "second-local-password",
      }),
    );

    expect(second).toMatchObject({
      id: first.id,
      fullName: "Мария Соколова",
      status: "pending",
    });
    await expect(
      authRepository.loginApprovedUser(
        "repeat-pending@example.com",
        "first-local-password",
      ),
    ).rejects.toMatchObject({
      code: "INVALID_PASSWORD",
    });
    await expect(
      authRepository.loginApprovedUser(
        "repeat-pending@example.com",
        "second-local-password",
      ),
    ).resolves.toMatchObject({
      approvalStatus: "pending",
      status: "pending",
    });
  });

  test("public user cannot self-create admin", async () => {
    const forged = {
      ...registrationInput("forged-admin@example.com"),
      role: "admin",
      requestedRole: "admin",
    };

    const request = await accessRequestRepository.submitAccessRequest(forged);
    const user = await userRepository.findUserByEmail("forged-admin@example.com");

    expect(request.requestedRole).toBe("agent");
    expect(user).toMatchObject({
      approvalStatus: "pending",
      role: "agent",
      status: "pending",
    });
  });

  test("admin sees pending requests and can approve an active agent owner", async () => {
    const request = await accessRequestRepository.submitAccessRequest(
      registrationInput("agent-approved@example.com"),
    );
    const adminSession = await authRepository.loginApprovedUser(
      "2@2.ru",
      localDevAdminPassword,
    );

    await expect(accessRequestRepository.listPendingAccessRequests()).resolves.toEqual(
      [request],
    );

    const approvedUser = await accessRequestRepository.approveAccessRequest(
      request.id,
      adminSession.userId,
    );
    expect(approvedUser).toMatchObject({
      approvalStatus: "approved",
      approvedFromRequestId: request.id,
      email: "agent-approved@example.com",
      role: "agent",
      status: "active",
    });
    expect(approvedUser.ownerAgentId).toBe(approvedUser.id);
    await expect(accessRequestRepository.listPendingAccessRequests()).resolves.toEqual(
      [],
    );
    await expect(accessRequestRepository.listAccessRequests()).resolves.toMatchObject([
      {
        id: request.id,
        status: "approved",
      },
    ]);
  });

  test("approved active agent can login and restore approved session", async () => {
    const request = await accessRequestRepository.submitAccessRequest(
      registrationInput("approved-login@example.com"),
    );
    const adminSession = await authRepository.loginApprovedUser(
      "2@2.ru",
      localDevAdminPassword,
    );
    await accessRequestRepository.approveAccessRequest(request.id, adminSession.userId);
    await authRepository.logout();

    const agentSession = await authRepository.loginApprovedUser(
      "approved-login@example.com",
      "secure-local-password",
    );

    expect(agentSession).toMatchObject({
      approvalStatus: "approved",
      email: "approved-login@example.com",
      role: "agent",
      status: "active",
    });
    expect(agentSession.ownerAgentId).toBe(agentSession.userId);
    await expect(authRepository.restoreSession()).resolves.toEqual(agentSession);
  });

  test("admin rejects request and rejected user stays blocked with reason", async () => {
    const request = await accessRequestRepository.submitAccessRequest(
      registrationInput("reject-me@example.com"),
    );
    const adminSession = await authRepository.loginApprovedUser(
      "2@2.ru",
      localDevAdminPassword,
    );
    const rejected = await accessRequestRepository.rejectAccessRequest(
      request.id,
      adminSession.userId,
      "Нет договора",
    );

    expect(rejected).toMatchObject({
      rejectionReason: "Нет договора",
      reviewedByAdminId: adminSession.userId,
      status: "rejected",
    });

    const rejectedSession = await authRepository.loginApprovedUser(
      "reject-me@example.com",
      "secure-local-password",
    );
    expect(rejectedSession).toMatchObject({
      approvalStatus: "rejected",
      rejectionReason: "Нет договора",
      status: "rejected",
    });
    expect(rejectedSession.ownerAgentId).toBeUndefined();
  });

  test("repeat rejected registration refreshes the password verifier and preserves rejection", async () => {
    const request = await accessRequestRepository.submitAccessRequest(
      registrationInput("repeat-rejected@example.com", {
        password: "first-local-password",
      }),
    );
    const adminSession = await authRepository.loginApprovedUser(
      "2@2.ru",
      localDevAdminPassword,
    );
    await accessRequestRepository.rejectAccessRequest(
      request.id,
      adminSession.userId,
      "Нет договора",
    );

    const repeated = await accessRequestRepository.submitAccessRequest(
      registrationInput("repeat-rejected@example.com", {
        phone: "+7 999 111-22-33",
        password: "second-local-password",
      }),
    );

    expect(repeated).toMatchObject({
      id: request.id,
      phone: "+7 999 111-22-33",
      rejectionReason: "Нет договора",
      status: "rejected",
    });
    await expect(
      authRepository.loginApprovedUser(
        "repeat-rejected@example.com",
        "first-local-password",
      ),
    ).rejects.toMatchObject({
      code: "INVALID_PASSWORD",
    });
    await expect(
      authRepository.loginApprovedUser(
        "repeat-rejected@example.com",
        "second-local-password",
      ),
    ).resolves.toMatchObject({
      approvalStatus: "rejected",
      rejectionReason: "Нет договора",
      status: "rejected",
    });
  });

  test("disabled user cannot restore session or login", async () => {
    const request = await accessRequestRepository.submitAccessRequest(
      registrationInput("disabled@example.com"),
    );
    const adminSession = await authRepository.loginApprovedUser(
      "2@2.ru",
      localDevAdminPassword,
    );
    const user = await accessRequestRepository.approveAccessRequest(
      request.id,
      adminSession.userId,
    );
    await authRepository.loginApprovedUser("disabled@example.com", "secure-local-password");
    await userRepository.saveUser({ ...user, status: "disabled" });

    await expect(authRepository.restoreSession()).resolves.toBeNull();
    await expect(
      authRepository.loginApprovedUser("disabled@example.com", "secure-local-password"),
    ).rejects.toMatchObject({
      code: "USER_DISABLED",
    });
  });

  test("admin role works and non-admin cannot review requests", async () => {
    const request = await accessRequestRepository.submitAccessRequest(
      registrationInput("needs-admin@example.com"),
    );
    const adminSession = await authRepository.loginApprovedUser(
      "2@2.ru",
      localDevAdminPassword,
    );

    expect(adminSession.role).toBe("admin");
    await expect(
      accessRequestRepository.approveAccessRequest(request.id, "missing-admin"),
    ).rejects.toMatchObject({
      code: "ADMIN_REQUIRED",
    });
  });

  test("session repository keeps pending local adapter behavior explicit", async () => {
    const session = {
      approvalStatus: "pending" as const,
      companyName: "Visa Test",
      createdAt: "2026-06-28T10:00:00.000Z",
      email: "pending@example.com",
      fullName: "Анна Петрова",
      role: "agent" as const,
      status: "pending" as const,
      userId: "agent-user-local",
    };

    await expect(sessionRepository.saveSession(session)).resolves.toEqual(session);
    await expect(sessionRepository.readSession()).resolves.toEqual(session);
    await sessionRepository.clearSession();
    await expect(sessionRepository.readSession()).resolves.toBeNull();
  });

  test("uses typed AuthAccessError for denied paths", async () => {
    await expect(
      authRepository.loginApprovedUser("unknown@example.com", localDevAgentPassword),
    ).rejects.toBeInstanceOf(AuthAccessError);
    await expect(
      authRepository.loginApprovedUser("1@1.ru", "bad-password"),
    ).rejects.toMatchObject({
      code: "INVALID_PASSWORD",
    });
  });
});
