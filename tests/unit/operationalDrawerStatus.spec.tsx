import { describe, expect, test } from "vitest";
import {
  operationalDrawerCompactStatusLabel,
  operationalDrawerSourceStatus,
} from "../../src/modules/submissions/operationalDrawerStatus";
import { initialSubmissions } from "../../src/modules/submissions/mockData";

describe("operational drawer status copy", () => {
  test("maps the explicit legacy requires_action status to returned semantics", () => {
    const source = initialSubmissions[0];
    if (!source) throw new Error("Expected a submission fixture.");

    const status = operationalDrawerSourceStatus({
      ...source,
      status: "requires_action",
    });

    expect(status).toBe("returned");
    expect(operationalDrawerCompactStatusLabel(status)).toBe("возвращено");
  });

  test("keeps a resubmitted correction package in the corrections review state", () => {
    const source = initialSubmissions[0];
    if (!source) throw new Error("Expected a submission fixture.");

    const status = operationalDrawerSourceStatus({
      ...source,
      status: "corrections_received",
    });

    expect(status).toBe("corrections_received");
    expect(operationalDrawerCompactStatusLabel(status)).toBe("исправления");
  });
});
