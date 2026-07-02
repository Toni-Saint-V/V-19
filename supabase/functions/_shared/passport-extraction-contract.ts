export const passportExtractionFields = [
  "firstName",
  "surname",
  "birthDate",
  "birthPlace",
  "birthCountry",
  "citizenship",
  "gender",
  "passportType",
  "passportNumber",
  "passportIssuePlace",
  "passportIssueCountry",
  "passportIssuedAt",
  "passportExpiresAt",
] as const;

export type PassportExtractionFieldKey = (typeof passportExtractionFields)[number];
export type PassportExtractionConfidence = "low" | "medium" | "high";
export type PassportExtractionRole = "agent" | "admin";

export interface PassportExtractionActor {
  id: string;
  role: PassportExtractionRole;
}

export interface PassportDocumentRef {
  bucket: "submission-media";
  path: string;
  mimeType: "image/jpeg" | "image/png" | "application/pdf";
  sizeBytes: number;
}

export interface PassportExtractionRequest {
  actor: PassportExtractionActor;
  document: PassportDocumentRef;
  applicantIndex?: number;
  requestId?: string;
  submissionId?: string;
}

export interface PassportExtractionClientRequest {
  document: PassportDocumentRef;
  applicantIndex?: number;
  requestId?: string;
  submissionId?: string;
}

export interface PassportExtractionField {
  confidence: PassportExtractionConfidence;
  key: PassportExtractionFieldKey;
  needsManualReview: boolean;
  value: string;
}

export interface PassportExtractionOrientation {
  corrected: boolean;
  reason: "mrz_detected";
  rotation: 0 | 90 | 180 | 270;
}

export interface PassportExtractionResult {
  applicantIndex?: number;
  confidence: PassportExtractionConfidence;
  fields: PassportExtractionField[];
  guardrails: string[];
  needsManualReview: boolean;
  orientation?: PassportExtractionOrientation;
  source: "edge-provider" | "edge-stub" | "local-ocr";
  status: "extracted" | "unavailable";
  summary: string;
}

export interface PassportExtractionAuditEvent {
  actorId?: string;
  actorRole?: PassportExtractionRole;
  createdAt: string;
  event:
    | "passport_extraction_invoked"
    | "passport_extraction_denied"
    | "passport_extraction_provider_failed"
    | "passport_extraction_output_rejected";
  metadata?: Record<string, boolean | number | string | null>;
  reason: string;
  requestId?: string;
}

export type PassportExtractionContractResult<T> =
  | { ok: true; data: T }
  | { ok: false; safeMessage: string; status: number };

export interface PassportExtractionAuditStore {
  record(event: PassportExtractionAuditEvent): Promise<void>;
}

export interface PassportExtractionProvider {
  extract(request: PassportExtractionRequest): Promise<unknown>;
}

export interface PassportDocumentPathParts {
  applicantId: string;
  fileName: string;
  submissionId: string;
}

export const passportExtractionGuardrails = [
  "Данные из паспорта нужно проверить вручную.",
  "Распознавание не является официальной проверкой.",
  "Пустые или сомнительные поля остаются незаполненными.",
] as const;

const allowedMimeTypes = new Set(["image/jpeg", "image/png", "application/pdf"]);
const fieldKeys = new Set<string>(passportExtractionFields);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parsePassportExtractionRequest(
  value: unknown,
): PassportExtractionContractResult<PassportExtractionClientRequest> {
  if (!isRecord(value)) {
    return {
      ok: false,
      safeMessage: "Passport extraction request is invalid.",
      status: 400,
    };
  }
  if (!isRecord(value.document)) {
    return {
      ok: false,
      safeMessage: "Passport document reference is required.",
      status: 400,
    };
  }

  const document = value.document;
  if (
    document.bucket !== "submission-media" ||
    typeof document.path !== "string" ||
    !parsePassportDocumentPath(document.path).ok ||
    !allowedMimeTypes.has(String(document.mimeType)) ||
    typeof document.sizeBytes !== "number" ||
    !Number.isFinite(document.sizeBytes) ||
    document.sizeBytes <= 0 ||
    document.sizeBytes > 50 * 1024 * 1024
  ) {
    return {
      ok: false,
      safeMessage: "Passport document reference is unsafe.",
      status: 400,
    };
  }

  return {
    ok: true,
    data: {
      applicantIndex:
        typeof value.applicantIndex === "number" &&
        Number.isInteger(value.applicantIndex)
          ? value.applicantIndex
          : undefined,
      document: {
        bucket: "submission-media",
        path: document.path,
        mimeType: document.mimeType as PassportDocumentRef["mimeType"],
        sizeBytes: document.sizeBytes,
      },
      requestId: typeof value.requestId === "string" ? value.requestId : undefined,
      submissionId:
        typeof value.submissionId === "string" ? value.submissionId : undefined,
    },
  };
}

export function evaluatePassportExtractionAccess(
  request: PassportExtractionRequest,
): PassportExtractionContractResult<PassportExtractionRequest> {
  return { ok: true, data: request };
}

export function parsePassportDocumentPath(
  path: string,
): PassportExtractionContractResult<PassportDocumentPathParts> {
  const parts = path.split("/");
  if (parts.length !== 4) {
    return {
      ok: false,
      safeMessage: "Passport document path is invalid.",
      status: 400,
    };
  }

  const [submissionId, applicantId, slot, fileName] = parts;
  if (
    !safePathSegment(submissionId) ||
    !safePathSegment(applicantId) ||
    slot !== "passport_scan" ||
    !safePathSegment(fileName)
  ) {
    return {
      ok: false,
      safeMessage: "Passport document path is invalid.",
      status: 400,
    };
  }

  return {
    ok: true,
    data: {
      applicantId,
      fileName,
      submissionId,
    },
  };
}

function safePathSegment(value: string | undefined) {
  return typeof value === "string" && /^[\p{L}\p{N}_.-]+$/u.test(value);
}

export function parsePassportExtractionResult(
  value: unknown,
): PassportExtractionContractResult<PassportExtractionResult> {
  if (!isRecord(value) || !Array.isArray(value.fields)) {
    return {
      ok: false,
      safeMessage: "Passport extraction result is invalid.",
      status: 502,
    };
  }
  if (value.status !== "extracted" && value.status !== "unavailable") {
    return {
      ok: false,
      safeMessage: "Passport extraction status is invalid.",
      status: 502,
    };
  }
  if (
    value.source !== "edge-provider" &&
    value.source !== "edge-stub" &&
    value.source !== "local-ocr"
  ) {
    return {
      ok: false,
      safeMessage: "Passport extraction source is invalid.",
      status: 502,
    };
  }
  if (value.needsManualReview === false) {
    return {
      ok: false,
      safeMessage: "Passport extraction manual review is required.",
      status: 502,
    };
  }

  const fields: PassportExtractionField[] = [];
  for (const field of value.fields) {
    if (!isRecord(field)) {
      return {
        ok: false,
        safeMessage: "Passport extraction field is invalid.",
        status: 502,
      };
    }
    if (
      typeof field.key !== "string" ||
      !fieldKeys.has(field.key) ||
      typeof field.value !== "string" ||
      (field.confidence !== "low" &&
        field.confidence !== "medium" &&
        field.confidence !== "high") ||
      field.needsManualReview !== true
    ) {
      return {
        ok: false,
        safeMessage: "Passport extraction field is incomplete.",
        status: 502,
      };
    }
    fields.push({
      confidence: field.confidence,
      key: field.key as PassportExtractionFieldKey,
      needsManualReview: field.needsManualReview,
      value: field.value.trim(),
    });
  }

  let orientation: PassportExtractionOrientation | undefined;
  if (isRecord(value.orientation)) {
    if (
      (value.orientation.rotation !== 0 &&
        value.orientation.rotation !== 90 &&
        value.orientation.rotation !== 180 &&
        value.orientation.rotation !== 270) ||
      typeof value.orientation.corrected !== "boolean" ||
      value.orientation.reason !== "mrz_detected"
    ) {
      return {
        ok: false,
        safeMessage: "Passport extraction orientation is invalid.",
        status: 502,
      };
    }
    orientation = {
      corrected: value.orientation.corrected,
      reason: "mrz_detected",
      rotation: value.orientation.rotation,
    };
  }

  return {
    ok: true,
    data: {
      applicantIndex:
        typeof value.applicantIndex === "number" &&
        Number.isInteger(value.applicantIndex)
          ? value.applicantIndex
          : undefined,
      confidence: validatedConfidence(value.confidence, value.status),
      fields: fields.filter((field) => field.value),
      guardrails: validatedGuardrails(value.guardrails),
      needsManualReview: true,
      orientation,
      source: value.source,
      status: value.status,
      summary:
        typeof value.summary === "string"
          ? value.summary
          : "Данные паспорта подготовлены для ручной проверки.",
    },
  };
}

export function safeUnavailablePassportExtractionResult(
  applicantIndex?: number,
): PassportExtractionResult {
  return {
    applicantIndex,
    confidence: "low",
    fields: [],
    guardrails: [...passportExtractionGuardrails],
    needsManualReview: true,
    source: "edge-stub",
    status: "unavailable",
    summary:
      "Данные не удалось распознать автоматически. Требуется ручная проверка. Проверьте данные вручную.",
  };
}

function validatedConfidence(
  value: unknown,
  status: unknown,
): PassportExtractionConfidence {
  if (value === "low" || value === "medium" || value === "high") return value;
  return status === "extracted" ? "medium" : "low";
}

export function passportExtractionAuditEvent(
  event: PassportExtractionAuditEvent["event"],
  reason: string,
  request?: Partial<PassportExtractionRequest>,
  createdAt = new Date().toISOString(),
  metadata: Record<string, boolean | number | string | null> = {},
): PassportExtractionAuditEvent {
  return {
    actorId: request?.actor?.id,
    actorRole: request?.actor?.role,
    createdAt,
    event,
    metadata: {
      ...metadata,
    },
    reason,
    requestId: request?.requestId,
  };
}

function validatedGuardrails(value: unknown) {
  if (!Array.isArray(value)) return [...passportExtractionGuardrails];

  const providerGuardrails = value
    .filter((item): item is string => typeof item === "string")
    .map((item) => item.trim())
    .filter(Boolean);

  return [...new Set([...passportExtractionGuardrails, ...providerGuardrails])];
}
