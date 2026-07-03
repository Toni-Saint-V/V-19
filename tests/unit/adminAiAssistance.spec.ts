import { describe, expect, test } from "vitest";
import {
  buildAdminAiContext,
  buildAdminIssueDraftContext,
  nextActionCopy,
  unavailableAdminAiState,
} from "../../src/modules/submissions/adminAiAssistance";
import { initialSubmissions } from "../../src/modules/submissions/mockData";

function submission() {
  const found = initialSubmissions.find((item) => item.id === "ПД-1053");
  if (!found) throw new Error("Expected admin review fixture.");
  return found;
}

describe("admin AI assistance contract", () => {
  test("builds a sanitized admin context without applicant PII or raw issue text", () => {
    const source = submission();
    const context = buildAdminAiContext(source, "review");
    const serialized = JSON.stringify(context);

    expect(context).toMatchObject({
      feature: "review",
      status: source.status,
      type: source.type,
      countryCode: "ES",
      applicantCount: source.applicants.length,
    });
    expect(serialized).not.toContain(source.applicants[0]?.fullName);
    const applicantEmail = (source.applicants[0] as { email?: string } | undefined)
      ?.email;
    if (applicantEmail) expect(serialized).not.toContain(applicantEmail);
    expect(serialized).not.toContain(source.issues[0]?.reason);
    expect(serialized).not.toContain(source.issues[0]?.comment);
    expect(serialized).not.toContain("storagePath");
  });

  test("builds draft remark context as recommendation-only state", () => {
    const context = buildAdminIssueDraftContext({
      field: "Маршрут",
      reason: "Нужно уточнить маршрут",
      sectionLabel: "Анкета",
      submission: submission(),
      targetType: "questionnaire",
    });

    expect(context).toMatchObject({
      feature: "issueDraft",
      draftBasis: {
        code: "questionnaire_incomplete",
        severity: "blocking",
        status: "open",
      },
    });
    expect(context).not.toHaveProperty("action");
    expect(context).not.toHaveProperty("autoSend");
  });

  test("next action copy keeps admin as decision maker when AI is unavailable", () => {
    expect(nextActionCopy(unavailableAdminAiState(), "Принять")).toContain(
      "ручная проверка администратором",
    );
    expect(nextActionCopy(unavailableAdminAiState(), "Принять")).toContain(
      "локальный AI не настроен",
    );
  });
});
