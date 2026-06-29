import type { Applicant } from "./types";

export type ApplicantDocumentType =
  | "application_form_pdf"
  | "passport_scan"
  | "questionnaire"
  | "selfie"
  | "selfie_2";

const defaultExtensions: Record<ApplicantDocumentType, string> = {
  application_form_pdf: "pdf",
  passport_scan: "pdf",
  questionnaire: "pdf",
  selfie: "jpg",
  selfie_2: "jpg",
};

export function buildApplicantDocumentFileName(input: {
  applicant: Applicant;
  applicantId?: string;
  documentType: ApplicantDocumentType;
  extension?: string;
  passportNumber?: string;
}): string {
  const extension = sanitizeExtension(
    input.extension ?? defaultExtensions[input.documentType],
  );
  const passportNumber = sanitizeFilenameSegment(
    input.passportNumber ?? passportNumberFromApplicant(input.applicant),
  );

  if (!passportNumber) {
    return `missing-passport_${input.documentType}_${sanitizeFilenameSegment(
      input.applicantId ?? input.applicant.id,
    )}.${extension}`;
  }

  const name = applicantFileNameParts(input.applicant.fullName);
  return [
    passportNumber,
    input.documentType,
    name.lastName,
    name.firstName,
  ]
    .filter(Boolean)
    .join("_")
    .concat(`.${extension}`);
}

export function passportNumberFromApplicant(applicant: Applicant): string {
  return applicant.sections
    .flatMap((section) => section.fields)
    .find((field) => field.id === "passport-no")
    ?.value.trim() ?? "";
}

export function applicantHasPassportNumber(applicant: Applicant): boolean {
  return Boolean(sanitizeFilenameSegment(passportNumberFromApplicant(applicant)));
}

export function sanitizeFilenameSegment(value: string): string {
  return value
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^\p{L}\p{N}_-]+/gu, "")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function sanitizeExtension(value: string): string {
  const extension = value.replace(/^\./, "").replace(/[^\p{L}\p{N}]+/gu, "");
  return extension || "bin";
}

function applicantFileNameParts(fullName: string): {
  firstName: string;
  lastName: string;
} {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) {
    const single = sanitizeFilenameSegment(parts[0] ?? "");
    return { firstName: single, lastName: single };
  }

  const [firstName = "", ...rest] = parts;
  return {
    firstName: sanitizeFilenameSegment(firstName),
    lastName: sanitizeFilenameSegment(rest.join("_")),
  };
}
