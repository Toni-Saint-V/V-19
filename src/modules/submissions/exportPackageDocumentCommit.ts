import type { ExportPackageIdentity } from "./types";

/**
 * Immutable evidence produced after the browser has successfully started the
 * ZIP download. The server derives actor and submission identity from the
 * export batch; this object only carries the artifact facts it must validate.
 */
export interface ExportPackageDocumentCommit {
  applicantCount: number;
  assetIds: string[];
  /** Number of unique required media assets in the ZIP; generated files are excluded. */
  fileCount: number;
  workbookFileName: string;
  zipFileName: string;
}

export interface ExportPackageCompletionRequest {
  archiveInputSignature: string;
  documentExport: ExportPackageDocumentCommit;
  packageIdentity: ExportPackageIdentity;
  submissionIds: string[];
}

export function exportPackageDocumentCommitMatchesIdentity(
  documentExport: ExportPackageDocumentCommit,
  packageIdentity: ExportPackageIdentity,
): boolean {
  const uniqueAssetIds = new Set(documentExport.assetIds);
  const expectedMediaCount =
    packageIdentity.rowCount + packageIdentity.submissionIds.length * 2;

  return (
    documentExport.applicantCount === packageIdentity.rowCount &&
    documentExport.assetIds.every((assetId) => assetId.trim().length > 0) &&
    documentExport.assetIds.length === uniqueAssetIds.size &&
    uniqueAssetIds.size === expectedMediaCount &&
    documentExport.fileCount === uniqueAssetIds.size &&
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
