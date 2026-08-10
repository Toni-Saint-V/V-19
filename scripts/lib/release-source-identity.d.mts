export function releaseSourceSha256FromFileSystem(root: string): string;
export function releaseSourceSha256FromGitHead(root: string): string;
export function releaseSourceSegmentsFromFileSystem(
  root: string,
): Record<string, string>;
export function releaseSourceSegmentsFromGitHead(root: string): Record<string, string>;
export function releaseSourceRootFilesFromFileSystem(
  root: string,
): Record<string, string>;
export function releaseSourceRootFilesFromGitHead(root: string): Record<string, string>;
export function compareReleaseSourcePaths(left: string, right: string): number;
export function releaseBuildIdentity(input: {
  root: string;
  isProductionArchive: boolean;
  archiveGitSha?: string;
  archiveSourceSha256?: string;
  vercelGitSha?: string;
}): {
  dirty: boolean;
  gitSha: string;
  sourceSha256: string;
};
