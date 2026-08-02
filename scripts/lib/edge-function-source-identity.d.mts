export type EdgeFunctionSourceFile = {
  path: string;
  relativePath: string;
};

export function edgeFunctionSourceFiles(
  repoRoot: string,
  functionName: string,
): EdgeFunctionSourceFile[];

export function edgeFunctionSourceSha256(
  repoRoot: string,
  functionName: string,
): string;

export function edgeFunctionSourceSha256FromGitHead(
  repoRoot: string,
  functionName: string,
): string;
