import type { Role } from "../types/domain";

export type AccessRequestStatus = "pending" | "approved" | "rejected";
export type RequestedRole = "agent";
export type UserStatus = "active" | "disabled";

export interface AccessRequest {
  id: string;
  email: string;
  requestedRole: RequestedRole;
  status: AccessRequestStatus;
  createdAt: string;
  reviewedAt?: string;
  reviewedByAdminId?: string;
  rejectionReason?: string;
}

export interface User {
  id: string;
  email: string;
  role: Role;
  status: UserStatus;
  createdAt: string;
  approvedFromRequestId?: string;
}

export interface Session {
  userId: string;
  email: string;
  role: Role;
  createdAt: string;
  expiresAt?: string;
}

export interface AuthRepository {
  submitAccessRequest(email: string): Promise<AccessRequest>;
  loginApprovedUser(email: string): Promise<Session>;
  logout(): Promise<void>;
  restoreSession(): Promise<Session | null>;
  getCurrentSession(): Promise<Session | null>;
  getCurrentUser(): Promise<User | null>;
}

export interface AccessRequestRepository {
  submitAccessRequest(email: string): Promise<AccessRequest>;
  listPendingAccessRequests(): Promise<AccessRequest[]>;
  approveAccessRequest(id: string, adminId: string): Promise<User>;
  rejectAccessRequest(
    id: string,
    adminId: string,
    reason?: string,
  ): Promise<AccessRequest>;
}

export interface UserRepository {
  findUserByEmail(email: string): Promise<User | null>;
  findUserById(id: string): Promise<User | null>;
  saveUser(user: User): Promise<User>;
}

export interface SessionRepository {
  saveSession(session: Session): Promise<Session>;
  readSession(): Promise<Session | null>;
  clearSession(): Promise<void>;
}

interface LocalDevAuthState {
  accessRequests: AccessRequest[];
  users: User[];
  session: Session | null;
}

const localDevAuthStorageKey = "visaflow.auth.localDev.v1";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const localDevApprovedUsers: User[] = [
  {
    id: "admin-local-1",
    email: "admin@visaflow.local",
    role: "admin",
    status: "active",
    createdAt: "2026-06-28T00:00:00.000Z",
  },
  {
    id: "admin-demo-ops",
    email: "ops@visaflow.demo",
    role: "admin",
    status: "active",
    createdAt: "2026-06-28T00:00:00.000Z",
  },
  {
    id: "agent-local-1",
    email: "agent@visaflow.local",
    role: "agent",
    status: "active",
    createdAt: "2026-06-28T00:00:00.000Z",
  },
];

export class AuthAccessError extends Error {
  constructor(
    readonly code:
      | "INVALID_EMAIL"
      | "ACCESS_PENDING"
      | "ACCESS_REJECTED"
      | "ACCESS_NOT_FOUND"
      | "USER_DISABLED"
      | "ADMIN_REQUIRED"
      | "REQUEST_NOT_FOUND"
      | "REQUEST_NOT_PENDING",
    message: string,
  ) {
    super(message);
    this.name = "AuthAccessError";
  }
}

export function normalizeAuthEmail(email: string): string {
  return email.trim().toLowerCase();
}

function assertValidEmail(email: string): string {
  const normalized = normalizeAuthEmail(email);
  if (!emailPattern.test(normalized)) {
    throw new AuthAccessError("INVALID_EMAIL", "Введите корректную рабочую почту.");
  }
  return normalized;
}

function nowIso(): string {
  return new Date().toISOString();
}

function createId(prefix: string): string {
  const random =
    globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36).slice(2);
  return `${prefix}-${random}`;
}

function defaultLocalDevState(): LocalDevAuthState {
  return {
    accessRequests: [],
    users: [...localDevApprovedUsers],
    session: null,
  };
}

function readLocalDevState(): LocalDevAuthState {
  try {
    const raw = localStorage.getItem(localDevAuthStorageKey);
    if (!raw) return defaultLocalDevState();
    const parsed = JSON.parse(raw) as Partial<LocalDevAuthState>;
    const users = [
      ...localDevApprovedUsers,
      ...(Array.isArray(parsed.users) ? parsed.users : []).filter(
        (user) =>
          !localDevApprovedUsers.some((approved) => approved.email === user.email),
      ),
    ];

    return {
      accessRequests: Array.isArray(parsed.accessRequests)
        ? parsed.accessRequests
        : [],
      users,
      session: parsed.session ?? null,
    };
  } catch {
    return defaultLocalDevState();
  }
}

function writeLocalDevState(state: LocalDevAuthState): void {
  localStorage.setItem(localDevAuthStorageKey, JSON.stringify(state));
}

export class LocalDevAuthRegistrationAdapter
  implements AuthRepository, AccessRequestRepository, UserRepository, SessionRepository
{
  readonly adapterName = "local/dev";

  async submitAccessRequest(email: string): Promise<AccessRequest> {
    const normalized = assertValidEmail(email);
    const state = readLocalDevState();
    const existingUser = state.users.find((user) => user.email === normalized);
    if (existingUser?.status === "active") {
      return {
        id: `approved-${existingUser.id}`,
        email: normalized,
        requestedRole: "agent",
        status: "approved",
        createdAt: existingUser.createdAt,
        reviewedAt: existingUser.createdAt,
        reviewedByAdminId: existingUser.role === "admin" ? existingUser.id : undefined,
        rejectionReason: undefined,
      };
    }

    const existingRequest = state.accessRequests.find(
      (request) => request.email === normalized,
    );
    if (existingRequest) return existingRequest;

    const request: AccessRequest = {
      id: createId("access-request"),
      email: normalized,
      requestedRole: "agent",
      status: "pending",
      createdAt: nowIso(),
    };
    state.accessRequests.push(request);
    writeLocalDevState(state);
    return request;
  }

  async listPendingAccessRequests(): Promise<AccessRequest[]> {
    return readLocalDevState()
      .accessRequests.filter((request) => request.status === "pending")
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  }

  async approveAccessRequest(id: string, adminId: string): Promise<User> {
    const state = readLocalDevState();
    assertAdmin(state, adminId);
    const request = findRequest(state, id);
    if (request.status !== "pending") {
      throw new AuthAccessError(
        "REQUEST_NOT_PENDING",
        "Заявка уже была рассмотрена.",
      );
    }

    const reviewedAt = nowIso();
    request.status = "approved";
    request.reviewedAt = reviewedAt;
    request.reviewedByAdminId = adminId;
    request.rejectionReason = undefined;

    const existingUser = state.users.find((user) => user.email === request.email);
    const user: User = existingUser
      ? {
          ...existingUser,
          role: "agent",
          status: "active",
          approvedFromRequestId: request.id,
        }
      : {
          id: createId("agent-user"),
          email: request.email,
          role: "agent",
          status: "active",
          createdAt: reviewedAt,
          approvedFromRequestId: request.id,
        };
    state.users = state.users.filter((candidate) => candidate.id !== user.id);
    state.users.push(user);
    writeLocalDevState(state);
    return user;
  }

  async rejectAccessRequest(
    id: string,
    adminId: string,
    reason?: string,
  ): Promise<AccessRequest> {
    const state = readLocalDevState();
    assertAdmin(state, adminId);
    const request = findRequest(state, id);
    if (request.status !== "pending") {
      throw new AuthAccessError(
        "REQUEST_NOT_PENDING",
        "Заявка уже была рассмотрена.",
      );
    }

    request.status = "rejected";
    request.reviewedAt = nowIso();
    request.reviewedByAdminId = adminId;
    request.rejectionReason = reason?.trim() || undefined;
    writeLocalDevState(state);
    return request;
  }

  async findUserByEmail(email: string): Promise<User | null> {
    const normalized = normalizeAuthEmail(email);
    return readLocalDevState().users.find((user) => user.email === normalized) ?? null;
  }

  async findUserById(id: string): Promise<User | null> {
    return readLocalDevState().users.find((user) => user.id === id) ?? null;
  }

  async saveUser(user: User): Promise<User> {
    const state = readLocalDevState();
    state.users = state.users.filter((candidate) => candidate.id !== user.id);
    state.users.push(user);
    writeLocalDevState(state);
    return user;
  }

  async loginApprovedUser(email: string): Promise<Session> {
    const normalized = assertValidEmail(email);
    const state = readLocalDevState();
    const user = state.users.find((candidate) => candidate.email === normalized);

    if (user?.status === "disabled") {
      throw new AuthAccessError("USER_DISABLED", "Пользователь отключён.");
    }
    if (!user) {
      const latestRequest = [...state.accessRequests]
        .filter((request) => request.email === normalized)
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
      if (latestRequest?.status === "pending") {
        throw new AuthAccessError(
          "ACCESS_PENDING",
          "Заявка отправлена. Доступ появится после одобрения администратором.",
        );
      }
      if (latestRequest?.status === "rejected") {
        throw new AuthAccessError("ACCESS_REJECTED", "Заявка отклонена.");
      }
      throw new AuthAccessError(
        "ACCESS_NOT_FOUND",
        "Почта не найдена в списке доступа.",
      );
    }

    const session: Session = {
      userId: user.id,
      email: user.email,
      role: user.role,
      createdAt: nowIso(),
    };
    state.session = session;
    writeLocalDevState(state);
    return session;
  }

  async saveSession(session: Session): Promise<Session> {
    const state = readLocalDevState();
    state.session = session;
    writeLocalDevState(state);
    return session;
  }

  async readSession(): Promise<Session | null> {
    return readLocalDevState().session;
  }

  async clearSession(): Promise<void> {
    const state = readLocalDevState();
    state.session = null;
    writeLocalDevState(state);
  }

  async logout(): Promise<void> {
    await this.clearSession();
  }

  async restoreSession(): Promise<Session | null> {
    const state = readLocalDevState();
    const session = state.session;
    if (!session) return null;
    const user = state.users.find((candidate) => candidate.id === session.userId);
    if (!user || user.status !== "active") {
      state.session = null;
      writeLocalDevState(state);
      return null;
    }
    return session;
  }

  async getCurrentSession(): Promise<Session | null> {
    return this.restoreSession();
  }

  async getCurrentUser(): Promise<User | null> {
    const session = await this.restoreSession();
    if (!session) return null;
    return this.findUserById(session.userId);
  }
}

function assertAdmin(state: LocalDevAuthState, adminId: string): void {
  const admin = state.users.find((user) => user.id === adminId);
  if (!admin || admin.role !== "admin" || admin.status !== "active") {
    throw new AuthAccessError(
      "ADMIN_REQUIRED",
      "Только активный администратор может рассмотреть заявку.",
    );
  }
}

function findRequest(state: LocalDevAuthState, id: string): AccessRequest {
  const request = state.accessRequests.find((candidate) => candidate.id === id);
  if (!request) {
    throw new AuthAccessError("REQUEST_NOT_FOUND", "Заявка не найдена.");
  }
  return request;
}

export const localDevAuthRegistrationAdapter = new LocalDevAuthRegistrationAdapter();

export const authRepository: AuthRepository = localDevAuthRegistrationAdapter;
export const accessRequestRepository: AccessRequestRepository =
  localDevAuthRegistrationAdapter;
export const userRepository: UserRepository = localDevAuthRegistrationAdapter;
export const sessionRepository: SessionRepository = localDevAuthRegistrationAdapter;

export function resetLocalDevAuthRegistrationForTests(): void {
  localStorage.removeItem(localDevAuthStorageKey);
}
