export const requiredMigrationOrder: readonly string[];
export const legacyRemoteMigrationOrder: readonly string[];
export const cleanCutoverRemoteMigrationOrder: readonly string[];

export function requiredRemoteMigrationOrderForGeneration(
  cutoverGeneration: string,
): readonly string[];

export interface SupabaseMigrationContractEntry {
  readonly fileName: string;
  readonly version: string;
  readonly name: string;
  readonly sha256: string;
}

export function migrationContractEntriesFromFileSystem(
  root: string,
): readonly SupabaseMigrationContractEntry[];
export function migrationContractEntriesFromGitHead(
  root: string,
): readonly SupabaseMigrationContractEntry[];
export function migrationContractSha256(
  entries: readonly SupabaseMigrationContractEntry[],
): string;

export function requiredMigrationsInActualOrder(
  migrationFiles: readonly string[],
): string[];

export function undeclaredMigrationFiles(migrationFiles: readonly string[]): string[];
