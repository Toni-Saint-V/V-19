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

export function readStableExternalFile(options: {
  afterOpenForTest?: (realPath: string) => void;
  issues: string[];
  label?: string;
  repoRoot: string;
  value: unknown;
}): { content: Buffer; path: string } | null;

export function writeStableExternalFile(options: {
  afterTempOpenForTest?: (paths: {
    outputPath: string;
    parentPath: string;
    temporaryPath: string;
  }) => void;
  afterPublishFailureForTest?: (paths: {
    outputPath: string;
    parentPath: string;
    temporaryPath: string;
  }) => void;
  beforePublishForTest?: (paths: {
    outputPath: string;
    parentPath: string;
    temporaryPath: string;
  }) => void;
  content: string | Buffer;
  label?: string;
  path: string;
  repoRoot: string;
}): string;

export function validateExternalEvidenceBundle(options: {
  bundleManifest: Record<string, unknown>;
  bundleRoot: string;
  now?: number;
  repoRoot?: string;
}): ExternalEvidenceBundleValidation;

export function validateExternalEvidenceImportReceipt(options: {
  packet: Record<string, unknown>;
  repoRoot: string;
  now?: number;
}): string[];
