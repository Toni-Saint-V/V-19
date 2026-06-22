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

export interface PassportDocumentRef {
  bucket: "submission-media";
  path: string;
  mimeType: "image/jpeg" | "image/png" | "application/pdf";
  sizeBytes: number;
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
  fields: PassportExtractionField[];
  guardrails: string[];
  openAiAttempted?: boolean;
  orientation?: PassportExtractionOrientation;
  source: "edge-provider" | "edge-stub" | "local-ocr" | "openai-vision";
  status: "extracted" | "unavailable";
  summary: string;
}

export type PassportExtractionContractResult<T> =
  | { ok: true; data: T }
  | { ok: false; safeMessage: string; status: number };

export const passportExtractionGuardrails = [
  "Данные из паспорта нужно проверить вручную.",
  "Распознавание не является официальной проверкой.",
  "Пустые или сомнительные поля остаются незаполненными.",
] as const;

const fieldKeys = new Set<string>(passportExtractionFields);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
    value.source !== "local-ocr" &&
    value.source !== "openai-vision"
  ) {
    return {
      ok: false,
      safeMessage: "Passport extraction source is invalid.",
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
      typeof field.needsManualReview !== "boolean"
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
      fields: fields.filter((field) => field.value),
      guardrails: validatedGuardrails(value.guardrails),
      openAiAttempted:
        typeof value.openAiAttempted === "boolean"
          ? value.openAiAttempted
          : value.source === "openai-vision",
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
    fields: [],
    guardrails: [...passportExtractionGuardrails],
    source: "edge-stub",
    status: "unavailable",
    summary:
      "Распознавание паспорта недоступно. Заполните данные вручную и проверьте документ.",
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
