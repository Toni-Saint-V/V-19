import type { Role } from "../types/domain";

export type AccessRequestStatus = "pending" | "approved" | "rejected";
export type RequestedRole = "agent";
export type UserStatus = "active" | "disabled";

export interface AccessRequestInput {
  email: string;
  displayName: string;
  organizationName: string;
}

export interface AccessRequest {
  id: string;
  email: string;
  displayName: string;
  organizationName: string;
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
  displayName?: string;
  organizationName?: string;
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
  submitAccessRequest(input: AccessRequestInput): Promise<AccessRequest>;
  loginApprovedUser(email: string): Promise<Session>;
  logout(): Promise<void>;
  restoreSession(): Promise<Session | null>;
  getCurrentSession(): Promise<Session | null>;
  getCurrentUser(): Promise<User | null>;
}

export interface AccessRequestRepository {
  submitAccessRequest(input: AccessRequestInput): Promise<AccessRequest>;
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
    displayName: "Ирина Лебедева",
    organizationName: "VisaFlow Ops",
    role: "admin",
    status: "active",
    createdAt: "2026-06-28T00:00:00.000Z",
  },
  {
    id: "admin-demo-ops",
    email: "ops@visaflow.demo",
    displayName: "Операции",
    organizationName: "VisaFlow Ops",
    role: "admin",
    status: "active",
    createdAt: "2026-06-28T00:00:00.000Z",
  },
  {
    id: "agent-local-1",
    email: "agent@visaflow.local",
    displayName: "Татьяна Новикова",
    organizationName: "Visa Center Spb",
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
      | "ACCESS_REQUEST_INCOMPLETE"
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

function assertRequiredRequestText(value: string, message: string): string {
  const normalized = value.trim();
  if (!normalized) {
    throw new AuthAccessError("ACCESS_REQUEST_INCOMPLETE", message);
  }
  return normalized;
}

function normalizeAccessRequestInput(input: AccessRequestInput): AccessRequestInput {
  return {
    email: assertValidEmail(input.email),
    displayName: assertRequiredRequestText(input.displayName, "Введите имя."),
    organizationName: assertRequiredRequestText(
      input.organizationName,
      "Введите организацию.",
    ),
  };
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

function isObjectRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function stringField(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function statusField(value: unknown): AccessRequestStatus | null {
  return value === "pending" || value === "approved" || value === "rejected"
    ? value
    : null;
}

function userStatusField(value: unknown): UserStatus | null {
  return value === "active" || value === "disabled" ? value : null;
}

function roleField(value: unknown): Role | null {
  return value === "agent" || value === "admin" ? value : null;
}

function defaultDisplayNameForEmail(email: string): string {
  return email.split("@")[0] || email;
}

function normalizeStoredAccessRequest(value: unknown): AccessRequest | null {
  if (!isObjectRecord(value)) return null;

  const id = stringField(value.id);
  const emailValue = stringField(value.email);
  const status = statusField(value.status);
  const createdAt = stringField(value.createdAt);
  if (!id || !emailValue || !status || !createdAt) return null;

  const email = normalizeAuthEmail(emailValue);
  if (!emailPattern.test(email)) return null;

  return {
    id,
    email,
    displayName: stringField(value.displayName) ?? defaultDisplayNameForEmail(email),
    organizationName: stringField(value.organizationName) ?? "Не указана",
    requestedRole: "agent",
    status,
    createdAt,
    reviewedAt: stringField(value.reviewedAt) ?? undefined,
    reviewedByAdminId: stringField(value.reviewedByAdminId) ?? undefined,
    rejectionReason: stringField(value.rejectionReason) ?? undefined,
  };
}

function normalizeStoredUser(value: unknown): User | null {
  if (!isObjectRecord(value)) return null;

  const id = stringField(value.id);
  const emailValue = stringField(value.email);
  const role = roleField(value.role);
  const status = userStatusField(value.status);
  const createdAt = stringField(value.createdAt);
  if (!id || !emailValue || !role || !status || !createdAt) return null;

  const email = normalizeAuthEmail(emailValue);
  if (!emailPattern.test(email)) return null;

  return {
    id,
    email,
    displayName: stringField(value.displayName) ?? undefined,
    organizationName: stringField(value.organizationName) ?? undefined,
    role,
    status,
    createdAt,
    approvedFromRequestId: stringField(value.approvedFromRequestId) ?? undefined,
  };
}

function normalizeStoredSession(value: unknown): Session | null {
  if (!isObjectRecord(value)) return null;

  const userId = stringField(value.userId);
  const emailValue = stringField(value.email);
  const role = roleField(value.role);
  const createdAt = stringField(value.createdAt);
  if (!userId || !emailValue || !role || !createdAt) return null;

  const email = normalizeAuthEmail(emailValue);
  if (!emailPattern.test(email)) return null;

  return {
    userId,
    email,
    role,
    createdAt,
    expiresAt: stringField(value.expiresAt) ?? undefined,
  };
}

function readLocalDevState(): LocalDevAuthState {
  try {
    const raw = localStorage.getItem(localDevAuthStorageKey);
    if (!raw) return defaultLocalDevState();
    const parsed: unknown = JSON.parse(raw);
    if (!isObjectRecord(parsed)) return defaultLocalDevState();
    const storedUsers = Array.isArray(parsed.users)
      ? parsed.users.map(normalizeStoredUser).filter((user) => user !== null)
      : [];
    const users = [
      ...localDevApprovedUsers,
      ...storedUsers.filter(
        (user) =>
          !localDevApprovedUsers.some((approved) => approved.email === user.email),
      ),
    ];

    return {
      accessRequests: Array.isArray(parsed.accessRequests)
        ? parsed.accessRequests
            .map(normalizeStoredAccessRequest)
            .filter((request) => request !== null)
        : [],
      users,
      session: normalizeStoredSession(parsed.session),
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

  async submitAccessRequest(input: AccessRequestInput): Promise<AccessRequest> {
    const normalized = normalizeAccessRequestInput(input);
    const state = readLocalDevState();
    const existingUser = state.users.find((user) => user.email === normalized.email);
    if (existingUser?.status === "active") {
      return {
        id: `approved-${existingUser.id}`,
        email: normalized.email,
        displayName:
          existingUser.displayName ?? normalized.displayName,
        organizationName:
          existingUser.organizationName ?? normalized.organizationName,
        requestedRole: "agent",
        status: "approved",
        createdAt: existingUser.createdAt,
        reviewedAt: existingUser.createdAt,
        reviewedByAdminId: existingUser.role === "admin" ? existingUser.id : undefined,
        rejectionReason: undefined,
      };
    }

    const existingRequest = state.accessRequests.find(
      (request) => request.email === normalized.email,
    );
    if (existingRequest) return existingRequest;

    const request: AccessRequest = {
      id: createId("access-request"),
      email: normalized.email,
      displayName: normalized.displayName,
      organizationName: normalized.organizationName,
      requestedRole: "agent",
      status: "pending",
      createdAt: nowIso(),
    };
    state.accessRequests.push(request);
    writeLocalDevState(state);
    return request;
  }

  async listPendingAccessRequests(): Promise<AccessRequest[]> {
    const pendingRequests = readLocalDevState().accessRequests.filter(
      (request) => request.status === "pending",
    );

    return [...pendingRequests].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
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
          displayName: request.displayName,
          organizationName: request.organizationName,
          role: "agent",
          status: "active",
          approvedFromRequestId: request.id,
        }
      : {
          id: createId("agent-user"),
          email: request.email,
          displayName: request.displayName,
          organizationName: request.organizationName,
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
