import { beforeEach, describe, expect, test, vi } from "vitest";

const supabase = vi.hoisted(() => ({
  createSignedUrl: vi.fn(),
  from: vi.fn(),
  getClient: vi.fn(),
}));

vi.mock("../../src/lib/supabase/client", () => ({
  getSupabaseClient: supabase.getClient,
}));

import {
  agentReturnPackageBucket,
  createAgentReturnPackageDownloadUrl,
  type AgentReturnPackageArtifact,
} from "../../src/modules/submissions/returnPackagePersistence";

const artifact: AgentReturnPackageArtifact = {
  applicantId: "synthetic-applicant",
  applicantName: "CODEX E2E ONE",
  artifactKind: "visa_application_pdf",
  fileName: "CODEX-E2E-returned.pdf",
  id: "synthetic-artifact",
  packageId: "synthetic-package",
  sha256: "a".repeat(64),
  sizeBytes: 128,
  storagePath: "synthetic-agent/CODEX-E2E-returned.pdf",
  uploadedAt: "2026-07-22T00:00:00.000Z",
};

beforeEach(() => {
  vi.clearAllMocks();
  supabase.from.mockReturnValue({ createSignedUrl: supabase.createSignedUrl });
  supabase.getClient.mockReturnValue({ storage: { from: supabase.from } });
});

describe("returned package signed download", () => {
  test("asks Supabase to return an attachment with the canonical file name", async () => {
    supabase.createSignedUrl.mockResolvedValue({
      data: { signedUrl: "https://synthetic.supabase.test/signed-pdf" },
      error: null,
    });

    await expect(createAgentReturnPackageDownloadUrl(artifact)).resolves.toBe(
      "https://synthetic.supabase.test/signed-pdf",
    );
    expect(supabase.from).toHaveBeenCalledWith(agentReturnPackageBucket);
    expect(supabase.createSignedUrl).toHaveBeenCalledWith(
      artifact.storagePath,
      60 * 10,
      { download: artifact.fileName },
    );
  });
});
