import { describe, expect, test, vi } from "vitest";

const supabaseMock = vi.hoisted(() => ({
  client: null as null | Record<string, unknown>,
  rpcArgs: null as unknown,
  rpcName: "",
}));

vi.mock("../../src/lib/supabase/client", () => ({
  getSupabaseClient: () => supabaseMock.client,
}));

import { publishReturnedPdfAgentHandoff } from "../../src/modules/submissions/returnedPdfHandoffPersistence";

describe("returned PDF handoff persistence", () => {
  test("returns local null when Supabase is not configured", async () => {
    supabaseMock.client = null;

    await expect(publishReturnedPdfAgentHandoff("VF-1044")).resolves.toBeNull();
  });

  test("publishes handoff through the server-side authorizer RPC", async () => {
    supabaseMock.client = {
      rpc: async (name: string, args: unknown) => {
        supabaseMock.rpcName = name;
        supabaseMock.rpcArgs = args;
        return {
          data: {
            artifactCount: 3,
            submissionId: "VF-1044",
          },
          error: null,
        };
      },
    };

    await expect(publishReturnedPdfAgentHandoff(" VF-1044 ")).resolves.toEqual({
      artifactCount: 3,
      submissionId: "VF-1044",
    });
    expect(supabaseMock.rpcName).toBe("publish_returned_pdf_handoff");
    expect(supabaseMock.rpcArgs).toEqual({
      payload: {
        submissionId: "VF-1044",
      },
    });
  });

  test("wraps denied handoff publishes with safe diagnostics", async () => {
    supabaseMock.client = {
      rpc: async () => ({
        data: null,
        error: {
          code: "42501",
          message: "Only admins can publish returned PDF handoff",
          name: "PostgrestError",
          status: 403,
        },
      }),
    };

    await expect(publishReturnedPdfAgentHandoff("VF-1044")).rejects.toMatchObject({
      diagnostics: {
        kind: "rls",
        operation: "rpc.publish_returned_pdf_handoff",
        safeCode: "rpc.publish_returned_pdf_handoff:rls:42501",
      },
      userMessage:
        "Недостаточно прав для этого действия. Обратитесь к администратору.",
    });
  });
});
