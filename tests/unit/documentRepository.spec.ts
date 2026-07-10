import { describe, expect, test, vi } from "vitest";
import { DocumentRepository } from "../../src/modules/documents/documentRepository";
import type { VisaFlowSupabaseClient } from "../../src/lib/supabase/client";

function repositoryClient(existingEvents: Array<{ id: string }>) {
  const query = {
    eq: vi.fn().mockReturnThis(),
    limit: vi.fn().mockResolvedValue({ data: existingEvents, error: null }),
    order: vi.fn().mockReturnThis(),
    select: vi.fn().mockReturnThis(),
  };
  const insert = vi.fn().mockResolvedValue({ data: null, error: null });

  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({
        data: { user: { id: "admin-1" } },
        error: null,
      }),
    },
    from: vi.fn(() => ({ ...query, insert })),
  } as unknown as VisaFlowSupabaseClient;

  return { client, insert, query };
}

const auditInput = {
  documentAssetIds: ["asset-1"],
  fileCount: 1,
  fileName: "export.zip",
  packageId: "package-1",
  submissionIds: ["submission-1"],
};

describe("DocumentRepository export audit", () => {
  test("does not duplicate an audit event for a retried package", async () => {
    const { client, insert, query } = repositoryClient([{ id: "event-1" }]);

    await new DocumentRepository(client).recordExportAudit(auditInput);

    expect(query.eq).toHaveBeenCalledWith("package_identity_key", "package-1");
    expect(insert).not.toHaveBeenCalled();
  });

  test("records a new audit event when the package has not been seen", async () => {
    const { client, insert } = repositoryClient([]);

    await new DocumentRepository(client).recordExportAudit(auditInput);

    expect(insert).toHaveBeenCalledWith(
      expect.objectContaining({
        event_type: "DOCUMENT_EXPORT_CREATED",
        package_identity_key: "package-1",
        created_by: "admin-1",
      }),
    );
  });
});
