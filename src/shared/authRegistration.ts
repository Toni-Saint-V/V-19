import type { Role } from "../types/domain";

export type AccessRequestStatus = "pending" | "approved" | "rejected";
export type RequestedRole = "agent";
export type UserStatus = "pending" | "active" | "rejected" | "disabled";

export interface AccessRequestRegistrationInput {
  fullName: string;
  companyName: string;
  city: string;
  phone: string;
  email: string;
  password: string;
}

export interface AccessRequest {
  id: string;
  userId: string;
  email: string;
  fullName: string;
  companyName: string;
  city: string;
  phone: string;
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
  fullName: string;
  companyName: string;
  city: string;
  phone: string;
  role: Role;
  status: UserStatus;
  approvalStatus: AccessRequestStatus;
  createdAt: string;
  ownerAgentId?: string;
  approvedFromRequestId?: string;
  rejectionReason?: string;
  localDevPasswordVerifier?: string;
}

export interface Session {
  userId: string;
  email: string;
  fullName: string;
  companyName: string;
  role: Role;
  status: UserStatus;
  approvalStatus: AccessRequestStatus;
  createdAt: string;
  ownerAgentId?: string;
  rejectionReason?: string;
  expiresAt?: string;
}

export interface AuthRepository {
  submitAccessRequest(input: AccessRequestRegistrationInput): Promise<AccessRequest>;
  loginApprovedUser(email: string, password: string): Promise<Session>;
  logout(): Promise<void>;
  restoreSession(): Promise<Session | null>;
  getCurrentSession(): Promise<Session | null>;
  getCurrentUser(): Promise<User | null>;
}

export interface AccessRequestRepository {
  submitAccessRequest(input: AccessRequestRegistrationInput): Promise<AccessRequest>;
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

type NormalizedAccessRequestInput = Omit<AccessRequestRegistrationInput, "password"> & {
  password: string;
};

const localDevAuthStorageKey = "visaflow.auth.localDev.v1";
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const localDevAgentPassword = "11";
const localDevAdminPassword = "22";
const seededAgentOwnerId = "local-agent-tony";
const seededSecondAgentOwnerId = "local-agent-alex";

function localDevPasswordForRole(role: Role) {
  return role === "admin" ? localDevAdminPassword : localDevAgentPassword;
}

function approvedSeed(
  id: string,
  email: string,
  role: Role,
  fullName: string,
  companyName: string,
  city: string,
  phone: string,
  password: string,
  ownerAgentId?: string,
): User {
  return {
    approvalStatus: "approved",
    city,
    companyName,
    createdAt: "2026-06-28T00:00:00.000Z",
    email,
    fullName,
    id,
    localDevPasswordVerifier: createLocalDevPasswordVerifier(email, password),
    ownerAgentId,
    phone,
    role,
    status: "active",
  };
}

const localDevApprovedUsers: User[] = [
  approvedSeed(
    "admin-local-1",
    "2@2.ru",
    "admin",
    "Local Admin",
    "VisaFlow Ops",
    "Москва",
    "+7 000 000-00-00",
    localDevAdminPassword,
  ),
  approvedSeed(
    "admin-demo-ops",
    "ops@visaflow.demo",
    "admin",
    "Операции",
    "VisaFlow Ops",
    "Москва",
    "+7 000 000-00-01",
    localDevAdminPassword,
  ),
  approvedSeed(
    "agent-local-1",
    "1@1.ru",
    "agent",
    "Татьяна Николаева",
    "Visa Center Spb",
    "Санкт-Петербург",
    "+7 000 000-00-02",
    localDevAgentPassword,
    seededAgentOwnerId,
  ),
  approvedSeed(
    "agent-local-2",
    "agent2@visaflow.local",
    "agent",
    "Алексей Морозов",
    "Mira Travel",
    "Казань",
    "+7 000 000-00-03",
    localDevAgentPassword,
    seededSecondAgentOwnerId,
  ),
];

export class AuthAccessError extends Error {
  constructor(
    readonly code:
      | "INVALID_EMAIL"
      | "INVALID_REGISTRATION"
      | "INVALID_PASSWORD"
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

function assertRequired(value: string, message: string): string {
  const normalized = value.trim();
  if (!normalized) throw new AuthAccessError("INVALID_REGISTRATION", message);
  return normalized;
}

function normalizeAccessRequestInput(
  input: AccessRequestRegistrationInput,
): NormalizedAccessRequestInput {
  return {
    fullName: assertRequired(input.fullName, "Введите имя и фамилию."),
    companyName: assertRequired(input.companyName, "Введите название агентства."),
    city: assertRequired(input.city, "Введите город."),
    phone: assertRequired(input.phone, "Введите телефон."),
    email: assertValidEmail(input.email),
    password: assertRequired(input.password, "Введите пароль."),
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

function createLocalDevPasswordVerifier(email: string, password: string): string {
  const source = `${normalizeAuthEmail(email)}\u001f${password}`;
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return `local-dev-v1:${(hash >>> 0).toString(16).padStart(8, "0")}`;
}

function assertPasswordMatches(user: User, password: string): void {
  const normalizedPassword = password.trim();
  if (!normalizedPassword) {
    throw new AuthAccessError("INVALID_PASSWORD", "Введите пароль.");
  }

  const expectedVerifier = user.localDevPasswordVerifier;
  if (!expectedVerifier) {
    throw new AuthAccessError("INVALID_PASSWORD", "Пароль не настроен.");
  }

  const receivedVerifier = createLocalDevPasswordVerifier(user.email, normalizedPassword);
  if (receivedVerifier !== expectedVerifier) {
    throw new AuthAccessError("INVALID_PASSWORD", "Проверьте email и пароль.");
  }
}

function sessionFromUser(user: User): Session {
  return {
    userId: user.id,
    email: user.email,
    fullName: user.fullName,
    companyName: user.companyName,
    role: user.role,
    status: user.status,
    approvalStatus: user.approvalStatus,
    ownerAgentId: user.ownerAgentId,
    rejectionReason: user.rejectionReason,
    createdAt: user.createdAt,
  };
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
    const parsedUsers = Array.isArray(parsed.users)
      ? parsed.users
          .filter((user) => user?.id && user?.email)
          .map((user): User => ({
            ...user,
            approvalStatus:
              user.approvalStatus ??
              (user.status === "pending"
                ? "pending"
                : user.status === "rejected"
                  ? "rejected"
                  : "approved"),
            companyName: user.companyName ?? "VisaFlow",
            fullName: user.fullName ?? user.email,
            localDevPasswordVerifier:
              user.localDevPasswordVerifier ??
              createLocalDevPasswordVerifier(
                user.email,
                localDevPasswordForRole(user.role === "admin" ? "admin" : "agent"),
              ),
            role: user.role === "admin" ? "admin" : "agent",
            status: user.status ?? "active",
          }))
      : [];
    const users = [
      ...localDevApprovedUsers,
      ...parsedUsers.filter(
        (user) =>
          !localDevApprovedUsers.some((approved) => approved.email === user.email),
      ),
    ];
    const session =
      parsed.session && typeof parsed.session.userId === "string"
        ? (parsed.session as Session)
        : null;

    return {
      accessRequests: Array.isArray(parsed.accessRequests)
        ? parsed.accessRequests
            .filter((request) => request?.id && request?.email)
            .map((request) => ({
              ...request,
              city: request.city ?? "Москва",
              companyName: request.companyName ?? "VisaFlow",
              fullName: request.fullName ?? request.email,
              phone: request.phone ?? "",
              requestedRole: "agent",
              status: request.status ?? "pending",
              userId: request.userId ?? `pending-${request.email}`,
            }))
        : [],
      users,
      session,
    };
  } catch {
    return defaultLocalDevState();
  }
}

function writeLocalDevState(state: LocalDevAuthState): void {
  localStorage.setItem(localDevAuthStorageKey, JSON.stringify(state));
}

function refreshRepeatAccessRequest(
  state: LocalDevAuthState,
  request: AccessRequest,
  normalized: NormalizedAccessRequestInput,
): AccessRequest {
  const refreshedRequest: AccessRequest = {
    ...request,
    city: normalized.city,
    companyName: normalized.companyName,
    email: normalized.email,
    fullName: normalized.fullName,
    phone: normalized.phone,
    requestedRole: "agent",
  };
  const existingUser = state.users.find((user) => user.id === request.userId);
  const refreshedUser: User = {
    ...(existingUser ?? {
      createdAt: request.createdAt,
      id: request.userId,
      role: "agent" as const,
    }),
    approvalStatus: refreshedRequest.status,
    city: normalized.city,
    companyName: normalized.companyName,
    email: normalized.email,
    fullName: normalized.fullName,
    localDevPasswordVerifier: createLocalDevPasswordVerifier(
      normalized.email,
      normalized.password,
    ),
    ownerAgentId: undefined,
    phone: normalized.phone,
    role: "agent",
    status: refreshedRequest.status === "rejected" ? "rejected" : "pending",
    rejectionReason: refreshedRequest.rejectionReason,
  };

  state.accessRequests = state.accessRequests.map((candidate) =>
    candidate.id === request.id ? refreshedRequest : candidate,
  );
  state.users = state.users.filter((candidate) => candidate.id !== refreshedUser.id);
  state.users.push(refreshedUser);
  state.session = sessionFromUser(refreshedUser);
  writeLocalDevState(state);
  return refreshedRequest;
}

export class LocalDevAuthRegistrationAdapter
  implements AuthRepository, AccessRequestRepository, UserRepository, SessionRepository
{
  readonly adapterName = "local/dev";

  async submitAccessRequest(
    input: AccessRequestRegistrationInput,
  ): Promise<AccessRequest> {
    const normalized = normalizeAccessRequestInput(input);
    const state = readLocalDevState();
    const existingUser = state.users.find((user) => user.email === normalized.email);

    if (existingUser?.status === "active" && existingUser.approvalStatus === "approved") {
      return {
        id: `approved-${existingUser.id}`,
        userId: existingUser.id,
        email: normalized.email,
        fullName: existingUser.fullName,
        companyName: existingUser.companyName,
        city: existingUser.city,
        phone: existingUser.phone,
        requestedRole: "agent",
        status: "approved",
        createdAt: existingUser.createdAt,
        reviewedAt: existingUser.createdAt,
        reviewedByAdminId: existingUser.role === "admin" ? existingUser.id : undefined,
        rejectionReason: undefined,
      };
    }

    const existingRequest = state.accessRequests
      .filter((request) => request.email === normalized.email)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0];
    if (existingRequest) {
      if (
        existingRequest.status === "pending" ||
        existingRequest.status === "rejected"
      ) {
        return refreshRepeatAccessRequest(state, existingRequest, normalized);
      }
      return existingRequest;
    }

    const createdAt = nowIso();
    const user: User = {
      id: createId("agent-user"),
      email: normalized.email,
      fullName: normalized.fullName,
      companyName: normalized.companyName,
      city: normalized.city,
      phone: normalized.phone,
      role: "agent",
      status: "pending",
      approvalStatus: "pending",
      createdAt,
      localDevPasswordVerifier: createLocalDevPasswordVerifier(
        normalized.email,
        normalized.password,
      ),
    };
    const request: AccessRequest = {
      id: createId("access-request"),
      userId: user.id,
      email: normalized.email,
      fullName: normalized.fullName,
      companyName: normalized.companyName,
      city: normalized.city,
      phone: normalized.phone,
      requestedRole: "agent",
      status: "pending",
      createdAt,
    };

    state.users.push(user);
    state.accessRequests.push(request);
    state.session = sessionFromUser(user);
    writeLocalDevState(state);
    return request;
  }

  async listPendingAccessRequests(): Promise<AccessRequest[]> {
    return [...readLocalDevState().accessRequests]
      .filter((request) => request.status === "pending")
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
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

    const existingUser = state.users.find((user) => user.id === request.userId);
    const user: User = existingUser
      ? {
          ...existingUser,
          fullName: request.fullName,
          companyName: request.companyName,
          city: request.city,
          phone: request.phone,
          role: "agent",
          status: "active",
          approvalStatus: "approved",
          ownerAgentId: existingUser.ownerAgentId ?? existingUser.id,
          approvedFromRequestId: request.id,
          rejectionReason: undefined,
        }
      : {
          id: request.userId,
          email: request.email,
          fullName: request.fullName,
          companyName: request.companyName,
          city: request.city,
          phone: request.phone,
          role: "agent",
          status: "active",
          approvalStatus: "approved",
          ownerAgentId: request.userId,
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

    const rejectionReason = reason?.trim() || undefined;
    request.status = "rejected";
    request.reviewedAt = nowIso();
    request.reviewedByAdminId = adminId;
    request.rejectionReason = rejectionReason;

    const existingUser = state.users.find((user) => user.id === request.userId);
    if (existingUser) {
      const rejectedUser: User = {
        ...existingUser,
        status: "rejected",
        approvalStatus: "rejected",
        ownerAgentId: undefined,
        rejectionReason,
      };
      state.users = state.users.filter((candidate) => candidate.id !== rejectedUser.id);
      state.users.push(rejectedUser);
    }

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

  async loginApprovedUser(email: string, password: string): Promise<Session> {
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
          "Заявка отправлена. Доступ появится после подтверждения администратором.",
        );
      }
      if (latestRequest?.status === "rejected") {
        throw new AuthAccessError(
          "ACCESS_REJECTED",
          latestRequest.rejectionReason
            ? `Заявка отклонена: ${latestRequest.rejectionReason}`
            : "Заявка отклонена.",
        );
      }
      throw new AuthAccessError(
        "ACCESS_NOT_FOUND",
        "Почта не найдена в списке доступа.",
      );
    }

    assertPasswordMatches(user, password);

    const session = sessionFromUser(user);
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
    if (!user || user.status === "disabled") {
      state.session = null;
      writeLocalDevState(state);
      return null;
    }
    const refreshedSession = sessionFromUser(user);
    state.session = refreshedSession;
    writeLocalDevState(state);
    return refreshedSession;
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
  if (
    !admin ||
    admin.role !== "admin" ||
    admin.status !== "active" ||
    admin.approvalStatus !== "approved"
  ) {
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
