export type VisaApplicationPdfTemplateParityResult =
  | { ok: true }
  | {
      ok: false;
      reason:
        | "blank_template_fingerprint_mismatch"
        | "blank_template_matches_filled_example"
        | "blank_template_not_approved"
        | "invalid_reference_fingerprint"
        | "page_count_mismatch";
    };

export type VisaApplicationPdfTemplateParityInput = {
  approvedBlankTemplateSha256?: string | null;
  blankTemplatePageCount: number;
  blankTemplateSha256: string;
  expectedPageCount?: number;
  filledExamplePageCount: number;
  filledExampleSha256: string;
};

const sha256Pattern = /^[a-f0-9]{64}$/;

/**
 * Fail-closed trust gate for the PDF background used by the generated visa form.
 * It deliberately accepts fingerprints and page counts only, so filled sample
 * bytes and their personal values never need to enter the application bundle.
 */
export function verifyVisaApplicationPdfTemplateParity(
  input: VisaApplicationPdfTemplateParityInput,
): VisaApplicationPdfTemplateParityResult {
  const expectedPageCount = input.expectedPageCount ?? 4;
  const blankSha256 = input.blankTemplateSha256.toLowerCase();
  const filledSha256 = input.filledExampleSha256.toLowerCase();
  const approvedSha256 = input.approvedBlankTemplateSha256?.toLowerCase() ?? null;

  if (
    !sha256Pattern.test(blankSha256) ||
    !sha256Pattern.test(filledSha256) ||
    (approvedSha256 !== null && !sha256Pattern.test(approvedSha256))
  ) {
    return { ok: false, reason: "invalid_reference_fingerprint" };
  }
  if (
    input.blankTemplatePageCount !== expectedPageCount ||
    input.filledExamplePageCount !== expectedPageCount
  ) {
    return { ok: false, reason: "page_count_mismatch" };
  }
  if (blankSha256 === filledSha256) {
    return { ok: false, reason: "blank_template_matches_filled_example" };
  }
  if (!approvedSha256) {
    return { ok: false, reason: "blank_template_not_approved" };
  }
  if (blankSha256 !== approvedSha256) {
    return { ok: false, reason: "blank_template_fingerprint_mismatch" };
  }
  return { ok: true };
}
