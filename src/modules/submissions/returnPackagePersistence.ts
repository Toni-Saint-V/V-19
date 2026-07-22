import { getSupabaseClient } from "../../lib/supabase/client";
import type {
  AgentReturnPackageArtifactKind,
  AgentReturnPackageArtifactRow,
  AgentReturnPackagePublishResult,
  AgentReturnPackageRow,
  AgentReturnPackageStartResult,
  ExportBatchMemberRow,
  ExportBatchRow,
} from "../../lib/supabase/database.types";
import { mapSupabasePersistenceError } from "../../services/persistenceObservability";

export const agentReturnPackageBucket = "agent-return-packages" as const;
const supabasePageSize = 1000;

export type AgentReturnPackage = {
  agentId: string;
  city: string;
  createdAt: string;
  exportBatchId: string;
  id: string;
  publishedAt: string | null;
  status: "draft" | "published";
};

export type AgentReturnPackageArtifact = {
  applicantId: string | null;
  applicantName: string | null;
  artifactKind: AgentReturnPackageArtifactKind;
  fileName: string;
  id: string;
  packageId: string;
  sha256: string;
  sizeBytes: number;
  storagePath: string;
  uploadedAt: string;
};

export type AgentReturnPackageWithArtifacts = AgentReturnPackage & {
  artifacts: AgentReturnPackageArtifact[];
};

export type AdminReturnPackageApplicant = {
  applicantId: string;
  applicantName: string;
  applicantOrder: number;
  familySubmissionId: string | null;
  submissionId: string;
  submissionOrder: number;
  submissionTitle: string;
  submissionType: "single" | "family";
};

export type AdminReturnPackageGroup = {
  agentId: string;
  agentName: string;
  applicants: AdminReturnPackageApplicant[];
  city: string;
  exportBatchId: string;
  exportPackageKey: string;
  submissionCount: number;
};

type PreparedReturnPackageArtifactUpload = {
  fileName: string;
  operationId: string;
  status: "prepared" | "finalized" | "aborted";
  storageBucket: typeof agentReturnPackageBucket;
  storagePath: string;
};

type FinalizedReturnPackageArtifactUpload = {
  artifact: AgentReturnPackageArtifactRow;
  duplicate: boolean;
  operationId: string;
  previousStoragePath: string | null;
};

function mapPackage(row: AgentReturnPackageRow): AgentReturnPackage {
  return {
    agentId: row.agent_id,
    city: row.city,
    createdAt: row.created_at,
    exportBatchId: row.export_batch_id,
    id: row.id,
    publishedAt: row.published_at,
    status: row.status,
  };
}

function mapArtifact(
  row: AgentReturnPackageArtifactRow,
): AgentReturnPackageArtifact {
  return {
    applicantId: row.applicant_id,
    applicantName: row.applicant_name,
    artifactKind: row.artifact_kind,
    fileName: row.file_name,
    id: row.id,
    packageId: row.return_package_id,
    sha256: row.sha256,
    sizeBytes: row.size_bytes,
    storagePath: row.storage_path,
    uploadedAt: row.uploaded_at,
  };
}

function requireClient() {
  const client = getSupabaseClient();
  if (!client) {
    throw new Error("Supabase недоступен: возвратные документы нельзя сохранить локально.");
  }
  return client;
}

async function assertPdf(file: File) {
  if (file.type !== "application/pdf" || !file.name.toLowerCase().endsWith(".pdf")) {
    throw new Error("Нужен PDF-файл.");
  }
  if (file.size <= 0 || file.size > 50 * 1024 * 1024) {
    throw new Error("Размер PDF должен быть от 1 байта до 50 МБ.");
  }
  const header = new TextDecoder().decode(
    await file.slice(0, 5).arrayBuffer(),
  );
  if (header !== "%PDF-") {
    throw new Error("Файл не содержит сигнатуру PDF.");
  }
}

function assertStorageSegment(value: string, label: string) {
  if (!/^[\p{L}\p{N}_.-]+$/u.test(value)) {
    throw new Error(`${label} содержит недопустимые символы.`);
  }
}

async function sha256Hex(file: File): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await file.arrayBuffer());
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export function returnPackageArtifactIdentity(input: {
  applicantId?: string | null;
  artifactKind: AgentReturnPackageArtifactKind;
  packageId: string;
}) {
  assertStorageSegment(input.packageId, "Идентификатор пакета");

  if (input.artifactKind === "agent_list_pdf") {
    const fileName = "agent_list.pdf";
    return {
      fileName,
      path: `return-packages/${input.packageId}/list/${fileName}`,
    };
  }

  const applicantId = input.applicantId?.trim() ?? "";
  assertStorageSegment(applicantId, "Идентификатор туриста");
  const fileName = "visa_application.pdf";
  return {
    fileName,
    path: `return-packages/${input.packageId}/applicants/${applicantId}/${fileName}`,
  };
}

export async function startAgentReturnPackage(input: {
  agentId: string;
  exportPackageKey: string;
}): Promise<AgentReturnPackageStartResult> {
  const client = requireClient();
  const { data, error } = await client.rpc("start_agent_return_package", {
    payload: {
      agentId: input.agentId,
      exportPackageKey: input.exportPackageKey,
    },
  });

  if (error || !data) {
    throw mapSupabasePersistenceError(error, {
      operation: "rpc.start_agent_return_package",
      fallbackKind: "rpc",
    });
  }

  return data;
}

export function adminReturnPackageGroupKey(group: AdminReturnPackageGroup): string {
  return [group.exportBatchId, group.agentId].join("\u0000");
}

export async function listAdminReturnPackageGroups(): Promise<
  AdminReturnPackageGroup[]
> {
  const client = requireClient();
  const memberRows: ExportBatchMemberRow[] = [];
  for (let from = 0; ; from += supabasePageSize) {
    const { data, error } = await client
      .from("export_batch_members")
      .select(
        "export_batch_id,submission_id,applicant_id,source_agent_id,source_agent_display_name,city,submission_type,family_submission_id,submission_title,applicant_name,submission_order,applicant_order,created_at",
      )
      .order("export_batch_id", { ascending: true })
      .order("applicant_order", { ascending: true })
      .order("applicant_id", { ascending: true })
      .range(from, from + supabasePageSize - 1);
    if (error) {
      throw mapSupabasePersistenceError(error, {
        operation: "export_batch_members.list",
        fallbackKind: "database",
      });
    }
    memberRows.push(...((data ?? []) as ExportBatchMemberRow[]));
    if ((data ?? []).length < supabasePageSize) break;
  }

  const batchRows: Pick<ExportBatchRow, "id" | "idempotency_key">[] = [];
  for (let from = 0; ; from += supabasePageSize) {
    const { data, error } = await client
      .from("export_batches")
      .select("id,idempotency_key")
      .order("id", { ascending: true })
      .range(from, from + supabasePageSize - 1);
    if (error) {
      throw mapSupabasePersistenceError(error, {
        operation: "export_batches.list",
        fallbackKind: "database",
      });
    }
    batchRows.push(
      ...((data ?? []) as Pick<ExportBatchRow, "id" | "idempotency_key">[]),
    );
    if ((data ?? []).length < supabasePageSize) break;
  }

  const batchKeys = new Map(
    batchRows
      .map((batch) => [batch.id, batch.idempotency_key?.trim() ?? ""] as const),
  );
  const groups = new Map<
    string,
    AdminReturnPackageGroup & { submissionIds: Set<string> }
  >();

  for (const member of memberRows) {
    const exportPackageKey = batchKeys.get(member.export_batch_id);
    if (!exportPackageKey) {
      throw new Error("У выгруженного пакета нет неизменяемого идентификатора.");
    }

    const key = [member.export_batch_id, member.source_agent_id].join("\u0000");
    const current = groups.get(key) ?? {
      agentId: member.source_agent_id,
      agentName: member.source_agent_display_name,
      applicants: [],
      city: member.city,
      exportBatchId: member.export_batch_id,
      exportPackageKey,
      submissionCount: 0,
      submissionIds: new Set<string>(),
    };

    current.submissionIds.add(member.submission_id);
    current.applicants.push({
      applicantId: member.applicant_id,
      applicantName: member.applicant_name,
      applicantOrder: member.applicant_order,
      familySubmissionId: member.family_submission_id,
      submissionId: member.submission_id,
      submissionOrder: member.submission_order,
      submissionTitle: member.submission_title,
      submissionType: member.submission_type,
    });
    groups.set(key, current);
  }

  return [...groups.values()]
    .map(({ submissionIds, ...group }) => ({
      ...group,
      applicants: group.applicants.sort(
        (left, right) =>
          left.submissionOrder - right.submissionOrder ||
          left.applicantOrder - right.applicantOrder ||
          left.applicantId.localeCompare(right.applicantId),
      ),
      submissionCount: submissionIds.size,
    }))
    .sort(
      (left, right) =>
        left.city.localeCompare(right.city, "ru") ||
        left.agentName.localeCompare(right.agentName, "ru") ||
        left.exportPackageKey.localeCompare(right.exportPackageKey),
    );
}

export async function listReturnPackageArtifacts(
  packageId: string,
): Promise<AgentReturnPackageArtifact[]> {
  const client = requireClient();
  const rows: AgentReturnPackageArtifactRow[] = [];
  for (let from = 0; ; from += supabasePageSize) {
    const { data, error } = await client
      .from("agent_return_package_artifacts")
      .select(
        "id,return_package_id,applicant_id,applicant_name,artifact_kind,storage_bucket,storage_path,file_name,sha256,size_bytes,uploaded_by,uploaded_at",
      )
      .eq("return_package_id", packageId)
      .order("artifact_kind", { ascending: true })
      .order("applicant_id", { ascending: true })
      .order("id", { ascending: true })
      .range(from, from + supabasePageSize - 1);

    if (error) {
      throw mapSupabasePersistenceError(error, {
        operation: "agent_return_package_artifacts.list",
        fallbackKind: "database",
      });
    }
    rows.push(...((data ?? []) as AgentReturnPackageArtifactRow[]));
    if ((data ?? []).length < supabasePageSize) break;
  }

  return rows.map(mapArtifact);
}

async function existingArtifact(input: {
  applicantId: string | null;
  artifactKind: AgentReturnPackageArtifactKind;
  packageId: string;
}): Promise<AgentReturnPackageArtifact | null> {
  const client = requireClient();
  let query = client
    .from("agent_return_package_artifacts")
    .select(
      "id,return_package_id,applicant_id,applicant_name,artifact_kind,storage_bucket,storage_path,file_name,sha256,size_bytes,uploaded_by,uploaded_at",
    )
    .eq("return_package_id", input.packageId)
    .eq("artifact_kind", input.artifactKind);
  query = input.applicantId
    ? query.eq("applicant_id", input.applicantId)
    : query.is("applicant_id", null);

  const { data, error } = await query.maybeSingle();
  if (error) {
    throw mapSupabasePersistenceError(error, {
      operation: "agent_return_package_artifacts.read_slot",
      fallbackKind: "database",
    });
  }

  return data ? mapArtifact(data as AgentReturnPackageArtifactRow) : null;
}

function errorRecord(error: unknown): Record<string, unknown> {
  return error && typeof error === "object"
    ? (error as Record<string, unknown>)
    : {};
}

function isReturnPackageUploadConflict(error: unknown): boolean {
  const record = errorRecord(error);
  const message = typeof record.message === "string" ? record.message : "";
  return (
    record.code === "40001" ||
    message.includes("V19_RETURN_PACKAGE_UPLOAD_CONFLICT")
  );
}

function isDefinitiveRpcRejection(error: unknown): boolean {
  const record = errorRecord(error);
  const status =
    typeof record.status === "number"
      ? record.status
      : typeof record.statusCode === "number"
        ? record.statusCode
        : null;
  if (status !== null && status >= 400 && status < 500) return true;
  return typeof record.code === "string" && /^[0-9A-Z]{5}$/.test(record.code);
}

function uploadReconciliationError(message: string, cause: unknown): Error {
  return new Error(`${message} Manual reconciliation required.`, {
    cause: cause instanceof Error ? cause : undefined,
  });
}

function assertPreparedUpload(
  data: unknown,
  operationId: string,
): PreparedReturnPackageArtifactUpload | null {
  if (!data || typeof data !== "object") return null;
  const result = data as Partial<PreparedReturnPackageArtifactUpload>;
  if (
    result.operationId !== operationId ||
    result.storageBucket !== agentReturnPackageBucket ||
    typeof result.storagePath !== "string" ||
    !result.storagePath.startsWith("return-package-upload-intents/") ||
    (result.fileName !== "agent_list.pdf" &&
      result.fileName !== "visa_application.pdf") ||
    result.status !== "prepared"
  ) {
    return null;
  }
  return result as PreparedReturnPackageArtifactUpload;
}

function assertFinalizedUpload(
  data: unknown,
  operationId: string,
): FinalizedReturnPackageArtifactUpload | null {
  if (!data || typeof data !== "object") return null;
  const result = data as Partial<FinalizedReturnPackageArtifactUpload>;
  const artifact = result.artifact as Partial<AgentReturnPackageArtifactRow> | undefined;
  if (
    result.operationId !== operationId ||
    typeof result.duplicate !== "boolean" ||
    (result.previousStoragePath !== null &&
      typeof result.previousStoragePath !== "string") ||
    !artifact ||
    typeof artifact.id !== "string" ||
    typeof artifact.storage_path !== "string" ||
    typeof artifact.sha256 !== "string" ||
    typeof artifact.size_bytes !== "number"
  ) {
    return null;
  }
  return result as FinalizedReturnPackageArtifactUpload;
}

async function cleanupOrphanUploadPaths(input: {
  packageId: string;
  requiredPath?: string | null;
}): Promise<void> {
  if (!input.requiredPath) return;
  const client = requireClient();
  const packagePrefix = `return-packages/${input.packageId}/`;
  const intentPrefix = `return-package-upload-intents/${input.packageId}/`;
  if (
    !input.requiredPath.startsWith(packagePrefix) &&
    !input.requiredPath.startsWith(intentPrefix)
  ) {
    throw uploadReconciliationError(
      "Supabase returned an unsafe return-package cleanup path.",
      new Error("Return-package cleanup path is outside the package scope."),
    );
  }
  const cleanup = await client.storage
    .from(agentReturnPackageBucket)
    .remove([input.requiredPath]);
  if (cleanup.error) {
    throw uploadReconciliationError(
      "A replaced return-package PDF is still pending storage cleanup.",
      cleanup.error,
    );
  }
}

export async function uploadAgentReturnPackageArtifact(input: {
  applicantId?: string | null;
  artifactKind: AgentReturnPackageArtifactKind;
  file: File;
  packageId: string;
}): Promise<AgentReturnPackageArtifact> {
  await assertPdf(input.file);
  const client = requireClient();
  const applicantId = input.applicantId?.trim() || null;
  if (input.artifactKind === "visa_application_pdf" && !applicantId) {
    throw new Error("Для готовой анкеты нужен конкретный турист.");
  }
  if (input.artifactKind === "agent_list_pdf" && applicantId) {
    throw new Error("PDF-список прикрепляется к пакету агента, а не к туристу.");
  }

  const sha256 = await sha256Hex(input.file);
  const operationId = crypto.randomUUID();
  let prepared: PreparedReturnPackageArtifactUpload | null = null;
  let prepareError: unknown = null;
  for (let attempt = 0; attempt < 2 && !prepared; attempt += 1) {
    const response = await client.rpc(
      "prepare_agent_return_package_artifact_upload",
      {
        payload: {
          applicantId,
          artifactKind: input.artifactKind,
          operationId,
          returnPackageId: input.packageId,
          sha256,
          sizeBytes: input.file.size,
        },
      },
    );
    prepared = assertPreparedUpload(response.data, operationId);
    prepareError = response.error ??
      (prepared ? null : new Error("Invalid return-package upload intent receipt."));
  }
  if (prepareError || !prepared) {
    throw mapSupabasePersistenceError(
      prepareError,
      {
        operation: "rpc.prepare_agent_return_package_artifact_upload",
        fallbackKind: "rpc",
      },
    );
  }

  const { error: uploadError } = await client.storage
    .from(agentReturnPackageBucket)
    .upload(prepared.storagePath, input.file, {
      contentType: "application/pdf",
      upsert: false,
    });

  let finalized: FinalizedReturnPackageArtifactUpload | null = null;
  let finalizeError: unknown = null;
  for (let attempt = 0; attempt < 2 && !finalized; attempt += 1) {
    const response = await client.rpc(
      "finalize_agent_return_package_artifact_upload",
      { p_operation_id: operationId },
    );
    finalized = assertFinalizedUpload(response.data, operationId);
    finalizeError = response.error ??
      (finalized ? null : new Error("Invalid return-package finalize receipt."));
  }

  const finishCommittedUpload = async (
    receipt: FinalizedReturnPackageArtifactUpload,
  ): Promise<AgentReturnPackageArtifact> => {
    const persisted = mapArtifact(receipt.artifact);
    if (
      persisted.storagePath !== prepared.storagePath ||
      persisted.sha256 !== sha256 ||
      persisted.sizeBytes !== input.file.size
    ) {
      throw uploadReconciliationError(
        "Supabase committed an unexpected return-package artifact receipt.",
        finalizeError,
      );
    }
    const previousStoragePath = receipt.previousStoragePath;
    await cleanupOrphanUploadPaths({
      packageId: input.packageId,
      requiredPath:
        previousStoragePath && previousStoragePath !== persisted.storagePath
          ? previousStoragePath
          : null,
    });
    return persisted;
  };

  if (finalized) return finishCommittedUpload(finalized);

  let reconciled: AgentReturnPackageArtifact | null;
  try {
    reconciled = await existingArtifact({
      applicantId,
      artifactKind: input.artifactKind,
      packageId: input.packageId,
    });
  } catch (reconciliationFailure) {
    throw uploadReconciliationError(
      "The upload outcome could not be reconciled; the prepared object was preserved.",
      reconciliationFailure,
    );
  }

  if (
    reconciled?.storagePath === prepared.storagePath &&
    reconciled.sha256 === sha256 &&
    reconciled.sizeBytes === input.file.size
  ) {
    throw uploadReconciliationError(
      "The PDF is committed, but its idempotency receipt could not be recovered; the committed object was preserved.",
      finalizeError,
    );
  }

  if (!isDefinitiveRpcRejection(finalizeError)) {
    throw uploadReconciliationError(
      "The finalize outcome is uncertain; the prepared object was preserved.",
      finalizeError,
    );
  }

  const cleanup = await client.storage
    .from(agentReturnPackageBucket)
    .remove([prepared.storagePath]);
  if (cleanup.error) {
    throw uploadReconciliationError(
      "The upload was rejected, but its prepared storage object could not be removed.",
      cleanup.error,
    );
  }
  const abort = await client.rpc(
    "abort_agent_return_package_artifact_upload",
    { p_operation_id: operationId },
  );
  if (abort.error) {
    throw uploadReconciliationError(
      "The rejected upload object was removed, but its intent could not be aborted.",
      abort.error,
    );
  }

  if (isReturnPackageUploadConflict(finalizeError)) {
    throw new Error(
      "Этот PDF уже изменён в другой административной сессии. Обновите пакет и повторите загрузку.",
      { cause: finalizeError instanceof Error ? finalizeError : undefined },
    );
  }
  throw mapSupabasePersistenceError(uploadError ?? finalizeError, {
    operation: uploadError
      ? "storage.upload_agent_return_package_artifact"
      : "rpc.finalize_agent_return_package_artifact_upload",
    fallbackKind: uploadError ? "upload" : "rpc",
  });
}

export async function publishAgentReturnPackage(
  packageId: string,
): Promise<AgentReturnPackagePublishResult> {
  const client = requireClient();
  await cleanupOrphanUploadPaths({ packageId });
  const { data, error } = await client.rpc("publish_agent_return_package", {
    payload: { returnPackageId: packageId },
  });

  if (error || !data) {
    throw mapSupabasePersistenceError(error, {
      operation: "rpc.publish_agent_return_package",
      fallbackKind: "rpc",
    });
  }

  return data;
}

export async function listPublishedAgentReturnPackages(): Promise<
  AgentReturnPackageWithArtifacts[]
> {
  const client = requireClient();
  const packageRows: AgentReturnPackageRow[] = [];
  for (let from = 0; ; from += supabasePageSize) {
    const { data, error } = await client
      .from("agent_return_packages")
      .select(
        "id,export_batch_id,agent_id,city,status,created_by,created_at,published_by,published_at",
      )
      .eq("status", "published")
      .order("published_at", { ascending: false })
      .range(from, from + supabasePageSize - 1);
    if (error) {
      throw mapSupabasePersistenceError(error, {
        operation: "agent_return_packages.list_published",
        fallbackKind: "database",
      });
    }
    packageRows.push(...((data ?? []) as AgentReturnPackageRow[]));
    if ((data ?? []).length < supabasePageSize) break;
  }

  const packages = packageRows.map((row) => mapPackage(row));
  if (!packages.length) return [];

  const ids = packages.map((item) => item.id);
  const artifactRows: AgentReturnPackageArtifactRow[] = [];
  for (let offset = 0; offset < ids.length; offset += 100) {
    const packageIds = ids.slice(offset, offset + 100);
    for (let from = 0; ; from += supabasePageSize) {
      const { data, error } = await client
        .from("agent_return_package_artifacts")
        .select(
          "id,return_package_id,applicant_id,applicant_name,artifact_kind,storage_bucket,storage_path,file_name,sha256,size_bytes,uploaded_by,uploaded_at",
        )
        .in("return_package_id", packageIds)
        .order("return_package_id", { ascending: true })
        .order("artifact_kind", { ascending: true })
        .order("applicant_id", { ascending: true })
        .range(from, from + supabasePageSize - 1);
      if (error) {
        throw mapSupabasePersistenceError(error, {
          operation: "agent_return_package_artifacts.list_published",
          fallbackKind: "database",
        });
      }
      artifactRows.push(...((data ?? []) as AgentReturnPackageArtifactRow[]));
      if ((data ?? []).length < supabasePageSize) break;
    }
  }

  const artifactsByPackage = new Map<string, AgentReturnPackageArtifact[]>();
  for (const row of artifactRows) {
    const artifact = mapArtifact(row);
    const current = artifactsByPackage.get(artifact.packageId) ?? [];
    current.push(artifact);
    artifactsByPackage.set(artifact.packageId, current);
  }

  return packages.map((item) => ({
    ...item,
    artifacts: artifactsByPackage.get(item.id) ?? [],
  }));
}

export async function createAgentReturnPackageDownloadUrl(
  artifact: AgentReturnPackageArtifact,
): Promise<string> {
  const client = requireClient();
  const { data, error } = await client.storage
    .from(agentReturnPackageBucket)
    .createSignedUrl(artifact.storagePath, 60 * 10, {
      download: artifact.fileName,
    });
  if (error || !data?.signedUrl) {
    throw mapSupabasePersistenceError(error, {
      operation: "storage.create_agent_return_package_signed_url",
      fallbackKind: "storage",
    });
  }
  return data.signedUrl;
}
