import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, test, vi } from "vitest";
import { DocumentRepository } from "../../src/modules/documents/documentRepository";
import type { VisaFlowSupabaseClient } from "../../src/lib/supabase/client";

function readyDocumentsClient(result: { data: unknown[]; error: unknown }) {
  const query = {
    eq: vi.fn(),
    in: vi.fn(),
    order: vi.fn(),
    select: vi.fn(),
  };
  query.select.mockReturnValue(query);
  query.in.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  query.order
    .mockReturnValueOnce(query)
    .mockReturnValueOnce(query)
    .mockResolvedValueOnce(result);
  const client = {
    from: vi.fn(() => query),
  } as unknown as VisaFlowSupabaseClient;
  return { client, eq: query.eq, inFilter: query.in, order: query.order, select: query.select };
}

describe("DocumentRepository export boundary", () => {
  test("reads only exact ready document assets for export preparation", async () => {
    const { client, eq, inFilter, order, select } = readyDocumentsClient({
      data: [],
      error: null,
    });

    await expect(
      new DocumentRepository(client).getReadyForExport(["submission-1"]),
    ).resolves.toEqual([]);

    expect(select).toHaveBeenCalledTimes(1);
    expect(inFilter).toHaveBeenCalledWith("submission_id", ["submission-1"]);
    expect(eq).toHaveBeenCalledWith("upload_status", "uploaded");
    expect(eq).toHaveBeenCalledWith("validation_status", "passed");
    expect(eq).toHaveBeenCalledWith("export_status", "ready");
    expect(order).toHaveBeenCalledWith("submission_id", { ascending: true });
  });

  test("does not retain direct audit or terminal asset write APIs", () => {
    const source = readFileSync(
      resolve(process.cwd(), "src/modules/documents/documentRepository.ts"),
      "utf8",
    );

    expect(source).not.toContain("recordExportAudit");
    expect(source).not.toContain("markExported");
    expect(source).not.toContain("restoreReadyForExport");
    expect(source).not.toContain("document_export_events");
    expect(source).not.toContain(".update({ export_status");
  });
});
