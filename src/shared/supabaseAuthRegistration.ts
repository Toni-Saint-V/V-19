import { getSupabaseClient } from "../lib/supabase/client";
import type { AccessRequestRow } from "../lib/supabase/database.types";
import { mapSupabasePersistenceError } from "../services/persistenceObservability";
import {
  AuthAccessError,
  normalizeAuthEmail,
  type AccessRequest,
  type AccessRequestRegistrationInput,
  type AccessRequestRepository,
  type User,
} from "./authContract";

type AccessRequestEdgeResult = {
  request?: AccessRequestRow;
};

function mapAccessRequest(row: AccessRequestRow): AccessRequest {
  return {
    city: row.city,
    companyName: row.company_name,
    createdAt: row.created_at,
    email: row.email,
    fullName: row.full_name,
    id: row.id,
    phone: row.phone,
    rejectionReason: row.rejection_reason ?? undefined,
    requestedRole: "agent",
    reviewedAt: row.reviewed_at ?? undefined,
    reviewedByAdminId: row.reviewed_by_admin_id ?? undefined,
    status: row.status,
    userId: row.user_id ?? `pending-${row.email}`,
  };
}

function userFromApprovedRequest(request: AccessRequest): User {
  return {
    approvalStatus: "approved",
    approvedFromRequestId: request.id,
    city: request.city,
    companyName: request.companyName,
    createdAt: request.createdAt,
    email: request.email,
    fullName: request.fullName,
    id: request.userId,
    ownerAgentId: request.userId,
    phone: request.phone,
    role: "agent",
    status: "active",
  };
}

function requireRequest(data: AccessRequestEdgeResult | null): AccessRequest {
  if (!data?.request) {
    throw new AuthAccessError(
      "REQUEST_NOT_FOUND",
      "Supabase не вернул заявку на доступ.",
    );
  }

  return mapAccessRequest(data.request);
}

export class SupabaseAccessRequestAdapter implements AccessRequestRepository {
  async submitAccessRequest(
    input: AccessRequestRegistrationInput,
  ): Promise<AccessRequest> {
    const client = getSupabaseClient();
    if (!client) {
      throw new AuthAccessError(
        "ACCESS_NOT_FOUND",
        "Supabase регистрация недоступна в local/dev режиме.",
      );
    }

    const { data, error } = await client.functions.invoke<AccessRequestEdgeResult>(
      "access-request",
      {
        body: {
          action: "submit",
          input: {
            city: input.city,
            companyName: input.companyName,
            email: normalizeAuthEmail(input.email),
            fullName: input.fullName,
            phone: input.phone,
          },
        },
      },
    );
    if (error) {
      throw mapSupabasePersistenceError(error, {
        operation: "auth.access_request_submit",
        fallbackKind: "auth",
      });
    }

    return requireRequest(data);
  }

  async listPendingAccessRequests(): Promise<AccessRequest[]> {
    const client = getSupabaseClient();
    if (!client) return [];

    const { data, error, status } = await client
      .from("access_requests")
      .select(
        "id,user_id,email,full_name,company_name,city,phone,requested_role,status,created_at,updated_at,reviewed_at,reviewed_by_admin_id,rejection_reason",
      )
      .eq("status", "pending")
      .order("created_at", { ascending: true });
    if (error) {
      throw mapSupabasePersistenceError(error, {
        httpStatus: status,
        operation: "auth.access_requests_list",
        fallbackKind: "database",
      });
    }

    return (data ?? []).map(mapAccessRequest);
  }

  async listAccessRequests(): Promise<AccessRequest[]> {
    const client = getSupabaseClient();
    if (!client) return [];

    const { data, error, status } = await client
      .from("access_requests")
      .select(
        "id,user_id,email,full_name,company_name,city,phone,requested_role,status,created_at,updated_at,reviewed_at,reviewed_by_admin_id,rejection_reason",
      )
      .order("created_at", { ascending: false });
    if (error) {
      throw mapSupabasePersistenceError(error, {
        httpStatus: status,
        operation: "auth.access_requests_list",
        fallbackKind: "database",
      });
    }

    return (data ?? []).map(mapAccessRequest);
  }

  async approveAccessRequest(id: string, adminId: string): Promise<User> {
    void adminId;
    const request = await this.reviewRequest("approve", id);
    return userFromApprovedRequest(request);
  }

  async rejectAccessRequest(
    id: string,
    _adminId: string,
    reason?: string,
  ): Promise<AccessRequest> {
    return this.reviewRequest("reject", id, reason);
  }

  private async reviewRequest(
    action: "approve" | "reject",
    id: string,
    reason?: string,
  ): Promise<AccessRequest> {
    const client = getSupabaseClient();
    if (!client) {
      throw new AuthAccessError(
        "ACCESS_NOT_FOUND",
        "Supabase регистрация недоступна в local/dev режиме.",
      );
    }

    const { data, error } = await client.functions.invoke<AccessRequestEdgeResult>(
      "access-request",
      {
        body: {
          action,
          id,
          reason,
        },
      },
    );
    if (error) {
      throw mapSupabasePersistenceError(error, {
        operation:
          action === "approve"
            ? "auth.access_request_approve"
            : "auth.access_request_reject",
        fallbackKind: "auth",
      });
    }

    return requireRequest(data);
  }
}

export const supabaseAccessRequestRepository = new SupabaseAccessRequestAdapter();
