import { describe, expect, test } from "vitest";
import {
  activeMediaFileTypes,
  buildReadinessQueue,
  fileLabel,
  sectionNavigationTarget,
  targetElementId,
} from "../../src/modules/submissions/workspaceModel";
import { initialSubmissions } from "../../src/modules/submissions/mockData";

describe("operator workspace model", () => {
  test("prioritizes admin blockers and maps them to media targets", () => {
    const submission = initialSubmissions.find((item) => item.id === "ПД-1048");
    if (!submission) throw new Error("expected demo submission");

    const queue = buildReadinessQueue(submission);

    expect(queue[0]?.type).toBe("admin_blocker");
    expect(queue[0]?.target.tab).toBe("files");
    expect(queue[0]?.title).toContain("Мария Иванова");
    expect(targetElementId(queue[0].target)).toContain("workspace-media");
  });

  test("keeps passport and second selfie labels explicit", () => {
    expect(activeMediaFileTypes).toEqual(["passport_scan", "selfie", "selfie_2"]);
    expect(fileLabel("passport_scan")).toBe("Загранпаспорт");
    expect(fileLabel("selfie")).toBe("Селфи");
    expect(fileLabel("selfie_2")).toBe("Селфи N2");
  });

  test("opens section navigation on the applicant that actually has work", () => {
    const submission = initialSubmissions.find((item) => item.id === "ПД-1048");
    if (!submission) throw new Error("expected demo submission");
    const targetApplicant = submission.applicants.at(1);
    if (!targetApplicant) throw new Error("expected second applicant");
    const targetSection = targetApplicant.sections[0];

    const adjusted = {
      ...submission,
      applicants: submission.applicants.map((applicant, index) => ({
        ...applicant,
        sections: applicant.sections.map((section) => ({
          ...section,
          status:
            section.title === targetSection.title && index === 1
              ? ("partial" as const)
              : ("complete" as const),
        })),
      })),
      issues: [],
    };

    expect(sectionNavigationTarget(adjusted, targetSection.title)).toEqual({
      applicantId: targetApplicant.id,
      section: targetSection.title,
      tab: "questionnaire",
    });
  });
});
