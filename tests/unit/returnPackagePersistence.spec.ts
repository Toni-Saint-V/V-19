import { describe, expect, it } from "vitest";
import { returnPackageArtifactIdentity } from "../../src/modules/submissions/returnPackagePersistence";

describe("return package storage identity", () => {
  it("uses the canonical list path", () => {
    expect(
      returnPackageArtifactIdentity({
        artifactKind: "agent_list_pdf",
        packageId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toEqual({
      fileName: "agent_list.pdf",
      path: "return-packages/11111111-1111-4111-8111-111111111111/list/agent_list.pdf",
    });
  });

  it("uses the canonical applicant path and rejects a missing applicant", () => {
    expect(
      returnPackageArtifactIdentity({
        applicantId: "applicant-1",
        artifactKind: "visa_application_pdf",
        packageId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toEqual({
      fileName: "visa_application.pdf",
      path: "return-packages/11111111-1111-4111-8111-111111111111/applicants/applicant-1/visa_application.pdf",
    });

    expect(() =>
      returnPackageArtifactIdentity({
        artifactKind: "visa_application_pdf",
        packageId: "11111111-1111-4111-8111-111111111111",
      }),
    ).toThrow("Идентификатор туриста");
  });
});
