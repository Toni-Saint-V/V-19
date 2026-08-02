export function isVercelReleaseIdentityMatch(options: {
  aliases: string[];
  canonicalHost: string;
  deployment: {
    id?: string;
    readyState?: string;
    target?: string;
  } | null;
  expectedGitSha: string;
  expectedSourceSha256: string;
  identity: {
    dirty?: boolean;
    gitSha?: string;
    mode?: string;
    schemaVersion?: number;
    sourceSha256?: string;
  } | null;
}): boolean;
