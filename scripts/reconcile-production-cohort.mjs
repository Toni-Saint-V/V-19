import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import {
  productionCohortExpectedFinalTotals,
  productionCohortFinalGate,
} from "./lib/production-cohort-final-gate.mjs";

const productionProjectRef = "tsymifccglpepvbmrcgh";
const productionUrl = `https://${productionProjectRef}.supabase.co`;
const expectedBucket = "submission-media";
const expectedCases = [
  { applicantCount: 6, caseKey: "A1-F6", city: "Москва", type: "family" },
  { applicantCount: 1, caseKey: "A1-S1", city: "Москва", type: "single" },
  { applicantCount: 1, caseKey: "A1-S2", city: "Москва", type: "single" },
  { applicantCount: 1, caseKey: "A1-S3", city: "Москва", type: "single" },
  {
    applicantCount: 6,
    caseKey: "A2-F6",
    city: "Санкт-Петербург",
    type: "family",
  },
  {
    applicantCount: 1,
    caseKey: "A2-S1",
    city: "Санкт-Петербург",
    type: "single",
  },
  {
    applicantCount: 1,
    caseKey: "A2-S2",
    city: "Санкт-Петербург",
    type: "single",
  },
  {
    applicantCount: 1,
    caseKey: "A2-S3",
    city: "Санкт-Петербург",
    type: "single",
  },
  { applicantCount: 6, caseKey: "A3-F6", city: "Казань", type: "family" },
  { applicantCount: 1, caseKey: "A3-S1", city: "Казань", type: "single" },
  { applicantCount: 1, caseKey: "A3-S2", city: "Казань", type: "single" },
  { applicantCount: 1, caseKey: "A3-S3", city: "Казань", type: "single" },
];
const expectedByCaseKey = new Map(expectedCases.map((item) => [item.caseKey, item]));
const marker = clean(process.env.V19_PRODUCTION_COHORT_RUN_MARKER);
const repoRoot = process.cwd();
const publicEnvPath = resolve(
  repoRoot,
  process.env.SUPABASE_UI_E2E_ENV_FILE ?? ".env.supabase-production.local",
);
const cohortPath = resolve(repoRoot, ".supabase-pilot-cohort.local.json");
const checkpointPath = resolve(
  repoRoot,
  `.production-cohort-${marker}.state.local.json`,
);

await main().catch((error) => {
  const digest = createHash("sha256")
    .update(error instanceof Error ? error.message : String(error))
    .digest("hex")
    .slice(0, 12);
  console.error(`BLOCKED production cohort reconciliation (${digest}).`);
  process.exitCode = 1;
});

async function main() {
  invariant(
    /^V19QA-\d{8}-[A-Z0-9]{4,12}$/.test(marker),
    "The production cohort run marker is absent or invalid.",
  );
  invariant(existsSync(publicEnvPath), "The production public environment is absent.");
  invariant(existsSync(cohortPath), "The production pilot cohort file is absent.");
  invariant(existsSync(checkpointPath), "The production cohort checkpoint is absent.");

  const publicEnv = readEnv(publicEnvPath);
  const cohort = readJson(cohortPath);
  const checkpoint = readJson(checkpointPath);
  const publishableKey = clean(publicEnv.VITE_SUPABASE_PUBLISHABLE_KEY);
  const projectId = clean(publicEnv.VITE_SUPABASE_PROJECT_ID);
  const projectUrl = clean(publicEnv.VITE_SUPABASE_URL);

  invariant(
    projectId === productionProjectRef,
    "The public environment project is not approved.",
  );
  invariant(projectUrl === productionUrl, "The production URL is not exact.");
  invariant(
    publishableKey.startsWith("sb_publishable_"),
    "The production publishable key is absent.",
  );
  invariant(
    clean(cohort.projectRef) === productionProjectRef &&
      cohort.productionNotSandboxConfirmed === true,
    "The pilot cohort target is not confirmed as production.",
  );
  invariant(
    checkpoint.projectRef === productionProjectRef && checkpoint.runMarker === marker,
    "The checkpoint target does not match the requested production cohort.",
  );

  const admin = validatedAdmin(cohort.pilotUsers);
  const client = createClient(productionUrl, publishableKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: { fetch: resilientReadFetch },
  });
  const { data: authData, error: authError } = await client.auth.signInWithPassword({
    email: admin.email,
    password: admin.password,
  });
  invariant(
    !authError && authData.session?.access_token,
    "Production admin sign-in failed.",
  );

  const [markerRows, snapshotMarkerRows] = await Promise.all([
    readMarkerRows(client),
    readSnapshotMarkerRows(client),
  ]);
  const discovered = discoverCases([...markerRows, ...snapshotMarkerRows]);
  assertCheckpointCases(checkpoint.cases, discovered);

  const submissionIds = [...discovered.values()].map((entry) => entry.submissionId);
  invariant(
    new Set(submissionIds).size === submissionIds.length,
    "Case ownership is ambiguous.",
  );

  const [submissions, applicants, media, documents, answers, legacyFiles] =
    await Promise.all([
      readRows(client, "submissions", "id,type,city,status", "id", submissionIds),
      readRows(
        client,
        "applicants",
        "id,submission_id",
        "submission_id",
        submissionIds,
      ),
      readRows(
        client,
        "media_assets",
        "id,applicant_id,submission_id,type,storage_bucket,storage_path,upload_status",
        "submission_id",
        submissionIds,
      ),
      readRows(
        client,
        "document_assets",
        "applicant_id,source_media_asset_id,submission_id,type,bucket,storage_path,upload_status,validation_status,export_status",
        "submission_id",
        submissionIds,
      ),
      readRows(
        client,
        "questionnaire_answers",
        "applicant_id,field_id,section_id,submission_id,value",
        "submission_id",
        submissionIds,
      ),
      readRows(
        client,
        "submission_files",
        "submission_id",
        "submission_id",
        submissionIds,
      ),
    ]);

  const submissionById = new Map(submissions.map((row) => [row.id, row]));
  const rangeResults = await verifyStorageObjects(
    media,
    publishableKey,
    authData.session.access_token,
  );
  const reports = [];

  for (const expected of expectedCases) {
    const found = discovered.get(expected.caseKey);
    if (!found) continue;
    const checkpointStage =
      checkpoint.cases?.[expected.caseKey]?.stage ?? "remote_only";
    const submission = submissionById.get(found.submissionId);
    invariant(submission, `The ${expected.caseKey} submission row is absent.`);
    const stage = effectiveCohortStage(checkpointStage, submission.status);

    const caseApplicants = forSubmission(applicants, found.submissionId);
    const caseMedia = forSubmission(media, found.submissionId);
    const caseDocuments = forSubmission(documents, found.submissionId);
    const caseAnswers = forSubmission(answers, found.submissionId);
    const populatedAnswers = caseAnswers.filter((row) => answerHasContent(row.value));
    const caseLegacy = forSubmission(legacyFiles, found.submissionId);
    const caseRange = rangeResults.filter(
      (item) => item.submissionId === found.submissionId,
    );
    const applicantIds = new Set(caseApplicants.map((row) => row.id));
    const mediaTypes = countBy(caseMedia, "type");
    const documentStates = countBy(
      caseDocuments,
      (row) => `${row.upload_status}/${row.validation_status}/${row.export_status}`,
    );

    invariant(
      submission.type === expected.type,
      `${expected.caseKey} has the wrong type.`,
    );
    invariant(
      submission.city === expected.city,
      `${expected.caseKey} has the wrong city.`,
    );
    invariant(
      caseApplicants.length === expected.applicantCount,
      `${expected.caseKey} has the wrong applicant count.`,
    );
    invariant(
      applicantIds.size === caseApplicants.length,
      `${expected.caseKey} has duplicate applicant identities.`,
    );
    invariant(
      [...caseMedia, ...caseDocuments, ...caseAnswers].every((row) =>
        applicantIds.has(row.applicant_id),
      ),
      `${expected.caseKey} has a cross-submission applicant projection.`,
    );
    invariant(
      found.markerPassportCount === expected.applicantCount,
      `${expected.caseKey} has an incomplete passport marker set.`,
    );
    invariant(
      caseLegacy.length === 0,
      `${expected.caseKey} has legacy submission files.`,
    );
    invariant(
      caseMedia.every(
        (row) =>
          row.storage_bucket === expectedBucket &&
          row.upload_status === "uploaded" &&
          clean(row.storage_path),
      ),
      `${expected.caseKey} has invalid media metadata.`,
    );
    invariant(
      new Set(caseMedia.map((row) => row.storage_path)).size === caseMedia.length,
      `${expected.caseKey} has duplicate media storage paths.`,
    );
    invariant(
      caseRange.length === caseMedia.length && caseRange.every((item) => item.ok),
      `${expected.caseKey} has unreadable Storage objects.`,
    );
    invariant(
      caseDocuments.every(
        (row) => row.bucket === expectedBucket && clean(row.storage_path),
      ),
      `${expected.caseKey} has invalid document projections.`,
    );

    if (
      stage === "questionnaire_saved" ||
      stage === "submitted" ||
      stage === "exported"
    ) {
      const expectedDocumentState =
        stage === "exported"
          ? { exportStatus: "exported", validationStatus: "passed" }
          : { exportStatus: "not_ready", validationStatus: "pending" };
      const expectedAssetCount = expected.applicantCount * 3;
      invariant(
        caseMedia.length === expectedAssetCount &&
          mediaTypes.passport_scan === expected.applicantCount &&
          mediaTypes.selfie === expected.applicantCount &&
          mediaTypes.selfie_2 === expected.applicantCount,
        `${expected.caseKey} does not have all required media slots.`,
      );
      invariant(
        caseDocuments.length === expectedAssetCount,
        `${expected.caseKey} does not have all document projections.`,
      );
      assertExactApplicantProjection(
        expected.caseKey,
        applicantIds,
        caseMedia,
        caseDocuments,
        caseAnswers,
        expectedDocumentState,
      );
      invariant(
        caseAnswers.length === expected.applicantCount * 77,
        `${expected.caseKey} does not have the expected answer rows.`,
      );
      invariant(
        stage !== "submitted" || submission.status === "waiting_review",
        `${expected.caseKey} is not in the submitted database status.`,
      );
      invariant(
        stage !== "questionnaire_saved" || submission.status === "draft",
        `${expected.caseKey} is not in the saved draft database status.`,
      );
      invariant(
        stage !== "exported" || submission.status === "exported",
        `${expected.caseKey} is not in the exported database status.`,
      );
    }

    reports.push({
      answerCount: caseAnswers.length,
      blankAnswerCount: caseAnswers.length - populatedAnswers.length,
      applicantCount: caseApplicants.length,
      caseKey: expected.caseKey,
      checkpointStage,
      documentAssetCount: caseDocuments.length,
      documentStates,
      legacyFileCount: caseLegacy.length,
      markerPassportCount: found.markerPassportCount,
      mediaCount: caseMedia.length,
      mediaTypes,
      stage,
      status: submission.status,
      storageReadable: caseRange.filter((item) => item.ok).length,
      storageUnique: new Set(caseMedia.map((row) => row.storage_path)).size,
      type: submission.type,
      populatedAnswerCount: populatedAnswers.length,
    });
  }

  const totals = reports.reduce(
    (summary, report) => ({
      answers: summary.answers + report.answerCount,
      blankAnswers: summary.blankAnswers + report.blankAnswerCount,
      applicants: summary.applicants + report.applicantCount,
      documents: summary.documents + report.documentAssetCount,
      legacyFiles: summary.legacyFiles + report.legacyFileCount,
      media: summary.media + report.mediaCount,
      storageReadable: summary.storageReadable + report.storageReadable,
      populatedAnswers: summary.populatedAnswers + report.populatedAnswerCount,
    }),
    {
      answers: 0,
      blankAnswers: 0,
      applicants: 0,
      documents: 0,
      legacyFiles: 0,
      media: 0,
      storageReadable: 0,
      populatedAnswers: 0,
    },
  );
  const complete = productionCohortFinalGate({
    expectedCaseCount: expectedCases.length,
    reports,
    totals,
  });

  console.log(
    complete
      ? "PASS read-only production cohort reconciliation."
      : "PARTIAL read-only production cohort reconciliation.",
  );
  for (const report of reports) console.log(JSON.stringify(report));
  console.log(
    JSON.stringify({
      complete,
      discoveredCases: reports.length,
      expectedCases: expectedCases.length,
      expectedFinal: productionCohortExpectedFinalTotals,
      totals,
    }),
  );
  if (!complete) process.exitCode = 2;
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function effectiveCohortStage(checkpointStage, submissionStatus) {
  if (submissionStatus === "exported") return "exported";
  if (
    checkpointStage === "questionnaire_saved" &&
    submissionStatus === "waiting_review"
  ) {
    return "submitted";
  }
  return checkpointStage;
}

function invariant(condition, message) {
  if (!condition) throw new Error(message);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function readEnv(path) {
  const env = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator <= 0) continue;
    env[trimmed.slice(0, separator).trim()] = trimmed
      .slice(separator + 1)
      .trim()
      .replace(/^['"]|['"]$/g, "");
  }
  return env;
}

function validatedAdmin(users) {
  invariant(Array.isArray(users), "Pilot users are absent.");
  const admin = users.find((user) => user?.key === "pilot-admin-01");
  invariant(
    admin?.role === "admin" &&
      admin.exists === true &&
      admin.roleVerified === true &&
      admin.signInVerified === true &&
      clean(admin.email) &&
      clean(admin.password),
    "The verified pilot admin account is unavailable.",
  );
  return { email: clean(admin.email), password: clean(admin.password) };
}

async function resilientReadFetch(input, init) {
  const initial = new Request(input, init);
  const url = new URL(initial.url);
  const method = initial.method.toUpperCase();
  const isAuthToken = method === "POST" && url.pathname === "/auth/v1/token";
  const retryable = method === "GET" || method === "HEAD" || isAuthToken;
  const attempts = retryable ? 4 : 1;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 15_000);
    try {
      const response = await fetch(
        new Request(initial.clone(), { signal: controller.signal }),
      );
      if (
        attempt < attempts &&
        [408, 429, 500, 502, 503, 504].includes(response.status)
      ) {
        await delay(attempt * 500);
        continue;
      }
      return response;
    } catch (error) {
      if (attempt === attempts) throw error;
      await delay(attempt * 500);
    } finally {
      clearTimeout(timeout);
    }
  }
  throw new Error("Read retry loop exhausted.");
}

function delay(milliseconds) {
  return new Promise((resolveDelay) => setTimeout(resolveDelay, milliseconds));
}

async function readMarkerRows(client) {
  const rows = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from("media_assets")
      .select("submission_id,original_file_name")
      .like("original_file_name", `${marker}-%-passport-%`)
      .order("submission_id", { ascending: true })
      .range(from, from + pageSize - 1);
    invariant(!error, "Production marker rows are unreadable.");
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

async function readSnapshotMarkerRows(client) {
  const rows = [];
  const pageSize = 100;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from("submissions")
      .select("id,family_intelligence")
      .order("id", { ascending: true })
      .range(from, from + pageSize - 1);
    invariant(!error, "Production submission snapshots are unreadable.");
    const page = data ?? [];
    for (const row of page) {
      const files = row.family_intelligence?.v19CockpitSnapshot?.submission?.files;
      if (!Array.isArray(files)) continue;
      for (const file of files) {
        const originalFileName = clean(file?.originalFileName);
        if (!originalFileName.startsWith(`${marker}-`)) continue;
        if (!/-passport-\d+\.png$/.test(originalFileName)) continue;
        rows.push({
          original_file_name: originalFileName,
          submission_id: row.id,
        });
      }
    }
    if (page.length < pageSize) return rows;
  }
}

function discoverCases(markerRows) {
  const escapedMarker = marker.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    `^${escapedMarker}-(A[1-3]-(?:F6|S[1-3]))-passport-\\d+\\.png$`,
  );
  const byCase = new Map();
  for (const row of markerRows) {
    const match = pattern.exec(clean(row.original_file_name));
    invariant(match, "A marker media filename does not match the cohort contract.");
    const caseKey = match[1];
    invariant(
      expectedByCaseKey.has(caseKey),
      "An unexpected cohort case was discovered.",
    );
    const current = byCase.get(caseKey);
    if (current) {
      invariant(
        current.submissionId === row.submission_id,
        `${caseKey} resolves to multiple submissions.`,
      );
      current.markerPassportNames.add(row.original_file_name);
    } else {
      invariant(
        clean(row.submission_id),
        `${caseKey} has an empty submission identity.`,
      );
      byCase.set(caseKey, {
        markerPassportNames: new Set([row.original_file_name]),
        submissionId: row.submission_id,
      });
    }
  }
  for (const entry of byCase.values()) {
    entry.markerPassportCount = entry.markerPassportNames.size;
    delete entry.markerPassportNames;
  }
  return byCase;
}

function assertCheckpointCases(cases, discovered) {
  invariant(cases && typeof cases === "object", "Checkpoint cases are absent.");
  for (const [caseKey, item] of Object.entries(cases)) {
    invariant(
      expectedByCaseKey.has(caseKey),
      "Checkpoint contains an unexpected case.",
    );
    invariant(
      item?.caseMarker === `${marker}-${caseKey}`,
      `${caseKey} checkpoint marker does not match.`,
    );
    invariant(
      discovered.has(caseKey),
      `${caseKey} checkpoint has no production marker rows.`,
    );
    invariant(
      !item.submissionId || item.submissionId === discovered.get(caseKey).submissionId,
      `${caseKey} checkpoint identity does not match production.`,
    );
  }
}

async function readRows(client, table, select, filterColumn, ids) {
  if (ids.length === 0) return [];
  const rows = [];
  const pageSize = 500;
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await client
      .from(table)
      .select(select)
      .in(filterColumn, ids)
      .order(filterColumn, { ascending: true })
      .range(from, from + pageSize - 1);
    invariant(!error, `Production ${table} rows are unreadable.`);
    const page = data ?? [];
    rows.push(...page);
    if (page.length < pageSize) return rows;
  }
}

async function verifyStorageObjects(media, publishableKey, accessToken) {
  const results = [];
  for (const row of media) {
    const encodedPath = clean(row.storage_path)
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
    const bucket = encodeURIComponent(clean(row.storage_bucket));
    const url = `${productionUrl}/storage/v1/object/authenticated/${bucket}/${encodedPath}`;
    const response = await resilientReadFetch(url, {
      headers: {
        apikey: publishableKey,
        authorization: `Bearer ${accessToken}`,
        range: "bytes=0-0",
      },
      method: "GET",
    }).catch(() => null);
    results.push({
      ok: response?.status === 200 || response?.status === 206,
      submissionId: row.submission_id,
    });
  }
  return results;
}

function forSubmission(rows, submissionId) {
  return rows.filter((row) => row.submission_id === submissionId);
}

function countBy(rows, keyOrSelector) {
  return rows.reduce((counts, row) => {
    const value =
      typeof keyOrSelector === "function" ? keyOrSelector(row) : row[keyOrSelector];
    const key = clean(value) || "unknown";
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});
}

function answerHasContent(value) {
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number" || typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.some(answerHasContent);
  if (value && typeof value === "object") {
    return Object.values(value).some(answerHasContent);
  }
  return false;
}

function assertExactApplicantProjection(
  caseKey,
  applicantIds,
  media,
  documents,
  answers,
  expectedDocumentState,
) {
  const mediaById = new Map(media.map((row) => [row.id, row]));
  invariant(
    mediaById.size === media.length,
    `${caseKey} has duplicate media identities.`,
  );
  const expectedMediaTypes = ["passport_scan", "selfie", "selfie_2"];
  const expectedDocumentTypes = ["passport_scan", "selfie_1", "selfie_2"];
  let canonicalFieldIds;

  for (const applicantId of applicantIds) {
    const applicantMedia = media.filter((row) => row.applicant_id === applicantId);
    const applicantDocuments = documents.filter(
      (row) => row.applicant_id === applicantId,
    );
    const applicantAnswers = answers.filter((row) => row.applicant_id === applicantId);
    invariant(
      exactOneOfEach(applicantMedia, "type", expectedMediaTypes),
      `${caseKey} has an incomplete per-applicant media projection.`,
    );
    invariant(
      exactOneOfEach(applicantDocuments, "type", expectedDocumentTypes),
      `${caseKey} has an incomplete per-applicant document projection.`,
    );
    invariant(
      applicantDocuments.every((document) => {
        const source = mediaById.get(document.source_media_asset_id);
        const expectedType = source?.type === "selfie" ? "selfie_1" : source?.type;
        return (
          source?.applicant_id === applicantId &&
          source.storage_path === document.storage_path &&
          expectedType === document.type &&
          document.upload_status === "uploaded" &&
          document.validation_status === expectedDocumentState.validationStatus &&
          document.export_status === expectedDocumentState.exportStatus
        );
      }),
      `${caseKey} has a mismatched document source projection.`,
    );
    invariant(
      applicantAnswers.length === 77,
      `${caseKey} has the wrong per-applicant answer count.`,
    );
    const answerIdentities = new Set(
      applicantAnswers.map((row) => `${row.section_id}:${row.field_id}`),
    );
    invariant(
      answerIdentities.size === applicantAnswers.length,
      `${caseKey} has duplicate questionnaire answer identities.`,
    );
    const fieldIds = [...new Set(applicantAnswers.map((row) => row.field_id))].sort();
    invariant(
      fieldIds.length === 77,
      `${caseKey} has an incomplete questionnaire field identity set.`,
    );
    if (!canonicalFieldIds) canonicalFieldIds = fieldIds;
    invariant(
      fieldIds.join("\u0000") === canonicalFieldIds.join("\u0000"),
      `${caseKey} applicants do not share the canonical questionnaire field set.`,
    );
  }
}

function exactOneOfEach(rows, key, expectedValues) {
  if (rows.length !== expectedValues.length) return false;
  const counts = countBy(rows, key);
  return expectedValues.every((value) => counts[value] === 1);
}
