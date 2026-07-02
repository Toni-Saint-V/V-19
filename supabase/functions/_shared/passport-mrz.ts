import {
  passportExtractionGuardrails,
  safeUnavailablePassportExtractionResult,
  type PassportExtractionConfidence,
  type PassportExtractionField,
  type PassportExtractionResult,
} from "./passport-extraction-contract.ts";

const mrzCountryNames: Record<string, string> = {
  ESP: "Spain",
  RUS: "Russian Federation",
};

const mrzDigitCorrections: Record<string, string> = {
  B: "8",
  D: "0",
  I: "1",
  L: "1",
  O: "0",
  Q: "0",
  S: "5",
  Z: "2",
};

interface Td3Line2Candidate {
  compositeCheckValidated: boolean;
  line: string;
}

export function extractPassportMrzText(
  text: string,
  applicantIndex?: number,
): PassportExtractionResult {
  const parsed = parseTd3PassportMrz(text);
  if (!parsed) {
    return unavailablePassportMrzResult(applicantIndex);
  }

  return {
    applicantIndex,
    confidence: parsed.confidence,
    fields: parsed.fields,
    guardrails: [...passportExtractionGuardrails],
    needsManualReview: true,
    ocr: {
      attempted: true,
      provider: "local_ocr",
    },
    source: "local-ocr",
    status: "extracted",
    summary:
      "Данные распознаны частично. Требуется ручная проверка. Проверьте данные вручную.",
  };
}

export function parseTd3PassportMrz(
  text: string,
): { confidence: PassportExtractionConfidence; fields: PassportExtractionField[] } | null {
  const lines = normalizeMrzText(text);
  const line1Index = lines.findIndex((line) =>
    /^P<[A-Z]{3}[A-Z0-9<]{39}$/.test(line),
  );
  if (line1Index < 0) return null;

  const line1 = lines[line1Index] ?? "";
  const line2Raw =
    lines
      .slice(line1Index + 1)
      .find((line) => line.length >= 44 && /^[A-Z0-9<]+$/.test(line)) ?? "";
  if (!line2Raw) return null;

  const line2Candidate = td3Line2Candidates(line2Raw).find((candidate) =>
    hasValidTd3Line2(candidate),
  );
  if (!line2Candidate) return null;

  const line2 = line2Candidate.line;
  const surname = cleanMrzName(line1.slice(5).split("<<")[0] ?? "");
  const firstName = cleanMrzName(line1.slice(5).split("<<").slice(1).join("<"));
  if (!surname || !firstName) return null;

  const issuingCountryCode = line1.slice(2, 5).replace(/</g, "");
  const citizenshipCode = line2.slice(10, 13).replace(/</g, "");
  const birthDate = parseMrzDate(line2.slice(13, 19), "birth");
  const expiryDate = parseMrzDate(line2.slice(21, 27), "expiry");
  if (!birthDate || !expiryDate) return null;

  const confidence: PassportExtractionConfidence =
    line2Candidate.compositeCheckValidated ? "high" : "medium";
  const gender = line2.slice(20, 21);
  const passportNumber = line2.slice(0, 9).replace(/</g, "").trim();

  const fields = [
    mrzField("surname", surname, confidence),
    mrzField("firstName", firstName, confidence),
    mrzField("passportNumber", passportNumber, confidence),
    mrzField("birthDate", birthDate, confidence),
    mrzField("passportExpiresAt", expiryDate, confidence),
    mrzField("citizenship", countryLabel(citizenshipCode), confidence),
    mrzField(
      "gender",
      gender === "M" ? "Male - Мужской" : gender === "F" ? "Female - Женский" : "",
      confidence,
    ),
    mrzField("passportType", "Ordinary Passport", confidence),
    mrzField("passportIssueCountry", countryLabel(issuingCountryCode), confidence),
  ].filter((field): field is PassportExtractionField => Boolean(field));

  return fields.length ? { confidence, fields } : null;
}

function unavailablePassportMrzResult(applicantIndex?: number): PassportExtractionResult {
  return safeUnavailablePassportExtractionResult(
    applicantIndex,
    "local_ocr_unavailable",
  );
}

function normalizeMrzText(value: string) {
  return value
    .toUpperCase()
    .replace(/[«»]/g, "<")
    .replace(/\r/g, "\n")
    .split(/\n+/)
    .map((line) => line.replace(/[^A-Z0-9<]/g, "").trim())
    .filter(Boolean);
}

function td3Line2Candidates(rawLine: string): Td3Line2Candidate[] {
  const line = rawLine.slice(0, 44);
  const compositeCheckValidated = rawLine.length === 44;
  return Array.from(
    new Set([
      correctMrzLine2CriticalDigits(line, {
        compositeCheckValidated,
        includeDocumentNumber: false,
      }),
      correctMrzLine2CriticalDigits(line, {
        compositeCheckValidated,
        includeDocumentNumber: true,
      }),
    ]),
  ).map((candidate) => ({ compositeCheckValidated, line: candidate }));
}

function correctMrzLine2CriticalDigits(
  line: string,
  options: { compositeCheckValidated: boolean; includeDocumentNumber: boolean },
) {
  return line
    .split("")
    .map((character, index) => {
      const isDocumentNumber = index >= 0 && index <= 8;
      const isDocumentNumberCheck = index === 9;
      const isBirthDate = index >= 13 && index <= 19;
      const isExpiryDate = index >= 21 && index <= 27;
      const isCleanLineCheckDigit =
        options.compositeCheckValidated && (index === 42 || index === 43);
      if (
        (options.includeDocumentNumber && isDocumentNumber) ||
        isDocumentNumberCheck ||
        isBirthDate ||
        isExpiryDate ||
        isCleanLineCheckDigit
      ) {
        return mrzDigitCorrections[character] ?? character;
      }
      return character;
    })
    .join("");
}

function hasValidTd3Line2(candidate: Td3Line2Candidate) {
  const line = candidate.line;
  if (
    line.length !== 44 ||
    !/^[A-Z0-9<]{44}$/.test(line) ||
    !/^[A-Z]{3}$/.test(line.slice(10, 13)) ||
    !/^\d{6}$/.test(line.slice(13, 19)) ||
    !/^\d{6}$/.test(line.slice(21, 27)) ||
    !/^[MF<]$/.test(line.slice(20, 21)) ||
    !hasMrzCheckDigit(line.slice(0, 9), line[9] ?? "") ||
    !hasMrzCheckDigit(line.slice(13, 19), line[19] ?? "") ||
    !hasMrzCheckDigit(line.slice(21, 27), line[27] ?? "") ||
    !parseMrzDate(line.slice(13, 19), "birth") ||
    !parseMrzDate(line.slice(21, 27), "expiry")
  ) {
    return false;
  }

  if (!candidate.compositeCheckValidated) return true;

  return (
    hasMrzCheckDigit(line.slice(28, 42), line[42] ?? "") &&
    hasMrzCheckDigit(
      `${line.slice(0, 10)}${line.slice(13, 20)}${line.slice(21, 43)}`,
      line[43] ?? "",
    )
  );
}

function mrzCheckDigitValue(character: string) {
  if (character === "<") return 0;
  if (/^\d$/.test(character)) return Number(character);
  if (/^[A-Z]$/.test(character)) return character.charCodeAt(0) - 55;
  return null;
}

function mrzCheckDigit(value: string) {
  const weights = [7, 3, 1];
  let sum = 0;
  for (let index = 0; index < value.length; index += 1) {
    const characterValue = mrzCheckDigitValue(value[index] ?? "");
    if (characterValue === null) return null;
    sum += characterValue * (weights[index % weights.length] ?? 1);
  }
  return String(sum % 10);
}

function hasMrzCheckDigit(value: string, checkDigit: string) {
  return /^\d$/.test(checkDigit) && mrzCheckDigit(value) === checkDigit;
}

function parseMrzDate(value: string, mode: "birth" | "expiry") {
  if (!/^\d{6}$/.test(value)) return "";
  const year = Number(value.slice(0, 2));
  const month = Number(value.slice(2, 4));
  const day = Number(value.slice(4, 6));
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const currentYearShort = currentYear % 100;
  let fullYear =
    mode === "expiry"
      ? 2000 + year
      : year > currentYearShort
        ? 1900 + year
        : 2000 + year;
  let date = new Date(Date.UTC(fullYear, month - 1, day));
  if (mode === "birth" && date.getTime() > now.getTime()) {
    fullYear -= 100;
    date = new Date(Date.UTC(fullYear, month - 1, day));
  }
  if (
    date.getUTCFullYear() !== fullYear ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return "";
  }
  return `${value.slice(4, 6)}.${value.slice(2, 4)}.${fullYear}`;
}

function cleanMrzName(value: string) {
  const cleaned = value
    .replace(/</g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return /^[A-Z][A-Z ]{1,38}$/.test(cleaned) ? cleaned : "";
}

function countryLabel(code: string) {
  return mrzCountryNames[code] ?? code;
}

function mrzField(
  key: PassportExtractionField["key"],
  value: string,
  confidence: PassportExtractionConfidence,
): PassportExtractionField | null {
  const cleaned = value.trim();
  if (!cleaned) return null;
  return {
    confidence,
    key,
    needsManualReview: true,
    value: cleaned,
  };
}
