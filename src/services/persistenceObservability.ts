export type SupabasePersistenceOperation =
  | "auth.get_session"
  | "auth.sign_in_password"
  | "auth.sign_up_password"
  | "profile.read"
  | "profile.upsert"
  | "submissions.list"
  | "applicants.list"
  | "questionnaire_answers.list"
  | "media_assets.list"
  | "corrections.list"
  | "appointments.list"
  | "export_batches.insert"
  | "export_batches.list"
  | "export_batches.read_duplicate"
  | "rpc.complete_export_package"
  | "rpc.publish_returned_pdf_handoff"
  | "rpc.upsert_questionnaire_answers"
  | "status_history.list"
  | "status_history.insert"
  | "rpc.save_submission_draft"
  | "rpc.submit_corrections_handoff"
  | "storage.upload_media"
  | "storage.delete_media"
  | "storage.create_signed_url";

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
  database: "Supabase data could not be loaded. No private details were exposed.",
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
  if (operation === "storage.upload_media") return "upload";
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

function safeCodeFor(
  operation: SupabasePersistenceOperation,
  kind: PersistenceFailureKind,
  supabaseCode: string | undefined,
  status: number | undefined,
): string {
  const code = supabaseCode ?? (status ? `HTTP_${status}` : "UNKNOWN");
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
  const diagnostics: PersistenceFailureDiagnostics = {
    operation: context.operation,
    kind,
    safeCode: safeCodeFor(context.operation, kind, supabaseCode, status),
    retryable: isRetryableStatus(status),
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
