import {
  parsePassportExtractionResult,
  safeUnavailablePassportExtractionResult,
  type PassportExtractionProvider,
  type PassportExtractionProviderResult,
  type PassportExtractionRequest,
  type PassportExtractionResult,
} from "./passport-extraction-contract.ts";
import { extractPassportMrzText } from "./passport-mrz.ts";

export async function extractPassportWithLocalOcr(
  request: PassportExtractionRequest,
  provider?: PassportExtractionProvider,
): Promise<PassportExtractionResult> {
  if (!provider) {
    return safeUnavailablePassportExtractionResult(
      request.applicantIndex,
      "local_ocr_not_configured",
    );
  }

  let providerResult: PassportExtractionProviderResult;
  try {
    providerResult = await provider.recognizeText(request);
  } catch {
    return safeUnavailablePassportExtractionResult(
      request.applicantIndex,
      "local_ocr_unavailable",
    );
  }

  if (!providerResult.ok) {
    return safeUnavailablePassportExtractionResult(
      request.applicantIndex,
      providerResult.reason,
    );
  }

  const text = providerResult.text.trim();
  if (!text) {
    return safeUnavailablePassportExtractionResult(
      request.applicantIndex,
      "local_ocr_unavailable",
    );
  }

  const mrzResult = extractPassportMrzText(text, request.applicantIndex);
  if (mrzResult.status !== "extracted") {
    return safeUnavailablePassportExtractionResult(
      request.applicantIndex,
      "local_ocr_unavailable",
    );
  }

  const parsed = parsePassportExtractionResult({
    ...mrzResult,
    ocr: {
      attempted: true,
      provider: "local_ocr",
    },
    source: "local-ocr",
  });
  if (parsed.ok) return parsed.data;

  return safeUnavailablePassportExtractionResult(
    request.applicantIndex,
    "local_ocr_unavailable",
  );
}
