import { describe, expect, test } from "vitest";
import {
  buildReadinessQueue,
  fileLabel,
  targetElementId,
} from "../../src/modules/submissions/workspaceModel";
import { initialSubmissions } from "../../src/modules/submissions/mockData";

describe("operator workspace model", () => {
  test("prioritizes admin blockers and maps them to media targets", () => {
    const submission = initialSubmissions.find((item) => item.id === "ПД-1048");
    if (!submission) throw new Error("expected demo submission");

    const queue = buildReadinessQueue(submission);

    expect(queue[0]?.type).toBe("admin_blocker");
    expect(queue[0]?.target.tab).toBe("media");
    expect(queue[0]?.title).toContain("Мария Иванова");
    expect(targetElementId(queue[0].target)).toContain("workspace-media");
  });

  test("keeps passport and second selfie labels explicit", () => {
    expect(fileLabel("passport_scan")).toBe("Загранпаспорт");
    expect(fileLabel("selfie_2")).toBe("Селфи N2");
  });
});
