export interface ExternalEvidenceBundleValidation {
  artifacts: Record<
    string,
    {
      content: string;
      document: Record<string, unknown>;
      path: string;
      sha256: string;
    }
  >;
  evidenceRootSha256: string;
  issues: string[];
}

export function externalEvidenceRootSha256(options: {
  edgeFunctionsSha256: string;
  roleIsolationSha256: string;
}): string;

export function validateExternalEvidenceBundle(options: {
  bundleManifest: Record<string, unknown>;
  bundleRoot: string;
}): ExternalEvidenceBundleValidation;

export function validateExternalEvidenceImportReceipt(options: {
  packet: Record<string, unknown>;
  repoRoot: string;
}): string[];
