import { posix } from "node:path";

const cleanupTables = Object.freeze([
  "corrections",
  "status_history",
  "media_assets",
  "applicants",
  "submissions",
]);

export async function cleanupProductionWorkflowFixtures({
  bucket,
  client,
  cleanupPaths,
  submissionIds,
}) {
  const failures = [];
  await collectCleanupResult(
    failures,
    `storage bucket ${bucket}`,
    client.storage.from(bucket).remove([...cleanupPaths]),
  );
  for (const id of submissionIds) {
    for (const table of cleanupTables) {
      const filterColumn = table === "submissions" ? "id" : "submission_id";
      await collectCleanupResult(
        failures,
        `${table}:${id}`,
        client.from(table).delete().eq(filterColumn, id),
      );
    }
  }
  await verifyCleanupReadback({
    bucket,
    client,
    cleanupPaths,
    failures,
    submissionIds,
  });
  if (failures.length > 0) {
    throw new Error(`Production smoke cleanup failed: ${failures.join("; ")}`);
  }
}

async function verifyCleanupReadback({
  bucket,
  client,
  cleanupPaths,
  failures,
  submissionIds,
}) {
  for (const path of cleanupPaths) {
    const directory = posix.dirname(path);
    const fileName = posix.basename(path);
    try {
      const result = await client.storage
        .from(bucket)
        .list(directory, { limit: 100, search: fileName });
      if (result.error) {
        failures.push(`storage readback ${path}: ${result.error.message}`);
      } else if (result.data?.some((item) => item.name === fileName)) {
        failures.push(`storage readback ${path}: object still exists`);
      }
    } catch (error) {
      failures.push(`storage readback ${path}: ${error.message}`);
    }
  }

  for (const id of submissionIds) {
    for (const table of cleanupTables) {
      const filterColumn = table === "submissions" ? "id" : "submission_id";
      try {
        const result = await client
          .from(table)
          .select("id")
          .eq(filterColumn, id)
          .limit(1);
        if (result.error) {
          failures.push(`database readback ${table}:${id}: ${result.error.message}`);
        } else if ((result.data?.length ?? 0) > 0) {
          failures.push(`database readback ${table}:${id}: row still exists`);
        }
      } catch (error) {
        failures.push(`database readback ${table}:${id}: ${error.message}`);
      }
    }
  }
}

async function collectCleanupResult(failures, label, operation) {
  try {
    const result = await operation;
    if (result?.error) failures.push(`${label}: ${result.error.message}`);
  } catch (error) {
    failures.push(`${label}: ${error.message}`);
  }
}
