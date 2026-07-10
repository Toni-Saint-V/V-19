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
  const { data, error } = await client
    .from("agent_return_package_artifacts")
    .select(
      "id,return_package_id,applicant_id,applicant_name,artifact_kind,storage_bucket,storage_path,file_name,sha256,size_bytes,uploaded_by,uploaded_at",
    )
    .eq("return_package_id", packageId)
    .order("artifact_kind", { ascending: true })
    .order("applicant_id", { ascending: true });

  if (error) {
    throw mapSupabasePersistenceError(error, {
      operation: "agent_return_package_artifacts.list",
      fallbackKind: "database",
    });
  }

  return (data ?? []).map((row) =>
    mapArtifact(row as AgentReturnPackageArtifactRow),
  );
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

  const [sha256, previous] = await Promise.all([
    sha256Hex(input.file),
    existingArtifact({
      applicantId,
      artifactKind: input.artifactKind,
      packageId: input.packageId,
    }),
  ]);
  const identity = returnPackageArtifactIdentity({
    applicantId,
    artifactKind: input.artifactKind,
    packageId: input.packageId,
  });

  const payload = {
    applicant_id: applicantId,
    artifact_kind: input.artifactKind,
    file_name: identity.fileName,
    return_package_id: input.packageId,
    sha256,
    size_bytes: input.file.size,
    storage_bucket: agentReturnPackageBucket,
    storage_path: identity.path,
  };

  const write = previous
    ? client
        .from("agent_return_package_artifacts")
        .update(payload)
        .eq("id", previous.id)
        .select(
          "id,return_package_id,applicant_id,applicant_name,artifact_kind,storage_bucket,storage_path,file_name,sha256,size_bytes,uploaded_by,uploaded_at",
        )
        .single()
    : client
        .from("agent_return_package_artifacts")
        .insert(payload)
        .select(
          "id,return_package_id,applicant_id,applicant_name,artifact_kind,storage_bucket,storage_path,file_name,sha256,size_bytes,uploaded_by,uploaded_at",
        )
        .single();
  const { data, error } = await write;
  if (error || !data) {
    throw mapSupabasePersistenceError(error, {
      operation: "agent_return_package_artifacts.save",
      fallbackKind: "database",
    });
  }

  const persisted = mapArtifact(data as AgentReturnPackageArtifactRow);
  const { error: uploadError } = await client.storage
    .from(agentReturnPackageBucket)
    .upload(identity.path, input.file, {
      contentType: "application/pdf",
      upsert: Boolean(previous),
    });

  if (uploadError) {
    const rollbackErrors: string[] = [];
    if (previous) {
      const { error: rollbackError } = await client
        .from("agent_return_package_artifacts")
        .update({
          applicant_id: previous.applicantId,
          artifact_kind: previous.artifactKind,
          file_name: previous.fileName,
          return_package_id: previous.packageId,
          sha256: previous.sha256,
          size_bytes: previous.sizeBytes,
          storage_bucket: agentReturnPackageBucket,
          storage_path: previous.storagePath,
        })
        .eq("id", previous.id);
      if (rollbackError) {
        rollbackErrors.push(
          `metadata rollback failed: ${rollbackError.message ?? "unknown database error"}`,
        );
      }
    } else {
      const [metadataRollback, storageRollback] = await Promise.all([
        client
          .from("agent_return_package_artifacts")
          .delete()
          .eq("id", persisted.id),
        client.storage.from(agentReturnPackageBucket).remove([identity.path]),
      ]);
      if (metadataRollback.error) {
        rollbackErrors.push(
          `metadata rollback failed: ${metadataRollback.error.message ?? "unknown database error"}`,
        );
      }
      if (storageRollback.error) {
        rollbackErrors.push(
          `storage rollback failed: ${storageRollback.error.message ?? "unknown storage error"}`,
        );
      }
    }

    const uploadFailure = mapSupabasePersistenceError(uploadError, {
      operation: "storage.upload_agent_return_package_artifact",
      fallbackKind: "upload",
    });
    if (rollbackErrors.length) {
      throw new Error(
        `${uploadFailure.message} Manual reconciliation required: ${rollbackErrors.join("; ")}`,
        { cause: uploadFailure },
      );
    }
    throw uploadFailure;
  }

  return persisted;
}

export async function publishAgentReturnPackage(
  packageId: string,
): Promise<AgentReturnPackagePublishResult> {
  const client = requireClient();
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
    .createSignedUrl(artifact.storagePath, 60 * 10);
  if (error || !data?.signedUrl) {
    throw mapSupabasePersistenceError(error, {
      operation: "storage.create_agent_return_package_signed_url",
      fallbackKind: "storage",
    });
  }
  return data.signedUrl;
}
