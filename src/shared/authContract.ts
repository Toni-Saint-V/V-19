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
