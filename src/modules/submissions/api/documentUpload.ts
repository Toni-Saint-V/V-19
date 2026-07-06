import { getSupabaseClient } from "../../../lib/supabase/client";
import { mapSupabasePersistenceError } from "../../../services/persistenceObservability";
import {
  buildSubmissionDocumentIdentity,
  submissionFilesBucket,
  validateSubmissionDocumentFile,
  type SubmissionDocumentType,
} from "../documentUploadContract";
import type { Applicant } from "../types";

export type UploadSubmissionDocumentInput = {
  applicant: Applicant;
  documentType: SubmissionDocumentType;
  file: File;
  submissionId: string;
  uploadedBy: string;
};

export type UploadedSubmissionDocument = {
  documentType: SubmissionDocumentType;
  fileName: string;
  filePath: string;
  mimeType: string;
  normalizedPassportNumber: string;
  originalFileName: string;
  sizeBytes: number;
};

export async function uploadSubmissionDocument(
  input: UploadSubmissionDocumentInput,
): Promise<UploadedSubmissionDocument | null> {
  const validation = validateSubmissionDocumentFile(input.file, input.documentType);
  if (!validation.ok) {
    throw new Error(validation.safeMessage);
  }

  const identity = buildSubmissionDocumentIdentity({
    applicant: input.applicant,
    documentType: input.documentType,
    extension: validation.extension,
    submissionId: input.submissionId,
  });
  if (!identity.ok) {
    throw new Error(identity.safeMessage);
  }

  const client = getSupabaseClient();
  if (!client) return null;

  const uploaded = await client.storage
    .from(submissionFilesBucket)
    .upload(identity.filePath, input.file, {
      contentType: input.file.type,
      upsert: true,
    });

  if (uploaded.error) {
    throw mapSupabasePersistenceError(uploaded.error, {
      operation: "storage.upload_media",
      fallbackKind: "upload",
    });
  }

  const metadata = {
    applicant_id: input.applicant.id,
    document_type: input.documentType,
    file_name: identity.fileName,
    file_path: uploaded.data.path,
    mime_type: input.file.type,
    original_file_name: input.file.name,
    passport_number: identity.normalizedPassportNumber,
    size_bytes: input.file.size,
    status: "uploaded",
    submission_id: input.submissionId,
    uploaded_by: input.uploadedBy,
  } as const;

  const upserted = await client
    .from("submission_files")
    .upsert(metadata, { onConflict: "applicant_id,document_type" })
    .select("id")
    .single();

  if (upserted.error) {
    throw mapSupabasePersistenceError(upserted.error, {
      operation: "submission_files.upsert",
      fallbackKind: "database",
    });
  }

  return {
    documentType: input.documentType,
    fileName: identity.fileName,
    filePath: uploaded.data.path,
    mimeType: input.file.type,
    normalizedPassportNumber: identity.normalizedPassportNumber,
    originalFileName: input.file.name,
    sizeBytes: input.file.size,
  };
}
