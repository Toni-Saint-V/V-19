import type { ExportPackageIdentity } from "./types";

/**
 * Immutable evidence produced after the browser has successfully started the
 * ZIP download. The server derives actor and submission identity from the
 * export batch; this object only carries the artifact facts it must validate.
 */
export interface ExportPackageDocumentCommit {
  applicantCount: number;
  assetIds: string[];
  fileCount: number;
  workbookFileName: string;
  zipFileName: string;
}

export interface ExportPackageCompletionRequest {
  documentExport: ExportPackageDocumentCommit;
  packageIdentity: ExportPackageIdentity;
  submissionIds: string[];
}

export function exportPackageDocumentCommitMatchesIdentity(
  documentExport: ExportPackageDocumentCommit,
  packageIdentity: ExportPackageIdentity,
): boolean {
  return (
    documentExport.workbookFileName === packageIdentity.fileName &&
    documentExport.zipFileName ===
      `visaflow-export-${packageIdentity.idempotencyKey}_documents.zip`
  );
}

export function exportPackageDocumentCommitMatches(
  left: ExportPackageDocumentCommit,
  right: ExportPackageDocumentCommit,
): boolean {
  const leftAssetIds = [...left.assetIds].sort();
  const rightAssetIds = [...right.assetIds].sort();
  return (
    left.applicantCount === right.applicantCount &&
    left.fileCount === right.fileCount &&
    left.workbookFileName === right.workbookFileName &&
    left.zipFileName === right.zipFileName &&
    leftAssetIds.length === rightAssetIds.length &&
    leftAssetIds.every((value, index) => value === rightAssetIds[index])
  );
}
