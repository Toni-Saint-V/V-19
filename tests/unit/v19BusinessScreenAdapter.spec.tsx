import { describe, expect, test } from "vitest";

import { documentCellsForSubmission } from "../../src/components/v19BusinessScreenAdapter";
import { createDraftSubmission } from "../../src/modules/submissions/submissionActions";

describe("v19BusinessScreenAdapter document media policy", () => {
  test("keeps three primary slots and only a passport slot for secondary family", () => {
    const submission = createDraftSubmission({
      applicantNames: ["IVANOVA MARIA", "IVANOV ANTON"],
      city: "Москва",
      familyCount: 2,
      idScheme: "local",
      submissions: [],
      type: "family",
    });
    const [primary, secondary] = submission.applicants;
    if (!primary || !secondary) throw new Error("Expected family applicants.");

    const cells = documentCellsForSubmission(submission);

    expect(cells.filter((cell) => cell.applicantId === primary.id)).toHaveLength(3);
    expect(
      cells
        .filter((cell) => cell.applicantId === secondary.id)
        .map((cell) => cell.label),
    ).toEqual(["Загран"]);
  });
});
