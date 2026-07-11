export type SupabasePersistenceOperation =
  | "auth.get_session"
  | "auth.reset_password"
  | "auth.access_request_approve"
  | "auth.access_request_reject"
  | "auth.access_request_submit"
  | "auth.access_requests_list"
  | "auth.sign_in_password"
  | "auth.sign_up_password"
  | "admin_pdf_artifacts.list"
  | "admin_pdf_artifacts.upsert"
  | "profile.read"
  | "profile.upsert"
  | "submissions.list"
  | "applicants.list"
  | "questionnaire_answers.list"
  | "media_assets.list"
  | "document_assets.get_applicant_documents"
  | "document_assets.get_ready_for_export"
  | "document_assets.mark_exported"
  | "document_assets.restore_ready_for_export"
  | "document_export_events.find_existing"
  | "document_export_events.insert"
  | "corrections.list"
  | "appointments.list"
  | "export_batches.insert"
  | "export_batches.list"
  | "export_batches.read_duplicate"
  | "export_batch_members.list"
  | "rpc.complete_export_package"
  | "rpc.publish_returned_pdf_handoff"
  | "rpc.start_agent_return_package"
  | "rpc.publish_agent_return_package"
  | "rpc.upsert_questionnaire_answers"
  | "status_history.list"
  | "status_history.insert"
  | "rpc.save_submission_draft"
  | "rpc.submit_corrections_handoff"
  | "storage.upload_media"
  | "storage.upload_agent_return_package_artifact"
  | "storage.delete_media"
  | "storage.create_signed_url"
  | "storage.create_agent_return_package_signed_url"
  | "agent_return_packages.list_published"
  | "agent_return_package_artifacts.list"
  | "agent_return_package_artifacts.read_slot"
  | "agent_return_package_artifacts.list_published"
  | "agent_return_package_artifacts.save"
  | "storage.download_media";

export type PersistenceFailureKind =
  | "auth"
  | "database"
  | "rls"
  | "rpc"
  | "save"
  | "storage"
  | "upload"
  | "unknown";

export interface PersistenceFailureDiagnostics {
  operation: SupabasePersistenceOperation;
  kind: PersistenceFailureKind;
  safeCode: string;
  retryable: boolean;
  httpStatus?: number;
  supabaseCode?: string;
  sourceName?: string;
}

interface PersistenceFailureContext {
  operation: SupabasePersistenceOperation;
  fallbackKind?: PersistenceFailureKind;
}

interface SupabaseErrorShape {
  name?: unknown;
  message?: unknown;
  code?: unknown;
  status?: unknown;
  statusCode?: unknown;
}

const userMessages: Record<PersistenceFailureKind, string> = {
  auth: "Unable to sign in. Check email, password, and Supabase profile.",
  database:
    "Supabase data could not be loaded. No private details were exposed.",
  rls: "Access was denied by Supabase policy. Ask an operator to confirm access.",
  rpc: "Supabase could not complete the save request. Try again after reload.",
  save: "Remote save failed. Last saved Supabase data was reloaded.",
  storage: "Supabase storage could not complete the file action.",
  upload: "Media upload failed. No uploaded file was marked complete.",
  unknown: "Supabase request failed. Try again after reload.",
};

export class PersistenceObservableError extends Error {
  readonly diagnostics: PersistenceFailureDiagnostics;
  readonly userMessage: string;

  constructor(
    message: string,
    diagnostics: PersistenceFailureDiagnostics,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "PersistenceObservableError";
    this.diagnostics = diagnostics;
    this.userMessage = userMessages[diagnostics.kind];
  }
}

function readErrorShape(error: unknown): SupabaseErrorShape {
  if (!error || typeof error !== "object") return {};
  const record = error as Record<string, unknown>;
  return {
    name: record.name,
    message: record.message,
    code: record.code,
    status: record.status,
    statusCode: record.statusCode,
  };
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function numericStatus(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value)) return value;
  if (typeof value === "string" && /^\d+$/.test(value)) return Number(value);
  return undefined;
}

function kindForOperation(
  operation: SupabasePersistenceOperation,
  fallbackKind: PersistenceFailureKind | undefined,
): PersistenceFailureKind {
  if (operation.startsWith("auth.")) return "auth";
  if (operation === "rpc.save_submission_draft") return "save";
  if (
    operation === "storage.upload_media" ||
    operation === "storage.upload_agent_return_package_artifact"
  ) {
    return "upload";
  }
  if (operation.startsWith("storage.")) return "storage";
  return fallbackKind ?? "database";
}

function isRlsDenied(shape: SupabaseErrorShape): boolean {
  const code = stringValue(shape.code);
  const status = numericStatus(shape.status) ?? numericStatus(shape.statusCode);
  const message = stringValue(shape.message)?.toLowerCase() ?? "";

  return (
    status === 401 ||
    status === 403 ||
    code === "42501" ||
    code === "PGRST301" ||
    message.includes("row-level security") ||
    message.includes("rls") ||
    message.includes("permission denied") ||
    message.includes("not authorized")
  );
}

function isRetryableStatus(status: number | undefined): boolean {
  return (
    status === 408 ||
    status === 409 ||
    status === 425 ||
    status === 429 ||
    (typeof status === "number" && status >= 500)
  );
}

function isNetworkOrTimeoutFailure(shape: SupabaseErrorShape): boolean {
  const name = stringValue(shape.name)?.toLowerCase() ?? "";
  const message = stringValue(shape.message)?.toLowerCase() ?? "";

  return (
    name.includes("fetch") ||
    name.includes("network") ||
    name.includes("timeout") ||
    message.includes("failed to fetch") ||
    message.includes("fetch failed") ||
    message.includes("networkerror") ||
    message.includes("load failed") ||
    message.includes("timed out") ||
    message.includes("timeout") ||
    message.includes("err_timed_out")
  );
}

function safeCodeFor(
  operation: SupabasePersistenceOperation,
  kind: PersistenceFailureKind,
  supabaseCode: string | undefined,
  status: number | undefined,
  networkOrTimeoutFailure = false,
): string {
  const code =
    supabaseCode ??
    (status
      ? `HTTP_${status}`
      : networkOrTimeoutFailure
        ? "NETWORK"
        : "UNKNOWN");
  return `${operation}:${kind}:${code}`;
}

export function mapSupabasePersistenceError(
  error: unknown,
  context: PersistenceFailureContext,
): PersistenceObservableError {
  if (error instanceof PersistenceObservableError) return error;

  const shape = readErrorShape(error);
  const status = numericStatus(shape.status) ?? numericStatus(shape.statusCode);
  const supabaseCode = stringValue(shape.code);
  const sourceName = stringValue(shape.name);
  const baseKind = kindForOperation(context.operation, context.fallbackKind);
  const kind = isRlsDenied(shape) ? "rls" : baseKind;
  const networkOrTimeoutFailure = isNetworkOrTimeoutFailure(shape);
  const diagnostics: PersistenceFailureDiagnostics = {
    operation: context.operation,
    kind,
    safeCode: safeCodeFor(
      context.operation,
      kind,
      supabaseCode,
      status,
      networkOrTimeoutFailure,
    ),
    retryable: isRetryableStatus(status) || networkOrTimeoutFailure,
    ...(status ? { httpStatus: status } : {}),
    ...(supabaseCode ? { supabaseCode } : {}),
    ...(sourceName ? { sourceName } : {}),
  };

  return new PersistenceObservableError(
    `${context.operation} failed safely (${diagnostics.safeCode}).`,
    diagnostics,
    { cause: error },
  );
}

export function userMessageForPersistenceError(
  error: unknown,
  fallback: string,
): string {
  if (error instanceof PersistenceObservableError) return error.userMessage;
  return fallback;
}

export function safeDiagnosticsForPersistenceError(
  error: unknown,
): PersistenceFailureDiagnostics | null {
  if (error instanceof PersistenceObservableError) return error.diagnostics;
  return null;
}

export function formatPersistenceFailureForUser(
  error: unknown,
  fallback: string,
): string {
  const message = userMessageForPersistenceError(error, fallback);
  const diagnostics = safeDiagnosticsForPersistenceError(error);

  if (!diagnostics) return message;
  return `${message} Reference: ${diagnostics.safeCode}.`;
}

export function logPersistenceDiagnostics(label: string, error: unknown): void {
  const diagnostics = safeDiagnosticsForPersistenceError(error);
  if (diagnostics) {
    console.error(label, diagnostics);
    return;
  }

  console.error(label, {
    operation: "unknown",
    kind: "unknown",
    safeCode: "unknown:unknown:UNKNOWN",
    retryable: false,
  });
}
