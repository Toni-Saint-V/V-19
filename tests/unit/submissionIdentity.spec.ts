import { describe, expect, it } from "vitest";

import {
  submissionPublicId,
  submissionPublicNumber,
} from "../../src/modules/submissions/submissionIdentity";

describe("submission public identity", () => {
  it("prefers the database-issued global number", () => {
    const submission = {
      id: "VF-1060-long-internal-token",
      publicNumber: 2048,
    };

    expect(submissionPublicNumber(submission)).toBe(2048);
    expect(submissionPublicId(submission)).toBe("VF-2048");
  });

  it("keeps legacy numeric ids readable before the migration is applied", () => {
    expect(
      submissionPublicId({ id: "VF-1060-mrn9iuax-1-0hvx9nd" }),
    ).toBe("VF-1060");
    expect(submissionPublicId({ id: "ПД-1056" })).toBe("VF-1056");
  });

  it("treats explicit null as unassigned instead of parsing the technical id", () => {
    expect(
      submissionPublicNumber({
        id: "VF-1060-mrn9iuax-1-0hvx9nd",
        publicNumber: null,
      }),
    ).toBeNull();
    expect(
      submissionPublicId({
        id: "VF-1060-mrn9iuax-1-0hvx9nd",
        publicNumber: null,
      }),
    ).toBe("VF-—");
  });

  it("does not invent an order number for a technical id", () => {
    expect(
      submissionPublicId({ id: "VF-PROD-WORKFLOW-20260717122436" }),
    ).toBe("VF-—");
  });
});
