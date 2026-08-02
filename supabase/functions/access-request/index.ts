import { createClient } from "npm:@supabase/supabase-js@2";
import { resolveAccessRequestUserId } from "../_shared/accessRequestProvisioning.ts";

type AccessRequestAction = "approve" | "reject" | "submit";

type AccessRequestInput = {
  city?: unknown;
  companyName?: unknown;
  email?: unknown;
  fullName?: unknown;
  phone?: unknown;
};

type RequestBody = {
  action?: unknown;
  id?: unknown;
  input?: AccessRequestInput;
  reason?: unknown;
};

declare const Deno: {
  env: {
    get(key: string): string | undefined;
  };
  serve(handler: (request: Request) => Response | Promise<Response>): void;
};

const corsHeaders = {
  "access-control-allow-headers": "authorization, x-client-info, apikey, content-type",
  "access-control-allow-methods": "POST, OPTIONS",
  "access-control-allow-origin": "*",
};

const accessRequestSelect =
  "id,user_id,email,full_name,company_name,city,phone,requested_role,status,created_at,updated_at,reviewed_at,reviewed_by_admin_id,rejection_reason";

function jsonResponse(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    headers: {
      ...corsHeaders,
      "content-type": "application/json",
    },
    status,
  });
}

function requiredString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeEmail(value: unknown): string {
  return requiredString(value).toLowerCase();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

type ClaimedAccessRequest = {
  city: string;
  company_name: string;
  email: string;
  full_name: string;
  id: string;
  phone: string;
  status: string;
  user_id: string | null;
};

function requireClaimedAccessRequest(value: unknown): ClaimedAccessRequest {
  if (
    !isRecord(value) ||
    typeof value.city !== "string" ||
    typeof value.company_name !== "string" ||
    typeof value.email !== "string" ||
    typeof value.full_name !== "string" ||
    typeof value.id !== "string" ||
    typeof value.phone !== "string" ||
    typeof value.status !== "string" ||
    (value.user_id !== null && typeof value.user_id !== "string")
  ) {
    throw new Error("INVALID_ACCESS_REVIEW_CLAIM");
  }
  return value as ClaimedAccessRequest;
}

function adminKey(): string {
  const direct = Deno.env.get("SUPABASE_FUNCTION_ADMIN_KEY")?.trim();
  if (direct) return direct;

  const secretKeys = Deno.env.get("SUPABASE_SECRET_KEYS")?.trim();
  if (secretKeys) {
    try {
      const parsed = JSON.parse(secretKeys) as Record<string, unknown>;
      const defaultKey = parsed.default;
      if (typeof defaultKey === "string" && defaultKey.trim()) {
        return defaultKey.trim();
      }
    } catch {
      // Fall through to the hosted legacy server-only key.
    }
  }

  return Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")?.trim() ?? "";
}

function supabaseAdmin() {
  const url = Deno.env.get("SUPABASE_URL")?.trim();
  const key = adminKey();
  if (!url || !key) return null;

  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function assertRegistrationInput(input: AccessRequestInput | undefined) {
  const normalized = {
    city: requiredString(input?.city),
    companyName: requiredString(input?.companyName),
    email: normalizeEmail(input?.email),
    fullName: requiredString(input?.fullName),
    phone: requiredString(input?.phone),
  };

  if (
    !normalized.city ||
    !normalized.companyName ||
    !normalized.fullName ||
    !normalized.phone ||
    !isValidEmail(normalized.email)
  ) {
    throw new Error("INVALID_REGISTRATION");
  }

  return normalized;
}

function publicAccessRequestResponse(
  input: ReturnType<typeof assertRegistrationInput>,
) {
  const nowIso = new Date().toISOString();
  return jsonResponse(200, {
    request: {
      city: input.city,
      company_name: input.companyName,
      created_at: nowIso,
      email: input.email,
      full_name: input.fullName,
      id: `submitted-${input.email.replace(/[^a-z0-9._-]/g, "-")}`,
      phone: input.phone,
      rejection_reason: null,
      requested_role: "agent",
      reviewed_at: null,
      reviewed_by_admin_id: null,
      status: "pending",
      updated_at: nowIso,
      user_id: null,
    },
  });
}

async function requireAdminProfile(
  admin: ReturnType<typeof supabaseAdmin>,
  request: Request,
) {
  if (!admin) throw new Error("SUPABASE_ADMIN_UNAVAILABLE");

  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) throw new Error("AUTH_REQUIRED");

  const { data: userData, error: userError } = await admin.auth.getUser(token);
  if (userError || !userData.user?.id) throw new Error("AUTH_REQUIRED");

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id,role")
    .eq("id", userData.user.id)
    .maybeSingle();
  if (profileError || profile?.role !== "admin") throw new Error("ADMIN_REQUIRED");

  return userData.user.id;
}

async function handleSubmit(
  admin: ReturnType<typeof supabaseAdmin>,
  input: AccessRequestInput | undefined,
) {
  if (!admin)
    return jsonResponse(503, { error: "Supabase admin client is unavailable." });

  const normalized = assertRegistrationInput(input);
  const { data: existingProfile, error: profileError } = await admin
    .from("profiles")
    .select("id")
    .eq("email", normalized.email)
    .maybeSingle();
  if (profileError) throw profileError;
  if (existingProfile) {
    return publicAccessRequestResponse(normalized);
  }

  const { data: pendingRequest, error: pendingError } = await admin
    .from("access_requests")
    .select("id")
    .eq("email", normalized.email)
    .eq("status", "pending")
    .maybeSingle();
  if (pendingError) throw pendingError;

  if (pendingRequest) {
    return publicAccessRequestResponse(normalized);
  }

  const { data: rejectedRequest, error: rejectedError } = await admin
    .from("access_requests")
    .select("id")
    .eq("email", normalized.email)
    .eq("status", "rejected")
    .order("reviewed_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (rejectedError) throw rejectedError;

  if (rejectedRequest) {
    const nowIso = new Date().toISOString();
    const { data: resubmittedRequest, error: resubmitError } = await admin
      .from("access_requests")
      .update({
        city: normalized.city,
        company_name: normalized.companyName,
        full_name: normalized.fullName,
        phone: normalized.phone,
        rejection_reason: null,
        reviewed_at: null,
        reviewed_by_admin_id: null,
        status: "pending",
        updated_at: nowIso,
      })
      .eq("id", rejectedRequest.id)
      .eq("status", "rejected")
      .select(accessRequestSelect)
      .single();
    if (resubmitError) throw resubmitError;

    return jsonResponse(200, { request: resubmittedRequest });
  }

  const { error: createRequestError } = await admin
    .from("access_requests")
    .insert({
      city: normalized.city,
      company_name: normalized.companyName,
      email: normalized.email,
      full_name: normalized.fullName,
      phone: normalized.phone,
      requested_role: "agent",
      status: "pending",
    })
    .select("id")
    .single();
  if (createRequestError) {
    const duplicateCode =
      typeof createRequestError === "object" && createRequestError
        ? (createRequestError as { code?: unknown }).code
        : null;
    if (duplicateCode !== "23505") throw createRequestError;
  }

  return publicAccessRequestResponse(normalized);
}

async function handleApprove(
  admin: ReturnType<typeof supabaseAdmin>,
  request: Request,
  id: unknown,
) {
  const adminId = await requireAdminProfile(admin, request);
  const requestId = requiredString(id);
  if (!requestId) return jsonResponse(400, { error: "Request id is required." });

  const operationId = crypto.randomUUID();
  const { data: claimedAccessRequest, error: claimError } = await admin.rpc(
    "claim_access_request_review",
    {
      p_action: "approve",
      p_admin_id: adminId,
      p_operation_id: operationId,
      p_request_id: requestId,
    },
  );
  if (claimError) throw claimError;
  const accessRequest = requireClaimedAccessRequest(claimedAccessRequest);
  if (accessRequest?.status === "approved") {
    return jsonResponse(200, { request: accessRequest });
  }

  const approvedUserId =
    accessRequest.user_id ??
    (await resolveAccessRequestUserId(admin.auth.admin, accessRequest.email, {
      city: accessRequest.city,
      display_name: accessRequest.full_name,
      organization_name: accessRequest.company_name,
      password_setup_required: true,
      phone: accessRequest.phone,
    }));

  const { data: updatedRequest, error: finalizeError } = await admin.rpc(
    "finalize_access_request_review",
    {
      p_action: "approve",
      p_admin_id: adminId,
      p_operation_id: operationId,
      p_rejection_reason: null,
      p_request_id: accessRequest.id,
      p_user_id: approvedUserId,
    },
  );
  if (finalizeError) throw finalizeError;

  return jsonResponse(200, { request: updatedRequest });
}

async function handleReject(
  admin: ReturnType<typeof supabaseAdmin>,
  request: Request,
  id: unknown,
  reason: unknown,
) {
  const adminId = await requireAdminProfile(admin, request);
  const requestId = requiredString(id);
  if (!requestId) return jsonResponse(400, { error: "Request id is required." });

  const operationId = crypto.randomUUID();
  const { data: claimedAccessRequest, error: claimError } = await admin.rpc(
    "claim_access_request_review",
    {
      p_action: "reject",
      p_admin_id: adminId,
      p_operation_id: operationId,
      p_request_id: requestId,
    },
  );
  if (claimError) throw claimError;
  const accessRequest = requireClaimedAccessRequest(claimedAccessRequest);
  if (accessRequest?.status === "rejected") {
    return jsonResponse(200, { request: accessRequest });
  }

  const { data: updatedRequest, error: finalizeError } = await admin.rpc(
    "finalize_access_request_review",
    {
      p_action: "reject",
      p_admin_id: adminId,
      p_operation_id: operationId,
      p_rejection_reason: requiredString(reason) || null,
      p_request_id: requestId,
      p_user_id: null,
    },
  );
  if (finalizeError) throw finalizeError;

  return jsonResponse(200, { request: updatedRequest });
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method === "GET" && new URL(request.url).pathname.endsWith("/health")) {
    const admin = supabaseAdmin();
    const healthRead = admin
      ? await admin.from("profiles").select("id", { count: "exact", head: true })
      : { error: new Error("Supabase admin client is unavailable.") };
    const ready = Boolean(admin && !healthRead.error);
    return jsonResponse(ready ? 200 : 503, {
      capability: "registration-ready",
      function: "access-request",
      status: ready ? "ok" : "blocked",
    });
  }
  if (request.method !== "POST")
    return jsonResponse(405, { error: "Method not allowed." });

  try {
    const body = (await request.json()) as RequestBody;
    const action = body.action as AccessRequestAction;
    const admin = supabaseAdmin();

    if (action === "submit") return await handleSubmit(admin, body.input);
    if (action === "approve") return await handleApprove(admin, request, body.id);
    if (action === "reject") {
      return await handleReject(admin, request, body.id, body.reason);
    }

    return jsonResponse(400, { error: "Unknown access request action." });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    const errorCode = isRecord(error) ? error.code : undefined;
    if (message === "AUTH_REQUIRED")
      return jsonResponse(401, { error: "AUTH_REQUIRED" });
    if (message === "ADMIN_REQUIRED")
      return jsonResponse(403, { error: "ADMIN_REQUIRED" });
    if (message === "SUPABASE_ADMIN_UNAVAILABLE") {
      return jsonResponse(503, { error: "Supabase admin client is unavailable." });
    }
    if (message === "INVALID_REGISTRATION") {
      return jsonResponse(400, { error: "Invalid registration input." });
    }
    if (message === "Request id is required.") {
      return jsonResponse(400, { error: message });
    }
    if (errorCode === "40001") {
      return jsonResponse(409, { error: "ACCESS_REVIEW_CONFLICT" });
    }

    return jsonResponse(503, { error: "Access request action failed; retry safely." });
  }
});
