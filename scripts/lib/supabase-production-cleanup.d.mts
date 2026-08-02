export interface SupabaseCleanupResult<T = unknown> {
  data?: T;
  error?: { message: string } | null;
}

export interface SupabaseCleanupClient {
  storage: {
    from(bucket: string): {
      remove(paths: string[]): Promise<SupabaseCleanupResult>;
      list(
        directory: string,
        options: { limit: number; search: string },
      ): Promise<SupabaseCleanupResult<Array<{ name: string }>>>;
    };
  };
  from(table: string): {
    delete(): {
      eq(column: string, value: string): Promise<SupabaseCleanupResult>;
    };
    select(columns: string): {
      eq(column: string, value: string): {
        limit(count: number): Promise<SupabaseCleanupResult<Array<{ id: string }>>>;
      };
    };
  };
}

export function cleanupProductionWorkflowFixtures(options: {
  bucket: string;
  client: SupabaseCleanupClient;
  cleanupPaths: Iterable<string>;
  submissionIds: Iterable<string>;
}): Promise<void>;
